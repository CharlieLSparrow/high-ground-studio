#!/usr/bin/env python3
"""Compare a polished v002 short candidate against its source candidate.

This answers a concrete editing question: did the v002b trim remove dead air, or
did it cut off words/reaction? The tool uses local ASR as review evidence only
and writes versioned comparison sidecars. It does not mutate media or record
review decisions.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
from datetime import datetime, timezone
from html import escape
from pathlib import Path
from typing import Any

from studio_short_v002_review_queue import DEFAULT_ROOT, build_queue


DEFAULT_OUTPUT_ROOT = DEFAULT_ROOT / "review-board" / "short-v002-candidate-comparisons"
SCHEMA = "quipsly.studio.short-v002-candidate-comparison.v1"
VERSION = "2026-07-03.v1"


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def slug(text: str) -> str:
    out: list[str] = []
    for char in text.lower():
        if char.isalnum():
            out.append(char)
        elif out and out[-1] != "-":
            out.append("-")
    return "".join(out).strip("-") or "candidate"


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return data if isinstance(data, dict) else {}


def words(text: str) -> list[str]:
    return re.findall(r"[A-Za-z']+", text.lower())


def clean_text(text: str, limit: int = 1200) -> str:
    return " ".join(str(text or "").split())[:limit]


def run_provider(media_path: Path, provider: str, model: str, language: str) -> dict[str, Any]:
    script_path = Path(__file__).with_name("local_transcript_provider.py")
    result = subprocess.run(
        [
            "python3",
            str(script_path),
            str(media_path),
            "--provider",
            provider,
            "--model",
            model,
            "--language",
            language,
        ],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=600,
        check=False,
    )
    if result.returncode != 0:
        return {
            "ok": False,
            "error": (result.stderr or result.stdout or f"ASR failed with exit {result.returncode}").strip(),
            "segments": [],
            "text": "",
        }
    try:
        data = json.loads(result.stdout)
    except json.JSONDecodeError as error:
        return {"ok": False, "error": f"ASR output was not JSON: {error}", "segments": [], "text": ""}
    if not isinstance(data, dict):
        return {"ok": False, "error": "ASR output was not an object.", "segments": [], "text": ""}
    segments = []
    for segment in data.get("segments") or []:
        if not isinstance(segment, dict):
            continue
        text = clean_text(str(segment.get("text") or ""), 400)
        if not text:
            continue
        try:
            start = float(segment.get("start") or 0)
            end = float(segment.get("end") or start)
        except (TypeError, ValueError):
            start = 0.0
            end = 0.0
        segments.append({"start": start, "end": end, "text": text})
    text = clean_text(data.get("text") or " ".join(segment["text"] for segment in segments), 5000)
    return {
        "ok": bool(text or segments),
        "provider": data.get("provider") or provider,
        "model": data.get("model") or model,
        "language": data.get("language") or language,
        "segments": segments,
        "text": text,
        "error": "" if text or segments else "ASR returned no usable text.",
    }


def source_tail_segments(source: dict[str, Any], trim_end: float) -> list[dict[str, Any]]:
    segments = source.get("segments") if isinstance(source.get("segments"), list) else []
    tail = []
    for segment in segments:
        if not isinstance(segment, dict):
            continue
        try:
            if float(segment.get("end") or 0) >= trim_end - 0.15:
                tail.append(segment)
        except (TypeError, ValueError):
            continue
    return tail


def token_overlap(left: str, right: str) -> float:
    left_words = set(words(left))
    right_words = set(words(right))
    if not left_words or not right_words:
        return 0.0
    return len(left_words & right_words) / max(1, min(len(left_words), len(right_words)))


def build_payload(args: argparse.Namespace) -> dict[str, Any]:
    queue_args = argparse.Namespace(
        root=args.root,
        ledger=args.ledger,
        evidence_root=args.evidence_root,
        reviewer=args.reviewer,
        limit=0,
        include_decided=True,
        all_candidates=args.all_candidates,
    )
    queue = build_queue(queue_args)
    items = [item for item in queue.get("items", []) if isinstance(item, dict)]
    if args.short_id:
        item = next((candidate for candidate in items if candidate.get("shortId") == args.short_id), {})
    else:
        item = queue.get("nextItem") if isinstance(queue.get("nextItem"), dict) else {}
    if not item:
        return {
            "schema": SCHEMA,
            "version": VERSION,
            "generatedAt": utc_now(),
            "status": "candidate-comparison-empty",
            "shortId": args.short_id or "",
            "nextSafestAction": "No matching candidate found.",
            "truth": "Empty comparison. No media, review, publication, or receipt mutation occurred.",
        }

    manifest = load_json(Path(str(item.get("manifestPath") or "")))
    trim = manifest.get("trim") if isinstance(manifest.get("trim"), dict) else {}
    source_path = Path(str(manifest.get("sourceCandidatePath") or item.get("sourceCandidatePath") or "")).expanduser()
    candidate_path = Path(str(item.get("candidatePath") or "")).expanduser()
    trim_end = float(trim.get("trimEndSeconds") or item.get("durationSeconds") or 0)
    if not candidate_path.exists():
        status = "candidate-comparison-blocked"
        current = {"ok": False, "error": f"Candidate is missing: {candidate_path}", "text": "", "segments": []}
    else:
        current = run_provider(candidate_path, args.provider, args.model, args.language)
        status = "candidate-comparison-ready"
    if not source_path.exists():
        source = {"ok": False, "error": f"Source candidate is missing: {source_path}", "text": "", "segments": []}
        status = "candidate-comparison-blocked"
    else:
        source = run_provider(source_path, args.provider, args.model, args.language)
        if not source.get("ok"):
            status = "candidate-comparison-blocked"

    tail_segments = source_tail_segments(source, trim_end)
    tail_text = clean_text(" ".join(str(segment.get("text") or "") for segment in tail_segments), 1400)
    tail_word_count = len(words(tail_text))
    current_text = clean_text(str(current.get("text") or ""), 1400)
    source_text = clean_text(str(source.get("text") or ""), 2200)
    overlap = token_overlap(current_text, source_text)
    warnings: list[str] = []
    if tail_word_count >= 4:
        warnings.append("Source candidate has ASR words in the removed tail; listen for clipped meaning before keep.")
    if overlap < 0.45 and current.get("ok") and source.get("ok"):
        warnings.append("Current/source transcript overlap is low; verify comparison lineage.")
    if not current.get("ok"):
        warnings.append(f"Current candidate ASR failed: {current.get('error')}")
    if not source.get("ok"):
        warnings.append(f"Source candidate ASR failed: {source.get('error')}")
    if warnings:
        review_bias = "listen-before-keep"
        next_action = "Listen to both current and source candidates before keep; refine if the tail contains meaningful words/reaction."
    else:
        review_bias = "tail-likely-safe"
        next_action = "Tail comparison found no obvious removed speech; still listen once before keep."

    return {
        "schema": SCHEMA,
        "version": VERSION,
        "generatedAt": utc_now(),
        "status": status,
        "shortId": item.get("shortId"),
        "episode": item.get("episode"),
        "targetVersion": item.get("targetVersion"),
        "candidatePath": str(candidate_path),
        "sourceCandidatePath": str(source_path),
        "manifestPath": item.get("manifestPath") or "",
        "trim": trim,
        "trimEndSeconds": trim_end,
        "currentTranscript": {
            "ok": current.get("ok"),
            "provider": current.get("provider"),
            "model": current.get("model"),
            "preview": current_text,
            "error": current.get("error") or "",
        },
        "sourceTranscript": {
            "ok": source.get("ok"),
            "provider": source.get("provider"),
            "model": source.get("model"),
            "preview": source_text,
            "error": source.get("error") or "",
        },
        "removedTail": {
            "startAtSeconds": trim_end,
            "segmentCount": len(tail_segments),
            "wordCount": tail_word_count,
            "preview": tail_text,
            "segments": tail_segments[:8],
        },
        "comparison": {
            "currentSourceTokenOverlap": overlap,
            "warnings": warnings,
            "reviewBias": review_bias,
            "nextSafestAction": next_action,
        },
        "agentReadback": {
            "shortId": item.get("shortId"),
            "status": status,
            "reviewBias": review_bias,
            "tailWordCount": tail_word_count,
            "tailPreview": tail_text,
            "warningCount": len(warnings),
            "nextSafestAction": next_action,
        },
        "truth": "Candidate comparison uses machine ASR as review evidence only. It does not approve, record decisions, mutate media, overwrite versions, upload, publish, schedule, normalize transcript truth, mutate accounts, or create receipt truth.",
    }


def render_markdown(payload: dict[str, Any]) -> str:
    comparison = payload.get("comparison") if isinstance(payload.get("comparison"), dict) else {}
    tail = payload.get("removedTail") if isinstance(payload.get("removedTail"), dict) else {}
    lines = [
        "# V002 candidate comparison",
        "",
        f"Generated: `{payload.get('generatedAt')}`",
        f"Short: `{payload.get('shortId')}`",
        f"Status: `{payload.get('status')}`",
        f"Candidate: `{payload.get('candidatePath')}`",
        f"Source candidate: `{payload.get('sourceCandidatePath')}`",
        "",
        "## Removed tail",
        "",
        f"- Starts near: `{tail.get('startAtSeconds')}`",
        f"- Word count: `{tail.get('wordCount')}`",
        "",
        str(tail.get("preview") or "(no ASR text detected in removed tail)"),
        "",
        "## Comparison",
        "",
        f"- Bias: `{comparison.get('reviewBias')}`",
        f"- Overlap: `{comparison.get('currentSourceTokenOverlap')}`",
        f"- Next: {comparison.get('nextSafestAction')}",
        "",
    ]
    if comparison.get("warnings"):
        lines.extend(["Warnings:", ""])
        lines.extend([f"- {warning}" for warning in comparison.get("warnings") or []])
        lines.append("")
    lines.extend(["## Truth boundary", "", str(payload.get("truth") or "")])
    return "\n".join(lines).rstrip() + "\n"


def render_html(payload: dict[str, Any]) -> str:
    comparison = payload.get("comparison") if isinstance(payload.get("comparison"), dict) else {}
    tail = payload.get("removedTail") if isinstance(payload.get("removedTail"), dict) else {}
    warnings = "".join(f"<li>{escape(str(warning))}</li>" for warning in comparison.get("warnings") or []) or "<li>No ASR tail warnings. Still listen once.</li>"
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Quipsly v002 candidate comparison</title>
  <style>
    :root {{ color-scheme: dark; --bg:#101915; --panel:#203129; --ink:#f8ecd1; --muted:#baad90; --gold:#dabe55; }}
    body {{ margin:0; padding:32px; background:radial-gradient(circle at top left,#314b38,var(--bg)); color:var(--ink); font:15px/1.55 -apple-system,BlinkMacSystemFont,"Avenir Next",sans-serif; }}
    main {{ max-width:980px; margin:0 auto; }}
    .card {{ background:rgba(32,49,41,.93); border:1px solid rgba(218,190,85,.25); border-radius:24px; padding:20px; margin:18px 0; }}
    .path {{ color:var(--muted); word-break:break-all; }}
  </style>
</head>
<body><main>
  <h1>V002 candidate comparison</h1>
  <section class="card"><h2>{escape(str(payload.get('shortId')))}</h2><p class="path">{escape(str(payload.get('candidatePath') or ''))}</p><p class="path">{escape(str(payload.get('sourceCandidatePath') or ''))}</p></section>
  <section class="card"><h2>Removed tail</h2><p>Word count: {escape(str(tail.get('wordCount')))}</p><p>{escape(str(tail.get('preview') or 'No ASR text detected in removed tail.'))}</p></section>
  <section class="card"><h2>Review bias</h2><p>{escape(str(comparison.get('reviewBias')))}: {escape(str(comparison.get('nextSafestAction')))}</p><ul>{warnings}</ul></section>
</main></body></html>
"""


