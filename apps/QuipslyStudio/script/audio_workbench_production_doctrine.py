#!/usr/bin/env python3
"""Create a reusable audio production doctrine for Episode 4 and future noisy recordings.

The doctrine is the non-magical operating manual for Quipsly audio workbench
runs: what stage owns which decision, what evidence proves the stage, where
human listening gates production truth, and how dxRevive/manual restoration can
be used without mutating originals or turning the master into a black box.

It does not approve audio, fail audio, render branches, upload files, publish,
or mutate original media.
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


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def output_path(value: Any) -> str | None:
    if isinstance(value, str) and value:
        return value
    if isinstance(value, dict):
        for key in ("path", "markdownPath", "htmlPath", "openCommand", "playlistPath", "m4aPath"):
            candidate = value.get(key)
            if isinstance(candidate, str) and candidate:
                return candidate
    return None


def load_report(outputs: dict[str, Any], key: str) -> dict[str, Any]:
    path = output_path(outputs.get(key))
    if not path or not Path(path).exists() or Path(path).suffix.lower() != ".json":
        return {}
    try:
        return read_json(Path(path))
    except json.JSONDecodeError:
        return {}


def artifact(outputs: dict[str, Any], key: str, label: str, stage: str, why: str) -> dict[str, Any]:
    path = output_path(outputs.get(key))
    return {
        "key": key,
        "label": label,
        "stage": stage,
        "why": why,
        "path": path,
        "exists": bool(path and Path(path).exists()),
    }


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def e(value: Any) -> str:
    return html.escape(str(value))


def stage_status(artifacts: list[dict[str, Any]]) -> str:
    if artifacts and all(item["exists"] for item in artifacts):
        return "ready"
    if any(item["exists"] for item in artifacts):
        return "partial"
    return "missing"


def build_stage(name: str, purpose: str, owner: str, gate: str, artifacts: list[dict[str, Any]], agent_check: str) -> dict[str, Any]:
    return {
        "name": name,
        "purpose": purpose,
        "owner": owner,
        "humanGate": gate,
        "status": stage_status(artifacts),
        "artifactCount": len(artifacts),
        "presentArtifactCount": sum(1 for item in artifacts if item["exists"]),
        "missingArtifactCount": sum(1 for item in artifacts if not item["exists"]),
        "artifacts": artifacts,
        "agentCheck": agent_check,
    }


def command_lines(report: dict[str, Any]) -> list[str]:
    baseline = shell_quote(report["baselineDir"])
    return [
        "# Regenerate doctrine and review runway from the same baseline",
        f"OUT={baseline}",
        "python3 apps/QuipslyStudio/script/audio_workbench_production_doctrine.py --baseline-dir \"$OUT\"",
        "python3 apps/QuipslyStudio/script/audio_workbench_producer_command_center.py --baseline-dir \"$OUT\"",
        "python3 apps/QuipslyStudio/script/audio_workbench_review_start_here.py --baseline-dir \"$OUT\"",
        "python3 apps/QuipslyStudio/script/audio_workbench_review_gate_audit.py --baseline-dir \"$OUT\"",
        "python3 apps/QuipslyStudio/script/audio_workbench_goal_completion_audit.py --baseline-dir \"$OUT\" --goal-file /Users/wall-e/.codex/attachments/b795ff40-20cd-4f54-b41d-4a54c4124952/goal-objective.md",
    ]


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Quipsly Audio Production Doctrine",
        "",
        f"Generated: `{report['generatedAt']}`",
        f"Baseline: `{report['baselineId']}`",
        "",
        "This is the operating manual for this Episode 4 audio workbench and for the next messy outdoor/noisy podcast recording. It is not approval, not publication, and not a replacement for human listening. It is the map that keeps cleanup, restoration, mastering, review, and branch inheritance from becoming a magic box.",
        "",
        "## Current truth",
        "",
        f"- Approval status: `{report['approvalStatus']}`",
        f"- Package ready for human listen: `{str(report['packageReadyForHumanListen']).lower()}`",
        f"- Branch inheritance ready: `{str(report['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(report['branchRenderReady']).lower()}`",
        f"- Human listen required: `{str(report['humanListenRequired']).lower()}`",
        f"- Original media mutated: `{str(report['originalMediaMutated']).lower()}`",
        "",
        "## Non-negotiable contracts",
        "",
    ]
    for contract in report["contracts"]:
        lines.append(f"- {contract}")
    lines.extend([
        "",
        "## Stage doctrine",
        "",
        "| Stage | Status | Owner | Human gate | Present/Missing | Agent check |",
        "|---|---:|---|---|---:|---|",
    ])
    for stage in report["stages"]:
        lines.append(
            f"| {stage['name']} | `{stage['status']}` | {stage['owner']} | {stage['humanGate']} | `{stage['presentArtifactCount']}/{stage['missingArtifactCount']}` | {stage['agentCheck']} |"
        )
    lines.extend(["", "## Stage artifacts", ""])
    for stage in report["stages"]:
        lines.extend([f"### {stage['name']}", "", stage["purpose"], ""])
        for item in stage["artifacts"]:
            state = "present" if item["exists"] else "missing"
            lines.append(f"- `{state}` {item['label']}: `{item['path'] or 'not registered'}`")
        lines.append("")
    lines.extend(["## dxRevive/manual restoration rule", ""])
    for item in report["dxReviveRules"]:
        lines.append(f"- {item}")
    lines.extend(["", "## Future noisy/outdoor episode bootstrap", ""])
    for item in report["futureEpisodeBootstrap"]:
        lines.append(f"- [ ] {item}")
    lines.extend(["", "## Agent operating commands", "", "```bash", *command_lines(report), "```", ""])
    lines.extend(["## Why this is useful", "", report["meaning"], ""])
    return "\n".join(lines)


def render_html(report: dict[str, Any]) -> str:
    cards = []
    for stage in report["stages"]:
        artifacts = "".join(
            f"<li class='{ 'ok' if item['exists'] else 'missing' }'><span>{e(item['label'])}</span><code>{e(item['path'] or 'not registered')}</code></li>"
            for item in stage["artifacts"]
        )
        cards.append(
            f"""
            <section class='card {e(stage['status'])}'>
              <div class='kicker'>{e(stage['status'])} · {stage['presentArtifactCount']} present · {stage['missingArtifactCount']} missing</div>
              <h2>{e(stage['name'])}</h2>
              <p>{e(stage['purpose'])}</p>
              <p><strong>Owner:</strong> {e(stage['owner'])}</p>
              <p><strong>Human gate:</strong> {e(stage['humanGate'])}</p>
              <p><strong>Agent check:</strong> {e(stage['agentCheck'])}</p>
              <ul>{artifacts}</ul>
            </section>
            """
        )
    contracts = "".join(f"<li>{e(item)}</li>" for item in report["contracts"])
    bootstrap = "".join(f"<li>{e(item)}</li>" for item in report["futureEpisodeBootstrap"])
    commands = "\n".join(command_lines(report))
    return f"""<!doctype html>
