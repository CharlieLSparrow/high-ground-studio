#!/usr/bin/env python3
"""Record metadata-only Studio360 repair/parking decisions.

This ledger is how humans/agents can route damaged or missing 360 groups without
moving, deleting, repairing in-place, or mutating original media.
"""
from __future__ import annotations

import argparse
import html
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/Studio360")
SCHEMA = "quipsly.360.repair-decision-ledger.v1"
STATUS_SCHEMA = "quipsly.360.repair-status.v1"
ACTIONS = {
    "needs-source",
    "needs-redownload",
    "needs-companion",
    "use-companion",
    "park",
    "not-needed",
    "review",
    "pending",
}
PARKED_ACTIONS = {"park", "not-needed"}


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-360-repair-status")


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except json.JSONDecodeError:
        return {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def esc(value: Any) -> str:
    return html.escape(str(value or ""))


def ledger_path(root: Path) -> Path:
    return root / "repair-decisions.json"


def event_path(root: Path) -> Path:
    return root / "repair-decisions.jsonl"


def status_root(root: Path) -> Path:
    return root / "repair-status"


def normalized_ledger(root: Path) -> dict[str, Any]:
    ledger = load_json(ledger_path(root))
    if ledger.get("schema") != SCHEMA:
        ledger = {
            "schema": SCHEMA,
            "createdAt": iso_now(),
            "updatedAt": "",
            "latestByGroup": {},
            "events": [],
            "safety": {
                "originalsMutated": False,
                "mediaMoved": False,
                "mediaDeleted": False,
                "externalPublishing": False,
            },
            "truth": "Sidecar repair/parking decisions only. Originals and exports are untouched.",
        }
    ledger.setdefault("latestByGroup", {})
    ledger.setdefault("events", [])
    ledger.setdefault("safety", {
        "originalsMutated": False,
        "mediaMoved": False,
        "mediaDeleted": False,
        "externalPublishing": False,
    })
    return ledger


def record(args: argparse.Namespace) -> dict[str, Any]:
    root = Path(args.root).expanduser()
    action = args.action.strip().lower()
    if action not in ACTIONS:
        raise SystemExit(f"Unsupported action {args.action!r}. Use one of: {', '.join(sorted(ACTIONS))}")
    ledger = normalized_ledger(root)
    before = dict((ledger.get("latestByGroup") or {}).get(args.group_key) or {})
    event = {
        "id": f"360-repair-{len(ledger.get('events') or []) + 1:04d}",
        "createdAt": iso_now(),
        "groupKey": args.group_key,
        "action": action,
        "status": "parked" if action in PARKED_ACTIONS else action,
        "actor": args.actor,
        "note": args.note or "",
        "safety": "Metadata-only decision. No source media was moved, deleted, overwritten, repaired in-place, uploaded, or published.",
    }
    if args.dry_run:
        return {
            "ok": True,
            "dryRun": True,
            "ledgerPath": str(ledger_path(root)),
            "eventLogPath": str(event_path(root)),
            "groupKey": args.group_key,
            "action": action,
            "before": before,
            "afterPreview": event,
            "ledgerMutated": False,
            "eventAppended": False,
            "originalsMutated": False,
            "mediaMoved": False,
            "mediaDeleted": False,
            "externalPublishing": False,
            "truth": "Dry-run only. No repair decision, sidecar ledger, event log, source media, export, upload, or publication state was changed.",
        }
    ledger["events"].append(event)
    ledger["latestByGroup"][args.group_key] = event
    ledger["updatedAt"] = event["createdAt"]
    write_json(ledger_path(root), ledger)
    with event_path(root).open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(event, sort_keys=True) + "\n")
    return {
        "ok": True,
        "dryRun": False,
        "ledgerPath": str(ledger_path(root)),
        "eventLogPath": str(event_path(root)),
        "event": event,
        "ledgerMutated": True,
        "eventAppended": True,
        "originalsMutated": False,
        "mediaMoved": False,
        "mediaDeleted": False,
        "externalPublishing": False,
        "truth": ledger["truth"],
    }


