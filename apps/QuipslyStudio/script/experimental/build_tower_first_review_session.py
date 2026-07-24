#!/usr/bin/env python3
"""Build one focused Tower first-review session packet.

This is a local-only reviewer runway. It composes the latest Tower unblock brief
into a single next session: open one evidence packet, inspect one artifact row,
preview local review decisions with dry-run commands, and keep publication
receipt truth separate. It does not publish, upload, schedule, approve,
capture receipts, overwrite versions, mutate source files, or touch accounts.
"""
from __future__ import annotations

import html
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
SCHEMA = "quipsly.tower.first-review-session.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-tower-first-review")


def load_json(path: Path, *, _depth: int = 0) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            return {}
        if _depth == 0 and payload.get("jsonPath"):
            target = Path(str(payload.get("jsonPath") or ""))
            if target.exists() and target != path:
                target_payload = load_json(target, _depth=1)
                if target_payload:
                    return {**payload, **target_payload}
        return payload
    except Exception:
        return {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def esc(value: Any) -> str:
    return html.escape(str(value or ""))


def as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def short(value: Any, limit: int = 260) -> str:
    text = " ".join(str(value or "").split())
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def find_review_row(review_rows: list[dict[str, Any]], first: dict[str, Any]) -> dict[str, Any]:
    episode = str(first.get("episode") or "")
    artifact = str(first.get("artifactId") or "")
    if episode and artifact:
        for row in review_rows:
            if str(row.get("episode") or "") == episode and str(row.get("artifactId") or "") == artifact:
                return row
    if episode:
        for row in review_rows:
            if str(row.get("episode") or "") == episode:
                return row
    return review_rows[0] if review_rows else {}


def build_decision_commands(row: dict[str, Any]) -> dict[str, str]:
    return {
        "approveDryRun": str(row.get("approveDryRunCommand") or ""),
        "refineDryRun": str(row.get("refineDryRunCommand") or ""),
        "holdDryRun": str(row.get("holdDryRunCommand") or ""),
        "pendingDryRun": str(row.get("pendingDryRunCommand") or ""),
    }


def build_note_template(first: dict[str, Any], row: dict[str, Any]) -> dict[str, Any]:
    episode = first.get("episode") or row.get("episode") or ""
    artifact = row.get("artifactId") or first.get("artifactId") or "artifact"
    label = row.get("label") or first.get("label") or "Tower review item"
    warning_text = "; ".join(str(item) for item in as_list(row.get("warnings"))[:3])
    markdown = "\n".join([
        f"## Tower local review note - Episode {episode}",
        "",
        f"- Artifact: {artifact} ({label})",
        f"- Candidate/current version: {first.get('candidateVersion') or row.get('version') or first.get('currentVersion') or 'review-needed'}",
        f"- Evidence opened: {first.get('path') or row.get('reviewPacketPath') or row.get('primaryPath') or ''}",
        f"- Initial classification: approve / refine / hold / pending",
        f"- What I checked: story flow, sync, duration, audio, blank/gap spots, ending, and platform readiness.",
        f"- Warning notes: {warning_text or 'none observed yet'}",
        "- Decision notes:",
        "  - ",
        "- Receipt truth: no external publication receipt is created by this review.",
    ])
    return {
        "title": "Tower first local review note",
        "episode": episode,
        "artifactId": artifact,
        "copyPasteMarkdown": markdown,
        "classificationOptions": ["approve", "refine", "hold", "pending"],
        "truth": "This note supports local review only. It is not platform publication proof.",
    }


def build_packet(release_root: Path) -> dict[str, Any]:
    unblock_pointer_path = release_root / "tower-review-unblock-brief" / "latest-tower-review-unblock-brief.json"
    unblock = load_json(unblock_pointer_path)
    unblock_items = [item for item in as_list(unblock.get("unblockItems")) if isinstance(item, dict)]
    review_rows = [item for item in as_list(unblock.get("reviewRows")) if isinstance(item, dict)]
    first = as_dict(unblock.get("firstUnblockAction")) or (unblock_items[0] if unblock_items else {})
    review_row = find_review_row(review_rows, first)
    decision_commands = build_decision_commands(review_row)
    note_template = build_note_template(first, review_row)
    evidence_command = first.get("command") or review_row.get("openReviewCommand") or review_row.get("openArtifactCommand") or ""
    evidence_path = first.get("path") or review_row.get("reviewPacketPath") or review_row.get("primaryPath") or ""
    session_steps = [
        {
            "rank": 1,
            "label": "Open the evidence packet",
            "command": evidence_command,
            "doneWhen": "The reviewer can name what they watched/listened to and what risk remains.",
        },
        {
            "rank": 2,
            "label": "Compare the artifact and warnings",
            "command": review_row.get("openArtifactCommand") or (f"open {shell_quote(str(review_row.get('primaryPath') or ''))}" if review_row.get("primaryPath") else ""),
            "doneWhen": "The reviewer has a plain-English decision: approve, refine, hold, or return to pending.",
        },
        {
            "rank": 3,
            "label": "Preview a local decision command",
            "command": decision_commands.get("holdDryRun") or decision_commands.get("refineDryRun") or decision_commands.get("pendingDryRun") or decision_commands.get("approveDryRun") or "",
            "doneWhen": "Dry-run output matches the intended local review decision before any ledger write.",
        },
        {
            "rank": 4,
            "label": "Copy the review note",
            "command": "copy note from this packet",
            "doneWhen": "The decision is explained well enough that future Charlie, Mako, Homer, or Codex can trust it.",
        },
    ]
    counts = as_dict(unblock.get("counts"))
    first_episode = first.get("episode") or review_row.get("episode") or ""
    first_artifact = review_row.get("artifactId") or first.get("artifactId") or ""
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": "first-review-session-ready" if first else "no-review-session-ready",
        "releaseRoot": str(release_root),
        "sourceUnblockPointerPath": str(unblock_pointer_path),
        "sourceUnblockHtml": unblock.get("htmlPath") or "",
        "sourceUnblockMarkdown": unblock.get("markdownPath") or "",
        "counts": {
            "unblockItems": len(unblock_items),
            "reviewRows": len(review_rows),
            "receiptSlots": counts.get("receiptSlots") or 0,
            "capturedReceipts": counts.get("capturedReceipts") or 0,
            "readyForApproval": counts.get("readyForApproval") or 0,
            "publishBlockedPackages": counts.get("publishBlockedPackages") or 0,
            "externalPublishing": False,
            "receiptTruthCreated": False,
            "sourceFilesMutated": False,
            "versionsOverwritten": False,
        },
        "firstReviewSession": {
            "episode": first_episode,
            "artifactId": first_artifact,
            "label": first.get("label") or review_row.get("label") or "Open local review evidence",
            "lane": first.get("lane") or "Tower/local review",
            "kind": first.get("kind") or "watch-listen-review",
            "currentVersion": first.get("currentVersion") or review_row.get("version") or "",
            "candidateVersion": first.get("candidateVersion") or "",
            "evidencePath": evidence_path,
            "evidenceOpenCommand": evidence_command,
            "artifactPath": review_row.get("primaryPath") or "",
            "artifactOpenCommand": review_row.get("openArtifactCommand") or "",
            "reviewerQuestion": first.get("reviewerQuestion") or first.get("why") or "What local decision should this evidence receive?",
            "publishBlockerStatus": first.get("publishBlockerStatus") or "",
            "publishBlockerLabel": first.get("publishBlockerLabel") or "",
            "publishBlockerPlain": first.get("publishBlockerPlain") or "",
            "warnings": as_list(review_row.get("warnings")),
            "reviewPrompt": review_row.get("reviewPrompt") or "Watch/listen locally and classify the artifact before platform work advances.",
            "decisionCommands": decision_commands,
            "noteTemplate": note_template,
            "sessionSteps": session_steps,
            "safety": first.get("safety") or "Local review only; no external platform action.",
            "truth": "This is the next local Tower review session. It does not publish, upload, schedule, approve externally, capture receipts, mutate accounts, overwrite versions, mutate originals, or delete files.",
        },
        "otherReviewOptions": unblock_items[1:6],
        "humanAsk": "Open this one focused Tower review session, watch/listen to the evidence, then choose approve/refine/hold/pending locally before any publishing work.",
        "agentSafeParallelWork": "Codex may summarize evidence, improve local review notes, draft platform metadata packets, and preview dry-run review commands. Do not publish, upload, schedule, capture receipts, approve on a human's behalf, overwrite, delete, mutate accounts, or mutate source files.",
        "nextSafestAction": "Open the evidence command for the first review session, then run only a dry-run review decision command until the reviewer agrees with the decision.",
        "truth": "Tower first-review session packet only. It reads local Tower evidence and writes local packet files; it does not publish, upload, schedule, approve externally, capture receipts, mutate accounts, overwrite versions, mutate source files, or delete originals.",
    }


