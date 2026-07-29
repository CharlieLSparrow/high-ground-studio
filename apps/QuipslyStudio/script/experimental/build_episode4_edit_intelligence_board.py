#!/usr/bin/env python3
"""Build Episode 4 transcript-aware edit intelligence.

This board turns the Episode 4 draft transcript spine and cue board into safe,
reviewable editing work orders: clip-weave anchors, pause/cadence candidates,
shorts candidates, reaction-cover candidates, and transcript-aware review notes.

It does not write timeline decisions, import clips, render exports, publish, or
mutate source media. The output is metadata for humans/agents to inspect before
changing the edit.
"""
from __future__ import annotations

import argparse
import html
import json
import math
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
SPINE_POINTER = RELEASE_ROOT / "review-board/transcript-spines/latest-episode-04-transcript-spine.json"
CUE_POINTER = RELEASE_ROOT / "review-board/episode4-transcript-cues/latest-episode4-transcript-cues.json"
OUT_ROOT = RELEASE_ROOT / "review-board/episode4-edit-intelligence"
LATEST_POINTER = OUT_ROOT / "latest-episode4-edit-intelligence.json"
SCHEMA = "quipsly.episode4-edit-intelligence.v1"

REACTION_WORDS = {
    "yeah", "yes", "right", "wow", "oh", "okay", "exactly", "laugh", "funny", "huh", "true", "great", "nice",
}
HOOK_PHRASES = [
    "what if", "here's", "here is", "the reason", "that's why", "that is why", "i realized", "i think", "you can", "you have to", "the problem", "the point", "one thing", "the thing", "it turns out",
]
PAYOFF_PHRASES = [
    "that's why", "that is why", "so", "because", "the point", "the lesson", "what matters", "it means", "which is", "therefore",
]
PRODUCTION_NOISE = [
    "is recording", "solid red", "mic", "microphone", "turn it up", "not working", "battery", "button", "testing",
    "i'm filming", "filming", "cut this out", "cutting things out", "cut the middle", "take it from",
    "bring up", "pull up", "leg breather", "do we dive back", "finish up the clip",
]
CADENCE_KEEP_WORDS = ["pause", "breath", "quiet", "think", "feel", "important", "meaning", "attention", "listen"]
CUT_STYLE_GUIDE = {
    "status": "draft-operational-style-guide",
    "principles": [
        {
            "key": "audio-carries-trust",
            "label": "Audio carries trust",
            "rule": "Protect sentence meaning, breath, and emotional cadence before making a visual cut feel clever.",
            "riskIfIgnored": "The edit can feel over-cleaned, robotic, or like it is fighting the speakers.",
        },
        {
            "key": "whole-sources-stay-whole",
            "label": "Whole sources stay whole",
            "rule": "Treat source files as intact evidence; edits are metadata decisions on top of the synced spine.",
            "riskIfIgnored": "The editor collapses back into chopped-clip archaeology and becomes scary to revise.",
        },
        {
            "key": "cover-jump-cuts-with-purpose",
            "label": "Cover jump cuts with purpose",
            "rule": "Use reaction shots, source clips, 9:16 reframes, or intentional hard cuts to hide or embrace a visual jump.",
            "riskIfIgnored": "Single-speaker jumps feel accidental, especially when posture or eye-line changes sharply.",
        },
        {
            "key": "source-clips-answer-a-setup",
            "label": "Source clips answer a setup",
            "rule": "A watched/source clip should visually answer what the hosts are setting up, not merely prove we found a file.",
            "riskIfIgnored": "Clip inserts interrupt the conversation instead of making the episode feel richer.",
        },
        {
            "key": "silence-is-not-always-dead-air",
            "label": "Silence is not always dead air",
            "rule": "Tighten technical pauses and wandering gaps; preserve reflective silence, laughter, and human processing time.",
            "riskIfIgnored": "The episode loses warmth and starts to sound like a chopped-up ad read.",
        },
    ],
    "techniques": [
        {
            "key": "j-cut",
            "label": "J-cut",
            "useWhen": "The next visual source answers a spoken setup and can arrive slightly before the visual switch.",
            "defaultRange": "0.25-0.75s audio lead",
            "reviewQuestion": "Does the incoming audio make the visual switch feel inevitable instead of abrupt?",
        },
        {
            "key": "l-cut",
            "label": "L-cut",
            "useWhen": "A host reaction, laugh, or finishing thought should continue after the visual returns or changes.",
            "defaultRange": "0.5-1.5s audio tail",
            "reviewQuestion": "Does the lingering audio preserve humanity, or does it muddy the next thought?",
        },
        {
            "key": "reaction-cover",
            "label": "Reaction cover",
            "useWhen": "A single-speaker jump cut needs a human listening face, laugh, or visual breath over it.",
            "defaultRange": "2-5s visual cover around the cut",
            "reviewQuestion": "Is the reaction real and useful, or does it feel like stock footage of a person listening?",
        },
        {
            "key": "cadence-tighten",
            "label": "Cadence tighten",
            "useWhen": "A pause is likely technical dead air, searching, or setup friction rather than useful thought.",
            "defaultRange": "leave 0.15-0.45s of breath unless intentionally punchy",
            "reviewQuestion": "Did the cut keep the speaker sounding like themselves?",
        },
        {
            "key": "source-weave",
            "label": "Source weave",
            "useWhen": "The episode references a watched clip and the real source media has been recovered.",
            "defaultRange": "enter on setup, leave on reaction/payoff",
            "reviewQuestion": "Does this insert increase understanding or just decorate the timeline?",
        },
    ],
    "notAllowedYet": [
        "Do not create source-clip inserts from guessed media.",
        "Do not auto-apply cadence cuts without audio review.",
        "Do not use a reaction cover if the reaction contradicts the spoken moment.",
        "Do not overwrite or destructively trim source media.",
    ],
}


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-edit-intelligence")


def esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""))


def fmt_time(seconds: float) -> str:
    seconds = max(0.0, float(seconds or 0.0))
    whole = int(seconds)
    return f"{whole // 3600:02d}:{(whole % 3600) // 60:02d}:{whole % 60:02d}"


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def load_pointer(path: Path) -> dict[str, Any]:
    pointer = load_json(path)
    target_text = str(pointer.get("jsonPath") or "")
    target = Path(target_text) if target_text else None
    if target and target.exists() and target != path:
        target_payload = load_json(target)
        if target_payload:
            return {**pointer, **target_payload}
    return pointer


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def tokens(text: str) -> list[str]:
    return re.findall(r"[a-z0-9']+", text.lower())


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip())


def segment_rows(spine: dict[str, Any]) -> list[dict[str, Any]]:
    rows = [row for row in spine.get("segments") or [] if isinstance(row, dict)]
    return sorted(rows, key=lambda row: float(row.get("start") or 0.0))


def text_for(rows: list[dict[str, Any]]) -> str:
    return normalize_text(" ".join(str(row.get("text") or "") for row in rows))


def word_count(text: str) -> int:
    return len(tokens(text))


def score_window(rows: list[dict[str, Any]]) -> tuple[float, list[str], list[str]]:
    if not rows:
        return 0.0, [], []
    start = float(rows[0].get("start") or 0.0)
    end = float(rows[-1].get("end") or start)
    duration = max(0.1, end - start)
    text = text_for(rows)
    lower = text.lower()
    wc = word_count(text)
    reasons: list[str] = []
    cautions: list[str] = []
    score = 0.0

    if 25 <= duration <= 75:
        score += 2.0
        reasons.append("duration fits a standard 9:16 short window")
    elif 75 < duration <= 110:
        score += 0.8
        cautions.append("long for a short; may need tighter excerpting")
    else:
        cautions.append("duration is outside the strongest short window")

    if 55 <= wc <= 185:
        score += 1.3
        reasons.append("word count is dense enough without becoming a full essay")
    elif wc < 35:
        cautions.append("may be too thin without surrounding context")
    else:
        cautions.append("may need trimming for platform pacing")

    hook_hits = [phrase for phrase in HOOK_PHRASES if phrase in lower[:260]]
    payoff_hits = [phrase for phrase in PAYOFF_PHRASES if phrase in lower]
    if hook_hits:
        score += min(3.0, 1.2 + len(hook_hits) * 0.7)
        reasons.append(f"hook language near start: {', '.join(hook_hits[:3])}")
    if payoff_hits:
        score += min(2.2, 0.8 + len(payoff_hits) * 0.45)
        reasons.append(f"contains explanatory/payoff language: {', '.join(payoff_hits[:3])}")

    reaction_hits = sorted(set(tokens(lower)) & REACTION_WORDS)
    if reaction_hits:
        score += min(1.1, len(reaction_hits) * 0.25)
        reasons.append(f"natural conversational reaction words: {', '.join(reaction_hits[:5])}")

    noise_hits = [phrase for phrase in PRODUCTION_NOISE if phrase in lower]
    if noise_hits:
        score -= min(3.0, 1.2 + len(noise_hits) * 0.6)
        cautions.append(f"production/setup noise present: {', '.join(noise_hits[:4])}")

    if "?" in text:
        score += 0.5
        reasons.append("question shape can work as a hook")

    return round(score, 2), reasons, cautions


def cue_ranges(cues: dict[str, Any]) -> list[tuple[float, float, str, str]]:
    ranges: list[tuple[float, float, str, str]] = []
    for group in cues.get("cueGroups") or []:
        if not isinstance(group, dict):
            continue
        try:
            start = float(group.get("reviewStartSeconds") or group.get("startSeconds") or 0.0)
            end = float(group.get("reviewEndSeconds") or group.get("endSeconds") or start)
        except Exception:
            continue
        ranges.append((start, end, str(group.get("cueId") or ""), str(group.get("confidence") or "")))
    return ranges


def overlaps_cue(start: float, end: float, cues: list[tuple[float, float, str, str]]) -> tuple[bool, list[str]]:
    hits: list[str] = []
    for cue_start, cue_end, cue_id, confidence in cues:
        overlap = max(0.0, min(end, cue_end) - max(start, cue_start))
        if overlap <= 0:
            continue
        shortest = max(0.1, min(end - start, cue_end - cue_start))
        if overlap / shortest >= 0.25:
            hits.append(f"{cue_id}:{confidence}" if cue_id else confidence)
    return bool(hits), hits


