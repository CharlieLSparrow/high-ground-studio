#!/usr/bin/env python3
"""Generate a parameter control ledger for the current audio workbench baseline.

The ledger names the stage-specific knobs that can be tuned after human listen
feedback. It is deliberately evidence-only: no media render, no approval change,
no branch unlock, and no source mutation.
"""

from __future__ import annotations

import argparse
import html
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def resolve_baseline_dir(input_path: Path) -> Path:
    if (input_path / "manifest.json").exists():
        return input_path.expanduser().resolve()
    nested = input_path / "work" / "conformed-production-baseline"
    if (nested / "manifest.json").exists():
        return nested.expanduser().resolve()
    raise FileNotFoundError(f"Could not find baseline manifest under {input_path}")


def output_path(value: Any) -> str | None:
    if isinstance(value, str) and value:
        return value
    if isinstance(value, dict):
        for key in ("path", "markdownPath", "htmlPath", "openCommand"):
            path = value.get(key)
            if isinstance(path, str) and path:
                return path
    return None


def artifact(outputs: dict[str, Any], key: str, label: str) -> dict[str, Any]:
    path = output_path(outputs.get(key))
    exists = bool(path) and Path(path).exists()
    return {
        "key": key,
        "label": label,
        "path": path,
        "exists": exists,
        "sizeBytes": Path(path).stat().st_size if exists else None,
    }


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def param(
    *,
    parameter_id: str,
    stage: str,
    label: str,
    current: str,
    recommended_range: str,
    unit: str,
    symptoms: list[str],
    evidence: list[dict[str, Any]],
    safe_adjustment: str,
    danger: str,
    proof_required: str,
) -> dict[str, Any]:
    return {
        "id": parameter_id,
        "stage": stage,
        "label": label,
        "currentValue": current,
        "recommendedRange": recommended_range,
        "unit": unit,
        "symptoms": symptoms,
        "evidenceArtifacts": evidence,
        "missingEvidenceCount": sum(1 for item in evidence if not item["exists"]),
        "safeAdjustment": safe_adjustment,
        "danger": danger,
        "proofRequired": proof_required,
    }


