#!/usr/bin/env python3
"""Studio Cut Rescue Sync worker v0.

The worker runs without cloud credentials. It can:
- validate a checked-in sync job JSON
- optionally resolve uploaded inputs to local media files
- inspect local media with ffprobe
- extract normalized mono 48 kHz WAV files with ffmpeg
- build an ordered phone-reference rail
- emit a sync report JSON

Offset estimation is intentionally not implemented yet.
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
        str(output_path),
    ]
    result = run_command(command)

    if result.returncode != 0:
        warnings.append(f"ffmpeg audio extraction failed: {result.stderr.strip()}")
        return AudioExtraction(input_id=input_id, path=None, warnings=warnings)

    return AudioExtraction(input_id=input_id, path=output_path, warnings=warnings)


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
        "Build a continuous reference rail from ordered phone/reference pieces.",
        "Cross-correlate Homer/Charlie video and clean audio against the reference rail. (Not implemented yet.)",
        "Estimate per-input offsets and drift confidence. (Not implemented yet.)",
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
            "warnings": build_reference_rail_warnings(reference_segments, local_mode),
        },
        "trackOffsets": [
            build_track_offset(entry, resolutions, inspections, extractions)
            for entry in uploaded_inputs
            if entry.get("role") != "phoneReferenceAudio"
        ],
        "globalWarnings": [
            "Offset estimation not implemented yet.",
            "Reference rail built from ordered phone pieces.",
            "Source-monitor proxy and Episode Manifest generation are not implemented yet.",
        ],
    }


def build_reference_segments(
    sync_job: dict[str, Any],
    uploaded_inputs: list[dict[str, Any]],
    resolutions: dict[str, LocalMediaResolution],
    inspections: dict[str, MediaInspection],
    extractions: dict[str, AudioExtraction],
) -> list[dict[str, Any]]:
    reference_inputs = sorted(
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
) -> list[str]:
    warnings = []
    if not local_mode:
        warnings.append("Metadata-only mode; media was not inspected.")
    if any(segment["durationMs"] == 0 for segment in reference_segments):
        warnings.append("One or more reference rail segments has no duration.")
    if any(segment["warnings"] for segment in reference_segments):
        warnings.append("One or more reference rail segments has warnings.")
    return warnings


def build_track_offset(
    entry: dict[str, Any],
    resolutions: dict[str, LocalMediaResolution],
    inspections: dict[str, MediaInspection],
    extractions: dict[str, AudioExtraction],
) -> dict[str, Any]:
    input_id = entry["inputId"]
    inspection = inspections.get(input_id)
    extraction = extractions.get(input_id)
    warnings = collect_input_warnings(
        entry,
        resolutions.get(input_id),
        inspection,
        extraction,
    )

    if extraction and extraction.path:
        warnings.append("audio extracted, offset estimation not implemented yet")
        confidence = 0.1
    elif inspection and not inspection.has_audio:
        warnings.append("offset estimation blocked because no audio stream was found")
        confidence = 0.02
    else:
        warnings.append("offset estimation not implemented yet")
        confidence = 0.05

    return {
        "role": entry["role"],
        "inputId": input_id,
        "fileName": entry.get("fileName", f"{entry['role']}.placeholder"),
        "estimatedOffsetMs": 0,
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
