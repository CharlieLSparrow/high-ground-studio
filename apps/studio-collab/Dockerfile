FROM node:24-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/studio-collab/package.json apps/studio-collab/package.json
RUN pnpm install --frozen-lockfile --filter studio-collab --prod --ignore-scripts

FROM node:24-slim AS runtime
ENV NODE_ENV=production
ENV PORT=8080
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/studio-collab/node_modules ./apps/studio-collab/node_modules
COPY package.json pnpm-workspace.yaml ./
COPY apps/studio-collab apps/studio-collab
EXPOSE 8080
CMD ["pnpm", "--filter", "studio-collab", "start"]