def build_ledger(manifest: dict[str, Any], baseline_dir: Path, generated_at: str) -> dict[str, Any]:
    outputs = manifest.get("outputs") or {}
    approval_status = manifest.get("approvalStatus")
    branch_inheritance_ready = bool(manifest.get("branchInheritanceReady"))
    branch_render_ready = bool(manifest.get("branchRenderReady"))

    parameters = [
        param(
            parameter_id="charlie-under-homer-duck-depth-db",
            stage="source-aware cleanup",
            label="Charlie duck depth while Homer is primary",
            current="candidate profile controlled; inspect source-aware cleanup manifests",
            recommended_range="-18 to -36",
            unit="dB attenuation",
            symptoms=["charlie-echo-under-homer", "homer-low-or-missing"],
            evidence=[artifact(outputs, "latestSpeakerCleanupProofPackHtml", "speaker cleanup proof pack"), artifact(outputs, "latestSpeakerBleedGapProofAuditMarkdown", "bleed/gap proof audit")],
            safe_adjustment="Increase ducking only in windows where Homer is primary and Charlie is not reacting. Use 100-250ms fades.",
            danger="Too much ducking removes Charlie laughs and real overlap, making the conversation feel chopped.",
            proof_required="A/B proof snippet for the failing window before full candidate render.",
        ),
        param(
            parameter_id="homer-under-charlie-duck-depth-db",
            stage="source-aware cleanup",
            label="Homer duck depth while Charlie is primary",
            current="candidate profile controlled; inspect source-aware cleanup manifests",
            recommended_range="-12 to -30",
            unit="dB attenuation",
            symptoms=["homer-park-noise-under-charlie", "master-harsh-compressed-or-unbalanced"],
            evidence=[artifact(outputs, "latestSpeakerCleanupProofPackHtml", "speaker cleanup proof pack"), artifact(outputs, "latestSpeakerCleanupListenMapMarkdown", "speaker cleanup listen map")],
            safe_adjustment="Duck Homer ambience under Charlie while preserving Homer reactions and audible overlap.",
            danger="A hard mute can make outdoor recordings pump and can erase useful reaction texture.",
            proof_required="Compare raw Homer, treated Homer, source-aware mix, and master for the same proof window.",
        ),
        param(
            parameter_id="homer-primary-gain-db",
            stage="mix/master",
            label="Homer primary contribution gain before bus processing",
            current="machine-preferred profile: homer-preserving-clean",
            recommended_range="-3 to +6",
            unit="dB gain",
            symptoms=["homer-low-or-missing"],
            evidence=[artifact(outputs, "latestAudioMasterSourceBalanceAuditMarkdown", "master/source balance audit"), artifact(outputs, "latestAudioSourceBalanceListenCompanionMarkdown", "source-balance listen companion")],
            safe_adjustment="Raise Homer only before bus compression and only if source-balance proof says his contribution is truly low.",
            danger="Boosting after the master limiter raises noise, ambience, and bleed instead of fixing speaker balance.",
            proof_required="Source-balance A/B proof pair plus listen-priority snippet comparison.",
        ),
        param(
            parameter_id="charlie-primary-gain-db",
            stage="mix/master",
            label="Charlie primary contribution gain before bus processing",
            current="candidate profile controlled; Charlie was originally hotter than Homer",
            recommended_range="-6 to +2",
            unit="dB gain",
            symptoms=["homer-low-or-missing", "master-harsh-compressed-or-unbalanced"],
            evidence=[artifact(outputs, "latestAudioMasterSourceBalanceAuditMarkdown", "master/source balance audit"), artifact(outputs, "qualityReportMarkdown", "QC report")],
            safe_adjustment="Trim Charlie before bus compression if Homer is masked or if the master gets fatiguing.",
            danger="Trimming Charlie too much may make the cleaner mic sound less present than the noisier outdoor source.",
            proof_required="Full-master loudness check and targeted proof-window listening.",
        ),
        param(
            parameter_id="speaker-activity-threshold-dbfs",
            stage="speaker activity map",
            label="Speaker activity detection threshold",
            current="derived from current activity map/proof pack",
            recommended_range="-42 to -28",
            unit="dBFS-ish analysis threshold",
            symptoms=["robotic-gating-or-clipped-reactions", "charlie-echo-under-homer", "homer-park-noise-under-charlie"],
            evidence=[artifact(outputs, "latestAudioSpeakerActivityReviewBoardHtml", "speaker activity review board"), artifact(outputs, "latestSpeakerCleanupListenMapMarkdown", "speaker cleanup listen map")],
            safe_adjustment="Change threshold by small increments and preserve uncertain low-level reactions as proof items.",
            danger="One global threshold can misclassify quiet reactions as silence or outdoor noise as speech.",
            proof_required="15-window cleanup listen map or regenerated proof pack audit.",
        ),
        param(
            parameter_id="cleanup-crossfade-ms",
            stage="source-aware cleanup",
            label="Cleanup gate/duck crossfade duration",
            current="candidate profile controlled; inspect proof pack timing",
            recommended_range="80 to 300",
            unit="milliseconds",
            symptoms=["robotic-gating-or-clipped-reactions"],
            evidence=[artifact(outputs, "latestAudioMasterSmoothnessAuditMarkdown", "master smoothness audit"), artifact(outputs, "latestSpeakerCleanupProofPackAuditMarkdown", "speaker cleanup proof pack audit")],
            safe_adjustment="Lengthen fades around conversational overlaps and keep short tight fades only for clearly empty gaps.",
            danger="Too short creates clicks/chops; too long leaves echo/noise tails.",
            proof_required="Smoothness audit plus human listen on the same transition windows.",
        ),
        param(
            parameter_id="dxrevive-restoration-strength",
            stage="restoration lane",
            label="dxRevive/manual restoration intensity on duplicated stems",
            current="waiting-for-bounces or proof-only unless validated bounces exist",
            recommended_range="conservative to moderate first",
            unit="tool preset/intensity",
            symptoms=["homer-park-noise-under-charlie", "restoration-fake-or-shiny"],
            evidence=[artifact(outputs, "latestDxReviveManualBouncePacketMarkdown", "dxRevive manual bounce packet"), artifact(outputs, "latestDxReviveBounceValidationMarkdown", "dxRevive bounce validation"), artifact(outputs, "latestDxReviveProofCandidatePlannerMarkdown", "dxRevive proof candidate planner")],
            safe_adjustment="Restore duplicated stems only, validate duration/sample-rate/channels, then compare A/B proof snippets before promotion.",
            danger="A restored full mix can hide damage, revive bleed, and make voices uncanny.",
            proof_required="Validation plus A/B proof candidate preferred by human listener.",
        ),
        param(
            parameter_id="bus-compression-ratio",
            stage="mix/master",
            label="Master bus compression ratio",
            current="candidate profile controlled; QC target around -16 LUFS",
            recommended_range="1.5:1 to 3:1",
            unit="ratio",
            symptoms=["master-harsh-compressed-or-unbalanced"],
            evidence=[artifact(outputs, "qualityReportMarkdown", "QC report"), artifact(outputs, "latestAudioMasterSmoothnessAuditMarkdown", "master smoothness audit")],
            safe_adjustment="Keep compression moderate and solve speaker balance before bus compression whenever possible.",
            danger="Heavy bus compression lifts room noise and makes park ambience breathe under speech.",
            proof_required="QC report plus phone/laptop/headphone human listen.",
        ),
        param(
            parameter_id="limiter-ceiling-dbfs",
            stage="mix/master",
            label="Limiter ceiling / true peak guard",
            current="candidate true peak reported in QC artifacts",
            recommended_range="-1.5 to -1.0",
            unit="dBFS true peak",
            symptoms=["master-harsh-compressed-or-unbalanced"],
            evidence=[artifact(outputs, "qualityReportMarkdown", "QC report"), artifact(outputs, "latestAudioListenPrioritySnippetPackAuditMarkdown", "snippet pack audit")],
            safe_adjustment="Set ceiling for delivery safety after balance/cleanup are correct; do not use limiter drive as a loudness shortcut.",
            danger="Limiter abuse makes speech fatiguing and can smear transients.",
            proof_required="True peak/loudness QC and priority-snippet listen.",
        ),
        param(
            parameter_id="structural-gap-edit-policy",
            stage="sync/edit layer",
            label="Long silence and structural gap policy",
            current="baseline keeps full timeline; branch edits decide skip/show",
            recommended_range="preserve baseline, skip in branch",
            unit="policy",
            symptoms=["long-silence-or-structural-gap"],
            evidence=[artifact(outputs, "latestAudioMasterVisualOverviewMarkdown", "audio visual overview"), artifact(outputs, "latestEditorMarkerPacketMarkdown", "editor marker packet"), artifact(outputs, "branchRenderPreflightMarkdown", "branch render preflight")],
            safe_adjustment="Keep the clean spine full-length; mark gaps for edit branches instead of shortening source-derived audio.",
            danger="Shortening the baseline breaks sync inheritance for every branch and short.",
            proof_required="Branch render proof only after human listen approval or proof-only labeling.",
        ),
    ]

    all_artifacts = [item for parameter in parameters for item in parameter["evidenceArtifacts"]]
    stage_counts: dict[str, int] = {}
    for parameter in parameters:
        stage_counts[parameter["stage"]] = stage_counts.get(parameter["stage"], 0) + 1

    return {
        "schema": "quipsly.audio-workbench.parameter-control-ledger.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": manifest.get("baselineId"),
        "approvalStatus": approval_status,
        "packageReadyForHumanListen": bool(manifest.get("packageReadyForHumanListen")),
        "branchInheritanceReady": branch_inheritance_ready,
        "branchRenderReady": branch_render_ready,
        "humanListenStillRequired": approval_status == "machine-candidate-needs-human-listen-proof",
        "originalMediaMutated": False,
        "renderAttempted": False,
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "parameterCount": len(parameters),
        "stageCounts": stage_counts,
        "missingEvidenceCount": sum(1 for item in all_artifacts if not item["exists"]),
        "parameters": parameters,
        "nextSafestAction": "After human listen notes identify a failure, tune only the relevant stage parameter, render a timestamped proof candidate, and keep branch inheritance locked until the exact candidate is approved.",
    }


