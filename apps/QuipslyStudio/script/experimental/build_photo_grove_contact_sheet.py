#!/usr/bin/env python3
"""Build a Photo Grove contact sheet from the latest focused review batch.

This is a human-first, Aftershoot-inspired review surface: grouped frames shown
side by side, source reveal commands, dry-run metadata actions, and clear safety
boundaries. It never edits, moves, deletes, exports, uploads, or mutates original
photos.
"""
from __future__ import annotations

import csv
import html
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_PHOTO_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove")
DEFAULT_OUTPUT_ROOT = DEFAULT_PHOTO_ROOT / "ContactSheets"
LATEST_POINTER = DEFAULT_PHOTO_ROOT / "latest-photo-grove-contact-sheet.json"
SCHEMA = "quipsly.photo-grove.contact-sheet.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-photo-contact-sheet")


def esc(value: Any) -> str:
    return html.escape(str(value or ""))


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def load_json(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def file_uri(path: str) -> str:
    if not path:
        return ""
    try:
        return Path(path).resolve().as_uri()
    except Exception:
        return ""


def dry_run_command(command: str) -> str:
    return command.replace(" photo-grove-group-decision ", " photo-grove-group-decision-dry-run ").replace(
        " photo-grove-decision ", " photo-grove-decision-dry-run "
    )


def load_latest_review_batch(photo_root: Path) -> tuple[dict[str, Any], dict[str, Any], Path]:
    pointer = load_json(photo_root / "latest-photo-grove-review-batch.json")
    packet_path = Path(str(pointer.get("jsonPath") or ""))
    packet = load_json(packet_path) if packet_path.exists() else {}
    if not packet:
        raise SystemExit("No Photo Grove review batch found. Run ./script/agentctl.sh photo-grove-review-batch latest 8 first.")
    return pointer, packet, packet_path


def review_mode_label(group: dict[str, Any]) -> str:
    mode = str(group.get("recommendedReviewMode") or "compare-group")
    if mode == "source-inspection":
        return "Open source before judging"
    if mode == "burst-comparison":
        return "Compare burst sharpness"
    if mode == "exposure-comparison":
        return "Compare exposure/recoverability"
    return "Compare group"


def group_decision_language(group: dict[str, Any]) -> str:
    flags = {str(flag) for flag in group.get("qualityFlags") or []}
    if "thumbnail-analysis-suspect" in flags or "preview-all-white" in flags or "preview-very-dark" in flags:
        return "Thumbnail may be misleading. Open source/RAW before any keep or reject decision."
    if "sharpness-review-candidate" in flags:
        return "Choose the sharpest useful frame only after comparing nearby samples."
    if "exposure-review-candidate" in flags:
        return "Check whether exposure is recoverable before rating or rejecting."
    return "Pick the strongest frame(s) by expression, composition, and intended use."


def sample_row(sample: dict[str, Any], index: int) -> dict[str, Any]:
    source_path = str(sample.get("sourcePath") or "")
    thumbnail_path = str(sample.get("thumbnailPath") or "")
    return {
        "rank": index,
        "photoId": str(sample.get("id") or ""),
        "filename": str(sample.get("filename") or ""),
        "sourceRelativePath": str(sample.get("sourceRelativePath") or ""),
        "sourcePath": source_path,
        "thumbnailPath": thumbnail_path,
        "thumbnailUri": file_uri(thumbnail_path),
        "qualityFlags": [str(flag) for flag in sample.get("qualityFlags") or []],
        "score": sample.get("score") or 0,
        "revealSourceCommand": str(sample.get("revealSourceCommand") or (f"open -R {shell_quote(source_path)}" if source_path else "")),
    }


def group_row(group: dict[str, Any], index: int) -> dict[str, Any]:
    commands = group.get("commands") if isinstance(group.get("commands"), dict) else {}
    route_review = str(commands.get("routeGroupReview") or "")
    keep_group = str(commands.get("keepGroup4") or "")
    reject_group = str(commands.get("rejectGroup") or "")
    samples = [sample_row(sample, idx + 1) for idx, sample in enumerate((group.get("samples") or [])[:10]) if isinstance(sample, dict)]
    return {
        "rank": index,
        "groupId": str(group.get("groupId") or f"group-{index:03d}"),
        "priority": str(group.get("priority") or "review"),
        "reviewMode": str(group.get("recommendedReviewMode") or "compare-group"),
        "reviewModeLabel": review_mode_label(group),
        "decisionLanguage": group_decision_language(group),
        "nextSafestAction": str(group.get("nextSafestAction") or "Compare the group visually before metadata decisions."),
        "qualityFlags": [str(flag) for flag in group.get("qualityFlags") or []],
        "flaggedCount": int(group.get("flaggedCount") or 0),
        "score": group.get("score") or 0,
        "size": int(group.get("size") or len(samples)),
        "samples": samples,
        "commands": {
            "routeReviewDryRun": dry_run_command(route_review),
            "keepGroupDryRun": dry_run_command(keep_group),
            "rejectGroupDryRun": dry_run_command(reject_group),
            "routeReviewLive": route_review,
            "keepGroupLive": keep_group,
            "rejectGroupLive": reject_group,
        },
        "truth": "Contact sheet group only. No keep/reject metadata is written here, and originals remain untouched.",
    }


def build_payload(photo_root: Path, out_dir: Path, limit: int) -> dict[str, Any]:
    pointer, batch, batch_path = load_latest_review_batch(photo_root)
    raw_groups = [group for group in batch.get("groups") or [] if isinstance(group, dict)]
    groups = [group_row(group, idx + 1) for idx, group in enumerate(raw_groups[: max(1, limit)])]
    counts = batch.get("counts") if isinstance(batch.get("counts"), dict) else {}
    mode_counts: dict[str, int] = {}
    priority_counts: dict[str, int] = {}
    for group in groups:
        mode_counts[group["reviewMode"]] = mode_counts.get(group["reviewMode"], 0) + 1
        priority_counts[group["priority"]] = priority_counts.get(group["priority"], 0) + 1
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": "photo-contact-sheet-ready",
        "photoRoot": str(photo_root),
        "sessionDir": str(out_dir),
        "sourceReviewBatchPointer": str(photo_root / "latest-photo-grove-review-batch.json"),
        "sourceReviewBatchJson": str(batch_path),
        "sourceReviewBatchHtml": pointer.get("htmlPath") or batch.get("htmlPath") or "",
        "groups": groups,
        "reviewProtocol": {
            "purpose": "Review grouped frames visually before metadata culling decisions.",
            "firstPass": [
                "Start with source-inspection groups because thumbnails may lie.",
                "Compare samples within the group before choosing keep/favorite/review/reject.",
                "Run dry-run commands first when an agent is operating.",
                "Use live commands only for sidecar metadata after human/source-aware review.",
            ],
            "decisionValues": ["review", "keep", "favorite", "reject"],
            "notAllowedHere": [
                "delete original photos",
                "move or rename source photos",
                "copy client deliverables",
                "upload, publish, schedule, or mark delivery complete",
                "treat quality flags as final artistic judgment",
            ],
        },
        "counts": {
            "contactSheetGroups": len(groups),
            "contactSheetSamples": sum(len(group.get("samples") or []) for group in groups),
            "sourceGroups": len(raw_groups),
            "totalPhotos": int(counts.get("total") or 0),
            "pending": int(counts.get("pending") or 0),
            "review": int(counts.get("review") or 0),
            "selectedForClientProof": int(counts.get("selectedForClientProof") or 0),
            "qualityReviewCandidates": int(counts.get("qualityReviewCandidates") or counts.get("needsHumanAttention") or 0),
            "modeCounts": mode_counts,
            "priorityCounts": priority_counts,
            "metadataChanged": False,
            "originalsMutated": False,
            "clientDeliveryCreated": False,
            "externalPublishing": False,
            "versionsOverwritten": False,
        },
        "humanAsk": "Open the contact sheet, compare one group at a time, reveal source files when thumbnails are suspect, then record only sidecar metadata decisions you trust.",
        "agentSafeParallelWork": "Codex can prepare comparison notes, improve grouping/contact sheets, verify paths, and generate dry-run metadata commands. Do not execute live metadata decisions without explicit instruction.",
        "nextSafestAction": "Open the first source-inspection or quality-review group and compare its samples before any keep/reject metadata command.",
        "truth": {
            "metadataChanged": False,
            "originalsMutated": False,
            "clientDeliveryCreated": False,
            "externalPublishing": False,
            "externalSchedulesCreated": False,
            "versionsOverwritten": False,
            "description": "Photo Grove contact sheet only. It reads local review batch evidence and writes versioned local review guidance.",
        },
    }


