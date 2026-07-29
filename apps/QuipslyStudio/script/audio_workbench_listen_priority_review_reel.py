#!/usr/bin/env python3
"""Build a one-play listen-priority review reel from the snippet pack.

The snippet pack is excellent evidence, but forty separate files can make human
review feel like a tiny audio scavenger hunt. This script stitches the existing
review snippets into one local M4A with chapter metadata, an HTML jump console,
and a Markdown chapter list.

It only renders derived review media. It does not approve audio, fail audio,
render edit branches, upload files, or mutate original media.
"""

from __future__ import annotations

import argparse
import csv
import json
import shlex
import subprocess
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
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def timecode(seconds: float) -> str:
    seconds = max(0.0, seconds)
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = seconds % 60
    if hours:
        return f"{hours:02d}:{minutes:02d}:{secs:06.3f}"
    return f"{minutes:02d}:{secs:06.3f}"


def quote_concat_path(path: Path) -> str:
    return "file " + shlex.quote(str(path))


def run(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)


def ffprobe_duration(path: Path) -> float | None:
    try:
        proc = run([
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=nokey=1:noprint_wrappers=1",
            str(path),
        ])
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None
    try:
        return float(proc.stdout.strip())
    except ValueError:
        return None


def html_escape(value: Any) -> str:
    return (
        str(value)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#39;")
    )


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Listen-Priority Review Reel: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "This is a one-play review reel made from the existing listen-priority snippets. It is derived review media only. It does not approve v006, fail v006, unlock branch inheritance, render edit branches, upload files, or touch original media.",
        "",
        "## Current truth",
        "",
        f"- Approval status: `{report['approvalStatus']}`",
        f"- Package ready for human listen: `{str(report['packageReadyForHumanListen']).lower()}`",
        f"- Branch inheritance ready: `{str(report['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(report['branchRenderReady']).lower()}`",
        f"- Review reel M4A: `{report['reviewReelM4a']}`",
        f"- HTML jump console: `{report['html']}`",
        f"- Chapter CSV: `{report['chapterCsv']}`",
        f"- Snippets included: `{report['includedSnippetCount']}`",
        f"- Missing snippets skipped: `{report['missingSnippetCount']}`",
        f"- Duration: `{timecode(float(report['durationSeconds'] or 0.0))}`",
        "",
        "## Open",
        "",
        "```bash",
        f"open {shlex.quote(report['html'])}",
        "```",
        "",
        "## Chapters",
        "",
        "| # | Reel time | Episode time | Title | Review questions |",
        "|---:|---:|---:|---|---|",
    ]
    for chapter in report["chapters"]:
        questions = "<br>".join(html_escape(q) for q in chapter.get("listenQuestions", []))
        lines.append(
            f"| {chapter['priority']} | `{chapter['reelStartTimecode']}` | `{chapter['episodeCenterTimecode']}` | {html_escape(chapter['title'])} | {questions} |"
        )
    lines.extend(
        [
            "",
            "## Guardrails",
            "",
            f"- Approval state changed: `{str(report['approvalStateChanged']).lower()}`",
            f"- Branch state changed: `{str(report['branchStateChanged']).lower()}`",
            f"- Render attempted: `{str(report['renderAttempted']).lower()}` for derived review media only",
            f"- Original media mutated: `{str(report['originalMediaMutated']).lower()}`",
            "",
        ]
    )
    return "\n".join(lines)


