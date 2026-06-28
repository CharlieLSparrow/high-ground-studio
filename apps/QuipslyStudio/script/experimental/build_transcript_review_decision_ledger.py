#!/usr/bin/env python3
"""Build and safely update the Studio transcript review decision ledger.

This ledger records local review intent for normalized ASR draft transcripts. It
sits before transcript import, transcript-spine reconciliation, captions, quotes,
show notes, edit suggestions, publishing, and receipt truth.

A `ready-for-reconciliation` decision means "locally reviewed enough to attempt a
reconciliation/prep pass," not that it is canonical, caption-ready, quote-ready,
or published.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import html
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
WORKBENCH_POINTER = "review-board/transcript-review-workbench/latest-transcript-review-workbench.json"
LEDGER_DIR_NAME = "transcript-review-decision-ledger"
LATEST_LEDGER_POINTER = "review-board/latest-transcript-review-decision-ledger.json"
SCHEMA = "quipsly.studio.transcript-review-decision-ledger.v1"
DECISIONS = {
    "pending",
    "ready-for-reconciliation",
    "needs-speaker-review",
    "needs-timing-review",
    "needs-rerun",
    "hold",
    "reject",
}


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp(prefix: str) -> str:
    return datetime.now(timezone.utc).strftime(f"%Y%m%d-%H%M%S-%f-{prefix}")


def esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""), quote=True)


def shell_quote(value: str) -> str:
    return "'" + str(value).replace("'", "'\\''") + "'"


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


def load_pointer_target(path: Path) -> dict[str, Any]:
    pointer = load_json(path)
    target_path = Path(str(pointer.get("jsonPath") or "")) if pointer.get("jsonPath") else None
    target = load_json(target_path) if target_path and target_path.exists() else {}
    return {**pointer, **target} if target else pointer


def ledger_dir(root: Path) -> Path:
    return root / "review-board" / LEDGER_DIR_NAME


def ledger_path(root: Path) -> Path:
    return ledger_dir(root) / "transcript-review-decision-ledger.json"


def latest_pointer_path(root: Path) -> Path:
    return root / LATEST_LEDGER_POINTER


def event_log_path(root: Path) -> Path:
    return ledger_dir(root) / "transcript-review-decision-events.jsonl"


def snapshot_ledger(path: Path) -> Path:
    snapshots = path.parent / "ledger-versions"
    snapshots.mkdir(parents=True, exist_ok=True)
    target = snapshots / f"transcript-review-decision-ledger-before-{stamp('snapshot')}.json"
    shutil.copy2(path, target)
    return target


def append_event(root: Path, event: dict[str, Any]) -> Path:
    path = event_log_path(root)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(event, sort_keys=True) + "\n")
    return path


def transcript_id(row: dict[str, Any]) -> str:
    source = row.get("source") if isinstance(row.get("source"), dict) else {}
    queue_id = str(source.get("queueId") or "").strip()
    if queue_id:
        return queue_id
    raw = str(row.get("transcriptPath") or row.get("sourcePath") or row.get("fileName") or "transcript")
    digest = hashlib.sha1(raw.encode("utf-8", "ignore")).hexdigest()[:10]
    stem = Path(raw).stem.lower().replace(" ", "-")[:60] or "transcript"
    return f"{stem}-{digest}"


def safe_commands(item_id: str) -> list[dict[str, str]]:
    dry = "./script/agentctl.sh studio-transcript-review-decision-dry-run"
    live = "./script/agentctl.sh studio-transcript-review-decision"
    return [
        {"label": "Dry-run ready", "command": f"{dry} {shell_quote(item_id)} ready-for-reconciliation '<reviewer>' '<why timing/speaker/text are good enough for reconciliation prep>'", "safety": "Dry-run only. No ledger mutation."},
        {"label": "Dry-run speaker review", "command": f"{dry} {shell_quote(item_id)} needs-speaker-review '<reviewer>' '<which speaker labels need attention>'", "safety": "Dry-run only. No ledger mutation."},
        {"label": "Dry-run timing review", "command": f"{dry} {shell_quote(item_id)} needs-timing-review '<reviewer>' '<where timing or missing words need checking>'", "safety": "Dry-run only. No ledger mutation."},
        {"label": "Dry-run rerun", "command": f"{dry} {shell_quote(item_id)} needs-rerun '<reviewer>' '<why this ASR output should be regenerated>'", "safety": "Dry-run only. No ledger mutation."},
        {"label": "Record local transcript intent", "command": f"{live} {shell_quote(item_id)} ready-for-reconciliation|needs-speaker-review|needs-timing-review|needs-rerun|hold|reject '<reviewer>' '<notes>'", "safety": "Writes only the local transcript review decision ledger. No transcript edits, import, reconciliation, timeline mutation, render, publication, upload, schedule, source mutation, overwrite, delete, or receipt truth."},
    ]


def existing_by_id(ledger: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        str(item.get("transcriptId") or ""): item
        for item in ledger.get("items", [])
        if isinstance(item, dict) and item.get("transcriptId")
    }


def default_decision_for_row(row: dict[str, Any]) -> str:
    counts = row.get("counts") if isinstance(row.get("counts"), dict) else {}
    if int(counts.get("segments") or 0) <= 0:
        return "needs-rerun"
    if int(counts.get("placeholderSpeakerSegments") or 0) > 0:
        return "needs-speaker-review"
    if int(counts.get("timedWords") or 0) <= 0:
        return "needs-timing-review"
    return "pending"


def item_from_row(row: dict[str, Any], prior: dict[str, Any]) -> dict[str, Any]:
    item_id = transcript_id(row)
    decision = str(prior.get("decision") or default_decision_for_row(row))
    if decision not in DECISIONS:
        decision = "pending"
    counts = row.get("counts") if isinstance(row.get("counts"), dict) else {}
    return {
        "transcriptId": item_id,
        "episode": row.get("episode"),
        "episodeLabel": row.get("episodeLabel") or "Episode unknown",
        "fileName": row.get("fileName") or item_id,
        "sourceKind": row.get("sourceKind") or "unknown",
        "sourcePath": row.get("sourcePath") or "",
        "transcriptPath": row.get("transcriptPath") or "",
        "rawProviderOutputPath": row.get("rawProviderOutputPath") or "",
        "provider": row.get("provider") or "unknown",
        "model": row.get("model") or "unknown",
        "language": row.get("language") or "unknown",
        "counts": counts,
        "reviewFlags": row.get("reviewFlags") if isinstance(row.get("reviewFlags"), list) else [],
        "previewSegments": row.get("previewSegments") if isinstance(row.get("previewSegments"), list) else [],
        "decision": decision,
        "status": prior.get("status") or ("local-review-recorded" if prior.get("decision") else "needs-local-review"),
        "reviewer": str(prior.get("reviewer") or ""),
        "reviewedAt": str(prior.get("reviewedAt") or ""),
        "notes": str(prior.get("notes") or ""),
        "nextSafestAction": next_action_for_decision(decision),
        "safeCommands": safe_commands(item_id),
        "truth": "Local transcript review intent only. Ready means eligible for reconciliation prep, not canonical/caption-ready/quote-ready/published.",
    }


def next_action_for_decision(decision: str) -> str:
    return {
        "pending": "Review against source audio before deciding.",
        "ready-for-reconciliation": "Use this as input to a future reconciliation/prep pass; do not import automatically.",
        "needs-speaker-review": "Assign Charlie/Homer/Guest labels where obvious before reconciliation or quote use.",
        "needs-timing-review": "Check timing drift and missing words before captions or word-highlight editing.",
        "needs-rerun": "Rerun ASR with a better provider/model/source before downstream use.",
        "hold": "Pause this transcript until the reviewer note is resolved.",
        "reject": "Do not use this draft transcript downstream; keep it only as audit evidence.",
    }.get(decision, "Review before downstream use.")


def recompute_counts(items: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "items": len(items),
        "pending": sum(1 for item in items if item.get("decision") == "pending"),
        "readyForReconciliation": sum(1 for item in items if item.get("decision") == "ready-for-reconciliation"),
        "needsSpeakerReview": sum(1 for item in items if item.get("decision") == "needs-speaker-review"),
        "needsTimingReview": sum(1 for item in items if item.get("decision") == "needs-timing-review"),
        "needsRerun": sum(1 for item in items if item.get("decision") == "needs-rerun"),
        "hold": sum(1 for item in items if item.get("decision") == "hold"),
        "reject": sum(1 for item in items if item.get("decision") == "reject"),
        "decisionsRecorded": sum(1 for item in items if item.get("reviewedAt")),
        "segments": sum(int((item.get("counts") or {}).get("segments") or 0) for item in items),
        "timedWords": sum(int((item.get("counts") or {}).get("timedWords") or 0) for item in items),
        "transcriptsEdited": False,
        "transcriptsImported": False,
        "reconciledTranscriptSpinesWritten": False,
        "timelineDecisionsWritten": False,
        "receiptTruthCreated": False,
        "externalPublishing": False,
        "externalUpload": False,
        "externalSchedulesCreated": False,
        "approvalCreated": False,
        "sourceFilesMutated": False,
        "versionsOverwritten": False,
        "filesDeleted": False,
    }


def load_workbench(root: Path) -> dict[str, Any]:
    return load_pointer_target(root / WORKBENCH_POINTER)


def build_ledger(root: Path) -> dict[str, Any]:
    workbench = load_workbench(root)
    prior = load_json(ledger_path(root))
    prior_items = existing_by_id(prior)
    rows = [row for row in (workbench.get("transcripts") or []) if isinstance(row, dict)]
    items = [item_from_row(row, prior_items.get(transcript_id(row), {})) for row in rows]
    payload = {
        "schema": SCHEMA,
        "updatedAt": iso_now(),
        "status": "transcript-review-decision-ledger-ready" if items else "transcript-review-decision-ledger-empty",
        "releaseRoot": str(root),
        "sourceWorkbenchHtml": workbench.get("htmlPath") or "",
        "sourceWorkbenchJson": workbench.get("jsonPath") or "",
        "items": items,
        "counts": recompute_counts(items),
        "decisionMeanings": {
            "pending": "No explicit local decision yet.",
            "ready-for-reconciliation": "Locally reviewed enough to attempt reconciliation/prep, not canonical or publishable by itself.",
            "needs-speaker-review": "Speaker labels need human review before downstream use.",
            "needs-timing-review": "Timing or word-level detail needs review before captions/word-highlight editing.",
            "needs-rerun": "ASR output should be regenerated from a better source/provider/model.",
            "hold": "Pause until reviewer note is resolved.",
            "reject": "Do not use this draft downstream; keep as evidence only.",
        },
        "nextSafestAction": "Review the top transcript draft and record local intent; do not import/reconcile automatically.",
        "humanAsk": "Listen/read one transcript draft, then mark speaker/timing/rerun/ready intent with notes.",
        "agentSafeParallelWork": "Codex may improve review UI, quality checks, and dry-run reconciliation prep. It must not edit/import transcripts, write spines/timelines, render, publish, upload, mutate sources, or create receipt truth.",
        "truth": {
            "reviewDecisionLedgerOnly": True,
            "transcriptsEdited": False,
            "transcriptsImported": False,
            "reconciledTranscriptSpinesWritten": False,
            "timelineDecisionsWritten": False,
            "exportsRendered": False,
            "externalPublishing": False,
            "externalUpload": False,
            "externalSchedulesCreated": False,
            "approvalCreated": False,
            "receiptTruthCreated": False,
            "sourceFilesMutated": False,
            "versionsOverwritten": False,
            "filesDeleted": False,
        },
    }
    return payload


def write_csv(ledger: dict[str, Any], path: Path) -> None:
    fields = ["transcriptId", "episodeLabel", "fileName", "decision", "status", "reviewer", "reviewedAt", "notes", "provider", "model", "sourcePath", "transcriptPath"]
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for item in ledger.get("items", []):
            writer.writerow({key: item.get(key, "") for key in fields})


def render_markdown(ledger: dict[str, Any]) -> str:
    lines = [
        "# Transcript review decision ledger",
        "",
        f"Updated: `{ledger.get('updatedAt')}`",
        f"Status: `{ledger.get('status')}`",
        f"Source workbench: `{ledger.get('sourceWorkbenchHtml')}`",
        "",
        "This is local transcript review intent only. `ready-for-reconciliation` is not canonical transcript approval, caption approval, quote approval, import, or publication permission.",
        "",
        "## Decisions",
        "",
    ]
    for key, value in (ledger.get("decisionMeanings") or {}).items():
        lines.append(f"- `{key}`: {value}")
    lines.extend(["", "## Draft transcripts", ""])
    for item in ledger.get("items", []):
        lines.extend([
            f"### {item.get('transcriptId')} - {item.get('fileName')}",
            "",
            f"- Episode: `{item.get('episodeLabel')}`",
            f"- Decision: `{item.get('decision')}`",
            f"- Reviewer: `{item.get('reviewer') or 'not recorded'}`",
            f"- Reviewed at: `{item.get('reviewedAt') or 'not recorded'}`",
            f"- Notes: {item.get('notes') or 'none yet'}",
            f"- Transcript: `{item.get('transcriptPath')}`",
            f"- Source: `{item.get('sourcePath')}`",
            f"- Next: {item.get('nextSafestAction')}",
            "",
            "Safe commands:",
            "",
        ])
        for command in item.get("safeCommands") or []:
            lines.append(f"- {command.get('label')}: `{command.get('command')}`")
        lines.append("")
    lines.extend([
        "## Safety boundary",
        "",
        "- No transcript edit/import, reconciliation, timeline mutation, render, external publication, upload, schedule, approval, source mutation, overwrite, delete, or receipt truth.",
    ])
    return "\n".join(lines).rstrip() + "\n"


def write_html(ledger: dict[str, Any], path: Path) -> None:
    counts = ledger.get("counts") if isinstance(ledger.get("counts"), dict) else {}
    metrics = "".join(
        f"<span><b>{esc(value)}</b>{esc(key)}</span>"
        for key, value in counts.items()
        if key in {"items", "readyForReconciliation", "needsSpeakerReview", "needsTimingReview", "needsRerun", "decisionsRecorded", "segments", "timedWords"}
    )
    cards: list[str] = []
    for item in ledger.get("items", []):
        flags = "".join(f"<li>{esc(flag)}</li>" for flag in (item.get("reviewFlags") or [])) or "<li>No flags.</li>"
        preview = "".join(
            f"<tr><td>{esc(seg.get('start'))}–{esc(seg.get('end'))}</td><td>{esc(seg.get('speaker'))}</td><td>{esc(seg.get('text'))}</td></tr>"
            for seg in (item.get("previewSegments") or [])
        ) or "<tr><td colspan='3'>No preview.</td></tr>"
        commands = "".join(f"<li><code>{esc(cmd.get('command'))}</code><small>{esc(cmd.get('safety'))}</small></li>" for cmd in (item.get("safeCommands") or []))
        cards.append(f"""
        <article class=\"card {esc(item.get('decision'))}\">
          <p class=\"eyebrow\">{esc(item.get('episodeLabel'))} · {esc(item.get('sourceKind'))}</p>
          <h2>{esc(item.get('fileName'))}</h2>
          <div class=\"decision\">{esc(item.get('decision'))}</div>
          <p>{esc(item.get('nextSafestAction'))}</p>
          <p><b>Reviewer:</b> {esc(item.get('reviewer') or 'not recorded')} · <b>Reviewed:</b> {esc(item.get('reviewedAt') or 'not recorded')}</p>
          <p>{esc(item.get('notes') or 'No notes yet.')}</p>
          <p class=\"path\">Transcript: {esc(item.get('transcriptPath'))}</p>
          <p class=\"path\">Source: {esc(item.get('sourcePath'))}</p>
          <h3>Flags</h3><ul>{flags}</ul>
          <details open><summary>Preview</summary><table><thead><tr><th>Time</th><th>Speaker</th><th>Text</th></tr></thead><tbody>{preview}</tbody></table></details>
          <details><summary>Safe local commands</summary><ul>{commands}</ul></details>
        </article>
        """)
    html_text = f"""<!doctype html><html><head><meta charset=\"utf-8\"><title>Transcript review decision ledger</title>
