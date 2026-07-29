#!/usr/bin/env python3
"""Build a watch/listen-first cut-quality workbench for recommended shorts.

This is not an auto-approval system and not a fake transcript reader. It merges
the recommended shorts theater, transcript readiness, and transcript workorders
into one editorial checklist so humans and agents can improve cuts without
pretending metadata is more certain than it is.
"""
from __future__ import annotations

import argparse
import html
import json
from collections import Counter
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
DEFAULT_TRANSCRIPT_READINESS_JSON = (
    DEFAULT_ROOT
    / "shorts-command-room"
    / "transcript-readiness"
    / "quipsly-studio-shorts-transcript-readiness.json"
)
DEFAULT_TRANSCRIPT_WORKORDERS_JSON = (
    DEFAULT_ROOT
    / "shorts-command-room"
    / "transcript-workorders"
    / "quipsly-studio-shorts-transcript-workorders.json"
)
DEFAULT_TRANSCRIPT_REVIEW_COCKPIT_JSON = (
    DEFAULT_ROOT
    / "shorts-command-room"
    / "transcript-review-cockpit"
    / "quipsly-studio-shorts-transcript-review-cockpit.json"
)
DEFAULT_OUTPUT_DIR = DEFAULT_ROOT / "shorts-command-room" / "cut-quality-workbench"
DEFAULT_BASENAME = "quipsly-studio-shorts-cut-quality-workbench"
SCHEMA = "quipsly.studio.shorts-cut-quality-workbench.v1"
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


def index_by_short_id(rows: list[Any]) -> dict[str, dict[str, Any]]:
    indexed: dict[str, dict[str, Any]] = {}
    for row in rows:
        if isinstance(row, dict) and row.get("shortId"):
            indexed[str(row["shortId"])] = row
    return indexed


def duration_lens(seconds: float) -> dict[str, str]:
    if seconds <= 0:
        return {
            "bucket": "unknown-duration",
            "editQuestion": "Confirm duration before judging pacing.",
            "tradeoff": "Without a duration, the reviewer can only inspect the file directly.",
        }
    if seconds < 12:
        return {
            "bucket": "micro-hook",
            "editQuestion": "Does the first second make sense without context, or does it need a slightly longer setup?",
            "tradeoff": "Very short clips can feel punchy, but they often become confusing if the premise is hidden.",
        }
    if seconds <= 35:
        return {
            "bucket": "tight-social-idea",
            "editQuestion": "Does the clip have hook, turn, and payoff without feeling over-tightened?",
            "tradeoff": "This is a strong Reels/Shorts length if cadence still sounds human.",
        }
    if seconds <= 60:
        return {
            "bucket": "mini-argument",
            "editQuestion": "Is every beat earning its place, or should this become two shorter ideas?",
            "tradeoff": "Longer shorts can carry nuance, but weak openings lose viewers fast.",
        }
    return {
        "bucket": "long-short",
        "editQuestion": "Is this intentionally long for story/context, or should it be split into separate posts?",
        "tradeoff": "Platform limits may allow it, but viewer retention usually asks for sharper structure.",
    }


