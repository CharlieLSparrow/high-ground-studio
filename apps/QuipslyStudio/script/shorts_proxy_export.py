#!/usr/bin/env python3
"""Proxy-first short exporter for Quipsly Studio.

This is an app-owned local-engine bridge, not a one-off rescue script. It reads
a Quipsly short-export request JSON written by the Mac app, renders queued
vertical shorts from proxy media only, writes incremental progress, and emits a
batch manifest suitable for agent/UI inspection.
"""

from __future__ import annotations

import datetime as _dt
import json
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.parse
from pathlib import Path
from typing import Any


VIDEO_EXTENSIONS = {".mp4", ".mov", ".m4v", ".avi", ".mkv", ".webm"}
AUDIO_EXTENSIONS = {".m4a", ".mp3", ".wav", ".aac", ".aiff", ".flac"}


def iso_now() -> str:
    return _dt.datetime.now(tz=_dt.timezone.utc).isoformat().replace("+00:00", "Z")


def file_url_to_path(value: str | None) -> str:
    if not value:
        return ""
    if value.startswith("file://"):
        parsed = urllib.parse.urlparse(value)
        return urllib.parse.unquote(parsed.path)
    return value


def safe_float(value: Any, default: float = 0.0) -> float:
    try:
        number = float(value)
    except Exception:
        return default
    return number if number == number and number not in (float("inf"), float("-inf")) else default


def lane_media_kind(lane: dict[str, Any]) -> str:
    metadata = lane.get("metadata") or {}
    source = lane.get("sourceVideo") or {}
    role = f"{metadata.get('role') or ''} {lane.get('name') or ''}".lower()
    declared = (metadata.get("mediaKind") or "").lower()
    proxy_path = file_url_to_path(source.get("proxyURL"))
    media_path = file_url_to_path(source.get("mediaURL"))
    suffix = Path(proxy_path or media_path).suffix.lower()
    if declared in {"audio", "video"}:
        return declared
    if suffix in AUDIO_EXTENSIONS or "audio" in role or "pod ever.wav" in role:
        return "audio"
    if suffix in VIDEO_EXTENSIONS or "camera" in role or "clip" in role:
        return "video"
    return "unknown"


def lane_offset(lane: dict[str, Any]) -> float:
    return safe_float((lane.get("sourceVideo") or {}).get("offset"), 0.0)


def lane_proxy_path(lane: dict[str, Any]) -> str:
    return file_url_to_path((lane.get("sourceVideo") or {}).get("proxyURL"))


def lane_is_ignored(lane: dict[str, Any]) -> bool:
    metadata = lane.get("metadata") or {}
    return bool(metadata.get("ignoreForProduction"))


def sequence_for_request(request: dict[str, Any]) -> dict[str, Any]:
    if isinstance(request.get("sequence"), dict):
        return request["sequence"]
    if isinstance(request.get("project"), dict):
        project = request["project"]
        sequences = project.get("sequences") or []
        active_id = request.get("activeSequenceId")
        for sequence in sequences:
            if sequence.get("id") == active_id:
                return sequence
        if sequences:
            return sequences[0]
    raise ValueError("Request does not contain a sequence or NativeEditorSession project.sequences payload.")


def video_lanes(sequence: dict[str, Any]) -> list[dict[str, Any]]:
    lanes = sequence.get("lanes") or []
    return [
        lane
        for lane in lanes
        if not lane_is_ignored(lane)
        and lane_media_kind(lane) == "video"
        and lane_proxy_path(lane)
        and Path(lane_proxy_path(lane)).exists()
    ]


def audio_lanes(sequence: dict[str, Any]) -> list[dict[str, Any]]:
    lanes = sequence.get("lanes") or []
    return [
        lane
        for lane in lanes
        if not lane_is_ignored(lane)
        and lane_media_kind(lane) == "audio"
        and lane_proxy_path(lane)
        and Path(lane_proxy_path(lane)).exists()
    ]


