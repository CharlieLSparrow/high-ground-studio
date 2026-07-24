#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODEL_DIR="${QUIPSLY_WHISPER_MODEL_DIR:-$HOME/Library/Application Support/QuipslyStudio/WhisperModels}"
MODEL_NAME="${QUIPSLY_WHISPER_CPP_MODEL_NAME:-ggml-base.en.bin}"
MODEL_PATH="$MODEL_DIR/$MODEL_NAME"
MODEL_URL="${QUIPSLY_WHISPER_CPP_MODEL_URL:-https://huggingface.co/ggerganov/whisper.cpp/resolve/main/$MODEL_NAME}"

usage() {
  cat <<'USAGE'
Set up local ASR for QuipslyStudio.

Usage:
  script/setup_local_asr.sh [--doctor] [--install-brew] [--download-model]

Environment:
  QUIPSLY_WHISPER_MODEL_DIR       Override model folder.
  QUIPSLY_WHISPER_CPP_MODEL_NAME  Default: ggml-base.en.bin
  QUIPSLY_WHISPER_CPP_MODEL_URL   Override model download URL.

This installs/configures the local ASR adapter only. It does not transcribe,
cut, or mutate episode media.
USAGE
}

doctor() {
  echo "Quipsly local ASR doctor"
  echo "root: $ROOT_DIR"
  echo "brew: $(command -v brew || true)"
  echo "whisper-cli: $(command -v whisper-cli || true)"
  echo "whisper-cpp: $(command -v whisper-cpp || true)"
  echo "model: $MODEL_PATH"
  if [[ -f "$MODEL_PATH" ]]; then
    echo "model_status: present"
  else
    echo "model_status: missing"
  fi
  echo
  echo "Use these exports for this shell:"
  echo "export QUIPSLY_TRANSCRIPT_PROVIDER=whisper-cpp"
  echo "export QUIPSLY_WHISPER_CPP_MODEL=$(printf '%q' "$MODEL_PATH")"
  echo
  "$ROOT_DIR/script/local_transcript_provider.py" --doctor || true
}

install_brew() {
  if ! command -v brew >/dev/null 2>&1; then
    echo "Homebrew is not installed or not on PATH." >&2
    return 1
  fi
  if command -v whisper-cli >/dev/null 2>&1 || command -v whisper-cpp >/dev/null 2>&1; then
    echo "whisper.cpp CLI already present."
    return 0
  fi
  brew install whisper-cpp
}

download_model() {
  mkdir -p "$MODEL_DIR"
  if [[ -f "$MODEL_PATH" ]]; then
    echo "Model already present: $MODEL_PATH"
    return 0
  fi
  echo "Downloading $MODEL_NAME to $MODEL_PATH"
  curl -L --fail --progress-bar "$MODEL_URL" -o "$MODEL_PATH"
}

if [[ $# -eq 0 ]]; then
  doctor
  exit 0
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --doctor)
      doctor
      ;;
    --install-brew)
      install_brew
      ;;
    --download-model)
      download_model
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done
