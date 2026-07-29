#!/usr/bin/env python3
"""Render speaker-preservation proof snippets from the contribution ledger.

This is a reviewer aid, not an approval tool. It renders short derived clips from
existing v006 audio so Charlie/Homer preservation risks can be auditioned quickly.
It never mutates original media, never changes approval state, never unlocks
branch inheritance, and never renders episode branches.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from html import escape
from pathlib import Path
from typing import Any

FFMPEG = "/opt/homebrew/bin/ffmpeg"
FFPROBE = "/opt/homebrew/bin/ffprobe"
NOTES_SCHEMA = "quipsly.audio.speaker-preservation-proof-notes.v1"


@dataclass(frozen=True)
class SourceClip:
    id: str
    label: str
    path: Path
    role: str
    speaker: str
    seq_start: float
    duration: float
    volume: float

    @property
    def seq_end(self) -> float:
        return self.seq_start + max(0.0, self.duration)


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def output_path(value: Any) -> str | None:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        path = value.get("path")
        if isinstance(path, str):
            return path
    return None


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "item"


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def resolve_baseline_dir(input_path: Path) -> Path:
    if (input_path / "manifest.json").exists():
        return input_path.expanduser().resolve()
    nested = input_path / "work" / "conformed-production-baseline"
    if (nested / "manifest.json").exists():
        return nested.expanduser().resolve()
    raise FileNotFoundError(
        "Could not find manifest.json at "
        f"{input_path}/manifest.json or {nested}/manifest.json"
    )


def probe_duration(path: Path) -> float:
    if not path.exists():
        return 0.0
    cmd = [
        FFPROBE,
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        str(path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        return 0.0
    try:
        return float(result.stdout.strip())
    except ValueError:
        return 0.0


def speaker_from_role(role: str) -> str:
    role = role.lower()
    if "charlie" in role:
        return "charlie"
    if "homer" in role or "scott" in role:
        return "homer"
    if "reference" in role or "clip" in role:
        return "reference"
    return "unknown"


def load_sources(manifest: dict[str, Any]) -> list[SourceClip]:
    sources: list[SourceClip] = []
    for item in manifest.get("rawSources") or []:
        if not isinstance(item, dict):
            continue
        path_text = item.get("path")
        if not isinstance(path_text, str):
            continue
        path = Path(path_text)
        role = str(item.get("role") or "unknown")
        duration = probe_duration(path)
        sources.append(
            SourceClip(
                id=str(item.get("id") or safe_slug(path.stem)),
                label=str(item.get("label") or path.name),
                path=path,
                role=role,
                speaker=speaker_from_role(role),
                seq_start=float(item.get("seq_start") or 0.0),
                duration=duration,
                volume=float(item.get("volume") or 1.0),
            )
        )
    return sources


def infer_speaker(marker: dict[str, Any]) -> str | None:
    flags = [str(flag).lower() for flag in marker.get("flags") or []]
    if any(flag.startswith("charlie_") for flag in flags):
        return "charlie"
    if any(flag.startswith("homer_") for flag in flags):
        return "homer"
    if any(flag.startswith("reference_") for flag in flags):
        return "reference"
    charlie_delta = abs(float(marker.get("charlieDeltaDb") or 0.0))
    homer_delta = abs(float(marker.get("homerDeltaDb") or 0.0))
    if charlie_delta >= 18.0 and charlie_delta >= homer_delta:
        return "charlie"
    if homer_delta >= 18.0 and homer_delta > charlie_delta:
        return "homer"
    return None


def marker_risk(marker: dict[str, Any], speaker: str) -> float:
    key = f"{speaker}DeltaDb"
    try:
        delta = abs(float(marker.get(key) or 0.0))
    except ValueError:
        delta = 0.0
    priority = float(marker.get("priority") or 0.0)
    return priority * 100.0 + delta


def select_markers(ledger: dict[str, Any], max_per_speaker: int, min_spacing: float) -> list[dict[str, Any]]:
    buckets: dict[str, list[dict[str, Any]]] = {"charlie": [], "homer": [], "reference": []}
    for marker in ledger.get("reviewMarkers") or []:
        if not isinstance(marker, dict):
            continue
        speaker = infer_speaker(marker)
        if speaker not in buckets:
            continue
        flags = [str(flag).lower() for flag in marker.get("flags") or []]
        if speaker != "reference" and not any("loss" in flag or "overgate" in flag or "without_registered_source" in flag for flag in flags):
            continue
        enriched = dict(marker)
        enriched["speaker"] = speaker
        buckets[speaker].append(enriched)

    selected: list[dict[str, Any]] = []
    for speaker, markers in buckets.items():
        chosen: list[dict[str, Any]] = []
        markers.sort(key=lambda marker: marker_risk(marker, speaker), reverse=True)
        for marker in markers:
            center = (float(marker.get("start") or 0.0) + float(marker.get("end") or 0.0)) / 2.0
            if any(abs(center - ((float(prev.get("start") or 0.0) + float(prev.get("end") or 0.0)) / 2.0)) < min_spacing for prev in chosen):
                continue
            chosen.append(marker)
            if len(chosen) >= max_per_speaker:
                break
        selected.extend(chosen)
    selected.sort(key=lambda marker: (str(marker.get("speaker")), float(marker.get("start") or 0.0)))
    return selected


def source_for_marker(sources: list[SourceClip], speaker: str, window_start: float, window_end: float) -> SourceClip | None:
    center = (window_start + window_end) / 2.0
    candidates = [source for source in sources if source.speaker == speaker and source.path.exists()]
    for source in candidates:
        if source.seq_start <= center <= source.seq_end:
            return source
    overlapping = [source for source in candidates if source.seq_start <= window_end and source.seq_end >= window_start]
    if overlapping:
        return max(overlapping, key=lambda source: min(window_end, source.seq_end) - max(window_start, source.seq_start))
    return None


def run_ffmpeg(cmd: list[str]) -> tuple[bool, str]:
    result = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        return False, (result.stderr or result.stdout or "ffmpeg failed").strip()[-2000:]
    return True, ""


def render_master_snippet(master: Path, output: Path, start: float, duration: float) -> tuple[bool, str]:
    cmd = [
        FFMPEG,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-ss",
        f"{max(0.0, start):.3f}",
        "-t",
        f"{max(0.05, duration):.3f}",
        "-i",
        str(master),
        "-vn",
        "-c:a",
        "aac",
        "-b:a",
        "160k",
        str(output),
    ]
    return run_ffmpeg(cmd)


def render_source_snippet(source: SourceClip, output: Path, timeline_start: float, duration: float) -> tuple[bool, str, float, float]:
    source_start = max(0.0, timeline_start - source.seq_start)
    available = max(0.0, source.duration - source_start)
    actual_duration = min(max(0.05, duration), available if available > 0 else max(0.05, duration))
    volume_filter = f"volume={source.volume:.6f},aformat=sample_rates=48000:channel_layouts=stereo"
    cmd = [
        FFMPEG,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-ss",
        f"{source_start:.3f}",
        "-t",
        f"{actual_duration:.3f}",
        "-i",
        str(source.path),
        "-vn",
        "-af",
        volume_filter,
        "-c:a",
        "aac",
        "-b:a",
        "160k",
        str(output),
    ]
    ok, err = run_ffmpeg(cmd)
    return ok, err, source_start, actual_duration


def rel(path: Path, root: Path) -> str:
    return os.path.relpath(path, root)


def render_html(report: dict[str, Any]) -> str:
    items = report.get("items") or []
    cards: list[str] = []
    for item in items:
        master = item.get("masterSnippetRelative")
        source = item.get("sourceSnippetRelative")
        status_class = "ok" if item.get("renderStatus") == "rendered" else "warn"
        cards.append(
            f"""
            <article class="card {status_class}">
              <div class="badge">{escape(str(item.get('speaker', 'unknown')).upper())} · {escape(str(item.get('timecode', '')))}</div>
              <h2>{escape(str(item.get('title', 'Speaker preservation proof')))}</h2>
              <p>{escape(str(item.get('guidance', 'Compare the raw aligned source to the mastered candidate.')))}</p>
              <p class="meta">Timeline {item.get('windowStart', 0):.2f}s → {item.get('windowEnd', 0):.2f}s · flags: {escape(', '.join(item.get('flags') or []))}</p>
              <div class="players">
                <section><h3>Mastered v006 candidate</h3>{'<audio controls preload="metadata" src="' + escape(master) + '"></audio>' if master else '<p>Missing master snippet</p>'}</section>
                <section><h3>Aligned source at mix gain</h3>{'<audio controls preload="metadata" src="' + escape(source) + '"></audio>' if source else '<p>No aligned source snippet rendered</p>'}</section>
              </div>
              <div class="decision" data-index="{item.get('index')}">
                <label>Decision
                  <select data-field="decision">
                    <option value="undecided">Undecided</option>
                    <option value="pass">Pass / preserved naturally</option>
                    <option value="needs-proof">Needs more focused proof</option>
                    <option value="needs-repair">Needs scoped repair</option>
                  </select>
                </label>
                <label>Reviewer note
                  <textarea data-field="note" placeholder="What did you hear? Gating, echo, swallowed voice, natural overlap, park noise, or pass context..."></textarea>
                </label>
              </div>
              <p class="source">Source: {escape(str(item.get('sourceLabel') or 'not available'))}</p>
              {'<pre>' + escape(str(item.get('error'))) + '</pre>' if item.get('error') else ''}
            </article>
            """
        )
    notes_json = json.dumps(report.get("notesTemplate") or {}, indent=2).replace("</", "<\\/")
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Speaker Preservation Proof Pack</title>
  <style>
    :root {{ color-scheme: dark; --bg:#121814; --panel:#1b271f; --panel2:#263729; --ink:#f6eddb; --muted:#b8ae97; --gold:#f0c84b; --green:#74d083; --clay:#d56c4c; --line:rgba(246,237,219,.16); }}
    body {{ margin:0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif; background: radial-gradient(circle at top left, #233b2b, var(--bg) 42%); color:var(--ink); }}
    main {{ max-width: 1180px; margin: 0 auto; padding: 36px 24px 64px; }}
    h1 {{ font-size: clamp(2rem, 5vw, 4.5rem); line-height:.92; margin:.2rem 0 1rem; letter-spacing:-.06em; }}
    .lede {{ color:var(--muted); max-width: 880px; font-size:1.08rem; line-height:1.55; }}
    .truth {{ display:grid; grid-template-columns: repeat(auto-fit,minmax(190px,1fr)); gap:12px; margin:24px 0; }}
    .truth div {{ background:rgba(255,255,255,.045); border:1px solid var(--line); border-radius:16px; padding:14px; }}
    .truth b {{ color:var(--gold); display:block; font-size:1.3rem; }}
    .card {{ border:1px solid var(--line); border-radius:22px; padding:18px; margin:18px 0; background:linear-gradient(145deg, rgba(255,255,255,.06), rgba(255,255,255,.025)); box-shadow: 0 24px 60px rgba(0,0,0,.22); }}
    .card.ok {{ border-color: rgba(116,208,131,.32); }}
    .card.warn {{ border-color: rgba(213,108,76,.5); }}
    .badge {{ color:var(--gold); font-weight:800; letter-spacing:.12em; font-size:.8rem; text-transform:uppercase; }}
    .meta,.source {{ color:var(--muted); }}
    .players {{ display:grid; grid-template-columns: repeat(auto-fit,minmax(300px,1fr)); gap:16px; }}
    section {{ background:rgba(0,0,0,.18); border:1px solid var(--line); border-radius:16px; padding:14px; }}
    audio {{ width:100%; }}
    .decision {{ display:grid; grid-template-columns: minmax(180px,240px) 1fr; gap:14px; align-items:start; margin-top:14px; }}
    select, textarea, button {{ width:100%; border:1px solid var(--line); border-radius:12px; background:rgba(0,0,0,.28); color:var(--ink); padding:10px; font:inherit; }}
    textarea {{ min-height:82px; resize:vertical; }}
    button {{ cursor:pointer; background:linear-gradient(135deg, #355b3d, #604d1b); font-weight:800; }}
    .exportbar {{ position:sticky; top:0; z-index:2; padding:14px; margin:18px 0; border:1px solid var(--line); border-radius:18px; background:rgba(18,24,20,.92); backdrop-filter: blur(14px); }}
    pre {{ white-space:pre-wrap; color:#ffd0c4; background:rgba(0,0,0,.24); padding:12px; border-radius:12px; }}
  </style>
</head>
<body>
<main>
  <p class="badge">QUIPSLY AUDIO WORKBENCH</p>
  <h1>Speaker preservation proof pack</h1>
  <p class="lede">These are short derived A/B clips for the highest-risk Charlie and Homer preservation moments. Use them to judge whether speaker cleanup preserved the human performance before any branch inheritance or production render. This page is evidence, not approval.</p>
  <div class="exportbar">
    <button id="exportNotes">Export speaker preservation notes JSON</button>
    <p class="meta">Export notes after listening, then run the Episode 4 audio review notes roundtrip. All-pass here means this proof slice passed; it does not approve the entire v006 spine by itself.</p>
  </div>
  <div class="truth">
    <div><span>Baseline</span><b>{escape(str(report.get('baselineId')))}</b></div>
    <div><span>Items</span><b>{len(items)}</b></div>
    <div><span>Rendered snippets</span><b>{report.get('renderedSnippetCount', 0)}</b></div>
    <div><span>Failures</span><b>{report.get('renderFailureCount', 0)}</b></div>
    <div><span>Approval changed</span><b>{str(report.get('approvalStateChanged')).lower()}</b></div>
    <div><span>Branch render</span><b>{str(report.get('branchRenderAttempted')).lower()}</b></div>
  </div>
  {''.join(cards)}
</main>
<script id="notes-template" type="application/json">{notes_json}</script>
<script>
const template = JSON.parse(document.getElementById('notes-template').textContent);
document.getElementById('exportNotes').addEventListener('click', () => {{
  const notes = JSON.parse(JSON.stringify(template));
  notes.exportedAt = new Date().toISOString();
  notes.notes = notes.items.map(item => {{
    const panel = document.querySelector(`.decision[data-index="${{item.index}}"]`);
    const decision = panel?.querySelector('[data-field="decision"]')?.value || 'undecided';
    const note = panel?.querySelector('[data-field="note"]')?.value || '';
    return {{ ...item, decision, note }};
  }});
  delete notes.items;
  const blob = new Blob([JSON.stringify(notes, null, 2)], {{ type: 'application/json' }});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${{notes.baselineId}}-speaker-preservation-proof-notes-${{Date.now()}}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}});
</script>
</body>
</html>
"""


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Speaker Preservation Proof Pack: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "This is a derived review pack for Charlie/Homer preservation risk. It does not approve audio, fail audio, unlock branch inheritance, render episode branches, publish, upload, or mutate original media.",
        "",
        "## Current truth",
        "",
        f"- Approval status: `{report['approvalStatus']}`",
        f"- Package ready for human listen: `{str(report['packageReadyForHumanListen']).lower()}`",
        f"- Branch inheritance ready: `{str(report['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(report['branchRenderReady']).lower()}`",
        f"- Derived snippet render attempted: `{str(report['derivedSnippetRenderAttempted']).lower()}`",
        f"- Branch render attempted: `{str(report['branchRenderAttempted']).lower()}`",
        f"- Original media mutated: `{str(report['originalMediaMutated']).lower()}`",
        "",
        "## Open",
        "",
        f"- HTML: `{report['html']}`",
        f"- Playlist: `{report['playlist']}`",
        f"- JSON: `{report['json']}`",
        "",
        "## Proof items",
        "",
        "| # | Speaker | Timecode | Flags | Master snippet | Source snippet | Status |",
        "|---:|---|---|---|---|---|---|",
    ]
    for index, item in enumerate(report.get("items") or [], start=1):
        flags = ", ".join(item.get("flags") or [])
        lines.append(
            f"| {index} | {item.get('speaker')} | `{item.get('timecode')}` | {flags} | `{item.get('masterSnippet') or 'missing'}` | `{item.get('sourceSnippet') or 'missing'}` | `{item.get('renderStatus')}` |"
        )
    lines.extend([
        "",
        "## Next action",
        "",
        "Listen to the source and master snippets together. If the master sounds natural and preserves the speaker, mark the moment as pass/context in the review notes. If it sounds gated, swallowed, echo-heavy, or unbalanced, route it as focused proof or scoped v007 repair. Do not unlock branch inheritance from this machine pack alone.",
    ])
    return "\n".join(lines) + "\n"


