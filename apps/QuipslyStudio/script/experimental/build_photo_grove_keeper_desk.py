#!/usr/bin/env python3
"""Build a Photo Grove Keeper Desk front door.

The Keeper Desk is a local-only, Aftershoot-inspired operator view that combines
first-keeper candidates, cull suggestions, command sheets, review status, and
client proof/export packet pointers. It does not execute cull commands, mutate
sidecars, touch originals, export deliverables, upload, publish, or create client
proof truth.
"""

from __future__ import annotations

import argparse
import csv
import html
import json
import shlex
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_PHOTO_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove")
SCHEMA = "quipsly.photo-grove.keeper-desk.v1"
LATEST_POINTER = "latest-photo-grove-keeper-desk.json"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-photo-keeper-desk")


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


def esc(value: Any) -> str:
    return html.escape(str(value or ""))


def command(parts: list[Any]) -> str:
    return " ".join(shlex.quote(str(part)) for part in parts)


def open_command(path_value: Any) -> str:
    value = str(path_value or "")
    return command(["open", value]) if value else ""


def normalize_first_safe_action(action: Any, fallback_path: Any, fallback_label: str) -> dict[str, str]:
    """Return an openable, validated first-action shape for human/agent handoff."""
    first = dict(action) if isinstance(action, dict) else {}
    path = str(first.get("path") or fallback_path or "")
    if path:
        first["path"] = path
    if not first.get("label"):
        first["label"] = fallback_label
    if path and not str(first.get("command") or "").startswith("open "):
        first["command"] = open_command(path)
    if not first.get("safety"):
        first["safety"] = "Opens local Photo Grove evidence only. Originals, metadata sidecars, exports, delivery, uploads, publication, and receipt truth stay unchanged."
    return {str(key): str(value) for key, value in first.items()}


def load_packet(pointer: dict[str, Any]) -> dict[str, Any]:
    path = Path(str(pointer.get("jsonPath") or pointer.get("manifestPath") or ""))
    return load_json(path) if path.exists() else {}


def pointer_summary(photo_root: Path, filename: str) -> tuple[dict[str, Any], dict[str, Any]]:
    pointer = load_json(photo_root / filename)
    return pointer, load_packet(pointer)


def first_candidates(packet: dict[str, Any], limit: int = 12) -> list[dict[str, Any]]:
    candidates = packet.get("candidates") if isinstance(packet.get("candidates"), list) else []
    rows: list[dict[str, Any]] = []
    for candidate in candidates[:limit]:
        if not isinstance(candidate, dict):
            continue
        rows.append({
            "rank": candidate.get("rank") or "",
            "id": candidate.get("id") or "",
            "filename": candidate.get("filename") or "",
            "groupId": candidate.get("groupId") or "",
            "candidateScore": candidate.get("candidateScore") or "",
            "reviewStatus": candidate.get("reviewStatus") or "",
            "qualityFlags": candidate.get("qualityFlags") if isinstance(candidate.get("qualityFlags"), list) else [],
            "sourcePath": candidate.get("sourcePath") or "",
            "thumbnailPath": candidate.get("thumbnailPath") or "",
            "thumbnailUri": candidate.get("thumbnailUri") or "",
            "reviewPrompt": candidate.get("reviewPrompt") or "Open and compare visually before changing metadata.",
            "markFavoriteCommand": ((candidate.get("safeLocalCommands") or {}).get("markFavorite") if isinstance(candidate.get("safeLocalCommands"), dict) else "") or "",
            "markKeepCommand": ((candidate.get("safeLocalCommands") or {}).get("markKeep") if isinstance(candidate.get("safeLocalCommands"), dict) else "") or "",
            "routeGroupReviewCommand": ((candidate.get("safeLocalCommands") or {}).get("routeGroupReview") if isinstance(candidate.get("safeLocalCommands"), dict) else "") or "",
        })
    return rows


