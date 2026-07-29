#!/usr/bin/env python3
"""Build a refinement queue from local short review decisions.

This is the bridge between "this short needs work" and "here is the next safe
editing move." It reads the local review ledger and nearby evidence sidecars,
then writes a durable queue for humans and agents. It does not touch source
media, exports, accounts, or publication state.
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from html import escape
from pathlib import Path
from typing import Any


DEFAULT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
DEFAULT_LEDGER = DEFAULT_ROOT / "review-board" / "studio-short-review-decision-ledger" / "studio-short-review-decision-ledger.json"
DEFAULT_OUTPUT_DIR = DEFAULT_ROOT / "review-board" / "short-refinement-queue"
SCHEMA = "quipsly.studio.short-refinement-queue.v1"
VERSION = "2026-07-03.v1"


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise SystemExit(f"Missing JSON: {path}")
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise SystemExit(f"Expected JSON object: {path}")
    return data


def first_existing(paths: list[Path]) -> Path | None:
    for path in paths:
        if path.exists():
            return path
    return None


def latest_file(folder: Path, pattern: str) -> Path | None:
    if not folder.exists():
        return None
    paths = sorted(folder.glob(pattern), key=lambda path: (path.stat().st_mtime, str(path)), reverse=True)
    return paths[0] if paths else None


def sidecar_paths(root: Path, short_id: str) -> dict[str, str]:
    contact = latest_file(root / "shorts-command-room" / "cut-quality-contact-sheets" / short_id, "*/*contact-sheet.html")
    audio = latest_file(root / "shorts-command-room" / "cut-quality-audio-probes" / short_id, "*/*audio-probe.html")
    worksheet = latest_file(root / "shorts-command-room" / "cut-quality-worksheets" / short_id, "*cut-quality-worksheet.md")
    transcript_dir = root / "shorts-command-room" / "transcript-workorders" / short_id
    transcript = first_existing([transcript_dir / f"{short_id}-asr-draft-transcript.json"])
    captions = first_existing([transcript_dir / f"{short_id}-caption-draft.srt"])
    triage = latest_file(root / "review-board" / "short-review-triage", f"*-{short_id}-short-review-triage.json")
    evidence = latest_file(root / "review-board" / "short-review-evidence-packets", "*next-short-review-evidence.json")
    return {
        "contactHtml": str(contact or ""),
        "audioHtml": str(audio or ""),
        "worksheetMarkdown": str(worksheet or ""),
        "transcriptJson": str(transcript or ""),
        "captionDraftSrt": str(captions or ""),
        "latestTriageJson": str(triage or ""),
        "latestEvidenceJson": str(evidence or ""),
    }


def transcript_preview(path: str, max_chars: int = 520) -> str:
    if not path:
        return ""
    file_path = Path(path)
    if not file_path.exists():
        return ""
    data = load_json(file_path)
    text = str(data.get("text") or "").replace("\n", " ").strip()
    return text[:max_chars].rstrip()


def classify_refinement(notes: str, transcript: str, paths: dict[str, str]) -> dict[str, Any]:
    lower = f"{notes} {transcript}".lower()
    actions: list[str] = []
    tags: list[str] = []
    if "silence" in lower or "pause" in lower or "pacing" in lower or "tight" in lower:
        tags.append("pacing")
        actions.append("Tighten in/out and review pauses for emphasis versus drag.")
    if "caption" in lower or paths.get("captionDraftSrt"):
        tags.append("caption")
        actions.append("Review caption wording, timing, and face-safe placement.")
    if "asr" in lower or "transcript" in lower or paths.get("transcriptJson"):
        tags.append("transcript")
        actions.append("Listen-check ASR names, terms, and meaning before using text for publishing.")
    if "clip" in lower or "clipping" in lower or "harsh" in lower or "audio" in lower:
        tags.append("audio")
        actions.append("Check loudness/harshness and avoid over-tight robotic cadence.")
    if "crop" in lower or "framing" in lower or "9:16" in lower:
        tags.append("framing")
        actions.append("Check 9:16 crop and avoid covering faces with text.")
    if "trail" in lower or "ending" in lower or "payoff" in lower:
        tags.append("ending")
        actions.append("Find a cleaner final beat or shorten before the idea trails off.")
    if not actions:
        tags.append("editor-review")
        actions.append("Watch and listen as an editor; decide whether the premise deserves a tighter v002.")
    return {"tags": sorted(set(tags)), "actions": actions}


def score_item(item: dict[str, Any], transcript: str, refinement: dict[str, Any]) -> int:
    score = 100
    duration = float(item.get("durationSeconds") or 0)
    if transcript:
        score += 20
    if 12 <= duration <= 45:
        score += 10
    if "pacing" in refinement.get("tags", []):
        score += 8
    if "transcript" in refinement.get("tags", []):
        score += 6
    if item.get("episode") in (5, 6):
        score += 4
    return score


def queue_item(root: Path, item: dict[str, Any]) -> dict[str, Any]:
    short_id = str(item.get("shortId") or "")
    paths = sidecar_paths(root, short_id)
    transcript = transcript_preview(paths["transcriptJson"])
    notes = str(item.get("notes") or "")
    refinement = classify_refinement(notes, transcript, paths)
    return {
        "shortId": short_id,
        "episode": item.get("episode"),
        "title": item.get("humanTitle") or item.get("title") or short_id,
        "version": item.get("version"),
        "durationSeconds": item.get("durationSeconds"),
        "aspect": item.get("aspect"),
        "mediaPath": item.get("mediaPath") or item.get("path") or "",
        "decision": item.get("decision"),
        "reviewer": item.get("reviewer"),
        "reviewedAt": item.get("reviewedAt"),
        "reviewNotes": notes,
        "transcriptPreview": transcript,
        "refinementTags": refinement["tags"],
        "nextActions": refinement["actions"],
        "priorityScore": score_item(item, transcript, refinement),
        "sidecars": paths,
        "safeCommands": {
            "openShort": f"open '{str(item.get('mediaPath') or item.get('path') or '').replace(chr(39), chr(39) + '\"' + chr(39) + '\"' + chr(39))}'",
            "triageAgain": f"./script/agentctl.sh studio-short-review-triage --short-id {short_id} --save --json",
            "readback": f"./script/agentctl.sh studio-short-review-readback --short-id {short_id} --json",
        },
        "truth": "Refinement queue item only. It is not an export, approval, upload, publication, schedule, media mutation, overwrite, delete, or receipt truth.",
    }


def build_queue(root: Path, ledger_path: Path, limit: int) -> dict[str, Any]:
    ledger = load_json(ledger_path)
    source_items = ledger.get("items") if isinstance(ledger.get("items"), list) else []
    refine_items = [
        item for item in source_items
        if isinstance(item, dict)
        and str(item.get("decision") or "") == "refine"
        and bool(item.get("exists", True))
    ]
    items = sorted(
        [queue_item(root, item) for item in refine_items],
        key=lambda item: (-int(item.get("priorityScore") or 0), int(item.get("episode") or 999), str(item.get("shortId") or "")),
    )
    if limit > 0:
        items = items[:limit]
    tag_counts: dict[str, int] = {}
    for item in items:
        for tag in item.get("refinementTags", []):
            tag_counts[tag] = tag_counts.get(tag, 0) + 1
    return {
        "schema": SCHEMA,
        "version": VERSION,
        "generatedAt": utc_now(),
        "status": "short-refinement-queue-ready",
        "root": str(root),
        "ledgerPath": str(ledger_path),
        "counts": {
            "items": len(items),
            "refineItemsInLedger": len(refine_items),
            "tagCounts": tag_counts,
            "sourceFilesMutated": False,
            "versionsOverwritten": False,
            "externalPublishing": False,
            "receiptTruthCreated": False,
        },
        "items": items,
        "nextSafestAction": "Open the top queue item, create a tighter v002 recipe/export candidate, then rerun triage before promoting.",
        "truth": "Local refinement queue only. It reads ledger/evidence sidecars and writes review artifacts only; it does not mutate originals, overwrite exports, upload, publish, schedule, approve, delete, or create receipt truth.",
    }


def render_markdown(payload: dict[str, Any]) -> str:
    lines = [
        "# Studio short refinement queue",
        "",
        f"Generated: `{payload.get('generatedAt')}`",
        f"Status: `{payload.get('status')}`",
        f"Items: `{payload.get('counts', {}).get('items')}`",
        "",
        "## Next safest action",
        "",
        str(payload.get("nextSafestAction") or ""),
        "",
        "## Queue",
        "",
    ]
    for index, item in enumerate(payload.get("items", []), start=1):
        lines.extend([
            f"### {index}. {item.get('title')} (`{item.get('shortId')}`)",
            "",
            f"- Episode: `{item.get('episode')}`",
            f"- Duration: `{item.get('durationSeconds')}`",
            f"- Priority: `{item.get('priorityScore')}`",
            f"- Tags: `{', '.join(item.get('refinementTags') or [])}`",
            f"- Review note: {item.get('reviewNotes') or '(none)'}",
            f"- Transcript preview: {item.get('transcriptPreview') or '(missing)'}",
            "- Next actions:",
        ])
        for action in item.get("nextActions", []):
            lines.append(f"  - {action}")
        lines.extend([
            f"- Media: `{item.get('mediaPath')}`",
            f"- Triage: `{item.get('sidecars', {}).get('latestTriageJson') or ''}`",
            "",
        ])
    lines.extend(["## Truth boundary", "", str(payload.get("truth") or "")])
    return "\n".join(lines).rstrip() + "\n"


def render_html(payload: dict[str, Any]) -> str:
    cards = []
    for item in payload.get("items", []):
        actions = "".join(f"<li>{escape(str(action))}</li>" for action in item.get("nextActions", []))
        tags = " ".join(f"<span>{escape(str(tag))}</span>" for tag in item.get("refinementTags", []))
        cards.append(
            f"""
            <article class="card">
              <div class="kicker">Episode {escape(str(item.get('episode')))} · {escape(str(item.get('durationSeconds')))}s · score {escape(str(item.get('priorityScore')))}</div>
              <h2>{escape(str(item.get('title')))}</h2>
              <p class="id">{escape(str(item.get('shortId')))}</p>
              <div class="tags">{tags}</div>
              <h3>Why refine</h3>
              <p>{escape(str(item.get('reviewNotes') or 'No review note.'))}</p>
              <h3>Transcript preview</h3>
              <p>{escape(str(item.get('transcriptPreview') or 'Missing transcript preview.'))}</p>
              <h3>Next actions</h3>
              <ul>{actions}</ul>
              <p class="path">{escape(str(item.get('mediaPath')))}</p>
            </article>
            """
        )
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Quipsly Studio Short Refinement Queue</title>
  <style>
    :root {{ color-scheme: dark; --bg: #111814; --panel: #1c2a22; --ink: #f5ead2; --muted: #b8aa8d; --leaf: #78c684; --gold: #d7b84f; }}
    body {{ margin: 0; padding: 32px; background: radial-gradient(circle at top left, #263829, var(--bg)); color: var(--ink); font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Avenir Next", sans-serif; }}
    h1 {{ font-size: 32px; margin: 0 0 8px; }}
    .sub {{ color: var(--muted); margin-bottom: 24px; }}
    .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 18px; }}
    .card {{ background: color-mix(in srgb, var(--panel), black 12%); border: 1px solid rgba(215,184,79,.25); border-radius: 22px; padding: 20px; box-shadow: 0 18px 50px rgba(0,0,0,.24); }}
    .kicker {{ color: var(--gold); text-transform: uppercase; letter-spacing: .14em; font-size: 11px; font-weight: 800; }}
    h2 {{ margin: 8px 0 0; font-size: 22px; }}
    h3 {{ margin: 18px 0 4px; color: var(--leaf); font-size: 13px; text-transform: uppercase; letter-spacing: .11em; }}
    .id, .path, .sub {{ color: var(--muted); }}
    .path {{ font-size: 12px; word-break: break-all; }}
    .tags span {{ display: inline-block; margin: 10px 6px 0 0; padding: 4px 9px; border-radius: 999px; background: rgba(120,198,132,.14); color: var(--leaf); font-weight: 700; font-size: 12px; }}
  </style>
</head>
<body>
  <h1>Short refinement queue</h1>
  <p class="sub">Promising shorts that need another editing pass. Sources remain whole; this is review metadata only.</p>
  <div class="grid">{''.join(cards)}</div>
</body>
</html>
"""


