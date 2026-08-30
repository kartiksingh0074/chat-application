import { Router } from 'express';
import { z } from 'zod';
import { ulid } from 'ulidx';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';
import { hashPassword, verifyPassword } from './password.js';
import { signToken } from './jwt.js';

export const authRouter = Router();

const credentialsSchema = z.object({
  username: z.string().min(3).max(32),
  password: z.string().min(8).max(200),
});

authRouter.post('/register', async (req, res) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ code: 'invalid_payload', message: parsed.error.message });
    return;
  }
  const { username, password } = parsed.data;

  const existing = await db.query.users.findFirst({ where: eq(users.username, username) });
  if (existing) {
    res.status(409).json({ code: 'username_taken', message: 'Username is already taken' });
    return;
  }

  const passwordHash = await hashPassword(password);
  const id = ulid();
  await db.insert(users).values({ id, username, passwordHash });

  const token = signToken({ userId: id, username });
  res.status(201).json({ token, user: { id, username } });
});

authRouter.post('/login', async (req, res) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ code: 'invalid_payload', message: parsed.error.message });
    return;
  }
  const { username, password } = parsed.data;

  const user = await db.query.users.findFirst({ where: eq(users.username, username) });
  if (!user || !(await verifyPassword(user.passwordHash, password))) {
    res.status(401).json({ code: 'invalid_credentials', message: 'Invalid username or password' });
    return;
  }

  const token = signToken({ userId: user.id, username: user.username });
  res.status(200).json({ token, user: { id: user.id, username: user.username } });
});
