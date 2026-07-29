#!/usr/bin/env python3
"""Build the Episode 4 audio spine registry.

This intentionally does not modify original media or QuipslyStudio session data.
It normalizes audio workbench outputs into one product-facing contract so the
editor can later select a mastered spine without treating it as a random extra
timeline lane.
"""

from __future__ import annotations

import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


EPISODE_SLUG = "episode-4"
BASELINE_ID = "episode-4-sync-baseline-v005"

ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
BASELINE_DIR = ROOT / (
    "Episode_4_Sync_Producer_Takes/"
    "20260709-episode4-conformed-audio-baseline-v005-20260709-183059/"
    "work/conformed-production-baseline"
)
READY_DIR = ROOT / "Episode_4_Upload_Candidates/READY_TO_UPLOAD_EP4_20260712"
REGISTRY_DIR = ROOT / "Episode_4_Audio_Spine_Registry"

PROMOTIONS = [
    {
        "id": "episode4-full-source-master-v006-homer-preserving-clean",
        "label": "Full source master v006, Homer preserving clean",
        "dir": BASELINE_DIR / "profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310",
        "manifest": "audio-workbench-profile-promotion-v006.json",
        "kind": "fullSourceMaster",
        "scope": "full-sync-source-layer",
        "status": "machine-preferred-human-listen-required",
        "safeFor": ["human-listen-gate", "editor-spine-candidate", "source-aware-rebuilds", "manual-premiere-review"],
        "notSafeFor": ["publication-without-human-listen-approval"],
        "notes": (
            "Current official machine-preferred Episode 4 audio-spine candidate. "
            "Branch rendering remains locked until Charlie records a guarded human listen decision."
        ),
    },
    {
        "id": "episode4-full-source-master-v008-homer-rich-balanced",
        "label": "Full source master v008, Homer rich balanced",
        "dir": BASELINE_DIR / "profile-promotion-v005-to-v008-homer-rich-balanced-20260712-225859",
        "manifest": "audio-workbench-profile-promotion-v008.json",
        "kind": "fullSourceMaster",
        "scope": "full-sync-source-layer",
        "status": "candidate",
        "safeFor": ["editor-spine-candidate", "source-aware-rebuilds", "manual-listen-review"],
        "notSafeFor": ["direct-replacement-for-59m26-final-video"],
        "notes": (
            "Full-length source-aware mastered spine. Use as the audio truth for "
            "new edit branches that are rendered from synced source decisions."
        ),
    },
    {
        "id": "episode4-full-source-master-v009-homer-forward-rich",
        "label": "Full source master v009, Homer forward rich",
        "dir": BASELINE_DIR / "profile-promotion-v005-to-v009-homer-forward-rich-20260712-231411",
        "manifest": "audio-workbench-profile-promotion-v009.json",
        "kind": "fullSourceMaster",
        "scope": "full-sync-source-layer",
        "status": "candidate",
        "safeFor": ["editor-spine-candidate", "source-aware-rebuilds", "manual-listen-review"],
        "notSafeFor": ["direct-replacement-for-59m26-final-video"],
        "notes": (
            "Full-length source-aware mastered spine with a more forward Homer profile. "
            "Use as an alternate source-layer candidate, not as a duration-safe mux."
        ),
    },
]


def read_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def probe(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"exists": False, "path": str(path)}

    command = [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration,size:stream=index,codec_type,codec_name,width,height,sample_rate,channels",
        "-of",
        "json",
        str(path),
    ]
    result = subprocess.run(command, check=True, capture_output=True, text=True)
    payload = json.loads(result.stdout or "{}")
    fmt = payload.get("format") or {}
    streams = payload.get("streams") or []
    return {
        "exists": True,
        "path": str(path),
        "durationSeconds": float(fmt.get("duration") or 0),
        "sizeBytes": int(fmt.get("size") or 0),
        "streams": streams,
    }


