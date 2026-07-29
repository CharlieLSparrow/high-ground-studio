#!/usr/bin/env python3
"""Create a broadcast-polish scorecard for a Quipsly audio baseline.

This scorecard aggregates existing machine evidence and adds a lightweight
stereo/master sanity check so the next review step is visible. It is not an
approval tool. It does not normalize audio, approve audio, render branches,
upload files, or mutate original media.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from html import escape
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class Category:
    id: str
    label: str
    score: int
    status: str
    evidence: list[str]
    risks: list[str]
    next_action: str


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def resolve_baseline_dir(input_path: Path) -> Path:
    input_path = input_path.expanduser()
    if (input_path / "manifest.json").exists():
        return input_path.resolve()
    nested = input_path / "work" / "conformed-production-baseline"
    if (nested / "manifest.json").exists():
        return nested.resolve()
    raise FileNotFoundError(
        "Could not find manifest.json at "
        f"{input_path}/manifest.json or {nested}/manifest.json"
    )


def output_path(value: Any) -> str | None:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        path = value.get("path")
        if isinstance(path, str):
            return path
    return None


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def load_output_report(outputs: dict[str, Any], key: str) -> dict[str, Any]:
    path = output_path(outputs.get(key))
    if not path or not Path(path).exists() or not str(path).endswith(".json"):
        return {}
    try:
        return read_json(Path(path))
    except json.JSONDecodeError:
        return {}


def int_value(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def human_listen_link_counts(report: dict[str, Any]) -> tuple[int, int]:
    """Return (link_count, missing_count) across the known human-listen shapes."""
    if not report:
        return (0, 999)
    link_count = int_value(report.get("linkCount"))
    missing_count = int_value(report.get("missingLinkCount"))
    if "missingLinkCount" in report:
        return (link_count, missing_count)

    missing = report.get("missing")
    if isinstance(missing, list):
        missing_count = len(missing)
    links = report.get("links")
    if isinstance(links, list):
        link_count = len(links)
        missing_count = sum(1 for link in links if isinstance(link, dict) and link.get("exists") is False)
    artifacts = report.get("artifacts")
    if isinstance(artifacts, list):
        link_count = max(link_count, len(artifacts))
        missing_count = max(
            missing_count,
            sum(1 for item in artifacts if isinstance(item, dict) and item.get("exists") is False),
        )
    return (link_count, missing_count)


def float_value(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(number) or math.isinf(number):
        return None
    return number


def parse_astats_value(text: str, label: str) -> float | None:
    patterns = [
        rf"\[Parsed_astats_0[^\]]*\]\s*{re.escape(label)}:\s*(-?\d+(?:\.\d+)?)",
        rf"{re.escape(label)}:\s*(-?\d+(?:\.\d+)?)",
    ]
    for pattern in patterns:
        matches = re.findall(pattern, text)
        if matches:
            return float_value(matches[-1])
    return None


def run_astats(path: str | None) -> dict[str, Any]:
    if not path:
        return {"available": False, "error": "missing master WAV path"}
    media = Path(path)
    if not media.exists():
        return {"available": False, "error": "master WAV file missing", "path": path}
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-nostats",
        "-i",
        str(media),
        "-af",
        "astats=metadata=0:reset=0",
        "-f",
        "null",
        "-",
    ]
    try:
        proc = subprocess.run(cmd, text=True, capture_output=True, check=False, timeout=240)
    except FileNotFoundError:
        return {"available": False, "error": "ffmpeg not found on PATH", "path": path}
    except subprocess.TimeoutExpired:
        return {"available": False, "error": "ffmpeg astats timed out", "path": path}
    text = (proc.stdout or "") + "\n" + (proc.stderr or "")
    return {
        "available": proc.returncode == 0,
        "returnCode": proc.returncode,
        "path": path,
        "peakLevelDb": parse_astats_value(text, "Peak level dB"),
        "rmsLevelDb": parse_astats_value(text, "RMS level dB"),
        "crestFactor": parse_astats_value(text, "Crest factor"),
        "dynamicRange": parse_astats_value(text, "Dynamic range"),
        "dcOffset": parse_astats_value(text, "DC offset"),
        "zeroCrossingsRate": parse_astats_value(text, "Zero crossings rate"),
        "error": None if proc.returncode == 0 else text[-2000:],
    }


def status_for_score(score: int) -> str:
    if score >= 90:
        return "strong"
    if score >= 75:
        return "usable-with-listen-proof"
    if score >= 55:
        return "needs-focused-proof"
    return "needs-repair-before-publication"


def category_loudness(platform: dict[str, Any], quality: dict[str, Any]) -> Category:
    summary = platform.get("summary") if isinstance(platform.get("summary"), dict) else {}
    artifacts = quality.get("artifacts") if isinstance(quality.get("artifacts"), dict) else {}
    master = artifacts.get("masterWav") if isinstance(artifacts.get("masterWav"), dict) else {}
    loudness = master.get("loudness") if isinstance(master.get("loudness"), dict) else {}
    hard = int_value(summary.get("hardGateAttentionCount"))
    advisory = int_value(summary.get("advisoryAttentionCount"))
    ready = summary.get("podcastProfilesMachineReady") is True
    score = 100
    risks: list[str] = []
    if not platform:
        score -= 40
        risks.append("Platform loudness audit is missing.")
    if hard:
        score -= min(60, hard * 20)
        risks.append(f"{hard} hard-gate platform attention item(s).")
    if advisory:
        score -= min(20, advisory * 5)
        risks.append(f"{advisory} advisory platform item(s).")
    if not ready:
        score -= 20
        risks.append("Podcast profile machine-readiness is false or missing.")
    evidence = [
        f"Integrated loudness: {loudness.get('integratedLufs')} LUFS.",
        f"True peak: {loudness.get('truePeakDbfs')} dBFS.",
        f"Platform hard-gate attention: {hard}; advisory attention: {advisory}.",
    ]
    return Category("delivery-loudness", "Delivery loudness and peak discipline", max(0, score), status_for_score(max(0, score)), evidence, risks, "Keep v006 as the current delivery candidate if human listening agrees; do not re-normalize just to chase louder social playback.")


def category_smoothness(smooth: dict[str, Any], astats: dict[str, Any]) -> Category:
    counts = smooth.get("classificationCounts") if isinstance(smooth.get("classificationCounts"), dict) else {}
    hard_edges = int_value(counts.get("hard-silence-edge-listen-check"))
    large_jumps = int_value(counts.get("large-level-jump-listen-check"))
    silence_count = len(smooth.get("longSilenceSpans") or []) if smooth else 0
    smooth_passed = smooth.get("passed") is True if smooth else False
    score = 90 if smooth_passed else 100
    risks: list[str] = []
    if not smooth:
        score -= 35
        risks.append("Smoothness audit is missing.")
    elif not smooth_passed:
        score -= 30
        risks.append("Smoothness audit did not pass.")
    if hard_edges or large_jumps:
        if smooth_passed:
            score -= 10
            risks.append(
                f"{hard_edges} hard-edge and {large_jumps} large-jump listen-check marker(s) remain as review targets, not automatic failure."
            )
        else:
            score -= min(35, hard_edges * 7)
            score -= min(25, large_jumps * 3)
            risks.append(f"{hard_edges} hard silence edge listen-check(s).")
            risks.append(f"{large_jumps} large level-jump listen-check(s).")
    if silence_count:
        score -= min(10 if smooth_passed else 15, silence_count * 2)
        risks.append(f"{silence_count} long low-level span(s) need context.")
    crest = float_value(astats.get("crestFactor"))
    dynamic_range = float_value(astats.get("dynamicRange"))
    if astats and astats.get("available") is False:
        risks.append(f"Whole-master astats unavailable: {astats.get('error')}")
        score -= 5
    evidence = [
        f"Smoothness audit passed: {str(smooth_passed).lower()}.",
        f"Hard silence edges: {hard_edges}; large level jumps: {large_jumps}; long low-level spans: {silence_count}.",
        f"RMS level: {astats.get('rmsLevelDb')} dB; crest factor: {crest}; dynamic range: {dynamic_range}.",
    ]
    return Category("smoothness-and-dynamics", "Smoothness, dynamics, and gating naturalness", max(0, score), status_for_score(max(0, score)), evidence, risks, "Prioritize listen checks at hard edges, big jumps, and long low-level spans before rendering edit branches.")


def category_source_preservation(spine: dict[str, Any], preservation: dict[str, Any], contribution: dict[str, Any]) -> Category:
    score = 100
    risks: list[str] = []
    sanity_passed = spine.get("passed") is True if spine else False
    render_failures = int_value(preservation.get("renderFailureCount")) if preservation else 0
    rendered = int_value(preservation.get("renderedSnippetCount")) if preservation else 0
    item_count = int_value(preservation.get("itemCount")) if preservation else 0
    speaker_summaries = contribution.get("speakerSummaries") if isinstance(contribution.get("speakerSummaries"), list) else []
    if not sanity_passed:
        score -= 35
        risks.append("Audio spine listen sanity check did not pass or is missing.")
    if not preservation:
        score -= 25
        risks.append("Speaker preservation proof pack is missing.")
    if render_failures:
        score -= min(25, render_failures * 5)
        risks.append(f"Speaker preservation proof pack has {render_failures} render failure(s).")
    if item_count < 8 or rendered < 16:
        score -= 10
        risks.append("Speaker preservation proof coverage is thinner than expected.")
    evidence = [
        f"Spine listen sanity passed: {str(sanity_passed).lower()}.",
        f"Speaker preservation proof pack: {item_count} items, {rendered} snippets, {render_failures} failures.",
        f"Speaker contribution summaries available: {len(speaker_summaries)}.",
    ]
    return Category("source-preservation", "Charlie/Homer source preservation", max(0, score), status_for_score(max(0, score)), evidence, risks, "Use speaker preservation A/B snippets to prove neither host was over-gated or accidentally suppressed.")


def category_review_readiness(manifest: dict[str, Any], human_session: dict[str, Any], fast_pass: dict[str, Any], queue: dict[str, Any]) -> Category:
    score = 100
    risks: list[str] = []
    link_count, missing_links = human_listen_link_counts(human_session)
    fast_items = int_value(fast_pass.get("itemCount")) if fast_pass else 0
    queue_waiting = int_value(queue.get("waitingForNotesCount")) if queue else 0
    if not manifest.get("packageReadyForHumanListen"):
        score -= 30
        risks.append("Package is not marked ready for human listen.")
    if missing_links:
        score -= min(35, missing_links * 5)
        risks.append(f"Human listen session has {missing_links} missing link(s).")
    if fast_items < 12:
        score -= 15
        risks.append("Final-listen fast pass has too few focused checks or is missing.")
    if manifest.get("branchInheritanceReady"):
        risks.append("Branch inheritance is unexpectedly ready; verify this was a real human approval.")
        score -= 20
    evidence = [
        f"Human listen session links: {link_count}; missing links: {missing_links}.",
        f"Final-listen fast-pass items: {fast_items}.",
        f"Post-review queue waiting-for-notes count: {queue_waiting}.",
        f"Branch inheritance ready: {str(bool(manifest.get('branchInheritanceReady'))).lower()}.",
    ]
    return Category("review-readiness", "Human/agent review readiness", max(0, score), status_for_score(max(0, score)), evidence, risks, "Open START_HERE or the human-listen session, listen, export notes, and route them through the post-review queue.")


def category_restoration_control(dx_validation: dict[str, Any], dx_planner: dict[str, Any], reusable: dict[str, Any]) -> Category:
    score = 82
    risks: list[str] = []
    status = dx_validation.get("status") if dx_validation else "missing"
    planner_status = dx_planner.get("status") if dx_planner else "missing"
    reusable_ready = reusable.get("reuseReadiness") if reusable else "missing"
    if status == "waiting-for-bounces":
        risks.append("dxRevive/manual restoration path is intentionally waiting for returned bounces; no restoration has secretly entered v006.")
    elif status not in ("all-bounces-validated", "waiting-for-bounces"):
        score -= 20
        risks.append(f"dxRevive validation status is {status}.")
    if planner_status == "waiting-for-validated-dxrevive-bounces":
        risks.append("dxRevive proof candidate planner is safely refusing proof rendering until returns validate.")
    if not reusable:
        score -= 15
        risks.append("Reusable audio production profile is missing.")
    evidence = [
        f"dxRevive validation status: {status}.",
        f"dxRevive proof planner status: {planner_status}.",
        f"Reusable profile readiness: {reusable_ready}.",
    ]
    return Category("restoration-control", "Restoration and future-profile control", max(0, score), status_for_score(max(0, score)), evidence, risks, "Keep restoration as a controlled derived-stem lane; do not let returned bounces affect the master without validation and proof snippets.")


def category_to_dict(category: Category) -> dict[str, Any]:
    return {
        "id": category.id,
        "label": category.label,
        "score": category.score,
        "status": category.status,
        "evidence": category.evidence,
        "risks": category.risks,
        "nextAction": category.next_action,
    }


def build_report(baseline_dir: Path, manifest: dict[str, Any], generated_at: str) -> dict[str, Any]:
    outputs = manifest.get("outputs") or {}
    quality = load_output_report(outputs, "qualityReport")
    platform = load_output_report(outputs, "latestAudioPlatformLoudnessAudit")
    smooth = load_output_report(outputs, "latestAudioMasterSmoothnessAudit")
    spine = load_output_report(outputs, "latestAudioSpineListenSanityCheck")
    preservation = load_output_report(outputs, "latestAudioSpeakerPreservationProofPack")
    contribution = load_output_report(outputs, "latestAudioSpeakerContributionLedger")
    human_session = load_output_report(outputs, "latestHumanListenSession")
    fast_pass = load_output_report(outputs, "latestAudioFinalListenFastPass")
    queue = load_output_report(outputs, "latestAudioPostReviewActionQueue")
    dx_validation = load_output_report(outputs, "latestDxReviveBounceValidation")
    dx_planner = load_output_report(outputs, "latestDxReviveProofCandidatePlanner")
    reusable = load_output_report(outputs, "latestReusableAudioProductionProfile")
    master_wav = output_path(outputs.get("masterWav"))
    astats = run_astats(master_wav)

    categories = [
        category_loudness(platform, quality),
        category_smoothness(smooth, astats),
        category_source_preservation(spine, preservation, contribution),
        category_review_readiness(manifest, human_session, fast_pass, queue),
        category_restoration_control(dx_validation, dx_planner, reusable),
    ]
    overall = round(sum(category.score for category in categories) / len(categories), 1) if categories else 0.0
    blocking_risks = [risk for category in categories if category.score < 75 for risk in category.risks]
    if any(category.score < 75 for category in categories):
        overall_status = "needs-focused-proof-or-repair"
    elif all(category.score >= 90 for category in categories):
        overall_status = "machine-strong-human-listen-required"
    elif overall >= 75:
        overall_status = "machine-usable-needs-human-listen"
    else:
        overall_status = "needs-focused-proof-or-repair"

    return {
        "schema": "quipsly.audio-workbench.broadcast-polish-scorecard.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "generatedAtSlug": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": manifest.get("baselineId"),
        "approvalStatus": manifest.get("approvalStatus"),
        "packageReadyForHumanListen": bool(manifest.get("packageReadyForHumanListen")),
        "branchInheritanceReady": bool(manifest.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest.get("branchRenderReady")),
        "overallScore": overall,
        "overallStatus": overall_status,
        "categories": [category_to_dict(category) for category in categories],
        "astats": astats,
        "sourceReports": {
            "qualityReport": output_path(outputs.get("qualityReport")),
            "platformLoudnessAudit": output_path(outputs.get("latestAudioPlatformLoudnessAudit")),
            "smoothnessAudit": output_path(outputs.get("latestAudioMasterSmoothnessAudit")),
            "spineListenSanity": output_path(outputs.get("latestAudioSpineListenSanityCheck")),
            "speakerPreservationProofPack": output_path(outputs.get("latestAudioSpeakerPreservationProofPack")),
            "humanListenSession": output_path(outputs.get("latestHumanListenSession")),
        },
        "publicationApproved": False,
        "humanListenStillRequired": manifest.get("approvalStatus") != "human-approved-for-branch-inheritance",
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "originalMediaMutated": False,
        "nextSafestStep": "Use this scorecard as the producer-facing overview, then listen through the final-listen fast pass or human-listen session before recording any approval or repair decision.",
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Broadcast Polish Scorecard: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "This scorecard aggregates machine evidence for broadcast-style polish. It does not approve audio, render branches, upload files, publish, or mutate source media.",
        "",
        "## Current truth",
        "",
        f"- Overall score: `{report['overallScore']}`",
        f"- Overall status: `{report['overallStatus']}`",
        f"- Approval status: `{report['approvalStatus']}`",
        f"- Human listen still required: `{str(report['humanListenStillRequired']).lower()}`",
        f"- Branch inheritance ready: `{str(report['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(report['branchRenderReady']).lower()}`",
        "",
        "## Category scorecard",
        "",
        "| Category | Score | Status | Evidence | Risks | Next action |",
        "|---|---:|---|---|---|---|",
    ]
    for category in report["categories"]:
        evidence = "<br>".join(category["evidence"])
        risks = "<br>".join(category["risks"]) or "No machine risks in this category."
        lines.append(
            f"| {category['label']} | `{category['score']}` | `{category['status']}` | {evidence} | {risks} | {category['nextAction']} |"
        )
    lines.extend([
        "",
        "## Whole-master astats snapshot",
        "",
        f"- Available: `{str(report['astats'].get('available')).lower()}`",
        f"- Peak level dB: `{report['astats'].get('peakLevelDb')}`",
        f"- RMS level dB: `{report['astats'].get('rmsLevelDb')}`",
        f"- Crest factor: `{report['astats'].get('crestFactor')}`",
        f"- Dynamic range: `{report['astats'].get('dynamicRange')}`",
        f"- DC offset: `{report['astats'].get('dcOffset')}`",
        "",
        "## Source reports",
        "",
    ])
    for key, value in report["sourceReports"].items():
        lines.append(f"- {key}: `{value or 'not registered'}`")
    lines.extend([
        "",
        "## Guardrails",
        "",
        f"- Publication approved: `{str(report['publicationApproved']).lower()}`",
        f"- Approval state changed: `{str(report['approvalStateChanged']).lower()}`",
        f"- Branch state changed: `{str(report['branchStateChanged']).lower()}`",
        f"- Render attempted: `{str(report['renderAttempted']).lower()}`",
        f"- Original media mutated: `{str(report['originalMediaMutated']).lower()}`",
        "",
        "## Next safest step",
        "",
        report["nextSafestStep"],
        "",
    ])
    return "\n".join(lines)


def render_html(report: dict[str, Any]) -> str:
    cards = []
    for category in report["categories"]:
        evidence = "".join(f"<li>{escape(item)}</li>" for item in category["evidence"])
        risks = "".join(f"<li>{escape(item)}</li>" for item in category["risks"]) or "<li>No machine risks in this category.</li>"
        cards.append(
            f"""
            <article class=\"card {escape(category['status'])}\">
              <div class=\"score\">{escape(str(category['score']))}</div>
              <h2>{escape(category['label'])}</h2>
              <p class=\"status\">{escape(category['status'])}</p>
              <h3>Evidence</h3><ul>{evidence}</ul>
              <h3>Risks</h3><ul>{risks}</ul>
              <p class=\"next\">{escape(category['nextAction'])}</p>
            </article>
            """
        )
    return f"""<!doctype html>
