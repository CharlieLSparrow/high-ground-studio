#!/usr/bin/env python3
"""Write a human-friendly start-here dashboard for human-flow review artifacts.

The dashboard is read-only. It summarizes current sidecar state, points to the
next safe command, and keeps review evidence separate from actual timeline
metadata mutation.
"""

from __future__ import annotations

import argparse
import datetime as dt
import html
import json
from pathlib import Path
from typing import Any

from human_flow_review_pipeline_check import build_check


DEFAULT_ROOT = Path("/Users/wall-e/Movies/QuipslyExports/human-flow-review")
RUNBOOK_PATH = Path("/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/docs/human-flow-cut-review-runbook.md")


def text(value: Any, default: str = "") -> str:
    if value is None:
        return default
    result = str(value).strip()
    return result or default


def artifact_rows(check: dict[str, Any]) -> list[dict[str, Any]]:
    rows = [
        {"label": "Current board", **check.get("board", {})},
    ]
    session_files = check.get("sessionFiles")
    if isinstance(session_files, dict):
        labels = {
            "session": "Review session",
            "receiptsJsonl": "Blank receipts",
            "decisionsJsonl": "Review decisions",
            "decisionsSummary": "Decision summary",
            "promotionPlan": "Promotion plan",
            "approvalsJsonl": "Promotion approvals",
            "approvalsSummary": "Approval summary",
            "approvedPatchPacket": "Approved patch packet",
        }
        for key, label in labels.items():
            payload = session_files.get(key)
            if isinstance(payload, dict):
                rows.append({"label": label, **payload})
    return rows


def dashboard_payload(check: dict[str, Any], root: Path) -> dict[str, Any]:
    return {
        "model": "quipsly-human-flow-review-start-here",
        "generatedAt": dt.datetime.now(dt.timezone.utc).astimezone().isoformat(timespec="seconds"),
        "root": str(root),
        "sessionId": text(check.get("sessionId"), "none"),
        "receiptCount": check.get("receiptCount", 0),
        "decisionCount": check.get("decisionCount", 0),
        "approvedForApplyCount": check.get("approvedForApplyCount", 0),
        "nextSafeCommand": check.get("nextSafeCommand", ""),
        "nextSafePurpose": check.get("nextSafePurpose", ""),
        "runbook": {
            "path": str(RUNBOOK_PATH),
            "exists": RUNBOOK_PATH.exists(),
            "openCommand": f"open {RUNBOOK_PATH}",
            "purpose": "Plain-English safety map for human-flow review, sidecar evidence, and future apply boundaries.",
        },
        "smoke": {
            "command": "script/agentctl.sh human-flow-smoke",
            "purpose": "Fake-data pass/fail proof that the sidecar review machinery still creates sessions, decisions, promotion plans, approvals, and dry-run patch packets.",
            "doesNotProve": "It does not prove any real episode is synced, edited, exported, published, or ready for approval.",
        },
        "steps": check.get("steps", []),
        "artifacts": artifact_rows(check),
        "guardrails": [
            "Review artifacts are evidence, not timeline mutations.",
            "Approved patch packets are still dry-run previews until an explicit apply command exists and is intentionally run.",
            "Source media stays untouched.",
            "If cadence is ambiguous, prefer a review note over over-cleaning the edit.",
            "Judge podcast rhythm by ear first, then by waveform.",
        ],
        "truth": "Start-here dashboard only. It reads sidecar artifacts and does not mutate media, timeline metadata, exports, or publication state.",
    }


