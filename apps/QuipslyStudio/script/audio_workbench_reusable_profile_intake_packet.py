#!/usr/bin/env python3
"""Create a next-episode intake packet from a reusable audio profile.

The reusable profile captures what worked for Episode 4. This intake packet is
its clean handoff shape for the next noisy/outdoor podcast or coaching session:
what sources to collect, what metadata must be explicit, which artifacts prove
each stage, and where human listening still gates production use.

It does not approve audio, fail audio, render media, upload files, or mutate
original media. It only writes review/planning artifacts and registers them in
the baseline manifest.
"""

from __future__ import annotations

import argparse
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


def output_path(value: Any) -> Path | None:
    if isinstance(value, str) and value:
        return Path(value)
    if isinstance(value, dict):
        for subkey in ("path", "markdownPath", "htmlPath", "jsonPath", "openCommand"):
            subvalue = value.get(subkey)
            if isinstance(subvalue, str) and subvalue:
                return Path(subvalue)
    return None


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def role_family(role: str | None, label: str | None) -> str:
    role_l = (role or "").lower()
    label_l = (label or "").lower()
    if "charlie" in role_l or "charlie" in label_l:
        return "primary-local-speaker"
    if "homer" in role_l or "scott" in role_l or "homer" in label_l or "scott" in label_l:
        return "remote-or-outdoor-speaker"
    if "reference" in role_l or "clip" in role_l:
        return "reference-or-playback-audio"
    return "supporting-or-unknown-source"


