#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NO_BUILD=false
OUTPUT_DIR="${TMPDIR:-/tmp}/quipslystudio-all-publish-workers-smoke"

usage() {
  cat <<'USAGE'
Smoke Episode 1 all publish-worker dry-runs.

Usage:
  script/smoke_episode1_all_publish_workers_dry_run.sh [--no-build] [--output-dir /absolute/output]

This is the release-operator floor check. It proves every bundled destination
worker can consume a real Episode 1 release packet without creating fake
provider receipts, public URLs, uploads, schedules, or published statuses.

Coverage:
  - YouTube Shorts via youtube_upload_worker.py
  - Patreon via patreon_upload_worker.py
  - Instagram/Facebook/LinkedIn via social_upload_worker.py
  - Spotify/Apple Podcasts via podcast_upload_worker.py
USAGE
}

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --no-build)
      NO_BUILD=true
      shift
      ;;
    --output-dir)
      OUTPUT_DIR="${2:-}"
      if [[ -z "$OUTPUT_DIR" ]]; then
        usage >&2
        exit 2
      fi
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      exit 2
      ;;
  esac
done

if [[ "$NO_BUILD" == false ]]; then
  "$ROOT_DIR/script/build_and_run.sh" --verify >/tmp/quipslystudio-all-publish-workers-build.log
fi

rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

RESULTS_JSONL="$OUTPUT_DIR/results.jsonl"
SUMMARY_JSON="$OUTPUT_DIR/summary.json"
: > "$RESULTS_JSONL"

failures=0

run_worker_group() {
  local name="$1"
  local smoke_script="$2"
  log_path="$OUTPUT_DIR/$name.log"
  status="passed"
  started_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  if ! "$ROOT_DIR/script/$smoke_script" --no-build --output-dir "$OUTPUT_DIR/$name" >"$log_path" 2>&1; then
    status="failed"
    failures=$((failures + 1))
  fi
  completed_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  python3 - "$RESULTS_JSONL" "$name" "$status" "$log_path" "$started_at" "$completed_at" <<'PY'
import json
import sys

jsonl_path, name, status, log_path, started_at, completed_at = sys.argv[1:]
entry = {
    "name": name,
    "status": status,
    "logPath": log_path,
    "startedAt": started_at,
    "completedAt": completed_at,
}
with open(jsonl_path, "a", encoding="utf-8") as handle:
    handle.write(json.dumps(entry, sort_keys=True) + "\n")
PY
}

run_worker_group "youtube" "smoke_episode1_youtube_worker_dry_run.sh"
run_worker_group "patreon" "smoke_episode1_patreon_worker_dry_run.sh"
run_worker_group "social" "smoke_episode1_social_worker_dry_run.sh"
run_worker_group "podcast" "smoke_episode1_podcast_worker_dry_run.sh"

python3 - "$RESULTS_JSONL" "$SUMMARY_JSON" "$failures" <<'PY'
import json
import sys

jsonl_path, summary_path, failures_text = sys.argv[1:]
rows = []
with open(jsonl_path, "r", encoding="utf-8") as handle:
    for line in handle:
        line = line.strip()
        if line:
            rows.append(json.loads(line))

failures = int(failures_text)
summary = {
    "status": "failed" if failures else "passed",
    "model": "quipsly-all-publish-workers-dry-run-smoke",
    "version": "2026-06-16.all-publish-workers.v1",
    "workerGroups": len(rows),
    "passedCount": sum(1 for row in rows if row.get("status") == "passed"),
    "failedCount": failures,
    "sourcePolicy": "dry-run only; no platform upload, schedule, published status, provider receipt, or public URL is allowed",
    "coverage": [
        "YouTube Shorts",
        "Patreon",
        "Instagram",
        "Facebook",
        "LinkedIn",
        "Spotify",
        "Apple Podcasts",
    ],
    "results": rows,
}
with open(summary_path, "w", encoding="utf-8") as handle:
    json.dump(summary, handle, indent=2, sort_keys=True)
print(json.dumps(summary, indent=2, sort_keys=True))
if failures:
    raise SystemExit(1)
PY
