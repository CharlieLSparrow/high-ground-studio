#!/usr/bin/env python3
"""Build a Nest writing review desk from current draft packets.

This is a local review/readiness surface. It scans versioned draft packets,
chooses the latest packet per task, and gives humans/Codex a calm queue for
review, revision, source comparison, and platform packet prep. It never mutates
source files or canonical manuscripts and never publishes anything.
"""
from __future__ import annotations

import csv
import html
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_NEST_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/NestWriting")
DEFAULT_OUTPUT_ROOT = DEFAULT_NEST_ROOT / "WritingReviewDesks"
LATEST_POINTER = DEFAULT_NEST_ROOT / "latest-nest-writing-review-desk.json"
SCHEMA = "quipsly.nest-writing.review-desk.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-writing-review-desk")


def esc(value: Any) -> str:
    return html.escape(str(value or ""))


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def load_json(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def as_int(value: Any) -> int:
    try:
        return int(value or 0)
    except Exception:
        return 0


def preview_text(value: Any, limit: int = 540) -> str:
    if isinstance(value, dict):
        text = str(value.get("bodyPreview") or value.get("draft") or value.get("text") or json.dumps(value, sort_keys=True))
    elif isinstance(value, list):
        text = " ".join(str(item) for item in value[:6])
    else:
        text = str(value or "")
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) > limit:
        return text[: limit - 1].rstrip() + "…"
    return text


def classify_status(packet: dict[str, Any]) -> tuple[str, str]:
    counts = packet.get("counts") if isinstance(packet.get("counts"), dict) else {}
    platform_count = as_int(counts.get("platformPacketCount") or len(packet.get("platformPackets") or {}))
    source_count = as_int(counts.get("sourceCount") or packet.get("sourceCount"))
    if source_count == 0:
        return "needs-source-trail", "Find or rebuild source trail before treating this draft as useful."
    if platform_count == 0:
        return "needs-platform-prep", "Draft exists, but platform packets are not ready yet."
    if str(packet.get("status") or "").endswith("human-review") or "review" in str(packet.get("status") or ""):
        return "needs-human-review", "Compare draft against source trail, then choose revise, approve, hold, or split."
    return "review-ready", "Open the draft and make the next reversible writing decision."


def draft_text(packet: dict[str, Any]) -> str:
    draft_preview = packet.get("draftPreview")
    if isinstance(draft_preview, dict):
        pieces: list[str] = []
        for key in ("headline", "dek", "reviewerNote"):
            if draft_preview.get(key):
                pieces.append(str(draft_preview.get(key)))
        for item in draft_preview.get("draftCopy") or []:
            pieces.append(str(item))
        for section in draft_preview.get("sections") or []:
            if isinstance(section, dict):
                pieces.append(str(section.get("heading") or ""))
                pieces.append(str(section.get("body") or ""))
        return re.sub(r"\s+", " ", " ".join(pieces)).strip()
    return preview_text(draft_preview, 4000)


def qa_flags(packet: dict[str, Any], title: str, source_count: int, platform_count: int) -> list[str]:
    text = draft_text(packet).lower()
    task = packet.get("task") if isinstance(packet.get("task"), dict) else {}
    word_count = as_int(task.get("wordCount"))
    flags: list[str] = []
    if source_count == 0:
        flags.append("missing-source-trail")
    if platform_count == 0:
        flags.append("missing-platform-packets")
    if "/" in title or title.endswith((".md", ".mdx", ".docx")):
        flags.append("path-like-title")
    if any(token in text for token in ("sourcedocument", "workflowstatus", "publicationstatus", "canonical true", "sourcebaseline")):
        flags.append("frontmatter-or-scaffold-noise")
    if "this is a source-backed outline and revision packet" in text or "not a canonical rewrite" in text:
        flags.append("review-scaffold-still-in-draft")
    if word_count >= 10000:
        flags.append("large-source-needs-smaller-human-pass")
    if len(text) < 280:
        flags.append("thin-draft")
    return flags


