#!/usr/bin/env python3
"""Prepare guarded source-balance proof-window repair renders.

This turns the source-balance repair workorder into exact proof-window commands:
- a current-v006 reference snippet from the mastered spine;
- one or more candidate snippets from derived aligned/contribution stems.

By default it writes the preflight only. It does not render, approve, fail,
unlock branch inheritance, upload files, or mutate source media. Rendering is
allowed only after a failed human listen, or with an explicit proof-only
override for sandbox comparison.
"""

from __future__ import annotations

import argparse
import json
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class Profile:
    id: str
    label: str
    intent: str
    stem_mode: str
    charlie_filter: str
    homer_filter: str
    reference_filter: str
    bus_filter: str


PROFILES = {
    "charlie_homer_overlap_present": [
        Profile(
            id="overlap-natural-release",
            label="Natural overlap release",
            intent="Preserve laughter/reactions and double-talk without letting Charlie phone-call bleed smear Homer.",
            stem_mode="aligned",
            charlie_filter="aresample=48000,highpass=f=68,lowpass=f=16500,afftdn=nf=-24,agate=threshold=0.0055:ratio=2.8:attack=8:release=820:makeup=1,volume=0.41",
            homer_filter="aresample=48000,highpass=f=80,lowpass=f=16000,afftdn=nf=-20,agate=threshold=0.0023:ratio=1.55:attack=10:release=1120:makeup=1,volume=1.55",
            reference_filter="aresample=48000,highpass=f=45,lowpass=f=18000,volume=0.50",
            bus_filter="acompressor=threshold=-21dB:ratio=1.7:attack=18:release=300,alimiter=limit=0.78,loudnorm=I=-16:TP=-1.8:LRA=11",
        )
    ],
    "master_loud_with_aligned_source_but_no_contribution": [
        Profile(
            id="threshold-recovery-conservative",
            label="Conservative contribution recovery",
            intent="Recover useful speech/reaction that may have been missed by contribution thresholds without globally boosting bleed.",
            stem_mode="aligned",
            charlie_filter="aresample=48000,highpass=f=68,lowpass=f=16500,afftdn=nf=-25,agate=threshold=0.0058:ratio=3.0:attack=10:release=760:makeup=1,volume=0.40",
            homer_filter="aresample=48000,highpass=f=80,lowpass=f=16000,afftdn=nf=-21,agate=threshold=0.0022:ratio=1.55:attack=10:release=1080:makeup=1,volume=1.58",
            reference_filter="aresample=48000,highpass=f=45,lowpass=f=18000,volume=0.48",
            bus_filter="acompressor=threshold=-21dB:ratio=1.65:attack=18:release=300,alimiter=limit=0.78,loudnorm=I=-16:TP=-1.8:LRA=11",
        )
    ],
    "master_loud_without_registered_source": [
        Profile(
            id="contribution-only-noise-check",
            label="Contribution-only noise check",
            intent="Use only contribution-controlled stems to test whether suspicious master energy is bleed/noise that should disappear.",
            stem_mode="contribution",
            charlie_filter="aresample=48000,highpass=f=68,lowpass=f=16500,afftdn=nf=-24,volume=0.42",
            homer_filter="aresample=48000,highpass=f=80,lowpass=f=16000,afftdn=nf=-20,volume=1.58",
            reference_filter="aresample=48000,highpass=f=45,lowpass=f=18000,volume=0.48",
            bus_filter="acompressor=threshold=-21dB:ratio=1.7:attack=18:release=300,alimiter=limit=0.78,loudnorm=I=-16:TP=-1.8:LRA=11",
        )
    ],
}


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def resolve_baseline_dir(input_path: Path) -> Path:
    if (input_path / "manifest.json").exists():
        return input_path.expanduser().resolve()
    nested = input_path / "work" / "conformed-production-baseline"
    if (nested / "manifest.json").exists():
        return nested.expanduser().resolve()
    raise FileNotFoundError(
        "Could not find manifest.json at "
        f"{input_path}/manifest.json or {nested}/manifest.json"
    )