def render_markdown(ledger: dict[str, Any]) -> str:
    lines = [
        f"# Audio Workbench Parameter Control Ledger: {ledger['baselineId']}",
        "",
        f"Generated: `{ledger['generatedAt']}`",
        "",
        "This ledger names the audio controls that may be adjusted after listen feedback. It does not render, approve, fail, publish, or mutate original media.",
        "",
        "## Current truth",
        "",
        f"- Approval status: `{ledger['approvalStatus']}`",
        f"- Human listen still required: `{str(ledger['humanListenStillRequired']).lower()}`",
        f"- Branch inheritance ready: `{str(ledger['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(ledger['branchRenderReady']).lower()}`",
        f"- Parameter count: `{ledger['parameterCount']}`",
        f"- Missing evidence links: `{ledger['missingEvidenceCount']}`",
        "",
        "## Parameter index",
        "",
        "| Parameter | Stage | Current | Range | Proof required |",
        "|---|---|---|---|---|",
    ]
    for item in ledger["parameters"]:
        lines.append(f"| `{item['id']}` | {item['stage']} | {item['currentValue']} | {item['recommendedRange']} {item['unit']} | {item['proofRequired']} |")
    lines.extend(["", "## Details", ""])
    for item in ledger["parameters"]:
        lines.extend([
            f"### {item['label']}",
            "",
            f"- ID: `{item['id']}`",
            f"- Stage: `{item['stage']}`",
            f"- Current value: {item['currentValue']}",
            f"- Recommended range: `{item['recommendedRange']}` `{item['unit']}`",
            f"- Symptoms: `{', '.join(item['symptoms'])}`",
            f"- Safe adjustment: {item['safeAdjustment']}",
            f"- Danger: {item['danger']}",
            f"- Proof required: {item['proofRequired']}",
            "",
            "Evidence:",
            "",
        ])
        for evidence in item["evidenceArtifacts"]:
            status = "present" if evidence["exists"] else "missing"
            lines.append(f"- {evidence['label']}: `{status}` `{evidence['path'] or evidence['key']}`")
        lines.append("")
    lines.extend(["## Next safest action", "", ledger["nextSafestAction"], ""])
    return "\n".join(lines)


