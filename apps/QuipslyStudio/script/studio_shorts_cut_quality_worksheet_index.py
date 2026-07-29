#!/usr/bin/env python3
"""Index versioned Studio shorts cut-quality worksheets.

The index makes worksheet evidence visible without treating notes as approval.
It scans local worksheet JSON files, summarizes field completion, and points
reviewers toward the next safest action.
"""
from __future__ import annotations

import argparse
import html
import json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
DEFAULT_WORKSHEET_ROOT = DEFAULT_ROOT / "shorts-command-room" / "cut-quality-worksheets"
DEFAULT_OUTPUT_DIR = DEFAULT_ROOT / "shorts-command-room" / "cut-quality-worksheets" / "index"
DEFAULT_BASENAME = "quipsly-studio-shorts-cut-quality-worksheet-index"
SCHEMA = "quipsly.studio.shorts-cut-quality-worksheet-index.v1"
VERSION = "2026-07-02.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""))


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def read_json(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return data if isinstance(data, dict) else {}


def note_fields(notes: list[dict[str, Any]]) -> set[str]:
    return {
        str(note.get("field") or "")
        for note in notes
        if note.get("kind") == "review-evidence" and str(note.get("field") or "")
    }


def field_state(fields: list[Any], notes: list[dict[str, Any]]) -> dict[str, Any]:
    normalized = [field for field in fields if isinstance(field, dict)]
    fields_with_notes = note_fields(notes)
    empty: list[str] = []
    filled: list[str] = []
    for field in normalized:
        field_id = str(field.get("id") or field.get("label") or "unknown")
        note = str(field.get("note") or "").strip()
        status = str(field.get("status") or "").strip().lower()
        if note or field_id in fields_with_notes or status not in {"", "empty"}:
            filled.append(field_id)
        else:
            empty.append(field_id)
    return {
        "fieldCount": len(normalized),
        "filledCount": len(filled),
        "emptyCount": len(empty),
        "filledFields": filled,
        "emptyFields": empty,
        "reviewEvidenceNoteCount": len([note for note in notes if note.get("kind") == "review-evidence"]),
        "systemCheckNoteCount": len([note for note in notes if note.get("kind") == "system-check"]),
    }


def worksheet_summary(path: Path, root: Path, notes_by_short: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
    data = read_json(path)
    short_id = str(data.get("shortId") or path.parent.name)
    notes = notes_by_short.get(short_id, [])
    state = field_state(data.get("fields", []) if isinstance(data.get("fields"), list) else [], notes)
    completion = "not-started"
    if state["filledCount"] and state["emptyCount"]:
        completion = "in-progress"
    elif state["filledCount"] and not state["emptyCount"]:
        completion = "filled"
    return {
        "shortId": short_id,
        "path": str(path),
        "relativePath": relative(path, root),
        "generatedAt": data.get("generatedAt") or "",
        "reviewer": data.get("reviewer") or "",
        "episode": data.get("episode"),
        "episodeVersion": data.get("episodeVersion"),
        "title": data.get("title"),
        "readinessLevel": data.get("readinessLevel"),
        "transcriptStatus": data.get("transcriptStatus"),
        "completion": completion,
        **state,
        "safeCommands": {
            "openMarkdown": f"open {shell_quote(str(path.with_suffix('.md')))}" if path.with_suffix(".md").exists() else "",
            "openHtml": f"open {shell_quote(str(path.with_suffix('.html')))}" if path.with_suffix(".html").exists() else "",
            "reveal": f"open -R {shell_quote(str(path))}",
            "nextTarget": f"script/agentctl.sh studio-shorts-cut-quality-next --short-id {shell_quote(short_id)}",
            "newWorksheet": f"script/agentctl.sh studio-shorts-cut-quality-worksheet --short-id {shell_quote(short_id)}",
            "addHookNote": f"script/agentctl.sh studio-shorts-cut-quality-note --short-id {shell_quote(short_id)} --field hook --note '<specific hook evidence>'",
        },
        "truth": "Worksheet summary only. It is not review approval, edit mutation, export proof, publication truth, or receipt truth.",
    }


def relative(path: Path, root: Path) -> str:
    try:
        return str(path.relative_to(root))
    except ValueError:
        return str(path)


def note_summary(path: Path) -> dict[str, Any]:
    data = read_json(path)
    if data.get("schema") != "quipsly.studio.shorts-cut-quality-note.v1":
        return {}
    return {
        "shortId": data.get("shortId"),
        "field": data.get("field"),
        "kind": data.get("kind"),
        "reviewer": data.get("reviewer"),
        "generatedAt": data.get("generatedAt"),
        "path": str(path),
        "note": data.get("note"),
    }


def build_index(worksheet_root: Path, output_dir: Path) -> dict[str, Any]:
    notes = [
        note
        for note in (note_summary(path) for path in sorted(worksheet_root.rglob("*-cut-quality-note.json")))
        if note
    ]
    notes_by_short: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for note in notes:
        notes_by_short[str(note.get("shortId") or "unknown-short")].append(note)
    worksheets = [
        worksheet_summary(path, worksheet_root, notes_by_short)
        for path in sorted(worksheet_root.rglob("*-cut-quality-worksheet.json"))
        if output_dir not in path.parents
    ]
    worksheets.sort(key=lambda item: (str(item.get("shortId") or ""), str(item.get("generatedAt") or "")))
    by_short: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for worksheet in worksheets:
        by_short[str(worksheet.get("shortId") or "unknown-short")].append(worksheet)
    latest = [items[-1] for _, items in sorted(by_short.items())]
    completion_counts = Counter(item.get("completion") for item in latest)
    transcript_counts = Counter(item.get("transcriptStatus") for item in latest)
    return {
        "schema": SCHEMA,
        "version": VERSION,
        "generatedAt": iso_now(),
        "worksheetRoot": str(worksheet_root),
        "outputDir": str(output_dir),
        "counts": {
            "worksheets": len(worksheets),
            "notes": len(notes),
            "reviewEvidenceNotes": len([note for note in notes if note.get("kind") == "review-evidence"]),
            "systemCheckNotes": len([note for note in notes if note.get("kind") == "system-check"]),
            "shortsWithWorksheets": len(by_short),
            "latestNotStarted": completion_counts.get("not-started", 0),
            "latestInProgress": completion_counts.get("in-progress", 0),
            "latestFilled": completion_counts.get("filled", 0),
            "latestMissingWordEvidence": transcript_counts.get("missing-word-evidence", 0),
            "latestTimedCaptionsAvailable": transcript_counts.get("timed-captions-available", 0),
            "approvalCreated": False,
            "externalPublishing": False,
            "receiptTruthCreated": False,
        },
        "latestByShort": latest,
        "worksheets": worksheets,
        "notes": notes,
        "nextSafestAction": next_action(latest),
        "truth": "Read-only worksheet index. It records no review decision, edits no timeline, exports nothing, publishes nothing, runs no ASR, mutates no media, overwrites no worksheet, deletes nothing, and creates no receipt truth.",
    }


def next_action(latest: list[dict[str, Any]]) -> str:
    for item in latest:
        if item.get("completion") == "not-started":
            return f"Open worksheet for {item.get('shortId')} and capture watch/listen evidence before evidence drafting."
    for item in latest:
        if item.get("completion") == "in-progress":
            return f"Finish empty fields for {item.get('shortId')} or convert specific notes into an evidence draft."
    if latest:
        return "Review filled worksheets and convert specific notes into evidence drafts before recording local intent."
    return "Create the first cut-quality worksheet with script/agentctl.sh studio-shorts-cut-quality-worksheet."


def render_markdown(index: dict[str, Any]) -> str:
    lines = [
        "# Studio shorts cut-quality worksheet index",
        "",
        f"Generated: `{index.get('generatedAt')}`",
        f"Worksheet root: `{index.get('worksheetRoot')}`",
        "",
        index.get("truth", ""),
        "",
        f"Next safest action: {index.get('nextSafestAction')}",
        "",
        "## Counts",
        "",
    ]
    for key, value in index.get("counts", {}).items():
        lines.append(f"- {key}: `{value}`")
    lines.extend(["", "## Latest worksheet by short", ""])
    for item in index.get("latestByShort", []):
        lines.extend([
            f"### {item.get('shortId')} - {item.get('completion')}",
            "",
            f"- Reviewer: `{item.get('reviewer')}`",
            f"- Episode/version: `Episode {item.get('episode')}` / `{item.get('episodeVersion')}`",
            f"- Transcript: `{item.get('transcriptStatus')}`",
            f"- Fields: `{item.get('filledCount')}` filled / `{item.get('emptyCount')}` empty",
            f"- Review evidence notes: `{item.get('reviewEvidenceNoteCount')}`",
            f"- Empty fields: {', '.join(item.get('emptyFields') or []) or 'none'}",
            f"- Worksheet: `{item.get('path')}`",
        ])
        for label, command in (item.get("safeCommands") or {}).items():
            if command:
                lines.append(f"- {label}: `{command}`")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def render_html(index: dict[str, Any]) -> str:
    metrics = "".join(
        f"<div><strong>{esc(value)}</strong><span>{esc(key)}</span></div>"
        for key, value in index.get("counts", {}).items()
        if key in {"worksheets", "shortsWithWorksheets", "latestNotStarted", "latestInProgress", "latestFilled"}
    )
    rows = "\n".join(render_row(item) for item in index.get("latestByShort", []))
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Cut-quality worksheet index</title>
  <style>
    :root {{ color-scheme: dark; --soil:#17110c; --moss:#1a2b20; --cream:#fff0d0; --honey:#f2c94c; --fern:#8ee39a; --water:#78dbe6; --line:rgba(255,240,208,.16); }}
    body {{ margin:0; color:var(--cream); font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; background:linear-gradient(135deg,var(--moss),var(--soil)); }}
    main {{ width:min(1320px,calc(100vw - 32px)); margin:0 auto; padding:32px 0 88px; }}
    header,.truth,.card {{ border:1px solid var(--line); border-radius:26px; background:rgba(255,240,208,.07); box-shadow:0 20px 70px rgba(0,0,0,.25); }}
    header {{ padding:28px; margin-bottom:14px; }}
    h1 {{ margin:0 0 8px; font-size:clamp(34px,5vw,64px); line-height:.95; letter-spacing:-.045em; }}
    h2 {{ margin:0 0 8px; color:var(--honey); letter-spacing:.14em; text-transform:uppercase; font-size:13px; }}
    .metrics {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px; margin-top:18px; }}
    .metrics div {{ border:1px solid var(--line); border-radius:18px; padding:14px; background:rgba(0,0,0,.18); }}
    .metrics strong {{ display:block; font-size:28px; color:var(--fern); }}
    .metrics span {{ display:block; color:rgba(255,240,208,.65); font-size:12px; letter-spacing:.1em; text-transform:uppercase; }}
    .truth,.card {{ padding:18px; margin-bottom:12px; }}
    .grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(340px,1fr)); gap:12px; margin-top:14px; }}
    .pill {{ border:1px solid var(--line); border-radius:999px; padding:6px 9px; display:inline-block; margin:3px; background:rgba(0,0,0,.2); }}
    button {{ appearance:none; border:1px solid var(--line); border-radius:999px; background:rgba(120,219,230,.14); color:var(--cream); padding:8px 11px; margin:4px 4px 0 0; cursor:pointer; }}
    code {{ color:var(--water); overflow-wrap:anywhere; }}
  </style>
