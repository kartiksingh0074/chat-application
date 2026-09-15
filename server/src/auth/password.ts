import argon2 from 'argon2';

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password);
}

/**
 * False for a wrong password *and* for a stored value that is not an argon2
 * hash at all. argon2 throws on the latter, which would turn a login attempt
 * against the bot account - deliberately stored with an unusable hash - into a
 * 500 instead of an ordinary "invalid credentials".
 */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}
