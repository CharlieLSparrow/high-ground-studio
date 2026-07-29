#!/usr/bin/env python3
"""Generate proof-only parameter sweep plans for audio repair candidates.

This turns the parameter ledger into concrete conservative/standard/aggressive
proof recipes. It does not render audio, approve audio, unlock branches, upload
files, or mutate original media.
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
    return {"key": key, "label": label, "path": path, "exists": exists, "sizeBytes": Path(path).stat().st_size if exists else None}


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def load_required_json(outputs: dict[str, Any], key: str, label: str) -> dict[str, Any]:
    path = output_path(outputs.get(key))
    if not path or not Path(path).exists():
        raise FileNotFoundError(f"Missing {label}: manifest outputs.{key}")
    return read_json(Path(path))


def variant(variant_id: str, label: str, deltas: dict[str, str], reason: str) -> dict[str, Any]:
    return {"id": variant_id, "label": label, "parameterDeltas": deltas, "reason": reason}


def plan(
    *,
    plan_id: str,
    title: str,
    symptom_ids: list[str],
    stage: str,
    parameter_ids: list[str],
    variants: list[dict[str, Any]],
    evidence: list[dict[str, Any]],
    proof_source: str,
    pass_condition: str,
    fail_condition: str,
    promotion_rule: str,
    forbidden_shortcut: str,
) -> dict[str, Any]:
    return {
        "id": plan_id,
        "title": title,
        "symptomIds": symptom_ids,
        "stage": stage,
        "parameterIds": parameter_ids,
        "variants": variants,
        "variantCount": len(variants),
        "evidenceArtifacts": evidence,
        "missingEvidenceCount": sum(1 for item in evidence if not item["exists"]),
        "proofWindowSource": proof_source,
        "renderMode": "proof-only-plan-no-media-rendered",
        "passCondition": pass_condition,
        "failCondition": fail_condition,
        "promotionRule": promotion_rule,
        "forbiddenShortcut": forbidden_shortcut,
    }


def build_plan(manifest: dict[str, Any], baseline_dir: Path, generated_at: str) -> dict[str, Any]:
    outputs = manifest.get("outputs") or {}
    ledger = load_required_json(outputs, "latestAudioWorkbenchParameterControlLedger", "parameter control ledger")
    repair_console = load_required_json(outputs, "latestAudioWorkbenchRepairTuningConsole", "repair/tuning console")
    parameter_ids_available = {item.get("id") for item in ledger.get("parameters", [])}
    symptom_ids_available = {item.get("id") for item in repair_console.get("symptoms", [])}

    plans = [
        plan(
            plan_id="charlie-echo-under-homer-sweep",
            title="Reduce Charlie phone-call echo while Homer speaks",
            symptom_ids=["charlie-echo-under-homer"],
            stage="source-aware cleanup",
            parameter_ids=["charlie-under-homer-duck-depth-db", "cleanup-crossfade-ms", "speaker-activity-threshold-dbfs"],
            variants=[
                variant("conservative", "Conservative", {"charlie-under-homer-duck-depth-db": "-18 dB", "cleanup-crossfade-ms": "180 ms"}, "Keep reactions safer; remove only obvious echo."),
                variant("standard", "Standard", {"charlie-under-homer-duck-depth-db": "-24 dB", "cleanup-crossfade-ms": "220 ms"}, "Likely default for phone-call echo under Homer."),
                variant("aggressive", "Aggressive", {"charlie-under-homer-duck-depth-db": "-32 dB", "cleanup-crossfade-ms": "280 ms"}, "Use only when echo remains clearly distracting."),
            ],
            evidence=[artifact(outputs, "latestSpeakerCleanupProofPackHtml", "speaker cleanup proof pack"), artifact(outputs, "latestSpeakerBleedGapProofAuditMarkdown", "bleed/gap proof audit"), artifact(outputs, "latestSpeakerCleanupListenMapMarkdown", "speaker cleanup listen map")],
            proof_source="speaker cleanup proof pack windows flagged for Charlie echo under Homer",
            pass_condition="Homer sounds single and present while Charlie reactions/laughter remain natural.",
            fail_condition="Homer still doubles, or Charlie reactions vanish/chop.",
            promotion_rule="Promote only the smallest variant that passes the proof window; otherwise keep v006 locked and record needs-repair notes.",
            forbidden_shortcut="Do not mute the entire Charlie stem whenever Homer speaks.",
        ),
        plan(
            plan_id="homer-park-noise-under-charlie-sweep",
            title="Reduce Homer park noise under Charlie without killing reactions",
            symptom_ids=["homer-park-noise-under-charlie"],
            stage="source-aware cleanup",
            parameter_ids=["homer-under-charlie-duck-depth-db", "cleanup-crossfade-ms", "speaker-activity-threshold-dbfs"],
            variants=[
                variant("conservative", "Conservative", {"homer-under-charlie-duck-depth-db": "-12 dB", "cleanup-crossfade-ms": "220 ms"}, "Preserve outdoor texture and reactions."),
                variant("standard", "Standard", {"homer-under-charlie-duck-depth-db": "-20 dB", "cleanup-crossfade-ms": "260 ms"}, "Reduce background voices while preserving overlap."),
                variant("aggressive", "Aggressive", {"homer-under-charlie-duck-depth-db": "-30 dB", "cleanup-crossfade-ms": "320 ms"}, "Use only for strong background contamination."),
            ],
            evidence=[artifact(outputs, "latestSpeakerCleanupProofPackHtml", "speaker cleanup proof pack"), artifact(outputs, "latestSpeakerCleanupListenMapMarkdown", "speaker cleanup listen map"), artifact(outputs, "latestDxReviveProofCandidatePlannerMarkdown", "dxRevive proof candidate planner")],
            proof_source="speaker cleanup windows where Charlie is primary and Homer source contributes noise",
            pass_condition="Charlie becomes cleaner while Homer reactions still feel human and present.",
            fail_condition="Outdoor noise remains distracting, or Homer reactions/overlap disappear unnaturally.",
            promotion_rule="If ducking alone fails, route to dxRevive duplicated-stem proof candidates rather than restoring the whole mix.",
            forbidden_shortcut="Do not run the final stereo master through restoration to hide outdoor noise.",
        ),
        plan(
            plan_id="homer-presence-balance-sweep",
            title="Restore Homer presence if the master feels Charlie-heavy",
            symptom_ids=["homer-low-or-missing", "master-harsh-compressed-or-unbalanced"],
            stage="mix/master",
            parameter_ids=["homer-primary-gain-db", "charlie-primary-gain-db", "bus-compression-ratio"],
            variants=[
                variant("conservative", "Conservative", {"homer-primary-gain-db": "+2 dB", "charlie-primary-gain-db": "0 dB"}, "Raise Homer slightly without changing the whole mix posture."),
                variant("standard", "Standard", {"homer-primary-gain-db": "+4 dB", "charlie-primary-gain-db": "-1 dB"}, "Correct likely speaker imbalance before bus processing."),
                variant("aggressive", "Aggressive", {"homer-primary-gain-db": "+6 dB", "charlie-primary-gain-db": "-2 dB", "bus-compression-ratio": "2:1 max"}, "Use if Homer is materially masked in proof windows."),
            ],
            evidence=[artifact(outputs, "latestAudioMasterSourceBalanceAuditMarkdown", "master/source balance audit"), artifact(outputs, "latestAudioSourceBalanceListenCompanionMarkdown", "source-balance listen companion"), artifact(outputs, "qualityReportMarkdown", "QC report")],
            proof_source="source-balance A/B proof pairs and listen-priority queue moments",
            pass_condition="Homer is intelligible and emotionally present without making park noise dominate.",
            fail_condition="Homer remains low, or the mix becomes noisy/harsh after gain changes.",
            promotion_rule="Promote only if QC remains podcast-safe and source-balance proof windows sound better to a human listener.",
            forbidden_shortcut="Do not boost the final stereo file to make Homer louder.",
        ),
        plan(
            plan_id="natural-gating-sweep",
            title="Make cleanup sound less robotic around speech and laughter",
            symptom_ids=["robotic-gating-or-clipped-reactions"],
            stage="speaker activity map and cleanup envelope",
            parameter_ids=["speaker-activity-threshold-dbfs", "cleanup-crossfade-ms"],
            variants=[
                variant("conservative", "Conservative", {"speaker-activity-threshold-dbfs": "-34 dBFS", "cleanup-crossfade-ms": "220 ms"}, "Preserve more low-level speech/reactions."),
                variant("standard", "Standard", {"speaker-activity-threshold-dbfs": "-36 dBFS", "cleanup-crossfade-ms": "260 ms"}, "Smooth transitions with modest reaction preservation."),
                variant("aggressive-natural", "Aggressive Natural", {"speaker-activity-threshold-dbfs": "-38 dBFS", "cleanup-crossfade-ms": "320 ms"}, "Use when chopped speech is worse than residual noise."),
            ],
            evidence=[artifact(outputs, "latestAudioSpeakerActivityReviewBoardHtml", "speaker activity board"), artifact(outputs, "latestAudioMasterSmoothnessAuditMarkdown", "smoothness audit"), artifact(outputs, "latestAudioListenPriorityReviewReelMarkdown", "listen-priority review reel")],
            proof_source="largest smoothness transitions plus cleanup listen-map windows",
            pass_condition="Transitions feel human and reactions survive, with no obvious echo/noise regression.",
            fail_condition="Speech still chops, or relaxed gating reintroduces obvious echo/noise.",
            promotion_rule="Use the gentlest transition settings that pass smoothness and human listening.",
            forbidden_shortcut="Do not lower activity threshold until every noise blob counts as speech.",
        ),
        plan(
            plan_id="dxrevive-stem-restoration-sweep",
            title="A/B dxRevive-style restoration on duplicated stems only",
            symptom_ids=["homer-park-noise-under-charlie", "restoration-fake-or-shiny"],
            stage="restoration lane",
            parameter_ids=["dxrevive-restoration-strength"],
            variants=[
                variant("conservative", "Conservative", {"dxrevive-restoration-strength": "low/conservative"}, "Reduce roughness while retaining natural voice texture."),
                variant("standard", "Standard", {"dxrevive-restoration-strength": "moderate"}, "Try stronger cleanup only on duplicated noisy stems."),
                variant("blend", "Blend", {"dxrevive-restoration-strength": "moderate stem, blended under source-aware stem"}, "Use restored signal as support, not replacement."),
            ],
            evidence=[artifact(outputs, "latestDxReviveManualBouncePacketMarkdown", "dxRevive manual bounce packet"), artifact(outputs, "latestDxReviveBounceValidationMarkdown", "dxRevive bounce validation"), artifact(outputs, "latestDxReviveProofCandidatePlannerMarkdown", "dxRevive proof candidate planner")],
            proof_source="dxRevive validated returned bounces and proof candidate planner",
            pass_condition="Restored proof sounds cleaner and still human; no watery/metallic artifacts.",
            fail_condition="Voice sounds fake, bleed is revived, or timing/format validation fails.",
            promotion_rule="Promote only after returned bounces validate and A/B proof wins human listening.",
            forbidden_shortcut="Do not restore the full mix or silently replace a stem just because validation passes.",
        ),
        plan(
            plan_id="structural-gap-branch-policy-plan",
            title="Handle long structural silence as branch edit policy, not audio destruction",
            symptom_ids=["long-silence-or-structural-gap"],
            stage="sync/edit layer",
            parameter_ids=["structural-gap-edit-policy"],
            variants=[
                variant("show-in-play-through", "Play Through", {"structural-gap-edit-policy": "preserve full spine"}, "Keep baseline intact for sync truth."),
                variant("skip-in-edit-branch", "Play Edit", {"structural-gap-edit-policy": "skip in branch"}, "Use edit metadata to skip dead air."),
                variant("shorts-ignore", "Shorts Ignore", {"structural-gap-edit-policy": "exclude from shorts candidates"}, "Avoid recommending silent sections for clips."),
            ],
            evidence=[artifact(outputs, "latestAudioMasterVisualOverviewMarkdown", "visual overview"), artifact(outputs, "latestEditorMarkerPacketMarkdown", "editor marker packet"), artifact(outputs, "branchRenderPreflightMarkdown", "branch render preflight")],
            proof_source="visual overview and branch preflight, not restoration proof snippets",
            pass_condition="Baseline remains full-length while episode branches skip silence intentionally.",
            fail_condition="Baseline audio is shortened or branch output is mislabeled as approved.",
            promotion_rule="Only branch-level edit metadata changes; the conformed audio spine remains untouched.",
            forbidden_shortcut="Do not delete silence from the conformed baseline to make an edit branch shorter.",
        ),
    ]

    missing_parameters = sorted({pid for item in plans for pid in item["parameterIds"] if pid not in parameter_ids_available})
    missing_symptoms = sorted({sid for item in plans for sid in item["symptomIds"] if sid not in symptom_ids_available})
    missing_evidence_count = sum(item["missingEvidenceCount"] for item in plans)

    return {
        "schema": "quipsly.audio-workbench.parameter-sweep-proof-plan.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": manifest.get("baselineId"),
        "approvalStatus": manifest.get("approvalStatus"),
        "packageReadyForHumanListen": bool(manifest.get("packageReadyForHumanListen")),
        "branchInheritanceReady": bool(manifest.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest.get("branchRenderReady")),
        "humanListenStillRequired": manifest.get("approvalStatus") == "machine-candidate-needs-human-listen-proof",
        "renderAttempted": False,
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "originalMediaMutated": False,
        "planCount": len(plans),
        "variantCount": sum(item["variantCount"] for item in plans),
        "missingParameterIds": missing_parameters,
        "missingSymptomIds": missing_symptoms,
        "missingEvidenceCount": missing_evidence_count,
        "plans": plans,
        "nextSafestAction": "After real human listen notes identify a failure, choose the matching plan, render proof-only conservative/standard/aggressive snippets, and promote only a human-preferred timestamped candidate.",
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Audio Workbench Parameter Sweep Proof Plan: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "This is a proof-plan surface, not a renderer. It defines what conservative/standard/aggressive repair snippets should be rendered after human listen feedback identifies a real failure.",
        "",
        "## Current truth",
        "",
        f"- Approval status: `{report['approvalStatus']}`",
        f"- Human listen still required: `{str(report['humanListenStillRequired']).lower()}`",
        f"- Branch inheritance ready: `{str(report['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(report['branchRenderReady']).lower()}`",
        f"- Proof plans: `{report['planCount']}`",
        f"- Variants planned: `{report['variantCount']}`",
        f"- Missing parameter IDs: `{', '.join(report['missingParameterIds']) or 'none'}`",
        f"- Missing symptom IDs: `{', '.join(report['missingSymptomIds']) or 'none'}`",
        f"- Missing evidence links: `{report['missingEvidenceCount']}`",
        "",
        "## Plan index",
        "",
        "| Plan | Stage | Variants | Pass condition | Forbidden shortcut |",
        "|---|---|---:|---|---|",
    ]
    for item in report["plans"]:
        lines.append(f"| {item['title']} | `{item['stage']}` | `{item['variantCount']}` | {item['passCondition']} | {item['forbiddenShortcut']} |")
    lines.extend(["", "## Details", ""])
    for item in report["plans"]:
        lines.extend([
            f"### {item['title']}",
            "",
            f"- ID: `{item['id']}`",
            f"- Stage: `{item['stage']}`",
            f"- Symptoms: `{', '.join(item['symptomIds'])}`",
            f"- Parameters: `{', '.join(item['parameterIds'])}`",
            f"- Proof source: {item['proofWindowSource']}",
            f"- Pass condition: {item['passCondition']}",
            f"- Fail condition: {item['failCondition']}",
            f"- Promotion rule: {item['promotionRule']}",
            f"- Forbidden shortcut: {item['forbiddenShortcut']}",
            "",
            "Variants:",
            "",
        ])
        for var in item["variants"]:
            deltas = "; ".join(f"{key}={value}" for key, value in var["parameterDeltas"].items())
            lines.append(f"- `{var['id']}` {var['label']}: {deltas}. {var['reason']}")
        lines.extend(["", "Evidence:", ""])
        for ev in item["evidenceArtifacts"]:
            status = "present" if ev["exists"] else "missing"
            lines.append(f"- {ev['label']}: `{status}` `{ev['path'] or ev['key']}`")
        lines.append("")
    lines.extend(["## Next safest action", "", report["nextSafestAction"], ""])
    return "\n".join(lines)


def render_html(report: dict[str, Any]) -> str:
    cards = []
    for item in report["plans"]:
        variants = "".join(
            f"<li><strong>{html.escape(var['label'])}</strong>: " + "; ".join(f"<code>{html.escape(k)}={html.escape(v)}</code>" for k, v in var["parameterDeltas"].items()) + f"<br><small>{html.escape(var['reason'])}</small></li>"
            for var in item["variants"]
        )
        evidence = "".join(
            f"<li><span class='{ 'ok' if ev['exists'] else 'missing' }'>{html.escape('present' if ev['exists'] else 'missing')}</span> <code>{html.escape(ev['label'])}</code><br><small>{html.escape(ev['path'] or ev['key'])}</small></li>"
            for ev in item["evidenceArtifacts"]
        )
        cards.append(f"""
        <article class=\"card\">
          <div class=\"meta\"><span>{html.escape(item['stage'])}</span><span>{item['variantCount']} variants</span></div>
          <h2>{html.escape(item['title'])}</h2>
          <p><strong>Proof source:</strong> {html.escape(item['proofWindowSource'])}</p>
          <h3>Variants</h3><ul>{variants}</ul>
          <h3>Pass</h3><p>{html.escape(item['passCondition'])}</p>
          <h3>Fail</h3><p>{html.escape(item['failCondition'])}</p>
          <h3>Promotion rule</h3><p>{html.escape(item['promotionRule'])}</p>
          <h3>Forbidden shortcut</h3><p class=\"danger\">{html.escape(item['forbiddenShortcut'])}</p>
          <details><summary>Evidence</summary><ul>{evidence}</ul></details>
        </article>
        """)
    return f"""<!doctype html>
