#!/usr/bin/env python3
"""Shared helpers for Quipsly Studio short-form report scripts."""

from __future__ import annotations

import html
import json
import os
import re
from datetime import datetime, timezone
from typing import Any


EXPORT_PATTERNS = [
    re.compile(r"Exported 9:16 short:\s*(.+)", re.IGNORECASE),
    re.compile(r"Export started:\s*(.+)", re.IGNORECASE),
    re.compile(r"Exported(?:\s+short)?:\s*(.+\.mp4)\b", re.IGNORECASE),
]

EPISODE_PATTERNS = [
    re.compile(r"\bepisode[-_\s]*(\d+)\b", re.IGNORECASE),
    re.compile(r"\bep[-_\s]*(\d+)\b", re.IGNORECASE),
]

PLATFORM_READINESS_RESEARCH_BASIS = [
    "YouTube Shorts: square or vertical videos up to 3 minutes are categorized as Shorts after the October 2024 longer-Shorts update.",
    "Instagram and Facebook Reels: full-screen 9:16 vertical is the safest default, with readable captions and face-safe composition.",
    "LinkedIn: vertical 9:16 and 4:5 are supported, but the clip should have a clear work, leadership, coaching, learning, or professional reflection angle.",
    "Patreon: video can be native, embedded, or attached; supporter context, access framing, and post copy matter as much as the raw clip.",
    "Modern short-form tools compete on automatic clip discovery, vertical reframing, captions, templates, virality scoring, and scheduling; Quipsly should keep those as transparent metadata instead of black-box magic.",
]


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def load_json(path: str) -> Any:
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def write_text(path: str, text: str) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(text)
        if not text.endswith("\n"):
            handle.write("\n")


def write_json(path: str, payload: dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True)
        handle.write("\n")


def emit_packet_outputs(packet: dict[str, Any], html_text: str, markdown_text: str, mode: str) -> None:
    write_json(packet["json"], packet)
    write_text(packet["html"], html_text)
    write_text(packet["markdown"], markdown_text)
    if mode == "--json":
        print(json.dumps(packet, indent=2, sort_keys=True))
    elif mode == "--html":
        print(packet["html"])
    else:
        print(packet["markdown"])


def esc(value: Any) -> str:
    return html.escape("" if value is None else str(value))


def slugify(value: str) -> str:
    value = re.sub(r"[^A-Za-z0-9]+", "-", value.strip().lower())
    return value.strip("-") or "short"


def as_list(value: Any) -> list[Any]:
    if isinstance(value, list):
        return value
    if value is None:
        return []
    return [value]


def first_text(row: dict[str, Any], keys: list[str], default: str = "") -> str:
    for key in keys:
        value = row.get(key)
        if value is not None and str(value).strip():
            return str(value).strip()
    return default


def first_number(row: dict[str, Any], keys: list[str], default: float = 0.0) -> float:
    for key in keys:
        value = row.get(key)
        if value is None or value == "":
            continue
        try:
            return float(value)
        except (TypeError, ValueError):
            continue
    return default


def looks_like_short_list(rows: Any) -> bool:
    if not isinstance(rows, list) or not rows:
        return False
    dict_rows = [row for row in rows if isinstance(row, dict)]
    if not dict_rows:
        return False
    signal_keys = {
        "title",
        "segments",
        "reviewStatus",
        "exportStatus",
        "destinations",
        "hookText",
        "overlayText",
        "publishNotes",
        "shortId",
        "clipId",
    }
    return any(signal_keys.intersection(row.keys()) for row in dict_rows[:5])


def find_short_lists(value: Any) -> list[list[dict[str, Any]]]:
    found: list[list[dict[str, Any]]] = []
    if looks_like_short_list(value):
        found.append([row for row in value if isinstance(row, dict)])
    if isinstance(value, dict):
        preferred_keys = [
            "shorts",
            "queue",
            "items",
            "clips",
            "shortClips",
            "socialShorts",
            "reviewQueue",
            "shortsQueue",
        ]
        for key in preferred_keys:
            if key in value and looks_like_short_list(value[key]):
                found.append([row for row in value[key] if isinstance(row, dict)])
        for nested in value.values():
            if isinstance(nested, (dict, list)):
                found.extend(find_short_lists(nested))
    elif isinstance(value, list):
        for nested in value:
            if isinstance(nested, (dict, list)):
                found.extend(find_short_lists(nested))
    return found


