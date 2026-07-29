#!/usr/bin/env python3
"""Build an evidence-backed quality brief for the next v002 short candidate.

This is a review assistant, not an approval engine. It explains hook/cadence/
platform-readiness signals from the candidate queue and evidence sidecars, then
offers explicit local review commands for a human or agent to choose after
watch/listen review.
"""
from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from html import escape
from pathlib import Path
from typing import Any

from studio_short_v002_review_queue import DEFAULT_OUTPUT_DIR as DEFAULT_QUEUE_OUTPUT_DIR
from studio_short_v002_review_queue import DEFAULT_ROOT, build_queue


DEFAULT_OUTPUT_DIR = DEFAULT_ROOT / "review-board" / "short-v002-quality-briefs"
DEFAULT_COMPARISON_ROOT = DEFAULT_ROOT / "review-board" / "short-v002-candidate-comparisons"
SCHEMA = "quipsly.studio.short-v002-quality-brief.v1"
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


def latest_comparison(short_id: str) -> dict[str, Any]:
    short_slug = slug(short_id)
    pointer = DEFAULT_COMPARISON_ROOT / short_slug / f"latest-{short_slug}-candidate-comparison.json"
    pointer_data = load_json(pointer)
    json_path = pointer_data.get("jsonPath")
    if json_path:
        return load_json(Path(str(json_path)))
    return {}


def words(text: str) -> list[str]:
    return re.findall(r"[A-Za-z']+", text.lower())


def human_duration(seconds: Any) -> str:
    try:
        value = float(seconds)
    except (TypeError, ValueError):
        return "unknown"
    return f"{value:.1f}s"


def score_hook(text: str) -> dict[str, Any]:
    tokens = words(text)
    starts_direct = bool(tokens and tokens[0] in {"i", "you", "we", "this", "that", "what", "why", "how", "when"})
    has_tension = any(token in tokens for token in {"pain", "hard", "problem", "wrong", "trust", "afraid", "failure", "better"})
    has_person = any(token in tokens for token in {"you", "your", "me", "my", "we", "our", "scott", "homer", "charlie"})
    score = 0
    score += 2 if starts_direct else 0
    score += 3 if has_tension else 0
    score += 2 if has_person else 0
    score += 1 if 10 <= len(tokens) <= 45 else 0
    if score >= 6:
        label = "strong-human-hook"
    elif score >= 3:
        label = "usable-hook-needs-listen"
    else:
        label = "weak-or-unclear-hook"
    return {
        "label": label,
        "score": score,
        "tokenCount": len(tokens),
        "startsDirect": starts_direct,
        "hasTension": has_tension,
        "hasHumanSubject": has_person,
    }


def platform_fit(duration: Any, width: Any, height: Any, has_audio: bool, has_video: bool) -> dict[str, Any]:
    try:
        seconds = float(duration)
    except (TypeError, ValueError):
        seconds = 0.0
    warnings: list[str] = []
    strengths: list[str] = []
    if width == 1080 and height == 1920:
        strengths.append("9:16 1080x1920 framing is platform-friendly for Shorts/Reels.")
    else:
        warnings.append("Not 1080x1920; verify vertical platform framing before promotion.")
    if 12 <= seconds <= 45:
        strengths.append("Duration is in a useful short social range.")
    elif seconds < 8:
        warnings.append("Very short; may feel like a fragment unless the punchline lands immediately.")
    elif seconds > 60:
        warnings.append("Long for most Shorts/Reels; consider a tighter variant.")
    else:
        strengths.append("Duration is plausible but needs human cadence review.")
    if has_audio:
        strengths.append("Audio stream is present.")
    else:
        warnings.append("No audio stream detected.")
    if has_video:
        strengths.append("Video stream is present.")
    else:
        warnings.append("No video stream detected.")
    return {
        "durationSeconds": seconds,
        "durationLabel": human_duration(seconds),
        "strengths": strengths,
        "warnings": warnings,
    }


