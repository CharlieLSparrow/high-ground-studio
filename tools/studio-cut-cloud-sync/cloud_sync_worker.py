#!/usr/bin/env python3
"""Studio Cut Rescue Sync worker v0.

The worker runs without cloud credentials. It can:
- validate a checked-in sync job JSON
- optionally resolve uploaded inputs to local media files
- inspect local media with ffprobe
- extract normalized mono 48 kHz WAV files with ffmpeg
- build an ordered phone-reference rail
- assemble a local reference rail WAV from phone/reference pieces
- estimate non-reference track offsets with bounded waveform correlation
- emit a sync report JSON

Offset estimation v0 is not drift-aware and is intentionally conservative for
long files.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import shutil
import subprocess
import wave
from array import array
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


REQUIRED_INPUT_ROLES = [
    "homerVideo",
    "charlieVideo",
    "homerAudio",
    "charlieAudio",
    "phoneReferenceAudio",
]

VALID_INPUT_ROLES = [*REQUIRED_INPUT_ROLES, "clipVideo", "other"]
VALID_STATUSES = {
    "draft",
    "uploading",
    "uploaded",
    "queued",
    "processing",
    "ready",
    "failed",
}

AUDIO_REQUIRED_ROLES = {"homerAudio", "charlieAudio", "phoneReferenceAudio"}
VIDEO_REQUIRED_ROLES = {"homerVideo", "charlieVideo", "clipVideo"}
REFERENCE_RAIL_WAV_FILE_NAME = "reference-rail.wav"
ANALYSIS_TARGET_RATE_HZ = 100
MAX_CORRELATION_SECONDS = 300
MIN_CORRELATION_OVERLAP_SECONDS = 0.75
LOW_CORRELATION_CONFIDENCE = 0.35


@dataclass(frozen=True)
class ValidationResult:
    errors: list[str]
    warnings: list[str]

    @property
    def ok(self) -> bool:
        return not self.errors


@dataclass(frozen=True)
class LocalMediaResolution:
    input_id: str
    path: Path | None
    warnings: list[str]


@dataclass(frozen=True)
class MediaInspection:
    input_id: str
    path: Path
    duration_ms: int | None
    has_audio: bool
    has_video: bool
    sample_rate: int | None
    stream_types: list[str]
    warnings: list[str]


@dataclass(frozen=True)
class AudioExtraction:
    input_id: str
    path: Path | None
    warnings: list[str]


@dataclass(frozen=True)
class ReferenceRailAudio:
    path: Path | None
    warnings: list[str]


@dataclass(frozen=True)
class CorrelationEstimate:
    input_id: str
    estimated_offset_ms: int
    confidence: float
    score: float
    second_best_score: float
    warnings: list[str]


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Validate and locally inspect a Studio Cut Rescue Sync job.",
    )
    parser.add_argument("--sync-job-json", required=True, help="Path to sync job JSON.")
    parser.add_argument(
        "--out-sync-report",
        dest="out_sync_report",
        help="Optional path to write a sync report JSON.",
    )
    parser.add_argument(
        "--out",
        dest="out_sync_report",
        help="Optional path to write a sync report JSON.",
    )
    parser.add_argument(
        "--local-media-map",
        help="Optional JSON map of inputId to local media file path.",
    )
    parser.add_argument(
        "--media-root",
        help="Optional directory used to resolve uploaded input fileName values.",
    )
    parser.add_argument(
        "--workdir",
        help="Optional working directory for extracted audio. Required for extraction.",
    )
    args = parser.parse_args()

    sync_job_path = Path(args.sync_job_json)
    sync_job = load_json(sync_job_path)
    validation = validate_sync_job(sync_job)

    print("Studio Cut Rescue Sync worker v0")
    print("=================================")
    print(f"Sync job file: {sync_job_path}")

    if validation.warnings:
        print("\nWarnings:")
        for warning in validation.warnings:
            print(f"  - {warning}")

    if not validation.ok:
        print("\nBlocked:")
        for error in validation.errors:
            print(f"  - {error}")
        return 1

    uploaded_inputs = get_uploaded_inputs(sync_job)
    media_map = load_local_media_map(args.local_media_map)
    media_map_base = Path(args.local_media_map).resolve().parent if args.local_media_map else None
    media_root = Path(args.media_root).resolve() if args.media_root else None
    workdir = Path(args.workdir).resolve() if args.workdir else None
    local_mode = bool(media_map or media_root)

    resolutions = {
        entry["inputId"]: resolve_local_media(
            entry,
            media_map=media_map,
            media_map_base=media_map_base,
            media_root=media_root,
        )
        for entry in uploaded_inputs
    }
    inspections: dict[str, MediaInspection] = {}
    extractions: dict[str, AudioExtraction] = {}
    reference_rail_audio = ReferenceRailAudio(path=None, warnings=[])
    correlations: dict[str, CorrelationEstimate] = {}

    if local_mode:
        if not shutil.which("ffprobe"):
            print("\nWarning: ffprobe is unavailable; local media inspection skipped.")
        else:
            for entry in uploaded_inputs:
                input_id = entry["inputId"]
                resolution = resolutions[input_id]
                if resolution.path is None:
                    continue
                inspections[input_id] = inspect_media(entry, resolution.path)

        if workdir and shutil.which("ffmpeg"):
            for entry in uploaded_inputs:
                input_id = entry["inputId"]
                resolution = resolutions[input_id]
                inspection = inspections.get(input_id)
                if resolution.path is None:
                    continue
                extractions[input_id] = extract_audio(entry, resolution.path, inspection, workdir)
        elif workdir and not shutil.which("ffmpeg"):
            print("\nWarning: ffmpeg is unavailable; audio extraction skipped.")
        elif local_mode:
            print("\nWarning: --workdir was not provided; audio extraction skipped.")

        if workdir:
            reference_rail_audio = build_reference_rail_audio(
                uploaded_inputs,
                extractions,
                workdir,
            )
            correlations = estimate_track_offsets(
                uploaded_inputs,
                extractions,
                reference_rail_audio,
            )

    print("\nPlanned worker steps:")
    for index, step in enumerate(build_worker_plan(sync_job), start=1):
        print(f"  {index}. {step}")

    print("\nInput summary:")
    for entry in uploaded_inputs:
        print(format_input_summary(entry, resolutions, inspections, extractions))

    report = build_sync_report(
        sync_job,
        uploaded_inputs=uploaded_inputs,
        resolutions=resolutions,
        inspections=inspections,
        extractions=extractions,
        reference_rail_audio=reference_rail_audio,
        correlations=correlations,
        local_mode=local_mode,
    )

    if args.out_sync_report:
        report_path = Path(args.out_sync_report)
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        print(f"\nWrote sync report: {report_path}")

    return 0


def load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise SystemExit(f"{path} must contain a JSON object.")
    return value


def load_local_media_map(path: str | None) -> dict[str, str]:
    if not path:
        return {}
    value = load_json(Path(path))
    inputs = value.get("inputs")
    if not isinstance(inputs, dict):
        raise SystemExit("--local-media-map must contain an inputs object.")
    return {
        str(input_id): str(local_path)
        for input_id, local_path in inputs.items()
        if isinstance(local_path, str)
    }


def validate_sync_job(sync_job: dict[str, Any]) -> ValidationResult:
    errors: list[str] = []
    warnings: list[str] = []

    for field in [
        "syncJobId",
        "projectId",
        "branchId",
        "title",
        "createdBy",
        "createdAt",
        "updatedAt",
        "status",
        "expectedInputs",
        "uploadedInputs",
        "outputs",
    ]:
        if field not in sync_job:
            errors.append(f"Missing required field: {field}")

    status = sync_job.get("status")
    if status not in VALID_STATUSES:
        errors.append(f"Invalid status: {status}")

    expected_inputs = sync_job.get("expectedInputs")
    if not isinstance(expected_inputs, dict):
        errors.append("expectedInputs must be an object.")
    else:
        for role in REQUIRED_INPUT_ROLES:
            if expected_inputs.get(role) is not True:
                errors.append(f"expectedInputs.{role} must be true.")

    uploaded_inputs = sync_job.get("uploadedInputs")
    if not isinstance(uploaded_inputs, list):
        errors.append("uploadedInputs must be an array.")
    else:
        validate_uploaded_inputs(uploaded_inputs, errors)
        uploaded_roles = {
            entry.get("role")
            for entry in uploaded_inputs
            if isinstance(entry, dict) and isinstance(entry.get("role"), str)
        }
        missing = [role for role in REQUIRED_INPUT_ROLES if role not in uploaded_roles]
        if missing:
            warnings.append(
                "Required uploaded inputs are not complete: " + ", ".join(missing)
            )

    outputs = sync_job.get("outputs")
    if not isinstance(outputs, dict):
        errors.append("outputs must be an object.")
    else:
        for output_field in [
            "manifestStoragePath",
            "sourceMonitorProxyStoragePath",
            "syncReportStoragePath",
            "sharedRoomUrl",
        ]:
            value = outputs.get(output_field)
            if value is not None and not isinstance(value, str):
                errors.append(f"outputs.{output_field} must be a string when present.")

    return ValidationResult(errors=errors, warnings=warnings)


def validate_uploaded_inputs(
    uploaded_inputs: list[Any],
    errors: list[str],
) -> None:
    seen_input_ids: set[str] = set()

    for index, uploaded_input in enumerate(uploaded_inputs):
        prefix = f"uploadedInputs[{index}]"
        if not isinstance(uploaded_input, dict):
            errors.append(f"{prefix} must be an object.")
            continue

        input_id = uploaded_input.get("inputId")
        if not isinstance(input_id, str) or not input_id.strip():
            errors.append(f"{prefix}.inputId must be a non-empty string.")
        elif input_id in seen_input_ids:
            errors.append(f"{prefix}.inputId duplicates {input_id}.")
        else:
            seen_input_ids.add(input_id)

        role = uploaded_input.get("role")
        if role not in VALID_INPUT_ROLES:
            errors.append(f"{prefix}.role is invalid: {role}")

        for field in ["storagePath", "fileName", "contentType", "uploadedAt"]:
            if not isinstance(uploaded_input.get(field), str) or not uploaded_input[
                field
            ].strip():
                errors.append(f"{prefix}.{field} must be a non-empty string.")

        size_bytes = uploaded_input.get("sizeBytes")
        if not isinstance(size_bytes, (int, float)) or size_bytes < 0:
            errors.append(f"{prefix}.sizeBytes must be a non-negative number.")

        duration_ms = uploaded_input.get("durationMs")
        if duration_ms is not None and (
            not isinstance(duration_ms, (int, float)) or duration_ms < 0
        ):
            errors.append(f"{prefix}.durationMs must be a non-negative number.")

        order_index = uploaded_input.get("orderIndex")
        if order_index is not None and (
            not isinstance(order_index, int) or order_index < 0
        ):
            errors.append(f"{prefix}.orderIndex must be a non-negative integer.")


def get_uploaded_inputs(sync_job: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        entry
        for entry in sync_job.get("uploadedInputs", [])
        if isinstance(entry, dict) and entry.get("role") in VALID_INPUT_ROLES
    ]


def sort_reference_inputs(uploaded_inputs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        [
            entry
            for entry in uploaded_inputs
            if entry.get("role") == "phoneReferenceAudio"
        ],
        key=lambda entry: (
            entry.get("orderIndex", 999_999),
            entry.get("fileName", ""),
            entry.get("inputId", ""),
        ),
    )


def resolve_local_media(
    entry: dict[str, Any],
    *,
    media_map: dict[str, str],
    media_map_base: Path | None,
    media_root: Path | None,
) -> LocalMediaResolution:
    input_id = entry["inputId"]
    warnings: list[str] = []
    raw_path = media_map.get(input_id)

    if raw_path:
        path = Path(raw_path)
        if not path.is_absolute() and media_map_base:
            path = media_map_base / path
        path = path.resolve()
    elif media_root:
        path = (media_root / str(entry.get("fileName", ""))).resolve()
    else:
        return LocalMediaResolution(input_id=input_id, path=None, warnings=[])

    if not path.exists():
        warnings.append(f"Local media file is missing: {path}")
        return LocalMediaResolution(input_id=input_id, path=None, warnings=warnings)

    return LocalMediaResolution(input_id=input_id, path=path, warnings=warnings)


def inspect_media(entry: dict[str, Any], path: Path) -> MediaInspection:
    warnings: list[str] = []
    command = [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-show_streams",
        "-of",
        "json",
        str(path),
    ]
    result = run_command(command)

    if result.returncode != 0:
        return MediaInspection(
            input_id=entry["inputId"],
            path=path,
            duration_ms=None,
            has_audio=False,
            has_video=False,
            sample_rate=None,
            stream_types=[],
            warnings=[f"ffprobe failed: {result.stderr.strip() or result.stdout.strip()}"],
        )

    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError as error:
        return MediaInspection(
            input_id=entry["inputId"],
            path=path,
            duration_ms=None,
            has_audio=False,
            has_video=False,
            sample_rate=None,
            stream_types=[],
            warnings=[f"ffprobe returned invalid JSON: {error}"],
        )

    streams = payload.get("streams") if isinstance(payload, dict) else []
    if not isinstance(streams, list):
        streams = []

    audio_streams = [stream for stream in streams if stream.get("codec_type") == "audio"]
    video_streams = [stream for stream in streams if stream.get("codec_type") == "video"]
    duration_ms = parse_duration_ms(payload.get("format", {}).get("duration"))
    if duration_ms is None:
        stream_durations = [
            parse_duration_ms(stream.get("duration"))
            for stream in streams
            if isinstance(stream, dict)
        ]
        duration_ms = max(
            [duration for duration in stream_durations if duration is not None],
            default=None,
        )

    sample_rate = None
    if audio_streams:
        raw_sample_rate = audio_streams[0].get("sample_rate")
        if isinstance(raw_sample_rate, str) and raw_sample_rate.isdigit():
            sample_rate = int(raw_sample_rate)

    role = entry["role"]
    if duration_ms is None:
        warnings.append("duration unknown")
    if role in AUDIO_REQUIRED_ROLES and not audio_streams:
        warnings.append(f"{role} expects audio but no audio stream was found")
    if role in VIDEO_REQUIRED_ROLES and not video_streams:
        warnings.append(f"{role} expects video but no video stream was found")
    if not audio_streams:
        warnings.append("no audio stream")

    return MediaInspection(
        input_id=entry["inputId"],
        path=path,
        duration_ms=duration_ms,
        has_audio=bool(audio_streams),
        has_video=bool(video_streams),
        sample_rate=sample_rate,
        stream_types=sorted(
            {
                str(stream.get("codec_type"))
                for stream in streams
                if isinstance(stream, dict) and stream.get("codec_type")
            }
        ),
        warnings=warnings,
    )


def extract_audio(
    entry: dict[str, Any],
    path: Path,
    inspection: MediaInspection | None,
    workdir: Path,
) -> AudioExtraction:
    input_id = entry["inputId"]
    output_dir = workdir / "audio"
    output_path = output_dir / f"{safe_file_part(input_id)}.wav"
    warnings: list[str] = []

    if inspection and not inspection.has_audio:
        return AudioExtraction(
            input_id=input_id,
            path=None,
            warnings=["audio extraction skipped because no audio stream was found"],
        )

    output_dir.mkdir(parents=True, exist_ok=True)
    command = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        str(path),
        "-vn",
        "-ac",
        "1",
        "-ar",
        "48000",
        "-acodec",
        "pcm_s16le",
        str(output_path),
    ]
    result = run_command(command)

    if result.returncode != 0:
        warnings.append(f"ffmpeg audio extraction failed: {result.stderr.strip()}")
        return AudioExtraction(input_id=input_id, path=None, warnings=warnings)

    return AudioExtraction(input_id=input_id, path=output_path, warnings=warnings)


def build_reference_rail_audio(
    uploaded_inputs: list[dict[str, Any]],
    extractions: dict[str, AudioExtraction],
    workdir: Path,
) -> ReferenceRailAudio:
    ordered_reference_inputs = sort_reference_inputs(uploaded_inputs)
    output_path = workdir / "audio" / REFERENCE_RAIL_WAV_FILE_NAME
    warnings: list[str] = []
    reference_paths: list[Path] = []

    for entry in ordered_reference_inputs:
        input_id = entry["inputId"]
        extraction = extractions.get(input_id)
        if extraction and extraction.path:
            reference_paths.append(extraction.path)
        else:
            warnings.append(f"{input_id}: reference audio extraction unavailable")
            if extraction:
                warnings.extend(extraction.warnings)

    if not reference_paths:
        warnings.append("reference rail WAV was not built because no reference WAVs exist")
        return ReferenceRailAudio(path=None, warnings=unique_strings(warnings))

    output_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        concatenate_wavs(reference_paths, output_path)
    except OSError as error:
        warnings.append(f"reference rail WAV build failed: {error}")
        return ReferenceRailAudio(path=None, warnings=unique_strings(warnings))

    return ReferenceRailAudio(path=output_path, warnings=unique_strings(warnings))


def concatenate_wavs(input_paths: list[Path], output_path: Path) -> None:
    expected_params: tuple[int, int, int] | None = None

    with wave.open(str(output_path), "wb") as output_wav:
        for input_path in input_paths:
            with wave.open(str(input_path), "rb") as input_wav:
                params = (
                    input_wav.getnchannels(),
                    input_wav.getsampwidth(),
                    input_wav.getframerate(),
                )
                if expected_params is None:
                    expected_params = params
                    output_wav.setnchannels(input_wav.getnchannels())
                    output_wav.setsampwidth(input_wav.getsampwidth())
                    output_wav.setframerate(input_wav.getframerate())
                elif params != expected_params:
                    raise OSError(
                        "reference WAV parameters do not match "
                        f"{expected_params}: {input_path}"
                    )

                output_wav.writeframes(input_wav.readframes(input_wav.getnframes()))


def estimate_track_offsets(
    uploaded_inputs: list[dict[str, Any]],
    extractions: dict[str, AudioExtraction],
    reference_rail_audio: ReferenceRailAudio,
) -> dict[str, CorrelationEstimate]:
    if reference_rail_audio.path is None:
        return {}

    estimates: dict[str, CorrelationEstimate] = {}
    for entry in uploaded_inputs:
        if entry.get("role") == "phoneReferenceAudio":
            continue
        input_id = entry["inputId"]
        extraction = extractions.get(input_id)
        if not extraction or not extraction.path:
            continue
        estimates[input_id] = estimate_offset_against_reference(
            input_id=input_id,
            input_audio_path=extraction.path,
            reference_audio_path=reference_rail_audio.path,
        )
    return estimates


def estimate_offset_against_reference(
    *,
    input_id: str,
    input_audio_path: Path,
    reference_audio_path: Path,
) -> CorrelationEstimate:
    warnings: list[str] = []

    try:
        reference = load_wav_envelope(reference_audio_path)
        track = load_wav_envelope(input_audio_path)
    except OSError as error:
        return CorrelationEstimate(
            input_id=input_id,
            estimated_offset_ms=0,
            confidence=0.02,
            score=0,
            second_best_score=0,
            warnings=[f"correlation unavailable: {error}"],
        )

    if reference.duration_seconds > MAX_CORRELATION_SECONDS:
        warnings.append(
            f"reference rail is longer than {MAX_CORRELATION_SECONDS}s; "
            "chunked/FFT correlation is required"
        )
    if track.duration_seconds > MAX_CORRELATION_SECONDS:
        warnings.append(
            f"{input_id} is longer than {MAX_CORRELATION_SECONDS}s; "
            "chunked/FFT correlation is required"
        )
    if warnings:
        return CorrelationEstimate(
            input_id=input_id,
            estimated_offset_ms=0,
            confidence=0.03,
            score=0,
            second_best_score=0,
            warnings=warnings,
        )

    if len(track.values) > len(reference.values):
        warnings.append("track is longer than the reference rail")

    estimate = normalized_offset_correlation(reference.values, track.values)
    if estimate is None:
        return CorrelationEstimate(
            input_id=input_id,
            estimated_offset_ms=0,
            confidence=0.02,
            score=0,
            second_best_score=0,
            warnings=["correlation unavailable: not enough analysis samples"],
        )

    offset_frames, score, second_best_score = estimate
    estimated_offset_ms = round(offset_frames * reference.frame_duration_ms)
    confidence = score_to_confidence(score, second_best_score)

    if confidence < LOW_CORRELATION_CONFIDENCE:
        warnings.append("correlation confidence is low")
    if estimated_offset_ms <= round(reference.frame_duration_ms):
        warnings.append("estimated offset is near the reference rail start")
    reference_duration_ms = round(reference.duration_seconds * 1000)
    track_duration_ms = round(track.duration_seconds * 1000)
    if estimated_offset_ms + track_duration_ms >= reference_duration_ms - round(
        reference.frame_duration_ms
    ):
        warnings.append("estimated offset is near the reference rail end")

    return CorrelationEstimate(
        input_id=input_id,
        estimated_offset_ms=estimated_offset_ms,
        confidence=confidence,
        score=round(score, 4),
        second_best_score=round(second_best_score, 4),
        warnings=unique_strings(warnings),
    )


@dataclass(frozen=True)
class WavEnvelope:
    values: list[float]
    frame_duration_ms: float
    duration_seconds: float


def load_wav_envelope(path: Path) -> WavEnvelope:
    with wave.open(str(path), "rb") as wav_file:
        channels = wav_file.getnchannels()
        sample_width = wav_file.getsampwidth()
        sample_rate = wav_file.getframerate()
        frame_count = wav_file.getnframes()
        duration_seconds = frame_count / sample_rate if sample_rate else 0

        if channels != 1:
            raise OSError(f"{path} must be mono for v0 correlation")
        if sample_width != 2:
            raise OSError(f"{path} must be 16-bit PCM WAV for v0 correlation")
        if sample_rate <= 0:
            raise OSError(f"{path} has an invalid sample rate")

        raw_frames = wav_file.readframes(frame_count)

    samples = array("h")
    samples.frombytes(raw_frames)

    window_size = max(1, round(sample_rate / ANALYSIS_TARGET_RATE_HZ))
    values: list[float] = []
    max_sample = 32768.0

    for start in range(0, len(samples), window_size):
        window = samples[start : start + window_size]
        if not window:
            continue
        values.append(sum(abs(sample) for sample in window) / (len(window) * max_sample))

    return WavEnvelope(
        values=values,
        frame_duration_ms=(window_size / sample_rate) * 1000,
        duration_seconds=duration_seconds,
    )


def normalized_offset_correlation(
    reference: list[float],
    track: list[float],
) -> tuple[int, float, float] | None:
    if not reference or not track:
        return None

    min_overlap = max(
        3,
        round(MIN_CORRELATION_OVERLAP_SECONDS * ANALYSIS_TARGET_RATE_HZ),
    )
    max_overlap = min(len(reference), len(track))
    if max_overlap < min_overlap:
        return None

    best_lag = 0
    best_score = -1.0
    second_best_score = -1.0
    exclusion_radius = round(0.25 * ANALYSIS_TARGET_RATE_HZ)

    for lag in range(-len(track) + min_overlap, len(reference) - min_overlap + 1):
        ref_start = max(0, lag)
        track_start = max(0, -lag)
        overlap = min(len(reference) - ref_start, len(track) - track_start)
        if overlap < min_overlap:
            continue

        score = normalized_dot(
            reference[ref_start : ref_start + overlap],
            track[track_start : track_start + overlap],
        )
        if score > best_score:
            if abs(lag - best_lag) > exclusion_radius:
                second_best_score = best_score
            best_score = score
            best_lag = lag
        elif (
            score > second_best_score
            and abs(lag - best_lag) > exclusion_radius
        ):
            second_best_score = score

    if best_score < -0.5:
        return None

    return best_lag, best_score, max(second_best_score, 0)


def normalized_dot(left: list[float], right: list[float]) -> float:
    if len(left) != len(right) or not left:
        return 0

    left_mean = sum(left) / len(left)
    right_mean = sum(right) / len(right)
    numerator = 0.0
    left_energy = 0.0
    right_energy = 0.0

    for left_value, right_value in zip(left, right):
        centered_left = left_value - left_mean
        centered_right = right_value - right_mean
        numerator += centered_left * centered_right
        left_energy += centered_left * centered_left
        right_energy += centered_right * centered_right

    denominator = math.sqrt(left_energy * right_energy)
    if denominator <= 0:
        return 0
    return numerator / denominator


def score_to_confidence(score: float, second_best_score: float) -> float:
    if score <= 0:
        return 0.02
    separation = max(0.0, score - second_best_score) / max(abs(score), 0.001)
    confidence = (0.7 * min(score, 1.0)) + (0.3 * min(separation, 1.0))
    return round(max(0.02, min(0.99, confidence)), 3)


def run_command(command: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        check=False,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )


def parse_duration_ms(value: Any) -> int | None:
    try:
        duration_seconds = float(value)
    except (TypeError, ValueError):
        return None

    if duration_seconds < 0:
        return None
    return round(duration_seconds * 1000)


def build_worker_plan(sync_job: dict[str, Any]) -> list[str]:
    sync_job_id = sync_job.get("syncJobId", "unknown-sync-job")
    uploaded_inputs = sync_job.get("uploadedInputs", [])

    return [
        f"Read sync job {sync_job_id} from Firestore.",
        f"Download or resolve {len(uploaded_inputs)} uploaded Storage object(s).",
        "Inspect local media with ffprobe when a local media map/root is provided.",
        "Extract mono 48 kHz WAV audio with ffmpeg into workdir/audio.",
        "Sort phoneReferenceAudio pieces by orderIndex, then file name.",
        "Build a continuous metadata reference rail from ordered phone/reference pieces.",
        "Assemble workdir/audio/reference-rail.wav from extracted phone/reference WAVs.",
        "Cross-correlate extracted non-reference audio against the reference rail WAV.",
        "Estimate per-input offsets with bounded waveform correlation v0.",
        "Estimate drift confidence. (Future step.)",
        "Generate timeline-aligned low-res intermediate proxies. (Future step.)",
        "Compose outputs/source-monitor-proxy.mp4 for browser editing. (Future step.)",
        "Write outputs/episode-manifest.json and outputs/sync-report.json. (Report only in v0.)",
        "Write shared room metadata under studioCutProjects/{projectId}/branches/{branchId}/room/meta. (Future step.)",
    ]


def format_input_summary(
    entry: dict[str, Any],
    resolutions: dict[str, LocalMediaResolution],
    inspections: dict[str, MediaInspection],
    extractions: dict[str, AudioExtraction],
) -> str:
    input_id = entry["inputId"]
    inspection = inspections.get(input_id)
    extraction = extractions.get(input_id)
    duration = (
        f"{inspection.duration_ms}ms"
        if inspection and inspection.duration_ms is not None
        else f"{int(entry.get('durationMs') or 0)}ms metadata"
    )
    resolved = "local" if resolutions.get(input_id, None) and resolutions[input_id].path else "metadata"
    extracted = "extracted" if extraction and extraction.path else "not extracted"
    return f"  - {input_id} ({entry['role']}): {duration}, {resolved}, {extracted}"


def build_sync_report(
    sync_job: dict[str, Any],
    *,
    uploaded_inputs: list[dict[str, Any]],
    resolutions: dict[str, LocalMediaResolution],
    inspections: dict[str, MediaInspection],
    extractions: dict[str, AudioExtraction],
    reference_rail_audio: ReferenceRailAudio,
    correlations: dict[str, CorrelationEstimate],
    local_mode: bool,
) -> dict[str, Any]:
    reference_segments = build_reference_segments(
        sync_job,
        uploaded_inputs,
        resolutions,
        inspections,
        extractions,
    )
    reference_total_duration_ms = sum(
        segment["durationMs"] for segment in reference_segments
    )

    return {
        "syncJobId": sync_job.get("syncJobId", "unknown-sync-job"),
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "status": "ready",
        "referenceRail": {
            "syncJobId": sync_job.get("syncJobId", "unknown-sync-job"),
            "referenceRole": "phoneReferenceAudio",
            "segments": reference_segments,
            "totalDurationMs": reference_total_duration_ms,
            "warnings": build_reference_rail_warnings(
                reference_segments,
                local_mode,
                reference_rail_audio,
            ),
        },
        "trackOffsets": [
            build_track_offset(
                entry,
                resolutions,
                inspections,
                extractions,
                reference_rail_audio,
                correlations,
            )
            for entry in uploaded_inputs
            if entry.get("role") != "phoneReferenceAudio"
        ],
        "globalWarnings": build_global_warnings(local_mode, reference_rail_audio),
    }


def build_reference_segments(
    sync_job: dict[str, Any],
    uploaded_inputs: list[dict[str, Any]],
    resolutions: dict[str, LocalMediaResolution],
    inspections: dict[str, MediaInspection],
    extractions: dict[str, AudioExtraction],
) -> list[dict[str, Any]]:
    reference_inputs = sort_reference_inputs(uploaded_inputs)
    rail_start_ms = 0
    segments: list[dict[str, Any]] = []

    for reference_input in reference_inputs:
        input_id = reference_input["inputId"]
        inspection = inspections.get(input_id)
        extraction = extractions.get(input_id)
        duration_ms = get_best_duration_ms(reference_input, inspection)
        warnings = collect_input_warnings(
            reference_input,
            resolutions.get(input_id),
            inspection,
            extraction,
        )

        if inspection and inspection.duration_ms is not None:
            confidence = 0.55 if inspection.has_audio else 0.15
        elif duration_ms > 0:
            confidence = 0.25
            warnings.append("reference segment duration came from metadata")
        else:
            confidence = 0.05
            warnings.append("reference segment duration is missing")

        segment = {
            "inputId": input_id,
            "fileName": reference_input.get("fileName", "phone-reference.placeholder"),
            "railStartMs": rail_start_ms,
            "sourceStartMs": 0,
            "durationMs": duration_ms,
            "confidence": confidence,
            "warnings": unique_strings(warnings),
        }

        if segments:
            segment["gapBeforeMs"] = 0

        segments.append(segment)
        rail_start_ms += duration_ms

    if not segments:
        return [
            {
                "inputId": "missing-phone-reference",
                "fileName": "missing-phone-reference",
                "railStartMs": 0,
                "sourceStartMs": 0,
                "durationMs": 0,
                "confidence": 0,
                "warnings": ["No phoneReferenceAudio inputs were available."],
            }
        ]

    return segments


def build_reference_rail_warnings(
    reference_segments: list[dict[str, Any]],
    local_mode: bool,
    reference_rail_audio: ReferenceRailAudio,
) -> list[str]:
    warnings = []
    if not local_mode:
        warnings.append("Metadata-only mode; media was not inspected.")
    warnings.extend(reference_rail_audio.warnings)
    if any(segment["durationMs"] == 0 for segment in reference_segments):
        warnings.append("One or more reference rail segments has no duration.")
    if any(segment["warnings"] for segment in reference_segments):
        warnings.append("One or more reference rail segments has warnings.")
    return unique_strings(warnings)


def build_global_warnings(
    local_mode: bool,
    reference_rail_audio: ReferenceRailAudio,
) -> list[str]:
    warnings = [
        "Reference rail built from ordered phone pieces.",
        "Offset estimation v0 uses local waveform correlation and is not drift-aware yet.",
        "Long-form/chunked correlation and drift estimation are future work.",
        "Source-monitor proxy and Episode Manifest generation are not implemented yet.",
    ]

    if not local_mode:
        warnings.insert(1, "Metadata-only mode; offset estimation was not attempted.")
    elif reference_rail_audio.path is None:
        warnings.insert(1, "Offset estimation was blocked because reference rail audio was unavailable.")

    return unique_strings(warnings)


def build_track_offset(
    entry: dict[str, Any],
    resolutions: dict[str, LocalMediaResolution],
    inspections: dict[str, MediaInspection],
    extractions: dict[str, AudioExtraction],
    reference_rail_audio: ReferenceRailAudio,
    correlations: dict[str, CorrelationEstimate],
) -> dict[str, Any]:
    input_id = entry["inputId"]
    inspection = inspections.get(input_id)
    extraction = extractions.get(input_id)
    correlation = correlations.get(input_id)
    warnings = collect_input_warnings(
        entry,
        resolutions.get(input_id),
        inspection,
        extraction,
    )

    if correlation:
        warnings.extend(correlation.warnings)
        estimated_offset_ms = correlation.estimated_offset_ms
        confidence = correlation.confidence
        if correlation.score > 0:
            warnings.append(
                "offset estimated with waveform correlation v0; drift not estimated"
            )
    elif extraction and extraction.path and reference_rail_audio.path is None:
        warnings.append("offset estimation blocked because reference rail audio is missing")
        estimated_offset_ms = 0
        confidence = 0.04
    elif extraction and extraction.path:
        warnings.append("offset estimation unavailable")
        estimated_offset_ms = 0
        confidence = 0.06
    elif inspection and not inspection.has_audio:
        warnings.append("offset estimation blocked because no audio stream was found")
        estimated_offset_ms = 0
        confidence = 0.02
    else:
        warnings.append("offset estimation blocked because no extracted audio is available")
        estimated_offset_ms = 0
        confidence = 0.05

    return {
        "role": entry["role"],
        "inputId": input_id,
        "fileName": entry.get("fileName", f"{entry['role']}.placeholder"),
        "estimatedOffsetMs": estimated_offset_ms,
        "confidence": confidence,
        "driftPpm": 0,
        "warnings": unique_strings(warnings),
    }


def get_best_duration_ms(entry: dict[str, Any], inspection: MediaInspection | None) -> int:
    if inspection and inspection.duration_ms is not None:
        return inspection.duration_ms
    return int(entry.get("durationMs") or 0)


def collect_input_warnings(
    entry: dict[str, Any],
    resolution: LocalMediaResolution | None,
    inspection: MediaInspection | None,
    extraction: AudioExtraction | None,
) -> list[str]:
    warnings: list[str] = []

    if resolution:
        warnings.extend(resolution.warnings)
    elif "durationMs" not in entry:
        warnings.append("metadata-only input without local media")

    if inspection:
        warnings.extend(inspection.warnings)
    elif resolution and resolution.path is not None:
        warnings.append("local media was resolved but not inspected")

    if extraction:
        warnings.extend(extraction.warnings)

    return warnings


def unique_strings(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if value and value not in seen:
            result.append(value)
            seen.add(value)
    return result


def safe_file_part(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9._-]+", "-", value).strip(".-_") or "input"


if __name__ == "__main__":
    raise SystemExit(main())
