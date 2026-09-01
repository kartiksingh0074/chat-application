import { Router } from 'express';
import { z } from 'zod';
import { ulid } from 'ulidx';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { roomMembers } from '../db/schema.js';
import { requireAuth, type AuthedRequest } from '../auth/middleware.js';
import { minioClient } from '../storage/minioClient.js';
import { env } from '../config/env.js';
import { logger } from '../logger.js';

export const uploadsRouter = Router();

const PRESIGN_EXPIRY_SECONDS = 300;

const presignSchema = z.object({
  roomId: z.string().min(1),
  contentType: z.string().min(1).max(255),
});

uploadsRouter.post('/presign', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = presignSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ code: 'invalid_payload', message: parsed.error.message });
    return;
  }
  const { roomId } = parsed.data;

  const membership = await db.query.roomMembers.findFirst({
    where: and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, req.userId!)),
  });
  if (!membership) {
    res.status(403).json({ code: 'not_a_member', message: 'You are not a member of this room' });
    return;
  }

  // Key is server-generated: never trust a client-supplied filename as an
  // object key. ULID keeps it unique and chronologically sortable.
  const key = `${roomId}/${ulid()}`;
  try {
    const url = await minioClient.presignedPutObject(env.MINIO_BUCKET, key, PRESIGN_EXPIRY_SECONDS);
    res.json({ url, key });
  } catch (err) {
    // Express 4 doesn't catch async handler rejections - without this the
    // whole process would go down on a storage hiccup.
    logger.error({ err, roomId }, 'failed to presign upload URL');
    res.status(500).json({ code: 'presign_failed', message: 'Could not prepare the upload' });
  }
});
