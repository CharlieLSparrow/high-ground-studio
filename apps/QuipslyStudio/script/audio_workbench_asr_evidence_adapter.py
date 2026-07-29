#!/usr/bin/env python3
"""Create optional ASR evidence for Episode audio transcript/source agreement.

This adapter is deliberately separate from the transcript/source agreement audit.
It may run local Whisper on short proof windows when asked, but it never approves
an audio spine, unlocks branches, renders final episodes, uploads, publishes, or
mutates original/source media. If ASR is not run, it still writes a useful
preflight that makes the next command and missing evidence explicit.
"""

from __future__ import annotations

import argparse
import html
import json
import os
import shlex
import shutil
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

AUDIO_EXTENSIONS = {".wav", ".m4a", ".mp3", ".aac", ".flac"}
SELF_TOKEN = "audio-asr-evidence-adapter"


@dataclass
class AsrTarget:
    target_id: str
    role: str
    path: Path
    duration_seconds: float | None
    reason: str


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def resolve_baseline_dir(input_path: Path) -> Path:
    expanded = input_path.expanduser()
    if (expanded / "manifest.json").exists():
        return expanded.resolve()
    nested = expanded / "work" / "conformed-production-baseline"
    if (nested / "manifest.json").exists():
        return nested.resolve()
    raise FileNotFoundError(f"Could not find manifest.json under {input_path}")


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def output_path(value: Any) -> Path | None:
    if isinstance(value, str) and value:
        return Path(value)
    if isinstance(value, dict):
        for key in ("path", "jsonPath", "markdownPath", "htmlPath", "openCommand", "versionedPath"):
            subvalue = value.get(key)
            if isinstance(subvalue, str) and subvalue:
                return Path(subvalue)
    return None


def ffprobe_duration(path: Path) -> float | None:
    try:
        proc = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(path),
            ],
            text=True,
            capture_output=True,
            check=False,
        )
        if proc.returncode != 0:
            return None
        return round(float(proc.stdout.strip()), 3)
    except Exception:
        return None


def existing_audio(path: Any) -> Path | None:
    if not isinstance(path, str) or not path:
        return None
    p = Path(path)
    if p.exists() and p.suffix.lower() in AUDIO_EXTENSIONS and SELF_TOKEN not in str(p).lower():
        return p
    return None


def add_target(targets: list[AsrTarget], seen: set[str], target_id: str, role: str, path: Path | None, reason: str) -> None:
    if not path or not path.exists():
        return
    resolved = str(path.resolve())
    if resolved in seen:
        return
    seen.add(resolved)
    targets.append(
        AsrTarget(
            target_id=safe_slug(target_id),
            role=role,
            path=path.resolve(),
            duration_seconds=ffprobe_duration(path),
            reason=reason,
        )
    )


