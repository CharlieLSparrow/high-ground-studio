#!/usr/bin/env python3
"""Rehearse v002 short candidate review decisions without recording them.

This is deliberately not another approval surface. It is a dry-run map that
turns current candidate evidence into plain-English consequences for keep,
refine-again, hold, and reject. The actual review ledger only changes when a
reviewer copies/runs one of the existing review commands.
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from html import escape
from pathlib import Path
from typing import Any


DEFAULT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
DEFAULT_BRIEF_POINTER = DEFAULT_ROOT / "review-board" / "short-v002-quality-briefs" / "latest-short-v002-quality-brief.json"
DEFAULT_THEATER_POINTER = DEFAULT_ROOT / "review-board" / "short-v002-candidate-review-theater" / "latest-short-v002-candidate-review-theater.json"
DEFAULT_OUTPUT_DIR = DEFAULT_ROOT / "review-board" / "short-v002-decision-rehearsals"
SCHEMA = "quipsly.studio.short-v002-decision-rehearsal.v1"
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
    return "".join(out).strip("-") or "short"


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return data if isinstance(data, dict) else {}


def load_pointer_path(pointer: Path, key: str = "jsonPath") -> tuple[str, dict[str, Any]]:
    pointer_data = load_json(pointer)
    json_path = str(pointer_data.get(key) or "")
    if not json_path:
        return "", {}
    return json_path, load_json(Path(json_path))


def latest_quality_for_short(short_id: str) -> tuple[str, dict[str, Any]]:
    short_slug = slug(short_id)
    candidates = sorted(
        DEFAULT_ROOT.glob(f"review-board/short-v002-quality-briefs/*-{short_slug}-quality-brief.json"),
        key=lambda path: (path.stat().st_mtime, str(path)),
        reverse=True,
    )
    if not candidates:
        return "", {}
    path = candidates[0]
    return str(path), load_json(path)


def theater_item_for_short(theater: dict[str, Any], short_id: str) -> dict[str, Any]:
    for item in theater.get("items", []) if isinstance(theater.get("items"), list) else []:
        if isinstance(item, dict) and str(item.get("shortId") or "") == short_id:
            return item
    selected = theater.get("selectedCandidate") if isinstance(theater.get("selectedCandidate"), dict) else {}
    if str(selected.get("shortId") or "") == short_id:
        return selected
    return {}


def theater_for_requested_short(theater: dict[str, Any], short_id: str) -> dict[str, Any]:
    item = theater_item_for_short(theater, short_id)
    if not item:
        return theater
    commands = item.get("commands") if isinstance(item.get("commands"), dict) else {}
    patched = dict(theater)
    patched["selectedShortId"] = short_id
    patched["selectedCandidate"] = item
    patched["agentReadback"] = {
        "shortId": item.get("shortId") or "",
        "episode": item.get("episode"),
        "targetVersion": item.get("targetVersion") or "",
        "reviewStatus": item.get("reviewStatus") or "",
        "candidateStatus": item.get("candidateStatus") or "",
        "candidatePath": item.get("outputPath") or "",
        "evidencePath": item.get("evidencePath") or "",
        "transcriptStatus": item.get("transcriptStatus") or "",
        "transcriptJson": item.get("transcriptJson") or "",
        "transcriptPreview": item.get("transcriptPreview") or "",
        "hookCandidate": item.get("hookCandidate") or "",
        "comparisonStatus": item.get("comparisonStatus") or "",
        "comparisonBias": item.get("comparisonBias") or "",
        "removedTailWordCount": item.get("removedTailWordCount"),
        "sourceCandidatePath": item.get("sourceCandidatePath") or "",
        "recommendation": item.get("nextSafestAction") or "",
        "warningCount": len(item.get("warnings") or []) if isinstance(item.get("warnings"), list) else 0,
        "warningSummary": item.get("warningSummary") or "",
        "warnings": item.get("warnings") if isinstance(item.get("warnings"), list) else [],
        "keepCommand": commands.get("keep") or "",
        "refineAgainCommand": commands.get("refineAgain") or "",
        "rejectCommand": commands.get("reject") or "",
        "holdCommand": commands.get("hold") or "",
    }
    return patched


def command_set(brief: dict[str, Any], theater: dict[str, Any]) -> dict[str, str]:
    brief_commands = brief.get("reviewCommands") if isinstance(brief.get("reviewCommands"), dict) else {}
    theater_readback = theater.get("agentReadback") if isinstance(theater.get("agentReadback"), dict) else {}
    def stronger_review_command(brief_key: str, theater_key: str) -> str:
        theater_command = str(theater_readback.get(theater_key) or "")
        brief_command = str(brief_commands.get(brief_key) or "")
        if "--watched" in theater_command and "--listened" in theater_command:
            return theater_command
        return theater_command or brief_command
    return {
        "keep": stronger_review_command("keep", "keepCommand"),
        "refine-again": stronger_review_command("refineAgain", "refineAgainCommand"),
        "hold": str(brief_commands.get("hold") or theater_readback.get("holdCommand") or ""),
        "reject": stronger_review_command("reject", "rejectCommand"),
        "theater": str(brief_commands.get("theater") or ""),
        "evidence": str(brief_commands.get("evidence") or ""),
        "transcript": str(brief_commands.get("transcript") or ""),
    }


def list_text(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item) for item in value if item]
    return []


def review_context(brief: dict[str, Any], theater: dict[str, Any]) -> dict[str, Any]:
    recommendation = brief.get("reviewRecommendation") if isinstance(brief.get("reviewRecommendation"), dict) else {}
    comparison = brief.get("candidateComparison") if isinstance(brief.get("candidateComparison"), dict) else {}
    comparison_summary = comparison.get("comparison") if isinstance(comparison.get("comparison"), dict) else {}
    removed_tail = comparison.get("removedTail") if isinstance(comparison.get("removedTail"), dict) else {}
    theater_readback = theater.get("agentReadback") if isinstance(theater.get("agentReadback"), dict) else {}
    warnings = list_text(theater_readback.get("warnings"))
    warning_summary = str(theater_readback.get("warningSummary") or "; ".join(warnings))
    return {
        "shortId": str(brief.get("shortId") or theater_readback.get("shortId") or ""),
        "episode": brief.get("episode") or theater_readback.get("episode"),
        "targetVersion": brief.get("targetVersion") or theater_readback.get("targetVersion") or "",
        "candidatePath": str(brief.get("candidatePath") or theater_readback.get("candidatePath") or ""),
        "reviewStatus": str(brief.get("reviewStatus") or theater_readback.get("reviewStatus") or ""),
        "readiness": str(brief.get("readiness") or ""),
        "hookText": str(brief.get("hookText") or theater_readback.get("hookCandidate") or ""),
        "transcriptStatus": str(brief.get("transcriptStatus") or theater_readback.get("transcriptStatus") or ""),
        "reviewBias": str(recommendation.get("reviewBias") or theater_readback.get("recommendation") or ""),
        "nextSafestAction": str(recommendation.get("nextSafestAction") or theater_readback.get("recommendation") or ""),
        "risks": list_text(recommendation.get("risks")),
        "blockers": list_text(recommendation.get("blockers")),
        "warnings": warnings,
        "warningSummary": warning_summary,
        "watchListenExpectation": "Before recording KEEP, REFINE, or REJECT, watch the candidate and listen with sound. If warnings exist, acknowledge them in the command so the local event is inspectable later.",
        "comparisonStatus": str(comparison.get("status") or theater_readback.get("comparisonStatus") or ""),
        "comparisonBias": str(comparison_summary.get("reviewBias") or theater_readback.get("comparisonBias") or ""),
        "comparisonNextSafestAction": str(comparison_summary.get("nextSafestAction") or ""),
        "removedTailWordCount": removed_tail.get("wordCount", theater_readback.get("removedTailWordCount")),
        "removedTailPreview": str(removed_tail.get("preview") or ""),
        "editDecisionExplanation": brief.get("editDecisionExplanation") if isinstance(brief.get("editDecisionExplanation"), dict) else {},
    }


def safe_to_record_now(context: dict[str, Any]) -> bool:
    """Machine evidence supports a choice, but it cannot replace listen review."""
    if context.get("blockers"):
        return False
    return False


def recommended_option(context: dict[str, Any]) -> str:
    blockers = context.get("blockers") or []
    risks = context.get("risks") or []
    if blockers:
        return "hold"
    if context.get("reviewStatus") == "needs-listen" and context.get("comparisonBias") == "tail-likely-safe":
        return "listen-then-keep"
    if risks:
        return "listen-then-refine-or-keep"
    if context.get("reviewStatus") == "keep":
        return "already-kept"
    return "listen-then-decide"


def build_decision_options(context: dict[str, Any], commands: dict[str, str]) -> list[dict[str, Any]]:
    source_mutation_truth = "Original media and source candidates stay untouched. Only the local review ledger would change if the command is run."
    return [
        {
            "decision": "keep",
            "label": "Keep after listen",
            "wouldChange": "Records this candidate as locally kept for the v002 review lane.",
            "chooseWhen": "Use after a real watch/listen pass confirms the hook, ending, framing, captions, and audio feel good enough for the current proof lane.",
            "risks": [
                "Premature keep can hide cadence or ending problems if no one actually listened.",
                "Keep is local readiness, not external publication or platform receipt truth.",
            ],
            "command": commands.get("keep", ""),
            "safeBoundary": source_mutation_truth,
        },
        {
            "decision": "refine-again",
            "label": "Refine again",
            "wouldChange": "Routes this candidate back into the refinement lane while preserving the current exported version.",
            "chooseWhen": "Use when the idea is worth saving but the current candidate has a real hook, cut, cadence, caption, framing, or audio problem.",
            "risks": [
                "Can create polish churn if the note is vague.",
                "Best paired with one concrete reason, for example ending too abrupt or hook starts too late.",
            ],
            "command": commands.get("refine-again", ""),
            "safeBoundary": source_mutation_truth,
        },
        {
            "decision": "hold",
            "label": "Hold",
            "wouldChange": "Marks the candidate as waiting for human/source/context clarification.",
            "chooseWhen": "Use when evidence is insufficient, source sync is questionable, or the right choice depends on Charlie, Mako, Homer, or missing context.",
            "risks": [
                "Holds are calm parking spots, not junk drawers.",
                "A hold should name what information would unblock the decision.",
            ],
            "command": commands.get("hold", ""),
            "safeBoundary": source_mutation_truth,
        },
        {
            "decision": "reject",
            "label": "Reject this candidate",
            "wouldChange": "Records that this candidate should not move forward while preserving the underlying source material and idea history.",
            "chooseWhen": "Use when the short does not land, is duplicative, or would cost more to fix than to remake from source.",
            "risks": [
                "Rejecting a candidate is not deleting the source idea.",
                "If the idea is strong but this render is poor, refine-again is usually better.",
            ],
            "command": commands.get("reject", ""),
            "safeBoundary": source_mutation_truth,
        },
    ]


def build_payload(args: argparse.Namespace) -> dict[str, Any]:
    quality_path = args.quality_brief or ""
    quality = load_json(Path(quality_path)) if quality_path else {}
    if not quality:
        quality_path, quality = load_pointer_path(Path(args.quality_pointer))

    theater_path = args.review_theater or ""
    theater = load_json(Path(theater_path)) if theater_path else {}
    if not theater:
        theater_path, theater = load_pointer_path(Path(args.theater_pointer))

    requested_short_id = args.short_id or ""
    if requested_short_id:
        quality_short_id = str(quality.get("shortId") or "")
        if quality_short_id != requested_short_id:
            short_quality_path, short_quality = latest_quality_for_short(requested_short_id)
            if short_quality:
                quality_path, quality = short_quality_path, short_quality
        theater = theater_for_requested_short(theater, requested_short_id)

    context = review_context(quality, theater)
    if requested_short_id and context.get("shortId") and requested_short_id != context.get("shortId"):
        return {
            "schema": SCHEMA,
            "version": VERSION,
            "generatedAt": utc_now(),
            "status": "short-v002-decision-rehearsal-needs-fresh-evidence",
            "requestedShortId": requested_short_id,
            "foundShortId": context.get("shortId"),
            "nextSafestAction": "Run the v002 quality brief and review theater for the requested short, then rehearse again.",
            "commands": {
                "qualityBrief": f"./script/agentctl.sh studio-short-v002-quality-brief --short-id {requested_short_id} --reviewer {args.reviewer} --json",
                "reviewTheater": f"./script/agentctl.sh studio-short-v002-candidate-review-theater --short-id {requested_short_id} --reviewer {args.reviewer} --json",
            },
            "truth": "Dry-run only. No review decision, media mutation, overwrite, upload, publication, account mutation, transcript normalization, or receipt truth occurred.",
        }

    commands = command_set(quality, theater)
    options = build_decision_options(context, commands)
    recommendation = recommended_option(context)
    return {
        "schema": SCHEMA,
        "version": VERSION,
        "generatedAt": utc_now(),
        "status": "short-v002-decision-rehearsal-ready" if context.get("shortId") else "short-v002-decision-rehearsal-empty",
        "reviewer": args.reviewer,
        "shortId": context.get("shortId") or requested_short_id,
        "currentContext": context,
        "qualityBriefPath": quality_path,
        "reviewTheaterPath": theater_path,
        "decisionOptions": options,
        "recommendation": {
            "recommendedOption": recommendation,
            "safeToRecordNow": safe_to_record_now(context),
            "recommendedNextHumanAction": context.get("nextSafestAction") or "Watch/listen once, then choose keep/refine-again/hold/reject.",
            "why": "The rehearsal can explain consequences, but it cannot replace listening to the actual exported candidate.",
        },
        "agentReadback": {
            "shortId": context.get("shortId") or requested_short_id,
            "currentReviewStatus": context.get("reviewStatus") or "",
            "reviewBias": context.get("reviewBias") or "",
            "comparisonBias": context.get("comparisonBias") or "",
            "warningSummary": context.get("warningSummary") or "",
            "warnings": context.get("warnings") if isinstance(context.get("warnings"), list) else [],
            "watchListenExpectation": context.get("watchListenExpectation") or "",
            "removedTailWordCount": context.get("removedTailWordCount"),
            "recommendedOption": recommendation,
            "safeToRecordNow": safe_to_record_now(context),
            "candidatePath": context.get("candidatePath") or "",
            "qualityBriefPath": quality_path,
            "reviewTheaterPath": theater_path,
            "keepCommandAfterListen": commands.get("keep", ""),
            "refineAgainCommandAfterListen": commands.get("refine-again", ""),
            "holdCommand": commands.get("hold", ""),
            "rejectCommandAfterListen": commands.get("reject", ""),
        },
        "truth": "Decision rehearsal only. It stages consequences and commands; it does not record review decisions, mutate source media, overwrite exports, upload, publish, schedule, approve externally, delete files, mutate accounts, normalize transcript truth, or create receipt truth.",
    }


def render_markdown(payload: dict[str, Any]) -> str:
    lines = [
        "# Short v002 decision rehearsal",
        "",
        f"Generated: `{payload.get('generatedAt')}`",
        f"Short: `{payload.get('shortId') or ''}`",
        f"Status: `{payload.get('status')}`",
        "",
    ]
    if payload.get("status") == "short-v002-decision-rehearsal-needs-fresh-evidence":
        lines.extend([
            str(payload.get("nextSafestAction") or ""),
            "",
            "```bash",
            str(payload.get("commands", {}).get("qualityBrief") or ""),
            str(payload.get("commands", {}).get("reviewTheater") or ""),
            "```",
            "",
            "## Truth boundary",
            "",
            str(payload.get("truth") or ""),
        ])
        return "\n".join(lines).rstrip() + "\n"

    context = payload.get("currentContext") if isinstance(payload.get("currentContext"), dict) else {}
    recommendation = payload.get("recommendation") if isinstance(payload.get("recommendation"), dict) else {}
    lines.extend([
        "## Current evidence",
        "",
        f"- Candidate: `{context.get('candidatePath') or ''}`",
        f"- Review state: `{context.get('reviewStatus') or ''}`",
        f"- Review bias: `{context.get('reviewBias') or ''}`",
        f"- Comparison: `{context.get('comparisonBias') or context.get('comparisonStatus') or ''}`",
        f"- Warning summary: `{context.get('warningSummary') or 'none'}`",
        f"- Removed-tail words: `{context.get('removedTailWordCount')}`",
        f"- Hook clue: {context.get('hookText') or '(missing)'}",
        f"- Watch/listen expectation: {context.get('watchListenExpectation')}",
        "",
        "## Recommendation",
        "",
        f"- Suggested route: `{recommendation.get('recommendedOption')}`",
        f"- Safe to record without listen: `{recommendation.get('safeToRecordNow')}`",
        f"- Next: {recommendation.get('recommendedNextHumanAction')}",
        "",
        "## Rehearsed decisions",
        "",
    ])
    for option in payload.get("decisionOptions", []):
        lines.extend([
            f"### {option.get('label')}",
            "",
            f"- Would change: {option.get('wouldChange')}",
            f"- Choose when: {option.get('chooseWhen')}",
            f"- Boundary: {option.get('safeBoundary')}",
            "",
            "Risks:",
            "",
        ])
        for risk in option.get("risks") or []:
            lines.append(f"- {risk}")
        lines.extend(["", "Command:", "", "```bash", str(option.get("command") or ""), "```", ""])
    lines.extend(["## Truth boundary", "", str(payload.get("truth") or "")])
    return "\n".join(lines).rstrip() + "\n"


def render_html(payload: dict[str, Any]) -> str:
    context = payload.get("currentContext") if isinstance(payload.get("currentContext"), dict) else {}
    recommendation = payload.get("recommendation") if isinstance(payload.get("recommendation"), dict) else {}
    option_html = []
    for option in payload.get("decisionOptions", []):
        risks = "".join(f"<li>{escape(str(risk))}</li>" for risk in option.get("risks") or [])
        option_html.append(f"""
        <section class="card option">
          <h2>{escape(str(option.get('label') or 'Decision'))}</h2>
          <p><strong>Would change:</strong> {escape(str(option.get('wouldChange') or ''))}</p>
          <p><strong>Choose when:</strong> {escape(str(option.get('chooseWhen') or ''))}</p>
          <ul>{risks}</ul>
          <pre>{escape(str(option.get('command') or ''))}</pre>
          <p class="boundary">{escape(str(option.get('safeBoundary') or ''))}</p>
        </section>
        """)
    body = f"""
    <section class="card hero">
      <div class="kicker">Dry-run only</div>
      <h1>Short v002 decision rehearsal</h1>
      <p>This page shows what each review decision would mean before anything is written.</p>
    </section>
    <section class="card">
      <h2>{escape(str(payload.get('shortId') or 'No short selected'))}</h2>
      <p class="path">{escape(str(context.get('candidatePath') or ''))}</p>
      <dl>
        <dt>Review state</dt><dd>{escape(str(context.get('reviewStatus') or ''))}</dd>
        <dt>Recommendation</dt><dd>{escape(str(recommendation.get('recommendedOption') or ''))}</dd>
        <dt>Safe to record without listen</dt><dd>{escape(str(recommendation.get('safeToRecordNow')))}</dd>
        <dt>Comparison</dt><dd>{escape(str(context.get('comparisonBias') or context.get('comparisonStatus') or ''))}</dd>
        <dt>Warnings</dt><dd>{escape(str(context.get('warningSummary') or 'none'))}</dd>
        <dt>Removed-tail words</dt><dd>{escape(str(context.get('removedTailWordCount')))}</dd>
      </dl>
      <p>{escape(str(recommendation.get('recommendedNextHumanAction') or ''))}</p>
      <p><strong>Watch/listen expectation:</strong> {escape(str(context.get('watchListenExpectation') or 'Watch/listen before recording local review state.'))}</p>
    </section>
    {''.join(option_html)}
    <section class="card"><h2>Truth boundary</h2><p>{escape(str(payload.get('truth') or ''))}</p></section>
    """
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Quipsly decision rehearsal</title>
  <style>
    :root {{ color-scheme: dark; --bg:#101915; --panel:#203129; --ink:#f8ecd1; --muted:#baad90; --gold:#dabe55; --leaf:#86ca91; --clay:#ce6d50; }}
    body {{ margin:0; padding:32px; background:radial-gradient(circle at top left,#334d38,var(--bg)); color:var(--ink); font:15px/1.55 -apple-system,BlinkMacSystemFont,"Avenir Next",sans-serif; }}
    main {{ max-width:1100px; margin:0 auto; }}
    h1 {{ margin:.25rem 0; font-size:40px; letter-spacing:-.035em; }}
    h2 {{ margin:.2rem 0 .65rem; }}
    .card {{ background:rgba(32,49,41,.94); border:1px solid rgba(218,190,85,.24); border-radius:26px; padding:22px; margin:18px 0; box-shadow:0 22px 70px rgba(0,0,0,.26); }}
    .hero {{ border-color:rgba(134,202,145,.32); }}
    .kicker {{ color:var(--gold); text-transform:uppercase; letter-spacing:.16em; font-size:12px; font-weight:900; }}
    .path,.boundary,dd {{ color:var(--muted); word-break:break-word; }}
    dl {{ display:grid; grid-template-columns:210px 1fr; gap:8px 16px; }}
    dt {{ color:var(--gold); font-weight:900; }}
    pre {{ white-space:pre-wrap; word-break:break-all; background:rgba(0,0,0,.2); border-radius:16px; padding:14px; }}
  </style>
</head>
<body><main>{body}</main></body>
</html>
"""


