#!/usr/bin/env python3
"""Build a static human reviewer console for an Audio Workbench baseline.

The console is a local HTML control room. It gathers the full handoff audio,
proof-window A/B files, machine lab metrics, decision matrix, warning context,
and guarded command paths onto one page. It stores reviewer notes in browser
localStorage only. It does not approve, fail, render, upload, or mutate media.
"""

from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timezone
from html import escape
from pathlib import Path
from typing import Any


SNIPPET_KEYS = [
    ("rawAligned", "Raw aligned"),
    ("sourceAwareContributionMix", "Source-aware"),
    ("conformedMasterSpine", "Conformed master"),
    ("speakerSplitCharlieLeftHomerRight", "Speaker split"),
]


def load_json(path: Path | None) -> dict[str, Any]:
    if not path or not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def output_path(value: Any) -> str | None:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        path = value.get("path")
        if isinstance(path, str):
            return path
    return None


def path_from_output(outputs: dict[str, Any], key: str) -> Path | None:
    path = output_path(outputs.get(key))
    return Path(path) if path else None


def resolve_baseline_dir(input_path: Path) -> Path:
    if (input_path / "manifest.json").exists():
        return input_path
    nested = input_path / "work" / "conformed-production-baseline"
    if (nested / "manifest.json").exists():
        return nested
    raise FileNotFoundError(
        "Could not find manifest.json at "
        f"{input_path}/manifest.json or {nested}/manifest.json"
    )


def safe_slug(value: str) -> str:
    slug = "".join(ch.lower() if ch.isalnum() else "-" for ch in value)
    while "--" in slug:
        slug = slug.replace("--", "-")
    return slug.strip("-") or "audio-baseline"


def file_url(path_text: str | None) -> str:
    if not path_text:
        return ""
    path = Path(path_text)
    if not path.exists():
        return ""
    return path.resolve().as_uri()


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def link_html(label: str, path_text: str | None) -> str:
    if not path_text:
        return f"<span class=\"missing\">{escape(label)} missing</span>"
    path = Path(path_text)
    href = path.resolve().as_uri() if path.exists() else ""
    if not href:
        return f"<span class=\"missing\">{escape(label)} missing</span>"
    return f"<a href=\"{escape(href)}\">{escape(label)}</a>"


def command_block(command: str) -> str:
    return f"<pre><code>{escape(command)}</code></pre>"


def audio_player(path_text: str | None, label: str) -> str:
    url = file_url(path_text)
    if not url:
        return f"""
        <div class="audio-card missing-card">
          <strong>{escape(label)}</strong>
          <p>Missing audio file.</p>
        </div>
        """
    return f"""
    <div class="audio-card">
      <strong>{escape(label)}</strong>
      <audio controls preload="metadata" src="{escape(url)}"></audio>
      <p class="small">{escape(Path(path_text or '').name)}</p>
    </div>
    """


def lab_metrics_for(lab: dict[str, Any], label: str, key: str) -> dict[str, Any]:
    for window in lab.get("windows") or []:
        if window.get("label") != label:
            continue
        files = window.get("files") or {}
        if isinstance(files.get(key), dict):
            return files[key]
    return {}


def matrix_row_for(matrix: dict[str, Any], label: str) -> dict[str, Any]:
    for row in matrix.get("reviewWindows") or []:
        if row.get("label") == label:
            return row
    return {}


def notes_import_command(baseline_dir: Path) -> str:
    return "\n".join(
        [
            "OUT=" + shell_quote(str(baseline_dir)),
            "python3 apps/QuipslyStudio/script/audio_workbench_reviewer_notes_packet.py \\",
            '  --baseline-dir "$OUT" \\',
            "  --notes-json " + shell_quote("~/Downloads/quipsly-audio-review-notes.json") + " \\",
            '  --reviewer "Charlie or Mako"',
        ]
    )


