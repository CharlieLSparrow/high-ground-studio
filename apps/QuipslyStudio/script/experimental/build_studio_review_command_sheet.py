#!/usr/bin/env python3
"""Build a calm command/intake sheet for Studio review decisions.

This reads the Studio review decision ledger and creates a reviewer-facing sheet
with evidence links, dry-run-first commands, write commands, and note templates.
It does not record decisions, approve Tower artifacts, promote packages, publish,
upload, schedule, overwrite, delete, mutate source media, or create receipts.
"""

from __future__ import annotations

import csv
import html
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
SCHEMA = "quipsly.studio.review-command-sheet.v1"
DECISIONS = ["promote", "refine", "hold", "need-more-evidence", "pending"]


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-studio-review-command-sheet")


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


def file_uri(path: str) -> str:
    try:
        return Path(path).resolve().as_uri()
    except Exception:
        return ""


def load_ledger(release_root: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    pointer = load_json(release_root / "review-board" / "latest-studio-review-decision-ledger.json")
    ledger = load_json(Path(str(pointer.get("jsonPath") or ""))) if pointer.get("jsonPath") else {}
    return pointer, ledger or pointer


def decision_copy(item: dict[str, Any], decision: str) -> tuple[str, str]:
    label = str(item.get("label") or item.get("itemId") or "review item")
    if decision == "promote":
        return f"Promote {label}", "The reviewer thinks this item can move to the next local package/review step. This is still not Tower approval or publication."
    if decision == "refine":
        return f"Refine {label}", "The reviewer saw/heard something that needs repair, rebuild, sync work, or clearer evidence."
    if decision == "hold":
        return f"Hold {label}", "The reviewer wants this item to stay blocked until a specific concern is resolved."
    if decision == "need-more-evidence":
        return f"Need more evidence for {label}", "The reviewer cannot decide from the current watch/listen evidence."
    return f"Reset {label} to pending", "The reviewer is clearing the local decision back to pending review."


def command_rows(item: dict[str, Any]) -> list[dict[str, Any]]:
    item_id = str(item.get("itemId") or "")
    rows: list[dict[str, Any]] = []
    for decision in DECISIONS:
        title, meaning = decision_copy(item, decision)
        dry = f"./script/agentctl.sh studio-review-decision-dry-run {shell_quote(item_id)} {decision} '<reviewer>' '<notes>'"
        write = f"./script/agentctl.sh studio-review-decision {shell_quote(item_id)} {decision} '<reviewer>' '<notes>'"
        rows.append({
            "decision": decision,
            "label": title,
            "meaning": meaning,
            "dryRunCommand": dry,
            "recordCommand": write,
            "safety": "Dry-run first. The record command writes only local Studio decision metadata; it does not promote packages, approve Tower, publish, upload, schedule, overwrite, mutate media, or create receipts.",
        })
    return rows


def note_template(item: dict[str, Any]) -> str:
    evidence = "\n".join(f"- {row.get('label')}: {row.get('path')}" for row in as_list(item.get("evidencePreview"))[:8]) or "- No evidence links were captured in the ledger."
    return f"""## Studio reviewer note

- Item: {item.get('label')}
- Item ID: {item.get('itemId')}
- Episode: {item.get('episode')}
- Decision: <promote / refine / hold / need-more-evidence / pending>
- Reviewer:
- What I watched/listened to:
{evidence}
- What I noticed:
- Why this decision is safe:
- Follow-up for Codex:
- Follow-up for Charlie/Mako/Homer:
- Explicit non-claims: not Tower approval, not package promotion, not published, not uploaded, not scheduled, no external receipt, no source media mutated, no previous version overwritten.
"""


def build_item_rows(ledger: dict[str, Any]) -> list[dict[str, Any]]:
    rows = []
    for item in as_list(ledger.get("items")):
        if not isinstance(item, dict):
            continue
        evidence_preview = []
        for row in as_list(item.get("evidencePreview")):
            if not isinstance(row, dict):
                continue
            path = str(row.get("path") or "")
            evidence_preview.append({
                "label": str(row.get("label") or "Evidence"),
                "path": path,
                "kind": str(row.get("kind") or "file"),
                "uri": str(row.get("uri") or file_uri(path)),
                "openCommand": str(row.get("openCommand") or (f"open {shell_quote(path)}" if path else "")),
            })
        commands = command_rows(item)
        first_evidence = evidence_preview[0] if evidence_preview else {}
        first_evidence_command = str(first_evidence.get("openCommand") or "")
        recommended = "need-more-evidence"
        if str(item.get("decision") or "pending") != "pending":
            recommended = "pending"
        rows.append({
            "itemId": str(item.get("itemId") or ""),
            "episode": item.get("episode") or "unknown",
            "kind": str(item.get("kind") or "review"),
            "label": str(item.get("label") or item.get("itemId") or "Review item"),
            "currentDecision": str(item.get("decision") or "pending"),
            "status": str(item.get("status") or ""),
            "humanAsk": str(item.get("humanAsk") or "Watch/listen and record the local Studio decision."),
            "nextSafestAction": str(item.get("nextSafestAction") or "Open the evidence first, then dry-run a local decision only after watch/listen review."),
            "reviewFirstAction": {
                "label": f"Open evidence for {str(item.get('label') or item.get('itemId') or 'review item')}",
                "command": first_evidence_command,
                "path": str(first_evidence.get("path") or ""),
                "safety": "Opens local review evidence only. No decision, promotion, Tower approval, publication, upload, schedule, overwrite, source mutation, or receipt truth.",
            },
            "recommendedDecision": recommended,
            "recommendedDryRunCommand": next((row["dryRunCommand"] for row in commands if row["decision"] == recommended), commands[0]["dryRunCommand"]),
            "recommendedRecordCommand": next((row["recordCommand"] for row in commands if row["decision"] == recommended), commands[0]["recordCommand"]),
            "evidencePreview": evidence_preview,
            "commandRows": commands,
            "noteTemplate": note_template(item),
        })
    return rows


def write_markdown(payload: dict[str, Any], path: Path) -> None:
    lines = [
        "# Studio review command sheet",
        "",
        f"- Updated: `{payload['updatedAt']}`",
        f"- Status: `{payload['status']}`",
        f"- Items: `{payload['counts']['items']}`",
        f"- Pending decisions: `{payload['counts']['pending']}`",
        "- Truth: local command sheet only; no decision is recorded by generating this sheet.",
        "",
    ]
    for item in payload["items"]:
        lines.extend([
            f"## {item['label']}",
            "",
            f"- Item ID: `{item['itemId']}`",
            f"- Current decision: `{item['currentDecision']}`",
            f"- Review first: `{item.get('reviewFirstAction', {}).get('command') or 'open the watch/listen room'}`",
            f"- Dry-run after review: `{item['recommendedDryRunCommand']}`",
            "",
            "### Evidence",
            "",
        ])
        for row in item["evidencePreview"]:
            lines.append(f"- `{row['kind']}` [{row['label']}]({row['path']})")
        lines.extend(["", "### Commands", ""])
        for command in item["commandRows"]:
            lines.extend([f"- {command['label']}", f"  - Dry-run: `{command['dryRunCommand']}`", f"  - Record: `{command['recordCommand']}`"])
        lines.extend(["", "### Note template", "", "```markdown", item["noteTemplate"].rstrip(), "```", ""])
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines), encoding="utf-8")


