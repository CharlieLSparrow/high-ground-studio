#!/usr/bin/env python3
"""Build a Studio360 operator workbench.

This composes the current 360 proof/control, source-inspection, reframe/export,
and export-candidate evidence into one calm front door. It does not proxy,
render, export, repair, upload, publish, schedule, delete, overwrite, or mutate
source media. It is control-plane only: make the state legible, then let humans
approve costly actions later.
"""
from __future__ import annotations

import csv
import html
import json
import shlex
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/Studio360")
LATEST_POINTER = "latest-studio360-operator-workbench.json"
SCHEMA = "quipsly.studio360.operator-workbench.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-studio360-operator-workbench")


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except Exception:
        return {}


def load_pointer_target(root: Path, *names: str) -> dict[str, Any]:
    for name in names:
        pointer_path = root / name
        pointer = load_json(pointer_path)
        if not pointer:
            continue
        target_path = Path(str(pointer.get("jsonPath") or pointer.get("packetPath") or pointer.get("manifestPath") or ""))
        target = load_json(target_path) if target_path.exists() and target_path != pointer_path else {}
        merged = {**pointer, **target} if target else pointer
        merged.setdefault("pointerPath", str(pointer_path))
        return merged
    return {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def esc(value: Any) -> str:
    return html.escape(str(value or ""))


def shell_quote(value: str) -> str:
    return shlex.quote(value)


def as_list(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, list):
        return [item for item in value if isinstance(item, dict)]
    return []


def safe_int(value: Any) -> int:
    try:
        return int(value or 0)
    except Exception:
        return 0


def safe_float(value: Any) -> float:
    try:
        return float(value or 0)
    except Exception:
        return 0.0


def truth_value(packet: dict[str, Any], counts: dict[str, Any], key: str) -> bool:
    truth = packet.get("truth") if isinstance(packet.get("truth"), dict) else {}
    return bool(truth.get(key) or counts.get(key) or packet.get(key))


def front_door(label: str, packet: dict[str, Any], *path_keys: str) -> dict[str, Any]:
    for key in path_keys:
        path = str(packet.get(key) or "")
        if path:
            return {
                "label": label,
                "path": path,
                "pathExists": Path(path).exists(),
                "openCommand": f"open {shell_quote(path)}",
            }
    return {"label": label, "path": "", "pathExists": False, "openCommand": ""}


def first_rows(packet: dict[str, Any], *keys: str, limit: int = 8) -> list[dict[str, Any]]:
    for key in keys:
        rows = as_list(packet.get(key))
        if rows:
            return rows[:limit]
        nested = packet.get(key)
        if isinstance(nested, dict):
            for child_key in ["rows", "cards", "items", "groups"]:
                child_rows = as_list(nested.get(child_key))
                if child_rows:
                    return child_rows[:limit]
    return []


def normalize_source_card(row: dict[str, Any], rank: int) -> dict[str, Any]:
    source_paths = [str(path) for path in row.get("sourcePaths") or [] if path]
    return {
        "rank": rank,
        "kind": "source-routing",
        "id": str(row.get("id") or row.get("groupKey") or f"source-{rank}"),
        "groupKey": str(row.get("groupKey") or ""),
        "label": str(row.get("label") or row.get("title") or "Inspect 360 source group"),
        "route": str(row.get("route") or ""),
        "status": str(row.get("status") or row.get("statusLabel") or ""),
        "assetCount": safe_int(row.get("assetCount")),
        "originalCount": safe_int(row.get("originalCount")),
        "proxyCount": safe_int(row.get("proxyCount")),
        "companionCount": safe_int(row.get("companionCount")),
        "durationSeconds": safe_float(row.get("durationSeconds")),
        "humanAsk": str(row.get("humanQuestion") or row.get("humanAsk") or "Confirm this is the intended 360 source group before any proxy or render work."),
        "nextSafestAction": str(row.get("nextSafestAction") or row.get("codexSafeMove") or "Open local source evidence and classify the group."),
        "openSourceCommand": str(row.get("openSourceCommand") or ""),
        "candidateProxyPrepCommand": str(row.get("candidateProxyPrepCommand") or ""),
        "sourcePathCount": len(source_paths),
        "firstSourcePath": source_paths[0] if source_paths else "",
        "firstSourceExists": Path(source_paths[0]).exists() if source_paths else False,
        "truth": "Source row only. No proxy, repair, render, export, or source mutation occurred.",
    }


def normalize_export_candidate(row: dict[str, Any], rank: int) -> dict[str, Any]:
    output_path = str(row.get("outputPath") or row.get("proposedOutputPath") or row.get("proposedProofOutputPath") or "")
    proof_path = str(row.get("proofOutputPath") or row.get("proposedProofOutputPath") or "")
    return {
        "rank": rank,
        "kind": "export-candidate",
        "candidateId": str(row.get("candidateId") or row.get("recipeId") or row.get("groupKey") or f"candidate-{rank}"),
        "groupKey": str(row.get("groupKey") or ""),
        "aspect": str(row.get("aspect") or row.get("outputAspect") or ""),
        "version": str(row.get("version") or ""),
        "status": str(row.get("risk") or row.get("status") or row.get("reviewStatus") or ""),
        "durationSeconds": safe_float(row.get("sequenceDurationSeconds") or row.get("durationSeconds")),
        "reviewSourceKind": str(row.get("reviewSourceKind") or ""),
        "reviewSourceExists": bool(row.get("reviewSourceExists")),
        "futureRenderSourceKind": str(row.get("futureRenderSourceKind") or ""),
        "futureRenderSourceExists": bool(row.get("futureRenderSourceExists")),
        "outputPath": output_path,
        "outputExists": Path(output_path).exists() if output_path else False,
        "proofOutputPath": proof_path,
        "proofOutputExists": Path(proof_path).exists() if proof_path else False,
        "nextSafestAction": str(row.get("nextSafestAction") or "Review proof evidence before any full render."),
        "truth": "Candidate row only. It is render intent, not a rendered export or publication receipt.",
    }


def normalize_reframe_row(row: dict[str, Any], rank: int) -> dict[str, Any]:
    return {
        "rank": rank,
        "kind": "reframe-group",
        "groupKey": str(row.get("groupKey") or row.get("groupId") or f"group-{rank}"),
        "priority": str(row.get("priority") or row.get("status") or ""),
        "readiness": str(row.get("readiness") or ""),
        "status": str(row.get("status") or row.get("workflowStatus") or ""),
        "assetCount": safe_int(row.get("assetCount")),
        "durationSeconds": safe_float(row.get("durationSeconds")),
        "recipeCount": safe_int(row.get("recipeCount")),
        "readyRecipeCount": safe_int(row.get("readyRecipeCount")),
        "damagedAssetCount": safe_int(row.get("damagedAssetCount")),
        "reviewSourceKind": str(row.get("reviewSourceKind") or ""),
        "reviewSourcePath": str(row.get("reviewSourcePath") or ""),
        "humanAsk": str(row.get("humanAsk") or "Classify this 360 group before render/export work."),
        "nextSafestAction": str(row.get("nextSafestAction") or "Review local reframe/export evidence."),
        "truth": str(row.get("truth") or "Read-only reframe row. No media was changed."),
    }


def build(root: Path = DEFAULT_ROOT, limit: int = 12) -> dict[str, Any]:
    proof = load_pointer_target(root, "latest-studio360-proof-control-room.json", "latest-360-proof-control-room.json")
    next_source = load_pointer_target(root, "latest-studio360-next-source-card.json", "latest-360-next-source-card.json")
    export_queue = load_pointer_target(root, "latest-studio360-export-candidate-queue.json", "latest-360-export-candidate-queue.json")
    reframe_desk = load_pointer_target(root, "latest-studio360-reframe-export-desk.json", "latest-360-reframe-export-desk.json")
    renderer = load_pointer_target(root, "latest-studio360-renderer-preflight.json", "latest-360-renderer-preflight.json")
    repair = load_pointer_target(root, "latest-studio360-repair-status.json", "latest-360-repair-status.json")
    source_desk = load_pointer_target(root, "latest-studio360-source-desk.json", "latest-360-source-desk.json")

    proof_counts = proof.get("counts") if isinstance(proof.get("counts"), dict) else {}
    export_counts = export_queue.get("counts") if isinstance(export_queue.get("counts"), dict) else {}
    reframe_counts = reframe_desk.get("counts") if isinstance(reframe_desk.get("counts"), dict) else {}
    next_counts = next_source.get("counts") if isinstance(next_source.get("counts"), dict) else {}

    source_cards = first_rows(proof, "sourceRoutingCards", limit=limit)
    if not source_cards and next_source:
        source_cards = [next_source]
    export_rows = first_rows(export_queue, "readyRows", "candidateRows", "rows", limit=limit)
    reframe_rows = first_rows(reframe_desk, "groupRows", "rows", limit=limit)
    proof_rows = first_rows(proof, "proofReviewRows", "proofRows", "existingProofRows", limit=limit)

    normalized_sources = [normalize_source_card(row, index) for index, row in enumerate(source_cards, 1)]
    normalized_exports = [normalize_export_candidate(row, index) for index, row in enumerate(export_rows, 1)]
    normalized_reframes = [normalize_reframe_row(row, index) for index, row in enumerate(reframe_rows, 1)]

    front_doors = [
        front_door("Studio360 proof control room", proof, "htmlPath"),
        front_door("Studio360 next source card", next_source, "htmlPath", "next360SourceCardPath"),
        front_door("Studio360 source desk", source_desk, "htmlPath"),
        front_door("Studio360 reframe/export desk", reframe_desk, "htmlPath"),
        front_door("Studio360 export candidate queue", export_queue, "htmlPath"),
        front_door("Studio360 renderer preflight", renderer, "htmlPath"),
        front_door("Studio360 repair status", repair, "htmlPath"),
        front_door("Source routing cards", proof, "sourceRoutingCardsPath"),
        front_door("Render dry-run cards", proof, "renderDryRunCardsPath"),
        front_door("Reframe export runway", proof, "reframeExportRunwayPath"),
        front_door("Proof runway", proof, "proofRunwayPath"),
    ]

    repair_blockers = safe_int(proof_counts.get("blockedMediaRepair")) + safe_int(reframe_counts.get("blockedMediaRepair"))
    damaged_assets = max(safe_int(proof_counts.get("damagedAssets")), safe_int(reframe_counts.get("damagedAssets")))
    repair_tickets = max(safe_int(proof_counts.get("repairTickets")), safe_int(reframe_counts.get("repairTickets")))
    ready_recipes = max(safe_int(proof_counts.get("readyRecipes")), safe_int(reframe_counts.get("readyRecipes")), safe_int(export_counts.get("candidateRows")))
    ready_groups = max(safe_int(proof_counts.get("reframeReady")), safe_int(reframe_counts.get("reframeReady")), safe_int(export_counts.get("readyGroups")))
    proof_outputs_present = safe_int(proof_counts.get("proofOutputsPresent")) or len(proof_rows)
    proof_outputs_missing = safe_int(proof_counts.get("proofOutputsMissing"))
    read_only_truth = {
        "description": "Studio360 operator workbench only. It composes existing local evidence into one control-plane surface.",
        "proxiesCreated": False,
        "repairsExecuted": False,
        "rendererCommandsExecuted": False,
        "exportsCreated": False,
        "fullRenderCreated": False,
        "sourceFilesMutated": False,
        "metadataWritten": False,
        "versionsOverwritten": False,
        "filesDeleted": False,
        "externalUpload": False,
        "externalPublishing": False,
        "externalSchedulesCreated": False,
        "receiptTruthCreated": False,
    }
    status = "studio360-operator-workbench-ready" if normalized_sources and (ready_recipes or proof_outputs_present) else "studio360-operator-workbench-needs-evidence"
    if repair_blockers or damaged_assets or repair_tickets:
        status = "studio360-operator-workbench-repair-first"

    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": status,
        "studio360Root": str(root),
        "label": "Studio360 operator workbench",
        "humanAsk": "Review 360 source, proxy, proof, reframe, repair, and export-candidate evidence from one place. Do not render, repair, export, upload, publish, or mutate originals without explicit approval.",
        "nextSafestAction": "Open the first source/reframe row, confirm source intent and repair blockers, then prepare only local proof/export decisions until a human explicitly approves render work.",
        "frontDoors": front_doors,
        "sourceRows": normalized_sources,
        "reframeRows": normalized_reframes,
        "exportCandidateRows": normalized_exports,
        "proofRows": proof_rows[:limit],
        "counts": {
            "assets": safe_int(proof_counts.get("assets")) or safe_int(next_counts.get("assetCount")),
            "assetGroups": safe_int(proof_counts.get("assetGroups")) or safe_int(export_counts.get("readyGroups")),
            "sourceRows": len(normalized_sources),
            "reframeRows": len(normalized_reframes),
            "exportCandidateRows": len(normalized_exports),
            "readyReframeGroups": ready_groups,
            "readyRecipes": ready_recipes,
            "candidateRows": safe_int(export_counts.get("candidateRows")) or len(normalized_exports),
            "proofOutputsPresent": proof_outputs_present,
            "proofOutputsMissing": proof_outputs_missing,
            "blockedMediaRepair": repair_blockers,
            "damagedAssets": damaged_assets,
            "repairTickets": repair_tickets,
            "repairTicketsNeedingSourceRecopy": safe_int(proof_counts.get("repairTicketsNeedingSourceRecopy")) or safe_int(reframe_counts.get("repairTicketsNeedingSourceRecopy")),
            "frontDoors": len([item for item in front_doors if item.get("path")]),
            "originalsMutated": any(truth_value(packet, counts, "originalsMutated") or truth_value(packet, counts, "sourceFilesMutated") for packet, counts in [(proof, proof_counts), (export_queue, export_counts), (reframe_desk, reframe_counts)]),
            "exportsCreated": any(truth_value(packet, counts, "exportsCreated") for packet, counts in [(proof, proof_counts), (export_queue, export_counts), (reframe_desk, reframe_counts)]),
            "fullRenderCreated": truth_value(proof, proof_counts, "fullRenderCreated"),
            "rendererCommandsExecuted": truth_value(proof, proof_counts, "rendererCommandsExecuted"),
            "externalPublishing": truth_value(proof, proof_counts, "externalPublishing"),
            "externalUpload": truth_value(proof, proof_counts, "externalUpload"),
            "externalSchedulesCreated": truth_value(proof, proof_counts, "externalSchedulesCreated"),
            "receiptTruthCreated": truth_value(proof, proof_counts, "receiptTruthCreated"),
            "versionsOverwritten": truth_value(proof, proof_counts, "versionsOverwritten"),
            "filesDeleted": truth_value(proof, proof_counts, "filesDeleted"),
            "repairsExecuted": truth_value(proof, proof_counts, "repairsExecuted"),
        },
        "firstSafeAction": {
            "label": "Open Studio360 operator workbench",
            "command": "",
            "path": "",
            "safety": "Opens local 360 control-plane evidence only. No proxy, repair, render, export, upload, publish, schedule, source mutation, delete, overwrite, or receipt truth.",
        },
        "truth": read_only_truth,
    }


