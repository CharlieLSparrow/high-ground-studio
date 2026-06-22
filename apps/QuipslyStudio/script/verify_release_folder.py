#!/usr/bin/env python3
"""Verify a QuipslyStudio release folder without needing the app/control server.

This is intentionally transparent, not judgmental: it reports which expected
release artifacts exist, whether media files are probeable, and which handoff
JSON files are valid.
"""
from __future__ import annotations

import argparse
import csv
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

MEDIA_SUFFIXES = {".mp4", ".m4a", ".mp3", ".wav", ".mov"}


def ffprobe(path: Path) -> dict[str, Any]:
    raw = subprocess.check_output(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "stream=codec_type,width,height,duration",
            "-show_entries",
            "format=duration,size",
            "-of",
            "json",
            str(path),
        ],
        text=True,
    )
    data = json.loads(raw)
    streams = data.get("streams", [])
    video = next((s for s in streams if s.get("codec_type") == "video"), None)
    audio = [s for s in streams if s.get("codec_type") == "audio"]
    fmt = data.get("format", {})
    return {
        "probeable": True,
        "duration": float(fmt.get("duration") or 0),
        "size": int(fmt.get("size") or path.stat().st_size),
        "video": {
            "width": video.get("width"),
            "height": video.get("height"),
            "duration": float(video.get("duration") or 0),
        }
        if video
        else None,
        "audioStreamCount": len(audio),
    }


def artifact(path: Path, kind: str) -> dict[str, Any]:
    item: dict[str, Any] = {
        "kind": kind,
        "path": str(path),
        "filename": path.name,
        "exists": path.exists(),
        "size": path.stat().st_size if path.exists() else 0,
    }
    if not path.exists():
        item["status"] = "missing"
        return item
    if item["size"] == 0:
        item["status"] = "empty"
        return item
    if path.suffix.lower() in MEDIA_SUFFIXES:
        try:
            item.update(ffprobe(path))
            item["status"] = "ready"
        except Exception as exc:  # noqa: BLE001 - verifier reports calm diagnostics.
            item["probeable"] = False
            item["status"] = "probe-failed"
            item["error"] = str(exc)
        return item
    if path.suffix.lower() == ".json":
        try:
            json.loads(path.read_text())
            item["validJson"] = True
            item["status"] = "ready"
        except Exception as exc:  # noqa: BLE001 - verifier reports calm diagnostics.
            item["validJson"] = False
            item["status"] = "json-invalid"
            item["error"] = str(exc)
        return item
    item["status"] = "ready"
    return item


def read_json(path: Path | None) -> dict[str, Any]:
    if path is None or not path.exists():
        return {}
    try:
        value = json.loads(path.read_text())
        return value if isinstance(value, dict) else {}
    except Exception:  # noqa: BLE001 - verifier should report absence calmly elsewhere.
        return {}


def find_model_json(base: Path, model: str, patterns: list[str]) -> Path | None:
    for pattern in patterns:
        for path in sorted(base.glob(pattern)):
            payload = read_json(path)
            if payload.get("model") == model:
                return path
    return None


def find_one(base: Path, patterns: list[str]) -> Path | None:
    for pattern in patterns:
        matches = sorted(base.glob(pattern))
        if matches:
            return matches[0]
    return None