def tag_type(tag: dict[str, Any]) -> str:
    return str(tag.get("type") or "").strip().lower()


def tag_sequence_range(lane: dict[str, Any], tag: dict[str, Any]) -> tuple[float, float]:
    start = safe_float(tag.get("startTime"), 0.0) + lane_offset(lane)
    duration = max(0.0, safe_float(tag.get("duration"), 0.0))
    return start, start + duration


def active_video_lanes_at(sequence: dict[str, Any], sequence_time: float) -> list[dict[str, Any]]:
    matches: list[dict[str, Any]] = []
    for lane in video_lanes(sequence):
        for tag in lane.get("tags") or []:
            if tag_type(tag) != "active":
                continue
            start, end = tag_sequence_range(lane, tag)
            if start <= sequence_time < end:
                matches.append(lane)
                break
    return matches


def clip_by_id(sequence: dict[str, Any], clip_id: str) -> dict[str, Any] | None:
    for clip in sequence.get("shortClipQueue") or []:
        if str(clip.get("id")) == str(clip_id):
            return clip
    return None


def lane_by_id(sequence: dict[str, Any], lane_id: str | None) -> dict[str, Any] | None:
    if not lane_id:
        return None
    for lane in sequence.get("lanes") or []:
        if str(lane.get("id")) == str(lane_id):
            return lane
    return None


def segment_source_lane(sequence: dict[str, Any], clip: dict[str, Any], sequence_time: float) -> dict[str, Any] | None:
    for segment in clip.get("segments") or []:
        source_lane = lane_by_id(sequence, segment.get("sourceLaneId"))
        if not source_lane:
            continue
        offset = lane_offset(source_lane)
        start = safe_float(segment.get("startTime"), 0.0) + offset
        end = start + max(0.0, safe_float(segment.get("duration"), 0.0))
        if start <= sequence_time < end:
            return source_lane
    source_lane = lane_by_id(sequence, clip.get("sourceLaneId"))
    if source_lane:
        return source_lane
    return None


def choose_video_lane(sequence: dict[str, Any], clip: dict[str, Any], start: float, duration: float) -> dict[str, Any] | None:
    midpoint = start + max(0.01, duration / 2.0)
    segment_lane = segment_source_lane(sequence, clip, midpoint)
    if segment_lane and lane_media_kind(segment_lane) == "video" and Path(lane_proxy_path(segment_lane)).exists():
        return segment_lane
    active = active_video_lanes_at(sequence, midpoint)
    if active:
        return active[0]
    candidates = video_lanes(sequence)
    return candidates[0] if candidates else None


