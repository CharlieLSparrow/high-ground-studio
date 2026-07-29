#!/usr/bin/env python3
"""Generate a unified local human-listen control room for an audio baseline.

The control room combines the listen-priority review reel with the source-balance
A/B proof snippets. It exports local reviewer notes as JSON, but it does not
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


SCHEMA = "quipsly.audio-workbench.human-listen-control-room.v1"


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def resolve_baseline_dir(input_path: Path) -> Path:
    input_path = input_path.expanduser().resolve()
    if (input_path / "manifest.json").exists():
        return input_path
    nested = input_path / "work" / "conformed-production-baseline"
    if (nested / "manifest.json").exists():
        return nested.resolve()
    raise FileNotFoundError(
        "Could not find manifest.json at "
        f"{input_path / 'manifest.json'} or {nested / 'manifest.json'}"
    )


def output_path(value: Any) -> str | None:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        path = value.get("path") or value.get("markdownPath") or value.get("htmlPath") or value.get("playlistPath")
        if isinstance(path, str):
            return path
    if isinstance(value, list) and value:
        return output_path(value[-1])
    return None


def slug_for(manifest: dict[str, Any]) -> str:
    baseline_id = str(manifest.get("baselineId") or "audio-baseline")
    slug = baseline_id.replace("episode-4-conformed-production-baseline-", "")
    return "".join(ch if ch.isalnum() or ch in "-_" else "-" for ch in slug).strip("-") or "audio-baseline"


def rel_url(path: str | None, root: Path) -> str:
    if not path:
        return ""
    p = Path(path)
    try:
        return p.resolve().relative_to(root).as_posix()
    except Exception:
        return p.as_uri() if p.exists() else path


def rel_text(path: str | None, root: Path) -> str:
    if not path:
        return "not registered"
    p = Path(path)
    try:
        return str(p.resolve().relative_to(root))
    except Exception:
        return path


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def load_optional_json(path: str | None) -> dict[str, Any]:
    if not path:
        return {}
    p = Path(path)
    if not p.exists():
        return {}
    try:
        return read_json(p)
    except Exception:
        return {}


def file_status(path: str | None) -> dict[str, Any]:
    if not path:
        return {"path": None, "exists": False, "sizeBytes": None}
    p = Path(path)
    return {"path": path, "exists": p.exists(), "sizeBytes": p.stat().st_size if p.exists() else None}


def source_balance_items(source_balance: dict[str, Any]) -> list[dict[str, Any]]:
    pairs = []
    for pair in source_balance.get("pairs") or []:
        current = []
        candidates = []
        for item in pair.get("items") or []:
            if item.get("kind") == "current-v006-reference":
                current.append(item)
            else:
                candidates.append(item)
        pairs.append(
            {
                "flag": pair.get("flag"),
                "expectedDurationSeconds": pair.get("expectedDurationSeconds"),
                "current": current,
                "candidates": candidates,
                "warningCount": pair.get("warningCount"),
                "currentCount": pair.get("currentCount"),
                "candidateCount": pair.get("candidateCount"),
            }
        )
    return pairs


def build_html(packet: dict[str, Any], baseline_dir: Path) -> str:
    review = packet["reviewReel"]
    source_pairs = packet["sourceBalancePairs"]
    paths = packet["paths"]
    truth = packet["truth"]
    review_reel_url = rel_url(paths.get("reviewReelM4a"), baseline_dir)
    review_chapters = review.get("chapters") or []

    chapter_cards = []
    for idx, chapter in enumerate(review_chapters, start=1):
        chapter_id = f"chapter-{idx}"
        title = html.escape(str(chapter.get("title") or f"Review moment {idx}"))
        reasons = ", ".join(str(r) for r in chapter.get("reasons") or [])
        questions = chapter.get("listenQuestions") or []
        question_html = "".join(f"<li>{html.escape(str(q))}</li>" for q in questions[:4])
        start = float(chapter.get("reelStartSeconds") or 0)
        episode = html.escape(str(chapter.get("episodeCenterTimecode") or "unknown"))
        priority = html.escape(str(chapter.get("priority") or ""))
        chapter_cards.append(
            f"""
            <article class=\"card review-card\" data-note-id=\"{chapter_id}\">
              <div class=\"card-head\">
                <div><span class=\"eyebrow\">Review reel #{idx}</span><h3>{title}</h3></div>
                <button onclick=\"jumpReview({start:.3f})\">Jump</button>
              </div>
              <p><strong>Episode:</strong> {episode} <span class=\"pill\">priority {priority}</span></p>
              <p class=\"muted\">{html.escape(reasons)}</p>
              <ul>{question_html}</ul>
              {note_controls(chapter_id)}
            </article>
            """
        )

    source_cards = []
    for idx, pair in enumerate(source_pairs, start=1):
        flag = html.escape(str(pair.get("flag") or f"source-balance-{idx}"))
        pair_id = f"source-balance-{idx}"
        current_html = []
        for item in pair.get("current") or []:
            src = rel_url(item.get("output"), baseline_dir)
            label = html.escape(str(item.get("profileId") or item.get("kind") or "current"))
            current_html.append(audio_line(label, src, item))
        candidate_html = []
        for item in pair.get("candidates") or []:
            src = rel_url(item.get("output"), baseline_dir)
            label = html.escape(str(item.get("profileId") or item.get("kind") or "candidate"))
            candidate_html.append(audio_line(label, src, item))
        source_cards.append(
            f"""
            <article class=\"card source-card\" data-note-id=\"{pair_id}\">
              <div class=\"card-head\">
                <div><span class=\"eyebrow\">A/B source-balance proof</span><h3>{flag}</h3></div>
                <span class=\"pill\">{html.escape(str(pair.get('expectedDurationSeconds') or ''))}s</span>
              </div>
              <div class=\"ab-grid\">
                <section><h4>Current v006</h4>{''.join(current_html)}</section>
                <section><h4>Candidate repair</h4>{''.join(candidate_html)}</section>
              </div>
              <p class=\"muted\">Listen for improvement without killing overlap, laughter, human cadence, or Homer presence.</p>
              {note_controls(pair_id)}
            </article>
            """
        )

    packet_json = html.escape(json.dumps(packet, sort_keys=True))
    return f"""<!doctype html>
