#!/usr/bin/env python3
"""Build a local shorts review cockpit from packaged release-root exports.

This is a reviewer-facing artifact. It reads the local shorts export board,
probes each rendered short, creates optional local poster frames, and writes a
calm HTML cockpit plus a decision-template JSON. It does not approve, publish,
upload, schedule, mutate review state, delete, overwrite, render new shorts, or
touch original media.
"""

from __future__ import annotations

import argparse
import csv
import html
import json
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
DEFAULT_BOARD_NAME = "quipsly-shorts-local-export-board.json"
SCHEMA = "quipsly.shorts-review-cockpit.v1"
DECISION_STATUS_MAP = {
    "keep": "keep",
    "approve": "keep",
    "approved": "keep",
    "publish": "keep",
    "queue": "keep",
    "refine": "refine",
    "revise": "refine",
    "needs-refinement": "refine",
    "needs-work": "refine",
    "needs-edit": "refine",
    "reject": "reject",
    "rejected": "reject",
    "skip": "reject",
    "needs-review": "needs-review",
    "needs_review": "needs-review",
    "": "needs-review",
}


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-shorts-review-cockpit")


def esc(value: Any) -> str:
    return html.escape(str(value or ""))


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def command_available(name: str) -> str:
    found = shutil.which(name)
    if found:
        return found
    for candidate in (
        Path("/opt/homebrew/bin") / name,
        Path("/usr/local/bin") / name,
        Path("/usr/bin") / name,
        Path("/bin") / name,
    ):
        if candidate.exists() and candidate.is_file():
            return str(candidate)
    return ""


def file_uri(path: Path) -> str:
    try:
        return path.expanduser().resolve().as_uri()
    except Exception:
        return ""


