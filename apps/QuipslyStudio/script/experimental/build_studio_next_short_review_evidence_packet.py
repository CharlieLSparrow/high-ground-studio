#!/usr/bin/env python3
"""Build an evidence packet for the next local Studio short.

This is an orchestration layer over the existing cut-quality tools. It selects
the same short as the next watch/listen brief, then creates concrete visual and
audio evidence for that short so review is less hand-wavy:

- contact sheet frames for crop/framing/caption safety
- audio/cadence probe for pauses, volume, and listen-through questions
- one combined packet with safe commands and truth boundaries

It does not approve, publish, upload, schedule, mutate media, overwrite, delete,
or create receipt truth.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
APP_ROOT = Path(__file__).resolve().parents[2]
LATEST_LEDGER_POINTER = Path("review-board/latest-studio-short-review-decision-ledger.json")
DEFAULT_LEDGER_PATH = Path("review-board/studio-short-review-decision-ledger/studio-short-review-decision-ledger.json")


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def load_json(path: Path) -> dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    return data if isinstance(data, dict) else {}


def load_module(script_name: str) -> Any:
    for module_path in (Path(__file__).with_name(script_name), APP_ROOT / "script" / script_name):
        if not module_path.exists():
            continue
        spec = importlib.util.spec_from_file_location(script_name.replace(".py", ""), module_path)
        if spec is None or spec.loader is None:
            raise RuntimeError(f"Could not load module at {module_path}")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    raise RuntimeError(f"Could not find {script_name}")


def run_json(command: list[str]) -> tuple[dict[str, Any], dict[str, Any]]:
    completed = subprocess.run(command, text=True, capture_output=True, check=False)
    diagnostic = {
        "command": command,
        "returnCode": completed.returncode,
        "stderr": completed.stderr.strip(),
    }
    if completed.returncode != 0:
        return {}, diagnostic
    try:
        payload = json.loads(completed.stdout)
        return payload if isinstance(payload, dict) else {}, diagnostic
    except json.JSONDecodeError:
        diagnostic["stdoutPreview"] = completed.stdout[:1000]
        return {}, diagnostic


def default_output_dir(root: Path) -> Path:
    if root.exists():
        return root / "review-board" / "short-review-evidence-packets"
    return Path.home() / "Desktop" / "Quipsly_Short_Review_Evidence_Packets"


def load_decision_ledger(root: Path) -> tuple[dict[str, Any], Path | None]:
    pointer_path = root / LATEST_LEDGER_POINTER
    if pointer_path.exists():
        pointer = load_json(pointer_path)
        pointed = Path(str(pointer.get("jsonPath") or ""))
        if pointed.exists():
            return load_json(pointed), pointed
    default_path = root / DEFAULT_LEDGER_PATH
    if default_path.exists():
        return load_json(default_path), default_path
    return {}, None


def find_ledger_item(ledger: dict[str, Any], short_id: str) -> dict[str, Any]:
    for item in ledger.get("items", []) if isinstance(ledger.get("items"), list) else []:
        if isinstance(item, dict) and str(item.get("shortId") or "") == short_id:
            return item
    return {}


def file_uri(path: str) -> str:
    try:
        return Path(path).expanduser().resolve().as_uri()
    except (OSError, ValueError):
        return ""


def decision_commands(short_id: str) -> dict[str, str]:
    dry = "./script/agentctl.sh studio-short-review-decision-dry-run"
    live = "./script/agentctl.sh studio-short-review-decision"
    return {
        "dryRunKeep": f"{dry} {short_id} keep '<reviewer>' '<why this short is locally promising>'",
        "dryRunRefine": f"{dry} {short_id} refine '<reviewer>' '<crop/pacing/caption/audio issue>'",
        "dryRunHold": f"{dry} {short_id} hold '<reviewer>' '<what must be checked before deciding>'",
        "dryRunReject": f"{dry} {short_id} reject '<reviewer>' '<why this should not move forward>'",
        "recordKeep": f"{live} {short_id} keep '<reviewer>' '<why this short is locally promising>'",
        "recordRefine": f"{live} {short_id} refine '<reviewer>' '<crop/pacing/caption/audio issue>'",
        "recordHold": f"{live} {short_id} hold '<reviewer>' '<what must be checked before deciding>'",
        "recordReject": f"{live} {short_id} reject '<reviewer>' '<why this should not move forward>'",
        "recordNeedsMoreEvidence": f"{live} {short_id} needs-more-evidence '<reviewer>' '<what evidence is missing>'",
    }


def targeted_brief(root: Path, short_id: str) -> dict[str, Any]:
    ledger, ledger_path = load_decision_ledger(root)
    item = find_ledger_item(ledger, short_id)
    if not item:
        return {
            "status": "studio-next-short-watch-listen-brief-needs-handoff",
            "nextSafestAction": f"Short `{short_id}` was not found in the local review ledger. Build the shorts batch and decision ledger first.",
            "truth": {
                "externalPublishing": False,
                "externalUpload": False,
                "externalSchedulesCreated": False,
                "approvalCreated": False,
                "receiptTruthCreated": False,
                "accountMutation": False,
                "sourceFilesMutated": False,
                "versionsOverwritten": False,
                "filesDeleted": False,
                "reviewDecisionCreated": False,
                "description": "Targeted evidence lookup failed before any review decision or publication truth was created.",
            },
        }
    path = str(item.get("path") or "")
    commands = decision_commands(short_id)
    return {
        "status": "studio-next-short-watch-listen-brief-ready",
        "generatedAt": utc_now(),
        "root": str(root),
        "sourceLedgerPath": str(ledger_path) if ledger_path else "",
        "plainEnglish": "Targeted evidence brief for one local short selected by --short-id.",
        "short": {
            "id": short_id,
            "episode": item.get("episode", ""),
            "version": item.get("episodeVersion") or item.get("version", ""),
            "shortIndex": item.get("shortIndex", ""),
            "title": item.get("title", ""),
            "humanTitle": item.get("title", ""),
            "path": path,
            "fileUri": file_uri(path) if path else "",
            "exists": Path(path).exists() if path else False,
            "bytes": Path(path).stat().st_size if path and Path(path).exists() else item.get("bytes", 0),
            "durationSeconds": item.get("durationSeconds"),
            "durationLabel": item.get("durationLabel", ""),
            "hasAudio": bool(item.get("hasAudio")),
            "hasVideo": bool(item.get("hasVideo")),
            "aspect": item.get("aspect", ""),
            "width": item.get("width", 0),
            "height": item.get("height", 0),
            "reviewSource": item.get("reviewSource", "short-review-decision-ledger"),
            "status": item.get("status", ""),
        },
        "safeCommands": {
            "openShort": f"open '{path}'" if path else "",
            "revealShort": f"open -R '{path}'" if path else "",
            **commands,
        },
        "truth": {
            "externalPublishing": False,
            "externalUpload": False,
            "externalSchedulesCreated": False,
            "approvalCreated": False,
            "receiptTruthCreated": False,
            "accountMutation": False,
            "sourceFilesMutated": False,
            "versionsOverwritten": False,
            "filesDeleted": False,
            "reviewDecisionCreated": False,
            "description": "Targeted watch/listen brief over one local short. It does not approve, publish, upload, schedule, mutate media, overwrite, delete, mutate accounts, or create receipt truth.",
        },
    }


def summarize_contact_sheet(payload: dict[str, Any]) -> dict[str, Any]:
    artifact_paths = payload.get("artifactPaths") if isinstance(payload.get("artifactPaths"), dict) else {}
    probe = payload.get("probe") if isinstance(payload.get("probe"), dict) else {}
    return {
        "status": "available" if payload.get("shortId") else "missing",
        "shortId": payload.get("shortId", ""),
        "artifactDir": payload.get("artifactDir", ""),
        "htmlPath": artifact_paths.get("html", ""),
        "jsonPath": artifact_paths.get("json", ""),
        "markdownPath": artifact_paths.get("markdown", ""),
        "framesCreated": payload.get("framesCreated", 0),
        "framesRequested": payload.get("framesRequested", 0),
        "mediaPath": payload.get("mediaPath", ""),
        "width": probe.get("width", 0),
        "height": probe.get("height", 0),
        "durationSeconds": probe.get("durationSeconds", 0),
        "truth": payload.get("truth", ""),
    }


def summarize_audio_probe(payload: dict[str, Any]) -> dict[str, Any]:
    artifact_paths = payload.get("artifactPaths") if isinstance(payload.get("artifactPaths"), dict) else {}
    cadence = payload.get("cadenceAssessment") if isinstance(payload.get("cadenceAssessment"), dict) else {}
    volume = payload.get("volume") if isinstance(payload.get("volume"), dict) else {}
    return {
        "status": "available" if payload.get("shortId") else "missing",
        "shortId": payload.get("shortId", ""),
        "artifactDir": payload.get("artifactDir", ""),
        "htmlPath": artifact_paths.get("html", ""),
        "jsonPath": artifact_paths.get("json", ""),
        "markdownPath": artifact_paths.get("markdown", ""),
        "waveformPath": payload.get("waveformPath", ""),
        "silenceCount": cadence.get("silenceCount", 0),
        "meaningfulPauseCount": cadence.get("meaningfulPauseCount", 0),
        "longPauseCount": cadence.get("longPauseCount", 0),
        "longestPauseSeconds": cadence.get("longestPauseSeconds", 0),
        "silenceFraction": cadence.get("silenceFraction", 0),
        "warnings": cadence.get("warnings", []),
        "meanVolumeDb": volume.get("meanVolumeDb"),
        "maxVolumeDb": volume.get("maxVolumeDb"),
        "truth": payload.get("truth", ""),
    }


def summarize_transcript_draft(root: Path, short_id: str) -> dict[str, Any]:
    folder = root / "shorts-command-room" / "transcript-workorders" / short_id
    normalized_path = folder / f"{short_id}-normalized-transcript.json"
    asr_path = folder / f"{short_id}-asr-draft-transcript.json"
    raw_path = folder / f"{short_id}-raw-asr-output.json"
    srt_path = folder / f"{short_id}-caption-draft.srt"
    vtt_path = folder / f"{short_id}-caption-draft.vtt"
    json_path = normalized_path if normalized_path.exists() else asr_path if asr_path.exists() else raw_path if raw_path.exists() else None
    if not json_path:
        return {
            "status": "missing",
            "shortId": short_id,
            "jsonPath": "",
            "captionDraftSrt": str(srt_path) if srt_path.exists() else "",
            "captionDraftVtt": str(vtt_path) if vtt_path.exists() else "",
            "textPreview": "",
            "segmentsCount": 0,
            "wordsCount": 0,
            "truth": "No transcript draft was found. This is not a failed review; it means semantic evidence still needs ASR or human notes.",
        }
    try:
        payload = load_json(json_path)
    except (OSError, json.JSONDecodeError):
        payload = {}
    segments = payload.get("segments") if isinstance(payload.get("segments"), list) else []
    words_count = 0
    for segment in segments:
        if isinstance(segment, dict) and isinstance(segment.get("words"), list):
            words_count += len(segment.get("words") or [])
    text = str(payload.get("text") or payload.get("transcript") or "")
    if not text and segments:
        text = " ".join(str(segment.get("text") or "").strip() for segment in segments if isinstance(segment, dict)).strip()
    return {
        "status": payload.get("status") or "machine-draft-needs-human-review",
        "shortId": short_id,
        "jsonPath": str(json_path),
        "captionDraftSrt": str(srt_path) if srt_path.exists() else "",
        "captionDraftVtt": str(vtt_path) if vtt_path.exists() else "",
        "textPreview": text[:700],
        "segmentsCount": len(segments),
        "wordsCount": words_count,
        "truth": "Machine transcript draft only. Use it for semantic review and caption planning, not as reviewed transcript truth.",
    }


def write_single_short_fallback_workbench(root: Path, short: dict[str, Any]) -> Path | None:
    short_id = str(short.get("id") or "")
    media_path = str(short.get("path") or "")
    if not short_id or not media_path or not Path(media_path).exists():
        return None
    out_path = root / "shorts-command-room" / "cut-quality-workbench" / "single-short-fallbacks" / f"{short_id}-from-review-ledger.json"
    item = {
        "shortId": short_id,
        "episode": short.get("episode", ""),
        "version": short.get("version", ""),
        "rank": short.get("shortIndex") or 999,
        "title": short.get("humanTitle") or short.get("title") or short_id,
        "readinessLevel": "ledger-only-review",
        "mediaPath": media_path,
        "path": media_path,
        "durationSeconds": short.get("durationSeconds"),
        "durationLabel": short.get("durationLabel", ""),
        "aspect": short.get("aspect", ""),
        "width": short.get("width", 0),
        "height": short.get("height", 0),
        "hasAudio": bool(short.get("hasAudio")),
        "hasVideo": bool(short.get("hasVideo")),
        "reviewSource": short.get("reviewSource", "short-review-decision-ledger"),
        "truth": "Synthetic one-short workbench generated from the local review ledger so contact/audio tools can inspect an otherwise valid short. It does not approve, publish, upload, schedule, mutate media, overwrite exports, delete files, or create receipt truth.",
    }
    write_json(out_path, {
        "schema": "quipsly.studio.single-short-fallback-workbench.v1",
        "generatedAt": utc_now(),
        "source": "studio-next-short-review-evidence",
        "items": [item],
        "truth": item["truth"],
    })
    return out_path


def rerun_with_fallback_workbench(
    root: Path,
    short: dict[str, Any],
    short_id: str,
    frames: int,
    contact_payload: dict[str, Any],
    contact_diagnostic: dict[str, Any],
    audio_payload: dict[str, Any],
    audio_diagnostic: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any], str]:
    contact_missing = "Short not found in cut-quality workbench" in str(contact_diagnostic.get("stderr") or "")
    audio_missing = "Short not found in cut-quality workbench" in str(audio_diagnostic.get("stderr") or "")
    if not (contact_missing or audio_missing):
        return contact_payload, contact_diagnostic, audio_payload, audio_diagnostic, ""
    fallback = write_single_short_fallback_workbench(root, short)
    if not fallback:
        return contact_payload, contact_diagnostic, audio_payload, audio_diagnostic, ""
    if contact_missing:
        contact_payload, contact_diagnostic = run_json([
            sys.executable,
            str(APP_ROOT / "script" / "studio_shorts_cut_quality_contact_sheet.py"),
            "--workbench",
            str(fallback),
            "--short-id",
            short_id,
            "--frames",
            str(frames),
            "--json",
        ])
        contact_diagnostic["fallbackWorkbench"] = str(fallback)
    if audio_missing:
        audio_payload, audio_diagnostic = run_json([
            sys.executable,
            str(APP_ROOT / "script" / "studio_shorts_cut_quality_audio_probe.py"),
            "--workbench",
            str(fallback),
            "--short-id",
            short_id,
            "--json",
        ])
        audio_diagnostic["fallbackWorkbench"] = str(fallback)
    return contact_payload, contact_diagnostic, audio_payload, audio_diagnostic, str(fallback)


def build_payload(root: Path, batch_path: Path | None, refresh: bool, limit: int, include_warnings: bool, frames: int, short_id: str = "") -> dict[str, Any]:
    if short_id:
        brief = targeted_brief(root, short_id)
    else:
        brief_module = load_module("build_studio_next_short_watch_listen_brief.py")
        brief = brief_module.build_payload(
            root=root,
            batch_path=batch_path,
            refresh=refresh,
            limit=limit,
            include_warnings=include_warnings,
        )
    short = brief.get("short") if isinstance(brief.get("short"), dict) else {}
    short_id = str(short.get("id") or "")
    base_truth = {
        "externalPublishing": False,
        "externalUpload": False,
        "externalSchedulesCreated": False,
        "approvalCreated": False,
        "receiptTruthCreated": False,
        "accountMutation": False,
        "sourceFilesMutated": False,
        "versionsOverwritten": False,
        "filesDeleted": False,
        "reviewDecisionCreated": False,
        "description": "Evidence packet over the next local short. It creates review artifacts from derivative shorts only; it does not approve, publish, upload, schedule, mutate source media, overwrite, delete, mutate accounts, or create receipt truth.",
    }
    if brief.get("status") != "studio-next-short-watch-listen-brief-ready" or not short_id:
        return {
            "schema": "quipsly.studio.next-short-review-evidence-packet.v1",
            "status": "studio-next-short-review-evidence-needs-short",
            "generatedAt": utc_now(),
            "root": str(root),
            "plainEnglish": "No ranked local short was ready for evidence generation.",
            "nextSafestAction": brief.get("nextSafestAction", "Build the shorts review batch and decision ledger first."),
            "watchListenBrief": brief,
            "truth": base_truth,
        }

    contact_command = [
        sys.executable,
        str(APP_ROOT / "script" / "studio_shorts_cut_quality_contact_sheet.py"),
        "--short-id",
        short_id,
        "--frames",
        str(frames),
        "--json",
    ]
    audio_command = [
        sys.executable,
        str(APP_ROOT / "script" / "studio_shorts_cut_quality_audio_probe.py"),
        "--short-id",
        short_id,
        "--json",
    ]
    contact_payload, contact_diagnostic = run_json(contact_command)
    audio_payload, audio_diagnostic = run_json(audio_command)
    contact_payload, contact_diagnostic, audio_payload, audio_diagnostic, fallback_workbench = rerun_with_fallback_workbench(
        root=root,
        short=short,
        short_id=short_id,
        frames=frames,
        contact_payload=contact_payload,
        contact_diagnostic=contact_diagnostic,
        audio_payload=audio_payload,
        audio_diagnostic=audio_diagnostic,
    )
    contact_summary = summarize_contact_sheet(contact_payload)
    audio_summary = summarize_audio_probe(audio_payload)
    transcript_summary = summarize_transcript_draft(root, short_id)
    missing: list[str] = []
    if contact_summary["status"] != "available":
        missing.append("contact-sheet")
    if audio_summary["status"] != "available":
        missing.append("audio-probe")
    status = "studio-next-short-review-evidence-ready" if not missing else "studio-next-short-review-evidence-partial"
    return {
        "schema": "quipsly.studio.next-short-review-evidence-packet.v1",
        "status": status,
        "generatedAt": utc_now(),
        "root": str(root),
        "plainEnglish": "Use this packet to watch/listen with evidence: open the short, inspect the contact sheet, compare the waveform/pause probe, then record only local review intent.",
        "short": short,
        "watchListenBrief": brief,
        "contactSheet": contact_summary,
        "audioProbe": audio_summary,
        "transcriptDraft": transcript_summary,
        "toolDiagnostics": {
            "contactSheet": contact_diagnostic,
            "audioProbe": audio_diagnostic,
            "fallbackWorkbench": fallback_workbench,
        },
        "missingEvidence": missing,
        "reviewOrder": [
            "Open the short with sound on.",
            "Inspect the contact sheet for hook frame, crop, caption safety, and visual jumps.",
            "Inspect the audio probe for long pauses, silence fraction, and level surprises.",
            "If a transcript draft is available, use it to check hook clarity, repeated phrasing, and whether the ending lands.",
            "Record specific cut-quality notes before recording keep/refine/hold/reject intent.",
        ],
        "safeCommands": {
            "openShort": brief.get("safeCommands", {}).get("openShort", "") if isinstance(brief.get("safeCommands"), dict) else "",
            "revealShort": brief.get("safeCommands", {}).get("revealShort", "") if isinstance(brief.get("safeCommands"), dict) else "",
            "openContactSheet": f"open '{contact_summary.get('htmlPath', '')}'" if contact_summary.get("htmlPath") else "",
            "openAudioProbe": f"open '{audio_summary.get('htmlPath', '')}'" if audio_summary.get("htmlPath") else "",
            "openWaveform": f"open '{audio_summary.get('waveformPath', '')}'" if audio_summary.get("waveformPath") else "",
            "openTranscriptDraft": f"open '{transcript_summary.get('jsonPath', '')}'" if transcript_summary.get("jsonPath") else "",
            "openCaptionDraft": f"open '{transcript_summary.get('captionDraftSrt', '')}'" if transcript_summary.get("captionDraftSrt") else "",
            "worksheet": f"./script/agentctl.sh studio-shorts-cut-quality-worksheet --short-id '{short_id}'",
            "reviewPacket": f"./script/agentctl.sh studio-shorts-cut-quality-review-packet --short-id '{short_id}' --all",
            "dryRunRefine": brief.get("safeCommands", {}).get("dryRunRefine", "") if isinstance(brief.get("safeCommands"), dict) else "",
            "recordRefine": brief.get("safeCommands", {}).get("recordRefine", "") if isinstance(brief.get("safeCommands"), dict) else "",
        },
        "truth": base_truth,
    }


def render_markdown(payload: dict[str, Any]) -> str:
    short = payload.get("short") if isinstance(payload.get("short"), dict) else {}
    contact = payload.get("contactSheet") if isinstance(payload.get("contactSheet"), dict) else {}
    audio = payload.get("audioProbe") if isinstance(payload.get("audioProbe"), dict) else {}
    transcript = payload.get("transcriptDraft") if isinstance(payload.get("transcriptDraft"), dict) else {}
    commands = payload.get("safeCommands") if isinstance(payload.get("safeCommands"), dict) else {}
    lines = [
        "# Studio next short review evidence packet",
        "",
        payload.get("plainEnglish", ""),
        "",
        f"- Generated: `{payload.get('generatedAt', '')}`",
        f"- Status: `{payload.get('status', '')}`",
        f"- Truth: {payload.get('truth', {}).get('description', '') if isinstance(payload.get('truth'), dict) else ''}",
        "",
    ]
    if payload.get("status") == "studio-next-short-review-evidence-needs-short":
        lines.extend(["## Next safest action", "", payload.get("nextSafestAction", ""), ""])
        return "\n".join(lines)
    lines.extend([
        "## Short",
        "",
        f"- ID: `{short.get('id', '')}`",
        f"- Title: {short.get('humanTitle') or short.get('title', '')}",
        f"- Episode/version: `{short.get('episode', '')}` / `{short.get('version', '')}`",
        f"- File: `{short.get('path', '')}`",
        f"- Duration: `{short.get('durationLabel') or short.get('durationSeconds', '')}`",
        f"- Shape: `{short.get('aspect', '')}` `{short.get('width', '')}x{short.get('height', '')}`",
        "",
        "## Evidence",
        "",
        f"- Contact sheet: `{contact.get('htmlPath', '')}`",
        f"- Frames created: `{contact.get('framesCreated', 0)}` / `{contact.get('framesRequested', 0)}`",
        f"- Audio probe: `{audio.get('htmlPath', '')}`",
        f"- Waveform: `{audio.get('waveformPath', '')}`",
        f"- Silence count: `{audio.get('silenceCount', 0)}`",
        f"- Meaningful pauses: `{audio.get('meaningfulPauseCount', 0)}`",
        f"- Long pauses: `{audio.get('longPauseCount', 0)}`",
        f"- Longest pause: `{audio.get('longestPauseSeconds', 0)}`",
        f"- Mean/max volume dB: `{audio.get('meanVolumeDb')}` / `{audio.get('maxVolumeDb')}`",
        f"- Transcript draft: `{transcript.get('status', 'missing')}` `{transcript.get('jsonPath', '')}`",
        f"- Caption draft: `{transcript.get('captionDraftSrt', '')}`",
        f"- Transcript preview: {transcript.get('textPreview', '')[:280] or 'none'}",
        "",
        "## Audio warnings",
        "",
    ])
    warnings = audio.get("warnings") if isinstance(audio.get("warnings"), list) else []
    if warnings:
        lines.extend(f"- {warning}" for warning in warnings)
    else:
        lines.append("- none from probe")
    lines.extend(["", "## Review order", ""])
    lines.extend(f"{index}. {item}" for index, item in enumerate(payload.get("reviewOrder", []), start=1))
    lines.extend(["", "## Safe commands", ""])
    for key, value in commands.items():
        if value:
            lines.append(f"- {key}: `{value}`")
    lines.append("")
    return "\n".join(lines)


def save_payload(payload: dict[str, Any], output_dir: Path, basename: str | None) -> dict[str, str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    stem = basename or f"{stamp()}-next-short-review-evidence"
    json_path = output_dir / f"{stem}.json"
    markdown_path = output_dir / f"{stem}.md"
    write_json(json_path, payload)
    markdown_path.write_text(render_markdown(payload), encoding="utf-8")
    return {"jsonPath": str(json_path), "markdownPath": str(markdown_path)}


def main() -> int:
    parser = argparse.ArgumentParser(description="Build evidence for the next local Studio short.")
    parser.add_argument("root", nargs="?", default=str(DEFAULT_RELEASE_ROOT))
    parser.add_argument("--batch", default="", help="Path to a shorts-review-batch.json file.")
    parser.add_argument("--refresh-batch", action="store_true")
    parser.add_argument("--limit", type=int, default=12)
    parser.add_argument("--include-warnings", action="store_true")
    parser.add_argument("--frames", type=int, default=8)
    parser.add_argument("--short-id", default="", help="Build evidence for a specific local short instead of the ranked next short.")
    parser.add_argument("--output-dir", default="")
    parser.add_argument("--basename", default="")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--markdown", action="store_true")
    parser.add_argument("--save", action="store_true")
    args = parser.parse_args()

    root = Path(args.root)
    payload = build_payload(
        root=root,
        batch_path=Path(args.batch) if args.batch else None,
        refresh=args.refresh_batch,
        limit=args.limit,
        include_warnings=args.include_warnings,
        frames=args.frames,
        short_id=args.short_id,
    )
    if args.save:
        output_dir = Path(args.output_dir) if args.output_dir else default_output_dir(root)
        paths = save_payload(payload, output_dir=output_dir, basename=args.basename or None)
        print(json.dumps({"status": payload.get("status"), **paths}, indent=2, sort_keys=True))
        return 0
    if args.json and not args.markdown:
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        print(render_markdown(payload))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
