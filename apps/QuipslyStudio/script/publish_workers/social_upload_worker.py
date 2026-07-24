#!/usr/bin/env python3
"""Quipsly social publish worker.

Current contract:
- dry-run only
- supports Instagram, Facebook, and LinkedIn short-video ledger records
- validates artifact, destination guidance, social copy, and receipt-contract shape
- prints JSON to stdout
- performs no network calls and reads no secrets
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone

from quipsly_publish_worker_common import PublishWorkerValidationError, validate_destination_contract


SUPPORTED_PLATFORMS = {"Instagram", "Facebook", "LinkedIn"}
SUPPORTED_DESTINATIONS = {"instagram_reel", "facebook_reel", "linkedin_video"}


def fail(message: str, **extra: object) -> int:
    payload = {
        "status": "dry-run-failed",
        "error": message,
        "worker": "social-upload-worker",
        "networkCallsMade": False,
        **extra,
    }
    print(json.dumps(payload, indent=2, sort_keys=True))
    return 1


def main() -> int:
    if len(sys.argv) != 2:
        return fail("Usage: social_upload_worker.py /absolute/path/to/payload.json")

    payload_path = sys.argv[1]
    if not os.path.exists(payload_path):
        return fail("Payload JSON does not exist.", payloadPath=payload_path)

    with open(payload_path, "r", encoding="utf-8") as handle:
        payload = json.load(handle)

    mode = payload.get("mode")
    platform = payload.get("platform")
    artifact = payload.get("artifact") or {}
    copy = payload.get("copy") or {}
    metadata = copy.get("metadata") or {}
    receipt_contract = payload.get("receiptContract") or {}

    if mode != "dry-run":
        return fail("Only dry-run mode is implemented for this worker.", mode=mode)
    if platform not in SUPPORTED_PLATFORMS:
        return fail("This worker only supports Instagram, Facebook, and LinkedIn.", platform=platform)

    try:
        destination_summary = validate_destination_contract(payload, metadata, SUPPORTED_DESTINATIONS)
    except PublishWorkerValidationError as error:
        return fail(str(error), platform=platform)

    artifact_path = artifact.get("path") or ""
    if not artifact_path or not os.path.exists(artifact_path):
        return fail("Artifact path is missing or does not exist.", artifactPath=artifact_path)
    if not os.path.isfile(artifact_path):
        return fail("Artifact path is not a file.", artifactPath=artifact_path)

    title = (copy.get("title") or metadata.get("title") or "").strip()
    description = (copy.get("description") or metadata.get("description") or "").strip()
    if not title:
        return fail("Social post copy is missing a title/hook.", artifactPath=artifact_path)
    if not description:
        return fail("Social post copy is missing caption/description text.", artifactPath=artifact_path)

    if receipt_contract.get("dryRunMustNotMarkPublished") is not True:
        return fail("Receipt contract must explicitly protect dry-run from marking published.")

    artifact_bytes = os.path.getsize(artifact_path)
    result = {
        "status": "dry-run-passed",
        "worker": "social-upload-worker",
        "mode": "dry-run",
        "platform": platform,
        "deliveryLaneId": payload.get("deliveryLaneId"),
        "destination": destination_summary,
        "receiptId": payload.get("receiptId"),
        "artifactPath": artifact_path,
        "artifactBytes": artifact_bytes,
        "title": title,
        "descriptionLength": len(description),
        "visibility": metadata.get("visibility") or "draft",
        "hashtags": metadata.get("hashtags") or [],
        "wouldCreatePost": True,
        "wouldAttachShortVideo": True,
        "wouldScheduleIfRequested": bool(metadata.get("scheduledAt") or ""),
        "networkCallsMade": False,
        "providerReceiptId": "",
        "publicURL": "",
        "receiptJson": {},
        "completedAt": datetime.now(timezone.utc).isoformat(),
        "safety": "Dry run only. No social post, upload, schedule, provider receipt, or public URL was created.",
    }
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