<html lang=\"en\"><head><meta charset=\"utf-8\"><title>Audio Parameter Sweep Proof Plan</title>
<style>
:root {{ color-scheme: dark; --bg:#11140f; --panel:#1c2419; --leaf:#8fd673; --gold:#e9bf4e; --clay:#d36b4a; --text:#f7f0dc; --muted:#bbae95; }}
body {{ margin:0; font:14px/1.48 -apple-system,BlinkMacSystemFont,"Avenir Next",sans-serif; color:var(--text); background:radial-gradient(circle at 20% -10%, #314b2e, var(--bg) 40%); }}
header {{ padding:32px 42px; border-bottom:1px solid rgba(233,191,78,.28); background:rgba(17,20,15,.88); position:sticky; top:0; backdrop-filter:blur(18px); z-index:2; }}
h1 {{ margin:0; font-size:32px; }} .sub {{ color:var(--muted); margin-top:8px; }} .truth {{ display:flex; flex-wrap:wrap; gap:10px; margin-top:18px; }} .pill {{ padding:8px 11px; border-radius:999px; background:rgba(143,214,115,.13); border:1px solid rgba(143,214,115,.25); color:#d4fac2; }}
main {{ padding:30px 42px 54px; display:grid; grid-template-columns:repeat(auto-fit,minmax(390px,1fr)); gap:18px; }} .card {{ background:linear-gradient(145deg, rgba(28,36,25,.96), rgba(32,27,18,.96)); border:1px solid rgba(233,191,78,.22); border-radius:22px; padding:20px; box-shadow:0 16px 48px rgba(0,0,0,.28); }} .meta {{ display:flex; justify-content:space-between; gap:12px; color:#f2d87a; font-size:11px; text-transform:uppercase; letter-spacing:.11em; }} h2 {{ font-size:20px; margin:14px 0 8px; }} h3 {{ font-size:12px; letter-spacing:.12em; text-transform:uppercase; margin:16px 0 6px; color:#f2d87a; }} code {{ color:#d4fac2; }} small {{ color:var(--muted); }} li {{ margin:8px 0; }} .danger {{ color:#ffb39e; }} summary {{ cursor:pointer; color:#d4fac2; }} .ok {{ color:#9cf06f; font-weight:700; }} .missing {{ color:#ff9278; font-weight:700; }}
</style></head><body>
<header><h1>Audio Parameter Sweep Proof Plan</h1><div class=\"sub\">{html.escape(str(report['baselineId']))}</div><div class=\"truth\"><span class=\"pill\">approval: {html.escape(str(report['approvalStatus']))}</span><span class=\"pill\">human listen required: {str(report['humanListenStillRequired']).lower()}</span><span class=\"pill\">branch inheritance: {str(report['branchInheritanceReady']).lower()}</span><span class=\"pill\">plans: {report['planCount']}</span><span class=\"pill\">variants: {report['variantCount']}</span><span class=\"pill\">missing evidence: {report['missingEvidenceCount']}</span></div></header>
<main>{''.join(cards)}</main></body></html>"""


def write_open_command(path: Path, target: Path) -> None:
    path.write_text(f"#!/bin/zsh\nopen {shell_quote(str(target))}\n", encoding="utf-8")
    os.chmod(path, 0o755)


def register_outputs(manifest: dict[str, Any], report: dict[str, Any], json_path: Path, md_path: Path, html_path: Path, open_command: Path) -> None:
    outputs = manifest.setdefault("outputs", {})
    outputs["latestAudioWorkbenchParameterSweepProofPlan"] = str(json_path)
    outputs["latestAudioWorkbenchParameterSweepProofPlanMarkdown"] = str(md_path)
    outputs["latestAudioWorkbenchParameterSweepProofPlanHtml"] = str(html_path)
    outputs["latestAudioWorkbenchParameterSweepProofPlanOpenCommand"] = str(open_command)
    history = outputs.setdefault("audioWorkbenchParameterSweepProofPlanHistory", [])
    if isinstance(history, list):
        history.append(str(json_path))
    manifest["audioWorkbenchParameterSweepProofPlanCount"] = int(manifest.get("audioWorkbenchParameterSweepProofPlanCount") or 0) + 1
    manifest["audioWorkbenchParameterSweepProofPlanScenarioCount"] = report["planCount"]
    manifest["audioWorkbenchParameterSweepProofPlanVariantCount"] = report["variantCount"]
    manifest["audioWorkbenchParameterSweepProofPlanMissingEvidenceCount"] = report["missingEvidenceCount"]
    manifest["audioWorkbenchParameterSweepProofPlanApprovalStateChanged"] = False
    manifest["audioWorkbenchParameterSweepProofPlanBranchStateChanged"] = False
    manifest["audioWorkbenchParameterSweepProofPlanRenderAttempted"] = False
    manifest["audioWorkbenchParameterSweepProofPlanOriginalMediaMutated"] = False


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
    report = build_plan(manifest, baseline_dir, generated_at)
    out_dir = baseline_dir / f"audio-workbench-parameter-sweep-proof-plan-{slug}-{generated_at}"
    out_dir.mkdir(parents=True, exist_ok=True)
    json_path = out_dir / "parameter-sweep-proof-plan.json"
    md_path = out_dir / f"audio-workbench-parameter-sweep-proof-plan-{slug}-{generated_at}.md"
    html_path = out_dir / "parameter-sweep-proof-plan.html"
    open_command = out_dir / "open-parameter-sweep-proof-plan.command"
    write_json(json_path, report)
    md_path.write_text(render_markdown(report), encoding="utf-8")
    html_path.write_text(render_html(report), encoding="utf-8")
    write_open_command(open_command, html_path)
    register_outputs(manifest, report, json_path, md_path, html_path, open_command)
    write_json(manifest_path, manifest)
    print(f"Parameter sweep proof plan: {md_path}")
    print(f"Parameter sweep proof plan HTML: {html_path}")
    print(f"Plans: {report['planCount']}")
    print(f"Variants: {report['variantCount']}")
    print(f"Missing evidence links: {report['missingEvidenceCount']}")
    print("Approval state changed: false")
    print("Branch state changed: false")
    print("Render attempted: false")
    print("Original media mutated: false")


if __name__ == "__main__":
    main()
