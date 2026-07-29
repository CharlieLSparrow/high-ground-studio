#!/usr/bin/env python3
"""Build and safely update the Studio shorts review decision ledger.

This ledger records local watch/listen intent for short exports. It sits before
Tower approval and before any platform action. A `keep` decision here means
"locally promising / worth moving toward platform review," not publication
approval. The script never uploads, publishes, schedules, mutates media, deletes,
overwrites versions, mutates accounts, or creates receipt truth.
"""
from __future__ import annotations

import argparse
import csv
import html
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
LATEST_BATCH_POINTER = "review-board/shorts-review-batches/latest-shorts-review-batch.json"
SHORTS_COMMAND_ROOM_JSON = "shorts-command-room/quipsly-studio-shorts-command-room.json"
LEDGER_DIR_NAME = "studio-short-review-decision-ledger"
LATEST_LEDGER_POINTER = "review-board/latest-studio-short-review-decision-ledger.json"
SCHEMA = "quipsly.studio.short-review-decision-ledger.v1"
DECISIONS = {"pending", "keep", "refine", "hold", "reject", "needs-more-evidence"}


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp(prefix: str) -> str:
    return datetime.now(timezone.utc).strftime(f"%Y%m%d-%H%M%S-%f-{prefix}")


def shell_quote(value: str) -> str:
    return "'" + str(value).replace("'", "'\\''") + "'"


def esc(value: Any) -> str:
    return html.escape(str(value or ""), quote=True)


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def load_pointer_target(path: Path) -> dict[str, Any]:
    pointer = load_json(path)
    target_path = Path(str(pointer.get("jsonPath") or "")) if pointer.get("jsonPath") else None
    target = load_json(target_path) if target_path and target_path.exists() else {}
    return {**pointer, **target} if target else pointer


