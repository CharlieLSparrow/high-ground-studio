#!/usr/bin/env python3
"""Validate that an Episode branch render inherited an Audio Workbench baseline."""
from __future__ import annotations

import argparse
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def ffprobe(path: Path) -> dict[str, Any]:
    proc = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_format",
            "-show_streams",
            "-of",
            "json",
            str(path),
        ],
        text=True,
        capture_output=True,
        check=False,
    )
    if proc.returncode != 0:
        return {"error": proc.stderr.strip() or proc.stdout.strip()}
    return json.loads(proc.stdout)


def first_stream(probe: dict[str, Any], codec_type: str) -> dict[str, Any]:
    for stream in probe.get("streams", []):
        if stream.get("codec_type") == codec_type:
            return stream
    return {}


def duration(probe: dict[str, Any]) -> float | None:
    try:
        return float(probe.get("format", {}).get("duration"))
    except (TypeError, ValueError):
        return None


def output_check(path_text: str | None, *, require_video: bool) -> dict[str, Any]:
    if not path_text:
        return {"exists": False, "warnings": ["missing path"]}
    path = Path(path_text)
    if not path.exists():
        return {"path": str(path), "exists": False, "warnings": ["file missing"]}
    probe = ffprobe(path)
    audio = first_stream(probe, "audio")
    video = first_stream(probe, "video")
    warnings: list[str] = []
    if not audio:
        warnings.append("missing audio stream")
    if require_video and not video:
        warnings.append("missing video stream")
    if duration(probe) is None or (duration(probe) or 0) <= 0:
        warnings.append("missing or invalid duration")
    return {
        "path": str(path),
        "exists": True,
        "durationSeconds": duration(probe),
        "audio": {
            "codec": audio.get("codec_name"),
            "sampleRate": audio.get("sample_rate"),
            "channels": audio.get("channels"),
        },
        "video": {
            "codec": video.get("codec_name"),
            "width": video.get("width"),
            "height": video.get("height"),
            "frameRate": video.get("avg_frame_rate"),
        } if video else None,
        "sizeBytes": probe.get("format", {}).get("size"),
        "warnings": warnings,
    }


def output_path(outputs: dict[str, Any], *keys: str) -> str | None:
    for key in keys:
        value = outputs.get(key)
        if isinstance(value, str):
            return value
        if isinstance(value, dict) and value.get("path"):
            return value.get("path")
    return None


def build_qc(manifest_path: Path) -> dict[str, Any]:
    manifest = read_json(manifest_path)
    baseline = manifest.get("conformedProductionBaseline") or {}
    truth = manifest.get("truth") or {}
    source_aware = baseline.get("sourceAwareAudioContract") if isinstance(baseline.get("sourceAwareAudioContract"), dict) else {}
    outputs = manifest.get("outputs") or {}
    video = output_check(output_path(outputs, "video", "video16x9"), require_video=True)
    podcast_audio = output_check(output_path(outputs, "podcastAudio", "audio", "audioOnly"), require_video=False)
    baseline_manifest_path = baseline.get("manifestPath")
    baseline_master_path = baseline.get("masterAudioPath")
    warnings: list[str] = []
    if not baseline.get("baselineId"):
        warnings.append("branch manifest does not name a conformed baseline id")
    if not baseline_manifest_path or not Path(baseline_manifest_path).exists():
        warnings.append("conformed baseline manifest is missing")
    if not baseline_master_path or not Path(baseline_master_path).exists():
        warnings.append("conformed baseline master audio is missing")
    if baseline.get("inheritsSpeakerAwareGapManagement") is not True:
        warnings.append("branch does not declare speaker-aware baseline inheritance")
    if baseline and baseline.get("approvedForBranchInheritance") is not True:
        warnings.append("conformed baseline is not human-approved for branch inheritance")
    if baseline.get("allowUnapprovedProofOverride") is True:
        warnings.append("branch used proof-only unapproved conformed baseline override")
    if truth.get("sourceAwareAudioTruthInherited") is not True:
        warnings.append("branch manifest does not declare source-aware audio truth inheritance")
    if truth.get("branchAudioRenderedFromSourceAwareStems") is not True:
        warnings.append("branch audio was not rendered from source-aware stems")
    if truth.get("branchAudioRenderedFromMasteredSpineOnly") is True:
        warnings.append("branch audio declares mastered-spine-only rendering")
    if truth.get("masteredSpineOnlyEditingAllowed") is not False:
        warnings.append("branch does not explicitly forbid mastered-spine-only editing")
    if source_aware.get("ready") is not True or source_aware.get("status") != "ready-source-aware-editable":
        warnings.append(f"source-aware audio contract is not ready: {source_aware.get('status')}")
    required_roles = {"charlie", "homer", "clip-source"}
    role_ids = {str(item) for item in (source_aware.get("roleIds") or [])}
    missing_roles = sorted(required_roles - role_ids)
    if missing_roles:
        warnings.append("source-aware audio roles missing: " + ", ".join(missing_roles))
    try:
        ready_stems = int(source_aware.get("readyStemCount") or 0)
    except (TypeError, ValueError):
        ready_stems = 0
    if ready_stems < 3:
        warnings.append(f"source-aware ready stem count too low: {source_aware.get('readyStemCount')}")
    warnings.extend([f"video: {warning}" for warning in video.get("warnings", [])])
    warnings.extend([f"podcastAudio: {warning}" for warning in podcast_audio.get("warnings", [])])
    source_aware_ready = not any(
        "source-aware" in warning
        or "mastered-spine-only" in warning
        or "rendered from source-aware stems" in warning
        for warning in warnings
    )
    return {
        "schema": "quipsly.audio-workbench.branch-qc.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "manifestPath": str(manifest_path),
        "branch": manifest.get("branch"),
        "conformedProductionBaseline": baseline,
        "sourceAwareAudio": {
            "contractStatus": source_aware.get("status"),
            "ready": source_aware.get("ready"),
            "roleIds": source_aware.get("roleIds"),
            "readyStemCount": source_aware.get("readyStemCount"),
            "branchAudioRenderedFromSourceAwareStems": truth.get("branchAudioRenderedFromSourceAwareStems"),
            "branchAudioRenderedFromMasteredSpineOnly": truth.get("branchAudioRenderedFromMasteredSpineOnly"),
            "masteredSpineOnlyEditingAllowed": truth.get("masteredSpineOnlyEditingAllowed"),
            "branchAudioMixPath": truth.get("branchAudioMixPath"),
        },
        "outputs": {
            "video": video,
            "podcastAudio": podcast_audio,
        },
        "warnings": warnings,
        "machineVerdict": {
            "inheritsConformedBaseline": not any("baseline" in warning for warning in warnings),
            "inheritsSourceAwareAudioTruth": truth.get("sourceAwareAudioTruthInherited") is True,
            "sourceAwareAudioReady": source_aware_ready,
            "branchAudioRenderedFromSourceAwareStems": truth.get("branchAudioRenderedFromSourceAwareStems") is True,
            "masteredSpineOnlyEditingPrevented": truth.get("branchAudioRenderedFromMasteredSpineOnly") is not True
            and truth.get("masteredSpineOnlyEditingAllowed") is False,
            "mediaFilesValid": not any(warning.startswith(("video:", "podcastAudio:")) for warning in warnings),
            "readyForProofWatch": not warnings,
            "publicationApproved": False,
        },
        "nextSafestAction": "Proof-watch/listen the branch before public upload. Machine QC does not prove editorial quality.",
    }


