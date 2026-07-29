#!/usr/bin/env python3
"""Episode 4 watched/source clip intake manifest.

Scans the Episode 4 source-clip drop folders, probes any dropped media, and
creates a safe intake board that can be matched to transcript cue IDs before any
timeline edit decision is written.

Safety boundary: read-only media scan plus sidecar metadata. This command never
imports clips into the session, writes timeline decisions, creates shorts,
renders exports, publishes, uploads, deletes, renames, moves, or mutates source
media.
"""
from __future__ import annotations

import argparse
import html
import json
import re
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
PRIMARY_DROP_ROOT = RELEASE_ROOT / "Episode_04_Watched_Source_Clip_Dropbox"
PRIMARY_NEEDS_HUMAN_DROP = PRIMARY_DROP_ROOT / "needs-human-identification"
LEGACY_DROP_ROOTS = [
    Path("/Volumes/My Passport/Episode 4/Watched Clips"),
    Path("/Volumes/My Passport/Episode 4/Source Clips"),
    Path("/Volumes/My Passport/Episode 4/Reference Clips"),
]
CUE_POINTER = RELEASE_ROOT / "review-board/episode4-transcript-cues/latest-episode4-transcript-cues.json"
INTELLIGENCE_POINTER = RELEASE_ROOT / "review-board/episode4-edit-intelligence/latest-episode4-edit-intelligence.json"
OUT_ROOT = RELEASE_ROOT / "review-board/episode4-source-clip-intake"
LATEST_POINTER = OUT_ROOT / "latest-episode4-source-clip-intake.json"
SCHEMA = "quipsly.episode4-source-clip-intake.v1"

MEDIA_SUFFIXES = {
    ".3gp", ".aac", ".aif", ".aiff", ".flac", ".m4a", ".m4v", ".mov", ".mp3", ".mp4", ".mpe", ".mpeg",
    ".mpg", ".mts", ".mxf", ".wav", ".webm",
}


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-source-clip-intake")


def esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""))


def fmt_time(seconds: Any) -> str:
    try:
        value = max(0.0, float(seconds or 0.0))
    except Exception:
        value = 0.0
    whole = int(value)
    return f"{whole // 3600:02d}:{(whole % 3600) // 60:02d}:{whole % 60:02d}"


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


def load_pointer(path: Path) -> dict[str, Any]:
    pointer = load_json(path)
    target_text = str(pointer.get("jsonPath") or "")
    target = Path(target_text) if target_text else None
    if target and target.exists() and target != path:
        target_payload = load_json(target)
        if target_payload:
            return {**pointer, **target_payload}
    return pointer


def ensure_drop_roots() -> None:
    for folder in [
        PRIMARY_NEEDS_HUMAN_DROP,
        PRIMARY_DROP_ROOT / "confirmed-source-clips",
        PRIMARY_DROP_ROOT / "parked-not-sure",
        *LEGACY_DROP_ROOTS,
    ]:
        folder.mkdir(parents=True, exist_ok=True)


def truth() -> dict[str, Any]:
    return {
        "sidecarIntakeMetadataOnly": True,
        "sourceFilesReadOnly": True,
        "sourceFilesMutated": False,
        "sourceFilesMovedOrRenamed": False,
        "clipsImported": False,
        "timelineDecisionsWritten": False,
        "shortsCreated": False,
        "exportsRendered": False,
        "externalPublishing": False,
        "versionsOverwritten": False,
        "filesDeleted": False,
    }


def detect_cue_ids(path: Path) -> list[str]:
    text = str(path).lower()
    ids = set(re.findall(r"ep4-cue-\d{3}", text))
    for bare in re.findall(r"(?<![a-z0-9])cue[-_ ]?(\d{1,3})(?![a-z0-9])", text):
        ids.add(f"ep4-cue-{int(bare):03d}")
    return sorted(ids)


def detect_workorder_ids(path: Path) -> list[str]:
    text = str(path).lower()
    ids = set(re.findall(r"ep4-clip-weave-\d{3}", text))
    for bare in re.findall(r"(?<![a-z0-9])clip[-_ ]?weave[-_ ]?(\d{1,3})(?![a-z0-9])", text):
        ids.add(f"ep4-clip-weave-{int(bare):03d}")
    return sorted(ids)


def source_kind_for(path: Path) -> str:
    text = str(path.parent).lower()
    if "watched" in text:
        return "watched-clip"
    if "reference" in text:
        return "reference-clip"
    if "source" in text:
        return "source-clip"
    return "candidate-clip"


