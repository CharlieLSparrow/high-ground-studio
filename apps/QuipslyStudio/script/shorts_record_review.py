#!/usr/bin/env python3
"""Record or run selected-short review actions in Quipsly Studio.

Default mode is dry-run. Use --apply to call the running Studio AgentServer.
This tool only targets the selected-short quality action endpoint. It does not
export, publish, upload, overwrite files, move clips, or mutate source media.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime
from typing import Any

from selected_short_production_brief import build_payload as build_short_production_brief_payload
from selected_short_story_contract import build_payload as build_story_contract_payload
from selected_short_story_contract import read_state as read_story_contract_state


DEFAULT_BASE_URL = os.environ.get("QUIPSLY_STUDIO_AGENT_URL", "http://127.0.0.1:8765")
ALLOWED_ACTIONS = {
    "needs-refine": {
        "label": "Mark selected short needs refine",
        "safety": "metadata-only",
        "effect": "Marks the selected short as needing refinement and records current quality risks in publish notes.",
    },
    "fill-hook": {
        "label": "Fill missing hook",
        "safety": "metadata-only",
        "effect": "Fills a missing hook or preserves the existing hook and records the suggestion in notes.",
    },
    "sharpen-hook": {
        "label": "Sharpen hook",
        "safety": "metadata-only",
        "effect": "Rewrites a label-like hook into a stronger stop-scroll promise while preserving prior copy in notes.",
    },
    "draft-copy": {
        "label": "Draft platform copy",
        "safety": "metadata-only",
        "effect": "Drafts platform/caption metadata and preserves existing copy instead of overwriting it.",
    },
    "draft-platform-pack": {
        "label": "Draft native platform pack",
        "safety": "metadata-only",
        "effect": "Creates or completes selected-short native platform variants without publishing.",
    },
    "draft-all-platform-packs": {
        "label": "Draft all native platform packs",
        "safety": "metadata-only",
        "effect": "Creates or completes native variants for every short in the active sequence without publishing.",
    },
    "copy-platform-pack-json": {
        "label": "Copy platform pack JSON",
        "safety": "clipboard-only",
        "effect": "Copies the platform-pack preview payload for agent/Tower/manual review.",
    },
    "save-platform-pack-json": {
        "label": "Save platform pack JSON",
        "safety": "local-artifact-only",
        "effect": "Writes the platform-pack payload as a local handoff JSON artifact and copies its path.",
    },
    "copy-polish-prompt": {
        "label": "Copy polish prompt",
        "safety": "clipboard-only",
        "effect": "Copies an agent-safe polishing prompt for the selected short.",
    },
}


def normalize_action(raw: str) -> str:
    return raw.strip().lower().replace("_", "-")


def build_url(base_url: str, action: str) -> str:
    root = base_url.rstrip("/") + "/"
    query = urllib.parse.urlencode({"action": action})
    return urllib.parse.urljoin(root, "/shorts_quality_action") + "?" + query


def call_json(url: str) -> dict[str, Any]:
    with urllib.request.urlopen(url, timeout=8) as response:
        payload = json.loads(response.read().decode("utf-8"))
        return payload if isinstance(payload, dict) else {"value": payload}


def story_contract_snapshot(base_url: str) -> dict[str, Any]:
    try:
        return build_story_contract_payload(read_story_contract_state(base_url))
    except Exception as error:  # noqa: BLE001 - diagnostic receipt context.
        return {
            "ok": False,
            "error": str(error),
            "nextAction": "Could not read selected-short story contract before recording the review action.",
        }


def story_contract_delta(before: dict[str, Any], after: dict[str, Any]) -> dict[str, Any]:
    before_contract = (before or {}).get("shortStoryContract") or {}
    after_contract = (after or {}).get("shortStoryContract") or {}
    before_checks = {
        str(check.get("id", "")): bool(check.get("ready"))
        for check in before_contract.get("checks", [])
        if isinstance(check, dict)
    }
    after_checks = {
        str(check.get("id", "")): bool(check.get("ready"))
        for check in after_contract.get("checks", [])
        if isinstance(check, dict)
    }
    changed_checks = []
    for check_id in sorted(set(before_checks) | set(after_checks)):
        if before_checks.get(check_id) != after_checks.get(check_id):
            changed_checks.append(
                {
                    "id": check_id,
                    "beforeReady": before_checks.get(check_id),
                    "afterReady": after_checks.get(check_id),
                }
            )
    return {
        "beforeLabel": before_contract.get("label", ""),
        "afterLabel": after_contract.get("label", ""),
        "beforeReadyCount": before_contract.get("readyCount"),
        "afterReadyCount": after_contract.get("readyCount"),
        "changedChecks": changed_checks,
        "nextActionBefore": before_contract.get("nextAction", ""),
        "nextActionAfter": after_contract.get("nextAction", ""),
    }


def production_brief_snapshot(base_url: str) -> dict[str, Any]:
    try:
        return build_short_production_brief_payload(base_url)
    except Exception as error:  # noqa: BLE001 - diagnostic receipt context.
        return {
            "ok": False,
            "error": str(error),
            "nextAction": "Could not read selected-short production brief before recording the review action.",
        }


def production_brief_delta(before: dict[str, Any], after: dict[str, Any]) -> dict[str, Any]:
    before_action = (before or {}).get("recommendedAction") or {}
    after_action = (after or {}).get("recommendedAction") or {}
    before_story = (before or {}).get("storyContract") or {}
    after_story = (after or {}).get("storyContract") or {}
    before_platform = (before or {}).get("platformTargetSummary") or {}
    after_platform = (after or {}).get("platformTargetSummary") or {}
    before_cut = (before or {}).get("cutEvidenceSummary") or {}
    after_cut = (after or {}).get("cutEvidenceSummary") or {}
    return {
        "beforeAction": before_action.get("label", ""),
        "afterAction": after_action.get("label", ""),
        "actionChanged": before_action.get("label") != after_action.get("label"),
        "beforeActionWhy": before_action.get("why", ""),
        "afterActionWhy": after_action.get("why", ""),
        "beforeStoryLabel": before_story.get("label", ""),
        "afterStoryLabel": after_story.get("label", ""),
        "beforeProofReady": bool((before or {}).get("proofReady")),
        "afterProofReady": bool((after or {}).get("proofReady")),
        "beforePlatformReady": before_platform.get("readyCount"),
        "afterPlatformReady": after_platform.get("readyCount"),
        "beforePlatformTotal": before_platform.get("totalCount"),
        "afterPlatformTotal": after_platform.get("totalCount"),
        "beforeCutRisk": bool(before_cut.get("hasRisk")),
        "afterCutRisk": bool(after_cut.get("hasRisk")),
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Run a selected-short quality action. Dry-run unless --apply is passed."
    )
    parser.add_argument("action", help="One selected-short action, e.g. needs-refine, sharpen-hook, draft-platform-pack.")
    parser.add_argument("--note", default="", help="Optional operator note for the receipt. The app endpoint may not consume this yet.")
    parser.add_argument("--actor", default="Codex")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--apply", action="store_true", help="Actually call the running Studio endpoint.")
    parser.add_argument("--json", action="store_true", help="Print JSON receipt/dry-run payload.")
    args = parser.parse_args()

    action = normalize_action(args.action)
    if action not in ALLOWED_ACTIONS:
        allowed = ", ".join(sorted(ALLOWED_ACTIONS))
        print(f"Unknown action: {args.action}\nAllowed actions: {allowed}", file=sys.stderr)
        return 2

    meta = ALLOWED_ACTIONS[action]
    url = build_url(args.base_url, action)
    pre_action_story_contract = story_contract_snapshot(args.base_url)
    pre_action_production_brief = production_brief_snapshot(args.base_url)
    receipt: dict[str, Any] = {
        "model": "quipsly-shorts-record-review",
        "generatedAt": datetime.now().isoformat(timespec="seconds"),
        "mode": "apply" if args.apply else "dry-run",
        "action": action,
        "label": meta["label"],
        "effect": meta["effect"],
        "safety": meta["safety"],
        "actor": args.actor,
        "note": args.note,
        "baseUrl": args.base_url,
        "plannedCall": {
            "method": "GET",
            "url": url,
            "safety": meta["safety"],
        },
        "preActionStoryContract": pre_action_story_contract,
        "postActionStoryContract": None,
        "storyContractDelta": None,
        "preActionProductionBrief": pre_action_production_brief,
        "postActionProductionBrief": None,
        "productionBriefDelta": None,
        "result": None,
        "truth": "This tool targets selected-short review/prep metadata actions only. It does not export, publish, upload, overwrite files, move clips, or mutate source media.",
    }

    if args.apply:
        try:
            receipt["result"] = {
                "ok": True,
                "response": call_json(url),
            }
        except Exception as error:  # noqa: BLE001 - diagnostic receipt.
            receipt["result"] = {
                "ok": False,
                "error": str(error),
            }
        receipt["postActionStoryContract"] = story_contract_snapshot(args.base_url)
        receipt["storyContractDelta"] = story_contract_delta(
            pre_action_story_contract,
            receipt["postActionStoryContract"] or {},
        )
        receipt["postActionProductionBrief"] = production_brief_snapshot(args.base_url)
        receipt["productionBriefDelta"] = production_brief_delta(
            pre_action_production_brief,
            receipt["postActionProductionBrief"] or {},
        )

    if args.json:
        print(json.dumps(receipt, indent=2, sort_keys=True))
    else:
        print("# Selected short review/action recorder")
        print()
        print(f"- Mode: `{receipt['mode']}`")
        print(f"- Action: `{action}`")
        print(f"- Label: {meta['label']}")
        print(f"- Safety: `{meta['safety']}`")
        print(f"- Effect: {meta['effect']}")
        contract = (receipt.get("preActionStoryContract") or {}).get("shortStoryContract") or {}
        if contract:
            print(f"- Story contract: `{contract.get('label', 'unknown')}` ({contract.get('readyCount', 0)}/{contract.get('totalCount', 0)})")
            print(f"- Story next: {contract.get('nextAction', '')}")
        elif pre_action_story_contract.get("error"):
            print(f"- Story contract: unavailable - {pre_action_story_contract.get('error')}")
        production_action = (receipt.get("preActionProductionBrief") or {}).get("recommendedAction") or {}
        if production_action:
            print(f"- Production brief: `{production_action.get('label', 'unknown')}`")
            print(f"- Production next: {production_action.get('why', '')}")
        elif pre_action_production_brief.get("error"):
            print(f"- Production brief: unavailable - {pre_action_production_brief.get('error')}")
        if args.note:
            print(f"- Note: {args.note}")
        print()
        if args.apply:
            result = receipt["result"] or {}
            state = "ok" if result.get("ok") else "failed"
            detail = result.get("error") or "selected-short endpoint returned a response"
            print(f"Result: {state} - {detail}")
            delta = receipt.get("storyContractDelta") or {}
            if delta:
                print(f"Story after: `{delta.get('afterLabel', '')}` ({delta.get('afterReadyCount', '')})")
                if delta.get("changedChecks"):
                    changed = ", ".join(item.get("id", "") for item in delta.get("changedChecks", []))
                    print(f"Story changed checks: {changed}")
            production_delta = receipt.get("productionBriefDelta") or {}
            if production_delta:
                print(
                    "Production after: "
                    f"`{production_delta.get('afterAction', '')}`"
                    f" (was `{production_delta.get('beforeAction', '')}`)"
                )
                if production_delta.get("actionChanged"):
                    print(f"Production next: {production_delta.get('afterActionWhy', '')}")
        else:
            print("Dry run. Add `--apply` to call the running Studio endpoint.")
            print()
            print(f"Planned safe call: `{url}`")
        print()
        print(f"Truth: {receipt['truth']}")

    result = receipt.get("result") or {}
    return 1 if args.apply and not result.get("ok") else 0


if __name__ == "__main__":
    sys.exit(main())