def unique_shorts(payload: Any) -> list[dict[str, Any]]:
    lists = find_short_lists(payload)
    if not lists:
        return []
    rows = max(lists, key=len)
    seen: set[str] = set()
    unique: list[dict[str, Any]] = []
    for index, row in enumerate(rows, start=1):
        identity = first_text(row, ["id", "shortId", "clipId", "uuid"], f"index-{index}")
        if identity in seen:
            continue
        seen.add(identity)
        unique.append(row)
    return unique


def extract_strings(value: Any) -> list[str]:
    strings: list[str] = []
    if isinstance(value, str):
        strings.append(value)
    elif isinstance(value, dict):
        for nested in value.values():
            strings.extend(extract_strings(nested))
    elif isinstance(value, list):
        for nested in value:
            strings.extend(extract_strings(nested))
    return strings


def exported_paths(row: dict[str, Any]) -> list[str]:
    paths: list[str] = []
    for key in ["primaryExportPath", "exportPath", "localExportPath", "outputPath", "filePath"]:
        value = row.get(key)
        if isinstance(value, str) and value.strip():
            paths.append(value.strip())

    note_strings = extract_strings(row.get("publishNotes")) + extract_strings(row.get("notes"))
    for note in note_strings:
        for pattern in EXPORT_PATTERNS:
            match = pattern.search(note)
            if match:
                candidate = match.group(1).strip().strip("'\"")
                if candidate:
                    paths.append(candidate)

    seen: set[str] = set()
    cleaned: list[str] = []
    for path in paths:
        if path in seen:
            continue
        seen.add(path)
        cleaned.append(path)
    return cleaned


def duration_seconds(row: dict[str, Any]) -> float:
    duration = first_number(row, ["duration", "durationSeconds", "recipeDuration", "exportDuration"], 0.0)
    if duration > 0:
        return duration
    total = 0.0
    for segment in as_list(row.get("segments")):
        if not isinstance(segment, dict):
            continue
        segment_duration = first_number(segment, ["duration", "durationSeconds"], 0.0)
        if segment_duration <= 0:
            start = first_number(segment, ["start", "startSeconds", "sequenceStart"], 0.0)
            end = first_number(segment, ["end", "endSeconds", "sequenceEnd"], 0.0)
            segment_duration = max(0.0, end - start)
        total += segment_duration
    return total


def command_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def episode_key_from_text(value: str) -> str:
    for pattern in EPISODE_PATTERNS:
        match = pattern.search(value)
        if match:
            return f"episode-{int(match.group(1))}"
    return ""


def infer_episode(row: dict[str, Any], short_id: str, title: str, paths: list[str]) -> dict[str, str]:
    explicit = first_text(
        row,
        [
            "episodeSlug",
            "episodeKey",
            "episodeId",
            "episode",
            "sourceEpisode",
            "sourceEpisodeSlug",
            "episodeTitle",
        ],
        "",
    )
    if explicit:
        key = episode_key_from_text(explicit) or slugify(explicit)
        return {
            "episodeKey": key,
            "episodeLabel": explicit,
            "episodeInference": "explicit-field",
        }

    candidates = [short_id, title, *paths, *extract_strings(row.get("notes")), *extract_strings(row.get("publishNotes"))]
    for candidate in candidates:
        key = episode_key_from_text(candidate)
        if key:
            return {
                "episodeKey": key,
                "episodeLabel": key.replace("-", " ").title(),
                "episodeInference": "inferred-from-text",
            }

    return {
        "episodeKey": "unknown-episode",
        "episodeLabel": "Unknown episode",
        "episodeInference": "missing",
    }