def write_outputs(payload: dict[str, Any], output_root: Path, basename: str, formats: set[str]) -> dict[str, str]:
    short_slug = slug(str(payload.get("shortId") or "short"))
    output_dir = output_root / short_slug
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
    pointer = output_dir / f"latest-{short_slug}-decision-rehearsal.json"
    pointer.write_text(json.dumps(paths, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    paths["latestPointerJson"] = str(pointer)
    return paths


def parse_formats(args: argparse.Namespace) -> set[str]:
    if args.all:
        return {"json", "markdown", "html"}
    return {args.format}


def main() -> int:
    parser = argparse.ArgumentParser(description="Rehearse v002 short candidate decisions without recording them.")
    parser.add_argument("--short-id", default="")
    parser.add_argument("--reviewer", default="Reviewer")
    parser.add_argument("--quality-brief", default="")
    parser.add_argument("--review-theater", default="")
    parser.add_argument("--quality-pointer", default=str(DEFAULT_BRIEF_POINTER))
    parser.add_argument("--theater-pointer", default=str(DEFAULT_THEATER_POINTER))
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR))
    parser.add_argument("--basename", default="")
    parser.add_argument("--format", choices=["markdown", "json", "html"], default="markdown")
    parser.add_argument("--markdown", dest="format", action="store_const", const="markdown")
    parser.add_argument("--json", dest="format", action="store_const", const="json")
    parser.add_argument("--html", dest="format", action="store_const", const="html")
    parser.add_argument("--all", action="store_true")
    args = parser.parse_args()

    payload = build_payload(args)
    basename = args.basename or f"{stamp_now()}-{slug(str(payload.get('shortId') or args.short_id or 'short'))}-decision-rehearsal"
    payload["outputPaths"] = write_outputs(payload, Path(args.output_dir).expanduser(), basename, parse_formats(args))

    if args.format == "json":
        print(json.dumps(payload, indent=2, sort_keys=True))
    elif args.format == "html":
        print(render_html(payload))
    else:
        print(render_markdown(payload), end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