def cadence_fit(evidence: dict[str, Any]) -> dict[str, Any]:
    audio = evidence.get("audioDiagnostics") if isinstance(evidence.get("audioDiagnostics"), dict) else {}
    metrics = audio.get("metrics") if isinstance(audio.get("metrics"), dict) else {}
    warnings = list(audio.get("warnings") or []) if isinstance(audio.get("warnings"), list) else []
    longest = float(metrics.get("longestSilenceSeconds") or 0)
    silence_count = int(metrics.get("silenceSegmentCount") or 0)
    notes: list[str] = []
    if longest >= 1.2:
        notes.append("Long silence remains; likely needs listen-check for drag or intentional pause.")
    elif longest > 0:
        notes.append("No large silence remains after v002b trim.")
    if silence_count >= 4:
        notes.append("Multiple silence segments detected; cadence may need manual feel check.")
    elif silence_count:
        notes.append("Silence count is modest; still check the ending by ear.")
    if not notes:
        notes.append("No automated silence concerns surfaced.")
    return {
        "longestSilenceSeconds": longest,
        "silenceSegmentCount": silence_count,
        "warnings": warnings,
        "notes": notes,
    }


def recommendation(item: dict[str, Any], hook: dict[str, Any], platform: dict[str, Any], cadence: dict[str, Any]) -> dict[str, Any]:
    blockers: list[str] = []
    risks: list[str] = []
    if not item.get("candidatePath"):
        blockers.append("No candidate file path.")
    if not item.get("hasAudio"):
        blockers.append("Candidate has no audio stream.")
    if not item.get("hasVideo"):
        blockers.append("Candidate has no video stream.")
    risks.extend(platform.get("warnings") or [])
    risks.extend(cadence.get("warnings") or [])
    if hook.get("label") == "weak-or-unclear-hook":
        risks.append("Hook text is weak or unclear from ASR; check whether the visual/audio context saves it.")
    if item.get("transcriptStatus") in {"missing", "candidate-machine-draft-empty"}:
        risks.append("No usable exact-candidate transcript; watch/listen evidence matters more.")
    if blockers:
        review_bias = "hold"
        next_action = "Resolve blockers before review."
    elif risks:
        review_bias = "refine-or-listen"
        next_action = "Watch/listen with sound and decide whether the risks are real or only machine-detected."
    else:
        review_bias = "listen-for-keep"
        next_action = "Watch/listen with sound; if the hook lands and ending feels complete, record keep."
    return {
        "reviewBias": review_bias,
        "blockers": blockers,
        "risks": risks,
        "nextSafestAction": next_action,
        "truth": "Recommendation is an evidence-backed review aid, not approval or publication truth.",
    }


def edit_decision_explanation(item: dict[str, Any], evidence: dict[str, Any]) -> dict[str, Any]:
    manifest = load_json(Path(str(item.get("manifestPath") or "")))
    trim = manifest.get("trim") if isinstance(manifest.get("trim"), dict) else {}
    selected_silence = trim.get("selectedSilence") if isinstance(trim.get("selectedSilence"), dict) else {}
    quality_warnings = list(manifest.get("qualityWarnings") or []) if isinstance(manifest.get("qualityWarnings"), list) else []
    source_candidate = str(manifest.get("sourceCandidatePath") or item.get("sourceCandidatePath") or "")
    evidence_candidate = evidence.get("candidate") if isinstance(evidence.get("candidate"), dict) else {}
    if not source_candidate:
        source_candidate = str(evidence_candidate.get("sourceCandidatePath") or evidence_candidate.get("sourceMediaPath") or "")

    original_duration = trim.get("durationSeconds")
    target_duration = trim.get("targetDurationSeconds")
    output_duration = item.get("durationSeconds")
    try:
        removed_seconds = max(0.0, float(original_duration) - float(output_duration))
    except (TypeError, ValueError):
        removed_seconds = 0.0

    operation = "candidate-review"
    summary = "Candidate exists for watch/listen review."
    preserved = "Preserves the exported candidate as-is."
    tradeoffs = []
    review_checks = ["Watch/listen with sound before recording keep, refine-again, reject, or hold."]

    reason = str(trim.get("reason") or "")
    if trim.get("ok") and selected_silence:
        operation = "trailing-silence-trim"
        summary = "Created a v002b derivative by trimming likely trailing dead air from a v002 candidate."
        preserved = f"Preserves the beginning of the candidate through about {human_duration(trim.get('trimEndSeconds'))}."
        tradeoffs.append(
            f"Removed about {removed_seconds:.1f}s from an earlier {human_duration(original_duration)} candidate to produce a {human_duration(output_duration)} version."
        )
        tradeoffs.append(
            f"Selected silence started near {human_duration(selected_silence.get('start'))} and lasted about {human_duration(selected_silence.get('duration'))}."
        )
        review_checks.append("Check that the ending still feels complete and does not clip a meaningful pause or reaction.")
    if reason:
        tradeoffs.append(reason)
    for warning in quality_warnings:
        tradeoffs.append(str(warning))
    if source_candidate:
        review_checks.append("Compare against the source candidate if the short feels too abrupt.")
    if not tradeoffs:
        tradeoffs.append("No mechanical edit tradeoff was found in the manifest; treat this as watch/listen review only.")

    return {
        "operation": operation,
        "summary": summary,
        "preserved": preserved,
        "sourceCandidatePath": source_candidate,
        "originalDurationSeconds": original_duration,
        "targetDurationSeconds": target_duration,
        "outputDurationSeconds": output_duration,
        "removedSeconds": removed_seconds,
        "selectedSilence": selected_silence,
        "tradeoffs": tradeoffs,
        "reviewChecks": review_checks,
        "truth": "Edit explanation is inferred from manifests/evidence. It explains local candidate intent; it is not approval or publication truth.",
    }


