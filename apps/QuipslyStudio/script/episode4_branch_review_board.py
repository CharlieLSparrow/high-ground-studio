#!/usr/bin/env python3
"""Read-only branch review board for Episode 4 full-sync exports.

The Episode 4 recovery run creates several duration branches from the simplified
Full Sync Premiere reference. This board makes those rendered branches explicit
to humans, Quipsly Studio, and agents without claiming human approval or external
publication.
"""
from __future__ import annotations

import argparse
import json
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_RUN_DIR = Path(
    "/Volumes/My Passport/Episode_and_Shorts_Test/"
    "Episode_4_Full_Sync_Edits/20260709-episode4-full-sync-v001"
)
REVIEW_ORDER = ("main-45-60", "tight-30-45", "extended-60-80")
TARGETS = {
    "tight-30-45": (30 * 60, 45 * 60),
    "main-45-60": (45 * 60, 60 * 60),
    "extended-60-80": (60 * 60, 80 * 60),
}


@dataclass(frozen=True)
class MediaProbe:
    exists: bool
    sizeBytes: int = 0
    durationSeconds: float | None = None
    width: int | None = None
    height: int | None = None
    videoCodec: str | None = None
    audioCodec: str | None = None
    audioChannels: int | None = None
    error: str | None = None

    @property
    def durationMinutes(self) -> float | None:
        if self.durationSeconds is None:
            return None
        return round(self.durationSeconds / 60, 2)

    @property
    def resolution(self) -> str:
        if self.width and self.height:
            return f"{self.width}x{self.height}"
        return "unknown"


def read_json(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return data if isinstance(data, dict) else {}


def probe_media(path: Path) -> MediaProbe:
    if not path.exists():
        return MediaProbe(exists=False, error="missing file")

    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-print_format",
                "json",
                "-show_format",
                "-show_streams",
                str(path),
            ],
            check=True,
            capture_output=True,
            text=True,
            timeout=20,
        )
        payload = json.loads(result.stdout)
    except Exception as exc:  # pragma: no cover - this is a CLI diagnostic path.
        return MediaProbe(exists=True, sizeBytes=path.stat().st_size, error=str(exc))

    streams = payload.get("streams") if isinstance(payload, dict) else []
    if not isinstance(streams, list):
        streams = []
    video = next((stream for stream in streams if stream.get("codec_type") == "video"), {})
    audio = next((stream for stream in streams if stream.get("codec_type") == "audio"), {})
    fmt = payload.get("format") if isinstance(payload, dict) else {}
    duration: float | None = None
    try:
        duration = float(fmt.get("duration"))
    except (TypeError, ValueError):
        duration = None

    def as_int(value: Any) -> int | None:
        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    return MediaProbe(
        exists=True,
        sizeBytes=path.stat().st_size,
        durationSeconds=duration,
        width=as_int(video.get("width")),
        height=as_int(video.get("height")),
        videoCodec=video.get("codec_name"),
        audioCodec=audio.get("codec_name"),
        audioChannels=as_int(audio.get("channels")),
    )


def find_first(folder: Path, patterns: tuple[str, ...]) -> Path | None:
    for pattern in patterns:
        matches = sorted(folder.glob(pattern))
        if matches:
            return matches[0]
    return None


def source_summary(manifest: dict[str, Any]) -> dict[str, Any]:
    chunks = manifest.get("chunks")
    if not isinstance(chunks, list):
        chunks = []
    sources: dict[str, dict[str, Any]] = {}
    role_counts: dict[str, int] = {}
    for chunk in chunks:
        if not isinstance(chunk, dict):
            continue
        source_id = str(chunk.get("sourceId") or chunk.get("sourceLabel") or "unknown")
        role = str(chunk.get("sourceRole") or "unknown")
        role_counts[role] = role_counts.get(role, 0) + 1
        sources.setdefault(
            source_id,
            {
                "sourceId": source_id,
                "label": chunk.get("sourceLabel") or source_id,
                "role": role,
                "path": chunk.get("sourcePath") or "",
                "chunkCount": 0,
            },
        )["chunkCount"] += 1

    return {
        "roleChunkCounts": dict(sorted(role_counts.items())),
        "sources": sorted(sources.values(), key=lambda item: (item["role"], item["label"])),
    }