def command_sheet_rows(packet: dict[str, Any], limit: int = 12) -> list[dict[str, Any]]:
    rows = packet.get("commandRows") if isinstance(packet.get("commandRows"), list) else []
    normalized: list[dict[str, Any]] = []
    for row in rows[:limit]:
        if not isinstance(row, dict):
            continue
        normalized.append({
            "groupId": row.get("groupId") or "",
            "step": row.get("step") or "",
            "label": row.get("label") or "",
            "decision": row.get("decision") or "",
            "recommendation": row.get("recommendation") or "",
            "sampleCount": row.get("sampleCount") or 0,
            "flaggedCount": row.get("flaggedCount") or 0,
            "reviewPrompt": row.get("reviewPrompt") or "",
            "openCommand": row.get("openCommand") or "",
            "metadataCommand": row.get("command") or "",
            "safety": row.get("safety") or "Metadata-only after visual/source review. Originals stay untouched.",
        })
    return normalized


def build_packet(photo_root: Path) -> dict[str, Any]:
    review_pointer = load_json(photo_root / "latest-photo-grove-review.json")
    latest_session = Path(str(review_pointer.get("latestSessionDir") or "")) if review_pointer.get("latestSessionDir") else None
    manifest = load_json(latest_session / "manifest.json") if latest_session and latest_session.exists() else {}
    review_status = load_json(latest_session / "review-status.json") if latest_session and latest_session.exists() else {}

    first_keepers_pointer, first_keepers_packet = pointer_summary(photo_root, "latest-photo-grove-first-keepers.json")
    cull_pointer, cull_packet = pointer_summary(photo_root, "latest-photo-grove-cull-suggestions.json")
    command_pointer, command_packet = pointer_summary(photo_root, "latest-photo-grove-command-sheet.json")
    client_pointer, _client_packet = pointer_summary(photo_root, "latest-photo-grove-client-proof-packet.json")
    review_batch_pointer, _review_batch_packet = pointer_summary(photo_root, "latest-photo-grove-review-batch.json")

    manifest_counts = manifest.get("counts") if isinstance(manifest.get("counts"), dict) else {}
    review_counts = review_status.get("counts") if isinstance(review_status.get("counts"), dict) else {}
    first_counts = first_keepers_pointer.get("counts") if isinstance(first_keepers_pointer.get("counts"), dict) else {}
    cull_counts = cull_pointer.get("counts") if isinstance(cull_pointer.get("counts"), dict) else {}
    command_counts = command_pointer.get("counts") if isinstance(command_pointer.get("counts"), dict) else {}
    client_counts = client_pointer.get("counts") if isinstance(client_pointer.get("counts"), dict) else {}

    first_rows = first_candidates(first_keepers_packet)
    command_rows = command_sheet_rows(command_packet)
    source_photos = int(first_counts.get("sourcePhotos") or manifest_counts.get("items") or len(manifest.get("items") or []) or 0)
    pending = int(first_counts.get("pending") or review_counts.get("pending") or cull_counts.get("pending") or 0)
    selected = int(first_counts.get("selectedForClientProof") or review_counts.get("keep", 0) + review_counts.get("favorite", 0) if review_counts else 0)
    counts = {
        "sourcePhotos": source_photos,
        "sourceGroups": int(first_counts.get("sourceGroups") or cull_counts.get("sourceGroups") or len(manifest.get("reviewGroups") or []) or 0),
        "firstKeeperCandidates": int(first_counts.get("candidatePhotos") or len(first_rows)),
        "firstKeeperGroups": int(first_counts.get("candidateGroups") or 0),
        "cullSuggestionGroups": int(cull_counts.get("suggestionGroups") or 0),
        "metadataCommandRows": int(command_counts.get("commands") or len(command_rows)),
        "metadataCommandGroups": int(command_counts.get("groups") or 0),
        "pending": pending,
        "selectedForClientProof": selected,
        "clientProofItems": int(client_counts.get("clientProofItems") or client_counts.get("selectedForClientProof") or 0),
        "originalsMutated": False,
        "metadataChanged": False,
        "clientDeliveryCreated": False,
        "externalPublishing": False,
    }

    if first_keepers_pointer:
        next_action = "Open first-keeper candidates, compare visually, then decide whether to route groups or apply metadata-only keep/favorite decisions."
        first_keeper_first_safe = normalize_first_safe_action(
            first_keepers_pointer.get("firstSafeAction"),
            first_keepers_pointer.get("htmlPath"),
            "Open first keepers",
        )
    elif command_pointer:
        next_action = "Open the command sheet and use source evidence before any metadata-only cull decision."
        first_keeper_first_safe = normalize_first_safe_action(
            command_pointer.get("firstSafeAction"),
            command_pointer.get("htmlPath"),
            "Open command sheet",
        )
    else:
        next_action = "Generate Photo Grove board, first keepers, and cull suggestions before culling."
        first_keeper_first_safe = {"label": "Generate Photo Grove board", "command": "./script/agentctl.sh photo-grove-board", "path": "", "safety": "Creates local thumbnails/manifests only."}
    first_safe = {
        "label": "Open Keeper Desk",
        "command": "",
        "path": "",
        "safety": "Opens the local Photo Grove Keeper Desk only. No metadata command executes, originals stay untouched, and no proof/export/delivery/publication truth is created.",
    }

    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "photoRoot": str(photo_root),
        "status": "keeper-desk-ready" if review_pointer else "needs-photo-grove-board",
        "truth": "Photo Grove Keeper Desk only. It summarizes local cull/review evidence and safe metadata commands without executing decisions, mutating originals, exporting deliverables, uploading, publishing, or creating client proof truth.",
        "counts": counts,
        "sourcePointers": {
            "reviewHtml": review_pointer.get("htmlPath") or "",
            "reviewManifest": review_pointer.get("manifestPath") or "",
            "latestSessionDir": str(latest_session or ""),
            "firstKeepersHtml": first_keepers_pointer.get("htmlPath") or "",
            "firstKeepersJson": first_keepers_pointer.get("jsonPath") or "",
            "cullSuggestionsHtml": cull_pointer.get("htmlPath") or "",
            "cullSuggestionsJson": cull_pointer.get("jsonPath") or "",
            "commandSheetHtml": command_pointer.get("htmlPath") or "",
            "commandSheetJson": command_pointer.get("jsonPath") or "",
            "clientProofHtml": client_pointer.get("htmlPath") or "",
            "clientProofJson": client_pointer.get("jsonPath") or "",
            "reviewBatchHtml": review_batch_pointer.get("htmlPath") or "",
            "reviewBatchJson": review_batch_pointer.get("jsonPath") or "",
        },
        "firstKeeperCandidates": first_rows,
        "commandRows": command_rows,
        "nextSafestAction": next_action,
        "firstSafeAction": first_safe,
        "firstKeeperFirstSafeAction": first_keeper_first_safe,
        "workflow": [
            {"step": 1, "name": "First look", "description": "Open first-keeper candidates and compare visually. This narrows attention without making a verdict."},
            {"step": 2, "name": "Compare neighbors", "description": "Use contact sheets and review sessions to compare near-duplicates before any keep/reject action."},
            {"step": 3, "name": "Route groups", "description": "Use cull suggestions/command sheet to route groups to keep, favorite, review, reject, or pending as metadata only."},
            {"step": 4, "name": "Proof packet", "description": "Only after selected metadata is trustworthy, create client/review/export prep packets."},
        ],
        "safety": {
            "originalsMutated": False,
            "metadataChanged": False,
            "clientDeliveryCreated": False,
            "externalPublishing": False,
            "sourceDeletes": False,
            "versionOverwrites": False,
        },
    }