def render_markdown(path: Path, payload: dict[str, Any]) -> None:
    counts = payload.get("counts", {}) if isinstance(payload.get("counts"), dict) else {}
    lines = [
        "# Studio360 operator workbench",
        "",
        f"- Status: `{payload.get('status')}`",
        f"- Source rows: `{counts.get('sourceRows')}`",
        f"- Ready recipes: `{counts.get('readyRecipes')}`",
        f"- Export candidates: `{counts.get('candidateRows')}`",
        f"- Repair tickets: `{counts.get('repairTickets')}`",
        f"- Proof outputs present: `{counts.get('proofOutputsPresent')}`",
        "",
        "## Human ask",
        str(payload.get("humanAsk") or ""),
        "",
        "## Front doors",
    ]
    for item in payload.get("frontDoors") or []:
        if item.get("path"):
            lines.append(f"- {item.get('label')}: `{item.get('openCommand')}`")
    lines.extend(["", "## Source rows"])
    for row in payload.get("sourceRows") or []:
        lines.extend([
            f"### {row.get('rank')}. {row.get('label')}",
            f"- Group: `{row.get('groupKey')}`",
            f"- Route/status: `{row.get('route')}` / `{row.get('status')}`",
            f"- Counts: assets `{row.get('assetCount')}`, originals `{row.get('originalCount')}`, proxies `{row.get('proxyCount')}`, companions `{row.get('companionCount')}`",
            f"- Source exists: `{row.get('firstSourceExists')}`",
            f"- Next: {row.get('nextSafestAction')}",
            "",
        ])
    lines.extend(["", "## Export candidates"])
    for row in payload.get("exportCandidateRows") or []:
        lines.extend([
            f"### {row.get('rank')}. {row.get('candidateId')}",
            f"- Aspect/version/status: `{row.get('aspect')}` / `{row.get('version')}` / `{row.get('status')}`",
            f"- Sources exist: review `{row.get('reviewSourceExists')}`, future `{row.get('futureRenderSourceExists')}`",
            f"- Output exists now: `{row.get('outputExists')}`",
            f"- Next: {row.get('nextSafestAction')}",
            "",
        ])
    lines.extend([
        "## Safety",
        "This workbench is read-only control-plane evidence. It does not render, repair, export, upload, publish, schedule, delete, overwrite, create receipts, or mutate original media.",
        "",
    ])
    path.write_text("\n".join(lines), encoding="utf-8")