def recommended_decision(flags: list[str], review_status: str) -> str:
    if review_status == "needs-source-trail" or "missing-source-trail" in flags:
        return "needs-source-check"
    if "missing-platform-packets" in flags:
        return "revise"
    if any(flag in flags for flag in ("frontmatter-or-scaffold-noise", "review-scaffold-still-in-draft", "path-like-title")):
        return "revise"
    if "large-source-needs-smaller-human-pass" in flags:
        return "split"
    if review_status == "needs-human-review":
        return "approve-for-human-next-pass"
    return "hold"


def writing_move_options(flags: list[str], review_status: str, decision: str) -> list[dict[str, str]]:
    options: list[dict[str, str]] = []
    def add(key: str, label: str, why: str, safe_output: str) -> None:
        if key not in {item["key"] for item in options}:
            options.append({"key": key, "label": label, "why": why, "safeOutput": safe_output})

    if decision == "needs-source-check" or review_status == "needs-source-trail":
        add("source-check", "Check source trail", "Do not polish a draft whose source trail is missing or suspect.", "source comparison notes")
    if decision == "split" or "large-source-needs-smaller-human-pass" in flags:
        add("split", "Split into smaller pass", "Large source sections create review anxiety; shrink the decision surface.", "smaller draft packet plan")
    if decision == "revise" or any(flag in flags for flag in ("frontmatter-or-scaffold-noise", "review-scaffold-still-in-draft", "path-like-title", "missing-platform-packets")):
        add("revise", "Revise with source visible", "Clean scaffolding/noise while preserving the human voice and evidence trail.", "revision notes or alternate draft")
    if "thin-draft" in flags:
        add("expand", "Expand from source", "The draft is too thin to review well; add substance before promotion.", "expanded source-backed draft")
    if review_status in {"needs-human-review", "review-ready"}:
        add("promote-review", "Promote to human next pass", "If voice, source, and structure feel right, move it toward review instead of tinkering forever.", "human review note")
    add("hold", "Hold without shame", "If the next move is unclear, preserve the packet and continue another row.", "hold note with reason")
    return options


def review_note_template(
    *,
    task_id: str,
    title: str,
    decision: str,
    primary_move: str,
    flags: list[str],
    source_count: int,
    platform_count: int,
) -> dict[str, Any]:
    """Return a local note shape for human/agent review without writing it anywhere."""
    flag_text = ", ".join(flags) if flags else "none"
    return {
        "schema": "quipsly.nest-writing.review-note-template.v1",
        "taskId": task_id,
        "title": title,
        "suggestedDecision": decision,
        "suggestedWritingMove": primary_move,
        "reviewer": "<human-or-agent-name>",
        "sourceCount": source_count,
        "platformPacketCount": platform_count,
        "reviewFlags": flags,
        "decisionOptions": ["revise", "approve-for-human-next-pass", "hold", "split", "needs-source-check"],
        "sourceQuestions": [
            "What source passage or context makes this draft stronger?",
            "What claim, timeline point, quote, or framing needs source confirmation?",
            "What should stay visibly uncertain instead of being polished into false confidence?",
        ],
        "voiceQuestions": [
            "Does this preserve the author voice, or did it flatten the style?",
            "What sentence or section feels most alive and should be protected?",
            "What sentence or section feels like scaffold, filler, or generic AI prose?",
        ],
        "markdownTemplate": (
            f"## Review note: {title}\n\n"
            f"- Task: `{task_id}`\n"
            f"- Suggested decision: `{decision}`\n"
            f"- Suggested writing move: `{primary_move}`\n"
            f"- Review flags: `{flag_text}`\n"
            f"- Source count: `{source_count}`\n"
            f"- Platform packets: `{platform_count}`\n\n"
            "### Source check\n"
            "- Evidence used:\n"
            "- Uncertainty or missing context:\n\n"
            "### Voice and structure\n"
            "- Preserve:\n"
            "- Revise:\n"
            "- Cut or split:\n\n"
            "### Next safe action\n"
            "- Decision to record later: `revise | approve-for-human-next-pass | hold | split | needs-source-check`\n"
            "- Canon/publication boundary: do not replace manuscript text or publish from this note.\n"
        ),
        "truth": "Review note template only. It does not write review state, mutate sources, replace canon, publish, upload, schedule, or create receipts.",
    }


