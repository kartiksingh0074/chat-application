import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(1),
  JWT_EXPIRES_IN: z.string().default('15m'),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().min(1),
  NODE_ID: z.string().default('local'),
  // Must be the endpoint the *browser* can reach: it gets baked into the
  // presigned URL, which the browser (not this process) then PUTs to.
  MINIO_ENDPOINT: z.string().default('localhost'),
  MINIO_PORT: z.coerce.number().int().positive().default(9000),
  // NOT z.coerce.boolean(): that's JS Boolean() semantics, so the string
  // "false" would coerce to true and the client would attempt TLS.
  MINIO_USE_SSL: z
    .string()
    .default('false')
    .transform((v) => v.toLowerCase() === 'true'),
  MINIO_ACCESS_KEY: z.string().min(1),
  MINIO_SECRET_KEY: z.string().min(1),
  MINIO_BUCKET: z.string().default('attachments'),
  // Pinning the region keeps presigning fully offline. Without it the SDK
  // first does a GetBucketLocation round-trip, which fails from inside a
  // container where MINIO_ENDPOINT (the browser-facing host) isn't routable.
  MINIO_REGION: z.string().default('us-east-1'),
});

export const env = envSchema.parse(process.env);

/** Allowed browser origins, for both CORS and the WS-upgrade whitelist. */
export const allowedOrigins = env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean);
