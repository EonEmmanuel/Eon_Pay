# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci

COPY server server
RUN npm run build --workspace=server

FROM node:24-bookworm-slim AS production-dependencies

WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --omit=dev --workspace=server --include-workspace-root && npm cache clean --force

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV PORT=3001

WORKDIR /app

COPY --from=production-dependencies --chown=node:node /app /app
COPY --from=build --chown=node:node /app/server/dist /app/server/dist

WORKDIR /app/server
USER node

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3001/api/v1/health/live').then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1));"]

CMD ["node", "dist/main.js"]