def transcript_lens(readiness: dict[str, Any], workorder: dict[str, Any], cockpit: dict[str, Any]) -> dict[str, Any]:
    source_status = str(readiness.get("status") or workorder.get("status") or "unknown")
    cockpit_status = str(cockpit.get("status") or "")
    kind = str(workorder.get("kind") or "")
    asr_summary = cockpit.get("asrDraftSummary") if isinstance(cockpit.get("asrDraftSummary"), dict) else {}
    ledger = cockpit.get("ledger") if isinstance(cockpit.get("ledger"), dict) else {}
    sample = str(asr_summary.get("sample") or "")
    word_count = int(asr_summary.get("wordCountApprox") or 0)
    segment_count = int(asr_summary.get("segmentCount") or 0)
    base = {
        "sourceStatus": source_status,
        "cockpitStatus": cockpit_status or "none",
        "sample": sample,
        "wordCountApprox": word_count,
        "segmentCount": segment_count,
        "ledgerEvents": int(ledger.get("eventCount") or 0),
        "acceptedForEditReview": cockpit_status == "accepted-for-edit-review",
    }
    if cockpit_status == "accepted-for-edit-review":
        return {
            **base,
            "status": "normalized-transcript-edit-review",
            "kind": kind or "use-normalized-transcript-for-edit-review",
            "question": "Do the accepted edit-review words support the hook, caption timing, and cut rhythm?",
            "risk": "This transcript is accepted for edit review, not final caption publication. Spot-check any word that drives a cut.",
            "next": "Use transcript context for hook/cadence/caption review, then spot-check audio before final export.",
        }
    if sample:
        return {
            **base,
            "status": "machine-draft-word-evidence",
            "kind": kind or "review-machine-draft-word-evidence",
            "question": "Does the ASR draft capture the real hook and natural thought boundaries?",
            "risk": "Machine words can hallucinate or miss cadence; review before using them for semantic cuts or captions.",
            "next": "Review the ASR/caption draft against audio before letting it guide word-aware cuts.",
        }
    if source_status == "timed-captions-available":
        return {
            **base,
            "status": source_status,
            "kind": kind or "verify-timed-captions",
            "question": "Do timed captions match the actual spoken rhythm and speaker sense?",
            "risk": "Caption files can be present but still wrong enough to mislead cut timing.",
            "next": "Verify caption timing by listening before using word-aware cut decisions.",
        }
    if source_status == "structured-transcript-candidate":
        return {
            **base,
            "status": source_status,
            "kind": kind or "verify-structured-transcript",
            "question": "Are transcript segments timed tightly enough to guide edits?",
            "risk": "Structured text is useful for meaning, but not automatically precise enough for cuts.",
            "next": "Verify timing and speaker labels before caption-aware claims.",
        }
    if source_status == "text-only-evidence":
        return {
            **base,
            "status": source_status,
            "kind": kind or "upgrade-text-to-timed-captions",
            "question": "Does the text capture the idea, and what timed source should anchor captions?",
            "risk": "Text-only evidence can guide copy but not frame-accurate or word-aware editing.",
            "next": "Upgrade to timed captions or keep review explicitly watch/listen-based.",
        }
    return {
        **base,
        "status": source_status,
        "kind": kind or "create-or-link-word-evidence",
        "question": "What is actually being said, and where are the natural breath/thought boundaries?",
        "risk": "Without word evidence, do not claim caption-aware or word-timed quality.",
        "next": "Watch/listen first, then create or link transcript/caption sidecars before word-aware refinements.",
    }


def platform_lens(item: dict[str, Any]) -> list[str]:
    aspect = str(item.get("aspect") or "unknown")
    has_audio = bool(item.get("hasAudio"))
    has_video = bool(item.get("hasVideo"))
    width = int(item.get("width") or 0)
    height = int(item.get("height") or 0)
    checks: list[str] = []
    if aspect != "9:16":
        checks.append("Frame this as a vertical-platform risk: output is not currently 9:16.")
    elif width < 720 or height < 1280:
        checks.append("Confirm resolution is acceptable for vertical platforms.")
    else:
        checks.append("9:16 geometry is plausible; inspect crop, face placement, and captions.")
    checks.append("Audio is present; listen for cadence, mouth-clicks, clipping, and awkward over-tightening." if has_audio else "Audio missing; do not move this toward social review until fixed.")
    checks.append("Video is present; inspect jump cuts, eye-line continuity, and face-safe caption space." if has_video else "Video missing; route to audio/podcast use or repair before social review.")
    return checks


def cut_questions(item: dict[str, Any], transcript: dict[str, Any]) -> list[dict[str, str]]:
    duration = float(item.get("durationSeconds") or 0)
    duration_info = duration_lens(duration)
    title = str(item.get("title") or item.get("shortId") or "this short")
    return [
        {
            "dimension": "hook",
            "question": "Would a stranger know why to keep watching in the first 1-2 seconds?",
            "watchFor": "A concrete problem, surprise, claim, image, or emotional turn. If the opening is throat-clearing, trim or choose a stronger in-point.",
        },
        {
            "dimension": "cadence",
            "question": duration_info["editQuestion"],
            "watchFor": duration_info["tradeoff"],
        },
        {
            "dimension": "j-cut-l-cut",
            "question": "Would an audio lead or audio tail make the cut feel more human?",
            "watchFor": "Use J/L cuts around reactions, breaths, or idea handoffs. Avoid robotic butt-cuts when the thought needs air.",
        },
        {
            "dimension": "jump-cut-cover",
            "question": "Does any same-speaker jump cut need a reaction cover, crop punch-in, B-roll, or intentional pause?",
            "watchFor": "Hard jumps on one face feel cheap unless the energy is intentionally snappy.",
        },
        {
            "dimension": "reaction",
            "question": "Is there a human reaction or listening beat that should be preserved instead of cut away?",
            "watchFor": "Do not cut every silence. Some pauses are the story thinking out loud.",
        },
        {
            "dimension": "captions",
            "question": transcript["question"],
            "watchFor": transcript["risk"],
        },
        {
            "dimension": "platform-fit",
            "question": f"Should {title} be one post, a teaser, or part of a multi-post thread?",
            "watchFor": "Match YouTube Shorts/Reels punchiness without sacrificing the actual idea.",
        },
    ]


