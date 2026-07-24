#!/usr/bin/env python3
"""Build a calm Studio360 Start Here page.

Studio360 has multiple mature control surfaces. This page is the first door: it
summarizes the current safe state, names the repair/proxy/reframe/export gate,
and points humans/agents to the next reversible local action without rendering,
repairing, uploading, publishing, mutating originals, or creating receipts.
"""

from __future__ import annotations

import html
import json
import shlex
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/Studio360")
LATEST_POINTER = "latest-studio360-start-here.json"
SCHEMA = "quipsly.studio360.startHere.v1"

SOURCES = {
    "operatorWorkbench": ["latest-studio360-operator-workbench.json"],
    "workflowPacket": ["latest-360-workflow-packet.json"],
    "reframeExportDesk": ["latest-360-reframe-export-desk.json"],
    "proofControlRoom": ["latest-studio360-proof-control-room.json", "latest-360-proof-control-room.json"],
    "nextSourceCard": ["latest-studio360-next-source-card.json", "latest-360-next-source-card.json"],
    "repairStatus": ["latest-360-repair-status.json"],
    "repairPreflight": ["latest-360-repair-preflight.json"],
    "rendererPreflight": ["latest-360-renderer-preflight.json"],
    "exportCandidateQueue": ["latest-360-export-candidate-queue.json"],
    "proofReviewDesk": ["latest-360-proof-review-desk.json"],
}


def iso_now() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-studio360-start-here")


def shell_quote(value: str) -> str:
    return shlex.quote(value)


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            return {}
        target = payload.get("jsonPath") or payload.get("packetPath") or payload.get("latest")
        if target:
            target_path = Path(str(target))
            if target_path.exists() and target_path != path and target_path.is_file():
                target_payload = json.loads(target_path.read_text(encoding="utf-8"))
                if isinstance(target_payload, dict):
                    return {**payload, **target_payload}
        return payload
    except Exception as exc:
        return {"status": "load-error", "path": str(path), "error": str(exc)}