def path_from_output(outputs: dict[str, Any], key: str) -> Path | None:
    value = (outputs.get(key) or {}).get("path")
    return Path(value) if value else None


def promotion_candidate(spec: dict[str, Any]) -> dict[str, Any]:
    manifest_path = spec["dir"] / spec["manifest"]
    manifest = read_json(manifest_path)
    outputs = manifest.get("outputs") or {}
    artifact_paths = manifest.get("artifactPaths") or {}
    source_aware_stem_manifest_path = spec["dir"] / "AUDIO_SOURCE_AWARE_STEM_MANIFEST.json"
    source_aware_stem_set = source_aware_stem_payload(source_aware_stem_manifest_path)

    master_wav = path_from_output(outputs, "masterWav")
    master_m4a = path_from_output(outputs, "masterM4a")
    source_mix = path_from_output(outputs, "sourceAwareMix")
    upload_wav = Path(artifact_paths["uploadSafeWav"]) if artifact_paths.get("uploadSafeWav") else None
    upload_m4a = Path(artifact_paths["uploadSafeM4a"]) if artifact_paths.get("uploadSafeM4a") else None

    return {
        "id": spec["id"],
        "label": spec["label"],
        "episodeSlug": EPISODE_SLUG,
        "kind": spec["kind"],
        "scope": spec["scope"],
        "status": spec["status"],
        "sourceBaselineId": manifest.get("sourceBaselineId") or BASELINE_ID,
        "sourceBaselineVersion": manifest.get("sourceBaselineVersion"),
        "selectedProfile": manifest.get("selectedProfile"),
        "selectedProfileIntent": manifest.get("selectedProfileIntent"),
        "timelineMapping": {
            "clock": "episode-sequence-time",
            "timelineStartSeconds": 0,
            "sourceOffsetSeconds": 0,
            "durationPolicy": "full-source-duration",
        },
        "artifacts": {
            "masterWav": probe(master_wav) if master_wav else None,
            "masterM4a": probe(master_m4a) if master_m4a else None,
            "sourceAwareMix": probe(source_mix) if source_mix else None,
            "uploadSafeWav": probe(upload_wav) if upload_wav else None,
            "uploadSafeM4a": probe(upload_m4a) if upload_m4a else None,
        },
        "sourceAwareStemSet": source_aware_stem_set,
        "reports": {
            "promotionManifest": str(manifest_path),
            "variantQc": manifest.get("variantQcPath"),
            "sourceActivity": first_match(spec["dir"], "audio-workbench-source-activity-*.json"),
            "sourceBalance": first_match(spec["dir"], "audio-master-source-balance-audit-*.json"),
            "sourceAwareStemManifest": existing_path(spec["dir"], "AUDIO_SOURCE_AWARE_STEM_MANIFEST.json"),
            "segmentLoudnessMap": existing_path(spec["dir"], "AUDIO_SEGMENT_LOUDNESS_MAP.json"),
            "fastReadback": existing_path(spec["dir"], "AUDIO_FAST_READBACK_CHECK.json"),
        },
        "safeFor": spec["safeFor"],
        "notSafeFor": spec["notSafeFor"],
        "notes": spec["notes"],
    }


def first_match(directory: Path, pattern: str) -> str | None:
    matches = sorted(directory.glob(pattern))
    return str(matches[-1]) if matches else None


