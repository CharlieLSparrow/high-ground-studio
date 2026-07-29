#!/usr/bin/env python3
"""Render source-preserving, captioned social shorts from edit recipes.

The input master is never modified. A short is a list of source-time ranges,
plus transcript evidence and presentation metadata. This keeps Quipsly's
editorial decisions lightweight while allowing a short to remove dead pauses.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any


CREAM_ASS = "&H00D3E7F4&"
GOLD_ASS = "&H004CC9F2&"
STOP_WORDS = {
    "a", "an", "and", "are", "as", "at", "be", "been", "but", "by",
    "for", "from", "had", "has", "have", "he", "her", "his", "i", "if",
    "in", "is", "it", "its", "me", "my", "of", "on", "or", "our", "so",
    "that", "the", "their", "them", "they", "this", "to", "us", "was",
    "we", "were", "what", "when", "which", "who", "with", "you", "your",
}


def media_binary(name: str) -> str:
    full_build = Path("/opt/homebrew/opt/ffmpeg-full/bin") / name
    if full_build.exists():
        return str(full_build)
    resolved = shutil.which(name)
    if not resolved:
        raise FileNotFoundError(f"Required media binary is unavailable: {name}")
    return resolved


FFMPEG = media_binary("ffmpeg")
FFPROBE = media_binary("ffprobe")


@dataclass
class Word:
    text: str
    start: float
    end: float


def run(command: list[str], *, capture: bool = False) -> str:
    result = subprocess.run(
        command,
        check=True,
        text=True,
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.STDOUT if capture else None,
    )
    return result.stdout or ""


def probe(path: Path) -> dict[str, Any]:
    return json.loads(
        run(
            [
                FFPROBE, "-v", "error", "-show_streams", "-show_format",
                "-of", "json", str(path),
            ],
            capture=True,
        )
    )


def duration_from_probe(payload: dict[str, Any]) -> float:
    return float(payload.get("format", {}).get("duration") or 0)


def normalize_token(text: str) -> str:
    return re.sub(r"[^a-z0-9']", "", text.lower())


def canonicalize_word(text: str) -> str:
    lowered = text.lower()
    if lowered == "i":
        return "I"
    for prefix in ("i'm", "i'll", "i've", "i'd"):
        if lowered.startswith(prefix):
            return "I" + text[1:]
    return text


def load_words(path: Path) -> list[Word]:
    payload = json.loads(path.read_text())
    words: list[Word] = []
    for segment in payload.get("segments", []):
        for item in segment.get("words", []):
            text = canonicalize_word(str(item.get("word") or item.get("text") or "").strip())
            if text:
                words.append(
                    Word(
                        text=text,
                        start=float(item.get("start") or 0),
                        end=float(item.get("end") or item.get("start") or 0),
                    )
                )
    return words


def apply_replacements(words: list[Word], replacements: list[dict[str, Any]]) -> None:
    for replacement in replacements:
        source = [normalize_token(token) for token in replacement.get("from", [])]
        target = [str(token) for token in replacement.get("to", [])]
        if not source or not target:
            raise ValueError("Caption sequence replacements require source and target words")
        for index in range(0, len(words) - len(source) + 1):
            candidate = [normalize_token(word.text) for word in words[index:index + len(source)]]
            if candidate == source:
                source_words = words[index:index + len(source)]
                start = source_words[0].start
                end = source_words[-1].end
                trailing = source_words[-1].text[-1] if source_words[-1].text[-1:] in ".,?!" else ""
                step = (end - start) / len(target)
                replacement_words = [
                    Word(
                        text=canonicalize_word(text) + (trailing if offset == len(target) - 1 else ""),
                        start=start + step * offset,
                        end=start + step * (offset + 1),
                    )
                    for offset, text in enumerate(target)
                ]
                words[index:index + len(source)] = replacement_words
                break


def map_words_to_edit(
    words: list[Word], transcript_source_start: float, ranges: list[dict[str, float]]
) -> list[Word]:
    mapped: list[Word] = []
    output_cursor = 0.0
    for source_range in ranges:
        source_start = float(source_range["start"])
        source_end = float(source_range["end"])
        for word in words:
            absolute_start = transcript_source_start + word.start
            absolute_end = transcript_source_start + word.end
            if absolute_end <= source_start or absolute_start >= source_end:
                continue
            mapped.append(
                Word(
                    text=word.text,
                    start=output_cursor + max(absolute_start, source_start) - source_start,
                    end=output_cursor + min(absolute_end, source_end) - source_start,
                )
            )
        output_cursor += source_end - source_start
    return mapped


def group_words(words: list[Word]) -> list[list[Word]]:
    groups: list[list[Word]] = []
    current: list[Word] = []
    for word in words:
        if current:
            pause = word.start - current[-1].end
            duration = current[-1].end - current[0].start
            closed = current[-1].text.rstrip().endswith((".", "?", "!"))
            if pause > 0.48 or len(current) >= 6 or duration >= 2.5 or closed:
                groups.append(current)
                current = []
        current.append(word)
    if current:
        groups.append(current)
    return groups


def escape_ass(text: str) -> str:
    return text.replace("\\", r"\\").replace("{", r"\{").replace("}", r"\}")


def ass_time(seconds: float) -> str:
    seconds = max(0.0, seconds)
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    remaining = seconds % 60
    return f"{hours}:{minutes:02d}:{remaining:05.2f}"


def srt_time(seconds: float) -> str:
    milliseconds = int(round(max(0.0, seconds) * 1000))
    hours, remainder = divmod(milliseconds, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    secs, millis = divmod(remainder, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


def split_tokens(tokens: list[str]) -> list[list[str]]:
    if len(tokens) <= 3:
        return [tokens]
    def score(index: int) -> tuple[int, int]:
        left = len(" ".join(tokens[:index]))
        right = len(" ".join(tokens[index:]))
        orphan_penalty = 100 if index == 1 or len(tokens) - index == 1 else 0
        return orphan_penalty + abs(left - right), index

    split_at = min(range(1, len(tokens)), key=score)
    return [tokens[:split_at], tokens[split_at:]]


def caption_text(words: list[Word]) -> str:
    raw_tokens = [word.text for word in words]
    if raw_tokens:
        match = re.search(r"[A-Za-z]", raw_tokens[0])
        if match:
            index = match.start()
            raw_tokens[0] = raw_tokens[0][:index] + raw_tokens[0][index].upper() + raw_tokens[0][index + 1:]
    tokens = [escape_ass(token) for token in raw_tokens]
    candidates = [
        (index, len(normalize_token(token)))
        for index, token in enumerate(tokens)
        if normalize_token(token) not in STOP_WORDS
    ]
    highlight = max(candidates, key=lambda item: item[1])[0] if candidates else -1
    lines = split_tokens(tokens)
    output: list[str] = []
    flat_index = 0
    for line in lines:
        rendered: list[str] = []
        for token in line:
            if flat_index == highlight:
                rendered.append(f"{{\\c{GOLD_ASS}}}{token}{{\\c{CREAM_ASS}}}")
            else:
                rendered.append(token)
            flat_index += 1
        output.append(" ".join(rendered))
    return r"\N".join(output)


def plain_caption_text(words: list[Word]) -> str:
    return " ".join(word.text for word in words).strip()


def wrapped_hook(text: str, max_chars: int = 28) -> str:
    tokens = text.upper().split()
    lines: list[str] = []
    current = ""
    for token in tokens:
        candidate = token if not current else f"{current} {token}"
        if current and len(candidate) > max_chars:
            lines.append(current)
            current = token
        else:
            current = candidate
    if current:
        lines.append(current)
    return r"\N".join(escape_ass(line) for line in lines)


def write_caption_files(
    ass_path: Path,
    srt_path: Path,
    hook: str,
    brand: str,
    words: list[Word],
    duration: float,
) -> list[dict[str, Any]]:
    groups = group_words(words)
    cues: list[dict[str, Any]] = []
    for index, group in enumerate(groups):
        start = max(0, group[0].start - 0.04)
        next_start = groups[index + 1][0].start if index + 1 < len(groups) else duration
        end = min(duration, max(group[-1].end + 0.12, min(next_start - 0.03, group[-1].end + 0.7)))
        if end <= start:
            end = min(duration, start + 0.4)
        cues.append(
            {
                "start": start,
                "end": end,
                "text": plain_caption_text(group),
                "assText": caption_text(group),
            }
        )

    ass_header = """[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,Avenir Next Demi Bold,64,&H00D3E7F4,&H00D3E7F4,&H0018241F,&H50000000,0,0,0,0,100,100,0,0,1,6,2,2,72,72,180,1
Style: Hook,Avenir Next Demi Bold,58,&H00D3E7F4,&H00D3E7F4,&HCC17251F,&HCC17251F,0,0,0,0,100,100,1,0,3,18,0,8,72,72,118,1
Style: Brand,Avenir Next Demi Bold,26,&H004CC9F2,&H004CC9F2,&H0018241F,&H00000000,0,0,0,0,100,100,2,0,1,3,1,7,48,48,42,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    events = [
        f"Dialogue: 0,{ass_time(0)},{ass_time(duration)},Brand,,0,0,0,,{escape_ass(brand.upper())}",
        f"Dialogue: 1,{ass_time(0.15)},{ass_time(min(duration, 3.2))},Hook,,0,0,0,,{wrapped_hook(hook)}",
    ]
    for cue in cues:
        events.append(
            f"Dialogue: 2,{ass_time(cue['start'])},{ass_time(cue['end'])},Caption,,0,0,0,,{cue['assText']}"
        )
    ass_path.write_text(ass_header + "\n".join(events) + "\n")

    srt_lines: list[str] = []
    for index, cue in enumerate(cues, start=1):
        srt_lines.extend(
            [
                str(index),
                f"{srt_time(cue['start'])} --> {srt_time(cue['end'])}",
                cue["text"],
                "",
            ]
        )
    srt_path.write_text("\n".join(srt_lines))
    return cues


def filter_path(path: Path) -> str:
    return str(path).replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")


def measure_short_loudness(master: Path, ranges: list[dict[str, Any]]) -> dict[str, str]:
    """Measure the assembled short so the delivery pass can normalize deterministically."""
    command = [FFMPEG, "-hide_banner"]
    filters: list[str] = []
    concat_inputs: list[str] = []
    for index, source_range in enumerate(ranges):
        duration = float(source_range["end"]) - float(source_range["start"])
        command.extend(
            ["-ss", f"{float(source_range['start']):.6f}", "-t", f"{duration:.6f}", "-i", str(master)]
        )
        filters.append(
            f"[{index}:a]atrim=duration={duration:.6f},asetpts=PTS-STARTPTS,"
            f"aresample=48000:async=1:first_pts=0[measure{index}]"
        )
        concat_inputs.append(f"[measure{index}]")
    filters.append(
        "".join(concat_inputs)
        + f"concat=n={len(ranges)}:v=0:a=1[assembled]"
    )
    filters.append(
        "[assembled]loudnorm=I=-15:LRA=11:TP=-1.5:print_format=json[measured]"
    )
    command.extend(
        ["-filter_complex", ";".join(filters), "-map", "[measured]", "-f", "null", "-"]
    )
    output = run(command, capture=True)
    candidates = re.findall(r"\{[^{}]*\}", output, flags=re.DOTALL)
    for candidate in reversed(candidates):
        try:
            payload = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        if "input_i" in payload and "target_offset" in payload:
            return {key: str(value) for key, value in payload.items()}
    raise RuntimeError("FFmpeg loudnorm did not return a usable first-pass measurement")


def render_short(
    master: Path,
    short: dict[str, Any],
    output_root: Path,
    brand: str,
    render_version: str,
) -> dict[str, Any]:
    slug = str(short["slug"])
    short_dir = output_root / slug
    short_dir.mkdir(parents=True, exist_ok=False)
    ranges = short["segments"]
    expected_duration = sum(float(item["end"]) - float(item["start"]) for item in ranges)
    transcript_path = Path(short["transcript"])
    words = load_words(transcript_path)
    apply_replacements(words, short.get("captionReplacements", []))
    mapped_words = map_words_to_edit(words, float(short["transcriptSourceStart"]), ranges)

    ass_path = short_dir / f"{slug}.ass"
    srt_path = short_dir / f"{slug}.srt"
    cues = write_caption_files(
        ass_path,
        srt_path,
        str(short["hook"]),
        brand,
        mapped_words,
        expected_duration,
    )

    output_path = short_dir / f"{slug}-9x16-{render_version}.mp4"
    loudness = measure_short_loudness(master, ranges)
    loudnorm_filter = (
        "loudnorm=I=-15:LRA=11:TP=-1.5:"
        f"measured_I={loudness['input_i']}:"
        f"measured_LRA={loudness['input_lra']}:"
        f"measured_TP={loudness['input_tp']}:"
        f"measured_thresh={loudness['input_thresh']}:"
        f"offset={loudness['target_offset']}:"
        "linear=true:print_format=summary"
    )
    command = [FFMPEG, "-hide_banner", "-y"]
    for source_range in ranges:
        duration = float(source_range["end"]) - float(source_range["start"])
        command.extend(
            ["-ss", f"{float(source_range['start']):.6f}", "-t", f"{duration:.6f}", "-i", str(master)]
        )

    filters: list[str] = []
    concat_inputs: list[str] = []
    for index, source_range in enumerate(ranges):
        duration = float(source_range["end"]) - float(source_range["start"])
        filters.append(
            f"[{index}:v]trim=duration={duration:.6f},setpts=PTS-STARTPTS,"
            "fps=30,crop=ih*9/16:ih:(iw-ih*9/16)/2:0,scale=1080:1920:flags=lanczos,setsar=1,"
            "eq=contrast=1.025:saturation=1.04:brightness=0.003,"
            "unsharp=5:5:0.28:5:5:0,"
            "setparams=range=tv:color_primaries=bt709:color_trc=bt709:colorspace=bt709[v{index}]".format(index=index)
        )
        filters.append(
            f"[{index}:a]atrim=duration={duration:.6f},asetpts=PTS-STARTPTS,"
            f"aresample=48000:async=1:first_pts=0[a{index}]"
        )
        concat_inputs.extend([f"[v{index}]", f"[a{index}]"])

    filters.append(
        "".join(concat_inputs)
        + f"concat=n={len(ranges)}:v=1:a=1[concatv][concata]"
    )
    filters.append(f"[concata]{loudnorm_filter}[aout]")
    ass_filter = filter_path(ass_path)
    filters.append(
        f"[concatv]ass=filename='{ass_filter}',"
        f"drawbox=x=0:y=ih-14:w='iw*min(t/{expected_duration:.6f},1)':h=14:"
        "color=0xE8B44A@0.92:t=fill[vout]"
    )
    command.extend(
        [
            "-filter_complex", ";".join(filters),
            "-map", "[vout]", "-map", "[aout]",
            "-c:v", "libx264", "-preset", "medium", "-crf", "18",
            "-profile:v", "high", "-pix_fmt", "yuv420p", "-r", "30",
            "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
            "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
            "-movflags", "+faststart", "-shortest", str(output_path),
        ]
    )
    run(command)

    thumbnail_path = short_dir / f"{slug}-thumbnail.jpg"
    run(
        [
            FFMPEG, "-hide_banner", "-loglevel", "error", "-y",
            "-ss", f"{min(1.4, expected_duration / 3):.3f}", "-i", str(output_path),
            "-frames:v", "1", "-q:v", "2", str(thumbnail_path),
        ]
    )
    run([FFMPEG, "-hide_banner", "-v", "error", "-i", str(output_path), "-f", "null", "-"])

    details = probe(output_path)
    streams = details.get("streams", [])
    video = next(item for item in streams if item.get("codec_type") == "video")
    audio = next(item for item in streams if item.get("codec_type") == "audio")
    actual_duration = duration_from_probe(details)
    duration_delta = actual_duration - expected_duration
    if abs(duration_delta) > 0.12:
        raise RuntimeError(f"{slug}: duration delta {duration_delta:.3f}s exceeds tolerance")
    if int(video.get("width") or 0) != 1080 or int(video.get("height") or 0) != 1920:
        raise RuntimeError(f"{slug}: output is not 1080x1920")

    copy_path = short_dir / f"{slug}-platform-copy.md"
    copy_path.write_text(
        f"# {short['title']}\n\n"
        f"{short['description']}\n\n"
        f"## Hook\n{short['hook']}\n\n"
        f"## Suggested caption\n{short['socialCaption']}\n\n"
        f"## Tags\n{' '.join(short['tags'])}\n"
    )
    manifest = {
        "schemaVersion": 1,
        "renderVersion": render_version,
        "audioDelivery": {
            "targetIntegratedLoudness": "-15 LUFS",
            "truePeakCeiling": "-1.5 dBTP",
            "normalization": "EBU R128 measured two-pass loudnorm",
            "firstPass": loudness,
        },
        "slug": slug,
        "title": short["title"],
        "hook": short["hook"],
        "sourceMaster": str(master),
        "sourceRanges": ranges,
        "decisionModel": "non-destructive-multi-range-short-recipe",
        "expectedDurationSeconds": round(expected_duration, 3),
        "actualDurationSeconds": round(actual_duration, 3),
        "durationDeltaSeconds": round(duration_delta, 4),
        "captionCueCount": len(cues),
        "captionTranscript": str(transcript_path),
        "video": {
            "path": str(output_path),
            "width": int(video.get("width") or 0),
            "height": int(video.get("height") or 0),
            "codec": video.get("codec_name"),
            "frameRate": video.get("avg_frame_rate"),
            "startTime": float(video.get("start_time") or 0),
        },
        "audio": {
            "codec": audio.get("codec_name"),
            "sampleRate": int(audio.get("sample_rate") or 0),
            "channels": int(audio.get("channels") or 0),
            "startTime": float(audio.get("start_time") or 0),
        },
        "artifacts": {
            "captionsSrt": str(srt_path),
            "captionsAss": str(ass_path),
            "thumbnail": str(thumbnail_path),
            "platformCopy": str(copy_path),
        },
        "validation": {
            "fullDecode": "passed",
            "durationWithinTolerance": True,
            "portrait1080x1920": True,
            "audioPresent": True,
        },
    }
    manifest_path = short_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest


def write_contact_sheet(manifests: list[dict[str, Any]], output_root: Path) -> Path | None:
    thumbnails = [Path(item["artifacts"]["thumbnail"]) for item in manifests]
    if len(thumbnails) != 6:
        return None
    output = output_root / "episode-4-produced-shorts-contact-sheet.jpg"
    command = [FFMPEG, "-hide_banner", "-loglevel", "error", "-y"]
    for thumbnail in thumbnails:
        command.extend(["-i", str(thumbnail)])
    layout = "0_0|360_0|720_0|0_640|360_640|720_640"
    scale_filters = ";".join(
        f"[{index}:v]scale=360:640:flags=lanczos[s{index}]" for index in range(6)
    )
    inputs = "".join(f"[s{index}]" for index in range(6))
    command.extend(
        [
            "-filter_complex",
            f"{scale_filters};{inputs}xstack=inputs=6:layout={layout}",
            "-q:v", "2", str(output),
        ]
    )
    run(command)
    return output


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True, type=Path)
    parser.add_argument("--only", action="append", default=[])
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    config = json.loads(args.config.read_text())
    master = Path(config["sourceMaster"])
    output_root = Path(config["outputRoot"])
    if not master.exists():
        raise FileNotFoundError(master)
    selected = [
        item for item in config["shorts"]
        if not args.only or item["slug"] in set(args.only)
    ]
    if not selected:
        raise ValueError("No shorts selected")
    if output_root.exists() and any(output_root.iterdir()):
        if not args.force:
            raise FileExistsError(f"Output is non-empty: {output_root}")
        shutil.rmtree(output_root)
    output_root.mkdir(parents=True, exist_ok=True)

    manifests: list[dict[str, Any]] = []
    for index, short in enumerate(selected, start=1):
        print(f"[{index}/{len(selected)}] Rendering {short['slug']}", flush=True)
        manifests.append(
            render_short(
                master,
                short,
                output_root,
                config["brand"],
                config.get("renderVersion", "v001"),
            )
        )
    contact_sheet = write_contact_sheet(manifests, output_root)
    package_manifest = {
        "schemaVersion": 1,
        "renderVersion": config.get("renderVersion", "v001"),
        "package": config["package"],
        "sourceMaster": str(master),
        "shortCount": len(manifests),
        "shorts": manifests,
        "contactSheet": str(contact_sheet) if contact_sheet else None,
        "status": "rendered-and-machine-validated-needs-producer-visual-watch",
    }
    (output_root / "manifest.json").write_text(json.dumps(package_manifest, indent=2) + "\n")
    print(json.dumps({"outputRoot": str(output_root), "shortCount": len(manifests)}, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except subprocess.CalledProcessError as error:
        print(f"Command failed ({error.returncode}): {' '.join(error.cmd)}", file=sys.stderr)
        raise
