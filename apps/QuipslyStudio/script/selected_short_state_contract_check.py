#!/usr/bin/env python3
"""Read-only selected-short state contract checker.

Compares the selected-short identity and next-action guidance across:
- /state
- /selected_short_quality
- /selected_short_production_brief

This does not export, publish, approve, mutate short metadata, or touch source
media. It exists so humans and agents can confirm that the app, quality
passport, and production brief are describing the same selected short.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.request
from typing import Any


DEFAULT_BASE_URL = os.environ.get("QUIPSLY_STUDIO_AGENT_URL", "http://127.0.0.1:8765")


def dict_value(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def text_value(value: Any, fallback: str = "") -> str:
    text = str(value or "").strip()
    return text if text else fallback


def fetch_json(base_url: str, path: str) -> tuple[dict[str, Any], str]:
    try:
        with urllib.request.urlopen(base_url.rstrip("/") + path, timeout=3) as response:
            payload = json.loads(response.read().decode("utf-8"))
        return (payload if isinstance(payload, dict) else {"value": payload}, "")
    except Exception as error:  # noqa: BLE001 - diagnostic surface.
        return {}, str(error)


def selected_from_state(state: dict[str, Any]) -> dict[str, Any]:
    return dict_value(state.get("selectedShortClip"))


def selected_id_from_state(state: dict[str, Any]) -> str:
    selected = selected_from_state(state)
    return text_value(selected.get("id") or state.get("selectedShortClipId"))


def selected_title_from_state(state: dict[str, Any]) -> str:
    return text_value(selected_from_state(state).get("title"))


def selected_id_from_quality(quality: dict[str, Any]) -> str:
    return text_value(quality.get("selectedShortId"))


def selected_id_from_brief(brief: dict[str, Any]) -> str:
    selected = dict_value(brief.get("selectedShort"))
    return text_value(brief.get("selectedShortId") or selected.get("id"))


def action_from_brief(brief: dict[str, Any]) -> dict[str, Any]:
    return dict_value(brief.get("recommendedAction"))


def action_command(action: dict[str, Any]) -> str:
    return text_value(action.get("nextCommand") or action.get("command"))


def build_payload(base_url: str) -> dict[str, Any]:
    state, state_error = fetch_json(base_url, "/state")
    quality, quality_error = fetch_json(base_url, "/selected_short_quality")
    brief, brief_error = fetch_json(base_url, "/selected_short_production_brief")

    state_id = selected_id_from_state(state)
    quality_id = selected_id_from_quality(quality)
    brief_id = selected_id_from_brief(brief)
    ids = [value for value in [state_id, quality_id, brief_id] if value]
    unique_ids = sorted(set(ids))
    action = action_from_brief(brief)
    quality_next = text_value(quality.get("nextSafeAction") or quality.get("selectedShortNextAction"))
    action_why = text_value(action.get("why"))
    errors = {
        "state": state_error,
        "quality": quality_error,
        "productionBrief": brief_error,
    }
    missing_errors = {key: value for key, value in errors.items() if value}
    missing_ids = [
        key
        for key, value in {
            "state": state_id,
            "quality": quality_id,
            "productionBrief": brief_id,
        }.items()
        if not value
    ]
    ids_match = bool(ids) and len(unique_ids) == 1 and len(missing_ids) == 0
    action_aligned = not quality_next or not action_why or quality_next == action_why or quality_next in action_why or action_why in quality_next
    status = "contract-ok" if ids_match and not missing_errors else "needs-attention"

    return {
        "model": "quipsly-selected-short-state-contract-check",
        "version": "2026-06-30.selected-short-state-contract-check.v1",
        "status": status,
        "baseUrl": base_url,
        "idsMatch": ids_match,
        "missingIds": missing_ids,
        "errors": missing_errors,
        "selectedShort": {
            "id": state_id or quality_id or brief_id,
            "title": selected_title_from_state(state) or text_value(quality.get("title") or brief.get("selectedShortTitle")),
        },
        "state": {
            "selectedShortId": state_id,
            "selectedShortTitle": selected_title_from_state(state),
        },
        "quality": {
            "status": quality.get("status", ""),
            "selectedShortId": quality_id,
            "nextSafeAction": quality_next,
            "safeCommands": quality.get("safeCommands", {}),
        },
        "productionBrief": {
            "status": brief.get("status", ""),
            "selectedShortId": brief_id,
            "source": brief.get("source", ""),
            "recommendedAction": action,
            "safeCommands": brief.get("safeCommands", {}),
        },
        "actionAlignedEnoughForReview": action_aligned,
        "nextSafeCommand": action_command(action),
        "nextSafeAction": action.get("label", ""),
        "nextSafeWhy": action.get("why", ""),
        "truth": "Read-only consistency check. It does not approve, export, publish, mutate short metadata, or touch source media."
    }


def print_markdown(payload: dict[str, Any]) -> None:
    selected = dict_value(payload.get("selectedShort"))
    brief = dict_value(payload.get("productionBrief"))
    action = dict_value(brief.get("recommendedAction"))
    print("# Selected short state contract check")
    print()
    print(f"- Status: `{payload.get('status', 'unknown')}`")
    print(f"- Selected: {selected.get('title', '') or '(untitled)'}")
    print(f"- Selected ID: `{selected.get('id', '')}`")
    print(f"- IDs match: `{payload.get('idsMatch', False)}`")
    if payload.get("missingIds"):
        print(f"- Missing ID surfaces: {', '.join(payload.get('missingIds', []))}")
    if payload.get("errors"):
        print(f"- Endpoint errors: `{payload.get('errors')}`")
    print()
    print("## Next safe action")
    print()
    print(f"- Action: `{action.get('label', payload.get('nextSafeAction', 'unknown'))}`")
    print(f"- Why: {action.get('why', payload.get('nextSafeWhy', ''))}")
    print(f"- Command: `{action_command(action) or payload.get('nextSafeCommand', '')}`")
    print()
    print("## Surface comparison")
    print()
    print(f"- `/state`: `{dict_value(payload.get('state')).get('selectedShortId', '')}`")
    print(f"- `/selected_short_quality`: `{dict_value(payload.get('quality')).get('selectedShortId', '')}`")
    print(f"- `/selected_short_production_brief`: `{dict_value(payload.get('productionBrief')).get('selectedShortId', '')}`")
    print()
    print(f"Truth: {payload.get('truth', '')}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Check selected-short state/quality/production-brief consistency.")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--markdown", action="store_true")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    payload = build_payload(args.base_url)
    if args.markdown and not args.json:
        print_markdown(payload)
    else:
        print(json.dumps(payload, indent=2, sort_keys=True))

    return 0 if payload.get("status") == "contract-ok" else 1


if __name__ == "__main__":
    sys.exit(main())
