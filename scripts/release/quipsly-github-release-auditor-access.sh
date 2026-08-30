#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-high-ground-odyssey}"
FIREBASE_PROJECT_ID="${FIREBASE_PROJECT_ID:-quipsly-reef}"
DEPLOYER_SERVICE_ACCOUNT="${DEPLOYER_SERVICE_ACCOUNT:-github-actions-deployer@high-ground-odyssey.iam.gserviceaccount.com}"
APPLY="${APPLY:-0}"
CONFIRM_TARGET="${CONFIRM_TARGET:-}"

RELEASE_ROLE_ID="quipslyReleaseAuditor"
AUTH_ROLE_ID="quipslyAuthReleaseAuditor"
EXPECTED_CONFIRMATION="${PROJECT_ID}/${FIREBASE_PROJECT_ID}/${DEPLOYER_SERVICE_ACCOUNT}"

case "${APPLY}" in
  0|1) ;;
  *) echo "APPLY must be 0 or 1." >&2; exit 2 ;;
esac

if [[ ! "${PROJECT_ID}" =~ ^[a-z][a-z0-9-]{4,62}$ ]] \
  || [[ ! "${FIREBASE_PROJECT_ID}" =~ ^[a-z][a-z0-9-]{4,62}$ ]] \
  || [[ ! "${DEPLOYER_SERVICE_ACCOUNT}" =~ ^[a-z0-9][a-z0-9-]{4,28}@[a-z][a-z0-9-]{4,62}\.iam\.gserviceaccount\.com$ ]]; then
  echo "Project or deployer identity is unsafe." >&2
  exit 2
fi

release_permissions=(
  cloudsql.instances.get
  logging.logEntries.list
  logging.sinks.get
  resourcemanager.projects.get
  run.domainmappings.get
  storage.buckets.get
  storage.managedFolders.getIamPolicy
)
auth_permissions=(
  iam.serviceAccounts.get
  iam.serviceAccounts.getIamPolicy
  resourcemanager.projects.get
  resourcemanager.projects.getIamPolicy
)

csv() {
  local IFS=,
  printf '%s' "$*"
}

upsert_role() {
  local project="$1"
  local role_id="$2"
  local title="$3"
  local description="$4"
  shift 4
  local permissions
  permissions="$(csv "$@")"

  if gcloud iam roles describe "${role_id}" --project="${project}" >/dev/null 2>&1; then
    gcloud iam roles update "${role_id}" \
      --project="${project}" \
      --title="${title}" \
      --description="${description}" \
      --permissions="${permissions}" \
      --stage=GA \
      --quiet
  else
    gcloud iam roles create "${role_id}" \
      --project="${project}" \
      --title="${title}" \
      --description="${description}" \
      --permissions="${permissions}" \
      --stage=GA \
      --quiet
  fi
}

verify_role() {
  local project="$1"
  local role_id="$2"
  shift 2
  local expected actual
  expected="$(printf '%s\n' "$@" | LC_ALL=C sort)"
  actual="$(
    gcloud iam roles describe "${role_id}" \
      --project="${project}" \
      --format='value(includedPermissions)' \
      | tr ';' '\n' \
      | sed '/^$/d' \
      | LC_ALL=C sort
  )"
  [[ "${actual}" == "${expected}" ]] || {
    echo "Custom role ${project}/${role_id} does not contain the exact audited permission set." >&2
    exit 1
  }
}

verify_binding() {
  local project="$1"
  local role_name="$2"
  gcloud projects get-iam-policy "${project}" \
    --flatten='bindings[].members' \
    --filter="bindings.role:${role_name} AND bindings.members:serviceAccount:${DEPLOYER_SERVICE_ACCOUNT}" \
    --format='value(bindings.role)' \
    | grep -Fxq "${role_name}"
}

if [[ "${APPLY}" == "0" ]]; then
  cat <<EOF
PLAN Create or update two read-only custom roles and grant them only to:
  ${DEPLOYER_SERVICE_ACCOUNT}

Release project: ${PROJECT_ID}
  $(csv "${release_permissions[@]}")
Firebase project: ${FIREBASE_PROJECT_ID}
  $(csv "${auth_permissions[@]}")

No customer objects, secrets, auth users, writes, or IAM mutations are included
in either custom role. To apply exactly this plan:

  APPLY=1 CONFIRM_TARGET='${EXPECTED_CONFIRMATION}' \\
    bash scripts/release/quipsly-github-release-auditor-access.sh
EOF
  exit 0
fi

[[ "${CONFIRM_TARGET}" == "${EXPECTED_CONFIRMATION}" ]] || {
  echo "APPLY=1 requires CONFIRM_TARGET='${EXPECTED_CONFIRMATION}'." >&2
  exit 2
}

upsert_role \
  "${PROJECT_ID}" \
  "${RELEASE_ROLE_ID}" \
  "Quipsly Release Auditor" \
  "Read-only release health and media policy verification for Quipsly GitHub Actions." \
  "${release_permissions[@]}"

upsert_role \
  "${FIREBASE_PROJECT_ID}" \
  "${AUTH_ROLE_ID}" \
  "Quipsly Auth Release Auditor" \
  "Read-only Firebase IAM verification for Quipsly GitHub Actions." \
  "${auth_permissions[@]}"

release_role="projects/${PROJECT_ID}/roles/${RELEASE_ROLE_ID}"
auth_role="projects/${FIREBASE_PROJECT_ID}/roles/${AUTH_ROLE_ID}"
member="serviceAccount:${DEPLOYER_SERVICE_ACCOUNT}"

gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="${member}" \
  --role="${release_role}" \
  --condition=None \
  --quiet >/dev/null
gcloud projects add-iam-policy-binding "${FIREBASE_PROJECT_ID}" \
  --member="${member}" \
  --role="${auth_role}" \
  --condition=None \
  --quiet >/dev/null

verify_role "${PROJECT_ID}" "${RELEASE_ROLE_ID}" "${release_permissions[@]}"
verify_role "${FIREBASE_PROJECT_ID}" "${AUTH_ROLE_ID}" "${auth_permissions[@]}"
verify_binding "${PROJECT_ID}" "${release_role}"
verify_binding "${FIREBASE_PROJECT_ID}" "${auth_role}"

echo "PASS GitHub Actions has the exact read-only release audit access in both projects."
