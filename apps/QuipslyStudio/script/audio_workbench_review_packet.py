#!/usr/bin/env python3
"""Create an inspectable audio listen-review packet for a Quipsly baseline.

This is intentionally non-mutating. It reads an existing conformed production
baseline manifest and writes a human/Codex review packet beside it. The goal is
to keep audio improvement stage-driven instead of turning the chain into a
black box.
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def resolve_baseline_dir(input_path: Path) -> Path:
    """Accept either a baseline dir or a run dir that contains the baseline."""
    if (input_path / "manifest.json").exists():
        return input_path
    nested = input_path / "work" / "conformed-production-baseline"
    if (nested / "manifest.json").exists():
        return nested
    raise FileNotFoundError(
        "Could not find a conformed production baseline manifest at "
        f"{input_path}/manifest.json or {nested}/manifest.json"
    )


def artifact_exists(path_text: str | None) -> bool:
    return bool(path_text) and Path(path_text).exists()


def existing_path(path_text: str | None) -> str | None:
    if artifact_exists(path_text):
        return str(Path(path_text))
    return None


def output_name(baseline_id: str, extension: str) -> str:
    safe = baseline_id.replace("episode-4-conformed-production-baseline-", "")
    return f"audio-listen-review-packet-{safe}.{extension}"


def build_review_packet(baseline_dir: Path) -> dict[str, Any]:
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    outputs = manifest.get("outputs", {})
    quality = manifest.get("qualitySummary", {})

    source_report_path = outputs.get("sourceContributionReport")
    source_report = read_json(Path(source_report_path)) if artifact_exists(source_report_path) else {}

    stage_board_path = outputs.get("audioSpineStageBoard")
    stage_board = read_json(Path(stage_board_path)) if artifact_exists(stage_board_path) else {}

    listen_bundle_path = outputs.get("listenProofBundle")
    listen_bundle_manifest_path = outputs.get("listenProofBundleManifest")
    listen_bundle = read_json(Path(listen_bundle_manifest_path)) if artifact_exists(listen_bundle_manifest_path) else {}
    listen_bundle_dir = Path(listen_bundle_path) if artifact_exists(listen_bundle_path) else None
    listen_bundle_items = listen_bundle.get("items", [])

    source_activity_path = outputs.get("sourceActivity")
    source_activity = read_json(Path(source_activity_path)) if artifact_exists(source_activity_path) else {}
    source_activity_summary = {
        "classificationSummary": source_activity.get("classificationSummary"),
        "retentionSummary": source_activity.get("retentionSummary"),
        "reviewWindowCount": len(source_activity.get("reviewWindows", [])),
    } if source_activity else {}

    proof_snippets = outputs.get("proofSnippets", [])
    review_windows = []
    for snippet in proof_snippets:
        review_windows.append(
            {
                "label": snippet.get("label"),
                "sequenceStartSeconds": snippet.get("sequenceStartSeconds"),
                "durationSeconds": snippet.get("durationSeconds"),
                "listenOrder": [
                    {
                        "name": "raw aligned",
                        "path": snippet.get("rawAligned"),
                        "purpose": "Hear what the synced sources sounded like before cleanup.",
                    },
                    {
                        "name": "source-aware mix",
                        "path": snippet.get("sourceAwareContributionMix"),
                        "purpose": "Confirm Charlie, Homer, and reference routing before final mastering.",
                    },
                    {
                        "name": "mastered spine",
                        "path": snippet.get("conformedMasterSpine"),
                        "purpose": "Judge the actual normal stereo handoff sound.",
                    },
                    {
                        "name": "diagnostic speaker split",
                        "path": snippet.get("speakerSplitCharlieLeftHomerRight"),
                        "purpose": "Diagnostic only: Charlie left, Homer right, to prove neither source vanished.",
                    },
                ],
            }
        )

    stage_failures = [
        {
            "symptom": "Homer sounds missing or too quiet.",
            "firstCheck": "Open source-contribution report and compare Homer aligned vs Homer contribution in the same proof window.",
            "likelyStage": "speaker-activity-layer or source-aware-mix",
            "safeAdjustment": "Relax Homer gate/release or Homer mix gain on derived stems only. Do not compensate by changing edit branches.",
        },
        {
            "symptom": "Charlie track still carries distracting Homer echo.",
            "firstCheck": "Compare raw aligned vs source-aware mix. If raw is worse and source-aware is better but not enough, tune Charlie-under-Homer ducking.",
            "likelyStage": "speaker-activity-layer",
            "safeAdjustment": "Adjust Charlie sidechain threshold/ratio/release on the contribution stem. Preserve overlap and laughter.",
        },
        {
            "symptom": "Speech sounds chopped, gated, or emotionally dead.",
            "firstCheck": "Compare mastered spine against source-aware mix and diagnostic speaker split.",
            "likelyStage": "speaker-activity-layer",
            "safeAdjustment": "Lower gate thresholds, lengthen release, or add room-tone floor before touching sync.",
        },
        {
            "symptom": "The master is loud but tiring, harsh, or too dense.",
            "firstCheck": "Compare source-aware mix to mastered spine. If source-aware is natural, the issue is bus/mastering.",
            "likelyStage": "conformed-dialogue-bed or mastered-spine",
            "safeAdjustment": "Back off compression, limiter, EQ, or loudnorm profile. Do not re-sync media.",
        },
        {
            "symptom": "Timing or lipsync feels wrong.",
            "firstCheck": "Use the sync layer manifest and the Premiere reference before changing audio treatment.",
            "likelyStage": "sync-layer",
            "safeAdjustment": "Create a new sync baseline version. Do not trim or stretch the mastered handoff file directly.",
        },
    ]

    return {
        "schema": "quipsly.audio-workbench.listen-review-packet.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "baselineDir": str(baseline_dir),
        "baselineId": manifest.get("baselineId"),
        "episode": manifest.get("episode"),
        "approvalStatus": manifest.get("approvalStatus"),
        "premiereHandoff": outputs.get("masterWav", {}).get("path"),
        "compressedListeningCopy": outputs.get("masterM4a", {}).get("path"),
        "listenProof": {
            "bundle": str(listen_bundle_dir) if listen_bundle_dir else listen_bundle_path,
            "manifest": listen_bundle_manifest_path,
            "html": str(listen_bundle_dir / "listen-proof.html") if listen_bundle_dir else None,
            "playlist": str(listen_bundle_dir / "listen-proof.m3u") if listen_bundle_dir else None,
            "readme": str(listen_bundle_dir / "README.md") if listen_bundle_dir else None,
            "itemCount": len(listen_bundle_items),
            "brokenItemCount": sum(
                1
                for item in listen_bundle_items
                if item.get("bundlePath") and not Path(item["bundlePath"]).exists()
            ),
        },
        "handoffRule": (
            "Use the normal stereo mastered WAV for Premiere and Quipsly edits. "
            "Speaker-split proof files are diagnostics only."
        ),
        "qualitySummary": quality,
        "qualityGate": {
            "machineValid": not quality.get("warnings") and quality.get("durationMatchesExpected") is True,
            "humanListenRequired": True,
            "publicationApproved": manifest.get("approvalStatus") == "human-approved-for-publication",
        },
        "reviewWindows": review_windows,
        "sourceContributionReport": source_report_path,
        "sourceContributionMarkdown": outputs.get("sourceContributionMarkdown"),
        "sourceActivity": source_activity_path,
        "sourceActivityMarkdown": outputs.get("sourceActivityMarkdown"),
        "sourceActivityCsv": outputs.get("sourceActivityCsv"),
        "sourceActivitySummary": source_activity_summary,
        "proofWindowComparison": outputs.get("proofWindowComparison"),
        "proofWindowComparisonMarkdown": outputs.get("proofWindowComparisonMarkdown"),
        "proofWindowListenWorkorder": outputs.get("proofWindowListenWorkorder"),
        "proofWindowListenWorkorderMarkdown": outputs.get("proofWindowListenWorkorderMarkdown"),
        "audioReviewCockpit": outputs.get("audioReviewCockpit"),
        "audioReviewCockpitHtml": outputs.get("audioReviewCockpitHtml"),
        "qualityReport": outputs.get("qualityReport"),
        "qualityReportMarkdown": outputs.get("qualityReportMarkdown"),
        "stageBoard": stage_board_path,
        "stageBoardMarkdown": outputs.get("audioSpineStageBoardMarkdown"),
        "stageCount": len(stage_board.get("stages", [])),
        "stageFailurePlaybook": stage_failures,
        "agentInstructions": [
            "Never treat the speaker-split diagnostic as the handoff file.",
            "When a listen check fails, identify the failing stage before changing filters.",
            "Regenerate a new baseline version instead of overwriting the existing baseline.",
            "Preserve source timing unless the sync layer is explicitly rebuilt.",
            "Prefer a targeted rerender of the affected stage over rerunning the whole chain blindly.",
        ],
        "reviewerChecklist": [
            "Open the audio review cockpit first if it exists; it collects handoff audio, warning workorders, and decision commands.",
            "Open the proof-window listen workorder first if it exists; it turns numerical warnings into exact listen questions.",
            "Open the listen-proof HTML page or playlist first so the comparison order stays consistent.",
            "Open the normal stereo mastered WAV in Premiere or Quipsly when judging full-episode usefulness.",
            "Listen to each proof window in order: raw aligned, source-aware mix, mastered spine, speaker split diagnostic.",
            "Confirm Homer is audible in Homer-heavy windows.",
            "Confirm Charlie downspaces do not carry distracting Homer echo.",
            "Confirm laughter/reactions are not chopped.",
            "Confirm loudness is comfortable on headphones and laptop speakers.",
            "If any check fails, mark the exact time and symptom before requesting a new v007 or timestamped candidate.",
        ],
    }


def write_markdown(packet: dict[str, Any], path: Path) -> None:
    quality = packet.get("qualitySummary", {})
    lines = [
        "# Audio Workbench listen-review packet",
        "",
        f"- Baseline: `{packet.get('baselineId')}`",
        f"- Status: `{packet.get('approvalStatus')}`",
        f"- Premiere/Quipsly handoff: `{packet.get('premiereHandoff')}`",
        f"- Listening copy: `{packet.get('compressedListeningCopy')}`",
        "- Handoff rule: use the normal stereo mastered WAV. Speaker-split files are diagnostics only.",
        "",
        "## Fastest reviewer path",
        "",
        f"- Listen-proof HTML: `{packet.get('listenProof', {}).get('html')}`",
        f"- Listen-proof playlist: `{packet.get('listenProof', {}).get('playlist')}`",
        f"- Listen-proof bundle: `{packet.get('listenProof', {}).get('bundle')}`",
        f"- Bundle item count: `{packet.get('listenProof', {}).get('itemCount')}`",
        f"- Broken bundle items: `{packet.get('listenProof', {}).get('brokenItemCount')}`",
        "",
        "## Machine gate",
        "",
        f"- Duration matches expected: `{quality.get('durationMatchesExpected')}`",
        f"- Duration delta: `{quality.get('durationDeltaSeconds')}` seconds",
        f"- Mean volume: `{quality.get('meanVolumeDb')}` dB",
        f"- Max volume: `{quality.get('maxVolumeDb')}` dB",
        f"- Source contribution warnings: `{quality.get('sourceContributionWarningCount')}`",
        f"- Warnings: `{'; '.join(quality.get('warnings', [])) or 'none'}`",
        "",
        "## Evidence reports",
        "",
        f"- Quality report: `{packet.get('qualityReportMarkdown')}`",
        f"- Audio review cockpit: `{packet.get('audioReviewCockpitHtml')}`",
        f"- Proof-window comparison: `{packet.get('proofWindowComparisonMarkdown')}`",
        f"- Proof-window listen workorder: `{packet.get('proofWindowListenWorkorderMarkdown')}`",
        f"- Source activity report: `{packet.get('sourceActivityMarkdown')}`",
        f"- Source activity CSV: `{packet.get('sourceActivityCsv')}`",
        f"- Source contribution report: `{packet.get('sourceContributionMarkdown')}`",
        f"- Stage board: `{packet.get('stageBoardMarkdown')}`",
        "",
        "## Listen windows",
        "",
    ]
    for window in packet.get("reviewWindows", []):
        lines.extend(
            [
                f"### {window.get('label')} @ {window.get('sequenceStartSeconds')}s",
                "",
                f"- Duration: `{window.get('durationSeconds')}` seconds",
            ]
        )
        for item in window.get("listenOrder", []):
            lines.append(f"- {item.get('name')}: `{item.get('path')}`")
            lines.append(f"  - Purpose: {item.get('purpose')}")
        lines.append("")

    lines.extend(
        [
            "## If it sounds wrong",
            "",
            "| Symptom | First check | Likely stage | Safe adjustment |",
            "|---|---|---|---|",
        ]
    )
    for failure in packet.get("stageFailurePlaybook", []):
        lines.append(
            "| "
            + " | ".join(
                [
                    failure["symptom"],
                    failure["firstCheck"],
                    failure["likelyStage"],
                    failure["safeAdjustment"],
                ]
            )
            + " |"
        )

    lines.extend(
        [
            "",
            "## Reviewer checklist",
            "",
            *[f"- [ ] {item}" for item in packet.get("reviewerChecklist", [])],
            "",
            "## Agent instructions",
            "",
            *[f"- {item}" for item in packet.get("agentInstructions", [])],
            "",
        ]
    )
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    packet = build_review_packet(baseline_dir)
    baseline_id = packet.get("baselineId") or "unknown"
    json_path = baseline_dir / output_name(baseline_id, "json")
    md_path = baseline_dir / output_name(baseline_id, "md")

    json_path.write_text(json.dumps(packet, indent=2, sort_keys=True), encoding="utf-8")
    write_markdown(packet, md_path)
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    manifest_outputs = manifest.setdefault("outputs", {})
    manifest_outputs["listenReviewPacket"] = str(json_path)
    manifest_outputs["listenReviewPacketMarkdown"] = str(md_path)
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True), encoding="utf-8")

    print(json.dumps({"json": str(json_path), "markdown": str(md_path)}, indent=2))


if __name__ == "__main__":
    main()
