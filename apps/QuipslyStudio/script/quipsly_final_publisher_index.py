#!/usr/bin/env python3
"""Create a one-page Quipsly final publisher index for an upload-ready packet.

This is the reusable version of the Episode 4 v007 final publisher index.
It collects the final human/operator upload artifacts, verifies each path exists,
reads optional QC/thumbnail/receipt evidence, and writes Markdown + JSON front
matter into the ready folder.

It does not upload, publish, schedule, mutate external accounts, or touch
original media. Local readiness and external publication receipt truth stay
separate.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


@dataclass
class PublisherItem:
    label: str
    relativePath: str
    note: str
    exists: bool = False


@dataclass
class PublisherIndex:
    schema: str = "quipsly.final-publisher-index.v1"
    createdAt: str = ""
    status: str = "not-run"
    episodeId: str = ""
    title: str = ""
    readyDir: str = ""
    producerRecommendation: str = ""
    qc: dict[str, Any] = field(default_factory=dict)
    thumbnail: dict[str, Any] = field(default_factory=dict)
    receipts: dict[str, Any] = field(default_factory=dict)
    missing: list[str] = field(default_factory=list)
    items: list[PublisherItem] = field(default_factory=list)
    truth: dict[str, Any] = field(default_factory=dict)


def load_json(path: Path | None) -> dict[str, Any]:
    if path is None or not path.exists():
        return {}
    try:
        data = json.loads(path.read_text())
    except json.JSONDecodeError as exc:
        return {"status": "json-parse-failed", "error": str(exc)}
    return data if isinstance(data, dict) else {"status": "unexpected-json-root"}


def resolve(ready_dir: Path, value: str | None) -> Path | None:
    if not value:
        return None
    path = Path(value)
    return path if path.is_absolute() else ready_dir / path


def rel(ready_dir: Path, path: Path | None) -> str | None:
    if path is None:
        return None
    try:
        return str(path.relative_to(ready_dir))
    except ValueError:
        return str(path)


def add_item(items: list[PublisherItem], ready_dir: Path, label: str, value: str | None, note: str) -> None:
    path = resolve(ready_dir, value)
    if path is None:
        return
    relative = rel(ready_dir, path) or value or ""
    items.append(PublisherItem(label=label, relativePath=relative, note=note, exists=path.exists() and path.stat().st_size > 0))


def append_link_section(path: Path, stem: str) -> None:
    if not path.exists():
        return
    marker = f"{stem}.md"
    text = path.read_text()
    if marker in text:
        return
    section = f"""
## Final publisher index

Use this as the one-page front door for the complete upload packet:

