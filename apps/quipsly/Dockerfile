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
COPY scripts/prisma-generate-workspace-clients.mjs ./scripts/prisma-generate-workspace-clients.mjs
COPY apps/quipsly/package.json ./apps/quipsly/package.json
COPY packages/content-studio-domain/package.json ./packages/content-studio-domain/package.json
COPY packages/quipsly-domain/package.json ./packages/quipsly-domain/package.json
COPY packages/quipsly-capture-verification/package.json ./packages/quipsly-capture-verification/package.json
COPY packages/quipsly-media-processing/package.json ./packages/quipsly-media-processing/package.json
COPY packages/quipsly-document-kernel/package.json ./packages/quipsly-document-kernel/package.json
COPY packages/studio-domain/package.json ./packages/studio-domain/package.json

RUN pnpm install --frozen-lockfile

FROM base AS builder

ARG NEXT_PUBLIC_STUDIO_COLLAB_URL=""
ARG STUDIO_COLLAB_URL=""
ARG QUIPSLY_DOCKER_IGNORE_TYPE_ERRORS="0"
ARG QUIPSLY_BUILD_ID="local"
ARG NODE_OPTIONS="--max-old-space-size=4096"
ARG NEXT_PUBLIC_FIREBASE_API_KEY="AIzaSyDvcHtENDtiZCjBS46cW-qa91nHe5DjUkM"
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="quipsly-reef.firebaseapp.com"
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID="quipsly-reef"
ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="quipsly-reef.firebasestorage.app"
ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="249115653261"
ARG NEXT_PUBLIC_FIREBASE_APP_ID="1:249115653261:web:d49c566ebe99148cbddec4"
ARG NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID="249115653261-g6lvadv4e1a64eu50u0glkepamtq709b.apps.googleusercontent.com"

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS=$NODE_OPTIONS
# Build-time placeholder only. Cloud Run supplies the real runtime secret.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/high_ground_build
ENV NEXT_PUBLIC_STUDIO_COLLAB_URL=$NEXT_PUBLIC_STUDIO_COLLAB_URL
ENV STUDIO_COLLAB_URL=$STUDIO_COLLAB_URL
ENV QUIPSLY_DOCKER_IGNORE_TYPE_ERRORS=$QUIPSLY_DOCKER_IGNORE_TYPE_ERRORS
ENV NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY
ENV NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ENV NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID
ENV NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ENV NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ENV NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID
ENV NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID

COPY --from=deps /app ./
COPY . .

RUN echo "Quipsly build id: ${QUIPSLY_BUILD_ID}" \
  && pnpm db:generate \
  && node scripts/sync-prisma-pnpm-clients.mjs \
  && pnpm --filter quipsly exec next build --webpack

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
COPY --from=builder --chown=nextjs:nodejs /app/apps/quipsly/public ./apps/quipsly/public
# Runtime readiness compares the exact migration history shipped with this
# image to production's completed Prisma ledger before promotion. These are
# source-only SQL files; no database credential or generated client is copied.
COPY --from=builder --chown=nextjs:nodejs /app/prisma/migrations ./prisma/migrations

USER nextjs

EXPOSE 8080

CMD ["node", "apps/quipsly/server.js"]