def packet_paths(nest_root: Path) -> list[Path]:
    draft_root = nest_root / "DraftPackets"
    if not draft_root.exists():
        return []
    return sorted(draft_root.glob("*/draft-packet.json"), key=lambda path: path.stat().st_mtime, reverse=True)


def latest_packets_by_task(nest_root: Path) -> list[dict[str, Any]]:
    seen: set[str] = set()
    packets: list[dict[str, Any]] = []
    for path in packet_paths(nest_root):
        packet = load_json(path)
        task_id = str(packet.get("taskId") or packet.get("task", {}).get("taskId") or path.parent.name)
        if task_id in seen:
            continue
        seen.add(task_id)
        packet["_packetPath"] = str(path)
        packet["_packetMtime"] = path.stat().st_mtime
        packets.append(packet)
    return packets


def row_from_packet(packet: dict[str, Any], index: int) -> dict[str, Any]:
    counts = packet.get("counts") if isinstance(packet.get("counts"), dict) else {}
    task = packet.get("task") if isinstance(packet.get("task"), dict) else {}
    task_id = str(packet.get("taskId") or task.get("taskId") or f"draft-{index:03d}")
    title = str(packet.get("title") or task.get("title") or task_id)
    review_status, review_next = classify_status(packet)
    html_path = str(packet.get("htmlPath") or Path(str(packet.get("_packetPath") or "")).parent / "index.html")
    markdown_path = str(packet.get("markdownPath") or Path(str(packet.get("_packetPath") or "")).parent / "START-HERE-draft-packet.md")
    platform_packets = packet.get("platformPackets") if isinstance(packet.get("platformPackets"), dict) else {}
    source_summary = packet.get("sourceTrailSummary") if isinstance(packet.get("sourceTrailSummary"), dict) else {}
    source_count = as_int(counts.get("sourceCount") or packet.get("sourceCount") or len(packet.get("sources") or []))
    platform_count = as_int(counts.get("platformPacketCount") or len(platform_packets))
    draft_preview = preview_text(packet.get("draftPreview") or packet.get("reviewStartHere") or next(iter(platform_packets.values()), {}))
    flags = qa_flags(packet, title, source_count, platform_count)
    decision = recommended_decision(flags, review_status)
    move_options = writing_move_options(flags, review_status, decision)
    primary_move = move_options[0]["key"] if move_options else "hold"
    note_template = review_note_template(
        task_id=task_id,
        title=title,
        decision=decision,
        primary_move=primary_move,
        flags=flags,
        source_count=source_count,
        platform_count=platform_count,
    )
    return {
        "rank": index,
        "taskId": task_id,
        "title": title,
        "reviewStatus": review_status,
        "sourceCount": source_count,
        "platformPacketCount": platform_count,
        "receiptSlots": as_int(counts.get("receiptSlots")),
        "currentPacketPath": str(packet.get("_packetPath") or ""),
        "htmlPath": html_path,
        "markdownPath": markdown_path,
        "openCommand": f"open {shell_quote(html_path)}" if html_path else "",
        "safeReviewDecision": "revise | approve-for-human-next-pass | hold | split | needs-source-check",
        "recommendedDecision": decision,
        "primaryWritingMove": primary_move,
        "writingMoveOptions": move_options,
        "reviewNoteTemplate": note_template,
        "writingMoveSummary": " | ".join(f"{item['label']}: {item['why']}" for item in move_options),
        "reviewFlags": flags,
        "reviewFlagSummary": ", ".join(flags) if flags else "none",
        "nextSafestAction": review_next,
        "humanReviewQuestion": "Does this draft preserve voice and source truth well enough to revise/promote, or should it be held/split/reworked?",
        "codexCanContinueWith": "Prepare revision notes, alternate openings, source comparisons, platform-copy variants, and question lists without replacing canonical text.",
        "sourceTrail": preview_text(source_summary, 360),
        "draftPreview": draft_preview,
        "platforms": sorted(platform_packets.keys()),
        "truth": "Draft packet review only. No source files or canonical manuscripts are mutated; no external publishing or receipt truth is created.",
    }