<html lang=\"en\">
<head>
<meta charset=\"utf-8\">
<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">
<title>Quipsly Broadcast Polish Scorecard</title>
<style>
:root {{ color-scheme: dark; --bg:#101713; --panel:#18251f; --ink:#f5ecd8; --muted:#b9ad93; --gold:#f4ca42; --green:#69d37b; --clay:#d56b4b; --blue:#59b8d8; --line:rgba(245,236,216,.16); }}
body {{ margin:0; font:15px/1.55 -apple-system,BlinkMacSystemFont,"Avenir Next","Segoe UI",sans-serif; color:var(--ink); background:radial-gradient(circle at 12% 8%,rgba(105,211,123,.18),transparent 30rem),radial-gradient(circle at 90% 18%,rgba(244,202,66,.14),transparent 24rem),var(--bg); }}
main {{ max-width:1180px; margin:0 auto; padding:34px; }}
header {{ border:1px solid var(--line); background:rgba(24,37,31,.92); border-radius:30px; padding:30px; margin-bottom:18px; box-shadow:0 24px 80px rgba(0,0,0,.28); }}
h1 {{ margin:0 0 8px; font-size:clamp(34px,5vw,64px); line-height:.95; letter-spacing:-.05em; }}
.truth {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:12px; margin-top:22px; }}
.truth span {{ background:rgba(255,255,255,.06); border:1px solid var(--line); border-radius:16px; padding:12px; color:var(--muted); }}
b {{ display:block; color:var(--ink); font-size:20px; }}
.grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(310px,1fr)); gap:16px; }}
.card {{ border:1px solid var(--line); background:rgba(24,37,31,.9); border-radius:24px; padding:20px; position:relative; overflow:hidden; }}
.card::before {{ content:""; position:absolute; inset:0 0 auto 0; height:5px; background:var(--blue); }}
.card.strong::before {{ background:var(--green); }} .card.usable-with-listen-proof::before {{ background:var(--gold); }} .card.needs-focused-proof::before,.card.needs-repair-before-publication::before {{ background:var(--clay); }}
.score {{ float:right; background:rgba(0,0,0,.35); border:1px solid var(--line); border-radius:18px; padding:12px 14px; font-weight:800; font-size:24px; color:var(--gold); }}
h2 {{ margin:8px 0 2px; }} h3 {{ color:var(--gold); letter-spacing:.08em; text-transform:uppercase; font-size:12px; }}
.status,.next,li,p {{ color:var(--muted); }} .next {{ color:var(--ink); }}
</style>
</head>
<body>
<main>
<header>
  <h1>Broadcast polish scorecard</h1>
  <p>Machine evidence for whether this audio spine behaves like a stable delivery master. Human listening still owns approval.</p>
  <div class=\"truth\">
    <span>Overall score <b>{escape(str(report['overallScore']))}</b></span>
    <span>Status <b>{escape(str(report['overallStatus']))}</b></span>
    <span>Human listen required <b>{escape(str(report['humanListenStillRequired']).lower())}</b></span>
    <span>Branch inheritance <b>{escape(str(report['branchInheritanceReady']).lower())}</b></span>
  </div>
