#!/usr/bin/env python3
"""Build an Episode 4 edit rehearsal packet.

The rehearsal packet translates transcript-aware edit intelligence into concrete,
reviewable edit moves without writing timeline metadata. It sits before the
review ledger/apply-preview seam: humans and agents can inspect what would be
tried, what rhythm must be protected, what source media is missing, and what
review command would record the next decision.

Safety boundary: rehearsal metadata only. This command never imports clips,
writes timeline/session state, creates shorts, renders exports, publishes,
uploads, deletes, overwrites previous versions, or mutates source media.
"""
from __future__ import annotations

import argparse
import html
import json
import shlex
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
INTELLIGENCE_POINTER = RELEASE_ROOT / "review-board/episode4-edit-intelligence/latest-episode4-edit-intelligence.json"
REVIEW_LEDGER_POINTER = RELEASE_ROOT / "review-board/episode4-edit-intelligence-review/latest-episode4-edit-review-ledger.json"
OUT_ROOT = RELEASE_ROOT / "review-board/episode4-edit-rehearsal"
LATEST_POINTER = OUT_ROOT / "latest-episode4-edit-rehearsal.json"
SCHEMA = "quipsly.episode4-edit-rehearsal.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-edit-rehearsal")


def esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""))


def fmt_time(seconds: Any) -> str:
    try:
        value = max(0.0, float(seconds or 0.0))
    except Exception:
        value = 0.0
    whole = int(value)
    return f"{whole // 3600:02d}:{(whole % 3600) // 60:02d}:{whole % 60:02d}"


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def load_pointer(path: Path, target_keys: tuple[str, ...] = ("jsonPath", "ledgerPath", "manifestPath")) -> dict[str, Any]:
    pointer = load_json(path)
    merged = dict(pointer)
    for key in target_keys:
        target_text = str(pointer.get(key) or "")
        if not target_text:
            continue
        target = Path(target_text)
        if target.exists() and target != path:
            target_payload = load_json(target)
            if target_payload:
                merged = {**pointer, **target_payload}
                break
    merged["pointerPath"] = str(path)
    merged["pointerExists"] = path.exists()
    return merged


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def truth() -> dict[str, Any]:
    return {
        "rehearsalOnly": True,
        "timelineDecisionsWritten": False,
        "clipsImported": False,
        "shortsCreated": False,
        "sourceFilesMutated": False,
        "exportsRendered": False,
        "externalPublishing": False,
        "versionsOverwritten": False,
        "filesDeleted": False,
        "readyForAutomatedApply": False,
    }


def review_lookup(ledger: dict[str, Any]) -> dict[str, dict[str, Any]]:
    reviews = ledger.get("reviews") if isinstance(ledger.get("reviews"), dict) else {}
    return {str(key): value for key, value in reviews.items() if isinstance(value, dict)}


def proposal_groups(intelligence: dict[str, Any]) -> list[tuple[str, list[dict[str, Any]]]]:
    return [
        ("shortCandidates", [p for p in intelligence.get("shortCandidates") or [] if isinstance(p, dict)]),
        ("cadenceCandidates", [p for p in intelligence.get("cadenceCandidates") or [] if isinstance(p, dict)]),
        ("clipWeaveWorkorders", [p for p in intelligence.get("clipWeaveWorkorders") or [] if isinstance(p, dict)]),
        ("reactionCoverCandidates", [p for p in intelligence.get("reactionCoverCandidates") or [] if isinstance(p, dict)]),
    ]


def proposal_id(proposal: dict[str, Any]) -> str:
    return str(proposal.get("id") or proposal.get("cueId") or "").strip()


def shell_quote(value: Any) -> str:
    return shlex.quote(str(value if value is not None else ""))


def review_command(
    pid: str,
    decision: str,
    notes: str,
    *,
    dry_run: bool,
    audio_note: str = "",
    visual_note: str = "",
    cadence_note: str = "",
    source_note: str = "",
    hook_note: str = "",
    caption_note: str = "",
    platform_note: str = "",
    framing_note: str = "",
    next_action: str = "",
) -> str:
    command = "episode4-edit-review-decision-dry-run" if dry_run else "episode4-edit-review-decision"
    parts = ["./script/agentctl.sh", command, pid, decision, "Codex", notes]
    flags = {
        "--audio-note": audio_note,
        "--visual-note": visual_note,
        "--cadence-note": cadence_note,
        "--source-note": source_note,
        "--hook-note": hook_note,
        "--caption-note": caption_note,
        "--platform-note": platform_note,
        "--framing-note": framing_note,
        "--next-action": next_action,
    }
    for flag, value in flags.items():
        if str(value or "").strip():
            parts.extend([flag, value])
    return " ".join(shell_quote(part) for part in parts)


def note_lane(lane_id: str, label: str, prompt: str, flag: str) -> dict[str, str]:
    return {"id": lane_id, "label": label, "prompt": prompt, "flag": flag}


