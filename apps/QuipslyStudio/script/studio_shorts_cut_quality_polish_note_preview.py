#!/usr/bin/env python3
"""Preview polish-workorder note commands without recording them.

This is the safety valve between an evidence-based workorder and a recorded
worksheet note. It packages suggested note commands for copy/review, but does
not run them and does not claim the notes are true until a reviewer confirms
them after watch/listen review.
"""
from __future__ import annotations

import argparse
import html
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
DEFAULT_WORKORDER_ROOT = DEFAULT_ROOT / "shorts-command-room" / "cut-quality-polish-workorders"
DEFAULT_OUTPUT_ROOT = DEFAULT_ROOT / "shorts-command-room" / "cut-quality-polish-note-previews"
SCHEMA = "quipsly.studio.shorts-cut-quality-polish-note-preview.v1"
VERSION = "2026-07-02.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""))


def safe_slug(value: Any) -> str:
    text = str(value or "preview")
    clean = "".join(ch.lower() if ch.isalnum() else "-" for ch in text)
    while "--" in clean:
        clean = clean.replace("--", "-")
    return clean.strip("-")[:96] or "preview"


def file_uri(path: str | Path) -> str:
    try:
        return Path(path).expanduser().resolve().as_uri()
    except ValueError:
        return ""


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise SystemExit(f"JSON not found: {path}")
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise SystemExit(f"Expected JSON object: {path}")
    return data


def discover_workorders(root: Path, short_id: str) -> list[Path]:
    pattern = f"{safe_slug(short_id)}/*/*polish-workorder.json" if short_id else "*/*/*polish-workorder.json"
    return sorted(root.glob(pattern), key=lambda path: path.stat().st_mtime, reverse=True)


def choose_workorder(root: Path, short_id: str, explicit_path: str) -> Path:
    if explicit_path:
        return Path(explicit_path).expanduser()
    paths = discover_workorders(root, short_id)
    if not paths:
        hint = f" for {short_id}" if short_id else ""
        raise SystemExit(f"No polish workorders found{hint}. Run: script/agentctl.sh studio-shorts-cut-quality-polish-workorder")
    return paths[0]


def build_preview(workorder_path: Path, output_root: Path) -> tuple[dict[str, Any], Path]:
    workorder = read_json(workorder_path)
    short_id = str(workorder.get("shortId") or "short")
    tasks = [task for task in workorder.get("tasks", []) if isinstance(task, dict)]
    commands = [command for command in workorder.get("suggestedNoteCommands", []) if isinstance(command, dict)]
    command_by_field = {str(command.get("field") or ""): command for command in commands}
    preview_rows = []
    for task in tasks:
        field = str(task.get("field") or "")
        command = command_by_field.get(field, {})
        preview_rows.append(
            {
                "field": field,
                "priority": task.get("priority"),
                "evidence": task.get("evidence"),
                "instruction": task.get("instruction"),
                "suggestedNote": task.get("suggestedNote"),
                "command": command.get("command", ""),
                "reviewRequirement": "Run only after watch/listen review confirms the suggested note is still true.",
            }
        )
    folder = output_root / safe_slug(short_id) / f"{stamp()}-{safe_slug(short_id)}-polish-note-preview"
    folder.mkdir(parents=True, exist_ok=False)
    payload = {
        "schema": SCHEMA,
        "version": VERSION,
        "generatedAt": iso_now(),
        "sourcePolishWorkorderJson": str(workorder_path),
        "shortId": short_id,
        "episode": workorder.get("episode"),
        "episodeVersion": workorder.get("episodeVersion"),
        "title": workorder.get("title"),
        "lane": workorder.get("lane"),
        "score": workorder.get("score"),
        "reviewPacketHtml": workorder.get("reviewPacketHtml"),
        "previewRows": preview_rows,
        "counts": {
            "tasks": len(tasks),
            "suggestedCommands": len(commands),
            "commandsPreviewed": len([row for row in preview_rows if row.get("command")]),
            "notesRecorded": 0,
            "decisionsRecorded": 0,
            "externalPublishing": False,
            "receiptTruthCreated": False,
        },
        "nextSafestAction": "Open the short/review packet, watch/listen, then copy only the commands whose suggested notes still feel true.",
        "truth": (
            "Polish note preview only. It does not run note commands, records no notes, records no review decision, "
            "edits no timeline, exports no media, publishes nothing, uploads nothing, mutates no source media, "
            "overwrites no previous preview, deletes nothing, and creates no approval or receipt truth."
        ),
    }
    return payload, folder


def render_markdown(payload: dict[str, Any]) -> str:
    lines = [
        "# Shorts polish note preview",
        "",
        f"- Short: `{payload.get('shortId')}`",
        f"- Episode/version: `Episode {payload.get('episode')}` / `{payload.get('episodeVersion')}`",
        f"- Title: {payload.get('title')}",
        f"- Lane/score: `{payload.get('lane')}` / `{payload.get('score')}`",
        f"- Review packet: `{payload.get('reviewPacketHtml')}`",
        "",
        payload.get("truth", ""),
        "",
        f"Next safest action: {payload.get('nextSafestAction')}",
        "",
        "## Previewed note commands",
        "",
    ]
    for row in payload.get("previewRows", []):
        lines.extend(
            [
                f"### {row.get('field')} ({row.get('priority')})",
                "",
                f"- Evidence: {row.get('evidence')}",
                f"- Instruction: {row.get('instruction')}",
                f"- Suggested note: {row.get('suggestedNote')}",
                f"- Requirement: {row.get('reviewRequirement')}",
                f"- Command: `{row.get('command')}`",
                "",
            ]
        )
    return "\n".join(lines).rstrip() + "\n"


