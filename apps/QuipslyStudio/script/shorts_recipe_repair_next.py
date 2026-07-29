#!/usr/bin/env python3
"""Pick the next transcript-backed short repair candidate for proof-watching.

This is deliberately read-only. It narrows a recipe repair workorder down to
one current range vs candidate range comparison so a human or agent can watch
the whole synced sources before any short recipe metadata is changed.
"""

from __future__ import annotations

import argparse
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

from selected_short_story_repair_suggestions import dict_value, text_value
from shorts_recipe_repair_workorder import DEFAULT_SESSION, DEFAULT_TRANSCRIPT, build_workorder


STATUS_ORDER = [
    "strong-repair-candidate",
    "proof-watch-candidate",
    "manual-review-needed",
    "keep-current-range",
]


def list_value(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def find_task(
    workorder: dict[str, Any],
    *,
    short_id: str | None = None,
    rank: int | None = None,
    status: str | None = None,
) -> dict[str, Any]:
    tasks = [dict_value(task) for task in list_value(workorder.get("tasks"))]
    if short_id:
        for task in tasks:
            if text_value(task.get("shortId")) == short_id:
                return task
    if rank is not None:
        for task in tasks:
            if int(task.get("rank") or -1) == rank:
                return task
    if status:
        for task in tasks:
            if text_value(task.get("status")) == status:
                return task
    for desired_status in STATUS_ORDER:
        for task in tasks:
            if text_value(task.get("status")) == desired_status:
                return task
    return {}


def seconds_label(value: Any) -> str:
    if isinstance(value, (int, float)):
        minutes = int(value // 60)
        seconds = value - minutes * 60
        return f"{minutes:02d}:{seconds:05.2f}"
    return "unknown"


def build_packet(
    session_path: Path,
    transcript_path: Path,
    *,
    short_id: str | None = None,
    rank: int | None = None,
    status: str | None = None,
) -> dict[str, Any]:
    workorder = build_workorder(session_path, transcript_path)
    task = find_task(workorder, short_id=short_id, rank=rank, status=status)
    if not task:
        return {
            "status": "no_repair_candidate_found",
            "sessionPath": str(session_path),
            "transcriptPath": str(transcript_path),
            "truth": "Read-only. No matching repair candidate was found and nothing was changed.",
        }

    patch = dict_value(task.get("candidatePatch"))
    current_range = dict_value(patch.get("currentRange")) or {}
    candidate_range = dict_value(patch.get("candidateRange")) or {}
    story = dict_value(patch.get("candidateStory")) or {}
    offset = dict_value(workorder.get("globalOffsetDiagnosis"))
    current = dict_value(task.get("currentAlignment"))
    candidate = dict_value(task.get("candidateAlignment"))
    current_start = current_range.get("start")
    candidate_start = candidate_range.get("start")

    risks: list[str] = []
    if offset.get("globalOffsetLikely") is False:
        risks.append("Episode 1 shorts do not share one safe global transcript offset. Repair this short individually.")
    if text_value(task.get("status")) == "proof-watch-candidate":
        risks.append("Candidate transcript support is weak. Treat this as a watch target, not a metadata fix.")
    if not patch:
        risks.append("No candidate metadata patch exists. Keep current range unless manual review proves otherwise.")

    packet = {
        "status": "shorts_recipe_repair_next",
        "model": "quipsly-shorts-recipe-proof-watch-packet",
        "version": "2026-07-04.shorts-recipe-proof-watch-packet.v1",
        "sequenceTitle": workorder.get("sequenceTitle"),
        "sessionPath": str(session_path),
        "transcriptPath": str(transcript_path),
        "globalOffsetDiagnosis": offset,
        "task": {
            "rank": task.get("rank"),
            "shortId": text_value(task.get("shortId")),
            "title": text_value(task.get("title")),
            "status": text_value(task.get("status")),
            "diagnosis": text_value(task.get("diagnosis")),
            "scoreImprovement": task.get("scoreImprovement"),
            "currentAlignment": current,
            "candidateAlignment": candidate,
            "currentRange": current_range,
            "candidateRange": candidate_range,
            "storyPreview": story,
        },
        "watchPlan": [
            {
                "step": "Watch current short range",
                "sequenceStart": current_start,
                "timeLabel": seconds_label(current_start),
                "purpose": "Confirm what the current recipe actually contains before trusting or replacing it.",
            },
            {
                "step": "Watch candidate transcript range",
                "sequenceStart": candidate_start,
                "timeLabel": seconds_label(candidate_start),
                "purpose": "Confirm the transcript-matched moment appears in whole synced sources and has a real hook, turn, and payoff.",
            },
            {
                "step": "Compare edit value",
                "purpose": "Decide whether the candidate is stronger, whether the current short should stay, or whether both should become separate short recipes.",
            },
            {
                "step": "Check human-feeling cadence",
                "purpose": "Avoid over-tightening pauses, cutting reactions too early, or making the speakers sound robotic.",
            },
            {
                "step": "Check 9:16 framing and captions",
                "purpose": "Make sure faces are safe, overlays do not cover mouths/eyes, and captions reflect the actual spoken words.",
            },
        ],
        "allowedOutcomes": [
            "keep-current-range",
            "repair-to-candidate-range-preview-only",
            "split-current-and-candidate-into-two-short-options",
            "hold-for-human-review",
            "reject-short-recipe",
        ],
        "safeCommands": {
            "showPacket": "script/agentctl.sh shorts-recipe-repair-next --markdown",
            "seekCurrent": f"script/agentctl.sh shorts-recipe-repair-next --rank {task.get('rank')} --seek current",
            "seekCandidate": f"script/agentctl.sh shorts-recipe-repair-next --rank {task.get('rank')} --seek candidate",
            "seekPlainCurrent": f"script/agentctl.sh seek {current_start}" if isinstance(current_start, (int, float)) else "",
            "seekPlainCandidate": f"script/agentctl.sh seek {candidate_start}" if isinstance(candidate_start, (int, float)) else "",
        },
        "risks": risks,
        "safeNextAction": "Proof-watch the current and candidate ranges in the running Studio monitor wall before applying any metadata repair.",
        "truth": "Read-only proof-watch packet. It recommends what to inspect next and does not mutate sessions, media, exports, receipts, or review state.",
    }
    return packet


def read_studio_state(base_url: str) -> dict[str, Any]:
    url = base_url.rstrip("/") + "/state"
    with urllib.request.urlopen(url, timeout=3) as response:
        body = response.read().decode("utf-8", errors="replace")
    return dict_value(json.loads(body))


def seek_running_studio(base_url: str, seconds: Any, *, confirm_state: bool = True) -> dict[str, Any]:
    if not isinstance(seconds, (int, float)):
        return {
            "requested": seconds,
            "status": "not_seekable",
            "truth": "No numeric sequence time was available; nothing was sent to the running Studio app.",
        }
    url = base_url.rstrip("/") + "/seek?time=" + urllib.parse.quote(str(float(seconds)), safe="")
    with urllib.request.urlopen(url, timeout=3) as response:
        body = response.read().decode("utf-8", errors="replace")
    try:
        parsed_body: Any = json.loads(body)
    except Exception:
        parsed_body = body
    return {
        "requested": seconds,
        "url": url,
        "status": "seek_requested",
        "response": parsed_body,
        "truth": "Best-effort app seek request only. Confirm success through /state or the visible monitor wall.",
    }


def seek_and_confirm_running_studio(base_url: str, seconds: Any, *, confirm_state: bool = True) -> dict[str, Any]:
    result = seek_running_studio(base_url, seconds, confirm_state=confirm_state)
    if not confirm_state or result.get("status") != "seek_requested":
        return result
    try:
        time.sleep(0.25)
        state = read_studio_state(base_url)
        playhead = state.get("playhead")
        confirmed = isinstance(playhead, (int, float)) and isinstance(seconds, (int, float)) and abs(float(playhead) - float(seconds)) <= 0.35
        result["stateConfirmation"] = {
            "status": "confirmed" if confirmed else "mismatch",
            "requestedPlayhead": seconds,
            "observedPlayhead": playhead,
            "activeSessionName": state.get("activeSessionName"),
            "playbackMode": state.get("playbackMode"),
            "currentProgramTitle": state.get("currentProgramTitle"),
            "currentProgramDetail": state.get("currentProgramDetail"),
            "truth": "State confirmation checks shared playhead only. Visual/cadence judgment still requires monitor-wall review.",
        }
        result["truth"] = "Seek requested and /state read back. Use stateConfirmation plus visible monitor-wall review before judging the short."
    except Exception as error:
        result["stateConfirmation"] = {
            "status": "unavailable",
            "error": str(error),
            "truth": "Seek was requested, but /state confirmation failed. Do not claim the visible editor moved without another proof.",
        }
    return result


def render_markdown(packet: dict[str, Any]) -> str:
    if packet.get("status") == "no_repair_candidate_found":
        return "\n".join([
            "# Shorts recipe repair next",
            "",
            "- No matching repair candidate found.",
            f"- Session: `{packet.get('sessionPath', '')}`",
            f"- Transcript: `{packet.get('transcriptPath', '')}`",
            f"- Truth: {packet.get('truth', '')}",
            "",
        ])

    task = dict_value(packet.get("task"))
    current_range = dict_value(task.get("currentRange"))
    candidate_range = dict_value(task.get("candidateRange"))
    story = dict_value(task.get("storyPreview"))
    current = dict_value(task.get("currentAlignment"))
    candidate = dict_value(task.get("candidateAlignment"))
    offset = dict_value(packet.get("globalOffsetDiagnosis"))
    lines = [
        "# Shorts recipe repair next",
        "",
        f"- Sequence: {packet.get('sequenceTitle', '')}",
        f"- Short: `{task.get('shortId', '')}`",
        f"- Rank: `{task.get('rank', '')}`",
        f"- Title: {task.get('title', '')}",
        f"- Status: `{task.get('status', '')}`",
        f"- Diagnosis: `{task.get('diagnosis', '')}`",
        f"- Score improvement: `{task.get('scoreImprovement', '')}`",
        f"- Global offset: `{offset.get('diagnosis', 'unknown')}`, likely `{offset.get('globalOffsetLikely', False)}`",
        f"- Truth: {packet.get('truth', '')}",
        "",
        "## Current vs candidate",
        "",
        f"- Current range: `{current_range.get('start')}` -> `{current_range.get('end')}`",
        f"- Candidate range: `{candidate_range.get('start')}` -> `{candidate_range.get('end')}`",
        f"- Current alignment: `{current.get('label', '')}` score `{current.get('score', 0)}` overlap `{', '.join(current.get('overlapTokens') or [])}`",
        f"- Candidate alignment: `{candidate.get('label', '')}` score `{candidate.get('score', 0)}` overlap `{', '.join(candidate.get('overlapTokens') or [])}`",
        "",
        "## Story preview if candidate proves out",
        "",
        f"- Hook: {story.get('hookText', '')}",
        f"- Turn: {story.get('middleTurn', '')}",
        f"- Payoff: {story.get('payoff', '')}",
        f"- Caption: {story.get('captionDraft', '')}",
        f"- Overlay: {story.get('primaryOverlayText', '')}",
        "",
        "## Watch plan",
    ]
    for item in list_value(packet.get("watchPlan")):
        item = dict_value(item)
        label = text_value(item.get("timeLabel"))
        suffix = f" at `{label}`" if label and label != "unknown" else ""
        lines.append(f"- {item.get('step', '')}{suffix}: {item.get('purpose', '')}")
    risks = [text_value(risk) for risk in list_value(packet.get("risks")) if text_value(risk)]
    if risks:
        lines.extend(["", "## Risks"])
        lines.extend(f"- {risk}" for risk in risks)
    lines.extend(["", "## Allowed outcomes"])
    lines.extend(f"- `{outcome}`" for outcome in list_value(packet.get("allowedOutcomes")))
    commands = dict_value(packet.get("safeCommands"))
    if commands:
        lines.extend(["", "## Safe commands"])
        for label, command in commands.items():
            if text_value(command):
                lines.append(f"- {label}: `{command}`")
    seek_result = dict_value(packet.get("seekResult"))
    if seek_result:
        confirmation = dict_value(seek_result.get("stateConfirmation"))
        lines.extend([
            "",
            "## Seek result",
            f"- Requested: `{seek_result.get('requested')}`",
            f"- Status: `{seek_result.get('status')}`",
            f"- Truth: {seek_result.get('truth', '')}",
        ])
        if confirmation:
            lines.extend([
                f"- State confirmation: `{confirmation.get('status')}`",
                f"- Observed playhead: `{confirmation.get('observedPlayhead')}`",
                f"- Active session: `{confirmation.get('activeSessionName', '')}`",
                f"- Playback mode: `{confirmation.get('playbackMode', '')}`",
                f"- Program: {confirmation.get('currentProgramTitle', '')}",
            ])
    lines.extend(["", f"Next: {packet.get('safeNextAction', '')}", ""])
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--session", type=Path, default=DEFAULT_SESSION)
    parser.add_argument("--transcript", type=Path, default=DEFAULT_TRANSCRIPT)
    parser.add_argument("--short-id", default=None)
    parser.add_argument("--rank", type=int, default=None)
    parser.add_argument("--status", default=None)
    parser.add_argument("--seek", choices=["current", "candidate"], default=None)
    parser.add_argument("--base-url", default="http://127.0.0.1:8080")
    parser.add_argument("--no-confirm-state", action="store_true")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--markdown", action="store_true")
    parser.add_argument("--save", type=Path, default=None)
    args = parser.parse_args()
    packet = build_packet(args.session, args.transcript, short_id=args.short_id, rank=args.rank, status=args.status)
    if args.seek and packet.get("status") != "no_repair_candidate_found":
        task = dict_value(packet.get("task"))
        range_key = "currentRange" if args.seek == "current" else "candidateRange"
        target = dict_value(task.get(range_key)).get("start")
        try:
            packet["seekResult"] = seek_and_confirm_running_studio(args.base_url, target, confirm_state=not args.no_confirm_state)
        except Exception as error:
            packet["seekResult"] = {
                "requested": target,
                "status": "seek_failed",
                "error": str(error),
                "truth": "The repair packet was generated, but Studio did not accept the seek request. No session/media/export data was changed.",
            }
    output = json.dumps(packet, indent=2, sort_keys=True) if args.json else render_markdown(packet)
    if args.save:
        args.save.parent.mkdir(parents=True, exist_ok=True)
        args.save.write_text(output, encoding="utf-8")
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
