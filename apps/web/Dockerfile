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
COPY apps/quipsly/package.json ./apps/quipsly/package.json
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
ENV WEB_DOCKER_IGNORE_TYPE_ERRORS=1

COPY --from=deps /app ./
COPY . .

# Generate Prisma, then copy the generated runtime into every pnpm peer-resolved
# @prisma/client instance. Next route collection can resolve a different peer
# folder than `prisma generate` picked, and each instance expects its own
# sibling node_modules/.prisma/client runtime.
RUN pnpm exec prisma generate --schema prisma/schema.prisma \
  && generated_client_dir="$(find /app/node_modules/.pnpm -path '*/node_modules/.prisma/client/default.js' -print -quit | xargs dirname)" \
  && test -n "$generated_client_dir" \
  && rm -rf /tmp/prisma-client-runtime \
  && cp -R "$generated_client_dir" /tmp/prisma-client-runtime \
  && for client_default in $(find /app/node_modules/.pnpm -path '*/node_modules/@prisma/client/default.js' -print); do \
    client_node_modules="$(dirname "$(dirname "$(dirname "$client_default")")")"; \
    mkdir -p "$client_node_modules/.prisma"; \
    rm -rf "$client_node_modules/.prisma/client"; \
    cp -R /tmp/prisma-client-runtime "$client_node_modules/.prisma/client"; \
  done

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
