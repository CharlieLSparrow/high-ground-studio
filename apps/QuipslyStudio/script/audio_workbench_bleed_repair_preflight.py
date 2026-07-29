#!/usr/bin/env python3
"""Prepare a guarded proof-window repair render path for bleed warnings.

This script is intentionally conservative:
- By default it writes a locked preflight packet and does not render.
- It only renders proof-window repair candidates when the baseline manifest has
  a failed human listen decision, or when an explicit override is supplied for
  an isolated proof-only sandbox.
- It never mutates original media and never overwrites v006.
"""

from __future__ import annotations

import argparse
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


RELAXED_CHARLIE_PROFILE = {
    "profileId": "v007-charlie-natural-overlap-proof",
    "intent": "Relax Charlie contribution gating only for the warned overlap proof window so reactions do not feel chopped while checking that Homer echo does not return.",
    "charlieFilter": "aresample=48000,highpass=f=68,lowpass=f=16500,afftdn=nf=-24,agate=threshold=0.006:ratio=3.2:attack=10:release=720:makeup=1,volume=0.41",
    "homerFilter": "aresample=48000,highpass=f=80,lowpass=f=16000,afftdn=nf=-20,agate=threshold=0.0025:ratio=1.65:attack=10:release=1050:makeup=1,volume=1.55",
    "referenceFilter": "aresample=48000,highpass=f=45,lowpass=f=18000,volume=0.50",
    "busFilter": "acompressor=threshold=-21dB:ratio=1.7:attack=18:release=300,alimiter=limit=0.78,loudnorm=I=-16:TP=-1.8:LRA=11",
}


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.write_text(json.dumps(value, indent=2) + "\n")


def output_path(value: Any) -> str | None:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        path = value.get("path")
        if isinstance(path, str):
            return path
    return None


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in value)
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def run_capture(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, text=True, capture_output=True, check=False)


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


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def stem_paths(manifest: dict[str, Any]) -> dict[str, Path]:
    outputs = manifest.get("outputs") or {}
    automation_path = output_path(outputs.get("speakerGapAutomation"))
    if not automation_path or not Path(automation_path).exists():
        raise SystemExit("Missing speakerGapAutomation evidence")
    automation = load_json(Path(automation_path))
    stems = automation.get("stems") or {}
    required = {
        "charlieAligned": "charlieAligned",
        "homerDjiAligned": "homerDjiAligned",
        "referenceAligned": "referenceAligned",
    }
    paths: dict[str, Path] = {}
    for out_key, stem_key in required.items():
        stem = stems.get(stem_key) or {}
        path = stem.get("path")
        if not path or not Path(path).exists():
            raise SystemExit(f"Missing required stem path: {stem_key}")
        paths[out_key] = Path(path)
    return paths


