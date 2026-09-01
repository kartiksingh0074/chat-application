FROM node:20-slim
WORKDIR /app

# Copy every workspace's manifest first so npm can resolve the workspace
# tree, then install before copying source - keeps the dependency layer
# cached across source-only changes.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN npm ci

COPY packages/shared packages/shared
COPY server server

EXPOSE 4000

# Default: the app server. The worker service overrides this command
# (see docker-compose.yml) to run the same image as a queue consumer
# instead, sharing one build rather than maintaining two Dockerfiles.
CMD ["npx", "tsx", "server/src/index.ts"]
