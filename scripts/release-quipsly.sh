#!/usr/bin/env bash
set -e

echo "🚀 Starting AG-Release-Captain Deployment Pre-flight Checks..."

# 1. Enforce clean working directory
if [ -n "$(git status --porcelain --ignore-submodules)" ]; then
  echo "❌ ERROR: Working directory is dirty! Uncommitted changes detected."
  echo "Please commit or stash your changes before releasing to avoid deploying a broken state."
  git status --short
  exit 1
fi
echo "✅ Git working directory is clean."

# 2. Local Typecheck
echo "🔍 Running typecheck for quipsly..."
pnpm --filter quipsly typecheck
echo "✅ Typecheck passed."

# 3. Local Build Test
echo "🏗️  Running local build to verify Next.js/Turbopack integrity..."
NEXT_PUBLIC_STUDIO_COLLAB_URL=wss://studio-collab-hm2odnvjga-uc.a.run.app STUDIO_COLLAB_URL=wss://studio-collab-hm2odnvjga-uc.a.run.app pnpm --filter quipsly build
echo "✅ Local build passed."

# 4. Database Migration
echo "☁️  Submitting Database Migration to Cloud Build..."
gcloud builds submit --config cloudbuild.prisma-migrate.yaml .
echo "✅ Database migration successful."

# 5. Deploy App
echo "☁️  Submitting App Deployment to Cloud Build..."
gcloud builds submit --config cloudbuild.studio.deploy.yaml .

echo "🎉 Deployment initiated successfully!"