def render_html(payload: dict[str, Any]) -> str:
    cards = []
    for row in payload.get("previewRows", []):
        cards.append(
            f"""
            <article class="card">
              <p class="eyebrow">{esc(row.get('priority'))} · {esc(row.get('field'))}</p>
              <h2>{esc(row.get('field'))}</h2>
              <p><strong>Evidence:</strong> {esc(row.get('evidence'))}</p>
              <p><strong>Instruction:</strong> {esc(row.get('instruction'))}</p>
              <p><strong>Suggested note:</strong> {esc(row.get('suggestedNote'))}</p>
              <p class="warn">{esc(row.get('reviewRequirement'))}</p>
              <button type="button" data-copy="{esc(row.get('command'))}">Copy note command</button>
              <code>{esc(row.get('command'))}</code>
            </article>
            """
        )
    packet = str(payload.get("reviewPacketHtml") or "")
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Quipsly polish note preview - {esc(payload.get('shortId'))}</title>
  <style>
    :root {{ color-scheme: dark; --soil:#15110b; --moss:#203522; --leaf:#8edc89; --honey:#f3ce54; --cream:#fff1d4; --line:rgba(255,241,212,.16); --clay:#df6a4f; }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:var(--cream); background:radial-gradient(circle at 10% -8%,rgba(142,220,137,.25),transparent 32rem),linear-gradient(135deg,var(--moss),var(--soil)); }}
    main {{ width:min(1440px,calc(100vw - 40px)); margin:0 auto; padding:36px 0 80px; }}
    header,.card {{ border:1px solid var(--line); border-radius:28px; background:rgba(255,241,212,.07); box-shadow:0 24px 80px rgba(0,0,0,.26); }}
    header {{ padding:32px; margin-bottom:18px; }}
    .eyebrow {{ color:var(--honey); letter-spacing:.16em; text-transform:uppercase; font-size:.76rem; font-weight:950; margin:0 0 8px; }}
    h1 {{ margin:0 0 12px; font-size:clamp(2.3rem,7vw,5.5rem); line-height:.9; }}
    h2 {{ margin:0 0 8px; }}
    p {{ color:#e0d1b4; line-height:1.55; }}
    .warn {{ color:#ffd1c4; }}
    .grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(380px,1fr)); gap:14px; }}
    .card {{ padding:18px; }}
    .button,button {{ display:inline-block; border:1px solid rgba(243,206,84,.5); border-radius:999px; padding:9px 13px; color:var(--honey); background:rgba(0,0,0,.18); font-weight:950; margin:10px 0; }}
    code {{ display:block; color:#ffeaa3; overflow-wrap:anywhere; }}
  </style>
  <script>
    addEventListener("click", async (event) => {{
      const button = event.target.closest("[data-copy]");
      if (!button) return;
      await navigator.clipboard.writeText(button.dataset.copy || "");
      button.textContent = "Copied";
    }});
  </script>
</head>
<body>
<main>
  <header>
    <p class="eyebrow">Quipsly Studio · polish note preview</p>
    <h1>{esc(payload.get('shortId'))}</h1>
    <p>{esc(payload.get('truth'))}</p>
    <a class="button" href="{esc(file_uri(packet))}">Open review packet</a>
    <code>{esc(packet)}</code>
  </header>
  <section class="grid">{''.join(cards)}</section>
</main>
</body>
</html>"""


def write_outputs(payload: dict[str, Any], folder: Path) -> dict[str, str]:
    paths = {
        "json": folder / f"{safe_slug(payload.get('shortId'))}-polish-note-preview.json",
        "markdown": folder / f"{safe_slug(payload.get('shortId'))}-polish-note-preview.md",
        "html": folder / f"{safe_slug(payload.get('shortId'))}-polish-note-preview.html",
    }
    paths["json"].write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
    paths["markdown"].write_text(render_markdown(payload), encoding="utf-8")
    paths["html"].write_text(render_html(payload), encoding="utf-8")
    return {key: str(path) for key, path in paths.items()}


def main() -> None:
    parser = argparse.ArgumentParser(description="Preview polish note commands without recording notes.")
    parser.add_argument("--short-id", default="", help="Specific short id. Defaults to newest workorder.")
    parser.add_argument("--workorder", default="", help="Explicit polish workorder JSON path.")
    parser.add_argument("--workorder-root", default=str(DEFAULT_WORKORDER_ROOT), help="Polish workorder root.")
    parser.add_argument("--output-root", default=str(DEFAULT_OUTPUT_ROOT), help="Output root.")
    parser.add_argument("--format", choices=["markdown", "json", "html", "all"], default="markdown")
    parser.add_argument("--markdown", dest="format", action="store_const", const="markdown")
    parser.add_argument("--json", dest="format", action="store_const", const="json")
    parser.add_argument("--html", dest="format", action="store_const", const="html")
    parser.add_argument("--all", dest="format", action="store_const", const="all")
    args = parser.parse_args()

    workorder_path = choose_workorder(Path(args.workorder_root).expanduser(), args.short_id, args.workorder)
    payload, folder = build_preview(workorder_path, Path(args.output_root).expanduser())
    paths = write_outputs(payload, folder)
    payload["artifactPaths"] = paths
    Path(paths["json"]).write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")

    if args.format == "json":
        print(json.dumps(payload, indent=2, sort_keys=True))
    elif args.format == "html":
        print(paths["html"])
    elif args.format == "all":
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        print(render_markdown(payload), end="")


if __name__ == "__main__":
    main()
