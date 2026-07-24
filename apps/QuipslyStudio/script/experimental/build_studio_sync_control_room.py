#!/usr/bin/env python3
"""Build an Episode sync control room from the latest sync investigation.

This is a reviewer/agent front door for major A/V duration and sync questions.
It reads existing local evidence and writes versioned guidance only. It does not
trim, re-stack, render, publish, upload, schedule, overwrite, delete, approve,
create receipts, or mutate original/source media.
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

DEFAULT_RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
SCHEMA = "quipsly.studio-sync-control-room.v1"
POINTER_SCHEMA = "quipsly.studio-sync-control-room.latest-pointer.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-studio-sync-control-room")


def esc(value: Any) -> str:
    return html.escape(str(value or ""))


def shell_quote(value: str) -> str:
    return shlex.quote(value)


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
        return Path(path).expanduser().resolve().as_uri()
    except Exception:
        return ""


def safe_float(value: Any) -> float:
    try:
        return float(value or 0)
    except Exception:
        return 0.0


def safe_int(value: Any) -> int:
    try:
        return int(value or 0)
    except Exception:
        return 0


def format_hms(seconds: float) -> str:
    seconds = max(0, int(round(seconds)))
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    if h:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"


def pointer_and_payload(release_root: Path) -> tuple[dict[str, Any], dict[str, Any], Path]:
    pointer_path = release_root / "review-board" / "sync-investigations" / "latest-sync-investigation.json"
    pointer = load_json(pointer_path)
    if not pointer:
        pointer_path = release_root / "review-board" / "latest-sync-investigation.json"
        pointer = load_json(pointer_path)
    target = Path(str(pointer.get("jsonPath") or ""))
    payload = load_json(target) if target.exists() else {}
    return pointer, payload, pointer_path


def artifact_row(artifact: dict[str, Any]) -> dict[str, Any]:
    summary = artifact.get("summary") if isinstance(artifact.get("summary"), dict) else {}
    path = str(artifact.get("path") or "")
    return {
        "key": str(artifact.get("key") or ""),
        "label": str(artifact.get("label") or artifact.get("key") or "artifact"),
        "path": path,
        "exists": bool(artifact.get("exists")) or Path(path).exists(),
        "sizeBytes": safe_int(artifact.get("sizeBytes")),
        "durationSeconds": safe_float(summary.get("durationSeconds") or artifact.get("manifestDurationSeconds")),
        "videoStreams": safe_int(summary.get("videoStreams")),
        "audioStreams": safe_int(summary.get("audioStreams")),
        "openCommand": f"open {shell_quote(path)}" if path else "",
        "mediaUri": file_uri(path),
    }


def snippet_item(snippet: dict[str, Any]) -> dict[str, Any]:
    output_path = str(snippet.get("outputPath") or "")
    return {
        "outputPath": output_path,
        "ok": bool(snippet.get("ok")) or Path(output_path).exists(),
        "returnCode": snippet.get("returnCode"),
        "openCommand": f"open {shell_quote(output_path)}" if output_path else "",
        "mediaUri": file_uri(output_path),
    }


def comparison_row(row: dict[str, Any]) -> dict[str, Any]:
    video = row.get("videoSnippet") if isinstance(row.get("videoSnippet"), dict) else {}
    audio = row.get("audioSnippet") if isinstance(row.get("audioSnippet"), dict) else {}
    return {
        "id": str(row.get("id") or ""),
        "label": str(row.get("label") or row.get("id") or "comparison"),
        "reason": str(row.get("reason") or "Compare video and podcast audio evidence."),
        "sequenceSeconds": safe_float(row.get("sequenceSeconds")),
        "videoStartSeconds": safe_float(row.get("videoStartSeconds")),
        "audioStartSeconds": safe_float(row.get("audioStartSeconds")),
        "durationSeconds": safe_float(row.get("durationSeconds") or 10),
        "videoSnippet": snippet_item(video),
        "audioSnippet": snippet_item(audio),
        "reviewPrompt": "Do these moments sound like the same part of the episode? If not, mark hold/re-stack instead of trimming blindly.",
    }


def decision_row(command_key: str, command: str) -> dict[str, Any]:
    label_map = {
        "holdCurrent16x9ForResync": "Hold 16:9 for re-sync",
        "holdCurrent9x16ForResync": "Hold 9:16 for re-sync",
        "holdCurrentPodcastAudioForResync": "Hold podcast audio for re-sync",
        "requestRestack16x9": "Request 16:9 re-stack/refine",
        "requestRestackPodcastAudio": "Request podcast-audio rebuild/refine",
    }
    return {
        "id": command_key,
        "label": label_map.get(command_key, command_key),
        "dryRunCommand": command.replace(" tower-review-decision ", " tower-review-decision-dry-run "),
        "liveCommandTemplate": command,
        "safety": "Dry-run first. Live ledger command requires explicit reviewer judgment; it still does not publish or create receipts.",
    }


def classify_tail(video_duration: float, audio_duration: float) -> dict[str, Any]:
    spread = max(0.0, audio_duration - video_duration)
    if spread >= 600:
        urgency = "major-tail-review"
        meaning = "Podcast audio continues materially after the video masters. Treat as a content/sync question, not a trim shortcut."
    elif spread >= 30:
        urgency = "tail-review"
        meaning = "Podcast audio is longer than video enough to require a reviewer decision before publishing."
    elif spread > 2:
        urgency = "minor-tail-review"
        meaning = "Small tail mismatch exists; reviewer can decide whether it is safe."
    else:
        urgency = "duration-aligned"
        meaning = "No material audio tail detected from durations."
    return {
        "urgency": urgency,
        "tailSeconds": spread,
        "tailLabel": format_hms(spread),
        "meaning": meaning,
        "safeDecisionOptions": [
            "Hold current package and rebuild/re-stack from source/proxies.",
            "Create a versioned trim candidate only after tail is confirmed expendable.",
            "Continue normal review only after a human says the mismatch is understood and acceptable.",
        ],
    }


def tail_decision_rows(tail: dict[str, Any]) -> list[dict[str, str]]:
    tail_label = str(tail.get("tailLabel") or "")
    return [
        {
            "id": "tail-real-content",
            "label": "Tail contains real episode content",
            "ifYouHear": f"The extra {tail_label} contains meaningful conversation, recap, outro, or usable material that is not present in the video masters.",
            "decision": "Hold the current v001 package and rebuild/re-stack from source/proxies. Do not trim away real content just to make durations match.",
            "safeNext": "Mark current 16:9, 9:16, and podcast audio as hold/re-stack using dry-run review commands first.",
        },
        {
            "id": "tail-dead-air-or-duplicate",
            "label": "Tail is dead air, duplicate, setup, or expendable cleanup",
            "ifYouHear": f"The extra {tail_label} is silence, room tone, duplicate ending, setup chatter, or material Charlie/Mako explicitly do not want in the episode.",
            "decision": "Prepare a new versioned trim candidate later. Never overwrite v001; preserve the current evidence as the reason for the candidate.",
            "safeNext": "Write a local note that a v002 trim candidate is allowed only after human review confirms the tail is expendable.",
        },
        {
            "id": "tail-wrong-source",
            "label": "Tail sounds like the wrong source or wrong take",
            "ifYouHear": "The video and audio seem to belong to different takes, exports, or source stacks, especially near the video ending.",
            "decision": "Hold the package and investigate source selection. This is a stack/relink problem, not an edit decision.",
            "safeNext": "Open the Episode 4 native sync stack, compare candidate audio lanes, and do not create a trim candidate yet.",
        },
        {
            "id": "tail-needs-more-evidence",
            "label": "Not enough confidence yet",
            "ifYouHear": "The snippets are inconclusive, the content is ambiguous, or reviewer attention is too tired to make a durable call.",
            "decision": "Do not force a decision. Generate or request longer tail snippets/transcript evidence and continue another lane.",
            "safeNext": "Leave Episode 4 in tail-review and continue packaging/review work elsewhere.",
        },
    ]


def build_payload(release_root: Path, out_dir: Path) -> dict[str, Any]:
    pointer, packet, pointer_path = pointer_and_payload(release_root)
    if not packet:
        raise SystemExit("No sync investigation packet found. Run ./script/agentctl.sh studio-sync-investigation 4 first.")
    artifacts = [artifact_row(item) for item in (packet.get("artifacts") or []) if isinstance(item, dict)]
    comparisons = [comparison_row(item) for item in (packet.get("comparisons") or []) if isinstance(item, dict)]
    review_commands = packet.get("reviewCommands") if isinstance(packet.get("reviewCommands"), dict) else {}
    decisions = [decision_row(key, value) for key, value in review_commands.items() if isinstance(value, str) and value]
    video_duration = safe_float(packet.get("videoDurationSeconds"))
    audio_duration = safe_float(packet.get("audioDurationSeconds"))
    tail = classify_tail(video_duration, audio_duration)
    tail_decisions = tail_decision_rows(tail)
    counts = packet.get("counts") if isinstance(packet.get("counts"), dict) else {}
    status = "sync-control-room-tail-review" if tail["tailSeconds"] > 30 else "sync-control-room-review-ready"
    first_path = str(out_dir / "index.html")
    first_safe_action = {
        "label": f"Open Episode {packet.get('episode')} sync control room",
        "command": f"open {shell_quote(first_path)}",
        "path": first_path,
        "safety": "Opens local sync evidence only. No trim, re-stack, render, publish, upload, schedule, overwrite, delete, approval, receipt, or source mutation occurs.",
    }
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": status,
        "releaseRoot": str(release_root),
        "sessionDir": str(out_dir),
        "episode": packet.get("episode"),
        "version": packet.get("version"),
        "spreadLabel": packet.get("spreadLabel") or tail["tailLabel"],
        "plainEnglishDurationSummary": packet.get("plainEnglishDurationSummary") or "",
        "diagnosis": packet.get("diagnosis") or tail["meaning"],
        "videoDurationSeconds": video_duration,
        "audioDurationSeconds": audio_duration,
        "durationSpreadSeconds": safe_float(packet.get("durationSpreadSeconds") or abs(audio_duration - video_duration)),
        "tailClassification": tail,
        "tailDecisionRows": tail_decisions,
        "counts": {
            "artifacts": len(artifacts),
            "comparisonRows": len(comparisons),
            "snippetPairs": len(comparisons),
            "snippets": safe_int(counts.get("snippets")),
            "snippetErrors": safe_int(counts.get("snippetErrors")),
            "sourceTasks": len(packet.get("sourceTasks") or []),
            "reviewDecisionTemplates": len(decisions),
            "tailDecisionRows": len(tail_decisions),
            "externalPublishing": False,
            "sourceFilesMutated": False,
            "originalMediaMutated": False,
            "versionsOverwritten": False,
            "receiptTruthCreated": False,
        },
        "firstSafeAction": first_safe_action,
        "humanAsk": "Open the sync control room, compare beginning/middle/video-ending/tail snippets, classify the audio tail, then choose hold, re-stack/rebuild, trim-candidate, or normal review.",
        "agentSafeParallelWork": "Codex can summarize snippet evidence, prepare tail-review notes, improve packets, and generate dry-run review commands. Do not execute live decisions without explicit reviewer judgment.",
        "nextSafestAction": "Classify the Episode 4 podcast-audio tail before any publish, trim, or rebuild decision.",
        "syncReviewProtocol": [
            "Confirm the 16:9, 9:16, and podcast-audio artifacts belong to the same intended Episode 4 export attempt.",
            "Compare shared beginning and middle snippets for obvious sync drift.",
            "Compare video-ending and extra-tail snippets to decide whether audio after the video is real content, duplicate/dead air, or wrong source.",
            "If the tail is real content or source mismatch, hold/re-stack instead of trimming blindly.",
            "If the tail is expendable, create a versioned trim candidate later; do not overwrite v001.",
        ],
        "artifactRows": artifacts,
        "comparisonRows": comparisons,
        "sourceTasks": packet.get("sourceTasks") or [],
        "decisionRows": decisions,
        "sourcePointers": {
            "syncInvestigationPointer": str(pointer_path),
            "syncInvestigationHtml": pointer.get("htmlPath") or packet.get("htmlPath") or "",
            "syncInvestigationJson": pointer.get("jsonPath") or packet.get("jsonPath") or "",
            "worksheetPath": pointer.get("worksheetPath") or packet.get("worksheetPath") or "",
        },
        "truth": {
            "description": "Studio sync control room only. It reads local sync evidence and writes versioned review guidance.",
            "externalPublishing": False,
            "sourceFilesMutated": False,
            "originalMediaMutated": False,
            "versionsOverwritten": False,
            "receiptTruthCreated": False,
            "exportsCreated": False,
            "decisionsWritten": False,
        },
    }


def write_csv(path: Path, payload: dict[str, Any]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["kind", "id", "label", "sequenceSeconds", "videoPath", "audioPath", "reason", "openVideo", "openAudio"])
        writer.writeheader()
        for row in payload.get("comparisonRows") or []:
            video = row.get("videoSnippet") if isinstance(row.get("videoSnippet"), dict) else {}
            audio = row.get("audioSnippet") if isinstance(row.get("audioSnippet"), dict) else {}
            writer.writerow({
                "kind": "comparison",
                "id": row.get("id"),
                "label": row.get("label"),
                "sequenceSeconds": row.get("sequenceSeconds"),
                "videoPath": video.get("outputPath"),
                "audioPath": audio.get("outputPath"),
                "reason": row.get("reason"),
                "openVideo": video.get("openCommand"),
                "openAudio": audio.get("openCommand"),
            })


def write_markdown(path: Path, payload: dict[str, Any]) -> None:
    lines = [
        f"# Episode {payload.get('episode')} sync control room",
        "",
        f"Status: `{payload.get('status')}`",
        f"Version: `{payload.get('version')}`",
        f"Video duration: `{format_hms(payload.get('videoDurationSeconds') or 0)}`",
        f"Audio duration: `{format_hms(payload.get('audioDurationSeconds') or 0)}`",
        f"Tail/spread: `{payload.get('tailClassification', {}).get('tailLabel')}`",
        "",
        payload.get("diagnosis") or "",
        "",
        f"Next safest action: {payload.get('nextSafestAction')}",
        "",
        "```bash",
        payload.get("firstSafeAction", {}).get("command") or "",
        "```",
        "",
        "## Protocol",
        "",
    ]
    for item in payload.get("syncReviewProtocol") or []:
        lines.append(f"- {item}")
    lines.extend(["", "## Tail decision rubric", ""])
    for row in payload.get("tailDecisionRows") or []:
        lines.extend([
            f"### {row.get('label')}",
            f"- If you hear: {row.get('ifYouHear')}",
            f"- Decision: {row.get('decision')}",
            f"- Safe next: {row.get('safeNext')}",
            "",
        ])
    lines.extend(["", "## Comparisons", ""])
    for row in payload.get("comparisonRows") or []:
        video = row.get("videoSnippet") if isinstance(row.get("videoSnippet"), dict) else {}
        audio = row.get("audioSnippet") if isinstance(row.get("audioSnippet"), dict) else {}
        lines.extend([
            f"### {row.get('label')}",
            f"- Reason: {row.get('reason')}",
            f"- Sequence: `{format_hms(row.get('sequenceSeconds') or 0)}`",
            "```bash",
            video.get("openCommand") or "",
            audio.get("openCommand") or "",
            "```",
            "",
        ])
    lines.extend(["## Decision command templates", ""])
    for row in payload.get("decisionRows") or []:
        lines.extend([f"### {row.get('label')}", "```bash", row.get("dryRunCommand") or "", "```", ""])
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_html(path: Path, payload: dict[str, Any]) -> None:
    counts = payload.get("counts") if isinstance(payload.get("counts"), dict) else {}
    count_html = "".join(f"<li><strong>{esc(k)}</strong><span>{esc(v)}</span></li>" for k, v in counts.items())
    artifact_html = []
    for artifact in payload.get("artifactRows") or []:
        artifact_html.append(f"""
        <article class="card artifact">
          <p class="eyebrow">{esc(artifact.get('key'))}</p>
          <h3>{esc(artifact.get('label'))}</h3>
          <p>{esc(format_hms(artifact.get('durationSeconds') or 0))} · video streams {esc(artifact.get('videoStreams'))} · audio streams {esc(artifact.get('audioStreams'))}</p>
          <code>{esc(artifact.get('path'))}</code>
          <pre>{esc(artifact.get('openCommand'))}</pre>
        </article>
        """)
    comparison_html = []
    for row in payload.get("comparisonRows") or []:
        video = row.get("videoSnippet") if isinstance(row.get("videoSnippet"), dict) else {}
        audio = row.get("audioSnippet") if isinstance(row.get("audioSnippet"), dict) else {}
        video_media = f'<video controls src="{esc(video.get("mediaUri"))}"></video>' if video.get("mediaUri") else '<div class="missing">No video snippet.</div>'
        audio_media = f'<audio controls src="{esc(audio.get("mediaUri"))}"></audio>' if audio.get("mediaUri") else '<div class="missing">No audio snippet.</div>'
        comparison_html.append(f"""
        <article class="comparison">
          <div class="comparison-head"><p class="eyebrow">{esc(format_hms(row.get('sequenceSeconds') or 0))}</p><h3>{esc(row.get('label'))}</h3></div>
          <p>{esc(row.get('reason'))}</p>
          <div class="media-grid"><div><h4>Video artifact</h4>{video_media}<pre>{esc(video.get('openCommand'))}</pre></div><div><h4>Podcast audio</h4>{audio_media}<pre>{esc(audio.get('openCommand'))}</pre></div></div>
          <p class="prompt">{esc(row.get('reviewPrompt'))}</p>
        </article>
        """)
    task_html = "".join(f"<li><strong>{esc(task.get('label'))}</strong><span>{esc(task.get('humanAsk'))}</span></li>" for task in payload.get("sourceTasks") or [] if isinstance(task, dict))
    decision_html = "".join(f"<article class='card'><h3>{esc(row.get('label'))}</h3><p>{esc(row.get('safety'))}</p><pre>{esc(row.get('dryRunCommand'))}</pre></article>" for row in payload.get("decisionRows") or [])
    tail_decision_html = "".join(
        f"""
        <article class="card decision">
          <p class="eyebrow">{esc(row.get('id'))}</p>
          <h3>{esc(row.get('label'))}</h3>
          <p><strong>If you hear:</strong> {esc(row.get('ifYouHear'))}</p>
          <p><strong>Decision:</strong> {esc(row.get('decision'))}</p>
          <p class="prompt"><strong>Safe next:</strong> {esc(row.get('safeNext'))}</p>
        </article>
        """
        for row in payload.get("tailDecisionRows") or []
        if isinstance(row, dict)
    )
    protocol_html = "".join(f"<li>{esc(item)}</li>" for item in payload.get("syncReviewProtocol") or [])
    tail = payload.get("tailClassification") if isinstance(payload.get("tailClassification"), dict) else {}
    path.write_text(f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Episode {esc(payload.get('episode'))} sync control room</title>
<style>
:root {{ color-scheme: dark; --bg:#121812; --panel:#1b251b; --leaf:#7fb56b; --gold:#e2b946; --clay:#c66f48; --ink:#f7efd9; --muted:#bdc2ad; --line:rgba(247,239,217,.16); }}
* {{ box-sizing:border-box; }}
body {{ margin:0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color:var(--ink); background: radial-gradient(circle at 15% 0%, #2c4632 0%, var(--bg) 44%, #080d08 100%); }}
main {{ max-width:1500px; margin:0 auto; padding:28px; }}
.hero,.panel,.card,.comparison {{ border:1px solid var(--line); border-radius:24px; background:rgba(27,37,27,.84); box-shadow:0 24px 90px rgba(0,0,0,.32); }}
.hero {{ padding:30px; background:linear-gradient(135deg, rgba(226,185,70,.16), rgba(127,181,107,.08)); }}
.eyebrow {{ color:var(--gold); text-transform:uppercase; letter-spacing:.18em; font-weight:900; font-size:.78rem; }}
h1 {{ font-size:clamp(2rem,5vw,4.6rem); line-height:.94; margin:.2rem 0; }}
h2,h3,h4 {{ margin:.25rem 0 .5rem; }}
p,span {{ color:var(--muted); line-height:1.5; }}
.grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:16px; margin-top:18px; }}
.card,.comparison,.panel {{ padding:18px; margin-top:18px; }}
ul.counts {{ list-style:none; padding:0; display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:10px; }}
ul.counts li, .tasks li {{ display:flex; justify-content:space-between; gap:16px; padding:12px; border:1px solid var(--line); border-radius:14px; background:rgba(0,0,0,.2); }}
.tasks {{ display:grid; gap:10px; list-style:none; padding:0; }}
.media-grid {{ display:grid; grid-template-columns: 1fr 1fr; gap:16px; }}
video,audio {{ width:100%; border-radius:16px; background:#050805; border:1px solid var(--line); }}
pre,code {{ white-space:pre-wrap; word-break:break-word; display:block; background:rgba(0,0,0,.34); border:1px solid var(--line); border-radius:12px; padding:10px; color:#f8e6a0; }}
.tail {{ border-color:rgba(198,111,72,.7); background:rgba(68,39,27,.72); }}
.decision {{ border-color:rgba(226,185,70,.45); background:linear-gradient(145deg, rgba(226,185,70,.12), rgba(27,37,27,.88)); }}
.prompt {{ color:#f4d77b; }}
.missing {{ border:1px dashed var(--clay); border-radius:14px; padding:18px; color:#ffd3c2; }}
@media (max-width: 900px) {{ .media-grid {{ grid-template-columns:1fr; }} }}
</style>
</head>
<body>
<main>
<section class="hero">
  <p class="eyebrow">Quipsly Studio sync control</p>
  <h1>Episode {esc(payload.get('episode'))} {esc(payload.get('version'))}</h1>
  <p>{esc(payload.get('plainEnglishDurationSummary'))}</p>
  <p><strong>Next safest action:</strong> {esc(payload.get('nextSafestAction'))}</p>
  <pre>{esc(payload.get('firstSafeAction', {}).get('command'))}</pre>
</section>
<section class="panel tail">
  <p class="eyebrow">Tail classification</p>
  <h2>{esc(tail.get('tailLabel'))} · {esc(tail.get('urgency'))}</h2>
  <p>{esc(tail.get('meaning'))}</p>
</section>
<section class="panel"><h2>Counts</h2><ul class="counts">{count_html}</ul></section>
<section class="panel"><h2>Review protocol</h2><ol>{protocol_html}</ol></section>
<section><h2>Tail decision rubric</h2><div class="grid">{tail_decision_html}</div></section>
<section><h2>Package artifacts</h2><div class="grid">{''.join(artifact_html)}</div></section>
<section><h2>Compare these moments</h2>{''.join(comparison_html)}</section>
<section class="panel"><h2>Source tasks</h2><ul class="tasks">{task_html}</ul></section>
<section><h2>Dry-run decision commands</h2><div class="grid">{decision_html}</div></section>
</main>
</body>
</html>""", encoding="utf-8")


