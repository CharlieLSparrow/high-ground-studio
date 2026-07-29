#!/usr/bin/env python3
"""Index Studio shorts transcript-intake batches.

Transcript intake batches create audio sidecars that can feed ASR/manual
transcript review. This index keeps the latest intake per short visible without
pretending transcript truth exists.
"""
from __future__ import annotations

import argparse
import html
import json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
DEFAULT_INTAKE_ROOT = DEFAULT_ROOT / "shorts-command-room" / "transcript-intake"
DEFAULT_OUTPUT_DIR = DEFAULT_INTAKE_ROOT / "index"
SCHEMA = "quipsly.studio.shorts-transcript-intake-index.v1"
VERSION = "2026-07-02.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""))


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def file_uri(path: Path) -> str:
    try:
        return path.expanduser().resolve().as_uri()
    except ValueError:
        return ""


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    return data if isinstance(data, dict) else {}


def batch_paths(intake_root: Path) -> list[Path]:
    if not intake_root.exists():
        return []
    return sorted(intake_root.glob("*-transcript-intake-batch/quipsly-studio-shorts-transcript-intake-batch.json"))


def extract_item(batch: dict[str, Any], item: dict[str, Any]) -> dict[str, Any]:
    paths = item.get("artifactPaths") if isinstance(item.get("artifactPaths"), dict) else {}
    audio_path = Path(str(item.get("audioSidecarPath") or paths.get("audioSidecar") or ""))
    json_path = Path(str(paths.get("json") or ""))
    notes_path = Path(str(paths.get("notes") or ""))
    planned = item.get("plannedTranscriptSidecars") if isinstance(item.get("plannedTranscriptSidecars"), dict) else {}
    item_folder = Path(str(batch.get("batchDir") or "")).joinpath(str(item.get("shortId") or ""))
    has_item_folder = bool(batch.get("batchDir") and item.get("shortId"))
    return {
        "shortId": item.get("shortId"),
        "episode": item.get("episode"),
        "episodeVersion": item.get("episodeVersion"),
        "title": item.get("title"),
        "status": item.get("status") or "unknown",
        "batchGeneratedAt": batch.get("generatedAt") or "",
        "batchDir": batch.get("batchDir") or "",
        "mediaPath": item.get("mediaPath"),
        "mediaExists": bool(item.get("mediaExists")),
        "audioSidecarPath": str(audio_path),
        "audioSidecarExists": audio_path.exists(),
        "audioSidecarBytes": audio_path.stat().st_size if audio_path.exists() else 0,
        "manifestPath": str(json_path),
        "manifestExists": json_path.exists(),
        "notesPath": str(notes_path),
        "notesExists": notes_path.exists(),
        "normalizedTranscriptPath": planned.get("normalizedTranscript") or "",
        "captionDraftSrtPath": planned.get("captionDraftSrt") or "",
        "captionDraftVttPath": planned.get("captionDraftVtt") or "",
        "rawProviderOutputPath": planned.get("rawProviderOutput") or "",
        "safeCommands": {
            "openAudio": f"open {shell_quote(str(audio_path))}" if audio_path.exists() else "",
            "openManifest": f"open {shell_quote(str(json_path))}" if json_path.exists() else "",
            "openNotes": f"open {shell_quote(str(notes_path))}" if notes_path.exists() else "",
            "openFolder": f"open {shell_quote(str(item_folder))}" if has_item_folder else "",
        },
        "nextSafestAction": (
            "Run ASR/manual transcript review against the audio sidecar, then write normalized transcript/caption sidecars to the planned paths."
            if audio_path.exists()
            else "Create or repair the audio sidecar before transcript review."
        ),
        "truth": "Transcript intake index item only. It is not transcript truth, review approval, publication, upload, schedule, or receipt truth.",
    }