def render_markdown(payload: dict[str, Any]) -> str:
    lines = [
        "# Quipsly human-flow review: start here",
        "",
        f"- Generated: `{payload['generatedAt']}`",
        f"- Root: `{payload['root']}`",
        f"- Session: `{payload['sessionId']}`",
        f"- Receipts: `{payload['receiptCount']}`",
        f"- Decisions: `{payload['decisionCount']}`",
        f"- Approved for future apply: `{payload['approvedForApplyCount']}`",
        f"- Truth: {payload['truth']}",
        "",
        "## Next safe command",
        "",
        "```bash",
        payload["nextSafeCommand"],
        "```",
        "",
        payload["nextSafePurpose"],
        "",
        "## Runbook",
        "",
        f"- Exists: `{payload['runbook']['exists']}`",
        f"- Path: `{payload['runbook']['path']}`",
        f"- Purpose: {payload['runbook']['purpose']}",
        "",
        "```bash",
        payload["runbook"]["openCommand"],
        "```",
        "",
        "## Smoke test",
        "",
        f"- Purpose: {payload['smoke']['purpose']}",
        f"- Does not prove: {payload['smoke']['doesNotProve']}",
        "",
        "```bash",
        payload["smoke"]["command"],
        "```",
        "",
        "## Guardrails",
        "",
    ]
    for guardrail in payload["guardrails"]:
        lines.append(f"- {guardrail}")
    lines.extend(["", "## Workflow steps", ""])
    for step in payload.get("steps") or []:
        ready = "ready" if step.get("ready") else "missing"
        lines.extend([
            f"### {step.get('name', 'step')} - {ready}",
            "",
            f"- Purpose: {step.get('purpose', '')}",
            "",
            "```bash",
            step.get("command", ""),
            "```",
            "",
        ])
    lines.extend(["", "## Artifacts", ""])
    for row in payload.get("artifacts") or []:
        exists = "exists" if row.get("exists") else "missing"
        lines.append(f"- **{row.get('label', 'Artifact')}**: `{exists}` `{row.get('path', '')}`")
    return "\n".join(lines)


