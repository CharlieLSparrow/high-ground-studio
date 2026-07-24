#!/usr/bin/env python3
"""Refresh the safe local Quipsly OS runway artifacts.

This intentionally prepares review boards, packets, calendars, command sheets,
and validation reports only. It does not publish, upload, delete, schedule, or
mutate source media. A failed lane is recorded and the refresh continues so a
single missing-media problem does not stop the whole production runway.
"""

from __future__ import annotations

import json
import os
import subprocess
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Sequence


ROOT = Path(__file__).resolve().parents[1]
AGENTCTL = ROOT / "script" / "agentctl.sh"
EXTERNAL_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS")
OUTPUT_ROOT = (
    EXTERNAL_ROOT / "RefreshRuns"
    if EXTERNAL_ROOT.exists()
    else Path("/tmp/quipslystudio-os-refresh")
)
LATEST_POINTER = EXTERNAL_ROOT / "latest-quipsly-os-refresh.json"
SOFT_BLOCKER_COMMANDS = {"release-package-validation"}


@dataclass
class RefreshStep:
    lane: str
    label: str
    command: list[str]
    status: str
    returncode: int
    stdoutTail: str
    stderrTail: str


def timestamp() -> str:
    return datetime.now().strftime("%Y%m%d-%H%M%S-%f")


def tail(text: str, limit: int = 2400) -> str:
    text = text.strip()
    if len(text) <= limit:
        return text
    return text[-limit:]


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def classify_step_status(args: Sequence[str], returncode: int, stdout: str) -> str:
    if returncode == 0:
        return "passed"
    if args and args[0] in SOFT_BLOCKER_COMMANDS:
        try:
            payload = json.loads(stdout)
        except Exception:
            payload = {}
        if isinstance(payload, dict) and payload.get("ok") is False and payload.get("jsonPath"):
            return "reported-blockers"
    return "failed"


def run_step(lane: str, label: str, args: Sequence[str], timeout_seconds: int = 240) -> RefreshStep:
    command = [str(AGENTCTL), *args]
    env = os.environ.copy()
    if args and args[0] == "quipsly-os-validation":
        env["QUIPSLY_OS_REFRESH_IN_PROGRESS"] = "1"
    try:
        completed = subprocess.run(
            command,
            cwd=ROOT,
            env=env,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout_seconds,
            check=False,
        )
        step_status = classify_step_status(args, completed.returncode, completed.stdout)
        return RefreshStep(
            lane=lane,
            label=label,
            command=command,
            status=step_status,
            returncode=completed.returncode,
            stdoutTail=tail(completed.stdout),
            stderrTail=tail(completed.stderr),
        )
    except subprocess.TimeoutExpired as exc:
        return RefreshStep(
            lane=lane,
            label=label,
            command=command,
            status="timeout",
            returncode=124,
            stdoutTail=tail(exc.stdout or ""),
            stderrTail=tail(exc.stderr or f"Timed out after {timeout_seconds}s"),
        )


