#!/usr/bin/env python3
"""Build a read-only lineage backfill from saved Quipsly session short recipes.

The current review theater proves that short MP4s exist and are playable. This
script connects those rendered files back to saved `shortClipQueue` recipes
when the package manifest exposes a `sessionHint` or the MediaVault session can
be found by episode. It writes sidecar evidence only.
"""
from __future__ import annotations

import argparse
import html
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
DEFAULT_THEATER_JSON = (
    DEFAULT_ROOT
    / "shorts-command-room"
    / "recommended-review-theater"
    / "quipsly-studio-recommended-shorts-review-theater.json"
)
DEFAULT_OUTPUT_DIR = DEFAULT_ROOT / "shorts-command-room" / "lineage-backfill"
DEFAULT_BASENAME = "quipsly-studio-shorts-lineage-backfill"
DEFAULT_SESSION_DIR = Path.home() / "Library" / "Application Support" / "Quipsly" / "MediaVault" / "sessions"
SCHEMA = "quipsly.studio.shorts-lineage-backfill.v1"
VERSION = "2026-07-02.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""))


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    return data if isinstance(data, dict) else {}


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def file_uri(path: str) -> str:
    if not path:
        return ""
    try:
        return Path(path).expanduser().resolve().as_uri()
    except ValueError:
        return ""


def slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def number(value: Any, default: float = 0.0) -> float:
    try:
        out = float(value)
    except (TypeError, ValueError):
        return default
    return out if out == out and out not in {float("inf"), float("-inf")} else default


def list_dicts(value: Any) -> list[dict[str, Any]]:
    return [item for item in value if isinstance(item, dict)] if isinstance(value, list) else []


def manifest_path_for(root: Path, item: dict[str, Any]) -> Path:
    episode = int(number(item.get("episode"), 0))
    version = str(item.get("version") or item.get("currentVersion") or "v001")
    return root / f"Episode_{episode:02d}" / version / "manifest.json"


def session_candidates(session_dir: Path, session_hint: str, episode: int) -> list[Path]:
    candidates: list[Path] = []
    if session_hint:
        candidates.append(session_dir / f"{session_hint}.quipsly-session.json")
    if session_dir.exists():
        episode_patterns = [
            f"episode-{episode}-*.quipsly-session.json",
            f"episode-{episode}-*.json",
            f"*episode-{episode}*.quipsly-session.json",
        ]
        for pattern in episode_patterns:
            candidates.extend(sorted(session_dir.glob(pattern)))
    seen: set[str] = set()
    unique: list[Path] = []
    for path in candidates:
        key = str(path)
        if key not in seen:
            unique.append(path)
            seen.add(key)
    return unique


def active_sequence(session: dict[str, Any]) -> dict[str, Any]:
    project = session.get("project") if isinstance(session.get("project"), dict) else {}
    sequences = list_dicts(project.get("sequences"))
    active_id = str(session.get("activeSequenceId") or "")
    if active_id:
        for sequence in sequences:
            if str(sequence.get("id") or "") == active_id:
                return sequence
    return sequences[0] if sequences else {}


def lane_by_id(sequence: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        str(lane.get("id")): lane
        for lane in list_dicts(sequence.get("lanes"))
        if lane.get("id")
    }


def source_offset(lane: dict[str, Any] | None) -> float:
    if not lane:
        return 0.0
    source = lane.get("sourceVideo") if isinstance(lane.get("sourceVideo"), dict) else {}
    return number(source.get("offset"), 0.0)


def source_payload(lane: dict[str, Any] | None) -> dict[str, Any]:
    if not lane:
        return {}
    source = lane.get("sourceVideo") if isinstance(lane.get("sourceVideo"), dict) else {}
    return {
        "laneId": lane.get("id"),
        "laneName": lane.get("name"),
        "sourceAssetId": source.get("id"),
        "mediaURL": source.get("mediaURL"),
        "proxyURL": source.get("proxyURL"),
        "offset": source.get("offset"),
        "duration": source.get("duration"),
        "is360": source.get("is360"),
    }


def overlap_seconds(a_start: float, a_end: float, b_start: float, b_end: float) -> float:
    return max(0.0, min(a_end, b_end) - max(a_start, b_start))


