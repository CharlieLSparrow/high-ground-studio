#!/usr/bin/env python3
"""Run or prepare one safe transcript pilot from the execution-readiness queue.

Default behavior is dry-run: choose the safest small candidate and create a
reviewable pilot board without running ASR. Pass --execute to run exactly one
provider command, preserve raw provider output, and normalize it into Quipsly
transcript JSON.

Safety boundary: this script never mutates original media, imports transcripts,
reconciles transcript spines, writes timeline decisions, renders exports,
publishes, uploads, schedules, deletes, or overwrites prior pilot sessions.
"""
from __future__ import annotations

import argparse
import html
import json
import re
import shlex
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
READINESS_POINTER = RELEASE_ROOT / "review-board/transcript-execution-readiness/latest-transcript-execution-readiness.json"
OUT_ROOT = RELEASE_ROOT / "review-board/transcript-pilots"
LATEST_POINTER = OUT_ROOT / "latest-transcript-pilot.json"
PROVIDER = Path(__file__).resolve().parent / "local_transcript_provider.py"
SCHEMA = "quipsly.episode-transcript-pilot.v1"

DANGEROUS_TRUTH_KEYS = [
    "transcriptsImported",
    "reconciledTranscriptSpinesWritten",
    "timelineDecisionsWritten",
    "exportsRendered",
    "externalPublishing",
    "externalUpload",
    "externalSchedulesCreated",
    "approvalCreated",
    "receiptTruthCreated",
    "sourceFilesMutated",
    "versionsOverwritten",
    "filesDeleted",
]


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-transcript-pilot")


def esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""))


def shell_quote(value: str) -> str:
    return shlex.quote(value)


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def load_pointer(path: Path) -> dict[str, Any]:
    pointer = load_json(path)
    target = Path(str(pointer.get("jsonPath") or "")) if pointer.get("jsonPath") else None
    if target and target.exists() and target != path:
        target_payload = load_json(target)
        if target_payload:
            return {**pointer, **target_payload}
    return pointer