def episode_coverage(cards: list[dict[str, Any]]) -> dict[str, Any]:
    counts: dict[str, int] = {}
    exported_counts: dict[str, int] = {}
    review_counts: dict[str, int] = {}
    reviewable_stages = {
        "exported-needs-visual-review",
        "exported-needs-listen-through",
        "needs-text-review",
        "ready-for-local-quality-decision",
        "ready-for-social-queue",
    }
    for card in cards:
        key = str(card.get("episodeKey") or "unknown-episode")
        counts[key] = counts.get(key, 0) + 1
        if card.get("primaryExportExists"):
            exported_counts[key] = exported_counts.get(key, 0) + 1
        if str(card.get("stage") or "") in reviewable_stages:
            review_counts[key] = review_counts.get(key, 0) + 1

    return {
        "episodeCount": len(counts),
        "unknownEpisodeCount": counts.get("unknown-episode", 0),
        "episodes": [
            {
                "episodeKey": key,
                "shortCount": counts[key],
                "localExportedFileCount": exported_counts.get(key, 0),
                "reviewableCount": review_counts.get(key, 0),
            }
            for key in sorted(counts)
        ],
    }


def markdown_episode_coverage(coverage: dict[str, Any] | None) -> list[str]:
    lines = ["## Episode coverage", ""]
    episodes = (coverage or {}).get("episodes") or []
    if not episodes:
        lines.append("- `none`: no episode coverage detected")
        return lines

    for item in episodes:
        lines.append(
            f"- `{item.get('episodeKey')}`: `{item.get('shortCount')}` shorts, "
            f"`{item.get('localExportedFileCount')}` exported files, "
            f"`{item.get('reviewableCount')}` reviewable"
        )
    unknown_count = (coverage or {}).get("unknownEpisodeCount") or 0
    if unknown_count:
        lines.append(f"- `needs-triage`: `{unknown_count}` shorts do not have reliable episode provenance yet")
    return lines


def html_episode_coverage(coverage: dict[str, Any] | None) -> str:
    episodes = (coverage or {}).get("episodes") or []
    if not episodes:
        return """
        <section class="episode-coverage">
          <p class="eyebrow">Episode coverage</p>
          <article><strong>0</strong><span>No episode coverage detected</span></article>
        </section>
        """

    cards = "".join(
        f"""
        <article>
          <strong>{esc(item.get('episodeKey'))}</strong>
          <span>{esc(item.get('shortCount'))} shorts</span>
          <small>{esc(item.get('localExportedFileCount'))} exported / {esc(item.get('reviewableCount'))} reviewable</small>
        </article>
        """
        for item in episodes
    )
    unknown_count = (coverage or {}).get("unknownEpisodeCount") or 0
    warning = (
        f"<p class=\"coverage-warning\">{esc(unknown_count)} shorts need episode provenance triage.</p>"
        if unknown_count
        else ""
    )
    return f"""
    <section class="episode-coverage">
      <p class="eyebrow">Episode coverage</p>
      <div class="episode-coverage-grid">{cards}</div>
      {warning}
    </section>
    """


def _readiness_entry(blockers: list[str], warnings: list[str], next_action: str) -> dict[str, Any]:
    if blockers:
        status = "blocked"
    elif warnings:
        status = "needs-review"
    else:
        status = "ready"
    return {
        "status": status,
        "blockers": blockers,
        "warnings": warnings,
        "nextAction": next_action,
    }


