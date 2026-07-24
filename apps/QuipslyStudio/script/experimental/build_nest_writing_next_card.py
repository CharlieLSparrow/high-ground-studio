#!/usr/bin/env python3
"""Build one tiny Nest writing next-action card.

This is a calm front door for the next source-backed writing/review move. It
reads the latest Nest writing control room, points at existing draft/source
evidence, and writes a local card. It never mutates source files, replaces
canonical manuscript text, publishes, uploads, schedules, approves, or creates
receipt truth.
"""
from __future__ import annotations

import argparse
import html
import json
import shlex
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_NEST_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/NestWriting")
LATEST_CONTROL_ROOM = "latest-nest-writing-control-room.json"
LATEST_NEXT_CARD = "latest-nest-writing-next-card.json"
SCHEMA = "quipsly.nest-writing.next-card.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-nest-writing-next-card")


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


def esc(value: Any) -> str:
    return html.escape(str(value or ""))


def shell_quote(value: str) -> str:
    return shlex.quote(value)


def load_control_room(nest_root: Path) -> tuple[dict[str, Any], Path]:
    pointer_path = nest_root / LATEST_CONTROL_ROOM
    pointer = load_json(pointer_path)
    packet_path_value = str(pointer.get("jsonPath") or "")
    packet_path = Path(packet_path_value) if packet_path_value else pointer_path
    packet = load_json(packet_path)
    return ({**pointer, **packet} if packet else pointer), pointer_path


def first_dict(*values: Any) -> dict[str, Any]:
    for value in values:
        if isinstance(value, dict) and value:
            return value
    return {}


def first_list_item(value: Any) -> dict[str, Any]:
    if isinstance(value, list):
        for item in value:
            if isinstance(item, dict) and item:
                return item
    return {}


