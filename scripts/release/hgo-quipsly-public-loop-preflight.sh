#!/usr/bin/env bash
set -u -o pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

RUN_BUILDS="${RUN_BUILDS:-1}"
RUN_LIVE_PACKET="${RUN_LIVE_PACKET:-1}"
STRICT_LIVE_PACKET="${STRICT_LIVE_PACKET:-0}"
RUN_LIVE_MATRIX="${RUN_LIVE_MATRIX:-1}"
STRICT_LIVE_MATRIX="${STRICT_LIVE_MATRIX:-0}"
RUN_LIVE_INTEGRATION="${RUN_LIVE_INTEGRATION:-1}"
STRICT_LIVE_INTEGRATION="${STRICT_LIVE_INTEGRATION:-0}"
RUN_OPERATOR_AUTH="${RUN_OPERATOR_AUTH:-1}"

failures=0
warnings=0

pass() {
  printf "PASS %s\n" "$1"
}

warn() {
  printf "WARN %s\n" "$1" >&2
  warnings=$((warnings + 1))
}

fail() {
  printf "FAIL %s\n" "$1" >&2
  failures=$((failures + 1))
}

step() {
  printf "\n== %s ==\n" "$1"
}

run_required() {
  local label="$1"
  shift
  printf "RUN  %s\n" "$label"
  if "$@"; then
    pass "$label"
  else
    fail "$label"
  fi
}

run_warning() {
  local label="$1"
  shift
  printf "RUN  %s\n" "$label"
  if "$@"; then
    pass "$label"
  else
    warn "$label"
  fi
}

step "Public loop contract"
cat <<'SUMMARY'
HighGroundOdyssey.com teaches and routes.
Quipsly.com educates and funnels.
Nest owns booking, consent, payment evidence, capture rooms, transcripts, packets, and review truth.
Native capture stays local-first; source recordings are not disposable cache.
SUMMARY

step "Source and local contract checks"
run_required "HGO + Quipsly coaching handoff static smoke" node scripts/hgo-quipsly-coaching-handoff-static-smoke.mjs
run_required "Nest public coaching packet smoke syntax" node --check scripts/quipsly-coaching-public-handoff-smoke.mjs
run_required "Nest coaching lifecycle static smoke" node scripts/quipsly-coaching-lifecycle-static-smoke.mjs
run_required "Mobile capture source contract smoke" node scripts/quipsly-mobile-capture-contract-smoke.mjs --source-only --json
run_required "iOS capture App Store static smoke" node scripts/quipsly-ios-capture-app-store-static-smoke.mjs
run_required "iOS capture reviewer runway static smoke" node scripts/quipsly-capture-reviewer-runway-static-smoke.mjs
run_required "Quipsly typecheck" corepack pnpm --filter quipsly typecheck

if [[ "${RUN_BUILDS}" == "1" ]]; then
  step "Production build checks"
  run_required "Quipsly production build" corepack pnpm --filter quipsly build
  run_required "High Ground web production build" corepack pnpm --filter web build
else
  warn "Production builds skipped because RUN_BUILDS=${RUN_BUILDS}. Set RUN_BUILDS=1 before release if route layout changed."
fi

if [[ "${RUN_LIVE_PACKET}" == "1" ]]; then
  step "Live Nest public packet drift check"
  if [[ "${STRICT_LIVE_PACKET}" == "1" ]]; then
    run_required "Live Nest public coaching packet" node scripts/quipsly-coaching-public-handoff-smoke.mjs --base-url=https://nest.quipsly.com --json
  else
    run_warning "Live Nest public coaching packet (warn-only drift report)" node scripts/quipsly-coaching-public-handoff-smoke.mjs --base-url=https://nest.quipsly.com --json
  fi
else
  warn "Live Nest public coaching packet skipped because RUN_LIVE_PACKET=${RUN_LIVE_PACKET}."
fi

if [[ "${RUN_LIVE_MATRIX}" == "1" ]]; then
  step "Live route matrix drift check"
  if [[ "${STRICT_LIVE_MATRIX}" == "1" ]]; then
    run_required "Live public route matrix" node scripts/hgo-quipsly-public-route-matrix.mjs --json
  else
    run_warning "Live public route matrix (warn-only drift report)" node scripts/hgo-quipsly-public-route-matrix.mjs --json --warn-only
  fi
else
  warn "Live route matrix skipped because RUN_LIVE_MATRIX=${RUN_LIVE_MATRIX}."
fi

if [[ "${RUN_LIVE_INTEGRATION}" == "1" ]]; then
  step "Live public integration drift check"
  if [[ "${STRICT_LIVE_INTEGRATION}" == "1" ]]; then
    run_required "Live public integration smoke" node scripts/hgo-quipsly-public-integration-smoke.mjs --json
  else
    run_warning "Live public integration smoke (warn-only drift report)" node scripts/hgo-quipsly-public-integration-smoke.mjs --json --warn-only
  fi
else
  warn "Live public integration smoke skipped because RUN_LIVE_INTEGRATION=${RUN_LIVE_INTEGRATION}."
fi

if [[ "${RUN_OPERATOR_AUTH}" == "1" ]]; then
  step "Operator deploy auth"
  run_required "gcloud/Firebase deploy auth check" bash scripts/release/quipsly-gcloud-auth-check.sh
else
  warn "Operator deploy auth skipped because RUN_OPERATOR_AUTH=${RUN_OPERATOR_AUTH}. This proves source contracts only, not preview deploy readiness."
fi

step "Next commands when this preflight is green"
cat <<'TRUTH'
State boundary:
- Source preflight passing means the repo contract is coherent.
- Preview deploy readiness also requires production builds and operator auth.
- Live proof requires promoted public routes and JSON endpoints to pass smokes.
- Do not call the public loop fixed while HGO copy is stale, Quipsly.com/coaching falls into Nest, or Nest JSON routes return 404 HTML.
TRUTH

cat <<'COMMANDS'
# Nest/Quipsly no-traffic preview:
corepack pnpm quipsly:cloudrun:deploy-preview
PREVIEW_URL=<preview-url> HOST_HEADER=nest.quipsly.com corepack pnpm quipsly:cloudrun:smoke-preview

# HGO web preview/deploy path:
corepack pnpm web:cloudrun:preflight
corepack pnpm web:cloudrun:deploy

# Live public loop proof after preview promotion:
node scripts/quipsly-coaching-public-handoff-smoke.mjs --base-url=https://nest.quipsly.com --json
node scripts/hgo-quipsly-public-route-matrix.mjs --json
node scripts/hgo-quipsly-public-integration-smoke.mjs --json
COMMANDS

printf "\nPublic loop preflight summary: %s failure(s), %s warning(s).\n" "${failures}" "${warnings}"

if [[ "${failures}" -gt 0 ]]; then
  cat <<'BLOCKED' >&2

Preflight is not release-clear yet.
If only the gcloud/Firebase deploy auth check failed, run:
  gcloud auth login --update-adc --brief
  bash scripts/release/quipsly-gcloud-auth-check.sh
Then rerun:
  corepack pnpm quipsly:public-loop:preflight
BLOCKED
  exit 1
fi

if [[ "${RUN_OPERATOR_AUTH}" == "1" && "${RUN_BUILDS}" == "1" ]]; then
  printf "Public loop preflight passed. Preview deploy path is clear.\n"
else
  printf "Public loop source preflight passed. Run with RUN_BUILDS=1 and RUN_OPERATOR_AUTH=1 before preview deploy.\n"
fi