def write_outputs(payload: dict[str, Any], output_dir: Path, basename: str, formats: set[str]) -> dict[str, str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    paths: dict[str, str] = {}
    if "json" in formats:
        path = output_dir / f"{basename}.json"
        path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        paths["jsonPath"] = str(path)
    if "markdown" in formats:
        path = output_dir / f"{basename}.md"
        path.write_text(render_markdown(payload), encoding="utf-8")
        paths["markdownPath"] = str(path)
    if "html" in formats:
        path = output_dir / f"{basename}.html"
        path.write_text(render_html(payload), encoding="utf-8")
        paths["htmlPath"] = str(path)
    latest = output_dir / "latest-short-refinement-queue.json"
    latest.write_text(json.dumps(paths, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    paths["latestPointerJson"] = str(latest)
    return paths


def main() -> int:
    parser = argparse.ArgumentParser(description="Build local short refinement queue.")
    parser.add_argument("--root", default=str(DEFAULT_ROOT))
    parser.add_argument("--ledger", default=str(DEFAULT_LEDGER))
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR))
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--basename", default="")
    parser.add_argument("--format", choices=["markdown", "json", "html", "all"], default="markdown")
    parser.add_argument("--markdown", dest="format", action="store_const", const="markdown")
    parser.add_argument("--json", dest="format", action="store_const", const="json")
    parser.add_argument("--html", dest="format", action="store_const", const="html")
    parser.add_argument("--all", dest="format", action="store_const", const="all")
    args = parser.parse_args()

    root = Path(args.root).expanduser()
    payload = build_queue(root, Path(args.ledger).expanduser(), args.limit)
    basename = args.basename or f"{stamp_now()}-short-refinement-queue"
    formats = {"json", "markdown", "html"} if args.format == "all" else {args.format}
    output_paths = write_outputs(payload, Path(args.output_dir).expanduser(), basename, formats)
    payload["outputPaths"] = output_paths
    if args.format == "json":
        print(json.dumps(payload, indent=2, sort_keys=True))
    elif args.format == "html":
        print(render_html(payload))
    else:
        print(render_markdown(payload), end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
