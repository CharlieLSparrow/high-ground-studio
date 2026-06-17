#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
  cat <<'USAGE'
QuipslyStudio UI control toolbox installer/preflight

Usage:
  script/install_ui_control_tools.sh [--install]

What it checks:
  - swift: required for repo-local Quartz event helper
  - osascript: useful for macOS app/window inspection
  - cliclick: optional fallback for click/key/drag scripting
  - macOS event/accessibility permissions for real UI event proof

Default mode is non-mutating. Use --install to install optional missing tools
with Homebrew when available.
USAGE
}

mode="${1:-}"
if [[ "$mode" == "-h" || "$mode" == "--help" ]]; then
  usage
  exit 0
fi

install_requested=false
if [[ "$mode" == "--install" ]]; then
  install_requested=true
elif [[ -n "$mode" ]]; then
  usage >&2
  exit 2
fi

line() {
  printf '%-28s %s\n' "$1" "$2"
}

require_tool() {
  local name="$1"
  local required="${2:-required}"
  if command -v "$name" >/dev/null 2>&1; then
    line "$name" "$(command -v "$name")"
    return 0
  fi

  line "$name" "missing ($required)"
  return 1
}

missing_optional=()
require_tool swift required
require_tool osascript required

if ! require_tool cliclick optional; then
  missing_optional+=("cliclick")
fi

if (( ${#missing_optional[@]} > 0 )) && [[ "$install_requested" == true ]]; then
  if ! command -v brew >/dev/null 2>&1; then
    echo "error=homebrew_missing cannot install optional tools automatically" >&2
    exit 1
  fi

  for tool in "${missing_optional[@]}"; do
    case "$tool" in
      cliclick)
        brew install cliclick
        ;;
    esac
  done
fi

echo
echo "macOS event permission state:"
"$ROOT_DIR/script/mac_eventctl.swift" check-access || true

cat <<'INFO'

Operator notes:
  - Prefer script/agentctl.sh for semantic editor actions.
  - Use script/studioctl.sh ui-* for physical UI proof.
  - If event/accessibility access is blocked, run:
      script/studioctl.sh ui-request-access
    then approve macOS Settings prompts for Codex or Terminal.
INFO
