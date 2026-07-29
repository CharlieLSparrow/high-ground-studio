#!/usr/bin/env python3
"""Index one-short polish cockpits.

Polish cockpits gather playable media, a representative frame, waveform,
workorder tasks, worksheet/note-preview doors, and safe commands for one short.
This index keeps the latest cockpit per short findable without recording notes,
decisions, edits, exports, publishing, uploads, source mutations, or receipts.
"""
from __future__ import annotations

import argparse
import html
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
DEFAULT_COCKPIT_ROOT = DEFAULT_ROOT / "shorts-command-room" / "cut-quality-polish-cockpits"
DEFAULT_OUTPUT_DIR = DEFAULT_COCKPIT_ROOT / "index"
DEFAULT_BASENAME = "quipsly-studio-shorts-cut-quality-polish-cockpit-index"
SCHEMA = "quipsly.studio.shorts-cut-quality-polish-cockpit-index.v1"
VERSION = "2026-07-02.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""))


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def file_uri(path: str | Path) -> str:
    if not path:
        return ""
    try:
        return Path(path).expanduser().resolve().as_uri()
    except ValueError:
        return ""


def read_json(path: Path) -> dict[str, Any]:
    try:
        with path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
    except (OSError, json.JSONDecodeError):
        return {}
    return data if isinstance(data, dict) else {}


def artifact_paths_from(payload: dict[str, Any], json_path: Path) -> dict[str, str]:
    paths = payload.get("artifactPaths") if isinstance(payload.get("artifactPaths"), dict) else {}
    return {
        "json": str(json_path),
        "markdown": str(paths.get("markdown") or json_path.with_suffix(".md")),
        "html": str(paths.get("html") or json_path.with_suffix(".html")),
    }


