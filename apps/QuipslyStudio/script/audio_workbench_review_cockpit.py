#!/usr/bin/env python3
"""Generate a local Audio Workbench review cockpit for a candidate baseline.

The cockpit is a static, inspectable HTML page. It makes the human listen pass
calmer by putting the full handoff, proof-window workorder, evidence reports,
and exact next commands in one place. It does not approve, publish, or mutate
source media.
"""
from __future__ import annotations

import argparse
import html
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.write_text(json.dumps(value, indent=2, sort_keys=True), encoding="utf-8")


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


def output_suffix(baseline_id: str) -> str:
    marker = "episode-4-conformed-production-baseline-"
    return baseline_id.replace(marker, "") if baseline_id.startswith(marker) else baseline_id


def h(value: Any) -> str:
    return html.escape("" if value is None else str(value), quote=True)


def rel_or_file_uri(path_text: str | None, base: Path) -> str:
    if not path_text:
        return ""
    path = Path(path_text)
    try:
        rel = path.resolve().relative_to(base.resolve())
        return quote(rel.as_posix())
    except ValueError:
        return path.resolve().as_uri() if path.exists() else quote(path_text)


def path_exists(path_text: str | None) -> bool:
    return bool(path_text) and Path(path_text).exists()


def output_path(outputs: dict[str, Any], key: str) -> str | None:
    value = outputs.get(key)
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return value.get("path")
    return None


def shell_quote(text: str) -> str:
    return "'" + text.replace("'", "'\"'\"'") + "'"


def build_cockpit(baseline_dir: Path) -> dict[str, Any]:
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    outputs = manifest.get("outputs", {})
    baseline_id = manifest.get("baselineId", "unknown-baseline")

    workorder = read_json(Path(outputs["proofWindowListenWorkorder"])) if path_exists(outputs.get("proofWindowListenWorkorder")) else {}
    gate = read_json(Path(outputs["latestBranchInheritanceGate"])) if path_exists(outputs.get("latestBranchInheritanceGate")) else {}
    quality = manifest.get("qualitySummary", {})

    suffix = output_suffix(baseline_id)
    html_path = baseline_dir / f"audio-review-cockpit-{suffix}.html"
    json_path = baseline_dir / f"audio-review-cockpit-{suffix}.json"

    return {
        "schema": "quipsly.audio-workbench.review-cockpit.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "approvalStatus": manifest.get("approvalStatus"),
        "branchInheritanceReady": manifest.get("branchInheritanceReady"),
        "qualitySummary": quality,
        "gate": {
            "canInheritForBranches": gate.get("canInheritForBranches"),
            "blockers": gate.get("blockers", []),
            "warnings": gate.get("warnings", []),
            "markdown": outputs.get("latestBranchInheritanceGateMarkdown"),
        },
        "handoff": {
            "wav": output_path(outputs, "masterWav"),
            "m4a": output_path(outputs, "masterM4a"),
        },
        "reports": {
            "reviewPacket": outputs.get("listenReviewPacketMarkdown"),
            "listenWorkorder": outputs.get("proofWindowListenWorkorderMarkdown"),
            "proofWindowComparison": outputs.get("proofWindowComparisonMarkdown"),
            "sourceActivity": outputs.get("sourceActivityMarkdown"),
            "sourceContribution": outputs.get("sourceContributionMarkdown"),
            "qualityReport": outputs.get("qualityReportMarkdown"),
            "stageBoard": outputs.get("audioSpineStageBoardMarkdown"),
            "listenDecisionTemplate": outputs.get("latestListenDecisionTemplateMarkdown"),
            "branchGate": outputs.get("latestBranchInheritanceGateMarkdown"),
        },
        "listenProof": {
            "bundle": outputs.get("listenProofBundle"),
            "manifest": outputs.get("listenProofBundleManifest"),
            "html": str(Path(outputs.get("listenProofBundle", "")) / "listen-proof.html")
            if outputs.get("listenProofBundle")
            else None,
            "playlist": str(Path(outputs.get("listenProofBundle", "")) / "listen-proof.m3u")
            if outputs.get("listenProofBundle")
            else None,
        },
        "workorder": workorder,
        "approvalCommands": {
            "recordBranchInheritanceApproval": (
                "python3 apps/QuipslyStudio/script/audio_workbench_record_listen_decision.py "
                f"--baseline-dir {shell_quote(str(baseline_dir))} "
                "--status human-approved-for-branch-inheritance "
                "--reviewer 'Charlie or Mako' "
                "--notes 'Human listened to the v006 cockpit/workorder and approved it for edit branch inheritance.' "
                "--confirm-human-listened"
            ),
            "recordNeedsFocusedProof": (
                "python3 apps/QuipslyStudio/script/audio_workbench_record_listen_decision.py "
                f"--baseline-dir {shell_quote(str(baseline_dir))} "
                "--status needs-focused-proof "
                "--reviewer 'Charlie or Mako' "
                "--issue 'Describe the exact window and symptom here.'"
            ),
            "refreshBranchGate": (
                "python3 apps/QuipslyStudio/script/audio_workbench_branch_gate.py "
                f"--baseline-dir {shell_quote(str(baseline_dir))}"
            ),
        },
        "outputs": {
            "json": str(json_path),
            "html": str(html_path),
        },
    }


