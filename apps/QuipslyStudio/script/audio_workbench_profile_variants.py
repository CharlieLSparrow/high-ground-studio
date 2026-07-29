#!/usr/bin/env python3
"""Render short Audio Workbench treatment profile variants.

This script turns the source-activity map into proof-listen snippets. It does
not create a new full baseline. It renders small windows through multiple
profile candidates so the next v006/v007 spine can be promoted from evidence
instead of guesswork.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


PROFILE_DEFS: dict[str, dict[str, Any]] = {
    "conservative-human": {
        "intent": "Preserve humanity and overlap first. Reduce obvious rumble/noise without hard gating.",
        "charlieFilter": "aresample=48000,highpass=f=65,lowpass=f=17000,afftdn=nf=-20,agate=threshold=0.005:ratio=2.2:attack=10:release=650:makeup=1,volume=0.42",
        "homerFilter": "aresample=48000,highpass=f=75,lowpass=f=16500,afftdn=nf=-20,agate=threshold=0.002:ratio=1.45:attack=12:release=950:makeup=1,volume=1.45",
        "referenceFilter": "aresample=48000,highpass=f=45,lowpass=f=18000,volume=0.45",
        "busFilter": "acompressor=threshold=-20dB:ratio=1.6:attack=20:release=320,alimiter=limit=0.78,loudnorm=I=-16:TP=-1.8:LRA=11",
    },
    "homer-preserving-clean": {
        "intent": "Target the v005 risk: keep Homer's DJI contribution more intact while still reducing Charlie phone-call echo.",
        "charlieFilter": "aresample=48000,highpass=f=70,lowpass=f=16500,afftdn=nf=-27,agate=threshold=0.009:ratio=7:attack=8:release=430:makeup=1,volume=0.40",
        "homerFilter": "aresample=48000,highpass=f=80,lowpass=f=16000,afftdn=nf=-20,agate=threshold=0.0025:ratio=1.65:attack=10:release=1050:makeup=1,volume=1.55",
        "referenceFilter": "aresample=48000,highpass=f=45,lowpass=f=18000,volume=0.50",
        "busFilter": "acompressor=threshold=-21dB:ratio=1.7:attack=18:release=300,alimiter=limit=0.78,loudnorm=I=-16:TP=-1.8:LRA=11",
    },
    "homer-rich-balanced-v007": {
        "intent": "Keep the v006 echo fix, then make Homer less muted by restoring warmth, presence, and level without letting park noise dominate.",
        "charlieFilter": "aresample=48000,highpass=f=70,lowpass=f=16500,afftdn=nf=-27,agate=threshold=0.009:ratio=7:attack=8:release=430:makeup=1,volume=0.39",
        "homerFilter": "aresample=48000,highpass=f=65,lowpass=f=16500,afftdn=nf=-20,agate=threshold=0.002:ratio=1.35:attack=12:release=1250:makeup=1,equalizer=f=180:t=q:w=0.85:g=1.3,equalizer=f=3200:t=q:w=1.0:g=1.1,acompressor=threshold=-24dB:ratio=1.55:attack=18:release=280:makeup=1.12,volume=1.78",
        "referenceFilter": "aresample=48000,highpass=f=45,lowpass=f=18000,volume=0.50",
        "busFilter": "acompressor=threshold=-21dB:ratio=1.65:attack=18:release=310,alimiter=limit=0.78,loudnorm=I=-16:TP=-1.8:LRA=11",
    },
    "homer-forward-rich-v007": {
        "intent": "A more assertive Homer rescue audition if the balanced v007 still feels recessed. Use carefully because it may reveal more outdoor bed.",
        "charlieFilter": "aresample=48000,highpass=f=70,lowpass=f=16500,afftdn=nf=-27,agate=threshold=0.009:ratio=7:attack=8:release=430:makeup=1,volume=0.37",
        "homerFilter": "aresample=48000,highpass=f=60,lowpass=f=16600,afftdn=nf=-20,agate=threshold=0.0018:ratio=1.22:attack=14:release=1350:makeup=1,equalizer=f=165:t=q:w=0.9:g=1.6,equalizer=f=2800:t=q:w=1.1:g=1.3,acompressor=threshold=-25dB:ratio=1.45:attack=20:release=300:makeup=1.18,volume=1.92",
        "referenceFilter": "aresample=48000,highpass=f=45,lowpass=f=18000,volume=0.48",
        "busFilter": "acompressor=threshold=-21dB:ratio=1.6:attack=20:release=320,alimiter=limit=0.78,loudnorm=I=-16:TP=-1.8:LRA=11",
    },
    "aggressive-rescue": {
        "intent": "Use only when noise/echo is worse than the cost. This may sound less human.",
        "charlieFilter": "aresample=48000,highpass=f=80,lowpass=f=15500,afftdn=nf=-32,agate=threshold=0.012:ratio=12:attack=6:release=300:makeup=1,acompressor=threshold=-22dB:ratio=2.2:attack=12:release=180,volume=0.38",
        "homerFilter": "aresample=48000,highpass=f=90,lowpass=f=15000,afftdn=nf=-26,agate=threshold=0.0045:ratio=3:attack=8:release=650:makeup=1,acompressor=threshold=-24dB:ratio=2:attack=16:release=220,volume=1.50",
        "referenceFilter": "aresample=48000,highpass=f=55,lowpass=f=17000,volume=0.40",
        "busFilter": "acompressor=threshold=-22dB:ratio=2.1:attack=15:release=230,alimiter=limit=0.78,loudnorm=I=-16:TP=-1.8:LRA=10",
    },
}


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.write_text(json.dumps(value, indent=2, sort_keys=True), encoding="utf-8")


def run_capture(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, text=True, capture_output=True, check=False)


def resolve_baseline_dir(input_path: Path) -> Path:
    if (input_path / "manifest.json").exists():
        return input_path
    nested = input_path / "work" / "conformed-production-baseline"
    if (nested / "manifest.json").exists():
        return nested
    raise FileNotFoundError(
        "Could not find a conformed production baseline manifest at "
        f"{input_path}/manifest.json or {nested}/manifest.json"
    )


def version_suffix(baseline_id: str) -> str:
    match = re.search(r"(v\d+)$", baseline_id)
    return match.group(1) if match else "unknown"


def artifact_path(value: Any) -> Path | None:
    if isinstance(value, str):
        return Path(value)
    if isinstance(value, dict) and value.get("path"):
        return Path(value["path"])
    return None


def ffprobe_audio(path: Path) -> dict[str, Any]:
    proc = run_capture(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_format",
            "-show_streams",
            "-of",
            "json",
            str(path),
        ]
    )
    if proc.returncode != 0:
        return {"path": str(path), "error": proc.stderr.strip() or proc.stdout.strip()}
    data = json.loads(proc.stdout)
    stream = next((item for item in data.get("streams", []) if item.get("codec_type") == "audio"), {})
    try:
        duration = float(data.get("format", {}).get("duration"))
    except (TypeError, ValueError):
        duration = None
    return {
        "path": str(path),
        "codec": stream.get("codec_name"),
        "sampleRate": stream.get("sample_rate"),
        "channels": stream.get("channels"),
        "durationSeconds": duration,
        "sizeBytes": int(data.get("format", {}).get("size") or 0),
    }


def load_paths(baseline_dir: Path, baseline_manifest: dict[str, Any]) -> dict[str, Path]:
    outputs = baseline_manifest.get("outputs", {})
    automation_path = artifact_path(outputs.get("speakerGapAutomation"))
    if not automation_path:
        raise FileNotFoundError("Baseline manifest is missing speakerGapAutomation")
    automation = read_json(automation_path)
    stems = automation.get("stems", {})
    paths = {
        "charlieAligned": Path(stems["charlieAligned"]["path"]),
        "homerDjiAligned": Path(stems["homerDjiAligned"]["path"]),
        "referenceAligned": Path(stems["referenceAligned"]["path"]),
        "sourceAwareMix": artifact_path(outputs.get("sourceAwareMix")),
        "masterWav": artifact_path(outputs.get("masterWav")),
    }
    return {key: value for key, value in paths.items() if value}


def safe_label(text: str) -> str:
    return re.sub(r"[^a-zA-Z0-9._-]+", "-", text).strip("-").lower()


def render_excerpt(input_path: Path, output_path: Path, start: float, duration: float) -> dict[str, Any]:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-y",
        "-ss",
        f"{start:.3f}",
        "-t",
        f"{duration:.3f}",
        "-i",
        str(input_path),
        "-vn",
        "-ar",
        "48000",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        str(output_path),
    ]
    proc = run_capture(cmd)
    return {
        "ok": proc.returncode == 0,
        "path": str(output_path),
        "command": cmd,
        "error": "" if proc.returncode == 0 else proc.stderr[-4000:],
        "probe": ffprobe_audio(output_path) if output_path.exists() else None,
    }


def render_profile(
    *,
    paths: dict[str, Path],
    output_path: Path,
    start: float,
    duration: float,
    profile: dict[str, Any],
) -> dict[str, Any]:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    filter_complex = (
        f"[0:a]{profile['charlieFilter']}[c];"
        f"[1:a]{profile['homerFilter']}[h];"
        f"[2:a]{profile['referenceFilter']}[r];"
        "[c][h][r]amix=inputs=3:duration=longest:normalize=0,"
        f"{profile['busFilter']}[out]"
    )
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-y",
        "-ss",
        f"{start:.3f}",
        "-t",
        f"{duration:.3f}",
        "-i",
        str(paths["charlieAligned"]),
        "-ss",
        f"{start:.3f}",
        "-t",
        f"{duration:.3f}",
        "-i",
        str(paths["homerDjiAligned"]),
        "-ss",
        f"{start:.3f}",
        "-t",
        f"{duration:.3f}",
        "-i",
        str(paths["referenceAligned"]),
        "-filter_complex",
        filter_complex,
        "-map",
        "[out]",
        "-ar",
        "48000",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        str(output_path),
    ]
    proc = run_capture(cmd)
    return {
        "ok": proc.returncode == 0,
        "path": str(output_path),
        "profileIntent": profile["intent"],
        "command": cmd,
        "error": "" if proc.returncode == 0 else proc.stderr[-4000:],
        "probe": ffprobe_audio(output_path) if output_path.exists() else None,
    }


def choose_windows(activity: dict[str, Any], *, limit: int, duration: float, pad: float) -> list[dict[str, Any]]:
    review = activity.get("reviewWindows", [])
    chosen = []
    seen: set[int] = set()
    for row in review:
        center = (float(row["start"]) + float(row["end"])) / 2.0
        start = max(0.0, center - (duration / 2.0) - pad)
        key = int(start // max(duration, 1))
        if key in seen:
            continue
        seen.add(key)
        chosen.append(
            {
                "label": f"{row.get('timecode', 'window')}-{safe_label('-'.join(row.get('flags', [])))}",
                "sourceActivityStart": row.get("start"),
                "sourceActivityEnd": row.get("end"),
                "start": round(start, 3),
                "duration": duration,
                "flags": row.get("flags", []),
                "priority": row.get("priority"),
            }
        )
        if len(chosen) >= limit:
            break
    return chosen


def write_markdown(report: dict[str, Any], path: Path) -> None:
    lines = [
        "# Audio Workbench profile variants",
        "",
        f"- Baseline: `{report['baselineId']}`",
        f"- Status: proof-window variants only, not a new full spine",
        f"- Output dir: `{report['outputDir']}`",
        "",
        "## Why this exists",
        "",
        "This packet renders short profile candidates so we can choose the best cleanup behavior before paying the cost of a full baseline render.",
        "",
        "## Profiles",
        "",
    ]
    for profile_name, profile in report["profiles"].items():
        lines.append(f"- `{profile_name}`: {profile['intent']}")

    lines.extend(["", "## Windows", ""])
    for window in report["windows"]:
        lines.extend(
            [
                f"### {window['label']}",
                "",
                f"- Sequence: `{window['start']}` for `{window['duration']}` seconds",
                f"- Flags: `{', '.join(window.get('flags', []))}`",
                "- Listen order:",
                f"  - current source-aware mix: `{window['excerpts'].get('currentSourceAwareMix', {}).get('path')}`",
                f"  - current mastered spine: `{window['excerpts'].get('currentMaster', {}).get('path')}`",
            ]
        )
        for profile_name, result in window["variants"].items():
            lines.append(f"  - {profile_name}: `{result.get('path')}`")
        lines.append("")

    lines.extend(
        [
            "## Decision rule",
            "",
            "- If Homer is missing or thin in v005, prefer the Homer-preserving profile unless it lets too much park noise through.",
            "- If Charlie echo remains under Homer, compare current source-aware mix against variants before changing sync.",
            "- If aggressive rescue sounds fake, do not promote it globally; keep it as a local emergency profile.",
            "- Promote a profile only by creating a new full baseline version. Do not overwrite v005.",
            "",
        ]
    )
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    parser.add_argument("--activity-map", type=Path)
    parser.add_argument("--limit", type=int, default=6)
    parser.add_argument("--duration", type=float, default=18.0)
    parser.add_argument("--pad", type=float, default=2.0)
    parser.add_argument("--output-dir", type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    baseline_manifest = read_json(baseline_dir / "manifest.json")
    baseline_id = baseline_manifest.get("baselineId", "unknown-baseline")
    suffix = version_suffix(baseline_id)
    activity_path = args.activity_map or (baseline_dir / f"audio-workbench-source-activity-{suffix}.json")
    activity = read_json(activity_path)
    paths = load_paths(baseline_dir, baseline_manifest)

    run_stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    output_dir = args.output_dir or (baseline_dir / f"profile-variants-{suffix}-{run_stamp}")
    windows = choose_windows(activity, limit=args.limit, duration=args.duration, pad=args.pad)
    rendered_windows = []
    for window in windows:
        label = safe_label(window["label"])
        window_dir = output_dir / label
        excerpts: dict[str, Any] = {}
        if paths.get("sourceAwareMix"):
            excerpts["currentSourceAwareMix"] = render_excerpt(
                paths["sourceAwareMix"],
                window_dir / f"{label}-current-source-aware.m4a",
                window["start"],
                window["duration"],
            )
        if paths.get("masterWav"):
            excerpts["currentMaster"] = render_excerpt(
                paths["masterWav"],
                window_dir / f"{label}-current-master.m4a",
                window["start"],
                window["duration"],
            )
        variants = {
            profile_name: render_profile(
                paths=paths,
                output_path=window_dir / f"{label}-{profile_name}.m4a",
                start=window["start"],
                duration=window["duration"],
                profile=profile,
            )
            for profile_name, profile in PROFILE_DEFS.items()
        }
        rendered_windows.append({**window, "dir": str(window_dir), "excerpts": excerpts, "variants": variants})

    report = {
        "schema": "quipsly.audio-workbench.profile-variants.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "baselineId": baseline_id,
        "baselineDir": str(baseline_dir),
        "activityMap": str(activity_path),
        "outputDir": str(output_dir),
        "profiles": PROFILE_DEFS,
        "windows": rendered_windows,
        "safety": [
            "No original media is mutated.",
            "These are proof-window snippets only.",
            "Do not promote a profile without creating a new full baseline version.",
        ],
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / f"audio-workbench-profile-variants-{suffix}.json"
    md_path = output_dir / f"audio-workbench-profile-variants-{suffix}.md"
    write_json(json_path, report)
    write_markdown(report, md_path)
    print(json.dumps({"json": str(json_path), "markdown": str(md_path), "outputDir": str(output_dir)}, indent=2))


if __name__ == "__main__":
    main()