def confirmation_status_for(path: Path) -> str:
    parts = {part.lower() for part in path.parts}
    if "confirmed-source-clips" in parts:
        return "confirmed-folder-unreviewed"
    if "needs-human-identification" in parts:
        return "needs-human-identification"
    if "parked-not-sure" in parts:
        return "parked-not-sure"
    if {"watched clips", "source clips", "reference clips"} & parts:
        return "legacy-drop-folder-unreviewed"
    return "candidate-unreviewed"


def probe_media(path: Path) -> dict[str, Any]:
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        return {"ok": False, "error": "ffprobe not found", "durationSeconds": None, "kind": "unknown", "streams": []}
    try:
        result = subprocess.run(
            [
                ffprobe,
                "-v",
                "error",
                "-print_format",
                "json",
                "-show_format",
                "-show_streams",
                str(path),
            ],
            check=False,
            text=True,
            capture_output=True,
            timeout=30,
        )
    except Exception as exc:
        return {"ok": False, "error": str(exc), "durationSeconds": None, "kind": "unknown", "streams": []}
    if result.returncode != 0:
        return {
            "ok": False,
            "error": (result.stderr or result.stdout or "ffprobe failed").strip()[:1000],
            "durationSeconds": None,
            "kind": "unknown",
            "streams": [],
        }
    payload = json.loads(result.stdout or "{}")
    streams = payload.get("streams") if isinstance(payload.get("streams"), list) else []
    format_payload = payload.get("format") if isinstance(payload.get("format"), dict) else {}
    duration = None
    try:
        duration = float(format_payload.get("duration")) if format_payload.get("duration") is not None else None
    except Exception:
        duration = None
    has_video = any(stream.get("codec_type") == "video" for stream in streams if isinstance(stream, dict))
    has_audio = any(stream.get("codec_type") == "audio" for stream in streams if isinstance(stream, dict))
    kind = "video+audio" if has_video and has_audio else "video" if has_video else "audio" if has_audio else "unknown"
    summarized_streams: list[dict[str, Any]] = []
    for stream in streams:
        if not isinstance(stream, dict):
            continue
        summarized_streams.append({
            "type": stream.get("codec_type"),
            "codec": stream.get("codec_name"),
            "width": stream.get("width"),
            "height": stream.get("height"),
            "rFrameRate": stream.get("r_frame_rate"),
            "sampleRate": stream.get("sample_rate"),
            "channels": stream.get("channels"),
            "duration": stream.get("duration"),
        })
    return {
        "ok": True,
        "error": "",
        "durationSeconds": duration,
        "durationLabel": fmt_time(duration),
        "kind": kind,
        "hasVideo": has_video,
        "hasAudio": has_audio,
        "streams": summarized_streams,
        "formatName": format_payload.get("format_name"),
        "formatLongName": format_payload.get("format_long_name"),
        "sizeBytes": int(format_payload.get("size") or path.stat().st_size),
    }


def scan_files(roots: list[Path]) -> list[Path]:
    files: list[Path] = []
    for root in roots:
        if not root.exists():
            continue
        for path in sorted(root.rglob("*")):
            if not path.is_file():
                continue
            if path.name.startswith("."):
                continue
            if path.suffix.lower() not in MEDIA_SUFFIXES:
                continue
            files.append(path)
    return files


def cue_lookup(cues: dict[str, Any]) -> dict[str, dict[str, Any]]:
    lookup: dict[str, dict[str, Any]] = {}
    for group in cues.get("cueGroups") or []:
        if isinstance(group, dict) and group.get("cueId"):
            lookup[str(group["cueId"])] = group
    return lookup


def workorder_lookup(intelligence: dict[str, Any]) -> dict[str, dict[str, Any]]:
    lookup: dict[str, dict[str, Any]] = {}
    for row in intelligence.get("clipWeaveWorkorders") or []:
        if isinstance(row, dict) and row.get("id"):
            lookup[str(row["id"])] = row
    return lookup