def discover_cockpits(root: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    if not root.exists():
        return rows
    for json_path in sorted(root.glob("*/*/*polish-cockpit.json")):
        if "/index/" in str(json_path):
            continue
        payload = read_json(json_path)
        if payload.get("schema") != "quipsly.studio.shorts-cut-quality-polish-cockpit.v1":
            continue
        paths = artifact_paths_from(payload, json_path)
        visual = payload.get("visual") if isinstance(payload.get("visual"), dict) else {}
        audio = payload.get("audio") if isinstance(payload.get("audio"), dict) else {}
        cadence = audio.get("cadence") if isinstance(audio.get("cadence"), dict) else {}
        volume = audio.get("volume") if isinstance(audio.get("volume"), dict) else {}
        counts = payload.get("counts") if isinstance(payload.get("counts"), dict) else {}
        rows.append(
            {
                "shortId": payload.get("shortId"),
                "episode": payload.get("episode"),
                "episodeVersion": payload.get("episodeVersion"),
                "title": payload.get("title"),
                "lane": payload.get("lane"),
                "score": payload.get("score"),
                "generatedAt": payload.get("generatedAt"),
                "mediaPath": payload.get("mediaPath"),
                "reviewPacketHtml": payload.get("reviewPacketHtml"),
                "workorderHtml": payload.get("workorderHtml"),
                "notePreviewHtml": payload.get("notePreviewHtml"),
                "worksheetHtml": payload.get("worksheetHtml"),
                "visualFrameCount": visual.get("frameCount", 0),
                "firstFramePath": visual.get("firstFramePath"),
                "waveformPath": audio.get("waveformPath"),
                "cadenceLabel": cadence.get("label"),
                "meaningfulPauseCount": cadence.get("meaningfulPauseCount"),
                "longPauseCount": cadence.get("longPauseCount"),
                "meanVolumeDb": volume.get("meanVolumeDb"),
                "maxVolumeDb": volume.get("maxVolumeDb"),
                "taskCount": counts.get("tasks", len(payload.get("tasks") or [])),
                "previewRowCount": counts.get("previewRows", len(payload.get("previewRows") or [])),
                "worksheetAvailable": bool(counts.get("worksheetAvailable") or payload.get("worksheetHtml")),
                "notesRecorded": counts.get("notesRecorded", 0),
                "decisionsRecorded": counts.get("decisionsRecorded", 0),
                "externalPublishing": bool(counts.get("externalPublishing")),
                "receiptTruthCreated": bool(counts.get("receiptTruthCreated")),
                "nextSafestAction": payload.get("nextSafestAction"),
                "artifactDir": str(json_path.parent),
                "artifactPaths": paths,
                "openHtmlCommand": f"open {shell_quote(paths['html'])}",
                "revealCommand": f"open -R {shell_quote(paths['html'])}",
                "truth": payload.get("truth"),
            }
        )
    return rows


def latest_by_short(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    latest: dict[str, dict[str, Any]] = {}
    for row in rows:
        short_id = str(row.get("shortId") or "")
        if not short_id:
            continue
        generated = str(row.get("generatedAt") or "")
        current = latest.get(short_id)
        if current is None or generated > str(current.get("generatedAt") or ""):
            latest[short_id] = row
    return sorted(latest.values(), key=lambda row: (int(row.get("episode") or 9999), str(row.get("shortId") or "")))


def build_index(root: Path, output_dir: Path) -> dict[str, Any]:
    rows = discover_cockpits(root)
    latest = latest_by_short(rows)
    lanes = Counter(str(row.get("lane") or "unknown") for row in latest)
    episodes = Counter(str(row.get("episode") or "unknown") for row in latest)
    cadence = Counter(str(row.get("cadenceLabel") or "unknown") for row in latest)
    complete_doors = [
        row for row in latest
        if row.get("reviewPacketHtml") and row.get("workorderHtml") and row.get("notePreviewHtml") and row.get("worksheetHtml")
    ]
    return {
        "schema": SCHEMA,
        "version": VERSION,
        "generatedAt": iso_now(),
        "cockpitRoot": str(root),
        "outputDir": str(output_dir),
        "counts": {
            "cockpits": len(rows),
            "shortsWithCockpits": len(latest),
            "latestCompleteDoors": len(complete_doors),
            "latestMissingDoors": len(latest) - len(complete_doors),
            "latestWithWorksheet": sum(1 for row in latest if row.get("worksheetAvailable")),
            "latestWithTasks": sum(1 for row in latest if int(row.get("taskCount") or 0) > 0),
            "latestNotesRecorded": sum(int(row.get("notesRecorded") or 0) for row in latest),
            "latestDecisionsRecorded": sum(int(row.get("decisionsRecorded") or 0) for row in latest),
            "latestExternalPublishing": sum(1 for row in latest if row.get("externalPublishing")),
            "latestReceiptTruthCreated": sum(1 for row in latest if row.get("receiptTruthCreated")),
            "lanes": dict(sorted(lanes.items())),
            "episodes": dict(sorted(episodes.items())),
            "cadenceLabels": dict(sorted(cadence.items())),
        },
        "latestByShort": latest,
        "allCockpits": sorted(rows, key=lambda row: str(row.get("generatedAt") or ""), reverse=True),
        "truth": (
            "Polish-cockpit index only. It records no notes, records no review decision, edits no timeline, "
            "exports no media, publishes nothing, uploads nothing, mutates no source media, overwrites no cockpit, "
            "deletes nothing, and creates no approval or receipt truth."
        ),
    }


def render_markdown(payload: dict[str, Any]) -> str:
    counts = payload.get("counts") if isinstance(payload.get("counts"), dict) else {}
    lines = [
        "# Shorts polish cockpit index",
        "",
        payload.get("truth", ""),
        "",
        "## Counts",
        "",
        f"- Cockpits: `{counts.get('cockpits', 0)}`",
        f"- Shorts with cockpits: `{counts.get('shortsWithCockpits', 0)}`",
        f"- Latest complete doors: `{counts.get('latestCompleteDoors', 0)}`",
        f"- Latest with worksheets: `{counts.get('latestWithWorksheet', 0)}`",
        f"- Notes recorded through cockpits: `{counts.get('latestNotesRecorded', 0)}`",
        f"- Decisions recorded through cockpits: `{counts.get('latestDecisionsRecorded', 0)}`",
        "",
        "## Latest polish cockpit per short",
        "",
    ]
    latest = payload.get("latestByShort") if isinstance(payload.get("latestByShort"), list) else []
    if not latest:
        lines.append("- No polish cockpits found yet.")
    for row in latest:
        paths = row.get("artifactPaths") if isinstance(row.get("artifactPaths"), dict) else {}
        lines.extend(
            [
                f"### {row.get('shortId')}",
                "",
                f"- Episode/version: `Episode {row.get('episode')}` / `{row.get('episodeVersion')}`",
                f"- Title: {row.get('title')}",
                f"- Lane/score: `{row.get('lane')}` / `{row.get('score')}`",
                f"- Tasks/preview rows: `{row.get('taskCount')}` / `{row.get('previewRowCount')}`",
                f"- Cadence: `{row.get('cadenceLabel')}`",
                f"- Worksheet available: `{row.get('worksheetAvailable')}`",
                f"- Notes/decisions recorded: `{row.get('notesRecorded')}` / `{row.get('decisionsRecorded')}`",
                f"- Next: {row.get('nextSafestAction')}",
                f"- HTML: `{paths.get('html')}`",
                f"- Open: `{row.get('openHtmlCommand')}`",
                "",
            ]
        )
    return "\n".join(lines).rstrip() + "\n"


def render_html(payload: dict[str, Any]) -> str:
    counts = payload.get("counts") if isinstance(payload.get("counts"), dict) else {}
    cards = []
    for row in payload.get("latestByShort", []):
        if not isinstance(row, dict):
            continue
        paths = row.get("artifactPaths") if isinstance(row.get("artifactPaths"), dict) else {}
        html_path = str(paths.get("html") or "")
        cards.append(
            f"""
            <article class="card">
              <p class="eyebrow">Episode {esc(row.get('episode'))} · {esc(row.get('episodeVersion'))} · {esc(row.get('lane'))}</p>
              <h2>{esc(row.get('shortId'))}</h2>
              <p>{esc(row.get('title'))}</p>
              <div class="pills">
                <span>{esc(row.get('taskCount'))} tasks</span>
                <span>{esc(row.get('previewRowCount'))} note previews</span>
                <span>{esc(row.get('cadenceLabel'))}</span>
                <span>{'worksheet' if row.get('worksheetAvailable') else 'no worksheet'}</span>
                <span>{esc(row.get('notesRecorded'))} notes</span>
                <span>{esc(row.get('decisionsRecorded'))} decisions</span>
              </div>
              <p>{esc(row.get('nextSafestAction'))}</p>
              <a class="button" href="{esc(file_uri(html_path))}">Open polish cockpit</a>
              <code>{esc(html_path)}</code>
            </article>
            """
        )
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Quipsly shorts polish cockpit index</title>
  <style>
    :root {{ color-scheme: dark; --soil:#15110b; --moss:#1d3121; --leaf:#8edc89; --honey:#f3ce54; --cream:#fff1d4; --line:rgba(255,241,212,.16); --clay:#bf5b3d; }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:var(--cream); background:radial-gradient(circle at 12% -10%,rgba(142,220,137,.22),transparent 28rem),radial-gradient(circle at 95% 0%,rgba(243,206,84,.18),transparent 24rem),linear-gradient(135deg,var(--moss),var(--soil)); }}
    main {{ width:min(1440px,calc(100vw - 40px)); margin:0 auto; padding:36px 0 80px; }}
    header,.card {{ border:1px solid var(--line); border-radius:28px; background:rgba(255,241,212,.07); box-shadow:0 24px 80px rgba(0,0,0,.28); }}
    header {{ padding:32px; margin-bottom:18px; }}
    .eyebrow {{ color:var(--honey); letter-spacing:.16em; text-transform:uppercase; font-size:.76rem; font-weight:950; margin:0 0 8px; }}
    h1 {{ margin:0 0 12px; font-size:clamp(2.5rem,7vw,5.8rem); line-height:.9; }}
    h2 {{ margin:0 0 8px; }}
    p {{ color:#e0d1b4; line-height:1.55; }}
    .metrics {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:10px; margin-top:18px; }}
    .metrics div {{ border:1px solid var(--line); border-radius:18px; padding:13px; background:rgba(0,0,0,.22); }}
    .metrics strong {{ display:block; color:var(--leaf); font-size:2rem; }}
    .metrics span {{ color:#cdbf9e; text-transform:uppercase; letter-spacing:.09em; font-size:.72rem; font-weight:900; }}
    .grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(390px,1fr)); gap:14px; }}
    .card {{ padding:18px; }}
    .pills {{ display:flex; flex-wrap:wrap; gap:7px; margin:10px 0 14px; }}
    .pills span {{ border:1px solid var(--line); border-radius:999px; padding:7px 10px; background:rgba(0,0,0,.24); font-weight:900; }}
    .button {{ display:inline-block; border:1px solid rgba(243,206,84,.5); border-radius:999px; padding:9px 13px; color:var(--honey); text-decoration:none; font-weight:950; margin-bottom:10px; }}
    code {{ display:block; color:#ffeaa3; overflow-wrap:anywhere; }}
  </style>
</head>
<body>
<main>
  <header>
    <p class="eyebrow">Quipsly Studio · polish cockpit index</p>
    <h1>The next review door should be obvious.</h1>
    <p>{esc(payload.get('truth'))}</p>
    <div class="metrics">
      <div><strong>{esc(counts.get('cockpits', 0))}</strong><span>cockpits</span></div>
      <div><strong>{esc(counts.get('shortsWithCockpits', 0))}</strong><span>shorts covered</span></div>
      <div><strong>{esc(counts.get('latestCompleteDoors', 0))}</strong><span>complete doors</span></div>
      <div><strong>{esc(counts.get('latestWithWorksheet', 0))}</strong><span>worksheets</span></div>
      <div><strong>{esc(counts.get('latestNotesRecorded', 0))}</strong><span>notes recorded</span></div>
      <div><strong>{esc(counts.get('latestDecisionsRecorded', 0))}</strong><span>decisions</span></div>
    </div>
  </header>
  <section class="grid">{''.join(cards) if cards else '<p>No polish cockpits found yet.</p>'}</section>
</main>
</body>
</html>
"""


def write_outputs(payload: dict[str, Any], output_dir: Path, basename: str) -> dict[str, str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    paths = {
        "json": output_dir / f"{basename}.json",
        "markdown": output_dir / f"{basename}.md",
        "html": output_dir / f"{basename}.html",
    }
    paths["json"].write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
    paths["markdown"].write_text(render_markdown(payload), encoding="utf-8")
    paths["html"].write_text(render_html(payload), encoding="utf-8")
    return {key: str(path) for key, path in paths.items()}


def main() -> None:
    parser = argparse.ArgumentParser(description="Index cut-quality polish cockpits.")
    parser.add_argument("--cockpit-root", default=str(DEFAULT_COCKPIT_ROOT), help="Root folder containing polish cockpit artifacts.")
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR), help="Output folder for index artifacts.")
    parser.add_argument("--basename", default=DEFAULT_BASENAME, help="Output basename.")
    parser.add_argument("--format", choices=["markdown", "json", "html", "all"], default="markdown")
    parser.add_argument("--markdown", dest="format", action="store_const", const="markdown")
    parser.add_argument("--json", dest="format", action="store_const", const="json")
    parser.add_argument("--html", dest="format", action="store_const", const="html")
    parser.add_argument("--all", dest="format", action="store_const", const="all")
    args = parser.parse_args()

    payload = build_index(Path(args.cockpit_root).expanduser(), Path(args.output_dir).expanduser())
    written = write_outputs(payload, Path(args.output_dir).expanduser(), args.basename)
    payload["artifactPaths"] = written
    Path(written["json"]).write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")

    if args.format == "json":
        print(json.dumps(payload, indent=2, sort_keys=True))
    elif args.format == "html":
        print(written["html"])
    elif args.format == "all":
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        print(render_markdown(payload), end="")


if __name__ == "__main__":
    main()
