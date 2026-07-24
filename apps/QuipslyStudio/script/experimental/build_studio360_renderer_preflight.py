#!/usr/bin/env python3
"""Build a Studio360 renderer preflight and dry-run command packet.

This is intentionally dry-run only. It inspects available local render tools and
candidate source paths, then writes versioned proof/full render command intent
for 16:9 and 9:16 candidates. It does not execute ffmpeg, create media exports,
transcode, upload, publish, delete, overwrite, repair, park, or mutate source
media.
"""

from __future__ import annotations

import argparse
import csv
import html
import json
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/Studio360")
SCHEMA = "quipsly.studio360.renderer-preflight.v1"
LATEST_POINTER = "latest-360-renderer-preflight.json"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-360-renderer-preflight")


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


def shell_quote(value: Any) -> str:
    text = str(value or "")
    return "'" + text.replace("'", "'\\''") + "'"


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


def command_available(name: str) -> str:
    found = shutil.which(name)
    if found:
        return found
    for candidate in (
        Path("/opt/homebrew/bin") / name,
        Path("/usr/local/bin") / name,
        Path("/usr/bin") / name,
        Path("/bin") / name,
    ):
        if candidate.exists() and candidate.is_file():
            return str(candidate)
    return ""


def ffmpeg_has_v360(ffmpeg_path: str) -> bool:
    if not ffmpeg_path:
        return False
    try:
        result = subprocess.run([ffmpeg_path, "-hide_banner", "-filters"], text=True, capture_output=True, timeout=8, check=False)
    except Exception:
        return False
    return " v360 " in result.stdout or " v360" in result.stdout


def find_insta360_apps() -> list[str]:
    root = Path("/Applications")
    if not root.exists():
        return []
    matches = []
    for path in root.glob("*Insta*360*.app"):
        matches.append(str(path))
    for path in root.glob("*360*Studio*.app"):
        value = str(path)
        if value not in matches:
            matches.append(value)
    return sorted(matches)


def output_size(aspect: str) -> tuple[int, int, float, float]:
    if aspect == "9:16":
        return 1080, 1920, 72.0, 128.0
    return 1920, 1080, 82.0, 46.0


def build_ffmpeg_command(ffmpeg_path: str, source: str, output: str, aspect: str, proof_seconds: int | None = None) -> str:
    width, height, h_fov, v_fov = output_size(aspect)
    vf = f"v360=input=equirect:output=flat:w={width}:h={height}:yaw=0:pitch=0:roll=0:h_fov={h_fov}:v_fov={v_fov},format=yuv420p"
    out_dir = str(Path(output).parent)
    parts = [
        "mkdir", "-p", shell_quote(out_dir), "&&",
        shell_quote(ffmpeg_path), "-hide_banner", "-n",
    ]
    if proof_seconds:
        parts.extend(["-t", str(proof_seconds)])
    parts.extend([
        "-i", shell_quote(source),
        "-map", "0:v:0", "-map", "0:a?",
        "-vf", shell_quote(vf),
        "-c:v", "libx264", "-preset", "medium", "-crf", "20",
        "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
        shell_quote(output),
    ])
    return " ".join(parts)


def proof_receipt_command(candidate_id: Any) -> str:
    selector = str(candidate_id or "first").strip() or "first"
    return f"./script/agentctl.sh studio360-proof-render {shell_quote(selector)}"


def renderer_truth_contract() -> list[str]:
    return [
        "This preflight prepares renderer intent only; it does not execute ffmpeg.",
        "Proof commands are the first safe renderer step because they create small evidence clips before expensive full exports.",
        "Full render commands are not approval; they are versioned intent that should wait for proof review.",
        "Existing output paths are blockers, not overwrite prompts.",
        "Renderer output is still local readiness, not external publication or platform receipt truth.",
    ]


def row_human_ask(status: str, blockers: list[str]) -> str:
    if status == "dry-run-ready":
        return "If this candidate matters, run or review one short proof first; do not jump straight to the full export."
    return f"Resolve blocker(s) before rendering: {', '.join(blockers) or 'unknown blocker'}."


def row_agent_work(status: str) -> str:
    if status == "dry-run-ready":
        return "Prepare one-proof review notes, confirm source/output paths, and keep full render commands parked until proof review passes."
    return "Summarize missing tools/sources/output conflicts and prepare the smallest safe repair task; do not render."


