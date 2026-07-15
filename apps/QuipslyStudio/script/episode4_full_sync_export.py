#!/usr/bin/env python3
"""Render Episode 4 duration branches from the simplified Full Sync reference.

This is a Quipsly bridge renderer, not a Premiere clone.

Premiere's project file is used only as alignment evidence. The renderer keeps
the Quipsly invariant intact:

- original media is read-only;
- source recordings stay whole;
- branch plans describe sequence-time decisions;
- each export writes a manifest and never overwrites earlier versions.

The script intentionally renders from a declarative branch recipe so the same
truth can later be imported into Quipsly Studio as native branch metadata.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import shlex
import subprocess
import sys
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


EPISODE_DIR = Path("/Users/wall-e/Desktop/Podcast/4")
REFERENCE_PROJECT = EPISODE_DIR / "Full Sync.prproj"
EXTERNAL_EPISODE_DIR = Path("/Volumes/My Passport/Episode 4")
DEFAULT_OUTPUT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Full_Sync_Edits")
TRANSCRIPT_SPINE = Path(
    "/Volumes/My Passport/Episode_and_Shorts_Test/review-board/transcript-spines/episode-04/"
    "20260701-131412-466404-transcript-spine/episode-04.transcript-spine.draft.json"
)
APPROVED_AUDIO_BASELINE_STATUSES = {
    "human-approved-for-branch-inheritance",
    "human-approved-for-publication",
}
DEFAULT_AUDIO_SPINE_REGISTRY = Path(
    "/Volumes/My Passport/Episode_and_Shorts_Test/"
    "Episode_4_Audio_Spine_Registry/episode4-audio-spine-registry.json"
)
DEFAULT_EDITORIAL_STEM_MANIFEST = Path(
    "/Volumes/My Passport/Quipsly Media Vault/audio/episode-4/"
    "v015-editorial-stems/manifest.json"
)
REQUIRED_SOURCE_AWARE_STEM_ROLES = {"charlie", "homer", "clip-source"}
EDITORIAL_STEM_SPEAKER_ROLES = {
    "charlie": "charlie",
    "homer": "homer",
    "reference": "clip-source",
}


@dataclass(frozen=True)
class SourceClip:
    id: str
    label: str
    role: str
    path: Path
    sequence_start: float
    sequence_end: float
    source_start: float = 0.0
    crop: str = "center"
    source_family_id: str | None = None
    source_segment_index: int | None = None
    source_segment_count: int | None = None
    proxy_path: Path | None = None

    @property
    def duration(self) -> float:
        return max(0.0, self.sequence_end - self.sequence_start)

    def contains(self, sequence_time: float, epsilon: float = 0.02) -> bool:
        return self.sequence_start - epsilon <= sequence_time < self.sequence_end - epsilon

    def source_time(self, sequence_time: float) -> float:
        return max(0.0, self.source_start + sequence_time - self.sequence_start)


@dataclass(frozen=True)
class AudioSource:
    id: str
    label: str
    role: str
    path: Path
    sequence_start: float
    volume: float


@dataclass(frozen=True)
class RangeChoice:
    start: float
    end: float
    reason: str

    @property
    def duration(self) -> float:
        return max(0.0, self.end - self.start)


@dataclass(frozen=True)
class BranchPlan:
    id: str
    title: str
    target: str
    intended_platform_use: str
    ranges: list[RangeChoice]
    editorial_tradeoff: str
    warning: str

    @property
    def duration(self) -> float:
        return sum(item.duration for item in self.ranges)


VIDEO_SOURCES: list[SourceClip] = [
    SourceClip(
        id="charlie-3749",
        label="Charlie primary camera - segment 1 of 6 (IMG_3749.MOV)",
        role="charlie_camera",
        path=EPISODE_DIR / "IMG_3749.MOV",
        sequence_start=0.000,
        sequence_end=1220.076667,
        crop="charlie-tight",
        source_family_id="charlie-primary-camera",
        source_segment_index=1,
        source_segment_count=6,
        proxy_path=Path("/Volumes/My Passport/Quipsly Media Vault/proxy/episode-4/v009/charlie-3749-proxy-720p.mp4"),
    ),
    SourceClip(
        id="homer-a",
        label="Homer primary camera - segment 1 of 2 (HomerEp4a.MP4)",
        role="homer_camera",
        path=EPISODE_DIR / "HomerEp4a.MP4",
        sequence_start=527.127,
        sequence_end=1830.647,
        crop="homer-wide",
        source_family_id="homer-primary-camera",
        source_segment_index=1,
        source_segment_count=2,
        proxy_path=Path("/Volumes/My Passport/Quipsly Media Vault/proxy/episode-4/v009/homer-a-proxy-720p.mp4"),
    ),
    SourceClip(
        id="charlie-3750-a",
        label="Charlie primary camera - segment 2 of 6 (IMG_3750.mov)",
        role="charlie_camera",
        path=EPISODE_DIR / "IMG_3750.mov",
        sequence_start=1906.772,
        sequence_end=3706.655333,
        crop="charlie-phone",
        source_family_id="charlie-primary-camera",
        source_segment_index=2,
        source_segment_count=6,
        proxy_path=Path("/Volumes/My Passport/Quipsly Media Vault/proxy/episode-4/v009/charlie-3750-proxy-720p.mp4"),
    ),
    SourceClip(
        id="homer-b",
        label="Homer primary camera - segment 2 of 2 (HomerEp4.MP4)",
        role="homer_camera",
        path=EPISODE_DIR / "HomerEp4.MP4",
        sequence_start=1965.530,
        sequence_end=6734.290,
        crop="homer-wide",
        source_family_id="homer-primary-camera",
        source_segment_index=2,
        source_segment_count=2,
        proxy_path=Path("/Volumes/My Passport/Quipsly Media Vault/proxy/episode-4/v009/homer-b-proxy-720p.mp4"),
    ),
    SourceClip(
        id="office-artshow",
        label="Watched clip - ArtShow.mp4",
        role="reference_clip",
        path=EPISODE_DIR / "ArtShow.mp4",
        sequence_start=2676.240,
        sequence_end=2824.243991,
        crop="center",
        source_family_id="watched-clip-artshow",
        source_segment_index=1,
        source_segment_count=1,
        proxy_path=Path("/Volumes/My Passport/Quipsly Media Vault/proxy/episode-4/v009/reference-artshow-proxy-720p.mp4"),
    ),
    SourceClip(
        id="charlie-3750-b",
        label="Charlie primary camera - segment 3 of 6 (IMG_3750b.mov)",
        role="charlie_camera",
        path=EPISODE_DIR / "IMG_3750b.mov",
        sequence_start=3686.516,
        sequence_end=4188.417700,
        crop="charlie-phone",
        source_family_id="charlie-primary-camera",
        source_segment_index=3,
        source_segment_count=6,
        proxy_path=Path("/Volumes/My Passport/Quipsly Media Vault/proxy/episode-4/v009/charlie-3750b-proxy-720p.mp4"),
    ),
    SourceClip(
        id="charlie-3750-c",
        label="Charlie primary camera - segment 4 of 6 (IMG_3750c.mov)",
        role="charlie_camera",
        path=EPISODE_DIR / "IMG_3750c.mov",
        sequence_start=4185.815,
        sequence_end=4367.396667,
        crop="charlie-phone",
        source_family_id="charlie-primary-camera",
        source_segment_index=4,
        source_segment_count=6,
        proxy_path=Path("/Volumes/My Passport/Quipsly Media Vault/proxy/episode-4/v009/charlie-3750c-proxy-720p.mp4"),
    ),
    SourceClip(
        id="charlie-3750-3",
        label="Charlie primary camera - segment 5 of 6 (IMG_3750 3.mov)",
        role="charlie_camera",
        path=EPISODE_DIR / "IMG_3750 3.mov",
        sequence_start=4606.535,
        sequence_end=5559.716667,
        crop="charlie-phone",
        source_family_id="charlie-primary-camera",
        source_segment_index=5,
        source_segment_count=6,
        proxy_path=Path("/Volumes/My Passport/Quipsly Media Vault/proxy/episode-4/v009/charlie-3750-3-proxy-720p.mp4"),
    ),
    SourceClip(
        id="charlie-3751",
        label="Charlie primary camera - segment 6 of 6 (IMG_3751.MOV)",
        role="charlie_camera",
        path=EPISODE_DIR / "IMG_3751.MOV",
        sequence_start=5874.802,
        sequence_end=6939.512,
        crop="charlie-tight",
        source_family_id="charlie-primary-camera",
        source_segment_index=6,
        source_segment_count=6,
        proxy_path=Path("/Volumes/My Passport/Quipsly Media Vault/proxy/episode-4/v009/charlie-3751-proxy-720p.mp4"),
    ),
]


AUDIO_SOURCES: list[AudioSource] = [
    AudioSource(
        id="charlie-spine",
        label="Charlie high-quality computer audio",
        role="charlie_audio_spine",
        path=EXTERNAL_EPISODE_DIR / "Charlie Ep4.wav",
        sequence_start=7.474,
        volume=0.44,
    ),
    AudioSource(
        id="homer-tx-005",
        label="Homer DJI mic take 1",
        role="homer_audio_take",
        path=EXTERNAL_EPISODE_DIR / "TX00_MIC005_20260226_070456_orig.wav",
        sequence_start=81.148,
        volume=1.35,
    ),
    AudioSource(
        id="homer-tx-006",
        label="Homer DJI mic take 2",
        role="homer_audio_take",
        path=EXTERNAL_EPISODE_DIR / "TX00_MIC006_20260226_073457_orig.wav",
        sequence_start=1881.279,
        volume=1.35,
    ),
    AudioSource(
        id="homer-tx-007",
        label="Homer DJI mic take 3",
        role="homer_audio_take",
        path=EXTERNAL_EPISODE_DIR / "TX00_MIC007_20260226_080457_orig.wav",
        sequence_start=3681.411,
        volume=1.35,
    ),
    AudioSource(
        id="homer-tx-008",
        label="Homer DJI mic take 4",
        role="homer_audio_take",
        path=EXTERNAL_EPISODE_DIR / "TX00_MIC008_20260226_083457_orig.wav",
        sequence_start=5478.073,
        volume=1.35,
    ),
    AudioSource(
        id="office-artshow-audio",
        label="Office reference clip audio",
        role="reference_clip_audio",
        path=EPISODE_DIR / "ArtShow.mp4",
        sequence_start=2676.240,
        volume=0.55,
    ),
]


BRANCHES: list[BranchPlan] = [
    BranchPlan(
        id="tight-30-45",
        title="Episode 4 tight public cut v001",
        target="30-45 minute tight public cut",
        intended_platform_use="Discovery-friendly YouTube/podcast cut where the story moves quickly but still feels human.",
        ranges=[
            RangeChoice(670, 965, "Open at the real show welcome and thesis instead of setup chatter."),
            RangeChoice(1140, 1255, "Keep the flow-rule idea that frames challenge without panic."),
            RangeChoice(1505, 1805, "Keep the Creativity Inc leadership bridge."),
            RangeChoice(1955, 2550, "Keep the strongest flow, names, soundboard, and coaching material."),
            RangeChoice(2580, 2845, "Keep the Michael Scott and Pam art-show clip loop."),
            RangeChoice(3295, 3465, "Keep the leadership-design wrap."),
            RangeChoice(4180, 4445, "Keep the dichotomy/meeting setup."),
            RangeChoice(5010, 5195, "Keep the formation/time-wasting example."),
            RangeChoice(5710, 5960, "Keep the late camera-assistant/report design section."),
            RangeChoice(6250, 6470, "Keep the late pillow/light-switch story."),
            RangeChoice(6712, 6728, "Keep the High Ground signoff."),
        ],
        editorial_tradeoff=(
            "Cuts aggressively around setup, detours, and repeated scaffolding. Best for attention and first-time viewers, "
            "but sacrifices some relationship texture and some of the full leadership exploration."
        ),
        warning=(
            "Transcript speaker labels are draft-only. Cuts are transcript-aware but not human proof-listened yet; "
            "render should be watched before public upload if time allows."
        ),
    ),
    BranchPlan(
        id="main-45-60",
        title="Episode 4 main release candidate v001",
        target="45-60 minute main release candidate",
        intended_platform_use="Likely main YouTube, Spotify video, Apple/Spotify podcast audio candidate.",
        ranges=[
            RangeChoice(670, 1320, "Full real intro and first thesis arc."),
            RangeChoice(1505, 1840, "Creativity Inc bridge with enough context to breathe."),
            RangeChoice(1955, 2550, "Full flow/names/sounding-board/coaching arc."),
            RangeChoice(2580, 2845, "Office/Pam art-show clip and reaction loop."),
            RangeChoice(3295, 3650, "Leadership design and story lesson."),
            RangeChoice(4180, 4580, "Dichotomy of leadership and meetings."),
            RangeChoice(5010, 5330, "Formation/time-wasting example and application."),
            RangeChoice(5710, 6120, "Camera assistant/reports/work-design section."),
            RangeChoice(6250, 6470, "Late story and practical leadership lesson."),
            RangeChoice(6712, 6728, "High Ground signoff."),
        ],
        editorial_tradeoff=(
            "Keeps the clearest public spine while preserving more warmth than the tight cut. "
            "This is the strongest first publishing candidate if the render sync validates."
        ),
        warning=(
            "This is built from the simplified Full Sync reference and ASR draft landmarks. "
            "It is not based on a human proof-listen pass."
        ),
    ),
    BranchPlan(
        id="extended-60-80",
        title="Episode 4 extended deep cut v001",
        target="60-80 minute extended/deep cut",
        intended_platform_use="Patreon/archive/deep-listener version or alternate full podcast feed cut.",
        ranges=[
            RangeChoice(670, 1320, "Full real intro and first thesis arc."),
            RangeChoice(1505, 1850, "Extended Creativity Inc bridge."),
            RangeChoice(1955, 2845, "Full middle arc through Office/Pam art-show loop."),
            RangeChoice(3295, 4100, "Leadership design plus the broader work/time conversation."),
            RangeChoice(4180, 5330, "Full meeting/dichotomy/formation application sequence."),
            RangeChoice(5710, 6120, "Camera assistant/reports/work-design section."),
            RangeChoice(6250, 6728, "Late story through closing signoff."),
        ],
        editorial_tradeoff=(
            "Preserves the most context and relationship texture while still removing the earliest setup chatter and the most obvious loose gaps. "
            "Best for people already invested in Homer and Charlie."
        ),
        warning=(
            "Longer runtime means weaker retention unless chaptering and description metadata are strong. "
            "Use this as extended/deep cut unless it proves substantially better than the main release candidate."
        ),
    ),
]


def run(command: list[str], *, check: bool = True, capture: bool = False) -> subprocess.CompletedProcess[str]:
    print("$ " + " ".join(shlex.quote(str(part)) for part in command), file=sys.stderr, flush=True)
    result = subprocess.run(
        [str(part) for part in command],
        text=True,
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.PIPE if capture else None,
        check=False,
    )
    if check and result.returncode != 0:
        if capture:
            sys.stderr.write(result.stdout or "")
            sys.stderr.write(result.stderr or "")
        raise SystemExit(result.returncode)
    return result


def require_files(paths: Iterable[Path]) -> list[str]:
    missing = []
    for path in paths:
        if not path.exists():
            missing.append(str(path))
    return missing


def ffprobe_json(path: Path) -> dict[str, Any]:
    result = run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_format",
            "-show_streams",
            "-print_format",
            "json",
            str(path),
        ],
        capture=True,
    )
    return json.loads(result.stdout or "{}")


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(8 * 1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def load_editorial_stem_audio_baseline(manifest_path: Path) -> dict[str, Any]:
    """Load the canonical equal-clock editorial stems without an approval-form dependency."""
    blockers: list[str] = []
    warnings: list[str] = []
    manifest: dict[str, Any] = {}
    selected_stems: list[dict[str, Any]] = []

    if not manifest_path.exists():
        blockers.append(f"canonical editorial stem manifest is missing: {manifest_path}")
    else:
        try:
            manifest = read_json(manifest_path)
        except json.JSONDecodeError as exc:
            blockers.append(f"canonical editorial stem manifest is not valid JSON: {exc}")

    if manifest:
        if manifest.get("schema") != "quipsly.editorial-stem-registry.v1":
            blockers.append(f"unsupported editorial stem schema: {manifest.get('schema')}")
        if manifest.get("combinedMixCanonical") is not False:
            blockers.append("editorial stem manifest incorrectly marks a combined mix as canonical")
        if manifest.get("originalMediaMutated") is not False:
            blockers.append("editorial stem manifest does not prove originals remained untouched")
        if "separate equal-length" not in str(manifest.get("editorialTruth") or ""):
            blockers.append("editorial stem manifest does not declare separate equal-length stems")

        expected_duration = float(manifest.get("expectedDurationSeconds") or 0)
        artifacts = manifest.get("artifacts") if isinstance(manifest.get("artifacts"), list) else []
        seen_roles: set[str] = set()
        for artifact in artifacts:
            if not isinstance(artifact, dict):
                continue
            speaker = str(artifact.get("speaker") or "")
            role_id = EDITORIAL_STEM_SPEAKER_ROLES.get(speaker)
            if not role_id:
                warnings.append(f"ignoring unknown editorial stem speaker: {speaker}")
                continue
            seen_roles.add(role_id)
            stem_path = Path(str(artifact.get("path") or ""))
            expected_sha256 = str(artifact.get("sha256") or "")
            row: dict[str, Any] = {
                "roleId": role_id,
                "label": f"{speaker.title()} refined editorial stem",
                "status": "missing",
                "path": str(stem_path),
                "sourceManifest": artifact.get("sourceManifest"),
                "sourceRole": artifact.get("role"),
                "expectedSha256": expected_sha256,
                "sha256Verified": False,
                "exists": stem_path.exists(),
            }
            if not stem_path.exists():
                blockers.append(f"canonical editorial stem is missing for {role_id}: {stem_path}")
                selected_stems.append(row)
                continue

            actual_sha256 = sha256_file(stem_path)
            row["actualSha256"] = actual_sha256
            row["sha256Verified"] = bool(expected_sha256) and actual_sha256 == expected_sha256
            if not row["sha256Verified"]:
                blockers.append(f"canonical editorial stem checksum mismatch for {role_id}: {stem_path}")

            probe = ffprobe_json(stem_path)
            audio_stream = next(
                (stream for stream in probe.get("streams", []) if stream.get("codec_type") == "audio"),
                {},
            )
            duration = float((probe.get("format") or {}).get("duration") or 0)
            row.update(
                {
                    "status": "ready" if row["sha256Verified"] else "checksum-mismatch",
                    "durationSeconds": round(duration, 6),
                    "codec": audio_stream.get("codec_name"),
                    "sampleRate": int(audio_stream.get("sample_rate") or 0),
                    "channels": int(audio_stream.get("channels") or 0),
                    "channelLayout": audio_stream.get("channel_layout"),
                }
            )
            if abs(duration - expected_duration) > 0.05:
                blockers.append(
                    f"canonical editorial stem duration mismatch for {role_id}: "
                    f"{duration:.3f}s vs {expected_duration:.3f}s"
                )
            if row["sampleRate"] != 48000:
                blockers.append(f"canonical editorial stem sample rate is not 48 kHz for {role_id}")
            selected_stems.append(row)

        missing_roles = sorted(REQUIRED_SOURCE_AWARE_STEM_ROLES - seen_roles)
        if missing_roles:
            blockers.append("canonical editorial stem roles missing: " + ", ".join(missing_roles))

    contract = {
        "schema": "quipsly.episode4.canonical-editorial-stem-contract.v1",
        "manifestPath": str(manifest_path),
        "manifestSchema": manifest.get("schema"),
        "episode": manifest.get("episode"),
        "version": manifest.get("version"),
        "promotionState": manifest.get("promotionState"),
        "status": "ready-source-aware-editable" if not blockers else "blocked-source-aware-audio-contract",
        "ready": not blockers,
        "requiredRoles": sorted(REQUIRED_SOURCE_AWARE_STEM_ROLES),
        "roleIds": [str(item.get("roleId")) for item in selected_stems],
        "readyStemCount": sum(1 for item in selected_stems if item.get("status") == "ready"),
        "resolvedStemCount": sum(1 for item in selected_stems if item.get("exists")),
        "stemDurations": {
            str(item.get("roleId")): item.get("durationSeconds") for item in selected_stems
        },
        "selectedRefinedStems": selected_stems,
        "editorAudioTruthRule": manifest.get("editorialTruth"),
        "mixRecipeTruth": "delivery mix is derived; separate equal-clock stems remain canonical",
        "blockers": blockers,
        "warnings": warnings,
        "masteredSpineUse": "derived delivery/listen artifact only",
        "editorTruthUse": "aligned Charlie/Homer/clip-source stems plus metadata decisions on one sequence clock",
    }
    return {
        "schema": "quipsly.episode4.canonical-editorial-audio-baseline.v1",
        "baselineDir": str(manifest_path.parent),
        "manifestPath": str(manifest_path),
        "baselineId": f"{manifest.get('episode')}-{manifest.get('version')}-canonical-editorial-stems",
        "approvalStatus": None,
        "branchInheritanceReady": not blockers,
        "masterAudioPath": None,
        "inheritsSpeakerAwareGapManagement": True,
        "inheritsSourceAwareAudioTruth": not blockers,
        "sourceAwareAudioContract": contract,
        "approvedForBranchInheritance": None,
        "branchInheritanceBlockers": [],
        "technicalBlockers": blockers,
        "renderMode": "canonical-editorial-stems",
        "blockers": blockers,
        "warnings": warnings,
        "allowUnapprovedProofOverride": False,
        "readyForBranchRender": not blockers,
        "renderAuthority": "verified-canonical-editorial-stem-manifest",
    }


def resolve_conformed_baseline_dir(input_path: Path) -> Path:
    if (input_path / "manifest.json").exists():
        return input_path
    nested = input_path / "work" / "conformed-production-baseline"
    if (nested / "manifest.json").exists():
        return nested
    raise FileNotFoundError(
        "Could not find a conformed production baseline manifest at "
        f"{input_path}/manifest.json or {nested}/manifest.json"
    )


def manifest_output_path(outputs: dict[str, Any], key: str) -> str | None:
    value = outputs.get(key)
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return value.get("path")
    return None


def stem_duration_seconds(role: dict[str, Any]) -> float:
    stem = role.get("selectedRefinedStem")
    if not isinstance(stem, dict):
        return 0.0
    try:
        return float(stem.get("durationSeconds") or 0)
    except (TypeError, ValueError):
        return 0.0


def selected_refined_stem_summary(role: dict[str, Any]) -> dict[str, Any]:
    stem = role.get("selectedRefinedStem") if isinstance(role.get("selectedRefinedStem"), dict) else {}
    role_id = str(role.get("roleId"))
    return {
        "roleId": role_id,
        "label": role.get("label"),
        "status": role.get("status"),
        "path": stem.get("path"),
        "durationSeconds": stem.get("durationSeconds"),
        "codec": stem.get("codec"),
        "sampleRate": stem.get("sampleRate"),
        "channels": stem.get("channels"),
        "exists": bool(stem.get("path")) and Path(str(stem.get("path"))).exists(),
    }


def load_source_aware_audio_contract(manifest: dict[str, Any]) -> dict[str, Any]:
    registry_path_text = (
        manifest.get("audioSpineRegistryPath")
        or manifest_output_path(manifest.get("outputs") or {}, "audioSpineRegistry")
        or str(DEFAULT_AUDIO_SPINE_REGISTRY)
    )
    registry_path = Path(str(registry_path_text))
    blockers: list[str] = []
    warnings: list[str] = []
    registry: dict[str, Any] = {}
    candidate: dict[str, Any] = {}
    stem_set: dict[str, Any] = {}
    roles: list[dict[str, Any]] = []

    if not registry_path.exists():
        blockers.append(f"source-aware audio spine registry is missing: {registry_path}")
    else:
        try:
            registry = read_json(registry_path)
        except json.JSONDecodeError as exc:
            blockers.append(f"source-aware audio spine registry is not valid JSON: {exc}")

    policy = registry.get("selectionPolicy") if isinstance(registry.get("selectionPolicy"), dict) else {}
    default_id = policy.get("fullSourceDefault")
    for item in registry.get("candidates") or []:
        if isinstance(item, dict) and item.get("id") == default_id:
            candidate = item
            break
    if registry and not candidate:
        blockers.append(f"source-aware full-source default candidate is missing: {default_id}")

    if candidate:
        if candidate.get("kind") != "fullSourceMaster" or candidate.get("scope") != "full-sync-source-layer":
            blockers.append(
                "source-aware default is not a full-source sync layer: "
                f"{candidate.get('kind')} / {candidate.get('scope')}"
            )
        raw_stem_set = candidate.get("sourceAwareStemSet")
        if isinstance(raw_stem_set, dict):
            stem_set = raw_stem_set
        else:
            blockers.append("source-aware default candidate has no embedded source-aware stem set")
        raw_roles = stem_set.get("roles") if isinstance(stem_set.get("roles"), list) else []
        roles = [role for role in raw_roles if isinstance(role, dict)]
        role_ids = {str(role.get("roleId")) for role in roles}
        missing_roles = sorted(REQUIRED_SOURCE_AWARE_STEM_ROLES - role_ids)
        if missing_roles:
            blockers.append("source-aware stem roles missing: " + ", ".join(missing_roles))
        for role in roles:
            role_id = str(role.get("roleId"))
            if role_id not in REQUIRED_SOURCE_AWARE_STEM_ROLES:
                continue
            selected = role.get("selectedRefinedStem") if isinstance(role.get("selectedRefinedStem"), dict) else {}
            path = selected.get("path")
            if not path or not Path(str(path)).exists():
                blockers.append(f"source-aware refined stem missing for {role_id}: {path}")
            if stem_duration_seconds(role) < 6000:
                blockers.append(f"source-aware refined stem too short for {role_id}: {stem_duration_seconds(role):.3f}s")
        if int(stem_set.get("readyStemCount") or 0) < 3:
            blockers.append(f"source-aware ready stem count is too low: {stem_set.get('readyStemCount')}")
        truth = str(stem_set.get("editorAudioTruthRule") or "")
        if "source-aware refined stems plus a mix recipe" not in truth:
            blockers.append("editor audio truth rule does not identify source-aware refined stems plus mix recipe")
        mix_recipe = stem_set.get("mixRecipe") if isinstance(stem_set.get("mixRecipe"), dict) else {}
        if "review/export convenience" not in str(mix_recipe.get("canonicalEditorTruth") or ""):
            blockers.append("mix recipe does not frame mastered spine as review/export convenience")
        safety = stem_set.get("safety") if isinstance(stem_set.get("safety"), dict) else {}
        for key in ("originalMediaMutated", "renderAttempted", "uploadAttempted", "publicationAttempted"):
            if safety.get(key) is True:
                blockers.append(f"source-aware stem manifest safety flag is unsafe: {key}=true")
    elif registry:
        warnings.append("source-aware registry loaded but no default candidate could be inspected")

    return {
        "schema": "quipsly.episode4.source-aware-audio-contract.v1",
        "registryPath": str(registry_path),
        "defaultCandidateId": default_id,
        "candidateId": candidate.get("id"),
        "candidateKind": candidate.get("kind"),
        "candidateScope": candidate.get("scope"),
        "status": "ready-source-aware-editable" if not blockers else "blocked-source-aware-audio-contract",
        "ready": not blockers,
        "requiredRoles": sorted(REQUIRED_SOURCE_AWARE_STEM_ROLES),
        "roleIds": [str(role.get("roleId")) for role in roles],
        "readyStemCount": stem_set.get("readyStemCount"),
        "resolvedStemCount": stem_set.get("resolvedStemCount"),
        "stemDurations": {
            str(role.get("roleId")): round(stem_duration_seconds(role), 3)
            for role in roles
            if str(role.get("roleId")) in REQUIRED_SOURCE_AWARE_STEM_ROLES
        },
        "selectedRefinedStems": [
            selected_refined_stem_summary(role)
            for role in roles
            if str(role.get("roleId")) in REQUIRED_SOURCE_AWARE_STEM_ROLES
        ],
        "editorAudioTruthRule": stem_set.get("editorAudioTruthRule"),
        "mixRecipeTruth": (stem_set.get("mixRecipe") or {}).get("canonicalEditorTruth") if isinstance(stem_set.get("mixRecipe"), dict) else None,
        "blockers": blockers,
        "warnings": warnings,
        "masteredSpineUse": "review/export/Premiere/final-podcast convenience after approval",
        "editorTruthUse": "aligned Charlie/Homer/clip-source stems plus metadata decisions on one sequence clock",
    }


def load_conformed_audio_baseline(
    baseline_dir: Path | None,
    *,
    allow_unapproved: bool = False,
) -> dict[str, Any] | None:
    if baseline_dir is None:
        return None
    resolved_dir = resolve_conformed_baseline_dir(baseline_dir)
    manifest_path = resolved_dir / "manifest.json"
    manifest = read_json(manifest_path)
    outputs = manifest.get("outputs") or {}
    master_path_text = manifest_output_path(outputs, "masterWav")
    master_path = Path(master_path_text) if master_path_text else None
    gate_path_text = outputs.get("latestBranchInheritanceGate")
    gate = read_json(Path(gate_path_text)) if gate_path_text and Path(gate_path_text).exists() else {}
    approval_status = manifest.get("approvalStatus")
    technical_blockers: list[str] = []
    approval_blockers: list[str] = []
    warnings: list[str] = []
    source_aware_contract = load_source_aware_audio_contract(manifest)

    if not master_path or not master_path.exists():
        technical_blockers.append("conformed baseline master WAV is missing")
    if approval_status not in APPROVED_AUDIO_BASELINE_STATUSES:
        approval_blockers.append(f"conformed baseline approvalStatus is not approved: {approval_status}")
    if manifest.get("branchInheritanceReady") is not True:
        approval_blockers.append("conformed baseline branchInheritanceReady is not true")
    if gate and gate.get("canInheritForBranches") is not True:
        approval_blockers.extend([f"branch gate blocker: {item}" for item in gate.get("blockers", [])])
    elif not gate:
        approval_blockers.append("conformed baseline branch inheritance gate is missing")
    technical_blockers.extend([f"source-aware audio blocker: {item}" for item in source_aware_contract["blockers"]])

    blockers = [*technical_blockers, *approval_blockers]
    if allow_unapproved and approval_blockers:
        warnings.extend([f"proof-only unapproved baseline override: {item}" for item in approval_blockers])
        blockers = list(technical_blockers)

    return {
        "schema": "quipsly.episode4.conformed-audio-baseline-selection.v1",
        "baselineDir": str(resolved_dir),
        "manifestPath": str(manifest_path),
        "baselineId": manifest.get("baselineId"),
        "approvalStatus": approval_status,
        "branchInheritanceReady": manifest.get("branchInheritanceReady"),
        "gatePath": gate_path_text,
        "gateCanInheritForBranches": gate.get("canInheritForBranches"),
        "masterAudioPath": str(master_path) if master_path else None,
        "audioReviewCockpitHtml": outputs.get("audioReviewCockpitHtml"),
        "latestListenDecisionMarkdown": outputs.get("latestListenDecisionMarkdown")
        or outputs.get("latestListenDecisionTemplateMarkdown"),
        "inheritsSpeakerAwareGapManagement": bool(outputs.get("speakerGapAutomation")),
        "inheritsSourceAwareAudioTruth": bool(source_aware_contract.get("ready")),
        "sourceAwareAudioContract": source_aware_contract,
        "approvedForBranchInheritance": not approval_blockers,
        "branchInheritanceBlockers": approval_blockers,
        "technicalBlockers": technical_blockers,
        "renderMode": "proof-only-unapproved-override" if allow_unapproved and approval_blockers and not technical_blockers else "approved-branch-inheritance",
        "blockers": blockers,
        "warnings": warnings,
        "allowUnapprovedProofOverride": allow_unapproved,
        "readyForBranchRender": not blockers,
    }


def source_aware_stem_paths(audio_baseline: dict[str, Any]) -> list[Path]:
    contract = audio_baseline.get("sourceAwareAudioContract") if isinstance(audio_baseline.get("sourceAwareAudioContract"), dict) else {}
    stems = contract.get("selectedRefinedStems") if isinstance(contract.get("selectedRefinedStems"), list) else []
    by_role: dict[str, Path] = {}
    for item in stems:
        if not isinstance(item, dict):
            continue
        role_id = str(item.get("roleId"))
        path_text = item.get("path")
        if role_id in REQUIRED_SOURCE_AWARE_STEM_ROLES and path_text:
            by_role[role_id] = Path(str(path_text))
    missing = sorted(REQUIRED_SOURCE_AWARE_STEM_ROLES - set(by_role))
    if missing:
        raise RuntimeError("source-aware branch audio is missing refined stems for: " + ", ".join(missing))
    missing_paths = [f"{role}: {path}" for role, path in sorted(by_role.items()) if not path.exists()]
    if missing_paths:
        raise RuntimeError("source-aware branch audio has missing stem files: " + "; ".join(missing_paths))
    return [by_role[role] for role in sorted(REQUIRED_SOURCE_AWARE_STEM_ROLES)]


def build_source_aware_branch_audio_mix(
    run_dir: Path,
    audio_baseline: dict[str, Any],
    *,
    force: bool = False,
    duration_seconds: float | None = None,
) -> Path:
    work_dir = run_dir / "work"
    work_dir.mkdir(exist_ok=True)
    output_path = work_dir / "episode4-source-aware-branch-audio.wav"
    if output_path.exists() and not force:
        return output_path
    stems = source_aware_stem_paths(audio_baseline)
    cmd = ["ffmpeg", "-hide_banner", "-y"]
    for stem in stems:
        cmd.extend(["-i", str(stem)])
    filter_complex = (
        f"amix=inputs={len(stems)}:duration=longest:dropout_transition=0:normalize=0,"
        "alimiter=limit=0.95,"
        "loudnorm=I=-16:LRA=11:TP=-1.5"
    )
    cmd.extend(["-filter_complex", filter_complex])
    if duration_seconds is not None and duration_seconds > 0:
        cmd.extend(["-t", f"{duration_seconds:.6f}"])
    cmd.extend(["-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", str(output_path)])
    run(cmd)
    return output_path


def media_duration(path: Path) -> float:
    probe = ffprobe_json(path)
    try:
        return float(probe.get("format", {}).get("duration") or 0)
    except ValueError:
        return 0.0


def load_transcript_summary() -> dict[str, Any]:
    if not TRANSCRIPT_SPINE.exists():
        return {"status": "missing", "path": str(TRANSCRIPT_SPINE)}
    data = json.loads(TRANSCRIPT_SPINE.read_text())
    segments = data.get("segments", [])
    return {
        "status": data.get("status"),
        "path": str(TRANSCRIPT_SPINE),
        "segmentCount": len(segments),
        "wordCount": sum(int(item.get("wordCount") or 0) for item in segments),
        "durationSeconds": data.get("counts", {}).get("durationSeconds"),
        "speakerTruth": "ASR draft speaker labels are placeholders and are not used as final attribution.",
    }


def create_run_dir(output_root: Path, run_label: str | None) -> Path:
    output_root.mkdir(parents=True, exist_ok=True)
    label = run_label or datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-episode4-full-sync")
    run_dir = output_root / label
    suffix = 2
    original = run_dir
    while run_dir.exists():
        run_dir = original.with_name(f"{original.name}-{suffix:02d}")
        suffix += 1
    run_dir.mkdir(parents=True)
    (run_dir / "work").mkdir()
    (run_dir / "manifests").mkdir()
    return run_dir


def build_audio_mix(run_dir: Path, force: bool = False) -> Path:
    audio_mix = run_dir / "work" / "episode4-full-sync-balanced-audio.wav"
    if audio_mix.exists() and not force:
        return audio_mix

    inputs: list[str] = []
    filters: list[str] = []
    labels: list[str] = []
    for index, source in enumerate(AUDIO_SOURCES):
        inputs.extend(["-i", str(source.path)])
        delay_ms = max(0, int(round(source.sequence_start * 1000)))
        label = f"a{index}"
        filters.append(
            f"[{index}:a]aresample=48000,volume={source.volume},"
            f"adelay={delay_ms}:all=1[{label}]"
        )
        labels.append(f"[{label}]")

    filter_complex = ";".join(filters) + ";" + "".join(labels) + (
        f"amix=inputs={len(labels)}:duration=longest:normalize=0,"
        "acompressor=threshold=-18dB:ratio=2.5:attack=12:release=180,"
        "loudnorm=I=-16:TP=-1.5:LRA=11[aout]"
    )
    run(
        [
            "ffmpeg",
            "-hide_banner",
            "-y",
            *inputs,
            "-filter_complex",
            filter_complex,
            "-map",
            "[aout]",
            "-t",
            "6800",
            "-ar",
            "48000",
            "-c:a",
            "pcm_s16le",
            str(audio_mix),
        ]
    )
    return audio_mix


def available_sources_at(sequence_time: float) -> list[SourceClip]:
    return [source for source in VIDEO_SOURCES if source.contains(sequence_time)]


def load_picture_decision_map(path: Path | None) -> dict[str, Any] | None:
    if path is None:
        return None
    payload = read_json(path)
    decisions = payload.get("decisions")
    if not isinstance(decisions, list) or not decisions:
        raise RuntimeError(f"picture decision map has no decisions: {path}")
    if payload.get("originalMediaMutated") is not False or payload.get("sessionMutated") is not False:
        raise RuntimeError("picture decision map does not prove non-destructive generation")
    ordered = sorted(decisions, key=lambda item: float(item.get("startSeconds") or 0))
    for previous, current in zip(ordered, ordered[1:]):
        gap = float(current.get("startSeconds") or 0) - float(previous.get("endSeconds") or 0)
        if abs(gap) > 0.002:
            raise RuntimeError(
                f"picture decision map continuity failure after {previous.get('decisionId')}: {gap:+.6f}s"
            )
    payload["decisions"] = ordered
    payload["path"] = str(path)
    return payload


def source_for_picture_decision(decision: dict[str, Any]) -> SourceClip | None:
    if decision.get("family") == "gap":
        return None
    family_id = decision.get("sourceFamilyId")
    segment_index = decision.get("sourceSegmentIndex")
    matches = [
        source
        for source in VIDEO_SOURCES
        if source.source_family_id == family_id
        and (segment_index is None or source.source_segment_index == int(segment_index))
    ]
    if len(matches) != 1:
        raise RuntimeError(
            f"picture decision {decision.get('decisionId')} resolves to {len(matches)} sources "
            f"for {family_id} segment {segment_index}"
        )
    return matches[0]


def choose_source(sequence_time: float, chunk_index: int) -> SourceClip | None:
    available = available_sources_at(sequence_time)
    if not available:
        return None
    reference = [item for item in available if item.role == "reference_clip"]
    if reference:
        return reference[0]
    charlie = [item for item in available if item.role == "charlie_camera"]
    homer = [item for item in available if item.role == "homer_camera"]
    if charlie and homer:
        # Start most sections on the person who is visually clearer, then use
        # regular reaction-cover alternation. This is a first Quipsly editorial
        # pass, not a speaker diarization claim.
        return charlie[0] if chunk_index % 3 in (0, 1) else homer[0]
    if charlie:
        return charlie[0]
    if homer:
        return homer[0]
    return available[0]


def next_source_boundary(sequence_time: float, range_end: float) -> float:
    candidates = [range_end]
    for source in VIDEO_SOURCES:
        if sequence_time < source.sequence_start < range_end:
            candidates.append(source.sequence_start)
        if sequence_time < source.sequence_end < range_end:
            candidates.append(source.sequence_end)
    return min(candidates)


def chunk_branch_ranges(
    branch: BranchPlan,
    max_chunk_duration: float = 28.0,
    picture_map: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    if picture_map is not None:
        return chunk_branch_ranges_from_picture_map(branch, picture_map, max_chunk_duration)

    chunks: list[dict[str, Any]] = []
    counter = 0
    for range_index, item in enumerate(branch.ranges, start=1):
        cursor = item.start
        while cursor < item.end - 0.01:
            boundary = min(item.end, cursor + max_chunk_duration, next_source_boundary(cursor + 0.01, item.end))
            duration = boundary - cursor
            if duration < 0.25:
                cursor = boundary
                continue
            source = choose_source(cursor + min(duration / 2, 0.5), counter)
            chunks.append(
                {
                    "index": counter,
                    "rangeIndex": range_index,
                    "sequenceStart": round(cursor, 3),
                    "sequenceEnd": round(boundary, 3),
                    "duration": round(duration, 3),
                    "rangeReason": item.reason,
                    "sourceId": source.id if source else "blank-gap",
                    "sourceLabel": source.label if source else "Blank gap",
                    "sourceRole": source.role if source else "gap",
                    "sourcePath": str(source.path) if source else "",
                    "sourceStart": round(source.source_time(cursor), 3) if source else 0.0,
                }
            )
            counter += 1
            cursor = boundary
    return chunks


def chunk_branch_ranges_from_picture_map(
    branch: BranchPlan,
    picture_map: dict[str, Any],
    max_chunk_duration: float,
) -> list[dict[str, Any]]:
    chunks: list[dict[str, Any]] = []
    counter = 0
    decisions = picture_map["decisions"]
    for range_index, item in enumerate(branch.ranges, start=1):
        for decision in decisions:
            start = max(item.start, float(decision["startSeconds"]))
            end = min(item.end, float(decision["endSeconds"]))
            if end - start < 0.01:
                continue
            source = source_for_picture_decision(decision)
            cursor = start
            while cursor < end - 0.01:
                boundary = min(end, cursor + max_chunk_duration)
                duration = boundary - cursor
                if duration < 0.01:
                    break
                proxy_path = Path(str(decision.get("proxyPath") or "")) if source else None
                if source and (not proxy_path or not proxy_path.exists()):
                    raise RuntimeError(
                        f"picture decision {decision.get('decisionId')} lacks a readable proxy: {proxy_path}"
                    )
                chunks.append(
                    {
                        "index": counter,
                        "rangeIndex": range_index,
                        "sequenceStart": round(cursor, 3),
                        "sequenceEnd": round(boundary, 3),
                        "duration": round(duration, 3),
                        "rangeReason": item.reason,
                        "sourceId": source.id if source else "blank-gap",
                        "sourceLabel": source.label if source else "Blank gap",
                        "sourceRole": source.role if source else "gap",
                        "sourcePath": str(source.path) if source else "",
                        "renderPath": str(proxy_path) if proxy_path else "",
                        "sourceStart": round(source.source_time(cursor), 3) if source else 0.0,
                        "pictureDecisionId": decision.get("decisionId"),
                        "pictureDecisionReason": decision.get("reason"),
                        "pictureDecisionConfidence": decision.get("confidence"),
                        "pictureDecisionParentId": decision.get("parentDecisionId"),
                    }
                )
                counter += 1
                cursor = boundary
    return chunks


def limit_ranges_for_proof(ranges: list[RangeChoice], proof_seconds: float | None) -> list[RangeChoice]:
    if proof_seconds is None:
        return ranges

    kept: list[RangeChoice] = []
    remaining = max(0.0, proof_seconds)
    for item in ranges:
        if remaining <= 0.0:
            break
        duration = min(item.duration, remaining)
        if duration <= 0.0:
            continue
        kept.append(
            RangeChoice(
                start=item.start,
                end=item.start + duration,
                reason=f"{item.reason} Proof excerpt.",
            )
        )
        remaining -= duration
    return kept


def summarize_chunks(chunks: list[dict[str, Any]]) -> dict[str, Any]:
    role_counts: dict[str, int] = {}
    role_seconds: dict[str, float] = {}
    source_counts: dict[str, int] = {}
    source_seconds: dict[str, float] = {}
    total_seconds = 0.0
    blank_gap_seconds = 0.0
    reference_clip_seconds = 0.0

    for chunk in chunks:
        duration = float(chunk.get("duration") or 0.0)
        role = str(chunk.get("sourceRole") or "unknown")
        source_id = str(chunk.get("sourceId") or "unknown")
        total_seconds += duration
        role_counts[role] = role_counts.get(role, 0) + 1
        role_seconds[role] = round(role_seconds.get(role, 0.0) + duration, 3)
        source_counts[source_id] = source_counts.get(source_id, 0) + 1
        source_seconds[source_id] = round(source_seconds.get(source_id, 0.0) + duration, 3)
        if role == "gap":
            blank_gap_seconds += duration
        if role == "reference_clip":
            reference_clip_seconds += duration

    return {
        "chunkCount": len(chunks),
        "totalSequenceSeconds": round(total_seconds, 3),
        "totalSequenceMinutes": round(total_seconds / 60, 2),
        "blankGapSeconds": round(blank_gap_seconds, 3),
        "referenceClipSeconds": round(reference_clip_seconds, 3),
        "sourceRoleCounts": dict(sorted(role_counts.items())),
        "sourceRoleSeconds": dict(sorted(role_seconds.items())),
        "sourceIdCounts": dict(sorted(source_counts.items())),
        "sourceIdSeconds": dict(sorted(source_seconds.items())),
        "usesWholeSourceChunks": True,
        "chunkingRule": "chunks are sequence-time decisions over whole source media; originals are never cut",
    }


def branch_plan_payload(branch: BranchPlan, *, include_chunks: bool = True) -> dict[str, Any]:
    ranges = [asdict(item) | {"duration": round(item.duration, 3)} for item in branch.ranges]
    payload: dict[str, Any] = {
        "id": branch.id,
        "title": branch.title,
        "target": branch.target,
        "plannedDurationSeconds": round(branch.duration, 3),
        "plannedDurationMinutes": round(branch.duration / 60, 2),
        "ranges": ranges,
        "rangeCount": len(ranges),
        "editorialTradeoff": branch.editorial_tradeoff,
        "warning": branch.warning,
    }
    if include_chunks:
        chunks = chunk_branch_ranges(branch)
        payload["chunks"] = chunks
        payload["chunkSummary"] = summarize_chunks(chunks)
    return payload


def branch_audio_plan(audio_baseline: dict[str, Any] | None) -> dict[str, Any]:
    contract = audio_baseline.get("sourceAwareAudioContract") if isinstance(audio_baseline, dict) else {}
    if not isinstance(contract, dict):
        contract = {}
    selected_stems = contract.get("selectedRefinedStems") if isinstance(contract.get("selectedRefinedStems"), list) else []
    stem_rows = [
        {
            "roleId": item.get("roleId"),
            "label": item.get("label"),
            "path": item.get("path"),
            "exists": bool(item.get("path")) and Path(str(item.get("path"))).exists(),
            "durationSeconds": item.get("durationSeconds"),
            "sampleRate": item.get("sampleRate"),
            "channels": item.get("channels"),
        }
        for item in selected_stems
        if isinstance(item, dict)
    ]
    role_ids = [str(item.get("roleId")) for item in stem_rows if item.get("roleId")]
    missing_roles = sorted(REQUIRED_SOURCE_AWARE_STEM_ROLES - set(role_ids))
    source_aware_ready = bool(audio_baseline and audio_baseline.get("inheritsSourceAwareAudioTruth"))
    return {
        "branchAudioTruth": "source-aware-refined-stems" if source_aware_ready else "legacy-raw-source-audio-mix",
        "branchAudioUsesSourceAwareStems": source_aware_ready,
        "branchAudioRenderedFromMasteredSpineOnly": False,
        "masteredSpineOnlyEditingAllowed": False,
        "masteredSpineUse": "review/export/Premiere/final-podcast convenience, not branch edit truth",
        "sourceAwareAudioContractStatus": contract.get("status"),
        "sourceAwareAudioRoleIds": role_ids,
        "sourceAwareAudioMissingRoleIds": missing_roles,
        "sourceAwareAudioReadyStemCount": contract.get("readyStemCount") or 0,
        "selectedRefinedStems": stem_rows,
        "editorTruthUse": contract.get("editorTruthUse")
        or "aligned source stems plus branch metadata on one sequence clock",
    }


def video_filter_for(source: SourceClip | None) -> str:
    if source is None:
        return "color=c=#171a14:s=1920x1080:r=30"
    if source.role == "reference_clip":
        return "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p"
    if source.crop == "charlie-tight":
        return "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1,format=yuv420p"
    if source.crop == "charlie-phone":
        return "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1,format=yuv420p"
    if source.crop == "homer-wide":
        return "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1,format=yuv420p"
    return "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1,format=yuv420p"


def render_chunk(chunk: dict[str, Any], chunk_path: Path) -> None:
    """Render one picture-only chunk.

    Program audio intentionally stays out of camera chunks. Encoding AAC at each
    edit point creates priming and timestamp seams; Quipsly muxes one continuous
    branch audio stream after picture assembly instead.
    """
    duration = float(chunk["duration"])
    frame_count = int(chunk.get("outputFrameCount") or round(duration * 30))
    if frame_count <= 0:
        raise ValueError(f"chunk {chunk.get('index')} has no output frames")
    render_duration = frame_count / 30.0
    source = next((item for item in VIDEO_SOURCES if item.id == chunk["sourceId"]), None)
    command = ["ffmpeg", "-hide_banner", "-y"]
    if source:
        render_path = Path(str(chunk.get("renderPath") or source.path))
        command.extend([
            "-ss", f"{float(chunk['sourceStart']):.3f}",
            "-t", f"{render_duration:.6f}",
            "-i", str(render_path),
        ])
        vf = video_filter_for(source)
    else:
        command.extend([
            "-f", "lavfi",
            "-t", f"{render_duration:.6f}",
            "-i", "color=c=#171a14:s=1920x1080:r=30",
        ])
        vf = "format=yuv420p"

    command.extend([
        "-map", "0:v:0",
        "-vf", vf,
        "-r", "30",
        "-frames:v", str(frame_count),
        "-an",
        "-c:v", "h264_videotoolbox",
        "-b:v", "6500k",
        "-maxrate", "9000k",
        "-bufsize", "14000k",
        "-movflags", "+faststart",
        str(chunk_path),
    ])
    run(command)


def assign_cumulative_output_frames(
    chunks: list[dict[str, Any]],
    frame_rate: int = 30,
) -> list[dict[str, Any]]:
    """Quantize edit boundaries once on the global output clock."""
    output: list[dict[str, Any]] = []
    elapsed = 0.0
    previous_end_frame = 0
    for chunk in chunks:
        elapsed += float(chunk["duration"])
        end_frame = round(elapsed * frame_rate)
        frame_count = end_frame - previous_end_frame
        if frame_count <= 0:
            raise ValueError(
                f"chunk {chunk.get('index')} is shorter than one output frame after cumulative quantization"
            )
        quantized = dict(chunk)
        quantized["outputStartFrame"] = previous_end_frame
        quantized["outputEndFrame"] = end_frame
        quantized["outputFrameCount"] = frame_count
        quantized["outputDurationSeconds"] = round(frame_count / frame_rate, 6)
        output.append(quantized)
        previous_end_frame = end_frame
    return output


def concat_chunks(chunk_paths: list[Path], output_path: Path) -> None:
    """Assemble picture-only chunks without introducing audio edit seams."""
    list_path = output_path.with_suffix(".concat.txt")
    list_path.write_text("".join(f"file {shlex.quote(str(path))}\n" for path in chunk_paths))
    run([
        "ffmpeg", "-hide_banner", "-y",
        "-f", "concat", "-safe", "0", "-i", str(list_path),
        "-map", "0:v:0",
        "-c:v", "copy",
        "-an",
        "-movflags", "+faststart",
        str(output_path),
    ])

def export_audio_only(
    branch: BranchPlan,
    audio_mix: Path,
    output_path: Path,
    ranges: list[RangeChoice] | None = None,
) -> None:
    """Render all selected branch ranges through one continuous AAC encoder."""
    selected_ranges = ranges or branch.ranges
    if not selected_ranges:
        raise ValueError(f"branch {branch.id} has no audio ranges")

    filters: list[str] = []
    labels: list[str] = []
    for index, item in enumerate(selected_ranges):
        label = f"branch_a{index}"
        filters.append(
            f"[0:a]atrim=start={item.start:.6f}:end={item.end:.6f},"
            f"asetpts=PTS-STARTPTS[{label}]"
        )
        labels.append(f"[{label}]")
    filters.append(f"{''.join(labels)}concat=n={len(labels)}:v=0:a=1[program_audio]")

    run([
        "ffmpeg", "-hide_banner", "-y",
        "-i", str(audio_mix),
        "-filter_complex", ";".join(filters),
        "-map", "[program_audio]",
        "-ar", "48000",
        "-ac", "2",
        "-c:a", "aac",
        "-b:a", "192k",
        str(output_path),
    ])


def mux_continuous_audio(picture_path: Path, audio_path: Path, output_path: Path) -> None:
    """Mux one continuous program-audio stream onto assembled picture."""
    run([
        "ffmpeg", "-hide_banner", "-y",
        "-i", str(picture_path),
        "-i", str(audio_path),
        "-map", "0:v:0",
        "-map", "1:a:0",
        "-c:v", "copy",
        "-c:a", "copy",
        "-movflags", "+faststart",
        "-shortest",
        str(output_path),
    ])

def render_branch(
    branch: BranchPlan,
    run_dir: Path,
    audio_mix: Path,
    *,
    audio_baseline: dict[str, Any] | None = None,
    picture_map: dict[str, Any] | None = None,
    proof_seconds: float | None = None,
) -> dict[str, Any]:
    effective_ranges = limit_ranges_for_proof(branch.ranges, proof_seconds)
    chunks = chunk_branch_ranges(branch, picture_map=picture_map)
    if proof_seconds is not None:
        kept: list[dict[str, Any]] = []
        remaining = proof_seconds
        for chunk in chunks:
            if remaining <= 0:
                break
            clipped = dict(chunk)
            if clipped["duration"] > remaining:
                clipped["duration"] = round(remaining, 3)
                clipped["sequenceEnd"] = round(clipped["sequenceStart"] + remaining, 3)
            kept.append(clipped)
            remaining -= clipped["duration"]
        chunks = kept
    chunks = assign_cumulative_output_frames(chunks)

    branch_dir = run_dir / branch.id
    branch_dir.mkdir()
    chunk_dir = branch_dir / "chunks"
    chunk_dir.mkdir()
    chunk_paths: list[Path] = []
    for chunk in chunks:
        chunk_path = chunk_dir / f"{int(chunk['index']):04d}-{chunk['sourceId']}.mp4"
        render_chunk(chunk, chunk_path)
        chunk_paths.append(chunk_path)

    picture_path = branch_dir / f"episode-4-{branch.id}-picture-v001.mp4"
    video_path = branch_dir / f"episode-4-{branch.id}-16x9-v001.mp4"
    audio_path = branch_dir / f"episode-4-{branch.id}-podcast-audio-v001.m4a"
    concat_chunks(chunk_paths, picture_path)
    export_audio_only(branch, audio_mix, audio_path, ranges=effective_ranges)
    mux_continuous_audio(picture_path, audio_path, video_path)

    picture_probe = ffprobe_json(picture_path)
    video_probe = ffprobe_json(video_path)
    audio_probe = ffprobe_json(audio_path)
    manifest = {
        "schema": "quipsly.episode4.full-sync-export.v1",
        "branch": {
            "id": branch.id,
            "title": branch.title,
            "target": branch.target,
            "targetDurationSeconds": round(branch.duration, 3),
            "targetDurationMinutes": round(branch.duration / 60, 2),
            "intendedPlatformUse": branch.intended_platform_use,
            "editorialTradeoff": branch.editorial_tradeoff,
            "warning": branch.warning,
        },
        "truth": {
            "premiereProjectUsedAsSyncEvidence": str(REFERENCE_PROJECT),
            "originalMediaMutated": False,
            "oldQuipslyEpisode4SessionTreatedAsStaleEvidence": True,
            "renderedFromWholeSourceSegmentsAndSequenceRanges": True,
            "audioInheritedFromConformedProductionBaseline": audio_baseline is not None,
            "audioBaselineWasApprovedForBranchInheritance": (
                audio_baseline.get("approvedForBranchInheritance") if audio_baseline else None
            ),
            "audioContractVerifiedForBranchRendering": bool(
                audio_baseline and audio_baseline.get("readyForBranchRender")
            ),
            "audioRenderAuthority": (audio_baseline or {}).get("renderAuthority"),
            "audioBaselineRenderMode": (audio_baseline or {}).get("renderMode"),
            "sourceAwareAudioTruthInherited": bool(
                audio_baseline and audio_baseline.get("inheritsSourceAwareAudioTruth")
            ),
            "sourceAwareAudioContractStatus": (
                ((audio_baseline or {}).get("sourceAwareAudioContract") or {}).get("status")
            ),
            "sourceAwareAudioRoleIds": (
                ((audio_baseline or {}).get("sourceAwareAudioContract") or {}).get("roleIds")
            ),
            "sourceAwareAudioReadyStemCount": (
                ((audio_baseline or {}).get("sourceAwareAudioContract") or {}).get("readyStemCount")
            ),
            "branchAudioRenderedFromSourceAwareStems": bool(
                audio_baseline and audio_baseline.get("inheritsSourceAwareAudioTruth")
            ),
            "branchAudioRenderedFromMasteredSpineOnly": False,
            "masteredSpineOnlyEditingAllowed": False,
            "branchAudioMixPath": str(audio_mix),
            "branchAudioPlan": branch_audio_plan(audio_baseline),
            "chunkSummary": summarize_chunks(chunks),
            "pictureDecisionMapPath": (picture_map or {}).get("path"),
            "pictureDecisionMapSchema": (picture_map or {}).get("schema"),
            "pictureDecisionMapReactionCount": len((picture_map or {}).get("reactionOverrides") or []),
            "mechanicalCameraAlternationUsed": picture_map is None,
            "pictureChunksContainAudio": False,
            "branchAudioEncodedOnce": True,
            "programAudioMuxedOnceAfterPictureAssembly": True,
            "pictureFrameRate": 30,
            "pictureFrameQuantization": "cumulative-sequence-boundaries",
            "pictureExpectedFrameCount": sum(int(chunk["outputFrameCount"]) for chunk in chunks),
            "proofRunSeconds": proof_seconds,
            "externalPublicationReceipt": None,
        },
        "conformedProductionBaseline": audio_baseline,
        "ranges": [asdict(item) | {"duration": round(item.duration, 3)} for item in effective_ranges],
        "chunks": chunks,
        "outputs": {
            "pictureAssembly": {
                "path": str(picture_path),
                "probe": picture_probe,
                "audioPresent": False,
            },
            "video16x9": {
                "path": str(video_path),
                "probe": video_probe,
                "audioMuxStrategy": "single-continuous-program-stream",
            },
            "podcastAudio": {
                "path": str(audio_path),
                "probe": audio_probe,
            },
        },
        "sourceAssumptions": {
            "videoSources": [asdict(item) | {"exists": item.path.exists()} for item in VIDEO_SOURCES],
            "audioEditorialStems": (
                ((audio_baseline or {}).get("sourceAwareAudioContract") or {}).get("selectedRefinedStems")
                or []
            ),
        },
        "transcript": load_transcript_summary(),
    }
    manifest_path = branch_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, default=str))
    notes_path = branch_dir / "README.md"
    notes_path.write_text(render_notes(branch, manifest))
    return {"branch": branch.id, "video": str(video_path), "audio": str(audio_path), "manifest": str(manifest_path)}


def render_notes(branch: BranchPlan, manifest: dict[str, Any]) -> str:
    video_duration = manifest["outputs"]["video16x9"]["probe"].get("format", {}).get("duration", "unknown")
    audio_duration = manifest["outputs"]["podcastAudio"]["probe"].get("format", {}).get("duration", "unknown")
    range_lines = "\n".join(
        f"- {item.start:.2f}s to {item.end:.2f}s ({item.duration/60:.2f} min): {item.reason}"
        for item in branch.ranges
    )
    return f"""# {branch.title}