def render_audio_player(label: str, path_text: str | None, base: Path) -> str:
    if not path_text:
        return f"<p class='missing'>{h(label)} missing</p>"
    uri = rel_or_file_uri(path_text, base)
    exists = path_exists(path_text)
    badge = "exists" if exists else "missing"
    return (
        f"<div class='player {badge}'>"
        f"<div class='player-label'>{h(label)}</div>"
        f"<audio controls preload='none' src='{h(uri)}'></audio>"
        f"<code>{h(path_text)}</code>"
        "</div>"
    )


def render_report_link(label: str, path_text: str | None, base: Path) -> str:
    if not path_text:
        return f"<li class='missing'>{h(label)}: missing</li>"
    uri = rel_or_file_uri(path_text, base)
    status = "ok" if path_exists(path_text) else "missing"
    return f"<li class='{status}'><a href='{h(uri)}'>{h(label)}</a><code>{h(path_text)}</code></li>"


def render_work_item(item: dict[str, Any], base: Path) -> str:
    paths = item.get("proofPaths", {})
    listen_for = "".join(f"<li>{h(text)}</li>" for text in item.get("listenFor", []))
    proof_players = "".join(
        render_audio_player(key, paths.get(key), base)
        for key in item.get("listenOrder", [])
    )
    return f"""
    <article class="work-item" data-window="{h(item.get('windowLabel'))}">
      <header>
        <div>
          <p class="eyebrow">{h(item.get('id'))} · {h(item.get('priority'))}</p>
          <h3>{h(item.get('windowLabel'))} <span>@ {h(item.get('sequenceStartSeconds'))}s</span></h3>
        </div>
        <strong>{h(item.get('likelyStage'))}</strong>
      </header>
      <p class="warning">{h(item.get('warning'))}</p>
      <section class="proof-grid">{proof_players}</section>
      <section class="listen-for">
        <h4>Listen for</h4>
        <ul>{listen_for}</ul>
      </section>
      <section class="conditions">
        <div><h4>Pass if</h4><p>{h(item.get('passCondition'))}</p></div>
        <div><h4>Fail if</h4><p>{h(item.get('failCondition'))}</p></div>
        <div><h4>Safe repair</h4><p>{h(item.get('safeNextAction'))}</p></div>
      </section>
      <label class="notes-label">Reviewer notes for this item</label>
      <textarea data-note-key="{h(item.get('id'))}" placeholder="Write what you heard. Notes stay in this browser unless copied into the decision command."></textarea>
    </article>
    """


