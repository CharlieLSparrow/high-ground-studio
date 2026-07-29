#!/usr/bin/env python3
"""Build a human-friendly Episode 4 watched/source clip recovery packet.

This consolidates transcript cue-review windows, current source-placeholder state,
and the watched/source dropbox into a single artifact Charlie can use while
re-watching Episode 4 to remember which clips were shown.

Safety boundary: read-only packet generation. This command never imports clips,
writes timeline/session state, renders exports, publishes, deletes, overwrites
prior packet versions, or mutates source media.
"""
from __future__ import annotations

import argparse
import html
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
CUE_REVIEW_POINTER = RELEASE_ROOT / "review-board/episode4-source-clip-cue-review/latest-episode4-source-clip-cue-review.json"
PLACEHOLDER_POINTER = RELEASE_ROOT / "review-board/episode4-source-placeholder-workbench/latest-episode4-source-placeholder-workbench.json"
SOURCE_INTAKE_POINTER = RELEASE_ROOT / "review-board/episode4-source-clip-intake/latest-episode4-source-clip-intake.json"
DROPBOX = RELEASE_ROOT / "Episode_04_Watched_Source_Clip_Dropbox/needs-human-identification"
OUT_ROOT = RELEASE_ROOT / "review-board/episode4-watched-source-recovery-packet"
LATEST_POINTER = OUT_ROOT / "latest-episode4-watched-source-recovery-packet.json"
SCHEMA = "quipsly.episode4-watched-source-recovery-packet.v1"
MEDIA_SUFFIXES = {
    ".3gp",
    ".aac",
    ".aif",
    ".aiff",
    ".flac",
    ".m4a",
    ".m4v",
    ".mov",
    ".mp3",
    ".mp4",
    ".mpe",
    ".mpeg",
    ".mpg",
    ".mts",
    ".mxf",
    ".wav",
    ".webm",
}


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-watched-source-recovery")


def esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""))


def file_url(value: Any) -> str:
    text = as_text(value)
    if not text:
        return ""
    try:
        return Path(text).as_uri()
    except Exception:
        return ""


