#!/usr/bin/env python3
"""Plan dxRevive proof candidates from validated manual bounces.

The validator proves returned dxRevive/Logic bounces did not change duration,
sample rate, or channel count. This planner is the next gate: it turns valid
returned bounces into timestamped A/B proof-window commands against the current
v006 mastered spine, without importing them, promoting them, unlocking branch
inheritance, rendering full episodes, or touching original media.

If returned bounces are missing or invalid, the planner writes an honest waiting
or blocked report instead of pretending restoration happened.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_PROOF_WINDOWS = [1760.0, 2062.0, 4180.0, 5710.0]
DEFAULT_WINDOW_DURATION = 24.0
MIX_FILTER = "amix=inputs=3:duration=longest:normalize=0,acompressor=threshold=-21dB:ratio=1.7:attack=18:release=300,alimiter=limit=0.78,loudnorm=I=-16:TP=-1.8:LRA=11"


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
    raise FileNotFoundError(f"Could not find baseline manifest under {input_path}")


def output_path(value: Any) -> Path | None:
    if isinstance(value, str) and value:
        return Path(value)
    if isinstance(value, dict):
        for subkey in ("path", "markdownPath", "htmlPath", "jsonPath"):
            subvalue = value.get(subkey)
            if isinstance(subvalue, str) and subvalue:
                return Path(subvalue)
    return None


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in value)
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def run_capture(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, text=True, capture_output=True, check=False)


def ffprobe_audio(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"path": str(path), "ok": False, "error": "missing-file"}
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
        return {"path": str(path), "ok": False, "error": proc.stderr.strip() or proc.stdout.strip()}
    data = json.loads(proc.stdout or "{}")
    stream = next((item for item in data.get("streams", []) if item.get("codec_type") == "audio"), {})
    try:
        duration = float(data.get("format", {}).get("duration"))
    except (TypeError, ValueError):
        duration = None
    return {
        "path": str(path),
        "ok": True,
        "codec": stream.get("codec_name"),
        "sampleRate": int(stream["sample_rate"]) if str(stream.get("sample_rate") or "").isdigit() else None,
        "channels": stream.get("channels"),
        "durationSeconds": duration,
        "sizeBytes": int(data.get("format", {}).get("size") or 0),
    }


def master_path(manifest: dict[str, Any]) -> Path | None:
    outputs = manifest.get("outputs") or {}
    for key in ("masterM4a", "masterWav"):
        path = output_path(outputs.get(key))
        if path and path.exists():
            return path
    return None


def parse_time(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value or "").strip()
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        pass
    parts = text.split(":")
    try:
        if len(parts) == 3:
            return int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])
        if len(parts) == 2:
            return int(parts[0]) * 60 + float(parts[1])
    except ValueError:
        return None
    return None


def collect_proof_windows(outputs: dict[str, Any], limit: int, duration: float) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    queue_path = output_path(outputs.get("latestAudioListenPriorityQueue"))
    if queue_path and queue_path.exists():
        queue = read_json(queue_path)
        for key in ("shownQueue", "queue", "items", "listenItems", "reviewMoments"):
            items = queue.get(key)
            if not isinstance(items, list):
                continue
            for item in items:
                if not isinstance(item, dict):
                    continue
                time_value = (
                    item.get("timeSeconds")
                    or item.get("startSeconds")
                    or item.get("centerSeconds")
                    or item.get("start")
                    or item.get("time")
                )
                seconds = parse_time(time_value)
                if seconds is None:
                    continue
                label = str(item.get("label") or item.get("reason") or item.get("flag") or "listen-priority")
                candidates.append(
                    {
                        "source": str(queue_path),
                        "label": label,
                        "centerSeconds": seconds,
                        "startSeconds": max(0.0, seconds - duration / 2),
                        "durationSeconds": duration,
                    }
                )
            if candidates:
                break
    if not candidates:
        for seconds in DEFAULT_PROOF_WINDOWS:
            candidates.append(
                {
                    "source": "default-critical-listen-windows",
                    "label": "default critical listen window",
                    "centerSeconds": seconds,
                    "startSeconds": max(0.0, seconds - duration / 2),
                    "durationSeconds": duration,
                }
            )
    deduped: list[dict[str, Any]] = []
    seen: set[int] = set()
    for item in candidates:
        bucket = int(float(item["centerSeconds"]) // 3)
        if bucket in seen:
            continue
        seen.add(bucket)
        deduped.append(item)
        if len(deduped) >= limit:
            break
    return deduped


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


def candidate_snippet_command(returned_paths: list[Path], output: Path, start: float, duration: float) -> list[str]:
    cmd = ["ffmpeg", "-hide_banner", "-y"]
    for path in returned_paths:
        cmd.extend(["-ss", f"{start:.3f}", "-t", f"{duration:.3f}", "-i", str(path)])
    cmd.extend(
        [
            "-filter_complex",
            f"[0:a][1:a][2:a]{MIX_FILTER}[out]",
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
    )
    return cmd


def command_block(cmd: list[str]) -> str:
    return " ".join(shell_quote(part) for part in cmd)


def render_commands(commands: list[dict[str, Any]]) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for command in commands:
        proc = run_capture([str(part) for part in command["command"]])
        output = Path(str(command["output"]))
        ok = proc.returncode == 0 and output.exists()
        results.append(
            {
                "kind": command.get("kind"),
                "windowLabel": command.get("windowLabel"),
                "output": str(output),
                "ok": ok,
                "returnCode": proc.returncode,
                "stderrTail": proc.stderr[-3000:],
                "stdoutTail": proc.stdout[-1000:],
                "probe": ffprobe_audio(output) if output.exists() else None,
            }
        )
    return results


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# dxRevive Proof Candidate Planner",
        "",
        f"Generated: `{report['generatedAt']}`",
        f"Baseline: `{report['baselineId']}`",
        "",
        "This is the guarded bridge from manually restored dxRevive/Logic bounces into proof candidates. It never promotes returned bounces directly into the conformed baseline.",
        "",
        "## Status",
        "",
        f"- Status: `{report['status']}`",
        f"- Safe to render proof snippets: `{str(report['safeToRenderProof']).lower()}`",
        f"- Render attempted: `{str(report['renderAttempted']).lower()}`",
        f"- Render success count: `{report['renderSuccessCount']}`",
        f"- Render failure count: `{report['renderFailureCount']}`",
        f"- Validation status: `{report.get('dxReviveValidationStatus')}`",
        f"- Approval state changed: `{str(report['approvalStateChanged']).lower()}`",
        f"- Branch state changed: `{str(report['branchStateChanged']).lower()}`",
        f"- Original media mutated: `{str(report['originalMediaMutated']).lower()}`",
        "",
        "## Next action",
        "",
        report["nextAction"],
        "",
    ]
    if report.get("returnedBounces"):
        lines.extend(["## Returned bounces", "", "| Stem | Status | Path |", "|---|---:|---|"])
        for item in report["returnedBounces"]:
            lines.append(f"| `{item['key']}` | `{item['status']}` | `{item['returnedPath']}` |")
        lines.append("")
    if report.get("proofWindows"):
        lines.extend(["## Proof windows", ""])
        for index, window in enumerate(report["proofWindows"], start=1):
            lines.extend(
                [
                    f"### {index}. {window['label']}",
                    "",
                    f"- Start: `{window['startSeconds']:.3f}`",
                    f"- Duration: `{window['durationSeconds']:.3f}`",
                    f"- Source: `{window['source']}`",
                    "",
                ]
            )
    if report.get("commands"):
        lines.extend(["## Commands", ""])
        for item in report["commands"]:
            lines.extend(
                [
                    f"### `{item['kind']}` - {item['windowLabel']}",
                    "",
                    f"- Output: `{item['output']}`",
                    "",
                    "```bash",
                    command_block(item["command"]),
                    "```",
                    "",
                ]
            )
    lines.extend(
        [
            "## Guardrail",
            "",
            "A valid dxRevive proof candidate is still not an approved production baseline. Human listening must compare it against the current v006 proof windows before any new v007 promotion or branch inheritance.",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    parser.add_argument("--render-proof", action="store_true")
    parser.add_argument("--allow-proof-render", action="store_true")
    parser.add_argument("--proof-window-count", type=int, default=8)
    parser.add_argument("--window-duration", type=float, default=DEFAULT_WINDOW_DURATION)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest_before = read_json(manifest_path)
    outputs = manifest_before.setdefault("outputs", {})
    baseline_id = str(manifest_before.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")

    validation_path = output_path(outputs.get("latestDxReviveBounceValidation"))
    validation = read_json(validation_path) if validation_path and validation_path.exists() else {}
    validation_status = str(validation.get("status") or "missing-validation")
    returned_bounces = validation.get("results") if isinstance(validation.get("results"), list) else []
    valid_returned = [item for item in returned_bounces if item.get("status") == "valid"]
    returned_paths = [Path(str(item.get("returnedPath"))) for item in valid_returned]
    all_valid = validation_status == "all-returned-bounces-valid-for-candidate-testing" and len(returned_paths) >= 3
    master = master_path(manifest_before)
    proof_windows = collect_proof_windows(outputs, max(1, args.proof_window_count), args.window_duration)

    candidate_dir = baseline_dir / f"dxrevive-proof-candidate-plan-{slug}-{generated_at}"
    candidate_dir.mkdir(parents=True, exist_ok=False)
    commands: list[dict[str, Any]] = []
    safe_to_render = bool(all_valid and master and all(path.exists() for path in returned_paths[:3]))
    if safe_to_render:
        for index, window in enumerate(proof_windows, start=1):
            window_slug = f"{index:02d}-{safe_slug(str(window['label']))[:48]}"
            current_output = candidate_dir / f"{window_slug}-current-v006.m4a"
            candidate_output = candidate_dir / f"{window_slug}-dxrevive-candidate.m4a"
            commands.append(
                {
                    "kind": "current-v006-reference",
                    "windowLabel": window["label"],
                    "output": str(current_output),
                    "command": current_snippet_command(master, current_output, float(window["startSeconds"]), float(window["durationSeconds"])),
                }
            )
            commands.append(
                {
                    "kind": "dxrevive-candidate",
                    "windowLabel": window["label"],
                    "output": str(candidate_output),
                    "command": candidate_snippet_command(returned_paths[:3], candidate_output, float(window["startSeconds"]), float(window["durationSeconds"])),
                }
            )

    render_attempted = bool(args.render_proof and args.allow_proof_render and safe_to_render)
    render_results = render_commands(commands) if render_attempted else []
    render_success_count = sum(1 for item in render_results if item.get("ok"))
    render_failure_count = sum(1 for item in render_results if not item.get("ok"))

    if all_valid and not master:
        status = "blocked-missing-current-master"
        next_action = "Restore or regenerate the current v006 masterM4a/masterWav before dxRevive proof snippets can be compared."
    elif all_valid and not safe_to_render:
        status = "blocked-validated-bounces-not-readable"
        next_action = "At least one validated returned bounce path is no longer readable. Rerun validation before proof rendering."
    elif all_valid:
        status = "ready-for-dxrevive-proof-candidate"
        next_action = "Render proof snippets with --render-proof --allow-proof-render, compare against v006 by ear, then decide whether a timestamped v007 candidate is warranted."
    elif validation_status == "waiting-for-bounces":
        status = "waiting-for-validated-dxrevive-bounces"
        next_action = "Create the manual dxRevive/Logic returned bounces, run the validator, then rerun this planner."
    elif validation_status == "invalid-bounces-need-repair":
        status = "blocked-invalid-dxrevive-bounces"
        next_action = "Reject or recreate the invalid returned bounces without changing duration, sample rate, or channel count."
    else:
        status = "blocked-dxrevive-validation-not-ready"
        next_action = "Generate the manual bounce packet and validation report before planning a proof candidate."

    report = {
        "schema": "quipsly.audio-workbench.dxrevive-proof-candidate-planner.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "approvalStatus": manifest_before.get("approvalStatus"),
        "packageReadyForHumanListen": bool(manifest_before.get("packageReadyForHumanListen")),
        "branchInheritanceReady": bool(manifest_before.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest_before.get("branchRenderReady")),
        "status": status,
        "nextAction": next_action,
        "dxReviveValidation": str(validation_path) if validation_path else None,
        "dxReviveValidationStatus": validation_status,
        "expectedBounceCount": validation.get("expectedCount"),
        "validatedBounceCount": validation.get("validatedCount"),
        "missingBounceCount": validation.get("missingCount"),
        "errorCount": validation.get("errorCount"),
        "returnedBounces": returned_bounces,
        "masterPath": str(master) if master else None,
        "safeToRenderProof": safe_to_render,
        "renderAttempted": render_attempted,
        "renderResults": render_results,
        "renderSuccessCount": render_success_count,
        "renderFailureCount": render_failure_count,
        "proofWindows": proof_windows,
        "commands": commands,
        "candidateDir": str(candidate_dir),
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "originalMediaMutated": False,
        "timelinePreserved": True,
    }
    output_json = candidate_dir / "dxrevive-proof-candidate-plan.json"
    output_md = candidate_dir / "dxrevive-proof-candidate-plan.md"
    report["json"] = str(output_json)
    report["markdown"] = str(output_md)
    write_json(output_json, report)
    output_md.write_text(render_markdown(report) + "\n", encoding="utf-8")

    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    outputs["latestDxReviveProofCandidatePlanner"] = str(output_json)
    outputs["latestDxReviveProofCandidatePlannerMarkdown"] = str(output_md)
    history = outputs.setdefault("dxReviveProofCandidatePlanners", [])
    if str(output_json) not in history:
        history.append(str(output_json))
    manifest["dxReviveProofCandidatePlannerCount"] = len(history)
    manifest["dxReviveProofCandidatePlannerStatus"] = status
    manifest["dxReviveProofCandidatePlannerSafeToRenderProof"] = safe_to_render
    manifest["dxReviveProofCandidatePlannerRenderAttempted"] = render_attempted
    manifest["dxReviveProofCandidatePlannerOriginalMediaMutated"] = False
    manifest["approvalStatus"] = manifest_before.get("approvalStatus")
    manifest["branchInheritanceReady"] = bool(manifest_before.get("branchInheritanceReady"))
    manifest["branchRenderReady"] = bool(manifest_before.get("branchRenderReady"))
    write_json(manifest_path, manifest)

    print(
        json.dumps(
            {
                "baselineId": baseline_id,
                "status": status,
                "markdown": str(output_md),
                "json": str(output_json),
                "safeToRenderProof": safe_to_render,
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
