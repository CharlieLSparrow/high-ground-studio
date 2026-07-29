#!/usr/bin/env python3
"""Read-only cut rhythm audit for Quipsly Studio.

This helper inspects the current agent-visible Studio state and looks for
human-flow risks around SHOW/SKIP decisions: jump cuts, overly short flashes,
multi-source ambiguity, cadence-chopping micro gaps, and places where a J/L-cut
or reaction cover should be reviewed before a cut is trusted.

It intentionally does not create, edit, approve, export, publish, or mutate
source media. It is a map for the next listening/editing pass.
"""

from __future__ import annotations

import argparse
import json
import math
import urllib.request
from dataclasses import dataclass
from typing import Any


DEFAULT_BASE_URL = "http://127.0.0.1:8080"
FETCH_PATHS = (
    "/state",
    "/editor_loop_proof",
    "/selected_decision_intent_evidence",
    "/selected_short_quality",
)


@dataclass(frozen=True)
class Decision:
    source: str
    lane: str
    label: str
    raw_type: str
    normalized_type: str
    start: float
    end: float
    duration: float
    confidence: str
    evidence: str


def fetch_json(base_url: str, path: str) -> dict[str, Any]:
    url = base_url.rstrip("/") + path
    try:
        with urllib.request.urlopen(url, timeout=8) as response:
            return json.loads(response.read().decode("utf-8", errors="replace"))
    except Exception as exc:  # noqa: BLE001 - operator-facing helper.
        return {
            "status": "request_failed",
            "url": url,
            "error": str(exc),
            "truth": "Read-only request failed before any edit, export, publish, approval, or source-media mutation.",
        }


def string_value(value: Any, default: str = "") -> str:
    if value is None:
        return default
    if isinstance(value, str):
        return value
    return str(value)


