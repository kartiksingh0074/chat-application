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
  // Groq is used for generation only (8.6). Optional so everything else - schema,
  // retrieval, embedding and the 8.8 evaluation - works without a key; the bot
  // route reports its absence plainly instead of failing at boot.
  // A blank `GROQ_API_KEY=` line reads as unset rather than failing min(1) and
  // taking the whole server down at boot.
  GROQ_API_KEY: z.preprocess((v) => (v === '' ? undefined : v), z.string().min(1).optional()),
  GROQ_BASE_URL: z.string().url().default('https://api.groq.com/openai/v1'),
  GROQ_CHAT_MODEL: z.string().default('openai/gpt-oss-120b'),
  // Embeddings run locally (see rag/embeddings.ts). Groq's catalogue lists no
  // embedding model, and PROJECT.md 2 names bge-small-en via transformers.js as
  // the alternative. Changing this means changing EMBEDDING_DIMENSIONS too.
  EMBED_MODEL: z.string().default('Xenova/bge-small-en-v1.5'),
  // 8.5 requires all three modes implemented and selectable, so 8.8 can
  // measure each against the same corpus.
  RETRIEVAL_MODE: z.enum(['keyword', 'vector', 'hybrid']).default('hybrid'),
  // Batch size drives peak activation memory on CPU. 32 keeps the embedding
  // process near 300 MB; 100 buys little throughput for noticeably more.
  EMBED_BATCH_SIZE: z.coerce.number().int().min(1).max(128).default(32),
});

export const env = envSchema.parse(process.env);

/** Allowed browser origins, for both CORS and the WS-upgrade whitelist. */
export const allowedOrigins = env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean);
