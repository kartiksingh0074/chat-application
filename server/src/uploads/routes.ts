import { Router } from 'express';
import { z } from 'zod';
import { ulid } from 'ulidx';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { roomMembers } from '../db/schema.js';
import {
  extensionForType,
  isBlockedAttachmentType,
  sanitizeFilename,
} from '@chat-application/shared';
import { requireAuth, type AuthedRequest } from '../auth/middleware.js';
import { minioClient } from '../storage/minioClient.js';
import { env } from '../config/env.js';
import { logger } from '../logger.js';

export const uploadsRouter = Router();

const PRESIGN_EXPIRY_SECONDS = 300;

const presignSchema = z.object({
  roomId: z.string().min(1),
  contentType: z.string().min(1).max(255),
  filename: z.string().max(255).optional(),
});

uploadsRouter.post('/presign', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = presignSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ code: 'invalid_payload', message: parsed.error.message });
    return;
  }
  const { roomId, contentType, filename } = parsed.data;

  // MinIO serves objects from its own origin, so a stored HTML or SVG file
  // would be a script-hosting endpoint. Refuse those outright; every other
  // type is inert when fetched.
  if (isBlockedAttachmentType(contentType)) {
    res.status(415).json({ code: 'unsupported_type', message: 'That file type is not allowed' });
    return;
  }

  const membership = await db.query.roomMembers.findFirst({
    where: and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, req.userId!)),
  });
  if (!membership) {
    res.status(403).json({ code: 'not_a_member', message: 'You are not a member of this room' });
    return;
  }

  // Key is server-generated: never trust a client-supplied filename as an
  // object key. ULID keeps it unique and chronologically sortable. The stem is
  // a sanitised version of the original name, purely so a file card has
  // something readable to show, and the extension comes from the validated
  // content type - `messages` has no content-type column, so the suffix is how
  // the client knows whether to render an image or a file card.
  const stem = filename ? sanitizeFilename(filename) : '';
  const key = `${roomId}/${ulid()}${stem ? `-${stem}` : ''}${extensionForType(contentType)}`;
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