def source_aware_stem_payload(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    manifest = read_json(path)
    roles = []
    for role in manifest.get("roles") or []:
        roles.append(
            {
                "roleId": role.get("roleId"),
                "speaker": role.get("speaker"),
                "label": role.get("label"),
                "purpose": role.get("purpose"),
                "status": role.get("status"),
                "sequenceClockPolicy": role.get("sequenceClockPolicy"),
                "doNotDo": role.get("doNotDo"),
                "alignedSourceStem": role.get("alignedSourceStem"),
                "selectedRefinedStem": role.get("selectedRefinedStem"),
                "alignedSummary": role.get("alignedSummary"),
                "contributionSummary": role.get("contributionSummary"),
            }
        )
    mix_recipe = manifest.get("mixRecipe") or {}
    canonical_editor_truth = str(mix_recipe.get("canonicalEditorTruth") or "")
    if canonical_editor_truth and "review/export convenience" not in canonical_editor_truth:
        canonical_editor_truth = (
            f"{canonical_editor_truth} The mastered spine is a review/export convenience artifact; "
            "editor timing truth stays in the source-aware refined stems and metadata decisions."
        )
    return {
        "status": manifest.get("status"),
        "manifestPath": str(path),
        "editorAudioTruthRule": manifest.get("editorAudioTruthRule"),
        "sequenceClock": manifest.get("sequenceClock"),
        "requiredStemCount": manifest.get("requiredStemCount"),
        "resolvedStemCount": manifest.get("resolvedStemCount"),
        "readyStemCount": manifest.get("readyStemCount"),
        "missingRequiredRoles": manifest.get("missingRequiredRoles") or [],
        "roles": roles,
        "mixRecipe": {
            "canonicalEditorTruth": canonical_editor_truth or None,
            "recipe": mix_recipe.get("recipe"),
            "masterM4a": mix_recipe.get("masterM4a"),
            "masterWav": mix_recipe.get("masterWav"),
        },
        "safety": manifest.get("safety") or {},
    }


def existing_path(directory: Path, filename: str) -> str | None:
    path = directory / filename
    return str(path) if path.exists() else None


def duration_safe_candidate() -> dict[str, Any] | None:
    pointer = READY_DIR / "LATEST_DURATION_SAFE_AUDIO_REMASTER_DIR.txt"
    if not pointer.exists():
        return None

    remaster_dir = Path(pointer.read_text(encoding="utf-8").strip())
    audio_m4a = remaster_dir / "High-Ground-Odyssey-Episode-04-main-59m26-podcast-audio-v008-remastered.m4a"
    audio_mp3 = remaster_dir / "High-Ground-Odyssey-Episode-04-main-59m26-podcast-audio-v008-remastered.mp3"
    audio_wav = remaster_dir / "High-Ground-Odyssey-Episode-04-main-59m26-podcast-audio-v008-remastered.wav"
    video_mp4 = remaster_dir / "High-Ground-Odyssey-Episode-04-main-59m26-video-v008-audio-remastered.mp4"
    loudnorm = remaster_dir / "loudnorm-v008-duration-safe-remaster.txt"

    return {
        "id": "episode4-final-branch-remaster-v008-duration-safe",
        "label": "Final edit branch remaster v008, duration safe",
        "episodeSlug": EPISODE_SLUG,
        "kind": "branchRemaster",
        "scope": "rendered-final-edit-branch",
        "status": "deadline-safe-candidate",
        "sourceBaselineId": "episode-4-main-59m26-video-v007",
        "selectedProfile": "duration-safe-final-mix-remaster",
        "timelineMapping": {
            "clock": "rendered-final-edit-time",
            "timelineStartSeconds": 0,
            "sourceOffsetSeconds": 0,
            "durationPolicy": "matches-existing-final-edit-duration",
        },
        "artifacts": {
            "masterWav": probe(audio_wav),
            "masterM4a": probe(audio_m4a),
            "masterMp3": probe(audio_mp3),
            "muxedVideoMp4": probe(video_mp4),
        },
        "reports": {
            "loudnormScan": str(loudnorm) if loudnorm.exists() else None,
            "sourcePointer": str(pointer),
        },
        "safeFor": [
            "deadline-upload-review",
            "manual-premiere-drop-in-for-final-59m26-branch",
            "youtube-upload-candidate",
            "podcast-upload-candidate",
        ],
        "notSafeFor": [
            "full-source-sync-layer",
            "new-branch-edit-spine-without-duration-map",
        ],
        "notes": (
            "Duration-preserving remaster of the existing 59m26 final edit branch. "
            "This is useful for the immediate upload lane, but it is not the canonical "
            "full source spine for future QuipslyStudio branch editing."
        ),
    }


def markdown_summary(registry: dict[str, Any]) -> str:
    lines = [
        "# Episode 4 Audio Spine Registry",
        "",
        "This registry separates full-source mastered spines from duration-safe final-branch remasters.",
        "That distinction is the guardrail that keeps QuipslyStudio from becoming a cobbled-together monster.",
        "",
        f"Generated: {registry['generatedAt']}",
        f"Episode: `{registry['episodeSlug']}`",
        "",
        "## Candidates",
        "",
    ]
    for candidate in registry["candidates"]:
        duration = None
        for artifact in candidate.get("artifacts", {}).values():
            if isinstance(artifact, dict) and artifact.get("durationSeconds"):
                duration = artifact["durationSeconds"]
                break
        duration_text = f"{duration:.2f}s" if isinstance(duration, (int, float)) else "unknown"
        lines.extend(
            [
                f"### {candidate['label']}",
                "",
                f"- id: `{candidate['id']}`",
                f"- kind: `{candidate['kind']}`",
                f"- scope: `{candidate['scope']}`",
                f"- status: `{candidate['status']}`",
                f"- duration: `{duration_text}`",
                f"- safe for: {', '.join(candidate.get('safeFor', []))}",
                f"- not safe for: {', '.join(candidate.get('notSafeFor', []))}",
                f"- note: {candidate.get('notes', '')}",
                f"- source-aware stems: `{source_aware_summary(candidate)}`",
                "",
            ]
        )
    lines.extend(
        [
            "## Editor rule",
            "",
            "The editor should select an audio spine by registry id. Full-source candidates drive new source-aware edit branches. "
            "Final-branch remasters can be used for upload review or manual replacement of an already-rendered branch, but they must not be silently treated as the canonical source layer.",
            "",
        ]
    )
    return "\n".join(lines)


def source_aware_summary(candidate: dict[str, Any]) -> str:
    stem_set = candidate.get("sourceAwareStemSet")
    if not isinstance(stem_set, dict):
        return "not attached"
    roles = stem_set.get("roles") or []
    role_ids = ", ".join(str(role.get("roleId")) for role in roles if role.get("roleId"))
    return f"{stem_set.get('readyStemCount')}/{stem_set.get('requiredStemCount')} ready ({role_ids})"


def main() -> None:
    REGISTRY_DIR.mkdir(parents=True, exist_ok=True)
    candidates = [promotion_candidate(spec) for spec in PROMOTIONS]
    branch_candidate = duration_safe_candidate()
    if branch_candidate:
        candidates.append(branch_candidate)

    registry = {
        "schema": "quipsly.audioSpineRegistry.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "episodeSlug": EPISODE_SLUG,
        "baselineDir": str(BASELINE_DIR),
        "readyDir": str(READY_DIR),
        "candidates": candidates,
        "selectionPolicy": {
            "fullSourceDefault": "episode4-full-source-master-v006-homer-preserving-clean",
            "deadlineUploadDefault": "episode4-final-branch-remaster-v008-duration-safe",
            "selectionMustBeExplicit": True,
            "branchRenderingLockedUntilHumanListenApproval": True,
        },
    }

    registry_path = REGISTRY_DIR / "episode4-audio-spine-registry.json"
    summary_path = REGISTRY_DIR / "episode4-audio-spine-registry.md"
    registry_path.write_text(json.dumps(registry, indent=2) + "\n", encoding="utf-8")
    summary_path.write_text(markdown_summary(registry), encoding="utf-8")

    for pointer_dir in [BASELINE_DIR, READY_DIR]:
        if pointer_dir.exists():
            (pointer_dir / "LATEST_AUDIO_SPINE_REGISTRY.txt").write_text(str(registry_path) + "\n", encoding="utf-8")

    print(f"Wrote {registry_path}")
    print(f"Wrote {summary_path}")


if __name__ == "__main__":
    main()