def iter_sources(readiness: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for episode in readiness.get("episodes") or []:
        if not isinstance(episode, dict):
            continue
        episode_number = episode.get("episode") if isinstance(episode.get("episode"), int) else None
        for item in episode.get("selectedSources") or []:
            if not isinstance(item, dict):
                continue
            source = dict(item)
            source.setdefault("episode", episode_number)
            source.setdefault("episodeLabel", episode.get("episodeLabel") or (f"Episode {episode_number}" if episode_number else "Episode unknown"))
            rows.append(source)
    return rows


def source_duration(row: dict[str, Any]) -> float:
    try:
        return float(row.get("durationSeconds") or 0)
    except Exception:
        return 0.0


def choose_candidate(rows: list[dict[str, Any]], episode: int | None, max_duration: float | None) -> tuple[dict[str, Any] | None, list[str]]:
    warnings: list[str] = []
    candidates = [row for row in rows if str(row.get("sourcePath") or "")]
    if episode is not None:
        candidates = [row for row in candidates if row.get("episode") == episode]
        if not candidates:
            return None, [f"No selected transcript sources found for Episode {episode}."]

    with_files: list[dict[str, Any]] = []
    for row in candidates:
        path = Path(str(row.get("sourcePath") or ""))
        if path.exists() and path.is_file():
            with_files.append(row)
        else:
            warnings.append(f"Source is not currently readable and was skipped: {path}")
    candidates = with_files
    if not candidates:
        return None, warnings + ["No selected transcript source files are currently readable."]

    if max_duration and max_duration > 0:
        short_enough = [row for row in candidates if 0 < source_duration(row) <= max_duration]
        if short_enough:
            candidates = short_enough
        else:
            shortest = min(candidates, key=source_duration)
            return None, warnings + [
                f"No selected source is <= {max_duration:.1f}s. Shortest candidate is {source_duration(shortest):.1f}s: {shortest.get('sourcePath')}"
            ]

    def rank(row: dict[str, Any]) -> tuple[int, float, str]:
        source_kind = str(row.get("sourceKind") or "")
        kind_rank = {
            "external-high-quality-audio": 0,
            "call-recording": 1,
            "external-audio": 2,
            "exported-podcast-master": 3,
            "source-video-scratch-audio": 4,
            "exported-video-audio": 5,
        }.get(source_kind, 8)
        return (kind_rank, source_duration(row) or 999999.0, str(row.get("sourcePath") or ""))

    return sorted(candidates, key=rank)[0], warnings


def seconds_from_stamp(value: str) -> float:
    # Supports 00:01:02,345 and 00:01:02.345
    value = value.strip().replace(",", ".")
    parts = value.split(":")
    if len(parts) == 3:
        hours, minutes, seconds = parts
        return int(hours) * 3600 + int(minutes) * 60 + float(seconds)
    if len(parts) == 2:
        minutes, seconds = parts
        return int(minutes) * 60 + float(seconds)
    return float(parts[0])


def strip_vtt_noise(text: str) -> str:
    lines = []
    for line in text.splitlines():
        clean = line.strip()
        if not clean or clean.upper() == "WEBVTT" or clean.startswith("NOTE"):
            continue
        if re.match(r"^\d+$", clean):
            continue
        lines.append(clean)
    return "\n".join(lines)


def parse_srt_or_vtt(raw: str) -> list[dict[str, Any]]:
    normalized = raw.replace("\ufeff", "")
    pattern = re.compile(
        r"(?P<start>\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}|\d{1,2}:\d{2}[,.]\d{1,3})\s*-->\s*"
        r"(?P<end>\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}|\d{1,2}:\d{2}[,.]\d{1,3})(?P<meta>[^\n]*)\n"
        r"(?P<body>.*?)(?=\n\s*\d*\s*\n?\s*\d{1,2}:\d{2}:|\Z)",
        re.DOTALL,
    )
    segments: list[dict[str, Any]] = []
    for match in pattern.finditer(normalized):
        start = seconds_from_stamp(match.group("start"))
        end = seconds_from_stamp(match.group("end"))
        text = strip_vtt_noise(match.group("body"))
        text = re.sub(r"<[^>]+>", "", text)
        text = re.sub(r"\s+", " ", text).strip()
        if not text or end <= start:
            continue
        segments.append({
            "speaker": "Speaker",
            "start": round(start, 3),
            "end": round(end, 3),
            "text": text,
            "words": [],
            "confidence": None,
            "reviewStatus": "asr-draft",
            "source": "srt-or-vtt-normalizer",
        })
    return segments


def normalize_provider_output(raw_text: str, source: dict[str, Any], raw_path: Path) -> tuple[dict[str, Any], list[str]]:
    warnings: list[str] = []
    stripped = raw_text.strip()
    provider = "unknown"
    model = "unknown"
    language = "unknown"
    segments: list[dict[str, Any]] = []

    if stripped.startswith("{"):
        try:
            payload = json.loads(stripped)
            provider = str(payload.get("provider") or "quipsly-json")
            model = str(payload.get("model") or "unknown")
            language = str(payload.get("language") or "unknown")
            for row in payload.get("segments") or []:
                if not isinstance(row, dict):
                    continue
                start = float(row.get("start") or 0)
                end = float(row.get("end") or start)
                text = str(row.get("text") or "").strip()
                if not text or end <= start:
                    continue
                words = row.get("words") if isinstance(row.get("words"), list) else []
                segments.append({
                    "speaker": str(row.get("speaker") or "Speaker"),
                    "start": round(start, 3),
                    "end": round(end, 3),
                    "text": text,
                    "words": words,
                    "confidence": row.get("confidence"),
                    "reviewStatus": str(row.get("reviewStatus") or "asr-draft"),
                    "source": provider,
                })
        except Exception as exc:
            warnings.append(f"Provider output looked like JSON but could not be parsed: {exc}")

    if not segments:
        srt_segments = parse_srt_or_vtt(stripped)
        if srt_segments:
            provider = "srt-or-vtt-provider-output"
            model = "sidecar-or-whisper-cpp"
            language = "unknown"
            segments = srt_segments

    if not segments and stripped:
        warnings.append("Provider output was plain text without timestamps; preserved as one review-only segment.")
        duration = source_duration(source)
        segments = [{
            "speaker": "Speaker",
            "start": 0.0,
            "end": round(duration, 3) if duration > 0 else 0.001,
            "text": re.sub(r"\s+", " ", stripped).strip(),
            "words": [],
            "confidence": None,
            "reviewStatus": "needs-timing-review",
            "source": "plain-text-fallback",
        }]
        provider = "plain-text-fallback"
        model = "unknown"
        language = "unknown"

    return {
        "schema": "quipsly.transcript.normalized.v1",
        "generatedAt": iso_now(),
        "status": "normalized-transcript-ready" if segments else "normalized-transcript-empty",
        "provider": provider,
        "model": model,
        "language": language,
        "source": {
            "episode": source.get("episode"),
            "episodeLabel": source.get("episodeLabel"),
            "queueId": source.get("queueId"),
            "sourceKind": source.get("sourceKind"),
            "fileName": source.get("fileName"),
            "sourcePath": source.get("sourcePath"),
            "durationSeconds": source.get("durationSeconds"),
            "rawProviderOutputPath": str(raw_path),
        },
        "counts": {
            "segments": len(segments),
            "words": sum(len(row.get("words") or []) for row in segments),
        },
        "segments": segments,
        "warnings": warnings,
        "truth": {
            "asrDraft": True,
            "speakerLabelsReviewed": False,
            "timingReviewed": False,
            "readyForCaptions": False,
            "readyForQuotes": False,
            "transcriptImported": False,
            "timelineDecisionsWritten": False,
            "sourceFilesMutated": False,
        },
    }, warnings


def provider_doctor() -> dict[str, Any]:
    result = subprocess.run(
        ["python3", str(PROVIDER), "--doctor"],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
        timeout=30,
    )
    try:
        payload = json.loads(result.stdout)
    except Exception:
        payload = {}
    payload["exitCode"] = result.returncode
    if result.stderr.strip():
        payload["stderr"] = result.stderr.strip()[-2000:]
    if "available" not in payload:
        payload["available"] = bool(
            payload.get("pythonWhisperAvailable")
            or payload.get("mlxWhisperAvailable")
            or payload.get("whisperCliPath")
            or (payload.get("whisperCppCliPath") and payload.get("whisperCppModelExists"))
        )
    return payload


def run_provider(source: dict[str, Any], raw_path: Path, timeout: int, provider: str, model: str, language: str) -> tuple[bool, str, str, int]:
    raw_path.parent.mkdir(parents=True, exist_ok=True)
    command = ["python3", str(PROVIDER), str(source.get("sourcePath") or ""), "--provider", provider, "--model", model, "--language", language]
    try:
        result = subprocess.run(
            command,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired as exc:
        stderr = f"Transcript provider timed out after {timeout}s. Partial stderr: {exc.stderr or ''}"
        return False, "", stderr, 124
    if result.stdout:
        raw_path.write_text(result.stdout.rstrip() + "\n", encoding="utf-8")
    return result.returncode == 0 and raw_path.exists() and raw_path.stat().st_size > 0, result.stdout, result.stderr, result.returncode


def planned_raw_path(candidate: dict[str, Any], session_dir: Path) -> Path:
    existing = str(candidate.get("plannedRawProviderOutputPath") or "")
    if existing:
        return Path(existing)
    queue_id = str(candidate.get("queueId") or "pilot-source")
    return session_dir / f"{queue_id}.provider-output.txt"


def planned_normalized_path(candidate: dict[str, Any], session_dir: Path) -> Path:
    existing = str(candidate.get("plannedNormalizedTranscriptJsonPath") or "")
    if existing:
        return Path(existing)
    queue_id = str(candidate.get("queueId") or "pilot-source")
    return session_dir / f"{queue_id}.quipsly-transcript.json"


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def render_markdown(payload: dict[str, Any]) -> str:
    source = payload.get("selectedSource") if isinstance(payload.get("selectedSource"), dict) else {}
    counts = payload.get("counts") if isinstance(payload.get("counts"), dict) else {}
    truth = payload.get("truth") if isinstance(payload.get("truth"), dict) else {}
    lines = [
        "# Transcript pilot",
        "",
        f"Generated: `{payload.get('generatedAt')}`",
        f"Status: `{payload.get('status')}`",
        "",
        f"Next: {payload.get('nextSafestAction')}",
        "",
        "## Selected source",
        "",
        f"- Episode: `{source.get('episodeLabel')}`",
        f"- Kind: `{source.get('sourceKind')}`",
        f"- File: `{source.get('fileName')}`",
        f"- Duration: `{source.get('durationSeconds')}` seconds",
        f"- Source path: `{source.get('sourcePath')}`",
        f"- Raw provider output: `{payload.get('rawProviderOutputPath')}`",
        f"- Normalized transcript: `{payload.get('normalizedTranscriptJsonPath')}`",
        "",
        "## Counts",
        "",
        f"- ASR runs: `{counts.get('asrRun')}`",
        f"- Raw provider outputs written: `{counts.get('rawProviderOutputsWritten')}`",
        f"- Normalized transcripts written: `{counts.get('normalizedTranscriptsWritten')}`",
        f"- Segments: `{counts.get('segments')}`",
        f"- Words with timings: `{counts.get('words')}`",
        "",
        "## Truth boundary",
        "",
    ]
    for key in ["asrRun", "rawProviderOutputWritten", "normalizedTranscriptWritten", *DANGEROUS_TRUTH_KEYS]:
        lines.append(f"- {key}: `{truth.get(key)}`")
    warnings = payload.get("warnings") if isinstance(payload.get("warnings"), list) else []
    if warnings:
        lines.extend(["", "## Warnings", ""])
        for warning in warnings:
            lines.append(f"- {warning}")
    return "\n".join(lines).rstrip() + "\n"


def write_html(path: Path, payload: dict[str, Any]) -> None:
    source = payload.get("selectedSource") if isinstance(payload.get("selectedSource"), dict) else {}
    counts = payload.get("counts") if isinstance(payload.get("counts"), dict) else {}
    truth = payload.get("truth") if isinstance(payload.get("truth"), dict) else {}
    warnings = payload.get("warnings") if isinstance(payload.get("warnings"), list) else []
    warnings_html = "".join(f"<li>{esc(w)}</li>" for w in warnings) or "<li>No warnings for this pilot report.</li>"
    truth_rows = "".join(
        f"<tr><td>{esc(key)}</td><td><code>{esc(truth.get(key))}</code></td></tr>"
        for key in ["asrRun", "rawProviderOutputWritten", "normalizedTranscriptWritten", *DANGEROUS_TRUTH_KEYS]
    )
    html_text = f"""<!doctype html><html><head><meta charset=\"utf-8\"><title>Transcript pilot</title>
<style>
:root {{ color-scheme:dark; --bg:#11170f; --panel:#1d2c20; --ink:#fff2d8; --muted:#cbbd9f; --gold:#f1c85a; --leaf:#80db87; --water:#73cddd; --clay:#d8845f; --line:#3a563f; }}
body {{ margin:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:radial-gradient(circle at top left,rgba(115,205,221,.18),transparent 28%),linear-gradient(135deg,#10170f,#241b12 72%); color:var(--ink); }}
main {{ max-width:1120px; margin:0 auto; padding:38px 24px 80px; }}
header,.panel {{ border:1px solid var(--line); border-radius:30px; background:rgba(29,44,32,.92); padding:24px; margin:18px 0; box-shadow:0 18px 52px rgba(0,0,0,.28); }}
h1 {{ font-size:clamp(38px,6vw,78px); line-height:.92; margin:.05em 0 .25em; }}
.eyebrow {{ color:var(--gold); text-transform:uppercase; letter-spacing:.16em; font-size:12px; font-weight:900; }}
.counts {{ display:flex; flex-wrap:wrap; gap:10px; margin:16px 0; }}
.pill {{ border:1px solid var(--line); border-radius:999px; padding:8px 12px; background:rgba(0,0,0,.18); }}
.path {{ color:var(--muted); overflow-wrap:anywhere; }}
.grid {{ display:grid; grid-template-columns:1.1fr .9fr; gap:18px; }}
table {{ width:100%; border-collapse:collapse; }}
td {{ padding:8px 6px; border-bottom:1px solid rgba(255,255,255,.08); }}
code,pre {{ color:var(--leaf); white-space:pre-wrap; }}
@media(max-width:850px) {{ .grid {{ grid-template-columns:1fr; }} }}
</style></head><body><main>
<header><p class=\"eyebrow\">Quipsly Studio · transcript pilot</p><h1>{esc(payload.get('status'))}</h1><p>{esc(payload.get('nextSafestAction'))}</p><div class=\"counts\"><span class=\"pill\">ASR runs: {esc(counts.get('asrRun'))}</span><span class=\"pill\">raw outputs: {esc(counts.get('rawProviderOutputsWritten'))}</span><span class=\"pill\">normalized: {esc(counts.get('normalizedTranscriptsWritten'))}</span><span class=\"pill\">segments: {esc(counts.get('segments'))}</span></div></header>
<div class=\"grid\"><section class=\"panel\"><p class=\"eyebrow\">Selected source</p><h2>{esc(source.get('fileName'))}</h2><p>{esc(source.get('episodeLabel'))} · {esc(source.get('sourceKind'))} · {esc(source.get('durationSeconds'))}s</p><p class=\"path\">{esc(source.get('sourcePath'))}</p><h3>Outputs</h3><p class=\"path\">Raw: {esc(payload.get('rawProviderOutputPath'))}</p><p class=\"path\">Normalized: {esc(payload.get('normalizedTranscriptJsonPath'))}</p></section><section class=\"panel\"><p class=\"eyebrow\">Truth receipt</p><table>{truth_rows}</table></section></div>
<section class=\"panel\"><p class=\"eyebrow\">Warnings</p><ul>{warnings_html}</ul></section>
<section class=\"panel\"><p class=\"eyebrow\">Commands</p><pre>{esc(payload.get('safeExecuteCommand'))}</pre><p>This command targets one source only. It does not import or reconcile transcripts automatically.</p></section>
</main></body></html>"""
    path.write_text(html_text, encoding="utf-8")


def build_payload(args: argparse.Namespace) -> dict[str, Any]:
    readiness = load_pointer(Path(args.readiness_pointer))
    rows = iter_sources(readiness)
    session_dir = OUT_ROOT / stamp()
    candidate, warnings = choose_candidate(rows, args.episode, args.max_duration)
    doctor = provider_doctor()

    status = "transcript-pilot-ready"
    raw_path = session_dir / "no-source.provider-output.txt"
    normalized_path = session_dir / "no-source.quipsly-transcript.json"
    normalized_payload: dict[str, Any] = {}
    provider_stdout = ""
    provider_stderr = ""
    provider_exit_code: int | None = None
    asr_ok = False
    normalized_ok = False

    if candidate:
        raw_path = planned_raw_path(candidate, session_dir)
        normalized_path = planned_normalized_path(candidate, session_dir)
    else:
        status = "transcript-pilot-blocked"

    if candidate and args.execute:
        if source_duration(candidate) > args.max_duration > 0:
            status = "transcript-pilot-blocked"
            warnings.append(f"Refusing to execute because selected duration {source_duration(candidate):.1f}s exceeds --max-duration {args.max_duration:.1f}s.")
        elif not bool(doctor.get("available")):
            status = "transcript-pilot-blocked"
            warnings.append("Provider doctor says no ASR provider is available; not executing.")
        else:
            asr_ok, provider_stdout, provider_stderr, provider_exit_code = run_provider(candidate, raw_path, args.timeout, args.provider, args.model, args.language)
            if asr_ok:
                normalized_payload, normalization_warnings = normalize_provider_output(provider_stdout, candidate, raw_path)
                warnings.extend(normalization_warnings)
                write_json(normalized_path, normalized_payload)
                normalized_ok = normalized_path.exists() and normalized_path.stat().st_size > 0 and normalized_payload.get("status") == "normalized-transcript-ready"
                status = "transcript-pilot-executed" if normalized_ok else "transcript-pilot-needs-review"
            else:
                status = "transcript-pilot-failed"
                if provider_stderr.strip():
                    warnings.append(provider_stderr.strip()[-2000:])
                warnings.append(f"Provider exited with code {provider_exit_code}.")
    elif candidate and not args.execute:
        warnings.append("Dry run only. Pass --execute to run exactly one ASR provider command.")

    truth = {
        "executionDryRun": bool(not args.execute),
        "asrRun": bool(args.execute and asr_ok),
        "rawProviderOutputWritten": bool(raw_path.exists() and raw_path.stat().st_size > 0),
        "normalizedTranscriptWritten": bool(normalized_ok),
        "normalizedTranscriptImported": False,
        "transcriptsImported": False,
        "reconciledTranscriptSpinesWritten": False,
        "timelineDecisionsWritten": False,
        "exportsRendered": False,
        "externalPublishing": False,
        "externalUpload": False,
        "externalSchedulesCreated": False,
        "approvalCreated": False,
        "receiptTruthCreated": False,
        "sourceFilesMutated": False,
        "versionsOverwritten": False,
        "filesDeleted": False,
    }
    counts = {
        "episodeSourcesAvailable": len(rows),
        "asrRun": 1 if truth["asrRun"] else 0,
        "rawProviderOutputsWritten": 1 if truth["rawProviderOutputWritten"] else 0,
        "normalizedTranscriptsWritten": 1 if truth["normalizedTranscriptWritten"] else 0,
        "segments": int((normalized_payload.get("counts") or {}).get("segments") or 0) if normalized_payload else 0,
        "words": int((normalized_payload.get("counts") or {}).get("words") or 0) if normalized_payload else 0,
    }
    safe_command = ""
    if candidate:
        safe_command = (
            f"python3 {shell_quote(str(Path(__file__).resolve()))} --execute --episode {candidate.get('episode') or ''} "
            f"--max-duration {args.max_duration:g} --provider {shell_quote(args.provider)} --model {shell_quote(args.model)} --language {shell_quote(args.language)}"
        )

    next_action = ""
    if status == "transcript-pilot-executed":
        next_action = "Open the normalized transcript JSON, review timing/speaker quality, then decide whether to run the next Episode 1/6 source or build reconciliation tooling."
    elif status == "transcript-pilot-ready":
        next_action = "Run the safe execute command for this one selected source, then review the normalized transcript before importing or reconciling anything."
    elif status == "transcript-pilot-blocked":
        next_action = "Pick a shorter readable source, extract a small local test copy, or configure the ASR provider before trying execution again."
    else:
        next_action = "Read the warnings, fix the provider/source issue, then rerun the pilot on one source only."

    payload = {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": status,
        "releaseRoot": str(RELEASE_ROOT),
        "sessionDir": str(session_dir),
        "readinessPointer": str(args.readiness_pointer),
        "readinessHtml": readiness.get("htmlPath") or "",
        "providerDoctor": doctor,
        "providerAvailable": bool(doctor.get("available")),
        "selectedSource": candidate or {},
        "rawProviderOutputPath": str(raw_path),
        "normalizedTranscriptJsonPath": str(normalized_path),
        "safeExecuteCommand": safe_command,
        "providerExitCode": provider_exit_code,
        "counts": counts,
        "warnings": warnings,
        "nextSafestAction": next_action,
        "truth": truth,
    }
    return payload


def main() -> int:
    parser = argparse.ArgumentParser(description="Prepare or run one Quipsly Studio transcript pilot.")
    parser.add_argument("--readiness-pointer", default=str(READINESS_POINTER))
    parser.add_argument("--episode", type=int, default=None, help="Limit candidate selection to one episode number.")
    parser.add_argument("--max-duration", type=float, default=180.0, help="Refuse execution if selected source is longer than this many seconds.")
    parser.add_argument("--execute", action="store_true", help="Run exactly one ASR command and normalize its output.")
    parser.add_argument("--timeout", type=int, default=900, help="Provider timeout in seconds for --execute.")
    parser.add_argument("--provider", default="auto")
    parser.add_argument("--model", default="base")
    parser.add_argument("--language", default="en")
    args = parser.parse_args()

    payload = build_payload(args)
    session_dir = Path(payload["sessionDir"])
    html_path = session_dir / "index.html"
    json_path = session_dir / "transcript-pilot.json"
    markdown_path = session_dir / "START-HERE-transcript-pilot.md"
    payload.update({
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "firstSafeAction": {
            "label": "Open transcript pilot",
            "command": f"open {shell_quote(str(html_path))}",
            "path": str(html_path),
            "safety": "Opens a local transcript pilot receipt. No import, reconciliation, timeline mutation, render, approval, upload, publication, schedule, overwrite, source mutation, delete, or receipt truth.",
        },
    })
    write_json(json_path, payload)
    markdown_path.parent.mkdir(parents=True, exist_ok=True)
    markdown_path.write_text(render_markdown(payload), encoding="utf-8")
    write_html(html_path, payload)
    write_json(LATEST_POINTER, payload)
    print(json.dumps({
        "status": payload.get("status"),
        "htmlPath": payload.get("htmlPath"),
        "jsonPath": payload.get("jsonPath"),
        "markdownPath": payload.get("markdownPath"),
        "selectedSource": payload.get("selectedSource"),
        "counts": payload.get("counts"),
        "truth": payload.get("truth"),
        "warnings": payload.get("warnings"),
        "nextSafestAction": payload.get("nextSafestAction"),
        "firstSafeAction": payload.get("firstSafeAction"),
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