def candidate_source(row: dict[str, Any], prefer_review_proxy: bool) -> str:
    if prefer_review_proxy and row.get("reviewSourcePath"):
        return str(row.get("reviewSourcePath") or "")
    return str(row.get("futureRenderSourcePath") or row.get("reviewSourcePath") or "")


def build_rows(candidate_packet: dict[str, Any], tools: dict[str, Any], proof_seconds: int, limit: int) -> list[dict[str, Any]]:
    ffmpeg_path = str(tools.get("ffmpeg") or "")
    has_v360 = bool(tools.get("ffmpegV360"))
    rows: list[dict[str, Any]] = []
    source_rows = candidate_packet.get("candidateRows") if isinstance(candidate_packet.get("candidateRows"), list) else []
    if limit > 0:
        source_rows = source_rows[:limit]
    for candidate in source_rows:
        if not isinstance(candidate, dict):
            continue
        aspect = str(candidate.get("aspect") or "")
        full_source = candidate_source(candidate, prefer_review_proxy=False)
        proof_source = candidate_source(candidate, prefer_review_proxy=True)
        output_path = str(candidate.get("proposedOutputPath") or "")
        proof_output = str(Path(output_path).with_name(Path(output_path).stem + f"-proof{proof_seconds}s" + Path(output_path).suffix)) if output_path else ""
        full_exists = Path(full_source).exists() if full_source else False
        proof_exists = Path(proof_source).exists() if proof_source else False
        output_exists = Path(output_path).exists() if output_path else False
        blockers: list[str] = []
        if not ffmpeg_path:
            blockers.append("ffmpeg missing")
        if not has_v360:
            blockers.append("ffmpeg v360 filter missing")
        if not proof_exists:
            blockers.append("proof/review source missing")
        if not full_exists:
            blockers.append("future render source missing")
        if output_exists:
            blockers.append("proposed output already exists; choose next version")
        status = "dry-run-ready" if not blockers else "blocked-preflight"
        rows.append({
            "candidateId": candidate.get("candidateId") or "",
            "groupKey": candidate.get("groupKey") or "",
            "recipeId": candidate.get("recipeId") or "",
            "aspect": aspect,
            "version": candidate.get("version") or "",
            "status": status,
            "blockers": blockers,
            "sequenceDurationSeconds": safe_float(candidate.get("sequenceDurationSeconds")),
            "proofSeconds": proof_seconds,
            "proofSourcePath": proof_source,
            "proofSourceExists": proof_exists,
            "futureRenderSourcePath": full_source,
            "futureRenderSourceExists": full_exists,
            "proposedProofOutputPath": proof_output,
            "proposedFullOutputPath": output_path,
            "proposedOutputAlreadyExists": output_exists,
            "proofDryRunCommand": build_ffmpeg_command(ffmpeg_path, proof_source, proof_output, aspect, proof_seconds) if ffmpeg_path and proof_source and proof_output else "",
            "fullDryRunCommand": build_ffmpeg_command(ffmpeg_path, full_source, output_path, aspect, None) if ffmpeg_path and full_source and output_path else "",
            "proofReceiptCommand": proof_receipt_command(candidate.get("candidateId") or candidate.get("recipeId") or candidate.get("groupKey") or aspect),
            "renderMode": "ffmpeg-v360-equirect-to-flat",
            "proofFirstPolicy": "Run one short proof and inspect it before any full render.",
            "humanAsk": row_human_ask(status, blockers),
            "agentSafeParallelWork": row_agent_work(status),
            "approvalGate": "Full render requires proof review plus explicit human approval for this candidate/version.",
            "rendererValidated": False,
            "externalPublishing": False,
            "exportsCreated": False,
            "humanReviewRequiredBeforePublish": True,
            "nextSafestAction": "Run the proof command manually only after confirming this source is the right 360/equirect media; inspect the proof before full render.",
            "truth": "Renderer preflight row only. Commands are not executed here; no media export, upload, delete, overwrite, or source mutation occurred.",
        })
    return rows