def platform_readiness(card: dict[str, Any]) -> dict[str, Any]:
    duration = float(card.get("durationSeconds") or 0)
    has_export = bool(card.get("primaryExportExists"))
    has_hook = bool(str(card.get("hookText") or "").strip())
    has_overlay = bool(str(card.get("overlayText") or "").strip())
    episode_known = str(card.get("episodeKey") or "") not in {"", "unknown-episode"}
    stage = str(card.get("stage") or "")
    title = str(card.get("title") or "")
    next_growth = str(card.get("nextGrowthAction") or "")
    text_blob = " ".join([title, str(card.get("hookText") or ""), str(card.get("overlayText") or ""), next_growth]).lower()
    professional_words = {
        "leadership",
        "coaching",
        "mentor",
        "work",
        "systems",
        "learning",
        "research",
        "teach",
        "steward",
        "attention",
        "identity",
        "growth",
        "creative",
    }
    has_professional_angle = any(word in text_blob for word in professional_words)

    vertical_blockers = []
    if not has_export:
        vertical_blockers.append("local export file missing")
    if duration <= 0:
        vertical_blockers.append("duration unknown")
    if duration > 180:
        vertical_blockers.append("longer than current 3-minute short-form target")

    caption_warnings = []
    if not has_hook:
        caption_warnings.append("opening hook missing")
    if not has_overlay:
        caption_warnings.append("caption or overlay plan missing")
    if stage == "exported-needs-visual-review":
        caption_warnings.append("visual crop/safe-zone review still needed")
    if stage == "exported-needs-listen-through":
        caption_warnings.append("audio listen-through still needed")

    youtube_warnings = list(caption_warnings)
    if duration > 60:
        youtube_warnings.append("over 60 seconds: verify music/copyright claims before relying on Shorts distribution")

    reels_warnings = list(caption_warnings)
    if duration > 90:
        reels_warnings.append("over 90 seconds: only use if pacing and payoff justify it")

    tiktok_warnings = list(caption_warnings)
    if duration > 60:
        tiktok_warnings.append("over 60 seconds: hook and retention need to be unusually strong")

    linkedin_warnings = list(caption_warnings)
    if not has_professional_angle:
        linkedin_warnings.append("professional/work/learning angle is not obvious yet")
    if duration > 90:
        linkedin_warnings.append("consider a tighter edit for professional-feed attention")

    patreon_warnings = []
    if not episode_known:
        patreon_warnings.append("episode provenance is unclear")
    if not has_hook:
        patreon_warnings.append("supporter teaser framing is missing")
    if stage in {"exported-needs-visual-review", "exported-needs-listen-through"}:
        patreon_warnings.append("finish local watch/listen before posting to supporters")

    hgo_warnings = []
    if not episode_known:
        hgo_warnings.append("episode provenance is required for HighGroundOdyssey embeds")
    if not has_hook:
        hgo_warnings.append("embed teaser or title hook is missing")

    platforms = {
        "youtubeShorts": _readiness_entry(
            list(vertical_blockers),
            youtube_warnings,
            "Export 9:16, confirm <=3 minutes, sharpen hook/captions, then package title/description.",
        ),
        "instagramReels": _readiness_entry(
            list(vertical_blockers),
            reels_warnings,
            "Confirm vertical crop, face-safe captions, and Reels-native caption/hashtag package.",
        ),
        "facebookReels": _readiness_entry(
            list(vertical_blockers),
            reels_warnings,
            "Confirm readable captions and a share-friendly caption for Facebook's broader audience.",
        ),
        "tiktokStyle": _readiness_entry(
            list(vertical_blockers),
            tiktok_warnings,
            "Treat as TikTok-style even before direct integration: fast hook, tight pacing, clear captions.",
        ),
        "linkedin": _readiness_entry(
            list(vertical_blockers),
            linkedin_warnings,
            "Use only when the clip has a clear professional, coaching, leadership, or learning promise.",
        ),
        "patreonTeaser": _readiness_entry(
            [] if has_export else ["local export file missing"],
            patreon_warnings,
            "Frame as supporter context, behind-the-scenes prompt, or early-access teaser.",
        ),
        "highGroundOdysseyEmbed": _readiness_entry(
            [] if has_export and episode_known else [
                *([] if has_export else ["local export file missing"]),
                *([] if episode_known else ["episode provenance missing"]),
            ],
            hgo_warnings,
            "Attach to the episode page with clear provenance and a useful teaser line.",
        ),
    }

    counts: dict[str, int] = {}
    for item in platforms.values():
        status = str(item.get("status") or "unknown")
        counts[status] = counts.get(status, 0) + 1
    return {
        "basis": PLATFORM_READINESS_RESEARCH_BASIS,
        "counts": counts,
        "platforms": platforms,
    }