def build_index(intake_root: Path, output_dir: Path) -> dict[str, Any]:
    batches = [read_json(path) for path in batch_paths(intake_root)]
    rows: list[dict[str, Any]] = []
    for batch in batches:
        for item in batch.get("items", []):
            if isinstance(item, dict):
                row = extract_item(batch, item)
                if row.get("shortId"):
                    rows.append(row)
    by_short: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        by_short[str(row["shortId"])].append(row)
    latest_by_short = [
        sorted(group, key=lambda row: str(row.get("batchGeneratedAt") or row.get("batchDir") or ""), reverse=True)[0]
        for group in by_short.values()
    ]
    latest_by_short.sort(key=lambda row: (int(row.get("episode") or 999), str(row.get("shortId") or "")))
    status_counts = Counter(row.get("status") or "unknown" for row in latest_by_short)
    counts = {
        "batches": len(batches),
        "intakeItems": len(rows),
        "shortsWithIntake": len(latest_by_short),
        "audioReadyForAsr": status_counts.get("audio-ready-for-asr", 0),
        "needsAudioIntake": len(latest_by_short) - status_counts.get("audio-ready-for-asr", 0),
        "audioSidecarsExisting": sum(1 for row in latest_by_short if row.get("audioSidecarExists")),
        "transcriptTruthCreated": False,
        "reviewDecisionRecorded": False,
        "externalPublishing": False,
        "receiptTruthCreated": False,
    }
    return {
        "schema": SCHEMA,
        "version": VERSION,
        "generatedAt": iso_now(),
        "intakeRoot": str(intake_root),
        "outputDir": str(output_dir),
        "counts": counts,
        "latestByShort": latest_by_short,
        "allItems": rows,
        "nextSafestAction": "Pick the next audio-ready short, run ASR/manual transcript review, and write normalized transcript sidecars without calling them canonical until reviewed.",
        "truth": "Transcript intake index only. It records no transcript truth, review decision, approval, media edit, publication, upload, schedule, account mutation, source mutation, overwrite of exports, delete, or receipt truth.",
    }


def render_markdown(index: dict[str, Any]) -> str:
    lines = [
        "# Studio shorts transcript intake index",
        "",
        f"Generated: `{index.get('generatedAt')}`",
        f"Intake root: `{index.get('intakeRoot')}`",
        "",
        index.get("truth", ""),
        "",
        "## Counts",
        "",
    ]
    for key, value in index.get("counts", {}).items():
        lines.append(f"- {key}: `{value}`")
    lines.extend(["", "## Latest intake by short", ""])
    for row in index.get("latestByShort", []):
        lines.extend(
            [
                f"### {row.get('shortId')} - {row.get('status')}",
                "",
                f"- Episode/version: `Episode {row.get('episode')}` / `{row.get('episodeVersion')}`",
                f"- Audio sidecar exists: `{row.get('audioSidecarExists')}`",
                f"- Audio sidecar: `{row.get('audioSidecarPath')}`",
                f"- Normalized transcript destination: `{row.get('normalizedTranscriptPath')}`",
                f"- Next: {row.get('nextSafestAction')}",
                "",
            ]
        )
    return "\n".join(lines).rstrip() + "\n"


