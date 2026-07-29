#!/usr/bin/env python3
"""Select the next transcript-intake target.

This is routing only: it identifies an audio-ready short that still needs real
word evidence and returns safe commands/paths for ASR or manual transcript work.
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
DEFAULT_INDEX_JSON = (
    DEFAULT_ROOT
    / "shorts-command-room"
    / "transcript-intake"
    / "index"
    / "quipsly-studio-shorts-transcript-intake-index.json"
)


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise SystemExit(f"Transcript intake index not found: {path}\nRun: script/agentctl.sh studio-shorts-transcript-intake-index")
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise SystemExit(f"Expected JSON object: {path}")
    return data


def select_target(rows: list[dict[str, Any]], short_id: str) -> dict[str, Any]:
    if short_id:
        selected = next((row for row in rows if str(row.get("shortId") or "") == short_id), None)
        if selected:
            return selected
        raise SystemExit(f"Short id not found in transcript intake index: {short_id}")
    ready = [
        row
        for row in rows
        if row.get("audioSidecarExists")
        and not Path(str(row.get("normalizedTranscriptPath") or "")).exists()
    ]
    if ready:
        return sorted(ready, key=lambda row: (int(row.get("episode") or 999), str(row.get("shortId") or "")))[0]
    if rows:
        return sorted(rows, key=lambda row: (int(row.get("episode") or 999), str(row.get("shortId") or "")))[0]
    raise SystemExit("Transcript intake index has no items.")


def build_payload(index_path: Path, short_id: str) -> dict[str, Any]:
    index = read_json(index_path)
    rows = [row for row in index.get("latestByShort", []) if isinstance(row, dict)]
    target = select_target(rows, short_id)
    audio = str(target.get("audioSidecarPath") or "")
    normalized = str(target.get("normalizedTranscriptPath") or "")
    raw = str(target.get("rawProviderOutputPath") or "")
    caption_srt = str(target.get("captionDraftSrtPath") or "")
    caption_vtt = str(target.get("captionDraftVttPath") or "")
    return {
        "schema": "quipsly.studio.shorts-transcript-intake-next.v1",
        "generatedAt": iso_now(),
        "sourceIndexJson": str(index_path),
        "selected": target,
        "shortId": target.get("shortId"),
        "episode": target.get("episode"),
        "status": "ready-for-asr-or-manual-transcript" if target.get("audioSidecarExists") else "needs-audio-sidecar",
        "audioSidecarPath": audio,
        "destinations": {
            "rawProviderOutput": raw,
            "normalizedTranscript": normalized,
            "captionDraftSrt": caption_srt,
            "captionDraftVtt": caption_vtt,
        },
        "safeCommands": {
            "openAudio": f"open {shell_quote(audio)}" if audio and Path(audio).exists() else "",
            "openManifest": f"open {shell_quote(str(target.get('manifestPath') or ''))}" if target.get("manifestExists") else "",
            "openNotes": f"open {shell_quote(str(target.get('notesPath') or ''))}" if target.get("notesExists") else "",
            "makeDestinationFolder": f"mkdir -p {shell_quote(str(Path(normalized).parent))}" if normalized else "",
        },
        "nextSafestAction": "Transcribe the audio sidecar into raw provider output and normalized transcript sidecars, then rerun transcript readiness. Do not call the transcript canonical until reviewed.",
        "truth": "Transcript-intake routing only. It does not run ASR, create transcript truth, record review decisions, mutate media, publish, upload, schedule, or create receipt truth.",
    }


def render_markdown(payload: dict[str, Any]) -> str:
    destinations = payload.get("destinations", {}) if isinstance(payload.get("destinations"), dict) else {}
    lines = [
        "# Next transcript intake target",
        "",
        f"Generated: `{payload.get('generatedAt')}`",
        f"Short: `{payload.get('shortId')}`",
        f"Episode: `Episode {payload.get('episode')}`",
        f"Status: `{payload.get('status')}`",
        "",
        f"- Audio sidecar: `{payload.get('audioSidecarPath')}`",
        f"- Raw provider output: `{destinations.get('rawProviderOutput')}`",
        f"- Normalized transcript: `{destinations.get('normalizedTranscript')}`",
        f"- Caption draft SRT: `{destinations.get('captionDraftSrt')}`",
        f"- Caption draft VTT: `{destinations.get('captionDraftVtt')}`",
        "",
        "## Safe commands",
        "",
    ]
    for label, command in (payload.get("safeCommands") or {}).items():
        if command:
            lines.append(f"- {label}: `{command}`")
    lines.extend(["", "## Next safest action", "", str(payload.get("nextSafestAction") or ""), "", "## Truth boundary", "", str(payload.get("truth") or "")])
    return "\n".join(lines).rstrip() + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Select the next transcript-intake target.")
    parser.add_argument("--index", default=str(DEFAULT_INDEX_JSON))
    parser.add_argument("--short-id", default="")
    parser.add_argument("--format", choices=["markdown", "json"], default="markdown")
    parser.add_argument("--markdown", dest="format", action="store_const", const="markdown")
    parser.add_argument("--json", dest="format", action="store_const", const="json")
    args = parser.parse_args()

    payload = build_payload(Path(args.index).expanduser(), args.short_id)
    if args.format == "json":
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        print(render_markdown(payload), end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
