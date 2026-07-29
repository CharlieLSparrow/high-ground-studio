#!/usr/bin/env python3
"""Generate an HTML listen-priority console for an audio baseline.

The console is a local reviewer UI over the listen-priority queue. It can jump
the mastered audio to queue moments and export local notes, but it cannot
approve, fail, render, upload, or mutate original media.
"""

from __future__ import annotations

import argparse
import html
import json
import os
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
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in value)
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def file_uri(path_text: str | None) -> str:
    if not path_text:
        return ""
    return Path(path_text).expanduser().resolve().as_uri()


def escape(value: Any) -> str:
    return html.escape(str(value if value is not None else ""), quote=True)


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def render_console(payload: dict[str, Any]) -> str:
    queue = payload["queue"]
    queue_json = json.dumps(queue, ensure_ascii=True)
    payload_json = json.dumps(
        {
            "baselineId": payload["baselineId"],
            "approvalStatus": payload["approvalStatus"],
            "branchInheritanceReady": payload["branchInheritanceReady"],
            "branchRenderReady": payload["branchRenderReady"],
            "humanListenStillRequired": payload["humanListenStillRequired"],
            "generatedAt": payload["generatedAt"],
            "queuePath": payload["queuePath"],
            "queueMarkdown": payload["queueMarkdown"],
        },
        ensure_ascii=True,
    )
    cards: list[str] = []
    for item in queue:
        questions = "".join(f"<li>{escape(question)}</li>" for question in item.get("listenQuestions", []))
        reasons = "".join(f"<li>{escape(reason)}</li>" for reason in item.get("reasons", []))
        actions = "".join(f"<li>{escape(action)}</li>" for action in item.get("safeActionsIfFails", []))
        classes = " ".join(safe_slug(value) for value in item.get("classifications", []))
        sources = ", ".join(item.get("sources", []))
        cards.append(
            f"""
            <article class="queue-card risk-{escape(item.get('riskPriority'))} {escape(classes)}" data-queue-id="{escape(item.get('priority'))}">
              <div class="queue-topline">
                <span class="rank">#{escape(item.get('priority'))}</span>
                <span class="risk">risk {escape(item.get('riskPriority'))}</span>
                <span class="source">{escape(sources)}</span>
                <span class="time">{escape(item.get('time'))}</span>
              </div>
              <h3>{escape(item.get('title'))}</h3>
              <div class="grid">
                <section><h4>Listen for</h4><ul>{questions}</ul></section>
                <section><h4>Why here</h4><ul>{reasons}</ul></section>
              </div>
              <details>
                <summary>Safe action if this fails</summary>
                <ul>{actions}</ul>
              </details>
              <div class="queue-actions">
                <button type="button" data-seek="{escape(item.get('timeSec'))}" data-pre="8">8s before</button>
                <button type="button" data-seek="{escape(item.get('timeSec'))}" data-pre="3">3s before</button>
                <button type="button" data-seek="{escape(item.get('timeSec'))}" data-pre="0">Jump</button>
                <button type="button" data-decision="pass" data-queue-id="{escape(item.get('priority'))}">Pass</button>
                <button type="button" data-decision="needs-repair" data-queue-id="{escape(item.get('priority'))}">Needs repair</button>
                <button type="button" data-decision="needs-proof" data-queue-id="{escape(item.get('priority'))}">Needs proof</button>
              </div>
              <label>Notes for this queue item</label>
              <textarea data-notes-for="{escape(item.get('priority'))}" placeholder="What did you hear? Mention exact words, room-tone weirdness, or why it passes."></textarea>
            </article>
            """
        )

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Quipsly Listen Priority Console - {escape(payload['baselineId'])}</title>
  <style>
    :root {{
      --bg: #111813;
      --root: #182118;
      --panel: #223023;
      --panel2: #2d3c2f;
      --ink: #fff4d8;
      --muted: #c5b996;
      --moss: #76a96f;
      --gold: #edc95a;
      --clay: #ca704e;
      --berry: #ce6d73;
      --sky: #7fbec2;
      --line: rgba(255, 244, 216, 0.16);
      --shadow: 0 24px 80px rgba(0,0,0,0.38);
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      color: var(--ink);
      background:
        radial-gradient(circle at 12% 8%, rgba(118, 169, 111, 0.22), transparent 34rem),
        radial-gradient(circle at 90% 18%, rgba(237, 201, 90, 0.16), transparent 30rem),
        linear-gradient(150deg, #0d130f, var(--root) 42%, #19140f);
      font: 15px/1.5 ui-sans-serif, -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
    }}
    header {{
      position: sticky;
      top: 0;
      z-index: 10;
      padding: 1rem 1.25rem;
      border-bottom: 1px solid var(--line);
      background: rgba(17, 24, 19, 0.92);
      backdrop-filter: blur(20px);
    }}
    h1 {{ margin: 0; color: var(--gold); font-size: 1.25rem; letter-spacing: 0.075em; text-transform: uppercase; }}
    .subtitle {{ color: var(--muted); margin-top: 0.25rem; }}
    .shell {{ display: grid; grid-template-columns: minmax(22rem, 27rem) minmax(0, 1fr); gap: 1rem; padding: 1rem; }}
    .panel, .queue-card {{ background: rgba(34, 48, 35, 0.94); border: 1px solid var(--line); border-radius: 1.15rem; box-shadow: var(--shadow); }}
    .sticky-panel {{ position: sticky; top: 6rem; align-self: start; padding: 1rem; }}
    .queue-list {{ display: grid; gap: 0.85rem; }}
    audio {{ width: 100%; margin: 0.9rem 0; }}
    .toolbar, .queue-actions {{ display: flex; flex-wrap: wrap; gap: 0.45rem; margin: 0.75rem 0; }}
    button {{
      border: 1px solid var(--line);
      color: var(--ink);
      background: #354a37;
      border-radius: 0.65rem;
      padding: 0.48rem 0.7rem;
      font-weight: 800;
      cursor: pointer;
    }}
    button:hover {{ color: var(--gold); border-color: rgba(237, 201, 90, 0.62); }}
    .truth-grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 0.55rem; }}
    .truth {{ background: rgba(45, 60, 47, 0.95); border: 1px solid var(--line); border-radius: 0.8rem; padding: 0.65rem; }}
    .truth b {{ display: block; color: var(--gold); font-size: 0.72rem; letter-spacing: 0.08em; text-transform: uppercase; }}
    .truth span {{ overflow-wrap: anywhere; }}
    .queue-card {{ padding: 1rem; }}
    .risk-1 {{ border-color: rgba(237, 201, 90, 0.70); }}
    .risk-2 {{ border-color: rgba(202, 112, 78, 0.55); }}
    .risk-3 {{ border-color: rgba(127, 190, 194, 0.42); }}
    .risk-4, .risk-5 {{ border-color: rgba(118, 169, 111, 0.35); }}
    .queue-topline {{ display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; color: var(--muted); font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.08em; }}
    .rank, .risk {{ background: rgba(237, 201, 90, 0.14); color: var(--gold); border-radius: 999px; padding: 0.16rem 0.52rem; }}
    .time {{ margin-left: auto; color: var(--ink); font-variant-numeric: tabular-nums; }}
    h2 {{ margin: 0 0 0.35rem; }}
    h3 {{ margin: 0.55rem 0 0.45rem; }}
    h4 {{ color: var(--gold); margin: 0 0 0.3rem; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; }}
    .grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }}
    ul {{ margin: 0; padding-left: 1.1rem; color: var(--muted); }}
    details {{ color: var(--muted); margin: 0.7rem 0; }}
    summary {{ color: var(--sky); cursor: pointer; }}
    label {{ display: block; color: var(--gold); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; margin: 0.65rem 0 0.35rem; }}
    textarea {{ width: 100%; min-height: 4.5rem; resize: vertical; background: #101611; color: var(--ink); border: 1px solid var(--line); border-radius: 0.75rem; padding: 0.7rem; }}
    a {{ color: var(--sky); }}
    .status {{ min-height: 1.3rem; color: var(--muted); }}
    .guardrail {{ color: var(--muted); }}
    @media (max-width: 980px) {{ .shell {{ grid-template-columns: 1fr; }} .sticky-panel {{ position: static; }} .grid {{ grid-template-columns: 1fr; }} }}
  </style>
</head>
<body>
  <header>
    <h1>Quipsly Listen Priority Console</h1>
    <div class="subtitle">A calm review path for v006: jump, listen, decide locally, export notes. No magic approval button.</div>
  </header>
  <main class="shell">
    <aside class="panel sticky-panel">
      <h2>Episode 4 v006</h2>
      <p class="guardrail">This console cannot approve, fail, render, upload, or mutate media. It only captures reviewer evidence.</p>
      <audio id="masterAudio" controls preload="metadata" src="{escape(file_uri(payload['masterM4a']))}"></audio>
      <div class="toolbar">
        <button type="button" id="playPause">Play/Pause</button>
        <button type="button" id="backFive">-5s</button>
        <button type="button" id="forwardFive">+5s</button>
        <button type="button" id="exportNotes">Export notes JSON</button>
      </div>
      <div id="status" class="status"></div>
      <div class="truth-grid">
        <div class="truth"><b>Approval</b><span>{escape(payload['approvalStatus'])}</span></div>
        <div class="truth"><b>Human listen</b><span>{escape(payload['humanListenStillRequired'])}</span></div>
        <div class="truth"><b>Branch inherit</b><span>{escape(payload['branchInheritanceReady'])}</span></div>
        <div class="truth"><b>Queue items</b><span>{escape(payload['queueCount'])}</span></div>
      </div>
      <label>Overall notes</label>
      <textarea id="overallNotes" placeholder="Overall judgement after listening. Keep this specific enough to route pass, repair, or needs-proof."></textarea>
      <p><a href="{escape(file_uri(payload['queueMarkdown']))}">Open queue Markdown</a></p>
      <p><a href="{escape(file_uri(payload['visualOverviewHtml']))}">Open visual overview</a></p>
      <p><a href="{escape(file_uri(payload['markerConsoleHtml']))}">Open marker review console</a></p>
    </aside>
    <section class="queue-list">
      {''.join(cards)}
    </section>
  </main>
  <script id="queue-data" type="application/json">{queue_json}</script>
  <script id="payload-data" type="application/json">{payload_json}</script>
  <script>
    const audio = document.getElementById('masterAudio');
    const statusEl = document.getElementById('status');
    const queue = JSON.parse(document.getElementById('queue-data').textContent);
    const payload = JSON.parse(document.getElementById('payload-data').textContent);
    const decisions = {{}};
    function setStatus(message) {{ statusEl.textContent = message; }}
    function seekTo(seconds, pre) {{
      const value = Number(seconds);
      if (!Number.isFinite(value)) {{ setStatus('Queue item has no time.'); return; }}
      const target = Math.max(0, value - Number(pre || 0));
      audio.currentTime = target;
      audio.play().catch(() => setStatus('Ready at ' + target.toFixed(3) + 's. Press play if autoplay is blocked.'));
      setStatus('Jumped to ' + target.toFixed(3) + 's');
    }}
    document.querySelectorAll('[data-seek]').forEach(button => {{
      button.addEventListener('click', () => seekTo(button.dataset.seek, button.dataset.pre));
    }});
    document.querySelectorAll('[data-decision]').forEach(button => {{
      button.addEventListener('click', () => {{
        decisions[button.dataset.queueId] = button.dataset.decision;
        setStatus('Queue #' + button.dataset.queueId + ' marked ' + button.dataset.decision + ' locally.');
      }});
    }});
    document.getElementById('playPause').addEventListener('click', () => {{ audio.paused ? audio.play() : audio.pause(); }});
    document.getElementById('backFive').addEventListener('click', () => {{ audio.currentTime = Math.max(0, audio.currentTime - 5); }});
    document.getElementById('forwardFive').addEventListener('click', () => {{ audio.currentTime = audio.currentTime + 5; }});
    document.getElementById('exportNotes').addEventListener('click', () => {{
      const items = queue.map(item => {{
        const textarea = document.querySelector('[data-notes-for="' + item.priority + '"]');
        return {{
          queuePriority: item.priority,
          riskPriority: item.riskPriority,
          title: item.title,
          timeSec: item.timeSec,
          time: item.time,
          sources: item.sources,
          classifications: item.classifications,
          decision: decisions[item.priority] || 'undecided',
          notes: textarea ? textarea.value : '',
        }};
      }});
      const hasRepair = items.some(item => item.decision === 'needs-repair');
      const hasNeedsProof = items.some(item => item.decision === 'needs-proof');
      const allPassed = items.every(item => item.decision === 'pass');
      const exportPayload = {{
        schema: 'quipsly.audio-workbench.listen-priority-notes.v1',
        exportedAt: new Date().toISOString(),
        baselineId: payload.baselineId,
        approvalStatusAtExport: payload.approvalStatus,
        humanListenStillRequiredAtExport: payload.humanListenStillRequired,
        overallNotes: document.getElementById('overallNotes').value,
        items,
        suggestedDecision: hasRepair ? 'failed-human-listen' : (hasNeedsProof ? 'needs-proof' : (allPassed ? 'human-approved-for-branch-inheritance' : 'pending-human-listen')),
        note: 'This browser export is reviewer evidence only. Use guarded command paths before changing manifest truth.',
      }};
      const blob = new Blob([JSON.stringify(exportPayload, null, 2) + '\\n'], {{type: 'application/json'}});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = payload.baselineId + '-listen-priority-notes.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatus('Exported local listen-priority notes JSON.');
    }});
  </script>
</body>
</html>
"""


def build_markdown(report: dict[str, Any]) -> str:
    return "\n".join(
        [
            f"# Audio Listen-Priority Console: {report['baselineId']}",
            "",
            f"Generated: `{report['generatedAt']}`",
            "",
            "This console turns the listen-priority queue into a local review UI with the mastered M4A, jump buttons, local pass/needs-repair/needs-proof decisions, and notes export.",
            "",
            "It does not approve audio, fail audio, render branches, upload files, or mutate source media.",
            "",
            f"- Console HTML: `{report['htmlPath']}`",
            f"- Open command: `{report['openCommandPath']}`",
            f"- Queue JSON: `{report['queuePath']}`",
            f"- Queue Markdown: `{report['queueMarkdown']}`",
            f"- Queue items: `{report['queueCount']}`",
            f"- Approval status: `{report['approvalStatus']}`",
            f"- Branch inheritance ready: `{str(report['branchInheritanceReady']).lower()}`",
            f"- Branch render ready: `{str(report['branchRenderReady']).lower()}`",
            "",
            "```bash",
            f"open {shell_quote(report['htmlPath'])}",
            "```",
            "",
        ]
    )


def build_open_command(report: dict[str, Any]) -> str:
    return "\n".join(
        [
            "#!/bin/zsh",
            "set -euo pipefail",
            "",
            "echo 'Opening Episode 4 listen-priority console...'",
            f"open {shell_quote(report['htmlPath'])}",
            "",
        ]
    ) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    queue_path_text = output_path(outputs.get("latestAudioListenPriorityQueue"))
    if not queue_path_text:
        raise FileNotFoundError("latestAudioListenPriorityQueue is not registered in manifest outputs")
    queue_path = Path(queue_path_text)
    queue_payload = read_json(queue_path)
    queue = queue_payload.get("queue") or []
    baseline_id = str(manifest.get("baselineId") or "audio-baseline")
    suffix = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    console_dir = baseline_dir / f"audio-listen-priority-console-{suffix}-{stamp}"
    console_dir.mkdir(parents=True, exist_ok=True)
    html_path = console_dir / "listen-priority-console.html"
    json_path = console_dir / "listen-priority-console.json"
    md_path = console_dir / "listen-priority-console.md"
    command_path = console_dir / "open-listen-priority-console.command"

    report = {
        "schema": "quipsly.audio-workbench.listen-priority-console.v1",
        "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "approvalStatus": manifest.get("approvalStatus"),
        "packageReadyForHumanListen": bool(manifest.get("packageReadyForHumanListen")),
        "humanListenStillRequired": not bool(manifest.get("branchInheritanceReady")),
        "branchInheritanceReady": bool(manifest.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest.get("branchRenderReady")),
        "queuePath": str(queue_path),
        "queueMarkdown": output_path(outputs.get("latestAudioListenPriorityQueueMarkdown")),
        "queueCount": len(queue),
        "masterM4a": output_path(outputs.get("masterM4a")),
        "masterWav": output_path(outputs.get("masterWav")),
        "visualOverviewHtml": output_path(outputs.get("latestAudioMasterVisualOverviewHtml")),
        "markerConsoleHtml": output_path(outputs.get("latestEditorMarkerReviewConsoleHtml")),
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(md_path),
        "openCommandPath": str(command_path),
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "originalMediaMutated": False,
        "queue": queue,
    }

    html_path.write_text(render_console(report), encoding="utf-8")
    md_path.write_text(build_markdown(report), encoding="utf-8")
    command_path.write_text(build_open_command(report), encoding="utf-8")
    os.chmod(command_path, 0o755)
    write_json(json_path, {key: value for key, value in report.items() if key != "queue"})

    outputs["latestAudioListenPriorityConsole"] = str(json_path)
    outputs["latestAudioListenPriorityConsoleMarkdown"] = str(md_path)
    outputs["latestAudioListenPriorityConsoleHtml"] = str(html_path)
    outputs["latestAudioListenPriorityConsoleOpenCommand"] = str(command_path)
    consoles = outputs.setdefault("audioListenPriorityConsoles", [])
    if str(json_path) not in consoles:
        consoles.append(str(json_path))
    manifest["audioListenPriorityConsoleCount"] = len(consoles)
    manifest["updatedAt"] = report["generatedAt"]
    write_json(manifest_path, manifest)

    print(
        json.dumps(
            {
                "baselineId": baseline_id,
                "html": str(html_path),
                "markdown": str(md_path),
                "json": str(json_path),
                "openCommand": str(command_path),
                "queueCount": len(queue),
                "approvalStateChanged": False,
                "branchStateChanged": False,
                "renderAttempted": False,
                "originalMediaMutated": False,
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
