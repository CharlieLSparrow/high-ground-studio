#!/usr/bin/env python3
"""Build a one-short polish cockpit from the latest review artifacts.

The cockpit is a human/agent review doorway: playable short, representative
frame, waveform, workorder tasks, suggested note-preview commands, and exact
next actions in one place. It does not record notes, record decisions, edit
timelines, export media, publish, upload, mutate source media, or create receipt
truth.
"""
from __future__ import annotations

import argparse
import html
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
DEFAULT_REFINEMENT_QUEUE_JSON = (
    DEFAULT_ROOT
    / "shorts-command-room"
    / "cut-quality-refinement-queue"
    / "quipsly-studio-shorts-cut-quality-refinement-queue.json"
)
DEFAULT_PACKET_INDEX_JSON = (
    DEFAULT_ROOT
    / "shorts-command-room"
    / "cut-quality-review-packets"
    / "index"
    / "quipsly-studio-shorts-cut-quality-review-packet-index.json"
)
DEFAULT_WORKORDER_ROOT = DEFAULT_ROOT / "shorts-command-room" / "cut-quality-polish-workorders"
DEFAULT_NOTE_PREVIEW_ROOT = DEFAULT_ROOT / "shorts-command-room" / "cut-quality-polish-note-previews"
DEFAULT_WORKSHEET_ROOT = DEFAULT_ROOT / "shorts-command-room" / "cut-quality-worksheets"
DEFAULT_OUTPUT_ROOT = DEFAULT_ROOT / "shorts-command-room" / "cut-quality-polish-cockpits"
SCHEMA = "quipsly.studio.shorts-cut-quality-polish-cockpit.v1"
VERSION = "2026-07-02.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""))


def safe_slug(value: Any) -> str:
    text = str(value or "cockpit")
    clean = "".join(ch.lower() if ch.isalnum() else "-" for ch in text)
    while "--" in clean:
        clean = clean.replace("--", "-")
    return clean.strip("-")[:96] or "cockpit"


def file_uri(path: str | Path) -> str:
    if not path:
        return ""
    try:
        return Path(path).expanduser().resolve().as_uri()
    except ValueError:
        return ""


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise SystemExit(f"Required JSON not found: {path}")
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise SystemExit(f"Expected JSON object: {path}")
    return data