def build_packet(root: Path, proof_seconds: int, limit: int) -> dict[str, Any]:
    candidate_pointer = load_json(root / "latest-360-export-candidate-queue.json")
    candidate_packet = load_json(Path(str(candidate_pointer.get("jsonPath") or ""))) if candidate_pointer.get("jsonPath") else {}
    ffmpeg_path = command_available("ffmpeg")
    ffprobe_path = command_available("ffprobe")
    tools = {
        "ffmpeg": ffmpeg_path,
        "ffprobe": ffprobe_path,
        "ffmpegV360": ffmpeg_has_v360(ffmpeg_path),
        "insta360Apps": find_insta360_apps(),
    }
    rows = build_rows(candidate_packet, tools, proof_seconds, limit)
    dry_ready = [row for row in rows if row.get("status") == "dry-run-ready"]
    blocked = [row for row in rows if row.get("status") != "dry-run-ready"]
    counts = {
        "candidateRowsInspected": len(rows),
        "dryRunReadyRows": len(dry_ready),
        "blockedRows": len(blocked),
        "proofCommandsPrepared": sum(1 for row in dry_ready if row.get("proofDryRunCommand")),
        "fullCommandsPrepared": sum(1 for row in dry_ready if row.get("fullDryRunCommand")),
        "renderedFilesPresent": sum(1 for row in rows if row.get("proposedOutputAlreadyExists")),
        "rendererCommandsExecuted": 0,
        "exportsCreated": 0,
        "originalsMutated": False,
        "externalPublishing": False,
    }
    if not candidate_packet:
        status = "needs-export-candidate-queue"
        next_action = "Generate the Studio360 export candidate queue before renderer preflight."
        human_ask = "Generate and inspect export candidates before thinking about renderer commands."
        agent_work = "Prepare candidate queue diagnostics and stop before renderer work."
    elif blocked and dry_ready:
        status = "renderer-preflight-ready-with-blockers"
        next_action = "Use the dry-run-ready proof commands for a tiny manual proof, while fixing blocked candidate source/tool issues separately."
        human_ask = "Choose one dry-run-ready candidate for a tiny proof, and route blocked candidates to repair/proxy/output conflict review."
        agent_work = "Rank proof-ready candidates, summarize blockers, and keep full render commands parked until proof review."
    elif dry_ready:
        status = "renderer-preflight-ready"
        next_action = "Run one proof command manually, inspect the output, then promote the renderer path only after proof review."
        human_ask = "Pick one candidate and validate a short proof before authorizing full exports."
        agent_work = "Prepare proof-review evidence and versioned export intent packets without executing renders."
    else:
        status = "renderer-preflight-blocked"
        next_action = "Resolve renderer/tool/source blockers before attempting any proof render."
        human_ask = "Fix tool/source/output blockers before any proof or full render work."
        agent_work = "Summarize blockers and prerequisites; do not execute renderer commands."
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "studio360Root": str(root),
        "status": status,
        "truth": "Studio360 renderer preflight only. It prepares ffmpeg/v360 dry-run commands and tool evidence without executing renders, transcoding, uploading, publishing, deleting, overwriting, repairing, parking, or mutating originals.",
        "rendererTruthContract": renderer_truth_contract(),
        "humanAsk": human_ask,
        "agentSafeParallelWork": agent_work,
        "reviewChecklist": [
            "Confirm ffmpeg and v360 support are available.",
            "Prefer proof source/proxy paths for small proof renders.",
            "Check proposed output paths do not already exist.",
            "Run one short proof before any full render.",
            "Record proof review evidence before promoting full export intent.",
        ],
        "tools": tools,
        "counts": counts,
        "preflightRows": rows,
        "blockedRows": blocked[:80],
        "candidateQueue": {
            "htmlPath": candidate_pointer.get("htmlPath") or "",
            "jsonPath": candidate_pointer.get("jsonPath") or "",
            "counts": candidate_pointer.get("counts") or {},
        },
        "firstSafeAction": {},
        "nextSafestAction": next_action,
        "safety": {
            "originalsMutated": False,
            "exportsCreated": False,
            "externalPublishing": False,
            "rendererCommandsExecuted": False,
            "sourceDeletes": False,
            "versionOverwrites": False,
        },
    }


def prepare_output_dir(root: Path) -> Path:
    base = root / "RendererPreflight" / stamp()
    candidate = base
    counter = 2
    while candidate.exists():
        candidate = Path(f"{base}-{counter}")
        counter += 1
    candidate.mkdir(parents=True, exist_ok=False)
    return candidate


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    fields = ["candidateId", "groupKey", "aspect", "status", "blockers", "proofSourceExists", "futureRenderSourceExists", "proposedProofOutputPath", "proposedFullOutputPath", "humanAsk", "agentSafeParallelWork", "approvalGate", "proofReceiptCommand", "proofDryRunCommand", "fullDryRunCommand"]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            writer.writerow({field: json.dumps(row.get(field)) if field == "blockers" else row.get(field, "") for field in fields})


