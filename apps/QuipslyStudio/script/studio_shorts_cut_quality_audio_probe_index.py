#!/usr/bin/env python3
"""Index audio/cadence probes for native shorts cut-quality review.

Audio probes measure silence density, loudness, waveform shape, and cadence
questions for one short. This index keeps the latest probe per short findable
without turning measurement into approval or publication truth.
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
DEFAULT_AUDIO_PROBE_ROOT = DEFAULT_ROOT / "shorts-command-room" / "cut-quality-audio-probes"
DEFAULT_OUTPUT_DIR = DEFAULT_AUDIO_PROBE_ROOT / "index"
DEFAULT_BASENAME = "quipsly-studio-shorts-cut-quality-audio-probe-index"
SCHEMA = "quipsly.studio.shorts-cut-quality-audio-probe-index.v1"
VERSION = "2026-07-02.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""))


def file_uri(path: str | Path) -> str:
    try:
        return Path(path).expanduser().resolve().as_uri()
    except ValueError:
        return ""


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


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
        "waveform": str(payload.get("waveformPath") or json_path.parent / "waveform.png"),
    }


def discover_audio_probes(root: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    if not root.exists():
        return rows
    for json_path in sorted(root.glob("*/*/*audio-probe.json")):
        if "/index/" in str(json_path):
            continue
        payload = read_json(json_path)
        if payload.get("schema") != "quipsly.studio.shorts-cut-quality-audio-probe.v1":
            continue
        paths = artifact_paths_from(payload, json_path)
        cadence = payload.get("cadenceAssessment") if isinstance(payload.get("cadenceAssessment"), dict) else {}
        probe = payload.get("probe") if isinstance(payload.get("probe"), dict) else {}
        volume = payload.get("volume") if isinstance(payload.get("volume"), dict) else {}
        rows.append(
            {
                "shortId": payload.get("shortId"),
                "episode": payload.get("episode"),
                "episodeVersion": payload.get("episodeVersion"),
                "title": payload.get("title"),
                "readinessLevel": payload.get("readinessLevel"),
                "generatedAt": payload.get("generatedAt"),
                "mediaPath": payload.get("mediaPath"),
                "durationSeconds": probe.get("durationSeconds"),
                "audioCodecs": probe.get("audioCodecs") or [],
                "assessmentLabel": cadence.get("label"),
                "silenceCount": cadence.get("silenceCount"),
                "meaningfulPauseCount": cadence.get("meaningfulPauseCount"),
                "longPauseCount": cadence.get("longPauseCount"),
                "silenceFraction": cadence.get("silenceFraction"),
                "pausesPerMinute": cadence.get("pausesPerMinute"),
                "meanVolumeDb": volume.get("meanVolumeDb"),
                "maxVolumeDb": volume.get("maxVolumeDb"),
                "warningCount": len(cadence.get("warnings") or []),
                "warnings": cadence.get("warnings") or [],
                "artifactDir": payload.get("artifactDir") or str(json_path.parent),
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
    rows = discover_audio_probes(root)
    latest = latest_by_short(rows)
    labels = Counter(str(row.get("assessmentLabel") or "unknown") for row in latest)
    episodes = Counter(str(row.get("episode") or "unknown") for row in latest)
    return {
        "schema": SCHEMA,
        "version": VERSION,
        "generatedAt": iso_now(),
        "audioProbeRoot": str(root),
        "outputDir": str(output_dir),
        "counts": {
            "audioProbes": len(rows),
            "shortsWithAudioProbes": len(latest),
            "latestCadenceReview": labels.get("cadence-review", 0),
            "latestRhythmPlausible": labels.get("rhythm-plausible", 0),
            "latestWarnings": sum(int(row.get("warningCount") or 0) for row in latest),
            "assessmentLabels": dict(sorted(labels.items())),
            "episodes": dict(sorted(episodes.items())),
        },
        "latestByShort": latest,
        "allAudioProbes": sorted(rows, key=lambda row: str(row.get("generatedAt") or ""), reverse=True),
        "truth": (
            "Audio-probe index only. It records no review decision, edits no timeline, exports no media, "
            "publishes nothing, uploads nothing, transcribes nothing, mutates no media, overwrites no probe, "
            "deletes nothing, and creates no receipt truth."
        ),
    }


def render_markdown(payload: dict[str, Any]) -> str:
    counts = payload.get("counts") if isinstance(payload.get("counts"), dict) else {}
    lines = [
        "# Shorts cut-quality audio probe index",
        "",
        payload.get("truth", ""),
        "",
        "## Counts",
        "",
        f"- Audio probes: `{counts.get('audioProbes', 0)}`",
        f"- Shorts with audio probes: `{counts.get('shortsWithAudioProbes', 0)}`",
        f"- Latest cadence-review items: `{counts.get('latestCadenceReview', 0)}`",
        f"- Latest warnings: `{counts.get('latestWarnings', 0)}`",
        "",
        "## Latest audio probe per short",
        "",
    ]
    latest = payload.get("latestByShort") if isinstance(payload.get("latestByShort"), list) else []
    if not latest:
        lines.append("- No audio probes found yet.")
    for row in latest:
        paths = row.get("artifactPaths") if isinstance(row.get("artifactPaths"), dict) else {}
        lines.extend(
            [
                f"### {row.get('shortId')}",
                "",
                f"- Episode/version: `Episode {row.get('episode')}` / `{row.get('episodeVersion')}`",
                f"- Title: {row.get('title')}",
                f"- Assessment: `{row.get('assessmentLabel')}`",
                f"- Duration: `{row.get('durationSeconds')}`",
                f"- Meaningful pauses: `{row.get('meaningfulPauseCount')}`",
                f"- Long pauses: `{row.get('longPauseCount')}`",
                f"- Silence fraction: `{row.get('silenceFraction')}`",
                f"- Mean/max volume: `{row.get('meanVolumeDb')}` / `{row.get('maxVolumeDb')}` dB",
                f"- HTML: `{paths.get('html')}`",
                f"- Waveform: `{paths.get('waveform')}`",
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
        warnings = "".join(f"<li>{esc(warning)}</li>" for warning in row.get("warnings", [])[:4]) or "<li>No measurement warnings recorded.</li>"
        cards.append(
            f"""
            <article class="card">
              <p class="eyebrow">Episode {esc(row.get('episode'))} · {esc(row.get('episodeVersion'))}</p>
              <h2>{esc(row.get('shortId'))}</h2>
              <p>{esc(row.get('title'))}</p>
              <div class="pills">
                <span>{esc(row.get('assessmentLabel'))}</span>
                <span>{esc(row.get('durationSeconds'))}s</span>
                <span>{esc(row.get('meaningfulPauseCount'))} pauses</span>
                <span>{esc(row.get('silenceFraction'))} silence</span>
                <span>{esc(row.get('meanVolumeDb'))} dB mean</span>
              </div>
              <ul>{warnings}</ul>
              <a class="button" href="{esc(file_uri(html_path))}">Open audio probe</a>
              <code>{esc(html_path)}</code>
            </article>
            """
        )
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Quipsly shorts audio probe index</title>
  <style>
    :root {{ color-scheme: dark; --soil:#15110b; --moss:#1d3121; --leaf:#8edc89; --honey:#f3ce54; --water:#79d7e2; --cream:#fff1d4; --line:rgba(255,241,212,.16); }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:var(--cream); background:radial-gradient(circle at 12% -6%,rgba(121,215,226,.22),transparent 28rem),linear-gradient(135deg,var(--moss),var(--soil)); }}
    main {{ width:min(1440px,calc(100vw - 40px)); margin:0 auto; padding:36px 0 80px; }}
    header,.card {{ border:1px solid var(--line); border-radius:28px; background:rgba(255,241,212,.07); box-shadow:0 24px 80px rgba(0,0,0,.26); }}
    header {{ padding:32px; margin-bottom:18px; }}
    .eyebrow {{ color:var(--honey); letter-spacing:.16em; text-transform:uppercase; font-size:.76rem; font-weight:950; margin:0 0 8px; }}
    h1 {{ margin:0 0 12px; font-size:clamp(2.5rem,7vw,5.8rem); line-height:.9; }}
    h2 {{ margin:0 0 8px; }}
    p,li {{ color:#e0d1b4; line-height:1.55; }}
    .metrics {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:10px; margin-top:18px; }}
    .metrics div {{ border:1px solid var(--line); border-radius:18px; padding:13px; background:rgba(0,0,0,.22); }}
    .metrics strong {{ display:block; color:var(--leaf); font-size:2rem; }}
    .metrics span {{ color:#cdbf9e; text-transform:uppercase; letter-spacing:.09em; font-size:.72rem; font-weight:900; }}
    .grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(380px,1fr)); gap:14px; }}
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
    <p class="eyebrow">Quipsly Studio · cadence evidence index</p>
    <h1>Latest audio probes, with the pauses visible.</h1>
    <p>{esc(payload.get('truth'))}</p>
    <div class="metrics">
      <div><strong>{esc(counts.get('audioProbes', 0))}</strong><span>audio probes</span></div>
      <div><strong>{esc(counts.get('shortsWithAudioProbes', 0))}</strong><span>shorts covered</span></div>
      <div><strong>{esc(counts.get('latestCadenceReview', 0))}</strong><span>cadence review</span></div>
      <div><strong>{esc(counts.get('latestWarnings', 0))}</strong><span>warnings</span></div>
    </div>
  </header>
  <section class="grid">{''.join(cards) if cards else '<p>No audio probes found yet.</p>'}</section>
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
    parser = argparse.ArgumentParser(description="Index cut-quality audio probes.")
    parser.add_argument("--audio-probe-root", default=str(DEFAULT_AUDIO_PROBE_ROOT), help="Root folder containing audio probe artifacts.")
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR), help="Output folder for index artifacts.")
    parser.add_argument("--basename", default=DEFAULT_BASENAME, help="Output basename.")
    parser.add_argument("--format", choices=["markdown", "json", "html", "all"], default="markdown")
    parser.add_argument("--markdown", dest="format", action="store_const", const="markdown")
    parser.add_argument("--json", dest="format", action="store_const", const="json")
    parser.add_argument("--html", dest="format", action="store_const", const="html")
    parser.add_argument("--all", dest="format", action="store_const", const="all")
    args = parser.parse_args()

    root = Path(args.audio_probe_root).expanduser()
    output_dir = Path(args.output_dir).expanduser()
    payload = build_index(root, output_dir)
    written = write_outputs(payload, output_dir, args.basename)
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