def render_html(path: Path, payload: dict[str, Any]) -> None:
    counts = payload.get("counts", {}) if isinstance(payload.get("counts"), dict) else {}
    doors = "".join(
        f"<a class='door' href='{esc(Path(str(item.get('path'))).as_uri() if item.get('pathExists') else '#')}'><strong>{esc(item.get('label'))}</strong><span>{esc(item.get('path'))}</span></a>"
        for item in payload.get("frontDoors") or []
        if item.get("path")
    )
    source_rows = "".join(
        f"<tr><td>{esc(row.get('rank'))}</td><td>{esc(row.get('label'))}<br><small>{esc(row.get('groupKey'))}</small></td><td>{esc(row.get('route'))}<br><small>{esc(row.get('status'))}</small></td><td>{esc(row.get('assetCount'))}/{esc(row.get('originalCount'))}/{esc(row.get('proxyCount'))}/{esc(row.get('companionCount'))}</td><td>{esc(row.get('firstSourceExists'))}</td><td>{esc(row.get('nextSafestAction'))}</td></tr>"
        for row in payload.get("sourceRows") or []
    )
    export_rows = "".join(
        f"<tr><td>{esc(row.get('rank'))}</td><td>{esc(row.get('candidateId'))}<br><small>{esc(row.get('groupKey'))}</small></td><td>{esc(row.get('aspect'))}<br><small>{esc(row.get('version'))}</small></td><td>{esc(row.get('status'))}</td><td>review {esc(row.get('reviewSourceExists'))}<br>future {esc(row.get('futureRenderSourceExists'))}</td><td>{esc(row.get('outputExists'))}</td><td>{esc(row.get('nextSafestAction'))}</td></tr>"
        for row in payload.get("exportCandidateRows") or []
    )
    html_text = f"""<!doctype html>
<html><head><meta charset='utf-8'><title>Studio360 operator workbench</title>
<style>
:root {{ color-scheme: dark; --bg:#111814; --panel:#19231d; --panel2:#213126; --line:#35513e; --text:#f4f0dc; --muted:#b9c3aa; --honey:#e4b13b; --leaf:#6bd37a; --clay:#d56f45; --sky:#56c4d8; }}
* {{ box-sizing:border-box; }} body {{ margin:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:radial-gradient(circle at top left,#203126,#111814 55%); color:var(--text); }}
main {{ max-width:1320px; margin:0 auto; padding:28px; }} .hero,.card {{ border:1px solid var(--line); background:linear-gradient(135deg,rgba(33,49,38,.92),rgba(18,24,20,.96)); border-radius:24px; padding:22px; box-shadow:0 20px 60px rgba(0,0,0,.32); }}
.kicker {{ color:var(--honey); letter-spacing:.22em; text-transform:uppercase; font-weight:800; font-size:12px; }} h1 {{ margin:8px 0 10px; font-size:42px; line-height:1; }} p {{ color:var(--muted); line-height:1.5; }}
.grid {{ display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:12px; margin:18px 0; }} .metric {{ background:var(--panel2); border:1px solid var(--line); border-radius:16px; padding:14px; }} .metric strong {{ display:block; font-size:24px; color:var(--leaf); }} .metric span {{ color:var(--muted); font-size:12px; text-transform:uppercase; letter-spacing:.08em; }}
.doors {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(230px,1fr)); gap:10px; }} .door {{ display:block; text-decoration:none; color:var(--text); background:#101713; border:1px solid var(--line); border-radius:14px; padding:12px; }} .door strong {{ display:block; color:var(--honey); }} .door span {{ display:block; color:var(--muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-top:4px; }}
table {{ width:100%; border-collapse:collapse; overflow:hidden; border-radius:16px; }} th,td {{ text-align:left; padding:10px; border-bottom:1px solid rgba(255,255,255,.08); vertical-align:top; }} th {{ color:var(--honey); font-size:12px; text-transform:uppercase; letter-spacing:.08em; }} small {{ color:var(--muted); }} .stack {{ display:grid; gap:18px; }} .truth {{ border-color:rgba(107,211,122,.45); }} .warn strong {{ color:var(--clay); }}
@media (max-width: 900px) {{ .grid {{ grid-template-columns:repeat(2,minmax(0,1fr)); }} h1 {{ font-size:32px; }} main {{ padding:16px; }} }}
</style></head><body><main class='stack'>
<section class='hero'><div class='kicker'>Quipsly Studio360</div><h1>Operator workbench</h1><p>{esc(payload.get('humanAsk'))}</p><p><strong>Next safest action:</strong> {esc(payload.get('nextSafestAction'))}</p></section>
<section class='grid'>
  <div class='metric'><strong>{esc(counts.get('sourceRows'))}</strong><span>source rows</span></div>
  <div class='metric'><strong>{esc(counts.get('readyRecipes'))}</strong><span>ready recipes</span></div>
  <div class='metric'><strong>{esc(counts.get('candidateRows'))}</strong><span>candidates</span></div>
  <div class='metric'><strong>{esc(counts.get('proofOutputsPresent'))}</strong><span>proof outputs</span></div>
  <div class='metric warn'><strong>{esc(counts.get('repairTickets'))}</strong><span>repair tickets</span></div>
  <div class='metric warn'><strong>{esc(counts.get('damagedAssets'))}</strong><span>damaged assets</span></div>
</section>
<section class='card'><h2>Front doors</h2><div class='doors'>{doors}</div></section>
<section class='card'><h2>Source routing</h2><table><thead><tr><th>#</th><th>Source</th><th>Route</th><th>assets/orig/proxy/comp</th><th>source?</th><th>next</th></tr></thead><tbody>{source_rows}</tbody></table></section>
<section class='card'><h2>Export candidate runway</h2><table><thead><tr><th>#</th><th>candidate</th><th>aspect</th><th>status</th><th>sources</th><th>output exists</th><th>next</th></tr></thead><tbody>{export_rows}</tbody></table></section>
<section class='card truth'><h2>Safety truth</h2><p>No proxy, repair, render, export, upload, publish, schedule, delete, overwrite, source mutation, or receipt truth was created by this workbench.</p></section>
</main></body></html>"""
    path.write_text(html_text, encoding="utf-8")


