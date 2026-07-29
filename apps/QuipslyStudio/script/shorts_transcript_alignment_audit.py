#!/usr/bin/env python3
"""Audit whether short recipe ranges align with transcript-sidecar text.

Read-only. Searches a transcript session for the best text window matching each
short's title/hook/caption metadata, then reports likely offset drift. It never
mutates media, session files, exports, receipts, or review state.
"""

from __future__ import annotations

import argparse
import json
import statistics
from pathlib import Path
from typing import Any

from selected_short_story_repair_suggestions import (
    clean_transcript_text,
    dict_value,
    extract_transcript_context_from_session,
    list_value,
    safe_float,
    text_value,
)
from shorts_story_repair_board import (
    DEFAULT_SESSION,
    DEFAULT_TRANSCRIPT,
    active_sequence,
    load_json,
    meaningful_tokens,
    short_range,
    transcript_alignment,
)


def short_metadata_text(short: dict[str, Any]) -> str:
    chunks: list[str] = []
    for key in ["title", "hookText", "captionDraft", "primaryOverlayText", "notes"]:
        value = short.get(key)
        if isinstance(value, str):
            chunks.append(value)
        elif isinstance(value, list):
            chunks.extend(str(item) for item in value[:6])
        elif isinstance(value, dict):
            chunks.extend(str(value.get(k, "")) for k in sorted(value.keys())[:6])
    return " ".join(chunks)


def transcript_segments(transcript_path: Path) -> list[dict[str, Any]]:
    payload = load_json(transcript_path)
    sequence = active_sequence(payload)
    rows: list[dict[str, Any]] = []
    for segment in list_value(sequence.get("transcriptSegments")):
        segment = dict_value(segment)
        start = safe_float(segment.get("startTime"))
        end = safe_float(segment.get("endTime"))
        text = clean_transcript_text(segment.get("text"))
        if start is None or end is None or end <= start or not text:
            continue
        if end - start < 0.25:
            continue
        rows.append({"start": start, "end": end, "text": text})
    rows.sort(key=lambda item: (item["start"], item["end"]))
    return rows


def window_text(rows: list[dict[str, Any]], start: float, end: float) -> str:
    pieces: list[str] = []
    last_text = ""
    for row in rows:
        if row["end"] < start:
            continue
        if row["start"] > end:
            break
        text = row["text"]
        if text == last_text:
            continue
        if pieces and text in pieces[-1]:
            continue
        pieces.append(text)
        last_text = text
    return " ".join(pieces)


def overlap_score(metadata_tokens: set[str], excerpt: str) -> dict[str, Any]:
    excerpt_tokens = meaningful_tokens(excerpt)
    overlap = sorted(metadata_tokens & excerpt_tokens)
    denominator = max(1, min(len(metadata_tokens), 18))
    score = round(len(overlap) / denominator, 3)
    if not excerpt:
        label = "missing"
    elif score >= 0.28 or len(overlap) >= 4:
        label = "supported"
    elif score >= 0.12 or len(overlap) >= 2:
        label = "weak"
    else:
        label = "mismatch-risk"
    return {
        "label": label,
        "score": score,
        "overlapTokens": overlap[:16],
        "metadataTokenCount": len(metadata_tokens),
        "excerptTokenCount": len(excerpt_tokens),
    }


def best_transcript_window(rows: list[dict[str, Any]], metadata_tokens: set[str], duration: float, stride: int = 1) -> dict[str, Any]:
    if not rows or not metadata_tokens or duration <= 0:
        return {"score": 0, "label": "missing", "start": None, "end": None, "excerpt": "", "overlapTokens": []}
    best: dict[str, Any] = {"score": -1, "label": "missing", "start": None, "end": None, "excerpt": "", "overlapTokens": []}
    seen_starts: set[float] = set()
    for index, row in enumerate(rows[:: max(1, stride)]):
        start = round(float(row["start"]), 3)
        if start in seen_starts:
            continue
        seen_starts.add(start)
        end = start + max(8.0, duration)
        excerpt = window_text(rows, start, end)
        result = overlap_score(metadata_tokens, excerpt)
        result.update({"start": start, "end": end, "excerpt": excerpt[:500]})
        if result["score"] > best["score"] or (result["score"] == best["score"] and len(result.get("overlapTokens") or []) > len(best.get("overlapTokens") or [])):
            best = result
    return best