def review_brief_for(move: dict[str, Any]) -> dict[str, Any]:
    pid = str(move.get("proposalId") or "")
    kind = str(move.get("rehearsalKind") or "")
    start = move.get("startSeconds")
    end = move.get("endSeconds")
    try:
        start_value = max(0.0, float(start or 0.0))
        end_value = max(start_value, float(end or start_value))
    except Exception:
        start_value = 0.0
        end_value = 0.0
    scrub_window = {
        "startSeconds": max(0.0, start_value - 5.0),
        "proposalStartSeconds": start_value,
        "proposalEndSeconds": end_value,
        "endSeconds": end_value + 5.0,
        "label": f"{fmt_time(max(0.0, start_value - 5.0))} -> {fmt_time(end_value + 5.0)}",
        "why": "Review with five seconds of context on both sides so cadence, reaction, and sentence meaning are not judged from a naked transcript slice.",
    }
    base_questions = [
        "Does this move improve the episode, or merely make it busier?",
        "Does the audio still feel like a human conversation?",
        "What would make this easier for a non-editor to approve or adjust?",
    ]
    if kind == "short-recipe-rehearsal":
        lanes = [
            note_lane("hook", "Hook", "Does the first 3 seconds create curiosity without cutting away needed context?", "--hook-note"),
            note_lane("caption", "Caption", "Can captions be split on natural phrases and stay readable at 9:16?", "--caption-note"),
            note_lane("platform", "Platform", "Which platform is this strongest for, and does the duration fit?", "--platform-note"),
            note_lane("framing", "Framing", "Is the face-safe crop good enough, or does it need a reframing/keyframe pass?", "--framing-note"),
            note_lane("cadence", "Cadence", "Does any pause help the idea land, or should it be softly tightened?", "--cadence-note"),
        ]
        options = [
            {
                "decision": "keep",
                "whenToUse": "The short works as a recipe after visual/caption review.",
                "dryRunCommand": review_command(
                    pid,
                    "keep",
                    "Short works after review.",
                    dry_run=True,
                    hook_note="Hook lands without missing context.",
                    caption_note="Caption plan is readable if split on phrases.",
                    platform_note="Good 9:16 candidate for Reels/Shorts.",
                    framing_note="Face-safe framing is acceptable or easy to tune.",
                    cadence_note="Cadence still feels human.",
                ),
                "recordCommand": review_command(
                    pid,
                    "keep",
                    "Short works after review.",
                    dry_run=False,
                    hook_note="Hook lands without missing context.",
                    caption_note="Caption plan is readable if split on phrases.",
                    platform_note="Good 9:16 candidate for Reels/Shorts.",
                    framing_note="Face-safe framing is acceptable or easy to tune.",
                    cadence_note="Cadence still feels human.",
                ),
            },
            {
                "decision": "refine",
                "whenToUse": "The moment is promising but needs range, caption, crop, or pacing changes.",
                "dryRunCommand": review_command(
                    pid,
                    "refine",
                    "Promising short, but refine before export.",
                    dry_run=True,
                    hook_note="Hook needs a cleaner in point or setup.",
                    caption_note="Caption split needs phrase cleanup.",
                    platform_note="Trim or variant needed for platform fit.",
                    framing_note="Needs 9:16 face-safe framing adjustment.",
                    cadence_note="Listen for one pause before tightening.",
                    next_action="Create a revised short recipe and keep this review as training data.",
                ),
                "recordCommand": review_command(
                    pid,
                    "refine",
                    "Promising short, but refine before export.",
                    dry_run=False,
                    hook_note="Hook needs a cleaner in point or setup.",
                    caption_note="Caption split needs phrase cleanup.",
                    platform_note="Trim or variant needed for platform fit.",
                    framing_note="Needs 9:16 face-safe framing adjustment.",
                    cadence_note="Listen for one pause before tightening.",
                    next_action="Create a revised short recipe and keep this review as training data.",
                ),
            },
        ]
        questions = [
            "Would a cold viewer understand why this matters?",
            "Is the first line a hook or just the middle of a sentence?",
            "Would this still sound like us after tightening?",
        ] + base_questions
    elif kind == "cadence-decision-rehearsal":
        lanes = [
            note_lane("audio", "Audio", "Listen through the whole thought before deciding this is dead air.", "--audio-note"),
            note_lane("cadence", "Cadence", "Is the silence thought, laughter, breath, transition, or technical dead space?", "--cadence-note"),
            note_lane("visual", "Visual", "Does the face/body language make the pause worth preserving?", "--visual-note"),
        ]
        options = [
            {
                "decision": "needs-listen",
                "whenToUse": "You have not listened closely enough yet.",
                "dryRunCommand": review_command(pid, "needs-listen", "Cadence decision needs normal-speed listen.", dry_run=True, audio_note="Listen 5s before/after.", cadence_note="Do not auto-tighten this from transcript alone."),
                "recordCommand": review_command(pid, "needs-listen", "Cadence decision needs normal-speed listen.", dry_run=False, audio_note="Listen 5s before/after.", cadence_note="Do not auto-tighten this from transcript alone."),
            },
            {
                "decision": "refine",
                "whenToUse": "It is technical slack and can be softly tightened while preserving breath.",
                "dryRunCommand": review_command(pid, "refine", "Soft-tighten candidate after listen.", dry_run=True, audio_note="Technical dead air, not meaning-bearing.", cadence_note="Leave minimum breath; do not snap-cut."),
                "recordCommand": review_command(pid, "refine", "Soft-tighten candidate after listen.", dry_run=False, audio_note="Technical dead air, not meaning-bearing.", cadence_note="Leave minimum breath; do not snap-cut."),
            },
        ]
        questions = [
            "Is the pause doing emotional or comprehension work?",
            "Would removing it make the speaker sound less human?",
            "Is there a better reaction cover than a timing cut?",
        ] + base_questions
    elif kind == "source-weave-placeholder-rehearsal":
        lanes = [
            note_lane("source", "Source", "What exact watched/source clip is needed, and is it actually present?", "--source-note"),
            note_lane("audio", "Audio", "Would the source clip enter under the host setup as a J-cut?", "--audio-note"),
            note_lane("visual", "Visual", "Should the host reaction stay visible before/after the clip as an L-cut?", "--visual-note"),
        ]
        options = [
            {
                "decision": "needs-source",
                "whenToUse": "The clip is missing or uncertain.",
                "dryRunCommand": review_command(pid, "needs-source", "Real watched/source clip still needs identification.", dry_run=True, source_note="Do not insert guessed media; keep placeholder visible."),
                "recordCommand": review_command(pid, "needs-source", "Real watched/source clip still needs identification.", dry_run=False, source_note="Do not insert guessed media; keep placeholder visible."),
            },
            {
                "decision": "refine",
                "whenToUse": "The clip exists, but J/L timing or reaction return needs tuning.",
                "dryRunCommand": review_command(pid, "refine", "Source weave needs timing refinement.", dry_run=True, source_note="Source exists; verify cue match.", audio_note="Check J-cut entry under setup.", visual_note="Check L-cut host reaction return."),
                "recordCommand": review_command(pid, "refine", "Source weave needs timing refinement.", dry_run=False, source_note="Source exists; verify cue match.", audio_note="Check J-cut entry under setup.", visual_note="Check L-cut host reaction return."),
            },
        ]
        questions = [
            "What exact file answers this spoken setup?",
            "Should the clip start before the host stops talking?",
            "When do we return to host reaction?",
        ] + base_questions
    else:
        lanes = [
            note_lane("visual", "Visual", "Does the reaction honestly match the moment?", "--visual-note"),
            note_lane("audio", "Audio", "Does this cover a jump without confusing the spoken idea?", "--audio-note"),
            note_lane("cadence", "Cadence", "Does the cover preserve timing, laughter, or surprise?", "--cadence-note"),
        ]
        options = [
            {
                "decision": "needs-visual-review",
                "whenToUse": "Reaction quality cannot be judged from transcript only.",
                "dryRunCommand": review_command(pid, "needs-visual-review", "Reaction cover needs visual review.", dry_run=True, visual_note="Check whether face matches the spoken beat."),
                "recordCommand": review_command(pid, "needs-visual-review", "Reaction cover needs visual review.", dry_run=False, visual_note="Check whether face matches the spoken beat."),
            },
            {
                "decision": "reject",
                "whenToUse": "The reaction feels generic, misleading, or wallpaper-like.",
                "dryRunCommand": review_command(pid, "reject", "Reaction cover does not honestly match the moment.", dry_run=True, visual_note="Reject generic listener face; preserve as training evidence."),
                "recordCommand": review_command(pid, "reject", "Reaction cover does not honestly match the moment.", dry_run=False, visual_note="Reject generic listener face; preserve as training evidence."),
            },
        ]
        questions = [
            "Is this a real reaction or just a face?",
            "Does it hide a jump cut, or does it add confusion?",
            "Would a hard cut be more honest?",
        ] + base_questions
    return {
        "status": "review-needed" if move.get("reviewStatus") == "unreviewed" else "reviewed",
        "scrubWindow": scrub_window,
        "noteLanes": lanes,
        "humanQuestions": questions,
        "decisionOptions": options,
        "agentEvidenceToCapture": [
            "What was visible at the in point and out point?",
            "What did the audio feel like before and after the move?",
            "Which specific note lane changed your decision?",
            "What would make the next generated proposal better?",
        ],
    }