def build_item(item: dict[str, Any], readiness: dict[str, Any], workorder: dict[str, Any], cockpit: dict[str, Any]) -> dict[str, Any]:
    short_id = str(item.get("shortId") or "")
    transcript = transcript_lens(readiness, workorder, cockpit)
    duration = duration_lens(float(item.get("durationSeconds") or 0))
    media_path = str(item.get("path") or readiness.get("mediaPath") or "")
    media_exists = bool(item.get("exists"))
    has_audio = bool(item.get("hasAudio"))
    has_video = bool(item.get("hasVideo"))
    if not media_exists or not has_audio or not has_video:
        readiness_level = "media-needs-repair"
    elif transcript["status"] in {"missing-word-evidence", "unknown"}:
        readiness_level = "watch-listen-first"
    elif transcript["status"] == "normalized-transcript-edit-review":
        readiness_level = "transcript-edit-review-ready"
    elif transcript["status"] == "machine-draft-word-evidence":
        readiness_level = "transcript-draft-review"
    elif transcript["status"] == "timed-captions-available":
        readiness_level = "caption-timing-review"
    else:
        readiness_level = "transcript-review"
    safe_commands = {
        "openShort": f"open {shell_quote(media_path)}" if media_path else "",
        "revealShort": f"open -R {shell_quote(media_path)}" if media_path else "",
        "focusedPacket": f"script/agentctl.sh studio-recommended-short-review-packet --short-id {shell_quote(short_id)}" if short_id else "",
        "evidenceDraftNeedsRefine": (
            f"script/agentctl.sh studio-recommended-short-evidence-draft --short-id {shell_quote(short_id)} "
            "--outcome refine --summary 'Watch/listen edit-quality notes: hook cadence crop caption audio ending tradeoff.'"
        ) if short_id else "",
    }
    if workorder.get("safeCommands"):
        safe_commands["transcriptWorkorderFolder"] = (workorder.get("safeCommands") or {}).get("makeFolder", "")
    cockpit_commands = cockpit.get("commands") if isinstance(cockpit.get("commands"), dict) else {}
    command_map = {
        "reviewTranscriptAcceptDryRun": "dryRunAccept",
        "reviewTranscriptAcceptForEditReview": "recordAcceptForEditReview",
        "reviewTranscriptNeedsCorrection": "recordNeedsCorrection",
        "reviewTranscriptHold": "recordHold",
    }
    for label, source_key in command_map.items():
        command = cockpit_commands.get(source_key)
        if command:
            safe_commands[label] = str(command)
    return {
        "shortId": short_id,
        "episode": item.get("episode"),
        "version": item.get("version"),
        "rank": item.get("rank"),
        "title": item.get("title"),
        "durationSeconds": item.get("durationSeconds"),
        "durationLabel": item.get("durationLabel"),
        "durationBucket": duration["bucket"],
        "aspect": item.get("aspect"),
        "mediaPath": media_path,
        "mediaUri": item.get("uri") or file_uri(media_path),
        "mediaExists": media_exists,
        "hasAudio": has_audio,
        "hasVideo": has_video,
        "reviewDecision": item.get("decision"),
        "reviewPriority": item.get("reviewPriority"),
        "reviewPriorityReason": item.get("reviewPriorityReason"),
        "readinessLevel": readiness_level,
        "transcript": transcript,
        "platformChecks": platform_lens(item),
        "editorQuestions": cut_questions(item, transcript),
        "safeCommands": safe_commands,
        "nextSafestAction": next_item_action(readiness_level, short_id, transcript),
        "truth": "Cut-quality workbench item only. It asks watch/listen questions and points at evidence. It is not an approval, export, publication, transcript, or edit mutation.",
    }


