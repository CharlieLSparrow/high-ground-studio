#!/usr/bin/env python3
"""Create the Episode 4 post-approval branch runway packet.

This is a readback artifact for the morning after human audio approval. It does
not approve the audio, unlock branches, render media, upload files, publish, or
mutate source media. It simply proves whether the render runway is ready to wake
up after a guarded human pass.
"""

from __future__ import annotations

import argparse
import html
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_BASELINE_DIR = Path(
    "/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/"
    "20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/"
    "conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310"
)


REQUIRED_ARTIFACTS = [
    ("latestAudioFinalListenMissionPacket", "Final listen mission packet"),
    ("latestAudioMorningAudioReviewLauncher", "Morning audio review launcher"),
    ("latestAudioAsrReviewFocusPacket", "ASR focus packet"),
    ("latestAudioPostListenEpisodeRunway", "Post-listen episode runway"),
    ("latestAudioPostApprovalRenderRehearsal", "Post-approval render rehearsal"),
    ("latestApprovedBranchRenderExecutor", "Guarded approved branch executor"),
    ("latestBranchInheritanceGate", "Branch inheritance gate"),
    ("branchRenderPreflight", "Branch render preflight"),
    ("latestAudioRunwayState", "Runway state"),
    ("latestAudioMorningPublicationReadinessPacket", "Morning publication readiness"),
]

PLATFORM_BRANCHES = [
    {
        "id": "youtube-main-45-60",
        "label": "YouTube main episode candidate",
        "target": "45-60 minute public cut, preferred if v006 passes",
        "format": "16:9 video rendered from source-aware branch decisions",
        "audioTruth": "Charlie/Homer/clip-source refined stems plus mix recipe on the shared sequence clock",
        "masteredSpineUse": "reference/QC and final delivery mix after the source-aware branch is shaped",
        "sourceAwareEditable": True,
    },
    {
        "id": "podcast-audio-rss",
        "label": "Spotify/Apple podcast audio candidate",
        "target": "Audio-only file for RSS/manual podcast upload",
        "format": "audio-only delivery from the approved source-aware mix/master chain",
        "audioTruth": "source-aware stems remain available for timing repair before the final podcast master is emitted",
        "masteredSpineUse": "primary delivery candidate once human-approved and platform-normalized",
        "sourceAwareEditable": True,
    },
    {
        "id": "youtube-shorts-social",
        "label": "Shorts/social pull-out candidates",
        "target": "9:16 shorts for YouTube Shorts, Instagram, Facebook, LinkedIn review",
        "format": "vertical video branches inheriting source-aware stems, clip/source audio, and branch decisions",
        "audioTruth": "each short can refine timing, ducking, clip weave, and cadence without destructively chopping source stems",
        "masteredSpineUse": "reference only unless a short intentionally exports the approved master segment",
        "sourceAwareEditable": True,
    },
    {
        "id": "extended-reference-cut",
        "label": "Extended/deep-cut candidate",
        "target": "60-80 minute preservation/reference branch if the main cut loses useful context",
        "format": "16:9 preservation/reference branch from source-aware branch decisions",
        "audioTruth": "same source-aware stems and sequence clock as the main branch, with looser SHOW/SKIP choices",
        "masteredSpineUse": "reference/QC and delivery convenience after source-aware timing is preserved",
        "sourceAwareEditable": True,
    },
]

QUALITY_METHODS = [
    {
        "layer": "technical signal",
        "meaning": "loudness, true peak, clipping, silence, dynamics, duration, and file integrity",
        "decisionUse": "blocks obvious delivery failures but cannot prove the episode feels good",
    },
    {
        "layer": "speaker survival",
        "meaning": "Homer and Charlie both remain present after cleanup, gating, and mastering",
        "decisionUse": "catches the earlier failure mode where one voice nearly disappeared",
    },
    {
        "layer": "ASR source/master comparison",
        "meaning": "proof-window transcripts from source-ish audio and mastered audio still agree enough to trust intelligibility",
        "decisionUse": "finds suspicious windows for human attention without pretending ASR is an editor",
    },
    {
        "layer": "translation survival",
        "meaning": "AAC/MP3/phone-style derived review media preserve the important moments",
        "decisionUse": "guards against a master that sounds okay locally but falls apart on platforms",
    },
    {
        "layer": "human listen gate",
        "meaning": "Charlie/Mako explicitly pass, fail, or request proof on v006",
        "decisionUse": "the only layer allowed to unlock final long-form and shorts renders",
    },
]


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


