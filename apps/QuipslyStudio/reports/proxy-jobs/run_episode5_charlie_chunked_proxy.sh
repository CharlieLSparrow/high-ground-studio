#!/usr/bin/env bash
set -euo pipefail
cd /Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio
export QUIPSLY_PROXY_VIDEO_ENCODER=h264_videotoolbox
export QUIPSLY_PROXY_VIDEO_SCALE=640:-2
export QUIPSLY_PROXY_VIDEO_FPS=15
export QUIPSLY_PROXY_VIDEO_BITRATE=550k
export QUIPSLY_PROXY_VIDEO_MAXRATE=750k
export QUIPSLY_PROXY_VIDEO_BUFSIZE=1100k
exec /usr/bin/time -p python3 script/create_chunked_proxy_for_file.py '/Volumes/My Passport/Episode 5/CharlieVideo.mp4' --chunk-seconds 60 --timeout-per-chunk 240 --json
