#!/usr/bin/env python3
"""Read-only shorts review workbench for Quipsly Studio.

This tool gives humans and agents one compact way to inspect the currently
selected short candidate: hook, mini-arc, platform fit, Cut Intelligence overlap,
and the next safe metadata-only action. It never edits session state, exports,
publishes, or touches source media.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Any

from short_story_contract_common import build_short_story_contract, short_story_contract_markdown_lines


DEFAULT_BASE_URL = (
    os.environ.get("QUIPSLY_STUDIO_AGENT_URL")
    or os.environ.get("QUIPSLY_AGENT_URL")
    or "http://127.0.0.1:8080"
)


def fetch_json(base_url: str, endpoint: str) -> tuple[dict[str, Any] | None, str]:
    url = urllib.parse.urljoin(base_url.rstrip("/") + "/", endpoint.lstrip("/"))
    try:
        with urllib.request.urlopen(url, timeout=4) as response:
            payload = json.loads(response.read().decode("utf-8"))
            if isinstance(payload, dict):
                return payload, ""
            return {"value": payload}, ""
    except urllib.error.HTTPError as error:
        return None, f"{endpoint}: HTTP {error.code}"
    except Exception as error:  # noqa: BLE001 - this is a diagnostic tool.
        return None, f"{endpoint}: {error}"


def dict_value(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def list_value(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def text_value(value: Any, fallback: str = "") -> str:
    if value is None:
        return fallback
    text = str(value).strip()
    return text if text else fallback


def int_value(value: Any, fallback: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return fallback


def first_present(*values: Any, fallback: Any = None) -> Any:
    for value in values:
        if value not in (None, "", [], {}):
            return value
    return fallback


def selected_short_from_sources(short_quality: dict[str, Any], cockpit: dict[str, Any], state: dict[str, Any]) -> dict[str, Any]:
    candidates = [
        short_quality.get("selectedShort"),
        short_quality.get("selectedShortClip"),
        short_quality.get("short"),
        dict_value(cockpit.get("selectedShort")),
        dict_value(cockpit.get("selectedShortClip")),
        dict_value(state.get("selectedShort")),
        dict_value(state.get("selectedShortClip")),
    ]
    for candidate in candidates:
        candidate_dict = dict_value(candidate)
        if candidate_dict:
            return candidate_dict
    return {}


def quality_from_sources(short_quality: dict[str, Any], cockpit: dict[str, Any], selected_short: dict[str, Any]) -> dict[str, Any]:
    candidates = [
        short_quality.get("selectedShortQuality"),
        short_quality.get("quality"),
        short_quality.get("brief"),
        dict_value(cockpit.get("selectedShortQuality")),
        dict_value(selected_short.get("creatorQuality")),
        dict_value(selected_short.get("quality")),
    ]
    for candidate in candidates:
        candidate_dict = dict_value(candidate)
        if candidate_dict:
            return candidate_dict
    return {}


def build_workbench(base_url: str) -> dict[str, Any]:
    short_quality, short_error = fetch_json(base_url, "/selected_short_quality")
    cockpit, cockpit_error = fetch_json(base_url, "/editor_review_cockpit")
    state, state_error = fetch_json(base_url, "/state")

    short_quality = short_quality or {}
    cockpit = cockpit or {}
    state = state or {}

    selected_short = selected_short_from_sources(short_quality, cockpit, state)
    quality = quality_from_sources(short_quality, cockpit, selected_short)
    creative = dict_value(first_present(
        quality.get("creativeReadiness"),
        short_quality.get("creativeReadiness"),
        selected_short.get("creativeReadiness"),
        fallback={},
    ))
    cut_evidence = dict_value(first_present(
        quality.get("cutIntelligenceEvidence"),
        short_quality.get("cutIntelligenceEvidence"),
        selected_short.get("cutIntelligenceEvidence"),
        fallback={},
    ))
    publish = dict_value(first_present(
        quality.get("publishReadiness"),
        short_quality.get("publishReadiness"),
        selected_short.get("publishReadiness"),
        fallback={},
    ))

    title = text_value(first_present(
        selected_short.get("title"),
        selected_short.get("label"),
        selected_short.get("hookText"),
        short_quality.get("title"),
        fallback="No selected short",
    ))
    hook = text_value(first_present(
        selected_short.get("hookText"),
        selected_short.get("hook"),
        short_quality.get("hookText"),
        fallback="",
    ))
    duration = first_present(
        selected_short.get("duration"),
        selected_short.get("exportDuration"),
        quality.get("exportDuration"),
        short_quality.get("exportDuration"),
        fallback=0,
    )
    review_status = text_value(first_present(
        selected_short.get("reviewStatus"),
        quality.get("recommendedReviewStatus"),
        short_quality.get("recommendedReviewStatus"),
        fallback="unknown",
    ))
    quality_score = int_value(first_present(
        quality.get("score"),
        creative.get("score"),
        short_quality.get("score"),
        fallback=0,
    ))

    actions = list_value(first_present(quality.get("actions"), short_quality.get("actions"), fallback=[]))
    risks = list_value(first_present(quality.get("risks"), creative.get("risks"), short_quality.get("risks"), fallback=[]))
    strengths = list_value(first_present(quality.get("strengths"), creative.get("strengths"), short_quality.get("strengths"), fallback=[]))
    story_short = dict(selected_short)
    if hook and not story_short.get("hookText"):
        story_short["hookText"] = hook
    story_contract = build_short_story_contract(
        story_short,
        {
            "exportProofLabel": first_present(
                quality.get("exportProofLabel"),
                short_quality.get("exportProofLabel"),
                creative.get("proofStatus"),
                fallback="",
            ),
            "proofStatus": first_present(
                quality.get("proofStatus"),
                publish.get("label"),
                fallback="",
            ),
        },
        cut_evidence,
        source="shorts-review-workbench",
    )
    story_contract.update(
        {
            "title": "Short-form story contract",
            "summary": "A postable short needs an opening promise, a middle turn, a payoff, sound-off support, and proof that the human edit flow works.",
            "duration": duration,
            "segmentCount": len(list_value(selected_short.get("segments"))),
            "publishReadiness": text_value(publish.get("label"), "unknown"),
            "jumpCutRiskCount": int_value(cut_evidence.get("jumpCutRiskCount")),
            "cadenceWarningCount": int_value(cut_evidence.get("cadenceWarningCount")),
            "safeAction": story_contract.get("nextAction", "Watch the proof like a stranger, then refine the weakest contract item before export or platform handoff."),
            "truth": "This is a review lens over selected-short metadata. It does not export, publish, overwrite, or mutate media.",
        }
    )

    next_action = text_value(first_present(
        quality.get("nextReviewAction"),
        creative.get("nextAction"),
        publish.get("nextAction"),
        short_quality.get("nextAction"),
        fallback="Select a short, watch it like a stranger, then decide Keep, Refine, or Reject with a note.",
    ))
    agent_instruction = text_value(first_present(
        quality.get("agentPrompt"),
        creative.get("agentInstruction"),
        short_quality.get("agentPrompt"),
        fallback="Inspect the proof if present. Verify hook -> turn -> payoff, captions, crop, platform copy, and Cut Intelligence overlap without publishing.",
    ))

    missing = [error for error in [short_error, cockpit_error, state_error] if error]

    return {
        "model": "quipsly-shorts-review-workbench",
        "generatedAt": datetime.now().isoformat(timespec="seconds"),
        "baseUrl": base_url,
        "status": "ready" if selected_short else "needs-selected-short",
        "selectedShort": {
            "id": text_value(selected_short.get("id")),
            "title": title,
            "hook": hook,
            "duration": duration,
            "reviewStatus": review_status,
        },
        "quality": {
            "score": quality_score,
            "label": text_value(first_present(quality.get("readinessLabel"), creative.get("label"), fallback="unknown")),
            "reviewClass": text_value(quality.get("reviewClass")),
            "reviewClassLabel": text_value(quality.get("reviewClassLabel")),
            "reviewClassExplanation": text_value(quality.get("reviewClassExplanation")),
            "creativeReadiness": creative,
            "publishReadiness": publish,
        },
        "shortStoryContract": story_contract,
        "cutIntelligenceEvidence": cut_evidence,
        "strengths": strengths[:8],
        "risks": risks[:8],
        "actions": actions[:8],
        "nextAction": next_action,
        "agentInstruction": agent_instruction,
        "safeCommands": {
            "selectedShortQuality": "GET /selected_short_quality",
            "editorReviewCockpit": "GET /editor_review_cockpit",
            "markRefine": "GET /shorts_quality_action?action=needs-refine",
            "fillHook": "GET /shorts_quality_action?action=fill-hook",
            "sharpenHook": "GET /shorts_quality_action?action=sharpen-hook",
            "draftPlatformPack": "GET /shorts_quality_action?action=draft-platform-pack",
            "savePlatformPackJSON": "GET /shorts_quality_action?action=save-platform-pack-json",
        },
        "endpointWarnings": missing,
        "truth": "Read-only review workbench. It does not export, publish, approve, mutate media, or change edit decisions.",
    }


def render_markdown(workbench: dict[str, Any]) -> str:
    selected = dict_value(workbench.get("selectedShort"))
    quality = dict_value(workbench.get("quality"))
    creative = dict_value(quality.get("creativeReadiness"))
    publish = dict_value(quality.get("publishReadiness"))
    story_contract = dict_value(workbench.get("shortStoryContract"))
    cut_evidence = dict_value(workbench.get("cutIntelligenceEvidence"))

    contract_lines = short_story_contract_markdown_lines(
        story_contract,
        selected_short_title=str(selected.get("title", "No selected short")),
    )
    if contract_lines and contract_lines[0].startswith("# "):
        contract_lines = ["## Short-form story contract", *contract_lines[2:]]

    lines = [
        "# Shorts review workbench",
        "",
        f"- Status: `{workbench.get('status', '')}`",
        f"- Selected short: {selected.get('title', 'No selected short')}",
        f"- Hook: {selected.get('hook', '') or 'missing'}",
        f"- Duration: {selected.get('duration', 0)}",
        f"- Review status: `{selected.get('reviewStatus', 'unknown')}`",
        f"- Quality: {quality.get('score', 0)} / {quality.get('label', 'unknown')}",
        f"- Review class: `{quality.get('reviewClass', '')}` {quality.get('reviewClassLabel', '')}",
        "",
    ]
    lines.extend(contract_lines)
    lines.append("")

    lines.extend([
        "## Creative checks",
        f"- Hook: `{creative.get('hookStatus', 'unknown')}`",
        f"- Pacing: `{creative.get('pacingStatus', 'unknown')}`",
        f"- Caption: `{creative.get('captionStatus', 'unknown')}`",
        f"- Framing: `{creative.get('framingStatus', 'unknown')}`",
        f"- Platform: `{creative.get('platformStatus', 'unknown')}`",
        f"- Publish readiness: `{publish.get('label', 'unknown')}`",
        "",
        "## Cut Intelligence overlap",
        f"- Summary: `{cut_evidence.get('summary', 'unknown')}`",
        f"- Findings: {cut_evidence.get('overlappedFindingCount', 0)}",
        f"- Jump risks: {cut_evidence.get('jumpCutRiskCount', 0)}",
        f"- Cadence warnings: {cut_evidence.get('cadenceWarningCount', 0)}",
        f"- Reaction opportunities: {cut_evidence.get('reactionOpportunityCount', 0)}",
        f"- Next: {cut_evidence.get('nextAction', '')}",
        "",
        "## Next safe action",
        f"{workbench.get('nextAction', '')}",
        "",
        "## Agent instruction",
        f"{workbench.get('agentInstruction', '')}",
        "",
    ])

    for section_name in ["strengths", "risks", "actions"]:
        items = list_value(workbench.get(section_name))
        lines.extend([f"## {section_name.title()}", ""])
        if not items:
            lines.append("- none reported")
        for item in items:
            if isinstance(item, dict):
                title = text_value(item.get("title"), text_value(item.get("name"), "item"))
                detail = text_value(item.get("detail"), text_value(item.get("rationale"), ""))
                lines.append(f"- {title}: {detail}" if detail else f"- {title}")
            else:
                lines.append(f"- {item}")
        lines.append("")

    warnings = list_value(workbench.get("endpointWarnings"))
    if warnings:
        lines.extend(["## Endpoint warnings", ""])
        lines.extend(f"- {warning}" for warning in warnings)
        lines.append("")

    lines.extend([
        "## Safe commands",
        "",
    ])
    for label, command in dict_value(workbench.get("safeCommands")).items():
        lines.append(f"- `{label}`: `{command}`")
    lines.extend([
        "",
        f"Truth: {workbench.get('truth', '')}",
    ])
    return "\n".join(lines).strip() + "\n"


def save_workbench(workbench: dict[str, Any], markdown: str, output_root: str | None) -> Path:
    root = Path(output_root or "~/Movies/QuipslyExports/ShortReviewWorkbenches").expanduser()
    root.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    title = text_value(dict_value(workbench.get("selectedShort")).get("title"), "selected-short")
    slug = "".join(char.lower() if char.isalnum() else "-" for char in title).strip("-")
    slug = "-".join(part for part in slug.split("-") if part)[:80] or "selected-short"
    folder = root / f"{stamp}-{slug}"
    folder.mkdir(parents=True, exist_ok=False)
    (folder / "shorts-review-workbench.json").write_text(json.dumps(workbench, indent=2, sort_keys=True), encoding="utf-8")
    (folder / "shorts-review-workbench.md").write_text(markdown, encoding="utf-8")
    return folder


def main() -> int:
    parser = argparse.ArgumentParser(description="Read-only Quipsly Studio shorts review workbench.")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--json", action="store_true", help="Print JSON instead of Markdown.")
    parser.add_argument("--save", action="store_true", help="Save JSON and Markdown packet under QuipslyExports.")
    parser.add_argument("--output-root", default=None, help="Optional output root for --save.")
    args = parser.parse_args()

    workbench = build_workbench(args.base_url)
    markdown = render_markdown(workbench)
    if args.save:
        folder = save_workbench(workbench, markdown, args.output_root)
        workbench["savedTo"] = str(folder)
        markdown += f"\nSaved to: `{folder}`\n"

    if args.json:
        print(json.dumps(workbench, indent=2, sort_keys=True))
    else:
        print(markdown)
    return 0


if __name__ == "__main__":
    sys.exit(main())