def load_source(root: Path, names: list[str]) -> dict[str, Any]:
    for name in names:
        payload = read_json(root / name)
        if payload:
            payload.setdefault("pointerPath", str(root / name))
            return payload
    return {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def count(payload: dict[str, Any], key: str) -> int:
    counts = payload.get("counts") if isinstance(payload.get("counts"), dict) else {}
    value = counts.get(key, payload.get(key))
    if isinstance(value, bool):
        return int(value)
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def first_path(payload: dict[str, Any]) -> str:
    first = payload.get("firstSafeAction") if isinstance(payload.get("firstSafeAction"), dict) else {}
    for key in ("htmlPath", "markdownPath", "jsonPath", "packetPath"):
        value = payload.get(key)
        if value:
            return str(value)
    value = first.get("path")
    return str(value) if value else ""


def first_command(payload: dict[str, Any]) -> str:
    first = payload.get("firstSafeAction") if isinstance(payload.get("firstSafeAction"), dict) else {}
    command = first.get("command")
    if command:
        return str(command)
    path = first_path(payload)
    return f"open {shell_quote(path)}" if path else ""


def source_summary(parts: dict[str, dict[str, Any]]) -> dict[str, dict[str, str]]:
    return {
        key: {
            "status": str(payload.get("status") or "missing"),
            "path": first_path(payload),
            "command": first_command(payload),
        }
        for key, payload in parts.items()
    }


def status_from(counts: dict[str, int], parts: dict[str, dict[str, Any]]) -> tuple[str, str, str]:
    repair = counts["repairTickets"] + counts["blockedMediaRepair"] + counts["damagedAssets"]
    if repair:
        return (
            "studio360-start-here-repair-first",
            "repair first, proofs can continue",
            "Some 360 groups need source repair or recopy decisions, but many proxy/reframe/proof lanes are still usable. Keep repair, proof, and export truth separate.",
        )
    if counts["readyReframeGroups"] and counts["readyRecipes"]:
        return (
            "studio360-start-here-reframe-ready",
            "reframe/export prep ready",
            "Studio360 has reframe-ready groups and recipes. Run renderer preflight before any full render/export action.",
        )
    workflow_status = str(parts.get("workflowPacket", {}).get("status") or "")
    if "proxy" in workflow_status or counts["needsProxyGroups"]:
        return (
            "studio360-start-here-proxy-prep-needed",
            "proxy prep needed",
            "Some 360 sources need safe proxy preparation before reframing or proof renders.",
        )
    return (
        "studio360-start-here-needs-routing",
        "needs source routing",
        "Open the workflow packet and source card to decide which 360 groups are usable, parked, or need repair evidence.",
    )


def action_card(kind: str, label: str, why: str, command: str = "", path: str = "") -> dict[str, str]:
    return {"kind": kind, "label": label, "why": why, "command": command or (f"open {shell_quote(path)}" if path else ""), "path": path}


def build_actions(parts: dict[str, dict[str, Any]], counts: dict[str, int]) -> list[dict[str, str]]:
    return [
        action_card(
            "front-door",
            "Open Studio360 operator workbench",
            "One overview for source, proxy, proof, repair, reframe, and export-candidate evidence.",
            first_command(parts["operatorWorkbench"]),
            first_path(parts["operatorWorkbench"]),
        ),
        action_card(
            "repair",
            "Check repair status before full export",
            f"There are {counts['repairTickets']} repair ticket(s), {counts['blockedMediaRepair']} media repair blocker(s), and {counts['damagedAssets']} damaged asset signal(s).",
            "./script/agentctl.sh studio360-repair-status && ./script/agentctl.sh studio360-repair-preflight 8",
        ),
        action_card(
            "proof",
            "Open proof control room",
            f"There are {counts['proofOutputsPresent']} proof output(s) present and {counts['readyToRunProofRows']} proof row(s) ready to inspect or dry-run.",
            first_command(parts["proofControlRoom"]),
            first_path(parts["proofControlRoom"]),
        ),
        action_card(
            "source",
            "Open next source card",
            "Use one source card to verify one group at a time: originals, companions, proxy, and first local proof evidence.",
            first_command(parts["nextSourceCard"]),
            first_path(parts["nextSourceCard"]),
        ),
        action_card(
            "reframe",
            "Open reframe/export desk",
            f"{counts['readyReframeGroups']} group(s) and {counts['readyRecipes']} recipe(s) are reframe-ready, but full export remains gated.",
            first_command(parts["reframeExportDesk"]),
            first_path(parts["reframeExportDesk"]),
        ),
        action_card(
            "preflight",
            "Run renderer preflight before render/export",
            "Checks renderer readiness without creating full exports or mutating originals.",
            "./script/agentctl.sh studio360-renderer-preflight",
        ),
        action_card(
            "workflow",
            "Open raw workflow packet",
            f"Workflow packet has {counts['workflowGroups']} grouped source set(s), {counts['workflowAssets']} asset row(s), and {counts['needsProxyGroups']} needs-proxy group(s).",
            first_command(parts["workflowPacket"]),
            first_path(parts["workflowPacket"]),
        ),
    ]


def build_payload(root: Path) -> dict[str, Any]:
    parts = {key: load_source(root, names) for key, names in SOURCES.items()}
    operator = parts["operatorWorkbench"]
    workflow = parts["workflowPacket"]
    export = parts["reframeExportDesk"]
    proof = parts["proofControlRoom"]
    workflow_counts = workflow.get("counts") if isinstance(workflow.get("counts"), dict) else {}
    group_statuses = workflow_counts.get("countsByGroupStatus") if isinstance(workflow_counts.get("countsByGroupStatus"), dict) else {}
    counts = {
        "assets": count(operator, "assets") or count(export, "assets"),
        "assetGroups": count(operator, "assetGroups") or count(export, "groups"),
        "workflowAssets": count(workflow, "assets"),
        "workflowGroups": count(workflow, "groups"),
        "needsProxyGroups": int(group_statuses.get("needs-proxy") or 0),
        "proxyReadyGroups": int(group_statuses.get("proxy-ready") or 0),
        "companionGroups": int(group_statuses.get("has-low-res-companion") or 0),
        "reviewSourceGroups": int(group_statuses.get("review-source") or 0),
        "readyReframeGroups": count(operator, "readyReframeGroups") or count(export, "readyRecipeGroups") or count(proof, "readyGroupsCanContinue"),
        "readyRecipes": count(operator, "readyRecipes") or count(export, "readyRecipes") or count(proof, "readyRenderRecipesCanContinue"),
        "proofOutputsPresent": count(operator, "proofOutputsPresent") or count(proof, "proofOutputsPresent"),
        "proofOutputsMissing": count(operator, "proofOutputsMissing") or count(proof, "proofOutputsMissing"),
        "readyToRunProofRows": count(proof, "readyToRunProofRows"),
        "repairTickets": count(operator, "repairTickets") or count(export, "repairTickets") or count(proof, "repairTickets"),
        "repairTicketsNeedingSourceRecopy": count(operator, "repairTicketsNeedingSourceRecopy") or count(proof, "repairTicketsNeedingSourceRecopy"),
        "blockedMediaRepair": count(operator, "blockedMediaRepair") or count(export, "blockedMediaRepair") or count(proof, "blockedMediaRepair"),
        "damagedAssets": count(operator, "damagedAssets") or count(export, "damagedAssets") or count(proof, "damagedAssets"),
        "exportsCreated": count(operator, "exportsCreated") or count(export, "exportsCreated"),
        "rendererCommandsExecuted": count(operator, "rendererCommandsExecuted") or count(proof, "rendererCommandsExecuted"),
        "originalsMutated": count(operator, "originalsMutated") or count(export, "originalsMutated") or count(proof, "originalsMutated"),
    }
    status, label, plain = status_from(counts, parts)
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": status,
        "statusLabel": label,
        "plainEnglish": plain,
        "studio360Root": str(root),
        "counts": counts,
        "sourceArtifacts": source_summary(parts),
        "nextActions": build_actions(parts, counts),
        "humanAsk": "Review repair blockers first, continue proof/reframe review where safe, and do not run full render/export until renderer preflight and explicit human approval are captured.",
        "nextSafestAction": "Open Studio360 Start Here, then choose either repair status, next source card, proof control room, or reframe/export desk based on the current status pill.",
        "truth": "Studio360 Start Here only. It reads local evidence and writes a local orientation packet; it does not proxy, repair, render, export, upload, publish, schedule, mutate originals, overwrite versions, or create receipt truth.",
        "originalsMutated": False,
        "metadataChanged": False,
        "proxiesCreated": False,
        "repairsExecuted": False,
        "rendererCommandsExecuted": False,
        "exportsCreated": False,
        "externalUpload": False,
        "externalPublishing": False,
        "receiptTruthCreated": False,
    }


