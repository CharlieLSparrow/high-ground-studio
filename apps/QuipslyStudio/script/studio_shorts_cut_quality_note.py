#!/usr/bin/env python3
"""Create a versioned cut-quality note sidecar for one short field.

Notes are the bridge between watch/listen worksheets and reusable edit
intelligence. This command creates local sidecar artifacts only; it does not
record a review decision, edit a timeline, export media, or publish.
"""
from __future__ import annotations

import argparse
import html
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from studio_short_review_ledger_fallback import fallback_workbench_for_short


DEFAULT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
DEFAULT_WORKBENCH_JSON = (
    DEFAULT_ROOT
    / "shorts-command-room"
    / "cut-quality-workbench"
    / "quipsly-studio-shorts-cut-quality-workbench.json"
)
DEFAULT_NOTES_ROOT = DEFAULT_ROOT / "shorts-command-room" / "cut-quality-worksheets"
SCHEMA = "quipsly.studio.shorts-cut-quality-note.v1"
VERSION = "2026-07-02.v1"
VALID_FIELDS = {
    "hook",
    "cadence",
    "jCutLCut",
    "jumpCutCover",
    "reactionBeat",
    "captionPlan",
    "cropFraming",
    "audioFeel",
    "endingPayoff",
    "platformFit",
    "riskTradeoff",
}


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""))


def slug(value: str, fallback: str = "note") -> str:
    clean = "".join(ch.lower() if ch.isalnum() else "-" for ch in value).strip("-")
    while "--" in clean:
        clean = clean.replace("--", "-")
    return clean or fallback


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise SystemExit(
            f"Cut-quality workbench JSON not found: {path}\n"
            "Run: script/agentctl.sh studio-shorts-cut-quality-workbench --all"
        )
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise SystemExit(f"Expected JSON object: {path}")
    return data


def choose_item(items: list[dict[str, Any]], short_id: str, rank: int, readiness: str) -> dict[str, Any]:
    if short_id:
        for item in items:
            if str(item.get("shortId") or "") == short_id:
                return item
        raise SystemExit(f"Short not found in cut-quality workbench: {short_id}")
    if rank > 0:
        for item in items:
            if int(item.get("rank") or -1) == rank:
                return item
        raise SystemExit(f"Rank not found in cut-quality workbench: {rank}")
    if readiness:
        for item in items:
            if str(item.get("readinessLevel") or "") == readiness:
                return item
        raise SystemExit(f"No cut-quality item has readiness level: {readiness}")
    for level in ["watch-listen-first", "caption-timing-review", "transcript-review", "media-needs-repair"]:
        for item in items:
            if str(item.get("readinessLevel") or "") == level:
                return item
    if items:
        return items[0]
    raise SystemExit("Cut-quality workbench has no items.")


def build_note(
    workbench_path: Path,
    notes_root: Path,
    item: dict[str, Any],
    field: str,
    note: str,
    reviewer: str,
    kind: str,
) -> dict[str, Any]:
    short_id = str(item.get("shortId") or "unknown-short")
    transcript = item.get("transcript") if isinstance(item.get("transcript"), dict) else {}
    folder = notes_root / slug(short_id) / "notes"
    basename = f"{stamp()}-{slug(field)}-cut-quality-note"
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
        "kind": kind,
        "reviewer": reviewer,
        "sourceWorkbenchJson": str(workbench_path),
        "shortId": short_id,
        "episode": item.get("episode"),
        "episodeVersion": item.get("version"),
        "rank": item.get("rank"),
        "title": item.get("title"),
        "readinessLevel": item.get("readinessLevel"),
        "transcriptStatus": transcript.get("status"),
        "field": field,
        "note": note,
        "artifactPaths": paths,
        "nextSafestAction": "Run the worksheet index. If enough fields have specific evidence, convert notes into an evidence draft before recording local intent.",
        "truth": "Versioned cut-quality note sidecar only. It records no review decision, edits no timeline, exports nothing, publishes nothing, runs no ASR, generates no transcript text, mutates no media, overwrites no prior notes, and creates no receipt truth.",
    }


def render_markdown(payload: dict[str, Any]) -> str:
    return "\n".join(
        [
            "# Cut-quality note",
            "",
            f"- Short: `{payload.get('shortId')}`",
            f"- Field: `{payload.get('field')}`",
            f"- Kind: `{payload.get('kind')}`",
            f"- Reviewer: `{payload.get('reviewer')}`",
            f"- Episode/version: `Episode {payload.get('episode')}` / `{payload.get('episodeVersion')}`",
            f"- Transcript: `{payload.get('transcriptStatus')}`",
            "",
            payload.get("truth", ""),
            "",
            "## Note",
            "",
            str(payload.get("note") or ""),
            "",
            f"Next safest action: {payload.get('nextSafestAction')}",
            "",
        ]
    )