def build_console_html(
    *,
    manifest: dict[str, Any],
    matrix: dict[str, Any],
    lab: dict[str, Any],
    output_dir: Path,
    console_json: Path,
    generated_at: str,
) -> str:
    outputs = manifest.get("outputs") or {}
    baseline_id = str(manifest.get("baselineId") or "unknown-baseline")
    approval = str(manifest.get("approvalStatus") or "unknown")
    branch_ready = str(bool(manifest.get("branchInheritanceReady"))).lower()
    render_ready = str(bool(manifest.get("branchRenderReady"))).lower()
    master_wav = output_path(outputs.get("masterWav"))
    master_m4a = output_path(outputs.get("masterM4a"))
    commands = matrix.get("commands") or {}
    lab_summary = lab.get("summary") or {}
    storage_key = f"quipsly-audio-review:{baseline_id}:{generated_at}"

    proof_windows_html: list[str] = []
    for window in matrix.get("reviewWindows") or []:
        label = str(window.get("label") or "proof-window")
        snippets = window.get("proofSnippets") or {}
        lab_window = next((item for item in lab.get("windows") or [] if item.get("label") == label), {})
        metric_rows = []
        player_cards = []
        for key, title in SNIPPET_KEYS:
            path_text = output_path(snippets.get(key))
            player_cards.append(audio_player(path_text, title))
            metrics = lab_metrics_for(lab, label, key)
            warnings = ", ".join(metrics.get("warnings") or []) or "none"
            metric_rows.append(
                "<tr>"
                f"<td>{escape(title)}</td>"
                f"<td>{escape(str(metrics.get('durationSeconds')))}</td>"
                f"<td>{escape(str(metrics.get('meanVolumeDb')))}</td>"
                f"<td>{escape(str(metrics.get('maxVolumeDb')))}</td>"
                f"<td>{escape(str(metrics.get('silenceRatio')))}</td>"
                f"<td>{escape(warnings)}</td>"
                "</tr>"
            )
        warnings = []
        for value in window.get("proofComparisonWarnings") or []:
            warnings.append(f"proof: {value}")
        for value in window.get("bleedWarnings") or []:
            warnings.append(f"bleed: {value}")
        for action in window.get("repairActions") or []:
            warnings.append(f"conditional repair: {action.get('safeRepairIfConfirmed')}")
        warning_items = "".join(f"<li>{escape(str(item))}</li>" for item in warnings) or "<li>No focused warnings.</li>"
        pass_items = "".join(f"<li>{escape(str(item))}</li>" for item in window.get("passCriteria") or [])
        fail_items = "".join(f"<li>{escape(str(item))}</li>" for item in window.get("failCriteria") or [])
        proof_windows_html.append(
            f"""
            <section class="window-card" id="window-{escape(safe_slug(label))}">
              <div class="window-head">
                <div>
                  <p class="eyebrow">Proof window</p>
                  <h2>{escape(label)}</h2>
                  <p>Start <strong>{escape(str(window.get('sequenceStartSeconds')))}s</strong> · Duration <strong>{escape(str(window.get('durationSeconds')))}s</strong> · Critical listen <strong>{escape(str(window.get('criticalListen')))}</strong></p>
                </div>
                <select data-note-field="{escape(label)}:decision">
                  <option value="">Decision later</option>
                  <option value="pass">Pass window</option>
                  <option value="fail">Fail window</option>
                  <option value="more-proof">Needs more proof</option>
                </select>
              </div>
              <div class="player-grid">{''.join(player_cards)}</div>
              <details open>
                <summary>Machine lab metrics</summary>
                <table>
                  <thead><tr><th>File</th><th>Duration</th><th>Mean dB</th><th>Max dB</th><th>Silence ratio</th><th>Warnings</th></tr></thead>
                  <tbody>{''.join(metric_rows)}</tbody>
                </table>
                <p class="small">Conformed vs source-aware mean delta: {escape(str(lab_window.get('conformedVsSourceAwareMeanDeltaDb')))} dB.</p>
              </details>
              <div class="criteria-grid">
                <article><h3>Warnings/context</h3><ul>{warning_items}</ul></article>
                <article><h3>Pass means</h3><ul>{pass_items}</ul></article>
                <article><h3>Fail means</h3><ul>{fail_items}</ul></article>
              </div>
              <label class="note-label">Reviewer notes for {escape(label)}
                <textarea data-note-field="{escape(label)}:notes" placeholder="What did you hear? Echo, park noise, chopped reactions, harsh restoration, or good enough?"></textarea>
              </label>
            </section>
            """
        )

    support_links = [
        ("Decision matrix", output_path(outputs.get("latestListenDecisionMatrixMarkdown"))),
        ("Proof-window audio lab", output_path(outputs.get("latestProofWindowAudioLabMarkdown"))),
        ("Reviewer notes template", output_path(outputs.get("latestReviewerNotesTemplateMarkdown"))),
        ("Bleed management audit", output_path(outputs.get("latestBleedManagementAuditMarkdown"))),
        ("Bleed repair workorder", output_path(outputs.get("latestBleedRepairWorkorderMarkdown"))),
        ("Bleed repair preflight", output_path(outputs.get("latestBleedRepairPreflightMarkdown"))),
        ("Review handoff index", output_path(outputs.get("latestReviewHandoffIndexMarkdown"))),
        ("Manifest", str(output_dir.parent / "manifest.json")),
        ("Console JSON", str(console_json)),
    ]
    support_links_html = "".join(f"<li>{link_html(label, path)}</li>" for label, path in support_links)
    import_notes_command = notes_import_command(output_dir.parent)

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Quipsly Audio Reviewer Console</title>
  <style>
    :root {{
      color-scheme: dark;
      --bg: #0f1713;
      --panel: #17231d;
      --panel2: #203329;
      --ink: #f7ecd0;
      --muted: #b9ad90;
      --gold: #f3cb45;
      --moss: #63c475;
      --clay: #d36d4d;
      --blue: #72c6e8;
      --line: rgba(247, 236, 208, .16);
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Avenir Next", "Segoe UI", sans-serif;
      background:
        radial-gradient(circle at top left, rgba(99,196,117,.2), transparent 32rem),
        radial-gradient(circle at 85% 10%, rgba(243,203,69,.12), transparent 28rem),
        linear-gradient(135deg, #0f1713, #17201c 50%, #101611);
      color: var(--ink);
    }}
    main {{ max-width: 1280px; margin: 0 auto; padding: 32px; }}
    header, section, aside {{
      border: 1px solid var(--line);
      background: rgba(23,35,29,.86);
      border-radius: 28px;
      box-shadow: 0 24px 70px rgba(0,0,0,.26);
    }}
    header {{ padding: 30px; }}
    h1 {{ margin: 0; font-size: clamp(34px, 6vw, 68px); line-height: .95; letter-spacing: -.055em; }}
    h2 {{ margin: 0; font-size: 26px; letter-spacing: -.03em; }}
    h3 {{ margin: 0 0 10px; color: var(--gold); }}
    .eyebrow {{ color: var(--gold); letter-spacing: .16em; text-transform: uppercase; font-weight: 800; font-size: 12px; margin: 0 0 8px; }}
    .truth-grid, .player-grid, .criteria-grid, .command-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 14px;
    }}
    .truth-grid {{ margin-top: 22px; }}
    .pill, .audio-card, .criteria-grid article {{
      border: 1px solid var(--line);
      background: rgba(32,51,41,.78);
      border-radius: 18px;
      padding: 14px;
    }}
    .pill strong {{ display: block; color: var(--muted); text-transform: uppercase; letter-spacing: .1em; font-size: 11px; }}
    .stack {{ display: grid; gap: 18px; margin-top: 22px; }}
    .window-card {{ padding: 22px; }}
    .window-head {{ display: flex; gap: 16px; align-items: start; justify-content: space-between; margin-bottom: 14px; }}
    select, textarea, button {{
      border: 1px solid var(--line);
      background: rgba(8,13,10,.75);
      color: var(--ink);
      border-radius: 14px;
      padding: 10px 12px;
      font: inherit;
    }}
    select {{ min-width: 160px; }}
    textarea {{ width: 100%; min-height: 96px; resize: vertical; display: block; margin-top: 8px; }}
    .note-label {{ display: block; margin-top: 16px; color: var(--muted); }}
    audio {{ width: 100%; margin-top: 10px; }}
    table {{ width: 100%; border-collapse: collapse; margin-top: 12px; overflow: hidden; border-radius: 16px; }}
    td, th {{ border-bottom: 1px solid var(--line); padding: 9px 10px; text-align: left; vertical-align: top; }}
    th {{ color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .08em; }}
    details {{ margin: 15px 0; }}
    summary {{ cursor: pointer; color: var(--blue); font-weight: 800; }}
    pre {{ overflow: auto; white-space: pre-wrap; background: rgba(0,0,0,.35); border: 1px solid var(--line); border-radius: 18px; padding: 14px; }}
    code {{ font-family: "SF Mono", Menlo, monospace; font-size: 12px; }}
    a {{ color: var(--gold); }}
    .small {{ color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }}
    .missing, .missing-card {{ color: var(--clay); }}
    .actions {{ display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; }}
    button {{ cursor: pointer; background: rgba(99,196,117,.16); }}
    .status {{ color: var(--moss); font-weight: 800; }}
    @media (max-width: 820px) {{
      main {{ padding: 18px; }}
      .window-head {{ display: block; }}
      select {{ width: 100%; margin-top: 12px; }}
    }}
  </style>
