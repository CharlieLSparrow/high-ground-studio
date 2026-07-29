#!/usr/bin/env python3
"""Create a metadata-only platform packet for the selected Quipsly short.

The packet is a local review artifact. It drafts platform-native titles,
captions, hooks, hashtags, and review notes, but it does not approve, schedule,
upload, publish, or mutate the selected short recipe.
"""
from __future__ import annotations

import argparse
import json
import re
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_BASE_URL = "http://127.0.0.1:8080"
DEFAULT_OUTPUT_ROOT = Path("/Volumes/My Passport/Quipsly/QuipslyExports/PlatformPackets")
SCHEMA = "quipsly.studio.selected-short-platform-packet.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def fetch_json(base_url: str, path: str, timeout: float = 5.0) -> dict[str, Any]:
    with urllib.request.urlopen(base_url.rstrip("/") + path, timeout=timeout) as response:
        data = json.loads(response.read().decode("utf-8", errors="replace"))
    if not isinstance(data, dict):
        raise ValueError(f"Expected JSON object from {path}")
    return data


def text(value: Any, fallback: str = "") -> str:
    if value is None:
        return fallback
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


def number(value: Any, fallback: float = 0) -> float:
    try:
        return float(value)
    except Exception:
        return fallback


def slug(value: str, fallback: str = "selected-short") -> str:
    cleaned = re.sub(r"[^A-Za-z0-9]+", "-", value).strip("-").lower()
    return cleaned[:80] or fallback


def truncate(value: str, limit: int) -> str:
    value = " ".join(value.split())
    if len(value) <= limit:
        return value
    return value[: max(0, limit - 1)].rstrip() + "..."


def hashtag_set(title: str, hook: str) -> list[str]:
    words = f"{title} {hook}".lower()
    tags = ["#HighGroundOdyssey", "#Podcast", "#Leadership", "#Storytelling"]
    if "remote" in words or "anywhere" in words or "travel" in words:
        tags.extend(["#RemoteWork", "#CreatorWorkflow"])
    if "mentor" in words or "coach" in words:
        tags.extend(["#Coaching", "#Mentorship"])
    if "rule" in words:
        tags.append("#TheWednesdayRule")
    deduped: list[str] = []
    for tag in tags:
        if tag not in deduped:
            deduped.append(tag)
    return deduped[:8]


def platform_variants(short: dict[str, Any]) -> list[dict[str, Any]]:
    title = text(short.get("title"), "Untitled short")
    hook = text(short.get("hook"), title)
    overlay = text(short.get("overlay"), title)
    caption = text(short.get("caption"), hook)
    tags = hashtag_set(title, hook)
    duration = number(short.get("durationSeconds"), 0)
    base_note = "Review the export before posting. This packet is metadata prep, not approval or publication truth."
    short_caption = caption if caption else hook
    variants = [
        {
            "platform": "YouTube Shorts",
            "title": truncate(overlay or title, 90),
            "caption": truncate(f"{hook}\n\n{short_caption}\n\n{' '.join(tags[:5])}", 450),
            "hashtags": tags[:5],
            "format": "9:16",
            "durationFit": "fits" if duration <= 60 else "review length; Shorts can allow longer but this may perform better trimmed",
            "nextReview": "Check first two seconds, face-safe captions, and whether the final line pays off the hook.",
            "receiptTruth": "not-uploaded",
        },
        {
            "platform": "Instagram Reels",
            "title": truncate(overlay or title, 80),
            "caption": truncate(f"{hook}\n\n{short_caption}\n\n{' '.join(tags[:7])}", 600),
            "hashtags": tags[:7],
            "format": "9:16",
            "durationFit": "strong" if 7 <= duration <= 45 else "review pacing for Reels",
            "nextReview": "Make the visual premise readable without sound, then verify captions do not cover faces.",
            "receiptTruth": "not-uploaded",
        },
        {
            "platform": "Facebook Reels",
            "title": truncate(overlay or title, 80),
            "caption": truncate(f"{hook}\n\n{short_caption}\n\n{' '.join(tags[:6])}", 650),
            "hashtags": tags[:6],
            "format": "9:16",
            "durationFit": "review",
            "nextReview": "Favor plain-language context and a clear reason to comment or share.",
            "receiptTruth": "not-uploaded",
        },
        {
            "platform": "LinkedIn",
            "title": truncate(title, 110),
            "caption": truncate(
                f"{hook}\n\nLeadership note: {short_caption}\n\nWhat would you change about the way this moment is framed?",
                900,
            ),
            "hashtags": [tag for tag in tags if tag not in {"#Podcast"}][:5],
            "format": "9:16 or embedded video",
            "durationFit": "review audience fit",
            "nextReview": "Make sure the caption frames a professional lesson, not just a clip tease.",
            "receiptTruth": "not-uploaded",
        },
        {
            "platform": "Patreon teaser",
            "title": truncate(title, 90),
            "caption": truncate(
                f"Early look from High Ground Odyssey: {hook}\n\nMembers can help us choose which moments deserve a full follow-up.",
                650,
            ),
            "hashtags": [],
            "format": "9:16 teaser",
            "durationFit": "review",
            "nextReview": "Decide whether this is public teaser copy or supporter-only context before posting.",
            "receiptTruth": "not-posted",
        },
        {
            "platform": "HighGroundOdyssey.com",
            "title": truncate(title, 100),
            "caption": truncate(f"{hook}\n\nClip note: {short_caption}", 750),
            "hashtags": [],
            "format": "episode page embed or clip card",
            "durationFit": "fits",
            "nextReview": "Connect this short to the episode page once the canonical page/URL exists.",
            "receiptTruth": "not-published",
        },
        {
            "platform": "Podcast episode companion",
            "title": truncate(title, 100),
            "caption": truncate(f"Companion clip idea: {hook}", 450),
            "hashtags": [],
            "format": "show notes / social companion",
            "durationFit": "n/a",
            "nextReview": "Use as a quote or moment marker in show notes after the audio episode is approved.",
            "receiptTruth": "not-used",
        },
    ]
    for variant in variants:
        variant["safetyNote"] = base_note
    return variants


