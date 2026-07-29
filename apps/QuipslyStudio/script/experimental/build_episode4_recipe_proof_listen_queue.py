#!/usr/bin/env python3
"""Build an Episode 4 proof-listen queue for the YouTube-standard recipe.

This turns generated recipe operations and review-ledger state into an ordered
human/agent checklist for human-feeling edits: cadence, J/L cuts, reaction
covers, jump-cut risk, source placeholders, and when not to cut.

Safety boundary: read-only queue generation. This command never writes app
session state, imports media, mutates source files, renders exports, publishes,
or marks review decisions.
"""
from __future__ import annotations

import argparse
import html
import json
import re
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
LEDGER_POINTER = RELEASE_ROOT / "review-board/episode4-youtube-standard-recipe-review/latest-episode4-youtube-standard-recipe-review-ledger.json"
OUT_ROOT = RELEASE_ROOT / "review-board/episode4-recipe-proof-listen-queue"
LATEST_POINTER = OUT_ROOT / "latest-episode4-recipe-proof-listen-queue.json"
LATEST_NEXT_POINTER = OUT_ROOT / "latest-episode4-recipe-proof-listen-next.json"
SCHEMA = "quipsly.episode4-recipe-proof-listen-queue.v1"
REVIEW_LEDGER_SCRIPT = Path(__file__).with_name("build_episode4_youtube_recipe_review_ledger.py")
VALID_DECISIONS = {"keep", "refine", "reject", "hold", "needs-source", "needs-listen", "needs-visual-review"}
SOURCE_AUDIO_CANDIDATES = [
    Path("/Volumes/My Passport/Episode 4/Charlie Ep4.wav"),
    Path("/Volumes/My Passport/Charlie Ep4.wav"),
    Path("/Volumes/My Passport/Desktop Media/Charlie Ep4.wav"),
]


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-recipe-proof-listen")


def esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""))