def utc_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def output_path(value: Any) -> str | None:
    if isinstance(value, str) and value:
        return value
    if isinstance(value, list):
        for item in reversed(value):
            path = output_path(item)
            if path:
                return path
    if isinstance(value, dict):
        for key in (
            "path",
            "jsonPath",
            "markdownPath",
            "htmlPath",
            "openCommand",
            "versionedPath",
            "versionedJsonPath",
            "versionedMarkdownPath",
            "versionedHtmlPath",
            "m4aPath",
            "wavPath",
            "playlistPath",
        ):
            subvalue = value.get(key)
            if isinstance(subvalue, str) and subvalue:
                return subvalue
    return None


def load_report(outputs: dict[str, Any], key: str, fallback: Path | None = None) -> dict[str, Any]:
    path = output_path(outputs.get(key))
    if path:
        candidate = Path(path)
        if candidate.exists() and candidate.suffix.lower() == ".json":
            try:
                return read_json(candidate)
            except json.JSONDecodeError:
                return {}
    if fallback and fallback.exists():
        try:
            return read_json(fallback)
        except json.JSONDecodeError:
            return {}
    return {}


def artifact(outputs: dict[str, Any], key: str, label: str, fallback: Path | None = None) -> dict[str, Any]:
    path = output_path(outputs.get(key))
    if not path and fallback is not None and fallback.exists():
        path = str(fallback)
    exists = bool(path and Path(path).exists())
    size = Path(path).stat().st_size if exists else 0
    return {
        "key": key,
        "label": label,
        "path": path,
        "exists": exists,
        "nonzero": size > 0,
        "sizeBytes": size,
    }