<html lang='en'>
<head>
<meta charset='utf-8'>
<title>Quipsly Audio Production Doctrine</title>
<style>
:root {{ color-scheme: dark; --bg:#101715; --panel:#17231f; --ink:#f4ead2; --muted:#b8ae96; --gold:#e3b83f; --green:#56d27f; --red:#ee6a5f; --line:#314139; }}
body {{ margin:0; font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: radial-gradient(circle at top left, #25392f, var(--bg) 42rem); color:var(--ink); }}
main {{ max-width: 1180px; margin: 0 auto; padding: 38px 28px 80px; }}
.hero {{ border:1px solid var(--line); border-radius:28px; padding:28px; background:rgba(23,35,31,.86); box-shadow:0 18px 60px rgba(0,0,0,.28); }}
h1 {{ margin:0 0 10px; font-size:42px; letter-spacing:-.04em; }}
.kicker {{ color:var(--gold); text-transform:uppercase; letter-spacing:.16em; font-weight:800; font-size:12px; }}
.truth {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:12px; margin-top:22px; }}
.truth div, .card {{ border:1px solid var(--line); border-radius:20px; background:rgba(16,23,21,.76); padding:16px; }}
.truth strong {{ display:block; color:var(--muted); font-size:12px; text-transform:uppercase; letter-spacing:.12em; }}
.truth span {{ font-size:16px; font-weight:800; }}
.grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(330px,1fr)); gap:16px; margin-top:24px; }}
.card.ready {{ border-color:rgba(86,210,127,.45); }}
.card.partial {{ border-color:rgba(227,184,63,.5); }}
.card.missing {{ border-color:rgba(238,106,95,.5); }}
h2 {{ margin:8px 0 8px; }}
p, li {{ color:var(--muted); line-height:1.45; }}
ul {{ padding-left:18px; }}
li.ok span {{ color:var(--green); }}
li.missing span {{ color:var(--red); }}
code {{ color:#ffe7a4; overflow-wrap:anywhere; }}
pre {{ background:#07100d; border:1px solid var(--line); border-radius:18px; padding:18px; overflow:auto; }}
</style>
</head>
<body><main>
<section class='hero'>
<div class='kicker'>Quipsly audio workbench</div>
<h1>Production doctrine</h1>
<p>{e(report['meaning'])}</p>
<div class='truth'>
<div><strong>Approval</strong><span>{e(report['approvalStatus'])}</span></div>
<div><strong>Listen ready</strong><span>{str(report['packageReadyForHumanListen']).lower()}</span></div>
<div><strong>Branch inheritance</strong><span>{str(report['branchInheritanceReady']).lower()}</span></div>
<div><strong>Branch render</strong><span>{str(report['branchRenderReady']).lower()}</span></div>
</div>
</section>
<section class='card'><div class='kicker'>Contracts</div><ul>{contracts}</ul></section>
<div class='grid'>{''.join(cards)}</div>
<section class='card'><div class='kicker'>Future episode bootstrap</div><ul>{bootstrap}</ul></section>
<section class='card'><div class='kicker'>Agent commands</div><pre>{e(commands)}</pre></section>
</main></body></html>"""


def write_open_command(path: Path, html_path: Path, md_path: Path) -> None:
    path.write_text(
        "#!/bin/zsh\n"
        "set -euo pipefail\n"
        f"open {shell_quote(str(html_path))}\n"
        f"open {shell_quote(str(md_path))}\n",
        encoding="utf-8",
    )
    os.chmod(path, 0o755)


def build_doctrine(manifest: dict[str, Any], baseline_dir: Path, generated_at: str) -> dict[str, Any]:
    outputs = manifest.get("outputs") or {}
    dxrevive_validation = load_report(outputs, "latestDxReviveBounceValidation")
    reusable_profile = load_report(outputs, "latestReusableAudioProductionProfile")
    reusable_intake = load_report(outputs, "latestReusableAudioProfileIntakePacket")
    source_activity = load_report(outputs, "sourceActivity")
    goal_audit = load_report(outputs, "latestAudioGoalCompletionAudit")

    stages = [
        build_stage(
            "Source inventory and sync truth",
            "Name every raw source, decide production vs evidence-only use, and keep sync/conform evidence below every future edit branch.",
            "sync layer",
            "machine can prepare; human resolves ambiguous source identity",
            [
                artifact(outputs, "sourceActivityMarkdown", "Source activity report", "source", "Shows aligned activity and retention."),
                artifact(outputs, "sourceContributionMarkdown", "Source contribution report", "source", "Explains what each source contributes to the master."),
                artifact(outputs, "latestAudioSpineListenSanityCheckMarkdown", "Spine listen sanity check", "source", "Confirms Charlie and Homer are materially present."),
            ],
            "Explain source roles, offsets, parked media, and whether both speakers are present before any mastering claim.",
        ),
        build_stage(
            "Speaker-aware cleanup",
            "Mute/duck non-contributing material and preserve speaking, laughing, and reaction moments as transparent derived-stem decisions.",
            "speaker activity + contribution layer",
            "human must listen for chopped cadence, lost reactions, and echo-heavy moments",
            [
                artifact(outputs, "latestAudioSpeakerActivityReviewBoardMarkdown", "Speaker activity review board", "cleanup", "Human-readable map of activity and automation."),
                artifact(outputs, "latestSpeakerCleanupProofPackMarkdown", "Speaker cleanup proof pack", "cleanup", "A/B proof snippets for cleanup windows."),
                artifact(outputs, "latestAudioSpeakerPreservationProofPackMarkdown", "Speaker preservation proof pack", "cleanup", "Checks that Charlie and Homer survived cleanup."),
                artifact(outputs, "latestAudioSpeakerContributionLedgerMarkdown", "Speaker contribution ledger", "cleanup", "Full-length contribution X-ray."),
            ],
            "Compare raw aligned sources, contribution stems, and mastered output for the same timestamp.",
        ),
        build_stage(
            "Restoration fallback",
            "Use dxRevive/Logic only on duplicated derived stems, validate returned bounces, then compare as proof candidates before any baseline promotion.",
            "manual restoration bridge",
            "human chooses whether restored audio sounds better or fake",
            [
                artifact(outputs, "latestDxReviveManualBouncePacketMarkdown", "dxRevive manual bounce packet", "restoration", "Derived-stem packet and return filenames."),
                artifact(outputs, "latestDxReviveBounceValidationMarkdown", "dxRevive bounce validation", "restoration", "Validates duration/sample/channel contract."),
                artifact(outputs, "latestDxReviveBounceValidatorSmokeMarkdown", "dxRevive validator smoke", "restoration", "Proves invalid returns are rejected."),
                artifact(outputs, "latestDxReviveProofCandidatePlannerMarkdown", "dxRevive proof candidate planner", "restoration", "Waits for valid bounces before proof candidates."),
            ],
            "Report expected/validated/missing bounces and refuse to let unvalidated restoration affect a candidate.",
        ),
        build_stage(
            "Mix, master, and platform delivery",
            "Create a normal stereo handoff while preserving the evidence trail and platform loudness checks behind it.",
            "mastering layer",
            "human approves the actual listening experience, not the loudness numbers alone",
            [
                artifact(outputs, "masterWav", "Master WAV", "master", "Premiere/editor handoff."),
                artifact(outputs, "masterM4a", "Listening M4A", "master", "Compact review copy."),
                artifact(outputs, "latestAudioPlatformLoudnessAuditMarkdown", "Platform loudness audit", "master", "Podcast/social loudness checks."),
                artifact(outputs, "latestAudioBroadcastPolishScorecardMarkdown", "Broadcast polish scorecard", "master", "Producer-grade risk and quality rollup."),
            ],
            "Verify normal delivery files exist, have audio, and remain linked to the proof chain.",
        ),
        build_stage(
            "Human listen and branch inheritance",
            "Keep v006 review-ready but locked until a real listen decision records approval, failure, or focused-proof needs.",
            "review gate",
            "typed human listen confirmation required before branch inheritance/render",
            [
                artifact(outputs, "latestAudioProducerCommandCenterMarkdown", "Producer Command Center", "review", "Primary front door."),
                artifact(outputs, "latestAudioUnresolvedRequirementReviewMarkdown", "Unresolved requirement review", "review", "Shows partial and locked work."),
                artifact(outputs, "latestAudioFinalListenFastPassMarkdown", "Final listen fast pass", "review", "Shortest sane human review path."),
                artifact(outputs, "latestAudioReviewGateAuditMarkdown", "Review gate audit", "review", "Proves the package is coherent but locked."),
                artifact(outputs, "latestBranchInheritanceGateMarkdown", "Branch inheritance gate", "review", "Keeps branches locked until approval."),
            ],
            "State approval, branch inheritance, and branch render truth without hand-editing the manifest.",
        ),
        build_stage(
            "Future noisy/outdoor reuse",
            "Turn Episode 4 learning into a next-episode intake profile without pretending Episode 4 paths or proof windows are reusable media.",
            "reusable profile",
            "another real messy episode must prove production-default reuse",
            [
                artifact(outputs, "latestReusableAudioProductionProfileMarkdown", "Reusable audio production profile", "reuse", "Profile extracted from Episode 4."),
                artifact(outputs, "stableReusableAudioProductionProfileMarkdown", "Stable reusable profile", "reuse", "Stable profile alias."),
                artifact(outputs, "latestReusableAudioProductionProfileSmokeMarkdown", "Reusable profile smoke", "reuse", "Synthetic noisy fixture proof."),
                artifact(outputs, "latestReusableAudioProfileIntakePacketMarkdown", "Reusable intake packet", "reuse", "Next-episode source worksheet."),
                artifact(outputs, "latestReusableAudioProfileIntakePacketSmokeMarkdown", "Reusable intake smoke", "reuse", "Intake contract smoke."),
            ],
            "Bootstrap the next episode by replacing source paths, preserving sync evidence, and rerendering proof windows before approval.",
        ),
    ]

    stage_missing = sum(stage["missingArtifactCount"] for stage in stages)
    doctrine_status = "ready-with-human-listen-lock" if stage_missing == 0 else "partial"
    return {
        "schema": "quipsly.audio-workbench.production-doctrine.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": manifest.get("baselineId"),
        "approvalStatus": manifest.get("approvalStatus"),
        "packageReadyForHumanListen": bool(manifest.get("packageReadyForHumanListen")),
        "branchInheritanceReady": bool(manifest.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest.get("branchRenderReady")),
        "humanListenRequired": str(manifest.get("approvalStatus") or "") != "human-approved-for-branch-inheritance",
        "originalMediaMutated": False,
        "doctrineStatus": doctrine_status,
        "stageCount": len(stages),
        "stageMissingArtifactCount": stage_missing,
        "dxReviveStatus": dxrevive_validation.get("status") or "not-generated",
        "dxReviveExpectedCount": dxrevive_validation.get("expectedCount") or 0,
        "dxReviveValidatedCount": dxrevive_validation.get("validatedCount") or 0,
        "reuseReadiness": reusable_profile.get("reuseReadiness") or "not-generated",
        "futureEpisodeReadiness": reusable_intake.get("futureEpisodeReadiness") or "not-generated",
        "sourceClassificationSummary": source_activity.get("classificationSummary") or {},
        "goalAuditCounts": goal_audit.get("statusCounts") or {},
        "contracts": [
            "Raw media is read-only; all cleanup/restoration happens on derived stems, proof snippets, or versioned candidates.",
            "The normal handoff is a stereo WAV/M4A, but the workbench keeps source, stem, proof, and review evidence inspectable.",
            "dxRevive/manual restoration may help, but only after duplicated stem bounces validate and A/B proof candidates are reviewed.",
            "Human listen proof gates branch inheritance and real long-form branch renders.",
            "Future episodes may reuse the doctrine, profile, and intake worksheet; they may not reuse Episode 4 paths as production inputs.",
        ],
        "stages": stages,
        "dxReviveRules": [
            "Process only files from the dxRevive packet input-stems folder or another duplicated derived-stem folder.",
            "Return exact expected filenames into the packet return-bounces folder.",
            "Run the validator before any restored file is considered by the planner.",
            "Compare restored candidates against v006 in proof windows before promoting a new baseline.",
            "Reject restoration that sounds metallic, fake, over-clean, chopped, or less human than v006.",
        ],
        "futureEpisodeBootstrap": [
            "Create raw source inventory with speaker/source roles before sync.",
            "Record sync offsets and parked/uncertain sources explicitly.",
            "Generate speaker activity and source contribution evidence before cleanup.",
            "Render cleanup proof windows before full-spine promotion.",
            "Use dxRevive/manual restoration only for a clear problem, and keep it proof-candidate-first.",
            "Generate loudness, smoothness, preservation, and final-listen surfaces before branch inheritance.",
            "Record human listen notes or approval through guarded commands; never hand-edit truth flags.",
        ],
        "meaning": "This doctrine makes Quipsly's audio workflow reusable without pretending the current v006 candidate is approved. It turns the messy parts into named stages with artifacts, gates, and agent checks, so future outdoor/noisy recordings can start from a known professional pattern instead of another bespoke rescue mission.",
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest_before = read_json(manifest_path)
    baseline_id = str(manifest_before.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    version_dir = baseline_dir / f"audio-production-doctrine-{slug}-{generated_at}"
    version_dir.mkdir(parents=True, exist_ok=True)

    version_json = version_dir / "audio-production-doctrine.json"
    version_md = version_dir / "audio-production-doctrine.md"
    version_html = version_dir / "audio-production-doctrine.html"
    version_open = version_dir / "open-audio-production-doctrine.command"
    stable_json = baseline_dir / "AUDIO_PRODUCTION_DOCTRINE.json"
    stable_md = baseline_dir / "AUDIO_PRODUCTION_DOCTRINE.md"
    stable_html = baseline_dir / "AUDIO_PRODUCTION_DOCTRINE.html"
    stable_open = baseline_dir / "OPEN_AUDIO_PRODUCTION_DOCTRINE.command"

    report = build_doctrine(manifest_before, baseline_dir, generated_at)
    markdown = render_markdown(report)
    html_doc = render_html(report)

    write_json(version_json, report)
    version_md.write_text(markdown, encoding="utf-8")
    version_html.write_text(html_doc, encoding="utf-8")
    write_open_command(version_open, version_html, version_md)
    write_json(stable_json, report)
    stable_md.write_text(markdown, encoding="utf-8")
    stable_html.write_text(html_doc, encoding="utf-8")
    write_open_command(stable_open, stable_html, stable_md)

    manifest_after = read_json(manifest_path)
    outputs = manifest_after.setdefault("outputs", {})
    entry = {
        "path": str(stable_json),
        "markdownPath": str(stable_md),
        "htmlPath": str(stable_html),
        "openCommand": str(stable_open),
        "versionedPath": str(version_json),
        "versionedMarkdownPath": str(version_md),
        "versionedHtmlPath": str(version_html),
        "versionedOpenCommand": str(version_open),
        "generatedAt": generated_at,
        "schema": report["schema"],
        "status": report["doctrineStatus"],
        "stageCount": report["stageCount"],
        "stageMissingArtifactCount": report["stageMissingArtifactCount"],
        "dxReviveStatus": report["dxReviveStatus"],
        "reuseReadiness": report["reuseReadiness"],
        "futureEpisodeReadiness": report["futureEpisodeReadiness"],
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
    }
    history = outputs.setdefault("audioProductionDoctrines", [])
    history.append(entry)
    outputs["latestAudioProductionDoctrine"] = entry
    outputs["latestAudioProductionDoctrineMarkdown"] = str(stable_md)
    outputs["latestAudioProductionDoctrineHtml"] = str(stable_html)
    outputs["latestAudioProductionDoctrineOpenCommand"] = str(stable_open)
    outputs["latestAudioProductionDoctrineVersionedJson"] = str(version_json)
    outputs["latestAudioProductionDoctrineVersionedMarkdown"] = str(version_md)
    outputs["latestAudioProductionDoctrineVersionedHtml"] = str(version_html)
    outputs["latestAudioProductionDoctrineVersionedOpenCommand"] = str(version_open)
    manifest_after["audioProductionDoctrineCount"] = len(history)
    manifest_after["audioProductionDoctrineLatestStatus"] = report["doctrineStatus"]
    manifest_after["audioProductionDoctrineStageMissingArtifactCount"] = report["stageMissingArtifactCount"]
    manifest_after["audioProductionDoctrineApprovalStateChanged"] = False
    manifest_after["audioProductionDoctrineBranchStateChanged"] = False
    manifest_after["audioProductionDoctrineOriginalMediaMutated"] = False
    write_json(manifest_path, manifest_after)

    print(json.dumps(entry, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