def refresh_plan() -> list[tuple[str, str, list[str]]]:
    return [
        ("studio", "Release review board", ["release-review-board"]),
        ("studio", "Release platform prep", ["release-platform-prep"]),
        ("studio", "Release package validation", ["release-package-validation"]),
        ("studio", "Studio package blocker triage", ["studio-package-blocker-triage"]),
        ("studio", "Release human review ledger", ["release-human-review-ledger"]),
        ("studio", "Release review blockers", ["release-review-blockers"]),
        ("studio", "Studio duration decision sheet", ["studio-duration-decision-sheet"]),
        ("studio", "Studio duration experiment matrix", ["studio-duration-experiment-matrix"]),
        ("studio", "Studio duration version work orders", ["studio-duration-version-workorders"]),
        ("studio", "Studio duration edit recipe skeletons", ["studio-duration-edit-recipe-skeletons"]),
        ("studio", "Studio transcript source work orders", ["studio-transcript-source-workorders"]),
        ("studio", "Studio transcript execution readiness", ["studio-transcript-execution-readiness"]),
        ("studio", "Studio transcript pilot", ["studio-transcript-pilot"]),
        ("studio", "Studio transcript review workbench", ["studio-transcript-review-workbench"]),
        ("studio", "Studio transcript review decision ledger", ["studio-transcript-review-decision-ledger"]),
        ("studio", "Studio duration repair work orders", ["studio-duration-repair-workorders"]),
        ("studio", "Studio duration candidate decision rehearsal", ["studio-duration-candidate-decision-rehearsal"]),
        ("studio", "Studio top review companion", ["studio-top-review-companion"]),
        ("studio", "Studio review work session", ["studio-review-work-session"]),
        ("studio", "Studio next review card", ["studio-next-review-card"]),
        ("studio", "Studio watch/listen review room", ["studio-watch-listen-review-room"]),
        ("studio", "Studio review decision ledger", ["studio-review-decision-ledger"]),
        ("studio", "Studio review command sheet", ["studio-review-command-sheet"]),
        ("studio", "Studio gate decision receipt packet", ["studio-gate-decision-receipt-packet"]),
        ("studio", "Studio sync control room", ["studio-sync-control-room"]),
        ("studio", "Studio sync decision rehearsal", ["studio-sync-decision-rehearsal"]),
        ("studio", "Studio package quality desk", ["studio-package-quality-desk"]),
        ("studio", "Studio next shorts review batch", ["studio-next-shorts-review-batch"]),
        ("tower", "Tower publishing runway", ["tower-runway"]),
        ("tower", "Tower review command sheet", ["tower-review-command-sheet"]),
        ("tower", "Tower manual publishing calendar", ["tower-manual-calendar"]),
        ("tower", "Tower social command center", ["tower-social-command-center"]),
        ("tower", "Tower next publishing batch", ["tower-next-publishing-batch"]),
        ("tower", "Tower receipt readiness packet", ["tower-receipt-readiness-packet"]),
        ("tower", "Tower review anomalies", ["tower-review-anomalies"]),
        ("tower", "Tower manual packet board", ["tower-manual-packet-board"]),
        ("tower", "Tower publisher desk", ["tower-publisher-desk"]),
        ("tower", "Tower review unblock brief", ["tower-review-unblock-brief"]),
        ("tower", "Tower review gate board", ["tower-review-gate-board"]),
        ("tower", "Tower publishing sprint companion", ["tower-publishing-sprint"]),
        ("tower", "Tower publication control room", ["tower-publication-control-room"]),
        ("photo", "Photo Grove review status", ["photo-grove-status", "latest"]),
        ("photo", "Photo Grove export prep", ["photo-grove-export-prep", "latest"]),
        ("photo", "Photo Grove focused review batch", ["photo-grove-review-batch", "latest", "8"]),
        ("photo", "Photo Grove client proof packet", ["photo-grove-client-proof", "latest"]),
        ("photo", "Photo Grove cull suggestions", ["photo-grove-cull-suggestions", "8"]),
        ("photo", "Photo Grove contact sheet", ["photo-grove-contact-sheet"]),
        ("photo", "Photo Grove review session", ["photo-grove-review-session"]),
        ("photo", "Photo Grove first keepers", ["photo-grove-first-keepers", "latest", "24"]),
        ("photo", "Photo Grove culling sprint companion", ["photo-grove-culling-sprint"]),
        ("photo", "Photo Grove command sheet", ["photo-grove-command-sheet"]),
        ("photo", "Photo Grove keeper desk", ["photo-grove-keeper-desk"]),
        ("photo", "Photo Grove proof desk", ["photo-grove-proof-desk"]),
        ("photo", "Photo Grove decision desk", ["photo-grove-decision-desk"]),
        ("photo", "Photo Grove cull rehearsal", ["photo-grove-cull-rehearsal"]),
        ("photo", "Photo Grove first-pass triage", ["photo-grove-first-pass-triage"]),
        ("photo", "Photo Grove cull board", ["photo-grove-cull-board"]),
        ("photo", "Photo Grove control room", ["photo-grove-control-room"]),
        ("nest", "Nest writing source packet", ["nest-writing-source-packet"]),
        ("nest", "Nest research packet", ["nest-research-packet"]),
        ("nest", "Nest writing session cockpit", ["nest-writing-session-cockpit", "12"]),
        ("nest", "Nest writing daily packet", ["nest-writing-daily-packet", "12"]),
        ("nest", "Daily Writing Desk readiness", ["daily-writing-desk-readiness"]),
        ("nest", "Nest writing draft packet", ["nest-writing-draft-packet", "first"]),
        ("nest", "Writing publication runway", ["writing-publication-runway"]),
        ("nest", "Nest writing next revision batch", ["nest-writing-next-revision-batch"]),
        ("nest", "Nest Author Desk", ["nest-writing-author-desk", "12"]),
        ("nest", "Nest writing review desk", ["nest-writing-review-desk"]),
        ("nest", "Nest writing sprint companion", ["nest-writing-sprint"]),
        ("nest", "Nest writing small session", ["nest-writing-small-session"]),
        ("nest", "Nest writing momentum board", ["nest-writing-momentum-board"]),
        ("nest", "Nest writing control room", ["nest-writing-control-room"]),
        ("360", "360 workflow packet", ["studio360-workflow-packet", "220"]),
        ("360", "360 reframe packet", ["studio360-reframe-packet", "80"]),
        ("360", "360 repair status", ["studio360-repair-status"]),
        ("360", "360 repair preflight", ["studio360-repair-preflight", "12"]),
        ("360", "360 source desk", ["studio360-source-desk"]),
        ("360", "360 reframe/export desk", ["studio360-reframe-export-desk"]),
        ("360", "360 export candidate queue", ["studio360-export-candidate-queue"]),
        ("360", "360 renderer preflight", ["studio360-renderer-preflight"]),
        ("360", "360 proof review desk", ["studio360-proof-review-desk"]),
        ("360", "360 proof next brief", ["studio360-proof-next-brief"]),
        ("360", "360 proof sprint companion", ["studio360-proof-sprint"]),
        ("360", "360 proof control room", ["studio360-proof-control-room"]),
        ("os", "Quipsly OS board", ["quipsly-os-board"]),
        ("os", "Quipsly human help board", ["quipsly-human-help-board"]),
        ("os", "Quipsly blocker and decision ledger", ["quipsly-blocker-ledger"]),
        ("os", "Quipsly return brief", ["quipsly-return-brief"]),
        ("os", "Quipsly production runway", ["quipsly-production-runway"]),
        ("os", "Quipsly action deck", ["quipsly-action-deck"]),
        ("os", "Quipsly latest surface audit", ["quipsly-latest-surface-audit"]),
        ("os", "Quipsly OS validation", ["quipsly-os-validation"]),
        ("os", "Quipsly human help board from fresh validation", ["quipsly-human-help-board"]),
        ("os", "Quipsly blocker and decision ledger from fresh validation", ["quipsly-blocker-ledger"]),
        ("os", "Quipsly pointer contract validation from fresh return brief", ["quipsly-pointer-contract-validation"]),
        ("os", "Quipsly return brief from fresh pointer validation", ["quipsly-return-brief"]),
        ("os", "Quipsly production runway from fresh validation", ["quipsly-production-runway"]),
        ("os", "Quipsly action deck from fresh validation", ["quipsly-action-deck"]),
        ("os", "Quipsly latest surface audit after fresh validation", ["quipsly-latest-surface-audit"]),
        ("os", "Quipsly final pointer contract validation", ["quipsly-pointer-contract-validation"]),
        ("os", "Quipsly final OS validation", ["quipsly-os-validation"]),
    ]