def media_kind(lane: dict[str, Any]) -> str:
    source = lane.get("sourceVideo") if isinstance(lane.get("sourceVideo"), dict) else {}
    media_url = str(source.get("mediaURL") or "").lower()
    if media_url.endswith((".wav", ".mp3", ".m4a", ".aac", ".aiff", ".flac")):
        return "audio"
    if media_url.endswith((".mp4", ".mov", ".m4v", ".insv", ".avi", ".mkv")):
        return "video"
    return "media"


def tag_sequence_range(lane: dict[str, Any], tag: dict[str, Any]) -> tuple[float, float]:
    offset = source_offset(lane)
    start = number(tag.get("startTime"), 0.0) + offset
    duration = max(0.0, number(tag.get("duration"), 0.0))
    return start, start + duration


def infer_source_lanes(sequence: dict[str, Any], segments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Score likely source lanes by overlap with saved SHOW/SKIP metadata.

    This is deliberately evidence, not truth. It can suggest which lanes were
    visible/audible during a short recipe, but it does not rewrite the recipe's
    explicit sourceLaneId.
    """
    candidates: list[dict[str, Any]] = []
    for lane in list_dicts(sequence.get("lanes")):
        lane_tags = list_dicts(lane.get("tags"))
        if not lane_tags:
            continue
        active_overlap = 0.0
        cut_overlap = 0.0
        support_overlap = 0.0
        total_overlap = 0.0
        matched_tags: list[dict[str, Any]] = []
        for segment in segments:
            seg_start = number(segment.get("sequenceStart"), 0.0)
            seg_end = number(segment.get("sequenceEnd"), seg_start)
            for tag in lane_tags:
                tag_start, tag_end = tag_sequence_range(lane, tag)
                overlap = overlap_seconds(seg_start, seg_end, tag_start, tag_end)
                if overlap <= 0:
                    continue
                tag_type = str(tag.get("type") or "")
                total_overlap += overlap
                if tag_type == "Active":
                    active_overlap += overlap
                elif tag_type == "Cut":
                    cut_overlap += overlap
                else:
                    support_overlap += overlap
                if len(matched_tags) < 8:
                    matched_tags.append(
                        {
                            "id": tag.get("id"),
                            "type": tag_type,
                            "sequenceStart": tag_start,
                            "sequenceEnd": tag_end,
                            "overlapSeconds": overlap,
                        }
                    )
        if total_overlap <= 0:
            continue
        recipe_duration = max(0.001, sum(max(0.0, number(segment.get("duration"), 0.0)) for segment in segments))
        score = (active_overlap * 4.0) + (support_overlap * 1.25) - (cut_overlap * 3.0)
        kind = media_kind(lane)
        if kind == "video" and active_overlap > 0:
            score += 2.0
        coverage = min(1.0, max(0.0, active_overlap / recipe_duration))
        reasons: list[str] = []
        if active_overlap > 0:
            reasons.append(f"{active_overlap:.2f}s SHOW/Active overlap")
        if support_overlap > 0:
            reasons.append(f"{support_overlap:.2f}s supporting tag overlap")
        if cut_overlap > 0:
            reasons.append(f"{cut_overlap:.2f}s SKIP/Cut overlap")
        if kind != "media":
            reasons.append(f"{kind} lane")
        candidates.append(
            {
                "laneId": lane.get("id"),
                "laneName": lane.get("name"),
                "mediaKind": kind,
                "score": round(score, 4),
                "coverage": round(coverage, 4),
                "activeOverlapSeconds": round(active_overlap, 4),
                "cutOverlapSeconds": round(cut_overlap, 4),
                "supportOverlapSeconds": round(support_overlap, 4),
                "totalOverlapSeconds": round(total_overlap, 4),
                "source": source_payload(lane),
                "matchedTags": matched_tags,
                "reasons": reasons,
            }
        )
    candidates.sort(
        key=lambda item: (
            number(item.get("score"), 0.0),
            number(item.get("activeOverlapSeconds"), 0.0),
            number(item.get("coverage"), 0.0),
        ),
        reverse=True,
    )
    top = candidates[0] if candidates else {}
    second_score = number(candidates[1].get("score"), 0.0) if len(candidates) > 1 else 0.0
    top_score = number(top.get("score"), 0.0)
    for item in candidates:
        score = number(item.get("score"), 0.0)
        coverage = number(item.get("coverage"), 0.0)
        if score <= 0:
            confidence = "negative-or-skip-only"
        elif item is top and coverage >= 0.75 and (second_score <= 0 or top_score >= second_score * 1.35):
            confidence = "high"
        elif coverage >= 0.35:
            confidence = "medium"
        else:
            confidence = "low"
        item["confidence"] = confidence
    return candidates[:8]


def short_candidates(sequence: dict[str, Any]) -> list[dict[str, Any]]:
    return list_dicts(sequence.get("shortClipQueue"))


def match_short(theater_item: dict[str, Any], manifest: dict[str, Any], sequence: dict[str, Any]) -> tuple[dict[str, Any], str, list[str]]:
    shorts = short_candidates(sequence)
    if not shorts:
        return {}, "no-short-queue", ["Session has no shortClipQueue items."]
    short_index = int(number(theater_item.get("shortIndex"), 0))
    title_slug = slug(str(theater_item.get("title") or ""))
    duration = number(theater_item.get("durationSeconds"), -1)
    path = str(theater_item.get("path") or "")
    source_path = ""
    for row in list_dicts(manifest.get("shorts")):
        if str(row.get("path") or "") == path:
            source_path = str(row.get("source") or "")
            break
    source_slug = slug(Path(source_path).stem) if source_path else ""

    scored: list[tuple[int, dict[str, Any], list[str]]] = []
    for index, candidate in enumerate(shorts, start=1):
        score = 0
        reasons: list[str] = []
        if short_index and index == short_index:
            score += 80
            reasons.append("shortIndex matches queue position")
        candidate_title = str(candidate.get("title") or "")
        candidate_slug = slug(candidate_title)
        if title_slug and (title_slug == candidate_slug or title_slug in candidate_slug or candidate_slug in title_slug):
            score += 40
            reasons.append("title slug matches")
        candidate_duration = number(candidate.get("duration"), -1)
        if duration >= 0 and candidate_duration >= 0 and abs(duration - candidate_duration) <= 1.25:
            score += 30
            reasons.append("duration matches within tolerance")
        publish_notes_slug = slug(str(candidate.get("publishNotes") or ""))
        if source_slug and source_slug in publish_notes_slug:
            score += 30
            reasons.append("manifest source basename appears in publish notes")
        scored.append((score, candidate, reasons))
    scored.sort(key=lambda item: item[0], reverse=True)
    if not scored or scored[0][0] <= 0:
        return {}, "unmatched", ["No saved short recipe matched by index, title, duration, or source path."]
    if len(scored) > 1 and scored[0][0] == scored[1][0] and scored[0][0] < 100:
        return scored[0][1], "ambiguous-match", scored[0][2] + ["Top score tied; use cautiously."]
    return scored[0][1], "matched", scored[0][2]


def segment_payloads(candidate: dict[str, Any], sequence: dict[str, Any]) -> list[dict[str, Any]]:
    lanes = lane_by_id(sequence)
    raw_segments = list_dicts(candidate.get("segments"))
    if not raw_segments:
        raw_segments = [
            {
                "id": "",
                "title": "Segment 1",
                "startTime": candidate.get("startTime"),
                "duration": candidate.get("duration"),
                "sourceLaneId": candidate.get("sourceLaneId"),
                "sourceTagId": candidate.get("sourceTagId"),
            }
        ]
    out: list[dict[str, Any]] = []
    for index, segment in enumerate(raw_segments):
        local_start = number(segment.get("startTime"), 0.0)
        duration = max(0.0, number(segment.get("duration"), 0.0))
        lane_id = str(segment.get("sourceLaneId") or candidate.get("sourceLaneId") or "")
        lane = lanes.get(lane_id)
        offset = source_offset(lane)
        sequence_start = max(0.0, local_start + offset)
        out.append(
            {
                "index": index,
                "id": segment.get("id"),
                "title": segment.get("title") or f"Segment {index + 1}",
                "timeBase": "sequence-seconds",
                "sequenceStart": sequence_start,
                "sequenceEnd": sequence_start + duration,
                "duration": duration,
                "sourceLocalStart": local_start,
                "sourceLocalEnd": local_start + duration,
                "sourceLaneId": lane_id,
                "sourceTagId": segment.get("sourceTagId") or candidate.get("sourceTagId") or "",
                "source": source_payload(lane),
            }
        )
    return out


def build_item(root: Path, session_dir: Path, theater_item: dict[str, Any]) -> dict[str, Any]:
    episode = int(number(theater_item.get("episode"), 0))
    manifest_path = manifest_path_for(root, theater_item)
    manifest = read_json(manifest_path)
    session_hint = str(manifest.get("sessionHint") or "")
    sessions = session_candidates(session_dir, session_hint, episode)
    session_path = next((path for path in sessions if path.exists()), None)
    if not session_path:
        return {
            "shortId": theater_item.get("shortId"),
            "episode": episode,
            "status": "missing-session",
            "manifestPath": str(manifest_path),
            "sessionHint": session_hint,
            "sessionCandidates": [str(path) for path in sessions],
            "segments": [],
            "missingFields": ["session"],
            "nextSafestAction": "Find or regenerate the Quipsly session that created this short package.",
            "truth": "Backfill item only. No source media, timelines, exports, publication state, or receipts were mutated.",
        }
    session = read_json(session_path)
    sequence = active_sequence(session)
    candidate, match_status, match_reasons = match_short(theater_item, manifest, sequence)
    if not candidate:
        return {
            "shortId": theater_item.get("shortId"),
            "episode": episode,
            "status": match_status,
            "manifestPath": str(manifest_path),
            "sessionPath": str(session_path),
            "sessionHint": session_hint,
            "sequenceId": sequence.get("id"),
            "sequenceTitle": sequence.get("title"),
            "segments": [],
            "missingFields": ["shortRecipe"],
            "matchReasons": match_reasons,
            "nextSafestAction": "Open the session and choose/regenerate the source short recipe before repairing this export.",
            "truth": "Backfill item only. No source media, timelines, exports, publication state, or receipts were mutated.",
        }
    segments = segment_payloads(candidate, sequence)
    inferred_candidates = infer_source_lanes(sequence, segments)
    positive_inferred = [item for item in inferred_candidates if number(item.get("score"), 0.0) > 0]
    best_inferred = positive_inferred[0] if positive_inferred else {}
    sequence_start = min((segment["sequenceStart"] for segment in segments), default=number(candidate.get("startTime"), 0.0))
    sequence_end = max((segment["sequenceEnd"] for segment in segments), default=sequence_start + number(candidate.get("duration"), 0.0))
    source_lane_ids = sorted({str(segment.get("sourceLaneId") or "") for segment in segments if segment.get("sourceLaneId")})
    missing: list[str] = []
    if not source_lane_ids:
        missing.append("sourceLaneId")
    if not segments:
        missing.append("segments")
    if not missing:
        status = "backfilled"
    elif best_inferred:
        status = "inferred-backfill"
    else:
        status = "partial-backfill"
    return {
        "shortId": theater_item.get("shortId"),
        "episode": episode,
        "version": theater_item.get("version") or theater_item.get("currentVersion"),
        "rank": theater_item.get("rank"),
        "title": theater_item.get("title") or candidate.get("title"),
        "status": status,
        "matchStatus": match_status,
        "matchReasons": match_reasons,
        "manifestPath": str(manifest_path),
        "sessionPath": str(session_path),
        "sessionHint": session_hint,
        "sequenceId": sequence.get("id"),
        "sequenceTitle": sequence.get("title"),
        "recipeId": candidate.get("id"),
        "recipeTitle": candidate.get("title"),
        "reviewStatus": candidate.get("reviewStatus"),
        "exportStatus": candidate.get("exportStatus"),
        "sequenceStart": sequence_start,
        "sequenceEnd": sequence_end,
        "sequenceDuration": max(0.0, sequence_end - sequence_start),
        "recipeDuration": sum(segment.get("duration", 0.0) for segment in segments),
        "sourceLaneIds": source_lane_ids,
        "bestInferredSourceLane": best_inferred,
        "inferredSourceLaneCandidates": inferred_candidates,
        "sourceRange": {
            "timeBase": "sequence-seconds",
            "start": sequence_start,
            "end": sequence_end,
            "duration": sum(segment.get("duration", 0.0) for segment in segments),
            "segmentCount": len(segments),
        },
        "segments": segments,
        "missingFields": missing,
        "safeCommands": {
            "openShort": f"open {shell_quote(str(theater_item.get('path') or ''))}" if theater_item.get("path") else "",
            "revealShort": f"open -R {shell_quote(str(theater_item.get('path') or ''))}" if theater_item.get("path") else "",
            "openSession": f"open {shell_quote(str(session_path))}",
        },
        "nextSafestAction": "Use this sidecar lineage to repair the short recipe from whole-source session metadata." if status == "backfilled" else ("Use inferred lane candidates for review, but do not treat them as receipt-grade authorship until sourceLaneId/sourceTagId is written explicitly." if status == "inferred-backfill" else "Backfill usable sequence timing is present, but source lane identity is incomplete; treat as partial lineage."),
        "truth": "Backfill item only. It reads saved session recipes and writes sidecar evidence without mutating source media, timelines, exports, publication state, or receipts.",
    }


def build_backfill(root: Path, theater_path: Path, session_dir: Path, limit: int) -> dict[str, Any]:
    theater = read_json(theater_path)
    theater_items = [item for item in theater.get("items", []) if isinstance(item, dict)]
    if limit > 0:
        theater_items = theater_items[:limit]
    items = [build_item(root, session_dir, item) for item in theater_items]
    counts = {
        "items": len(items),
        "backfilled": sum(1 for item in items if item.get("status") == "backfilled"),
        "inferredBackfill": sum(1 for item in items if item.get("status") == "inferred-backfill"),
        "partialBackfill": sum(1 for item in items if item.get("status") == "partial-backfill"),
        "missingSession": sum(1 for item in items if item.get("status") == "missing-session"),
        "unmatched": sum(1 for item in items if item.get("status") in {"unmatched", "no-short-queue", "ambiguous-match"}),
        "withSequenceRange": sum(1 for item in items if item.get("sequenceStart") is not None and item.get("sequenceEnd") is not None),
        "withSourceLane": sum(1 for item in items if item.get("sourceLaneIds")),
        "withInferredSourceLane": sum(1 for item in items if item.get("bestInferredSourceLane")),
        "highConfidenceInference": sum(1 for item in items if (item.get("bestInferredSourceLane") or {}).get("confidence") == "high"),
        "mediumConfidenceInference": sum(1 for item in items if (item.get("bestInferredSourceLane") or {}).get("confidence") == "medium"),
        "segments": sum(len(item.get("segments") or []) for item in items),
        "timelineMutations": 0,
        "exportsCreated": 0,
        "receiptTruthCreated": False,
    }
    return {
        "schema": SCHEMA,
        "version": VERSION,
        "generatedAt": iso_now(),
        "root": str(root),
        "sourceTheaterJson": str(theater_path),
        "sessionDir": str(session_dir),
        "counts": counts,
        "items": items,
        "nextSafestAction": next((item.get("nextSafestAction") for item in items if item.get("status") != "backfilled"), "Use backfilled lineage as sidecar evidence for recipe repair review."),
        "truth": "Read-only lineage backfill. It writes sidecar evidence from saved sessions and does not mutate source media, timelines, exports, publishing state, or receipt truth.",
    }


def render_markdown(backfill: dict[str, Any]) -> str:
    lines = [
        "# Quipsly Studio shorts lineage backfill",
        "",
        f"Generated: `{backfill.get('generatedAt')}`",
        "",
        backfill.get("truth", ""),
        "",
        f"Next safest action: {backfill.get('nextSafestAction')}",
        "",
        "## Counts",
        "",
    ]
    for key, value in backfill.get("counts", {}).items():
        lines.append(f"- {key}: `{value}`")
    lines.extend(["", "## Items", ""])
    for item in backfill.get("items", []):
        lines.extend(
            [
                f"### {item.get('shortId') or item.get('title')}",
                "",
                f"- Status: `{item.get('status')}`",
                f"- Match: `{item.get('matchStatus')}`",
                f"- Session: `{item.get('sessionPath', '')}`",
                f"- Recipe: `{item.get('recipeTitle', '')}` / `{item.get('recipeId', '')}`",
                f"- Sequence range: `{item.get('sequenceStart', '')}` -> `{item.get('sequenceEnd', '')}`",
                f"- Segments: `{len(item.get('segments') or [])}`",
                f"- Source lanes: `{', '.join(item.get('sourceLaneIds') or [])}`",
                f"- Best inferred lane: `{(item.get('bestInferredSourceLane') or {}).get('laneName', '')}` / `{(item.get('bestInferredSourceLane') or {}).get('confidence', '')}`",
                f"- Next: {item.get('nextSafestAction')}",
                "",
            ]
        )
    return "\n".join(lines).rstrip() + "\n"


def render_html(backfill: dict[str, Any]) -> str:
    metrics = "".join(
        f"<div><strong>{esc(value)}</strong><span>{esc(key)}</span></div>"
        for key, value in backfill.get("counts", {}).items()
    )
    rows = "".join(render_item_html(item) for item in backfill.get("items", []))
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Quipsly Studio Shorts Lineage Backfill</title>
  <style>
    :root {{ color-scheme: dark; --soil:#17130e; --moss:#17281d; --cream:#fff1d4; --honey:#f5cd4e; --leaf:#82df91; --clay:#e4775f; --line:rgba(255,241,212,.16); }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:var(--cream); background:radial-gradient(circle at 15% -12%,rgba(130,223,145,.2),transparent 30%),linear-gradient(135deg,var(--moss),var(--soil)); }}
    main {{ width:min(1440px,calc(100vw - 36px)); margin:0 auto; padding:34px 0 90px; }}
    header,.card,.truth {{ border:1px solid var(--line); border-radius:28px; background:rgba(255,241,212,.07); box-shadow:0 24px 80px rgba(0,0,0,.25); }}
    header {{ padding:32px; margin-bottom:16px; }}
    .eyebrow {{ color:var(--honey); letter-spacing:.18em; text-transform:uppercase; font-size:.78rem; font-weight:950; }}
    h1 {{ margin:6px 0 12px; font-size:clamp(2.4rem,7vw,5.4rem); line-height:.9; }}
    p {{ color:#dfd0b4; line-height:1.55; }}
    .metrics {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px; margin-top:18px; }}
    .metrics div {{ border:1px solid var(--line); border-radius:18px; padding:13px; background:rgba(0,0,0,.22); }}
    .metrics strong {{ display:block; color:var(--leaf); font-size:1.9rem; }}
    .metrics span {{ color:#cdbf9e; text-transform:uppercase; letter-spacing:.08em; font-size:.7rem; font-weight:900; }}
    .truth {{ padding:20px 24px; margin-bottom:16px; border-color:rgba(245,205,78,.35); }}
    .grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(360px,1fr)); gap:14px; }}
    .card {{ padding:18px; }}
    .status {{ display:inline-block; border-radius:999px; padding:6px 10px; font-weight:950; font-size:.76rem; text-transform:uppercase; letter-spacing:.08em; }}
    .backfilled {{ background:rgba(130,223,145,.18); color:var(--leaf); border:1px solid rgba(130,223,145,.38); }}
    .partial-backfill,.missing-session,.unmatched,.no-short-queue,.ambiguous-match {{ background:rgba(228,119,95,.18); color:#ffb0a1; border:1px solid rgba(228,119,95,.38); }}
    code {{ color:#ffeaa3; overflow-wrap:anywhere; }}
    .pills {{ display:flex; flex-wrap:wrap; gap:8px; margin:12px 0; }}
    .pill {{ border:1px solid var(--line); border-radius:999px; padding:7px 10px; background:rgba(0,0,0,.22); color:var(--cream); font-weight:800; font-size:.82rem; }}
  </style>
</head>
<body>
<main>
  <header>
    <p class="eyebrow">Quipsly Studio · lineage backfill</p>
    <h1>Reconnect rendered shorts to saved recipes.</h1>
    <p>This board reads package manifests and saved sessions to recover sequence timing and recipe identity without touching original media or exports.</p>
    <div class="metrics">{metrics}</div>
  </header>
  <section class="truth"><p><strong>Truth boundary:</strong> {esc(backfill.get('truth'))}</p><p><strong>Next safest action:</strong> {esc(backfill.get('nextSafestAction'))}</p></section>
  <section class="grid">{rows}</section>
</main>
</body>
</html>
"""


def render_item_html(item: dict[str, Any]) -> str:
    status = str(item.get("status") or "")
    source_lanes = ", ".join(item.get("sourceLaneIds") or []) or "none"
    return f"""
    <article class="card">
      <p class="eyebrow">{esc(item.get('shortId') or 'short')}</p>
      <h2>{esc(item.get('title') or item.get('recipeTitle') or 'Untitled short')}</h2>
      <span class="status {esc(status)}">{esc(status)}</span>
      <div class="pills">
        <span class="pill">episode {esc(item.get('episode'))}</span>
        <span class="pill">{esc(item.get('matchStatus'))}</span>
        <span class="pill">inferred {esc((item.get('bestInferredSourceLane') or {}).get('confidence') or 'none')}</span>
        <span class="pill">{len(item.get('segments') or [])} segments</span>
      </div>
      <p><strong>Recipe:</strong> <code>{esc(item.get('recipeTitle'))}</code></p>
      <p><strong>Sequence:</strong> <code>{esc(item.get('sequenceStart'))} -> {esc(item.get('sequenceEnd'))}</code></p>
      <p><strong>Source lanes:</strong> <code>{esc(source_lanes)}</code></p>
      <p><strong>Best inferred lane:</strong> <code>{esc((item.get('bestInferredSourceLane') or {}).get('laneName') or 'none')}</code></p>
      <p>{esc(item.get('nextSafestAction'))}</p>
      <p><code>{esc(item.get('sessionPath'))}</code></p>
    </article>
    """


def write_outputs(backfill: dict[str, Any], output_dir: Path, basename: str, mode: str) -> dict[str, str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    paths = {
        "json": output_dir / f"{basename}.json",
        "markdown": output_dir / f"{basename}.md",
        "html": output_dir / f"{basename}.html",
    }
    if mode in {"json", "all"}:
        paths["json"].write_text(json.dumps(backfill, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    if mode in {"markdown", "all"}:
        paths["markdown"].write_text(render_markdown(backfill), encoding="utf-8")
    if mode in {"html", "all"}:
        paths["html"].write_text(render_html(backfill), encoding="utf-8")
    return {key: str(path) for key, path in paths.items() if path.exists()}


def main() -> int:
    parser = argparse.ArgumentParser(description="Build read-only short lineage backfill sidecars from saved sessions.")
    parser.add_argument("--root", default=str(DEFAULT_ROOT))
    parser.add_argument("--theater", default=str(DEFAULT_THEATER_JSON))
    parser.add_argument("--session-dir", default=str(DEFAULT_SESSION_DIR))
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR))
    parser.add_argument("--basename", default=DEFAULT_BASENAME)
    parser.add_argument("--limit", type=int, default=0, help="Limit output items. 0 means all.")
    parser.add_argument("--format", choices=["markdown", "json", "html", "all"], default="markdown")
    parser.add_argument("--markdown", dest="format", action="store_const", const="markdown")
    parser.add_argument("--json", dest="format", action="store_const", const="json")
    parser.add_argument("--html", dest="format", action="store_const", const="html")
    parser.add_argument("--all", dest="format", action="store_const", const="all")
    args = parser.parse_args()

    backfill = build_backfill(
        Path(args.root).expanduser(),
        Path(args.theater).expanduser(),
        Path(args.session_dir).expanduser(),
        args.limit,
    )
    paths = write_outputs(backfill, Path(args.output_dir).expanduser(), args.basename, args.format)
    print(
        json.dumps(
            {
                "ok": True,
                "artifactPaths": {"folder": str(Path(args.output_dir).expanduser()), **paths},
                "counts": backfill.get("counts"),
                "nextSafestAction": backfill.get("nextSafestAction"),
                "truth": backfill.get("truth"),
            },
            indent=2,
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
