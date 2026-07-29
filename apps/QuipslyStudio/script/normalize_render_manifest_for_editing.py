#!/usr/bin/env python3
"""Collapse renderer-sized chunks into human-sized editorial decisions.

This is intentionally stricter than "same camera twice." Chunks merge only
when sequence time, source time, output frames, range identity, and media path
are continuous. The source render manifest remains untouched.
"""

from __future__ import annotations

import argparse
import copy
import json
from datetime import datetime, timezone
from pathlib import Path


def close(left: float, right: float, tolerance: float) -> bool:
    return abs(left - right) <= tolerance


def can_merge(left: dict, right: dict, tolerance: float) -> bool:
    if left.get("sourceId") != right.get("sourceId"):
        return False
    if left.get("renderPath") != right.get("renderPath"):
        return False
    if left.get("sourcePath") != right.get("sourcePath"):
        return False
    if left.get("rangeIndex") != right.get("rangeIndex"):
        return False
    if not close(float(left["sequenceEnd"]), float(right["sequenceStart"]), tolerance):
        return False
    expected_source_start = float(left["sourceStart"]) + float(left["duration"])
    if not close(expected_source_start, float(right["sourceStart"]), tolerance):
        return False
    if int(left["outputEndFrame"]) != int(right["outputStartFrame"]):
        return False
    return True


def normalize_chunks(chunks: list[dict], tolerance: float) -> list[dict]:
    normalized: list[dict] = []
    for raw in chunks:
        chunk = copy.deepcopy(raw)
        chunk["rendererChunkIndices"] = [int(raw["index"])]
        chunk["rendererPictureDecisionIds"] = [str(raw.get("pictureDecisionId", ""))]
        chunk["rendererPictureDecisionReasons"] = [
            str(raw.get("pictureDecisionReason", ""))
        ]
        if normalized and can_merge(normalized[-1], chunk, tolerance):
            previous = normalized[-1]
            previous["sequenceEnd"] = chunk["sequenceEnd"]
            previous["duration"] = round(
                float(previous["sequenceEnd"]) - float(previous["sequenceStart"]), 6
            )
            previous["outputEndFrame"] = chunk["outputEndFrame"]
            previous["outputFrameCount"] = (
                int(previous["outputEndFrame"]) - int(previous["outputStartFrame"])
            )
            previous["outputDurationSeconds"] = round(
                float(previous["outputFrameCount"]) / 30.0, 6
            )
            previous["rendererChunkIndices"].extend(chunk["rendererChunkIndices"])
            previous["rendererPictureDecisionIds"].extend(
                chunk["rendererPictureDecisionIds"]
            )
            previous["rendererPictureDecisionReasons"].extend(
                chunk["rendererPictureDecisionReasons"]
            )
            previous["pictureDecisionId"] = (
                f"editorial-coalesced-{len(normalized) - 1:04d}"
            )
            previous["pictureDecisionReason"] = "continuous-same-source"
            previous["pictureDecisionConfidence"] = min(
                float(previous.get("pictureDecisionConfidence", 1.0)),
                float(chunk.get("pictureDecisionConfidence", 1.0)),
            )
            previous["pictureDecisionParentId"] = None
        else:
            normalized.append(chunk)

    for index, chunk in enumerate(normalized):
        chunk["index"] = index
    return normalized


def assert_equivalent(original: list[dict], normalized: list[dict]) -> None:
    if not original or not normalized:
        raise ValueError("Manifest chunk list cannot be empty")
    if float(original[0]["sequenceStart"]) != float(normalized[0]["sequenceStart"]):
        raise ValueError("Normalization changed first sequence time")
    if float(original[-1]["sequenceEnd"]) != float(normalized[-1]["sequenceEnd"]):
        raise ValueError("Normalization changed last sequence time")
    if int(original[0]["outputStartFrame"]) != int(normalized[0]["outputStartFrame"]):
        raise ValueError("Normalization changed first output frame")
    if int(original[-1]["outputEndFrame"]) != int(normalized[-1]["outputEndFrame"]):
        raise ValueError("Normalization changed last output frame")

    flattened = [
        index
        for chunk in normalized
        for index in chunk["rendererChunkIndices"]
    ]
    expected = [int(chunk["index"]) for chunk in original]
    if flattened != expected:
        raise ValueError("Normalization lost or reordered renderer chunks")

    original_frames = sum(int(chunk["outputFrameCount"]) for chunk in original)
    normalized_frames = sum(int(chunk["outputFrameCount"]) for chunk in normalized)
    if original_frames != normalized_frames:
        raise ValueError(
            f"Normalization changed output frame total: {original_frames} -> "
            f"{normalized_frames}"
        )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--receipt", type=Path, required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--title", required=True)
    parser.add_argument("--tolerance", type=float, default=0.05)
    args = parser.parse_args()

    if not args.input.is_file():
        raise FileNotFoundError(args.input)
    for output_path in (args.output, args.receipt):
        if output_path.exists():
            raise FileExistsError(
                f"Refusing to overwrite versioned output: {output_path}"
            )
        output_path.parent.mkdir(parents=True, exist_ok=True)

    payload = json.loads(args.input.read_text(encoding="utf-8"))
    original_chunks = payload.get("chunks")
    if not isinstance(original_chunks, list) or not original_chunks:
        raise ValueError("Render manifest has no chunks")
    normalized_chunks = normalize_chunks(original_chunks, args.tolerance)
    assert_equivalent(original_chunks, normalized_chunks)

    branch = payload.setdefault("branch", {})
    source_version = str(branch.get("id", "unknown"))
    branch["id"] = args.version
    branch["title"] = args.title
    branch["editorialTradeoff"] = (
        str(branch.get("editorialTradeoff", ""))
        + " Renderer-sized contiguous chunks were coalesced into human-sized "
        "editorial decisions without changing frame order, source choice, "
        "source timing, keep ranges, or rendered artifacts."
    ).strip()
    branch["warning"] = (
        "Editable metadata normalization only. The original render manifest and "
        "all source media remain untouched."
    )
    payload["chunks"] = normalized_chunks
    payload["editorialNormalization"] = {
        "schemaVersion": "quipsly.editorial-manifest-normalization.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sourceManifestPath": str(args.input),
        "sourceRenderVersion": source_version,
        "normalizedRenderVersion": args.version,
        "originalChunkCount": len(original_chunks),
        "editorialDecisionCount": len(normalized_chunks),
        "mergedChunkCount": len(original_chunks) - len(normalized_chunks),
        "continuityToleranceSeconds": args.tolerance,
        "sourcePolicy": (
            "The source manifest and media are immutable. This derived manifest "
            "only coalesces provably contiguous same-source renderer chunks."
        ),
    }
    args.output.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

    receipt = copy.deepcopy(payload["editorialNormalization"])
    receipt["outputManifestPath"] = str(args.output)
    receipt["sourceChunkCoverage"] = "complete_and_ordered"
    receipt["outputFrameCoverage"] = "identical"
    args.receipt.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(receipt, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