def write_csv(path: Path, payload: dict[str, Any]) -> None:
    fields = ["rank", "groupId", "priority", "reviewMode", "size", "flaggedCount", "sampleCount", "decisionLanguage", "nextSafestAction", "routeReviewDryRun", "keepGroupDryRun", "rejectGroupDryRun"]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for group in payload.get("groups") or []:
            commands = group.get("commands") if isinstance(group.get("commands"), dict) else {}
            writer.writerow({
                "rank": group.get("rank"),
                "groupId": group.get("groupId"),
                "priority": group.get("priority"),
                "reviewMode": group.get("reviewMode"),
                "size": group.get("size"),
                "flaggedCount": group.get("flaggedCount"),
                "sampleCount": len(group.get("samples") or []),
                "decisionLanguage": group.get("decisionLanguage"),
                "nextSafestAction": group.get("nextSafestAction"),
                "routeReviewDryRun": commands.get("routeReviewDryRun", ""),
                "keepGroupDryRun": commands.get("keepGroupDryRun", ""),
                "rejectGroupDryRun": commands.get("rejectGroupDryRun", ""),
            })


def write_markdown(path: Path, payload: dict[str, Any]) -> None:
    lines = [
        "# Photo Grove contact sheet",
        "",
        f"Generated: `{payload['generatedAt']}`",
        "",
        payload["truth"]["description"],
        "",
        f"Next safest action: {payload['nextSafestAction']}",
        "",
        "## Counts",
        "",
    ]
    for key, value in payload.get("counts", {}).items():
        if isinstance(value, dict):
            continue
        lines.append(f"- {key}: `{value}`")
    lines.extend(["", "## Groups", ""])
    for group in payload.get("groups") or []:
        lines.append(f"### {group.get('rank')}. `{group.get('groupId')}` - {group.get('reviewModeLabel')}")
        lines.append("")
        lines.append(f"- Priority: `{group.get('priority')}`")
        lines.append(f"- Guidance: {group.get('decisionLanguage')}")
        lines.append(f"- Next: {group.get('nextSafestAction')}")
        lines.append(f"- Flags: `{', '.join(group.get('qualityFlags') or [])}`")
        commands = group.get("commands") if isinstance(group.get("commands"), dict) else {}
        for label in ("routeReviewDryRun", "keepGroupDryRun", "rejectGroupDryRun"):
            if commands.get(label):
                lines.append(f"- {label}: `{commands[label]}`")
        lines.append("")
        for sample in group.get("samples") or []:
            lines.append(f"- `{sample.get('filename')}` - {sample.get('sourceRelativePath')} - `{', '.join(sample.get('qualityFlags') or [])}`")
        lines.append("")
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def sample_html(sample: dict[str, Any]) -> str:
    flags = "".join(f"<span>{esc(flag)}</span>" for flag in sample.get("qualityFlags") or [])
    image = f"<img src='{esc(sample.get('thumbnailUri'))}' alt='{esc(sample.get('filename'))}'>" if sample.get("thumbnailUri") else "<div class='missing'>No thumbnail</div>"
    return f"""
    <figure class="sample">
      {image}
      <figcaption>
        <b>{esc(sample.get('filename'))}</b>
        <small>{esc(sample.get('sourceRelativePath'))}</small>
        <small>score {esc(sample.get('score'))}</small>
        <div class="flags">{flags}</div>
        <code>{esc(sample.get('revealSourceCommand'))}</code>
      </figcaption>
    </figure>
    """