def write_markdown(report: dict, path: Path) -> None:
    lines = [
        "# Quipsly OS refresh run",
        "",
        f"- Updated: `{report['updatedAt']}`",
        f"- Overall status: `{report['status']}`",
        f"- Passed: `{report['counts']['passed']}`",
        f"- Failed: `{report['counts']['failed']}`",
        f"- Timed out: `{report['counts']['timeout']}`",
        "",
        "This refresh only updates local review/runway artifacts. It does not publish, upload, schedule, delete, or mutate originals.",
        "",
        "## Steps",
        "",
    ]
    for step in report["steps"]:
        lines.extend(
            [
                f"### {step['label']}",
                "",
                f"- Lane: `{step['lane']}`",
                f"- Status: `{step['status']}`",
                f"- Return code: `{step['returncode']}`",
                f"- Command: `{' '.join(step['command'])}`",
                "",
            ]
        )
        if step["stdoutTail"]:
            lines.extend(["Stdout tail:", "", "```", step["stdoutTail"], "```", ""])
        if step["stderrTail"]:
            lines.extend(["Stderr tail:", "", "```", step["stderrTail"], "```", ""])
    path.write_text("\n".join(lines), encoding="utf-8")


def html_escape(value: object) -> str:
    return (
        str(value)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def write_html(report: dict, path: Path) -> None:
    rows = []
    for step in report["steps"]:
        status_class = step["status"].replace("-", "_")
        stderr = html_escape(step["stderrTail"])
        stdout = html_escape(step["stdoutTail"])
        details = []
        if stdout:
            details.append(f"<details><summary>stdout</summary><pre>{stdout}</pre></details>")
        if stderr:
            details.append(f"<details><summary>stderr</summary><pre>{stderr}</pre></details>")
        rows.append(
            "<tr>"
            f"<td><strong>{html_escape(step['label'])}</strong><br><span>{html_escape(step['lane'])}</span></td>"
            f"<td><span class='pill {status_class}'>{html_escape(step['status'])}</span></td>"
            f"<td>{html_escape(step['returncode'])}</td>"
            f"<td><code>{html_escape(' '.join(step['command']))}</code>{''.join(details)}</td>"
            "</tr>"
        )

    html = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Quipsly OS refresh run</title>
  <style>
    :root {{
      color-scheme: dark;
      --bg: #101813;
      --panel: #18251d;
      --ink: #f4efd9;
      --muted: #b7aa87;
      --line: rgba(244, 239, 217, 0.16);
      --moss: #69c987;
      --honey: #e2b84d;
      --clay: #e1745c;
      --creek: #50b9c8;
    }}
    body {{
      margin: 0;
      background: radial-gradient(circle at top left, rgba(105, 201, 135, 0.18), transparent 34rem), var(--bg);
      color: var(--ink);
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.45;
    }}
    main {{ max-width: 1180px; margin: 0 auto; padding: 40px 24px; }}
    .hero {{
      border: 1px solid var(--line);
      border-radius: 28px;
      padding: 28px;
      background: linear-gradient(135deg, rgba(24, 37, 29, 0.94), rgba(36, 32, 18, 0.86));
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.35);
    }}
    .eyebrow {{ color: var(--honey); font-size: 12px; letter-spacing: 0.28em; font-weight: 900; text-transform: uppercase; }}
    h1 {{ margin: 8px 0 10px; font-size: clamp(34px, 6vw, 72px); line-height: 0.96; }}
    .summary {{ color: var(--muted); max-width: 780px; }}
    .stats {{ display: flex; flex-wrap: wrap; gap: 10px; margin-top: 22px; }}
    .stat {{ padding: 10px 14px; border-radius: 16px; background: rgba(255, 255, 255, 0.06); border: 1px solid var(--line); }}
    .stat strong {{ display: block; font-size: 22px; color: var(--moss); }}
    table {{ width: 100%; border-collapse: collapse; margin-top: 28px; overflow: hidden; border-radius: 20px; }}
    th, td {{ text-align: left; vertical-align: top; border-bottom: 1px solid var(--line); padding: 13px 12px; }}
    th {{ color: var(--honey); font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; background: rgba(255, 255, 255, 0.05); }}
    td {{ background: rgba(255, 255, 255, 0.035); }}
    td span {{ color: var(--muted); font-size: 12px; }}
    code, pre {{ white-space: pre-wrap; word-break: break-word; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }}
    code {{ color: var(--creek); }}
    pre {{ color: var(--muted); background: rgba(0, 0, 0, 0.22); padding: 12px; border-radius: 12px; }}
    details {{ margin-top: 8px; }}
    summary {{ cursor: pointer; color: var(--honey); }}
    .pill {{ display: inline-block; padding: 5px 9px; border-radius: 999px; font-size: 12px; font-weight: 900; }}
    .passed {{ background: rgba(105, 201, 135, 0.18); color: var(--moss); }}
    .failed, .timeout {{ background: rgba(225, 116, 92, 0.18); color: var(--clay); }}
  </style>
