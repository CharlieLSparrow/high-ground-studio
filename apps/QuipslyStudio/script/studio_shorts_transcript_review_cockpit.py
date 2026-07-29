#!/usr/bin/env python3
"""Build a transcript review cockpit for current recommended shorts.

The cockpit is a generated reviewer/agent surface over transcript-intake
workbench data. It does not create transcript truth, approve captions, mutate
media, publish, upload, schedule, or create receipts.
"""
from __future__ import annotations

import argparse
import html
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
DEFAULT_WORKBENCH_JSON = (
    DEFAULT_ROOT
    / "shorts-command-room"
    / "transcript-intake"
    / "workbench"
    / "quipsly-studio-shorts-transcript-intake-workbench.json"
)
DEFAULT_OUTPUT_DIR = DEFAULT_ROOT / "shorts-command-room" / "transcript-review-cockpit"
SCHEMA = "quipsly.studio.shorts-transcript-review-cockpit.v1"
VERSION = "2026-07-02.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""))


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def file_uri(path: Path) -> str:
    try:
        return path.expanduser().resolve().as_uri()
    except ValueError:
        return ""


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise SystemExit(
            f"Transcript intake workbench not found: {path}\n"
            "Run: script/agentctl.sh studio-shorts-transcript-intake-workbench --all"
        )
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise SystemExit(f"Expected JSON object: {path}")
    return data


def path_status(path_value: str) -> dict[str, Any]:
    path = Path(path_value) if path_value else Path()
    exists = bool(path_value and path.exists())
    return {
        "path": path_value,
        "exists": exists,
        "bytes": path.stat().st_size if exists and path.is_file() else 0,
        "fileUri": file_uri(path) if exists else "",
    }


def ledger_path_for(item: dict[str, Any]) -> Path:
    destinations = item.get("destinations") if isinstance(item.get("destinations"), dict) else {}
    normalized = destinations.get("normalizedTranscript") if isinstance(destinations.get("normalizedTranscript"), dict) else {}
    normalized_path = str(normalized.get("path") or "")
    short_id = str(item.get("shortId") or "unknown-short")
    if normalized_path:
        return Path(normalized_path).with_name(f"{short_id}-transcript-review-ledger.jsonl")
    return DEFAULT_ROOT / "shorts-command-room" / "transcript-workorders" / short_id / f"{short_id}-transcript-review-ledger.jsonl"


