#!/usr/bin/env python3
"""Build a local review queue for v002 short candidates.

The queue answers the practical question: "What should a human or agent review
next?" It reads candidate manifests, the local review ledger, and available
evidence packets. It writes versioned local artifacts only; it does not record
review decisions or touch media.
"""
from __future__ import annotations

import argparse
import json
import shlex
from datetime import datetime, timezone
from html import escape
from pathlib import Path
from typing import Any

from studio_short_v002_candidate_index import DEFAULT_LEDGER, DEFAULT_ROOT, build_index


DEFAULT_OUTPUT_DIR = DEFAULT_ROOT / "review-board" / "short-v002-review-queue"
DEFAULT_EVIDENCE_ROOT = DEFAULT_ROOT / "review-board" / "short-v002-candidate-evidence"
SCHEMA = "quipsly.studio.short-v002-review-queue.v1"
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
    data = json.loads(path.read_text(encoding="utf-8"))
    return data if isinstance(data, dict) else {}


def safe_load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        return load_json(path)
    except Exception:
        return {}


def latest_evidence(short_id: str, evidence_root: Path) -> tuple[str, dict[str, Any]]:
    short_slug = slug(short_id)
    pointer = evidence_root / f"latest-{short_slug}-v002-candidate-evidence.json"
    if pointer.exists():
        pointer_data = safe_load_json(pointer)
        json_path = pointer_data.get("jsonPath")
        if json_path and Path(str(json_path)).exists():
            path = Path(str(json_path))
            return str(path), load_json(path)
    folder = evidence_root / short_slug
    if folder.exists():
        candidates = sorted(folder.glob("*v002-candidate-evidence.json"), key=lambda path: (path.stat().st_mtime, str(path)), reverse=True)
        if candidates:
            return str(candidates[0]), load_json(candidates[0])
    return "", {}


def command_for(short_id: str, decision: str, reviewer: str, note: str, *, watched_listened: bool = False, acknowledge_warnings: bool = False) -> str:
    parts = [
        "./script/agentctl.sh",
        "studio-short-v002-candidate-review",
        shlex.quote(short_id),
        shlex.quote(decision),
        shlex.quote(reviewer),
        shlex.quote(note),
    ]
    if watched_listened:
        parts.extend(["--watched", "--listened"])
    if acknowledge_warnings:
        parts.append("--acknowledge-warnings")
    return " ".join(parts)


def review_gate_for(readiness: str, review_status: str) -> dict[str, Any]:
    if readiness in {"watch-listen-next", "unreviewed-export"}:
        status = "needs-human-listen"
        plain = "Watch and listen once before recording keep. Machine evidence can check files, transcript clues, and obvious silence, but it cannot judge human cadence or whether the moment lands."
    elif readiness == "locally-kept-not-published":
        status = "locally-kept"
        plain = "This candidate is locally accepted for review, but still has no external publication or receipt truth."
    elif readiness.startswith("blocked"):
        status = "blocked"
        plain = "Resolve the blocker before asking for a human keep/refine decision."
    elif readiness == "needs-refinement":
        status = "needs-refinement"
        plain = "The candidate has already been routed back for another versioned refinement pass."
    else:
        status = review_status or readiness or "unknown"
        plain = "Inspect the candidate and evidence before changing local review state."
    return {
        "status": status,
        "plainEnglish": plain,
        "localReadinessBoundary": "KEEP means locally accepted for this review lane only. It is not YouTube, Instagram, Patreon, podcast, or website publication.",
        "checklist": [
            "Does the first two seconds make sense without extra setup?",
            "Does the spoken cadence feel human rather than over-trimmed?",
            "Does the ending land cleanly without clipping a useful pause or reaction?",
            "Do framing, captions, and audio feel safe enough for the current proof lane?",
        ],
        "decisionGuide": {
            "keep": "Use after watch/listen if the hook lands, cadence feels human, and the ending is clean.",
            "refineAgain": "Use if the idea is good but the hook, cut, framing, caption, audio, or ending needs another version.",
            "hold": "Use if the right choice depends on missing context, source uncertainty, or a human call.",
            "reject": "Use if this candidate should not move forward, while preserving the source idea and media.",
        },
    }


