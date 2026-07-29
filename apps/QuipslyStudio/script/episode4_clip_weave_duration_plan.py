#!/usr/bin/env python3
"""Build an Episode 4 clip-weave and duration-option plan from live Studio state.

This is deliberately a planning/proof surface, not an edit applier. It answers:
- Do we have evidence that reference/b-roll/source clips are actually woven into
  the long-form program edit?
- Which duration variants should the editor create once the spine edit is
  credible?

It does not mutate source media, edit decisions, exports, or publication state.
"""

from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import URLError
from urllib.request import urlopen


DEFAULT_BASE_URL = "http://127.0.0.1:8080"
DEFAULT_OUTPUT_ROOT = Path("/Volumes/My Passport/Quipsly/QuipslyExports/EpisodeEditPlans")
DEFAULT_MEDIA_ROOT = Path("/Volumes/My Passport/Episode 4")
DEFAULT_TRANSCRIPT_WORKORDERS = Path("/Volumes/My Passport/Episode_and_Shorts_Test/review-board/transcript-source-workorders/latest-transcript-source-workorders-episode-04.json")
FALLBACK_TRANSCRIPT_WORKORDERS = Path("/Volumes/My Passport/Episode_and_Shorts_Test/review-board/transcript-source-workorders/latest-transcript-source-workorders.json")
DEFAULT_TRANSCRIPT_PILOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test/review-board/transcript-pilots/latest-transcript-pilot-episode-04.json")
MEDIA_EXTENSIONS = {".mp4", ".mov", ".m4a", ".mp3", ".wav", ".insv"}


def fetch_json(base_url: str, endpoint: str) -> dict[str, Any]:
    url = base_url.rstrip("/") + endpoint
    with urlopen(url, timeout=12) as response:  # noqa: S310 - local Studio agent endpoint
        return json.loads(response.read().decode("utf-8"))