def write_shell(path: Path, rows: list[dict[str, Any]]) -> None:
    lines = [
        "#!/usr/bin/env bash",
        "set -euo pipefail",
        "# Studio360 renderer dry-run commands. Generated for review only.",
        "# Nothing runs unless a human/agent intentionally executes a selected command below.",
        "",
    ]
    for row in rows:
        if row.get("status") != "dry-run-ready":
            continue
        lines.extend([
            f"# {row.get('candidateId')} proof",
            str(row.get("proofDryRunCommand") or ""),
            "",
            f"# {row.get('candidateId')} full",
            str(row.get("fullDryRunCommand") or ""),
            "",
        ])
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
    path.chmod(0o755)


def write_markdown(path: Path, packet: dict[str, Any]) -> None:
    counts = packet.get("counts") or {}
    tools = packet.get("tools") or {}
    lines = [
        "# Studio360 renderer preflight",
        "",
        f"Generated: `{packet.get('generatedAt')}`",
        "",
        str(packet.get("truth") or ""),
        "",
        "## Start here",
        "",
        f"- Human ask: {packet.get('humanAsk')}",
        f"- Agent-safe parallel work: {packet.get('agentSafeParallelWork')}",
        "",
        "## Renderer truth contract",
        "",
    ]
    for item in packet.get("rendererTruthContract") or []:
        lines.append(f"- {item}")
    lines.extend([
        "",
        "## Tools",
        "",
        f"- ffmpeg: `{tools.get('ffmpeg') or ''}`",
        f"- ffprobe: `{tools.get('ffprobe') or ''}`",
        f"- ffmpeg v360: `{tools.get('ffmpegV360')}`",
        f"- Insta360 apps: `{json.dumps(tools.get('insta360Apps') or [])}`",
        "",
        "## Counts",
        "",
    ])
    for key in ["candidateRowsInspected", "dryRunReadyRows", "blockedRows", "proofCommandsPrepared", "fullCommandsPrepared", "renderedFilesPresent", "rendererCommandsExecuted", "exportsCreated"]:
        lines.append(f"- `{key}`: `{counts.get(key, 0)}`")
    lines.extend(["", "## Next safest action", "", str(packet.get("nextSafestAction") or ""), "", "## First dry-run ready rows", ""])
    for row in [row for row in (packet.get("preflightRows") or []) if row.get("status") == "dry-run-ready"][:12]:
        lines.extend([
            f"### {row.get('candidateId')}",
            f"- Aspect: `{row.get('aspect')}`",
            f"- Proof source: `{row.get('proofSourcePath')}`",
            f"- Future render source: `{row.get('futureRenderSourcePath')}`",
            f"- Human ask: {row.get('humanAsk')}",
            f"- Agent-safe work: {row.get('agentSafeParallelWork')}",
            f"- Approval gate: {row.get('approvalGate')}",
            f"- Proof command: `{row.get('proofDryRunCommand')}`",
            f"- Proof receipt command: `{row.get('proofReceiptCommand')}`",
            f"- Full command: `{row.get('fullDryRunCommand')}`",
            "",
        ])
    lines.extend(["", "## Blocked rows", ""])
    for row in packet.get("blockedRows") or []:
        lines.extend([
            f"### {row.get('candidateId')}",
            f"- Blockers: `{json.dumps(row.get('blockers') or [])}`",
            f"- Human ask: {row.get('humanAsk')}",
            f"- Agent-safe work: {row.get('agentSafeParallelWork')}",
            f"- Proof source: `{row.get('proofSourcePath')}`",
            f"- Future render source: `{row.get('futureRenderSourcePath')}`",
            "",
        ])
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def write_html(path: Path, packet: dict[str, Any]) -> None:
    counts = packet.get("counts") or {}
    tools = packet.get("tools") or {}
    ready_cards = []
    blocked_cards = []
    for row in packet.get("preflightRows") or []:
        target = ready_cards if row.get("status") == "dry-run-ready" else blocked_cards
        target.append(f"""
        <article class="{esc(row.get('status'))}">
          <div class="topline"><span>{esc(row.get('aspect'))}</span><strong>{esc(row.get('candidateId'))}</strong></div>
          <h3>{esc(row.get('status'))}</h3>
          <p><strong>Human ask:</strong> {esc(row.get('humanAsk'))}</p>
          <p><strong>Agent-safe work:</strong> {esc(row.get('agentSafeParallelWork'))}</p>
          <p><strong>Gate:</strong> {esc(row.get('approvalGate'))}</p>
          <p>{esc(row.get('nextSafestAction'))}</p>
          <div class="chips"><span>{esc(row.get('proofSeconds'))}s proof</span><span>{esc(row.get('renderMode'))}</span><span>{esc(' / '.join(row.get('blockers') or []) or 'no blockers')}</span></div>
          <p class="path"><b>Proof source</b><br>{esc(row.get('proofSourcePath'))}</p>
          <p class="path"><b>Full source</b><br>{esc(row.get('futureRenderSourcePath'))}</p>
          <p class="path"><b>Proof output</b><br>{esc(row.get('proposedProofOutputPath'))}</p>
          <details open><summary>One proof receipt command</summary><pre>{esc(row.get('proofReceiptCommand'))}</pre></details>
          <details><summary>Dry-run commands</summary><pre>{esc(row.get('proofDryRunCommand'))}\n\n{esc(row.get('fullDryRunCommand'))}</pre></details>
        </article>
        """)
    html_text = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Studio360 Renderer Preflight</title>
  <style>
    :root {{ color-scheme:dark; --bg:#0f170f; --panel:#172516; --ink:#fff2d2; --muted:#cdbc99; --moss:#8fbd72; --water:#78cbd8; --gold:#e5c65a; --clay:#c97855; --line:rgba(255,242,210,.16); }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; color:var(--ink); font-family:Avenir Next, Helvetica Neue, sans-serif; background:radial-gradient(circle at 18% -8%, rgba(120,203,216,.2), transparent 36%), radial-gradient(circle at 90% 0%, rgba(143,189,114,.18), transparent 35%), linear-gradient(180deg,#172114,#060a06); }}
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
    section {{ border:1px solid var(--line); border-radius:30px; padding:22px; background:linear-gradient(180deg,rgba(23,37,22,.94),rgba(6,10,6,.97)); box-shadow:0 22px 58px rgba(0,0,0,.25); }}
    .grid {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(360px,1fr)); gap:14px; }}
    article {{ border:1px solid var(--line); border-radius:20px; padding:16px; background:rgba(0,0,0,.2); }}
    .dry-run-ready {{ border-color:rgba(143,189,114,.58); }}
    .blocked-preflight {{ border-color:rgba(201,120,85,.62); }}
    .topline {{ display:flex; justify-content:space-between; gap:12px; color:var(--gold); text-transform:uppercase; letter-spacing:.11em; font-size:11px; font-weight:950; }}
    .chips {{ display:flex; gap:8px; flex-wrap:wrap; margin:12px 0; }}
    .chips span {{ border:1px solid var(--line); border-radius:999px; padding:7px 9px; background:rgba(255,255,255,.055); font-size:12px; font-weight:850; }}
    .path, pre {{ overflow-wrap:anywhere; }}
    summary {{ cursor:pointer; color:var(--water); font-weight:850; }}
    pre {{ white-space:pre-wrap; color:var(--muted); background:rgba(0,0,0,.32); border-radius:14px; padding:12px; }}
  </style>