def build_packet(base_url: str) -> dict[str, Any]:
    state = fetch_json(base_url, "/state")
    quality = fetch_json(base_url, "/selected_short_quality")
    selected = state.get("selectedShortClip") if isinstance(state.get("selectedShortClip"), dict) else {}
    selected_id = text(quality.get("selectedShortId") or state.get("selectedShortClipId") or selected.get("id"))
    title = text(quality.get("title") or selected.get("title"), "Untitled short")
    hook = text(quality.get("hook") or selected.get("hookText") or selected.get("hook"), title)
    overlay = text(quality.get("primaryOverlayText") or selected.get("primaryOverlayText") or selected.get("overlayText"), title)
    caption = text(quality.get("captionDraft") or selected.get("captionDraft") or selected.get("notes"), hook)
    duration = number(quality.get("recipeDuration") or selected.get("recipeDuration") or selected.get("duration"), 0)
    short = {
        "id": selected_id,
        "title": title,
        "hook": hook,
        "overlay": overlay,
        "caption": caption,
        "durationSeconds": duration,
        "reviewStatus": quality.get("reviewStatus") or selected.get("reviewStatus") or "",
        "exportStatus": quality.get("exportStatus") or selected.get("exportStatus") or "",
        "reviewClassLabel": quality.get("reviewClassLabel") or "",
    }
    variants = platform_variants(short)
    return {
        "schema": SCHEMA,
        "status": "selected_short_platform_packet",
        "generatedAt": iso_now(),
        "activeSessionName": text(state.get("activeSessionName")),
        "selectedShort": short,
        "platformVariants": variants,
        "readyCount": 0,
        "totalCount": len(variants),
        "nextSafeAction": "Review the export, then edit platform copy before any manual posting or Tower handoff.",
        "safeCommands": {
            "brief": "script/agentctl.sh shorts-review-brief --markdown",
            "quality": "script/agentctl.sh selected-short-quality",
            "cleanCopy": "script/agentctl.sh selected-short-platform-clean-copy --json",
            "platformPacket": "script/agentctl.sh selected-short-platform-packet --all",
        },
        "truth": (
            "Metadata-only local platform packet. It does not approve, schedule, upload, publish, "
            "create receipt truth, or mutate source media/session recipes."
        ),
    }


def markdown(packet: dict[str, Any]) -> str:
    short = packet["selectedShort"]
    lines = [
        "# Selected Short Platform Packet",
        "",
        f"- Session: `{packet['activeSessionName']}`",
        f"- Short: **{short['title']}**",
        f"- ID: `{short['id']}`",
        f"- Duration: `{short['durationSeconds']:.1f}s`",
        f"- Review: `{short['reviewStatus'] or 'unknown'}`",
        f"- Export: `{short['exportStatus'] or 'unknown'}`",
        f"- Class: `{short['reviewClassLabel'] or 'unknown'}`",
        "",
        "Truth: " + packet["truth"],
        "",
        "## Platform drafts",
        "",
    ]
    for variant in packet["platformVariants"]:
        lines.extend([
            f"### {variant['platform']}",
            "",
            f"- Title: {variant['title']}",
            f"- Format: `{variant['format']}`",
            f"- Duration fit: {variant['durationFit']}",
            f"- Receipt truth: `{variant['receiptTruth']}`",
            f"- Next review: {variant['nextReview']}",
            "",
            "Caption:",
            "",
            variant["caption"],
            "",
            "Hashtags: " + (" ".join(variant["hashtags"]) if variant["hashtags"] else "_none_"),
            "",
        ])
    lines.extend(["## Safe commands", ""])
    for label, command in packet["safeCommands"].items():
        lines.append(f"- `{label}`: `{command}`")
    return "\n".join(lines)


def write_packet(packet: dict[str, Any], output_root: Path, basename: str | None) -> dict[str, str]:
    session_slug = slug(text(packet.get("activeSessionName")), "unknown-session")
    short_slug = slug(text(packet["selectedShort"].get("title")), "selected-short")
    folder = output_root / session_slug / f"{stamp()}-{short_slug}"
    folder.mkdir(parents=True, exist_ok=False)
    base = slug(basename or short_slug, "selected-short-platform-packet")
    json_path = folder / f"{base}-platform-packet.json"
    md_path = folder / f"{base}-platform-packet.md"
    json_path.write_text(json.dumps(packet, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    md_path.write_text(markdown(packet) + "\n", encoding="utf-8")
    return {"outputFolder": str(folder), "jsonPath": str(json_path), "markdownPath": str(md_path)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--output-root", type=Path, default=DEFAULT_OUTPUT_ROOT)
    parser.add_argument("--basename")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--markdown", action="store_true")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--all", action="store_true")
    args = parser.parse_args()

    packet = build_packet(args.base_url)
    if not args.dry_run:
        packet["artifact"] = write_packet(packet, args.output_root, args.basename)

    if args.markdown and not args.json:
        print(markdown(packet))
    else:
        print(json.dumps(packet, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