def next_item_action(readiness_level: str, short_id: str, transcript: dict[str, Any]) -> str:
    prefix = f"{short_id}: " if short_id else ""
    if readiness_level == "media-needs-repair":
        return prefix + "Repair or route around missing media/audio/video before judging social quality."
    if readiness_level == "watch-listen-first":
        return prefix + "Watch/listen, then draft specific edit-quality notes; do not make word-aware claims yet."
    if readiness_level == "transcript-draft-review":
        return prefix + "Review the ASR draft against audio, then accept, correct, or hold it before semantic/caption-aware editing."
    if readiness_level == "transcript-edit-review-ready":
        return prefix + "Use accepted transcript context to refine hook/cadence/captions, then spot-check audio before final caption approval."
    if readiness_level == "caption-timing-review":
        return prefix + "Verify captions against actual rhythm, then review hook/cadence/crop as a social short."
    return prefix + transcript["next"]


def build_board(theater_path: Path, readiness_path: Path, workorders_path: Path, cockpit_path: Path, limit: int) -> dict[str, Any]:
    theater = read_json(theater_path)
    readiness = read_json(readiness_path)
    workorders = read_json(workorders_path)
    cockpit = read_json(cockpit_path)
    readiness_by_short = index_by_short_id(readiness.get("items", []) if isinstance(readiness.get("items"), list) else [])
    workorders_by_short = index_by_short_id(workorders.get("workorders", []) if isinstance(workorders.get("workorders"), list) else [])
    cockpit_by_short = index_by_short_id(cockpit.get("items", []) if isinstance(cockpit.get("items"), list) else [])
    theater_items = [item for item in theater.get("items", []) if isinstance(item, dict)]
    if limit > 0:
        theater_items = theater_items[:limit]
    items = [
        build_item(
            item,
            readiness_by_short.get(str(item.get("shortId") or ""), {}),
            workorders_by_short.get(str(item.get("shortId") or ""), {}),
            cockpit_by_short.get(str(item.get("shortId") or ""), {}),
        )
        for item in theater_items
    ]
    levels = Counter(str(item.get("readinessLevel")) for item in items)
    transcripts = Counter(str((item.get("transcript") or {}).get("status")) for item in items)
    durations = Counter(str(item.get("durationBucket")) for item in items)
    transcript_words = sum(int((item.get("transcript") or {}).get("wordCountApprox") or 0) for item in items)
    transcript_segments = sum(int((item.get("transcript") or {}).get("segmentCount") or 0) for item in items)
    transcript_ledger_events = sum(int((item.get("transcript") or {}).get("ledgerEvents") or 0) for item in items)
    return {
        "schema": SCHEMA,
        "version": VERSION,
        "generatedAt": iso_now(),
        "sourceTheaterJson": str(theater_path),
        "sourceTranscriptReadinessJson": str(readiness_path),
        "sourceTranscriptWorkordersJson": str(workorders_path),
        "sourceTranscriptReviewCockpitJson": str(cockpit_path),
        "counts": {
            "items": len(items),
            "watchListenFirst": levels.get("watch-listen-first", 0),
            "captionTimingReview": levels.get("caption-timing-review", 0),
            "transcriptDraftReview": levels.get("transcript-draft-review", 0),
            "transcriptEditReviewReady": levels.get("transcript-edit-review-ready", 0),
            "transcriptReview": levels.get("transcript-review", 0),
            "mediaNeedsRepair": levels.get("media-needs-repair", 0),
            "missingWordEvidence": transcripts.get("missing-word-evidence", 0),
            "timedCaptionsAvailable": transcripts.get("timed-captions-available", 0),
            "machineDraftWordEvidence": transcripts.get("machine-draft-word-evidence", 0),
            "normalizedTranscriptEditReview": transcripts.get("normalized-transcript-edit-review", 0),
            "transcriptWordsApprox": transcript_words,
            "transcriptSegments": transcript_segments,
            "transcriptLedgerEvents": transcript_ledger_events,
            "tightSocialIdea": durations.get("tight-social-idea", 0),
            "miniArgument": durations.get("mini-argument", 0),
            "approvalCreated": False,
            "externalPublishing": False,
            "receiptTruthCreated": False,
        },
        "items": items,
        "nextSafestAction": next_board_action(items),
        "truth": "Read-only cut-quality workbench. It does not edit, export, approve, publish, run ASR, generate transcripts, mutate media, overwrite files, schedule posts, mutate accounts, or create receipt truth.",
    }