def discover_targets(baseline_dir: Path, manifest: dict[str, Any], max_targets: int) -> list[AsrTarget]:
    outputs = manifest.get("outputs") or {}
    targets: list[AsrTarget] = []
    seen: set[str] = set()

    add_target(
        targets,
        seen,
        "v006-mastered-spine-wav",
        "mastered-spine",
        existing_audio(manifest.get("audioMorningPublicationReadinessRecommendedAudioFile")),
        "morning listen candidate WAV",
    )
    add_target(
        targets,
        seen,
        "v006-mastered-spine-m4a",
        "mastered-spine-listening-copy",
        existing_audio(manifest.get("audioMorningPublicationReadinessRecommendedListeningFile")),
        "morning listening M4A",
    )
    add_target(
        targets,
        seen,
        "v006-source-aware-mix",
        "source-aware-mix",
        existing_audio(outputs.get("sourceAwareMix")),
        "source-aware mix registered in manifest",
    )

    source_baseline = Path(str(manifest.get("sourceBaselineDir") or baseline_dir))
    proof_dirs = [source_baseline / "proof-snippets", baseline_dir]
    proof_names = [
        ("conformed-master-spine", "master-proof-window"),
        ("source-aware-contribution-mix", "source-aware-proof-window"),
        ("raw-aligned-proof", "raw-aligned-proof-window"),
        ("speaker-split-charlie-left-homer-right", "speaker-split-proof-window"),
    ]
    for proof_dir in proof_dirs:
        if not proof_dir.exists():
            continue
        for token, role in proof_names:
            for path in sorted(proof_dir.glob(f"**/*{token}*")):
                if path.is_file() and path.suffix.lower() in AUDIO_EXTENSIONS:
                    add_target(targets, seen, f"{role}-{path.stem}", role, path, f"proof-window audio containing {token}")
                    if len(targets) >= max_targets:
                        return targets

    for key, value in sorted(outputs.items()):
        if len(targets) >= max_targets:
            break
        lower_key = key.lower()
        if not any(token in lower_key for token in ("snippet", "reel", "proof", "window")):
            continue
        path = output_path(value)
        if path and path.exists() and path.suffix.lower() in AUDIO_EXTENSIONS:
            add_target(targets, seen, f"manifest-{key}", "manifest-review-audio", path, f"manifest output {key}")
    return targets[:max_targets]


def run_whisper(target: AsrTarget, output_dir: Path, model: str, language: str, word_timestamps: bool) -> dict[str, Any]:
    target_out = output_dir / target.target_id
    target_out.mkdir(parents=True, exist_ok=True)
    command = [
        "whisper",
        str(target.path),
        "--model",
        model,
        "--language",
        language,
        "--output_dir",
        str(target_out),
        "--output_format",
        "json",
        "--verbose",
        "False",
        "--fp16",
        "False",
    ]
    if word_timestamps:
        command.extend(["--word_timestamps", "True"])
    started = iso_now()
    proc = subprocess.run(command, text=True, capture_output=True, check=False)
    finished = iso_now()
    json_files = sorted(target_out.glob("*.json"))
    transcript_json = json_files[0] if json_files else None
    segment_count = 0
    word_count = 0
    text_chars = 0
    if transcript_json and transcript_json.exists():
        try:
            payload = read_json(transcript_json)
            segments = payload.get("segments") if isinstance(payload.get("segments"), list) else []
            segment_count = len(segments)
            text_chars = len(str(payload.get("text") or ""))
            for segment in segments:
                if isinstance(segment, dict):
                    words = segment.get("words")
                    if isinstance(words, list):
                        word_count += len(words)
                    else:
                        word_count += len(str(segment.get("text") or "").split())
        except Exception:
            pass
    return {
        "targetId": target.target_id,
        "role": target.role,
        "sourcePath": str(target.path),
        "durationSeconds": target.duration_seconds,
        "reason": target.reason,
        "startedAt": started,
        "finishedAt": finished,
        "exitCode": proc.returncode,
        "ok": proc.returncode == 0 and bool(transcript_json and transcript_json.exists()),
        "transcriptJson": str(transcript_json) if transcript_json else None,
        "segmentCount": segment_count,
        "wordCount": word_count,
        "textCharCount": text_chars,
        "stdoutTail": proc.stdout[-1600:],
        "stderrTail": proc.stderr[-1600:],
        "command": command,
    }