def write_markdown(path: Path, packet: dict[str, Any]) -> None:
    session = as_dict(packet.get("firstReviewSession"))
    note = as_dict(session.get("noteTemplate"))
    commands = as_dict(session.get("decisionCommands"))
    lines = [
        "# Tower first review session",
        "",
        packet.get("truth", ""),
        "",
        "## Start here",
        f"- Episode: `{session.get('episode')}`",
        f"- Artifact: `{session.get('artifactId')}`",
        f"- Label: {session.get('label')}",
        f"- Question: {session.get('reviewerQuestion')}",
        f"- Evidence: `{session.get('evidencePath')}`",
        "",
        "```bash",
        str(session.get("evidenceOpenCommand") or ""),
        "```",
        "",
        "## Session steps",
    ]
    for step in as_list(session.get("sessionSteps")):
        if isinstance(step, dict):
            lines += [
                f"### {step.get('rank')}. {step.get('label')}",
                f"Done when: {step.get('doneWhen')}",
                "```bash",
                str(step.get("command") or ""),
                "```",
                "",
            ]
    lines += [
        "## Dry-run review commands",
        "Run dry-run first. Write local review ledger only after the preview matches intent.",
    ]
    for key, command in commands.items():
        if command:
            lines += [f"### {key}", "```bash", command, "```", ""]
    lines += [
        "## Copyable review note",
        "```markdown",
        str(note.get("copyPasteMarkdown") or ""),
        "```",
        "",
        "## Counts",
        "```json",
        json.dumps(packet.get("counts") or {}, indent=2, sort_keys=True),
        "```",
    ]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_html(path: Path, packet: dict[str, Any]) -> None:
    session = as_dict(packet.get("firstReviewSession"))
    note = as_dict(session.get("noteTemplate"))
    commands = as_dict(session.get("decisionCommands"))
    steps_html = "".join(
        f"""
        <article class='step'>
          <span>{esc(step.get('rank'))}</span>
          <h3>{esc(step.get('label'))}</h3>
          <p>{esc(step.get('doneWhen'))}</p>
          <pre>{esc(step.get('command'))}</pre>
        </article>
        """
        for step in as_list(session.get("sessionSteps"))
        if isinstance(step, dict)
    )
    command_html = "".join(
        f"<article class='command'><h3>{esc(key)}</h3><pre>{esc(command)}</pre></article>"
        for key, command in commands.items()
        if command
    )
    warnings_html = "".join(f"<li>{esc(item)}</li>" for item in as_list(session.get("warnings"))[:8]) or "<li>No warnings listed in the selected review row.</li>"
    other_html = "".join(
        f"<li><b>{esc(item.get('label'))}</b><br><code>{esc(item.get('command'))}</code></li>"
        for item in as_list(packet.get("otherReviewOptions"))
        if isinstance(item, dict)
    ) or "<li>No alternate review options listed.</li>"
    html_doc = f"""<!doctype html>
<html lang='en'>
<head>
<meta charset='utf-8'>
<title>Tower first review session</title>
<style>
:root {{ color-scheme: dark; --bg:#121612; --panel:#1d241c; --leaf:#75c976; --gold:#e2c95b; --clay:#d8875e; --ink:#f7f1dc; --muted:#aeb7a6; }}
body {{ margin:0; background:radial-gradient(circle at top left,#243326,#121612 55%); color:var(--ink); font:15px/1.5 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif; }}
main {{ max-width:1180px; margin:0 auto; padding:34px; }}
.hero,.card,.step,.command {{ background:rgba(29,36,28,.88); border:1px solid rgba(226,201,91,.22); border-radius:24px; box-shadow:0 20px 50px rgba(0,0,0,.25); }}
.hero {{ padding:28px; display:grid; gap:18px; }}
h1 {{ margin:0; font-size:42px; letter-spacing:-.03em; }}
h2 {{ margin:0 0 12px; color:var(--gold); letter-spacing:.08em; text-transform:uppercase; font-size:13px; }}
h3 {{ margin:0 0 8px; }}
.grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:16px; margin-top:18px; }}
.card,.step,.command {{ padding:18px; }}
.badges {{ display:flex; flex-wrap:wrap; gap:8px; }}
.badge {{ padding:7px 10px; border-radius:999px; background:#263326; color:var(--muted); font-weight:700; }}
.badge.gold {{ background:#383016; color:var(--gold); }}
.badge.leaf {{ background:#183820; color:var(--leaf); }}
pre, code {{ white-space:pre-wrap; word-break:break-word; background:#090b09; color:#f8e6a6; border-radius:12px; padding:10px; }}
pre {{ overflow:auto; }}
ul {{ padding-left:18px; }}
.notice {{ color:var(--muted); max-width:880px; }}
</style>
</head>
<body>
<main>
<section class='hero'>
  <div class='badges'>
    <span class='badge leaf'>local review only</span>
    <span class='badge gold'>receipt truth separate</span>
    <span class='badge'>no external publishing</span>
  </div>
  <h1>First Tower review session</h1>
  <p class='notice'>{esc(packet.get('truth'))}</p>
  <div class='grid'>
    <article class='card'><h2>Start</h2><h3>{esc(session.get('label'))}</h3><p>{esc(session.get('reviewerQuestion'))}</p><pre>{esc(session.get('evidenceOpenCommand'))}</pre></article>
    <article class='card'><h2>Current target</h2><p><b>Episode:</b> {esc(session.get('episode'))}</p><p><b>Artifact:</b> {esc(session.get('artifactId'))}</p><p><b>Version:</b> {esc(session.get('currentVersion'))} → {esc(session.get('candidateVersion'))}</p><p><b>Blocker:</b> {esc(short(session.get('publishBlockerPlain')))}</p></article>
    <article class='card'><h2>Counts</h2><pre>{esc(json.dumps(packet.get('counts') or {}, indent=2, sort_keys=True))}</pre></article>
  </div>
</section>
<section class='grid'>{steps_html}</section>
<section class='grid'>
  <article class='card'><h2>Warnings</h2><ul>{warnings_html}</ul></article>
  <article class='card'><h2>Copyable review note</h2><pre>{esc(note.get('copyPasteMarkdown'))}</pre></article>
</section>
<section class='grid'>{command_html}</section>
<section class='card'><h2>Other review options</h2><ul>{other_html}</ul></section>
</main>
</body>
</html>"""
    path.write_text(html_doc, encoding="utf-8")


