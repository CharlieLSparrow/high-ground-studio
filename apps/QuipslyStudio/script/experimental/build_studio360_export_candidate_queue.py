#!/usr/bin/env python3
"""Build a Studio360 export candidate queue from reframe recipes.

This is a metadata-only queue. It prepares exact candidate rows for future
16:9/9:16 derivative renders, but it does not render, transcode, upload,
publish, delete, overwrite, repair, park, or mutate source media. It is the
safe bridge between "recipes exist" and "a renderer may be run after review".
"""

from __future__ import annotations

import argparse
import csv
import html
import json
import re
import shlex
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/Studio360")
SCHEMA = "quipsly.studio360.export-candidate-queue.v1"
LATEST_POINTER = "latest-360-export-candidate-queue.json"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-360-export-candidates")


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
    return "'" + value.replace("'", "'\\''") + "'"


def command(parts: list[Any]) -> str:
    return " ".join(shlex.quote(str(part)) for part in parts)


def safe_int(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def safe_float(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def slug(value: Any) -> str:
    raw = str(value or "unknown").strip().lower()
    safe = re.sub(r"[^a-z0-9]+", "-", raw).strip("-")
    return safe or "unknown"


def pointer(root: Path, filename: str) -> dict[str, Any]:
    return load_json(root / filename)


def packet_from_pointer(pointer_payload: dict[str, Any]) -> dict[str, Any]:
    path_value = pointer_payload.get("jsonPath") or pointer_payload.get("packetPath") or pointer_payload.get("manifestPath") or ""
    return load_json(Path(str(path_value))) if path_value else {}


def open_action(label: str, path_value: Any, safety: str) -> dict[str, str]:
    value = str(path_value or "")
    return {
        "label": label,
        "command": command(["open", value]) if value else "",
        "path": value,
        "safety": safety,
    }


def existing_next_version(base_dir: Path) -> str:
    if not base_dir.exists():
        return "v001"
    max_seen = 0
    for child in base_dir.iterdir():
        if not child.is_dir():
            continue
        match = re.fullmatch(r"v(\d{3})", child.name)
        if match:
            max_seen = max(max_seen, int(match.group(1)))
    return f"v{max_seen + 1:03d}"


def source_assets_by_kind(group: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    by_kind: dict[str, list[dict[str, Any]]] = {}
    for asset in group.get("sourceAssets") or []:
        if not isinstance(asset, dict):
            continue
        by_kind.setdefault(str(asset.get("kind") or "unknown"), []).append(asset)
    return by_kind


def choose_future_render_source(group: dict[str, Any]) -> dict[str, Any]:
    by_kind = source_assets_by_kind(group)
    for kind in ["insta360-original-video", "video-export-or-source", "proxy", "insta360-low-res-companion"]:
        for asset in by_kind.get(kind, []):
            path = str(asset.get("sourcePath") or "")
            if path:
                return {
                    "kind": kind,
                    "path": path,
                    "assetId": asset.get("id") or "",
                    "probeError": asset.get("probeError") or "",
                    "truth": "Preferred future render source. This queue does not read or mutate the source file.",
                }
    review = group.get("reviewSource") if isinstance(group.get("reviewSource"), dict) else {}
    return {
        "kind": review.get("kind") or "missing-source",
        "path": review.get("path") or "",
        "assetId": review.get("assetId") or "",
        "probeError": review.get("probeError") or "",
        "truth": "Fallback render-source hint from review source only. Renderer must verify before use.",
    }


def path_exists(value: Any) -> bool:
    text = str(value or "")
    return bool(text and Path(text).exists())


def render_risk(review_source: dict[str, Any], future_source: dict[str, Any], output_path: Path) -> tuple[str, list[str]]:
    reasons: list[str] = []
    if not path_exists(review_source.get("path")):
        reasons.append("review/proof source path is missing")
    if not path_exists(future_source.get("path")):
        reasons.append("future render source path is missing")
    if output_path.exists():
        reasons.append("proposed output path already exists")
    if str(future_source.get("probeError") or "").strip():
        reasons.append("future render source has probe warning")
    if str(review_source.get("probeError") or "").strip():
        reasons.append("review/proof source has probe warning")
    if reasons:
        return "needs-preflight-attention", reasons
    return "proof-first-ready", []


def build_rows(reframe_packet: dict[str, Any], output_root: Path) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    ready_rows: list[dict[str, Any]] = []
    blocked_rows: list[dict[str, Any]] = []
    export_root = output_root / "PreparedExports"
    for group in reframe_packet.get("groups") or []:
        if not isinstance(group, dict):
            continue
        group_key = str(group.get("groupKey") or group.get("id") or "unknown")
        group_slug = slug(group_key)
        status = str(group.get("reframeStatus") or "needs-review")
        review_source = group.get("reviewSource") if isinstance(group.get("reviewSource"), dict) else {}
        future_source = choose_future_render_source(group)
        group_base = export_root / group_slug
        next_version = existing_next_version(group_base)
        recipes = [recipe for recipe in (group.get("recipes") or []) if isinstance(recipe, dict)]
        if status != "reframe-ready":
            blocked_rows.append({
                "groupKey": group_key,
                "groupId": group.get("id") or "",
                "status": status,
                "reason": group.get("nextSafestAction") or "Group is not ready for export candidate preparation.",
                "recipeCount": len(recipes),
                "damagedAssetCount": len(group.get("damagedAssets") or []) if isinstance(group.get("damagedAssets"), list) else 0,
                "reviewSourceKind": review_source.get("kind") or "",
                "reviewSourcePath": review_source.get("path") or "",
                "nextSafestAction": group.get("nextSafestAction") or "Resolve source/proxy/repair routing before preparing exports.",
                "truth": "Blocked row only. No source media or export output was changed.",
            })
            continue
        for recipe in recipes:
            aspect = str(recipe.get("outputAspect") or "unknown")
            recipe_status = str(recipe.get("status") or "")
            output_dir = group_base / next_version / aspect.replace(":", "x")
            output_name = f"studio360-{group_slug}-{aspect.replace(':', 'x')}-{next_version}.mp4"
            output_path = output_dir / output_name
            review_status = "candidate-ready" if recipe_status == "ready-for-reframe-review" else "recipe-needs-review"
            risk, risk_reasons = render_risk(review_source, future_source, output_path)
            proof_output_path = output_path.with_name(output_path.stem + "-proof10s" + output_path.suffix)
            ready_rows.append({
                "candidateId": f"{group_slug}-{aspect.replace(':', 'x')}-{next_version}",
                "groupKey": group_key,
                "groupId": group.get("id") or "",
                "recipeId": recipe.get("id") or "",
                "aspect": aspect,
                "version": next_version,
                "status": review_status,
                "sequenceDurationSeconds": safe_float(recipe.get("sequenceDurationSeconds") or group.get("durationSeconds")),
                "reviewSourceKind": review_source.get("kind") or "",
                "reviewSourcePath": review_source.get("path") or "",
                "reviewSourceExists": path_exists(review_source.get("path")),
                "futureRenderSourceKind": future_source.get("kind") or "",
                "futureRenderSourcePath": future_source.get("path") or "",
                "futureRenderSourceExists": path_exists(future_source.get("path")),
                "futureRenderSourceAssetId": future_source.get("assetId") or "",
                "outputDir": str(output_dir),
                "proposedOutputPath": str(output_path),
                "proposedProofOutputPath": str(proof_output_path),
                "keyframeCount": len(recipe.get("keyframes") or []) if isinstance(recipe.get("keyframes"), list) else 0,
                "renderCommandStatus": "not-generated-renderer-unvalidated",
                "renderRisk": risk,
                "renderRiskReasons": risk_reasons,
                "proofFirstGate": "Run and review a short proof before any full render.",
                "fullRenderGate": "Full render waits for proof review and explicit human approval for this candidate/version.",
                "publicationReceiptStatus": "not-published-no-external-receipt",
                "renderedFileExists": output_path.exists(),
                "humanReviewRequiredBeforePublish": True,
                "externalPublishing": False,
                "nextSafestAction": "Review the recipe in Studio, verify framing/keyframes against the proxy/source, then run a proven renderer into this versioned output path.",
                "truth": "Export candidate metadata only. No file was rendered, uploaded, published, deleted, overwritten, or source-mutated.",
            })
    return ready_rows, blocked_rows


def build_packet(root: Path) -> dict[str, Any]:
    reframe_pointer = pointer(root, "latest-360-reframe-packet.json")
    reframe_export_pointer = pointer(root, "latest-360-reframe-export-desk.json")
    source_pointer = pointer(root, "latest-360-source-desk.json")
    repair_pointer = pointer(root, "latest-360-repair-preflight.json")
    repair_status_pointer = pointer(root, "latest-360-repair-status.json")
    reframe_packet = packet_from_pointer(reframe_pointer)
    ready_rows, blocked_rows = build_rows(reframe_packet, root)
    by_aspect: dict[str, int] = {}
    for row in ready_rows:
        by_aspect[str(row.get("aspect") or "unknown")] = by_aspect.get(str(row.get("aspect") or "unknown"), 0) + 1
    counts = {
        "candidateRows": len(ready_rows),
        "blockedGroups": len(blocked_rows),
        "readyGroups": len({row.get("groupKey") for row in ready_rows}),
        "aspects": by_aspect,
        "renderedFilesPresent": sum(1 for row in ready_rows if row.get("renderedFileExists")),
        "proofFirstReadyRows": sum(1 for row in ready_rows if row.get("renderRisk") == "proof-first-ready"),
        "needsPreflightAttentionRows": sum(1 for row in ready_rows if row.get("renderRisk") != "proof-first-ready"),
        "missingReviewSources": sum(1 for row in ready_rows if not row.get("reviewSourceExists")),
        "missingFutureRenderSources": sum(1 for row in ready_rows if not row.get("futureRenderSourceExists")),
        "rendererCommandsGenerated": 0,
        "exportsCreated": 0,
        "originalsMutated": False,
        "externalPublishing": False,
    }
    if not reframe_packet:
        status = "needs-reframe-packet"
        next_action = "Generate the Studio360 reframe packet before preparing export candidates."
    elif blocked_rows:
        status = "candidate-queue-ready-with-blockers"
        next_action = "Use ready candidates for review/export prep, but resolve repair blockers before claiming the 360 lane is fully export-ready."
    elif ready_rows:
        status = "candidate-queue-ready"
        next_action = "Review ready 16:9/9:16 candidates, then run only a proven renderer into versioned output paths."
    else:
        status = "no-ready-candidates"
        next_action = "Open reframe/export desk and resolve source/proxy/repair routing before candidate exports."
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "studio360Root": str(root),
        "status": status,
        "truth": "Studio360 export candidate queue only. It prepares versioned local output intent from reframe recipes without rendering, transcoding, uploading, publishing, deleting, overwriting, repairing, parking, or mutating originals.",
        "counts": counts,
        "candidateRows": ready_rows,
        "blockedRows": blocked_rows,
        "sourcePointers": {
            "reframePacketHtml": reframe_pointer.get("htmlPath") or "",
            "reframePacketJson": reframe_pointer.get("jsonPath") or "",
            "reframeExportDeskHtml": reframe_export_pointer.get("htmlPath") or "",
            "reframeExportDeskJson": reframe_export_pointer.get("jsonPath") or "",
            "sourceDeskHtml": source_pointer.get("htmlPath") or "",
            "sourceDeskJson": source_pointer.get("jsonPath") or "",
            "repairPreflightHtml": repair_pointer.get("htmlPath") or "",
            "repairPreflightJson": repair_pointer.get("jsonPath") or "",
            "repairStatusHtml": repair_status_pointer.get("htmlPath") or "",
            "repairStatusJson": repair_status_pointer.get("jsonPath") or "",
        },
        "firstSafeAction": {},
        "nextSafestAction": next_action,
        "safety": {
            "originalsMutated": False,
            "exportsCreated": False,
            "externalPublishing": False,
            "rendererCommandsGenerated": False,
            "sourceDeletes": False,
            "versionOverwrites": False,
        },
    }


def prepare_output_dir(root: Path) -> Path:
    base = root / "ExportCandidateQueues" / stamp()
    candidate = base
    counter = 2
    while candidate.exists():
        candidate = Path(f"{base}-{counter}")
        counter += 1
    candidate.mkdir(parents=True, exist_ok=False)
    return candidate


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    fields = ["candidateId", "groupKey", "recipeId", "aspect", "version", "status", "renderRisk", "renderRiskReasons", "sequenceDurationSeconds", "reviewSourceKind", "reviewSourceExists", "futureRenderSourceKind", "futureRenderSourceExists", "proposedProofOutputPath", "proposedOutputPath", "proofFirstGate", "fullRenderGate", "publicationReceiptStatus", "nextSafestAction"]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            writer.writerow({field: json.dumps(row.get(field)) if field == "renderRiskReasons" else row.get(field, "") for field in fields})


def write_blocked_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    fields = ["groupKey", "status", "reason", "recipeCount", "damagedAssetCount", "reviewSourceKind", "reviewSourcePath", "nextSafestAction"]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            writer.writerow({field: row.get(field, "") for field in fields})


def write_markdown(path: Path, packet: dict[str, Any]) -> None:
    counts = packet.get("counts") or {}
    lines = [
        "# Studio360 export candidate queue",
        "",
        f"Generated: `{packet.get('generatedAt')}`",
        "",
        str(packet.get("truth") or ""),
        "",
        "## Counts",
        "",
        f"- Candidate rows: `{counts.get('candidateRows', 0)}`",
        f"- Ready groups: `{counts.get('readyGroups', 0)}`",
        f"- Blocked groups: `{counts.get('blockedGroups', 0)}`",
        f"- Aspects: `{json.dumps(counts.get('aspects') or {}, sort_keys=True)}`",
        f"- Rendered files present: `{counts.get('renderedFilesPresent', 0)}`",
        f"- Proof-first ready rows: `{counts.get('proofFirstReadyRows', 0)}`",
        f"- Needs preflight attention rows: `{counts.get('needsPreflightAttentionRows', 0)}`",
        f"- Missing review/proof sources: `{counts.get('missingReviewSources', 0)}`",
        f"- Missing future render sources: `{counts.get('missingFutureRenderSources', 0)}`",
        f"- Renderer commands generated: `{counts.get('rendererCommandsGenerated', 0)}`",
        f"- Exports created: `{counts.get('exportsCreated', 0)}`",
        "",
        "## Next safest action",
        "",
        str(packet.get("nextSafestAction") or ""),
        "",
        "## First candidates",
        "",
    ]
    for row in (packet.get("candidateRows") or [])[:32]:
        lines.extend([
            f"### {row.get('candidateId')}",
            f"- Aspect: `{row.get('aspect')}`",
            f"- Source group: `{row.get('groupKey')}`",
            f"- Review source: `{row.get('reviewSourceKind')}` `{row.get('reviewSourcePath')}`",
            f"- Future render source: `{row.get('futureRenderSourceKind')}` `{row.get('futureRenderSourcePath')}`",
            f"- Render risk: `{row.get('renderRisk')}` `{json.dumps(row.get('renderRiskReasons') or [])}`",
            f"- Proof output: `{row.get('proposedProofOutputPath')}`",
            f"- Proposed output: `{row.get('proposedOutputPath')}`",
            f"- Gate: {row.get('proofFirstGate')} {row.get('fullRenderGate')}",
            f"- Next: {row.get('nextSafestAction')}",
            "",
        ])
    lines.extend(["", "## Blocked groups", ""])
    for row in (packet.get("blockedRows") or [])[:24]:
        lines.extend([
            f"### {row.get('groupKey')} - {row.get('status')}",
            f"- Reason: {row.get('reason')}",
            f"- Next: {row.get('nextSafestAction')}",
            "",
        ])
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def write_html(path: Path, packet: dict[str, Any]) -> None:
    counts = packet.get("counts") or {}
    candidate_html = []
    for row in (packet.get("candidateRows") or [])[:160]:
        candidate_html.append(f"""
        <article class="candidate">
          <div class="topline"><span>{esc(row.get('aspect'))}</span><strong>{esc(row.get('candidateId'))}</strong></div>
          <h3>{esc(row.get('groupKey'))}</h3>
          <p>{esc(row.get('nextSafestAction'))}</p>
          <div class="chips"><span>{esc(round(safe_float(row.get('sequenceDurationSeconds')), 1))}s</span><span>{esc(row.get('version'))}</span><span>{esc(row.get('renderRisk'))}</span><span>{esc(row.get('renderCommandStatus'))}</span></div>
          <p class="path"><b>Review</b> {esc(row.get('reviewSourceKind'))}<br>{esc(row.get('reviewSourcePath'))}</p>
          <p class="path"><b>Future render</b> {esc(row.get('futureRenderSourceKind'))}<br>{esc(row.get('futureRenderSourcePath'))}</p>
          <p class="path"><b>Proof gate</b><br>{esc(row.get('proofFirstGate'))}</p>
          <p class="path"><b>Full render gate</b><br>{esc(row.get('fullRenderGate'))}</p>
          <p class="path"><b>Proof intent</b><br>{esc(row.get('proposedProofOutputPath'))}</p>
          <p class="path"><b>Output intent</b><br>{esc(row.get('proposedOutputPath'))}</p>
          <details><summary>Candidate JSON</summary><pre>{esc(json.dumps(row, indent=2))}</pre></details>
        </article>
        """)
    blocked_html = []
    for row in packet.get("blockedRows") or []:
        blocked_html.append(f"""
        <article class="blocked">
          <div class="topline"><span>{esc(row.get('status'))}</span><strong>{esc(row.get('groupKey'))}</strong></div>
          <h3>Blocked before export prep</h3>
          <p>{esc(row.get('reason'))}</p>
          <p><strong>Next:</strong> {esc(row.get('nextSafestAction'))}</p>
          <details><summary>Blocked JSON</summary><pre>{esc(json.dumps(row, indent=2))}</pre></details>
        </article>
        """)
    html_text = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Studio360 Export Candidate Queue</title>
  <style>
    :root {{ color-scheme:dark; --bg:#10170f; --panel:#172515; --ink:#fff2d4; --muted:#cbbc99; --moss:#8fbd72; --water:#78cbd8; --gold:#e5c65a; --clay:#c97855; --line:rgba(255,242,212,.16); }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; color:var(--ink); font-family:Avenir Next, Helvetica Neue, sans-serif; background:radial-gradient(circle at 20% -10%, rgba(120,203,216,.2), transparent 36%), radial-gradient(circle at 90% 0%, rgba(143,189,114,.18), transparent 35%), linear-gradient(180deg,#172214,#070a06); }}
    header {{ padding:48px clamp(20px,5vw,84px); border-bottom:1px solid var(--line); }}
    .eyebrow {{ color:var(--gold); text-transform:uppercase; letter-spacing:.24em; font-size:12px; font-weight:950; }}
    h1 {{ max-width:1080px; margin:12px 0; font-size:clamp(42px,7vw,88px); line-height:.9; letter-spacing:-.05em; }}
    h2 {{ margin:0 0 16px; color:var(--gold); }}
    h3 {{ margin:8px 0; }}
    p {{ color:var(--muted); line-height:1.45; }}
    header p {{ max-width:980px; font-size:18px; }}
    .summary {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:12px; margin-top:24px; }}
    .stat {{ border:1px solid var(--line); border-radius:22px; padding:16px; background:rgba(255,255,255,.055); }}
    .stat b {{ display:block; font-size:32px; }}
    .stat span {{ color:var(--muted); text-transform:uppercase; letter-spacing:.12em; font-size:11px; font-weight:900; }}
    main {{ padding:30px clamp(16px,4vw,58px) 76px; display:grid; gap:22px; }}
    section {{ border:1px solid var(--line); border-radius:30px; padding:22px; background:linear-gradient(180deg,rgba(23,37,21,.94),rgba(7,10,6,.97)); box-shadow:0 22px 58px rgba(0,0,0,.25); }}
    .grid {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(340px,1fr)); gap:14px; }}
    article {{ border:1px solid var(--line); border-radius:20px; padding:16px; background:rgba(0,0,0,.2); }}
    .candidate {{ border-color:rgba(143,189,114,.54); }}
    .blocked {{ border-color:rgba(201,120,85,.62); }}
    .topline {{ display:flex; justify-content:space-between; gap:12px; color:var(--gold); text-transform:uppercase; letter-spacing:.11em; font-size:11px; font-weight:950; }}
    .chips {{ display:flex; gap:8px; flex-wrap:wrap; margin:12px 0; }}
    .chips span {{ border:1px solid var(--line); border-radius:999px; padding:7px 9px; background:rgba(255,255,255,.055); font-size:12px; font-weight:850; }}
    .path {{ overflow-wrap:anywhere; font-size:12px; }}
    summary {{ cursor:pointer; color:var(--water); font-weight:850; }}
    pre {{ white-space:pre-wrap; overflow-wrap:anywhere; color:var(--muted); background:rgba(0,0,0,.32); border-radius:14px; padding:12px; }}
  </style>
</head>
<body>
  <header>
    <div class="eyebrow">Studio360 Export Candidate Queue</div>
    <h1>Version the intention before rendering the derivative.</h1>
    <p>{esc(packet.get('truth'))}</p>
    <p><strong>Next safest action:</strong> {esc(packet.get('nextSafestAction'))}</p>
    <div class="summary">
      <div class="stat"><b>{esc(counts.get('candidateRows'))}</b><span>Candidates</span></div>
      <div class="stat"><b>{esc(counts.get('readyGroups'))}</b><span>Ready groups</span></div>
      <div class="stat"><b>{esc(counts.get('blockedGroups'))}</b><span>Blocked groups</span></div>
      <div class="stat"><b>{esc((counts.get('aspects') or {}).get('16:9', 0))}</b><span>16:9 rows</span></div>
      <div class="stat"><b>{esc((counts.get('aspects') or {}).get('9:16', 0))}</b><span>9:16 rows</span></div>
      <div class="stat"><b>{esc(counts.get('renderedFilesPresent'))}</b><span>Rendered files</span></div>
      <div class="stat"><b>{esc(counts.get('proofFirstReadyRows'))}</b><span>Proof-first ready</span></div>
      <div class="stat"><b>{esc(counts.get('needsPreflightAttentionRows'))}</b><span>Needs preflight</span></div>
      <div class="stat"><b>{esc(counts.get('exportsCreated'))}</b><span>Exports created</span></div>
    </div>
  </header>
  <main>
    <section><h2>Ready candidates</h2><div class="grid">{''.join(candidate_html) or '<p>No export candidates yet.</p>'}</div></section>
    <section><h2>Blocked before export prep</h2><div class="grid">{''.join(blocked_html) or '<p>No blocked groups in this queue.</p>'}</div></section>
    <section><h2>Source pointers</h2><pre>{esc(json.dumps(packet.get('sourcePointers') or {}, indent=2))}</pre></section>
  </main>
</body>
</html>
"""
    path.write_text(html_text, encoding="utf-8")


def update_pointer(root: Path, out_dir: Path, packet: dict[str, Any], html_path: Path, json_path: Path, markdown_path: Path, csv_path: Path, blocked_csv_path: Path) -> None:
    first_safe = open_action(
        "Open Studio360 export candidate queue",
        html_path,
        "Opens local candidate evidence only. No render, upload, repair, delete, overwrite, publication, or source mutation occurs.",
    )
    pointer_payload = {
        "schema": "quipsly.studio360.latest-export-candidate-queue.v1",
        "updatedAt": iso_now(),
        "status": packet.get("status") or "candidate-queue-ready",
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "blockedCsvPath": str(blocked_csv_path),
        "sessionDir": str(out_dir),
        "counts": packet.get("counts") or {},
        "humanAsk": "Review 360 export candidates and blockers before running any renderer. Confirm aspect, framing intent, source route, and versioned output path.",
        "agentSafeParallelWork": "Codex may improve candidate notes, blocker explanations, dry-run renderer packets, and review summaries. Do not render, repair, publish, upload, delete, overwrite, mutate originals, or create receipt truth.",
        "truth": packet.get("truth") or "",
        "nextSafestAction": packet.get("nextSafestAction") or "Open Studio360 export candidate evidence before any render or publishing work.",
        "firstSafeAction": first_safe,
        "sourcePointers": packet.get("sourcePointers") or {},
        "originalsMutated": False,
        "exportsCreated": False,
        "externalPublishing": False,
        "rendererCommandsGenerated": False,
    }
    write_json(root / LATEST_POINTER, pointer_payload)
    packet["firstSafeAction"] = first_safe


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a read-only Studio360 export candidate queue.")
    parser.add_argument("studio360_root", nargs="?", default=str(DEFAULT_ROOT))
    args = parser.parse_args()
    root = Path(args.studio360_root)
    packet = build_packet(root)
    out_dir = prepare_output_dir(root)
    json_path = out_dir / "360-export-candidate-queue.json"
    html_path = out_dir / "index.html"
    markdown_path = out_dir / "START-HERE-360-export-candidate-queue.md"
    csv_path = out_dir / "360-export-candidates.csv"
    blocked_csv_path = out_dir / "360-export-blockers.csv"
    packet.update({
        "sessionDir": str(out_dir),
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "blockedCsvPath": str(blocked_csv_path),
    })
    update_pointer(root, out_dir, packet, html_path, json_path, markdown_path, csv_path, blocked_csv_path)
    write_json(json_path, packet)
    write_markdown(markdown_path, packet)
    write_csv(csv_path, packet.get("candidateRows") or [])
    write_blocked_csv(blocked_csv_path, packet.get("blockedRows") or [])
    write_html(html_path, packet)
    print(json.dumps({
        "status": "ok",
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "blockedCsvPath": str(blocked_csv_path),
        "counts": packet.get("counts"),
        "originalsMutated": False,
        "exportsCreated": False,
        "externalPublishing": False,
        "rendererCommandsGenerated": False,
    }, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
