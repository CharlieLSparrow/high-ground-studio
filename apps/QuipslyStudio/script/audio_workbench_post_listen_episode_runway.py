#!/usr/bin/env python3
"""Create the Episode 4 post-listen episode/shorts runway.

This packet answers the question: after Charlie listens to the v006 mastered
audio spine, what is the next safe move toward publishable Episode 4 videos,
podcast audio, and shorts?

It is deliberately a runway, not an autopilot. It does not approve audio,
unlock branches, render, upload, publish, schedule, or mutate original media.
"""

from __future__ import annotations

import argparse
import json
import os
import shlex
from datetime import datetime, timezone
from html import escape
from pathlib import Path
from typing import Any


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def shell_quote(value: str) -> str:
    return shlex.quote(value)


def output_path(value: Any) -> str | None:
    if isinstance(value, str) and value:
        return value
    if isinstance(value, dict):
        for key in (
            "path",
            "jsonPath",
            "markdownPath",
            "htmlPath",
            "openCommand",
            "m4aPath",
            "playlistPath",
        ):
            candidate = value.get(key)
            if isinstance(candidate, str) and candidate:
                return candidate
    return None


def existing_output(outputs: dict[str, Any], key: str) -> str | None:
    path = output_path(outputs.get(key))
    if path and Path(path).exists():
        return path
    return None


def file_summary(path: str | None) -> dict[str, Any]:
    if not path:
        return {"path": None, "exists": False, "sizeBytes": 0, "sizeMb": 0}
    candidate = Path(path)
    exists = candidate.exists()
    size = candidate.stat().st_size if exists else 0
    return {
        "path": path,
        "exists": exists,
        "sizeBytes": size,
        "sizeMb": round(size / (1024 * 1024), 2) if exists else 0,
    }


def load_output_report(outputs: dict[str, Any], key: str) -> dict[str, Any]:
    path = existing_output(outputs, key)
    if not path or Path(path).suffix.lower() != ".json":
        return {}
    try:
        return read_json(Path(path))
    except json.JSONDecodeError:
        return {}


def build_route(
    name: str,
    status: str,
    condition: str,
    next_action: str,
    artifacts: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "name": name,
        "status": status,
        "condition": condition,
        "nextAction": next_action,
        "artifacts": artifacts,
    }


def artifact(label: str, path: str | None, why: str) -> dict[str, Any]:
    summary = file_summary(path)
    return {
        "label": label,
        "path": path,
        "exists": summary["exists"],
        "sizeMb": summary["sizeMb"],
        "why": why,
    }


def status_for(approval_status: str, branch_inheritance_ready: bool, branch_render_ready: bool, hard_stops: list[str]) -> str:
    if hard_stops:
        return "needs-post-listen-runway-attention"
    if approval_status == "human-approved-for-branch-inheritance" and branch_inheritance_ready and branch_render_ready:
        return "approved-render-runway-visible"
    if approval_status == "human-approved-for-branch-inheritance":
        return "approved-refresh-branch-gates"
    if "fail" in approval_status or "repair" in approval_status:
        return "failed-or-repair-route-visible"
    return "waiting-for-human-listen"


