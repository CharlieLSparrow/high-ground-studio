#!/usr/bin/env python3
"""Build a focused Photo Grove review batch from the latest export-prep packet.

This packet narrows a large cull into a calm first review set. It never changes
photo decisions, moves/copies originals, exports client files, or publishes.
"""

from __future__ import annotations

import argparse
import html
import json
import shlex
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote


DEFAULT_PHOTO_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove")


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp_now() -> str:
    return datetime.now().strftime("%Y%m%d-%H%M%S-photo-review-batch")


def load_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except Exception:
        return {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def file_uri(path_value: str) -> str:
    try:
        return Path(path_value).as_uri()
    except ValueError:
        return "file://" + quote(path_value)


def resolve_latest_session(photo_root: Path) -> Path:
    pointer = load_json(photo_root / "latest-photo-grove-review.json")
    latest = pointer.get("latestSessionDir")
    if latest:
        path = Path(str(latest))
        if path.exists():
            return path
    candidates = sorted([path for path in photo_root.glob("20*-*") if path.is_dir()], key=lambda path: path.stat().st_mtime, reverse=True)
    if not candidates:
        raise SystemExit(f"No Photo Grove session found under {photo_root}")
    return candidates[0]


def build_batch(session_dir: Path, limit_groups: int = 8) -> dict[str, Any]:
    export_packet_path = session_dir / "export-packets" / "photo-grove-export-prep.json"
    manifest_path = session_dir / "manifest.json"
    export_packet = load_json(export_packet_path)
    if not export_packet:
        raise SystemExit(f"Photo Grove export-prep packet not found: {export_packet_path}")
    manifest = load_json(manifest_path)
    manifest_items = manifest.get("items") if isinstance(manifest.get("items"), list) else []
    items_by_id = {str(item.get("id") or ""): item for item in manifest_items if isinstance(item, dict) and item.get("id")}
    items_by_filename = {str(item.get("filename") or ""): item for item in manifest_items if isinstance(item, dict) and item.get("filename")}
    groups = export_packet.get("qualityTriageGroups") if isinstance(export_packet.get("qualityTriageGroups"), list) else []
    selected_groups = groups[:max(1, limit_groups)]
    output_dir = session_dir / "review-batches" / stamp_now()
    output_dir.mkdir(parents=True, exist_ok=False)

    batch_groups: list[dict[str, Any]] = []
    for rank, group in enumerate(selected_groups, start=1):
        if not isinstance(group, dict):
            continue
        samples = []
        for sample in group.get("samplePhotos") or []:
            if not isinstance(sample, dict):
                continue
            source_item = items_by_id.get(str(sample.get("id") or "")) or items_by_filename.get(str(sample.get("filename") or ""))
            source_path = str((source_item or {}).get("sourcePath") or "")
            samples.append({
                "id": sample.get("id") or "",
                "filename": sample.get("filename") or "",
                "thumbnailPath": sample.get("thumbnailPath") or "",
                "sourcePath": source_path,
                "sourceRelativePath": (source_item or {}).get("relativePath") or "",
                "revealSourceCommand": f"open -R {shlex.quote(source_path)}" if source_path else "",
                "qualityFlags": sample.get("qualityFlags") or [],
                "score": sample.get("score") or 0,
            })
        batch_groups.append({
            "rank": rank,
            "groupId": group.get("groupId") or "",
            "priority": group.get("priority") or "review",
            "recommendedReviewMode": group.get("recommendedReviewMode") or "review",
            "score": group.get("score") or 0,
            "size": group.get("size") or 0,
            "flaggedCount": group.get("flaggedCount") or 0,
            "qualityFlags": group.get("qualityFlags") or [],
            "nextSafestAction": group.get("nextSafestAction") or "Review this group before deciding.",
            "samples": samples,
            "commands": group.get("commands") or {},
            "truth": group.get("truth") or "Review only. No automatic cull decision.",
        })

    packet: dict[str, Any] = {
        "schema": "quipsly.photo-grove.review-batch.v1",
        "generatedAt": iso_now(),
        "sessionDir": str(session_dir),
        "sourceExportPrepPacket": str(export_packet_path),
        "sourceManifest": str(manifest_path),
        "sessionOutputDir": str(output_dir),
        "htmlPath": str(output_dir / "index.html"),
        "jsonPath": str(output_dir / "photo-review-batch.json"),
        "markdownPath": str(output_dir / "START-HERE-photo-review-batch.md"),
        "groupCount": len(batch_groups),
        "groups": batch_groups,
        "counts": export_packet.get("counts") or {},
        "humanAsk": "Review these grouped samples visually, compare near-duplicates, and decide which groups deserve metadata-only routing next.",
        "agentSafeParallelWork": "Prepare comparison summaries, source reveal commands, quality notes, and dry-run metadata instructions. Do not execute metadata decisions, copy, export, deliver, upload, publish, delete, overwrite, or mutate originals.",
        "reviewContract": {
            "stateTruth": "The review batch is evidence for culling. It is not a keep/reject decision and not client proof delivery.",
            "groups": len(batch_groups),
            "samples": sum(len(group.get("samples") or []) for group in batch_groups),
            "allowedWithoutApproval": [
                "open local batch evidence",
                "summarize quality hints",
                "prepare comparison notes",
                "prepare dry-run metadata command guidance",
            ],
            "requiresHumanApproval": [
                "write keep/favorite/reject sidecars",
                "copy/export client proof files",
                "upload, publish, schedule, delete, overwrite, or mutate originals",
            ],
        },
        "sourceTasks": [
            "Open the focused review batch.",
            "Compare each group before any metadata decision.",
            "Use quality hints only as attention routing.",
            "Route the strongest or most ambiguous groups through the command sheet/decision desk.",
        ],
        "nextSafestAction": "Review these groups in order. Use quality hints to compare, not to auto-reject. Record metadata decisions only after visual review.",
        "truth": "Focused culling review batch only. Originals are untouched; no keep/reject metadata was changed; no delivery/export/publication occurred.",
    }
    write_json(output_dir / "photo-review-batch.json", packet)
    write_markdown(output_dir / "START-HERE-photo-review-batch.md", packet)
    write_html(output_dir / "index.html", packet)
    pointer = {
        "schema": "quipsly.photo-grove.latest-review-batch.v1",
        "updatedAt": iso_now(),
        "sessionDir": str(session_dir),
        "htmlPath": packet["htmlPath"],
        "jsonPath": packet["jsonPath"],
        "markdownPath": packet["markdownPath"],
        "status": "focused-review-batch-ready",
        "groupCount": len(batch_groups),
        "groups": [
            {
                "rank": group.get("rank"),
                "groupId": group.get("groupId") or "",
                "priority": group.get("priority") or "",
                "recommendedReviewMode": group.get("recommendedReviewMode") or "",
                "score": group.get("score") or 0,
                "size": group.get("size") or 0,
                "flaggedCount": group.get("flaggedCount") or 0,
                "qualityFlags": group.get("qualityFlags") or [],
                "nextSafestAction": group.get("nextSafestAction") or "",
                "sampleCount": len(group.get("samples") or []),
                "samples": [
                    {
                        "id": sample.get("id") or "",
                        "filename": sample.get("filename") or "",
                        "thumbnailPath": sample.get("thumbnailPath") or "",
                        "sourcePath": sample.get("sourcePath") or "",
                        "qualityFlags": sample.get("qualityFlags") or [],
                        "score": sample.get("score") or 0,
                        "revealSourceCommand": sample.get("revealSourceCommand") or "",
                    }
                    for sample in (group.get("samples") or [])[:6]
                    if isinstance(sample, dict)
                ],
                "commands": group.get("commands") or {},
                "truth": group.get("truth") or "Review only. No automatic cull decision.",
            }
            for group in batch_groups
        ],
        "counts": {
            "groups": len(batch_groups),
            "samples": sum(len(group.get("samples") or []) for group in batch_groups),
            "metadataChanged": False,
            "originalsMutated": False,
            "clientDeliveryCreated": False,
            "externalPublishing": False,
        },
        "humanAsk": packet["humanAsk"],
        "agentSafeParallelWork": packet["agentSafeParallelWork"],
        "reviewContract": packet["reviewContract"],
        "sourceTasks": packet["sourceTasks"],
        "nextSafestAction": packet["nextSafestAction"],
        "firstSafeAction": {
            "label": "Open focused photo review batch",
            "command": f"open {shlex.quote(packet['htmlPath'])}",
            "path": packet["htmlPath"],
            "safety": "Opens local review evidence only. No metadata decision, export, delivery, upload, publication, or source mutation occurs.",
        },
        "firstMetadataCommand": str(((batch_groups[0].get("commands") or {}).get("routeGroupReview") if batch_groups else "") or ""),
        "firstMetadataCommandSafety": "Metadata-only routing after visual/source review; never deletes, moves, exports, or mutates original photos.",
        "truth": packet["truth"],
    }
    write_json(session_dir / "review-batches" / "latest-photo-review-batch.json", pointer)
    write_json(DEFAULT_PHOTO_ROOT / "latest-photo-grove-review-batch.json", pointer)
    return packet


def write_markdown(path: Path, packet: dict[str, Any]) -> None:
    lines = [
        "# Photo Grove first review batch",
        "",
        f"Generated: {packet['generatedAt']}",
        "",
        packet["truth"],
        "",
        f"Human ask: {packet.get('humanAsk')}",
        "",
        f"Codex can safely do: {packet.get('agentSafeParallelWork')}",
        "",
        f"Next safest action: {packet['nextSafestAction']}",
        "",
        f"Source export-prep packet: `{packet['sourceExportPrepPacket']}`",
        f"Source manifest: `{packet['sourceManifest']}`",
        "",
    ]
    for group in packet.get("groups") or []:
        lines.extend([
            f"## {group.get('rank')}. {group.get('groupId')} - {group.get('recommendedReviewMode')}",
            "",
            f"- Priority: `{group.get('priority')}`",
            f"- Flagged: `{group.get('flaggedCount')}` of `{group.get('size')}`",
            f"- Flags: {', '.join(group.get('qualityFlags') or []) or 'none'}",
            f"- Next: {group.get('nextSafestAction')}",
            "",
            "Sample thumbnails:",
        ])
        for sample in group.get("samples") or []:
            lines.append(f"- `{sample.get('filename')}` flags `{', '.join(sample.get('qualityFlags') or []) or 'none'}` thumb `{sample.get('thumbnailPath')}` source `{sample.get('sourcePath')}`")
            if sample.get("revealSourceCommand"):
                lines.append(f"  - reveal: `{sample.get('revealSourceCommand')}`")
        lines.extend(["", "Safe metadata commands:"])
        for label, command in (group.get("commands") or {}).items():
            lines.append(f"- {label}: `{command}`")
        lines.append("")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_html(path: Path, packet: dict[str, Any]) -> None:
    group_cards: list[str] = []
    for group in packet.get("groups") or []:
        samples = []
        for sample in group.get("samples") or []:
            thumb = str(sample.get("thumbnailPath") or "")
            source_path = str(sample.get("sourcePath") or "")
            reveal_command = str(sample.get("revealSourceCommand") or "")
            if thumb:
                samples.append(f"""
                <figure>
                  <img src=\"{html.escape(file_uri(thumb), quote=True)}\" alt=\"{html.escape(str(sample.get('filename') or 'photo'))}\">
                  <figcaption>{html.escape(str(sample.get('filename') or 'photo'))}</figcaption>
                  <figcaption class=\"source\">{html.escape(source_path or 'source path unavailable')}</figcaption>
                  <figcaption class=\"source\">{html.escape(reveal_command or '')}</figcaption>
                </figure>
                """)
        commands = json.dumps(group.get("commands") or {}, indent=2)
        flags = ", ".join(group.get("qualityFlags") or []) or "normal review"
        group_cards.append(f"""
        <article class=\"group {html.escape(str(group.get('priority') or 'review'))}\">
          <div class=\"rank\">#{html.escape(str(group.get('rank')))}</div>
          <h2>{html.escape(str(group.get('groupId') or 'group'))}</h2>
          <div class=\"mode\">{html.escape(str(group.get('recommendedReviewMode') or 'review'))}</div>
          <p>{html.escape(str(group.get('nextSafestAction') or 'Review this group.'))}</p>
          <p class=\"facts\">{html.escape(str(group.get('flaggedCount')))} of {html.escape(str(group.get('size')))} flagged · {html.escape(flags)}</p>
          <div class=\"samples\">{''.join(samples)}</div>
          <details><summary>Safe metadata commands</summary><pre>{html.escape(commands)}</pre></details>
        </article>
        """)
    html_text = f"""<!doctype html>
<html lang=\"en\">
<head>
  <meta charset=\"utf-8\">
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">
  <title>Photo Grove Review Batch</title>
  <style>
    :root {{ color-scheme:dark; --bg:#111812; --panel:#1c2a20; --ink:#f8f0dc; --muted:#c9bfa7; --moss:#92bd76; --gold:#e9c65b; --clay:#c7795b; --water:#69bfd0; --line:rgba(248,240,220,.16); }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; font-family:Avenir Next, Helvetica Neue, sans-serif; background:radial-gradient(circle at top left, rgba(146,189,118,.18), transparent 35%), var(--bg); color:var(--ink); }}
    header {{ padding:36px clamp(20px,5vw,72px); border-bottom:1px solid var(--line); }}
    .eyebrow {{ color:var(--gold); text-transform:uppercase; letter-spacing:.22em; font-size:12px; font-weight:900; }}
    h1 {{ margin:10px 0; font-size:clamp(34px,6vw,74px); line-height:.92; max-width:980px; }}
    p {{ color:var(--muted); line-height:1.5; }}
    main {{ padding:28px clamp(16px,4vw,56px) 70px; display:grid; grid-template-columns:repeat(auto-fit,minmax(320px,1fr)); gap:16px; }}
    .group {{ position:relative; border:1px solid var(--line); border-radius:24px; padding:18px; background:linear-gradient(180deg,rgba(28,42,32,.96),rgba(8,12,9,.96)); box-shadow:0 16px 42px rgba(0,0,0,.24); }}
    .group.preview-suspect {{ border-color:rgba(199,121,91,.62); }}
    .group.quality-review {{ border-color:rgba(233,198,91,.55); }}
    .rank {{ color:var(--gold); font-weight:900; letter-spacing:.12em; }}
    h2 {{ margin:8px 0; }}
    .mode {{ display:inline-flex; border-radius:999px; padding:6px 9px; background:rgba(146,189,118,.14); color:var(--moss); text-transform:uppercase; letter-spacing:.12em; font-size:10px; font-weight:900; }}
    .facts {{ color:var(--water); font-weight:800; }}
    .samples {{ display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin:14px 0; }}
    figure {{ margin:0; }}
    img {{ width:100%; aspect-ratio:1; object-fit:cover; border-radius:12px; border:1px solid var(--line); background:#050705; }}
    figcaption {{ color:var(--muted); font-size:10px; overflow-wrap:anywhere; margin-top:4px; }}
    figcaption.source {{ color:rgba(201,191,167,.72); font-size:9px; }}
    details {{ margin-top:12px; }}
    summary {{ cursor:pointer; color:var(--gold); font-weight:900; }}
    pre {{ white-space:pre-wrap; overflow-wrap:anywhere; color:var(--muted); font-size:12px; }}
    code {{ color:var(--gold); }}
  </style>
</head>
<body>
  <header>
    <div class=\"eyebrow\">Photo Grove</div>
    <h1>A first culling batch without panic.</h1>
    <p>{html.escape(packet['truth'])}</p>
    <p><strong>Human ask:</strong> {html.escape(packet.get('humanAsk') or '')}</p>
    <p><strong>Codex can safely do:</strong> {html.escape(packet.get('agentSafeParallelWork') or '')}</p>
    <p>{html.escape(packet['nextSafestAction'])}</p>
    <p>Source packet: <code>{html.escape(packet['sourceExportPrepPacket'])}</code></p>
    <p>Source manifest: <code>{html.escape(packet['sourceManifest'])}</code></p>
  </header>
  <main>{''.join(group_cards)}</main>
</body>
</html>
"""
    path.write_text(html_text, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Build focused Photo Grove review batch.")
    parser.add_argument("session", nargs="?", default="latest")
    parser.add_argument("--limit-groups", type=int, default=8)
    args = parser.parse_args()
    session = resolve_latest_session(DEFAULT_PHOTO_ROOT) if args.session == "latest" else Path(args.session)
    packet = build_batch(session, limit_groups=args.limit_groups)
    print(json.dumps({
        "ok": True,
        "htmlPath": packet["htmlPath"],
        "jsonPath": packet["jsonPath"],
        "markdownPath": packet["markdownPath"],
        "groupCount": packet["groupCount"],
        "truth": packet["truth"],
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