def write_html(path: Path, payload: dict[str, Any]) -> None:
    groups_html = []
    for group in payload.get("groups") or []:
        flags = "".join(f"<span>{esc(flag)}</span>" for flag in group.get("qualityFlags") or [])
        samples = "".join(sample_html(sample) for sample in group.get("samples") or [])
        commands = group.get("commands") if isinstance(group.get("commands"), dict) else {}
        command_rows = "".join(
            f"<p><b>{esc(label)}</b><code>{esc(command)}</code></p>"
            for label, command in commands.items()
            if command and label.endswith("DryRun")
        )
        groups_html.append(f"""
        <section class="group {esc(group.get('priority'))}">
          <div class="group-head">
            <div><p class="kicker">Group {esc(group.get('rank'))} · {esc(group.get('priority'))}</p><h2>{esc(group.get('groupId'))}</h2></div>
            <div class="mode">{esc(group.get('reviewModeLabel'))}</div>
          </div>
          <p class="decision">{esc(group.get('decisionLanguage'))}</p>
          <p class="muted">{esc(group.get('nextSafestAction'))}</p>
          <div class="flags">{flags}</div>
          <div class="samples">{samples}</div>
          <details><summary>Dry-run metadata commands</summary>{command_rows}<p class="muted">Live sidecar metadata commands exist in JSON/CSV, but this contact sheet foregrounds dry-runs first.</p></details>
          <p class="truth">{esc(group.get('truth'))}</p>
        </section>
        """)
    counts = "".join(
        f"<div class='count'><b>{esc(key)}</b><span>{esc(value)}</span></div>"
        for key, value in payload.get("counts", {}).items()
        if not isinstance(value, dict) and not isinstance(value, bool)
    )
    protocol = payload.get("reviewProtocol") if isinstance(payload.get("reviewProtocol"), dict) else {}
    protocol_steps = "".join(f"<li>{esc(step)}</li>" for step in protocol.get("firstPass") or [])
    html_doc = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Photo Grove contact sheet</title>
