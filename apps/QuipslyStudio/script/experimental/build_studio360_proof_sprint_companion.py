#!/usr/bin/env python3
"""Build a Studio360 proof sprint companion.

This joins proof outputs, proof-next commands, reframe readiness, and repair
status into one review sprint. It does not execute ffmpeg, render full outputs,
mutate originals, publish, upload, or approve anything.
"""

from __future__ import annotations

import argparse
import datetime as dt
import html
import json
import shlex
from pathlib import Path
from typing import Any


DEFAULT_STUDIO360_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/Studio360")
LATEST_POINTER = "latest-360-proof-sprint-companion.json"


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def stamp() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d-%H%M%S-%f")


def load_json(path: Path) -> dict[str, Any]:
    try:
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def esc(value: Any) -> str:
    return html.escape(str(value or ""))


def shell_quote(value: str) -> str:
    return shlex.quote(value)


def pointer(root: Path, name: str) -> dict[str, Any]:
    return load_json(root / name)


def packet_from_pointer(pointer_payload: dict[str, Any]) -> dict[str, Any]:
    json_path = Path(str(pointer_payload.get("jsonPath") or ""))
    return load_json(json_path) if json_path else {}


def as_int(value: Any) -> int:
    try:
        return int(value or 0)
    except Exception:
        return 0


def proof_review_row(row: dict[str, Any], index: int) -> dict[str, Any]:
    return {
        "rank": index,
        "candidateId": row.get("candidateId") or row.get("entryId") or "",
        "groupKey": row.get("groupKey") or "",
        "aspect": row.get("aspect") or "",
        "status": row.get("status") or "",
        "outputPath": row.get("outputPath") or "",
        "outputExists": bool(row.get("outputExists")),
        "durationSeconds": row.get("durationSeconds") or 0,
        "width": row.get("width") or 0,
        "height": row.get("height") or 0,
        "audioCodec": row.get("audioCodec") or "",
        "videoCodec": row.get("videoCodec") or "",
        "openCommand": row.get("openCommand") or "",
        "reviewCommand": row.get("reviewCommand") or "",
        "nextSafestAction": row.get("nextSafestAction") or "Open and review this proof before any full render.",
    }


def proof_next_row(row: dict[str, Any], index: int) -> dict[str, Any]:
    return {
        "rank": index,
        "candidateId": row.get("candidateId") or "",
        "groupKey": row.get("groupKey") or "",
        "aspect": row.get("aspect") or "",
        "status": row.get("status") or "",
        "proofGate": row.get("proofGate") or "",
        "proofSeconds": row.get("proofSeconds") or 0,
        "proofSourceExists": bool(row.get("proofSourceExists")),
        "proofSourcePath": row.get("proofSourcePath") or row.get("futureRenderSourcePath") or "",
        "proposedProofOutputPath": row.get("proposedProofOutputPath") or "",
        "sequenceDurationSeconds": row.get("sequenceDurationSeconds") or 0,
        "proofReceiptCommand": row.get("proofReceiptCommand") or "",
        "proofDryRunCommand": row.get("proofDryRunCommand") or "",
        "humanReviewAsk": row.get("humanReviewAsk") or "Run a small proof only after confirming the source is correct.",
        "nextSafestAction": row.get("nextSafestAction") or "Render one proof, inspect it, then stop before full render approval.",
        "truth": row.get("truth") or "Proof-next row only. No render is executed by this companion.",
    }