def output_path(value: Any) -> str | None:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        path = value.get("path")
        if isinstance(path, str):
            return path
    return None


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def parse_timecode(value: Any) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value or "").strip()
    if not text or text == "unknown":
        return 0.0
    parts = text.split(":")
    try:
        if len(parts) == 3:
            return int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])
        if len(parts) == 2:
            return int(parts[0]) * 60 + float(parts[1])
        return float(text)
    except ValueError:
        return 0.0


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


def master_path(manifest: dict[str, Any]) -> Path:
    outputs = manifest.get("outputs") or {}
    for key in ["masterM4a", "masterWav"]:
        path = output_path(outputs.get(key))
        if path and Path(path).exists():
            return Path(path)
    raise FileNotFoundError("No masterM4a/masterWav path exists in manifest outputs")


def stem_paths(manifest: dict[str, Any]) -> dict[str, Path]:
    outputs = manifest.get("outputs") or {}
    automation_path = output_path(outputs.get("speakerGapAutomation"))
    if not automation_path or not Path(automation_path).exists():
        raise FileNotFoundError("Missing speakerGapAutomation evidence")
    automation = read_json(Path(automation_path))
    stems = automation.get("stems") or {}
    required = {
        "charlieAligned": "charlieAligned",
        "homerAligned": "homerDjiAligned",
        "referenceAligned": "referenceAligned",
        "charlieContribution": "charlieContribution",
        "homerContribution": "homerContribution",
        "referenceContribution": "referenceContribution",
    }
    paths: dict[str, Path] = {}
    for out_key, stem_key in required.items():
        stem = stems.get(stem_key) or {}
        path = stem.get("path")
        if not path or not Path(path).exists():
            raise FileNotFoundError(f"Missing required stem path: {stem_key}")
        paths[out_key] = Path(path)
    return paths


def current_snippet_command(master: Path, output: Path, start: float, duration: float) -> list[str]:
    return [
        "ffmpeg",
        "-hide_banner",
        "-y",
        "-ss",
        f"{start:.3f}",
        "-t",
        f"{duration:.3f}",
        "-i",
        str(master),
        "-vn",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        str(output),
    ]


def candidate_command(paths: dict[str, Path], profile: Profile, output: Path, start: float, duration: float) -> list[str]:
    if profile.stem_mode == "contribution":
        charlie = paths["charlieContribution"]
        homer = paths["homerContribution"]
        reference = paths["referenceContribution"]
    else:
        charlie = paths["charlieAligned"]
        homer = paths["homerAligned"]
        reference = paths["referenceAligned"]
    filter_complex = (
        f"[0:a]{profile.charlie_filter}[c];"
        f"[1:a]{profile.homer_filter}[h];"
        f"[2:a]{profile.reference_filter}[r];"
        "[c][h][r]amix=inputs=3:duration=longest:normalize=0,"
        f"{profile.bus_filter}[out]"
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
        str(charlie),
        "-ss",
        f"{start:.3f}",
        "-t",
        f"{duration:.3f}",
        "-i",
        str(homer),
        "-ss",
        f"{start:.3f}",
        "-t",
        f"{duration:.3f}",
        "-i",
        str(reference),
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
        str(output),
    ]


