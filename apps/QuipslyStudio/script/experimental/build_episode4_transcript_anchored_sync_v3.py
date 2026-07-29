#!/usr/bin/env python3
from __future__ import annotations

import copy
import json
import statistics
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote, urlparse


SESSION_IN = Path.home() / "Library/Application Support/Quipsly/MediaVault/sessions/episode-4-sync-baseline-v2.quipsly-session.json"
SESSION_OUT = Path.home() / "Library/Application Support/Quipsly/MediaVault/sessions/episode-4-sync-baseline-v3-transcript-anchored.quipsly-session.json"
SEARCH = Path(
    "/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-charlie-mov-transcript-sanity/"
    "20260709-002430/episode4-charlie-mov-offset-search.json"
)
REPORT_OUT = Path("reports/episode-4-sync-baseline-v3-transcript-anchored-report.json")
NS = uuid.UUID("4c843490-4b67-4cd8-891b-000000000004")


def stable_uuid(label: str) -> str:
    return str(uuid.uuid5(NS, label)).upper()


def file_url_to_path(value: str) -> Path:
    return Path(unquote(urlparse(value).path))


def source_name(lane: dict) -> str:
    metadata = lane.get("metadata") or {}
    if metadata.get("sourcePath"):
        return Path(metadata["sourcePath"]).name
    media_url = (lane.get("sourceVideo") or {}).get("mediaURL") or ""
    return file_url_to_path(media_url).name if media_url else lane.get("name", "")


def tag(tag_type: str, start: float, duration: float, label: str) -> dict:
    return {
        "id": stable_uuid(f"episode4-v3::{label}::{tag_type}::{start:.3f}::{duration:.3f}"),
        "type": tag_type,
        "startTime": round(max(0.0, start), 6),
        "duration": round(max(0.0, duration), 6),
    }


def strong_anchor_offsets(search: dict) -> dict[str, float]:
    by_source: dict[str, list[float]] = {}
    for anchor in search.get("anchors") or []:
        if anchor.get("anchorVerdict") != "strong-anchor":
            continue
        # Guard against tiny false positives like "Yes" matching "Yes."
        if float(anchor.get("jaccard") or 0.0) < 0.25 and float(anchor.get("sequenceRatio") or 0.0) < 0.35:
            continue
        if int(len(anchor.get("overlapWords") or [])) < 5:
            continue
        by_source.setdefault(anchor["sourceName"], []).append(float(anchor["impliedOffsetSeconds"]))
    return {source: round(statistics.median(values), 3) for source, values in by_source.items() if values}