def source_rows(profile: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for source in profile.get("sourceRoleTemplate") or []:
        if not isinstance(source, dict):
            continue
        rows.append(
            {
                "sourceTemplateId": source.get("id"),
                "sourceTemplateLabel": source.get("label"),
                "sourceTemplateRole": source.get("role"),
                "futureRoleFamily": role_family(source.get("role"), source.get("label")),
                "nextEpisodePathPolicy": "replace with the next episode raw path; do not reuse Episode 4 paths",
                "requiredMetadata": [
                    "rawPath",
                    "mediaKind",
                    "speakerOrSourceName",
                    "recordedStartAt if known",
                    "sampleRate or frameRate when available",
                    "syncEvidence",
                    "sequenceStartSeconds after sync",
                    "durationSeconds",
                    "productionRole",
                    "qualityNotes",
                ],
            }
        )
    if rows:
        return rows
    return [
        {
            "sourceTemplateId": "primary-speaker-local",
            "sourceTemplateLabel": "Local speaker mic or camera audio",
            "sourceTemplateRole": "primary_audio",
            "futureRoleFamily": "primary-local-speaker",
            "nextEpisodePathPolicy": "point to the next episode source",
            "requiredMetadata": ["rawPath", "speakerOrSourceName", "sequenceStartSeconds", "durationSeconds"],
        },
        {
            "sourceTemplateId": "remote-speaker-noisy",
            "sourceTemplateLabel": "Remote/outdoor speaker mic",
            "sourceTemplateRole": "remote_audio",
            "futureRoleFamily": "remote-or-outdoor-speaker",
            "nextEpisodePathPolicy": "point to the next episode source",
            "requiredMetadata": ["rawPath", "speakerOrSourceName", "sequenceStartSeconds", "durationSeconds"],
        },
    ]


def stage_rows(profile: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for stage in profile.get("reusableStages") or []:
        if not isinstance(stage, dict):
            continue
        name = str(stage.get("name") or "unnamed-stage")
        rows.append(
            {
                "name": name,
                "purpose": stage.get("purpose"),
                "proofArtifact": stage.get("proofArtifact"),
                "requiresHumanGate": bool(stage.get("requiresHumanGate")),
                "futureEpisodeEvidenceNeeded": evidence_for_stage(name),
                "agentCheck": agent_check_for_stage(name),
            }
        )
    return rows


def evidence_for_stage(name: str) -> list[str]:
    n = name.lower()
    if "source" in n and "inventory" in n:
        return ["raw source manifest", "missing-media report", "evidence-only vs production source decision"]
    if "sync" in n:
        return ["sync offsets", "duration probes", "visible timeline alignment evidence", "known gaps or broken takes"]
    if "activity" in n:
        return ["speaker activity map", "likely speaking/laughing/reacting windows", "non-speaking gaps"]
    if "cleanup" in n or "balance" in n:
        return ["source-aware contribution stems", "A/B proof windows", "bleed/noise warning map"]
    if "variant" in n:
        return ["small proof-window variants", "profile comparison board", "listen notes"]
    if "handoff" in n or "final" in n:
        return ["normal stereo WAV", "M4A listen copy", "loudness/QC report", "human listen decision"]
    return ["stage manifest", "stage notes", "next safe action"]


def agent_check_for_stage(name: str) -> str:
    n = name.lower()
    if "source" in n and "inventory" in n:
        return "Agent can explain every source role and identify anything parked before rendering."
    if "sync" in n:
        return "Agent can prove sequence-time offsets and duration agreement before cleanup."
    if "activity" in n:
        return "Agent can show where each speaker is likely contributing or silent."
    if "cleanup" in n or "balance" in n:
        return "Agent can compare raw, treated, source-aware mix, and master for the same window."
    if "variant" in n:
        return "Agent can render only small proof windows before any full spine candidate."
    if "handoff" in n or "final" in n:
        return "Agent can provide a normal stereo handoff plus the evidence trail that created it."
    return "Agent can report current state, artifacts, warnings, and next safe action."


def parameter_rows(profile: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for speaker, item in (profile.get("speakerAutomationProfiles") or {}).items():
        if not isinstance(item, dict):
            continue
        rows.append(
            {
                "speaker": speaker,
                "purpose": item.get("purpose"),
                "gapAction": item.get("gapAction"),
                "editableParameters": item.get("editableParameters") or {},
                "filterPresent": bool(item.get("filter")),
                "futureEpisodeTuningNotes": [
                    "Start conservative enough to preserve natural cadence.",
                    "If bleed remains, adjust the contribution/ducking stage before final bus mastering.",
                    "If speech sounds chopped, relax gate/release and rerender proof windows only.",
                    "Do not treat this profile as production-default until a real episode listen passes.",
                ],
            }
        )
    return rows


def build_packet(manifest: dict[str, Any], profile: dict[str, Any], baseline_dir: Path, generated_at: str) -> dict[str, Any]:
    outputs = manifest.get("outputs") or {}
    current_truth = {
        "approvalStatus": manifest.get("approvalStatus"),
        "packageReadyForHumanListen": bool(manifest.get("packageReadyForHumanListen")),
        "branchInheritanceReady": bool(manifest.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest.get("branchRenderReady")),
        "originalMediaMutated": False,
    }
    return {
        "schema": "quipsly.audio-workbench.reusable-profile-intake-packet.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": manifest.get("baselineId"),
        "sourceProfilePath": str(output_path(outputs.get("latestReusableAudioProductionProfile")) or ""),
        "sourceProfileName": profile.get("profileName"),
        "purpose": "Prepare the next noisy/outdoor podcast or coaching recording for the same inspectable audio workbench without reusing Episode 4 media paths or skipping human listening.",
        "currentTruth": current_truth,
        "notProductionApproval": True,
        "futureEpisodeReadiness": "intake-ready-profile-not-production-default",
        "sourceMappingWorksheet": source_rows(profile),
        "requiredFutureEpisodeInputs": [
            {
                "group": "identity",
                "fields": ["episodeSlug", "episodeTitle", "targetOutputUses", "reviewers", "timezone"],
                "why": "Keeps review packets, exports, calendar/publishing work, and source folders from drifting apart.",
            },
            {
                "group": "raw source inventory",
                "fields": ["sourceId", "rawPath", "speakerOrSource", "productionRole", "mediaKind", "duration", "sampleRate", "channels", "notes"],
                "why": "The workbench cannot safely clean or mix what it cannot name and classify.",
            },
            {
                "group": "sync evidence",
                "fields": ["sequenceStartSeconds", "sourceStartSeconds", "syncMethod", "syncConfidence", "knownBreaks", "parkedSources"],
                "why": "Sync truth belongs below every edit branch, short, and publication packet.",
            },
            {
                "group": "speaker activity",
                "fields": ["speaker", "speakingWindows", "laughingOrReactionWindows", "nonSpeakingGaps", "uncertainWindows"],
                "why": "Bleed reduction should mute/duck only non-contributing material, not living conversation.",
            },
            {
                "group": "treatment proof",
                "fields": ["rawSnippet", "treatedStemSnippet", "sourceAwareMixSnippet", "masterSnippet", "listenDecision"],
                "why": "This keeps enhancement inspectable instead of turning audio cleanup into a black box.",
            },
        ],
        "stageChecklist": stage_rows(profile),
        "profileParameterWorksheet": parameter_rows(profile),
        "qualityTargets": profile.get("qualityTargets") or {},
        "riskFamiliesToCarryForward": profile.get("riskFamilies") or {},
        "reviewMinimums": {
            "focusWindowCountFromProfile": int(profile.get("focusWindowCount") or 0),
            "listenPriorityQueueCountFromProfile": int(profile.get("listenPriorityQueueCount") or 0),
            "minimumBeforeProductionDefault": [
                "source inventory complete",
                "sync offsets known or explicitly uncertain",
                "speaker activity map generated",
                "source-aware cleanup proof windows rendered",
                "loudness/QC report generated",
                "human listen pass recorded for that episode",
            ],
        },
        "nextEpisodeBootstrapCommands": [
            "Create or select a conformed baseline folder for the next episode.",
            "Run source inventory and sync probes before any cleanup render.",
            "Render proof-window variants before rendering a full mastered spine.",
            "Run the reusable profile smoke as a contract check, not as production approval.",
            "Open START_HERE for that episode and record real human listen notes before branch inheritance.",
        ],
        "agentAccessibilityContract": [
            "Every stage writes JSON and Markdown evidence.",
            "Every derived render records whether original media changed; it should remain false.",
            "Every human approval route has a dry-run rehearsal and a non-dry-run confirmation path.",
            "Every blocked or partial state names the next safe action instead of stalling silently.",
        ],
    }


def render_markdown(packet: dict[str, Any]) -> str:
    truth = packet["currentTruth"]
    lines = [
        "# Reusable Audio Profile Intake Packet",
        "",
        f"Generated: `{packet['generatedAt']}`",
        f"Baseline: `{packet['baselineId']}`",
        f"Profile: `{packet['sourceProfileName']}`",
        "",
        packet["purpose"],
        "",
        "## Current truth",
        "",
        f"- Approval status: `{truth['approvalStatus']}`",
        f"- Package ready for human listen: `{str(truth['packageReadyForHumanListen']).lower()}`",
        f"- Branch inheritance ready: `{str(truth['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(truth['branchRenderReady']).lower()}`",
        f"- Original media mutated: `{str(truth['originalMediaMutated']).lower()}`",
        f"- Future episode readiness: `{packet['futureEpisodeReadiness']}`",
        "",
        "This packet is not an approval stamp. It is the intake recipe for applying the Episode 4 audio-workbench pattern to another recording while keeping sync, cleanup, review, and mastering inspectable.",
        "",
        "## Source mapping worksheet",
        "",
        "| Template source | Future role | Required metadata | Policy |",
        "|---|---|---|---|",
    ]
    for row in packet["sourceMappingWorksheet"]:
        required = ", ".join(row.get("requiredMetadata") or [])
        lines.append(
            f"| {row.get('sourceTemplateLabel') or row.get('sourceTemplateId')} | `{row.get('futureRoleFamily')}` | {required} | {row.get('nextEpisodePathPolicy')} |"
        )
    lines.extend(["", "## Required future episode inputs", ""])
    for item in packet["requiredFutureEpisodeInputs"]:
        lines.append(f"### {item['group']}")
        lines.append("")
        lines.append(f"- Fields: `{', '.join(item['fields'])}`")
        lines.append(f"- Why: {item['why']}")
        lines.append("")
    lines.extend(["## Stage checklist", "", "| Stage | Evidence needed | Agent check | Human gate |", "|---|---|---|---|"])
    for stage in packet["stageChecklist"]:
        evidence = ", ".join(stage.get("futureEpisodeEvidenceNeeded") or [])
        lines.append(
            f"| {stage.get('name')} | {evidence} | {stage.get('agentCheck')} | `{str(stage.get('requiresHumanGate')).lower()}` |"
        )
    lines.extend(["", "## Speaker/source treatment parameters", ""])
    if packet["profileParameterWorksheet"]:
        for row in packet["profileParameterWorksheet"]:
            lines.extend(
                [
                    f"### {str(row['speaker']).title()}",
                    "",
                    f"- Purpose: {row.get('purpose')}",
                    f"- Gap action: {row.get('gapAction')}",
                    f"- Editable parameters: `{row.get('editableParameters')}`",
                    f"- Filter present: `{str(row.get('filterPresent')).lower()}`",
                    "- Tuning notes:",
                ]
            )
            for note in row.get("futureEpisodeTuningNotes") or []:
                lines.append(f"  - {note}")
            lines.append("")
    else:
        lines.append("No speaker/source treatment parameters were found in the reusable profile. Regenerate the profile before using it on another episode.")
        lines.append("")
    lines.extend(["## Quality targets", ""])
    for key, value in (packet.get("qualityTargets") or {}).items():
        lines.append(f"- {key}: `{value}`")
    lines.extend(["", "## Minimum before production default", ""])
    for item in packet["reviewMinimums"]["minimumBeforeProductionDefault"]:
        lines.append(f"- [ ] {item}")
    lines.extend(["", "## Agent accessibility contract", ""])
    for item in packet["agentAccessibilityContract"]:
        lines.append(f"- {item}")
    lines.extend(["", "## Next episode bootstrap", ""])
    for item in packet["nextEpisodeBootstrapCommands"]:
        lines.append(f"- {item}")
    lines.extend(
        [
            "",
            "## Plain-English meaning",
            "",
            "For the next episode, do not start by mastering a two-hour stereo file and hoping. Start by proving the source inventory, sync layer, speaker activity map, source-specific cleanup, proof windows, and only then a normal stereo handoff. The point is studio-quality sound with receipts, not a shiny mystery button.",
            "",
        ]
    )
    return "\n".join(lines)


def write_open_command(path: Path, markdown_path: Path, profile_path: Path | None) -> None:
    lines = ["#!/bin/zsh", "set -euo pipefail", f"open {shell_quote(str(markdown_path))}"]
    if profile_path:
        lines.append(f"open {shell_quote(str(profile_path))}")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    os.chmod(path, 0o755)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest_before = read_json(manifest_path)
    outputs = manifest_before.setdefault("outputs", {})
    profile_path = output_path(outputs.get("latestReusableAudioProductionProfile"))
    if not profile_path or not profile_path.exists():
        raise FileNotFoundError("Missing latestReusableAudioProductionProfile; export the reusable profile before creating an intake packet")
    profile = read_json(profile_path)

    approval_before = manifest_before.get("approvalStatus")
    branch_before = (manifest_before.get("branchInheritanceReady"), manifest_before.get("branchRenderReady"))
    baseline_id = str(manifest_before.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    output_dir = baseline_dir / f"audio-reusable-profile-intake-packet-{slug}-{generated_at}"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_json = output_dir / "reusable-profile-intake-packet.json"
    output_md = output_dir / "reusable-profile-intake-packet.md"
    open_command = output_dir / "open-reusable-profile-intake-packet.command"

    packet = build_packet(manifest_before, profile, baseline_dir, generated_at)
    packet["sourceMappingRowCount"] = len(packet.get("sourceMappingWorksheet") or [])
    packet["stageChecklistCount"] = len(packet.get("stageChecklist") or [])
    packet["requiredInputGroupCount"] = len(packet.get("requiredFutureEpisodeInputs") or [])
    write_json(output_json, packet)
    output_md.write_text(render_markdown(packet), encoding="utf-8")
    write_open_command(open_command, output_md, profile_path)

    manifest_after = read_json(manifest_path)
    outputs_after = manifest_after.setdefault("outputs", {})
    entry = {
        "path": str(output_json),
        "markdownPath": str(output_md),
        "openCommand": str(open_command),
        "generatedAt": generated_at,
        "schema": packet["schema"],
        "futureEpisodeReadiness": packet["futureEpisodeReadiness"],
        "sourceMappingRowCount": len(packet["sourceMappingWorksheet"]),
        "stageChecklistCount": len(packet["stageChecklist"]),
        "requiredInputGroupCount": len(packet["requiredFutureEpisodeInputs"]),
        "originalMediaMutated": False,
        "approvalStateChanged": approval_before != manifest_after.get("approvalStatus"),
        "branchStateChanged": branch_before != (manifest_after.get("branchInheritanceReady"), manifest_after.get("branchRenderReady")),
    }
    history = outputs_after.setdefault("reusableAudioProfileIntakePackets", [])
    history.append(entry)
    outputs_after["latestReusableAudioProfileIntakePacket"] = entry
    outputs_after["latestReusableAudioProfileIntakePacketMarkdown"] = str(output_md)
    outputs_after["latestReusableAudioProfileIntakePacketOpenCommand"] = str(open_command)
    manifest_after["reusableAudioProfileIntakePacketCount"] = len(history)
    manifest_after["reusableAudioProfileIntakePacketSourceMappingRowCount"] = len(packet["sourceMappingWorksheet"])
    manifest_after["reusableAudioProfileIntakePacketStageChecklistCount"] = len(packet["stageChecklist"])
    manifest_after["reusableAudioProfileIntakePacketRequiredInputGroupCount"] = len(packet["requiredFutureEpisodeInputs"])
    manifest_after["reusableAudioProfileIntakePacketOriginalMediaMutated"] = False
    manifest_after["reusableAudioProfileIntakePacketApprovalStateChanged"] = entry["approvalStateChanged"]
    manifest_after["reusableAudioProfileIntakePacketBranchStateChanged"] = entry["branchStateChanged"]
    write_json(manifest_path, manifest_after)

    print(json.dumps(entry, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
