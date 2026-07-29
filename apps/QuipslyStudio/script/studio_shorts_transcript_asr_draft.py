#!/usr/bin/env python3
"""Run a safe ASR draft for one recommended short.

This creates raw provider output and draft transcript/caption sidecars from the
transcript-intake audio sidecar. It deliberately does not write the normalized
reviewed transcript path. ASR output is machine evidence, not spoken-word truth.
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from studio_short_review_ledger_fallback import fallback_transcript_workorder_for_short


DEFAULT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
DEFAULT_WORKBENCH_JSON = (
    DEFAULT_ROOT
    / "shorts-command-room"
    / "transcript-intake"
    / "workbench"
    / "quipsly-studio-shorts-transcript-intake-workbench.json"
)
DEFAULT_RUN_ROOT = DEFAULT_ROOT / "shorts-command-room" / "transcript-intake" / "asr-drafts"
SCHEMA = "quipsly.studio.shorts-transcript-asr-draft.v1"
VERSION = "2026-07-02.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def stamp_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise SystemExit(
            f"Transcript intake workbench not found: {path}\n"
            "Run: script/agentctl.sh studio-shorts-transcript-intake-workbench --all"
        )
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise SystemExit(f"Expected JSON object: {path}")
    return data


def item_from_intake_sidecar(sidecar: dict[str, Any], path: Path) -> dict[str, Any]:
    planned = sidecar.get("plannedTranscriptSidecars")
    planned_sidecars = planned if isinstance(planned, dict) else {}
    audio_path = str(sidecar.get("audioSidecarPath") or "")
    return {
        "shortId": sidecar.get("shortId"),
        "episode": sidecar.get("episode"),
        "version": sidecar.get("episodeVersion") or sidecar.get("version"),
        "title": sidecar.get("title") or sidecar.get("shortId"),
        "status": "ready-for-asr-or-manual-transcript" if sidecar.get("audioSidecarExists") else sidecar.get("status"),
        "audioSidecar": {
            "path": audio_path,
            "exists": bool(sidecar.get("audioSidecarExists")) and Path(audio_path).exists(),
            "sourceIntakePath": str(path),
        },
        "destinations": {
            "rawProviderOutput": {"path": planned_sidecars.get("rawProviderOutput") or ""},
            "captionDraftSrt": {"path": planned_sidecars.get("captionDraftSrt") or ""},
            "captionDraftVtt": {"path": planned_sidecars.get("captionDraftVtt") or ""},
            "normalizedTranscript": {"path": planned_sidecars.get("normalizedTranscriptReviewOnly") or ""},
        },
        "reviewSource": "transcript-intake-sidecar",
        "truth": "ASR target reconstructed from the latest local transcript-intake sidecar. It is machine-evidence routing, not reviewed transcript truth.",
    }


def latest_intake_item_for_short(root: Path, short_id: str) -> dict[str, Any]:
    intake_root = root / "shorts-command-room" / "transcript-intake"
    if not intake_root.exists():
        return {}
    candidates = sorted(
        intake_root.glob(f"*-transcript-intake-batch/{short_id}/{short_id}-transcript-intake.json"),
        key=lambda path: (path.stat().st_mtime, str(path)),
        reverse=True,
    )
    for path in candidates:
        data = read_json(path)
        if str(data.get("shortId") or "") == short_id:
            return item_from_intake_sidecar(data, path)
    return {}


def item_from_fallback_workorder(workorder: dict[str, Any]) -> dict[str, Any]:
    planned = workorder.get("plannedSidecars")
    planned_sidecars = planned if isinstance(planned, dict) else {}
    return {
        "shortId": workorder.get("shortId"),
        "episode": workorder.get("episode"),
        "version": workorder.get("version"),
        "title": workorder.get("title") or workorder.get("shortId"),
        "status": "transcript-intake-needed",
        "audioSidecar": {"path": "", "exists": False},
        "destinations": {
            "rawProviderOutput": {"path": planned_sidecars.get("rawProviderOutput") or ""},
            "captionDraftSrt": {"path": planned_sidecars.get("captionDraftSrt") or ""},
            "captionDraftVtt": {"path": planned_sidecars.get("captionDraftVtt") or ""},
            "normalizedTranscript": {"path": planned_sidecars.get("normalizedTranscriptReviewOnly") or ""},
        },
        "reviewSource": "short-review-ledger-fallback-workorder",
        "truth": "Fallback target created from the local review ledger. Run transcript intake before ASR can execute.",
    }


def fallback_target(root: Path, short_id: str) -> dict[str, Any]:
    intake_item = latest_intake_item_for_short(root, short_id)
    if intake_item:
        return intake_item
    workorder = fallback_transcript_workorder_for_short(root, short_id)
    if workorder:
        return item_from_fallback_workorder(workorder)
    return {}


def first_target(items: list[dict[str, Any]], short_id: str, root: Path) -> dict[str, Any]:
    if short_id:
        selected = next((item for item in items if str(item.get("shortId") or "") == short_id), None)
        if selected:
            return selected
        fallback = fallback_target(root, short_id)
        if fallback:
            return fallback
        raise SystemExit(
            f"Short id not found in transcript intake workbench, latest intake sidecars, or review ledger: {short_id}"
        )
    ready = [
        item
        for item in items
        if item.get("audioSidecar", {}).get("exists")
        and str(item.get("status") or "") == "ready-for-asr-or-manual-transcript"
        and not item.get("destinations", {}).get("normalizedTranscript", {}).get("exists")
    ]
    if ready:
        return sorted(ready, key=lambda item: (int(item.get("episode") or 999), str(item.get("shortId") or "")))[0]
    if items:
        return sorted(items, key=lambda item: (int(item.get("episode") or 999), str(item.get("shortId") or "")))[0]
    raise SystemExit("Transcript intake workbench has no items.")


def destination_path(item: dict[str, Any], key: str) -> Path:
    destinations = item.get("destinations") if isinstance(item.get("destinations"), dict) else {}
    status = destinations.get(key) if isinstance(destinations.get(key), dict) else {}
    return Path(str(status.get("path") or ""))


def draft_transcript_path(item: dict[str, Any]) -> Path:
    normalized = destination_path(item, "normalizedTranscript")
    short_id = str(item.get("shortId") or "unknown-short")
    if normalized:
        return normalized.with_name(f"{short_id}-asr-draft-transcript.json")
    return DEFAULT_RUN_ROOT / short_id / f"{short_id}-asr-draft-transcript.json"


def provider_command(whisper_bin: str, audio_path: Path, run_dir: Path, model: str, language: str, word_timestamps: bool) -> list[str]:
    command = [
        whisper_bin,
        str(audio_path),
        "--model",
        model,
        "--output_dir",
        str(run_dir),
        "--output_format",
        "all",
        "--verbose",
        "False",
        "--condition_on_previous_text",
        "False",
    ]
    if language:
        command.extend(["--language", language])
    if word_timestamps:
        command.extend(["--word_timestamps", "True"])
    return command


def provider_outputs(run_dir: Path, audio_path: Path) -> dict[str, Path]:
    stem = audio_path.stem
    return {
        "json": run_dir / f"{stem}.json",
        "txt": run_dir / f"{stem}.txt",
        "srt": run_dir / f"{stem}.srt",
        "vtt": run_dir / f"{stem}.vtt",
        "tsv": run_dir / f"{stem}.tsv",
    }


def count_words(text: str) -> int:
    return len([word for word in text.replace("\n", " ").split(" ") if word.strip()])


def build_draft(provider_json: dict[str, Any], item: dict[str, Any], raw_path: Path, model: str, language: str) -> dict[str, Any]:
    segments = provider_json.get("segments") if isinstance(provider_json.get("segments"), list) else []
    text = str(provider_json.get("text") or "").strip()
    normalized_segments = []
    for segment in segments:
        if not isinstance(segment, dict):
            continue
        normalized_segments.append(
            {
                "start": segment.get("start"),
                "end": segment.get("end"),
                "text": segment.get("text"),
                "words": segment.get("words") if isinstance(segment.get("words"), list) else [],
                "reviewStatus": "machine-draft-needs-review",
            }
        )
    return {
        "schema": "quipsly.studio.short-transcript-draft.v1",
        "generatedAt": iso_now(),
        "shortId": item.get("shortId"),
        "episode": item.get("episode"),
        "title": item.get("title"),
        "status": "asr-draft-needs-human-review",
        "provider": "openai-whisper-cli-local",
        "model": model,
        "language": language or provider_json.get("language") or "auto",
        "sourceAudioSidecar": item.get("audioSidecar", {}).get("path"),
        "rawProviderOutput": str(raw_path),
        "text": text,
        "wordCountApprox": count_words(text),
        "segments": normalized_segments,
        "reviewChecklist": [
            "Listen against the short before trusting these words.",
            "Correct obvious ASR errors and speaker meaning before using captions for edit decisions.",
            "Check caption timing and placement against faces, microphones, hands, and important motion.",
            "Promote to normalized transcript only after review.",
        ],
        "truth": "ASR draft only. It is not reviewed transcript truth, caption approval, edit approval, publication, upload, schedule, source mutation, or receipt truth.",
    }


def copy_if_safe(src: Path, dest: Path, force: bool) -> bool:
    if not src.exists():
        return False
    if dest.exists() and not force:
        return False
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dest)
    return True


def build_plan(item: dict[str, Any], run_dir: Path, model: str, language: str, whisper_bin: str, force: bool) -> dict[str, Any]:
    short_id = str(item.get("shortId") or "unknown-short")
    audio_path = Path(str(item.get("audioSidecar", {}).get("path") or ""))
    raw_path = destination_path(item, "rawProviderOutput")
    srt_path = destination_path(item, "captionDraftSrt")
    vtt_path = destination_path(item, "captionDraftVtt")
    normalized_path = destination_path(item, "normalizedTranscript")
    draft_path = draft_transcript_path(item)
    command = provider_command(whisper_bin, audio_path, run_dir, model, language, True)
    blockers = []
    if not audio_path.exists():
        blockers.append(f"Audio sidecar missing: {audio_path}")
    if not shutil.which(whisper_bin):
        blockers.append(f"Whisper CLI not found: {whisper_bin}")
    existing = [path for path in [raw_path, srt_path, vtt_path, draft_path] if path.exists()]
    if existing and not force:
        blockers.append("Draft output already exists. Use --force to overwrite draft sidecars, or choose another short.")
    return {
        "shortId": short_id,
        "episode": item.get("episode"),
        "status": "blocked" if blockers else "ready-to-run",
        "blockers": blockers,
        "audioSidecarPath": str(audio_path),
        "runDir": str(run_dir),
        "command": command,
        "commandString": " ".join(shell_quote(part) for part in command),
        "destinations": {
            "rawProviderOutput": str(raw_path),
            "asrDraftTranscript": str(draft_path),
            "captionDraftSrt": str(srt_path),
            "captionDraftVtt": str(vtt_path),
            "normalizedTranscriptReviewOnly": str(normalized_path),
        },
        "reviewSource": item.get("reviewSource") or "transcript-intake-workbench",
        "truth": "ASR draft plan only. Running it creates machine evidence, not reviewed transcript truth.",
    }


def run_asr(plan: dict[str, Any], item: dict[str, Any], model: str, language: str, force: bool) -> dict[str, Any]:
    if plan.get("blockers"):
        return {**plan, "status": "blocked"}
    run_dir = Path(str(plan["runDir"]))
    run_dir.mkdir(parents=True, exist_ok=True)
    started_at = iso_now()
    proc = subprocess.run(plan["command"], text=True, capture_output=True)
    completed_at = iso_now()
    audio_path = Path(str(plan["audioSidecarPath"]))
    outputs = provider_outputs(run_dir, audio_path)
    raw_path = Path(str(plan["destinations"]["rawProviderOutput"]))
    draft_path = Path(str(plan["destinations"]["asrDraftTranscript"]))
    srt_path = Path(str(plan["destinations"]["captionDraftSrt"]))
    vtt_path = Path(str(plan["destinations"]["captionDraftVtt"]))
    copied = {
        "rawProviderOutput": False,
        "asrDraftTranscript": False,
        "captionDraftSrt": False,
        "captionDraftVtt": False,
    }
    provider_json: dict[str, Any] = {}
    if proc.returncode == 0 and outputs["json"].exists():
        provider_json = read_json(outputs["json"])
        copied["rawProviderOutput"] = copy_if_safe(outputs["json"], raw_path, force)
        draft = build_draft(provider_json, item, raw_path, model, language)
        if not draft_path.exists() or force:
            draft_path.parent.mkdir(parents=True, exist_ok=True)
            draft_path.write_text(json.dumps(draft, indent=2, sort_keys=True) + "\n", encoding="utf-8")
            copied["asrDraftTranscript"] = True
        copied["captionDraftSrt"] = copy_if_safe(outputs["srt"], srt_path, force)
        copied["captionDraftVtt"] = copy_if_safe(outputs["vtt"], vtt_path, force)
    manifest = {
        "schema": SCHEMA,
        "version": VERSION,
        "generatedAt": iso_now(),
        "startedAt": started_at,
        "completedAt": completed_at,
        "shortId": item.get("shortId"),
        "episode": item.get("episode"),
        "status": "asr-draft-created" if proc.returncode == 0 and copied["rawProviderOutput"] else "asr-failed",
        "returncode": proc.returncode,
        "stdoutTail": proc.stdout[-4000:],
        "stderrTail": proc.stderr[-4000:],
        "runDir": str(run_dir),
        "providerOutputs": {key: str(path) for key, path in outputs.items()},
        "copied": copied,
        "destinations": plan["destinations"],
        "wordCountApprox": count_words(str(provider_json.get("text") or "")),
        "segmentCount": len(provider_json.get("segments") if isinstance(provider_json.get("segments"), list) else []),
        "truth": "ASR run manifest only. Raw/draft outputs are machine evidence and still require review before they become transcript truth.",
    }
    manifest_path = run_dir / "quipsly-studio-shorts-transcript-asr-draft-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return {**manifest, "manifestPath": str(manifest_path)}


def render_markdown(payload: dict[str, Any]) -> str:
    lines = [
        "# Studio shorts ASR draft",
        "",
        f"Short: `{payload.get('shortId')}`",
        f"Episode: `Episode {payload.get('episode')}`",
        f"Status: `{payload.get('status')}`",
        "",
    ]
    if payload.get("blockers"):
        lines.extend(["## Blockers", ""])
        for blocker in payload.get("blockers", []):
            lines.append(f"- {blocker}")
        lines.append("")
    if payload.get("commandString"):
        lines.extend(["## Provider command", "", f"`{payload.get('commandString')}`", ""])
    destinations = payload.get("destinations") if isinstance(payload.get("destinations"), dict) else {}
    if destinations:
        lines.extend(["## Destinations", ""])
        for key, path in destinations.items():
            lines.append(f"- {key}: `{path}`")
        lines.append("")
    if payload.get("manifestPath"):
        lines.append(f"Manifest: `{payload.get('manifestPath')}`")
        lines.append("")
    lines.extend(["## Truth boundary", "", str(payload.get("truth") or "")])
    return "\n".join(lines).rstrip() + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Run or plan a safe ASR draft for one recommended short.")
    parser.add_argument("--workbench", default=str(DEFAULT_WORKBENCH_JSON), help="Transcript intake workbench JSON.")
    parser.add_argument("--short-id", default="", help="Specific short id. Defaults to next audio-ready short.")
    parser.add_argument("--run-root", default=str(DEFAULT_RUN_ROOT), help="ASR draft run root.")
    parser.add_argument("--model", default="base", help="Whisper model to use.")
    parser.add_argument("--language", default="en", help="Whisper language hint.")
    parser.add_argument("--whisper-bin", default="whisper", help="Whisper CLI executable.")
    parser.add_argument("--run-asr", action="store_true", help="Actually run ASR. Without this, only prints the safe plan.")
    parser.add_argument("--force", action="store_true", help="Allow overwriting draft sidecars. Never overwrites source media.")
    parser.add_argument("--format", choices=["markdown", "json"], default="markdown")
    parser.add_argument("--markdown", dest="format", action="store_const", const="markdown")
    parser.add_argument("--json", dest="format", action="store_const", const="json")
    args = parser.parse_args()

    workbench = read_json(Path(args.workbench).expanduser())
    items = [item for item in workbench.get("items", []) if isinstance(item, dict)]
    item = first_target(items, args.short_id, DEFAULT_ROOT)
    short_id = str(item.get("shortId") or "unknown-short")
    run_dir = Path(args.run_root).expanduser() / f"{stamp_now()}-{short_id}-{args.model}"
    plan = build_plan(item, run_dir, args.model, args.language, args.whisper_bin, args.force)
    payload = run_asr(plan, item, args.model, args.language, args.force) if args.run_asr else plan
    if args.format == "json":
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        print(render_markdown(payload), end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
