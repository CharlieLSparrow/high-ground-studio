#!/usr/bin/env python3
"""Create a versioned Episode 4 picture map with visually verified reactions.

This script never edits a Quipsly session or media file. It splits a generated
speaker-aware decision map around a small set of reviewed listener reactions,
then resolves the exact whole-source lane that covers each reaction on the
shared episode clock.
"""

from __future__ import annotations

import argparse
import csv
import json
from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse


@dataclass(frozen=True)
class ReactionOverride:
    start: float
    end: float
    family: str
    parent_decision_id: str
    visual_note: str
    audio_note: str
    confidence: float


REACTIONS = (
    ReactionOverride(760.55, 762.25, "charlie", "ep4-picture-00030", "Charlie smiles while listening.", "Charlie silent; Homer active in 30 of 32 nearby analysis windows.", 0.88),
    ReactionOverride(897.90, 900.00, "charlie", "ep4-picture-00038", "Charlie gives a broad smile.", "Charlie silent; Homer active in 29 of 32 nearby analysis windows.", 0.95),
    ReactionOverride(948.60, 950.50, "charlie", "ep4-picture-00038", "Charlie smiles and briefly reacts.", "Homer remains primary; Charlie has brief contribution activity.", 0.91),
    ReactionOverride(4994.10, 4996.20, "charlie", "ep4-picture-00159", "Charlie looks up with an amused reaction.", "Charlie silent; Homer active in 32 of 32 nearby analysis windows.", 0.94),
    ReactionOverride(6301.20, 6303.50, "charlie", "ep4-picture-00217", "Charlie visibly laughs.", "Charlie silent; Homer active in 29 of 32 nearby analysis windows.", 0.98),
    ReactionOverride(6583.40, 6585.50, "homer", "ep4-picture-00230", "Homer smiles while listening.", "Homer silent; Charlie active in 31 of 32 nearby analysis windows.", 0.95),
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-map", required=True, type=Path)
    parser.add_argument("--session", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    return parser.parse_args()


def file_path(url_or_path: str | None) -> str | None:
    if not url_or_path:
        return None
    if url_or_path.startswith("file:"):
        return unquote(urlparse(url_or_path).path)
    return url_or_path


def load_json(path: Path) -> dict[str, Any]:
    with path.open() as handle:
        return json.load(handle)


def active_sequence(session: dict[str, Any]) -> dict[str, Any]:
    sequence_id = session.get("activeSequenceId")
    sequences = session["project"]["sequences"]
    return next((sequence for sequence in sequences if sequence.get("id") == sequence_id), sequences[0])


def source_lane(sequence: dict[str, Any], family: str, at: float) -> dict[str, Any]:
    wanted = f"{family}-primary-camera"
    matches: list[dict[str, Any]] = []
    for lane in sequence.get("lanes", []):
        if lane.get("metadata", {}).get("sourceFamilyId") != wanted:
            continue
        source = lane.get("sourceVideo")
        if not source:
            continue
        offset = float(source.get("offset", 0))
        duration = float(source.get("duration", 0))
        if offset <= at < offset + duration:
            matches.append(lane)
    if len(matches) != 1:
        raise RuntimeError(f"Expected one {family} camera at {at:.3f}s, found {len(matches)}")
    return matches[0]


def make_reaction_decision(
    reaction: ReactionOverride,
    lane: dict[str, Any],
) -> dict[str, Any]:
    source = lane["sourceVideo"]
    metadata = lane.get("metadata", {})
    offset = float(source.get("offset", 0))
    return {
        "startSeconds": reaction.start,
        "endSeconds": reaction.end,
        "durationSeconds": round(reaction.end - reaction.start, 3),
        "family": reaction.family,
        "reason": "visually-verified-listener-reaction",
        "confidence": reaction.confidence,
        "laneId": lane["id"],
        "sourceId": source["id"],
        "sourceFamilyId": metadata.get("sourceFamilyId"),
        "sourceSegmentIndex": metadata.get("sourceSegmentIndex"),
        "sourceSegmentCount": metadata.get("sourceSegmentCount"),
        "sourceName": lane.get("name"),
        "sourcePath": file_path(source.get("mediaURL")) or metadata.get("sourcePath"),
        "proxyPath": file_path(source.get("proxyURL")) or metadata.get("vaultProxyPath"),
        "sourceLocalStartSeconds": round(reaction.start - offset, 6),
        "sourceLocalEndSeconds": round(reaction.end - offset, 6),
        "parentDecisionId": reaction.parent_decision_id,
        "evidence": {
            "visualReview": reaction.visual_note,
            "audioActivity": reaction.audio_note,
            "reviewMethod": "paired same-clock proxy contact sheet",
        },
        "coverageConstrained": False,
        "needsVisualReactionReview": False,
    }


def split_decisions(
    decisions: list[dict[str, Any]],
    sequence: dict[str, Any],
) -> list[dict[str, Any]]:
    result = deepcopy(decisions)
    for reaction in REACTIONS:
        parent_index = next(
            (
                index
                for index, decision in enumerate(result)
                if float(decision["startSeconds"]) <= reaction.start
                and float(decision["endSeconds"]) >= reaction.end
            ),
            None,
        )
        if parent_index is None:
            raise RuntimeError(f"No base decision covers reaction {reaction.start:.3f}-{reaction.end:.3f}")
        parent = result.pop(parent_index)
        parent_id = parent.get("decisionId") or parent.get("parentDecisionId")
        if parent_id != reaction.parent_decision_id:
            raise RuntimeError(
                f"Reaction {reaction.start:.3f}s expected {reaction.parent_decision_id}, found {parent_id}"
            )
        fragments: list[dict[str, Any]] = []
        if float(parent["startSeconds"]) < reaction.start:
            before = deepcopy(parent)
            before["endSeconds"] = reaction.start
            before["durationSeconds"] = round(reaction.start - float(before["startSeconds"]), 3)
            before["sourceLocalEndSeconds"] = round(
                float(before["sourceLocalStartSeconds"]) + float(before["durationSeconds"]), 6
            )
            before["parentDecisionId"] = parent_id
            fragments.append(before)

        fragments.append(make_reaction_decision(reaction, source_lane(sequence, reaction.family, reaction.start)))

        if reaction.end < float(parent["endSeconds"]):
            after = deepcopy(parent)
            elapsed = reaction.end - float(parent["startSeconds"])
            after["startSeconds"] = reaction.end
            after["durationSeconds"] = round(float(after["endSeconds"]) - reaction.end, 3)
            after["sourceLocalStartSeconds"] = round(float(parent["sourceLocalStartSeconds"]) + elapsed, 6)
            after["parentDecisionId"] = parent_id
            fragments.append(after)

        result[parent_index:parent_index] = fragments

    result.sort(key=lambda decision: (float(decision["startSeconds"]), float(decision["endSeconds"])))
    for index, decision in enumerate(result, start=1):
        decision["decisionId"] = f"ep4-picture-v003-{index:05d}"
    return result


def validate(decisions: list[dict[str, Any]]) -> None:
    if not decisions:
        raise RuntimeError("No decisions produced")
    for previous, current in zip(decisions, decisions[1:]):
        gap = float(current["startSeconds"]) - float(previous["endSeconds"])
        if abs(gap) > 0.002:
            raise RuntimeError(
                f"Decision continuity failure after {previous['decisionId']}: {gap:+.6f}s"
            )
    for decision in decisions:
        if float(decision["durationSeconds"]) <= 0:
            raise RuntimeError(f"Non-positive decision {decision['decisionId']}")
        if decision["family"] != "gap" and not decision.get("proxyPath"):
            raise RuntimeError(f"Playable decision lacks proxy {decision['decisionId']}")


def write_csv(path: Path, decisions: list[dict[str, Any]]) -> None:
    fields = (
        "decisionId",
        "startSeconds",
        "endSeconds",
        "durationSeconds",
        "family",
        "reason",
        "confidence",
        "sourceName",
        "proxyPath",
        "parentDecisionId",
    )
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(decisions)


def main() -> None:
    args = parse_args()
    if args.output_dir.exists():
        raise SystemExit(f"Refusing to overwrite {args.output_dir}")

    base_map = load_json(args.input_map)
    session = load_json(args.session)
    sequence = active_sequence(session)
    decisions = split_decisions(base_map["decisions"], sequence)
    validate(decisions)

    output = deepcopy(base_map)
    output.update(
        {
            "schema": "quipsly.episode-picture-decisions.v003",
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "intent": "Speaker-aware picture map with visually verified listener reactions.",
            "promotionStatus": "needs-source-aware-proof-render",
            "sessionMutated": False,
            "originalMediaMutated": False,
            "parentMap": str(args.input_map),
            "reactionOverrides": [reaction.__dict__ for reaction in REACTIONS],
            "decisions": decisions,
            "summary": {
                **base_map.get("summary", {}),
                "decisionCount": len(decisions),
                "visuallyVerifiedReactionCount": len(REACTIONS),
                "minimumShotSeconds": round(min(float(item["durationSeconds"]) for item in decisions), 3),
                "maximumShotSeconds": round(max(float(item["durationSeconds"]) for item in decisions), 3),
            },
        }
    )

    args.output_dir.mkdir(parents=True)
    json_path = args.output_dir / "episode-4-professional-camera-decisions-with-reactions.json"
    csv_path = args.output_dir / "episode-4-professional-camera-decisions-with-reactions.csv"
    json_path.write_text(json.dumps(output, indent=2) + "\n")
    write_csv(csv_path, decisions)
    (args.output_dir / "README.md").write_text(
        "# Episode 4 visually reviewed camera map\n\n"
        f"- Parent map: `{args.input_map}`\n"
        f"- Active session: `{args.session}`\n"
        f"- Decisions: {len(decisions)}\n"
        f"- Visually verified listener reactions: {len(REACTIONS)}\n"
        "- Session mutated: no\n"
        "- Original media mutated: no\n"
        "- Status: source-aware proof render required before promotion\n"
    )
    print(json.dumps({"output": str(args.output_dir), "decisions": len(decisions), "reactions": len(REACTIONS)}, indent=2))


if __name__ == "__main__":
    main()