def list_value(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def dict_value(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def number_value(value: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)) and math.isfinite(float(value)):
        return float(value)
    if isinstance(value, str):
        text = value.strip().replace("s", "")
        if not text:
            return None
        try:
            parsed = float(text)
        except ValueError:
            return None
        return parsed if math.isfinite(parsed) else None
    return None


def first_number(item: dict[str, Any], keys: tuple[str, ...]) -> float | None:
    for key in keys:
        value = number_value(item.get(key))
        if value is not None:
            return value
    return None


def first_text(item: dict[str, Any], keys: tuple[str, ...]) -> str:
    for key in keys:
        text = string_value(item.get(key)).strip()
        if text:
            return text
    return ""


def normalize_type(raw_type: str, label: str) -> str:
    text = f"{raw_type} {label}".lower()
    if any(token in text for token in ("skip", "quiet", "gap", "inactive", "cutaway-off")):
        return "skip"
    if any(token in text for token in ("show", "active", "charlie", "homer", "both", "clip", "program")):
        return "show"
    if any(token in text for token in ("review", "boundary", "stop")):
        return "review"
    return "unknown"


def walk_dicts(value: Any) -> list[dict[str, Any]]:
    found: list[dict[str, Any]] = []
    if isinstance(value, dict):
        found.append(value)
        for child in value.values():
            found.extend(walk_dicts(child))
    elif isinstance(value, list):
        for child in value:
            found.extend(walk_dicts(child))
    return found


def candidate_decision(source: str, item: dict[str, Any]) -> Decision | None:
    start = first_number(
        item,
        (
            "start",
            "startTime",
            "sequenceStart",
            "selectedTagStart",
            "timelineStart",
            "in",
            "inPoint",
        ),
    )
    duration = first_number(
        item,
        (
            "duration",
            "selectedTagDuration",
            "recipeDuration",
            "length",
            "span",
        ),
    )
    end = first_number(
        item,
        (
            "end",
            "endTime",
            "sequenceEnd",
            "selectedTagEnd",
            "timelineEnd",
            "out",
            "outPoint",
        ),
    )
    if start is None:
        return None
    if end is None and duration is not None:
        end = start + duration
    if duration is None and end is not None:
        duration = end - start
    if end is None or duration is None or duration <= 0:
        return None

    raw_type = first_text(
        item,
        (
            "type",
            "tagType",
            "selectedTagType",
            "decisionType",
            "action",
            "kind",
            "mode",
        ),
    )
    lane = first_text(
        item,
        (
            "lane",
            "laneName",
            "selectedLaneName",
            "sourceName",
            "source",
            "track",
            "trackName",
        ),
    )
    label = first_text(
        item,
        (
            "label",
            "title",
            "name",
            "decision",
            "summary",
            "selectedShortTitle",
        ),
    )
    normalized = normalize_type(raw_type, label)
    has_decision_words = normalized != "unknown"
    has_lane_context = bool(lane) and any(
        key in item
        for key in (
            "lane",
            "laneName",
            "selectedLaneName",
            "sourceName",
            "track",
            "trackName",
        )
    )
    if not has_decision_words and not has_lane_context:
        return None

    confidence = first_text(item, ("confidence", "risk", "status", "reviewStatus"))
    evidence = first_text(item, ("explanation", "reason", "note", "intent", "nextReviewAction"))
    return Decision(
        source=source,
        lane=lane or "unknown lane",
        label=label or raw_type or "unnamed decision",
        raw_type=raw_type or "unknown",
        normalized_type=normalized,
        start=start,
        end=end,
        duration=duration,
        confidence=confidence,
        evidence=evidence,
    )


def collect_decisions(payloads: dict[str, dict[str, Any]]) -> list[Decision]:
    decisions: list[Decision] = []
    seen: set[tuple[str, str, str, int, int]] = set()
    for source, payload in payloads.items():
        for item in walk_dicts(payload):
            decision = candidate_decision(source, item)
            if decision is None:
                continue
            key = (
                decision.lane,
                decision.raw_type,
                decision.normalized_type,
                round(decision.start * 100),
                round(decision.end * 100),
            )
            if key in seen:
                continue
            seen.add(key)
            decisions.append(decision)
    return sorted(decisions, key=lambda item: (item.start, item.end, item.lane, item.raw_type))


def overlap_seconds(left: Decision, right: Decision) -> float:
    return max(0.0, min(left.end, right.end) - max(left.start, right.start))


def review_action_for_kind(kind: str) -> dict[str, str]:
    if kind == "same_source_jump_cut":
        return {
            "mode": "reaction-cover-pass",
            "label": "Check whether the jump needs a cover",
            "firstAction": "Play the boundary at normal speed and compare source monitors for a natural reaction, b-roll, or split-screen cover.",
            "statusCommand": 'script/agentctl.sh decision-refine Codex "jump-cut risk: check reaction cover or J/L overlap"',
        }
    if kind == "multi_source_ambiguity":
        return {
            "mode": "program-intent-pass",
            "label": "Make the program choice explicit",
            "firstAction": "Decide whether this overlap is one source, a designed two-shot, or a clip overlay. Do not let track order decide for us.",
            "statusCommand": 'script/agentctl.sh decision-refine Codex "overlapping SHOW sources need explicit program intent"',
        }
    if kind == "jl_cut_candidate":
        return {
            "mode": "jl-listen-pass",
            "label": "Listen for an audio lead or trail",
            "firstAction": "Loop the boundary and test whether the incoming voice should lead, or the outgoing voice should trail, before the visual switch.",
            "statusCommand": 'script/agentctl.sh decision-listen Codex "J/L-cut candidate: boundary needs an ear pass"',
        }
    if kind == "cadence_chip":
        return {
            "mode": "preserve-air-pass",
            "label": "Protect the human cadence",
            "firstAction": "Play through the tiny removal and ask whether it improved pace or merely made the conversation feel clipped.",
            "statusCommand": 'script/agentctl.sh decision-listen Codex "micro SKIP may chop cadence; preserve air unless proven useful"',
        }
    if kind == "long_skip":
        return {
            "mode": "bridge-check-pass",
            "label": "Check whether the reset needs a bridge",
            "firstAction": "Watch the re-entry after the long skip. Add or mark a bridge only if the story feels teleported.",
            "statusCommand": 'script/agentctl.sh decision-listen Codex "long SKIP needs continuity bridge check"',
        }
    if kind == "long_single_source_run":
        return {
            "mode": "attention-drift-pass",
            "label": "Check attention without cutting for its own sake",
            "firstAction": "Review whether the speaker focus earns the long hold. If it does, keep it. If not, try a reaction, reframe, or b-roll cover.",
            "statusCommand": 'script/agentctl.sh decision-listen Codex "long source run: check attention before adding motion"',
        }
    if kind == "visual_flash":
        return {
            "mode": "flash-intent-pass",
            "label": "Decide if the flash is intentional",
            "firstAction": "Watch the flash in context. Either make it deliberate emphasis or remove/extend it so it does not feel accidental.",
            "statusCommand": 'script/agentctl.sh decision-refine Codex "very short SHOW span needs intent check"',
        }
    return {
        "mode": "normal-listen-pass",
        "label": "Listen before changing",
        "firstAction": "Play the span at normal speed and write what tradeoff the cut is making before editing it.",
        "statusCommand": 'script/agentctl.sh decision-listen Codex "rhythm audit item needs normal-speed review"',
    }


def make_finding(
    severity: str,
    kind: str,
    title: str,
    why: str,
    recommendation: str,
    decisions: list[Decision],
) -> dict[str, Any]:
    review_action = review_action_for_kind(kind)
    return {
        "severity": severity,
        "kind": kind,
        "title": title,
        "why": why,
        "recommendation": recommendation,
        "reviewAction": review_action,
        "decisions": [
            {
                "lane": decision.lane,
                "type": decision.normalized_type,
                "label": decision.label,
                "start": round(decision.start, 3),
                "end": round(decision.end, 3),
                "duration": round(decision.duration, 3),
                "source": decision.source,
            }
            for decision in decisions
        ],
    }


def build_findings(decisions: list[Decision]) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    show_decisions = [item for item in decisions if item.normalized_type == "show"]
    skip_decisions = [item for item in decisions if item.normalized_type == "skip"]

    for decision in show_decisions:
        if decision.duration < 1.2:
            findings.append(
                make_finding(
                    "medium",
                    "visual_flash",
                    "Very short SHOW span",
                    "A visible source appears for less than 1.2 seconds. That can feel like a nervous flash unless it is intentional emphasis.",
                    "Review at normal speed. Extend it, convert it into a deliberate punch-in, or remove it if it only creates visual noise.",
                    [decision],
                )
            )

    for decision in skip_decisions:
        if decision.duration < 0.45:
            findings.append(
                make_finding(
                    "medium",
                    "cadence_chip",
                    "Micro SKIP may chop cadence",
                    "A sub-half-second SKIP can remove breath, mouth movement, or conversational air without actually improving pace.",
                    "Use a listen-through pass before keeping it. If the rhythm feels artificial, preserve the air or make the cut a cleaner J/L transition.",
                    [decision],
                )
            )
        elif decision.duration > 8:
            findings.append(
                make_finding(
                    "low",
                    "long_skip",
                    "Long SKIP changes story rhythm",
                    "A long skipped span is probably valid, but it changes continuity and may need bridge audio, b-roll, or a clean reset.",
                    "Check whether the next SHOW needs a reaction cover, title card, or audio lead-in so the viewer does not feel teleported.",
                    [decision],
                )
            )

    by_lane: dict[str, list[Decision]] = {}
    for decision in show_decisions:
        by_lane.setdefault(decision.lane, []).append(decision)
    for lane_decisions in by_lane.values():
        lane_sorted = sorted(lane_decisions, key=lambda item: item.start)
        run_start: Decision | None = None
        run_end: Decision | None = None
        run_duration = 0.0
        for index, current in enumerate(lane_sorted):
            previous = lane_sorted[index - 1] if index else None
            if previous is None or current.start - previous.end > 1.0:
                run_start = current
                run_duration = current.duration
            else:
                run_duration = current.end - (run_start.start if run_start else current.start)
            run_end = current
            if previous is not None:
                gap = current.start - previous.end
                if -0.05 <= gap <= 0.6:
                    findings.append(
                        make_finding(
                            "high",
                            "same_source_jump_cut",
                            "Possible visible jump cut on same source",
                            "Two SHOW spans on the same source land close together. If the speaker position jumps, the cut may feel mechanical.",
                            "Try a reaction cover, b-roll/clip cover, split-screen moment, or a J/L audio overlap so the visual cut feels intentional.",
                            [previous, current],
                        )
                    )
            if run_start and run_end and run_duration > 75:
                findings.append(
                    make_finding(
                        "low",
                        "long_single_source_run",
                        "Long same-source run",
                        "One source stays dominant for more than 75 seconds. That may be right for emotional focus, but it deserves an attention check.",
                        "Review for reaction opportunities, gentle reframing, or b-roll only where it supports the idea. Do not cut just to cut.",
                        [run_start, run_end],
                    )
                )
                run_start = run_end
                run_duration = 0.0

    for index, left in enumerate(show_decisions):
        for right in show_decisions[index + 1 :]:
            if right.start - left.end > 0:
                break
            if left.lane == right.lane:
                continue
            overlap = overlap_seconds(left, right)
            if overlap >= 0.25:
                findings.append(
                    make_finding(
                        "high",
                        "multi_source_ambiguity",
                        "Multiple sources are SHOW at the same time",
                        "Whole source lanes can overlap, but Program Output needs an explicit choice: one source, a designed two-shot, or a clip overlay.",
                        "Mark the overlap as explicit composite/two-shot intent or resolve it to a single program source. Do not assume Premiere-style top-track behavior.",
                        [left, right],
                    )
                )

    ordered_shows = sorted(show_decisions, key=lambda item: item.start)
    for index, current in enumerate(ordered_shows[1:], start=1):
        previous = ordered_shows[index - 1]
        if current.lane == previous.lane:
            continue
        boundary_gap = current.start - previous.end
        if -0.25 <= boundary_gap <= 0.35:
            findings.append(
                make_finding(
                    "medium",
                    "jl_cut_candidate",
                    "J/L-cut listening candidate",
                    "A source switch lands directly on the visual boundary. It may be cleaner if audio leads or trails the visual change.",
                    "Listen around the boundary. Let the incoming speaker lead before the visual switch, or let the previous speaker trail over the reaction if it sounds more human.",
                    [previous, current],
                )
            )

    severity_order = {"high": 0, "medium": 1, "low": 2}
    return sorted(
        findings,
        key=lambda item: (
            severity_order.get(string_value(item.get("severity")), 9),
            string_value(item.get("kind")),
        ),
    )


def make_audit(base_url: str) -> dict[str, Any]:
    payloads = {path: fetch_json(base_url, path) for path in FETCH_PATHS}
    decisions = collect_decisions(payloads)
    findings = build_findings(decisions)
    for index, finding in enumerate(findings, start=1):
        finding["id"] = f"rhythm-{index:03d}"
    high_count = sum(1 for item in findings if item.get("severity") == "high")
    medium_count = sum(1 for item in findings if item.get("severity") == "medium")
    low_count = sum(1 for item in findings if item.get("severity") == "low")
    decision_counts: dict[str, int] = {}
    for decision in decisions:
        decision_counts[decision.normalized_type] = decision_counts.get(decision.normalized_type, 0) + 1

    if high_count:
        first_focus = "Resolve high-risk source ambiguity or jump-cut findings before trusting this edit."
    elif medium_count:
        first_focus = "Run a normal-speed rhythm pass around medium-risk cadence and J/L-cut findings."
    elif decisions:
        first_focus = "No high-risk rhythm findings surfaced from the currently exposed state; review selected spans at normal speed."
    else:
        first_focus = "The app did not expose enough decision timing to audit. Select/load a session or expand the state surface."

    return {
        "status": "cut_rhythm_audit",
        "model": "quipslystudio-cut-rhythm-audit-v1",
        "baseUrl": base_url.rstrip("/"),
        "decisionCount": len(decisions),
        "decisionCounts": decision_counts,
        "findingCounts": {
            "high": high_count,
            "medium": medium_count,
            "low": low_count,
            "total": len(findings),
        },
        "firstFocus": first_focus,
        "findings": findings[:40],
        "payloadStatus": {
            path: {
                "status": payload.get("status", "unknown"),
                "error": payload.get("error", ""),
            }
            for path, payload in payloads.items()
        },
        "safeCommands": {
            "refreshState": "script/agentctl.sh editor-loop-proof",
            "decisionEvidence": "script/agentctl.sh decision-intent-evidence",
            "saveAudit": "script/agentctl.sh cut-rhythm-audit-save",
            "decisionListen": "script/agentctl.sh decision-listen Codex \"rhythm audit says this needs a normal-speed listen\"",
            "decisionRefine": "script/agentctl.sh decision-refine Codex \"rhythm audit found jump/cadence/source ambiguity\"",
            "reviewCockpit": "script/agentctl.sh editor-review-cockpit-save",
        },
        "truth": "Read-only cut rhythm audit. It does not edit, approve, export, publish, delete, or mutate source media.",
    }


def render_markdown(audit: dict[str, Any]) -> str:
    counts = dict_value(audit.get("findingCounts"))
    decision_counts = dict_value(audit.get("decisionCounts"))
    findings = list_value(audit.get("findings"))
    safe_commands = dict_value(audit.get("safeCommands"))
    lines = [
        "# Quipsly Cut Rhythm Audit",
        "",
        f"- Status: `{audit.get('status', '')}`",
        f"- Truth: {audit.get('truth', '')}",
        f"- Base URL: `{audit.get('baseUrl', '')}`",
        f"- Decisions inspected: {audit.get('decisionCount', 0)}",
        f"- Decision mix: {', '.join(f'{key}={value}' for key, value in sorted(decision_counts.items())) or 'none exposed'}",
        f"- Findings: high={counts.get('high', 0)}, medium={counts.get('medium', 0)}, low={counts.get('low', 0)}, total={counts.get('total', 0)}",
        f"- Start here: {audit.get('firstFocus', '')}",
        "",
        "## What this is",
        "",
        "This is a listening/editing map for human-flow cuts: jump-cut risk, reaction-cover opportunities, J/L-cut candidates, cadence chips, and source ambiguity.",
        "",
        "## What this is not",
        "",
        "It is not approval, export proof, publishing proof, transcript truth, or permission to overwrite previous versions.",
    ]

    if findings:
        lines.extend(["", "## Findings", ""])
        for index, finding in enumerate(findings, start=1):
            decisions = list_value(finding.get("decisions"))
            review_action = dict_value(finding.get("reviewAction"))
            lines.extend(
                [
                    f"### {index}. {finding.get('title', '')}",
                    "",
                    f"- ID: `{finding.get('id', '')}`",
                    f"- Severity: `{finding.get('severity', '')}`",
                    f"- Kind: `{finding.get('kind', '')}`",
                    f"- Review mode: `{review_action.get('mode', '')}`",
                    f"- First action: {review_action.get('firstAction', '')}",
                    f"- Why: {finding.get('why', '')}",
                    f"- Recommendation: {finding.get('recommendation', '')}",
                    f"- Status command: `{review_action.get('statusCommand', '')}`",
                ]
            )
            for decision in decisions:
                if not isinstance(decision, dict):
                    continue
                lines.append(
                    f"- Span: `{decision.get('lane', '')}` {decision.get('start', '')} -> {decision.get('end', '')} "
                    f"({decision.get('duration', '')}s, {decision.get('type', '')})"
                )
            lines.append("")
    else:
        lines.extend(["", "## Findings", "", "- No concrete rhythm findings were available from the exposed state."])

    if safe_commands:
        lines.extend(["", "## Safe next commands", ""])
        for key, command in safe_commands.items():
            lines.append(f"- `{key}`: `{command}`")

    return "\n".join(lines).rstrip() + "\n"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Render a read-only Quipsly cut rhythm audit.")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--json", action="store_true", help="Render JSON instead of Markdown.")
    parser.add_argument("--markdown", action="store_true", help="Render Markdown. This is the default.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    audit = make_audit(args.base_url)
    if args.json and not args.markdown:
        print(json.dumps(audit, indent=2, sort_keys=True))
    else:
        print(render_markdown(audit))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