def latest_json(root: Path, short_id: str, suffix: str) -> Path | None:
    paths = sorted(
        (root / safe_slug(short_id)).glob(f"*/*{suffix}.json"),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    return paths[0] if paths else None


def choose_short(queue_path: Path, short_id: str) -> dict[str, Any]:
    queue = read_json(queue_path)
    items = [item for item in queue.get("items", []) if isinstance(item, dict)]
    if short_id:
        for item in items:
            if str(item.get("shortId") or "") == short_id:
                return item
        raise SystemExit(f"Short not found in refinement queue: {short_id}")
    if items:
        return items[0]
    raise SystemExit("Refinement queue has no items. Run: script/agentctl.sh studio-shorts-cut-quality-refinement-queue --all")


def packet_for_short(packet_index_path: Path, short_id: str) -> dict[str, Any]:
    index = read_json(packet_index_path)
    for row in index.get("latestByShort", []):
        if isinstance(row, dict) and str(row.get("shortId") or "") == short_id:
            paths = row.get("artifactPaths") if isinstance(row.get("artifactPaths"), dict) else {}
            packet_json = Path(str(paths.get("json") or "")).expanduser()
            packet = read_json(packet_json)
            packet["_indexRow"] = row
            return packet
    raise SystemExit(f"Short not found in review-packet index: {short_id}")


def frame_rows(packet: dict[str, Any]) -> list[dict[str, Any]]:
    visual = packet.get("visualEvidence") if isinstance(packet.get("visualEvidence"), dict) else {}
    return [frame for frame in visual.get("frames", []) if isinstance(frame, dict) and frame.get("status") == "ok"]


def build_cockpit(
    short_id: str,
    queue_path: Path,
    packet_index_path: Path,
    workorder_root: Path,
    note_preview_root: Path,
    worksheet_root: Path,
    output_root: Path,
) -> tuple[dict[str, Any], Path]:
    queue_item = choose_short(queue_path, short_id)
    selected_id = str(queue_item.get("shortId") or "")
    packet = packet_for_short(packet_index_path, selected_id)
    workorder_path = latest_json(workorder_root, selected_id, "polish-workorder")
    note_preview_path = latest_json(note_preview_root, selected_id, "polish-note-preview")
    worksheet_paths = sorted(
        (worksheet_root / safe_slug(selected_id)).glob("*cut-quality-worksheet.json"),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    workorder = read_json(workorder_path) if workorder_path else {}
    note_preview = read_json(note_preview_path) if note_preview_path else {}
    latest_worksheet = read_json(worksheet_paths[0]) if worksheet_paths else {}
    audio = packet.get("audioEvidence") if isinstance(packet.get("audioEvidence"), dict) else {}
    cadence = audio.get("cadenceAssessment") if isinstance(audio.get("cadenceAssessment"), dict) else {}
    volume = audio.get("volume") if isinstance(audio.get("volume"), dict) else {}
    frames = frame_rows(packet)
    first_frame = frames[0] if frames else {}
    folder = output_root / safe_slug(selected_id) / f"{stamp()}-{safe_slug(selected_id)}-polish-cockpit"
    folder.mkdir(parents=True, exist_ok=False)
    payload = {
        "schema": SCHEMA,
        "version": VERSION,
        "generatedAt": iso_now(),
        "shortId": selected_id,
        "episode": queue_item.get("episode"),
        "episodeVersion": queue_item.get("episodeVersion"),
        "title": queue_item.get("title"),
        "lane": queue_item.get("lane"),
        "score": queue_item.get("score"),
        "reasons": queue_item.get("reasons") or [],
        "mediaPath": packet.get("mediaPath"),
        "mediaUri": packet.get("mediaUri") or file_uri(packet.get("mediaPath") or ""),
        "reviewPacketHtml": queue_item.get("reviewPacketHtml") or ((packet.get("_indexRow") or {}).get("artifactPaths") or {}).get("html"),
        "workorderHtml": ((workorder.get("artifactPaths") or {}).get("html") if workorder else ""),
        "notePreviewHtml": ((note_preview.get("artifactPaths") or {}).get("html") if note_preview else ""),
        "worksheetHtml": ((latest_worksheet.get("artifactPaths") or {}).get("html") if latest_worksheet else ""),
        "visual": {
            "frameCount": len(frames),
            "firstFramePath": first_frame.get("path"),
            "firstFrameUri": first_frame.get("uri") or file_uri(first_frame.get("path") or ""),
            "contactSheetHtml": ((packet.get("visualEvidence") or {}).get("contactSheetHtml") if isinstance(packet.get("visualEvidence"), dict) else ""),
        },
        "audio": {
            "waveformPath": audio.get("waveformPath"),
            "waveformUri": audio.get("waveformUri") or file_uri(audio.get("waveformPath") or ""),
            "cadence": cadence,
            "volume": volume,
        },
        "tasks": workorder.get("tasks") or [],
        "previewRows": note_preview.get("previewRows") or [],
        "safeCommands": {
            "openCockpit": "",
            "openReviewPacket": f"open {shell_quote(str(queue_item.get('reviewPacketHtml') or ''))}",
            "openWorkorder": f"open {shell_quote(str((workorder.get('artifactPaths') or {}).get('html') or ''))}" if workorder else f"script/agentctl.sh studio-shorts-cut-quality-polish-workorder --short-id {shell_quote(selected_id)}",
            "openNotePreview": f"open {shell_quote(str((note_preview.get('artifactPaths') or {}).get('html') or ''))}" if note_preview else f"script/agentctl.sh studio-shorts-cut-quality-polish-note-preview --short-id {shell_quote(selected_id)}",
            "createWorksheet": f"script/agentctl.sh studio-shorts-cut-quality-worksheet --short-id {shell_quote(selected_id)} --reviewer '<reviewer>'",
            "indexWorksheets": "script/agentctl.sh studio-shorts-cut-quality-worksheet-index --all",
        },
        "counts": {
            "tasks": len(workorder.get("tasks") or []),
            "previewRows": len(note_preview.get("previewRows") or []),
            "worksheetAvailable": bool(latest_worksheet),
            "notesRecorded": 0,
            "decisionsRecorded": 0,
            "externalPublishing": False,
            "receiptTruthCreated": False,
        },
        "nextSafestAction": "Watch/listen in this cockpit. If a suggested note is still true, copy that note command from the preview. Do not record keep/refine/hold intent until evidence notes exist.",
        "truth": (
            "Polish cockpit only. It gathers local review surfaces and commands. It records no notes, records no decisions, "
            "edits no timeline, exports no media, publishes nothing, uploads nothing, mutates no source media, overwrites no "
            "previous cockpit, deletes nothing, and creates no approval or receipt truth."
        ),
    }
    return payload, folder


def render_markdown(payload: dict[str, Any]) -> str:
    lines = [
        "# Shorts polish cockpit",
        "",
        f"- Short: `{payload.get('shortId')}`",
        f"- Episode/version: `Episode {payload.get('episode')}` / `{payload.get('episodeVersion')}`",
        f"- Title: {payload.get('title')}",
        f"- Lane/score: `{payload.get('lane')}` / `{payload.get('score')}`",
        f"- Media: `{payload.get('mediaPath')}`",
        "",
        payload.get("truth", ""),
        "",
        f"Next safest action: {payload.get('nextSafestAction')}",
        "",
        "## Doors",
        "",
        f"- Review packet: `{payload.get('reviewPacketHtml')}`",
        f"- Workorder: `{payload.get('workorderHtml')}`",
        f"- Note preview: `{payload.get('notePreviewHtml')}`",
        f"- Worksheet: `{payload.get('worksheetHtml')}`",
        "",
        "## Tasks",
        "",
    ]
    for task in payload.get("tasks", []):
        lines.extend(
            [
                f"### {task.get('field')} ({task.get('priority')})",
                "",
                f"- Evidence: {task.get('evidence')}",
                f"- Instruction: {task.get('instruction')}",
                "",
            ]
        )
    return "\n".join(lines).rstrip() + "\n"


def render_html(payload: dict[str, Any]) -> str:
    media_uri = str(payload.get("mediaUri") or "")
    first_frame = str((payload.get("visual") or {}).get("firstFrameUri") or "")
    waveform = str((payload.get("audio") or {}).get("waveformUri") or "")
    tasks = "".join(
        f"""
        <article class="card">
          <p class="eyebrow">{esc(task.get('priority'))} · {esc(task.get('field'))}</p>
          <h2>{esc(task.get('field'))}</h2>
          <p><strong>Evidence:</strong> {esc(task.get('evidence'))}</p>
          <p><strong>Instruction:</strong> {esc(task.get('instruction'))}</p>
        </article>
        """
        for task in payload.get("tasks", [])
    )
    previews = "".join(
        f"""
        <article class="card">
          <p class="eyebrow">copy after review · {esc(row.get('field'))}</p>
          <h2>{esc(row.get('field'))}</h2>
          <p>{esc(row.get('suggestedNote'))}</p>
          <button type="button" data-copy="{esc(row.get('command'))}">Copy note command</button>
          <code>{esc(row.get('command'))}</code>
        </article>
        """
        for row in payload.get("previewRows", [])
    )
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Quipsly polish cockpit - {esc(payload.get('shortId'))}</title>
  <style>
    :root {{ color-scheme: dark; --soil:#15110b; --moss:#203522; --leaf:#8edc89; --honey:#f3ce54; --cream:#fff1d4; --line:rgba(255,241,212,.16); --clay:#df6a4f; }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:var(--cream); background:radial-gradient(circle at 8% -8%,rgba(142,220,137,.24),transparent 32rem),linear-gradient(135deg,var(--moss),var(--soil)); }}
    main {{ width:min(1500px,calc(100vw - 40px)); margin:0 auto; padding:36px 0 80px; }}
    header,.panel,.card {{ border:1px solid var(--line); border-radius:28px; background:rgba(255,241,212,.07); box-shadow:0 24px 80px rgba(0,0,0,.26); }}
    header {{ padding:32px; margin-bottom:18px; }}
    .eyebrow {{ color:var(--honey); letter-spacing:.16em; text-transform:uppercase; font-size:.76rem; font-weight:950; margin:0 0 8px; }}
    h1 {{ margin:0 0 12px; font-size:clamp(2.4rem,7vw,5.8rem); line-height:.9; }}
    h2 {{ margin:0 0 8px; }}
    p {{ color:#e0d1b4; line-height:1.55; }}
    .grid {{ display:grid; grid-template-columns:minmax(280px,430px) 1fr; gap:16px; align-items:start; }}
    .panel,.card {{ padding:18px; }}
    video {{ width:100%; max-height:720px; border-radius:22px; background:#000; border:1px solid var(--line); }}
    img {{ max-width:100%; border-radius:18px; border:1px solid var(--line); background:#000; }}
    .tasks,.previews {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(340px,1fr)); gap:12px; margin-top:14px; }}
    .button,button {{ display:inline-block; border:1px solid rgba(243,206,84,.5); border-radius:999px; padding:9px 13px; color:var(--honey); background:rgba(0,0,0,.18); font-weight:950; margin:8px 8px 8px 0; text-decoration:none; }}
    code {{ display:block; color:#ffeaa3; overflow-wrap:anywhere; }}
    .truth {{ border-left:4px solid var(--honey); padding-left:14px; }}
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
    <p class="eyebrow">Quipsly Studio · polish cockpit</p>
    <h1>{esc(payload.get('shortId'))}</h1>
    <p class="truth">{esc(payload.get('truth'))}</p>
    <p>{esc(payload.get('nextSafestAction'))}</p>
    <a class="button" href="{esc(file_uri(payload.get('reviewPacketHtml') or ''))}">Review packet</a>
    <a class="button" href="{esc(file_uri(payload.get('workorderHtml') or ''))}">Workorder</a>
    <a class="button" href="{esc(file_uri(payload.get('notePreviewHtml') or ''))}">Note preview</a>
    <a class="button" href="{esc(file_uri(payload.get('worksheetHtml') or ''))}">Worksheet</a>
  </header>
  <section class="grid">
    <aside class="panel">
      <p class="eyebrow">watch/listen</p>
      <video controls preload="metadata" src="{esc(media_uri)}"></video>
      <p class="eyebrow">representative frame</p>
      <img src="{esc(first_frame)}" alt="Representative frame">
      <p class="eyebrow">waveform</p>
      <img src="{esc(waveform)}" alt="Waveform">
    </aside>
    <section>
      <div class="panel">
        <p class="eyebrow">routing</p>
        <h2>{esc(payload.get('title'))}</h2>
        <p>Lane <strong>{esc(payload.get('lane'))}</strong>, score <strong>{esc(payload.get('score'))}</strong>. Use this as a review cockpit, not an approval screen.</p>
      </div>
      <section class="tasks">{tasks}</section>
      <h2 style="margin-top:20px;">Suggested notes, copy only after review</h2>
      <section class="previews">{previews}</section>
    </section>
  </section>
</main>
</body>
</html>"""


def write_outputs(payload: dict[str, Any], folder: Path) -> dict[str, str]:
    paths = {
        "json": folder / f"{safe_slug(payload.get('shortId'))}-polish-cockpit.json",
        "markdown": folder / f"{safe_slug(payload.get('shortId'))}-polish-cockpit.md",
        "html": folder / f"{safe_slug(payload.get('shortId'))}-polish-cockpit.html",
    }
    paths["json"].write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
    paths["markdown"].write_text(render_markdown(payload), encoding="utf-8")
    paths["html"].write_text(render_html(payload), encoding="utf-8")
    return {key: str(path) for key, path in paths.items()}


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a one-short polish cockpit.")
    parser.add_argument("--short-id", default="", help="Specific short id. Defaults to top refinement queue item.")
    parser.add_argument("--queue", default=str(DEFAULT_REFINEMENT_QUEUE_JSON), help="Refinement queue JSON.")
    parser.add_argument("--packet-index", default=str(DEFAULT_PACKET_INDEX_JSON), help="Review packet index JSON.")
    parser.add_argument("--workorder-root", default=str(DEFAULT_WORKORDER_ROOT), help="Polish workorder root.")
    parser.add_argument("--note-preview-root", default=str(DEFAULT_NOTE_PREVIEW_ROOT), help="Polish note preview root.")
    parser.add_argument("--worksheet-root", default=str(DEFAULT_WORKSHEET_ROOT), help="Worksheet root.")
    parser.add_argument("--output-root", default=str(DEFAULT_OUTPUT_ROOT), help="Output root.")
    parser.add_argument("--format", choices=["markdown", "json", "html", "all"], default="markdown")
    parser.add_argument("--markdown", dest="format", action="store_const", const="markdown")
    parser.add_argument("--json", dest="format", action="store_const", const="json")
    parser.add_argument("--html", dest="format", action="store_const", const="html")
    parser.add_argument("--all", dest="format", action="store_const", const="all")
    args = parser.parse_args()

    payload, folder = build_cockpit(
        args.short_id,
        Path(args.queue).expanduser(),
        Path(args.packet_index).expanduser(),
        Path(args.workorder_root).expanduser(),
        Path(args.note_preview_root).expanduser(),
        Path(args.worksheet_root).expanduser(),
        Path(args.output_root).expanduser(),
    )
    paths = write_outputs(payload, folder)
    payload["artifactPaths"] = paths
    payload["safeCommands"]["openCockpit"] = f"open {shell_quote(paths['html'])}"
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
