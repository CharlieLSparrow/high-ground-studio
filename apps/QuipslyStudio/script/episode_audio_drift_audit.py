#!/usr/bin/env python3
"""Measure camera-scratch-audio drift against refined per-host episode stems."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse

import numpy as np


SAMPLE_RATE = 4000
ENVELOPE_RATE = 100
CHECKPOINT_SECONDS = 18.0
SEARCH_RADIUS_SECONDS = 35.0
WARN_RESIDUAL_SECONDS = 0.10
FAIL_RESIDUAL_SECONDS = 0.25


@dataclass
class Checkpoint:
    source_time: float
    predicted_timeline_time: float
    measured_timeline_time: float
    residual_seconds: float
    confidence: float


def object_tree(value: Any):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from object_tree(child)
    elif isinstance(value, list):
        for child in value:
            yield from object_tree(child)


def active_sequence(session: dict[str, Any]) -> dict[str, Any]:
    active_id = session.get("activeSequenceId")
    candidates = [item for item in object_tree(session) if isinstance(item.get("programDecisions"), list)]
    for candidate in candidates:
        if candidate.get("id") == active_id or candidate.get("sequenceId") == active_id:
            return candidate
    if not candidates:
        raise RuntimeError("No sequence with program decisions was found.")
    return max(candidates, key=lambda item: len(item.get("programDecisions", [])))


def as_path(value: Any) -> Path | None:
    if not isinstance(value, str) or not value:
        return None
    if value.startswith("file://"):
        parsed = urlparse(value)
        return Path(unquote(parsed.path))
    candidate = Path(value).expanduser()
    return candidate if candidate.is_absolute() else None


def first_media_path(value: Any, prefer_proxy: bool = False) -> Path | None:
    preferred = ["proxyURL", "vaultProxyPath", "rawURL", "sourceURL", "localPath", "path", "url"]
    if not prefer_proxy:
        preferred = ["rawURL", "sourceURL", "localPath", "path", "url", "proxyURL", "vaultProxyPath"]
    objects = list(object_tree(value)) if isinstance(value, (dict, list)) else []
    for key in preferred:
        for item in objects:
            candidate = as_path(item.get(key))
            if candidate and candidate.exists() and candidate.is_file():
                return candidate
    return None


def number_at(value: dict[str, Any], names: list[str], default: float = 0.0) -> float:
    for item in object_tree(value):
        for name in names:
            candidate = item.get(name)
            if isinstance(candidate, (int, float)) and math.isfinite(float(candidate)):
                return float(candidate)
    return default


def duration(path: Path) -> float:
    command = [
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", str(path),
    ]
    output = subprocess.check_output(command, text=True).strip()
    return float(output)


def pcm(path: Path, start: float, length: float) -> np.ndarray:
    command = [
        "ffmpeg", "-v", "error", "-ss", f"{max(0.0, start):.6f}", "-i", str(path),
        "-t", f"{max(0.05, length):.6f}", "-vn", "-ac", "1", "-ar", str(SAMPLE_RATE),
        "-f", "f32le", "pipe:1",
    ]
    return np.frombuffer(subprocess.check_output(command), dtype="<f4").astype(np.float64)


def envelope(samples: np.ndarray) -> np.ndarray:
    if samples.size == 0:
        return samples
    samples = samples - np.mean(samples)
    preemphasized = np.empty_like(samples)
    preemphasized[0] = samples[0]
    preemphasized[1:] = samples[1:] - 0.97 * samples[:-1]
    magnitude = np.abs(preemphasized)
    frame = max(1, SAMPLE_RATE // ENVELOPE_RATE)
    usable = (magnitude.size // frame) * frame
    if usable == 0:
        return np.array([], dtype=np.float64)
    values = np.sqrt(np.mean(np.square(magnitude[:usable].reshape(-1, frame)), axis=1))
    values -= np.mean(values)
    deviation = np.std(values)
    return values / deviation if deviation > 1e-9 else np.zeros_like(values)


def correlate(reference: np.ndarray, query: np.ndarray) -> tuple[int, float]:
    if reference.size < query.size or query.size < 10:
        raise RuntimeError("Audio window was too short for correlation.")
    full_length = reference.size + query.size - 1
    fft_length = 1 << (full_length - 1).bit_length()
    correlation_full = np.fft.irfft(
        np.fft.rfft(reference, fft_length) * np.fft.rfft(query[::-1], fft_length),
        fft_length,
    )[:full_length]
    correlation = correlation_full[query.size - 1 : reference.size]
    index = int(np.argmax(correlation))
    denominator = max(1.0, float(query.size))
    return index, float(correlation[index] / denominator)


def cached_envelope(media_path: Path, cache_dir: Path) -> np.ndarray:
    details = media_path.stat()
    key = hashlib.sha256(
        f"{media_path.resolve()}:{details.st_size}:{details.st_mtime_ns}:{SAMPLE_RATE}:{ENVELOPE_RATE}".encode()
    ).hexdigest()
    cache_path = cache_dir / f"{key}.npy"
    if cache_path.exists():
        return np.load(cache_path)
    cache_dir.mkdir(parents=True, exist_ok=True)
    values = envelope(pcm(media_path, 0.0, duration(media_path)))
    temporary = cache_path.with_suffix(".tmp.npy")
    np.save(temporary, values)
    temporary.replace(cache_path)
    return values


def strongest_residual_cluster(checkpoints: list[Checkpoint], tolerance: float = 0.5):
    if not checkpoints:
        return [], []
    best = max(
        (
            [other for other in checkpoints if abs(other.residual_seconds - candidate.residual_seconds) <= tolerance]
            for candidate in checkpoints
        ),
        key=lambda cluster: (sum(item.confidence for item in cluster), len(cluster)),
    )
    return best, [item for item in checkpoints if item not in best]


def role_for(label: str) -> str | None:
    lowered = label.lower()
    if "charlie" in lowered:
        return "charlie"
    if "homer" in lowered or "scott" in lowered:
        return "homer"
    return None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--session", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument(
        "--cache-dir",
        type=Path,
        default=Path.home() / "Library" / "Caches" / "Quipsly" / "AudioAnalysis",
    )
    args = parser.parse_args()

    session = json.loads(args.session.read_text())
    sequence = active_sequence(session)
    all_lanes = sequence.get("lanes") or []
    audio_lanes = [
        lane for lane in all_lanes
        if str((lane.get("metadata") or {}).get("mediaKind") or "").lower() == "audio"
    ]
    video_lanes = [
        lane for lane in all_lanes
        if str((lane.get("metadata") or {}).get("mediaKind") or "").lower() == "video"
    ]
    stems: dict[str, Path] = {}
    for lane in audio_lanes:
        role = role_for(
            " ".join(
                [
                    str(lane.get("label") or lane.get("name") or ""),
                    str((lane.get("metadata") or {}).get("role") or ""),
                ]
            )
        )
        candidate = first_media_path(lane)
        if role and candidate and ("refined" in str(lane).lower() or role not in stems):
            stems[role] = candidate

    results: list[dict[str, Any]] = []
    hard_stops: list[str] = []
    for required_role in ("charlie", "homer"):
        if required_role not in stems:
            hard_stops.append(f"Missing refined reference stem for {required_role}.")
    stem_envelopes = {
        role: cached_envelope(stem_path, args.cache_dir)
        for role, stem_path in stems.items()
    }
    for lane in video_lanes:
        label = str(lane.get("label") or lane.get("name") or lane.get("id") or "Unnamed video lane")
        role = role_for(
            f"{label} {str((lane.get('metadata') or {}).get('role') or '')}"
        )
        if role not in stems:
            continue
        source = first_media_path(lane, prefer_proxy=True)
        if not source:
            results.append({"lane": label, "role": role, "status": "missing-source-media"})
            hard_stops.append(f"{label}: source media unavailable")
            continue
        source_duration = duration(source)
        timeline_offset = number_at(
            lane,
            ["timelineOffset", "syncOffset", "sequenceOffset", "timelineStart", "offset"],
            0.0,
        )
        source_in = number_at(lane, ["sourceIn", "sourceStart", "trimStart"], 0.0)
        fractions = (0.12, 0.50, 0.88)
        checkpoints: list[Checkpoint] = []
        for fraction in fractions:
            source_time = max(0.0, min(source_duration - CHECKPOINT_SECONDS, source_duration * fraction))
            predicted = timeline_offset + source_time - source_in
            search_start = max(0.0, predicted - SEARCH_RADIUS_SECONDS)
            search_length = CHECKPOINT_SECONDS + 2 * SEARCH_RADIUS_SECONDS
            try:
                query = envelope(pcm(source, source_time, CHECKPOINT_SECONDS))
                reference_start = int(search_start * ENVELOPE_RATE)
                reference_end = int((search_start + search_length) * ENVELOPE_RATE)
                reference = stem_envelopes[role][reference_start:reference_end]
                index, confidence = correlate(reference, query)
                measured = search_start + index / ENVELOPE_RATE
                checkpoints.append(
                    Checkpoint(source_time, predicted, measured, measured - predicted, confidence)
                )
            except (RuntimeError, subprocess.CalledProcessError) as error:
                hard_stops.append(f"{label}: checkpoint {source_time:.1f}s failed: {error}")

        trusted, outliers = strongest_residual_cluster(checkpoints)
        residuals = [checkpoint.residual_seconds for checkpoint in trusted]
        weighted_confidence = sum(checkpoint.confidence for checkpoint in trusted)
        center_residual = float(np.median(residuals)) if residuals else float("inf")
        max_residual = abs(center_residual)
        drift_per_minute = 0.0
        if len(trusted) >= 2:
            x = np.array([checkpoint.source_time for checkpoint in trusted])
            y = np.array(residuals)
            drift_per_minute = float(np.polyfit(x, y, 1)[0] * 60.0)
        status = "pass"
        if not trusted or weighted_confidence < 0.5:
            status = "insufficient-evidence"
            hard_stops.append(f"{label}: insufficient correlation evidence")
        elif max_residual > FAIL_RESIDUAL_SECONDS or abs(drift_per_minute) > FAIL_RESIDUAL_SECONDS:
            status = "fail"
            hard_stops.append(
                f"{label}: residual {max_residual:.3f}s, drift {drift_per_minute:.3f}s/min"
            )
        elif max_residual > WARN_RESIDUAL_SECONDS or abs(drift_per_minute) > WARN_RESIDUAL_SECONDS:
            status = "warn"
        results.append(
            {
                "lane": label,
                "laneId": lane.get("id"),
                "role": role,
                "sourcePath": str(source),
                "referenceStemPath": str(stems[role]),
                "timelineOffsetSeconds": timeline_offset,
                "sourceInSeconds": source_in,
                "sourceDurationSeconds": round(source_duration, 6),
                "status": status,
                "measuredResidualSeconds": round(center_residual, 6),
                "maxResidualSeconds": round(max_residual, 6),
                "driftSecondsPerMinute": round(drift_per_minute, 6),
                "trustedCheckpointCount": len(trusted),
                "outlierCheckpointCount": len(outliers),
                "checkpoints": [
                    {**checkpoint.__dict__, "trusted": checkpoint in trusted}
                    for checkpoint in checkpoints
                ],
            }
        )

    if not results:
        hard_stops.append("No host camera lanes produced measurable sync evidence.")

    report = {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sessionPath": str(args.session.resolve()),
        "activeSequenceId": sequence.get("id") or sequence.get("sequenceId"),
        "status": "fail" if hard_stops else "pass",
        "rule": "Camera scratch audio is immutable sync evidence; refined stems are delivery audio.",
        "thresholds": {
            "warnResidualSeconds": WARN_RESIDUAL_SECONDS,
            "failResidualSeconds": FAIL_RESIDUAL_SECONDS,
        },
        "referenceStems": {role: str(value) for role, value in stems.items()},
        "lanes": results,
        "hardStops": hard_stops,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"status": report["status"], "output": str(args.output), "hardStops": len(hard_stops)}))
    raise SystemExit(1 if hard_stops else 0)


if __name__ == "__main__":
    main()
