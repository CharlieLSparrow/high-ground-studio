#!/usr/bin/env python3
"""Preview an evidence draft from cut-quality worksheet notes.

This command reads the worksheet index and turns any captured review-evidence
field notes into a local preview packet. It does not record local review intent,
edit timelines, export media, publish, or create platform receipt truth.
"""
from __future__ import annotations

import argparse
import html
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
DEFAULT_INDEX_JSON = (
    DEFAULT_ROOT
    / "shorts-command-room"
    / "cut-quality-worksheets"
    / "index"
    / "quipsly-studio-shorts-cut-quality-worksheet-index.json"
)
DEFAULT_OUTPUT_ROOT = DEFAULT_ROOT / "shorts-command-room" / "cut-quality-evidence-previews"
SCHEMA = "quipsly.studio.shorts-cut-quality-evidence-preview.v1"
VERSION = "2026-07-02.v1"

FIELD_TO_DRAFT_ARG = {
    "hook": "--hook-note",
    "cadence": "--cadence-note",
    "jCutLCut": "--meaning-note",
    "jumpCutCover": "--risk-tradeoff-note",
    "reactionBeat": "--meaning-note",
    "captionPlan": "--caption-note",
    "cropFraming": "--framing-note",
    "audioFeel": "--audio-note",
    "endingPayoff": "--ending-note",
    "platformFit": "--platform-fit-note",
    "riskTradeoff": "--risk-tradeoff-note",
}


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""))


def slug(value: str, fallback: str = "short") -> str:
    clean = "".join(ch.lower() if ch.isalnum() else "-" for ch in value).strip("-")
    while "--" in clean:
        clean = clean.replace("--", "-")
    return clean or fallback


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise SystemExit(
            f"Worksheet index JSON not found: {path}\n"
            "Run: script/agentctl.sh studio-shorts-cut-quality-worksheet-index --all"
        )
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise SystemExit(f"Expected JSON object: {path}")
    return data


def select_short(index: dict[str, Any], short_id: str) -> dict[str, Any]:
    latest = [item for item in index.get("latestByShort", []) if isinstance(item, dict)]
    if short_id:
        for item in latest:
            if str(item.get("shortId") or "") == short_id:
                return item
        raise SystemExit(f"Short not found in worksheet index: {short_id}")
    for item in latest:
        if int(item.get("reviewEvidenceNoteCount") or 0) > 0:
            return item
    if latest:
        return latest[0]
    raise SystemExit("Worksheet index has no shorts. Create a worksheet first.")


def notes_for_short(index: dict[str, Any], short_id: str) -> list[dict[str, Any]]:
    notes = [
        note
        for note in index.get("notes", [])
        if isinstance(note, dict)
        and str(note.get("shortId") or "") == short_id
        and note.get("kind") == "review-evidence"
    ]
    notes.sort(key=lambda note: str(note.get("generatedAt") or ""))
    return notes