def load_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except Exception:
        return {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def payload_from_pointer(path: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    pointer = load_json(path)
    for key in ("jsonPath", "ledgerPath", "manifestPath"):
        target = pointer.get(key)
        if isinstance(target, str) and target:
            payload = load_json(Path(target))
            if payload:
                return pointer, payload
    return pointer, pointer


def dict_list(value: Any) -> list[dict[str, Any]]:
    return value if isinstance(value, list) and all(isinstance(item, dict) for item in value) else []


def as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def as_text(value: Any, fallback: str = "") -> str:
    if value is None:
        return fallback
    text = str(value).strip()
    return text if text else fallback


def dropbox_files(path: Path) -> list[str]:
    try:
        return sorted(
            [
                name
                for name in os.listdir(path)
                if not name.startswith(".") and (path / name).is_file() and Path(name).suffix.casefold() in MEDIA_SUFFIXES
            ],
            key=str.casefold,
        )
    except Exception:
        return []


def priority_for(item: dict[str, Any], placeholder_ids: set[str]) -> int:
    cue_id = as_text(item.get("cueId"))
    score = float(item.get("score") or 0)
    confidence = as_text(item.get("confidence")).casefold()
    priority = int(max(0, 100 - score))
    if cue_id in placeholder_ids:
        priority -= 100
    if confidence == "high":
        priority -= 20
    if as_dict(item.get("audioReviewClip")).get("ok"):
        priority -= 5
    return priority


def cue_to_packet_item(item: dict[str, Any], placeholder: dict[str, Any] | None, dropbox: Path) -> dict[str, Any]:
    contexts = dict_list(item.get("contexts"))
    audio = as_dict(item.get("audioReviewClip"))
    cue_id = as_text(item.get("cueId"), "unknown-cue")
    evidence = []
    for context in contexts[:5]:
        label = as_text(context.get("timeLabel"), "time?")
        text = as_text(context.get("text"))
        if text:
            evidence.append(f"{label} {text}")
    suggested = as_text(item.get("suggestedFilename"), f"{cue_id}-short-description.mp4")
    human_action = (
        f"Listen around {as_text(item.get('reviewWindowLabel'), 'the cue window')}; "
        f"if this was a watched/source clip, copy it into {dropbox} as {suggested}."
    )
    status = "primary-placeholder" if placeholder else as_text(item.get("status"), "missing-source-file")
    capture_prompt = (
        "While reviewing this cue, capture the watched clip title/description, source URL or file path if known, "
        "approximate in/out, and whether the match is certain enough to import."
    )
    return {
        "cueId": cue_id,
        "status": status,
        "confidence": as_text(item.get("confidence"), "unknown"),
        "score": item.get("score", 0),
        "reviewWindowLabel": as_text(item.get("reviewWindowLabel"), "time unknown"),
        "reviewStartSeconds": item.get("reviewStartSeconds"),
        "reviewEndSeconds": item.get("reviewEndSeconds"),
        "suggestedFilename": suggested,
        "dropboxPath": str(dropbox),
        "audioReviewClipPath": as_text(audio.get("path")),
        "audioReviewClipOk": bool(audio.get("ok")),
        "audioReviewClipDurationSeconds": audio.get("durationSeconds"),
        "sourceAudioPath": as_text(item.get("sourceAudioPath")),
        "evidence": evidence,
        "humanAction": human_action,
        "capturePrompt": capture_prompt,
        "memoryFields": {
            "clipTitleOrDescription": "",
            "sourceUrlOrFilePath": "",
            "sourceInOut": "",
            "whyItBelongsHere": "",
            "confidence": "unknown",
            "notes": "",
        },
        "dropInstruction": f"Copy the matching clip into {dropbox} as {suggested}.",
        "afterDropCommand": "./script/agentctl.sh episode4-source-clip-intake && ./script/agentctl.sh episode4-apply-preview && ./script/agentctl.sh episode4-cut-intelligence-state --markdown",
        "placeholderIntent": as_text(as_dict(placeholder or {}).get("intent")),
        "jCutHint": as_text(as_dict(placeholder or {}).get("jCutHint")),
        "lCutHint": as_text(as_dict(placeholder or {}).get("lCutHint")),
    }


def counts_for(items: list[dict[str, Any]], files: list[str]) -> dict[str, Any]:
    return {
        "cues": len(items),
        "highConfidence": sum(1 for item in items if as_text(item.get("confidence")).casefold() == "high"),
        "audioReviewClips": sum(1 for item in items if item.get("audioReviewClipOk")),
        "primaryPlaceholders": sum(1 for item in items if item.get("status") == "primary-placeholder"),
        "dropboxFiles": len(files),
        "readyForIntake": len(files) > 0,
    }


def truth() -> dict[str, Any]:
    return {
        "readOnlyPacket": True,
        "clipsImported": False,
        "timelineDecisionsWritten": False,
        "branchMetadataWritten": False,
        "sourceFilesMutated": False,
        "exportsRendered": False,
        "externalPublishing": False,
        "versionsOverwritten": False,
        "filesDeleted": False,
    }


def render_markdown(packet: dict[str, Any]) -> str:
    counts = as_dict(packet.get("counts"))
    items = dict_list(packet.get("items"))
    next_cue = as_dict(packet.get("nextCue"))
    lines = [
        "# Episode 4 watched/source clip recovery packet",
        "",
        f"Generated: `{packet.get('generatedAt')}`",
        f"Status: `{packet.get('status')}`",
        f"Cue count: `{counts.get('cues', 0)}`",
        f"High-confidence cues: `{counts.get('highConfidence', 0)}`",
        f"Audio review clips: `{counts.get('audioReviewClips', 0)}`",
        f"Dropbox media files now: `{counts.get('dropboxFiles', 0)}`",
        "",
        "## Start here",
        "",
        "1. Listen to the audio review clip for the highest priority cue.",
        "2. Re-watch that part of Episode 4 if needed.",
        "3. Copy the matching watched/source clip into the dropbox with the cue ID in the filename.",
        "4. Rerun intake/apply preview. Do not force a clip if the source is uncertain.",
        "",
        f"Dropbox: `{packet.get('dropboxPath')}`",
        f"Clip notes scratchpad: `{packet.get('scratchpadPath')}`",
        f"Found-clip manifest template: `{packet.get('foundClipManifestTemplatePath')}`",
        "",
        "```bash",
        "./script/agentctl.sh episode4-watched-source-recovery-packet --markdown",
        "./script/agentctl.sh episode4-source-clip-intake && ./script/agentctl.sh episode4-apply-preview",
        "```",
        "",
        "## Next cue focus",
        "",
    ]
    if next_cue:
        lines.extend(
            [
                f"- Cue: `{next_cue.get('cueId')}`",
                f"- Window: `{next_cue.get('reviewWindowLabel')}`",
                f"- Suggested filename: `{next_cue.get('suggestedFilename')}`",
                f"- Audio review clip: `{next_cue.get('audioReviewClipPath') or 'missing'}`",
                f"- Drop here: `{next_cue.get('dropboxPath')}`",
                f"- After drop: `{next_cue.get('afterDropCommand')}`",
                "",
                "Evidence:",
            ]
        )
        evidence = next_cue.get("evidence") if isinstance(next_cue.get("evidence"), list) else []
        for evidence_line in evidence[:4]:
            lines.append(f"- {evidence_line}")
        if not evidence:
            lines.append("- No transcript evidence recorded.")
    else:
        lines.append("- No next cue is available.")
    lines.extend(
        [
            "",
        "## Cue checklist",
        "",
        ]
    )
    for index, item in enumerate(items, start=1):
        lines.extend(
            [
                f"### {index}. {item.get('cueId')} - {item.get('reviewWindowLabel')}",
                "",
                f"- Status: `{item.get('status')}`",
                f"- Confidence: `{item.get('confidence')}`",
                f"- Suggested filename: `{item.get('suggestedFilename')}`",
                f"- Audio review clip: `{item.get('audioReviewClipPath') or 'missing'}`",
                f"- Action: {item.get('humanAction')}",
                f"- Capture: {item.get('capturePrompt')}",
            ]
        )
        if item.get("jCutHint") or item.get("lCutHint"):
            lines.append(f"- J-cut hint: {item.get('jCutHint') or 'none'}")
            lines.append(f"- L-cut hint: {item.get('lCutHint') or 'none'}")
        lines.append("- Evidence:")
        evidence = item.get("evidence") if isinstance(item.get("evidence"), list) else []
        for evidence_line in evidence[:4]:
            lines.append(f"  - {evidence_line}")
        if not evidence:
            lines.append("  - No transcript evidence recorded.")
        lines.append("")
    lines.extend(
        [
            "## Safety boundary",
            "",
            "This packet is a recovery checklist only. It does not import clips, mutate source media, write timeline metadata, render exports, or publish anything.",
            "",
        ]
    )
    return "\n".join(lines)


def render_scratchpad(packet: dict[str, Any]) -> str:
    items = dict_list(packet.get("items"))
    lines = [
        "# Episode 4 watched/source clip identification scratchpad",
        "",
        f"Generated: `{packet.get('generatedAt')}`",
        f"Dropbox: `{packet.get('dropboxPath')}`",
        "",
        "Use this while re-watching Episode 4. Rough notes are enough. The goal is to recover real clips, not to make perfect documentation on the first pass.",
        "",
        "| Cue | Window | Clip title / description | Source URL or file path | Source in/out | Confidence | Notes |",
        "| --- | --- | --- | --- | --- | --- | --- |",
    ]
    for item in items:
        cue = as_text(item.get("cueId"))
        window = as_text(item.get("reviewWindowLabel"))
        evidence = "; ".join(str(value).replace("|", "/") for value in (item.get("evidence") or [])[:2])
        lines.append(f"| {cue} | {window} |  |  |  | unknown | {evidence} |")
    lines.extend(
        [
            "",
            "## Drop convention",
            "",
            "When a clip is found, copy it into the dropbox with the cue ID in the filename.",
            "",
            "Example:",
            "",
            "```text",
            "ep4-cue-013-raccoon-crossing-source.mp4",
            "```",
            "",
            "## Safety",
            "",
            "This scratchpad is recovery data only. It does not import clips, write timeline metadata, mutate source media, render exports, or publish anything.",
            "",
        ]
    )
    return "\n".join(lines)


def found_clip_manifest_template(packet: dict[str, Any]) -> dict[str, Any]:
    candidates: list[dict[str, Any]] = []
    for item in dict_list(packet.get("items")):
        cue_id = as_text(item.get("cueId"))
        candidates.append(
            {
                "cueId": cue_id,
                "reviewWindowLabel": as_text(item.get("reviewWindowLabel")),
                "suggestedFilename": as_text(item.get("suggestedFilename"), f"{cue_id}-short-description.mp4"),
                "dropboxPath": as_text(item.get("dropboxPath"), as_text(packet.get("dropboxPath"))),
                "candidateFilePath": "",
                "clipTitleOrDescription": "",
                "sourceUrlOrFilePath": "",
                "sourceInOut": "",
                "whyItBelongsHere": "",
                "confidence": "unknown",
                "proposedRole": "watched-source-clip",
                "importIntent": "hold-until-intake-confirms-cue-match",
                "syncIntent": "candidate-insert-near-cue-window",
                "promotionAllowed": False,
                "afterDropCommand": as_text(item.get("afterDropCommand")),
                "evidence": (item.get("evidence") or [])[:4],
                "notes": "",
            }
        )
    return {
        "schema": SCHEMA + ".found-clip-manifest-template.v1",
        "generatedAt": as_text(packet.get("generatedAt")),
        "episode": as_text(packet.get("episode"), "episode-4"),
        "dropboxPath": as_text(packet.get("dropboxPath")),
        "purpose": "Editable cue-to-file manifest for recovered Episode 4 watched/source clips.",
        "instructions": [
            "Fill one candidate row when a watched/source clip is identified.",
            "Copy or place the real file in the dropbox with the cue ID in the filename.",
            "Set candidateFilePath if the file lives somewhere else and should be reviewed before copying.",
            "Keep promotionAllowed false until source intake confirms the cue/file match.",
            "Do not invent missing media; uncertain matches should stay confidence=low or unknown.",
        ],
        "safety": truth(),
        "candidates": candidates,
    }


def render_next_markdown(packet: dict[str, Any], item: dict[str, Any]) -> str:
    lines = [
        "# Episode 4 next watched/source clip cue",
        "",
        f"- Packet status: `{packet.get('status')}`",
        f"- Cue: `{item.get('cueId')}`",
        f"- Confidence: `{item.get('confidence')}`",
        f"- Review window: `{item.get('reviewWindowLabel')}`",
        f"- Suggested filename: `{item.get('suggestedFilename')}`",
        f"- Audio review clip: `{item.get('audioReviewClipPath') or 'missing'}`",
        f"- Dropbox: `{item.get('dropboxPath')}`",
        "",
        "## What to do",
        "",
        f"1. Re-watch or listen around `{item.get('reviewWindowLabel')}`.",
        "2. Identify the watched/source media being introduced or discussed.",
        f"3. Copy the matching file into the dropbox as `{item.get('suggestedFilename')}`.",
        "4. Rerun intake/apply preview before any clip-weave decision is promoted.",
        "",
        "```bash",
        f"# after the file is in place",
        f"{item.get('afterDropCommand')}",
        "```",
        "",
        "## Evidence",
        "",
    ]
    evidence = item.get("evidence") if isinstance(item.get("evidence"), list) else []
    for evidence_line in evidence[:6]:
        lines.append(f"- {evidence_line}")
    if not evidence:
        lines.append("- No transcript evidence recorded.")
    if item.get("jCutHint") or item.get("lCutHint"):
        lines.extend(
            [
                "",
                "## Edit-rhythm hint after recovery",
                "",
                f"- J-cut: {item.get('jCutHint') or 'none'}",
                f"- L-cut: {item.get('lCutHint') or 'none'}",
            ]
        )
    lines.extend(
        [
            "",
            "## Safety boundary",
            "",
            "This is a cue-finding handoff only. It does not import clips, write timeline metadata, render exports, mutate source media, or publish anything.",
        ]
    )
    return "\n".join(lines)


def render_html(packet: dict[str, Any]) -> str:
    counts = as_dict(packet.get("counts"))
    next_cue = as_dict(packet.get("nextCue"))
    next_audio_url = file_url(next_cue.get("audioReviewClipPath"))
    next_cue_card = ""
    if next_cue:
        next_evidence = "".join(f"<li>{esc(line)}</li>" for line in (next_cue.get("evidence") or [])[:4])
        next_audio = (
            f"<audio controls preload='metadata' src='{esc(next_audio_url)}'></audio>"
            if next_audio_url
            else "<p class='warn'>No audio review clip is available for this cue.</p>"
        )
        next_cue_card = (
            "<section class='next-cue'>"
            "<p class='meta'>Start with this cue</p>"
            f"<h2>{esc(next_cue.get('cueId'))} <span>{esc(next_cue.get('reviewWindowLabel'))}</span></h2>"
            f"{next_audio}"
            f"<p><strong>Save recovered file as:</strong> <code>{esc(next_cue.get('suggestedFilename'))}</code></p>"
            f"<p><strong>Drop folder:</strong> <code>{esc(next_cue.get('dropboxPath'))}</code></p>"
            "<p>Listen, re-watch the window if needed, then drop the matching source clip with the cue ID. Quipsly will not invent this media.</p>"
            f"<ul>{next_evidence}</ul>"
            "</section>"
        )
    cards = []
    for item in dict_list(packet.get("items")):
        evidence = "".join(f"<li>{esc(line)}</li>" for line in (item.get("evidence") or [])[:4])
        audio = as_text(item.get("audioReviewClipPath"), "missing")
        audio_url = file_url(audio)
        audio_control = (
            f"<audio controls preload='metadata' src='{esc(audio_url)}'></audio>"
            if audio_url
            else "<p class='warn'>No playable audio review clip is available.</p>"
        )
        cards.append(
            "<article class='card'>"
            f"<p class='meta'>{esc(item.get('status'))} · {esc(item.get('confidence'))}</p>"
            f"<h2>{esc(item.get('cueId'))} <span>{esc(item.get('reviewWindowLabel'))}</span></h2>"
            f"<p><strong>Filename:</strong> <code>{esc(item.get('suggestedFilename'))}</code></p>"
            f"<p><strong>Audio review:</strong> <code>{esc(audio)}</code></p>"
            f"{audio_control}"
            f"<p>{esc(item.get('humanAction'))}</p>"
            f"<p><strong>Capture:</strong> {esc(item.get('capturePrompt'))}</p>"
            f"<ul>{evidence}</ul>"
            "</article>"
        )
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Episode 4 watched/source recovery</title>
  <style>
    :root {{ color-scheme: dark; --bg:#10170f; --panel:#1d291b; --ink:#f6eed3; --muted:#bdae8a; --moss:#6ec98b; --honey:#f0c95a; --clay:#d66b55; }}
    body {{ margin:0; padding:32px; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif; background: radial-gradient(circle at top left, #203625, var(--bg)); color:var(--ink); }}
    .hero {{ max-width:1100px; margin:0 auto 20px; padding:22px; border:1px solid rgba(240,201,90,.24); border-radius:24px; background:rgba(29,41,27,.88); }}
    h1 {{ margin:.2rem 0; font-size:34px; }}
    .stats {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); gap:10px; margin-top:16px; }}
    .stat {{ padding:12px; border-radius:16px; background:rgba(255,255,255,.06); }}
    .stat b {{ display:block; color:var(--honey); font-size:22px; }}
    .next-cue {{ max-width:1100px; margin:0 auto 18px; padding:20px; border-radius:24px; background:linear-gradient(135deg, rgba(240,201,90,.18), rgba(110,201,139,.12)); border:1px solid rgba(240,201,90,.38); box-shadow:0 22px 70px rgba(0,0,0,.22); }}
    .grid {{ max-width:1100px; margin:0 auto; display:grid; gap:14px; }}
    .card {{ padding:18px; border-radius:20px; background:rgba(22,29,20,.92); border:1px solid rgba(110,201,139,.24); }}
    .meta {{ color:var(--honey); text-transform:uppercase; letter-spacing:.11em; font-size:12px; font-weight:800; }}
    h2 {{ margin:.2rem 0 .6rem; }} h2 span {{ color:var(--muted); font-size:15px; }}
    audio {{ display:block; width:100%; margin:12px 0; accent-color:var(--honey); }}
    code {{ color:var(--moss); white-space:pre-wrap; }} li {{ margin:.35rem 0; color:var(--muted); }}
    .warn {{ color:var(--clay); font-weight:800; }}
  </style>
</head>
<body>
  <section class='hero'>
    <p class='meta'>Quipsly Episode 4</p>
    <h1>Watched/source clip recovery packet</h1>
    <p>Use this while re-watching the episode. Copy confirmed clips into the dropbox with cue IDs; do not invent source media.</p>
    <p><strong>Dropbox:</strong> <code>{esc(packet.get('dropboxPath'))}</code></p>
    <p><strong>Scratchpad:</strong> <code>{esc(packet.get('scratchpadPath'))}</code></p>
    <p><strong>Found-clip manifest template:</strong> <code>{esc(packet.get('foundClipManifestTemplatePath'))}</code></p>
    <div class='stats'>
      <div class='stat'><b>{esc(counts.get('cues', 0))}</b> cues</div>
      <div class='stat'><b>{esc(counts.get('highConfidence', 0))}</b> high confidence</div>
      <div class='stat'><b>{esc(counts.get('audioReviewClips', 0))}</b> audio clips</div>
      <div class='stat'><b>{esc(counts.get('dropboxFiles', 0))}</b> dropbox files</div>
    </div>
  </section>
  {next_cue_card}
  <main class='grid'>{''.join(cards)}</main>
</body>
</html>
"""


def build_packet(args: argparse.Namespace) -> dict[str, Any]:
    cue_pointer, cue_payload = payload_from_pointer(args.cue_review_pointer)
    _placeholder_pointer, placeholder_payload = payload_from_pointer(args.placeholder_pointer)
    intake_pointer, intake_payload = payload_from_pointer(args.source_intake_pointer)
    placeholder_items = dict_list(placeholder_payload.get("items") or placeholder_payload.get("placeholders") or [])
    placeholder_by_cue = {as_text(item.get("cueId")): item for item in placeholder_items if as_text(item.get("cueId"))}
    review_items = dict_list(cue_payload.get("reviewItems") or cue_payload.get("items") or [])
    items = [cue_to_packet_item(item, placeholder_by_cue.get(as_text(item.get("cueId"))), args.dropbox) for item in review_items]
    items.sort(key=lambda item: priority_for(item, set(placeholder_by_cue.keys())))
    files = dropbox_files(args.dropbox)
    next_cue = items[0] if items else {}
    packet = {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": "episode4-watched-source-recovery-ready" if items else "episode4-watched-source-recovery-empty",
        "episode": "episode-4",
        "dropboxPath": str(args.dropbox),
        "dropboxFiles": files,
        "cueReviewPointer": str(args.cue_review_pointer),
        "cueReviewJsonPath": as_text(cue_pointer.get("jsonPath")),
        "placeholderPointer": str(args.placeholder_pointer),
        "sourceIntakePointer": str(args.source_intake_pointer),
        "sourceIntakeStatus": as_text(intake_payload.get("status"), as_text(intake_pointer.get("status"), "unknown")),
        "items": items,
        "nextCue": next_cue,
        "counts": counts_for(items, files),
        "nextSafestAction": "Identify the highest-priority cue's watched/source clip, copy it into the dropbox with the cue ID, then rerun source intake and apply preview.",
        "truth": truth(),
    }
    return packet


def write_packet(packet: dict[str, Any]) -> dict[str, Any]:
    session_dir = OUT_ROOT / stamp()
    session_dir.mkdir(parents=True, exist_ok=True)
    json_path = session_dir / "episode4-watched-source-recovery-packet.json"
    markdown_path = session_dir / "episode4-watched-source-recovery-packet.md"
    scratchpad_path = session_dir / "episode4-watched-source-clip-identification-scratchpad.md"
    manifest_template_path = session_dir / "episode4-watched-source-found-clip-manifest.template.json"
    html_path = session_dir / "index.html"
    packet.update({
        "sessionDir": str(session_dir),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "scratchpadPath": str(scratchpad_path),
        "foundClipManifestTemplatePath": str(manifest_template_path),
        "htmlPath": str(html_path),
    })
    write_json(json_path, packet)
    markdown_path.write_text(render_markdown(packet), encoding="utf-8")
    scratchpad_path.write_text(render_scratchpad(packet), encoding="utf-8")
    write_json(manifest_template_path, found_clip_manifest_template(packet))
    html_path.write_text(render_html(packet), encoding="utf-8")
    pointer = {
        "schema": SCHEMA + ".pointer",
        "generatedAt": iso_now(),
        "status": packet.get("status"),
        "sessionDir": str(session_dir),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "scratchpadPath": str(scratchpad_path),
        "foundClipManifestTemplatePath": str(manifest_template_path),
        "htmlPath": str(html_path),
        "dropboxPath": packet.get("dropboxPath"),
        "nextCue": packet.get("nextCue"),
        "counts": packet.get("counts"),
        "nextSafestAction": packet.get("nextSafestAction"),
        "truth": packet.get("truth"),
    }
    write_json(LATEST_POINTER, pointer)
    return packet


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cue-review-pointer", type=Path, default=CUE_REVIEW_POINTER)
    parser.add_argument("--placeholder-pointer", type=Path, default=PLACEHOLDER_POINTER)
    parser.add_argument("--source-intake-pointer", type=Path, default=SOURCE_INTAKE_POINTER)
    parser.add_argument("--dropbox", type=Path, default=DROPBOX)
    parser.add_argument("--json", action="store_true", help="Print JSON. This is the default.")
    parser.add_argument("--markdown", action="store_true", help="Print Markdown.")
    parser.add_argument("--next", action="store_true", help="Print the next single cue instead of the full packet.")
    parser.add_argument("--cue-id", help="Print a specific cue when used with --next.")
    args = parser.parse_args()
    packet = write_packet(build_packet(args))
    if args.next:
        items = dict_list(packet.get("items"))
        selected = {}
        if args.cue_id:
            selected = next((item for item in items if as_text(item.get("cueId")) == args.cue_id), {})
        else:
            selected = as_dict(packet.get("nextCue"))
        payload = {
            "schema": SCHEMA + ".next-cue",
            "generatedAt": iso_now(),
            "status": "episode4-watched-source-next-cue-ready" if selected else "episode4-watched-source-next-cue-missing",
            "packetJsonPath": packet.get("jsonPath"),
            "packetMarkdownPath": packet.get("markdownPath"),
            "cue": selected,
            "truth": truth(),
        }
        if args.markdown:
            print(render_next_markdown(packet, selected) if selected else "# Episode 4 next watched/source clip cue\n\nNo matching cue found.")
        else:
            print(json.dumps(payload, indent=2, sort_keys=True))
    elif args.markdown:
        print(render_markdown(packet))
    else:
        print(json.dumps(packet, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
