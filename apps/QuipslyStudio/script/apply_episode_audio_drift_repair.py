#!/usr/bin/env python3
"""Create a versioned session with source-aware audio drift corrections.

This tool never edits media or overwrites its input session. It consumes the
machine-readable report produced by episode_audio_drift_audit.py and adjusts
only camera-lane timeline offsets whose scratch audio proves a stable offset
error against the refined host stem.
"""

from __future__ import annotations

import argparse
import copy
import datetime as dt
import json
import os
import re
import tempfile
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--session", required=True, type=Path)
    parser.add_argument("--audit", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--max-drift-seconds-per-minute", type=float, default=0.02)
    parser.add_argument("--neighbor-tolerance-seconds", type=float, default=0.10)
    return parser.parse_args()


def load_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        value = json.load(handle)
    if not isinstance(value, dict):
        raise ValueError(f"Expected a JSON object: {path}")
    return value


def active_lanes(session: dict) -> list[dict]:
    active_id = session.get("activeSequenceId")
    project = session.get("project")
    sequences = project.get("sequences") if isinstance(project, dict) else None
    if not active_id or not isinstance(sequences, list):
        raise ValueError("Session is missing activeSequenceId or sequences.")
    sequence = next(
        (candidate for candidate in sequences if candidate.get("id") == active_id),
        None,
    )
    if sequence is None or not isinstance(sequence.get("lanes"), list):
        raise ValueError("Active sequence or its lanes are missing.")
    return sequence["lanes"]


def inferred_from_neighbors(index: int, candidates: list[dict], tolerance: float) -> bool:
    current = candidates[index]
    if current.get("trustedCheckpointCount", 0) >= 2:
        return False
    role = current.get("role")
    residual = float(current.get("measuredResidualSeconds", 0.0))
    neighbors: list[dict] = []
    for direction in (-1, 1):
        cursor = index + direction
        while 0 <= cursor < len(candidates):
            candidate = candidates[cursor]
            if candidate.get("role") == role and candidate.get("status") == "fail":
                neighbors.append(candidate)
                break
            cursor += direction
    return (
        len(neighbors) == 2
        and all(candidate.get("trustedCheckpointCount", 0) >= 2 for candidate in neighbors)
        and all(
            abs(float(candidate.get("measuredResidualSeconds", 0.0)) - residual)
            <= tolerance
            for candidate in neighbors
        )
    )


def versioned_title(value: object, output: Path) -> object:
    if not isinstance(value, str):
        return value
    match = re.search(r"v(\d+)", output.stem, flags=re.IGNORECASE)
    if not match:
        return value
    version = int(match.group(1))
    if re.search(r"v\d+", value, flags=re.IGNORECASE):
        return re.sub(r"v\d+", f"v{version:03d}", value, count=1, flags=re.IGNORECASE)
    return f"{value} v{version:03d}"


def atomic_write(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        raise FileExistsError(f"Refusing to overwrite existing output: {path}")
    descriptor, temporary = tempfile.mkstemp(
        prefix=f".{path.name}.", suffix=".tmp", dir=path.parent
    )
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(value, handle, indent=2, ensure_ascii=True)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    except Exception:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass
        raise


def main() -> int:
    args = parse_args()
    source_path = args.session.expanduser().resolve()
    audit_path = args.audit.expanduser().resolve()
    output_path = args.output.expanduser().resolve()
    if source_path == output_path:
        raise ValueError("Output must be a new versioned session path.")

    source = load_json(source_path)
    audit = load_json(audit_path)
    reported_source = audit.get("sessionPath")
    if reported_source and Path(reported_source).expanduser().resolve() != source_path:
        raise ValueError("Audit report belongs to a different session.")
    if audit.get("status") != "fail":
        raise ValueError("Audit does not contain repairable hard stops.")

    repaired = copy.deepcopy(source)
    lanes_by_id = {lane.get("id"): lane for lane in active_lanes(repaired)}
    audit_lanes = audit.get("lanes")
    if not isinstance(audit_lanes, list):
        raise ValueError("Audit lanes are missing.")

    corrections: list[dict] = []
    for index, finding in enumerate(audit_lanes):
        if finding.get("status") != "fail":
            continue
        drift = abs(float(finding.get("driftSecondsPerMinute", 0.0)))
        if drift > args.max_drift_seconds_per_minute:
            raise ValueError(
                f"{finding.get('lane')} has true clock drift ({drift:.4f}s/min); "
                "a fixed offset repair would be unsafe."
            )
        trusted = int(finding.get("trustedCheckpointCount", 0))
        inferred = inferred_from_neighbors(
            index, audit_lanes, args.neighbor_tolerance_seconds
        )
        if trusted < 2 and not inferred:
            raise ValueError(
                f"{finding.get('lane')} lacks enough trusted evidence for automatic repair."
            )
        lane_id = finding.get("laneId")
        lane = lanes_by_id.get(lane_id)
        if lane is None:
            raise ValueError(f"Audit lane is absent from session: {lane_id}")
        source_video = lane.get("sourceVideo")
        if not isinstance(source_video, dict):
            raise ValueError(f"Camera lane has no sourceVideo metadata: {finding.get('lane')}")
        old_offset = float(source_video.get("offset", 0.0))
        adjustment = float(finding.get("measuredResidualSeconds", 0.0))
        new_offset = old_offset + adjustment
        source_video["offset"] = round(new_offset, 6)
        corrections.append(
            {
                "laneId": lane_id,
                "lane": finding.get("lane"),
                "oldOffsetSeconds": old_offset,
                "adjustmentSeconds": adjustment,
                "newOffsetSeconds": round(new_offset, 6),
                "trustedCheckpointCount": trusted,
                "evidence": "neighbor-consensus" if inferred else "checkpoint-consensus",
            }
        )

    if not corrections:
        raise ValueError("No eligible corrections were found.")

    generated_at = dt.datetime.now(dt.timezone.utc).isoformat()
    project = repaired.get("project")
    if not isinstance(project, dict):
        raise ValueError("Session project is missing.")
    project["title"] = versioned_title(project.get("title"), output_path)
    repaired["savedAt"] = generated_at
    repair_receipt = {
        "schemaVersion": 1,
        "generatedAt": generated_at,
        "sourceSessionPath": str(source_path),
        "sourceAuditPath": str(audit_path),
        "method": "camera-scratch-audio-to-refined-host-stem",
        "corrections": corrections,
    }
    repaired["syncRepair"] = repair_receipt

    atomic_write(output_path, repaired)
    receipt_path = output_path.with_suffix(output_path.suffix + ".sync-repair.json")
    atomic_write(receipt_path, repair_receipt)
    print(
        json.dumps(
            {
                "status": "created",
                "output": str(output_path),
                "receipt": str(receipt_path),
                "correctionCount": len(corrections),
                "corrections": corrections,
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
