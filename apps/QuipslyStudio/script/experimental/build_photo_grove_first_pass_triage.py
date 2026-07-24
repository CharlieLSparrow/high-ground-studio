#!/usr/bin/env python3
"""Build a calm first-pass Photo Grove triage deck from current command rows.

This artifact narrows the first culling pass without executing metadata commands
or claiming quality verdicts. It is an Aftershoot-like entry surface in Quipsly's
style: compare similar frames, inspect source when thumbnails look suspect, and
record explicit metadata-only decisions later.
"""
from __future__ import annotations

import argparse
import csv
import html
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_PHOTO_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove")
SCHEMA = "quipsly.photo-grove.first-pass-triage.v1"
LATEST_POINTER = "latest-photo-grove-first-pass-triage.json"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f")


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


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


def as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def as_text_list(value: Any) -> list[str]:
    return [str(item) for item in as_list(value) if str(item)]


def row_sort_key(row: dict[str, Any]) -> tuple[int, int, str]:
    rank = row.get("rank")
    flagged = row.get("flaggedCount")
    try:
        rank_i = int(rank)
    except (TypeError, ValueError):
        rank_i = 9999
    try:
        flagged_i = int(flagged)
    except (TypeError, ValueError):
        flagged_i = 0
    return (rank_i, -flagged_i, str(row.get("groupId") or ""))


