#!/usr/bin/env python3
"""Generic Quipsly final upload packet QC.

This is the reusable version of the Episode 4 v007 final packet checker.

It verifies a local ready-to-upload packet without opening the editor:
- recommended long-form video
- recommended podcast audio
- optional fallback MP3
- optional upload-safe captions
- optional metadata/copy document
- optional social shorts manifest and rendered clips
- optional README/handoff docs that point at the recommended artifacts

It writes JSON and Markdown evidence into the ready folder. It does not upload,
publish, schedule, mutate external accounts, or touch original media.
"""

from __future__ import annotations

import argparse
import json
import stat
import subprocess
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class PacketCheck:
    id: str
    status: str
    detail: str
    path: str | None = None


@dataclass
class PacketReport:
    schema: str = "quipsly.final-upload-packet-qc.v1"
    episodeId: str = ""
    title: str = ""
    status: str = "not-run"
    readyDir: str = ""
    checkCount: int = 0
    hardStopCount: int = 0
    warningCount: int = 0
    recommendedUpload: dict[str, str | None] = field(default_factory=dict)
    truth: dict[str, Any] = field(default_factory=dict)
    checks: list[PacketCheck] = field(default_factory=list)


def ffprobe_summary(path: Path) -> dict[str, Any]:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration,size,bit_rate",
            "-show_streams",
            "-of",
            "json",
            str(path),
        ],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if result.returncode != 0:
        return {"error": result.stderr.strip() or "ffprobe failed"}
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        return {"error": f"ffprobe JSON parse failed: {exc}"}


def add_file_check(checks: list[PacketCheck], check_id: str, path: Path | None) -> None:
    if path is None:
        return
    if path.exists() and path.stat().st_size > 0:
        checks.append(
            PacketCheck(
                id=check_id,
                status="passed",
                detail=f"exists, {path.stat().st_size} bytes",
                path=str(path),
            )
        )
    else:
        checks.append(
            PacketCheck(
                id=check_id,
                status="failed",
                detail="missing or empty",
                path=str(path),
            )
        )


def add_condition_check(
    checks: list[PacketCheck],
    check_id: str,
    passed: bool,
    detail: str,
    path: Path | None = None,
    *,
    warning: bool = False,
) -> None:
    checks.append(
        PacketCheck(
            id=check_id,
            status="passed" if passed else "warning" if warning else "failed",
            detail=detail,
            path=str(path) if path else None,
        )
    )


def rel_path(path: Path | None, ready_dir: Path) -> str | None:
    if path is None:
        return None
    try:
        return str(path.relative_to(ready_dir))
    except ValueError:
        return str(path)


def resolve_optional(ready_dir: Path, value: str | None) -> Path | None:
    if not value:
        return None
    path = Path(value)
    return path if path.is_absolute() else ready_dir / path


def validate_long_form_video(
    checks: list[PacketCheck],
    path: Path,
    *,
    expected_width: int,
    expected_height: int,
) -> None:
    probe = ffprobe_summary(path)
    if "error" in probe:
        add_condition_check(checks, "long-form-video-ffprobe", False, probe["error"], path)
        return
    streams = probe.get("streams", [])
    video = next((s for s in streams if s.get("codec_type") == "video"), {})
    audio = next((s for s in streams if s.get("codec_type") == "audio"), {})
    passed = (
        video.get("codec_name") == "h264"
        and video.get("width") == expected_width
        and video.get("height") == expected_height
        and audio.get("codec_name") == "aac"
        and str(audio.get("sample_rate")) == "48000"
    )
    add_condition_check(
        checks,
        "long-form-video-contract",
        passed,
        (
            f"video={video.get('codec_name')} {video.get('width')}x{video.get('height')} "
            f"audio={audio.get('codec_name')} {audio.get('sample_rate')}Hz "
            f"duration={probe.get('format', {}).get('duration')}"
        ),
        path,
    )


def validate_audio(checks: list[PacketCheck], path: Path, check_id: str) -> None:
    probe = ffprobe_summary(path)
    if "error" in probe:
        add_condition_check(checks, f"{check_id}-ffprobe", False, probe["error"], path)
        return
    audio = next((s for s in probe.get("streams", []) if s.get("codec_type") == "audio"), {})
    passed = (
        audio.get("codec_name") in {"aac", "mp3"}
        and str(audio.get("sample_rate")) in {"44100", "48000"}
        and int(audio.get("channels") or 0) >= 1
    )
    add_condition_check(
        checks,
        f"{check_id}-contract",
        passed,
        (
            f"audio={audio.get('codec_name')} {audio.get('sample_rate')}Hz "
            f"channels={audio.get('channels')} duration={probe.get('format', {}).get('duration')}"
        ),
        path,
    )


