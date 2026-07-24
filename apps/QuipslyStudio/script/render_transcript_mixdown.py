#!/usr/bin/env python3
"""Render a sequence-aligned audio mixdown for ASR.

This creates the audio spine a transcript provider should hear: available audio
lanes aligned by sequence offset, mixed into one temporary WAV. It does not cut
media, change decisions, import transcripts, or save sessions.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any


ROOT_DIR = Path(__file__).resolve().parents[1]
AGENTCTL = ROOT_DIR / "script" / "agentctl.sh"
DEFAULT_OUTPUT_DIR = (ROOT_DIR / "../../artifacts/transcripts/audio-mixdowns").resolve()


def run_agent(*args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(
        [str(AGENTCTL), *args],
        cwd=str(ROOT_DIR),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if check and result.returncode != 0:
        raise RuntimeError(result.stdout + result.stderr)
    return result


def agent_json(*args: str) -> dict[str, Any]:
    return json.loads(run_agent(*args).stdout)


def wait_for_session(session_name: str, timeout_seconds: float = 20.0) -> dict[str, Any]:
    deadline = time.time() + timeout_seconds
    latest: dict[str, Any] = {}
    while time.time() <= deadline:
        latest = agent_json("state")
        if latest.get("activeSessionName") == session_name and latest.get("laneCount", 0) > 0:
            return latest
        time.sleep(0.25)
    return latest


def load_state(session_name: str | None, state_path: str | None) -> dict[str, Any]:
    if state_path:
        return json.loads(Path(state_path).read_text(encoding="utf-8"))
    if session_name:
        run_agent("load-session", session_name)
        return wait_for_session(session_name)
    return agent_json("state")


def audio_path_for_lane(lane: dict[str, Any]) -> Path | None:
    for key in ("playbackPath", "vaultProxyPath", "sourcePath", "mediaPath", "originalPath"):
        raw = lane.get(key)
        if not raw:
            continue
        path = Path(str(raw)).expanduser()
        if path.exists() and path.is_file():
            return path
    return None


def usable_audio_lanes(state: dict[str, Any]) -> list[dict[str, Any]]:
    lanes: list[dict[str, Any]] = []
    for lane in state.get("lanes") or []:
        kind = str(lane.get("mediaKind") or lane.get("kind") or "").lower()
        if kind != "audio":
            continue
        path = audio_path_for_lane(lane)
        if not path:
            continue
        lanes.append({**lane, "_resolvedAudioPath": str(path)})
    return lanes


def ffmpeg_path() -> str:
    candidate = shutil.which("ffmpeg") or "/opt/homebrew/bin/ffmpeg"
    if Path(candidate).exists():
        return candidate
    raise RuntimeError("ffmpeg is required to render transcript mixdowns.")


def render_mixdown(state: dict[str, Any], output_path: Path) -> dict[str, Any]:
    lanes = usable_audio_lanes(state)
    if not lanes:
        raise RuntimeError("No readable audio lanes found for transcript mixdown.")

    sequence_duration = float(state.get("sequenceDuration") or 0)
    if sequence_duration <= 0:
        sequence_duration = max(float(lane.get("duration") or 0) for lane in lanes)

    command = [ffmpeg_path(), "-y", "-hide_banner", "-nostdin", "-loglevel", "error"]
    for lane in lanes:
        command.extend(["-i", lane["_resolvedAudioPath"]])

    filter_parts: list[str] = []
    mix_labels: list[str] = []
    lane_report: list[dict[str, Any]] = []
    for index, lane in enumerate(lanes):
        offset = float(lane.get("sourceOffset") or 0)
        label = f"a{index}"
        if offset >= 0:
            trim = f"atrim=start={offset:.6f}:duration={sequence_duration:.6f},asetpts=PTS-STARTPTS"
            delay = 0.0
        else:
            trim = f"atrim=start=0:duration={sequence_duration:.6f},asetpts=PTS-STARTPTS"
            delay = abs(offset)
        delay_filter = f",adelay={int(round(delay * 1000))}:all=1" if delay > 0 else ""
        filter_parts.append(
            f"[{index}:a]{trim}{delay_filter},aformat=channel_layouts=mono,aresample=16000[{label}]"
        )
        mix_labels.append(f"[{label}]")
        lane_report.append(
            {
                "name": lane.get("name"),
                "id": lane.get("id"),
                "sourceOffset": offset,
                "delaySeconds": delay,
                "trimStartSeconds": max(0.0, offset),
                "path": lane["_resolvedAudioPath"],
            }
        )

    filter_parts.append(
        f"{''.join(mix_labels)}amix=inputs={len(mix_labels)}:duration=longest:normalize=1,"
        f"atrim=duration={sequence_duration:.6f},aresample=16000[out]"
    )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    command.extend(["-filter_complex", ";".join(filter_parts), "-map", "[out]", "-ac", "1", "-ar", "16000", str(output_path)])
    result = subprocess.run(command, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip() or "ffmpeg mixdown failed")

    return {
        "packetType": "quipslystudio-transcript-mixdown",
        "activeSessionName": state.get("activeSessionName"),
        "sequenceTitle": state.get("sequenceTitle"),
        "sequenceDuration": sequence_duration,
        "outputPath": str(output_path),
        "audioLaneCount": len(lanes),
        "lanes": lane_report,
        "truth": "Transcript mixdown aligns readable audio lanes by sourceOffset for ASR. It does not cut or mutate source media.",
    }


def slug(value: str) -> str:
    cleaned = "".join(ch.lower() if ch.isalnum() else "-" for ch in value).strip("-")
    while "--" in cleaned:
        cleaned = cleaned.replace("--", "-")
    return cleaned or "quipsly-session"


def main() -> int:
    parser = argparse.ArgumentParser(description="Render a sequence-aligned ASR mixdown from the running QuipslyStudio state.")
    parser.add_argument("--session", help="Optional session name to load before rendering.")
    parser.add_argument("--state", help="Optional /state JSON file to render from.")
    parser.add_argument("--output", help="Output WAV path. Defaults under artifacts/transcripts/audio-mixdowns.")
    parser.add_argument("--report", help="Optional JSON report path.")
    args = parser.parse_args()

    state = load_state(args.session, args.state)
    name = str(state.get("activeSessionName") or args.session or "quipsly-session")
    output = Path(args.output).expanduser().resolve() if args.output else DEFAULT_OUTPUT_DIR / f"{slug(name)}-transcript-spine.wav"
    report = render_mixdown(state, output)
    text = json.dumps(report, indent=2, sort_keys=True)
    if args.report:
        report_path = Path(args.report).expanduser().resolve()
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(text + "\n", encoding="utf-8")
    print(text)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"Transcript mixdown failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