def build(release_root: Path) -> dict[str, Any]:
    out_dir = release_root / "review-board" / "sync-control-rooms" / stamp()
    out_dir.mkdir(parents=True, exist_ok=True)
    payload = build_payload(release_root, out_dir)
    json_path = out_dir / "sync-control-room.json"
    md_path = out_dir / "START-HERE-sync-control-room.md"
    csv_path = out_dir / "sync-control-room.csv"
    html_path = out_dir / "index.html"
    write_json(json_path, payload)
    write_markdown(md_path, payload)
    write_csv(csv_path, payload)
    write_html(html_path, payload)
    pointer = {
        "schema": POINTER_SCHEMA,
        "updatedAt": iso_now(),
        "status": payload["status"],
        "episode": payload["episode"],
        "version": payload["version"],
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(md_path),
        "csvPath": str(csv_path),
        "sessionDir": str(out_dir),
        "counts": payload["counts"],
        "humanAsk": payload["humanAsk"],
        "agentSafeParallelWork": payload["agentSafeParallelWork"],
        "nextSafestAction": payload["nextSafestAction"],
        "firstSafeAction": payload["firstSafeAction"],
        "tailClassification": payload["tailClassification"],
        "truth": payload["truth"],
    }
    latest_dir = release_root / "review-board" / "sync-control-rooms"
    write_json(latest_dir / "latest-sync-control-room.json", pointer)
    write_json(release_root / "review-board" / "latest-sync-control-room.json", pointer)
    return pointer


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a local Studio sync control room")
    parser.add_argument("release_root", nargs="?", default=str(DEFAULT_RELEASE_ROOT))
    args = parser.parse_args()
    pointer = build(Path(args.release_root))
    print(json.dumps(pointer, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