def prepare_output_dir(photo_root: Path) -> Path:
    out_dir = photo_root / "KeeperDesk" / stamp()
    base = out_dir
    counter = 2
    while out_dir.exists():
        out_dir = Path(f"{base}-{counter}")
        counter += 1
    out_dir.mkdir(parents=True, exist_ok=False)
    return out_dir


def write_csv(path: Path, packet: dict[str, Any]) -> None:
    fields = ["kind", "rank", "id", "filename", "groupId", "status", "score", "prompt", "command", "path"]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in packet.get("firstKeeperCandidates") or []:
            writer.writerow({
                "kind": "first-keeper-candidate",
                "rank": row.get("rank", ""),
                "id": row.get("id", ""),
                "filename": row.get("filename", ""),
                "groupId": row.get("groupId", ""),
                "status": row.get("reviewStatus", ""),
                "score": row.get("candidateScore", ""),
                "prompt": row.get("reviewPrompt", ""),
                "command": row.get("markFavoriteCommand", ""),
                "path": row.get("sourcePath", ""),
            })
        for row in packet.get("commandRows") or []:
            writer.writerow({
                "kind": "metadata-command-row",
                "rank": row.get("step", ""),
                "id": row.get("groupId", ""),
                "filename": "",
                "groupId": row.get("groupId", ""),
                "status": row.get("decision", ""),
                "score": "",
                "prompt": row.get("reviewPrompt", ""),
                "command": row.get("metadataCommand", ""),
                "path": row.get("openCommand", ""),
            })


