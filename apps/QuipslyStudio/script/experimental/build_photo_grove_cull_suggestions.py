#!/usr/bin/env python3
"""Build a safe first-pass cull suggestion packet for Photo Grove.

This is an Aftershoot-like helper surface without pretending to be an
auto-reject system. It reads the latest focused review batch, groups thumbnails
and quality hints into a calmer review order, and exposes metadata-only commands
for humans/agents to use after inspection. Originals are never touched.
"""

from __future__ import annotations

import argparse
import csv
import html
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_PHOTO_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove")
SCHEMA = "quipsly.photo-grove.cull-suggestions.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-photo-cull-suggestions")


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except Exception:
        return {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def esc(value: Any) -> str:
    return html.escape(str(value or ""))


def file_uri(path: str) -> str:
    if not path:
        return ""
    try:
        return Path(path).resolve().as_uri()
    except Exception:
        return path


def load_latest_review_batch(photo_root: Path) -> tuple[dict[str, Any], dict[str, Any], Path]:
    pointer = load_json(photo_root / "latest-photo-grove-review-batch.json")
    packet_path = Path(str(pointer.get("jsonPath") or ""))
    packet = load_json(packet_path) if packet_path.exists() else {}
    if not packet:
        raise SystemExit("No Photo Grove review batch found. Run ./script/agentctl.sh photo-grove-export-prep and photo-grove-client-proof/review-batch first.")
    return pointer, packet, packet_path


def recommendation_for(group: dict[str, Any]) -> dict[str, str]:
    flags = {str(flag) for flag in (group.get("qualityFlags") or [])}
    priority = str(group.get("priority") or "")
    if "thumbnail-analysis-suspect" in flags or "preview-all-white" in flags or "preview-very-dark" in flags or priority == "preview-suspect":
        return {
            "recommendation": "inspect-source-before-cull",
            "tone": "The thumbnail may be lying. Open the RAW/source before calling this good or bad.",
            "suggestedMetadataStatus": "review",
            "reason": "preview-suspect quality hints are routing hints, not verdicts",
        }
    if "sharpness-review-candidate" in flags:
        return {
            "recommendation": "compare-sharpness",
            "tone": "Compare the group at review size and keep only the strongest frame after inspection.",
            "suggestedMetadataStatus": "review",
            "reason": "sharpness candidate needs side-by-side human review",
        }
    if "exposure-review-candidate" in flags:
        return {
            "recommendation": "compare-exposure",
            "tone": "Check whether exposure is recoverable before rating or rejecting.",
            "suggestedMetadataStatus": "review",
            "reason": "exposure candidate needs RAW-aware judgment",
        }
    return {
        "recommendation": "compare-for-keepers",
        "tone": "Compare the burst and choose keepers intentionally.",
        "suggestedMetadataStatus": "review",
        "reason": "grouped sequence should be reviewed together",
    }


def sample_card(sample: dict[str, Any]) -> dict[str, Any]:
    source_path = str(sample.get("sourcePath") or "")
    thumbnail_path = str(sample.get("thumbnailPath") or "")
    return {
        "id": sample.get("id") or "",
        "filename": sample.get("filename") or "",
        "sourceRelativePath": sample.get("sourceRelativePath") or "",
        "sourcePath": source_path,
        "thumbnailPath": thumbnail_path,
        "thumbnailUri": file_uri(thumbnail_path),
        "qualityFlags": sample.get("qualityFlags") or [],
        "score": sample.get("score") or 0,
        "revealSourceCommand": sample.get("revealSourceCommand") or (f"open -R {shell_quote(source_path)}" if source_path else ""),
    }


def build_decision_worksheet(group_id: str, commands: dict[str, Any], rec: dict[str, str]) -> list[dict[str, str]]:
    route_command = str(commands.get("routeGroupReview") or "")
    keep_command = str(commands.get("keepGroup4") or "")
    reject_command = str(commands.get("rejectGroup") or "")
    return [
        {
            "step": "1",
            "label": "Safe first action",
            "decision": "Route to review",
            "why": rec["tone"],
            "command": route_command,
            "safety": "Metadata-only. Use when the group still needs human/source inspection.",
        },
        {
            "step": "2",
            "label": "After inspection",
            "decision": "Mark keepers",
            "why": f"Use only if {group_id} is clearly worth continuing toward proof/export.",
            "command": keep_command,
            "safety": "Metadata-only. Does not copy, export, deliver, or mutate originals.",
        },
        {
            "step": "3",
            "label": "After inspection",
            "decision": "Reject the group",
            "why": f"Use only if {group_id} is clearly not useful after source-aware review.",
            "command": reject_command,
            "safety": "Metadata-only reject. It never deletes source photos.",
        },
    ]


def build_packet(photo_root: Path, limit: int) -> dict[str, Any]:
    pointer, batch, batch_path = load_latest_review_batch(photo_root)
    groups = [group for group in (batch.get("groups") or []) if isinstance(group, dict)]
    selected = groups[: max(1, limit)]
    suggestions: list[dict[str, Any]] = []
    for rank, group in enumerate(selected, start=1):
        rec = recommendation_for(group)
        commands = group.get("commands") if isinstance(group.get("commands"), dict) else {}
        group_id = str(group.get("groupId") or "")
        samples = [sample_card(sample) for sample in (group.get("samples") or []) if isinstance(sample, dict)]
        suggestions.append({
            "rank": rank,
            "groupId": group_id,
            "priority": group.get("priority") or "review",
            "recommendedReviewMode": group.get("recommendedReviewMode") or "compare-group",
            "recommendation": rec["recommendation"],
            "suggestedMetadataStatus": rec["suggestedMetadataStatus"],
            "reason": rec["reason"],
            "tone": rec["tone"],
            "flaggedCount": group.get("flaggedCount") or 0,
            "qualityFlags": group.get("qualityFlags") or [],
            "sampleCount": len(samples),
            "samples": samples,
            "safeLocalCommands": [
                {"label": "Route group to review", "command": str(commands.get("routeGroupReview") or ""), "safety": "Metadata-only review routing; originals are untouched."},
                {"label": "Keep group after inspection", "command": str(commands.get("keepGroup4") or ""), "safety": "Use only after human/source inspection; metadata-only."},
                {"label": "Reject group after inspection", "command": str(commands.get("rejectGroup") or ""), "safety": "Use only after human/source inspection; metadata-only; no delete."},
            ],
            "decisionWorksheet": build_decision_worksheet(group_id, commands, rec),
            "truth": "Cull suggestion only. This is not an automatic keep/reject verdict.",
        })
    counts = batch.get("counts") if isinstance(batch.get("counts"), dict) else {}
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": "first-pass-cull-suggestions-ready",
        "photoRoot": str(photo_root),
        "sourceReviewBatchPointer": str(photo_root / "latest-photo-grove-review-batch.json"),
        "sourceReviewBatchJson": str(batch_path),
        "sourceReviewBatchHtml": pointer.get("htmlPath") or batch.get("htmlPath") or "",
        "sessionDir": pointer.get("sessionDir") or batch.get("sessionDir") or "",
        "truth": "Cull suggestions only. Originals are never mutated, moved, deleted, exported, uploaded, published, or delivered.",
        "counts": {
            "suggestionGroups": len(suggestions),
            "sourceGroups": len(groups),
            "pending": counts.get("pending", 0),
            "selectedForClientProof": counts.get("selectedForClientProof", 0),
            "originalsMutated": False,
            "metadataChanged": False,
            "externalPublishing": False,
            "clientDeliveryCreated": False,
        },
        "suggestions": suggestions,
        "nextSafestAction": "Open the first suggestion group, inspect thumbnails/source files, then record metadata-only review decisions after human judgment.",
    }


