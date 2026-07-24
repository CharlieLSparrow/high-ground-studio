#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
node scripts/quipsly-coaching-local-lifecycle-db-smoke.mjs --json "$@"