def build_payload(nest_root: Path, task_id: str | None = None) -> dict[str, Any]:
    control, pointer_path = load_control_room(nest_root)
    board = control.get("authorActionBoard") if isinstance(control.get("authorActionBoard"), dict) else {}
    queue_items = control.get("writingStartQueue") if isinstance(control.get("writingStartQueue"), list) else []
    selected_queue = {}
    if task_id:
        selected_queue = next((item for item in queue_items if isinstance(item, dict) and str(item.get("taskId") or item.get("id") or "") == task_id), {})
    if not selected_queue:
        selected_queue = first_list_item(queue_items)

    first_review = first_dict(
        board.get("firstReviewTarget"),
        control.get("firstReviewTarget"),
        selected_queue,
        board.get("firstTask"),
    )
    first_task = first_dict(board.get("firstTask"), selected_queue)
    note_template = first_dict(
        board.get("firstReviewNoteTemplate"),
        control.get("firstReviewNoteTemplate"),
        first_review.get("reviewNoteTemplate"),
    )
    counts = control.get("counts") if isinstance(control.get("counts"), dict) else {}
    title = str(first_review.get("title") or first_task.get("title") or "Next source-backed writing pass")
    selected_task_id = str(
        first_review.get("taskId")
        or first_task.get("taskId")
        or selected_queue.get("taskId")
        or selected_queue.get("id")
        or task_id
        or "next-writing-pass"
    )
    draft_path = str(first_review.get("htmlPath") or first_review.get("markdownPath") or first_task.get("currentPacketPath") or "")
    source_path = str(first_task.get("sourcePath") or first_task.get("openSourceCommand") or "")
    if source_path.startswith("open "):
        source_path = source_path.removeprefix("open ").strip().strip("'")
    review_flags = first_review.get("reviewFlags") if isinstance(first_review.get("reviewFlags"), list) else note_template.get("reviewFlags") if isinstance(note_template.get("reviewFlags"), list) else []
    source_trail = first_review.get("sourceTrail") if isinstance(first_review.get("sourceTrail"), dict) else {}
    markdown_template = str(note_template.get("markdownTemplate") or "")
    safe_command = str(first_review.get("openCommand") or (f"open {shell_quote(draft_path)}" if draft_path else ""))
    safe_draft_packet_command = f"./script/agentctl.sh nest-writing-draft-packet {shell_quote(selected_task_id)}"
    next_safest_action = (
        "Open the draft packet and source file side by side, then write a local review/revision note that chooses "
        "revise, split, hold, needs-source-check, or approve-for-human-next-pass. Do not replace canonical manuscript text from this card."
    )
    review_note_path = str(nest_root / "ReviewNoteDrafts" / f"{selected_task_id}-review-note-draft.md")
    review_note_dir = str(Path(review_note_path).parent)
    review_note_command = f"mkdir -p {shell_quote(review_note_dir)} && touch {shell_quote(review_note_path)} && open {shell_quote(review_note_path)}"

    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": "nest-writing-next-card-ready" if first_review else "nest-writing-next-card-needs-control-room",
        "nestRoot": str(nest_root),
        "sourceControlRoomPointerPath": str(pointer_path),
        "sourceControlRoomJsonPath": str(control.get("jsonPath") or ""),
        "sourceControlRoomHtmlPath": str(control.get("htmlPath") or ""),
        "taskId": selected_task_id,
        "title": title,
        "plainEnglish": "Open one exact source-backed draft/review target, compare it with the source trail, and record a local review or revision direction. Do not replace canonical manuscript text from this card.",
        "nextSafestAction": next_safest_action,
        "recommendedDecision": str(first_review.get("recommendedDecision") or note_template.get("suggestedDecision") or "revise"),
        "suggestedWritingMove": str(first_review.get("primaryWritingMove") or note_template.get("suggestedWritingMove") or "source-check"),
        "reviewFlags": [str(item) for item in review_flags],
        "humanQuestion": str(first_review.get("humanReviewQuestion") or first_task.get("humanAsk") or "What is the next useful writing move while keeping source truth visible?"),
        "codexCanContinueWith": str(first_review.get("codexCanContinueWith") or first_task.get("agentSafeParallelWork") or "Prepare source comparisons, revision notes, outline options, and platform-copy variants without replacing canon."),
        "draftPath": draft_path,
        "draftPathExists": Path(draft_path).exists() if draft_path else False,
        "sourcePath": source_path,
        "sourcePathExists": Path(source_path).exists() if source_path and not source_path.startswith("./") else False,
        "safeOpenCommand": safe_command,
        "safeDraftPacketCommand": safe_draft_packet_command,
        "safeDraftPacketSafety": "Creates a local source-backed draft preview packet only. It does not replace canonical manuscript text, mutate source files, publish, upload, schedule, approve, overwrite, mutate accounts, or create receipt truth.",
        "reviewNoteDraftPath": review_note_path,
        "reviewNoteDraftCommand": review_note_command,
        "reviewNoteDraftSafety": "Writes only a new local review-note draft if explicitly executed by an operator. It does not touch source files, canonical manuscript text, uploads, schedules, publication, accounts, approvals, or receipt truth.",
        "countsContext": {
            "currentDrafts": counts.get("currentDrafts", 0),
            "pendingHumanReview": counts.get("pendingHumanReview", 0),
            "draftsWithReviewFlags": counts.get("draftsWithReviewFlags", 0),
            "sourceWords": counts.get("sourceWords", 0),
            "platformPackets": counts.get("platformPackets", 0),
            "receiptSlots": counts.get("receiptSlots", 0),
        },
        "sourceTrail": source_trail,
        "reviewNoteTemplate": {
            "markdownTemplate": markdown_template,
            "decisionOptions": note_template.get("decisionOptions") if isinstance(note_template.get("decisionOptions"), list) else ["revise", "approve-for-human-next-pass", "hold", "split", "needs-source-check"],
            "truth": str(note_template.get("truth") or "Review note template only; no source, canon, publication, schedule, approval, upload, overwrite, or receipt truth is changed."),
        },
        "steps": [
            "Open the draft packet.",
            "Open or inspect the source file named by this card.",
            "Compare the draft with the source trail before judging style.",
            "Choose revise, approve-for-human-next-pass, hold, split, or needs-source-check.",
            "Write or prepare a local review note. Keep canonical manuscript replacement blocked until explicit human approval.",
        ],
        "actionLadder": [
            {
                "order": 1,
                "label": "Open evidence",
                "command": safe_command,
                "safety": "Read local draft evidence only.",
            },
            {
                "order": 2,
                "label": "Regenerate draft packet if stale",
                "command": safe_draft_packet_command,
                "safety": "Creates a new local draft packet version; source and canon remain untouched.",
            },
            {
                "order": 3,
                "label": "Prepare review note draft",
                "command": review_note_command,
                "safety": "Only writes a new local review-note draft when explicitly executed; no source/canon/platform mutation.",
            },
        ],
        "firstSafeAction": {
            "label": "Open this Nest writing card",
            "command": "",
            "path": "",
            "safety": "Opens one local next-writing card. No source mutation, canon replacement, upload, publication, schedule, approval, overwrite, account mutation, or receipt truth.",
        },
        "truth": {
            "description": "Nest writing next card only. It reads local draft/source/control-room evidence and writes versioned local guidance.",
            "sourceFilesMutated": False,
            "canonicalManuscriptReplaced": False,
            "versionsOverwritten": False,
            "externalPublishing": False,
            "externalSchedulesCreated": False,
            "receiptTruthCreated": False,
            "accountMutation": False,
            "approvalCreated": False,
        },
    }


