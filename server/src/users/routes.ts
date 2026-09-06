import { Router } from 'express';
import { z } from 'zod';
import { ilike, ne, and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';
import { requireAuth, type AuthedRequest } from '../auth/middleware.js';

export const usersRouter = Router();

const searchSchema = z.object({
  q: z.string().max(64).default(''),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// Used to pick people when creating a room or starting a DM, and by the
// "Find people" surface. Excludes the caller, since neither flow can target
// yourself.
usersRouter.get('/', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = searchSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ code: 'invalid_query', message: parsed.error.message });
    return;
  }
  const { q, limit } = parsed.data;

  const results = await db
    .select({ id: users.id, username: users.username, avatarKey: users.avatarKey })
    .from(users)
    .where(
      q.length > 0
        ? and(ne(users.id, req.userId!), ilike(users.username, `%${q}%`))
        : ne(users.id, req.userId!),
    )
    .limit(limit);

  res.json({ users: results });
});

const updateMeSchema = z.object({
  // Null clears the avatar and falls back to generated initials.
  avatarKey: z.string().min(1).max(512).nullable(),
});

usersRouter.patch('/me', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = updateMeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ code: 'invalid_payload', message: parsed.error.message });
    return;
  }
  const { avatarKey } = parsed.data;

  // The presign route hands out keys under `avatars/<caller id>/`, so
  // requiring that prefix stops one user pointing their avatar at another
  // user's object - or at a room attachment they are no longer able to see.
  if (avatarKey !== null && !avatarKey.startsWith(`avatars/${req.userId!}/`)) {
    res.status(400).json({ code: 'invalid_key', message: 'That is not one of your uploads' });
    return;
  }

  await db.update(users).set({ avatarKey }).where(eq(users.id, req.userId!));
  res.json({ user: { id: req.userId!, username: req.username!, avatarKey } });
});

// Profile shown in the popout card. Any signed-in user can read it: usernames
// are already visible through search and room membership.
usersRouter.get('/:id', requireAuth, async (req: AuthedRequest, res) => {
  const id = req.params.id;
  if (typeof id !== 'string' || id.length === 0) {
    res.status(400).json({ code: 'invalid_id', message: 'Missing user id' });
    return;
  }

  const user = await db.query.users.findFirst({ where: eq(users.id, id) });
  if (!user) {
    res.status(404).json({ code: 'not_found', message: 'User not found' });
    return;
  }

  res.json({
    user: {
      id: user.id,
      username: user.username,
      avatarKey: user.avatarKey,
      createdAt: user.createdAt,
    },
  });
});