def platform_readiness_summary(readiness: dict[str, Any] | None) -> str:
    counts = (readiness or {}).get("counts") or {}
    ready = counts.get("ready", 0)
    review = counts.get("needs-review", 0)
    blocked = counts.get("blocked", 0)
    return f"{ready} ready / {review} needs review / {blocked} blocked"


def platform_readiness_coverage(cards: list[dict[str, Any]]) -> dict[str, Any]:
    platforms: dict[str, dict[str, int]] = {}
    for card in cards:
        readiness = card.get("platformReadiness") or {}
        for platform, detail in (readiness.get("platforms") or {}).items():
            counts = platforms.setdefault(str(platform), {"ready": 0, "needs-review": 0, "blocked": 0})
            status = str(detail.get("status") or "needs-review")
            counts[status] = counts.get(status, 0) + 1
    rows = [
        {
            "platform": platform,
            "ready": counts.get("ready", 0),
            "needsReview": counts.get("needs-review", 0),
            "blocked": counts.get("blocked", 0),
        }
        for platform, counts in sorted(platforms.items())
    ]
    return {
        "platformCount": len(rows),
        "platforms": rows,
    }


def markdown_platform_readiness_coverage(coverage: dict[str, Any] | None) -> list[str]:
    lines = ["## Platform readiness coverage", ""]
    platforms = (coverage or {}).get("platforms") or []
    if not platforms:
        lines.append("- `none`: no platform readiness data detected")
        return lines
    for item in platforms:
        lines.append(
            f"- `{item.get('platform')}`: `{item.get('ready')}` ready, "
            f"`{item.get('needsReview')}` needs review, `{item.get('blocked')}` blocked"
        )
    return lines


def html_platform_readiness_coverage(coverage: dict[str, Any] | None) -> str:
    platforms = (coverage or {}).get("platforms") or []
    if not platforms:
        return """
        <section class="platform-readiness-coverage">
          <p class="eyebrow">Platform readiness</p>
          <article><strong>0</strong><span>No platform readiness data detected</span></article>
        </section>
        """
    cards = "".join(
        f"""
        <article>
          <strong>{esc(item.get('platform'))}</strong>
          <span>{esc(item.get('ready'))} ready</span>
          <small>{esc(item.get('needsReview'))} review / {esc(item.get('blocked'))} blocked</small>
        </article>
        """
        for item in platforms
    )
    return f"""
    <section class="platform-readiness-coverage">
      <p class="eyebrow">Platform readiness</p>
      <div class="platform-readiness-grid">{cards}</div>
    </section>
    """