def confidence_rank(value: str) -> int:
    value = value.lower()
    if value == "high":
        return 3
    if value == "medium":
        return 2
    if value == "low":
        return 1
    return 0


def pick_rehearsal_proposals(intelligence: dict[str, Any], per_group_limit: int) -> list[tuple[str, dict[str, Any]]]:
    picked: list[tuple[str, dict[str, Any]]] = []
    for group, proposals in proposal_groups(intelligence):
        sorted_proposals = sorted(
            proposals,
            key=lambda item: (
                -float(item.get("score") or 0.0),
                -confidence_rank(str(item.get("confidence") or "")),
                float(item.get("startSeconds") or 0.0),
            ),
        )
        picked.extend((group, proposal) for proposal in sorted_proposals[:per_group_limit])
    return picked


def move_for(group: str, proposal: dict[str, Any], review: dict[str, Any]) -> dict[str, Any]:
    pid = proposal_id(proposal)
    cadence = proposal.get("cadenceProfile") if isinstance(proposal.get("cadenceProfile"), dict) else {}
    review_status = str(review.get("status") or "unreviewed") if review else "unreviewed"
    review_decision = str(review.get("decision") or "pending") if review else "pending"
    base = {
        "proposalId": pid,
        "proposalGroup": group,
        "timeLabel": proposal.get("timeLabel") or f"{fmt_time(proposal.get('startSeconds'))} -> {fmt_time(proposal.get('endSeconds'))}",
        "startSeconds": proposal.get("startSeconds"),
        "endSeconds": proposal.get("endSeconds"),
        "confidence": proposal.get("confidence") or "review",
        "intent": proposal.get("intent") or "Review this edit idea before changing timeline metadata.",
        "explanation": proposal.get("explanation") or proposal.get("summary") or proposal.get("context") or proposal.get("hookDraft") or "",
        "tradeoff": proposal.get("tradeoff") or "The transcript can suggest the move, but audio/video review decides whether it feels human.",
        "cutTechnique": proposal.get("cutTechnique") or "review-required",
        "reviewStatus": review_status,
        "reviewDecision": review_decision,
        "reviewCommand": f"./script/agentctl.sh episode4-edit-review-decision {pid} refine Codex \"notes\"" if pid else "",
        "dryRunReviewCommand": f"./script/agentctl.sh episode4-edit-review-decision-dry-run {pid} refine Codex \"notes\"" if pid else "",
        "cadenceProfile": cadence,
        "cadenceGuardrail": cadence.get("noCutRationale") or "Do not assume transcript gaps equal dead air. Listen before tightening.",
        "reviewQuestion": cadence.get("reviewQuestion") or "Does this move improve clarity without flattening the speaker?",
        "truth": truth(),
    }
    if group == "shortCandidates":
        move = {
            **base,
            "rehearsalKind": "short-recipe-rehearsal",
            "wouldCreate": "9:16 short recipe draft",
            "programMove": "SHOW range as a possible short; preserve source media; do not export until visual/caption review.",
            "platformVariants": proposal.get("platformVariants") or [],
            "captionPlan": proposal.get("captionPlan") or {},
            "hookType": proposal.get("hookType") or "review",
            "pacingRisk": proposal.get("pacingRisk") or "review",
            "rehearsalChecklist": [
                "Scrub the first 3 seconds: does the hook create curiosity without missing context?",
                "Check 9:16 face-safe framing before exporting.",
                "Read captions aloud; split on phrases, not arbitrary word chunks.",
                base["reviewQuestion"],
            ],
        }
        move["reviewBrief"] = review_brief_for(move)
        return move
    if group == "cadenceCandidates":
        action = proposal.get("suggestedAction") or "listen-before-tighten"
        move = {
            **base,
            "rehearsalKind": "cadence-decision-rehearsal",
            "wouldCreate": "KEEP or SOFT-TIGHTEN decision metadata",
            "programMove": f"Try `{action}` only after audio review; leave recommended breath if tightening.",
            "recommendedMinimumBreathSeconds": cadence.get("recommendedMinimumBreathSeconds", 0.25),
            "noCutRationale": cadence.get("noCutRationale") or proposal.get("noCutRationale") or "No-cut rationale missing; default to listening first.",
            "rehearsalChecklist": [
                "Listen at least 5 seconds before and after this gap.",
                "If it is thought, laughter, or setup/payoff processing, keep it.",
                "If it is technical dead air, tighten softly and leave breath.",
                base["reviewQuestion"],
            ],
        }
        move["reviewBrief"] = review_brief_for(move)
        return move
    if group == "clipWeaveWorkorders":
        move = {
            **base,
            "rehearsalKind": "source-weave-placeholder-rehearsal",
            "wouldCreate": "source-required placeholder, not real clip insert",
            "programMove": "Hold a visible source-placeholder at the cue. Do not insert guessed media.",
            "sourceTruthBoundary": proposal.get("sourceTruthBoundary") or "Real source media must be confirmed before clip insertion.",
            "cueId": proposal.get("cueId"),
            "jCutHint": proposal.get("jCutHint"),
            "lCutHint": proposal.get("lCutHint"),
            "dropbox": str(RELEASE_ROOT / "Episode_04_Watched_Source_Clip_Dropbox/needs-human-identification"),
            "rehearsalChecklist": [
                "Confirm the real watched/source clip first.",
                "Use a J-cut only when the incoming clip answers the spoken setup.",
                "Use an L-cut only when the host reaction remains useful after the visual return.",
                "If the file is missing, keep the source placeholder and continue main edit elsewhere.",
            ],
        }
        move["reviewBrief"] = review_brief_for(move)
        return move
    move = {
        **base,
        "rehearsalKind": "reaction-cover-rehearsal",
        "wouldCreate": "optional reaction cover decision",
        "programMove": "Test this as a cover for a nearby jump or source insert; reject if the face does not match the moment.",
        "rehearsalChecklist": [
            "Verify the reaction visually matches the spoken beat.",
            "Do not use generic listener face as wallpaper.",
            "Prefer real laughter, surprise, agreement, or thoughtful processing.",
            base["reviewQuestion"],
        ],
    }
    move["reviewBrief"] = review_brief_for(move)
    return move


