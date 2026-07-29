#!/usr/bin/env python3
"""Create visual cut-quality contact sheets for recommended native shorts.

This command is a review aid, not a publishing or approval system. It reads the
existing cut-quality workbench, extracts timestamped frames from one selected
short, and writes versioned local artifacts beside the shorts command room.
It does not mutate media, edit timelines, record intent, or publish.
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


DEFAULT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
DEFAULT_WORKBENCH_JSON = (
    DEFAULT_ROOT
    / "shorts-command-room"
    / "cut-quality-workbench"
    / "quipsly-studio-shorts-cut-quality-workbench.json"
)
DEFAULT_OUTPUT_DIR = DEFAULT_ROOT / "shorts-command-room" / "cut-quality-contact-sheets"
SCHEMA = "quipsly.studio.shorts-cut-quality-contact-sheet.v1"
VERSION = "2026-07-02.v1"


REVIEW_PROMPTS = [
    {
        "dimension": "hook-frame",
        "noteField": "hook",
        "question": "Does the first visual beat give a stranger a reason to stay?",
        "lookFor": "Face, gesture, visual surprise, readable context, or a clean setup. If it looks like dead air, choose a sharper in-point.",
    },
    {
        "dimension": "crop-framing",
        "noteField": "cropFraming",
        "question": "Are faces and important objects framed intentionally in 9:16?",
        "lookFor": "Eyes near the upper third, no accidental forehead crop, no tiny speaker in a huge empty frame.",
    },
    {
        "dimension": "caption-safety",
        "noteField": "captionPlan",
        "question": "Is there safe space for captions without covering the emotional center?",
        "lookFor": "Avoid text over mouths, eyes, or key reaction beats. Reserve lower-middle space where practical.",
    },
    {
        "dimension": "jump-cut-risk",
        "noteField": "jumpCutCover",
        "question": "Do frame changes reveal awkward same-speaker jumps?",
        "lookFor": "If consecutive frames jump on one face, consider reaction cover, crop punch, B-roll, or letting the pause breathe.",
    },
    {
        "dimension": "reaction-beat",
        "noteField": "reactionBeat",
        "question": "Is there a human listening or reaction beat worth preserving?",
        "lookFor": "Do not sand away every silence. A good reaction can be the reason the clip feels alive.",
    },
    {
        "dimension": "platform-fit",
        "noteField": "platformFit",
        "question": "Does this look like a finished social-native vertical post?",
        "lookFor": "Readable subject, clear mood, no accidental letterboxing, no UI clutter, and a visual reason to share.",
    },
]


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def safe_slug(value: Any) -> str:
    text = str(value or "short")
    clean = "".join(ch.lower() if ch.isalnum() else "-" for ch in text)
    while "--" in clean:
        clean = clean.replace("--", "-")
    return clean.strip("-")[:96] or "short"


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
            f"Cut-quality workbench JSON not found: {path}\n"
            "Run: script/agentctl.sh studio-shorts-cut-quality-workbench --all"
        )
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise SystemExit(f"Expected JSON object at {path}")
    return data


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
    preferred = ["watch-listen-first", "caption-timing-review", "transcript-review", "media-needs-repair"]
    for level in preferred:
        for item in items:
            if str(item.get("readinessLevel") or "") == level:
                return item
    if items:
        return items[0]
    raise SystemExit("Cut-quality workbench has no items.")


def ffprobe_media(path: Path) -> dict[str, Any]:
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        raise SystemExit("ffprobe is not installed or not on PATH. Cannot make an honest contact sheet.")
    command = [
        ffprobe,
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        str(path),
    ]
    try:
        result = subprocess.run(command, check=True, capture_output=True, text=True, timeout=45)
    except subprocess.CalledProcessError as error:
        raise SystemExit(f"ffprobe failed for {path}: {(error.stderr or error.stdout or str(error)).strip()}") from error
    except subprocess.TimeoutExpired as error:
        raise SystemExit(f"ffprobe timed out for {path}") from error
    data = json.loads(result.stdout or "{}")
    streams = [stream for stream in data.get("streams", []) if isinstance(stream, dict)]
    video_stream = next((stream for stream in streams if stream.get("codec_type") == "video"), {})
    audio_streams = [stream for stream in streams if stream.get("codec_type") == "audio"]
    duration = 0.0
    try:
        duration = float((data.get("format") or {}).get("duration") or 0)
    except (TypeError, ValueError):
        duration = 0.0
    return {
        "durationSeconds": duration,
        "width": int(video_stream.get("width") or 0),
        "height": int(video_stream.get("height") or 0),
        "videoCodec": video_stream.get("codec_name") or "",
        "audioCodecs": sorted({str(stream.get("codec_name") or "") for stream in audio_streams if stream.get("codec_name")}),
        "hasVideo": bool(video_stream),
        "hasAudio": bool(audio_streams),
        "streamCount": len(streams),
    }


def frame_timestamps(duration: float, count: int) -> list[float]:
    count = max(3, min(count, 18))
    if duration <= 0:
        return [0.25]
    if count == 1:
        return [min(duration * 0.5, max(duration - 0.05, 0.05))]
    start = min(max(duration * 0.06, 0.25), max(duration - 0.05, 0.05))
    end = max(min(duration * 0.94, duration - 0.08), start)
    if count <= 2:
        return [start, end]
    step = (end - start) / (count - 1)
    return [round(start + step * index, 3) for index in range(count)]


def extract_frame(source: Path, output: Path, timestamp: float) -> dict[str, Any]:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise SystemExit("ffmpeg is not installed or not on PATH. Cannot extract review frames.")
    output.parent.mkdir(parents=True, exist_ok=True)
    command = [
        ffmpeg,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-ss",
        f"{timestamp:.3f}",
        "-i",
        str(source),
        "-frames:v",
        "1",
        "-vf",
        "scale=360:-2",
        "-q:v",
        "3",
        str(output),
    ]
    try:
        subprocess.run(command, check=True, capture_output=True, text=True, timeout=45)
    except subprocess.CalledProcessError as error:
        return {
            "status": "frame-error",
            "timestamp": timestamp,
            "warning": (error.stderr or error.stdout or str(error)).strip(),
        }
    except subprocess.TimeoutExpired:
        return {
            "status": "frame-timeout",
            "timestamp": timestamp,
            "warning": "Timed out while extracting this review frame.",
        }
    return {
        "status": "ok",
        "timestamp": timestamp,
        "path": str(output),
        "uri": file_uri(output),
    }


def note_templates(short_id: str) -> dict[str, str]:
    return {
        prompt["dimension"]: (
            "script/agentctl.sh studio-shorts-cut-quality-note "
            f"--short-id {shell_quote(short_id)} "
            f"--field {shell_quote(prompt['noteField'])} "
            "--note '<specific visual evidence from contact sheet and playback>'"
        )
        for prompt in REVIEW_PROMPTS
    }


def build_contact_sheet(
    workbench_path: Path,
    item: dict[str, Any],
    output_dir: Path,
    frame_count: int,
) -> tuple[dict[str, Any], Path]:
    short_id = str(item.get("shortId") or "short")
    media_path = Path(str(item.get("mediaPath") or item.get("path") or "")).expanduser()
    if not media_path.exists():
        raise SystemExit(f"Selected short media is missing: {media_path}")

    probe = ffprobe_media(media_path)
    if not probe.get("hasVideo"):
        raise SystemExit(f"Selected short has no video stream, so no visual contact sheet can be made: {media_path}")

    run_stamp = stamp()
    folder = output_dir / safe_slug(short_id) / f"{run_stamp}-{safe_slug(short_id)}-contact-sheet"
    frames_dir = folder / "frames"
    folder.mkdir(parents=True, exist_ok=False)
    frames = [
        extract_frame(media_path, frames_dir / f"{index:02d}-{safe_slug(short_id)}-{timestamp:08.3f}s.jpg", timestamp)
        for index, timestamp in enumerate(frame_timestamps(float(probe.get("durationSeconds") or 0), frame_count), start=1)
    ]
    created = [frame for frame in frames if frame.get("status") == "ok"]
    payload = {
        "schema": SCHEMA,
        "version": VERSION,
        "generatedAt": iso_now(),
        "sourceWorkbenchJson": str(workbench_path),
        "shortId": short_id,
        "episode": item.get("episode"),
        "episodeVersion": item.get("version"),
        "rank": item.get("rank"),
        "title": item.get("title"),
        "readinessLevel": item.get("readinessLevel"),
        "mediaPath": str(media_path),
        "mediaUri": file_uri(media_path),
        "probe": probe,
        "framesRequested": frame_count,
        "framesCreated": len(created),
        "frames": frames,
        "reviewPrompts": REVIEW_PROMPTS,
        "noteCommandTemplates": note_templates(short_id),
        "safeCommands": {
            "openShort": f"open {shell_quote(str(media_path))}",
            "revealShort": f"open -R {shell_quote(str(media_path))}",
            "worksheet": f"script/agentctl.sh studio-shorts-cut-quality-worksheet --short-id {shell_quote(short_id)}",
            "recordVisualNoteExample": (
                "script/agentctl.sh studio-shorts-cut-quality-note "
                f"--short-id {shell_quote(short_id)} --field cropFraming "
                "--note '<what the frames prove about face placement and caption safety>'"
            ),
        },
        "artifactDir": str(folder),
        "truth": (
            "Visual contact sheet only. It records no review decision, edits no timeline, exports no media, "
            "publishes nothing, uploads nothing, mutates no media, overwrites no prior artifacts, deletes nothing, "
            "and creates no receipt truth."
        ),
    }
    return payload, folder


def esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""))


def render_markdown(payload: dict[str, Any]) -> str:
    lines = [
        "# Shorts cut-quality contact sheet",
        "",
        f"- Short: `{payload.get('shortId')}`",
        f"- Title: {payload.get('title')}",
        f"- Episode/version: `Episode {payload.get('episode')}` / `{payload.get('episodeVersion')}`",
        f"- Readiness: `{payload.get('readinessLevel')}`",
        f"- Media: `{payload.get('mediaPath')}`",
        f"- Frames created: `{payload.get('framesCreated')}` / `{payload.get('framesRequested')}`",
        f"- Duration: `{float((payload.get('probe') or {}).get('durationSeconds') or 0):.2f}s`",
        f"- Resolution: `{(payload.get('probe') or {}).get('width')}x{(payload.get('probe') or {}).get('height')}`",
        "",
        payload.get("truth", ""),
        "",
        "## Review prompts",
        "",
    ]
    for prompt in payload.get("reviewPrompts", []):
        lines.append(f"- `{prompt.get('dimension')}`: {prompt.get('question')} Look for: {prompt.get('lookFor')}")
    lines.extend(["", "## Frames", ""])
    for frame in payload.get("frames", []):
        if frame.get("status") == "ok":
            lines.append(f"- `{frame.get('timestamp'):.3f}s`: `{frame.get('path')}`")
        else:
            lines.append(f"- `{frame.get('timestamp')}`: `{frame.get('status')}` {frame.get('warning')}")
    lines.extend(["", "## Useful commands", ""])
    for label, command in (payload.get("safeCommands") or {}).items():
        lines.append(f"- {label}: `{command}`")
    return "\n".join(lines).rstrip() + "\n"


def render_html(payload: dict[str, Any]) -> str:
    probe = payload.get("probe") if isinstance(payload.get("probe"), dict) else {}
    frames_html = []
    for frame in payload.get("frames", []):
        if frame.get("status") == "ok":
            frames_html.append(
                f"""
                <figure>
                  <img src="{esc(frame.get('uri'))}" alt="{esc(payload.get('shortId'))} at {esc(frame.get('timestamp'))} seconds">
                  <figcaption>{float(frame.get('timestamp') or 0):.2f}s</figcaption>
                </figure>
                """
            )
        else:
            frames_html.append(
                f"""
                <article class="warning">
                  <strong>{esc(frame.get('status'))}</strong>
                  <span>{esc(frame.get('warning'))}</span>
                </article>
                """
            )
    prompts_html = "".join(
        f"""
        <article class="prompt">
          <p class="eyebrow">{esc(prompt.get('dimension'))}</p>
          <h3>{esc(prompt.get('question'))}</h3>
          <p>{esc(prompt.get('lookFor'))}</p>
        </article>
        """
        for prompt in payload.get("reviewPrompts", [])
    )
    commands_html = "".join(
        f"""
        <div class="command">
          <strong>{esc(label)}</strong>
          <code>{esc(command)}</code>
        </div>
        """
        for label, command in (payload.get("safeCommands") or {}).items()
    )
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Quipsly shorts cut-quality contact sheet</title>
  <style>
    :root {{
      color-scheme: dark;
      --soil:#15110b;
      --bark:#261b12;
      --moss:#233921;
      --fern:#8edc89;
      --honey:#f3ce54;
      --water:#79d7e2;
      --cream:#fff1d4;
      --clay:#d86f57;
      --line:rgba(255,241,212,.16);
    }}
    * {{ box-sizing:border-box; }}
    body {{
      margin:0;
      font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      color:var(--cream);
      background:
        radial-gradient(circle at 12% -8%,rgba(142,220,137,.24),transparent 30rem),
        radial-gradient(circle at 92% 4%,rgba(243,206,84,.14),transparent 28rem),
        linear-gradient(135deg,var(--moss),var(--soil) 58%,#090807);
    }}
    main {{ width:min(1480px,calc(100vw - 40px)); margin:0 auto; padding:36px 0 80px; }}
    header,.panel,.prompt,.command,.warning {{
      border:1px solid var(--line);
      background:rgba(255,241,212,.07);
      border-radius:28px;
      box-shadow:0 24px 80px rgba(0,0,0,.26);
    }}
    header {{ padding:32px; margin-bottom:18px; }}
    .eyebrow {{ color:var(--honey); text-transform:uppercase; letter-spacing:.17em; font-weight:950; font-size:.76rem; margin:0 0 8px; }}
    h1 {{ margin:0 0 12px; font-size:clamp(2.4rem,7vw,6rem); line-height:.88; max-width:980px; }}
    h2,h3 {{ margin:0 0 8px; }}
    p,li {{ color:#e3d4b8; line-height:1.55; }}
    code {{ color:#ffeaa3; overflow-wrap:anywhere; }}
    .metrics {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:10px; margin-top:18px; }}
    .metrics div {{ border:1px solid var(--line); border-radius:18px; padding:13px; background:rgba(0,0,0,.22); }}
    .metrics strong {{ display:block; color:var(--fern); font-size:2rem; }}
    .metrics span {{ color:#cdbf9e; text-transform:uppercase; letter-spacing:.09em; font-size:.72rem; font-weight:900; }}
    .grid {{ display:grid; grid-template-columns:minmax(360px,.8fr) minmax(520px,1.5fr); gap:18px; align-items:start; }}
    .panel {{ padding:20px; margin-bottom:16px; }}
    .frames {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px; }}
    figure {{ margin:0; border:1px solid var(--line); border-radius:22px; padding:10px; background:rgba(0,0,0,.22); }}
    img {{ display:block; width:100%; border-radius:16px; background:#050505; }}
    figcaption {{ margin-top:7px; color:var(--honey); font-weight:950; }}
    .prompts {{ display:grid; gap:10px; }}
    .prompt {{ padding:16px; }}
    .command {{ display:grid; grid-template-columns:150px minmax(0,1fr); gap:10px; align-items:start; padding:12px 14px; margin-bottom:8px; }}
    .warning {{ padding:16px; color:#ffd2bf; border-color:rgba(216,111,87,.38); }}
    .truth {{ border-left:5px solid var(--honey); padding-left:14px; color:#ffe9a0; }}
    @media (max-width:900px) {{ .grid {{ grid-template-columns:1fr; }} .command {{ grid-template-columns:1fr; }} }}
  </style>
</head>
<body>
<main>
  <header>
    <p class="eyebrow">Quipsly Studio · visual evidence</p>
    <h1>Contact sheet for {esc(payload.get('shortId'))}</h1>
    <p>{esc(payload.get('title'))}</p>
    <p class="truth">{esc(payload.get('truth'))}</p>
    <div class="metrics">
      <div><strong>{esc(payload.get('framesCreated'))}</strong><span>frames</span></div>
      <div><strong>{float(probe.get('durationSeconds') or 0):.1f}s</strong><span>duration</span></div>
      <div><strong>{esc(probe.get('width'))}x{esc(probe.get('height'))}</strong><span>resolution</span></div>
      <div><strong>{esc(payload.get('readinessLevel'))}</strong><span>readiness</span></div>
    </div>
  </header>
  <section class="grid">
    <aside>
      <section class="panel">
        <p class="eyebrow">Review prompts</p>
        <div class="prompts">{prompts_html}</div>
      </section>
      <section class="panel">
        <p class="eyebrow">Safe commands</p>
        {commands_html}
      </section>
    </aside>
    <section class="panel">
      <p class="eyebrow">Frame sweep</p>
      <div class="frames">{''.join(frames_html)}</div>
    </section>
  </section>
</main>
</body>
</html>
"""