def build_audit(session_path: Path, transcript_path: Path, limit: int | None = None) -> dict[str, Any]:
    session_payload = load_json(session_path)
    sequence = active_sequence(session_payload)
    shorts = [dict_value(item) for item in list_value(sequence.get("shortClipQueue"))]
    if limit:
        shorts = shorts[:limit]
    rows = transcript_segments(transcript_path) if transcript_path.exists() else []

    items: list[dict[str, Any]] = []
    confident_offsets: list[float] = []
    for index, short in enumerate(shorts, start=1):
        start, end = short_range(short)
        duration = safe_float(short.get("duration")) or ((end - start) if start is not None and end is not None else 45.0)
        metadata = short_metadata_text(short)
        metadata_tokens = meaningful_tokens(metadata)
        current_context = {}
        if start is not None and end is not None and end > start and transcript_path.exists():
            current_context = extract_transcript_context_from_session(transcript_path, start, end)
        current_excerpt = text_value(current_context.get("excerpt"))
        current_alignment = transcript_alignment(short, current_excerpt)
        best = best_transcript_window(rows, metadata_tokens, duration)
        offset = None
        if start is not None and best.get("start") is not None:
            offset = round(float(best["start"]) - start, 3)
        improvement = round(float(best.get("score") or 0) - float(current_alignment.get("score") or 0), 3)
        if best.get("label") in {"supported", "weak"} and improvement >= 0.12 and offset is not None:
            confident_offsets.append(offset)
        if best.get("label") == "supported" and improvement >= 0.18:
            diagnosis = "likely-range-or-timebase-mismatch"
            next_action = "Inspect this short at the best transcript window before trusting current captions or story scaffold."
        elif current_alignment.get("label") == "supported":
            diagnosis = "current-range-supported"
            next_action = "Use transcript-aware repair normally, then proof-watch."
        elif best.get("label") in {"supported", "weak"}:
            diagnosis = "possible-better-transcript-window"
            next_action = "Compare current range against suggested transcript window; do not auto-apply."
        else:
            diagnosis = "needs-manual-transcript-review"
            next_action = "Proof-watch manually or regenerate transcript/timebase evidence."

        items.append(
            {
                "rank": index,
                "id": text_value(short.get("id")),
                "title": text_value(short.get("title"), "Untitled short"),
                "currentRange": {"start": start, "end": end, "duration": duration},
                "currentAlignment": current_alignment,
                "bestTranscriptWindow": best,
                "suggestedOffsetSeconds": offset,
                "scoreImprovement": improvement,
                "diagnosis": diagnosis,
                "nextAction": next_action,
            }
        )

    offset_summary: dict[str, Any] = {"count": len(confident_offsets)}
    if confident_offsets:
        offset_range = max(confident_offsets) - min(confident_offsets)
        offset_summary.update(
            {
                "medianSeconds": round(statistics.median(confident_offsets), 3),
                "minSeconds": round(min(confident_offsets), 3),
                "maxSeconds": round(max(confident_offsets), 3),
                "spreadSeconds": round(offset_range, 3),
                "globalOffsetLikely": offset_range <= 8,
                "diagnosis": "consistent-global-offset" if offset_range <= 8 else "mixed-or-stale-short-recipes",
            }
        )
    else:
        offset_summary.update({"globalOffsetLikely": False, "diagnosis": "not-enough-confident-offsets"})

    counts: dict[str, int] = {}
    for item in items:
        counts[item["diagnosis"]] = counts.get(item["diagnosis"], 0) + 1

    return {
        "status": "shorts_transcript_alignment_audit",
        "model": "quipsly-shorts-transcript-alignment-audit",
        "version": "2026-07-04.shorts-transcript-alignment-audit.v1",
        "sessionPath": str(session_path),
        "transcriptPath": str(transcript_path),
        "sequenceTitle": text_value(sequence.get("title")),
        "shortCount": len(items),
        "transcriptSegmentCount": len(rows),
        "diagnosisCounts": counts,
        "offsetSummary": offset_summary,
        "items": items,
        "truth": "Read-only transcript alignment audit. Suggested offsets are evidence for review, not edit commands. No media, sessions, exports, receipts, or review state are changed.",
    }


