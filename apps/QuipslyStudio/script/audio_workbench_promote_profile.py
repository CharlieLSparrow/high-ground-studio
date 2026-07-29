#!/usr/bin/env python3
"""Create or render a vNext Audio Workbench profile-promotion candidate.

This script is the promotion seam between proof-window experiments and a full
conformed baseline. By default it writes a plan only. With --render-candidate it
renders a full-length, non-approved candidate using a selected proof profile.

It never mutates originals, never overwrites v005, and never marks a baseline
human-approved. A rendered candidate is still machine-generated and must be
listen-proofed before it becomes the inherited production baseline.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from audio_workbench_profile_variants import PROFILE_DEFS  # noqa: E402


DEFAULT_TARGET_VERSION = "v006"
EPISODE_SEQUENCE_DURATION_SECONDS = 6799.943
TIMELINE_CONFORM_FILTER = (
    f"apad=whole_dur={EPISODE_SEQUENCE_DURATION_SECONDS:.3f},"
    f"atrim=0:{EPISODE_SEQUENCE_DURATION_SECONDS:.3f},"
    "asetpts=N/SR/TB"
)


def run_capture(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, text=True, capture_output=True, check=False)


def run_checked(cmd: list[str], *, dry_run: bool) -> None:
    if dry_run:
        print("DRY", " ".join(cmd))
        return
    proc = subprocess.run(cmd, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"Command failed with exit {proc.returncode}: {' '.join(cmd)}")


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


def artifact_path(value: Any) -> Path | None:
    if isinstance(value, str):
        return Path(value)
    if isinstance(value, dict) and value.get("path"):
        return Path(value["path"])
    return None


def ffprobe(path: Path) -> dict[str, Any]:
    proc = run_capture(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_format",
            "-show_streams",
            "-of",
            "json",
            str(path),
        ]
    )
    if proc.returncode != 0:
        return {"exists": path.exists(), "error": proc.stderr.strip() or proc.stdout.strip()}
    data = json.loads(proc.stdout)
    stream = next((item for item in data.get("streams", []) if item.get("codec_type") == "audio"), {})
    try:
        duration = float(data.get("format", {}).get("duration"))
    except (TypeError, ValueError):
        duration = None
    return {
        "exists": True,
        "path": str(path),
        "codec": stream.get("codec_name"),
        "sampleRate": int(stream.get("sample_rate") or 0),
        "channels": int(stream.get("channels") or 0),
        "durationSeconds": duration,
        "sizeBytes": int(data.get("format", {}).get("size") or 0),
    }


def version_from_baseline_id(baseline_id: str) -> str:
    match = re.search(r"(v\d+)$", baseline_id)
    return match.group(1) if match else "unknown"


def choose_profile(qc: dict[str, Any], requested_profile: str | None) -> str:
    if requested_profile:
        return requested_profile
    preferred = qc.get("machineRecommendation", {}).get("preferredListenCandidate")
    if preferred:
        return preferred
    raise ValueError("No profile was requested and QC has no preferredListenCandidate")


def load_stems(baseline_manifest: dict[str, Any]) -> dict[str, Path]:
    automation_path = artifact_path(baseline_manifest.get("outputs", {}).get("speakerGapAutomation"))
    if not automation_path:
        raise FileNotFoundError("Baseline manifest is missing outputs.speakerGapAutomation")
    automation = read_json(automation_path)
    stems = automation.get("stems", {})
    required = {
        "charlieAligned": "charlieAligned",
        "homerDjiAligned": "homerDjiAligned",
        "referenceAligned": "referenceAligned",
    }
    paths = {}
    for output_key, stem_key in required.items():
        path_text = stems.get(stem_key, {}).get("path")
        if not path_text:
            raise FileNotFoundError(f"Speaker automation missing {stem_key}")
        paths[output_key] = Path(path_text)
    return paths


def build_commands(paths: dict[str, Path], output_dir: Path, profile: dict[str, Any], target_version: str) -> dict[str, list[str]]:
    source_mix = output_dir / f"episode4-source-aware-profile-mix-{target_version}.wav"
    master_wav = output_dir / f"episode4-mastered-audio-spine-{target_version}.wav"
    master_m4a = output_dir / f"episode4-mastered-audio-spine-{target_version}.m4a"

    source_mix_filter = (
        f"[0:a]{profile['charlieFilter']}[c];"
        f"[1:a]{profile['homerFilter']}[h];"
        f"[2:a]{profile['referenceFilter']}[r];"
        "[c][h][r]amix=inputs=3:duration=longest:dropout_transition=0,"
        f"{TIMELINE_CONFORM_FILTER}[out]"
    )
    master_filter = f"{profile['busFilter']},aresample=48000,{TIMELINE_CONFORM_FILTER}"
    return {
        "sourceAwareMix": [
            "ffmpeg",
            "-hide_banner",
            "-y",
            "-i",
            str(paths["charlieAligned"]),
            "-i",
            str(paths["homerDjiAligned"]),
            "-i",
            str(paths["referenceAligned"]),
            "-filter_complex",
            source_mix_filter,
            "-map",
            "[out]",
            "-ar",
            "48000",
            "-ac",
            "2",
            str(source_mix),
        ],
        "masterWav": [
            "ffmpeg",
            "-hide_banner",
            "-y",
            "-i",
            str(source_mix),
            "-af",
            master_filter,
            "-ar",
            "48000",
            "-ac",
            "2",
            str(master_wav),
        ],
        "masterM4a": [
            "ffmpeg",
            "-hide_banner",
            "-y",
            "-i",
            str(master_wav),
            "-ar",
            "48000",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            str(master_m4a),
        ],
    }


def clone_json(value: dict[str, Any]) -> dict[str, Any]:
    return json.loads(json.dumps(value))


def build_candidate_manifest(
    *,
    baseline_manifest: dict[str, Any],
    baseline_dir: Path,
    candidate_dir: Path,
    outputs: dict[str, Any],
    target_version: str,
    profile_name: str,
    variant_qc_path: Path,
    promotion_json_path: Path,
    rendered: bool,
) -> dict[str, Any]:
    manifest = clone_json(baseline_manifest)
    parent_baseline_id = baseline_manifest.get("baselineId")
    candidate_id = f"episode-4-conformed-production-baseline-{target_version}-candidate-{profile_name}"
    source_mix = outputs["sourceAwareMix"]
    master_wav = outputs["masterWav"]
    master_m4a = outputs["masterM4a"]
    previous_outputs = baseline_manifest.get("outputs", {})

    manifest.update(
        {
            "schema": "quipsly.audio-workbench.conformed-production-baseline-candidate.v1",
            "baselineId": candidate_id,
            "parentBaselineId": parent_baseline_id,
            "version": target_version,
            "candidateProfile": profile_name,
            "approvalStatus": "machine-candidate-needs-human-listen-proof",
            "rendered": rendered,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "sourceBaselineDir": str(baseline_dir),
            "candidateDir": str(candidate_dir),
            "profileVariantQc": str(variant_qc_path),
            "profilePromotionPlan": str(promotion_json_path),
            "expectedTimelineDurationSeconds": baseline_manifest.get(
                "expectedTimelineDurationSeconds",
                EPISODE_SEQUENCE_DURATION_SECONDS,
            ),
            "safety": {
                "originalMediaMutated": False,
                "previousVersionsOverwritten": False,
                "humanApproved": False,
                "publicationApproved": False,
                "note": "This is a machine-rendered candidate baseline for listen/QC proof, not an approved production baseline.",
            },
        }
    )
    manifest["outputs"] = {
        **previous_outputs,
        "sourceAwareMix": source_mix,
        "dialogueBed": {
            **source_mix,
            "role": "profile-treated conformed dialogue bed candidate",
        },
        "masterWav": master_wav,
        "masterM4a": master_m4a,
        "speakerGapAutomation": previous_outputs.get("speakerGapAutomation"),
        "profilePromotion": str(promotion_json_path),
    }
    return manifest


def write_markdown(plan: dict[str, Any], path: Path) -> None:
    lines = [
        "# Audio Workbench profile promotion candidate",
        "",
        f"- Source baseline: `{plan['sourceBaselineId']}`",
        f"- Target version: `{plan['targetVersion']}`",
        f"- Selected profile: `{plan['selectedProfile']}`",
        f"- Status: `{plan['approvalStatus']}`",
        f"- Rendered: `{plan['rendered']}`",
        f"- Output dir: `{plan['outputDir']}`",
        "",
        "## Why this exists",
        "",
        "This is the seam between short proof-window experiments and a full conformed audio baseline. It keeps the promotion decision explicit instead of hiding it in script constants.",
        "",
        "## Safety",
        "",
        *[f"- {item}" for item in plan["safety"]],
        "",
        "## Machine evidence",
        "",
        f"- Variant QC: `{plan['variantQcPath']}`",
        f"- Machine recommendation: `{plan['machineRecommendation']['preferredListenCandidate']}`",
        f"- Auto-promote allowed: `{not plan['machineRecommendation']['doNotAutoPromote']}`",
        "",
        "## Outputs",
        "",
    ]
    for key, item in plan.get("outputs", {}).items():
        lines.append(f"- `{key}`: `{item['path']}`")
        lines.append(f"  - Probe: `{item.get('probe', {})}`")
    lines.extend(
        [
            "",
            "## Next action",
            "",
            plan["nextAction"],
            "",
        ]
    )
    path.write_text("\n".join(lines), encoding="utf-8")


def build_plan(
    *,
    baseline_dir: Path,
    variant_qc_path: Path,
    selected_profile: str | None,
    target_version: str,
    render_candidate: bool,
    output_dir: Path | None,
) -> dict[str, Any]:
    baseline_manifest = read_json(baseline_dir / "manifest.json")
    qc = read_json(variant_qc_path)
    profile_name = choose_profile(qc, selected_profile)
    if profile_name not in PROFILE_DEFS:
        raise ValueError(f"Unknown profile {profile_name}. Available: {', '.join(PROFILE_DEFS)}")

    source_version = version_from_baseline_id(baseline_manifest.get("baselineId", ""))
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    candidate_dir = output_dir or (baseline_dir / f"profile-promotion-{source_version}-to-{target_version}-{profile_name}-{stamp}")
    candidate_dir.mkdir(parents=True, exist_ok=True)

    paths = load_stems(baseline_manifest)
    commands = build_commands(paths, candidate_dir, PROFILE_DEFS[profile_name], target_version)
    command_paths = {
        "sourceAwareMix": Path(commands["sourceAwareMix"][-1]),
        "masterWav": Path(commands["masterWav"][-1]),
        "masterM4a": Path(commands["masterM4a"][-1]),
    }

    if render_candidate:
        for key in ("sourceAwareMix", "masterWav", "masterM4a"):
            if command_paths[key].exists():
                raise FileExistsError(f"Refusing to overwrite existing candidate output: {command_paths[key]}")
            run_checked(commands[key], dry_run=False)
    actual_rendered = render_candidate or all(path.exists() for path in command_paths.values())

    outputs = {
        key: {
            "path": str(path),
            "exists": path.exists(),
            "probe": ffprobe(path) if path.exists() else {},
        }
        for key, path in command_paths.items()
    }
    plan = {
        "schema": "quipsly.audio-workbench.profile-promotion-candidate.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sourceBaselineId": baseline_manifest.get("baselineId"),
        "sourceBaselineVersion": source_version,
        "sourceBaselineDir": str(baseline_dir),
        "targetVersion": target_version,
        "selectedProfile": profile_name,
        "recommendedProfile": qc.get("machineRecommendation", {}).get("preferredListenCandidate"),
        "selectedProfileIntent": PROFILE_DEFS[profile_name]["intent"],
        "variantQcPath": str(variant_qc_path),
        "machineRecommendation": qc.get("machineRecommendation", {}),
        "approvalStatus": "machine-candidate-needs-human-listen-proof",
        "status": "machine-candidate-needs-human-listen-proof",
        "rendered": actual_rendered,
        "renderCandidate": render_candidate,
        "doNotAutoPromote": qc.get("machineRecommendation", {}).get("doNotAutoPromote", True),
        "outputDir": str(candidate_dir),
        "commands": commands,
        "outputs": outputs,
        "artifactPaths": {key: item["path"] for key, item in outputs.items()},
        "safety": [
            "Original media and v005 artifacts are not mutated.",
            "This candidate is not human-approved and not publication-approved.",
            "A v006 promotion must keep normal stereo WAV/M4A handoff artifacts.",
            "If listen proof fails, render another timestamped candidate instead of overwriting this one.",
        ],
        "nextAction": (
            "Listen to the selected profile against the corrected proof playlist. If it wins, run this script with "
            "--render-candidate and then run baseline QC/source-activity on the rendered candidate before branch renders."
            if not render_candidate
            else "Run QC/source-activity on this rendered candidate and perform human listen proof before using it for edit branches."
        ),
    }
    json_path = candidate_dir / f"audio-workbench-profile-promotion-{target_version}.json"
    md_path = candidate_dir / f"audio-workbench-profile-promotion-{target_version}.md"
    manifest_path = candidate_dir / "manifest.json"
    plan["candidateManifest"] = str(manifest_path)
    write_json(json_path, plan)
    candidate_manifest = build_candidate_manifest(
        baseline_manifest=baseline_manifest,
        baseline_dir=baseline_dir,
        candidate_dir=candidate_dir,
        outputs=outputs,
        target_version=target_version,
        profile_name=profile_name,
        variant_qc_path=variant_qc_path,
        promotion_json_path=json_path,
        rendered=actual_rendered,
    )
    write_json(manifest_path, candidate_manifest)
    write_markdown(plan, md_path)
    return {**plan, "planJson": str(json_path), "planMarkdown": str(md_path)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    parser.add_argument("--variant-qc", required=True, type=Path)
    parser.add_argument("--profile")
    parser.add_argument("--target-version", default=DEFAULT_TARGET_VERSION)
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--render-candidate", action="store_true")
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    plan = build_plan(
        baseline_dir=baseline_dir,
        variant_qc_path=args.variant_qc,
        selected_profile=args.profile,
        target_version=args.target_version,
        render_candidate=args.render_candidate,
        output_dir=args.output_dir,
    )
    print(json.dumps({"json": plan["planJson"], "markdown": plan["planMarkdown"], "rendered": plan["rendered"]}, indent=2))


if __name__ == "__main__":
    main()