def build_payload(nest_root: Path, out_dir: Path) -> dict[str, Any]:
    packets = latest_packets_by_task(nest_root)
    rows = [row_from_packet(packet, index + 1) for index, packet in enumerate(packets)]
    first_review_target = next(
        (
            row
            for row in rows
            if row.get("reviewStatus") in {"needs-human-review", "needs-source-trail", "needs-platform-prep"}
            or row.get("reviewFlags")
        ),
        rows[0] if rows else {},
    )
    status_counts: dict[str, int] = {}
    flag_counts: dict[str, int] = {}
    decision_counts: dict[str, int] = {}
    writing_move_counts: dict[str, int] = {}
    for row in rows:
        status_counts[row["reviewStatus"]] = status_counts.get(row["reviewStatus"], 0) + 1
        decision_counts[row["recommendedDecision"]] = decision_counts.get(row["recommendedDecision"], 0) + 1
        writing_move_counts[row["primaryWritingMove"]] = writing_move_counts.get(row["primaryWritingMove"], 0) + 1
        for flag in row.get("reviewFlags") or []:
            flag_counts[flag] = flag_counts.get(flag, 0) + 1
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": "writing-review-desk-ready",
        "nestRoot": str(nest_root),
        "sessionDir": str(out_dir),
        "reviewRows": rows,
        "firstReviewTarget": first_review_target,
        "firstReviewNoteTemplate": first_review_target.get("reviewNoteTemplate") if first_review_target else {},
        "reviewProtocol": {
            "purpose": "Turn source-backed draft packets into clear human/agent review decisions without touching canonical manuscript text.",
            "allowed": [
                "review draft against source trail",
                "prepare transparent AI rewrite variants",
                "create revision notes and platform copy previews",
                "mark draft as needing human review in local notes/ledgers when explicitly commanded elsewhere",
            ],
            "notAllowedHere": [
                "replace canonical manuscript text",
                "publish, upload, schedule, or create receipt truth",
                "erase source weirdness or normalize voice without review",
                "mutate source files or old versions",
            ],
            "suggestedDecisionValues": ["revise", "approve-for-human-next-pass", "hold", "split", "needs-source-check"],
        },
        "counts": {
            "reviewRows": len(rows),
            "reviewNoteTemplates": len(rows),
            "needsHumanReview": status_counts.get("needs-human-review", 0),
            "needsSourceTrail": status_counts.get("needs-source-trail", 0),
            "needsPlatformPrep": status_counts.get("needs-platform-prep", 0),
            "reviewReady": status_counts.get("review-ready", 0),
            "recommendedRevise": decision_counts.get("revise", 0),
            "recommendedSplit": decision_counts.get("split", 0),
            "recommendedSourceCheck": decision_counts.get("needs-source-check", 0),
            "recommendedHumanNextPass": decision_counts.get("approve-for-human-next-pass", 0),
            "draftsWithReviewFlags": sum(1 for row in rows if row.get("reviewFlags")),
            "platformPackets": sum(row["platformPacketCount"] for row in rows),
            "receiptSlots": sum(row["receiptSlots"] for row in rows),
            "sourceFilesMutated": False,
            "canonicalManuscriptReplaced": False,
            "externalPublishing": False,
            "receiptTruthCreated": False,
            "versionsOverwritten": False,
        },
        "humanAsk": "Pick one draft row, compare it to the source trail, then decide revise, approve-for-human-next-pass, hold, split, or needs-source-check.",
        "agentSafeParallelWork": "Codex can prepare revision notes, alternate drafts, comparison summaries, and platform-copy variants without mutating canonical text or publishing.",
        "nextSafestAction": "Open the first needs-human-review draft packet and write a source-backed revision note before any canon or publication decision.",
        "reviewFlagCounts": flag_counts,
        "recommendedDecisionCounts": decision_counts,
        "writingMoveCounts": writing_move_counts,
        "truth": {
            "sourceFilesMutated": False,
            "canonicalManuscriptReplaced": False,
            "externalPublishing": False,
            "externalSchedulesCreated": False,
            "receiptTruthCreated": False,
            "versionsOverwritten": False,
            "description": "Writing review desk only. It reads local draft packets and writes versioned local review guidance.",
        },
    }


