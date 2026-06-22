#!/usr/bin/env python3
"""Prepare or verify QuipslyStudio episode transcript/script spines.

This script exists for the dogfood loop, not for publishing automation theater.
It keeps three truths separate:

1. A source session exists.
2. A word-timed transcript sidecar exists.
3. A prepared Quipsly session actually exposes that transcript through /state.

Default mode is report-only. Use --apply to create missing prepared sessions.
Use --refresh with --apply when you intentionally want to rebuild them.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any


ROOT_DIR = Path(__file__).resolve().parents[1]
AGENTCTL = ROOT_DIR / "script" / "agentctl.sh"
LOCAL_TRANSCRIBER = ROOT_DIR / "script" / "local_transcript_provider.py"
TRANSCRIPT_DIR = (ROOT_DIR / "../../artifacts/transcripts/youtube-captions/yt-dlp").resolve()
LOCAL_ASR_DIR = (ROOT_DIR / "../../artifacts/transcripts/local-asr").resolve()


@dataclass(frozen=True)
class EpisodeScriptSpec:
    key: str
    label: str
    url: str
    source_session: str
    prepared_session: str
    transcript_path: Path
    transcript_format: str
    notes: str


EPISODES: tuple[EpisodeScriptSpec, ...] = (
    EpisodeScriptSpec(
        key="episode-1",
        label="Episode 1 - The Wednesday Rule",
        url="https://www.youtube.com/watch?v=96LN__TA-T8",
        source_session="episode-1-codex-real-edit-v1",
        prepared_session="episode-1-codex-real-edit-v1-youtube-wordtimed",
        transcript_path=TRANSCRIPT_DIR / "episode-1.en.vtt",
        transcript_format="vtt",
        notes="Known-good proof lane with YouTube auto-caption word timing.",
    ),
    EpisodeScriptSpec(
        key="episode-2",
        label="Episode 2",
        url="https://www.youtube.com/watch?v=7Rn4rV2cLy4",
        source_session="episode-2-codex-overlap-review-v3",
        prepared_session="episode-2-codex-overlap-review-v3-wordtimed",
        transcript_path=LOCAL_ASR_DIR / "episode-2-codex-overlap-review-v3.whisper-cpp.srt",
        transcript_format="srt",
        notes="YouTube did not expose usable captions; local whisper.cpp SRT is the current draft script spine.",
    ),
    EpisodeScriptSpec(
        key="episode-3",
        label="Episode 3",
        url="https://www.youtube.com/watch?v=rf3L1xki_Nk",
        source_session="episode-3-premiere-rescue",
        prepared_session="episode-3-premiere-rescue-youtube-wordtimed",
        transcript_path=TRANSCRIPT_DIR / "episode-3.en.vtt",
        transcript_format="vtt",
        notes="YouTube auto-caption word timing exists; useful transfer-test lane.",
    ),
)


def run_agent(*args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(
        [str(AGENTCTL), *args],
        cwd=str(ROOT_DIR),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if check and result.returncode != 0:
        raise RuntimeError(
            f"agentctl {' '.join(args)} failed with {result.returncode}\n"
            f"stdout:\n{result.stdout}\nstderr:\n{result.stderr}"
        )
    return result


def agent_json(*args: str) -> dict[str, Any]:
    result = run_agent(*args)
    return json.loads(result.stdout)


def wait_for_processed(target_serial: int, timeout_seconds: float = 15.0) -> dict[str, Any]:
    deadline = time.time() + timeout_seconds
    latest: dict[str, Any] = {}
    while time.time() <= deadline:
        latest = agent_json("state")
        processed = int(latest.get("agentLastProcessedCommandSerial") or 0)
        if processed >= target_serial:
            return latest
        time.sleep(0.25)
    return latest


def command_and_wait(*args: str, timeout_seconds: float = 15.0) -> dict[str, Any]:
    before = agent_json("state")
    target_serial = int(before.get("agentCommandSerial") or 0) + 1
    run_agent(*args)
    return wait_for_processed(target_serial, timeout_seconds=timeout_seconds)


def session_names() -> set[str]:
    payload = agent_json("sessions")
    return {str(item.get("name")) for item in payload.get("sessions", [])}


def fetch_vtt(spec: EpisodeScriptSpec) -> dict[str, Any]:
    if spec.transcript_format.lower() != "vtt":
        return {
            "skipped": True,
            "reason": f"{spec.key} expects {spec.transcript_format}, not a YouTube VTT sidecar.",
            "transcriptPath": str(spec.transcript_path),
        }

    spec.transcript_path.parent.mkdir(parents=True, exist_ok=True)
    output_pattern = str(spec.transcript_path.parent / f"{spec.key}.%(ext)s")
    command = [
        sys.executable,
        "-m",
        "yt_dlp",
        "--skip-download",
        "--write-auto-subs",
        "--sub-lang",
        "en",
        "--sub-format",
        "vtt",
        "--output",
        output_pattern,
        spec.url,
    ]
    result = subprocess.run(command, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    return {
        "command": command,
        "returnCode": result.returncode,
        "stdoutTail": result.stdout[-2000:],
        "stderrTail": result.stderr[-2000:],
        "transcriptExistsAfterFetch": spec.transcript_path.exists(),
        "transcriptPath": str(spec.transcript_path),
    }


def local_transcriber_doctor() -> dict[str, Any]:
    if not LOCAL_TRANSCRIBER.exists():
        return {
            "path": str(LOCAL_TRANSCRIBER),
            "exists": False,
            "available": False,
            "nextAction": "Restore script/local_transcript_provider.py or pass a different command to transcript-generate.",
        }

    result = subprocess.run(
        [str(LOCAL_TRANSCRIBER), "--doctor"],
        cwd=str(ROOT_DIR),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    payload: dict[str, Any] = {
        "path": str(LOCAL_TRANSCRIBER),
        "exists": True,
        "executable": result.returncode == 0,
        "returnCode": result.returncode,
    }
    if result.stdout.strip():
        try:
            payload.update(json.loads(result.stdout))
        except json.JSONDecodeError:
            payload["stdoutTail"] = result.stdout[-2000:]
    if result.stderr.strip():
        payload["stderrTail"] = result.stderr[-2000:]

    payload["available"] = bool(
        payload.get("executable")
        and (
            payload.get("pythonWhisperAvailable")
            or payload.get("mlxWhisperAvailable")
            or payload.get("whisperCliPath")
            or (payload.get("whisperCppCliPath") and payload.get("whisperCppModelExists"))
        )
    )
    payload["sidecarFallbackAvailable"] = True
    payload["usage"] = (
        "script/agentctl.sh transcript-generate-selected "
        "script/local_transcript_provider.py"
    )
    return payload


def validate_loaded_session(spec: EpisodeScriptSpec) -> dict[str, Any]:
    command_and_wait("load-session", spec.prepared_session, timeout_seconds=20)
    command_and_wait("left-workbench", "transcript", timeout_seconds=8)
    command_and_wait("transcript-select", "first", timeout_seconds=8)
    state = command_and_wait("transcript-word", "current", timeout_seconds=8)
    readiness = state.get("transcriptTimingReadiness") or {}
    current_word = state.get("currentTranscriptWord") or {}
    script_cursor = state.get("scriptCursor") or {}
    return {
        "loadedSession": state.get("activeSessionName"),
        "sequenceTitle": state.get("sequenceTitle"),
        "leftWorkbenchMode": state.get("leftWorkbenchMode"),
        "transcriptSegmentCount": state.get("transcriptSegmentCount"),
        "timingStatus": readiness.get("status"),
        "wordCount": readiness.get("wordCount"),
        "wordLevelCount": readiness.get("wordLevelCount"),
        "estimatedCount": readiness.get("estimatedCount"),
        "demoCount": readiness.get("demoCount"),
        "publicationCaptionReady": readiness.get("publicationCaptionReady"),
        "currentWord": current_word.get("word"),
        "currentWordTimingModel": current_word.get("timingModel"),
        "currentSpeakerDisplay": current_word.get("speakerDisplay"),
        "currentSpeakerSource": current_word.get("speakerSource"),
        "scriptCursorStatus": script_cursor.get("status"),
        "sharedPlayheadPassing": (state.get("sharedPlayheadContract") or {}).get("passing"),
        "truth": "Prepared script-spine proof is based on live /state after loading the session and opening Script workbench.",
    }


def prepare_session(spec: EpisodeScriptSpec) -> dict[str, Any]:
    command_and_wait("load-session", spec.source_session, timeout_seconds=20)
    command_and_wait("transcript-import", str(spec.transcript_path), spec.transcript_format, timeout_seconds=20)
    command_and_wait("left-workbench", "transcript", timeout_seconds=8)
    command_and_wait("transcript-select", "first", timeout_seconds=8)
    state = command_and_wait("transcript-word", "current", timeout_seconds=8)
    run_agent("save-session", spec.prepared_session)
    readiness = state.get("transcriptTimingReadiness") or {}
    return {
        "sourceSessionLoaded": spec.source_session,
        "preparedSessionSaved": spec.prepared_session,
        "transcriptSegmentCount": state.get("transcriptSegmentCount"),
        "timingStatus": readiness.get("status"),
        "wordLevelCount": readiness.get("wordLevelCount"),
        "estimatedCount": readiness.get("estimatedCount"),
        "demoCount": readiness.get("demoCount"),
        "truth": "This creates or refreshes a prepared session by importing a sidecar transcript into Quipsly metadata. It does not cut source media.",
    }


def build_report(args: argparse.Namespace) -> dict[str, Any]:
    names = session_names()
    episodes: list[dict[str, Any]] = []
    transcriber = local_transcriber_doctor()

    for spec in EPISODES:
        source_exists = spec.source_session in names
        prepared_exists = spec.prepared_session in names
        transcript_exists = spec.transcript_path.exists() and spec.transcript_path.stat().st_size > 0
        item: dict[str, Any] = {
            "episode": spec.key,
            "label": spec.label,
            "sourceSession": spec.source_session,
            "sourceSessionExists": source_exists,
            "preparedSession": spec.prepared_session,
            "preparedSessionExistsBeforeRun": prepared_exists,
            "transcriptPath": str(spec.transcript_path),
            "transcriptFormat": spec.transcript_format,
            "transcriptExists": transcript_exists,
            "notes": spec.notes,
            "status": "unchecked",
        }

        if args.fetch and not transcript_exists:
            item["fetchAttempt"] = fetch_vtt(spec)
            transcript_exists = spec.transcript_path.exists() and spec.transcript_path.stat().st_size > 0
            item["transcriptExists"] = transcript_exists

        if not source_exists:
            item["status"] = "missing_source_session"
            item["nextAction"] = "Recover or recreate the source session before transcript prep."
        elif not transcript_exists:
            item["status"] = "needs_transcript_sidecar_or_asr"
            item["nextAction"] = (
                "Generate local ASR with script/local_transcript_provider.py, "
                "import a reviewed SRT/VTT, or run with --fetch if captions become available."
            )
            item["localTranscriberCommand"] = str(LOCAL_TRANSCRIBER)
            item["localTranscriberAvailable"] = transcriber.get("available", False)
        elif args.apply and (args.refresh or not prepared_exists):
            item["status"] = "prepared"
            item["prepareProof"] = prepare_session(spec)
            item["validation"] = validate_loaded_session(spec)
        elif prepared_exists:
            item["status"] = "prepared_session_exists"
            if args.validate_prepared:
                item["validation"] = validate_loaded_session(spec)
            else:
                item["validationSkipped"] = (
                    "Prepared session exists. Use --validate-prepared when you need live /state proof; "
                    "default report mode avoids loading every large episode session."
                )
        else:
            item["status"] = "ready_to_prepare"
            item["nextAction"] = "Run this script with --apply to import the transcript sidecar and save the prepared session."

        episodes.append(item)

    return {
        "packetType": "quipslystudio-episode-script-spine-readiness",
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "apply": bool(args.apply),
        "refresh": bool(args.refresh),
        "fetch": bool(args.fetch),
        "validatePrepared": bool(args.validate_prepared),
        "localTranscriber": transcriber,
        "episodes": episodes,
        "gospel": [
            "Script spines are timed metadata over the one episode timeline.",
            "Prepared sessions must be proved through live /state, not assumed from file presence.",
            "Transcript timing readiness is transparency-only; it is not a creative quality gate.",
        ],
        "nextDogfoodLoop": "Use Episode 1 as the known-good script-aware editing lane, Episode 2 as the ASR/messy stress lane, Episode 3 as the transfer-test lane, then return to Episode 1 for a second Codex pass.",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Prepare or verify QuipslyStudio episode script spines.")
    parser.add_argument("--apply", action="store_true", help="Create missing prepared sessions from available VTT sidecars.")
    parser.add_argument("--refresh", action="store_true", help="With --apply, rebuild prepared sessions even if they already exist.")
    parser.add_argument("--fetch", action="store_true", help="Try yt-dlp auto-caption fetch for missing VTT sidecars.")
    parser.add_argument("--validate-prepared", action="store_true", help="Load existing prepared sessions and verify Script workbench state through live /state. Slower on dense sessions.")
    parser.add_argument("--output", help="Optional path to write the JSON report.")
    args = parser.parse_args()

    if args.refresh and not args.apply:
        parser.error("--refresh requires --apply")

    report = build_report(args)
    text = json.dumps(report, indent=2, sort_keys=True)
    if args.output:
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(text + "\n", encoding="utf-8")
    print(text)

    failed = any(
        item.get("status") in {"missing_source_session"}
        for item in report["episodes"]
    )
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