def safe_float(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def safe_slug(value: Any, fallback: str) -> str:
    text = "".join(ch if ch.isalnum() else "-" for ch in str(value or "").lower()).strip("-")
    while "--" in text:
        text = text.replace("--", "-")
    return text[:80] or fallback


def shell_quote(value: Any) -> str:
    return "'" + str(value).replace("'", "'\\''") + "'"


def resolve_board_path(value: str) -> tuple[Path, Path]:
    path = Path(value).expanduser()
    if path.is_dir():
        return path / DEFAULT_BOARD_NAME, path
    return path, path.parent


def choose_review_path(card: dict[str, Any]) -> Path:
    expected = Path(str(card.get("expectedLocalExportPath") or ""))
    if expected.exists():
        return expected
    primary = Path(str(card.get("primaryExportPath") or ""))
    if primary.exists():
        return primary
    for raw in card.get("allExportedPaths") or []:
        path = Path(str(raw or ""))
        if path.exists():
            return path
    return expected if str(expected) else primary


def session_for_episode(episode: int) -> str:
    known_sessions = {
        1: "episode-1-premiere-rescue",
        2: "episode-2-native-proof",
        3: "episode-3-premiere-rescue",
        4: "episode-4-sync-stack",
        5: "episode-5-sync-stack",
        6: "episode-6-sync-stack",
    }
    return known_sessions.get(episode, f"episode-{episode}-review")


def card_key(card: dict[str, Any]) -> str:
    path = str(card.get("expectedLocalExportPath") or card.get("primaryExportPath") or "").strip()
    if path:
        return path
    return f"{card.get('episodeKey') or ''}::{card.get('title') or ''}".lower()


def cards_from_release_manifests(release_root: Path) -> list[dict[str, Any]]:
    release_status = load_json(release_root / "release-status.json")
    rows = release_status.get("episodes") if isinstance(release_status.get("episodes"), list) else []
    if not rows:
        rows = [
            {"episode": int(path.name.split("_")[-1]), "versionDir": str(sorted(path.glob("v*"))[-1])}
            for path in sorted(release_root.glob("Episode_*"))
            if path.is_dir() and path.name.split("_")[-1].isdigit() and sorted(path.glob("v*"))
        ]
    cards: list[dict[str, Any]] = []
    for episode_row in rows:
        try:
            episode = int(episode_row.get("episode") or 0)
        except (TypeError, ValueError):
            continue
        version_dir = Path(str(episode_row.get("versionDir") or ""))
        manifest = load_json(version_dir / "manifest.json")
        shorts = manifest.get("shorts") if isinstance(manifest.get("shorts"), list) else []
        for index, short in enumerate(shorts, start=1):
            if not isinstance(short, dict):
                continue
            path = str(short.get("path") or "")
            title = str(short.get("title") or f"Episode {episode} Short {index}")
            cards.append({
                "id": short.get("id") or f"episode-{episode:02d}::{title}",
                "title": title,
                "packageShortIndex": index,
                "episodeKey": f"episode-{episode}",
                "episodeLabel": f"Episode {episode}",
                "sourceSessionName": session_for_episode(episode),
                "stage": "packaged-export",
                "reviewStatus": "needs-review",
                "listenThroughStatus": "not-reviewed",
                "sourceRangeLabel": short.get("sourceRangeLabel") or "",
                "segmentCount": short.get("segmentCount") or 1,
                "durationSeconds": short.get("durationSeconds"),
                "expectedLocalExportPath": path,
                "primaryExportPath": path,
                "allExportedPaths": [path] if path else [],
                "hookText": short.get("hookText") or "",
                "overlayText": short.get("overlayText") or "",
                "platformTargets": short.get("platformTargets") if isinstance(short.get("platformTargets"), list) else [
                    {"platform": "YouTube Shorts", "status": "candidate", "fitScore": ""},
                    {"platform": "Instagram", "status": "candidate", "fitScore": ""},
                    {"platform": "Facebook", "status": "candidate", "fitScore": ""},
                ],
            })
    return cards


def merged_short_cards(board_cards: list[dict[str, Any]], release_root: Path) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    manifest_cards = cards_from_release_manifests(release_root)
    board_count = len([card for card in board_cards if isinstance(card, dict)])
    if manifest_cards and board_count and board_count < len(manifest_cards):
        return manifest_cards, {
            "boardCards": board_count,
            "manifestCards": len(manifest_cards),
            "mergedCards": len(manifest_cards),
            "boardOverrides": 0,
            "source": "release-manifest-aggregate-ignored-stale-smaller-board",
            "why": "The root shorts board had fewer cards than the current versioned release manifests, so the cockpit used package manifests as the safer complete source.",
        }
    merged_by_key: dict[str, dict[str, Any]] = {}
    for card in manifest_cards:
        merged_by_key[card_key(card)] = card
    board_overrides = 0
    for card in board_cards:
        if not isinstance(card, dict):
            continue
        key = card_key(card)
        if key in merged_by_key:
            merged_by_key[key] = {**merged_by_key[key], **card}
            board_overrides += 1
        else:
            merged_by_key[key] = card
    merged = list(merged_by_key.values())
    merged.sort(key=lambda card: (str(card.get("episodeKey") or ""), int(card.get("packageShortIndex") or card.get("index") or 9999), str(card.get("title") or "")))
    return merged, {
        "boardCards": board_count,
        "manifestCards": len(manifest_cards),
        "mergedCards": len(merged),
        "boardOverrides": board_overrides,
        "source": "release-manifest-aggregate-with-board-overrides",
    }


def ffprobe_media(ffprobe_path: str, media_path: Path) -> dict[str, Any]:
    if not ffprobe_path or not media_path.exists():
        return {"available": False, "video": False, "audio": False, "durationSeconds": 0.0, "sizeBytes": 0}
    result = subprocess.run(
        [
            ffprobe_path,
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            str(media_path),
        ],
        text=True,
        capture_output=True,
        timeout=30,
        check=False,
    )
    payload: dict[str, Any] = {}
    if result.stdout:
        try:
            loaded = json.loads(result.stdout)
            payload = loaded if isinstance(loaded, dict) else {}
        except Exception:
            payload = {}
    streams = payload.get("streams") if isinstance(payload.get("streams"), list) else []
    video_streams = [stream for stream in streams if isinstance(stream, dict) and stream.get("codec_type") == "video"]
    audio_streams = [stream for stream in streams if isinstance(stream, dict) and stream.get("codec_type") == "audio"]
    first_video = video_streams[0] if video_streams else {}
    format_payload = payload.get("format") if isinstance(payload.get("format"), dict) else {}
    return {
        "available": result.returncode == 0,
        "returncode": result.returncode,
        "durationSeconds": safe_float(format_payload.get("duration")),
        "sizeBytes": int(format_payload.get("size") or 0),
        "video": bool(video_streams),
        "audio": bool(audio_streams),
        "width": int(first_video.get("width") or 0),
        "height": int(first_video.get("height") or 0),
        "videoCodec": first_video.get("codec_name") or "",
        "audioCodec": audio_streams[0].get("codec_name") if audio_streams else "",
        "stderr": result.stderr[-1200:] if result.stderr else "",
    }


def create_poster(ffmpeg_path: str, media_path: Path, output_path: Path, duration: float) -> dict[str, Any]:
    if not ffmpeg_path or not media_path.exists():
        return {"created": False, "reason": "ffmpeg or media missing", "path": str(output_path)}
    seek = max(0.1, min(duration * 0.28 if duration else 1.0, max(duration - 0.1, 0.1) if duration else 1.0))
    output_path.parent.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(
        [
            ffmpeg_path,
            "-hide_banner",
            "-loglevel",
            "error",
            "-ss",
            f"{seek:.3f}",
            "-i",
            str(media_path),
            "-frames:v",
            "1",
            "-q:v",
            "2",
            "-y",
            str(output_path),
        ],
        text=True,
        capture_output=True,
        timeout=45,
        check=False,
    )
    return {
        "created": result.returncode == 0 and output_path.exists(),
        "path": str(output_path),
        "uri": file_uri(output_path) if output_path.exists() else "",
        "seekSeconds": seek,
        "returncode": result.returncode,
        "stderr": result.stderr[-1200:] if result.stderr else "",
    }


def review_commands(card: dict[str, Any]) -> dict[str, str]:
    short_id = str(card.get("id") or "")
    title = str(card.get("title") or "short")
    quoted_id = short_id.replace("'", "'\\''")
    return {
        "keep": f"script/agentctl.sh shorts-review '{quoted_id}' keep 'listen-through passed; {title} is ready for platform packet review'",
        "refine": f"script/agentctl.sh shorts-review '{quoted_id}' refine 'listen-through found an issue; note trim/crop/audio/hook fix'",
        "reject": f"script/agentctl.sh shorts-review '{quoted_id}' reject 'not useful for publication; preserve as learning data'",
    }


def infer_review_session(row: dict[str, Any]) -> str:
    for key in ("sourceSessionName", "sessionName", "session"):
        value = str(row.get(key) or "").strip()
        if value:
            return value
    episode_key = str(row.get("episodeKey") or "").strip().lower()
    known_sessions = {
        "episode-1": "episode-1-premiere-rescue",
        "episode-2": "episode-2-native-proof",
        "episode-3": "episode-3-premiere-rescue",
        "episode-4": "episode-4-sync-stack",
        "episode-5": "episode-5-sync-stack",
        "episode-6": "episode-6-sync-stack",
    }
    return known_sessions.get(episode_key, "episode-1-premiere-rescue")


def normalize_decision_status(value: Any) -> str:
    text = str(value or "").strip().lower()
    return DECISION_STATUS_MAP.get(text, text or "needs-review")


def duration_band(seconds: float) -> str:
    if seconds <= 0:
        return "unknown-duration"
    if seconds < 8:
        return "too-short-for-most-social"
    if seconds <= 60:
        return "strong-short-window"
    if seconds <= 90:
        return "long-short-review"
    return "too-long-for-short-feed"


def humanize_short_title(value: Any, episode_key: str, index: int) -> str:
    text = str(value or "").strip()
    if not text:
        return f"{episode_key or 'episode'} short {index:02d}".replace("-", " ").title()
    sluggy = text.replace("_", "-")
    pieces = [piece for piece in sluggy.split("-") if piece]
    cleaned: list[str] = []
    for piece in pieces:
        lower = piece.lower()
        if lower in {"9x16", "short", "full", "release"}:
            continue
        if lower.startswith("episode") or lower.startswith("v00") or lower.isdigit():
            continue
        cleaned.append(piece)
    title = " ".join(cleaned).strip()
    return title[:96] or text[:96]


def caption_packet(row_like: dict[str, Any], seconds: float, aspect_fit: str, ready: bool) -> dict[str, Any]:
    episode_key = str(row_like.get("episodeKey") or "")
    display_title = humanize_short_title(row_like.get("title"), episode_key, int(row_like.get("index") or 0))
    hook = str(row_like.get("hookText") or "").strip()
    overlay = str(row_like.get("overlayText") or "").strip()
    base_caption = hook or overlay or f"{display_title} from High Ground Odyssey."
    tags = ["#HighGroundOdyssey", "#Leadership", "#PersonalGrowth", "#PodcastClips"]
    if "parkinson" in display_title.lower():
        tags.append("#ParkinsonsAwareness")
    if "write" in display_title.lower() or "reading" in display_title.lower():
        tags.append("#Writing")
    if "mentor" in display_title.lower() or "coach" in display_title.lower():
        tags.append("#Coaching")
    platforms = [
        {
            "platform": "YouTube Shorts",
            "status": "prep-ready" if ready and aspect_fit == "vertical-9x16" and seconds <= 60 else "review-fit",
            "titleDraft": display_title[:90],
            "captionDraft": f"{base_caption}\n\n{' '.join(tags[:5])}",
            "check": "Keep under 60 seconds when possible; verify the first second and caption/title match the actual moment.",
        },
        {
            "platform": "Instagram Reels",
            "status": "prep-ready" if ready and aspect_fit == "vertical-9x16" else "review-fit",
            "titleDraft": display_title[:80],
            "captionDraft": f"{base_caption}\n\n{' '.join(tags[:8])}",
            "check": "Verify framing, faces, and on-screen text are phone-readable.",
        },
        {
            "platform": "Facebook Reels",
            "status": "prep-ready" if ready and aspect_fit == "vertical-9x16" else "review-fit",
            "titleDraft": display_title[:80],
            "captionDraft": f"{base_caption}\n\n{' '.join(tags[:6])}",
            "check": "Prefer plain-language caption and clear value over cleverness.",
        },
        {
            "platform": "LinkedIn",
            "status": "selective-review",
            "titleDraft": display_title[:90],
            "captionDraft": f"{base_caption}\n\nA short reflection from the High Ground Odyssey project.",
            "check": "Use only if the clip has a professional, leadership, coaching, writing, or research angle.",
        },
    ]
    return {
        "displayTitle": display_title,
        "captionBase": base_caption,
        "hashtags": tags,
        "platforms": platforms,
        "truth": "Caption and platform packets are local drafts for review. They are not approval, scheduling, uploading, publishing, analytics, or receipt truth.",
    }


def platform_readiness(ready: bool, aspect_fit: str, seconds: float) -> dict[str, Any]:
    issues: list[str] = []
    if not ready:
        issues.append("local exported derivative is missing audio/video evidence")
    if aspect_fit != "vertical-9x16":
        issues.append("not confirmed as vertical 9:16")
    band = duration_band(seconds)
    if band in {"too-short-for-most-social", "too-long-for-short-feed", "unknown-duration"}:
        issues.append(band.replace("-", " "))
    status = "ready-for-watch-listen" if not issues else "needs-platform-review"
    return {
        "status": status,
        "durationBand": band,
        "issues": issues,
        "truth": "Platform readiness is local review guidance only. It is not approval, scheduling, uploading, publishing, or receipt truth.",
    }


def compact_short_row(row: dict[str, Any]) -> dict[str, Any]:
    probe = row.get("probe") if isinstance(row.get("probe"), dict) else {}
    commands = row.get("commands") if isinstance(row.get("commands"), dict) else {}
    platform_prep = row.get("platformPrep") if isinstance(row.get("platformPrep"), dict) else {}
    return {
        "index": row.get("index"),
        "id": row.get("id") or "",
        "episodeKey": row.get("episodeKey") or "",
        "title": row.get("title") or "",
        "displayTitle": row.get("displayTitle") or platform_prep.get("displayTitle") or "",
        "stage": row.get("stage") or "",
        "reviewStatus": row.get("reviewStatus") or "",
        "listenThroughStatus": row.get("listenThroughStatus") or "",
        "readyForListenThrough": bool(row.get("readyForListenThrough")),
        "needsAttention": bool(row.get("needsAttention")),
        "durationSeconds": probe.get("durationSeconds") or row.get("durationSeconds") or 0,
        "width": probe.get("width") or 0,
        "height": probe.get("height") or 0,
        "aspectFit": row.get("aspectFit") or "",
        "reviewPath": row.get("reviewPath") or "",
        "posterPath": ((row.get("poster") or {}).get("path") if isinstance(row.get("poster"), dict) else "") or "",
        "platforms": [
            {
                "platform": platform.get("platform") or "",
                "status": platform.get("status") or "",
                "titleDraft": platform.get("titleDraft") or "",
                "captionDraft": platform.get("captionDraft") or "",
                "check": platform.get("check") or "",
            }
            for platform in (platform_prep.get("platforms") if isinstance(platform_prep.get("platforms"), list) else [])
            if isinstance(platform, dict)
        ],
        "commands": {
            "openExport": commands.get("open-export") or "",
            "revealExport": commands.get("reveal-export") or "",
            "keep": commands.get("keep") or "",
            "refine": commands.get("refine") or "",
            "reject": commands.get("reject") or "",
        },
        "nextSafestAction": row.get("nextSafestAction") or "",
        "truth": "Compact local review row only. No approval, upload, schedule, publication, receipt capture, or source mutation occurred.",
    }


def build_short_start_queue(rows: list[dict[str, Any]], limit: int = 12) -> list[dict[str, Any]]:
    sorted_rows = sorted(
        rows,
        key=lambda row: (
            0 if row.get("needsAttention") else 1,
            str(row.get("episodeKey") or ""),
            int(row.get("index") or 9999),
        ),
    )
    return [
        {
            **compact_short_row(row),
            "rank": rank,
            "humanAsk": "Watch this short with sound on; decide keep, refine, reject, or needs-review.",
            "agentSafeParallelWork": "Prepare caption/platform drafts and dry-run review commands only. Do not post or mutate external state.",
        }
        for rank, row in enumerate(sorted_rows[:limit], start=1)
    ]


def summarize_by_episode(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        grouped.setdefault(str(row.get("episodeKey") or "unknown"), []).append(row)
    summary: list[dict[str, Any]] = []
    for episode_key, episode_rows in sorted(grouped.items()):
        summary.append({
            "episodeKey": episode_key,
            "shorts": len(episode_rows),
            "reviewable": sum(1 for row in episode_rows if row.get("readyForListenThrough")),
            "needsAttention": sum(1 for row in episode_rows if row.get("needsAttention")),
            "durationSeconds": round(sum(safe_float((row.get("probe") or {}).get("durationSeconds")) for row in episode_rows if isinstance(row.get("probe"), dict)), 2),
            "firstReviewPath": next((row.get("reviewPath") for row in episode_rows if row.get("reviewPath")), ""),
        })
    return summary


def build_decision_import_preview(decision_template: dict[str, Any]) -> dict[str, Any]:
    decisions = decision_template.get("decisions") if isinstance(decision_template.get("decisions"), list) else []
    planned: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []
    for decision in decisions:
        if not isinstance(decision, dict):
            skipped.append({"status": "skipped", "reason": "decision row is not an object"})
            continue
        candidate_id = str(decision.get("candidateId") or "").strip()
        session = str(decision.get("session") or decision.get("sessionName") or "").strip()
        title = str(decision.get("title") or "").strip()
        if "::" in candidate_id:
            parsed_session, parsed_title = candidate_id.split("::", 1)
            session = session or parsed_session.strip()
            title = title or parsed_title.strip()
        if not session or not title:
            skipped.append({
                "status": "skipped",
                "reason": "missing session or title",
                "candidateId": candidate_id,
                "session": session,
                "title": title,
            })
            continue
        planned.append({
            "status": "planned",
            "candidateId": candidate_id or f"{session}::{title}",
            "session": session,
            "title": title,
            "reviewStatus": normalize_decision_status(decision.get("status")),
            "notesPresent": bool(str(decision.get("notes") or "").strip()),
        })
    return {
        "model": "quipsly.shorts-review-import-preview.v1",
        "generatedAt": iso_now(),
        "sourceModel": decision_template.get("model") or "",
        "dryRunEquivalent": True,
        "plannedCount": len(planned),
        "skippedCount": len(skipped),
        "appliedCount": 0,
        "failedCount": 0,
        "planned": planned,
        "skipped": skipped,
        "truth": "Static importability preview for the generated decision template. It mirrors the importer fields but does not contact the app agent or mutate review state.",
    }


def normalize_card(card: dict[str, Any], index: int, ffprobe_path: str, ffmpeg_path: str, poster_dir: Path, make_posters: bool) -> dict[str, Any]:
    review_path = choose_review_path(card)
    probe = ffprobe_media(ffprobe_path, review_path)
    slug = safe_slug(card.get("title"), f"short-{index:02d}")
    poster = create_poster(ffmpeg_path, review_path, poster_dir / f"{index:02d}-{slug}.jpg", probe.get("durationSeconds") or 0) if make_posters else {"created": False}
    expected_duration = safe_float(card.get("durationSeconds"))
    probed_duration = safe_float(probe.get("durationSeconds"))
    duration_delta = abs(expected_duration - probed_duration) if expected_duration and probed_duration else 0.0
    stage = str(card.get("stage") or "")
    ready = bool(review_path.exists() and probe.get("video") and probe.get("audio"))
    needs_attention = (not review_path.exists()) or (not probe.get("video")) or (not probe.get("audio")) or duration_delta > 1.5
    width = int(probe.get("width") or 0)
    height = int(probe.get("height") or 0)
    aspect = (width / height) if width and height else 0.0
    aspect_fit = "vertical-9x16" if width and height and abs(aspect - (9 / 16)) < 0.035 else ("needs-crop-review" if width and height else "unknown")
    platform_targets = card.get("platformTargets") if isinstance(card.get("platformTargets"), list) else []
    commands = review_commands(card)
    if review_path.exists():
        commands.update({
            "open-export": f"open {shell_quote(review_path)}",
            "reveal-export": f"open -R {shell_quote(review_path)}",
            "contact-sheet": f"script/agentctl.sh shorts-contact-sheet {shell_quote(review_path)}",
        })
    platform_readiness_packet = platform_readiness(ready, aspect_fit, probed_duration or expected_duration)
    platform_prep = caption_packet({**card, "index": index}, probed_duration or expected_duration, aspect_fit, ready)
    review_rubric = [
        "First second makes sense without episode context.",
        "Audio is present, clear, synced, and not clipped.",
        "Crop/framing keeps faces or subject readable on a phone.",
        "Ending lands cleanly without an accidental cut-off.",
        "Hook, overlay text, and platform fit are strong enough to keep or clear enough to refine.",
    ]
    return {
        "index": index,
        "id": card.get("id") or "",
        "title": card.get("title") or f"Short {index}",
        "displayTitle": platform_prep["displayTitle"],
        "episodeKey": card.get("episodeKey") or "",
        "episodeLabel": card.get("episodeLabel") or "",
        "sourceSessionName": card.get("sourceSessionName") or card.get("sessionName") or card.get("session") or "",
        "stage": stage,
        "reviewStatus": card.get("reviewStatus") or "",
        "listenThroughStatus": card.get("listenThroughStatus") or "unknown",
        "sourceRangeLabel": card.get("sourceRangeLabel") or "",
        "segmentCount": card.get("segmentCount") or 0,
        "durationSeconds": expected_duration,
        "reviewFileName": review_path.name if review_path else "",
        "reviewFolder": str(review_path.parent) if review_path else "",
        "reviewPath": str(review_path),
        "reviewUri": file_uri(review_path) if review_path.exists() else "",
        "expectedLocalExportPath": card.get("expectedLocalExportPath") or "",
        "primaryExportPath": card.get("primaryExportPath") or "",
        "fileExists": review_path.exists(),
        "probe": probe,
        "aspectFit": aspect_fit,
        "poster": poster,
        "hookText": card.get("hookText") or "",
        "overlayText": card.get("overlayText") or "",
        "platformTargets": platform_targets,
        "platformCount": len(platform_targets),
        "platformReadiness": platform_readiness_packet,
        "platformPrep": platform_prep,
        "readyForListenThrough": ready,
        "needsAttention": needs_attention,
        "durationDeltaSeconds": duration_delta,
        "commands": commands,
        "reviewRubric": review_rubric,
        "humanAsk": "Watch this short with sound on and choose keep, refine, reject, or needs-review based on hook, audio, framing, ending, and platform fit.",
        "agentSafeParallelWork": "Prepare notes, thumbnails, platform metadata, and dry-run review imports only. Do not publish, upload, schedule, overwrite, delete, capture receipts, or mutate source media.",
        "nextSafestAction": (
            "Watch and listen through this short, then mark keep/refine/reject."
            if ready
            else "Fix missing/invalid local short evidence before review."
        ),
    }


def build_packet(board_path: Path, release_root: Path, make_posters: bool) -> dict[str, Any]:
    board = load_json(board_path)
    board_cards = board.get("cards") if isinstance(board.get("cards"), list) else []
    cards, source_summary = merged_short_cards(board_cards, release_root)
    session_dir = release_root / "review-board" / "shorts-review-cockpit" / stamp()
    ffprobe_path = command_available("ffprobe")
    ffmpeg_path = command_available("ffmpeg")
    poster_dir = session_dir / "posters"
    rows = [
        normalize_card(card, index, ffprobe_path, ffmpeg_path, poster_dir, make_posters)
        for index, card in enumerate(cards, start=1)
        if isinstance(card, dict)
    ]
    compact_rows = [compact_short_row(row) for row in rows]
    start_here_queue = build_short_start_queue(rows)
    by_episode = summarize_by_episode(rows)
    counts = {
        "shorts": len(rows),
        "reviewable": sum(1 for row in rows if row["readyForListenThrough"]),
        "needsAttention": sum(1 for row in rows if row["needsAttention"]),
        "missingFiles": sum(1 for row in rows if not row["fileExists"]),
        "withAudio": sum(1 for row in rows if row["probe"].get("audio")),
        "withVideo": sum(1 for row in rows if row["probe"].get("video")),
        "durationWarnings": sum(1 for row in rows if row["durationDeltaSeconds"] > 1.5),
        "postersCreated": sum(1 for row in rows if row["poster"].get("created")),
        "platformPrepRows": sum(len((row.get("platformPrep") or {}).get("platforms") or []) for row in rows),
        "externalPublishing": False,
        "reviewStateMutated": False,
        "originalsMutated": False,
    }
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": "shorts-review-cockpit-ready" if counts["reviewable"] else "shorts-review-cockpit-needs-evidence",
        "releaseRoot": str(release_root),
        "boardPath": str(board_path),
        "sourceSummary": source_summary,
        "sessionDir": str(session_dir),
        "truth": "Shorts review cockpit only. It probes and displays local exported derivatives for watch/listen review. It does not approve, publish, upload, schedule, capture receipts, mutate review state, overwrite versions, or touch original media.",
        "tools": {"ffprobe": ffprobe_path, "ffmpeg": ffmpeg_path},
        "counts": counts,
        "shorts": rows,
        "rows": compact_rows,
        "startHereQueue": start_here_queue,
        "byEpisode": by_episode,
        "platformPrepContract": {
            "draftsAreLocalOnly": True,
            "approvalIsSeparate": True,
            "receiptTruthRequiresExternalProof": True,
            "summary": "Short title, caption, hashtag, and platform-fit drafts help reviewers move faster, but they do not publish, schedule, approve, or create receipt truth.",
        },
        "nextSafestAction": "Open the cockpit, review each exported short with sound on, then record keep/refine/reject only after human/agent watch-listen judgment.",
        "safety": {
            "originalsMutated": False,
            "sourceDeletes": False,
            "versionOverwrites": False,
            "externalPublishing": False,
            "reviewStateMutated": False,
            "receiptTruthCreated": False,
        },
    }


def write_csv(path: Path, packet: dict[str, Any]) -> None:
    rows = packet.get("shorts") if isinstance(packet.get("shorts"), list) else []
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=[
            "index", "episodeKey", "title", "stage", "reviewStatus", "readyForListenThrough",
            "needsAttention", "durationSeconds", "probeDurationSeconds", "width", "height", "audio", "aspectFit", "humanAsk", "reviewPath",
        ])
        writer.writeheader()
        for row in rows:
            probe = row.get("probe") if isinstance(row.get("probe"), dict) else {}
            writer.writerow({
                "index": row.get("index"),
                "episodeKey": row.get("episodeKey"),
                "title": row.get("title"),
                "stage": row.get("stage"),
                "reviewStatus": row.get("reviewStatus"),
                "readyForListenThrough": row.get("readyForListenThrough"),
                "needsAttention": row.get("needsAttention"),
                "durationSeconds": row.get("durationSeconds"),
                "probeDurationSeconds": probe.get("durationSeconds"),
                "width": probe.get("width"),
                "height": probe.get("height"),
                "audio": probe.get("audio"),
                "aspectFit": row.get("aspectFit"),
                "humanAsk": row.get("humanAsk"),
                "reviewPath": row.get("reviewPath"),
            })


