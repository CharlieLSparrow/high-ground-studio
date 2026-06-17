#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK_DIR="${TMPDIR:-/tmp}/quipsly-proxy-fastfail-smoke"
SOURCE="$WORK_DIR/unreadable.wav"
VAULT="$WORK_DIR/vault"
OUTPUT="$WORK_DIR/output.json"

rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR"
printf 'not real wav; unreadable-source proxy smoke' > "$SOURCE"
chmod 000 "$SOURCE"

cleanup() {
  chmod 600 "$SOURCE" 2>/dev/null || true
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

set +e
output="$(python3 "$ROOT_DIR/script/create_proxy_for_file.py" "$SOURCE" --root "$VAULT" --json --probe-timeout 1 --timeout 1 2>&1)"
rc=$?
set -e

printf '%s\n' "$output" > "$OUTPUT"

python3 - "$rc" "$OUTPUT" <<'PY'
import json
import pathlib
import sys

returncode = int(sys.argv[1])
output_path = pathlib.Path(sys.argv[2])
text = output_path.read_text()

try:
    payload = json.loads(text)
except Exception as error:
    print(text)
    raise SystemExit(f"Expected structured JSON, got {type(error).__name__}: {error}")

errors = []
if returncode != 74:
    errors.append(f"expected rc 74, got {returncode}")
if payload.get("sourceExists") is not True:
    errors.append(f"sourceExists expected true, got {payload.get('sourceExists')!r}")
if payload.get("sourceReadable") is not False:
    errors.append(f"sourceReadable expected false, got {payload.get('sourceReadable')!r}")
if payload.get("generated") is not False:
    errors.append(f"generated expected false, got {payload.get('generated')!r}")
if "byte-readable" not in payload.get("error", ""):
    errors.append("error should explain byte-readable failure")

summary = {
    "returncode": returncode,
    "sourceExists": payload.get("sourceExists"),
    "sourceReadable": payload.get("sourceReadable"),
    "generated": payload.get("generated"),
    "error": payload.get("error"),
    "diagnostic": payload.get("diagnostic"),
}
print(json.dumps(summary, indent=2))

if errors:
    print("\nProxy unreadable-source fast-fail smoke FAILED:", file=sys.stderr)
    for error in errors:
        print(f"- {error}", file=sys.stderr)
    raise SystemExit(1)

print("\nProxy unreadable-source fast-fail smoke PASSED.")
PY