def write_markdown(path: Path, packet: dict[str, Any]) -> None:
    counts = packet.get("counts") or {}
    lines = [
        "# Photo Grove Keeper Desk",
        "",
        f"Generated: `{packet.get('generatedAt')}`",
        "",
        str(packet.get("truth") or ""),
        "",
        "## Counts",
        "",
    ]
    for key in ["sourcePhotos", "sourceGroups", "firstKeeperCandidates", "firstKeeperGroups", "cullSuggestionGroups", "metadataCommandRows", "metadataCommandGroups", "pending", "selectedForClientProof"]:
        lines.append(f"- `{key}`: `{counts.get(key, 0)}`")
    lines.extend(["", "## Next safest action", "", str(packet.get("nextSafestAction") or ""), "", "## Workflow", ""])
    for step in packet.get("workflow") or []:
        lines.append(f"- `{step.get('step')}` {step.get('name')}: {step.get('description')}")
    lines.extend(["", "## Source packets", ""])
    for key, value in (packet.get("sourcePointers") or {}).items():
        lines.append(f"- `{key}`: `{value}`")
    lines.extend(["", "## First candidates", ""])
    for row in packet.get("firstKeeperCandidates") or []:
        lines.extend([
            f"### #{row.get('rank')} {row.get('filename')}",
            f"- Group: `{row.get('groupId')}`",
            f"- Score: `{row.get('candidateScore')}`",
            f"- Prompt: {row.get('reviewPrompt')}",
            f"- Source: `{row.get('sourcePath')}`",
            "",
        ])
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def render_candidate(row: dict[str, Any]) -> str:
    thumb = row.get("thumbnailUri") or ""
    img = f"<img src=\"{esc(thumb)}\" alt=\"{esc(row.get('filename'))}\">" if thumb else "<div class=\"thumb-empty\">No thumb</div>"
    flags = "".join(f"<span>{esc(flag)}</span>" for flag in row.get("qualityFlags") or []) or "<span>no carried flags</span>"
    return f"""
    <article class="candidate">
      <figure>{img}</figure>
      <div>
        <div class="topline"><span>#{esc(row.get('rank'))}</span><strong>{esc(row.get('candidateScore'))}</strong></div>
        <h3>{esc(row.get('filename'))}</h3>
        <p>{esc(row.get('groupId'))} · {esc(row.get('reviewStatus'))}</p>
        <div class="flags">{flags}</div>
        <p>{esc(row.get('reviewPrompt'))}</p>
        <details><summary>Metadata commands after visual review</summary><pre>{esc(row.get('markFavoriteCommand'))}\n{esc(row.get('markKeepCommand'))}\n{esc(row.get('routeGroupReviewCommand'))}</pre></details>
      </div>
    </article>
    """