def read_ledger_events(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    events: list[dict[str, Any]] = []
    try:
        for line in path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            event = json.loads(line)
            if isinstance(event, dict):
                events.append(event)
    except (OSError, json.JSONDecodeError):
        return []
    return events


def review_status_for(item: dict[str, Any], events: list[dict[str, Any]]) -> str:
    if events:
        latest = events[-1]
        outcome = str(latest.get("outcome") or "")
        if outcome == "accept-for-edit-review":
            return "accepted-for-edit-review"
        if outcome == "needs-correction":
            return "needs-correction"
        if outcome == "hold":
            return "held"
    status = str(item.get("status") or "")
    if status == "transcript-sidecar-present-needs-review":
        return "normalized-sidecar-present-needs-review"
    if status == "asr-draft-present-needs-review":
        return "machine-draft-needs-review"
    return status or "unknown"


def commands_for(short_id: str) -> dict[str, str]:
    quoted_id = shell_quote(short_id)
    accept_note = shell_quote("Accepted for edit-review context. Final caption publication still needs human review.")
    correction_note = shell_quote("Machine draft needs correction before semantic/caption-aware edit use.")
    hold_note = shell_quote("Held from transcript-aware edit use until reviewed.")
    return {
        "dryRunAccept": f"script/agentctl.sh studio-shorts-transcript-review-promote --short-id {quoted_id} --outcome accept-for-edit-review --json",
        "recordAcceptForEditReview": f"script/agentctl.sh studio-shorts-transcript-review-promote --short-id {quoted_id} --record-review --outcome accept-for-edit-review --note {accept_note} --json",
        "recordNeedsCorrection": f"script/agentctl.sh studio-shorts-transcript-review-promote --short-id {quoted_id} --record-review --outcome needs-correction --note {correction_note} --json",
        "recordHold": f"script/agentctl.sh studio-shorts-transcript-review-promote --short-id {quoted_id} --record-review --outcome hold --note {hold_note} --json",
    }


def cockpit_item(item: dict[str, Any]) -> dict[str, Any]:
    short_id = str(item.get("shortId") or "unknown-short")
    destinations = item.get("destinations") if isinstance(item.get("destinations"), dict) else {}
    summary = item.get("asrDraftSummary") if isinstance(item.get("asrDraftSummary"), dict) else {}
    ledger_path = ledger_path_for(item)
    events = read_ledger_events(ledger_path)
    normalized = destinations.get("normalizedTranscript") if isinstance(destinations.get("normalizedTranscript"), dict) else {}
    draft = destinations.get("asrDraftTranscript") if isinstance(destinations.get("asrDraftTranscript"), dict) else {}
    srt = destinations.get("captionDraftSrt") if isinstance(destinations.get("captionDraftSrt"), dict) else {}
    return {
        "shortId": short_id,
        "episode": item.get("episode"),
        "title": item.get("title"),
        "status": review_status_for(item, events),
        "sourceWorkbenchStatus": item.get("status"),
        "audioSidecar": item.get("audioSidecar") if isinstance(item.get("audioSidecar"), dict) else {},
        "asrDraftTranscript": draft,
        "captionDraftSrt": srt,
        "normalizedTranscript": normalized,
        "asrDraftSummary": summary,
        "ledger": {
            **path_status(str(ledger_path)),
            "eventCount": len(events),
            "latestEvent": events[-1] if events else {},
        },
        "commands": commands_for(short_id),
        "nextSafestAction": (
            "Use normalized transcript for edit-review context; final captions still need explicit review."
            if normalized.get("exists")
            else "Listen to the audio and ASR draft, then accept for edit review, mark needs-correction, or hold."
            if draft.get("exists")
            else "Create ASR/manual transcript evidence before transcript-aware review."
        ),
        "truth": "Transcript review cockpit item only. It is not final caption approval, publication, upload, schedule, source mutation, or receipt truth.",
    }


def build_board(workbench_path: Path, output_dir: Path) -> dict[str, Any]:
    workbench = read_json(workbench_path)
    raw_items = [item for item in workbench.get("items", []) if isinstance(item, dict)]
    items = [cockpit_item(item) for item in raw_items]
    counts = {
        "items": len(items),
        "acceptedForEditReview": sum(1 for item in items if item.get("status") == "accepted-for-edit-review"),
        "normalizedSidecarPresentNeedsReview": sum(1 for item in items if item.get("status") == "normalized-sidecar-present-needs-review"),
        "machineDraftNeedsReview": sum(1 for item in items if item.get("status") == "machine-draft-needs-review"),
        "needsCorrection": sum(1 for item in items if item.get("status") == "needs-correction"),
        "held": sum(1 for item in items if item.get("status") == "held"),
        "ledgerEvents": sum(int(item.get("ledger", {}).get("eventCount") or 0) for item in items),
        "finalCaptionApproval": False,
        "externalPublishing": False,
        "receiptTruthCreated": False,
    }
    return {
        "schema": SCHEMA,
        "version": VERSION,
        "generatedAt": iso_now(),
        "sourceWorkbenchJson": str(workbench_path),
        "outputDir": str(output_dir),
        "counts": counts,
        "items": items,
        "nextSafestAction": next_action(counts),
        "truth": "Generated transcript review cockpit. It records no new review by itself and does not mutate media, publish, upload, schedule, approve final captions, or create receipts.",
    }


def next_action(counts: dict[str, Any]) -> str:
    machine = int(counts.get("machineDraftNeedsReview") or 0)
    if machine:
        return f"Review {machine} machine transcript drafts: accept for edit review, mark needs-correction, or hold."
    correction = int(counts.get("needsCorrection") or 0)
    if correction:
        return f"Correct {correction} transcript drafts before using them for semantic/caption-aware edit decisions."
    held = int(counts.get("held") or 0)
    if held:
        return f"Resolve {held} held transcript drafts when the missing context is available."
    return "Use accepted normalized transcripts as edit-review context; final captions still need explicit approval before publishing."


def render_markdown(board: dict[str, Any]) -> str:
    lines = [
        "# Studio shorts transcript review cockpit",
        "",
        f"Generated: `{board.get('generatedAt')}`",
        f"Source workbench: `{board.get('sourceWorkbenchJson')}`",
        "",
        f"Truth boundary: {board.get('truth')}",
        "",
        f"Next safest action: {board.get('nextSafestAction')}",
        "",
        "## Counts",
        "",
    ]
    for key, value in (board.get("counts") or {}).items():
        lines.append(f"- {key}: `{value}`")
    lines.extend(["", "## Review cards", ""])
    for item in board.get("items", []):
        if not isinstance(item, dict):
            continue
        summary = item.get("asrDraftSummary") if isinstance(item.get("asrDraftSummary"), dict) else {}
        lines.extend(
            [
                f"### {item.get('shortId')} · Episode {item.get('episode')}",
                "",
                f"- Status: `{item.get('status')}`",
                f"- Words/segments: `{summary.get('wordCountApprox') or 0}` / `{summary.get('segmentCount') or 0}`",
                f"- Sample: {summary.get('sample') or ''}",
                f"- Normalized transcript: `{item.get('normalizedTranscript', {}).get('path')}` exists=`{item.get('normalizedTranscript', {}).get('exists')}`",
                f"- Ledger events: `{item.get('ledger', {}).get('eventCount') or 0}`",
                f"- Next: {item.get('nextSafestAction')}",
            ]
        )
        for label, command in (item.get("commands") or {}).items():
            lines.append(f"- {label}: `{command}`")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def render_html(board: dict[str, Any]) -> str:
    metrics = "".join(
        f"<div><strong>{esc(value)}</strong><span>{esc(key)}</span></div>"
        for key, value in (board.get("counts") or {}).items()
    )
    cards = "".join(render_card(item) for item in board.get("items", []) if isinstance(item, dict))
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Quipsly Studio Transcript Review Cockpit</title>
  <style>
    :root {{ color-scheme: dark; --soil:#140f0b; --moss:#17251b; --grove:#24442c; --leaf:#86e29a; --honey:#f2cb55; --cream:#fff0d1; --clay:#d87962; --water:#7bdbe7; --line:rgba(255,240,209,.16); }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:var(--cream); background:radial-gradient(circle at 10% -10%,rgba(134,226,154,.22),transparent 32%),radial-gradient(circle at 95% 5%,rgba(242,203,85,.16),transparent 28%),linear-gradient(135deg,var(--moss),var(--soil)); }}
    main {{ width:min(1500px,calc(100vw - 36px)); margin:0 auto; padding:34px 0 90px; }}
    header,.truth,.card {{ border:1px solid var(--line); border-radius:30px; background:rgba(255,240,209,.07); box-shadow:0 24px 80px rgba(0,0,0,.28); }}
    header,.truth {{ padding:28px; margin-bottom:16px; }}
    .eyebrow {{ margin:0 0 8px; color:var(--honey); letter-spacing:.18em; text-transform:uppercase; font-size:.75rem; font-weight:950; }}
    h1 {{ margin:0 0 10px; font-size:clamp(2.4rem,6vw,5.5rem); line-height:.9; }}
    h2 {{ margin:0; }}
    p,dd,dt {{ color:#decfb0; line-height:1.45; }}
    code {{ color:#ffeaa3; overflow-wrap:anywhere; }}
    .metrics {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:10px; margin-top:18px; }}
    .metrics div {{ border:1px solid var(--line); border-radius:18px; padding:13px; background:rgba(0,0,0,.22); }}
    .metrics strong {{ display:block; color:var(--leaf); font-size:2rem; }}
    .metrics span {{ color:#cdbf9e; text-transform:uppercase; letter-spacing:.08em; font-size:.7rem; font-weight:900; }}
    .grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(390px,1fr)); gap:14px; }}
    .card {{ padding:18px; }}
    .card-head {{ display:flex; justify-content:space-between; gap:14px; align-items:flex-start; }}
    .status {{ border:1px solid rgba(242,203,85,.32); border-radius:999px; color:var(--honey); padding:7px 10px; background:rgba(242,203,85,.12); font-size:.72rem; font-weight:950; white-space:nowrap; }}
    audio {{ width:100%; margin:12px 0; }}
    .draft {{ border:1px solid rgba(134,226,154,.24); border-radius:18px; padding:13px; margin:10px 0 14px; background:rgba(134,226,154,.08); }}
    .draft strong,.draft span {{ display:block; }}
    .draft span {{ color:#cdbf9e; font-size:.82rem; margin-top:3px; }}
    .draft p {{ margin:9px 0 0; color:#f3e3c0; }}
    .commands {{ display:grid; gap:8px; margin-top:12px; }}
    .command {{ display:flex; gap:8px; align-items:center; }}
    .command code {{ flex:1; display:block; padding:10px; border-radius:14px; background:rgba(0,0,0,.34); border:1px solid var(--line); }}
    button,a.button {{ border:1px solid var(--line); border-radius:999px; padding:8px 10px; background:rgba(0,0,0,.24); color:var(--cream); text-decoration:none; font-weight:900; cursor:pointer; white-space:nowrap; }}
    button:hover,a.button:hover {{ color:var(--honey); border-color:rgba(242,203,85,.55); }}
    .toast {{ position:fixed; right:20px; bottom:20px; padding:12px 16px; border-radius:16px; background:rgba(23,37,27,.96); border:1px solid rgba(134,226,154,.42); color:var(--leaf); opacity:0; transform:translateY(8px); transition:.2s; }}
    .toast.show {{ opacity:1; transform:translateY(0); }}
  </style>
</head>
<body>
<main>
  <header>
    <p class="eyebrow">Quipsly Studio · transcript review</p>
    <h1>Review the words before the words steer the edit.</h1>
    <p>This cockpit makes ASR drafts fast to accept, hold, or send back for correction without pretending machine output is final truth.</p>
    <div class="metrics">{metrics}</div>
  </header>
  <section class="truth"><p><strong>Truth boundary:</strong> {esc(board.get('truth'))}</p><p><strong>Next:</strong> {esc(board.get('nextSafestAction'))}</p></section>
  <section class="grid">{cards}</section>
</main>
<div class="toast" id="toast">Copied</div>
<script>
const toast = document.getElementById('toast');
document.querySelectorAll('[data-copy]').forEach((button) => {{
  button.addEventListener('click', async () => {{
    const value = button.getAttribute('data-copy') || '';
    try {{ await navigator.clipboard.writeText(value); toast.textContent = 'Copied command'; }} catch (error) {{ toast.textContent = 'Copy failed'; }}
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 1400);
  }});
}});
</script>
</body>
</html>
"""


def render_card(item: dict[str, Any]) -> str:
    summary = item.get("asrDraftSummary") if isinstance(item.get("asrDraftSummary"), dict) else {}
    audio = item.get("audioSidecar") if isinstance(item.get("audioSidecar"), dict) else {}
    normalized = item.get("normalizedTranscript") if isinstance(item.get("normalizedTranscript"), dict) else {}
    ledger = item.get("ledger") if isinstance(item.get("ledger"), dict) else {}
    audio_control = f"<audio controls preload=\"metadata\" src=\"{esc(audio.get('fileUri'))}\"></audio>" if audio.get("fileUri") else ""
    commands = "".join(
        f"<div class=\"command\"><code>{esc(command)}</code><button data-copy=\"{esc(command)}\">Copy</button></div>"
        for command in (item.get("commands") or {}).values()
        if command
    )
    return f"""
<article class="card">
  <div class="card-head">
    <div>
      <p class="eyebrow">Episode {esc(item.get('episode'))}</p>
      <h2>{esc(item.get('shortId'))}</h2>
      <p>{esc(item.get('title') or '')}</p>
    </div>
    <span class="status">{esc(item.get('status'))}</span>
  </div>
  {audio_control}
  <div class="draft">
    <strong>ASR draft</strong>
    <span>{esc(summary.get('wordCountApprox') or 0)} words · {esc(summary.get('segmentCount') or 0)} segments · {esc(summary.get('model') or '')}</span>
    <p>{esc(summary.get('sample') or '')}</p>
  </div>
  <p><strong>Normalized transcript:</strong> {esc('ready' if normalized.get('exists') else 'not promoted yet')}</p>
  <p><strong>Ledger events:</strong> {esc(ledger.get('eventCount') or 0)}</p>
  <p><strong>Next:</strong> {esc(item.get('nextSafestAction'))}</p>
  <div class="commands">{commands}</div>
</article>
"""


def write_outputs(board: dict[str, Any], output_dir: Path, basename: str) -> dict[str, str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / f"{basename}.json"
    md_path = output_dir / f"{basename}.md"
    html_path = output_dir / f"{basename}.html"
    board["artifactPaths"] = {
        "folder": str(output_dir),
        "json": str(json_path),
        "markdown": str(md_path),
        "html": str(html_path),
    }
    json_path.write_text(json.dumps(board, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    md_path.write_text(render_markdown(board), encoding="utf-8")
    html_path.write_text(render_html(board), encoding="utf-8")
    return board["artifactPaths"]


def main() -> int:
    parser = argparse.ArgumentParser(description="Build the Studio shorts transcript review cockpit.")
    parser.add_argument("--workbench", default=str(DEFAULT_WORKBENCH_JSON), help="Transcript intake workbench JSON.")
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR), help="Output folder.")
    parser.add_argument("--basename", default="quipsly-studio-shorts-transcript-review-cockpit")
    parser.add_argument("--format", choices=["markdown", "json", "html", "all"], default="markdown")
    parser.add_argument("--markdown", dest="format", action="store_const", const="markdown")
    parser.add_argument("--json", dest="format", action="store_const", const="json")
    parser.add_argument("--html", dest="format", action="store_const", const="html")
    parser.add_argument("--all", dest="format", action="store_const", const="all")
    args = parser.parse_args()

    output_dir = Path(args.output_dir).expanduser()
    board = build_board(Path(args.workbench).expanduser(), output_dir)
    paths = write_outputs(board, output_dir, args.basename)
    if args.format == "json":
        print(json.dumps(board, indent=2, sort_keys=True))
    elif args.format == "html":
        print(render_html(board), end="")
    elif args.format == "all":
        print(json.dumps({"ok": True, "artifactPaths": paths, "truth": board["truth"]}, indent=2, sort_keys=True))
    else:
        print(render_markdown(board), end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