def write_outputs(payload: dict[str, Any], folder: Path, basename: str) -> dict[str, str]:
    basename = safe_slug(basename or f"{payload.get('shortId')}-contact-sheet")
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
    parser = argparse.ArgumentParser(description="Create a visual contact sheet for one cut-quality short.")
    parser.add_argument("--workbench", default=str(DEFAULT_WORKBENCH_JSON), help="Cut-quality workbench JSON.")
    parser.add_argument("--short-id", default="", help="Select a specific short id.")
    parser.add_argument("--rank", type=int, default=0, help="Select a specific rank.")
    parser.add_argument("--readiness", default="", help="Select first item matching readiness level.")
    parser.add_argument("--frames", type=int, default=8, help="Number of review frames to extract.")
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR), help="Root folder for contact sheet artifacts.")
    parser.add_argument("--basename", default="", help="Optional output basename inside the timestamped folder.")
    parser.add_argument("--format", choices=["markdown", "json", "html", "all"], default="markdown")
    parser.add_argument("--markdown", dest="format", action="store_const", const="markdown")
    parser.add_argument("--json", dest="format", action="store_const", const="json")
    parser.add_argument("--html", dest="format", action="store_const", const="html")
    parser.add_argument("--all", dest="format", action="store_const", const="all")
    args = parser.parse_args()

    workbench_path = Path(args.workbench).expanduser()
    board = read_json(workbench_path)
    item = choose_item(workbench_items(board), args.short_id, args.rank, args.readiness)
    payload, folder = build_contact_sheet(
        workbench_path=workbench_path,
        item=item,
        output_dir=Path(args.output_dir).expanduser(),
        frame_count=args.frames,
    )
    basename = args.basename or f"{payload.get('shortId')}-contact-sheet"
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
