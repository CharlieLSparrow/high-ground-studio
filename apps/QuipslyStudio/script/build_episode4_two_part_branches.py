#!/usr/bin/env python3
"""Create two source-aware Episode 4 producer branches without duplicating source media."""

from __future__ import annotations

import argparse
import copy
import datetime as dt
import json
import subprocess
import uuid
from pathlib import Path
from typing import Any


DEFAULT_BASE_SESSION = Path(
    "/Users/wall-e/Library/Application Support/Quipsly/MediaVault/sessions/"
    "episode-4-program-track-v014-sync-corrected.quipsly-session.json"
)
DEFAULT_SESSION_ROOT = Path(
    "/Users/wall-e/Library/Application Support/Quipsly/MediaVault/sessions"
)
DEFAULT_PRODUCTION_ROOT = Path(
    "/Volumes/My Passport/Quipsly Media Vault/production/episode-4/two-part"
)
DEFAULT_OFFICE_SPACE_PATH = Path(
    "/Users/wall-e/Desktop/Podcast/4/OfficeSpace-Motivation-I-Just-Dont-Care.mp4"
)


def new_id() -> str:
    return str(uuid.uuid4()).upper()


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def media_duration(path: Path) -> float:
    completed = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return float(completed.stdout.strip())


def intersect_ranges(
    ranges: list[dict[str, Any]],
    lower: float | None,
    upper: float | None,
) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for item in ranges:
        start = float(item["startTime"])
        end = float(item["endTime"])
        if lower is not None:
            start = max(start, lower)
        if upper is not None:
            end = min(end, upper)
        if end - start > 0.001:
            clipped = copy.deepcopy(item)
            clipped["startTime"] = start
            clipped["endTime"] = end
            result.append(clipped)
    return result


def branch_sequence(
    source: dict[str, Any],
    title: str,
    purpose: str,
    parent_sequence_id: str,
    keep_ranges: list[dict[str, Any]],
    created_at: str,
) -> dict[str, Any]:
    sequence = copy.deepcopy(source)
    sequence["id"] = new_id()
    sequence["title"] = title
    metadata = copy.deepcopy(sequence.get("branchMetadata") or {})
    metadata.update(
        {
            "branchId": new_id(),
            "branchName": title,
            "branchPurpose": purpose,
            "branchRole": "longform",
            "branchStatus": "active",
            "createdAt": created_at,
            "createdBy": "Codex Producer",
            "parentSequenceId": parent_sequence_id,
            "programKeepRanges": keep_ranges,
            "updatedAt": created_at,
        }
    )
    sequence["branchMetadata"] = metadata
    return sequence


def add_cliffhanger_lane(
    sequence: dict[str, Any],
    clip_path: Path,
    split_time: float,
    created_at: str,
) -> float:
    # The source includes a trailing credit frame. Part 1 intentionally ends on
    # the To Be Continued card, so the branch owns only the first 30 seconds.
    duration = min(media_duration(clip_path), 30.0)
    cliffhanger_end = split_time + duration
    sequence["programDecisions"] = [
        decision
        for decision in sequence.get("programDecisions", [])
        if not (split_time <= float(decision["startTime"]) < cliffhanger_end)
    ]
    lane_id = new_id()
    media_id = new_id()
    clip_uri = clip_path.resolve().as_uri()
    sequence["lanes"].append(
        {
            "id": lane_id,
            "metadata": {
                "assetFingerprint": new_id(),
                "declaredExists": True,
                "ignoreForProduction": False,
                "isPremiereRescue": False,
                "mediaKind": "video",
                "originalPath": str(clip_path),
                "role": "part_1_cliffhanger",
                "sourceAssetId": "episode-4-part-1-locutus-cliffhanger",
                "sourceLabel": (
                    "Versioned derived cliffhanger media. The source episode and the original "
                    "Locutus clip remain untouched."
                ),
                "sourcePath": str(clip_path),
                "trackIds": ["part-1-cliffhanger"],
                "vaultProxyPath": str(clip_path),
            },
            "name": "Part 1 cliffhanger - Locutus / To Be Continued",
            "sourceVideo": {
                "duration": duration,
                "id": media_id,
                "is360": False,
                "mediaURL": clip_uri,
                "offset": split_time,
                "proxyURL": clip_uri,
            },
            "tags": [
                {
                    "duration": duration,
                    "id": new_id(),
                    "startTime": 0,
                    "type": "Active",
                }
            ],
        }
    )

    for lane in sequence["lanes"]:
        metadata = lane.get("metadata") or {}
        if metadata.get("mediaKind") == "audio" and lane["id"] != lane_id:
            lane.setdefault("tags", []).append(
                {
                    "duration": duration,
                    "id": new_id(),
                    "startTime": split_time,
                    "type": "Cut",
                }
            )

    sequence.setdefault("programDecisions", []).append(
        {
            "actor": "Codex Producer",
            "createdAt": created_at,
            "id": new_id(),
            "kind": "primary",
            "clipLaneID": lane_id,
            "audioPolicy": "selectedSources",
            "audioSourceLaneIDs": [lane_id],
            "sourceLaneIDs": [lane_id],
            "startTime": split_time,
        }
    )
    sequence["programDecisions"].sort(key=lambda item: float(item["startTime"]))
    return duration