def validate_shorts_manifest(
    checks: list[PacketCheck],
    manifest_path: Path | None,
    *,
    expected_short_count: int | None,
) -> None:
    if manifest_path is None:
        return
    if not manifest_path.exists():
        add_file_check(checks, "shorts-manifest", manifest_path)
        return
    manifest = json.loads(manifest_path.read_text())
    short_checks: list[bool] = []
    for item in manifest.get("shorts", []):
        clip = Path(item.get("video", ""))
        streams = item.get("probe", {}).get("streams", [])
        video = next((s for s in streams if s.get("codec_type") == "video"), {})
        audio = next((s for s in streams if s.get("codec_type") == "audio"), {})
        short_checks.append(
            clip.exists()
            and clip.stat().st_size > 0
            and video.get("width") == 1080
            and video.get("height") == 1920
            and video.get("sample_aspect_ratio") == "1:1"
            and video.get("display_aspect_ratio") == "9:16"
            and video.get("codec_name") == "h264"
            and audio.get("codec_name") == "aac"
            and item.get("decodeStatus") == "passed-no-ffmpeg-error-output"
        )
    count_ok = expected_short_count is None or len(short_checks) == expected_short_count
    passed = bool(short_checks) and count_ok and all(short_checks)
    add_condition_check(
        checks,
        "shorts-manifest-contract",
        passed,
        (
            f"shorts={len(short_checks)} expected={expected_short_count} "
            f"allPassed={all(short_checks) if short_checks else False}"
        ),
        manifest_path,
    )


def validate_publication_receipts(checks: list[PacketCheck], receipt_path: Path | None) -> None:
    if receipt_path is None:
        return
    if not receipt_path.exists():
        add_file_check(checks, "publication-receipts", receipt_path)
        return
    try:
        ledger = json.loads(receipt_path.read_text())
    except json.JSONDecodeError as exc:
        add_condition_check(checks, "publication-receipts-json", False, f"receipt ledger JSON parse failed: {exc}", receipt_path)
        return
    entries = ledger.get("entries") or []
    hard_stops: list[str] = []
    captured = 0
    for entry in entries:
        status = str(entry.get("status") or "")
        has_receipt = bool(entry.get("publicUrl") or entry.get("providerReceiptId"))
        if has_receipt:
            captured += 1
        if status in {"uploaded-processing", "scheduled", "published"} and not has_receipt:
            hard_stops.append(f"{entry.get('platform')}:{entry.get('lane')} is {status} without URL/receipt")
    add_condition_check(
        checks,
        "publication-receipts-contract",
        not hard_stops,
        (
            f"receipt ledger ready; captured={captured}/{len(entries)}"
            if not hard_stops
            else "; ".join(hard_stops)
        ),
        receipt_path,
    )


def validate_docs_reference_artifacts(
    checks: list[PacketCheck],
    doc_paths: list[Path],
    required_texts: list[str],
) -> None:
    if not doc_paths:
        return
    combined = ""
    for path in doc_paths:
        if path.exists():
            combined += "\n" + path.read_text(errors="replace")
    missing = [text for text in required_texts if text and text not in combined]
    add_condition_check(
        checks,
        "docs-point-to-recommended-files",
        not missing,
        "all recommended artifact paths referenced" if not missing else f"missing references: {missing}",
    )


