# syntax=docker/dockerfile:1

FROM node:22-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /app

RUN corepack enable

FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml prisma.config.ts ./
COPY prisma/schema.prisma ./prisma/schema.prisma
COPY apps/studio/package.json ./apps/studio/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/motion-lab/package.json ./apps/motion-lab/package.json
COPY packages/studio-domain/package.json ./packages/studio-domain/package.json
COPY packages/motion-engine/package.json ./packages/motion-engine/package.json

RUN pnpm install --frozen-lockfile

FROM base AS builder

ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app ./
COPY . .

RUN pnpm --filter studio build

FROM node:22-slim AS runner

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8080
ENV HOSTNAME=0.0.0.0

WORKDIR /app

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/studio/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/studio/.next/static ./apps/studio/.next/static

USER nextjs

EXPOSE 8080

CMD ["node", "apps/studio/server.js"]