</head>
<body>
<main>
  <header>
    <h2>Quipsly Studio</h2>
    <h1>Worksheet index</h1>
    <p>Latest cut-quality worksheets, completion state, and next safe reviewer actions.</p>
    <div class="metrics">{metrics}</div>
  </header>
  <section class="truth"><strong>Truth boundary:</strong> {esc(index.get('truth'))}<br><strong>Next:</strong> {esc(index.get('nextSafestAction'))}</section>
  <section class="grid">{rows}</section>
</main>
<script>
document.querySelectorAll('button[data-copy]').forEach((button) => {{
  button.addEventListener('click', async () => {{
    await navigator.clipboard.writeText(button.dataset.copy || '');
    const old = button.textContent;
    button.textContent = 'Copied';
    setTimeout(() => button.textContent = old, 900);
  }});
}});
</script>
</body>
</html>
"""


def render_row(item: dict[str, Any]) -> str:
    commands = "".join(
        f"<button type='button' data-copy='{esc(command)}'>{esc(label)}</button>"
        for label, command in (item.get("safeCommands") or {}).items()
        if command
    )
    empty = ", ".join(item.get("emptyFields") or []) or "none"
    return f"""
<article class="card">
  <h2>{esc(item.get('shortId'))}</h2>
  <p>{esc(item.get('title'))}</p>
  <span class="pill">{esc(item.get('completion'))}</span>
  <span class="pill">{esc(item.get('filledCount'))} filled</span>
  <span class="pill">{esc(item.get('emptyCount'))} empty</span>
  <span class="pill">transcript {esc(item.get('transcriptStatus'))}</span>
  <p>Empty: {esc(empty)}</p>
  <p><code>{esc(item.get('path'))}</code></p>
  {commands}