def aspect_pair_rows(next_proofs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in next_proofs:
        key = str(row.get("groupKey") or "unknown")
        grouped.setdefault(key, []).append(row)
    pairs: list[dict[str, Any]] = []
    for group_key, rows in grouped.items():
        by_aspect = {str(row.get("aspect") or ""): row for row in rows}
        wide = by_aspect.get("16:9") or {}
        vertical = by_aspect.get("9:16") or {}
        has_pair = bool(wide and vertical)
        sample = wide or vertical or rows[0]
        pairs.append({
            "rank": len(pairs) + 1,
            "groupKey": group_key,
            "status": "paired-wide-vertical" if has_pair else "single-aspect-needs-pair",
            "has16x9": bool(wide),
            "has9x16": bool(vertical),
            "sequenceDurationSeconds": sample.get("sequenceDurationSeconds") or 0,
            "wideCandidateId": wide.get("candidateId") or "",
            "wideProofCommand": wide.get("proofReceiptCommand") or "",
            "wideOutput": wide.get("proposedProofOutputPath") or "",
            "verticalCandidateId": vertical.get("candidateId") or "",
            "verticalProofCommand": vertical.get("proofReceiptCommand") or "",
            "verticalOutput": vertical.get("proposedProofOutputPath") or "",
            "sourcePath": sample.get("proofSourcePath") or "",
            "nextSafestAction": (
                "Review or create both 16:9 and 9:16 short proofs for this source before full render planning."
                if has_pair
                else "Do not promote this source to full render planning until the missing aspect proof candidate is explained or generated."
            ),
            "truth": "Aspect pair row only. It pairs proof intent by source group and does not render, approve, upload, mutate originals, or create receipts.",
        })
    return pairs


def build_packet(root: Path, limit: int) -> dict[str, Any]:
    workflow_pointer = pointer(root, "latest-360-workflow-packet.json")
    reframe_pointer = pointer(root, "latest-360-reframe-packet.json")
    repair_pointer = pointer(root, "latest-360-repair-status.json")
    proof_review_pointer = pointer(root, "latest-360-proof-review-desk.json")
    proof_next_pointer = pointer(root, "latest-360-proof-next-brief.json")
    renderer_pointer = pointer(root, "latest-360-renderer-preflight.json")

    proof_review = packet_from_pointer(proof_review_pointer)
    proof_next = packet_from_pointer(proof_next_pointer)

    review_rows = proof_review.get("rows") if isinstance(proof_review.get("rows"), list) else []
    next_rows = proof_next.get("rows") if isinstance(proof_next.get("rows"), list) else []

    review = [proof_review_row(row, idx + 1) for idx, row in enumerate(review_rows[:limit])]
    next_proofs = [proof_next_row(row, idx + 1) for idx, row in enumerate(next_rows[:limit])]
    proof_pairs = aspect_pair_rows(next_proofs)

    workflow_counts = workflow_pointer.get("counts") if isinstance(workflow_pointer.get("counts"), dict) else {}
    reframe_counts = reframe_pointer.get("counts") if isinstance(reframe_pointer.get("counts"), dict) else {}
    repair_counts = repair_pointer.get("counts") if isinstance(repair_pointer.get("counts"), dict) else {}
    proof_review_counts = proof_review_pointer.get("counts") if isinstance(proof_review_pointer.get("counts"), dict) else {}
    proof_next_counts = proof_next_pointer.get("counts") if isinstance(proof_next_pointer.get("counts"), dict) else {}
    renderer_counts = renderer_pointer.get("counts") if isinstance(renderer_pointer.get("counts"), dict) else {}

    counts = {
        "proofReviewRows": len(review),
        "proofNextRows": len(next_proofs),
        "proofAspectPairs": len(proof_pairs),
        "pairedWideVerticalProofGroups": sum(1 for row in proof_pairs if row.get("status") == "paired-wide-vertical"),
        "proofOutputsPresent": as_int(proof_review_counts.get("outputsPresent")),
        "proofOutputsMissing": as_int(proof_review_counts.get("outputsMissing")),
        "readyToRunProofRows": as_int(proof_next_counts.get("readyToRunProofRows")),
        "reframeReady": as_int(reframe_counts.get("reframeReady")),
        "blockedMediaRepair": as_int(reframe_counts.get("blockedMediaRepair")),
        "blockedNeedsProxy": as_int(reframe_counts.get("blockedNeedsProxy")),
        "damagedAssets": as_int(reframe_counts.get("damagedAssets")),
        "assetGroups": as_int(workflow_counts.get("groups")),
        "assets": as_int(workflow_counts.get("assets")),
        "rendererDryRunReadyRows": as_int(renderer_counts.get("dryRunReadyRows")),
        "repairDecisionsWritten": bool(repair_counts.get("decisionsWritten")),
        "fullRenderCreated": False,
        "rendererCommandsExecuted": False,
        "externalPublishing": False,
        "originalsMutated": False,
        "versionsOverwritten": False,
    }
    render_gate = {
        "currentStage": "proof-review",
        "stageTruth": "Proof rows are short local evidence. They are not full render approval, publishing approval, upload truth, or receipt truth.",
        "readyForFullRender": (
            counts["proofOutputsPresent"] > 0
            and counts["readyToRunProofRows"] == 0
            and counts["blockedMediaRepair"] == 0
            and counts["blockedNeedsProxy"] == 0
            and counts["damagedAssets"] == 0
        ),
        "mustBeTrueBeforeFullRender": [
            "A reviewer has inspected the proof output for the intended aspect ratio.",
            "Framing/reframe recipe is acceptable: subject placement, horizon, crop, and motion are not distracting.",
            "Audio is present and appropriate for the target output.",
            "Source pairing/proxy routing is correct; no damaged or missing source is hidden by the proof.",
            "The full render target version is explicit and will not overwrite an older render.",
        ],
        "proofReviewChecklist": [
            "Does the horizon feel level or intentionally tilted?",
            "Is the subject framed well in both 16:9 and 9:16 when applicable?",
            "Does camera motion feel calm rather than seasick?",
            "Does crop/zoom avoid cutting off heads, hands, captions, or key action?",
            "Is the audio present, synced enough for review, and not accidentally silent?",
            "Does the proof use the expected source/proxy rather than a parked or mystery file?",
        ],
        "safeOutputs": [
            {
                "label": "Proof review notes",
                "means": "Human/agent observations about framing, horizon, motion, crop, and audio.",
                "mutates": "nothing",
            },
            {
                "label": "One short proof render",
                "means": "A 10-second validation render only when explicitly requested.",
                "mutates": "creates local proof output; originals remain untouched",
            },
            {
                "label": "Versioned full render plan",
                "means": "A dry-run plan for a later full render version after proof review passes.",
                "mutates": "nothing until approved and executed separately",
            },
        ],
        "doNotDo": [
            "Do not batch full-render because a source is merely reframe-ready.",
            "Do not hide damaged, parked, missing, or proxy-needed media behind successful proofs.",
            "Do not overwrite previous proof or render versions.",
            "Do not publish, upload, schedule, or create receipts from proof evidence.",
        ],
        "nextIfReady": "Prepare a versioned full-render plan for explicit approval.",
        "nextIfBlocked": "Inspect existing proofs and resolve proof-next/media repair blockers before full render planning.",
    }
    proof_sprint_loop = {
        "name": "One source, two proofs, then decide",
        "goal": "For each useful 360 source, keep the original whole, review the source/proxy truth, create or inspect one short 16:9 proof and one short 9:16 proof, then stop for review before full render.",
        "whyItExists": "360 footage is powerful but easy to misuse. Pairing wide and vertical proofs by source group prevents a good-looking single aspect from hiding bad crop, horizon, motion, or source-routing problems in the other aspect.",
        "keyboardRhythm": "Open proof row, watch 10 seconds, mark notes: G good, R reframe, H hold, S source mismatch. These are intended native shortcuts; this packet records the contract first.",
        "doneWhen": "A source group has reviewed proof evidence for the aspects we intend to publish, or a clear reason it is held/parked.",
        "doNotDo": [
            "Do not batch full-render from recipe readiness alone.",
            "Do not approve 16:9 and assume 9:16 is also fine.",
            "Do not hide damaged groups behind ready groups.",
            "Do not treat proof output as publication or full-render approval.",
        ],
        "agentUse": "Agents should summarize existing proof rows, pair source groups by aspect, identify the safest single next proof command, and record review notes without executing full renders.",
        "truth": "Proof loop contract only. It does not run renders, approve outputs, mutate originals, upload, schedule, publish, overwrite, delete, or create receipts.",
    }

    packet = {
        "schema": "quipsly.studio360.proof-sprint-companion.v1",
        "status": "studio360-proof-sprint-ready",
        "generatedAt": utc_now(),
        "studio360Root": str(root),
        "counts": counts,
        "humanAsk": (
            "Run one 360 proof sprint: review existing 10-second proof outputs, then choose at most one next proof command. "
            "Do not move to full renders until framing, horizon, crop, motion, and audio have been inspected."
        ),
        "nextSafestAction": "Open this proof sprint companion, review existing proofs first, then run only one 10-second proof receipt command if a next proof is warranted.",
        "firstSafeAction": {
            "label": "Open Studio360 proof sprint",
            "command": "",
            "safety": "Opens local proof guidance only. No render, full export, upload, publication, account mutation, overwrite, delete, or original mutation occurs.",
        },
        "sprintPlan": [
            "Inspect existing proof outputs before creating new ones.",
            "Use proof-next rows only for short 10-second validation renders.",
            "Treat reframe-ready as recipe readiness, not full render approval.",
            "Resolve or park damaged/blocked media before batch export.",
            "Keep full renders and external publishing behind explicit human approval.",
        ],
        "reviewRows": review,
        "nextProofRows": next_proofs,
        "aspectPairRows": proof_pairs,
        "proofSprintLoop": proof_sprint_loop,
        "renderGate": render_gate,
        "sourcePointers": {
            "workflowHtml": workflow_pointer.get("htmlPath") or "",
            "workflowJson": workflow_pointer.get("jsonPath") or workflow_pointer.get("packetPath") or "",
            "reframeHtml": reframe_pointer.get("htmlPath") or "",
            "reframeJson": reframe_pointer.get("jsonPath") or "",
            "repairStatusHtml": repair_pointer.get("htmlPath") or "",
            "repairStatusJson": repair_pointer.get("jsonPath") or "",
            "proofReviewHtml": proof_review_pointer.get("htmlPath") or "",
            "proofReviewJson": proof_review_pointer.get("jsonPath") or "",
            "proofNextHtml": proof_next_pointer.get("htmlPath") or "",
            "proofNextJson": proof_next_pointer.get("jsonPath") or "",
            "rendererPreflightHtml": renderer_pointer.get("htmlPath") or "",
            "rendererPreflightJson": renderer_pointer.get("jsonPath") or "",
        },
        "agentSafeParallelWork": (
            "Summarize proof evidence, compare proof rows, prepare manual inspection notes, or improve local packets. "
            "Do not execute proof/full render commands unless explicitly instructed."
        ),
        "truth": (
            "Studio360 proof sprint companion only. It reads local workflow, reframe, proof, renderer, and repair evidence; "
            "it does not run ffmpeg, render outputs, approve renders, mutate originals, upload, publish, schedule, overwrite, delete, or create receipt truth."
        ),
    }
    return packet


def render_review(row: dict[str, Any]) -> str:
    return f"""
    <article class="card proof">
      <div class="rank">#{esc(row.get('rank'))}</div>
      <h3>{esc(row.get('candidateId'))}</h3>
      <p class="pill">{esc(row.get('aspect'))} / {esc(row.get('status'))}</p>
      <p>{esc(row.get('width'))}x{esc(row.get('height'))}, {esc(row.get('durationSeconds'))}s, audio {esc(row.get('audioCodec'))}</p>
      <p><strong>Next:</strong> {esc(row.get('nextSafestAction'))}</p>
      <pre>{esc(json.dumps({"open": row.get("openCommand"), "review": row.get("reviewCommand"), "outputPath": row.get("outputPath")}, indent=2))}</pre>
    </article>
    """


def render_next(row: dict[str, Any]) -> str:
    return f"""
    <article class="card next">
      <div class="rank">#{esc(row.get('rank'))}</div>
      <h3>{esc(row.get('candidateId'))}</h3>
      <p class="pill">{esc(row.get('aspect'))} / {esc(row.get('status'))} / source exists {esc(row.get('proofSourceExists'))}</p>
      <p>{esc(row.get('humanReviewAsk'))}</p>
      <pre>{esc(json.dumps({"receiptCommand": row.get("proofReceiptCommand"), "dryRunCommand": row.get("proofDryRunCommand"), "source": row.get("proofSourcePath"), "output": row.get("proposedProofOutputPath")}, indent=2))}</pre>
      <p class="truth">{esc(row.get('truth'))}</p>
    </article>
    """


def render_pair(row: dict[str, Any]) -> str:
    return f"""
    <article class="card pair">
      <div class="rank">#{esc(row.get('rank'))}</div>
      <h3>{esc(row.get('groupKey'))}</h3>
      <p class="pill">{esc(row.get('status'))} · {esc(row.get('sequenceDurationSeconds'))}s source</p>
      <p><strong>16:9:</strong> {esc(row.get('wideCandidateId') or 'missing')}</p>
      <p><strong>9:16:</strong> {esc(row.get('verticalCandidateId') or 'missing')}</p>
      <p><strong>Next:</strong> {esc(row.get('nextSafestAction'))}</p>
      <pre>{esc(json.dumps({
        "source": row.get("sourcePath"),
        "wideProofCommand": row.get("wideProofCommand"),
        "wideOutput": row.get("wideOutput"),
        "verticalProofCommand": row.get("verticalProofCommand"),
        "verticalOutput": row.get("verticalOutput"),
      }, indent=2))}</pre>
      <p class="truth">{esc(row.get('truth'))}</p>
    </article>
    """


def render_html(packet: dict[str, Any]) -> str:
    counts = packet.get("counts") or {}
    proof_loop = packet.get("proofSprintLoop") if isinstance(packet.get("proofSprintLoop"), dict) else {}
    plan = "".join(f"<li>{esc(step)}</li>" for step in packet.get("sprintPlan") or [])
    reviews = "".join(render_review(row) for row in packet.get("reviewRows") or [])
    next_rows = "".join(render_next(row) for row in packet.get("nextProofRows") or [])
    pair_rows = "".join(render_pair(row) for row in packet.get("aspectPairRows") or [])
    render_gate = packet.get("renderGate") if isinstance(packet.get("renderGate"), dict) else {}
    must_be_true = "".join(f"<li>{esc(item)}</li>" for item in render_gate.get("mustBeTrueBeforeFullRender") or [])
    checklist = "".join(f"<li>{esc(item)}</li>" for item in render_gate.get("proofReviewChecklist") or [])
    safe_outputs = "".join(
        f"<article class='mini'><h3>{esc(row.get('label'))}</h3><p>{esc(row.get('means'))}</p><p class='truth'>Mutates: {esc(row.get('mutates'))}</p></article>"
        for row in render_gate.get("safeOutputs") or []
    )
    do_not = "".join(f"<li>{esc(item)}</li>" for item in render_gate.get("doNotDo") or [])
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Studio360 proof sprint</title>
  <style>
    :root {{ --bg:#101b20; --panel:#172a31; --card:#203a43; --ink:#f8f4e8; --muted:#b5c7cb; --water:#78d7dc; --gold:#e9c75f; --leaf:#8bd47e; --clay:#dd7657; --line:#355962; }}
    body {{ margin:0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif; background:radial-gradient(circle at top right, #254653, var(--bg) 45rem); color:var(--ink); }}
    main {{ max-width:1280px; margin:0 auto; padding:32px; }}
    header, section {{ background:rgba(23,42,49,.9); border:1px solid var(--line); border-radius:24px; padding:24px; margin-bottom:20px; box-shadow:0 20px 80px rgba(0,0,0,.3); }}
    h1 {{ margin:.1rem 0 .5rem; font-size:clamp(2rem, 5vw, 4.4rem); line-height:.95; }}
    .kicker {{ color:var(--gold); font-weight:900; letter-spacing:.2em; text-transform:uppercase; }}
    .summary {{ color:var(--muted); max-width:76rem; font-size:1.05rem; }}
    .metrics {{ display:grid; grid-template-columns:repeat(auto-fit, minmax(145px, 1fr)); gap:10px; margin:18px 0; }}
    .metric {{ background:rgba(255,255,255,.06); border:1px solid var(--line); border-radius:16px; padding:12px; }}
    .metric strong {{ display:block; color:var(--water); font-size:1.5rem; }}
    .grid {{ display:grid; grid-template-columns:repeat(auto-fit, minmax(290px, 1fr)); gap:14px; }}
    .loop-grid {{ display:grid; grid-template-columns:minmax(0,.85fr) minmax(0,1.35fr); gap:18px; align-items:start; }}
    .mini-grid {{ display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:12px; }}
    .mini {{ background:rgba(0,0,0,.18); border:1px solid var(--line); border-radius:16px; padding:12px; }}
    .card {{ background:var(--card); border:1px solid var(--line); border-radius:18px; padding:16px; position:relative; }}
    .pair {{ background:linear-gradient(180deg, rgba(120,215,220,.1), rgba(32,58,67,.96)); border-color:rgba(120,215,220,.48); }}
    .rank {{ position:absolute; top:16px; right:16px; background:#0b1215; color:var(--gold); border-radius:999px; padding:5px 10px; font-weight:900; }}
    .pill {{ color:var(--leaf); font-weight:800; }}
    .truth {{ color:var(--water); }}
    .warning {{ color:var(--clay); font-weight:900; }}
    pre {{ white-space:pre-wrap; background:#081012; padding:12px; border-radius:12px; overflow:auto; }}
    @media (max-width: 900px) {{ .loop-grid {{ grid-template-columns:1fr; }} }}
  </style>
</head>
<body>
<main>
  <header>
    <div class="kicker">Studio360 proof sprint</div>
    <h1>Proof before full render.</h1>
    <p class="summary">{esc(packet.get('humanAsk'))}</p>
    <div class="metrics">
      <div class="metric"><strong>{esc(counts.get('proofReviewRows'))}</strong> proofs to review</div>
      <div class="metric"><strong>{esc(counts.get('proofNextRows'))}</strong> next proofs</div>
      <div class="metric"><strong>{esc(counts.get('pairedWideVerticalProofGroups'))}</strong> paired groups</div>
      <div class="metric"><strong>{esc(counts.get('reframeReady'))}</strong> reframe ready</div>
      <div class="metric"><strong>{esc(counts.get('blockedMediaRepair'))}</strong> repair blocked</div>
      <div class="metric"><strong>{esc(counts.get('fullRenderCreated'))}</strong> full renders here</div>
      <div class="metric"><strong>{esc(render_gate.get('readyForFullRender'))}</strong> ready full render</div>
    </div>
    <p><strong>Next safest action:</strong> {esc(packet.get('nextSafestAction'))}</p>
    <ol>{plan}</ol>
    <p class="warning">This companion does not run ffmpeg. It is a proof review map.</p>
  </header>
  <section>
    <h2>One source, two proofs, then decide</h2>
    <div class="loop-grid">
      <div>
        <p class="summary">{esc(proof_loop.get('goal'))}</p>
        <p>{esc(proof_loop.get('whyItExists'))}</p>
        <p><strong>Review rhythm:</strong> {esc(proof_loop.get('keyboardRhythm'))}</p>
        <p><strong>Done when:</strong> {esc(proof_loop.get('doneWhen'))}</p>
        <p class="truth">{esc(proof_loop.get('truth'))}</p>
      </div>
      <div class="grid">{pair_rows or '<p>No paired proof groups were available.</p>'}</div>
    </div>
  </section>
  <section>
    <h2>Render gate</h2>
    <p class="summary">{esc(render_gate.get('stageTruth'))}</p>
    <div class="mini-grid">{safe_outputs}</div>
    <h3>Must be true before full render</h3>
    <ul>{must_be_true}</ul>
    <h3>Proof review checklist</h3>
    <ul>{checklist}</ul>
    <h3>Do not do</h3>
    <ul>{do_not}</ul>
  </section>
  <section>
    <h2>Existing proof outputs to inspect</h2>
    <div class="grid">{reviews or '<p>No proof outputs were present.</p>'}</div>
  </section>
  <section>
    <h2>Next proof candidates</h2>
    <div class="grid">{next_rows or '<p>No next proof rows were available.</p>'}</div>
  </section>
  <section>
    <h2>Source pointers</h2>
    <pre>{esc(json.dumps(packet.get('sourcePointers') or {{}}, indent=2))}</pre>
  </section>
  <section>
    <h2>Safety truth</h2>
    <p>{esc(packet.get('truth'))}</p>
  </section>
</main>
</body>
</html>
"""


def build_proof_start_queue(review_rows: list[dict[str, Any]], next_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    queue: list[dict[str, Any]] = []
    for row in review_rows:
        queue.append({
            "priority": 10,
            "kind": "review-existing-proof",
            "candidateId": row.get("candidateId") or "",
            "groupKey": row.get("groupKey") or "",
            "aspect": row.get("aspect") or "",
            "status": row.get("status") or "",
            "openCommand": row.get("openCommand") or "",
            "reviewCommand": row.get("reviewCommand") or "",
            "outputPath": row.get("outputPath") or "",
            "nextSafestAction": row.get("nextSafestAction") or "Inspect existing proof before creating any new render.",
            "truth": "Proof review row only. It does not approve full render, upload, publish, or create receipt truth.",
        })
    for row in next_rows:
        queue.append({
            "priority": 20 if row.get("proofSourceExists") else 40,
            "kind": "next-proof-candidate",
            "candidateId": row.get("candidateId") or "",
            "groupKey": row.get("groupKey") or "",
            "aspect": row.get("aspect") or "",
            "status": row.get("status") or "",
            "proofSourceExists": bool(row.get("proofSourceExists")),
            "proofReceiptCommand": row.get("proofReceiptCommand") or "",
            "proofDryRunCommand": row.get("proofDryRunCommand") or "",
            "proposedProofOutputPath": row.get("proposedProofOutputPath") or "",
            "nextSafestAction": row.get("nextSafestAction") or "Render one small proof only after confirming source and aspect.",
            "truth": row.get("truth") or "Proof candidate row only. No render has been executed by the companion.",
        })
    queue.sort(key=lambda row: (int(row.get("priority") or 99), str(row.get("candidateId") or "")))
    return queue[:24]


def write_markdown(path: Path, packet: dict[str, Any]) -> None:
    counts = packet.get("counts") or {}
    lines = [
        "# Studio360 proof sprint companion",
        "",
        packet.get("humanAsk") or "",
        "",
        "## Current truth",
        "",
        f"- Proof review rows: `{counts.get('proofReviewRows')}`",
        f"- Next proof rows: `{counts.get('proofNextRows')}`",
        f"- Proof aspect pairs: `{counts.get('proofAspectPairs')}`",
        f"- Paired 16:9 + 9:16 groups: `{counts.get('pairedWideVerticalProofGroups')}`",
        f"- Reframe-ready recipes/groups: `{counts.get('reframeReady')}`",
        f"- Blocked media repair: `{counts.get('blockedMediaRepair')}`",
        f"- Full renders created here: `{counts.get('fullRenderCreated')}`",
        f"- Originals mutated: `{counts.get('originalsMutated')}`",
        "",
        "## Render gate",
        "",
        (packet.get("renderGate") or {}).get("stageTruth") or "",
        "",
        f"- Ready for full render: `{(packet.get('renderGate') or {}).get('readyForFullRender')}`",
        f"- Next if ready: {(packet.get('renderGate') or {}).get('nextIfReady')}",
        f"- Next if blocked: {(packet.get('renderGate') or {}).get('nextIfBlocked')}",
        "",
        "## One source, two proofs, then decide",
        "",
    ]
    proof_loop = packet.get("proofSprintLoop") or {}
    lines.extend([
        proof_loop.get("goal") or "",
        "",
        f"- Why it exists: {proof_loop.get('whyItExists')}",
        f"- Review rhythm: {proof_loop.get('keyboardRhythm')}",
        f"- Done when: {proof_loop.get('doneWhen')}",
        f"- Agent use: {proof_loop.get('agentUse')}",
        f"- Truth: {proof_loop.get('truth')}",
        "",
        "### Do not do",
        "",
    ])
    for item in proof_loop.get("doNotDo") or []:
        lines.append(f"- {item}")
    lines.extend([
        "",
        "### Paired aspect rows",
        "",
    ])
    for row in packet.get("aspectPairRows") or []:
        lines.extend([
            f"### {row.get('rank')}. {row.get('groupKey')}",
            f"- Status: `{row.get('status')}`",
            f"- 16:9 candidate: `{row.get('wideCandidateId') or 'missing'}`",
            f"- 9:16 candidate: `{row.get('verticalCandidateId') or 'missing'}`",
            f"- Source: `{row.get('sourcePath')}`",
            f"- Next: {row.get('nextSafestAction')}",
            "",
        ])
    lines.extend([
        "",
        "### Must be true before full render",
        "",
    ])
    for item in (packet.get("renderGate") or {}).get("mustBeTrueBeforeFullRender") or []:
        lines.append(f"- {item}")
    lines.extend([
        "",
        "### Proof review checklist",
        "",
    ])
    for item in (packet.get("renderGate") or {}).get("proofReviewChecklist") or []:
        lines.append(f"- [ ] {item}")
    lines.extend([
        "",
        "### Do not do",
        "",
    ])
    for item in (packet.get("renderGate") or {}).get("doNotDo") or []:
        lines.append(f"- {item}")
    lines.extend([
        "",
        "## Sprint plan",
        "",
    ])
    lines.extend(f"{idx}. {step}" for idx, step in enumerate(packet.get("sprintPlan") or [], start=1))
    lines.extend(["", "## Existing proofs", ""])
    for row in packet.get("reviewRows") or []:
        lines.extend([
            f"### {row.get('rank')}. {row.get('candidateId')}",
            f"- Aspect: `{row.get('aspect')}`",
            f"- Output: `{row.get('outputPath')}`",
            f"- Open: `{row.get('openCommand')}`",
            "",
        ])
    lines.extend(["", "## Next proof candidates", ""])
    for row in packet.get("nextProofRows") or []:
        lines.extend([
            f"### {row.get('rank')}. {row.get('candidateId')}",
            f"- Receipt command: `{row.get('proofReceiptCommand')}`",
            f"- Dry-run command: `{row.get('proofDryRunCommand')}`",
            f"- Source: `{row.get('proofSourcePath')}`",
            "",
        ])
    lines.extend(["", "## Safety", "", packet.get("truth") or "", ""])
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a Studio360 proof sprint companion.")
    parser.add_argument("studio360_root", nargs="?", default=str(DEFAULT_STUDIO360_ROOT))
    parser.add_argument("--limit", type=int, default=8)
    args = parser.parse_args()

    root = Path(args.studio360_root)
    packet = build_packet(root, max(1, args.limit))
    out_dir = root / "ProofSprints" / f"{stamp()}-studio360-proof-sprint"
    out_dir.mkdir(parents=True, exist_ok=True)
    html_path = out_dir / "index.html"
    json_path = out_dir / "studio360-proof-sprint-companion.json"
    markdown_path = out_dir / "START-HERE-studio360-proof-sprint.md"
    packet.update({
        "outputDir": str(out_dir),
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
    })
    packet["firstSafeAction"]["command"] = f"open {shell_quote(str(html_path))}"
    packet["firstSafeAction"]["path"] = str(html_path)

    write_json(json_path, packet)
    html_path.write_text(render_html(packet), encoding="utf-8")
    write_markdown(markdown_path, packet)

    pointer_payload = {
        "schema": packet["schema"],
        "status": packet["status"],
        "generatedAt": packet["generatedAt"],
        "outputDir": str(out_dir),
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "counts": packet["counts"],
        "humanAsk": packet["humanAsk"],
        "nextSafestAction": packet["nextSafestAction"],
        "firstSafeAction": packet["firstSafeAction"],
        "rows": build_proof_start_queue(packet.get("reviewRows") or [], packet.get("nextProofRows") or []),
        "startHereQueue": build_proof_start_queue(packet.get("reviewRows") or [], packet.get("nextProofRows") or []),
        "reviewRows": packet.get("reviewRows") or [],
        "nextProofRows": packet.get("nextProofRows") or [],
        "aspectPairRows": packet.get("aspectPairRows") or [],
        "proofSprintLoop": packet.get("proofSprintLoop") or {},
        "renderGate": packet["renderGate"],
        "agentSafeParallelWork": packet["agentSafeParallelWork"],
        "truth": packet["truth"],
    }
    write_json(root / LATEST_POINTER, pointer_payload)
    print(json.dumps(pointer_payload, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