def read_receipt_log(path: Path | None, upload_packets: list[dict[str, Any]]) -> dict[str, Any]:
    packet_ids = {
        str(item.get("receiptId") or item.get("id") or "")
        for item in upload_packets
        if item.get("receiptId") or item.get("id")
    }
    if path is None or not path.exists():
        return {
            "path": "",
            "rowCount": 0,
            "expectedRowCount": len(upload_packets),
            "aligned": False,
            "duplicateReceiptIds": [],
            "missingReceiptIds": sorted(packet_ids),
            "unknownReceiptIds": [],
            "readyToApplyCount": 0,
            "existingReceiptCount": 0,
            "error": "publication receipt log is missing",
        }
    try:
        rows = list(csv.DictReader(path.open(newline="")))
    except Exception as exc:  # noqa: BLE001 - verifier reports calm diagnostics.
        return {
            "path": str(path),
            "rowCount": 0,
            "expectedRowCount": len(upload_packets),
            "aligned": False,
            "duplicateReceiptIds": [],
            "missingReceiptIds": sorted(packet_ids),
            "unknownReceiptIds": [],
            "readyToApplyCount": 0,
            "existingReceiptCount": 0,
            "error": str(exc),
        }

    seen: set[str] = set()
    duplicates: set[str] = set()
    row_ids: set[str] = set()
    ready_to_apply = 0
    existing_receipts = 0
    for row in rows:
        receipt_id = str(row.get("receipt_id") or "").strip()
        if receipt_id:
            if receipt_id in seen:
                duplicates.add(receipt_id)
            seen.add(receipt_id)
            row_ids.add(receipt_id)
        if str(row.get("public_url") or "").strip() or str(row.get("provider_receipt_id") or "").strip():
            ready_to_apply += 1
        if str(row.get("current_public_url") or "").strip() or str(row.get("current_provider_receipt_id") or "").strip():
            existing_receipts += 1

    missing = sorted(packet_ids - row_ids)
    unknown = sorted(row_ids - packet_ids)
    aligned = (
        len(rows) == len(upload_packets)
        and not duplicates
        and not missing
        and not unknown
    )
    return {
        "path": str(path),
        "rowCount": len(rows),
        "expectedRowCount": len(upload_packets),
        "aligned": aligned,
        "duplicateReceiptIds": sorted(duplicates),
        "missingReceiptIds": missing,
        "unknownReceiptIds": unknown,
        "readyToApplyCount": ready_to_apply,
        "existingReceiptCount": existing_receipts,
        "error": "",
    }


def verify_social_ready_packet(path: Path | None) -> dict[str, Any]:
    if path is None or not path.exists():
        return {
            "path": "",
            "ready": False,
            "status": "missing",
            "clipCount": 0,
            "readyClipCount": 0,
            "missingArtifactCount": 0,
            "error": "social ready packet is missing",
        }
    payload = read_json(path)
    clips = payload.get("clips") if isinstance(payload.get("clips"), list) else []
    required_keys = ["clipPath", "thumbnailPath", "captionSrtPath", "platformCopyPath"]
    ready_clip_count = 0
    missing_artifacts: list[dict[str, str]] = []
    for index, clip in enumerate(clips, start=1):
        if not isinstance(clip, dict):
            missing_artifacts.append({"clip": str(index), "key": "clip", "path": "invalid clip object"})
            continue
        clip_ready = clip.get("readyToPost") is True
        for key in required_keys:
            raw_path = str(clip.get(key) or "")
            if not raw_path or not Path(raw_path).exists():
                clip_ready = False
                missing_artifacts.append({
                    "clip": str(clip.get("rank") or index),
                    "key": key,
                    "path": raw_path,
                })
        if clip_ready:
            ready_clip_count += 1
    ready = bool(clips) and ready_clip_count == len(clips) and not missing_artifacts
    return {
        "path": str(path),
        "ready": ready,
        "status": "ready" if ready else "needs-attention",
        "model": payload.get("model") or "",
        "clipCount": len(clips),
        "readyClipCount": ready_clip_count,
        "missingArtifactCount": len(missing_artifacts),
        "missingArtifacts": missing_artifacts[:20],
        "platforms": payload.get("platforms") or [],
        "error": "" if ready else "one or more social-ready clip artifacts are missing or not marked ready",
    }