def build_report(args: argparse.Namespace) -> PacketReport:
    ready_dir = args.ready_dir
    checks: list[PacketCheck] = []

    youtube_video = resolve_optional(ready_dir, args.youtube_video)
    podcast_audio = resolve_optional(ready_dir, args.podcast_audio)
    podcast_fallback = resolve_optional(ready_dir, args.podcast_fallback)
    captions = resolve_optional(ready_dir, args.captions)
    metadata = resolve_optional(ready_dir, args.metadata)
    shorts_start_here = resolve_optional(ready_dir, args.social_shorts_start_here)
    shorts_manifest = resolve_optional(ready_dir, args.social_shorts_manifest)
    upload_readme = resolve_optional(ready_dir, args.upload_readme)
    producer_handoff = resolve_optional(ready_dir, args.producer_handoff)
    upload_qc_json = resolve_optional(ready_dir, args.upload_qc_json)
    publication_receipts = resolve_optional(ready_dir, args.publication_receipts)

    for check_id, path in [
        ("youtube-video", youtube_video),
        ("podcast-audio", podcast_audio),
        ("podcast-fallback", podcast_fallback),
        ("captions", captions),
        ("metadata", metadata),
        ("social-shorts-start-here", shorts_start_here),
        ("social-shorts-manifest", shorts_manifest),
        ("upload-readme", upload_readme),
        ("producer-handoff", producer_handoff),
        ("upload-qc-json", upload_qc_json),
        ("publication-receipts", publication_receipts),
    ]:
        add_file_check(checks, check_id, path)

    if youtube_video:
        validate_long_form_video(
            checks,
            youtube_video,
            expected_width=args.expected_video_width,
            expected_height=args.expected_video_height,
        )
    if podcast_audio:
        validate_audio(checks, podcast_audio, "podcast-audio")
    if podcast_fallback:
        validate_audio(checks, podcast_fallback, "podcast-fallback")
    validate_shorts_manifest(
        checks,
        shorts_manifest,
        expected_short_count=args.expected_short_count,
    )
    validate_publication_receipts(checks, publication_receipts)

    doc_paths = [path for path in [upload_readme, producer_handoff] if path is not None]
    required_refs = [
        rel_path(youtube_video, ready_dir),
        rel_path(podcast_audio, ready_dir),
        rel_path(podcast_fallback, ready_dir),
        rel_path(captions, ready_dir),
        rel_path(metadata, ready_dir),
        rel_path(shorts_start_here, ready_dir),
        rel_path(publication_receipts, ready_dir),
    ]
    validate_docs_reference_artifacts(checks, doc_paths, [ref for ref in required_refs if ref])

    if upload_qc_json and upload_qc_json.exists():
        qc_text = upload_qc_json.read_text(errors="replace").lower()
        add_condition_check(
            checks,
            "qc-no-external-publication",
            "not published" in qc_text or "not published, uploaded" in qc_text,
            "QC truth indicates no external publication"
            if "not published" in qc_text
            else "QC truth does not clearly state no external publication",
            upload_qc_json,
        )

    hard_stops = sum(1 for check in checks if check.status == "failed")
    warnings = sum(1 for check in checks if check.status == "warning")
    recommended_upload = {
        "youtubeVideo": rel_path(youtube_video, ready_dir),
        "podcastAudio": rel_path(podcast_audio, ready_dir),
        "podcastFallback": rel_path(podcast_fallback, ready_dir),
        "captions": rel_path(captions, ready_dir),
        "metadata": rel_path(metadata, ready_dir),
        "socialShortsStartHere": rel_path(shorts_start_here, ready_dir),
        "publicationReceipts": rel_path(publication_receipts, ready_dir),
    }
    return PacketReport(
        episodeId=args.episode_id,
        title=args.title,
        status="passed" if hard_stops == 0 else "failed",
        readyDir=str(ready_dir),
        checkCount=len(checks),
        hardStopCount=hard_stops,
        warningCount=warnings,
        recommendedUpload=recommended_upload,
        truth={
            "externalPublication": "not published, uploaded, scheduled, or sent by Codex",
            "sourceMedia": "original media not mutated by this packet check",
            "scope": "local upload packet readiness only",
            "producerRecommendation": args.recommendation,
        },
        checks=checks,
    )


def write_markdown(report: PacketReport, path: Path) -> None:
    lines = [
        f"# {report.title} final upload packet QC",
        "",
        f"Episode id: `{report.episodeId}`",
        f"Status: `{report.status}`",
        f"Hard stops: `{report.hardStopCount}`",
        f"Warnings: `{report.warningCount}`",
        "",
        "## Recommended upload artifacts",
        "",
    ]
    for key, value in report.recommendedUpload.items():
        if value:
            lines.append(f"- {key}: `{value}`")
    lines.extend(
        [
            "",
            "## Truth",
            "",
            f"- {report.truth['externalPublication']}.",
            f"- {report.truth['sourceMedia']}.",
            f"- Scope: {report.truth['scope']}.",
            f"- Producer recommendation: {report.truth['producerRecommendation']}",
            "",
            "## Checks",
            "",
        ]
    )
    for check in report.checks:
        lines.append(f"- `{check.status}` {check.id}: {check.detail}")
    path.write_text("\n".join(lines) + "\n")


def write_start_here(report: PacketReport, path: Path) -> None:
    rec = report.recommendedUpload
    lines = [
        f"# START HERE - Upload {report.title}",
        "",
        report.truth.get("producerRecommendation", "Use the recommended upload artifacts below."),
        "",
        "## YouTube",
        "",
    ]
    if rec.get("youtubeVideo"):
        lines.append(f"Upload: `{rec['youtubeVideo']}`")
    if rec.get("captions"):
        lines.append(f"Captions: `{rec['captions']}`")
    if rec.get("metadata"):
        lines.append(f"Copy/title/description/tags: `{rec['metadata']}`")
    lines.extend(["", "## Podcast platforms", ""])
    if rec.get("podcastAudio"):
        lines.append(f"Preferred audio: `{rec['podcastAudio']}`")
    if rec.get("podcastFallback"):
        lines.append(f"Fallback audio: `{rec['podcastFallback']}`")
    if rec.get("metadata"):
        lines.append(f"Use the same title/description basis from `{rec['metadata']}`.")
    if rec.get("socialShortsStartHere"):
        lines.extend(["", "## Shorts", "", f"Open: `{rec['socialShortsStartHere']}`"])
    if rec.get("publicationReceipts"):
        lines.extend(
            [
                "",
                "## After upload receipts",
                "",
                f"Record real platform URLs or provider receipt IDs in: `{rec['publicationReceipts']}`",
                "",
                "Do not mark external publication complete until those receipts exist.",
            ]
        )
    lines.extend(
        [
            "",
            "## Evidence",
            "",
            f"Read `{path.with_suffix('.qc.md').name}` for packet proof.",
            "",
            "## Safety truth",
            "",
            "- Codex did not upload, publish, schedule, send, or change external accounts.",
            "- Original media was not mutated.",
            "- This folder is a local release packet.",
        ]
    )
    path.write_text("\n".join(lines) + "\n")