def add_office_space_slot(
    sequence: dict[str, Any],
    expected_path: Path,
    sequence_offset: float,
) -> None:
    lane_id = new_id()
    media_id = new_id()
    source_uri = expected_path.resolve().as_uri()
    sequence["lanes"].append(
        {
            "id": lane_id,
            "metadata": {
                "assetFingerprint": new_id(),
                "declaredExists": expected_path.exists(),
                "ignoreForProduction": not expected_path.exists(),
                "isPremiereRescue": False,
                "mediaKind": "video",
                "originalPath": str(expected_path),
                "role": "reference_clip",
                "sourceAssetId": "episode-4-part-2-office-space-motivation",
                "sourceLabel": (
                    "Part 2 source slot for the Office Space motivation scene: "
                    "'It's not that I'm lazy; it's that I just don't care.' Relink the exact "
                    "source before the producer clip-weave pass."
                ),
                "sourcePath": str(expected_path),
                "trackIds": ["part-2-office-space-motivation"],
            },
            "name": "Part 2 source slot - Office Space motivation scene",
            "sourceVideo": {
                "duration": 90.0,
                "id": media_id,
                "is360": False,
                "mediaURL": source_uri,
                "offset": sequence_offset,
            },
            "tags": [
                {
                    "duration": 90.0,
                    "id": new_id(),
                    "startTime": 0,
                    "type": "Active",
                }
            ],
        }
    )


def add_recap_lane(
    sequence: dict[str, Any],
    clip_path: Path,
    sequence_offset: float,
    created_at: str,
) -> float:
    duration = media_duration(clip_path)
    recap_end = sequence_offset + duration
    sequence["programDecisions"] = [
        decision
        for decision in sequence.get("programDecisions", [])
        if not (sequence_offset <= float(decision["startTime"]) < recap_end)
    ]
    lane_id = new_id()
    media_id = new_id()
    clip_uri = clip_path.resolve().as_uri()
    sequence["lanes"].append(
        {
            "id": lane_id,
            "metadata": {
                "assetFingerprint": new_id(),
                "declaredExists": True,
                "ignoreForProduction": False,
                "isPremiereRescue": False,
                "mediaKind": "video",
                "originalPath": str(clip_path),
                "role": "part_2_recap",
                "sourceAssetId": "episode-4-part-2-last-time-on-recap",
                "sourceLabel": (
                    "Versioned derived recap sourced from the corrected Episode 4 clock. "
                    "It intentionally repeats the Part 1 leadership payoff and pivot."
                ),
                "sourcePath": str(clip_path),
                "trackIds": ["part-2-last-time-on-recap"],
                "vaultProxyPath": str(clip_path),
            },
            "name": "Part 2 opening - Last Time on High Ground Odyssey",
            "sourceVideo": {
                "duration": duration,
                "id": media_id,
                "is360": False,
                "mediaURL": clip_uri,
                "offset": sequence_offset,
                "proxyURL": clip_uri,
            },
            "tags": [
                {
                    "duration": duration,
                    "id": new_id(),
                    "startTime": 0,
                    "type": "Active",
                }
            ],
        }
    )

    for lane in sequence["lanes"]:
        metadata = lane.get("metadata") or {}
        if metadata.get("mediaKind") == "audio" and lane["id"] != lane_id:
            lane.setdefault("tags", []).append(
                {
                    "duration": duration,
                    "id": new_id(),
                    "startTime": sequence_offset,
                    "type": "Cut",
                }
            )

    sequence.setdefault("programDecisions", []).append(
        {
            "actor": "Codex Producer",
            "createdAt": created_at,
            "id": new_id(),
            "kind": "primary",
            "clipLaneID": lane_id,
            "audioPolicy": "selectedSources",
            "audioSourceLaneIDs": [lane_id],
            "sourceLaneIDs": [lane_id],
            "startTime": sequence_offset,
        }
    )
    sequence["programDecisions"].sort(key=lambda item: float(item["startTime"]))
    return duration