<style>
:root {{ color-scheme:dark; --bg:#10170f; --panel:#1c2b20; --ink:#fff1d7; --muted:#cbbb9d; --gold:#f2ca59; --leaf:#8bd888; --water:#76cddd; --line:#3b563f; --clay:#d78662; }}
body {{ margin:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:radial-gradient(circle at top right,rgba(118,205,221,.18),transparent 33%),linear-gradient(135deg,#10170f,#241a12 76%); color:var(--ink); }}
main {{ max-width:1220px; margin:0 auto; padding:38px 24px 84px; }}
header,.card,.panel {{ border:1px solid var(--line); border-radius:30px; background:rgba(28,43,32,.92); padding:24px; margin:18px 0; box-shadow:0 18px 52px rgba(0,0,0,.28); }}
h1 {{ font-size:clamp(38px,6vw,78px); line-height:.92; margin:.05em 0 .25em; }}
.eyebrow {{ color:var(--gold); text-transform:uppercase; letter-spacing:.16em; font-size:12px; font-weight:900; }}
.metrics {{ display:flex; flex-wrap:wrap; gap:10px; margin:16px 0; }}
.metrics span {{ border:1px solid var(--line); border-radius:999px; padding:8px 12px; background:rgba(0,0,0,.18); }}
.metrics b {{ margin-right:6px; color:var(--leaf); }}
.decision {{ display:inline-block; border-radius:999px; padding:8px 12px; background:rgba(242,202,89,.16); color:var(--gold); font-weight:900; }}
.path {{ color:var(--muted); font-size:12px; overflow-wrap:anywhere; }}
table {{ width:100%; border-collapse:collapse; margin-top:10px; }}
th,td {{ text-align:left; vertical-align:top; padding:9px 7px; border-bottom:1px solid rgba(255,255,255,.08); }}
th {{ color:var(--water); }}
code {{ color:var(--leaf); }}
small {{ display:block; color:var(--muted); margin-top:4px; }}
</style></head><body><main>
<header><p class=\"eyebrow\">Quipsly Studio · transcript decisions</p><h1>Review intent before transcript spine.</h1><p>{esc(ledger.get('nextSafestAction'))}</p><div class=\"metrics\">{metrics}</div></header>
<section class=\"panel\"><p class=\"eyebrow\">Safety</p><p>This ledger records local review intent only. It does not edit/import transcripts, reconcile spines, write timeline decisions, render, approve, upload, publish, schedule, overwrite, mutate sources, delete, or create receipt truth.</p></section>
{''.join(cards) if cards else '<section class="panel"><p>No transcript drafts available yet.</p></section>'}
</main></body></html>"""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(html_text, encoding="utf-8")


def persist(root: Path, ledger: dict[str, Any]) -> dict[str, Any]:
    path = ledger_path(root)
    markdown_path = ledger_dir(root) / "START-HERE-transcript-review-decision-ledger.md"
    html_path = ledger_dir(root) / "index.html"
    csv_path = ledger_dir(root) / "transcript-review-decision-ledger.csv"
    ledger.update({
        "htmlPath": str(html_path),
        "jsonPath": str(path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "eventLogPath": str(event_log_path(root)),
        "firstSafeAction": {
            "label": "Open transcript review decision ledger",
            "command": f"open {shell_quote(str(html_path))}",
            "path": str(html_path),
            "safety": "Opens local transcript review decision ledger only. No transcript edits/imports, reconciliation, timeline changes, renders, approvals, uploads, publications, schedules, source mutations, overwrites, deletes, or receipt truth.",
        },
    })
    write_json(path, ledger)
    markdown_path.write_text(render_markdown(ledger), encoding="utf-8")
    write_csv(ledger, csv_path)
    write_html(ledger, html_path)
    write_json(latest_pointer_path(root), ledger)
    return ledger


def record_decision(root: Path, transcript_id_value: str, decision: str, reviewer: str, notes: str, dry_run: bool) -> dict[str, Any]:
    if decision not in DECISIONS:
        raise SystemExit(f"Decision must be one of: {', '.join(sorted(DECISIONS))}")
    ledger = build_ledger(root)
    items = ledger.get("items") if isinstance(ledger.get("items"), list) else []
    target = next((item for item in items if item.get("transcriptId") == transcript_id_value), None)
    if not target:
        raise SystemExit(f"Transcript id not found in ledger: {transcript_id_value}")
    event = {
        "eventType": "transcript-review-decision",
        "createdAt": iso_now(),
        "transcriptId": transcript_id_value,
        "previousDecision": target.get("decision"),
        "decision": decision,
        "reviewer": reviewer,
        "notes": notes,
        "dryRun": dry_run,
        "truth": "Local transcript review intent only; no transcript mutation/import/reconciliation/timeline/render/publication/upload/schedule/receipt/source mutation.",
    }
    target.update({
        "decision": decision,
        "status": "local-review-recorded",
        "reviewer": reviewer,
        "reviewedAt": event["createdAt"],
        "notes": notes,
        "nextSafestAction": next_action_for_decision(decision),
    })
    ledger["updatedAt"] = event["createdAt"]
    ledger["counts"] = recompute_counts(items)
    ledger["lastEvent"] = event
    if dry_run:
        return {"status": "dry-run", "event": event, "ledgerPreview": ledger}
    path = ledger_path(root)
    snapshot = str(snapshot_ledger(path)) if path.exists() else ""
    event["snapshotBeforePath"] = snapshot
    append_event(root, event)
    return persist(root, ledger)


def main() -> int:
    parser = argparse.ArgumentParser(description="Build or update local transcript review decision ledger.")
    sub = parser.add_subparsers(dest="command")
    build_parser = sub.add_parser("build", help="Build ledger from latest transcript review workbench.")
    build_parser.add_argument("release_root", nargs="?", default=str(DEFAULT_RELEASE_ROOT))
    record_parser = sub.add_parser("record", help="Record one local transcript review decision.")
    record_parser.add_argument("transcript_id")
    record_parser.add_argument("decision")
    record_parser.add_argument("reviewer")
    record_parser.add_argument("notes")
    record_parser.add_argument("--dry-run", action="store_true")
    record_parser.add_argument("--release-root", default=str(DEFAULT_RELEASE_ROOT))
    args = parser.parse_args()

    if args.command in {None, "build"}:
        root = Path(getattr(args, "release_root", str(DEFAULT_RELEASE_ROOT))).expanduser().resolve()
        payload = persist(root, build_ledger(root))
    elif args.command == "record":
        root = Path(args.release_root).expanduser().resolve()
        payload = record_decision(root, args.transcript_id, args.decision, args.reviewer, args.notes, args.dry_run)
    else:
        parser.error("Unknown command")
        return 2

    print(json.dumps({
        "status": payload.get("status"),
        "htmlPath": payload.get("htmlPath"),
        "jsonPath": payload.get("jsonPath"),
        "markdownPath": payload.get("markdownPath"),
        "csvPath": payload.get("csvPath"),
        "counts": payload.get("counts"),
        "lastEvent": payload.get("lastEvent"),
        "firstSafeAction": payload.get("firstSafeAction"),
        "truth": payload.get("truth"),
        "event": payload.get("event"),
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
