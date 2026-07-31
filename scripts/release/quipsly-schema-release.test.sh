#!/usr/bin/env bash
set -euo pipefail

source_root="$(git rev-parse --show-toplevel)"
fixture_root="$(mktemp -d "${TMPDIR:-/tmp}/quipsly-schema-release-test.XXXXXX")"
trap 'rm -rf -- "${fixture_root}"' EXIT

mkdir -p \
  "${fixture_root}/repo/scripts/release" \
  "${fixture_root}/repo/prisma/migrations/fixture" \
  "${fixture_root}/bin" \
  "${fixture_root}/state"
cp "${source_root}/scripts/release/quipsly-schema-release.sh" \
  "${fixture_root}/repo/scripts/release/quipsly-schema-release.sh"
cp "${source_root}/scripts/release/quipsly-cloud-sql-backup-readback.mjs" \
  "${fixture_root}/repo/scripts/release/quipsly-cloud-sql-backup-readback.mjs"

cat >"${fixture_root}/repo/scripts/release/quipsly-schema-job.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf 'schema:%s:%s\n' "${MODE}" "${IMAGE_REFERENCE:-tag}" >>"${QUIPSLY_TEST_LOG}"
EOF
chmod +x "${fixture_root}/repo/scripts/release/quipsly-schema-job.sh"

cat >"${fixture_root}/bin/gcloud" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf 'gcloud:%s\n' "$*" >>"${QUIPSLY_TEST_LOG}"

case "${1:-} ${2:-} ${3:-}" in
  "auth print-access-token "|"auth application-default print-access-token")
    echo token
    ;;
  "projects describe test-project")
    echo test-project
    ;;
  "sql instances describe")
    echo test-project:us-test1:test-instance
    ;;
  "artifacts docker images")
    printf 'sha256:%064d\n' 1
    ;;
  "sql backups create")
    for argument in "$@"; do
      case "${argument}" in
        --description=*) printf '%s' "${argument#--description=}" >"${QUIPSLY_TEST_STATE}/description" ;;
      esac
    done
    echo "Backup completed."
    ;;
  "sql backups list")
    description="$(<"${QUIPSLY_TEST_STATE}/description")"
    printf '[{"id":"12345","instance":"test-instance","selfLink":"https://sqladmin.googleapis.com/sql/v1beta4/projects/test-project/instances/test-instance/backupRuns/12345","description":"%s","status":"SUCCESSFUL","type":"ON_DEMAND","startTime":"2026-07-31T12:00:00Z","endTime":"2026-07-31T12:01:00Z"}]\n' "${description}"
    ;;
  "sql backups describe")
    description="$(<"${QUIPSLY_TEST_STATE}/description")"
    printf '{"id":"12345","instance":"test-instance","selfLink":"https://sqladmin.googleapis.com/sql/v1beta4/projects/test-project/instances/test-instance/backupRuns/12345","description":"%s","status":"SUCCESSFUL","type":"ON_DEMAND","startTime":"2026-07-31T12:00:00Z","endTime":"2026-07-31T12:01:00Z"}\n' "${description}"
    ;;
  *)
    echo "Unexpected fake gcloud invocation: $*" >&2
    exit 90
    ;;
esac
EOF
chmod +x "${fixture_root}/bin/gcloud"

(
  cd "${fixture_root}/repo"
  git init -q
  git config user.email test@quipsly.invalid
  git config user.name "Quipsly Test"
  git add .
  git commit -qm fixture
)

receipt="${fixture_root}/release.json"
log="${fixture_root}/state/operations.log"
PATH="${fixture_root}/bin:${PATH}" \
QUIPSLY_TEST_LOG="${log}" \
QUIPSLY_TEST_STATE="${fixture_root}/state" \
  bash "${fixture_root}/repo/scripts/release/quipsly-schema-release.sh" \
    --project test-project \
    --region us-test1 \
    --sql-instance test-project:us-test1:test-instance \
    --output "${receipt}" \
    --apply \
    --confirm-target test-project/test-instance

node - "${receipt}" <<'NODE'
const fs = require("node:fs");
const receiptPath = process.argv[2];
const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
if (receipt.mode !== "APPLY" || receipt.outcome !== "PASSED") {
  throw new Error("Schema release did not produce a passing apply receipt.");
}
if (!receipt.backup.readbackPassed || receipt.backup.id !== "12345") {
  throw new Error("Schema release did not retain exact backup readback evidence.");
}
if (!receipt.schemaImage.immutableReference?.includes("@sha256:")) {
  throw new Error("Schema release did not pin its production jobs to a digest.");
}
if (receipt.migration.legacyDbPushUsed || receipt.migration.legacyTargetedSyncUsed) {
  throw new Error("Schema release receipt claims a legacy mutation path.");
}
const mode = fs.statSync(receiptPath).mode & 0o777;
if (mode !== 0o600) throw new Error(`Receipt mode is ${mode.toString(8)}, expected 600.`);
NODE

schema_modes="$(sed -n 's/^schema:\([^:]*\):.*/\1/p' "${log}" | paste -sd' ' -)"
expected_modes="fixture migrate status diff"
if [[ "${schema_modes}" != "${expected_modes}" ]]; then
  cat "${log}" >&2
  echo "Unexpected schema job order: ${schema_modes}" >&2
  exit 1
fi

backup_line="$(grep -n '^gcloud:sql backups create' "${log}" | cut -d: -f1)"
migrate_line="$(grep -n '^schema:migrate:' "${log}" | cut -d: -f1)"
if [[ -z "${backup_line}" || -z "${migrate_line}" || "${backup_line}" -ge "${migrate_line}" ]]; then
  cat "${log}" >&2
  echo "Production migration did not wait for backup creation." >&2
  exit 1
fi

if grep -Eq 'targeted|db push|accept-data-loss' "${log}"; then
  cat "${log}" >&2
  echo "Guarded schema release invoked a legacy schema mutation path." >&2
  exit 1
fi

plan_receipt="${fixture_root}/plan.json"
(
  cd "${fixture_root}/repo"
  bash scripts/release/quipsly-schema-release.sh \
    --project test-project \
    --region us-test1 \
    --sql-instance test-project:us-test1:test-instance \
    --output "${plan_receipt}" >/dev/null
)
node -e '
const fs = require("node:fs");
const receipt = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
if (receipt.mode !== "PLAN" || receipt.outcome !== "PLANNED") process.exit(1);
' "${plan_receipt}"

preflight_release_commands="$(
  sed -n '/^print_step "Next release commands"/,$p' \
    "${source_root}/scripts/release/quipsly-release-preflight.sh"
)"
if ! grep -Fq 'quipsly-schema-release.sh' <<<"${preflight_release_commands}"; then
  echo "Release preflight does not advertise the guarded schema lane." >&2
  exit 1
fi
if grep -Fq 'quipsly-schema-sync.sh' <<<"${preflight_release_commands}"; then
  echo "Release preflight still advertises the legacy schema bridge." >&2
  exit 1
fi

echo "PASS schema release enforces fixture, digest, backup, migrate, status, and zero-diff order."