def build_report(baseline_dir: Path) -> dict[str, Any]:
    manifest = read_json(baseline_dir / "manifest.json")
    outputs = manifest.get("outputs") if isinstance(manifest.get("outputs"), dict) else {}
    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    approval_status = str(manifest.get("approvalStatus") or "unknown")
    branch_inheritance_ready = bool(manifest.get("branchInheritanceReady"))
    branch_render_ready = bool(manifest.get("branchRenderReady"))
    package_ready = bool(manifest.get("packageReadyForHumanListen"))

    morning_launcher = load_output_report(outputs, "latestAudioMorningAudioReviewLauncher")
    quality_matrix = load_output_report(outputs, "latestAudioQualityMethodsMatrix")
    spectral_fatigue = load_output_report(outputs, "latestAudioSpectralFatigueAudit")
    translation_survival = load_output_report(outputs, "latestAudioTranslationSurvivalAudit")
    morning_packet = load_output_report(outputs, "latestAudioMorningPublicationReadinessPacket")
    branch_preflight = load_output_report(outputs, "branchRenderPreflight")
    if not branch_preflight:
        branch_preflight = load_output_report(outputs, "latestBranchRenderPreflight")

    listen_file = (
        manifest.get("audioMorningPublicationReadinessRecommendedListeningFile")
        or output_path(outputs.get("masterM4a"))
        or str(baseline_dir / "episode4-mastered-audio-spine-v006.m4a")
    )
    audio_file = (
        manifest.get("audioMorningPublicationReadinessRecommendedAudioFile")
        or output_path(outputs.get("masterWav"))
        or str(baseline_dir / "episode4-mastered-audio-spine-v006.wav")
    )

    doors = {
        "morningReview": existing_output(outputs, "latestAudioMorningAudioReviewLauncherOpenCommand"),
        "humanDecisionFrontDoor": existing_output(outputs, "latestHumanListenDecisionFrontDoorOpenCommand"),
        "humanDecisionFrontDoorHtml": existing_output(outputs, "latestHumanListenDecisionFrontDoorHtml"),
        "scopedV007Planner": existing_output(outputs, "latestAudioScopedV007RepairCandidatePlanHtml"),
        "postReviewActionQueue": existing_output(outputs, "latestAudioPostReviewActionQueueMarkdown"),
        "branchInheritanceGate": existing_output(outputs, "latestBranchInheritanceGateHtml"),
        "branchRenderPreflight": existing_output(outputs, "branchRenderPreflightHtml"),
        "postApprovalRenderRehearsal": existing_output(outputs, "latestAudioPostApprovalRenderRehearsalHtml"),
        "approvedBranchRenderExecutor": existing_output(outputs, "latestApprovedBranchRenderExecutorMarkdown"),
        "qualityMethodsMatrix": existing_output(outputs, "latestAudioQualityMethodsMatrixHtml"),
        "spectralFatigueAudit": existing_output(outputs, "latestAudioSpectralFatigueAuditHtml"),
        "translationSurvivalAudit": existing_output(outputs, "latestAudioTranslationSurvivalAuditHtml"),
        "morningPublicationReadiness": existing_output(outputs, "latestAudioMorningPublicationReadinessPacketHtml"),
        "producerCommandCenter": existing_output(outputs, "latestAudioProducerCommandCenterHtml"),
    }

    hard_stops: list[str] = []
    if not file_summary(str(listen_file) if listen_file else None)["exists"]:
        hard_stops.append("Listening M4A is missing.")
    if not file_summary(str(audio_file) if audio_file else None)["exists"]:
        hard_stops.append("Premiere/podcast WAV spine is missing.")
    if not package_ready:
        hard_stops.append("Package is not marked ready for human listen.")
    if not doors["morningReview"]:
        hard_stops.append("Morning review launcher is missing.")
    if not doors["humanDecisionFrontDoor"]:
        hard_stops.append("Human listen decision front-door command is missing.")
    if not doors["scopedV007Planner"]:
        hard_stops.append("Scoped v007 repair planner is missing.")
    if not doors["qualityMethodsMatrix"]:
        hard_stops.append("Quality methods matrix is missing.")
    if not doors["spectralFatigueAudit"]:
        hard_stops.append("Spectral fatigue audit is missing.")
    if not doors["translationSurvivalAudit"]:
        hard_stops.append("Translation survival audit is missing.")

    routes = [
        build_route(
            "Pass v006 audio spine",
            "locked-until-human-listen-pass" if approval_status != "human-approved-for-branch-inheritance" else "ready-to-refresh-branch-gates",
            "Use only after Charlie/Mako listens and explicitly passes the v006 spine.",
            "Record the guarded human listen decision, refresh the control plane, then use branch gate/preflight before rendering Episode 4 packages.",
            [
                artifact("Human decision front door", doors["humanDecisionFrontDoor"], "Records pass/fail/needs-proof with typed human confirmation."),
                artifact("Spectral fatigue audit", doors["spectralFatigueAudit"], "Names rumble, mud, thinness, harshness, hiss, and over-squash listen targets before branches inherit the spine."),
                artifact("Translation survival audit", doors["translationSurvivalAudit"], "Confirms critical proof windows survived AAC, MP3, and phone-style listener transformations before branches inherit the spine."),
                artifact("Branch inheritance gate", doors["branchInheritanceGate"], "Proves edit branches may inherit the clean v006 production spine after approval."),
                artifact("Branch render preflight", doors["branchRenderPreflight"], "Shows which long-form and shorts branch renders are allowed after inheritance."),
                artifact("Post-approval render rehearsal", doors["postApprovalRenderRehearsal"], "Dry-run branch family map for the three Episode 4 render candidates before the guarded executor runs."),
                artifact("Guarded branch executor", doors["approvedBranchRenderExecutor"], "Exposes or runs real branch renders only after approval and branch gates pass."),
            ],
        ),
        build_route(
            "Fail v006 audio spine",
            "ready-for-exact-notes" if approval_status != "human-approved-for-branch-inheritance" else "not-current-path",
            "Use if the listen reveals echo, missing Homer, over-gating, harshness, noise, or unnatural cadence.",
            "Export exact notes, keep v006 preserved, and route notes into the scoped v007 planner instead of overwriting the candidate.",
            [
                artifact("Post-review action queue", doors["postReviewActionQueue"], "Collects notes into repair/proof/pass context."),
                artifact("Scoped v007 planner", doors["scopedV007Planner"], "Turns notes into stage-owned v007 repair/proof candidates."),
            ],
        ),
        build_route(
            "Needs focused proof",
            "ready-for-focused-proof-notes",
            "Use if the full listen mostly passes but one moment needs a proof window or A/B comparison.",
            "Mark only the specific window as needs-proof; do not rerender the whole spine unless the proof confirms a real issue.",
            [
                artifact("Quality methods matrix", doors["qualityMethodsMatrix"], "Separates objective checks from human-listen risks."),
                artifact("Morning publication readiness", doors["morningPublicationReadiness"], "Keeps platform package readiness separate from audio approval."),
            ],
        ),
    ]

    audio_spine_gate = {
        "status": "ready-for-human-listen" if not hard_stops else "blocked-before-human-listen",
        "methodCount": quality_matrix.get("methodCount"),
        "hardStopCount": quality_matrix.get("hardStopCount"),
        "reviewRiskCount": quality_matrix.get("reviewRiskCount"),
        "spectralFatigueStatus": spectral_fatigue.get("status"),
        "spectralFatigueHardStopCount": spectral_fatigue.get("hardStopCount"),
        "spectralFatigueReviewRiskCount": spectral_fatigue.get("reviewRiskCount"),
        "translationSurvivalStatus": translation_survival.get("status"),
        "translationSurvivalHardStopCount": translation_survival.get("hardStopCount"),
        "translationSurvivalReviewRiskCount": translation_survival.get("reviewRiskCount"),
        "target": "Episode 4 high-quality mastered audio spine",
    }
    final_episode_gate = {
        "status": "locked-until-audio-spine-approved" if approval_status != "human-approved-for-branch-inheritance" else "branch-preflight-required",
        "target": "Episode 4 long-form video plus audio-only podcast package",
        "why": "Final episodes need the approved spine plus branch render/preflight evidence, not just a good WAV.",
    }
    shorts_gate = {
        "status": "locked-until-audio-spine-approved" if approval_status != "human-approved-for-branch-inheritance" else "branch-preflight-required",
        "target": "Episode 4 9:16 shorts package",
        "why": "Shorts add hook/pacing/caption/aspect checks after the shared audio spine is trusted.",
    }

    status = status_for(approval_status, branch_inheritance_ready, branch_render_ready, hard_stops)
    review_risks = [
        "Human listen still decides whether the spine sounds natural.",
        "Final episode and shorts are downstream quality gates, not proved by audio-spine QC alone.",
        "Branch renders remain intentionally locked until the guarded approval path runs.",
    ]
    return {
        "schema": "quipsly.audio-workbench.post-listen-episode-runway.v1",
        "generatedAt": generated_at,
        "baselineId": manifest.get("baselineId"),
        "status": status,
        "hardStopCount": len(hard_stops),
        "hardStops": hard_stops,
        "reviewRiskCount": len(review_risks),
        "reviewRisks": review_risks,
        "approvalStatus": approval_status,
        "packageReadyForHumanListen": package_ready,
        "branchInheritanceReady": branch_inheritance_ready,
        "branchRenderReady": branch_render_ready,
        "recommendedListeningFile": file_summary(str(listen_file) if listen_file else None),
        "recommendedAudioFile": file_summary(str(audio_file) if audio_file else None),
        "qualityGates": {
            "audioSpine": audio_spine_gate,
            "finalEpisode": final_episode_gate,
            "shorts": shorts_gate,
        },
        "routeCount": len(routes),
        "routes": routes,
        "commandDoors": doors,
        "morningLauncherStatus": morning_launcher.get("status") if morning_launcher else "not-generated",
        "morningPublicationReadinessStatus": morning_packet.get("status") if morning_packet else "not-generated",
        "branchRenderPreflightStatus": branch_preflight.get("status") if branch_preflight else "not-generated",
        "nextSafeAction": "Listen to the v006 M4A. Pass/fail/needs-proof through the guarded decision front door. Only after a real pass should branch gates refresh and final Episode 4 package renders proceed.",
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Episode 4 post-listen episode runway: {report['baselineId']}",
        "",
        f"- Status: `{report['status']}`",
        f"- Approval: `{report['approvalStatus']}`",
        f"- Package ready for human listen: `{str(report['packageReadyForHumanListen']).lower()}`",
        f"- Branch inheritance ready: `{str(report['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(report['branchRenderReady']).lower()}`",
        f"- Hard stops: `{report['hardStopCount']}`",
        f"- Spectral fatigue: `{report['qualityGates']['audioSpine'].get('spectralFatigueStatus')}`; hard stops `{report['qualityGates']['audioSpine'].get('spectralFatigueHardStopCount')}`; risks `{report['qualityGates']['audioSpine'].get('spectralFatigueReviewRiskCount')}`",
        f"- Translation survival: `{report['qualityGates']['audioSpine'].get('translationSurvivalStatus')}`; hard stops `{report['qualityGates']['audioSpine'].get('translationSurvivalHardStopCount')}`; risks `{report['qualityGates']['audioSpine'].get('translationSurvivalReviewRiskCount')}`",
        "",
        "## The important distinction",
        "",
        "- Current gate: high-quality Episode 4 audio spine.",
        "- Next gate after approval: final long-form episode and podcast package.",
        "- Next gate after that: shorts packages with pacing, captions, aspect, and platform prep.",
        "",
        "## Listen/use files",
        "",
        f"- Listening M4A: `{report['recommendedListeningFile'].get('path')}`",
        f"- WAV spine for Premiere/podcast/editing: `{report['recommendedAudioFile'].get('path')}`",
        "",
        "## Quality gates",
        "",
    ]
    for name, gate in report["qualityGates"].items():
        lines.append(f"### {name}")
        lines.append(f"- Status: `{gate.get('status')}`")
        lines.append(f"- Target: {gate.get('target')}")
        if gate.get("why"):
            lines.append(f"- Why: {gate.get('why')}")
        lines.append("")
    lines.extend(["## Routes after human listen", ""])
    for route in report["routes"]:
        lines.append(f"### {route['name']}")
        lines.append(f"- Status: `{route['status']}`")
        lines.append(f"- Condition: {route['condition']}")
        lines.append(f"- Next action: {route['nextAction']}")
        for item in route["artifacts"]:
            marker = "OK" if item["exists"] else "MISSING"
            lines.append(f"- `{marker}` {item['label']}: `{item.get('path') or 'not registered'}`")
        lines.append("")
    if report["hardStops"]:
        lines.extend(["## Hard stops", ""])
        lines.extend(f"- {item}" for item in report["hardStops"])
        lines.append("")
    lines.extend(
        [
            "## Guardrails",
            "",
            "- Approval state changed: `false`",
            "- Branch state changed: `false`",
            "- Render attempted: `false`",
            "- Upload attempted: `false`",
            "- Publication attempted: `false`",
            "- Original media mutated: `false`",
            "",
            "## Next safe action",
            "",
            report["nextSafeAction"],
            "",
        ]
    )
    return "\n".join(lines)