def write_markdown(packet: dict[str, Any], path: Path) -> None:
    video = packet.get("outputs", {}).get("video", {})
    podcast = packet.get("outputs", {}).get("podcastAudio", {})
    lines = [
        "# Audio Workbench branch QC",
        "",
        f"- Branch: `{(packet.get('branch') or {}).get('id')}`",
        f"- Baseline: `{(packet.get('conformedProductionBaseline') or {}).get('baselineId')}`",
        f"- Ready for proof-watch: `{packet.get('machineVerdict', {}).get('readyForProofWatch')}`",
        f"- Source-aware audio ready: `{packet.get('machineVerdict', {}).get('sourceAwareAudioReady')}`",
        f"- Branch audio rendered from source-aware stems: `{packet.get('machineVerdict', {}).get('branchAudioRenderedFromSourceAwareStems')}`",
        "",
        "## Outputs",
        "",
        f"- Video: `{video.get('path')}`",
        f"  - Duration: `{video.get('durationSeconds')}` seconds",
        f"  - Video: `{(video.get('video') or {}).get('codec')}` `{(video.get('video') or {}).get('width')}x{(video.get('video') or {}).get('height')}`",
        f"  - Audio: `{(video.get('audio') or {}).get('codec')}` `{(video.get('audio') or {}).get('sampleRate')}` Hz `{(video.get('audio') or {}).get('channels')}` channels",
        f"- Podcast audio: `{podcast.get('path')}`",
        f"  - Duration: `{podcast.get('durationSeconds')}` seconds",
        f"  - Audio: `{(podcast.get('audio') or {}).get('codec')}` `{(podcast.get('audio') or {}).get('sampleRate')}` Hz `{(podcast.get('audio') or {}).get('channels')}` channels",
        "",
        "## Source-aware audio truth",
        "",
        f"- Contract status: `{(packet.get('sourceAwareAudio') or {}).get('contractStatus')}`",
        f"- Role ids: `{(packet.get('sourceAwareAudio') or {}).get('roleIds')}`",
        f"- Ready stems: `{(packet.get('sourceAwareAudio') or {}).get('readyStemCount')}`",
        f"- Branch audio mix: `{(packet.get('sourceAwareAudio') or {}).get('branchAudioMixPath')}`",
        f"- Mastered-spine-only editing allowed: `{(packet.get('sourceAwareAudio') or {}).get('masteredSpineOnlyEditingAllowed')}`",
        "",
        "## Warnings",
        "",
        *([f"- {warning}" for warning in packet.get("warnings", [])] or ["- none"]),
        "",
        "## Next safest action",
        "",
        packet.get("nextSafestAction", ""),
        "",
    ]
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", required=True, type=Path)
    args = parser.parse_args()
    packet = build_qc(args.manifest)
    out_json = args.manifest.with_name("audio-workbench-branch-qc.json")
    out_md = args.manifest.with_name("audio-workbench-branch-qc.md")
    out_json.write_text(json.dumps(packet, indent=2, sort_keys=True), encoding="utf-8")
    write_markdown(packet, out_md)
    print(json.dumps({"json": str(out_json), "markdown": str(out_md)}, indent=2))


if __name__ == "__main__":
    main()