def verify_podcast_ready_packet(path: Path | None) -> dict[str, Any]:
    if path is None or not path.exists():
        return {
            "path": "",
            "ready": False,
            "status": "missing",
            "audioPath": "",
            "platformCount": 0,
            "error": "podcast ready packet is missing",
        }
    payload = read_json(path)
    audio_path = str(payload.get("audioPath") or "")
    audio_exists = bool(audio_path) and Path(audio_path).exists()
    audio_probe = payload.get("audioProbe") if isinstance(payload.get("audioProbe"), dict) else {}
    platforms = payload.get("platforms") if isinstance(payload.get("platforms"), list) else []
    manual_ready = payload.get("manualPublishingReady") is True
    ready = manual_ready and audio_exists and len(platforms) >= 2
    return {
        "path": str(path),
        "ready": ready,
        "status": "ready" if ready else "needs-attention",
        "model": payload.get("model") or "",
        "audioPath": audio_path,
        "audioExists": audio_exists,
        "audioProbeable": audio_probe.get("probeable") is True,
        "durationSeconds": audio_probe.get("durationSeconds") or 0,
        "manualPublishingReady": manual_ready,
        "directPublishingReady": payload.get("directPublishingReady") is True,
        "platformCount": len(platforms),
        "platforms": [item.get("platform") for item in platforms if isinstance(item, dict)],
        "error": "" if ready else "podcast-ready packet needs copied audio, manualPublishingReady=true, and Spotify/Apple platform rows",
    }


