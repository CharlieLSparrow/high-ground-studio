#!/usr/bin/env python3
"""Measure Quipsly staged audio candidates with ffprobe and ffmpeg loudnorm.

This intentionally keeps metrics outside the app UI for now. The app can ingest
this JSON later, while CLI output gives Codex and humans fast evidence today.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Any


def run(command: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, text=True, capture_output=True, check=False)


def ffprobe_duration_size(path: str) -> dict[str, Any]:
    result = run([
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration,size",
        "-of", "json",
        path,
    ])
    if result.returncode != 0:
        return {"error": result.stderr.strip()}
    payload = json.loads(result.stdout or "{}")
    fmt = payload.get("format", {})
    return {
        "durationSeconds": float(fmt.get("duration", 0) or 0),
        "sizeBytes": int(fmt.get("size", 0) or 0),
    }


def loudnorm_scan(path: str) -> dict[str, Any]:
    result = run([
        "ffmpeg", "-hide_banner", "-nostats", "-i", path,
        "-af", "loudnorm=I=-16:TP=-1.8:LRA=11:print_format=json",
        "-f", "null", "-",
    ])
    text = result.stderr
    matches = re.findall(r"\{\s*\"input_i\".*?\}", text, re.S)
    match = matches[-1] if matches else None
    if result.returncode != 0 or not match:
        return {"error": (text[-1200:] if text else "loudnorm failed")}
    data = json.loads(match)
    numeric_keys = ["input_i", "input_tp", "input_lra", "input_thresh", "output_i", "output_tp", "output_lra", "output_thresh", "target_offset"]
    parsed: dict[str, Any] = {}
    for key, value in data.items():
        if key in numeric_keys:
            try:
                parsed[key] = float(value)
            except (TypeError, ValueError):
                parsed[key] = value
        else:
            parsed[key] = value
    return parsed


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    manifest = json.loads(args.manifest.read_text())
    stages = []
    for stage in manifest.get("stages", []):
        path = stage.get("path", "")
        metrics = {
            "id": stage.get("id"),
            "title": stage.get("title"),
            "path": path,
            "probe": ffprobe_duration_size(path),
            "loudnorm": loudnorm_scan(path),
        }
        stages.append(metrics)
        loud = metrics["loudnorm"]
        print(f"{metrics['id']} {metrics['title']}: duration={metrics['probe'].get('durationSeconds')} LUFS={loud.get('input_i')} TP={loud.get('input_tp')} LRA={loud.get('input_lra')}")

    report = {
        "schema": "quipsly.audioStageMetrics.v1",
        "generatedAt": datetime.now().isoformat(),
        "manifestPath": str(args.manifest),
        "stages": stages,
    }
    output = args.output or args.manifest.with_name("stage-metrics.json")
    output.write_text(json.dumps(report, indent=2) + "\n")
    print(f"Wrote {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