def build_manifest(args: argparse.Namespace) -> dict[str, Any]:
    ensure_drop_roots()
    roots = [Path(root).expanduser() for root in (args.scan_root or [])] if args.scan_root else [PRIMARY_DROP_ROOT, *LEGACY_DROP_ROOTS]
    cues = load_pointer(Path(args.cue_pointer))
    intelligence = load_pointer(Path(args.intelligence_pointer))
    cues_by_id = cue_lookup(cues)
    workorders_by_id = workorder_lookup(intelligence)
    files = scan_files(roots)
    rows: list[dict[str, Any]] = []
    for index, path in enumerate(files, 1):
        cue_ids = detect_cue_ids(path)
        workorder_ids = detect_workorder_ids(path)
        probe = probe_media(path) if not args.no_probe else {"ok": None, "skipped": True, "kind": "unprobed"}
        cue_matches = [cues_by_id[cid] for cid in cue_ids if cid in cues_by_id]
        workorder_matches = [workorders_by_id[wid] for wid in workorder_ids if wid in workorders_by_id]
        rows.append({
            "id": f"ep4-source-intake-{index:03d}",
            "path": str(path),
            "fileName": path.name,
            "parent": str(path.parent),
            "extension": path.suffix.lower(),
            "sizeBytes": path.stat().st_size,
            "sourceKind": source_kind_for(path),
            "confirmationStatus": confirmation_status_for(path),
            "cueIds": cue_ids,
            "workorderIds": workorder_ids,
            "cueMatches": cue_matches,
            "workorderMatches": workorder_matches,
            "matchStatus": "cue-id-matched" if cue_matches else "workorder-id-matched" if workorder_matches else "unmatched-needs-review",
            "probe": probe,
            "nextAction": next_action_for(cue_matches, workorder_matches, confirmation_status_for(path)),
        })
    counts = counts_for(rows)
    cue_recovery_checklist = cue_recovery_checklist_for(cues, rows)
    session_dir = Path(args.out_root) / stamp()
    manifest = {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": "episode4-source-clip-intake-ready" if rows else "episode4-source-clip-intake-empty",
        "episode": 4,
        "episodeLabel": "Episode 4",
        "sessionDir": str(session_dir),
        "scanRoots": [str(root) for root in roots],
        "cuePointer": str(args.cue_pointer),
        "intelligencePointer": str(args.intelligence_pointer),
        "dropInstructions": {
            "likely": str(PRIMARY_NEEDS_HUMAN_DROP),
            "confirmed": str(PRIMARY_DROP_ROOT / "confirmed-source-clips"),
            "ambiguous": str(PRIMARY_DROP_ROOT / "parked-not-sure"),
            "naming": "Prefer ep4-cue-013-short-description.ext or ep4-clip-weave-001-original-name.ext when known.",
        },
        "counts": counts,
        "cueRecoveryChecklist": cue_recovery_checklist,
        "clips": rows,
        "nextSafestAction": next_safest_action(rows),
        "nextActions": next_actions_for(rows, cue_recovery_checklist),
        "truth": truth(),
    }
    write_surfaces(session_dir, manifest, Path(args.latest_pointer))
    return manifest


def counts_for(rows: list[dict[str, Any]]) -> dict[str, Any]:
    status_counts: dict[str, int] = {}
    match_counts: dict[str, int] = {}
    kind_counts: dict[str, int] = {}
    probe_counts: dict[str, int] = {}
    for row in rows:
        status_counts[row["confirmationStatus"]] = status_counts.get(row["confirmationStatus"], 0) + 1
        match_counts[row["matchStatus"]] = match_counts.get(row["matchStatus"], 0) + 1
        kind_counts[row["sourceKind"]] = kind_counts.get(row["sourceKind"], 0) + 1
        probe_status = "probe-ok" if row.get("probe", {}).get("ok") else "probe-skipped" if row.get("probe", {}).get("skipped") else "probe-failed"
        probe_counts[probe_status] = probe_counts.get(probe_status, 0) + 1
    return {
        "files": len(rows),
        "statusCounts": status_counts,
        "matchCounts": match_counts,
        "kindCounts": kind_counts,
        "probeCounts": probe_counts,
        "cueMatched": sum(1 for row in rows if row["cueMatches"]),
        "workorderMatched": sum(1 for row in rows if row["workorderMatches"]),
        "unmatched": sum(1 for row in rows if row["matchStatus"] == "unmatched-needs-review"),
    }


def next_action_for(cue_matches: list[dict[str, Any]], workorder_matches: list[dict[str, Any]], status: str) -> str:
    if status == "parked-not-sure":
        return "Leave parked until Charlie/Mako confirms it belongs to Episode 4."
    if cue_matches or workorder_matches:
        return "Review against the linked transcript cue, then mark confirmed before creating a clip-weave branch."
    if status == "needs-human-identification":
        return "Listen/watch quickly, rename with ep4-cue-### if identifiable, or move to parked-not-sure."
    return "Review and add cue/workorder naming if this is a watched/source clip."


def next_safest_action(rows: list[dict[str, Any]]) -> str:
    if not rows:
        return f"Drop likely Episode 4 watched/source clips into {PRIMARY_NEEDS_HUMAN_DROP}, preferably with cue IDs from the shopping list."
    if any(row["matchStatus"] == "cue-id-matched" for row in rows):
        return "Open cue-matched clips beside the transcript cue board, then mark review decisions before timeline apply."
    return "Rename or review unmatched clips against the Episode 4 shopping list so they can be matched to transcript cue IDs."


