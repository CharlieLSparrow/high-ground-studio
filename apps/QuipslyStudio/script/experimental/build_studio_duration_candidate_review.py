#!/usr/bin/env python3
"""Build watch/listen evidence for a duration candidate.

This turns a local duration-candidate manifest into a calm review packet with
short beginning/middle/ending snippets. It does not approve the candidate,
publish, upload, schedule, mutate accounts, overwrite versions, or touch
original source media.
"""
from __future__ import annotations

import argparse
import csv
import html
import json
import math
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
SCHEMA = "quipsly.studio-duration-candidate-review.v1"


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
    except Exception:
        return {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def resolve_tool(name: str) -> str:
    found = shutil.which(name)
    if found:
        return found
    for candidate in (f"/opt/homebrew/bin/{name}", f"/usr/local/bin/{name}"):
        if Path(candidate).exists():
            return candidate
    raise SystemExit(f"{name} is required for duration candidate review packets.")


def run(command: list[str], timeout: int = 120) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout, check=False)


def ffprobe(path: Path, ffprobe_bin: str) -> dict[str, Any]:
    result = run([
        ffprobe_bin,
        "-v", "error",
        "-show_format",
        "-show_streams",
        "-of", "json",
        str(path),
    ], timeout=30)
    if result.returncode != 0:
        return {"error": (result.stderr or result.stdout or "ffprobe failed").strip()}
    try:
        return json.loads(result.stdout or "{}")
    except json.JSONDecodeError:
        return {"error": "ffprobe returned non-json output"}


