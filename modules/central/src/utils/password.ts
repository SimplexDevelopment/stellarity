/**
 * Password hashing using Bun.password built-in Argon2id support.
 *
 * Bun.password produces standard PHC-format hashes ($argon2id$v=19$m=...)
 * that are compatible with hashes produced by the old `argon2` npm package.
 */

const ARGON2_OPTIONS = {
  algorithm: 'argon2id' as const,
  memoryCost: 65536, // 64 MB (Bun calls this memoryCost, same as before)
  timeCost: 3,
};

export async function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await Bun.password.verify(password, hash);
  } catch {
    return false;
  }
}

/**
 * Check if a hash needs to be re-hashed with current parameters.
 *
 * Parses the PHC-format string ($argon2id$v=19$m=65536,t=3,p=4$...) and
 * compares the encoded parameters against our current ARGON2_OPTIONS.
 */
export function needsRehash(hash: string): boolean {
  try {
    // PHC format: $argon2id$v=19$m=65536,t=3,p=4$salt$hash
    const parts = hash.split('$');
    if (parts.length < 4 || parts[1] !== 'argon2id') return true;

    const params = parts[3]; // e.g. "m=65536,t=3,p=4"
    const paramMap = Object.fromEntries(
      params.split(',').map((p) => {
        const [k, v] = p.split('=');
        return [k, parseInt(v, 10)];
      }),
    );

    return (
      paramMap.m !== ARGON2_OPTIONS.memoryCost ||
      paramMap.t !== ARGON2_OPTIONS.timeCost
    );
  } catch {
    return true;
  }
}