def prepare_output_dir(packet: dict[str, Any], photo_root: Path) -> Path:
    session_dir = Path(str(packet.get("sessionDir") or ""))
    base_root = session_dir if session_dir.exists() else photo_root
    out_dir = base_root / "cull-suggestions" / stamp()
    counter = 2
    base = out_dir
    while out_dir.exists():
        out_dir = Path(f"{base}-{counter}")
        counter += 1
    out_dir.mkdir(parents=True, exist_ok=False)
    return out_dir


def write_csv(path: Path, packet: dict[str, Any]) -> None:
    fields = [
        "rank",
        "groupId",
        "priority",
        "recommendation",
        "sampleCount",
        "flaggedCount",
        "reason",
        "safeFirstAction",
        "routeReviewCommand",
        "keepAfterInspectionCommand",
        "rejectAfterInspectionCommand",
    ]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for group in packet.get("suggestions") or []:
            commands = group.get("safeLocalCommands") if isinstance(group.get("safeLocalCommands"), list) else []
            worksheet = group.get("decisionWorksheet") if isinstance(group.get("decisionWorksheet"), list) else []
            route = commands[0].get("command") if commands and isinstance(commands[0], dict) else ""
            keep = commands[1].get("command") if len(commands) > 1 and isinstance(commands[1], dict) else ""
            reject = commands[2].get("command") if len(commands) > 2 and isinstance(commands[2], dict) else ""
            writer.writerow({
                "rank": group.get("rank", ""),
                "groupId": group.get("groupId", ""),
                "priority": group.get("priority", ""),
                "recommendation": group.get("recommendation", ""),
                "sampleCount": group.get("sampleCount", ""),
                "flaggedCount": group.get("flaggedCount", ""),
                "reason": group.get("reason", ""),
                "safeFirstAction": worksheet[0].get("decision") if worksheet and isinstance(worksheet[0], dict) else "Route to review",
                "routeReviewCommand": route,
                "keepAfterInspectionCommand": keep,
                "rejectAfterInspectionCommand": reject,
            })


