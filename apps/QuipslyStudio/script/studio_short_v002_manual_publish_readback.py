#!/usr/bin/env python3
"""Read back short v002 manual-publishing packet readiness.

This summarizes a versioned manual-publishing packet for humans and agents.
It reads local packet artifacts only and creates no publication state.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


DEFAULT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
DEFAULT_PACKET_POINTER = DEFAULT_ROOT / "review-board" / "short-v002-manual-publish-packet" / "latest-short-v002-manual-publish-packet.json"
REQUIRED_PLATFORMS = ("youtubeShorts", "instagramReels", "facebookReels", "linkedin")


def load_json(path: str | Path) -> dict[str, Any]:
    candidate = Path(path)
    if not candidate.exists():
        return {}
    try:
        data = json.loads(candidate.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return data if isinstance(data, dict) else {}


def resolve_packet(path: str | Path) -> tuple[dict[str, Any], dict[str, str]]:
    requested = Path(path).expanduser()
    first = load_json(requested)
    source = {
        "requestedPath": str(requested),
        "pointerPath": "",
        "payloadPath": str(requested) if first.get("items") else "",
    }
    if first.get("items"):
        return first, source
    payload_path = str(first.get("jsonPath") or "")
    if payload_path:
        source["pointerPath"] = str(requested)
        source["payloadPath"] = payload_path
        return load_json(payload_path), source
    return {}, source


def as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def path_exists(path_value: str) -> bool:
    return bool(path_value) and Path(path_value).exists()


def item_status(item: dict[str, Any]) -> dict[str, Any]:
    paths = as_dict(item.get("paths"))
    platform_blocks = as_dict(item.get("platformCopyBlocks"))
    missing_paths = [
        label
        for label, path_value in {
            "candidateVideo": paths.get("candidateVideo") or "",
            "draftCaptionSrt": paths.get("draftCaptionSrt") or "",
            "draftCaptionVtt": paths.get("draftCaptionVtt") or "",
            "candidateTranscript": paths.get("candidateTranscriptMarkdown") or paths.get("candidateTranscriptJson") or "",
        }.items()
        if not path_exists(str(path_value))
    ]
    missing_platforms = [platform for platform in REQUIRED_PLATFORMS if platform not in platform_blocks]
    warnings = [str(warning) for warning in as_list(item.get("warnings")) if warning]
    hard_blockers = [*missing_paths, *[f"platform:{platform}" for platform in missing_platforms]]
    ready = not hard_blockers and item.get("approvalState") == "needs-human-approval"
    return {
        "shortId": item.get("shortId") or "",
        "episode": item.get("episode"),
        "status": "ready-for-watch-listen" if ready else "needs-attention",
        "packetStatus": item.get("status") or "",
        "approvalState": item.get("approvalState") or "",
        "publicationState": item.get("publicationState") or "",
        "warnings": warnings,
        "missingPaths": missing_paths,
        "missingPlatforms": missing_platforms,
        "candidatePath": paths.get("candidateVideo") or item.get("candidatePath") or "",
        "captionPaths": {
            "srt": paths.get("draftCaptionSrt") or "",
            "vtt": paths.get("draftCaptionVtt") or "",
        },
        "platforms": sorted(platform_blocks.keys()),
        "nextSafestAction": item.get("nextSafestAction") or "Watch/listen before any manual posting.",
    }


def build_readback(args: argparse.Namespace) -> dict[str, Any]:
    packet, source = resolve_packet(args.packet)
    item_readbacks = [item_status(item) for item in as_list(packet.get("items")) if isinstance(item, dict)]
    ready = sum(1 for item in item_readbacks if item.get("status") == "ready-for-watch-listen")
    needs_attention = len(item_readbacks) - ready
    false_publication_flags = []
    counts = as_dict(packet.get("counts"))
    for key in ("approvalRecorded", "externalPublishing", "receiptTruthCreated", "sourceFilesMutated", "versionsOverwritten"):
        if counts.get(key):
            false_publication_flags.append(key)
    if any(item.get("publicationState") != "not-uploaded-not-scheduled-not-published" for item in item_readbacks):
        false_publication_flags.append("itemPublicationState")
    status = "manual-publish-readback-ready" if item_readbacks and needs_attention == 0 and not false_publication_flags else "manual-publish-readback-needs-attention"
    return {
        "status": status,
        "source": {
            **source,
            "packetStatus": packet.get("status") or "",
            "packetGeneratedAt": packet.get("generatedAt") or "",
        },
        "counts": {
            "items": len(item_readbacks),
            "readyForWatchListen": ready,
            "needsAttention": needs_attention,
            "falsePublicationFlags": false_publication_flags,
        },
        "items": item_readbacks,
        "nextSafestAction": "Open the HTML packet and watch/listen ready shorts; do not post until a human explicitly approves." if ready else "Fix missing artifact/platform items or regenerate the manual packet.",
        "truth": "Readback only. It does not approve, upload, schedule, publish, mutate source media, overwrite exports, mutate accounts, or create receipt truth.",
    }


def render_markdown(payload: dict[str, Any]) -> str:
    lines = [
        "# Short v002 manual-publishing readback",
        "",
        f"Status: `{payload.get('status')}`",
        f"Items: `{payload.get('counts', {}).get('items')}`",
        f"Ready for watch/listen: `{payload.get('counts', {}).get('readyForWatchListen')}`",
        f"Needs attention: `{payload.get('counts', {}).get('needsAttention')}`",
        f"False publication flags: `{', '.join(payload.get('counts', {}).get('falsePublicationFlags') or []) or 'none'}`",
        "",
        f"Packet: `{payload.get('source', {}).get('payloadPath')}`",
        "",
    ]
    for item in as_list(payload.get("items")):
        lines.extend(
            [
                f"## `{item.get('shortId')}`",
                "",
                f"- Episode: `{item.get('episode')}`",
                f"- Status: `{item.get('status')}`",
                f"- Approval: `{item.get('approvalState')}`",
                f"- Publication: `{item.get('publicationState')}`",
                f"- Platforms: `{', '.join(item.get('platforms') or [])}`",
                f"- Missing paths: `{', '.join(item.get('missingPaths') or []) or 'none'}`",
                f"- Missing platforms: `{', '.join(item.get('missingPlatforms') or []) or 'none'}`",
                f"- Warnings: `{'; '.join(item.get('warnings') or []) or 'none'}`",
                f"- Candidate: `{item.get('candidatePath')}`",
                f"- Captions: SRT `{item.get('captionPaths', {}).get('srt')}` / VTT `{item.get('captionPaths', {}).get('vtt')}`",
                f"- Next: {item.get('nextSafestAction')}",
                "",
            ]
        )
    lines.extend(["## Truth boundary", "", str(payload.get("truth") or "")])
    return "\n".join(lines).rstrip() + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Read back manual-publishing readiness for short v002 candidates.")
    parser.add_argument("--packet", default=str(DEFAULT_PACKET_POINTER), help="Manual publish packet payload or latest-pointer JSON.")
    parser.add_argument("--format", choices=["markdown", "json"], default="markdown")
    parser.add_argument("--markdown", dest="format", action="store_const", const="markdown")
    parser.add_argument("--json", dest="format", action="store_const", const="json")
    args = parser.parse_args()
    payload = build_readback(args)
    if args.format == "json":
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        print(render_markdown(payload), end="")
    return 0 if payload.get("status") == "manual-publish-readback-ready" else 1


if __name__ == "__main__":
    raise SystemExit(main())