def rows_from_command_room(root: Path) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Return native current-version shorts from the active command room.

    Carry-forward candidates are intentionally excluded here because Episode 1
    has its own carry-forward ledger. This ledger is for native current-version
    short review intent across proof lanes.
    """
    path = root / SHORTS_COMMAND_ROOM_JSON
    room = load_json(path)
    rows: list[dict[str, Any]] = []
    for episode in room.get("episodes", []):
        if not isinstance(episode, dict):
            continue
        episode_number = episode.get("episode")
        version = episode.get("currentVersion") or episode.get("current_version") or ""
        for short in episode.get("nativeShorts", []):
            if not isinstance(short, dict):
                continue
            try:
                short_index = int(short.get("index") or len(rows) + 1)
            except (TypeError, ValueError):
                short_index = len(rows) + 1
            source_path = Path(str(short.get("path") or ""))
            short_id = f"episode-{episode_number}-short-{short_index:02d}"
            facts = short.get("mediaFacts", {}) if isinstance(short.get("mediaFacts"), dict) else {}
            exists = bool(facts.get("exists", source_path.exists()))
            bytes_value = int(facts.get("bytes") or facts.get("size") or file_size_for_path(source_path) if exists else 0)
            rows.append(
                {
                    "id": short_id,
                    "episode": episode_number,
                    "version": version,
                    "shortIndex": short_index,
                    "humanTitle": short.get("title") or short_id,
                    "title": short.get("title") or short_id,
                    "path": str(source_path),
                    "fileUri": short.get("uri") or file_uri_for_path(source_path),
                    "exists": exists,
                    "bytes": bytes_value,
                    "hasAudio": bool(facts.get("hasAudio", False)),
                    "hasVideo": bool(facts.get("hasVideo", False)),
                    "durationLabel": str(facts.get("durationLabel") or "unknown; watch/listen review required"),
                    "durationSeconds": facts.get("durationSeconds") or 0,
                    "reviewRisk": "probe-warning-needs-check" if facts.get("status") != "ok" else "normal-watch-listen-review",
                    "episodeWarning": bool(facts.get("status") != "ok"),
                    "aspect": str(facts.get("aspect") or "unknown"),
                    "width": facts.get("width") or 0,
                    "height": facts.get("height") or 0,
                    "probeStatus": str(facts.get("status") or "unknown"),
                    "probeWarning": str(facts.get("warning") or ""),
                    "durationBucket": str(short.get("durationBucket") or ""),
                    "platformFit": short.get("platformFit") if isinstance(short.get("platformFit"), list) else [],
                    "reviewPriority": short.get("reviewPriority") or 9999,
                    "reviewPriorityReason": str(short.get("reviewPriorityReason") or ""),
                    "reviewPrompt": "Would you post this native current-version short as-is, refine it, hold it, or reject it?",
                    "nextSafestAction": "Watch/listen locally, then record local review intent only.",
                    "openCommand": f"open {shell_quote(str(source_path))}",
                    "revealCommand": f"open -R {shell_quote(str(source_path))}",
                }
            )
    source = {
        "kind": "shorts-command-room",
        "path": str(path),
        "exists": path.exists(),
        "htmlPath": str(path.with_suffix(".html")),
        "jsonPath": str(path),
    }
    return rows, source


def file_uri_for_path(path: Path) -> str:
    try:
        return path.expanduser().resolve().as_uri()
    except ValueError:
        return ""


def file_size_for_path(path: Path) -> int:
    try:
        if path.exists():
            return int(path.stat().st_size)
    except OSError:
        return 0
    return 0


def ledger_dir(root: Path) -> Path:
    return root / "review-board" / LEDGER_DIR_NAME


def ledger_path(root: Path) -> Path:
    return ledger_dir(root) / "studio-short-review-decision-ledger.json"


def latest_pointer_path(root: Path) -> Path:
    return root / LATEST_LEDGER_POINTER


def event_log_path(root: Path) -> Path:
    return ledger_dir(root) / "studio-short-review-decision-events.jsonl"


def snapshot_ledger(path: Path) -> Path:
    snapshots = path.parent / "ledger-versions"
    snapshots.mkdir(parents=True, exist_ok=True)
    target = snapshots / f"studio-short-review-decision-ledger-before-{stamp('snapshot')}.json"
    shutil.copy2(path, target)
    return target


def append_event(root: Path, event: dict[str, Any]) -> Path:
    path = event_log_path(root)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(event, sort_keys=True) + "\n")
    return path


def safe_commands(short_id: str) -> list[dict[str, str]]:
    dry = "./script/agentctl.sh studio-short-review-decision-dry-run"
    live = "./script/agentctl.sh studio-short-review-decision"
    return [
        {"label": "Dry-run keep", "command": f"{dry} {shell_quote(short_id)} keep '<reviewer>' '<why this short is locally promising>'", "safety": "Dry-run only. No ledger mutation."},
        {"label": "Dry-run refine", "command": f"{dry} {shell_quote(short_id)} refine '<reviewer>' '<crop/pacing/caption/audio issue>'", "safety": "Dry-run only. No ledger mutation."},
        {"label": "Dry-run hold", "command": f"{dry} {shell_quote(short_id)} hold '<reviewer>' '<what must be checked before deciding>'", "safety": "Dry-run only. No ledger mutation."},
        {"label": "Dry-run reject", "command": f"{dry} {shell_quote(short_id)} reject '<reviewer>' '<why this should not move forward>'", "safety": "Dry-run only. No ledger mutation."},
        {"label": "Record keep", "command": f"{live} {shell_quote(short_id)} keep '<reviewer>' '<why this short is locally promising>'", "safety": "Writes only the local shorts review ledger. No publication approval, upload, schedule, account mutation, media mutation, overwrite, delete, or receipt truth."},
        {"label": "Record refine", "command": f"{live} {shell_quote(short_id)} refine '<reviewer>' '<crop/pacing/caption/audio issue>'", "safety": "Writes only the local shorts review ledger. No publication approval, upload, schedule, account mutation, media mutation, overwrite, delete, or receipt truth."},
        {"label": "Record hold", "command": f"{live} {shell_quote(short_id)} hold '<reviewer>' '<what must be checked before deciding>'", "safety": "Writes only the local shorts review ledger. No publication approval, upload, schedule, account mutation, media mutation, overwrite, delete, or receipt truth."},
        {"label": "Record reject", "command": f"{live} {shell_quote(short_id)} reject '<reviewer>' '<why this should not move forward>'", "safety": "Writes only the local shorts review ledger. No publication approval, upload, schedule, account mutation, media mutation, overwrite, delete, or receipt truth."},
        {"label": "Record needs more evidence", "command": f"{live} {shell_quote(short_id)} needs-more-evidence '<reviewer>' '<what evidence is missing>'", "safety": "Writes only the local shorts review ledger. No publication approval, upload, schedule, account mutation, media mutation, overwrite, delete, or receipt truth."},
    ]


def existing_by_id(ledger: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        str(item.get("shortId") or ""): item
        for item in ledger.get("items", [])
        if isinstance(item, dict) and item.get("shortId")
    }


def media_shape_from_row(row: dict[str, Any]) -> tuple[str, int, int]:
    aspect = str(row.get("aspect") or "unknown")
    try:
        width = int(row.get("width") or 0)
    except (TypeError, ValueError):
        width = 0
    try:
        height = int(row.get("height") or 0)
    except (TypeError, ValueError):
        height = 0
    if width and height and aspect == "unknown":
        aspect = "9:16" if height > width else "16:9" if width > height else "1:1"
    if width and height:
        return aspect, width, height

    for entry in row.get("codecSummary", []):
        text = str(entry)
        if "video:" not in text or "x" not in text:
            continue
        for token in text.split(":"):
            if "x" not in token:
                continue
            left, right = token.split("x", 1)
            if left.isdigit() and right.isdigit():
                width = int(left)
                height = int(right)
                aspect = "9:16" if height > width else "16:9" if width > height else "1:1"
                return aspect, width, height
    return aspect, width, height


def item_from_row(row: dict[str, Any], prior: dict[str, Any]) -> dict[str, Any]:
    short_id = str(row.get("id") or f"episode-{row.get('episode')}-short-{row.get('shortIndex')}")
    decision = str(prior.get("decision") or "pending")
    if decision not in DECISIONS:
        decision = "pending"
    aspect, width, height = media_shape_from_row(row)
    media_path = Path(str(row.get("path") or ""))
    try:
        bytes_value = int(row.get("bytes") or row.get("size") or file_size_for_path(media_path))
    except (TypeError, ValueError):
        bytes_value = file_size_for_path(media_path)
    return {
        "shortId": short_id,
        "episode": row.get("episode"),
        "version": str(row.get("version") or ""),
        "shortIndex": row.get("shortIndex"),
        "title": str(row.get("humanTitle") or row.get("title") or short_id),
        "path": str(row.get("path") or ""),
        "fileUri": str(row.get("fileUri") or ""),
        "exists": bool(row.get("exists")),
        "bytes": bytes_value,
        "hasAudio": bool(row.get("hasAudio")),
        "hasVideo": bool(row.get("hasVideo")),
        "durationLabel": str(row.get("durationLabel") or "unknown"),
        "durationSeconds": row.get("durationSeconds") or 0,
        "aspect": aspect,
        "width": width,
        "height": height,
        "probeStatus": str(row.get("probeStatus") or "unknown"),
        "probeWarning": str(row.get("probeWarning") or ""),
        "durationBucket": str(row.get("durationBucket") or ""),
        "platformFit": row.get("platformFit") if isinstance(row.get("platformFit"), list) else [],
        "reviewPriority": row.get("reviewPriority") or 9999,
        "reviewPriorityReason": str(row.get("reviewPriorityReason") or ""),
        "reviewRisk": str(row.get("reviewRisk") or "normal-watch-listen-review"),
        "episodeWarning": bool(row.get("episodeWarning")),
        "reviewSource": str(row.get("_reviewSource") or row.get("reviewSource") or ""),
        "decision": decision,
        "status": prior.get("status") or ("pending-local-review" if decision == "pending" else "local-review-recorded"),
        "reviewer": str(prior.get("reviewer") or ""),
        "reviewedAt": str(prior.get("reviewedAt") or ""),
        "notes": str(prior.get("notes") or ""),
        "reviewPrompt": str(row.get("reviewPrompt") or "Would you post this short as-is, refine it, hold it, or reject it?"),
        "nextSafestAction": str(row.get("nextSafestAction") or "Watch/listen locally, then record local review intent only."),
        "openCommand": str(row.get("openCommand") or ""),
        "revealCommand": str(row.get("revealCommand") or ""),
        "safeCommands": safe_commands(short_id),
        "truth": "Local shorts review intent only. Keep means locally promising, not publication approval. No upload, post, schedule, account mutation, media mutation, overwrite, delete, or receipt truth.",
    }


def recompute_counts(items: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "items": len(items),
        "pending": sum(1 for item in items if item.get("decision") == "pending"),
        "keep": sum(1 for item in items if item.get("decision") == "keep"),
        "refine": sum(1 for item in items if item.get("decision") == "refine"),
        "hold": sum(1 for item in items if item.get("decision") == "hold"),
        "reject": sum(1 for item in items if item.get("decision") == "reject"),
        "needsMoreEvidence": sum(1 for item in items if item.get("decision") == "needs-more-evidence"),
        "decisionsRecorded": sum(1 for item in items if item.get("decision") != "pending"),
        "playableRows": sum(1 for item in items if item.get("exists") and item.get("hasVideo")),
        "warningEpisodeRows": sum(1 for item in items if item.get("episodeWarning")),
        "receiptTruthCreated": False,
        "externalPublishing": False,
        "externalUpload": False,
        "externalSchedulesCreated": False,
        "approvalCreated": False,
        "sourceFilesMutated": False,
        "versionsOverwritten": False,
        "filesDeleted": False,
    }


def render_markdown(ledger: dict[str, Any]) -> str:
    lines = [
        "# Studio shorts review decision ledger",
        "",
        f"Updated: `{ledger.get('updatedAt')}`",
        f"Status: `{ledger.get('status')}`",
        f"Source batch: `{ledger.get('sourceBatchHtml')}`",
        "",
        "This is local review intent only. `keep` means locally promising, not external approval or publication permission.",
        "",
        "## Decision meanings",
        "",
        "- `pending`: nobody has recorded a local short decision yet.",
        "- `keep`: promising enough to move toward platform review or human approval.",
        "- `refine`: useful candidate, but needs crop/pacing/caption/audio work.",
        "- `hold`: pause until a named concern is checked.",
        "- `reject`: do not move this short forward.",
        "- `needs-more-evidence`: current local packet is not enough to decide.",
        "",
        "## Shorts",
        "",
    ]
    for item in ledger.get("items", []):
        lines.extend([
            f"### {item.get('shortId')} - {item.get('title')}",
            "",
            f"- Episode: `{item.get('episode')}`",
            f"- Duration: `{item.get('durationLabel')}`",
            f"- File: `{item.get('path')}`",
            f"- Decision: `{item.get('decision')}`",
            f"- Reviewer: `{item.get('reviewer') or 'not recorded'}`",
            f"- Reviewed at: `{item.get('reviewedAt') or 'not recorded'}`",
            f"- Notes: {item.get('notes') or 'none yet'}",
            f"- Risk: `{item.get('reviewRisk')}`",
            f"- Open: `{item.get('openCommand')}`",
            "",
            "Safe commands:",
            "",
        ])
        for command in item.get("safeCommands", []):
            lines.append(f"- {command.get('label')}: `{command.get('command')}`")
        lines.append("")
    lines.extend([
        "## Safety boundary",
        "",
        "- No external publishing, upload, schedule, account mutation, source mutation, overwrite, delete, approval, or receipt truth.",
    ])
    return "\n".join(lines).rstrip() + "\n"


def write_csv(ledger: dict[str, Any], path: Path) -> None:
    fieldnames = ["shortId", "episode", "version", "shortIndex", "title", "decision", "status", "reviewer", "reviewedAt", "notes", "durationLabel", "durationBucket", "aspect", "hasAudio", "hasVideo", "probeStatus", "reviewPriority", "reviewRisk", "path"]
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for item in ledger.get("items", []):
            writer.writerow({key: item.get(key, "") for key in fieldnames})


def write_html(ledger: dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    metrics = "".join(
        f"<div><strong>{esc(value)}</strong><span>{esc(key)}</span></div>"
        for key, value in ledger.get("counts", {}).items()
        if key in {"items", "pending", "keep", "refine", "hold", "reject", "decisionsRecorded", "playableRows"}
    )
    cards = []
    for item in ledger.get("items", []):
        media = ""
        if item.get("fileUri") and item.get("exists"):
            media = f"<video controls preload='metadata' src='{esc(item.get('fileUri'))}'></video>"
        else:
            media = "<div class='missing'>Missing local media</div>"
        commands = "".join(f"<li><code>{esc(command.get('command'))}</code><small>{esc(command.get('safety'))}</small></li>" for command in item.get("safeCommands", []))
        cards.append(f"""