def build_packet(args: argparse.Namespace) -> dict[str, Any]:
    intelligence_pointer = Path(args.intelligence_pointer)
    review_pointer = Path(args.review_ledger_pointer)
    intelligence = load_pointer(intelligence_pointer)
    ledger = load_pointer(review_pointer, ("ledgerPath", "jsonPath"))
    reviews = review_lookup(ledger)
    moves: list[dict[str, Any]] = []
    for group, proposal in pick_rehearsal_proposals(intelligence, args.per_group_limit):
        pid = proposal_id(proposal)
        moves.append(move_for(group, proposal, reviews.get(pid, {})))
    counts_by_kind: dict[str, int] = {}
    unreviewed = 0
    needs_source = 0
    for move in moves:
        kind = str(move.get("rehearsalKind") or "unknown")
        counts_by_kind[kind] = counts_by_kind.get(kind, 0) + 1
        if move.get("reviewStatus") == "unreviewed":
            unreviewed += 1
        if move.get("rehearsalKind") == "source-weave-placeholder-rehearsal":
            needs_source += 1
    session_dir = Path(args.out_root) / stamp()
    packet = {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": "episode4-edit-rehearsal-ready" if moves else "episode4-edit-rehearsal-empty",
        "episode": 4,
        "episodeLabel": "Episode 4",
        "sessionDir": str(session_dir),
        "inputs": {
            "editIntelligencePointer": str(intelligence_pointer),
            "editIntelligenceJson": intelligence.get("jsonPath") or "",
            "reviewLedgerPointer": str(review_pointer),
            "reviewLedgerPath": ledger.get("ledgerPath") or "",
        },
        "counts": {
            "moves": len(moves),
            "unreviewedMoves": unreviewed,
            "sourceRequiredMoves": needs_source,
            "kindCounts": counts_by_kind,
        },
        "moves": moves,
        "nextSafestAction": next_safest_action(moves),
        "truth": truth(),
    }
    write_surfaces(session_dir, packet, Path(args.latest_pointer))
    return packet


def next_safest_action(moves: list[dict[str, Any]]) -> str:
    if not moves:
        return "Generate Episode 4 edit intelligence first, then rebuild this rehearsal packet."
    if any(move.get("rehearsalKind") == "short-recipe-rehearsal" and move.get("reviewStatus") == "unreviewed" for move in moves):
        return "Open the top short rehearsal, scrub it in Studio, then record a refine/keep/reject decision with hook/caption/platform/framing notes."
    if any(move.get("rehearsalKind") == "source-weave-placeholder-rehearsal" for move in moves):
        return "Recover watched/source clips into the dropbox when available, but keep editing the main spine with placeholders until then."
    return "Use rehearsal moves to record review decisions before building apply-preview operations."


