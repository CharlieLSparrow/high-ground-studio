#!/usr/bin/env python3
"""Build a handoff-ready podcast publication packet from a Quipsly podcast manifest."""
from __future__ import annotations

import argparse
import csv
import json
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


PLATFORMS = ["Spotify", "Apple Podcasts"]


def load_json(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text())
    if not isinstance(payload, dict):
        raise ValueError(f"{path} must contain a JSON object.")
    return payload


def quote_for_shell(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def safe_slug(value: str) -> str:
    cleaned = "".join(ch.lower() if ch.isalnum() else "-" for ch in value).strip("-")
    while "--" in cleaned:
        cleaned = cleaned.replace("--", "-")
    return cleaned or "podcast"


def audio_path_from_manifest(manifest: dict[str, Any]) -> str:
    audio_artifact = manifest.get("audioArtifact")
    if isinstance(audio_artifact, dict):
        path = str(audio_artifact.get("path") or "")
        if path:
            return path
    return str(manifest.get("audioArtifactPath") or "")


def platform_rows(manifest: dict[str, Any], audio_output_path: str) -> list[dict[str, Any]]:
    raw_platforms = manifest.get("platforms") if isinstance(manifest.get("platforms"), list) else []
    rows: list[dict[str, Any]] = []
    for platform in PLATFORMS:
        source = next((item for item in raw_platforms if isinstance(item, dict) and item.get("platform") == platform), {})
        receipt_id = str(
            source.get("publishReceiptId")
            or source.get("receiptId")
            or ""
        )
        title = str(
            source.get("title")
            or manifest.get("episodeTitle")
            or manifest.get("episode")
            or "Untitled episode"
        )
        command = (
            "Generate the publish ledger before receipt capture."
            if not receipt_id
            else (
                "script/agentctl.sh podcast-receipt-capture "
                f"{quote_for_shell(platform)} "
                "published "
                "<public-url> "
                "<provider-id> "
                f"{quote_for_shell('manual podcast receipt')}"
            )
        )
        rows.append(
            {
                "platform": platform,
                "deliveryLaneId": "podcast-audio-master",
                "title": title,
                "description": str(source.get("description") or ""),
                "tags": ", ".join(source.get("tags") or []) if isinstance(source.get("tags"), list) else str(source.get("tags") or ""),
                "audioPath": audio_output_path,
                "artifactReady": bool(audio_output_path),
                "manualPublishingReady": bool(audio_output_path),
                "directPublishingReady": False,
                "rssFeedRequired": True,
                "publishReceiptId": receipt_id,
                "publishStatus": str(source.get("publishStatus") or "missing-publish-ledger-record"),
                "publicURL": str(source.get("publicURL") or ""),
                "providerReceiptId": str(source.get("providerReceiptId") or ""),
                "receiptCaptured": bool(source.get("receiptCaptured") or False),
                "operatorNextStep": "Listen-check audio, upload through podcast host/RSS, then capture the platform episode URL.",
                "receiptCaptureCommand": command,
            }
        )
    return rows


def ffprobe_audio(path: Path) -> dict[str, Any]:
    ffprobe = shutil.which("ffprobe")
    if not ffprobe or not path.exists():
        return {"probeable": False}
    result = subprocess.run(
        [
            ffprobe,
            "-v",
            "error",
            "-show_entries",
            "format=duration,size,format_name",
            "-of",
            "json",
            str(path),
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        return {"probeable": False, "error": result.stderr.strip()}
    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError:
        return {"probeable": False, "error": "ffprobe returned invalid JSON"}
    fmt = payload.get("format") if isinstance(payload, dict) else {}
    return {
        "probeable": True,
        "formatName": fmt.get("format_name", ""),
        "durationSeconds": float(fmt.get("duration") or 0),
        "sizeBytes": int(fmt.get("size") or 0),
    }


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def write_readme(path: Path, episode: str, audio_path: str, rows: list[dict[str, Any]], audio_probe: dict[str, Any]) -> None:
    duration = audio_probe.get("durationSeconds")
    duration_line = f"- Duration: {duration:.1f}s" if isinstance(duration, float) and duration > 0 else "- Duration: unknown"
    lines = [
        "# Podcast Audio Ready for Publication",
        "",
        f"Episode: **{episode}**",
        "",
        "## Publishing truth",
        "",
        "- This packet is a podcast-host/RSS handoff.",
        "- It does not upload directly to Spotify or Apple Podcasts.",
        "- Nothing is published until a platform URL/provider receipt is captured back into Quipsly.",
        "",
        "## Audio artifact",
        "",
        f"- File: `{Path(audio_path).name if audio_path else 'missing'}`",
        duration_line,
        f"- Probeable: {audio_probe.get('probeable', False)}",
        "",
        "## Operator workflow",
        "",
        "1. Listen-check the audio master.",
        "2. Update title, show notes, transcript, and episode art in the podcast host/RSS tool.",
        "3. Publish or schedule through the podcast host.",
        "4. Capture Spotify and Apple Podcasts URLs back into Quipsly.",
        "",
        "## Receipt capture commands",
        "",
    ]
    for row in rows:
        lines.extend(
            [
                f"### {row['platform']}",
                "",
                f"Next step: {row['operatorNextStep']}",
                "",
                "```bash",
                str(row["receiptCaptureCommand"]),
                "```",
                "",
            ]
        )
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def prepare_output_folder(output_folder: Path, basename: str) -> None:
    output_folder.mkdir(parents=True, exist_ok=True)
    audio_folder = output_folder / "audio"
    if audio_folder.exists():
        shutil.rmtree(audio_folder)
    for managed_file in [
        output_folder / f"{basename}.json",
        output_folder / f"{basename}.csv",
        output_folder / f"README-{basename}.md",
    ]:
        if managed_file.exists():
            managed_file.unlink()


def zip_folder(folder: Path) -> str:
    archive_base = folder.with_suffix("")
    return shutil.make_archive(str(archive_base), "zip", root_dir=folder.parent, base_dir=folder.name)


def build_packet(manifest_path: Path, output_folder: Path, basename: str, make_zip: bool) -> dict[str, Any]:
    manifest = load_json(manifest_path)
    prepare_output_folder(output_folder, basename)
    episode = str(manifest.get("episodeTitle") or manifest.get("episode") or "Untitled episode")
    source_audio_raw = audio_path_from_manifest(manifest).strip()
    source_audio = Path(source_audio_raw) if source_audio_raw else None
    audio_output_path = ""
    audio_missing_reason = ""
    if not source_audio_raw:
        audio_missing_reason = "Podcast manifest does not contain an audio artifact path. Run audio master export, then regenerate the podcast packet."
    elif source_audio is not None and not source_audio.exists():
        audio_missing_reason = f"Audio artifact does not exist: {source_audio}"
    elif source_audio is not None and not source_audio.is_file():
        audio_missing_reason = f"Audio artifact path is not a file: {source_audio}"
    else:
        audio_folder = output_folder / "audio"
        audio_folder.mkdir(parents=True, exist_ok=True)
        assert source_audio is not None
        destination = audio_folder / source_audio.name
        shutil.copy2(source_audio, destination)
        audio_output_path = str(destination)
    audio_probe = ffprobe_audio(Path(audio_output_path))
    rows = platform_rows(manifest, audio_output_path)
    ready = bool(audio_output_path) and all(row["manualPublishingReady"] for row in rows)
    packet = {
        "model": "quipsly-podcast-ready-publication-packet",
        "version": "2026-06-17.podcast-ready-publication-packet.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "episode": episode,
        "sourceManifest": str(manifest_path),
        "audioSourcePath": str(source_audio) if source_audio is not None else "",
        "audioPath": audio_output_path,
        "audioMissingReason": audio_missing_reason,
        "audioProbe": audio_probe,
        "manualPublishingReady": ready,
        "directPublishingReady": False,
        "rssFeedRequired": True,
        "postingTruth": "Ready for podcast-host/RSS review when audioPath exists. Nothing was uploaded or scheduled automatically.",
        "operatorWorkflow": [
            "Listen-check the copied audio artifact.",
            "Upload or schedule through the podcast host/RSS provider.",
            "Capture Spotify and Apple Podcasts URLs or provider ids back into Quipsly.",
        ],
        "platforms": rows,
    }
    json_path = output_folder / f"{basename}.json"
    csv_path = output_folder / f"{basename}.csv"
    readme_path = output_folder / f"README-{basename}.md"
    json_path.write_text(json.dumps(packet, indent=2) + "\n", encoding="utf-8")
    write_csv(csv_path, rows)
    write_readme(readme_path, episode, audio_output_path, rows, audio_probe)
    if make_zip:
        packet["zipPath"] = zip_folder(output_folder)
        json_path.write_text(json.dumps(packet, indent=2) + "\n", encoding="utf-8")
    return packet


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path, help="Path to a Quipsly podcast manifest JSON.")
    parser.add_argument("--output", required=True, type=Path, help="Output folder for podcast-ready files.")
    parser.add_argument("--basename", default="podcast-ready", help="Base filename for JSON/CSV/README outputs.")
    parser.add_argument("--zip", action="store_true", help="Also write a zip archive beside the output folder.")
    args = parser.parse_args()
    packet = build_packet(args.manifest, args.output, safe_slug(args.basename), args.zip)
    print(
        json.dumps(
            {
                "output": str(args.output),
                "manualPublishingReady": packet["manualPublishingReady"],
                "audioPath": packet["audioPath"],
                "zipPath": packet.get("zipPath", ""),
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
