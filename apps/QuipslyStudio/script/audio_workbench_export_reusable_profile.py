#!/usr/bin/env python3
"""Export a reusable Quipsly audio production profile from a proven baseline.

This turns the Episode 4 v006 machine-candidate workbench into a reusable
profile for future noisy/outdoor podcast recordings. It is not an approval
tool: it does not approve audio, fail audio, render branches, upload files, or
mutate original media.
"""

from __future__ import annotations

import argparse
import json
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


def output_path(outputs: dict[str, Any], key: str) -> Path | None:
    value = outputs.get(key)
    if isinstance(value, str) and value:
        return Path(value)
    if isinstance(value, dict):
        for subkey in ("path", "markdownPath", "htmlPath", "jsonPath"):
            subvalue = value.get(subkey)
            if isinstance(subvalue, str) and subvalue:
                return Path(subvalue)
    return None


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in value)
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-profile"


def load_optional_json(path: Path | None) -> dict[str, Any]:
    if not path or not path.exists() or path.suffix.lower() != ".json":
        return {}
    try:
        return read_json(path)
    except json.JSONDecodeError:
        return {}


def compact_source(source: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": source.get("id"),
        "label": source.get("label"),
        "role": source.get("role"),
        "seqStart": source.get("seq_start"),
        "volume": source.get("volume"),
        "pathPolicy": "future profiles should replace this source path with the next episode source; do not treat Episode 4 media paths as reusable inputs",
    }


def compact_profile(profile: dict[str, Any]) -> dict[str, Any]:
    return {
        "purpose": profile.get("purpose"),
        "gapAction": profile.get("gapAction"),
        "editableParameters": profile.get("editableParameters") or {},
        "filter": profile.get("filter"),
    }


def render_markdown(profile: dict[str, Any]) -> str:
    lines = [
        "# Reusable Audio Production Profile",
        "",
        f"Generated: `{profile['generatedAt']}`",
        f"Source baseline: `{profile['sourceBaselineId']}`",
        f"Profile name: `{profile['profileName']}`",
        "",
        "This profile captures the Episode 4 audio-workbench pattern as a reusable starting point for future noisy or outdoor podcast recordings. It is a recipe and evidence map, not an approval stamp.",
        "",
        "## Current truth",
        "",
        f"- Approval status: `{profile['approvalStatus']}`",
        f"- Reuse readiness: `{profile['reuseReadiness']}`",
        f"- Package ready for human listen: `{str(profile['packageReadyForHumanListen']).lower()}`",
        f"- Branch inheritance ready: `{str(profile['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(profile['branchRenderReady']).lower()}`",
        f"- Original media mutated: `{str(profile['originalMediaMutated']).lower()}`",
        "",
        "## What this profile is good for",
        "",
    ]
    for item in profile["recommendedUseCases"]:
        lines.append(f"- {item}")
    lines.extend(
        [
            "",
            "## Non-negotiable contracts",
            "",
        ]
    )
    for item in profile["nonNegotiableContracts"]:
        lines.append(f"- {item}")
    lines.extend(
        [
            "",
            "## Reusable stages",
            "",
            "| Stage | Purpose | Proof artifact | Human gate |",
            "|---|---|---|---|",
        ]
    )
    for stage in profile["reusableStages"]:
        lines.append(
            f"| {stage['name']} | {stage['purpose']} | `{stage.get('proofArtifact') or 'none'}` | `{str(stage['requiresHumanGate']).lower()}` |"
        )
    lines.extend(
        [
            "",
            "## Speaker-aware automation profile",
            "",
        ]
    )
    for speaker, item in profile.get("speakerAutomationProfiles", {}).items():
        lines.extend(
            [
                f"### {speaker.title()}",
                "",
                f"- Purpose: {item.get('purpose')}",
                f"- Gap action: {item.get('gapAction')}",
                f"- Editable parameters: `{item.get('editableParameters') or {}}`",
                "",
            ]
        )
    lines.extend(
        [
            "## Quality targets",
            "",
        ]
    )
    for key, value in profile["qualityTargets"].items():
        lines.append(f"- {key}: `{value}`")
    lines.extend(
        [
            "",
            "## Known risk families to preserve in future audits",
            "",
        ]
    )
    for key, value in profile["riskFamilies"].items():
        lines.append(f"- {key}: `{value}`")
    lines.extend(
        [
            "",
            "## Future episode bootstrap checklist",
            "",
        ]
    )
    for step in profile["futureEpisodeChecklist"]:
        lines.append(f"- [ ] {step}")
    lines.extend(
        [
            "",
            "## Why this is not a black box",
            "",
            "The reusable profile points future episodes through source inventory, aligned stems, speaker-activity detection, source-balance warnings, proof snippets, human listen notes, guarded repair planning, and only then branch inheritance. The final handoff can stay a normal stereo WAV/M4A, but the workbench retains the evidence needed to understand and repair it.",
            "",
        ]
    )
    return "\n".join(lines)


