#!/usr/bin/env python3
"""Build a transcript-aware story repair board for every short in a saved session.

This is file-backed and read-only. It does not require the Quipsly Studio app or
agent server to be running, and it does not mutate session files, source media,
exports, receipts, or review state.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

from selected_short_story_repair_suggestions import (
    clean_topic,
    dict_value,
    extract_transcript_context_from_session,
    is_generic_candidate_title,
    list_value,
    safe_float,
    selected_time_range,
    text_value,
    transcript_story_scaffold,
)

DEFAULT_SESSION = Path.home() / "Library/Application Support/Quipsly/MediaVault/sessions/episode-1-codex-real-edit-v1-youtube-wordtimed.quipsly-session.json"
DEFAULT_TRANSCRIPT = Path.home() / "Library/Application Support/Quipsly/MediaVault/sessions/episode-1-codex-real-edit-v1-youtube-transcript.quipsly-session.json"


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def active_sequence(payload: dict[str, Any]) -> dict[str, Any]:
    project = dict_value(payload.get("project"))
    sequences = list_value(project.get("sequences"))
    active_id = text_value(payload.get("activeSequenceId"))
    if active_id:
        for sequence in sequences:
            sequence = dict_value(sequence)
            if text_value(sequence.get("id")) == active_id:
                return sequence
    return dict_value(sequences[0]) if sequences else {}


def short_range(short: dict[str, Any]) -> tuple[float | None, float | None]:
    start, end = selected_time_range(short, {})
    if start is None:
        start = safe_float(short.get("startTime"))
    if end is None:
        end = safe_float(short.get("endTime"))
    duration = safe_float(short.get("duration"))
    if start is not None and end is None and duration is not None:
        end = start + duration
    return start, end


def meaningful_tokens(text: str) -> set[str]:
    stop = {
        "the", "and", "for", "that", "this", "with", "you", "your", "was", "are", "but", "not",
        "what", "when", "where", "why", "how", "just", "from", "into", "have", "has", "had",
        "rough", "transcript", "episode", "review", "candidate", "short", "moment",
    }
    return {token for token in re.findall(r"[a-z0-9']+", text.lower()) if len(token) > 2 and token not in stop}


def transcript_alignment(short: dict[str, Any], excerpt: str) -> dict[str, Any]:
    metadata = " ".join(
        text_value(short.get(key))
        for key in ["title", "hookText", "captionDraft", "primaryOverlayText", "notes"]
    )
    meta_tokens = meaningful_tokens(metadata)
    excerpt_tokens = meaningful_tokens(excerpt)
    overlap = sorted(meta_tokens & excerpt_tokens)
    score = round(len(overlap) / max(1, min(len(meta_tokens), 18)), 2)
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
        "metadataTokenCount": len(meta_tokens),
        "excerptTokenCount": len(excerpt_tokens),
        "truth": "Alignment is a lightweight token-overlap warning, not proof. Low overlap means proof-watch or transcript sync review before trusting scaffolds.",
    }


def readiness_label(short: dict[str, Any], transcript: dict[str, Any], scaffold: dict[str, str], alignment: dict[str, Any]) -> str:
    has_export = text_value(short.get("exportStatus")).lower() == "exported"
    has_review = text_value(short.get("reviewStatus")) in {"keep", "ready-for-human-review", "ready", "approved"}
    has_transcript = bool(text_value(transcript.get("excerpt")))
    has_hook = bool(text_value(short.get("hookText")) or text_value(scaffold.get("hook")))
    has_caption = bool(text_value(short.get("captionDraft")) or text_value(scaffold.get("caption")))
    if has_transcript and alignment.get("label") == "mismatch-risk":
        return "needs-transcript-alignment-review"
    if has_transcript and alignment.get("label") == "weak":
        return "weak-transcript-alignment"
    if has_export and has_transcript and has_hook and has_caption and has_review:
        return "review-ready-with-transcript"
    if has_export and has_transcript and has_hook and has_caption:
        return "needs-human-review"
    if has_transcript:
        return "needs-story-packaging"
    if has_export:
        return "exported-needs-transcript"
    return "needs-export-or-transcript"


def build_board(session_path: Path, transcript_path: Path, limit: int | None = None) -> dict[str, Any]:
    session_payload = load_json(session_path)
    sequence = active_sequence(session_payload)
    shorts = [dict_value(item) for item in list_value(sequence.get("shortClipQueue"))]
    if limit:
        shorts = shorts[:limit]

    items: list[dict[str, Any]] = []
    for index, short in enumerate(shorts, start=1):
        start, end = short_range(short)
        transcript: dict[str, Any] = {}
        if start is not None and end is not None and end > start and transcript_path.exists():
            transcript = extract_transcript_context_from_session(transcript_path, start, end)
        excerpt = text_value(transcript.get("excerpt"))
        topic = clean_topic(text_value(short.get("title"), "this moment"))
        scaffold = transcript_story_scaffold(excerpt, topic) if excerpt else {}
        alignment = transcript_alignment(short, excerpt)
        risks: list[str] = []
        if not excerpt:
            risks.append("No transcript overlap found for this short range.")
        elif alignment.get("label") == "mismatch-risk":
            risks.append("Transcript excerpt has low overlap with the short title/hook/caption. Treat as likely sync or range mismatch before using scaffold.")
        elif alignment.get("label") == "weak":
            risks.append("Transcript excerpt only weakly matches the short metadata. Proof-watch before trusting scaffold.")
        if is_generic_candidate_title(text_value(short.get("title"))):
            risks.append("Generic candidate title still needs story packaging.")
        if not text_value(short.get("captionDraft")) and not text_value(scaffold.get("caption")):
            risks.append("No caption plan yet.")
        if text_value(short.get("reviewStatus")) not in {"keep", "ready-for-human-review", "ready", "approved"}:
            risks.append("Needs explicit human/agent review state before publishing.")

        items.append(
            {
                "rank": index,
                "id": text_value(short.get("id")),
                "title": text_value(short.get("title"), "Untitled short"),
                "range": {"start": start, "end": end, "duration": (end - start) if start is not None and end is not None else safe_float(short.get("duration"))},
                "reviewStatus": text_value(short.get("reviewStatus")),
                "exportStatus": text_value(short.get("exportStatus")),
                "readiness": readiness_label(short, transcript, scaffold, alignment),
                "transcript": {
                    "available": bool(excerpt),
                    "source": text_value(transcript.get("source")),
                    "segmentCount": transcript.get("segmentCount", 0),
                    "excerpt": excerpt[:500],
                },
                "transcriptAlignment": alignment,
                "storyScaffold": {
                    "label": text_value(scaffold.get("label"), "none"),
                    "hook": text_value(scaffold.get("hook") or short.get("hookText")),
                    "turn": text_value(scaffold.get("turn")),
                    "payoff": text_value(scaffold.get("payoff")),
                    "caption": text_value(scaffold.get("caption") or short.get("captionDraft")),
                    "overlay": text_value(scaffold.get("overlay") or short.get("primaryOverlayText")),
                },
                "risks": risks,
                "safeNextAction": "Proof-watch and mark Keep/Refine/Reject" if excerpt else "Generate/import transcript context or proof-watch manually",
            }
        )

    counts: dict[str, int] = {}
    for item in items:
        counts[item["readiness"]] = counts.get(item["readiness"], 0) + 1

    return {
        "status": "shorts_story_repair_board",
        "model": "quipsly-shorts-story-repair-board",
        "version": "2026-07-04.shorts-story-repair-board.v1",
        "sessionPath": str(session_path),
        "transcriptPath": str(transcript_path),
        "sequenceTitle": text_value(sequence.get("title")),
        "shortCount": len(items),
        "readinessCounts": counts,
        "items": items,
        "truth": "Read-only board from saved session and transcript sidecar. It does not mutate media, session JSON, exports, receipts, or review state.",
    }


def render_markdown(board: dict[str, Any]) -> str:
    lines = [
        "# Shorts story repair board",
        "",
        f"- Sequence: {board.get('sequenceTitle', '')}",
        f"- Shorts: {board.get('shortCount', 0)}",
        f"- Session: `{board.get('sessionPath', '')}`",
        f"- Transcript: `{board.get('transcriptPath', '')}`",
        f"- Truth: {board.get('truth', '')}",
        "",
        "## Readiness counts",
    ]
    for label, count in sorted(dict_value(board.get("readinessCounts")).items()):
        lines.append(f"- `{label}`: {count}")
    lines.extend(["", "## Shorts", ""])
    for item in list_value(board.get("items")):
        item = dict_value(item)
        scaffold = dict_value(item.get("storyScaffold"))
        transcript = dict_value(item.get("transcript"))
        alignment = dict_value(item.get("transcriptAlignment"))
        range_info = dict_value(item.get("range"))
        lines.extend(
            [
                f"### {item.get('rank')}. {item.get('title')}",
                "",
                f"- ID: `{item.get('id', '')}`",
                f"- Range: `{range_info.get('start')}` -> `{range_info.get('end')}` ({range_info.get('duration')}s)",
                f"- Review/export: `{item.get('reviewStatus', '')}` / `{item.get('exportStatus', '')}`",
                f"- Readiness: `{item.get('readiness', '')}`",
                f"- Transcript: `{transcript.get('available', False)}` ({transcript.get('segmentCount', 0)} segments)",
                f"- Transcript alignment: `{alignment.get('label', 'unknown')}` score `{alignment.get('score', 0)}` overlap `{', '.join(alignment.get('overlapTokens') or [])}`",
                f"- Scaffold: `{scaffold.get('label', 'none')}`",
                f"- Hook: {scaffold.get('hook', '')}",
                f"- Turn: {scaffold.get('turn', '')}",
                f"- Payoff: {scaffold.get('payoff', '')}",
                f"- Caption: {scaffold.get('caption', '')}",
                f"- Overlay: {scaffold.get('overlay', '')}",
                f"- Next: {item.get('safeNextAction', '')}",
            ]
        )
        risks = [text_value(risk) for risk in list_value(item.get("risks")) if text_value(risk)]
        if risks:
            lines.append("- Risks: " + "; ".join(risks))
        excerpt = text_value(transcript.get("excerpt"))
        if excerpt:
            lines.append(f"- Transcript excerpt: {excerpt}")
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
    board = build_board(args.session, args.transcript, args.limit)
    output = json.dumps(board, indent=2, sort_keys=True) if args.json else render_markdown(board)
    if args.save:
        args.save.parent.mkdir(parents=True, exist_ok=True)
        args.save.write_text(output, encoding="utf-8")
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
