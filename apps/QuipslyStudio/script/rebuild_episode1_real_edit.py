#!/usr/bin/env python3
"""
Build a clean Episode 1 Quipsly edit branch from whole synced lanes.

This is intentionally not a Premiere reconstruction script. It creates a
metadata-first Quipsly program map:

- whole source lanes stay whole
- inherited noisy SHOW/SKIP decisions are cleared first
- big unused regions become explicit SKIP overlays
- kept regions contain exactly one active video source at a time
- both podcast audio lanes remain active through kept regions

The result is a complete 30-40ish minute editorial draft that can be refined in
the native editor without pretending chopped Premiere clips are the source of
truth.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable


ROOT = Path(__file__).resolve().parents[1]
AGENTCTL = ROOT / "script" / "agentctl.sh"
OBSERVATIONS = ROOT / ".quipsly" / "agent-observations"

SAVE_NAME = "episode-1-codex-real-edit-v1"

CHARLIE_VIDEO = "Charlie Camera - MVI_3999.MP4"
HOMER_VIDEO = "Homer Camera - NewHomerExport.MP4"
REFERENCE_VIDEO = "Reference Clip - There is no try.mp4"
CHARLIE_AUDIO = "Charlie Audio - First Pod Ever.wav"
HOMER_AUDIO = "Homer Audio - HomerAudio.wav"

PRODUCTION_LANES = [
    CHARLIE_VIDEO,
    HOMER_VIDEO,
    REFERENCE_VIDEO,
    CHARLIE_AUDIO,
    HOMER_AUDIO,
]

VIDEO_LANES = [
    CHARLIE_VIDEO,
    HOMER_VIDEO,
    REFERENCE_VIDEO,
]

AUDIO_LANES = [
    CHARLIE_AUDIO,
    HOMER_AUDIO,
]


@dataclass(frozen=True)
class KeepSegment:
    title: str
    start: float
    end: float
    first_camera: str
    note: str

    @property
    def duration(self) -> float:
        return self.end - self.start


@dataclass(frozen=True)
class PlannedTag:
    lane: str
    tag: str
    start: float
    duration: float
    reason: str


KEEP_SEGMENTS = [
    KeepSegment(
        "Opening, preface, and Wednesday Rule setup",
        0.0,
        240.0,
        "charlie",
        "Keep the premise and establish the Episode 1 promise.",
    ),
    KeepSegment(
        "Farm work teaches stewardship",
        524.36,
        710.46,
        "homer",
        "Known short candidate anchor; keep the lesson and exchange around it.",
    ),
    KeepSegment(
        "Mutual mentorship and record-from-anywhere thread",
        755.63,
        946.86,
        "charlie",
        "Known short candidate anchor; good connective tissue for the audience.",
    ),
    KeepSegment(
        "Parkinson awareness and embodied stakes",
        1200.0,
        1425.0,
        "homer",
        "Keep a human-stakes section without letting the raw conversation sprawl.",
    ),
    KeepSegment(
        "Review candidate: downplay yourself",
        1572.0,
        1845.0,
        "charlie",
        "Known review/short range; preserve the stronger lesson arc.",
    ),
    KeepSegment(
        "Middle lesson pass",
        2100.0,
        2310.0,
        "homer",
        "Bridge the episode into later applications.",
    ),
    KeepSegment(
        "Identity changes behavior",
        3000.0,
        3180.0,
        "charlie",
        "Known short candidate; strong thesis-style moment.",
    ),
    KeepSegment(
        "Late-episode reflection",
        3600.0,
        3810.0,
        "homer",
        "Keep a compact late discussion beat instead of the whole raw stretch.",
    ),
    KeepSegment(
        "Things worth reading",
        4200.0,
        4425.0,
        "charlie",
        "Known anchor; book/research adjacency fits Quipsly and HGO. Charlie camera is the surviving visual source this late.",
    ),
    KeepSegment(
        "Final available closing synthesis",
        4500.0,
        4740.0,
        "charlie",
        "Give the episode a landing inside the available camera coverage instead of planning invisible video.",
    ),
]


def run_agentctl(args: list[str], *, capture_json: bool = False) -> dict | None:
    command = [str(AGENTCTL), *args]
    result = subprocess.run(
        command,
        cwd=ROOT,
        check=True,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if capture_json:
        return json.loads(result.stdout)
    return None


def wait_for_plan_application(save_name: str, previous_show_count: int | None, timeout_seconds: float = 20.0) -> dict:
    deadline = time.monotonic() + timeout_seconds
    last_state: dict = {}
    while time.monotonic() < deadline:
        last_state = run_agentctl(["state"], capture_json=True) or {}
        active_session = last_state.get("activeSessionName")
        last_action = str(last_state.get("lastMediaAction") or "")
        show_count = last_state.get("showDecisionCount")
        if active_session == save_name and (
            "Applied edit plan" in last_action
            or (previous_show_count is not None and show_count != previous_show_count)
        ):
            return last_state
        time.sleep(0.5)
    return last_state


def rounded(value: float) -> float:
    return round(value, 3)


def iter_skip_gaps(segments: Iterable[KeepSegment], duration: float) -> Iterable[tuple[float, float]]:
    cursor = 0.0
    for segment in sorted(segments, key=lambda item: item.start):
        if segment.start > cursor:
            yield rounded(cursor), rounded(segment.start - cursor)
        cursor = max(cursor, segment.end)
    if duration > cursor:
        yield rounded(cursor), rounded(duration - cursor)


def alternate_camera(first_camera: str) -> str:
    return "homer" if first_camera == "charlie" else "charlie"


def video_lane_for(camera: str) -> str:
    if camera == "charlie":
        return CHARLIE_VIDEO
    if camera == "homer":
        return HOMER_VIDEO
    raise ValueError(f"Unknown camera: {camera}")


def lane_availability(state: dict) -> dict[str, tuple[float, float]]:
    availability: dict[str, tuple[float, float]] = {}
    for lane in state.get("lanes", []) or []:
        name = lane.get("name")
        if not isinstance(name, str) or not name:
            continue
        duration = float(lane.get("duration") or 0)
        offset = float(lane.get("sourceOffset") or 0)
        if duration > 0:
            availability[name] = (offset, offset + duration)
    return availability


def is_available(lane: str, start: float, end: float, availability: dict[str, tuple[float, float]]) -> bool:
    lane_start, lane_end = availability.get(lane, (float("-inf"), float("inf")))
    return start >= lane_start and end <= lane_end


def best_available_camera(
    preferred: str,
    start: float,
    end: float,
    availability: dict[str, tuple[float, float]],
) -> str | None:
    choices = [preferred, alternate_camera(preferred)]
    for camera in choices:
        lane = video_lane_for(camera)
        if is_available(lane, start, end, availability):
            return camera
    for camera in ["charlie", "homer"]:
        lane = video_lane_for(camera)
        if is_available(lane, start, min(end, start + 0.5), availability):
            return camera
    return None


def build_plan(raw_duration: float, state: dict, shot_seconds: float = 42.0) -> list[PlannedTag]:
    tags: list[PlannedTag] = []
    availability = lane_availability(state)

    for gap_start, gap_duration in iter_skip_gaps(KEEP_SEGMENTS, raw_duration):
        if gap_duration < 0.05:
            continue
        for lane in PRODUCTION_LANES:
            tags.append(
                PlannedTag(
                    lane=lane,
                    tag="cut",
                    start=gap_start,
                    duration=gap_duration,
                    reason="Program skip gap: Play Edit should jump this raw section.",
                )
            )

    for segment in KEEP_SEGMENTS:
        for lane in AUDIO_LANES:
            tags.append(
                PlannedTag(
                    lane=lane,
                    tag="active",
                    start=rounded(segment.start),
                    duration=rounded(segment.duration),
                    reason=f"Keep both podcast audio lanes for: {segment.title}",
                )
            )

        camera = segment.first_camera
        cursor = segment.start
        shot_index = 0
        while cursor < segment.end - 0.05:
            shot_duration = min(shot_seconds, segment.end - cursor)
            available_camera = best_available_camera(camera, cursor, cursor + shot_duration, availability)
            if available_camera is None:
                cursor += shot_duration
                camera = alternate_camera(camera)
                shot_index += 1
                continue
            active_lane = video_lane_for(available_camera)
            for lane in VIDEO_LANES:
                tags.append(
                    PlannedTag(
                        lane=lane,
                        tag="active" if lane == active_lane else "cut",
                        start=rounded(cursor),
                        duration=rounded(shot_duration),
                        reason=(
                            f"{segment.title}: shot {shot_index + 1}, "
                            f"{available_camera} is the only active program video."
                        ),
                    )
                )
            camera = alternate_camera(camera)
            cursor += shot_duration
            shot_index += 1

    return tags


def summarize_state(state: dict) -> dict:
    return {
        "activeSessionName": state.get("activeSessionName"),
        "sequenceTitle": state.get("sequenceTitle"),
        "duration": state.get("duration"),
        "showDecisionCount": state.get("showDecisionCount"),
        "skipDecisionCount": state.get("skipDecisionCount"),
        "validRangeCount": state.get("validRangeCount"),
        "visualDecisionCount": state.get("visualDecisionCount"),
        "sourceSyncPassing": state.get("sourceSyncPassing"),
        "selectedLaneName": state.get("selectedLaneName"),
        "selectedTagType": state.get("selectedTagType"),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Rebuild Episode 1 as a clean Quipsly edit branch.")
    parser.add_argument("--execute", action="store_true", help="Actually mutate the running editor session.")
    parser.add_argument("--save-name", default=SAVE_NAME, help="Session name to save the rebuilt edit into.")
    parser.add_argument("--shot-seconds", type=float, default=42.0, help="Approximate live-switch shot length.")
    args = parser.parse_args()

    OBSERVATIONS.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    before = run_agentctl(["state"], capture_json=True) or {}
    raw_duration = float(before.get("duration") or 5400.0)
    plan = build_plan(raw_duration, before, shot_seconds=args.shot_seconds)
    planned_runtime = sum(segment.duration for segment in KEEP_SEGMENTS)
    backup_name = f"{before.get('activeSessionName') or 'episode-1'}-before-real-edit-rebuild-{stamp}"
    receipt_path = OBSERVATIONS / f"episode1-real-edit-rebuild-{stamp}.json"
    plan_path = OBSERVATIONS / f"episode1-real-edit-plan-{stamp}.json"
    plan_payload = {
        "name": "Episode 1 Codex real edit v1",
        "clearAllTags": True,
        "coordinateSpace": "sequence",
        "targetRuntimeSeconds": rounded(planned_runtime),
        "targetRuntimeMinutes": rounded(planned_runtime / 60.0),
        "sourceSession": before.get("activeSessionName"),
        "saveName": args.save_name,
        "editorialContract": [
            "Whole synced media lanes remain the source truth.",
            "Program output is driven by explicit SHOW/SKIP decisions.",
            "Only one video lane is active at a time unless a composed BOTH decision is deliberately authored.",
            "Both podcast audio lanes stay active through kept story sections.",
            "SKIP overlays mark raw sections that Play Edit should jump over."
        ],
        "keepSegments": [asdict(segment) | {"duration": rounded(segment.duration)} for segment in KEEP_SEGMENTS],
        "tags": [asdict(tag) for tag in plan],
    }
    plan_path.write_text(json.dumps(plan_payload, indent=2), encoding="utf-8")

    receipt = {
        "status": "dry-run",
        "createdAt": stamp,
        "saveName": args.save_name,
        "backupName": backup_name,
        "planPath": str(plan_path),
        "plannedRuntimeSeconds": rounded(planned_runtime),
        "plannedRuntimeMinutes": rounded(planned_runtime / 60.0),
        "rawDurationSeconds": rounded(raw_duration),
        "laneAvailability": {
            lane: [rounded(start), rounded(end)]
            for lane, (start, end) in lane_availability(before).items()
        },
        "keepSegments": [asdict(segment) | {"duration": rounded(segment.duration)} for segment in KEEP_SEGMENTS],
        "tagCount": len(plan),
        "activeVideoTagCount": sum(1 for tag in plan if tag.tag == "active" and tag.lane in VIDEO_LANES),
        "activeAudioTagCount": sum(1 for tag in plan if tag.tag == "active" and tag.lane in AUDIO_LANES),
        "skipTagCount": sum(1 for tag in plan if tag.tag == "cut"),
        "before": summarize_state(before),
    }

    if args.execute:
        receipt["status"] = "executing"
        run_agentctl(["save-session", backup_name])
        run_agentctl(["apply-edit-plan", str(plan_path), args.save_name, backup_name])
        after = wait_for_plan_application(
            args.save_name,
            before.get("showDecisionCount") if isinstance(before.get("showDecisionCount"), int) else None,
        )
        receipt["status"] = "applied"
        receipt["after"] = summarize_state(after)
    else:
        receipt["planPreview"] = [asdict(tag) for tag in plan[:20]]
        receipt["note"] = "Dry run only. Re-run with --execute to rebuild the running session."

    receipt_path.write_text(json.dumps(receipt, indent=2), encoding="utf-8")
    print(json.dumps({"receipt": str(receipt_path), **receipt}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