<html lang=\"en\">
<head>
<meta charset=\"utf-8\">
<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">
<title>Episode 4 Audio Human Listen Control Room</title>
<style>
:root {{
  color-scheme: dark;
  --bg: #101711;
  --panel: #18251b;
  --panel-2: #203225;
  --ink: #f4efd8;
  --muted: #c7bfa3;
  --moss: #7fb069;
  --gold: #f6c64b;
  --clay: #c86b4a;
  --river: #5bb7c8;
  --line: rgba(244,239,216,.18);
}}
* {{ box-sizing: border-box; }}
body {{ margin: 0; font-family: Avenir Next, ui-sans-serif, system-ui, sans-serif; background: radial-gradient(circle at top left, #273c28, var(--bg) 38%, #0b100d); color: var(--ink); }}
a {{ color: var(--river); }}
button {{ border: 1px solid var(--line); border-radius: 999px; background: #2f3c2c; color: var(--ink); padding: .45rem .8rem; font-weight: 700; cursor: pointer; }}
button:hover {{ border-color: var(--gold); }}
.hero {{ padding: 28px; border-bottom: 1px solid var(--line); background: linear-gradient(135deg, rgba(246,198,75,.08), rgba(127,176,105,.1)); }}
.hero h1 {{ margin: .2rem 0; font-size: clamp(2rem, 4vw, 4.5rem); letter-spacing: -0.06em; }}
.eyebrow {{ color: var(--gold); text-transform: uppercase; letter-spacing: .18em; font-size: .72rem; font-weight: 900; }}
.status-grid, .layout, .ab-grid {{ display: grid; gap: 16px; }}
.status-grid {{ grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); margin-top: 18px; }}
.layout {{ grid-template-columns: minmax(360px, 1.1fr) minmax(420px, 1.3fr); padding: 20px; align-items: start; }}
@media (max-width: 1000px) {{ .layout {{ grid-template-columns: 1fr; }} }}
.panel, .card {{ background: rgba(24,37,27,.88); border: 1px solid var(--line); border-radius: 22px; box-shadow: 0 20px 60px rgba(0,0,0,.28); }}
.panel {{ padding: 18px; position: sticky; top: 12px; }}
.card {{ padding: 16px; margin-bottom: 14px; }}
.card-head {{ display: flex; align-items: center; justify-content: space-between; gap: 12px; }}
h2, h3, h4 {{ margin: .2rem 0 .6rem; }}
.pill {{ display: inline-flex; align-items: center; border-radius: 999px; background: rgba(246,198,75,.14); color: var(--gold); padding: .25rem .55rem; font-size: .78rem; font-weight: 800; }}
.muted {{ color: var(--muted); }}
.truth {{ background: rgba(0,0,0,.18); border: 1px solid var(--line); border-radius: 16px; padding: 12px; }}
.truth strong {{ color: var(--gold); }}
audio {{ width: 100%; margin: .5rem 0; }}
.notes {{ display: grid; gap: 8px; margin-top: 12px; }}
.notes textarea {{ min-height: 70px; resize: vertical; border-radius: 14px; border: 1px solid var(--line); background: #0d140f; color: var(--ink); padding: 10px; }}
.choice-row {{ display: flex; flex-wrap: wrap; gap: 8px; }}
.choice-row label {{ display: inline-flex; gap: 6px; align-items: center; background: rgba(255,255,255,.04); border: 1px solid var(--line); border-radius: 999px; padding: .35rem .55rem; }}
.ab-grid {{ grid-template-columns: 1fr 1fr; }}
@media (max-width: 800px) {{ .ab-grid {{ grid-template-columns: 1fr; }} }}
.audio-line {{ border: 1px solid var(--line); border-radius: 16px; padding: 10px; background: rgba(0,0,0,.18); margin-bottom: 8px; }}
.toolbar {{ display: flex; gap: 10px; flex-wrap: wrap; margin-top: 16px; }}
code {{ color: #f7d98b; word-break: break-all; }}
</style>
</head>
<body>
<header class=\"hero\">
  <span class=\"eyebrow\">Quipsly Audio Workbench</span>
  <h1>Episode 4 human listen control room</h1>
  <p class=\"muted\">One shared playhead for review truth? Not yet. One shared decision surface? Yes. This page combines the review reel, A/B source-balance proof snippets, and exportable notes without changing approval state.</p>
  <div class=\"status-grid\">
    <div class=\"truth\"><strong>Approval</strong><br>{html.escape(str(truth.get('approvalStatus')))}</div>
    <div class=\"truth\"><strong>Package ready</strong><br>{str(truth.get('packageReadyForHumanListen')).lower()}</div>
    <div class=\"truth\"><strong>Branch inheritance</strong><br>{str(truth.get('branchInheritanceReady')).lower()}</div>
    <div class=\"truth\"><strong>Branch render</strong><br>{str(truth.get('branchRenderReady')).lower()}</div>
  </div>
</header>
<main class=\"layout\">
  <aside class=\"panel\">
    <span class=\"eyebrow\">Listen first</span>
    <h2>Review reel</h2>
    <audio id=\"reviewReel\" controls src=\"{html.escape(review_reel_url)}\"></audio>
    <p class=\"muted\">Use the jump buttons on each review card. Export notes when done; then run <code>PROCESS_EPISODE_4_AUDIO_REVIEW_NOTES.command</code> from this baseline folder to refresh the inbox, repair planner, and handoff reports.</p>
    <div class=\"toolbar\">
      <button onclick=\"exportNotes()\">Export notes JSON</button>
      <button onclick=\"clearNotes()\">Clear local notes</button>
    </div>
    <h3>Decision crib</h3>
    <ul>
      <li>Pass only if Homer stays present and the mix still sounds human.</li>
      <li>Choose needs-proof if the machine warning might be real but is not obvious.</li>
      <li>Choose needs-repair if a proof candidate is clearly better or v006 sounds wrong.</li>
    </ul>
    <p class=\"muted\">Baseline: <code>{html.escape(str(packet.get('baselineId')))}</code></p>
  </aside>
  <section>
    <span class=\"eyebrow\">Source-balance proof</span>
    <h2>A/B snippets</h2>
    {''.join(source_cards)}
    <span class=\"eyebrow\">Listen-priority reel</span>
    <h2>High-risk moments</h2>
    {''.join(chapter_cards)}
  </section>
</main>
<script id=\"packet\" type=\"application/json\">{packet_json}</script>
<script>
const STORAGE_KEY = 'quipsly-episode4-human-listen-control-room:' + JSON.parse(document.getElementById('packet').textContent).baselineId;
function jumpReview(seconds) {{
  const player = document.getElementById('reviewReel');
  player.currentTime = seconds;
  player.play();
}}
function collectNotes() {{
  const packet = JSON.parse(document.getElementById('packet').textContent);
  const notes = [];
  document.querySelectorAll('[data-note-id]').forEach(card => {{
    const id = card.getAttribute('data-note-id');
    const decision = card.querySelector('input[type=radio]:checked')?.value || 'undecided';
    const text = card.querySelector('textarea')?.value || '';
    notes.push({{ id, decision, notes: text }});
  }});
  return {{
    schema: 'quipsly.audio-workbench.human-listen-control-room-notes.v1',
    exportedAt: new Date().toISOString(),
    baselineId: packet.baselineId,
    approvalStatusAtExport: packet.truth.approvalStatus,
    branchInheritanceReadyAtExport: packet.truth.branchInheritanceReady,
    reviewer: '',
    suggestedOverallDecision: summarize(notes),
    notes
  }};
}}
function summarize(notes) {{
  if (notes.some(n => n.decision === 'needs-repair')) return 'needs-repair';
  if (notes.some(n => n.decision === 'needs-proof')) return 'needs-proof';
  if (notes.length && notes.every(n => n.decision === 'pass')) return 'all-pass';
  return 'pending-human-listen';
}}
function saveNotes() {{
  localStorage.setItem(STORAGE_KEY, JSON.stringify(collectNotes()));
}}
function restoreNotes() {{
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  const data = JSON.parse(raw);
  for (const note of data.notes || []) {{
    const card = document.querySelector(`[data-note-id="${{note.id}}"]`);
    if (!card) continue;
    const radio = card.querySelector(`input[type=radio][value="${{note.decision}}"]`);
    if (radio) radio.checked = true;
    const textarea = card.querySelector('textarea');
    if (textarea) textarea.value = note.notes || '';
  }}
}}
function exportNotes() {{
  saveNotes();
  const data = collectNotes();
  const blob = new Blob([JSON.stringify(data, null, 2) + '\\n'], {{ type: 'application/json' }});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'episode4-v006-human-listen-control-room-notes.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}}
function clearNotes() {{
  localStorage.removeItem(STORAGE_KEY);
  document.querySelectorAll('textarea').forEach(t => t.value = '');
  document.querySelectorAll('input[type=radio]').forEach(r => r.checked = false);
}}
document.addEventListener('input', saveNotes);
document.addEventListener('change', saveNotes);
restoreNotes();
</script>
</body>
</html>
"""


def note_controls(note_id: str) -> str:
    escaped = html.escape(note_id)
    return f"""
    <div class=\"notes\">
      <div class=\"choice-row\" aria-label=\"Decision for {escaped}\">
        <label><input type=\"radio\" name=\"{escaped}\" value=\"pass\"> pass</label>
        <label><input type=\"radio\" name=\"{escaped}\" value=\"needs-proof\"> needs proof</label>
        <label><input type=\"radio\" name=\"{escaped}\" value=\"needs-repair\"> needs repair</label>
      </div>
      <textarea placeholder=\"What did you hear? Keep it plain: pass, proof, repair, or exact timestamp/context.\"></textarea>
    </div>
    """


def audio_line(label: str, src: str, item: dict[str, Any]) -> str:
    duration = html.escape(str(item.get("durationSeconds") or "?"))
    size = html.escape(str(item.get("sizeBytes") or "?"))
    return f"""
    <div class=\"audio-line\">
      <strong>{label}</strong> <span class=\"pill\">{duration}s</span>
      <audio controls src=\"{html.escape(src)}\"></audio>
      <p class=\"muted\">size {size} bytes</p>
    </div>
    """


def build_markdown(packet: dict[str, Any], baseline_dir: Path) -> str:
    paths = packet["paths"]
    return "\n".join(
        [
            f"# Human Listen Control Room: {packet['baselineId']}",
            "",
            f"Generated: `{packet['generatedAt']}`",
            "",
            "This packet creates one local HTML page for the human listen decision. It combines the listen-priority review reel, source-balance A/B proof snippets, and exportable notes. It does not approve, fail, render, upload, or mutate original media.",
            "",
            "## Open",
            "",
            "```bash",
            f"open {shell_quote(paths['html'])}",
            "```",
            "",
            "## Contents",
            "",
            f"- Review reel chapters: `{packet['reviewReelChapterCount']}`",
            f"- Source-balance A/B proof pairs: `{packet['sourceBalancePairCount']}`",
            f"- Missing audio/control files: `{packet['missingFileCount']}`",
            f"- HTML: `{rel_text(paths['html'], baseline_dir)}`",
            f"- Notes template: `{rel_text(paths['notesTemplate'], baseline_dir)}`",
            f"- Post-listen notes processor: `{rel_text(paths['postNotesRoundtripCommand'], baseline_dir)}`",
            f"- Review reel M4A: `{rel_text(paths.get('reviewReelM4a'), baseline_dir)}`",
            f"- Source-balance playlist: `{rel_text(paths.get('sourceBalanceProofPlaylist'), baseline_dir)}`",
            "",
            "## Guardrail",
            "",
            "The control room exports notes only. After exporting, run `PROCESS_EPISODE_4_AUDIO_REVIEW_NOTES.command` in the baseline folder to refresh the inbox, repair planner, status board, and handoff reports. Branch inheritance remains locked until a guarded human-listen decision is recorded.",
            "",
        ]
    )


def build_open_command(html_path: str, markdown_path: str) -> str:
    return "\n".join(
        [
            "#!/bin/zsh",
            "set -euo pipefail",
            "echo 'Opening Episode 4 human listen control room...'",
            f"open {shell_quote(html_path)}",
            f"open {shell_quote(markdown_path)}",
            "",
        ]
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    baseline_id = str(manifest.get("baselineId") or "audio-baseline")
    slug = slug_for(manifest)
    generated_stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    generated_at = datetime.now(timezone.utc).isoformat()

    review_reel_json = output_path(outputs.get("latestAudioListenPriorityReviewReel"))
    source_balance_json = output_path(outputs.get("latestAudioSourceBalanceRepairPreflightAudit"))
    review = load_optional_json(review_reel_json)
    source_balance = load_optional_json(source_balance_json)
    source_pairs = source_balance_items(source_balance)

    out_dir = baseline_dir / f"audio-human-listen-control-room-{slug}-{generated_stamp}"
    out_dir.mkdir(parents=True, exist_ok=True)
    html_path = out_dir / "human-listen-control-room.html"
    json_path = out_dir / "human-listen-control-room.json"
    md_path = baseline_dir / f"audio-human-listen-control-room-{slug}-{generated_stamp}.md"
    command_path = out_dir / "open-human-listen-control-room.command"
    notes_template_path = out_dir / "human-listen-control-room-notes-template.json"

    paths = {
        "html": str(html_path),
        "json": str(json_path),
        "markdown": str(md_path),
        "openCommand": str(command_path),
        "notesTemplate": str(notes_template_path),
        "postNotesRoundtripCommand": str(baseline_dir / "PROCESS_EPISODE_4_AUDIO_REVIEW_NOTES.command"),
        "reviewReelJson": review_reel_json,
        "reviewReelHtml": output_path(outputs.get("latestAudioListenPriorityReviewReelHtml")),
        "reviewReelM4a": output_path(outputs.get("latestAudioListenPriorityReviewReelM4a")),
        "sourceBalanceAuditJson": source_balance_json,
        "sourceBalanceAuditMarkdown": output_path(outputs.get("latestAudioSourceBalanceRepairPreflightAuditMarkdown")),
        "sourceBalanceProofPlaylist": output_path(outputs.get("latestAudioSourceBalanceRepairProofPlaylist")),
        "decisionBrief": output_path(outputs.get("latestAudioHumanListenDecisionBriefMarkdown")),
    }

    tracked_files = [
        paths.get("reviewReelM4a"),
        paths.get("reviewReelJson"),
        paths.get("sourceBalanceAuditJson"),
        paths.get("sourceBalanceProofPlaylist"),
        paths.get("decisionBrief"),
    ]
    for pair in source_pairs:
        for item in (pair.get("current") or []) + (pair.get("candidates") or []):
            tracked_files.append(item.get("output"))
    missing = [file_status(path) for path in tracked_files if not file_status(path)["exists"]]

    notes_template = {
        "schema": "quipsly.audio-workbench.human-listen-control-room-notes.v1",
        "baselineId": baseline_id,
        "approvalStatusAtExport": manifest.get("approvalStatus"),
        "branchInheritanceReadyAtExport": bool(manifest.get("branchInheritanceReady")),
        "reviewer": "",
        "suggestedOverallDecision": "pending-human-listen",
        "notes": [],
    }
    write_json(notes_template_path, notes_template)

    packet = {
        "schema": SCHEMA,
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "truth": {
            "approvalStatus": manifest.get("approvalStatus"),
            "packageReadyForHumanListen": bool(manifest.get("packageReadyForHumanListen")),
            "branchInheritanceReady": bool(manifest.get("branchInheritanceReady")),
            "branchRenderReady": bool(manifest.get("branchRenderReady")),
            "originalMediaMutated": bool(manifest.get("originalMediaMutated")),
        },
        "paths": paths,
        "reviewReel": {
            "json": review_reel_json,
            "chapters": review.get("chapters") or [],
            "durationSeconds": review.get("durationSeconds"),
            "includedSnippetCount": review.get("includedSnippetCount"),
            "missingSnippetCount": review.get("missingSnippetCount"),
        },
        "sourceBalancePairs": source_pairs,
        "reviewReelChapterCount": len(review.get("chapters") or []),
        "sourceBalancePairCount": len(source_pairs),
        "missingFiles": missing,
        "missingFileCount": len(missing),
        "mutations": {
            "approvalStateChanged": False,
            "branchStateChanged": False,
            "renderAttempted": False,
            "originalMediaMutated": False,
        },
    }

    html_path.write_text(build_html(packet, baseline_dir), encoding="utf-8")
    md_path.write_text(build_markdown(packet, baseline_dir), encoding="utf-8")
    command_path.write_text(build_open_command(str(html_path), str(md_path)), encoding="utf-8")
    os.chmod(command_path, 0o755)
    packet["paths"] = paths
    write_json(json_path, packet)

    outputs["latestAudioHumanListenControlRoom"] = str(json_path)
    outputs["latestAudioHumanListenControlRoomMarkdown"] = str(md_path)
    outputs["latestAudioHumanListenControlRoomHtml"] = str(html_path)
    outputs["latestAudioHumanListenControlRoomOpenCommand"] = str(command_path)
    outputs["latestAudioHumanListenControlRoomNotesTemplate"] = str(notes_template_path)
    outputs.setdefault("audioHumanListenControlRooms", []).append(str(json_path))
    outputs.setdefault("audioHumanListenControlRoomMarkdowns", []).append(str(md_path))
    outputs["audioHumanListenControlRoomCount"] = len(outputs.get("audioHumanListenControlRooms") or [])
    write_json(manifest_path, manifest)

    print(json.dumps({
        "baselineId": baseline_id,
        "json": str(json_path),
        "markdown": str(md_path),
        "html": str(html_path),
        "openCommand": str(command_path),
        "reviewReelChapterCount": packet["reviewReelChapterCount"],
        "sourceBalancePairCount": packet["sourceBalancePairCount"],
        "missingFileCount": packet["missingFileCount"],
        "approvalStatus": manifest.get("approvalStatus"),
        "branchInheritanceReady": bool(manifest.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest.get("branchRenderReady")),
        "renderAttempted": False,
        "originalMediaMutated": False,
    }, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