def build_short_candidates(segments: list[dict[str, Any]], cues: dict[str, Any], limit: int) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    clip_cues = cue_ranges(cues)
    n = len(segments)
    for i in range(n):
        start = float(segments[i].get("start") or 0.0)
        window: list[dict[str, Any]] = []
        for j in range(i, min(n, i + 48)):
            end = float(segments[j].get("end") or start)
            if end - start > 95:
                break
            window.append(segments[j])
            if end - start < 25:
                continue
            # Only score every few segment endings to avoid near-identical candidates.
            if len(window) % 4 != 0 and end - start < 55:
                continue
            score, reasons, cautions = score_window(window)
            text = text_for(window)
            lower_text = text.lower()
            cue_overlap, cue_hits = overlaps_cue(start, end, clip_cues)
            clip_management_terms = [term for term in ["clip", "video", "show some clips", "cut the middle", "cut this out", "bring up", "pull up", "filming"] if term in lower_text]
            if cue_overlap and clip_management_terms:
                score -= 2.4
                cautions.append(f"overlaps clip/source cue ({', '.join(cue_hits[:3])}); better reviewed as clip-weave context before treating as a standalone short")
            if clip_management_terms and not any(phrase in lower_text for phrase in ["lesson", "leadership", "behavior", "system", "meaning", "important"]):
                score -= 1.2
                cautions.append(f"production or clip-management language present: {', '.join(clip_management_terms[:4])}")
            if score < 3.0:
                continue
            hook_type = infer_hook_type(text)
            caption = caption_plan(text, end - start)
            cadence = cadence_profile(text, end - start)
            candidates.append({
                "id": f"ep4-short-candidate-{len(candidates) + 1:04d}",
                "type": "shorts-candidate",
                "startSeconds": round(start, 3),
                "endSeconds": round(end, 3),
                "durationSeconds": round(end - start, 3),
                "timeLabel": f"{fmt_time(start)} -> {fmt_time(end)}",
                "score": score,
                "confidence": "high" if score >= 7.0 else "medium" if score >= 5.0 else "low",
                "hookDraft": text[:180] + ("..." if len(text) > 180 else ""),
                "hookType": hook_type,
                "summary": summarize_text(text),
                "captionPlan": caption,
                "cadenceProfile": cadence,
                "platformVariants": platform_variants(end - start, hook_type),
                "pacingRisk": pacing_risk(text, end - start),
                "reasons": reasons,
                "cautions": cautions,
                "intent": "Find a self-contained social short candidate without flattening cadence.",
                "tradeoff": "Transcript-only scoring can find promising moments, but visual/audio review is still required before export.",
                "cutTechnique": "shorts-hook-payoff",
                "reviewChecklist": [
                    "Confirm the first 3 seconds create curiosity without requiring missing context.",
                    "Check that captions can start on a clean phrase instead of mid-thought.",
                    "If there is a single-speaker jump, cover it with a real reaction, reframing move, or intentional hard-cut style.",
                    f"Leave at least about {cadence['recommendedMinimumBreathSeconds']:.2f}s of breath unless the cut is intentionally punchy.",
                    cadence["reviewQuestion"],
                ],
                "suggestedReviewAction": "Open this range in Studio, check facial reactions and audio cadence, then refine into a 9:16 recipe if it holds up.",
                "metadata": base_metadata("Codex", "transcript-window-score"),
            })
    return dedupe_ranges(sorted(candidates, key=lambda row: (-float(row.get("score") or 0), float(row.get("startSeconds") or 0))), limit)


def summarize_text(text: str) -> str:
    words = text.split()
    if len(words) <= 26:
        return text
    return " ".join(words[:26]) + "..."


def infer_hook_type(text: str) -> str:
    lower = text.lower()
    if "?" in text or lower.startswith(("what if", "why", "how", "do you", "can you")):
        return "question-hook"
    if any(phrase in lower[:240] for phrase in ["i realized", "it turns out", "the thing", "the problem"]):
        return "realization-hook"
    if any(phrase in lower[:240] for phrase in ["you have to", "you can", "people", "we need"]):
        return "teaching-hook"
    if any(word in lower[:240] for word in ["laugh", "wow", "oh", "yeah"]):
        return "reaction-hook"
    return "context-hook"


def caption_plan(text: str, duration: float) -> dict[str, Any]:
    words = tokens(text)
    words_per_second = len(words) / max(1.0, duration)
    if words_per_second > 3.0:
        density = "dense"
        guidance = "Use shorter caption chunks and consider trimming setup words before export."
    elif words_per_second < 1.0:
        density = "sparse"
        guidance = "Caption pacing may feel slow; confirm the pause is emotionally useful before keeping it."
    else:
        density = "comfortable"
        guidance = "Caption density should be readable if split on phrase boundaries."
    return {
        "density": density,
        "estimatedWords": len(words),
        "estimatedWordsPerSecond": round(words_per_second, 2),
        "firstCaptionDraft": " ".join(text.split()[:14]),
        "guidance": guidance,
        "needsManualCaptionReview": True,
    }


def cadence_profile(text: str, duration: float, preserve_hits: list[str] | None = None) -> dict[str, Any]:
    lower = text.lower()
    preserve_hits = preserve_hits or [word for word in CADENCE_KEEP_WORDS if word in lower]
    reaction_hits = sorted(set(tokens(lower)) & REACTION_WORDS)
    reflective_markers = [
        phrase for phrase in ["i think", "i feel", "i realized", "important", "meaning", "listen", "attention"]
        if phrase in lower
    ]
    technical_markers = [phrase for phrase in PRODUCTION_NOISE if phrase in lower]

    if technical_markers and not reflective_markers:
        classification = "technical-pause-risk"
        no_cut_rationale = "May be safe to tighten, but only after confirming the audio does not carry a useful reaction or setup."
        minimum_breath = 0.15
        review_question = "Can we remove setup friction while keeping the sentence and reaction natural?"
    elif preserve_hits or reflective_markers or "?" in text:
        classification = "protect-human-beat"
        no_cut_rationale = "Likely contains thought, setup, reflection, or listener processing; do not flatten it just to make the edit faster."
        minimum_breath = 0.45
        review_question = "Does the pause help the idea land or show the speaker thinking?"
    elif reaction_hits:
        classification = "protect-reaction"
        no_cut_rationale = "Reaction words are present; verify the face/audio before removing the beat."
        minimum_breath = 0.35
        review_question = "Is the reaction doing emotional work, or is it only filler?"
    elif duration > 75:
        classification = "long-short-trim-carefully"
        no_cut_rationale = "The range is long enough to trim, but trimming should preserve setup, turn, and payoff."
        minimum_breath = 0.25
        review_question = "Can we trim a self-contained excerpt instead of compressing every pause?"
    else:
        classification = "normal-review"
        no_cut_rationale = "No strong protection signal found, but transcript-only analysis cannot judge breath, expression, or comic timing."
        minimum_breath = 0.25
        review_question = "Does tightening improve clarity without changing the speaker's cadence?"

    return {
        "classification": classification,
        "preserveSignals": sorted(set(preserve_hits + reflective_markers + reaction_hits)),
        "technicalSignals": technical_markers[:5],
        "recommendedMinimumBreathSeconds": minimum_breath,
        "noCutRationale": no_cut_rationale,
        "reviewQuestion": review_question,
        "requiresAudioReview": True,
        "requiresVisualReview": bool(reaction_hits),
    }


