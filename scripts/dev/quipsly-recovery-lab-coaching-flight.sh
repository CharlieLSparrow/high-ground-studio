#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd -P)"
source "${script_dir}/quipsly-recovery-lab-state.sh"

base_url="http://127.0.0.1:3022"
firebase_host="127.0.0.1:9199"
firebase_project="quipsly-recovery-lab"
database_url="$(quipsly_recovery_lab_database_url)"

case "${base_url}" in
  http://127.0.0.1:*|http://localhost:*|http://\[::1\]:*) ;;
  *)
    echo "Recovery coaching flight refuses a non-loopback Nest origin." >&2
    exit 1
    ;;
esac

cd "${repo_root}"
bash "${script_dir}/quipsly-recovery-lab-doctor.sh"

exec /usr/bin/env \
  QUIPSLY_FRESH_COACHING_SPEECH_FLIGHT=1 \
  QUIPSLY_LOCAL_BASE_URL="${base_url}" \
  QUIPSLY_LOCAL_FIREBASE_PROJECT="${firebase_project}" \
  FIREBASE_PROJECT_ID="${firebase_project}" \
  FIREBASE_AUTH_EMULATOR_HOST="${firebase_host}" \
  DATABASE_URL="${database_url}" \
  node scripts/quipsly-fresh-coaching-flight.mjs