def render_html(payload: dict[str, Any]) -> str:
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Cut-quality note - {esc(payload.get('shortId'))}</title>
  <style>
    :root {{ color-scheme: dark; --soil:#17110c; --moss:#1a2b20; --cream:#fff0d0; --honey:#f2c94c; --fern:#8ee39a; --line:rgba(255,240,208,.16); }}
    body {{ margin:0; color:var(--cream); font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; background:linear-gradient(135deg,var(--moss),var(--soil)); }}
    main {{ width:min(900px,calc(100vw - 32px)); margin:0 auto; padding:32px 0 88px; }}
    article {{ border:1px solid var(--line); border-radius:26px; background:rgba(255,240,208,.07); padding:24px; box-shadow:0 20px 70px rgba(0,0,0,.25); }}
    h1 {{ margin:0 0 8px; font-size:44px; line-height:.95; letter-spacing:-.045em; }}
    h2 {{ color:var(--honey); letter-spacing:.14em; text-transform:uppercase; font-size:13px; }}
    .note {{ white-space:pre-wrap; border:1px solid var(--line); border-radius:18px; padding:16px; background:rgba(0,0,0,.2); }}
    .truth {{ color:rgba(255,240,208,.72); }}
  </style>
</head>
<body>
<main>
  <article>
    <h2>Quipsly Studio</h2>
    <h1>{esc(payload.get('field'))}</h1>
    <p>{esc(payload.get('shortId'))} · Episode {esc(payload.get('episode'))} · {esc(payload.get('kind'))}</p>
    <p class="truth">{esc(payload.get('truth'))}</p>
    <div class="note">{esc(payload.get('note'))}</div>
    <p>{esc(payload.get('nextSafestAction'))}</p>
  </article>
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
    parser = argparse.ArgumentParser(description="Create a versioned cut-quality note sidecar.")
    parser.add_argument("--workbench", default=str(DEFAULT_WORKBENCH_JSON), help="Cut-quality workbench JSON.")
    parser.add_argument("--notes-root", default=str(DEFAULT_NOTES_ROOT), help="Cut-quality worksheet/notes root.")
    parser.add_argument("--short-id", default="", help="Select a specific short id.")
    parser.add_argument("--rank", type=int, default=0, help="Select a specific rank.")
    parser.add_argument("--readiness", default="", help="Select first item matching readiness level.")
    parser.add_argument("--field", required=True, choices=sorted(VALID_FIELDS), help="Worksheet field id.")
    parser.add_argument("--note", default="", help="Specific watch/listen evidence note.")
    parser.add_argument("--reviewer", default="Codex", help="Reviewer label.")
    parser.add_argument("--kind", choices=["review-evidence", "system-check"], default="review-evidence", help="Note kind. Only review-evidence counts as filled worksheet evidence.")
    parser.add_argument("--dry-run", action="store_true", help="Print payload without writing files.")
    args = parser.parse_args()

    note_text = args.note.strip()
    if not note_text:
        raise SystemExit("--note is required; empty cut-quality notes are not useful evidence.")
    workbench_path = Path(args.workbench).expanduser()
    board = read_json(workbench_path)
    items = [item for item in board.get("items", []) if isinstance(item, dict)]
    try:
        item = choose_item(items, args.short_id, args.rank, args.readiness)
    except SystemExit:
        fallback = fallback_workbench_for_short(DEFAULT_ROOT, args.short_id) if args.short_id else None
        if not fallback:
            raise
        workbench_path = fallback
        board = read_json(workbench_path)
        items = [item for item in board.get("items", []) if isinstance(item, dict)]
        item = choose_item(items, args.short_id, args.rank, args.readiness)
    payload = build_note(workbench_path, Path(args.notes_root).expanduser(), item, args.field, note_text, args.reviewer, args.kind)
    if args.dry_run:
        payload["dryRun"] = True
        payload["truth"] = "Dry run only. No files were written, no review decision was recorded, no timeline was edited, no media was mutated, and no receipt truth was created."
        print(json.dumps(payload, indent=2, sort_keys=True))
        return
    written = write_outputs(payload)
    print(json.dumps({
        "ok": True,
        "shortId": payload.get("shortId"),
        "field": payload.get("field"),
        "kind": payload.get("kind"),
        "artifactPaths": {"folder": payload["artifactPaths"]["folder"], **written},
        "nextSafestAction": payload.get("nextSafestAction"),
        "truth": payload.get("truth"),
    }, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
