#!/usr/bin/env python3
"""Generate local platform metadata/checklist packets from episode packages.

This prepares manual publishing material without uploading, scheduling, posting,
or claiming receipts. It reads manifest.json files and writes generated packet
files under each version folder's platform-prep directory.
"""

from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
EPISODE_TITLES = {
    1: "The Wednesday Rule",
}
PLATFORM_DEFS = [
    ("youtube-longform", "YouTube", "long-form video", "videoMaster16x9"),
    ("podcast-rss", "Podcast/RSS", "audio episode", "audioOnlyPodcast"),
    ("patreon", "Patreon", "supporter post", "videoMaster16x9"),
    ("highgroundodyssey", "HighGroundOdyssey.com", "episode page", "videoMaster16x9"),
    ("youtube-shorts", "YouTube Shorts", "shorts playlist", "shorts"),
    ("instagram", "Instagram", "shorts/reels playlist", "shorts"),
    ("facebook", "Facebook", "shorts/reels playlist", "shorts"),
    ("linkedin", "LinkedIn", "shorts/native post playlist", "shorts"),
]


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    return payload if isinstance(payload, dict) else {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def slugify(value: str) -> str:
    value = re.sub(r"[^A-Za-z0-9]+", "-", value).strip("-")
    return value.lower() or "episode"


def human_duration(seconds: Any) -> str:
    try:
        total = int(round(float(seconds or 0)))
    except (TypeError, ValueError):
        total = 0
    hours, remainder = divmod(total, 3600)
    minutes, secs = divmod(remainder, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes}:{secs:02d}"


def title_for_episode(episode: int) -> str:
    return EPISODE_TITLES.get(episode) or f"Episode {episode}: Review Cut"


def short_title(path_or_title: str, index: int) -> str:
    stem = Path(path_or_title).stem if path_or_title else f"short-{index:02d}"
    cleaned = re.sub(r"episode-\d+-v\d+-full-release-", "", stem, flags=re.I)
    cleaned = re.sub(r"episode-\d+-short-\d+-v\d+", f"Short {index:02d}", cleaned, flags=re.I)
    cleaned = cleaned.replace("-9x16-short", "").replace("-", " ")
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned.title() if cleaned else f"Short {index:02d}"


def asset_payload(item: dict[str, Any] | None) -> dict[str, Any]:
    item = item or {}
    path = item.get("path") or ""
    return {
        "path": path,
        "exists": bool(item.get("exists")),
        "bytes": item.get("bytes") or 0,
        "durationSeconds": item.get("durationSeconds") or 0,
        "durationLabel": human_duration(item.get("durationSeconds") or 0),
        "hasAudio": bool(item.get("hasAudio")),
        "hasVideo": bool(item.get("hasVideo")),
        "codecSummary": item.get("codecSummary") or [],
    }


def platform_copy(platform: str, episode: int, episode_title: str, kind: str) -> dict[str, Any]:
    base_title = f"High Ground Odyssey Episode {episode}: {episode_title}"
    if platform == "YouTube":
        return {
            "titleDraft": base_title,
            "descriptionDraft": "A High Ground Odyssey conversation prepared in Quipsly Studio. Review the final copy, links, credits, and chapter notes before publishing.",
            "tagsDraft": ["High Ground Odyssey", "leadership", "learning", "conversation", "Quipsly"],
        }
    if platform == "Podcast/RSS":
        return {
            "titleDraft": base_title,
            "summaryDraft": "Audio-only podcast master prepared locally. Review loudness, intro/outro, show notes, and RSS fields before upload.",
            "tagsDraft": ["High Ground Odyssey", "podcast", "leadership"],
        }
    if platform == "Patreon":
        return {
            "titleDraft": f"Early access: {base_title}",
            "bodyDraft": "Supporter-facing draft. Add warm context, behind-the-scenes notes, and any member-only links before posting.",
            "tagsDraft": ["early-access", "podcast", "high-ground-odyssey"],
        }
    if platform == "HighGroundOdyssey.com":
        return {
            "titleDraft": base_title,
            "pageSlugDraft": f"episode-{episode}-{slugify(episode_title)}",
            "bodyDraft": "Episode page draft. Add embedded video URL after publishing, book excerpt/context, transcript link, and calls to action.",
            "tagsDraft": ["episode", "book", "high-ground-odyssey"],
        }
    return {
        "titleDraft": f"{episode_title} - short clips",
        "captionDraft": "Short-form clip packet prepared from Quipsly Studio. Choose the strongest clips, tune captions, and upload manually before capturing receipts.",
        "hashtagsDraft": ["#HighGroundOdyssey", "#Leadership", "#Podcast", "#Learning"],
    }


def build_platform_packet(version_dir: Path, manifest: dict[str, Any], generated_at: str) -> dict[str, Any]:
    episode = int(manifest.get("episode") or 0)
    episode_title = title_for_episode(episode)
    artifacts = manifest.get("artifacts") or {}
    shorts = [item for item in manifest.get("shorts") or [] if isinstance(item, dict)]
    platforms = []
    for slug, platform, kind, asset_key in PLATFORM_DEFS:
        if asset_key == "shorts":
            assets = [
                {
                    "index": index,
                    "titleDraft": short_title(str(item.get("title") or item.get("path") or ""), index),
                    **asset_payload(item),
                }
                for index, item in enumerate(shorts, start=1)
            ]
            ready = bool(assets) and all(item["exists"] and item["bytes"] > 0 for item in assets)
        else:
            asset = asset_payload(artifacts.get(asset_key))
            assets = [asset]
            ready = asset["exists"] and asset["bytes"] > 0
        platforms.append({
            "slug": slug,
            "platform": platform,
            "kind": kind,
            "status": "metadata-ready-needs-human-review" if ready else "blocked-missing-local-artifact",
            "receiptStatus": "not_published",
            "externalActionTaken": False,
            "assets": assets,
            "copy": platform_copy(platform, episode, episode_title, kind),
            "checklist": [
                "Open and review the local file(s).",
                "Confirm title/caption/description matches the final edit.",
                "Confirm rights, credits, links, and calls to action.",
                "Upload manually or through a future approved integration.",
                "Capture platform URL/receipt after publication.",
            ],
        })
    return {
        "packetType": "quipsly-platform-metadata-packet",
        "version": "2026-06-24.platform-prep.v1",
        "generatedAt": generated_at,
        "episode": episode,
        "episodeTitle": episode_title,
        "versionDir": str(version_dir),
        "sourceManifest": str(version_dir / "manifest.json"),
        "publicationTruth": "This packet prepares manual publication. It does not upload, schedule, publish, approve, or capture receipts.",
        "platforms": platforms,
    }


def render_platform_readme(packet: dict[str, Any]) -> str:
    lines = [
        f"# Episode {packet['episode']:02d} platform prep",
        "",
        f"Generated: `{packet['generatedAt']}`",
        "",
        "> This is manual-publishing prep only. Nothing is published until a URL or platform receipt is captured.",
        "",
        f"Episode title draft: **{packet['episodeTitle']}**",
        "",
        "## Platform packets",
        "",
    ]
    for item in packet["platforms"]:
        lines.extend([
            f"### {item['platform']}",
            "",
            f"- Status: `{item['status']}`",
            f"- Receipt: `{item['receiptStatus']}`",
            f"- Kind: `{item['kind']}`",
            f"- Metadata: `{item['slug']}-metadata.json`",
            f"- Checklist: `{item['slug']}-checklist.md`",
            f"- Upload job draft: `{item['slug']}-upload-job.json`",
            "",
        ])
    return "\n".join(lines).rstrip() + "\n"


def render_checklist(platform_item: dict[str, Any]) -> str:
    lines = [
        f"# {platform_item['platform']} checklist",
        "",
        f"Status: `{platform_item['status']}`",
        f"Receipt status: `{platform_item['receiptStatus']}`",
        "",
        "## Checklist",
        "",
    ]
    for step in platform_item["checklist"]:
        lines.append(f"- [ ] {step}")
    lines.extend([
        "",
        "## Assets",
        "",
    ])
    for asset in platform_item["assets"][:20]:
        lines.append(f"- `{asset.get('path', '')}` ({asset.get('durationLabel', '0:00')})")
    if len(platform_item["assets"]) > 20:
        lines.append(f"- ... {len(platform_item['assets']) - 20} more asset(s) in metadata JSON")
    return "\n".join(lines).rstrip() + "\n"


def current_version_dirs(root: Path) -> list[Path]:
    status_path = root / "release-status.json"
    dirs = []
    if status_path.exists():
        try:
            status = load_json(status_path)
            for item in status.get("episodes") or []:
                if isinstance(item, dict) and item.get("versionDir"):
                    path = Path(str(item["versionDir"]))
                    if (path / "manifest.json").exists():
                        dirs.append(path)
        except Exception:
            pass
    if dirs:
        return dirs
    return sorted(path for path in root.glob("Episode_*/v*") if (path / "manifest.json").exists())


def write_packet(version_dir: Path, packet: dict[str, Any]) -> dict[str, Any]:
    output_dir = version_dir / "platform-prep"
    output_dir.mkdir(parents=True, exist_ok=True)
    packet_path = output_dir / "platform-metadata-packet.json"
    write_json(packet_path, packet)
    readme_path = output_dir / "README.md"
    readme_path.write_text(render_platform_readme(packet), encoding="utf-8")
    for item in packet["platforms"]:
        slug = item["slug"]
        write_json(output_dir / f"{slug}-metadata.json", item)
        (output_dir / f"{slug}-checklist.md").write_text(render_checklist(item), encoding="utf-8")
        write_json(output_dir / f"{slug}-upload-job.json", {
            "packetType": "quipsly-manual-upload-job-draft",
            "version": "2026-06-24.platform-prep.v1",
            "platform": item["platform"],
            "status": "draft-not-submitted",
            "externalActionTaken": False,
            "receiptStatus": "not_published",
            "metadataPath": str(output_dir / f"{slug}-metadata.json"),
            "checklistPath": str(output_dir / f"{slug}-checklist.md"),
            "truth": "This is a manual upload job draft only. It does not upload, schedule, publish, approve, or capture receipts.",
        })
    return {
        "versionDir": str(version_dir),
        "platformPrepDir": str(output_dir),
        "packetPath": str(packet_path),
        "platformCount": len(packet["platforms"]),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Build local platform metadata packets for current Quipsly episode versions.")
    parser.add_argument("root", nargs="?", type=Path, default=DEFAULT_ROOT)
    args = parser.parse_args()
    root = args.root.expanduser().resolve()
    if not root.exists():
        raise SystemExit(f"Release root not found: {root}")
    generated_at = iso_now()
    results = []
    for version_dir in current_version_dirs(root):
        manifest = load_json(version_dir / "manifest.json")
        packet = build_platform_packet(version_dir, manifest, generated_at)
        results.append(write_packet(version_dir, packet))
    print(json.dumps({
        "ok": True,
        "root": str(root),
        "generatedAt": generated_at,
        "episodePacketCount": len(results),
        "results": results,
        "truth": "Platform packets were generated locally only; no upload, scheduling, publication, account mutation, or receipt claim occurred.",
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
