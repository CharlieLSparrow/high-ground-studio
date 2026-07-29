#!/usr/bin/env python3
"""Prepare safe audio/transcript intake packets for recommended shorts.

This creates versioned local sidecars for ASR or manual transcript work. It can
extract mono WAV audio from exported short files, but it never mutates source
media, records review intent, imports transcript truth, burns captions, or
publishes anything.
"""
from __future__ import annotations

import argparse
import html
import json
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from studio_short_review_ledger_fallback import fallback_transcript_workorder_for_short


DEFAULT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
DEFAULT_WORKORDERS_JSON = (
    DEFAULT_ROOT
    / "shorts-command-room"
    / "transcript-workorders"
    / "quipsly-studio-shorts-transcript-workorders.json"
)
DEFAULT_OUTPUT_DIR = DEFAULT_ROOT / "shorts-command-room" / "transcript-intake"
SCHEMA = "quipsly.studio.shorts-transcript-intake-batch.v1"
VERSION = "2026-07-02.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""))


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise SystemExit(f"Transcript workorders JSON not found: {path}\nRun: script/agentctl.sh studio-shorts-transcript-workorders --all")
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise SystemExit(f"Expected JSON object: {path}")
    return data


def file_uri(path: Path) -> str:
    try:
        return path.expanduser().resolve().as_uri()
    except ValueError:
        return ""