def target_row(target: AsrTarget) -> dict[str, Any]:
    return {
        "targetId": target.target_id,
        "role": target.role,
        "sourcePath": str(target.path),
        "durationSeconds": target.duration_seconds,
        "reason": target.reason,
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# ASR Evidence Adapter",
        "",
        f"Generated: `{report['generatedAt']}`",
        f"Status: `{report['status']}`",
        f"Whisper available: `{str(report['whisperAvailable']).lower()}`",
        f"ASR attempted: `{str(report['asrAttempted']).lower()}`",
        f"Targets discovered: `{report['targetCount']}`",
        f"Transcripts generated: `{report['transcriptGeneratedCount']}`",
        f"Failed transcripts: `{report['transcriptFailureCount']}`",
        "",
        "This adapter produces optional semantic evidence. It does not approve audio, unlock branch rendering, render final episodes, upload, publish, or mutate source media.",
        "",
        "## Targets",
        "",
        "| Target | Role | Duration | Reason | Path |",
        "|---|---|---:|---|---|",
    ]
    for target in report["targets"]:
        lines.append(
            f"| `{target['targetId']}` | `{target['role']}` | `{target.get('durationSeconds')}` | {target['reason']} | `{target['sourcePath']}` |"
        )
    lines.extend(["", "## Results", ""])
    if report["asrResults"]:
        lines.extend(["| Target | OK | Segments | Words | Transcript |", "|---|---:|---:|---:|---|"])
        for result in report["asrResults"]:
            lines.append(
                f"| `{result['targetId']}` | `{str(result['ok']).lower()}` | `{result['segmentCount']}` | `{result['wordCount']}` | `{result.get('transcriptJson')}` |"
            )
    else:
        lines.append("- No ASR was run in this pass. Use the generated command after confirming runtime budget.")
    lines.extend(["", "## Next command", "", f"```bash\n{report['suggestedCommand']}\n```", ""])
    return "\n".join(lines)