def write_surfaces(session_dir: Path, packet: dict[str, Any], latest_pointer: Path) -> None:
    json_path = session_dir / "episode4-edit-rehearsal.json"
    markdown_path = session_dir / "episode4-edit-rehearsal.md"
    html_path = session_dir / "index.html"
    packet.update({"jsonPath": str(json_path), "markdownPath": str(markdown_path), "htmlPath": str(html_path)})
    write_json(json_path, packet)
    markdown_path.write_text(render_markdown(packet), encoding="utf-8")
    html_path.write_text(render_html(packet), encoding="utf-8")
    write_json(latest_pointer, {
        "schema": "quipsly.episode4-edit-rehearsal-pointer.v1",
        "generatedAt": iso_now(),
        "status": packet.get("status"),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "htmlPath": str(html_path),
        "counts": packet.get("counts"),
        "truth": packet.get("truth"),
    })


def render_markdown(packet: dict[str, Any]) -> str:
    lines = [
        "# Episode 4 edit rehearsal packet",
        "",
        f"Generated: `{packet.get('generatedAt')}`",
        f"Status: `{packet.get('status')}`",
        "",
        "This is a rehearsal, not an apply. It does not write timeline/session state.",
        "",
        f"Next: {packet.get('nextSafestAction')}",
        "",
        "## Counts",
        "",
    ]
    for key, value in (packet.get("counts") or {}).items():
        lines.append(f"- {key}: `{json.dumps(value, sort_keys=True) if isinstance(value, dict) else value}`")
    lines.extend(["", "## Rehearsal moves", ""])
    for move in packet.get("moves") or []:
        review_brief = move.get("reviewBrief") if isinstance(move.get("reviewBrief"), dict) else {}
        scrub_window = review_brief.get("scrubWindow") if isinstance(review_brief.get("scrubWindow"), dict) else {}
        lines.append(f"### {move.get('proposalId')} · {move.get('rehearsalKind')} · {move.get('timeLabel')}")
        lines.append(f"- Would create: {move.get('wouldCreate')}")
        lines.append(f"- Program move: {move.get('programMove')}")
        lines.append(f"- Why: {move.get('explanation')}")
        lines.append(f"- Tradeoff: {move.get('tradeoff')}")
        lines.append(f"- Cadence guardrail: {move.get('cadenceGuardrail')}")
        lines.append(f"- Review question: {move.get('reviewQuestion')}")
        lines.append(f"- Review status: `{move.get('reviewStatus')}` decision `{move.get('reviewDecision')}`")
        if scrub_window:
            lines.append(f"- Scrub window: `{scrub_window.get('label')}`")
            lines.append(f"  - Why this window: {scrub_window.get('why')}")
        if move.get("dryRunReviewCommand"):
            lines.append(f"- Dry-run review command: `{move.get('dryRunReviewCommand')}`")
        note_lanes = review_brief.get("noteLanes") if isinstance(review_brief.get("noteLanes"), list) else []
        if note_lanes:
            lines.append("- Note lanes:")
            for lane in note_lanes:
                if isinstance(lane, dict):
                    lines.append(f"  - **{lane.get('label')}** (`{lane.get('flag')}`): {lane.get('prompt')}")
        questions = review_brief.get("humanQuestions") if isinstance(review_brief.get("humanQuestions"), list) else []
        if questions:
            lines.append("- Review questions:")
            for question in questions[:6]:
                lines.append(f"  - {question}")
        decision_options = review_brief.get("decisionOptions") if isinstance(review_brief.get("decisionOptions"), list) else []
        if decision_options:
            lines.append("- Decision command examples:")
            for option in decision_options:
                if not isinstance(option, dict):
                    continue
                lines.append(f"  - `{option.get('decision')}`: {option.get('whenToUse')}")
                lines.append(f"    - Dry run: `{option.get('dryRunCommand')}`")
                lines.append(f"    - Record: `{option.get('recordCommand')}`")
        checklist = move.get("rehearsalChecklist") or []
        if checklist:
            lines.append("- Checklist:")
            for item in checklist:
                lines.append(f"  - {item}")
        lines.append("")
    lines.extend(["## Truth", ""])
    for key, value in (packet.get("truth") or {}).items():
        lines.append(f"- {key}: `{value}`")
    return "\n".join(lines).rstrip() + "\n"


def pick_next_move(packet: dict[str, Any], proposal_id: str = "") -> dict[str, Any]:
    moves = [move for move in packet.get("moves") or [] if isinstance(move, dict)]
    if proposal_id:
        return next((move for move in moves if str(move.get("proposalId") or "") == proposal_id), {})
    return (
        next((move for move in moves if move.get("reviewStatus") == "unreviewed"), {})
        or next((move for move in moves if move.get("reviewDecision") == "pending"), {})
        or (moves[0] if moves else {})
    )


def build_next_packet(packet: dict[str, Any], proposal_id: str = "") -> dict[str, Any]:
    move = pick_next_move(packet, proposal_id)
    brief = move.get("reviewBrief") if isinstance(move.get("reviewBrief"), dict) else {}
    return {
        "schema": "quipsly.episode4-edit-rehearsal-next.v1",
        "generatedAt": iso_now(),
        "status": "episode4-edit-rehearsal-next-ready" if move else "episode4-edit-rehearsal-next-empty",
        "episode": packet.get("episode"),
        "episodeLabel": packet.get("episodeLabel"),
        "sourcePacket": {
            "jsonPath": packet.get("jsonPath"),
            "markdownPath": packet.get("markdownPath"),
            "htmlPath": packet.get("htmlPath"),
            "counts": packet.get("counts"),
        },
        "move": move,
        "reviewBrief": brief,
        "nextSafestAction": (
            "Scrub the review window, answer the move-specific note lanes, then run a dry-run decision command."
            if move
            else "Generate Episode 4 edit rehearsal first."
        ),
        "truth": {
            **truth(),
            "nextResolverOnly": True,
            "reviewLedgerMutated": False,
        },
    }