def next_board_action(items: list[dict[str, Any]]) -> str:
    for item in items:
        if item.get("readinessLevel") == "watch-listen-first":
            return item.get("nextSafestAction") or "Start with the first watch/listen-first short."
    for item in items:
        if item.get("readinessLevel") == "transcript-draft-review":
            return item.get("nextSafestAction") or "Start by reviewing ASR draft word evidence."
    for item in items:
        if item.get("readinessLevel") == "transcript-edit-review-ready":
            return item.get("nextSafestAction") or "Start by using accepted edit-review transcript context."
    for item in items:
        if item.get("readinessLevel") == "caption-timing-review":
            return item.get("nextSafestAction") or "Start by verifying timed captions."
    for item in items:
        if item.get("readinessLevel") == "media-needs-repair":
            return item.get("nextSafestAction") or "Start with media repair."
    return "Open the top short, watch it like a stranger, and draft specific edit-quality evidence before recording local intent."


def render_markdown(board: dict[str, Any]) -> str:
    lines = [
        "# Studio shorts cut-quality workbench",
        "",
        f"Generated: `{board.get('generatedAt')}`",
        f"Theater: `{board.get('sourceTheaterJson')}`",
        f"Transcript readiness: `{board.get('sourceTranscriptReadinessJson')}`",
        f"Transcript workorders: `{board.get('sourceTranscriptWorkordersJson')}`",
        f"Transcript review cockpit: `{board.get('sourceTranscriptReviewCockpitJson')}`",
        "",
        board.get("truth", ""),
        "",
        f"Next safest action: {board.get('nextSafestAction')}",
        "",
        "## Counts",
        "",
    ]
    for key, value in board.get("counts", {}).items():
        lines.append(f"- {key}: `{value}`")
    lines.extend(["", "## Cut-quality queue", ""])
    for item in board.get("items", []):
        lines.extend([
            f"### {item.get('rank')}. {item.get('shortId')} - {item.get('title')}",
            "",
            f"- Episode/version: `Episode {item.get('episode')}` / `{item.get('version')}`",
            f"- Duration/aspect: `{item.get('durationLabel')}` / `{item.get('aspect')}` / `{item.get('durationBucket')}`",
            f"- Readiness: `{item.get('readinessLevel')}`",
            f"- Transcript: `{(item.get('transcript') or {}).get('status')}` / `{(item.get('transcript') or {}).get('kind')}`",
            f"- Transcript cockpit: `{(item.get('transcript') or {}).get('cockpitStatus')}` / words approx `{(item.get('transcript') or {}).get('wordCountApprox')}` / segments `{(item.get('transcript') or {}).get('segmentCount')}` / ledger `{(item.get('transcript') or {}).get('ledgerEvents')}`",
            f"- File: `{item.get('mediaPath')}`",
            f"- Next: {item.get('nextSafestAction')}",
            "",
            "Platform checks:",
        ])
        sample = str((item.get("transcript") or {}).get("sample") or "")
        if sample:
            lines.extend(["", "Transcript sample:", "", f"> {sample}", ""])
        for check in item.get("platformChecks", []):
            lines.append(f"- {check}")
        lines.extend(["", "Editor questions:"])
        for question in item.get("editorQuestions", []):
            lines.append(f"- `{question.get('dimension')}`: {question.get('question')} Watch for: {question.get('watchFor')}")
        lines.extend(["", "Safe commands:"])
        for label, command in (item.get("safeCommands") or {}).items():
            if command:
                lines.append(f"- {label}: `{command}`")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def render_html(board: dict[str, Any]) -> str:
    metrics = "".join(
        f"<div><strong>{esc(value)}</strong><span>{esc(key)}</span></div>"
        for key, value in board.get("counts", {}).items()
        if key in {
            "items",
            "watchListenFirst",
            "captionTimingReview",
            "transcriptDraftReview",
            "transcriptEditReviewReady",
            "mediaNeedsRepair",
            "missingWordEvidence",
            "machineDraftWordEvidence",
            "normalizedTranscriptEditReview",
            "timedCaptionsAvailable",
        }
    )
    cards = "\n".join(render_item_html(item) for item in board.get("items", []))
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Quipsly Studio cut-quality workbench</title>
  <style>
    :root {{ color-scheme: dark; --soil:#15100b; --moss:#18271d; --fern:#8ee39a; --cream:#fff1d5; --honey:#f2c94c; --water:#77d7df; --clay:#d87358; --ink:#0c0f0c; --line:rgba(255,241,213,.16); }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; color:var(--cream); font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; background:radial-gradient(circle at 12% -8%,rgba(142,227,154,.18),transparent 30%),linear-gradient(135deg,var(--moss),var(--soil)); }}
    main {{ width:min(1480px,calc(100vw - 34px)); margin:0 auto; padding:34px 0 90px; }}
    header,.truth,.card {{ border:1px solid var(--line); border-radius:30px; background:rgba(255,241,213,.07); box-shadow:0 24px 80px rgba(0,0,0,.26); }}
    header {{ padding:30px; margin-bottom:16px; }}
    h1 {{ margin:0 0 8px; font-size:clamp(36px,5vw,72px); line-height:.92; letter-spacing:-.05em; }}
    h2 {{ margin:0; color:var(--honey); letter-spacing:.16em; text-transform:uppercase; font-size:13px; }}
    .lede {{ color:rgba(255,241,213,.78); font-size:18px; max-width:920px; line-height:1.55; }}
    .metrics {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(155px,1fr)); gap:10px; margin-top:22px; }}
    .metrics div {{ border:1px solid var(--line); border-radius:18px; padding:14px; background:rgba(0,0,0,.18); }}
    .metrics strong {{ display:block; font-size:28px; color:var(--fern); }}
    .metrics span {{ display:block; color:rgba(255,241,213,.64); font-size:12px; letter-spacing:.11em; text-transform:uppercase; }}
    .truth {{ padding:18px 22px; margin-bottom:16px; color:rgba(255,241,213,.76); }}
    .grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(420px,1fr)); gap:16px; }}
    .card {{ overflow:hidden; }}
    .card video {{ width:100%; aspect-ratio:9/16; max-height:520px; object-fit:contain; background:#050605; display:block; border-bottom:1px solid var(--line); }}
    .body {{ padding:20px; }}
    .meta {{ display:flex; flex-wrap:wrap; gap:8px; margin:10px 0 14px; }}
    .pill {{ border:1px solid var(--line); border-radius:999px; padding:6px 9px; background:rgba(0,0,0,.2); font-size:12px; color:rgba(255,241,213,.82); }}
    .good {{ color:var(--fern); }} .warn {{ color:var(--honey); }} .risk {{ color:var(--clay); }}
    ul {{ padding-left:18px; }} li {{ margin:6px 0; color:rgba(255,241,213,.76); line-height:1.42; }}
    code {{ color:var(--water); overflow-wrap:anywhere; }}
    button {{ appearance:none; border:1px solid var(--line); border-radius:999px; background:rgba(119,215,223,.14); color:var(--cream); padding:8px 11px; margin:4px 4px 0 0; cursor:pointer; }}
    .next {{ border-left:4px solid var(--honey); padding:10px 12px; background:rgba(242,201,76,.1); border-radius:12px; color:rgba(255,241,213,.88); }}
  </style>
</head>
<body>
<main>
  <header>
    <h2>Quipsly Studio</h2>
    <h1>Shorts cut-quality workbench</h1>
    <p class="lede">A watch/listen-first board for improving hooks, cadence, J/L cuts, jump-cut cover, reaction beats, captions, crop, and platform fit without pretending metadata is editorial proof.</p>
    <div class="metrics">{metrics}</div>
  </header>
  <section class="truth"><strong>Truth boundary:</strong> {esc(board.get('truth'))}<br><strong>Next:</strong> {esc(board.get('nextSafestAction'))}</section>
  <section class="grid">{cards}</section>
</main>
<script>
document.querySelectorAll('button[data-copy]').forEach((button) => {{
  button.addEventListener('click', async () => {{
    await navigator.clipboard.writeText(button.dataset.copy || '');
    const old = button.textContent;
    button.textContent = 'Copied';
    setTimeout(() => button.textContent = old, 900);
  }});
}});
</script>
</body>
</html>
"""


def render_item_html(item: dict[str, Any]) -> str:
    media = ""
    if item.get("mediaUri"):
        media = f"<video controls preload='metadata' src='{esc(item.get('mediaUri'))}'></video>"
    transcript = item.get("transcript") or {}
    readiness_class = "good" if item.get("readinessLevel") == "caption-timing-review" else ("risk" if item.get("readinessLevel") == "media-needs-repair" else "warn")
    questions = "".join(
        f"<li><strong>{esc(q.get('dimension'))}:</strong> {esc(q.get('question'))}<br><span>{esc(q.get('watchFor'))}</span></li>"
        for q in item.get("editorQuestions", [])
    )
    platform = "".join(f"<li>{esc(check)}</li>" for check in item.get("platformChecks", []))
    buttons = "".join(
        f"<button type='button' data-copy='{esc(command)}'>{esc(label)}</button>"
        for label, command in (item.get("safeCommands") or {}).items()
        if command
    )
    return f"""
<article class="card">
  {media}
  <div class="body">
    <h2>{esc(item.get('shortId'))}</h2>
    <h3>{esc(item.get('title'))}</h3>
    <div class="meta">
      <span class="pill">Episode {esc(item.get('episode'))}</span>
      <span class="pill">{esc(item.get('durationLabel'))}</span>
      <span class="pill">{esc(item.get('aspect'))}</span>
      <span class="pill {readiness_class}">{esc(item.get('readinessLevel'))}</span>
      <span class="pill">transcript: {esc(transcript.get('status'))}</span>
      <span class="pill">cockpit: {esc(transcript.get('cockpitStatus'))}</span>
      <span class="pill">words: {esc(transcript.get('wordCountApprox'))}</span>
      <span class="pill">segments: {esc(transcript.get('segmentCount'))}</span>
    </div>
    <p class="next">{esc(item.get('nextSafestAction'))}</p>
    <h4>Transcript evidence sample</h4>
    <p>{esc(transcript.get('sample') or 'No transcript sample linked yet. Watch/listen first before making word-aware claims.')}</p>
    <h4>Platform checks</h4>
    <ul>{platform}</ul>
    <h4>Editor questions</h4>
    <ul>{questions}</ul>
    <h4>Safe commands</h4>
    {buttons}
    <p><code>{esc(item.get('mediaPath'))}</code></p>
  </div>
</article>
"""


def write_outputs(board: dict[str, Any], output_dir: Path, basename: str, mode: str) -> dict[str, str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    paths = {
        "json": output_dir / f"{basename}.json",
        "markdown": output_dir / f"{basename}.md",
        "html": output_dir / f"{basename}.html",
    }
    if mode in {"json", "all"}:
        payload = dict(board)
        payload["artifactPaths"] = {key: str(path) for key, path in paths.items()}
        paths["json"].write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
    if mode in {"markdown", "all"}:
        paths["markdown"].write_text(render_markdown(board), encoding="utf-8")
    if mode in {"html", "all"}:
        paths["html"].write_text(render_html(board), encoding="utf-8")
    return {key: str(path) for key, path in paths.items()}


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the Studio shorts cut-quality workbench.")
    parser.add_argument("--theater", default=str(DEFAULT_THEATER_JSON), help="Recommended shorts theater JSON.")
    parser.add_argument("--readiness", default=str(DEFAULT_TRANSCRIPT_READINESS_JSON), help="Transcript readiness JSON.")
    parser.add_argument("--workorders", default=str(DEFAULT_TRANSCRIPT_WORKORDERS_JSON), help="Transcript workorders JSON.")
    parser.add_argument("--transcript-cockpit", default=str(DEFAULT_TRANSCRIPT_REVIEW_COCKPIT_JSON), help="Transcript review cockpit JSON.")
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR), help="Output directory.")
    parser.add_argument("--basename", default=DEFAULT_BASENAME, help="Output basename.")
    parser.add_argument("--limit", type=int, default=0, help="Limit item count. 0 means no limit.")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--json", action="store_true", help="Write JSON only.")
    group.add_argument("--markdown", action="store_true", help="Write Markdown only.")
    group.add_argument("--html", action="store_true", help="Write HTML only.")
    group.add_argument("--all", action="store_true", help="Write JSON, Markdown, and HTML.")
    args = parser.parse_args()

    mode = "all" if args.all or not (args.json or args.markdown or args.html) else ("json" if args.json else "markdown" if args.markdown else "html")
    board = build_board(Path(args.theater), Path(args.readiness), Path(args.workorders), Path(args.transcript_cockpit), args.limit)
    paths = write_outputs(board, Path(args.output_dir), args.basename, mode)
    print(json.dumps({
        "ok": True,
        "artifactPaths": {"folder": str(Path(args.output_dir)), **paths},
        "counts": board.get("counts", {}),
        "nextSafestAction": board.get("nextSafestAction"),
        "truth": board.get("truth"),
    }, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