def build_plan(
    *,
    workorder: dict[str, Any],
    manifest: dict[str, Any],
    output_dir: Path,
    window_duration: float,
) -> list[dict[str, Any]]:
    stems = stem_paths(manifest)
    master = master_path(manifest)
    plans: list[dict[str, Any]] = []
    for action in workorder.get("repairActions") or []:
        flag = str(action.get("flag") or "source-balance-warning")
        examples = action.get("exampleWindows") or []
        if not examples:
            examples = [{"time": "00:00:00", "flags": [flag]}]
        example = examples[0]
        start = max(0.0, parse_timecode(example.get("time")) - 4.0)
        duration = max(8.0, min(window_duration, window_duration))
        action_dir = output_dir / safe_slug(flag)
        action_dir.mkdir(parents=True, exist_ok=True)
        current_output = action_dir / f"{safe_slug(flag)}-current-v006.m4a"
        command_entries = [
            {
                "kind": "current-v006-reference",
                "profileId": "current-v006",
                "label": "Current v006 reference",
                "output": str(current_output),
                "command": current_snippet_command(master, current_output, start, duration),
            }
        ]
        for profile in PROFILES.get(flag, []):
            candidate_output = action_dir / f"{safe_slug(flag)}-{profile.id}.m4a"
            command_entries.append(
                {
                    "kind": "candidate-proof",
                    "profileId": profile.id,
                    "label": profile.label,
                    "intent": profile.intent,
                    "stemMode": profile.stem_mode,
                    "output": str(candidate_output),
                    "command": candidate_command(stems, profile, candidate_output, start, duration),
                }
            )
        plans.append(
            {
                "flag": flag,
                "fullAuditCount": action.get("fullAuditCount"),
                "focusRowCount": action.get("focusRowCount"),
                "startSeconds": start,
                "durationSeconds": duration,
                "sourceExample": example,
                "symptomToConfirm": action.get("symptomToConfirm"),
                "commands": command_entries,
                "safeUsage": [
                    "Listen to current-v006 first.",
                    "Render candidates only for proof-window comparison.",
                    "Promote nothing from this preflight without human listen notes.",
                    "If candidate sounds better, render a timestamped full v007 only after focused proof passes.",
                ],
            }
        )
    return plans


def command_block(command: list[str]) -> str:
    return " ".join(shell_quote(part) for part in command)


def render_markdown(payload: dict[str, Any]) -> str:
    lines = [
        f"# Source-Balance Repair Preflight: {payload['baselineId']}",
        "",
        f"Generated: `{payload['generatedAt']}`",
        "",
        "This preflight prepares exact proof-window commands for source-balance repair candidates. It does not approve audio, fail audio, unlock branch inheritance, render by default, upload files, or mutate source media.",
        "",
        "## Gate",
        "",
        f"- Approval status: `{payload['approvalStatus']}`",
        f"- Safe to render now: `{str(payload['safeToRender']).lower()}`",
        f"- Render attempted: `{str(payload['renderAttempted']).lower()}`",
        f"- Render success count: `{payload['renderSuccessCount']}`",
        f"- Render failure count: `{payload['renderFailureCount']}`",
        "",
        "## Proof-window plans",
        "",
    ]
    for index, plan in enumerate(payload["plans"], start=1):
        lines.extend(
            [
                f"### {index}. `{plan['flag']}`",
                "",
                f"- Start: `{plan['startSeconds']:.3f}` seconds",
                f"- Duration: `{plan['durationSeconds']:.3f}` seconds",
                f"- Symptom to confirm: {plan.get('symptomToConfirm')}",
                f"- Source example: `{plan.get('sourceExample')}`",
                "",
            ]
        )
        for command in plan["commands"]:
            lines.extend(
                [
                    f"#### {command['label']}",
                    "",
                    f"- Kind: `{command['kind']}`",
                    f"- Output: `{command['output']}`",
                    "",
                    "```bash",
                    command_block(command["command"]),
                    "```",
                    "",
                ]
            )
    lines.extend(
        [
            "## Guardrails",
            "",
            f"- Approval state changed: `{str(payload['approvalStateChanged']).lower()}`",
            f"- Branch state changed: `{str(payload['branchStateChanged']).lower()}`",
            f"- Original media mutated: `{str(payload['originalMediaMutated']).lower()}`",
            "",
        ]
    )
    return "\n".join(lines)