def cue_recovery_checklist_for(cues: dict[str, Any], rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    matched_cues = {cue_id for row in rows for cue_id in row.get("cueIds", [])}
    checklist: list[dict[str, Any]] = []
    for group in cues.get("cueGroups") or []:
        if not isinstance(group, dict):
            continue
        cue_id = str(group.get("cueId") or "")
        if not cue_id:
            continue
        hits = group.get("hits") if isinstance(group.get("hits"), list) else []
        evidence = []
        for hit in hits[:3]:
            if isinstance(hit, dict):
                evidence.append(f"{hit.get('timeLabel', '')} {hit.get('text', '')}".strip())
        checklist.append({
            "cueId": cue_id,
            "status": "matched-file-present" if cue_id in matched_cues else "missing-source-file",
            "confidence": group.get("confidence") or "unknown",
            "cueType": group.get("cueType") or "",
            "reviewWindowLabel": group.get("reviewWindowLabel") or "",
            "hitCount": group.get("hitCount") or len(evidence),
            "score": group.get("score") or 0,
            "evidence": evidence,
            "suggestedFilename": f"{cue_id}-short-description.mp4",
            "humanAction": (
                f"Review Episode 4 around {group.get('reviewWindowLabel') or 'the cue window'}. "
                f"If this is a watched/source clip moment, copy the matching media into {PRIMARY_NEEDS_HUMAN_DROP} "
                f"as {cue_id}-short-description.mp4 or another cue-friendly filename."
            ),
        })
    confidence_rank = {"high": 0, "medium": 1, "low": 2}
    checklist.sort(key=lambda item: (
        0 if item["status"] == "missing-source-file" else 1,
        confidence_rank.get(str(item.get("confidence", "")).lower(), 3),
        -float(item.get("score") or 0),
        str(item.get("cueId") or ""),
    ))
    return checklist


def next_actions_for(rows: list[dict[str, Any]], cue_recovery_checklist: list[dict[str, Any]]) -> list[dict[str, Any]]:
    missing = [cue for cue in cue_recovery_checklist if cue.get("status") == "missing-source-file"]
    cue_matched = [row for row in rows if row.get("matchStatus") == "cue-id-matched"]
    unmatched = [row for row in rows if row.get("matchStatus") == "unmatched-needs-review"]

    actions: list[dict[str, Any]] = []
    if missing:
        first = missing[0]
        actions.append({
            "priority": 1,
            "title": f"Find watched/source clip for {first.get('cueId')}",
            "why": f"Episode 4 clip-weave apply is blocked until source media is confirmed. Start with {first.get('reviewWindowLabel')} because it is the highest-ranked missing cue.",
            "command": f"Drop a likely file as {first.get('suggestedFilename')} into {PRIMARY_NEEDS_HUMAN_DROP}",
        })
    if cue_matched:
        actions.append({
            "priority": 2,
            "title": "Review cue-matched files",
            "why": f"{len(cue_matched)} file(s) include cue IDs and can be checked against transcript windows.",
            "command": "./script/agentctl.sh episode4-source-clip-intake --json",
        })
    if unmatched:
        actions.append({
            "priority": 3,
            "title": "Identify unmatched files",
            "why": f"{len(unmatched)} dropped file(s) need cue IDs or parking before they can safely unlock clip-weave edits.",
            "command": "Rename files with ep4-cue-### when identified, or move ambiguous files to parked-not-sure.",
        })
    actions.append({
        "priority": 4,
        "title": "Rebuild apply preview after intake changes",
        "why": "Apply-preview is the safety seam that keeps source-required work from becoming pretend timeline metadata.",
        "command": "./script/agentctl.sh episode4-apply-preview",
    })
    return actions


def render_markdown(manifest: dict[str, Any]) -> str:
    lines = [
        "# Episode 4 source clip intake",
        "",
        f"Status: `{manifest.get('status')}`",
        f"Generated: `{manifest.get('generatedAt')}`",
        "",
        "## Truth boundary",
        "",
        "Read-only sidecar manifest. No clip has been imported, no timeline decision has been written, and no original media has been mutated.",
        "",
        "## Counts",
        "",
        f"- Files: `{manifest.get('counts', {}).get('files', 0)}`",
        f"- Cue-matched: `{manifest.get('counts', {}).get('cueMatched', 0)}`",
        f"- Workorder-matched: `{manifest.get('counts', {}).get('workorderMatched', 0)}`",
        f"- Unmatched: `{manifest.get('counts', {}).get('unmatched', 0)}`",
        "",
        "## Drop instructions",
        "",
    ]
    instructions = manifest.get("dropInstructions", {})
    for key in ["likely", "confirmed", "ambiguous", "naming"]:
        lines.append(f"- {key}: `{instructions.get(key)}`")
    lines.append("")
    checklist = manifest.get("cueRecoveryChecklist") or []
    if checklist:
        lines += ["## Cue recovery checklist", ""]
        for cue in checklist[:10]:
            evidence_text = " | ".join(cue.get("evidence") or []) if cue.get("evidence") else ""
            lines += [
                f"### {cue.get('cueId')} - {cue.get('status')}",
                "",
                f"- Confidence: `{cue.get('confidence')}`",
                f"- Review window: `{cue.get('reviewWindowLabel')}`",
                f"- Suggested filename: `{cue.get('suggestedFilename')}`",
                f"- Evidence: {evidence_text}",
                "",
            ]
        lines += ["", "## Clips", ""]
    else:
        lines += ["", "## Clips", ""]
    for row in manifest.get("clips") or []:
        probe = row.get("probe") or {}
        lines += [
            f"### {row.get('id')} - {row.get('fileName')}",
            "",
            f"- Path: `{row.get('path')}`",
            f"- Status: `{row.get('confirmationStatus')}`",
            f"- Match: `{row.get('matchStatus')}`",
            f"- Kind: `{row.get('sourceKind')}` / `{probe.get('kind')}` / `{probe.get('durationLabel') or 'unknown duration'}`",
            f"- Cue IDs: `{', '.join(row.get('cueIds') or []) or 'none'}`",
            f"- Workorder IDs: `{', '.join(row.get('workorderIds') or []) or 'none'}`",
            f"- Next: {row.get('nextAction')}",
            "",
        ]
    if not manifest.get("clips"):
        lines.append("No media files found yet. Drop likely clips into the intake folders and rerun this command.")
        lines.append("")
    return "\n".join(lines)


def render_html(manifest: dict[str, Any]) -> str:
    rows_html = []
    for row in manifest.get("clips") or []:
        probe = row.get("probe") or {}
        cue_text = ", ".join(row.get("cueIds") or []) or "none"
        workorder_text = ", ".join(row.get("workorderIds") or []) or "none"
        rows_html.append(
            f"""
            <article class="clip {esc(row.get('matchStatus'))}">
              <div>
                <p class="eyebrow">{esc(row.get('id'))} · {esc(row.get('confirmationStatus'))}</p>
                <h2>{esc(row.get('fileName'))}</h2>
                <p>{esc(row.get('path'))}</p>
              </div>
              <dl>
                <div><dt>Match</dt><dd>{esc(row.get('matchStatus'))}</dd></div>
                <div><dt>Kind</dt><dd>{esc(row.get('sourceKind'))} / {esc(probe.get('kind'))}</dd></div>
                <div><dt>Duration</dt><dd>{esc(probe.get('durationLabel') or 'unknown')}</dd></div>
                <div><dt>Cue IDs</dt><dd>{esc(cue_text)}</dd></div>
                <div><dt>Workorders</dt><dd>{esc(workorder_text)}</dd></div>
              </dl>
              <p class="next">{esc(row.get('nextAction'))}</p>
            </article>
            """
        )
    if not rows_html:
        rows_html.append(
            """
            <article class="empty">
              <h2>No source clips dropped yet</h2>
              <p>Use the shopping list, then drop likely watched/source clips into the folders below. Quipsly will not pretend missing clips exist.</p>
            </article>
            """
        )
    counts = manifest.get("counts") or {}
    instructions = manifest.get("dropInstructions") or {}
    cue_cards = []
    for cue in (manifest.get("cueRecoveryChecklist") or [])[:8]:
        cue_cards.append(
            f"""
            <article class="cue {esc(cue.get('status'))}">
              <p class="eyebrow">{esc(cue.get('cueId'))} · {esc(cue.get('confidence'))}</p>
              <h2>{esc(cue.get('reviewWindowLabel'))}</h2>
              <p>{esc(' | '.join(cue.get('evidence') or []))}</p>
              <p><code>{esc(cue.get('suggestedFilename'))}</code></p>
            </article>
            """
        )
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Episode 4 Source Clip Intake</title>
  <style>
    body {{ margin: 0; background: #171d18; color: #f2ecd8; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }}
    main {{ max-width: 1180px; margin: 0 auto; padding: 44px 24px 72px; }}
    .hero, .clip, .cue, .empty {{ border: 1px solid rgba(224, 190, 113, .26); background: linear-gradient(135deg, rgba(49, 62, 43, .92), rgba(32, 38, 33, .96)); border-radius: 22px; padding: 24px; box-shadow: 0 18px 44px rgba(0,0,0,.24); }}
    h1 {{ margin: 0; font-family: Georgia, serif; font-size: 42px; }}
    h2 {{ margin: 4px 0 8px; }}
    p {{ color: #cfc6aa; line-height: 1.5; }}
    code {{ color: #ffe28a; }}
    .eyebrow {{ color: #f0bd4f; text-transform: uppercase; letter-spacing: .16em; font-weight: 800; font-size: 12px; }}
    .metrics {{ display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin: 22px 0; }}
    .metric {{ border-radius: 16px; background: rgba(255,255,255,.06); padding: 16px; }}
    .metric strong {{ display: block; color: #ffe28a; font-size: 28px; }}
    .folders {{ display: grid; gap: 8px; margin-top: 20px; }}
    .clip {{ margin-top: 16px; }}
    .cue {{ margin-top: 14px; border-color: rgba(240, 189, 79, .34); }}
    .clip dl {{ display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; }}
    .clip dl div {{ border-radius: 14px; background: rgba(0,0,0,.2); padding: 12px; }}
    dt {{ color: #9ba68d; font-size: 12px; text-transform: uppercase; letter-spacing: .12em; }}
    dd {{ margin: 4px 0 0; font-weight: 800; }}
    .cue-id-matched {{ border-color: rgba(77, 209, 124, .55); }}
    .unmatched-needs-review {{ border-color: rgba(240, 189, 79, .44); }}
    .next {{ color: #f2ecd8; font-weight: 700; }}
  </style>
</head>
<body>
<main>
  <section class="hero">
    <p class="eyebrow">Quipsly Episode 4</p>
    <h1>Source Clip Intake</h1>
    <p>Drop likely watched/source clips here. Quipsly scans and matches them to transcript cues without touching source media or writing timeline edits.</p>
    <div class="metrics">
      <div class="metric"><strong>{esc(counts.get('files', 0))}</strong> files</div>
      <div class="metric"><strong>{esc(counts.get('cueMatched', 0))}</strong> cue matched</div>
      <div class="metric"><strong>{esc(counts.get('workorderMatched', 0))}</strong> workorder matched</div>
      <div class="metric"><strong>{esc(counts.get('unmatched', 0))}</strong> unmatched</div>
    </div>
    <div class="folders">
      <code>{esc(instructions.get('likely'))}</code>
      <code>{esc(instructions.get('confirmed'))}</code>
      <code>{esc(instructions.get('ambiguous'))}</code>
    </div>
    <p><strong>Next safest action:</strong> {esc(manifest.get('nextSafestAction'))}</p>
  </section>
  <section>
    <p class="eyebrow">Cue recovery checklist</p>
    {''.join(cue_cards)}
  </section>
  {''.join(rows_html)}
</main>
</body>
</html>
"""


def cue_status_label(cue: dict[str, Any]) -> str:
    status = str(cue.get("status") or "missing-source-file")
    return status.replace("-", " ")


def render_recovery_markdown(manifest: dict[str, Any]) -> str:
    checklist = manifest.get("cueRecoveryChecklist") or []
    instructions = manifest.get("dropInstructions") or {}
    missing = [cue for cue in checklist if cue.get("status") == "missing-source-file"]
    matched = [cue for cue in checklist if cue.get("status") != "missing-source-file"]
    lines = [
        "# Episode 4 watched/source clip recovery board",
        "",
        f"Generated: `{manifest.get('generatedAt')}`",
        f"Status: `{manifest.get('status')}`",
        f"Missing cues: `{len(missing)}`",
        f"Matched cues: `{len(matched)}`",
        "",
        "## Rules of the road",
        "",
        "- This board is for finding watched/source clips only.",
        "- Do not invent clips, write timeline decisions, export, publish, move originals, or overwrite anything from this board.",
        "- Drop likely files into the dropbox and include the cue ID in the filename when possible.",
        "",
        "## Dropbox",
        "",
        f"- Likely clips: `{instructions.get('likely')}`",
        f"- Confirmed clips: `{instructions.get('confirmed')}`",
        f"- Ambiguous clips: `{instructions.get('ambiguous')}`",
        f"- Naming: `{instructions.get('naming')}`",
        "",
        "## Missing cue tasks",
        "",
    ]

    if not missing:
        lines.append("No missing cue tasks remain in the current intake manifest.")
        lines.append("")
    for index, cue in enumerate(missing, 1):
        evidence = cue.get("evidence") if isinstance(cue.get("evidence"), list) else []
        lines += [
            f"### {index}. {cue.get('cueId')} - {cue_status_label(cue)}",
            "",
            f"- Confidence: `{cue.get('confidence')}`",
            f"- Review window: `{cue.get('reviewWindowLabel')}`",
            f"- Suggested filename: `{cue.get('suggestedFilename')}`",
            f"- Drop command: `Drop a likely file as {cue.get('suggestedFilename')} into {instructions.get('likely')}`",
            "- Evidence:",
        ]
        if evidence:
            for line in evidence[:4]:
                lines.append(f"  - {line}")
        else:
            lines.append("  - No transcript evidence available.")
        lines.append("")

    if matched:
        lines += ["## Matched cue tasks", ""]
        for cue in matched:
            lines += [
                f"### {cue.get('cueId')} - {cue_status_label(cue)}",
                "",
                f"- Confidence: `{cue.get('confidence')}`",
                f"- Review window: `{cue.get('reviewWindowLabel')}`",
                f"- Suggested filename: `{cue.get('suggestedFilename')}`",
                "",
            ]

    lines += [
        "## After adding files",
        "",
        "```bash",
        "./script/agentctl.sh episode4-source-clip-intake",
        "./script/agentctl.sh episode4-apply-preview",
        "./script/agentctl.sh episode4-cut-intelligence-state --save-markdown",
        "```",
        "",
    ]
    return "\n".join(lines)


def render_recovery_html(manifest: dict[str, Any]) -> str:
    checklist = manifest.get("cueRecoveryChecklist") or []
    instructions = manifest.get("dropInstructions") or {}
    missing = [cue for cue in checklist if cue.get("status") == "missing-source-file"]
    matched = [cue for cue in checklist if cue.get("status") != "missing-source-file"]

    def cue_card(cue: dict[str, Any], index: int) -> str:
        evidence = cue.get("evidence") if isinstance(cue.get("evidence"), list) else []
        evidence_html = "".join(f"<li>{esc(line)}</li>" for line in evidence[:4]) or "<li>No transcript evidence available.</li>"
        status = str(cue.get("status") or "")
        return f"""
        <article class="cue-card {esc(status)}">
          <div class="cue-head">
            <p class="eyebrow">Task {index:02d} · {esc(cue.get('confidence'))}</p>
            <strong>{esc(cue.get('cueId'))}</strong>
            <span>{esc(cue_status_label(cue))}</span>
          </div>
          <h2>{esc(cue.get('reviewWindowLabel'))}</h2>
          <p class="filename">{esc(cue.get('suggestedFilename'))}</p>
          <p class="drop">Drop as <code>{esc(cue.get('suggestedFilename'))}</code> into <code>{esc(instructions.get('likely'))}</code></p>
          <ul>{evidence_html}</ul>
        </article>
        """

    missing_cards = "".join(cue_card(cue, index) for index, cue in enumerate(missing, 1))
    if not missing_cards:
        missing_cards = "<article class=\"cue-card matched-file-present\"><h2>No missing cue tasks remain.</h2></article>"
    matched_cards = "".join(cue_card(cue, index) for index, cue in enumerate(matched, 1))
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Episode 4 Watched Clip Recovery Board</title>
  <style>
    body {{ margin: 0; background: radial-gradient(circle at 20% 10%, #293a2b 0, #141915 42%, #0e120f 100%); color: #f5efd9; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }}
    main {{ max-width: 1220px; margin: 0 auto; padding: 42px 24px 80px; }}
    .hero, .cue-card, .rules {{ border: 1px solid rgba(230, 190, 92, .25); border-radius: 26px; background: linear-gradient(135deg, rgba(37, 49, 38, .94), rgba(28, 32, 28, .98)); box-shadow: 0 24px 70px rgba(0,0,0,.28); }}
    .hero {{ padding: 30px; }}
    h1 {{ margin: 0; font-family: Georgia, serif; font-size: clamp(36px, 6vw, 72px); line-height: .95; }}
    h2 {{ margin: 8px 0 10px; }}
    p, li {{ color: #d5cba9; line-height: 1.5; }}
    code {{ color: #ffe58a; overflow-wrap: anywhere; }}
    .eyebrow {{ color: #f4c85d; text-transform: uppercase; letter-spacing: .16em; font-weight: 900; font-size: 12px; }}
    .metrics {{ display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-top: 24px; }}
    .metric {{ border-radius: 18px; padding: 18px; background: rgba(255,255,255,.065); }}
    .metric strong {{ display: block; color: #ffe58a; font-size: 32px; }}
    .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; margin-top: 18px; }}
    .cue-card {{ padding: 20px; }}
    .cue-head {{ display: grid; grid-template-columns: 1fr auto; gap: 6px 12px; align-items: start; }}
    .cue-head strong {{ color: #ffe58a; font-size: 18px; }}
    .cue-head span {{ color: #f07163; font-weight: 900; text-transform: uppercase; font-size: 12px; }}
    .matched-file-present .cue-head span {{ color: #72d98a; }}
    .filename {{ color: #f5efd9; font-weight: 900; }}
    .drop {{ background: rgba(0,0,0,.24); border-radius: 14px; padding: 12px; }}
    .rules {{ margin-top: 18px; padding: 20px; }}
    section {{ margin-top: 30px; }}
  </style>
</head>
<body>
<main>
  <section class="hero">
    <p class="eyebrow">Quipsly Episode 4</p>
    <h1>Watched/source clip recovery board</h1>
    <p>Find the missing clips without breaking the edit. This board is generated from transcript cues and current intake state; source media stays untouched.</p>
    <div class="metrics">
      <div class="metric"><strong>{esc(len(missing))}</strong> missing cues</div>
      <div class="metric"><strong>{esc(len(matched))}</strong> matched cues</div>
      <div class="metric"><strong>{esc(manifest.get('counts', {}).get('files', 0))}</strong> dropped files</div>
      <div class="metric"><strong>{esc(manifest.get('counts', {}).get('cueMatched', 0))}</strong> cue matched</div>
    </div>
  </section>
  <section class="rules">
    <p><strong>Dropbox:</strong> <code>{esc(instructions.get('likely'))}</code></p>
    <p><strong>After adding files:</strong> run <code>./script/agentctl.sh episode4-source-clip-intake</code>, then <code>./script/agentctl.sh episode4-apply-preview</code>.</p>
    <p><strong>Safety:</strong> no import, no timeline write, no export, no publish, no source mutation from this board.</p>
  </section>
  <section>
    <p class="eyebrow">Missing cue tasks</p>
    <div class="grid">{missing_cards}</div>
  </section>
  <section>
    <p class="eyebrow">Matched cue tasks</p>
    <div class="grid">{matched_cards or '<article class="cue-card"><h2>No matched cues yet.</h2></article>'}</div>
  </section>
</main>
</body>
</html>
"""


def write_surfaces(session_dir: Path, manifest: dict[str, Any], latest_pointer: Path = LATEST_POINTER) -> None:
    json_path = session_dir / "episode4-source-clip-intake.json"
    markdown_path = session_dir / "episode4-source-clip-intake.md"
    html_path = session_dir / "index.html"
    recovery_markdown_path = session_dir / "episode4-watched-source-clip-recovery-board.md"
    recovery_html_path = session_dir / "recovery-board.html"
    manifest.update({
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "htmlPath": str(html_path),
        "recoveryMarkdownPath": str(recovery_markdown_path),
        "recoveryHtmlPath": str(recovery_html_path),
    })
    write_json(json_path, manifest)
    markdown_path.write_text(render_markdown(manifest), encoding="utf-8")
    html_path.write_text(render_html(manifest), encoding="utf-8")
    recovery_markdown_path.write_text(render_recovery_markdown(manifest), encoding="utf-8")
    recovery_html_path.write_text(render_recovery_html(manifest), encoding="utf-8")
    write_json(latest_pointer, {
        "schema": "quipsly.episode4-source-clip-intake-pointer.v1",
        "generatedAt": iso_now(),
        "status": manifest.get("status"),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "htmlPath": str(html_path),
        "recoveryMarkdownPath": str(recovery_markdown_path),
        "recoveryHtmlPath": str(recovery_html_path),
        "counts": manifest.get("counts"),
        "nextActions": manifest.get("nextActions"),
        "cueRecoveryChecklist": (manifest.get("cueRecoveryChecklist") or [])[:10],
        "truth": manifest.get("truth"),
    })


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scan-root", action="append", help="Folder to scan. May be provided more than once.")
    parser.add_argument("--cue-pointer", default=str(CUE_POINTER))
    parser.add_argument("--intelligence-pointer", default=str(INTELLIGENCE_POINTER))
    parser.add_argument("--out-root", default=str(OUT_ROOT), help="Output root for generated intake surfaces.")
    parser.add_argument("--latest-pointer", default=str(LATEST_POINTER), help="Pointer JSON to update after generation.")
    parser.add_argument("--no-probe", action="store_true", help="Skip ffprobe metadata extraction.")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--markdown", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    manifest = build_manifest(args)
    if args.json:
        print(json.dumps(manifest, indent=2, sort_keys=True))
        return
    if args.markdown:
        print(render_markdown(manifest))
        return
    counts = manifest.get("counts") or {}
    print(f"Episode 4 source clip intake: {manifest.get('status')}")
    print(f"  Board: {manifest.get('htmlPath')}")
    print(f"  Manifest: {manifest.get('jsonPath')}")
    print(f"  Files: {counts.get('files', 0)} cue-matched={counts.get('cueMatched', 0)} unmatched={counts.get('unmatched', 0)}")
    print(f"  Next: {manifest.get('nextSafestAction')}")


if __name__ == "__main__":
    main()