def update_manifest(manifest_path: Path, manifest: dict[str, Any], report: dict[str, Any]) -> None:
    outputs = manifest.setdefault("outputs", {})
    key_map = {
        "latestAudioSpeakerPreservationProofPack": report["json"],
        "latestAudioSpeakerPreservationProofPackMarkdown": report["markdown"],
        "latestAudioSpeakerPreservationProofPackHtml": report["html"],
        "latestAudioSpeakerPreservationProofPackPlaylist": report["playlist"],
        "latestAudioSpeakerPreservationProofPackNotesTemplate": report["notesTemplate"],
        "latestAudioSpeakerPreservationProofPackOpenCommand": report["openCommand"],
    }
    outputs.update(key_map)
    history_map = {
        "audioSpeakerPreservationProofPacks": report["json"],
        "audioSpeakerPreservationProofPackMarkdowns": report["markdown"],
        "audioSpeakerPreservationProofPackHtmls": report["html"],
        "audioSpeakerPreservationProofPackPlaylists": report["playlist"],
        "audioSpeakerPreservationProofPackNotesTemplates": report["notesTemplate"],
    }
    for key, value in history_map.items():
        history = outputs.setdefault(key, [])
        if isinstance(history, list) and value not in history:
            history.append(value)
    manifest["audioSpeakerPreservationProofPackCount"] = len(outputs.get("audioSpeakerPreservationProofPacks") or [])
    manifest["audioSpeakerPreservationProofPackLatestItemCount"] = report["itemCount"]
    manifest["audioSpeakerPreservationProofPackLatestRenderedSnippetCount"] = report["renderedSnippetCount"]
    manifest["audioSpeakerPreservationProofPackLatestFailureCount"] = report["renderFailureCount"]
    manifest["audioSpeakerPreservationProofPackApprovalStateChanged"] = False
    manifest["audioSpeakerPreservationProofPackBranchStateChanged"] = False
    manifest["audioSpeakerPreservationProofPackBranchRenderAttempted"] = False
    manifest["audioSpeakerPreservationProofPackOriginalMediaMutated"] = False
    manifest["updatedAt"] = datetime.now(timezone.utc).isoformat()
    write_json(manifest_path, manifest)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline-dir", required=True)
    parser.add_argument("--max-per-speaker", type=int, default=8)
    parser.add_argument("--pre-roll", type=float, default=4.0)
    parser.add_argument("--post-roll", type=float, default=6.0)
    parser.add_argument("--min-spacing", type=float, default=24.0)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(Path(args.baseline_dir))
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    outputs = manifest.get("outputs") or {}
    ledger_path_text = output_path(outputs.get("latestAudioSpeakerContributionLedger"))
    if not ledger_path_text:
        raise SystemExit("Missing latestAudioSpeakerContributionLedger in manifest outputs")
    ledger_path = Path(ledger_path_text)
    if not ledger_path.exists():
        raise SystemExit(f"Missing speaker contribution ledger: {ledger_path}")
    ledger = read_json(ledger_path)

    master_text = output_path(outputs.get("masterM4a")) or output_path(outputs.get("masterWav"))
    if not master_text:
        raise SystemExit("Missing masterM4a/masterWav in manifest outputs")
    master = Path(master_text)
    if not master.exists():
        raise SystemExit(f"Missing master audio: {master}")

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    baseline_id = str(manifest.get("baselineId") or ledger.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    out_dir = baseline_dir / f"audio-speaker-preservation-proof-pack-{slug}-{timestamp}"
    snippets_dir = out_dir / "snippets"
    snippets_dir.mkdir(parents=True, exist_ok=False)

    sources = load_sources(manifest)
    selected = select_markers(ledger, max_per_speaker=max(1, args.max_per_speaker), min_spacing=max(0.0, args.min_spacing))
    items: list[dict[str, Any]] = []
    playlist_lines = ["#EXTM3U"]
    rendered_count = 0
    failure_count = 0

    for index, marker in enumerate(selected, start=1):
        speaker = str(marker.get("speaker"))
        marker_start = float(marker.get("start") or 0.0)
        marker_end = float(marker.get("end") or marker_start + 2.0)
        window_start = max(0.0, marker_start - max(0.0, args.pre_roll))
        window_end = marker_end + max(0.0, args.post_roll)
        duration = max(0.5, window_end - window_start)
        timecode = str(marker.get("timecode") or f"{window_start:.1f}s")
        name = f"{index:02d}-{speaker}-{safe_slug(timecode)}"
        master_out = snippets_dir / f"{name}-master-v006.m4a"
        source_out = snippets_dir / f"{name}-source-mixgain.m4a"

        master_ok, master_error = render_master_snippet(master, master_out, window_start, duration)
        source = source_for_marker(sources, speaker, window_start, window_end)
        source_ok = False
        source_error = "No aligned source found for speaker/time window"
        source_start = None
        actual_source_duration = None
        if source:
            source_ok, source_error, source_start, actual_source_duration = render_source_snippet(source, source_out, window_start, duration)

        if master_ok:
            rendered_count += 1
            playlist_lines.extend([f"#EXTINF:{duration:.3f},{name} master v006", str(master_out)])
        else:
            failure_count += 1
        if source_ok:
            rendered_count += 1
            playlist_lines.extend([f"#EXTINF:{actual_source_duration or duration:.3f},{name} aligned source", str(source_out)])
        else:
            failure_count += 1

        render_status = "rendered" if master_ok and source_ok else "partial" if master_ok or source_ok else "failed"
        item = {
            "index": index,
            "speaker": speaker,
            "title": f"{speaker.title()} preservation check at {timecode}",
            "timecode": timecode,
            "windowStart": round(window_start, 3),
            "windowEnd": round(window_end, 3),
            "duration": round(duration, 3),
            "markerStart": marker_start,
            "markerEnd": marker_end,
            "flags": marker.get("flags") or [],
            "guidance": marker.get("guidance") or "Compare aligned source to mastered candidate for speaker preservation.",
            "charlieDeltaDb": marker.get("charlieDeltaDb"),
            "homerDeltaDb": marker.get("homerDeltaDb"),
            "sourceLabel": source.label if source else None,
            "sourcePath": str(source.path) if source else None,
            "sourceSeqStart": source.seq_start if source else None,
            "sourceStart": source_start,
            "sourceDuration": actual_source_duration,
            "sourceMixGain": source.volume if source else None,
            "masterSnippet": str(master_out) if master_ok else None,
            "sourceSnippet": str(source_out) if source_ok else None,
            "masterSnippetRelative": rel(master_out, out_dir) if master_ok else None,
            "sourceSnippetRelative": rel(source_out, out_dir) if source_ok else None,
            "renderStatus": render_status,
            "error": "; ".join(part for part in [None if master_ok else master_error, None if source_ok else source_error] if part),
        }
        items.append(item)

    report = {
        "schema": "quipsly.audio.speaker-preservation-proof-pack.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "baselineId": baseline_id,
        "baselineDir": str(baseline_dir),
        "approvalStatus": manifest.get("approvalStatus"),
        "packageReadyForHumanListen": bool(manifest.get("packageReadyForHumanListen")),
        "branchInheritanceReady": bool(manifest.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest.get("branchRenderReady")),
        "humanListenStillRequired": manifest.get("approvalStatus") != "human-approved-for-branch-inheritance",
        "itemCount": len(items),
        "renderedSnippetCount": rendered_count,
        "renderFailureCount": failure_count,
        "derivedSnippetRenderAttempted": True,
        "renderAttempted": False,
        "branchRenderAttempted": False,
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "originalMediaMutated": False,
        "sourceLedger": str(ledger_path),
        "masterAudio": str(master),
        "items": items,
    }

    report_path = out_dir / "speaker-preservation-proof-pack.json"
    markdown_path = out_dir / "speaker-preservation-proof-pack.md"
    html_path = out_dir / "speaker-preservation-proof-pack.html"
    playlist_path = out_dir / "speaker-preservation-proof-pack.m3u"
    notes_template_path = out_dir / "speaker-preservation-proof-notes-template.json"
    open_command_path = out_dir / "open-speaker-preservation-proof-pack.command"

    notes_template = {
        "schema": NOTES_SCHEMA,
        "baselineId": baseline_id,
        "sourceProofPack": str(report_path),
        "createdAt": report["generatedAt"],
        "exportedAt": None,
        "reviewer": "",
        "notes": [],
        "items": [
            {
                "index": item["index"],
                "speaker": item["speaker"],
                "timecode": item["timecode"],
                "windowStart": item["windowStart"],
                "windowEnd": item["windowEnd"],
                "flags": item["flags"],
                "title": item["title"],
                "sourceLabel": item.get("sourceLabel"),
                "masterSnippet": item.get("masterSnippet"),
                "sourceSnippet": item.get("sourceSnippet"),
                "decision": "undecided",
                "note": "",
            }
            for item in items
        ],
    }
    report["notesSchema"] = NOTES_SCHEMA
    report["notesTemplate"] = notes_template

    report.update({
        "json": str(report_path),
        "markdown": str(markdown_path),
        "html": str(html_path),
        "playlist": str(playlist_path),
        "notesTemplate": str(notes_template_path),
        "openCommand": str(open_command_path),
    })

    write_json(report_path, report)
    write_json(notes_template_path, notes_template)
    markdown_path.write_text(render_markdown(report), encoding="utf-8")
    html_path.write_text(render_html(report), encoding="utf-8")
    playlist_path.write_text("\n".join(playlist_lines) + "\n", encoding="utf-8")
    open_command_path.write_text(
        "#!/bin/zsh\nset -e\nopen " + shell_quote(str(html_path)) + "\n",
        encoding="utf-8",
    )
    open_command_path.chmod(0o755)

    update_manifest(manifest_path, manifest, report)
    print(json.dumps({
        "baselineId": baseline_id,
        "itemCount": len(items),
        "renderedSnippetCount": rendered_count,
        "renderFailureCount": failure_count,
        "markdown": str(markdown_path),
        "html": str(html_path),
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "branchRenderAttempted": False,
        "originalMediaMutated": False,
    }, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