def platform_variants(duration: float, hook_type: str) -> list[dict[str, Any]]:
    variants = [
        ("YouTube Shorts", "9:16", 60, "large phrase captions with a strong first line"),
        ("Instagram Reels", "9:16", 75, "high-contrast captions; visual hook matters quickly"),
        ("Facebook Reels", "9:16", 90, "clear captions for sound-off viewing"),
        ("LinkedIn", "9:16 or 1:1 crop", 90, "calmer captions; emphasize lesson or leadership point"),
    ]
    rows: list[dict[str, Any]] = []
    for platform, shape, max_seconds, caption_style in variants:
        fit = "strong" if duration <= max_seconds else "needs-trim"
        rows.append({
            "platform": platform,
            "targetShape": shape,
            "maxComfortSeconds": max_seconds,
            "captionStyle": caption_style,
            "fit": fit,
            "variantNote": (
                f"{hook_type} fits the platform duration envelope."
                if fit == "strong"
                else f"{hook_type} can work here, but trim before export."
            ),
        })
    return rows


def pacing_risk(text: str, duration: float) -> str:
    wc = word_count(text)
    if duration > 75 and wc > 190:
        return "long-and-dense"
    if duration > 75:
        return "long-but-possibly-breathable"
    if wc / max(1.0, duration) > 3.2:
        return "fast-caption-density"
    if duration < 30:
        return "short-context-risk"
    return "normal-review-needed"


def ranges_overlap(a: dict[str, Any], b: dict[str, Any], threshold: float = 0.45) -> bool:
    a_start = float(a.get("startSeconds") or 0.0)
    a_end = float(a.get("endSeconds") or a_start)
    b_start = float(b.get("startSeconds") or 0.0)
    b_end = float(b.get("endSeconds") or b_start)
    overlap = max(0.0, min(a_end, b_end) - max(a_start, b_start))
    shortest = max(0.1, min(a_end - a_start, b_end - b_start))
    return overlap / shortest >= threshold


