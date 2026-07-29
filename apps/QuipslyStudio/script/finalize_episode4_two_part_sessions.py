#!/usr/bin/env python3
"""Build final, versioned Episode 4 Part 1/Part 2 sessions.

This tool does not render or mutate source media. It promotes already-corrected
session branches, measures the authored transition assets, and makes the
transition/copyright-window contracts explicit in session metadata.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import uuid
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


PART1_TRANSITION_ROLE = "part_1_cliffhanger"
PART2_TRANSITION_ROLE = "part_2_recap"
WATCHED_CLIP_ROLE = "reference_clip"
PART1_TRANSITION_START = 3344.104
PART2_TRANSITION_START = 650.0

# Four brief visual quotations. Host dialogue remains the only program audio.
OFFICE_WINDOWS = (
    (2677.920, 6.200),
    (2694.800, 6.500),
    (2720.700, 5.500),
    (2751.500, 6.500),
)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def save_json(path: Path, payload: dict[str, Any]) -> None:
    if path.exists():
        raise FileExistsError(f"Refusing to overwrite existing session: {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True)
        handle.write("\n")


def probe_duration(path: Path) -> float:
    if not path.is_file() or path.stat().st_size <= 0:
        raise FileNotFoundError(f"Transition media is missing or empty: {path}")
    result = subprocess.run(
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
    duration = float(result.stdout.strip())
    if duration <= 0:
        raise ValueError(f"Transition media has invalid duration: {path}")
    return duration


def active_sequence(session: dict[str, Any]) -> dict[str, Any]:
    active_id = session["activeSequenceId"]
    return next(
        sequence
        for sequence in session["project"]["sequences"]
        if sequence["id"] == active_id
    )


def lane_role(lane: dict[str, Any]) -> str:
    return str((lane.get("metadata") or {}).get("role") or "")


def require_lane(sequence: dict[str, Any], role: str) -> dict[str, Any]:
    matches = [lane for lane in sequence["lanes"] if lane_role(lane) == role]
    if len(matches) != 1:
        raise ValueError(f"Expected one lane with role {role!r}; found {len(matches)}")
    return matches[0]


def set_transition_lane(
    lane: dict[str, Any],
    *,
    media_path: Path,
    duration: float,
    offset: float,
    source_label: str,
) -> None:
    media_url = media_path.resolve().as_uri()
    lane.setdefault("metadata", {})
    lane["metadata"].update(
        {
            "assetFingerprint": str(uuid.uuid5(uuid.NAMESPACE_URL, media_url)).upper(),
            "declaredExists": True,
            "ignoreForProduction": False,
            "isPremiereRescue": False,
            "mediaKind": "video",
            "originalPath": str(media_path),
            "sourcePath": str(media_path),
            "vaultProxyPath": str(media_path),
            "sourceLabel": source_label,
        }
    )
    source_video = lane.setdefault("sourceVideo", {})
    source_video.update(
        {
            "duration": duration,
            "mediaURL": media_url,
            "offset": offset,
            "proxyURL": media_url,
        }
    )
    lane["tags"] = [
        {
            "id": str(uuid.uuid4()).upper(),
            "startTime": 0.0,
            "duration": duration,
            "type": "Active",
        }
    ]


def upsert_transition_decision(
    sequence: dict[str, Any], lane_id: str, start: float, end: float, label: str
) -> None:
    decisions = sequence.setdefault("programDecisions", [])
    decisions[:] = [
        decision
        for decision in decisions
        if not (
            abs(float(decision.get("startTime", -9999)) - start) < 0.001
            or start < float(decision.get("startTime", -9999)) < end
        )
    ]
    decisions.append(
        {
            "id": str(uuid.uuid4()).upper(),
            "startTime": start,
            "kind": "custom",
            "sourceLaneIDs": [lane_id],
            "clipLaneID": lane_id,
            "clipMotion": "playing",
            "audioPolicy": "selectedSources",
            "audioSourceLaneIDs": [lane_id],
            "actor": "Codex Producer - authored transition contract",
            "createdAt": now_iso(),
        }
    )
    # The explicit skip prevents the authored clip from visually or audibly
    # leaking through a later sequence-time gap.
    decisions.append(
        {
            "id": str(uuid.uuid4()).upper(),
            "startTime": end,
            "kind": "skip",
            "sourceLaneIDs": [],
            "audioPolicy": "silence",
            "actor": "Codex Producer - transition boundary",
            "createdAt": now_iso(),
        }
    )
    decisions.sort(key=lambda item: float(item.get("startTime", 0)))


def set_transition_keep_range(
    sequence: dict[str, Any], start: float, end: float, reason: str
) -> None:
    branch = sequence.setdefault("branchMetadata", {})
    ranges = branch.setdefault("programKeepRanges", [])
    retained = []
    for item in ranges:
        item_start = float(item.get("startTime", 0))
        item_end = float(item.get("endTime", 0))
        if item_end <= start + 0.001 or item_start >= end - 0.001:
            retained.append(item)
    retained.append({"startTime": start, "endTime": end, "reason": reason})
    retained.sort(key=lambda item: float(item.get("startTime", 0)))
    branch["programKeepRanges"] = retained


def replace_watched_clip_tags(sequence: dict[str, Any]) -> None:
    lane = require_lane(sequence, WATCHED_CLIP_ROLE)
    source = lane.get("sourceVideo") or {}
    offset = float(source.get("offset", 0))
    duration = float(source.get("duration", 0))
    local_windows = [
        (max(0.0, start - offset), length) for start, length in OFFICE_WINDOWS
    ]
    tags: list[dict[str, Any]] = []
    cursor = 0.0
    for start, length in local_windows:
        if start > cursor:
            tags.append(
                {
                    "id": str(uuid.uuid4()).upper(),
                    "startTime": cursor,
                    "duration": start - cursor,
                    "type": "Cut",
                }
            )
        tags.append(
            {
                "id": str(uuid.uuid4()).upper(),
                "startTime": start,
                "duration": length,
                "type": "Active",
            }
        )
        cursor = start + length
    if cursor < duration:
        tags.append(
            {
                "id": str(uuid.uuid4()).upper(),
                "startTime": cursor,
                "duration": duration - cursor,
                "type": "Cut",
            }
        )
    lane["tags"] = tags


def tighten_office_program_windows(sequence: dict[str, Any]) -> None:
    clip_lane = require_lane(sequence, WATCHED_CLIP_ROLE)
    clip_lane_id = clip_lane["id"]
    decisions = sequence.setdefault("programDecisions", [])
    starts_to_ends = {round(start, 3): start + duration for start, duration in OFFICE_WINDOWS}

    for decision in decisions:
        start = round(float(decision.get("startTime", -1)), 3)
        if start in starts_to_ends and decision.get("clipLaneID") == clip_lane_id:
            decision["audioPolicy"] = "hostMix"
            decision.pop("audioSourceLaneIDs", None)
            decision["actor"] = "Codex Producer - commentary-led minimal quotation"
            decision["createdAt"] = now_iso()

    for start, duration in OFFICE_WINDOWS:
        end = start + duration
        existing = min(
            (
                item
                for item in decisions
                if item.get("kind") == "skip"
                and abs(float(item.get("startTime", -1)) - end) < 15.0
                and float(item.get("startTime", -1)) > start
            ),
            key=lambda item: abs(float(item["startTime"]) - end),
            default=None,
        )
        if existing is None:
            existing = {
                "id": str(uuid.uuid4()).upper(),
                "kind": "skip",
                "sourceLaneIDs": [],
            }
            decisions.append(existing)
        existing.update(
            {
                "startTime": end,
                "audioPolicy": "hostMix",
                "actor": "Codex Producer - copyright-aware visual quotation boundary",
                "createdAt": now_iso(),
            }
        )

    decisions.sort(key=lambda item: float(item.get("startTime", 0)))
    replace_watched_clip_tags(sequence)
    branch = sequence.setdefault("branchMetadata", {})
    branch["copyrightAwareClipContract"] = {
        "sourceLaneId": clip_lane_id,
        "sourceAudioIncluded": False,
        "totalQuotedVisualSeconds": round(sum(item[1] for item in OFFICE_WINDOWS), 3),
        "sequenceWindows": [
            {"startTime": start, "duration": duration}
            for start, duration in OFFICE_WINDOWS
        ],
        "humanReview": "Upload privately and inspect Content ID before publication.",
        "updatedAt": now_iso(),
    }


def update_session_identity(
    session: dict[str, Any], *, title: str, branch_name: str, source_path: Path
) -> None:
    sequence = active_sequence(session)
    sequence["title"] = title
    branch = sequence.setdefault("branchMetadata", {})
    branch.update(
        {
            "branchName": branch_name,
            "branchStatus": "render-candidate",
            "updatedAt": now_iso(),
            "finalizationSourceSession": str(source_path),
        }
    )
    session["savedAt"] = now_iso()


def manifest_contract(manifest: dict[str, Any], actual_duration: float) -> dict[str, Any]:
    declared = float(manifest.get("outputDurationSeconds", 0))
    if abs(declared - actual_duration) > 0.08:
        raise ValueError(
            f"Transition manifest duration {declared:.3f}s does not match media "
            f"duration {actual_duration:.3f}s"
        )
    return {
        "kind": manifest.get("kind"),
        "version": manifest.get("version"),
        "outputClip": manifest.get("outputClip"),
        "measuredDurationSeconds": actual_duration,
        "announcements": [
            text
            for text in (
                manifest.get("voiceText"),
                manifest.get("introAnnouncement"),
                manifest.get("outroAnnouncement"),
            )
            if text
        ],
        "voiceDelayMilliseconds": manifest.get("voiceDelayMilliseconds"),
        "postRecapBreathSeconds": manifest.get("postRecapBreathSeconds"),
        "verifiedAt": now_iso(),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--part1-session", required=True, type=Path)
    parser.add_argument("--part2-session", required=True, type=Path)
    parser.add_argument("--cliffhanger-manifest", required=True, type=Path)
    parser.add_argument("--recap-manifest", required=True, type=Path)
    parser.add_argument("--part1-output", required=True, type=Path)
    parser.add_argument("--part2-output", required=True, type=Path)
    parser.add_argument("--receipt-output", required=True, type=Path)
    args = parser.parse_args()

    part1 = deepcopy(load_json(args.part1_session))
    part2 = deepcopy(load_json(args.part2_session))
    cliff_manifest = load_json(args.cliffhanger_manifest)
    recap_manifest = load_json(args.recap_manifest)
    cliff_path = Path(cliff_manifest["outputClip"])
    recap_path = Path(recap_manifest["outputClip"])
    cliff_duration = probe_duration(cliff_path)
    recap_duration = probe_duration(recap_path)

    part1_sequence = active_sequence(part1)
    part1_lane = require_lane(part1_sequence, PART1_TRANSITION_ROLE)
    set_transition_lane(
        part1_lane,
        media_path=cliff_path,
        duration=cliff_duration,
        offset=PART1_TRANSITION_START,
        source_label="Full authored Locutus / To Be Continued interstitial; clip-only picture and audio with explicit measured duration.",
    )
    part1_end = PART1_TRANSITION_START + cliff_duration
    upsert_transition_decision(
        part1_sequence,
        part1_lane["id"],
        PART1_TRANSITION_START,
        part1_end,
        "To be continued.",
    )
    set_transition_keep_range(
        part1_sequence,
        PART1_TRANSITION_START,
        part1_end,
        "Close Part 1 with the complete measured Locutus / To Be Continued interstitial and its spoken announcement.",
    )
    tighten_office_program_windows(part1_sequence)
    update_session_identity(
        part1,
        title="Episode 4 Part 1 - Kindness Is Structural - Producer v023 Final Candidate",
        branch_name="Episode 4 Part 1 - Producer v023 Final Candidate",
        source_path=args.part1_session,
    )
    part1_sequence["branchMetadata"]["transitionContract"] = manifest_contract(
        cliff_manifest, cliff_duration
    )

    part2_sequence = active_sequence(part2)
    part2_lane = require_lane(part2_sequence, PART2_TRANSITION_ROLE)
    set_transition_lane(
        part2_lane,
        media_path=recap_path,
        duration=recap_duration,
        offset=PART2_TRANSITION_START,
        source_label="Authored three-beat opening: Last Time On, complete recap thought, and And Now The Conclusion, with measured breathing room.",
    )
    part2_end = PART2_TRANSITION_START + recap_duration
    upsert_transition_decision(
        part2_sequence,
        part2_lane["id"],
        PART2_TRANSITION_START,
        part2_end,
        "Last time on High Ground Odyssey. And now, the conclusion.",
    )
    set_transition_keep_range(
        part2_sequence,
        PART2_TRANSITION_START,
        part2_end,
        "Open Part 2 with the complete measured Last Time On recap and And Now The Conclusion announcement.",
    )
    update_session_identity(
        part2,
        title="Episode 4 Part 2 - Incentives, Intent, and Time - Producer v014 Final Candidate",
        branch_name="Episode 4 Part 2 - Producer v014 Final Candidate",
        source_path=args.part2_session,
    )
    part2_sequence["branchMetadata"]["transitionContract"] = manifest_contract(
        recap_manifest, recap_duration
    )

    save_json(args.part1_output, part1)
    save_json(args.part2_output, part2)

    receipt = {
        "schemaVersion": 1,
        "kind": "episode-4-two-part-finalization-receipt",
        "generatedAt": now_iso(),
        "sourceMediaMutated": False,
        "part1": {
            "sourceSession": str(args.part1_session),
            "outputSession": str(args.part1_output),
            "transitionStart": PART1_TRANSITION_START,
            "transitionEnd": part1_end,
            "transition": manifest_contract(cliff_manifest, cliff_duration),
            "officeQuotedVisualSeconds": round(sum(item[1] for item in OFFICE_WINDOWS), 3),
            "officeSourceAudioIncluded": False,
        },
        "part2": {
            "sourceSession": str(args.part2_session),
            "outputSession": str(args.part2_output),
            "transitionStart": PART2_TRANSITION_START,
            "transitionEnd": part2_end,
            "transition": manifest_contract(recap_manifest, recap_duration),
        },
        "renderGate": "Load each output session, prove Program transition playback and host sync, then render separately.",
    }
    save_json(args.receipt_output, receipt)
    print(json.dumps(receipt, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