def decision_option_for(packet: dict[str, Any], decision: str) -> dict[str, Any]:
    brief = packet.get("reviewBrief") if isinstance(packet.get("reviewBrief"), dict) else {}
    options = brief.get("decisionOptions") if isinstance(brief.get("decisionOptions"), list) else []
    for option in options:
        if isinstance(option, dict) and str(option.get("decision") or "") == decision:
            return option
    valid = ", ".join(str(option.get("decision")) for option in options if isinstance(option, dict) and option.get("decision"))
    raise SystemExit(f"Decision option not available for next rehearsal move: {decision}. Available: {valid or 'none'}")


def run_next_decision(packet: dict[str, Any], decision: str, record: bool) -> dict[str, Any]:
    option = decision_option_for(packet, decision)
    command_text = str(option.get("recordCommand") if record else option.get("dryRunCommand") or "")
    if not command_text:
        raise SystemExit(f"No command available for decision option: {decision}")
    argv = shlex.split(command_text)
    if "--json" not in argv:
        argv.append("--json")
    repo_root = Path(__file__).resolve().parents[2]
    completed = subprocess.run(argv, cwd=repo_root, text=True, capture_output=True, check=False)
    result: dict[str, Any]
    try:
        parsed = json.loads(completed.stdout)
        result = parsed if isinstance(parsed, dict) else {"raw": parsed}
    except Exception:
        result = {"stdout": completed.stdout, "stderr": completed.stderr}
    if completed.returncode != 0:
        return {
            "schema": "quipsly.episode4-edit-rehearsal-next-decision.v1",
            "generatedAt": iso_now(),
            "status": "decision-command-failed",
            "decision": decision,
            "record": record,
            "command": command_text,
            "returnCode": completed.returncode,
            "result": result,
            "truth": {**truth(), "nextResolverOnly": False, "reviewLedgerMutated": False},
        }
    return {
        "schema": "quipsly.episode4-edit-rehearsal-next-decision.v1",
        "generatedAt": iso_now(),
        "status": "decision-recorded" if record else "dry-run-ready",
        "decision": decision,
        "record": record,
        "command": command_text,
        "sourceMove": packet.get("move"),
        "result": result,
        "truth": {
            **truth(),
            "nextResolverOnly": False,
            "reviewLedgerMutated": bool(record),
            "timelineDecisionsWritten": False,
            "sourceFilesMutated": False,
            "exportsRendered": False,
            "externalPublishing": False,
        },
    }


def render_next_decision_markdown(packet: dict[str, Any]) -> str:
    move = packet.get("sourceMove") if isinstance(packet.get("sourceMove"), dict) else {}
    result = packet.get("result") if isinstance(packet.get("result"), dict) else {}
    event = result.get("wouldAppendEvent") if isinstance(result.get("wouldAppendEvent"), dict) else {}
    if not event and isinstance(result.get("decision"), str):
        event = {
            "proposalId": result.get("proposalId"),
            "decision": result.get("decision"),
        }
    lines = [
        "# Episode 4 next rehearsal decision",
        "",
        f"Generated: `{packet.get('generatedAt')}`",
        f"Status: `{packet.get('status')}`",
        f"Decision: `{packet.get('decision')}`",
        f"Recorded: `{packet.get('record')}`",
        "",
        "## Move",
        "",
        f"- Proposal: `{move.get('proposalId') or event.get('proposalId')}`",
        f"- Kind: `{move.get('rehearsalKind')}`",
        f"- Time: `{move.get('timeLabel')}`",
        "",
        "## Decision payload",
        "",
        f"- Notes: {event.get('notes', '')}",
        f"- Hook: {event.get('hookNote', '')}",
        f"- Caption: {event.get('captionNote', '')}",
        f"- Platform: {event.get('platformNote', '')}",
        f"- Framing: {event.get('framingNote', '')}",
        f"- Cadence: {event.get('cadenceNote', '')}",
        f"- Audio: {event.get('audioNote', '')}",
        f"- Visual: {event.get('visualNote', '')}",
        f"- Source: {event.get('sourceNote', '')}",
        f"- Next action: {event.get('nextAction', '')}",
        "",
        "## Command",
        "",
        f"`{packet.get('command')}`",
        "",
        "## Truth boundary",
        "",
        f"- Review ledger mutated: `{packet.get('truth', {}).get('reviewLedgerMutated')}`",
        f"- Timeline decisions written: `{packet.get('truth', {}).get('timelineDecisionsWritten')}`",
        f"- Source files mutated: `{packet.get('truth', {}).get('sourceFilesMutated')}`",
        f"- Exports rendered: `{packet.get('truth', {}).get('exportsRendered')}`",
        f"- External publishing: `{packet.get('truth', {}).get('externalPublishing')}`",
    ]
    return "\n".join(lines).rstrip() + "\n"