def write_markdown(path: Path, packet: dict[str, Any]) -> None:
    lines = [
        "# Photo Grove first-pass cull suggestions",
        "",
        f"Generated: `{packet['generatedAt']}`",
        "",
        packet["truth"],
        "",
        f"Next safest action: {packet['nextSafestAction']}",
        "",
        f"Source review batch: `{packet['sourceReviewBatchJson']}`",
        f"Source review batch HTML: `{packet['sourceReviewBatchHtml']}`",
        "",
    ]
    for group in packet.get("suggestions") or []:
        lines.extend([
            f"## {group['rank']}. {group['groupId']} - {group['recommendation']}",
            "",
            f"- Priority: `{group['priority']}`",
            f"- Reason: {group['reason']}",
            f"- Guidance: {group['tone']}",
            f"- Samples: `{group['sampleCount']}`",
            f"- Flagged: `{group['flaggedCount']}`",
            "",
            "### Safe local commands",
            "",
        ])
        for command in group.get("safeLocalCommands") or []:
            if command.get("command"):
                lines.append(f"- `{command.get('command')}` - {command.get('safety')}")
        lines.extend(["", "### Draft decision worksheet", ""])
        for row in group.get("decisionWorksheet") or []:
            lines.append(f"- Step {row.get('step')}: **{row.get('decision')}** - {row.get('why')}")
            if row.get("command"):
                lines.append(f"  - `{row.get('command')}`")
        lines.extend(["", "### Samples", ""])
        for sample in group.get("samples") or []:
            flags = ", ".join(sample.get("qualityFlags") or [])
            lines.append(f"- `{sample.get('filename')}` - `{sample.get('sourceRelativePath')}` - {flags}")
        lines.append("")
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def write_html(path: Path, packet: dict[str, Any]) -> None:
    sections: list[str] = []
    for group in packet.get("suggestions") or []:
        samples_html = []
        for sample in group.get("samples") or []:
            img = f"<img src=\"{esc(sample.get('thumbnailUri'))}\" alt=\"{esc(sample.get('filename'))}\">" if sample.get("thumbnailUri") else "<div class=\"missing\">No thumbnail</div>"
            flags = " ".join(f"<span>{esc(flag)}</span>" for flag in sample.get("qualityFlags") or [])
            samples_html.append(f"""
            <figure>
              {img}
              <figcaption><strong>{esc(sample.get('filename'))}</strong><small>{esc(sample.get('sourceRelativePath'))}</small><div>{flags}</div></figcaption>
            </figure>
            """)
        commands_html = "".join(
            f"<div class=\"command\"><strong>{esc(command.get('label'))}</strong><code>{esc(command.get('command'))}</code><p>{esc(command.get('safety'))}</p></div>"
            for command in group.get("safeLocalCommands") or []
            if command.get("command")
        )
        worksheet_html = "".join(
            f"""
            <div class="worksheet-row">
              <span>{esc(row.get('step'))}</span>
              <div><strong>{esc(row.get('decision'))}</strong><p>{esc(row.get('why'))}</p><code>{esc(row.get('command'))}</code><small>{esc(row.get('safety'))}</small></div>
            </div>
            """
            for row in group.get("decisionWorksheet") or []
            if row.get("command")
        )
        sections.append(f"""
        <article class="group-card">
          <div class="group-head">
            <div><div class="eyebrow">#{esc(group['rank'])} · {esc(group['priority'])}</div><h2>{esc(group['groupId'])}</h2></div>
            <span class="status">{esc(group['recommendation'])}</span>
          </div>
          <p>{esc(group['tone'])}</p>
          <div class="chips"><span>{esc(group['sampleCount'])} samples</span><span>{esc(group['flaggedCount'])} flagged</span><span>{esc(group['suggestedMetadataStatus'])}</span></div>
          <section class="worksheet"><h3>Reviewer worksheet</h3>{worksheet_html}</section>
          <div class="samples">{''.join(samples_html)}</div>
          <details><summary>Metadata-only commands</summary>{commands_html}</details>
        </article>
        """)
    html_text = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Photo Grove Cull Suggestions</title>
  <style>
    :root {{ color-scheme:dark; --bg:#11170f; --panel:#1c2619; --ink:#fff1d4; --muted:#d6c5a2; --moss:#9bc374; --fern:#65c389; --gold:#ecc65d; --water:#7ccbd9; --clay:#c87656; --line:rgba(255,241,212,.15); }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; color:var(--ink); font-family:Avenir Next, Helvetica Neue, sans-serif; background:radial-gradient(circle at 16% -8%, rgba(155,195,116,.23), transparent 34%), linear-gradient(180deg,#162115,#0c100b); }}
    header {{ padding:42px clamp(22px,5vw,82px); border-bottom:1px solid var(--line); }}
    .eyebrow {{ color:var(--gold); text-transform:uppercase; letter-spacing:.2em; font-size:12px; font-weight:900; }}
    h1 {{ margin:10px 0; font-size:clamp(42px,7vw,84px); line-height:.92; max-width:1120px; }}
    h2 {{ margin:5px 0 0; font-size:28px; }}
    h3 {{ margin:0 0 10px; color:var(--moss); text-transform:uppercase; letter-spacing:.14em; font-size:12px; }}
    p {{ color:var(--muted); line-height:1.5; }}
    .summary, .chips {{ display:flex; flex-wrap:wrap; gap:10px; margin-top:16px; }}
    .summary span, .chips span, .status {{ border:1px solid var(--line); border-radius:999px; padding:8px 11px; background:rgba(255,255,255,.055); color:var(--muted); font-weight:850; }}
    main {{ padding:26px clamp(14px,4vw,58px) 72px; display:grid; gap:18px; }}
    .group-card {{ border:1px solid var(--line); border-radius:28px; padding:20px; background:linear-gradient(180deg,rgba(28,38,25,.97),rgba(10,14,8,.98)); box-shadow:0 24px 68px rgba(0,0,0,.3); }}
    .group-head {{ display:flex; justify-content:space-between; gap:16px; align-items:flex-start; }}
    .status {{ color:var(--water); }}
    .samples {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:12px; margin-top:18px; }}
    .worksheet {{ margin-top:18px; border:1px solid var(--line); border-radius:20px; padding:14px; background:rgba(0,0,0,.18); }}
    .worksheet-row {{ display:grid; grid-template-columns:34px 1fr; gap:10px; padding:10px 0; border-top:1px solid var(--line); }}
    .worksheet-row:first-of-type {{ border-top:0; }}
    .worksheet-row > span {{ width:28px; height:28px; border-radius:50%; display:grid; place-items:center; background:rgba(236,198,93,.16); color:var(--gold); font-weight:950; }}
    .worksheet-row p {{ margin:4px 0; }}
    .worksheet-row small {{ color:var(--muted); display:block; margin-top:4px; }}
    figure {{ margin:0; border:1px solid var(--line); border-radius:18px; overflow:hidden; background:rgba(0,0,0,.25); }}
    img {{ width:100%; aspect-ratio:3/2; object-fit:cover; display:block; background:#000; }}
    figcaption {{ padding:10px; display:grid; gap:4px; }}
    small {{ color:var(--muted); overflow-wrap:anywhere; }}
    figcaption span {{ display:inline-block; margin:3px 3px 0 0; color:#f1ad86; font-size:10px; border:1px solid rgba(241,173,134,.35); border-radius:999px; padding:3px 6px; }}
    details {{ margin-top:16px; }}
    summary {{ cursor:pointer; font-weight:900; }}
    .command {{ border:1px solid var(--line); border-radius:15px; margin-top:10px; padding:10px; background:rgba(0,0,0,.22); }}
    code {{ display:block; color:var(--water); overflow-wrap:anywhere; margin-top:5px; }}
    .missing {{ aspect-ratio:3/2; display:grid; place-items:center; color:var(--muted); }}
  </style>
</head>
<body>
  <header>
    <div class="eyebrow">Quipsly Photo Grove</div>
    <h1>First-pass culling without pretending the machine is the photographer.</h1>
    <p>{esc(packet['truth'])}</p>
    <p>{esc(packet['nextSafestAction'])}</p>
    <div class="summary">
      <span>{packet['counts']['suggestionGroups']} suggestion groups</span>
      <span>{packet['counts']['pending']} pending photos</span>
      <span>{packet['counts']['selectedForClientProof']} selected for proof</span>
      <span>0 originals mutated</span>
    </div>
  </header>
  <main>{''.join(sections)}</main>
</body>
</html>
"""
    path.write_text(html_text, encoding="utf-8")


def update_pointer(photo_root: Path, output_dir: Path, packet: dict[str, Any], html_path: Path, json_path: Path, markdown_path: Path, csv_path: Path) -> None:
    suggestions = packet.get("suggestions") if isinstance(packet.get("suggestions"), list) else []
    first_group = suggestions[0] if suggestions and isinstance(suggestions[0], dict) else {}
    first_commands = first_group.get("safeLocalCommands") if isinstance(first_group.get("safeLocalCommands"), list) else []
    first_metadata_command = ""
    for command in first_commands:
        if isinstance(command, dict) and command.get("command"):
            first_metadata_command = str(command.get("command"))
            break
    pointer = {
        "schema": "quipsly.photo-grove.latest-cull-suggestions.v1",
        "updatedAt": iso_now(),
        "status": packet.get("status") or "first-pass-cull-suggestions-ready",
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "sessionDir": packet.get("sessionDir") or "",
        "outputDir": str(output_dir),
        "counts": packet.get("counts") or {},
        "humanAsk": "Open the cull suggestions, compare thumbnails/source files, and record only metadata decisions after visual review.",
        "agentSafeParallelWork": "Codex may improve suggestion grouping, notes, quality hints, and dry-run decision commands. Do not mutate originals, change metadata decisions, export, deliver, upload, publish, delete, or overwrite.",
        "nextSafestAction": packet.get("nextSafestAction") or "",
        "firstSafeAction": {
            "label": "Open Photo Grove cull suggestions",
            "command": f"open {shell_quote(str(html_path))}",
            "path": str(html_path),
            "safety": "Opens local cull evidence only. No metadata decision, export, delivery, upload, publication, or source mutation occurs.",
        },
        "firstMetadataCommand": first_metadata_command,
        "firstMetadataCommandSafety": "Metadata-only routing after visual/source review; never deletes, moves, exports, or mutates original photos.",
        "truth": packet.get("truth") or "",
        "originalsMutated": False,
        "metadataChanged": False,
        "externalPublishing": False,
        "clientDeliveryCreated": False,
    }
    write_json(photo_root / "latest-photo-grove-cull-suggestions.json", pointer)


def main() -> None:
    parser = argparse.ArgumentParser(description="Build Photo Grove first-pass cull suggestions.")
    parser.add_argument("limit", nargs="?", type=int, default=8)
    parser.add_argument("--photo-root", default=str(DEFAULT_PHOTO_ROOT))
    args = parser.parse_args()

    photo_root = Path(args.photo_root)
    packet = build_packet(photo_root, args.limit)
    output_dir = prepare_output_dir(packet, photo_root)
    json_path = output_dir / "photo-cull-suggestions.json"
    html_path = output_dir / "index.html"
    markdown_path = output_dir / "START-HERE-photo-cull-suggestions.md"
    csv_path = output_dir / "photo-cull-suggestions.csv"
    packet.update({
        "outputDir": str(output_dir),
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
    })
    write_json(json_path, packet)
    write_markdown(markdown_path, packet)
    write_csv(csv_path, packet)
    write_html(html_path, packet)
    update_pointer(photo_root, output_dir, packet, html_path, json_path, markdown_path, csv_path)
    print(json.dumps({
        "status": "ok",
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "counts": packet.get("counts"),
    }, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