def render_html(payload: dict[str, Any]) -> str:
    counts = payload["counts"]
    cards = "\n".join(
        f"""
        <article class="card">
          <div class="pill">{html.escape(action['kind'])}</div>
          <h2>{html.escape(action['label'])}</h2>
          <p>{html.escape(action['why'])}</p>
          <code>{html.escape(action.get('command') or 'No command available')}</code>
        </article>
        """
        for action in payload["nextActions"]
    )
    sources = "\n".join(
        f"<tr><th>{html.escape(key)}</th><td>{html.escape(value.get('status') or 'missing')}</td><td>{html.escape(value.get('path') or '')}</td></tr>"
        for key, value in payload["sourceArtifacts"].items()
    )
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Studio360 Start Here</title>
  <style>
    :root {{ color-scheme: dark; --bg:#101717; --panel:#182525; --ink:#f4ead0; --muted:#bcae8e; --leaf:#69d18b; --teal:#5cc8d6; --gold:#e0be55; --clay:#d0795f; --line:rgba(244,234,208,.16); }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; font-family:ui-rounded, "Avenir Next", system-ui, sans-serif; background:radial-gradient(circle at 12% 8%, rgba(92,200,214,.16), transparent 32rem), radial-gradient(circle at 90% 12%, rgba(224,190,85,.14), transparent 30rem), var(--bg); color:var(--ink); }}
    main {{ max-width:1220px; margin:auto; padding:44px 24px 72px; }}
    h1 {{ margin:0; font-size:clamp(2.8rem,6vw,5.6rem); line-height:.9; letter-spacing:-.06em; }}
    .deck {{ max-width:850px; color:var(--muted); font-size:1.1rem; line-height:1.62; }}
    .status {{ display:inline-flex; gap:.65rem; align-items:center; padding:10px 14px; border-radius:999px; background:rgba(255,255,255,.06); border:1px solid var(--line); font-weight:900; margin-bottom:20px; }}
    .dot {{ width:12px; height:12px; border-radius:50%; background:{'var(--clay)' if 'repair' in payload['status'] else 'var(--leaf)'}; box-shadow:0 0 0 5px rgba(224,190,85,.12); }}
    .stats,.grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(230px,1fr)); gap:14px; margin-top:26px; }}
    .stat,.card,.truth {{ background:rgba(24,37,37,.9); border:1px solid var(--line); border-radius:24px; padding:20px; box-shadow:0 18px 44px rgba(0,0,0,.18); }}
    .stat strong {{ display:block; font-size:2.2rem; letter-spacing:-.05em; }}
    .pill {{ display:inline-flex; padding:5px 9px; border-radius:999px; background:rgba(92,200,214,.12); color:var(--teal); text-transform:uppercase; font-size:.72rem; font-weight:900; letter-spacing:.08em; }}
    code {{ display:block; padding:12px; border-radius:14px; background:rgba(0,0,0,.25); color:var(--muted); overflow-wrap:anywhere; }}
    table {{ width:100%; border-collapse:collapse; margin-top:18px; border-radius:18px; overflow:hidden; background:rgba(24,37,37,.78); }}
    th,td {{ padding:11px 12px; border-bottom:1px solid var(--line); text-align:left; vertical-align:top; }}
    th {{ width:250px; }}
  </style>