def build_render_command(paths: dict[str, Path], output_path: Path, start: float, duration: float) -> list[str]:
    profile = RELAXED_CHARLIE_PROFILE
    filter_complex = (
        f"[0:a]{profile['charlieFilter']}[c];"
        f"[1:a]{profile['homerFilter']}[h];"
        f"[2:a]{profile['referenceFilter']}[r];"
        "[c][h][r]amix=inputs=3:duration=longest:normalize=0,"
        f"{profile['busFilter']}[out]"
    )
    return [
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


def build_markdown(payload: dict[str, Any]) -> str:
    lines = [
        f"# Bleed Repair Preflight: {payload['baselineId']}",
        "",
        f"Generated: `{payload['generatedAt']}`",
        "",
        "This packet prepares a proof-window v007 repair render path. It does not approve v006, does not render by default, and does not mutate source media.",
        "",
        "## Gate",
        "",
        f"- Approval status: `{payload['approvalStatus']}`",
        f"- Safe to render now: `{str(payload['safeToRender']).lower()}`",
        f"- Render attempted: `{str(payload['renderAttempted']).lower()}`",
        f"- Rendered output: `{payload.get('renderedOutput') or ''}`",
        "",
        "## Targeted repair",
        "",
        f"- Warning: `{payload['repairAction'].get('warning')}`",
        f"- Window: `{payload['repairAction'].get('windowLabel')}`",
        f"- Start: `{payload['repairAction'].get('sequenceStartSeconds')}` seconds",
        f"- Duration: `{payload['repairAction'].get('durationSeconds')}` seconds",
        f"- Profile: `{payload['profile']['profileId']}`",
        f"- Intent: {payload['profile']['intent']}",
        "",
        "## Command",
        "",
        "```bash",
        " ".join(shell_quote(part) for part in payload["renderCommand"]),
        "```",
        "",
        "## Next safest action",
        "",
        payload["nextSafestAction"],
        "",
    ]
    if payload.get("renderError"):
        lines.extend(["## Render error", "", "```", str(payload["renderError"])[-4000:], "```", ""])
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    parser.add_argument("--render-proof", action="store_true")
    parser.add_argument("--allow-unapproved-proof-render", action="store_true")
    args = parser.parse_args()

    baseline_dir = args.baseline_dir.expanduser().resolve()
    manifest_path = baseline_dir / "manifest.json"
    if not manifest_path.exists():
        raise SystemExit(f"Missing manifest: {manifest_path}")

    manifest = load_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    workorder_path = output_path(outputs.get("latestBleedRepairWorkorder"))
    if not workorder_path or not Path(workorder_path).exists():
        raise SystemExit("Missing latestBleedRepairWorkorder")
    workorder = load_json(Path(workorder_path))
    actions = workorder.get("repairActions") or []
    if not actions:
        raise SystemExit("Bleed repair workorder has no repair actions")

    action = actions[0]
    start = float(action.get("sequenceStartSeconds") or 0.0)
    duration = float(action.get("durationSeconds") or 35.0)
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    slug = safe_slug(str(manifest.get("baselineId") or "audio-baseline").replace("episode-4-conformed-production-baseline-", ""))
    output_dir = baseline_dir / f"bleed-repair-preflight-{slug}-{generated_at}"
    output_dir.mkdir(parents=True, exist_ok=False)
    output_audio = output_dir / f"{safe_slug(str(action.get('windowLabel') or 'repair-window'))}-v007-charlie-natural-overlap-proof.m4a"
    paths = stem_paths(manifest)
    command = build_render_command(paths, output_audio, start, duration)
    safe_to_render = manifest.get("approvalStatus") == "failed-human-listen" or args.allow_unapproved_proof_render
    render_attempted = bool(args.render_proof and safe_to_render)
    render_error = ""
    render_result: dict[str, Any] | None = None
    if args.render_proof and not safe_to_render:
        render_error = "Render refused: human listen has not failed and no proof-only override was supplied."
    elif render_attempted:
        proc = run_capture(command)
        render_result = {
            "ok": proc.returncode == 0,
            "returnCode": proc.returncode,
            "stderrTail": proc.stderr[-4000:],
            "stdoutTail": proc.stdout[-2000:],
            "probe": ffprobe_audio(output_audio) if output_audio.exists() else None,
        }
        if proc.returncode != 0:
            render_error = proc.stderr[-4000:] or proc.stdout[-2000:]

    payload = {
        "schema": "quipsly.audio-workbench.bleed-repair-preflight.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": manifest.get("baselineId"),
        "approvalStatus": manifest.get("approvalStatus"),
        "sourceWorkorder": workorder_path,
        "repairAction": action,
        "profile": RELAXED_CHARLIE_PROFILE,
        "safeToRender": safe_to_render,
        "renderAttempted": render_attempted,
        "renderCommand": command,
        "renderedOutput": str(output_audio) if output_audio.exists() else "",
        "renderResult": render_result,
        "renderError": render_error,
        "originalMediaMutated": False,
        "timelinePreserved": True,
        "nextSafestAction": "If human listen approves v006, ignore this repair preflight and unlock branch inheritance normally. If human listen fails on the warned window, record failed-human-listen, rerun this script with --render-proof, compare the v007 proof-window candidate, then promote only after proof listening.",
    }
    output_json = output_dir / "bleed-repair-preflight.json"
    output_md = output_dir / "bleed-repair-preflight.md"
    write_json(output_json, payload)
    output_md.write_text(build_markdown(payload))

    outputs["latestBleedRepairPreflight"] = str(output_json)
    outputs["latestBleedRepairPreflightMarkdown"] = str(output_md)
    manifest["bleedRepairPreflightCount"] = int(manifest.get("bleedRepairPreflightCount") or 0) + 1
    manifest["bleedRepairPreflightSafeToRender"] = bool(safe_to_render)
    manifest["bleedRepairPreflightRenderAttempted"] = bool(render_attempted)
    write_json(manifest_path, manifest)

    print(f"Wrote {output_md}")
    print(f"Wrote {output_json}")
    print(f"Safe to render: {safe_to_render}")
    print(f"Render attempted: {render_attempted}")
    if render_error:
        print(render_error)


if __name__ == "__main__":
    main()
