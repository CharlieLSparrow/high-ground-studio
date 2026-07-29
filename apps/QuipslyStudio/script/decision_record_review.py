#!/usr/bin/env python3
"""Record selected-decision review metadata in Quipsly Studio.

Default mode is dry-run. Use --apply to call the running Studio AgentServer.
This tool only targets selected-decision intent note/status endpoints. It does
not trim, split, export, publish, move timeline media, or mutate source files.
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

from selected_decision_cover_brief import build_cover_brief
from selected_decision_flow_contract import build_payload as build_flow_contract_payload


DEFAULT_BASE_URL = os.environ.get("QUIPSLY_STUDIO_AGENT_URL", "http://127.0.0.1:8765")
ALLOWED_STATUSES = {
    "needs-listen",
    "refine",
    "keep",
    "hold",
    "needs-human-ear",
    "needs-source-check",
    "needs-edit-change",
}


def build_url(base_url: str, endpoint: str, params: dict[str, str]) -> str:
    root = base_url.rstrip("/") + "/"
    query = urllib.parse.urlencode(params)
    return urllib.parse.urljoin(root, endpoint.lstrip("/")) + "?" + query


def call_json(url: str) -> dict[str, Any]:
    with urllib.request.urlopen(url, timeout=5) as response:
        payload = json.loads(response.read().decode("utf-8"))
        return payload if isinstance(payload, dict) else {"value": payload}


def flow_contract_snapshot(base_url: str) -> dict[str, Any]:
    try:
        return build_flow_contract_payload(base_url)
    except Exception as error:  # noqa: BLE001 - diagnostic receipt should not block dry-run planning.
        return {
            "ok": False,
            "error": str(error),
            "safeAction": "Could not read selected-decision edit-flow contract.",
        }


def flow_contract_delta(before: dict[str, Any], after: dict[str, Any]) -> dict[str, Any]:
    before_contract = before.get("decisionFlowContract") or {}
    after_contract = after.get("decisionFlowContract") or {}
    return {
        "labelBefore": before_contract.get("label", ""),
        "labelAfter": after_contract.get("label", ""),
        "readyBefore": before_contract.get("readyCount", 0),
        "readyAfter": after_contract.get("readyCount", 0),
        "safeActionBefore": before_contract.get("safeAction", ""),
        "safeActionAfter": after_contract.get("safeAction", ""),
        "changed": before_contract != after_contract,
        "truth": "Compares selected-decision edit-flow contract snapshots around metadata review recording.",
    }


def cover_brief_snapshot(base_url: str) -> dict[str, Any]:
    try:
        return build_cover_brief(base_url)
    except Exception as error:  # noqa: BLE001 - diagnostic receipt should not block dry-run planning.
        return {
            "ok": False,
            "error": str(error),
            "nextAction": "Could not read selected-decision cover brief.",
        }


def cover_brief_delta(before: dict[str, Any], after: dict[str, Any]) -> dict[str, Any]:
    return {
        "needsCoverBefore": before.get("needsCover", False),
        "needsCoverAfter": after.get("needsCover", False),
        "candidateCountBefore": before.get("candidateCount", 0),
        "candidateCountAfter": after.get("candidateCount", 0),
        "topCandidateBefore": (before.get("candidates") or [{}])[0].get("name", "") if before.get("candidates") else "",
        "topCandidateAfter": (after.get("candidates") or [{}])[0].get("name", "") if after.get("candidates") else "",
        "nextActionBefore": before.get("nextAction", ""),
        "nextActionAfter": after.get("nextAction", ""),
        "changed": before != after,
        "truth": "Compares selected-decision cover brief snapshots around metadata review recording.",
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Record selected-decision review metadata. Dry-run unless --apply is passed."
    )
    parser.add_argument("status", choices=sorted(ALLOWED_STATUSES), help="Metadata review status to record.")
    parser.add_argument("note", help="Human/agent review note. Describe what was heard, seen, or needs checking.")
    parser.add_argument("--actor", default="Codex")
    parser.add_argument("--actor-type", default="agent", choices=["agent", "human", "system"])
    parser.add_argument("--category", default="cut-review")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--apply", action="store_true", help="Actually call the running Studio endpoints.")
    parser.add_argument("--json", action="store_true", help="Print JSON receipt/dry-run payload.")
    args = parser.parse_args()
    pre_action_flow_contract = flow_contract_snapshot(args.base_url)
    pre_action_cover_brief = cover_brief_snapshot(args.base_url)

    note_url = build_url(args.base_url, "/selected_decision_intent_note", {
        "note": args.note,
        "actor": args.actor,
        "actor_type": args.actor_type,
        "category": args.category,
    })
    status_url = build_url(args.base_url, "/selected_decision_intent_status", {
        "status": args.status,
        "actor": args.actor,
        "actor_type": args.actor_type,
        "note": args.note,
    })

    receipt: dict[str, Any] = {
        "model": "quipsly-decision-record-review",
        "generatedAt": datetime.now().isoformat(timespec="seconds"),
        "mode": "apply" if args.apply else "dry-run",
        "status": args.status,
        "note": args.note,
        "actor": args.actor,
        "actorType": args.actor_type,
        "category": args.category,
        "baseUrl": args.base_url,
        "plannedCalls": [
            {
                "label": "add selected-decision note",
                "method": "GET",
                "url": note_url,
                "safety": "metadata-only",
            },
            {
                "label": "set selected-decision review status",
                "method": "GET",
                "url": status_url,
                "safety": "metadata-only",
            },
        ],
        "preActionEditFlowContract": pre_action_flow_contract,
        "postActionEditFlowContract": {},
        "editFlowContractDelta": {},
        "preActionCoverBrief": pre_action_cover_brief,
        "postActionCoverBrief": {},
        "coverBriefDelta": {},
        "results": [],
        "truth": "This tool records selected-decision review metadata only. It does not mutate source media, move clips, export, publish, or approve anything outside the selected decision's review ledger.",
    }

    if args.apply:
        for call in receipt["plannedCalls"]:
            try:
                result = call_json(call["url"])
                receipt["results"].append({
                    "label": call["label"],
                    "ok": True,
                    "response": result,
                })
            except Exception as error:  # noqa: BLE001 - diagnostic receipt.
                receipt["results"].append({
                    "label": call["label"],
                    "ok": False,
                    "error": str(error),
                })
        post_action_flow_contract = flow_contract_snapshot(args.base_url)
        post_action_cover_brief = cover_brief_snapshot(args.base_url)
        receipt["postActionEditFlowContract"] = post_action_flow_contract
        receipt["editFlowContractDelta"] = flow_contract_delta(pre_action_flow_contract, post_action_flow_contract)
        receipt["postActionCoverBrief"] = post_action_cover_brief
        receipt["coverBriefDelta"] = cover_brief_delta(pre_action_cover_brief, post_action_cover_brief)

    if args.json:
        print(json.dumps(receipt, indent=2, sort_keys=True))
    else:
        print("# Selected decision review recorder")
        print()
        print(f"- Mode: `{receipt['mode']}`")
        print(f"- Status: `{args.status}`")
        print(f"- Actor: `{args.actor}` / `{args.actor_type}`")
        print(f"- Note: {args.note}")
        print()
        if args.apply:
            print("## Results")
            for result in receipt["results"]:
                state = "ok" if result.get("ok") else "failed"
                detail = result.get("error") or "metadata endpoint returned a response"
                print(f"- {result.get('label')}: {state} - {detail}")
            print()
            delta = receipt.get("editFlowContractDelta") or {}
            if delta:
                print("## Edit-flow contract")
                print(f"- Before: `{delta.get('labelBefore', '')}` ({delta.get('readyBefore', 0)} ready)")
                print(f"- After: `{delta.get('labelAfter', '')}` ({delta.get('readyAfter', 0)} ready)")
                print(f"- Next: {delta.get('safeActionAfter') or delta.get('safeActionBefore') or 'Proof-listen before Keep.'}")
                print()
            cover_delta = receipt.get("coverBriefDelta") or {}
            if cover_delta:
                print("## Cover brief")
                print(f"- Needs cover: {cover_delta.get('needsCoverBefore', False)} -> {cover_delta.get('needsCoverAfter', False)}")
                print(f"- Candidates: {cover_delta.get('candidateCountBefore', 0)} -> {cover_delta.get('candidateCountAfter', 0)}")
                print(f"- Top candidate: {cover_delta.get('topCandidateAfter') or cover_delta.get('topCandidateBefore') or 'none'}")
                print(f"- Next: {cover_delta.get('nextActionAfter') or cover_delta.get('nextActionBefore') or 'Cue possible cover only if the cut needs it.'}")
                print()
        else:
            print("## Dry run")
            print("Add `--apply` to record this metadata against the running app.")
            print()
            flow_contract = (pre_action_flow_contract.get("decisionFlowContract") or {})
            print("Selected decision edit-flow contract snapshot:")
            print(f"- `{flow_contract.get('label', 'unknown')}` ({flow_contract.get('readyCount', 0)}/{flow_contract.get('totalCount', 0)})")
            print(f"- Next: {flow_contract.get('safeAction', pre_action_flow_contract.get('safeAction', 'Proof-listen before Keep.'))}")
            print()
            print("Selected decision cover brief snapshot:")
            print(f"- Needs cover: {pre_action_cover_brief.get('needsCover', False)}")
            print(f"- Candidates: {pre_action_cover_brief.get('candidateCount', 0)}")
            print(f"- Next: {pre_action_cover_brief.get('nextAction', 'Cue possible cover only if the cut needs it.')}")
            print()
            print("Planned safe calls:")
            for call in receipt["plannedCalls"]:
                print(f"- {call['label']}: `{call['url']}`")
            print()
        print(f"Truth: {receipt['truth']}")

    failed = [result for result in receipt["results"] if not result.get("ok")]
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
