#!/usr/bin/env python3
"""Create one calm final-listen mission packet for the active audio baseline.

This is a reviewer/anxiety-reduction surface, not an approval tool. It points
humans and agents at the smallest sufficient listening path from the existing
proof surfaces, then routes outcomes to the guarded decision door or notes
inboxes. It does not approve audio, unlock branches, render branches, upload,
publish, or mutate original/source media.
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
    expanded = input_path.expanduser()
    if (expanded / "manifest.json").exists():
        return expanded.resolve()
    nested = expanded / "work" / "conformed-production-baseline"
    if (nested / "manifest.json").exists():
        return nested.resolve()
    raise FileNotFoundError(f"Could not find manifest.json under {input_path}")


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


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
            "wavPath",
            "versionedPath",
            "versionedJsonPath",
            "versionedMarkdownPath",
            "versionedHtmlPath",
            "versionedM4aPath",
        ):
            subvalue = value.get(key)
            if isinstance(subvalue, str) and subvalue:
                return subvalue
    return None


def load_output_report(outputs: dict[str, Any], key: str) -> dict[str, Any]:
    path = output_path(outputs.get(key))
    if not path or not Path(path).exists() or Path(path).suffix.lower() != ".json":
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


def e(value: Any) -> str:
    return html.escape(str(value))


def artifact(
    outputs: dict[str, Any],
    label: str,
    key: str,
    *,
    required: bool,
    why: str,
    action: str,
    kind: str = "review",
) -> dict[str, Any]:
    path = output_path(outputs.get(key))
    exists = bool(path and Path(path).exists())
    return {
        "label": label,
        "key": key,
        "path": path,
        "exists": exists,
        "required": required,
        "kind": kind,
        "why": why,
        "action": action,
    }


def first_existing_path(outputs: dict[str, Any], keys: list[str]) -> str | None:
    for key in keys:
        path = output_path(outputs.get(key))
        if path and Path(path).exists():
            return path
    return None


def build_steps(outputs: dict[str, Any], reports: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    mission_reel = reports.get("missionReel") or {}
    speaker_reel = reports.get("speakerCleanupReel") or {}
    asr_focus = reports.get("asrReviewFocus") or {}
    defect_atlas = reports.get("defectAtlas") or {}
    defect_summary = defect_atlas.get("summary") if isinstance(defect_atlas.get("summary"), dict) else {}
    post_queue = reports.get("postReviewQueue") or {}
    return [
        {
            "step": 1,
            "title": "Open the mission packet",
            "required": True,
            "artifactKey": "latestAudioFinalListenMissionPacketHtml",
            "path": None,
            "why": "This page is the calm map. It exists so reviewers do not need to remember which of fifty proof surfaces matters first.",
            "passCondition": "Reviewer understands the current lock truth and what to open next.",
        },
        {
            "step": 2,
            "title": "Play the full mastered listening copy if time allows",
            "required": False,
            "artifactKey": "masterM4a",
            "path": first_existing_path(outputs, ["masterM4a", "masterWav"]),
            "why": "The full spine is the only way to approve the whole episode audio. The reels are fast proof, not full approval by themselves.",
            "passCondition": "No distracting echo, missing speaker, harsh transition, or unnatural gate is heard across normal listening.",
        },
        {
            "step": 3,
            "title": "Listen to the Mission Reel",
            "required": True,
            "artifactKey": "latestAudioHumanListenMissionReelM4a",
            "path": output_path(outputs.get("latestAudioHumanListenMissionReelM4a")),
            "why": f"Fast first pass through {mission_reel.get('itemCount') or 0} high-signal windows.",
            "passCondition": "All Mission Reel moments sound natural enough to proceed, or notes are exported for focused proof/repair.",
        },
        {
            "step": 4,
            "title": "Listen to the Speaker Cleanup Reel",
            "required": True,
            "artifactKey": "latestSpeakerCleanupListenReelM4a",
            "path": output_path(outputs.get("latestSpeakerCleanupListenReelM4a")),
            "why": f"Checks {speaker_reel.get('itemCount') or 0} windows where source-aware cleanup could make speech sound choppy or over-gated.",
            "passCondition": "Charlie and Homer both sound present, natural, and not accidentally erased.",
        },
        {
            "step": 5,
            "title": "Check the ASR source/master focus packet",
            "required": True,
            "artifactKey": "latestAudioAsrReviewFocusPacketHtml",
            "path": output_path(outputs.get("latestAudioAsrReviewFocusPacketHtml")),
            "why": f"Routes {asr_focus.get('focusWindowCount') or 0} ASR semantic-drift listen targets where source and master transcripts disagree enough to deserve ears.",
            "passCondition": "Flagged windows do not audibly lose or rewrite speech. If they do, keep v006 locked and route scoped v007 proof/repair.",
        },
        {
            "step": 6,
            "title": "Inspect the Audio Defect Atlas only where something feels questionable",
            "required": True,
            "artifactKey": "latestAudioDefectAtlasHtml",
            "path": output_path(outputs.get("latestAudioDefectAtlasHtml")),
            "why": f"Stage-aware map of {defect_summary.get('itemCount') or 0} machine-visible risk items, with exact notes return IDs.",
            "passCondition": "Questionable issues are tied to exact atlas items instead of vague memory.",
        },
        {
            "step": 7,
            "title": "Confirm the source-aware timing contract before editing branches",
            "required": True,
            "artifactKey": "latestAudioSourceAwareTimingContractHtml",
            "path": output_path(outputs.get("latestAudioSourceAwareTimingContractHtml")),
            "why": "Proves the refined Charlie, Homer, and clip/source stems stay full-length on one sequence clock, so timing edits can follow video and conversation flow instead of a flattened-master shortcut.",
            "passCondition": "Timing contract is ready, required roles are present, and branch rendering is not allowed to edit from the mastered spine alone.",
        },
        {
            "step": 8,
            "title": "Return notes through the proper inbox",
            "required": True,
            "artifactKey": "latestAudioPostReviewActionQueueMarkdown",
            "path": output_path(outputs.get("latestAudioPostReviewActionQueueMarkdown")),
            "why": f"Unified queue currently scans {post_queue.get('sourceCount') or 0} notes sources, including Defect Atlas notes.",
            "passCondition": "Pass/proof/repair notes land in one queue instead of becoming another orphaned artifact.",
        },
        {
            "step": 9,
            "title": "Use the guarded Human Listen Decision Front Door",
            "required": True,
            "artifactKey": "latestHumanListenDecisionFrontDoorHtml",
            "path": output_path(outputs.get("latestHumanListenDecisionFrontDoorHtml")),
            "why": "This is the only path that may record a real human listen decision. It still requires explicit human confirmation.",
            "passCondition": "If the audio passes, the guarded front door records that fact. If it fails, the exact symptom routes to repair/proof work.",
        },
    ]


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Final Listen Mission Packet: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "This is the smallest sane reviewer path for the current v006 audio candidate. It organizes existing proof surfaces; it does not approve audio, unlock branches, render media, upload, publish, or mutate original media.",
        "",
        "## Current lock truth",
        "",
        f"- Approval status: `{report['approvalStatus']}`",
        f"- Package ready for human listen: `{str(report['packageReadyForHumanListen']).lower()}`",
        f"- Branch inheritance ready: `{str(report['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(report['branchRenderReady']).lower()}`",
        f"- Status: `{report['status']}`",
        f"- Missing required artifacts: `{report['missingRequiredArtifactCount']}`",
        f"- Source-aware stems included: `{str(report.get('sourceAwareStemManifestIncluded')).lower()}` with `{report.get('sourceAwareStemResolvedCount')}` resolved stems",
        f"- Source-aware timing contract: `{report.get('sourceAwareTimingContractStatus')}` ready `{str(report.get('sourceAwareTimingContractReady')).lower()}` with `{report.get('sourceAwareTimingContractReadyRoleCount')}` ready roles and `{report.get('sourceAwareTimingContractHardStopCount')}` hard stops",
        f"- Source-aware timing max delta to mastered spine: `{report.get('sourceAwareTimingContractMaxDurationDeltaToMasterSeconds')}s`",
        f"- Segment audio map included: `{str(report.get('segmentLoudnessMapIncluded')).lower()}` with `{report.get('segmentLoudnessMapOutlierCount')}` review windows",
        "",
        "## Minimum listen mission",
        "",
        "| # | Required | Step | Artifact | Pass condition |",
        "|---:|---|---|---|---|",
    ]
    for step in report.get("minimumSufficientListenPath") or []:
        required = "yes" if step.get("required") else "optional"
        path = step.get("path") or "see generated packet"
        lines.append(f"| {step['step']} | `{required}` | {step['title']} | `{path}` | {step['passCondition']} |")
    lines.extend(
        [
            "",
            "## Open-first artifacts",
            "",
            "| Required | Artifact | Exists | Why |",
            "|---|---|---|---|",
        ]
    )
    for item in report.get("artifacts") or []:
        required = "yes" if item.get("required") else "optional"
        lines.append(f"| `{required}` | `{item['label']}` | `{str(item['exists']).lower()}` | {str(item['why']).replace('|', '\\|')} |")
    lines.extend(
        [
            "",
            "## Outcome routing",
            "",
            "- If it passes: use the Human Listen Decision Front Door and record the guarded human-listen decision.",
            "- If it needs proof: write notes against the Mission Reel, Speaker Cleanup Reel, or Defect Atlas item and rerun the control plane.",
            "- If it needs repair: keep v006 locked, create a scoped v007 repair candidate for the owning stage, and preserve v006 as evidence.",
            "",
            "## Safety",
            "",
            f"- Approval state changed: `{str(report['approvalStateChanged']).lower()}`",
            f"- Branch state changed: `{str(report['branchStateChanged']).lower()}`",
            f"- Render attempted: `{str(report['renderAttempted']).lower()}`",
            f"- Branch render attempted: `{str(report['branchRenderAttempted']).lower()}`",
            f"- Upload attempted: `{str(report['uploadAttempted']).lower()}`",
            f"- Publication attempted: `{str(report['publicationAttempted']).lower()}`",
            f"- Original media mutated: `{str(report['originalMediaMutated']).lower()}`",
        ]
    )
    return "\n".join(lines) + "\n"


def render_html(report: dict[str, Any]) -> str:
    artifact_cards = []
    for item in report.get("artifacts") or []:
        status = "ok" if item.get("exists") else "missing"
        path = item.get("path")
        link = f"<a href=\"file://{e(path)}\">{e(item['label'])}</a>" if path else e(item["label"])
        artifact_cards.append(
            f"""
            <article class="artifact {status}">
              <div><span>{'required' if item.get('required') else 'optional'}</span><span>{status}</span></div>
              <h3>{link}</h3>
              <p>{e(item.get('why') or '')}</p>
              <small>{e(item.get('action') or '')}</small>
            </article>"""
        )
    step_rows = []
    for step in report.get("minimumSufficientListenPath") or []:
        required = "Required" if step.get("required") else "Optional"
        path = step.get("path") or ""
        link = f"<a href=\"file://{e(path)}\">open</a>" if path else "this packet"
        step_rows.append(
            f"<tr><td>{step['step']}</td><td>{e(required)}</td><td><strong>{e(step['title'])}</strong><br><small>{e(step.get('why') or '')}</small></td><td>{link}</td><td>{e(step.get('passCondition') or '')}</td></tr>"
        )
    return f"""<!doctype html>
