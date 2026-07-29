#!/usr/bin/env python3
"""Generate visual review thumbnails for carry-forward short candidates.

This script reads an existing carry-forward workorder and creates derived
review artifacts beside it. It does not mutate source media, approve shorts,
export native target-version shorts, or publish anything.
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


DEFAULT_WORKORDER = Path(
    "/Volumes/My Passport/Episode_and_Shorts_Test/Episode_01/v004/"
    "shorts-carryforward-review/episode-01-v004-shorts-realignment-workorder.json"
)


def read_workorder(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload.get("items"), list):
        raise ValueError(f"workorder has no items list: {path}")
    return payload


def file_uri(path_text: str) -> str:
    try:
        return Path(path_text).expanduser().resolve().as_uri()
    except ValueError:
        return ""


def safe_slug(text: str) -> str:
    clean = "".join(ch.lower() if ch.isalnum() else "-" for ch in text)
    while "--" in clean:
        clean = clean.replace("--", "-")
    return clean.strip("-")[:80] or "short"


def run_ffmpeg_frame(source: Path, output: Path, timestamp: float) -> dict[str, Any]:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return {"status": "ffmpeg-missing", "warning": "ffmpeg is not installed or not on PATH."}
    output.parent.mkdir(parents=True, exist_ok=True)
    command = [
        ffmpeg,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-ss",
        f"{max(timestamp, 0):.3f}",
        "-i",
        str(source),
        "-frames:v",
        "1",
        "-vf",
        "scale=360:-1",
        str(output),
    ]
    try:
        subprocess.run(command, check=True, capture_output=True, text=True, timeout=30)
    except subprocess.CalledProcessError as error:
        return {"status": "frame-error", "warning": (error.stderr or str(error)).strip()}
    except subprocess.TimeoutExpired:
        return {"status": "frame-timeout", "warning": "Timed out while extracting a review frame."}
    return {"status": "ok", "path": str(output), "uri": file_uri(str(output)), "timestamp": round(timestamp, 3)}


def timestamps_for(duration: float | None) -> list[tuple[str, float]]:
    if not duration or duration <= 0:
        return [("poster", 0.5)]
    if duration < 10:
        return [
            ("start", max(0.25, duration * 0.2)),
            ("middle", duration * 0.5),
            ("end", max(0.25, duration * 0.82)),
        ]
    return [
        ("start", max(0.5, duration * 0.15)),
        ("middle", duration * 0.5),
        ("end", max(0.5, duration * 0.85)),
    ]


def build_contact_sheet(workorder_path: Path, output_dir: Path) -> dict[str, Any]:
    workorder = read_workorder(workorder_path)
    frames_dir = output_dir / "frames"
    items: list[dict[str, Any]] = []
    for item in workorder["items"]:
        if not isinstance(item, dict):
            continue
        index = int(item.get("index") or len(items) + 1)
        title = str(item.get("title") or f"Candidate {index:02d}")
        source_path = Path(str(item.get("source_path") or "")).expanduser()
        facts = item.get("media_facts", {}) if isinstance(item.get("media_facts"), dict) else {}
        duration = facts.get("duration_seconds")
        duration_value = float(duration) if isinstance(duration, (int, float)) else None
        slug = safe_slug(title)
        frame_results = []
        if source_path.exists():
            for label, timestamp in timestamps_for(duration_value):
                output = frames_dir / f"{index:02d}-{slug}-{label}.jpg"
                result = run_ffmpeg_frame(source_path, output, timestamp)
                result["label"] = label
                frame_results.append(result)
        else:
            frame_results.append({"status": "missing", "warning": "Source short file is missing.", "label": "poster"})
        items.append(
            {
                "index": index,
                "title": title,
                "filename": item.get("filename", ""),
                "sourcePath": str(source_path),
                "mediaFacts": facts,
                "frames": frame_results,
                "truth": "Derived review thumbnails only. Source media and export state are unchanged.",
            }
        )
    return {
        "model": "quipsly-studio-shorts-carryforward-contact-sheet",
        "version": "2026-07-02.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sourceWorkorder": str(workorder_path),
        "episode": workorder.get("episode"),
        "sourceVersion": workorder.get("sourceVersion"),
        "targetVersion": workorder.get("targetVersion"),
        "candidateCount": len(items),
        "items": items,
        "truth": (
            "Visual review aid only. It does not mutate source media, create native target-version shorts, "
            "approve publication, or create receipt truth."
        ),
    }


def render_html(sheet: dict[str, Any]) -> str:
    cards: list[str] = []
    for item in sheet["items"]:
        facts = item.get("mediaFacts", {})
        duration = facts.get("duration_seconds")
        duration_text = f"{duration:.1f}s" if isinstance(duration, (int, float)) else "unknown"
        frames = []
        for frame in item.get("frames", []):
            if frame.get("status") == "ok":
                frames.append(
                    f"""
                    <figure>
                      <img src="{html.escape(frame.get('uri', ''))}" alt="{html.escape(item['title'])} {html.escape(frame.get('label', 'frame'))}">
                      <figcaption>{html.escape(frame.get('label', 'frame'))} {html.escape(str(frame.get('timestamp', '')))}s</figcaption>
                    </figure>
                    """
                )
            else:
                frames.append(f"<p class=\"warning\">{html.escape(frame.get('warning', frame.get('status', 'frame unavailable')))}</p>")
        cards.append(
            f"""
            <article class="card">
              <header>
                <p class="eyebrow">Candidate {item['index']:02d}</p>
                <h2>{html.escape(item['title'])}</h2>
                <p class="meta">{html.escape(duration_text)} · {html.escape(str(facts.get('aspect') or 'unknown aspect'))} · {html.escape(str(facts.get('duration_bucket') or 'unknown bucket'))}</p>
              </header>
              <div class="frames">{''.join(frames)}</div>
              <p class="hint">{html.escape(str(facts.get('review_hint') or 'Review hook, framing, captions, and ending.'))}</p>
            </article>
            """
        )
    title = f"Episode {sheet.get('episode')} carry-forward shorts contact sheet"
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{html.escape(title)}</title>
  <style>
    :root {{
      color-scheme: dark;
      --cedar: #201914;
      --moss: #6f8f5e;
      --fern: #c6e2a2;
      --honey: #efc65b;
      --clay: #d37a52;
      --cream: #fff7df;
      --line: rgba(255, 247, 223, 0.16);
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--cream);
      background:
        radial-gradient(circle at 10% 0%, rgba(111, 143, 94, 0.32), transparent 26rem),
        radial-gradient(circle at 100% 10%, rgba(239, 198, 91, 0.18), transparent 24rem),
        linear-gradient(135deg, #101812, var(--cedar));
    }}
    main {{ width: min(1480px, calc(100vw - 40px)); margin: 0 auto; padding: 36px 0 80px; }}
    .hero {{ padding: 28px; border: 1px solid var(--line); border-radius: 28px; background: rgba(255, 247, 223, 0.07); }}
    .eyebrow {{ margin: 0 0 8px; color: var(--honey); text-transform: uppercase; letter-spacing: 0.16em; font-weight: 900; font-size: 0.76rem; }}
    h1 {{ margin: 0; font-size: clamp(2rem, 5vw, 4.4rem); line-height: 0.95; }}
    .hero p {{ color: #e9dcc0; max-width: 900px; }}
    .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); gap: 18px; margin-top: 22px; }}
    .card {{ border: 1px solid var(--line); border-radius: 24px; padding: 18px; background: rgba(0, 0, 0, 0.18); }}
    .card h2 {{ margin: 0; font-size: 1.1rem; }}
    .meta {{ color: var(--fern); font-weight: 800; margin: 8px 0 14px; }}
    .frames {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }}
    figure {{ margin: 0; }}
    img {{ display: block; width: 100%; border-radius: 16px; background: #050505; border: 1px solid var(--line); }}
    figcaption {{ color: #e9dcc0; font-size: 0.78rem; margin-top: 5px; }}
    .hint {{ color: #ffe7a0; border-left: 4px solid var(--honey); padding-left: 10px; }}
    .warning {{ color: #ffd2bf; border-left: 4px solid var(--clay); padding-left: 10px; }}
    @media (max-width: 720px) {{
      main {{ width: min(100vw - 24px, 680px); }}
      .grid {{ grid-template-columns: 1fr; }}
    }}
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <p class="eyebrow">Quipsly Studio visual review aid</p>
      <h1>{html.escape(title)}</h1>
      <p>These derived frames help a reviewer quickly scan carry-forward shorts before deciding accept, refine, reject, or hold. They do not change media or export truth.</p>
    </section>
    <section class="grid">{''.join(cards)}</section>
  </main>
</body>
</html>
"""