def render_html(report: dict[str, Any]) -> str:
    gate_cards = []
    for name, gate in report["qualityGates"].items():
        gate_cards.append(
            f"""
            <article class="card">
              <div class="eyebrow">{escape(name)}</div>
              <h3>{escape(str(gate.get('status')))}</h3>
              <p>{escape(str(gate.get('target')))}</p>
              <small>{escape(str(gate.get('why') or ''))}</small>
            </article>
            """
        )
    route_cards = []
    for route in report["routes"]:
        artifacts = "".join(
            f"<li><span>{'OK' if item['exists'] else 'MISSING'}</span> {escape(item['label'])}<br><code>{escape(str(item.get('path') or 'not registered'))}</code></li>"
            for item in route["artifacts"]
        )
        route_cards.append(
            f"""
            <article class="route">
              <h3>{escape(route['name'])}</h3>
              <div class="status">{escape(route['status'])}</div>
              <p><strong>Condition:</strong> {escape(route['condition'])}</p>
              <p><strong>Next action:</strong> {escape(route['nextAction'])}</p>
              <ul>{artifacts}</ul>
            </article>
            """
        )
    hard = "".join(f"<li>{escape(item)}</li>" for item in report["hardStops"]) or "<li>None</li>"
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Episode 4 post-listen runway</title>
  <style>
    :root {{ color-scheme: dark; --bg:#101711; --panel:#17241b; --ink:#f4ead3; --muted:#baad93; --gold:#e8c24a; --moss:#79c98d; --clay:#ce7152; --line:rgba(244,234,211,.15); }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; background:radial-gradient(circle at top left,#2d3e25,var(--bg) 46%); color:var(--ink); }}
    main {{ width:min(1280px,calc(100vw - 48px)); margin:32px auto 64px; }}
    .hero,.card,.route,.panel {{ border:1px solid var(--line); background:linear-gradient(180deg,rgba(255,255,255,.035),rgba(0,0,0,.08)),var(--panel); border-radius:24px; padding:22px; box-shadow:0 24px 70px rgba(0,0,0,.28); }}
    h1 {{ font-size:clamp(36px,6vw,72px); line-height:.9; margin:8px 0 12px; }}
    .eyebrow {{ color:var(--gold); letter-spacing:.16em; text-transform:uppercase; font-weight:900; font-size:12px; }}
    .truth,.grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:12px; }}
    .pill {{ border:1px solid var(--line); border-radius:999px; padding:10px 14px; background:rgba(0,0,0,.2); color:var(--muted); }}
    .pill strong,.status {{ color:var(--gold); }}
    .card h3,.route h3 {{ margin:8px 0; }}
    .route {{ margin:14px 0; }}
    code {{ color:var(--moss); word-break:break-all; }}
    li {{ margin:8px 0; }}
    a {{ color:var(--moss); font-weight:800; }}
  </style>