def as_float(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def duration_from_probe(probe: dict[str, Any]) -> float | None:
    duration = as_float((probe.get("format") or {}).get("duration"))
    if duration is not None:
        return duration
    stream_durations = [as_float(stream.get("duration")) for stream in probe.get("streams") or []]
    stream_durations = [value for value in stream_durations if value is not None]
    return max(stream_durations) if stream_durations else None


def format_duration(seconds: float | None) -> str:
    if seconds is None:
        return "unknown"
    seconds = max(0.0, float(seconds))
    whole = int(seconds)
    ms = int(round((seconds - whole) * 1000))
    h, rem = divmod(whole, 3600)
    m, s = divmod(rem, 60)
    if h:
        return f"{h}:{m:02d}:{s:02d}.{ms:03d}"
    return f"{m}:{s:02d}.{ms:03d}"


def candidate_manifest_from_latest_workorder(release_root: Path) -> Path:
    pointer = load_json(release_root / "review-board" / "latest-duration-repair-workorders.json")
    workorder_path = Path(str(pointer.get("jsonPath") or ""))
    workorder = load_json(workorder_path)
    for order in workorder.get("workorders") or []:
        if not isinstance(order, dict) or not order.get("candidateAlreadyExists"):
            continue
        manifest_path = Path(str(order.get("candidateManifestPath") or ""))
        if manifest_path.exists():
            return manifest_path
    raise SystemExit("No existing duration candidate manifest found in latest workorders.")


def resolve_manifest(arg: str, release_root: Path) -> Path:
    if arg in {"", "latest", "first"}:
        return candidate_manifest_from_latest_workorder(release_root)
    path = Path(arg).expanduser()
    if path.is_dir():
        path = path / "duration-candidate-manifest.json"
    if not path.exists():
        raise SystemExit(f"Duration candidate manifest not found: {path}")
    return path


def review_points(duration: float, snippet_seconds: float) -> list[dict[str, Any]]:
    duration = max(0.1, duration)
    snippet_seconds = max(3.0, min(snippet_seconds, duration))
    middle_start = max(0.0, (duration / 2.0) - (snippet_seconds / 2.0))
    ending_start = max(0.0, duration - max(snippet_seconds, 18.0))
    return [
        {"id": "beginning", "label": "Beginning", "startSeconds": 0.0, "durationSeconds": snippet_seconds},
        {"id": "middle", "label": "Middle", "startSeconds": middle_start, "durationSeconds": snippet_seconds},
        {"id": "ending", "label": "Ending", "startSeconds": ending_start, "durationSeconds": snippet_seconds},
    ]


def stream_summary(probe: dict[str, Any]) -> dict[str, Any]:
    streams = probe.get("streams") or []
    video = [item for item in streams if item.get("codec_type") == "video"]
    audio = [item for item in streams if item.get("codec_type") == "audio"]
    return {
        "durationSeconds": duration_from_probe(probe),
        "videoStreams": len(video),
        "audioStreams": len(audio),
        "video": [
            {
                "codec": item.get("codec_name"),
                "width": item.get("width"),
                "height": item.get("height"),
                "durationSeconds": as_float(item.get("duration")),
            }
            for item in video
        ],
        "audio": [
            {
                "codec": item.get("codec_name"),
                "sampleRate": item.get("sample_rate"),
                "channels": item.get("channels"),
                "durationSeconds": as_float(item.get("duration")),
            }
            for item in audio
        ],
        "error": probe.get("error") or "",
    }


def make_snippet(
    *,
    source: Path,
    output: Path,
    start: float,
    duration: float,
    has_video: bool,
    ffmpeg_bin: str,
) -> dict[str, Any]:
    output.parent.mkdir(parents=True, exist_ok=True)
    if has_video:
        command = [
            ffmpeg_bin,
            "-hide_banner",
            "-n",
            "-ss", f"{start:.3f}",
            "-t", f"{duration:.3f}",
            "-i", str(source),
            "-vf", "scale='min(960,iw)':-2",
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-crf", "25",
            "-c:a", "aac",
            "-b:a", "128k",
            str(output),
        ]
    else:
        command = [
            ffmpeg_bin,
            "-hide_banner",
            "-n",
            "-ss", f"{start:.3f}",
            "-t", f"{duration:.3f}",
            "-i", str(source),
            "-vn",
            "-c:a", "aac",
            "-b:a", "128k",
            str(output),
        ]
    result = run(command, timeout=180)
    return {
        "outputPath": str(output),
        "command": " ".join(shell_quote(part) for part in command),
        "returnCode": result.returncode,
        "ok": result.returncode == 0 or output.exists(),
        "stderrTail": (result.stderr or "")[-1200:],
        "stdoutTail": (result.stdout or "")[-600:],
    }


def make_still(source: Path, output: Path, start: float, ffmpeg_bin: str) -> dict[str, Any]:
    output.parent.mkdir(parents=True, exist_ok=True)
    command = [
        ffmpeg_bin,
        "-hide_banner",
        "-n",
        "-ss", f"{start:.3f}",
        "-i", str(source),
        "-frames:v", "1",
        "-vf", "scale='min(960,iw)':-2",
        str(output),
    ]
    result = run(command, timeout=90)
    return {
        "outputPath": str(output),
        "command": " ".join(shell_quote(part) for part in command),
        "returnCode": result.returncode,
        "ok": result.returncode == 0 or output.exists(),
        "stderrTail": (result.stderr or "")[-800:],
    }


def artifact_path(item: dict[str, Any]) -> Path:
    return Path(str(item.get("path") or item.get("outputPath") or ""))


def safe_key(key: str) -> str:
    return "".join(ch if ch.isalnum() else "-" for ch in key).strip("-").lower() or "artifact"


def build_packet(manifest_path: Path, release_root: Path, snippet_seconds: float) -> dict[str, Any]:
    ffmpeg_bin = resolve_tool("ffmpeg")
    ffprobe_bin = resolve_tool("ffprobe")
    manifest = load_json(manifest_path)
    if not manifest:
        raise SystemExit(f"Could not read candidate manifest: {manifest_path}")

    episode = int(manifest.get("episode") or 0)
    version = str(manifest.get("version") or manifest_path.parent.name)
    session_dir = release_root / "review-board" / "duration-candidate-reviews" / f"{stamp()}-episode-{episode:02d}-{version}-duration-candidate-review"
    snippets_dir = session_dir / "snippets"
    stills_dir = session_dir / "stills"
    session_dir.mkdir(parents=True, exist_ok=False)

    artifacts: list[dict[str, Any]] = []
    for key, item in sorted((manifest.get("artifacts") or {}).items()):
        if not isinstance(item, dict):
            continue
        source = artifact_path(item)
        probe = ffprobe(source, ffprobe_bin) if source.exists() else {"error": "missing-file"}
        summary = stream_summary(probe)
        duration = summary.get("durationSeconds") or as_float(item.get("durationSeconds")) or 0.0
        has_video = bool(summary.get("videoStreams"))
        points = review_points(float(duration or 0.0), snippet_seconds)
        artifact_snippets = []
        stills = []
        for point in points:
            extension = ".mp4" if has_video else ".m4a"
            snippet_path = snippets_dir / f"{safe_key(key)}-{point['id']}{extension}"
            snippet = make_snippet(
                source=source,
                output=snippet_path,
                start=float(point["startSeconds"]),
                duration=float(point["durationSeconds"]),
                has_video=has_video,
                ffmpeg_bin=ffmpeg_bin,
            ) if source.exists() else {"ok": False, "outputPath": str(snippet_path), "stderrTail": "source missing"}
            artifact_snippets.append({**point, **snippet})
            if has_video and source.exists():
                still_path = stills_dir / f"{safe_key(key)}-{point['id']}.jpg"
                stills.append({**point, **make_still(source, still_path, float(point["startSeconds"]), ffmpeg_bin)})
        artifacts.append({
            "key": key,
            "sourcePath": str(source),
            "exists": source.exists(),
            "sizeBytes": source.stat().st_size if source.exists() else 0,
            "summary": summary,
            "snippets": artifact_snippets,
            "stills": stills,
        })

    durations = [
        as_float((artifact.get("summary") or {}).get("durationSeconds"))
        for artifact in artifacts
        if artifact.get("exists")
    ]
    durations = [value for value in durations if value is not None]
    spread = max(durations) - min(durations) if len(durations) >= 2 else None
    snippet_errors = [
        snippet
        for artifact in artifacts
        for snippet in artifact.get("snippets") or []
        if not snippet.get("ok")
    ]
    still_errors = [
        still
        for artifact in artifacts
        for still in artifact.get("stills") or []
        if not still.get("ok")
    ]
    status = "review-evidence-ready" if not snippet_errors else "review-evidence-has-errors"
    review_commands = {
        "holdCurrent16x9UntilCandidatePromotion": f"./script/agentctl.sh tower-review-decision {episode} longForm16x9 hold '<reviewer>' '<Current package remains held while {version} duration candidate is reviewed; do not publish old 16:9 artifact from this candidate packet>'",
        "holdCurrent9x16UntilCandidatePromotion": f"./script/agentctl.sh tower-review-decision {episode} longForm9x16 hold '<reviewer>' '<Current package remains held while {version} duration candidate is reviewed; do not publish old 9:16 artifact from this candidate packet>'",
        "holdCurrentPodcastAudioUntilCandidatePromotion": f"./script/agentctl.sh tower-review-decision {episode} podcastAudio hold '<reviewer>' '<Current package remains held while {version} duration candidate is reviewed; do not publish old podcast audio from this candidate packet>'",
        "requestCurrentPackageRefine": f"./script/agentctl.sh tower-review-decision {episode} longForm16x9 refine '<reviewer>' '<{version} duration candidate review found an issue; keep current package in refine state until a versioned candidate promotion/rebuild exists>'",
    }
    dry_run_review_commands = {
        label: command.replace("./script/agentctl.sh tower-review-decision ", "./script/agentctl.sh tower-review-decision-dry-run ", 1)
        for label, command in review_commands.items()
    }
    human_ask = (
        f"Watch/listen Episode {episode} {version} beginning, middle, and ending snippets for all candidate artifacts. "
        "Decide whether this candidate is good enough to promote into a real versioned review package, should be refined, or should be rejected/held."
    )
    agent_safe_parallel_work = (
        "Prepare clearer review notes, sample contact evidence, transcript/duration summaries, and dry-run local ledger commands. "
        "Do not promote, approve, publish, upload, schedule, overwrite, delete, capture receipts, or mutate source media without explicit approval."
    )
    review_checklist = [
        "Beginning snippets start cleanly and audio/video feel aligned.",
        "Middle snippets stay in sync and do not reveal missing media, silence, or repeated content.",
        "Ending snippets end naturally and do not cut off meaningful speech or leave unwanted tail.",
        "16:9 video, 9:16 video, and podcast audio represent the same intended episode span.",
        "If this candidate passes, the next step is a versioned promotion/rebuild packet, not direct publication approval.",
    ]
    packet = {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "releaseRoot": str(release_root),
        "sessionDir": str(session_dir),
        "jsonPath": str(session_dir / "duration-candidate-review.json"),
        "htmlPath": str(session_dir / "index.html"),
        "markdownPath": str(session_dir / "START-HERE-duration-candidate-review.md"),
        "csvPath": str(session_dir / "duration-candidate-review.csv"),
        "candidateManifestPath": str(manifest_path),
        "candidateDir": str(manifest_path.parent),
        "episode": episode,
        "version": version,
        "candidateVersion": manifest.get("version") or version,
        "currentVersion": manifest.get("sourceVersion") or "",
        "sourceVersion": manifest.get("sourceVersion") or "",
        "status": status,
        "candidateStatus": manifest.get("status") or "",
        "candidateDurationSpreadSeconds": manifest.get("durationSpreadSeconds"),
        "reviewDurationSpreadSeconds": round(float(spread), 3) if spread is not None else None,
        "truth": "Duration candidate review evidence only. This does not approve, publish, upload, schedule, mutate accounts, overwrite versions, or touch original source media.",
        "candidateReason": manifest.get("candidateReason") or "",
        "humanAsk": human_ask,
        "agentSafeParallelWork": agent_safe_parallel_work,
        "reviewChecklist": review_checklist,
        "unsafeActions": [
            "Do not approve Tower artifacts directly from this duration-candidate packet.",
            "Do not publish, upload, schedule, or capture receipt truth from this packet.",
            "Do not overwrite current-best packages or source media.",
        ],
        "nextSafestAction": "Open this review packet and inspect beginning/middle/ending snippets. If the candidate passes, promote it into a real versioned review package before approving Tower artifacts; if it fails, hold/refine the current package.",
        "candidateAcceptanceNextStep": "Do not approve current Tower artifacts from a duration-candidate packet. The honest path is: watch/listen v004 evidence -> promote or rebuild a versioned package for v004 -> regenerate review ledger -> approve the promoted artifacts.",
        "candidatePromotionPlanCommand": f"./script/agentctl.sh studio-duration-candidate-promotion-plan {shell_quote(str(manifest_path))} {shell_quote(str(release_root))}",
        "firstSafeAction": {
            "label": f"Open Episode {episode} {version} duration candidate review packet",
            "command": f"open {shell_quote(str(session_dir / 'index.html'))}",
            "path": str(session_dir / "index.html"),
            "safety": "Opens local review evidence only; no publish/upload/schedule/receipt/account/source changes.",
        },
        "dryRunReviewCommands": dry_run_review_commands,
        "reviewCommands": review_commands,
        "counts": {
            "artifacts": len(artifacts),
            "snippets": sum(len(artifact.get("snippets") or []) for artifact in artifacts),
            "stills": sum(len(artifact.get("stills") or []) for artifact in artifacts),
            "snippetErrors": len(snippet_errors),
            "stillErrors": len(still_errors),
            "sourceFilesMutated": False,
            "originalMediaMutated": False,
            "versionsOverwritten": False,
            "externalPublishing": False,
            "receiptTruthCreated": False,
        },
        "artifacts": artifacts,
    }
    return packet


def media_tag(path: str) -> str:
    escaped = html.escape(path)
    href = "file://" + escaped
    if path.lower().endswith(".mp4"):
        return f'<video controls preload="metadata" src="{href}"></video>'
    if path.lower().endswith(".m4a"):
        return f'<audio controls preload="metadata" src="{href}"></audio>'
    if path.lower().endswith((".jpg", ".jpeg", ".png")):
        return f'<img src="{href}" alt="" />'
    return f'<a href="{href}">{escaped}</a>'


def write_html(path: Path, packet: dict[str, Any]) -> None:
    artifact_cards = []
    for artifact in packet.get("artifacts") or []:
        snippets = "".join(
            f"""
            <div class="snippet">
              <h4>{html.escape(snippet.get('label') or snippet.get('id') or '')} · {format_duration(snippet.get('startSeconds'))}</h4>
              {media_tag(str(snippet.get('outputPath') or '')) if snippet.get('ok') else '<p class="warn">Snippet failed; inspect JSON.</p>'}
            </div>
            """
            for snippet in artifact.get("snippets") or []
        )
        stills = "".join(
            f"<a href=\"file://{html.escape(str(still.get('outputPath') or ''))}\">{media_tag(str(still.get('outputPath') or ''))}</a>"
            for still in artifact.get("stills") or []
            if still.get("ok")
        )
        summary = artifact.get("summary") or {}
        artifact_cards.append(f"""
          <article class="artifact">
            <div class="eyebrow">{html.escape(str(artifact.get('key') or 'artifact'))}</div>
            <h2>{html.escape(Path(str(artifact.get('sourcePath') or '')).name)}</h2>
            <p><strong>Duration:</strong> {html.escape(format_duration(summary.get('durationSeconds')))} · <strong>Video:</strong> {summary.get('videoStreams', 0)} · <strong>Audio:</strong> {summary.get('audioStreams', 0)}</p>
            <p><code>{html.escape(str(artifact.get('sourcePath') or ''))}</code></p>
            <div class="stills">{stills}</div>
            <div class="snippet-grid">{snippets}</div>
          </article>
        """)
    dry_run_commands = "".join(
        f"<li><strong>{html.escape(label)}</strong><pre>{html.escape(command)}</pre></li>"
        for label, command in (packet.get("dryRunReviewCommands") or {}).items()
    )
    commands = "".join(
        f"<li><strong>{html.escape(label)}</strong><pre>{html.escape(command)}</pre></li>"
        for label, command in (packet.get("reviewCommands") or {}).items()
    )
    review_checklist = "".join(
        f"<li>{html.escape(str(item))}</li>"
        for item in packet.get("reviewChecklist") or []
    )
    unsafe_actions = "".join(
        f"<li>{html.escape(str(item))}</li>"
        for item in packet.get("unsafeActions") or []
    )
    path.write_text(f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Episode {packet.get('episode')} {html.escape(str(packet.get('version')))} duration candidate review</title>
  <style>
    :root {{ color-scheme: dark; --bg:#101711; --panel:#1b271f; --ink:#fff3d8; --muted:#cabe9e; --gold:#edcb52; --moss:#8fbd72; --water:#73c7d7; --line:rgba(255,243,216,.15); --clay:#c8755d; }}
    body {{ margin:0; font-family:Avenir Next, Helvetica Neue, sans-serif; background:radial-gradient(circle at 16% 0%, rgba(143,189,114,.17), transparent 36%), var(--bg); color:var(--ink); }}
    header {{ padding:34px clamp(18px,5vw,72px); border-bottom:1px solid var(--line); }}
    .eyebrow {{ color:var(--gold); letter-spacing:.19em; text-transform:uppercase; font-size:12px; font-weight:900; }}
    h1 {{ margin:10px 0; font-size:clamp(36px,6vw,74px); line-height:.92; }}
    p {{ color:var(--muted); line-height:1.5; }}
    main {{ padding:24px clamp(14px,4vw,52px) 72px; display:grid; gap:18px; }}
    .stats, .snippet-grid, .stills {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(210px,1fr)); gap:12px; }}
    .stat, .artifact, .commands {{ border:1px solid var(--line); border-radius:24px; background:linear-gradient(180deg,rgba(27,39,31,.96),rgba(9,13,10,.98)); padding:18px; box-shadow:0 18px 42px rgba(0,0,0,.24); }}
    .review-brief {{ border:1px solid rgba(237,203,82,.42); border-radius:24px; background:rgba(237,203,82,.08); padding:18px; }}
    .review-brief strong {{ color:var(--moss); text-transform:uppercase; letter-spacing:.12em; font-size:12px; }}
    .stat b {{ font-size:28px; display:block; }}
    .snippet {{ border:1px solid var(--line); border-radius:18px; padding:12px; background:rgba(0,0,0,.22); }}
    video, audio, img {{ width:100%; max-height:360px; border-radius:14px; background:#050705; object-fit:contain; }}
    code, pre {{ white-space:pre-wrap; overflow-wrap:anywhere; color:var(--ink); }}
    pre {{ background:rgba(0,0,0,.28); padding:12px; border-radius:14px; }}
    .warn {{ color:var(--clay); font-weight:800; }}
    a {{ color:var(--water); }}
  </style>
</head>
<body>
  <header>
    <div class="eyebrow">Quipsly Studio duration candidate review</div>
    <h1>Episode {packet.get('episode')} {html.escape(str(packet.get('version')))} is evidence, not approval.</h1>
    <p>{html.escape(packet.get('truth') or '')}</p>
    <p><strong>Human ask:</strong> {html.escape(packet.get('humanAsk') or '')}</p>
    <p><strong>Agent-safe parallel work:</strong> {html.escape(packet.get('agentSafeParallelWork') or '')}</p>
    <p><strong>Next safe action:</strong> {html.escape(packet.get('nextSafestAction') or '')}</p>
    <p><strong>Candidate promotion rule:</strong> {html.escape(packet.get('candidateAcceptanceNextStep') or '')}</p>
    <p><strong>Build promotion plan:</strong></p><pre>{html.escape(packet.get('candidatePromotionPlanCommand') or '')}</pre>
  </header>
  <main>
    <section class="review-brief">
      <div class="eyebrow">Review contract</div>
      <h2>Candidate means evidence, not approval.</h2>
      <p>This packet exists so a reviewer can decide whether the candidate deserves promotion into a real versioned review package.</p>
      <strong>Check these before promotion</strong>
      <ul>{review_checklist}</ul>
      <strong>Do not do these from this packet</strong>
      <ul>{unsafe_actions}</ul>
    </section>
    <section class="stats">
      <div class="stat"><b>{packet.get('status')}</b><span>Status</span></div>
      <div class="stat"><b>{packet.get('reviewDurationSpreadSeconds')}</b><span>Review spread seconds</span></div>
      <div class="stat"><b>{(packet.get('counts') or {}).get('snippets')}</b><span>Snippets</span></div>
      <div class="stat"><b>{(packet.get('counts') or {}).get('snippetErrors')}</b><span>Snippet errors</span></div>
    </section>
    {''.join(artifact_cards)}
    <section class="commands">
      <div class="eyebrow">Preview-first local ledger commands</div>
      <h2>1. Dry-run before any ledger write</h2>
      <ol>{dry_run_commands}</ol>
      <h2>2. Execute only after watch/listen review</h2>
      <ol>{commands}</ol>
    </section>
  </main>
</body>
</html>
""", encoding="utf-8")


def write_markdown(path: Path, packet: dict[str, Any]) -> None:
    lines = [
        f"# Episode {packet.get('episode')} {packet.get('version')} duration candidate review",
        "",
        packet.get("truth") or "",
        "",
        f"- Status: `{packet.get('status')}`",
        f"- Candidate status: `{packet.get('candidateStatus')}`",
        f"- Review duration spread: `{packet.get('reviewDurationSpreadSeconds')}` seconds",
        f"- Candidate manifest: `{packet.get('candidateManifestPath')}`",
        f"- Candidate folder: `{packet.get('candidateDir')}`",
        "",
        "## Human ask",
        "",
        packet.get("humanAsk") or "",
        "",
        "## Agent-safe parallel work",
        "",
        packet.get("agentSafeParallelWork") or "",
        "",
        "## Review checklist",
        "",
    ]
    for item in packet.get("reviewChecklist") or []:
        lines.append(f"- {item}")
    lines.extend([
        "",
        "## Unsafe actions from this packet",
        "",
    ])
    for item in packet.get("unsafeActions") or []:
        lines.append(f"- {item}")
    lines.extend([
        "",
        "## Next safest action",
        "",
        packet.get("nextSafestAction") or "",
        "",
        "## Candidate promotion rule",
        "",
        packet.get("candidateAcceptanceNextStep") or "",
        "",
        "## Build promotion plan",
        "",
        "```bash",
        packet.get("candidatePromotionPlanCommand") or "",
        "```",
        "",
        "## Artifacts",
        "",
    ])
    for artifact in packet.get("artifacts") or []:
        summary = artifact.get("summary") or {}
        lines.extend([
            f"### {artifact.get('key')}",
            f"- Source: `{artifact.get('sourcePath')}`",
            f"- Duration: `{format_duration(summary.get('durationSeconds'))}`",
            f"- Streams: `{summary.get('videoStreams', 0)}` video / `{summary.get('audioStreams', 0)}` audio",
            "",
        ])
        for snippet in artifact.get("snippets") or []:
            lines.append(f"- {snippet.get('label')} snippet: `{snippet.get('outputPath')}`")
        for still in artifact.get("stills") or []:
            lines.append(f"- {still.get('label')} still: `{still.get('outputPath')}`")
        lines.append("")
    lines.extend(["## Dry-run local ledger commands", ""])
    for label, command in (packet.get("dryRunReviewCommands") or {}).items():
        lines.extend([f"### {label}", "```bash", command, "```", ""])
    lines.extend(["## Execute local ledger commands only after watch/listen review", ""])
    for label, command in (packet.get("reviewCommands") or {}).items():
        lines.extend([f"### {label}", "```bash", command, "```", ""])
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def write_csv(path: Path, packet: dict[str, Any]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["artifactKey", "snippetId", "label", "startSeconds", "durationSeconds", "outputPath", "ok"])
        writer.writeheader()
        for artifact in packet.get("artifacts") or []:
            for snippet in artifact.get("snippets") or []:
                writer.writerow({
                    "artifactKey": artifact.get("key"),
                    "snippetId": snippet.get("id"),
                    "label": snippet.get("label"),
                    "startSeconds": snippet.get("startSeconds"),
                    "durationSeconds": snippet.get("durationSeconds"),
                    "outputPath": snippet.get("outputPath"),
                    "ok": snippet.get("ok"),
                })


def update_latest(release_root: Path, packet: dict[str, Any]) -> None:
    pointer = {
        "schema": "quipsly.studio-duration-candidate-review.latest-pointer.v1",
        "updatedAt": iso_now(),
        "status": packet.get("status"),
        "episode": packet.get("episode"),
        "version": packet.get("version"),
        "sessionDir": packet.get("sessionDir"),
        "jsonPath": packet.get("jsonPath"),
        "htmlPath": packet.get("htmlPath"),
        "markdownPath": packet.get("markdownPath"),
        "csvPath": packet.get("csvPath"),
        "counts": packet.get("counts"),
        "nextSafestAction": packet.get("nextSafestAction"),
        "candidateAcceptanceNextStep": packet.get("candidateAcceptanceNextStep"),
        "candidatePromotionPlanCommand": packet.get("candidatePromotionPlanCommand"),
        "firstSafeAction": packet.get("firstSafeAction"),
        "humanAsk": packet.get("humanAsk"),
        "agentSafeParallelWork": packet.get("agentSafeParallelWork"),
        "reviewChecklist": packet.get("reviewChecklist"),
        "unsafeActions": packet.get("unsafeActions"),
        "firstDryRunReviewCommand": next(iter((packet.get("dryRunReviewCommands") or {}).values()), ""),
        "dryRunReviewCommands": packet.get("dryRunReviewCommands") or {},
        "reviewCommandsAfterPreview": packet.get("reviewCommands") or {},
        "candidateManifestPath": packet.get("candidateManifestPath"),
        "candidateDir": packet.get("candidateDir"),
        "sourceFilesMutated": False,
        "originalMediaMutated": False,
        "versionsOverwritten": False,
        "externalPublishing": False,
        "receiptTruthCreated": False,
        "truth": "Pointer only. Duration candidate review packets are local evidence, not approvals or publication receipts.",
    }
    canonical = release_root / "review-board" / "duration-candidate-reviews" / "latest-duration-candidate-review.json"
    write_json(canonical, pointer)
    write_json(release_root / "review-board" / "latest-duration-candidate-review.json", {
        **pointer,
        "schema": "quipsly.studio-duration-candidate-review.latest-alias.v1",
        "canonicalPointerPath": str(canonical),
    })


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a local watch/listen review packet for a duration candidate.")
    parser.add_argument("candidate", nargs="?", default="latest", help="Candidate manifest path, candidate folder, or 'latest'.")
    parser.add_argument("--release-root", default=str(DEFAULT_RELEASE_ROOT))
    parser.add_argument("--snippet-seconds", type=float, default=12.0)
    args = parser.parse_args()
    release_root = Path(args.release_root).expanduser()
    manifest_path = resolve_manifest(args.candidate, release_root)
    packet = build_packet(manifest_path, release_root, args.snippet_seconds)
    write_json(Path(str(packet["jsonPath"])), packet)
    write_html(Path(str(packet["htmlPath"])), packet)
    write_markdown(Path(str(packet["markdownPath"])), packet)
    write_csv(Path(str(packet["csvPath"])), packet)
    update_latest(release_root, packet)
    print(json.dumps({
        "ok": True,
        "status": packet["status"],
        "htmlPath": packet["htmlPath"],
        "jsonPath": packet["jsonPath"],
        "markdownPath": packet["markdownPath"],
        "csvPath": packet["csvPath"],
        "counts": packet["counts"],
        "truth": packet["truth"],
    }, indent=2, sort_keys=True))
    return 0 if packet["status"] == "review-evidence-ready" else 1


if __name__ == "__main__":
    raise SystemExit(main())