def render_html(ledger: dict[str, Any]) -> str:
    cards = []
    for item in ledger["parameters"]:
        evidence = "".join(
            f"<li><span class='{ 'ok' if ev['exists'] else 'missing' }'>{html.escape('present' if ev['exists'] else 'missing')}</span> <code>{html.escape(ev['label'])}</code><br><small>{html.escape(ev['path'] or ev['key'])}</small></li>"
            for ev in item["evidenceArtifacts"]
        )
        symptoms = "".join(f"<span>{html.escape(symptom)}</span>" for symptom in item["symptoms"])
        cards.append(f"""
        <article class=\"card\">
          <div class=\"meta\"><span>{html.escape(item['stage'])}</span><span>{html.escape(item['recommendedRange'])} {html.escape(item['unit'])}</span></div>
          <h2>{html.escape(item['label'])}</h2>
          <p class=\"id\"><code>{html.escape(item['id'])}</code></p>
          <div class=\"symptoms\">{symptoms}</div>
          <h3>Current</h3><p>{html.escape(item['currentValue'])}</p>
          <h3>Safe adjustment</h3><p>{html.escape(item['safeAdjustment'])}</p>
          <h3>Danger</h3><p class=\"danger\">{html.escape(item['danger'])}</p>
          <h3>Proof required</h3><p>{html.escape(item['proofRequired'])}</p>
          <details><summary>Evidence</summary><ul>{evidence}</ul></details>
        </article>
        """)
    return f"""<!doctype html>
<html lang=\"en\">
<head>
<meta charset=\"utf-8\">
<title>Audio Parameter Control Ledger</title>
<style>
:root {{ color-scheme: dark; --soil:#14110d; --moss:#243323; --leaf:#8fcf76; --gold:#e7bd50; --clay:#d4714f; --ink:#f6f0df; --muted:#b7ad96; }}
body {{ margin:0; font:14px/1.48 -apple-system,BlinkMacSystemFont,"Avenir Next",sans-serif; background:radial-gradient(circle at 12% -10%, #314b33, var(--soil) 42%); color:var(--ink); }}
header {{ padding:32px 42px; border-bottom:1px solid rgba(231,189,80,.28); background:rgba(20,17,13,.88); position:sticky; top:0; backdrop-filter:blur(18px); z-index:2; }}
h1 {{ margin:0; font-size:32px; }} .sub {{ color:var(--muted); margin-top:8px; }} .truth {{ display:flex; flex-wrap:wrap; gap:10px; margin-top:18px; }} .pill {{ padding:8px 11px; border-radius:999px; background:rgba(143,207,118,.13); border:1px solid rgba(143,207,118,.25); color:#cdf7b8; }}
main {{ padding:30px 42px 54px; display:grid; grid-template-columns:repeat(auto-fit,minmax(360px,1fr)); gap:18px; }}
.card {{ background:linear-gradient(145deg, rgba(36,51,35,.96), rgba(30,25,18,.96)); border:1px solid rgba(231,189,80,.22); border-radius:22px; padding:20px; box-shadow:0 16px 48px rgba(0,0,0,.28); }}
.meta {{ display:flex; justify-content:space-between; gap:12px; color:#f2d87a; font-size:11px; text-transform:uppercase; letter-spacing:.11em; }} h2 {{ font-size:20px; margin:14px 0 4px; }} h3 {{ font-size:12px; letter-spacing:.12em; text-transform:uppercase; margin:16px 0 6px; color:#f2d87a; }} .id, small {{ color:var(--muted); }} code {{ color:#d3ffbf; word-break:break-all; }} .symptoms {{ display:flex; flex-wrap:wrap; gap:6px; margin:12px 0; }} .symptoms span {{ background:rgba(231,189,80,.12); color:#f7df8c; border-radius:999px; padding:4px 8px; font-size:12px; }} .danger {{ color:#ffb39e; }} summary {{ color:#cdf7b8; cursor:pointer; }} li {{ margin:7px 0; }} .ok {{ color:#9bf06c; font-weight:700; }} .missing {{ color:#ff9278; font-weight:700; }}
</style>
</head>
<body>
<header>
<h1>Audio Parameter Control Ledger</h1>
<div class=\"sub\">{html.escape(str(ledger['baselineId']))}</div>
<div class=\"truth\"><span class=\"pill\">approval: {html.escape(str(ledger['approvalStatus']))}</span><span class=\"pill\">human listen required: {str(ledger['humanListenStillRequired']).lower()}</span><span class=\"pill\">branch inheritance: {str(ledger['branchInheritanceReady']).lower()}</span><span class=\"pill\">parameters: {ledger['parameterCount']}</span><span class=\"pill\">missing evidence: {ledger['missingEvidenceCount']}</span></div>
</header>
<main>{''.join(cards)}</main>
</body>
</html>
"""


