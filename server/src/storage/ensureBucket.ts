import { minioClient } from './minioClient.js';
import { env } from '../config/env.js';
import { logger } from '../logger.js';

// Run once (npm run storage:init), like db:migrate - not on app boot.
async function main() {
  const exists = await minioClient.bucketExists(env.MINIO_BUCKET);
  if (!exists) {
    await minioClient.makeBucket(env.MINIO_BUCKET);
    logger.info({ bucket: env.MINIO_BUCKET }, 'bucket created');
  }

  // Public read so the client can <img src> an attachment directly.
  // Uploads stay private - those require a presigned PUT.
  await minioClient.setBucketPolicy(
    env.MINIO_BUCKET,
    JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: { AWS: ['*'] },
          Action: ['s3:GetObject'],
          Resource: [`arn:aws:s3:::${env.MINIO_BUCKET}/*`],
        },
      ],
    }),
  );

  logger.info({ bucket: env.MINIO_BUCKET }, 'storage ready');
}

main().catch((err) => {
  logger.error({ err }, 'storage init failed');
  process.exit(1);
});
