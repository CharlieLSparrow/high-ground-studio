#!/usr/bin/env python3
"""Create a morning publication-readiness packet for the current audio spine.

This packet is intentionally a decision surface, not an approval tool. It tells
Charlie what can be listened to or pulled into Premiere in the morning, which
machine checks are strong, and which human gates remain locked before YouTube,
Spotify, Apple Podcasts, or any other public publishing.
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
            "wavPath",
            "m4aPath",
            "versionedPath",
            "versionedJsonPath",
            "versionedMarkdownPath",
            "versionedHtmlPath",
        ):
            candidate = value.get(key)
            if isinstance(candidate, str) and candidate:
                return candidate
    return None


def load_report(outputs: dict[str, Any], key: str) -> tuple[dict[str, Any], str | None]:
    path = output_path(outputs.get(key))
    if not path:
        return {}, None
    p = Path(path)
    if not p.exists() or p.suffix.lower() != ".json":
        return {}, path
    try:
        return read_json(p), path
    except json.JSONDecodeError:
        return {}, path


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def utc_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def bool_value(value: Any) -> bool:
    return bool(value)


def int_value(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def float_value(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def candidate_file(outputs: dict[str, Any], baseline_dir: Path, keys: list[str], fallback_name: str) -> str | None:
    for key in keys:
        path = output_path(outputs.get(key))
        if path and Path(path).exists():
            return path
    fallback = baseline_dir / fallback_name
    if fallback.exists():
        return str(fallback)
    return None


def file_summary(path: str | None) -> dict[str, Any]:
    if not path:
        return {"path": None, "exists": False}
    p = Path(path)
    exists = p.exists()
    return {
        "path": path,
        "exists": exists,
        "sizeBytes": p.stat().st_size if exists else 0,
        "sizeMb": round(p.stat().st_size / (1024 * 1024), 2) if exists else 0,
        "extension": p.suffix.lower() if exists else "",
    }


def build_report(manifest: dict[str, Any], baseline_dir: Path, generated_at: str) -> dict[str, Any]:
    outputs = manifest.get("outputs") if isinstance(manifest.get("outputs"), dict) else {}
    baseline_id = str(manifest.get("baselineId") or "audio-baseline")
    approval_status = str(manifest.get("approvalStatus") or "unknown")
    package_ready = bool_value(manifest.get("packageReadyForHumanListen"))
    branch_inheritance_ready = bool_value(manifest.get("branchInheritanceReady"))
    branch_render_ready = bool_value(manifest.get("branchRenderReady"))

    sound_director, sound_director_path = load_report(outputs, "latestAudioSoundDirectorScorecard")
    platform, platform_path = load_report(outputs, "latestAudioPlatformLoudnessAudit")
    broadcast, broadcast_path = load_report(outputs, "latestAudioBroadcastPolishScorecard")
    command_center, command_center_path = load_report(outputs, "latestAudioProducerCommandCenter")
    final_mission, final_mission_path = load_report(outputs, "latestAudioFinalListenMissionPacket")
    review_gate, review_gate_path = load_report(outputs, "latestAudioReviewGateAudit")
    manifest_smoke, manifest_smoke_path = load_report(outputs, "latestAudioManifestReadbackConsistencySmoke")

    wav_path = candidate_file(
        outputs,
        baseline_dir,
        ["masterWav", "latestMasterWav", "latestMasteredAudioSpineWav", "latestAudioSpineWav"],
        "episode4-mastered-audio-spine-v006.wav",
    )
    m4a_path = candidate_file(
        outputs,
        baseline_dir,
        ["listeningM4a", "masterM4a", "latestMasterM4a", "latestMasteredAudioSpineM4a"],
        "episode4-mastered-audio-spine-v006.m4a",
    )

    sound_hard_stops = int_value(sound_director.get("hardStopCount"))
    sound_missing = int_value(sound_director.get("missingEvidenceCount"))
    sound_risks = int_value(sound_director.get("reviewRiskCount"))
    sound_score = float_value(sound_director.get("machineConfidenceScore"))
    platform_hard_gates = int_value(manifest.get("audioPlatformLoudnessHardGateAttentionCount"))
    podcast_machine_ready = bool_value(manifest.get("audioPlatformLoudnessPodcastProfilesMachineReady"))
    review_gate_errors = int_value(manifest.get("audioReviewGateAuditLatestErrorCount"))
    manifest_failures = int_value(manifest.get("audioManifestReadbackConsistencySmokeFailureCount"))
    command_missing = int_value(manifest.get("audioProducerCommandCenterMissingPrimaryArtifactCount"))

    hard_stops: list[str] = []
    if not wav_path or not Path(wav_path).exists():
        hard_stops.append("Master WAV is missing.")
    if not m4a_path or not Path(m4a_path).exists():
        hard_stops.append("Listening M4A is missing.")
    if not package_ready:
        hard_stops.append("Package is not marked ready for human listen.")
    if sound_hard_stops:
        hard_stops.append(f"Sound Director reports {sound_hard_stops} hard stop(s).")
    if sound_missing:
        hard_stops.append(f"Sound Director reports {sound_missing} missing evidence item(s).")
    if platform_hard_gates:
        hard_stops.append(f"Platform loudness audit reports {platform_hard_gates} hard-gate issue(s).")
    if review_gate_errors:
        hard_stops.append(f"Review gate reports {review_gate_errors} error(s).")
    if manifest_failures:
        hard_stops.append(f"Manifest readback smoke reports {manifest_failures} failure(s).")
    if command_missing:
        hard_stops.append(f"Producer Command Center is missing {command_missing} primary artifact(s).")
    if branch_inheritance_ready and not approval_status.startswith("human-approved"):
        hard_stops.append("Branch inheritance is unlocked without human approval.")
    if branch_render_ready and not branch_inheritance_ready:
        hard_stops.append("Branch rendering is unlocked before branch inheritance.")

    human_listen_required = approval_status == "machine-candidate-needs-human-listen-proof"
    machine_ready_for_audio_review = not hard_stops and package_ready and podcast_machine_ready
    machine_ready_for_manual_premiere_use = machine_ready_for_audio_review and bool(wav_path)
    if hard_stops:
        status = "needs-audio-workbench-attention"
        next_safe_action = "Fix the hard-stop items, then rerun the sequential audio control plane before listening or rendering."
    elif human_listen_required:
        status = "morning-review-ready-human-listen-required"
        next_safe_action = "Listen to the M4A/WAV and focused review surfaces. If it passes, record the guarded human decision before rendering or publishing."
    else:
        status = "human-decision-recorded-refresh-branches"
        next_safe_action = "Refresh branch inheritance and render preflights before creating publishable episode or shorts exports."

    platforms = [
        {
            "id": "apple-podcast",
            "label": "Apple Podcasts / RSS",
            "target": "Podcast-safe spoken-word master near -16 LKFS/LUFS with true peak at or below about -1 dB.",
            "candidateFile": wav_path,
            "ready": machine_ready_for_audio_review,
            "stillNeeds": "Human listen pass, final episode metadata, and manual/approved upload path.",
        },
        {
            "id": "spotify-podcast",
            "label": "Spotify podcast",
            "target": "Podcast-safe spoken-word master near -16 LUFS; avoid chasing music-style loudness over dialogue naturalness.",
            "candidateFile": wav_path,
            "ready": machine_ready_for_audio_review,
            "stillNeeds": "Human listen pass, final episode metadata, and manual/approved upload path.",
        },
        {
            "id": "youtube-long-form",
            "label": "YouTube long-form",
            "target": "Use the approved audio spine inside the final video render; keep dialogue natural and non-fatiguing.",
            "candidateFile": wav_path,
            "ready": machine_ready_for_manual_premiere_use,
            "stillNeeds": "Human listen pass, final video edit/render, title/description/thumbnail, and manual/approved upload.",
        },
        {
            "id": "shorts-social",
            "label": "Shorts / Reels / social clips",
            "target": "Use the approved spine or branch mix, then tailor loudness and captions per short without mutating the source spine.",
            "candidateFile": wav_path,
            "ready": machine_ready_for_manual_premiere_use,
            "stillNeeds": "Short-specific edit decisions, captions, crop, hook, and manual/approved upload.",
        },
    ]

    review_steps = [
        {
            "step": 1,
            "label": "Start with the Producer Command Center.",
            "path": output_path(outputs.get("latestAudioProducerCommandCenterHtml")) or command_center_path,
            "why": "It is the current front door for the audio proof system.",
        },
        {
            "step": 2,
            "label": "Listen to the morning candidate M4A.",
            "path": m4a_path,
            "why": "Fast practical check before dragging the WAV into Premiere or using it as episode spine.",
        },
        {
            "step": 3,
            "label": "Check the focused final-listen mission.",
            "path": output_path(outputs.get("latestAudioFinalListenMissionPacketHtml")) or final_mission_path,
            "why": "It gives the smallest defensible list of windows that still need ears.",
        },
        {
            "step": 4,
            "label": "If it passes, record a guarded human-listen decision.",
            "path": output_path(outputs.get("latestHumanListenDecisionFrontDoorHtml")),
            "why": "Only this route should unlock branch inheritance later.",
        },
        {
            "step": 5,
            "label": "If it fails, export exact notes and route scoped v007 work.",
            "path": output_path(outputs.get("latestAudioScopedV007RepairCandidatePlanHtml")),
            "why": "Repair exact symptoms instead of rerunning the whole audio chain blindly.",
        },
    ]

    return {
        "schema": "quipsly.audio-workbench.morning-publication-readiness-packet.v1",
        "generatedAt": generated_at,
        "generatedIso": iso_now(),
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "status": status,
        "approvalStatus": approval_status,
        "packageReadyForHumanListen": package_ready,
        "branchInheritanceReady": branch_inheritance_ready,
        "branchRenderReady": branch_render_ready,
        "humanListenRequired": human_listen_required,
        "readyForMorningReview": machine_ready_for_audio_review,
        "machineReadyForAudioReview": machine_ready_for_audio_review,
        "machineReadyForManualPremiereUse": machine_ready_for_manual_premiere_use,
        "recommendedAudioFile": wav_path,
        "recommendedListeningFile": m4a_path,
        "masterWav": file_summary(wav_path),
        "listeningM4a": file_summary(m4a_path),
        "machineEvidence": {
            "soundDirectorScore": sound_score,
            "soundDirectorStatus": sound_director.get("status"),
            "soundDirectorHardStops": sound_hard_stops,
            "soundDirectorMissingEvidence": sound_missing,
            "soundDirectorReviewRisks": sound_risks,
            "broadcastPolishScore": broadcast.get("overallScore"),
            "broadcastPolishStatus": broadcast.get("overallStatus"),
            "platformHardGateAttentionCount": platform_hard_gates,
            "podcastProfilesMachineReady": podcast_machine_ready,
            "reviewGateErrors": review_gate_errors,
            "manifestSmokeFailures": manifest_failures,
            "producerCommandCenterMissingArtifacts": command_missing,
        },
        "sourceReports": {
            "soundDirectorScorecard": sound_director_path,
            "platformLoudnessAudit": platform_path,
            "broadcastPolishScorecard": broadcast_path,
            "producerCommandCenter": command_center_path,
            "finalListenMissionPacket": final_mission_path,
            "reviewGateAudit": review_gate_path,
            "manifestReadbackSmoke": manifest_smoke_path,
        },
        "hardStopCount": len(hard_stops),
        "hardStops": hard_stops,
        "reviewRiskCount": sound_risks + (1 if human_listen_required else 0),
        "platformCount": len(platforms),
        "platforms": platforms,
        "reviewSteps": review_steps,
        "nextSafeAction": next_safe_action,
        "guardrails": [
            "This packet does not approve the audio spine.",
            "This packet does not unlock branch inheritance or branch rendering.",
            "This packet does not render video, upload, publish, schedule, or mutate original media.",
            "Use the WAV in Premiere only as a human-review or manually approved production input until a guarded listen decision is recorded.",
        ],
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
    }


def link(path: str | None, label: str | None = None) -> str:
    if not path:
        return "missing"
    label = label or Path(path).name
    return f"[{label}]({path})"


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Morning Publication Readiness: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "This is the morning decision packet for Episode 4's current audio spine. It is not public-publishing approval.",
        "",
        "## Current truth",
        "",
        f"- Status: `{report['status']}`",
        f"- Ready for morning audio review: `{str(report['readyForMorningReview']).lower()}`",
        f"- Machine ready for manual Premiere use: `{str(report['machineReadyForManualPremiereUse']).lower()}`",
        f"- Human listen required: `{str(report['humanListenRequired']).lower()}`",
        f"- Approval status: `{report['approvalStatus']}`",
        f"- Branch inheritance ready: `{str(report['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(report['branchRenderReady']).lower()}`",
        f"- Recommended WAV: {link(report.get('recommendedAudioFile'))}",
        f"- Listening M4A: {link(report.get('recommendedListeningFile'))}",
        "",
        "## Machine evidence",
        "",
    ]
    for key, value in report["machineEvidence"].items():
        lines.append(f"- {key}: `{value}`")
    if report["hardStops"]:
        lines.extend(["", "## Hard stops", ""])
        for item in report["hardStops"]:
            lines.append(f"- {item}")
    lines.extend(["", "## Morning review steps", ""])
    for step in report["reviewSteps"]:
        lines.append(f"{step['step']}. {step['label']} {link(step.get('path'), 'open')}. {step['why']}")
    lines.extend(["", "## Platform packet readiness", "", "| Platform | Ready | Candidate file | Still needs |", "|---|---:|---|---|"])
    for platform in report["platforms"]:
        lines.append(
            f"| {platform['label']} | `{str(platform['ready']).lower()}` | {link(platform.get('candidateFile'))} | {platform['stillNeeds']} |"
        )
    lines.extend(["", "## Next safe action", "", report["nextSafeAction"], "", "## Guardrails", ""])
    for item in report["guardrails"]:
        lines.append(f"- {item}")
    lines.append("")
    return "\n".join(lines)


def render_html(report: dict[str, Any]) -> str:
    hard_stop_rows = "".join(f"<li>{html.escape(item)}</li>" for item in report["hardStops"]) or "<li>None</li>"
    step_rows = []
    for step in report["reviewSteps"]:
        path = step.get("path")
        label = html.escape(str(step["label"]))
        href = f"<a href=\"file://{html.escape(path)}\">open</a>" if path else "missing"
        step_rows.append(f"<li><strong>{label}</strong> {href}<br><small>{html.escape(str(step['why']))}</small></li>")
    platform_rows = []
    for platform in report["platforms"]:
        candidate = platform.get("candidateFile")
        candidate_link = f"<a href=\"file://{html.escape(candidate)}\">file</a>" if candidate else "missing"
        ready_class = "ok" if platform["ready"] else "warn"
        platform_rows.append(
            "<tr>"
            f"<td>{html.escape(platform['label'])}</td>"
            f"<td class=\"{ready_class}\">{str(platform['ready']).lower()}</td>"
            f"<td>{candidate_link}</td>"
            f"<td>{html.escape(platform['stillNeeds'])}</td>"
            "</tr>"
        )
    evidence_cards = "".join(
        f"<div class=\"pill\"><b>{html.escape(key)}</b><br>{html.escape(str(value))}</div>"
        for key, value in report["machineEvidence"].items()
    )
    return f"""<!doctype html>