def load_command_sheet(photo_root: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    pointer = load_json(photo_root / "latest-photo-grove-command-sheet.json")
    json_path = Path(str(pointer.get("jsonPath") or "")) if pointer.get("jsonPath") else Path("")
    packet = load_json(json_path) if json_path else {}
    return pointer, packet


def normalize_sample(sample: dict[str, Any]) -> dict[str, Any]:
    source_path = str(sample.get("sourcePath") or "")
    thumb_path = str(sample.get("thumbnailPath") or "")
    return {
        "id": str(sample.get("id") or ""),
        "filename": str(sample.get("filename") or Path(source_path).name),
        "sourcePath": source_path,
        "sourceRelativePath": str(sample.get("sourceRelativePath") or ""),
        "thumbnailPath": thumb_path,
        "thumbnailUri": str(sample.get("thumbnailUri") or (Path(thumb_path).as_uri() if thumb_path and Path(thumb_path).is_absolute() else "")),
        "qualityFlags": as_text_list(sample.get("qualityFlags")),
        "score": sample.get("score"),
        "revealSourceCommand": str(sample.get("revealSourceCommand") or (f"open -R {shell_quote(source_path)}" if source_path else "")),
    }


def group_rows(command_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in sorted(command_rows, key=row_sort_key):
        if not isinstance(row, dict):
            continue
        grouped[str(row.get("groupId") or "unknown-group")].append(row)

    triage_groups: list[dict[str, Any]] = []
    for group_id, rows in grouped.items():
        primary = rows[0]
        samples = [normalize_sample(sample) for sample in as_list(primary.get("samples")) if isinstance(sample, dict)]
        flags = sorted(set(as_text_list(primary.get("qualityFlags")) + [flag for sample in samples for flag in sample.get("qualityFlags", [])]))
        flagged_count = primary.get("flaggedCount") if isinstance(primary.get("flaggedCount"), int) else sum(1 for s in samples if s.get("qualityFlags"))
        sample_count = primary.get("sampleCount") if isinstance(primary.get("sampleCount"), int) else len(samples)
        first_source = next((s["sourcePath"] for s in samples if s.get("sourcePath")), "")
        first_reveal = next((s["revealSourceCommand"] for s in samples if s.get("revealSourceCommand")), "")
        priority = str(primary.get("priority") or "review")
        if "preview-suspect" in priority or any("preview" in flag for flag in flags):
            first_pass = "Open source files before trusting thumbnails. Treat this as inspection, not rejection."
        elif flagged_count:
            first_pass = "Compare the group visually and route only the obvious keep/review/reject intent as metadata later."
        else:
            first_pass = "Use this as a warm-up comparison group; no quality verdict is implied."
        directions = []
        for row in rows:
            directions.append({
                "decision": str(row.get("decision") or row.get("label") or "Review"),
                "step": str(row.get("step") or ""),
                "command": str(row.get("command") or ""),
                "safety": str(row.get("safety") or "Metadata-only after human review; originals stay untouched."),
                "why": str(row.get("why") or row.get("reason") or ""),
            })
        triage_groups.append({
            "groupId": group_id,
            "rank": primary.get("rank") or "",
            "priority": priority,
            "recommendedReviewMode": str(primary.get("recommendedReviewMode") or "compare-sources"),
            "recommendation": str(primary.get("recommendation") or "inspect-source-before-cull"),
            "sampleCount": sample_count,
            "flaggedCount": flagged_count,
            "qualityFlags": flags,
            "firstPassPrompt": first_pass,
            "reviewPrompt": str(primary.get("reviewPrompt") or f"Compare {group_id} before recording a metadata decision."),
            "openCommand": str(primary.get("openCommand") or first_reveal or (f"open -R {shell_quote(first_source)}" if first_source else "")),
            "samples": samples[:8],
            "safeDirections": directions,
        })
    return sorted(triage_groups, key=lambda item: row_sort_key(item))


def render_samples(samples: list[dict[str, Any]]) -> str:
    cards = []
    for sample in samples[:8]:
        thumb = html.escape(str(sample.get("thumbnailUri") or ""))
        filename = html.escape(str(sample.get("filename") or "Untitled"))
        flags = ", ".join(html.escape(flag) for flag in sample.get("qualityFlags", [])[:4])
        score = html.escape(str(sample.get("score") if sample.get("score") is not None else ""))
        img = f'<img src="{thumb}" alt="{filename}">' if thumb else '<div class="no-thumb">No thumb</div>'
        cards.append(f"""
        <figure class="sample">
          {img}
          <figcaption><strong>{filename}</strong><span>{flags or 'no flags'}</span><em>{score}</em></figcaption>
        </figure>
        """)
    return "\n".join(cards)


def render_html(payload: dict[str, Any]) -> str:
    groups_html = []
    for group in payload["triageGroups"]:
        flag_text = ", ".join(group.get("qualityFlags", [])[:8]) or "none"
        directions = "".join(
            f"<li><strong>{html.escape(d['decision'])}</strong><code>{html.escape(d['command'])}</code><small>{html.escape(d['safety'])}</small></li>"
            for d in group.get("safeDirections", [])
        )
        groups_html.append(f"""
        <section class="group-card">
          <div class="group-head">
            <div><p class="eyebrow">Group {html.escape(group['groupId'])}</p><h2>{html.escape(group['firstPassPrompt'])}</h2></div>
            <div class="pill">{html.escape(str(group.get('flaggedCount', 0)))} attention / {html.escape(str(group.get('sampleCount', 0)))} samples</div>
          </div>
          <p class="prompt">{html.escape(group.get('reviewPrompt', ''))}</p>
          <p class="flags"><strong>Signals:</strong> {html.escape(flag_text)}</p>
          <div class="samples">{render_samples(group.get('samples', []))}</div>
          <details><summary>Safe dry-run directions</summary><ul>{directions}</ul></details>
          <p class="open"><strong>Reveal source:</strong> <code>{html.escape(group.get('openCommand', ''))}</code></p>
        </section>
        """)
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Photo Grove first-pass triage</title>
<style>
:root {{ color-scheme: dark; --bg:#111713; --panel:#1b251d; --panel2:#243224; --ink:#f3ead7; --muted:#b7ad95; --leaf:#77c58a; --honey:#e0b849; --clay:#b86b45; --line:rgba(255,255,255,.12); }}
* {{ box-sizing:border-box; }}
body {{ margin:0; font-family:Avenir Next, ui-sans-serif, system-ui, sans-serif; background:radial-gradient(circle at top left,#263729,#101511 48%,#080a08); color:var(--ink); }}
main {{ max-width:1220px; margin:0 auto; padding:42px 24px 80px; }}
.hero,.contract,.group-card {{ border:1px solid var(--line); background:linear-gradient(135deg,rgba(36,50,36,.96),rgba(22,29,23,.96)); border-radius:28px; box-shadow:0 24px 80px rgba(0,0,0,.28); }}
.hero {{ padding:32px; margin-bottom:18px; }}
.eyebrow {{ color:var(--honey); text-transform:uppercase; letter-spacing:.18em; font-size:12px; font-weight:800; margin:0 0 8px; }}
h1 {{ font-size:44px; line-height:1; margin:0 0 14px; }}
p {{ color:var(--muted); line-height:1.55; }}
.stats {{ display:flex; flex-wrap:wrap; gap:10px; margin-top:20px; }}
.stat,.pill {{ padding:10px 14px; border-radius:999px; background:rgba(119,197,138,.14); border:1px solid rgba(119,197,138,.24); color:#d7f5dd; font-weight:750; }}
.contract {{ padding:18px 22px; margin:18px 0 24px; border-color:rgba(224,184,73,.28); }}
.group-card {{ padding:22px; margin:18px 0; }}
.group-head {{ display:flex; justify-content:space-between; gap:18px; align-items:flex-start; }}
h2 {{ margin:0; font-size:24px; }}
.prompt {{ color:#eadfcb; }}
.flags {{ color:#d7c7a5; }}
.samples {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(138px,1fr)); gap:12px; margin:18px 0; }}
.sample {{ margin:0; border-radius:18px; overflow:hidden; background:#0d110e; border:1px solid var(--line); }}
.sample img,.no-thumb {{ width:100%; aspect-ratio:4/3; object-fit:cover; display:block; background:#202820; }}
.no-thumb {{ display:grid; place-items:center; color:var(--muted); }}
figcaption {{ display:grid; gap:3px; padding:9px; font-size:12px; }}
figcaption span {{ color:var(--muted); }}
figcaption em {{ color:var(--honey); font-style:normal; }}
details {{ background:rgba(0,0,0,.18); border-radius:18px; padding:12px 14px; }}
summary {{ cursor:pointer; color:#f4d870; font-weight:800; }}
li {{ margin:12px 0; }}
code {{ display:block; white-space:pre-wrap; overflow-wrap:anywhere; background:#090c09; border:1px solid var(--line); padding:8px; border-radius:10px; color:#d8f7df; margin-top:5px; }}
.open code {{ display:inline-block; width:100%; }}
</style>
</head>
<body><main>
<section class="hero">
<p class="eyebrow">Photo Grove / first-pass triage</p>
<h1>Start culling without staring into the abyss.</h1>
<p>{html.escape(payload['humanAsk'])}</p>
<div class="stats">
  <div class="stat">{payload['counts']['groups']} groups</div>
  <div class="stat">{payload['counts']['samples']} sample frames</div>
  <div class="stat">{payload['counts']['dryRunDirections']} dry-run directions</div>
  <div class="stat">0 originals mutated</div>
</div>
</section>
<section class="contract"><strong>Truth contract:</strong> This deck is a review reducer, not a photo verdict machine. It opens local evidence and suggests metadata-only dry runs. It does not write cull decisions, change originals, export client proof, upload, publish, or create delivery truth.</section>
{''.join(groups_html)}
</main></body></html>"""


def write_markdown(path: Path, payload: dict[str, Any]) -> None:
    lines = [
        "# Photo Grove first-pass triage",
        "",
        payload["humanAsk"],
        "",
        "## Truth contract",
        "",
        payload["truth"],
        "",
        "## Start here",
        "",
    ]
    for group in payload["triageGroups"][:8]:
        lines.extend([
            f"### {group['groupId']}",
            "",
            f"- First-pass prompt: {group['firstPassPrompt']}",
            f"- Samples: {group['sampleCount']}",
            f"- Attention signals: {group['flaggedCount']}",
            f"- Reveal source: `{group['openCommand']}`",
            f"- Review prompt: {group['reviewPrompt']}",
            "",
        ])
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def write_csv(path: Path, payload: dict[str, Any]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["groupId", "rank", "priority", "sampleCount", "flaggedCount", "firstPassPrompt", "openCommand", "reviewPrompt"])
        writer.writeheader()
        for group in payload["triageGroups"]:
            writer.writerow({key: group.get(key, "") for key in writer.fieldnames})


def build(photo_root: Path, limit: int) -> tuple[Path, dict[str, Any]]:
    pointer, command_sheet = load_command_sheet(photo_root)
    command_rows = [row for row in as_list(command_sheet.get("commandRows")) if isinstance(row, dict)]
    groups = group_rows(command_rows)[:limit]
    out_dir = photo_root / "FirstPassTriage" / f"{stamp()}-photo-grove-first-pass-triage"
    out_dir.mkdir(parents=True, exist_ok=True)
    html_path = out_dir / "index.html"
    json_path = out_dir / "photo-grove-first-pass-triage.json"
    markdown_path = out_dir / "START-HERE-photo-grove-first-pass-triage.md"
    csv_path = out_dir / "photo-grove-first-pass-triage.csv"
    samples_count = sum(len(group.get("samples", [])) for group in groups)
    dry_run_count = sum(len(group.get("safeDirections", [])) for group in groups)
    first_group = groups[0] if groups else {}
    first_direction = {}
    for direction in first_group.get("safeDirections", []) if isinstance(first_group.get("safeDirections"), list) else []:
        if isinstance(direction, dict) and direction.get("command"):
            first_direction = direction
            break
    payload = {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "photoRoot": str(photo_root),
        "sourceCommandSheetHtml": pointer.get("htmlPath") or "",
        "sourceCommandSheetJson": pointer.get("jsonPath") or "",
        "sessionDir": str(out_dir),
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "status": "photo-grove-first-pass-triage-ready" if groups else "photo-grove-first-pass-triage-empty",
        "humanAsk": "Open the first group, compare thumbnails with source evidence, and choose only a metadata-only dry-run direction if the intent is obvious.",
        "nextSafestAction": f"Inspect {first_group.get('groupId', 'the first group')} source evidence, then rehearse one metadata-only keep/review/reject direction without mutating originals." if groups else "Regenerate the Photo Grove command sheet, then rebuild first-pass triage.",
        "agentSafeParallelWork": "Codex can improve grouping, prompts, sample visibility, and dry-run cull review packets. It must not execute metadata decisions, mutate originals, export client proof, upload, publish, delete, overwrite, or create delivery truth.",
        "firstSafeAction": {
            "label": "Open Photo Grove first-pass triage",
            "path": str(html_path),
            "command": f"open {shell_quote(str(html_path))}",
            "safety": "Opens local culling evidence only. No originals, metadata, exports, uploads, delivery state, or publication truth are changed.",
        },
        "firstDryRunCommand": str(first_direction.get("command") or ""),
        "firstDryRunDecision": str(first_direction.get("decision") or "review"),
        "firstDryRunSafety": str(first_direction.get("safety") or "Dry-run only. No metadata write, source mutation, proof export, delivery, upload, publication, approval, account mutation, or receipt truth."),
        "truth": "First-pass triage only. This deck reduces review overwhelm with thumbnails, source paths, and dry-run metadata directions. It does not execute decisions, mutate originals, export client proof, upload, publish, delete, overwrite, or create delivery truth.",
        "triageGroups": groups,
        "counts": {
            "groups": len(groups),
            "samples": samples_count,
            "dryRunDirections": dry_run_count,
            "sourceCommandRows": len(command_rows),
            "metadataChanged": False,
            "originalsMutated": False,
            "clientDeliveryCreated": False,
            "externalPublishing": False,
            "versionsOverwritten": False,
        },
    }
    write_json(json_path, payload)
    html_path.write_text(render_html(payload), encoding="utf-8")
    write_markdown(markdown_path, payload)
    write_csv(csv_path, payload)
    latest = {
        "schema": "quipsly.photo-grove.first-pass-triage.latest-pointer.v1",
        "updatedAt": iso_now(),
        "latestSessionDir": str(out_dir),
        "status": payload["status"],
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "counts": payload["counts"],
        "humanAsk": payload["humanAsk"],
        "nextSafestAction": payload["nextSafestAction"],
        "agentSafeParallelWork": payload["agentSafeParallelWork"],
        "firstSafeAction": payload["firstSafeAction"],
        "firstDryRunCommand": payload["firstDryRunCommand"],
        "firstDryRunDecision": payload["firstDryRunDecision"],
        "firstDryRunSafety": payload["firstDryRunSafety"],
        "truth": {
            "metadataChanged": False,
            "originalsMutated": False,
            "clientDeliveryCreated": False,
            "externalPublishing": False,
            "externalSchedulesCreated": False,
            "receiptTruthCreated": False,
            "versionsOverwritten": False,
        },
    }
    write_json(photo_root / LATEST_POINTER, latest)
    return out_dir, payload


def main() -> int:
    parser = argparse.ArgumentParser(description="Build Photo Grove first-pass triage deck.")
    parser.add_argument("photo_root", nargs="?", default=str(DEFAULT_PHOTO_ROOT))
    parser.add_argument("--limit", type=int, default=8)
    args = parser.parse_args()
    out_dir, payload = build(Path(args.photo_root), max(1, args.limit))
    print(json.dumps({
        "ok": True,
        "sessionDir": str(out_dir),
        "htmlPath": payload["htmlPath"],
        "jsonPath": payload["jsonPath"],
        "markdownPath": payload["markdownPath"],
        "csvPath": payload["csvPath"],
        "status": payload["status"],
        "counts": payload["counts"],
        "nextSafestAction": payload["nextSafestAction"],
        "firstSafeAction": payload["firstSafeAction"],
        "firstDryRunCommand": payload["firstDryRunCommand"],
        "firstDryRunDecision": payload["firstDryRunDecision"],
        "firstDryRunSafety": payload["firstDryRunSafety"],
        "truth": payload["truth"],
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
