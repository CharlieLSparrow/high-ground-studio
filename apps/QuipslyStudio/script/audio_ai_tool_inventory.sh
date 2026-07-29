#!/usr/bin/env bash
set -euo pipefail

echo "Quipsly local AI/audio tool inventory"
echo "Generated: $(date)"
echo

echo "== Core binaries =="
for cmd in ffmpeg ffprobe whisper-cli ollama deep-filter demucs python3; do
  if command -v "$cmd" >/dev/null 2>&1; then
    printf 'present %-14s %s\n' "$cmd" "$(command -v "$cmd")"
  else
    printf 'missing %-14s\n' "$cmd"
  fi
done

echo
if command -v ollama >/dev/null 2>&1; then
  echo "== Ollama models =="
  ollama list 2>/dev/null || echo "ollama installed, daemon/model list unavailable"
fi

echo
if command -v python3 >/dev/null 2>&1; then
  echo "== Python audio / ML packages =="
  python3 - <<'PY'
mods = [
    'numpy', 'scipy', 'soundfile', 'librosa', 'pyloudnorm',
    'torch', 'torchaudio', 'demucs', 'deepfilternet', 'pyannote.audio',
    'mlx', 'mlx_whisper'
]
for mod in mods:
    try:
        __import__(mod)
        print(f'present {mod}')
    except Exception as exc:
        print(f'missing {mod}: {exc.__class__.__name__}')
PY
fi

echo
echo "== Useful local app hints =="
find /Applications /Users/"${USER}"/Applications -maxdepth 2 \
  \( -iname '*Logic*' -o -iname '*Audition*' -o -iname '*iZotope*' -o -iname '*RX*' -o -iname '*Revive*' -o -iname '*Audio*' \) \
  2>/dev/null | sed 's/^/app /' || true