</head>
<body>
  <header>
    <div class="eyebrow">Studio360 Renderer Preflight</div>
    <h1>Dry-run the renderer before trusting the export.</h1>
    <p>{esc(packet.get('truth'))}</p>
    <p><strong>Next safest action:</strong> {esc(packet.get('nextSafestAction'))}</p>
    <p><strong>Human ask:</strong> {esc(packet.get('humanAsk'))}</p>
    <p><strong>Agent-safe parallel work:</strong> {esc(packet.get('agentSafeParallelWork'))}</p>
    <div class="summary">
      <div class="stat"><b>{esc(counts.get('candidateRowsInspected'))}</b><span>Inspected</span></div>
      <div class="stat"><b>{esc(counts.get('dryRunReadyRows'))}</b><span>Dry-run ready</span></div>
      <div class="stat"><b>{esc(counts.get('blockedRows'))}</b><span>Blocked</span></div>
      <div class="stat"><b>{esc(counts.get('proofCommandsPrepared'))}</b><span>Proof commands</span></div>
      <div class="stat"><b>{esc(counts.get('fullCommandsPrepared'))}</b><span>Full commands</span></div>
      <div class="stat"><b>{esc(counts.get('exportsCreated'))}</b><span>Exports</span></div>
    </div>
    <p><b>Tools:</b> ffmpeg `{esc(tools.get('ffmpeg'))}`, ffprobe `{esc(tools.get('ffprobe'))}`, v360 `{esc(tools.get('ffmpegV360'))}`, Insta360 apps `{esc(json.dumps(tools.get('insta360Apps') or []))}`</p>
  </header>
  <main>
    <section>
      <h2>Renderer truth contract</h2>
      <div class="grid">
        {''.join(f'<article><p>{esc(item)}</p></article>' for item in (packet.get('rendererTruthContract') or []))}
      </div>
      <h2>Proof-first checklist</h2>
      <div class="grid">
        {''.join(f'<article><p>{esc(item)}</p></article>' for item in (packet.get('reviewChecklist') or []))}
      </div>
    </section>
    <section><h2>Dry-run ready</h2><div class="grid">{''.join(ready_cards[:80]) or '<p>No dry-run-ready rows yet.</p>'}</div></section>
    <section><h2>Blocked preflight</h2><div class="grid">{''.join(blocked_cards[:80]) or '<p>No blocked renderer rows.</p>'}</div></section>
  </main>
