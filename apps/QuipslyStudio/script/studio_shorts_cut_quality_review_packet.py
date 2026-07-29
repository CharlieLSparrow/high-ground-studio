#!/usr/bin/env python3
"""Build a one-short cut-quality review packet from visual and audio evidence.

The packet is a calm review cockpit: native short media, latest visual contact
sheet, latest audio/cadence probe, reviewer questions, and safe note commands.
It creates local review artifacts only. It does not approve, publish, edit,
export, transcribe, or mutate media.
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
    / "cut-quality-workbench"
    / "quipsly-studio-shorts-cut-quality-workbench.json"
)
DEFAULT_CONTACT_SHEET_INDEX_JSON = (
    DEFAULT_ROOT
    / "shorts-command-room"
    / "cut-quality-contact-sheets"
    / "index"
    / "quipsly-studio-shorts-cut-quality-contact-sheet-index.json"
)
DEFAULT_AUDIO_PROBE_INDEX_JSON = (
    DEFAULT_ROOT
    / "shorts-command-room"
    / "cut-quality-audio-probes"
    / "index"
    / "quipsly-studio-shorts-cut-quality-audio-probe-index.json"
)
DEFAULT_OUTPUT_DIR = DEFAULT_ROOT / "shorts-command-room" / "cut-quality-review-packets"
SCHEMA = "quipsly.studio.shorts-cut-quality-review-packet.v1"
VERSION = "2026-07-02.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""))


def safe_slug(value: Any) -> str:
    text = str(value or "packet")
    clean = "".join(ch.lower() if ch.isalnum() else "-" for ch in text)
    while "--" in clean:
        clean = clean.replace("--", "-")
    return clean.strip("-")[:96] or "packet"


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def file_uri(path: str | Path) -> str:
    try:
        return Path(path).expanduser().resolve().as_uri()
    except ValueError:
        return ""


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        with path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
    except (OSError, json.JSONDecodeError):
        return {}
    return data if isinstance(data, dict) else {}


def workbench_items(board: dict[str, Any]) -> list[dict[str, Any]]:
    return [item for item in board.get("items", []) if isinstance(item, dict)]


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
    for level in ("watch-listen-first", "caption-timing-review", "transcript-review", "media-needs-repair"):
        for item in items:
            if str(item.get("readinessLevel") or "") == level:
                return item
    if items:
        return items[0]
    raise SystemExit("Cut-quality workbench has no items.")


def latest_for_short(index: dict[str, Any], short_id: str) -> dict[str, Any]:
    for row in index.get("latestByShort", []):
        if isinstance(row, dict) and str(row.get("shortId") or "") == short_id:
            return row
    return {}


def load_artifact_json(row: dict[str, Any]) -> dict[str, Any]:
    paths = row.get("artifactPaths") if isinstance(row.get("artifactPaths"), dict) else {}
    json_path = Path(str(paths.get("json") or "")).expanduser()
    return read_json(json_path) if str(json_path) else {}


def question_rows(item: dict[str, Any]) -> list[dict[str, Any]]:
    return [row for row in item.get("editorQuestions", []) if isinstance(row, dict)]


def note_commands(short_id: str) -> dict[str, str]:
    fields = {
        "hook": "What the first visual/audio beat proves.",
        "cadence": "Whether detected pauses feel human, dead, or over-tightened.",
        "jCutLCut": "Where an audio lead or tail could make the edit flow.",
        "jumpCutCover": "Whether the visual jump needs reaction cover, crop punch, or B-roll.",
        "reactionBeat": "Whether a listening/reaction beat should be preserved.",
        "captionPlan": "Whether captions have safe space and need timed text evidence.",
        "cropFraming": "Whether 9:16 face placement and subject scale work.",
        "audioFeel": "Whether loudness/noise/cadence feels platform-ready.",
        "endingPayoff": "Whether the final beat lands or needs a cleaner out.",
        "platformFit": "Best platform use and whether this should be split/threaded.",
        "riskTradeoff": "What we preserve versus tighten.",
    }
    return {
        field: (
            "script/agentctl.sh studio-shorts-cut-quality-note "
            f"--short-id {shell_quote(short_id)} --field {field} "
            f"--note '<{hint}>'"
        )
        for field, hint in fields.items()
    }


def build_packet(
    workbench_path: Path,
    contact_index_path: Path,
    audio_index_path: Path,
    item: dict[str, Any],
    output_dir: Path,
) -> tuple[dict[str, Any], Path]:
    short_id = str(item.get("shortId") or "short")
    contact_index = read_json(contact_index_path)
    audio_index = read_json(audio_index_path)
    contact_row = latest_for_short(contact_index, short_id)
    audio_row = latest_for_short(audio_index, short_id)
    contact_payload = load_artifact_json(contact_row) if contact_row else {}
    audio_payload = load_artifact_json(audio_row) if audio_row else {}
    media_path = str(item.get("mediaPath") or item.get("path") or contact_row.get("mediaPath") or audio_row.get("mediaPath") or "")
    media_uri = file_uri(media_path) if media_path else ""
    folder = output_dir / safe_slug(short_id) / f"{stamp()}-{safe_slug(short_id)}-review-packet"
    folder.mkdir(parents=True, exist_ok=False)

    contact_frames = [
        frame
        for frame in contact_payload.get("frames", [])
        if isinstance(frame, dict) and frame.get("status") == "ok"
    ]
    cadence = audio_payload.get("cadenceAssessment") if isinstance(audio_payload.get("cadenceAssessment"), dict) else {}
    volume = audio_payload.get("volume") if isinstance(audio_payload.get("volume"), dict) else {}
    silences = [row for row in audio_payload.get("silences", []) if isinstance(row, dict)]
    missing_evidence = []
    if not contact_row:
        missing_evidence.append("visual-contact-sheet")
    if not audio_row:
        missing_evidence.append("audio-cadence-probe")

    payload = {
        "schema": SCHEMA,
        "version": VERSION,
        "generatedAt": iso_now(),
        "sourceWorkbenchJson": str(workbench_path),
        "sourceContactSheetIndexJson": str(contact_index_path),
        "sourceAudioProbeIndexJson": str(audio_index_path),
        "shortId": short_id,
        "episode": item.get("episode"),
        "episodeVersion": item.get("version"),
        "rank": item.get("rank"),
        "title": item.get("title"),
        "readinessLevel": item.get("readinessLevel"),
        "mediaPath": media_path,
        "mediaUri": media_uri,
        "platformChecks": item.get("platformChecks") or [],
        "editorQuestions": question_rows(item),
        "visualEvidence": {
            "status": "available" if contact_row else "missing",
            "latestIndexRow": contact_row,
            "contactSheetJson": (contact_row.get("artifactPaths") or {}).get("json") if contact_row else "",
            "contactSheetHtml": (contact_row.get("artifactPaths") or {}).get("html") if contact_row else "",
            "frames": contact_frames,
        },
        "audioEvidence": {
            "status": "available" if audio_row else "missing",
            "latestIndexRow": audio_row,
            "audioProbeJson": (audio_row.get("artifactPaths") or {}).get("json") if audio_row else "",
            "audioProbeHtml": (audio_row.get("artifactPaths") or {}).get("html") if audio_row else "",
            "waveformPath": audio_payload.get("waveformPath") or (audio_row.get("artifactPaths") or {}).get("waveform") if audio_row else "",
            "waveformUri": audio_payload.get("waveformUri") or file_uri((audio_row.get("artifactPaths") or {}).get("waveform", "")) if audio_row else "",
            "cadenceAssessment": cadence,
            "volume": volume,
            "silences": silences,
        },
        "missingEvidence": missing_evidence,
        "noteCommandTemplates": note_commands(short_id),
        "safeCommands": {
            "openShort": f"open {shell_quote(media_path)}" if media_path else "",
            "visualContactSheet": f"open {shell_quote((contact_row.get('artifactPaths') or {}).get('html', ''))}" if contact_row else f"script/agentctl.sh studio-shorts-cut-quality-contact-sheet --short-id {shell_quote(short_id)}",
            "audioProbe": f"open {shell_quote((audio_row.get('artifactPaths') or {}).get('html', ''))}" if audio_row else f"script/agentctl.sh studio-shorts-cut-quality-audio-probe --short-id {shell_quote(short_id)}",
            "worksheet": f"script/agentctl.sh studio-shorts-cut-quality-worksheet --short-id {shell_quote(short_id)}",
            "evidencePreview": f"script/agentctl.sh studio-shorts-cut-quality-evidence-preview --short-id {shell_quote(short_id)}",
        },
        "nextSafestAction": (
            "Watch/listen to the short while comparing frames, waveform, and pause evidence. "
            "Then record specific worksheet notes; do not record keep/refine/hold intent until notes are specific."
            if not missing_evidence
            else "Generate the missing visual/audio evidence first, then rebuild this packet."
        ),
        "truth": (
            "Cut-quality review packet only. It records no review decision, edits no timeline, exports no media, "
            "publishes nothing, uploads nothing, transcribes nothing, mutates no media, overwrites no prior packet, "
            "deletes nothing, and creates no receipt truth."
        ),
    }
    return payload, folder


def render_markdown(payload: dict[str, Any]) -> str:
    audio = payload.get("audioEvidence") if isinstance(payload.get("audioEvidence"), dict) else {}
    cadence = audio.get("cadenceAssessment") if isinstance(audio.get("cadenceAssessment"), dict) else {}
    visual = payload.get("visualEvidence") if isinstance(payload.get("visualEvidence"), dict) else {}
    lines = [
        "# Shorts cut-quality review packet",
        "",
        f"- Short: `{payload.get('shortId')}`",
        f"- Title: {payload.get('title')}",
        f"- Episode/version: `Episode {payload.get('episode')}` / `{payload.get('episodeVersion')}`",
        f"- Readiness: `{payload.get('readinessLevel')}`",
        f"- Media: `{payload.get('mediaPath')}`",
        f"- Visual evidence: `{visual.get('status')}`",
        f"- Audio evidence: `{audio.get('status')}`",
        f"- Cadence label: `{cadence.get('label')}`",
        "",
        payload.get("truth", ""),
        "",
        f"Next safest action: {payload.get('nextSafestAction')}",
        "",
        "## Editor questions",
        "",
    ]
    for question in payload.get("editorQuestions", []):
        lines.append(f"- `{question.get('dimension')}`: {question.get('question')} Watch for: {question.get('watchFor')}")
    lines.extend(["", "## Evidence links", ""])
    lines.append(f"- Contact sheet: `{visual.get('contactSheetHtml')}`")
    lines.append(f"- Audio probe: `{audio.get('audioProbeHtml')}`")
    lines.append(f"- Waveform: `{audio.get('waveformPath')}`")
    lines.extend(["", "## Note commands", ""])
    for field, command in (payload.get("noteCommandTemplates") or {}).items():
        lines.append(f"- {field}: `{command}`")
    return "\n".join(lines).rstrip() + "\n"


def render_html(payload: dict[str, Any]) -> str:
    visual = payload.get("visualEvidence") if isinstance(payload.get("visualEvidence"), dict) else {}
    audio = payload.get("audioEvidence") if isinstance(payload.get("audioEvidence"), dict) else {}
    cadence = audio.get("cadenceAssessment") if isinstance(audio.get("cadenceAssessment"), dict) else {}
    volume = audio.get("volume") if isinstance(audio.get("volume"), dict) else {}
    media = f"<video controls src='{esc(payload.get('mediaUri'))}'></video>" if payload.get("mediaUri") else "<p>No playable media URI.</p>"
    frames = "".join(
        f"<figure><img src='{esc(frame.get('uri'))}' alt='frame at {esc(frame.get('timestamp'))}s'><figcaption>{float(frame.get('timestamp') or 0):.2f}s</figcaption></figure>"
        for frame in visual.get("frames", [])[:12]
        if isinstance(frame, dict)
    )
    waveform = f"<img class='waveform' src='{esc(audio.get('waveformUri'))}' alt='waveform'>" if audio.get("waveformUri") else "<p>No waveform available.</p>"
    silence_rows = "".join(
        f"<li><strong>{esc(row.get('start'))}s - {esc(row.get('end'))}s</strong><span>{esc(row.get('duration'))}s</span></li>"
        for row in audio.get("silences", [])[:16]
        if isinstance(row, dict)
    ) or "<li>No silences detected or no audio probe available.</li>"
    questions = "".join(
        f"<article class='question'><p class='eyebrow'>{esc(question.get('dimension'))}</p><h3>{esc(question.get('question'))}</h3><p>{esc(question.get('watchFor'))}</p></article>"
        for question in payload.get("editorQuestions", [])
        if isinstance(question, dict)
    )
    commands = "".join(
        f"<div class='command'><strong>{esc(field)}</strong><code>{esc(command)}</code></div>"
        for field, command in (payload.get("noteCommandTemplates") or {}).items()
    )
    warnings = "".join(f"<li>{esc(warning)}</li>" for warning in cadence.get("warnings", [])) or "<li>No measurement warnings. Still watch/listen before recording intent.</li>"
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Quipsly shorts cut-quality review packet</title>
  <style>
    :root {{ color-scheme: dark; --soil:#15110b; --moss:#1d3121; --leaf:#8edc89; --honey:#f3ce54; --water:#79d7e2; --cream:#fff1d4; --clay:#d86f57; --line:rgba(255,241,212,.16); }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:var(--cream); background:radial-gradient(circle at 10% -8%,rgba(142,220,137,.22),transparent 28rem),radial-gradient(circle at 90% 0,rgba(121,215,226,.14),transparent 26rem),linear-gradient(135deg,var(--moss),var(--soil)); }}
    main {{ width:min(1580px,calc(100vw - 40px)); margin:0 auto; padding:36px 0 90px; }}
    header,.panel,.question,.command {{ border:1px solid var(--line); border-radius:28px; background:rgba(255,241,212,.07); box-shadow:0 24px 80px rgba(0,0,0,.26); }}
    header {{ padding:32px; margin-bottom:18px; }}
    .eyebrow {{ color:var(--honey); letter-spacing:.16em; text-transform:uppercase; font-size:.76rem; font-weight:950; margin:0 0 8px; }}
    h1 {{ margin:0 0 12px; font-size:clamp(2.4rem,7vw,5.8rem); line-height:.9; }}
    h2,h3 {{ margin:0 0 8px; }}
    p,li {{ color:#e0d1b4; line-height:1.55; }}
    .metrics {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:10px; margin-top:18px; }}
    .metrics div {{ border:1px solid var(--line); border-radius:18px; padding:13px; background:rgba(0,0,0,.22); }}
    .metrics strong {{ display:block; color:var(--leaf); font-size:1.6rem; overflow-wrap:anywhere; }}
    .metrics span {{ color:#cdbf9e; text-transform:uppercase; letter-spacing:.09em; font-size:.72rem; font-weight:900; }}
    .grid {{ display:grid; grid-template-columns:minmax(380px,.9fr) minmax(540px,1.35fr); gap:16px; align-items:start; }}
    .panel {{ padding:20px; margin-bottom:16px; }}
    video {{ width:100%; max-height:620px; border-radius:22px; background:#050505; border:1px solid var(--line); }}
    .frames {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(135px,1fr)); gap:10px; }}
    figure {{ margin:0; border:1px solid var(--line); border-radius:18px; padding:8px; background:rgba(0,0,0,.22); }}
    img {{ display:block; width:100%; border-radius:14px; background:#050505; }}
    .waveform {{ width:100%; border:1px solid var(--line); border-radius:18px; }}
    figcaption {{ color:var(--honey); font-weight:950; margin-top:5px; }}
    .questions {{ display:grid; gap:10px; }}
    .question {{ padding:14px; }}
    .silences {{ list-style:none; margin:0; padding:0; display:grid; gap:7px; }}
    .silences li {{ display:flex; justify-content:space-between; gap:10px; border:1px solid var(--line); border-radius:14px; padding:8px 10px; background:rgba(0,0,0,.22); }}
    .command {{ display:grid; grid-template-columns:150px minmax(0,1fr); gap:10px; padding:11px 13px; margin-bottom:8px; }}
    code {{ color:#ffeaa3; overflow-wrap:anywhere; }}
    .truth {{ border-left:5px solid var(--honey); padding-left:14px; color:#ffe9a0; }}
    @media (max-width:1000px) {{ .grid,.command {{ grid-template-columns:1fr; }} }}
  </style>
</head>
<body>
<main>
  <header>
    <p class="eyebrow">Quipsly Studio · one-short review cockpit</p>
    <h1>{esc(payload.get('shortId'))}</h1>
    <p>{esc(payload.get('title'))}</p>
    <p class="truth">{esc(payload.get('truth'))}</p>
    <div class="metrics">
      <div><strong>{esc(visual.get('status'))}</strong><span>visual evidence</span></div>
      <div><strong>{esc(audio.get('status'))}</strong><span>audio evidence</span></div>
      <div><strong>{esc(cadence.get('label'))}</strong><span>cadence label</span></div>
      <div><strong>{esc(cadence.get('meaningfulPauseCount'))}</strong><span>meaningful pauses</span></div>
      <div><strong>{esc(volume.get('meanVolumeDb'))}</strong><span>mean dB</span></div>
    </div>
  </header>
  <section class="grid">
    <aside>
      <section class="panel"><p class="eyebrow">Watch the short</p>{media}</section>
      <section class="panel"><p class="eyebrow">Reviewer questions</p><div class="questions">{questions}</div></section>
      <section class="panel"><p class="eyebrow">Measurement warnings</p><ul>{warnings}</ul></section>
    </aside>
    <section>
      <section class="panel"><p class="eyebrow">Frame evidence</p><div class="frames">{frames or '<p>No contact-sheet frames found.</p>'}</div></section>
      <section class="panel"><p class="eyebrow">Waveform evidence</p>{waveform}</section>
      <section class="panel"><p class="eyebrow">Detected pauses</p><ul class="silences">{silence_rows}</ul></section>
      <section class="panel"><p class="eyebrow">Record notes only after watching/listening</p>{commands}</section>
    </section>
  </section>
</main>
</body>
</html>
"""