<style>
:root {{ color-scheme: dark; --bg:#121814; --panel:#1c261e; --card:#233022; --ink:#f7f1d8; --muted:#bbb08d; --line:#43533c; --leaf:#88d36f; --honey:#eccb56; --clay:#df8465; --water:#7dd4df; }}
* {{ box-sizing:border-box; }}
body {{ margin:0; background:radial-gradient(circle at 12% 0%, rgba(136,211,111,.22), transparent 34rem), linear-gradient(120deg,#121814,#17140f); color:var(--ink); font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif; }}
main {{ max-width:1500px; margin:0 auto; padding:32px 24px 80px; }}
.hero {{ border:1px solid var(--line); border-radius:30px; padding:28px; background:rgba(28,38,30,.92); box-shadow:0 24px 90px rgba(0,0,0,.35); }}
.kicker {{ margin:0 0 8px; color:var(--honey); text-transform:uppercase; letter-spacing:.24em; font-weight:900; font-size:.75rem; }}
h1 {{ margin:0 0 12px; font-size:clamp(2.2rem,5vw,5rem); line-height:.93; letter-spacing:-.06em; }}
.counts {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:12px; margin-top:20px; }}
.count {{ border:1px solid var(--line); background:#121a14; border-radius:18px; padding:14px; }}
.count b {{ display:block; color:var(--muted); text-transform:uppercase; letter-spacing:.1em; font-size:.7rem; }}
.count span {{ color:var(--leaf); font-size:1.5rem; font-weight:900; }}
.protocol {{ color:var(--muted); }}
.group {{ margin:22px 0; border:1px solid var(--line); border-radius:26px; padding:20px; background:rgba(35,48,34,.9); }}
.group.preview-suspect {{ border-color:rgba(223,132,101,.85); }}
.group.quality-review {{ border-color:rgba(236,203,86,.72); }}
.group-head {{ display:flex; justify-content:space-between; align-items:flex-start; gap:16px; }}
h2 {{ margin:0; font-size:1.6rem; }}
.mode {{ border:1px solid var(--line); border-radius:999px; padding:8px 12px; color:var(--honey); background:#131a14; font-weight:900; white-space:nowrap; }}
.decision {{ font-size:1.05rem; color:var(--ink); }}
.muted,.truth {{ color:var(--muted); }}
.flags {{ display:flex; flex-wrap:wrap; gap:6px; margin:10px 0; }}
.flags span {{ border:1px solid var(--line); border-radius:999px; padding:4px 7px; color:var(--muted); background:#111711; font-size:.72rem; }}
.samples {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px; }}
.sample {{ margin:0; border:1px solid var(--line); border-radius:18px; overflow:hidden; background:#101710; }}
.sample img,.missing {{ width:100%; aspect-ratio:4/3; object-fit:cover; display:block; background:#0b0f0c; color:var(--muted); display:flex; align-items:center; justify-content:center; }}
.sample figcaption {{ padding:10px; }}
.sample b,.sample small {{ display:block; overflow-wrap:anywhere; }}
.sample small {{ color:var(--muted); }}
code {{ display:block; margin-top:8px; color:var(--water); overflow-wrap:anywhere; font-size:.72rem; }}
details {{ margin-top:14px; border:1px solid var(--line); border-radius:15px; padding:12px; background:#111711; }}
summary {{ cursor:pointer; color:var(--honey); font-weight:900; }}
</style>
</head>
<body><main>
<section class="hero">
  <p class="kicker">Photo Grove</p>
  <h1>Contact sheet review, without touching originals.</h1>
  <p>{esc(payload.get('humanAsk'))}</p>
  <ul class="protocol">{protocol_steps}</ul>
  <div class="counts">{counts}</div>
</section>
{''.join(groups_html)}
</main></body></html>
"""
    path.write_text(html_doc, encoding="utf-8")


def prepare_output_dir() -> Path:
    out_dir = DEFAULT_OUTPUT_ROOT / stamp()
    base = out_dir
    counter = 2
    while out_dir.exists():
        out_dir = Path(f"{base}-{counter}")
        counter += 1
    out_dir.mkdir(parents=True, exist_ok=False)
    return out_dir


def main() -> int:
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("photo_root", nargs="?", default=str(DEFAULT_PHOTO_ROOT))
    parser.add_argument("--limit", type=int, default=12)
    args = parser.parse_args()
    photo_root = Path(args.photo_root)
    out_dir = prepare_output_dir()
    payload = build_payload(photo_root, out_dir, args.limit)
    json_path = out_dir / "photo-grove-contact-sheet.json"
    csv_path = out_dir / "photo-grove-contact-sheet.csv"
    md_path = out_dir / "START-HERE-photo-grove-contact-sheet.md"
    html_path = out_dir / "index.html"
    payload.update({
        "jsonPath": str(json_path),
        "csvPath": str(csv_path),
        "markdownPath": str(md_path),
        "htmlPath": str(html_path),
    })
    payload["firstSafeAction"] = {
        "label": "Open Photo Grove contact sheet",
        "command": f"open {shell_quote(str(html_path))}",
        "path": str(html_path),
        "safety": "Opens local contact sheet only. No originals, metadata, exports, uploads, or delivery state are changed.",
    }
    write_json(json_path, payload)
    write_csv(csv_path, payload)
    write_markdown(md_path, payload)
    write_html(html_path, payload)
    pointer = {
        "schema": SCHEMA,
        "updatedAt": payload["generatedAt"],
        "status": payload["status"],
        "sessionDir": str(out_dir),
        "jsonPath": str(json_path),
        "csvPath": str(csv_path),
        "markdownPath": str(md_path),
        "htmlPath": str(html_path),
        "counts": payload["counts"],
        "humanAsk": payload["humanAsk"],
        "agentSafeParallelWork": payload["agentSafeParallelWork"],
        "firstSafeAction": payload["firstSafeAction"],
        "nextSafestAction": payload["nextSafestAction"],
        "truth": payload["truth"],
    }
    write_json(LATEST_POINTER, pointer)
    print(json.dumps(pointer, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