<article class='card {esc(item.get('decision'))}'>
  <div class='top'><span>Episode {esc(item.get('episode'))}</span><span>{esc(item.get('durationLabel'))}</span><span>{esc(item.get('aspect'))}</span><span>audio {esc(item.get('hasAudio'))}</span><span>{esc(item.get('probeStatus'))}</span><span>{esc(item.get('reviewRisk'))}</span></div>
  <h2>{esc(item.get('title'))}</h2>
  {media}
  <div class='decision'>{esc(item.get('decision'))}</div>
  <p>{esc(item.get('reviewPrompt'))}</p>
  <dl><dt>Reviewer</dt><dd>{esc(item.get('reviewer') or 'not recorded')}</dd><dt>Notes</dt><dd>{esc(item.get('notes') or 'none yet')}</dd><dt>Media</dt><dd>{esc(item.get('durationLabel'))} · {esc(item.get('durationBucket'))} · {esc(item.get('aspect'))} · {esc(item.get('width'))}x{esc(item.get('height'))} · audio {esc(item.get('hasAudio'))}</dd><dt>Priority</dt><dd>{esc(item.get('reviewPriority'))}: {esc(item.get('reviewPriorityReason'))}</dd><dt>Platform fit</dt><dd>{esc(', '.join(item.get('platformFit') or []))}</dd><dt>Probe</dt><dd>{esc(item.get('probeStatus'))} {esc(item.get('probeWarning'))}</dd><dt>File</dt><dd><code>{esc(item.get('path'))}</code></dd></dl>
  <details><summary>Safe local commands</summary><ul>{commands}</ul></details>