</head>
<body>
<main>
  <header>
    <p class="eyebrow">Quipsly Audio Workbench</p>
    <h1>Reviewer console</h1>
    <p>This console is for listening and notes. It cannot approve or fail the baseline by itself. Use the guarded commands only after a real listen.</p>
    <div class="truth-grid">
      <div class="pill"><strong>Baseline</strong>{escape(baseline_id)}</div>
      <div class="pill"><strong>Approval</strong>{escape(approval)}</div>
      <div class="pill"><strong>Branch inheritance</strong>{branch_ready}</div>
      <div class="pill"><strong>Branch render</strong>{render_ready}</div>
      <div class="pill"><strong>Lab warnings</strong>{escape(str(lab_summary.get('warningCount')))}</div>
      <div class="pill"><strong>Missing proof files</strong>{escape(str(lab_summary.get('missingFileCount')))}</div>
    </div>
    <div class="actions">
      <button id="save-notes">Save notes</button>
      <button id="export-notes">Download notes JSON</button>
      <button id="copy-notes">Copy notes JSON</button>
      <span id="note-status" class="small status"></span>
    </div>
  </header>

  <section class="window-card">
    <p class="eyebrow">Primary listen</p>
    <div class="player-grid">
      {audio_player(master_m4a, "Full M4A listening copy")}
      {audio_player(master_wav, "Full WAV handoff master")}
    </div>
    <label class="note-label">Whole-episode notes
      <textarea data-note-field="whole-episode:notes" placeholder="Overall balance, echo, park noise, chopped moments, or approval concerns."></textarea>
    </label>
  </section>

  <div class="stack">
    {''.join(proof_windows_html)}
  </div>

  <section class="window-card">
    <p class="eyebrow">Guarded decisions</p>
    <p>These commands still require typed confirmation in the recorder. They are shown here so the reviewer can move from listen to explicit state without editing JSON by hand.</p>
    <div class="command-grid">
      <article><h3>Approve branch inheritance</h3>{command_block(commands.get('approveBranchInheritance', ''))}</article>
      <article><h3>Fail focused window</h3>{command_block(commands.get('failFocusedWindow', ''))}</article>
      <article><h3>Request more proof</h3>{command_block(commands.get('requestMoreProof', ''))}</article>
    </div>
  </section>

  <section class="window-card">
    <p class="eyebrow">Supporting artifacts</p>
    <ul>{support_links_html}</ul>
  </section>

  <section class="window-card">
    <p class="eyebrow">Round-trip reviewer notes</p>
    <h2>After downloading notes JSON</h2>
    <p>Run this from the repo root to turn the browser export into a manifest-backed reviewer notes packet. The packet will include guarded dry-run and confirmed decision commands. Importing notes still does not approve, fail, render, upload, or mutate media.</p>
    {command_block(import_notes_command)}
  </section>
