
### 2026-06-19 export receipt hardening note

`script/agentctl.sh wait-export` treats transient `exportState.stalled` as a warning during the wait window, not an immediate terminal failure. Terminal failures are `failed`, `blocked`, or timeout after no completion proof appears. The compact receipt includes derivative path existence, selected short status, and text burn policy, but it is still not publication approval.

Agent `shorts-update-selected publishNotes ...` appends by default so review comments do not destroy export receipt lines. Use `replacePublishNotes` / `replace_publish_notes` only when a destructive notes replacement is intentional.

`script/analyze_short_audio_sanity.py` resolves `ffmpeg` and `ffprobe` from PATH, `FFMPEG_PATH`/`FFPROBE_PATH`, `/opt/homebrew/bin`, or `/usr/local/bin`, matching the contact-sheet tool behavior.
