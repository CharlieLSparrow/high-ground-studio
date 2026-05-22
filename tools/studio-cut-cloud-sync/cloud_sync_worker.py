#!/usr/bin/env python3
"""Studio Cut cloud sync worker contract stub.

This stub validates the sync-job JSON shape and prints the planned worker steps.
It intentionally does not require Firebase credentials or process real media yet.
"""

from __future__ import annotations

import argparse
import json
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


@dataclass(frozen=True)
class ValidationResult:
    errors: list[str]
    warnings: list[str]

    @property
    def ok(self) -> bool:
        return not self.errors


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Validate a Studio Cut cloud sync job and print planned steps.",
    )
    parser.add_argument("--sync-job-json", required=True, help="Path to sync job JSON.")
    parser.add_argument(
        "--out-sync-report",
        dest="out_sync_report",
        help="Optional path to write a placeholder sync report JSON.",
    )
    parser.add_argument(
        "--out",
        dest="out_sync_report",
        help="Optional path to write a placeholder sync report JSON.",
    )
    args = parser.parse_args()

    sync_job_path = Path(args.sync_job_json)
    sync_job = load_json(sync_job_path)
    validation = validate_sync_job(sync_job)

    print("Studio Cut cloud sync worker stub")
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

    print("\nPlanned worker steps:")
    for index, step in enumerate(build_worker_plan(sync_job), start=1):
        print(f"  {index}. {step}")

    if args.out_sync_report:
        report_path = Path(args.out_sync_report)
        report = build_placeholder_sync_report(sync_job)
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        print(f"\nWrote placeholder sync report: {report_path}")

    return 0


def load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise SystemExit(f"{path} must contain a JSON object.")
    return value


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


def build_worker_plan(sync_job: dict[str, Any]) -> list[str]:
    sync_job_id = sync_job.get("syncJobId", "unknown-sync-job")
    uploaded_inputs = sync_job.get("uploadedInputs", [])

    return [
        f"Read sync job {sync_job_id} from Firestore.",
        f"Download {len(uploaded_inputs)} uploaded Storage object(s) to worker scratch space.",
        "Extract audio waveforms with ffmpeg for every audio/video input.",
        "Sort phoneReferenceAudio pieces by orderIndex, then file name.",
        "Build a continuous reference rail from the phone/reference pieces.",
        "Cross-correlate Homer/Charlie video and clean audio against the reference rail.",
        "Estimate per-input offsets and drift confidence.",
        "Generate timeline-aligned low-res intermediate proxies.",
        "Compose outputs/source-monitor-proxy.mp4 for browser editing.",
        "Write outputs/episode-manifest.json and outputs/sync-report.json.",
        "Write shared room metadata under studioCutProjects/{projectId}/branches/{branchId}/room/meta.",
        "Set sync job status to ready, or failed with errorMessage.",
    ]


def build_placeholder_sync_report(sync_job: dict[str, Any]) -> dict[str, Any]:
    uploaded_inputs = [
        entry
        for entry in sync_job.get("uploadedInputs", [])
        if isinstance(entry, dict) and entry.get("role") in VALID_INPUT_ROLES
    ]
    reference_segments = build_placeholder_reference_segments(uploaded_inputs)
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
            "warnings": [
                "Placeholder reference rail only; no media analysis was run.",
            ],
        },
        "trackOffsets": [
            {
                "inputId": entry.get("inputId", f"{entry['role']}-placeholder"),
                "role": entry["role"],
                "fileName": entry.get("fileName", f"{entry['role']}.placeholder"),
                "estimatedOffsetMs": 0,
                "driftPpm": 0,
                "confidence": 0.1,
                "warnings": [
                    "Placeholder worker stub only; no media analysis was run.",
                ],
            }
            for entry in uploaded_inputs
            if entry.get("role") != "phoneReferenceAudio"
        ],
        "globalWarnings": [
            "Generated by the Studio Cut cloud sync worker stub.",
            "No FFmpeg extraction or cross-correlation was run.",
        ],
    }


def build_placeholder_reference_segments(
    uploaded_inputs: list[dict[str, Any]],
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
        duration_ms = int(reference_input.get("durationMs") or 0)
        segment = {
            "inputId": reference_input.get("inputId", "phone-reference-placeholder"),
            "fileName": reference_input.get("fileName", "phone-reference.placeholder"),
            "railStartMs": rail_start_ms,
            "sourceStartMs": 0,
            "durationMs": duration_ms,
            "confidence": 0.1,
            "warnings": [
                "Placeholder reference segment; order only, no waveform sync.",
            ],
        }

        if segments:
            segment["gapBeforeMs"] = 0

        segments.append(segment)
        rail_start_ms += duration_ms

    return segments


if __name__ == "__main__":
    raise SystemExit(main())