def dedupe_ranges(candidates: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    chosen: list[dict[str, Any]] = []
    for candidate in candidates:
        if any(ranges_overlap(candidate, existing) for existing in chosen):
            continue
        chosen.append(candidate)
        if len(chosen) >= limit:
            break
    for index, candidate in enumerate(chosen, start=1):
        candidate["rank"] = index
        candidate["id"] = f"ep4-short-candidate-{index:03d}"
    return chosen


def build_cadence_candidates(segments: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for previous, current in zip(segments, segments[1:]):
        prev_end = float(previous.get("end") or 0.0)
        cur_start = float(current.get("start") or prev_end)
        gap = cur_start - prev_end
        if gap < 1.8:
            continue
        before = str(previous.get("text") or "")
        after = str(current.get("text") or "")
        combined = f"{before} {after}".lower()
        preserve_hits = [word for word in CADENCE_KEEP_WORDS if word in combined]
        if gap >= 4.5 and not preserve_hits:
            action = "consider-soft-tighten"
            confidence = "medium"
            explanation = "Long transcript gap without obvious reflective language; may be dead air or technical pause."
        elif gap >= 3.0:
            action = "listen-before-tighten"
            confidence = "low"
            explanation = "Pause is noticeable, but language near it may be reflective or conversational."
        else:
            action = "likely-keep-breath"
            confidence = "low"
            explanation = "Small pause; likely part of human cadence unless the audio proves otherwise."
        cadence = cadence_profile(f"{before} {after}", gap, preserve_hits)
        rows.append({
            "id": f"ep4-cadence-{len(rows) + 1:03d}",
            "type": "cadence-gap-candidate",
            "startSeconds": round(prev_end, 3),
            "endSeconds": round(cur_start, 3),
            "durationSeconds": round(gap, 3),
            "timeLabel": f"{fmt_time(prev_end)} -> {fmt_time(cur_start)}",
            "confidence": confidence,
            "intent": "Respect human pacing while identifying possible dead-air tighten points.",
            "suggestedAction": action,
            "explanation": explanation,
            "tradeoff": "Removing too much silence can make the conversation feel robotic; use audio review before applying.",
            "cadenceProfile": cadence,
            "noCutRationale": cadence["noCutRationale"],
            "cutTechnique": "cadence-tighten",
            "reviewChecklist": [
                "Listen before applying; transcript gaps can be reflective silence, laughter, or file-boundary artifacts.",
                f"If tightening, preserve at least about {cadence['recommendedMinimumBreathSeconds']:.2f}s of breath unless the moment is intentionally punchy.",
                cadence["reviewQuestion"],
                "Reject the tighten if it changes the emotional meaning or makes the speaker sound rushed.",
            ],
            "contextBefore": before,
            "contextAfter": after,
            "preserveSignals": preserve_hits,
            "metadata": base_metadata("Codex", "transcript-gap-analysis"),
        })
    return sorted(rows, key=lambda row: -float(row.get("durationSeconds") or 0))[:limit]


def build_clip_weave_workorders(cues: dict[str, Any], limit: int) -> list[dict[str, Any]]:
    groups = [row for row in cues.get("cueGroups") or [] if isinstance(row, dict)]
    orders: list[dict[str, Any]] = []
    for index, group in enumerate(groups[:limit], start=1):
        hits = group.get("hits") if isinstance(group.get("hits"), list) else []
        example = str((hits[0] if hits else {}).get("text") or "")
        confidence = group.get("confidence") or "unknown"
        orders.append({
            "id": f"ep4-clip-weave-{index:03d}",
            "type": "clip-weave-anchor",
            "cueId": group.get("cueId"),
            "startSeconds": group.get("reviewStartSeconds"),
            "endSeconds": group.get("reviewEndSeconds"),
            "timeLabel": group.get("reviewWindowLabel"),
            "confidence": confidence,
            "intent": "Locate and weave the watched/source clip without pretending nearby media is confirmed.",
            "explanation": f"Transcript language suggests a source clip moment: {example}",
            "tradeoff": "Clip insertion should support the conversation, not interrupt cadence; use J/L audio lead-ins once the media is confirmed.",
            "suggestedAction": "Review this window, identify the watched clip, drop it into Episode 4 Watched Clips/Source Clips with this cue id, then create a metadata-only clip-weave branch.",
            "jCutHint": "Let podcast audio lead the clip by 0.25-0.75s if the clip visually answers a spoken setup.",
            "lCutHint": "Let reaction audio continue 0.5-1.5s after returning from clip if the reaction is human and useful.",
            "cutTechnique": "source-weave-j-cut-l-cut",
            "reviewChecklist": [
                "Confirm the real watched/source clip before creating the insert.",
                "Enter the clip on a setup, question, or named reference rather than in the middle of a thought.",
                "Use a J-cut only if the incoming clip audio supports the spoken setup.",
                "Use an L-cut only if the host reaction remains useful after the visual return.",
            ],
            "sourceTruthBoundary": "No media is confirmed by this work order; drop-folder or human confirmation is required.",
            "metadata": base_metadata("Codex", "transcript-cue-workorder"),
        })
    return orders


def build_reaction_cover_candidates(cues: dict[str, Any], segments: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    cue_times = [float(group.get("startSeconds") or 0.0) for group in cues.get("cueGroups") or [] if isinstance(group, dict)]
    rows: list[dict[str, Any]] = []
    for segment in segments:
        text = str(segment.get("text") or "")
        lower_tokens = set(tokens(text))
        reaction_hits = sorted(lower_tokens & REACTION_WORDS)
        if not reaction_hits:
            continue
        start = float(segment.get("start") or 0.0)
        near_cue = min([abs(start - t) for t in cue_times], default=9999) <= 90
        if not near_cue and len(reaction_hits) < 2:
            continue
        rows.append({
            "id": f"ep4-reaction-cover-{len(rows) + 1:03d}",
            "type": "reaction-cover-candidate",
            "startSeconds": max(0.0, round(start - 2.0, 3)),
            "endSeconds": round(float(segment.get("end") or start) + 3.0, 3),
            "timeLabel": f"{fmt_time(max(0.0, start - 2.0))} -> {fmt_time(float(segment.get('end') or start) + 3.0)}",
            "confidence": "medium" if near_cue else "low",
            "intent": "Use a human reaction or listening face to cover a visual jump, clip insert, or awkward single-speaker cut.",
            "explanation": f"Reaction words detected: {', '.join(reaction_hits[:5])}. {'Near a clip cue.' if near_cue else 'Not near a strong clip cue.'}",
            "tradeoff": "A reaction cover can hide an edit, but overusing it can feel fake or distract from the speaker.",
            "cutTechnique": "reaction-cover",
            "reviewChecklist": [
                "Confirm the reaction visually matches the spoken moment.",
                "Prefer real listening, laughter, surprise, or agreement over generic face coverage.",
                "Reject the cover if it feels like hiding damage rather than clarifying the conversation.",
            ],
            "context": text,
            "metadata": base_metadata("Codex", "reaction-token-scan"),
        })
    return rows[:limit]


def base_metadata(actor: str, method: str) -> dict[str, Any]:
    return {
        "createdAt": iso_now(),
        "createdBy": actor,
        "method": method,
        "status": "proposal-not-applied",
        "revisionHistory": [],
        "humanNotes": [],
        "agentNotes": ["Generated from Episode 4 transcript draft. Review audio/video before applying."],
    }


def build(args: argparse.Namespace) -> dict[str, Any]:
    spine = load_pointer(Path(args.spine_pointer))
    cues = load_pointer(Path(args.cue_pointer))
    segments = segment_rows(spine)
    short_candidates = build_short_candidates(segments, cues, args.short_limit)
    cadence_candidates = build_cadence_candidates(segments, args.cadence_limit)
    clip_weave = build_clip_weave_workorders(cues, args.clip_limit)
    reactions = build_reaction_cover_candidates(cues, segments, args.reaction_limit)
    out_dir = OUT_ROOT / stamp()
    out_dir.mkdir(parents=True, exist_ok=True)
    counts = {
        "transcriptSegments": len(segments),
        "shortCandidates": len(short_candidates),
        "cadenceCandidates": len(cadence_candidates),
        "clipWeaveWorkorders": len(clip_weave),
        "reactionCoverCandidates": len(reactions),
        "cueGroups": (cues.get("counts") or {}).get("cueGroups", len(cues.get("cueGroups") or [])) if isinstance(cues.get("counts"), dict) else len(cues.get("cueGroups") or []),
    }
    payload = {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": "episode4-edit-intelligence-ready" if segments else "episode4-edit-intelligence-empty",
        "episode": 4,
        "episodeLabel": "Episode 4",
        "inputs": {
            "transcriptSpinePointer": str(args.spine_pointer),
            "transcriptSpineJson": spine.get("jsonPath") or "",
            "cuePointer": str(args.cue_pointer),
            "cueJson": cues.get("jsonPath") or "",
        },
        "counts": counts,
        "cutStyleGuide": CUT_STYLE_GUIDE,
        "clipWeaveWorkorders": clip_weave,
        "shortCandidates": short_candidates,
        "cadenceCandidates": cadence_candidates,
        "reactionCoverCandidates": reactions,
        "nextSafestAction": "Review clip-weave anchors first, then test top shorts candidates in the visual editor before writing timeline decisions.",
        "truth": {
            "proposalsOnly": True,
            "timelineDecisionsWritten": False,
            "shortsCreated": False,
            "clipsImported": False,
            "transcriptImported": False,
            "sourceFilesMutated": False,
            "exportsRendered": False,
            "externalPublishing": False,
            "readyForAutomatedApply": False,
        },
    }
    json_path = out_dir / "episode4-edit-intelligence.json"
    markdown_path = out_dir / "episode4-edit-intelligence.md"
    html_path = out_dir / "index.html"
    payload.update({"jsonPath": str(json_path), "markdownPath": str(markdown_path), "htmlPath": str(html_path)})
    write_json(json_path, payload)
    markdown_path.write_text(render_markdown(payload), encoding="utf-8")
    html_path.write_text(render_html(payload), encoding="utf-8")
    write_json(LATEST_POINTER, {
        "schema": "quipsly.episode4-edit-intelligence-pointer.v1",
        "generatedAt": iso_now(),
        "status": payload["status"],
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "htmlPath": str(html_path),
        "counts": counts,
        "truth": payload["truth"],
    })
    return payload


def render_markdown(payload: dict[str, Any]) -> str:
    counts = payload.get("counts") if isinstance(payload.get("counts"), dict) else {}
    lines = [
        "# Episode 4 edit intelligence",
        "",
        f"Generated: `{payload.get('generatedAt')}`",
        f"Status: `{payload.get('status')}`",
        "",
        f"Next: {payload.get('nextSafestAction')}",
        "",
        "## Counts",
        "",
    ]
    for key in ["transcriptSegments", "clipWeaveWorkorders", "shortCandidates", "cadenceCandidates", "reactionCoverCandidates"]:
        lines.append(f"- {key}: `{counts.get(key)}`")
    lines.extend(["", "## Human-feeling cut style guide", ""])
    guide = payload.get("cutStyleGuide") if isinstance(payload.get("cutStyleGuide"), dict) else {}
    for principle in guide.get("principles") or []:
        if not isinstance(principle, dict):
            continue
        lines.append(f"### {principle.get('label')}")
        lines.append(f"- Rule: {principle.get('rule')}")
        lines.append(f"- Risk if ignored: {principle.get('riskIfIgnored')}")
        lines.append("")
    lines.extend(["### Techniques", ""])
    for technique in guide.get("techniques") or []:
        if not isinstance(technique, dict):
            continue
        lines.append(f"- **{technique.get('label')}**: {technique.get('useWhen')} Default: `{technique.get('defaultRange')}` Review: {technique.get('reviewQuestion')}")
    lines.extend(["", "### Not allowed yet", ""])
    for rule in guide.get("notAllowedYet") or []:
        lines.append(f"- {rule}")
    lines.extend(["", "## Clip-weave anchors", ""])
    for order in payload.get("clipWeaveWorkorders") or []:
        lines.append(f"### {order.get('id')} · {order.get('confidence')} · {order.get('timeLabel')}")
        lines.append(f"- Intent: {order.get('intent')}")
        lines.append(f"- Why: {order.get('explanation')}")
        lines.append(f"- Tradeoff: {order.get('tradeoff')}")
        lines.append(f"- Technique: `{order.get('cutTechnique')}`")
        if order.get("reviewChecklist"):
            lines.append(f"- Review checklist: {'; '.join(order.get('reviewChecklist') or [])}")
        lines.append(f"- Action: {order.get('suggestedAction')}")
        lines.append("")
    lines.extend(["## Top shorts candidates", ""])
    for short in payload.get("shortCandidates") or []:
        lines.append(f"### #{short.get('rank')} · {short.get('confidence')} · {short.get('timeLabel')} · score {short.get('score')}")
        lines.append(f"- Summary: {short.get('summary')}")
        lines.append(f"- Hook draft: {short.get('hookDraft')}")
        lines.append(f"- Hook type: `{short.get('hookType')}`")
        caption = short.get("captionPlan") if isinstance(short.get("captionPlan"), dict) else {}
        if caption:
            lines.append(f"- Captions: `{caption.get('density')}` · {caption.get('estimatedWords')} words · {caption.get('estimatedWordsPerSecond')} w/s · first draft: {caption.get('firstCaptionDraft')}")
            lines.append(f"- Caption guidance: {caption.get('guidance')}")
        if short.get("platformVariants"):
            platform_summary = "; ".join(
                f"{variant.get('platform')}: {variant.get('fit')}"
                for variant in short.get("platformVariants") or []
                if isinstance(variant, dict)
            )
        lines.append(f"- Platform variants: {platform_summary}")
        lines.append(f"- Pacing risk: `{short.get('pacingRisk')}`")
        cadence = short.get("cadenceProfile") if isinstance(short.get("cadenceProfile"), dict) else {}
        if cadence:
            lines.append(f"- Cadence: `{cadence.get('classification')}` · minimum breath `{cadence.get('recommendedMinimumBreathSeconds')}`s · {cadence.get('noCutRationale')}")
            lines.append(f"- Cadence review: {cadence.get('reviewQuestion')}")
        lines.append(f"- Reasons: {'; '.join(short.get('reasons') or [])}")
        lines.append(f"- Technique: `{short.get('cutTechnique')}`")
        if short.get("reviewChecklist"):
            lines.append(f"- Review checklist: {'; '.join(short.get('reviewChecklist') or [])}")
        if short.get("cautions"):
            lines.append(f"- Cautions: {'; '.join(short.get('cautions') or [])}")
        lines.append("")
    lines.extend(["## Cadence candidates", ""])
    for item in (payload.get("cadenceCandidates") or [])[:10]:
        cadence = item.get("cadenceProfile") if isinstance(item.get("cadenceProfile"), dict) else {}
        cadence_label = f" · `{cadence.get('classification')}` · {cadence.get('noCutRationale')}" if cadence else ""
        lines.append(f"- `{item.get('timeLabel')}` {item.get('durationSeconds')}s · {item.get('suggestedAction')} · {item.get('explanation')}{cadence_label}")
    lines.extend(["", "## Truth boundary", ""])
    truth = payload.get("truth") if isinstance(payload.get("truth"), dict) else {}
    for key in ["proposalsOnly", "timelineDecisionsWritten", "shortsCreated", "clipsImported", "transcriptImported", "sourceFilesMutated", "exportsRendered", "externalPublishing"]:
        lines.append(f"- {key}: `{truth.get(key)}`")
    return "\n".join(lines).rstrip() + "\n"


def render_html(payload: dict[str, Any]) -> str:
    counts = payload.get("counts") if isinstance(payload.get("counts"), dict) else {}
    clip_cards = "".join(render_card(order, "clip") for order in payload.get("clipWeaveWorkorders") or [])
    short_cards = "".join(render_card(short, "short") for short in payload.get("shortCandidates") or [])
    style_panel = render_style_guide_html(payload.get("cutStyleGuide") if isinstance(payload.get("cutStyleGuide"), dict) else {})
    cadence_rows = "".join(render_cadence_row(item) for item in (payload.get("cadenceCandidates") or [])[:24] if isinstance(item, dict))
    return f"""<!doctype html><html><head><meta charset=\"utf-8\"><title>Episode 4 edit intelligence</title>
<style>
:root {{ color-scheme:dark; --bg:#0e1711; --panel:#18271d; --ink:#fff0d4; --muted:#c8b997; --line:#35533c; --leaf:#79dc85; --gold:#f2c64f; --water:#6ecbd3; --clay:#db8159; }}
body {{ margin:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:radial-gradient(circle at top left,rgba(121,220,133,.16),transparent 30%),linear-gradient(135deg,#0b130f,#251b11 72%); color:var(--ink); }}
main {{ max-width:1240px; margin:0 auto; padding:36px 24px 80px; }}
header,.panel,.card {{ border:1px solid var(--line); border-radius:28px; background:rgba(24,39,29,.92); padding:22px; margin:18px 0; box-shadow:0 18px 48px rgba(0,0,0,.3); }}
h1 {{ font-size:clamp(40px,6vw,78px); line-height:.92; margin:.08em 0 .25em; }}
.eyebrow {{ color:var(--gold); text-transform:uppercase; letter-spacing:.17em; font-size:12px; font-weight:900; }}
.counts,.cardtop {{ display:flex; flex-wrap:wrap; gap:10px; align-items:center; }}
.pill {{ border:1px solid var(--line); border-radius:999px; padding:8px 12px; background:rgba(0,0,0,.22); font-size:12px; font-weight:800; }}
.grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(330px,1fr)); gap:16px; }}
.card.clip {{ border-color:rgba(242,198,79,.65); }} .card.short {{ border-color:rgba(110,203,211,.58); }}
.action {{ color:var(--leaf); }} .muted {{ color:var(--muted); }} code {{ color:var(--leaf); }}
table {{ width:100%; border-collapse:collapse; font-size:13px; }} td,th {{ vertical-align:top; text-align:left; padding:8px; border-bottom:1px solid rgba(255,255,255,.08); }}
</style></head><body><main>
<header><p class=\"eyebrow\">Quipsly Studio · transcript-aware editing</p><h1>{esc(payload.get('status'))}</h1><p>{esc(payload.get('nextSafestAction'))}</p><div class=\"counts\"><span class=\"pill\">segments {esc(counts.get('transcriptSegments'))}</span><span class=\"pill\">clip anchors {esc(counts.get('clipWeaveWorkorders'))}</span><span class=\"pill\">shorts {esc(counts.get('shortCandidates'))}</span><span class=\"pill\">cadence {esc(counts.get('cadenceCandidates'))}</span><span class=\"pill\">reaction covers {esc(counts.get('reactionCoverCandidates'))}</span></div></header>
{style_panel}
<section class=\"panel\"><p class=\"eyebrow\">Clip-weave anchors</p><div class=\"grid\">{clip_cards}</div></section>
<section class=\"panel\"><p class=\"eyebrow\">Shorts candidates</p><div class=\"grid\">{short_cards}</div></section>
<section class=\"panel\"><p class=\"eyebrow\">Cadence and silence review</p><table><thead><tr><th>Time</th><th>Gap</th><th>Suggestion</th><th>Why</th><th>Cadence guardrail</th></tr></thead><tbody>{cadence_rows}</tbody></table></section>
</main></body></html>"""


def render_cadence_row(item: dict[str, Any]) -> str:
    cadence = item.get("cadenceProfile") if isinstance(item.get("cadenceProfile"), dict) else {}
    guardrail = ""
    if cadence:
        guardrail = (
            f"<strong>{esc(cadence.get('classification'))}</strong><br>"
            f"{esc(cadence.get('noCutRationale'))}<br>"
            f"<span class='muted'>Ask: {esc(cadence.get('reviewQuestion'))}</span>"
        )
    else:
        guardrail = esc(item.get("tradeoff"))
    return (
        f"<tr><td><code>{esc(item.get('timeLabel'))}</code></td>"
        f"<td>{esc(item.get('durationSeconds'))}s</td>"
        f"<td>{esc(item.get('suggestedAction'))}</td>"
        f"<td>{esc(item.get('explanation'))}</td>"
        f"<td>{guardrail}</td></tr>"
    )


def render_style_guide_html(guide: dict[str, Any]) -> str:
    principles = "".join(
        f"<article class='card'><span class='pill'>{esc(item.get('key'))}</span><h2>{esc(item.get('label'))}</h2><p>{esc(item.get('rule'))}</p><p class='muted'>Risk: {esc(item.get('riskIfIgnored'))}</p></article>"
        for item in guide.get("principles") or []
        if isinstance(item, dict)
    )
    techniques = "".join(
        f"<tr><td>{esc(item.get('label'))}</td><td>{esc(item.get('useWhen'))}</td><td>{esc(item.get('defaultRange'))}</td><td>{esc(item.get('reviewQuestion'))}</td></tr>"
        for item in guide.get("techniques") or []
        if isinstance(item, dict)
    )
    not_allowed = "".join(f"<li>{esc(rule)}</li>" for rule in guide.get("notAllowedYet") or [])
    return f"""<section class=\"panel\"><p class=\"eyebrow\">Human-feeling cut style guide</p><div class=\"grid\">{principles}</div><h2>Technique defaults</h2><table><thead><tr><th>Move</th><th>Use when</th><th>Default</th><th>Review question</th></tr></thead><tbody>{techniques}</tbody></table><h2>Not allowed yet</h2><ul>{not_allowed}</ul></section>"""


def render_card(item: dict[str, Any], kind: str) -> str:
    if kind == "clip":
        title = f"{item.get('id')} · {item.get('timeLabel')}"
        checklist = "; ".join(item.get("reviewChecklist") or [])
        body = f"<p>{esc(item.get('explanation'))}</p><p class='action'>{esc(item.get('suggestedAction'))}</p><p class='muted'>{esc(item.get('tradeoff'))}</p><p>{esc(checklist)}</p>"
        meta = f"<span class='pill'>{esc(item.get('confidence'))}</span><span class='pill'>{esc(item.get('cueId'))}</span><span class='pill'>{esc(item.get('cutTechnique'))}</span>"
    else:
        title = f"#{esc(item.get('rank'))} · {esc(item.get('timeLabel'))}"
        reasons = "; ".join(item.get("reasons") or [])
        cautions = "; ".join(item.get("cautions") or [])
        checklist = "; ".join(item.get("reviewChecklist") or [])
        caption = item.get("captionPlan") if isinstance(item.get("captionPlan"), dict) else {}
        cadence = item.get("cadenceProfile") if isinstance(item.get("cadenceProfile"), dict) else {}
        platform_summary = "; ".join(
            f"{variant.get('platform')}: {variant.get('fit')}"
            for variant in item.get("platformVariants") or []
            if isinstance(variant, dict)
        )
        body = (
            f"<p>{esc(item.get('summary'))}</p>"
            f"<p><strong>Hook:</strong> {esc(item.get('hookType'))} · {esc(item.get('hookDraft'))}</p>"
            f"<p><strong>Captions:</strong> {esc(caption.get('density'))} · {esc(caption.get('estimatedWords'))} words · {esc(caption.get('estimatedWordsPerSecond'))} w/s. {esc(caption.get('guidance'))}</p>"
            f"<p><strong>First caption:</strong> {esc(caption.get('firstCaptionDraft'))}</p>"
            f"<p><strong>Platforms:</strong> {esc(platform_summary)}</p>"
            f"<p><strong>Cadence:</strong> {esc(cadence.get('classification'))} · leave about {esc(cadence.get('recommendedMinimumBreathSeconds'))}s breath. {esc(cadence.get('noCutRationale'))}</p>"
            f"<p class='action'>{esc(reasons)}</p><p class='muted'>{esc(cautions)}</p><p>{esc(checklist)}</p>"
        )
        meta = f"<span class='pill'>{esc(item.get('confidence'))}</span><span class='pill'>score {esc(item.get('score'))}</span><span class='pill'>{esc(item.get('durationSeconds'))}s</span><span class='pill'>{esc(item.get('cutTechnique'))}</span><span class='pill'>{esc(item.get('pacingRisk'))}</span>"
    return f"<article class='card {kind}'><div class='cardtop'>{meta}</div><h2>{title}</h2>{body}</article>"


def main() -> int:
    parser = argparse.ArgumentParser(description="Build Episode 4 transcript-aware edit intelligence board.")
    parser.add_argument("--spine-pointer", default=str(SPINE_POINTER))
    parser.add_argument("--cue-pointer", default=str(CUE_POINTER))
    parser.add_argument("--short-limit", type=int, default=12)
    parser.add_argument("--cadence-limit", type=int, default=18)
    parser.add_argument("--clip-limit", type=int, default=12)
    parser.add_argument("--reaction-limit", type=int, default=12)
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--markdown", action="store_true")
    args = parser.parse_args()
    payload = build(args)
    if args.json:
        print(json.dumps(payload, indent=2, sort_keys=True))
    elif args.markdown:
        print(render_markdown(payload), end="")
    else:
        counts = payload.get("counts") or {}
        print(f"Episode 4 edit intelligence: {payload.get('status')}")
        print(f"  Board: {payload.get('htmlPath')}")
        print(f"  JSON: {payload.get('jsonPath')}")
        print(f"  Clip anchors: {counts.get('clipWeaveWorkorders')} shorts={counts.get('shortCandidates')} cadence={counts.get('cadenceCandidates')} reactions={counts.get('reactionCoverCandidates')}")
        print(f"  Next: {payload.get('nextSafestAction')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
