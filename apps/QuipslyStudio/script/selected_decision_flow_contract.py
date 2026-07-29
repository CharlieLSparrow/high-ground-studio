#!/usr/bin/env python3
"""Print a selected-decision edit-flow contract from the Quipsly Studio workbench."""

from __future__ import annotations

import argparse
import json
import sys

from decision_flow_contract_common import build_decision_flow_contract, decision_flow_contract_markdown_lines
from decision_review_workbench import DEFAULT_BASE_URL, build_workbench


def build_payload(base_url: str) -> dict:
    workbench = build_workbench(base_url)
    contract = build_decision_flow_contract(workbench, source="selected-decision-flow-contract-command")
    return {
        "ok": bool(contract),
        "model": "quipsly-selected-decision-flow-contract-command",
        "baseUrl": base_url,
        "workbenchStatus": workbench.get("status", ""),
        "decisionFlowContract": contract,
        "safeAction": contract.get("safeAction", ""),
        "agentInstruction": contract.get("agentInstruction", ""),
        "truth": "Read-only decision-flow contract. It does not mutate timeline decisions, source media, exports, or publication state.",
    }


def print_markdown(payload: dict) -> None:
    contract = payload.get("decisionFlowContract") or {}
    print("\n".join(decision_flow_contract_markdown_lines(contract)))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--markdown", action="store_true")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    try:
        payload = build_payload(args.base_url)
    except Exception as exc:  # noqa: BLE001 - command-line diagnostic.
        payload = {
            "ok": False,
            "error": f"Could not build selected-decision flow contract: {exc}",
            "safeAction": "Launch Quipsly Studio, select a decision, then rerun selected-decision-flow-contract.",
        }
        print(json.dumps(payload, indent=2, sort_keys=True))
        return 1

    if args.markdown:
        print_markdown(payload)
    else:
        print(json.dumps(payload, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