def write_outputs(payload: dict[str, Any], folder: Path, basename: str) -> dict[str, str]:
    basename = safe_slug(basename or f"{payload.get('shortId')}-review-packet")
    paths = {
        "json": folder / f"{basename}.json",
        "markdown": folder / f"{basename}.md",
        "html": folder / f"{basename}.html",
    }
    paths["json"].write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
    paths["markdown"].write_text(render_markdown(payload), encoding="utf-8")
    paths["html"].write_text(render_html(payload), encoding="utf-8")
    return {key: str(path) for key, path in paths.items()}


def main() -> None:
    parser = argparse.ArgumentParser(description="Create one-short cut-quality review packet.")
    parser.add_argument("--workbench", default=str(DEFAULT_WORKBENCH_JSON), help="Cut-quality workbench JSON.")
    parser.add_argument("--contact-sheet-index", default=str(DEFAULT_CONTACT_SHEET_INDEX_JSON), help="Contact-sheet index JSON.")
    parser.add_argument("--audio-probe-index", default=str(DEFAULT_AUDIO_PROBE_INDEX_JSON), help="Audio-probe index JSON.")
    parser.add_argument("--short-id", default="", help="Select a specific short id.")
    parser.add_argument("--rank", type=int, default=0, help="Select a specific rank.")
    parser.add_argument("--readiness", default="", help="Select first item matching readiness level.")
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR), help="Root folder for review packet artifacts.")
    parser.add_argument("--basename", default="", help="Optional output basename inside the timestamped folder.")
    parser.add_argument("--format", choices=["markdown", "json", "html", "all"], default="markdown")
    parser.add_argument("--markdown", dest="format", action="store_const", const="markdown")
    parser.add_argument("--json", dest="format", action="store_const", const="json")
    parser.add_argument("--html", dest="format", action="store_const", const="html")
    parser.add_argument("--all", dest="format", action="store_const", const="all")
    args = parser.parse_args()

    workbench_path = Path(args.workbench).expanduser()
    contact_index_path = Path(args.contact_sheet_index).expanduser()
    audio_index_path = Path(args.audio_probe_index).expanduser()
    workbench = read_json(workbench_path)
    if not workbench:
        raise SystemExit(
            f"Cut-quality workbench JSON not found or unreadable: {workbench_path}\n"
            "Run: script/agentctl.sh studio-shorts-cut-quality-workbench --all"
        )
    item = choose_item(workbench_items(workbench), args.short_id, args.rank, args.readiness)
    payload, folder = build_packet(workbench_path, contact_index_path, audio_index_path, item, Path(args.output_dir).expanduser())
    basename = args.basename or f"{payload.get('shortId')}-review-packet"
    written = write_outputs(payload, folder, basename)
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
