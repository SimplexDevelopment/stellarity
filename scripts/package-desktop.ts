/**
 * Stellarity Desktop Packaging Script
 *
 * Builds native installers for distribution. Auto-detects the host OS
 * and only builds targets that are supported on the current platform:
 *
 *   Host OS   │ Targets built
 *   ──────────┼──────────────────────────────────────────
 *   Windows   │ NSIS installer + Portable .exe
 *   macOS     │ DMG + AppImage + .deb  (all three)
 *   Linux     │ AppImage + .deb
 *
 * macOS can cross-compile for Linux but NOT Windows.
 * Windows and Linux cannot cross-compile for macOS.
 * electron-builder enforces these constraints.
 *
 * All distributable artifacts are collected into the top-level dist/ folder
 * so they can be uploaded to the website.
 *
 * Usage:
 *   bun run scripts/package-desktop.ts <module> [flags]
 *
 *   module:     "client" | "admin" | "all"  (all = both client + admin)
 *
 * Flags:
 *   --win       Build Windows targets only  (must be on Windows)
 *   --mac       Build macOS targets only    (must be on macOS)
 *   --linux     Build Linux targets only    (must be on macOS or Linux)
 *   --dir       Unpack only, no installer   (debugging)
 *
 *   When no platform flag is given, all SUPPORTED targets for the current
 *   host OS are built automatically.
 *
 * Examples:
 *   bun run scripts/package-desktop.ts all           # build everything possible
 *   bun run scripts/package-desktop.ts client         # client, all possible platforms
 *   bun run scripts/package-desktop.ts client --win   # client, Windows only
 *   bun run scripts/package-desktop.ts all --dir      # unpack both, no installers
 */

import { $ } from 'bun';
import { resolve, join } from 'path';
import { existsSync, mkdirSync, cpSync, readdirSync } from 'fs';

// ---------------------------------------------------------------------------
// Host platform detection
// ---------------------------------------------------------------------------

type HostPlatform = 'win32' | 'darwin' | 'linux';
const host = process.platform as HostPlatform;

// ---------------------------------------------------------------------------
// Windows winCodeSign cache fix
//
// electron-builder downloads winCodeSign-2.6.0.7z which contains macOS
// symlinks. 7-Zip fails to create them without admin/Developer Mode,
// causing the entire build to abort even though those files are never
// used on Windows.
//
// Fix: pre-extract the archive ourselves, tolerating the symlink errors
// (exit code 1 = warnings, 2 = non-fatal errors like missing symlinks).
// ---------------------------------------------------------------------------

