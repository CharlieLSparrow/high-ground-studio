#!/usr/bin/env python3
"""Create a focused listen workorder from proof-window comparison warnings.

This converts numerical proof-window warnings into reviewable listening tasks.
It is not an approval command. It tells a reviewer where to listen, what to
decide, and what the next reversible repair should be if the candidate fails.
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.write_text(json.dumps(value, indent=2, sort_keys=True), encoding="utf-8")


def resolve_baseline_dir(input_path: Path) -> Path:
    if (input_path / "manifest.json").exists():
        return input_path
    nested = input_path / "work" / "conformed-production-baseline"
    if (nested / "manifest.json").exists():
        return nested
    raise FileNotFoundError(
        "Could not find a conformed production baseline manifest at "
        f"{input_path}/manifest.json or {nested}/manifest.json"
    )


def output_suffix(baseline_id: str) -> str:
    marker = "episode-4-conformed-production-baseline-"
    return baseline_id.replace(marker, "") if baseline_id.startswith(marker) else baseline_id


def warning_plan(warning: str, summary: dict[str, Any]) -> dict[str, Any]:
    lowered = warning.lower()
    if "master level changed sharply" in lowered:
        return {
            "likelyStage": "mastered-spine",
            "listenFor": [
                "Does the mastered spine sound polished and natural, or pumped/harsh/fatiguing?",
                "Did mastering bury quieter reactions, breaths, or room tone that should remain human?",
                "Does the source-aware mix sound more natural than the master in this exact window?",
            ],
            "passCondition": (
                "Master sounds clearly better for normal podcast listening without pumping, harshness, "
                "or lost reaction detail."
            ),
            "failCondition": (
                "Master sounds louder but less human, squashed, spitty, tiring, or obviously less useful "
                "than the source-aware mix."
            ),
            "safeNextAction": (
                "Render a v007/timestamped candidate from the same source-aware mix with gentler compression, "
                "limiting, and loudness normalization. Do not re-sync or change edit branches."
            ),
            "diagnosticFields": {
                "masteredVsSourceAwareMeanDeltaDb": summary.get("masteredVsSourceAwareMeanDeltaDb"),
            },
        }
    if "speaker split diagnostic is heavily one-sided" in lowered:
        return {
            "likelyStage": "speaker-activity-or-source-split-diagnostic",
            "listenFor": [
                "Is the quieter speaker expected to be quiet at this moment?",
                "Did Homer or Charlie disappear from the source-aware mix or mastered spine?",
                "Is laughter, reaction, overlap, or useful presence being chopped by a gate?",
            ],
            "passCondition": (
                "The active speaker is dominant for a good reason and the quieter speaker has not disappeared "
                "when they should be present."
            ),
            "failCondition": (
                "One person is missing, clipped, over-ducked, or emotionally flattened during a real contribution."
            ),
            "safeNextAction": (
                "Inspect source activity for this window, relax the affected gate/duck threshold or release, "
                "then render a v007/timestamped candidate. Preserve timeline duration."
            ),
            "diagnosticFields": {
                "speakerSplitLeftRightMeanDeltaDb": summary.get("speakerSplitLeftRightMeanDeltaDb"),
            },
        }
    if "source-aware mix is much quieter" in lowered:
        return {
            "likelyStage": "source-aware-mix",
            "listenFor": [
                "Did the source-aware mix remove a speaker while trying to remove noise?",
                "Does the raw aligned proof reveal speech that the source-aware mix lost?",
            ],
            "passCondition": "The quieter source-aware mix removed junk without losing useful speech or reactions.",
            "failCondition": "Speech, laughter, or reaction energy present in raw evidence is missing from source-aware mix.",
            "safeNextAction": (
                "Back off source suppression for this speaker/source and rerender a v007/timestamped candidate."
            ),
            "diagnosticFields": {
                "sourceAwareVsRawMeanDeltaDb": summary.get("sourceAwareVsRawMeanDeltaDb"),
            },
        }
    if "source-aware mix is much louder" in lowered:
        return {
            "likelyStage": "source-aware-mix",
            "listenFor": [
                "Did cleanup amplify room noise, bleed, or background voices?",
                "Does the source-aware proof sound less calm than raw aligned evidence?",
            ],
            "passCondition": "The level increase helps speech clarity without exposing new noise.",
            "failCondition": "Noise, bleed, or artifacts were amplified into the production bed.",
            "safeNextAction": (
                "Reduce source-aware gain or denoise aggressiveness and rerender a v007/timestamped candidate."
            ),
            "diagnosticFields": {
                "sourceAwareVsRawMeanDeltaDb": summary.get("sourceAwareVsRawMeanDeltaDb"),
            },
        }
    if "true peak is hot" in lowered:
        return {
            "likelyStage": "mastered-spine",
            "listenFor": [
                "Any clipping, crunch, or harsh consonants during peaks?",
                "Does playback remain comfortable on headphones and laptop speakers?",
            ],
            "passCondition": "No audible clipping or harshness despite the numerical hot peak.",
            "failCondition": "Any clipping, crunch, or unpleasant peak behavior.",
            "safeNextAction": "Lower limiter ceiling and rerender a v007/timestamped candidate.",
            "diagnosticFields": {},
        }
    return {
        "likelyStage": "unknown-listen-triage",
        "listenFor": [
            "Compare raw aligned, source-aware mix, mastered spine, and speaker split in this order.",
            "Identify whether the issue belongs to sync, source cleanup, mix, or mastering before changing anything.",
        ],
        "passCondition": "Reviewer can explain why this warning is harmless in context.",
        "failCondition": "Reviewer hears a concrete problem that should be fixed before branch inheritance.",
        "safeNextAction": "Create a timestamped repair candidate targeted at the failing stage.",
        "diagnosticFields": {},
    }


def item_paths_for_window(bundle_manifest_path: str | None, label: str) -> dict[str, str]:
    if not bundle_manifest_path:
        return {}
    bundle_path = Path(bundle_manifest_path)
    if not bundle_path.exists():
        return {}
    bundle = read_json(bundle_path)
    paths: dict[str, str] = {}
    for item in bundle.get("items", []):
        if item.get("windowLabel") != label:
            continue
        title = (item.get("title") or "").lower()
        note = (item.get("sourceNote") or "").lower()
        key = item.get("role") or "item"
        if "raw" in title or "raw aligned" in note:
            key = "rawAligned"
        elif "source-aware" in title or "source-aware" in note:
            key = "sourceAwareMix"
        elif "master" in title or "mastered" in note:
            key = "masteredSpine"
        elif "speaker split" in title or "speaker split" in note:
            key = "speakerSplitDiagnostic"
        paths[key] = item.get("bundlePath") or item.get("sourcePath") or ""
    return {key: value for key, value in paths.items() if value}


def build_workorder(baseline_dir: Path) -> dict[str, Any]:
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    outputs = manifest.get("outputs", {})
    comparison_path = outputs.get("proofWindowComparison")
    if not comparison_path:
        raise FileNotFoundError("Baseline manifest missing outputs.proofWindowComparison")
    comparison = read_json(Path(comparison_path))
    bundle_manifest_path = outputs.get("listenProofBundleManifest")

    items: list[dict[str, Any]] = []
    item_index = 1
    for window in comparison.get("windows", []):
        label = window.get("label") or "unknown-window"
        summary = window.get("summary", {})
        proof_paths = item_paths_for_window(bundle_manifest_path, label)
        for warning in summary.get("warnings", []):
            plan = warning_plan(warning, summary)
            items.append(
                {
                    "id": f"LW-{item_index:03d}",
                    "priority": "critical-listen",
                    "windowLabel": label,
                    "sequenceStartSeconds": window.get("sequenceStartSeconds"),
                    "warning": warning,
                    "likelyStage": plan["likelyStage"],
                    "listenOrder": [
                        "rawAligned",
                        "sourceAwareMix",
                        "masteredSpine",
                        "speakerSplitDiagnostic",
                    ],
                    "proofPaths": proof_paths,
                    "listenFor": plan["listenFor"],
                    "passCondition": plan["passCondition"],
                    "failCondition": plan["failCondition"],
                    "safeNextAction": plan["safeNextAction"],
                    "diagnosticFields": plan["diagnosticFields"],
                    "decision": "pending-human-listen",
                    "notes": "",
                }
            )
            item_index += 1

    baseline_id = manifest.get("baselineId", "unknown-baseline")
    suffix = output_suffix(baseline_id)
    json_path = baseline_dir / f"audio-proof-window-listen-workorder-{suffix}.json"
    md_path = baseline_dir / f"audio-proof-window-listen-workorder-{suffix}.md"
    return {
        "schema": "quipsly.audio-workbench.proof-window-listen-workorder.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "approvalStatus": manifest.get("approvalStatus"),
        "proofWindowComparison": comparison_path,
        "proofWindowComparisonMarkdown": outputs.get("proofWindowComparisonMarkdown"),
        "listenProofBundle": outputs.get("listenProofBundle"),
        "listenProofBundleManifest": bundle_manifest_path,
        "listenProofHtml": str(Path(outputs.get("listenProofBundle", "")) / "listen-proof.html")
        if outputs.get("listenProofBundle")
        else None,
        "listenProofPlaylist": str(Path(outputs.get("listenProofBundle", "")) / "listen-proof.m3u")
        if outputs.get("listenProofBundle")
        else None,
        "itemCount": len(items),
        "items": items,
        "rule": (
            "This workorder creates listen priorities from numerical warnings. "
            "It does not reject, approve, publish, or branch-inherit the candidate."
        ),
        "outputs": {
            "json": str(json_path),
            "markdown": str(md_path),
        },
    }


def render_markdown(workorder: dict[str, Any]) -> str:
    lines = [
        "# Audio Workbench proof-window listen workorder",
        "",
        f"- Baseline: `{workorder.get('baselineId')}`",
        f"- Generated: `{workorder.get('generatedAt')}`",
        f"- Approval status: `{workorder.get('approvalStatus')}`",
        f"- Item count: `{workorder.get('itemCount')}`",
        f"- Comparison: `{workorder.get('proofWindowComparisonMarkdown')}`",
        f"- Listen-proof HTML: `{workorder.get('listenProofHtml')}`",
        f"- Listen-proof playlist: `{workorder.get('listenProofPlaylist')}`",
        "",
        "This is a listen-priority workorder, not a rejection. If a warning sounds fine in context, mark it pass. If it fails, render a new v007 or timestamped candidate targeted at the failing stage.",
        "",
        "## Work items",
        "",
    ]
    for item in workorder.get("items", []):
        lines.extend(
            [
                f"### {item.get('id')} - {item.get('windowLabel')} @ {item.get('sequenceStartSeconds')}s",
                "",
                f"- Priority: `{item.get('priority')}`",
                f"- Warning: {item.get('warning')}",
                f"- Likely stage: `{item.get('likelyStage')}`",
                f"- Pass condition: {item.get('passCondition')}",
                f"- Fail condition: {item.get('failCondition')}",
                f"- Safe next action: {item.get('safeNextAction')}",
                "",
                "Listen for:",
                "",
            ]
        )
        lines.extend([f"- {text}" for text in item.get("listenFor", [])])
        lines.extend(["", "Proof paths:", ""])
        paths = item.get("proofPaths", {})
        if not paths:
            lines.append("- No per-window proof paths found. Open the listen-proof HTML instead.")
        for key in item.get("listenOrder", []):
            lines.append(f"- {key}: `{paths.get(key)}`")
        lines.extend(
            [
                "",
                "Decision:",
                "",
                "- [ ] Pass in context",
                "- [ ] Fail and request a v007/timestamped repair",
                "- Notes:",
                "",
                "> ",
                "",
            ]
        )
    if not workorder.get("items"):
        lines.append("- No proof-window warnings found. Human listen proof is still required before approval.")
    lines.extend(["", "## Rule", "", workorder.get("rule", ""), ""])
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    workorder = build_workorder(baseline_dir)
    outputs = workorder["outputs"]
    json_path = Path(outputs["json"])
    md_path = Path(outputs["markdown"])
    write_json(json_path, workorder)
    md_path.write_text(render_markdown(workorder), encoding="utf-8")

    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    manifest_outputs = manifest.setdefault("outputs", {})
    manifest_outputs["proofWindowListenWorkorder"] = str(json_path)
    manifest_outputs["proofWindowListenWorkorderMarkdown"] = str(md_path)
    manifest["approvalStatus"] = manifest.get("approvalStatus") or "machine-candidate-needs-human-listen-proof"
    write_json(manifest_path, manifest)

    print(json.dumps(outputs, indent=2))


if __name__ == "__main__":
    main()