def write_html(path: Path, packet: dict[str, Any]) -> None:
    counts = packet.get("counts") or {}
    candidates = "".join(render_candidate(row) for row in packet.get("firstKeeperCandidates") or [])
    command_rows = packet.get("commandRows") if isinstance(packet.get("commandRows"), list) else []
    commands_html = "".join(f"""
      <article class="command-row">
        <div class="topline"><span>{esc(row.get('groupId'))}</span><strong>{esc(row.get('decision'))}</strong></div>
        <p>{esc(row.get('reviewPrompt'))}</p>
        <details><summary>Open and metadata command</summary><pre>{esc(row.get('openCommand'))}\n\n{esc(row.get('metadataCommand'))}</pre></details>
      </article>
    """ for row in command_rows[:12])
    html_text = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Photo Grove Keeper Desk</title>
  <style>
    :root {{ color-scheme:dark; --bg:#10170f; --panel:#1b271b; --ink:#fff1d5; --muted:#d2c3a2; --moss:#8fbc72; --leaf:#45d07b; --gold:#eeca58; --water:#7bc5d4; --clay:#c67854; --line:rgba(255,241,213,.15); }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; color:var(--ink); font-family:Avenir Next, Helvetica Neue, sans-serif; background:radial-gradient(circle at 8% -8%, rgba(143,188,114,.25), transparent 36%), radial-gradient(circle at 88% 0%, rgba(123,197,212,.15), transparent 34%), linear-gradient(180deg,#111c11,#070b07); }}
    header {{ padding:46px clamp(20px,5vw,82px); border-bottom:1px solid var(--line); }}
    .eyebrow {{ color:var(--gold); text-transform:uppercase; letter-spacing:.24em; font-size:12px; font-weight:950; }}
    h1 {{ max-width:1060px; margin:10px 0; font-size:clamp(42px,7vw,86px); line-height:.92; }}
    p {{ color:var(--muted); line-height:1.45; }}
    header p {{ max-width:920px; font-size:18px; }}
    .summary {{ display:flex; gap:10px; flex-wrap:wrap; margin-top:20px; }}
    .summary span {{ border:1px solid var(--line); border-radius:999px; padding:9px 12px; background:rgba(255,255,255,.06); font-weight:850; }}
    main {{ padding:28px clamp(16px,4vw,58px) 72px; display:grid; gap:20px; }}
    section {{ border:1px solid var(--line); border-radius:28px; padding:22px; background:linear-gradient(180deg,rgba(27,39,27,.95),rgba(8,13,8,.98)); box-shadow:0 18px 46px rgba(0,0,0,.2); }}
    h2 {{ margin:0 0 14px; color:var(--gold); }}
    .workflow {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:12px; }}
    .workflow article,.command-row,.candidate {{ border:1px solid var(--line); border-radius:18px; padding:14px; background:rgba(0,0,0,.18); }}
    .candidates {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(320px,1fr)); gap:14px; }}
    .candidate {{ display:grid; grid-template-columns:128px 1fr; gap:14px; }}
    figure {{ margin:0; border:1px solid var(--line); border-radius:16px; overflow:hidden; background:#070b07; }}
    img,.thumb-empty {{ width:100%; aspect-ratio:4/3; object-fit:cover; display:grid; place-items:center; color:var(--muted); }}
    .topline {{ display:flex; justify-content:space-between; gap:12px; color:var(--gold); text-transform:uppercase; letter-spacing:.12em; font-size:11px; font-weight:950; }}
    h3 {{ margin:8px 0 4px; }}
    .flags {{ display:flex; flex-wrap:wrap; gap:6px; }}
    .flags span {{ border-radius:999px; padding:4px 8px; background:rgba(238,202,88,.1); color:var(--gold); font-size:11px; font-weight:850; }}
    .commands {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:12px; }}
    summary {{ cursor:pointer; color:var(--water); font-weight:850; }}
    pre {{ white-space:pre-wrap; overflow-wrap:anywhere; color:var(--muted); background:rgba(0,0,0,.25); border-radius:12px; padding:10px; }}
  </style>
</head>
<body>
  <header>
    <div class="eyebrow">Photo Grove Keeper Desk</div>
    <h1>A calm first pass through the photo thicket.</h1>
    <p>{esc(packet.get('truth'))}</p>
    <p><strong>Next safest action:</strong> {esc(packet.get('nextSafestAction'))}</p>
    <div class="summary">
      <span>{esc(counts.get('sourcePhotos'))} source photos</span>
      <span>{esc(counts.get('firstKeeperCandidates'))} first candidates</span>
      <span>{esc(counts.get('cullSuggestionGroups'))} suggestion groups</span>
      <span>{esc(counts.get('metadataCommandRows'))} metadata command rows</span>
      <span>{esc(counts.get('selectedForClientProof'))} selected</span>
    </div>
  </header>
  <main>
    <section><h2>Workflow</h2><div class="workflow">{''.join(f'<article><div class="topline"><span>Step {esc(step.get("step"))}</span><strong>{esc(step.get("name"))}</strong></div><p>{esc(step.get("description"))}</p></article>' for step in packet.get('workflow') or [])}</div></section>
    <section><h2>First keeper candidates</h2><div class="candidates">{candidates or '<p>No candidates yet. Generate Photo Grove first keepers.</p>'}</div></section>
    <section><h2>Routing command rows</h2><div class="commands">{commands_html or '<p>No command rows yet. Generate cull suggestions and command sheet.</p>'}</div></section>
    <section><h2>Source packet paths</h2><pre>{esc(json.dumps(packet.get('sourcePointers') or {}, indent=2))}</pre></section>
  </main>
</body>
</html>
"""
    path.write_text(html_text, encoding="utf-8")


def update_pointer(photo_root: Path, out_dir: Path, packet: dict[str, Any], html_path: Path, json_path: Path, markdown_path: Path, csv_path: Path) -> None:
    first_safe = dict(packet.get("firstSafeAction") or {})
    first_safe["path"] = str(html_path)
    first_safe["command"] = open_command(html_path)
    pointer = {
        "schema": "quipsly.photo-grove.latest-keeper-desk.v1",
        "updatedAt": iso_now(),
        "status": packet.get("status") or "keeper-desk-ready",
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "sessionDir": str(out_dir),
        "counts": packet.get("counts") or {},
        "humanAsk": "Use the Keeper Desk to compare likely keepers and record metadata-only decisions after visual/source review.",
        "agentSafeParallelWork": "Codex may improve keeper ranking notes, quality cautions, grouping summaries, and dry-run metadata commands. Do not mutate originals, change metadata decisions, export, deliver, upload, publish, delete, or overwrite.",
        "truth": packet.get("truth") or "",
        "nextSafestAction": packet.get("nextSafestAction") or "Open Photo Grove evidence before metadata decisions.",
        "firstSafeAction": first_safe,
        "firstKeeperFirstSafeAction": packet.get("firstKeeperFirstSafeAction") or {},
        "sourcePointers": packet.get("sourcePointers") or {},
        "metadataChanged": False,
        "originalsMutated": False,
        "clientDeliveryCreated": False,
        "externalPublishing": False,
    }
    write_json(photo_root / LATEST_POINTER, pointer)


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a local-only Photo Grove Keeper Desk.")
    parser.add_argument("photo_root", nargs="?", default=str(DEFAULT_PHOTO_ROOT))
    args = parser.parse_args()
    photo_root = Path(args.photo_root)
    packet = build_packet(photo_root)
    out_dir = prepare_output_dir(photo_root)
    json_path = out_dir / "photo-grove-keeper-desk.json"
    html_path = out_dir / "index.html"
    markdown_path = out_dir / "START-HERE-photo-grove-keeper-desk.md"
    csv_path = out_dir / "photo-grove-keeper-desk.csv"
    packet.update({
        "sessionDir": str(out_dir),
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
    })
    first_safe = dict(packet.get("firstSafeAction") or {})
    first_safe["path"] = str(html_path)
    first_safe["command"] = open_command(html_path)
    packet["firstSafeAction"] = first_safe
    write_json(json_path, packet)
    write_markdown(markdown_path, packet)
    write_csv(csv_path, packet)
    write_html(html_path, packet)
    update_pointer(photo_root, out_dir, packet, html_path, json_path, markdown_path, csv_path)
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
