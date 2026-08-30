import { describe, expect, it, beforeAll } from 'vitest';

beforeAll(() => {
  process.env.DATABASE_URL ??= 'postgres://chatapp:chatapp@localhost:5432/chatapp';
  process.env.REDIS_URL ??= 'redis://localhost:6379';
  process.env.JWT_SECRET ??= 'test-secret';
  process.env.CORS_ORIGIN ??= 'http://localhost:5173';
});

describe('jwt', () => {
  it('round-trips a signed payload', async () => {
    const { signToken, verifyToken } = await import('../src/auth/jwt.js');
    const token = signToken({ userId: 'u1', username: 'alice' });
    const payload = verifyToken(token);
    expect(payload.userId).toBe('u1');
    expect(payload.username).toBe('alice');
  });

  it('rejects a tampered token', async () => {
    const { signToken, verifyToken } = await import('../src/auth/jwt.js');
    const token = signToken({ userId: 'u1', username: 'alice' });
    expect(() => verifyToken(token + 'tampered')).toThrow();
  });
});

describe('credentials validation', () => {
  it('rejects a password shorter than 8 characters', async () => {
    const { z } = await import('zod');
    const schema = z.object({ username: z.string().min(3).max(32), password: z.string().min(8).max(200) });
    const result = schema.safeParse({ username: 'alice', password: 'short' });
    expect(result.success).toBe(false);
  });
});