def write_csv(path: Path, payload: dict[str, Any]) -> None:
    fields = ["rank", "taskId", "title", "reviewStatus", "recommendedDecision", "primaryWritingMove", "writingMoveSummary", "reviewFlagSummary", "sourceCount", "platformPacketCount", "receiptSlots", "openCommand", "nextSafestAction", "humanReviewQuestion", "codexCanContinueWith", "htmlPath", "markdownPath"]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in payload.get("reviewRows") or []:
            writer.writerow({field: row.get(field, "") for field in fields})


def write_markdown(path: Path, payload: dict[str, Any]) -> None:
    lines = [
        "# Nest writing review desk",
        "",
        f"Generated: `{payload['generatedAt']}`",
        "",
        payload["truth"]["description"],
        "",
        "## Counts",
        "",
    ]
    for key, value in payload.get("counts", {}).items():
        lines.append(f"- {key}: `{value}`")
    lines.extend(["", "## Review rows", ""])
    for row in payload.get("reviewRows") or []:
        lines.append(f"### `{row.get('reviewStatus')}` {row.get('title')}")
        lines.append("")
        lines.append(f"- Source count: `{row.get('sourceCount')}`")
        lines.append(f"- Platform packets: `{row.get('platformPacketCount')}`")
        lines.append(f"- Decision values: `{row.get('safeReviewDecision')}`")
        lines.append(f"- Recommended decision: `{row.get('recommendedDecision')}`")
        lines.append(f"- Primary writing move: `{row.get('primaryWritingMove')}`")
        for move in row.get("writingMoveOptions") or []:
            lines.append(f"  - {move.get('label')}: {move.get('why')} Safe output: `{move.get('safeOutput')}`")
        lines.append(f"- Review flags: `{row.get('reviewFlagSummary')}`")
        lines.append(f"- Next: {row.get('nextSafestAction')}")
        lines.append(f"- Open: `{row.get('openCommand')}`")
        note_template = row.get("reviewNoteTemplate") if isinstance(row.get("reviewNoteTemplate"), dict) else {}
        if note_template.get("markdownTemplate"):
            lines.append("- Review note template:")
            lines.append("```md")
            lines.append(str(note_template.get("markdownTemplate")))
            lines.append("```")
        lines.append(f"- Preview: {row.get('draftPreview')}")
        lines.append("")
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def write_html(path: Path, payload: dict[str, Any]) -> None:
    cards = []
    for row in payload.get("reviewRows") or []:
        platforms = ", ".join(row.get("platforms") or [])
        cards.append(f"""
        <article class="card {esc(row.get('reviewStatus'))}">
          <div class="meta"><span>#{esc(row.get('rank'))}</span><span>{esc(row.get('reviewStatus'))}</span><span>{esc(row.get('sourceCount'))} source</span><span>{esc(row.get('platformPacketCount'))} platform packets</span></div>
          <h2>{esc(row.get('title'))}</h2>
          <p class="decision">Recommended: <b>{esc(row.get('recommendedDecision'))}</b> · flags: {esc(row.get('reviewFlagSummary'))}</p>
          <section><b>Writing moves</b>{''.join(f"<p><b>{esc(move.get('label'))}</b> · {esc(move.get('why'))}<br><small>Safe output: {esc(move.get('safeOutput'))}</small></p>" for move in (row.get('writingMoveOptions') or []))}</section>
          <p>{esc(row.get('nextSafestAction'))}</p>
          <section><b>Review question</b><p>{esc(row.get('humanReviewQuestion'))}</p></section>
          <section><b>Codex can continue with</b><p>{esc(row.get('codexCanContinueWith'))}</p></section>
          <section><b>Review note template</b><pre>{esc((row.get('reviewNoteTemplate') or {}).get('markdownTemplate') if isinstance(row.get('reviewNoteTemplate'), dict) else '')}</pre></section>
          <section><b>Draft preview</b><p>{esc(row.get('draftPreview'))}</p></section>
          <section><b>Platforms</b><p>{esc(platforms)}</p></section>
          <p><code>{esc(row.get('openCommand'))}</code></p>
          <details><summary>Source trail preview</summary><p>{esc(row.get('sourceTrail'))}</p><p>{esc(row.get('truth'))}</p></details>
        </article>
        """)
    counts = "".join(
        f"<div class='count'><b>{esc(key)}</b><span>{esc(value)}</span></div>"
        for key, value in payload.get("counts", {}).items()
        if not isinstance(value, bool)
    )
    html_doc = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Nest writing review desk</title>
