#!/usr/bin/env python3
"""Create a concrete polish workorder for one short.

The workorder turns review-packet evidence into specific inspection/refinement
tasks. It does not record a decision, edit a timeline, export media, publish,
upload, mutate source media, overwrite previous workorders, or create receipt
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
DEFAULT_OUTPUT_ROOT = DEFAULT_ROOT / "shorts-command-room" / "cut-quality-polish-workorders"
SCHEMA = "quipsly.studio.shorts-cut-quality-polish-workorder.v1"
VERSION = "2026-07-02.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""))


def safe_slug(value: Any) -> str:
    text = str(value or "workorder")
    clean = "".join(ch.lower() if ch.isalnum() else "-" for ch in text)
    while "--" in clean:
        clean = clean.replace("--", "-")
    return clean.strip("-")[:96] or "workorder"


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def file_uri(path: str | Path) -> str:
    try:
        return Path(path).expanduser().resolve().as_uri()
    except ValueError:
        return ""


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise SystemExit(f"Required JSON not found: {path}")
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise SystemExit(f"Expected JSON object: {path}")
    return data


def choose_queue_item(queue: dict[str, Any], short_id: str) -> dict[str, Any]:
    items = [item for item in queue.get("items", []) if isinstance(item, dict)]
    if short_id:
        for item in items:
            if str(item.get("shortId") or "") == short_id:
                return item
        raise SystemExit(f"Short not found in refinement queue: {short_id}")
    if items:
        return items[0]
    raise SystemExit("Refinement queue has no items.")


def packet_row(packet_index: dict[str, Any], short_id: str) -> dict[str, Any]:
    for row in packet_index.get("latestByShort", []):
        if isinstance(row, dict) and str(row.get("shortId") or "") == short_id:
            return row
    raise SystemExit(f"Short not found in review-packet index: {short_id}")


def load_packet(row: dict[str, Any]) -> dict[str, Any]:
    paths = row.get("artifactPaths") if isinstance(row.get("artifactPaths"), dict) else {}
    json_path = Path(str(paths.get("json") or "")).expanduser()
    return read_json(json_path)


def frame_rows(packet: dict[str, Any]) -> list[dict[str, Any]]:
    visual = packet.get("visualEvidence") if isinstance(packet.get("visualEvidence"), dict) else {}
    return [frame for frame in visual.get("frames", []) if isinstance(frame, dict) and frame.get("status") == "ok"]


def audio_metrics(packet: dict[str, Any]) -> dict[str, Any]:
    audio = packet.get("audioEvidence") if isinstance(packet.get("audioEvidence"), dict) else {}
    cadence = audio.get("cadenceAssessment") if isinstance(audio.get("cadenceAssessment"), dict) else {}
    volume = audio.get("volume") if isinstance(audio.get("volume"), dict) else {}
    silences = [row for row in audio.get("silences", []) if isinstance(row, dict)]
    return {
        "status": audio.get("status"),
        "waveformPath": audio.get("waveformPath"),
        "waveformUri": audio.get("waveformUri") or file_uri(audio.get("waveformPath") or ""),
        "cadence": cadence,
        "volume": volume,
        "silences": silences,
    }


def suggested_tasks(queue_item: dict[str, Any], packet: dict[str, Any]) -> list[dict[str, Any]]:
    metrics = audio_metrics(packet)
    cadence = metrics["cadence"]
    volume = metrics["volume"]
    frames = frame_rows(packet)
    first_frame = frames[0] if frames else {}
    title = str(packet.get("title") or queue_item.get("title") or packet.get("shortId") or "this short")
    tasks = [
        {
            "field": "hook",
            "priority": "high",
            "evidence": f"First extracted frame at {first_frame.get('timestamp', 'unknown')}s shows a close speaking face/mic composition." if first_frame else "Visual contact sheet is available but no frame summary was found.",
            "instruction": "Watch the first two seconds and confirm the spoken idea lands immediately. If the first words are setup-only, mark a tighter in-point or add a title hook.",
            "suggestedNote": f"{title}: opening has clear face energy; verify the first spoken beat states a reason to keep watching before treating it as publish-ready.",
        },
        {
            "field": "cropFraming",
            "priority": "high",
            "evidence": "Representative frame is a tight 9:16 close-up with face and microphone occupying the central/lower region.",
            "instruction": "Check all frames for face placement. Keep eyes/face dominant, avoid accidental forehead/hat crop, and avoid hiding the mic/gesture if it supports the emotion.",
            "suggestedNote": "Tight vertical crop looks usable, but face/mic density means framing should be checked across the whole short before export.",
        },
        {
            "field": "captionPlan",
            "priority": "high",
            "evidence": "Platform check says 9:16 is plausible and caption/timing review is the readiness layer.",
            "instruction": "Place captions where they do not cover the mouth, mic, eyes, or key reaction area. Prefer a safe band that stays readable across the contact-sheet frames.",
            "suggestedNote": "Caption plan needs visual safe-zone review because the close-up leaves limited clean caption space.",
        },
        {
            "field": "cadence",
            "priority": "medium",
            "evidence": f"Cadence label `{cadence.get('label')}`; {cadence.get('meaningfulPauseCount')} meaningful pauses, {cadence.get('longPauseCount')} long pauses, longest {cadence.get('longestPauseSeconds')}s, silence fraction {cadence.get('silenceFraction')}.",
            "instruction": "Listen once before tightening. Preserve pauses that feel like emphasis or human thinking; only trim if they feel like dead air.",
            "suggestedNote": "Cadence metrics look plausible; do not over-tighten unless listening reveals dead air.",
        },
        {
            "field": "audioFeel",
            "priority": "medium",
            "evidence": f"Mean volume {volume.get('meanVolumeDb')} dB, max volume {volume.get('maxVolumeDb')} dB.",
            "instruction": "Listen for harshness or clipping risk. Max volume is close enough to the ceiling that loudness polish should avoid making it brittle.",
            "suggestedNote": "Audio has signal and plausible rhythm; final listen should check loudness harshness before platform export.",
        },
        {
            "field": "jCutLCut",
            "priority": "medium",
            "evidence": "Cadence has short pauses but no long-pause warning.",
            "instruction": "Inspect the in/out around this short in the episode. Use a J-cut or L-cut if the idea starts/ends abruptly when pulled out as a standalone clip.",
            "suggestedNote": "J/L cut decision depends on neighboring episode context; inspect in/out before finalizing.",
        },
        {
            "field": "endingPayoff",
            "priority": "medium",
            "evidence": "This is the top polish-first candidate, but no semantic transcript proof was reviewed in this pass.",
            "instruction": "Confirm the final beat has a payoff, not just a cut-off thought. If it ends mid-idea, mark a better out-point or add a caption/title closure.",
            "suggestedNote": "Ending payoff still needs watch/listen confirmation before keep/refine intent.",
        },
    ]
    return tasks


def note_commands(short_id: str, tasks: list[dict[str, Any]]) -> list[dict[str, str]]:
    commands = []
    for task in tasks:
        note = str(task.get("suggestedNote") or "")
        field = str(task.get("field") or "")
        commands.append(
            {
                "field": field,
                "command": (
                    "script/agentctl.sh studio-shorts-cut-quality-note "
                    f"--short-id {shell_quote(short_id)} --field {field} --note {shell_quote(note)}"
                ),
            }
        )
    return commands


def build_workorder(queue_path: Path, packet_index_path: Path, output_root: Path, short_id: str) -> tuple[dict[str, Any], Path]:
    queue = read_json(queue_path)
    index = read_json(packet_index_path)
    item = choose_queue_item(queue, short_id)
    selected_id = str(item.get("shortId") or "")
    row = packet_row(index, selected_id)
    packet = load_packet(row)
    tasks = suggested_tasks(item, packet)
    folder = output_root / safe_slug(selected_id) / f"{stamp()}-{safe_slug(selected_id)}-polish-workorder"
    folder.mkdir(parents=True, exist_ok=False)
    payload = {
        "schema": SCHEMA,
        "version": VERSION,
        "generatedAt": iso_now(),
        "sourceRefinementQueueJson": str(queue_path),
        "sourceReviewPacketIndexJson": str(packet_index_path),
        "shortId": selected_id,
        "episode": item.get("episode"),
        "episodeVersion": item.get("episodeVersion"),
        "title": item.get("title"),
        "lane": item.get("lane"),
        "score": item.get("score"),
        "reasons": item.get("reasons") or [],
        "reviewPacketHtml": item.get("reviewPacketHtml") or (row.get("artifactPaths") or {}).get("html"),
        "mediaPath": packet.get("mediaPath"),
        "visualEvidence": {
            "frameCount": len(frame_rows(packet)),
            "firstFrame": frame_rows(packet)[0] if frame_rows(packet) else {},
            "contactSheetHtml": ((packet.get("visualEvidence") or {}).get("contactSheetHtml") if isinstance(packet.get("visualEvidence"), dict) else ""),
        },
        "audioEvidence": audio_metrics(packet),
        "tasks": tasks,
        "suggestedNoteCommands": note_commands(selected_id, tasks),
        "nextSafestAction": "Open the review packet and this polish workorder side by side, watch/listen once, then record only the notes that still feel true after review.",
        "truth": (
            "Polish workorder only. It proposes evidence-based review tasks and note commands. It records no review decision, "
            "edits no timeline, exports no media, publishes nothing, uploads nothing, transcribes nothing, mutates no source media, "
            "overwrites no previous workorder, deletes nothing, and creates no approval or receipt truth."
        ),
    }
    return payload, folder


def render_markdown(payload: dict[str, Any]) -> str:
    lines = [
        "# Shorts cut-quality polish workorder",
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
        "## Tasks",
        "",
    ]
    for task in payload.get("tasks", []):
        lines.extend([
            f"### {task.get('field')} ({task.get('priority')})",
            "",
            f"- Evidence: {task.get('evidence')}",
            f"- Instruction: {task.get('instruction')}",
            f"- Suggested note: {task.get('suggestedNote')}",
            "",
        ])
    lines.extend(["## Suggested note commands", ""])
    for command in payload.get("suggestedNoteCommands", []):
        lines.append(f"- `{command.get('command')}`")
    return "\n".join(lines).rstrip() + "\n"


def render_html(payload: dict[str, Any]) -> str:
    tasks = []
    for task in payload.get("tasks", []):
        tasks.append(
            f"""
            <article class="task">
              <p class="eyebrow">{esc(task.get('priority'))} · {esc(task.get('field'))}</p>
              <h2>{esc(task.get('field'))}</h2>
              <p><strong>Evidence:</strong> {esc(task.get('evidence'))}</p>
              <p><strong>Instruction:</strong> {esc(task.get('instruction'))}</p>
              <p><strong>Suggested note:</strong> {esc(task.get('suggestedNote'))}</p>
            </article>
            """
        )
    packet = str(payload.get("reviewPacketHtml") or "")
    first_frame = ((payload.get("visualEvidence") or {}).get("firstFrame") or {}).get("uri") or ""
    waveform = ((payload.get("audioEvidence") or {}).get("waveformUri") or "")
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Quipsly polish workorder - {esc(payload.get('shortId'))}</title>
  <style>
    :root {{ color-scheme: dark; --soil:#15110b; --moss:#203522; --leaf:#8edc89; --honey:#f3ce54; --cream:#fff1d4; --line:rgba(255,241,212,.16); }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:var(--cream); background:radial-gradient(circle at 10% -8%,rgba(142,220,137,.25),transparent 32rem),linear-gradient(135deg,var(--moss),var(--soil)); }}
    main {{ width:min(1440px,calc(100vw - 40px)); margin:0 auto; padding:36px 0 80px; }}
    header,.task,.evidence {{ border:1px solid var(--line); border-radius:28px; background:rgba(255,241,212,.07); box-shadow:0 24px 80px rgba(0,0,0,.26); }}
    header {{ padding:32px; margin-bottom:16px; }}
    .eyebrow {{ color:var(--honey); letter-spacing:.16em; text-transform:uppercase; font-size:.76rem; font-weight:950; margin:0 0 8px; }}
    h1 {{ margin:0 0 12px; font-size:clamp(2.3rem,7vw,5.5rem); line-height:.9; }}
    h2 {{ margin:0 0 8px; }}
    p {{ color:#e0d1b4; line-height:1.55; }}
    .button {{ display:inline-block; border:1px solid rgba(243,206,84,.5); border-radius:999px; padding:9px 13px; color:var(--honey); text-decoration:none; font-weight:950; margin:10px 0; }}
    .grid {{ display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:14px; }}
    .evidence,.task {{ padding:18px; }}
    .evidence img {{ max-width:100%; border-radius:16px; border:1px solid var(--line); background:#000; }}
    .tasks {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(360px,1fr)); gap:14px; }}
    code {{ display:block; color:#ffeaa3; overflow-wrap:anywhere; }}
  </style>
</head>
<body>
<main>
  <header>
    <p class="eyebrow">Quipsly Studio · polish workorder</p>
    <h1>{esc(payload.get('shortId'))}</h1>
    <p>{esc(payload.get('truth'))}</p>
    <a class="button" href="{esc(file_uri(packet))}">Open review packet</a>
    <code>{esc(packet)}</code>
  </header>
  <section class="grid">
    <article class="evidence">
      <p class="eyebrow">Representative frame</p>
      <img src="{esc(first_frame)}" alt="Representative frame">
    </article>
    <article class="evidence">
      <p class="eyebrow">Waveform</p>
      <img src="{esc(waveform)}" alt="Waveform">
    </article>
  </section>
  <section class="tasks">{''.join(tasks)}</section>
</main>
</body>
</html>"""