def classify_item(row: dict[str, Any], evidence: dict[str, Any], reviewer: str) -> dict[str, Any]:
    short_id = str(row.get("shortId") or "")
    review_status = str(row.get("reviewStatus") or "unreviewed")
    candidate_status = str(row.get("candidateStatus") or row.get("status") or "")
    transcript = evidence.get("transcript") if isinstance(evidence.get("transcript"), dict) else {}
    recommendation = evidence.get("recommendation") if isinstance(evidence.get("recommendation"), dict) else {}
    warnings: list[str] = []
    for source in (
        row.get("audioWarnings"),
        row.get("qualityWarnings"),
        transcript.get("warnings"),
        recommendation.get("warnings"),
    ):
        if isinstance(source, list):
            warnings.extend(str(value) for value in source if value)

    has_output = bool(row.get("outputExists"))
    has_audio = row.get("hasAudio") is True
    has_video = row.get("hasVideo") is True
    transcript_status = str(transcript.get("status") or "missing")

    if not has_output:
        readiness = "blocked-missing-output"
        priority = 70
        next_action = "Do not stall here. Find or regenerate the candidate output after actionable watch/listen items are handled."
    elif not has_audio or not has_video:
        readiness = "blocked-media-probe"
        priority = 65
        next_action = "Do not stall here. Resolve missing audio/video after actionable watch/listen items are handled."
    elif review_status == "needs-listen":
        readiness = "watch-listen-next"
        priority = 10
        next_action = "Watch/listen with sound, then record keep or refine-again."
    elif review_status == "unreviewed":
        readiness = "unreviewed-export"
        priority = 15
        next_action = "Open the theater, watch/listen, then record a local review state."
    elif review_status == "refine-again":
        readiness = "needs-refinement"
        priority = 20
        next_action = "Use evidence notes to render a new versioned candidate."
    elif review_status == "hold":
        readiness = "held"
        priority = 70
        next_action = "Do not promote until the hold reason is resolved."
    elif review_status == "reject":
        readiness = "rejected"
        priority = 80
        next_action = "Do not promote. Preserve the artifact as learning evidence."
    elif review_status == "keep":
        readiness = "locally-kept-not-published"
        priority = 60
        next_action = "Prepare package metadata; do not publish without explicit approval and receipt truth."
    else:
        readiness = "unknown-review-state"
        priority = 50
        next_action = str(row.get("nextSafestAction") or recommendation.get("nextSafestAction") or "Inspect this candidate before proceeding.")

    if transcript_status in {"missing", "candidate-machine-draft-empty"} and readiness in {"watch-listen-next", "unreviewed-export"}:
        warnings.append("No usable exact-candidate transcript clue is available; review must rely on watch/listen.")
    clean_warnings = sorted(set(warnings))
    warning_summary = "; ".join(clean_warnings)
    watch_listen_expectation = "Before recording KEEP, REFINE, or REJECT, watch the candidate and listen with sound. If warnings exist, acknowledge them in the command so the local event is inspectable later."
    review_gate = review_gate_for(readiness, review_status)

    return {
        "shortId": short_id,
        "episode": row.get("episode"),
        "targetVersion": row.get("targetVersion"),
        "readiness": readiness,
        "priority": priority,
        "candidateStatus": candidate_status,
        "reviewStatus": review_status,
        "reviewer": row.get("reviewer") or "",
        "reviewedAt": row.get("reviewedAt") or "",
        "reviewNotes": row.get("reviewNotes") or "",
        "candidatePath": row.get("outputPath") or "",
        "manifestPath": row.get("manifestPath") or "",
        "evidencePath": evidence.get("outputPaths", {}).get("jsonPath") if isinstance(evidence.get("outputPaths"), dict) else "",
        "latestEvidencePath": evidence.get("outputPaths", {}).get("jsonPath") if isinstance(evidence.get("outputPaths"), dict) else "",
        "sourceEvidencePath": row.get("sourceEvidencePath") or "",
        "durationSeconds": row.get("durationSeconds"),
        "width": row.get("width"),
        "height": row.get("height"),
        "hasAudio": has_audio,
        "hasVideo": has_video,
        "audioSanityStatus": row.get("audioSanityStatus") or "",
        "transcriptStatus": transcript_status,
        "transcriptPreview": transcript.get("preview") or "",
        "hookCandidate": row.get("hookCandidate") or transcript.get("preview") or "",
        "warnings": clean_warnings,
        "warningSummary": warning_summary,
        "watchListenExpectation": watch_listen_expectation,
        "reviewGate": review_gate,
        "nextSafestAction": next_action,
        "commands": {
            "makeTheater": f"./script/agentctl.sh studio-short-v002-candidate-review-theater --short-id {shlex.quote(short_id)} --reviewer {shlex.quote(reviewer)} --html",
            "evidence": f"./script/agentctl.sh studio-short-v002-candidate-evidence --short-id {shlex.quote(short_id)} --json",
            "transcript": f"./script/agentctl.sh studio-short-v002-candidate-transcript --short-id {shlex.quote(short_id)} --provider auto --model base --json",
            "keep": command_for(short_id, "keep", reviewer, "Watched/listened locally; candidate works. Still not externally published.", watched_listened=True, acknowledge_warnings=bool(clean_warnings)),
            "refineAgain": command_for(short_id, "refine-again", reviewer, "Watched/listened locally; needs another refinement pass.", watched_listened=True, acknowledge_warnings=bool(clean_warnings)),
            "hold": command_for(short_id, "hold", reviewer, "Hold pending human/source/context decision."),
            "reject": command_for(short_id, "reject", reviewer, "Watched/listened locally; reject this candidate, preserve source idea if useful.", watched_listened=True, acknowledge_warnings=bool(clean_warnings)),
        },
        "truth": "Queue item only. It does not approve, record decisions, mutate media, overwrite versions, upload, publish, schedule, normalize transcripts, mutate accounts, or create receipt truth.",
    }


