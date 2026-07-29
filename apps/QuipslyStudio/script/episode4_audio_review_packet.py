#!/usr/bin/env python3
"""Create a reviewer-facing proof packet for Episode 4 conformed audio.

This is intentionally read-only for media. It inspects the current conformed
baseline artifacts, proof snippets, and branch manifests, then writes compact
JSON/Markdown review packets beside the baseline so humans and agents can judge
whether the speaker-aware cleanup is actually acceptable.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_RUN_DIR = Path(
    "/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v002"
)
BASELINE_REL = Path("work/conformed-production-baseline")
EXPECTED_DURATION_TOLERANCE_SECONDS = 0.25
BRANCH_AV_TOLERANCE_SECONDS = 0.5


@dataclass
class Probe:
    path: str
    exists: bool
    sizeBytes: int | None = None
    durationSeconds: float | None = None
    audioCodec: str | None = None
    audioChannels: int | None = None
    sampleRate: int | None = None
    videoCodec: str | None = None
    width: int | None = None
    height: int | None = None
    error: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "path": self.path,
            "exists": self.exists,
            "sizeBytes": self.sizeBytes,
            "durationSeconds": self.durationSeconds,
            "audioCodec": self.audioCodec,
            "audioChannels": self.audioChannels,
            "sampleRate": self.sampleRate,
            "videoCodec": self.videoCodec,
            "width": self.width,
            "height": self.height,
            "error": self.error,
        }


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"_missing": str(path)}
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True)
        handle.write("\n")


def run_json(command: list[str]) -> tuple[dict[str, Any] | None, str | None]:
    try:
        result = subprocess.run(command, check=True, text=True, capture_output=True)
    except FileNotFoundError as exc:
        return None, f"missing executable: {exc.filename}"
    except subprocess.CalledProcessError as exc:
        detail = (exc.stderr or exc.stdout or str(exc)).strip()
        return None, detail[-1200:]
    try:
        return json.loads(result.stdout), None
    except json.JSONDecodeError as exc:
        return None, f"invalid json from {' '.join(command[:2])}: {exc}"


def probe_media(path: Path) -> Probe:
    if not path.exists():
        return Probe(path=str(path), exists=False, error="missing")
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        return Probe(path=str(path), exists=True, sizeBytes=path.stat().st_size, error="ffprobe not found")
    payload, error = run_json(
        [
            ffprobe,
            "-v",
            "error",
            "-show_entries",
            "format=duration:stream=codec_type,codec_name,channels,sample_rate,width,height",
            "-of",
            "json",
            str(path),
        ]
    )
    if error or payload is None:
        return Probe(path=str(path), exists=True, sizeBytes=path.stat().st_size, error=error)

    streams = payload.get("streams") or []
    audio = next((stream for stream in streams if stream.get("codec_type") == "audio"), {})
    video = next((stream for stream in streams if stream.get("codec_type") == "video"), {})
    duration = payload.get("format", {}).get("duration")
    return Probe(
        path=str(path),
        exists=True,
        sizeBytes=path.stat().st_size,
        durationSeconds=round(float(duration), 6) if duration is not None else None,
        audioCodec=audio.get("codec_name"),
        audioChannels=int(audio["channels"]) if str(audio.get("channels", "")).isdigit() else None,
        sampleRate=int(audio["sample_rate"]) if str(audio.get("sample_rate", "")).isdigit() else None,
        videoCodec=video.get("codec_name"),
        width=int(video["width"]) if str(video.get("width", "")).isdigit() else None,
        height=int(video["height"]) if str(video.get("height", "")).isdigit() else None,
    )


def newest_matching(path: Path, pattern: str, fallback: str) -> Path:
    matches = sorted(path.glob(pattern), key=lambda candidate: candidate.stat().st_mtime if candidate.exists() else 0)
    return matches[-1] if matches else path / fallback


def volumedetect(path: Path) -> dict[str, Any]:
    ffmpeg = shutil.which("ffmpeg")
    if not path.exists():
        return {"path": str(path), "error": "missing"}
    if not ffmpeg:
        return {"path": str(path), "error": "ffmpeg not found"}
    try:
        result = subprocess.run(
            [ffmpeg, "-hide_banner", "-nostats", "-i", str(path), "-af", "volumedetect", "-f", "null", "-"],
            check=False,
            text=True,
            capture_output=True,
        )
    except Exception as exc:  # pragma: no cover - defensive CLI utility
        return {"path": str(path), "error": str(exc)}
    stderr = result.stderr or ""
    mean = re.search(r"mean_volume:\s*([-0-9.]+) dB", stderr)
    maxv = re.search(r"max_volume:\s*([-0-9.]+) dB", stderr)
    return {
        "path": str(path),
        "meanVolumeDb": float(mean.group(1)) if mean else None,
        "maxVolumeDb": float(maxv.group(1)) if maxv else None,
        "returnCode": result.returncode,
    }


def collect_branch_manifests(run_dir: Path) -> list[dict[str, Any]]:
    manifests: list[dict[str, Any]] = []
    for manifest_path in sorted(run_dir.glob("*/manifest.json")):
        if BASELINE_REL in manifest_path.parents:
            continue
        manifest = load_json(manifest_path)
        output_probes: dict[str, Any] = {}
        outputs = manifest.get("outputs") or {}
        for key, entry in outputs.items():
            output_path = Path(entry.get("path", "")) if isinstance(entry, dict) else Path("")
            if output_path:
                output_probes[key] = probe_media(output_path).as_dict()
        video_duration = output_probes.get("video", {}).get("durationSeconds")
        podcast_duration = output_probes.get("podcastAudio", {}).get("durationSeconds")
        av_delta = None
        if video_duration is not None and podcast_duration is not None:
            av_delta = round(abs(video_duration - podcast_duration), 6)
        render_diagnostics = manifest.get("renderDiagnostics") or {}
        render_warning_count = int(render_diagnostics.get("warningCount", 0) or 0)
        render_warning_preview = (render_diagnostics.get("warningLines") or [])[:12]
        manifests.append(
            {
                "branch": manifest_path.parent.name,
                "manifestPath": str(manifest_path),
                "conformedProductionBaseline": manifest.get("conformedProductionBaseline"),
                "outputProbes": output_probes,
                "audioVideoDurationDeltaSeconds": av_delta,
                "renderDiagnostics": {
                    "warningCount": render_warning_count,
                    "warningStepCount": int(render_diagnostics.get("warningStepCount", 0) or 0),
                    "warningPreview": render_warning_preview,
                },
                "warnings": [
                    warning
                    for warning in [
                        "missing conformed baseline inheritance"
                        if not (manifest.get("conformedProductionBaseline") or {}).get("inheritsSpeakerAwareGapManagement")
                        else None,
                        f"audio/video duration delta {av_delta}s exceeds {BRANCH_AV_TOLERANCE_SECONDS}s"
                        if av_delta is not None and av_delta > BRANCH_AV_TOLERANCE_SECONDS
                        else None,
                        f"render diagnostics captured {render_warning_count} ffmpeg warning line(s)"
                        if render_warning_count
                        else None,
                    ]
                    if warning
                ],
            }
        )
    return manifests


def snippet_sort_key(path: Path) -> tuple[int, str, str]:
    match = re.search(r"-(\d+)s\.m4a$", path.name)
    second = int(match.group(1)) if match else -1
    if path.name.startswith("raw"):
        family = "1-raw"
    elif path.name.startswith("source-aware"):
        family = "2-source-aware"
    elif path.name.startswith("conformed"):
        family = "3-conformed"
    else:
        family = "9-other"
    return second, family, path.name


def collect_proof_snippets(baseline_dir: Path) -> list[dict[str, Any]]:
    snippet_dir = baseline_dir / "proof-snippets"
    snippets: list[dict[str, Any]] = []
    for path in sorted(snippet_dir.glob("*.m4a"), key=snippet_sort_key):
        match = re.search(r"-(\d+)s\.m4a$", path.name)
        if path.name.startswith("raw"):
            family = "raw aligned"
            listen_for = "baseline mess: echo, duplicate audio, park/noise, and rough balance"
        elif path.name.startswith("source-aware"):
            family = "source-aware contribution mix"
            listen_for = "first cleanup pass: less bleed/noise while preserving reactions"
        elif path.name.startswith("conformed"):
            family = "conformed mastered spine"
            listen_for = "final baseline: natural dialogue, no chopped feel, no distracting downspace echo/noise"
        else:
            family = "other"
            listen_for = "unexpected proof asset"
        snippets.append(
            {
                "timecodeSeconds": int(match.group(1)) if match else None,
                "family": family,
                "path": str(path),
                "probe": probe_media(path).as_dict(),
                "volume": volumedetect(path),
                "listenFor": listen_for,
            }
        )
    return snippets


def summarize_stems(automation: dict[str, Any], expected_duration: float | None) -> list[dict[str, Any]]:
    stems = automation.get("stems") or {}
    rows: list[dict[str, Any]] = []
    for name, stem in stems.items():
        path = Path(stem.get("path", ""))
        probe = probe_media(path).as_dict() if path else {"error": "missing path"}
        duration = probe.get("durationSeconds")
        delta = None
        warning = None
        role = "full-timeline speaker stem"
        duration_required = True
        if name.lower().startswith("reference"):
            role = "partial reference/media stem"
            duration_required = False
        if expected_duration is not None and duration is not None:
            delta = round(float(duration) - expected_duration, 6)
            if duration_required and abs(delta) > EXPECTED_DURATION_TOLERANCE_SECONDS:
                warning = f"duration delta {delta}s from expected full timeline"
        rows.append(
            {
                "stem": name,
                "role": role,
                "path": str(path),
                "durationDeltaSeconds": delta,
                "warning": warning,
                "probe": probe,
            }
        )
    return rows


def markdown_table(headers: list[str], rows: list[list[Any]]) -> str:
    def clean(value: Any) -> str:
        text = "" if value is None else str(value)
        return text.replace("\n", " ").replace("|", "\\|")

    output = ["| " + " | ".join(headers) + " |", "| " + " | ".join(["---"] * len(headers)) + " |"]
    for row in rows:
        output.append("| " + " | ".join(clean(value) for value in row) + " |")
    return "\n".join(output)


def write_markdown(path: Path, packet: dict[str, Any]) -> None:
    baseline = packet["baseline"]
    quality = packet["quality"]
    snippets = packet["proofSnippets"]
    stems = packet["stemChecks"]
    branches = packet["branchChecks"]
    lines: list[str] = []
    lines.append("# Episode 4 Audio Review Packet")
    lines.append("")
    lines.append(f"Generated: `{packet['generatedAt']}`")
    lines.append(f"Run folder: `{packet['runDir']}`")
    lines.append(f"Baseline: `{baseline.get('baselineId', 'unknown')}`")
    lines.append("")
    lines.append("## Verdict")
    lines.append("")
    lines.append(packet["verdict"])
    lines.append("")
    lines.append("## Critical listen checks")
    lines.append("")
    lines.extend(
        [
            "1. Charlie downspaces should no longer carry distracting Homer phone echo.",
            "2. Homer downspaces should be calmer and park/background noise should not pull focus.",
            "3. Laughter, reactions, starts, and tail ends should not sound chopped off.",
            "4. The conformed mastered spine should be usable as the one audio baseline for long-form edits and shorts.",
        ]
    )
    lines.append("")
    lines.append("## Core artifacts")
    lines.append("")
    artifact_rows = []
    for key, label in [
        ("dialogueBed", "Conformed dialogue bed WAV"),
        ("masterWav", "Mastered full-length spine WAV"),
        ("masterM4a", "Compressed delivery M4A"),
        ("qualityReport", "Quality report JSON"),
        ("speakerAutomation", "Speaker gap automation JSON"),
    ]:
        artifact = packet["artifacts"].get(key, {})
        artifact_rows.append([label, artifact.get("path"), artifact.get("durationSeconds"), artifact.get("sizeBytes"), artifact.get("status")])
    lines.append(markdown_table(["Artifact", "Path", "Duration", "Size", "Status"], artifact_rows))
    lines.append("")
    lines.append("## Quality summary")
    lines.append("")
    lines.append("```json")
    lines.append(json.dumps(quality, indent=2, sort_keys=True))
    lines.append("```")
    lines.append("")
    lines.append("## Proof snippets")
    lines.append("")
    snippet_rows = []
    for snippet in snippets:
        volume = snippet.get("volume") or {}
        probe = snippet.get("probe") or {}
        snippet_rows.append(
            [
                snippet.get("timecodeSeconds"),
                snippet.get("family"),
                probe.get("durationSeconds"),
                volume.get("meanVolumeDb"),
                volume.get("maxVolumeDb"),
                snippet.get("listenFor"),
                snippet.get("path"),
            ]
        )
    lines.append(markdown_table(["At", "Type", "Duration", "Mean dB", "Max dB", "Listen for", "Path"], snippet_rows))
    lines.append("")
    lines.append("## Stem checks")
    lines.append("")
    stem_rows = []
    for stem in stems:
        probe = stem.get("probe") or {}
        stem_rows.append([stem.get("stem"), stem.get("role"), probe.get("durationSeconds"), stem.get("durationDeltaSeconds"), stem.get("warning"), stem.get("path")])
    lines.append(markdown_table(["Stem", "Role", "Duration", "Delta", "Warning", "Path"], stem_rows))
    lines.append("")
    lines.append("## Branch inheritance checks")
    lines.append("")
    branch_rows = []
    for branch in branches:
        baseline_info = branch.get("conformedProductionBaseline") or {}
        render_info = branch.get("renderDiagnostics") or {}
        branch_rows.append(
            [
                branch.get("branch"),
                baseline_info.get("inheritsSpeakerAwareGapManagement"),
                branch.get("audioVideoDurationDeltaSeconds"),
                render_info.get("warningCount"),
                "; ".join(branch.get("warnings") or []),
                branch.get("manifestPath"),
            ]
        )
    lines.append(markdown_table(["Branch", "Inherits cleanup", "A/V delta", "Render warnings", "Warnings", "Manifest"], branch_rows))
    lines.append("")
    lines.append("## Next safest action")
    lines.append("")
    for action in packet["nextSafestActions"]:
        lines.append(f"- {action}")
    lines.append("")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def build_packet(run_dir: Path) -> dict[str, Any]:
    baseline_dir = run_dir / BASELINE_REL
    baseline_manifest = load_json(baseline_dir / "manifest.json")
    quality_path = newest_matching(baseline_dir, "quality-report-v*.json", "quality-report-v001.json")
    automation_path = newest_matching(baseline_dir, "speaker-gap-automation-v*.json", "speaker-gap-automation-v001.json")
    dialogue_bed_path = newest_matching(baseline_dir, "episode4-conformed-dialogue-bed-v*.wav", "episode4-conformed-dialogue-bed-v001.wav")
    master_wav_path = newest_matching(baseline_dir, "episode4-mastered-audio-spine-v*.wav", "episode4-mastered-audio-spine-v001.wav")
    master_m4a_path = newest_matching(baseline_dir, "episode4-mastered-audio-spine-v*.m4a", "episode4-mastered-audio-spine-v001.m4a")
    quality = load_json(quality_path)
    automation = load_json(automation_path)
    expected_duration = quality.get("expectedDurationSeconds") or baseline_manifest.get("expectedTimelineDurationSeconds")
    expected_duration = float(expected_duration) if expected_duration is not None else None

    artifacts = {
        "dialogueBed": probe_media(dialogue_bed_path).as_dict(),
        "masterWav": probe_media(master_wav_path).as_dict(),
        "masterM4a": probe_media(master_m4a_path).as_dict(),
        "qualityReport": {"path": str(quality_path), "status": "exists" if quality_path.exists() else "missing"},
        "speakerAutomation": {"path": str(automation_path), "status": "exists" if automation_path.exists() else "missing"},
    }
    for key, probe in list(artifacts.items()):
        if isinstance(probe, dict) and probe.get("exists"):
            probe["status"] = "exists"

    proof_snippets = collect_proof_snippets(baseline_dir)
    stem_checks = summarize_stems(automation, expected_duration)
    branch_checks = collect_branch_manifests(run_dir)

    warnings: list[str] = []
    if not baseline_manifest or baseline_manifest.get("_missing"):
        warnings.append("baseline manifest missing")
    if not quality.get("durationMatchesExpected"):
        warnings.append("quality report does not prove expected duration match")
    if len(proof_snippets) < 9:
        warnings.append("expected at least 9 proof snippets: raw/source-aware/conformed across three windows")
    for stem in stem_checks:
        if stem.get("warning"):
            warnings.append(f"{stem['stem']}: {stem['warning']}")
    for branch in branch_checks:
        warnings.extend(f"{branch['branch']}: {warning}" for warning in branch.get("warnings") or [])
    if not branch_checks:
        warnings.append("no long-form branch manifest found in this run; branch inheritance is not proven yet")

    verdict = (
        "Machine checks are clean enough for baseline listening review: the full-length mastered spine exists "
        "and matches the expected Episode 4 timeline duration. This is not final approval until proof snippets "
        "confirm the cleanup sounds natural. Branch inheritance is reported separately in branchChecks so review "
        "can distinguish audio-baseline readiness from edit-branch readiness."
    )
    if warnings:
        verdict = (
            "Review required before approval: core artifacts exist, but the packet found warnings that need either a fix or an explicit reviewer decision."
        )

    next_actions = [
        "Listen to each raw/source-aware/conformed snippet trio at 2062s, 4180s, and 5710s; mark whether echo/noise is reduced without chopped reactions.",
        "If Charlie or Homer tails sound clipped, create a v002 baseline with slower release/floor instead of manually editing the episode branch.",
        "If the current branch sounds good, render the remaining Episode 4 producer takes from the same conformed baseline.",
        "Replace any final concat path that emits timestamp warnings with a normalized render pass before declaring a YouTube/podcast-ready master.",
    ]

    return {
        "schema": "quipsly.episodeAudioReviewPacket.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "runDir": str(run_dir),
        "baseline": baseline_manifest,
        "quality": quality,
        "automation": {
            "path": str(automation_path),
            "mode": automation.get("mode"),
            "purpose": automation.get("purpose"),
            "profiles": automation.get("profiles"),
            "timelinePreserved": automation.get("timelinePreserved"),
            "originalMediaMutated": automation.get("originalMediaMutated"),
        },
        "artifacts": artifacts,
        "proofSnippets": proof_snippets,
        "stemChecks": stem_checks,
        "branchChecks": branch_checks,
        "warnings": warnings,
        "verdict": verdict,
        "nextSafestActions": next_actions,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Create Episode 4 conformed-audio review packet")
    parser.add_argument("--run-dir", type=Path, default=DEFAULT_RUN_DIR)
    parser.add_argument("--output-name", default="audio-review-packet-v001")
    args = parser.parse_args()

    run_dir = args.run_dir.expanduser().resolve()
    if not run_dir.exists():
        raise SystemExit(f"Run directory does not exist: {run_dir}")
    packet = build_packet(run_dir)
    baseline_dir = run_dir / BASELINE_REL
    json_path = baseline_dir / f"{args.output_name}.json"
    md_path = baseline_dir / f"{args.output_name}.md"
    write_json(json_path, packet)
    write_markdown(md_path, packet)
    print(json.dumps({"json": str(json_path), "markdown": str(md_path), "warnings": packet["warnings"], "verdict": packet["verdict"]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