def render_markdown(path: Path, payload: dict[str, Any]) -> None:
    flags = ", ".join(payload.get("reviewFlags") or []) or "none"
    template = payload.get("reviewNoteTemplate") if isinstance(payload.get("reviewNoteTemplate"), dict) else {}
    lines = [
        "# Nest writing next card",
        "",
        f"**Task:** `{payload.get('title')}`",
        f"**Suggested move:** `{payload.get('suggestedWritingMove')}`",
        f"**Suggested decision:** `{payload.get('recommendedDecision')}`",
        f"**Review flags:** {flags}",
        "",
        "## Next safest action",
        str(payload.get("nextSafestAction") or ""),
        "",
        "## Why this card exists",
        str(payload.get("plainEnglish") or ""),
        "",
        "## Open",
        f"- Draft packet: `{payload.get('draftPath')}`",
        f"- Draft exists: `{payload.get('draftPathExists')}`",
        f"- Safe command: `{payload.get('safeOpenCommand')}`",
        f"- Draft preview command: `{payload.get('safeDraftPacketCommand')}`",
        f"- Draft preview safety: {payload.get('safeDraftPacketSafety')}",
        f"- Review note draft path: `{payload.get('reviewNoteDraftPath')}`",
        f"- Review note draft command: `{payload.get('reviewNoteDraftCommand')}`",
        f"- Review note safety: {payload.get('reviewNoteDraftSafety')}",
        "",
        "## Human question",
        str(payload.get("humanQuestion") or ""),
        "",
        "## Codex can continue with",
        str(payload.get("codexCanContinueWith") or ""),
        "",
        "## Steps",
    ]
    for step in payload.get("steps") or []:
        lines.append(f"- {step}")
    lines.extend([
        "",
        "## Copyable review note template",
        "",
        "```markdown",
        str(template.get("markdownTemplate") or "Write a local review note here. Do not replace canonical manuscript text."),
        "```",
        "",
        "## Safety",
        "- Does not mutate source files.",
        "- Does not replace canonical manuscript text.",
        "- Does not publish, upload, schedule, approve, overwrite, mutate accounts, or create receipt truth.",
        "",
    ])
    path.write_text("\n".join(lines), encoding="utf-8")