</head>
<body>
<main>
  <div class="status"><span class="dot"></span>{html.escape(payload['statusLabel'])}</div>
  <h1>Studio360 Start Here</h1>
  <p class="deck">{html.escape(payload['plainEnglish'])}</p>
  <section class="stats">
    <div class="stat"><div class="pill">assets</div><strong>{counts['assets']}</strong><span>{counts['assetGroups']} groups</span></div>
    <div class="stat"><div class="pill">reframe</div><strong>{counts['readyReframeGroups']}</strong><span>ready groups</span></div>
    <div class="stat"><div class="pill">recipes</div><strong>{counts['readyRecipes']}</strong><span>safe recipe rows</span></div>
    <div class="stat"><div class="pill">repair</div><strong>{counts['repairTickets']}</strong><span>repair ticket(s)</span></div>
    <div class="stat"><div class="pill">proofs</div><strong>{counts['proofOutputsPresent']}</strong><span>proof output(s) present</span></div>
    <div class="stat"><div class="pill">proxy</div><strong>{counts['needsProxyGroups']}</strong><span>needs-proxy group(s)</span></div>
  </section>
  <section class="truth"><h2>Boundary</h2><p>{html.escape(payload['truth'])}</p></section>
  <h2>Next safe actions</h2>
  <section class="grid">{cards}</section>
  <h2>Artifact map</h2>
  <table>{sources}</table>
</main>
</body>
</html>
"""


def render_markdown(payload: dict[str, Any]) -> str:
    counts = payload["counts"]
    lines = [
        "# Studio360 Start Here",
        "",
        f"Status: `{payload['status']}` ({payload['statusLabel']})",
        "",
        payload["plainEnglish"],
        "",
        "## Counts",
        f"- Assets: `{counts['assets']}`",
        f"- Asset groups: `{counts['assetGroups']}`",
        f"- Ready reframe groups: `{counts['readyReframeGroups']}`",
        f"- Ready recipes: `{counts['readyRecipes']}`",
        f"- Proof outputs present: `{counts['proofOutputsPresent']}`",
        f"- Repair tickets: `{counts['repairTickets']}`",
        f"- Needs-proxy groups: `{counts['needsProxyGroups']}`",
        "",
        "## Next safe actions",
    ]
    for action in payload["nextActions"]:
        lines += [
            f"- {action['label']}",
            f"  - kind: `{action['kind']}`",
            f"  - why: {action['why']}",
            f"  - command: `{action.get('command') or 'none'}`",
        ]
    lines += [
        "",
        "## Boundary",
        f"- {payload['truth']}",
    ]
    return "\n".join(lines).rstrip() + "\n"


def main() -> int:
    if len(sys.argv) > 1 and sys.argv[1] in {"-h", "--help"}:
        print(
            "Usage: build_studio360_start_here.py [studio360-root]\n\n"
            "Builds a local-only Studio360 Start Here packet from existing pointer artifacts.\n"
            "Default root: /Volumes/My Passport/Quipsly Media Workspace/Studio360\n\n"
            "Safety: reads local evidence and writes a versioned orientation packet only. "
            "It does not proxy, repair, render, export, upload, publish, schedule, "
            "delete, overwrite, mutate originals, or create receipt truth."
        )
        return 0

    if len(sys.argv) > 2:
        print("ERROR: expected zero or one argument: [studio360-root]", file=sys.stderr)
        return 2

    root = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_ROOT
    payload = build_payload(root)
    out_dir = root / "StartHere" / stamp()
    out_dir.mkdir(parents=True, exist_ok=True)
    json_path = out_dir / "studio360-start-here.json"
    html_path = out_dir / "index.html"
    markdown_path = out_dir / "START-HERE-studio360.md"
    payload.update({"sessionDir": str(out_dir), "jsonPath": str(json_path), "htmlPath": str(html_path), "markdownPath": str(markdown_path)})
    write_json(json_path, payload)
    html_path.write_text(render_html(payload), encoding="utf-8")
    markdown_path.write_text(render_markdown(payload), encoding="utf-8")
    pointer = {
        "schema": "quipsly.studio360.startHerePointer.v1",
        "updatedAt": payload["generatedAt"],
        "status": payload["status"],
        "statusLabel": payload["statusLabel"],
        "jsonPath": str(json_path),
        "htmlPath": str(html_path),
        "markdownPath": str(markdown_path),
        "counts": payload["counts"],
        "firstSafeAction": {"label": "Open Studio360 Start Here", "command": f"open {shell_quote(str(html_path))}", "path": str(html_path), "safety": "Opens local Studio360 orientation only. No media work is executed."},
        "originalsMutated": False,
        "metadataChanged": False,
        "exportsCreated": False,
        "externalUpload": False,
        "externalPublishing": False,
    }
    write_json(root / LATEST_POINTER, pointer)
    print(json.dumps({
        "status": payload["status"],
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "counts": payload["counts"],
        "originalsMutated": False,
        "exportsCreated": False,
        "externalUpload": False,
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