def status(args: argparse.Namespace) -> dict[str, Any]:
    root = Path(args.root).expanduser()
    ledger = normalized_ledger(root)
    latest = ledger.get("latestByGroup") if isinstance(ledger.get("latestByGroup"), dict) else {}
    events = ledger.get("events") if isinstance(ledger.get("events"), list) else []
    counts: dict[str, int] = {}
    for event in latest.values():
        if not isinstance(event, dict):
            continue
        action = str(event.get("action") or "pending")
        counts[action] = counts.get(action, 0) + 1
    payload = {
        "schema": STATUS_SCHEMA,
        "ok": True,
        "generatedAt": iso_now(),
        "ledgerPath": str(ledger_path(root)),
        "groupDecisionCount": len(latest),
        "eventCount": len(events),
        "actionCounts": counts,
        "latestByGroup": latest,
        "counts": {
            "groupDecisionCount": len(latest),
            "eventCount": len(events),
            "actions": counts,
            "originalsMutated": False,
            "exportsCreated": False,
            "externalPublishing": False,
            "decisionsWritten": False,
        },
        "truth": ledger.get("truth") or "Sidecar repair decisions only.",
    }
    out_dir = status_root(root) / stamp()
    out_dir.mkdir(parents=True, exist_ok=False)
    json_path = out_dir / "360-repair-status.json"
    html_path = out_dir / "index.html"
    markdown_path = out_dir / "START-HERE-360-repair-status.md"
    payload.update({
        "status": "repair-status-ready",
        "sessionDir": str(out_dir),
        "jsonPath": str(json_path),
        "htmlPath": str(html_path),
        "markdownPath": str(markdown_path),
        "firstSafeAction": {
            "label": "Open Studio360 repair status",
            "command": f"open '{html_path}'",
            "path": str(html_path),
            "safety": "Opens local repair-decision status only. No media, decisions, exports, uploads, or publication state changes.",
        },
        "nextSafestAction": "If no decisions exist, open the repair preflight and inspect blocked source evidence before recording metadata-only decisions.",
    })
    write_json(json_path, payload)
    html_path.write_text(render_status_html(payload), encoding="utf-8")
    markdown_path.write_text(render_status_markdown(payload), encoding="utf-8")
    pointer = {
        "schema": "quipsly.360.latest-repair-status.v1",
        "status": payload["status"],
        "updatedAt": iso_now(),
        "humanAsk": "Review repair status and confirm any metadata-only repair decision reflects real source evidence.",
        "agentSafeParallelWork": "Codex may summarize repair history, compare evidence, and prepare dry-run decision notes. Do not alter decisions, move files, repair media, delete, upload, publish, overwrite, mutate originals, or create receipts without approval.",
        "sessionDir": str(out_dir),
        "jsonPath": str(json_path),
        "htmlPath": str(html_path),
        "markdownPath": str(markdown_path),
        "counts": payload["counts"],
        "truth": payload["truth"],
        "firstSafeAction": payload["firstSafeAction"],
        "nextSafestAction": payload["nextSafestAction"],
        "originalsMutated": False,
        "exportsCreated": False,
        "externalPublishing": False,
    }
    write_json(root / "latest-360-repair-status.json", pointer)
    return payload


