#!/usr/bin/env python3
import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
OUTPUT_PLAN = ROOT_DIR / "script" / "build_episode1_output_plan.sh"


def run(command, *, timeout=None, capture=True):
    return subprocess.run(
        command,
        text=True,
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.PIPE if capture else None,
        timeout=timeout,
        check=False,
    )


def resolve_ffmpeg(configured=None):
    candidates = []
    if configured:
        candidates.append(configured)
    for entry in os.environ.get("PATH", "").split(os.pathsep):
        if entry:
            candidates.append(str(Path(entry) / "ffmpeg"))
    candidates.extend(["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/usr/bin/ffmpeg", "/bin/ffmpeg"])
    for candidate in candidates:
        if os.path.isfile(candidate) and os.access(candidate, os.X_OK):
            return candidate
    raise SystemExit("ffmpeg not found. Install ffmpeg or set QUIPSLY_FFMPEG_PATH.")


def resolve_ffprobe(ffmpeg_path, configured=None):
    candidates = []
    if configured:
        candidates.append(configured)
    ffmpeg_parent = Path(ffmpeg_path).parent
    candidates.append(str(ffmpeg_parent / "ffprobe"))
    for entry in os.environ.get("PATH", "").split(os.pathsep):
        if entry:
            candidates.append(str(Path(entry) / "ffprobe"))
    candidates.extend(["/opt/homebrew/bin/ffprobe", "/usr/local/bin/ffprobe", "/usr/bin/ffprobe", "/bin/ffprobe"])
    for candidate in candidates:
        if os.path.isfile(candidate) and os.access(candidate, os.X_OK):
            return candidate
    return ""


def load_output_plan():
    result = run([str(OUTPUT_PLAN), "--json", "--require-visual"], timeout=20)
    if result.returncode != 0:
        raise SystemExit(
            "Could not build a visual-safe output plan.\n"
            + (result.stdout or "")
            + (result.stderr or "")
        )
    try:
        return json.loads(result.stdout)
    except Exception as error:
        raise SystemExit(f"Output plan did not return valid JSON: {type(error).__name__}: {error}")


def clamp_segments(segments, max_duration=None, segment_limit=None):
    selected = []
    emitted = 0.0
    for segment in segments:
        if segment_limit is not None and len(selected) >= segment_limit:
            break
        duration = float(segment.get("duration") or 0)
        if duration <= 0:
            continue
        if max_duration is not None:
            remaining = max_duration - emitted
            if remaining <= 0:
                break
            if duration > remaining:
                segment = dict(segment)
                segment["duration"] = remaining
                segment["programEnd"] = float(segment.get("programStart") or emitted) + remaining
                segment["sequenceEnd"] = float(segment.get("sequenceStart") or 0) + remaining
                duration = remaining
        selected.append(segment)
        emitted += duration
    return selected


def filter_for_format(format_name):
    if format_name == "horizontal16x9":
        return "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1,fps=30,format=yuv420p"
    if format_name == "vertical9x16":
        return "scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,setsar=1,fps=30,format=yuv420p"
    raise SystemExit(f"Unknown format: {format_name}")


def audio_candidates_for_segment(segment):
    candidates = []
    for candidate in segment.get("supportCandidates") or []:
        playback_path = candidate.get("playbackPath") or ""
        if not playback_path:
            continue
        if not Path(playback_path).is_file():
            continue
        candidates.append(candidate)
    return candidates