def render_markdown(sheet: dict[str, Any]) -> str:
    lines = [
        "# Carry-forward shorts contact sheet",
        "",
        f"Generated: `{sheet['generatedAt']}`",
        f"Episode: `{sheet.get('episode')}`",
        f"Source version: `{sheet.get('sourceVersion')}`",
        f"Target version: `{sheet.get('targetVersion')}`",
        f"Source workorder: `{sheet.get('sourceWorkorder')}`",
        "",
        "> Truth: derived review thumbnails only. Source media and export state are unchanged.",
        "",
    ]
    for item in sheet["items"]:
        facts = item.get("mediaFacts", {})
        lines.append(f"## {item['index']:02d}. {item['title']}")
        lines.append("")
        lines.append(f"- Duration: `{facts.get('duration_seconds', 'unknown')}s`")
        lines.append(f"- Shape: `{facts.get('width', '?')}x{facts.get('height', '?')}` `{facts.get('aspect') or 'unknown'}`")
        lines.append(f"- Bucket: `{facts.get('duration_bucket') or 'unknown'}`")
        lines.append(f"- Review hint: {facts.get('review_hint') or 'Review hook, framing, captions, and ending.'}")
        lines.append("- Frames:")
        for frame in item.get("frames", []):
            if frame.get("status") == "ok":
                lines.append(f"  - `{frame.get('label')}` `{frame.get('timestamp')}s`: `{frame.get('path')}`")
            else:
                lines.append(f"  - `{frame.get('label')}` unavailable: {frame.get('warning', frame.get('status'))}")
        lines.append("")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate a visual contact sheet for carry-forward short candidates.")
    parser.add_argument("--workorder", default=str(DEFAULT_WORKORDER), help="Carry-forward workorder JSON.")
    parser.add_argument("--output-dir", default="", help="Output directory. Defaults to workorder folder/contact-sheet.")
    parser.add_argument("--basename", default="episode-01-v004-shorts-carryforward-contact-sheet")
    parser.add_argument("--format", choices=["markdown", "json", "html", "all"], default="all")
    args = parser.parse_args()

    workorder_path = Path(args.workorder).expanduser()
    output_dir = Path(args.output_dir).expanduser() if args.output_dir else workorder_path.parent / "contact-sheet"
    output_dir.mkdir(parents=True, exist_ok=True)
    sheet = build_contact_sheet(workorder_path, output_dir)

    if args.format in {"json", "all"}:
        (output_dir / f"{args.basename}.json").write_text(json.dumps(sheet, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    if args.format in {"markdown", "all"}:
        (output_dir / f"{args.basename}.md").write_text(render_markdown(sheet), encoding="utf-8")
    if args.format in {"html", "all"}:
        (output_dir / f"{args.basename}.html").write_text(render_html(sheet), encoding="utf-8")

    if args.format == "json":
        print(json.dumps(sheet, indent=2, sort_keys=True))
    elif args.format == "html":
        print(render_html(sheet), end="")
    else:
        print(render_markdown(sheet), end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