</head>
<body>
<main>
  <section class="hero">
    <div class="eyebrow">Quipsly Audio Workbench</div>
    <h1>Post-listen runway</h1>
    <p>Use this after the morning listen. It separates audio-spine approval from final episode and shorts rendering.</p>
    <div class="truth">
      <div class="pill"><strong>Status</strong> {escape(report['status'])}</div>
      <div class="pill"><strong>Approval</strong> {escape(report['approvalStatus'])}</div>
      <div class="pill"><strong>Branch inheritance</strong> {str(report['branchInheritanceReady']).lower()}</div>
      <div class="pill"><strong>Branch render</strong> {str(report['branchRenderReady']).lower()}</div>
    </div>
  </section>
  <section>
    <h2>Quality gates</h2>
    <div class="grid">{''.join(gate_cards)}</div>
  </section>
  <section class="panel">
    <h2>Listen/use files</h2>
    <p>Listening M4A: <code>{escape(str(report['recommendedListeningFile'].get('path')))}</code></p>
    <p>WAV spine: <code>{escape(str(report['recommendedAudioFile'].get('path')))}</code></p>
  </section>
  <section>
    <h2>Routes after human listen</h2>
    {''.join(route_cards)}
  </section>
  <section class="panel">
    <h2>Hard stops</h2>
    <ul>{hard}</ul>
  </section>
  <section class="panel">
    <h2>Next safe action</h2>
    <p>{escape(report['nextSafeAction'])}</p>
  </section>
