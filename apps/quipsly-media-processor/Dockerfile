# syntax=docker/dockerfile:1

FROM node:22-slim AS base

ARG PNPM_VERSION=10.30.3
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
WORKDIR /app

RUN corepack enable \
  && corepack prepare "pnpm@${PNPM_VERSION}" --activate

FROM base AS builder

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/quipsly-media-processor/package.json ./apps/quipsly-media-processor/package.json
COPY packages/quipsly-media-processing/package.json ./packages/quipsly-media-processing/package.json

RUN pnpm install \
  --filter quipsly-media-processor... \
  --frozen-lockfile \
  --ignore-scripts

COPY apps/quipsly-media-processor ./apps/quipsly-media-processor
COPY packages/quipsly-media-processing ./packages/quipsly-media-processing

RUN pnpm --filter quipsly-media-processor build \
  && pnpm --config.inject-workspace-packages=true \
    --filter quipsly-media-processor deploy --prod /worker

FROM node:22-slim AS runner

ENV NODE_ENV=production
WORKDIR /worker

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends ca-certificates ffmpeg \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs worker

COPY --from=builder --chown=worker:nodejs /worker ./

USER worker
CMD ["node", "dist/index.js"]
