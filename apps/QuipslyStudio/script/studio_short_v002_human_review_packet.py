#!/usr/bin/env python3
"""Build a calm human/agent review packet for current v002 short candidates.

The packet wraps the self-checking refresh output into a practical handoff:
what to watch, what warning matters, where the theater/quality/rehearsal files
are, and which local review command is safe after a real watch/listen pass.

It writes local sidecars only. It never records decisions, mutates media,
overwrites exports, publishes, schedules, uploads, or creates receipt truth.
"""
from __future__ import annotations

import argparse
import json
import shlex
import subprocess
import sys
from datetime import datetime, timezone
from html import escape
from pathlib import Path
from typing import Any


SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
DEFAULT_OUTPUT_DIR = DEFAULT_ROOT / "review-board" / "short-v002-human-review-packet"
DEFAULT_CANDIDATE_TRANSCRIPTS_DIR = DEFAULT_ROOT / "review-board" / "short-v002-candidate-transcripts"
DEFAULT_TRANSCRIPT_COCKPIT_JSON = DEFAULT_ROOT / "shorts-command-room" / "transcript-review-cockpit" / "quipsly-studio-shorts-transcript-review-cockpit.json"
DEFAULT_SEMANTIC_QUEUE_JSON = DEFAULT_ROOT / "shorts-command-room" / "semantic-review-queue" / "quipsly-studio-shorts-semantic-review-queue.json"
SCHEMA = "quipsly.studio.short-v002-human-review-packet.v1"
VERSION = "2026-07-03.v2"
GENERIC_OPENERS = (
    "all right",
    "good morning",
    "welcome to",
    "let's go ahead",
    "i'm scott",
    "this is my brother",
    "and i am",
)
WEAK_ENDINGS = {"about", "and", "the", "a", "to", "of", "with", "for", "it", "this", "that", "so", "but"}


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def load_json(path: str | Path) -> dict[str, Any]:
    candidate = Path(path)
    if not candidate.exists():
        return {}
    try:
        data = json.loads(candidate.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return data if isinstance(data, dict) else {}


def file_uri(path_value: str) -> str:
    if not path_value:
        return ""
    try:
        return Path(path_value).expanduser().resolve().as_uri()
    except Exception:
        return ""


def slug(text: str) -> str:
    out = []
    for char in text.lower():
        if char.isalnum():
            out.append(char)
        elif out and out[-1] != "-":
            out.append("-")
    return "".join(out).strip("-") or "candidate"


def word_count(text: str) -> int:
    return len([part for part in text.split() if part.strip()])


def words(sample: str) -> list[str]:
    cleaned = "".join(ch.lower() if ch.isalnum() or ch.isspace() else " " for ch in sample)
    return [part for part in cleaned.split() if part]


def first_words(sample: str, count: int = 18) -> str:
    parts = sample.split()
    return " ".join(parts[:count]) + (" ..." if len(parts) > count else "")


def contains_generic_opener(sample: str) -> bool:
    lowered = sample.lower().strip()
    return any(phrase in lowered[:160] for phrase in GENERIC_OPENERS)


def ending_risk(sample_words: list[str]) -> bool:
    return bool(sample_words and sample_words[-1] in WEAK_ENDINGS)


def transcript_text(data: dict[str, Any], max_chars: int = 900) -> str:
    if isinstance(data.get("text"), str):
        return " ".join(str(data.get("text") or "").split())[:max_chars]
    segments = data.get("segments") if isinstance(data.get("segments"), list) else []
    parts = [str(segment.get("text") or "").strip() for segment in segments if isinstance(segment, dict)]
    return " ".join(" ".join(parts).split())[:max_chars]


def load_candidate_transcript(short_id: str) -> dict[str, Any]:
    short_slug = slug(short_id)
    pointer = DEFAULT_CANDIDATE_TRANSCRIPTS_DIR / short_slug / f"latest-{short_slug}-candidate-transcript.json"
    paths = load_json(pointer)
    json_path = paths.get("jsonPath") if isinstance(paths, dict) else ""
    return load_json(str(json_path or ""))


def run_refresh(args: argparse.Namespace) -> tuple[dict[str, Any], dict[str, Any]]:
    command = [
        sys.executable,
        str(SCRIPT_DIR / "studio_short_v002_review_refresh.py"),
        "--reviewer",
        args.reviewer,
        "--limit",
        str(args.limit),
        "--json",
    ]
    if args.skip_transcript:
        command.append("--skip-transcript")
    for short_id in args.short_id:
        command.extend(["--short-id", short_id])
    started = utc_now()
    proc = subprocess.run(command, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=900)
    step = {
        "label": "review-refresh",
        "command": command,
        "startedAt": started,
        "completedAt": utc_now(),
        "returncode": proc.returncode,
        "ok": proc.returncode == 0,
        "stderrTail": (proc.stderr or "")[-1600:],
    }
    if proc.returncode != 0:
        step["stdoutTail"] = (proc.stdout or "")[-1600:]
        return step, {}
    try:
        payload = json.loads(proc.stdout or "{}")
    except json.JSONDecodeError as error:
        step.update({"ok": False, "error": f"Refresh JSON parse failed: {error}", "stdoutTail": (proc.stdout or "")[-1600:]})
        return step, {}
    if not isinstance(payload, dict):
        step.update({"ok": False, "error": "Refresh output was not a JSON object."})
        return step, {}
    step["status"] = payload.get("status") or ""
    return step, payload


def by_short_id(items: Any) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    if isinstance(items, list):
        for item in items:
            if isinstance(item, dict):
                short_id = str(item.get("shortId") or "")
                if short_id:
                    result[short_id] = item
    return result


def existing_path(path: Path) -> str:
    return str(path) if path.exists() else ""


def build_candidate_transcript_context(candidate_transcript: dict[str, Any]) -> dict[str, Any]:
    transcript = candidate_transcript.get("transcript") if isinstance(candidate_transcript.get("transcript"), dict) else {}
    output_paths = candidate_transcript.get("outputPaths") if isinstance(candidate_transcript.get("outputPaths"), dict) else {}
    preview = str(candidate_transcript.get("preview") or transcript_text(transcript))
    segments = transcript.get("segments") if isinstance(transcript.get("segments"), list) else []
    return {
        "status": candidate_transcript.get("status") or "",
        "wordCountApprox": word_count(preview),
        "segmentCount": len(segments),
        "sample": preview,
        "acceptedForEditReview": False,
        "normalizedTranscriptPath": "",
        "normalizedTranscriptExists": False,
        "ledgerEventCount": 0,
        "candidateTranscriptPath": output_paths.get("jsonPath") or "",
        "candidateTranscriptMarkdownPath": output_paths.get("markdownPath") or "",
        "candidateCaptionDraftSrtPath": output_paths.get("captionDraftSrtPath") or candidate_transcript.get("captionDraftSrtPath") or "",
        "candidateCaptionDraftVttPath": output_paths.get("captionDraftVttPath") or candidate_transcript.get("captionDraftVttPath") or "",
        "candidateCaptionDraftReview": candidate_transcript.get("captionDraftReview") if isinstance(candidate_transcript.get("captionDraftReview"), dict) else {},
        "nextSafestAction": "Listen-check this exact-candidate machine transcript before relying on it for captions, hook judgment, or cut decisions.",
        "truth": "Candidate transcript context is machine draft evidence for the exact v002 candidate. It is not normalized transcript truth, final caption approval, or publication truth.",
    }


def build_transcript_context(transcript_item: dict[str, Any], semantic_item: dict[str, Any], candidate_transcript: dict[str, Any]) -> dict[str, Any]:
    if candidate_transcript:
        return build_candidate_transcript_context(candidate_transcript)
    semantic_transcript = semantic_item.get("transcript") if isinstance(semantic_item.get("transcript"), dict) else {}
    summary = transcript_item.get("asrDraftSummary") if isinstance(transcript_item.get("asrDraftSummary"), dict) else {}
    normalized = transcript_item.get("normalizedTranscript") if isinstance(transcript_item.get("normalizedTranscript"), dict) else {}
    ledger = transcript_item.get("ledger") if isinstance(transcript_item.get("ledger"), dict) else {}
    status = str(transcript_item.get("status") or semantic_transcript.get("cockpitStatus") or semantic_transcript.get("status") or "")
    return {
        "status": status,
        "wordCountApprox": summary.get("wordCountApprox") or semantic_transcript.get("wordCountApprox") or 0,
        "segmentCount": summary.get("segmentCount") or semantic_transcript.get("segmentCount") or 0,
        "sample": summary.get("sample") or "",
        "acceptedForEditReview": status == "accepted-for-edit-review" or bool(semantic_transcript.get("acceptedForEditReview")),
        "normalizedTranscriptPath": normalized.get("path") or "",
        "normalizedTranscriptExists": bool(normalized.get("exists")),
        "ledgerEventCount": ledger.get("eventCount") or 0,
        "nextSafestAction": transcript_item.get("nextSafestAction") or "",
        "truth": "Transcript context is review evidence only. It is not final caption approval or publication truth.",
    }


def build_candidate_semantic_context(transcript_context: dict[str, Any]) -> dict[str, Any]:
    sample = str(transcript_context.get("sample") or "")
    parts = words(sample)
    word_total = int(transcript_context.get("wordCountApprox") or len(parts))
    generic = contains_generic_opener(sample)
    too_short = word_total > 0 and word_total < 14
    abrupt = ending_risk(parts)
    flags: list[str] = []
    if not sample:
        flags.append("no-word-sample")
    if generic:
        flags.append("generic-opener-risk")
    if too_short:
        flags.append("too-little-word-context")
    if abrupt:
        flags.append("abrupt-ending-risk")
    if transcript_context.get("status") == "candidate-transcript-draft-ready":
        flags.append("candidate-machine-draft-needs-listen-check")
    if not sample:
        hook_state = "unknown-hook"
        hook_reason = "No exact candidate transcript sample is linked yet; hook quality must be judged by watching/listening."
    elif generic:
        hook_state = "likely-needs-stronger-in-point"
        hook_reason = "The exact candidate opens like setup or housekeeping, not a stranger-facing social hook."
    elif too_short:
        hook_state = "needs-more-context"
        hook_reason = "The exact candidate transcript is too thin to prove hook, turn, and payoff."
    else:
        hook_state = "candidate-reviewable-hook"
        hook_reason = "The exact candidate has enough words to review whether the idea lands as a short."
    if word_total <= 22:
        cadence_state = "tight-social-review"
        cadence_guidance = "Listen for over-tightening; preserve enough breath for the idea to feel human."
    elif word_total <= 90:
        cadence_state = "candidate-mini-argument-review"
        cadence_guidance = "Check that the setup, turn, and payoff all earn the runtime."
    else:
        cadence_state = "long-short-review"
        cadence_guidance = "Treat as retention-risk unless the story arc clearly needs the length."
    guidance = []
    if generic:
        guidance.append("Try a later in-point after setup, or add a text hook if the setup must stay.")
    if abrupt:
        guidance.append("Check the out-point; the exact transcript appears to stop on a weak connector word.")
    guidance.append("Listen-check the machine transcript before relying on it for captions, cut intent, or social copy.")
    guidance.append("Review whether a J-cut or L-cut would preserve the thought handoff better than a hard visual cut.")
    guidance.append("Check vertical framing and caption-safe face space before platform packaging.")
    return {
        "hookState": hook_state,
        "hookReason": hook_reason,
        "firstWords": first_words(sample),
        "flags": flags,
        "cadenceState": cadence_state,
        "cadenceGuidance": cadence_guidance,
        "captionTruth": "candidate-machine-draft-needs-listen-check",
        "guidance": guidance,
        "semanticPriority": 0,
        "nextSafestAction": "Watch/listen the exact candidate, check hook/cadence/ending against these words, then record keep/refine/hold/reject.",
        "scope": "exact-candidate",
        "truth": "Exact-candidate semantic context is heuristic review guidance from the candidate transcript draft. It is not transcript truth, caption approval, edit approval, export, publication, or receipt truth.",
    }


def build_semantic_context(semantic_item: dict[str, Any], transcript_context: dict[str, Any]) -> dict[str, Any]:
    assessment = semantic_item.get("semanticAssessment") if isinstance(semantic_item.get("semanticAssessment"), dict) else {}
    if not assessment and transcript_context.get("sample"):
        return build_candidate_semantic_context(transcript_context)
    return {
        "hookState": assessment.get("hookState") or "",
        "hookReason": assessment.get("hookReason") or "",
        "firstWords": assessment.get("firstWords") or "",
        "flags": assessment.get("flags") if isinstance(assessment.get("flags"), list) else [],
        "cadenceState": assessment.get("cadenceState") or "",
        "cadenceGuidance": assessment.get("cadenceGuidance") or "",
        "captionTruth": assessment.get("captionTruth") or "",
        "guidance": assessment.get("guidance") if isinstance(assessment.get("guidance"), list) else [],
        "semanticPriority": semantic_item.get("semanticPriority") or 0,
        "nextSafestAction": semantic_item.get("nextSafestAction") or "",
        "scope": "shared-semantic-queue" if assessment else "",
        "truth": "Semantic context is heuristic edit-review guidance. It is not edit approval, transcript truth, caption approval, export, publication, or receipt truth.",
    }


def build_missing_context_actions(short_id: str, transcript_context: dict[str, Any], semantic_context: dict[str, Any]) -> dict[str, Any]:
    transcript_linked = bool(transcript_context.get("status") or transcript_context.get("sample"))
    semantic_linked = bool(semantic_context.get("hookState") or semantic_context.get("cadenceState") or semantic_context.get("flags"))
    candidate_transcript_path = str(transcript_context.get("candidateTranscriptPath") or transcript_context.get("candidateTranscriptMarkdownPath") or "")
    actions: list[dict[str, str]] = []
    quoted_id = shlex.quote(short_id)
    if not transcript_linked:
        actions.append(
            {
                "label": "Create draft transcript evidence",
                "why": "This candidate has no linked words yet, so hook/cadence review still depends on watch/listen.",
                "command": f"./script/agentctl.sh studio-short-v002-candidate-transcript --short-id {quoted_id} --json",
                "truth": "Creates or refreshes local transcript draft evidence only. It is not final caption approval or publication truth.",
            }
        )
    if not semantic_linked:
        if candidate_transcript_path:
            actions.append(
                {
                    "label": "Review exact candidate words",
                    "why": "This candidate has exact-machine-transcript evidence, but not shared semantic-queue guidance. Use watch/listen plus the candidate transcript instead of forcing broad queue confidence.",
                    "command": f"open {shlex.quote(candidate_transcript_path)}",
                    "truth": "Opens local candidate transcript evidence only. It does not approve captions, edit timelines, export, publish, or create receipt truth.",
                }
            )
        else:
            actions.append(
                {
                    "label": "Refresh semantic review surfaces",
                    "why": "This candidate is not currently represented in the shared semantic queue, so semantic guidance cannot be trusted yet.",
                    "command": "./script/agentctl.sh studio-shorts-semantic-review-queue --all",
                    "truth": "Refreshes local heuristic review guidance only. It does not edit timelines, export, publish, or create receipt truth.",
                }
            )
    if transcript_linked and semantic_linked:
        next_action = "Watch/listen the candidate and use the linked words plus semantic guidance as review evidence."
    elif transcript_linked:
        next_action = "Transcript evidence exists; refresh or extend semantic surfaces before relying on hook/cadence guidance."
    elif semantic_linked:
        next_action = "Semantic context exists, but words are missing; create transcript draft evidence or review by watch/listen only."
    else:
        next_action = "Create/link transcript evidence, refresh semantic surfaces, or review by direct watch/listen before recording a decision."
    return {
        "transcriptLinked": transcript_linked,
        "semanticLinked": semantic_linked,
        "actions": actions,
        "nextSafestAction": next_action,
        "truth": "Missing-context actions are local review preparation only. They do not approve, publish, upload, schedule, mutate source media, overwrite exports, or create receipt truth.",
    }


def checklist_item(label: str, status: str, prompt: str, evidence: str, tradeoff: str) -> dict[str, str]:
    return {
        "label": label,
        "status": status,
        "prompt": prompt,
        "evidence": evidence,
        "tradeoff": tradeoff,
    }


def build_review_checklist(item: dict[str, Any], transcript_context: dict[str, Any], semantic_context: dict[str, Any]) -> list[dict[str, str]]:
    flags = semantic_context.get("flags") if isinstance(semantic_context.get("flags"), list) else []
    sample = str(transcript_context.get("sample") or semantic_context.get("firstWords") or "")
    warning_summary = str(item.get("warningSummary") or "")
    hook_state = str(semantic_context.get("hookState") or "not-linked")
    cadence_state = str(semantic_context.get("cadenceState") or "not-linked")
    semantic_scope = str(semantic_context.get("scope") or "not-linked")
    transcript_status = str(transcript_context.get("status") or "not-linked")
    caption_review = transcript_context.get("candidateCaptionDraftReview") if isinstance(transcript_context.get("candidateCaptionDraftReview"), dict) else {}
    caption_status = str(caption_review.get("status") or "caption-draft-not-linked")
    caption_warnings = caption_review.get("warnings") if isinstance(caption_review.get("warnings"), list) else []
    hook_status = "listen-check" if "machine-draft-needs-audio-check" in flags or "candidate-machine-draft-needs-listen-check" in flags else "review"
    ending_status = "needs-attention" if "abrupt-ending-risk" in flags else "review"
    hook_prompt = "Does the first spoken beat make a stranger want the next sentence?"
    if "generic-opener-risk" in flags:
        hook_prompt = "The opening may be setup. Test whether a later in-point would create a stronger social hook."
    cadence_prompt = "Does the cut feel like a human thought, with enough breath and not too much dead air?"
    if "too-little-word-context" in flags:
        cadence_prompt = "There may not be enough word context to prove the idea. Watch/listen before keeping."
    return [
        checklist_item(
            "Hook",
            hook_status,
            hook_prompt,
            f"{hook_state}; scope={semantic_scope}; first words={sample[:220] or 'no sample'}",
            "A faster in-point can improve retention, but cutting too late can make the speaker feel abrupt or stripped of context.",
        ),
        checklist_item(
            "Cadence",
            "listen-check",
            cadence_prompt,
            f"{cadence_state}; transcript={transcript_status}; words={transcript_context.get('wordCountApprox') or 0}; segments={transcript_context.get('segmentCount') or 0}",
            "Tightening pauses can sharpen a short, but over-tightening makes it feel synthetic. Preserve air when it carries meaning.",
        ),
        checklist_item(
            "Ending payoff",
            ending_status,
            "Does the final beat land as a complete thought, question, or emotional turn?",
            f"flags={', '.join(flags) or 'none'}",
            "Ending earlier can raise pace, but a cut that clips the thought makes the short feel like an accident.",
        ),
        checklist_item(
            "Cut feel",
            "review",
            "Would a J-cut, L-cut, reaction cover, or tiny hold make the moment feel more human than a hard cut?",
            "Exact timeline decisions are still metadata; source media stays whole.",
            "A clean visual cut is not always the best human cut. Use reaction/air when it preserves conversational truth.",
        ),
        checklist_item(
            "9:16 framing and captions",
            "needs-review" if caption_warnings or caption_status == "caption-draft-not-linked" else "review",
            "Are faces, captions, and gesture space safe for YouTube Shorts, Reels, and TikTok-style viewing?",
            f"captionStatus={caption_status}; cues={caption_review.get('cueCount') or 0}; longestCue={caption_review.get('longestCueCharacters') or 0} chars; warnings={', '.join(caption_warnings) or 'none'}",
            "Bigger captions improve phone readability, but crowding faces makes the speaker feel trapped.",
        ),
        checklist_item(
            "Decision tradeoff",
            "review",
            "After watch/listen, is this KEEP, REFINE, HOLD, or REJECT?",
            warning_summary or "No automated warning. Still verify by watching/listening.",
            "KEEP means locally review-worthy, not publication. REFINE preserves the idea while asking for another edit pass.",
        ),
    ]


def compact_title_from_words(sample: str, fallback: str) -> str:
    words_only = [part.strip(".,!?;:\"'()[]{}") for part in sample.split()]
    words_only = [part for part in words_only if part]
    if not words_only:
        return fallback
    title = " ".join(words_only[:9]).strip()
    if len(words_only) > 9:
        title += "..."
    return title[:86]


def build_platform_draft(item: dict[str, Any], transcript_context: dict[str, Any], semantic_context: dict[str, Any]) -> dict[str, Any]:
    short_id = str(item.get("shortId") or "")
    episode = item.get("episode") or ""
    sample = str(transcript_context.get("sample") or semantic_context.get("firstWords") or "")
    title_seed = compact_title_from_words(sample, f"Episode {episode} short")
    hook_state = str(semantic_context.get("hookState") or "")
    cadence_state = str(semantic_context.get("cadenceState") or "")
    caption_review = transcript_context.get("candidateCaptionDraftReview") if isinstance(transcript_context.get("candidateCaptionDraftReview"), dict) else {}
    warnings = caption_review.get("warnings") if isinstance(caption_review.get("warnings"), list) else []
    base_description = (
        f"A short moment from High Ground Odyssey Episode {episode}. "
        "Drafted from exact-candidate transcript evidence; review voice, captions, and context before posting."
    )
    if sample:
        base_description += f" Moment: \"{sample[:220]}\""
    hashtags = ["#HighGroundOdyssey", "#Leadership", "#Podcast", "#Shorts"]
    if "patreon" in sample.lower():
        hashtags.append("#CreatorSupport")
    if "untrustworthy" in sample.lower() or "inconsistent" in sample.lower():
        hashtags.extend(["#Trust", "#Accountability"])
    hashtags = list(dict.fromkeys(hashtags))[:8]
    checklist = [
        "Watch/listen the candidate with sound before posting.",
        "Confirm caption draft timing and phone-safe placement.",
        "Confirm the opening hook works without episode context.",
        "Confirm the ending lands cleanly and does not clip the thought.",
        "Choose platform title/description in Charlie/Homer voice before upload.",
    ]
    if warnings:
        checklist.insert(1, f"Resolve caption warning(s): {', '.join(warnings)}.")
    return {
        "status": "draft-platform-metadata-ready" if sample else "needs-human-copy",
        "titleDraft": title_seed,
        "hookDraft": sample[:160] if sample else "",
        "descriptionDraft": base_description,
        "hashtags": hashtags,
        "platforms": {
            "youtubeShorts": {
                "title": title_seed,
                "description": f"{base_description}\n\n{' '.join(hashtags)}",
                "check": "Use vertical export, review captions, then upload manually or through Tower when approved.",
            },
            "instagramReels": {
                "caption": f"{title_seed}\n\n{' '.join(hashtags[:6])}",
                "check": "Keep caption concise; verify on-phone crop and safe caption area.",
            },
            "facebookReels": {
                "caption": f"{title_seed}\n\n{base_description}\n\n{' '.join(hashtags[:6])}",
                "check": "Use a slightly more explanatory caption if the moment needs context.",
            },
            "linkedin": {
                "caption": f"{title_seed}\n\n{base_description}\n\n{' '.join(tag for tag in hashtags if tag.lower() not in {'#shorts'})}",
                "check": "Only use if the short has a clear professional leadership or coaching angle.",
            },
        },
        "reviewChecklist": checklist,
        "evidence": {
            "shortId": short_id,
            "episode": episode,
            "semanticScope": semantic_context.get("scope") or "",
            "hookState": hook_state,
            "cadenceState": cadence_state,
            "captionDraftStatus": caption_review.get("status") or "",
            "captionWarnings": warnings,
        },
        "truth": "Draft platform metadata only. It is not upload approval, publication approval, scheduled content, external publication, or receipt truth.",
    }


def build_review_items(refresh: dict[str, Any]) -> list[dict[str, Any]]:
    readback = refresh.get("agentReadback") if isinstance(refresh.get("agentReadback"), dict) else {}
    queue = load_json(str(readback.get("queuePath") or ""))
    theater_path = str(readback.get("theaterPath") or "")
    theater_json = load_json(Path(theater_path).with_suffix(".json")) if theater_path else {}
    queue_by_id = by_short_id(queue.get("items"))
    theater_by_id = by_short_id(theater_json.get("items"))
    per_short = by_short_id(refresh.get("perShort"))
    alignment_by_id = by_short_id((refresh.get("surfaceAlignment") or {}).get("items") if isinstance(refresh.get("surfaceAlignment"), dict) else [])
    transcript_json = load_json(DEFAULT_TRANSCRIPT_COCKPIT_JSON)
    semantic_json = load_json(DEFAULT_SEMANTIC_QUEUE_JSON)
    transcript_by_id = by_short_id(transcript_json.get("items"))
    semantic_by_id = by_short_id(semantic_json.get("items"))
    cards: list[dict[str, Any]] = []
    for compact in refresh.get("queueItems", []) if isinstance(refresh.get("queueItems"), list) else []:
        if not isinstance(compact, dict):
            continue
        short_id = str(compact.get("shortId") or "")
        if not short_id:
            continue
        queue_item = queue_by_id.get(short_id, {})
        theater_item = theater_by_id.get(short_id, {})
        short_record = per_short.get(short_id, {})
        alignment = alignment_by_id.get(short_id, {})
        transcript_item = transcript_by_id.get(short_id, {})
        semantic_item = semantic_by_id.get(short_id, {})
        candidate_transcript = load_candidate_transcript(short_id)
        transcript_context = build_transcript_context(transcript_item, semantic_item, candidate_transcript)
        semantic_context = build_semantic_context(semantic_item, transcript_context)
        commands = queue_item.get("commands") if isinstance(queue_item.get("commands"), dict) else {}
        cards.append({
            "shortId": short_id,
            "episode": compact.get("episode"),
            "readiness": compact.get("readiness") or "",
            "reviewStatus": compact.get("reviewStatus") or "",
            "reviewGateStatus": compact.get("reviewGateStatus") or "",
            "candidatePath": compact.get("candidatePath") or queue_item.get("candidatePath") or "",
            "candidateUri": file_uri(str(compact.get("candidatePath") or queue_item.get("candidatePath") or "")),
            "warningSummary": compact.get("warningSummary") or queue_item.get("warningSummary") or "",
            "warnings": compact.get("warnings") if isinstance(compact.get("warnings"), list) else queue_item.get("warnings", []),
            "watchListenExpectation": queue_item.get("watchListenExpectation") or short_record.get("decisionWatchListenExpectation") or "Watch and listen before recording a local review state.",
            "nextSafestAction": compact.get("nextSafestAction") or queue_item.get("nextSafestAction") or "Watch/listen, then choose keep/refine/hold/reject.",
            "theaterPath": theater_path,
            "qualityBriefPath": short_record.get("qualityBriefPath") or "",
            "decisionRehearsalPath": short_record.get("decisionRehearsalPath") or "",
            "evidencePath": short_record.get("evidencePath") or "",
            "surfaceAligned": bool(alignment.get("ok")),
            "surfaceAlignmentProblems": alignment.get("problems") if isinstance(alignment.get("problems"), list) else [],
            "transcriptContext": transcript_context,
            "semanticContext": semantic_context,
            "missingContext": build_missing_context_actions(short_id, transcript_context, semantic_context),
            "reviewChecklist": build_review_checklist(compact, transcript_context, semantic_context),
            "platformDraft": build_platform_draft(compact, transcript_context, semantic_context),
            "contextPaths": {
                "transcriptCockpitJson": existing_path(DEFAULT_TRANSCRIPT_COCKPIT_JSON),
                "transcriptCockpitHtml": existing_path(DEFAULT_TRANSCRIPT_COCKPIT_JSON.with_suffix(".html")),
                "candidateTranscriptJson": transcript_context.get("candidateTranscriptPath") or "",
                "candidateTranscriptMarkdown": transcript_context.get("candidateTranscriptMarkdownPath") or "",
                "candidateCaptionDraftSrt": transcript_context.get("candidateCaptionDraftSrtPath") or "",
                "candidateCaptionDraftVtt": transcript_context.get("candidateCaptionDraftVttPath") or "",
                "semanticQueueJson": existing_path(DEFAULT_SEMANTIC_QUEUE_JSON),
                "semanticQueueHtml": existing_path(DEFAULT_SEMANTIC_QUEUE_JSON.with_suffix(".html")),
            },
            "commands": {
                "openCandidate": commands.get("openCandidate") or theater_item.get("commands", {}).get("openCandidate", "") if isinstance(theater_item.get("commands"), dict) else commands.get("openCandidate", ""),
                "makeTheater": commands.get("makeTheater") or "",
                "keepAfterWatchListen": commands.get("keep") or "",
                "refineAgainAfterWatchListen": commands.get("refineAgain") or "",
                "hold": commands.get("hold") or "",
                "rejectAfterWatchListen": commands.get("reject") or "",
            },
            "truth": "Review packet item only. It does not approve, record decisions, mutate media, overwrite exports, publish, schedule, upload, mutate accounts, normalize transcript truth, or create receipt truth.",
        })
    return cards


def dry_run_review_command(command: str) -> dict[str, Any]:
    if not command:
        return {
            "ok": False,
            "command": "",
            "error": "No command generated.",
            "ledgerMutated": False,
        }
    parts = shlex.split(command)
    if len(parts) < 2:
        return {
            "ok": False,
            "command": command,
            "error": "Command is too short to convert to dry-run.",
            "ledgerMutated": False,
        }
    if parts[0] not in {"./script/agentctl.sh", "script/agentctl.sh"} or parts[1] != "studio-short-v002-candidate-review":
        return {
            "ok": False,
            "command": command,
            "error": "Command is not a v002 candidate review command.",
            "ledgerMutated": False,
        }
    dry_parts = ["./script/agentctl.sh", "studio-short-v002-candidate-review-dry-run", *parts[2:], "--json"]
    proc = subprocess.run(dry_parts, cwd=SCRIPT_DIR.parent, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=120)
    result: dict[str, Any] = {
        "command": command,
        "dryRunCommand": " ".join(shlex.quote(part) for part in dry_parts),
        "returncode": proc.returncode,
        "ok": proc.returncode == 0,
        "stderrTail": (proc.stderr or "")[-1200:],
        "ledgerMutated": None,
    }
    if proc.returncode != 0:
        result["stdoutTail"] = (proc.stdout or "")[-1200:]
        return result
    try:
        payload = json.loads(proc.stdout or "{}")
    except json.JSONDecodeError as error:
        result.update({"ok": False, "error": f"Dry-run JSON parse failed: {error}", "stdoutTail": (proc.stdout or "")[-1200:]})
        return result
    event = payload.get("event") if isinstance(payload.get("event"), dict) else {}
    review_evidence = event.get("reviewEvidence") if isinstance(event.get("reviewEvidence"), dict) else {}
    result.update(
        {
            "status": payload.get("status") or "",
            "ledgerMutated": bool(payload.get("ledgerMutated")),
            "decision": event.get("decision") or "",
            "reviewEvidenceStatus": review_evidence.get("status") or "",
            "reviewWarnings": review_evidence.get("reviewWarnings") if isinstance(review_evidence.get("reviewWarnings"), list) else [],
            "candidateWarnings": review_evidence.get("candidateWarnings") if isinstance(review_evidence.get("candidateWarnings"), list) else [],
        }
    )
    if payload.get("ledgerMutated"):
        result["ok"] = False
        result["error"] = "Dry-run reported ledger mutation."
    return result


def verify_review_commands(cards: list[dict[str, Any]]) -> dict[str, Any]:
    command_keys = [
        "keepAfterWatchListen",
        "refineAgainAfterWatchListen",
        "hold",
        "rejectAfterWatchListen",
    ]
    items: list[dict[str, Any]] = []
    failed = 0
    for card in cards:
        commands = card.get("commands") if isinstance(card.get("commands"), dict) else {}
        checks = {key: dry_run_review_command(str(commands.get(key) or "")) for key in command_keys}
        for result in checks.values():
            if not result.get("ok") or result.get("ledgerMutated"):
                failed += 1
        card["commandDryRuns"] = checks
        items.append(
            {
                "shortId": card.get("shortId") or "",
                "ok": all(result.get("ok") and result.get("ledgerMutated") is False for result in checks.values()),
                "failed": sum(1 for result in checks.values() if not result.get("ok") or result.get("ledgerMutated")),
                "checks": {
                    key: {
                        "ok": value.get("ok"),
                        "ledgerMutated": value.get("ledgerMutated"),
                        "decision": value.get("decision") or "",
                        "reviewEvidenceStatus": value.get("reviewEvidenceStatus") or "",
                        "reviewWarnings": value.get("reviewWarnings") or [],
                    }
                    for key, value in checks.items()
                },
            }
        )
    return {
        "status": "command-dry-run-ready" if failed == 0 else "command-dry-run-needs-attention",
        "failed": failed,
        "items": items,
        "truth": "Dry-run verification only. It does not record review decisions, mutate media, overwrite exports, upload, publish, schedule, mutate accounts, normalize transcript truth, or create receipt truth.",
    }


def build_payload(args: argparse.Namespace) -> dict[str, Any]:
    refresh_step, refresh = run_refresh(args)
    cards = build_review_items(refresh) if refresh_step.get("ok") else []
    command_dry_run = verify_review_commands(cards) if args.verify_commands and cards else {}
    alignment = refresh.get("surfaceAlignment") if isinstance(refresh.get("surfaceAlignment"), dict) else {}
    alignment_counts = alignment.get("counts") if isinstance(alignment.get("counts"), dict) else {}
    failed_alignment = int(alignment_counts.get("failed") or 0)
    failed_dry_runs = int(command_dry_run.get("failed") or 0) if command_dry_run else 0
    missing_transcript = sum(1 for card in cards if not (card.get("missingContext") or {}).get("transcriptLinked"))
    missing_semantic = sum(1 for card in cards if not (card.get("missingContext") or {}).get("semanticLinked"))
    status = "short-v002-human-review-packet-ready" if refresh_step.get("ok") and cards and failed_alignment == 0 and failed_dry_runs == 0 else "short-v002-human-review-packet-needs-attention"
    return {
        "schema": SCHEMA,
        "version": VERSION,
        "generatedAt": utc_now(),
        "status": status,
        "reviewer": args.reviewer,
        "refreshStep": refresh_step,
        "refreshStatus": refresh.get("status") or "",
        "counts": {
            "items": len(cards),
            "surfaceAlignmentFailed": failed_alignment,
            "commandDryRunFailed": failed_dry_runs,
            "missingTranscriptContext": missing_transcript,
            "missingSemanticContext": missing_semantic,
            "sourceFilesMutated": False,
            "versionsOverwritten": False,
            "externalPublishing": False,
            "receiptTruthCreated": False,
        },
        "sourcePaths": refresh.get("agentReadback") if isinstance(refresh.get("agentReadback"), dict) else {},
        "commandDryRun": command_dry_run,
        "items": cards,
        "agentReadback": {
            "nextShortId": cards[0].get("shortId") if cards else "",
            "nextCandidatePath": cards[0].get("candidatePath") if cards else "",
            "nextAction": cards[0].get("nextSafestAction") if cards else "No current review candidates found.",
            "surfaceAlignmentStatus": (refresh.get("agentReadback") or {}).get("surfaceAlignmentStatus", "") if isinstance(refresh.get("agentReadback"), dict) else "",
            "surfaceAlignmentFailedShortIds": (refresh.get("agentReadback") or {}).get("surfaceAlignmentFailedShortIds", []) if isinstance(refresh.get("agentReadback"), dict) else [],
            "commandDryRunStatus": command_dry_run.get("status") or "not-run",
            "missingTranscriptContext": missing_transcript,
            "missingSemanticContext": missing_semantic,
        },
        "nextSafestAction": "Open the theater, watch/listen candidates with sound, then copy the appropriate local review command." if cards else "No review packet items available.",
        "truth": "Human review packet only. It refreshes/reads local sidecars and presents watch/listen commands; it does not record review decisions, mutate source media, overwrite exports, upload, publish, schedule, mutate accounts, normalize transcript truth, or create receipt truth.",
    }


def render_markdown(payload: dict[str, Any]) -> str:
    lines = [
        "# Short v002 human review packet",
        "",
        f"Generated: `{payload.get('generatedAt')}`",
        f"Status: `{payload.get('status')}`",
        f"Reviewer: `{payload.get('reviewer')}`",
        f"Items: `{payload.get('counts', {}).get('items')}`",
        f"Surface alignment failed: `{payload.get('counts', {}).get('surfaceAlignmentFailed')}`",
        f"Command dry-run failed: `{payload.get('counts', {}).get('commandDryRunFailed')}`",
        "",
        "## How to use this packet",
        "",
        "1. Open the theater or candidate file.",
        "2. Watch and listen with sound on.",
        "3. If the candidate works, copy KEEP. If it needs another pass, copy REFINE. If it depends on context, HOLD. If it should not continue, REJECT.",
        "4. Remember: local KEEP is not publication, scheduling, upload, or receipt truth.",
        "",
    ]
    for item in payload.get("items", []):
        commands = item.get("commands") if isinstance(item.get("commands"), dict) else {}
        missing_context = item.get("missingContext") if isinstance(item.get("missingContext"), dict) else {}
        review_checklist = item.get("reviewChecklist") if isinstance(item.get("reviewChecklist"), list) else []
        platform_draft = item.get("platformDraft") if isinstance(item.get("platformDraft"), dict) else {}
        lines.extend([
            f"## `{item.get('shortId')}`",
            "",
            f"- Episode: `{item.get('episode')}`",
            f"- Readiness: `{item.get('readiness')}`",
            f"- Gate: `{item.get('reviewGateStatus')}`",
            f"- Candidate: `{item.get('candidatePath')}`",
            f"- Warning: `{item.get('warningSummary') or 'none'}`",
            f"- Surface aligned: `{item.get('surfaceAligned')}`",
            f"- Command dry-run: `{(item.get('commandDryRuns') and 'checked') or 'not-run'}`",
            f"- Transcript: `{item.get('transcriptContext', {}).get('status')}` / words `{item.get('transcriptContext', {}).get('wordCountApprox')}` / segments `{item.get('transcriptContext', {}).get('segmentCount')}`",
            f"- Hook/cadence: `{item.get('semanticContext', {}).get('hookState')}` / `{item.get('semanticContext', {}).get('cadenceState')}`",
            f"- Semantic scope: `{item.get('semanticContext', {}).get('scope') or 'not-linked'}`",
            f"- Semantic flags: `{', '.join(item.get('semanticContext', {}).get('flags') or []) or 'none'}`",
            f"- First words: {item.get('semanticContext', {}).get('firstWords') or item.get('transcriptContext', {}).get('sample') or 'No transcript sample linked.'}",
            f"- Watch/listen: {item.get('watchListenExpectation')}",
            f"- Next: {item.get('nextSafestAction')}",
            f"- Transcript next: {item.get('transcriptContext', {}).get('nextSafestAction') or 'No transcript cockpit context linked.'}",
            f"- Semantic next: {item.get('semanticContext', {}).get('nextSafestAction') or 'No semantic queue context linked.'}",
            f"- Missing context next: {missing_context.get('nextSafestAction') or 'No missing-context guidance generated.'}",
            f"- Platform draft: `{platform_draft.get('status') or 'not generated'}` title `{platform_draft.get('titleDraft') or ''}`",
            f"- Theater: `{item.get('theaterPath')}`",
            f"- Quality: `{item.get('qualityBriefPath')}`",
            f"- Decision rehearsal: `{item.get('decisionRehearsalPath')}`",
            "",
            "Commands after watch/listen:",
            "",
            "```bash",
            str(commands.get("keepAfterWatchListen") or ""),
            str(commands.get("refineAgainAfterWatchListen") or ""),
            str(commands.get("hold") or ""),
            str(commands.get("rejectAfterWatchListen") or ""),
            "```",
            "",
        ])
        if review_checklist:
            lines.extend(["Review checklist:", ""])
            for check in review_checklist:
                if isinstance(check, dict):
                    lines.append(f"- **{check.get('label')}** `{check.get('status')}`: {check.get('prompt')} Evidence: {check.get('evidence')} Tradeoff: {check.get('tradeoff')}")
            lines.append("")
        if platform_draft:
            lines.extend(["Platform draft:", ""])
            lines.append(f"- Title: {platform_draft.get('titleDraft') or ''}")
            lines.append(f"- Hook: {platform_draft.get('hookDraft') or ''}")
            lines.append(f"- Hashtags: {' '.join(platform_draft.get('hashtags') or [])}")
            for platform, draft in (platform_draft.get("platforms") or {}).items():
                if isinstance(draft, dict):
                    lines.append(f"- {platform}: {draft.get('check') or ''}")
            lines.append("")
        actions = missing_context.get("actions") if isinstance(missing_context.get("actions"), list) else []
        if actions:
            lines.extend(["Missing-context commands:", "", "```bash"])
            for action in actions:
                if isinstance(action, dict) and action.get("command"):
                    lines.append(str(action.get("command")))
            lines.extend(["```", ""])
    lines.extend(["## Truth boundary", "", str(payload.get("truth") or "")])
    return "\n".join(lines).rstrip() + "\n"


def render_html(payload: dict[str, Any]) -> str:
    cards: list[str] = []
    for item in payload.get("items", []):
        commands = item.get("commands") if isinstance(item.get("commands"), dict) else {}
        video = f"<video controls preload=\"metadata\" src=\"{escape(str(item.get('candidateUri') or ''), quote=True)}\"></video>" if item.get("candidateUri") else "<div class=\"missing\">No candidate video URI.</div>"
        warning = escape(str(item.get("warningSummary") or "No automated warnings. Still watch/listen."))
        theater_uri = file_uri(str(item.get("theaterPath") or ""))
        quality_uri = file_uri(str(item.get("qualityBriefPath") or ""))
        rehearsal_uri = file_uri(str(item.get("decisionRehearsalPath") or ""))
        evidence_uri = file_uri(str(item.get("evidencePath") or ""))
        context_paths = item.get("contextPaths") if isinstance(item.get("contextPaths"), dict) else {}
        transcript_uri = file_uri(str(context_paths.get("transcriptCockpitHtml") or ""))
        candidate_transcript_uri = file_uri(str(context_paths.get("candidateTranscriptMarkdown") or context_paths.get("candidateTranscriptJson") or ""))
        candidate_srt_uri = file_uri(str(context_paths.get("candidateCaptionDraftSrt") or ""))
        candidate_vtt_uri = file_uri(str(context_paths.get("candidateCaptionDraftVtt") or ""))
        semantic_uri = file_uri(str(context_paths.get("semanticQueueHtml") or ""))
        transcript_context = item.get("transcriptContext") if isinstance(item.get("transcriptContext"), dict) else {}
        semantic_context = item.get("semanticContext") if isinstance(item.get("semanticContext"), dict) else {}
        missing_context = item.get("missingContext") if isinstance(item.get("missingContext"), dict) else {}
        review_checklist = item.get("reviewChecklist") if isinstance(item.get("reviewChecklist"), list) else []
        platform_draft = item.get("platformDraft") if isinstance(item.get("platformDraft"), dict) else {}
        missing_actions = missing_context.get("actions") if isinstance(missing_context.get("actions"), list) else []
        missing_action_html = "".join(
            f"<div class=\"missing-action\"><strong>{escape(str(action.get('label') or ''), quote=False)}</strong><p>{escape(str(action.get('why') or ''), quote=False)}</p><code>{escape(str(action.get('command') or ''), quote=False)}</code><button class=\"copy context-copy\" data-command=\"{escape(str(action.get('command') or ''), quote=True)}\">Copy</button></div>"
            for action in missing_actions
            if isinstance(action, dict)
        )
        dry_runs = item.get("commandDryRuns") if isinstance(item.get("commandDryRuns"), dict) else {}
        dry_run_failed = sum(1 for result in dry_runs.values() if isinstance(result, dict) and (not result.get("ok") or result.get("ledgerMutated")))
        dry_run_label = "checked, no ledger mutation" if dry_runs and dry_run_failed == 0 else ("needs attention" if dry_runs else "not run")
        artifact_links = "".join(
            link
            for link in [
                f"<a href=\"{escape(theater_uri, quote=True)}\">Theater</a>" if theater_uri else "",
                f"<a href=\"{escape(quality_uri, quote=True)}\">Quality brief</a>" if quality_uri else "",
                f"<a href=\"{escape(rehearsal_uri, quote=True)}\">Decision rehearsal</a>" if rehearsal_uri else "",
                f"<a href=\"{escape(evidence_uri, quote=True)}\">Evidence</a>" if evidence_uri else "",
                f"<a href=\"{escape(transcript_uri, quote=True)}\">Transcript cockpit</a>" if transcript_uri else "",
                f"<a href=\"{escape(candidate_transcript_uri, quote=True)}\">Candidate transcript</a>" if candidate_transcript_uri else "",
                f"<a href=\"{escape(candidate_srt_uri, quote=True)}\">Draft SRT</a>" if candidate_srt_uri else "",
                f"<a href=\"{escape(candidate_vtt_uri, quote=True)}\">Draft VTT</a>" if candidate_vtt_uri else "",
                f"<a href=\"{escape(semantic_uri, quote=True)}\">Semantic queue</a>" if semantic_uri else "",
            ]
            if link
        )
        def copy_button(label: str, key: str, tone: str = "") -> str:
            command = str(commands.get(key) or "")
            disabled = " disabled" if not command else ""
            return f"<button class=\"copy {tone}\" data-command=\"{escape(command, quote=True)}\"{disabled}>{escape(label)}</button>"
        cards.append(f"""
        <article class="card">
          <div class="kicker">Episode {escape(str(item.get('episode')))} · {escape(str(item.get('readiness')))} · aligned {escape(str(item.get('surfaceAligned')))}</div>
          <h2>{escape(str(item.get('shortId')))}</h2>
          {video}
          <p><strong>Warning:</strong> {warning}</p>
          <p><strong>Command dry-run:</strong> {escape(dry_run_label)}</p>
          <p><strong>Missing-context next:</strong> {escape(str(missing_context.get('nextSafestAction') or 'No missing-context guidance generated.'))}</p>
          <section class="context-grid">
            <div>
              <h3>Words</h3>
              <p><strong>Status:</strong> {escape(str(transcript_context.get('status') or 'not linked'))}</p>
              <p><strong>Words/segments:</strong> {escape(str(transcript_context.get('wordCountApprox') or 0))} / {escape(str(transcript_context.get('segmentCount') or 0))}</p>
              <p><strong>Caption draft:</strong> {escape(str((transcript_context.get('candidateCaptionDraftReview') or {}).get('status') or 'not linked'))}</p>
              <blockquote>{escape(str(transcript_context.get('sample') or semantic_context.get('firstWords') or 'No transcript sample linked yet.'))}</blockquote>
              <p><strong>Next:</strong> {escape(str(transcript_context.get('nextSafestAction') or 'Use watch/listen until transcript context is linked.'))}</p>
            </div>
            <div>
              <h3>Edit feel</h3>
              <p><strong>Hook:</strong> {escape(str(semantic_context.get('hookState') or 'not linked'))}</p>
              <p><strong>Cadence:</strong> {escape(str(semantic_context.get('cadenceState') or 'not linked'))}</p>
              <p><strong>Scope:</strong> {escape(str(semantic_context.get('scope') or 'not linked'))}</p>
              <p><strong>Flags:</strong> {escape(', '.join(semantic_context.get('flags') or []) or 'none')}</p>
              <p><strong>Next:</strong> {escape(str(semantic_context.get('nextSafestAction') or 'Judge hook, cadence, ending, crop, and caption safety by watching/listening.'))}</p>
            </div>
          </section>
          <section class="missing-context-actions">
            <h3>Evidence repair commands</h3>
            {missing_action_html or '<p>No missing transcript or semantic context actions needed for this packet item.</p>'}
          </section>
          <section class="review-checklist">
            <h3>Watch/listen checklist</h3>
            {''.join(f"<div class='check'><strong>{escape(str(check.get('label') or ''), quote=False)} <span>{escape(str(check.get('status') or ''), quote=False)}</span></strong><p>{escape(str(check.get('prompt') or ''), quote=False)}</p><small>Evidence: {escape(str(check.get('evidence') or ''), quote=False)}</small><small>Tradeoff: {escape(str(check.get('tradeoff') or ''), quote=False)}</small></div>" for check in review_checklist if isinstance(check, dict)) or '<p>No checklist generated.</p>'}
          </section>
          <section class="platform-draft">
            <h3>Draft platform prep</h3>
            <p><strong>Status:</strong> {escape(str(platform_draft.get('status') or 'not generated'))}</p>
            <p><strong>Title:</strong> {escape(str(platform_draft.get('titleDraft') or ''))}</p>
            <p><strong>Hook:</strong> {escape(str(platform_draft.get('hookDraft') or ''))}</p>
            <p><strong>Hashtags:</strong> {escape(' '.join(platform_draft.get('hashtags') or []))}</p>
            <div class="platform-grid">
              {''.join(f"<div><strong>{escape(str(platform), quote=False)}</strong><p>{escape(str((draft or {}).get('check') or ''), quote=False)}</p><button class='copy context-copy' data-command='{escape(str((draft or {}).get('title') or (draft or {}).get('caption') or ''), quote=True)}'>Copy draft</button></div>" for platform, draft in (platform_draft.get('platforms') or {}).items() if isinstance(draft, dict)) or '<p>No platform drafts generated.</p>'}
            </div>
          </section>
          <p><strong>Watch/listen:</strong> {escape(str(item.get('watchListenExpectation') or 'Watch/listen before recording local review state.'))}</p>
          <p><strong>Next:</strong> {escape(str(item.get('nextSafestAction') or ''))}</p>
          <nav class="artifact-links">{artifact_links or '<span>No artifact links available.</span>'}</nav>
          <section class="review-actions">
            {copy_button('Copy KEEP after watch/listen', 'keepAfterWatchListen', 'keep')}
            {copy_button('Copy REFINE after watch/listen', 'refineAgainAfterWatchListen', 'refine')}
            {copy_button('Copy HOLD', 'hold', 'hold')}
            {copy_button('Copy REJECT after watch/listen', 'rejectAfterWatchListen', 'reject')}
          </section>
          <p class="path">Theater: {escape(str(item.get('theaterPath') or ''))}</p>
          <pre>{escape(str(commands.get('keepAfterWatchListen') or ''))}\n{escape(str(commands.get('refineAgainAfterWatchListen') or ''))}\n{escape(str(commands.get('hold') or ''))}\n{escape(str(commands.get('rejectAfterWatchListen') or ''))}</pre>
        </article>
        """)
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Quipsly short v002 human review packet</title>
  <style>
    :root {{ color-scheme: dark; --bg:#101915; --panel:#203129; --ink:#f8ecd1; --muted:#baad90; --gold:#dabe55; --leaf:#86ca91; }}
    body {{ margin:0; padding:32px; background:radial-gradient(circle at top left,#304a37,var(--bg)); color:var(--ink); font:15px/1.55 -apple-system,BlinkMacSystemFont,"Avenir Next",sans-serif; }}
    main {{ max-width:1180px; margin:0 auto; }}
    h1 {{ margin:0 0 8px; font-size:38px; letter-spacing:-.03em; }}
    .sub {{ color:var(--muted); margin:0 0 24px; }}
    .card {{ background:rgba(32,49,41,.93); border:1px solid rgba(218,190,85,.26); border-radius:26px; padding:22px; margin:20px 0; box-shadow:0 22px 70px rgba(0,0,0,.28); }}
    .kicker {{ color:var(--gold); text-transform:uppercase; letter-spacing:.14em; font-size:11px; font-weight:900; }}
    video {{ width:100%; max-height:720px; border-radius:18px; background:#090d0b; }}
    pre,.path {{ color:var(--muted); white-space:pre-wrap; word-break:break-all; background:rgba(0,0,0,.16); border-radius:14px; padding:12px; }}
    .missing {{ min-height:180px; display:grid; place-items:center; border:1px dashed rgba(248,236,209,.22); border-radius:18px; color:var(--muted); }}
    .artifact-links {{ display:flex; flex-wrap:wrap; gap:10px; margin:14px 0; }}
	    .artifact-links a {{ color:var(--ink); text-decoration:none; border:1px solid rgba(218,190,85,.32); background:rgba(218,190,85,.11); border-radius:999px; padding:7px 11px; font-weight:800; }}
	    .context-grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:12px; margin:14px 0; }}
	    .context-grid div {{ border:1px solid rgba(248,236,209,.14); background:rgba(0,0,0,.14); border-radius:18px; padding:14px; }}
	    .context-grid h3 {{ margin:0 0 8px; color:var(--gold); text-transform:uppercase; letter-spacing:.1em; font-size:12px; }}
	    blockquote {{ margin:10px 0; padding:10px 12px; border-left:4px solid var(--gold); border-radius:10px; background:rgba(218,190,85,.09); color:var(--ink); }}
	    .missing-context-actions {{ border:1px solid rgba(248,236,209,.14); border-radius:18px; padding:14px; background:rgba(206,109,80,.08); margin:14px 0; }}
	    .missing-context-actions h3 {{ margin:0 0 8px; color:var(--gold); text-transform:uppercase; letter-spacing:.1em; font-size:12px; }}
	    .missing-action {{ display:grid; gap:7px; border-top:1px solid rgba(248,236,209,.12); padding-top:10px; margin-top:10px; }}
	    .missing-action code {{ color:var(--ink); background:rgba(0,0,0,.2); border-radius:12px; padding:10px; word-break:break-all; }}
	    .review-checklist {{ border:1px solid rgba(134,202,145,.2); border-radius:18px; padding:14px; background:rgba(134,202,145,.08); margin:14px 0; }}
	    .review-checklist h3 {{ margin:0 0 8px; color:var(--leaf); text-transform:uppercase; letter-spacing:.1em; font-size:12px; }}
	    .check {{ border-top:1px solid rgba(248,236,209,.12); padding-top:10px; margin-top:10px; }}
	    .check strong {{ display:block; color:var(--ink); }}
	    .check span {{ color:var(--gold); font-size:11px; text-transform:uppercase; letter-spacing:.08em; }}
	    .check small {{ display:block; color:var(--muted); margin-top:5px; }}
	    .platform-draft {{ border:1px solid rgba(118,215,222,.22); border-radius:18px; padding:14px; background:rgba(118,215,222,.07); margin:14px 0; }}
	    .platform-draft h3 {{ margin:0 0 8px; color:#d9f4ff; text-transform:uppercase; letter-spacing:.1em; font-size:12px; }}
	    .platform-grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:10px; }}
	    .platform-grid div {{ border:1px solid rgba(248,236,209,.12); border-radius:14px; padding:10px; background:rgba(0,0,0,.13); }}
    .review-actions {{ display:flex; flex-wrap:wrap; gap:10px; margin:16px 0; }}
    button.copy {{ appearance:none; border:0; border-radius:999px; padding:10px 13px; color:var(--ink); background:rgba(248,236,209,.13); font-weight:900; cursor:pointer; }}
    button.copy:disabled {{ opacity:.45; cursor:not-allowed; }}
    button.copy.keep {{ background:rgba(134,202,145,.24); color:#d6ffdc; }}
    button.copy.refine {{ background:rgba(98,183,216,.22); color:#d9f4ff; }}
    button.copy.hold {{ background:rgba(218,190,85,.20); color:#fff3bb; }}
    button.copy.reject {{ background:rgba(206,109,80,.25); color:#ffd9cc; }}
    .toast {{ position:fixed; right:24px; bottom:24px; background:#1f3429; color:var(--ink); border:1px solid rgba(218,190,85,.5); border-radius:16px; padding:12px 16px; opacity:0; transform:translateY(10px); transition:.2s; box-shadow:0 18px 50px rgba(0,0,0,.32); }}
    .toast.show {{ opacity:1; transform:translateY(0); }}
  </style>
</head>
<body><main>
  <h1>Short v002 human review packet</h1>
  <p class="sub">Watch/listen with sound, then copy a local decision command. This packet does not approve or publish anything.</p>
  {''.join(cards)}
</main>
<div class="toast" id="toast">Copied review command</div>
<script>
  const toast = document.getElementById('toast');
  document.querySelectorAll('button.copy').forEach((button) => {{
    button.addEventListener('click', async () => {{
      const command = button.dataset.command || '';
      if (!command) return;
      try {{ await navigator.clipboard.writeText(command); }}
      catch (error) {{ window.prompt('Copy command:', command); }}
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 1400);
    }});
  }});
</script>
</body></html>
"""


def write_outputs(payload: dict[str, Any], output_dir: Path, basename: str, formats: set[str]) -> dict[str, str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    paths: dict[str, str] = {}
    if "json" in formats:
        paths["jsonPath"] = str(output_dir / f"{basename}.json")
    if "markdown" in formats:
        paths["markdownPath"] = str(output_dir / f"{basename}.md")
    if "html" in formats:
        paths["htmlPath"] = str(output_dir / f"{basename}.html")
    pointer = output_dir / "latest-short-v002-human-review-packet.json"
    paths["latestPointerJson"] = str(pointer)
    payload["outputPaths"] = paths
    if "jsonPath" in paths:
        Path(paths["jsonPath"]).write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    if "markdownPath" in paths:
        Path(paths["markdownPath"]).write_text(render_markdown(payload), encoding="utf-8")
    if "htmlPath" in paths:
        Path(paths["htmlPath"]).write_text(render_html(payload), encoding="utf-8")
    pointer.write_text(json.dumps(paths, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return paths


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a human/agent review packet for current v002 short candidates.")
    parser.add_argument("--short-id", action="append", default=[], help="Short id to include. Repeatable. Defaults to current queue.")
    parser.add_argument("--reviewer", default="Codex")
    parser.add_argument("--limit", type=int, default=12)
    parser.add_argument("--skip-transcript", action="store_true", help="Skip ASR transcript regeneration during the internal refresh.")
    parser.add_argument("--verify-commands", action="store_true", help="Dry-run generated local review commands and include the result in the packet.")
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR))
    parser.add_argument("--basename", default="")
    parser.add_argument("--format", choices=["markdown", "json", "html", "all"], default="markdown")
    parser.add_argument("--markdown", dest="format", action="store_const", const="markdown")
    parser.add_argument("--json", dest="format", action="store_const", const="json")
    parser.add_argument("--html", dest="format", action="store_const", const="html")
    parser.add_argument("--all", dest="format", action="store_const", const="all")
    args = parser.parse_args()
    payload = build_payload(args)
    basename = args.basename or f"{stamp_now()}-short-v002-human-review-packet"
    formats = {"json", "markdown", "html"} if args.format == "all" else {args.format}
    payload["outputPaths"] = write_outputs(payload, Path(args.output_dir).expanduser(), basename, formats)
    if args.format == "json":
        print(json.dumps(payload, indent=2, sort_keys=True))
    elif args.format == "html":
        print(render_html(payload))
    else:
        print(render_markdown(payload), end="")
    return 0 if payload.get("status") == "short-v002-human-review-packet-ready" else 1


if __name__ == "__main__":
    raise SystemExit(main())