- `{stem}.md`
- `{stem}.json`
"""
    path.write_text(text.rstrip() + "\n" + section)


def build_markdown(report: PublisherIndex, output_stem: str, args: argparse.Namespace) -> str:
    lines: list[str] = [
        f"# {report.title} final publisher index",
        "",
        f"Created: `{report.createdAt}`",
        "",
        f"Status: `{report.status}`",
        "",
        "## Producer recommendation",
        "",
        report.producerRecommendation,
        "",
        "## One-minute upload path",
        "",
    ]
    step = 1
    if args.start_here:
        lines.append(f"{step}. Open `{args.start_here}`."); step += 1
    if args.youtube_video:
        lines.append(f"{step}. Upload `{args.youtube_video}` to YouTube."); step += 1
    if args.platform_copy:
        lines.append(f"{step}. Add copy from `{args.platform_copy}`."); step += 1
    if args.thumbnail:
        lines.append(f"{step}. Add thumbnail `{args.thumbnail}`."); step += 1
    if args.captions:
        lines.append(f"{step}. Add captions `{args.captions}`."); step += 1
    if args.podcast_audio:
        lines.append(f"{step}. Upload `{args.podcast_audio}` to the podcast/RSS host."); step += 1
    if args.receipt_launcher:
        lines.append(f"{step}. After platform URLs exist, run `{args.receipt_launcher}`."); step += 1
    lines.extend(["", "## Readiness proof", ""])
    if report.qc:
        lines.append(
            f"- Final QC: `{report.qc.get('status', 'unknown')}`, "
            f"hard stops `{report.qc.get('hardStopCount', 'unknown')}`, "
            f"warnings `{report.qc.get('warningCount', 'unknown')}`."
        )
    if report.thumbnail:
        lines.append(
            f"- Thumbnail packet: `{report.thumbnail.get('status', 'unknown')}`, "
            f"recommended `{report.thumbnail.get('recommended', 'unknown')}`."
        )
    if report.receipts:
        summary = report.receipts.get("summary") or {}
        lines.append(
            f"- Receipts: `{report.receipts.get('status', 'unknown')}`; "
            f"receipts captured `{summary.get('receiptCapturedCount', 'unknown')}` of `{summary.get('entryCount', 'unknown')}`."
        )
    if args.integrity_certificate:
        lines.append(f"- Integrity certificate: `{args.integrity_certificate}`.")
    lines.extend(["", "## Artifact map", "", "| Artifact | Path | Note |", "| --- | --- | --- |"])
    for item in report.items:
        prefix = "OK" if item.exists else "MISSING"
        lines.append(f"| {prefix} {item.label} | `{item.relativePath}` | {item.note} |")
    lines.extend([
        "",
        "## Truth",
        "",
        "- Codex did not upload, publish, schedule, or send anything externally.",
        "- Original media was not mutated.",
        "- This index proves local upload readiness, not external publication.",
        "- Publication becomes true only after platform URLs or provider receipt IDs are captured in the receipt ledger.",
        "",
        "## Machine-readable twin",
        "",
        f"`{output_stem}.json`",
        "",
    ])
    return "\n".join(lines)


def build_report(args: argparse.Namespace) -> PublisherIndex:
    ready_dir = Path(args.ready_dir).expanduser().resolve()
    items: list[PublisherItem] = []
    add_item(items, ready_dir, "Start here checklist", args.start_here, "Open this first if you only want the upload steps.")
    add_item(items, ready_dir, "Main YouTube video", args.youtube_video, "Recommended long-form upload.")
    add_item(items, ready_dir, "Main podcast audio", args.podcast_audio, "Preferred podcast/RSS upload audio.")
    add_item(items, ready_dir, "Podcast fallback MP3", args.podcast_fallback, "Use only if the host rejects the preferred audio.")
    add_item(items, ready_dir, "YouTube captions", args.captions, "Upload-safe SRT; verify separately if human-proofread transcript is required.")
    add_item(items, ready_dir, "Upload metadata", args.metadata, "Original upload title, description, tags, and notes.")
    add_item(items, ready_dir, "Platform copy packet", args.platform_copy, "Paste-ready YouTube/podcast/social copy.")
    add_item(items, ready_dir, "Recommended thumbnail", args.thumbnail, "Recommended YouTube thumbnail.")
    add_item(items, ready_dir, "Thumbnail packet", args.thumbnail_readme, "Recommended and backup thumbnail options.")
    add_item(items, ready_dir, "Social shorts packet", args.social_shorts_start_here, "Rendered shorts and social copy.")
    add_item(items, ready_dir, "Social shorts manifest", args.social_shorts_manifest, "Machine-readable shorts proof.")
    add_item(items, ready_dir, "Upload integrity certificate", args.integrity_certificate, "Fingerprints and identity proof for upload files.")
    add_item(items, ready_dir, "SHA256 sums", args.sha256s, "Checksum file for copied/uploaded artifact verification.")
    add_item(items, ready_dir, "Final QC JSON", args.final_qc_json, "Machine QC report.")
    add_item(items, ready_dir, "Transcript confidence note", args.transcript_confidence, "Caption/transcript confidence and risk note.")
    add_item(items, ready_dir, "After-upload receipt instructions", args.receipt_instructions, "Use after manual upload to record URLs/receipts.")
    add_item(items, ready_dir, "Publication receipt ledger", args.publication_receipts, "Truth ledger for actual platform URLs/receipts.")

    missing = [item.relativePath for item in items if not item.exists]
    final_qc = load_json(resolve(ready_dir, args.final_qc_json))
    thumbnail = load_json(resolve(ready_dir, args.thumbnail_json))
    receipts = load_json(resolve(ready_dir, args.publication_receipts_json or args.publication_receipts))
    return PublisherIndex(
        createdAt=datetime.now(timezone.utc).isoformat(),
        status="ready-to-upload" if not missing else "needs-attention",
        episodeId=args.episode_id,
        title=args.title,
        readyDir=str(ready_dir),
        producerRecommendation=args.recommendation,
        qc={
            "status": final_qc.get("status"),
            "hardStopCount": final_qc.get("hardStopCount"),
            "warningCount": final_qc.get("warningCount"),
            "checkCount": final_qc.get("checkCount"),
        } if final_qc else {},
        thumbnail={
            "status": thumbnail.get("status"),
            "recommended": thumbnail.get("recommended"),
        } if thumbnail else {},
        receipts={
            "status": receipts.get("status"),
            "summary": receipts.get("summary"),
        } if receipts else {},
        missing=missing,
        items=items,
        truth={
            "externalUploadPerformedByCodex": False,
            "externalPublicationClaimed": False,
            "originalMediaMutated": False,
            "localUploadReadinessOnly": True,
        },
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ready-dir", required=True)
    parser.add_argument("--episode-id", default="")
    parser.add_argument("--title", required=True)
    parser.add_argument("--recommendation", required=True)
    parser.add_argument("--start-here")
    parser.add_argument("--youtube-video")
    parser.add_argument("--podcast-audio")
    parser.add_argument("--podcast-fallback")
    parser.add_argument("--captions")
    parser.add_argument("--metadata")
    parser.add_argument("--platform-copy")
    parser.add_argument("--thumbnail")
    parser.add_argument("--thumbnail-readme")
    parser.add_argument("--thumbnail-json")
    parser.add_argument("--social-shorts-start-here")
    parser.add_argument("--social-shorts-manifest")
    parser.add_argument("--integrity-certificate")
    parser.add_argument("--sha256s")
    parser.add_argument("--final-qc-json")
    parser.add_argument("--transcript-confidence")
    parser.add_argument("--receipt-instructions")
    parser.add_argument("--publication-receipts")
    parser.add_argument("--publication-receipts-json")
    parser.add_argument("--receipt-launcher")
    parser.add_argument("--output-stem", default="FINAL_PUBLISHER_INDEX")
    parser.add_argument("--link-doc", action="append", default=[])
    parser.add_argument("--json", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    ready_dir = Path(args.ready_dir).expanduser().resolve()
    ready_dir.mkdir(parents=True, exist_ok=True)
    report = build_report(args)
    json_path = ready_dir / f"{args.output_stem}.json"
    md_path = ready_dir / f"{args.output_stem}.md"
    json_path.write_text(json.dumps(asdict(report), indent=2) + "\n")
    md_path.write_text(build_markdown(report, args.output_stem, args))
    for doc in args.link_doc:
        append_link_section(resolve(ready_dir, doc) or Path(doc), args.output_stem)
    payload = {"status": report.status, "missing": report.missing, "markdown": str(md_path), "json": str(json_path)}
    print(json.dumps(payload, indent=2) if args.json else payload)


if __name__ == "__main__":
    main()