async function ensureWinCodeSignCache(): Promise<void> {
  if (host !== 'win32') return;

  const cacheDir = join(
    process.env.LOCALAPPDATA || join(process.env.USERPROFILE || '', 'AppData', 'Local'),
    'electron-builder',
    'Cache',
    'winCodeSign',
  );

  // If a valid extraction already exists, skip
  const marker = join(cacheDir, 'winCodeSign-2.6.0');
  if (existsSync(marker)) return;

  console.log('  Preparing winCodeSign cache (first-time setup) …');

  const archiveUrl =
    'https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-2.6.0/winCodeSign-2.6.0.7z';
  const archivePath = join(cacheDir, 'winCodeSign-2.6.0.7z');
  const extractDir = join(cacheDir, 'winCodeSign-2.6.0');

  mkdirSync(cacheDir, { recursive: true });

  // Download if not already cached
  if (!existsSync(archivePath)) {
    const res = await fetch(archiveUrl);
    if (!res.ok) {
      console.warn(`  ⚠  Failed to download winCodeSign: ${res.status}`);
      return;
    }
    await Bun.write(archivePath, res);
  }

  // Find 7za.exe bundled by electron-builder
  const rootDir = resolve(import.meta.dir, '..');
  const sevenZip = join(
    rootDir,
    'node_modules',
    '.bun',
    '7zip-bin@5.2.0',
    'node_modules',
    '7zip-bin',
    'win',
    'x64',
    '7za.exe',
  );

  if (!existsSync(sevenZip)) {
    // Fallback — try the non-.bun path
    const fallback = join(rootDir, 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe');
    if (!existsSync(fallback)) {
      console.warn('  ⚠  Could not find 7za.exe — skipping cache pre-extraction');
      return;
    }
  }

  const exe = existsSync(sevenZip)
    ? sevenZip
    : join(rootDir, 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe');

  mkdirSync(extractDir, { recursive: true });

  // Extract, tolerating exit codes 1 (warnings) and 2 (non-fatal errors like symlinks)
  const proc = Bun.spawn([exe, 'x', '-y', '-bd', archivePath, `-o${extractDir}`], {
    stdout: 'ignore',
    stderr: 'ignore',
  });
  const exitCode = await proc.exited;

  if (exitCode <= 2) {
    console.log('  winCodeSign cache ready.\n');
  } else {
    console.warn(`  ⚠  7-Zip exited with code ${exitCode} — build may still work.\n`);
  }
}

/** What each host OS can compile for. */
const SUPPORTED_TARGETS: Record<HostPlatform, Set<string>> = {
  win32: new Set(['win']),
  darwin: new Set(['mac', 'linux']),
  linux: new Set(['linux']),
};

const supported = SUPPORTED_TARGETS[host] ?? new Set<string>();

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const moduleName = args.find((a) => !a.startsWith('--'));

const flagWin = args.includes('--win');
const flagMac = args.includes('--mac');
const flagLinux = args.includes('--linux');
const flagDir = args.includes('--dir');

const VALID_MODULES = new Set(['client', 'admin', 'all']);

if (!moduleName || !VALID_MODULES.has(moduleName)) {
  console.error(
    '\n  Usage: bun run scripts/package-desktop.ts <client|admin|all> [--win] [--mac] [--linux] [--dir]\n',
  );
  process.exit(1);
}

const modules =
  moduleName === 'all' ? ['client', 'admin'] : [moduleName];

// ---------------------------------------------------------------------------
// Build target resolution — only include what the host can actually build
// ---------------------------------------------------------------------------

interface TargetGroup {
  flag: string;
  label: string;
  args: string[];
}

const ALL_TARGETS: TargetGroup[] = [
  { flag: 'win', label: 'Windows (NSIS + Portable)', args: ['--win', 'nsis', 'portable'] },
  { flag: 'mac', label: 'macOS (DMG)', args: ['--mac', 'dmg'] },
  { flag: 'linux', label: 'Linux (AppImage + deb)', args: ['--linux', 'AppImage', 'deb'] },
];

function resolveTargets(): TargetGroup[] {
  // If user explicitly requested specific platforms, filter to those
  const explicit = [
    ...(flagWin ? ['win'] : []),
    ...(flagMac ? ['mac'] : []),
    ...(flagLinux ? ['linux'] : []),
  ];

  const requested =
    explicit.length > 0
      ? ALL_TARGETS.filter((t) => explicit.includes(t.flag))
      : ALL_TARGETS; // no flag = build all

  const viable: TargetGroup[] = [];
  const skipped: string[] = [];

  for (const target of requested) {
    if (supported.has(target.flag)) {
      viable.push(target);
    } else {
      skipped.push(target.label);
    }
  }

  if (skipped.length > 0) {
    console.log(`  ⚠  Skipping unsupported targets on ${host}:`);
    for (const s of skipped) {
      console.log(`     • ${s}`);
    }
    console.log(`     (cross-compilation is not supported by electron-builder)\n`);
  }

  return viable;
}

function getBuilderArgs(targets: TargetGroup[]): string[] {
  if (flagDir) return ['--dir'];
  return targets.flatMap((t) => t.args);
}

function getPlatformLabel(targets: TargetGroup[]): string {
  if (flagDir) return 'unpacked directory';
  return targets.map((t) => t.label).join(', ');
}

// ---------------------------------------------------------------------------
// Collect all artifacts into a top-level dist/ folder
// ---------------------------------------------------------------------------

const ROOT_DIST = resolve(import.meta.dir, '..', 'dist');

function collectArtifacts(moduleDir: string, mod: string): void {
  const releaseDir = resolve(moduleDir, 'release');
  if (!existsSync(releaseDir)) return;

  const destDir = resolve(ROOT_DIST, mod);
  mkdirSync(destDir, { recursive: true });

  const distributables = readdirSync(releaseDir).filter((f) => {
    const lower = f.toLowerCase();
    return (
      lower.endsWith('.exe') ||
      lower.endsWith('.dmg') ||
      lower.endsWith('.appimage') ||
      lower.endsWith('.deb') ||
      lower.endsWith('.zip') ||
      lower.endsWith('.yml') ||
      lower.endsWith('.yaml') ||
      lower.endsWith('.blockmap')
    );
  });

  for (const file of distributables) {
    cpSync(resolve(releaseDir, file), resolve(destDir, file));
  }

  if (distributables.length > 0) {
    console.log(`         Collected ${distributables.length} artifact(s) → dist/${mod}/`);
  }
}

// ---------------------------------------------------------------------------
// Build & Package
// ---------------------------------------------------------------------------

const targets = resolveTargets();

if (targets.length === 0 && !flagDir) {
  console.error(
    `\n  ✖  No buildable targets for this host OS (${host}).` +
      '\n     Windows can build: win' +
      '\n     macOS can build:   mac, linux' +
      '\n     Linux can build:   linux\n',
  );
  process.exit(1);
}

const builderArgs = getBuilderArgs(targets);
const label = getPlatformLabel(targets);

console.log('\n  ╔══════════════════════════════════════════════════╗');
console.log('  ║        Stellarity — Desktop Packaging           ║');
console.log('  ╚══════════════════════════════════════════════════╝\n');
console.log(`  Host OS  : ${host}`);
console.log(`  Modules  : ${modules.join(', ')}`);
console.log(`  Targets  : ${label}`);
console.log(`  Args     : electron-builder ${builderArgs.join(' ')}`);
console.log(`  Output   : ${ROOT_DIST}\n`);

mkdirSync(ROOT_DIST, { recursive: true });

// Pre-extract winCodeSign cache on Windows to avoid symlink errors
await ensureWinCodeSignCache();

const totalSteps = modules.length * 2;
let step = 0;

for (const mod of modules) {
  const moduleDir = resolve(import.meta.dir, '..', 'modules', mod);

  // Step — Vite build
  step++;
  console.log(`  [${step}/${totalSteps}] Building ${mod} with electron-vite …`);
  await $`cd ${moduleDir} && bunx electron-vite build`.quiet();
  console.log(`  [${step}/${totalSteps}] Build complete.\n`);

  // Step — electron-builder
  // Disable code signing auto-discovery — no certificate is configured,
  // and the winCodeSign download fails on Windows without symlink privileges.
  step++;
  console.log(`  [${step}/${totalSteps}] Packaging ${mod} with electron-builder …`);
  await $`cd ${moduleDir} && bunx electron-builder ${builderArgs}`.env({
    ...process.env,
    CSC_IDENTITY_AUTO_DISCOVERY: 'false',
  });

  // Collect distributable files
  collectArtifacts(moduleDir, mod);
  console.log();
}

console.log('  ──────────────────────────────────────────────────');
console.log(`  All done — distributable artifacts are in: ${ROOT_DIST}`);
console.log('  ──────────────────────────────────────────────────\n');