</article>
""")
    page = f"""<!doctype html><html><head><meta charset='utf-8'><title>Studio shorts review decisions</title>
<style>
:root {{ color-scheme:dark; --bg:#101811; --panel:#1d2a1e; --line:#405234; --ink:#fff4d8; --muted:#c3b894; --gold:#f2cb48; --leaf:#79db8d; --clay:#d57660; --water:#79cce0; }}
* {{ box-sizing:border-box; }} body {{ margin:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; color:var(--ink); background:radial-gradient(circle at 12% 0%,rgba(121,219,141,.16),transparent 30%),var(--bg); }} main {{ max-width:1320px; margin:0 auto; padding:36px 24px 80px; }}
header,.card,.truth {{ border:1px solid var(--line); background:linear-gradient(135deg,rgba(29,42,30,.96),rgba(18,27,18,.9)); border-radius:28px; padding:24px; box-shadow:0 22px 70px rgba(0,0,0,.28); }} .eyebrow {{ color:var(--gold); letter-spacing:.2em; text-transform:uppercase; font-size:12px; font-weight:900; margin:0 0 8px; }} h1 {{ font-size:clamp(38px,7vw,72px); line-height:.92; margin:0 0 12px; }} p,small,dd {{ color:var(--muted); }} code,pre {{ color:#ffe89a; overflow-wrap:anywhere; }}
.metrics {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); gap:10px; margin:18px 0; }} .metrics div {{ border:1px solid var(--line); background:rgba(0,0,0,.22); border-radius:16px; padding:12px; }} .metrics strong {{ display:block; color:var(--leaf); font-size:28px; }} .metrics span {{ color:var(--muted); text-transform:uppercase; letter-spacing:.09em; font-size:11px; font-weight:900; }}
.grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(330px,1fr)); gap:18px; margin-top:18px; }} .card.keep {{ border-color:rgba(121,219,141,.55); }} .card.refine,.card.hold,.card.needs-more-evidence {{ border-color:rgba(242,203,72,.55); }} .card.reject {{ border-color:rgba(213,118,96,.55); opacity:.8; }} .top {{ display:flex; flex-wrap:wrap; gap:8px; }} .top span,.decision {{ border:1px solid var(--line); background:rgba(0,0,0,.22); border-radius:999px; padding:7px 10px; font-size:12px; font-weight:900; }} .decision {{ display:inline-flex; color:var(--gold); text-transform:uppercase; letter-spacing:.08em; margin:12px 0; }} video {{ width:100%; aspect-ratio:9/16; max-height:520px; object-fit:contain; border-radius:18px; background:#050805; border:1px solid rgba(255,255,255,.1); }} .missing {{ min-height:260px; display:grid; place-items:center; color:var(--clay); border:1px solid rgba(213,118,96,.45); border-radius:18px; background:rgba(0,0,0,.25); }} dl {{ display:grid; grid-template-columns:90px minmax(0,1fr); gap:8px; }} dt {{ color:var(--gold); font-weight:900; }} details {{ margin-top:12px; border:1px solid var(--line); border-radius:16px; padding:12px; background:rgba(0,0,0,.18); }} li {{ margin:0 0 10px; }} li small {{ display:block; }}
</style></head><body><main>
<header><p class='eyebrow'>Quipsly Studio · local shorts intent</p><h1>Short decisions without fake publishing truth.</h1><p>This is the calm middle layer: watch/listen, then record local intent. Keep is not public approval; receipts stay empty until a real platform action exists.</p><div class='metrics'>{metrics}</div></header>
<section class='truth'><p class='eyebrow'>Truth boundary</p><p>{esc(ledger.get('truth'))}</p></section>
<section class='grid'>{''.join(cards)}</section>
</main></body></html>"""
    path.write_text(page, encoding="utf-8")


def pointer_payload(ledger: dict[str, Any]) -> dict[str, Any]:
    return {
        "schema": "quipsly.latest-studio-short-review-decision-ledger.v1",
        "generatedAt": ledger.get("generatedAt"),
        "updatedAt": ledger.get("updatedAt"),
        "status": ledger.get("status"),
        "htmlPath": ledger.get("htmlPath"),
        "jsonPath": ledger.get("jsonPath"),
        "markdownPath": ledger.get("markdownPath"),
        "csvPath": ledger.get("csvPath"),
        "eventLogPath": ledger.get("eventLogPath"),
        "counts": ledger.get("counts", {}),
        "firstSafeAction": ledger.get("firstSafeAction", {}),
        "firstDryRunCommand": ledger.get("firstDryRunCommand", ""),
        "nextSafestAction": ledger.get("nextSafestAction", ""),
        "truth": ledger.get("truthFlags", {}),
    }


def build_ledger(root: Path, *, persist: bool = True) -> dict[str, Any]:
    command_room_rows, command_room_source = rows_from_command_room(root)
    batch = load_pointer_target(root / LATEST_BATCH_POINTER)
    existing = load_json(ledger_path(root))
    prior = existing_by_id(existing)
    batch_rows = batch.get("rows") if isinstance(batch.get("rows"), list) else []
    rows: list[dict[str, Any]] = []
    seen: set[str] = set()
    for source_kind_name, source_rows in (
        ("shorts-command-room", command_room_rows),
        ("shorts-review-batch", batch_rows),
    ):
        for row in source_rows:
            if not isinstance(row, dict):
                continue
            short_id = str(row.get("id") or "")
            if not short_id or short_id in seen:
                continue
            merged = dict(row)
            merged["_reviewSource"] = source_kind_name
            rows.append(merged)
            seen.add(short_id)
    if command_room_rows and batch_rows:
        source_kind = "shorts-command-room-plus-review-batch"
    elif command_room_rows:
        source_kind = "shorts-command-room"
    else:
        source_kind = "legacy-shorts-review-batch"
    source_html = command_room_source.get("htmlPath") or str(batch.get("htmlPath") or "")
    source_json = command_room_source.get("jsonPath") or str(batch.get("jsonPath") or "")
    items = [item_from_row(row, prior.get(str(row.get("id") or ""), {})) for row in rows if isinstance(row, dict)]
    counts = recompute_counts(items)
    now = iso_now()
    out_dir = ledger_dir(root)
    html_path = out_dir / "index.html"
    json_path = ledger_path(root)
    markdown_path = out_dir / "STUDIO-SHORT-REVIEW-DECISION-LEDGER.md"
    csv_path = out_dir / "studio-short-review-decision-ledger.csv"
    first = items[0] if items else {}
    first_dry = ""
    if first:
        first_dry = next((command.get("command", "") for command in first.get("safeCommands", []) if command.get("label") == "Dry-run keep"), "")
    ledger = {
        "schema": SCHEMA,
        "generatedAt": existing.get("generatedAt") or now,
        "updatedAt": now,
        "status": "short-review-decisions-pending" if counts["pending"] else "short-review-decisions-recorded",
        "releaseRoot": str(root),
        "sourceKind": source_kind,
        "sourceBatchHtml": source_html,
        "sourceBatchJson": source_json,
        "legacySourceBatchHtml": str(batch.get("htmlPath") or ""),
        "legacySourceBatchJson": str(batch.get("jsonPath") or ""),
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "eventLogPath": str(event_log_path(root)),
        "allowedDecisions": sorted(DECISIONS),
        "counts": counts,
        "items": items,
        "firstDryRunCommand": first_dry,
        "nextSafestAction": "Open the shorts batch, watch/listen locally, dry-run one short decision, then record local intent only after review.",
        "firstSafeAction": {
            "label": "Open Studio short review decision ledger",
            "path": str(html_path),
            "command": f"open {shell_quote(str(html_path))}",
            "safety": "Opens local shorts review decision ledger only. No publish, upload, schedule, approval, source mutation, overwrite, delete, or receipt truth.",
        },
        "truth": "Local shorts review intent only. It does not approve publication, upload, schedule, mutate accounts, mutate media, overwrite, delete, or create receipt truth.",
        "truthFlags": {
            "externalPublishing": False,
            "externalUpload": False,
            "externalSchedulesCreated": False,
            "approvalCreated": False,
            "receiptTruthCreated": False,
            "accountMutation": False,
            "sourceFilesMutated": False,
            "versionsOverwritten": False,
            "filesDeleted": False,
        },
    }
    if persist:
        write_html(ledger, html_path)
        markdown_path.write_text(render_markdown(ledger), encoding="utf-8")
        write_csv(ledger, csv_path)
        write_json(json_path, ledger)
        write_json(latest_pointer_path(root), pointer_payload(ledger))
    return ledger


def record_decision(root: Path, short_id: str, decision: str, reviewer: str, notes: str, *, dry_run: bool) -> dict[str, Any]:
    decision = decision.strip().lower()
    if decision not in DECISIONS:
        raise SystemExit(f"Decision must be one of {sorted(DECISIONS)}")
    ledger = build_ledger(root, persist=not dry_run)
    items = ledger.get("items") if isinstance(ledger.get("items"), list) else []
    item = next((entry for entry in items if str(entry.get("shortId")) == short_id), None)
    if not item:
        valid = ", ".join(str(entry.get("shortId")) for entry in items[:20])
        raise SystemExit(f"Short id not found: {short_id}. Valid examples: {valid}")
    before = dict(item)
    after = dict(item)
    after.update({
        "decision": decision,
        "status": "pending-local-review" if decision == "pending" else "local-review-recorded",
        "reviewer": reviewer,
        "reviewedAt": iso_now(),
        "notes": notes,
    })
    if dry_run:
        preview_items = [after if str(entry.get("shortId")) == short_id else entry for entry in items]
        return {
            "ok": True,
            "dryRun": True,
            "kind": "studio-short-review-decision",
            "ledgerPath": str(ledger_path(root)),
            "shortId": short_id,
            "decision": decision,
            "before": before,
            "afterPreview": after,
            "countsPreview": recompute_counts(preview_items),
            "ledgerMutated": False,
            "eventAppended": False,
            "externalActionTaken": False,
            "mediaMutated": False,
            "receiptTruthCreated": False,
            "truth": "Dry-run only. No ledger file, event log, media, account, platform, publication, schedule, or receipt state changed.",
        }
    path = ledger_path(root)
    snapshot = snapshot_ledger(path)
    for index, entry in enumerate(items):
        if str(entry.get("shortId")) == short_id:
            items[index] = after
            break
    ledger["items"] = items
    ledger["updatedAt"] = iso_now()
    ledger["counts"] = recompute_counts(items)
    ledger["status"] = "short-review-decisions-pending" if ledger["counts"]["pending"] else "short-review-decisions-recorded"
    write_html(ledger, Path(str(ledger["htmlPath"])))
    Path(str(ledger["markdownPath"])).write_text(render_markdown(ledger), encoding="utf-8")
    write_csv(ledger, Path(str(ledger["csvPath"])))
    write_json(path, ledger)
    write_json(latest_pointer_path(root), pointer_payload(ledger))
    event = {
        "schema": "quipsly.studio.short-review-decision-event.v1",
        "createdAt": iso_now(),
        "kind": "studio-short-review-decision",
        "shortId": short_id,
        "decision": decision,
        "reviewer": reviewer,
        "before": before,
        "after": after,
        "snapshotPath": str(snapshot),
        "externalActionTaken": False,
        "mediaMutated": False,
        "receiptTruthCreated": False,
    }
    event_path = append_event(root, event)
    return {
        "ok": True,
        "dryRun": False,
        "kind": "studio-short-review-decision",
        "ledgerPath": str(path),
        "htmlPath": ledger.get("htmlPath"),
        "eventLogPath": str(event_path),
        "snapshotPath": str(snapshot),
        "snapshotCreated": True,
        "eventAppended": True,
        "ledgerMutated": True,
        "shortId": short_id,
        "decision": decision,
        "counts": ledger.get("counts"),
        "externalActionTaken": False,
        "mediaMutated": False,
        "receiptTruthCreated": False,
        "truth": "Local short review ledger updated only. No publication approval, upload, schedule, account mutation, media mutation, overwrite, delete, or receipt truth.",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Build or update the Studio short review decision ledger.")
    sub = parser.add_subparsers(dest="command")
    build = sub.add_parser("build")
    build.add_argument("root", nargs="?", default=str(DEFAULT_RELEASE_ROOT))
    record = sub.add_parser("record")
    record.add_argument("short_id")
    record.add_argument("decision")
    record.add_argument("reviewer")
    record.add_argument("notes", nargs="?", default="")
    record.add_argument("--root", default=str(DEFAULT_RELEASE_ROOT))
    record.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    if args.command in {None, "build"}:
        root = Path(getattr(args, "root", str(DEFAULT_RELEASE_ROOT))).expanduser().resolve()
        ledger = build_ledger(root)
        print(json.dumps({
            "status": ledger["status"],
            "counts": ledger["counts"],
            "htmlPath": ledger["htmlPath"],
            "jsonPath": ledger["jsonPath"],
            "markdownPath": ledger["markdownPath"],
            "latestPointerPath": str(latest_pointer_path(root)),
            "firstSafeAction": ledger["firstSafeAction"],
            "firstDryRunCommand": ledger.get("firstDryRunCommand", ""),
        }, indent=2, sort_keys=True))
        return 0
    if args.command == "record":
        root = Path(args.root).expanduser().resolve()
        result = record_decision(root, args.short_id, args.decision, args.reviewer, args.notes, dry_run=args.dry_run)
        print(json.dumps(result, indent=2, sort_keys=True))
        return 0
    parser.print_help()
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
