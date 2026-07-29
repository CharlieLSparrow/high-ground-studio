#!/usr/bin/env python3
"""Emit proposal-only local editorial candidates for a Quipsly transcript.

Input must be JSON with canonical transcript segment IDs. Output matches
`LocalEditorialProposalEnvelope` in QuipslyVideoCore. The provider never edits
media or a Quipsly session and never materializes a Short.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path
from typing import Any


PROMPT_VERSION = "quipsly-local-editorial-segment-anchors-v1"
RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "candidates": {
            "type": "array",
            "maxItems": 3,
            "items": {
                "type": "object",
                "properties": {
                    "startSegmentID": {"type": "string"},
                    "endSegmentID": {"type": "string"},
                    "title": {"type": "string"},
                    "hook": {"type": "string"},
                    "reason": {"type": "string"},
                    "score": {"type": "number", "minimum": 0, "maximum": 1},
                },
                "required": [
                    "startSegmentID",
                    "endSegmentID",
                    "title",
                    "hook",
                    "reason",
                    "score",
                ],
                "additionalProperties": False,
            },
        },
    },
    "required": ["candidates"],
    "additionalProperties": False,
}


def as_float(value: Any, fallback: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def read_payload(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("Transcript payload must be a JSON object.")
    return payload


def canonical_segments(payload: dict[str, Any]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for index, row in enumerate(payload.get("segments") or []):
        if not isinstance(row, dict):
            continue
        segment_id = str(row.get("id") or row.get("segmentID") or "").strip()
        if not segment_id:
            raise ValueError(
                f"Transcript segment {index} has no canonical id; refusing to invent timeline identity."
            )
        try:
            uuid.UUID(segment_id)
        except ValueError as exc:
            raise ValueError(
                f"Transcript segment {index} id is not a UUID; refusing an app-incompatible proposal."
            ) from exc
        start = as_float(row.get("startTime"), as_float(row.get("start")))
        end = as_float(row.get("endTime"), as_float(row.get("end")))
        text = str(row.get("text") or "").strip()
        if end <= start or not text:
            continue
        result.append({
            "id": segment_id,
            "start": start,
            "end": end,
            "text": text,
            "speaker": str(row.get("speaker") or "Speaker"),
        })
    return sorted(result, key=lambda item: (item["start"], item["end"]))


def windows(segments: list[dict[str, Any]], window_seconds: float) -> list[list[dict[str, Any]]]:
    duration = max((row["end"] for row in segments), default=0.0)
    result: list[list[dict[str, Any]]] = []
    for index in range(max(1, math.ceil(duration / window_seconds))):
        start = index * window_seconds
        end = start + window_seconds
        rows = [
            row for row in segments
            if row["end"] > start and row["start"] < end
        ]
        if rows:
            result.append(rows)
    return result


def prompt_for(rows: list[dict[str, Any]], max_candidates: int) -> str:
    transcript = "\n".join(
        f"[{row['id']}] {row['speaker']}: {row['text']}"
        for row in rows
    )
    return f"""You are an editorial scout for a thoughtful two-host podcast.
Nominate at most {max_candidates} social-video excerpts that earn human review.

Prefer a self-contained story, surprising claim, useful insight, humor, tension,
or emotional payoff. The spoken opening should create curiosity quickly. Target
20-75 seconds. Quality beats quota.

Use only exact segment IDs printed below. Do not invent IDs or timestamps.
Software owns source-clock arithmetic and validates every range.

Return only JSON matching this schema:
{json.dumps(RESPONSE_SCHEMA, sort_keys=True)}

