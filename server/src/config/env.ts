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
  // 'queue' is the real Phase 4+ behaviour. 'sync' restores the Phase 1
  // hot-path write so experiment 2 can measure both under the same load.
  PERSIST_MODE: z.enum(['queue', 'sync']).default('queue'),
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

  // --- Phase 8 (RAG) ---
  // Optional so the app still boots without it: everything except embedding
  // and generation works, and the keyword arm is fully functional. The bot
  // routes check for it and fail with a clear message rather than at boot.
  GROQ_API_KEY: z.string().min(1).optional(),
  GROQ_BASE_URL: z.string().url().default('https://api.groq.com/openai/v1'),
  GROQ_CHAT_MODEL: z.string().default('llama-3.3-70b-versatile'),
  GROQ_EMBED_MODEL: z.string().default('nomic-embed-text-v1_5'),
  // 8.5 requires all three modes to be implemented and selectable, so 8.8 can
  // measure each against the same corpus.
  RETRIEVAL_MODE: z.enum(['keyword', 'vector', 'hybrid']).default('hybrid'),
  // 8.4: the embed worker batches up to this many messages per API call.
  EMBED_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(100),
});

export const env = envSchema.parse(process.env);

/** Allowed browser origins, for both CORS and the WS-upgrade whitelist. */
export const allowedOrigins = env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean);