def write_desktop_launcher(
    *,
    ready_dir: Path,
    launcher_path: Path,
    start_here_path: Path,
    metadata: Path | None,
    qc_markdown: Path,
    shorts_start_here: Path | None,
    publication_receipts: Path | None = None,
) -> None:
    open_lines = [
        'open "$READY_DIR"',
        f"open \"$READY_DIR/{start_here_path.relative_to(ready_dir)}\"",
    ]
    if metadata is not None:
        open_lines.append(f"open \"$READY_DIR/{metadata.relative_to(ready_dir)}\"")
    open_lines.append(f"open \"$READY_DIR/{qc_markdown.relative_to(ready_dir)}\"")
    if shorts_start_here is not None:
        open_lines.append(f"open \"$READY_DIR/{shorts_start_here.relative_to(ready_dir)}\"")
    if publication_receipts is not None:
        open_lines.append(f"open \"$READY_DIR/{publication_receipts.relative_to(ready_dir)}\"")
    script = "\n".join(
        [
            "#!/bin/zsh",
            "set -euo pipefail",
            f"READY_DIR={json.dumps(str(ready_dir))}",
            *open_lines,
            "",
        ]
    )
    launcher_path.write_text(script)
    launcher_path.chmod(launcher_path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate a Quipsly local upload packet.")
    parser.add_argument("--ready-dir", type=Path, required=True)
    parser.add_argument("--episode-id", required=True)
    parser.add_argument("--title", required=True)
    parser.add_argument("--recommendation", default="Use the recommended upload artifacts.")
    parser.add_argument("--youtube-video", required=True)
    parser.add_argument("--podcast-audio", required=True)
    parser.add_argument("--podcast-fallback")
    parser.add_argument("--captions")
    parser.add_argument("--metadata")
    parser.add_argument("--social-shorts-start-here")
    parser.add_argument("--social-shorts-manifest")
    parser.add_argument("--upload-readme", default="UPLOAD_README.md")
    parser.add_argument("--producer-handoff")
    parser.add_argument("--upload-qc-json")
    parser.add_argument("--publication-receipts")
    parser.add_argument("--expected-video-width", type=int, default=1920)
    parser.add_argument("--expected-video-height", type=int, default=1080)
    parser.add_argument("--expected-short-count", type=int)
    parser.add_argument("--output-stem", default="QUIPSLY_FINAL_UPLOAD_PACKET_QC")
    parser.add_argument("--start-here-name", default="START_HERE_UPLOAD_NOW.md")
    parser.add_argument("--desktop-launcher", type=Path)
    args = parser.parse_args()

    report = build_report(args)
    ready_dir = args.ready_dir
    qc_json = ready_dir / f"{args.output_stem}.json"
    qc_md = ready_dir / f"{args.output_stem}.md"
    start_here = ready_dir / args.start_here_name
    qc_json.write_text(json.dumps(asdict(report), indent=2) + "\n")
    write_markdown(report, qc_md)
    write_start_here(report, start_here)

    if args.desktop_launcher:
        write_desktop_launcher(
            ready_dir=ready_dir,
            launcher_path=args.desktop_launcher,
            start_here_path=start_here,
            metadata=resolve_optional(ready_dir, args.metadata),
            qc_markdown=qc_md,
            shorts_start_here=resolve_optional(ready_dir, args.social_shorts_start_here),
            publication_receipts=resolve_optional(ready_dir, args.publication_receipts),
        )

    print(
        json.dumps(
            {
                "status": report.status,
                "hardStopCount": report.hardStopCount,
                "warningCount": report.warningCount,
                "json": str(qc_json),
                "markdown": str(qc_md),
                "startHere": str(start_here),
                "desktopLauncher": str(args.desktop_launcher) if args.desktop_launcher else None,
            },
            indent=2,
        )
    )
    return 0 if report.status == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
