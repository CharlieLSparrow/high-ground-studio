# syntax=docker/dockerfile:1

FROM node:22-slim

ARG PNPM_VERSION=10.30.3

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /app

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable \
  && corepack prepare "pnpm@${PNPM_VERSION}" --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml prisma.config.ts ./
COPY prisma/schema.prisma ./prisma/schema.prisma
COPY prisma/migrations ./prisma/migrations
COPY ops/episode-production-db-push.sql ./ops/episode-production-db-push.sql
COPY ops/quipsly-foundation-additive.sql ./ops/quipsly-foundation-additive.sql
COPY apps/quipsly/package.json ./apps/quipsly/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/motion-lab/package.json ./apps/motion-lab/package.json
COPY packages/content-studio-domain/package.json ./packages/content-studio-domain/package.json
COPY packages/quipsly-domain/package.json ./packages/quipsly-domain/package.json
COPY packages/quipsly-document-kernel/package.json ./packages/quipsly-document-kernel/package.json
COPY packages/worldhub-domain/package.json ./packages/worldhub-domain/package.json
COPY packages/studio-domain/package.json ./packages/studio-domain/package.json
COPY packages/motion-engine/package.json ./packages/motion-engine/package.json

RUN pnpm install --frozen-lockfile

CMD ["pnpm", "prisma", "migrate", "deploy"]