def render_commands(plans: list[dict[str, Any]]) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for plan in plans:
        for command in plan.get("commands") or []:
            proc = run_capture(command["command"])
            output = Path(command["output"])
            results.append(
                {
                    "flag": plan.get("flag"),
                    "profileId": command.get("profileId"),
                    "kind": command.get("kind"),
                    "output": str(output),
                    "ok": proc.returncode == 0 and output.exists(),
                    "returnCode": proc.returncode,
                    "stderrTail": proc.stderr[-3000:],
                    "stdoutTail": proc.stdout[-1000:],
                    "probe": ffprobe_audio(output) if output.exists() else None,
                }
            )
    return results


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    parser.add_argument("--render-proof", action="store_true")
    parser.add_argument("--allow-unapproved-proof-render", action="store_true")
    parser.add_argument("--window-duration", type=float, default=24.0)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    baseline_id = str(manifest.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")

    workorder_path = output_path(outputs.get("latestAudioSourceBalanceRepairWorkorder"))
    if not workorder_path or not Path(workorder_path).exists():
        raise FileNotFoundError("Missing latestAudioSourceBalanceRepairWorkorder")
    workorder = read_json(Path(workorder_path))

    output_dir = baseline_dir / f"source-balance-repair-preflight-{slug}-{generated_at}"
    output_dir.mkdir(parents=True, exist_ok=False)
    plans = build_plan(
        workorder=workorder,
        manifest=manifest,
        output_dir=output_dir,
        window_duration=args.window_duration,
    )

    safe_to_render = manifest.get("approvalStatus") == "failed-human-listen" or args.allow_unapproved_proof_render
    render_attempted = bool(args.render_proof and safe_to_render)
    render_results = render_commands(plans) if render_attempted else []
    render_success_count = sum(1 for item in render_results if item.get("ok"))
    render_failure_count = sum(1 for item in render_results if not item.get("ok"))
    render_refused_reason = ""
    if args.render_proof and not safe_to_render:
        render_refused_reason = "Render refused: human listen has not failed and no proof-only override was supplied."

    output_json = output_dir / "source-balance-repair-preflight.json"
    output_md = output_dir / "source-balance-repair-preflight.md"
    payload = {
        "schema": "quipsly.audio-workbench.source-balance-repair-preflight.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "approvalStatus": manifest.get("approvalStatus"),
        "packageReadyForHumanListen": bool(manifest.get("packageReadyForHumanListen")),
        "branchInheritanceReady": bool(manifest.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest.get("branchRenderReady")),
        "sourceWorkorder": workorder_path,
        "safeToRender": safe_to_render,
        "renderAttempted": render_attempted,
        "renderRefusedReason": render_refused_reason,
        "renderResults": render_results,
        "renderSuccessCount": render_success_count,
        "renderFailureCount": render_failure_count,
        "plans": plans,
        "markdown": str(output_md),
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "originalMediaMutated": False,
        "timelinePreserved": True,
    }
    write_json(output_json, payload)
    output_md.write_text(render_markdown(payload), encoding="utf-8")

    outputs["latestAudioSourceBalanceRepairPreflight"] = str(output_json)
    outputs["latestAudioSourceBalanceRepairPreflightMarkdown"] = str(output_md)
    history = outputs.setdefault("audioSourceBalanceRepairPreflights", [])
    if str(output_json) not in history:
        history.append(str(output_json))
    manifest["audioSourceBalanceRepairPreflightCount"] = len(history)
    manifest["audioSourceBalanceRepairPreflightPlanCount"] = len(plans)
    manifest["audioSourceBalanceRepairPreflightSafeToRender"] = bool(safe_to_render)
    manifest["audioSourceBalanceRepairPreflightRenderAttempted"] = bool(render_attempted)
    write_json(manifest_path, manifest)

    print(
        json.dumps(
            {
                "baselineId": baseline_id,
                "markdown": str(output_md),
                "json": str(output_json),
                "planCount": len(plans),
                "safeToRender": safe_to_render,
                "renderAttempted": render_attempted,
                "renderSuccessCount": render_success_count,
                "renderFailureCount": render_failure_count,
                "approvalStateChanged": False,
                "branchStateChanged": False,
                "originalMediaMutated": False,
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