def write_outputs(payload: dict[str, Any], folder: Path) -> dict[str, str]:
    paths = {
        "json": folder / f"{safe_slug(payload.get('shortId'))}-polish-workorder.json",
        "markdown": folder / f"{safe_slug(payload.get('shortId'))}-polish-workorder.md",
        "html": folder / f"{safe_slug(payload.get('shortId'))}-polish-workorder.html",
    }
    paths["json"].write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
    paths["markdown"].write_text(render_markdown(payload), encoding="utf-8")
    paths["html"].write_text(render_html(payload), encoding="utf-8")
    return {key: str(path) for key, path in paths.items()}


def main() -> None:
    parser = argparse.ArgumentParser(description="Create a short polish workorder from review evidence.")
    parser.add_argument("--short-id", default="", help="Specific short id. Defaults to the top refinement queue item.")
    parser.add_argument("--queue", default=str(DEFAULT_REFINEMENT_QUEUE_JSON), help="Refinement queue JSON.")
    parser.add_argument("--packet-index", default=str(DEFAULT_PACKET_INDEX_JSON), help="Review packet index JSON.")
    parser.add_argument("--output-root", default=str(DEFAULT_OUTPUT_ROOT), help="Output root.")
    parser.add_argument("--format", choices=["markdown", "json", "html", "all"], default="markdown")
    parser.add_argument("--markdown", dest="format", action="store_const", const="markdown")
    parser.add_argument("--json", dest="format", action="store_const", const="json")
    parser.add_argument("--html", dest="format", action="store_const", const="html")
    parser.add_argument("--all", dest="format", action="store_const", const="all")
    args = parser.parse_args()

    payload, folder = build_workorder(
        Path(args.queue).expanduser(),
        Path(args.packet_index).expanduser(),
        Path(args.output_root).expanduser(),
        args.short_id,
    )
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