def render_html(path: Path, payload: dict[str, Any]) -> None:
    flags = "".join(f"<span>{esc(flag)}</span>" for flag in payload.get("reviewFlags") or []) or "<span>no flags</span>"
    steps = "".join(f"<li>{esc(step)}</li>" for step in payload.get("steps") or [])
    action_ladder = "".join(
        f"<li><b>{esc(item.get('label'))}</b><code>{esc(item.get('command'))}</code><p class='safety'>{esc(item.get('safety'))}</p></li>"
        for item in payload.get("actionLadder") or []
        if isinstance(item, dict)
    )
    template = payload.get("reviewNoteTemplate") if isinstance(payload.get("reviewNoteTemplate"), dict) else {}
    html_text = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Nest writing next card</title>
  <style>
    :root {{ color-scheme: light; --ink:#2f261f; --leaf:#315a40; --moss:#dfead6; --paper:#fffaf0; --line:#dfd0b5; --gold:#b98732; }}
    body {{ margin:0; font-family: ui-serif, Georgia, serif; background: radial-gradient(circle at top left, #f7efd8, #fbf7ed 44%, #eef5e8); color:var(--ink); }}
    main {{ max-width: 980px; margin: 32px auto; padding: 0 20px 48px; }}
    .card {{ background: rgba(255,250,240,.92); border:1px solid var(--line); border-radius:28px; box-shadow:0 18px 50px rgba(79,59,32,.14); padding:28px; }}
    .eyebrow {{ color:var(--gold); font: 800 12px/1.2 ui-sans-serif, system-ui; letter-spacing:.28em; text-transform:uppercase; }}
    h1 {{ font-size: clamp(34px, 5vw, 58px); line-height:.94; margin: 12px 0 16px; }}
    .plain {{ font: 18px/1.6 ui-sans-serif, system-ui; max-width: 780px; }}
    .grid {{ display:grid; grid-template-columns: 1fr 1fr; gap:16px; margin-top:18px; }}
    section {{ background: rgba(49,90,64,.08); border:1px solid rgba(49,90,64,.18); border-radius:20px; padding:18px; }}
    h2 {{ margin:0 0 10px; font: 800 16px/1.2 ui-sans-serif, system-ui; color:var(--leaf); }}
    code, pre {{ white-space: pre-wrap; word-break: break-word; background:#fff6de; border:1px solid var(--line); border-radius:14px; padding:10px; display:block; }}
    a.button {{ display:inline-block; margin-top:12px; padding:12px 16px; border-radius:999px; background:var(--leaf); color:white; text-decoration:none; font:800 13px/1 ui-sans-serif, system-ui; letter-spacing:.08em; }}
    .flags span {{ display:inline-block; margin:4px 6px 0 0; padding:6px 10px; border-radius:999px; background:#f5e4bd; font:800 12px/1 ui-sans-serif, system-ui; }}
    .safety {{ color:#5e513f; font:14px/1.45 ui-sans-serif, system-ui; }}
    @media (max-width: 760px) {{ .grid {{ grid-template-columns: 1fr; }} }}
  </style>
</head>
<body>
<main>
  <div class="card">
    <div class="eyebrow">Quipsly Nest Writing</div>
    <h1>One calm writing move.</h1>
    <p class="plain">{esc(payload.get('plainEnglish'))}</p>
    <section>
      <h2>Next safest action</h2>
      <p>{esc(payload.get('nextSafestAction'))}</p>
    </section>
    <a class="button" href="file://{esc(payload.get('draftPath'))}">Open draft packet</a>
    <div class="grid">
      <section>
        <h2>Target</h2>
        <p><b>{esc(payload.get('title'))}</b></p>
        <p>Move: <b>{esc(payload.get('suggestedWritingMove'))}</b></p>
        <p>Decision: <b>{esc(payload.get('recommendedDecision'))}</b></p>
        <div class="flags">{flags}</div>
      </section>
      <section>
        <h2>Ask</h2>
        <p>{esc(payload.get('humanQuestion'))}</p>
      </section>
      <section>
        <h2>Steps</h2>
        <ol>{steps}</ol>
      </section>
      <section>
        <h2>Action ladder</h2>
        <ol>{action_ladder}</ol>
      </section>
      <section>
        <h2>Codex can help</h2>
        <p>{esc(payload.get('codexCanContinueWith'))}</p>
      </section>
      <section>
        <h2>Safe draft preview</h2>
        <code>{esc(payload.get('safeDraftPacketCommand'))}</code>
        <p class="safety">{esc(payload.get('safeDraftPacketSafety'))}</p>
        <code>{esc(payload.get('reviewNoteDraftCommand'))}</code>
        <p class="safety">{esc(payload.get('reviewNoteDraftSafety'))}</p>
      </section>
    </div>
    <section style="margin-top:16px">
      <h2>Copyable review note template</h2>
      <pre>{esc(template.get('markdownTemplate') or '')}</pre>
    </section>
    <p class="safety">Safety: local card only. No source mutation, canonical replacement, upload, publication, schedule, approval, overwrite, account mutation, or receipt truth.</p>
  </div>
</main>
</body>
</html>
"""
    path.write_text(html_text, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Build the next Nest writing card.")
    parser.add_argument("nest_root", nargs="?", default=str(DEFAULT_NEST_ROOT))
    parser.add_argument("--task-id", default="")
    args = parser.parse_args()
    nest_root = Path(args.nest_root).expanduser()
    payload = build_payload(nest_root, args.task_id or None)
    out_dir = nest_root / "NextWritingCards" / stamp()
    out_dir.mkdir(parents=True, exist_ok=True)
    json_path = out_dir / "nest-writing-next-card.json"
    markdown_path = out_dir / "START-HERE-nest-writing-next-card.md"
    html_path = out_dir / "index.html"
    payload.update({
        "sessionDir": str(out_dir),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "htmlPath": str(html_path),
        "firstSafeAction": {
            "label": "Open this Nest writing card",
            "command": f"open {shell_quote(str(html_path))}",
            "path": str(html_path),
            "safety": "Opens one local next-writing card. No source mutation, canon replacement, upload, publication, schedule, approval, overwrite, account mutation, or receipt truth.",
        },
    })
    write_json(json_path, payload)
    render_markdown(markdown_path, payload)
    render_html(html_path, payload)
    write_json(nest_root / LATEST_NEXT_CARD, {
        "schema": "quipsly.nest-writing.latest-next-card.v1",
        "updatedAt": iso_now(),
        "status": payload.get("status"),
        "label": payload.get("title"),
        "taskId": payload.get("taskId"),
        "title": payload.get("title"),
        "recommendedDecision": payload.get("recommendedDecision"),
        "suggestedWritingMove": payload.get("suggestedWritingMove"),
        "humanAsk": payload.get("humanQuestion"),
        "humanQuestion": payload.get("humanQuestion"),
        "nextSafestAction": payload.get("nextSafestAction"),
        "codexCanContinueWith": payload.get("codexCanContinueWith"),
        "counts": payload.get("countsContext"),
        "draftPath": payload.get("draftPath"),
        "draftPathExists": payload.get("draftPathExists"),
        "sourcePath": payload.get("sourcePath"),
        "sourcePathExists": payload.get("sourcePathExists"),
        "safeDraftPacketCommand": payload.get("safeDraftPacketCommand"),
        "safeDraftPacketSafety": payload.get("safeDraftPacketSafety"),
        "reviewNoteDraftPath": payload.get("reviewNoteDraftPath"),
        "reviewNoteDraftCommand": payload.get("reviewNoteDraftCommand"),
        "reviewNoteDraftSafety": payload.get("reviewNoteDraftSafety"),
        "actionLadder": payload.get("actionLadder"),
        "nextWritingCardPath": str(html_path),
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "sessionDir": str(out_dir),
        "firstSafeAction": payload.get("firstSafeAction"),
        "truth": payload.get("truth"),
    })
    print(json.dumps({
        "status": payload.get("status"),
        "taskId": payload.get("taskId"),
        "title": payload.get("title"),
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "draftPathExists": payload.get("draftPathExists"),
        "sourcePathExists": payload.get("sourcePathExists"),
        "safeDraftPacketCommand": payload.get("safeDraftPacketCommand"),
        "safeDraftPacketSafety": payload.get("safeDraftPacketSafety"),
        "reviewNoteDraftPath": payload.get("reviewNoteDraftPath"),
        "reviewNoteDraftCommand": payload.get("reviewNoteDraftCommand"),
        "reviewNoteDraftSafety": payload.get("reviewNoteDraftSafety"),
        "nextSafestAction": payload.get("nextSafestAction"),
        "actionLadder": payload.get("actionLadder"),
        "firstSafeAction": payload.get("firstSafeAction"),
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