def branch_state(run_dir: Path, branch_id: str) -> dict[str, Any]:
    folder = run_dir / branch_id
    manifest_path = folder / "manifest.json"
    readme_path = folder / "README.md"
    manifest = read_json(manifest_path)
    branch = manifest.get("branch") if isinstance(manifest.get("branch"), dict) else {}
    truth = manifest.get("truth") if isinstance(manifest.get("truth"), dict) else {}
    ranges = manifest.get("ranges") if isinstance(manifest.get("ranges"), list) else []
    chunks = manifest.get("chunks") if isinstance(manifest.get("chunks"), list) else []

    video_path = find_first(folder, ("*16x9*.mp4", "*.mp4"))
    audio_path = find_first(folder, ("*podcast-audio*.m4a", "*.m4a", "*.aac", "*.mp3"))
    video_probe = probe_media(video_path) if video_path else MediaProbe(exists=False, error="missing video")
    audio_probe = probe_media(audio_path) if audio_path else MediaProbe(exists=False, error="missing podcast audio")

    av_delta: float | None = None
    if video_probe.durationSeconds is not None and audio_probe.durationSeconds is not None:
        av_delta = round(abs(video_probe.durationSeconds - audio_probe.durationSeconds), 3)

    minimum, maximum = TARGETS.get(branch_id, (None, None))
    target_pass = False
    if video_probe.durationSeconds is not None and minimum is not None and maximum is not None:
        target_pass = minimum <= video_probe.durationSeconds <= maximum

    warnings: list[str] = []
    if not folder.exists():
        warnings.append("branch folder missing")
    if not manifest_path.exists():
        warnings.append("manifest missing")
    if not video_probe.exists:
        warnings.append("long-form 16:9 video missing")
    if not audio_probe.exists:
        warnings.append("podcast audio missing")
    if video_probe.error:
        warnings.append(f"video probe warning: {video_probe.error}")
    if audio_probe.error:
        warnings.append(f"audio probe warning: {audio_probe.error}")
    if av_delta is not None and av_delta > 0.5:
        warnings.append(f"A/V duration spread is {av_delta}s")
    if not target_pass:
        warnings.append("video duration is outside the named duration target")
    if truth.get("externalPublicationReceipt") is not None:
        warnings.append("manifest contains an external receipt; verify truth boundary before reporting unpublished")

    status = "local-export-ready-needs-proof-watch"
    if warnings:
        status = "needs-attention"

    return {
        "id": branch_id,
        "title": branch.get("title") or branch_id,
        "target": branch.get("target") or branch_id,
        "targetDurationMinutes": branch.get("targetDurationMinutes") or video_probe.durationMinutes,
        "intendedPlatformUse": branch.get("intendedPlatformUse") or "",
        "editorialTradeoff": branch.get("editorialTradeoff") or "",
        "warning": branch.get("warning") or "",
        "status": status,
        "folder": str(folder),
        "manifestPath": str(manifest_path),
        "readmePath": str(readme_path) if readme_path.exists() else "",
        "videoPath": str(video_path) if video_path else "",
        "podcastAudioPath": str(audio_path) if audio_path else "",
        "video": {
            **video_probe.__dict__,
            "durationMinutes": video_probe.durationMinutes,
            "resolution": video_probe.resolution,
        },
        "podcastAudio": {
            **audio_probe.__dict__,
            "durationMinutes": audio_probe.durationMinutes,
            "resolution": audio_probe.resolution,
        },
        "avDurationDeltaSeconds": av_delta,
        "targetPass": target_pass,
        "rangeCount": len(ranges),
        "chunkCount": len(chunks),
        "sourceSummary": source_summary(manifest),
        "truth": {
            "premiereProjectUsedAsSyncEvidence": truth.get("premiereProjectUsedAsSyncEvidence"),
            "originalMediaMutated": truth.get("originalMediaMutated", False),
            "oldQuipslyEpisode4SessionTreatedAsStaleEvidence": truth.get(
                "oldQuipslyEpisode4SessionTreatedAsStaleEvidence", True
            ),
            "renderedFromWholeSourceSegmentsAndSequenceRanges": truth.get(
                "renderedFromWholeSourceSegmentsAndSequenceRanges", True
            ),
            "externalPublicationReceipt": truth.get("externalPublicationReceipt"),
        },
        "warnings": warnings,
        "nextSafestAction": next_action_for(branch_id, status),
    }


def next_action_for(branch_id: str, status: str) -> str:
    if status != "local-export-ready-needs-proof-watch":
        return "Open the branch manifest and media files, fix the listed warning, then render a new version without overwriting this one."
    if branch_id == "main-45-60":
        return "Proof-watch this first as the likely YouTube, Spotify, Apple Podcast, and podcast-audio candidate."
    if branch_id == "tight-30-45":
        return "Compare after the main cut if the main release feels too long or needs a discovery-friendly version."
    return "Use as the deep cut or Patreon/archive option if the extra context earns its runtime."