def write_decision_template(path: Path, packet: dict[str, Any]) -> dict[str, Any]:
    decisions = []
    for row in packet.get("shorts") or []:
        session_name = infer_review_session(row)
        title = str(row.get("title") or "").strip()
        decisions.append({
            "candidateId": f"{session_name}::{title}",
            "session": session_name,
            "sessionName": session_name,
            "title": title,
            "status": "needs-review",
            "allowedStatuses": ["keep", "refine", "reject", "needs-review"],
            "notes": "",
            "shortClipId": row.get("id"),
            "index": row.get("index"),
            "episodeKey": row.get("episodeKey"),
            "currentReviewStatus": row.get("reviewStatus"),
            "listenThroughStatus": row.get("listenThroughStatus"),
            "exportStatus": "exported" if row.get("fileExists") else "missing",
            "exportPath": row.get("reviewPath"),
            "exportExists": row.get("fileExists"),
            "recipeDurationSeconds": row.get("durationSeconds"),
            "probedDurationSeconds": (row.get("probe") or {}).get("durationSeconds") if isinstance(row.get("probe"), dict) else 0,
            "durationDeltaSeconds": row.get("durationDeltaSeconds"),
            "sourceRangeLabel": row.get("sourceRangeLabel"),
            "segmentCount": row.get("segmentCount"),
            "hookText": row.get("hookText"),
            "overlayText": row.get("overlayText"),
            "aspectFit": row.get("aspectFit"),
            "humanAsk": row.get("humanAsk"),
            "reviewRubric": row.get("reviewRubric"),
            "agentSafeParallelWork": row.get("agentSafeParallelWork"),
            "reviewedBy": "",
            "reviewedAt": "",
            "sourceReviewPath": row.get("reviewPath"),
            "instruction": "Change status to keep, refine, reject, or needs-review. Dry-run with agentctl review-shorts-import before executing. Keep is the only status that should flow toward reviewed social queues.",
        })
    payload = {
        "model": "quipsly-review-shorts-decisions",
        "schema": "quipsly.shorts-review-decisions-template.v2",
        "version": "2026-06-25.shorts-review-cockpit-importable.v1",
        "generatedAt": iso_now(),
        "exportedAt": packet.get("generatedAt") or iso_now(),
        "sourceManifest": str(path.with_name("shorts-review-cockpit.json")),
        "truth": "Template only. Filling this file does not mutate app review state until explicitly imported/executed. Run review-shorts-import without --execute first.",
        "allowedStatuses": ["keep", "refine", "reject", "needs-review"],
        "importCommandDryRun": f"script/agentctl.sh review-shorts-import {shell_quote(path)}",
        "importCommandExecute": f"script/agentctl.sh review-shorts-import {shell_quote(path)} --execute --save",
        "decisions": decisions,
    }
    write_json(path, payload)
    return payload