</article>
"""


def write_outputs(index: dict[str, Any], output_dir: Path, basename: str, mode: str) -> dict[str, str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    paths = {
        "json": output_dir / f"{basename}.json",
        "markdown": output_dir / f"{basename}.md",
        "html": output_dir / f"{basename}.html",
    }
    if mode in {"json", "all"}:
        payload = dict(index)
        payload["artifactPaths"] = {key: str(path) for key, path in paths.items()}
        paths["json"].write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
    if mode in {"markdown", "all"}:
        paths["markdown"].write_text(render_markdown(index), encoding="utf-8")
    if mode in {"html", "all"}:
        paths["html"].write_text(render_html(index), encoding="utf-8")
    return {key: str(path) for key, path in paths.items()}


def main() -> None:
    parser = argparse.ArgumentParser(description="Index cut-quality worksheets.")
    parser.add_argument("--worksheet-root", default=str(DEFAULT_WORKSHEET_ROOT), help="Worksheet root folder.")
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR), help="Output directory.")
    parser.add_argument("--basename", default=DEFAULT_BASENAME, help="Output basename.")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--json", action="store_true", help="Write JSON only.")
    group.add_argument("--markdown", action="store_true", help="Write Markdown only.")
    group.add_argument("--html", action="store_true", help="Write HTML only.")
    group.add_argument("--all", action="store_true", help="Write JSON, Markdown, and HTML.")
    args = parser.parse_args()

    mode = "all" if args.all or not (args.json or args.markdown or args.html) else ("json" if args.json else "markdown" if args.markdown else "html")
    index = build_index(Path(args.worksheet_root).expanduser(), Path(args.output_dir).expanduser())
    paths = write_outputs(index, Path(args.output_dir).expanduser(), args.basename, mode)
    print(json.dumps({
        "ok": True,
        "artifactPaths": {"folder": str(Path(args.output_dir).expanduser()), **paths},
        "counts": index.get("counts", {}),
        "nextSafestAction": index.get("nextSafestAction"),
        "truth": index.get("truth"),
    }, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