def render_html(payload: dict[str, Any]) -> str:
    step_cards = []
    for step in payload.get("steps") or []:
        ready = bool(step.get("ready"))
        step_cards.append(f"""
        <article class="step {'ready' if ready else 'missing'}">
          <p class="eyebrow">{html.escape('ready' if ready else 'missing')}</p>
          <h2>{html.escape(text(step.get('name'), 'Step'))}</h2>
          <p>{html.escape(text(step.get('purpose')))}</p>
          <code>{html.escape(text(step.get('command')))}</code>
        </article>
        """)
    artifact_items = []
    for row in payload.get("artifacts") or []:
        exists = bool(row.get("exists"))
        artifact_items.append(f"""
        <li class="artifact {'ready' if exists else 'missing'}">
          <span>{html.escape(text(row.get('label'), 'Artifact'))}</span>
          <code>{html.escape(text(row.get('path')))}</code>
        </li>
        """)
    guardrails = "".join(f"<li>{html.escape(item)}</li>" for item in payload.get("guardrails", []))
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Quipsly human-flow review start here</title>
  <style>
    body {{ margin: 0; background: #14231d; color: #f7edd7; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }}
    main {{ max-width: 1160px; margin: 0 auto; padding: 34px; }}
    .hero {{ border: 1px solid rgba(229, 186, 93, .34); border-radius: 30px; padding: 30px; background: radial-gradient(circle at top left, rgba(76, 112, 74, .55), transparent 38%), linear-gradient(135deg, rgba(37, 64, 50, .92), rgba(40, 31, 22, .86)); box-shadow: 0 28px 90px rgba(0,0,0,.28); }}
    .eyebrow {{ margin: 0 0 8px; color: #e8be57; text-transform: uppercase; letter-spacing: .16em; font-size: 12px; font-weight: 900; }}
    h1 {{ margin: 0; font-size: clamp(34px, 6vw, 72px); line-height: .92; }}
    h2 {{ margin: 0 0 8px; }}
    .stats {{ display: flex; flex-wrap: wrap; gap: 10px; margin: 22px 0 0; }}
    .stat {{ border: 1px solid rgba(247, 237, 215, .12); background: rgba(247, 237, 215, .08); border-radius: 18px; padding: 10px 14px; }}
    .next {{ margin-top: 18px; padding: 18px; border-radius: 20px; background: rgba(0,0,0,.28); }}
    code {{ display: block; white-space: pre-wrap; color: #bde7d0; background: rgba(0,0,0,.30); border-radius: 12px; padding: 10px; }}
    .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(270px, 1fr)); gap: 14px; margin-top: 22px; }}
    .step {{ border: 1px solid rgba(247, 237, 215, .12); border-radius: 22px; padding: 16px; background: rgba(8, 15, 12, .62); }}
    .step.ready {{ border-color: rgba(111, 214, 139, .30); }}
    .step.missing {{ border-color: rgba(232, 190, 87, .34); }}
    .panel {{ margin-top: 22px; border: 1px solid rgba(247, 237, 215, .12); border-radius: 24px; padding: 20px; background: rgba(8, 15, 12, .45); }}
    .artifact {{ margin: 10px 0; }}
    .artifact span {{ display: block; font-weight: 800; }}
    li {{ margin: 8px 0; }}
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <p class="eyebrow">Quipsly Studio - human-flow review</p>
      <h1>Start here. Keep the edit human.</h1>
      <div class="stats">
        <div class="stat"><b>{html.escape(str(payload['receiptCount']))}</b> receipts</div>
        <div class="stat"><b>{html.escape(str(payload['decisionCount']))}</b> decisions</div>
        <div class="stat"><b>{html.escape(str(payload['approvedForApplyCount']))}</b> approved previews</div>
        <div class="stat">session <b>{html.escape(payload['sessionId'])}</b></div>
      </div>
      <div class="next">
        <p class="eyebrow">Next safe command</p>
        <code>{html.escape(payload['nextSafeCommand'])}</code>
        <p>{html.escape(payload['nextSafePurpose'])}</p>
      </div>
      <div class="next">
        <p class="eyebrow">Runbook</p>
        <code>{html.escape(payload['runbook']['openCommand'])}</code>
        <p>{html.escape(payload['runbook']['purpose'])}</p>
      </div>
      <div class="next">
        <p class="eyebrow">Safe smoke proof</p>
        <code>{html.escape(payload['smoke']['command'])}</code>
        <p>{html.escape(payload['smoke']['purpose'])}</p>
        <p><b>Does not prove:</b> {html.escape(payload['smoke']['doesNotProve'])}</p>
      </div>
    </section>
    <section class="panel">
      <h2>Guardrails</h2>
      <ul>{guardrails}</ul>
    </section>
    <section class="grid">{''.join(step_cards)}</section>
    <section class="panel">
      <h2>Artifacts</h2>
      <ul>{''.join(artifact_items)}</ul>
    </section>
  </main>
</body>
</html>
"""


def write_outputs(payload: dict[str, Any], root: Path, basename: str) -> dict[str, str]:
    root.mkdir(parents=True, exist_ok=True)
    outputs = {
        "json": str(root / f"{basename}.json"),
        "markdown": str(root / f"{basename}.md"),
        "html": str(root / f"{basename}.html"),
    }
    with Path(outputs["json"]).open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True)
        handle.write("\n")
    with Path(outputs["markdown"]).open("w", encoding="utf-8") as handle:
        handle.write(render_markdown(payload))
        handle.write("\n")
    with Path(outputs["html"]).open("w", encoding="utf-8") as handle:
        handle.write(render_html(payload))
        handle.write("\n")
    return outputs


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", default=str(DEFAULT_ROOT))
    parser.add_argument("--session", default="latest")
    parser.add_argument("--basename", default="human-flow-start-here")
    args = parser.parse_args()

    root = Path(args.root).expanduser()
    check = build_check(root, args.session)
    payload = dashboard_payload(check, root)
    payload["outputs"] = write_outputs(payload, root, args.basename)
    print(json.dumps(payload["outputs"], indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