</main>
</body>
</html>
"""


def launcher_script(report: dict[str, Any], html_path: Path, md_path: Path) -> str:
    lines = [
        "#!/bin/zsh",
        "set -euo pipefail",
        f"open {shell_quote(str(html_path))}",
        f"open {shell_quote(str(md_path))}",
    ]
    morning = report.get("commandDoors", {}).get("morningReview")
    if morning:
        lines.append(f"open {shell_quote(str(morning))}")
    return "\n".join(lines) + "\n"


def update_manifest(baseline_dir: Path, report: dict[str, Any], json_path: Path, md_path: Path, html_path: Path, open_path: Path) -> None:
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    outputs["latestAudioPostListenEpisodeRunway"] = str(json_path)
    outputs["latestAudioPostListenEpisodeRunwayMarkdown"] = str(md_path)
    outputs["latestAudioPostListenEpisodeRunwayHtml"] = str(html_path)
    outputs["latestAudioPostListenEpisodeRunwayOpenCommand"] = str(open_path)
    history = outputs.setdefault("audioPostListenEpisodeRunways", [])
    if isinstance(history, list):
        history.append(str(json_path))
        history[:] = history[-20:]
    manifest["audioPostListenEpisodeRunwayLatestStatus"] = report["status"]
    manifest["audioPostListenEpisodeRunwayHardStopCount"] = report["hardStopCount"]
    manifest["audioPostListenEpisodeRunwayReviewRiskCount"] = report["reviewRiskCount"]
    manifest["audioPostListenEpisodeRunwayRouteCount"] = report["routeCount"]
    manifest["audioPostListenEpisodeRunwayAudioSpineGateStatus"] = report["qualityGates"]["audioSpine"]["status"]
    manifest["audioPostListenEpisodeRunwaySpectralFatigueStatus"] = report["qualityGates"]["audioSpine"].get("spectralFatigueStatus") or ""
    manifest["audioPostListenEpisodeRunwaySpectralFatigueHardStopCount"] = int(report["qualityGates"]["audioSpine"].get("spectralFatigueHardStopCount") or 0)
    manifest["audioPostListenEpisodeRunwaySpectralFatigueReviewRiskCount"] = int(report["qualityGates"]["audioSpine"].get("spectralFatigueReviewRiskCount") or 0)
    manifest["audioPostListenEpisodeRunwayFinalEpisodeGateStatus"] = report["qualityGates"]["finalEpisode"]["status"]
    manifest["audioPostListenEpisodeRunwayShortsGateStatus"] = report["qualityGates"]["shorts"]["status"]
    manifest["audioPostListenEpisodeRunwayApprovalStateChanged"] = False
    manifest["audioPostListenEpisodeRunwayBranchStateChanged"] = False
    manifest["audioPostListenEpisodeRunwayRenderAttempted"] = False
    manifest["audioPostListenEpisodeRunwayUploadAttempted"] = False
    manifest["audioPostListenEpisodeRunwayPublicationAttempted"] = False
    manifest["audioPostListenEpisodeRunwayOriginalMediaMutated"] = False
    write_json(manifest_path, manifest)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True)
    args = parser.parse_args()
    baseline_dir = Path(args.baseline_dir).expanduser().resolve()
    report = build_report(baseline_dir)
    stable_json = baseline_dir / "EPISODE_4_POST_LISTEN_RUNWAY.json"
    stable_md = baseline_dir / "EPISODE_4_POST_LISTEN_RUNWAY.md"
    stable_html = baseline_dir / "EPISODE_4_POST_LISTEN_RUNWAY.html"
    stable_open = baseline_dir / "OPEN_EPISODE_4_POST_LISTEN_RUNWAY.command"
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    slug = str(report.get("baselineId") or "audio-baseline").replace("/", "-")
    versioned_dir = baseline_dir / f"audio-post-listen-episode-runway-{slug}-{stamp}"
    versioned_dir.mkdir(parents=True, exist_ok=True)
    versioned_json = versioned_dir / "post-listen-episode-runway.json"
    versioned_md = versioned_dir / "post-listen-episode-runway.md"
    versioned_html = versioned_dir / "post-listen-episode-runway.html"
    versioned_open = versioned_dir / "open-post-listen-episode-runway.command"
    for path in (stable_json, versioned_json):
        write_json(path, report)
    markdown = render_markdown(report)
    for path in (stable_md, versioned_md):
        path.write_text(markdown, encoding="utf-8")
    html = render_html(report)
    for path in (stable_html, versioned_html):
        path.write_text(html, encoding="utf-8")
    stable_open.write_text(launcher_script(report, stable_html, stable_md), encoding="utf-8")
    versioned_open.write_text(launcher_script(report, versioned_html, versioned_md), encoding="utf-8")
    os.chmod(stable_open, 0o755)
    os.chmod(versioned_open, 0o755)
    update_manifest(baseline_dir, report, stable_json, stable_md, stable_html, stable_open)
    print(str(stable_html))


if __name__ == "__main__":
    main()