def build_queue(args: argparse.Namespace) -> dict[str, Any]:
    root = Path(args.root).expanduser()
    ledger_path = Path(args.ledger).expanduser()
    evidence_root = Path(args.evidence_root).expanduser()
    index = build_index(root, latest_only=not args.all_candidates, ledger_path=ledger_path)
    items = []
    for row in index.get("items", []):
        if not isinstance(row, dict):
            continue
        evidence_path, evidence = latest_evidence(str(row.get("shortId") or ""), evidence_root)
        item = classify_item(row, evidence, args.reviewer)
        if evidence_path and not item.get("latestEvidencePath"):
            item["latestEvidencePath"] = evidence_path
            item["evidencePath"] = evidence_path
        if not args.include_decided and item["reviewStatus"] in {"keep", "reject"}:
            continue
        items.append(item)
    items.sort(key=lambda item: (item.get("priority", 99), item.get("episode") or 999, str(item.get("shortId") or "")))
    if args.limit and args.limit > 0:
        items = items[: args.limit]
    counts = {
        "items": len(items),
        "watchListenNext": sum(1 for item in items if item.get("readiness") == "watch-listen-next"),
        "needsRefinement": sum(1 for item in items if item.get("readiness") == "needs-refinement"),
        "unreviewedExport": sum(1 for item in items if item.get("readiness") == "unreviewed-export"),
        "held": sum(1 for item in items if item.get("readiness") == "held"),
        "locallyKeptNotPublished": sum(1 for item in items if item.get("readiness") == "locally-kept-not-published"),
        "blocked": sum(1 for item in items if str(item.get("readiness") or "").startswith("blocked")),
        "sourceFilesMutated": False,
        "versionsOverwritten": False,
        "externalPublishing": False,
        "receiptTruthCreated": False,
    }
    next_item = items[0] if items else {}
    return {
        "schema": SCHEMA,
        "version": VERSION,
        "generatedAt": utc_now(),
        "status": "short-v002-review-queue-ready",
        "root": str(root),
        "ledgerPath": str(ledger_path),
        "evidenceRoot": str(evidence_root),
        "reviewer": args.reviewer,
        "counts": counts,
        "nextItem": next_item,
        "agentReadback": {
            "nextShortId": next_item.get("shortId") or "",
            "nextReadiness": next_item.get("readiness") or "",
            "nextReviewStatus": next_item.get("reviewStatus") or "",
            "nextCandidatePath": next_item.get("candidatePath") or "",
            "nextTranscriptStatus": next_item.get("transcriptStatus") or "",
            "nextAction": next_item.get("nextSafestAction") or "No current v002 review queue items found.",
            "nextReviewGateStatus": (next_item.get("reviewGate") or {}).get("status") if isinstance(next_item.get("reviewGate"), dict) else "",
            "nextLocalReadinessBoundary": (next_item.get("reviewGate") or {}).get("localReadinessBoundary") if isinstance(next_item.get("reviewGate"), dict) else "",
            "nextTheaterCommand": (next_item.get("commands") or {}).get("makeTheater") if isinstance(next_item.get("commands"), dict) else "",
        },
        "items": items,
        "nextSafestAction": next_item.get("nextSafestAction") if next_item else "No current v002 review queue items found.",
        "truth": "Local short v002 review queue only. It reads manifests, review ledger, and evidence sidecars; it does not approve, record review decisions, mutate source media, overwrite exports, upload, publish, schedule, normalize transcript truth, mutate accounts, or create receipt truth.",
    }