def render_segment(ffmpeg, segment, destination, format_name, include_audio=False, require_audio=False):
    candidates = segment.get("visibleVideoCandidates") or []
    if not candidates:
        raise RuntimeError(f"Segment {segment.get('index')} has no visible video candidate.")
    primary = candidates[0]
    playback_path = primary.get("playbackPath") or ""
    if not playback_path:
        raise RuntimeError(f"Segment {segment.get('index')} candidate has no proxy playbackPath.")
    if not Path(playback_path).is_file():
        raise RuntimeError(f"Segment {segment.get('index')} proxy is missing: {playback_path}")

    source_in = max(0.0, float(primary.get("sourceIn") or 0))
    duration = max(0.0, float(segment.get("duration") or 0))
    if duration <= 0:
        raise RuntimeError(f"Segment {segment.get('index')} has invalid duration {duration}.")

    audio_candidates = audio_candidates_for_segment(segment) if include_audio else []
    if include_audio and require_audio and not audio_candidates:
        raise RuntimeError(f"Segment {segment.get('index')} has no playable audio proxy candidate.")

    command = [
        ffmpeg,
        "-y",
        "-hide_banner",
        "-nostdin",
        "-loglevel",
        "error",
        "-ss",
        f"{source_in:.6f}",
        "-t",
        f"{duration:.6f}",
        "-i",
        playback_path,
    ]

    for candidate in audio_candidates:
        command.extend([
            "-ss",
            f"{max(0.0, float(candidate.get('sourceIn') or 0)):.6f}",
            "-t",
            f"{duration:.6f}",
            "-i",
            candidate["playbackPath"],
        ])

    if audio_candidates:
        audio_filter_inputs = "".join(f"[{index}:a:0]" for index in range(1, len(audio_candidates) + 1))
        if len(audio_candidates) == 1:
            audio_filter = f"{audio_filter_inputs}aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[aout]"
        else:
            audio_filter = f"{audio_filter_inputs}amix=inputs={len(audio_candidates)}:duration=longest:normalize=0,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[aout]"
        filter_complex = f"[0:v:0]{filter_for_format(format_name)}[vout];{audio_filter}"
        command.extend([
            "-filter_complex",
            filter_complex,
            "-map",
            "[vout]",
            "-map",
            "[aout]",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "28",
            "-c:a",
            "aac",
            "-b:a",
            "160k",
            "-shortest",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            str(destination),
        ])
    else:
        command.extend([
            "-an",
            "-vf",
            filter_for_format(format_name),
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "28",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            str(destination),
        ])

    result = run(command, timeout=max(30, duration * 8))
    if result.returncode != 0:
        raise RuntimeError(
            f"ffmpeg segment render failed for segment {segment.get('index')} from {primary.get('laneName')}: "
            + (result.stderr or result.stdout or "").strip()
        )
    return {
        "segmentIndex": segment.get("index"),
        "programStart": segment.get("programStart"),
        "programEnd": segment.get("programEnd"),
        "sequenceStart": segment.get("sequenceStart"),
        "sequenceEnd": segment.get("sequenceEnd"),
        "duration": duration,
        "laneName": primary.get("laneName"),
        "playbackPath": playback_path,
        "sourceIn": source_in,
        "renderedPath": str(destination),
        "visibleCandidateCount": len(candidates),
        "audioCandidateCount": len(audio_candidates),
        "audioLaneNames": [candidate.get("laneName", "") for candidate in audio_candidates],
        "audioIncluded": bool(audio_candidates),
        "nonDestructiveNote": "Rendered from proxy playbackPath as an export intermediate; source lanes and decisions were not mutated.",
    }


def concat_segments(ffmpeg, rendered_segments, output_url):
    concat_list = output_url.with_suffix(".concat.txt")
    with concat_list.open("w") as handle:
        for segment in rendered_segments:
            path = segment["renderedPath"].replace("'", "'\\''")
            handle.write(f"file '{path}'\n")

    tmp_output = output_url.with_name(f".{output_url.stem}.partial-{uuid.uuid4()}{output_url.suffix}")
    if tmp_output.exists():
        tmp_output.unlink()
    command = [
        ffmpeg,
        "-y",
        "-hide_banner",
        "-nostdin",
        "-loglevel",
        "error",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        str(concat_list),
        "-c",
        "copy",
        "-movflags",
        "+faststart",
        str(tmp_output),
    ]
    result = run(command, timeout=max(60, len(rendered_segments) * 10))
    if result.returncode != 0:
        if tmp_output.exists():
            tmp_output.unlink()
        raise RuntimeError("ffmpeg concat failed: " + (result.stderr or result.stdout or "").strip())
    if output_url.exists():
        output_url.unlink()
    tmp_output.replace(output_url)
    return concat_list


def probe_output(ffprobe, output_url):
    if not ffprobe:
        return {}
    result = run(
        [
            ffprobe,
            "-v",
            "error",
            "-show_entries",
            "format=duration,size",
            "-show_entries",
            "stream=index,codec_type,codec_name,width,height,avg_frame_rate",
            "-of",
            "json",
            str(output_url),
        ],
        timeout=30,
    )
    if result.returncode != 0:
        return {"error": (result.stderr or result.stdout or "").strip()}
    try:
        return json.loads(result.stdout)
    except Exception as error:
        return {"error": f"{type(error).__name__}: {error}"}


