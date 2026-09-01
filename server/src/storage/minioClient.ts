import { Client } from 'minio';
import { env } from '../config/env.js';

// Generating a presigned URL is offline crypto - no network call to MinIO -
// so this client works from inside a container even though the endpoint it
// signs for (the browser-facing one) isn't reachable from in there.
export const minioClient = new Client({
  endPoint: env.MINIO_ENDPOINT,
  port: env.MINIO_PORT,
  useSSL: env.MINIO_USE_SSL,
  accessKey: env.MINIO_ACCESS_KEY,
  secretKey: env.MINIO_SECRET_KEY,
  region: env.MINIO_REGION,
});