</header>
<section class=\"grid\">
{''.join(cards)}
</section>
</main>
</body>
</html>
"""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    baseline_id = str(manifest.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    out_dir = baseline_dir / f"audio-broadcast-polish-scorecard-{slug}-{generated_at}"
    out_dir.mkdir(parents=True, exist_ok=False)

    report = build_report(baseline_dir, manifest, generated_at)
    json_path = out_dir / "broadcast-polish-scorecard.json"
    md_path = out_dir / "broadcast-polish-scorecard.md"
    html_path = out_dir / "broadcast-polish-scorecard.html"
    command_path = out_dir / "open-broadcast-polish-scorecard.command"

    write_json(json_path, report)
    md_path.write_text(render_markdown(report) + "\n", encoding="utf-8")
    html_path.write_text(render_html(report), encoding="utf-8")
    command_path.write_text(f"#!/bin/zsh\nset -e\nopen {shell_quote(str(html_path))}\n", encoding="utf-8")
    os.chmod(command_path, 0o755)

    outputs["latestAudioBroadcastPolishScorecard"] = str(json_path)
    outputs["latestAudioBroadcastPolishScorecardMarkdown"] = str(md_path)
    outputs["latestAudioBroadcastPolishScorecardHtml"] = str(html_path)
    outputs["latestAudioBroadcastPolishScorecardOpenCommand"] = str(command_path)
    for key, value in [
        ("audioBroadcastPolishScorecardHistory", str(json_path)),
        ("audioBroadcastPolishScorecardMarkdownHistory", str(md_path)),
        ("audioBroadcastPolishScorecardHtmlHistory", str(html_path)),
        ("audioBroadcastPolishScorecardOpenCommandHistory", str(command_path)),
    ]:
        history = outputs.setdefault(key, [])
        if value not in history:
            history.append(value)
    manifest["latestAudioBroadcastPolishScorecardGeneratedAt"] = report["generatedAt"]
    manifest["audioBroadcastPolishOverallScore"] = report["overallScore"]
    manifest["audioBroadcastPolishOverallStatus"] = report["overallStatus"]
    write_json(manifest_path, manifest)

    print(f"Wrote {json_path}")
    print(f"Wrote {md_path}")
    print(f"Wrote {html_path}")
    print(f"Open with {command_path}")
    print(json.dumps({"overallScore": report["overallScore"], "overallStatus": report["overallStatus"]}, sort_keys=True))


if __name__ == "__main__":
    main()
