#!/usr/bin/env python3
"""Create a source-safe v002 candidate export from a refinement workorder.

This is a proof-oriented bridge from review metadata to a better derivative
short. It trims the existing reviewed derivative using transcript timing and
writes a new v002 candidate plus manifest. It never mutates originals and never
overwrites previous exports.
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from studio_short_refinement_workorder import (
    DEFAULT_QUEUE_POINTER,
    build_workorder,
    latest_queue,
    select_item,
)


DEFAULT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
SCHEMA = "quipsly.studio.short-v002-candidate-export.v1"
VERSION = "2026-07-03.v1"


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise SystemExit(f"Missing JSON: {path}")
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise SystemExit(f"Expected JSON object: {path}")
    return data


def slug(value: str) -> str:
    text = re.sub(r"[^A-Za-z0-9]+", "-", value).strip("-").lower()
    return text[:80] or "short"


def resolve_tool(name: str) -> str:
    path = shutil.which(name)
    if not path:
        raise SystemExit(f"{name} not found. Install ffmpeg tools before exporting v002 candidates.")
    return path


def words_from_transcript(path: str) -> list[dict[str, Any]]:
    if not path:
        return []
    data = load_json(Path(path))
    words: list[dict[str, Any]] = []
    for segment in data.get("segments", []) if isinstance(data.get("segments"), list) else []:
        if not isinstance(segment, dict):
            continue
        for word in segment.get("words", []) if isinstance(segment.get("words"), list) else []:
            if not isinstance(word, dict):
                continue
            token = str(word.get("word") or "").strip()
            if not token:
                continue
            words.append({
                "word": token,
                "norm": re.sub(r"[^a-z0-9]+", "", token.lower()),
                "start": float(word.get("start") or 0),
                "end": float(word.get("end") or 0),
            })
    return words


def phrase_tokens(phrase: str) -> list[str]:
    return [re.sub(r"[^a-z0-9]+", "", token.lower()) for token in phrase.split() if re.sub(r"[^a-z0-9]+", "", token.lower())]


def find_phrase_span(words: list[dict[str, Any]], phrase: str) -> tuple[float, float] | None:
    tokens = phrase_tokens(phrase)
    if not tokens or not words:
        return None
    # Match a distinctive prefix, not necessarily the whole ASR phrase.
    for length in range(min(len(tokens), 12), 3, -1):
        prefix = tokens[:length]
        for index in range(0, max(0, len(words) - length + 1)):
            if [str(word.get("norm") or "") for word in words[index:index + length]] == prefix:
                start = float(words[index].get("start") or 0)
                # Prefer ending at the full phrase if it fits, otherwise use prefix end.
                end_index = min(len(words) - 1, index + min(len(tokens), 34) - 1)
                return start, float(words[end_index].get("end") or start)
    return None


def choose_trim(workorder: dict[str, Any], words: list[dict[str, Any]], args: argparse.Namespace | None = None) -> dict[str, Any]:
    anchors = workorder.get("transcriptAnchors") if isinstance(workorder.get("transcriptAnchors"), dict) else {}
    target = workorder.get("durationTarget") if isinstance(workorder.get("durationTarget"), dict) else {}
    current_duration = float(workorder.get("currentDurationSeconds") or 0)
    target_seconds = float(target.get("targetSeconds") or min(25, current_duration or 25))
    hook = str(anchors.get("hookCandidate") or "")
    if args and args.hook_override:
        hook = str(args.hook_override)
    span = find_phrase_span(words, hook)
    start = 0.0
    end = min(current_duration, target_seconds) if current_duration else target_seconds
    reason = "Fallback trim: no transcript hook span matched, so use the beginning target range."
    if span:
        start = max(0.0, span[0] - 0.15)
        phrase_end = span[1] + 0.45
        desired_end = start + target_seconds
        # If the hook is late and a short complete thought remains, keep it short.
        if current_duration and current_duration - start <= target_seconds + 12:
            end = current_duration
            reason = "Hook candidate occurs late enough that the remaining clip is a compact v002 candidate."
        else:
            end = min(current_duration or desired_end, max(phrase_end, desired_end))
            reason = "Trim starts at transcript hook candidate and targets a compact complete-thought range."
    if end <= start + 3:
        end = min(current_duration or start + target_seconds, start + target_seconds)
        reason += " End expanded because the initial span was too short."
    if args and args.start_seconds is not None:
        start = max(0.0, float(args.start_seconds))
        reason = "Explicit trim override from hook rescue or reviewer command."
    if args and args.end_seconds is not None:
        end = min(current_duration or float(args.end_seconds), float(args.end_seconds))
        reason = "Explicit trim override from hook rescue or reviewer command."
    if args and args.reason_override:
        reason = str(args.reason_override)
    if end <= start:
        end = min(current_duration or start + target_seconds, start + target_seconds)
        reason += " End expanded because explicit trim ended before start."
    return {
        "startSeconds": round(start, 3),
        "endSeconds": round(end, 3),
        "durationSeconds": round(max(0.0, end - start), 3),
        "reason": reason,
        "hookCandidate": hook,
        "targetSeconds": target_seconds,
    }


def probe_media(path: Path, ffprobe: str) -> dict[str, Any]:
    proc = subprocess.run(
        [
            ffprobe,
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            str(path),
        ],
        text=True,
        capture_output=True,
    )
    if proc.returncode != 0:
        return {"ok": False, "error": (proc.stderr or proc.stdout)[-1200:]}
    data = json.loads(proc.stdout)
    streams = data.get("streams") if isinstance(data.get("streams"), list) else []
    return {
        "ok": True,
        "durationSeconds": float(data.get("format", {}).get("duration") or 0),
        "sizeBytes": int(data.get("format", {}).get("size") or 0),
        "width": next((stream.get("width") for stream in streams if stream.get("codec_type") == "video"), 0),
        "height": next((stream.get("height") for stream in streams if stream.get("codec_type") == "video"), 0),
        "hasAudio": any(stream.get("codec_type") == "audio" for stream in streams),
        "hasVideo": any(stream.get("codec_type") == "video" for stream in streams),
    }


def run_audio_sanity(path: Path, expected_duration: float) -> dict[str, Any]:
    script = Path(__file__).resolve().parent / "analyze_short_audio_sanity.py"
    if not script.exists():
        return {"status": "missing-script", "path": str(script)}
    proc = subprocess.run(
        [sys.executable, str(script), str(path), f"{expected_duration:.3f}"],
        text=True,
        capture_output=True,
    )
    if proc.returncode != 0:
        return {
            "status": "failed",
            "returncode": proc.returncode,
            "stdoutTail": proc.stdout[-1200:],
            "stderrTail": proc.stderr[-1200:],
            "truth": "Audio sanity attempted only. Failure is not publish/readiness proof.",
        }
    try:
        data = json.loads(proc.stdout)
        return data if isinstance(data, dict) else {"status": "invalid-json"}
    except json.JSONDecodeError:
        return {"status": "invalid-json", "stdoutTail": proc.stdout[-1200:], "stderrTail": proc.stderr[-1200:]}


def resolved_quality_warnings(warnings: list[Any], args: argparse.Namespace) -> tuple[list[str], list[dict[str, str]]]:
    """Return current-artifact warnings plus a history of warnings resolved by an explicit rescue.

    The weak-hook warning belongs to the original candidate/workorder. When a
    reviewer or agent gives an explicit in/out and replacement hook, the new
    derivative artifact should not keep teaching the queue that this candidate
    is weak. We keep a resolution record so the lineage stays inspectable.
    """
    current: list[str] = []
    history: list[dict[str, str]] = []
    explicit_rescue = bool(args.hook_override and args.start_seconds is not None and args.end_seconds is not None)
    for value in warnings:
        warning = str(value)
        if explicit_rescue and "Weak hook candidate" in warning:
            history.append({
                "warning": warning,
                "resolvedBy": "explicit hook rescue trim",
                "hookOverride": str(args.hook_override),
            })
            continue
        current.append(warning)
    return current, history


def render_candidate(workorder: dict[str, Any], trim: dict[str, Any], output_path: Path, ffmpeg: str) -> dict[str, Any]:
    source = Path(str(workorder.get("mediaPath") or ""))
    if not source.exists():
        return {"ok": False, "error": f"Source derivative missing: {source}"}
    if output_path.exists():
        return {"ok": False, "error": f"Output already exists; refusing to overwrite: {output_path}"}
    output_path.parent.mkdir(parents=True, exist_ok=True)
    command = [
        ffmpeg,
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        f"{float(trim['startSeconds']):.3f}",
        "-to",
        f"{float(trim['endSeconds']):.3f}",
        "-i",
        str(source),
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-c:a",
        "aac",
        "-b:a",
        "160k",
        "-movflags",
        "+faststart",
        "-n",
        str(output_path),
    ]
    proc = subprocess.run(command, text=True, capture_output=True)
    return {
        "ok": proc.returncode == 0 and output_path.exists(),
        "command": command,
        "commandString": " ".join(shell_quote(part) for part in command),
        "returncode": proc.returncode,
        "stdoutTail": proc.stdout[-1200:],
        "stderrTail": proc.stderr[-1200:],
    }


def render_markdown(payload: dict[str, Any]) -> str:
    trim = payload.get("trim") if isinstance(payload.get("trim"), dict) else {}
    out = payload.get("output") if isinstance(payload.get("output"), dict) else {}
    lines = [
        "# Short v002 candidate export",
        "",
        f"Short: `{payload.get('shortId')}`",
        f"Status: `{payload.get('status')}`",
        f"Output: `{out.get('path') or ''}`",
        "",
        "## Trim recipe",
        "",
        f"- Start: `{trim.get('startSeconds')}`",
        f"- End: `{trim.get('endSeconds')}`",
        f"- Duration: `{trim.get('durationSeconds')}`",
        f"- Reason: {trim.get('reason')}",
        f"- Hook: {trim.get('hookCandidate')}",
        "",
        "## Verification",
        "",
        "- Watch v002 with sound on.",
        "- Confirm the first two seconds have a clear hook.",
        "- Confirm the ending lands cleanly.",
        "- Confirm ASR-sensitive words before captions or publication copy.",
        "",
        "## Truth boundary",
        "",
        str(payload.get("truth") or ""),
    ]
    return "\n".join(lines).rstrip() + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Render a source-safe v002 short candidate from a refinement workorder.")
    parser.add_argument("--short-id", required=True, help="Short id from the refinement queue.")
    parser.add_argument("--queue-pointer", default=str(DEFAULT_QUEUE_POINTER))
    parser.add_argument("--output-root", default=str(DEFAULT_ROOT))
    parser.add_argument("--force-weak-hook", action="store_true", help="Allow export even when the workorder flags a weak hook.")
    parser.add_argument("--start-seconds", type=float, default=None, help="Explicit source-short start seconds for hook-rescue renders.")
    parser.add_argument("--end-seconds", type=float, default=None, help="Explicit source-short end seconds for hook-rescue renders.")
    parser.add_argument("--hook-override", default="", help="Explicit hook text for hook-rescue renders.")
    parser.add_argument("--reason-override", default="", help="Explicit trim reason for hook-rescue renders.")
    parser.add_argument("--dry-run", action="store_true", help="Create manifest plan only; do not run ffmpeg.")
    parser.add_argument("--format", choices=["markdown", "json"], default="markdown")
    parser.add_argument("--markdown", dest="format", action="store_const", const="markdown")
    parser.add_argument("--json", dest="format", action="store_const", const="json")
    args = parser.parse_args()

    ffmpeg = resolve_tool("ffmpeg")
    ffprobe = resolve_tool("ffprobe")
    queue = latest_queue(Path(args.queue_pointer).expanduser())
    queue_pointer = load_json(Path(args.queue_pointer).expanduser())
    item = select_item(queue, args.short_id)
    workorder = build_workorder(item, str(queue_pointer.get("jsonPath") or ""))
    source_warnings = workorder.get("qualityWarnings") if isinstance(workorder.get("qualityWarnings"), list) else []
    warnings, warning_history = resolved_quality_warnings(source_warnings, args)
    blocked = bool(warnings) and not args.force_weak_hook
    words = words_from_transcript(str(workorder.get("sidecars", {}).get("transcriptJson") or ""))
    trim = choose_trim(workorder, words, args)
    episode = int(workorder.get("episode") or 0)
    short_id = str(workorder.get("shortId") or args.short_id)
    output_dir = Path(args.output_root).expanduser() / f"Episode_{episode:02d}" / "v002" / "short-refinement-candidates" / short_id
    basename = f"{stamp_now()}-{short_id}-v002-candidate-{slug(str(workorder.get('title') or short_id))}"
    output_path = output_dir / f"{basename}.mp4"
    manifest_path = output_dir / f"{basename}.json"
    markdown_path = output_dir / f"{basename}.md"
    render = {"ok": False, "status": "blocked" if blocked else "dry-run"}
    probe: dict[str, Any] = {}
    audio_sanity: dict[str, Any] = {}
    if not blocked and not args.dry_run:
        render = render_candidate(workorder, trim, output_path, ffmpeg)
        if render.get("ok"):
            probe = probe_media(output_path, ffprobe)
            audio_sanity = run_audio_sanity(output_path, float(trim.get("durationSeconds") or 0))
    payload = {
        "schema": SCHEMA,
        "version": VERSION,
        "generatedAt": utc_now(),
        "status": "blocked-weak-hook" if blocked else ("v002-candidate-exported" if render.get("ok") else ("dry-run-ready" if args.dry_run else "v002-candidate-failed")),
        "shortId": short_id,
        "episode": episode,
        "sourceMediaPath": workorder.get("mediaPath"),
        "sourcePolicy": "Derivative v002 candidate from existing v001 short export. Original source media remains untouched; recipe metadata is written beside the candidate.",
        "targetVersion": "v002",
        "qualityWarnings": warnings,
        "qualityWarningHistory": warning_history,
        "trim": trim,
        "workorder": workorder,
        "output": {
            "path": str(output_path),
            "manifestPath": str(manifest_path),
            "markdownPath": str(markdown_path),
            "probe": probe,
            "audioSanity": audio_sanity,
        },
        "render": render,
        "truth": "Local derivative v002 candidate only. It does not mutate original source media, overwrite v001, publish, upload, schedule, approve, delete, normalize transcript truth, mutate accounts, or create receipt truth.",
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    markdown_path.write_text(render_markdown(payload), encoding="utf-8")
    latest_path = output_dir / "latest-v002-candidate.json"
    latest_path.write_text(json.dumps({"jsonPath": str(manifest_path), "markdownPath": str(markdown_path), "outputPath": str(output_path)}, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    if args.format == "json":
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        print(render_markdown(payload), end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