def render_html(report: dict[str, Any], markdown_path: Path) -> str:
    rows = "\n".join(
        f"<tr><td><code>{html.escape(t['targetId'])}</code></td><td>{html.escape(t['role'])}</td><td>{html.escape(str(t.get('durationSeconds')))}</td><td>{html.escape(t['reason'])}</td></tr>"
        for t in report["targets"]
    )
    results = "\n".join(
        f"<tr><td><code>{html.escape(r['targetId'])}</code></td><td>{html.escape(str(r['ok']))}</td><td>{r['segmentCount']}</td><td>{r['wordCount']}</td><td><code>{html.escape(str(r.get('transcriptJson')))}</code></td></tr>"
        for r in report["asrResults"]
    ) or "<tr><td colspan='5'>No ASR run yet.</td></tr>"
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>ASR Evidence Adapter</title>
<style>
body {{ font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif; background: #f4efe2; color: #2a241b; margin: 32px; }}
main {{ max-width: 1100px; margin: auto; background: #fff9ed; border: 1px solid #dcc8a3; border-radius: 22px; padding: 28px; box-shadow: 0 18px 54px rgba(64,42,18,.12); }}
table {{ width: 100%; border-collapse: collapse; margin: 18px 0; }}
th, td {{ border-bottom: 1px solid #e3d5bd; padding: 8px; text-align: left; vertical-align: top; }}
.pill {{ display: inline-block; padding: 7px 11px; border-radius: 999px; background: #173f35; color: #f7e7bb; font-weight: 700; margin-right: 6px; }}
code {{ background: #eee1c9; padding: 2px 5px; border-radius: 6px; }}
</style>
</head>
<body><main>
<p><span class="pill">{html.escape(report['status'])}</span><span class="pill">Whisper {html.escape(str(report['whisperAvailable']).lower())}</span></p>
<h1>ASR Evidence Adapter</h1>
<p>Optional transcript evidence for source/master agreement. No approval, branch unlock, final render, upload, publication, or source mutation.</p>
<h2>Targets</h2><table><tr><th>Target</th><th>Role</th><th>Duration</th><th>Reason</th></tr>{rows}</table>
<h2>Results</h2><table><tr><th>Target</th><th>OK</th><th>Segments</th><th>Words</th><th>Transcript</th></tr>{results}</table>
<h2>Next command</h2><pre>{html.escape(report['suggestedCommand'])}</pre>
<p><a href="{html.escape(markdown_path.name)}">Open Markdown companion</a></p>
</main></body></html>"""


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    parser.add_argument("--run-asr", action="store_true", help="Run local Whisper for selected proof targets.")
    parser.add_argument("--max-targets", type=int, default=8)
    parser.add_argument("--model", default="tiny.en")
    parser.add_argument("--language", default="English")
    parser.add_argument("--word-timestamps", action="store_true")
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest_before = read_json(manifest_path)
    outputs_before = manifest_before.get("outputs") or {}
    baseline_id = str(manifest_before.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = stamp()

    work_dir = baseline_dir / f"audio-asr-evidence-adapter-{slug}-{generated_at}"
    work_dir.mkdir(parents=True, exist_ok=True)
    json_path = work_dir / "audio-asr-evidence-adapter.json"
    markdown_path = work_dir / "audio-asr-evidence-adapter.md"
    html_path = work_dir / "audio-asr-evidence-adapter.html"
    open_command = work_dir / "OPEN_AUDIO_ASR_EVIDENCE_ADAPTER.command"
    run_command = work_dir / "RUN_AUDIO_ASR_EVIDENCE_ADAPTER.command"
    transcript_dir = work_dir / "transcripts"

    whisper_path = shutil.which("whisper")
    targets = discover_targets(baseline_dir, manifest_before, max(1, args.max_targets))
    asr_results: list[dict[str, Any]] = []
    reused_existing_count = 0
    asr_attempted = bool(args.run_asr)
    if not args.run_asr:
        previous_path = output_path(outputs_before.get("latestAudioAsrEvidenceAdapter"))
        if previous_path and previous_path.exists():
            try:
                previous_report = read_json(previous_path)
                for result in previous_report.get("asrResults") if isinstance(previous_report.get("asrResults"), list) else []:
                    if not isinstance(result, dict) or not result.get("ok"):
                        continue
                    transcript_json = result.get("transcriptJson")
                    if isinstance(transcript_json, str) and Path(transcript_json).exists():
                        carried = dict(result)
                        carried["reusedExisting"] = True
                        asr_results.append(carried)
                        reused_existing_count += 1
            except Exception:
                pass
    if args.run_asr and whisper_path:
        transcript_dir.mkdir(parents=True, exist_ok=True)
        for target in targets:
            # Avoid surprise multi-hour transcription. This adapter should prove the path on proof windows first;
            # full-spine/source transcription is a deliberate later run, not an accidental furnace.
            if target.duration_seconds is not None and target.duration_seconds > 900 and "proof-window" not in target.role:
                continue
            asr_results.append(run_whisper(target, transcript_dir, args.model, args.language, args.word_timestamps))

    generated_count = sum(1 for result in asr_results if result.get("ok"))
    failure_count = sum(1 for result in asr_results if not result.get("ok"))
    status = "asr-evidence-ready" if generated_count else ("asr-adapter-ready-run-not-attempted" if not asr_attempted else "asr-attempted-no-transcripts")
    if reused_existing_count and not asr_attempted:
        status = "asr-evidence-reused"
    if not whisper_path:
        status = "asr-adapter-ready-whisper-missing"

    suggested = (
        f"python3 apps/QuipslyStudio/script/audio_workbench_asr_evidence_adapter.py --baseline-dir {shell_quote(str(baseline_dir))} --run-asr --max-targets 8 --model tiny.en --language English --word-timestamps"
    )
    report = {
        "schema": "quipsly.audio-workbench.asr-evidence-adapter.v1",
        "generatedAt": iso_now(),
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "status": status,
        "whisperAvailable": bool(whisper_path),
        "whisperPath": whisper_path,
        "asrAttempted": asr_attempted,
        "reusedExistingTranscriptCount": reused_existing_count,
        "model": args.model,
        "language": args.language,
        "wordTimestampsRequested": bool(args.word_timestamps),
        "targetCount": len(targets),
        "targets": [target_row(target) for target in targets],
        "transcriptGeneratedCount": generated_count,
        "transcriptFailureCount": failure_count,
        "asrResults": asr_results,
        "transcriptDir": str(transcript_dir),
        "suggestedCommand": suggested,
        "currentGateEffect": "semantic evidence only; does-not-unlock-rendering; does-not-approve-audio",
        "approvalStatus": manifest_before.get("approvalStatus"),
        "humanListenStillRequired": manifest_before.get("approvalStatus") != "human-approved-for-branch-inheritance",
        "branchInheritanceReady": bool(manifest_before.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest_before.get("branchRenderReady")),
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "branchRenderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
        "json": str(json_path),
        "markdown": str(markdown_path),
        "html": str(html_path),
        "openCommand": str(open_command),
        "runCommand": str(run_command),
    }

    write_json(json_path, report)
    markdown_path.write_text(render_markdown(report) + "\n", encoding="utf-8")
    html_path.write_text(render_html(report, markdown_path), encoding="utf-8")
    open_command.write_text("#!/usr/bin/env bash\nset -euo pipefail\nopen " + shlex.quote(str(html_path)) + "\n", encoding="utf-8")
    open_command.chmod(0o755)
    run_command.write_text("#!/usr/bin/env bash\nset -euo pipefail\ncd " + shlex.quote(str(Path.cwd())) + "\n" + suggested + "\n", encoding="utf-8")
    run_command.chmod(0o755)

    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    outputs["latestAudioAsrEvidenceAdapter"] = str(json_path)
    outputs["latestAudioAsrEvidenceAdapterMarkdown"] = str(markdown_path)
    outputs["latestAudioAsrEvidenceAdapterHtml"] = str(html_path)
    outputs["latestAudioAsrEvidenceAdapterOpenCommand"] = str(open_command)
    outputs["latestAudioAsrEvidenceAdapterRunCommand"] = str(run_command)
    history = outputs.setdefault("audioAsrEvidenceAdapters", [])
    if str(json_path) not in history:
        history.append(str(json_path))
    manifest["audioAsrEvidenceAdapterCount"] = len(history)
    manifest["audioAsrEvidenceAdapterLatestStatus"] = status
    manifest["audioAsrEvidenceAdapterWhisperAvailable"] = bool(whisper_path)
    manifest["audioAsrEvidenceAdapterAsrAttempted"] = asr_attempted
    manifest["audioAsrEvidenceAdapterReusedExistingTranscriptCount"] = reused_existing_count
    manifest["audioAsrEvidenceAdapterTargetCount"] = len(targets)
    manifest["audioAsrEvidenceAdapterTranscriptGeneratedCount"] = generated_count
    manifest["audioAsrEvidenceAdapterTranscriptFailureCount"] = failure_count
    manifest["audioAsrEvidenceAdapterHumanListenStillRequired"] = report["humanListenStillRequired"]
    manifest["audioAsrEvidenceAdapterApprovalStateChanged"] = False
    manifest["audioAsrEvidenceAdapterBranchStateChanged"] = False
    manifest["audioAsrEvidenceAdapterRenderAttempted"] = False
    manifest["audioAsrEvidenceAdapterBranchRenderAttempted"] = False
    manifest["audioAsrEvidenceAdapterUploadAttempted"] = False
    manifest["audioAsrEvidenceAdapterPublicationAttempted"] = False
    manifest["audioAsrEvidenceAdapterOriginalMediaMutated"] = False
    manifest["approvalStatus"] = manifest_before.get("approvalStatus")
    manifest["branchInheritanceReady"] = bool(manifest_before.get("branchInheritanceReady"))
    manifest["branchRenderReady"] = bool(manifest_before.get("branchRenderReady"))
    write_json(manifest_path, manifest)

    print(json.dumps({
        "baselineId": baseline_id,
        "status": status,
        "whisperAvailable": bool(whisper_path),
        "asrAttempted": asr_attempted,
        "targetCount": len(targets),
        "transcriptGeneratedCount": generated_count,
        "transcriptFailureCount": failure_count,
        "json": str(json_path),
        "markdown": str(markdown_path),
        "html": str(html_path),
        "runCommand": str(run_command),
    }, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