def load_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except Exception:
        return {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def load_pointer(path: Path) -> dict[str, Any]:
    pointer = load_json(path)
    target = str(pointer.get("ledgerPath") or pointer.get("jsonPath") or "")
    if target:
        payload = load_json(Path(target))
        if payload:
            return {**pointer, **payload, "pointerPath": str(path)}
    return {**pointer, "pointerPath": str(path)}


def dict_list(value: Any) -> list[dict[str, Any]]:
    return value if isinstance(value, list) and all(isinstance(item, dict) for item in value) else []


def as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def as_text(value: Any, fallback: str = "") -> str:
    if value is None:
        return fallback
    text = str(value).strip()
    return text if text else fallback


def as_float(value: Any, fallback: float = 0.0) -> float:
    try:
        return float(value)
    except Exception:
        return fallback


def op_id(operation: dict[str, Any]) -> str:
    return as_text(operation.get("operationId") or operation.get("id") or operation.get("cueId"), "unknown-operation")


def op_kind(operation: dict[str, Any]) -> str:
    return as_text(operation.get("operationKind"), "unknown")


def start_seconds(operation: dict[str, Any]) -> float:
    return as_float(operation.get("sequenceStartSeconds") or operation.get("startSeconds"))


def confidence_weight(value: str) -> int:
    text = value.casefold()
    if text == "high":
        return 0
    if text == "mixed":
        return 8
    if text == "medium":
        return 12
    if text == "low":
        return 18
    return 10


def principle_pack(kind: str, operation: dict[str, Any], review: dict[str, Any]) -> dict[str, Any]:
    reason = as_text(operation.get("reason"))
    tradeoff = as_text(operation.get("tradeoff"))
    if kind == "cadence-tighten-review":
        return {
            "reviewMode": "listen-first",
            "editIntent": "Tighten only the part that feels like friction, not the part that feels human.",
            "listenFor": [
                "Is this dead air, a restart, or a meaningful pause?",
                "Does the cut preserve breath and thought rhythm?",
                "Would tightening make the hosts sound over-processed?",
            ],
            "visualCheck": ["If a cut creates a jump, cover it with a real reaction or angle change rather than pretending it vanished."],
            "jCutHint": "If the next idea is clear before the picture changes, let audio lead by a few frames rather than slamming both together.",
            "lCutHint": "Let a natural laugh, breath, or reaction trail over the visual cut if it keeps the conversation human.",
            "whenNotToCut": "Do not cut thoughtful silence, emotional processing, or a pause that makes the next line land.",
            "risk": "robotic cadence",
            "suggestedDecision": "needs-listen",
        }
    if kind == "reaction-cover-review":
        return {
            "reviewMode": "watch-and-listen",
            "editIntent": "Use genuine reaction to hide or improve a jump cut without losing conversational truth.",
            "listenFor": ["Does the covered audio still sound continuous?", "Does the reaction land because of what was said, not just because we need coverage?"],
            "visualCheck": ["Is the reaction real and readable?", "Does the cover prevent an ugly same-camera jump cut?"],
            "jCutHint": "Let the spoken setup begin before cutting to the reaction if the face is the payoff.",
            "lCutHint": "Hold reaction picture slightly after the line if it adds warmth or humor.",
            "whenNotToCut": "Do not use reaction cover if it feels like fake emphasis or hides useful speaker body language.",
            "risk": "fake-feeling cover",
            "suggestedDecision": "needs-visual-review",
        }
    if kind == "show-range-review":
        return {
            "reviewMode": "story-value check",
            "editIntent": "Confirm this island earns its time in the 35-45 minute YouTube version.",
            "listenFor": ["Does this section advance the episode argument, emotion, or humor?", "Can the section start later or end earlier without losing setup/reaction?"],
            "visualCheck": ["Does the active camera/source choice support who is carrying the moment?", "Are any source-clip placeholders clearly marked?"],
            "jCutHint": "If the island begins with setup audio, consider letting audio lead the visual source change.",
            "lCutHint": "If the island ends with a reaction, let the reaction breathe before the next section.",
            "whenNotToCut": "Do not trim setup that makes the later clip or insight understandable.",
            "risk": "bloated keep range" if "Merged" in reason else "under-reviewed keep range",
            "suggestedDecision": "needs-listen" if as_text(operation.get("confidence")).casefold() == "mixed" else "needs-visual-review",
        }
    if kind == "skip-range-review":
        return {
            "reviewMode": "context-loss check",
            "editIntent": "Confirm this can be skipped without damaging meaning, rhythm, or a later callback.",
            "listenFor": ["Is this repetition/setup deadwood, or does it seed a later idea?", "Does skipping create a harsh cadence jump?"],
            "visualCheck": ["Would a small reaction cover make this skip invisible?", "Is there a source/camera gap that should become intentional blank/skip behavior?"],
            "jCutHint": "Let the next kept audio arrive before the visual cut if the skip otherwise feels abrupt.",
            "lCutHint": "Let useful reaction or room tone bridge the skip if it keeps the seam human.",
            "whenNotToCut": "Do not cut if the section contains orientation, a callback setup, or a human beat that makes the next topic work.",
            "risk": "lost context",
            "suggestedDecision": "needs-listen",
        }
    if kind == "source-placeholder-slot":
        return {
            "reviewMode": "source recovery",
            "editIntent": "Keep the watched/source moment visible as missing evidence until the real clip is found.",
            "listenFor": ["Identify the exact clip being introduced.", "Notice whether podcast audio should lead into or out of the source clip."],
            "visualCheck": ["Do not substitute host-camera footage and call it source media.", "After source is found, check whether the clip supports or interrupts the conversation."],
            "jCutHint": as_text(operation.get("jCutHint"), "Let host audio set up the clip before source picture appears."),
            "lCutHint": as_text(operation.get("lCutHint"), "Let reaction audio continue after returning from the source clip if useful."),
            "whenNotToCut": "Do not promote this into real branch metadata until source intake confirms media.",
            "risk": "pretend source media",
            "suggestedDecision": "needs-source",
        }
    return {
        "reviewMode": "manual review",
        "editIntent": reason or tradeoff or "Review this operation before promotion.",
        "listenFor": ["Does this edit feel human?"],
        "visualCheck": ["Does this visual decision match the audio intent?"],
        "jCutHint": "Use audio lead only when it improves comprehension.",
        "lCutHint": "Use audio trail only when it preserves reaction or flow.",
        "whenNotToCut": "Do not cut just because silence exists.",
        "risk": "unknown edit risk",
        "suggestedDecision": as_text(review.get("decision"), "needs-listen"),
    }


def priority_for(operation: dict[str, Any], review: dict[str, Any]) -> tuple[int, float, str]:
    kind = op_kind(operation)
    decision = as_text(review.get("decision"), "pending")
    status = as_text(review.get("status"), "unreviewed")
    confidence = as_text(operation.get("confidence"), "unknown")
    priority = 100
    if kind == "source-placeholder-slot":
        priority = 0
    elif kind == "cadence-tighten-review":
        priority = 10
    elif kind == "reaction-cover-review":
        priority = 18
    elif kind == "show-range-review":
        priority = 32
    elif kind == "skip-range-review":
        priority = 40
    if status == "reviewed":
        priority += 100
    if decision == "needs-source":
        priority -= 4
    if decision == "needs-listen":
        priority -= 2
    priority += confidence_weight(confidence)
    return (priority, start_seconds(operation), op_id(operation))


def build_task(operation: dict[str, Any], review: dict[str, Any]) -> dict[str, Any]:
    kind = op_kind(operation)
    pack = principle_pack(kind, operation, review)
    oid = op_id(operation)
    decision = as_text(review.get("decision"), "pending")
    reviewer = as_text(review.get("reviewer"))
    command_decision = pack.get("suggestedDecision") or decision or "needs-listen"
    return {
        "operationId": oid,
        "operationKind": kind,
        "sequenceLabel": as_text(operation.get("sequenceLabel")),
        "sequenceStartSeconds": operation.get("sequenceStartSeconds") or operation.get("startSeconds"),
        "sequenceEndSeconds": operation.get("sequenceEndSeconds") or operation.get("endSeconds"),
        "reviewStatus": as_text(review.get("status"), "unreviewed"),
        "currentDecision": decision,
        "suggestedDecision": command_decision,
        "reviewer": reviewer,
        "confidence": as_text(operation.get("confidence"), "unknown"),
        "reason": as_text(operation.get("reason")),
        "tradeoff": as_text(operation.get("tradeoff")),
        "reviewMode": pack["reviewMode"],
        "editIntent": pack["editIntent"],
        "listenFor": pack["listenFor"],
        "visualCheck": pack["visualCheck"],
        "jCutHint": pack["jCutHint"],
        "lCutHint": pack["lCutHint"],
        "whenNotToCut": pack["whenNotToCut"],
        "risk": pack["risk"],
        "dryRunCommand": f"./script/agentctl.sh episode4-youtube-recipe-review-decision-dry-run {oid} {command_decision} Codex \"Proof-listened: add note here.\"",
        "recordCommand": f"./script/agentctl.sh episode4-youtube-recipe-review-decision {oid} {command_decision} Codex \"Proof-listened: add note here.\"",
    }


def counts_for(tasks: list[dict[str, Any]]) -> dict[str, Any]:
    by_kind: dict[str, int] = {}
    by_mode: dict[str, int] = {}
    by_decision: dict[str, int] = {}
    host_spine_tasks = [task for task in tasks if task["operationKind"] != "source-placeholder-slot"]
    for task in tasks:
        by_kind[task["operationKind"]] = by_kind.get(task["operationKind"], 0) + 1
        by_mode[task["reviewMode"]] = by_mode.get(task["reviewMode"], 0) + 1
        by_decision[task["currentDecision"]] = by_decision.get(task["currentDecision"], 0) + 1
    return {
        "tasks": len(tasks),
        "reviewNeeded": sum(1 for task in tasks if task["reviewStatus"] != "reviewed"),
        "listenFirst": sum(1 for task in tasks if "listen" in task["reviewMode"] or task["suggestedDecision"] == "needs-listen"),
        "visualReview": sum(1 for task in tasks if task["suggestedDecision"] == "needs-visual-review"),
        "sourceRecovery": sum(1 for task in tasks if task["suggestedDecision"] == "needs-source"),
        "hostSpineReviewableNow": len(host_spine_tasks),
        "hostSpineListenFirst": sum(1 for task in host_spine_tasks if "listen" in task["reviewMode"] or task["suggestedDecision"] == "needs-listen"),
        "hostSpineVisualReview": sum(1 for task in host_spine_tasks if task["suggestedDecision"] == "needs-visual-review"),
        "blockedByWatchedSource": sum(1 for task in tasks if task["operationKind"] == "source-placeholder-slot"),
        "byKind": by_kind,
        "byMode": by_mode,
        "byDecision": by_decision,
    }


def decision_cheat_sheet() -> list[dict[str, str]]:
    return [
        {
            "decision": "keep",
            "meaning": "This operation feels human and useful enough to promote after one final visual/audio proof.",
            "useWhen": "The cut preserves meaning, cadence, and source truth.",
        },
        {
            "decision": "refine",
            "meaning": "The idea is right, but timing, boundary, source choice, or framing needs adjustment.",
            "useWhen": "A smaller range, different J/L cut, or different reaction cover would make it better.",
        },
        {
            "decision": "reject",
            "meaning": "Do not promote this operation; keep it as training/review evidence.",
            "useWhen": "The suggestion hurts context, sounds robotic, feels fake, or solves a problem we do not have.",
        },
        {
            "decision": "needs-listen",
            "meaning": "Audio flow is the deciding evidence.",
            "useWhen": "Cadence, silence, breath, laugh timing, or context loss cannot be judged from the transcript alone.",
        },
        {
            "decision": "needs-visual-review",
            "meaning": "Picture/reaction/framing is the deciding evidence.",
            "useWhen": "The edit depends on whether a face, camera, or cover actually supports the moment.",
        },
        {
            "decision": "needs-source",
            "meaning": "The operation needs missing watched/source media before it can become real edit metadata.",
            "useWhen": "A clip-weave/source-placeholder cannot be honestly reviewed until source intake confirms a file.",
        },
    ]


def proof_runway_for(tasks: list[dict[str, Any]], limit: int = 8, *, include_source: bool = False) -> list[dict[str, Any]]:
    runway: list[dict[str, Any]] = []
    for task in tasks:
        if not include_source and task.get("operationKind") == "source-placeholder-slot":
            continue
        if len(runway) >= limit:
            break
        listen_for = task.get("listenFor") if isinstance(task.get("listenFor"), list) else []
        visual_check = task.get("visualCheck") if isinstance(task.get("visualCheck"), list) else []
        runway.append({
            "rank": len(runway) + 1,
            "operationId": task.get("operationId"),
            "operationKind": task.get("operationKind"),
            "sequenceLabel": task.get("sequenceLabel"),
            "sequenceStartSeconds": task.get("sequenceStartSeconds"),
            "sequenceEndSeconds": task.get("sequenceEndSeconds"),
            "reviewMode": task.get("reviewMode"),
            "currentDecision": task.get("currentDecision"),
            "suggestedDecision": task.get("suggestedDecision"),
            "risk": task.get("risk"),
            "whyFirst": runway_reason_for(task),
            "proofQuestion": proof_question_for(task),
            "firstListenFor": listen_for[:2],
            "firstVisualCheck": visual_check[:2],
            "dryRunCommand": task.get("dryRunCommand"),
            "recordCommand": task.get("recordCommand"),
        })
    return runway


def source_recovery_runway_for(tasks: list[dict[str, Any]], limit: int = 5) -> list[dict[str, Any]]:
    return proof_runway_for([task for task in tasks if task.get("operationKind") == "source-placeholder-slot"], limit=limit, include_source=True)


def runway_reason_for(task: dict[str, Any]) -> str:
    kind = as_text(task.get("operationKind"))
    if kind == "source-placeholder-slot":
        return "Resolve the source-truth blocker first: this can stay as a placeholder, but must not become fake clip insertion."
    if kind == "cadence-tighten-review":
        return "Cadence edits are where the episode can start sounding either professional or over-scrubbed."
    if kind == "reaction-cover-review":
        return "Reaction covers are the humane way to hide jump cuts, but only if the reaction is real."
    if kind == "show-range-review":
        return "Large kept islands set the story spine and duration pressure for the 35-45 minute episode."
    if kind == "skip-range-review":
        return "Skip decisions save time, but can quietly damage callbacks and human flow."
    return "This task is early in the sorted proof queue and needs explicit review before branch promotion."


def proof_question_for(task: dict[str, Any]) -> str:
    mode = as_text(task.get("reviewMode")).casefold()
    if "source" in mode:
        return "What exact watched/source clip belongs here, and is it actually present in source intake?"
    if "listen" in mode:
        return "If this cut were made, would the hosts still sound like humans thinking together?"
    if "watch" in mode or "visual" in mode:
        return "Does the visual/reaction choice make the edit clearer without feeling fake?"
    if "context" in mode:
        return "Can this be skipped without losing setup, callback, meaning, or warmth?"
    if "story" in mode:
        return "Does this kept section earn its time in the public YouTube cut?"
    return "What evidence would make this safe to keep, refine, reject, or hold?"


def truth() -> dict[str, Any]:
    return {
        "readOnlyQueue": True,
        "reviewDecisionsRecorded": False,
        "timelineDecisionsWritten": False,
        "branchMetadataWritten": False,
        "clipsImported": False,
        "sourceFilesMutated": False,
        "exportsRendered": False,
        "externalPublishing": False,
        "versionsOverwritten": False,
        "filesDeleted": False,
    }


def safe_slug(value: Any) -> str:
    text = re.sub(r"[^a-zA-Z0-9._-]+", "-", str(value or "").strip()).strip("-")
    return text[:120] or "review-window"


def parse_clock_seconds(value: str) -> float | None:
    parts = [part.strip() for part in value.split(":")]
    if not parts or any(not part.isdigit() for part in parts):
        return None
    numbers = [int(part) for part in parts]
    if len(numbers) == 3:
        return float(numbers[0] * 3600 + numbers[1] * 60 + numbers[2])
    if len(numbers) == 2:
        return float(numbers[0] * 60 + numbers[1])
    if len(numbers) == 1:
        return float(numbers[0])
    return None


def parse_sequence_label_range(value: Any) -> tuple[float | None, float | None]:
    text = str(value or "")
    match = re.search(r"(\d{1,2}:\d{2}(?::\d{2})?)\s*(?:->|—|-|to)\s*(\d{1,2}:\d{2}(?::\d{2})?)", text)
    if not match:
        return None, None
    return parse_clock_seconds(match.group(1)), parse_clock_seconds(match.group(2))


def resolve_source_audio(explicit: Path | None = None) -> Path | None:
    if explicit and explicit.exists() and explicit.is_file():
        return explicit
    for candidate in SOURCE_AUDIO_CANDIDATES:
        if candidate.exists() and candidate.is_file():
            return candidate
    return None


def attach_proof_runway_audio(
    queue: dict[str, Any],
    session_dir: Path,
    source_audio: Path | None,
    *,
    disabled: bool = False,
    max_window_seconds: float = 150.0,
) -> None:
    runway = dict_list(queue.get("proofRunway"))
    audio_dir = session_dir / "proof-listen-audio"
    ffmpeg = shutil.which("ffmpeg")
    generated = 0
    skipped = 0
    errors = 0
    for item in runway:
        audio_status: dict[str, Any] = {
            "ok": False,
            "generated": False,
            "sourceAudioPath": str(source_audio) if source_audio else "",
        }
        if disabled:
            audio_status.update({"skipped": True, "reason": "audio extraction disabled"})
            skipped += 1
        elif not source_audio:
            audio_status.update({"skipped": True, "reason": "source audio not found"})
            skipped += 1
        elif not ffmpeg:
            audio_status.update({"skipped": True, "reason": "ffmpeg not found"})
            skipped += 1
        else:
            raw_start = item.get("sequenceStartSeconds")
            raw_end = item.get("sequenceEndSeconds")
            if raw_start is None or raw_end is None:
                parsed_start, parsed_end = parse_sequence_label_range(item.get("sequenceLabel"))
                raw_start = parsed_start
                raw_end = parsed_end
            start = max(0.0, as_float(raw_start) - 2.0)
            end = max(start, as_float(raw_end) + 2.0)
            duration = max(0.0, end - start)
            if duration <= 0.01:
                audio_status.update({"skipped": True, "reason": "invalid sequence range"})
                skipped += 1
            elif duration > max_window_seconds:
                audio_status.update({
                    "skipped": True,
                    "reason": f"window too long for quick proof-listen clip ({duration:.1f}s > {max_window_seconds:.1f}s)",
                    "startSeconds": start,
                    "durationSeconds": duration,
                })
                skipped += 1
            else:
                audio_dir.mkdir(parents=True, exist_ok=True)
                output = audio_dir / f"{int(item.get('rank') or 0):02d}-{safe_slug(item.get('operationId'))}.m4a"
                command = [
                    ffmpeg,
                    "-y",
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-ss",
                    f"{start:.3f}",
                    "-t",
                    f"{duration:.3f}",
                    "-i",
                    str(source_audio),
                    "-vn",
                    "-ac",
                    "1",
                    "-ar",
                    "48000",
                    "-c:a",
                    "aac",
                    "-b:a",
                    "128k",
                    str(output),
                ]
                result = subprocess.run(command, text=True, capture_output=True, check=False, timeout=60)
                if result.returncode == 0 and output.exists() and output.stat().st_size > 0:
                    audio_status.update({
                        "ok": True,
                        "generated": True,
                        "path": str(output),
                        "startSeconds": start,
                        "durationSeconds": duration,
                        "sourceAudioPath": str(source_audio),
                    })
                    generated += 1
                else:
                    audio_status.update({
                        "error": (result.stderr or result.stdout or "ffmpeg failed").strip()[:1000],
                        "startSeconds": start,
                        "durationSeconds": duration,
                    })
                    errors += 1
        item["audioReviewClip"] = audio_status
    queue["proofAudio"] = {
        "enabled": not disabled,
        "sourceAudioPath": str(source_audio) if source_audio else "",
        "generated": generated,
        "skipped": skipped,
        "errors": errors,
        "directory": str(audio_dir) if generated else "",
        "maxWindowSeconds": max_window_seconds,
        "truth": "Generated proof-listen clips are sidecar review artifacts only; original source audio is untouched.",
    }
    counts = as_dict(queue.get("counts"))
    counts["audioReviewWindows"] = generated
    counts["audioReviewWindowSkips"] = skipped
    counts["audioReviewWindowErrors"] = errors
    queue["counts"] = counts


def render_markdown(queue: dict[str, Any]) -> str:
    counts = as_dict(queue.get("counts"))
    runway = dict_list(queue.get("proofRunway"))
    cheat_sheet = dict_list(queue.get("decisionCheatSheet"))
    proof_audio = as_dict(queue.get("proofAudio"))
    lines = [
        "# Episode 4 recipe proof-listen queue",
        "",
        f"Status: `{queue.get('status')}`",
        f"Branch: `{as_dict(queue.get('branch')).get('branchId', '')}`",
        f"Tasks: `{counts.get('tasks', 0)}`",
        f"Host-spine reviewable now: `{counts.get('hostSpineReviewableNow', 0)}`",
        f"Listen-first: `{counts.get('listenFirst', 0)}`",
        f"Visual review: `{counts.get('visualReview', 0)}`",
        f"Source recovery: `{counts.get('sourceRecovery', 0)}`",
        f"Blocked by watched/source media: `{counts.get('blockedByWatchedSource', 0)}`",
        f"Audio review windows: `{counts.get('audioReviewWindows', 0)}`",
        "",
        "## How to use this",
        "",
        "Work from the top. For each task, listen/watch the range, decide whether the suggestion feels human, then record a sidecar review decision. This does not write timeline metadata.",
        "",
        "## Audio review evidence",
        "",
        f"- Source audio: `{proof_audio.get('sourceAudioPath') or 'missing'}`",
        f"- Generated windows: `{proof_audio.get('generated', 0)}`",
        f"- Skipped windows: `{proof_audio.get('skipped', 0)}`",
        f"- Errors: `{proof_audio.get('errors', 0)}`",
        f"- Directory: `{proof_audio.get('directory') or 'none'}`",
        "",
        "## Proof runway",
        "",
        "Start here before scanning the full queue. This runway deliberately excludes watched/source placeholders so the host-spine edit can keep improving while missing clips are recovered separately.",
        "",
    ]
    for item in runway:
        lines.extend(
            [
                f"### {item.get('rank')}. {item.get('operationId')} - {item.get('sequenceLabel')}",
                "",
                f"- Mode: `{item.get('reviewMode')}`",
                f"- Suggested decision: `{item.get('suggestedDecision')}`",
                f"- Why first: {item.get('whyFirst')}",
                f"- Proof question: {item.get('proofQuestion')}",
                "- First listen for:",
            ]
        )
        for listen_item in item.get("firstListenFor") or []:
            lines.append(f"  - {listen_item}")
        lines.append("- First visual check:")
        for visual_item in item.get("firstVisualCheck") or []:
            lines.append(f"  - {visual_item}")
        lines.extend([f"- Dry run: `{item.get('dryRunCommand')}`", ""])
        audio = as_dict(item.get("audioReviewClip"))
        if audio.get("ok"):
            lines.insert(-1, f"- Audio review clip: `{audio.get('path')}`")
        elif audio:
            lines.insert(-1, f"- Audio review clip: `{audio.get('reason') or audio.get('error') or 'not generated'}`")
    source_runway = dict_list(queue.get("sourceRecoveryRunway"))
    if source_runway:
        lines.extend(
            [
                "## Source recovery runway",
                "",
                "These are still important, but they should not freeze host-spine review. Recover files, validate candidates, then rerun intake before promotion.",
                "",
            ]
        )
        for item in source_runway:
            lines.extend(
                [
                    f"### {item.get('rank')}. {item.get('operationId')} - {item.get('sequenceLabel')}",
                    "",
                    f"- Proof question: {item.get('proofQuestion')}",
                    f"- Next: `{item.get('dryRunCommand')}`",
                    "",
                ]
            )
    lines.extend(
        [
            "## Decision cheat sheet",
            "",
        ]
    )
    for item in cheat_sheet:
        lines.extend(
            [
                f"- `{item.get('decision')}`: {item.get('meaning')}",
                f"  - Use when: {item.get('useWhen')}",
            ]
        )
    lines.extend(
        [
            "",
            "## Full queue",
            "",
        ]
    )
    for index, task in enumerate(dict_list(queue.get("tasks"))[:25], start=1):
        lines.extend(
            [
                f"### {index}. {task.get('operationId')} - {task.get('sequenceLabel')}",
                "",
                f"- Kind: `{task.get('operationKind')}`",
                f"- Mode: `{task.get('reviewMode')}`",
                f"- Current decision: `{task.get('currentDecision')}`",
                f"- Suggested decision: `{task.get('suggestedDecision')}`",
                f"- Intent: {task.get('editIntent')}",
                f"- Risk: `{task.get('risk')}`",
                f"- J-cut: {task.get('jCutHint')}",
                f"- L-cut: {task.get('lCutHint')}",
                f"- When not to cut: {task.get('whenNotToCut')}",
                "- Listen for:",
            ]
        )
        for item in task.get("listenFor") or []:
            lines.append(f"  - {item}")
        lines.append("- Visual check:")
        for item in task.get("visualCheck") or []:
            lines.append(f"  - {item}")
        lines.extend([f"- Dry run: `{task.get('dryRunCommand')}`", ""])
    lines.extend(
        [
            "## Safety",
            "",
            "Read-only queue. No media, timeline, export, or publishing mutation.",
            "",
        ]
    )
    return "\n".join(lines)


def render_html(queue: dict[str, Any]) -> str:
    counts = as_dict(queue.get("counts"))
    proof_audio = as_dict(queue.get("proofAudio"))
    runway_cards = []
    for item in dict_list(queue.get("proofRunway")):
        listen = "".join(f"<li>{esc(value)}</li>" for value in item.get("firstListenFor", []))
        visual = "".join(f"<li>{esc(value)}</li>" for value in item.get("firstVisualCheck", []))
        audio = as_dict(item.get("audioReviewClip"))
        audio_html = (
            f"<p><strong>Audio review:</strong> <code>{esc(audio.get('path'))}</code></p>"
            if audio.get("ok")
            else f"<p><strong>Audio review:</strong> {esc(audio.get('reason') or audio.get('error') or 'not generated')}</p>"
        )
        runway_cards.append(
            "<article class='runway-card'>"
            f"<p class='meta'>#{esc(item.get('rank'))} · {esc(item.get('reviewMode'))} · {esc(item.get('suggestedDecision'))}</p>"
            f"<h2>{esc(item.get('operationId'))} <span>{esc(item.get('sequenceLabel'))}</span></h2>"
            f"<p><strong>Why first:</strong> {esc(item.get('whyFirst'))}</p>"
            f"<p><strong>Proof question:</strong> {esc(item.get('proofQuestion'))}</p>"
            f"{audio_html}"
            f"<h3>First listen for</h3><ul>{listen}</ul><h3>First visual check</h3><ul>{visual}</ul>"
            f"<code>{esc(item.get('dryRunCommand'))}</code>"
            "</article>"
        )
    cheat_rows = "".join(
        "<tr>"
        f"<td><code>{esc(item.get('decision'))}</code></td>"
        f"<td>{esc(item.get('meaning'))}</td>"
        f"<td>{esc(item.get('useWhen'))}</td>"
        "</tr>"
        for item in dict_list(queue.get("decisionCheatSheet"))
    )
    cards = []
    for task in dict_list(queue.get("tasks"))[:60]:
        listen = "".join(f"<li>{esc(item)}</li>" for item in task.get("listenFor", []))
        visual = "".join(f"<li>{esc(item)}</li>" for item in task.get("visualCheck", []))
        cards.append(
            "<article class='card'>"
            f"<p class='meta'>{esc(task.get('operationKind'))} · {esc(task.get('reviewMode'))} · {esc(task.get('currentDecision'))}</p>"
            f"<h2>{esc(task.get('operationId'))} <span>{esc(task.get('sequenceLabel'))}</span></h2>"
            f"<p><strong>Intent:</strong> {esc(task.get('editIntent'))}</p>"
            f"<p><strong>Risk:</strong> {esc(task.get('risk'))}</p>"
            f"<p><strong>J-cut:</strong> {esc(task.get('jCutHint'))}</p>"
            f"<p><strong>L-cut:</strong> {esc(task.get('lCutHint'))}</p>"
            f"<p><strong>When not to cut:</strong> {esc(task.get('whenNotToCut'))}</p>"
            f"<h3>Listen for</h3><ul>{listen}</ul><h3>Visual check</h3><ul>{visual}</ul>"
            f"<code>{esc(task.get('dryRunCommand'))}</code>"
            "</article>"
        )
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Episode 4 proof-listen queue</title>
<style>
:root {{ color-scheme: dark; --bg:#10170f; --panel:#1c261b; --ink:#f7edd3; --muted:#c6b58b; --honey:#f1cb59; --moss:#79cf8e; --clay:#d76b55; --creek:#6dbfd3; }}
body {{ margin:0; padding:32px; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif; background: radial-gradient(circle at top left,#243b29,var(--bg)); color:var(--ink); }}
.hero,.card,.runway-card,.cheat {{ max-width:1120px; margin:0 auto 16px; border-radius:24px; background:rgba(28,38,27,.9); border:1px solid rgba(241,203,89,.22); padding:22px; }}
.runway-card {{ border-color:rgba(109,191,211,.42); background:linear-gradient(135deg,rgba(109,191,211,.12),rgba(28,38,27,.92)); }}
h1 {{ margin:.2rem 0; font-size:34px; }} h2 {{ margin:.2rem 0 .5rem; }} h2 span {{ color:var(--muted); font-size:15px; }} h3 {{ color:var(--honey); font-size:13px; text-transform:uppercase; letter-spacing:.12em; }}
.meta {{ color:var(--honey); text-transform:uppercase; letter-spacing:.12em; font-size:12px; font-weight:900; }}
.stats {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px; margin-top:14px; }} .stat {{ padding:12px; border-radius:16px; background:rgba(255,255,255,.06); }} .stat b {{ color:var(--moss); font-size:24px; display:block; }}
li {{ margin:.35rem 0; color:var(--muted); }} code {{ display:block; white-space:pre-wrap; color:var(--creek); background:rgba(0,0,0,.22); padding:10px; border-radius:12px; }}
table {{ width:100%; border-collapse:collapse; }} td,th {{ border-top:1px solid rgba(255,255,255,.1); padding:10px; text-align:left; vertical-align:top; }} th {{ color:var(--honey); }}
</style>
</head>
<body>
<section class='hero'>
<p class='meta'>Quipsly cut intelligence</p>
<h1>Episode 4 proof-listen queue</h1>
<p>Review generated edit operations for human cadence, J/L cuts, reaction cover, jump-cut risk, and when not to cut. This queue is read-only.</p>
<div class='stats'>
<div class='stat'><b>{esc(counts.get('tasks', 0))}</b>tasks</div>
<div class='stat'><b>{esc(counts.get('hostSpineReviewableNow', 0))}</b>host-spine now</div>
<div class='stat'><b>{esc(counts.get('listenFirst', 0))}</b>listen-first</div>
<div class='stat'><b>{esc(counts.get('visualReview', 0))}</b>visual review</div>
<div class='stat'><b>{esc(counts.get('sourceRecovery', 0))}</b>source recovery</div>
<div class='stat'><b>{esc(counts.get('blockedByWatchedSource', 0))}</b>blocked source</div>
<div class='stat'><b>{esc(counts.get('audioReviewWindows', 0))}</b>audio windows</div>
</div>
<p><strong>Proof audio:</strong> {esc(proof_audio.get('sourceAudioPath') or 'missing')} · generated {esc(proof_audio.get('generated', 0))}, skipped {esc(proof_audio.get('skipped', 0))}, errors {esc(proof_audio.get('errors', 0))}</p>
</section>
<section class='hero'>
<p class='meta'>Start here</p>
<h1>Proof runway</h1>
<p>Do these first. The main runway excludes watched/source placeholders so missing clip files do not freeze host-spine cadence, reaction, and duration review.</p>
</section>
{''.join(runway_cards)}
<section class='cheat'>
<p class='meta'>Review language</p>
<h1>Decision cheat sheet</h1>
<table><thead><tr><th>Decision</th><th>Meaning</th><th>Use when</th></tr></thead><tbody>{cheat_rows}</tbody></table>
</section>
{''.join(cards)}
</body>
</html>
"""


def selected_next_item(queue: dict[str, Any], operation_id: str = "") -> dict[str, Any]:
    runway = dict_list(queue.get("hostSpineRunway") or queue.get("proofRunway"))
    tasks = dict_list(queue.get("tasks"))
    if operation_id:
        selected = next((item for item in runway if as_text(item.get("operationId")) == operation_id), {})
        if selected:
            return selected
        task = next((item for item in tasks if as_text(item.get("operationId")) == operation_id), {})
        if task:
            listen_for = task.get("listenFor") if isinstance(task.get("listenFor"), list) else []
            visual_check = task.get("visualCheck") if isinstance(task.get("visualCheck"), list) else []
            return {
                "rank": 0,
                "operationId": task.get("operationId"),
                "operationKind": task.get("operationKind"),
                "sequenceLabel": task.get("sequenceLabel"),
                "sequenceStartSeconds": task.get("sequenceStartSeconds"),
                "sequenceEndSeconds": task.get("sequenceEndSeconds"),
                "reviewMode": task.get("reviewMode"),
                "currentDecision": task.get("currentDecision"),
                "suggestedDecision": task.get("suggestedDecision"),
                "risk": task.get("risk"),
                "whyFirst": runway_reason_for(task),
                "proofQuestion": proof_question_for(task),
                "firstListenFor": listen_for[:2],
                "firstVisualCheck": visual_check[:2],
                "dryRunCommand": task.get("dryRunCommand"),
                "recordCommand": task.get("recordCommand"),
            }
        return {}
    return runway[0] if runway else {}


def enrich_next_item_with_audio(queue: dict[str, Any], item: dict[str, Any]) -> dict[str, Any]:
    if not item:
        return {}
    operation_id = as_text(item.get("operationId"))
    audio_candidates = dict_list(queue.get("proofRunway")) + dict_list(queue.get("hostSpineRunway"))
    audio_item = next(
        (
            runway_item
            for runway_item in audio_candidates
            if as_text(runway_item.get("operationId")) == operation_id
        ),
        {},
    )
    enriched = dict(item)
    if audio_item.get("audioReviewClip"):
        enriched["audioReviewClip"] = audio_item.get("audioReviewClip")
    decision = as_text(enriched.get("suggestedDecision"), "needs-listen")
    enriched["richNoteCommandTemplate"] = (
        f"./script/agentctl.sh episode4-youtube-recipe-review-decision-dry-run {operation_id} {decision} Codex "
        "\"Short decision note\" "
        "--audio-note \"What the cadence/audio proved\" "
        "--visual-note \"What the picture/reaction proved\" "
        "--cadence-note \"What to preserve or tighten\""
    )
    enriched["recordCommandTemplate"] = enriched["richNoteCommandTemplate"].replace("-decision-dry-run", "-decision")
    return enriched


def build_next_payload(queue: dict[str, Any], operation_id: str = "") -> dict[str, Any]:
    item = enrich_next_item_with_audio(queue, selected_next_item(queue, operation_id))
    if item:
        item["queueHtmlPath"] = queue.get("htmlPath")
    return {
        "schema": SCHEMA + ".next-host-spine-proof.v1",
        "generatedAt": iso_now(),
        "status": "episode4-recipe-proof-listen-next-ready" if item else "episode4-recipe-proof-listen-next-missing",
        "queueJsonPath": queue.get("jsonPath"),
        "queueMarkdownPath": queue.get("markdownPath"),
        "queueHtmlPath": queue.get("htmlPath"),
        "counts": queue.get("counts"),
        "item": item,
        "uiContract": proof_review_ui_contract(item),
        "nextSafestAction": (
            "Listen/watch this one host-spine operation, then record a sidecar review decision with rich audio/visual/cadence notes."
            if item
            else "Regenerate the proof-listen queue or choose a valid operation ID."
        ),
        "truth": truth(),
    }


def proof_review_ui_contract(item: dict[str, Any]) -> dict[str, Any]:
    if not item:
        return {
            "component": "CutIntelligenceNextProofCard",
            "state": "empty",
            "primaryAction": None,
            "secondaryActions": [],
            "safety": {"timelineWriteAllowed": False, "sourceMutationAllowed": False, "externalPublishAllowed": False},
        }
    operation_id = as_text(item.get("operationId"))
    suggested = as_text(item.get("suggestedDecision"), "needs-listen")
    return {
        "component": "CutIntelligenceNextProofCard",
        "state": "review-ready",
        "bindsTo": {
            "operationId": operation_id,
            "sequenceLabel": as_text(item.get("sequenceLabel")),
            "reviewMode": as_text(item.get("reviewMode")),
            "audioReviewClipPath": as_text(as_dict(item.get("audioReviewClip")).get("path")),
        },
        "primaryAction": {
            "id": "proof-listen-dry-run",
            "label": "Dry-run review note",
            "intent": "Preview the sidecar review event before recording it.",
            "command": f"./script/agentctl.sh episode4-recipe-proof-listen-next-decision-dry-run {suggested} Codex \"Proof-listened: add note here.\" --audio-note \"What the ear proves\" --visual-note \"What the picture proves\" --cadence-note \"What to preserve or tighten\" --markdown",
            "writes": "none",
            "risk": "safe-preview",
        },
        "secondaryActions": [
            {
                "id": "play-audio-window",
                "label": "Play proof audio",
                "intent": "Listen to the small sidecar audio window before making a cadence judgment.",
                "targetPath": as_text(as_dict(item.get("audioReviewClip")).get("path")),
                "writes": "none",
                "risk": "safe-review",
            },
            {
                "id": "record-needs-listen",
                "label": "Record needs-listen",
                "intent": "Record that the operation still needs audio/cadence judgment.",
                "command": f"./script/agentctl.sh episode4-recipe-proof-listen-next-decision needs-listen Codex \"Needs a human-feeling cadence listen.\" --audio-note \"Add what the ear proved\" --visual-note \"Add any visual jump/reaction note\" --cadence-note \"Add what to preserve or tighten\" --markdown",
                "writes": "sidecar-review-ledger-only",
                "risk": "reversible-ledger-note",
            },
            {
                "id": "record-refine",
                "label": "Record refine",
                "intent": "Record that the idea may work but timing, boundary, or cover needs adjustment.",
                "command": f"./script/agentctl.sh episode4-recipe-proof-listen-next-decision refine Codex \"Refine timing/boundary before promotion.\" --audio-note \"Add audio evidence\" --visual-note \"Add visual evidence\" --cadence-note \"Add cadence evidence\" --markdown",
                "writes": "sidecar-review-ledger-only",
                "risk": "reversible-ledger-note",
            },
            {
                "id": "record-reject",
                "label": "Record reject",
                "intent": "Record that this suggestion hurts cadence, context, or visual truth.",
                "command": f"./script/agentctl.sh episode4-recipe-proof-listen-next-decision reject Codex \"Reject: this cut would hurt the episode.\" --audio-note \"Add audio evidence\" --visual-note \"Add visual evidence\" --cadence-note \"Add cadence evidence\" --markdown",
                "writes": "sidecar-review-ledger-only",
                "risk": "reversible-ledger-note",
            },
            {
                "id": "open-full-queue",
                "label": "Open full proof queue",
                "intent": "Use when this one card is not enough context.",
                "targetPath": as_text(item.get("queueHtmlPath")),
                "writes": "none",
                "risk": "safe-review",
            },
        ],
        "forbiddenActions": [
            "Do not write timeline metadata from this card.",
            "Do not import clips from this card.",
            "Do not mutate source media from this card.",
            "Do not publish externally from this card.",
        ],
        "safety": {
            "timelineWriteAllowed": False,
            "sourceMutationAllowed": False,
            "clipImportAllowed": False,
            "externalPublishAllowed": False,
            "recordingScope": "sidecar-review-ledger-only",
        },
    }


def render_next_markdown(payload: dict[str, Any]) -> str:
    item = as_dict(payload.get("item"))
    if not item:
        return "# Episode 4 next host-spine proof item\n\nNo matching host-spine proof item found.\n"
    audio = as_dict(item.get("audioReviewClip"))
    ui = as_dict(payload.get("uiContract"))
    primary = as_dict(ui.get("primaryAction"))
    secondary = dict_list(ui.get("secondaryActions"))
    lines = [
        "# Episode 4 next host-spine proof item",
        "",
        f"- Status: `{payload.get('status')}`",
        f"- Operation: `{item.get('operationId')}`",
        f"- Kind: `{item.get('operationKind')}`",
        f"- Window: `{item.get('sequenceLabel')}`",
        f"- Mode: `{item.get('reviewMode')}`",
        f"- Suggested decision: `{item.get('suggestedDecision')}`",
        f"- Risk: `{item.get('risk')}`",
        "",
        "## Proof question",
        "",
        str(item.get("proofQuestion") or ""),
        "",
        "## Why this is next",
        "",
        str(item.get("whyFirst") or ""),
        "",
        "## Listen for",
        "",
    ]
    for value in item.get("firstListenFor") or []:
        lines.append(f"- {value}")
    lines.extend(["", "## Visual check", ""])
    for value in item.get("firstVisualCheck") or []:
        lines.append(f"- {value}")
    lines.extend(
        [
            "",
            "## Audio review clip",
            "",
            f"- Path: `{audio.get('path') or audio.get('reason') or audio.get('error') or 'not generated'}`",
            f"- Generated: `{audio.get('generated', False)}`",
            "",
            "## Commands",
            "",
            "Dry-run with rich notes:",
            "",
            "```bash",
            str(item.get("richNoteCommandTemplate") or item.get("dryRunCommand") or ""),
            "```",
            "",
            "Record after review:",
            "",
            "```bash",
            str(item.get("recordCommandTemplate") or item.get("recordCommand") or ""),
            "```",
            "",
            "## Safe UI actions",
            "",
            f"- Primary: `{primary.get('label') or 'none'}` - {primary.get('intent') or ''}",
            f"- Primary writes: `{primary.get('writes') or 'none'}`",
            "",
        ]
    )
    for action in secondary:
        lines.append(f"- `{action.get('label')}`: {action.get('intent')} (writes: `{action.get('writes')}`)")
    lines.extend(
        [
            "",
            "Forbidden here:",
            "",
        ]
    )
    for action in ui.get("forbiddenActions") or []:
        lines.append(f"- {action}")
    lines.extend(
        [
            "",
            "## Safety",
            "",
            "This next-item handoff is sidecar review guidance only. It does not write timeline metadata, import clips, render exports, mutate source media, or publish anything.",
            "",
        ]
    )
    return "\n".join(lines)


def file_url(value: Any) -> str:
    text = as_text(value)
    if not text:
        return ""
    try:
        return Path(text).as_uri()
    except Exception:
        return ""


def render_next_html(payload: dict[str, Any]) -> str:
    item = as_dict(payload.get("item"))
    ui = as_dict(payload.get("uiContract"))
    primary = as_dict(ui.get("primaryAction"))
    secondary = dict_list(ui.get("secondaryActions"))
    audio = as_dict(item.get("audioReviewClip"))
    audio_url = file_url(audio.get("path"))
    listen_items = "".join(f"<li>{esc(value)}</li>" for value in (item.get("firstListenFor") or []))
    visual_items = "".join(f"<li>{esc(value)}</li>" for value in (item.get("firstVisualCheck") or []))
    action_items = "".join(
        f"<li><strong>{esc(action.get('label'))}</strong> <span>{esc(action.get('intent'))}</span><em>writes: {esc(action.get('writes'))}</em></li>"
        for action in secondary
    )
    forbidden_items = "".join(f"<li>{esc(action)}</li>" for action in (ui.get("forbiddenActions") or []))
    audio_player = (
        f"<audio controls preload='metadata' src='{esc(audio_url)}'></audio>"
        if audio_url
        else f"<p class='warn'>{esc(audio.get('reason') or audio.get('error') or 'No audio review clip generated.')}</p>"
    )
    if not item:
        card = "<section class='card'><h1>No next host-spine proof item found.</h1></section>"
    else:
        card = f"""
        <section class="card">
          <p class="meta">Next host-spine proof · {esc(item.get('reviewMode'))} · {esc(item.get('suggestedDecision'))}</p>
          <h1>{esc(item.get('operationId'))}</h1>
          <p class="window">{esc(item.get('sequenceLabel'))}</p>
          <div class="question">
            <span>Proof question</span>
            <strong>{esc(item.get('proofQuestion'))}</strong>
          </div>
          {audio_player}
          <div class="grid">
            <article>
              <h2>Listen for</h2>
              <ul>{listen_items}</ul>
            </article>
            <article>
              <h2>Visual check</h2>
              <ul>{visual_items}</ul>
            </article>
          </div>
          <article class="why">
            <h2>Why this is next</h2>
            <p>{esc(item.get('whyFirst'))}</p>
            <p><strong>Risk:</strong> {esc(item.get('risk'))}</p>
          </article>
          <article class="commands">
            <h2>Safe UI actions</h2>
            <p><strong>Primary:</strong> {esc(primary.get('label') or 'none')} · {esc(primary.get('intent') or '')} · writes: {esc(primary.get('writes') or 'none')}</p>
            <ul class="actions">{action_items}</ul>
            <h2>Forbidden here</h2>
            <ul>{forbidden_items}</ul>
            <h2>Dry-run with rich notes</h2>
            <code>{esc(item.get('richNoteCommandTemplate') or item.get('dryRunCommand'))}</code>
            <h2>Record after review</h2>
            <code>{esc(item.get('recordCommandTemplate') or item.get('recordCommand'))}</code>
          </article>
        </section>
        """
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Episode 4 next host-spine proof</title>
<style>
:root {{ color-scheme: dark; --bg:#10170f; --panel:#1c261b; --ink:#f7edd3; --muted:#c6b58b; --honey:#f1cb59; --moss:#79cf8e; --clay:#d76b55; --creek:#6dbfd3; }}
body {{ margin:0; min-height:100vh; display:grid; place-items:center; padding:28px; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif; background: radial-gradient(circle at top left,#284229,var(--bg)); color:var(--ink); }}
.card {{ width:min(1040px, 100%); border-radius:30px; padding:28px; background:linear-gradient(135deg,rgba(28,38,27,.96),rgba(16,23,15,.96)); border:1px solid rgba(241,203,89,.28); box-shadow:0 28px 90px rgba(0,0,0,.38); }}
.meta {{ margin:0 0 8px; color:var(--honey); text-transform:uppercase; letter-spacing:.16em; font-size:12px; font-weight:900; }}
h1 {{ margin:.1rem 0; font-size:clamp(28px,4vw,52px); line-height:.95; }}
h2 {{ color:var(--honey); font-size:13px; text-transform:uppercase; letter-spacing:.13em; }}
.window {{ color:var(--muted); margin-top:4px; }}
.question {{ margin:22px 0; padding:18px; border-radius:22px; background:rgba(109,191,211,.11); border:1px solid rgba(109,191,211,.28); }}
.question span {{ display:block; color:var(--creek); text-transform:uppercase; letter-spacing:.12em; font-size:12px; font-weight:900; margin-bottom:6px; }}
.question strong {{ font-size:22px; }}
audio {{ width:100%; margin:0 0 20px; accent-color:var(--honey); }}
.grid {{ display:grid; grid-template-columns:1fr 1fr; gap:14px; }}
article {{ padding:16px; border-radius:20px; background:rgba(255,255,255,.055); border:1px solid rgba(255,255,255,.08); }}
li,p {{ color:var(--muted); line-height:1.5; }}
li em {{ display:block; color:var(--creek); font-style:normal; font-size:12px; margin-top:3px; }}
code {{ display:block; color:var(--creek); white-space:pre-wrap; overflow-wrap:anywhere; background:rgba(0,0,0,.28); padding:12px; border-radius:14px; }}
.warn {{ color:var(--clay); font-weight:800; }}
@media (max-width: 780px) {{ .grid {{ grid-template-columns:1fr; }} }}
</style>
</head>
<body>{card}</body>
</html>
"""


def write_next_payload(queue: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    session_dir = Path(as_text(queue.get("sessionDir"))) if queue.get("sessionDir") else OUT_ROOT / stamp()
    session_dir.mkdir(parents=True, exist_ok=True)
    json_path = session_dir / "episode4-recipe-proof-listen-next.json"
    markdown_path = session_dir / "episode4-recipe-proof-listen-next.md"
    html_path = session_dir / "next.html"
    payload.update({"jsonPath": str(json_path), "markdownPath": str(markdown_path), "htmlPath": str(html_path)})
    write_json(json_path, payload)
    markdown_path.write_text(render_next_markdown(payload), encoding="utf-8")
    html_path.write_text(render_next_html(payload), encoding="utf-8")
    write_json(
        LATEST_NEXT_POINTER,
        {
            "schema": SCHEMA + ".next-host-spine-proof.pointer.v1",
            "generatedAt": iso_now(),
            "status": payload.get("status"),
            "jsonPath": str(json_path),
            "markdownPath": str(markdown_path),
            "htmlPath": str(html_path),
            "queueJsonPath": payload.get("queueJsonPath"),
            "operationId": as_dict(payload.get("item")).get("operationId"),
            "operationKind": as_dict(payload.get("item")).get("operationKind"),
            "suggestedDecision": as_dict(payload.get("item")).get("suggestedDecision"),
            "truth": payload.get("truth"),
        },
    )
    return payload


def run_review_ledger_decision(queue: dict[str, Any], args: argparse.Namespace, *, record: bool = False) -> dict[str, Any]:
    item = enrich_next_item_with_audio(queue, selected_next_item(queue, args.operation_id or ""))
    if not item:
        return {
            "schema": SCHEMA + ".next-host-spine-proof-decision.v1",
            "generatedAt": iso_now(),
            "status": "episode4-recipe-proof-listen-decision-missing",
            "reason": "No matching host-spine proof item found.",
            "truth": truth(),
        }
    decision = as_text(args.next_decision, as_text(item.get("suggestedDecision"), "needs-listen"))
    if decision not in VALID_DECISIONS:
        raise SystemExit(f"Decision must be one of: {', '.join(sorted(VALID_DECISIONS))}")
    operation_id = as_text(item.get("operationId"))
    command = [
        "python3",
        str(REVIEW_LEDGER_SCRIPT),
        "record",
        operation_id,
        decision,
        as_text(args.decision_reviewer, "Codex"),
        as_text(args.decision_notes),
        "--session",
        "latest",
        "--audio-note",
        as_text(args.audio_note),
        "--visual-note",
        as_text(args.visual_note),
        "--cadence-note",
        as_text(args.cadence_note),
        "--source-note",
        as_text(args.source_note),
        "--next-action",
        as_text(args.next_action),
        "--json",
    ]
    if not record:
        command.append("--dry-run")
    result = subprocess.run(command, text=True, capture_output=True, check=False)
    nested: dict[str, Any] = {}
    try:
        nested = json.loads(result.stdout or "{}")
    except Exception:
        nested = {"stdout": result.stdout}
    status = "episode4-recipe-proof-listen-decision-recorded" if record and result.returncode == 0 else "episode4-recipe-proof-listen-decision-dry-run-ready" if result.returncode == 0 else "episode4-recipe-proof-listen-decision-failed"
    payload = {
        "schema": SCHEMA + ".next-host-spine-proof-decision.v1",
        "generatedAt": iso_now(),
        "status": status,
        "recorded": bool(record and result.returncode == 0),
        "operation": item,
        "decision": decision,
        "reviewer": as_text(args.decision_reviewer, "Codex"),
        "notes": as_text(args.decision_notes),
        "audioNote": as_text(args.audio_note),
        "visualNote": as_text(args.visual_note),
        "cadenceNote": as_text(args.cadence_note),
        "sourceNote": as_text(args.source_note),
        "nextAction": as_text(args.next_action),
        "delegatedCommand": " ".join(command),
        "delegateReturnCode": result.returncode,
        "delegateStderr": (result.stderr or "").strip(),
        "reviewLedgerResponse": nested,
        "truth": {
            **truth(),
            "reviewDecisionsRecorded": bool(record and result.returncode == 0),
            "ledgerMutated": bool(record and result.returncode == 0),
        },
    }
    return payload


def render_decision_markdown(payload: dict[str, Any]) -> str:
    operation = as_dict(payload.get("operation"))
    response = as_dict(payload.get("reviewLedgerResponse"))
    event = as_dict(response.get("wouldAppendEvent") or response)
    lines = [
        "# Episode 4 proof-listen decision handoff",
        "",
        f"- Status: `{payload.get('status')}`",
        f"- Recorded: `{payload.get('recorded')}`",
        f"- Operation: `{operation.get('operationId')}`",
        f"- Kind: `{operation.get('operationKind')}`",
        f"- Decision: `{payload.get('decision')}`",
        f"- Reviewer: `{payload.get('reviewer')}`",
        f"- Ledger response: `{response.get('status')}`",
        "",
        "## Review notes",
        "",
        f"- Note: {payload.get('notes') or ''}",
        f"- Audio: {payload.get('audioNote') or ''}",
        f"- Visual: {payload.get('visualNote') or ''}",
        f"- Cadence: {payload.get('cadenceNote') or ''}",
        f"- Source: {payload.get('sourceNote') or ''}",
        "",
        "## Delegate command",
        "",
        "```bash",
        str(payload.get("delegatedCommand") or ""),
        "```",
        "",
        "## Event preview",
        "",
        "```json",
        json.dumps(event, indent=2, sort_keys=True),
        "```",
        "",
        "## Safety",
        "",
        "Dry-run does not mutate the ledger. Record mode mutates only the sidecar review ledger; neither mode writes timeline metadata, imports clips, mutates source media, renders exports, or publishes anything.",
        "",
    ]
    return "\n".join(lines)


def build_queue(args: argparse.Namespace) -> dict[str, Any]:
    ledger = load_pointer(args.ledger_pointer)
    operations = dict_list(ledger.get("operations"))
    reviews = as_dict(ledger.get("reviews"))
    tasks = [build_task(operation, as_dict(reviews.get(op_id(operation)))) for operation in operations]
    tasks.sort(key=lambda task: priority_for(
        next((operation for operation in operations if op_id(operation) == task["operationId"]), {}),
        as_dict(reviews.get(task["operationId"])),
    ))
    branch = as_dict(ledger.get("branch"))
    queue = {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": "episode4-recipe-proof-listen-queue-ready" if tasks else "episode4-recipe-proof-listen-queue-empty",
        "episode": "episode-4",
        "ledgerPointer": str(args.ledger_pointer),
        "ledgerPath": as_text(ledger.get("ledgerPath")),
        "branch": branch,
        "durationPlan": as_dict(ledger.get("durationPlan")),
        "tasks": tasks,
        "counts": counts_for(tasks),
        "proofRunway": proof_runway_for(tasks),
        "hostSpineRunway": proof_runway_for(tasks),
        "sourceRecoveryRunway": source_recovery_runway_for(tasks),
        "decisionCheatSheet": decision_cheat_sheet(),
        "nextSafestAction": "Proof-listen the highest-priority host-spine task while watched/source placeholders remain visible but separate.",
        "truth": truth(),
    }
    return queue


def write_queue(queue: dict[str, Any], source_audio: Path | None, *, no_audio: bool = False, max_audio_window: float = 150.0) -> dict[str, Any]:
    session_dir = OUT_ROOT / stamp()
    session_dir.mkdir(parents=True, exist_ok=True)
    json_path = session_dir / "episode4-recipe-proof-listen-queue.json"
    markdown_path = session_dir / "episode4-recipe-proof-listen-queue.md"
    html_path = session_dir / "index.html"
    queue.update({"sessionDir": str(session_dir), "jsonPath": str(json_path), "markdownPath": str(markdown_path), "htmlPath": str(html_path)})
    attach_proof_runway_audio(queue, session_dir, source_audio, disabled=no_audio, max_window_seconds=max_audio_window)
    write_json(json_path, queue)
    markdown_path.write_text(render_markdown(queue), encoding="utf-8")
    html_path.write_text(render_html(queue), encoding="utf-8")
    write_json(
        LATEST_POINTER,
        {
            "schema": SCHEMA + ".pointer",
            "generatedAt": iso_now(),
            "status": queue.get("status"),
            "sessionDir": str(session_dir),
            "jsonPath": str(json_path),
            "markdownPath": str(markdown_path),
            "htmlPath": str(html_path),
            "branch": queue.get("branch"),
            "counts": queue.get("counts"),
            "nextSafestAction": queue.get("nextSafestAction"),
            "truth": queue.get("truth"),
        },
    )
    return queue


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ledger-pointer", type=Path, default=LEDGER_POINTER)
    parser.add_argument("--source-audio", type=Path, default=None, help="Episode 4 audio source for generated proof-listen windows.")
    parser.add_argument("--no-audio", action="store_true", help="Skip proof-listen audio extraction.")
    parser.add_argument("--max-audio-window", type=float, default=150.0, help="Skip proof-listen audio windows longer than this many seconds.")
    parser.add_argument("--next", action="store_true", help="Print the next host-spine proof item.")
    parser.add_argument("--operation-id", help="Print a specific operation as a focused proof item.")
    parser.add_argument("--next-decision", choices=sorted(VALID_DECISIONS), help="Dry-run or record a review decision for the selected next proof item.")
    parser.add_argument("--record-decision", action="store_true", help="Record the selected proof-listen decision into the sidecar recipe review ledger.")
    parser.add_argument("--decision-reviewer", default="Codex")
    parser.add_argument("--decision-notes", default="")
    parser.add_argument("--audio-note", default="")
    parser.add_argument("--visual-note", default="")
    parser.add_argument("--cadence-note", default="")
    parser.add_argument("--source-note", default="")
    parser.add_argument("--next-action", default="")
    parser.add_argument("--json", action="store_true", help="Print JSON. This is the default.")
    parser.add_argument("--markdown", action="store_true", help="Print Markdown.")
    args = parser.parse_args()
    queue = write_queue(
        build_queue(args),
        resolve_source_audio(args.source_audio),
        no_audio=args.no_audio,
        max_audio_window=args.max_audio_window,
    )
    if args.next_decision:
        payload = run_review_ledger_decision(queue, args, record=args.record_decision)
        if args.markdown:
            print(render_decision_markdown(payload))
        else:
            print(json.dumps(payload, indent=2, sort_keys=True))
    elif args.next or args.operation_id:
        payload = write_next_payload(queue, build_next_payload(queue, args.operation_id or ""))
        if args.markdown:
            print(render_next_markdown(payload))
        else:
            print(json.dumps(payload, indent=2, sort_keys=True))
    elif args.markdown:
        print(render_markdown(queue))
    else:
        print(json.dumps(queue, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
