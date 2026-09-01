// Defaults to nginx's load-balanced entrypoint (docker-compose maps it to
// :8080), since that's the topology Phase 5 onward actually runs and tests.
// Override via VITE_API_BASE_URL to point at a single local `npm run dev
// -w server` instance (localhost:4000) for fast iteration when horizontal-
// scaling behavior specifically isn't what's being worked on.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080';

// MinIO is reached directly by the browser, not through nginx: attachment
// bytes go straight from the browser to object storage and never traverse
// the Node processes.
export const MINIO_PUBLIC_URL = import.meta.env.VITE_MINIO_PUBLIC_URL ?? 'http://localhost:9000';
export const MINIO_BUCKET = import.meta.env.VITE_MINIO_BUCKET ?? 'attachments';

export const attachmentUrl = (key: string) => `${MINIO_PUBLIC_URL}/${MINIO_BUCKET}/${key}`;