def render_next_markdown(packet: dict[str, Any]) -> str:
    move = packet.get("move") if isinstance(packet.get("move"), dict) else {}
    brief = packet.get("reviewBrief") if isinstance(packet.get("reviewBrief"), dict) else {}
    scrub = brief.get("scrubWindow") if isinstance(brief.get("scrubWindow"), dict) else {}
    lines = [
        "# Episode 4 next edit rehearsal",
        "",
        f"Generated: `{packet.get('generatedAt')}`",
        f"Status: `{packet.get('status')}`",
        "",
        packet.get("nextSafestAction") or "",
        "",
    ]
    if not move:
        lines.extend(["No rehearsal move is available.", ""])
        return "\n".join(lines).rstrip() + "\n"

    lines.extend(
        [
            "## Move",
            "",
            f"- Proposal: `{move.get('proposalId')}`",
            f"- Kind: `{move.get('rehearsalKind')}`",
            f"- Time: `{move.get('timeLabel')}`",
            f"- Would create: {move.get('wouldCreate')}",
            f"- Program move: {move.get('programMove')}",
            f"- Tradeoff: {move.get('tradeoff')}",
            f"- Cadence guardrail: {move.get('cadenceGuardrail')}",
            f"- Review question: {move.get('reviewQuestion')}",
            "",
            "## Scrub window",
            "",
            f"- Window: `{scrub.get('label') or 'open rehearsal board'}`",
            f"- Why: {scrub.get('why') or 'Review context before deciding.'}",
            "",
            "## Capture these notes",
            "",
        ]
    )
    note_lanes = brief.get("noteLanes") if isinstance(brief.get("noteLanes"), list) else []
    for lane in note_lanes:
        if isinstance(lane, dict):
            lines.append(f"- **{lane.get('label')}** `{lane.get('flag')}`: {lane.get('prompt')}")
    if not note_lanes:
        lines.append("- Open the rehearsal board; no note lanes are listed.")

    questions = brief.get("humanQuestions") if isinstance(brief.get("humanQuestions"), list) else []
    if questions:
        lines.extend(["", "## Review questions", ""])
        for question in questions:
            lines.append(f"- {question}")

    evidence = brief.get("agentEvidenceToCapture") if isinstance(brief.get("agentEvidenceToCapture"), list) else []
    if evidence:
        lines.extend(["", "## Agent evidence to capture", ""])
        for item in evidence:
            lines.append(f"- {item}")

    options = brief.get("decisionOptions") if isinstance(brief.get("decisionOptions"), list) else []
    lines.extend(["", "## Decision command examples", ""])
    for option in options:
        if not isinstance(option, dict):
            continue
        lines.extend(
            [
                f"### {option.get('decision')}",
                "",
                f"- When to use: {option.get('whenToUse')}",
                f"- Dry run: `{option.get('dryRunCommand')}`",
                f"- Record: `{option.get('recordCommand')}`",
                "",
            ]
        )
    if not options:
        lines.append("- No decision examples listed yet.")

    lines.extend(
        [
            "## Truth boundary",
            "",
            "- This is a next-action resolver over rehearsal metadata.",
            "- It does not mutate source media, write timeline metadata, render exports, publish externally, or append to the review ledger.",
        ]
    )
    return "\n".join(lines).rstrip() + "\n"


def render_html(packet: dict[str, Any]) -> str:
    counts = packet.get("counts") if isinstance(packet.get("counts"), dict) else {}
    cards = "".join(render_move_card(move) for move in packet.get("moves") or [] if isinstance(move, dict))
    return f"""<!doctype html><html><head><meta charset=\"utf-8\"><title>Episode 4 edit rehearsal</title>
<style>
:root {{ color-scheme:dark; --bg:#0d1611; --panel:#18261e; --ink:#fff2d7; --muted:#c8b997; --line:#365740; --leaf:#86e08b; --gold:#f0c95a; --water:#70d0d7; --clay:#d87c59; }}
body {{ margin:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:radial-gradient(circle at 15% 0%,rgba(134,224,139,.16),transparent 28%),linear-gradient(135deg,#0b120e,#251b12 75%); color:var(--ink); }}
main {{ max-width:1280px; margin:0 auto; padding:38px 24px 80px; }}
header,.card,.truth {{ border:1px solid var(--line); border-radius:28px; background:rgba(24,38,30,.92); padding:22px; margin:18px 0; box-shadow:0 18px 46px rgba(0,0,0,.30); }}
h1 {{ font-size:clamp(42px,6vw,78px); line-height:.92; margin:.08em 0 .25em; }}
.eyebrow {{ color:var(--gold); text-transform:uppercase; letter-spacing:.17em; font-size:12px; font-weight:900; }}
.grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(360px,1fr)); gap:16px; }}
	.pills {{ display:flex; flex-wrap:wrap; gap:8px; }}
	.pill {{ border:1px solid var(--line); border-radius:999px; padding:7px 11px; background:rgba(0,0,0,.22); font-size:12px; font-weight:850; }}
	h3 {{ margin:18px 0 8px; color:var(--gold); font-size:13px; text-transform:uppercase; letter-spacing:.12em; }}
	.card.short-recipe-rehearsal {{ border-color:rgba(112,208,215,.6); }}
	.card.cadence-decision-rehearsal {{ border-color:rgba(240,201,90,.62); }}
	.card.source-weave-placeholder-rehearsal {{ border-color:rgba(216,124,89,.68); }}
	.card.reaction-cover-rehearsal {{ border-color:rgba(134,224,139,.58); }}
	.action {{ color:var(--leaf); }} .muted {{ color:var(--muted); }} code {{ color:var(--leaf); }}
	details {{ border:1px solid rgba(255,255,255,.12); border-radius:16px; padding:10px 12px; margin:8px 0; background:rgba(0,0,0,.18); }}
	summary {{ cursor:pointer; color:var(--water); font-weight:850; }}
	li {{ margin:.35em 0; }}
</style></head><body><main>
<header><p class=\"eyebrow\">Quipsly Studio · edit rehearsal</p><h1>{esc(packet.get('status'))}</h1><p>{esc(packet.get('nextSafestAction'))}</p><div class=\"pills\"><span class=\"pill\">moves {esc(counts.get('moves'))}</span><span class=\"pill\">unreviewed {esc(counts.get('unreviewedMoves'))}</span><span class=\"pill\">source required {esc(counts.get('sourceRequiredMoves'))}</span></div></header>
<section class=\"grid\">{cards}</section>
<section class=\"truth\"><p class=\"eyebrow\">Truth boundary</p><p>Rehearsal only. Whole sources stay intact. Timeline writes require explicit review and a later apply seam.</p></section>
</main></body></html>"""