<style>
:root {{ color-scheme: dark; --bg:#14120d; --panel:#211d14; --card:#2e281b; --ink:#fff2d5; --muted:#c8b88d; --line:#55492b; --gold:#edc957; --leaf:#98d77f; --water:#8ed9e6; --clay:#df8061; }}
* {{ box-sizing:border-box; }}
body {{ margin:0; color:var(--ink); background:radial-gradient(circle at 10% 0%, rgba(152,215,127,.2), transparent 35rem), var(--bg); font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif; }}
main {{ max-width:1240px; margin:0 auto; padding:34px 24px 72px; }}
.hero {{ border:1px solid var(--line); border-radius:28px; padding:28px; background:linear-gradient(135deg, rgba(33,29,20,.96), rgba(39,49,28,.82)); box-shadow:0 24px 80px rgba(0,0,0,.36); }}
.kicker {{ color:var(--gold); text-transform:uppercase; letter-spacing:.24em; font-size:.78rem; font-weight:900; }}
h1 {{ margin:8px 0 12px; font-size:clamp(2.2rem, 5vw, 4.8rem); line-height:.94; letter-spacing:-.05em; }}
.counts {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:12px; margin-top:22px; }}
.count {{ border:1px solid var(--line); border-radius:18px; background:rgba(0,0,0,.18); padding:14px; }}
.count b {{ display:block; color:var(--muted); text-transform:uppercase; letter-spacing:.11em; font-size:.72rem; }}
.count span {{ font-size:1.5rem; font-weight:900; color:var(--leaf); }}
.card {{ margin:18px 0; border:1px solid var(--line); border-radius:22px; padding:20px; background:rgba(46,40,27,.92); }}
.card.needs-human-review {{ border-color:rgba(237,201,87,.65); }}
.card.needs-source-trail {{ border-color:rgba(223,128,97,.75); }}
.card.review-ready {{ border-color:rgba(152,215,127,.6); }}
.meta {{ display:flex; flex-wrap:wrap; gap:8px; }}
.meta span {{ padding:5px 9px; border:1px solid var(--line); border-radius:999px; color:var(--muted); font-size:.75rem; font-weight:800; text-transform:uppercase; letter-spacing:.05em; }}
h2 {{ margin:12px 0 8px; }}
section {{ border:1px solid rgba(255,255,255,.08); border-radius:15px; margin:10px 0; padding:12px; background:rgba(0,0,0,.14); }}
b {{ color:var(--gold); }}
p {{ color:var(--muted); line-height:1.48; }}
code {{ color:var(--water); overflow-wrap:anywhere; }}
pre {{ white-space:pre-wrap; color:var(--water); overflow-wrap:anywhere; margin:0; }}
details {{ color:var(--muted); }}
</style>
</head>
<body><main>
<section class="hero">
  <p class="kicker">Nest writing</p>
  <h1>Review drafts without losing the source trail.</h1>
  <p>{esc(payload.get('humanAsk'))}</p>
  <div class="counts">{counts}</div>
</section>
{''.join(cards)}
</main></body></html>
"""
    path.write_text(html_doc, encoding="utf-8")


def prepare_output_dir() -> Path:
    out_dir = DEFAULT_OUTPUT_ROOT / stamp()
    base = out_dir
    counter = 2
    while out_dir.exists():
        out_dir = Path(f"{base}-{counter}")
        counter += 1
    out_dir.mkdir(parents=True, exist_ok=False)
    return out_dir


def review_priority(row: dict[str, Any]) -> int:
    status = str(row.get("reviewStatus") or "")
    decision = str(row.get("recommendedDecision") or "")
    if status == "needs-source-trail" or decision == "needs-source-check":
        return 10
    if status == "needs-human-review":
        return 20
    if decision == "revise":
        return 30
    if decision == "split":
        return 40
    if status == "review-ready":
        return 50
    return 60


def compact_review_row(row: dict[str, Any]) -> dict[str, Any]:
    note = row.get("reviewNoteTemplate") if isinstance(row.get("reviewNoteTemplate"), dict) else {}
    return {
        "rank": row.get("rank") or 0,
        "taskId": row.get("taskId") or "",
        "title": row.get("title") or "",
        "reviewStatus": row.get("reviewStatus") or "",
        "recommendedDecision": row.get("recommendedDecision") or "",
        "primaryWritingMove": row.get("primaryWritingMove") or "",
        "reviewFlags": row.get("reviewFlags") or [],
        "reviewFlagSummary": row.get("reviewFlagSummary") or "none",
        "sourceCount": row.get("sourceCount") or 0,
        "platformPacketCount": row.get("platformPacketCount") or 0,
        "receiptSlots": row.get("receiptSlots") or 0,
        "openCommand": row.get("openCommand") or "",
        "htmlPath": row.get("htmlPath") or "",
        "markdownPath": row.get("markdownPath") or "",
        "nextSafestAction": row.get("nextSafestAction") or "",
        "humanReviewQuestion": row.get("humanReviewQuestion") or "",
        "codexCanContinueWith": row.get("codexCanContinueWith") or "",
        "writingMoveOptions": row.get("writingMoveOptions") or [],
        "reviewNoteTemplateMarkdown": note.get("markdownTemplate") or "",
        "truth": row.get("truth") or "Writing review row only. It does not mutate source, replace canon, publish, upload, schedule, or create receipt truth.",
    }


def build_start_here_queue(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    compact = [compact_review_row(row) for row in rows]
    compact.sort(key=lambda row: (review_priority(row), int(row.get("rank") or 0), str(row.get("title") or "")))
    return compact[:12]


def main() -> int:
    out_dir = prepare_output_dir()
    payload = build_payload(DEFAULT_NEST_ROOT, out_dir)
    json_path = out_dir / "nest-writing-review-desk.json"
    csv_path = out_dir / "nest-writing-review-desk.csv"
    md_path = out_dir / "START-HERE-nest-writing-review-desk.md"
    html_path = out_dir / "index.html"
    payload.update({
        "jsonPath": str(json_path),
        "csvPath": str(csv_path),
        "markdownPath": str(md_path),
        "htmlPath": str(html_path),
    })
    payload["firstSafeAction"] = {
        "label": "Open Nest writing review desk",
        "command": f"open {shell_quote(str(html_path))}",
        "path": str(html_path),
        "safety": "Opens local writing review evidence only. No source/canon/publication mutation.",
    }
    write_json(json_path, payload)
    write_csv(csv_path, payload)
    write_markdown(md_path, payload)
    write_html(html_path, payload)
    compact_rows = [compact_review_row(row) for row in payload.get("reviewRows") or []]
    start_here_queue = build_start_here_queue(payload.get("reviewRows") or [])
    pointer = {
        "schema": SCHEMA,
        "updatedAt": payload["generatedAt"],
        "status": payload["status"],
        "sessionDir": str(out_dir),
        "jsonPath": str(json_path),
        "csvPath": str(csv_path),
        "markdownPath": str(md_path),
        "htmlPath": str(html_path),
        "counts": payload["counts"],
        "rows": compact_rows,
        "reviewRows": compact_rows,
        "startHereQueue": start_here_queue,
        "sourceCheckQueue": [row for row in start_here_queue if row.get("recommendedDecision") == "needs-source-check"],
        "revisionQueue": [row for row in start_here_queue if row.get("recommendedDecision") == "revise"],
        "humanAsk": payload["humanAsk"],
        "agentSafeParallelWork": payload["agentSafeParallelWork"],
        "firstSafeAction": payload["firstSafeAction"],
        "nextSafestAction": payload["nextSafestAction"],
        "firstReviewTarget": payload.get("firstReviewTarget") or {},
        "firstReviewNoteTemplate": payload.get("firstReviewNoteTemplate") or {},
        "truth": payload["truth"],
    }
    write_json(LATEST_POINTER, pointer)
    print(json.dumps(pointer, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