def build_payload(args: argparse.Namespace) -> dict[str, Any]:
    queue_args = argparse.Namespace(
        root=args.root,
        ledger=args.ledger,
        evidence_root=args.evidence_root,
        reviewer=args.reviewer,
        limit=0,
        include_decided=args.include_decided,
        all_candidates=args.all_candidates,
    )
    queue = build_queue(queue_args)
    items = [item for item in queue.get("items", []) if isinstance(item, dict)]
    if args.short_id:
        item = next((candidate for candidate in items if candidate.get("shortId") == args.short_id), {})
    else:
        item = queue.get("nextItem") if isinstance(queue.get("nextItem"), dict) else {}
    if not item:
        payload = {
            "schema": SCHEMA,
            "version": VERSION,
            "generatedAt": utc_now(),
            "status": "short-v002-quality-brief-empty",
            "reviewer": args.reviewer,
            "shortId": args.short_id or "",
            "nextSafestAction": "No matching v002 short candidate found.",
            "truth": "Empty quality brief. No media, review, publication, or receipt mutation occurred.",
        }
        return payload

    evidence = load_json(Path(str(item.get("latestEvidencePath") or item.get("evidencePath") or "")))
    transcript_preview = str(item.get("transcriptPreview") or "")
    hook_text = str(item.get("hookCandidate") or transcript_preview)
    hook = score_hook(hook_text)
    platform = platform_fit(item.get("durationSeconds"), item.get("width"), item.get("height"), bool(item.get("hasAudio")), bool(item.get("hasVideo")))
    cadence = cadence_fit(evidence)
    edit_explanation = edit_decision_explanation(item, evidence)
    comparison = latest_comparison(str(item.get("shortId") or ""))
    rec = recommendation(item, hook, platform, cadence)
    comparison_summary = comparison.get("comparison") if isinstance(comparison.get("comparison"), dict) else {}
    removed_tail = comparison.get("removedTail") if isinstance(comparison.get("removedTail"), dict) else {}
    commands = item.get("commands") if isinstance(item.get("commands"), dict) else {}
    return {
        "schema": SCHEMA,
        "version": VERSION,
        "generatedAt": utc_now(),
        "status": "short-v002-quality-brief-ready",
        "reviewer": args.reviewer,
        "shortId": item.get("shortId"),
        "episode": item.get("episode"),
        "targetVersion": item.get("targetVersion"),
        "candidatePath": item.get("candidatePath"),
        "evidencePath": item.get("latestEvidencePath") or item.get("evidencePath") or "",
        "readiness": item.get("readiness"),
        "reviewStatus": item.get("reviewStatus"),
        "transcriptStatus": item.get("transcriptStatus"),
        "warningSummary": item.get("warningSummary") or "",
        "warnings": item.get("warnings") if isinstance(item.get("warnings"), list) else [],
        "watchListenExpectation": item.get("watchListenExpectation") or "Watch/listen before recording local review state.",
        "hookText": hook_text,
        "transcriptPreview": transcript_preview,
        "hookAnalysis": hook,
        "platformFit": platform,
        "cadenceFit": cadence,
        "editDecisionExplanation": edit_explanation,
        "candidateComparison": comparison,
        "reviewRecommendation": rec,
        "reviewCommands": {
            "theater": commands.get("makeTheater") or "",
            "evidence": commands.get("evidence") or "",
            "transcript": commands.get("transcript") or "",
            "keep": commands.get("keep") or "",
            "refineAgain": commands.get("refineAgain") or "",
            "hold": commands.get("hold") or "",
            "reject": commands.get("reject") or "",
        },
        "agentReadback": {
            "shortId": item.get("shortId"),
            "reviewBias": rec.get("reviewBias"),
            "riskCount": len(rec.get("risks") or []),
            "blockerCount": len(rec.get("blockers") or []),
            "hookLabel": hook.get("label"),
            "editOperation": edit_explanation.get("operation"),
            "duration": platform.get("durationLabel"),
            "removedSeconds": edit_explanation.get("removedSeconds"),
            "comparisonBias": comparison_summary.get("reviewBias") or "",
            "warningSummary": item.get("warningSummary") or "",
            "watchListenExpectation": item.get("watchListenExpectation") or "Watch/listen before recording local review state.",
            "removedTailWordCount": removed_tail.get("wordCount"),
            "nextSafestAction": rec.get("nextSafestAction"),
            "theaterCommand": commands.get("makeTheater") or "",
        },
        "truth": "Short quality brief only. It explains evidence and options; it does not approve, record decisions, mutate source media, overwrite exports, upload, publish, schedule, normalize transcript truth, mutate accounts, or create receipt truth.",
    }