def render_move_card(move: dict[str, Any]) -> str:
    review_brief = move.get("reviewBrief") if isinstance(move.get("reviewBrief"), dict) else {}
    scrub_window = review_brief.get("scrubWindow") if isinstance(review_brief.get("scrubWindow"), dict) else {}
    note_lanes = review_brief.get("noteLanes") if isinstance(review_brief.get("noteLanes"), list) else []
    questions = review_brief.get("humanQuestions") if isinstance(review_brief.get("humanQuestions"), list) else []
    options = review_brief.get("decisionOptions") if isinstance(review_brief.get("decisionOptions"), list) else []
    checklist = "".join(f"<li>{esc(item)}</li>" for item in move.get("rehearsalChecklist") or [])
    lanes_html = "".join(
        f"<li><strong>{esc(lane.get('label') if isinstance(lane, dict) else '')}</strong> <code>{esc(lane.get('flag') if isinstance(lane, dict) else '')}</code><br><span class=\"muted\">{esc(lane.get('prompt') if isinstance(lane, dict) else '')}</span></li>"
        for lane in note_lanes
        if isinstance(lane, dict)
    )
    questions_html = "".join(f"<li>{esc(question)}</li>" for question in questions[:6])
    options_html = "".join(
        f"""<details><summary>{esc(option.get('decision') if isinstance(option, dict) else '')} · {esc(option.get('whenToUse') if isinstance(option, dict) else '')}</summary>
<p><strong>Dry run</strong><br><code>{esc(option.get('dryRunCommand') if isinstance(option, dict) else '')}</code></p>
<p><strong>Record</strong><br><code>{esc(option.get('recordCommand') if isinstance(option, dict) else '')}</code></p>
</details>"""
        for option in options
        if isinstance(option, dict)
    )
    return f"""<article class=\"card {esc(move.get('rehearsalKind'))}\">
<div class=\"pills\"><span class=\"pill\">{esc(move.get('proposalId'))}</span><span class=\"pill\">{esc(move.get('timeLabel'))}</span><span class=\"pill\">{esc(move.get('reviewStatus'))}</span><span class=\"pill\">{esc(move.get('reviewDecision'))}</span></div>
<h2>{esc(move.get('wouldCreate'))}</h2>
<p class=\"action\">{esc(move.get('programMove'))}</p>
<p>{esc(move.get('explanation'))}</p>
<p class=\"muted\"><strong>Tradeoff:</strong> {esc(move.get('tradeoff'))}</p>
<p><strong>Cadence guardrail:</strong> {esc(move.get('cadenceGuardrail'))}</p>
<p><strong>Review question:</strong> {esc(move.get('reviewQuestion'))}</p>
<p><strong>Scrub window:</strong> <code>{esc(scrub_window.get('label') if scrub_window else '')}</code><br><span class=\"muted\">{esc(scrub_window.get('why') if scrub_window else '')}</span></p>
<h3>Note lanes</h3>
<ul>{lanes_html}</ul>
<h3>Review questions</h3>
<ul>{questions_html}</ul>
<h3>Decision examples</h3>
{options_html}
<h3>Checklist</h3>
<ul>{checklist}</ul>
<p><code>{esc(move.get('dryRunReviewCommand'))}</code></p>
</article>"""


def main() -> int:
    parser = argparse.ArgumentParser(description="Build Episode 4 edit rehearsal packet.")
    parser.add_argument("--intelligence-pointer", default=str(INTELLIGENCE_POINTER))
    parser.add_argument("--review-ledger-pointer", default=str(REVIEW_LEDGER_POINTER))
    parser.add_argument("--out-root", default=str(OUT_ROOT))
    parser.add_argument("--latest-pointer", default=str(LATEST_POINTER))
    parser.add_argument("--per-group-limit", type=int, default=4)
    parser.add_argument("--next", action="store_true", help="Render the next unreviewed rehearsal move instead of the full packet.")
    parser.add_argument("--proposal-id", default="", help="Pick a specific rehearsal proposal for --next.")
    parser.add_argument("--decision", default="", help="For --next, run the selected decision option. Defaults to dry-run unless --record-decision is set.")
    parser.add_argument("--record-decision", action="store_true", help="With --next --decision, append the selected decision to the review ledger.")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--markdown", action="store_true")
    args = parser.parse_args()
    packet = build_packet(args)
    if args.next:
        next_packet = build_next_packet(packet, args.proposal_id)
        if args.decision:
            decision_packet = run_next_decision(next_packet, args.decision, args.record_decision)
            if args.json:
                print(json.dumps(decision_packet, indent=2, sort_keys=True))
            elif args.markdown:
                print(render_next_decision_markdown(decision_packet), end="")
            else:
                print(f"Episode 4 next rehearsal decision: {decision_packet.get('status')}")
                print(f"  Decision: {decision_packet.get('decision')} record={decision_packet.get('record')}")
                print(f"  Proposal: {(decision_packet.get('sourceMove') or {}).get('proposalId')}")
                print(f"  Ledger mutated: {decision_packet.get('truth', {}).get('reviewLedgerMutated')}")
            return 0
        if args.json:
            print(json.dumps(next_packet, indent=2, sort_keys=True))
        else:
            print(render_next_markdown(next_packet), end="")
        return 0
    if args.json:
        print(json.dumps(packet, indent=2, sort_keys=True))
    elif args.markdown:
        print(render_markdown(packet), end="")
    else:
        counts = packet.get("counts") or {}
        print(f"Episode 4 edit rehearsal: {packet.get('status')}")
        print(f"  Board: {packet.get('htmlPath')}")
        print(f"  JSON: {packet.get('jsonPath')}")
        print(f"  Moves: {counts.get('moves')} unreviewed={counts.get('unreviewedMoves')} sourceRequired={counts.get('sourceRequiredMoves')}")
        print(f"  Next: {packet.get('nextSafestAction')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