def render_html(cockpit: dict[str, Any]) -> str:
    base = Path(cockpit["baselineDir"])
    handoff = cockpit.get("handoff", {})
    work_items = (cockpit.get("workorder") or {}).get("items", [])
    reports = cockpit.get("reports", {})
    report_links = "\n".join(render_report_link(label, path, base) for label, path in reports.items())
    blockers = cockpit.get("gate", {}).get("blockers", [])
    blocker_items = "".join(f"<li>{h(item)}</li>" for item in blockers) or "<li>none</li>"
    work_html = "\n".join(render_work_item(item, base) for item in work_items) or "<p>No workorder items found.</p>"
    commands = cockpit.get("approvalCommands", {})
    approval_command = commands.get("recordBranchInheritanceApproval", "")
    focused_command = commands.get("recordNeedsFocusedProof", "")
    gate_command = commands.get("refreshBranchGate", "")
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Quipsly Audio Review Cockpit</title>
  <style>
    :root {{
      color-scheme: dark;
      --bg: #111713;
      --panel: #17231c;
      --panel-2: #213328;
      --ink: #f2ead8;
      --muted: #b7aa8d;
      --gold: #e6be45;
      --leaf: #56c271;
      --clay: #d86a4b;
      --sky: #53a7d8;
      --line: rgba(242, 234, 216, 0.14);
      --shadow: rgba(0, 0, 0, 0.32);
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background:
        radial-gradient(circle at 12% 8%, rgba(86, 194, 113, 0.16), transparent 30rem),
        radial-gradient(circle at 86% 2%, rgba(230, 190, 69, 0.12), transparent 26rem),
        linear-gradient(135deg, #0e1511, var(--bg));
      color: var(--ink);
    }}
    main {{ max-width: 1480px; margin: 0 auto; padding: 28px; }}
    header.hero {{
      display: grid;
      grid-template-columns: 1.3fr 0.7fr;
      gap: 18px;
      align-items: stretch;
      margin-bottom: 20px;
    }}
    .card {{
      background: linear-gradient(150deg, rgba(33, 51, 40, 0.94), rgba(23, 35, 28, 0.94));
      border: 1px solid var(--line);
      border-radius: 24px;
      box-shadow: 0 18px 60px var(--shadow);
      padding: 22px;
    }}
    h1, h2, h3, h4, p {{ margin-top: 0; }}
    h1 {{ font-size: clamp(2rem, 4vw, 4rem); line-height: 0.95; margin-bottom: 16px; letter-spacing: -0.05em; }}
    h2 {{ font-size: 1.45rem; margin-bottom: 12px; }}
    h3 {{ font-size: 1.05rem; margin-bottom: 2px; }}
    h3 span {{ color: var(--muted); font-weight: 500; }}
    code {{
      display: block;
      overflow-wrap: anywhere;
      color: #d8c99f;
      font-size: 0.75rem;
      margin-top: 8px;
    }}
    .eyebrow {{
      color: var(--gold);
      text-transform: uppercase;
      letter-spacing: 0.18em;
      font-size: 0.72rem;
      font-weight: 800;
      margin-bottom: 8px;
    }}
    .badges {{ display: flex; flex-wrap: wrap; gap: 8px; margin: 18px 0 0; }}
    .badge {{
      border: 1px solid var(--line);
      background: rgba(255,255,255,0.06);
      padding: 8px 10px;
      border-radius: 999px;
      font-size: 0.82rem;
      color: var(--muted);
    }}
    .badge strong {{ color: var(--ink); }}
    .badge.blocked strong {{ color: var(--clay); }}
    .badge.ready strong {{ color: var(--leaf); }}
    .players {{ display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }}
    .player {{
      background: rgba(0,0,0,0.22);
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 12px;
    }}
    .player-label {{ color: var(--gold); font-weight: 800; font-size: 0.82rem; margin-bottom: 8px; }}
    audio {{ width: 100%; }}
    .grid {{ display: grid; grid-template-columns: 0.95fr 1.05fr; gap: 18px; align-items: start; }}
    .reports ul {{ list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }}
    .reports a {{ color: var(--sky); font-weight: 800; text-decoration: none; }}
    .reports li {{ border-bottom: 1px solid var(--line); padding-bottom: 9px; }}
    .work-item {{
      background: rgba(0,0,0,0.2);
      border: 1px solid var(--line);
      border-radius: 22px;
      padding: 18px;
      margin-bottom: 16px;
    }}
    .work-item header {{ display: flex; justify-content: space-between; gap: 14px; align-items: start; }}
    .work-item header strong {{ color: var(--leaf); font-size: 0.8rem; text-align: right; }}
    .warning {{
      background: rgba(216, 106, 75, 0.13);
      border: 1px solid rgba(216, 106, 75, 0.32);
      color: #ffd3c8;
      border-radius: 14px;
      padding: 10px 12px;
      font-weight: 700;
    }}
    .proof-grid {{ display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 14px 0; }}
    .conditions {{ display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }}
    .conditions div, .listen-for {{
      background: rgba(255,255,255,0.045);
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 12px;
    }}
    .conditions h4, .listen-for h4 {{ margin-bottom: 8px; color: var(--gold); }}
    .conditions p, li {{ color: var(--muted); line-height: 1.45; }}
    textarea {{
      width: 100%;
      min-height: 76px;
      resize: vertical;
      border-radius: 14px;
      border: 1px solid var(--line);
      background: rgba(0,0,0,0.24);
      color: var(--ink);
      padding: 12px;
      margin-top: 8px;
    }}
    .notes-label {{ color: var(--muted); font-weight: 800; font-size: 0.82rem; }}
    pre {{
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      background: rgba(0,0,0,0.28);
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 14px;
      color: #e7dbbb;
      font-size: 0.82rem;
    }}
    button {{
      border: 0;
      border-radius: 999px;
      padding: 9px 12px;
      background: var(--gold);
      color: #22190c;
      font-weight: 900;
      cursor: pointer;
    }}
    .missing {{ color: var(--clay); }}
    @media (max-width: 980px) {{
      header.hero, .grid, .players, .proof-grid, .conditions {{ grid-template-columns: 1fr; }}
      main {{ padding: 18px; }}
    }}
  </style>
</head>
<body>
  <main>
    <header class="hero">
      <section class="card">
        <p class="eyebrow">Quipsly Audio Workbench</p>
        <h1>Episode 4 review cockpit</h1>
        <p>One calm place to decide whether this machine-clean audio spine is ready for branch inheritance. This page does not approve anything. It makes the listen proof easier to do honestly.</p>
        <div class="badges">
          <span class="badge">Baseline <strong>{h(cockpit.get('baselineId'))}</strong></span>
          <span class="badge blocked">Approval <strong>{h(cockpit.get('approvalStatus'))}</strong></span>
          <span class="badge blocked">Branch ready <strong>{h(cockpit.get('branchInheritanceReady'))}</strong></span>
          <span class="badge">Work items <strong>{len(work_items)}</strong></span>
        </div>
      </section>
      <section class="card">
        <p class="eyebrow">Current blocker</p>
        <ul>{blocker_items}</ul>
      </section>
    </header>

    <section class="card">
      <h2>Full handoff listen</h2>
      <p>Use the M4A for quick listening and the WAV for the real Premiere/Quipsly handoff. Speaker split files are diagnostics only.</p>
      <div class="players">
        {render_audio_player('Mastered M4A listening copy', handoff.get('m4a'), base)}
        {render_audio_player('Mastered WAV handoff', handoff.get('wav'), base)}
      </div>
    </section>

    <section class="grid" style="margin-top:18px">
      <section class="card reports">
        <h2>Evidence reports</h2>
        <ul>{report_links}</ul>
      </section>
      <section class="card">
        <h2>Decision commands</h2>
        <p>Run these from <code>/Users/wall-e/Dev/high-ground-studio</code> after the real listen pass.</p>
        <h3>Approve for branch inheritance</h3>
        <pre>{h(approval_command)}
{h(gate_command)}</pre>
        <h3>Needs focused proof or repair</h3>
        <pre>{h(focused_command)}
{h(gate_command)}</pre>
        <button onclick="copyNotes()">Copy browser notes</button>
      </section>
    </section>

    <section class="card" style="margin-top:18px">
      <h2>Proof-window listen workorder</h2>
      <p>Warnings are not failures. They are places where human listening has to decide whether the math is pointing at a real problem or just a harmless level/context clue.</p>
      {work_html}
    </section>
  </main>
  <script>
    const textareas = document.querySelectorAll('textarea[data-note-key]');
    for (const textarea of textareas) {{
      const key = 'quipsly-audio-review:' + textarea.dataset.noteKey;
      textarea.value = localStorage.getItem(key) || '';
      textarea.addEventListener('input', () => localStorage.setItem(key, textarea.value));
    }}
    async function copyNotes() {{
      const notes = Array.from(textareas).map(t => `${{t.dataset.noteKey}}: ${{t.value || '(blank)'}}`).join('\\n\\n');
      await navigator.clipboard.writeText(notes);
      alert('Review notes copied.');
    }}
  </script>
</body>
</html>
"""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    cockpit = build_cockpit(baseline_dir)
    outputs = cockpit["outputs"]
    json_path = Path(outputs["json"])
    html_path = Path(outputs["html"])
    write_json(json_path, cockpit)
    html_path.write_text(render_html(cockpit), encoding="utf-8")

    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    manifest_outputs = manifest.setdefault("outputs", {})
    manifest_outputs["audioReviewCockpit"] = str(json_path)
    manifest_outputs["audioReviewCockpitHtml"] = str(html_path)
    manifest["approvalStatus"] = manifest.get("approvalStatus") or "machine-candidate-needs-human-listen-proof"
    write_json(manifest_path, manifest)

    print(json.dumps(outputs, indent=2))


if __name__ == "__main__":
    main()
