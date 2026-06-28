#!/usr/bin/env python3
"""Build a Photo Grove Proof Desk front door.

This is a read-only, local-only operational surface for the photo lane. It joins
keeper candidates, cull suggestions, command sheets, export prep, review batch,
and client proof readiness into one reviewer-friendly desk. It never mutates
originals, executes metadata decisions, copies client deliverables, uploads, or
publishes anything.
"""

from __future__ import annotations

import argparse
import csv
import html
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_PHOTO_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove")
SCHEMA = "quipsly.photo-grove.proof-desk.v1"
LATEST_POINTER = "latest-photo-grove-proof-desk.json"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-proof-desk")


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


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def esc(value: Any) -> str:
    return html.escape(str(value or ""))


def safe_int(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def pointer(photo_root: Path, filename: str) -> dict[str, Any]:
    return load_json(photo_root / filename)


def packet_from_pointer(pointer_payload: dict[str, Any]) -> dict[str, Any]:
    json_path = pointer_payload.get("jsonPath") or pointer_payload.get("packetPath") or ""
    return load_json(Path(str(json_path))) if json_path else {}


def latest_review_session(photo_root: Path) -> tuple[dict[str, Any], Path | None]:
    review_pointer = load_json(photo_root / "latest-photo-grove-review.json")
    latest = Path(str(review_pointer.get("latestSessionDir") or "")) if review_pointer.get("latestSessionDir") else None
    return review_pointer, latest if latest and latest.exists() else None


def command(label: str, path: str, safety: str) -> dict[str, str]:
    return {
        "label": label,
        "command": f"open {shell_quote(path)}" if path else "",
        "path": path,
        "safety": safety,
    }


def action_rows(photo_root: Path, parts: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    next_cull = parts.get("nextCull") or {}
    keeper = parts.get("keeper") or {}
    client = parts.get("client") or {}
    command_sheet = parts.get("commandSheet") or {}
    first_keepers = parts.get("firstKeepers") or {}
    cull = parts.get("cullSuggestions") or {}
    review_batch = parts.get("reviewBatch") or {}
    export_prep = parts.get("exportPrep") or {}

    rows: list[dict[str, Any]] = []
    if next_cull:
        counts = next_cull.get("counts") if isinstance(next_cull.get("counts"), dict) else {}
        first = next_cull.get("firstSafeAction") if isinstance(next_cull.get("firstSafeAction"), dict) else {}
        first_dry_run = next_cull.get("firstDryRunAction") if isinstance(next_cull.get("firstDryRunAction"), dict) else {}
        first_dry_run_command = str(next_cull.get("firstDryRunCommand") or first_dry_run.get("command") or "")
        first_dry_run_safety = str(next_cull.get("firstDryRunSafety") or first_dry_run.get("safety") or "")
        rows.append({
            "rank": 0,
            "id": "next-cull-card",
            "title": "Open one next cull card",
            "status": next_cull.get("status") or "next-cull-card-ready",
            "why": f"{next_cull.get('label') or next_cull.get('photoId') or 'One photo'} is the smallest useful cull step: inspect source evidence, dry-run intent, and stop before metadata writes.",
            "nextSafestAction": next_cull.get("nextSafestAction") or "Open one cull card, compare evidence, dry-run the intended decision, then stop.",
            "htmlPath": next_cull.get("htmlPath") or first.get("path") or "",
            "jsonPath": next_cull.get("jsonPath") or "",
            "itemCount": 1 if next_cull.get("status") else 0,
            "pending": 1,
            "selected": 0,
            "photoId": next_cull.get("photoId") or "",
            "metadataCommandRows": counts.get("commands", 0),
            "firstDryRunCommand": first_dry_run_command,
            "firstDryRunDecision": next_cull.get("firstDryRunDecision") or next_cull.get("recommendedAction") or "",
            "firstDryRunSafety": first_dry_run_safety,
            "safety": "One-card cull evidence only. Dry-runs are safe; live metadata writes still require explicit human approval.",
        })
    if keeper:
        counts = keeper.get("counts") if isinstance(keeper.get("counts"), dict) else {}
        rows.append({
            "rank": 1,
            "id": "keeper-desk",
            "title": "Open Keeper Desk",
            "status": keeper.get("status") or "keeper-desk-ready",
            "why": f"{counts.get('firstKeeperCandidates', 0)} first-keeper candidates, {counts.get('cullSuggestionGroups', 0)} cull groups, and {counts.get('metadataCommandRows', 0)} metadata command rows are already joined here.",
            "nextSafestAction": keeper.get("nextSafestAction") or "Open keeper evidence before metadata decisions.",
            "htmlPath": keeper.get("htmlPath") or "",
            "jsonPath": keeper.get("jsonPath") or "",
            "itemCount": counts.get("sourcePhotos", 0),
            "pending": counts.get("pending", 0),
            "selected": counts.get("selectedForClientProof", 0),
            "safety": "Read-only keeper desk. No metadata command executes here.",
        })
    if first_keepers:
        counts = first_keepers.get("counts") if isinstance(first_keepers.get("counts"), dict) else {}
        rows.append({
            "rank": 2,
            "id": "first-keepers",
            "title": "Review first keeper candidates",
            "status": first_keepers.get("status") or "first-keepers-ready",
            "why": f"{counts.get('candidatePhotos', 0)} candidate photos across {counts.get('candidateGroups', 0)} groups give the fastest calm starting point.",
            "nextSafestAction": first_keepers.get("nextSafestAction") or "Compare candidates visually, then record metadata-only keep/favorite/review decisions.",
            "htmlPath": first_keepers.get("htmlPath") or "",
            "jsonPath": first_keepers.get("jsonPath") or "",
            "itemCount": counts.get("candidatePhotos", 0),
            "pending": counts.get("pending", 0),
            "selected": counts.get("selectedForClientProof", 0),
            "safety": "Candidate evidence only. Originals and review metadata remain unchanged until a separate decision command runs.",
        })
    if cull:
        counts = cull.get("counts") if isinstance(cull.get("counts"), dict) else {}
        rows.append({
            "rank": 3,
            "id": "cull-suggestions",
            "title": "Inspect cull suggestions",
            "status": cull.get("status") or "cull-suggestions-ready",
            "why": f"{counts.get('suggestionGroups', 0)} suggestion groups provide Aftershoot-like routing hints without making keep/reject verdicts.",
            "nextSafestAction": cull.get("nextSafestAction") or "Inspect the first suggestion group before any metadata-only route decision.",
            "htmlPath": cull.get("htmlPath") or "",
            "jsonPath": cull.get("jsonPath") or "",
            "itemCount": counts.get("suggestionGroups", 0),
            "pending": counts.get("pending", 0),
            "selected": counts.get("selectedForClientProof", 0),
            "safety": "Suggestions are attention routing only; no auto-cull happens.",
        })
    if review_batch:
        counts = review_batch.get("counts") if isinstance(review_batch.get("counts"), dict) else {}
        rows.append({
            "rank": 4,
            "id": "review-batch",
            "title": "Open focused review batch",
            "status": review_batch.get("status") or "review-batch-ready",
            "why": f"{counts.get('groups', review_batch.get('groupCount', 0))} grouped batches are ready for human/agent comparison.",
            "nextSafestAction": review_batch.get("nextSafestAction") or "Review groups in order; quality hints route attention but do not decide.",
            "htmlPath": review_batch.get("htmlPath") or "",
            "jsonPath": review_batch.get("jsonPath") or "",
            "itemCount": counts.get("groups", review_batch.get("groupCount", 0)),
            "pending": counts.get("groups", review_batch.get("groupCount", 0)),
            "selected": 0,
            "safety": "Review batch only. Originals and metadata stay untouched.",
        })
    if command_sheet:
        counts = command_sheet.get("counts") if isinstance(command_sheet.get("counts"), dict) else {}
        rows.append({
            "rank": 5,
            "id": "command-sheet",
            "title": "Use command sheet only after review",
            "status": command_sheet.get("status") or "command-sheet-ready",
            "why": f"{counts.get('commands', 0)} metadata-only commands are available for {counts.get('groups', 0)} groups.",
            "nextSafestAction": command_sheet.get("nextSafestAction") or "Open source evidence, then run only the command that matches review intent.",
            "htmlPath": command_sheet.get("htmlPath") or "",
            "jsonPath": command_sheet.get("jsonPath") or "",
            "itemCount": counts.get("commands", 0),
            "pending": counts.get("groups", 0),
            "selected": 0,
            "safety": command_sheet.get("metadataCommandSafety") or "Commands are metadata-only and not executed by this desk.",
        })
    if export_prep:
        counts = export_prep.get("counts") if isinstance(export_prep.get("counts"), dict) else {}
        rows.append({
            "rank": 6,
            "id": "export-prep",
            "title": "Open export prep",
            "status": export_prep.get("status") or "export-prep-ready",
            "why": "Export prep shows selected/review/pending/reject sections before any client packet or copy plan.",
            "nextSafestAction": export_prep.get("nextSafestAction") or "Use export prep to review sections; do not copy deliverables until selected set is deliberate.",
            "htmlPath": export_prep.get("htmlPath") or "",
            "jsonPath": export_prep.get("jsonPath") or "",
            "itemCount": counts.get("total", 0),
            "pending": counts.get("pending", 0),
            "selected": counts.get("selected", 0),
            "safety": "Export prep is a packet only; no deliverables are copied.",
        })
    if client:
        counts = client.get("counts") if isinstance(client.get("counts"), dict) else {}
        rows.append({
            "rank": 7,
            "id": "client-proof",
            "title": "Open client proof readiness",
            "status": client.get("deliveryStatus") or "client-proof-packet-ready",
            "why": f"{counts.get('selected', 0)} selected, {counts.get('pending', 0)} pending, and {counts.get('candidateStarterSet', 0)} starter candidates are visible for proof planning.",
            "nextSafestAction": client.get("nextSafestAction") or "Cull or favorite a small keeper set before client-facing delivery.",
            "htmlPath": client.get("htmlPath") or "",
            "jsonPath": client.get("jsonPath") or "",
            "itemCount": counts.get("total", 0),
            "pending": counts.get("pending", 0),
            "selected": counts.get("selected", 0),
            "safety": "Client proof packet only. No copy plan, upload, or external delivery is executed.",
        })
    return rows


def summarize_counts(parts: dict[str, dict[str, Any]], rows: list[dict[str, Any]]) -> dict[str, Any]:
    next_cull = parts.get("nextCull") or {}
    keeper_counts = (parts.get("keeper") or {}).get("counts") if isinstance((parts.get("keeper") or {}).get("counts"), dict) else {}
    client_counts = (parts.get("client") or {}).get("counts") if isinstance((parts.get("client") or {}).get("counts"), dict) else {}
    command_counts = (parts.get("commandSheet") or {}).get("counts") if isinstance((parts.get("commandSheet") or {}).get("counts"), dict) else {}
    next_cull_counts = next_cull.get("counts") if isinstance(next_cull.get("counts"), dict) else {}
    return {
        "sourcePhotos": safe_int(keeper_counts.get("sourcePhotos") or client_counts.get("total")),
        "sourceGroups": safe_int(keeper_counts.get("sourceGroups")),
        "pending": safe_int(keeper_counts.get("pending") or client_counts.get("pending")),
        "selectedForClientProof": safe_int(keeper_counts.get("selectedForClientProof") or client_counts.get("selected")),
        "firstKeeperCandidates": safe_int(keeper_counts.get("firstKeeperCandidates")),
        "cullSuggestionGroups": safe_int(keeper_counts.get("cullSuggestionGroups")),
        "metadataCommandRows": safe_int(keeper_counts.get("metadataCommandRows") or command_counts.get("commands")),
        "nextCullCardReady": bool(next_cull.get("status") == "next-cull-card-ready"),
        "nextCullCommandRows": safe_int(next_cull_counts.get("commands")),
        "clientProofItems": safe_int(keeper_counts.get("clientProofItems") or client_counts.get("selected")),
        "candidateStarterSet": safe_int(client_counts.get("candidateStarterSet")),
        "qualityAttention": safe_int(client_counts.get("qualityAttention")),
        "actionRows": len(rows),
        "copyPlanExecuted": bool(client_counts.get("copyPlanExecuted", False)),
        "metadataChanged": False,
        "originalsMutated": False,
        "externalDeliveryCreated": False,
        "externalPublishing": False,
    }


def proof_contract(counts: dict[str, Any]) -> dict[str, Any]:
    return {
        "humanAsk": "Use this as the front door for proof/cull work: inspect keeper candidates and review groups, then decide metadata-only cull actions before any proof/export delivery.",
        "agentSafeParallelWork": "Prepare evidence summaries, cull packets, review batches, dry-run metadata instructions, and export/client-proof readiness packets. Do not execute decisions, copy deliverables, upload, publish, schedule, delete, overwrite, or mutate originals.",
        "reviewContract": {
            "stateTruth": "Proof Desk is read-only aggregation. It does not approve photos, deliver proofs, or publish anything.",
            "sourcePhotos": counts.get("sourcePhotos", 0),
            "pending": counts.get("pending", 0),
            "selectedForClientProof": counts.get("selectedForClientProof", 0),
            "allowedWithoutApproval": [
                "open proof evidence",
                "inspect first keeper candidates",
                "prepare review/cull notes",
                "prepare export/client-proof packets without copying deliverables",
            ],
            "requiresHumanApproval": [
                "execute metadata decisions",
                "copy proof files",
                "create client delivery",
                "upload, publish, schedule, delete, overwrite, or mutate originals",
            ],
        },
        "sourceTasks": [
            "Open the first proof evidence row.",
            "Use first keepers for a calm starting set.",
            "Use cull suggestions as attention routing only.",
            "Only promote to export/client proof after deliberate metadata selections.",
        ],
    }


def build_packet(photo_root: Path) -> dict[str, Any]:
    review_pointer, latest = latest_review_session(photo_root)
    export_prep = load_json(latest / "export-packets" / "photo-grove-export-prep.json") if latest else {}
    export_html = str(latest / "export-packets" / "photo-grove-export-prep.html") if latest and (latest / "export-packets" / "photo-grove-export-prep.html").exists() else ""
    if export_prep and export_html and not export_prep.get("htmlPath"):
        export_prep["htmlPath"] = export_html
        export_prep["jsonPath"] = str(latest / "export-packets" / "photo-grove-export-prep.json")
    parts = {
        "reviewPointer": review_pointer,
        "nextCull": pointer(photo_root, "latest-photo-grove-next-cull-card.json"),
        "keeper": pointer(photo_root, "latest-photo-grove-keeper-desk.json"),
        "client": pointer(photo_root, "latest-photo-grove-client-proof-packet.json"),
        "commandSheet": pointer(photo_root, "latest-photo-grove-command-sheet.json"),
        "firstKeepers": pointer(photo_root, "latest-photo-grove-first-keepers.json"),
        "cullSuggestions": pointer(photo_root, "latest-photo-grove-cull-suggestions.json"),
        "reviewBatch": pointer(photo_root, "latest-photo-grove-review-batch.json"),
        "exportPrep": export_prep,
    }
    rows = action_rows(photo_root, parts)
    counts = summarize_counts(parts, rows)
    contract = proof_contract(counts)
    first_row = rows[0] if rows else {}
    first_path = str(first_row.get("htmlPath") or first_row.get("jsonPath") or "")
    first_evidence_action = command(
        str(first_row.get("title") or "Open Photo Grove proof evidence"),
        first_path,
        str(first_row.get("safety") or "Opens local proof evidence only."),
    )
    out_dir = photo_root / "ProofDesk" / stamp()
    out_dir.mkdir(parents=True, exist_ok=False)
    json_path = out_dir / "photo-grove-proof-desk.json"
    html_path = out_dir / "index.html"
    markdown_path = out_dir / "START-HERE-photo-grove-proof-desk.md"
    csv_path = out_dir / "photo-grove-proof-desk.csv"
    packet = {
        "schema": SCHEMA,
        "updatedAt": iso_now(),
        "status": "proof-desk-ready",
        "photoRoot": str(photo_root),
        "latestSessionDir": str(latest) if latest else "",
        "sessionDir": str(out_dir),
        "jsonPath": str(json_path),
        "htmlPath": str(html_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "counts": counts,
        "humanAsk": contract["humanAsk"],
        "agentSafeParallelWork": contract["agentSafeParallelWork"],
        "reviewContract": contract["reviewContract"],
        "sourceTasks": contract["sourceTasks"],
        "rows": rows,
        "sourcePointers": {
            "review": str(photo_root / "latest-photo-grove-review.json"),
            "nextCull": str(photo_root / "latest-photo-grove-next-cull-card.json"),
            "keeperDesk": str(photo_root / "latest-photo-grove-keeper-desk.json"),
            "clientProof": str(photo_root / "latest-photo-grove-client-proof-packet.json"),
            "commandSheet": str(photo_root / "latest-photo-grove-command-sheet.json"),
            "firstKeepers": str(photo_root / "latest-photo-grove-first-keepers.json"),
            "cullSuggestions": str(photo_root / "latest-photo-grove-cull-suggestions.json"),
            "reviewBatch": str(photo_root / "latest-photo-grove-review-batch.json"),
        },
        "nextSafestAction": "Open the Photo Grove Proof Desk, then choose the first evidence row from inside the desk before metadata-only cull decisions.",
        "firstSafeAction": command(
            "Open Photo Grove Proof Desk",
            str(html_path),
            "Opens the local Photo Grove Proof Desk only. No metadata command executes, originals stay untouched, and no proof/export/delivery/publication truth is created.",
        ),
        "firstProofEvidenceAction": first_evidence_action,
        "truth": "Proof Desk only. It reads local photo cull/review/proof artifacts and does not mutate originals, execute metadata decisions, copy deliverables, upload, publish, schedule, or create client delivery truth.",
        "originalsMutated": False,
        "metadataChanged": False,
        "clientDeliveryCreated": False,
        "copyPlanExecuted": False,
        "externalPublishing": False,
    }
    return packet


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    fields = ["rank", "id", "title", "status", "why", "nextSafestAction", "itemCount", "pending", "selected", "htmlPath", "jsonPath", "firstDryRunCommand", "firstDryRunDecision", "firstDryRunSafety", "safety"]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: row.get(key, "") for key in fields})


def write_markdown(path: Path, packet: dict[str, Any]) -> None:
    counts = packet.get("counts") or {}
    lines = [
        "# Photo Grove Proof Desk",
        "",
        packet.get("truth") or "Read-only proof desk.",
        "",
        f"Generated: {packet.get('updatedAt')}",
        f"Source photos: `{counts.get('sourcePhotos', 0)}`",
        f"Pending review: `{counts.get('pending', 0)}`",
        f"Selected for proof: `{counts.get('selectedForClientProof', 0)}`",
        f"First-keeper candidates: `{counts.get('firstKeeperCandidates', 0)}`",
        f"Cull suggestion groups: `{counts.get('cullSuggestionGroups', 0)}`",
        f"Metadata command rows: `{counts.get('metadataCommandRows', 0)}`",
        f"Next cull card ready: `{counts.get('nextCullCardReady', False)}`",
        f"Next cull dry-run commands: `{counts.get('nextCullCommandRows', 0)}`",
        "",
        "## Start here",
        "",
        packet.get("nextSafestAction") or "Open the first proof evidence row.",
        "",
        "## Human ask",
        "",
        packet.get("humanAsk") or "",
        "",
        "## Codex can safely do",
        "",
        packet.get("agentSafeParallelWork") or "",
        "",
    ]
    first = packet.get("firstSafeAction") or {}
    if first.get("command"):
        lines.extend(["```bash", str(first["command"]), "```", ""])
    lines.extend(["## Action rows", ""])
    for row in packet.get("rows") or []:
        lines.append(f"- **{row.get('title')}** `{row.get('status')}`: {row.get('nextSafestAction')}")
        if row.get("firstDryRunCommand"):
            lines.append(f"  - Dry-run: `{row.get('firstDryRunCommand')}`")
    lines.extend([
        "",
        "## Safety",
        "",
        "- Originals mutated: false",
        "- Metadata changed: false",
        "- Client delivery created: false",
        "- Copy plan executed: false",
        "- External publishing: false",
    ])
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_html(path: Path, packet: dict[str, Any]) -> None:
    counts = packet.get("counts") or {}
    rows_html = []
    for row in packet.get("rows") or []:
        rows_html.append(f"""
        <article>
          <div class="rank">{esc(row.get('rank'))}</div>
          <div>
            <p class="eyebrow">{esc(row.get('status'))}</p>
            <h2>{esc(row.get('title'))}</h2>
            <p>{esc(row.get('why'))}</p>
            <p><strong>Next:</strong> {esc(row.get('nextSafestAction'))}</p>
            <p class="path">{esc(row.get('htmlPath') or row.get('jsonPath'))}</p>
            <code>open {esc(shell_quote(str(row.get('htmlPath') or row.get('jsonPath') or '')))}</code>
            {f'<p><strong>Dry-run:</strong></p><code>{esc(row.get("firstDryRunCommand"))}</code>' if row.get("firstDryRunCommand") else ''}
            <small>{esc(row.get('safety'))}</small>
          </div>
        </article>
        """)
    html_text = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Photo Grove Proof Desk</title>
<style>
:root {{ color-scheme: dark; --bg:#101610; --panel:#172319; --leaf:#9ccf7a; --moss:#6d8f5f; --cream:#f7ecd2; --muted:#c7b99d; --gold:#e5c15f; --line:rgba(247,236,210,.16); }}
* {{ box-sizing:border-box; }}
body {{ margin:0; background:radial-gradient(circle at 12% 0%, rgba(156,207,122,.23), transparent 32%), linear-gradient(145deg,#0b100c,var(--bg)); color:var(--cream); font-family:Avenir Next, ui-sans-serif, system-ui, sans-serif; }}
main {{ max-width:1180px; margin:0 auto; padding:42px 26px 72px; }}
.hero {{ border:1px solid var(--line); border-radius:30px; padding:30px; background:rgba(23,35,25,.82); box-shadow:0 28px 80px rgba(0,0,0,.35); }}
.eyebrow {{ color:var(--gold); text-transform:uppercase; letter-spacing:.2em; font-size:12px; font-weight:900; margin:0 0 7px; }}
h1 {{ font-size:clamp(42px,7vw,86px); line-height:.9; letter-spacing:-.055em; margin:0; }}
p {{ color:var(--muted); line-height:1.55; }}
.metrics {{ display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:12px; margin:24px 0; }}
.metric {{ border:1px solid var(--line); border-radius:18px; padding:14px; background:rgba(255,255,255,.06); }}
.metric strong {{ display:block; color:var(--cream); font-size:28px; }}
.metric span {{ color:var(--muted); text-transform:uppercase; letter-spacing:.12em; font-weight:800; font-size:10px; }}
.start {{ border:1px solid rgba(229,193,95,.42); border-radius:18px; padding:16px; background:rgba(229,193,95,.1); }}
.list {{ display:grid; gap:16px; margin-top:24px; }}
article {{ display:grid; grid-template-columns:54px 1fr; gap:16px; border:1px solid var(--line); border-radius:24px; padding:18px; background:rgba(0,0,0,.2); }}
.rank {{ width:42px; height:42px; border-radius:50%; background:rgba(156,207,122,.16); color:var(--leaf); display:grid; place-items:center; font-weight:900; }}
h2 {{ margin:0; font-size:25px; }}
code {{ display:block; padding:10px; border-radius:12px; background:rgba(0,0,0,.34); color:var(--leaf); white-space:pre-wrap; word-break:break-word; }}
small,.path {{ color:#a99f89; word-break:break-word; }}
@media(max-width:760px) {{ .metrics {{ grid-template-columns:repeat(2,minmax(0,1fr)); }} article {{ grid-template-columns:1fr; }} }}
</style>
</head>
<body>
<main>
<section class="hero">
<p class="eyebrow">Quipsly Photo Grove</p>
<h1>Proof Desk</h1>
<p>{esc(packet.get('truth'))}</p>
<div class="start"><strong>Human ask:</strong><p>{esc(packet.get('humanAsk'))}</p><strong>Codex can safely do:</strong><p>{esc(packet.get('agentSafeParallelWork'))}</p></div>
<div class="metrics">
<div class="metric"><strong>{esc(counts.get('sourcePhotos'))}</strong><span>photos</span></div>
<div class="metric"><strong>{esc(counts.get('pending'))}</strong><span>pending</span></div>
<div class="metric"><strong>{esc(counts.get('selectedForClientProof'))}</strong><span>selected</span></div>
<div class="metric"><strong>{esc(counts.get('firstKeeperCandidates'))}</strong><span>keepers</span></div>
<div class="metric"><strong>{esc(counts.get('cullSuggestionGroups'))}</strong><span>cull groups</span></div>
<div class="metric"><strong>{esc(counts.get('nextCullCommandRows') or counts.get('metadataCommandRows'))}</strong><span>next cmds</span></div>
</div>
<div class="start"><strong>Next safest action:</strong><p>{esc(packet.get('nextSafestAction'))}</p><code>{esc((packet.get('firstSafeAction') or {}).get('command'))}</code></div>
</section>
<section class="list">{''.join(rows_html)}</section>
</main>
</body>
</html>
"""
    path.write_text(html_text, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a local-only Photo Grove Proof Desk.")
    parser.add_argument("photo_root", nargs="?", default=str(DEFAULT_PHOTO_ROOT))
    args = parser.parse_args()
    photo_root = Path(args.photo_root).expanduser()
    packet = build_packet(photo_root)
    json_path = Path(packet["jsonPath"])
    html_path = Path(packet["htmlPath"])
    markdown_path = Path(packet["markdownPath"])
    csv_path = Path(packet["csvPath"])
    write_json(json_path, packet)
    write_markdown(markdown_path, packet)
    write_html(html_path, packet)
    write_csv(csv_path, packet.get("rows") or [])
    pointer_path = photo_root / LATEST_POINTER
    packet["pointerPath"] = str(pointer_path)
    write_json(json_path, packet)
    write_json(pointer_path, packet)
    print(json.dumps({
        "status": packet.get("status"),
        "htmlPath": packet.get("htmlPath"),
        "jsonPath": packet.get("jsonPath"),
        "markdownPath": packet.get("markdownPath"),
        "csvPath": packet.get("csvPath"),
        "pointerPath": packet.get("pointerPath"),
        "counts": packet.get("counts"),
        "nextSafestAction": packet.get("nextSafestAction"),
        "firstSafeAction": packet.get("firstSafeAction"),
        "safety": {
            "originalsMutated": packet.get("originalsMutated"),
            "metadataChanged": packet.get("metadataChanged"),
            "clientDeliveryCreated": packet.get("clientDeliveryCreated"),
            "copyPlanExecuted": packet.get("copyPlanExecuted"),
            "externalPublishing": packet.get("externalPublishing"),
        },
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
