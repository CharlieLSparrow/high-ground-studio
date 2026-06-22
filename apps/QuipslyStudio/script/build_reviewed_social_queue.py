#!/usr/bin/env python3
"""Export reviewed native short recipes into a social publication queue manifest.

This bridges the QuipslyStudio native short queue to the existing social master /
ready-packet tooling. It exports only explicitly reviewed statuses by default,
then writes a quipsly-social-publication-queue JSON with derivative MP4 paths.

It never mutates source media and never changes edit decisions.
"""
from __future__ import annotations

import argparse
import json
import re
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_AGENT_URL = "http://127.0.0.1:8080"
PLATFORMS = ["YouTube Shorts", "Instagram", "Facebook", "LinkedIn"]


def get_json(base_url: str, path: str, timeout: float = 30) -> dict[str, Any]:
    with urllib.request.urlopen(f"{base_url.rstrip('/')}{path}", timeout=timeout) as response:
        payload = json.loads(response.read().decode("utf-8"))
    if not isinstance(payload, dict):
        raise RuntimeError(f"Expected JSON object from {path}")
    return payload


def command(base_url: str, path: str, timeout: float = 30) -> dict[str, Any]:
    return get_json(base_url, path, timeout=timeout)


def wait_for(base_url: str, predicate, timeout: float = 240, interval: float = 0.5) -> dict[str, Any]:
    deadline = time.time() + timeout
    last: dict[str, Any] = {}
    while time.time() < deadline:
        last = get_json(base_url, "/state")
        if predicate(last):
            return last
        time.sleep(interval)
    return last


def slugify(value: str) -> str:
    value = value.lower().replace("'", "")
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    return value[:80] or "clip"