def int_value(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def bool_value(value: Any) -> bool:
    return bool(value)


def path_md(path: str | None) -> str:
    return f"`{path}`" if path else "`missing`"


def html_link(path: str | None, label: str) -> str:
    if not path:
        return "missing"
    return f'<a href="file://{html.escape(path)}">{html.escape(label)}</a>'


def build_report(manifest: dict[str, Any], baseline_dir: Path, generated_at: str) -> dict[str, Any]:
    outputs = manifest.get("outputs") or {}
    baseline_id = str(manifest.get("baselineId") or "v006-candidate")
    approval_status = str(manifest.get("approvalStatus") or "unknown")
    branch_inheritance_ready = bool_value(manifest.get("branchInheritanceReady"))
    branch_render_ready = bool_value(manifest.get("branchRenderReady"))

    post_listen = load_report(outputs, "latestAudioPostListenEpisodeRunway", baseline_dir / "EPISODE_4_POST_LISTEN_RUNWAY.json")
    rehearsal = load_report(outputs, "latestAudioPostApprovalRenderRehearsal", baseline_dir / "EPISODE_4_POST_APPROVAL_RENDER_REHEARSAL.json")
    executor = load_report(outputs, "latestApprovedBranchRenderExecutor")
    runway = load_report(outputs, "latestAudioRunwayState", baseline_dir / "AUDIO_RUNWAY_STATE.json")
    asr_focus = load_report(outputs, "latestAudioAsrReviewFocusPacket", baseline_dir / "AUDIO_ASR_REVIEW_FOCUS_PACKET.json")
    source_timing = load_report(outputs, "latestAudioSourceAwareTimingContract", baseline_dir / "AUDIO_SOURCE_AWARE_TIMING_CONTRACT.json")
    source_stems = load_report(outputs, "latestAudioSourceAwareStemManifest", baseline_dir / "AUDIO_SOURCE_AWARE_STEM_MANIFEST.json")

    artifacts: list[dict[str, Any]] = []
    for key, label in REQUIRED_ARTIFACTS:
        fallback = None
        if key == "branchRenderPreflight":
            fallback = baseline_dir / "BRANCH_RENDER_PREFLIGHT.json"
        artifacts.append(artifact(outputs, key, label, fallback))

    missing_artifacts = [item for item in artifacts if not item["exists"] or not item["nonzero"]]
    rehearsal_missing_inputs = int_value(rehearsal.get("missingInputCount"))
    rehearsal_branch_count = int_value(rehearsal.get("branchCount"))
    rehearsal_hard_stops = int_value(rehearsal.get("hardStopCount"))
    executor_status = str(executor.get("status") or manifest.get("approvedBranchRenderExecutorStatus") or "missing")
    executor_can_execute = bool_value(executor.get("canExecuteRealRenders"))
    executor_commands_exposed = bool_value(executor.get("commandsExposed"))
    source_aware_branch_edit_ready = (
        bool_value(source_timing.get("sourceAwareTimingReady") or manifest.get("audioSourceAwareTimingContractReady"))
        and int_value(source_timing.get("hardStopCount") or manifest.get("audioSourceAwareTimingContractHardStopCount")) == 0
        and bool_value(
            source_timing.get("postApprovalInheritsSourceAwareAudioTruth")
            if "postApprovalInheritsSourceAwareAudioTruth" in source_timing
            else manifest.get("audioSourceAwareTimingContractPostApprovalInheritsSourceAwareAudioTruth")
        )
        and not bool_value(
            source_timing.get("postApprovalMasteredSpineOnlyEditingAllowed")
            if "postApprovalMasteredSpineOnlyEditingAllowed" in source_timing
            else manifest.get("audioSourceAwareTimingContractPostApprovalMasteredSpineOnlyEditingAllowed")
        )
        and int_value(source_stems.get("readyStemCount") or manifest.get("audioSourceAwareStemManifestReadyStemCount")) >= 3
    )
    source_aware_role_ids = sorted(
        str(role)
        for role in (
            source_timing.get("roleIds")
            or manifest.get("audioSourceAwareTimingContractRoleIds")
            or ["charlie", "homer", "clip-source"]
        )
    )
    source_aware_branch_count = sum(1 for branch in PLATFORM_BRANCHES if branch.get("sourceAwareEditable") is True)
    current_gate = str(runway.get("currentGate") or manifest.get("audioRunwayStateCurrentGate") or "unknown")
    blocking_condition = str(runway.get("blockingCondition") or manifest.get("audioRunwayStateBlockingCondition") or "unknown")
    focus_risks = int_value(asr_focus.get("reviewRiskCount") or manifest.get("audioAsrReviewFocusPacketReviewRiskCount"))
    focus_hard_stops = int_value(asr_focus.get("hardStopCount") or manifest.get("audioAsrReviewFocusPacketHardStopCount"))

    ready_when_human_approved = (
        approval_status == "machine-candidate-needs-human-listen-proof"
        and current_gate == "audio-spine-human-listen"
        and blocking_condition == "waiting-for-human-listen-proof"
        and not branch_inheritance_ready
        and not branch_render_ready
        and not missing_artifacts
        and rehearsal_missing_inputs == 0
        and rehearsal_branch_count >= 3
        and rehearsal_hard_stops == 0
        and executor_status == "blocked-waiting-for-human-listen"
        and not executor_can_execute
        and not executor_commands_exposed
        and source_aware_branch_edit_ready
        and source_aware_branch_count == len(PLATFORM_BRANCHES)
        and focus_hard_stops == 0
    )

    if ready_when_human_approved:
        status = "post-approval-runway-ready-locked-by-human-listen"
        next_action = "Charlie listens to v006, records pass/fail/needs-proof, refreshes the control plane, then guarded branch renders may wake up."
    elif approval_status not in {"machine-candidate-needs-human-listen-proof", "human-approved"}:
        status = "post-approval-runway-needs-approval-state-review"
        next_action = "Inspect approval status before rendering; do not infer publication readiness from this packet."
    else:
        status = "post-approval-runway-needs-attention"
        next_action = "Fix missing inputs/artifacts or route the issue into scoped v007 repair before final renders."

    report = {
        "schema": "quipsly.audio.postApprovalBranchRunwayPacket.v1",
        "generatedAt": generated_at,
        "baselineId": baseline_id,
        "baselineDir": str(baseline_dir),
        "status": status,
        "readyWhenHumanApproved": ready_when_human_approved,
        "currentGate": current_gate,
        "blockingCondition": blocking_condition,
        "approvalStatus": approval_status,
        "branchInheritanceReady": branch_inheritance_ready,
        "branchRenderReady": branch_render_ready,
        "missingInputCount": len(missing_artifacts) + rehearsal_missing_inputs,
        "missingArtifactCount": len(missing_artifacts),
        "plannedBranchCount": len(PLATFORM_BRANCHES),
        "rehearsalBranchCount": rehearsal_branch_count,
        "rehearsalHardStopCount": rehearsal_hard_stops,
        "executorStatus": executor_status,
        "executorCanExecuteNow": executor_can_execute,
        "executorCommandsExposedNow": executor_commands_exposed,
        "sourceAwareBranchEditReady": source_aware_branch_edit_ready,
        "sourceAwareBranchCount": source_aware_branch_count,
        "sourceAwareBranchRoleIds": source_aware_role_ids,
        "sourceAwareTimingContractStatus": source_timing.get("status") or manifest.get("audioSourceAwareTimingContractLatestStatus"),
        "sourceAwareTimingContractReady": bool_value(source_timing.get("sourceAwareTimingReady") or manifest.get("audioSourceAwareTimingContractReady")),
        "sourceAwareTimingContractHardStopCount": int_value(source_timing.get("hardStopCount") or manifest.get("audioSourceAwareTimingContractHardStopCount")),
        "sourceAwareStemManifestStatus": source_stems.get("status") or manifest.get("audioSourceAwareStemManifestLatestStatus"),
        "sourceAwareStemReadyCount": int_value(source_stems.get("readyStemCount") or manifest.get("audioSourceAwareStemManifestReadyStemCount")),
        "sourceAwareMasteredSpineOnlyEditingAllowed": False,
        "asrFocusHardStopCount": focus_hard_stops,
        "asrFocusReviewRiskCount": focus_risks,
        "nextSafeAction": next_action,
        "platformBranches": PLATFORM_BRANCHES,
        "qualityMethodStack": QUALITY_METHODS,
        "requiredArtifacts": artifacts,
        "missingArtifacts": missing_artifacts,
        "reviewFocus": {
            "asrStatus": asr_focus.get("status") or manifest.get("audioAsrReviewFocusPacketLatestStatus"),
            "focusWindowCount": int_value(asr_focus.get("focusWindowCount") or len(asr_focus.get("focusWindows") or [])),
            "reviewRiskCount": focus_risks,
            "hardStopCount": focus_hard_stops,
            "html": output_path(outputs.get("latestAudioAsrReviewFocusPacketHtml")),
        },
        "sourceReports": {
            "postListenEpisodeRunway": output_path(outputs.get("latestAudioPostListenEpisodeRunway")),
            "postApprovalRenderRehearsal": output_path(outputs.get("latestAudioPostApprovalRenderRehearsal")),
            "approvedBranchExecutor": output_path(outputs.get("latestApprovedBranchRenderExecutor")),
            "runwayState": output_path(outputs.get("latestAudioRunwayState")),
            "sourceAwareTimingContract": output_path(outputs.get("latestAudioSourceAwareTimingContract")),
            "sourceAwareStemManifest": output_path(outputs.get("latestAudioSourceAwareStemManifest")),
        },
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "branchRenderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
    }
    return report


def write_markdown(path: Path, report: dict[str, Any]) -> None:
    lines = [
        "# Episode 4 Post-Approval Branch Runway Packet",
        "",
        f"Status: **{report['status']}**",
        f"Ready when human approved: **{report['readyWhenHumanApproved']}**",
        "",
        "## What is blocked right now",
        "",
        f"Current gate: `{report['currentGate']}`",
        f"Blocking condition: `{report['blockingCondition']}`",
        f"Approval status: `{report['approvalStatus']}`",
        "",
        "This packet is deliberately locked until the v006 audio spine passes a guarded human listen. It does not render, approve, upload, publish, or mutate source media.",
        "",
        "## Next safe action",
        "",
        report["nextSafeAction"],
        "",
        "## Planned branches after approval",
        "",
    ]
    for branch in report["platformBranches"]:
        lines.extend([
            f"- **{branch['label']}** (`{branch['id']}`)",
            f"  - Target: {branch['target']}",
            f"  - Format: {branch['format']}",
            f"  - Audio truth: {branch['audioTruth']}",
            f"  - Mastered spine use: {branch['masteredSpineUse']}",
            f"  - Source-aware editable: `{str(branch['sourceAwareEditable']).lower()}`",
        ])
    lines.extend([
        "",
        "## Source-aware branch edit contract",
        "",
        f"Source-aware branch edit ready: `{str(report['sourceAwareBranchEditReady']).lower()}`",
        f"Source-aware editable branches: `{report['sourceAwareBranchCount']}`",
        f"Source-aware roles: `{', '.join(report['sourceAwareBranchRoleIds'])}`",
        f"Timing contract: `{report['sourceAwareTimingContractStatus']}`",
        f"Timing hard stops: `{report['sourceAwareTimingContractHardStopCount']}`",
        f"Stem manifest: `{report['sourceAwareStemManifestStatus']}`",
        f"Ready stems: `{report['sourceAwareStemReadyCount']}`",
        f"Mastered-spine-only editing allowed: `{str(report['sourceAwareMasteredSpineOnlyEditingAllowed']).lower()}`",
        "",
        "## Quality method stack",
        "",
    ])
    for method in report["qualityMethodStack"]:
        lines.append(f"- **{method['layer']}**: {method['meaning']} Use: {method['decisionUse']}")
    lines.extend(["", "## Required runway artifacts", ""])
    for item in report["requiredArtifacts"]:
        status = "ready" if item["exists"] and item["nonzero"] else "missing"
        lines.append(f"- **{status}** - {item['label']}: {path_md(item.get('path'))}")
    lines.extend([
        "",
        "## Review focus",
        "",
        f"ASR focus status: `{report['reviewFocus'].get('asrStatus')}`",
        f"ASR focus windows: `{report['reviewFocus'].get('focusWindowCount')}`",
        f"ASR review risks: `{report['reviewFocus'].get('reviewRiskCount')}`",
        f"ASR hard stops: `{report['reviewFocus'].get('hardStopCount')}`",
        f"ASR focus packet: {path_md(report['reviewFocus'].get('html'))}",
        "",
        "## Safety readback",
        "",
        f"Approval state changed: `{report['approvalStateChanged']}`",
        f"Branch state changed: `{report['branchStateChanged']}`",
        f"Render attempted: `{report['renderAttempted']}`",
        f"Upload attempted: `{report['uploadAttempted']}`",
        f"Publication attempted: `{report['publicationAttempted']}`",
        f"Original media mutated: `{report['originalMediaMutated']}`",
        "",
    ])
    path.write_text("\n".join(lines), encoding="utf-8")


def write_html(path: Path, report: dict[str, Any]) -> None:
    branch_items = "\n".join(
        f"<li><strong>{html.escape(item['label'])}</strong> <code>{html.escape(item['id'])}</code><br>"
        f"Target: {html.escape(item['target'])}<br>"
        f"Format: {html.escape(item['format'])}<br>"
        f"Audio truth: {html.escape(item['audioTruth'])}<br>"
        f"Mastered spine use: {html.escape(item['masteredSpineUse'])}<br>"
        f"Source-aware editable: <code>{str(item['sourceAwareEditable']).lower()}</code></li>"
        for item in report["platformBranches"]
    )
    artifact_items = "\n".join(
        f"<li><strong>{'ready' if item['exists'] and item['nonzero'] else 'missing'}</strong> - "
        f"{html.escape(item['label'])}: {html_link(item.get('path'), Path(item['path']).name if item.get('path') else 'missing')}</li>"
        for item in report["requiredArtifacts"]
    )
    method_items = "\n".join(
        f"<li><strong>{html.escape(item['layer'])}</strong>: {html.escape(item['meaning'])}<br>Use: {html.escape(item['decisionUse'])}</li>"
        for item in report["qualityMethodStack"]
    )
    body = f"""<!doctype html>
<html><head><meta charset=\"utf-8\"><title>Episode 4 Post-Approval Runway</title>
<style>
body{{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#f8f4ea;color:#2d2317;line-height:1.5;margin:32px;}}
main{{max-width:1100px;margin:auto;background:#fffaf0;border:1px solid #dfcfad;border-radius:22px;padding:28px;box-shadow:0 14px 42px rgba(67,49,30,.12);}}
.badge{{display:inline-block;padding:8px 12px;border-radius:999px;background:#264f38;color:#eaf8df;font-weight:700;}}
.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;}}
.card{{background:#fff;border:1px solid #eadbbb;border-radius:16px;padding:16px;}}
code{{background:#efe6d2;padding:2px 5px;border-radius:6px;}}
a{{color:#2c6b4f;}}
</style></head><body><main>
<p class=\"badge\">{html.escape(report['status'])}</p>
<h1>Episode 4 Post-Approval Branch Runway</h1>
<div class=\"grid\">
<div class=\"card\"><strong>Ready when human approved</strong><br>{report['readyWhenHumanApproved']}</div>
<div class=\"card\"><strong>Current gate</strong><br><code>{html.escape(report['currentGate'])}</code></div>
<div class=\"card\"><strong>Blocking condition</strong><br><code>{html.escape(report['blockingCondition'])}</code></div>
<div class=\"card\"><strong>Approval status</strong><br><code>{html.escape(report['approvalStatus'])}</code></div>
</div>
<h2>Next safe action</h2><p>{html.escape(report['nextSafeAction'])}</p>
<h2>Planned branches after approval</h2><ul>{branch_items}</ul>
<h2>Source-aware branch edit contract</h2>
<div class=\"grid\">
<div class=\"card\"><strong>Source-aware branch edit ready</strong><br>{report['sourceAwareBranchEditReady']}</div>
<div class=\"card\"><strong>Editable branch count</strong><br>{report['sourceAwareBranchCount']}</div>
<div class=\"card\"><strong>Roles</strong><br>{html.escape(', '.join(report['sourceAwareBranchRoleIds']))}</div>
<div class=\"card\"><strong>Mastered-spine-only editing allowed</strong><br>{report['sourceAwareMasteredSpineOnlyEditingAllowed']}</div>
<div class=\"card\"><strong>Timing contract</strong><br><code>{html.escape(str(report['sourceAwareTimingContractStatus']))}</code></div>
<div class=\"card\"><strong>Stem manifest</strong><br><code>{html.escape(str(report['sourceAwareStemManifestStatus']))}</code></div>
</div>
<h2>Quality method stack</h2><ul>{method_items}</ul>
<h2>Required runway artifacts</h2><ul>{artifact_items}</ul>
<h2>Review focus</h2>
<p>ASR focus status: <code>{html.escape(str(report['reviewFocus'].get('asrStatus')))}</code><br>
ASR focus windows: <code>{report['reviewFocus'].get('focusWindowCount')}</code><br>
ASR review risks: <code>{report['reviewFocus'].get('reviewRiskCount')}</code><br>
ASR hard stops: <code>{report['reviewFocus'].get('hardStopCount')}</code><br>
ASR focus packet: {html_link(report['reviewFocus'].get('html'), 'open ASR focus packet')}</p>
<h2>Safety readback</h2>
<p>Approval changed: <code>{report['approvalStateChanged']}</code> | Branch changed: <code>{report['branchStateChanged']}</code> | Render attempted: <code>{report['renderAttempted']}</code> | Upload attempted: <code>{report['uploadAttempted']}</code> | Publication attempted: <code>{report['publicationAttempted']}</code> | Original media mutated: <code>{report['originalMediaMutated']}</code></p>
</main></body></html>"""
    path.write_text(body, encoding="utf-8")


def write_open_command(path: Path, html_path: Path, md_path: Path) -> None:
    path.write_text(
        "#!/usr/bin/env bash\n"
        "set -euo pipefail\n"
        f"open {shell_quote(str(html_path))}\n"
        f"open {shell_quote(str(md_path))}\n",
        encoding="utf-8",
    )
    path.chmod(0o755)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", type=Path, default=DEFAULT_BASELINE_DIR)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    generated_at = iso_now()
    stamp = utc_stamp()
    baseline_slug = safe_slug(str(manifest.get("baselineId") or baseline_dir.name))

    report = build_report(manifest, baseline_dir, generated_at)

    stable_json = baseline_dir / "AUDIO_POST_APPROVAL_BRANCH_RUNWAY_PACKET.json"
    stable_md = baseline_dir / "AUDIO_POST_APPROVAL_BRANCH_RUNWAY_PACKET.md"
    stable_html = baseline_dir / "AUDIO_POST_APPROVAL_BRANCH_RUNWAY_PACKET.html"
    stable_open = baseline_dir / "OPEN_AUDIO_POST_APPROVAL_BRANCH_RUNWAY_PACKET.command"
    versioned_json = baseline_dir / f"audio-post-approval-branch-runway-packet-{baseline_slug}-{stamp}.json"
    versioned_md = baseline_dir / f"audio-post-approval-branch-runway-packet-{baseline_slug}-{stamp}.md"
    versioned_html = baseline_dir / f"audio-post-approval-branch-runway-packet-{baseline_slug}-{stamp}.html"
    versioned_open = baseline_dir / f"open-audio-post-approval-branch-runway-packet-{baseline_slug}-{stamp}.command"

    write_json(stable_json, report)
    write_json(versioned_json, report)
    write_markdown(stable_md, report)
    write_markdown(versioned_md, report)
    write_html(stable_html, report)
    write_html(versioned_html, report)
    write_open_command(stable_open, stable_html, stable_md)
    write_open_command(versioned_open, versioned_html, versioned_md)

    manifest_after = read_json(manifest_path)
    outputs = manifest_after.setdefault("outputs", {})
    entry = {
        "path": str(stable_json),
        "jsonPath": str(stable_json),
        "markdownPath": str(stable_md),
        "htmlPath": str(stable_html),
        "openCommand": str(stable_open),
        "versionedPath": str(versioned_json),
        "versionedJsonPath": str(versioned_json),
        "versionedMarkdownPath": str(versioned_md),
        "versionedHtmlPath": str(versioned_html),
        "versionedOpenCommand": str(versioned_open),
        "generatedAt": generated_at,
        "schema": report["schema"],
        "status": report["status"],
        "readyWhenHumanApproved": report["readyWhenHumanApproved"],
        "missingInputCount": report["missingInputCount"],
        "missingArtifactCount": report["missingArtifactCount"],
        "plannedBranchCount": report["plannedBranchCount"],
        "asrFocusReviewRiskCount": report["asrFocusReviewRiskCount"],
        "sourceAwareBranchEditReady": report["sourceAwareBranchEditReady"],
        "sourceAwareBranchCount": report["sourceAwareBranchCount"],
        "sourceAwareBranchRoleIds": report["sourceAwareBranchRoleIds"],
        "sourceAwareTimingContractStatus": report["sourceAwareTimingContractStatus"],
        "sourceAwareTimingContractHardStopCount": report["sourceAwareTimingContractHardStopCount"],
        "sourceAwareStemReadyCount": report["sourceAwareStemReadyCount"],
        "sourceAwareMasteredSpineOnlyEditingAllowed": report["sourceAwareMasteredSpineOnlyEditingAllowed"],
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "branchRenderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
    }
    history = outputs.setdefault("audioPostApprovalBranchRunwayPackets", [])
    history.append(entry)
    outputs["latestAudioPostApprovalBranchRunwayPacket"] = entry
    outputs["latestAudioPostApprovalBranchRunwayPacketMarkdown"] = str(stable_md)
    outputs["latestAudioPostApprovalBranchRunwayPacketHtml"] = str(stable_html)
    outputs["latestAudioPostApprovalBranchRunwayPacketOpenCommand"] = str(stable_open)
    manifest_after["audioPostApprovalBranchRunwayPacketCount"] = len(history)
    manifest_after["audioPostApprovalBranchRunwayPacketLatestStatus"] = report["status"]
    manifest_after["audioPostApprovalBranchRunwayPacketReadyWhenHumanApproved"] = report["readyWhenHumanApproved"]
    manifest_after["audioPostApprovalBranchRunwayPacketMissingInputCount"] = report["missingInputCount"]
    manifest_after["audioPostApprovalBranchRunwayPacketMissingArtifactCount"] = report["missingArtifactCount"]
    manifest_after["audioPostApprovalBranchRunwayPacketPlannedBranchCount"] = report["plannedBranchCount"]
    manifest_after["audioPostApprovalBranchRunwayPacketAsrFocusReviewRiskCount"] = report["asrFocusReviewRiskCount"]
    manifest_after["audioPostApprovalBranchRunwayPacketSourceAwareBranchEditReady"] = report["sourceAwareBranchEditReady"]
    manifest_after["audioPostApprovalBranchRunwayPacketSourceAwareBranchCount"] = report["sourceAwareBranchCount"]
    manifest_after["audioPostApprovalBranchRunwayPacketSourceAwareBranchRoleIds"] = report["sourceAwareBranchRoleIds"]
    manifest_after["audioPostApprovalBranchRunwayPacketSourceAwareTimingContractStatus"] = report["sourceAwareTimingContractStatus"]
    manifest_after["audioPostApprovalBranchRunwayPacketSourceAwareTimingHardStopCount"] = report["sourceAwareTimingContractHardStopCount"]
    manifest_after["audioPostApprovalBranchRunwayPacketSourceAwareStemReadyCount"] = report["sourceAwareStemReadyCount"]
    manifest_after["audioPostApprovalBranchRunwayPacketSourceAwareMasteredSpineOnlyEditingAllowed"] = report["sourceAwareMasteredSpineOnlyEditingAllowed"]
    manifest_after["audioPostApprovalBranchRunwayPacketLatestGeneratedAt"] = generated_at
    manifest_after["audioPostApprovalBranchRunwayPacketLatestMarkdown"] = str(stable_md)
    manifest_after["audioPostApprovalBranchRunwayPacketApprovalStateChanged"] = False
    manifest_after["audioPostApprovalBranchRunwayPacketBranchStateChanged"] = False
    manifest_after["audioPostApprovalBranchRunwayPacketRenderAttempted"] = False
    manifest_after["audioPostApprovalBranchRunwayPacketBranchRenderAttempted"] = False
    manifest_after["audioPostApprovalBranchRunwayPacketUploadAttempted"] = False
    manifest_after["audioPostApprovalBranchRunwayPacketPublicationAttempted"] = False
    manifest_after["audioPostApprovalBranchRunwayPacketOriginalMediaMutated"] = False
    write_json(manifest_path, manifest_after)
    print(json.dumps(entry, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
