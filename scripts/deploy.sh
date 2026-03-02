#!/usr/bin/env bash
#
# Stellarity — Server Deploy Script
#
# Pulls latest code, installs dependencies, runs migrations,
# rebuilds, and restarts services. Designed to be invoked by
# GitHub Actions over SSH or manually.
#
# Usage:
#   ./scripts/deploy.sh              # deploy everything
#   ./scripts/deploy.sh central      # deploy central only
#   ./scripts/deploy.sh instance     # deploy instance only
#
set -euo pipefail

DEPLOY_DIR="/opt/stellarity"
LOG_FILE="/var/log/stellarity-deploy.log"

# ── Helpers ──────────────────────────────────────────────────────

timestamp() { date '+%Y-%m-%d %H:%M:%S'; }

log() {
  echo "[$(timestamp)] $*" | tee -a "$LOG_FILE"
}

die() {
  log "FATAL: $*"
  exit 1
}

# ── Parse target ─────────────────────────────────────────────────

TARGET="${1:-all}"  # all | central | instance

case "$TARGET" in
  all|central|instance) ;;
  *) die "Unknown target: $TARGET (expected: all, central, instance)" ;;
esac

log "═══════════════════════════════════════════════════"
log "Starting deploy — target: $TARGET"
log "═══════════════════════════════════════════════════"

cd "$DEPLOY_DIR" || die "Deploy directory $DEPLOY_DIR does not exist"

# ── Pull latest code ─────────────────────────────────────────────

log "Pulling latest changes from origin..."
git fetch origin main --prune
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" = "$REMOTE" ] && [ "${FORCE_DEPLOY:-}" != "true" ]; then
  log "Already up to date ($LOCAL). Skipping. Set FORCE_DEPLOY=true to override."
  exit 0
fi

git reset --hard origin/main
NEW_HASH=$(git rev-parse --short HEAD)
log "Updated to $NEW_HASH"

# ── Install dependencies ────────────────────────────────────────

log "Installing dependencies..."
bun install --frozen-lockfile 2>/dev/null || bun install
log "Dependencies installed"

# ── Build shared module (always needed) ──────────────────────────

log "Building shared module..."
bun run build:shared
log "Shared module built"

# ── Deploy Central ───────────────────────────────────────────────

deploy_central() {
  log "Building central..."
  bun run build:central
  log "Central built"

  log "Running central migrations..."
  cd "$DEPLOY_DIR/modules/central"
  bun run src/database/migrate.ts 2>&1 | tee -a "$LOG_FILE" || log "WARN: Migration may have failed"
  cd "$DEPLOY_DIR"

  log "Restarting stellarity-central service..."
  sudo systemctl restart stellarity-central
  
  # Wait a moment and verify it's running
  sleep 3
  if systemctl is-active --quiet stellarity-central; then
    log "✓ stellarity-central is running"
  else
    log "✗ stellarity-central failed to start!"
    journalctl -u stellarity-central --no-pager -n 20 | tee -a "$LOG_FILE"
    return 1
  fi
}

# ── Deploy Instance ──────────────────────────────────────────────

deploy_instance() {
  log "Building instance + panel..."
  bun run build:instance
  log "Instance built"

  log "Restarting stellarity-instance service..."
  sudo systemctl restart stellarity-instance

  # Wait a moment and verify it's running
  sleep 3
  if systemctl is-active --quiet stellarity-instance; then
    log "✓ stellarity-instance is running"
  else
    log "✗ stellarity-instance failed to start!"
    journalctl -u stellarity-instance --no-pager -n 20 | tee -a "$LOG_FILE"
    return 1
  fi
}

# ── Execute ──────────────────────────────────────────────────────

case "$TARGET" in
  central)
    deploy_central
    ;;
  instance)
    deploy_instance
    ;;
  all)
    deploy_central
    deploy_instance
    ;;
esac

log "═══════════════════════════════════════════════════"
log "Deploy complete — $TARGET @ $NEW_HASH"
log "═══════════════════════════════════════════════════"