<html lang=\"en\">
<head>
<meta charset=\"utf-8\" />
<title>Morning Publication Readiness</title>
<style>
:root {{ --bg:#15170f; --panel:#252819; --panel2:#313620; --ink:#f7efd9; --muted:#c8ba91; --gold:#f4ce55; --moss:#83d17d; --clay:#e38162; --line:#554829; }}
body {{ margin:0; padding:32px; font-family:-apple-system,BlinkMacSystemFont,sans-serif; background:radial-gradient(circle at top left,#31391f,var(--bg) 48%); color:var(--ink); }}
a {{ color:var(--gold); }}
.hero,.card {{ border:1px solid var(--line); background:rgba(37,40,25,.94); border-radius:24px; padding:24px; margin-bottom:18px; }}
.pills {{ display:flex; gap:10px; flex-wrap:wrap; }}
.pill {{ border:1px solid var(--line); background:var(--panel2); border-radius:16px; padding:10px 12px; }}
.ok {{ color:var(--moss); font-weight:900; }}
.warn {{ color:var(--clay); font-weight:900; }}
table {{ width:100%; border-collapse:collapse; }}
td,th {{ border-bottom:1px solid rgba(255,255,255,.12); padding:10px; text-align:left; vertical-align:top; }}
small,.muted {{ color:var(--muted); }}
code {{ color:var(--gold); }}
li {{ margin:8px 0; }}
</style>
</head>
<body>
<section class=\"hero\">
  <p class=\"muted\">QUIPSLY EPISODE 4 AUDIO</p>
  <h1>Morning Publication Readiness</h1>
  <p>Status: <strong>{html.escape(report['status'])}</strong></p>
  <div class=\"pills\">
    <div class=\"pill\">Morning review: <span class=\"{'ok' if report['readyForMorningReview'] else 'warn'}\">{str(report['readyForMorningReview']).lower()}</span></div>
    <div class=\"pill\">Premiere WAV use: <span class=\"{'ok' if report['machineReadyForManualPremiereUse'] else 'warn'}\">{str(report['machineReadyForManualPremiereUse']).lower()}</span></div>
    <div class=\"pill\">Human listen required: <span class=\"warn\">{str(report['humanListenRequired']).lower()}</span></div>
    <div class=\"pill\">Hard stops: {report['hardStopCount']}</div>
    <div class=\"pill\">Review risks: {report['reviewRiskCount']}</div>
  </div>
  <p><strong>Next:</strong> {html.escape(report['nextSafeAction'])}</p>
</section>
<section class=\"card\">
  <h2>Files to use</h2>
  <p>WAV: <a href=\"file://{html.escape(str(report.get('recommendedAudioFile') or ''))}\">{html.escape(str(report.get('recommendedAudioFile') or 'missing'))}</a></p>
  <p>M4A: <a href=\"file://{html.escape(str(report.get('recommendedListeningFile') or ''))}\">{html.escape(str(report.get('recommendedListeningFile') or 'missing'))}</a></p>
</section>
<section class=\"card\">
  <h2>Machine evidence</h2>
  <div class=\"pills\">{evidence_cards}</div>
</section>
<section class=\"card\">
  <h2>Hard stops</h2>
  <ul>{hard_stop_rows}</ul>
</section>
<section class=\"card\">
  <h2>Morning review steps</h2>
  <ol>{''.join(step_rows)}</ol>
</section>
<section class=\"card\">
  <h2>Platform readiness</h2>
  <table><tbody>{''.join(platform_rows)}</tbody></table>
</section>
</body>
</html>
"""


def write_open_command(path: Path, html_path: Path) -> None:
    path.write_text("#!/bin/zsh\nset -euo pipefail\nopen " + shell_quote(str(html_path)) + "\n", encoding="utf-8")
    path.chmod(0o755)


def update_manifest(
    baseline_dir: Path,
    report: dict[str, Any],
    stable_json: Path,
    stable_md: Path,
    stable_html: Path,
    stable_open: Path,
    versioned_json: Path,
    versioned_md: Path,
    versioned_html: Path,
    versioned_open: Path,
) -> None:
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    outputs["latestAudioMorningPublicationReadinessPacket"] = str(stable_json)
    outputs["latestAudioMorningPublicationReadinessPacketMarkdown"] = str(stable_md)
    outputs["latestAudioMorningPublicationReadinessPacketHtml"] = str(stable_html)
    outputs["latestAudioMorningPublicationReadinessPacketOpenCommand"] = str(stable_open)
    outputs["latestAudioMorningPublicationReadinessPacketVersioned"] = str(versioned_json)
    outputs["latestAudioMorningPublicationReadinessPacketVersionedMarkdown"] = str(versioned_md)
    outputs["latestAudioMorningPublicationReadinessPacketVersionedHtml"] = str(versioned_html)
    outputs["latestAudioMorningPublicationReadinessPacketVersionedOpenCommand"] = str(versioned_open)
    history = outputs.setdefault("audioMorningPublicationReadinessPackets", [])
    if isinstance(history, list):
        history.append(str(versioned_json))

    manifest["audioMorningPublicationReadinessLatestStatus"] = report["status"]
    manifest["audioMorningPublicationReadinessLatestGeneratedAt"] = report["generatedAt"]
    manifest["audioMorningPublicationReadinessReadyForMorningReview"] = report["readyForMorningReview"]
    manifest["audioMorningPublicationReadinessMachineReadyForAudioReview"] = report["machineReadyForAudioReview"]
    manifest["audioMorningPublicationReadinessMachineReadyForManualPremiereUse"] = report["machineReadyForManualPremiereUse"]
    manifest["audioMorningPublicationReadinessHumanListenRequired"] = report["humanListenRequired"]
    manifest["audioMorningPublicationReadinessHardStopCount"] = report["hardStopCount"]
    manifest["audioMorningPublicationReadinessReviewRiskCount"] = report["reviewRiskCount"]
    manifest["audioMorningPublicationReadinessPlatformCount"] = report["platformCount"]
    manifest["audioMorningPublicationReadinessRecommendedAudioFile"] = report["recommendedAudioFile"]
    manifest["audioMorningPublicationReadinessRecommendedListeningFile"] = report["recommendedListeningFile"]
    manifest["audioMorningPublicationReadinessApprovalStateChanged"] = False
    manifest["audioMorningPublicationReadinessBranchStateChanged"] = False
    manifest["audioMorningPublicationReadinessRenderAttempted"] = False
    manifest["audioMorningPublicationReadinessUploadAttempted"] = False
    manifest["audioMorningPublicationReadinessPublicationAttempted"] = False
    manifest["audioMorningPublicationReadinessOriginalMediaMutated"] = False
    write_json(manifest_path, manifest)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest = read_json(baseline_dir / "manifest.json")
    baseline_id = str(manifest.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated = utc_stamp()
    report = build_report(manifest, baseline_dir, generated)

    versioned_dir = baseline_dir / f"audio-morning-publication-readiness-{slug}-{generated}"
    versioned_dir.mkdir(parents=True, exist_ok=True)
    versioned_json = versioned_dir / "morning-publication-readiness.json"
    versioned_md = versioned_dir / "morning-publication-readiness.md"
    versioned_html = versioned_dir / "morning-publication-readiness.html"
    versioned_open = versioned_dir / "open-morning-publication-readiness.command"

    stable_json = baseline_dir / "AUDIO_MORNING_PUBLICATION_READINESS.json"
    stable_md = baseline_dir / "AUDIO_MORNING_PUBLICATION_READINESS.md"
    stable_html = baseline_dir / "AUDIO_MORNING_PUBLICATION_READINESS.html"
    stable_open = baseline_dir / "OPEN_AUDIO_MORNING_PUBLICATION_READINESS.command"

    report.update(
        {
            "path": str(stable_json),
            "markdownPath": str(stable_md),
            "htmlPath": str(stable_html),
            "openCommand": str(stable_open),
            "versionedPath": str(versioned_json),
            "versionedMarkdownPath": str(versioned_md),
            "versionedHtmlPath": str(versioned_html),
            "versionedOpenCommand": str(versioned_open),
        }
    )

    markdown = render_markdown(report)
    html_doc = render_html(report)
    write_json(versioned_json, report)
    versioned_md.write_text(markdown, encoding="utf-8")
    versioned_html.write_text(html_doc, encoding="utf-8")
    write_open_command(versioned_open, versioned_html)
    write_json(stable_json, report)
    stable_md.write_text(markdown, encoding="utf-8")
    stable_html.write_text(html_doc, encoding="utf-8")
    write_open_command(stable_open, stable_html)
    update_manifest(baseline_dir, report, stable_json, stable_md, stable_html, stable_open, versioned_json, versioned_md, versioned_html, versioned_open)
    print(json.dumps(report, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
