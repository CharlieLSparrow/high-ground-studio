#!/usr/bin/env python3
"""Index local v002 short refinement candidates.

This makes derivative v002 proof exports discoverable and reviewable. It reads
candidate manifests and writes a local review index. It does not render,
approve, upload, publish, mutate originals, or create receipt truth.
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from html import escape
from pathlib import Path
from typing import Any


DEFAULT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
DEFAULT_OUTPUT_DIR = DEFAULT_ROOT / "review-board" / "short-v002-candidate-index"
DEFAULT_LEDGER = DEFAULT_ROOT / "review-board" / "short-v002-candidate-review-ledger" / "studio-short-v002-candidate-review-ledger.json"
SCHEMA = "quipsly.studio.short-v002-candidate-index.v1"
VERSION = "2026-07-03.v1"


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def load_json(path: Path) -> dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    return data if isinstance(data, dict) else {}


def safe_load_json(path_value: Any) -> dict[str, Any]:
    if not path_value:
        return {}
    path = Path(str(path_value)).expanduser()
    if not path.exists():
        return {}
    try:
        return load_json(path)
    except Exception:
        return {}


def lineage_from_evidence(data: dict[str, Any]) -> dict[str, Any]:
    evidence = safe_load_json(data.get("evidencePath"))
    candidate = evidence.get("candidate") if isinstance(evidence.get("candidate"), dict) else {}
    return {
        "evidencePath": str(data.get("evidencePath") or ""),
        "sourceCandidatePath": str(data.get("sourceCandidatePath") or candidate.get("outputPath") or ""),
        "hookCandidate": str(data.get("hookCandidate") or candidate.get("hookCandidate") or ""),
        "sourceReviewStatus": str(candidate.get("reviewStatus") or ""),
        "sourceTargetVersion": str(candidate.get("targetVersion") or ""),
    }


def candidate_manifest_paths(root: Path) -> list[Path]:
    paths: list[Path] = []
    for path in root.glob("Episode_*/v002/short-refinement-candidates/*/*.json"):
        if path.name.startswith("latest-"):
            continue
        paths.append(path)
    return sorted(paths, key=lambda path: (path.stat().st_mtime, str(path)), reverse=True)


def ledger_rows_by_short_id(ledger_path: Path) -> dict[str, dict[str, Any]]:
    ledger = safe_load_json(str(ledger_path))
    rows: dict[str, dict[str, Any]] = {}
    for item in ledger.get("items", []):
        if not isinstance(item, dict):
            continue
        short_id = str(item.get("shortId") or "")
        if short_id:
            rows[short_id] = item
    return rows


def summarize_manifest(path: Path, review_rows: dict[str, dict[str, Any]]) -> dict[str, Any]:
    data = load_json(path)
    lineage = lineage_from_evidence(data)
    output = data.get("output") if isinstance(data.get("output"), dict) else {}
    probe = output.get("probe") if isinstance(output.get("probe"), dict) else {}
    audio = output.get("audioSanity") if isinstance(output.get("audioSanity"), dict) else {}
    render = data.get("render") if isinstance(data.get("render"), dict) else {}
    workorder = data.get("workorder") if isinstance(data.get("workorder"), dict) else {}
    trim = data.get("trim") if isinstance(data.get("trim"), dict) else {}
    output_path = Path(str(output.get("path") or ""))
    has_output = output_path.exists()
    status = str(data.get("status") or "")
    if status == "v002-candidate-exported" and not has_output:
        status = "missing-output-file"
    audio_status = str(audio.get("status") or "")
    if not audio_status and status == "v002-candidate-exported" and has_output and probe.get("hasAudio") and probe.get("hasVideo"):
        audio_status = "probe-pass"
    next_action = "Listen/watch v002 with sound on before any keep or publish decision."
    if status == "blocked-weak-hook":
        next_action = "Find a stronger source phrase before exporting v002."
    elif audio_status not in {"pass", "probe-pass", ""}:
        next_action = "Resolve audio sanity issues before listen-through review."
    short_id = str(data.get("shortId") or "")
    review_row = review_rows.get(short_id, {})
    review_status = str(review_row.get("reviewStatus") or data.get("reviewStatus") or "")
    # Candidate status belongs to the current manifest, not an older review row.
    # Review rows can preserve a past local decision, but they must not make a
    # newly exported rescue candidate look blocked because an earlier manifest
    # for the same short id was blocked.
    candidate_status = status
    if review_status == "needs-listen":
        next_action = "Listen/watch the candidate with sound on before any keep or publish decision."
    elif review_status == "refine-again":
        next_action = "Run the next refinement pass before asking for approval."
    elif review_status == "keep":
        next_action = "Prepare package metadata, but do not publish without an external receipt action."
    elif review_status in {"reject", "hold"}:
        next_action = "Do not promote this candidate; review notes before further work."
    return {
        "manifestPath": str(path),
        "markdownPath": str(output.get("markdownPath") or data.get("markdownPath") or (path.with_suffix(".md") if path.with_suffix(".md").exists() else "")),
        "shortId": short_id,
        "episode": data.get("episode"),
        "status": status,
        "candidateStatus": candidate_status,
        "reviewStatus": review_status,
        "reviewer": str(review_row.get("reviewer") or ""),
        "reviewedAt": str(review_row.get("reviewedAt") or ""),
        "reviewNotes": str(review_row.get("reviewNotes") or ""),
        "targetVersion": data.get("targetVersion"),
        "sourceMediaPath": data.get("sourceMediaPath") or lineage.get("sourceCandidatePath"),
        "sourceCandidatePath": lineage.get("sourceCandidatePath"),
        "sourceEvidencePath": lineage.get("evidencePath"),
        "sourceReviewStatus": lineage.get("sourceReviewStatus"),
        "sourceTargetVersion": lineage.get("sourceTargetVersion"),
        "outputPath": str(output_path) if str(output_path) else "",
        "outputExists": has_output,
        "durationSeconds": probe.get("durationSeconds") or trim.get("durationSeconds"),
        "width": probe.get("width"),
        "height": probe.get("height"),
        "hasAudio": probe.get("hasAudio"),
        "hasVideo": probe.get("hasVideo"),
        "audioSanityStatus": audio_status,
        "audioIssues": audio.get("issues") if isinstance(audio.get("issues"), list) else [],
        "audioWarnings": audio.get("warnings") if isinstance(audio.get("warnings"), list) else [],
        "trim": trim,
        "qualityWarnings": data.get("qualityWarnings") if isinstance(data.get("qualityWarnings"), list) else [],
        "hookCandidate": data.get("hookCandidate") or trim.get("hookCandidate") or workorder.get("transcriptAnchors", {}).get("hookCandidate", "") or lineage.get("hookCandidate"),
        "renderOk": render.get("ok"),
        "nextSafestAction": next_action,
        "truth": "Candidate index row only. It does not approve, upload, publish, schedule, mutate source media, overwrite versions, delete files, or create receipt truth.",
    }


def build_index(root: Path, latest_only: bool, ledger_path: Path) -> dict[str, Any]:
    review_rows = ledger_rows_by_short_id(ledger_path)
    rows = [summarize_manifest(path, review_rows) for path in candidate_manifest_paths(root)]
    if latest_only:
        by_short: dict[str, dict[str, Any]] = {}
        for row in rows:
            short_id = str(row.get("shortId") or "")
            if short_id and short_id not in by_short:
                by_short[short_id] = row
        rows = list(by_short.values())
    counts = {
        "items": len(rows),
        "exported": sum(1 for row in rows if row.get("status") == "v002-candidate-exported" and row.get("outputExists")),
        "blockedWeakHook": sum(1 for row in rows if row.get("status") == "blocked-weak-hook"),
        "missingOutput": sum(1 for row in rows if row.get("status") == "missing-output-file"),
        "audioPass": sum(1 for row in rows if row.get("audioSanityStatus") in {"pass", "probe-pass"}),
        "needsListenReview": sum(1 for row in rows if row.get("reviewStatus") == "needs-listen"),
        "kept": sum(1 for row in rows if row.get("reviewStatus") == "keep"),
        "refineAgain": sum(1 for row in rows if row.get("reviewStatus") == "refine-again"),
        "held": sum(1 for row in rows if row.get("reviewStatus") == "hold"),
        "rejected": sum(1 for row in rows if row.get("reviewStatus") == "reject"),
        "sourceFilesMutated": False,
        "versionsOverwritten": False,
        "externalPublishing": False,
        "receiptTruthCreated": False,
    }
    return {
        "schema": SCHEMA,
        "version": VERSION,
        "generatedAt": utc_now(),
        "status": "short-v002-candidate-index-ready",
        "root": str(root),
        "ledgerPath": str(ledger_path),
        "counts": counts,
        "items": rows,
        "nextSafestAction": "Open the first exported v002 candidate, listen/watch with sound on, then record local review state before any promotion.",
        "truth": "Local v002 candidate index only. It reads derivative candidate manifests and writes review artifacts; it does not render, approve, upload, publish, schedule, mutate originals, overwrite versions, delete files, normalize transcripts, mutate accounts, or create receipt truth.",
    }


def render_markdown(payload: dict[str, Any]) -> str:
    lines = [
        "# Studio short v002 candidate index",
        "",
        f"Generated: `{payload.get('generatedAt')}`",
        f"Status: `{payload.get('status')}`",
        f"Items: `{payload.get('counts', {}).get('items')}`",
        f"Exported: `{payload.get('counts', {}).get('exported')}`",
        f"Blocked weak hook: `{payload.get('counts', {}).get('blockedWeakHook')}`",
        "",
        "## Candidates",
        "",
    ]
    for item in payload.get("items", []):
        lines.extend([
            f"### `{item.get('shortId')}`",
            "",
            f"- Episode: `{item.get('episode')}`",
            f"- Status: `{item.get('status')}`",
            f"- Candidate status: `{item.get('candidateStatus')}`",
            f"- Review: `{item.get('reviewStatus') or 'unreviewed'}`",
            f"- Output: `{item.get('outputPath')}`",
            f"- Duration: `{item.get('durationSeconds')}`",
            f"- Audio sanity: `{item.get('audioSanityStatus')}`",
            f"- Hook: {item.get('hookCandidate') or '(missing)'}",
            f"- Next: {item.get('nextSafestAction')}",
            "",
        ])
    lines.extend(["## Truth boundary", "", str(payload.get("truth") or "")])
    return "\n".join(lines).rstrip() + "\n"


def render_html(payload: dict[str, Any]) -> str:
    cards = []
    for item in payload.get("items", []):
        status = str(item.get("status") or "")
        cards.append(
            f"""
            <article class="card {escape(status)}">
              <div class="kicker">Episode {escape(str(item.get('episode')))} · {escape(status)}</div>
              <h2>{escape(str(item.get('shortId')))}</h2>
              <p><strong>Candidate:</strong> {escape(str(item.get('candidateStatus') or status))} · <strong>Review:</strong> {escape(str(item.get('reviewStatus') or 'unreviewed'))}</p>
              <p><strong>Duration:</strong> {escape(str(item.get('durationSeconds')))}s · <strong>Audio:</strong> {escape(str(item.get('audioSanityStatus') or 'unchecked'))}</p>
              <p><strong>Hook:</strong> {escape(str(item.get('hookCandidate') or 'missing'))}</p>
              <p><strong>Next:</strong> {escape(str(item.get('nextSafestAction')))}</p>
              <p class="path">{escape(str(item.get('outputPath') or item.get('manifestPath')))}</p>
            </article>
            """
        )
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Quipsly Studio v002 Candidate Index</title>
  <style>
    :root {{ color-scheme: dark; --bg: #101915; --panel: #203129; --ink: #f8ecd1; --muted: #baad90; --gold: #dabe55; --leaf: #86ca91; --clay: #ce6d50; }}
    body {{ margin: 0; padding: 32px; background: radial-gradient(circle at top left, #2c4330, var(--bg)); color: var(--ink); font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Avenir Next", sans-serif; }}
    h1 {{ margin: 0 0 8px; font-size: 34px; }}
    .sub {{ color: var(--muted); margin-bottom: 24px; }}
    .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 18px; }}
    .card {{ background: rgba(32,49,41,.9); border: 1px solid rgba(218,190,85,.25); border-radius: 22px; padding: 20px; box-shadow: 0 20px 60px rgba(0,0,0,.28); }}
    .card.blocked-weak-hook {{ border-color: rgba(206,109,80,.55); }}
    .kicker {{ color: var(--gold); text-transform: uppercase; letter-spacing: .12em; font-size: 11px; font-weight: 900; }}
    h2 {{ margin: 8px 0 10px; font-size: 22px; }}
    .path {{ color: var(--muted); font-size: 12px; word-break: break-all; }}
  </style>
</head>
<body>
  <h1>v002 candidate index</h1>
  <p class="sub">Derivative candidates for watch/listen review. No publishing or receipt truth.</p>
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
    latest = output_dir / "latest-short-v002-candidate-index.json"
    latest.write_text(json.dumps(paths, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    paths["latestPointerJson"] = str(latest)
    return paths


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a local v002 short candidate index.")
    parser.add_argument("--root", default=str(DEFAULT_ROOT))
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR))
    parser.add_argument("--ledger", default=str(DEFAULT_LEDGER))
    parser.add_argument("--all-candidates", action="store_true", help="Include older candidate manifests too.")
    parser.add_argument("--basename", default="")
    parser.add_argument("--format", choices=["markdown", "json", "html", "all"], default="markdown")
    parser.add_argument("--markdown", dest="format", action="store_const", const="markdown")
    parser.add_argument("--json", dest="format", action="store_const", const="json")
    parser.add_argument("--html", dest="format", action="store_const", const="html")
    parser.add_argument("--all", dest="format", action="store_const", const="all")
    args = parser.parse_args()

    payload = build_index(Path(args.root).expanduser(), latest_only=not args.all_candidates, ledger_path=Path(args.ledger).expanduser())
    basename = args.basename or f"{stamp_now()}-short-v002-candidate-index"
    formats = {"json", "markdown", "html"} if args.format == "all" else {args.format}
    payload["outputPaths"] = write_outputs(payload, Path(args.output_dir).expanduser(), basename, formats)
    if args.format == "json":
        print(json.dumps(payload, indent=2, sort_keys=True))
    elif args.format == "html":
        print(render_html(payload))
    else:
        print(render_markdown(payload), end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