def render_html(index: dict[str, Any]) -> str:
    metrics = "".join(
        f"<div><strong>{esc(value)}</strong><span>{esc(key)}</span></div>"
        for key, value in index.get("counts", {}).items()
        if key in {"batches", "shortsWithIntake", "audioReadyForAsr", "needsAudioIntake", "audioSidecarsExisting"}
    )
    cards = "\n".join(render_card(row) for row in index.get("latestByShort", []))
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Quipsly Studio transcript intake index</title>
  <style>
    :root {{ color-scheme: dark; --soil:#17120c; --moss:#18291f; --cream:#fff0cf; --honey:#f2c94c; --leaf:#8ee39a; --water:#82dce5; --clay:#d87358; --line:rgba(255,240,207,.16); }}
    * {{ box-sizing:border-box; }} body {{ margin:0; color:var(--cream); font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; background:radial-gradient(circle at 12% -8%,rgba(142,227,154,.2),transparent 30%),linear-gradient(135deg,var(--moss),var(--soil)); }}
    main {{ width:min(1440px,calc(100vw - 36px)); margin:0 auto; padding:34px 0 90px; }} header,.truth,.card {{ border:1px solid var(--line); border-radius:30px; background:rgba(255,240,207,.07); box-shadow:0 24px 80px rgba(0,0,0,.28); }} header,.truth,.card {{ padding:22px; }} header,.truth {{ margin-bottom:16px; }}
    .eyebrow {{ color:var(--honey); letter-spacing:.18em; text-transform:uppercase; font-size:.78rem; font-weight:950; margin:0 0 8px; }} h1 {{ margin:0 0 12px; font-size:clamp(2.3rem,6vw,5.4rem); line-height:.9; }} p,li {{ color:#e0d1b3; }} code {{ color:#ffeaa3; overflow-wrap:anywhere; }}
    .metrics {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:10px; margin-top:18px; }} .metrics div {{ border:1px solid var(--line); border-radius:18px; padding:13px; background:rgba(0,0,0,.22); }} .metrics strong {{ display:block; color:var(--leaf); font-size:2rem; }} .metrics span {{ color:#cdbf9e; text-transform:uppercase; letter-spacing:.09em; font-size:.72rem; font-weight:900; }}
    .grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(360px,1fr)); gap:16px; }} .audio-ready-for-asr {{ border-color:rgba(142,227,154,.45); }} .needs-audio-intake {{ border-color:rgba(216,115,88,.5); }}
    a {{ display:inline-block; margin:.25rem .25rem .25rem 0; border:1px solid var(--line); border-radius:999px; padding:8px 10px; background:rgba(0,0,0,.24); color:var(--cream); text-decoration:none; font-weight:900; font-size:.82rem; }} a:hover {{ color:var(--honey); border-color:rgba(242,201,76,.55); }}
  </style>
</head>
<body>
<main>
  <header><p class="eyebrow">Quipsly Studio · transcript intake</p><h1>Audio sidecars that need words.</h1><p>{esc(index.get('nextSafestAction'))}</p><div class="metrics">{metrics}</div></header>
  <section class="truth"><p><strong>Truth boundary:</strong> {esc(index.get('truth'))}</p></section>
  <section class="grid">{cards}</section>
</main>
</body>
</html>
"""


def render_card(row: dict[str, Any]) -> str:
    links = "".join(
        f"<a href='{esc(file_uri(Path(path)))}'>{esc(label)}</a>"
        for label, path in [
            ("Audio", row.get("audioSidecarPath") or ""),
            ("Manifest", row.get("manifestPath") or ""),
            ("Notes", row.get("notesPath") or ""),
        ]
        if path and Path(str(path)).exists()
    )
    return f"""<article class="card {esc(row.get('status'))}">
  <h2>{esc(row.get('shortId'))}</h2>
  <p>Episode {esc(row.get('episode'))} · {esc(row.get('status'))}</p>
  <p><code>{esc(row.get('audioSidecarPath'))}</code></p>
  <p>{esc(row.get('nextSafestAction'))}</p>
  <p>{links}</p>
</article>"""


def write_outputs(index: dict[str, Any], output_dir: Path) -> dict[str, str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / "quipsly-studio-shorts-transcript-intake-index.json"
    md_path = output_dir / "quipsly-studio-shorts-transcript-intake-index.md"
    html_path = output_dir / "quipsly-studio-shorts-transcript-intake-index.html"
    json_path.write_text(json.dumps(index, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    md_path.write_text(render_markdown(index), encoding="utf-8")
    html_path.write_text(render_html(index), encoding="utf-8")
    return {"json": str(json_path), "markdown": str(md_path), "html": str(html_path)}


def main() -> int:
    parser = argparse.ArgumentParser(description="Index transcript-intake audio sidecars for Studio shorts.")
    parser.add_argument("--intake-root", default=str(DEFAULT_INTAKE_ROOT))
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR))
    parser.add_argument("--format", choices=["markdown", "json", "html", "all"], default="all")
    parser.add_argument("--markdown", dest="format", action="store_const", const="markdown")
    parser.add_argument("--json", dest="format", action="store_const", const="json")
    parser.add_argument("--html", dest="format", action="store_const", const="html")
    parser.add_argument("--all", dest="format", action="store_const", const="all")
    args = parser.parse_args()

    intake_root = Path(args.intake_root).expanduser()
    output_dir = Path(args.output_dir).expanduser()
    index = build_index(intake_root, output_dir)
    index["artifactPaths"] = write_outputs(index, output_dir)
    if args.format == "json":
        print(json.dumps(index, indent=2, sort_keys=True))
    elif args.format == "html":
        print(render_html(index), end="")
    else:
        print(render_markdown(index), end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
