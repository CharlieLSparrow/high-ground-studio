#!/usr/bin/env python3
"""Render a selected-short creative review packet.

Read-only formatter for improving shorts quality. The app owns selected-short
state; this helper only formats existing endpoint evidence into a practical
human/agent review checklist.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from typing import Any


DEFAULT_BASE_URL = "http://127.0.0.1:8765"


ENDPOINTS = {
    "quality": "/selected_short_quality",
    "guidance": "/selected_short_human_review_guidance",
    "brief": "/selected_short_production_brief",
}


def fetch_json(base_url: str, path: str) -> dict[str, Any]:
    url = f"{base_url.rstrip('/')}{path}"
    request = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.URLError as exc:
        return {
            "status": "unreachable",
            "error": str(exc),
            "path": path,
            "truth": "Could not reach the running Quipsly Studio agent server. No media, exports, selections, or session state were changed.",
        }
    except TimeoutError as exc:
        return {
            "status": "unreachable",
            "error": f"timeout: {exc}",
            "path": path,
            "truth": "Timed out reaching the running Quipsly Studio agent server. No media, exports, selections, or session state were changed.",
        }
    except json.JSONDecodeError as exc:
        return {
            "status": "invalid_json",
            "error": str(exc),
            "path": path,
            "truth": "The agent server responded, but not with valid JSON. No media, exports, selections, or session state were changed.",
        }
    except Exception as exc:
        return {
            "status": "unreachable",
            "error": str(exc),
            "path": path,
            "truth": "Could not read the running Quipsly Studio agent server. No media, exports, selections, or session state were changed.",
        }


def s(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


def n(value: Any) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return 0.0
    return 0.0


def as_list(value: Any) -> list[Any]:
    if isinstance(value, list):
        return value
    return []


def find_first_string(payloads: list[dict[str, Any]], keys: list[str]) -> str:
    for payload in payloads:
        stack: list[Any] = [payload]
        while stack:
            item = stack.pop()
            if isinstance(item, dict):
                for key in keys:
                    value = item.get(key)
                    text = s(value)
                    if text:
                        return text
                stack.extend(item.values())
            elif isinstance(item, list):
                stack.extend(item)
    return ""


def find_first_number(payloads: list[dict[str, Any]], keys: list[str]) -> float:
    for payload in payloads:
        stack: list[Any] = [payload]
        while stack:
            item = stack.pop()
            if isinstance(item, dict):
                for key in keys:
                    if key in item:
                        value = n(item.get(key))
                        if value:
                            return value
                stack.extend(item.values())
            elif isinstance(item, list):
                stack.extend(item)
    return 0.0


def collect_strings(payloads: list[dict[str, Any]], keys: list[str], limit: int = 8) -> list[str]:
    found: list[str] = []
    seen: set[str] = set()
    for payload in payloads:
        stack: list[Any] = [payload]
        while stack and len(found) < limit:
            item = stack.pop()
            if isinstance(item, dict):
                for key in keys:
                    value = item.get(key)
                    if isinstance(value, list):
                        for entry in value:
                            text = s(entry)
                            if text and text not in seen:
                                found.append(text)
                                seen.add(text)
                                if len(found) >= limit:
                                    break
                    else:
                        text = s(value)
                        if text and text not in seen:
                            found.append(text)
                            seen.add(text)
                stack.extend(item.values())
            elif isinstance(item, list):
                stack.extend(item)
    return found[:limit]


def is_unusable_endpoint(payload: dict[str, Any]) -> bool:
    return s(payload.get("status")) in {"unreachable", "invalid_json"}


def quality_from_state(state: dict[str, Any]) -> dict[str, Any]:
    selected = state.get("selectedShortClip") or {}
    if not isinstance(selected, dict) or not selected.get("id"):
        return {
            "status": "no_selected_short",
            "model": "quipslystudio-selected-short-quality-fallback",
            "truth": "State fallback reached the app, but no selected short recipe was found.",
        }

    quality = selected.get("creatorQuality") or {}
    passport = selected.get("publicationPassport") or {}
    if not isinstance(quality, dict):
        quality = {}
    if not isinstance(passport, dict):
        passport = {}

    hook = s(selected.get("hookText"))
    caption = s(selected.get("captionDraft")) or s(selected.get("primaryOverlayText"))
    duration = n(selected.get("recipeDuration") or selected.get("duration"))
    start = n(selected.get("sequenceStartTime") or selected.get("startTime"))
    end = n(selected.get("sequenceEndTime") or selected.get("endTime"))
    platform = s(passport.get("primaryPlatform")) or s(quality.get("primaryPlatform"))
    summary = quality.get("qualityPacketSummary") or {}

    review_checks: list[dict[str, str]] = [
        {
            "id": "hook",
            "label": "First-second hook",
            "status": "present" if hook else "needs_work",
            "evidence": hook or "No hook text on selected short.",
            "nextAction": "Watch the first three seconds and verify the video supports the hook." if hook else "Write a concrete promise, tension, question, or useful mistake before Keep.",
        },
        {
            "id": "pacing",
            "label": "Pacing and payoff",
            "status": "review" if duration > 0 else "unknown",
            "evidence": f"{duration:.1f}s recipe" if duration > 0 else "Duration unavailable.",
            "nextAction": "Proof-listen for rushed cuts, dead air, and whether the ending rewards the hook.",
        },
        {
            "id": "caption-framing",
            "label": "Caption and 9:16 framing",
            "status": "metadata_present" if caption else "needs_metadata",
            "evidence": "Caption/overlay metadata exists; keep text face-safe before burn-in." if caption else "No caption or overlay draft present.",
            "nextAction": "Inspect crop and safe zones so text does not land on faces." if caption else "Add platform caption copy or one face-safe on-screen phrase.",
        },
    ]

    return {
        "status": "selected_short_quality_state_fallback",
        "model": "quipslystudio-selected-short-quality-state-fallback",
        "selectedShortId": selected.get("id") or "",
        "title": selected.get("title") or "",
        "sequenceStart": start,
        "sequenceEnd": end,
        "recipeDuration": duration,
        "duration": duration,
        "reviewStatus": selected.get("reviewStatus") or "",
        "exportStatus": selected.get("exportStatus") or "",
        "primaryPlatform": platform,
        "hook": hook,
        "captionDraft": caption,
        "publicationPassport": passport,
        "qualitySummary": summary,
        "weakestQualityDimensions": quality.get("weakestQualityDimensions") or quality.get("qualityDimensions") or [],
        "platformVariants": selected.get("platformVariants") or quality.get("platformVariants") or passport.get("platformVariants") or [],
        "cutIntelligenceEvidence": selected.get("cutIntelligenceEvidence") or quality.get("cutIntelligenceEvidence") or {},
        "reviewChecklist": review_checks,
        "nextSafeAction": passport.get("nextAction") or summary.get("nextSafeAction") or quality.get("nextAction") or "",
        "truth": "State fallback over selectedShortClip. This reads app state only; it does not export, approve, publish, or mutate source media.",
    }


def format_time(seconds: float) -> str:
    minutes = int(seconds // 60)
    remainder = seconds - minutes * 60
    return f"{minutes}:{remainder:05.2f}"


def build_packet(base_url: str) -> dict[str, Any]:
    state = fetch_json(base_url, "/state")
    if not is_unusable_endpoint(state):
        quality = quality_from_state(state)
        guidance = {
            "status": "state_primary",
            "truth": "Selected-short creative packet uses /state as the primary fast path.",
        }
        brief = {
            "status": "state_primary",
            "truth": "Selected-short creative packet uses /state as the primary fast path.",
        }
    else:
        quality = fetch_json(base_url, ENDPOINTS["quality"])
        guidance = fetch_json(base_url, ENDPOINTS["guidance"])
        brief = fetch_json(base_url, ENDPOINTS["brief"])
    payloads = [quality, guidance, brief]

    title = find_first_string(payloads, ["title", "shortTitle", "selectedShortTitle", "name"])
    hook = find_first_string(payloads, ["hook", "openingHook", "opening", "firstThreeSeconds", "first3Seconds"])
    caption = find_first_string(payloads, ["caption", "captionDraft", "captionText", "onScreenText", "textOverlay"])
    platform = find_first_string(payloads, ["platform", "primaryPlatform", "targetPlatform"])
    status = find_first_string(payloads, ["reviewStatus", "status", "shortStatus"])
    duration = find_first_number(payloads, ["duration", "selectedShortDuration", "durationSeconds"])
    start = find_first_number(payloads, ["start", "sequenceStart", "selectedShortStart"])
    end = find_first_number(payloads, ["end", "sequenceEnd", "selectedShortEnd"])
    if not duration and end > start:
        duration = end - start

    risks = collect_strings(payloads, ["risks", "warnings", "problems", "qualityRisks", "reviewRisks"], limit=10)
    strengths = collect_strings(payloads, ["strengths", "signals", "whyItWorks", "positiveSignals", "opportunities"], limit=10)
    next_actions = collect_strings(payloads, ["nextAction", "nextActions", "nextSafeAction", "recommendedActions", "reviewChecklist"], limit=10)
    platforms = collect_strings(payloads, ["platforms", "platformVariants", "destinations", "publicationTargets"], limit=10)

    checks: list[dict[str, str]] = []
    checks.append({
        "id": "hook",
        "label": "Hook clarity",
        "question": "Does the first three seconds create curiosity, tension, surprise, or a useful promise?",
        "evidence": hook or "No explicit hook found in current selected-short metadata.",
        "action": "Write or refine the hook before export if the opening depends on context from earlier in the episode.",
    })
    checks.append({
        "id": "pacing",
        "label": "Human pacing",
        "question": "Does the clip move quickly without sounding like a chopped-up robot?",
        "evidence": f"Duration {duration:.1f}s" if duration else "No duration found.",
        "action": "Listen once at normal speed; preserve breath, laugh, reaction, or setup if it carries meaning.",
    })
    checks.append({
        "id": "caption",
        "label": "Caption awareness",
        "question": "Would captions or on-screen text clarify the point without covering faces?",
        "evidence": caption or "No caption/text overlay draft found.",
        "action": "Draft one short caption line and keep face-safe placement in mind.",
    })
    checks.append({
        "id": "framing",
        "label": "9:16 framing",
        "question": "Are faces, reaction, and referenced visual evidence readable in vertical framing?",
        "evidence": "Selected-short packet is metadata-only; preview in Program Output before posting.",
        "action": "Check vertical crop, headroom, and speaker/reaction visibility before final export.",
    })
    checks.append({
        "id": "platform-fit",
        "label": "Platform fit",
        "question": "Does this need different captions, title, or pacing for YouTube Shorts, Instagram, Facebook, LinkedIn, or Patreon?",
        "evidence": platform or (", ".join(platforms) if platforms else "No target platform found."),
        "action": "Create platform variants only when the audience/context changes; do not fake publication receipts.",
    })

    readiness = "needs-review"
    if status.lower() in {"keep", "ready", "reviewed", "exported"} and hook and duration:
        readiness = "reviewable-candidate"
    if risks and not strengths:
        readiness = "risk-heavy"

    return {
        "status": "selected_short_creative_review_packet",
        "model": "quipslystudio-selected-short-creative-review-packet",
        "selectedShort": {
            "title": title or "Untitled selected short",
            "reviewStatus": status or "unknown",
            "start": start,
            "end": end,
            "duration": duration,
            "timecode": f"{format_time(start)} -> {format_time(end)}" if start or end else "unknown",
            "readiness": readiness,
        },
        "creativeSurface": {
            "hook": hook,
            "captionDraft": caption,
            "primaryPlatform": platform,
            "strengths": strengths,
            "risks": risks,
            "nextActions": next_actions,
        },
        "reviewChecks": checks,
        "sourceEndpoints": {
            "quality": ENDPOINTS["quality"],
            "humanReviewGuidance": ENDPOINTS["guidance"],
            "productionBrief": ENDPOINTS["brief"],
        },
        "rawStatus": {
            "quality": quality.get("status"),
            "guidance": guidance.get("status"),
            "brief": brief.get("status"),
        },
        "truth": "Read-only selected-short creative review packet. It does not edit, export, publish, schedule, overwrite, or mutate source media.",
    }


def render_markdown(packet: dict[str, Any]) -> str:
    selected = packet.get("selectedShort") or {}
    creative = packet.get("creativeSurface") or {}
    checks = packet.get("reviewChecks") or []
    lines = [
        "# Selected Short Creative Review Packet",
        "",
        packet.get("truth", "Read-only packet."),
        "",
        "## Short",
        f"- Title: {s(selected.get('title')) or 'Untitled selected short'}",
        f"- Status: `{s(selected.get('reviewStatus')) or 'unknown'}`",
        f"- Readiness: `{s(selected.get('readiness')) or 'unknown'}`",
        f"- Time: {s(selected.get('timecode')) or 'unknown'} ({n(selected.get('duration')):.1f}s)",
        "",
        "## Creative surface",
        f"- Hook: {s(creative.get('hook')) or 'No explicit hook yet.'}",
        f"- Caption/text: {s(creative.get('captionDraft')) or 'No caption or text-overlay draft yet.'}",
        f"- Primary platform: {s(creative.get('primaryPlatform')) or 'not specified'}",
        "",
        "## Review checks",
    ]
    for check in checks:
        if not isinstance(check, dict):
            continue
        lines.extend([
            f"- {s(check.get('label')) or s(check.get('id'))}: {s(check.get('question'))}",
            f"  Evidence: {s(check.get('evidence')) or 'none'}",
            f"  Action: {s(check.get('action')) or 'review manually'}",
        ])

    strengths = creative.get("strengths") or []
    risks = creative.get("risks") or []
    next_actions = creative.get("nextActions") or []
    if strengths:
        lines.extend(["", "## Strengths"])
        for item in strengths[:8]:
            lines.append(f"- {s(item)}")
    if risks:
        lines.extend(["", "## Risks"])
        for item in risks[:8]:
            lines.append(f"- {s(item)}")
    if next_actions:
        lines.extend(["", "## Next actions"])
        for item in next_actions[:8]:
            lines.append(f"- {s(item)}")

    lines.extend([
        "",
        "Truth: this packet is a review aid only. It does not prove export or publication readiness by itself.",
    ])
    return "\n".join(lines).rstrip() + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Render a selected-short creative review packet.")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--markdown", action="store_true")
    args = parser.parse_args()

    packet = build_packet(args.base_url)
    if args.json:
        print(json.dumps(packet, indent=2, sort_keys=True))
    else:
        sys.stdout.write(render_markdown(packet))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