def next_version(session_root: Path) -> int:
    version = 1
    while any(
        (session_root / f"episode-4-part-{part}-producer-v{version:03d}.quipsly-session.json").exists()
        for part in (1, 2)
    ):
        version += 1
    return version


def write_session(document: dict[str, Any], active_sequence_id: str, path: Path, saved_at: str) -> None:
    output = copy.deepcopy(document)
    output["activeSequenceId"] = active_sequence_id
    output["savedAt"] = saved_at
    path.write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-session", type=Path, default=DEFAULT_BASE_SESSION)
    parser.add_argument("--session-root", type=Path, default=DEFAULT_SESSION_ROOT)
    parser.add_argument("--production-root", type=Path, default=DEFAULT_PRODUCTION_ROOT)
    parser.add_argument("--cliffhanger", type=Path, required=True)
    parser.add_argument("--recap", type=Path, required=True)
    parser.add_argument("--office-space", type=Path, default=DEFAULT_OFFICE_SPACE_PATH)
    parser.add_argument("--part1-cut-time", type=float, default=3344.104)
    parser.add_argument("--part1-opening-start", type=float, default=681.7)
    parser.add_argument("--part1-opening-end", type=float, default=832.7018181818182)
    parser.add_argument("--part1-opening-pause-start", type=float, default=691.63)
    parser.add_argument("--part1-opening-pause-end", type=float, default=695.56)
    parser.add_argument("--part1-story-start", type=float, default=851.06)
    parser.add_argument("--part2-start-time", type=float, default=3347.635)
    parser.add_argument("--recap-sequence-offset", type=float, default=650.0)
    parser.add_argument("--office-space-offset", type=float, default=5206.10)
    args = parser.parse_args()

    if not args.base_session.is_file():
        raise SystemExit(f"Base session is missing: {args.base_session}")
    if not args.cliffhanger.is_file():
        raise SystemExit(f"Cliffhanger media is missing: {args.cliffhanger}")
    if not args.recap.is_file():
        raise SystemExit(f"Part 2 recap media is missing: {args.recap}")

    document = json.loads(args.base_session.read_text(encoding="utf-8"))
    active_id = document["activeSequenceId"]
    source_sequence = next(
        sequence for sequence in document["project"]["sequences"] if sequence["id"] == active_id
    )
    source_ranges = source_sequence["branchMetadata"]["programKeepRanges"]
    created_at = utc_now()

    version = next_version(args.session_root)
    version_label = f"v{version:03d}"
    part_1_ranges = intersect_ranges(source_ranges, None, args.part1_cut_time)
    # The aggressive v011 opening experiment left two editorial defects in the
    # inherited branch: a mid-word entrance on "book" and a 2.9-second orphan
    # before the manuscript. Part 1 is allowed to choose a calmer opening over
    # the same source baseline. Preserve the complete introduction through the
    # computer-science joke, remove the device-reset gap, then resume with the
    # clean manuscript entrance. Source media and the parent branch stay intact.
    part_1_ranges = [
        keep_range
        for keep_range in part_1_ranges
        if float(keep_range["startTime"]) >= args.part1_story_start
    ]
    part_1_ranges[0:0] = [
        {
            "startTime": args.part1_opening_start,
            "endTime": args.part1_opening_pause_start,
            "reason": "Keep the coherent opening through Charlie's 'me too' response.",
        },
        {
            "startTime": args.part1_opening_pause_end,
            "endTime": args.part1_opening_end,
            "reason": (
                "Resume on Homer's 'why are you excited?' after removing the "
                "four-second dead-air pause."
            ),
        },
    ]
    if part_1_ranges:
        part_1_ranges[-1]["reason"] = (
            "Land the complete kindness-as-leadership thesis and end exactly after "
            "'I'm gonna keep going' before the Part 1 cliffhanger."
        )
    part_2_ranges = intersect_ranges(source_ranges, args.part2_start_time, None)

    part_1 = branch_sequence(
        source_sequence,
        f"Episode 4 Part 1 - Kindness Is Structural - Producer {version_label}",
        (
            "Part 1 producer branch. Ends after kindness is established as a learnable "
            "leadership skill, then lands on the Locutus cliffhanger."
        ),
        active_id,
        part_1_ranges,
        created_at,
    )
    cliffhanger_duration = add_cliffhanger_lane(
        part_1, args.cliffhanger, args.part1_cut_time, created_at
    )
    part_1["branchMetadata"]["programKeepRanges"].append(
        {
            "startTime": args.part1_cut_time,
            "endTime": args.part1_cut_time + cliffhanger_duration,
            "reason": "Close Part 1 with the Locutus cliffhanger and original spoken stinger.",
        }
    )

    part_2 = branch_sequence(
        source_sequence,
        f"Episode 4 Part 2 - Incentives, Intent, and Time - Producer {version_label}",
        (
            "Part 2 producer branch. Opens on the natural second-grade pivot, carries "
            "incentives through intent and respecting time, and reserves the missing Office "
            "Space motivation clip for a source-aware weave."
        ),
        active_id,
        part_2_ranges,
        created_at,
    )
    recap_duration = add_recap_lane(
        part_2, args.recap, args.recap_sequence_offset, created_at
    )
    part_2["branchMetadata"]["programKeepRanges"].insert(
        0,
        {
            "startTime": args.recap_sequence_offset,
            "endTime": args.recap_sequence_offset + recap_duration,
            "reason": (
                "Open Part 2 with a Last Time on High Ground Odyssey recap built from "
                "the final Part 1 leadership payoff and the second-grade pivot."
            ),
        },
    )
    add_office_space_slot(part_2, args.office_space, args.office_space_offset)

    document["project"]["sequences"].extend([part_1, part_2])
    args.session_root.mkdir(parents=True, exist_ok=True)
    args.production_root.mkdir(parents=True, exist_ok=True)
    part_1_path = args.session_root / (
        f"episode-4-part-1-producer-v{version:03d}.quipsly-session.json"
    )
    part_2_path = args.session_root / (
        f"episode-4-part-2-producer-v{version:03d}.quipsly-session.json"
    )
    write_session(document, part_1["id"], part_1_path, created_at)
    write_session(document, part_2["id"], part_2_path, created_at)

    manifest = {
        "schemaVersion": 1,
        "kind": "episode-4-two-part-producer-split",
        "createdAt": created_at,
        "sourceSession": str(args.base_session),
        "sourceSequenceId": active_id,
        "part1CutSourceTime": args.part1_cut_time,
        "part2MainStartSourceTime": args.part2_start_time,
        "splitEditorialEvidence": {
            "part1Ending": "That's such good conversation. I'm gonna keep going.",
            "part2Recap": "Being a leader is a skill that can be learned ... we're only to the second grade here.",
            "part2MainOpening": "So, my second-grade teacher attempted quiet time.",
            "manuscriptBoundary": "First Grade / Psychological Safety -> Second Grade / Incentives",
        },
        "part1": {
            "session": str(part_1_path),
            "sequenceId": part_1["id"],
            "cliffhanger": str(args.cliffhanger),
            "cliffhangerDuration": cliffhanger_duration,
        },
        "part2": {
            "session": str(part_2_path),
            "sequenceId": part_2["id"],
            "recap": str(args.recap),
            "recapDuration": recap_duration,
            "officeSpaceClipExpectedAt": str(args.office_space),
            "officeSpaceSequenceOffset": args.office_space_offset,
            "officeSpaceSourceStatus": "available" if args.office_space.exists() else "relink-required",
        },
        "sourceMediaMutated": False,
    }
    manifest_path = args.production_root / f"episode-4-two-part-producer-v{version:03d}.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