def render_html(report: dict[str, Any]) -> str:
    rows = []
    for chapter in report["chapters"]:
        questions = "<br>".join(html_escape(q) for q in chapter.get("listenQuestions", []))
        reasons = "<br>".join(html_escape(r) for r in chapter.get("reasons", []))
        item_id = f"priority-{int(chapter['priority']):02d}"
        rows.append(
            f"""
            <article class=\"chapter\" id=\"{item_id}\" data-item-id=\"{item_id}\">
              <div class=\"jump-col\">
                <button onclick=\"jump({chapter['reelStartSeconds']:.3f})\">Jump</button>
                <span>#{chapter['priority']}</span>
              </div>
              <div>
                <strong>{html_escape(chapter['title'])}</strong>
                <p><span>Reel {chapter['reelStartTimecode']}</span> <span>Episode {chapter['episodeCenterTimecode']}</span> <span>{html_escape(', '.join(chapter.get('classifications') or []))}</span></p>
                <p>{questions}</p>
                <p class=\"reasons\">{reasons}</p>
                <div class=\"decision-row\">
                  <button class=\"decision pass\" onclick=\"markDecision('{item_id}','pass')\">Pass</button>
                  <button class=\"decision proof\" onclick=\"markDecision('{item_id}','needs-proof')\">Needs proof</button>
                  <button class=\"decision repair\" onclick=\"markDecision('{item_id}','needs-repair')\">Needs repair</button>
                  <span class=\"decision-state\" id=\"state-{item_id}\">undecided</span>
                </div>
                <textarea id=\"notes-{item_id}\" placeholder=\"Optional notes for this moment. What sounded wrong, or why did it pass?\" oninput=\"saveState()\"></textarea>
              </div>
            </article>
            """
        )
    review_packet = {
        "schema": "quipsly.audio-workbench.listen-priority-notes.v1",
        "sourceSurface": "listen-priority-review-reel.v1",
        "baselineId": report["baselineId"],
        "reviewReelJson": report["json"],
        "reviewReelM4a": report["reviewReelM4a"],
        "items": [
            {
                "id": f"priority-{int(chapter['priority']):02d}",
                "priority": chapter["priority"],
                "label": chapter["title"],
                "title": chapter["title"],
                "timecode": chapter["episodeCenterTimecode"],
                "sequenceTimecode": chapter["episodeCenterTimecode"],
                "sequenceStartSeconds": chapter["episodeCenterSeconds"],
                "reelStartSeconds": chapter["reelStartSeconds"],
                "reelStartTimecode": chapter["reelStartTimecode"],
                "decision": "undecided",
                "notes": "",
                "classifications": chapter.get("classifications") or [],
                "listenQuestions": chapter.get("listenQuestions") or [],
                "reasons": chapter.get("reasons") or [],
            }
            for chapter in report["chapters"]
        ],
    }
    packet_json = json.dumps(review_packet, ensure_ascii=False)
    return f"""<!doctype html>
<html>
<head>
  <meta charset=\"utf-8\" />
  <title>Episode 4 Listen-Priority Review Reel</title>
  <style>
    :root {{ color-scheme: dark; --bg:#111715; --panel:#1a241f; --ink:#f4ecd8; --muted:#b8ad96; --gold:#f0c541; --leaf:#62d488; --line:#344339; --red:#ff6767; --cyan:#66d9ef; }}
    body {{ margin:0; background:linear-gradient(135deg,#101513,#202015); color:var(--ink); font:15px/1.45 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif; }}
    main {{ max-width:1180px; margin:0 auto; padding:34px; }}
    h1 {{ font-size:34px; margin:0 0 8px; }}
    .truth,.player,.chapter,.export-box {{ background:rgba(26,36,31,.92); border:1px solid var(--line); border-radius:18px; box-shadow:0 18px 50px rgba(0,0,0,.25); }}
    .truth {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:10px; padding:16px; margin:20px 0; }}
    .truth div {{ background:#121a17; border-radius:12px; padding:10px; }}
    .truth span {{ display:block; color:var(--muted); font-size:12px; text-transform:uppercase; letter-spacing:.08em; }}
    .player {{ position:sticky; top:0; z-index:2; padding:18px; margin:20px 0; }}
    audio {{ width:100%; }}
    .export-box {{ padding:18px; margin:20px 0; display:grid; grid-template-columns:1fr auto; gap:16px; align-items:end; }}
    .export-box label {{ display:block; color:var(--muted); font-size:12px; text-transform:uppercase; letter-spacing:.08em; }}
    .export-box input {{ width:100%; margin-top:6px; color:var(--ink); background:#111815; border:1px solid var(--line); border-radius:10px; padding:10px; }}
    .export-actions {{ display:flex; gap:10px; flex-wrap:wrap; justify-content:flex-end; }}
    .chapter {{ display:grid; grid-template-columns:92px 1fr; gap:14px; padding:14px; margin:12px 0; }}
    .jump-col {{ display:flex; flex-direction:column; gap:8px; align-items:flex-start; }}
    .jump-col span {{ color:var(--gold); font-weight:900; }}
    button {{ border:0; border-radius:999px; background:var(--gold); color:#16120a; font-weight:800; padding:9px 14px; cursor:pointer; }}
    button.secondary {{ background:#26332d; color:var(--ink); border:1px solid var(--line); }}
    p {{ margin:.35rem 0; color:var(--muted); }}
    p span {{ display:inline-block; margin-right:10px; color:var(--leaf); }}
    .reasons {{ color:#d7caa8; }}
    code {{ color:var(--gold); }}
    .decision-row {{ display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-top:12px; }}
    .decision.pass {{ background:var(--leaf); }}
    .decision.proof {{ background:var(--cyan); }}
    .decision.repair {{ background:var(--red); color:#240808; }}
    .decision-state {{ color:var(--muted); font-weight:800; text-transform:uppercase; letter-spacing:.08em; font-size:12px; }}
    textarea {{ display:block; width:100%; min-height:56px; margin-top:10px; resize:vertical; color:var(--ink); background:#101715; border:1px solid var(--line); border-radius:12px; padding:10px; box-sizing:border-box; }}
    .summary {{ color:var(--gold); font-weight:900; }}
  </style>
</head>
<body>
<main>
  <h1>Episode 4 Listen-Priority Review Reel</h1>
  <p>One playthrough of the highest-risk v006 review snippets. This is review media only; it does not approve or unlock the audio spine.</p>
  <section class=\"truth\">
    <div><span>Approval</span><code>{html_escape(report['approvalStatus'])}</code></div>
    <div><span>Branch inheritance</span><code>{str(report['branchInheritanceReady']).lower()}</code></div>
    <div><span>Branch render</span><code>{str(report['branchRenderReady']).lower()}</code></div>
    <div><span>Snippets</span><code>{report['includedSnippetCount']}</code></div>
    <div><span>Duration</span><code>{timecode(float(report['durationSeconds'] or 0.0))}</code></div>
  </section>
  <section class=\"player\">
    <audio id=\"reel\" controls src=\"{html_escape(Path(report['reviewReelM4a']).name)}\"></audio>
  </section>
  <section class=\"export-box\">
    <div>
      <label for=\"reviewer\">Reviewer</label>
      <input id=\"reviewer\" value=\"Charlie or Mako\" oninput=\"saveState()\" />
      <p class=\"summary\" id=\"summary\">0 pass · 0 needs proof · 0 needs repair · {report['includedSnippetCount']} undecided</p>
      <p>Exported notes use the same guarded listen-priority schema as the existing inbox. Passing notes still do not approve automatically; they create the exact command path for the guarded decision bridge.</p>
    </div>
    <div class=\"export-actions\">
      <button class=\"secondary\" onclick=\"markAllUndecided('pass')\">Mark undecided pass</button>
      <button onclick=\"exportNotes()\">Export notes JSON</button>
    </div>
  </section>
  {''.join(rows)}
</main>
<script>
const BASE_PACKET = {packet_json};
const STORAGE_KEY = 'quipsly-review-reel-notes-' + BASE_PACKET.baselineId;
let decisions = {{}};
function jump(t) {{
  const player = document.getElementById('reel');
  player.currentTime = t;
  player.play();
}}
function markDecision(id, decision) {{
  decisions[id] = decisions[id] || {{}};
  decisions[id].decision = decision;
  updateUi();
  saveState();
}}
function markAllUndecided(decision) {{
  BASE_PACKET.items.forEach(item => {{
    decisions[item.id] = decisions[item.id] || {{}};
    if (!decisions[item.id].decision || decisions[item.id].decision === 'undecided') {{
      decisions[item.id].decision = decision;
    }}
  }});
  updateUi();
  saveState();
}}
function collectState() {{
  const reviewer = document.getElementById('reviewer').value || 'Charlie or Mako';
  BASE_PACKET.items.forEach(item => {{
    decisions[item.id] = decisions[item.id] || {{}};
    const notesEl = document.getElementById('notes-' + item.id);
    if (notesEl) decisions[item.id].notes = notesEl.value || '';
  }});
  return {{ reviewer, decisions }};
}}
function saveState() {{
  localStorage.setItem(STORAGE_KEY, JSON.stringify(collectState()));
}}
function loadState() {{
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {{
    const parsed = JSON.parse(raw);
    if (parsed.reviewer) document.getElementById('reviewer').value = parsed.reviewer;
    decisions = parsed.decisions || {{}};
    Object.entries(decisions).forEach(([id, state]) => {{
      const notesEl = document.getElementById('notes-' + id);
      if (notesEl && state.notes) notesEl.value = state.notes;
    }});
  }} catch (err) {{ console.warn('Could not restore review state', err); }}
}}
function updateUi() {{
  let pass = 0, proof = 0, repair = 0, undecided = 0;
  BASE_PACKET.items.forEach(item => {{
    const decision = (decisions[item.id] && decisions[item.id].decision) || 'undecided';
    if (decision === 'pass') pass += 1;
    else if (decision === 'needs-proof') proof += 1;
    else if (decision === 'needs-repair') repair += 1;
    else undecided += 1;
    const stateEl = document.getElementById('state-' + item.id);
    if (stateEl) stateEl.textContent = decision;
  }});
  document.getElementById('summary').textContent = `${{pass}} pass · ${{proof}} needs proof · ${{repair}} needs repair · ${{undecided}} undecided`;
}}
function suggestedDecision(items) {{
  if (items.some(item => item.decision === 'needs-repair')) return 'failed-human-listen';
  if (items.some(item => item.decision === 'needs-proof')) return 'needs-focused-proof';
  if (items.length && items.every(item => item.decision === 'pass')) return 'human-approved-for-branch-inheritance';
  return 'pending-human-listen';
}}
function exportNotes() {{
  const state = collectState();
  const items = BASE_PACKET.items.map(item => ({{
    ...item,
    decision: (state.decisions[item.id] && state.decisions[item.id].decision) || 'undecided',
    notes: (state.decisions[item.id] && state.decisions[item.id].notes) || ''
  }}));
  const packet = {{
    ...BASE_PACKET,
    exportedAt: new Date().toISOString(),
    reviewer: state.reviewer,
    suggestedDecision: suggestedDecision(items),
    items
  }};
  const blob = new Blob([JSON.stringify(packet, null, 2) + '\n'], {{type:'application/json'}});
  const stamp = new Date().toISOString().replace(/[:.]/g,'-');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `audio-listen-priority-review-reel-notes-${{BASE_PACKET.baselineId}}-${{stamp}}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}}
loadState();
updateUi();
</script>
</body>
</html>
"""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    parser.add_argument("--separator-seconds", type=float, default=0.8)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    baseline_id = str(manifest.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")

    pack_path_raw = output_path(outputs.get("latestAudioListenPrioritySnippetPack"))
    if not pack_path_raw:
        raise SystemExit("Manifest does not register latestAudioListenPrioritySnippetPack")
    pack_path = Path(pack_path_raw)
    pack = read_json(pack_path)

    out_dir = baseline_dir / f"audio-listen-priority-review-reel-{slug}-{generated_at}"
    out_dir.mkdir(parents=True, exist_ok=True)
    silence_path = out_dir / "separator-0p8s.m4a"
    concat_path = out_dir / "concat.txt"
    metadata_path = out_dir / "review-reel-chapters.ffmetadata"
    chapter_csv = out_dir / "review-reel-chapters.csv"
    temp_m4a = out_dir / "review-reel-nochapters.m4a"
    final_m4a = out_dir / "episode4-v006-listen-priority-review-reel.m4a"
    html_path = out_dir / "listen-priority-review-reel.html"
    notes_template = out_dir / "review-reel-notes-template.json"
    open_command = out_dir / "open-listen-priority-review-reel.command"
    output_json = baseline_dir / f"audio-listen-priority-review-reel-{slug}-{generated_at}.json"
    output_md = baseline_dir / f"audio-listen-priority-review-reel-{slug}-{generated_at}.md"

    snippets: list[dict[str, Any]] = []
    missing: list[dict[str, Any]] = []
    for raw in pack.get("snippets") or []:
        path = Path(str(raw.get("snippetPath") or ""))
        if raw.get("renderOk") is True and path.exists():
            snippets.append(raw)
        else:
            missing.append(raw)
    if not snippets:
        raise SystemExit("No renderable snippets found in snippet pack")

    try:
        run([
            "ffmpeg",
            "-hide_banner",
            "-y",
            "-f",
            "lavfi",
            "-i",
            f"anullsrc=channel_layout=stereo:sample_rate=48000",
            "-t",
            str(args.separator_seconds),
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            str(silence_path),
        ])
    except FileNotFoundError as exc:
        raise SystemExit("ffmpeg not found; cannot render review reel") from exc

    concat_lines: list[str] = []
    chapters: list[dict[str, Any]] = []
    cursor = 0.0
    for index, snippet in enumerate(snippets, start=1):
        snippet_path = Path(str(snippet["snippetPath"]))
        concat_lines.append(quote_concat_path(silence_path))
        cursor += args.separator_seconds
        duration = ffprobe_duration(snippet_path) or float(snippet.get("durationSeconds") or 0.0)
        chapter = {
            "priority": int(snippet.get("priority") or index),
            "title": str(snippet.get("title") or f"Snippet {index}"),
            "reelStartSeconds": cursor,
            "reelEndSeconds": cursor + duration,
            "reelStartTimecode": timecode(cursor),
            "reelEndTimecode": timecode(cursor + duration),
            "episodeCenterSeconds": float(snippet.get("centerSeconds") or 0.0),
            "episodeCenterTimecode": str(snippet.get("centerTimecode") or timecode(float(snippet.get("centerSeconds") or 0.0))),
            "episodeWindowStartTimecode": str(snippet.get("windowStartTimecode") or ""),
            "episodeWindowEndTimecode": str(snippet.get("windowEndTimecode") or ""),
            "durationSeconds": duration,
            "snippetPath": str(snippet_path),
            "classifications": snippet.get("classifications") or [],
            "listenQuestions": snippet.get("listenQuestions") or [],
            "reasons": snippet.get("reasons") or [],
        }
        chapters.append(chapter)
        concat_lines.append(quote_concat_path(snippet_path))
        cursor += duration
    concat_path.write_text("\n".join(concat_lines) + "\n", encoding="utf-8")

    metadata_lines = [";FFMETADATA1"]
    for chapter in chapters:
        metadata_lines.extend(
            [
                "[CHAPTER]",
                "TIMEBASE=1/1000",
                f"START={int(chapter['reelStartSeconds'] * 1000)}",
                f"END={int(chapter['reelEndSeconds'] * 1000)}",
                f"title={chapter['priority']:02d} {chapter['episodeCenterTimecode']} {chapter['title']}",
            ]
        )
    metadata_path.write_text("\n".join(metadata_lines) + "\n", encoding="utf-8")

    run([
        "ffmpeg",
        "-hide_banner",
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        str(concat_path),
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        str(temp_m4a),
    ])
    run([
        "ffmpeg",
        "-hide_banner",
        "-y",
        "-i",
        str(temp_m4a),
        "-i",
        str(metadata_path),
        "-map",
        "0:a",
        "-map_metadata",
        "1",
        "-c:a",
        "copy",
        "-movflags",
        "use_metadata_tags",
        str(final_m4a),
    ])

    final_duration = ffprobe_duration(final_m4a) or cursor
    with chapter_csv.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "priority",
                "reelStartSeconds",
                "reelStartTimecode",
                "reelEndSeconds",
                "episodeCenterSeconds",
                "episodeCenterTimecode",
                "title",
                "classifications",
                "snippetPath",
            ],
        )
        writer.writeheader()
        for chapter in chapters:
            row = dict(chapter)
            row["classifications"] = ";".join(chapter.get("classifications") or [])
            writer.writerow({key: row.get(key) for key in writer.fieldnames})

    report = {
        "schema": "quipsly.audio.listenPriorityReviewReel.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "approvalStatus": manifest.get("approvalStatus"),
        "packageReadyForHumanListen": bool(manifest.get("packageReadyForHumanListen")),
        "branchInheritanceReady": bool(manifest.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest.get("branchRenderReady")),
        "sourceSnippetPack": str(pack_path),
        "reviewReelM4a": str(final_m4a),
        "html": str(html_path),
        "markdown": str(output_md),
        "json": str(output_json),
        "openCommand": str(open_command),
        "notesTemplate": str(notes_template),
        "chapterCsv": str(chapter_csv),
        "ffmetadata": str(metadata_path),
        "concatList": str(concat_path),
        "includedSnippetCount": len(snippets),
        "missingSnippetCount": len(missing),
        "durationSeconds": final_duration,
        "separatorSeconds": args.separator_seconds,
        "chapters": chapters,
        "missingSnippets": missing,
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": True,
        "renderScope": "derived-review-media-only",
        "originalMediaMutated": False,
    }

    write_json(output_json, report)
    output_md.write_text(render_markdown(report) + "\n", encoding="utf-8")
    html_path.write_text(render_html(report), encoding="utf-8")
    notes_template.write_text(
        json.dumps(
            {
                "schema": "quipsly.audio-workbench.listen-priority-notes.v1",
                "sourceSurface": "listen-priority-review-reel.v1",
                "baselineId": baseline_id,
                "reviewReelJson": str(output_json),
                "reviewReelM4a": str(final_m4a),
                "exportedAt": "fill-after-human-review",
                "reviewer": "Charlie or Mako",
                "suggestedDecision": "pending-human-listen",
                "items": [
                    {
                        "id": f"priority-{int(chapter['priority']):02d}",
                        "priority": chapter["priority"],
                        "label": chapter["title"],
                        "title": chapter["title"],
                        "timecode": chapter["episodeCenterTimecode"],
                        "sequenceTimecode": chapter["episodeCenterTimecode"],
                        "sequenceStartSeconds": chapter["episodeCenterSeconds"],
                        "reelStartSeconds": chapter["reelStartSeconds"],
                        "reelStartTimecode": chapter["reelStartTimecode"],
                        "decision": "undecided",
                        "notes": "",
                        "classifications": chapter.get("classifications") or [],
                        "listenQuestions": chapter.get("listenQuestions") or [],
                        "reasons": chapter.get("reasons") or [],
                    }
                    for chapter in chapters
                ],
            },
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )
    open_command.write_text(f"#!/bin/zsh\nset -euo pipefail\nopen {shlex.quote(str(html_path))}\n", encoding="utf-8")
    open_command.chmod(0o755)

    previous_approval = manifest.get("approvalStatus")
    previous_branch_inheritance = bool(manifest.get("branchInheritanceReady"))
    previous_branch_render = bool(manifest.get("branchRenderReady"))

    outputs["latestAudioListenPriorityReviewReel"] = str(output_json)
    outputs["latestAudioListenPriorityReviewReelMarkdown"] = str(output_md)
    outputs["latestAudioListenPriorityReviewReelHtml"] = str(html_path)
    outputs["latestAudioListenPriorityReviewReelM4a"] = str(final_m4a)
    outputs["latestAudioListenPriorityReviewReelOpenCommand"] = str(open_command)
    outputs["latestAudioListenPriorityReviewReelNotesTemplate"] = str(notes_template)
    outputs["latestAudioListenPriorityReviewReelChapterCsv"] = str(chapter_csv)
    history = outputs.setdefault("audioListenPriorityReviewReels", [])
    if str(output_json) not in history:
        history.append(str(output_json))
    manifest["audioListenPriorityReviewReelCount"] = len(history)
    manifest["audioListenPriorityReviewReelLatestSnippetCount"] = len(snippets)
    manifest["audioListenPriorityReviewReelLatestMissingSnippetCount"] = len(missing)
    manifest["audioListenPriorityReviewReelLatestDurationSeconds"] = final_duration
    manifest["approvalStatus"] = previous_approval
    manifest["branchInheritanceReady"] = previous_branch_inheritance
    manifest["branchRenderReady"] = previous_branch_render
    write_json(manifest_path, manifest)

    print(str(output_json))
    print(str(output_md))
    print(str(html_path))
    print(json.dumps({
        "includedSnippetCount": len(snippets),
        "missingSnippetCount": len(missing),
        "durationSeconds": final_duration,
        "approvalStatus": previous_approval,
        "branchInheritanceReady": previous_branch_inheritance,
        "branchRenderReady": previous_branch_render,
    }, indent=2))


if __name__ == "__main__":
    main()