<html><head><meta charset="utf-8"><title>Final Listen Mission Packet</title>
<style>
:root {{ color-scheme: dark; --bg:#111711; --panel:#182419; --panel2:#223326; --ink:#f6ecd8; --muted:#b9ad94; --gold:#e9c84a; --moss:#7fd28c; --clay:#d87955; --line:rgba(246,236,216,.14); }}
* {{ box-sizing:border-box; }}
body {{ margin:0; font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; background:radial-gradient(circle at top left,#2a3c27,var(--bg) 48%); color:var(--ink); }}
main {{ width:min(1280px,calc(100vw - 48px)); margin:34px auto 70px; }}
.hero,.panel,.artifact {{ border:1px solid var(--line); background:linear-gradient(180deg,rgba(255,255,255,.045),rgba(0,0,0,.10)),var(--panel); box-shadow:0 22px 70px rgba(0,0,0,.30); }}
.hero {{ border-radius:30px; padding:30px; }}
.eyebrow {{ color:var(--gold); letter-spacing:.18em; text-transform:uppercase; font-weight:900; font-size:12px; }}
h1 {{ font-size:clamp(38px,6vw,78px); line-height:.9; margin:10px 0 14px; max-width:900px; }}
.truth {{ display:flex; flex-wrap:wrap; gap:10px; margin-top:20px; }}
.pill {{ border:1px solid var(--line); border-radius:999px; background:rgba(0,0,0,.22); padding:10px 14px; color:var(--muted); }}
.pill strong {{ color:var(--ink); }}
section {{ margin-top:24px; }}
.panel {{ border-radius:24px; padding:22px; overflow:auto; }}
table {{ width:100%; border-collapse:collapse; }}
th,td {{ border-bottom:1px solid var(--line); padding:12px; text-align:left; vertical-align:top; }}
th {{ color:var(--gold); text-transform:uppercase; letter-spacing:.08em; font-size:12px; }}
a {{ color:var(--ink); font-weight:900; text-decoration:none; }}
small,p {{ color:var(--muted); }}
.grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:12px; }}
.artifact {{ border-radius:22px; padding:18px; }}
.artifact div {{ display:flex; gap:8px; }}
.artifact span {{ border-radius:999px; padding:4px 9px; text-transform:uppercase; letter-spacing:.08em; font-weight:900; font-size:11px; background:rgba(255,255,255,.08); }}
.artifact.ok span:last-child {{ background:rgba(127,210,140,.16); color:var(--moss); }}
.artifact.missing span:last-child {{ background:rgba(216,121,85,.18); color:var(--clay); }}
.outcome {{ border-left:4px solid var(--gold); padding-left:18px; }}
</style></head>
<body><main>
<section class="hero">
  <div class="eyebrow">Quipsly Audio Workbench</div>
  <h1>Final Listen Mission</h1>
  <p>One calm path through the v006 audio review maze. Listen, note exact symptoms, then use the guarded decision door. No wizard fog.</p>
  <div class="truth">
    <div class="pill"><strong>Status</strong> {e(report['status'])}</div>
    <div class="pill"><strong>Approval</strong> {e(report['approvalStatus'])}</div>
    <div class="pill"><strong>Package ready</strong> {str(report['packageReadyForHumanListen']).lower()}</div>
    <div class="pill"><strong>Branch inheritance</strong> {str(report['branchInheritanceReady']).lower()}</div>
    <div class="pill"><strong>Missing required</strong> {report['missingRequiredArtifactCount']}</div>
    <div class="pill"><strong>Stem truth</strong> {str(report.get('sourceAwareStemManifestIncluded')).lower()} / {report.get('sourceAwareStemResolvedCount')} stems</div>
    <div class="pill"><strong>Timing truth</strong> {str(report.get('sourceAwareTimingContractReady')).lower()} / {report.get('sourceAwareTimingContractReadyRoleCount')} roles</div>
    <div class="pill"><strong>Segment map</strong> {str(report.get('segmentLoudnessMapIncluded')).lower()} / {report.get('segmentLoudnessMapOutlierCount')} windows</div>
  </div>
</section>
<section class="panel">
  <h2>Minimum listen path</h2>
  <table><thead><tr><th>#</th><th>Need</th><th>Step</th><th>Open</th><th>Pass condition</th></tr></thead><tbody>{''.join(step_rows)}</tbody></table>
</section>
<section>
  <h2>Open-first artifacts</h2>
  <div class="grid">{''.join(artifact_cards)}</div>
</section>
<section class="panel outcome">
  <h2>Outcome routing</h2>
  <p><strong>Pass:</strong> use the Human Listen Decision Front Door. <strong>Needs proof:</strong> export notes and rerun the control plane. <strong>Needs repair:</strong> keep v006 locked and create a scoped v007 repair candidate.</p>
  <p>Safety: approval changed {str(report['approvalStateChanged']).lower()}, branch changed {str(report['branchStateChanged']).lower()}, render attempted {str(report['renderAttempted']).lower()}, upload attempted {str(report['uploadAttempted']).lower()}, publication attempted {str(report['publicationAttempted']).lower()}, original media mutated {str(report['originalMediaMutated']).lower()}.</p>
</section>
</main></body></html>
"""


def write_open_command(path: Path, html_path: Path, markdown_path: Path) -> None:
    path.write_text(
        "#!/bin/zsh\n"
        "set -euo pipefail\n"
        f"open {shell_quote(str(html_path))}\n"
        f"open {shell_quote(str(markdown_path))}\n",
        encoding="utf-8",
    )
    os.chmod(path, 0o755)


def update_manifest(manifest_path: Path, report: dict[str, Any]) -> None:
    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    entry = {
        "path": report["jsonPath"],
        "jsonPath": report["jsonPath"],
        "markdownPath": report["markdownPath"],
        "htmlPath": report["htmlPath"],
        "openCommand": report["openCommand"],
        "versionedPath": report["versionedJsonPath"],
        "versionedJsonPath": report["versionedJsonPath"],
        "versionedMarkdownPath": report["versionedMarkdownPath"],
        "versionedHtmlPath": report["versionedHtmlPath"],
        "versionedOpenCommand": report["versionedOpenCommand"],
        "generatedAt": report["generatedAt"],
        "schema": report["schema"],
        "status": report["status"],
        "missionStepCount": report["missionStepCount"],
        "requiredStepCount": report["requiredStepCount"],
        "missingRequiredArtifactCount": report["missingRequiredArtifactCount"],
        "sourceAwareStemManifestIncluded": report.get("sourceAwareStemManifestIncluded"),
        "sourceAwareStemResolvedCount": report.get("sourceAwareStemResolvedCount"),
        "sourceAwareTimingContractIncluded": report.get("sourceAwareTimingContractIncluded"),
        "sourceAwareTimingContractStatus": report.get("sourceAwareTimingContractStatus"),
        "sourceAwareTimingContractReady": report.get("sourceAwareTimingContractReady"),
        "sourceAwareTimingContractReadyRoleCount": report.get("sourceAwareTimingContractReadyRoleCount"),
        "sourceAwareTimingContractHardStopCount": report.get("sourceAwareTimingContractHardStopCount"),
        "sourceAwareTimingContractMaxDurationDeltaToMasterSeconds": report.get("sourceAwareTimingContractMaxDurationDeltaToMasterSeconds"),
        "segmentLoudnessMapIncluded": report.get("segmentLoudnessMapIncluded"),
        "segmentLoudnessMapOutlierCount": report.get("segmentLoudnessMapOutlierCount"),
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "branchRenderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
    }
    outputs["latestAudioFinalListenMissionPacket"] = entry
    outputs["latestAudioFinalListenMissionPacketMarkdown"] = report["markdownPath"]
    outputs["latestAudioFinalListenMissionPacketHtml"] = report["htmlPath"]
    outputs["latestAudioFinalListenMissionPacketOpenCommand"] = report["openCommand"]
    outputs.setdefault("audioFinalListenMissionPackets", []).append(entry)
    manifest["audioFinalListenMissionPacketCount"] = len(outputs["audioFinalListenMissionPackets"])
    manifest["audioFinalListenMissionPacketLatestStatus"] = report["status"]
    manifest["audioFinalListenMissionPacketMissionStepCount"] = report["missionStepCount"]
    manifest["audioFinalListenMissionPacketRequiredStepCount"] = report["requiredStepCount"]
    manifest["audioFinalListenMissionPacketOptionalStepCount"] = report["optionalStepCount"]
    manifest["audioFinalListenMissionPacketMissingRequiredArtifactCount"] = report["missingRequiredArtifactCount"]
    manifest["audioFinalListenMissionPacketSourceAwareStemManifestIncluded"] = bool(report.get("sourceAwareStemManifestIncluded"))
    manifest["audioFinalListenMissionPacketSourceAwareStemResolvedCount"] = int_value(report.get("sourceAwareStemResolvedCount"))
    manifest["audioFinalListenMissionPacketSourceAwareTimingContractIncluded"] = bool(report.get("sourceAwareTimingContractIncluded"))
    manifest["audioFinalListenMissionPacketSourceAwareTimingContractStatus"] = report.get("sourceAwareTimingContractStatus") or ""
    manifest["audioFinalListenMissionPacketSourceAwareTimingContractReady"] = bool(report.get("sourceAwareTimingContractReady"))
    manifest["audioFinalListenMissionPacketSourceAwareTimingContractReadyRoleCount"] = int_value(report.get("sourceAwareTimingContractReadyRoleCount"))
    manifest["audioFinalListenMissionPacketSourceAwareTimingContractHardStopCount"] = int_value(report.get("sourceAwareTimingContractHardStopCount"))
    manifest["audioFinalListenMissionPacketSourceAwareTimingContractMaxDurationDeltaToMasterSeconds"] = report.get("sourceAwareTimingContractMaxDurationDeltaToMasterSeconds")
    manifest["audioFinalListenMissionPacketSegmentLoudnessMapIncluded"] = bool(report.get("segmentLoudnessMapIncluded"))
    manifest["audioFinalListenMissionPacketSegmentLoudnessMapOutlierCount"] = int_value(report.get("segmentLoudnessMapOutlierCount"))
    manifest["audioFinalListenMissionPacketReadyForFinalHumanListen"] = report["status"] == "ready-for-final-human-listen-mission"
    manifest["audioFinalListenMissionPacketApprovalStateChanged"] = False
    manifest["audioFinalListenMissionPacketBranchStateChanged"] = False
    manifest["audioFinalListenMissionPacketRenderAttempted"] = False
    manifest["audioFinalListenMissionPacketBranchRenderAttempted"] = False
    manifest["audioFinalListenMissionPacketUploadAttempted"] = False
    manifest["audioFinalListenMissionPacketPublicationAttempted"] = False
    manifest["audioFinalListenMissionPacketOriginalMediaMutated"] = False
    write_json(manifest_path, manifest)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    outputs = manifest.get("outputs") or {}
    baseline_id = str(manifest.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    generated_iso = datetime.now(timezone.utc).isoformat()

    reports = {
        "missionReel": load_output_report(outputs, "latestAudioHumanListenMissionReel"),
        "speakerCleanupReel": load_output_report(outputs, "latestSpeakerCleanupListenReel"),
        "asrReviewFocus": load_output_report(outputs, "latestAudioAsrReviewFocusPacket"),
        "defectAtlas": load_output_report(outputs, "latestAudioDefectAtlas"),
        "postReviewQueue": load_output_report(outputs, "latestAudioPostReviewActionQueue"),
        "sourceAwareStemManifest": load_output_report(outputs, "latestAudioSourceAwareStemManifest"),
        "sourceAwareTimingContract": load_output_report(outputs, "latestAudioSourceAwareTimingContract"),
        "segmentLoudnessMap": load_output_report(outputs, "latestAudioSegmentLoudnessMap"),
    }

    artifacts = [
        artifact(outputs, "Producer Command Center", "latestAudioProducerCommandCenterHtml", required=True, why="Current state front door for the audio producer.", action="Open first if you want the broader board."),
        artifact(outputs, "Final-listen fast pass", "latestAudioFinalListenFastPassHtml", required=True, why="Fastest whole-review starting surface.", action="Use as a first confidence pass."),
        artifact(outputs, "Human Listen Mission Reel", "latestAudioHumanListenMissionReelM4a", required=True, why="Short focused listen reel for the highest-signal review windows.", action="Listen end-to-end before any pass decision."),
        artifact(outputs, "Speaker Cleanup Listen Reel", "latestSpeakerCleanupListenReelM4a", required=True, why="Checks whether source-aware cleanup kept both speakers natural.", action="Listen for chopped cadence, erased laughs, and echo bleed."),
        artifact(outputs, "ASR Review Focus Packet", "latestAudioAsrReviewFocusPacketHtml", required=True, why="Turns source/master transcript drift into exact listen targets.", action="Open before approval and listen to any flagged windows."),
        artifact(outputs, "Audio Defect Atlas", "latestAudioDefectAtlasHtml", required=True, why="Stage-aware risk map for exact proof/repair notes.", action="Use when a symptom needs an exact owner."),
        artifact(outputs, "Audio Defect Atlas notes template", "latestAudioDefectAtlasNotesTemplate", required=True, why="Stable JSON note packet for atlas-item pass/proof/repair decisions.", action="Fill this if an atlas item needs judgment."),
        artifact(outputs, "Audio Defect Atlas notes inbox", "latestAudioDefectAtlasNotesInboxHtml", required=True, why="Safe return surface for atlas notes.", action="Rerun after exported notes exist."),
        artifact(outputs, "Source-aware stem manifest", "latestAudioSourceAwareStemManifestHtml", required=True, why="Proves Charlie, Homer, and clip/source audio remain separate synced refined stems; the master is not the only editor truth.", action="Use when branch renders or repairs need source-specific audio truth."),
        artifact(outputs, "Source-aware timing contract", "latestAudioSourceAwareTimingContractHtml", required=True, why="Proves the separate refined stems remain full-length on one sequence clock for video-aware timing edits, conversation spacing, clip weaving, and J/L cut repair.", action="Use before branch rendering or any timing-sensitive edit work."),
        artifact(outputs, "Segment audio map", "latestAudioSegmentLoudnessMapHtml", required=True, why="Shows 10-second RMS/sample-peak review windows across the master and stems without approving or rendering anything.", action="Use to route loud/quiet/unexplained sections to ears."),
        artifact(outputs, "Segment audio map CSV", "latestAudioSegmentLoudnessMapCsv", required=False, why="Machine-readable audio-window evidence for agents and spreadsheet-style inspection.", action="Use when comparing exact windows or future caching work."),
        artifact(outputs, "Post-review action queue", "latestAudioPostReviewActionQueueMarkdown", required=True, why="Unified queue for returned pass/proof/repair notes.", action="Use after any notes are exported."),
        artifact(outputs, "Scoped v007 repair candidate plan", "latestAudioScopedV007RepairCandidatePlanHtml", required=False, why="Where returned repair/proof notes become stage-owned v007 plans without rendering or unlocking branches.", action="Use only if notes request proof or repair."),
        artifact(outputs, "Human Listen Decision Front Door", "latestHumanListenDecisionFrontDoorHtml", required=True, why="The guarded decision path for actual human approval/failure.", action="Use only after listening."),
        artifact(outputs, "Listen Proof Coverage Map", "latestAudioListenProofCoverageMapHtml", required=False, why="Shows why the remaining partial/locked requirements need human ears.", action="Open when explaining why v006 is still locked."),
        artifact(outputs, "Audio Runway State", "latestAudioRunwayStateHtml", required=False, why="Compact readiness and lock-state board.", action="Open if current readiness is confusing."),
    ]
    missing_required = [item for item in artifacts if item["required"] and not item["exists"]]
    steps = build_steps(outputs, reports)
    status = "ready-for-final-human-listen-mission" if not missing_required else "needs-mission-artifact-repair"

    stable_json = baseline_dir / "AUDIO_FINAL_LISTEN_MISSION_PACKET.json"
    stable_md = baseline_dir / "AUDIO_FINAL_LISTEN_MISSION_PACKET.md"
    stable_html = baseline_dir / "AUDIO_FINAL_LISTEN_MISSION_PACKET.html"
    stable_open = baseline_dir / "OPEN_AUDIO_FINAL_LISTEN_MISSION_PACKET.command"
    versioned_dir = baseline_dir / f"audio-final-listen-mission-packet-{slug}-{generated_at}"
    versioned_dir.mkdir(parents=True, exist_ok=True)
    versioned_json = versioned_dir / "final-listen-mission-packet.json"
    versioned_md = versioned_dir / "final-listen-mission-packet.md"
    versioned_html = versioned_dir / "final-listen-mission-packet.html"
    versioned_open = versioned_dir / "open-final-listen-mission-packet.command"

    report = {
        "schema": "quipsly.audio-workbench.final-listen-mission-packet.v1",
        "generatedAt": generated_at,
        "generatedIso": generated_iso,
        "status": status,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "approvalStatus": manifest.get("approvalStatus"),
        "packageReadyForHumanListen": bool(manifest.get("packageReadyForHumanListen")),
        "branchInheritanceReady": bool(manifest.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest.get("branchRenderReady")),
        "missionStepCount": len(steps),
        "requiredStepCount": sum(1 for step in steps if step.get("required")),
        "optionalStepCount": sum(1 for step in steps if not step.get("required")),
        "requiredArtifactCount": sum(1 for item in artifacts if item.get("required")),
        "missingRequiredArtifactCount": len(missing_required),
        "missingRequiredArtifacts": missing_required,
        "minimumSufficientListenPath": steps,
        "artifacts": artifacts,
        "sourceAwareStemManifestIncluded": bool(output_path(outputs.get("latestAudioSourceAwareStemManifestHtml")) and Path(str(output_path(outputs.get("latestAudioSourceAwareStemManifestHtml")))).exists()),
        "sourceAwareStemManifestStatus": reports.get("sourceAwareStemManifest", {}).get("status"),
        "sourceAwareStemResolvedCount": int_value(reports.get("sourceAwareStemManifest", {}).get("resolvedStemCount")),
        "sourceAwareTimingContractIncluded": bool(output_path(outputs.get("latestAudioSourceAwareTimingContractHtml")) and Path(str(output_path(outputs.get("latestAudioSourceAwareTimingContractHtml")))).exists()),
        "sourceAwareTimingContractStatus": reports.get("sourceAwareTimingContract", {}).get("status"),
        "sourceAwareTimingContractReady": bool(reports.get("sourceAwareTimingContract", {}).get("sourceAwareTimingReady")),
        "sourceAwareTimingContractReadyRoleCount": int_value(reports.get("sourceAwareTimingContract", {}).get("readyRoleCount")),
        "sourceAwareTimingContractHardStopCount": int_value(reports.get("sourceAwareTimingContract", {}).get("hardStopCount")),
        "sourceAwareTimingContractMaxDurationDeltaToMasterSeconds": reports.get("sourceAwareTimingContract", {}).get("maxDurationDeltaToMasterSeconds"),
        "segmentLoudnessMapIncluded": bool(output_path(outputs.get("latestAudioSegmentLoudnessMapHtml")) and Path(str(output_path(outputs.get("latestAudioSegmentLoudnessMapHtml")))).exists()),
        "segmentLoudnessMapStatus": reports.get("segmentLoudnessMap", {}).get("status"),
        "segmentLoudnessMapOutlierCount": int_value(reports.get("segmentLoudnessMap", {}).get("outlierCount")),
        "nextSafeAction": "Open this packet, listen to the Mission Reel and Speaker Cleanup Reel, inspect the Source-aware Stem Manifest, Source-aware Timing Contract, and Segment Audio Map only when a symptom needs source-specific proof, return notes through the notes inbox/queue, then use the guarded Human Listen Decision Front Door.",
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "branchRenderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
        "jsonPath": str(stable_json),
        "markdownPath": str(stable_md),
        "htmlPath": str(stable_html),
        "openCommand": str(stable_open),
        "versionedJsonPath": str(versioned_json),
        "versionedMarkdownPath": str(versioned_md),
        "versionedHtmlPath": str(versioned_html),
        "versionedOpenCommand": str(versioned_open),
    }

    markdown = render_markdown(report)
    html_doc = render_html(report)
    for path in (stable_json, versioned_json):
        write_json(path, report)
    for path in (stable_md, versioned_md):
        path.write_text(markdown, encoding="utf-8")
    for path in (stable_html, versioned_html):
        path.write_text(html_doc, encoding="utf-8")
    write_open_command(stable_open, stable_html, stable_md)
    write_open_command(versioned_open, versioned_html, versioned_md)
    update_manifest(manifest_path, report)
    print(json.dumps({"json": str(stable_json), "html": str(stable_html), "status": status, "missingRequiredArtifactCount": len(missing_required)}, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