def build_board(run_dir: Path) -> dict[str, Any]:
    branches = [branch_state(run_dir, branch_id) for branch_id in REVIEW_ORDER]
    structural_pass = all(branch["status"] == "local-export-ready-needs-proof-watch" for branch in branches)
    return {
        "schema": "quipsly.episode4.branch-review-board.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "episode": 4,
        "runDir": str(run_dir),
        "status": "local-export-ready-needs-proof-watch" if structural_pass else "needs-attention",
        "reviewOrder": list(REVIEW_ORDER),
        "branches": branches,
        "truth": {
            "scope": "Local render review board only.",
            "humanApproval": False,
            "externalPublicationReceipt": None,
            "externallyPublished": False,
            "originalMediaMutated": False,
            "premiereProjectUsedAsSyncEvidenceOnly": True,
            "sourceModel": "Whole source segments and sequence ranges; not chopped canonical media.",
        },
        "nextSafestAction": (
            "Proof-watch main-45-60 first, then compare tight and extended before choosing the publishing candidate."
            if structural_pass
            else "Resolve the branch warnings shown below, creating a new version rather than overwriting v001."
        ),
    }


def markdown(board: dict[str, Any]) -> str:
    lines = [
        "# Episode 4 full-sync branch review board",
        "",
        f"- Run: `{board['runDir']}`",
        f"- Status: `{board['status']}`",
        "- Truth: local export readiness only; no human approval, upload, schedule, publication, or receipt is claimed.",
        "- Model: Premiere is sync evidence only; Quipsly renders from whole source segments plus transparent sequence ranges.",
        "",
        "## Review order",
        "",
    ]
    for index, branch_id in enumerate(board["reviewOrder"], start=1):
        branch = next(item for item in board["branches"] if item["id"] == branch_id)
        lines.append(f"{index}. `{branch_id}` - {branch['nextSafestAction']}")
    lines.extend(
        [
            "",
            "## Branches",
            "",
            "| Branch | Status | Runtime | A/V delta | Resolution | Target | Next action |",
            "|---|---:|---:|---:|---:|---|---|",
        ]
    )
    for branch in board["branches"]:
        runtime = branch["video"]["durationMinutes"]
        delta = branch["avDurationDeltaSeconds"]
        lines.append(
            "| "
            + " | ".join(
                [
                    f"`{branch['id']}`",
                    f"`{branch['status']}`",
                    f"{runtime:.2f} min" if isinstance(runtime, (float, int)) else "unknown",
                    f"{delta:.3f}s" if isinstance(delta, (float, int)) else "unknown",
                    branch["video"]["resolution"],
                    str(branch["target"]),
                    branch["nextSafestAction"],
                ]
            )
            + " |"
        )

    lines.extend(["", "## Exact files"])
    for branch in board["branches"]:
        lines.extend(
            [
                "",
                f"### {branch['title']}",
                "",
                f"- Video: `{branch['videoPath']}`",
                f"- Podcast audio: `{branch['podcastAudioPath']}`",
                f"- Manifest: `{branch['manifestPath']}`",
                f"- README: `{branch['readmePath']}`",
                f"- Intended use: {branch['intendedPlatformUse']}",
                f"- Editorial tradeoff: {branch['editorialTradeoff']}",
                f"- Warning: {branch['warning']}",
                f"- Ranges/chunks: {branch['rangeCount']} ranges, {branch['chunkCount']} render chunks",
            ]
        )
        if branch["warnings"]:
            lines.append("- Board warnings:")
            for warning in branch["warnings"]:
                lines.append(f"  - {warning}")
        else:
            lines.append("- Board warnings: none from structural checks.")

        role_counts = branch["sourceSummary"]["roleChunkCounts"]
        if role_counts:
            role_text = ", ".join(f"{role}: {count}" for role, count in role_counts.items())
            lines.append(f"- Source role chunk mix: {role_text}")

    lines.extend(
        [
            "",
            "## Next safest action",
            "",
            board["nextSafestAction"],
            "",
            "This board is intentionally reversible and read-only. If a better Episode 4 cut is made, create `v002` or later and leave this run intact.",
        ]
    )
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-dir", default=str(DEFAULT_RUN_DIR), help="Episode 4 full-sync run folder.")
    parser.add_argument("--json", action="store_true", help="Emit JSON instead of Markdown.")
    parser.add_argument("--markdown", action="store_true", help="Emit Markdown. This is the default.")
    parser.add_argument("--write", help="Optional output path for the emitted board.")
    args = parser.parse_args()

    board = build_board(Path(args.run_dir))
    output = json.dumps(board, indent=2, sort_keys=True) + "\n" if args.json and not args.markdown else markdown(board)
    if args.write:
        output_path = Path(args.write)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(output, encoding="utf-8")
    print(output, end="")
    return 0 if board["status"] == "local-export-ready-needs-proof-watch" else 1


if __name__ == "__main__":
    raise SystemExit(main())
