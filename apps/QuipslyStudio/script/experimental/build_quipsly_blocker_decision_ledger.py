#!/usr/bin/env python3
"""Build a cross-lane blocker and decision ledger for Quipsly OS.

This is a read-only production-control artifact. It turns the latest Human Help
Board, Return Brief, and Validation Report into a durable list of what is
blocked, who can unblock it, what evidence proves it, and what Codex can safely
continue doing while Charlie is away.
"""
from __future__ import annotations

import csv
import html
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_OS_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS")
DEFAULT_HELP_POINTER = DEFAULT_OS_ROOT / "latest-quipsly-human-help-board.json"
DEFAULT_RETURN_POINTER = DEFAULT_OS_ROOT / "latest-quipsly-return-brief.json"
DEFAULT_VALIDATION_POINTER = DEFAULT_OS_ROOT / "latest-quipsly-os-validation.json"
DEFAULT_OUTPUT_ROOT = DEFAULT_OS_ROOT / "BlockerDecisionLedgers"
LATEST_POINTER = DEFAULT_OS_ROOT / "latest-quipsly-blocker-decision-ledger.json"
SCHEMA = "quipsly.os.blocker-decision-ledger.v1"

SEVERITY_ORDER = {
    "blocker": 0,
    "sync-review": 1,
    "approval-needed": 2,
    "human-review": 3,
    "missing-media": 4,
    "operator-help": 5,
    "agent-safe": 6,
    "ready": 7,
    "validation-info": 8,
}

LANE_ALIASES = {
    "Studio360": "360 workflow",
    "Tower publishing": "Tower publishing/social",
    "Studio podcast/video": "Studio podcast/video",
    "Nest writing/research": "Nest writing/research",
    "Photo Grove": "Photo Grove",
    "Quipsly OS": "Quipsly OS",
}

SAFETY_BOUNDARY = [
    "Local review/readiness only unless Charlie explicitly approves an external action.",
    "No publishing, uploading, scheduling, deleting, account mutation, or fake receipt capture.",
    "No original media, photos, manuscripts, or source files are mutated.",
    "If one lane stalls, keep another lane moving and record the blocker precisely.",
]


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-quipsly-blocker-decision-ledger")


