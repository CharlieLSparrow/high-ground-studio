#!/usr/bin/env bash
set -euo pipefail

echo "scripts/quipsly-fast-web-deploy.sh is deprecated."
echo "Use scripts/quipsly-web-deploy.sh instead. It stages a web-only context without dropping public assets."
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/quipsly-web-deploy.sh" "$@"
