#!/usr/bin/env python3
"""Build and safely update the Studio watch/listen review decision ledger.

This ledger records local reviewer judgments for Studio evidence-room items. It is
upstream from Tower approval and receipt truth: a Studio decision can say
"promote/refine/hold/need more evidence," but it does not approve publication,
promote packages, publish, upload, schedule, overwrite, delete, mutate source
media, or create external receipts.
"""

from __future__ import annotations

import csv
import html
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
SCHEMA = "quipsly.studio.review-decision-ledger.v1"
DECISIONS = {"pending", "promote", "refine", "hold", "need-more-evidence"}
LEDGER_DIR_NAME = "studio-review-decision-ledger"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp(prefix: str = "studio-review-decision-ledger") -> str:
    return datetime.now(timezone.utc).strftime(f"%Y%m%d-%H%M%S-%f-{prefix}")


def load_json(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def esc(value: object) -> str:
    return html.escape(str(value or ""), quote=True)


def as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def ledger_dir(release_root: Path) -> Path:
    return release_root / "review-board" / LEDGER_DIR_NAME


def ledger_path(release_root: Path) -> Path:
    return ledger_dir(release_root) / "studio-review-decision-ledger.json"


def latest_pointer_path(release_root: Path) -> Path:
    return release_root / "review-board" / "latest-studio-review-decision-ledger.json"


def render_markdown(ledger: dict[str, Any]) -> str:
    lines = [
        "# Studio review decision ledger",
        "",
        f"- Updated: `{ledger.get('updatedAt')}`",
        f"- Status: `{ledger.get('status')}`",
        f"- Source room: `{ledger.get('sourceWatchListenRoomHtml')}`",
        "- Truth: local Studio review decisions only; not Tower approval, not package promotion, not publication, not upload, not schedule, not receipt truth.",
        "",
        "## Decision states",
        "",
        "- `pending`: evidence exists but no reviewer decision is recorded.",
        "- `promote`: reviewer believes this item should move toward the next local package/version/review step.",
        "- `refine`: reviewer saw/heard something that needs repair or a better candidate.",
        "- `hold`: reviewer wants this item kept blocked until a specific concern is resolved.",
        "- `need-more-evidence`: reviewer cannot decide from current evidence.",
        "",
        "## Items",
        "",
    ]
    for item in ledger.get("items") or []:
        lines.extend([
            f"### {item.get('label')}",
            "",
            f"- Item ID: `{item.get('itemId')}`",
            f"- Episode: `{item.get('episode')}`",
            f"- Kind: `{item.get('kind')}`",
            f"- Decision: `{item.get('decision')}`",
            f"- Status: `{item.get('status')}`",
            f"- Reviewer: `{item.get('reviewer') or 'not recorded'}`",
            f"- Reviewed at: `{item.get('reviewedAt') or 'not recorded'}`",
            f"- Notes: {item.get('notes') or 'no notes yet'}",
            f"- Next safest action: {item.get('nextSafestAction')}",
            "",
            "Safe local commands:",
            "",
        ])
        for command in item.get("safeCommands") or []:
            lines.append(f"- `{command.get('label')}`: `{command.get('command')}`")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def write_csv(ledger: dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["itemId", "episode", "kind", "label", "decision", "status", "reviewer", "reviewedAt", "notes", "evidenceRows", "mediaEvidenceRows", "nextSafestAction"])
        writer.writeheader()
        for item in ledger.get("items") or []:
            writer.writerow({
                "itemId": item.get("itemId"),
                "episode": item.get("episode"),
                "kind": item.get("kind"),
                "label": item.get("label"),
                "decision": item.get("decision"),
                "status": item.get("status"),
                "reviewer": item.get("reviewer"),
                "reviewedAt": item.get("reviewedAt"),
                "notes": item.get("notes"),
                "evidenceRows": item.get("evidenceRows"),
                "mediaEvidenceRows": item.get("mediaEvidenceRows"),
                "nextSafestAction": item.get("nextSafestAction"),
            })


def write_html(ledger: dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    metrics = "".join(
        f"<div class='metric'><b>{esc(value)}</b><span>{esc(label)}</span></div>"
        for label, value in [
            ("items", ledger.get("counts", {}).get("items")),
            ("pending", ledger.get("counts", {}).get("pending")),
            ("decisions recorded", ledger.get("counts", {}).get("decisionsRecorded")),
            ("needs action", ledger.get("counts", {}).get("needsAction")),
        ]
    )
    cards = []
    for item in ledger.get("items") or []:
        commands = "".join(f"<li><code>{esc(command.get('command'))}</code></li>" for command in item.get("safeCommands") or [])
        evidence = "".join(f"<li>{esc(row.get('kind'))}: <a href='{esc(row.get('uri'))}'>{esc(row.get('label'))}</a></li>" for row in (item.get("evidencePreview") or []) if row.get("uri"))
        cards.append(f"""
<article class='card {esc(item.get('decision'))}'>
  <p class='eyebrow'>{esc(item.get('kind'))} · episode {esc(item.get('episode'))}</p>
  <h2>{esc(item.get('label'))}</h2>
  <div class='decision'>{esc(item.get('decision'))}</div>
  <p>{esc(item.get('humanAsk'))}</p>
  <p><strong>Next:</strong> {esc(item.get('nextSafestAction'))}</p>
  <dl><dt>Reviewer</dt><dd>{esc(item.get('reviewer') or 'not recorded')}</dd><dt>Reviewed at</dt><dd>{esc(item.get('reviewedAt') or 'not recorded')}</dd><dt>Notes</dt><dd>{esc(item.get('notes') or 'no notes yet')}</dd></dl>
  <details open><summary>Evidence preview</summary><ul>{evidence or '<li>No openable evidence preview recorded.</li>'}</ul></details>
  <details><summary>Safe local commands</summary><ul>{commands}</ul></details>
</article>
""")
    page = f"""<!doctype html>
<html lang='en'>
<head>
<meta charset='utf-8' />
<meta name='viewport' content='width=device-width, initial-scale=1' />
<title>Studio review decision ledger</title>
<style>
:root {{ color-scheme:dark; --bg:#101713; --panel:#19241d; --line:rgba(246,239,219,.14); --ink:#f6efdb; --muted:#b9ad92; --leaf:#66d07d; --gold:#efca54; --clay:#d06c4b; --water:#73c9df; }}
body {{ margin:0; font:15px/1.5 -apple-system,BlinkMacSystemFont,'Avenir Next',Inter,sans-serif; background:radial-gradient(circle at top left, #243a25, var(--bg) 44%); color:var(--ink); }}
a {{ color:var(--water); }} code {{ color:#e7dfc8; word-break:break-word; }}
header {{ padding:44px 6vw 28px; border-bottom:1px solid var(--line); }} .eyebrow {{ margin:0 0 8px; letter-spacing:.2em; text-transform:uppercase; color:var(--gold); font-size:12px; font-weight:900; }}
h1 {{ margin:0; font-size:clamp(34px,5vw,62px); line-height:1; max-width:980px; }} header p {{ max-width:980px; color:var(--muted); font-size:18px; }}
.metrics {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:12px; margin-top:24px; max-width:900px; }} .metric {{ border:1px solid var(--line); background:rgba(0,0,0,.24); border-radius:18px; padding:16px; }} .metric b {{ display:block; font-size:28px; color:var(--leaf); }} .metric span {{ color:var(--muted); text-transform:uppercase; letter-spacing:.12em; font-size:11px; font-weight:800; }}
main {{ padding:28px 6vw 64px; }} .truth {{ border:1px solid rgba(239,202,84,.28); background:rgba(239,202,84,.1); border-radius:18px; padding:16px; margin-bottom:22px; color:#fff3bb; }}
.card {{ border:1px solid var(--line); background:rgba(25,36,29,.92); border-radius:24px; padding:22px; margin:0 0 18px; }} .card.promote {{ border-color:rgba(102,208,125,.42); }} .card.refine,.card.hold,.card.need-more-evidence {{ border-color:rgba(208,108,75,.45); }}
h2 {{ margin:0; font-size:28px; }} .decision {{ display:inline-flex; margin:12px 0; padding:7px 12px; border-radius:999px; background:rgba(239,202,84,.14); color:var(--gold); font-weight:900; text-transform:uppercase; letter-spacing:.08em; }}
dl {{ display:grid; grid-template-columns:120px minmax(0,1fr); gap:8px 12px; }} dt {{ color:var(--muted); font-weight:800; }} dd {{ margin:0; }} details {{ margin-top:12px; border:1px solid var(--line); border-radius:16px; padding:12px; background:rgba(0,0,0,.18); }} summary {{ cursor:pointer; color:var(--gold); font-weight:850; }}
</style>
</head>
<body>
<header><p class='eyebrow'>Quipsly Studio · local reviewer decisions</p><h1>Judgment lives here before Tower moves.</h1><p>This ledger records watch/listen decisions for Studio evidence. It does not promote packages, approve publishing, upload, schedule, overwrite, mutate source media, or create receipt truth.</p><div class='metrics'>{metrics}</div></header>
<main><div class='truth'>{esc(ledger.get('truth'))}</div>{''.join(cards)}</main>
</body>
</html>
"""
    path.write_text(page, encoding="utf-8")


def load_room(release_root: Path) -> dict[str, Any]:
    pointer = load_json(release_root / "review-board" / "latest-studio-watch-listen-review-room.json")
    room = load_json(Path(str(pointer.get("jsonPath") or ""))) if pointer.get("jsonPath") else {}
    return room or pointer


def existing_item_map(existing: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {str(item.get("itemId") or ""): item for item in as_list(existing.get("items")) if isinstance(item, dict)}


def evidence_preview(item: dict[str, Any], limit: int = 8) -> list[dict[str, Any]]:
    rows = []
    for row in as_list(item.get("evidenceRows")):
        if not isinstance(row, dict):
            continue
        if not row.get("exists"):
            continue
        rows.append({
            "label": str(row.get("label") or "Evidence"),
            "path": str(row.get("path") or ""),
            "kind": str(row.get("kind") or "file"),
            "uri": str(row.get("uri") or ""),
            "openCommand": str(row.get("openCommand") or ""),
        })
        if len(rows) >= limit:
            break
    return rows


def safe_commands_for_item(item_id: str, label: str) -> list[dict[str, str]]:
    base = "./script/agentctl.sh studio-review-decision-dry-run"
    write_base = "./script/agentctl.sh studio-review-decision"
    return [
        {
            "label": f"Dry-run promote {label}",
            "command": f"{base} {shell_quote(item_id)} promote '<reviewer>' '<why this should move forward>'",
            "safety": "Dry-run only. No ledger mutation.",
        },
        {
            "label": f"Dry-run refine {label}",
            "command": f"{base} {shell_quote(item_id)} refine '<reviewer>' '<what needs repair or another version>'",
            "safety": "Dry-run only. No ledger mutation.",
        },
        {
            "label": f"Dry-run hold {label}",
            "command": f"{base} {shell_quote(item_id)} hold '<reviewer>' '<why this stays blocked>'",
            "safety": "Dry-run only. No ledger mutation.",
        },
        {
            "label": f"Record decision for {label}",
            "command": f"{write_base} {shell_quote(item_id)} promote|refine|hold|need-more-evidence '<reviewer>' '<notes>'",
            "safety": "Writes only the local Studio review decision ledger after explicit use. No publishing, upload, schedule, source mutation, overwrite, package promotion, or receipt truth.",
        },
    ]


def recompute_counts(items: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "items": len(items),
        "pending": sum(1 for item in items if item.get("decision") == "pending"),
        "promote": sum(1 for item in items if item.get("decision") == "promote"),
        "refine": sum(1 for item in items if item.get("decision") == "refine"),
        "hold": sum(1 for item in items if item.get("decision") == "hold"),
        "needMoreEvidence": sum(1 for item in items if item.get("decision") == "need-more-evidence"),
        "decisionsRecorded": sum(1 for item in items if item.get("decision") != "pending"),
        "needsAction": sum(1 for item in items if item.get("decision") in {"pending", "refine", "hold", "need-more-evidence"}),
        "externalPublishing": False,
        "externalSchedulesCreated": False,
        "receiptTruthCreated": False,
        "originalsMutated": False,
        "versionsOverwritten": False,
        "sourceFilesMutated": False,
        "packagePromotionsCreated": False,
    }


def build_ledger(release_root: Path, *, persist: bool = True) -> dict[str, Any]:
    room = load_room(release_root)
    existing = load_json(ledger_path(release_root))
    prior_by_id = existing_item_map(existing)
    items: list[dict[str, Any]] = []
    for room_item in as_list(room.get("reviewItems")):
        if not isinstance(room_item, dict):
            continue
        item_id = str(room_item.get("id") or room_item.get("itemId") or room_item.get("label") or "review-item")
        prior = prior_by_id.get(item_id, {})
        decision = str(prior.get("decision") or "pending")
        if decision not in DECISIONS:
            decision = "pending"
        label = str(room_item.get("label") or item_id)
        items.append({
            "itemId": item_id,
            "label": label,
            "episode": room_item.get("episode") or "unknown",
            "kind": str(room_item.get("kind") or "review"),
            "sourceStatus": str(room_item.get("status") or ""),
            "status": prior.get("status") or ("pending-review" if decision == "pending" else "reviewed"),
            "decision": decision,
            "reviewer": prior.get("reviewer") or "",
            "reviewedAt": prior.get("reviewedAt") or "",
            "notes": prior.get("notes") or "",
            "humanAsk": str(room_item.get("humanAsk") or "Review local evidence and choose the next safe local decision."),
            "nextSafestAction": str(room_item.get("nextSafestAction") or "Open evidence, record a local decision, and keep Tower truth unchanged until explicitly approved."),
            "evidenceRows": int((room_item.get("counts") or {}).get("evidenceRows") or len(as_list(room_item.get("evidenceRows")))) ,
            "mediaEvidenceRows": int((room_item.get("counts") or {}).get("embeddableMediaRows") or len(as_list(room_item.get("embeddableMediaRows")))) ,
            "evidencePreview": evidence_preview(room_item),
            "safeCommands": safe_commands_for_item(item_id, label),
        })
    counts = recompute_counts(items)
    output_dir = ledger_dir(release_root)
    html_path = output_dir / "index.html"
    json_path = ledger_path(release_root)
    markdown_path = output_dir / "STUDIO-REVIEW-DECISION-LEDGER.md"
    csv_path = output_dir / "studio-review-decision-ledger.csv"
    now = iso_now()
    ledger = {
        "schema": SCHEMA,
        "generatedAt": existing.get("generatedAt") or now,
        "updatedAt": now,
        "status": "review-decisions-pending" if counts["pending"] else "review-decisions-recorded",
        "releaseRoot": str(release_root),
        "sourceWatchListenRoomHtml": room.get("htmlPath") or "",
        "sourceWatchListenRoomJson": room.get("jsonPath") or "",
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "eventLogPath": str(output_dir / "studio-review-decision-events.jsonl"),
        "allowedDecisions": sorted(DECISIONS),
        "counts": counts,
        "items": items,
        "humanAsk": "Record local watch/listen decisions for Studio evidence without changing package, Tower, publication, or receipt truth.",
        "nextSafestAction": "Open this ledger, dry-run a decision command, then only record a local decision after a reviewer has actually watched/listened to the evidence.",
        "firstSafeAction": {
            "label": "Open Studio review decision ledger",
            "path": str(html_path),
            "command": f"open {shell_quote(str(html_path))}",
            "safety": "Opens local decision ledger only. No publish, upload, schedule, package promotion, source mutation, overwrite, or receipt truth.",
        },
        "truth": "Local Studio watch/listen decision ledger only. It does not approve Tower artifacts, promote packages, publish, upload, schedule, overwrite, delete, mutate source media, or create receipt truth.",
        "agentSafeParallelWork": "Codex may summarize local review decisions, prepare dry-run decision commands, and improve reviewer guidance. Do not record real decisions, approve, promote, publish, upload, schedule, mutate accounts/media, overwrite, delete, or create receipts without explicit approval.",
    }
    pointer = pointer_payload(ledger)
    if persist:
        write_html(ledger, html_path)
        markdown_path.write_text(render_markdown(ledger), encoding="utf-8")
        write_csv(ledger, csv_path)
        write_json(json_path, ledger)
        write_json(latest_pointer_path(release_root), pointer)
        write_json(output_dir / "latest-studio-review-decision-ledger.json", pointer)
    return pointer


def pointer_payload(ledger: dict[str, Any]) -> dict[str, Any]:
    return {
        "schema": SCHEMA,
        "updatedAt": ledger.get("updatedAt"),
        "status": ledger.get("status"),
        "counts": ledger.get("counts") or {},
        "htmlPath": ledger.get("htmlPath"),
        "jsonPath": ledger.get("jsonPath"),
        "markdownPath": ledger.get("markdownPath"),
        "csvPath": ledger.get("csvPath"),
        "eventLogPath": ledger.get("eventLogPath"),
        "humanAsk": ledger.get("humanAsk"),
        "nextSafestAction": ledger.get("nextSafestAction"),
        "firstSafeAction": ledger.get("firstSafeAction"),
        "firstReviewDecisionItem": (ledger.get("items") or [{}])[0] if ledger.get("items") else {},
        "truth": {
            "plainEnglish": ledger.get("truth"),
            "externalPublishing": False,
            "externalSchedulesCreated": False,
            "receiptTruthCreated": False,
            "originalsMutated": False,
            "versionsOverwritten": False,
            "sourceFilesMutated": False,
            "packagePromotionsCreated": False,
        },
        "agentSafeParallelWork": ledger.get("agentSafeParallelWork"),
    }


def snapshot(path: Path) -> Path:
    version_dir = path.parent / "ledger-versions"
    version_dir.mkdir(parents=True, exist_ok=True)
    target = version_dir / f"studio-review-decision-ledger-before-{stamp('update')}.json"
    shutil.copy2(path, target)
    return target


def append_event(release_root: Path, event: dict[str, Any]) -> Path:
    path = ledger_dir(release_root) / "studio-review-decision-events.jsonl"
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(event, sort_keys=True) + "\n")
    return path


def persist_existing_ledger(release_root: Path, ledger: dict[str, Any]) -> None:
    ledger["updatedAt"] = iso_now()
    ledger["counts"] = recompute_counts([item for item in as_list(ledger.get("items")) if isinstance(item, dict)])
    ledger["status"] = "review-decisions-pending" if ledger["counts"]["pending"] else "review-decisions-recorded"
    html_path = Path(str(ledger.get("htmlPath") or ledger_dir(release_root) / "index.html"))
    markdown_path = Path(str(ledger.get("markdownPath") or ledger_dir(release_root) / "STUDIO-REVIEW-DECISION-LEDGER.md"))
    csv_path = Path(str(ledger.get("csvPath") or ledger_dir(release_root) / "studio-review-decision-ledger.csv"))
    json_path = ledger_path(release_root)
    ledger["jsonPath"] = str(json_path)
    ledger["htmlPath"] = str(html_path)
    ledger["markdownPath"] = str(markdown_path)
    ledger["csvPath"] = str(csv_path)
    write_html(ledger, html_path)
    markdown_path.write_text(render_markdown(ledger), encoding="utf-8")
    write_csv(ledger, csv_path)
    write_json(json_path, ledger)
    pointer = pointer_payload(ledger)
    write_json(latest_pointer_path(release_root), pointer)
    write_json(ledger_dir(release_root) / "latest-studio-review-decision-ledger.json", pointer)


def record_decision(release_root: Path, item_id: str, decision: str, reviewer: str, notes: str, *, dry_run: bool) -> dict[str, Any]:
    decision = decision.strip().lower()
    if decision not in DECISIONS:
        raise SystemExit(f"Decision must be one of {sorted(DECISIONS)}")
    if not reviewer.strip():
        raise SystemExit("Reviewer is required")
    path = ledger_path(release_root)
    if path.exists():
        ledger = load_json(path)
    elif dry_run:
        transient_pointer = build_ledger(release_root, persist=False)
        transient_json_path = str(transient_pointer.get("jsonPath") or "")
        if transient_json_path and Path(transient_json_path).exists():
            ledger = load_json(Path(transient_json_path))
        else:
            # Build the transient ledger payload by using the same room merge logic without writing files.
            room = load_room(release_root)
            now = iso_now()
            items = []
            for room_item in as_list(room.get("reviewItems")):
                if not isinstance(room_item, dict):
                    continue
                room_id = str(room_item.get("id") or room_item.get("itemId") or room_item.get("label") or "review-item")
                label = str(room_item.get("label") or room_id)
                items.append({
                    "itemId": room_id,
                    "label": label,
                    "episode": room_item.get("episode") or "unknown",
                    "kind": str(room_item.get("kind") or "review"),
                    "sourceStatus": str(room_item.get("status") or ""),
                    "status": "pending-review",
                    "decision": "pending",
                    "reviewer": "",
                    "reviewedAt": "",
                    "notes": "",
                    "humanAsk": str(room_item.get("humanAsk") or "Review local evidence and choose the next safe local decision."),
                    "nextSafestAction": str(room_item.get("nextSafestAction") or "Open evidence, record a local decision, and keep Tower truth unchanged until explicitly approved."),
                    "evidenceRows": int((room_item.get("counts") or {}).get("evidenceRows") or len(as_list(room_item.get("evidenceRows")))),
                    "mediaEvidenceRows": int((room_item.get("counts") or {}).get("embeddableMediaRows") or len(as_list(room_item.get("embeddableMediaRows")))),
                    "evidencePreview": evidence_preview(room_item),
                    "safeCommands": safe_commands_for_item(room_id, label),
                })
            ledger = {
                "schema": SCHEMA,
                "generatedAt": now,
                "updatedAt": now,
                "status": "review-decisions-pending",
                "releaseRoot": str(release_root),
                "items": items,
                "counts": recompute_counts(items),
            }
    else:
        build_ledger(release_root)
        ledger = load_json(path)
    items = [item for item in as_list(ledger.get("items")) if isinstance(item, dict)]
    item = next((row for row in items if row.get("itemId") == item_id), None)
    if not item:
        valid = ", ".join(str(row.get("itemId")) for row in items)
        raise SystemExit(f"Review item not found: {item_id}. Valid items: {valid}")
    before = dict(item)
    after = dict(item)
    reviewed_at = iso_now()
    after.update({
        "decision": decision,
        "status": "pending-review" if decision == "pending" else "reviewed",
        "reviewer": reviewer,
        "reviewedAt": reviewed_at if decision != "pending" else "",
        "notes": notes,
    })
    if dry_run:
        preview_items = [dict(row) for row in items]
        for index, row in enumerate(preview_items):
            if row.get("itemId") == item_id:
                preview_items[index] = after
        return {
            "ok": True,
            "dryRun": True,
            "kind": "studio-review-decision",
            "ledgerPath": str(path),
            "eventLogPath": str(ledger_dir(release_root) / "studio-review-decision-events.jsonl"),
            "itemId": item_id,
            "decision": decision,
            "reviewer": reviewer,
            "before": before,
            "afterPreview": after,
            "countsAfterPreview": recompute_counts(preview_items),
            "ledgerMutated": False,
            "eventAppended": False,
            "snapshotCreated": False,
            "externalPublishing": False,
            "externalSchedulesCreated": False,
            "receiptTruthCreated": False,
            "packagePromotionsCreated": False,
            "sourceFilesMutated": False,
            "originalsMutated": False,
            "versionsOverwritten": False,
            "truth": "Dry-run only. No ledger, event log, package, Tower approval, publication, upload, schedule, receipt, source media, or version state was changed.",
        }
    snap = snapshot(path)
    for index, row in enumerate(items):
        if row.get("itemId") == item_id:
            items[index] = after
    ledger["items"] = items
    ledger["lastStudioReviewDecision"] = {
        "itemId": item_id,
        "decision": decision,
        "reviewer": reviewer,
        "reviewedAt": reviewed_at,
    }
    persist_existing_ledger(release_root, ledger)
    event = {
        "schema": "quipsly.studio.review-decision-event.v1",
        "createdAt": iso_now(),
        "itemId": item_id,
        "decision": decision,
        "reviewer": reviewer,
        "before": before,
        "after": after,
        "snapshotPath": str(snap),
        "externalPublishing": False,
        "externalSchedulesCreated": False,
        "receiptTruthCreated": False,
        "packagePromotionsCreated": False,
        "sourceFilesMutated": False,
        "originalsMutated": False,
        "versionsOverwritten": False,
    }
    event_path = append_event(release_root, event)
    return {
        "ok": True,
        "dryRun": False,
        "kind": "studio-review-decision",
        "ledgerPath": str(path),
        "eventLogPath": str(event_path),
        "snapshotPath": str(snap),
        "snapshotCreated": True,
        "ledgerMutated": True,
        "eventAppended": True,
        "itemId": item_id,
        "decision": decision,
        "reviewer": reviewer,
        "externalPublishing": False,
        "externalSchedulesCreated": False,
        "receiptTruthCreated": False,
        "packagePromotionsCreated": False,
        "sourceFilesMutated": False,
        "originalsMutated": False,
        "versionsOverwritten": False,
        "truth": "Local Studio review decision recorded only. No package promotion, Tower approval, publication, upload, schedule, source mutation, overwrite, or receipt truth occurred.",
    }


def main(argv: list[str]) -> int:
    if len(argv) == 1:
        print(json.dumps(build_ledger(DEFAULT_RELEASE_ROOT), indent=2, sort_keys=True))
        return 0
    command = argv[1]
    if command == "build":
        release_root = Path(argv[2]) if len(argv) > 2 else DEFAULT_RELEASE_ROOT
        print(json.dumps(build_ledger(release_root), indent=2, sort_keys=True))
        return 0
    if command == "record":
        if len(argv) < 6:
            raise SystemExit("Usage: build_studio_review_decision_ledger.py record ITEM_ID pending|promote|refine|hold|need-more-evidence REVIEWER [notes] [--dry-run] [--release-root PATH]")
        dry_run = "--dry-run" in argv
        release_root = DEFAULT_RELEASE_ROOT
        clean = [value for value in argv[2:] if value != "--dry-run"]
        if "--release-root" in clean:
            idx = clean.index("--release-root")
            release_root = Path(clean[idx + 1])
            clean = clean[:idx] + clean[idx + 2:]
        item_id, decision, reviewer = clean[0], clean[1], clean[2]
        notes = clean[3] if len(clean) > 3 else ""
        print(json.dumps(record_decision(release_root, item_id, decision, reviewer, notes, dry_run=dry_run), indent=2, sort_keys=True))
        return 0
    # Backward-compatible shorthand: first arg may be a release root.
    release_root = Path(command)
    print(json.dumps(build_ledger(release_root), indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