def run_command(argv: list[str]) -> tuple[bool, str, str]:
    completed = subprocess.run(argv, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    return completed.returncode == 0, completed.stdout, completed.stderr


def ffprobe_media(path: Path) -> dict[str, Any]:
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        return {"ok": False, "warning": "ffprobe not found"}
    ok, stdout, stderr = run_command(
        [
            ffprobe,
            "-v",
            "error",
            "-show_entries",
            "format=duration,size:stream=index,codec_type,codec_name,channels,sample_rate,width,height",
            "-of",
            "json",
            str(path),
        ]
    )
    if not ok:
        return {"ok": False, "warning": stderr.strip() or "ffprobe failed"}
    try:
        payload = json.loads(stdout)
    except json.JSONDecodeError:
        return {"ok": False, "warning": "ffprobe returned non-json output"}
    streams = payload.get("streams") if isinstance(payload.get("streams"), list) else []
    fmt = payload.get("format") if isinstance(payload.get("format"), dict) else {}
    return {
        "ok": True,
        "durationSeconds": float(fmt.get("duration") or 0),
        "sizeBytes": int(float(fmt.get("size") or 0)),
        "hasAudio": any(stream.get("codec_type") == "audio" for stream in streams if isinstance(stream, dict)),
        "hasVideo": any(stream.get("codec_type") == "video" for stream in streams if isinstance(stream, dict)),
        "streams": streams,
    }


def extract_audio(media_path: Path, audio_path: Path, *, overwrite: bool) -> dict[str, Any]:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return {"ok": False, "status": "ffmpeg-missing", "warning": "ffmpeg not found"}
    if audio_path.exists() and not overwrite:
        return {"ok": True, "status": "exists", "warning": "audio sidecar already exists; not overwritten"}
    audio_path.parent.mkdir(parents=True, exist_ok=True)
    argv = [
        ffmpeg,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y" if overwrite else "-n",
        "-i",
        str(media_path),
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "pcm_s16le",
        str(audio_path),
    ]
    ok, stdout, stderr = run_command(argv)
    return {
        "ok": ok,
        "status": "created" if ok else "failed",
        "command": argv,
        "stdout": stdout.strip(),
        "stderr": stderr.strip(),
        "warning": "" if ok else (stderr.strip() or "ffmpeg failed"),
    }


def intake_for(order: dict[str, Any], batch_dir: Path, *, extract: bool, overwrite_audio: bool) -> dict[str, Any]:
    short_id = str(order.get("shortId") or "unknown-short")
    folder = batch_dir / short_id
    folder.mkdir(parents=True, exist_ok=True)
    media_path = Path(str(order.get("mediaPath") or ""))
    audio_path = folder / f"{short_id}-asr-intake-16k-mono.wav"
    manifest_path = folder / f"{short_id}-transcript-intake.json"
    notes_path = folder / f"{short_id}-transcript-intake-notes.md"
    probe = ffprobe_media(media_path) if media_path.exists() else {"ok": False, "warning": "media file missing"}
    audio_result = (
        extract_audio(media_path, audio_path, overwrite=overwrite_audio)
        if extract and media_path.exists() and bool(probe.get("hasAudio"))
        else {"ok": False, "status": "not-run", "warning": "audio extraction not requested or source has no audio"}
    )
    item = {
        "schema": "quipsly.studio.short-transcript-intake.v1",
        "version": VERSION,
        "generatedAt": iso_now(),
        "shortId": short_id,
        "episode": order.get("episode"),
        "episodeVersion": order.get("version"),
        "title": order.get("title"),
        "status": "audio-ready-for-asr" if audio_result.get("ok") and audio_path.exists() else "needs-audio-intake",
        "workorderKind": order.get("kind"),
        "workorderStatus": order.get("status"),
        "mediaPath": str(media_path),
        "mediaExists": media_path.exists(),
        "mediaProbe": probe,
        "audioSidecarPath": str(audio_path),
        "audioSidecarExists": audio_path.exists(),
        "audioExtraction": audio_result,
        "plannedTranscriptSidecars": order.get("plannedSidecars") or {},
        "safeCommands": {
            "openShort": f"open {shell_quote(str(media_path))}" if media_path.exists() else "",
            "revealShort": f"open -R {shell_quote(str(media_path))}" if media_path.exists() else "",
            "openIntakeFolder": f"open {shell_quote(str(folder))}",
            "playAudioSidecar": f"open {shell_quote(str(audio_path))}" if audio_path.exists() else "",
        },
        "nextSafestAction": (
            "Run ASR or manual transcript review against the audio sidecar, then write normalized transcript/caption sidecars to the planned workorder destinations."
            if audio_path.exists()
            else "Create a usable audio sidecar before ASR or semantic caption review."
        ),
        "truth": "Transcript intake only. This does not run ASR, create transcript truth, import captions, record review intent, edit timelines, mutate source media, publish, upload, schedule, or create receipt truth.",
    }
    manifest_path.write_text(json.dumps(item, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    notes_path.write_text(render_notes(item), encoding="utf-8")
    item["artifactPaths"] = {
        "folder": str(folder),
        "json": str(manifest_path),
        "notes": str(notes_path),
        "audioSidecar": str(audio_path),
    }
    return item


def render_notes(item: dict[str, Any]) -> str:
    return "\n".join(
        [
            f"# Transcript intake: {item.get('shortId')}",
            "",
            f"- Status: `{item.get('status')}`",
            f"- Episode/version: `Episode {item.get('episode')}` / `{item.get('episodeVersion')}`",
            f"- Media: `{item.get('mediaPath')}`",
            f"- Audio sidecar: `{item.get('audioSidecarPath')}`",
            f"- Next: {item.get('nextSafestAction')}",
            "",
            "## Truth boundary",
            "",
            str(item.get("truth") or ""),
        ]
    ).rstrip() + "\n"


def build_batch(args: argparse.Namespace) -> dict[str, Any]:
    workorders_path = Path(args.workorders).expanduser()
    workorders = read_json(workorders_path)
    orders = [order for order in workorders.get("workorders", []) if isinstance(order, dict)]
    if args.short_id:
        orders = [order for order in orders if str(order.get("shortId") or "") == args.short_id]
        if not orders:
            fallback = fallback_transcript_workorder_for_short(DEFAULT_ROOT, args.short_id)
            if fallback:
                orders = [fallback]
    if args.limit > 0:
        orders = orders[: args.limit]
    output_dir = Path(args.output_dir).expanduser()
    batch_dir = output_dir / f"{stamp()}-transcript-intake-batch"
    batch_dir.mkdir(parents=True, exist_ok=True)
    items = [intake_for(order, batch_dir, extract=not args.no_extract_audio, overwrite_audio=args.overwrite_audio) for order in orders]
    counts = {
        "items": len(items),
        "audioReadyForAsr": sum(1 for item in items if item.get("status") == "audio-ready-for-asr"),
        "needsAudioIntake": sum(1 for item in items if item.get("status") != "audio-ready-for-asr"),
        "mediaMissing": sum(1 for item in items if not item.get("mediaExists")),
        "sourceMediaMutated": False,
        "asrRun": False,
        "transcriptTruthCreated": False,
        "reviewDecisionRecorded": False,
        "externalPublishing": False,
        "receiptTruthCreated": False,
    }
    batch = {
        "schema": SCHEMA,
        "version": VERSION,
        "generatedAt": iso_now(),
        "sourceWorkordersJson": str(workorders_path),
        "outputDir": str(output_dir),
        "batchDir": str(batch_dir),
        "counts": counts,
        "items": items,
        "indexHtml": str(batch_dir / "quipsly-studio-shorts-transcript-intake-batch.html"),
        "indexJson": str(batch_dir / "quipsly-studio-shorts-transcript-intake-batch.json"),
        "latestPointerJson": str(output_dir / "latest-transcript-intake-batch.json"),
        "nextSafestAction": "Run ASR/manual transcript review on audio-ready sidecars, then write normalized transcript sidecars and rerun transcript readiness.",
        "truth": "Transcript intake batch only. It may create local audio sidecars from exported shorts, but it does not mutate source media, run ASR, create transcript truth, record review decisions, publish, upload, schedule, or create receipt truth.",
    }
    write_batch(batch)
    return batch


def write_batch(batch: dict[str, Any]) -> None:
    json_path = Path(str(batch["indexJson"]))
    html_path = Path(str(batch["indexHtml"]))
    latest_path = Path(str(batch["latestPointerJson"]))
    json_path.write_text(json.dumps(batch, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    html_path.write_text(render_html(batch), encoding="utf-8")
    latest_path.parent.mkdir(parents=True, exist_ok=True)
    latest_path.write_text(json.dumps({"latestBatchJson": str(json_path), "latestBatchHtml": str(html_path), "generatedAt": batch["generatedAt"]}, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def render_markdown(batch: dict[str, Any]) -> str:
    lines = [
        "# Studio shorts transcript intake batch",
        "",
        f"Generated: `{batch.get('generatedAt')}`",
        f"Batch: `{batch.get('batchDir')}`",
        "",
        batch.get("truth", ""),
        "",
        "## Counts",
        "",
    ]
    for key, value in batch.get("counts", {}).items():
        lines.append(f"- {key}: `{value}`")
    lines.extend(["", "## Items", ""])
    for item in batch.get("items", []):
        lines.extend(
            [
                f"### {item.get('shortId')} - {item.get('status')}",
                "",
                f"- Episode/version: `Episode {item.get('episode')}` / `{item.get('episodeVersion')}`",
                f"- Media exists: `{item.get('mediaExists')}`",
                f"- Audio sidecar exists: `{item.get('audioSidecarExists')}`",
                f"- Audio sidecar: `{item.get('audioSidecarPath')}`",
                f"- Next: {item.get('nextSafestAction')}",
                "",
            ]
        )
    return "\n".join(lines).rstrip() + "\n"


def render_html(batch: dict[str, Any]) -> str:
    metrics = "".join(
        f"<div><strong>{esc(value)}</strong><span>{esc(key)}</span></div>"
        for key, value in batch.get("counts", {}).items()
        if key in {"items", "audioReadyForAsr", "needsAudioIntake", "mediaMissing"}
    )
    cards = "\n".join(render_card(item) for item in batch.get("items", []))
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Quipsly Studio transcript intake batch</title>
  <style>
    :root {{ color-scheme: dark; --soil:#17120c; --moss:#18291f; --cream:#fff0cf; --honey:#f2c94c; --leaf:#8ee39a; --water:#82dce5; --clay:#d87358; --line:rgba(255,240,207,.16); }}
    * {{ box-sizing:border-box; }} body {{ margin:0; color:var(--cream); font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; background:radial-gradient(circle at 12% -8%,rgba(142,227,154,.2),transparent 30%),linear-gradient(135deg,var(--moss),var(--soil)); }}
    main {{ width:min(1440px,calc(100vw - 36px)); margin:0 auto; padding:34px 0 90px; }}
    header,.truth,.card {{ border:1px solid var(--line); border-radius:30px; background:rgba(255,240,207,.07); box-shadow:0 24px 80px rgba(0,0,0,.28); }} header,.truth,.card {{ padding:22px; }} header {{ margin-bottom:16px; }}
    .eyebrow {{ color:var(--honey); letter-spacing:.18em; text-transform:uppercase; font-size:.78rem; font-weight:950; margin:0 0 8px; }} h1 {{ margin:0 0 12px; font-size:clamp(2.3rem,6vw,5.4rem); line-height:.9; }} p,li {{ color:#e0d1b3; }} code {{ color:#ffeaa3; overflow-wrap:anywhere; }}
    .metrics {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:10px; margin-top:18px; }} .metrics div {{ border:1px solid var(--line); border-radius:18px; padding:13px; background:rgba(0,0,0,.22); }} .metrics strong {{ display:block; color:var(--leaf); font-size:2rem; }} .metrics span {{ color:#cdbf9e; text-transform:uppercase; letter-spacing:.09em; font-size:.72rem; font-weight:900; }}
    .truth {{ margin-bottom:16px; border-color:rgba(242,201,76,.34); }} .grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(360px,1fr)); gap:16px; }}
    .audio-ready-for-asr {{ border-color:rgba(142,227,154,.45); }} .needs-audio-intake {{ border-color:rgba(216,115,88,.5); }}
    .pill,a,button {{ border:1px solid var(--line); border-radius:999px; padding:8px 10px; background:rgba(0,0,0,.24); color:var(--cream); text-decoration:none; font-weight:900; font-size:.82rem; }} button {{ cursor:pointer; }} button:hover,a:hover {{ color:var(--honey); border-color:rgba(242,201,76,.55); }}
  </style>
</head>
<body>
<main>
  <header><p class="eyebrow">Quipsly Studio · transcript intake</p><h1>Audio sidecars for word evidence.</h1><p>{esc(batch.get('nextSafestAction'))}</p><div class="metrics">{metrics}</div></header>
  <section class="truth"><p><strong>Truth boundary:</strong> {esc(batch.get('truth'))}</p></section>
  <section class="grid">{cards}</section>
</main>
</body>
</html>
"""


def render_card(item: dict[str, Any]) -> str:
    status = str(item.get("status") or "unknown")
    commands = item.get("safeCommands") if isinstance(item.get("safeCommands"), dict) else {}
    links = " ".join(
        f"<a href='{esc(file_uri(Path(path)))}'>{esc(label)}</a>"
        for label, path in [
            ("Manifest", (item.get("artifactPaths") or {}).get("json", "")),
            ("Notes", (item.get("artifactPaths") or {}).get("notes", "")),
            ("Audio", item.get("audioSidecarPath", "")),
        ]
        if path and Path(str(path)).exists()
    )
    command_rows = "".join(f"<li><code>{esc(command)}</code></li>" for command in commands.values() if command)
    return f"""<article class="card {esc(status)}">
  <h2>{esc(item.get('shortId'))}</h2>
  <p><span class="pill">{esc(status)}</span> <span class="pill">Episode {esc(item.get('episode'))}</span></p>
  <p><strong>Audio sidecar:</strong> <code>{esc(item.get('audioSidecarPath'))}</code></p>
  <p>{esc(item.get('nextSafestAction'))}</p>
  <p>{links}</p>
  <ul>{command_rows}</ul>
</article>"""


def main() -> int:
    parser = argparse.ArgumentParser(description="Prepare transcript intake audio sidecars for recommended Studio shorts.")
    parser.add_argument("--workorders", default=str(DEFAULT_WORKORDERS_JSON))
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR))
    parser.add_argument("--short-id", default="")
    parser.add_argument("--limit", type=int, default=12)
    parser.add_argument("--no-extract-audio", action="store_true", help="Create manifests only; do not run ffmpeg.")
    parser.add_argument("--overwrite-audio", action="store_true", help="Overwrite audio sidecars inside the new batch folder if present.")
    parser.add_argument("--format", choices=["markdown", "json", "html", "all"], default="all")
    parser.add_argument("--markdown", dest="format", action="store_const", const="markdown")
    parser.add_argument("--json", dest="format", action="store_const", const="json")
    parser.add_argument("--html", dest="format", action="store_const", const="html")
    parser.add_argument("--all", dest="format", action="store_const", const="all")
    args = parser.parse_args()

    batch = build_batch(args)
    if args.format == "json":
        print(json.dumps(batch, indent=2, sort_keys=True))
    elif args.format == "html":
        print(render_html(batch), end="")
    else:
        print(render_markdown(batch), end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
