#!/usr/bin/env python3
"""Select a short recipe and wait for selected-short quality proof.

The editor command receipt is not enough proof that the visible/editor selection
has changed. This helper selects via AgentServer, then polls /selected_short_quality
until the selected short matches the projected target or a selected quality
passport is available.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.parse
import urllib.request
from typing import Any

DEFAULT_BASE_URL = "http://127.0.0.1:8080"


def fetch_json(url: str, timeout: float = 8.0) -> dict[str, Any]:
    with urllib.request.urlopen(url, timeout=timeout) as response:
        data = json.loads(response.read().decode("utf-8", errors="replace"))
    if not isinstance(data, dict):
        raise ValueError(f"Expected JSON object from {url}")
    return data


def text(value: Any) -> str:
    if value is None:
        return ""
    return value if isinstance(value, str) else str(value)


def select_path(selector: str, value: str) -> str:
    if selector in {"id", "short-id", "shortId"}:
        return "/shorts_queue_select?" + urllib.parse.urlencode({"id": value})
    if selector == "title":
        return "/shorts_queue_select?" + urllib.parse.urlencode({"title": value})
    if selector in {"index", "rank"}:
        return "/shorts_queue_select?" + urllib.parse.urlencode({"index": value})
    raise SystemExit(f"Unknown selector {selector!r}; use id, title, index, or rank.")


def expected_from_receipt(receipt: dict[str, Any], selector: str, value: str) -> tuple[str, str]:
    nested_receipt = receipt.get("commandReceipt") if isinstance(receipt.get("commandReceipt"), dict) else {}
    projection = receipt.get("selectionProjection") if isinstance(receipt.get("selectionProjection"), dict) else {}
    if not projection and isinstance(nested_receipt.get("selectionProjection"), dict):
        projection = nested_receipt.get("selectionProjection") or {}
    proof = projection.get("selectedShortProof") if isinstance(projection.get("selectedShortProof"), dict) else {}
    expected_id = text(projection.get("id") or proof.get("id"))
    expected_title = text(proof.get("title"))
    if not expected_id and selector in {"id", "short-id", "shortId"}:
        expected_id = value
    if not expected_title and selector == "title":
        expected_title = value
    return expected_id, expected_title


def is_match(quality: dict[str, Any], expected_id: str, expected_title: str) -> bool:
    selected_id = text(quality.get("selectedShortId"))
    title = text(quality.get("title"))
    if expected_id:
        return selected_id == expected_id
    if expected_title:
        return title.lower() == expected_title.lower()
    return selected_id != "" or title != ""


def selected_quality(base: str) -> dict[str, Any]:
    return fetch_json(base + "/selected_short_quality", timeout=2.0)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("selector", choices=["id", "short-id", "shortId", "title", "index", "rank"])
    parser.add_argument("value")
    parser.add_argument("timeout", nargs="?", type=float, default=8.0)
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    args = parser.parse_args()

    base = args.base_url.rstrip("/")
    expected_id = args.value if args.selector in {"id", "short-id", "shortId"} else ""
    expected_title = args.value if args.selector == "title" else ""

    try:
        current_quality = selected_quality(base)
        if is_match(current_quality, expected_id, expected_title):
            print(json.dumps({
                "status": "selected_short_ready",
                "selector": args.selector,
                "value": args.value,
                "expectedShortId": expected_id,
                "expectedTitle": expected_title,
                "selectedShortId": text(current_quality.get("selectedShortId")),
                "title": text(current_quality.get("title")),
                "reviewStatus": text(current_quality.get("reviewStatus")),
                "exportStatus": text(current_quality.get("exportStatus")),
                "reviewClassLabel": text(current_quality.get("reviewClassLabel")),
                "nextReviewAction": text(current_quality.get("nextReviewAction") or current_quality.get("nextSafeAction")),
                "commandReceiptStatus": "already-selected",
                "truth": "Selection was already proved by /selected_short_quality. No edit, export, approval, upload, publication, receipt, or media mutation was attempted.",
            }, indent=2, sort_keys=True))
            return 0
    except Exception:
        pass

    receipt = fetch_json(base + select_path(args.selector, args.value))
    receipt_expected_id, receipt_expected_title = expected_from_receipt(receipt, args.selector, args.value)
    expected_id = receipt_expected_id or expected_id
    expected_title = receipt_expected_title or expected_title
    deadline = time.time() + max(0.5, args.timeout)
    last_quality: dict[str, Any] = {}
    # Receipts are not final state. Read /state once to let queued editor work
    # drain before polling the selected-short quality passport.
    try:
        fetch_json(base + "/state", timeout=3.0)
    except Exception:
        pass
    time.sleep(0.20)

    while time.time() <= deadline:
        try:
            quality = selected_quality(base)
            last_quality = quality
            if is_match(quality, expected_id, expected_title):
                print(json.dumps({
                    "status": "selected_short_ready",
                    "selector": args.selector,
                    "value": args.value,
                    "expectedShortId": expected_id,
                    "expectedTitle": expected_title,
                    "selectedShortId": text(quality.get("selectedShortId")),
                    "title": text(quality.get("title")),
                    "reviewStatus": text(quality.get("reviewStatus")),
                    "exportStatus": text(quality.get("exportStatus")),
                    "reviewClassLabel": text(quality.get("reviewClassLabel")),
                    "nextReviewAction": text(quality.get("nextReviewAction") or quality.get("nextSafeAction")),
                    "commandReceiptStatus": text((receipt.get("commandReceipt") or {}).get("status") if isinstance(receipt.get("commandReceipt"), dict) else receipt.get("status")),
                    "truth": "Selection is proved by /selected_short_quality, not by the HTTP receipt alone. No edit, export, approval, upload, publication, receipt, or media mutation was attempted.",
                }, indent=2, sort_keys=True))
                return 0
        except Exception:
            pass
        time.sleep(0.25)

    print(json.dumps({
        "status": "selected_short_wait_timeout",
        "selector": args.selector,
        "value": args.value,
        "expectedShortId": expected_id,
        "expectedTitle": expected_title,
        "lastSelectedShortId": text(last_quality.get("selectedShortId")),
        "lastTitle": text(last_quality.get("title")),
        "commandReceipt": receipt,
        "truth": "The select command did not produce matching /selected_short_quality proof before timeout. Treat the selection as unproven.",
    }, indent=2, sort_keys=True))
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