def render_markdown(audit: dict[str, Any]) -> str:
    lines = [
        "# Shorts transcript alignment audit",
        "",
        f"- Sequence: {audit.get('sequenceTitle', '')}",
        f"- Shorts: {audit.get('shortCount', 0)}",
        f"- Transcript segments: {audit.get('transcriptSegmentCount', 0)}",
        f"- Session: `{audit.get('sessionPath', '')}`",
        f"- Transcript: `{audit.get('transcriptPath', '')}`",
        f"- Truth: {audit.get('truth', '')}",
        "",
        "## Diagnosis counts",
    ]
    for label, count in sorted(dict_value(audit.get("diagnosisCounts")).items()):
        lines.append(f"- `{label}`: {count}")
    offset = dict_value(audit.get("offsetSummary"))
    lines.extend([
        "",
        "## Offset evidence",
        f"- Confident offsets: {offset.get('count', 0)}",
    ])
    if offset.get("count"):
        lines.extend([
            f"- Median: `{offset.get('medianSeconds')}` seconds",
            f"- Range: `{offset.get('minSeconds')}` to `{offset.get('maxSeconds')}` seconds",
            f"- Spread: `{offset.get('spreadSeconds')}` seconds",
            f"- Global offset likely: `{offset.get('globalOffsetLikely')}`",
            f"- Diagnosis: `{offset.get('diagnosis')}`",
        ])
    lines.extend(["", "## Shorts", ""])
    for item in list_value(audit.get("items")):
        item = dict_value(item)
        current = dict_value(item.get("currentAlignment"))
        best = dict_value(item.get("bestTranscriptWindow"))
        current_range = dict_value(item.get("currentRange"))
        lines.extend([
            f"### {item.get('rank')}. {item.get('title')}",
            "",
            f"- ID: `{item.get('id', '')}`",
            f"- Current range: `{current_range.get('start')}` -> `{current_range.get('end')}` ({current_range.get('duration')}s)",
            f"- Current alignment: `{current.get('label', '')}` score `{current.get('score', 0)}` overlap `{', '.join(current.get('overlapTokens') or [])}`",
            f"- Best transcript window: `{best.get('start')}` -> `{best.get('end')}` label `{best.get('label')}` score `{best.get('score')}` overlap `{', '.join(best.get('overlapTokens') or [])}`",
            f"- Suggested offset: `{item.get('suggestedOffsetSeconds')}` seconds",
            f"- Score improvement: `{item.get('scoreImprovement')}`",
            f"- Diagnosis: `{item.get('diagnosis')}`",
            f"- Next: {item.get('nextAction')}",
        ])
        excerpt = text_value(best.get("excerpt"))
        if excerpt:
            lines.append(f"- Best-window excerpt: {excerpt}")
        lines.append("")
    return "\n".join(lines).strip() + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--session", type=Path, default=DEFAULT_SESSION)
    parser.add_argument("--transcript", type=Path, default=DEFAULT_TRANSCRIPT)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--markdown", action="store_true")
    parser.add_argument("--save", type=Path, default=None)
    args = parser.parse_args()
    audit = build_audit(args.session, args.transcript, args.limit)
    output = json.dumps(audit, indent=2, sort_keys=True) if args.json else render_markdown(audit)
    if args.save:
        args.save.parent.mkdir(parents=True, exist_ok=True)
        args.save.write_text(output, encoding="utf-8")
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