def verify_release_folder(base: Path) -> dict[str, Any]:
    expected_paths = {
        "episode16x9Master": find_one(base, ["*-16x9.mp4"]),
        "vertical9x16Master": find_one(base, ["*-9x16.mp4"]),
        "podcastAudioMaster": find_one(base, ["*-podcast-audio.m4a", "*-podcast-audio.mp3", "*-podcast-audio.wav"]),
        "deliveryPacket": find_one(base, ["*-delivery-packet.json"]),
        "publishManifest": find_one(base, ["*-publish-packet/*-publish-manifest.json"]),
        "publishLedger": find_one(base, ["*-publish-packet/*-publish-ledger.json"]),
        "publishReleaseChecklist": find_one(base, ["*-publish-packet/*-publish-release-checklist.json"]),
        "publishDestinations": find_one(base, ["*-publish-packet/*-publish-destinations.json"]),
        "uploadPacketBundleManifest": find_one(base, ["*-upload-packet-bundle/*-upload-packet-bundle.json"]),
        "uploadPacketBundleIndex": find_one(base, ["*-upload-packet-bundle/*-upload-packet-index.csv"]),
        "socialPublicationQueueManifest": find_one(base, ["*-social-publication-queue/*social-publication-queue.json"]),
        "socialPublicationQueueIndex": find_one(base, ["*-social-publication-queue/*social-publication-queue.csv"]),
        "podcastManifest": find_one(base, ["*-podcast-packet/*-podcast-manifest.json"]),
        "socialReadyPacketManifest": find_model_json(base, "quipsly-social-ready-publication-packet", ["**/*ready*.json", "**/*social*.json"]),
        "podcastReadyPacketManifest": find_model_json(base, "quipsly-podcast-ready-publication-packet", ["**/*podcast-ready*.json", "**/*ready*.json"]),
        "publicationCockpitMarkdown": find_one(base, ["PUBLICATION-COCKPIT.md"]),
        "publicationCockpitJson": find_one(base, ["publication-cockpit.json"]),
        "publicationReceiptLog": find_one(base, ["publication-receipt-log.csv"]),
        "releaseFinalizationReceipt": find_one(base, ["*-release-finalization-receipt.json"]),
    }
    kind_by_key = {
        "episode16x9Master": "episode-master-16x9",
        "vertical9x16Master": "vertical-master-9x16",
        "podcastAudioMaster": "podcast-audio",
        "deliveryPacket": "delivery-json",
        "publishManifest": "publish-json",
        "publishLedger": "publish-json",
        "publishReleaseChecklist": "publish-json",
        "publishDestinations": "publish-json",
        "uploadPacketBundleManifest": "upload-bundle-json",
        "uploadPacketBundleIndex": "upload-bundle-csv",
        "socialPublicationQueueManifest": "social-publication-json",
        "socialPublicationQueueIndex": "social-publication-csv",
        "podcastManifest": "podcast-json",
        "socialReadyPacketManifest": "social-ready-json",
        "podcastReadyPacketManifest": "podcast-ready-json",
        "publicationCockpitMarkdown": "publication-cockpit-markdown",
        "publicationCockpitJson": "publication-cockpit-json",
        "publicationReceiptLog": "publication-receipt-log-csv",
        "releaseFinalizationReceipt": "release-receipt-json",
    }
    artifacts = {
        key: artifact(path if path is not None else base / f"__missing__/{key}", kind_by_key[key])
        for key, path in expected_paths.items()
    }
    shorts = [artifact(path, "social-short-9x16") for path in sorted(base.glob("*-9x16-short.mp4"))]
    optional_keys = {"releaseFinalizationReceipt"}
    required_ready = all(
        item["status"] == "ready"
        for key, item in artifacts.items()
        if key not in optional_keys
    )
    shorts_ready = sum(1 for item in shorts if item["status"] == "ready")
    media_ready = [item for item in artifacts.values() if item["kind"].endswith("16x9") or item["kind"].endswith("9x16") or item["kind"] == "podcast-audio"]
    upload_bundle = read_json(expected_paths["uploadPacketBundleManifest"])
    upload_packets = upload_bundle.get("packets") if isinstance(upload_bundle.get("packets"), list) else []
    social_queue = read_json(expected_paths["socialPublicationQueueManifest"])
    social_items = social_queue.get("clips") or social_queue.get("items") or []
    if not isinstance(social_items, list):
        social_items = []
    social_ready_packet = verify_social_ready_packet(expected_paths["socialReadyPacketManifest"])
    podcast_ready_packet = verify_podcast_ready_packet(expected_paths["podcastReadyPacketManifest"])
    cockpit_json = read_json(expected_paths["publicationCockpitJson"])
    receipt_log = read_receipt_log(expected_paths["publicationReceiptLog"], upload_packets)
    release_ready = (
        required_ready
        and shorts_ready > 0
        and receipt_log["aligned"]
        and social_ready_packet["ready"]
        and podcast_ready_packet["ready"]
    )
    upload_packet_count = len(upload_packets)
    upload_receipt_count = sum(1 for item in upload_packets if item.get("receiptCaptured") is True)
    upload_receipt_remaining_count = max(0, upload_packet_count - upload_receipt_count)
    publication_complete = release_ready and upload_packet_count > 0 and upload_receipt_remaining_count == 0
    publication_phase = "publication-complete" if publication_complete else "ready-for-human-review" if release_ready else "needs-attention"
    return {
        "model": "quipsly-release-folder-verifier",
        "version": "2026-06-17.release-folder-verifier.v7",
        "folder": str(base),
        "status": publication_phase,
        "summary": {
            "requiredArtifactCount": len(artifacts) - len(optional_keys),
            "requiredReadyCount": sum(
                1
                for key, item in artifacts.items()
                if key not in optional_keys and item["status"] == "ready"
            ),
            "optionalArtifactCount": len(optional_keys),
            "optionalReadyCount": sum(
                1
                for key, item in artifacts.items()
                if key in optional_keys and item["status"] == "ready"
            ),
            "socialShortCount": len(shorts),
            "socialShortReadyCount": shorts_ready,
            "mediaReadyCount": sum(1 for item in media_ready if item["status"] == "ready"),
            "uploadPacketCount": upload_packet_count,
            "uploadPacketArtifactReadyCount": sum(1 for item in upload_packets if item.get("artifactExists") is True),
            "uploadPacketReceiptCapturedCount": upload_receipt_count,
            "uploadPacketReceiptRemainingCount": upload_receipt_remaining_count,
            "socialPublicationQueueItemCount": len(social_items),
            "socialReadyPacketReady": social_ready_packet["ready"],
            "socialReadyPacketClipCount": social_ready_packet["clipCount"],
            "socialReadyPacketReadyClipCount": social_ready_packet["readyClipCount"],
            "podcastReadyPacketReady": podcast_ready_packet["ready"],
            "podcastReadyPacketPlatformCount": podcast_ready_packet["platformCount"],
            "publicationCockpitReady": (
                artifacts["publicationCockpitMarkdown"]["status"] == "ready"
                and artifacts["publicationCockpitJson"]["status"] == "ready"
                and artifacts["publicationReceiptLog"]["status"] == "ready"
                and receipt_log["aligned"]
            ),
            "publicationReceiptLogAligned": receipt_log["aligned"],
            "publicationComplete": publication_complete,
            "publicationPhase": publication_phase,
        },
        "artifacts": artifacts,
        "socialShorts": shorts,
        "uploadPacketBundle": {
            "manifestPath": str(expected_paths["uploadPacketBundleManifest"]) if expected_paths["uploadPacketBundleManifest"] else "",
            "packetCount": upload_packet_count,
            "artifactReadyCount": sum(1 for item in upload_packets if item.get("artifactExists") is True),
            "receiptCapturedCount": upload_receipt_count,
            "receiptRemainingCount": upload_receipt_remaining_count,
            "platformCounts": {
                platform: sum(1 for item in upload_packets if item.get("platform") == platform)
                for platform in sorted({str(item.get("platform") or "") for item in upload_packets if item.get("platform")})
            },
        },
        "socialPublicationQueue": {
            "manifestPath": str(expected_paths["socialPublicationQueueManifest"]) if expected_paths["socialPublicationQueueManifest"] else "",
            "itemCount": len(social_items),
            "topPicks": [
                item.get("title")
                for item in sorted(social_items, key=lambda item: int(item.get("rank") or 9999))
                if item.get("reviewStatus") == "top-pick"
            ],
        },
        "socialReadyPacket": social_ready_packet,
        "publicationCockpit": {
            "markdownPath": str(expected_paths["publicationCockpitMarkdown"]) if expected_paths["publicationCockpitMarkdown"] else "",
            "jsonPath": str(expected_paths["publicationCockpitJson"]) if expected_paths["publicationCockpitJson"] else "",
            "ready": (
                artifacts["publicationCockpitMarkdown"]["status"] == "ready"
                and artifacts["publicationCockpitJson"]["status"] == "ready"
                and artifacts["publicationReceiptLog"]["status"] == "ready"
                and receipt_log["aligned"]
            ),
            "receiptLogPath": str(expected_paths["publicationReceiptLog"]) if expected_paths["publicationReceiptLog"] else "",
            "receiptLog": receipt_log,
            "status": cockpit_json.get("status") or "",
            "uploadPacketCount": (cockpit_json.get("summary") or {}).get("uploadPacketCount")
                or (cockpit_json.get("summary") or {}).get("publishRecordCount")
                or 0,
            "receiptCapturedCount": upload_receipt_count,
            "receiptRemainingCount": upload_receipt_remaining_count,
            "publicationComplete": publication_complete,
            "socialClipCount": (cockpit_json.get("summary") or {}).get("socialClipCount")
                or (cockpit_json.get("summary") or {}).get("shortCandidateCount")
                or 0,
        },
        "podcastReadyPacket": podcast_ready_packet,
        "nextActions": [
            "Watch/listen spot-check exported media before public posting.",
            "Review title, description, captions, thumbnail, chapters, and platform copy.",
            "Open PUBLICATION-COCKPIT.md as the operator dashboard for uploads and receipt capture.",
            "Confirm social-ready and podcast-ready packets exist in the release folder or regenerate them.",
            "Upload or schedule manually or through future connectors.",
            "Capture platform URLs and receipts back into Quipsly.",
            "After receipts are captured, rerun verification and require status publication-complete before archiving the release.",
        ],
        "sourcePolicy": "Verifier reads release artifacts only. It does not mutate source media or platform state.",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify a QuipslyStudio release folder.")
    parser.add_argument("folder", type=Path, help="Release candidate folder to inspect")
    parser.add_argument("--write", type=Path, help="Optional JSON output path")
    args = parser.parse_args()
    if not args.folder.exists() or not args.folder.is_dir():
        print(json.dumps({"status": "error", "error": f"Folder not found: {args.folder}"}, indent=2))
        return 2
    result = verify_release_folder(args.folder)
    rendered = json.dumps(result, indent=2)
    print(rendered)
    if args.write:
        args.write.write_text(rendered + "\n")
    return 0 if result["status"] in {"ready-for-human-review", "publication-complete"} else 1


if __name__ == "__main__":
    raise SystemExit(main())
