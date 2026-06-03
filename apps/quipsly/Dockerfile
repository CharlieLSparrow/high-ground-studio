# syntax=docker/dockerfile:1

FROM node:22-slim AS base

ARG PNPM_VERSION=10.30.3

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /app

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable \
  && corepack prepare "pnpm@${PNPM_VERSION}" --activate

FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml prisma.config.ts ./
COPY prisma/schema.prisma ./prisma/schema.prisma
COPY apps/quipsly/package.json ./apps/quipsly/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/motion-lab/package.json ./apps/motion-lab/package.json
COPY packages/content-studio-domain/package.json ./packages/content-studio-domain/package.json
COPY packages/quipsly-document-kernel/package.json ./packages/quipsly-document-kernel/package.json
COPY packages/worldhub-domain/package.json ./packages/worldhub-domain/package.json
COPY packages/studio-domain/package.json ./packages/studio-domain/package.json
COPY packages/motion-engine/package.json ./packages/motion-engine/package.json

RUN pnpm install --frozen-lockfile

FROM base AS builder

ARG NEXT_PUBLIC_STUDIO_COLLAB_URL=""
ARG STUDIO_COLLAB_URL=""
ARG QUIPSLY_DOCKER_IGNORE_TYPE_ERRORS="0"

ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_STUDIO_COLLAB_URL=$NEXT_PUBLIC_STUDIO_COLLAB_URL
ENV STUDIO_COLLAB_URL=$STUDIO_COLLAB_URL
ENV QUIPSLY_DOCKER_IGNORE_TYPE_ERRORS=$QUIPSLY_DOCKER_IGNORE_TYPE_ERRORS

COPY --from=deps /app ./
COPY . .

RUN pnpm db:generate \
  && node scripts/sync-prisma-pnpm-clients.mjs \
  && pnpm --filter quipsly build

FROM node:22-slim AS runner

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8080
ENV HOSTNAME=0.0.0.0

WORKDIR /app

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/quipsly/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/quipsly/.next/static ./apps/quipsly/.next/static

USER nextjs

EXPOSE 8080

CMD ["node", "apps/quipsly/server.js"]
