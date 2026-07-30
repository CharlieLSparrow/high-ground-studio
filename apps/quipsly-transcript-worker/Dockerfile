# syntax=docker/dockerfile:1

FROM node:22-slim@sha256:f32b81066cde10a75dbac96646099533316d94bac4150c55da1636e1f0ffdc46 AS base

ARG PNPM_VERSION=10.30.3
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
WORKDIR /app

RUN corepack enable \
  && corepack prepare "pnpm@${PNPM_VERSION}" --activate

FROM base AS builder

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/quipsly-transcript-worker/package.json ./apps/quipsly-transcript-worker/package.json
COPY packages/quipsly-media-processing/package.json ./packages/quipsly-media-processing/package.json

RUN pnpm install \
  --filter quipsly-transcript-worker... \
  --frozen-lockfile \
  --ignore-scripts

COPY apps/quipsly-transcript-worker ./apps/quipsly-transcript-worker
COPY packages/quipsly-media-processing ./packages/quipsly-media-processing

RUN pnpm --filter quipsly-transcript-worker build \
  && pnpm --config.inject-workspace-packages=true \
    --filter quipsly-transcript-worker deploy --prod /worker

FROM node:22-slim@sha256:f32b81066cde10a75dbac96646099533316d94bac4150c55da1636e1f0ffdc46 AS runner

ENV NODE_ENV=production
WORKDIR /worker

RUN groupadd --system --gid 1001 nodejs \
  && useradd \
    --uid 1001 \
    --gid nodejs \
    --no-create-home \
    --shell /usr/sbin/nologin \
    worker

COPY --from=builder --chown=worker:nodejs /worker ./

USER worker
CMD ["node", "dist/index.js"]