def n(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def text_blob(value: Any) -> str:
    if isinstance(value, dict):
        return " ".join(f"{key} {text_blob(item)}" for key, item in value.items())
    if isinstance(value, list):
        return " ".join(text_blob(item) for item in value)
    return str(value or "")


def compact_time(seconds: float) -> str:
    seconds = max(0.0, seconds)
    minutes = int(seconds // 60)
    sec = int(round(seconds % 60))
    if minutes >= 60:
        return f"{minutes // 60}:{minutes % 60:02d}:{sec:02d}"
    return f"{minutes}:{sec:02d}"


def duration_ladder(sequence_duration: float) -> list[dict[str, Any]]:
    raw_minutes = sequence_duration / 60 if sequence_duration else 0
    return [
        {
            "id": "full-human-review",
            "branchName": "Episode 4 full review v001",
            "branchRole": "longform",
            "targetMinutes": [max(20, min(75, round(raw_minutes * 0.75))), max(30, min(90, round(raw_minutes * 0.9)))],
            "purpose": "A generous cut for internal review and podcast truth. Preserve nuance, reactions, and setup.",
            "bestFor": "Charlie/Homer/Mako review, Patreon/archive listeners, and finding the real episode shape before tightening.",
            "whatItKeeps": "Most of the conversation texture, context, reversals, relationship moments, and useful wandering.",
            "whatItCuts": "Only technical resets, obvious dead air, broken capture sections, duplicated setup, and sections everyone agrees are not serving the episode.",
            "tradeoff": "Best for completeness, weakest for viewer retention if pacing is loose.",
            "risk": "Can feel like an internal assembly cut if it is mistaken for the public discovery edit.",
            "reviewQuestion": "Is this long because the context is valuable, or long because we avoided deciding?",
            "firstEditorialMove": "Remove only obvious dead air, technical resets, and duplicate setup. Do not force punchiness yet.",
            "successProof": "A watchable review master with obvious resets removed and no source-media mutation.",
            "proofChecklist": [
                "A/V remains synced across the full review runtime.",
                "No obvious capture reset survives just because it was technically synced.",
                "Every source/watch clip insertion is understandable without Charlie explaining it live.",
            ],
        },
        {
            "id": "youtube-standard",
            "branchName": "Episode 4 YouTube standard 35-45 v001",
            "branchRole": "longform",
            "targetMinutes": [35, 45],
            "purpose": "Primary YouTube episode candidate once the conversation spine is stable.",
            "bestFor": "The main public YouTube upload, Spotify video, and a podcast feed version if the episode holds together at this length.",
            "whatItKeeps": "The core thesis, the best examples, the warmest reactions, and enough setup for a new viewer to trust the conversation.",
            "whatItCuts": "Repeated explanations, meandering setup, long search-for-the-point stretches, and source clips that do not clarify the idea.",
            "tradeoff": "Balances depth and watchability. Requires stronger segment choices and clean chapter shape.",
            "risk": "Can become choppy if we chase retention by cutting connective tissue instead of reshaping sections.",
            "reviewQuestion": "Would a new viewer understand why this episode matters and want Episode 5?",
            "firstEditorialMove": "Cut repeated explanations, use reactions for jump-cover, and weave source clips only where they clarify the idea.",
            "successProof": "A publish-candidate long-form cut with chapterable arcs, clean A/V sync, and source clips used only where they improve clarity.",
            "proofChecklist": [
                "Opening promise arrives quickly enough for YouTube.",
                "Each major section has a clear reason to remain.",
                "Jump cuts are covered with reactions, source clips, or intentional pacing instead of feeling accidental.",
            ],
        },
        {
            "id": "tight-youtube-feature",
            "branchName": "Episode 4 tight feature 22-30 v001",
            "branchRole": "longform",
            "targetMinutes": [22, 30],
            "purpose": "A more approachable version for new viewers or a highly focused topic arc.",
            "bestFor": "A discovery-friendly alternate upload, a test cut for pacing, or a focused feature if the full episode has too many branches.",
            "whatItKeeps": "One thesis arc, the sharpest examples, the strongest emotional turns, and only the source clips needed to land the point.",
            "whatItCuts": "Secondary tangents, background context that can move into description/chapters, and otherwise-good moments that belong as shorts.",
            "tradeoff": "More likely to hold attention, more likely to lose warmth/context if over-tightened.",
            "risk": "Can misrepresent the conversation if it removes too much uncertainty, discovery, or relational warmth.",
            "reviewQuestion": "Does this still feel like the real conversation, or like a highlight reel wearing a fake mustache?",
            "firstEditorialMove": "Choose one thesis arc, preserve the best emotional turns, and move background context into description/chapters.",
            "successProof": "A focused version with one clear thesis arc and documented tradeoffs for what was removed.",
            "proofChecklist": [
                "The episode can be summarized in one sentence after watching.",
                "Removed sections are either redundant, off-arc, or promoted to shorts.",
                "No speaker sounds unfairly clipped or artificially certain.",
            ],
        },
        {
            "id": "clip-weave-proof-cut",
            "branchName": "Episode 4 clip weave proof 8-12 v001",
            "branchRole": "experiment",
            "targetMinutes": [8, 12],
            "purpose": "A focused proof edit for testing b-roll/reference/source clip insertion without wrestling the whole episode.",
            "bestFor": "Testing the hard part: commentary, watched/source clip, reaction, and meaning all working together.",
            "whatItKeeps": "One complete source-clip loop: why we bring it in, what it shows, how we react, and what it means.",
            "whatItCuts": "Everything not needed to prove the clip-weave grammar.",
            "tradeoff": "Not the full episode, but ideal for proving the editor can weave clips cleanly.",
            "risk": "Can feel like a disconnected excerpt if it does not include enough setup and payoff.",
            "reviewQuestion": "Can someone watch this proof without knowing the full episode and still understand the point?",
            "firstEditorialMove": "Pick one watched/reference segment and build a clean commentary -> clip -> reaction -> meaning sequence.",
            "successProof": "A short horizontal proof cut where commentary, source clip, and reaction all play in the intended order.",
            "proofChecklist": [
                "At least one real source/reference clip lane is addressable.",
                "The source clip appears because it clarifies or intensifies the conversation.",
                "The return from source clip to reaction feels human, not mechanical.",
            ],
        },
        {
            "id": "shorts-family",
            "branchName": "Episode 4 shorts family v001",
            "branchRole": "short",
            "targetSeconds": [30, 45, 60, 90],
            "purpose": "Platform-native vertical variants from the same episode truth.",
            "bestFor": "YouTube Shorts, Instagram, Facebook, LinkedIn tests, and hook/pacing experiments.",
            "whatItKeeps": "One idea per short, a clear hook, enough setup to avoid confusion, and a payoff or useful tension.",
            "whatItCuts": "All long-form connective tissue unless the short needs one extra segment for meaning.",
            "tradeoff": "Each duration should have a different hook/pacing choice, not just a mechanically trimmed endpoint.",
            "risk": "Can become contextless dopamine confetti if every short is treated as a chopped endpoint.",
            "reviewQuestion": "Would this make someone want the show, or only understand one isolated quote?",
            "firstEditorialMove": "For each candidate, create a one-idea version first; only use multi-segment recipes when the turn/payoff improves.",
            "successProof": "At least one 30s, 45s, 60s, and 90s candidate with a visible hook, payoff, caption plan, and source range.",
            "proofChecklist": [
                "Each duration variant has its own reason to exist.",
                "Caption plan does not cover faces or kill the visual rhythm.",
                "The short links back to the long-form branch or source spine that created it.",
            ],
        },
    ]


def target_duration_bounds_seconds(item: dict[str, Any]) -> tuple[float | None, float | None]:
    minutes = item.get("targetMinutes")
    if isinstance(minutes, list) and minutes:
        values = [n(value) * 60 for value in minutes if n(value) > 0]
        if values:
            return min(values), max(values)
    seconds = item.get("targetSeconds")
    if isinstance(seconds, list) and seconds:
        values = [n(value) for value in seconds if n(value) > 0]
        if values:
            return min(values), max(values)
    return None, None


def target_duration_label(item: dict[str, Any]) -> str:
    if item.get("targetMinutes"):
        return "-".join(str(v) for v in item["targetMinutes"]) + " min"
    if item.get("targetSeconds"):
        return "/".join(str(v) for v in item["targetSeconds"]) + " sec"
    return "needs target"


def compression_summary(sequence_duration: float, item: dict[str, Any]) -> dict[str, Any]:
    low, high = target_duration_bounds_seconds(item)
    if not sequence_duration or low is None or high is None:
        return {
            "targetLabel": target_duration_label(item),
            "targetSecondsRange": None,
            "keepPercentRange": None,
            "removePercentRange": None,
            "cutPressure": "unknown",
        }
    low_keep = max(0.0, min(1.0, low / sequence_duration))
    high_keep = max(0.0, min(1.0, high / sequence_duration))
    center_keep = (low_keep + high_keep) / 2
    if center_keep >= 0.7:
        pressure = "light"
    elif center_keep >= 0.45:
        pressure = "medium"
    elif center_keep >= 0.2:
        pressure = "heavy"
    else:
        pressure = "short-form"
    return {
        "targetLabel": target_duration_label(item),
        "targetSecondsRange": [round(low, 3), round(high, 3)],
        "keepPercentRange": [round(low_keep * 100, 1), round(high_keep * 100, 1)],
        "removePercentRange": [round((1 - high_keep) * 100, 1), round((1 - low_keep) * 100, 1)],
        "cutPressure": pressure,
    }


def build_duration_choice_menu(
    sequence_duration: float,
    clip_weave: dict[str, Any],
    transcript_summary: dict[str, Any],
    media_inventory: dict[str, Any],
) -> list[dict[str, Any]]:
    """Build human-facing alternate runtime cards from the read-only plan truth."""
    has_clip_lanes = int(clip_weave.get("clipLikeLaneCount") or 0) > 0
    has_production_lanes = int(clip_weave.get("productionVideoLaneCount") or 0) > 0
    transcript_ready = transcript_summary.get("status") == "ready"
    media_scanned = media_inventory.get("status") == "scanned"
    menu: list[dict[str, Any]] = []
    for item in duration_ladder(sequence_duration):
        blockers: list[str] = []
        cautions: list[str] = []
        if not has_production_lanes and item.get("branchRole") != "short":
            blockers.append("No production video lanes are available in the live session.")
        if item["id"] == "clip-weave-proof-cut" and not has_clip_lanes:
            cautions.append("No real reference/source clip lane is addressable yet; import one before judging clip-weave quality.")
        if item["id"] in {"youtube-standard", "tight-youtube-feature", "shorts-family"} and not transcript_ready:
            cautions.append("Transcript timing is not ready; rhythm/J-cut/L-cut decisions will be weaker until ASR is imported.")
        if media_scanned and media_inventory.get("unattachedMediaFileCount", 0) == 0 and item["id"] == "clip-weave-proof-cut":
            cautions.append("The Episode 4 folder scan found no unattached local source clips.")
        compression = compression_summary(sequence_duration, item)
        status = "ready-to-plan" if not blockers else "blocked"
        if not blockers and cautions:
            status = "plan-with-cautions"
        menu.append({
            "id": item["id"],
            "status": status,
            "branchName": item["branchName"],
            "branchRole": item["branchRole"],
            "target": compression["targetLabel"],
            "compression": compression,
            "bestFor": item.get("bestFor"),
            "whatItKeeps": item.get("whatItKeeps"),
            "whatItCuts": item.get("whatItCuts"),
            "tradeoff": item.get("tradeoff"),
            "risk": item.get("risk"),
            "reviewQuestion": item.get("reviewQuestion"),
            "proofChecklist": item.get("proofChecklist") or [],
            "blockers": blockers,
            "cautions": cautions,
            "nextAction": item.get("firstEditorialMove"),
        })
    return menu


def scan_media_root(media_root: Path | None, state: dict[str, Any]) -> dict[str, Any]:
    if media_root is None:
        return {
            "status": "not-scanned",
            "root": "",
            "mediaFileCount": 0,
            "unattachedMediaFileCount": 0,
            "possibleSourceClipCount": 0,
            "truth": "No media root was provided.",
        }

    root = media_root.expanduser()
    if not root.exists():
        return {
            "status": "missing-root",
            "root": str(root),
            "mediaFileCount": 0,
            "unattachedMediaFileCount": 0,
            "possibleSourceClipCount": 0,
            "truth": "The media root does not exist or the external drive is not mounted.",
        }

    lane_paths = {
        str(lane.get("sourcePath") or "")
        for lane in (state.get("sourceLaneInventory") or state.get("lanes") or [])
        if isinstance(lane, dict)
    }
    media_files: list[dict[str, Any]] = []
    for path in sorted(root.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in MEDIA_EXTENSIONS:
            continue
        lower_name = path.name.lower()
        looks_like_source = any(term in lower_name for term in ["youtube", "clip", "source", "reference", "watch", "broll", "b-roll"])
        media_files.append({
            "path": str(path),
            "name": path.name,
            "extension": path.suffix.lower(),
            "isAlreadyLaneSource": str(path) in lane_paths,
            "looksLikeSourceClip": looks_like_source,
            "sizeBytes": path.stat().st_size,
        })

    unattached = [item for item in media_files if not item["isAlreadyLaneSource"]]
    possible_source = [item for item in media_files if item["looksLikeSourceClip"]]
    return {
        "status": "scanned",
        "root": str(root),
        "mediaFileCount": len(media_files),
        "attachedMediaFileCount": len(media_files) - len(unattached),
        "unattachedMediaFileCount": len(unattached),
        "possibleSourceClipCount": len(possible_source),
        "unattachedMediaFiles": unattached[:24],
        "possibleSourceClipFiles": possible_source[:24],
        "truth": "This scans local filenames only. It does not import, relink, probe, edit, export, or mutate media.",
    }


def load_episode_transcript_summary(workorders_path: Path | None, episode: int = 4) -> dict[str, Any]:
    if workorders_path is None:
        return {
            "status": "not-linked",
            "path": "",
            "truth": "No transcript workorder path was provided.",
        }
    path = workorders_path.expanduser()
    if not path.exists():
        return {
            "status": "missing-workorders",
            "path": str(path),
            "truth": "Generate transcript source workorders before relying on transcript timing for cut intelligence.",
        }
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        return {
            "status": "unreadable-workorders",
            "path": str(path),
            "error": str(exc),
            "truth": "Transcript workorder summary could not be read; no transcript state was mutated.",
        }

    episode_packet = None
    for item in payload.get("episodes") or []:
        if item.get("episode") == episode:
            episode_packet = item
            break
    if not episode_packet:
        return {
            "status": "episode-not-found",
            "path": str(path),
            "episode": episode,
            "truth": "Transcript workorders exist, but no matching Episode 4 packet was found.",
        }

    sources = episode_packet.get("sources") or []
    high_priority = [
        source for source in sources
        if int(source.get("transcriptionPriority") or 9) <= 2
    ]
    preferred = []
    for source in high_priority:
        duration = n(source.get("durationSeconds"))
        if duration < 30:
            continue
        preferred.append({
            "mediaId": source.get("mediaId"),
            "fileName": source.get("fileName"),
            "path": source.get("path"),
            "sourceKind": source.get("sourceKind"),
            "priority": source.get("transcriptionPriority"),
            "durationLabel": source.get("durationLabel"),
            "durationSeconds": source.get("durationSeconds"),
            "valueNote": source.get("valueNote"),
            "plannedSrtPath": (source.get("transcriptOutputPlan") or {}).get("sidecarSrtPath"),
            "providerCommandTemplate": (source.get("transcriptOutputPlan") or {}).get("providerCommandTemplate"),
        })
    counts = episode_packet.get("counts") or {}
    return {
        "status": "ready",
        "path": str(path),
        "episode": episode,
        "counts": counts,
        "providerAvailable": (payload.get("providerDoctor") or {}).get("available"),
        "providerDoctorPath": (payload.get("providerDoctor") or {}).get("path"),
        "preferredSourceCount": len(preferred),
        "preferredSources": preferred[:12],
        "nextSafestAction": "Run ASR on the preferred full-length/high-quality sources first, then reconcile one transcript spine before aggressive cadence edits.",
        "truth": "Transcript workorders are inventory only unless a provider command is explicitly run. No transcript was imported by this plan.",
    }


def load_episode_transcript_pilot_summary(pilot_path: Path | None, episode: int = 4) -> dict[str, Any]:
    if pilot_path is None:
        return {
            "status": "not-linked",
            "path": "",
            "truth": "No transcript pilot pointer was provided.",
        }
    path = pilot_path.expanduser()
    if not path.exists():
        return {
            "status": "missing-pilot",
            "path": str(path),
            "truth": "No Episode 4 transcript pilot has been run yet.",
        }
    try:
        pointer = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        return {
            "status": "unreadable-pilot-pointer",
            "path": str(path),
            "error": str(exc),
            "truth": "Transcript pilot pointer could not be read; no transcript state was mutated.",
        }
    payload_path = Path(str(pointer.get("jsonPath") or path))
    try:
        payload = json.loads(payload_path.read_text(encoding="utf-8"))
    except Exception as exc:
        return {
            "status": "unreadable-pilot-payload",
            "path": str(path),
            "jsonPath": str(payload_path),
            "error": str(exc),
            "truth": "Transcript pilot payload could not be read; no transcript state was mutated.",
        }

    selected = payload.get("selectedSource") if isinstance(payload.get("selectedSource"), dict) else {}
    execution = payload.get("executionSource") if isinstance(payload.get("executionSource"), dict) else {}
    counts = payload.get("counts") if isinstance(payload.get("counts"), dict) else {}
    normalized_path = Path(str(payload.get("normalizedTranscriptJsonPath") or ""))
    normalized: dict[str, Any] = {}
    segments: list[dict[str, Any]] = []
    if normalized_path.exists():
        try:
            normalized = json.loads(normalized_path.read_text(encoding="utf-8"))
            segments = [row for row in (normalized.get("segments") or []) if isinstance(row, dict)]
        except Exception:
            normalized = {}

    source = normalized.get("source") if isinstance(normalized.get("source"), dict) else {}
    is_excerpt = bool(source.get("isManagedExcerpt") or execution.get("isManagedExcerpt"))
    status = "pilot-excerpt-ready" if is_excerpt else "pilot-ready"
    if payload.get("status") not in {"transcript-pilot-executed", "transcript-pilot-needs-review"}:
        status = str(payload.get("status") or "pilot-needs-review")
    return {
        "status": status,
        "path": str(path),
        "jsonPath": str(payload_path),
        "htmlPath": payload.get("htmlPath"),
        "normalizedTranscriptJsonPath": str(normalized_path) if normalized_path else "",
        "selectedSource": {
            "episode": selected.get("episode") or episode,
            "sourceKind": selected.get("sourceKind"),
            "fileName": selected.get("fileName"),
            "sourcePath": selected.get("sourcePath"),
            "durationSeconds": selected.get("durationSeconds"),
        },
        "executionSource": {
            "fileName": execution.get("fileName"),
            "sourcePath": execution.get("sourcePath"),
            "durationSeconds": execution.get("durationSeconds"),
            "isManagedExcerpt": bool(execution.get("isManagedExcerpt")),
            "originalSourcePath": execution.get("originalSourcePath") or source.get("originalSourcePath"),
            "excerptStartSeconds": execution.get("excerptStartSeconds") if execution.get("excerptStartSeconds") is not None else source.get("excerptStartSeconds"),
            "excerptDurationSeconds": execution.get("excerptDurationSeconds") if execution.get("excerptDurationSeconds") is not None else source.get("excerptDurationSeconds"),
        },
        "counts": {
            "asrRun": counts.get("asrRun"),
            "segments": counts.get("segments") or (normalized.get("counts") or {}).get("segments") or len(segments),
            "words": counts.get("words") or (normalized.get("counts") or {}).get("words"),
        },
        "firstSegments": [
            {
                "start": row.get("start"),
                "end": row.get("end"),
                "speaker": row.get("speaker"),
                "text": row.get("text"),
            }
            for row in segments[:5]
        ],
        "nextSafestAction": "Use this pilot as ASR-pipeline proof only; run full-source ASR before transcript-driven pacing, J-cut, L-cut, and silence-tightening decisions.",
        "truth": "Transcript pilot evidence only. It is not a reconciled full Episode 4 transcript and has not been imported as canonical transcript truth.",
    }


def build_edit_variant_recipes(
    sequence_duration: float,
    duration_menu: list[dict[str, Any]],
    clip_weave: dict[str, Any],
    transcript_summary: dict[str, Any],
    transcript_pilot: dict[str, Any],
) -> list[dict[str, Any]]:
    transcript_status = transcript_summary.get("status")
    pilot_status = transcript_pilot.get("status")
    has_full_transcript_runway = transcript_status == "ready"
    has_pilot = str(pilot_status or "").startswith("pilot")
    has_clip_lanes = int(clip_weave.get("clipLikeLaneCount") or 0) > 0
    recipes: list[dict[str, Any]] = []
    for item in duration_menu:
        variant_id = str(item.get("id") or "")
        compression = item.get("compression") or {}
        cut_pressure = str(compression.get("cutPressure") or "unknown")
        if variant_id == "full-human-review":
            cut_passes = [
                "Remove only obvious technical resets, duplicated setup, and true dead air.",
                "Preserve relationship warmth, uncertainty, thinking time, and context even when it is not maximally punchy.",
                "Mark unclear stretches with review notes instead of forcing aggressive cuts.",
            ]
            technique_focus = ["quiet-gap-proof", "do-not-cut-signals", "review-note-routing"]
        elif variant_id == "youtube-standard":
            cut_passes = [
                "Shape the opening promise quickly without making the hosts sound artificially certain.",
                "Use reaction covers for harsh same-speaker jumps and only use J/L cuts when the reply rhythm improves by ear.",
                "Move repeated explanations into summaries, chapters, or shorts candidates rather than deleting meaning.",
            ]
            technique_focus = ["reaction-cover", "j-cut", "l-cut", "cadence-preservation"]
        elif variant_id == "tight-youtube-feature":
            cut_passes = [
                "Choose one thesis arc and remove side arcs even when they are good on their own.",
                "Prefer fewer stronger source-clip inserts over a dense montage.",
                "Audit every removed pause for thought, laugh timing, or emotional reset before tightening.",
            ]
            technique_focus = ["thesis-arc", "context-cover", "quiet-gap-proof", "jump-cut-risk"]
        elif variant_id == "clip-weave-proof-cut":
            cut_passes = [
                "Build one commentary -> source clip -> reaction -> meaning loop.",
                "Keep the podcast audio spine unless the source clip audio is explicitly part of the story.",
                "Return to a human reaction before explaining the takeaway whenever the moment needs warmth.",
            ]
            technique_focus = ["context-cover", "reaction-cover", "clip-audio-policy", "meaning-loop"]
        else:
            cut_passes = [
                "Create separate 30, 45, 60, and 90 second recipes instead of trimming one endpoint mechanically.",
                "Start with one idea, one hook, one payoff, and captions that do not cover faces.",
                "Use multi-segment shorts only when the turn/payoff improves enough to justify the extra complexity.",
            ]
            technique_focus = ["hook", "payoff", "caption-safety", "shorts-duration-family"]

        readiness_notes: list[str] = []
        if not has_full_transcript_runway:
            readiness_notes.append("Transcript source workorders are not ready; transcript-aware cuts should wait.")
        elif not has_pilot:
            readiness_notes.append("Transcript source inventory exists, but ASR has not been pilot-proven yet.")
        elif transcript_pilot.get("status") == "pilot-excerpt-ready":
            readiness_notes.append("ASR is pilot-proven on an excerpt only; run full-source ASR before automating cadence decisions across the whole branch.")
        if variant_id == "clip-weave-proof-cut" and not has_clip_lanes:
            readiness_notes.append("No addressable source/reference clip lane is visible yet; attach real watched/source clips before calling the weave proof complete.")
        if cut_pressure in {"heavy", "short-form"}:
            readiness_notes.append("High compression pressure: protect cadence and speaker fairness by listening before applying each major deletion.")

        recipes.append({
            "schema": "quipsly.edit-variant-recipe.v1",
            "variantId": variant_id,
            "branchName": item.get("branchName"),
            "target": item.get("target"),
            "branchRole": item.get("branchRole"),
            "status": "ready-for-human-agent-draft" if not item.get("blockers") else "blocked",
            "sourceSpinePolicy": "Use one synced Episode 4 source spine. Store this as metadata decisions; do not duplicate, chop, or mutate source files.",
            "sequenceDurationSeconds": sequence_duration,
            "cutPressure": cut_pressure,
            "humanTradeoff": {
                "bestFor": item.get("bestFor"),
                "keeps": item.get("whatItKeeps"),
                "cuts": item.get("whatItCuts"),
                "tradeoff": item.get("tradeoff"),
                "risk": item.get("risk"),
                "reviewQuestion": item.get("reviewQuestion"),
            },
            "cutTechniqueFocus": technique_focus,
            "firstPassCutPasses": cut_passes,
            "readinessNotes": readiness_notes,
            "reviewChecklist": item.get("proofChecklist") or [],
            "transcriptEvidence": {
                "workorderStatus": transcript_summary.get("status"),
                "pilotStatus": transcript_pilot.get("status"),
                "pilotSegments": (transcript_pilot.get("counts") or {}).get("segments"),
                "pilotWords": (transcript_pilot.get("counts") or {}).get("words"),
                "pilotTruth": transcript_pilot.get("truth"),
            },
            "nextAgentMove": item.get("nextAction"),
            "truth": "Recipe only. It is not an applied edit, export, approval, publication, upload, schedule, overwrite, or source mutation.",
        })
    return recipes


def classify_clip_weave(state: dict[str, Any]) -> dict[str, Any]:
    blob = text_blob(state).lower()
    source_terms = ["reference clip", "b-roll", "broll", "youtube", "source clip", "clip insertion", "watched clip"]
    source_mentions = {term: blob.count(term) for term in source_terms if blob.count(term)}

    cut_report = state.get("cutIntelligenceReport") or state.get("cutIntelligence") or {}
    cut_blob = text_blob(cut_report).lower()
    branch = state.get("branchTruth") or {}
    shorts = ((state.get("shortClipQueue") or {}).get("clips") or [])
    selected_short = state.get("selectedShortClip") or {}
    lane_inventory = state.get("sourceLaneInventory") or state.get("lanes") or []
    clip_like_lanes: list[dict[str, Any]] = []
    production_video_lanes: list[dict[str, Any]] = []
    held_review_lanes: list[dict[str, Any]] = []
    if isinstance(lane_inventory, list):
        for lane in lane_inventory:
            if not isinstance(lane, dict):
                continue
            name = str(lane.get("laneName") or lane.get("name") or "")
            role = str(lane.get("role") or "")
            source_path = str(lane.get("sourcePath") or "")
            media_kind = str(lane.get("mediaKind") or "")
            haystack = " ".join([name, role, source_path]).lower()
            if any(term in haystack for term in ["reference", "source_clip", "source clip", "b-roll", "broll", "clip", "youtube"]):
                clip_like_lanes.append({
                    "laneId": lane.get("laneId") or lane.get("id") or "",
                    "laneName": name,
                    "role": role,
                    "mediaKind": lane.get("mediaKind") or "",
                    "readiness": lane.get("readiness") or "",
                    "isReady": lane.get("isReady"),
                    "durationSeconds": lane.get("durationSeconds"),
                    "offsetSeconds": lane.get("offsetSeconds"),
                    "showDecisionCount": lane.get("showDecisionCount"),
                    "skipDecisionCount": lane.get("skipDecisionCount"),
                    "sourceMonitorPlayerReady": lane.get("sourceMonitorPlayerReady"),
                })
            if media_kind == "video" and any(term in role.lower() for term in ["charlie", "homer", "camera", "360"]):
                production_video_lanes.append({
                    "laneId": lane.get("laneId") or lane.get("id") or "",
                    "laneName": name,
                    "role": role,
                    "readiness": lane.get("readiness") or "",
                    "isReady": lane.get("isReady"),
                    "durationSeconds": lane.get("durationSeconds"),
                    "offsetSeconds": lane.get("offsetSeconds"),
                    "showDecisionCount": lane.get("showDecisionCount"),
                    "skipDecisionCount": lane.get("skipDecisionCount"),
                })
            if str(lane.get("isReady")).lower() == "false" or "held" in role.lower():
                held_review_lanes.append({
                    "laneId": lane.get("laneId") or lane.get("id") or "",
                    "laneName": name,
                    "role": role,
                    "mediaKind": media_kind,
                    "readiness": lane.get("readiness") or "",
                    "recoveryNextAction": lane.get("recoveryNextAction") or "",
                })

    explicit_weave_signals = [
        term
        for term in ["b-roll", "clip cover", "reference", "source clip", "reaction cover"]
        if term in cut_blob
    ]
    segment_counts = [len(item.get("segments") or []) for item in shorts if isinstance(item, dict)]
    multi_segment_shorts = sum(1 for count in segment_counts if count > 1)

    if explicit_weave_signals and multi_segment_shorts:
        status = "clip-weave-evidence-present"
        verdict = "Some clip-weave evidence is present, but it still needs visual/listen proof before calling it good."
    elif explicit_weave_signals or source_mentions:
        status = "clip-sources-visible-not-proven-woven"
        verdict = "Clip/source material appears in state, but current evidence does not prove it is edited into the long-form program well."
    else:
        status = "no-clip-weave-proof"
        verdict = "Current state proves a synced/editable episode branch and shorts queue, not successful external clip weaving."

    return {
        "status": status,
        "verdict": verdict,
        "sourceMentionCounts": source_mentions,
        "explicitWeaveSignals": explicit_weave_signals,
        "addressableLaneInventoryCount": len(lane_inventory) if isinstance(lane_inventory, list) else 0,
        "clipLikeLaneCount": len(clip_like_lanes),
        "clipLikeLanes": clip_like_lanes[:12],
        "productionVideoLaneCount": len(production_video_lanes),
        "productionVideoLanes": production_video_lanes[:12],
        "heldReviewLaneCount": len(held_review_lanes),
        "heldReviewLanes": held_review_lanes[:12],
        "shortRecipeCount": len(shorts),
        "multiSegmentShortCount": multi_segment_shorts,
        "selectedShort": {
            "title": selected_short.get("title"),
            "reviewStatus": selected_short.get("reviewStatus"),
            "duration": selected_short.get("duration"),
            "segmentCount": len(selected_short.get("segments") or []),
        },
        "branch": {
            "name": branch.get("branchName") or state.get("activeSessionName"),
            "role": branch.get("branchRole"),
            "truth": branch.get("truth"),
        },
    }


def build_plan(base_url: str, media_root: Path | None, transcript_workorders_path: Path | None, transcript_pilot_path: Path | None) -> dict[str, Any]:
    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    try:
        state = fetch_json(base_url, "/state")
    except (URLError, TimeoutError, json.JSONDecodeError, OSError) as exc:
        return {
            "model": "quipslystudio-episode4-clip-weave-duration-plan",
            "status": "state-unavailable",
            "generatedAt": generated_at,
            "error": str(exc),
            "nextActions": ["Launch Quipsly Studio and load Episode 4, then rerun this plan."],
            "truth": "No edit state was changed.",
        }

    sequence_duration = n(state.get("sequenceDuration"))
    clip_weave = classify_clip_weave(state)
    media_inventory = scan_media_root(media_root, state)
    transcript_summary = load_episode_transcript_summary(transcript_workorders_path, episode=4)
    transcript_pilot = load_episode_transcript_pilot_summary(transcript_pilot_path, episode=4)
    duration_choice_menu = build_duration_choice_menu(sequence_duration, clip_weave, transcript_summary, media_inventory)
    edit_variant_recipes = build_edit_variant_recipes(sequence_duration, duration_choice_menu, clip_weave, transcript_summary, transcript_pilot)
    cut_report = state.get("cutIntelligenceReport") or state.get("cutIntelligence") or {}
    craft = cut_report.get("craftProfile") if isinstance(cut_report, dict) else {}
    cadence_warnings = cut_report.get("cadenceWarnings") if isinstance(cut_report, dict) else []

    next_actions = [
        "Treat Episode 4 as synced/editable but not clip-weave-proven yet.",
        "Create a focused clip-weave proof branch before attempting a full episode weave.",
        "Use the 8-12 minute proof cut to test commentary -> source clip -> reaction -> meaning flow.",
        "Once clip-weave proof is credible, create 35-45 minute and 22-30 minute long-form variants as separate metadata branches.",
        "Keep 30/45/60/90 second short families as platform tests, not mechanical trims.",
    ]
    if clip_weave.get("clipLikeLaneCount", 0) > 0:
        next_actions.insert(2, "Use the addressable clip-like lane inventory below as the first source-candidate list; do not guess lane names from screen position.")
    elif clip_weave.get("addressableLaneInventoryCount", 0) > 0:
        next_actions.insert(2, "No actual source/reference clip lanes are currently addressable. Import or attach the watched/source clips before judging clip-weave quality.")
        if media_inventory.get("status") == "scanned" and media_inventory.get("unattachedMediaFileCount", 0) == 0:
            next_actions.insert(3, f"The scanned Episode 4 media root has no unattached media files. Add/download source clips into {media_inventory.get('root')} or a dedicated source-clips folder, then import them as reference/source lanes.")
        elif media_inventory.get("unattachedMediaFileCount", 0) > 0:
            next_actions.insert(3, "Review unattached local media below; import true watched/source clips as whole source lanes before placing weave decisions.")
    else:
        next_actions.insert(2, "Source lane inventory is still missing. Reload Episode 4 and require nonzero laneCount before placing clip-weave decisions.")
    if isinstance(craft, dict) and craft.get("transcriptCoverageStatus") == "missing":
        next_actions.insert(0, "Generate transcript timing before making aggressive J/L cut or cadence decisions.")
        if transcript_summary.get("status") == "ready":
            next_actions.insert(1, "Use the Episode 4 transcript workorder preferred sources below; start with full-length/high-quality audio before video scratch tracks.")
    if cadence_warnings:
        next_actions.insert(0, f"Review {len(cadence_warnings)} cadence warning(s) before tightening the Episode 4 spine.")

    not_proven = "not-proven" in clip_weave["status"] or clip_weave["status"] == "no-clip-weave-proof"
    return {
        "model": "quipslystudio-episode4-clip-weave-duration-plan",
        "status": "needs-clip-weave-proof" if not_proven else "clip-weave-review",
        "generatedAt": generated_at,
        "episode": "episode-4",
        "activeSessionName": state.get("activeSessionName"),
        "sequenceTitle": state.get("sequenceTitle"),
        "sequenceDurationSeconds": sequence_duration,
        "sequenceDurationLabel": compact_time(sequence_duration),
        "laneCount": state.get("laneCount"),
        "mediaBinCount": state.get("mediaBinCount"),
        "monitorWallModel": state.get("monitorWallModel"),
        "sourceMonitorLayout": state.get("sourceMonitorLayout"),
        "clipWeaveAssessment": clip_weave,
        "externalMediaInventory": media_inventory,
        "transcriptWorkorderSummary": transcript_summary,
        "transcriptPilotSummary": transcript_pilot,
        "durationLadder": duration_ladder(sequence_duration),
        "durationChoiceMenu": duration_choice_menu,
        "editVariantRecipes": edit_variant_recipes,
        "durationStrategy": {
            "model": "branch-recipes-over-one-synced-spine",
            "truth": "Multiple lengths should be separate metadata branches or recipes over the same synced source spine. They must not duplicate, chop, or mutate source media.",
            "recommendedOrder": [
                "clip-weave-proof-cut",
                "youtube-standard",
                "tight-youtube-feature",
                "full-human-review",
                "shorts-family",
            ],
            "why": "The proof cut de-risks source clip insertion first; then the standard and tight versions become editorial choices instead of rescue operations.",
        },
        "cutIntelligenceSummary": {
            "cadenceMode": cut_report.get("cadenceMode") if isinstance(cut_report, dict) else None,
            "cutTypeCounts": cut_report.get("cutTypeCounts") if isinstance(cut_report, dict) else {},
            "cadenceWarningCount": len(cadence_warnings or []),
            "transcriptCoverageStatus": craft.get("transcriptCoverageStatus") if isinstance(craft, dict) else None,
            "humanFlowStance": craft.get("humanFlowStance") if isinstance(craft, dict) else None,
        },
        "nextActions": next_actions,
        "safeCommands": {
            "createClipWeaveBranch": 'script/agentctl.sh create-branch "Episode 4 clip weave proof v001" experiment "8-12 minute source-clip weave proof; metadata only"',
            "createYouTubeStandardBranch": 'script/agentctl.sh create-branch "Episode 4 YouTube standard 35-45 v001" longform "Primary 35-45 minute YouTube branch over the same synced spine"',
            "createTightFeatureBranch": 'script/agentctl.sh create-branch "Episode 4 tight feature 22-30 v001" longform "Focused 22-30 minute branch over the same synced spine"',
            "createFullReviewBranch": 'script/agentctl.sh create-branch "Episode 4 full review v001" longform "Generous review branch preserving context before tightening"',
            "createShortsFamilyBranch": 'script/agentctl.sh create-branch "Episode 4 shorts family v001" short "30/45/60/90 second vertical variants over the same synced spine"',
            "importSourceClipTemplate": "script/agentctl.sh import /absolute/path/to/source-or-reference-clip.mp4 && script/agentctl.sh lane-role \"imported lane name\" reference_clip",
            "transcriptWorkorders": "script/experimental/build_episode_transcript_source_workorders.py",
            "transcriptPilot": "script/agentctl.sh studio-transcript-pilot --episode 4 --execute --timeout 900",
            "transcriptProviderDoctor": "script/local_transcript_provider.py --doctor",
            "cutRhythmAudit": "script/agentctl.sh cut-rhythm-audit --markdown",
            "selectedShortRhythmPlan": "script/agentctl.sh selected-short-rhythm-refinement-plan --save --markdown",
            "durationMatrix": "script/agentctl.sh studio-duration-experiment-matrix",
        },
        "truth": "Read-only plan. It does not edit, export, publish, overwrite, or mutate source media.",
    }


def render_markdown(plan: dict[str, Any]) -> str:
    lines = [
        "# Episode 4 Clip-Weave + Duration Plan",
        "",
        f"- Status: `{plan.get('status')}`",
        f"- Session: {plan.get('activeSessionName') or 'unknown'}",
        f"- Sequence: {plan.get('sequenceTitle') or 'unknown'}",
        f"- Duration: {plan.get('sequenceDurationLabel')} ({plan.get('sequenceDurationSeconds')}s)",
        f"- Lanes/media: {plan.get('laneCount')} lanes / {plan.get('mediaBinCount')} media items",
        "",
        "## Clip-weave verdict",
    ]
    assessment = plan.get("clipWeaveAssessment") or {}
    lines.append(f"- Verdict: {assessment.get('verdict')}")
    lines.append(f"- Status: `{assessment.get('status')}`")
    lines.append(f"- Multi-segment shorts: {assessment.get('multiSegmentShortCount')} / {assessment.get('shortRecipeCount')}")
    lines.append(f"- Addressable lane inventory: {assessment.get('addressableLaneInventoryCount')}")
    lines.append(f"- Clip-like lanes: {assessment.get('clipLikeLaneCount')}")
    lines.append(f"- Production video lanes: {assessment.get('productionVideoLaneCount')}")
    lines.append(f"- Held/review lanes: {assessment.get('heldReviewLaneCount')}")
    mentions = assessment.get("sourceMentionCounts") or {}
    lines.append(f"- Source/clip mention counts: {', '.join(f'{k}={v}' for k, v in mentions.items()) or 'none'}")

    if assessment.get("productionVideoLanes"):
        lines.extend(["", "## Synced production video lanes"])
        for lane in assessment.get("productionVideoLanes") or []:
            lines.append(
                f"- `{lane.get('laneId')}` {lane.get('laneName')} "
                f"role `{lane.get('role')}` ready `{lane.get('isReady')}` "
                f"offset {lane.get('offsetSeconds')}s SHOW/SKIP {lane.get('showDecisionCount')}/{lane.get('skipDecisionCount')}"
            )

    if assessment.get("clipLikeLanes"):
        lines.extend(["", "## Candidate clip/source lanes"])
        for lane in assessment.get("clipLikeLanes") or []:
            lines.append(
                f"- `{lane.get('laneId')}` {lane.get('laneName')} "
                f"role `{lane.get('role')}` ready `{lane.get('isReady')}` "
                f"SHOW/SKIP {lane.get('showDecisionCount')}/{lane.get('skipDecisionCount')}"
            )
    else:
        lines.extend([
            "",
            "## Candidate clip/source lanes",
            "- None are addressable in the live session yet. The episode can be edited from the synced cameras/audio now, but source/watched clips still need to be imported or attached before a real clip-weave pass.",
        ])

    if assessment.get("heldReviewLanes"):
        lines.extend(["", "## Held/review lanes"])
        for lane in assessment.get("heldReviewLanes") or []:
            lines.append(
                f"- `{lane.get('laneId')}` {lane.get('laneName')} "
                f"role `{lane.get('role')}` kind `{lane.get('mediaKind')}` readiness `{lane.get('readiness')}`"
            )

    media_inventory = plan.get("externalMediaInventory") or {}
    lines.extend([
        "",
        "## External Episode 4 media scan",
        f"- Status: `{media_inventory.get('status')}`",
        f"- Root: {media_inventory.get('root') or 'not provided'}",
        f"- Media files: {media_inventory.get('mediaFileCount', 0)}",
        f"- Already attached to lanes: {media_inventory.get('attachedMediaFileCount', 0)}",
        f"- Unattached media files: {media_inventory.get('unattachedMediaFileCount', 0)}",
        f"- Filename-likely source clips: {media_inventory.get('possibleSourceClipCount', 0)}",
        f"- Truth: {media_inventory.get('truth')}",
    ])
    if media_inventory.get("unattachedMediaFiles"):
        lines.append("- Unattached candidates:")
        for item in media_inventory.get("unattachedMediaFiles") or []:
            lines.append(f"  - `{item.get('path')}`")
    elif media_inventory.get("status") == "scanned":
        lines.append("- No unattached local media files were found in this root. If source clips exist, they are probably outside this folder or not downloaded yet.")

    transcript = plan.get("transcriptWorkorderSummary") or {}
    counts = transcript.get("counts") or {}
    lines.extend([
        "",
        "## Episode 4 transcript runway",
        f"- Status: `{transcript.get('status')}`",
        f"- Workorders: {transcript.get('path') or 'not linked'}",
        f"- Provider available: `{transcript.get('providerAvailable')}`",
        f"- Sources: {counts.get('sources', 0)}",
        f"- High priority: {counts.get('priorityHigh', 0)}",
        f"- External audio: {counts.get('externalAudio', 0)}",
        f"- Video scratch: {counts.get('videoScratch', 0)}",
        f"- Podcast masters: {counts.get('podcastMasters', 0)}",
        f"- Preferred full-length/HQ sources: {transcript.get('preferredSourceCount', 0)}",
        f"- Next: {transcript.get('nextSafestAction') or 'Generate transcript workorders, then transcribe high-priority sources.'}",
        f"- Truth: {transcript.get('truth')}",
    ])
    if transcript.get("preferredSources"):
        lines.append("- Preferred transcript sources:")
        for source in transcript.get("preferredSources") or []:
            lines.append(
                f"  - P{source.get('priority')} `{source.get('sourceKind')}` "
                f"{source.get('durationLabel')} · `{source.get('fileName')}`"
            )

    transcript_pilot = plan.get("transcriptPilotSummary") or {}
    pilot_counts = transcript_pilot.get("counts") or {}
    execution_source = transcript_pilot.get("executionSource") or {}
    lines.extend([
        "",
        "## Episode 4 transcript pilot evidence",
        f"- Status: `{transcript_pilot.get('status')}`",
        f"- Pilot board: {transcript_pilot.get('htmlPath') or 'not available'}",
        f"- Normalized transcript: {transcript_pilot.get('normalizedTranscriptJsonPath') or 'not available'}",
        f"- Execution source: `{execution_source.get('fileName') or 'not available'}`",
        f"- Managed excerpt: `{execution_source.get('isManagedExcerpt')}`",
        f"- Excerpt offset/duration: `{execution_source.get('excerptStartSeconds')}`s / `{execution_source.get('excerptDurationSeconds')}`s",
        f"- Segments/words: {pilot_counts.get('segments', 0)} / {pilot_counts.get('words', 0)}",
        f"- Next: {transcript_pilot.get('nextSafestAction') or 'Run a transcript pilot, then full-source ASR.'}",
        f"- Truth: {transcript_pilot.get('truth')}",
    ])
    if transcript_pilot.get("firstSegments"):
        lines.append("- First pilot segments:")
        for segment in transcript_pilot.get("firstSegments") or []:
            lines.append(
                f"  - `{compact_time(n(segment.get('start')))}-{compact_time(n(segment.get('end')))}` "
                f"{segment.get('speaker') or 'Speaker'}: {segment.get('text')}"
            )

    selected = assessment.get("selectedShort") or {}
    if selected.get("title"):
        lines.extend([
            "",
            "## Selected short",
            f"- Title: {selected.get('title')}",
            f"- Review: `{selected.get('reviewStatus')}`",
            f"- Duration: {selected.get('duration')}s",
            f"- Segments: {selected.get('segmentCount')}",
        ])

    strategy = plan.get("durationStrategy") or {}
    lines.extend([
        "",
        "## Multiple-length strategy",
        f"- Model: `{strategy.get('model')}`",
        f"- Truth: {strategy.get('truth')}",
        f"- Why: {strategy.get('why')}",
        f"- Recommended order: {', '.join(strategy.get('recommendedOrder') or [])}",
        "",
        "## Duration ladder",
    ])
    for item in plan.get("durationLadder") or []:
        if item.get("targetMinutes"):
            target = "-".join(str(v) for v in item["targetMinutes"]) + " min"
        else:
            target = "/".join(str(v) for v in item.get("targetSeconds") or []) + " sec"
        lines.extend([
            f"### {item.get('id')} ({target})",
            f"- Branch: `{item.get('branchName')}`",
            f"- Role: `{item.get('branchRole')}`",
            f"- Purpose: {item.get('purpose')}",
            f"- Best for: {item.get('bestFor')}",
            f"- Keeps: {item.get('whatItKeeps')}",
            f"- Cuts: {item.get('whatItCuts')}",
            f"- Tradeoff: {item.get('tradeoff')}",
            f"- Risk: {item.get('risk')}",
            f"- Review question: {item.get('reviewQuestion')}",
            f"- First editorial move: {item.get('firstEditorialMove')}",
            f"- Success proof: {item.get('successProof')}",
        ])
        checklist = item.get("proofChecklist") or []
        if checklist:
            lines.append("- Proof checklist:")
            lines.extend(f"  - {check}" for check in checklist)

    edit_recipes = plan.get("editVariantRecipes") or []
    if edit_recipes:
        lines.extend([
            "",
            "## Edit variant recipes",
            "",
            "These are the first machine-readable branch recipes over one synced spine. They are not applied edits.",
        ])
        for recipe in edit_recipes:
            tradeoff = recipe.get("humanTradeoff") or {}
            transcript_evidence = recipe.get("transcriptEvidence") or {}
            lines.extend([
                "",
                f"### {recipe.get('variantId')} · {recipe.get('target')}",
                f"- Branch: `{recipe.get('branchName')}`",
                f"- Status: `{recipe.get('status')}`",
                f"- Cut pressure: `{recipe.get('cutPressure')}`",
                f"- Source policy: {recipe.get('sourceSpinePolicy')}",
                f"- Best for: {tradeoff.get('bestFor')}",
                f"- Tradeoff: {tradeoff.get('tradeoff')}",
                f"- Risk: {tradeoff.get('risk')}",
                f"- Review question: {tradeoff.get('reviewQuestion')}",
                f"- Technique focus: {', '.join(recipe.get('cutTechniqueFocus') or [])}",
                f"- Transcript evidence: workorders `{transcript_evidence.get('workorderStatus')}`, pilot `{transcript_evidence.get('pilotStatus')}`, segments `{transcript_evidence.get('pilotSegments')}`, words `{transcript_evidence.get('pilotWords')}`",
                "- First pass:",
            ])
            lines.extend(f"  - {step}" for step in recipe.get("firstPassCutPasses") or [])
            readiness_notes = recipe.get("readinessNotes") or []
            if readiness_notes:
                lines.append("- Readiness notes:")
                lines.extend(f"  - {note}" for note in readiness_notes)
            lines.append(f"- Next agent move: {recipe.get('nextAgentMove')}")
            lines.append(f"- Truth: {recipe.get('truth')}")

    choice_menu = plan.get("durationChoiceMenu") or []
    if choice_menu:
        lines.extend([
            "",
            "## Human duration choice menu",
            "",
            "| Choice | Status | Target | Cut pressure | Keep/remove estimate | Best for | Next action |",
            "| --- | --- | --- | --- | --- | --- | --- |",
        ])
        for item in choice_menu:
            compression = item.get("compression") or {}
            keep = compression.get("keepPercentRange")
            remove = compression.get("removePercentRange")
            if keep and remove:
                ratio = f"keep {keep[0]}-{keep[1]}%, remove {remove[0]}-{remove[1]}%"
            else:
                ratio = "unknown"
            lines.append(
                f"| `{item.get('id')}` | `{item.get('status')}` | {item.get('target')} | "
                f"{compression.get('cutPressure')} | {ratio} | {item.get('bestFor')} | {item.get('nextAction')} |"
            )
        for item in choice_menu:
            cautions = item.get("cautions") or []
            blockers = item.get("blockers") or []
            if not cautions and not blockers:
                continue
            lines.extend(["", f"### {item.get('id')} readiness notes"])
            lines.extend(f"- Blocker: {blocker}" for blocker in blockers)
            lines.extend(f"- Caution: {caution}" for caution in cautions)

    summary = plan.get("cutIntelligenceSummary") or {}
    lines.extend([
        "",
        "## Cut intelligence summary",
        f"- Cadence mode: `{summary.get('cadenceMode')}`",
        f"- Cadence warnings: {summary.get('cadenceWarningCount')}",
        f"- Transcript coverage: `{summary.get('transcriptCoverageStatus')}`",
        f"- Human-flow stance: {summary.get('humanFlowStance')}",
        "",
        "## Next actions",
    ])
    lines.extend(f"- {item}" for item in plan.get("nextActions") or [])
    lines.extend(["", "## Safe commands"])
    for label, command in (plan.get("safeCommands") or {}).items():
        lines.append(f"- {label}: `{command}`")
    lines.extend(["", f"Truth: {plan.get('truth')}"])
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Create an Episode 4 clip-weave and duration-option plan.")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--output-root", default=str(DEFAULT_OUTPUT_ROOT))
    parser.add_argument("--media-root", default=str(DEFAULT_MEDIA_ROOT))
    parser.add_argument("--transcript-workorders", default=str(DEFAULT_TRANSCRIPT_WORKORDERS))
    parser.add_argument("--transcript-pilot", default=str(DEFAULT_TRANSCRIPT_PILOT))
    parser.add_argument("--save", action="store_true")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--markdown", action="store_true")
    args = parser.parse_args()

    media_root = Path(args.media_root) if args.media_root else None
    transcript_workorders = Path(args.transcript_workorders) if args.transcript_workorders else None
    if transcript_workorders and not transcript_workorders.exists() and FALLBACK_TRANSCRIPT_WORKORDERS.exists():
        transcript_workorders = FALLBACK_TRANSCRIPT_WORKORDERS
    transcript_pilot = Path(args.transcript_pilot) if args.transcript_pilot else None
    plan = build_plan(args.base_url, media_root, transcript_workorders, transcript_pilot)
    if args.save:
        stamp = re.sub(r"[^0-9TZ]", "", plan.get("generatedAt", "")) or datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        folder = Path(args.output_root) / f"{stamp}-episode-4-clip-weave-duration-plan"
        folder.mkdir(parents=True, exist_ok=True)
        (folder / "episode4-clip-weave-duration-plan.json").write_text(json.dumps(plan, indent=2, sort_keys=True), encoding="utf-8")
        (folder / "episode4-clip-weave-duration-plan.md").write_text(render_markdown(plan), encoding="utf-8")
        plan["savedFolder"] = str(folder)

    if args.json:
        print(json.dumps(plan, indent=2, sort_keys=True))
    else:
        print(render_markdown(plan))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
