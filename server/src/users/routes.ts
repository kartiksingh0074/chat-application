import { Router } from 'express';
import { z } from 'zod';
import { ilike, ne, and } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';
import { requireAuth, type AuthedRequest } from '../auth/middleware.js';

export const usersRouter = Router();

const searchSchema = z.object({
  q: z.string().max(64).default(''),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// Used to pick people when creating a room or starting a DM. Excludes the
// caller, since neither flow can target yourself.
usersRouter.get('/', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = searchSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ code: 'invalid_query', message: parsed.error.message });
    return;
  }
  const { q, limit } = parsed.data;

  const results = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(
      q.length > 0
        ? and(ne(users.id, req.userId!), ilike(users.username, `%${q}%`))
        : ne(users.id, req.userId!),
    )
    .limit(limit);

  res.json({ users: results });
});