def safe_float(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def seconds_to_srt(seconds: float) -> str:
    total_milliseconds = max(0, int(round(seconds * 1000)))
    milliseconds = total_milliseconds % 1000
    total_seconds = total_milliseconds // 1000
    seconds_part = total_seconds % 60
    total_minutes = total_seconds // 60
    minutes_part = total_minutes % 60
    hours_part = total_minutes // 60
    return f"{hours_part:02d}:{minutes_part:02d}:{seconds_part:02d},{milliseconds:03d}"


def normalize_statuses(raw: str) -> set[str]:
    values = [item.strip().lower() for item in raw.split(",") if item.strip()]
    return set(values or ["keep"])


def selected_export_path(state: dict[str, Any]) -> str:
    export_state = state.get("exportState") or {}
    paths = export_state.get("outputPaths") or []
    for path in paths:
        if isinstance(path, str) and path.endswith(".mp4"):
            return path
    return ""


def platform_copy(title: str, notes: str, platform: str) -> str:
    base = notes.strip() or title
    tags = "#HighGroundOdyssey #Podcast #Storytelling"
    if platform == "YouTube Shorts":
        return f"{title}\n\n{base}\n\n{tags} #Shorts"
    if platform == "Instagram":
        return f"{title}\n\n{base}\n\n{tags} #Reels"
    if platform == "Facebook":
        return f"{title}\n\n{base}\n\nWhat does this bring up for you?\n\n{tags}"
    if platform == "LinkedIn":
        return f"{title}\n\nA short reflection from High Ground Odyssey. {base}\n\n{tags}"
    return f"{title}\n\n{base}\n\n{tags}"


def build_queue(args: argparse.Namespace) -> dict[str, Any]:
    output = args.output.expanduser().resolve()
    exports_dir = output / "exports"
    platform_copy_dir = output / "platform-copy"
    captions_dir = output / "captions"
    for directory in (output, exports_dir, platform_copy_dir, captions_dir):
        directory.mkdir(parents=True, exist_ok=True)

    state = get_json(args.agent_url, "/state")
    if state.get("activeSessionName") != args.session:
        command(args.agent_url, "/load_session?name=" + urllib.parse.quote(args.session))
        state = wait_for(
            args.agent_url,
            lambda payload: payload.get("activeSessionName") == args.session and payload.get("laneCount", 0) > 0,
            timeout=args.wait_seconds,
            interval=0.25,
        )
    if state.get("activeSessionName") != args.session:
        raise RuntimeError(f"Session did not load: requested={args.session}, active={state.get('activeSessionName')}")

    queue = command(args.agent_url, "/shorts_queue")
    include_statuses = normalize_statuses(args.include_status)
    clips = []
    skipped = []
    for clip in queue.get("clips") or []:
        status = str(clip.get("reviewStatus") or "").strip().lower()
        if status not in include_statuses:
            skipped.append({"title": clip.get("title"), "reviewStatus": clip.get("reviewStatus"), "reason": "status-not-included"})
            continue
        clips.append(clip)

    if not clips:
        raise RuntimeError(f"No reviewed shorts matched statuses: {sorted(include_statuses)}")

    manifest_clips = []
    errors = []
    for rank, clip in enumerate(clips, start=1):
        clip_id = str(clip.get("id") or "")
        title = str(clip.get("title") or f"Reviewed short {rank}")
        slug = slugify(title)
        basename = f"{args.basename}-{rank:02d}-{slug}"
        if not clip_id:
            errors.append({"title": title, "error": "missing short id"})
            continue
        command(args.agent_url, "/shorts_queue_select?id=" + urllib.parse.quote(clip_id))
        selected = wait_for(
            args.agent_url,
            lambda payload, target=clip_id: (payload.get("selectedShortClip") or {}).get("id") == target,
            timeout=args.wait_seconds,
            interval=0.25,
        )
        if (selected.get("selectedShortClip") or {}).get("id") != clip_id:
            errors.append({"title": title, "id": clip_id, "error": "could not select short"})
            continue
        command(
            args.agent_url,
            "/shorts_export_selected?directory="
            + urllib.parse.quote(str(exports_dir))
            + "&basename="
            + urllib.parse.quote(basename),
            timeout=30,
        )
        exported = wait_for(
            args.agent_url,
            lambda payload: (payload.get("exportState") or {}).get("status") in {"completed", "failed", "blocked", "stalled"},
            timeout=args.export_timeout,
            interval=1,
        )
        export_state = exported.get("exportState") or {}
        if export_state.get("status") != "completed":
            errors.append({"title": title, "id": clip_id, "error": export_state.get("error") or export_state.get("status") or "export did not complete"})
            continue
        clip_path = selected_export_path(exported)
        if not clip_path or not Path(clip_path).exists():
            errors.append({"title": title, "id": clip_id, "error": f"export completed but output path missing: {clip_path}"})
            continue

        copy_path = platform_copy_dir / f"{rank:02d}-{slug}-copy.md"
        per_platform = {platform: platform_copy(title, str(clip.get("notes") or ""), platform) for platform in PLATFORMS}
        copy_path.write_text(
            "\n\n".join([f"# {title}", f"Review status: {clip.get('reviewStatus')}", f"Notes: {clip.get('notes') or 'Needs copy review.'}"] + [f"## {platform}\n{copy}" for platform, copy in per_platform.items()]) + "\n",
            encoding="utf-8",
        )
        caption_path = captions_dir / f"{rank:02d}-{slug}.srt"
        caption_text = str(clip.get("captionDraft") or clip.get("hookText") or title)
        caption_path.write_text(
            f"1\n00:00:00,000 --> {seconds_to_srt(max(1, safe_float(clip.get('duration'))))}\n{caption_text}\n",
            encoding="utf-8",
        )
        manifest_clips.append({
            "rank": rank,
            "queueIndex": rank,
            "reviewStatus": clip.get("reviewStatus") or "keep",
            "title": title,
            "hook": clip.get("hookText") or title,
            "roughTranscript": clip.get("captionDraft") or "",
            "duration": safe_float(clip.get("duration")),
            "sourceSequenceStartSeconds": clip.get("sequenceStartTime") or clip.get("startTime"),
            "sourceSequenceEndSeconds": clip.get("sequenceEndTime") or clip.get("endTime"),
            "sourceShortClipId": clip_id,
            "sourcePublishReceiptIds": [],
            "platformReceiptIds": {},
            "clipPath": clip_path,
            "thumbnailPath": "",
            "captionSrtPath": str(caption_path),
            "platformCopyPath": str(copy_path),
            "platformCopy": per_platform,
            "platforms": PLATFORMS,
            "humanCheck": "Watch once, confirm crop/captions/safe zones, then post or schedule manually and capture receipts.",
            "manualReviewChecklist": [
                "Watch exported short end to end.",
                "Confirm review status came from human approval or explicit Codex-assisted review.",
                "Confirm crop and text are safe for YouTube Shorts, Instagram, Facebook, and LinkedIn.",
                "Record final platform URLs back into Quipsly after posting.",
            ],
        })

    manifest = {
        "model": "quipsly-social-publication-queue",
        "version": "2026-06-18.reviewed-social-publication-queue.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "episode": args.episode_title,
        "sourceSession": args.session,
        "queueFolder": str(output),
        "publishingTruth": "Manual-upload-ready queue generated only from reviewed native short recipes. Nothing was uploaded or scheduled.",
        "sourcePolicy": "Uses rendered 9:16 derivative shorts only. Source media and edit decisions are untouched.",
        "platforms": PLATFORMS,
        "includedReviewStatuses": sorted(include_statuses),
        "manualUploadStatus": "ready-for-human-review-and-upload" if manifest_clips else "needs-approved-shorts",
        "clipCount": len(manifest_clips),
        "skipped": skipped,
        "errors": errors,
        "clips": manifest_clips,
    }
    manifest_path = output / f"{args.basename}-social-publication-queue.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    readme_path = output / "README.md"
    readme_path.write_text(
        "\n".join([
            f"# {args.episode_title} reviewed social queue",
            "",
            "Generated from native QuipslyStudio short review statuses.",
            "Original source media and edit decisions were not modified.",
            "",
            f"- Included statuses: {', '.join(sorted(include_statuses))}",
            f"- Exported clips: {len(manifest_clips)}",
            f"- Skipped clips: {len(skipped)}",
            f"- Errors: {len(errors)}",
            "",
            "Next: feed the JSON manifest to `script/agentctl.sh social-master-queue` or `script/agentctl.sh social-ready-packet`.",
        ]) + "\n",
        encoding="utf-8",
    )
    return {
        "status": "ready-for-social-master-queue" if manifest_clips and not errors else ("partial" if manifest_clips else "failed"),
        "manifestPath": str(manifest_path),
        "queueFolder": str(output),
        "clipCount": len(manifest_clips),
        "skippedCount": len(skipped),
        "errorCount": len(errors),
        "includedReviewStatuses": sorted(include_statuses),
        "truth": manifest["sourcePolicy"],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Export reviewed native short recipes into a social publication queue manifest.")
    parser.add_argument("--session", required=True)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--basename", default="reviewed-shorts")
    parser.add_argument("--episode-title", default="High Ground Odyssey reviewed shorts")
    parser.add_argument("--include-status", default="keep", help="Comma-separated reviewStatus values to export. Default: keep")
    parser.add_argument("--agent-url", default=DEFAULT_AGENT_URL)
    parser.add_argument("--wait-seconds", type=float, default=20)
    parser.add_argument("--export-timeout", type=float, default=240)
    args = parser.parse_args()
    try:
        result = build_queue(args)
    except Exception as error:  # noqa: BLE001 - operator tools should report calm JSON.
        print(json.dumps({"status": "error", "error": f"{type(error).__name__}: {error}"}, indent=2, sort_keys=True))
        return 1
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if result.get("clipCount", 0) > 0 and result.get("errorCount", 0) == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
