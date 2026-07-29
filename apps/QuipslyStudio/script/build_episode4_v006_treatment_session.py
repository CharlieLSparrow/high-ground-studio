#!/usr/bin/env python3
"""Build an Episode 4 source-aware treatment/editorial session.

The producer-take manifest is evidence of editorial decisions, not a chopped
media model. This builder restores those decisions onto whole source lanes and
binds the selected equal-length Charlie, Homer, and reference stems to one clock.
It never modifies source media or prior renders.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_RUN_ROOT = Path(
    "/Volumes/My Passport/Episode_and_Shorts_Test/"
    "Episode_4_Sync_Producer_Takes/"
    "20260709-episode4-conformed-audio-baseline-v005-20260709-183059"
)
DEFAULT_BRANCH_MANIFEST = DEFAULT_RUN_ROOT / "take-a-main-public/manifest.json"
DEFAULT_STEM_ROOT = (
    DEFAULT_RUN_ROOT
    / "work/treatment-stems-v010-homer-rich-balanced-20260714"
)
DEFAULT_PROXY_ROOT = Path(
    "/Volumes/My Passport/Quipsly Media Vault/proxy/episode-4/v009"
)
DEFAULT_SESSION_ROOT = (
    Path.home()
    / "Library/Application Support/Quipsly/MediaVault/sessions"
)
DEFAULT_SESSION_NAME = "episode-4-v010-treatment-main-public-v011"
SEQUENCE_DURATION = 6799.943
NAMESPACE = uuid.UUID("ed4ef79a-c63d-48b1-897e-5233c0b1f638")

STEMS = (
    (
        "charlie-refined-treatment",
        "Charlie refined dialogue treatment",
        "charlie_dialogue_treatment",
        "charlie-contribution-gated.wav",
    ),
    (
        "homer-refined-treatment",
        "Homer refined dialogue treatment",
        "homer_dialogue_treatment",
        "homer-dji-contribution-gated.wav",
    ),
    (
        "reference-refined-treatment",
        "Reference clip audio treatment",
        "reference_audio_treatment",
        "reference-contribution-controlled.wav",
    ),
)

# Historical producer evidence named sequential recording files as camera A/B/C.
# Those labels are not editorial truth: Charlie used one primary camera split
# across six files, Homer used one primary camera split across two files, and
# ArtShow is a watched clip. Keep the historical manifest immutable and correct
# the semantics only when translating it into the living Quipsly session.
SOURCE_SEGMENTS: dict[str, dict[str, Any]] = {
    "charlie-3749": {
        "participant": "Charlie",
        "familyId": "charlie-primary-camera",
        "index": 1,
        "count": 6,
    },
    "charlie-3750": {
        "participant": "Charlie",
        "familyId": "charlie-primary-camera",
        "index": 2,
        "count": 6,
    },
    "charlie-3750b": {
        "participant": "Charlie",
        "familyId": "charlie-primary-camera",
        "index": 3,
        "count": 6,
    },
    "charlie-3750c": {
        "participant": "Charlie",
        "familyId": "charlie-primary-camera",
        "index": 4,
        "count": 6,
    },
    "charlie-3750-3": {
        "participant": "Charlie",
        "familyId": "charlie-primary-camera",
        "index": 5,
        "count": 6,
    },
    "charlie-3751": {
        "participant": "Charlie",
        "familyId": "charlie-primary-camera",
        "index": 6,
        "count": 6,
    },
    "homer-a": {
        "participant": "Homer",
        "familyId": "homer-primary-camera",
        "index": 1,
        "count": 2,
    },
    "homer-b": {
        "participant": "Homer",
        "familyId": "homer-primary-camera",
        "index": 2,
        "count": 2,
    },
}


def stable_uuid(label: str) -> str:
    return str(uuid.uuid5(NAMESPACE, label)).upper()


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def file_url(path: Path) -> str:
    return path.expanduser().resolve(strict=False).as_uri()


def file_state(path: Path) -> dict[str, Any]:
    try:
        stat = path.stat()
    except FileNotFoundError:
        return {
            "path": str(path),
            "exists": False,
            "materialized": False,
            "sizeBytes": 0,
            "allocatedBlocks": 0,
        }
    blocks = int(getattr(stat, "st_blocks", 0))
    return {
        "path": str(path),
        "exists": True,
        "materialized": stat.st_size == 0 or blocks > 0,
        "sizeBytes": stat.st_size,
        "allocatedBlocks": blocks,
    }


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def ffprobe_duration(path: Path) -> float | None:
    if not file_state(path)["materialized"]:
        return None
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
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return None
    try:
        return float(result.stdout.strip())
    except ValueError:
        return None


def source_proxy_path(proxy_root: Path, source_id: str) -> Path:
    return proxy_root / f"{source_id}-proxy-720p.mp4"


def video_lane(
    source: dict[str, Any],
    chunks: list[dict[str, Any]],
    proxy_root: Path,
) -> tuple[dict[str, Any], dict[str, Any]]:
    source_id = source["id"]
    source_path = Path(source["path"])
    segment = SOURCE_SEGMENTS.get(source_id)
    if segment:
        display_label = (
            f"{segment['participant']} primary camera - segment "
            f"{segment['index']} of {segment['count']} ({source_path.name})"
        )
        source_family_id = segment["familyId"]
        segment_index = segment["index"]
        segment_count = segment["count"]
        editorial_source_kind = "participant-video-segment"
    else:
        display_label = "Watched clip - ArtShow.mp4"
        source_family_id = "watched-clip-artshow"
        segment_index = 1
        segment_count = 1
        editorial_source_kind = "watched-clip"
    proxy_path = source_proxy_path(proxy_root, source_id)
    state = file_state(source_path)
    proxy_state = file_state(proxy_path)
    declared_duration = max(0.0, float(source["seq_end"]) - float(source["seq_start"]))
    probed_duration = ffprobe_duration(source_path)
    duration = probed_duration if probed_duration and probed_duration > 0 else declared_duration
    tags = []
    for chunk in chunks:
        if chunk["source_id"] != source_id:
            continue
        tags.append(
            {
                "id": stable_uuid(
                    f"tag:{source_id}:{chunk['sequence_start']:.6f}:{chunk['sequence_end']:.6f}"
                ),
                "type": "Active",
                "startTime": float(chunk["source_start"]),
                "duration": float(chunk["duration"]),
            }
        )
    source_video: dict[str, Any] = {
        "id": stable_uuid(f"source-video:{source_id}"),
        "mediaURL": file_url(source_path),
        "duration": duration,
        "offset": float(source["seq_start"]),
        "is360": source_path.suffix.lower() == ".insv",
        "proxyURL": file_url(proxy_path),
    }
    lane = {
        "id": stable_uuid(f"lane:{source_id}"),
        "name": display_label,
        "sourceVideo": source_video,
        "tags": tags,
        "metadata": {
            "sourceAssetId": f"episode-4-v009-{source_id}",
            "mediaKind": "video",
            "role": source["role"],
            "sourceFamilyId": source_family_id,
            "sourceSegmentIndex": segment_index,
            "sourceSegmentCount": segment_count,
            "editorialSourceKind": editorial_source_kind,
            "trackIds": [source_id],
            "sourcePath": str(source_path),
            "originalPath": str(source_path),
            "vaultProxyPath": str(proxy_path),
            "assetFingerprint": stable_uuid(f"fingerprint:{source_id}"),
            "declaredExists": state["exists"],
            "sourceLabel": (
                "Whole synced source segment. SHOW decisions are metadata restored from "
                "take-a-main-public v008; rendered chunks are not canonical media."
            ),
            "isPremiereRescue": False,
            "ignoreForProduction": False,
        },
    }
    custody = {
        "id": source_id,
        "kind": "video-source",
        "role": source["role"],
        "label": display_label,
        "sourceFamilyId": source_family_id,
        "sourceSegmentIndex": segment_index,
        "sourceSegmentCount": segment_count,
        "editorialSourceKind": editorial_source_kind,
        "sequenceStart": float(source["seq_start"]),
        "sequenceEnd": float(source["seq_end"]),
        "declaredDuration": declared_duration,
        "probedDuration": probed_duration,
        "source": state,
        "proxy": proxy_state,
        "activeDecisionCount": len(tags),
    }
    return lane, custody


def audio_lane(
    stem_id: str,
    label: str,
    role: str,
    stem_path: Path,
    lineage_manifest: Path,
    checksum: bool,
) -> tuple[dict[str, Any], dict[str, Any]]:
    state = file_state(stem_path)
    if not state["materialized"]:
        raise RuntimeError(f"Required treatment stem is not materialized: {stem_path}")
    duration = ffprobe_duration(stem_path)
    if duration is None or abs(duration - SEQUENCE_DURATION) > 0.02:
        raise RuntimeError(
            f"Treatment stem is not on the {SEQUENCE_DURATION:.3f}s clock: {stem_path} ({duration})"
        )
    lane = {
        "id": stable_uuid(f"lane:{stem_id}"),
        "name": label,
        "sourceVideo": {
            "id": stable_uuid(f"source-video:{stem_id}"),
            "mediaURL": file_url(stem_path),
            "proxyURL": file_url(stem_path),
            "duration": duration,
            "offset": 0.0,
            "is360": False,
        },
        "tags": [
            {
                "id": stable_uuid(f"tag:{stem_id}:full"),
                "type": "Active",
                "startTime": 0.0,
                "duration": duration,
            }
        ],
        "metadata": {
            "sourceAssetId": f"episode-4-{stem_id}",
            "mediaKind": "audio",
            "role": role,
            "trackIds": [stem_id],
            "sourcePath": str(stem_path),
            "originalPath": str(stem_path),
            "assetFingerprint": stable_uuid(f"fingerprint:{stem_id}"),
            "declaredExists": True,
            "sourceLabel": (
                "Canonical source-aware editorial stem on the shared 6799.943s clock. "
                f"Lineage: {lineage_manifest}"
            ),
            "isPremiereRescue": False,
            "ignoreForProduction": False,
        },
    }
    custody: dict[str, Any] = {
        "id": stem_id,
        "kind": "treatment-stem",
        "role": role,
        "duration": duration,
        "source": state,
        "lineageManifest": str(lineage_manifest),
    }
    if checksum:
        custody["sha256"] = sha256(stem_path)
    return lane, custody


def build(args: argparse.Namespace) -> tuple[Path, Path]:
    branch_manifest_path = args.branch_manifest.expanduser().resolve()
    branch_manifest = json.loads(branch_manifest_path.read_text(encoding="utf-8"))
    if branch_manifest.get("branch", {}).get("id") != "take-a-main-public":
        raise RuntimeError("Expected take-a-main-public branch evidence")
    sources = branch_manifest.get("sourceMap", [])
    chunks = branch_manifest.get("chunks", [])
    if len(sources) != 9 or not chunks:
        raise RuntimeError(
            f"Unexpected branch evidence: {len(sources)} sources, {len(chunks)} decisions"
        )

    timestamp = utc_now()
    sequence_id = stable_uuid(f"sequence:{args.session_name}")
    proxy_root = args.proxy_root.expanduser().resolve(strict=False)
    stem_root = args.stem_root.expanduser().resolve()
    lineage_manifest = stem_root / "manifest.json"

    lanes: list[dict[str, Any]] = []
    custody_items: list[dict[str, Any]] = []
    for source in sources:
        lane, custody = video_lane(source, chunks, proxy_root)
        lanes.append(lane)
        custody_items.append(custody)
    for stem_id, label, role, filename in STEMS:
        lane, custody = audio_lane(
            stem_id,
            label,
            role,
            stem_root / filename,
            lineage_manifest,
            args.checksum_stems,
        )
        lanes.append(lane)
        custody_items.append(custody)

    branch = branch_manifest["branch"]
    version_label = args.session_name.rsplit("-", 1)[-1]
    sequence = {
        "id": sequence_id,
        "title": f"Episode 4 {version_label} - Source-Aware Main Public Edit",
        "orientationTrack": {
            "id": stable_uuid("orientation:episode-4-v009:16x9"),
            "keyframes": [],
        },
        "verticalOrientationTrack": {
            "id": stable_uuid("orientation:episode-4-v009:9x16"),
            "keyframes": [],
        },
        "lanes": lanes,
        "shortClipQueue": [],
        "transcriptSegments": [],
        "transcriptJobs": [],
        "editCorrectionNotes": [],
        "editActionLedger": [],
        "publishReceipts": [],
        "editPassContext": {
            "label": "Episode 4 source-aware production pass v009",
            "actor": "Codex",
            "actorType": "agent",
            "passNumber": 9,
            "goal": (
                "Preserve whole synced sources and v008 editorial choices while replacing "
                "the older mixed-audio lineage with equal-length v006 treatment stems."
            ),
            "status": "active",
            "startedAt": timestamp,
            "updatedAt": timestamp,
        },
        "branchMetadata": {
            "branchId": stable_uuid("branch:episode-4-v009-main-public"),
            "branchName": "Episode 4 main public v009",
            "branchRole": "episode-edit",
            "parentSequenceId": None,
            "sourceBaselineSequenceId": sequence_id,
            "branchStatus": "active",
            "branchPurpose": (
                f"{branch.get('editorialApproach', '')} Audio truth is three separate "
                "equal-length v006 stems; v008 chunks are retained only as decision evidence."
            ),
            "createdBy": "Codex producer",
            "createdAt": timestamp,
            "updatedAt": timestamp,
        },
        "audioSpineRegistryPath": str(lineage_manifest),
        "audioSpineCandidates": [],
        "selectedAudioSpineCandidateID": None,
        "audioSpineBranchRenderingLocked": False,
    }
    session = {
        "savedAt": timestamp,
        "activeSequenceId": sequence_id,
        "project": {
            "id": stable_uuid("project:episode-4-source-aware-production"),
            "title": "Episode 4 Source-Aware Production",
            "mediaBin": [],
            "sequences": [sequence],
            "nestDocuments": [],
        },
    }

    session_root = args.session_root.expanduser().resolve(strict=False)
    session_root.mkdir(parents=True, exist_ok=True)
    session_path = session_root / f"{args.session_name}.quipsly-session.json"
    if session_path.exists() and not args.replace:
        raise RuntimeError(f"Refusing to overwrite existing session: {session_path}")
    session_path.write_text(json.dumps(session, indent=2) + "\n", encoding="utf-8")

    custody_manifest = {
        "schema": "quipsly.episode4.source-aware-custody.v1",
        "generatedAt": timestamp,
        "sessionName": args.session_name,
        "sessionPath": str(session_path),
        "sequenceDuration": SEQUENCE_DURATION,
        "editorialEvidence": {
            "branchManifest": str(branch_manifest_path),
            "branchId": branch["id"],
            "decisionCount": len(chunks),
            "canonicalChunks": False,
            "wholeSourceLanes": True,
        },
        "audioTruth": {
            "model": "three equal-length source-aware treatment stems",
            "combinedMasterCanonical": False,
            "lineageManifest": str(lineage_manifest),
        },
        "items": custody_items,
        "readiness": {
            "videoSourceCount": len(sources),
            "materializedVideoSourceCount": sum(
                1 for item in custody_items if item["kind"] == "video-source" and item["source"]["materialized"]
            ),
            "readyProxyCount": sum(
                1 for item in custody_items if item["kind"] == "video-source" and item["proxy"]["materialized"]
            ),
            "treatmentStemCount": len(STEMS),
        },
    }
    custody_path = session_root / f"{args.session_name}.custody.json"
    if custody_path.exists() and not args.replace:
        raise RuntimeError(f"Refusing to overwrite existing custody manifest: {custody_path}")
    custody_path.write_text(json.dumps(custody_manifest, indent=2) + "\n", encoding="utf-8")
    return session_path, custody_path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--branch-manifest", type=Path, default=DEFAULT_BRANCH_MANIFEST)
    parser.add_argument("--stem-root", type=Path, default=DEFAULT_STEM_ROOT)
    parser.add_argument("--proxy-root", type=Path, default=DEFAULT_PROXY_ROOT)
    parser.add_argument("--session-root", type=Path, default=DEFAULT_SESSION_ROOT)
    parser.add_argument("--session-name", default=DEFAULT_SESSION_NAME)
    parser.add_argument("--checksum-stems", action="store_true")
    parser.add_argument("--replace", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    session_path, custody_path = build(args)
    custody = json.loads(custody_path.read_text(encoding="utf-8"))
    readiness = custody["readiness"]
    print(f"SESSION={session_path}")
    print(f"CUSTODY={custody_path}")
    print(
        "READY "
        f"sources={readiness['materializedVideoSourceCount']}/{readiness['videoSourceCount']} "
        f"proxies={readiness['readyProxyCount']}/{readiness['videoSourceCount']} "
        f"stems={readiness['treatmentStemCount']} decisions={custody['editorialEvidence']['decisionCount']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
