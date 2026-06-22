#!/usr/bin/env python3
"""Quipsly podcast publish worker.

Current contract:
- dry-run only
- supports Spotify and Apple Podcasts ledger records
- validates audio artifact, destination guidance, episode copy, and receipt-contract shape
- prints JSON to stdout
- performs no network calls and reads no secrets

The real implementation will likely talk to an app-owned podcast host/RSS
publisher first, then rely on Spotify/Apple directory syndication. This worker
keeps that future shape explicit without pretending a direct platform upload
already happened.
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone

from quipsly_publish_worker_common import PublishWorkerValidationError, validate_destination_contract


SUPPORTED_PLATFORMS = {"Spotify", "Apple Podcasts"}
SUPPORTED_DESTINATIONS = {"spotify_podcast", "apple_podcasts"}


def fail(message: str, **extra: object) -> int:
    payload = {
        "status": "dry-run-failed",
        "error": message,
        "worker": "podcast-upload-worker",
        "networkCallsMade": False,
        **extra,
    }
    print(json.dumps(payload, indent=2, sort_keys=True))
    return 1


def main() -> int:
    if len(sys.argv) != 2:
        return fail("Usage: podcast_upload_worker.py /absolute/path/to/payload.json")

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
        return fail("This worker only supports Spotify and Apple Podcasts.", platform=platform)

    try:
        destination_summary = validate_destination_contract(payload, metadata, SUPPORTED_DESTINATIONS)
    except PublishWorkerValidationError as error:
        return fail(str(error), platform=platform)

    artifact_path = artifact.get("path") or ""
    if not artifact_path or not os.path.exists(artifact_path):
        return fail("Artifact path is missing or does not exist.", artifactPath=artifact_path)
    if not os.path.isfile(artifact_path):
        return fail("Artifact path is not a file.", artifactPath=artifact_path)

    artifact_type = (artifact.get("type") or "").lower()
    artifact_format = (artifact.get("format") or "").lower()
    if "audio" not in artifact_type and "audio" not in artifact_format:
        return fail(
            "Podcast worker expected an audio delivery artifact.",
            artifactType=artifact.get("type"),
            artifactFormat=artifact.get("format"),
        )

    title = (copy.get("title") or metadata.get("title") or "").strip()
    description = (copy.get("description") or metadata.get("description") or "").strip()
    if not title:
        return fail("Podcast episode metadata is missing a title.", artifactPath=artifact_path)
    if not description:
        return fail("Podcast episode metadata is missing show notes/description.", artifactPath=artifact_path)

    if receipt_contract.get("dryRunMustNotMarkPublished") is not True:
        return fail("Receipt contract must explicitly protect dry-run from marking published.")

    artifact_bytes = os.path.getsize(artifact_path)
    result = {
        "status": "dry-run-passed",
        "worker": "podcast-upload-worker",
        "mode": "dry-run",
        "platform": platform,
        "deliveryLaneId": payload.get("deliveryLaneId"),
        "destination": destination_summary,
        "receiptId": payload.get("receiptId"),
        "artifactPath": artifact_path,
        "artifactBytes": artifact_bytes,
        "title": title,
        "descriptionLength": len(description),
        "episodeNumber": metadata.get("episodeNumber") or "",
        "explicit": metadata.get("explicit") or False,
        "wouldCreateOrUpdateEpisode": True,
        "wouldAttachAudio": True,
        "wouldRequestDirectorySync": True,
        "networkCallsMade": False,
        "providerReceiptId": "",
        "publicURL": "",
        "receiptJson": {},
        "completedAt": datetime.now(timezone.utc).isoformat(),
        "safety": "Dry run only. No podcast host episode, RSS update, directory sync, provider receipt, or public URL was created.",
    }
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
