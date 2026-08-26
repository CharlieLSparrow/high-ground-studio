#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd -P)"
source "${script_dir}/quipsly-recovery-lab-state.sh"

cd "${repo_root}"
bash "${script_dir}/quipsly-recovery-lab-doctor.sh"

exec /usr/bin/env \
  QUIPSLY_COACHING_CAPACITY_REHEARSAL=1 \
  QUIPSLY_COACHING_CAPACITY_COUNT="${QUIPSLY_COACHING_CAPACITY_COUNT:-50}" \
  QUIPSLY_LOCAL_BASE_URL=http://127.0.0.1:3022 \
  QUIPSLY_LOCAL_FIREBASE_PROJECT=quipsly-recovery-lab \
  FIREBASE_PROJECT_ID=quipsly-recovery-lab \
  FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9199 \
  DATABASE_URL="$(quipsly_recovery_lab_database_url)" \
  node scripts/quipsly-coaching-capacity-rehearsal.mjs