</main>
<script>
const storageKey = {json.dumps(storage_key)};
function collectNotes() {{
  const payload = {{
    schema: "quipsly.audio-workbench.reviewer-console-notes.v1",
    baselineId: {json.dumps(baseline_id)},
    savedAt: new Date().toISOString(),
    fields: {{}}
  }};
  document.querySelectorAll("[data-note-field]").forEach((el) => {{
    payload.fields[el.dataset.noteField] = el.value;
  }});
  return payload;
}}
function applyNotes(payload) {{
  if (!payload || !payload.fields) return;
  document.querySelectorAll("[data-note-field]").forEach((el) => {{
    if (payload.fields[el.dataset.noteField] !== undefined) {{
      el.value = payload.fields[el.dataset.noteField];
    }}
  }});
}}
function saveNotes() {{
  localStorage.setItem(storageKey, JSON.stringify(collectNotes(), null, 2));
  document.getElementById("note-status").textContent = "saved " + new Date().toLocaleTimeString();
}}
function notesJson() {{ return JSON.stringify(collectNotes(), null, 2); }}
document.getElementById("save-notes").addEventListener("click", saveNotes);
document.getElementById("copy-notes").addEventListener("click", async () => {{
  await navigator.clipboard.writeText(notesJson());
  document.getElementById("note-status").textContent = "copied notes JSON";
}});
document.getElementById("export-notes").addEventListener("click", () => {{
  const blob = new Blob([notesJson()], {{ type: "application/json" }});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "quipsly-audio-review-notes.json";
  a.click();
  URL.revokeObjectURL(a.href);
}});
document.querySelectorAll("[data-note-field]").forEach((el) => {{
  el.addEventListener("change", saveNotes);
}});
applyNotes(JSON.parse(localStorage.getItem(storageKey) || "null"));
</script>
</body>
</html>
"""


def build_readme(payload: dict[str, Any]) -> str:
    return "\n".join(
        [
            f"# Audio Reviewer Console: {payload['baselineId']}",
            "",
            "This folder contains a local HTML console for human listening and notes.",
            "",
            f"- HTML: `{payload['html']}`",
            f"- JSON: `{payload['json']}`",
            f"- Approval status at creation: `{payload['approvalStatus']}`",
            f"- Branch inheritance ready at creation: `{payload['branchInheritanceReady']}`",
            f"- Branch render ready at creation: `{payload['branchRenderReady']}`",
            f"- Proof-window lab warnings: `{payload['proofWindowAudioLabWarningCount']}`",
            f"- Missing proof files: `{payload['proofWindowAudioLabMissingFileCount']}`",
            "",
            "This console does not approve, render, upload, or mutate media. Reviewer notes are browser-local unless exported.",
            "",
            "## Round-trip reviewer notes",
            "",
            "After using `Download notes JSON`, run this from the repo root to create a manifest-backed reviewer notes packet. The packet will include guarded dry-run and confirmed decision commands:",
            "",
            "```bash",
            payload["notesImportCommand"],
            "```",
            "",
            "That packet still does not approve or fail the baseline. Use the guarded listen-decision command only after a real human listen.",
            "",
        ]
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir.expanduser()).resolve()
    manifest_path = baseline_dir / "manifest.json"
    manifest = load_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})

    matrix = load_json(path_from_output(outputs, "latestListenDecisionMatrix"))
    lab = load_json(path_from_output(outputs, "latestProofWindowAudioLab"))
    if not matrix:
        raise SystemExit("Missing latestListenDecisionMatrix. Run audio_workbench_listen_decision_matrix.py first.")
    if not lab:
        raise SystemExit("Missing latestProofWindowAudioLab. Run audio_workbench_proof_window_audio_lab.py first.")

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    baseline_id = str(manifest.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    output_dir = baseline_dir / f"audio-reviewer-console-{slug}-{timestamp}"
    output_dir.mkdir(parents=False, exist_ok=False)
    console_json = output_dir / "audio-reviewer-console.json"
    console_html = output_dir / "audio-reviewer-console.html"
    readme = output_dir / "README.md"
    open_command = output_dir / "open-console.command"

    payload = {
        "schema": "quipsly.audio-workbench.reviewer-console.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "approvalStatus": manifest.get("approvalStatus"),
        "branchInheritanceReady": bool(manifest.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest.get("branchRenderReady")),
        "proofWindowAudioLab": output_path(outputs.get("latestProofWindowAudioLab")),
        "proofWindowAudioLabMarkdown": output_path(outputs.get("latestProofWindowAudioLabMarkdown")),
        "proofWindowAudioLabWarningCount": int(manifest.get("proofWindowAudioLabWarningCount") or 0),
        "proofWindowAudioLabMissingFileCount": int(manifest.get("proofWindowAudioLabMissingFileCount") or 0),
        "listenDecisionMatrix": output_path(outputs.get("latestListenDecisionMatrix")),
        "listenDecisionMatrixMarkdown": output_path(outputs.get("latestListenDecisionMatrixMarkdown")),
        "html": str(console_html),
        "json": str(console_json),
        "readme": str(readme),
        "openCommand": str(open_command),
        "notesImportCommand": notes_import_command(baseline_dir),
        "originalMediaMutated": False,
        "approvalStateChanged": False,
    }
    write_json(console_json, payload)
    console_html.write_text(
        build_console_html(
            manifest=manifest,
            matrix=matrix,
            lab=lab,
            output_dir=output_dir,
            console_json=console_json,
            generated_at=timestamp,
        ),
        encoding="utf-8",
    )
    readme.write_text(build_readme(payload), encoding="utf-8")
    open_command.write_text(
        "#!/bin/zsh\nset -e\nopen " + shell_quote(str(console_html)) + "\n",
        encoding="utf-8",
    )
    os.chmod(open_command, 0o755)

    outputs["latestAudioReviewerConsole"] = str(console_json)
    outputs["latestAudioReviewerConsoleHtml"] = str(console_html)
    outputs["latestAudioReviewerConsoleReadme"] = str(readme)
    outputs["latestAudioReviewerConsoleOpenCommand"] = str(open_command)
    history = outputs.setdefault("audioReviewerConsoles", [])
    if str(console_json) not in history:
        history.append(str(console_json))
    manifest["audioReviewerConsoleCount"] = len(history)
    manifest["latestAudioReviewerConsoleGeneratedAt"] = timestamp
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    print(f"Wrote {console_html}")
    print(f"Wrote {console_json}")
    print(f"Wrote {readme}")
    print(f"Approval state changed: false")


if __name__ == "__main__":
    main()