def render_html(packet: dict[str, Any]) -> str:
    counts = packet.get("counts") if isinstance(packet.get("counts"), dict) else {}
    import_preview = packet.get("decisionImportPreview") if isinstance(packet.get("decisionImportPreview"), dict) else {}
    dry_run_command = str(packet.get("reviewImportDryRunCommand") or "")
    execute_command = str(packet.get("reviewImportExecuteCommand") or "")
    count_cards = "".join(
        f"<article><strong>{esc(value)}</strong><span>{esc(label)}</span></article>"
        for label, value in [
            ("shorts", counts.get("shorts", 0)),
            ("reviewable", counts.get("reviewable", 0)),
            ("needs attention", counts.get("needsAttention", 0)),
            ("with audio", counts.get("withAudio", 0)),
            ("posters", counts.get("postersCreated", 0)),
            ("import planned", import_preview.get("plannedCount", 0)),
            ("import skipped", import_preview.get("skippedCount", 0)),
        ]
    )
    cards = []
    for row in packet.get("shorts") or []:
        probe = row.get("probe") if isinstance(row.get("probe"), dict) else {}
        poster = row.get("poster") if isinstance(row.get("poster"), dict) else {}
        commands = row.get("commands") if isinstance(row.get("commands"), dict) else {}
        video_html = (
            f"<video controls preload=\"metadata\" poster=\"{esc(poster.get('uri'))}\" src=\"{esc(row.get('reviewUri'))}\"></video>"
            if row.get("reviewUri")
            else "<div class=\"missing\">No local short file found.</div>"
        )
        platforms = row.get("platformTargets") if isinstance(row.get("platformTargets"), list) else []
        platform_readiness = row.get("platformReadiness") if isinstance(row.get("platformReadiness"), dict) else {}
        readiness_issues = platform_readiness.get("issues") if isinstance(platform_readiness.get("issues"), list) else []
        platform_html = "".join(
            f"<li><strong>{esc(target.get('platform') if isinstance(target, dict) else '')}</strong>: {esc(target.get('status') if isinstance(target, dict) else '')} · fit {esc(target.get('fitScore') if isinstance(target, dict) else '')}</li>"
            for target in platforms[:8]
        )
        readiness_html = "".join(f"<li>{esc(issue)}</li>" for issue in readiness_issues)
        command_html = "".join(
            f"<div><label>{esc(label)}</label><code>{esc(command)}</code></div>"
            for label, command in commands.items()
            if command
        )
        rubric_html = "".join(
            f"<li>{esc(item)}</li>"
            for item in row.get("reviewRubric") or []
        )
        cards.append(f"""
        <article class="short {'attention' if row.get('needsAttention') else 'ready'}">
          <section class="player">
            {video_html}
          </section>
          <section class="details">
            <p class="eyebrow">#{esc(row.get('index'))} · {esc(row.get('episodeKey'))} · {esc(row.get('stage'))}</p>
            <h2>{esc(row.get('displayTitle') or row.get('title'))}</h2>
            <p>{esc(row.get('nextSafestAction'))}</p>
            <div class="facts">
              <span>{esc(round(float(probe.get('durationSeconds') or 0), 2))}s actual</span>
              <span>{esc(probe.get('width'))}x{esc(probe.get('height'))}</span>
              <span>{esc(row.get('aspectFit'))}</span>
              <span>{esc(platform_readiness.get('durationBand'))}</span>
              <span>{esc(platform_readiness.get('status'))}</span>
              <span>audio: {esc(probe.get('audio'))}</span>
              <span>expected: {esc(row.get('durationSeconds'))}s</span>
            </div>
            <h3>Exact local export</h3>
            <p><strong>{esc(row.get('reviewFileName'))}</strong></p>
            <code>{esc(row.get('reviewPath'))}</code>
            <h3>Platform readiness</h3>
            <p>{esc(platform_readiness.get('truth'))}</p>
            <ul>{readiness_html or '<li>Ready for watch/listen review before any platform approval.</li>'}</ul>
            <h3>Human ask</h3>
            <p>{esc(row.get('humanAsk'))}</p>
            <h3>Why it might work</h3>
            <p><strong>Hook:</strong> {esc(row.get('hookText'))}</p>
            <p><strong>Overlay:</strong> {esc(row.get('overlayText'))}</p>
            <h3>Platform fit</h3>
            <ul>{platform_html or '<li>No platform target metadata found.</li>'}</ul>
            <h3>Caption drafts</h3>
            <p>{esc(((row.get('platformPrep') or {}).get('truth') if isinstance(row.get('platformPrep'), dict) else '') or '')}</p>
            <ul>{''.join(f"<li><strong>{esc(platform.get('platform'))}</strong>: {esc(platform.get('captionDraft'))}</li>" for platform in (((row.get('platformPrep') or {}).get('platforms') if isinstance(row.get('platformPrep'), dict) else []) or []) if isinstance(platform, dict))}</ul>
            <h3>Listen-through checklist</h3>
            <ul>{rubric_html}</ul>
            <h3>Agent-safe parallel work</h3>
            <p>{esc(row.get('agentSafeParallelWork'))}</p>
            <h3>Safe commands</h3>
            <div class="commands">{command_html}</div>
          </section>
        </article>
        """)
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Quipsly Shorts Review Cockpit</title>
<style>
:root {{
  color-scheme: dark;
  --cedar: #201812;
  --soil: #302518;
  --moss: #4f6f46;
  --leaf: #8fbd72;
  --sun: #f5c95f;
  --cream: #f6ead2;
  --muted: #b9aa8c;
  --line: rgba(246, 234, 210, .16);
  --clay: #b15f43;
}}
* {{ box-sizing: border-box; }}
body {{
  margin: 0;
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: var(--cream);
  background:
    radial-gradient(circle at 10% 5%, rgba(143,189,114,.18), transparent 28rem),
    radial-gradient(circle at 90% 8%, rgba(245,201,95,.13), transparent 26rem),
    linear-gradient(135deg, #111810, var(--cedar));
}}
main {{ max-width: 1440px; margin: 0 auto; padding: 34px 24px 72px; }}
.hero {{ border: 1px solid var(--line); border-radius: 28px; padding: 28px; background: rgba(32,24,18,.72); box-shadow: 0 24px 90px rgba(0,0,0,.35); }}
.eyebrow {{ margin: 0 0 8px; color: var(--sun); text-transform: uppercase; letter-spacing: .2em; font-size: .72rem; font-weight: 900; }}
h1 {{ margin: 0; font-size: clamp(2.4rem, 6vw, 5.8rem); line-height: .88; letter-spacing: -.07em; }}
h2 {{ margin: 0 0 8px; font-size: 1.45rem; }}
h3 {{ margin: 18px 0 8px; color: var(--leaf); font-size: .82rem; text-transform: uppercase; letter-spacing: .13em; }}
p, li {{ color: var(--muted); }}
.counts {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-top: 22px; }}
.counts article {{ border: 1px solid var(--line); border-radius: 18px; padding: 14px; background: rgba(255,255,255,.05); }}
.counts strong {{ display: block; color: var(--sun); font-size: 2.1rem; }}
.counts span {{ color: var(--muted); text-transform: uppercase; letter-spacing: .08em; font-size: .74rem; }}
.shorts {{ display: grid; gap: 18px; margin-top: 24px; }}
.short {{ display: grid; grid-template-columns: minmax(280px, .95fr) minmax(320px, 1.2fr); gap: 20px; border: 1px solid var(--line); border-radius: 26px; padding: 18px; background: rgba(20,28,18,.72); }}
.short.attention {{ border-color: rgba(177,95,67,.65); }}
video {{ width: 100%; max-height: 72vh; border-radius: 18px; background: #060806; border: 1px solid rgba(245,201,95,.25); }}
.facts {{ display: flex; flex-wrap: wrap; gap: 8px; }}
.facts span {{ border: 1px solid var(--line); border-radius: 999px; padding: 6px 10px; color: var(--cream); background: rgba(255,255,255,.06); font-size: .8rem; }}
code {{ display: block; white-space: pre-wrap; overflow-wrap: anywhere; padding: 9px 10px; border-radius: 12px; background: rgba(0,0,0,.32); color: #fff1a4; border: 1px solid rgba(245,201,95,.18); font-size: .78rem; }}
label {{ display: block; margin: 8px 0 4px; color: var(--sun); text-transform: uppercase; letter-spacing: .12em; font-weight: 900; font-size: .68rem; }}
.import-commands {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 12px; margin-top: 16px; }}
.import-commands div {{ border: 1px solid var(--line); border-radius: 16px; padding: 12px; background: rgba(0,0,0,.20); }}
.import-commands strong {{ color: var(--sun); }}
.missing {{ min-height: 320px; border-radius: 18px; display: grid; place-items: center; background: rgba(177,95,67,.15); color: var(--cream); border: 1px solid rgba(177,95,67,.45); }}
@media (max-width: 980px) {{ .short {{ grid-template-columns: 1fr; }} }}
</style>
</head>
<body>
<main>
<section class="hero">
<p class="eyebrow">Quipsly Studio · Shorts review</p>
<h1>Watch with sound. Decide with evidence.</h1>
<p>{esc(packet.get('truth'))}</p>
<div class="counts">{count_cards}</div>
<p><strong>Decision sheet:</strong> {esc(import_preview.get('plannedCount', 0))} planned, {esc(import_preview.get('skippedCount', 0))} skipped, 0 applied. Run the dry-run command before executing any review import.</p>
<div class="import-commands">
  <div>
    <strong>1. Preview review import</strong>
    <code>{esc(dry_run_command)}</code>
    <p>Dry-run only. It checks which short decisions would import without changing app review state.</p>
  </div>
  <div>
    <strong>2. Execute only after preview</strong>
    <code>{esc(execute_command)}</code>
    <p>Writes short recipe review metadata in the local app session only. Still not upload, publish, schedule, receipt truth, export, or source mutation.</p>
  </div>
</div>
<p><strong>Next safest action:</strong> {esc(packet.get('nextSafestAction'))}</p>
</section>
<section class="shorts">{''.join(cards)}</section>
</main>
</body>
</html>
"""


def write_outputs(packet: dict[str, Any]) -> dict[str, str]:
    session_dir = Path(str(packet.get("sessionDir") or ""))
    json_path = session_dir / "shorts-review-cockpit.json"
    html_path = session_dir / "index.html"
    md_path = session_dir / "START-HERE-shorts-review-cockpit.md"
    csv_path = session_dir / "shorts-review-cockpit.csv"
    decision_path = session_dir / "shorts-review-decisions-template.json"
    decision_template = write_decision_template(decision_path, packet)
    packet["decisionImportPreview"] = build_decision_import_preview(decision_template)
    packet["decisionTemplatePath"] = str(decision_path)
    packet["reviewImportDryRunCommand"] = decision_template.get("importCommandDryRun") or f"script/agentctl.sh review-shorts-import {shell_quote(decision_path)}"
    packet["reviewImportExecuteCommand"] = decision_template.get("importCommandExecute") or f"script/agentctl.sh review-shorts-import {shell_quote(decision_path)} --execute --save"
    packet["jsonPath"] = str(json_path)
    packet["htmlPath"] = str(html_path)
    packet["markdownPath"] = str(md_path)
    packet["csvPath"] = str(csv_path)
    packet["firstSafeAction"] = {
        "label": "Open Shorts Review Cockpit",
        "path": str(html_path),
        "command": f"open {shell_quote(str(html_path))}",
        "safety": "Opens local shorts review evidence only. No publish, upload, schedule, overwrite, delete, review-state mutation, source mutation, or receipt capture.",
    }
    write_json(json_path, packet)
    write_csv(csv_path, packet)
    html_path.write_text(render_html(packet), encoding="utf-8")
    counts = packet.get("counts") if isinstance(packet.get("counts"), dict) else {}
    md_path.write_text(
        "\n".join([
            "# Quipsly Shorts Review Cockpit",
            "",
            str(packet.get("truth") or ""),
            "",
            f"- Shorts: `{counts.get('shorts', 0)}`",
            f"- Reviewable: `{counts.get('reviewable', 0)}`",
            f"- Needs attention: `{counts.get('needsAttention', 0)}`",
            f"- With audio: `{counts.get('withAudio', 0)}`",
            f"- Posters created: `{counts.get('postersCreated', 0)}`",
            "",
            "## Review import commands",
            "",
            "Dry-run first. Execute only after the preview matches the intended keep/refine/reject decisions.",
            "",
            "```bash",
            str(packet.get("reviewImportDryRunCommand") or ""),
            "```",
            "",
            "```bash",
            str(packet.get("reviewImportExecuteCommand") or ""),
            "```",
            "",
            "## Next safest action",
            "",
            str(packet.get("nextSafestAction") or ""),
            "",
        ]),
        encoding="utf-8",
    )
    return {
        "jsonPath": str(json_path),
        "htmlPath": str(html_path),
        "markdownPath": str(md_path),
        "csvPath": str(csv_path),
        "decisionTemplatePath": str(decision_path),
    }


def write_latest_pointer(release_root: Path, packet: dict[str, Any], outputs: dict[str, str]) -> None:
    pointer = {
        "schema": "quipsly.latest-shorts-review-cockpit.v1",
        "updatedAt": iso_now(),
        "status": packet.get("status") or "",
        **outputs,
        "counts": packet.get("counts") or {},
        "truth": packet.get("truth") or "",
        "humanAsk": "Watch each exported short with sound on and choose keep, refine, reject, or needs-review based on hook, audio, framing, ending, and platform fit.",
        "agentSafeParallelWork": "Prepare notes, thumbnails, platform metadata, and dry-run review imports only. Do not publish, upload, schedule, overwrite, delete, capture receipts, mutate review state, or touch source media.",
        "reviewContract": [
            "A short being exported locally is not the same as being approved.",
            "Keep/refine/reject decisions should come after watch-listen review with sound on.",
            "Dry-run review import comes before any local review-state write.",
            "Platform packets and receipt slots remain preparation until explicit publishing approval and real receipts exist.",
        ],
        "rows": [compact_short_row(row) for row in (packet.get("shorts") or []) if isinstance(row, dict)],
        "startHereQueue": packet.get("startHereQueue") or [],
        "byEpisode": packet.get("byEpisode") or [],
        "platformPrepContract": packet.get("platformPrepContract") or {},
        "nextSafestAction": packet.get("nextSafestAction") or "",
        "firstSafeAction": packet.get("firstSafeAction") or {},
        "reviewImportDryRunCommand": packet.get("reviewImportDryRunCommand") or "",
        "reviewImportExecuteCommand": packet.get("reviewImportExecuteCommand") or "",
        "decisionImportPreview": packet.get("decisionImportPreview") or {},
        "externalPublishing": False,
        "reviewStateMutated": False,
        "originalsMutated": False,
    }
    write_json(release_root / "latest-shorts-review-cockpit.json", pointer)
    write_json(release_root / "review-board" / "shorts-review-cockpit" / "latest-shorts-review-cockpit.json", pointer)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("board", nargs="?", default=str(DEFAULT_RELEASE_ROOT / DEFAULT_BOARD_NAME), help="Shorts local export board JSON or release root")
    parser.add_argument("--release-root", default="")
    parser.add_argument("--no-posters", action="store_true")
    args = parser.parse_args()
    board_path, inferred_release_root = resolve_board_path(args.board)
    release_root = Path(args.release_root).expanduser() if args.release_root else inferred_release_root
    packet = build_packet(board_path, release_root, make_posters=not args.no_posters)
    outputs = write_outputs(packet)
    write_latest_pointer(release_root, packet, outputs)
    print(json.dumps({
        "status": packet.get("status"),
        "counts": packet.get("counts"),
        **outputs,
        "nextSafestAction": packet.get("nextSafestAction"),
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