Transcript:
{transcript}
"""


def ollama_json(model: str, prompt: str, timeout_seconds: int) -> dict[str, Any]:
    request = urllib.request.Request(
        "http://127.0.0.1:11434/api/generate",
        data=json.dumps({
            "model": model,
            "prompt": prompt,
            "stream": False,
            "think": False,
            "format": RESPONSE_SCHEMA,
            "options": {
                "temperature": 0.15,
                "num_ctx": 8192,
                "num_predict": 700,
            },
        }).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
        envelope = json.loads(response.read().decode("utf-8"))
    result = json.loads(str(envelope.get("response") or "{}"))
    if not isinstance(result, dict):
        raise RuntimeError("Local model returned a non-object response.")
    return result


def validated_candidates(
    response: dict[str, Any],
    rows: list[dict[str, Any]],
    maximum_duration: float,
) -> list[dict[str, Any]]:
    by_id = {row["id"]: row for row in rows}
    result: list[dict[str, Any]] = []
    for candidate in response.get("candidates") or []:
        if not isinstance(candidate, dict):
            continue
        start_id = str(candidate.get("startSegmentID") or "")
        end_id = str(candidate.get("endSegmentID") or "")
        start = by_id.get(start_id)
        end = by_id.get(end_id)
        if start is None or end is None:
            print(
                f"Rejected invented/missing segment IDs: {start_id}-{end_id}",
                file=sys.stderr,
            )
            continue
        duration = end["end"] - start["start"]
        if duration <= 0 or duration > maximum_duration:
            print(
                f"Rejected invalid proposal duration {duration:.2f}s: {start_id}-{end_id}",
                file=sys.stderr,
            )
            continue
        result.append({
            "startSegmentID": start_id,
            "endSegmentID": end_id,
            "title": str(candidate.get("title") or "").strip(),
            "hook": str(candidate.get("hook") or "").strip(),
            "reason": str(candidate.get("reason") or "").strip(),
            "score": min(1.0, max(0.0, as_float(candidate.get("score"), 0.5))),
        })
    return result


def doctor(model: str) -> int:
    try:
        with urllib.request.urlopen("http://127.0.0.1:11434/api/tags", timeout=5) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, json.JSONDecodeError) as exc:
        print(json.dumps({"ready": False, "provider": "ollama", "error": str(exc)}))
        return 1
    names = [
        str(row.get("name") or "")
        for row in payload.get("models") or []
        if isinstance(row, dict)
    ]
    ready = model in names
    print(json.dumps({
        "ready": ready,
        "provider": "ollama",
        "model": model,
        "installedModels": names,
    }))
    return 0 if ready else 1


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("transcript", type=Path, nargs="?")
    parser.add_argument("--model", default="qwen3:8b")
    parser.add_argument("--window-seconds", type=float, default=600)
    parser.add_argument("--max-candidates-per-window", type=int, default=3)
    parser.add_argument("--maximum-duration", type=float, default=100)
    parser.add_argument("--max-windows", type=int)
    parser.add_argument("--timeout-seconds", type=int, default=300)
    parser.add_argument("--doctor", action="store_true")
    args = parser.parse_args()

    if args.doctor:
        return doctor(args.model)
    if args.transcript is None:
        parser.error("transcript is required unless --doctor is used")
    if not 1 <= args.max_candidates_per_window <= 3:
        parser.error("--max-candidates-per-window must be between 1 and 3")

    segments = canonical_segments(read_payload(args.transcript))
    transcript_windows = windows(segments, args.window_seconds)
    if args.max_windows is not None:
        transcript_windows = transcript_windows[:max(0, args.max_windows)]

    candidates: list[dict[str, Any]] = []
    started = time.monotonic()
    for index, rows in enumerate(transcript_windows, start=1):
        response = ollama_json(
            args.model,
            prompt_for(rows, args.max_candidates_per_window),
            args.timeout_seconds,
        )
        candidates.extend(
            validated_candidates(response, rows, args.maximum_duration)
        )
        print(
            f"Processed editorial window {index}/{len(transcript_windows)}",
            file=sys.stderr,
        )

    print(json.dumps({
        "schemaVersion": "quipsly.local-editorial-proposals.v1",
        "provider": "ollama",
        "model": args.model,
        "promptVersion": PROMPT_VERSION,
        "candidates": candidates,
        "metrics": {
            "elapsedSeconds": round(time.monotonic() - started, 3),
            "windowCount": len(transcript_windows),
            "segmentCount": len(segments),
        },
        "truth": {
            "status": "proposal-not-applied",
            "sourceFilesMutated": False,
            "sessionMutated": False,
            "shortsCreated": False,
        },
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