def render_markdown(payload: dict[str, Any]) -> str:
    readback = payload.get("agentReadback") if isinstance(payload.get("agentReadback"), dict) else {}
    lines = [
        "# Short v002 review queue",
        "",
        f"Generated: `{payload.get('generatedAt')}`",
        f"Reviewer: `{payload.get('reviewer')}`",
        f"Items: `{payload.get('counts', {}).get('items')}`",
        f"Next: `{readback.get('nextShortId') or 'none'}` · `{readback.get('nextReadiness') or ''}`",
        "",
        "## Next safest action",
        "",
        str(payload.get("nextSafestAction") or ""),
        "",
        "## Queue",
        "",
    ]
    for item in payload.get("items", []):
        commands = item.get("commands") if isinstance(item.get("commands"), dict) else {}
        review_gate = item.get("reviewGate") if isinstance(item.get("reviewGate"), dict) else {}
        lines.extend(
            [
                f"### `{item.get('shortId')}`",
                "",
                f"- Episode: `{item.get('episode')}`",
                f"- Readiness: `{item.get('readiness')}`",
                f"- Review: `{item.get('reviewStatus')}`",
                f"- Transcript: `{item.get('transcriptStatus')}`",
                f"- Candidate: `{item.get('candidatePath')}`",
                f"- Warnings: `{item.get('warningSummary') or 'none'}`",
                f"- Hook: {item.get('hookCandidate') or '(missing)'}",
                f"- Watch/listen expectation: {item.get('watchListenExpectation')}",
                f"- Next: {item.get('nextSafestAction')}",
                f"- Review gate: `{review_gate.get('status') or 'unknown'}`",
                f"- Boundary: {review_gate.get('localReadinessBoundary') or 'Local review state is not publication truth.'}",
                "",
                "Checklist:",
                "",
            ]
        )
        for check in review_gate.get("checklist", []):
            lines.append(f"- {check}")
        lines.extend(
            [
                "",
                "```bash",
                str(commands.get("makeTheater") or ""),
                str(commands.get("keep") or ""),
                str(commands.get("refineAgain") or ""),
                str(commands.get("reject") or ""),
                "```",
                "",
            ]
        )
    lines.extend(["## Truth boundary", "", str(payload.get("truth") or "")])
    return "\n".join(lines).rstrip() + "\n"