def write_outputs(payload: dict[str, Any], output_root: Path, basename: str, formats: set[str]) -> dict[str, str]:
    output_dir = output_root / slug(str(payload.get("shortId") or "candidate"))
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
    pointer = output_dir / f"latest-{slug(str(payload.get('shortId') or 'candidate'))}-candidate-comparison.json"
    pointer.write_text(json.dumps(paths, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    paths["latestPointerJson"] = str(pointer)
    return paths


def main() -> int:
    parser = argparse.ArgumentParser(description="Compare a v002 short candidate against its source candidate.")
    parser.add_argument("--short-id", default="")
    parser.add_argument("--root", default=str(DEFAULT_ROOT))
    parser.add_argument("--ledger", default=str(DEFAULT_ROOT / "review-board" / "short-v002-candidate-review-ledger" / "studio-short-v002-candidate-review-ledger.json"))
    parser.add_argument("--evidence-root", default=str(DEFAULT_ROOT / "review-board" / "short-v002-candidate-evidence"))
    parser.add_argument("--output-root", default=str(DEFAULT_OUTPUT_ROOT))
    parser.add_argument("--reviewer", default="Reviewer")
    parser.add_argument("--provider", default="auto")
    parser.add_argument("--model", default="base")
    parser.add_argument("--language", default="en")
    parser.add_argument("--all-candidates", action="store_true")
    parser.add_argument("--basename", default="")
    parser.add_argument("--format", choices=["markdown", "json", "html", "all"], default="markdown")
    parser.add_argument("--markdown", dest="format", action="store_const", const="markdown")
    parser.add_argument("--json", dest="format", action="store_const", const="json")
    parser.add_argument("--html", dest="format", action="store_const", const="html")
    parser.add_argument("--all", dest="format", action="store_const", const="all")
    args = parser.parse_args()
    payload = build_payload(args)
    basename = args.basename or f"{stamp_now()}-{slug(str(payload.get('shortId') or args.short_id or 'candidate'))}-candidate-comparison"
    formats = {"json", "markdown", "html"} if args.format == "all" else {args.format}
    payload["outputPaths"] = write_outputs(payload, Path(args.output_root).expanduser(), basename, formats)
    if args.format == "json":
        print(json.dumps(payload, indent=2, sort_keys=True))
    elif args.format == "html":
        print(render_html(payload))
    else:
        print(render_markdown(payload), end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