def build_profile(manifest: dict[str, Any], outputs: dict[str, Any], baseline_dir: Path, generated_at: str) -> dict[str, Any]:
    automation = load_optional_json(output_path(outputs, "speakerGapAutomation"))
    source_activity = load_optional_json(output_path(outputs, "sourceActivity"))
    speaker_board = load_optional_json(output_path(outputs, "latestAudioSpeakerActivityReviewBoard"))
    goal_audit = load_optional_json(output_path(outputs, "latestAudioGoalCompletionAudit"))

    quality = manifest.get("qualitySummary") if isinstance(manifest.get("qualitySummary"), dict) else {}
    critical_cleanup = manifest.get("criticalCleanup") if isinstance(manifest.get("criticalCleanup"), dict) else {}
    source_inclusion = manifest.get("sourceInclusion") if isinstance(manifest.get("sourceInclusion"), dict) else {}

    return {
        "schema": "quipsly.audio-workbench.reusable-production-profile.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "sourceBaselineId": manifest.get("baselineId"),
        "parentBaselineId": manifest.get("parentBaselineId"),
        "profileName": manifest.get("candidateProfile") or "episode-audio-production-profile",
        "approvalStatus": manifest.get("approvalStatus"),
        "packageReadyForHumanListen": bool(manifest.get("packageReadyForHumanListen")),
        "branchInheritanceReady": bool(manifest.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest.get("branchRenderReady")),
        "originalMediaMutated": False,
        "reuseReadiness": "machine-template-ready-human-listen-required-before-production-default",
        "recommendedUseCases": [
            "two-person podcast recordings with one clean local mic and one noisy/outdoor remote mic",
            "episodes with phone-call echo or speaker bleed inside non-speaking gaps",
            "recordings where a normal stereo handoff is needed but stem-level diagnostics must remain inspectable",
            "future Homer park/outdoor recordings where background voices, handling noise, and environmental sound need smooth source-aware reduction",
        ],
        "nonNegotiableContracts": [
            "keep raw media read-only",
            "preserve episode sequence duration until an explicit sync/conform version is created",
            "perform destructive restoration only on duplicated derived stems",
            "write source-activity, automation, proof snippets, and reviewer notes before branch inheritance",
            "do not let machine evidence approve the master; human listen proof remains the gate",
        ],
        "sourceRoleTemplate": [compact_source(source) for source in manifest.get("rawSources") or []],
        "sourceInclusionTemplate": {
            "production": source_inclusion.get("production") or [],
            "excludedOrEvidenceOnly": source_inclusion.get("excludedOrEvidenceOnly") or [],
        },
        "speakerAutomationProfiles": {
            key: compact_profile(value)
            for key, value in (automation.get("profiles") or {}).items()
            if isinstance(value, dict)
        },
        "automationSummary": automation.get("automationSummary") or {},
        "activitySummary": source_activity.get("classificationSummary") or {},
        "retentionSummary": source_activity.get("retentionSummary") or {},
        "qualityTargets": {
            "integratedLufs": quality.get("integratedLufs", -16.0),
            "truePeakDbfs": quality.get("truePeakDbfs", -1.8),
            "durationDeltaToleranceSeconds": "prefer <= 0.1s against expected timeline duration",
            "channels": "stereo handoff, diagnostic stems optional",
            "handoffFormats": "WAV master plus M4A listening/delivery copy",
        },
        "criticalCleanupRequirements": {
            "charlie": critical_cleanup.get("charlieRequirement"),
            "homer": critical_cleanup.get("homerRequirement"),
            "method": critical_cleanup.get("method"),
            "naturalnessProtection": critical_cleanup.get("naturalnessProtection"),
        },
        "riskFamilies": manifest.get("speakerBleedGapProofFlagCounts") or {},
        "focusWindowCount": int(speaker_board.get("focusWindowCount") or manifest.get("audioSpeakerActivityReviewBoardFocusWindowCount") or 0),
        "listenPriorityQueueCount": int(speaker_board.get("listenPriorityQueueCount") or manifest.get("audioSpeakerActivityReviewBoardQueueItemCount") or 0),
        "goalAuditStatusCounts": goal_audit.get("statusCounts") or {},
        "reusableStages": [
            {
                "name": "source inventory",
                "purpose": "identify production sources, evidence-only sources, scratch audio, and reference clips before rendering",
                "proofArtifact": "manifest.rawSources",
                "requiresHumanGate": False,
            },
            {
                "name": "sync layer",
                "purpose": "align every production source to one episode sequence time without changing source files",
                "proofArtifact": "manifest.syncLayer",
                "requiresHumanGate": False,
            },
            {
                "name": "speaker activity detection",
                "purpose": "classify speaking, laughing, reacting, noise, bleed, and dead-air windows",
                "proofArtifact": "sourceActivity + speakerGapAutomation",
                "requiresHumanGate": False,
            },
            {
                "name": "source-aware cleanup",
                "purpose": "duck or mute non-contributing gaps with smooth fades while preserving useful human reactions",
                "proofArtifact": "speaker activity review board",
                "requiresHumanGate": True,
            },
            {
                "name": "source-balance audit",
                "purpose": "prove Homer/Charlie contribution survives into the master and surface phantom-energy or threshold-mismatch windows",
                "proofArtifact": "master/source balance audit and listen companion",
                "requiresHumanGate": True,
            },
            {
                "name": "profile variant loop",
                "purpose": "render small conservative/standard/aggressive proof windows before full candidate promotion",
                "proofArtifact": "profile variant QC and proof comparison snippets",
                "requiresHumanGate": True,
            },
            {
                "name": "final stereo handoff",
                "purpose": "deliver a normal polished WAV/M4A while retaining diagnostics as control surfaces",
                "proofArtifact": "quality report, handoff packet, human listen notes",
                "requiresHumanGate": True,
            },
        ],
        "futureEpisodeChecklist": [
            "Create a new episode baseline folder and manifest before any heavy render.",
            "Register all raw sources with role, label, path, sync start, and intended volume.",
            "Build aligned derived stems and preserve exact episode sequence length.",
            "Render source activity, speaker-gap automation, and source contribution reports.",
            "Render short proof windows before promoting a full candidate.",
            "Generate the listen-priority queue, speaker activity board, and source-balance companion.",
            "Run human listen notes through the guarded inbox before branch inheritance.",
            "Only render long-form/shorts branches from an approved conformed baseline.",
        ],
        "linkedEvidence": {
            "sourceActivity": str(output_path(outputs, "sourceActivity") or ""),
            "speakerGapAutomation": str(output_path(outputs, "speakerGapAutomation") or ""),
            "speakerActivityReviewBoard": str(output_path(outputs, "latestAudioSpeakerActivityReviewBoardMarkdown") or ""),
            "sourceBalanceListenCompanion": str(output_path(outputs, "latestAudioSourceBalanceListenCompanionMarkdown") or ""),
            "humanListenControlRoom": str(output_path(outputs, "latestAudioHumanListenControlRoomHtml") or ""),
            "goalCompletionAudit": str(output_path(outputs, "latestAudioGoalCompletionAuditMarkdown") or ""),
        },
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest_before = read_json(manifest_path)
    outputs = manifest_before.setdefault("outputs", {})
    baseline_id = str(manifest_before.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")

    profile = build_profile(manifest_before, outputs, baseline_dir, generated_at)
    output_json = baseline_dir / f"audio-reusable-production-profile-{slug}-{generated_at}.json"
    output_md = baseline_dir / f"audio-reusable-production-profile-{slug}-{generated_at}.md"
    stable_md = baseline_dir / "REUSABLE_AUDIO_PRODUCTION_PROFILE.md"
    profile["json"] = str(output_json)
    profile["markdown"] = str(output_md)
    profile["stableMarkdown"] = str(stable_md)

    write_json(output_json, profile)
    rendered_markdown = render_markdown(profile) + "\n"
    output_md.write_text(rendered_markdown, encoding="utf-8")
    stable_md.write_text(rendered_markdown, encoding="utf-8")

    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    outputs["latestReusableAudioProductionProfile"] = str(output_json)
    outputs["latestReusableAudioProductionProfileMarkdown"] = str(output_md)
    outputs["stableReusableAudioProductionProfileMarkdown"] = str(stable_md)
    history = outputs.setdefault("reusableAudioProductionProfiles", [])
    if str(output_json) not in history:
        history.append(str(output_json))
    manifest["reusableAudioProductionProfileCount"] = len(history)
    manifest["reusableAudioProductionProfileFocusWindowCount"] = profile["focusWindowCount"]
    manifest["reusableAudioProductionProfileQueueItemCount"] = profile["listenPriorityQueueCount"]
    manifest["reusableAudioProductionProfileOriginalMediaMutated"] = False
    manifest["approvalStatus"] = manifest_before.get("approvalStatus")
    manifest["branchInheritanceReady"] = bool(manifest_before.get("branchInheritanceReady"))
    manifest["branchRenderReady"] = bool(manifest_before.get("branchRenderReady"))
    write_json(manifest_path, manifest)

    print(
        json.dumps(
            {
                "baselineId": baseline_id,
                "profile": str(output_json),
                "markdown": str(output_md),
                "stableMarkdown": str(stable_md),
                "focusWindowCount": profile["focusWindowCount"],
                "listenPriorityQueueCount": profile["listenPriorityQueueCount"],
                "approvalStateChanged": False,
                "branchStateChanged": False,
                "renderAttempted": False,
                "originalMediaMutated": False,
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