Target: {branch.target}

Intended use: {branch.intended_platform_use}

Rendered video duration: {video_duration} seconds

Rendered podcast audio duration: {audio_duration} seconds

## Editorial tradeoff

{branch.editorial_tradeoff}

## Warning / next safest action

{branch.warning}

Next safest action: watch the render once for sync and flow before public upload. If time is limited, prioritize the 45-60 minute main release candidate.

## Included sequence ranges

{range_lines}

## Source truth

- Full Sync Premiere project was used as alignment evidence only.
- Original media was not mutated.
- The older Episode 4 v3 Quipsly session was treated as stale/incomplete because it did not include all newly recovered Charlie footage.
- Canonical editorial audio contract verified for branch rendering: {manifest.get("truth", {}).get("audioContractVerifiedForBranchRendering")}
- Audio render authority: {manifest.get("truth", {}).get("audioRenderAuthority")}
- Source-aware audio truth inherited: {manifest.get("truth", {}).get("sourceAwareAudioTruthInherited")}
- Source-aware audio role ids: {manifest.get("truth", {}).get("sourceAwareAudioRoleIds")}
- Branch audio rendered from source-aware stems: {manifest.get("truth", {}).get("branchAudioRenderedFromSourceAwareStems")}
- Branch audio rendered from mastered spine only: {manifest.get("truth", {}).get("branchAudioRenderedFromMasteredSpineOnly")}
- Picture chunks contain audio: {manifest.get("truth", {}).get("pictureChunksContainAudio")}
- Branch audio encoded once: {manifest.get("truth", {}).get("branchAudioEncodedOnce")}
- Program audio muxed once after picture assembly: {manifest.get("truth", {}).get("programAudioMuxedOnceAfterPictureAssembly")}
- This package is local export readiness, not external publication.
"""


def write_run_summary(run_dir: Path, results: list[dict[str, Any]], missing: list[str]) -> None:
    summary = {
        "schema": "quipsly.episode4.full-sync-export-run.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "runDir": str(run_dir),
        "referenceProject": str(REFERENCE_PROJECT),
        "missingInputs": missing,
        "results": results,
        "branches": [
            {
                "id": branch.id,
                "title": branch.title,
                "target": branch.target,
                "plannedDurationSeconds": round(branch.duration, 3),
                "plannedDurationMinutes": round(branch.duration / 60, 2),
                "tradeoff": branch.editorial_tradeoff,
            }
            for branch in BRANCHES
        ],
    }
    (run_dir / "manifests" / "run-summary.json").write_text(json.dumps(summary, indent=2))
    lines = [
        "# Episode 4 Full Sync Export Run",
        "",
        f"Generated: {summary['generatedAt']}",
        f"Run directory: `{run_dir}`",
        f"Reference project: `{REFERENCE_PROJECT}`",
        "",
        "## Outputs",
        "",
    ]
    for result in results:
        lines.append(f"- `{result['branch']}`: video `{result['video']}`, audio `{result['audio']}`")
    if missing:
        lines.extend(["", "## Missing inputs", ""])
        lines.extend(f"- `{item}`" for item in missing)
    (run_dir / "release-notes.md").write_text("\n".join(lines) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser(description="Render Episode 4 Full Sync duration branches.")
    parser.add_argument("--output-root", default=str(DEFAULT_OUTPUT_ROOT))
    parser.add_argument("--run-label", default=None)
    parser.add_argument("--branch", choices=[branch.id for branch in BRANCHES], action="append")
    parser.add_argument("--proof-seconds", type=float, default=None, help="Render only the first N output seconds per branch.")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--force-audio-mix", action="store_true")
    parser.add_argument(
        "--picture-decision-map",
        type=Path,
        default=None,
        help="Optional reviewed whole-source camera decision map. When supplied, it replaces mechanical camera alternation.",
    )
    parser.add_argument(
        "--editorial-stem-manifest",
        type=Path,
        default=DEFAULT_EDITORIAL_STEM_MANIFEST,
        help="Canonical equal-clock Charlie/Homer/reference stem manifest used by the active renderer.",
    )
    parser.add_argument(
        "--conformed-baseline-dir",
        type=Path,
        default=None,
        help="Optional Audio Workbench conformed baseline folder. Must be human-approved for branch inheritance.",
    )
    parser.add_argument(
        "--allow-unapproved-conformed-baseline-proof",
        action="store_true",
        help="Allow a conformed baseline with pending human listen proof only for proof renders. Do not use for publishing.",
    )
    args = parser.parse_args()
    picture_map = load_picture_decision_map(args.picture_decision_map)

    selected = [branch for branch in BRANCHES if not args.branch or branch.id in set(args.branch)]
    audio_baseline = (
        load_conformed_audio_baseline(
            args.conformed_baseline_dir,
            allow_unapproved=args.allow_unapproved_conformed_baseline_proof,
        )
        if args.conformed_baseline_dir
        else load_editorial_stem_audio_baseline(args.editorial_stem_manifest)
    )
    paths = [REFERENCE_PROJECT, TRANSCRIPT_SPINE]
    paths.extend(source.path for source in VIDEO_SOURCES)
    for stem in ((audio_baseline.get("sourceAwareAudioContract") or {}).get("selectedRefinedStems") or []):
        if isinstance(stem, dict) and stem.get("path"):
            paths.append(Path(str(stem["path"])))
    missing = require_files(paths)

    output_root = Path(args.output_root).expanduser()
    if args.dry_run:
        dry_run_blockers = []
        if audio_baseline and not audio_baseline.get("readyForBranchRender"):
            dry_run_blockers.extend(audio_baseline.get("blockers", []))
        audio_plan = branch_audio_plan(audio_baseline)
        payload = {
            "status": "dry-run-blocked" if dry_run_blockers else "dry-run",
            "outputRoot": str(output_root),
            "missingInputs": missing,
            "conformedProductionBaseline": audio_baseline,
            "branchAudioPlan": audio_plan,
            "branchAudioTruth": audio_plan["branchAudioTruth"],
            "branchAudioUsesSourceAwareStems": audio_plan["branchAudioUsesSourceAwareStems"],
            "branchAudioRenderedFromMasteredSpineOnly": False,
            "masteredSpineOnlyEditingAllowed": False,
            "renderBlocked": bool(dry_run_blockers),
            "renderBlockers": dry_run_blockers,
            "branches": [branch_plan_payload(branch) for branch in selected],
            "videoSources": [asdict(item) | {"exists": item.path.exists()} for item in VIDEO_SOURCES],
            "pictureDecisionMap": {
                "path": (picture_map or {}).get("path"),
                "schema": (picture_map or {}).get("schema"),
                "decisionCount": len((picture_map or {}).get("decisions") or []),
                "reactionCount": len((picture_map or {}).get("reactionOverrides") or []),
                "mechanicalCameraAlternationUsed": picture_map is None,
            },
            "audioEditorialStems": (
                (audio_baseline.get("sourceAwareAudioContract") or {}).get("selectedRefinedStems") or []
            ),
            "transcript": load_transcript_summary(),
            "truth": {
                "premiereProjectUsedAsSyncEvidenceOnly": True,
                "originalMediaMutated": False,
                "sourceRecordingsStayWhole": True,
                "branchDecisionsLiveAsSequenceMetadata": True,
                "dryRunRenderedMedia": False,
                "externalPublicationReceipt": None,
            },
        }
        print(json.dumps(payload, indent=2, default=str))
        return 0 if not missing and not dry_run_blockers else 2

    if audio_baseline and not audio_baseline.get("readyForBranchRender"):
        print("Episode audio contract is not technically safe for branch rendering:", file=sys.stderr)
        for item in audio_baseline.get("blockers", []):
            print(f"- {item}", file=sys.stderr)
        print(f"Review cockpit: {audio_baseline.get('audioReviewCockpitHtml')}", file=sys.stderr)
        return 3

    if missing:
        print("Missing required Episode 4 inputs:", file=sys.stderr)
        for item in missing:
            print(f"- {item}", file=sys.stderr)
        return 2

    run_dir = create_run_dir(output_root, args.run_label)
    required_mix_duration = max(
        (
            item.end
            for branch in selected
            for item in limit_ranges_for_proof(branch.ranges, args.proof_seconds)
        ),
        default=0.0,
    )
    audio_mix = build_source_aware_branch_audio_mix(
        run_dir,
        audio_baseline,
        force=args.force_audio_mix,
        duration_seconds=required_mix_duration,
    )
    results: list[dict[str, Any]] = []
    for branch in selected:
        results.append(
            render_branch(
                branch,
                run_dir,
                audio_mix,
                audio_baseline=audio_baseline,
                picture_map=picture_map,
                proof_seconds=args.proof_seconds,
            )
        )
    write_run_summary(run_dir, results, missing)
    print(json.dumps({"status": "rendered", "runDir": str(run_dir), "results": results}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
