#!/usr/bin/env python3
"""Local Studio Cut render handoff tools.

The CLI intentionally uses only the Python standard library. It never talks to
Firebase or uploads media; all inputs and outputs are local filesystem paths.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from typing import Any


PROGRAM_STATE_ORDER = [
    "charlie",
    "homer",
    "both",
    "charlie_clip",
    "homer_clip",
    "both_clip",
    "cut",
]

PROGRAM_STATES = set(PROGRAM_STATE_ORDER)

RENDER_PROFILE_LAYOUTS = {
    "youtube_16x9": {
        "charlie": {
            "behavior": "Charlie full frame",
            "composition": "single_host_full_frame",
            "videoSources": ["charlie"],
            "audioPolicy": "Use synced program/clean mix later; proxy preview uses composite proxy audio.",
            "futureFullResNotes": [
                "Map source time to Charlie's synced Canon R8 full-res source.",
                "Fill the 16:9 frame from Charlie's camera; crop/scale belongs to this render profile.",
            ],
        },
        "homer": {
            "behavior": "Homer full frame",
            "composition": "single_host_full_frame",
            "videoSources": ["homer"],
            "audioPolicy": "Use synced program/clean mix later; proxy preview uses composite proxy audio.",
            "futureFullResNotes": [
                "Map source time to Homer's synced Insta360 export.",
                "Fill the 16:9 frame from Homer's reframed source; crop/scale belongs to this render profile.",
            ],
        },
        "both": {
            "behavior": "Side-by-side hosts",
            "composition": "two_host_split",
            "videoSources": ["homer", "charlie"],
            "audioPolicy": "Use synced program/clean mix later; proxy preview uses composite proxy audio.",
            "futureFullResNotes": [
                "Map the same source-time span to Homer and Charlie full-res sources.",
                "Compose both hosts side by side in a 16:9 frame.",
            ],
        },
        "charlie_clip": {
            "behavior": "Charlie plus clip",
            "composition": "host_plus_clip",
            "videoSources": ["charlie", "clip"],
            "audioPolicy": "Use synced program/clean mix later; proxy preview uses composite proxy audio.",
            "futureFullResNotes": [
                "Map source time to Charlie and Clip sources.",
                "Compose Charlie with the shared clip in a 16:9 layout.",
            ],
        },
        "homer_clip": {
            "behavior": "Homer plus clip",
            "composition": "host_plus_clip",
            "videoSources": ["homer", "clip"],
            "audioPolicy": "Use synced program/clean mix later; proxy preview uses composite proxy audio.",
            "futureFullResNotes": [
                "Map source time to Homer and Clip sources.",
                "Compose Homer with the shared clip in a 16:9 layout.",
            ],
        },
        "both_clip": {
            "behavior": "Both hosts plus clip",
            "composition": "two_hosts_plus_clip",
            "videoSources": ["homer", "charlie", "clip"],
            "audioPolicy": "Use synced program/clean mix later; proxy preview uses composite proxy audio.",
            "futureFullResNotes": [
                "Map source time to Homer, Charlie, and Clip sources.",
                "Compose both hosts and shared clip in a 16:9 layout.",
            ],
        },
        "cut": {
            "behavior": "Skipped",
            "composition": "inactive",
            "videoSources": [],
            "audioPolicy": "No program output for this source span.",
            "futureFullResNotes": [
                "Do not render this span in program playback or output.",
            ],
        },
    },
    "proxy_preview": {
        "charlie": {
            "behavior": "Whole source-monitor proxy span",
            "composition": "composite_proxy_trim",
            "videoSources": ["source_monitor_proxy"],
            "audioPolicy": "Keep proxy audio as-is.",
            "futureFullResNotes": [
                "Proxy preview does not crop panes; use youtube_16x9 planning for full-res source choices.",
            ],
        },
        "homer": {
            "behavior": "Whole source-monitor proxy span",
            "composition": "composite_proxy_trim",
            "videoSources": ["source_monitor_proxy"],
            "audioPolicy": "Keep proxy audio as-is.",
            "futureFullResNotes": [
                "Proxy preview does not crop panes; use youtube_16x9 planning for full-res source choices.",
            ],
        },
        "both": {
            "behavior": "Whole source-monitor proxy span",
            "composition": "composite_proxy_trim",
            "videoSources": ["source_monitor_proxy"],
            "audioPolicy": "Keep proxy audio as-is.",
            "futureFullResNotes": [
                "Proxy preview does not crop panes; use youtube_16x9 planning for full-res source choices.",
            ],
        },
        "charlie_clip": {
            "behavior": "Whole source-monitor proxy span",
            "composition": "composite_proxy_trim",
            "videoSources": ["source_monitor_proxy"],
            "audioPolicy": "Keep proxy audio as-is.",
            "futureFullResNotes": [
                "Proxy preview does not crop panes; use youtube_16x9 planning for full-res source choices.",
            ],
        },
        "homer_clip": {
            "behavior": "Whole source-monitor proxy span",
            "composition": "composite_proxy_trim",
            "videoSources": ["source_monitor_proxy"],
            "audioPolicy": "Keep proxy audio as-is.",
            "futureFullResNotes": [
                "Proxy preview does not crop panes; use youtube_16x9 planning for full-res source choices.",
            ],
        },
        "both_clip": {
            "behavior": "Whole source-monitor proxy span",
            "composition": "composite_proxy_trim",
            "videoSources": ["source_monitor_proxy"],
            "audioPolicy": "Keep proxy audio as-is.",
            "futureFullResNotes": [
                "Proxy preview does not crop panes; use youtube_16x9 planning for full-res source choices.",
            ],
        },
        "cut": {
            "behavior": "Skipped",
            "composition": "inactive",
            "videoSources": [],
            "audioPolicy": "No proxy output for this source span.",
            "futureFullResNotes": [
                "Do not render this span in proxy preview or full-res output.",
            ],
        },
    },
}

SUPPORTED_PROFILES = set(RENDER_PROFILE_LAYOUTS)
MINIMUM_PYTHON = (3, 10)

PROFILE_DESCRIPTIONS = {
    "youtube_16x9": "Future full-res 16:9 program layout planning.",
    "proxy_preview": "Rough whole-proxy trimming for quick review output.",
}

PROGRAM_STATE_LABELS = {
    "charlie": "Charlie",
    "homer": "Homer",
    "both": "Both",
    "charlie_clip": "Charlie/Clip",
    "homer_clip": "Homer/Clip",
    "both_clip": "Both/Clip",
    "cut": "Cut",
}


class StudioCutCliError(Exception):
    """Expected CLI failure with a concise operator-facing message."""


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    try:
        return args.handler(args)
    except StudioCutCliError as error:
        print(f"error: {error}", file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        print("error: interrupted", file=sys.stderr)
        return 130


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="studio-cut-local",
        description="Local Studio Cut render handoff tools.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    doctor_parser = subparsers.add_parser(
        "doctor",
        help="Check local Python, ffmpeg, and filesystem readiness.",
    )
    doctor_parser.set_defaults(handler=run_doctor)

    plan_parser = subparsers.add_parser(
        "plan-render",
        help="Create a dry-run active segment render plan.",
    )
    plan_parser.add_argument("--manifest", required=True, type=Path)
    plan_parser.add_argument("--decisions", required=True, type=Path)
    plan_parser.add_argument("--profile", required=True, choices=sorted(SUPPORTED_PROFILES))
    plan_parser.add_argument("--out", type=Path)
    plan_parser.set_defaults(handler=run_plan_render)

    render_parser = subparsers.add_parser(
        "render-proxy-preview",
        help="Render a rough proxy preview by trimming and concatenating active spans.",
    )
    render_parser.add_argument("--manifest", required=True, type=Path)
    render_parser.add_argument("--decisions", required=True, type=Path)
    render_parser.add_argument("--proxy", required=True, type=Path)
    render_parser.add_argument("--out", required=True, type=Path)
    render_parser.set_defaults(handler=run_render_proxy_preview)

    explain_parser = subparsers.add_parser(
        "explain-profile",
        help="Print render behavior for each semantic state in a profile.",
    )
    explain_parser.add_argument("--profile", required=True, choices=sorted(SUPPORTED_PROFILES))
    explain_parser.set_defaults(handler=run_explain_profile)

    return parser


def run_doctor(_args: argparse.Namespace) -> int:
    print("Studio Cut Local Doctor")
    print("=======================")

    python_ok = sys.version_info >= MINIMUM_PYTHON
    print(
        format_check(
            python_ok,
            f"Python {sys.version.split()[0]}",
            f"requires Python {MINIMUM_PYTHON[0]}.{MINIMUM_PYTHON[1]}+",
        )
    )

    ffmpeg_path = shutil.which("ffmpeg")
    if ffmpeg_path:
        print(format_check(True, f"ffmpeg found at {ffmpeg_path}"))
    else:
        print(
            format_check(
                False,
                "ffmpeg not found on PATH",
                "plan-render works; render-proxy-preview requires ffmpeg",
                warning=True,
            )
        )

    cwd = Path.cwd()
    read_ok = cwd.exists() and os.access(cwd, os.R_OK)
    print(format_check(read_ok, f"read access to {cwd}"))

    write_ok = check_write_access(cwd)
    print(format_check(write_ok, f"write access to {cwd}"))

    return 0 if python_ok and read_ok and write_ok else 1


def run_plan_render(args: argparse.Namespace) -> int:
    manifest, decision_events = load_inputs(args.manifest, args.decisions)
    plan = build_render_plan(
        manifest=manifest,
        decision_events=decision_events,
        profile=args.profile,
        manifest_path=args.manifest,
        decisions_path=args.decisions,
    )

    print_render_plan(plan)

    if args.out:
        write_json(args.out, plan)
        print(f"\nWrote render plan JSON: {args.out}")

    return 0


def run_render_proxy_preview(args: argparse.Namespace) -> int:
    ffmpeg_path = shutil.which("ffmpeg")
    if not ffmpeg_path:
        raise StudioCutCliError(
            "ffmpeg is not available on PATH; install ffmpeg before rendering a proxy preview."
        )

    if not args.proxy.is_file():
        raise StudioCutCliError(f"proxy video not found: {args.proxy}")

    manifest, decision_events = load_inputs(args.manifest, args.decisions)
    plan = build_render_plan(
        manifest=manifest,
        decision_events=decision_events,
        profile="proxy_preview",
        manifest_path=args.manifest,
        decisions_path=args.decisions,
    )
    segments = plan["activeSegments"]

    if not segments:
        raise StudioCutCliError("render plan has no active non-Cut segments to render.")

    args.out.parent.mkdir(parents=True, exist_ok=True)

    print_render_plan(plan)
    print(f"\nRendering proxy preview from local file: {args.proxy}")
    print(f"Output: {args.out}")

    with tempfile.TemporaryDirectory(prefix="studio-cut-proxy-") as temp_dir:
        temp_path = Path(temp_dir)
        segment_files = []

        for segment in segments:
            index = int(segment["index"])
            segment_file = temp_path / f"segment-{index:04d}.mp4"
            segment_files.append(segment_file)
            run_ffmpeg_trim(
                ffmpeg_path=ffmpeg_path,
                proxy_path=args.proxy,
                segment=segment,
                out_path=segment_file,
            )

        concat_file = temp_path / "segments.txt"
        concat_file.write_text(
            "\n".join(f"file '{escape_ffmpeg_concat_path(path)}'" for path in segment_files)
            + "\n",
            encoding="utf-8",
        )
        run_ffmpeg_concat(
            ffmpeg_path=ffmpeg_path,
            concat_file=concat_file,
            out_path=args.out,
        )

    print("\nProxy preview render complete.")
    return 0


def run_explain_profile(args: argparse.Namespace) -> int:
    print_profile_mapping(args.profile)
    return 0


def load_inputs(
    manifest_path: Path, decisions_path: Path
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    manifest = load_json_file(manifest_path, "manifest")
    validate_manifest(manifest)

    decisions_payload = load_json_file(decisions_path, "decisions")
    decision_events = parse_decision_events(decisions_payload)

    if not decision_events:
        print("warning: decision file contains no valid decision events", file=sys.stderr)

    return manifest, decision_events


def load_json_file(path: Path, label: str) -> Any:
    if not path.is_file():
        raise StudioCutCliError(f"{label} file not found: {path}")

    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise StudioCutCliError(f"{label} file is not valid JSON: {error}") from error
    except OSError as error:
        raise StudioCutCliError(f"could not read {label} file {path}: {error}") from error


def validate_manifest(manifest: Any) -> None:
    if not isinstance(manifest, dict):
        raise StudioCutCliError("manifest must be a JSON object")

    require_non_empty_string(manifest, "id", "manifest")
    require_non_empty_string(manifest, "title", "manifest")
    duration_ms = manifest.get("durationMs")

    if not isinstance(duration_ms, (int, float)) or duration_ms <= 0:
        raise StudioCutCliError("manifest.durationMs must be a positive number")

    sources = manifest.get("sources")
    if not isinstance(sources, dict):
        raise StudioCutCliError("manifest.sources must be an object")

    for role in ("homer", "charlie", "program"):
        source = sources.get(role)
        if not isinstance(source, dict):
            raise StudioCutCliError(f"manifest.sources.{role} must be an object")
        if source.get("role") != role:
            raise StudioCutCliError(f"manifest.sources.{role}.role must be {role}")
        require_non_empty_string(source, "label", f"manifest.sources.{role}")

    if "clip" in sources:
        clip = sources["clip"]
        if not isinstance(clip, dict) or clip.get("role") != "clip":
            raise StudioCutCliError("manifest.sources.clip.role must be clip")
        require_non_empty_string(clip, "label", "manifest.sources.clip")

    proxy = manifest.get("sourceMonitorProxy")
    if not isinstance(proxy, dict):
        raise StudioCutCliError("manifest.sourceMonitorProxy must be an object")

    if not proxy.get("url") and not proxy.get("localPlaceholderPath"):
        raise StudioCutCliError(
            "manifest.sourceMonitorProxy must include url or localPlaceholderPath"
        )

    panes = proxy.get("panes")
    if not isinstance(panes, dict):
        raise StudioCutCliError("manifest.sourceMonitorProxy.panes must be an object")

    for pane_name in ("homer", "charlie"):
        validate_pane(panes.get(pane_name), pane_name)

    if "clip" in panes:
        validate_pane(panes["clip"], "clip")

    sync = manifest.get("syncBootstrap")
    if not isinstance(sync, dict) or sync.get("source") != "premiere":
        raise StudioCutCliError("manifest.syncBootstrap.source must be premiere")


def parse_decision_events(payload: Any) -> list[dict[str, Any]]:
    candidate_events = (
        payload
        if isinstance(payload, list)
        else payload.get("decisionEvents", [])
        if isinstance(payload, dict)
        else []
    )

    if not isinstance(candidate_events, list):
        raise StudioCutCliError("decisions must be an array or contain decisionEvents[]")

    valid_events = []
    rejected_count = 0

    for event in candidate_events:
        if is_decision_event(event):
            valid_events.append(event)
        else:
            rejected_count += 1

    if rejected_count:
        print(f"warning: rejected {rejected_count} invalid decision event(s)", file=sys.stderr)

    return sorted(
        valid_events,
        key=lambda event: (
            float(event["sourceTimeMs"]),
            str(event["createdAt"]),
            str(event["id"]),
        ),
    )


def build_render_plan(
    *,
    manifest: dict[str, Any],
    decision_events: list[dict[str, Any]],
    profile: str,
    manifest_path: Path,
    decisions_path: Path,
) -> dict[str, Any]:
    if profile not in SUPPORTED_PROFILES:
        raise StudioCutCliError(
            f"profile must be one of: {', '.join(sorted(SUPPORTED_PROFILES))}"
        )

    duration_ms = int(round(float(manifest["durationMs"])))
    derived_segments = derive_segments(decision_events, duration_ms)
    active_segments = []
    cut_segments = []

    for segment in derived_segments:
        segment_plan = add_profile_planning(segment, profile)

        if segment["state"] == "cut":
            cut_segments.append(segment_plan)
            continue

        segment_plan["index"] = len(active_segments)
        active_segments.append(segment_plan)

    active_duration_ms = sum(segment["durationMs"] for segment in active_segments)
    cut_duration_ms = sum(segment["durationMs"] for segment in cut_segments)

    return {
        "schemaVersion": 1,
        "generatedAt": dt.datetime.now(dt.timezone.utc)
        .isoformat()
        .replace("+00:00", "Z"),
        "profile": profile,
        "profileDescription": PROFILE_DESCRIPTIONS[profile],
        "manifest": {
            "id": manifest["id"],
            "title": manifest["title"],
            "durationMs": duration_ms,
            "syncBootstrap": manifest["syncBootstrap"],
            "sourceMonitorProxy": manifest["sourceMonitorProxy"],
        },
        "inputs": {
            "manifestPath": str(manifest_path),
            "decisionsPath": str(decisions_path),
        },
        "summary": {
            "decisionEventCount": len(decision_events),
            "derivedSegmentCount": len(derived_segments),
            "activeSegmentCount": len(active_segments),
            "cutSegmentCount": len(cut_segments),
            "sourceDurationMs": duration_ms,
            "activeDurationMs": active_duration_ms,
            "cutDurationMs": cut_duration_ms,
        },
        "activeSegments": active_segments,
        "cutSegments": cut_segments,
    }


def add_profile_planning(segment: dict[str, Any], profile: str) -> dict[str, Any]:
    state = str(segment["state"])
    profile_plan = get_profile_plan(profile, state)

    return {
        **segment,
        "programState": state,
        "sourceTime": {
            "inMs": segment["startSourceTimeMs"],
            "outMs": segment["endSourceTimeMs"],
            "durationMs": segment["durationMs"],
            "in": format_time_ms(segment["startSourceTimeMs"]),
            "out": format_time_ms(segment["endSourceTimeMs"]),
            "duration": format_time_ms(segment["durationMs"]),
        },
        "layoutBehavior": profile_plan["behavior"],
        "profilePlan": profile_plan,
        "futureFullResNotes": profile_plan["futureFullResNotes"],
    }


def get_profile_plan(profile: str, state: str) -> dict[str, Any]:
    try:
        plan = RENDER_PROFILE_LAYOUTS[profile][state]
    except KeyError as error:
        raise StudioCutCliError(
            f"no render profile mapping for profile={profile} state={state}"
        ) from error

    return {
        "profile": profile,
        "state": state,
        "stateLabel": PROGRAM_STATE_LABELS[state],
        **plan,
    }


def derive_segments(
    decision_events: list[dict[str, Any]], duration_ms: int
) -> list[dict[str, Any]]:
    segments = []

    for index, event in enumerate(decision_events):
        start_ms = clamp_ms(float(event["sourceTimeMs"]), duration_ms)

        if start_ms >= duration_ms:
            continue

        next_event = decision_events[index + 1] if index + 1 < len(decision_events) else None
        end_ms = (
            clamp_ms(float(next_event["sourceTimeMs"]), duration_ms)
            if next_event
            else duration_ms
        )

        if end_ms <= start_ms:
            continue

        segments.append(
            {
                "startSourceTimeMs": start_ms,
                "endSourceTimeMs": end_ms,
                "durationMs": end_ms - start_ms,
                "state": event["state"],
                "sourceEventId": event["id"],
            }
        )

    return segments


def print_render_plan(plan: dict[str, Any]) -> None:
    manifest = plan["manifest"]
    summary = plan["summary"]

    print("Studio Cut Render Plan")
    print("======================")
    print(f"Episode: {manifest['title']} ({manifest['id']})")
    print(f"Profile: {plan['profile']} - {plan['profileDescription']}")
    print(f"Source duration: {format_time_ms(summary['sourceDurationMs'])}")
    print(f"Decision events: {summary['decisionEventCount']}")
    print(
        "Active segments: "
        f"{summary['activeSegmentCount']} / {format_time_ms(summary['activeDurationMs'])}"
    )
    print(
        "Cut segments skipped: "
        f"{summary['cutSegmentCount']} / {format_time_ms(summary['cutDurationMs'])}"
    )

    if not plan["activeSegments"]:
        print("\nNo active non-Cut segments in this plan.")
        return

    print("\nActive segment plan:")
    for segment in plan["activeSegments"]:
        print(
            f"  {int(segment['index']) + 1:02d}. "
            f"{format_time_ms(segment['startSourceTimeMs'])} -> "
            f"{format_time_ms(segment['endSourceTimeMs'])} "
            f"({format_time_ms(segment['durationMs'])}) "
            f"{segment['programState']} -> {segment['layoutBehavior']} "
            f"via {short_id(segment['sourceEventId'])}"
        )
        notes = segment["futureFullResNotes"]
        if notes:
            print(f"      full-res note: {notes[0]}")


def print_profile_mapping(profile: str) -> None:
    print(f"Studio Cut Render Profile: {profile}")
    print("=" * (27 + len(profile)))
    print(PROFILE_DESCRIPTIONS[profile])

    for state in PROGRAM_STATE_ORDER:
        plan = get_profile_plan(profile, state)
        sources = ", ".join(plan["videoSources"]) if plan["videoSources"] else "none"
        print(f"\n{PROGRAM_STATE_LABELS[state]} ({state})")
        print(f"  behavior: {plan['behavior']}")
        print(f"  composition: {plan['composition']}")
        print(f"  video sources: {sources}")
        print(f"  audio: {plan['audioPolicy']}")

        for note in plan["futureFullResNotes"]:
            print(f"  full-res note: {note}")


def run_ffmpeg_trim(
    *,
    ffmpeg_path: str,
    proxy_path: Path,
    segment: dict[str, Any],
    out_path: Path,
) -> None:
    start_seconds = float(segment["startSourceTimeMs"]) / 1000
    duration_seconds = float(segment["durationMs"]) / 1000

    command = [
        ffmpeg_path,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-ss",
        format_seconds(start_seconds),
        "-i",
        str(proxy_path),
        "-t",
        format_seconds(duration_seconds),
        "-map",
        "0:v:0",
        "-map",
        "0:a?",
        "-reset_timestamps",
        "1",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        str(out_path),
    ]
    run_command(command, f"ffmpeg trim segment {int(segment['index']) + 1}")


def run_ffmpeg_concat(*, ffmpeg_path: str, concat_file: Path, out_path: Path) -> None:
    command = [
        ffmpeg_path,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        str(concat_file),
        "-c",
        "copy",
        "-movflags",
        "+faststart",
        str(out_path),
    ]
    run_command(command, "ffmpeg concatenate proxy segments")


def run_command(command: list[str], label: str) -> None:
    try:
        subprocess.run(command, check=True)
    except subprocess.CalledProcessError as error:
        raise StudioCutCliError(f"{label} failed with exit code {error.returncode}") from error


def write_json(path: Path, payload: dict[str, Any]) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    except OSError as error:
        raise StudioCutCliError(f"could not write render plan {path}: {error}") from error


def validate_pane(value: Any, pane_name: str) -> None:
    if not isinstance(value, dict):
        raise StudioCutCliError(f"manifest source-monitor pane {pane_name} must be an object")

    for key in ("x", "y", "width", "height"):
        number = value.get(key)
        if not isinstance(number, (int, float)):
            raise StudioCutCliError(f"manifest source-monitor pane {pane_name}.{key} must be a number")

    if value["width"] <= 0 or value["height"] <= 0:
        raise StudioCutCliError(
            f"manifest source-monitor pane {pane_name} width/height must be positive"
        )


def is_decision_event(event: Any) -> bool:
    if not isinstance(event, dict):
        return False

    return (
        isinstance(event.get("id"), str)
        and bool(event["id"].strip())
        and isinstance(event.get("projectId"), str)
        and bool(event["projectId"].strip())
        and isinstance(event.get("branchId"), str)
        and bool(event["branchId"].strip())
        and isinstance(event.get("sourceTimeMs"), (int, float))
        and float(event["sourceTimeMs"]) >= 0
        and event.get("state") in PROGRAM_STATES
        and isinstance(event.get("createdBy"), str)
        and bool(event["createdBy"].strip())
        and isinstance(event.get("createdAt"), str)
        and bool(event["createdAt"].strip())
        and (event.get("note") is None or isinstance(event.get("note"), str))
    )


def require_non_empty_string(source: dict[str, Any], key: str, label: str) -> None:
    value = source.get(key)
    if not isinstance(value, str) or not value.strip():
        raise StudioCutCliError(f"{label}.{key} must be a non-empty string")


def check_write_access(path: Path) -> bool:
    test_path = path / ".studio-cut-local-write-test"

    try:
        test_path.write_text("ok\n", encoding="utf-8")
        test_path.unlink()
        return True
    except OSError:
        return False


def format_check(
    ok: bool, message: str, detail: str | None = None, *, warning: bool = False
) -> str:
    prefix = "OK" if ok else "WARN" if warning else "FAIL"
    suffix = f" ({detail})" if detail else ""
    return f"[{prefix}] {message}{suffix}"


def clamp_ms(value: float, duration_ms: int) -> int:
    return int(min(duration_ms, max(0, round(value))))


def format_time_ms(value: int | float) -> str:
    total_ms = int(round(value))
    total_seconds = total_ms // 1000
    millis = total_ms % 1000
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    seconds = total_seconds % 60

    if hours:
        return f"{hours}:{minutes:02d}:{seconds:02d}.{millis:03d}"

    return f"{minutes}:{seconds:02d}.{millis:03d}"


def format_seconds(value: float) -> str:
    return f"{value:.3f}"


def short_id(value: str) -> str:
    return value[:8]


def escape_ffmpeg_concat_path(path: Path) -> str:
    return str(path).replace("\\", "\\\\").replace("'", "\\'")


if __name__ == "__main__":
    raise SystemExit(main())
