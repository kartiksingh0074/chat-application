// Defaults to nginx's load-balanced entrypoint (docker-compose maps it to
// :8080), since that's the topology Phase 5 onward actually runs and tests.
// Override via VITE_API_BASE_URL to point at a single local `npm run dev
// -w server` instance (localhost:4000) for fast iteration when horizontal-
// scaling behavior specifically isn't what's being worked on.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080';