def render_markdown(payload: dict[str, Any]) -> str:
    if payload.get("status") != "short-v002-quality-brief-ready":
        return f"# Short v002 quality brief\n\n{payload.get('nextSafestAction')}\n"
    rec = payload.get("reviewRecommendation") if isinstance(payload.get("reviewRecommendation"), dict) else {}
    hook = payload.get("hookAnalysis") if isinstance(payload.get("hookAnalysis"), dict) else {}
    platform = payload.get("platformFit") if isinstance(payload.get("platformFit"), dict) else {}
    cadence = payload.get("cadenceFit") if isinstance(payload.get("cadenceFit"), dict) else {}
    edit_explanation = payload.get("editDecisionExplanation") if isinstance(payload.get("editDecisionExplanation"), dict) else {}
    comparison = payload.get("candidateComparison") if isinstance(payload.get("candidateComparison"), dict) else {}
    comparison_summary = comparison.get("comparison") if isinstance(comparison.get("comparison"), dict) else {}
    removed_tail = comparison.get("removedTail") if isinstance(comparison.get("removedTail"), dict) else {}
    commands = payload.get("reviewCommands") if isinstance(payload.get("reviewCommands"), dict) else {}
    lines = [
        "# Short v002 quality brief",
        "",
        f"Generated: `{payload.get('generatedAt')}`",
        f"Short: `{payload.get('shortId')}`",
        f"Episode: `{payload.get('episode')}`",
        f"Version: `{payload.get('targetVersion')}`",
        f"Candidate: `{payload.get('candidatePath')}`",
        f"Readiness: `{payload.get('readiness')}`",
        f"Review state: `{payload.get('reviewStatus')}`",
        f"Warnings: `{payload.get('warningSummary') or 'none'}`",
        f"Watch/listen expectation: {payload.get('watchListenExpectation')}",
        "",
        "## Hook",
        "",
        str(payload.get("hookText") or "(missing)"),
        "",
        f"- Hook label: `{hook.get('label')}`",
        f"- Hook score: `{hook.get('score')}`",
        "",
        "## Platform fit",
        "",
        f"- Duration: `{platform.get('durationLabel')}`",
        "",
    ]
    for strength in platform.get("strengths") or []:
        lines.append(f"- Strength: {strength}")
    for warning in platform.get("warnings") or []:
        lines.append(f"- Warning: {warning}")
    lines.extend(["", "## Cadence", ""])
    for note in cadence.get("notes") or []:
        lines.append(f"- {note}")
    lines.extend(["", "## Edit decision explanation", ""])
    lines.extend(
        [
            f"- Operation: `{edit_explanation.get('operation')}`",
            f"- Summary: {edit_explanation.get('summary')}",
            f"- Preserved: {edit_explanation.get('preserved')}",
            f"- Source candidate: `{edit_explanation.get('sourceCandidatePath') or ''}`",
        ]
    )
    if edit_explanation.get("tradeoffs"):
        lines.extend(["", "Tradeoffs:", ""])
        lines.extend([f"- {item}" for item in edit_explanation.get("tradeoffs") or []])
    if edit_explanation.get("reviewChecks"):
        lines.extend(["", "Review checks:", ""])
        lines.extend([f"- {item}" for item in edit_explanation.get("reviewChecks") or []])
    if comparison:
        lines.extend(["", "## Source comparison", ""])
        lines.extend(
            [
                f"- Status: `{comparison.get('status')}`",
                f"- Bias: `{comparison_summary.get('reviewBias')}`",
                f"- Removed-tail words: `{removed_tail.get('wordCount')}`",
                f"- Removed-tail preview: {removed_tail.get('preview') or '(none detected)'}",
                f"- Next: {comparison_summary.get('nextSafestAction')}",
            ]
        )
    lines.extend(["", "## Recommendation", "", f"- Bias: `{rec.get('reviewBias')}`", f"- Next: {rec.get('nextSafestAction')}", ""])
    if rec.get("risks"):
        lines.extend(["Risks:", ""])
        lines.extend([f"- {risk}" for risk in rec.get("risks") or []])
        lines.append("")
    lines.extend(
        [
            "## Review commands",
            "",
            "```bash",
            str(commands.get("theater") or ""),
            str(commands.get("keep") or ""),
            str(commands.get("refineAgain") or ""),
            str(commands.get("hold") or ""),
            str(commands.get("reject") or ""),
            "```",
            "",
            "## Truth boundary",
            "",
            str(payload.get("truth") or ""),
        ]
    )
    return "\n".join(lines).rstrip() + "\n"