def esc(value: Any) -> str:
    return html.escape(str(value or ""))


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def load_pointer_target(path: Path) -> dict[str, Any]:
    pointer = load_json(path)
    target_path = Path(str(pointer.get("jsonPath") or "")) if pointer.get("jsonPath") else None
    if target_path and target_path.exists() and target_path != path:
        target = load_json(target_path)
        if target:
            return {**pointer, **target}
    return pointer


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def safe_counts(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def first_existing_path(*values: Any) -> str:
    for value in values:
        text = str(value or "")
        if text:
            return text
    return ""


def first_safe_action(label: str, path: str, fallback_command: str = "") -> dict[str, str]:
    command = fallback_command or (f"open {shell_quote(path)}" if path else "")
    return {
        "label": label,
        "command": command,
        "path": path,
        "safety": "Opens local evidence or runs a local read-only report only. No publish/upload/delete/schedule/account mutation.",
    }


def normalize_lane(lane: str) -> str:
    return LANE_ALIASES.get(lane, lane or "Unknown")


def priority_for(severity: str) -> str:
    if severity in {"blocker", "missing-media", "sync-review"}:
        return "blocked-or-at-risk"
    if severity in {"approval-needed", "human-review", "operator-help"}:
        return "needs-human-or-operator"
    if severity == "agent-safe":
        return "codex-can-continue"
    if severity == "ready":
        return "ready-evidence"
    return "context"


def owner_for(lane: str, severity: str, title: str) -> str:
    title_lower = title.lower()
    if severity == "agent-safe":
        return "Codex"
    if severity in {"blocker", "missing-media"}:
        return "Charlie or Codex"
    if lane == "Tower publishing/social":
        return "Charlie"
    if lane == "Photo Grove":
        return "Charlie"
    if lane == "Nest writing/research":
        return "Charlie or Homer"
    if lane == "Studio podcast/video" or "sync" in title_lower or "episode" in title_lower:
        return "Mako or Charlie"
    if lane == "360 workflow":
        return "Mako or Charlie" if "proof" in title_lower else "Codex first, Charlie if source media is missing"
    return "Charlie or Codex"


def human_decision_for(lane: str, severity: str, title: str, default: str = "") -> str:
    if default:
        return default
    if severity == "sync-review":
        return "Decide whether the timing evidence is acceptable, needs a versioned rebuild, or should be held."
    if severity == "approval-needed":
        return "Approve, revise, or hold the packet before any external action occurs."
    if severity == "human-review":
        return "Open the evidence and leave a clear keep/revise/hold decision."
    if severity == "missing-media":
        return "Confirm whether the missing source should be found, recopied, parked, or ignored."
    if severity == "blocker":
        return "Resolve or route around this before trusting downstream output."
    if severity == "ready":
        return "No decision required; use as supporting evidence."
    return "Optional review; Codex can continue safe local prep."


def agent_work_for(lane: str, severity: str, title: str, default: str = "") -> str:
    if default:
        return default
    if severity == "sync-review":
        return "Prepare comparison evidence and versioned rebuild options without claiming approval."
    if severity in {"approval-needed", "human-review"}:
        return "Improve packets, validation, metadata, UI clarity, and review context while waiting."
    if severity == "missing-media":
        return "Create precise missing-media tasks and continue another lane."
    if severity == "blocker":
        return "Fix the local blocker if possible; otherwise document exact evidence and move to another lane."
    if severity == "ready":
        return "Keep as confidence evidence and move to a higher-friction lane."
    return "Take the smallest reversible local action and regenerate the ledger."


def row_from_help_item(item: dict[str, Any], index: int) -> dict[str, Any]:
    severity = str(item.get("severity") or "agent-safe")
    lane = normalize_lane(str(item.get("lane") or "Unknown"))
    title = str(item.get("title") or "Untitled help item")
    first = item.get("firstSafeAction") if isinstance(item.get("firstSafeAction"), dict) else {}
    source = item.get("source") if isinstance(item.get("source"), dict) else {}
    evidence_path = first_existing_path(
        item.get("primaryPath"),
        first.get("path"),
        source.get("worksheetPath"),
        source.get("htmlPath"),
        source.get("markdownPath"),
        source.get("jsonPath"),
    )
    return {
        "id": f"help-{index:03d}",
        "sourceKind": "human-help-board",
        "lane": lane,
        "severity": severity,
        "priority": priority_for(severity),
        "title": title,
        "status": str(item.get("status") or ""),
        "suggestedOwner": str(item.get("suggestedOwner") or owner_for(lane, severity, title)),
        "plainEnglish": str(item.get("plainEnglish") or "Local production item needing routing."),
        "humanDecisionNeeded": human_decision_for(lane, severity, title, str(item.get("humanAsk") or "")),
        "codexCanContinueWith": agent_work_for(lane, severity, title, str(item.get("agentCanContinueWith") or "")),
        "nextSafestAction": str(item.get("nextSafestAction") or item.get("nextAction") or "Open local evidence, then take the smallest reversible next step."),
        "evidencePath": evidence_path,
        "evidenceCommand": str(item.get("primaryCommand") or first.get("command") or (f"open {shell_quote(evidence_path)}" if evidence_path else "")),
        "firstSafeAction": first or first_safe_action(f"Open {title}", evidence_path),
        "counts": safe_counts(item.get("counts")),
        "notes": [str(note) for note in (item.get("notes") or []) if str(note).strip()],
        "truth": str(item.get("truth") or "Local routing only. Not approval, publication, upload, deletion, or receipt truth."),
    }


def severity_from_readiness(readiness: str) -> str:
    if readiness in {"blocked-by-studio-review", "culling-needed", "proof-review-needed", "review-needed"}:
        return "human-review"
    if readiness in {"approval-needed"}:
        return "approval-needed"
    if readiness in {"drafting-ready", "source-ready", "packet-prep"}:
        return "agent-safe"
    if readiness in {"review-clear", "proof-prep-ready", "render-plan-ready"}:
        return "ready"
    return "operator-help"


def row_from_matrix(row: dict[str, Any], index: int) -> dict[str, Any]:
    lane = normalize_lane(str(row.get("lane") or "Unknown"))
    readiness = str(row.get("readiness") or "unknown")
    severity = severity_from_readiness(readiness)
    title = f"{row.get('label') or lane} - {readiness}"
    evidence_path = first_existing_path(row.get("worksheetPath"), row.get("htmlPath"), row.get("markdownPath"), row.get("jsonPath"))
    return {
        "id": f"matrix-{index:03d}",
        "sourceKind": "production-readiness-matrix",
        "lane": lane,
        "severity": severity,
        "priority": priority_for(severity),
        "title": title,
        "status": str(row.get("status") or ""),
        "suggestedOwner": owner_for(lane, severity, title),
        "plainEnglish": str(row.get("gateSummary") or "Production readiness matrix gate."),
        "humanDecisionNeeded": human_decision_for(lane, severity, title),
        "codexCanContinueWith": agent_work_for(lane, severity, title),
        "nextSafestAction": str(row.get("nextSafestAction") or row.get("gateSummary") or "Open the companion and keep the next action reversible."),
        "evidencePath": evidence_path,
        "evidenceCommand": str(row.get("openCommand") or (f"open {shell_quote(evidence_path)}" if evidence_path else "")),
        "firstSafeAction": first_safe_action(f"Open {row.get('label') or lane}", evidence_path, str(row.get("openCommand") or "")),
        "counts": {"countSummary": row.get("countSummary") or ""},
        "notes": [str(row.get("gateSummary") or "")],
        "truth": str(row.get("truth") or "Companion pointer only. No source or external mutation implied."),
    }


def row_from_validation_check(check: dict[str, Any], index: int) -> dict[str, Any] | None:
    status = str(check.get("status") or "")
    if status == "pass":
        return None
    severity = "blocker" if status == "fail" else "operator-help"
    lane = normalize_lane(str(check.get("lane") or "Quipsly OS"))
    title = str(check.get("message") or check.get("id") or "Validation issue")
    evidence = check.get("evidence")
    return {
        "id": f"validation-{index:03d}",
        "sourceKind": "validation-report",
        "lane": lane,
        "severity": severity,
        "priority": priority_for(severity),
        "title": title,
        "status": status,
        "suggestedOwner": owner_for(lane, severity, title),
        "plainEnglish": "The validation harness found a non-passing check. Treat this as local evidence, not a publishing result.",
        "humanDecisionNeeded": human_decision_for(lane, severity, title),
        "codexCanContinueWith": agent_work_for(lane, severity, title),
        "nextSafestAction": "Fix the validation issue if possible; otherwise record precise blocker context and continue another lane.",
        "evidencePath": "",
        "evidenceCommand": "",
        "firstSafeAction": first_safe_action("Open validation report", ""),
        "counts": {},
        "notes": [json.dumps(evidence, sort_keys=True)[:1200]],
        "truth": "Validation issue only. No source or external mutation implied.",
    }


def dedupe_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[tuple[str, str, str]] = set()
    unique: list[dict[str, Any]] = []
    for row in rows:
        key = (str(row.get("sourceKind")), str(row.get("lane")), str(row.get("title")))
        if key in seen:
            continue
        seen.add(key)
        unique.append(row)
    return sorted(unique, key=lambda row: (SEVERITY_ORDER.get(str(row.get("severity")), 99), str(row.get("lane")), str(row.get("title"))))


def build_rows(help_payload: dict[str, Any], return_payload: dict[str, Any], validation_payload: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for index, item in enumerate(help_payload.get("items") or [], 1):
        if isinstance(item, dict):
            rows.append(row_from_help_item(item, index))
    for index, row in enumerate(return_payload.get("productionReadinessMatrix") or [], 1):
        if isinstance(row, dict):
            rows.append(row_from_matrix(row, index))
    for index, check in enumerate(validation_payload.get("checks") or [], 1):
        if isinstance(check, dict):
            validation_row = row_from_validation_check(check, index)
            if validation_row:
                rows.append(validation_row)
    return dedupe_rows(rows)


def summarize(rows: list[dict[str, Any]], validation_payload: dict[str, Any]) -> dict[str, Any]:
    by_severity: dict[str, int] = {}
    by_lane: dict[str, int] = {}
    by_owner: dict[str, int] = {}
    for row in rows:
        by_severity[str(row.get("severity"))] = by_severity.get(str(row.get("severity")), 0) + 1
        by_lane[str(row.get("lane"))] = by_lane.get(str(row.get("lane")), 0) + 1
        by_owner[str(row.get("suggestedOwner"))] = by_owner.get(str(row.get("suggestedOwner")), 0) + 1
    validation_counts = validation_payload.get("counts") if isinstance(validation_payload.get("counts"), dict) else {}
    return {
        "rows": len(rows),
        "trueBlockers": by_severity.get("blocker", 0),
        "syncReview": by_severity.get("sync-review", 0),
        "approvalNeeded": by_severity.get("approval-needed", 0),
        "humanReview": by_severity.get("human-review", 0),
        "operatorHelp": by_severity.get("operator-help", 0),
        "missingMedia": by_severity.get("missing-media", 0),
        "agentSafe": by_severity.get("agent-safe", 0),
        "ready": by_severity.get("ready", 0),
        "bySeverity": by_severity,
        "byLane": by_lane,
        "byOwner": by_owner,
        "validationFailures": int(validation_counts.get("failures") or 0),
        "validationWarnings": int(validation_counts.get("warnings") or 0),
    }


def build_runway(rows: list[dict[str, Any]], counts: dict[str, Any]) -> dict[str, Any]:
    urgent = [row for row in rows if row.get("severity") in {"blocker", "sync-review", "missing-media"}]
    human = [row for row in rows if row.get("severity") in {"approval-needed", "human-review", "operator-help"}]
    agent = [row for row in rows if row.get("severity") == "agent-safe"]
    return {
        "firstRead": [
            "If trueBlockers is zero, the system is not frozen; choose the next human-review or agent-safe item.",
            "Do not convert local readiness into publication truth. Receipts require real URLs or platform evidence.",
            "If one lane needs human review, Codex should continue another safe local lane instead of waiting.",
        ],
        "firstHumanActions": [row["id"] for row in (urgent + human)[:8]],
        "firstCodexActions": [row["id"] for row in agent[:8]],
        "statusSentence": (
            f"{counts.get('trueBlockers', 0)} true blocker(s), "
            f"{counts.get('humanReview', 0) + counts.get('approvalNeeded', 0)} human review/approval item(s), "
            f"{counts.get('agentSafe', 0)} Codex-safe continuation item(s)."
        ),
        "ifEverythingFeelsStuck": "Open the first Codex-safe item and improve local evidence, validation, or review context without external side effects.",
    }


def build_payload(out_dir: Path) -> dict[str, Any]:
    help_payload = load_pointer_target(DEFAULT_HELP_POINTER)
    return_payload = load_pointer_target(DEFAULT_RETURN_POINTER)
    validation_payload = load_pointer_target(DEFAULT_VALIDATION_POINTER)
    rows = build_rows(help_payload, return_payload, validation_payload)
    counts = summarize(rows, validation_payload)
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "sessionDir": str(out_dir),
        "sourcePointers": {
            "humanHelp": str(DEFAULT_HELP_POINTER),
            "returnBrief": str(DEFAULT_RETURN_POINTER),
            "validation": str(DEFAULT_VALIDATION_POINTER),
        },
        "sourceArtifacts": {
            "humanHelpHtml": help_payload.get("htmlPath") or "",
            "humanHelpJson": help_payload.get("jsonPath") or "",
            "returnBriefHtml": return_payload.get("htmlPath") or "",
            "returnBriefJson": return_payload.get("jsonPath") or "",
            "validationHtml": validation_payload.get("htmlPath") or "",
            "validationJson": validation_payload.get("jsonPath") or "",
        },
        "rows": rows,
        "runway": build_runway(rows, counts),
        "counts": counts,
        "boundary": SAFETY_BOUNDARY,
        "truth": {
            "readOnly": True,
            "sourceFilesMutated": False,
            "originalsMutated": False,
            "externalPublishing": False,
            "externalSchedulesCreated": False,
            "accountMutation": False,
            "receiptTruthCreated": False,
            "versionsOverwritten": False,
            "description": "Blocker/decision ledger only. It routes local evidence and decisions without mutating sources or external systems.",
        },
        "nextSafestAction": "Start with rows marked blocker/sync-review/missing-media if any exist; otherwise choose either the first human-review item or a Codex-safe continuation item.",
    }


def write_csv(path: Path, payload: dict[str, Any]) -> None:
    fields = [
        "id",
        "sourceKind",
        "lane",
        "severity",
        "priority",
        "suggestedOwner",
        "status",
        "title",
        "humanDecisionNeeded",
        "codexCanContinueWith",
        "nextSafestAction",
        "evidencePath",
        "evidenceCommand",
        "truth",
    ]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in payload.get("rows") or []:
            writer.writerow({field: row.get(field, "") for field in fields})


def write_markdown(path: Path, payload: dict[str, Any]) -> None:
    lines = [
        "# Quipsly blocker and decision ledger",
        "",
        f"Generated: `{payload['generatedAt']}`",
        "",
        payload["truth"]["description"],
        "",
        "## Current runway",
        "",
        payload.get("runway", {}).get("statusSentence", ""),
        "",
        "## Safety boundary",
        "",
    ]
    for item in payload.get("boundary") or []:
        lines.append(f"- {item}")
    lines.extend(["", "## Counts", ""])
    for key, value in payload.get("counts", {}).items():
        if isinstance(value, dict):
            continue
        lines.append(f"- {key}: `{value}`")
    lines.extend(["", "## Rows", ""])
    for row in payload.get("rows") or []:
        lines.append(f"### `{row.get('severity')}` {row.get('lane')} - {row.get('title')}")
        lines.append("")
        lines.append(f"- Owner: `{row.get('suggestedOwner')}`")
        lines.append(f"- Status: `{row.get('status')}`")
        lines.append(f"- What it means: {row.get('plainEnglish')}")
        lines.append(f"- Human decision: {row.get('humanDecisionNeeded')}")
        lines.append(f"- Codex can continue with: {row.get('codexCanContinueWith')}")
        lines.append(f"- Next safest action: {row.get('nextSafestAction')}")
        if row.get("evidenceCommand"):
            lines.append(f"- Evidence: `{row.get('evidenceCommand')}`")
        elif row.get("evidencePath"):
            lines.append(f"- Evidence: `{row.get('evidencePath')}`")
        lines.append(f"- Truth: {row.get('truth')}")
        lines.append("")
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "owner"


def write_owner_packets(root: Path, payload: dict[str, Any]) -> dict[str, str]:
    root.mkdir(parents=True, exist_ok=True)
    rows_by_owner: dict[str, list[dict[str, Any]]] = {}
    for row in payload.get("rows") or []:
        owner = str(row.get("suggestedOwner") or "Unassigned")
        rows_by_owner.setdefault(owner, []).append(row)
    paths: dict[str, str] = {}
    for owner, rows in sorted(rows_by_owner.items()):
        path = root / f"{slugify(owner)}.md"
        lines = [
            f"# Quipsly decision packet - {owner}",
            "",
            f"Generated: `{payload['generatedAt']}`",
            "",
            "This is an owner-filtered view of the blocker/decision ledger. It is local review/readiness only.",
            "",
            "## Safety",
            "",
        ]
        for item in payload.get("boundary") or []:
            lines.append(f"- {item}")
        lines.extend(["", "## Items", ""])
        for row in rows:
            lines.append(f"### `{row.get('severity')}` {row.get('lane')} - {row.get('title')}")
            lines.append("")
            lines.append(f"- Status: `{row.get('status')}`")
            lines.append(f"- Human decision: {row.get('humanDecisionNeeded')}")
            lines.append(f"- Codex can continue with: {row.get('codexCanContinueWith')}")
            lines.append(f"- Next safest action: {row.get('nextSafestAction')}")
            if row.get("evidenceCommand"):
                lines.append(f"- Evidence: `{row.get('evidenceCommand')}`")
            lines.append("")
        path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
        paths[owner] = str(path)
    return paths


def write_html(path: Path, payload: dict[str, Any]) -> None:
    rows_html = []
    for row in payload.get("rows") or []:
        first = row.get("firstSafeAction") if isinstance(row.get("firstSafeAction"), dict) else {}
        notes = "".join(f"<li>{esc(note)}</li>" for note in (row.get("notes") or [])[:4])
        counts = json.dumps(row.get("counts") or {}, indent=2, sort_keys=True)[:2000]
        rows_html.append(f"""
        <article class="card {esc(row.get('severity'))}">
          <div class="meta"><span>{esc(row.get('severity'))}</span><span>{esc(row.get('lane'))}</span><span>{esc(row.get('suggestedOwner'))}</span></div>
          <h2>{esc(row.get('title'))}</h2>
          <p class="plain">{esc(row.get('plainEnglish'))}</p>
          <div class="grid">
            <section><b>Human decision</b><p>{esc(row.get('humanDecisionNeeded'))}</p></section>
            <section><b>Codex can continue with</b><p>{esc(row.get('codexCanContinueWith'))}</p></section>
            <section><b>Next safest action</b><p>{esc(row.get('nextSafestAction'))}</p></section>
            <section><b>Evidence</b><p><code>{esc(row.get('evidenceCommand') or row.get('evidencePath'))}</code></p></section>
          </div>
          <details><summary>Truth, notes, counts</summary>
            <p>{esc(row.get('truth'))}</p>
            <ul>{notes}</ul>
            <pre>{esc(counts)}</pre>
            <p><b>First safe action:</b> <code>{esc(first.get('command'))}</code></p>
            <p>{esc(first.get('safety'))}</p>
          </details>
        </article>
        """)
    count_cards = "".join(
        f"<div class='count'><b>{esc(key)}</b><span>{esc(value)}</span></div>"
        for key, value in payload.get("counts", {}).items()
        if not isinstance(value, dict)
    )
    boundary = "".join(f"<li>{esc(item)}</li>" for item in payload.get("boundary") or [])
    html_doc = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Quipsly blocker and decision ledger</title>
<style>
:root {{ color-scheme: dark; --bg:#101813; --panel:#17221c; --ink:#f5efd9; --muted:#b5aa8d; --line:#3b4b39; --gold:#f2cf52; --red:#ff6b6b; --blue:#6bc7ff; --green:#64d27b; --clay:#d8894a; }}
* {{ box-sizing:border-box; }}
body {{ margin:0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: radial-gradient(circle at top left, #233b2d 0, #101813 38rem), var(--bg); color:var(--ink); }}
main {{ max-width: 1240px; margin:0 auto; padding:32px; }}
.hero {{ border:1px solid var(--line); border-radius:28px; padding:28px; background:rgba(23,34,28,.88); box-shadow:0 18px 80px rgba(0,0,0,.28); }}
h1 {{ font-size: clamp(2rem, 4vw, 4.3rem); line-height:.95; margin:0 0 12px; letter-spacing:-.05em; }}
.kicker {{ text-transform:uppercase; color:var(--gold); letter-spacing:.24em; font-weight:900; font-size:.78rem; }}
.counts {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:12px; margin:22px 0; }}
.count {{ border:1px solid var(--line); border-radius:18px; padding:14px; background:#101711; }}
.count b {{ display:block; color:var(--muted); font-size:.72rem; text-transform:uppercase; letter-spacing:.12em; }}
.count span {{ font-size:1.6rem; font-weight:900; }}
.boundary {{ color:var(--muted); }}
.card {{ margin:18px 0; padding:22px; border-radius:22px; border:1px solid var(--line); background:#162119; }}
.card.blocker {{ border-color:rgba(255,107,107,.8); box-shadow:0 0 0 1px rgba(255,107,107,.22) inset; }}
.card.sync-review,.card.approval-needed,.card.human-review {{ border-color:rgba(242,207,82,.55); }}
.card.agent-safe,.card.ready {{ border-color:rgba(100,210,123,.45); }}
.meta {{ display:flex; flex-wrap:wrap; gap:8px; margin-bottom:10px; }}
.meta span {{ border:1px solid var(--line); border-radius:999px; padding:5px 9px; color:var(--muted); background:#101711; font-size:.78rem; font-weight:800; text-transform:uppercase; letter-spacing:.06em; }}
h2 {{ margin:0 0 8px; font-size:1.25rem; }}
.plain {{ color:var(--muted); }}
.grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:12px; }}
.grid section {{ border:1px solid var(--line); border-radius:16px; padding:12px; background:#101711; }}
.grid b {{ color:var(--gold); }}
code, pre {{ color:#dfe9c9; white-space:pre-wrap; overflow-wrap:anywhere; }}
details {{ margin-top:12px; color:var(--muted); }}
</style>
</head>
<body><main>
<section class="hero">
  <p class="kicker">Quipsly OS control room</p>
  <h1>Blockers, decisions, and safe next moves.</h1>
  <p>{esc(payload.get('runway', {}).get('statusSentence'))}</p>
  <div class="counts">{count_cards}</div>
  <ul class="boundary">{boundary}</ul>
</section>
{''.join(rows_html)}
</main></body></html>
"""
    path.write_text(html_doc, encoding="utf-8")


def prepare_output_dir(output_root: Path) -> Path:
    out_dir = output_root / stamp()
    base = out_dir
    counter = 2
    while out_dir.exists():
        out_dir = Path(f"{base}-{counter}")
        counter += 1
    out_dir.mkdir(parents=True, exist_ok=False)
    return out_dir


def main() -> int:
    out_dir = prepare_output_dir(DEFAULT_OUTPUT_ROOT)
    payload = build_payload(out_dir)
    json_path = out_dir / "quipsly-blocker-decision-ledger.json"
    csv_path = out_dir / "quipsly-blocker-decision-ledger.csv"
    md_path = out_dir / "START-HERE-quipsly-blocker-decision-ledger.md"
    html_path = out_dir / "index.html"
    payload.update({
        "jsonPath": str(json_path),
        "csvPath": str(csv_path),
        "markdownPath": str(md_path),
        "htmlPath": str(html_path),
        "status": "blocker-decision-ledger-ready",
    })
    owner_packet_paths = write_owner_packets(out_dir / "owner-packets", payload)
    payload["ownerPacketPaths"] = owner_packet_paths
    payload["counts"]["ownerPackets"] = len(owner_packet_paths)
    payload["firstSafeAction"] = first_safe_action("Open blocker and decision ledger", str(html_path))
    write_json(json_path, payload)
    write_csv(csv_path, payload)
    write_markdown(md_path, payload)
    write_html(html_path, payload)
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
        "ownerPacketPaths": owner_packet_paths,
        "humanAsk": "Use this ledger to see which blockers need Charlie, Mako, Homer, or operator help before approval or publishing work proceeds.",
        "agentSafeParallelWork": "Codex may clarify blocker evidence, owner packets, safe next actions, and local validation. Do not mutate originals, approve, publish, upload, schedule, delete, overwrite versions, or create receipt truth.",
        "truth": payload["truth"],
        "firstSafeAction": payload["firstSafeAction"],
        "nextSafestAction": payload["nextSafestAction"],
    }
    write_json(LATEST_POINTER, pointer)
    print(json.dumps(pointer, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