def render_html(payload: dict[str, Any]) -> str:
    cards: list[str] = []
    for item in payload.get("items", []):
        warnings = "".join(f"<li>{escape(str(warning))}</li>" for warning in item.get("warnings", [])) or "<li>No automated warnings.</li>"
        commands = item.get("commands") if isinstance(item.get("commands"), dict) else {}
        review_gate = item.get("reviewGate") if isinstance(item.get("reviewGate"), dict) else {}
        checklist = "".join(f"<li>{escape(str(check))}</li>" for check in review_gate.get("checklist", []))
        cards.append(
            f"""
            <article class="card {escape(str(item.get('readiness')))}">
              <div class="kicker">Episode {escape(str(item.get('episode')))} · {escape(str(item.get('readiness')))}</div>
              <h2>{escape(str(item.get('shortId')))}</h2>
              <p><strong>Review:</strong> {escape(str(item.get('reviewStatus')))} · <strong>Transcript:</strong> {escape(str(item.get('transcriptStatus')))}</p>
              <p><strong>Warnings:</strong> {escape(str(item.get('warningSummary') or 'none'))}</p>
              <p><strong>Hook:</strong> {escape(str(item.get('hookCandidate') or 'missing'))}</p>
              <p><strong>Watch/listen:</strong> {escape(str(item.get('watchListenExpectation') or 'Watch/listen before recording local review state.'))}</p>
              <p><strong>Next:</strong> {escape(str(item.get('nextSafestAction')))}</p>
              <section class="gate">
                <strong>Review gate · {escape(str(review_gate.get('status') or 'unknown'))}</strong>
                <p>{escape(str(review_gate.get('plainEnglish') or 'Inspect before changing local review state.'))}</p>
                <p>{escape(str(review_gate.get('localReadinessBoundary') or 'Local review state is not publication truth.'))}</p>
                <ul>{checklist}</ul>
              </section>
              <ul>{warnings}</ul>
              <p class="path">{escape(str(item.get('candidatePath') or ''))}</p>
              <pre>{escape(str(commands.get('makeTheater') or ''))}\n{escape(str(commands.get('keep') or ''))}\n{escape(str(commands.get('refineAgain') or ''))}\n{escape(str(commands.get('reject') or ''))}</pre>
            </article>
            """
        )
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Quipsly short v002 review queue</title>
  <style>
    :root {{ color-scheme: dark; --bg:#101915; --panel:#203129; --ink:#f8ecd1; --muted:#baad90; --gold:#dabe55; --leaf:#86ca91; --clay:#ce6d50; }}
    body {{ margin:0; padding:32px; background:radial-gradient(circle at top left,#2e4936,var(--bg)); color:var(--ink); font:15px/1.55 -apple-system,BlinkMacSystemFont,"Avenir Next",sans-serif; }}
    main {{ max-width:1180px; margin:0 auto; }}
    h1 {{ margin:0 0 8px; font-size:36px; letter-spacing:-.03em; }}
    .sub {{ color:var(--muted); margin:0 0 24px; }}
    .grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(340px,1fr)); gap:18px; }}
    .card {{ background:rgba(32,49,41,.92); border:1px solid rgba(218,190,85,.25); border-radius:24px; padding:20px; box-shadow:0 20px 60px rgba(0,0,0,.28); }}
    .watch-listen-next {{ border-color:rgba(218,190,85,.68); }}
    .needs-refinement {{ border-color:rgba(98,183,216,.62); }}
    .kicker {{ color:var(--gold); text-transform:uppercase; letter-spacing:.13em; font-size:11px; font-weight:900; }}
    h2 {{ margin:8px 0 10px; font-size:23px; }}
    .path,pre {{ color:var(--muted); white-space:pre-wrap; word-break:break-all; }}
    pre {{ background:rgba(0,0,0,.18); border-radius:14px; padding:12px; }}
    .gate {{ margin:14px 0; padding:14px; border-radius:16px; background:rgba(218,190,85,.11); border:1px solid rgba(218,190,85,.28); }}
    .gate p {{ margin:.35rem 0; color:var(--muted); }}
  </style>
</head>
<body><main>
  <h1>Short v002 review queue</h1>
  <p class="sub">The next reversible review actions. This page does not approve or publish anything.</p>
  <div class="grid">{''.join(cards)}</div>
</main></body>
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
    pointer = output_dir / "latest-short-v002-review-queue.json"
    pointer.write_text(json.dumps(paths, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    paths["latestPointerJson"] = str(pointer)
    return paths


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a local short v002 review queue.")
    parser.add_argument("--root", default=str(DEFAULT_ROOT))
    parser.add_argument("--ledger", default=str(DEFAULT_LEDGER))
    parser.add_argument("--evidence-root", default=str(DEFAULT_EVIDENCE_ROOT))
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR))
    parser.add_argument("--reviewer", default="Reviewer")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--include-decided", action="store_true")
    parser.add_argument("--all-candidates", action="store_true")
    parser.add_argument("--basename", default="")
    parser.add_argument("--format", choices=["markdown", "json", "html", "all"], default="markdown")
    parser.add_argument("--markdown", dest="format", action="store_const", const="markdown")
    parser.add_argument("--json", dest="format", action="store_const", const="json")
    parser.add_argument("--html", dest="format", action="store_const", const="html")
    parser.add_argument("--all", dest="format", action="store_const", const="all")
    args = parser.parse_args()

    payload = build_queue(args)
    basename = args.basename or f"{stamp_now()}-short-v002-review-queue"
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
