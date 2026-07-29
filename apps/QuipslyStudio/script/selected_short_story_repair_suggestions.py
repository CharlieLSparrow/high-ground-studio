#!/usr/bin/env python3
"""Suggest metadata-only hook-turn-payoff repairs for the selected short.

This is a read-only review helper. It does not apply hook/caption/overlay text,
approve a short, export media, publish, or mutate source files. Its job is to
turn "story contract weak" into concrete, inspectable options a human or agent
can proof-watch and then choose to apply through existing metadata commands.
"""

from __future__ import annotations

import argparse
import html
import json
import os
import re
import urllib.request
from pathlib import Path
from typing import Any

from short_story_contract_common import build_short_story_contract


DEFAULT_BASE_URL = os.environ.get("QUIPSLY_STUDIO_AGENT_URL", "http://127.0.0.1:8765")


def dict_value(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def list_value(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def text_value(value: Any, fallback: str = "") -> str:
    text = str(value or "").strip()
    return text if text else fallback


def fetch_json(base_url: str, path: str) -> dict[str, Any]:
    url = base_url.rstrip("/") + path
    try:
        with urllib.request.urlopen(url, timeout=5) as response:
            payload = json.loads(response.read().decode("utf-8", errors="replace"))
        return payload if isinstance(payload, dict) else {"value": payload}
    except Exception as exc:  # noqa: BLE001 - operator-facing diagnostic.
        return {
            "status": "request_failed",
            "url": url,
            "error": str(exc),
            "truth": "Read-only request failed before any metadata, export, publish, approval, or source-media mutation.",
        }


def safe_float(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def shell_quote(text: str) -> str:
    return "'" + text.replace("'", "'\"'\"'") + "'"


def is_generic_candidate_title(title: str) -> bool:
    lowered = title.lower()
    generic_bits = [
        "review candidate",
        "episode ",
        "candidate ",
        "short ",
    ]
    return any(bit in lowered for bit in generic_bits) and bool(re.search(r"\d", lowered))


def clean_topic(title: str) -> str:
    title = re.sub(r"\s*-\s*\d{1,2}:\d{2}.*$", "", title).strip()
    title = re.sub(r"episode\s+\d+\s+review\s+candidate\s+\d+", "", title, flags=re.I).strip(" -")
    return title or "this moment"


def first_dict(*values: Any) -> dict[str, Any]:
    for value in values:
        item = dict_value(value)
        if item:
            return item
    return {}


def selected_from_quality(quality: dict[str, Any]) -> dict[str, Any]:
    selected = dict_value(quality.get("selectedShort")) or dict_value(quality.get("short"))
    if selected:
        return selected
    if quality.get("selectedShortId"):
        return {
            "id": quality.get("selectedShortId", ""),
            "title": quality.get("title", ""),
            "duration": quality.get("recipeDuration") or quality.get("duration", 0),
            "sequenceStart": quality.get("sequenceStart", 0),
            "sequenceEnd": quality.get("sequenceEnd", 0),
            "reviewStatus": quality.get("reviewStatus", ""),
            "exportStatus": quality.get("exportStatus", ""),
            "hookText": quality.get("hook", ""),
            "captionDraft": quality.get("captionDraft", ""),
            "primaryOverlayText": quality.get("primaryOverlayText", ""),
        }
    return {}


def selected_time_range(selected: dict[str, Any], quality: dict[str, Any]) -> tuple[float | None, float | None]:
    ranges = [
        dict_value(selected.get("episodeTimelineRange")),
        dict_value(selected.get("episodeSourceRange")),
        dict_value(quality.get("episodeTimelineRange")),
        dict_value(quality.get("episodeSourceRange")),
    ]
    start = None
    end = None
    for key in ["sequenceStart", "startTime", "start"]:
        start = safe_float(selected.get(key))
        if start is not None:
            break
    for key in ["sequenceEnd", "endTime", "end"]:
        end = safe_float(selected.get(key))
        if end is not None:
            break
    for range_dict in ranges:
        if start is None:
            start = safe_float(range_dict.get("start"))
        if end is None:
            end = safe_float(range_dict.get("end"))
    duration = safe_float(selected.get("duration") or selected.get("recipeDuration") or quality.get("recipeDuration") or quality.get("duration"))
    if start is not None and end is None and duration is not None:
        end = start + duration
    return start, end


def contract_from_payloads(quality: dict[str, Any], production: dict[str, Any]) -> dict[str, Any]:
    selected = selected_from_quality(quality)
    contract = first_dict(
        production.get("storyContract"),
        quality.get("shortStoryContract"),
        selected.get("shortStoryContract"),
    )
    if list_value(contract.get("checks")):
        return contract
    if selected:
        derived = build_short_story_contract(
            selected,
            {},
            cut_summary(quality, production),
            source="selected-short-story-repair-suggestions-derived",
        )
        if contract:
            derived["summarySourceLabel"] = contract.get("label", "")
        return derived
    return contract


def cut_summary(quality: dict[str, Any], production: dict[str, Any]) -> dict[str, Any]:
    selected = selected_from_quality(quality)
    return first_dict(
        production.get("cutEvidenceSummary"),
        quality.get("cutIntelligenceEvidence"),
        selected.get("cutIntelligenceEvidence"),
    )


def exposed_transcript_context(quality: dict[str, Any], production: dict[str, Any]) -> dict[str, Any]:
    selected = selected_from_quality(quality)
    for source in [
        quality.get("transcriptContext"),
        production.get("transcriptContext"),
        selected.get("transcriptContext"),
    ]:
        source_dict = dict_value(source)
        excerpt = text_value(source_dict.get("excerpt") or source_dict.get("text"))
        if excerpt:
            return {
                "excerpt": excerpt,
                "source": "agent-endpoint",
                "truth": "Transcript context was already exposed by the selected-short endpoints.",
            }
    return {}


def active_episode_token(name: str) -> str:
    match = re.search(r"(episode[-_ ]*\d+)", name, flags=re.I)
    return re.sub(r"[-_ ]+", "-", match.group(1).lower()) if match else ""


def candidate_transcript_session_paths(base_url: str) -> list[Path]:
    state = fetch_json(base_url, "/state")
    sessions = fetch_json(base_url, "/sessions")
    active_name = text_value(state.get("activeSessionName") or state.get("sessionName"))
    active_token = active_episode_token(active_name)
    paths: list[tuple[int, Path]] = []

    for item in list_value(sessions.get("sessions")):
        item_dict = dict_value(item)
        raw_path = text_value(item_dict.get("path") or item_dict.get("sessionPath"))
        if not raw_path:
            continue
        name = text_value(item_dict.get("name"), Path(raw_path).name)
        normalized_name = name.lower()
        score = 0
        if name == active_name:
            score += 20
        if active_token and active_token in normalized_name.replace("_", "-"):
            score += 40
        if "transcript" in normalized_name:
            score += 80
        if "wordtimed" in normalized_name or "word-timed" in normalized_name:
            score += 15
        if score:
            paths.append((score, Path(raw_path)))

        if name == active_name:
            for old, new in [("wordtimed", "transcript"), ("word-timed", "transcript")]:
                if old in normalized_name:
                    paths.append((95, Path(raw_path.replace(old, new))))

    seen: set[Path] = set()
    ordered: list[Path] = []
    for _score, path in sorted(paths, key=lambda item: item[0], reverse=True):
        if path in seen:
            continue
        seen.add(path)
        ordered.append(path)
    return ordered


def clean_transcript_text(text: str) -> str:
    text = html.unescape(text_value(text))
    text = re.sub(r"^>+\s*", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def normalized_words(text: str) -> list[str]:
    return re.findall(r"[a-z0-9']+", text.lower())


def trim_overlapping_prefix(existing_text: str, next_text: str) -> str:
    existing_words = normalized_words(existing_text)
    next_words = normalized_words(next_text)
    next_raw = next_text.split()
    max_overlap = min(16, len(existing_words), len(next_words), len(next_raw))
    for size in range(max_overlap, 2, -1):
        if existing_words[-size:] == next_words[:size]:
            return " ".join(next_raw[size:]).strip()
    return next_text


def extract_transcript_context_from_session(path: Path, start: float, end: float) -> dict[str, Any]:
    if not path.exists() or not path.is_file():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}

    rows: list[dict[str, Any]] = []
    for sequence in list_value(dict_value(payload.get("project")).get("sequences")):
        for segment in list_value(sequence.get("transcriptSegments")):
            segment = dict_value(segment)
            segment_start = safe_float(segment.get("startTime"))
            segment_end = safe_float(segment.get("endTime"))
            text = clean_transcript_text(segment.get("text"))
            if segment_start is None or segment_end is None or not text:
                continue
            if segment_end < start or segment_start > end:
                continue
            if segment_end - segment_start < 0.25:
                continue
            rows.append(
                {
                    "startTime": segment_start,
                    "endTime": segment_end,
                    "speaker": text_value(segment.get("speaker"), "Speaker"),
                    "text": text,
                }
            )

    if not rows:
        return {}

    rows.sort(key=lambda item: (item["startTime"], item["endTime"], len(item["text"])))
    compressed: list[dict[str, Any]] = []
    cursor = start
    merged_text = ""
    for row in rows:
        if row["endTime"] <= cursor + 0.2 and row["startTime"] < cursor:
            continue
        text = row["text"]
        if compressed and text == compressed[-1]["text"]:
            continue
        if compressed and row["startTime"] > cursor + 1.25:
            merged_text = (merged_text + " [...]").strip()
        piece = trim_overlapping_prefix(merged_text, text) if merged_text else text
        if not piece:
            cursor = max(cursor, row["endTime"])
            continue
        compressed.append({**row, "text": piece})
        merged_text = (merged_text + " " + piece).strip()
        cursor = max(cursor, row["endTime"])
        if len(merged_text) > 1600:
            break

    excerpt = merged_text
    excerpt = re.sub(r"\s+", " ", excerpt).strip()
    if len(excerpt) > 1400:
        excerpt = excerpt[:1397].rstrip(" ,.;:") + "..."

    return {
        "excerpt": excerpt,
        "source": str(path),
        "segmentCount": len(rows),
        "compressedSegmentCount": len(compressed),
        "range": {"start": start, "end": end},
        "truth": "Read-only overlap between selected short sequence time and a sibling transcript session. This does not merge sessions or mutate source media.",
    }


def transcript_context(base_url: str, quality: dict[str, Any], production: dict[str, Any]) -> dict[str, Any]:
    exposed = exposed_transcript_context(quality, production)
    if exposed:
        return exposed
    selected = selected_from_quality(quality)
    start, end = selected_time_range(selected, quality)
    if start is None or end is None or end <= start:
        return {
            "excerpt": "",
            "source": "unavailable",
            "truth": "No selected-short time range was available, so transcript overlap could not be resolved.",
        }
    for path in candidate_transcript_session_paths(base_url):
        context = extract_transcript_context_from_session(path, start, end)
        if context:
            return context
    return {
        "excerpt": "",
        "source": "unavailable",
        "range": {"start": start, "end": end},
        "truth": "No transcript segments were found for the selected short range in known sibling sessions.",
    }


def missing_checks(contract: dict[str, Any]) -> list[str]:
    return [
        text_value(check.get("id"))
        for check in list_value(contract.get("checks"))
        if isinstance(check, dict) and not check.get("ready") and text_value(check.get("id"))
    ]


def option(kind: str, text: str, why: str, field: str = "", confidence: str = "needs-proof-watch") -> dict[str, Any]:
    command = ""
    if field:
        command = f"script/agentctl.sh shorts-update-selected {field} {shell_quote(text)}"
    return {
        "kind": kind,
        "text": text,
        "why": why,
        "confidence": confidence,
        "applyCommand": command,
        "truth": "Suggestion only. Proof-watch before applying; applying changes selected-short metadata, not source media.",
    }


def concise_excerpt_seed(excerpt: str, limit: int = 120) -> str:
    excerpt = re.sub(r"\s+", " ", excerpt).strip()
    sentences = re.split(r"(?<=[.!?])\s+", excerpt)
    if sentences:
        first = sentences[0].strip()
        if 12 <= len(first) <= limit:
            return first
    if len(excerpt) <= limit:
        return excerpt
    trimmed = excerpt[:limit].rsplit(" ", 1)[0].rstrip(" ,.;:")
    return trimmed + "..."


def sentence_candidates(excerpt: str) -> list[str]:
    excerpt = re.sub(r"\s+", " ", excerpt).strip()
    parts = [part.strip(" ,") for part in re.split(r"(?<=[.!?])\s+", excerpt) if part.strip(" ,")]
    if len(parts) <= 1:
        parts = [part.strip(" ,") for part in re.split(r"\s+(?:but|because|and then|so)\s+", excerpt, flags=re.I) if part.strip(" ,")]
    cleaned: list[str] = []
    for part in parts:
        if len(part) < 8:
            continue
        if cleaned and part == cleaned[-1]:
            continue
        cleaned.append(part)
    return cleaned


def compact_sentence(text: str, limit: int = 155) -> str:
    text = re.sub(r"\s+", " ", text).strip(" ,")
    if len(text) <= limit:
        return text
    return text[:limit].rsplit(" ", 1)[0].rstrip(" ,.;:") + "..."


def transcript_story_scaffold(excerpt: str, topic: str) -> dict[str, str]:
    sentences = sentence_candidates(excerpt)
    first = compact_sentence(sentences[0] if sentences else concise_excerpt_seed(excerpt))
    last = compact_sentence(sentences[-1] if sentences else first)
    lower = excerpt.lower()

    if "creative project" in lower and "these things we do on these days" in lower:
        return {
            "label": "structure-helps-creativity",
            "hook": "What if trying harder is not the thing that makes creative work happen?",
            "turn": "The turn is from forcing effort to building a rhythm that carries the work.",
            "payoff": "The payoff is that structure can take away the exhausting decision to start over every time.",
            "caption": "Trying harder is not always the unlock. Sometimes the unlock is a rhythm that lets the work happen.",
            "overlay": "Structure can carry creativity",
        }
    if "try" in lower and "hard" in lower:
        return {
            "label": "try-hard-reframe",
            "hook": "Are we trying too hard, or are we missing the structure that makes effort easier?",
            "turn": "The turn is from effort as strain to effort as something a good system can support.",
            "payoff": last,
            "caption": "The question is not just whether we try hard. It is whether the work has a structure that helps us keep showing up.",
            "overlay": "Trying hard needs a system",
        }
    if "mentor" in lower:
        return {
            "label": "mentorship",
            "hook": "Good mentorship is not just instruction. It changes how you see the work.",
            "turn": "The turn is from being told what to do to understanding why it matters.",
            "payoff": last,
            "caption": "The best mentoring moments do more than explain the task. They make the why easier to carry.",
            "overlay": "Mentorship explains why",
        }
    if "parkinson" in lower:
        return {
            "label": "purpose",
            "hook": "A podcast can be more than a show if it gives people a reason to care.",
            "turn": "The turn is from making content to using the platform for awareness.",
            "payoff": last,
            "caption": "The goal is not just to make episodes. It is to build something useful enough to point attention toward what matters.",
            "overlay": "Use the platform for good",
        }
    if "write things worth reading" in lower or "worth writing" in lower:
        return {
            "label": "legacy",
            "hook": "If you want to leave something behind, make it worth returning to.",
            "turn": "The turn is from telling a story to choosing a legacy.",
            "payoff": "Write things worth reading, or do things worth writing.",
            "caption": "The standard is simple and brutal in the best way: write things worth reading, or do things worth writing.",
            "overlay": "Worth reading. Worth writing.",
        }

    return {
        "label": "rough-transcript",
        "hook": first,
        "turn": f"The turn appears to move from the opening thought toward: {compact_sentence(last, 110)}",
        "payoff": last,
        "caption": f"{first}\n\n{last}" if first != last else first,
        "overlay": topic if topic != "this moment" else "Name the turn",
    }


def build_options(
    selected: dict[str, Any],
    quality: dict[str, Any],
    production: dict[str, Any],
    human: dict[str, Any],
    transcript: dict[str, Any],
) -> dict[str, Any]:
    title = text_value(selected.get("title"), "Selected short")
    topic = clean_topic(title)
    generic = is_generic_candidate_title(title)
    excerpt = text_value(transcript.get("excerpt"))
    cut = cut_summary(quality, production)
    cut_next = text_value(cut.get("nextAction"))
    review_mode = dict_value(quality.get("recommendedReviewMode"))
    human_guidance = dict_value(human.get("humanReviewGuidance")) or human
    base_context = excerpt if excerpt else topic

    if excerpt:
        story = transcript_story_scaffold(excerpt, topic)
        hook_options = [
            option("hook", story["hook"], f"Grounded in transcript context; scaffold `{story['label']}`. Proof-watch before applying.", "hook", "grounded-story-inference"),
            option("hook", concise_excerpt_seed(excerpt), "Direct transcript-seed option for comparison. Use only if the spoken line itself is the best hook.", "hook", "transcript-quote"),
            option("hook", f"What changes here is not obvious until you hear the ending.", "Creates curiosity without inventing a specific claim.", "hook"),
        ]
        turn_options = [
            option("middleTurn", story["turn"], f"Grounded in transcript context; scaffold `{story['label']}`.", "", "grounded-story-inference"),
            option("middleTurn", "The thought shifts from setup to consequence.", "Use if proof-watch confirms the clip turns from context into meaning.", ""),
            option("middleTurn", "The speaker moves from explaining to realizing.", "Use only if the actual cadence supports that interpretation.", ""),
        ]
        payoff_options = [
            option("payoff", story["payoff"], f"Grounded in transcript context; scaffold `{story['label']}`.", "", "grounded-story-inference"),
            option("payoff", "End on the sentence that gives the viewer a reward.", "Editing instruction for choosing/tuning the out point.", ""),
            option("payoff", "If the ending only trails off, tighten the range or mark Refine.", "Prevents metadata polish from hiding a weak ending.", ""),
        ]
        caption_options = [
            option("caption", story["caption"], "Caption draft distilled from transcript context instead of dumping raw transcript text.", "caption", "grounded-story-inference"),
            option("overlay", story["overlay"], "Overlay draft from transcript story scaffold. Check face-safe placement before burn-in.", "overlay", "grounded-story-inference"),
            option("overlay", "Keep text above faces and away from platform UI.", "Face-safe placement reminder until burn-in tooling is explicit.", "overlay"),
        ]
    elif generic:
        hook_options = [
            option("hook", "This is the moment the idea turns.", "Template only because no transcript excerpt is exposed for this short.", "hook"),
            option("hook", "The useful part is what changes by the end.", "Template only; proof-watch and replace with the actual idea.", "hook"),
            option("hook", "Watch for the sentence that changes the point.", "Template only; use after identifying the real spoken payoff.", "hook"),
        ]
        turn_options = [
            option("middleTurn", "Before -> after: name what changes in one phrase.", "Fill-in frame for the missing middle turn. Do not apply as final copy.", ""),
            option("middleTurn", "The thought shifts from setup to consequence.", "Use if proof-watch confirms the clip turns from context into meaning.", ""),
            option("middleTurn", "The speaker moves from explaining to realizing.", "Use only if the actual cadence supports that interpretation.", ""),
        ]
        payoff_options = [
            option("payoff", "The takeaway is the part a viewer can use today.", "Fill-in payoff frame; replace with the real takeaway after watching.", ""),
            option("payoff", "End on the sentence that gives the viewer a reward.", "Editing instruction for choosing/tuning the out point.", ""),
            option("payoff", "If the ending only trails off, tighten the range or mark Refine.", "Prevents metadata polish from hiding a weak ending.", ""),
        ]
        caption_options = [
            option("caption", "Caption after proof-watch: one sentence that names the actual takeaway.", "Caption should be grounded in the spoken moment, not guessed.", "caption"),
            option("overlay", "Name the turn, not the topic.", "Overlay guidance for shorts that already have a title-like label.", "overlay"),
            option("overlay", "Keep text above faces and away from platform UI.", "Face-safe placement reminder until burn-in tooling is explicit.", "overlay"),
        ]
    else:
        hook_options = [
            option("hook", f"Why {topic} matters before the next decision.", "Uses the title topic as a stop-scroll promise; proof-watch for accuracy.", "hook"),
            option("hook", f"The part of {topic} people usually miss.", "Creates a curiosity frame without claiming a fact beyond the title.", "hook"),
            option("hook", f"{topic}: the moment it becomes practical.", "Turns the topic toward a useful payoff.", "hook"),
        ]
        turn_options = [
            option("middleTurn", "Before -> after: name what changes in one phrase.", "Fill-in frame for the missing middle turn. Do not apply as final copy.", ""),
            option("middleTurn", "The thought shifts from setup to consequence.", "Use if proof-watch confirms the clip turns from context into meaning.", ""),
            option("middleTurn", "The speaker moves from explaining to realizing.", "Use only if the actual cadence supports that interpretation.", ""),
        ]
        payoff_options = [
            option("payoff", "The takeaway is the part a viewer can use today.", "Fill-in payoff frame; replace with the real takeaway after watching.", ""),
            option("payoff", "End on the sentence that gives the viewer a reward.", "Editing instruction for choosing/tuning the out point.", ""),
            option("payoff", "If the ending only trails off, tighten the range or mark Refine.", "Prevents metadata polish from hiding a weak ending.", ""),
        ]
        caption_options = [
            option("caption", "Caption after proof-watch: one sentence that names the actual takeaway.", "Caption should be grounded in the spoken moment, not guessed.", "caption"),
            option("overlay", "Name the turn, not the topic.", "Overlay guidance for shorts that already have a title-like label.", "overlay"),
            option("overlay", "Keep text above faces and away from platform UI.", "Face-safe placement reminder until burn-in tooling is explicit.", "overlay"),
        ]

    proof_questions = [
        text_value(human_guidance.get("primaryQuestion"), "Would a real viewer keep watching, understand the point, and feel the people rather than the edit?"),
        "What is the first-second promise?",
        "What changes, escalates, or becomes clearer in the middle?",
        "What is the payoff or ending reward?",
        "Does the cut preserve human cadence, breath, and reaction?",
    ]
    if cut_next:
        proof_questions.append(cut_next)

    return {
        "hasTranscriptExcerpt": bool(excerpt),
        "transcriptSource": transcript.get("source", ""),
        "transcriptSegmentCount": transcript.get("segmentCount", 0),
        "genericTitleWarning": generic,
        "contextSeed": base_context,
        "hookOptions": hook_options,
        "middleTurnOptions": turn_options,
        "payoffOptions": payoff_options,
        "captionOverlayOptions": caption_options,
        "proofWatchQuestions": proof_questions,
        "reviewMode": review_mode,
    }


def build_payload(base_url: str) -> dict[str, Any]:
    quality = fetch_json(base_url, "/selected_short_quality")
    production = fetch_json(base_url, "/selected_short_production_brief")
    human = fetch_json(base_url, "/selected_short_human_review_guidance")
    selected = selected_from_quality(quality)
    contract = contract_from_payloads(quality, production)
    transcript = transcript_context(base_url, quality, production)
    options = build_options(selected, quality, production, human, transcript)
    return {
        "status": "selected_short_story_repair_suggestions" if selected else "needs-selected-short",
        "model": "quipsly-selected-short-story-repair-suggestions",
        "version": "2026-07-04.selected-short-story-repair-suggestions.v1",
        "baseUrl": base_url.rstrip("/"),
        "selectedShort": {
            "id": selected.get("id", ""),
            "title": selected.get("title", ""),
            "duration": selected.get("duration") or selected.get("recipeDuration") or quality.get("recipeDuration") or 0,
            "reviewStatus": selected.get("reviewStatus", ""),
            "exportStatus": selected.get("exportStatus", ""),
        },
        "storyContract": contract,
        "missingChecks": missing_checks(contract),
        "transcriptContext": transcript,
        "suggestions": options,
        "safeCommands": {
            "reviewPacket": "script/agentctl.sh selected-short-review-brief --markdown",
            "storyContract": "script/agentctl.sh selected-short-story-contract --markdown",
            "humanGuidance": "script/agentctl.sh selected-short-human-review-guidance --markdown",
            "markRefineMetadata": 'script/agentctl.sh shorts-record-review needs-refine --note "story repair still needs proof-watch"',
            "updateSelectedHook": 'script/agentctl.sh shorts-update-selected hook "<chosen hook>"',
            "updateSelectedCaption": 'script/agentctl.sh shorts-update-selected caption "<chosen caption>"',
            "updateSelectedOverlay": 'script/agentctl.sh shorts-update-selected overlay "<chosen overlay>"',
        },
        "truth": "Read-only story repair suggestions. Suggestions do not approve, publish, export, overwrite, move timeline decisions, or mutate source media. Applying a suggested command changes selected-short metadata only.",
    }


def render_markdown(payload: dict[str, Any]) -> str:
    selected = dict_value(payload.get("selectedShort"))
    contract = dict_value(payload.get("storyContract"))
    suggestions = dict_value(payload.get("suggestions"))
    lines = [
        "# Selected short story repair suggestions",
        "",
        f"- Status: `{payload.get('status', '')}`",
        f"- Short: {selected.get('title', '') or 'none selected'}",
        f"- Review/export: `{selected.get('reviewStatus', '')}` / `{selected.get('exportStatus', '')}`",
        f"- Contract: `{contract.get('label', 'unknown')}` ({contract.get('readyCount', 0)}/{contract.get('totalCount', 0)})",
        f"- Missing checks: {', '.join(payload.get('missingChecks') or []) or 'none'}",
        f"- Transcript/context exposed: `{suggestions.get('hasTranscriptExcerpt', False)}`",
        f"- Transcript source: {suggestions.get('transcriptSource', '') or 'none'}",
        f"- Generic title warning: `{suggestions.get('genericTitleWarning', False)}`",
        "",
        "## Proof-watch questions",
    ]
    for question in list_value(suggestions.get("proofWatchQuestions")):
        lines.append(f"- {question}")

    for section, title in [
        ("hookOptions", "Hook options"),
        ("middleTurnOptions", "Middle turn options"),
        ("payoffOptions", "Payoff options"),
        ("captionOverlayOptions", "Caption / overlay options"),
    ]:
        lines.extend(["", f"## {title}", ""])
        for index, item in enumerate(list_value(suggestions.get(section)), start=1):
            item = dict_value(item)
            lines.append(f"{index}. {item.get('text', '')}")
            lines.append(f"   - Why: {item.get('why', '')}")
            lines.append(f"   - Confidence: `{item.get('confidence', '')}`")
            if item.get("applyCommand"):
                lines.append(f"   - Apply if chosen: `{item.get('applyCommand')}`")

    lines.extend(["", "## Safe commands", ""])
    for label, command in dict_value(payload.get("safeCommands")).items():
        lines.append(f"- `{label}`: `{command}`")
    lines.extend(["", f"Truth: {payload.get('truth', '')}"])
    return "\n".join(lines).strip() + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--markdown", action="store_true")
    args = parser.parse_args()
    payload = build_payload(args.base_url)
    if args.json:
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        print(render_markdown(payload))
    return 0 if payload.get("status") == "selected_short_story_repair_suggestions" else 1


if __name__ == "__main__":
    raise SystemExit(main())