</head>
<body>
<main>
  <section class="hero">
    <div class="eyebrow">Quipsly OS</div>
    <h1>Refresh run</h1>
    <p class="summary">Safe local runway refresh for Studio, Tower, Photo Grove, Nest writing, and 360 workflows. This report is proof of artifact generation only; it does not claim publication or mutate source media.</p>
    <div class="stats">
      <div class="stat"><strong>{html_escape(report['status'])}</strong>Status</div>
      <div class="stat"><strong>{html_escape(report['counts']['passed'])}</strong>Passed</div>
      <div class="stat"><strong>{html_escape(report['counts']['failed'])}</strong>Failed</div>
      <div class="stat"><strong>{html_escape(report['counts']['timeout'])}</strong>Timed out</div>
      <div class="stat"><strong>{html_escape(report['updatedAt'])}</strong>Updated</div>
    </div>
  </section>
  <table>
    <thead><tr><th>Step</th><th>Status</th><th>Code</th><th>Command and evidence</th></tr></thead>
    <tbody>
      {''.join(rows)}
    </tbody>
  </table>
</main>
</body>
</html>
"""
    path.write_text(html, encoding="utf-8")


def main() -> int:
    run_id = f"{timestamp()}-quipsly-os-refresh"
    session_dir = OUTPUT_ROOT / run_id
    session_dir.mkdir(parents=True, exist_ok=True)

    steps = [
        run_step(lane=lane, label=label, args=args)
        for lane, label, args in refresh_plan()
    ]
    counts = {
        "passed": sum(1 for step in steps if step.status == "passed"),
        "reportedBlockers": sum(1 for step in steps if step.status == "reported-blockers"),
        "failed": sum(1 for step in steps if step.status == "failed"),
        "timeout": sum(1 for step in steps if step.status == "timeout"),
        "total": len(steps),
    }
    status = (
        "passed"
        if counts["failed"] == 0 and counts["timeout"] == 0 and counts["reportedBlockers"] == 0
        else "passed-with-known-blockers"
        if counts["failed"] == 0 and counts["timeout"] == 0
        else "needs-review"
    )
    report = {
        "schema": "quipsly-os-refresh-run.v1",
        "updatedAt": datetime.now().isoformat(timespec="seconds"),
        "status": status,
        "counts": counts,
        "humanAsk": "Open this refresh report to see which local boards regenerated and which lane, if any, needs attention before humans act.",
        "agentSafeParallelWork": "Codex may rerun failed local generators, improve handoff fields, clarify blockers, and continue another lane. Do not publish, upload, schedule, approve, delete, overwrite versions, mutate sources, or create receipt truth.",
        "nextSafestAction": "If all steps passed, open the OS board and latest-surface audit. If any lane failed, inspect that step and continue another lane while the blocker is documented.",
        "truth": {
            "externalPublishing": False,
            "sourceMediaMutated": False,
            "previousVersionsOverwritten": False,
            "continuesAfterLaneFailure": True,
        },
        "sessionDir": str(session_dir),
        "jsonPath": str(session_dir / "refresh-report.json"),
        "markdownPath": str(session_dir / "START-HERE-quipsly-os-refresh.md"),
        "htmlPath": str(session_dir / "index.html"),
        "firstSafeAction": {
            "label": "Open Quipsly OS refresh report",
            "command": f"open {shell_quote(str(session_dir / 'index.html'))}",
            "path": str(session_dir / "index.html"),
            "safety": "Opens local refresh evidence only. No source mutation, approval, publishing, upload, schedule, delete, overwrite, account mutation, or receipt capture occurs.",
        },
        "steps": [asdict(step) for step in steps],
    }

    json_path = Path(report["jsonPath"])
    markdown_path = Path(report["markdownPath"])
    html_path = Path(report["htmlPath"])
    json_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    write_markdown(report, markdown_path)
    write_html(report, html_path)

    if EXTERNAL_ROOT.exists():
        LATEST_POINTER.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print(json.dumps({
        "status": status,
        "counts": counts,
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "htmlPath": str(html_path),
        "latestPointer": str(LATEST_POINTER) if EXTERNAL_ROOT.exists() else None,
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