</body>
</html>
"""
    path.write_text(html_text, encoding="utf-8")


def update_pointer(root: Path, out_dir: Path, packet: dict[str, Any], html_path: Path, json_path: Path, markdown_path: Path, csv_path: Path, shell_path: Path) -> None:
    first_ready = next((row for row in (packet.get("preflightRows") or []) if isinstance(row, dict) and row.get("status") == "dry-run-ready"), {})
    first_safe = {
        "label": "Open Studio360 renderer preflight",
        "command": f"open {shell_quote(str(html_path))}",
        "path": str(html_path),
        "safety": "Opens local renderer preflight evidence only. No command is executed and no media is rendered or changed.",
    }
    pointer_payload = {
        "schema": "quipsly.studio360.latest-renderer-preflight.v1",
        "updatedAt": iso_now(),
        "status": packet.get("status") or "renderer-preflight-ready",
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "shellPath": str(shell_path),
        "sessionDir": str(out_dir),
        "counts": packet.get("counts") or {},
        "tools": packet.get("tools") or {},
        "truth": packet.get("truth") or "",
        "rendererTruthContract": packet.get("rendererTruthContract") or [],
        "humanAsk": packet.get("humanAsk") or "",
        "agentSafeParallelWork": packet.get("agentSafeParallelWork") or "",
        "reviewChecklist": packet.get("reviewChecklist") or [],
        "nextSafestAction": packet.get("nextSafestAction") or "Open renderer preflight before any proof render.",
        "firstSafeAction": first_safe,
        "firstProofRenderCommand": first_ready.get("proofReceiptCommand") if isinstance(first_ready, dict) else "",
        "originalsMutated": False,
        "exportsCreated": False,
        "externalPublishing": False,
        "rendererCommandsExecuted": False,
    }
    write_json(root / LATEST_POINTER, pointer_payload)
    packet["firstSafeAction"] = first_safe


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a dry-run Studio360 renderer preflight packet.")
    parser.add_argument("studio360_root", nargs="?", default=str(DEFAULT_ROOT))
    parser.add_argument("--proof-seconds", type=int, default=10)
    parser.add_argument("--limit", type=int, default=152)
    args = parser.parse_args()
    root = Path(args.studio360_root)
    packet = build_packet(root, proof_seconds=args.proof_seconds, limit=args.limit)
    out_dir = prepare_output_dir(root)
    json_path = out_dir / "360-renderer-preflight.json"
    html_path = out_dir / "index.html"
    markdown_path = out_dir / "START-HERE-360-renderer-preflight.md"
    csv_path = out_dir / "360-renderer-preflight.csv"
    shell_path = out_dir / "360-renderer-dry-run-commands.sh"
    packet.update({
        "sessionDir": str(out_dir),
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "shellPath": str(shell_path),
    })
    update_pointer(root, out_dir, packet, html_path, json_path, markdown_path, csv_path, shell_path)
    write_json(json_path, packet)
    write_markdown(markdown_path, packet)
    write_csv(csv_path, packet.get("preflightRows") or [])
    write_shell(shell_path, packet.get("preflightRows") or [])
    write_html(html_path, packet)
    print(json.dumps({
        "status": packet.get("status") or "renderer-preflight-ready",
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "shellPath": str(shell_path),
        "counts": packet.get("counts"),
        "humanAsk": packet.get("humanAsk"),
        "agentSafeParallelWork": packet.get("agentSafeParallelWork"),
        "tools": packet.get("tools"),
        "originalsMutated": False,
        "exportsCreated": False,
        "externalPublishing": False,
        "rendererCommandsExecuted": False,
    }, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