def write_open_command(path: Path, target: Path) -> None:
    path.write_text(f"#!/bin/zsh\nopen {shell_quote(str(target))}\n", encoding="utf-8")
    os.chmod(path, 0o755)


def register_outputs(manifest: dict[str, Any], ledger: dict[str, Any], json_path: Path, md_path: Path, html_path: Path, open_command: Path) -> None:
    outputs = manifest.setdefault("outputs", {})
    outputs["latestAudioWorkbenchParameterControlLedger"] = str(json_path)
    outputs["latestAudioWorkbenchParameterControlLedgerMarkdown"] = str(md_path)
    outputs["latestAudioWorkbenchParameterControlLedgerHtml"] = str(html_path)
    outputs["latestAudioWorkbenchParameterControlLedgerOpenCommand"] = str(open_command)
    history = outputs.setdefault("audioWorkbenchParameterControlLedgerHistory", [])
    if isinstance(history, list):
        history.append(str(json_path))
    manifest["audioWorkbenchParameterControlLedgerCount"] = int(manifest.get("audioWorkbenchParameterControlLedgerCount") or 0) + 1
    manifest["audioWorkbenchParameterControlLedgerParameterCount"] = ledger["parameterCount"]
    manifest["audioWorkbenchParameterControlLedgerMissingEvidenceCount"] = ledger["missingEvidenceCount"]
    manifest["audioWorkbenchParameterControlLedgerApprovalStateChanged"] = False
    manifest["audioWorkbenchParameterControlLedgerBranchStateChanged"] = False
    manifest["audioWorkbenchParameterControlLedgerRenderAttempted"] = False
    manifest["audioWorkbenchParameterControlLedgerOriginalMediaMutated"] = False


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    baseline_id = str(manifest.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    ledger = build_ledger(manifest, baseline_dir, generated_at)

    out_dir = baseline_dir / f"audio-workbench-parameter-control-ledger-{slug}-{generated_at}"
    out_dir.mkdir(parents=True, exist_ok=True)
    json_path = out_dir / "parameter-control-ledger.json"
    md_path = out_dir / f"audio-workbench-parameter-control-ledger-{slug}-{generated_at}.md"
    html_path = out_dir / "parameter-control-ledger.html"
    open_command = out_dir / "open-parameter-control-ledger.command"

    write_json(json_path, ledger)
    md_path.write_text(render_markdown(ledger), encoding="utf-8")
    html_path.write_text(render_html(ledger), encoding="utf-8")
    write_open_command(open_command, html_path)
    register_outputs(manifest, ledger, json_path, md_path, html_path, open_command)
    write_json(manifest_path, manifest)

    print(f"Parameter control ledger: {md_path}")
    print(f"Parameter control ledger HTML: {html_path}")
    print(f"Parameters: {ledger['parameterCount']}")
    print(f"Missing evidence links: {ledger['missingEvidenceCount']}")
    print("Approval state changed: false")
    print("Branch state changed: false")
    print("Render attempted: false")
    print("Original media mutated: false")


if __name__ == "__main__":
    main()
