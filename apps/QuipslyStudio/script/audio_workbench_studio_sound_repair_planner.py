#!/usr/bin/env python3
"""Plan scoped audio repair actions from the Studio Sound Control Room.

This script converts machine-visible sound-control-room flags into reversible,
stage-owned repair guidance. It does not render a repair, approve audio, unlock
branch inheritance, upload, publish, or mutate original media.
"""

from __future__ import annotations

import argparse
import html
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


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


def output_path(value: Any) -> str | None:
    if isinstance(value, str) and value:
        return value
    if isinstance(value, dict):
        for key in ("path", "jsonPath", "markdownPath", "htmlPath", "openCommand"):
            subvalue = value.get(key)
            if isinstance(subvalue, str) and subvalue:
                return subvalue
    return None


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def seconds_label(value: float) -> str:
    total = int(round(max(0.0, float(value))))
    hours, remainder = divmod(total, 3600)
    minutes, seconds = divmod(remainder, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{seconds:02d}"
    return f"{minutes}:{seconds:02d}"


def load_control_room(manifest: dict[str, Any], baseline_dir: Path) -> tuple[Path, dict[str, Any]]:
    outputs = manifest.get("outputs") or {}
    path_text = output_path(outputs.get("latestAudioStudioSoundControlRoom")) or str(baseline_dir / "STUDIO_SOUND_CONTROL_ROOM.json")
    path = Path(path_text)
    if not path.exists():
        raise FileNotFoundError(f"Studio Sound Control Room report not found: {path}")
    return path, read_json(path)


def classify_action(window: dict[str, Any]) -> dict[str, Any] | None:
    metrics = window.get("metrics") or {}
    flags = [str(flag) for flag in metrics.get("riskFlags") or []]
    if not flags:
        return None
    start = float(window.get("startSeconds") or 0.0)
    end = float(window.get("endSeconds") or start)
    timecode = window.get("timecode") or f"{seconds_label(start)} - {seconds_label(end)}"
    label = str(window.get("label") or f"Window {window.get('index')}")
    reason = str(window.get("reason") or "machine-visible studio sound flag")

    if ("very-quiet" in flags or "mostly-quiet" in flags) and start <= 90.0:
        stage = "edit-intro-boundary"
        action_type = "intro-quiet-trim-or-fade-review"
        severity = "review-before-repair"
        owner = "episode edit branch after audio approval"
        first_move = "Listen to the opening minute. If this is dead air or pre-roll, solve it as an edit trim/fade, not by making the entire master louder."
        proof_needed = [
            "Confirm whether speech/content begins after the quiet stretch.",
            "If intentional atmosphere, keep it; if not, trim or fade in the edit branch after v006 audio is approved.",
        ]
        treatment = [
            "Do not rerun the whole mastering chain for opening silence.",
            "Create an edit-branch boundary note for the opening trim/fade candidate.",
            "If a future audio v007 is created, preserve sync length unless a new explicit sync/conform baseline is created.",
        ]
    elif "near-peak" in flags:
        stage = "master-limiter-gain-staging"
        action_type = "peak-headroom-proof-window"
        severity = "technical-repair-candidate"
        owner = "mastering limiter stage"
        first_move = "Render proof-window variants with slightly lower ceiling or gentler input gain before changing full-length v006."
        proof_needed = ["Compare current v006 against a conservative limiter variant around the flagged peak."]
        treatment = ["Lower limiter ceiling/input only for proof-window variants first.", "Reject repair if loudness loses natural speech energy."]
    elif "left-right-imbalance" in flags:
        stage = "source-balance-or-channel-layout"
        action_type = "channel-balance-proof-window"
        severity = "technical-repair-candidate"
        owner = "source balance stage"
        first_move = "Compare source contribution and channel balance evidence before changing stereo layout."
        proof_needed = ["Check whether imbalance is intentional panning, a bad stereo source, or a mastering artifact."]
        treatment = ["Try channel-balance proof variants only around the flagged window.", "Do not collapse to mono unless proof listening prefers it."]
    elif "very-dense" in flags:
        stage = "compression-dynamics"
        action_type = "density-compression-proof-window"
        severity = "taste-repair-candidate"
        owner = "dynamics/mastering stage"
        first_move = "Listen for fatigue or pumping before assuming density is bad."
        proof_needed = ["Compare less-compressed proof variant for natural cadence."]
        treatment = ["Relax compression/leveler in a proof-window variant.", "Keep if it feels energetic without fatigue."]
    elif "very-quiet" in flags or "mostly-quiet" in flags:
        stage = "content-silence-or-gate-review"
        action_type = "quiet-window-content-review"
        severity = "proof-needed"
        owner = "source-aware cleanup or edit branch"
        first_move = "Listen to decide whether the quiet region is intentional silence, muted source, over-gating, or an edit gap."
        proof_needed = ["Compare raw/source-aware/current snippets before deciding repair versus edit skip."]
        treatment = ["If over-gated speech is missing, route to source-aware cleanup proof-window repair.", "If intentional gap, route to edit branch skip/trim instead."]
    else:
        stage = "studio-sound-human-review"
        action_type = "focused-listen-required"
        severity = "proof-needed"
        owner = "human listen"
        first_move = "Listen to the flagged window and classify the symptom before selecting a repair stage."
        proof_needed = ["Record pass, proof-needed, or repair notes from the Studio Sound Control Room."]
        treatment = ["Do not route an unknown machine flag directly into full-length repair."]

    return {
        "windowIndex": window.get("index"),
        "label": label,
        "source": window.get("source"),
        "timecode": timecode,
        "startSeconds": round(start, 3),
        "endSeconds": round(end, 3),
        "reason": reason,
        "flags": flags,
        "metrics": metrics,
        "stageOwner": stage,
        "humanOwner": owner,
        "actionType": action_type,
        "severity": severity,
        "firstMove": first_move,
        "proofNeeded": proof_needed,
        "safeTreatmentPath": treatment,
        "doNotDo": [
            "Do not overwrite v006.",
            "Do not mutate original media.",
            "Do not unlock branch inheritance from machine flags alone.",
            "Do not render a full-length v007 before proof-window comparison or explicit human-listen failure.",
        ],
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Studio Sound Repair Planner",
        "",
        f"Generated: `{report['generatedAt']}`",
        f"Baseline: `{report['baselineId']}`",
        "",
        "This planner converts Studio Sound Control Room flags into scoped, stage-owned next actions. It does not approve audio, unlock branches, render repairs, upload, publish, or mutate source media.",
        "",
        "## Summary",
        "",
        f"- Status: `{report['status']}`",
        f"- Control-room windows: `{report['controlRoomWindowCount']}`",
        f"- Machine-flagged windows: `{report['machineFlaggedWindowCount']}`",
        f"- Planned actions: `{report['actionCount']}`",
        f"- Proof-window actions: `{report['proofWindowActionCount']}`",
        f"- Edit-boundary actions: `{report['editBoundaryActionCount']}`",
        f"- Approval state changed: `{str(report['approvalStateChanged']).lower()}`",
        f"- Branch state changed: `{str(report['branchStateChanged']).lower()}`",
        f"- Render attempted: `{str(report['renderAttempted']).lower()}`",
        f"- Upload attempted: `{str(report['uploadAttempted']).lower()}`",
        f"- Publication attempted: `{str(report['publicationAttempted']).lower()}`",
        f"- Original media mutated: `{str(report['originalMediaMutated']).lower()}`",
        "",
        "## Planned actions",
        "",
    ]
    if not report["actions"]:
        lines.append("No machine-flagged repair actions. Human listen is still required before approval.")
    for action in report["actions"]:
        lines.extend(
            [
                f"### {action['timecode']} - {action['actionType']}",
                "",
                f"- Window: `{action['label']}`",
                f"- Flags: `{', '.join(action['flags'])}`",
                f"- Stage owner: `{action['stageOwner']}`",
                f"- Human owner: `{action['humanOwner']}`",
                f"- First move: {action['firstMove']}",
                "- Proof needed:",
            ]
        )
        for item in action["proofNeeded"]:
            lines.append(f"  - {item}")
        lines.append("- Safe treatment path:")
        for item in action["safeTreatmentPath"]:
            lines.append(f"  - {item}")
        lines.append("")
    lines.extend(
        [
            "## Guardrail",
            "",
            "Machine flags are triage evidence. They are not human approval and not permission to rerender full-length audio. Use this planner to decide whether the next move belongs to edit boundaries, source-aware cleanup, restoration, balance, dynamics, or no repair at all.",
            "",
        ]
    )
    return "\n".join(lines)


def render_html(report: dict[str, Any]) -> str:
    cards = []
    for action in report["actions"]:
        metrics = action.get("metrics") or {}
        cards.append(
            f"""
            <section class="card">
              <p class="eyebrow">{html.escape(action['timecode'])} · {html.escape(action['severity'])}</p>
              <h2>{html.escape(action['actionType'])}</h2>
              <p>{html.escape(action['firstMove'])}</p>
              <div class="chips">
                <span>{html.escape(action['stageOwner'])}</span>
                <span>{html.escape(', '.join(action['flags']))}</span>
                <span>RMS {metrics.get('rmsDbfs')} dBFS</span>
                <span>Peak {metrics.get('peakDbfs')} dBFS</span>
              </div>
              <h3>Proof needed</h3>
              <ul>{''.join(f'<li>{html.escape(item)}</li>' for item in action['proofNeeded'])}</ul>
              <h3>Safe treatment path</h3>
              <ul>{''.join(f'<li>{html.escape(item)}</li>' for item in action['safeTreatmentPath'])}</ul>
            </section>
            """
        )
    empty = "<section class='card'><h2>No machine repair actions</h2><p>Human listen is still required, but the current control-room metrics did not produce a machine-owned repair action.</p></section>" if not cards else ""
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Studio Sound Repair Planner</title>
<style>
:root {{ color-scheme: dark; --moss:#17251b; --soil:#261c14; --honey:#d9bb50; --sage:#78a979; --clay:#c36d43; --ink:#f7efd9; }}
body {{ margin:0; background:radial-gradient(circle at 20% 0%, #29432f, #101711 48%, #070a08); color:var(--ink); font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }}
main {{ max-width:1080px; margin:0 auto; padding:36px 24px 70px; }}
.hero,.card {{ border:1px solid rgba(217,187,80,.28); border-radius:28px; background:linear-gradient(135deg, rgba(38,28,20,.88), rgba(23,37,27,.82)); box-shadow:0 20px 70px rgba(0,0,0,.32); }}
.hero {{ padding:28px; }}
h1 {{ margin:.1em 0; font-size:38px; letter-spacing:-.035em; }}
.eyebrow {{ color:var(--honey); text-transform:uppercase; letter-spacing:.16em; font-weight:800; font-size:12px; }}
.summary {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:12px; margin-top:20px; }}
.stat {{ padding:14px; border-radius:18px; background:rgba(255,255,255,.07); }}
.stat b {{ display:block; color:var(--honey); font-size:24px; }}
.card {{ margin-top:18px; padding:22px; }}
h2 {{ margin:.2em 0; }}
.chips {{ display:flex; flex-wrap:wrap; gap:8px; margin:14px 0; }}
.chips span {{ padding:7px 10px; border-radius:999px; background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.08); }}
li {{ margin:.35em 0; color:rgba(247,239,217,.82); }}
</style>
</head>
<body>
<main>
<section class="hero">
<p class="eyebrow">QUIPSLY AUDIO WORKBENCH</p>
<h1>Studio Sound Repair Planner</h1>
<p>Machine-visible audio symptoms become scoped next actions. No approval, no branch unlock, no full repair render until human listening confirms the move.</p>
<div class="summary">
<div class="stat"><b>{report['actionCount']}</b> actions</div>
<div class="stat"><b>{report['machineFlaggedWindowCount']}</b> flagged windows</div>
<div class="stat"><b>{report['proofWindowActionCount']}</b> proof-window</div>
<div class="stat"><b>{report['editBoundaryActionCount']}</b> edit-boundary</div>
</div>
</section>
{empty}{''.join(cards)}
</main>
</body>
</html>"""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest_before = read_json(manifest_path)
    baseline_id = str(manifest_before.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    control_room_path, control_room = load_control_room(manifest_before, baseline_dir)

    actions = [action for action in (classify_action(window) for window in control_room.get("windows") or []) if action]
    proof_actions = [action for action in actions if "proof" in action["actionType"]]
    edit_actions = [action for action in actions if "intro" in action["actionType"] or action["stageOwner"] == "edit-intro-boundary"]
    status = "ready-for-scoped-sound-repair-triage" if actions else "no-machine-repair-actions-human-listen-still-required"

    stable_json = baseline_dir / "STUDIO_SOUND_REPAIR_PLANNER.json"
    stable_md = baseline_dir / "STUDIO_SOUND_REPAIR_PLANNER.md"
    stable_html = baseline_dir / "STUDIO_SOUND_REPAIR_PLANNER.html"
    stable_open = baseline_dir / "OPEN_STUDIO_SOUND_REPAIR_PLANNER.command"
    version_dir = baseline_dir / f"studio-sound-repair-planner-{slug}-{generated_at}"
    version_dir.mkdir(parents=True, exist_ok=True)
    version_json = version_dir / "studio-sound-repair-planner.json"
    version_md = version_dir / "studio-sound-repair-planner.md"
    version_html = version_dir / "studio-sound-repair-planner.html"
    version_open = version_dir / "open-studio-sound-repair-planner.command"

    report = {
        "schema": "quipsly.audio-workbench.studio-sound-repair-planner.v1",
        "generatedAt": generated_at,
        "baselineId": baseline_id,
        "baselineDir": str(baseline_dir),
        "status": status,
        "approvalStatus": manifest_before.get("approvalStatus"),
        "packageReadyForHumanListen": bool(manifest_before.get("packageReadyForHumanListen")),
        "branchInheritanceReady": bool(manifest_before.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest_before.get("branchRenderReady")),
        "sourceControlRoom": str(control_room_path),
        "controlRoomStatus": control_room.get("status"),
        "controlRoomWindowCount": int(control_room.get("windowCount") or len(control_room.get("windows") or [])),
        "machineFlaggedWindowCount": int(control_room.get("riskWindowCount") or len(actions)),
        "actionCount": len(actions),
        "proofWindowActionCount": len(proof_actions),
        "editBoundaryActionCount": len(edit_actions),
        "actions": actions,
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "branchRenderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
        "path": str(stable_json),
        "markdownPath": str(stable_md),
        "htmlPath": str(stable_html),
        "openCommand": str(stable_open),
        "versionedPath": str(version_json),
        "versionedMarkdownPath": str(version_md),
        "versionedHtmlPath": str(version_html),
        "versionedOpenCommand": str(version_open),
    }
    markdown = render_markdown(report)
    page = render_html(report)
    for path in (stable_json, version_json):
        write_json(path, report)
    for path in (stable_md, version_md):
        path.write_text(markdown, encoding="utf-8")
    for path in (stable_html, version_html):
        path.write_text(page, encoding="utf-8")
    command = "#!/bin/zsh\nset -euo pipefail\nopen " + shell_quote(str(stable_html)) + "\n"
    for path in (stable_open, version_open):
        path.write_text(command, encoding="utf-8")
        path.chmod(0o755)

    manifest_after = read_json(manifest_path)
    outputs = manifest_after.setdefault("outputs", {})
    outputs["latestAudioStudioSoundRepairPlanner"] = str(stable_json)
    outputs["latestAudioStudioSoundRepairPlannerMarkdown"] = str(stable_md)
    outputs["latestAudioStudioSoundRepairPlannerHtml"] = str(stable_html)
    outputs["latestAudioStudioSoundRepairPlannerOpenCommand"] = str(stable_open)
    history = outputs.setdefault("audioStudioSoundRepairPlanners", [])
    if isinstance(history, list):
        history.append(str(version_json))
    manifest_after["audioStudioSoundRepairPlannerCount"] = int(manifest_after.get("audioStudioSoundRepairPlannerCount") or 0) + 1
    manifest_after["audioStudioSoundRepairPlannerLatestStatus"] = status
    manifest_after["audioStudioSoundRepairPlannerActionCount"] = len(actions)
    manifest_after["audioStudioSoundRepairPlannerProofWindowActionCount"] = len(proof_actions)
    manifest_after["audioStudioSoundRepairPlannerEditBoundaryActionCount"] = len(edit_actions)
    manifest_after["audioStudioSoundRepairPlannerApprovalStateChanged"] = False
    manifest_after["audioStudioSoundRepairPlannerBranchStateChanged"] = False
    manifest_after["audioStudioSoundRepairPlannerRenderAttempted"] = False
    manifest_after["audioStudioSoundRepairPlannerBranchRenderAttempted"] = False
    manifest_after["audioStudioSoundRepairPlannerUploadAttempted"] = False
    manifest_after["audioStudioSoundRepairPlannerPublicationAttempted"] = False
    manifest_after["audioStudioSoundRepairPlannerOriginalMediaMutated"] = False
    write_json(manifest_path, manifest_after)
    print(json.dumps({"json": str(stable_json), "markdown": str(stable_md), "html": str(stable_html), "status": status, "actionCount": len(actions), "proofWindowActionCount": len(proof_actions), "editBoundaryActionCount": len(edit_actions)}, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