def render_html(payload: dict[str, Any]) -> str:
    if payload.get("status") != "short-v002-quality-brief-ready":
        body = f"<p>{escape(str(payload.get('nextSafestAction') or 'No candidate found.'))}</p>"
    else:
        rec = payload.get("reviewRecommendation") if isinstance(payload.get("reviewRecommendation"), dict) else {}
        hook = payload.get("hookAnalysis") if isinstance(payload.get("hookAnalysis"), dict) else {}
        platform = payload.get("platformFit") if isinstance(payload.get("platformFit"), dict) else {}
        cadence = payload.get("cadenceFit") if isinstance(payload.get("cadenceFit"), dict) else {}
        edit_explanation = payload.get("editDecisionExplanation") if isinstance(payload.get("editDecisionExplanation"), dict) else {}
        comparison = payload.get("candidateComparison") if isinstance(payload.get("candidateComparison"), dict) else {}
        comparison_summary = comparison.get("comparison") if isinstance(comparison.get("comparison"), dict) else {}
        removed_tail = comparison.get("removedTail") if isinstance(comparison.get("removedTail"), dict) else {}
        commands = payload.get("reviewCommands") if isinstance(payload.get("reviewCommands"), dict) else {}
        risks = "".join(f"<li>{escape(str(risk))}</li>" for risk in rec.get("risks") or []) or "<li>No automated risks beyond required watch/listen.</li>"
        notes = "".join(f"<li>{escape(str(note))}</li>" for note in cadence.get("notes") or [])
        tradeoffs = "".join(f"<li>{escape(str(item))}</li>" for item in edit_explanation.get("tradeoffs") or [])
        review_checks = "".join(f"<li>{escape(str(item))}</li>" for item in edit_explanation.get("reviewChecks") or [])
        comparison_html = ""
        if comparison:
            comparison_html = f"<section class=\"card\"><h2>Source comparison</h2><p><strong>{escape(str(comparison_summary.get('reviewBias')))}</strong>: {escape(str(comparison_summary.get('nextSafestAction')))}</p><p>Removed-tail words: {escape(str(removed_tail.get('wordCount')))}</p><p>{escape(str(removed_tail.get('preview') or 'No ASR text detected in removed tail.'))}</p></section>"
        body = f"""
        <section class="card">
          <div class="kicker">Episode {escape(str(payload.get('episode')))} · {escape(str(payload.get('targetVersion')))} · {escape(str(payload.get('readiness')))}</div>
          <h2>{escape(str(payload.get('shortId')))}</h2>
          <p class="path">{escape(str(payload.get('candidatePath') or ''))}</p>
          <p><strong>Warnings:</strong> {escape(str(payload.get('warningSummary') or 'none'))}</p>
          <p><strong>Watch/listen:</strong> {escape(str(payload.get('watchListenExpectation') or 'Watch/listen before recording local review state.'))}</p>
        </section>
        <section class="card"><h2>Hook</h2><p>{escape(str(payload.get('hookText') or 'missing'))}</p><p><strong>{escape(str(hook.get('label')))}</strong> · score {escape(str(hook.get('score')))}</p></section>
        <section class="card"><h2>Platform fit</h2><p>Duration: {escape(str(platform.get('durationLabel')))}</p><ul>{''.join(f'<li>{escape(str(x))}</li>' for x in (platform.get('strengths') or platform.get('warnings') or []))}</ul></section>
        <section class="card"><h2>Cadence</h2><ul>{notes}</ul></section>
        <section class="card"><h2>Edit decision</h2><p><strong>{escape(str(edit_explanation.get('operation')))}</strong>: {escape(str(edit_explanation.get('summary')))}</p><p>{escape(str(edit_explanation.get('preserved')))}</p><ul>{tradeoffs}</ul><h3>Review checks</h3><ul>{review_checks}</ul></section>
        {comparison_html}
        <section class="card"><h2>Recommendation</h2><p><strong>{escape(str(rec.get('reviewBias')))}</strong>: {escape(str(rec.get('nextSafestAction')))}</p><ul>{risks}</ul></section>
        <section class="card"><h2>Commands</h2><pre>{escape(str(commands.get('theater') or ''))}\n{escape(str(commands.get('keep') or ''))}\n{escape(str(commands.get('refineAgain') or ''))}\n{escape(str(commands.get('reject') or ''))}</pre></section>
        """
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Quipsly short v002 quality brief</title>
  <style>
    :root {{ color-scheme: dark; --bg:#101915; --panel:#203129; --ink:#f8ecd1; --muted:#baad90; --gold:#dabe55; --leaf:#86ca91; --clay:#ce6d50; }}
    body {{ margin:0; padding:32px; background:radial-gradient(circle at top left,#314b38,var(--bg)); color:var(--ink); font:15px/1.55 -apple-system,BlinkMacSystemFont,"Avenir Next",sans-serif; }}
    main {{ max-width:980px; margin:0 auto; }}
    h1 {{ margin:0 0 8px; font-size:36px; }}
    .card {{ background:rgba(32,49,41,.93); border:1px solid rgba(218,190,85,.25); border-radius:24px; padding:20px; margin:18px 0; }}
    .kicker {{ color:var(--gold); text-transform:uppercase; letter-spacing:.14em; font-size:11px; font-weight:900; }}
    .path,pre {{ color:var(--muted); white-space:pre-wrap; word-break:break-all; }}
    pre {{ background:rgba(0,0,0,.18); border-radius:14px; padding:12px; }}
  </style>
</head>
<body><main><h1>Short v002 quality brief</h1>{body}</main></body></html>
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
    pointer = output_dir / "latest-short-v002-quality-brief.json"
    pointer.write_text(json.dumps(paths, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    paths["latestPointerJson"] = str(pointer)
    return paths


def main() -> int:
    parser = argparse.ArgumentParser(description="Build an evidence-backed v002 short quality brief.")
    parser.add_argument("--short-id", default="")
    parser.add_argument("--root", default=str(DEFAULT_ROOT))
    parser.add_argument("--ledger", default=str(DEFAULT_ROOT / "review-board" / "short-v002-candidate-review-ledger" / "studio-short-v002-candidate-review-ledger.json"))
    parser.add_argument("--evidence-root", default=str(DEFAULT_ROOT / "review-board" / "short-v002-candidate-evidence"))
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR))
    parser.add_argument("--reviewer", default="Reviewer")
    parser.add_argument("--include-decided", action="store_true")
    parser.add_argument("--all-candidates", action="store_true")
    parser.add_argument("--basename", default="")
    parser.add_argument("--format", choices=["markdown", "json", "html", "all"], default="markdown")
    parser.add_argument("--markdown", dest="format", action="store_const", const="markdown")
    parser.add_argument("--json", dest="format", action="store_const", const="json")
    parser.add_argument("--html", dest="format", action="store_const", const="html")
    parser.add_argument("--all", dest="format", action="store_const", const="all")
    args = parser.parse_args()
    payload = build_payload(args)
    short_slug = slug(str(payload.get("shortId") or args.short_id or "next"))
    basename = args.basename or f"{stamp_now()}-{short_slug}-quality-brief"
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
