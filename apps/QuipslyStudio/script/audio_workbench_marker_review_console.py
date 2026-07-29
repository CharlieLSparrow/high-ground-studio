#!/usr/bin/env python3
"""Generate a marker-driven human listen console for an audio baseline.

The console is a local HTML page for reviewing the mastered listening copy at
specific marker times. It does not approve audio, render branches, upload files,
or mutate original media. Notes are exported by the browser as a local JSON file
that can be routed into the existing notes-to-decision bridge after review.
"""

from __future__ import annotations

import argparse
import html
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


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


def file_uri(path_text: str | None) -> str:
    if not path_text:
        return ""
    return Path(path_text).expanduser().resolve().as_uri()


def escape(value: Any) -> str:
    return html.escape(str(value if value is not None else ""), quote=True)


def render_console(payload: dict[str, Any]) -> str:
    markers = payload["markers"]
    markers_json = json.dumps(markers, ensure_ascii=True)
    payload_json = json.dumps(
        {
            "baselineId": payload["baselineId"],
            "approvalStatus": payload["approvalStatus"],
            "branchInheritanceReady": payload["branchInheritanceReady"],
            "branchRenderReady": payload["branchRenderReady"],
            "humanListenStillRequired": payload["humanListenStillRequired"],
            "generatedAt": payload["generatedAt"],
            "markerPacket": payload["markerPacket"],
            "notesBridgeHint": payload["notesBridgeHint"],
        },
        ensure_ascii=True,
    )
    marker_cards = []
    for marker in markers:
        comment = escape(marker.get("comment"))
        proof_links = []
        proof_paths = marker.get("proofPaths") or {}
        if isinstance(proof_paths, dict):
            for label, path in proof_paths.items():
                if path:
                    proof_links.append(f'<a href="{escape(file_uri(path))}">{escape(label)}</a>')
        marker_cards.append(
            f"""
            <article class="marker-card {escape(marker.get('category'))}" data-marker-id="{escape(marker.get('markerId'))}">
              <div class="marker-topline">
                <span class="badge">{escape(marker.get('category'))}</span>
                <span class="severity">{escape(marker.get('severity'))}</span>
                <span class="time">{escape(marker.get('timecodeIn'))}</span>
              </div>
              <h3>{escape(marker.get('name'))}</h3>
              <p>{comment}</p>
              <div class="marker-actions">
                <button type="button" data-seek="{escape(marker.get('sequenceStartSeconds'))}" data-pre="0">Jump</button>
                <button type="button" data-seek="{escape(marker.get('sequenceStartSeconds'))}" data-pre="3">3s before</button>
                <button type="button" data-decision="pass" data-marker-id="{escape(marker.get('markerId'))}">Pass</button>
                <button type="button" data-decision="needs-repair" data-marker-id="{escape(marker.get('markerId'))}">Needs repair</button>
              </div>
              <label>Notes for this marker</label>
              <textarea data-notes-for="{escape(marker.get('markerId'))}" placeholder="What did you hear? Keep this specific and kind to future-you."></textarea>
              <div class="proof-links">{' '.join(proof_links)}</div>
            </article>
            """
        )
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Quipsly Audio Marker Review - {escape(payload['baselineId'])}</title>
  <style>
    :root {{
      --bg: #151c18;
      --panel: #202a23;
      --panel-2: #28342b;
      --ink: #f4ecd7;
      --muted: #b8ad96;
      --moss: #72a06a;
      --gold: #e6b84f;
      --clay: #c36b4a;
      --sky: #7bb4b8;
      --danger: #df6b6b;
      --line: rgba(244, 236, 215, 0.16);
      --shadow: 0 22px 70px rgba(0, 0, 0, 0.35);
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      background:
        radial-gradient(circle at 18% 10%, rgba(114, 160, 106, 0.25), transparent 34rem),
        radial-gradient(circle at 86% 18%, rgba(230, 184, 79, 0.16), transparent 28rem),
        linear-gradient(140deg, #101612, var(--bg));
      color: var(--ink);
      font: 15px/1.5 ui-sans-serif, -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
    }}
    header {{
      position: sticky;
      top: 0;
      z-index: 5;
      padding: 1rem 1.4rem;
      border-bottom: 1px solid var(--line);
      background: rgba(21, 28, 24, 0.92);
      backdrop-filter: blur(18px);
    }}
    h1 {{ margin: 0; font-size: 1.25rem; letter-spacing: 0.06em; text-transform: uppercase; color: var(--gold); }}
    .subtitle {{ color: var(--muted); margin-top: 0.25rem; }}
    .shell {{ display: grid; grid-template-columns: minmax(23rem, 28rem) minmax(0, 1fr); gap: 1rem; padding: 1rem; }}
    .sticky-panel {{ position: sticky; top: 6.2rem; align-self: start; }}
    .panel {{ background: rgba(32, 42, 35, 0.94); border: 1px solid var(--line); border-radius: 1.2rem; box-shadow: var(--shadow); padding: 1rem; }}
    audio {{ width: 100%; margin: 0.8rem 0; }}
    .truth-grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 0.55rem; margin-top: 0.8rem; }}
    .truth {{ background: var(--panel-2); border: 1px solid var(--line); border-radius: 0.8rem; padding: 0.7rem; }}
    .truth b {{ display: block; color: var(--gold); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; }}
    .truth span {{ color: var(--ink); overflow-wrap: anywhere; }}
    .danger {{ color: var(--danger); }}
    .marker-list {{ display: grid; gap: 0.85rem; }}
    .marker-card {{ background: rgba(32, 42, 35, 0.92); border: 1px solid var(--line); border-radius: 1.1rem; padding: 1rem; }}
    .marker-card.approval-gate {{ border-color: rgba(223, 107, 107, 0.55); }}
    .marker-card.critical-listen {{ border-color: rgba(230, 184, 79, 0.45); }}
    .marker-card.bleed-check {{ border-color: rgba(195, 107, 74, 0.50); }}
    .marker-card.edit-advisory {{ border-color: rgba(123, 180, 184, 0.48); }}
    .marker-topline {{ display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; color: var(--muted); font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.08em; }}
    .badge {{ background: rgba(230, 184, 79, 0.14); color: var(--gold); border-radius: 999px; padding: 0.18rem 0.5rem; }}
    .severity {{ color: var(--sky); }}
    .time {{ margin-left: auto; color: var(--ink); font-variant-numeric: tabular-nums; }}
    h3 {{ margin: 0.55rem 0 0.3rem; font-size: 1rem; }}
    p {{ color: var(--muted); margin: 0.4rem 0 0.8rem; }}
    button {{
      appearance: none;
      border: 1px solid var(--line);
      background: #344437;
      color: var(--ink);
      border-radius: 0.65rem;
      padding: 0.5rem 0.7rem;
      font-weight: 700;
      cursor: pointer;
    }}
    button:hover {{ border-color: rgba(230, 184, 79, 0.6); color: var(--gold); }}
    .marker-actions {{ display: flex; flex-wrap: wrap; gap: 0.45rem; margin: 0.7rem 0; }}
    label {{ display: block; color: var(--gold); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; margin: 0.7rem 0 0.35rem; }}
    textarea {{ width: 100%; min-height: 5.2rem; resize: vertical; background: #121814; color: var(--ink); border: 1px solid var(--line); border-radius: 0.75rem; padding: 0.7rem; }}
    .proof-links {{ display: flex; flex-wrap: wrap; gap: 0.45rem; margin-top: 0.65rem; }}
    a {{ color: var(--sky); }}
    .proof-links a {{ background: rgba(123, 180, 184, 0.12); border: 1px solid rgba(123, 180, 184, 0.25); border-radius: 999px; padding: 0.18rem 0.55rem; text-decoration: none; font-size: 0.82rem; }}
    .toolbar {{ display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.8rem; }}
    .status {{ color: var(--muted); min-height: 1.4rem; margin-top: 0.65rem; }}
    @media (max-width: 900px) {{ .shell {{ grid-template-columns: 1fr; }} .sticky-panel {{ position: static; }} }}
  </style>
</head>
<body>
  <header>
    <h1>Quipsly Audio Marker Review</h1>
    <div class="subtitle">Jump to the places where v006 needs human ears. These markers are prompts, not verdicts.</div>
  </header>
  <main class="shell">
    <aside class="sticky-panel panel">
      <h2>Episode 4 v006</h2>
      <audio id="masterAudio" controls preload="metadata" src="{escape(file_uri(payload['masterM4a']))}"></audio>
      <div class="toolbar">
        <button type="button" id="playPause">Play/Pause</button>
        <button type="button" id="backFive">-5s</button>
        <button type="button" id="forwardFive">+5s</button>
        <button type="button" id="exportNotes">Export notes JSON</button>
      </div>
      <div id="status" class="status"></div>
      <div class="truth-grid">
        <div class="truth"><b>Approval</b><span class="danger">{escape(payload['approvalStatus'])}</span></div>
        <div class="truth"><b>Human listen</b><span>{escape(payload['humanListenStillRequired'])}</span></div>
        <div class="truth"><b>Branch inherit</b><span>{escape(payload['branchInheritanceReady'])}</span></div>
        <div class="truth"><b>Markers</b><span>{escape(payload['markerCount'])}</span></div>
      </div>
      <label>Overall notes</label>
      <textarea id="overallNotes" placeholder="Overall verdict after listening. Do not approve unless you actually listened."></textarea>
      <p>After notes are exported, route them through the existing notes-to-decision bridge. This page itself cannot approve or fail the baseline.</p>
      <p><a href="{escape(file_uri(payload['markerPacket']))}">Open marker packet JSON</a></p>
    </aside>
    <section class="marker-list">
      {''.join(marker_cards)}
    </section>
  </main>
  <script id="markers-data" type="application/json">{markers_json}</script>
  <script id="payload-data" type="application/json">{payload_json}</script>
  <script>
    const audio = document.getElementById('masterAudio');
    const statusEl = document.getElementById('status');
    const markers = JSON.parse(document.getElementById('markers-data').textContent);
    const payload = JSON.parse(document.getElementById('payload-data').textContent);
    const decisions = {{}};
    function setStatus(message) {{ statusEl.textContent = message; }}
    function seekTo(seconds, pre) {{
      const value = Number(seconds);
      if (!Number.isFinite(value)) {{ setStatus('Marker has no time.'); return; }}
      audio.currentTime = Math.max(0, value - Number(pre || 0));
      audio.play().catch(() => setStatus('Ready at marker. Press play if browser blocked autoplay.'));
      setStatus('Jumped to ' + Math.max(0, value - Number(pre || 0)).toFixed(3) + 's');
    }}
    document.querySelectorAll('[data-seek]').forEach(button => {{
      button.addEventListener('click', () => seekTo(button.dataset.seek, button.dataset.pre));
    }});
    document.querySelectorAll('[data-decision]').forEach(button => {{
      button.addEventListener('click', () => {{
        decisions[button.dataset.markerId] = button.dataset.decision;
        setStatus(button.dataset.markerId + ' marked ' + button.dataset.decision + ' locally. Export notes when finished.');
      }});
    }});
    document.getElementById('playPause').addEventListener('click', () => {{ audio.paused ? audio.play() : audio.pause(); }});
    document.getElementById('backFive').addEventListener('click', () => {{ audio.currentTime = Math.max(0, audio.currentTime - 5); }});
    document.getElementById('forwardFive').addEventListener('click', () => {{ audio.currentTime = audio.currentTime + 5; }});
    document.getElementById('exportNotes').addEventListener('click', () => {{
      const markerNotes = markers.map(marker => {{
        const textarea = document.querySelector('[data-notes-for="' + marker.markerId + '"]');
        return {{
          markerId: marker.markerId,
          category: marker.category,
          timecodeIn: marker.timecodeIn,
          sequenceStartSeconds: marker.sequenceStartSeconds,
          decision: decisions[marker.markerId] || 'undecided',
          notes: textarea ? textarea.value : '',
        }};
      }});
      const exportPayload = {{
        schema: 'quipsly.audio-workbench.marker-review-notes.v1',
        exportedAt: new Date().toISOString(),
        baselineId: payload.baselineId,
        approvalStatusAtExport: payload.approvalStatus,
        humanListenStillRequiredAtExport: payload.humanListenStillRequired,
        overallNotes: document.getElementById('overallNotes').value,
        markers: markerNotes,
        suggestedDecision: markerNotes.some(item => item.decision === 'needs-repair') ? 'failed-human-listen' : 'pending-human-listen',
        note: 'This browser export is reviewer evidence only. Use the guarded notes-to-decision bridge before changing manifest truth.',
      }};
      const blob = new Blob([JSON.stringify(exportPayload, null, 2) + '\\n'], {{type: 'application/json'}});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = payload.baselineId + '-marker-review-notes.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatus('Exported local notes JSON.');
    }});
  </script>
</body>
</html>
"""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest = load_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})

    marker_packet_path = output_path(outputs.get("latestEditorMarkerPacket"))
    if not marker_packet_path or not Path(marker_packet_path).exists():
        raise SystemExit("Missing latestEditorMarkerPacket. Run audio_workbench_editor_marker_export.py first.")
    marker_packet = load_json(Path(marker_packet_path))

    baseline_id = str(manifest.get("baselineId") or marker_packet.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    folder = baseline_dir / f"audio-marker-review-console-{slug}-{generated_at}"
    folder.mkdir(parents=True, exist_ok=False)

    payload_path = folder / "marker-review-console.json"
    html_path = folder / "marker-review-console.html"
    notes_template_path = folder / "marker-review-notes-template.json"
    open_command_path = folder / "open-marker-review-console.command"

    payload = {
        "schema": "quipsly.audio-workbench.marker-review-console.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "approvalStatus": manifest.get("approvalStatus"),
        "branchInheritanceReady": bool(manifest.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest.get("branchRenderReady")),
        "humanListenStillRequired": manifest.get("approvalStatus") == "machine-candidate-needs-human-listen-proof",
        "markerPacket": str(marker_packet_path),
        "markerCsv": output_path(outputs.get("latestEditorMarkerPacketCsv")),
        "markerPlaylist": output_path(outputs.get("latestEditorMarkerPacketPlaylist")),
        "masterWav": output_path(outputs.get("masterWav")),
        "masterM4a": output_path(outputs.get("masterM4a")),
        "markerCount": int(marker_packet.get("markerCount") or len(marker_packet.get("markers") or [])),
        "markers": marker_packet.get("markers") or [],
        "notesBridgeHint": "Export notes JSON from the browser, then route through the existing notes-to-decision bridge with typed human-listen confirmation if it should change manifest truth.",
        "outputs": {
            "folder": str(folder),
            "html": str(html_path),
            "payload": str(payload_path),
            "notesTemplate": str(notes_template_path),
            "openCommand": str(open_command_path),
        },
        "originalMediaMutated": False,
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "hugeMediaCopied": False,
    }

    notes_template = {
        "schema": "quipsly.audio-workbench.marker-review-notes.v1",
        "baselineId": baseline_id,
        "approvalStatusAtExport": manifest.get("approvalStatus"),
        "humanListenStillRequiredAtExport": payload["humanListenStillRequired"],
        "overallNotes": "",
        "markers": [
            {
                "markerId": marker.get("markerId"),
                "category": marker.get("category"),
                "timecodeIn": marker.get("timecodeIn"),
                "sequenceStartSeconds": marker.get("sequenceStartSeconds"),
                "decision": "undecided",
                "notes": "",
            }
            for marker in payload["markers"]
        ],
        "suggestedDecision": "pending-human-listen",
        "note": "Template only. Human listen notes are evidence, not approval by themselves.",
    }

    write_json(payload_path, payload)
    write_json(notes_template_path, notes_template)
    html_path.write_text(render_console(payload) + "\n", encoding="utf-8")
    open_command_path.write_text(f"#!/bin/zsh\nopen '{html_path}'\n", encoding="utf-8")
    open_command_path.chmod(0o755)

    outputs["latestEditorMarkerReviewConsole"] = str(payload_path)
    outputs["latestEditorMarkerReviewConsoleHtml"] = str(html_path)
    outputs["latestEditorMarkerReviewConsoleNotesTemplate"] = str(notes_template_path)
    outputs["latestEditorMarkerReviewConsoleOpenCommand"] = str(open_command_path)
    history = outputs.setdefault("editorMarkerReviewConsoles", [])
    if str(payload_path) not in history:
        history.append(str(payload_path))
    manifest["editorMarkerReviewConsoleCount"] = len(history)
    manifest["editorMarkerReviewConsoleGeneratedAt"] = generated_at
    manifest["editorMarkerReviewConsoleMarkerCount"] = payload["markerCount"]
    manifest["editorMarkerReviewConsoleHumanListenStillRequired"] = payload["humanListenStillRequired"]
    manifest["editorMarkerReviewConsoleApprovalStateChanged"] = False
    manifest["editorMarkerReviewConsoleBranchStateChanged"] = False
    manifest["editorMarkerReviewConsoleHugeMediaCopied"] = False
    write_json(manifest_path, manifest)

    print(f"Wrote {html_path}")
    print(f"Wrote {payload_path}")
    print(f"Wrote {notes_template_path}")
    print(f"Wrote {open_command_path}")
    print(f"Marker count: {payload['markerCount']}")
    print(f"Human listen still required: {payload['humanListenStillRequired']}")


if __name__ == "__main__":
    main()