def render_status_html(payload: dict[str, Any]) -> str:
    rows = []
    latest = payload.get("latestByGroup") if isinstance(payload.get("latestByGroup"), dict) else {}
    for group_key, event in latest.items():
        if not isinstance(event, dict):
            continue
        rows.append(f"""
        <article>
          <h2>{esc(group_key)}</h2>
          <p><strong>{esc(event.get('action') or 'pending')}</strong> · {esc(event.get('createdAt') or '')} · {esc(event.get('actor') or '')}</p>
          <p>{esc(event.get('note') or '')}</p>
          <p class="safety">{esc(event.get('safety') or 'Metadata-only decision.')}</p>
        </article>
        """)
    counts = payload.get("counts") if isinstance(payload.get("counts"), dict) else {}
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Studio360 repair status</title>
  <style>
    :root {{ --bg:#101815; --panel:#1b2722; --ink:#f4ecd5; --muted:#bfb49b; --leaf:#75b87c; --gold:#e0c05f; --line:rgba(244,236,213,.16); }}
    body {{ margin:0; background:radial-gradient(circle at 8% 0%, rgba(117,184,124,.18), transparent 34%), var(--bg); color:var(--ink); font-family:Avenir Next, Helvetica Neue, sans-serif; }}
    header {{ padding:36px clamp(20px,5vw,72px); border-bottom:1px solid var(--line); }}
    .eyebrow {{ color:var(--gold); text-transform:uppercase; letter-spacing:.2em; font-size:12px; font-weight:900; }}
    h1 {{ margin:10px 0; font-size:clamp(38px,6vw,78px); line-height:.9; }}
    p {{ color:var(--muted); line-height:1.45; }}
    .stats {{ display:flex; flex-wrap:wrap; gap:10px; }}
    .stats span {{ border:1px solid var(--line); border-radius:999px; padding:8px 12px; color:var(--muted); background:rgba(255,255,255,.04); font-weight:800; }}
    main {{ display:grid; gap:14px; padding:24px clamp(16px,4vw,56px) 70px; }}
    article {{ border:1px solid var(--line); border-radius:22px; background:linear-gradient(145deg, rgba(27,39,34,.96), rgba(8,13,11,.98)); padding:18px; }}
    .safety {{ color:var(--leaf); font-weight:800; }}
  </style>
</head>
<body>
  <header>
    <div class="eyebrow">Studio360 · repair status</div>
    <h1>Repair decisions are sidecar truth.</h1>
    <p>{esc(payload.get('truth') or '')}</p>
    <div class="stats">
      <span>{counts.get('groupDecisionCount', 0)} group decisions</span>
      <span>{counts.get('eventCount', 0)} events</span>
      <span>0 originals mutated</span>
      <span>0 exports created</span>
    </div>
  </header>
  <main>{''.join(rows) if rows else '<article><h2>No repair decisions yet</h2><p>Open the repair preflight, inspect source evidence, then record metadata-only decisions only after review.</p></article>'}</main>
</body>
</html>"""


def render_status_markdown(payload: dict[str, Any]) -> str:
    lines = [
        "# Studio360 repair status",
        "",
        f"Generated: `{payload.get('generatedAt')}`",
        "",
        payload.get("truth") or "Sidecar repair decisions only.",
        "",
        f"- Group decisions: `{payload.get('groupDecisionCount')}`",
        f"- Events: `{payload.get('eventCount')}`",
        f"- Ledger: `{payload.get('ledgerPath')}`",
        "",
    ]
    latest = payload.get("latestByGroup") if isinstance(payload.get("latestByGroup"), dict) else {}
    if not latest:
        lines.extend([
            "## No decisions yet",
            "",
            "Open the repair preflight and inspect blocked source evidence before recording metadata-only decisions.",
            "",
        ])
    for group_key, event in latest.items():
        if not isinstance(event, dict):
            continue
        lines.extend([
            f"## {group_key}",
            "",
            f"- Action: `{event.get('action')}`",
            f"- Actor: `{event.get('actor')}`",
            f"- Created: `{event.get('createdAt')}`",
            f"- Note: {event.get('note') or ''}",
            f"- Safety: {event.get('safety') or 'Metadata-only decision.'}",
            "",
        ])
    return "\n".join(lines).rstrip() + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Record or inspect metadata-only Studio360 repair decisions.")
    parser.add_argument("group_key", nargs="?", default="status", help="Group key, or 'status' to inspect ledger.")
    parser.add_argument("action", nargs="?", default="", help="needs-source|needs-redownload|needs-companion|use-companion|park|not-needed|review|pending")
    parser.add_argument("actor", nargs="?", default="codex")
    parser.add_argument("note", nargs="?", default="")
    parser.add_argument("--root", default=str(DEFAULT_ROOT))
    parser.add_argument("--dry-run", action="store_true", help="Preview the metadata-only repair decision without writing sidecar ledgers.")
    args = parser.parse_args()
    if args.group_key == "status" and not args.action:
        payload = status(args)
    else:
        if not args.action:
            raise SystemExit("Action is required unless group_key is 'status'.")
        payload = record(args)
    print(json.dumps(payload, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
