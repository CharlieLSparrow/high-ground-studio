#!/usr/bin/env python3
"""Build a metadata-only Photo Grove cull command sheet."""
from __future__ import annotations

import argparse
import csv
import html
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_PHOTO_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove")
SCHEMA = "quipsly.photo-grove-command-sheet.v2"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f")


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except json.JSONDecodeError:
        return {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def image_uri(path_value: Any) -> str:
    path = Path(str(path_value or ""))
    if not path.is_absolute():
        return ""
    try:
        return path.as_uri()
    except ValueError:
        return ""


def latest_cull_packet(photo_root: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    pointer = load_json(photo_root / "latest-photo-grove-cull-suggestions.json")
    packet_path = Path(str(pointer.get("jsonPath") or "")) if pointer.get("jsonPath") else Path("")
    packet = load_json(packet_path) if packet_path else {}
    return pointer, packet


def normalize_sample(sample: dict[str, Any]) -> dict[str, Any]:
    thumbnail_path = str(sample.get("thumbnailPath") or "")
    source_path = str(sample.get("sourcePath") or sample.get("path") or "")
    quality_flags = sample.get("qualityFlags") if isinstance(sample.get("qualityFlags"), list) else []
    reveal_command = sample.get("revealSourceCommand") or (f"open -R {shell_quote(source_path)}" if source_path else "")
    return {
        "id": sample.get("id") or "",
        "filename": sample.get("filename") or sample.get("fileName") or Path(source_path).name,
        "sourcePath": source_path,
        "sourceRelativePath": sample.get("sourceRelativePath") or "",
        "thumbnailPath": thumbnail_path,
        "thumbnailUri": sample.get("thumbnailUri") or image_uri(thumbnail_path),
        "qualityFlags": [str(flag) for flag in quality_flags],
        "score": sample.get("score"),
        "revealSourceCommand": reveal_command,
    }


def group_evidence(group: dict[str, Any], group_id: str) -> dict[str, Any]:
    samples = [normalize_sample(sample) for sample in (group.get("samples") or []) if isinstance(sample, dict)]
    quality_flags = group.get("qualityFlags") if isinstance(group.get("qualityFlags"), list) else []
    first_source = next((sample["sourcePath"] for sample in samples if sample.get("sourcePath")), "")
    first_reveal = next((sample["revealSourceCommand"] for sample in samples if sample.get("revealSourceCommand")), "")
    recommendation = str(group.get("recommendation") or "review")
    reason = str(group.get("reason") or "Review this group before changing metadata.")
    sample_count = group.get("sampleCount")
    if not isinstance(sample_count, int):
        sample_count = len(samples)
    flagged_count = group.get("flaggedCount")
    if not isinstance(flagged_count, int):
        flagged_count = sum(1 for sample in samples if sample.get("qualityFlags"))
    review_prompt = (
        f"Open {group_id}, compare {sample_count} sample frame(s), and decide metadata-only routing. "
        "Do not reject or deliver from thumbnail evidence alone."
    )
    return {
        "groupId": group_id,
        "priority": group.get("priority") or "",
        "rank": group.get("rank") or "",
        "tone": group.get("tone") or "",
        "recommendation": recommendation,
        "recommendedReviewMode": group.get("recommendedReviewMode") or "",
        "reason": reason,
        "sampleCount": sample_count,
        "flaggedCount": flagged_count,
        "qualityFlags": [str(flag) for flag in quality_flags],
        "samples": samples[:8],
        "sampleFilenames": ", ".join(sample.get("filename") or "" for sample in samples[:8] if sample.get("filename")),
        "sampleSourcePaths": "\n".join(sample.get("sourcePath") or "" for sample in samples[:8] if sample.get("sourcePath")),
        "sampleThumbnailPaths": "\n".join(sample.get("thumbnailPath") or "" for sample in samples[:8] if sample.get("thumbnailPath")),
        "openCommand": first_reveal or (f"open -R {shell_quote(first_source)}" if first_source else ""),
        "reviewPrompt": review_prompt,
    }


def build_rows(packet: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for group in packet.get("suggestions") or []:
        if not isinstance(group, dict):
            continue
        group_id = str(group.get("groupId") or group.get("id") or "unknown-group")
        evidence = group_evidence(group, group_id)
        for worksheet in group.get("decisionWorksheet") or []:
            if not isinstance(worksheet, dict):
                continue
            rows.append({
                "groupId": group_id,
                "priority": evidence["priority"],
                "rank": evidence["rank"],
                "tone": evidence["tone"],
                "recommendation": evidence["recommendation"],
                "recommendedReviewMode": evidence["recommendedReviewMode"],
                "reason": evidence["reason"],
                "sampleCount": evidence["sampleCount"],
                "flaggedCount": evidence["flaggedCount"],
                "qualityFlags": evidence["qualityFlags"],
                "samples": evidence["samples"],
                "sampleFilenames": evidence["sampleFilenames"],
                "sampleSourcePaths": evidence["sampleSourcePaths"],
                "sampleThumbnailPaths": evidence["sampleThumbnailPaths"],
                "openCommand": evidence["openCommand"],
                "reviewPrompt": evidence["reviewPrompt"],
                "step": worksheet.get("step") or "",
                "label": worksheet.get("label") or "",
                "decision": worksheet.get("decision") or "",
                "why": worksheet.get("why") or "",
                "safety": worksheet.get("safety") or "Metadata-only. Originals stay untouched.",
                "command": worksheet.get("command") or "",
            })
    return rows


def review_contract(command_rows: list[dict[str, Any]]) -> dict[str, Any]:
    group_count = len({row.get("groupId") for row in command_rows})
    return {
        "humanAsk": (
            "Open the source evidence for a group, compare the sample frames, then run only the metadata command "
            "that matches the reviewer intent. Never reject, deliver, or publish from command-sheet evidence alone."
        ),
        "agentSafeParallelWork": (
            "Prepare group summaries, reveal commands, dry-run command notes, and reviewer instructions. Do not run "
            "metadata commands, copy deliverables, delete, upload, publish, schedule, overwrite, or mutate originals."
        ),
        "reviewContract": {
            "stateTruth": "This sheet is a metadata-command menu, not an automatic cull.",
            "groups": group_count,
            "commands": len(command_rows),
            "allowedWithoutApproval": [
                "open local evidence",
                "copy commands for review",
                "summarize command intent",
                "prepare dry-run/review notes",
            ],
            "requiresHumanApproval": [
                "execute metadata command",
                "copy/export proof deliverables",
                "publish, upload, schedule, delete, overwrite, or mutate originals",
            ],
            "notProofOf": [
                "photo approval",
                "client delivery",
                "external publication",
                "source quality certainty",
            ],
        },
        "sourceTasks": [
            "Open first sample/source.",
            "Compare all samples in the group.",
            "Decide intent: review, keep, favorite, or reject.",
            "Run metadata command only after visual/source review.",
            "Rebuild Decision Desk so the OS runway sees the updated sidecar truth.",
        ],
    }


def render_html(payload: dict[str, Any]) -> str:
    rows = []
    for row in payload["commandRows"]:
        flags = "".join(f"<span>{html.escape(str(flag))}</span>" for flag in row.get("qualityFlags") or [])
        samples = []
        for sample in row.get("samples") or []:
            thumb = sample.get("thumbnailUri") or ""
            img = f"<img src=\"{html.escape(thumb)}\" alt=\"{html.escape(sample.get('filename') or 'photo sample')}\" />" if thumb else "<div class=\"thumb-empty\">No thumb</div>"
            sample_flags = " ".join(str(flag) for flag in sample.get("qualityFlags") or [])
            samples.append(f"""
            <figure>
              {img}
              <figcaption>
                <strong>{html.escape(sample.get('filename') or 'sample')}</strong>
                <small>{html.escape(sample_flags or 'source sample')}</small>
              </figcaption>
            </figure>
            """)
        rows.append(f"""
        <article class=\"row step-{html.escape(str(row['step']))}\">
          <div class=\"top\"><span>{html.escape(row['groupId'])}</span><span>Step {html.escape(str(row['step']))} - {html.escape(row['label'])}</span></div>
          <h2>{html.escape(row['decision'])}</h2>
          <div class=\"facts\">
            <span>{html.escape(str(row.get('sampleCount') or 0))} samples</span>
            <span>{html.escape(str(row.get('flaggedCount') or 0))} flagged</span>
            <span>{html.escape(str(row.get('recommendation') or 'review'))}</span>
          </div>
          <p class=\"prompt\">{html.escape(row.get('reviewPrompt') or '')}</p>
          <p>{html.escape(row.get('reason') or '')}</p>
          <p>{html.escape(row['why'])}</p>
          <p class=\"safety\">{html.escape(row['safety'])}</p>
          <div class=\"flags\">{flags}</div>
          <section class=\"samples\">{''.join(samples) if samples else '<p>No samples carried in the suggestion packet.</p>'}</section>
          <p class=\"label\">Open first sample/source</p>
          <pre>{html.escape(row.get('openCommand') or '')}</pre>
          <p class=\"label\">Apply metadata-only decision</p>
          <pre>{html.escape(row['command'])}</pre>
        </article>
        """)
    return f"""<!doctype html>
<html lang=\"en\">
<head>
  <meta charset=\"utf-8\" />
  <title>Photo Grove command sheet</title>
  <style>
    :root {{ --bg:#111811; --panel:#1b271d; --ink:#f5efd9; --muted:#c0b69c; --moss:#87b86b; --gold:#e7c95c; --clay:#c77858; --line:rgba(245,239,217,.16); }}
    body {{ margin:0; background:radial-gradient(circle at 12% 0%, rgba(135,184,107,.2), transparent 34%), var(--bg); color:var(--ink); font-family:Avenir Next, Helvetica Neue, sans-serif; }}
    header {{ padding:34px clamp(20px,5vw,72px); border-bottom:1px solid var(--line); }}
    .eyebrow {{ color:var(--gold); font-weight:900; letter-spacing:.2em; text-transform:uppercase; font-size:12px; }}
    h1 {{ margin:10px 0; font-size:clamp(34px,6vw,72px); line-height:.92; max-width:980px; }}
    header p {{ color:var(--muted); max-width:900px; line-height:1.5; }}
    .contract {{ margin-top:20px; max-width:960px; border:1px solid var(--line); border-radius:22px; padding:16px; background:rgba(255,255,255,.045); }}
    .contract h2 {{ margin:0 0 8px; color:var(--gold); font-size:17px; }}
    main {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(420px,1fr)); gap:16px; padding:24px clamp(16px,4vw,56px) 70px; }}
    .row {{ border:1px solid var(--line); border-radius:22px; background:linear-gradient(180deg, rgba(27,39,29,.95), rgba(10,15,11,.98)); padding:18px; }}
    .step-1 {{ border-color:rgba(231,201,92,.46); }}
    .step-2 {{ border-color:rgba(135,184,107,.46); }}
    .step-3 {{ border-color:rgba(199,120,88,.46); }}
    .top {{ display:flex; justify-content:space-between; gap:10px; color:var(--gold); text-transform:uppercase; letter-spacing:.1em; font-size:11px; font-weight:900; }}
    p {{ color:var(--muted); line-height:1.45; }}
    .prompt {{ color:var(--ink); font-weight:800; }}
    .safety {{ color:var(--moss); font-weight:800; }}
    .facts,.flags {{ display:flex; flex-wrap:wrap; gap:8px; margin:12px 0; }}
    .facts span,.flags span {{ border:1px solid var(--line); border-radius:999px; padding:5px 9px; color:var(--muted); background:rgba(255,255,255,.04); font-size:12px; font-weight:800; }}
    .flags span {{ color:var(--gold); }}
    .samples {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(112px,1fr)); gap:10px; margin:14px 0; }}
    figure {{ margin:0; border:1px solid var(--line); border-radius:14px; overflow:hidden; background:rgba(0,0,0,.22); }}
    img,.thumb-empty {{ width:100%; aspect-ratio:4/3; object-fit:cover; display:block; background:#070907; color:var(--muted); font-size:12px; display:grid; place-items:center; }}
    figcaption {{ padding:8px; display:grid; gap:3px; }}
    figcaption strong {{ font-size:12px; overflow-wrap:anywhere; }}
    figcaption small {{ color:var(--muted); font-size:10px; overflow-wrap:anywhere; }}
    .label {{ margin:12px 0 4px; color:var(--gold); text-transform:uppercase; letter-spacing:.12em; font-size:11px; font-weight:900; }}
    pre {{ white-space:pre-wrap; overflow-wrap:anywhere; background:rgba(0,0,0,.28); border-radius:14px; padding:12px; color:var(--ink); }}
  </style>
</head>
<body>
  <header>
    <div class=\"eyebrow\">Photo Grove command sheet</div>
    <h1>Route the cull without touching the originals.</h1>
    <p>This sheet pulls the safe metadata-only commands out of the latest cull suggestions. It is for review routing, not automatic judgment. No originals are changed, copied, delivered, or published.</p>
    <section class=\"contract\">
      <h2>Human ask</h2>
      <p>{html.escape(payload.get('humanAsk') or '')}</p>
      <h2>Codex can safely do</h2>
      <p>{html.escape(payload.get('agentSafeParallelWork') or '')}</p>
      <details><summary>Review contract</summary><pre>{html.escape(json.dumps(payload.get('reviewContract') or {}, indent=2))}</pre></details>
    </section>
  </header>
  <main>{''.join(rows) if rows else '<article class="row"><h2>No command rows</h2><p>Generate cull suggestions first.</p></article>'}</main>
</body>
</html>"""


def write_markdown(session_dir: Path, payload: dict[str, Any]) -> None:
    lines = [
        "# Photo Grove command sheet",
        "",
        f"Generated: `{payload['generatedAt']}`",
        "",
        payload["truth"],
        "",
        "## Human ask",
        "",
        payload.get("humanAsk") or "",
        "",
        "## Codex can safely do",
        "",
        payload.get("agentSafeParallelWork") or "",
        "",
        "## Review contract",
        "",
        "```json",
        json.dumps(payload.get("reviewContract") or {}, indent=2, sort_keys=True),
        "```",
        "",
    ]
    for row in payload["commandRows"]:
        lines.extend([
            f"## {row['groupId']} - {row['decision']}",
            "",
            f"- Recommendation: `{row.get('recommendation') or 'review'}`",
            f"- Review prompt: {row.get('reviewPrompt') or ''}",
            f"- Samples: `{row.get('sampleCount') or 0}`",
            f"- Flagged: `{row.get('flaggedCount') or 0}`",
            f"- Quality flags: {', '.join(row.get('qualityFlags') or []) or 'none carried'}",
            f"- Sample files: {row.get('sampleFilenames') or 'none carried'}",
            f"- Step: `{row['step']}`",
            f"- Label: {row['label']}",
            f"- Group reason: {row.get('reason') or ''}",
            f"- Why: {row['why']}",
            f"- Safety: {row['safety']}",
            "",
            "Open first sample/source:",
            "",
            "```bash",
            row.get("openCommand") or "",
            "```",
            "",
            "Sample source paths:",
            "",
            "```text",
            row.get("sampleSourcePaths") or "",
            "```",
            "",
            "Apply metadata-only decision:",
            "",
            "```bash",
            row["command"],
            "```",
            "",
        ])
    (session_dir / "START-HERE-photo-grove-command-sheet.md").write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def write_csv(session_dir: Path, payload: dict[str, Any]) -> None:
    with (session_dir / "photo-grove-command-sheet.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=[
            "groupId",
            "priority",
            "rank",
            "recommendation",
            "recommendedReviewMode",
            "sampleCount",
            "flaggedCount",
            "sampleFilenames",
            "sampleSourcePaths",
            "sampleThumbnailPaths",
            "reviewPrompt",
            "reason",
            "step",
            "label",
            "decision",
            "why",
            "safety",
            "openCommand",
            "command",
        ], extrasaction="ignore")
        writer.writeheader()
        writer.writerows(payload["commandRows"])


def build(photo_root: Path) -> tuple[Path, dict[str, Any]]:
    pointer, packet = latest_cull_packet(photo_root)
    session_dir = photo_root / "CommandSheets" / f"{stamp()}-photo-grove-command-sheet"
    session_dir.mkdir(parents=True, exist_ok=True)
    html_path = session_dir / "index.html"
    json_path = session_dir / "photo-grove-command-sheet.json"
    markdown_path = session_dir / "START-HERE-photo-grove-command-sheet.md"
    csv_path = session_dir / "photo-grove-command-sheet.csv"
    command_rows = build_rows(packet)
    contract = review_contract(command_rows)
    first_action = next((row for row in command_rows if str(row.get("step")) == "1"), command_rows[0] if command_rows else {})
    first_source_path = str(first_action.get("sampleSourcePaths") or "").splitlines()[0] if first_action.get("sampleSourcePaths") else ""
    first_evidence_action = {
        "groupId": first_action.get("groupId") or "",
        "decision": "Open source evidence",
        "reviewPrompt": first_action.get("reviewPrompt") or "",
        "path": first_source_path,
        "openCommand": first_action.get("openCommand") or "",
        "command": first_action.get("openCommand") or "",
        "metadataCommand": first_action.get("command") or "",
        "safety": "Opens/reveals local source evidence only. No metadata decision, export, delivery, upload, publication, or source mutation occurs.",
    }
    first_safe_action = {
        "label": "Open Photo Grove command sheet",
        "path": str(html_path),
        "command": f"open {shell_quote(str(html_path))}",
        "safety": "Opens the local Photo Grove command sheet only. No metadata command executes, originals stay untouched, and no export/delivery/publication truth is created.",
    }
    status = "command-sheet-ready" if command_rows else "empty-command-sheet"
    next_safest_action = (
        f"Open the command sheet, then compare {first_evidence_action['groupId']} source/thumbnail evidence before any metadata-only command."
        if first_evidence_action["groupId"]
        else "Generate cull suggestions first, then rebuild the command sheet."
    )
    payload = {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "photoRoot": str(photo_root),
        "sourceCullSuggestionHtml": pointer.get("htmlPath") or "",
        "sourceCullSuggestionJson": pointer.get("jsonPath") or "",
        "sessionDir": str(session_dir),
        "status": status,
        "nextSafestAction": next_safest_action,
        "humanAsk": contract["humanAsk"],
        "agentSafeParallelWork": contract["agentSafeParallelWork"],
        "reviewContract": contract["reviewContract"],
        "sourceTasks": contract["sourceTasks"],
        "firstSafeAction": first_safe_action,
        "firstEvidenceAction": first_evidence_action,
        "firstReviewCommand": first_evidence_action["openCommand"],
        "firstCullCommand": first_evidence_action["metadataCommand"],
        "metadataCommandSafety": first_action.get("safety") or "Metadata-only after visual/source review; originals stay untouched.",
        "truth": "Photo Grove command sheet only. Commands are metadata-only suggestions; nothing is executed, originals stay untouched, and no client delivery/publication is created.",
        "commandRows": command_rows,
        "counts": {
            "groups": len({row["groupId"] for row in command_rows}),
            "commands": len(command_rows),
            "safeFirstActions": sum(1 for row in command_rows if str(row.get("step")) == "1"),
            "metadataChanged": False,
            "originalsMutated": False,
            "clientDeliveryCreated": False,
            "externalPublishing": False,
        },
    }
    write_json(json_path, payload)
    html_path.write_text(render_html(payload), encoding="utf-8")
    write_markdown(session_dir, payload)
    write_csv(session_dir, payload)
    latest = {
        "schema": "quipsly.photo-grove-command-sheet.latest-pointer.v1",
        "updatedAt": iso_now(),
        "latestSessionDir": str(session_dir),
        "status": status,
        "nextSafestAction": next_safest_action,
        "humanAsk": payload["humanAsk"],
        "agentSafeParallelWork": payload["agentSafeParallelWork"],
        "reviewContract": payload["reviewContract"],
        "sourceTasks": payload["sourceTasks"],
        "firstSafeAction": first_safe_action,
        "firstEvidenceAction": first_evidence_action,
        "firstReviewCommand": first_evidence_action["openCommand"],
        "firstCullCommand": first_evidence_action["metadataCommand"],
        "metadataCommandSafety": payload["metadataCommandSafety"],
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "counts": payload["counts"],
        "truth": {
            "metadataChanged": False,
            "originalsMutated": False,
            "sourceFilesMutated": False,
            "clientDeliveryCreated": False,
            "externalPublishing": False,
            "externalSchedulesCreated": False,
            "receiptTruthCreated": False,
        },
        "metadataChanged": False,
        "originalsMutated": False,
        "clientDeliveryCreated": False,
        "externalPublishing": False,
    }
    write_json(photo_root / "latest-photo-grove-command-sheet.json", latest)
    return session_dir, payload


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a Photo Grove cull command sheet.")
    parser.add_argument("photo_root", nargs="?", default=str(DEFAULT_PHOTO_ROOT))
    args = parser.parse_args()
    session_dir, payload = build(Path(args.photo_root))
    print(json.dumps({
        "ok": True,
        "sessionDir": str(session_dir),
        "htmlPath": str(session_dir / "index.html"),
        "jsonPath": str(session_dir / "photo-grove-command-sheet.json"),
        "markdownPath": str(session_dir / "START-HERE-photo-grove-command-sheet.md"),
        "csvPath": str(session_dir / "photo-grove-command-sheet.csv"),
        "counts": payload["counts"],
        "status": payload["status"],
        "nextSafestAction": payload["nextSafestAction"],
        "humanAsk": payload["humanAsk"],
        "agentSafeParallelWork": payload["agentSafeParallelWork"],
        "firstSafeAction": payload["firstSafeAction"],
        "metadataCommandSafety": payload["metadataCommandSafety"],
        "firstReviewCommand": payload["firstReviewCommand"],
        "firstCullCommand": payload["firstCullCommand"],
        "truth": payload["truth"],
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