def main() -> int:
    if not SESSION_IN.exists():
        raise SystemExit(f"Missing input session: {SESSION_IN}")
    if not SEARCH.exists():
        raise SystemExit(f"Missing transcript offset search: {SEARCH}")

    session = json.loads(SESSION_IN.read_text())
    search = json.loads(SEARCH.read_text())
    offsets = strong_anchor_offsets(search)
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    patched = copy.deepcopy(session)
    patched["savedAt"] = now
    patched["project"]["id"] = stable_uuid("project::episode-4-sync-baseline-v3-transcript-anchored")
    patched["project"]["title"] = "Episode 4 Sync Baseline v3 - Transcript Anchored"
    sequence = patched["project"]["sequences"][0]
    sequence["id"] = stable_uuid("sequence::episode-4-sync-baseline-v3-transcript-anchored")
    sequence["title"] = "Episode 4 Sync Baseline v3 - Transcript Anchored"
    patched["activeSequenceId"] = sequence["id"]
    sequence["editPassContext"] = {
        "label": "Episode 4 sync baseline v3 - transcript anchored",
        "actor": "Codex",
        "actorType": "agent",
        "passNumber": 3,
        "goal": "Repair Charlie phone-camera offsets using transcript anchors against the Charlie Ep4 spine. Preserve whole sources; do not claim final sync for unanchored sources.",
        "status": "active",
        "startedAt": now,
        "updatedAt": now,
    }
    sequence.setdefault("editCorrectionNotes", []).append(
        {
            "id": stable_uuid(f"episode4-v3-note::{now}"),
            "actor": "Codex",
            "actorType": "agent",
            "category": "sync-repair",
            "createdAt": now,
            "note": (
                "Transcript sanity check found v2 Charlie camera offsets were wrong. "
                "IMG_3749 and IMG_3751 now use strong transcript anchors. IMG_3746 is demoted to held/review because the sampled audio appears to be setup chatter or otherwise not present in the current spine transcript."
            ),
            "playhead": 0,
        }
    )

    lane_report = []
    for lane in sequence.get("lanes") or []:
        name = source_name(lane)
        metadata = lane.setdefault("metadata", {})
        source_video = lane.setdefault("sourceVideo", {})
        duration = float(source_video.get("duration") or 0.0)
        before = float(source_video.get("offset") or 0.0)
        action = "unchanged"

        if name in offsets:
            source_video["offset"] = offsets[name]
            metadata["ignoreForProduction"] = False
            sync = metadata.setdefault("syncV2", {})
            metadata["syncV3"] = {
                "offsetSeconds": offsets[name],
                "previousOffsetSeconds": before,
                "deltaSeconds": round(offsets[name] - before, 3),
                "syncSource": "transcript-anchor-search-against-charlie-spine",
                "confidence": "transcript-anchored-reviewable",
                "searchPath": str(SEARCH),
                "policy": "Whole source remains intact. Offset is repaired from transcript evidence and still needs visual/aural review before final edit decisions.",
            }
            sync["offsetSeconds"] = offsets[name]
            sync["confidence"] = "transcript-anchored-reviewable"
            sync["syncSource"] = "transcript-anchor-search-against-charlie-spine"
            lane["tags"] = [tag("Cut", 0, duration, lane.get("name") or name)] if duration > 0 else []
            action = "offset-repaired"

        elif name == "IMG_3746.MOV":
            metadata["ignoreForProduction"] = True
            metadata["syncV3"] = {
                "previousOffsetSeconds": before,
                "syncSource": "transcript-anchor-search-against-charlie-spine",
                "confidence": "held-no-reliable-transcript-anchor",
                "searchPath": str(SEARCH),
                "policy": "Do not use for program edit until a reliable anchor is found. The sampled audio looked like setup chatter absent from the current spine transcript.",
            }
            lane["tags"] = [tag("Cut", 0, duration, lane.get("name") or name)] if duration > 0 else []
            action = "held-for-review"

        lane_report.append(
            {
                "sourceName": name,
                "lane": lane.get("name"),
                "action": action,
                "beforeOffsetSeconds": round(before, 3),
                "afterOffsetSeconds": round(float(source_video.get("offset") or 0.0), 3),
                "durationSeconds": round(duration, 3),
                "ignoreForProduction": bool(metadata.get("ignoreForProduction")),
                "syncV3": metadata.get("syncV3"),
            }
        )

    sequence["metadata"] = {
        **(sequence.get("metadata") or {}),
        "syncBaselineV3TranscriptAnchored": {
            "createdAt": now,
            "sessionPath": str(SESSION_OUT),
            "searchPath": str(SEARCH),
            "reportPath": str(REPORT_OUT),
            "truth": "Transcript-anchored repair session. It is stronger than v2 for Charlie phone-camera offsets, but still not a final publication sync claim.",
        },
    }

    SESSION_OUT.write_text(json.dumps(patched, indent=2) + "\n")
    report = {
        "ok": True,
        "model": "episode-4-sync-baseline-v3-transcript-anchored",
        "createdAt": now,
        "inputSession": str(SESSION_IN),
        "outputSession": str(SESSION_OUT),
        "searchPath": str(SEARCH),
        "offsetsApplied": offsets,
        "laneReport": lane_report,
        "truth": {
            "sourceFilesMutated": False,
            "previousVersionsOverwritten": False,
            "finalSyncClaim": False,
            "timelineDecisionClaim": False,
            "wholeSourcesPreserved": True,
        },
        "nextActions": [
            "Load episode-4-sync-baseline-v3-transcript-anchored in Quipsly Studio.",
            "Scrub around 00:03:00, 01:40:30, and 01:46:40 to visually/aurally review IMG_3749 and IMG_3751 against the Program spine.",
            "Find a better anchor or ignore IMG_3746 unless a human confirms it belongs in the final edit.",
            "Do not promote source SHOW decisions until the source monitors prove sync in the app.",
        ],
    }
    REPORT_OUT.parent.mkdir(parents=True, exist_ok=True)
    REPORT_OUT.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