def render_csv(path: Path, payload: dict[str, Any]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["rank", "kind", "id", "groupKey", "status", "nextSafestAction"])
        writer.writeheader()
        for row in payload.get("sourceRows") or []:
            writer.writerow({"rank": row.get("rank"), "kind": row.get("kind"), "id": row.get("id"), "groupKey": row.get("groupKey"), "status": row.get("status"), "nextSafestAction": row.get("nextSafestAction")})
        for row in payload.get("exportCandidateRows") or []:
            writer.writerow({"rank": row.get("rank"), "kind": row.get("kind"), "id": row.get("candidateId"), "groupKey": row.get("groupKey"), "status": row.get("status"), "nextSafestAction": row.get("nextSafestAction")})


def main() -> None:
    root = Path(__import__("sys").argv[1]) if len(__import__("sys").argv) > 1 else DEFAULT_ROOT
    payload = build(root)
    out_dir = root / "OperatorWorkbenches" / stamp()
    out_dir.mkdir(parents=True, exist_ok=True)
    json_path = out_dir / "studio360-operator-workbench.json"
    markdown_path = out_dir / "START-HERE-studio360-operator-workbench.md"
    html_path = out_dir / "index.html"
    csv_path = out_dir / "studio360-operator-workbench.csv"
    payload.update({
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "htmlPath": str(html_path),
        "csvPath": str(csv_path),
    })
    payload["firstSafeAction"]["path"] = str(html_path)
    payload["firstSafeAction"]["command"] = f"open {shell_quote(str(html_path))}"
    write_json(json_path, payload)
    render_markdown(markdown_path, payload)
    render_html(html_path, payload)
    render_csv(csv_path, payload)
    pointer_payload = {
        "schema": "quipsly.studio360.latest-operator-workbench.v1",
        "generatedAt": payload["generatedAt"],
        "status": payload["status"],
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "htmlPath": str(html_path),
        "csvPath": str(csv_path),
        "counts": payload.get("counts") or {},
        "humanAsk": payload.get("humanAsk") or "",
        "nextSafestAction": payload.get("nextSafestAction") or "",
        "firstSafeAction": payload.get("firstSafeAction") or {},
        "truth": payload.get("truth") or {},
    }
    write_json(root / LATEST_POINTER, pointer_payload)
    print(json.dumps({"ok": True, **pointer_payload}, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