def main():
    parser = argparse.ArgumentParser(
        description="Render a silent visual proxy export from the Episode 1 output plan."
    )
    parser.add_argument("--output", default=str(Path.home() / "Movies" / "Quipsly" / "Exports" / "episode1-visual-proxy-proof.mp4"))
    parser.add_argument("--format", choices=["horizontal16x9", "vertical9x16"], default="horizontal16x9")
    parser.add_argument("--max-duration", type=float, default=None, help="Render only the first N program seconds.")
    parser.add_argument("--segment-limit", type=int, default=None, help="Render only the first N output-plan segments.")
    parser.add_argument("--include-audio", action="store_true", help="Mux playable support/audio proxy candidates into each rendered segment.")
    parser.add_argument("--require-audio", action="store_true", help="Fail if --include-audio is used and a selected output segment has no playable audio proxy candidate.")
    parser.add_argument("--keep-work", action="store_true", help="Keep intermediate render chunks.")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--ffmpeg", default=os.environ.get("QUIPSLY_FFMPEG_PATH"))
    parser.add_argument("--ffprobe", default=os.environ.get("QUIPSLY_FFPROBE_PATH"))
    args = parser.parse_args()

    ffmpeg = resolve_ffmpeg(args.ffmpeg)
    ffprobe = resolve_ffprobe(ffmpeg, args.ffprobe)
    plan = load_output_plan()
    if not plan.get("safeForVisualOutputPlan"):
        raise SystemExit("Output plan is not safe for visual rendering.")

    segments = clamp_segments(plan.get("segments", []), args.max_duration, args.segment_limit)
    if not segments:
        raise SystemExit("No output-plan segments selected for render.")

    output_url = Path(args.output).expanduser().resolve()
    output_url.parent.mkdir(parents=True, exist_ok=True)
    work_dir = Path(tempfile.mkdtemp(prefix="quipsly-visual-proxy-render-"))

    rendered = []
    try:
        for index, segment in enumerate(segments):
            chunk_path = work_dir / f"segment-{index:04d}.mp4"
            rendered.append(render_segment(
                ffmpeg,
                segment,
                chunk_path,
                args.format,
                include_audio=args.include_audio,
                require_audio=args.require_audio,
            ))
        concat_list = concat_segments(ffmpeg, rendered, output_url)
        probe = probe_output(ffprobe, output_url)
        audio_included = any(item.get("audioIncluded") for item in rendered)
        summary = {
            "status": "rendered",
            "output": str(output_url),
            "format": args.format,
            "source": "Episode 1 Play Edit output plan",
            "renderedSegmentCount": len(rendered),
            "requestedMaxDuration": args.max_duration,
            "requestedSegmentLimit": args.segment_limit,
            "planProgramDurationSeconds": plan.get("counts", {}).get("programDurationSeconds"),
            "renderedDurationSeconds": round(sum(float(item["duration"]) for item in rendered), 6),
            "finalExportBlockedReason": plan.get("finalExportBlockedReason"),
            "audioIncluded": audio_included,
            "audioRequired": args.require_audio,
            "usesProxyPlaybackOnly": True,
            "nonDestructiveInvariant": "Whole source lanes and SHOW/SKIP decisions are unchanged; temporary chunks are render intermediates only.",
            "concatList": str(concat_list),
            "workDir": str(work_dir) if args.keep_work else "",
            "segments": rendered,
            "probe": probe,
        }
        if args.json:
            print(json.dumps(summary, indent=2))
        else:
            print("Episode 1 silent visual proxy export rendered.")
            print(f"Output: {summary['output']}")
            print(f"Format: {summary['format']}")
            print(f"Segments: {summary['renderedSegmentCount']}")
            print(f"Rendered duration: {summary['renderedDurationSeconds']}s")
            print(f"Audio included: {summary['audioIncluded']}")
            print(f"Final production blocker: {summary['finalExportBlockedReason']}")
            print("Invariant: temporary chunks are render intermediates; source lanes were not chopped.")
        return 0
    finally:
        if not args.keep_work:
            shutil.rmtree(work_dir, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