def write_csv(payload: dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["itemId", "episode", "kind", "label", "currentDecision", "recommendedDecision", "recommendedDryRunCommand", "recommendedRecordCommand"])
        writer.writeheader()
        for item in payload["items"]:
            writer.writerow({key: item.get(key) for key in writer.fieldnames})


def write_html(payload: dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    metrics = "".join(
        f"<div class='metric'><b>{esc(value)}</b><span>{esc(label)}</span></div>"
        for label, value in [("items", payload["counts"].get("items")), ("pending", payload["counts"].get("pending")), ("recorded", payload["counts"].get("decisionsRecorded")), ("commands", payload["counts"].get("commands"))]
    )
    cards = []
    for item in payload["items"]:
        evidence = "".join(f"<li><a href='{esc(row.get('uri'))}'>{esc(row.get('label'))}</a><code>{esc(row.get('path'))}</code></li>" for row in item["evidencePreview"])
        commands = "".join(
            f"<tr><td>{esc(row['decision'])}</td><td>{esc(row['meaning'])}</td><td><code>{esc(row['dryRunCommand'])}</code></td><td><code>{esc(row['recordCommand'])}</code></td></tr>"
            for row in item["commandRows"]
        )
        cards.append(f"""
<section class='card'>
  <p class='eyebrow'>{esc(item['kind'])} · episode {esc(item['episode'])}</p>
  <h2>{esc(item['label'])}</h2>
  <p class='decision'>Current: {esc(item['currentDecision'])} · Evidence first, decision second</p>
  <p>{esc(item['humanAsk'])}</p>
  <div class='callout'><strong>Start here: open/watch/listen evidence</strong><code>{esc(item.get('reviewFirstAction', {}).get('command') or 'Open the Studio watch/listen review room first.')}</code></div>
  <div class='callout secondary'><strong>After review: dry-run the tentative decision</strong><code>{esc(item['recommendedDryRunCommand'])}</code></div>
  <details open><summary>Evidence to open</summary><ul>{evidence or '<li>No evidence links captured.</li>'}</ul></details>
  <details><summary>All decision commands</summary><table><thead><tr><th>Decision</th><th>Meaning</th><th>Dry-run</th><th>Record local decision</th></tr></thead><tbody>{commands}</tbody></table></details>
  <details><summary>Copy reviewer note template</summary><pre>{esc(item['noteTemplate'])}</pre></details>
</section>
""")
    page = f"""<!doctype html>
<html lang='en'>
<head>
<meta charset='utf-8' />
<meta name='viewport' content='width=device-width, initial-scale=1' />
<title>Studio review command sheet</title>
<style>
:root {{ color-scheme:dark; --bg:#101812; --panel:#1b271f; --line:rgba(245,238,218,.14); --ink:#f5eeda; --muted:#b9ad92; --gold:#efca54; --leaf:#66d07d; --water:#73c9df; }}
body {{ margin:0; font:15px/1.5 -apple-system,BlinkMacSystemFont,'Avenir Next',Inter,sans-serif; background:radial-gradient(circle at 8% 0%, #263c25, var(--bg) 42%); color:var(--ink); }} a {{ color:var(--water); }} code,pre {{ white-space:pre-wrap; word-break:break-word; }}
header {{ padding:44px 6vw 30px; border-bottom:1px solid var(--line); }} .eyebrow {{ margin:0 0 8px; color:var(--gold); letter-spacing:.2em; text-transform:uppercase; font-size:12px; font-weight:900; }} h1 {{ margin:0; font-size:clamp(34px,5vw,64px); line-height:1; }} header p {{ color:var(--muted); max-width:960px; font-size:18px; }}
.metrics {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:12px; margin-top:22px; max-width:860px; }} .metric {{ border:1px solid var(--line); background:rgba(0,0,0,.22); border-radius:18px; padding:16px; }} .metric b {{ display:block; color:var(--leaf); font-size:28px; }} .metric span {{ color:var(--muted); text-transform:uppercase; letter-spacing:.12em; font-size:11px; font-weight:800; }}
main {{ padding:28px 6vw 64px; }} .truth {{ border:1px solid rgba(239,202,84,.28); background:rgba(239,202,84,.1); color:#fff3bc; border-radius:18px; padding:16px; margin-bottom:20px; }}
.card {{ border:1px solid var(--line); background:rgba(27,39,31,.92); border-radius:24px; padding:22px; margin:0 0 18px; box-shadow:0 20px 70px rgba(0,0,0,.25); }} h2 {{ margin:0; font-size:30px; }} .decision {{ display:inline-flex; padding:7px 12px; border-radius:999px; background:rgba(239,202,84,.12); color:var(--gold); font-weight:850; }} .callout {{ display:grid; gap:8px; border-left:4px solid var(--leaf); background:rgba(102,208,125,.1); border-radius:14px; padding:14px; margin:14px 0; }}
details {{ margin-top:12px; border:1px solid var(--line); border-radius:16px; padding:12px; background:rgba(0,0,0,.18); }} summary {{ cursor:pointer; color:var(--gold); font-weight:850; }} ul {{ padding-left:20px; }} li code {{ display:block; color:var(--muted); margin:3px 0 9px; }} table {{ width:100%; border-collapse:collapse; margin-top:12px; }} th,td {{ border-bottom:1px solid var(--line); text-align:left; vertical-align:top; padding:10px; }} th {{ color:var(--gold); }} pre {{ background:#07100b; border:1px solid var(--line); border-radius:14px; padding:14px; }}
.secondary {{ border-left-color:var(--gold); background:rgba(239,202,84,.08); }}
</style>
</head>
<body>
<header><p class='eyebrow'>Quipsly Studio · reviewer command sheet</p><h1>Dry-run first. Decide calmly. Keep Tower honest.</h1><p>This sheet turns Studio evidence into local reviewer commands. It does not record decisions by itself, and it never promotes packages, approves Tower, publishes, uploads, schedules, overwrites, mutates source media, or creates receipts.</p><div class='metrics'>{metrics}</div></header>
<main><div class='truth'>{esc(payload['truth']['plainEnglish'])}</div>{''.join(cards)}</main>
</body>
</html>
"""
    path.write_text(page, encoding="utf-8")


def build_sheet(release_root: Path) -> dict[str, Any]:
    pointer, ledger = load_ledger(release_root)
    rows = build_item_rows(ledger)
    session_dir = release_root / "review-board" / "studio-review-command-sheets" / stamp()
    html_path = session_dir / "index.html"
    json_path = session_dir / "studio-review-command-sheet.json"
    markdown_path = session_dir / "STUDIO-REVIEW-COMMAND-SHEET.md"
    csv_path = session_dir / "studio-review-command-sheet.csv"
    counts = {
        "items": len(rows),
        "pending": sum(1 for row in rows if row["currentDecision"] == "pending"),
        "decisionsRecorded": sum(1 for row in rows if row["currentDecision"] != "pending"),
        "commands": sum(len(row["commandRows"]) * 2 for row in rows),
        "externalPublishing": False,
        "externalSchedulesCreated": False,
        "receiptTruthCreated": False,
        "originalsMutated": False,
        "versionsOverwritten": False,
        "sourceFilesMutated": False,
        "packagePromotionsCreated": False,
        "decisionsWritten": False,
    }
    start_here_queue = [
        {
            "itemId": row["itemId"],
            "episode": row["episode"],
            "kind": row["kind"],
            "label": row["label"],
            "currentDecision": row["currentDecision"],
            "reviewFirstAction": row.get("reviewFirstAction") or {},
            "dryRunAfterReview": row["recommendedDryRunCommand"],
            "nextSafestAction": "Open/watch-listen the evidence first; use the dry-run command only after a reviewer has a real judgment.",
            "truth": "Queue row only. It does not record a decision, promote a package, approve Tower, publish, upload, schedule, overwrite, mutate source media, or create receipts.",
        }
        for row in rows
    ]
    payload = {
        "schema": SCHEMA,
        "updatedAt": iso_now(),
        "generatedAt": iso_now(),
        "status": "review-command-sheet-ready" if rows else "no-review-items-found",
        "releaseRoot": str(release_root),
        "sourceLedgerHtml": ledger.get("htmlPath") or pointer.get("htmlPath") or "",
        "sourceLedgerJson": ledger.get("jsonPath") or pointer.get("jsonPath") or "",
        "sessionDir": str(session_dir),
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "counts": counts,
        "items": rows,
        "startHereQueue": start_here_queue,
        "humanAsk": "Use this command sheet after opening Studio evidence. Run dry-run first, then record only local Studio decision metadata if the reviewer is ready.",
        "nextSafestAction": "Open the Studio watch/listen review room or the first evidence link, then dry-run a local decision only after actual watch/listen review.",
        "firstSafeAction": {
            "label": "Open Studio review command sheet",
            "path": str(html_path),
            "command": f"open {shell_quote(str(html_path))}",
            "safety": "Opens local command guidance only. No decision is recorded and no package/Tower/publication/receipt state changes.",
        },
        "firstEvidenceAction": (start_here_queue[0].get("reviewFirstAction") if start_here_queue else {}),
        "firstDryRunCommand": rows[0]["recommendedDryRunCommand"] if rows else "",
        "truth": {
            "plainEnglish": "Local reviewer command sheet only. Generating it records no decision and does not approve Tower artifacts, promote packages, publish, upload, schedule, overwrite, delete, mutate source media, or create receipt truth.",
            "externalPublishing": False,
            "externalSchedulesCreated": False,
            "receiptTruthCreated": False,
            "originalsMutated": False,
            "versionsOverwritten": False,
            "sourceFilesMutated": False,
            "packagePromotionsCreated": False,
            "decisionsWritten": False,
        },
        "agentSafeParallelWork": "Codex may summarize local commands, improve guidance, and prepare dry-run decision text. Do not record decisions, approve, promote, publish, upload, schedule, mutate media/accounts, overwrite, delete, or create receipts without explicit approval.",
    }
    write_html(payload, html_path)
    write_markdown(payload, markdown_path)
    write_csv(payload, csv_path)
    write_json(json_path, payload)
    pointer_payload = {
        "schema": SCHEMA,
        "updatedAt": payload["updatedAt"],
        "status": payload["status"],
        "counts": counts,
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "humanAsk": payload["humanAsk"],
        "nextSafestAction": payload["nextSafestAction"],
        "firstSafeAction": payload["firstSafeAction"],
        "firstEvidenceAction": payload["firstEvidenceAction"],
        "firstDryRunCommand": payload["firstDryRunCommand"],
        "startHereQueue": payload["startHereQueue"],
        "firstReviewCommandItem": rows[0] if rows else {},
        "truth": payload["truth"],
        "agentSafeParallelWork": payload["agentSafeParallelWork"],
    }
    write_json(release_root / "review-board" / "latest-studio-review-command-sheet.json", pointer_payload)
    write_json(release_root / "review-board" / "studio-review-command-sheets" / "latest-studio-review-command-sheet.json", pointer_payload)
    return pointer_payload


def main(argv: list[str]) -> int:
    release_root = Path(argv[1]) if len(argv) > 1 else DEFAULT_RELEASE_ROOT
    print(json.dumps(build_sheet(release_root), indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