def progress_payload(
    *,
    status: str,
    completed: int,
    total: int,
    current_index: int | None = None,
    current_title: str = "",
    current_output_path: str = "",
    failures: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    return {
        "model": "quipsly-proxy-short-export-progress",
        "version": "2026-06-22.proxy-short-export.v1",
        "status": status,
        "completed": completed,
        "total": total,
        "progress": (completed / total) if total else 0,
        "currentIndex": current_index,
        "currentTitle": current_title,
        "currentOutputPath": current_output_path,
        "failures": failures or [],
        "updatedAt": iso_now(),
    }


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
    tmp.replace(path)


def ffmpeg_path() -> str:
    found = shutil.which("ffmpeg")
    if found:
        return found
    for candidate in ("/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg"):
        if Path(candidate).exists():
            return candidate
    raise RuntimeError("ffmpeg_missing: Install ffmpeg or add it to PATH before exporting shorts.")


def run_command(args: list[str]) -> None:
    completed = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if completed.returncode != 0:
        stderr = (completed.stderr or completed.stdout or "").strip()
        raise RuntimeError(stderr[-4000:] if stderr else f"Command failed: {' '.join(args)}")


def render_part(
    *,
    ffmpeg: str,
    sequence: dict[str, Any],
    clip: dict[str, Any],
    start: float,
    duration: float,
    output_path: Path,
) -> dict[str, Any]:
    video_lane = choose_video_lane(sequence, clip, start, duration)
    if not video_lane:
        raise RuntimeError("No proxy-ready video lane is available for this short range.")

    video_proxy = lane_proxy_path(video_lane)
    if not video_proxy or not Path(video_proxy).exists():
        raise RuntimeError(f"Missing proxy video for lane {video_lane.get('name') or video_lane.get('id')}.")

    video_start = max(0.0, start - lane_offset(video_lane))
    audio_sources = audio_lanes(sequence)[:2]

    args = [ffmpeg, "-hide_banner", "-loglevel", "error", "-y"]
    args += ["-ss", f"{video_start:.3f}", "-t", f"{duration:.3f}", "-i", video_proxy]
    for lane in audio_sources:
        audio_start = max(0.0, start - lane_offset(lane))
        args += ["-ss", f"{audio_start:.3f}", "-t", f"{duration:.3f}", "-i", lane_proxy_path(lane)]

    video_filter = (
        "[0:v:0]"
        "scale=1080:1920:force_original_aspect_ratio=increase,"
        "crop=1080:1920,setsar=1[v]"
    )
    if len(audio_sources) >= 2:
        audio_inputs = "".join(f"[{index}:a:0]" for index in range(1, len(audio_sources) + 1))
        filter_complex = f"{video_filter};{audio_inputs}amix=inputs={len(audio_sources)}:duration=longest:normalize=0[a]"
        args += ["-filter_complex", filter_complex, "-map", "[v]", "-map", "[a]"]
    elif len(audio_sources) == 1:
        args += ["-filter_complex", video_filter, "-map", "[v]", "-map", "1:a:0?"]
    else:
        args += ["-filter_complex", video_filter, "-map", "[v]", "-an"]

    args += [
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "160k",
        "-movflags",
        "+faststart",
        str(output_path),
    ]
    run_command(args)
    return {
        "sequenceStartTime": start,
        "duration": duration,
        "videoLaneId": video_lane.get("id") or "",
        "videoLaneName": video_lane.get("name") or "",
        "videoProxyPath": video_proxy,
        "videoSourceStartTime": video_start,
        "audioLaneIds": [lane.get("id") or "" for lane in audio_sources],
        "audioLaneNames": [lane.get("name") or "" for lane in audio_sources],
        "audioProxyPaths": [lane_proxy_path(lane) for lane in audio_sources],
    }


def concat_parts(ffmpeg: str, parts: list[Path], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    final_tmp = output_path.with_name(output_path.name + ".writing.mp4")
    if final_tmp.exists():
        final_tmp.unlink()
    if len(parts) == 1:
        shutil.copy2(parts[0], final_tmp)
    else:
        list_path = output_path.with_name(output_path.name + ".concat.txt")
        list_path.write_text(
            "\n".join(f"file {json.dumps(str(part))[1:-1]}" for part in parts) + "\n",
            encoding="utf-8",
        )
        run_command([
            ffmpeg,
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(list_path),
            "-c",
            "copy",
            "-movflags",
            "+faststart",
            str(final_tmp),
        ])
        try:
            list_path.unlink()
        except FileNotFoundError:
            pass
    final_tmp.replace(output_path)


def export_clip(
    *,
    ffmpeg: str,
    sequence: dict[str, Any],
    clip_request: dict[str, Any],
    temp_root: Path,
) -> dict[str, Any]:
    clip_id = str(clip_request.get("id") or "")
    clip = clip_by_id(sequence, clip_id)
    if not clip:
        raise RuntimeError(f"Clip not found in sequence: {clip_id}")
    output_path = Path(str(clip_request.get("outputPath") or ""))
    if not str(output_path):
        raise RuntimeError(f"Missing outputPath for clip {clip_id}")

    ranges = clip_request.get("ranges") or []
    clean_ranges: list[dict[str, Any]] = []
    for item in ranges:
        start = safe_float(item.get("start"), safe_float(item.get("sequenceStartTime"), 0.0))
        duration = safe_float(item.get("duration"), 0.0)
        if start >= 0 and duration > 0:
            clean_item = dict(item)
            clean_item["start"] = start
            clean_item["sequenceStartTime"] = start
            clean_item["sequenceEndTime"] = safe_float(item.get("sequenceEndTime"), start + duration)
            clean_item["duration"] = duration
            clean_item["sourceLocalStartTime"] = safe_float(item.get("sourceLocalStartTime"), start)
            clean_item["sourceLocalEndTime"] = safe_float(item.get("sourceLocalEndTime"), clean_item["sourceLocalStartTime"] + duration)
            clean_item["sourceLaneId"] = str(item.get("sourceLaneId") or "")
            clean_item["sourceTagId"] = str(item.get("sourceTagId") or "")
            clean_ranges.append(clean_item)
    if not clean_ranges:
        raise RuntimeError(f"Clip {clip.get('title') or clip_id} has no positive export ranges.")

    part_dir = temp_root / clip_id
    part_dir.mkdir(parents=True, exist_ok=True)
    parts: list[Path] = []
    rendered_ranges: list[dict[str, Any]] = []
    for index, range_item in enumerate(clean_ranges, start=1):
        start = safe_float(range_item.get("sequenceStartTime"), safe_float(range_item.get("start"), 0.0))
        duration = safe_float(range_item.get("duration"), 0.0)
        part_path = part_dir / f"part-{index:03d}.mp4"
        rendered = render_part(
            ffmpeg=ffmpeg,
            sequence=sequence,
            clip=clip,
            start=start,
            duration=duration,
            output_path=part_path,
        )
        rendered["sequenceStartTime"] = start
        rendered["sequenceEndTime"] = start + duration
        requested_source_lane_id = str(range_item.get("sourceLaneId") or "")
        requested_source_tag_id = str(range_item.get("sourceTagId") or "")
        rendered["sourceLocalStartTime"] = safe_float(range_item.get("sourceLocalStartTime"), start)
        rendered["sourceLocalEndTime"] = safe_float(range_item.get("sourceLocalEndTime"), rendered["sourceLocalStartTime"] + duration)
        rendered["sourceLaneId"] = requested_source_lane_id
        rendered["sourceTagId"] = requested_source_tag_id
        rendered["renderedVideoLaneId"] = str(rendered.get("videoLaneId") or "")
        rendered["renderedVideoLaneName"] = str(rendered.get("videoLaneName") or "")
        rendered["sourceLineageStatus"] = "explicit" if requested_source_lane_id else "rendered-video-lane-fallback"
        rendered_ranges.append(rendered)
        parts.append(part_path)

    concat_parts(ffmpeg, parts, output_path)
    size = output_path.stat().st_size if output_path.exists() else 0
    if size <= 0:
        raise RuntimeError(f"Export produced an empty artifact: {output_path}")

    return {
        "id": clip_id,
        "title": clip.get("title") or clip_request.get("title") or clip_id,
        "status": "exported",
        "outputPath": str(output_path),
        "sizeBytes": size,
        "duration": sum(safe_float(item.get("duration"), 0.0) for item in clean_ranges),
        "ranges": rendered_ranges,
        "lineage": {
            "timeBase": "sequence-seconds",
            "sourcePolicy": "proxy-only; originals untouched",
            "explicitSourceLaneCount": len([item for item in rendered_ranges if item.get("sourceLineageStatus") == "explicit"]),
            "explicitSourceTagCount": len([item for item in rendered_ranges if item.get("sourceTagId")]),
            "renderedVideoLaneFallbackCount": len([item for item in rendered_ranges if item.get("sourceLineageStatus") == "rendered-video-lane-fallback"]),
            "rangeCount": len(rendered_ranges),
            "truth": "Ranges preserve sequence time plus authored source-local lane/tag lineage when the selected short recipe provided it. Rendered video lane fallback is export evidence, not explicit recipe authorship."
        },
        "sourcePolicy": "proxy-only; original media was not opened",
        "error": "",
    }


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("Usage: shorts_proxy_export.py /absolute/export-request.json", file=sys.stderr)
        return 2

    request_path = Path(argv[1])
    request = json.loads(request_path.read_text(encoding="utf-8"))
    sequence = sequence_for_request(request)
    clips = request.get("clips") or []
    manifest_path = Path(request.get("manifestPath") or request_path.with_name("shorts-export-manifest.json"))
    progress_path = Path(request.get("progressPath") or request_path.with_name("shorts-export-progress.json"))
    session_name = request.get("sessionName") or sequence.get("title") or ""
    batch_id = request.get("batchId") or request_path.stem
    temp_root = Path(tempfile.gettempdir()) / "quipsly-proxy-short-export" / str(batch_id)
    if temp_root.exists():
        shutil.rmtree(temp_root)
    temp_root.mkdir(parents=True, exist_ok=True)

    manifest: dict[str, Any] = {
        "model": "quipsly-proxy-short-export-manifest",
        "version": "2026-06-22.proxy-short-export.v1",
        "schemaVersion": 1,
        "batchId": batch_id,
        "sessionName": session_name,
        "sequenceId": sequence.get("id") or "",
        "sequenceTitle": sequence.get("title") or "",
        "sourcePolicy": "proxy-only; original media untouched",
        "requestPath": str(request_path),
        "progressPath": str(progress_path),
        "manifestPath": str(manifest_path),
        "startedAt": iso_now(),
        "completedAt": "",
        "status": "running",
        "total": len(clips),
        "completed": 0,
        "failed": 0,
        "clips": [],
        "errors": [],
    }

    failures: list[dict[str, Any]] = []
    write_json(progress_path, progress_payload(status="running", completed=0, total=len(clips)))
    write_json(manifest_path, manifest)

    try:
        ffmpeg = ffmpeg_path()
    except Exception as exc:
        failure = {"stage": "preflight", "error": str(exc)}
        manifest["status"] = "failed"
        manifest["errors"].append(failure)
        manifest["failed"] = len(clips)
        manifest["completedAt"] = iso_now()
        write_json(progress_path, progress_payload(status="failed", completed=0, total=len(clips), failures=[failure]))
        write_json(manifest_path, manifest)
        print(json.dumps(manifest, indent=2, sort_keys=True))
        return 1

    for index, clip_request in enumerate(clips, start=1):
        title = str(clip_request.get("title") or clip_request.get("id") or f"Short {index}")
        output_path = str(clip_request.get("outputPath") or "")
        write_json(
            progress_path,
            progress_payload(
                status="running",
                completed=len(manifest["clips"]),
                total=len(clips),
                current_index=index,
                current_title=title,
                current_output_path=output_path,
                failures=failures,
            ),
        )
        try:
            result = export_clip(
                ffmpeg=ffmpeg,
                sequence=sequence,
                clip_request=clip_request,
                temp_root=temp_root,
            )
            manifest["clips"].append(result)
            manifest["completed"] = len([item for item in manifest["clips"] if item.get("status") == "exported"])
        except Exception as exc:
            failure = {
                "id": str(clip_request.get("id") or ""),
                "title": title,
                "status": "failed",
                "outputPath": output_path,
                "error": str(exc),
            }
            failures.append(failure)
            manifest["clips"].append(failure)
            manifest["failed"] = len(failures)
        write_json(manifest_path, manifest)

    manifest["completedAt"] = iso_now()
    manifest["completed"] = len([item for item in manifest["clips"] if item.get("status") == "exported"])
    manifest["failed"] = len([item for item in manifest["clips"] if item.get("status") != "exported"])
    manifest["status"] = "completed" if manifest["failed"] == 0 else "failed"
    write_json(manifest_path, manifest)
    write_json(
        progress_path,
        progress_payload(
            status=manifest["status"],
            completed=manifest["completed"],
            total=len(clips),
            failures=failures,
        ),
    )
    print(json.dumps(manifest, indent=2, sort_keys=True))
    return 0 if manifest["status"] == "completed" else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
