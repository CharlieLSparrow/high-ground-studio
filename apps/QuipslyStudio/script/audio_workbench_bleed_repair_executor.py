#!/usr/bin/env python3
"""Execute the current bleed-repair proof render only when the gate allows it.

The bleed-repair preflight owns the proposed repair command. This executor owns
the runtime decision:
- pending human listen -> write a refusal receipt, render nothing;
- failed/needs-proof human listen -> render the proof-window candidate;
- explicit proof-only override -> render, but mark it as not publication truth.

It never mutates original media, never overwrites v006, and never unlocks branch
inheritance by itself.
"""

from __future__ import annotations

import argparse
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


REPAIR_ALLOWED_STATUSES = {
    "failed-human-listen",
    "needs-focused-proof",
    "human-listen-failed",
    "rejected-human-listen",
}


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def output_path(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        path = value.get("path")
        if isinstance(path, str):
            return path
    return None


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
        return {
            "path": str(path),
            "ok": False,
            "error": proc.stderr.strip() or proc.stdout.strip(),
        }
    data = json.loads(proc.stdout)
    stream = next((item for item in data.get("streams", []) if item.get("codec_type") == "audio"), {})
    try:
        duration = float(data.get("format", {}).get("duration"))
    except (TypeError, ValueError):
        duration = None
    return {
        "path": str(path),
        "ok": True,
        "codec": stream.get("codec_name"),
        "sampleRate": stream.get("sample_rate"),
        "channels": stream.get("channels"),
        "durationSeconds": duration,
        "sizeBytes": int(data.get("format", {}).get("size") or 0),
    }


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def command_line(command: list[str]) -> str:
    return " ".join(shell_quote(part) for part in command)


def current_decision_status(manifest: dict[str, Any]) -> str:
    outputs = manifest.get("outputs") or {}
    decision_path = output_path(outputs.get("latestListenDecision"))
    if decision_path and Path(decision_path).exists():
        decision = load_json(Path(decision_path))
        return str(decision.get("decisionStatus") or decision.get("status") or "")
    return ""


def render_markdown(report: dict[str, Any]) -> str:
    preflight = report.get("preflight") or {}
    repair_action = preflight.get("repairAction") or {}
    lines = [
        f"# Bleed Repair Executor: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "This executor consumes the current locked repair preflight. It is a receipt for what was allowed or refused.",
        "",
        "## Gate",
        "",
        f"- Route status: `{report['routeStatus']}`",
        f"- Approval status: `{report['approvalStatus'] or 'unknown'}`",
        f"- Listen decision status: `{report['listenDecisionStatus'] or 'unknown'}`",
        f"- Allow unapproved proof render: `{str(report['allowUnapprovedProofRender']).lower()}`",
        f"- Safe to render: `{str(report['safeToRender']).lower()}`",
        f"- Render requested: `{str(report['renderRequested']).lower()}`",
        f"- Render attempted: `{str(report['renderAttempted']).lower()}`",
        f"- Render succeeded: `{str(report['renderSucceeded']).lower()}`",
        f"- Original media mutated: `{str(report['originalMediaMutated']).lower()}`",
        f"- Timeline preserved: `{str(report['timelinePreserved']).lower()}`",
        "",
        "## Repair target",
        "",
        f"- Warning: `{repair_action.get('warning')}`",
        f"- Window: `{repair_action.get('windowLabel')}`",
        f"- Start: `{repair_action.get('sequenceStartSeconds')}` seconds",
        f"- Duration: `{repair_action.get('durationSeconds')}` seconds",
        f"- Profile: `{(preflight.get('profile') or {}).get('profileId')}`",
        "",
        "## Render command",
        "",
        "```bash",
        command_line(report.get("renderCommand") or []),
        "```",
        "",
        "## Result",
        "",
        f"- Rendered output: `{report.get('renderedOutput') or ''}`",
        f"- Refusal reason: `{report.get('refusalReason') or ''}`",
        "",
    ]
    if report.get("probe"):
        lines.extend(["## Output probe", "", "```json", json.dumps(report["probe"], indent=2), "```", ""])
    if report.get("stderrTail"):
        lines.extend(["## ffmpeg stderr tail", "", "```", str(report["stderrTail"])[-4000:], "```", ""])
    lines.extend(["## Next safest action", "", report["nextSafestAction"], ""])
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    parser.add_argument("--render-proof", action="store_true")
    parser.add_argument("--allow-unapproved-proof-render", action="store_true")
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest = load_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    preflight_path = output_path(outputs.get("latestBleedRepairPreflight"))
    if not preflight_path or not Path(preflight_path).exists():
        raise SystemExit("Missing latestBleedRepairPreflight in manifest outputs")
    preflight = load_json(Path(preflight_path))
    command = [str(part) for part in (preflight.get("renderCommand") or [])]
    if not command:
        raise SystemExit("Bleed repair preflight has no renderCommand")

    approval_status = str(manifest.get("approvalStatus") or "")
    decision_status = current_decision_status(manifest)
    allowed_by_human_failure = approval_status in REPAIR_ALLOWED_STATUSES or decision_status in REPAIR_ALLOWED_STATUSES
    safe_to_render = bool(allowed_by_human_failure or args.allow_unapproved_proof_render)
    render_attempted = bool(args.render_proof and safe_to_render)
    route_status = (
        "proof-rendered-after-human-failure"
        if render_attempted and allowed_by_human_failure
        else "proof-rendered-with-unapproved-override"
        if render_attempted and args.allow_unapproved_proof_render
        else "ready-after-human-failure"
        if allowed_by_human_failure
        else "ready-for-unapproved-proof-render"
        if args.allow_unapproved_proof_render
        else "blocked-waiting-for-human-listen-failure"
    )
    refusal_reason = ""
    stdout_tail = ""
    stderr_tail = ""
    return_code: int | None = None
    rendered_output = ""
    probe: dict[str, Any] | None = None
    if args.render_proof and not safe_to_render:
        refusal_reason = (
            "Render refused because the current candidate has not recorded a failed "
            "or needs-focused human listen decision, and no proof-only override was supplied."
        )
    elif render_attempted:
        proc = run_capture(command)
        return_code = proc.returncode
        stdout_tail = proc.stdout[-2000:]
        stderr_tail = proc.stderr[-4000:]
        candidate_output = Path(command[-1])
        if candidate_output.exists():
            rendered_output = str(candidate_output)
            probe = ffprobe_audio(candidate_output)
        if proc.returncode != 0 and not refusal_reason:
            refusal_reason = "ffmpeg returned a non-zero exit code."

    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    baseline_id = str(manifest.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    output_json = baseline_dir / f"audio-bleed-repair-executor-{slug}-{generated_at}.json"
    output_md = baseline_dir / f"audio-bleed-repair-executor-{slug}-{generated_at}.md"
    render_succeeded = bool(render_attempted and return_code == 0 and rendered_output and (probe or {}).get("ok"))
    report = {
        "schema": "quipsly.audio-workbench.bleed-repair-executor.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "preflightPath": preflight_path,
        "preflight": {
            "generatedAt": preflight.get("generatedAt"),
            "safeToRender": bool(preflight.get("safeToRender")),
            "renderAttempted": bool(preflight.get("renderAttempted")),
            "repairAction": preflight.get("repairAction"),
            "profile": preflight.get("profile"),
        },
        "approvalStatus": approval_status,
        "listenDecisionStatus": decision_status,
        "allowUnapprovedProofRender": bool(args.allow_unapproved_proof_render),
        "safeToRender": safe_to_render,
        "renderRequested": bool(args.render_proof),
        "renderAttempted": render_attempted,
        "renderSucceeded": render_succeeded,
        "renderCommand": command,
        "renderedOutput": rendered_output,
        "returnCode": return_code,
        "stdoutTail": stdout_tail,
        "stderrTail": stderr_tail,
        "probe": probe,
        "refusalReason": refusal_reason,
        "routeStatus": route_status,
        "originalMediaMutated": False,
        "timelinePreserved": True,
        "branchInheritanceUnlocked": False,
        "publicationApproved": False,
        "nextSafestAction": (
            "Record a real failed-human-listen decision before rendering this repair, "
            "or use the explicit proof-only override only for isolated internal proof. "
            "If a proof render succeeds, compare it against the v006 proof window before "
            "promoting any full v007 baseline."
            if not render_succeeded
            else "Listen to the v007 proof-window candidate against v006. Promote only if it restores natural reactions without reintroducing distracting echo."
        ),
    }
    write_json(output_json, report)
    output_md.write_text(render_markdown(report), encoding="utf-8")

    outputs["latestBleedRepairExecutor"] = str(output_json)
    outputs["latestBleedRepairExecutorMarkdown"] = str(output_md)
    history = outputs.setdefault("bleedRepairExecutors", [])
    if str(output_json) not in history:
        history.append(str(output_json))
    manifest["bleedRepairExecutorCount"] = len(history)
    manifest["bleedRepairExecutorStatus"] = route_status
    manifest["bleedRepairExecutorRenderAttempted"] = render_attempted
    manifest["bleedRepairExecutorRenderSucceeded"] = render_succeeded
    manifest["bleedRepairExecutorOriginalMediaMutated"] = False
    manifest["bleedRepairExecutorTimelinePreserved"] = True
    manifest["bleedRepairExecutorRealRepairAllowed"] = safe_to_render
    write_json(manifest_path, manifest)

    print(f"Wrote {output_md}")
    print(f"Wrote {output_json}")
    print(f"Route status: {route_status}")
    print(f"Render attempted: {render_attempted}")
    print(f"Render succeeded: {render_succeeded}")
    if refusal_reason:
        print(f"Refusal reason: {refusal_reason}")


if __name__ == "__main__":
    main()