def classify_short(row: dict[str, Any], output_dir: str, index: int) -> dict[str, Any]:
    short_id = first_text(row, ["id", "shortId", "clipId", "uuid"], f"short-{index}")
    title = first_text(row, ["title", "name", "label"], f"Short {index}")
    review_status = first_text(row, ["reviewStatus", "status"], "draft")
    export_status = first_text(row, ["exportStatus", "localExportStatus"], "unknown")
    text_status = first_text(row, ["textReviewStatus", "captionReviewStatus", "overlayBurnInStatus"], "unknown")
    listen_status = first_text(row, ["listenThroughStatus", "audioReviewStatus"], "unknown")
    visual_status = first_text(row, ["visualReviewStatus", "contactSheetStatus"], "unknown")
    destinations = [str(item) for item in as_list(row.get("destinations")) if str(item).strip()]
    paths = exported_paths(row)
    primary_path = paths[0] if paths else ""
    primary_exists = bool(primary_path and os.path.exists(primary_path))
    primary_size = os.path.getsize(primary_path) if primary_exists else 0
    duration = duration_seconds(row)
    episode = infer_episode(row, short_id, title, paths)
    lower = json.dumps(row, sort_keys=True, default=str).lower()

    rejected = any(word in review_status.lower() for word in ["reject", "rejected"])
    kept = any(word in review_status.lower() for word in ["keep", "kept", "approved", "ready"])
    exported = primary_exists or "exported" in export_status.lower() or "completed" in export_status.lower()
    export_started = "start" in export_status.lower() or "progress" in export_status.lower() or "running" in export_status.lower()
    visual_done = "visualreview" in lower or "contact sheet" in lower or any(word in visual_status.lower() for word in ["done", "review", "pass"])
    listen_done = "listenthrough" in lower or any(word in listen_status.lower() for word in ["done", "review", "pass", "approved"])
    text_done = any(word in text_status.lower() for word in ["approved", "done", "review", "pass"]) or "textreview" in lower

    if rejected:
        stage = "rejected-learning-data"
        next_action = "Leave it as learning data unless we intentionally revive it."
    elif not primary_path:
        stage = "missing-export"
        next_action = "Export this short locally so we have an actual file to watch and hear."
    elif not primary_exists:
        stage = "export-path-missing-file"
        next_action = "Re-export locally. The queue references a path, but the file is not present."
    elif not exported and export_started:
        stage = "export-started-needs-confirmation"
        next_action = "Confirm the export finished, then generate visual and audio evidence."
    elif not visual_done:
        stage = "exported-needs-visual-review"
        next_action = "Generate a contact sheet or preview the short before deciding."
    elif not listen_done:
        stage = "exported-needs-listen-through"
        next_action = "Listen through the exported file and sanity-check audio."
    elif not text_done:
        stage = "needs-text-review"
        next_action = "Check hook, captions, overlay placement, and platform copy."
    elif kept:
        stage = "ready-for-social-queue"
        next_action = "Move this toward the social publishing queue when Tower is ready."
    else:
        stage = "ready-for-local-quality-decision"
        next_action = "Make the practical call: keep, refine, or reject based on the exported file."

    basename = slugify(title)
    select_command = f"script/agentctl.sh shorts-select id {command_quote(short_id)}"
    export_command = f"{select_command} && script/agentctl.sh shorts-export-selected {command_quote(output_dir)} {command_quote(basename)}"
    contact_sheet_command = (
        f"script/agentctl.sh shorts-contact-sheet {command_quote(primary_path)}"
        if primary_path
        else ""
    )
    audio_sanity_command = (
        f"script/agentctl.sh shorts-audio-sanity {command_quote(primary_path)} {duration:.2f}"
        if primary_path
        else ""
    )
    listen_command = f"script/agentctl.sh shorts-listen-through {command_quote('Listened locally; note result here.')}"
    keep_command = f"script/agentctl.sh shorts-review {command_quote(short_id)} keep {command_quote('Kept after local export review.')}"
    refine_command = f"script/agentctl.sh shorts-review {command_quote(short_id)} refine {command_quote('Needs one concrete improvement after local review.')}"

    return {
        "id": short_id,
        "title": title,
        "index": index,
        "stage": stage,
        "nextAction": next_action,
        **episode,
        "reviewStatus": review_status,
        "exportStatus": export_status,
        "visualReviewStatus": visual_status,
        "listenThroughStatus": listen_status,
        "textReviewStatus": text_status,
        "destinations": destinations,
        "durationSeconds": round(duration, 3),
        "segmentCount": len(as_list(row.get("segments"))),
        "primaryExportPath": primary_path,
        "primaryExportExists": primary_exists,
        "primaryExportBytes": primary_size,
        "allExportedPaths": paths,
        "commands": {
            "select": select_command,
            "exportLocal": export_command,
            "contactSheet": contact_sheet_command,
            "audioSanity": audio_sanity_command,
            "listenThrough": listen_command,
            "keep": keep_command,
            "refine": refine_command,
        },
    }


def stage_rank(stage: str) -> int:
    ranks = {
        "missing-export": 10,
        "export-path-missing-file": 15,
        "export-started-needs-confirmation": 20,
        "exported-needs-visual-review": 30,
        "exported-needs-listen-through": 40,
        "needs-text-review": 50,
        "ready-for-local-quality-decision": 60,
        "ready-for-social-queue": 70,
        "rejected-learning-data": 90,
    }
    return ranks.get(stage, 80)
