#!/usr/bin/env bash
set -euo pipefail

: "${SOURCE_DATABASE_URL:?SOURCE_DATABASE_URL is required}"
: "${TARGET_DATABASE_URL:?TARGET_DATABASE_URL is required}"

SOURCE_DATABASE_URL="$(printf '%s' "$SOURCE_DATABASE_URL" | tr -d '\r\n')"
TARGET_DATABASE_URL="$(printf '%s' "$TARGET_DATABASE_URL" | tr -d '\r\n')"
ALLOW_NONEMPTY_TARGET="${POSTGRES_COPY_ALLOW_NONEMPTY_TARGET:-0}"
DUMP_FILE="$(mktemp -t hgo-postgres-copy.XXXXXX.dump)"

cleanup() {
  rm -f "$DUMP_FILE"
}

trap cleanup EXIT

list_tables() {
  local database_url="$1"

  psql "$database_url" \
    -v ON_ERROR_STOP=1 \
    -Atc "select quote_ident(schemaname) || '.' || quote_ident(tablename) from pg_tables where schemaname = 'public' order by tablename;"
}

count_rows() {
  local database_url="$1"
  local label="$2"
  local total=0
  local tables=()
  local table_output

  if ! table_output="$(list_tables "$database_url")"; then
    echo "$label table listing failed" >&2
    exit 1
  fi

  if [[ -n "$table_output" ]]; then
    mapfile -t tables <<< "$table_output"
  fi

  if [[ "${#tables[@]}" -eq 0 ]]; then
    echo "$label has no public tables" >&2
    echo 0
    return
  fi

  for table in "${tables[@]}"; do
    local count
    count="$(psql "$database_url" -v ON_ERROR_STOP=1 -Atc "select count(*) from ${table};")"
    echo "$label ${table} rows=${count}" >&2
    total=$((total + count))
  done

  echo "$total"
}

echo "Postgres staged data copy"
echo "Copies data from SOURCE_DATABASE_URL to TARGET_DATABASE_URL."
echo "Database URLs and row data are never printed."
echo "Target must be empty unless POSTGRES_COPY_ALLOW_NONEMPTY_TARGET=1."

SOURCE_TOTAL="$(count_rows "$SOURCE_DATABASE_URL" "source-before")"
TARGET_TOTAL="$(count_rows "$TARGET_DATABASE_URL" "target-before")"

echo "source-before total rows=${SOURCE_TOTAL}"
echo "target-before total rows=${TARGET_TOTAL}"

if [[ "$TARGET_TOTAL" != "0" && "$ALLOW_NONEMPTY_TARGET" != "1" ]]; then
  echo "Refusing to restore into non-empty target. Set POSTGRES_COPY_ALLOW_NONEMPTY_TARGET=1 to override." >&2
  exit 1
fi

pg_dump \
  --format=custom \
  --data-only \
  --no-owner \
  --no-privileges \
  --file="$DUMP_FILE" \
  "$SOURCE_DATABASE_URL"

pg_restore \
  --data-only \
  --no-owner \
  --no-privileges \
  --exit-on-error \
  --dbname="$TARGET_DATABASE_URL" \
  "$DUMP_FILE"

TARGET_AFTER_TOTAL="$(count_rows "$TARGET_DATABASE_URL" "target-after")"

echo "target-after total rows=${TARGET_AFTER_TOTAL}"

if [[ "$SOURCE_TOTAL" != "$TARGET_AFTER_TOTAL" ]]; then
  echo "Warning: source and target total row counts differ. Review per-table counts above." >&2
  exit 2
fi

echo "Postgres staged data copy completed."
