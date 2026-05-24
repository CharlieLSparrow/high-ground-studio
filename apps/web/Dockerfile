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
COPY apps/web/package.json ./apps/web/package.json
COPY apps/studio/package.json ./apps/studio/package.json
COPY apps/motion-lab/package.json ./apps/motion-lab/package.json
COPY packages/content-studio-domain/package.json ./packages/content-studio-domain/package.json
COPY packages/worldhub-domain/package.json ./packages/worldhub-domain/package.json
COPY packages/studio-domain/package.json ./packages/studio-domain/package.json
COPY packages/motion-engine/package.json ./packages/motion-engine/package.json

RUN pnpm install --frozen-lockfile

FROM base AS builder

ENV NEXT_TELEMETRY_DISABLED=1
# Build-time placeholder only. The real runtime DATABASE_URL must come from
# Cloud Run env/Secret Manager.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/high_ground_build

COPY --from=deps /app ./
COPY . .

# The default Turbopack production build has been unstable in local verification
# for this repo. Use the documented webpack path until that is resolved.
RUN pnpm --filter web exec next build --webpack

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

COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/content ./apps/web/content

USER nextjs

EXPOSE 8080

CMD ["node", "apps/web/server.js"]