def main(argv: list[str]) -> int:
    release_root = Path(argv[1]) if len(argv) > 1 and argv[1] else DEFAULT_RELEASE_ROOT
    packet = build_packet(release_root)
    output_root = release_root / "tower-first-review-session"
    output_dir = output_root / stamp()
    output_dir.mkdir(parents=True, exist_ok=True)
    packet["sessionDir"] = str(output_dir)
    packet["jsonPath"] = str(output_dir / "tower-first-review-session.json")
    packet["markdownPath"] = str(output_dir / "START-HERE-tower-first-review-session.md")
    packet["htmlPath"] = str(output_dir / "index.html")
    session = packet.get("firstReviewSession") if isinstance(packet.get("firstReviewSession"), dict) else {}
    packet["firstSafeAction"] = {
        "label": session.get("label") or "Open Tower first review session",
        "command": session.get("evidenceOpenCommand") or f"open {shell_quote(str(output_dir / 'index.html'))}",
        "path": session.get("evidencePath") or str(output_dir / "index.html"),
        "safety": session.get("safety") or "Local review only; no publish, upload, schedule, receipt, account, source, overwrite, or delete action.",
    }
    write_json(output_dir / "tower-first-review-session.json", packet)
    write_markdown(output_dir / "START-HERE-tower-first-review-session.md", packet)
    write_html(output_dir / "index.html", packet)
    pointer = {
        "schema": "quipsly.tower.first-review-session.latest-pointer.v1",
        "generatedAt": packet["generatedAt"],
        "status": packet["status"],
        "jsonPath": packet["jsonPath"],
        "markdownPath": packet["markdownPath"],
        "htmlPath": packet["htmlPath"],
        "sessionDir": packet["sessionDir"],
        "counts": packet["counts"],
        "humanAsk": packet["humanAsk"],
        "agentSafeParallelWork": packet["agentSafeParallelWork"],
        "firstSafeAction": packet["firstSafeAction"],
        "nextSafestAction": packet["nextSafestAction"],
        "truth": packet["truth"],
    }
    write_json(output_root / "latest-tower-first-review-session.json", pointer)
    print(json.dumps(pointer, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