def note_by_field(notes: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for note in notes:
        grouped.setdefault(str(note.get("field") or "unknown"), []).append(note)
    return grouped


def summarize_notes(notes: list[dict[str, Any]]) -> str:
    if not notes:
        return "No review-evidence notes exist yet. Watch/listen and capture field notes before creating a useful evidence draft."
    parts = []
    for note in notes[:6]:
        field = note.get("field") or "field"
        text = " ".join(str(note.get("note") or "").split())
        if len(text) > 180:
            text = text[:177].rstrip() + "..."
        parts.append(f"{field}: {text}")
    return " | ".join(parts)


def draft_command(short_id: str, notes: list[dict[str, Any]], outcome: str) -> str:
    if not notes:
        return ""
    grouped = note_by_field(notes)
    command = [
        "script/agentctl.sh",
        "studio-recommended-short-evidence-draft",
        "--short-id",
        shell_quote(short_id),
        "--outcome",
        outcome,
        "--summary",
        shell_quote(summarize_notes(notes)),
    ]
    used_args: set[str] = set()
    for field, field_notes in grouped.items():
        arg = FIELD_TO_DRAFT_ARG.get(field)
        if not arg or arg in used_args:
            continue
        used_args.add(arg)
        combined = " ".join(str(note.get("note") or "").strip() for note in field_notes if note.get("note")).strip()
        if combined:
            command.extend([arg, shell_quote(combined)])
    return " ".join(command)


def build_preview(index_path: Path, output_root: Path, short: dict[str, Any], notes: list[dict[str, Any]], outcome: str, reviewer: str) -> dict[str, Any]:
    short_id = str(short.get("shortId") or "unknown-short")
    folder = output_root / slug(short_id)
    basename = f"{stamp()}-{slug(short_id)}-evidence-preview"
    status = "ready-for-evidence-draft" if notes else "needs-review-evidence-notes"
    paths = {
        "folder": str(folder),
        "json": str(folder / f"{basename}.json"),
        "markdown": str(folder / f"{basename}.md"),
        "html": str(folder / f"{basename}.html"),
    }
    return {
        "schema": SCHEMA,
        "version": VERSION,
        "generatedAt": iso_now(),
        "reviewer": reviewer,
        "sourceWorksheetIndexJson": str(index_path),
        "shortId": short_id,
        "episode": short.get("episode"),
        "episodeVersion": short.get("episodeVersion"),
        "title": short.get("title"),
        "transcriptStatus": short.get("transcriptStatus"),
        "completion": short.get("completion"),
        "status": status,
        "outcome": outcome,
        "reviewEvidenceNoteCount": len(notes),
        "notes": notes,
        "summary": summarize_notes(notes),
        "commandPreview": draft_command(short_id, notes, outcome),
        "safeCommands": {
            "openWorksheet": (short.get("safeCommands") or {}).get("openMarkdown", ""),
            "addHookNote": (short.get("safeCommands") or {}).get("addHookNote", ""),
            "indexWorksheets": "script/agentctl.sh studio-shorts-cut-quality-worksheet-index --all",
        },
        "artifactPaths": paths,
        "nextSafestAction": (
            "Inspect the command preview, then run it only if the evidence is specific enough."
            if notes
            else "Capture at least one review-evidence field note before creating an evidence draft."
        ),
        "truth": "Local evidence preview only. It does not record a review decision, edit a timeline, export media, publish, run ASR, mutate media, overwrite prior previews, or create receipt truth.",
    }


def render_markdown(payload: dict[str, Any]) -> str:
    lines = [
        "# Cut-quality evidence preview",
        "",
        f"- Short: `{payload.get('shortId')}`",
        f"- Episode/version: `Episode {payload.get('episode')}` / `{payload.get('episodeVersion')}`",
        f"- Status: `{payload.get('status')}`",
        f"- Outcome preview: `{payload.get('outcome')}`",
        f"- Review evidence notes: `{payload.get('reviewEvidenceNoteCount')}`",
        "",
        payload.get("truth", ""),
        "",
        f"Next safest action: {payload.get('nextSafestAction')}",
        "",
        "## Summary",
        "",
        str(payload.get("summary") or ""),
        "",
        "## Notes",
        "",
    ]
    for note in payload.get("notes", []):
        lines.extend([
            f"### {note.get('field')}",
            "",
            f"- Reviewer: `{note.get('reviewer')}`",
            f"- Generated: `{note.get('generatedAt')}`",
            "",
            str(note.get("note") or ""),
            "",
        ])
    lines.extend(["## Command preview", ""])
    command = payload.get("commandPreview") or "No command preview until review-evidence notes exist."
    lines.append(f"`{command}`")
    lines.extend(["", "## Safe commands", ""])
    for label, command in (payload.get("safeCommands") or {}).items():
        if command:
            lines.append(f"- {label}: `{command}`")
    return "\n".join(lines).rstrip() + "\n"


def render_html(payload: dict[str, Any]) -> str:
    notes = "\n".join(
        f"<section><h3>{esc(note.get('field'))}</h3><p>{esc(note.get('note'))}</p></section>"
        for note in payload.get("notes", [])
    ) or "<p>No review-evidence notes yet.</p>"
    command = payload.get("commandPreview") or "No command preview until review-evidence notes exist."
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Evidence preview - {esc(payload.get('shortId'))}</title>
  <style>
    :root {{ color-scheme: dark; --soil:#17110c; --moss:#1a2b20; --cream:#fff0d0; --honey:#f2c94c; --fern:#8ee39a; --water:#78dbe6; --line:rgba(255,240,208,.16); }}
    body {{ margin:0; color:var(--cream); font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; background:linear-gradient(135deg,var(--moss),var(--soil)); }}
    main {{ width:min(980px,calc(100vw - 32px)); margin:0 auto; padding:32px 0 88px; }}
    article,section {{ border:1px solid var(--line); border-radius:24px; background:rgba(255,240,208,.07); padding:20px; margin-bottom:12px; box-shadow:0 18px 60px rgba(0,0,0,.22); }}
    h1 {{ margin:0 0 8px; font-size:46px; line-height:.95; letter-spacing:-.045em; }}
    h2 {{ color:var(--honey); letter-spacing:.14em; text-transform:uppercase; font-size:13px; }}
    code {{ color:var(--water); overflow-wrap:anywhere; }}
    pre {{ white-space:pre-wrap; border:1px solid var(--line); border-radius:16px; padding:14px; background:rgba(0,0,0,.24); color:var(--water); }}
  </style>
</head>
<body>
<main>
  <article>
    <h2>Quipsly Studio</h2>
    <h1>Evidence preview</h1>
    <p>{esc(payload.get('shortId'))} · {esc(payload.get('status'))} · {esc(payload.get('reviewEvidenceNoteCount'))} note(s)</p>
    <p>{esc(payload.get('truth'))}</p>
  </article>
  <section><h2>Summary</h2><p>{esc(payload.get('summary'))}</p></section>
  {notes}
  <section><h2>Command preview</h2><pre>{esc(command)}</pre></section>
</main>
</body>
</html>
"""


def write_outputs(payload: dict[str, Any]) -> dict[str, str]:
    folder = Path(payload["artifactPaths"]["folder"])
    folder.mkdir(parents=True, exist_ok=True)
    paths = {key: Path(value) for key, value in payload.get("artifactPaths", {}).items() if key != "folder"}
    paths["json"].write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
    paths["markdown"].write_text(render_markdown(payload), encoding="utf-8")
    paths["html"].write_text(render_html(payload), encoding="utf-8")
    return {key: str(path) for key, path in paths.items()}


def main() -> None:
    parser = argparse.ArgumentParser(description="Preview evidence draft from cut-quality worksheet notes.")
    parser.add_argument("--index", default=str(DEFAULT_INDEX_JSON), help="Cut-quality worksheet index JSON.")
    parser.add_argument("--output-root", default=str(DEFAULT_OUTPUT_ROOT), help="Evidence preview output root.")
    parser.add_argument("--short-id", default="", help="Select a short id.")
    parser.add_argument("--outcome", choices=["keep", "refine", "hold", "reject", "needs-more-evidence"], default="refine", help="Evidence draft outcome preview.")
    parser.add_argument("--reviewer", default="Codex", help="Reviewer label.")
    args = parser.parse_args()

    index_path = Path(args.index).expanduser()
    index = read_json(index_path)
    short = select_short(index, args.short_id)
    notes = notes_for_short(index, str(short.get("shortId") or ""))
    payload = build_preview(index_path, Path(args.output_root).expanduser(), short, notes, args.outcome, args.reviewer)
    written = write_outputs(payload)
    print(json.dumps({
        "ok": True,
        "shortId": payload.get("shortId"),
        "status": payload.get("status"),
        "reviewEvidenceNoteCount": payload.get("reviewEvidenceNoteCount"),
        "artifactPaths": {"folder": payload["artifactPaths"]["folder"], **written},
        "nextSafestAction": payload.get("nextSafestAction"),
        "truth": payload.get("truth"),
    }, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
