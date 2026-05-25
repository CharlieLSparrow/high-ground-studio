#!/usr/bin/env python3
"""Local Studio Cut render handoff tools.

The CLI intentionally uses only the Python standard library. It never talks to
Firebase or uploads media; all inputs and outputs are local filesystem paths.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import sys
import tempfile
import uuid
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
YOUTUBE_16X9_WIDTH = 1920
YOUTUBE_16X9_HEIGHT = 1080
YOUTUBE_16X9_FPS = 30
RENDER_AUDIO_SAMPLE_RATE = 48000
RENDER_AUDIO_CHANNEL_LAYOUT = "stereo"
AGENT_VISUAL_REVIEW_MAX_FRAMES = 12
AGENT_VISUAL_REVIEW_FRAME_WIDTH = 320
YOUTUBE_16X9_STATE_INPUTS = {
    "charlie": ["charlie"],
    "homer": ["homer"],
    "both": ["homer", "charlie"],
    "charlie_clip": ["charlie", "clip"],
    "homer_clip": ["homer", "clip"],
    "both_clip": ["homer", "charlie", "clip"],
}

PROFILE_DESCRIPTIONS = {
    "youtube_16x9": "Future full-res 16:9 program layout planning.",
    "proxy_preview": "Rough whole-proxy trimming for quick review output.",
}

AGENT_SMOKE_SOURCE_DURATION_MS = 12000
AGENT_SMOKE_EXPECTED_CUT_DURATION_MS = 2000
AGENT_SMOKE_EXPECTED_ACTIVE_DURATION_MS = (
    AGENT_SMOKE_SOURCE_DURATION_MS - AGENT_SMOKE_EXPECTED_CUT_DURATION_MS
)
AGENT_SMOKE_EXPECTED_ACTIVE_STATES = [
    "both",
    "charlie",
    "homer",
    "charlie_clip",
    "both_clip",
]
AGENT_SMOKE_EXPECTED_CUT_SEGMENT_COUNT = 1
AGENT_SMOKE_EXPECTED_YOUTUBE_16X9_BEHAVIORS = {
    "charlie": "Charlie full frame",
    "homer": "Homer full frame",
    "both": "Side-by-side hosts",
    "charlie_clip": "Charlie plus clip",
    "homer_clip": "Homer plus clip",
    "both_clip": "Both hosts plus clip",
    "cut": "Skipped",
}
DEFAULT_EPISODE_VALIDATION_TOLERANCE_MS = 1500
DEFAULT_STUDIO_CUT_WORKSPACE_ROOT = Path.home() / "Movies" / "StudioCut"

RESCUE_SYNC_ROLE_SPECS = {
    "homerVideo": {
        "label": "Homer video",
        "required": True,
        "kind": "video",
        "prefixes": ["homer-video", "homer-camera", "homer-insta360"],
    },
    "charlieVideo": {
        "label": "Charlie video",
        "required": True,
        "kind": "video",
        "prefixes": ["charlie-video", "charlie-camera", "charlie-canon"],
    },
    "homerAudio": {
        "label": "Homer clean audio",
        "required": True,
        "kind": "audio",
        "prefixes": ["homer-audio", "homer-dji", "dji-homer"],
    },
    "charlieAudio": {
        "label": "Charlie clean audio",
        "required": True,
        "kind": "audio",
        "prefixes": ["charlie-audio", "charlie-shure", "shure-charlie"],
    },
    "phoneReferenceAudio": {
        "label": "Phone/reference audio pieces",
        "required": True,
        "kind": "audio",
        "multi": True,
        "prefixes": [
            "phone-reference",
            "iphone-reference",
            "call-reference",
            "reference-audio",
            "reference",
        ],
    },
    "clipVideo": {
        "label": "Optional clip/screen video",
        "required": False,
        "kind": "video",
        "prefixes": ["clip-video", "screen-video", "shared-clip", "clip"],
    },
}

VIDEO_EXTENSIONS = {".mp4", ".mov", ".m4v", ".mkv", ".webm"}
AUDIO_EXTENSIONS = {".wav", ".m4a", ".mp3", ".aac", ".aiff", ".aif", ".flac"}
MEDIA_EXTENSIONS = VIDEO_EXTENSIONS | AUDIO_EXTENSIONS

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

    aligned_parser = subparsers.add_parser(
        "render-youtube-16x9-aligned",
        help="Render a rough 16:9 output from timeline-aligned local media.",
    )
    aligned_parser.add_argument("--manifest", required=True, type=Path)
    aligned_parser.add_argument("--decisions", required=True, type=Path)
    aligned_parser.add_argument("--media-map", required=True, type=Path)
    aligned_parser.add_argument("--out", required=True, type=Path)
    aligned_parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the segment plan and ffmpeg commands without rendering files.",
    )
    aligned_parser.add_argument(
        "--keep-temp",
        action="store_true",
        help="Keep temporary segment files after a real render.",
    )
    aligned_parser.set_defaults(handler=run_render_youtube_16x9_aligned)

    sync_map_render_parser = subparsers.add_parser(
        "render-from-sync-map",
        help="Render a rough 16:9 output from original local media using Sync Map offsets.",
    )
    sync_map_render_parser.add_argument("--sync-map", required=True, type=Path)
    sync_map_render_parser.add_argument("--decisions", required=True, type=Path)
    sync_map_render_parser.add_argument("--media-map", required=True, type=Path)
    sync_map_render_parser.add_argument("--out", required=True, type=Path)
    sync_map_render_parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the segment plan and ffmpeg commands without rendering files.",
    )
    sync_map_render_parser.add_argument(
        "--keep-temp",
        action="store_true",
        help="Keep temporary segment files after a real render.",
    )
    sync_map_render_parser.add_argument(
        "--out-qa",
        type=Path,
        help=(
            "Optional JSON path for a render QA report with Sync Map asset "
            "coverage, black padding, and audio source diagnostics."
        ),
    )
    sync_map_render_parser.set_defaults(handler=run_render_from_sync_map)

    smoke_parser = subparsers.add_parser(
        "agent-smoke-test",
        help="Run a synthetic end-to-end Studio Cut workflow smoke test.",
    )
    smoke_parser.add_argument("--workdir", type=Path)
    smoke_parser.add_argument(
        "--keep-workdir",
        action="store_true",
        help="Keep the generated synthetic files after the smoke test.",
    )
    smoke_parser.add_argument(
        "--json",
        action="store_true",
        help="Print a machine-readable JSON report.",
    )
    smoke_parser.add_argument(
        "--skip-render",
        action="store_true",
        help="Generate inputs and plan-render output, but skip final MP4 rendering.",
    )
    smoke_parser.set_defaults(handler=run_agent_smoke_test)

    bootstrap_parser = subparsers.add_parser(
        "create-episode-bootstrap",
        help="Create placeholder manifest/media-map files for a real episode.",
    )
    bootstrap_parser.add_argument("--episode-id", required=True)
    bootstrap_parser.add_argument("--title", required=True)
    bootstrap_parser.add_argument("--duration-ms", required=True, type=int)
    bootstrap_parser.add_argument("--out-dir", required=True, type=Path)
    bootstrap_parser.add_argument(
        "--include-clip",
        default=True,
        type=parse_bool_arg,
        help="Whether to include the optional Clip source. Use true or false. Default: true.",
    )
    bootstrap_parser.set_defaults(handler=run_create_episode_bootstrap)

    rescue_session_parser = subparsers.add_parser(
        "rescue-sync-session",
        help="Create and optionally run a one-folder Rescue Sync session.",
    )
    rescue_session_parser.add_argument("--episode-id", required=True)
    rescue_session_parser.add_argument("--title", required=True)
    rescue_session_parser.add_argument(
        "--episode-dir",
        type=Path,
        help=(
            "Episode workspace directory. Default: "
            "~/Movies/StudioCut/<episode-id>."
        ),
    )
    rescue_session_parser.add_argument(
        "--branch-id",
        default="main",
        help="Studio Cut branch id for generated room metadata. Default: main.",
    )
    rescue_session_parser.add_argument(
        "--created-by",
        default="local-rescue-sync-session",
        help="Operator id/email stored in generated local metadata.",
    )
    rescue_session_parser.add_argument(
        "--include-clip",
        default=True,
        type=parse_bool_arg,
        help="Whether to scan for optional clip/screen video. Default: true.",
    )
    rescue_session_parser.add_argument(
        "--skip-worker",
        action="store_true",
        help="Only scaffold/scan/write JSON; do not run the Rescue Sync worker.",
    )
    rescue_session_parser.set_defaults(handler=run_rescue_sync_session)

    rescue_status_parser = subparsers.add_parser(
        "rescue-sync-status",
        help="Inspect a one-folder Rescue Sync workspace and print next steps.",
    )
    rescue_status_parser.add_argument(
        "--episode-id",
        help=(
            "Episode id. Optional when --episode-dir is supplied; otherwise "
            "defaults to the episode directory name."
        ),
    )
    rescue_status_parser.add_argument(
        "--episode-dir",
        type=Path,
        help=(
            "Episode workspace directory. Default: "
            "~/Movies/StudioCut/<episode-id>."
        ),
    )
    rescue_status_parser.add_argument(
        "--include-clip",
        default=True,
        type=parse_bool_arg,
        help="Whether to expect/scan optional clip/screen video. Default: true.",
    )
    rescue_status_parser.add_argument(
        "--json",
        action="store_true",
        help="Print a machine-readable JSON status report.",
    )
    rescue_status_parser.set_defaults(handler=run_rescue_sync_status)

    agent_workspace_index_parser = subparsers.add_parser(
        "agent-workspace-index",
        help="Write a sanitized agent-readable index for a local episode workspace.",
    )
    agent_workspace_index_parser.add_argument(
        "--episode-id",
        help=(
            "Episode id. Optional when --episode-dir is supplied; otherwise "
            "defaults to the episode directory name."
        ),
    )
    agent_workspace_index_parser.add_argument(
        "--episode-dir",
        type=Path,
        help=(
            "Episode workspace directory. Default: "
            "~/Movies/StudioCut/<episode-id>."
        ),
    )
    agent_workspace_index_parser.add_argument(
        "--include-clip",
        default=True,
        type=parse_bool_arg,
        help="Whether to expect/scan optional clip/screen video. Default: true.",
    )
    agent_workspace_index_parser.add_argument(
        "--out",
        type=Path,
        help=(
            "Optional path to write the index JSON. Recommended local path: "
            "<episode-workspace>/generated/agent-workspace-index.json."
        ),
    )
    agent_workspace_index_parser.add_argument(
        "--json",
        action="store_true",
        help="Print the machine-readable sanitized index JSON.",
    )
    agent_workspace_index_parser.set_defaults(handler=run_agent_workspace_index)

    rescue_render_parser = subparsers.add_parser(
        "render-rescue-sync-session",
        help="Render a one-folder Rescue Sync workspace from generated Sync Map files.",
    )
    rescue_render_parser.add_argument(
        "--episode-id",
        help=(
            "Episode id. Optional when --episode-dir is supplied; otherwise "
            "defaults to the episode directory name."
        ),
    )
    rescue_render_parser.add_argument(
        "--episode-dir",
        type=Path,
        help=(
            "Episode workspace directory. Default: "
            "~/Movies/StudioCut/<episode-id>."
        ),
    )
    rescue_render_parser.add_argument(
        "--out",
        type=Path,
        help=(
            "Output MP4 path. Default: "
            "<episode-dir>/renders/<episode-id>-youtube-16x9.mp4."
        ),
    )
    rescue_render_parser.add_argument(
        "--include-clip",
        default=True,
        type=parse_bool_arg,
        help="Whether to expect/scan optional clip/screen video. Default: true.",
    )
    rescue_render_parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the segment plan and ffmpeg commands without rendering files.",
    )
    rescue_render_parser.add_argument(
        "--keep-temp",
        action="store_true",
        help="Keep temporary segment files after a real render.",
    )
    rescue_render_parser.add_argument(
        "--out-qa",
        type=Path,
        help=(
            "Optional render QA JSON path. Default: "
            "<episode-dir>/renders/<episode-id>-render-qa.json."
        ),
    )
    rescue_render_parser.set_defaults(handler=run_render_rescue_sync_session)

    validate_episode_parser = subparsers.add_parser(
        "validate-episode-files",
        help="Validate a real-episode manifest and local media map before rendering.",
    )
    validate_episode_parser.add_argument("--manifest", required=True, type=Path)
    validate_episode_parser.add_argument("--media-map", required=True, type=Path)
    validate_episode_parser.add_argument(
        "--decisions",
        type=Path,
        help=(
            "Optional Studio Cut decision JSON. When present, validate render "
            "readiness and print the exact rough 16:9 render command."
        ),
    )
    validate_episode_parser.add_argument(
        "--profile",
        default="youtube_16x9",
        choices=sorted(SUPPORTED_PROFILES),
        help="Render profile to use for decision readiness. Default: youtube_16x9.",
    )
    validate_episode_parser.add_argument(
        "--duration-tolerance-ms",
        default=DEFAULT_EPISODE_VALIDATION_TOLERANCE_MS,
        type=int,
        help=(
            "Warn when inspected media duration differs from manifest duration by "
            "more than this many milliseconds. Default: 1500."
        ),
    )
    validate_episode_parser.set_defaults(handler=run_validate_episode_files)

    validate_package_parser = subparsers.add_parser(
        "validate-generated-package",
        help="Validate generated Rescue Sync publish artifacts before uploading them.",
    )
    validate_package_parser.add_argument("--manifest", required=True, type=Path)
    validate_package_parser.add_argument("--proxy", required=True, type=Path)
    validate_package_parser.add_argument("--sync-map", required=True, type=Path)
    validate_package_parser.add_argument("--sync-report", type=Path)
    validate_package_parser.add_argument(
        "--duration-tolerance-ms",
        default=DEFAULT_EPISODE_VALIDATION_TOLERANCE_MS,
        type=int,
        help=(
            "Warn when proxy/Sync Map durations differ from the manifest by "
            "more than this many milliseconds. Default: 1500."
        ),
    )
    validate_package_parser.add_argument(
        "--json",
        action="store_true",
        help="Print a machine-readable JSON package validation report.",
    )
    validate_package_parser.set_defaults(handler=run_validate_generated_package)

    agent_review_parser = subparsers.add_parser(
        "agent-review-edit",
        help="Review a Studio Cut decision file and emit agent-friendly editing diagnostics.",
    )
    agent_review_parser.add_argument("--manifest", required=True, type=Path)
    agent_review_parser.add_argument("--decisions", required=True, type=Path)
    agent_review_parser.add_argument(
        "--transcript",
        type=Path,
        help=(
            "Optional timed transcript JSON. Adds speaker/state and clip-reference "
            "diagnostics to the agent review report."
        ),
    )
    agent_review_parser.add_argument(
        "--profile",
        default="youtube_16x9",
        choices=sorted(SUPPORTED_PROFILES),
        help="Render profile used for segment/layout diagnostics. Default: youtube_16x9.",
    )
    agent_review_parser.add_argument(
        "--out",
        type=Path,
        help="Optional path to write the machine-readable review report JSON.",
    )
    agent_review_parser.add_argument(
        "--out-ops",
        type=Path,
        help="Optional path to write suggested agent decision operations JSON.",
    )
    agent_review_parser.add_argument(
        "--json",
        action="store_true",
        help="Print only the machine-readable review report JSON.",
    )
    agent_review_parser.set_defaults(handler=run_agent_review_edit)

    agent_ops_parser = subparsers.add_parser(
        "apply-decision-ops",
        help="Apply a transparent agent decision-operation JSON file to a decision export.",
    )
    agent_ops_parser.add_argument("--manifest", required=True, type=Path)
    agent_ops_parser.add_argument("--decisions", required=True, type=Path)
    agent_ops_parser.add_argument("--ops", required=True, type=Path)
    agent_ops_parser.add_argument("--out", required=True, type=Path)
    agent_ops_parser.add_argument(
        "--created-by",
        default="codex-agent",
        help="Attribution used for generated decisions and tombstones. Default: codex-agent.",
    )
    agent_ops_parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate and preview operations without writing --out.",
    )
    agent_ops_parser.set_defaults(handler=run_apply_decision_ops)

    agent_session_parser = subparsers.add_parser(
        "agent-edit-session",
        help=(
            "Run a one-command agent editing review for a local Rescue Sync "
            "episode workspace."
        ),
    )
    agent_session_parser.add_argument("--episode-dir", required=True, type=Path)
    agent_session_parser.add_argument(
        "--episode-id",
        help="Optional episode id override. Defaults to manifest/project id when available.",
    )
    agent_session_parser.add_argument(
        "--transcript",
        type=Path,
        help=(
            "Optional timed transcript JSON. Defaults to common edit/ or "
            "generated/ transcript file names when present."
        ),
    )
    agent_session_parser.add_argument(
        "--profile",
        default="youtube_16x9",
        choices=sorted(SUPPORTED_PROFILES),
        help="Render profile used for diagnostics. Default: youtube_16x9.",
    )
    agent_session_parser.add_argument(
        "--created-by",
        default="codex-agent",
        help="Attribution used when previewing suggested operations.",
    )
    agent_session_parser.add_argument(
        "--out-dir",
        type=Path,
        help="Output directory for agent review artifacts. Default: <episode-dir>/generated.",
    )
    agent_session_parser.add_argument(
        "--write-preview-decisions",
        action="store_true",
        help=(
            "Write a non-mutating preview decision JSON after applying suggested "
            "operations to a copy of the current decisions."
        ),
    )
    agent_session_parser.add_argument(
        "--json",
        action="store_true",
        help="Print the machine-readable session report JSON.",
    )
    agent_session_parser.set_defaults(handler=run_agent_edit_session)

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


def execute_agent_smoke_test(
    *, workdir: Path, workdir_kept: bool, skip_render: bool
) -> dict[str, Any]:
    workdir = workdir.resolve()
    source_duration_ms = AGENT_SMOKE_SOURCE_DURATION_MS
    expected_cut_duration_ms = AGENT_SMOKE_EXPECTED_CUT_DURATION_MS
    expected_output_duration_ms = AGENT_SMOKE_EXPECTED_ACTIVE_DURATION_MS
    commands_run: list[str] = []
    warnings: list[str] = []
    errors: list[str] = []
    golden_assertion_failures: list[str] = []
    generated_files: dict[str, str] = {}
    script_path = Path(__file__).resolve()
    ffmpeg_path = shutil.which("ffmpeg")
    ffprobe_path = shutil.which("ffprobe")
    media_dir = workdir / "media"
    output_dir = workdir / "output"
    manifest_path = workdir / "episode-manifest.synthetic.json"
    decisions_path = workdir / "studio-cut-decisions.synthetic.json"
    media_map_path = workdir / "synthetic-media-map.json"
    sync_map_path = workdir / "sync-map.synthetic.json"
    sync_map_media_map_path = workdir / "sync-map-media-map.synthetic.json"
    rescue_session_dir = workdir / "rescue-sync-session"
    render_plan_path = output_dir / "render-plan.youtube-16x9.json"
    output_path = output_dir / "studio-cut-agent-smoke-output.mp4"
    sync_map_output_path = output_dir / "studio-cut-agent-smoke-sync-map-output.mp4"
    sync_map_render_qa_path = output_dir / "sync-map-render-qa.json"
    rescue_session_render_qa_path = (
        rescue_session_dir / "renders" / "studio-cut-agent-smoke-render-qa.json"
    )

    report: dict[str, Any] = {
        "status": "fail",
        "workdir": str(workdir),
        "workdirKept": workdir_kept,
        "generatedFiles": generated_files,
        "sourceDurationMs": source_duration_ms,
        "expectedCutDurationMs": expected_cut_duration_ms,
        "expectedActiveDurationMs": expected_output_duration_ms,
        "expectedOutputDurationMs": expected_output_duration_ms,
        "actualOutputDurationMs": None,
        "outputPath": str(output_path),
        "syncMapOutputPath": str(sync_map_output_path),
        "commandsRun": commands_run,
        "warnings": warnings,
        "errors": errors,
        "goldenAssertionsPassed": False,
        "goldenAssertionCount": 0,
        "goldenAssertionFailures": golden_assertion_failures,
    }

    try:
        workdir.mkdir(parents=True, exist_ok=True)
        media_dir.mkdir(parents=True, exist_ok=True)
        output_dir.mkdir(parents=True, exist_ok=True)

        record_agent_doctor_checks(
            report=report,
            workdir=workdir,
            ffmpeg_path=ffmpeg_path,
            ffprobe_path=ffprobe_path,
        )

        if not ffmpeg_path:
            if skip_render:
                warnings.append(
                    "ffmpeg is not available; generated JSON workflow only because --skip-render was set."
                )
            else:
                raise StudioCutCliError("ffmpeg is required for agent-smoke-test rendering")

        media_paths = {
            "homer": media_dir / "homer.synthetic.mp4",
            "charlie": media_dir / "charlie.synthetic.mp4",
            "clip": media_dir / "clip.synthetic.mp4",
            "programAudio": media_dir / "program.synthetic.wav",
        }

        if ffmpeg_path:
            generate_agent_smoke_media(
                ffmpeg_path=ffmpeg_path,
                media_paths=media_paths,
                duration_ms=source_duration_ms,
                commands_run=commands_run,
            )

        manifest = build_agent_smoke_manifest(source_duration_ms)
        decisions = build_agent_smoke_decisions()
        media_map = build_agent_smoke_media_map(
            manifest_id=manifest["id"],
            media_paths=media_paths,
        )
        sync_map = build_agent_smoke_sync_map(
            manifest_id=manifest["id"],
            duration_ms=source_duration_ms,
        )
        sync_map_media_map = build_agent_smoke_sync_map_media_map(
            manifest_id=manifest["id"],
            media_paths=media_paths,
        )
        write_json(manifest_path, manifest)
        write_json(decisions_path, decisions)
        write_json(media_map_path, media_map)
        write_json(sync_map_path, sync_map)
        write_json(sync_map_media_map_path, sync_map_media_map)

        generated_files.update(
            {
                "manifest": str(manifest_path),
                "decisions": str(decisions_path),
                "mediaMap": str(media_map_path),
                "syncMap": str(sync_map_path),
                "syncMapMediaMap": str(sync_map_media_map_path),
                "rescueSession": str(rescue_session_dir),
                "renderPlan": str(render_plan_path),
            }
        )

        if ffmpeg_path:
            generated_files.update(
                {
                    "homerVideo": str(media_paths["homer"]),
                    "charlieVideo": str(media_paths["charlie"]),
                    "clipVideo": str(media_paths["clip"]),
                    "programAudio": str(media_paths["programAudio"]),
                }
            )

            run_command_capture(
                [
                    sys.executable,
                    str(script_path),
                    "validate-episode-files",
                    "--manifest",
                    str(manifest_path),
                    "--media-map",
                    str(media_map_path),
                    "--decisions",
                    str(decisions_path),
                ],
                "agent smoke validate-episode-files",
                commands_run,
            )

        run_command_capture(
            [
                sys.executable,
                str(script_path),
                "plan-render",
                "--manifest",
                str(manifest_path),
                "--decisions",
                str(decisions_path),
                "--profile",
                "youtube_16x9",
                "--out",
                str(render_plan_path),
            ],
            "agent smoke plan-render",
            commands_run,
        )

        if not render_plan_path.is_file():
            errors.append(f"render plan JSON was not written: {render_plan_path}")
        else:
            golden_result = assert_agent_smoke_golden_plan(render_plan_path)
            report["goldenAssertionCount"] = golden_result["count"]
            golden_assertion_failures.extend(golden_result["failures"])
            report["goldenAssertionsPassed"] = not golden_assertion_failures

            if golden_assertion_failures:
                errors.extend(
                    f"golden assertion failed: {failure}"
                    for failure in golden_assertion_failures
                )

        if not skip_render:
            run_command_capture(
                [
                    sys.executable,
                    str(script_path),
                    "render-youtube-16x9-aligned",
                    "--manifest",
                    str(manifest_path),
                    "--decisions",
                    str(decisions_path),
                    "--media-map",
                    str(media_map_path),
                    "--out",
                    str(output_path),
                ],
                "agent smoke render-youtube-16x9-aligned",
                commands_run,
            )
            generated_files["output"] = str(output_path)
            validate_agent_smoke_output(
                output_path=output_path,
                ffprobe_path=ffprobe_path,
                source_duration_ms=source_duration_ms,
                expected_output_duration_ms=expected_output_duration_ms,
                report=report,
            )
            run_command_capture(
                [
                    sys.executable,
                    str(script_path),
                    "render-from-sync-map",
                    "--sync-map",
                    str(sync_map_path),
                    "--decisions",
                    str(decisions_path),
                    "--media-map",
                    str(sync_map_media_map_path),
                    "--out",
                    str(sync_map_output_path),
                    "--out-qa",
                    str(sync_map_render_qa_path),
                ],
                "agent smoke render-from-sync-map",
                commands_run,
            )
            generated_files["syncMapOutput"] = str(sync_map_output_path)
            generated_files["syncMapRenderQa"] = str(sync_map_render_qa_path)
            validate_agent_smoke_output(
                output_path=sync_map_output_path,
                ffprobe_path=ffprobe_path,
                source_duration_ms=source_duration_ms,
                expected_output_duration_ms=expected_output_duration_ms,
                report=report,
            )
            validate_agent_smoke_sync_map_render_qa(
                qa_path=sync_map_render_qa_path,
                report=report,
            )
            write_agent_smoke_rescue_sync_session(
                session_dir=rescue_session_dir,
                manifest=manifest,
                decisions_path=decisions_path,
                sync_map_path=sync_map_path,
                sync_map_media_map_path=sync_map_media_map_path,
            )
            run_command_capture(
                [
                    sys.executable,
                    str(script_path),
                    "render-rescue-sync-session",
                    "--episode-dir",
                    str(rescue_session_dir),
                    "--dry-run",
                ],
                "agent smoke render-rescue-sync-session dry run",
                commands_run,
            )
            generated_files["rescueSessionRenderQa"] = str(rescue_session_render_qa_path)
            validate_agent_smoke_sync_map_render_qa(
                qa_path=rescue_session_render_qa_path,
                report=report,
            )
        else:
            warnings.append("--skip-render set; output MP4 validation was skipped.")

    except StudioCutCliError as error:
        errors.append(str(error))
    except Exception as error:  # pragma: no cover - safety net for CLI reports.
        errors.append(f"unexpected agent smoke failure: {error}")

    report["status"] = "fail" if errors else "pass"
    return report


def record_agent_doctor_checks(
    *,
    report: dict[str, Any],
    workdir: Path,
    ffmpeg_path: str | None,
    ffprobe_path: str | None,
) -> None:
    doctor = {
        "python": sys.version.split()[0],
        "pythonOk": sys.version_info >= MINIMUM_PYTHON,
        "ffmpegPath": ffmpeg_path,
        "ffprobePath": ffprobe_path,
        "workdirReadable": workdir.exists() and os.access(workdir, os.R_OK),
        "workdirWritable": check_write_access(workdir),
    }
    report["doctor"] = doctor

    if not doctor["pythonOk"]:
        report["errors"].append(
            f"Python {MINIMUM_PYTHON[0]}.{MINIMUM_PYTHON[1]}+ is required"
        )

    if not doctor["workdirReadable"]:
        report["errors"].append(f"workdir is not readable: {workdir}")

    if not doctor["workdirWritable"]:
        report["errors"].append(f"workdir is not writable: {workdir}")

    if not ffmpeg_path:
        report["warnings"].append("ffmpeg not found on PATH")

    if not ffprobe_path:
        report["warnings"].append("ffprobe not found on PATH; output inspection limited")


def generate_agent_smoke_media(
    *,
    ffmpeg_path: str,
    media_paths: dict[str, Path],
    duration_ms: int,
    commands_run: list[str],
) -> None:
    duration_seconds = duration_ms / 1000
    video_specs = {
        "homer": "color=c=green:s=640x360:r=24",
        "charlie": "color=c=blue:s=640x360:r=24",
        "clip": "testsrc2=s=640x360:r=24",
    }

    for role, source in video_specs.items():
        run_command_capture(
            [
                ffmpeg_path,
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-f",
                "lavfi",
                "-i",
                f"{source}:d={format_seconds(duration_seconds)}",
                "-pix_fmt",
                "yuv420p",
                str(media_paths[role]),
            ],
            f"agent smoke generate {role} video",
            commands_run,
        )

    run_command_capture(
        [
            ffmpeg_path,
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            f"sine=frequency=440:duration={format_seconds(duration_seconds)}:sample_rate=48000",
            str(media_paths["programAudio"]),
        ],
        "agent smoke generate program audio",
        commands_run,
    )


def build_agent_smoke_manifest(duration_ms: int) -> dict[str, Any]:
    return {
        "id": "studio-cut-agent-smoke",
        "title": "Studio Cut Agent Smoke",
        "durationMs": duration_ms,
        "sources": {
            "homer": {"role": "homer", "label": "Synthetic Homer"},
            "charlie": {"role": "charlie", "label": "Synthetic Charlie"},
            "clip": {"role": "clip", "label": "Synthetic Clip"},
            "program": {"role": "program", "label": "Synthetic Program"},
        },
        "sourceMonitorProxy": {
            "localPlaceholderPath": "./media/source-monitor.synthetic.mp4",
            "panes": {
                "homer": {"x": 0, "y": 0, "width": 0.5, "height": 0.5},
                "charlie": {"x": 0.5, "y": 0, "width": 0.5, "height": 0.5},
                "clip": {"x": 0, "y": 0.5, "width": 0.5, "height": 0.5},
            },
        },
        "syncBootstrap": {
            "source": "premiere",
            "notes": "Synthetic canary. Media is generated locally by the CLI.",
        },
    }


def build_agent_smoke_decisions() -> dict[str, Any]:
    base = {
        "projectId": "studio-cut-agent-smoke",
        "branchId": "local-main",
        "createdBy": "agent-smoke-test",
    }
    decision_specs = [
        ("agent-smoke-001", 0, "both", "Open with both hosts."),
        ("agent-smoke-002", 2000, "charlie", "Cut to Charlie."),
        ("agent-smoke-003", 4000, "cut", "Skip this inactive span."),
        ("agent-smoke-004", 6000, "homer", "Return on Homer."),
        ("agent-smoke-005", 8000, "charlie_clip", "Charlie plus clip."),
        ("agent-smoke-006", 10000, "both_clip", "Both hosts plus clip."),
    ]

    return {
        "schemaVersion": 1,
        "exportedAt": "2026-05-21T00:00:00.000Z",
        "projectId": base["projectId"],
        "branchId": base["branchId"],
        "decisionEvents": [
            {
                "id": event_id,
                **base,
                "sourceTimeMs": source_time_ms,
                "state": state,
                "createdAt": f"2026-05-21T00:00:{index:02d}.000Z",
                "note": note,
            }
            for index, (event_id, source_time_ms, state, note) in enumerate(
                decision_specs
            )
        ],
    }


def build_agent_smoke_media_map(
    *, manifest_id: str, media_paths: dict[str, Path]
) -> dict[str, Any]:
    return {
        "schemaVersion": 1,
        "episodeId": manifest_id,
        "timelineAligned": True,
        "video": {
            "homer": str(media_paths["homer"]),
            "charlie": str(media_paths["charlie"]),
            "clip": str(media_paths["clip"]),
        },
        "audio": {"program": str(media_paths["programAudio"])},
    }


def build_agent_smoke_sync_map(*, manifest_id: str, duration_ms: int) -> dict[str, Any]:
    generated_at = "2026-05-21T00:00:00.000Z"
    asset_specs = [
        ("agent-smoke-homer-video", "homerVideo", "homer.synthetic.mp4", 1000),
        ("agent-smoke-charlie-video", "charlieVideo", "charlie.synthetic.mp4", 0),
        ("agent-smoke-clip-video", "clipVideo", "clip.synthetic.mp4", 500),
        ("agent-smoke-homer-audio", "homerAudio", "homer.synthetic.wav", 0),
        ("agent-smoke-charlie-audio", "charlieAudio", "charlie.synthetic.wav", 0),
    ]

    return {
        "syncMapId": "studio-cut-agent-smoke-sync-map-v1",
        "syncJobId": "studio-cut-agent-smoke-sync-job",
        "projectId": manifest_id,
        "branchId": "local-main",
        "createdAt": generated_at,
        "updatedAt": generated_at,
        "canonicalTimeline": {
            "durationMs": duration_ms,
            "timebase": "milliseconds",
            "referenceRole": "phoneReferenceAudio",
        },
        "assets": [
            {
                "assetId": input_id,
                "inputId": input_id,
                "role": role,
                "fileName": file_name,
                "timelineStartMs": timeline_start_ms,
                "assetStartMs": 0,
                "durationMs": duration_ms,
                "estimatedOffsetMs": timeline_start_ms,
                "confidence": 1,
                "warnings": [],
            }
            for input_id, role, file_name, timeline_start_ms in asset_specs
        ],
        "referenceRail": {
            "syncJobId": "studio-cut-agent-smoke-sync-job",
            "referenceRole": "phoneReferenceAudio",
            "segments": [
                {
                    "inputId": "agent-smoke-reference-audio",
                    "fileName": "reference.synthetic.wav",
                    "railStartMs": 0,
                    "sourceStartMs": 0,
                    "durationMs": duration_ms,
                    "confidence": 1,
                    "warnings": [],
                }
            ],
            "totalDurationMs": duration_ms,
            "warnings": [],
        },
        "globalWarnings": [
            "Synthetic Sync Map for local agent smoke testing.",
            "Local filesystem paths are intentionally omitted from Sync Map metadata.",
        ],
    }


def build_agent_smoke_sync_map_media_map(
    *, manifest_id: str, media_paths: dict[str, Path]
) -> dict[str, Any]:
    return {
        "schemaVersion": 1,
        "episodeId": manifest_id,
        "timelineAligned": False,
        "inputs": {
            "agent-smoke-homer-video": str(media_paths["homer"]),
            "agent-smoke-charlie-video": str(media_paths["charlie"]),
            "agent-smoke-clip-video": str(media_paths["clip"]),
            "agent-smoke-homer-audio": str(media_paths["programAudio"]),
            "agent-smoke-charlie-audio": str(media_paths["programAudio"]),
        },
        "audio": {},
    }


def write_agent_smoke_rescue_sync_session(
    *,
    session_dir: Path,
    manifest: dict[str, Any],
    decisions_path: Path,
    sync_map_path: Path,
    sync_map_media_map_path: Path,
) -> None:
    episode_id = str(manifest["id"])
    generated_dir = session_dir / "generated"
    edit_dir = session_dir / "edit"
    renders_dir = session_dir / "renders"
    inbox_dir = session_dir / "inbox"

    for directory in (generated_dir, edit_dir, renders_dir, inbox_dir):
        directory.mkdir(parents=True, exist_ok=True)

    write_json(generated_dir / "episode-manifest.json", manifest)
    shutil.copyfile(sync_map_path, generated_dir / "sync-map.json")
    shutil.copyfile(sync_map_media_map_path, generated_dir / "local-media-map.json")
    shutil.copyfile(decisions_path, edit_dir / f"{episode_id}-decisions.json")


def assert_agent_smoke_golden_plan(render_plan_path: Path) -> dict[str, Any]:
    assertion_count = 0
    failures: list[str] = []

    def expect_equal(label: str, actual: Any, expected: Any) -> None:
        nonlocal assertion_count
        assertion_count += 1

        if actual != expected:
            failures.append(f"{label}: expected {expected!r}, got {actual!r}")

    def expect_true(label: str, condition: bool) -> None:
        nonlocal assertion_count
        assertion_count += 1

        if not condition:
            failures.append(label)

    try:
        plan = json.loads(render_plan_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        return {
            "count": 1,
            "failures": [f"could not read render plan JSON: {error}"],
        }

    plan_object = plan if isinstance(plan, dict) else {}
    summary = plan_object.get("summary")
    active_segments = plan_object.get("activeSegments")
    cut_segments = plan_object.get("cutSegments")

    expect_true("render plan is an object", isinstance(plan, dict))
    expect_true("render plan summary is an object", isinstance(summary, dict))
    expect_true(
        "render plan activeSegments is a list",
        isinstance(active_segments, list),
    )
    expect_true("render plan cutSegments is a list", isinstance(cut_segments, list))

    if not isinstance(summary, dict):
        summary = {}

    if not isinstance(active_segments, list):
        active_segments = []

    if not isinstance(cut_segments, list):
        cut_segments = []

    expect_equal("profile", plan_object.get("profile"), "youtube_16x9")
    expect_equal(
        "summary.sourceDurationMs",
        summary.get("sourceDurationMs"),
        AGENT_SMOKE_SOURCE_DURATION_MS,
    )
    expect_equal(
        "summary.cutDurationMs",
        summary.get("cutDurationMs"),
        AGENT_SMOKE_EXPECTED_CUT_DURATION_MS,
    )
    expect_equal(
        "summary.activeDurationMs",
        summary.get("activeDurationMs"),
        AGENT_SMOKE_EXPECTED_ACTIVE_DURATION_MS,
    )
    expect_equal(
        "summary.activeSegmentCount",
        summary.get("activeSegmentCount"),
        len(AGENT_SMOKE_EXPECTED_ACTIVE_STATES),
    )
    expect_equal(
        "summary.cutSegmentCount",
        summary.get("cutSegmentCount"),
        AGENT_SMOKE_EXPECTED_CUT_SEGMENT_COUNT,
    )

    active_states = [
        segment.get("programState", segment.get("state"))
        for segment in active_segments
        if isinstance(segment, dict)
    ]
    expect_equal(
        "active segment state order",
        active_states,
        AGENT_SMOKE_EXPECTED_ACTIVE_STATES,
    )
    expect_true("no active segment has state cut", "cut" not in active_states)

    for index, segment in enumerate(active_segments):
        label = f"active segment {index}"

        if not isinstance(segment, dict):
            expect_true(f"{label} is an object", False)
            continue

        state = segment.get("programState", segment.get("state"))
        profile_plan = segment.get("profilePlan")
        layout_behavior = segment.get("layoutBehavior")
        expected_behavior = AGENT_SMOKE_EXPECTED_YOUTUBE_16X9_BEHAVIORS.get(state)

        expect_true(f"{label} has profilePlan object", isinstance(profile_plan, dict))
        expect_true(
            f"{label} has layoutBehavior string",
            isinstance(layout_behavior, str) and bool(layout_behavior.strip()),
        )
        expect_equal(f"{label} layoutBehavior", layout_behavior, expected_behavior)

        if isinstance(profile_plan, dict):
            expect_equal(
                f"{label} profilePlan.profile",
                profile_plan.get("profile"),
                "youtube_16x9",
            )
            expect_equal(f"{label} profilePlan.state", profile_plan.get("state"), state)
            expect_equal(
                f"{label} profilePlan.behavior",
                profile_plan.get("behavior"),
                expected_behavior,
            )

    for index, segment in enumerate(cut_segments):
        label = f"cut segment {index}"

        if not isinstance(segment, dict):
            expect_true(f"{label} is an object", False)
            continue

        profile_plan = segment.get("profilePlan")
        expect_equal(f"{label} state", segment.get("programState"), "cut")
        expect_equal(
            f"{label} layoutBehavior",
            segment.get("layoutBehavior"),
            AGENT_SMOKE_EXPECTED_YOUTUBE_16X9_BEHAVIORS["cut"],
        )

        if isinstance(profile_plan, dict):
            expect_equal(
                f"{label} profilePlan.behavior",
                profile_plan.get("behavior"),
                AGENT_SMOKE_EXPECTED_YOUTUBE_16X9_BEHAVIORS["cut"],
            )
        else:
            expect_true(f"{label} has profilePlan object", False)

    return {"count": assertion_count, "failures": failures}


def build_episode_bootstrap_manifest(
    *, episode_id: str, title: str, duration_ms: int, include_clip: bool
) -> dict[str, Any]:
    sources = {
        "homer": {
            "role": "homer",
            "label": f"{title} Homer aligned source",
            "fileName": f"{episode_id}_homer_aligned.mp4",
            "notes": "Timeline-aligned export from Premiere. Replace placeholder names locally only.",
        },
        "charlie": {
            "role": "charlie",
            "label": f"{title} Charlie aligned source",
            "fileName": f"{episode_id}_charlie_aligned.mp4",
            "notes": "Timeline-aligned export from Premiere. Replace placeholder names locally only.",
        },
        "program": {
            "role": "program",
            "label": f"{title} program reference",
            "fileName": f"{episode_id}_source-monitor-proxy.mp4",
            "notes": "Source-monitor proxy for local browser playback and review.",
        },
    }
    panes = {
        "homer": {"x": 0, "y": 0, "width": 0.5, "height": 0.5},
        "charlie": {"x": 0.5, "y": 0, "width": 0.5, "height": 0.5},
    }

    if include_clip:
        sources["clip"] = {
            "role": "clip",
            "label": f"{title} shared clip source",
            "fileName": f"{episode_id}_clip_aligned.mp4",
            "notes": "Optional timeline-aligned Clip export from Premiere.",
        }
        panes["clip"] = {"x": 0, "y": 0.5, "width": 0.5, "height": 0.5}

    return {
        "id": episode_id,
        "title": title,
        "durationMs": duration_ms,
        "sources": sources,
        "sourceMonitorProxy": {
            "localPlaceholderPath": f"./{episode_id}_source-monitor-proxy.mp4",
            "panes": panes,
        },
        "syncBootstrap": {
            "source": "premiere",
            "xmlFileName": f"{episode_id}_premiere-export.xml",
            "notes": "Premiere owns sync for tonight. Export timeline-aligned local media and keep real paths out of git.",
        },
    }


def build_episode_bootstrap_media_map(
    *, episode_id: str, include_clip: bool
) -> dict[str, Any]:
    video = {
        "homer": "REPLACE_WITH_HOMER_ALIGNED_PATH",
        "charlie": "REPLACE_WITH_CHARLIE_ALIGNED_PATH",
    }

    if include_clip:
        video["clip"] = "REPLACE_WITH_CLIP_ALIGNED_PATH"

    return {
        "schemaVersion": 1,
        "episodeId": episode_id,
        "timelineAligned": True,
        "video": video,
        "audio": {
            "program": "REPLACE_WITH_PROGRAM_AUDIO_PATH",
        },
    }


def build_episode_bootstrap_readme(
    *,
    episode_id: str,
    title: str,
    duration_ms: int,
    include_clip: bool,
    manifest_path: Path,
    media_map_path: Path,
) -> str:
    decisions_path = manifest_path.parent / f"{episode_id}-decisions.json"
    output_path = manifest_path.parent / f"{episode_id}-youtube-16x9.mp4"
    clip_note = (
        "- `REPLACE_WITH_CLIP_ALIGNED_PATH` with the local Clip aligned media path.\n"
        if include_clip
        else ""
    )

    return f"""# Studio Cut Bootstrap: {title}

This directory was generated by `create-episode-bootstrap`.

Do not commit real local media paths, proxy media, full-res media, rendered
outputs, private episode details, credentials, or generated caches.

## Files

- Manifest: `{manifest_path.name}`
- Local media map: `{media_map_path.name}`

Episode id: `{episode_id}`
Duration: `{duration_ms}` ms / `{format_time_ms(duration_ms)}`
Clip source included: `{"true" if include_clip else "false"}`

## Before You Render

- Confirm Premiere exported timeline-aligned media that all starts at sequence
  time `00:00:00`.
- Confirm Homer, Charlie, optional Clip, and program audio files share the same
  duration as the manifest within normal encoder rounding.
- Import `{manifest_path.name}` in Studio Cut and load the local source-monitor
  proxy from this machine.
- Export Studio Cut decisions as `{decisions_path}` or update the commands
  below with the real download path.
- Keep this directory under ignored local output, such as
  `tools/studio-cut-local/output/`, or in `/tmp`.

## Fill In Local Paths

Open `{media_map_path.name}` and replace:

- `REPLACE_WITH_HOMER_ALIGNED_PATH` with the local Homer aligned media path.
- `REPLACE_WITH_CHARLIE_ALIGNED_PATH` with the local Charlie aligned media path.
{clip_note}- `REPLACE_WITH_PROGRAM_AUDIO_PATH` with the local program audio path.

The aligned media files should be exported from Premiere so every file starts at
sequence time `00:00:00` and shares the same duration.

## Validate Files

```bash
python tools/studio-cut-local/studio_cut_local.py validate-episode-files \\
  --manifest {manifest_path} \\
  --media-map {media_map_path}
```

After exporting decisions from Studio Cut, rerun validation with render
readiness checks:

```bash
python tools/studio-cut-local/studio_cut_local.py validate-episode-files \\
  --manifest {manifest_path} \\
  --media-map {media_map_path} \\
  --decisions {decisions_path}
```

The readiness report should say `Status: READY` before rendering and will print
the exact rough 16:9 render command.

## Studio Cut Web

1. Open Studio Cut.
2. Import `{manifest_path.name}`.
3. Load the local source-monitor proxy video from this machine.
4. Tag decisions.
5. Export decision JSON as `{decisions_path}` or adjust the command below.

## Dry Run

```bash
python tools/studio-cut-local/studio_cut_local.py render-youtube-16x9-aligned \\
  --manifest {manifest_path} \\
  --decisions {decisions_path} \\
  --media-map {media_map_path} \\
  --out {output_path} \\
  --dry-run
```

## Render

```bash
python tools/studio-cut-local/studio_cut_local.py render-youtube-16x9-aligned \\
  --manifest {manifest_path} \\
  --decisions {decisions_path} \\
  --media-map {media_map_path} \\
  --out {output_path}
```
"""


def build_rescue_sync_session(
    *,
    episode_id: str,
    title: str,
    branch_id: str,
    created_by: str,
    episode_dir: Path,
    include_clip: bool,
) -> dict[str, Any]:
    inbox_dir = episode_dir / "inbox"
    generated_dir = episode_dir / "generated"
    edit_dir = episode_dir / "edit"
    checkpoints_dir = edit_dir / "checkpoints"
    renders_dir = episode_dir / "renders"
    sync_job_id = f"{episode_id}-rescue-sync-local"
    now = dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")
    role_matches = scan_rescue_sync_inbox(inbox_dir, include_clip=include_clip)
    uploaded_inputs: list[dict[str, Any]] = []
    local_media_inputs: dict[str, str] = {}
    warnings: list[str] = []

    for role, matches in role_matches.items():
        spec = RESCUE_SYNC_ROLE_SPECS[role]
        if not matches:
            continue

        if not spec.get("multi") and len(matches) > 1:
            warnings.append(
                f"Multiple {spec['label']} files matched; using {matches[0].name}."
            )
            matches = matches[:1]

        for index, media_path in enumerate(matches):
            input_id = build_rescue_sync_input_id(episode_id, role, index)
            uploaded_inputs.append(
                build_rescue_sync_uploaded_input(
                    sync_job_id=sync_job_id,
                    input_id=input_id,
                    role=role,
                    media_path=media_path,
                    uploaded_at=now,
                    order_index=index if role == "phoneReferenceAudio" else None,
                )
            )
            local_media_inputs[input_id] = os.path.relpath(media_path, generated_dir)

    expected_inputs = {
        "homerVideo": True,
        "charlieVideo": True,
        "homerAudio": True,
        "charlieAudio": True,
        "phoneReferenceAudio": True,
        "clipVideo": include_clip,
    }
    missing_required_roles = [
        role
        for role, spec in RESCUE_SYNC_ROLE_SPECS.items()
        if spec["required"] and not role_matches.get(role)
    ]

    sync_job = {
        "syncJobId": sync_job_id,
        "projectId": episode_id,
        "branchId": branch_id,
        "title": title,
        "createdBy": created_by,
        "createdAt": now,
        "updatedAt": now,
        "status": "uploaded" if not missing_required_roles else "draft",
        "expectedInputs": expected_inputs,
        "uploadedInputs": uploaded_inputs,
        "outputs": {
            "manifestStoragePath": f"studioCutSyncJobs/{sync_job_id}/outputs/episode-manifest.json",
            "sourceMonitorProxyStoragePath": f"studioCutSyncJobs/{sync_job_id}/outputs/source-monitor-proxy.mp4",
            "syncReportStoragePath": f"studioCutSyncJobs/{sync_job_id}/outputs/sync-report.json",
            "syncMapStoragePath": f"studioCutSyncJobs/{sync_job_id}/outputs/sync-map.json",
            "sharedRoomUrl": f"https://high-ground-odyssey.web.app/?projectId={episode_id}&branchId={branch_id}",
        },
        "syncReportSummary": {
            "confidence": 0,
            "warnings": [
                "Local Rescue Sync session metadata. Run the worker to produce the real report."
            ],
            "offsets": {},
        },
    }
    local_media_map = {
        "schemaVersion": 1,
        "episodeId": episode_id,
        "inputs": local_media_inputs,
    }

    return {
        "episodeId": episode_id,
        "title": title,
        "branchId": branch_id,
        "createdBy": created_by,
        "includeClip": include_clip,
        "episodeDir": episode_dir,
        "inboxDir": inbox_dir,
        "generatedDir": generated_dir,
        "editDir": edit_dir,
        "checkpointsDir": checkpoints_dir,
        "rendersDir": renders_dir,
        "syncJobId": sync_job_id,
        "syncJobPath": generated_dir / "sync-job.json",
        "localMediaMapPath": generated_dir / "local-media-map.json",
        "syncReportPath": generated_dir / "sync-report.json",
        "syncMapPath": generated_dir / "sync-map.json",
        "sourceMonitorProxyPath": generated_dir / "source-monitor-proxy.mp4",
        "manifestPath": generated_dir / "episode-manifest.json",
        "alignedProxyDir": generated_dir / "aligned-proxies",
        "workDir": generated_dir / "work",
        "readmePath": episode_dir / "README.md",
        "roleMatches": role_matches,
        "missingRequiredRoles": missing_required_roles,
        "warnings": warnings,
        "syncJob": sync_job,
        "localMediaMap": local_media_map,
    }


def scan_rescue_sync_inbox(
    inbox_dir: Path, *, include_clip: bool
) -> dict[str, list[Path]]:
    role_matches: dict[str, list[Path]] = {}
    files = [
        path
        for path in sorted(inbox_dir.glob("*"))
        if path.is_file() and path.suffix.lower() in MEDIA_EXTENSIONS
    ]

    for role, spec in RESCUE_SYNC_ROLE_SPECS.items():
        if role == "clipVideo" and not include_clip:
            role_matches[role] = []
            continue

        kind = str(spec["kind"])
        prefixes = [str(prefix) for prefix in spec["prefixes"]]
        matches = [
            path
            for path in files
            if media_file_matches_role(path, kind=kind, prefixes=prefixes)
        ]
        role_matches[role] = sorted(matches, key=lambda path: normalized_file_stem(path))

    return role_matches


def media_file_matches_role(path: Path, *, kind: str, prefixes: list[str]) -> bool:
    suffix = path.suffix.lower()
    if kind == "video" and suffix not in VIDEO_EXTENSIONS:
        return False
    if kind == "audio" and suffix not in AUDIO_EXTENSIONS:
        return False

    stem = normalized_file_stem(path)
    return any(stem == prefix or stem.startswith(f"{prefix}-") for prefix in prefixes)


def normalized_file_stem(path: Path) -> str:
    return (
        path.stem.lower()
        .replace("_", "-")
        .replace(" ", "-")
        .replace(".", "-")
    )


def build_rescue_sync_input_id(episode_id: str, role: str, index: int) -> str:
    role_slug = camel_to_kebab(role)
    if role == "phoneReferenceAudio":
        return f"{episode_id}-{role_slug}-{index + 1:02d}"
    return f"{episode_id}-{role_slug}"


def build_rescue_sync_uploaded_input(
    *,
    sync_job_id: str,
    input_id: str,
    role: str,
    media_path: Path,
    uploaded_at: str,
    order_index: int | None,
) -> dict[str, Any]:
    entry: dict[str, Any] = {
        "inputId": input_id,
        "role": role,
        "storagePath": (
            f"studioCutSyncJobs/{sync_job_id}/uploads/"
            f"{role}/{safe_file_part(input_id)}-{safe_file_part(media_path.name)}"
        ),
        "fileName": media_path.name,
        "contentType": guess_media_content_type(media_path),
        "sizeBytes": media_path.stat().st_size if media_path.exists() else 0,
        "uploadedAt": uploaded_at,
    }

    if order_index is not None:
        entry["orderIndex"] = order_index
        entry["notes"] = "Ordered phone/reference piece from local episode inbox."

    return entry


def guess_media_content_type(path: Path) -> str:
    suffix = path.suffix.lower()
    return {
        ".mp4": "video/mp4",
        ".m4v": "video/x-m4v",
        ".mov": "video/quicktime",
        ".mkv": "video/x-matroska",
        ".webm": "video/webm",
        ".wav": "audio/wav",
        ".m4a": "audio/mp4",
        ".mp3": "audio/mpeg",
        ".aac": "audio/aac",
        ".aiff": "audio/aiff",
        ".aif": "audio/aiff",
        ".flac": "audio/flac",
    }.get(suffix, "application/octet-stream")


def print_rescue_sync_session_report(session: dict[str, Any]) -> None:
    print("Studio Cut Rescue Sync Session")
    print("==============================")
    print(f"Episode: {session['title']} ({session['episodeId']})")
    print(f"Workspace: {session['episodeDir']}")
    print(f"Inbox: {session['inboxDir']}")
    print(f"Generated: {session['generatedDir']}")
    print(f"Edit: {session['editDir']}")
    print(f"Renders: {session['rendersDir']}")

    print("\nDetected inputs:")
    for role, spec in RESCUE_SYNC_ROLE_SPECS.items():
        if role == "clipVideo" and not session["includeClip"]:
            continue
        matches = session["roleMatches"].get(role, [])
        status = "missing" if spec["required"] and not matches else "optional" if not matches else "ready"
        print(f"  - {spec['label']}: {status}")
        for index, media_path in enumerate(matches):
            prefix = f"    {index + 1}." if spec.get("multi") else "    -"
            print(f"{prefix} {media_path.name}")

    if session["warnings"]:
        print("\nWarnings:")
        for warning in session["warnings"]:
            print(f"  - {warning}")

    if session["missingRequiredRoles"]:
        print("\nMissing required roles:")
        for role in session["missingRequiredRoles"]:
            print(f"  - {RESCUE_SYNC_ROLE_SPECS[role]['label']}")

    print("\nWrote:")
    print(f"  - {session['syncJobPath']}")
    print(f"  - {session['localMediaMapPath']}")
    print(f"  - {session['readmePath']}")


def build_rescue_sync_worker_command(session: dict[str, Any]) -> list[str]:
    repo_root = Path(__file__).resolve().parents[2]
    return [
        sys.executable,
        str(repo_root / "tools/studio-cut-cloud-sync/cloud_sync_worker.py"),
        "--sync-job-json",
        str(session["syncJobPath"]),
        "--local-media-map",
        str(session["localMediaMapPath"]),
        "--workdir",
        str(session["workDir"]),
        "--out",
        str(session["syncReportPath"]),
        "--out-sync-map",
        str(session["syncMapPath"]),
        "--out-proxy-dir",
        str(session["alignedProxyDir"]),
        "--out-source-monitor-proxy",
        str(session["sourceMonitorProxyPath"]),
        "--out-manifest",
        str(session["manifestPath"]),
    ]


def build_agent_workspace_index_command(session: dict[str, Any]) -> list[str]:
    return [
        sys.executable,
        str(Path(__file__)),
        "agent-workspace-index",
        "--episode-dir",
        str(session["episodeDir"]),
        "--out",
        str(session["generatedDir"] / "agent-workspace-index.json"),
    ]


def build_rescue_sync_session_readme(session: dict[str, Any]) -> str:
    episode_id = session["episodeId"]
    title = session["title"]
    worker_command = format_shell_command(build_rescue_sync_worker_command(session))
    render_command = format_shell_command(
        [
            sys.executable,
            str(Path(__file__)),
            "render-from-sync-map",
            "--sync-map",
            str(session["syncMapPath"]),
            "--decisions",
            str(session["editDir"] / f"{episode_id}-decisions.json"),
            "--media-map",
            str(session["localMediaMapPath"]),
            "--out",
            str(session["rendersDir"] / f"{episode_id}-youtube-16x9.mp4"),
            "--dry-run",
        ]
    )
    status_command = format_shell_command(
        [
            sys.executable,
            str(Path(__file__)),
            "rescue-sync-status",
            "--episode-dir",
            str(session["episodeDir"]),
        ]
    )
    agent_index_command = format_shell_command(
        build_agent_workspace_index_command(session)
    )
    agent_edit_session_command = format_shell_command(
        [
            sys.executable,
            str(Path(__file__)),
            "agent-edit-session",
            "--episode-dir",
            str(session["episodeDir"]),
        ]
    )

    missing = "\n".join(
        f"- {RESCUE_SYNC_ROLE_SPECS[role]['label']}"
        for role in session["missingRequiredRoles"]
    ) or "- none"

    return f"""# Studio Cut Rescue Sync Session: {title}

This folder is a local episode workspace. Keep it out of git.

## Folder Shape

- `inbox/`: original messy local media from recording/export.
- `generated/`: sync job JSON, local media map, Sync Map, source-monitor proxy,
  manifest, aligned proxies, and worker scratch output.
- `edit/`: exported Studio Cut decisions and checkpoints.
- `renders/`: local rendered outputs.

## Expected Inbox Names

Use these names or the documented prefixes:

- `homer-video.mov`
- `charlie-video.mov`
- `homer-audio.wav`
- `charlie-audio.wav`
- `phone-reference-01.m4a`
- `phone-reference-02.m4a`
- `clip-video.mp4` when there is a clip/screen source

Missing required inputs right now:

{missing}

## Generated Files

- Sync job: `{session['syncJobPath']}`
- Local media map: `{session['localMediaMapPath']}`
- Sync report: `{session['syncReportPath']}`
- Sync Map: `{session['syncMapPath']}`
- Episode Manifest: `{session['manifestPath']}`
- Source-monitor proxy: `{session['sourceMonitorProxyPath']}`

## Run Rescue Sync Worker

```bash
{worker_command}
```

Check the local package/readiness state any time:

```bash
{status_command}
```

Write a media-safe agent workspace index:

```bash
{agent_index_command}
```

Run a one-command agent edit review after decisions are exported:

```bash
{agent_edit_session_command}
```

## Publish Shared Room

Open Studio Cut, use `Publish Rescue Sync Package`, and select:

- `{session['manifestPath']}`
- `{session['sourceMonitorProxyPath']}`
- `{session['syncMapPath']}`
- `{session['syncReportPath']}`

Mako opens:

```text
https://high-ground-odyssey.web.app/?projectId={episode_id}&branchId={session['branchId']}
```

After publish, check `Shared Room Diagnostics` and `Sync Review` in the web app.
`Sync Review` should show the Sync Map job id, canonical duration, reference
pieces, offset count, confidence, and warning count. If it says the Sync Map is
missing or failed to load, do not treat the room as ready for real collaboration.

## Render After Editing

Put exported decisions at:

```text
{session['editDir'] / f'{episode_id}-decisions.json'}
```

Dry-run:

```bash
{render_command}
```

Remove `--dry-run` when the segment plan looks right.
"""


def build_rescue_sync_status_report(session: dict[str, Any]) -> dict[str, Any]:
    generated_dir = session["generatedDir"]
    edit_dir = session["editDir"]
    episode_id = session["episodeId"]
    decisions_candidates = get_rescue_sync_decision_candidates(session)
    decisions_path = next((path for path in decisions_candidates if path.is_file()), None)
    report: dict[str, Any] = {
        "status": "blocked",
        "episodeId": episode_id,
        "episodeDir": str(session["episodeDir"]),
        "inboxDir": str(session["inboxDir"]),
        "generatedDir": str(generated_dir),
        "editDir": str(edit_dir),
        "rendersDir": str(session["rendersDir"]),
        "inputs": [],
        "missingRequiredRoles": list(session["missingRequiredRoles"]),
        "files": {},
        "syncReport": None,
        "syncMap": None,
        "manifest": None,
        "proxy": None,
        "decisions": None,
        "readiness": {
            "inputReady": False,
            "workerOutputsReady": False,
            "publishReady": False,
            "editDecisionsReady": False,
            "renderReady": False,
        },
        "nextActions": [],
        "warnings": list(session["warnings"]),
        "errors": [],
    }

    for role, spec in RESCUE_SYNC_ROLE_SPECS.items():
        if role == "clipVideo" and not session["includeClip"]:
            continue

        matches = session["roleMatches"].get(role, [])
        report["inputs"].append(
            {
                "role": role,
                "label": spec["label"],
                "required": bool(spec["required"]),
                "count": len(matches),
                "files": [str(path) for path in matches],
            }
        )

    file_specs = {
        "syncJob": session["syncJobPath"],
        "localMediaMap": session["localMediaMapPath"],
        "syncReport": session["syncReportPath"],
        "syncMap": session["syncMapPath"],
        "manifest": session["manifestPath"],
        "sourceMonitorProxy": session["sourceMonitorProxyPath"],
        "readme": session["readmePath"],
    }
    report["files"] = {
        label: {"path": str(path), "exists": path.is_file()}
        for label, path in file_specs.items()
    }

    report["readiness"]["inputReady"] = not session["missingRequiredRoles"]

    add_sync_job_status(report, session["syncJobPath"])
    add_local_media_map_status(report, session["localMediaMapPath"])
    add_sync_report_status(report, session["syncReportPath"])
    add_sync_map_status(report, session["syncMapPath"])
    add_manifest_status(report, session["manifestPath"])
    add_proxy_status(report, session["sourceMonitorProxyPath"])
    add_decision_status(report, decisions_path, session)

    report["readiness"]["workerOutputsReady"] = all(
        report["files"][label]["exists"]
        for label in ("syncReport", "syncMap", "manifest", "sourceMonitorProxy")
    )
    report["readiness"]["publishReady"] = all(
        report["files"][label]["exists"]
        for label in ("syncMap", "manifest", "sourceMonitorProxy")
    )
    decision_report = report.get("decisions") or {}
    report["readiness"]["editDecisionsReady"] = bool(decision_report.get("eventCount"))
    report["readiness"]["renderReady"] = all(
        [
            report["files"]["syncMap"]["exists"],
            report["files"]["localMediaMap"]["exists"],
            bool(decision_report.get("eventCount")),
        ]
    )

    if report["readiness"]["publishReady"]:
        report["publishPackage"] = build_rescue_sync_publish_package_status(
            report, session
        )

    report["nextActions"] = build_rescue_sync_next_actions(report, session)
    report["status"] = "ready" if report["readiness"]["renderReady"] else "blocked"
    return report


def get_rescue_sync_decision_candidates(session: dict[str, Any]) -> list[Path]:
    episode_id = session["episodeId"]
    edit_dir = session["editDir"]
    generated_dir = session["generatedDir"]
    return [
        edit_dir / f"{episode_id}-decisions.json",
        edit_dir / "decisions.json",
        generated_dir / f"{episode_id}-decisions.json",
        generated_dir / "decisions.json",
    ]


def get_rescue_sync_transcript_candidates(session: dict[str, Any]) -> list[Path]:
    episode_id = session["episodeId"]
    edit_dir = session["editDir"]
    generated_dir = session["generatedDir"]
    return [
        edit_dir / f"{episode_id}-transcript.json",
        edit_dir / "episode-transcript.json",
        edit_dir / "transcript.json",
        generated_dir / f"{episode_id}-transcript.json",
        generated_dir / "episode-transcript.json",
        generated_dir / "transcript.json",
    ]


def find_agent_edit_session_transcript_path(
    *, session: dict[str, Any], explicit_path: Path | None
) -> Path | None:
    if explicit_path:
        candidate = explicit_path.expanduser().resolve()
        if not candidate.is_file():
            raise StudioCutCliError(f"transcript file not found: {candidate}")
        return candidate

    return next(
        (path for path in get_rescue_sync_transcript_candidates(session) if path.is_file()),
        None,
    )


def relative_episode_workspace_path(path: Path | str, episode_dir: Path) -> str:
    candidate = Path(path)
    try:
        return candidate.resolve().relative_to(episode_dir).as_posix()
    except (OSError, ValueError):
        return candidate.name


def sanitize_agent_workspace_payload(value: Any, episode_dir: Path) -> Any:
    if isinstance(value, dict):
        return {
            key: sanitize_agent_workspace_payload(child, episode_dir)
            for key, child in value.items()
        }

    if isinstance(value, list):
        return [sanitize_agent_workspace_payload(child, episode_dir) for child in value]

    if isinstance(value, str):
        return value.replace(str(episode_dir), "<episode-workspace>")

    return value


def summarize_agent_operation_preview(result: dict[str, Any]) -> dict[str, Any]:
    return {
        "appliedAt": result["appliedAt"],
        "projectId": result["projectId"],
        "branchId": result["branchId"],
        "operationCount": result["operationCount"],
        "appliedOperationCount": result["appliedOperationCount"],
        "appliedOperations": result["appliedOperations"],
        "activeDecisionEventCount": result["activeDecisionEventCount"],
        "tombstonedDecisionEventCount": result["tombstonedDecisionEventCount"],
        "reviewSummary": result["reviewSummary"],
        "warnings": result["warnings"],
        "errors": result["errors"],
    }


def build_agent_session_render_qa(
    *,
    session: dict[str, Any],
    decisions_path: Path,
    profile: str,
    qa_path: Path,
    render_output_path: Path,
) -> dict[str, Any]:
    sync_map_path = session["syncMapPath"]
    media_map_path = session["localMediaMapPath"]

    if profile != "youtube_16x9":
        raise StudioCutCliError("agent render QA currently supports profile youtube_16x9")

    sync_map = load_sync_map(sync_map_path)
    decisions_payload = load_json_file(decisions_path, "decisions")
    decision_events = parse_decision_events(decisions_payload)
    media_map = load_sync_map_render_media_map(media_map_path)
    manifest = build_manifest_from_sync_map(sync_map)
    plan = build_render_plan(
        manifest=manifest,
        decision_events=decision_events,
        profile=profile,
        manifest_path=sync_map_path,
        decisions_path=decisions_path,
    )

    if not plan["activeSegments"]:
        raise StudioCutCliError("render QA skipped because the decision export has no active segments")

    resolved_media = build_sync_map_render_media(
        sync_map=sync_map,
        media_map=media_map,
        media_map_path=media_map_path,
        segments=plan["activeSegments"],
        require_existing=False,
    )
    qa_report = build_sync_map_render_qa_report(
        sync_map=sync_map,
        plan=plan,
        media_map=media_map,
        media_map_path=media_map_path,
        resolved_media=resolved_media,
        out_path=render_output_path,
        dry_run=True,
    )
    write_json(qa_path, qa_report)
    return qa_report


def summarize_agent_render_qa(render_qa: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(render_qa, dict):
        return {"available": False}

    summary = render_qa.get("summary")
    if not isinstance(summary, dict):
        return {"available": False}

    return {
        "available": True,
        "renderMode": render_qa.get("renderMode"),
        "outputFileName": render_qa.get("outputFileName"),
        "segmentCount": summary.get("segmentCount", 0),
        "activeDurationMs": summary.get("activeDurationMs", 0),
        "cutDurationMs": summary.get("cutDurationMs", 0),
        "audioMode": summary.get("audioMode", "unknown"),
        "videoPartialCoverageSegmentCount": summary.get(
            "videoPartialCoverageSegmentCount", 0
        ),
        "videoFullyMissingRoleCount": summary.get("videoFullyMissingRoleCount", 0),
        "totalBlackPaddingMs": summary.get("totalBlackPaddingMs", 0),
        "silencePaddingMs": summary.get("silencePaddingMs", 0),
        "warningCount": summary.get("warningCount", 0),
    }


def extract_agent_task_time(task: dict[str, Any]) -> tuple[int | None, int | None]:
    start_ms = task.get("startSourceTimeMs", task.get("sourceTimeMs"))
    end_ms = task.get("endSourceTimeMs")

    suggested = task.get("suggestedOperation")
    if isinstance(suggested, dict):
        start_ms = start_ms if start_ms is not None else suggested.get("startSourceTimeMs")
        start_ms = start_ms if start_ms is not None else suggested.get("sourceTimeMs")
        end_ms = end_ms if end_ms is not None else suggested.get("endSourceTimeMs")

    try:
        start_value = int(round(float(start_ms))) if start_ms is not None else None
    except (TypeError, ValueError):
        start_value = None

    try:
        end_value = int(round(float(end_ms))) if end_ms is not None else None
    except (TypeError, ValueError):
        end_value = None

    return start_value, end_value


def build_agent_inspection_checklist(
    *,
    review: dict[str, Any] | None,
    render_qa: dict[str, Any] | None,
    limit: int = 18,
) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []

    if isinstance(review, dict):
        for task in review.get("tasks", []):
            if not isinstance(task, dict):
                continue

            start_ms, end_ms = extract_agent_task_time(task)
            kind = str(task.get("kind") or "review_task")
            priority = str(task.get("priority") or "medium")
            message = str(task.get("message") or task.get("reason") or kind)

            if not start_ms and start_ms != 0:
                continue

            items.append(
                {
                    "priority": priority if priority in {"high", "medium", "low"} else "medium",
                    "kind": kind,
                    "startSourceTimeMs": start_ms,
                    **({"endSourceTimeMs": end_ms} if end_ms is not None else {}),
                    **({"state": task.get("state")} if task.get("state") else {}),
                    "message": message,
                    "evidence": [
                        str(value)
                        for value in (
                            task.get("evidence", [])
                            if isinstance(task.get("evidence"), list)
                            else []
                        )
                    ],
                }
            )

    if isinstance(render_qa, dict):
        for segment in render_qa.get("segments", []):
            if not isinstance(segment, dict):
                continue

            warnings = [
                str(warning)
                for warning in segment.get("warnings", [])
                if isinstance(warning, str) and warning.strip()
            ]
            if not warnings:
                continue

            source_time = segment.get("sourceTime") if isinstance(segment.get("sourceTime"), dict) else {}
            start_ms = source_time.get("inMs")
            end_ms = source_time.get("outMs")
            try:
                start_value = int(round(float(start_ms)))
            except (TypeError, ValueError):
                start_value = None
            try:
                end_value = int(round(float(end_ms)))
            except (TypeError, ValueError):
                end_value = None

            if start_value is None:
                continue

            items.append(
                {
                    "priority": "medium",
                    "kind": "render_qa_warning",
                    "startSourceTimeMs": start_value,
                    **({"endSourceTimeMs": end_value} if end_value is not None else {}),
                    "state": segment.get("programState"),
                    "message": "; ".join(warnings[:3]),
                    "evidence": [
                        f"layout={segment.get('layoutBehavior')}",
                        f"segmentIndex={segment.get('index')}",
                    ],
                }
            )

    priority_order = {"high": 0, "medium": 1, "low": 2}
    return sorted(
        items,
        key=lambda item: (
            priority_order.get(str(item.get("priority")), 1),
            int(item.get("startSourceTimeMs") or 0),
            str(item.get("kind") or ""),
        ),
    )[:limit]


def format_agent_checklist_time(item: dict[str, Any]) -> str:
    start_ms = item.get("startSourceTimeMs")
    end_ms = item.get("endSourceTimeMs")
    if isinstance(start_ms, int) and isinstance(end_ms, int):
        return f"{format_time_ms(start_ms)}-{format_time_ms(end_ms)}"
    if isinstance(start_ms, int):
        return format_time_ms(start_ms)
    return "unknown time"


def choose_agent_visual_review_time_ms(
    item: dict[str, Any], *, duration_ms: int
) -> int:
    start_ms = item.get("startSourceTimeMs")
    end_ms = item.get("endSourceTimeMs")

    if isinstance(start_ms, int) and isinstance(end_ms, int) and end_ms > start_ms:
        candidate = start_ms + max(250, min(1500, (end_ms - start_ms) // 2))
    elif isinstance(start_ms, int):
        candidate = start_ms + 500
    else:
        candidate = 0

    return max(0, min(max(0, duration_ms - 1), int(candidate)))


def build_agent_visual_review(
    *,
    session: dict[str, Any],
    manifest: dict[str, Any] | None,
    inspection_checklist: list[dict[str, Any]],
    report_path: Path,
    contact_sheet_path: Path,
    frame_dir: Path,
) -> tuple[dict[str, Any] | None, list[str]]:
    warnings: list[str] = []

    if not inspection_checklist:
        return None, []

    proxy_path = Path(session["sourceMonitorProxyPath"])
    if not proxy_path.is_file():
        return None, [
            "Visual review skipped because generated source-monitor proxy is missing."
        ]

    ffmpeg_path = shutil.which("ffmpeg")
    if not ffmpeg_path:
        return None, ["Visual review skipped because ffmpeg is not available on PATH."]

    duration_ms = int(round(float((manifest or {}).get("durationMs") or 0)))
    if duration_ms <= 0:
        duration_ms = (
            int(round(float(session.get("durationMs") or 0)))
            if session.get("durationMs")
            else 0
        )
    if duration_ms <= 0:
        duration_ms = 60 * 60 * 1000

    episode_dir = Path(session["episodeDir"]).resolve()
    frame_dir.mkdir(parents=True, exist_ok=True)
    contact_sheet_path.parent.mkdir(parents=True, exist_ok=True)

    selected_items = inspection_checklist[:AGENT_VISUAL_REVIEW_MAX_FRAMES]
    frames: list[dict[str, Any]] = []

    for index, item in enumerate(selected_items, start=1):
        frame_path = frame_dir / f"agent-frame-{index:03d}.jpg"
        source_time_ms = choose_agent_visual_review_time_ms(
            item,
            duration_ms=duration_ms,
        )
        command = [
            ffmpeg_path,
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-ss",
            format_seconds(source_time_ms / 1000),
            "-i",
            str(proxy_path),
            "-frames:v",
            "1",
            "-vf",
            f"scale={AGENT_VISUAL_REVIEW_FRAME_WIDTH}:-2",
            "-q:v",
            "4",
            str(frame_path),
        ]

        try:
            run_command(command, f"ffmpeg extract visual review frame {index}")
        except StudioCutCliError as error:
            warnings.append(str(error))
            continue

        frames.append(
            {
                "index": index,
                "path": relative_episode_workspace_path(frame_path, episode_dir),
                "sourceTimeMs": source_time_ms,
                "sourceTime": format_time_ms(source_time_ms),
                "checklistKind": item.get("kind"),
                "priority": item.get("priority", "medium"),
                **({"state": item.get("state")} if item.get("state") else {}),
                "message": item.get("message"),
            }
        )

    if not frames:
        return None, warnings or ["Visual review skipped because no frames could be extracted."]

    columns = min(3, len(frames))
    rows = (len(frames) + columns - 1) // columns
    tile_command = [
        ffmpeg_path,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-framerate",
        "1",
        "-i",
        str(frame_dir / "agent-frame-%03d.jpg"),
        "-vf",
        f"tile={columns}x{rows}:padding=8:margin=8:color=black",
        "-frames:v",
        "1",
        str(contact_sheet_path),
    ]

    try:
        run_command(tile_command, "ffmpeg build agent contact sheet")
    except StudioCutCliError as error:
        warnings.append(str(error))

    report = {
        "schemaVersion": 1,
        "kind": "studio-cut-agent-visual-review",
        "generatedAt": utc_now_iso(),
        "pathPolicy": (
            "Paths are relative to the local episode workspace. Source-monitor "
            "proxy frames are derived local artifacts and are not uploaded."
        ),
        "source": {
            "kind": "source-monitor-proxy",
            "fileName": proxy_path.name,
        },
        "summary": {
            "frameCount": len(frames),
            "contactSheetWritten": contact_sheet_path.is_file(),
            "maxFrames": AGENT_VISUAL_REVIEW_MAX_FRAMES,
        },
        "contactSheet": (
            relative_episode_workspace_path(contact_sheet_path, episode_dir)
            if contact_sheet_path.is_file()
            else None
        ),
        "frames": frames,
        "warnings": warnings,
    }
    write_json(report_path, report)
    return report, warnings


def summarize_agent_visual_review(
    visual_review: dict[str, Any] | None,
) -> dict[str, Any]:
    if not isinstance(visual_review, dict):
        return {"available": False}

    summary = visual_review.get("summary")
    if not isinstance(summary, dict):
        return {"available": False}

    return {
        "available": True,
        "frameCount": summary.get("frameCount", 0),
        "contactSheetWritten": bool(summary.get("contactSheetWritten")),
        "contactSheet": visual_review.get("contactSheet"),
        "warningCount": len(visual_review.get("warnings", []))
        if isinstance(visual_review.get("warnings"), list)
        else 0,
    }


def build_agent_edit_session_report(
    *,
    session: dict[str, Any],
    status_report: dict[str, Any],
    workspace_index: dict[str, Any],
    review: dict[str, Any] | None,
    suggested_ops: dict[str, Any] | None,
    operation_preview: dict[str, Any] | None,
    render_qa: dict[str, Any] | None,
    inspection_checklist: list[dict[str, Any]],
    visual_review: dict[str, Any] | None,
    transcript_path: Path | None,
    output_paths: dict[str, Path],
    preview_decisions_written: bool,
    warnings: list[str],
    errors: list[str],
) -> dict[str, Any]:
    episode_dir = Path(session["episodeDir"]).resolve()
    output_files = {
        key: {
            "path": relative_episode_workspace_path(path, episode_dir),
            "exists": path.is_file(),
            **({"sizeBytes": path.stat().st_size} if path.is_file() else {}),
        }
        for key, path in output_paths.items()
    }
    suggested_operation_count = (
        len(suggested_ops.get("operations", []))
        if isinstance(suggested_ops, dict) and isinstance(suggested_ops.get("operations"), list)
        else 0
    )
    approval_required_count = (
        sum(
            1
            for operation in suggested_ops.get("operations", [])
            if isinstance(operation, dict)
            and operation.get("approvalRequired") is True
        )
        if isinstance(suggested_ops, dict)
        else 0
    )
    review_summary = review.get("summary") if isinstance(review, dict) else None
    transcript_review = review.get("transcriptReview") if isinstance(review, dict) else None
    agent_next_actions = build_agent_edit_session_next_actions(
        errors=errors,
        suggested_operation_count=suggested_operation_count,
        preview_decisions_written=preview_decisions_written,
        operation_preview=operation_preview,
    )

    return {
        "schemaVersion": 1,
        "kind": "studio-cut-agent-edit-session",
        "generatedAt": utc_now_iso(),
        "pathPolicy": (
            "Paths are relative to the local episode workspace. Private absolute "
            "filesystem roots are intentionally omitted."
        ),
        "episode": {
            "id": session["episodeId"],
            "title": (status_report.get("syncJob") or {}).get("title")
            or session["title"],
            "branchId": (status_report.get("syncJob") or {}).get("branchId")
            or session["branchId"],
            "workspaceName": episode_dir.name,
        },
        "readiness": status_report["readiness"],
        "workspaceStatus": workspace_index["status"],
        "inputs": {
            "manifest": relative_episode_workspace_path(session["manifestPath"], episode_dir),
            "decisions": (
                relative_episode_workspace_path(status_report["decisions"]["path"], episode_dir)
                if isinstance(status_report.get("decisions"), dict)
                else None
            ),
            "transcript": (
                relative_episode_workspace_path(transcript_path, episode_dir)
                if transcript_path
                else None
            ),
        },
        "outputs": output_files,
        "summary": {
            "reviewWritten": review is not None,
            "suggestedOperationCount": suggested_operation_count,
            "approvalRequiredCount": approval_required_count,
            "previewDecisionFileWritten": preview_decisions_written,
            "inspectionChecklistCount": len(inspection_checklist),
            "renderQa": summarize_agent_render_qa(render_qa),
            "visualReview": summarize_agent_visual_review(visual_review),
            **({"review": review_summary} if review_summary else {}),
            **({"transcriptReview": transcript_review} if transcript_review else {}),
        },
        "operationPreview": operation_preview,
        "inspectionChecklist": sanitize_agent_workspace_payload(
            inspection_checklist,
            episode_dir,
        ),
        "visualReview": sanitize_agent_workspace_payload(visual_review, episode_dir)
        if visual_review
        else None,
        "nextActions": agent_next_actions,
        "warnings": [
            sanitize_agent_workspace_payload(warning, episode_dir)
            for warning in warnings
        ],
        "errors": [
            sanitize_agent_workspace_payload(error, episode_dir)
            for error in errors
        ],
    }


def build_agent_edit_session_next_actions(
    *,
    errors: list[str],
    suggested_operation_count: int,
    preview_decisions_written: bool,
    operation_preview: dict[str, Any] | None,
) -> list[str]:
    if errors:
        return [
            "Fix the missing manifest or decision export, then rerun agent-edit-session.",
            "Use rescue-sync-status for the broader workspace readiness view.",
        ]

    if not suggested_operation_count:
        return [
            "Review agent-edit-review.json; no safe suggested operation JSON was produced.",
            "If a transcript exists, place it in edit/<episode-id>-transcript.json and rerun.",
        ]

    actions = [
        "Inspect agent-edit-session.md and agent-edit-review.json.",
        "Inspect agent-suggested-ops.json before applying anything.",
        "Import agent-suggested-ops.json in the web cockpit with Import Agent Ops, or run apply-decision-ops --dry-run.",
    ]

    if operation_preview and operation_preview["errors"]:
        actions.insert(0, "Resolve operation preview errors before applying suggested ops.")
    elif preview_decisions_written:
        actions.append("Compare the preview decision JSON before replacing any exported decisions.")

    return actions


def build_agent_edit_session_markdown(report: dict[str, Any]) -> str:
    episode = report["episode"]
    summary = report["summary"]
    operation_preview = report.get("operationPreview") or {}
    transcript_review = summary.get("transcriptReview") or {}

    lines = [
        f"# Studio Cut Agent Edit Session: {episode['title']}",
        "",
        "This file is generated for agent/human review. It contains decision-layer",
        "guidance only; no media, local absolute paths, object URLs, or proxy bytes.",
        "",
        "## Episode",
        "",
        f"- Episode id: `{episode['id']}`",
        f"- Branch id: `{episode['branchId']}`",
        f"- Workspace: `{episode['workspaceName']}`",
        "",
        "## Summary",
        "",
        f"- Review written: `{yes_no(bool(summary['reviewWritten']))}`",
        f"- Suggested operations: `{summary['suggestedOperationCount']}`",
        f"- Approval-required operations: `{summary['approvalRequiredCount']}`",
        f"- Preview decision file written: `{yes_no(bool(summary['previewDecisionFileWritten']))}`",
        f"- Inspection checklist items: `{summary['inspectionChecklistCount']}`",
    ]

    render_qa_summary = summary.get("renderQa") if isinstance(summary, dict) else None
    if isinstance(render_qa_summary, dict) and render_qa_summary.get("available"):
        lines.extend(
            [
                f"- Render QA mode: `{render_qa_summary.get('renderMode')}`",
                f"- Render QA audio mode: `{render_qa_summary.get('audioMode')}`",
                f"- Render QA warnings: `{render_qa_summary.get('warningCount', 0)}`",
                f"- Render QA black padding: `{format_time_ms(int(render_qa_summary.get('totalBlackPaddingMs') or 0))}`",
                f"- Render QA silence padding: `{format_time_ms(int(render_qa_summary.get('silencePaddingMs') or 0))}`",
            ]
        )

    visual_review_summary = (
        summary.get("visualReview") if isinstance(summary, dict) else None
    )
    if isinstance(visual_review_summary, dict) and visual_review_summary.get("available"):
        lines.extend(
            [
                f"- Visual review frames: `{visual_review_summary.get('frameCount', 0)}`",
                f"- Contact sheet written: `{yes_no(bool(visual_review_summary.get('contactSheetWritten')))}`",
                f"- Contact sheet: `{visual_review_summary.get('contactSheet')}`",
            ]
        )

    review_summary = summary.get("review")
    if isinstance(review_summary, dict):
        lines.extend(
            [
                f"- Active decisions: `{review_summary['activeDecisionEventCount']}`",
                f"- Active segments: `{review_summary['activeSegmentCount']}`",
                f"- Cut segments: `{review_summary['cutSegmentCount']}`",
                f"- Active duration: `{format_time_ms(review_summary['activeDurationMs'])}`",
                f"- Cut duration: `{format_time_ms(review_summary['cutDurationMs'])}`",
            ]
        )

    if transcript_review:
        lines.extend(
            [
                "",
                "## Transcript Review",
                "",
                f"- Transcript segments: `{transcript_review['segmentCount']}`",
                f"- Word count: `{transcript_review['wordCount']}`",
                f"- Coverage: `{format_percent(transcript_review['coveragePercent'])}`",
                f"- Clip references: `{transcript_review['clipReferenceCount']}`",
                f"- Filler markers: `{transcript_review['fillerMarkerCount']}`",
            ]
        )

    if operation_preview:
        lines.extend(
            [
                "",
                "## Operation Preview",
                "",
                f"- Operation count: `{operation_preview['operationCount']}`",
                f"- Applied operation count: `{operation_preview['appliedOperationCount']}`",
                f"- Active decisions after apply: `{operation_preview['activeDecisionEventCount']}`",
                f"- Tombstoned decisions after apply: `{operation_preview['tombstonedDecisionEventCount']}`",
            ]
        )

    inspection_checklist = report.get("inspectionChecklist") or []
    if inspection_checklist:
        lines.extend(["", "## Inspection Checklist", ""])
        for item in inspection_checklist:
            state = f" state={item.get('state')}" if item.get("state") else ""
            lines.append(
                f"- `[{item.get('priority', 'medium')}]` "
                f"`{format_agent_checklist_time(item)}` "
                f"`{item.get('kind', 'review_task')}`{state}: {item.get('message')}"
            )
            evidence = item.get("evidence")
            if isinstance(evidence, list) and evidence:
                lines.append(f"  - Evidence: {'; '.join(str(value) for value in evidence[:3])}")

    visual_review = report.get("visualReview")
    if isinstance(visual_review, dict):
        lines.extend(["", "## Visual Review Artifacts", ""])
        if visual_review.get("contactSheet"):
            lines.append(f"- Contact sheet: `{visual_review['contactSheet']}`")
        for frame in visual_review.get("frames", [])[:AGENT_VISUAL_REVIEW_MAX_FRAMES]:
            lines.append(
                f"- `{frame.get('index')}` `{frame.get('sourceTime')}` "
                f"`{frame.get('checklistKind')}`: `{frame.get('path')}`"
            )

    if report["warnings"]:
        lines.extend(["", "## Warnings", ""])
        lines.extend(f"- {warning}" for warning in report["warnings"])

    if report["errors"]:
        lines.extend(["", "## Errors", ""])
        lines.extend(f"- {error}" for error in report["errors"])

    lines.extend(["", "## Next Actions", ""])
    lines.extend(f"- {action}" for action in report["nextActions"])
    lines.append("")
    return "\n".join(lines)


def print_agent_edit_session_report(report: dict[str, Any]) -> None:
    episode = report["episode"]
    summary = report["summary"]

    print("Studio Cut Agent Edit Session")
    print("=============================")
    print(f"Episode: {episode['title']} ({episode['id']})")
    print(f"Workspace: {episode['workspaceName']}")
    print(f"Review written: {yes_no(bool(summary['reviewWritten']))}")
    print(f"Suggested operations: {summary['suggestedOperationCount']}")
    print(f"Approval required: {summary['approvalRequiredCount']}")
    print(f"Inspection checklist: {summary.get('inspectionChecklistCount', 0)} item(s)")

    if summary.get("transcriptReview"):
        transcript = summary["transcriptReview"]
        print(
            "Transcript: "
            f"{transcript['segmentCount']} segment(s), "
            f"{format_percent(transcript['coveragePercent'])} coverage"
        )

    render_qa = summary.get("renderQa")
    if isinstance(render_qa, dict) and render_qa.get("available"):
        print(
            "Render QA: "
            f"{render_qa.get('segmentCount', 0)} segment(s), "
            f"audio={render_qa.get('audioMode')}, "
            f"warnings={render_qa.get('warningCount', 0)}"
        )

    visual_review = summary.get("visualReview")
    if isinstance(visual_review, dict) and visual_review.get("available"):
        print(
            "Visual review: "
            f"{visual_review.get('frameCount', 0)} frame(s), "
            f"contactSheet={yes_no(bool(visual_review.get('contactSheetWritten')))}"
        )

    print("\nOutputs:")
    for label, entry in report["outputs"].items():
        print(f"  - {label}: {entry['path']} ({'yes' if entry['exists'] else 'missing'})")

    if report["warnings"]:
        print("\nWarnings:")
        for warning in report["warnings"]:
            print(f"  - {warning}")

    if report["errors"]:
        print("\nErrors:")
        for error in report["errors"]:
            print(f"  - {error}")

    print("\nNext actions:")
    for action in report["nextActions"]:
        print(f"  - {action}")


def build_agent_workspace_index(
    session: dict[str, Any],
    status_report: dict[str, Any],
) -> dict[str, Any]:
    episode_dir = Path(session["episodeDir"]).resolve()

    def relative_workspace_path(path: Path | str) -> str:
        candidate = Path(path)
        try:
            return candidate.resolve().relative_to(episode_dir).as_posix()
        except (OSError, ValueError):
            return candidate.name

    def file_entry(path: Path, *, kind: str, label: str) -> dict[str, Any]:
        exists = path.is_file()
        return {
            "label": label,
            "kind": kind,
            "path": relative_workspace_path(path),
            "exists": exists,
            **({"sizeBytes": path.stat().st_size} if exists else {}),
        }

    role_entries: list[dict[str, Any]] = []
    for role, spec in RESCUE_SYNC_ROLE_SPECS.items():
        if role == "clipVideo" and not session["includeClip"]:
            continue

        matches = session["roleMatches"].get(role, [])
        role_entries.append(
            {
                "role": role,
                "label": spec["label"],
                "required": bool(spec["required"]),
                "kind": spec["kind"],
                "count": len(matches),
                "files": [
                    {
                        "fileName": media_path.name,
                        "relativePath": relative_workspace_path(media_path),
                        "sizeBytes": media_path.stat().st_size if media_path.exists() else 0,
                        **({"orderIndex": index} if role == "phoneReferenceAudio" else {}),
                    }
                    for index, media_path in enumerate(matches)
                ],
            }
        )

    files = {
        "syncJob": file_entry(
            session["syncJobPath"], kind="sync_job", label="Sync job JSON"
        ),
        "localMediaMap": file_entry(
            session["localMediaMapPath"],
            kind="local_media_map",
            label="Local media map JSON",
        ),
        "syncReport": file_entry(
            session["syncReportPath"], kind="sync_report", label="Sync report JSON"
        ),
        "syncMap": file_entry(
            session["syncMapPath"], kind="sync_map", label="Sync Map JSON"
        ),
        "manifest": file_entry(
            session["manifestPath"], kind="episode_manifest", label="Episode Manifest JSON"
        ),
        "sourceMonitorProxy": file_entry(
            session["sourceMonitorProxyPath"],
            kind="source_monitor_proxy",
            label="Source-monitor proxy MP4",
        ),
        "agentIndex": file_entry(
            session["generatedDir"] / "agent-workspace-index.json",
            kind="agent_workspace_index",
            label="Agent workspace index JSON",
        ),
        "readme": file_entry(
            session["readmePath"], kind="operator_readme", label="Operator README"
        ),
    }

    decision_candidates = [
        file_entry(path, kind="decision_export", label="Studio Cut decision JSON")
        for path in get_rescue_sync_decision_candidates(session)
    ]
    transcript_candidates = [
        file_entry(path, kind="episode_transcript", label="Timed transcript JSON")
        for path in get_rescue_sync_transcript_candidates(session)
    ]

    command_prefix = "python tools/studio-cut-local/studio_cut_local.py"
    workspace = "<episode-workspace>"
    generated = f"{workspace}/generated"
    edit = f"{workspace}/edit"
    renders = f"{workspace}/renders"
    episode_id = session["episodeId"]
    sync_job_status = (
        status_report.get("syncJob")
        if isinstance(status_report.get("syncJob"), dict)
        else {}
    )
    branch_id = str(sync_job_status.get("branchId") or session["branchId"])
    title = str(sync_job_status.get("title") or session["title"])

    return {
        "schemaVersion": 1,
        "kind": "studio-cut-agent-workspace-index",
        "generatedAt": utc_now_iso(),
        "pathPolicy": (
            "All paths are relative to the local episode workspace or use the "
            "<episode-workspace> placeholder. Private absolute filesystem paths "
            "are intentionally omitted."
        ),
        "episode": {
            "id": episode_id,
            "title": title,
            "branchId": branch_id,
            "workspaceName": Path(session["episodeDir"]).name,
        },
        "folders": {
            "workspace": workspace,
            "inbox": "inbox",
            "generated": "generated",
            "edit": "edit",
            "checkpoints": "edit/checkpoints",
            "renders": "renders",
        },
        "readiness": status_report["readiness"],
        "status": status_report["status"],
        "missingRequiredRoles": list(status_report["missingRequiredRoles"]),
        "inputs": role_entries,
        "files": files,
        "decisionCandidates": decision_candidates,
        "transcriptCandidates": transcript_candidates,
        "syncSummary": {
            "syncJob": status_report.get("syncJob"),
            "syncReport": status_report.get("syncReport"),
            "syncMap": status_report.get("syncMap"),
            "manifest": status_report.get("manifest"),
            "proxy": sanitize_agent_index_proxy_status(status_report.get("proxy")),
            "decisions": sanitize_agent_index_decision_status(
                status_report.get("decisions")
            ),
        },
        "shareUrl": (
            "https://high-ground-odyssey.web.app/"
            f"?projectId={episode_id}&branchId={branch_id}"
        ),
        "commands": {
            "refreshStatus": (
                f"{command_prefix} rescue-sync-status --episode-dir {workspace}"
            ),
            "refreshIndex": (
                f"{command_prefix} agent-workspace-index --episode-dir {workspace} "
                f"--out {generated}/agent-workspace-index.json"
            ),
            "runWorker": (
                f"{command_prefix} rescue-sync-session --episode-id {episode_id} "
                f"--title {json.dumps(title)} --episode-dir {workspace}"
            ),
            "validateGeneratedPackage": (
                f"{command_prefix} validate-generated-package "
                f"--manifest {generated}/episode-manifest.json "
                f"--proxy {generated}/source-monitor-proxy.mp4 "
                f"--sync-map {generated}/sync-map.json "
                f"--sync-report {generated}/sync-report.json"
            ),
            "renderDryRun": (
                f"{command_prefix} render-rescue-sync-session "
                f"--episode-dir {workspace} --dry-run"
            ),
            "agentEditSession": (
                f"{command_prefix} agent-edit-session --episode-dir {workspace}"
            ),
            "expectedDecisionExportPath": f"{edit}/{episode_id}-decisions.json",
            "expectedTranscriptPath": f"{edit}/{episode_id}-transcript.json",
            "expectedRenderOutputPath": f"{renders}/{episode_id}-youtube-16x9.mp4",
        },
        "agentNextActions": build_agent_workspace_next_actions(status_report, session),
        "warnings": [
            sanitize_agent_index_text(warning, episode_dir)
            for warning in status_report["warnings"]
        ],
        "errors": [
            sanitize_agent_index_text(error, episode_dir)
            for error in status_report["errors"]
        ],
    }


def sanitize_agent_index_text(value: Any, episode_dir: Path) -> str:
    return str(value).replace(str(episode_dir), "<episode-workspace>")


def sanitize_agent_index_proxy_status(proxy_status: Any) -> dict[str, Any] | None:
    if not isinstance(proxy_status, dict):
        return None
    return {
        key: value
        for key, value in proxy_status.items()
        if key != "path"
    }


def sanitize_agent_index_decision_status(
    decision_status: Any,
) -> dict[str, Any] | None:
    if not isinstance(decision_status, dict):
        return None
    return {
        key: value
        for key, value in decision_status.items()
        if key not in {"path", "renderCommand"}
    }


def build_agent_workspace_next_actions(
    status_report: dict[str, Any],
    session: dict[str, Any],
) -> list[str]:
    readiness = status_report["readiness"]

    if not readiness["inputReady"]:
        missing = ", ".join(
            RESCUE_SYNC_ROLE_SPECS[role]["label"]
            for role in status_report["missingRequiredRoles"]
        )
        return [
            f"Place missing inputs in inbox/: {missing}.",
            "Run the runWorker command template after inbox files are present.",
        ]

    if not readiness["workerOutputsReady"]:
        return [
            "Run the runWorker command template to generate Sync Map, manifest, sync report, and source-monitor proxy.",
        ]

    if not readiness["publishReady"]:
        return [
            "Inspect generated/ outputs, then fix missing package files before publishing.",
        ]

    if not readiness["editDecisionsReady"]:
        return [
            "Publish generated package in Studio Cut, edit the shared room, and export decisions to the expectedDecisionExportPath.",
        ]

    if not readiness["renderReady"]:
        return [
            "Fix Sync Map, local media map, or decision JSON blockers before rendering.",
        ]

    return [
        "Run the renderDryRun command template.",
        "If the segment plan is correct, remove --dry-run for the rough local output.",
    ]


def build_rescue_sync_publish_package_status(
    report: dict[str, Any], session: dict[str, Any]
) -> dict[str, Any]:
    sync_report_exists = bool(report["files"]["syncReport"]["exists"])
    sync_report = report.get("syncReport") if isinstance(report.get("syncReport"), dict) else {}
    sync_map = report.get("syncMap") if isinstance(report.get("syncMap"), dict) else {}

    return {
        "studioCutUrl": "https://high-ground-odyssey.web.app",
        "shareUrl": (
            "https://high-ground-odyssey.web.app/"
            f"?projectId={session['episodeId']}&branchId={session['branchId']}"
        ),
        "files": {
            "manifest": str(session["manifestPath"]),
            "sourceMonitorProxy": str(session["sourceMonitorProxyPath"]),
            "syncMap": str(session["syncMapPath"]),
            **(
                {"syncReport": str(session["syncReportPath"])}
                if sync_report_exists
                else {}
            ),
        },
        "expectedSyncReview": {
            "syncMapAttached": True,
            "syncReportAttached": sync_report_exists,
            "referencePieces": (
                sync_report.get("referenceRailSegments")
                or sync_map.get("referenceRailSegments")
            ),
            "trackOffsets": sync_report.get("trackOffsetCount"),
        },
        "postPublishCheck": (
            "After publishing, Shared Room Diagnostics should show the proxy, "
            "manifest, Sync Map, and optional sync report attached. Sync Review "
            "should load the Sync Map job id, canonical duration, reference pieces, "
            "offset count, confidence, and warning count."
        ),
    }


def summarize_cloud_sync_report(sync_report: dict[str, Any]) -> dict[str, Any]:
    reference_rail = sync_report.get("referenceRail", {})
    track_offsets = sync_report.get("trackOffsets", [])
    confidence_values = [
        float(offset["confidence"])
        for offset in track_offsets
        if isinstance(offset, dict) and isinstance(offset.get("confidence"), (int, float))
    ]
    warning_count = len(sync_report.get("globalWarnings", []))

    for offset in track_offsets:
        if isinstance(offset, dict) and isinstance(offset.get("warnings"), list):
            warning_count += len(offset["warnings"])

    return {
        "syncJobId": sync_report["syncJobId"],
        "status": sync_report["status"],
        "referenceRailSegments": len(reference_rail.get("segments", []))
        if isinstance(reference_rail, dict) and isinstance(reference_rail.get("segments"), list)
        else 0,
        "referenceRailDurationMs": reference_rail.get("totalDurationMs")
        if isinstance(reference_rail, dict)
        else None,
        "trackOffsetCount": len(track_offsets),
        "lowestConfidence": min(confidence_values) if confidence_values else 0,
        "warningCount": warning_count,
    }


def summarize_sync_map_roles(sync_map: dict[str, Any]) -> list[str]:
    role_counts: dict[str, int] = {}

    for asset in sync_map.get("assets", []):
        if isinstance(asset, dict) and isinstance(asset.get("role"), str):
            role_counts[asset["role"]] = role_counts.get(asset["role"], 0) + 1

    return [f"{role} x{count}" for role, count in sorted(role_counts.items())]


def get_lowest_sync_map_confidence(sync_map: dict[str, Any]) -> float:
    confidence_values = [
        float(asset["confidence"])
        for asset in sync_map.get("assets", [])
        if isinstance(asset, dict) and isinstance(asset.get("confidence"), (int, float))
    ]

    return min(confidence_values) if confidence_values else 0


def count_sync_map_warnings(sync_map: dict[str, Any]) -> int:
    warning_count = len(sync_map.get("globalWarnings", []))
    reference_rail = sync_map.get("referenceRail")

    if isinstance(reference_rail, dict):
        warnings = reference_rail.get("warnings", [])
        if isinstance(warnings, list):
            warning_count += len(warnings)
        segments = reference_rail.get("segments", [])
        if isinstance(segments, list):
            for segment in segments:
                if isinstance(segment, dict) and isinstance(segment.get("warnings"), list):
                    warning_count += len(segment["warnings"])

    for asset in sync_map.get("assets", []):
        if isinstance(asset, dict) and isinstance(asset.get("warnings"), list):
            warning_count += len(asset["warnings"])

    return warning_count


def normalize_publish_id(value: str, fallback: str = "room") -> str:
    normalized = []
    for character in value.strip().lower():
        if character.isalnum() or character in {".", "_", "-"}:
            normalized.append(character)
        else:
            normalized.append("-")

    compacted = []
    previous_dash = False
    for character in normalized:
        if character == "-":
            if not previous_dash:
                compacted.append(character)
            previous_dash = True
        else:
            compacted.append(character)
            previous_dash = False

    return "".join(compacted).strip("-") or fallback


def find_unsafe_local_references(value: Any) -> list[str]:
    unsafe: list[str] = []

    def walk(candidate: Any, path: str) -> None:
        if isinstance(candidate, dict):
            for key, child in candidate.items():
                walk(child, f"{path}.{key}" if path else str(key))
            return

        if isinstance(candidate, list):
            for index, child in enumerate(candidate):
                walk(child, f"{path}[{index}]")
            return

        if isinstance(candidate, str) and is_unsafe_publish_reference(candidate):
            unsafe.append(path or "<root>")

    walk(value, "")
    return unsafe


def is_unsafe_publish_reference(value: str) -> bool:
    normalized = value.strip().lower()

    return (
        normalized.startswith("/")
        or normalized.startswith("file:")
        or normalized.startswith("blob:")
        or normalized.startswith("\\")
        or "://" in normalized
        or "/users/" in normalized
        or "/private/" in normalized
        or "\\users\\" in normalized
    )


def add_sync_job_status(report: dict[str, Any], sync_job_path: Path) -> None:
    if not sync_job_path.is_file():
        return

    try:
        payload = load_json_file(sync_job_path, "sync job")
    except StudioCutCliError as error:
        report["errors"].append(str(error))
        return

    if not isinstance(payload, dict):
        report["errors"].append("sync job must be a JSON object")
        return

    report["syncJob"] = {
        "syncJobId": payload.get("syncJobId"),
        "projectId": payload.get("projectId"),
        "branchId": payload.get("branchId"),
        "title": payload.get("title"),
        "status": payload.get("status"),
        "uploadedInputCount": len(payload.get("uploadedInputs", []))
        if isinstance(payload.get("uploadedInputs"), list)
        else 0,
    }


def add_local_media_map_status(report: dict[str, Any], media_map_path: Path) -> None:
    if not media_map_path.is_file():
        return

    try:
        payload = load_json_file(media_map_path, "local media map")
    except StudioCutCliError as error:
        report["errors"].append(str(error))
        return

    inputs = payload.get("inputs") if isinstance(payload, dict) else None
    report["localMediaMap"] = {
        "inputCount": len(inputs) if isinstance(inputs, dict) else 0,
        "episodeId": payload.get("episodeId") if isinstance(payload, dict) else None,
    }


def add_sync_report_status(report: dict[str, Any], sync_report_path: Path) -> None:
    if not sync_report_path.is_file():
        return

    try:
        payload = load_json_file(sync_report_path, "sync report")
    except StudioCutCliError as error:
        report["errors"].append(str(error))
        return

    if not isinstance(payload, dict):
        report["errors"].append("sync report must be a JSON object")
        return

    reference_rail = payload.get("referenceRail")
    track_offsets = payload.get("trackOffsets")
    global_warnings = payload.get("globalWarnings")
    report["syncReport"] = {
        "status": payload.get("status"),
        "referenceRailSegments": len(reference_rail.get("segments", []))
        if isinstance(reference_rail, dict) and isinstance(reference_rail.get("segments"), list)
        else 0,
        "referenceRailDurationMs": reference_rail.get("totalDurationMs")
        if isinstance(reference_rail, dict)
        else None,
        "trackOffsetCount": len(track_offsets) if isinstance(track_offsets, list) else 0,
        "lowConfidenceTracks": [
            str(offset.get("inputId") or offset.get("role"))
            for offset in track_offsets
            if isinstance(offset, dict)
            and isinstance(offset.get("confidence"), (int, float))
            and float(offset["confidence"]) < 0.35
        ]
        if isinstance(track_offsets, list)
        else [],
        "warningCount": len(global_warnings) if isinstance(global_warnings, list) else 0,
    }


def add_sync_map_status(report: dict[str, Any], sync_map_path: Path) -> None:
    if not sync_map_path.is_file():
        return

    try:
        sync_map = load_sync_map(sync_map_path)
    except StudioCutCliError as error:
        report["errors"].append(str(error))
        return

    report["syncMap"] = {
        "syncMapId": sync_map["syncMapId"],
        "projectId": sync_map["projectId"],
        "branchId": sync_map["branchId"],
        "durationMs": sync_map["canonicalTimeline"]["durationMs"],
        "assetCount": len(sync_map["assets"]),
        "referenceRailSegments": len(sync_map["referenceRail"]["segments"]),
        "roles": sorted(
            {
                str(asset.get("role"))
                for asset in sync_map["assets"]
                if isinstance(asset, dict) and asset.get("role")
            }
        ),
    }


def add_manifest_status(report: dict[str, Any], manifest_path: Path) -> None:
    if not manifest_path.is_file():
        return

    try:
        manifest = load_json_file(manifest_path, "manifest")
        validate_manifest(manifest)
    except StudioCutCliError as error:
        report["errors"].append(str(error))
        return

    report["manifest"] = {
        "id": manifest["id"],
        "title": manifest["title"],
        "durationMs": manifest["durationMs"],
        "hasProxyUrl": bool(manifest["sourceMonitorProxy"].get("url")),
        "hasLocalProxyPlaceholder": bool(
            manifest["sourceMonitorProxy"].get("localPlaceholderPath")
        ),
    }


def add_proxy_status(report: dict[str, Any], proxy_path: Path) -> None:
    if not proxy_path.is_file():
        return

    proxy_status: dict[str, Any] = {
        "path": str(proxy_path),
        "sizeBytes": proxy_path.stat().st_size,
        "durationMs": None,
        "resolution": None,
    }
    ffprobe_path = shutil.which("ffprobe")

    if ffprobe_path:
        duration_ms, probe_error = probe_media_duration_ms(
            ffprobe_path=ffprobe_path,
            media_path=proxy_path,
        )
        if probe_error:
            report["warnings"].append(f"could not inspect source-monitor proxy: {probe_error}")
        else:
            proxy_status["durationMs"] = duration_ms
            proxy_status["resolution"] = probe_video_resolution(
                ffprobe_path=ffprobe_path,
                media_path=proxy_path,
            )
    else:
        report["warnings"].append("ffprobe not found; source-monitor proxy not inspected")

    report["proxy"] = proxy_status


def add_decision_status(
    report: dict[str, Any], decisions_path: Path | None, session: dict[str, Any]
) -> None:
    if decisions_path is None:
        return

    try:
        decisions_payload = load_json_file(decisions_path, "decisions")
        decision_events = parse_decision_events(decisions_payload)
    except StudioCutCliError as error:
        report["errors"].append(str(error))
        return

    decision_status: dict[str, Any] = {
        "path": str(decisions_path),
        "eventCount": len(decision_events),
        "cutCount": sum(1 for event in decision_events if event["state"] == "cut"),
        "firstDecisionAtZero": bool(
            decision_events and int(decision_events[0]["sourceTimeMs"]) == 0
        ),
        "activeDurationMs": None,
        "cutDurationMs": None,
        "renderCommand": None,
    }

    manifest_path = session["manifestPath"]
    if manifest_path.is_file() and decision_events:
        try:
            manifest = load_json_file(manifest_path, "manifest")
            validate_manifest(manifest)
            plan = build_render_plan(
                manifest=manifest,
                decision_events=decision_events,
                profile="youtube_16x9",
                manifest_path=manifest_path,
                decisions_path=decisions_path,
            )
            decision_status["activeDurationMs"] = plan["summary"]["activeDurationMs"]
            decision_status["cutDurationMs"] = plan["summary"]["cutDurationMs"]
        except StudioCutCliError as error:
            report["warnings"].append(f"could not derive decision render plan: {error}")

    decision_status["renderCommand"] = format_shell_command(
        [
            sys.executable,
            str(Path(__file__)),
            "render-from-sync-map",
            "--sync-map",
            str(session["syncMapPath"]),
            "--decisions",
            str(decisions_path),
            "--media-map",
            str(session["localMediaMapPath"]),
            "--out",
            str(session["rendersDir"] / f"{session['episodeId']}-youtube-16x9.mp4"),
        ]
    )
    report["decisions"] = decision_status


def build_rescue_sync_next_actions(
    report: dict[str, Any], session: dict[str, Any]
) -> list[str]:
    if not Path(report["episodeDir"]).exists():
        return [
            "Create the episode workspace with rescue-sync-session.",
        ]

    if not report["readiness"]["inputReady"]:
        missing = ", ".join(
            RESCUE_SYNC_ROLE_SPECS[role]["label"]
            for role in report["missingRequiredRoles"]
        )
        return [
            f"Add missing files to inbox: {missing}.",
            "Rerun rescue-sync-session when the files are present.",
        ]

    if not report["readiness"]["workerOutputsReady"]:
        return [
            "Run rescue-sync-session without --skip-worker to generate the proxy package.",
            format_shell_command(
                [
                    sys.executable,
                    str(Path(__file__)),
                    "rescue-sync-session",
                    "--episode-id",
                    session["episodeId"],
                    "--title",
                    str((report.get("syncJob") or {}).get("title") or session["title"]),
                    "--episode-dir",
                    str(session["episodeDir"]),
                ]
            ),
        ]

    if not report["readiness"]["editDecisionsReady"]:
        return [
            "Publish the generated package in Studio Cut using Publish Rescue Sync Package.",
            "After publish, confirm Shared Room Diagnostics and Sync Review both show attached generated package metadata.",
            "Edit the shared room, then export decisions into the edit/ folder.",
        ]

    if not report["readiness"]["renderReady"]:
        return [
            "Fix Sync Map, local media map, or decision JSON blockers before rendering.",
        ]

    return [
        "Ready to dry-run local render from Sync Map.",
        str(report["decisions"]["renderCommand"]) + " --dry-run",
    ]


def print_rescue_sync_status_report(report: dict[str, Any], *, json_mode: bool) -> None:
    if json_mode:
        print(json.dumps(report, indent=2))
        return

    print("Studio Cut Rescue Sync Status")
    print("=============================")
    print(f"Status: {'READY' if report['status'] == 'ready' else 'BLOCKED'}")
    print(f"Episode: {report['episodeId']}")
    print(f"Workspace: {report['episodeDir']}")

    readiness = report["readiness"]
    print("\nReadiness:")
    print(f"  input files: {yes_no(readiness['inputReady'])}")
    print(f"  worker outputs: {yes_no(readiness['workerOutputsReady'])}")
    print(f"  publish package: {yes_no(readiness['publishReady'])}")
    print(f"  decisions: {yes_no(readiness['editDecisionsReady'])}")
    print(f"  local render: {yes_no(readiness['renderReady'])}")

    print("\nInputs:")
    for entry in report["inputs"]:
        required = "required" if entry["required"] else "optional"
        print(f"  - {entry['label']} ({required}): {entry['count']}")
        for file_path in entry["files"]:
            print(f"    {Path(file_path).name}")

    print("\nGenerated files:")
    for label, file_status in report["files"].items():
        print(
            f"  - {label}: {'found' if file_status['exists'] else 'missing'} "
            f"({file_status['path']})"
        )

    if report.get("syncReport"):
        sync_report = report["syncReport"]
        print("\nSync report:")
        print(f"  status: {sync_report['status']}")
        print(f"  reference rail segments: {sync_report['referenceRailSegments']}")
        print(
            "  reference rail duration: "
            f"{format_time_ms(sync_report['referenceRailDurationMs'] or 0)}"
        )
        print(f"  track offsets: {sync_report['trackOffsetCount']}")
        if sync_report["lowConfidenceTracks"]:
            print("  low confidence tracks: " + ", ".join(sync_report["lowConfidenceTracks"]))

    if report.get("syncMap"):
        sync_map = report["syncMap"]
        print("\nSync Map:")
        print(f"  id: {sync_map['syncMapId']}")
        print(f"  duration: {format_time_ms(sync_map['durationMs'])}")
        print(f"  assets: {sync_map['assetCount']}")
        print(f"  roles: {', '.join(sync_map['roles'])}")

    if report.get("proxy"):
        proxy = report["proxy"]
        print("\nSource-monitor proxy:")
        print(f"  size: {proxy['sizeBytes']} bytes")
        if proxy["durationMs"] is not None:
            print(f"  duration: {format_time_ms(proxy['durationMs'])}")
        if proxy["resolution"]:
            print(
                "  resolution: "
                f"{proxy['resolution']['width']}x{proxy['resolution']['height']}"
            )

    if report.get("publishPackage"):
        publish_package = report["publishPackage"]
        print("\nPublish package:")
        print(f"  Studio Cut: {publish_package['studioCutUrl']}")
        print(f"  Room link: {publish_package['shareUrl']}")
        print("  Select these files in Publish Rescue Sync Package:")
        for label, path_value in publish_package["files"].items():
            print(f"    - {label}: {path_value}")
        expected = publish_package["expectedSyncReview"]
        print("  Sync Review should show:")
        print(f"    - Sync Map attached: {yes_no(expected['syncMapAttached'])}")
        print(f"    - Sync report attached: {yes_no(expected['syncReportAttached'])}")
        if expected.get("referencePieces") is not None:
            print(f"    - Reference pieces: {expected['referencePieces']}")
        if expected.get("trackOffsets") is not None:
            print(f"    - Track offsets: {expected['trackOffsets']}")

    if report.get("decisions"):
        decisions = report["decisions"]
        print("\nDecisions:")
        print(f"  file: {decisions['path']}")
        print(f"  events: {decisions['eventCount']}")
        print(f"  cuts: {decisions['cutCount']}")
        print(f"  first decision at 0: {yes_no(decisions['firstDecisionAtZero'])}")
        if decisions["activeDurationMs"] is not None:
            print(f"  active duration: {format_time_ms(decisions['activeDurationMs'])}")

    if report["warnings"]:
        print("\nWarnings:")
        for warning in report["warnings"]:
            print(f"  - {warning}")

    if report["errors"]:
        print("\nErrors:")
        for error in report["errors"]:
            print(f"  - {error}")

    print("\nNext actions:")
    for action in report["nextActions"]:
        print(f"  - {action}")


def validate_agent_smoke_output(
    *,
    output_path: Path,
    ffprobe_path: str | None,
    source_duration_ms: int,
    expected_output_duration_ms: int,
    report: dict[str, Any],
) -> None:
    errors = report["errors"]
    warnings = report["warnings"]
    commands_run = report["commandsRun"]

    if not output_path.is_file():
        errors.append(f"output MP4 was not written: {output_path}")
        return

    if not ffprobe_path:
        warnings.append("ffprobe unavailable; output duration/resolution not checked")
        return

    command = [
        ffprobe_path,
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-show_entries",
        "stream=codec_type,width,height,sample_rate,channels,channel_layout",
        "-of",
        "json",
        str(output_path),
    ]
    result = run_command_capture(command, "agent smoke ffprobe output", commands_run)
    payload = json.loads(result.stdout)
    actual_duration_ms = int(round(float(payload["format"]["duration"]) * 1000))
    report["actualOutputDurationMs"] = actual_duration_ms

    video_stream = next(
        (
            stream
            for stream in payload.get("streams", [])
            if stream.get("codec_type") == "video"
        ),
        None,
    )

    if not video_stream:
        errors.append("output has no video stream")
        return

    width = video_stream.get("width")
    height = video_stream.get("height")
    report["actualOutputResolution"] = {"width": width, "height": height}

    if width != YOUTUBE_16X9_WIDTH or height != YOUTUBE_16X9_HEIGHT:
        errors.append(f"expected 1920x1080 output, got {width}x{height}")

    audio_stream = next(
        (
            stream
            for stream in payload.get("streams", [])
            if stream.get("codec_type") == "audio"
        ),
        None,
    )

    if not audio_stream:
        errors.append("output has no audio stream")
    else:
        sample_rate = audio_stream.get("sample_rate")
        channels = audio_stream.get("channels")
        report["actualOutputAudio"] = {
            "sampleRate": int(sample_rate) if str(sample_rate).isdigit() else sample_rate,
            "channels": channels,
            "channelLayout": audio_stream.get("channel_layout"),
        }

        if str(sample_rate) != str(RENDER_AUDIO_SAMPLE_RATE):
            errors.append(
                f"expected {RENDER_AUDIO_SAMPLE_RATE}Hz audio, got {sample_rate}"
            )

        if channels != 2:
            errors.append(f"expected stereo audio, got {channels} channel(s)")

    if actual_duration_ms >= source_duration_ms:
        errors.append(
            "expected output duration to be shorter than source duration after Cut skip"
        )

    if abs(actual_duration_ms - expected_output_duration_ms) > 1500:
        errors.append(
            "output duration differs from expected by more than 1500ms: "
            f"actual={actual_duration_ms} expected={expected_output_duration_ms}"
        )


def validate_agent_smoke_sync_map_render_qa(
    *, qa_path: Path, report: dict[str, Any]
) -> None:
    errors = report["errors"]

    if not qa_path.is_file():
        errors.append(f"Sync Map render QA JSON was not written: {qa_path}")
        return

    try:
        qa = json.loads(qa_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        errors.append(f"Sync Map render QA JSON is not readable: {error}")
        return

    summary = qa.get("summary") if isinstance(qa, dict) else None
    segments = qa.get("segments") if isinstance(qa, dict) else None

    if qa.get("kind") != "studio-cut-sync-map-render-qa":
        errors.append("Sync Map render QA kind is incorrect")

    if not isinstance(summary, dict):
        errors.append("Sync Map render QA summary is missing")
        return

    if not isinstance(segments, list):
        errors.append("Sync Map render QA segments are missing")
        return

    report["syncMapRenderQa"] = {
        "audioMode": summary.get("audioMode"),
        "segmentCount": summary.get("segmentCount"),
        "totalBlackPaddingMs": summary.get("totalBlackPaddingMs"),
        "silencePaddingMs": summary.get("silencePaddingMs"),
        "warningCount": summary.get("warningCount"),
    }

    if summary.get("audioMode") != "clean_mix":
        errors.append(
            f"expected Sync Map render QA audioMode clean_mix, got {summary.get('audioMode')}"
        )

    expected_segment_count = len(AGENT_SMOKE_EXPECTED_ACTIVE_STATES)
    if summary.get("segmentCount") != expected_segment_count:
        errors.append(
            "expected Sync Map render QA active segment count "
            f"{expected_segment_count}, got {summary.get('segmentCount')}"
        )

    if int(summary.get("totalBlackPaddingMs") or 0) <= 0:
        errors.append("expected Sync Map render QA to report black padding")

    states = [segment.get("programState") for segment in segments]
    if states != AGENT_SMOKE_EXPECTED_ACTIVE_STATES:
        errors.append(f"unexpected Sync Map render QA state order: {states}")

    if any(segment.get("programState") == "cut" for segment in segments):
        errors.append("Sync Map render QA should not include Cut active segments")

    local_path_markers = ("/private/", "/tmp/", str(Path.home()))
    qa_text = json.dumps(qa)
    if any(marker and marker in qa_text for marker in local_path_markers):
        errors.append("Sync Map render QA leaked a local filesystem path")


def print_agent_smoke_report(report: dict[str, Any], *, json_mode: bool) -> None:
    if json_mode:
        print(json.dumps(report, indent=2))
        return

    print("Studio Cut Agent Smoke Test")
    print("===========================")
    print(f"Status: {report['status']}")
    print(f"Workdir: {report['workdir']}")
    print(f"Workdir kept: {report['workdirKept']}")
    print(f"Source duration: {format_time_ms(report['sourceDurationMs'])}")
    print(f"Expected Cut duration: {format_time_ms(report['expectedCutDurationMs'])}")
    print(
        "Expected output duration: "
        f"{format_time_ms(report['expectedOutputDurationMs'])}"
    )
    print(
        "Golden assertions: "
        f"{report['goldenAssertionCount']} checked, "
        f"{'passed' if report['goldenAssertionsPassed'] else 'failed'}"
    )

    if report.get("actualOutputDurationMs") is not None:
        print(f"Actual output duration: {format_time_ms(report['actualOutputDurationMs'])}")

    if report.get("actualOutputResolution"):
        resolution = report["actualOutputResolution"]
        print(f"Actual output resolution: {resolution['width']}x{resolution['height']}")

    if report.get("actualOutputAudio"):
        audio = report["actualOutputAudio"]
        print(
            "Actual output audio: "
            f"{audio['sampleRate']}Hz / {audio['channels']} channel(s)"
        )

    if report.get("syncMapRenderQa"):
        qa = report["syncMapRenderQa"]
        print(
            "Sync Map render QA: "
            f"{qa['audioMode']}, {qa['segmentCount']} segments, "
            f"{format_time_ms(qa['totalBlackPaddingMs'])} black padding"
        )

    print("\nGenerated files:")
    for label, path in sorted(report["generatedFiles"].items()):
        print(f"  {label}: {path}")

    if report["warnings"]:
        print("\nWarnings:")
        for warning in report["warnings"]:
            print(f"  - {warning}")

    if report["errors"]:
        print("\nErrors:")
        for error in report["errors"]:
            print(f"  - {error}")

    if report["goldenAssertionFailures"]:
        print("\nGolden assertion failures:")
        for failure in report["goldenAssertionFailures"]:
            print(f"  - {failure}")

    print("\nCommands run:")
    for command in report["commandsRun"]:
        print(f"  {command}")


def run_render_youtube_16x9_aligned(args: argparse.Namespace) -> int:
    ffmpeg_path = shutil.which("ffmpeg")
    if not ffmpeg_path and not args.dry_run:
        raise StudioCutCliError(
            "ffmpeg is not available on PATH; install ffmpeg before rendering aligned media."
        )

    manifest, decision_events = load_inputs(args.manifest, args.decisions)
    media_map = load_media_map(args.media_map)

    if media_map["episodeId"] != manifest["id"]:
        raise StudioCutCliError(
            "media-map episodeId does not match manifest id: "
            f"{media_map['episodeId']} != {manifest['id']}"
        )

    plan = build_render_plan(
        manifest=manifest,
        decision_events=decision_events,
        profile="youtube_16x9",
        manifest_path=args.manifest,
        decisions_path=args.decisions,
    )
    segments = plan["activeSegments"]

    if not segments:
        raise StudioCutCliError("render plan has no active non-Cut segments to render.")

    validate_aligned_media_for_plan(
        media_map=media_map,
        media_map_path=args.media_map,
        segments=segments,
        require_existing=not args.dry_run,
    )

    print_render_plan(plan)
    print_media_map_summary(media_map, args.media_map)

    if not media_map["audio"].get("program"):
        print(
            "\nwarning: media map has no audio.program file; aligned renderer will use silent audio.",
            file=sys.stderr,
        )

    ffmpeg_bin = ffmpeg_path or "ffmpeg"

    if args.dry_run:
        print("\nDry run: no files will be rendered.")
        print_aligned_render_commands(
            ffmpeg_path=ffmpeg_bin,
            media_map=media_map,
            media_map_path=args.media_map,
            segments=segments,
            out_path=args.out,
            temp_path=Path("<temp>"),
        )
        return 0

    args.out.parent.mkdir(parents=True, exist_ok=True)

    if args.keep_temp:
        temp_path = Path(tempfile.mkdtemp(prefix="studio-cut-youtube16x9-"))
        render_youtube_16x9_segments(
            ffmpeg_path=ffmpeg_bin,
            media_map=media_map,
            media_map_path=args.media_map,
            segments=segments,
            out_path=args.out,
            temp_path=temp_path,
        )
        print(f"\nKept temporary segment directory: {temp_path}")
    else:
        with tempfile.TemporaryDirectory(prefix="studio-cut-youtube16x9-") as temp_dir:
            render_youtube_16x9_segments(
                ffmpeg_path=ffmpeg_bin,
                media_map=media_map,
                media_map_path=args.media_map,
                segments=segments,
                out_path=args.out,
                temp_path=Path(temp_dir),
            )

    print(f"\nAligned 16:9 render complete: {args.out}")
    return 0


def run_render_from_sync_map(args: argparse.Namespace) -> int:
    ffmpeg_path = shutil.which("ffmpeg")
    if not ffmpeg_path and not args.dry_run:
        raise StudioCutCliError(
            "ffmpeg is not available on PATH; install ffmpeg before rendering from a Sync Map."
        )

    sync_map = load_sync_map(args.sync_map)
    decisions_payload = load_json_file(args.decisions, "decisions")
    decision_events = parse_decision_events(decisions_payload)
    media_map = load_sync_map_render_media_map(args.media_map)

    if media_map["episodeId"] != sync_map["projectId"]:
        print(
            "warning: media-map episodeId does not match Sync Map projectId: "
            f"{media_map['episodeId']} != {sync_map['projectId']}",
            file=sys.stderr,
        )

    manifest = build_manifest_from_sync_map(sync_map)
    plan = build_render_plan(
        manifest=manifest,
        decision_events=decision_events,
        profile="youtube_16x9",
        manifest_path=args.sync_map,
        decisions_path=args.decisions,
    )
    segments = plan["activeSegments"]

    if not segments:
        raise StudioCutCliError("render plan has no active non-Cut segments to render.")

    resolved_media = build_sync_map_render_media(
        sync_map=sync_map,
        media_map=media_map,
        media_map_path=args.media_map,
        segments=segments,
        require_existing=not args.dry_run,
    )

    print_render_plan(plan)
    print_sync_map_render_summary(
        sync_map=sync_map,
        media_map=media_map,
        media_map_path=args.media_map,
        resolved_media=resolved_media,
    )
    qa_report = build_sync_map_render_qa_report(
        sync_map=sync_map,
        plan=plan,
        media_map=media_map,
        media_map_path=args.media_map,
        resolved_media=resolved_media,
        out_path=args.out,
        dry_run=bool(args.dry_run),
    )
    print_sync_map_render_qa_summary(
        qa_report,
        out_path=args.out_qa if getattr(args, "out_qa", None) else None,
    )

    if getattr(args, "out_qa", None):
        write_json(args.out_qa, qa_report)

    if not media_map["audio"].get("program") and not resolved_media.get("__audio_assets__"):
        print(
            "\nwarning: media map has no audio.program file; Sync Map renderer will use silent audio.",
            file=sys.stderr,
        )

    ffmpeg_bin = ffmpeg_path or "ffmpeg"

    if args.dry_run:
        print("\nDry run: no files will be rendered.")
        print_sync_map_render_commands(
            ffmpeg_path=ffmpeg_bin,
            media_map=media_map,
            media_map_path=args.media_map,
            segments=segments,
            resolved_media=resolved_media,
            out_path=args.out,
            temp_path=Path("<temp>"),
        )
        return 0

    args.out.parent.mkdir(parents=True, exist_ok=True)

    if args.keep_temp:
        temp_path = Path(tempfile.mkdtemp(prefix="studio-cut-sync-map16x9-"))
        render_sync_map_youtube_16x9_segments(
            ffmpeg_path=ffmpeg_bin,
            media_map=media_map,
            media_map_path=args.media_map,
            segments=segments,
            resolved_media=resolved_media,
            out_path=args.out,
            temp_path=temp_path,
        )
        print(f"\nKept temporary segment directory: {temp_path}")
    else:
        with tempfile.TemporaryDirectory(prefix="studio-cut-sync-map16x9-") as temp_dir:
            render_sync_map_youtube_16x9_segments(
                ffmpeg_path=ffmpeg_bin,
                media_map=media_map,
                media_map_path=args.media_map,
                segments=segments,
                resolved_media=resolved_media,
                out_path=args.out,
                temp_path=Path(temp_dir),
            )

    print(f"\nSync Map 16:9 render complete: {args.out}")
    return 0


def run_agent_smoke_test(args: argparse.Namespace) -> int:
    if args.workdir:
        workdir = args.workdir
        workdir.mkdir(parents=True, exist_ok=True)
        report = execute_agent_smoke_test(
            workdir=workdir,
            workdir_kept=True,
            skip_render=args.skip_render,
        )
        print_agent_smoke_report(report, json_mode=args.json)
        return 0 if report["status"] == "pass" else 1

    if args.keep_workdir:
        workdir = Path(tempfile.mkdtemp(prefix="studio-cut-agent-smoke-"))
        report = execute_agent_smoke_test(
            workdir=workdir,
            workdir_kept=True,
            skip_render=args.skip_render,
        )
        print_agent_smoke_report(report, json_mode=args.json)
        return 0 if report["status"] == "pass" else 1

    with tempfile.TemporaryDirectory(prefix="studio-cut-agent-smoke-") as temp_dir:
        report = execute_agent_smoke_test(
            workdir=Path(temp_dir),
            workdir_kept=False,
            skip_render=args.skip_render,
        )
        print_agent_smoke_report(report, json_mode=args.json)
        return 0 if report["status"] == "pass" else 1


def run_create_episode_bootstrap(args: argparse.Namespace) -> int:
    episode_id = args.episode_id.strip()
    title = args.title.strip()
    duration_ms = args.duration_ms
    include_clip = bool(args.include_clip)
    out_dir = args.out_dir

    if not episode_id:
        raise StudioCutCliError("--episode-id must be a non-empty string")

    if not title:
        raise StudioCutCliError("--title must be a non-empty string")

    if duration_ms <= 0:
        raise StudioCutCliError("--duration-ms must be a positive integer")

    out_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = out_dir / f"{episode_id}-episode-manifest.json"
    media_map_path = out_dir / f"{episode_id}-local-media.json"
    readme_path = out_dir / "README.md"
    manifest = build_episode_bootstrap_manifest(
        episode_id=episode_id,
        title=title,
        duration_ms=duration_ms,
        include_clip=include_clip,
    )
    media_map = build_episode_bootstrap_media_map(
        episode_id=episode_id,
        include_clip=include_clip,
    )

    write_json(manifest_path, manifest)
    write_json(media_map_path, media_map)
    readme_path.write_text(
        build_episode_bootstrap_readme(
            episode_id=episode_id,
            title=title,
            duration_ms=duration_ms,
            include_clip=include_clip,
            manifest_path=manifest_path,
            media_map_path=media_map_path,
        ),
        encoding="utf-8",
    )

    print("Studio Cut Episode Bootstrap")
    print("============================")
    print(f"Episode: {title} ({episode_id})")
    print(f"Duration: {format_time_ms(duration_ms)}")
    print(f"Clip source included: {'yes' if include_clip else 'no'}")
    print(f"Output directory: {out_dir}")
    print(f"Manifest: {manifest_path}")
    print(f"Local media map: {media_map_path}")
    print(f"Next steps: {readme_path}")
    return 0


def run_rescue_sync_session(args: argparse.Namespace) -> int:
    episode_id = args.episode_id.strip()
    title = args.title.strip()
    branch_id = args.branch_id.strip()
    created_by = args.created_by.strip()
    include_clip = bool(args.include_clip)

    if not episode_id:
        raise StudioCutCliError("--episode-id must be a non-empty string")
    if not title:
        raise StudioCutCliError("--title must be a non-empty string")
    if not branch_id:
        raise StudioCutCliError("--branch-id must be a non-empty string")
    if not created_by:
        raise StudioCutCliError("--created-by must be a non-empty string")

    episode_dir = (
        args.episode_dir.expanduser()
        if args.episode_dir
        else DEFAULT_STUDIO_CUT_WORKSPACE_ROOT / episode_id
    ).resolve()
    session = build_rescue_sync_session(
        episode_id=episode_id,
        title=title,
        branch_id=branch_id,
        created_by=created_by,
        episode_dir=episode_dir,
        include_clip=include_clip,
    )

    for directory in (
        session["episodeDir"],
        session["inboxDir"],
        session["generatedDir"],
        session["editDir"],
        session["checkpointsDir"],
        session["rendersDir"],
    ):
        directory.mkdir(parents=True, exist_ok=True)

    write_json(session["syncJobPath"], session["syncJob"])
    write_json(session["localMediaMapPath"], session["localMediaMap"])
    session["readmePath"].write_text(
        build_rescue_sync_session_readme(session),
        encoding="utf-8",
    )

    print_rescue_sync_session_report(session)

    can_run_worker = not session["missingRequiredRoles"]
    if args.skip_worker:
        print("\nWorker skipped by --skip-worker.")
        return 0

    if not can_run_worker:
        print("\nWorker not run because required files are missing.")
        return 0

    ffmpeg_path = shutil.which("ffmpeg")
    ffprobe_path = shutil.which("ffprobe")
    if not ffmpeg_path or not ffprobe_path:
        raise StudioCutCliError(
            "ffmpeg and ffprobe are required to run the Rescue Sync worker. "
            "Install ffmpeg or rerun with --skip-worker to scaffold only."
        )

    command = build_rescue_sync_worker_command(session)
    print("\nRunning Rescue Sync worker:")
    print(f"  {format_shell_command(command)}")
    run_command(command, "Rescue Sync worker")
    print("\nRescue Sync session complete.")
    print(f"Generated package: {session['generatedDir']}")
    return 0


def infer_rescue_sync_episode_id(episode_dir: Path) -> str:
    generated_dir = episode_dir / "generated"
    candidates = [
        (generated_dir / "episode-manifest.json", "id"),
        (generated_dir / "sync-map.json", "projectId"),
        (generated_dir / "sync-job.json", "projectId"),
    ]

    for path, key in candidates:
        if not path.is_file():
            continue

        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue

        if isinstance(payload, dict) and isinstance(payload.get(key), str):
            value = payload[key].strip()
            if value:
                return value

    return episode_dir.name


def run_rescue_sync_status(args: argparse.Namespace) -> int:
    episode_dir = args.episode_dir.expanduser().resolve() if args.episode_dir else None
    episode_id = args.episode_id.strip() if args.episode_id else None

    if not episode_id and episode_dir:
        episode_id = infer_rescue_sync_episode_id(episode_dir)

    if not episode_id:
        raise StudioCutCliError("--episode-id is required when --episode-dir is not supplied")

    if episode_dir is None:
        episode_dir = (DEFAULT_STUDIO_CUT_WORKSPACE_ROOT / episode_id).resolve()

    session = build_rescue_sync_session(
        episode_id=episode_id,
        title=episode_id,
        branch_id="main",
        created_by="local-rescue-sync-status",
        episode_dir=episode_dir,
        include_clip=bool(args.include_clip),
    )
    report = build_rescue_sync_status_report(session)
    print_rescue_sync_status_report(report, json_mode=bool(args.json))
    return 0


def run_agent_workspace_index(args: argparse.Namespace) -> int:
    episode_dir = args.episode_dir.expanduser().resolve() if args.episode_dir else None
    episode_id = args.episode_id.strip() if args.episode_id else None

    if not episode_id and episode_dir:
        episode_id = infer_rescue_sync_episode_id(episode_dir)

    if not episode_id:
        raise StudioCutCliError("--episode-id is required when --episode-dir is not supplied")

    if episode_dir is None:
        episode_dir = (DEFAULT_STUDIO_CUT_WORKSPACE_ROOT / episode_id).resolve()

    session = build_rescue_sync_session(
        episode_id=episode_id,
        title=episode_id,
        branch_id="main",
        created_by="local-agent-workspace-index",
        episode_dir=episode_dir,
        include_clip=bool(args.include_clip),
    )
    status_report = build_rescue_sync_status_report(session)
    index = build_agent_workspace_index(session, status_report)

    if args.out:
        write_json(args.out, index)

    if args.json:
        print(json.dumps(index, indent=2))
    else:
        print_agent_workspace_index(index, out_path=args.out)

    return 0 if not index["errors"] else 1


def print_agent_workspace_index(
    index: dict[str, Any], *, out_path: Path | None
) -> None:
    print("Studio Cut Agent Workspace Index")
    print("================================")
    print(f"Episode: {index['episode']['id']}")
    print(f"Status: {'READY' if index['status'] == 'ready' else 'BLOCKED'}")
    print("Path policy: relative paths only; private absolute paths omitted.")
    if out_path:
        print(f"Wrote: {out_path}")

    print("\nReadiness:")
    for key, value in index["readiness"].items():
        print(f"  - {key}: {yes_no(bool(value))}")

    print("\nKey files:")
    for key in (
        "syncJob",
        "localMediaMap",
        "syncReport",
        "syncMap",
        "manifest",
        "sourceMonitorProxy",
    ):
        entry = index["files"][key]
        print(f"  - {entry['label']}: {entry['path']} ({'yes' if entry['exists'] else 'missing'})")

    if index["agentNextActions"]:
        print("\nAgent next actions:")
        for action in index["agentNextActions"]:
            print(f"  - {action}")


def run_render_rescue_sync_session(args: argparse.Namespace) -> int:
    episode_dir = args.episode_dir.expanduser().resolve() if args.episode_dir else None
    episode_id = args.episode_id.strip() if args.episode_id else None

    if not episode_id and episode_dir:
        episode_id = infer_rescue_sync_episode_id(episode_dir)

    if not episode_id:
        raise StudioCutCliError("--episode-id is required when --episode-dir is not supplied")

    if episode_dir is None:
        episode_dir = (DEFAULT_STUDIO_CUT_WORKSPACE_ROOT / episode_id).resolve()

    session = build_rescue_sync_session(
        episode_id=episode_id,
        title=episode_id,
        branch_id="main",
        created_by="local-rescue-sync-render",
        episode_dir=episode_dir,
        include_clip=bool(args.include_clip),
    )
    report = build_rescue_sync_status_report(session)

    blockers = list(report["errors"])
    if not Path(session["syncMapPath"]).is_file():
        blockers.append(f"missing Sync Map: {session['syncMapPath']}")
    if not Path(session["localMediaMapPath"]).is_file():
        blockers.append(f"missing local media map: {session['localMediaMapPath']}")

    decision_report = report.get("decisions") or {}
    if not decision_report.get("eventCount"):
        blockers.append(
            "missing Studio Cut decisions; export decisions into "
            f"{session['editDir'] / f'{episode_id}-decisions.json'}"
        )

    if blockers:
        details = "\n".join(f"- {blocker}" for blocker in blockers)
        next_actions = "\n".join(f"- {action}" for action in report["nextActions"])
        raise StudioCutCliError(
            "Rescue Sync session is not ready to render.\n"
            f"{details}\n\nNext actions:\n{next_actions}"
        )

    out_path = (
        args.out.expanduser().resolve()
        if args.out
        else session["rendersDir"] / f"{episode_id}-youtube-16x9.mp4"
    )
    qa_out_path = (
        args.out_qa.expanduser().resolve()
        if args.out_qa
        else session["rendersDir"] / f"{episode_id}-render-qa.json"
    )

    print("Studio Cut Rescue Sync Session Render")
    print("=====================================")
    print(f"Episode: {episode_id}")
    print(f"Session: {session['episodeDir']}")
    print(f"Sync Map: {session['syncMapPath']}")
    print(f"Decisions: {decision_report['path']}")
    print(f"Local media map: {session['localMediaMapPath']}")
    print(f"Output: {out_path}")
    print(f"Render QA: {qa_out_path}")

    render_args = argparse.Namespace(
        sync_map=session["syncMapPath"],
        decisions=Path(decision_report["path"]),
        media_map=session["localMediaMapPath"],
        out=out_path,
        out_qa=qa_out_path,
        dry_run=bool(args.dry_run),
        keep_temp=bool(args.keep_temp),
    )
    return run_render_from_sync_map(render_args)


def run_validate_episode_files(args: argparse.Namespace) -> int:
    if args.duration_tolerance_ms < 0:
        raise StudioCutCliError("--duration-tolerance-ms must be zero or greater")

    report = build_episode_file_validation_report(
        manifest_path=args.manifest,
        media_map_path=args.media_map,
        decisions_path=args.decisions,
        profile=args.profile,
        duration_tolerance_ms=args.duration_tolerance_ms,
    )
    print_episode_file_validation_report(report)
    return 0 if not report["errors"] else 1


def run_validate_generated_package(args: argparse.Namespace) -> int:
    if args.duration_tolerance_ms < 0:
        raise StudioCutCliError("--duration-tolerance-ms must be zero or greater")

    report = build_generated_package_validation_report(
        manifest_path=args.manifest,
        proxy_path=args.proxy,
        sync_map_path=args.sync_map,
        sync_report_path=args.sync_report,
        duration_tolerance_ms=args.duration_tolerance_ms,
    )

    if args.json:
        print(json.dumps(report, indent=2))
    else:
        print_generated_package_validation_report(report)

    return 0 if not report["errors"] else 1


def run_agent_review_edit(args: argparse.Namespace) -> int:
    manifest, decision_events = load_inputs(args.manifest, args.decisions)
    transcript = (
        parse_episode_transcript(
            load_json_file(args.transcript, "transcript"),
            manifest=manifest,
        )
        if args.transcript
        else None
    )
    report = build_agent_edit_review_report(
        manifest=manifest,
        decision_events=decision_events,
        profile=args.profile,
        manifest_path=args.manifest,
        decisions_path=args.decisions,
        transcript=transcript,
        transcript_path=args.transcript,
    )

    if args.out:
        write_json(args.out, report)

    if args.out_ops:
        suggested_ops = build_agent_suggested_ops_payload(
            report=report,
            manifest=manifest,
            decision_events=decision_events,
        )
        write_json(args.out_ops, suggested_ops)

    if args.json:
        print(json.dumps(report, indent=2))
    else:
        print_agent_edit_review_report(report)
        if args.out:
            print(f"\nWrote agent edit review JSON: {args.out}")
        if args.out_ops:
            print(f"Wrote suggested agent ops JSON: {args.out_ops}")

    return 0 if not report["errors"] else 1


def run_apply_decision_ops(args: argparse.Namespace) -> int:
    manifest, decision_events = load_inputs(args.manifest, args.decisions)
    ops_payload = load_json_file(args.ops, "agent decision operations")
    result = apply_agent_decision_ops(
        manifest=manifest,
        decision_events=decision_events,
        ops_payload=ops_payload,
        created_by=args.created_by,
    )

    if args.dry_run:
        print_agent_decision_ops_result(result, dry_run=True, out_path=args.out)
        return 0 if not result["errors"] else 1

    if result["errors"]:
        print_agent_decision_ops_result(result, dry_run=False, out_path=args.out)
        return 1

    output_payload = {
        "schemaVersion": 1,
        "exportedAt": result["appliedAt"],
        "projectId": result["projectId"],
        "branchId": result["branchId"],
        "decisionEvents": result["decisionEvents"],
        "agentEdit": {
            "appliedAt": result["appliedAt"],
            "createdBy": args.created_by,
            "operationCount": result["operationCount"],
            "appliedOperationCount": result["appliedOperationCount"],
            "dryRun": False,
        },
    }
    write_json(args.out, output_payload)
    print_agent_decision_ops_result(result, dry_run=False, out_path=args.out)
    return 0


def run_agent_edit_session(args: argparse.Namespace) -> int:
    episode_dir = args.episode_dir.expanduser().resolve()
    episode_id = args.episode_id.strip() if args.episode_id else None

    if not episode_id:
        episode_id = infer_rescue_sync_episode_id(episode_dir)

    if not episode_id:
        raise StudioCutCliError("--episode-id is required when it cannot be inferred")

    session = build_rescue_sync_session(
        episode_id=episode_id,
        title=episode_id,
        branch_id="main",
        created_by=args.created_by,
        episode_dir=episode_dir,
        include_clip=True,
    )
    status_report = build_rescue_sync_status_report(session)
    out_dir = args.out_dir.expanduser().resolve() if args.out_dir else session["generatedDir"]
    out_dir.mkdir(parents=True, exist_ok=True)

    output_paths = {
        "workspaceIndex": out_dir / "agent-workspace-index.json",
        "review": out_dir / "agent-edit-review.json",
        "suggestedOps": out_dir / "agent-suggested-ops.json",
        "session": out_dir / "agent-edit-session.json",
        "rationale": out_dir / "agent-edit-session.md",
        "previewDecisions": session["editDir"] / f"{episode_id}-agent-preview-decisions.json",
        "renderQa": session["rendersDir"] / f"{episode_id}-render-qa.json",
        "visualReview": out_dir / "agent-visual-review.json",
        "contactSheet": out_dir / "agent-contact-sheet.jpg",
    }

    workspace_index = build_agent_workspace_index(session, status_report)
    write_json(output_paths["workspaceIndex"], workspace_index)

    manifest_path = session["manifestPath"]
    decisions_path_value = (
        status_report.get("decisions", {}).get("path")
        if isinstance(status_report.get("decisions"), dict)
        else None
    )
    decisions_path = Path(decisions_path_value) if decisions_path_value else None
    transcript_path = find_agent_edit_session_transcript_path(
        session=session,
        explicit_path=args.transcript,
    )
    report_errors: list[str] = []
    report_warnings: list[str] = []
    review: dict[str, Any] | None = None
    suggested_ops: dict[str, Any] | None = None
    operation_preview: dict[str, Any] | None = None
    render_qa: dict[str, Any] | None = None
    visual_review: dict[str, Any] | None = None
    manifest_payload: dict[str, Any] | None = None
    preview_decisions_written = False

    if not manifest_path.is_file():
        report_errors.append(f"missing Episode Manifest: {manifest_path}")
    if not decisions_path or not decisions_path.is_file():
        report_errors.append(
            "missing Studio Cut decision export; expected one of: "
            + ", ".join(str(path) for path in get_rescue_sync_decision_candidates(session))
        )

    if not report_errors:
        manifest = load_json_file(manifest_path, "manifest")
        validate_manifest(manifest)
        manifest_payload = manifest
        decisions_payload = load_json_file(decisions_path, "decisions")
        decision_events = parse_decision_events(decisions_payload)
        transcript = (
            parse_episode_transcript(
                load_json_file(transcript_path, "transcript"),
                manifest=manifest,
            )
            if transcript_path
            else None
        )
        review = build_agent_edit_review_report(
            manifest=manifest,
            decision_events=decision_events,
            profile=args.profile,
            manifest_path=manifest_path,
            decisions_path=decisions_path,
            transcript=transcript,
            transcript_path=transcript_path,
        )
        review = sanitize_agent_workspace_payload(review, episode_dir)
        suggested_ops = build_agent_suggested_ops_payload(
            report=review,
            manifest=manifest,
            decision_events=decision_events,
        )
        operation_preview_result = apply_agent_decision_ops(
            manifest=manifest,
            decision_events=decision_events,
            ops_payload=suggested_ops,
            created_by=args.created_by,
        )
        operation_preview = summarize_agent_operation_preview(
            operation_preview_result
        )

        if operation_preview_result["errors"]:
            report_warnings.append(
                "Suggested operations have preview errors; inspect agent-suggested-ops.json before applying."
            )

        if args.write_preview_decisions and not operation_preview_result["errors"]:
            output_payload = {
                "schemaVersion": 1,
                "exportedAt": operation_preview_result["appliedAt"],
                "projectId": operation_preview_result["projectId"],
                "branchId": operation_preview_result["branchId"],
                "decisionEvents": operation_preview_result["decisionEvents"],
                "agentEdit": {
                    "appliedAt": operation_preview_result["appliedAt"],
                    "createdBy": args.created_by,
                    "operationCount": operation_preview_result["operationCount"],
                    "appliedOperationCount": operation_preview_result[
                        "appliedOperationCount"
                    ],
                    "dryRun": False,
                    "source": "agent-edit-session preview",
                },
            }
            write_json(output_paths["previewDecisions"], output_payload)
            preview_decisions_written = True

        sync_map_exists = Path(session["syncMapPath"]).is_file()
        local_media_map_exists = Path(session["localMediaMapPath"]).is_file()
        if sync_map_exists and local_media_map_exists:
            try:
                render_qa = build_agent_session_render_qa(
                    session=session,
                    decisions_path=decisions_path,
                    profile=args.profile,
                    qa_path=output_paths["renderQa"],
                    render_output_path=session["rendersDir"]
                    / f"{episode_id}-youtube-16x9.mp4",
                )
            except StudioCutCliError as error:
                report_warnings.append(f"Render QA unavailable: {error}")
        elif sync_map_exists or local_media_map_exists:
            missing = []
            if not sync_map_exists:
                missing.append(f"missing Sync Map: {session['syncMapPath']}")
            if not local_media_map_exists:
                missing.append(f"missing local media map: {session['localMediaMapPath']}")
            report_warnings.append(
                "Render QA skipped because the Rescue Sync render inputs are incomplete: "
                + "; ".join(missing)
            )

        write_json(output_paths["review"], review)
        write_json(output_paths["suggestedOps"], suggested_ops)

    inspection_checklist = build_agent_inspection_checklist(
        review=review,
        render_qa=render_qa,
    )
    if not report_errors:
        visual_review, visual_warnings = build_agent_visual_review(
            session=session,
            manifest=manifest_payload,
            inspection_checklist=inspection_checklist,
            report_path=output_paths["visualReview"],
            contact_sheet_path=output_paths["contactSheet"],
            frame_dir=out_dir / "agent-visual-review-frames",
        )
        report_warnings.extend(visual_warnings)

    session_report = build_agent_edit_session_report(
        session=session,
        status_report=status_report,
        workspace_index=workspace_index,
        review=review,
        suggested_ops=suggested_ops,
        operation_preview=operation_preview,
        render_qa=render_qa,
        inspection_checklist=inspection_checklist,
        visual_review=visual_review,
        transcript_path=transcript_path,
        output_paths=output_paths,
        preview_decisions_written=preview_decisions_written,
        warnings=report_warnings,
        errors=report_errors,
    )
    write_json(output_paths["session"], session_report)
    output_paths["rationale"].write_text(
        build_agent_edit_session_markdown(session_report),
        encoding="utf-8",
    )

    if args.json:
        print(json.dumps(session_report, indent=2))
    else:
        print_agent_edit_session_report(session_report)

    return 0 if not session_report["errors"] else 1


def parse_episode_transcript(
    payload: Any, *, manifest: dict[str, Any]
) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise StudioCutCliError("transcript must be a JSON object")

    if payload.get("schemaVersion") != 1:
        raise StudioCutCliError("transcript.schemaVersion must be 1")

    episode_id = payload.get("episodeId")
    if not isinstance(episode_id, str) or not episode_id.strip():
        raise StudioCutCliError("transcript.episodeId must be a non-empty string")
    if episode_id.strip() != str(manifest["id"]):
        raise StudioCutCliError(
            f"transcript episodeId {episode_id!r} does not match manifest id {manifest['id']!r}"
        )

    raw_segments = payload.get("segments")
    if not isinstance(raw_segments, list):
        raise StudioCutCliError("transcript.segments must be an array")

    duration_ms = int(round(float(manifest["durationMs"])))
    segments: list[dict[str, Any]] = []
    rejected_count = 0

    for index, raw_segment in enumerate(raw_segments):
        if not isinstance(raw_segment, dict):
            rejected_count += 1
            continue

        segment_id = raw_segment.get("id")
        start_ms = raw_segment.get("startSourceTimeMs")
        end_ms = raw_segment.get("endSourceTimeMs")
        speaker = raw_segment.get("speaker")
        text = raw_segment.get("text")

        if (
            not isinstance(segment_id, str)
            or not segment_id.strip()
            or not isinstance(start_ms, (int, float))
            or not isinstance(end_ms, (int, float))
            or float(end_ms) <= float(start_ms)
            or not isinstance(speaker, str)
            or not speaker.strip()
            or not isinstance(text, str)
            or not text.strip()
        ):
            rejected_count += 1
            continue

        speaker_role = raw_segment.get("speakerRole")
        if speaker_role not in {"homer", "charlie", "unknown", None}:
            rejected_count += 1
            continue

        confidence = raw_segment.get("confidence")
        if confidence is not None and (
            not isinstance(confidence, (int, float))
            or float(confidence) < 0
            or float(confidence) > 1
        ):
            rejected_count += 1
            continue

        segments.append(
            {
                "id": segment_id.strip(),
                "startSourceTimeMs": clamp_ms(float(start_ms), duration_ms),
                "endSourceTimeMs": clamp_ms(float(end_ms), duration_ms),
                "speaker": speaker.strip(),
                "speakerRole": speaker_role or infer_transcript_speaker_role(speaker),
                "text": text.strip(),
                **({"confidence": round(float(confidence), 4)} if confidence is not None else {}),
                **(
                    {"notes": raw_segment["notes"]}
                    if isinstance(raw_segment.get("notes"), str)
                    else {}
                ),
            }
        )

    segments = [
        segment
        for segment in segments
        if segment["endSourceTimeMs"] > segment["startSourceTimeMs"]
    ]
    segments.sort(
        key=lambda segment: (
            int(segment["startSourceTimeMs"]),
            int(segment["endSourceTimeMs"]),
            str(segment["id"]),
        )
    )

    if not segments:
        raise StudioCutCliError("transcript contains no valid timed segments")

    if rejected_count:
        print(
            f"warning: rejected {rejected_count} invalid transcript segment(s)",
            file=sys.stderr,
        )

    return {
        "schemaVersion": 1,
        "episodeId": episode_id.strip(),
        "segments": segments,
        **(
            {"generatedAt": payload["generatedAt"]}
            if isinstance(payload.get("generatedAt"), str)
            else {}
        ),
        **(
            {"language": payload["language"]}
            if isinstance(payload.get("language"), str)
            else {}
        ),
        **({"notes": payload["notes"]} if isinstance(payload.get("notes"), str) else {}),
    }


def infer_transcript_speaker_role(speaker: str) -> str:
    normalized = speaker.strip().lower()
    if "homer" in normalized:
        return "homer"
    if "charlie" in normalized:
        return "charlie"
    return "unknown"


def build_agent_transcript_review(
    *,
    manifest: dict[str, Any],
    transcript: dict[str, Any],
    decision_events: list[dict[str, Any]],
    duration_ms: int,
) -> dict[str, Any]:
    segments = transcript["segments"]
    warnings: list[str] = []
    tasks: list[dict[str, Any]] = []
    speaker_durations: dict[str, int] = {}
    speaker_segment_counts: dict[str, int] = {}
    word_count = 0
    clip_reference_count = 0
    filler_count = 0
    transcript_duration_ms = 0
    largest_gap_ms = 0
    previous_end_ms = 0
    derived_segments = derive_segments(decision_events, duration_ms)
    has_clip_pane = "clip" in manifest["sourceMonitorProxy"]["panes"]
    speaker_focus_threshold_ms = min(max(duration_ms // 20, 3000), 30000)

    for segment in segments:
        start_ms = int(segment["startSourceTimeMs"])
        end_ms = int(segment["endSourceTimeMs"])
        segment_duration_ms = max(0, end_ms - start_ms)
        gap_start_ms = previous_end_ms
        gap_before_ms = max(0, start_ms - previous_end_ms)
        largest_gap_ms = max(largest_gap_ms, gap_before_ms)
        previous_end_ms = max(previous_end_ms, end_ms)
        transcript_duration_ms += segment_duration_ms
        speaker_role = str(segment.get("speakerRole") or "unknown")
        text = str(segment["text"])
        lower_text = text.lower()
        words = [word for word in lower_text.replace("—", " ").split() if word]
        word_count += len(words)
        speaker_durations[speaker_role] = (
            speaker_durations.get(speaker_role, 0) + segment_duration_ms
        )
        speaker_segment_counts[speaker_role] = (
            speaker_segment_counts.get(speaker_role, 0) + 1
        )

        if gap_before_ms >= 5000:
            restore_segment = find_segment_at_time(derived_segments, start_ms, duration_ms)
            restore_state = (
                str(restore_segment["state"]) if restore_segment else None
            )
            tasks.append(
                {
                    "priority": "medium",
                    "kind": "transcript_gap",
                    "message": (
                        f"Transcript gap before {format_time_ms(start_ms)} lasts "
                        f"{format_time_ms(gap_before_ms)}; review for silence, sync drift, or missing transcript text."
                    ),
                    "startSourceTimeMs": gap_start_ms,
                    "endSourceTimeMs": start_ms,
                    "gapBeforeMs": gap_before_ms,
                    "suggestedOperations": [
                        {
                            "op": "setRangeState",
                            "startSourceTimeMs": gap_start_ms,
                            "endSourceTimeMs": start_ms,
                            "state": "cut",
                            **(
                                {"restoreState": restore_state}
                                if restore_state in PROGRAM_STATES
                                else {}
                            ),
                            "note": "Transcript gap; review before cutting inactive/silent span.",
                            "confidence": 0.45,
                            "approvalRequired": True,
                            "reason": "Transcript gap may indicate silence, missing transcript, or sync drift.",
                        }
                    ],
                }
            )

        clip_hit = transcript_mentions_clip(lower_text)
        if clip_hit:
            clip_reference_count += 1
            tasks.append(
                {
                    "priority": "medium" if has_clip_pane else "high",
                    "kind": "transcript_clip_reference",
                    "message": (
                        "Transcript references looking/showing/watching something; "
                        "review whether a Clip semantic state belongs here."
                    ),
                    "segmentId": segment["id"],
                    "speakerRole": speaker_role,
                    "startSourceTimeMs": start_ms,
                    "endSourceTimeMs": end_ms,
                    **(
                        {
                            "suggestedOperation": {
                                "op": "addDecision",
                                "sourceTimeMs": start_ms,
                                "state": (
                                    "charlie_clip"
                                    if speaker_role == "charlie"
                                    else "homer_clip"
                                    if speaker_role == "homer"
                                    else "both_clip"
                                ),
                                "note": "Transcript appears to reference visual clip context; verify before applying.",
                                "confidence": 0.65,
                                "approvalRequired": True,
                                "reason": "Transcript references on-screen visual context.",
                            }
                        }
                        if has_clip_pane
                        else {}
                    ),
                }
            )

        filler_hits = count_transcript_filler_hits(lower_text)
        filler_count += filler_hits
        if filler_hits >= 3:
            restore_segment = find_segment_at_time(derived_segments, end_ms, duration_ms)
            restore_state = (
                str(restore_segment["state"]) if restore_segment else None
            )
            tasks.append(
                {
                    "priority": "low",
                    "kind": "transcript_filler_cluster",
                    "message": (
                        f"Transcript segment has {filler_hits} filler markers; "
                        "review for a possible tightening edit."
                    ),
                    "segmentId": segment["id"],
                    "startSourceTimeMs": start_ms,
                    "endSourceTimeMs": end_ms,
                    "suggestedOperations": [
                        {
                            "op": "setRangeState",
                            "startSourceTimeMs": start_ms,
                            "endSourceTimeMs": end_ms,
                            "state": "cut",
                            **(
                                {"restoreState": restore_state}
                                if restore_state in PROGRAM_STATES
                                else {}
                            ),
                            "note": "Filler cluster; verify before tightening.",
                            "confidence": 0.35,
                            "approvalRequired": True,
                            "reason": "Transcript contains repeated filler markers.",
                        }
                    ],
                }
            )

        if (
            segment_duration_ms >= speaker_focus_threshold_ms
            and speaker_role in {"charlie", "homer"}
        ):
            current_decision_segment = find_segment_at_time(
                derived_segments,
                start_ms,
                duration_ms,
            )
            current_state = (
                str(current_decision_segment["state"])
                if current_decision_segment
                else None
            )
            expected_state = speaker_role
            if current_state and current_state not in {expected_state, "both"}:
                tasks.append(
                    {
                        "priority": "medium",
                        "kind": "transcript_speaker_state_mismatch",
                        "message": (
                            f"{speaker_role} speaks for {format_time_ms(segment_duration_ms)} "
                            f"starting at {format_time_ms(start_ms)}, but current state is {current_state}."
                        ),
                        "segmentId": segment["id"],
                        "speakerRole": speaker_role,
                        "currentState": current_state,
                        "startSourceTimeMs": start_ms,
                        "endSourceTimeMs": end_ms,
                        "suggestedOperation": {
                            "op": "addDecision",
                            "sourceTimeMs": start_ms,
                            "state": expected_state,
                            "note": "Transcript speaker focus mismatch; verify before applying.",
                            "confidence": 0.7,
                            "approvalRequired": True,
                            "reason": "Transcript speaker focus differs from the current program state.",
                        },
                    }
                )

    coverage_percent = (
        round(min(transcript_duration_ms, duration_ms) / duration_ms, 4)
        if duration_ms
        else 0
    )
    if coverage_percent < 0.5:
        warnings.append(
            f"Transcript covers only {format_percent(coverage_percent)} of episode duration."
        )
    if largest_gap_ms >= 30000:
        warnings.append(
            f"Transcript has a large gap of {format_time_ms(largest_gap_ms)}."
        )

    return {
        "summary": {
            "episodeId": transcript["episodeId"],
            "segmentCount": len(segments),
            "wordCount": word_count,
            "transcriptDurationMs": min(transcript_duration_ms, duration_ms),
            "coveragePercent": coverage_percent,
            "largestGapMs": largest_gap_ms,
            "speakerDurationsMs": speaker_durations,
            "speakerSegmentCounts": speaker_segment_counts,
            "clipReferenceCount": clip_reference_count,
            "fillerMarkerCount": filler_count,
        },
        "tasks": tasks,
        "warnings": warnings,
    }


def transcript_mentions_clip(text: str) -> bool:
    phrases = (
        "watch this",
        "watch the",
        "look at",
        "show this",
        "show the",
        "pull up",
        "on screen",
        "the clip",
        "this clip",
        "video",
        "screen share",
    )
    return any(phrase in text for phrase in phrases)


def count_transcript_filler_hits(text: str) -> int:
    padded = f" {text.replace(',', ' ').replace('.', ' ').replace('?', ' ')} "
    phrases = (" um ", " uh ", " er ", " ah ", " you know ", " kind of ", " sort of ")
    return sum(padded.count(phrase) for phrase in phrases)


def find_segment_at_time(
    segments: list[dict[str, Any]], source_time_ms: int, duration_ms: int
) -> dict[str, Any] | None:
    clamped_time = clamp_ms(float(source_time_ms), duration_ms)
    for segment in segments:
        if int(segment["startSourceTimeMs"]) <= clamped_time < int(
            segment["endSourceTimeMs"]
        ):
            return segment
    return None


def build_agent_edit_review_report(
    *,
    manifest: dict[str, Any],
    decision_events: list[dict[str, Any]],
    profile: str,
    manifest_path: Path,
    decisions_path: Path,
    transcript: dict[str, Any] | None = None,
    transcript_path: Path | None = None,
) -> dict[str, Any]:
    duration_ms = int(round(float(manifest["durationMs"])))
    active_events = get_active_decision_events(decision_events)
    tombstoned_events = [
        event for event in decision_events if is_decision_event_removed(event)
    ]
    plan = build_render_plan(
        manifest=manifest,
        decision_events=decision_events,
        profile=profile,
        manifest_path=manifest_path,
        decisions_path=decisions_path,
    )
    warnings: list[str] = []
    errors: list[str] = []
    tasks: list[dict[str, Any]] = []
    state_durations = {state: 0 for state in PROGRAM_STATE_ORDER}

    for segment in [*plan["activeSegments"], *plan["cutSegments"]]:
        state_durations[str(segment["programState"])] += int(segment["durationMs"])

    if not active_events:
        warnings.append("No active decisions are present.")
        tasks.append(
            {
                "priority": "high",
                "kind": "missing_initial_state",
                "message": "Add the first semantic state at 0:00 before editing or rendering.",
                "suggestedOperation": {
                    "op": "addDecision",
                    "sourceTimeMs": 0,
                    "state": "both",
                    "note": "Initial state; verify before applying.",
                },
            }
        )
    elif int(active_events[0]["sourceTimeMs"]) != 0:
        warnings.append("First active decision starts after 0:00.")
        tasks.append(
            {
                "priority": "high",
                "kind": "gap_before_first_decision",
                "message": (
                    "Source time before the first decision has no program state. "
                    "Review the opening and add an initial decision if needed."
                ),
                "firstDecisionTimeMs": active_events[0]["sourceTimeMs"],
            }
        )

    clip_states_present = any(
        state_requires_clip(str(event["state"])) for event in active_events
    )
    if clip_states_present and "clip" not in manifest["sourceMonitorProxy"]["panes"]:
        warnings.append("Clip states are used, but the manifest has no Clip pane.")
        tasks.append(
            {
                "priority": "medium",
                "kind": "clip_pane_missing",
                "message": "Either add Clip pane metadata or replace Clip states before publishing/rendering.",
            }
        )

    long_segment_threshold_ms = min(max(duration_ms // 4, 120000), 600000)
    for segment in plan["activeSegments"]:
        if int(segment["durationMs"]) >= long_segment_threshold_ms:
            tasks.append(
                {
                    "priority": "medium",
                    "kind": "long_active_segment",
                    "message": (
                        f"{segment['programState']} holds for "
                        f"{format_time_ms(segment['durationMs'])}; review for missing cuts."
                    ),
                    "sourceEventId": segment["sourceEventId"],
                    "startSourceTimeMs": segment["startSourceTimeMs"],
                    "endSourceTimeMs": segment["endSourceTimeMs"],
                    "state": segment["programState"],
                }
            )

    if plan["summary"]["activeSegmentCount"] == 0 and active_events:
        errors.append("All active decisions are Cut; render output would be empty.")

    transcript_review = (
        build_agent_transcript_review(
            manifest=manifest,
            transcript=transcript,
            decision_events=active_events,
            duration_ms=duration_ms,
        )
        if transcript
        else None
    )
    if transcript_review:
        warnings.extend(transcript_review["warnings"])
        tasks.extend(transcript_review["tasks"])

    report = {
        "schemaVersion": 1,
        "generatedAt": utc_now_iso(),
        "kind": "studio-cut-agent-edit-review",
        "manifest": {
            "id": manifest["id"],
            "title": manifest["title"],
            "durationMs": duration_ms,
        },
        "inputs": {
            "manifestPath": str(manifest_path),
            "decisionsPath": str(decisions_path),
            **(
                {"transcriptPath": str(transcript_path)}
                if transcript_path
                else {}
            ),
        },
        "summary": {
            "decisionEventCount": len(decision_events),
            "activeDecisionEventCount": len(active_events),
            "tombstonedDecisionEventCount": len(tombstoned_events),
            "derivedSegmentCount": plan["summary"]["derivedSegmentCount"],
            "activeSegmentCount": plan["summary"]["activeSegmentCount"],
            "cutSegmentCount": plan["summary"]["cutSegmentCount"],
            "activeDurationMs": plan["summary"]["activeDurationMs"],
            "cutDurationMs": plan["summary"]["cutDurationMs"],
            "cutPercent": (
                round(plan["summary"]["cutDurationMs"] / duration_ms, 4)
                if duration_ms
                else 0
            ),
            "stateDurationsMs": state_durations,
        },
        "agentEditingContract": build_agent_editing_contract(),
        "tasks": tasks,
        "warnings": warnings,
        "errors": errors,
    }

    if transcript_review:
        report["transcriptReview"] = transcript_review["summary"]

    return report


def build_agent_suggested_ops_payload(
    *,
    report: dict[str, Any],
    manifest: dict[str, Any],
    decision_events: list[dict[str, Any]],
) -> dict[str, Any]:
    project_id = str(
        (decision_events[0].get("projectId") if decision_events else None)
        or manifest["id"]
    )
    branch_id = str(
        (decision_events[0].get("branchId") if decision_events else None)
        or "main"
    )
    operations: list[dict[str, Any]] = []
    seen_operations: set[str] = set()

    for task in report.get("tasks", []):
        if not isinstance(task, dict):
            continue

        task_operations: list[dict[str, Any]] = []
        suggested_operation = task.get("suggestedOperation")
        if isinstance(suggested_operation, dict):
            task_operations.append(suggested_operation)
        suggested_operations = task.get("suggestedOperations")
        if isinstance(suggested_operations, list):
            task_operations.extend(
                operation
                for operation in suggested_operations
                if isinstance(operation, dict)
            )

        for operation in task_operations:
            normalized_operation = normalize_agent_suggested_operation(
                operation=operation,
                task=task,
            )
            if not normalized_operation:
                continue

            operation_key = get_agent_suggested_operation_key(normalized_operation)
            if operation_key in seen_operations:
                continue

            seen_operations.add(operation_key)
            operations.append(normalized_operation)

    return {
        "schemaVersion": 1,
        "projectId": project_id,
        "branchId": branch_id,
        "operations": operations,
    }


def normalize_agent_suggested_operation(
    *, operation: dict[str, Any], task: dict[str, Any]
) -> dict[str, Any] | None:
    op = operation.get("op")
    task_note = " | ".join(
        part
        for part in [
            str(operation.get("note", "")).strip(),
            f"Transcript task: {task.get('kind')}" if task.get("kind") else "",
            f"segment {task.get('segmentId')}" if task.get("segmentId") else "",
        ]
        if part
    )

    if op == "addDecision":
        state = operation.get("state")
        if state not in PROGRAM_STATES:
            return None
        return {
            "op": "addDecision",
            "sourceTimeMs": int(round(float(operation.get("sourceTimeMs", 0)))),
            "state": state,
            **({"note": task_note} if task_note else {}),
            **copy_optional_agent_operation_metadata(operation),
        }

    if op == "setRangeState":
        state = operation.get("state")
        restore_state = operation.get("restoreState")
        if state not in PROGRAM_STATES:
            return None
        return {
            "op": "setRangeState",
            "startSourceTimeMs": int(
                round(float(operation.get("startSourceTimeMs", 0)))
            ),
            "endSourceTimeMs": int(round(float(operation.get("endSourceTimeMs", 0)))),
            "state": state,
            **({"restoreState": restore_state} if restore_state in PROGRAM_STATES else {}),
            **({"note": task_note} if task_note else {}),
            **copy_optional_agent_operation_metadata(operation),
        }

    if op == "removeDecision":
        target_id = operation.get("id")
        if not isinstance(target_id, str) or not target_id.strip():
            return None
        return {
            "op": "removeDecision",
            "id": target_id.strip(),
            **copy_optional_agent_operation_metadata(operation),
        }

    return None


def copy_optional_agent_operation_metadata(operation: dict[str, Any]) -> dict[str, Any]:
    metadata: dict[str, Any] = {}
    confidence = operation.get("confidence")
    if isinstance(confidence, (int, float)) and 0 <= float(confidence) <= 1:
        metadata["confidence"] = float(confidence)
    approval_required = operation.get("approvalRequired")
    if isinstance(approval_required, bool):
        metadata["approvalRequired"] = approval_required
    reason = operation.get("reason")
    if isinstance(reason, str) and reason.strip():
        metadata["reason"] = reason.strip()
    return metadata


def get_agent_suggested_operation_key(operation: dict[str, Any]) -> str:
    op = operation.get("op")
    if op == "addDecision":
        return f"addDecision:{operation.get('sourceTimeMs')}:{operation.get('state')}"
    if op == "setRangeState":
        return (
            "setRangeState:"
            f"{operation.get('startSourceTimeMs')}:"
            f"{operation.get('endSourceTimeMs')}:"
            f"{operation.get('state')}"
        )
    if op == "removeDecision":
        return f"removeDecision:{operation.get('id')}"
    return json.dumps(operation, sort_keys=True)


def print_agent_edit_review_report(report: dict[str, Any]) -> None:
    manifest = report["manifest"]
    summary = report["summary"]

    print("Studio Cut Agent Edit Review")
    print("============================")
    print(f"Episode: {manifest['title']} ({manifest['id']})")
    print(f"Duration: {format_time_ms(manifest['durationMs'])}")
    print(
        "Decisions: "
        f"{summary['activeDecisionEventCount']} active / "
        f"{summary['tombstonedDecisionEventCount']} tombstoned"
    )
    print(
        "Program: "
        f"{summary['activeSegmentCount']} active segment(s), "
        f"{summary['cutSegmentCount']} Cut segment(s), "
        f"{format_percent(summary['cutPercent'])} cut"
    )

    transcript_summary = report.get("transcriptReview")
    if transcript_summary:
        print(
            "Transcript: "
            f"{transcript_summary['segmentCount']} segment(s), "
            f"{transcript_summary['wordCount']} words, "
            f"{format_percent(transcript_summary['coveragePercent'])} coverage"
        )

    print("\nState duration:")
    for state in PROGRAM_STATE_ORDER:
        duration_ms = summary["stateDurationsMs"].get(state, 0)
        if duration_ms:
            print(f"  - {state}: {format_time_ms(duration_ms)}")

    if report["tasks"]:
        print("\nAgent review tasks:")
        for task in report["tasks"]:
            print(f"  - [{task['priority']}] {task['kind']}: {task['message']}")
    else:
        print("\nAgent review tasks: none")

    if report["warnings"]:
        print("\nWarnings:")
        for warning in report["warnings"]:
            print(f"  - {warning}")

    if report["errors"]:
        print("\nErrors:")
        for error in report["errors"]:
            print(f"  - {error}")

    print("\nDecision operation shape:")
    print(
        "  {\"schemaVersion\":1,\"operations\":["
        "{\"op\":\"addDecision\",\"sourceTimeMs\":0,\"state\":\"both\",\"note\":\"...\"},"
        "{\"op\":\"setRangeState\",\"startSourceTimeMs\":10000,\"endSourceTimeMs\":15000,\"state\":\"cut\",\"restoreState\":\"both\"}"
        "]}"
    )
    print("  Apply with: studio-cut-local apply-decision-ops --manifest ... --decisions ... --ops ... --out ...")


def build_agent_editing_contract() -> dict[str, Any]:
    return {
        "principle": (
            "Agents edit the semantic decision layer only. Source media remains whole; "
            "Cut means inactive/skipped, not deleted."
        ),
        "operationFileShape": {
            "schemaVersion": 1,
            "operations": [
                {
                    "op": "addDecision",
                    "sourceTimeMs": 0,
                    "state": "both",
                    "note": "Human-readable reason.",
                    "confidence": 0.75,
                    "approvalRequired": True,
                    "id": "optional-stable-id",
                },
                {
                    "op": "setRangeState",
                    "startSourceTimeMs": 10000,
                    "endSourceTimeMs": 15000,
                    "state": "cut",
                    "restoreState": "both",
                    "note": "Proposed silence/filler trim; human reviews first.",
                    "confidence": 0.5,
                    "approvalRequired": True,
                    "reason": "Transcript gap or repeated filler markers.",
                },
                {
                    "op": "removeDecision",
                    "id": "existing-decision-id",
                    "reason": "Human-readable reason.",
                },
            ],
        },
        "supportedOps": ["addDecision", "setRangeState", "removeDecision"],
        "rollback": (
            "Keep the previous decision JSON or exported checkpoint. apply-decision-ops "
            "writes a new file and never mutates the input file."
        ),
    }


def apply_agent_decision_ops(
    *,
    manifest: dict[str, Any],
    decision_events: list[dict[str, Any]],
    ops_payload: Any,
    created_by: str,
) -> dict[str, Any]:
    if not isinstance(ops_payload, dict):
        raise StudioCutCliError("agent decision operations must be a JSON object")

    if ops_payload.get("schemaVersion") != 1:
        raise StudioCutCliError("agent decision operations schemaVersion must be 1")

    operations = ops_payload.get("operations")
    if not isinstance(operations, list):
        raise StudioCutCliError("agent decision operations must include operations[]")

    applied_at = utc_now_iso()
    duration_ms = int(round(float(manifest["durationMs"])))
    project_id = str(
        ops_payload.get("projectId")
        or (decision_events[0]["projectId"] if decision_events else manifest["id"])
    )
    branch_id = str(
        ops_payload.get("branchId")
        or (decision_events[0]["branchId"] if decision_events else "main")
    )
    next_events = [dict(event) for event in decision_events]
    errors: list[str] = []
    warnings: list[str] = []
    applied_operations: list[dict[str, Any]] = []

    for index, operation in enumerate(operations):
        label = f"operations[{index}]"

        if not isinstance(operation, dict):
            errors.append(f"{label} must be an object")
            continue

        op = operation.get("op")
        if op == "addDecision":
            event, op_errors = build_agent_add_decision_event(
                operation=operation,
                label=label,
                project_id=project_id,
                branch_id=branch_id,
                created_by=created_by,
                created_at=applied_at,
                duration_ms=duration_ms,
            )
            if op_errors:
                errors.extend(op_errors)
                continue

            if any(existing_event["id"] == event["id"] for existing_event in next_events):
                errors.append(f"{label}.id already exists in decision file: {event['id']}")
                continue

            next_events.append(event)
            applied_operations.append(
                {
                    "op": "addDecision",
                    "id": event["id"],
                    "sourceTimeMs": event["sourceTimeMs"],
                    "state": event["state"],
                }
            )
            continue

        if op == "setRangeState":
            range_events, op_errors, op_warnings = build_agent_range_decision_events(
                operation=operation,
                label=label,
                existing_events=next_events,
                project_id=project_id,
                branch_id=branch_id,
                created_by=created_by,
                created_at=applied_at,
                duration_ms=duration_ms,
            )
            warnings.extend(op_warnings)
            if op_errors:
                errors.extend(op_errors)
                continue

            if len({event["id"] for event in range_events}) != len(range_events):
                errors.append(f"{label}.id and restoreId must be unique")
                continue

            range_event_ids = {event["id"] for event in range_events}
            existing_ids = {event["id"] for event in next_events}
            collisions = sorted(range_event_ids.intersection(existing_ids))
            if collisions:
                errors.append(
                    f"{label}.id collides with existing decision file: {', '.join(collisions)}"
                )
                continue

            next_events.extend(range_events)
            end_source_time_ms = clamp_ms(
                float(operation.get("endSourceTimeMs", range_events[0]["sourceTimeMs"])),
                duration_ms,
            )
            applied_operations.append(
                {
                    "op": "setRangeState",
                    "ids": [event["id"] for event in range_events],
                    "startSourceTimeMs": range_events[0]["sourceTimeMs"],
                    "endSourceTimeMs": end_source_time_ms,
                    "state": range_events[0]["state"],
                    **(
                        {"restoreState": range_events[1]["state"]}
                        if len(range_events) > 1
                        else {}
                    ),
                }
            )
            continue

        if op == "removeDecision":
            target_id = operation.get("id")
            if not isinstance(target_id, str) or not target_id.strip():
                errors.append(f"{label}.id must be a non-empty string")
                continue

            target_index = next(
                (
                    event_index
                    for event_index, event in enumerate(next_events)
                    if event["id"] == target_id
                ),
                None,
            )
            if target_index is None:
                errors.append(f"{label}.id does not exist in decision file: {target_id}")
                continue

            target_event = dict(next_events[target_index])
            if is_decision_event_removed(target_event):
                warnings.append(f"{label}: decision {target_id} was already tombstoned")
            target_event["removedAt"] = applied_at
            target_event["removedBy"] = created_by
            target_event["operation"] = "remove"
            reason = operation.get("reason")
            if isinstance(reason, str) and reason.strip():
                target_event["note"] = append_decision_note(
                    target_event.get("note"),
                    f"Agent remove: {reason.strip()}",
                )
            next_events[target_index] = target_event
            applied_operations.append({"op": "removeDecision", "id": target_id})
            continue

        errors.append(
            f"{label}.op must be one of addDecision, setRangeState, removeDecision; got {op!r}"
        )

    next_events = merge_decision_events(next_events)
    active_events = get_active_decision_events(next_events)
    review = build_agent_edit_review_report(
        manifest=manifest,
        decision_events=next_events,
        profile="youtube_16x9",
        manifest_path=Path("<manifest>"),
        decisions_path=Path("<agent-output>"),
    )

    return {
        "schemaVersion": 1,
        "appliedAt": applied_at,
        "projectId": project_id,
        "branchId": branch_id,
        "operationCount": len(operations),
        "appliedOperationCount": len(applied_operations),
        "appliedOperations": applied_operations,
        "decisionEvents": next_events,
        "activeDecisionEventCount": len(active_events),
        "tombstonedDecisionEventCount": sum(
            1 for event in next_events if is_decision_event_removed(event)
        ),
        "reviewSummary": review["summary"],
        "warnings": warnings,
        "errors": errors,
    }


def build_agent_add_decision_event(
    *,
    operation: dict[str, Any],
    label: str,
    project_id: str,
    branch_id: str,
    created_by: str,
    created_at: str,
    duration_ms: int,
) -> tuple[dict[str, Any], list[str]]:
    errors: list[str] = []
    raw_source_time_ms = operation.get("sourceTimeMs")
    state = operation.get("state")

    if not isinstance(raw_source_time_ms, (int, float)):
        errors.append(f"{label}.sourceTimeMs must be a number")
    if state not in PROGRAM_STATES:
        errors.append(
            f"{label}.state must be one of: {', '.join(PROGRAM_STATE_ORDER)}"
        )

    if errors:
        return {}, errors

    source_time_ms = clamp_ms(float(raw_source_time_ms), duration_ms)
    event_id = operation.get("id")
    if not isinstance(event_id, str) or not event_id.strip():
        event_id = create_agent_decision_id(project_id, branch_id, source_time_ms, str(state))

    event: dict[str, Any] = {
        "id": event_id,
        "projectId": project_id,
        "branchId": branch_id,
        "sourceTimeMs": source_time_ms,
        "state": str(state),
        "createdBy": created_by,
        "createdAt": created_at,
        "clientId": "studio-cut-local-agent",
        "operation": "upsert",
    }
    note = operation.get("note")
    if isinstance(note, str) and note.strip():
        event["note"] = note.strip()

    return event, []


def build_agent_range_decision_events(
    *,
    operation: dict[str, Any],
    label: str,
    existing_events: list[dict[str, Any]],
    project_id: str,
    branch_id: str,
    created_by: str,
    created_at: str,
    duration_ms: int,
) -> tuple[list[dict[str, Any]], list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    raw_start_ms = operation.get("startSourceTimeMs")
    raw_end_ms = operation.get("endSourceTimeMs")
    state = operation.get("state")
    restore_state = operation.get("restoreState")

    if not isinstance(raw_start_ms, (int, float)):
        errors.append(f"{label}.startSourceTimeMs must be a number")
    if not isinstance(raw_end_ms, (int, float)):
        errors.append(f"{label}.endSourceTimeMs must be a number")
    if state not in PROGRAM_STATES:
        errors.append(
            f"{label}.state must be one of: {', '.join(PROGRAM_STATE_ORDER)}"
        )
    if restore_state is not None and restore_state not in PROGRAM_STATES:
        errors.append(
            f"{label}.restoreState must be one of: {', '.join(PROGRAM_STATE_ORDER)}"
        )

    if errors:
        return [], errors, warnings

    start_ms = clamp_ms(float(raw_start_ms), duration_ms)
    end_ms = clamp_ms(float(raw_end_ms), duration_ms)
    if end_ms <= start_ms:
        return [], [f"{label}.endSourceTimeMs must be after startSourceTimeMs"], warnings

    active_events = get_active_decision_events(existing_events)
    if restore_state is None:
        restore_segment = find_segment_at_time(
            derive_segments(active_events, duration_ms),
            end_ms,
            duration_ms,
        )
        restore_state = (
            str(restore_segment["state"]) if restore_segment else None
        )

    start_id = operation.get("id")
    if not isinstance(start_id, str) or not start_id.strip():
        start_id = create_agent_decision_id(
            project_id,
            branch_id,
            start_ms,
            f"{state}-range-start",
        )
    else:
        start_id = start_id.strip()

    range_note = operation.get("note")
    reason = operation.get("reason")
    if isinstance(reason, str) and reason.strip():
        range_note = append_decision_note(
            range_note,
            f"Agent range reason: {reason.strip()}",
        )

    range_events: list[dict[str, Any]] = [
        {
            "id": start_id,
            "projectId": project_id,
            "branchId": branch_id,
            "sourceTimeMs": start_ms,
            "state": str(state),
            "createdBy": created_by,
            "createdAt": created_at,
            "clientId": "studio-cut-local-agent",
            "operation": "upsert",
            **(
                {"note": range_note.strip()}
                if isinstance(range_note, str) and range_note.strip()
                else {}
            ),
        }
    ]

    if end_ms < duration_ms and restore_state and restore_state != state:
        restore_id = operation.get("restoreId")
        if not isinstance(restore_id, str) or not restore_id.strip():
            restore_id = create_agent_decision_id(
                project_id,
                branch_id,
                end_ms,
                f"{restore_state}-range-restore",
            )
        else:
            restore_id = restore_id.strip()
        range_events.append(
            {
                "id": restore_id,
                "projectId": project_id,
                "branchId": branch_id,
                "sourceTimeMs": end_ms,
                "state": str(restore_state),
                "createdBy": created_by,
                "createdAt": created_at,
                "clientId": "studio-cut-local-agent",
                "operation": "upsert",
                "note": f"Agent range restore after {PROGRAM_STATE_LABELS[str(state)]}",
            }
        )
    elif end_ms < duration_ms and not restore_state:
        warnings.append(
            f"{label}: no restoreState was provided and no prior state could be inferred at range end"
        )

    return range_events, [], warnings


def print_agent_decision_ops_result(
    result: dict[str, Any], *, dry_run: bool, out_path: Path
) -> None:
    print("Studio Cut Agent Decision Ops")
    print("=============================")
    print(f"Mode: {'dry run' if dry_run else 'write'}")
    print(f"Operations: {result['appliedOperationCount']} applied / {result['operationCount']} requested")
    print(f"Active decisions: {result['activeDecisionEventCount']}")
    print(f"Tombstoned decisions: {result['tombstonedDecisionEventCount']}")
    print(f"Output: {out_path if not dry_run else f'{out_path} (not written)'}")

    if result["appliedOperations"]:
        print("\nApplied:")
        for operation in result["appliedOperations"]:
            if operation["op"] == "addDecision":
                print(
                    "  - add "
                    f"{operation['state']} at {format_time_ms(operation['sourceTimeMs'])} "
                    f"({operation['id']})"
                )
            elif operation["op"] == "setRangeState":
                print(
                    "  - range "
                    f"{operation['state']} from {format_time_ms(operation['startSourceTimeMs'])} "
                    f"to {format_time_ms(operation['endSourceTimeMs'])} "
                    f"({', '.join(operation['ids'])})"
                )
            else:
                print(f"  - remove {operation['id']}")

    if result["warnings"]:
        print("\nWarnings:")
        for warning in result["warnings"]:
            print(f"  - {warning}")

    if result["errors"]:
        print("\nErrors:")
        for error in result["errors"]:
            print(f"  - {error}")


def build_generated_package_validation_report(
    *,
    manifest_path: Path,
    proxy_path: Path,
    sync_map_path: Path,
    sync_report_path: Path | None,
    duration_tolerance_ms: int,
) -> dict[str, Any]:
    report: dict[str, Any] = {
        "status": "blocked",
        "manifestPath": str(manifest_path),
        "proxyPath": str(proxy_path),
        "syncMapPath": str(sync_map_path),
        "syncReportPath": str(sync_report_path) if sync_report_path else None,
        "durationToleranceMs": duration_tolerance_ms,
        "ffprobePath": shutil.which("ffprobe"),
        "manifest": None,
        "proxy": None,
        "syncMap": None,
        "syncReport": None,
        "packageIntegrity": None,
        "publishChecklist": None,
        "warnings": [],
        "errors": [],
    }
    warnings: list[str] = report["warnings"]
    errors: list[str] = report["errors"]

    try:
        manifest = load_json_file(manifest_path, "manifest")
        validate_manifest(manifest)
    except StudioCutCliError as error:
        errors.append(str(error))
        manifest = None

    try:
        sync_map = load_sync_map(sync_map_path)
    except StudioCutCliError as error:
        errors.append(str(error))
        sync_map = None

    sync_report = None
    if sync_report_path:
        try:
            sync_report = load_cloud_sync_report(sync_report_path)
        except StudioCutCliError as error:
            errors.append(str(error))

    if not proxy_path.is_file():
        errors.append(f"source-monitor proxy file not found: {proxy_path}")
    else:
        proxy_status: dict[str, Any] = {
            "path": str(proxy_path),
            "sizeBytes": proxy_path.stat().st_size,
            "durationMs": None,
            "resolution": None,
        }

        if report["ffprobePath"]:
            duration_ms, probe_error = probe_media_duration_ms(
                ffprobe_path=str(report["ffprobePath"]),
                media_path=proxy_path,
            )
            if probe_error:
                errors.append(f"ffprobe could not inspect proxy: {probe_error}")
            else:
                proxy_status["durationMs"] = duration_ms
                proxy_status["resolution"] = probe_video_resolution(
                    ffprobe_path=str(report["ffprobePath"]),
                    media_path=proxy_path,
                )
        else:
            warnings.append("ffprobe not found on PATH; proxy duration/resolution skipped.")

        report["proxy"] = proxy_status

    if manifest:
        report["manifest"] = {
            "id": manifest["id"],
            "title": manifest["title"],
            "durationMs": int(round(float(manifest["durationMs"]))),
            "hasClipPane": bool(
                manifest.get("sourceMonitorProxy", {})
                .get("panes", {})
                .get("clip")
            ),
        }

        if find_unsafe_local_references(manifest):
            errors.append(
                "manifest contains local filesystem/blob references; publish generated packages with file names only."
            )

    if sync_map:
        sync_map_duration_ms = int(
            round(float(sync_map["canonicalTimeline"]["durationMs"]))
        )
        report["syncMap"] = {
            "syncMapId": sync_map["syncMapId"],
            "syncJobId": sync_map["syncJobId"],
            "projectId": sync_map["projectId"],
            "branchId": sync_map["branchId"],
            "durationMs": sync_map_duration_ms,
            "assetCount": len(sync_map["assets"]),
            "referenceRailSegments": len(sync_map["referenceRail"]["segments"]),
            "roles": summarize_sync_map_roles(sync_map),
            "lowestConfidence": get_lowest_sync_map_confidence(sync_map),
            "warningCount": count_sync_map_warnings(sync_map),
        }

        if find_unsafe_local_references(sync_map):
            errors.append(
                "Sync Map contains local filesystem/blob references; it must only contain ids, file names, and storage paths."
            )

    if sync_report:
        report["syncReport"] = summarize_cloud_sync_report(sync_report)

        if find_unsafe_local_references(sync_report):
            errors.append(
                "sync report contains local filesystem/blob references; publish reports without local paths."
            )

    if manifest and sync_map:
        manifest_project_id = normalize_publish_id(str(manifest["id"]))
        sync_map_project_id = normalize_publish_id(str(sync_map["projectId"]))

        if manifest_project_id != sync_map_project_id:
            errors.append(
                "manifest id does not match Sync Map projectId: "
                f"{manifest['id']} != {sync_map['projectId']}"
            )

        duration_delta_ms = abs(
            int(round(float(manifest["durationMs"])))
            - int(round(float(sync_map["canonicalTimeline"]["durationMs"])))
        )
        if duration_delta_ms > duration_tolerance_ms:
            warnings.append(
                "manifest duration differs from Sync Map canonical duration by "
                f"{duration_delta_ms} ms."
            )

    if manifest and report["proxy"] and report["proxy"]["durationMs"] is not None:
        proxy_delta_ms = abs(
            int(report["proxy"]["durationMs"])
            - int(round(float(manifest["durationMs"])))
        )
        if proxy_delta_ms > duration_tolerance_ms:
            warnings.append(
                f"source-monitor proxy duration differs from manifest by {proxy_delta_ms} ms."
            )

    if sync_report and sync_map and sync_report["syncJobId"] != sync_map["syncJobId"]:
        errors.append(
            "sync report syncJobId does not match Sync Map syncJobId: "
            f"{sync_report['syncJobId']} != {sync_map['syncJobId']}"
        )

    if manifest and sync_map and proxy_path.is_file() and not errors:
        project_id = normalize_publish_id(str(manifest["id"]))
        branch_id = normalize_publish_id(str(sync_map["branchId"]), fallback="main")
        report["packageIntegrity"] = build_generated_package_integrity_report(
            manifest_path=manifest_path,
            proxy_path=proxy_path,
            sync_map_path=sync_map_path,
            sync_report_path=sync_report_path if sync_report else None,
        )
        report["publishChecklist"] = {
            "studioCutUrl": "https://high-ground-odyssey.web.app",
            "shareUrl": (
                "https://high-ground-odyssey.web.app/"
                f"?projectId={project_id}&branchId={branch_id}"
            ),
            "projectId": project_id,
            "branchId": branch_id,
            "files": {
                "manifest": str(manifest_path),
                "sourceMonitorProxy": str(proxy_path),
                "syncMap": str(sync_map_path),
                **({"syncReport": str(sync_report_path)} if sync_report_path else {}),
            },
            "expectedPackageFingerprint": report["packageIntegrity"][
                "packageFingerprint"
            ],
            "postPublishChecks": [
                "Shared Room Diagnostics shows room metadata, manifest, proxy, Sync Map, and optional sync report attached.",
                "Shared Room Diagnostics package fingerprint matches this validation report.",
                "Sync Review shows the Sync Map job id, canonical duration, reference pieces, offset count, confidence, and warning count.",
                "Mako can open the room link without importing JSON or loading local media.",
            ],
        }

    report["status"] = "ready" if not errors else "blocked"
    return report


def build_generated_package_integrity_report(
    *,
    manifest_path: Path,
    proxy_path: Path,
    sync_map_path: Path,
    sync_report_path: Path | None,
) -> dict[str, Any]:
    manifest_sha256 = sha256_file(manifest_path)
    proxy_sha256 = sha256_file(proxy_path)
    sync_map_sha256 = sha256_file(sync_map_path)
    sync_report_sha256 = sha256_file(sync_report_path) if sync_report_path else None
    package_fingerprint = sha256_text(
        build_package_fingerprint_seed(
            manifest_sha256=manifest_sha256,
            source_monitor_proxy_sha256=proxy_sha256,
            sync_map_sha256=sync_map_sha256,
            sync_report_sha256=sync_report_sha256,
        )
    )

    return {
        "manifest": build_package_artifact_integrity(
            path=manifest_path,
            sha256=manifest_sha256,
        ),
        "sourceMonitorProxy": build_package_artifact_integrity(
            path=proxy_path,
            sha256=proxy_sha256,
        ),
        "syncMap": build_package_artifact_integrity(
            path=sync_map_path,
            sha256=sync_map_sha256,
        ),
        **(
            {
                "syncReport": build_package_artifact_integrity(
                    path=sync_report_path,
                    sha256=sync_report_sha256,
                )
            }
            if sync_report_path and sync_report_sha256
            else {}
        ),
        "packageFingerprint": package_fingerprint,
    }


def build_package_artifact_integrity(*, path: Path, sha256: str) -> dict[str, Any]:
    return {
        "fileName": path.name,
        "sizeBytes": path.stat().st_size,
        "sha256": sha256,
    }


def build_package_fingerprint_seed(
    *,
    manifest_sha256: str,
    source_monitor_proxy_sha256: str,
    sync_map_sha256: str,
    sync_report_sha256: str | None,
) -> str:
    return "|".join(
        [
            f"manifest:{manifest_sha256}",
            f"sourceMonitorProxy:{source_monitor_proxy_sha256}",
            f"syncMap:{sync_map_sha256}",
            f"syncReport:{sync_report_sha256 or 'none'}",
        ]
    )


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()

    with path.open("rb") as file_handle:
        for chunk in iter(lambda: file_handle.read(1024 * 1024), b""):
            digest.update(chunk)

    return digest.hexdigest()


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def build_episode_file_validation_report(
    *,
    manifest_path: Path,
    media_map_path: Path,
    decisions_path: Path | None,
    profile: str,
    duration_tolerance_ms: int,
) -> dict[str, Any]:
    report: dict[str, Any] = {
        "status": "blocked",
        "manifestPath": str(manifest_path),
        "mediaMapPath": str(media_map_path),
        "decisionsPath": str(decisions_path) if decisions_path else None,
        "profile": profile,
        "episodeId": None,
        "title": None,
        "manifestDurationMs": None,
        "renderReadiness": None,
        "missingPaths": [],
        "renderCommand": None,
        "durationToleranceMs": duration_tolerance_ms,
        "ffmpegPath": shutil.which("ffmpeg"),
        "ffprobePath": shutil.which("ffprobe"),
        "media": [],
        "warnings": [],
        "errors": [],
    }
    warnings: list[str] = report["warnings"]
    errors: list[str] = report["errors"]

    if not report["ffmpegPath"]:
        errors.append("ffmpeg not found on PATH; install ffmpeg before rendering.")

    if not report["ffprobePath"]:
        warnings.append("ffprobe not found on PATH; media duration inspection skipped.")

    try:
        manifest = load_json_file(manifest_path, "manifest")
        validate_manifest(manifest)
    except StudioCutCliError as error:
        errors.append(str(error))
        return report

    try:
        media_map = load_media_map(media_map_path)
    except StudioCutCliError as error:
        errors.append(str(error))
        return report

    report["episodeId"] = manifest["id"]
    report["title"] = manifest["title"]
    report["manifestDurationMs"] = int(round(float(manifest["durationMs"])))

    if media_map["episodeId"] != manifest["id"]:
        errors.append(
            "media map episodeId does not match manifest id: "
            f"{media_map['episodeId']} != {manifest['id']}"
        )

    media_entries = collect_media_map_entries(media_map, media_map_path)
    report["media"] = media_entries

    for entry in media_entries:
        path = Path(entry["path"])
        if not path.is_file():
            entry["exists"] = False
            missing_path = f"{entry['label']} file not found: {path}"
            report["missingPaths"].append(str(path))
            errors.append(missing_path)
            continue

        entry["exists"] = True

        if report["ffprobePath"]:
            duration_ms, probe_error = probe_media_duration_ms(
                ffprobe_path=str(report["ffprobePath"]),
                media_path=path,
            )

            if probe_error:
                errors.append(f"ffprobe could not inspect {entry['label']}: {probe_error}")
                continue

            entry["durationMs"] = duration_ms
            drift_ms = abs(duration_ms - int(report["manifestDurationMs"]))
            entry["durationDriftMs"] = drift_ms

            if drift_ms > duration_tolerance_ms:
                warnings.append(
                    f"{entry['label']} duration differs from manifest by {drift_ms} ms "
                    f"({format_time_ms(duration_ms)} vs "
                    f"{format_time_ms(int(report['manifestDurationMs']))})."
                )

    if decisions_path:
        add_decision_readiness_to_report(
            report=report,
            manifest=manifest,
            media_map=media_map,
            manifest_path=manifest_path,
            media_map_path=media_map_path,
            decisions_path=decisions_path,
            profile=profile,
        )
    else:
        warnings.append(
            "No --decisions file supplied; file validation is complete, but render readiness was not checked."
        )

    report["status"] = "ready" if not errors else "blocked"
    return report


def add_decision_readiness_to_report(
    *,
    report: dict[str, Any],
    manifest: dict[str, Any],
    media_map: dict[str, Any],
    manifest_path: Path,
    media_map_path: Path,
    decisions_path: Path,
    profile: str,
) -> None:
    warnings: list[str] = report["warnings"]
    errors: list[str] = report["errors"]

    try:
        decisions_payload = load_json_file(decisions_path, "decisions")
        decision_events = parse_decision_events(decisions_payload)
    except StudioCutCliError as error:
        errors.append(str(error))
        return

    render_readiness: dict[str, Any] = {
        "decisionCount": len(decision_events),
        "cutCount": sum(1 for event in decision_events if event["state"] == "cut"),
        "activeDurationMs": None,
        "cutDurationMs": None,
        "expectedOutputDurationMs": None,
        "activeSegmentCount": None,
        "cutSegmentCount": None,
        "firstDecisionAtZero": False,
        "clipStatesPresent": any(
            state_requires_clip(str(event["state"])) for event in decision_events
        ),
    }
    report["renderReadiness"] = render_readiness

    if not decision_events:
        errors.append("decision file contains no valid decision events; render would have no active segments.")
        return

    first_event = decision_events[0]
    render_readiness["firstDecisionAtZero"] = first_event["sourceTimeMs"] == 0

    if first_event["sourceTimeMs"] != 0:
        warnings.append(
            "First decision starts after 0:00; source time before that has no program state."
        )

    if render_readiness["clipStatesPresent"] and "clip" not in media_map["video"]:
        warnings.append(
            "Decision file uses Clip states, but media map has no video.clip path."
        )

    plan = build_render_plan(
        manifest=manifest,
        decision_events=decision_events,
        profile=profile,
        manifest_path=manifest_path,
        decisions_path=decisions_path,
    )
    summary = plan["summary"]
    render_readiness.update(
        {
            "activeDurationMs": summary["activeDurationMs"],
            "cutDurationMs": summary["cutDurationMs"],
            "expectedOutputDurationMs": summary["activeDurationMs"],
            "activeSegmentCount": summary["activeSegmentCount"],
            "cutSegmentCount": summary["cutSegmentCount"],
        }
    )

    if summary["activeSegmentCount"] == 0:
        errors.append("render plan has no active non-Cut segments.")

    output_path = media_map_path.parent / f"{manifest['id']}-youtube-16x9.mp4"
    report["renderCommand"] = format_shell_command(
        [
            sys.executable,
            str(Path(__file__)),
            "render-youtube-16x9-aligned",
            "--manifest",
            str(manifest_path),
            "--decisions",
            str(decisions_path),
            "--media-map",
            str(media_map_path),
            "--out",
            str(output_path),
        ]
    )


def collect_media_map_entries(
    media_map: dict[str, Any], media_map_path: Path
) -> list[dict[str, Any]]:
    entries = []

    for role in ("homer", "charlie", "clip"):
        raw_path = media_map["video"].get(role)

        if raw_path:
            entries.append(
                {
                    "kind": "video",
                    "role": role,
                    "label": f"video.{role}",
                    "path": str(resolve_media_path(raw_path, media_map_path)),
                    "exists": None,
                    "durationMs": None,
                    "durationDriftMs": None,
                }
            )

    program_audio_path = media_map["audio"].get("program")

    if program_audio_path:
        entries.append(
            {
                "kind": "audio",
                "role": "program",
                "label": "audio.program",
                "path": str(resolve_media_path(program_audio_path, media_map_path)),
                "exists": None,
                "durationMs": None,
                "durationDriftMs": None,
            }
        )

    return entries


def probe_media_duration_ms(
    *, ffprobe_path: str, media_path: Path
) -> tuple[int | None, str | None]:
    command = [
        ffprobe_path,
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        str(media_path),
    ]
    result = subprocess.run(
        command,
        check=False,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    if result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip()
        return None, detail or f"exit code {result.returncode}"

    raw_duration = result.stdout.strip()

    try:
        return int(round(float(raw_duration) * 1000)), None
    except ValueError:
        return None, f"unexpected duration output: {raw_duration!r}"


def probe_video_resolution(
    *, ffprobe_path: str, media_path: Path
) -> dict[str, int] | None:
    command = [
        ffprobe_path,
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height",
        "-of",
        "json",
        str(media_path),
    ]
    result = subprocess.run(
        command,
        check=False,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    if result.returncode != 0:
        return None

    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError:
        return None

    streams = payload.get("streams")
    if not isinstance(streams, list) or not streams:
        return None

    stream = streams[0]
    width = stream.get("width")
    height = stream.get("height")

    if isinstance(width, int) and isinstance(height, int):
        return {"width": width, "height": height}

    return None


def print_episode_file_validation_report(report: dict[str, Any]) -> None:
    print("Studio Cut Episode File Validation")
    print("==================================")
    status_label = "READY" if report["status"] == "ready" else "BLOCKED"
    print(f"Status: {status_label}")
    print(f"Manifest: {report['manifestPath']}")
    print(f"Media map: {report['mediaMapPath']}")
    if report.get("decisionsPath"):
        print(f"Decisions: {report['decisionsPath']}")

    if report["episodeId"]:
        print(f"Episode: {report['title']} ({report['episodeId']})")

    if report["manifestDurationMs"] is not None:
        print(
            "Manifest duration: "
            f"{format_time_ms(int(report['manifestDurationMs']))} "
            f"({int(report['manifestDurationMs'])} ms)"
        )

    print(f"ffmpeg: {report['ffmpegPath'] or 'not found'}")
    print(f"ffprobe: {report['ffprobePath'] or 'not found'}")
    print(f"Duration tolerance: {report['durationToleranceMs']} ms")

    if report["media"]:
        print("\nMedia files:")
        for entry in report["media"]:
            status = "found" if entry["exists"] else "missing"
            duration = (
                format_time_ms(entry["durationMs"])
                if entry["durationMs"] is not None
                else "not inspected"
            )
            drift = (
                f"{entry['durationDriftMs']} ms"
                if entry["durationDriftMs"] is not None
                else "n/a"
            )
            print(f"  - {entry['label']}: {status}")
            print(f"    path: {entry['path']}")
            print(f"    duration: {duration}; drift: {drift}")

    if report.get("missingPaths"):
        print("\nMissing paths:")
        for path in report["missingPaths"]:
            print(f"  - {path}")

    if report.get("renderReadiness"):
        readiness = report["renderReadiness"]
        print("\nRender readiness:")
        print(f"  decisions: {readiness['decisionCount']}")
        print(f"  cut decisions: {readiness['cutCount']}")
        print(f"  active segments: {readiness['activeSegmentCount']}")
        print(f"  cut segments: {readiness['cutSegmentCount']}")
        print(
            "  active duration: "
            f"{format_time_ms(readiness['activeDurationMs'] or 0)}"
        )
        print(
            "  expected output duration: "
            f"{format_time_ms(readiness['expectedOutputDurationMs'] or 0)}"
        )
        print(
            "  first decision at 0: "
            f"{'yes' if readiness['firstDecisionAtZero'] else 'no'}"
        )

    if report["warnings"]:
        print("\nWarnings:")
        for warning in report["warnings"]:
            print(f"  - {warning}")

    if report["errors"]:
        print("\nErrors:")
        for error in report["errors"]:
            print(f"  - {error}")

    if report.get("renderCommand"):
        if report["status"] == "ready":
            print("\nRender command:")
        else:
            print("\nRender command after blockers are fixed:")
        print(f"  {report['renderCommand']}")


def print_generated_package_validation_report(report: dict[str, Any]) -> None:
    print("Studio Cut Generated Package Validation")
    print("=======================================")
    status_label = "READY" if report["status"] == "ready" else "BLOCKED"
    print(f"Status: {status_label}")
    print(f"Manifest: {report['manifestPath']}")
    print(f"Proxy: {report['proxyPath']}")
    print(f"Sync Map: {report['syncMapPath']}")
    if report.get("syncReportPath"):
        print(f"Sync report: {report['syncReportPath']}")
    print(f"ffprobe: {report['ffprobePath'] or 'not found'}")
    print(f"Duration tolerance: {report['durationToleranceMs']} ms")

    if report.get("manifest"):
        manifest = report["manifest"]
        print("\nManifest:")
        print(f"  episode: {manifest['title']} ({manifest['id']})")
        print(f"  duration: {format_time_ms(manifest['durationMs'])}")
        print(f"  clip pane: {yes_no(manifest['hasClipPane'])}")

    if report.get("proxy"):
        proxy = report["proxy"]
        print("\nSource-monitor proxy:")
        print(f"  size: {proxy['sizeBytes']} bytes")
        if proxy["durationMs"] is not None:
            print(f"  duration: {format_time_ms(proxy['durationMs'])}")
        if proxy["resolution"]:
            print(
                "  resolution: "
                f"{proxy['resolution']['width']}x{proxy['resolution']['height']}"
            )

    if report.get("syncMap"):
        sync_map = report["syncMap"]
        print("\nSync Map:")
        print(f"  id: {sync_map['syncMapId']}")
        print(f"  job: {sync_map['syncJobId']}")
        print(f"  room: {sync_map['projectId']} / {sync_map['branchId']}")
        print(f"  duration: {format_time_ms(sync_map['durationMs'])}")
        print(f"  assets: {sync_map['assetCount']}")
        print(f"  reference pieces: {sync_map['referenceRailSegments']}")
        print(f"  lowest confidence: {format_percent(sync_map['lowestConfidence'])}")
        print(f"  roles: {', '.join(sync_map['roles'])}")

    if report.get("syncReport"):
        sync_report = report["syncReport"]
        print("\nSync report:")
        print(f"  status: {sync_report['status']}")
        print(f"  reference pieces: {sync_report['referenceRailSegments']}")
        print(f"  track offsets: {sync_report['trackOffsetCount']}")
        print(f"  lowest confidence: {format_percent(sync_report['lowestConfidence'])}")
        print(f"  warnings: {sync_report['warningCount']}")

    if report.get("packageIntegrity"):
        integrity = report["packageIntegrity"]
        print("\nPackage integrity:")
        print(f"  fingerprint: {format_digest(integrity['packageFingerprint'])}")
        print(
            "  manifest: "
            f"{integrity['manifest']['fileName']} "
            f"{format_digest(integrity['manifest']['sha256'])}"
        )
        print(
            "  proxy: "
            f"{integrity['sourceMonitorProxy']['fileName']} "
            f"{format_digest(integrity['sourceMonitorProxy']['sha256'])}"
        )
        print(
            "  Sync Map: "
            f"{integrity['syncMap']['fileName']} "
            f"{format_digest(integrity['syncMap']['sha256'])}"
        )
        if integrity.get("syncReport"):
            print(
                "  sync report: "
                f"{integrity['syncReport']['fileName']} "
                f"{format_digest(integrity['syncReport']['sha256'])}"
            )

    if report["warnings"]:
        print("\nWarnings:")
        for warning in report["warnings"]:
            print(f"  - {warning}")

    if report["errors"]:
        print("\nErrors:")
        for error in report["errors"]:
            print(f"  - {error}")

    if report.get("publishChecklist"):
        checklist = report["publishChecklist"]
        print("\nPublish checklist:")
        print(f"  Studio Cut: {checklist['studioCutUrl']}")
        print(f"  Room link: {checklist['shareUrl']}")
        if checklist.get("expectedPackageFingerprint"):
            print(
                "  Expected package fingerprint: "
                f"{format_digest(checklist['expectedPackageFingerprint'])}"
            )
        print("  Select these files in Publish Rescue Sync Package:")
        for label, path_value in checklist["files"].items():
            print(f"    - {label}: {path_value}")
        print("  After publish:")
        for check in checklist["postPublishChecks"]:
            print(f"    - {check}")


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


def load_media_map(path: Path) -> dict[str, Any]:
    payload = load_json_file(path, "media map")

    if not isinstance(payload, dict):
        raise StudioCutCliError("media map must be a JSON object")

    if payload.get("schemaVersion") != 1:
        raise StudioCutCliError("media map schemaVersion must be 1")

    if payload.get("timelineAligned") is not True:
        raise StudioCutCliError("media map timelineAligned must be true")

    require_non_empty_string(payload, "episodeId", "media map")

    video = payload.get("video")
    if not isinstance(video, dict):
        raise StudioCutCliError("media map video must be an object")

    for role in ("homer", "charlie"):
        require_non_empty_string(video, role, "media map video")

    if "clip" in video and video["clip"] is not None:
        require_non_empty_string(video, "clip", "media map video")

    audio = payload.get("audio", {})
    if not isinstance(audio, dict):
        raise StudioCutCliError("media map audio must be an object when present")

    if "program" in audio and audio["program"] is not None:
        require_non_empty_string(audio, "program", "media map audio")

    return {
        "schemaVersion": 1,
        "episodeId": payload["episodeId"],
        "timelineAligned": True,
        "video": {
            role: value
            for role, value in video.items()
            if role in {"homer", "charlie", "clip"} and value
        },
        "audio": {
            role: value for role, value in audio.items() if role == "program" and value
        },
    }


def load_sync_map(path: Path) -> dict[str, Any]:
    payload = load_json_file(path, "Sync Map")

    if not isinstance(payload, dict):
        raise StudioCutCliError("Sync Map must be a JSON object")

    for key in ("syncMapId", "syncJobId", "projectId", "branchId"):
        require_non_empty_string(payload, key, "Sync Map")

    canonical = payload.get("canonicalTimeline")
    if not isinstance(canonical, dict):
        raise StudioCutCliError("Sync Map canonicalTimeline must be an object")

    duration_ms = canonical.get("durationMs")
    if not isinstance(duration_ms, (int, float)) or duration_ms <= 0:
        raise StudioCutCliError("Sync Map canonicalTimeline.durationMs must be positive")

    if canonical.get("timebase") != "milliseconds":
        raise StudioCutCliError("Sync Map canonicalTimeline.timebase must be milliseconds")

    assets = payload.get("assets")
    if not isinstance(assets, list):
        raise StudioCutCliError("Sync Map assets must be an array")

    for index, asset in enumerate(assets):
        validate_sync_map_asset(asset, index)

    reference_rail = payload.get("referenceRail")
    if not isinstance(reference_rail, dict):
        raise StudioCutCliError("Sync Map referenceRail must be an object")
    if not isinstance(reference_rail.get("segments"), list):
        raise StudioCutCliError("Sync Map referenceRail.segments must be an array")

    if contains_key_recursive(payload, "localDebugPath"):
        raise StudioCutCliError("Sync Map must not contain localDebugPath values")

    return payload


def load_cloud_sync_report(path: Path) -> dict[str, Any]:
    payload = load_json_file(path, "sync report")

    if not isinstance(payload, dict):
        raise StudioCutCliError("sync report must be a JSON object")

    for key in ("syncJobId", "generatedAt", "status"):
        require_non_empty_string(payload, key, "sync report")

    reference_rail = payload.get("referenceRail")
    if not isinstance(reference_rail, dict):
        raise StudioCutCliError("sync report referenceRail must be an object")

    segments = reference_rail.get("segments")
    if not isinstance(segments, list):
        raise StudioCutCliError("sync report referenceRail.segments must be an array")

    track_offsets = payload.get("trackOffsets")
    if not isinstance(track_offsets, list):
        raise StudioCutCliError("sync report trackOffsets must be an array")

    global_warnings = payload.get("globalWarnings")
    if not isinstance(global_warnings, list) or not all(
        isinstance(warning, str) for warning in global_warnings
    ):
        raise StudioCutCliError("sync report globalWarnings must be an array of strings")

    for index, offset in enumerate(track_offsets):
        if not isinstance(offset, dict):
            raise StudioCutCliError(f"sync report trackOffsets[{index}] must be an object")
        for key in ("role", "inputId", "fileName"):
            require_non_empty_string(offset, key, f"sync report trackOffsets[{index}]")
        confidence = offset.get("confidence")
        if not isinstance(confidence, (int, float)):
            raise StudioCutCliError(
                f"sync report trackOffsets[{index}].confidence must be a number"
            )
        warnings = offset.get("warnings", [])
        if not isinstance(warnings, list) or not all(
            isinstance(warning, str) for warning in warnings
        ):
            raise StudioCutCliError(
                f"sync report trackOffsets[{index}].warnings must be an array of strings"
            )

    return payload


def validate_sync_map_asset(asset: Any, index: int) -> None:
    label = f"Sync Map assets[{index}]"

    if not isinstance(asset, dict):
        raise StudioCutCliError(f"{label} must be an object")

    for key in ("assetId", "inputId", "role", "fileName"):
        require_non_empty_string(asset, key, label)

    for key in ("timelineStartMs", "assetStartMs", "durationMs", "estimatedOffsetMs"):
        value = asset.get(key)
        if not isinstance(value, (int, float)):
            raise StudioCutCliError(f"{label}.{key} must be a number")

    if float(asset["durationMs"]) <= 0:
        raise StudioCutCliError(f"{label}.durationMs must be positive")

    confidence = asset.get("confidence")
    if not isinstance(confidence, (int, float)):
        raise StudioCutCliError(f"{label}.confidence must be a number")

    warnings = asset.get("warnings", [])
    if not isinstance(warnings, list) or not all(
        isinstance(warning, str) for warning in warnings
    ):
        raise StudioCutCliError(f"{label}.warnings must be an array of strings")


def load_sync_map_render_media_map(path: Path) -> dict[str, Any]:
    payload = load_json_file(path, "Sync Map render media map")

    if not isinstance(payload, dict):
        raise StudioCutCliError("Sync Map render media map must be a JSON object")

    if payload.get("schemaVersion") != 1:
        raise StudioCutCliError("Sync Map render media map schemaVersion must be 1")

    require_non_empty_string(payload, "episodeId", "Sync Map render media map")

    inputs = payload.get("inputs", {})
    if inputs is None:
        inputs = {}
    if not isinstance(inputs, dict):
        raise StudioCutCliError("Sync Map render media map inputs must be an object when present")

    for input_id, raw_path in inputs.items():
        if not isinstance(input_id, str) or not input_id.strip():
            raise StudioCutCliError("Sync Map render media map inputs keys must be non-empty strings")
        if not isinstance(raw_path, str) or not raw_path.strip():
            raise StudioCutCliError(
                f"Sync Map render media map inputs.{input_id} must be a non-empty string"
            )

    video = payload.get("video", {})
    if video is None:
        video = {}
    if not isinstance(video, dict):
        raise StudioCutCliError("Sync Map render media map video must be an object when present")

    for role in ("homer", "charlie", "clip"):
        if role in video and video[role] is not None:
            require_non_empty_string(video, role, "Sync Map render media map video")

    audio = payload.get("audio", {})
    if audio is None:
        audio = {}
    if not isinstance(audio, dict):
        raise StudioCutCliError("Sync Map render media map audio must be an object when present")

    if "program" in audio and audio["program"] is not None:
        require_non_empty_string(audio, "program", "Sync Map render media map audio")

    return {
        "schemaVersion": 1,
        "episodeId": payload["episodeId"],
        "timelineAligned": bool(payload.get("timelineAligned", False)),
        "inputs": {
            input_id: raw_path
            for input_id, raw_path in inputs.items()
            if isinstance(input_id, str) and isinstance(raw_path, str) and raw_path
        },
        "video": {
            role: value
            for role, value in video.items()
            if role in {"homer", "charlie", "clip"} and value
        },
        "audio": {
            role: value for role, value in audio.items() if role == "program" and value
        },
    }


def contains_key_recursive(value: Any, key: str) -> bool:
    if isinstance(value, dict):
        return key in value or any(contains_key_recursive(child, key) for child in value.values())

    if isinstance(value, list):
        return any(contains_key_recursive(child, key) for child in value)

    return False


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

    return sort_decision_events(valid_events)


def state_requires_clip(state: str) -> bool:
    return state in {"charlie_clip", "homer_clip", "both_clip"}


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
    active_decision_events = get_active_decision_events(decision_events)

    for index, event in enumerate(active_decision_events):
        start_ms = clamp_ms(float(event["sourceTimeMs"]), duration_ms)

        if start_ms >= duration_ms:
            continue

        next_event = (
            active_decision_events[index + 1]
            if index + 1 < len(active_decision_events)
            else None
        )
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


def get_active_decision_events(
    decision_events: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    return sort_decision_events(
        [event for event in decision_events if not is_decision_event_removed(event)]
    )


def is_decision_event_removed(event: dict[str, Any]) -> bool:
    return isinstance(event.get("removedAt"), str) and bool(event["removedAt"].strip())


def sort_decision_events(decision_events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        decision_events,
        key=lambda event: (
            float(event["sourceTimeMs"]),
            str(event["createdAt"]),
            str(event["id"]),
        ),
    )


def merge_decision_events(decision_events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    events_by_id: dict[str, dict[str, Any]] = {}

    for event in decision_events:
        events_by_id[str(event["id"])] = dict(event)

    return sort_decision_events(list(events_by_id.values()))


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


def validate_aligned_media_for_plan(
    *,
    media_map: dict[str, Any],
    media_map_path: Path,
    segments: list[dict[str, Any]],
    require_existing: bool,
) -> None:
    required_roles = sorted(
        {
            role
            for segment in segments
            for role in get_youtube_16x9_video_roles(segment["programState"])
        }
    )
    missing_roles = [role for role in required_roles if role not in media_map["video"]]

    if missing_roles:
        raise StudioCutCliError(
            "media map is missing video path(s) required by active states: "
            + ", ".join(missing_roles)
        )

    paths_to_check = [
        resolve_media_path(media_map["video"][role], media_map_path)
        for role in required_roles
    ]

    if media_map["audio"].get("program"):
        paths_to_check.append(resolve_media_path(media_map["audio"]["program"], media_map_path))

    missing_paths = [path for path in paths_to_check if not path.is_file()]

    if missing_paths and require_existing:
        raise StudioCutCliError(
            "aligned media file(s) not found: "
            + ", ".join(str(path) for path in missing_paths)
        )

    if missing_paths:
        for path in missing_paths:
            print(f"warning: dry-run media path does not exist: {path}", file=sys.stderr)


def render_youtube_16x9_segments(
    *,
    ffmpeg_path: str,
    media_map: dict[str, Any],
    media_map_path: Path,
    segments: list[dict[str, Any]],
    out_path: Path,
    temp_path: Path,
) -> None:
    temp_path.mkdir(parents=True, exist_ok=True)
    segment_files = []

    for segment in segments:
        segment_file = temp_path / f"youtube16x9-segment-{int(segment['index']):04d}.mp4"
        segment_files.append(segment_file)
        command = build_youtube_16x9_segment_command(
            ffmpeg_path=ffmpeg_path,
            media_map=media_map,
            media_map_path=media_map_path,
            segment=segment,
            out_path=segment_file,
        )
        run_command(command, f"ffmpeg render aligned segment {int(segment['index']) + 1}")

    concat_file = temp_path / "segments.txt"
    concat_file.write_text(
        "\n".join(f"file '{escape_ffmpeg_concat_path(path)}'" for path in segment_files)
        + "\n",
        encoding="utf-8",
    )
    run_ffmpeg_concat(
        ffmpeg_path=ffmpeg_path,
        concat_file=concat_file,
        out_path=out_path,
    )


def print_aligned_render_commands(
    *,
    ffmpeg_path: str,
    media_map: dict[str, Any],
    media_map_path: Path,
    segments: list[dict[str, Any]],
    out_path: Path,
    temp_path: Path,
) -> None:
    segment_files = []

    print("\nAligned 16:9 ffmpeg segment plan:")
    for segment in segments:
        segment_file = temp_path / f"youtube16x9-segment-{int(segment['index']):04d}.mp4"
        segment_files.append(segment_file)
        roles = ", ".join(get_youtube_16x9_video_roles(segment["programState"]))
        print(
            f"\nSegment {int(segment['index']) + 1}: "
            f"{segment['programState']} / {segment['layoutBehavior']} / sources: {roles}"
        )
        print(
            format_shell_command(
                build_youtube_16x9_segment_command(
                    ffmpeg_path=ffmpeg_path,
                    media_map=media_map,
                    media_map_path=media_map_path,
                    segment=segment,
                    out_path=segment_file,
                )
            )
        )

    concat_file = temp_path / "segments.txt"
    print("\nFinal concat:")
    print(
        format_shell_command(
            build_ffmpeg_concat_command(
                ffmpeg_path=ffmpeg_path,
                concat_file=concat_file,
                out_path=out_path,
            )
        )
    )
    print(f"\nConcat list would include {len(segment_files)} rendered segment file(s).")


def build_youtube_16x9_segment_command(
    *,
    ffmpeg_path: str,
    media_map: dict[str, Any],
    media_map_path: Path,
    segment: dict[str, Any],
    out_path: Path,
) -> list[str]:
    state = segment["programState"]
    video_roles = get_youtube_16x9_video_roles(state)
    start_seconds = float(segment["startSourceTimeMs"]) / 1000
    duration_seconds = float(segment["durationMs"]) / 1000
    command = [ffmpeg_path, "-hide_banner", "-loglevel", "error", "-y"]

    for role in video_roles:
        command.extend(
            [
                "-ss",
                format_seconds(start_seconds),
                "-t",
                format_seconds(duration_seconds),
                "-i",
                str(resolve_media_path(media_map["video"][role], media_map_path)),
            ]
        )

    audio_input_index = len(video_roles)
    program_audio = media_map["audio"].get("program")

    if program_audio:
        command.extend(
            [
                "-ss",
                format_seconds(start_seconds),
                "-t",
                format_seconds(duration_seconds),
                "-i",
                str(resolve_media_path(program_audio, media_map_path)),
            ]
        )
        audio_filter = build_program_audio_output_filter(
            input_label=f"{audio_input_index}:a",
            duration_seconds=duration_seconds,
        )
    else:
        command.extend(
            [
                "-f",
                "lavfi",
                "-t",
                format_seconds(duration_seconds),
                "-i",
                "anullsrc=channel_layout=stereo:sample_rate=48000",
            ]
        )
        audio_filter = build_program_audio_output_filter(
            input_label=f"{audio_input_index}:a",
            duration_seconds=duration_seconds,
        )

    filter_complex = ";".join(
        [build_youtube_16x9_video_filter(state), audio_filter]
    )
    command.extend(
        [
            "-filter_complex",
            filter_complex,
            "-map",
            "[vout]",
            "-map",
            "[aout]",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "22",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-shortest",
            "-movflags",
            "+faststart",
            str(out_path),
        ]
    )

    return command


def build_youtube_16x9_video_filter(state: str) -> str:
    if state in {"charlie", "homer"}:
        return video_scale_filter(0, YOUTUBE_16X9_WIDTH, YOUTUBE_16X9_HEIGHT, "vout")

    if state in {"both", "charlie_clip", "homer_clip"}:
        return ";".join(
            [
                video_scale_filter(0, 960, 1080, "left"),
                video_scale_filter(1, 960, 1080, "right"),
                "[left][right]hstack=inputs=2[vout]",
            ]
        )

    if state == "both_clip":
        return ";".join(
            [
                video_scale_filter(0, 640, 540, "homer"),
                video_scale_filter(1, 640, 540, "charlie"),
                "[homer][charlie]vstack=inputs=2[left]",
                video_scale_filter(2, 1280, 1080, "clip"),
                "[left][clip]hstack=inputs=2[vout]",
            ]
        )

    raise StudioCutCliError(f"cannot render state in youtube_16x9 renderer: {state}")


def video_scale_filter(input_index: int, width: int, height: int, label: str) -> str:
    return (
        f"[{input_index}:v]"
        f"scale={width}:{height}:force_original_aspect_ratio=increase,"
        f"crop={width}:{height},setsar=1,setpts=PTS-STARTPTS"
        f"[{label}]"
    )


def video_scale_filter_from_label(input_label: str, width: int, height: int, label: str) -> str:
    return (
        f"[{input_label}]"
        f"scale={width}:{height}:force_original_aspect_ratio=increase,"
        f"crop={width}:{height},fps={YOUTUBE_16X9_FPS},setsar=1,setpts=PTS-STARTPTS"
        f"[{label}]"
    )


def get_youtube_16x9_video_roles(state: str) -> list[str]:
    try:
        return YOUTUBE_16X9_STATE_INPUTS[state]
    except KeyError as error:
        raise StudioCutCliError(
            f"state is not renderable in youtube_16x9 aligned renderer: {state}"
        ) from error


def resolve_media_path(raw_path: str, media_map_path: Path) -> Path:
    path = Path(raw_path).expanduser()

    if path.is_absolute():
        return path

    return (media_map_path.parent / path).resolve()


def print_media_map_summary(media_map: dict[str, Any], media_map_path: Path) -> None:
    print("\nAligned media map")
    print("=================")
    print(f"Episode: {media_map['episodeId']}")
    print(f"Path: {media_map_path}")
    print("Video:")
    for role in ("homer", "charlie", "clip"):
        if role in media_map["video"]:
            print(f"  {role}: {resolve_media_path(media_map['video'][role], media_map_path)}")
    if media_map["audio"].get("program"):
        print(f"Audio program: {resolve_media_path(media_map['audio']['program'], media_map_path)}")
    else:
        print("Audio program: none; renderer will use silent audio")


def build_manifest_from_sync_map(sync_map: dict[str, Any]) -> dict[str, Any]:
    project_id = sync_map["projectId"]
    duration_ms = int(round(float(sync_map["canonicalTimeline"]["durationMs"])))
    sources = {
        "homer": {"role": "homer", "label": "Homer from Sync Map"},
        "charlie": {"role": "charlie", "label": "Charlie from Sync Map"},
        "program": {"role": "program", "label": "Program from Sync Map"},
    }

    if find_sync_map_asset_for_video_role(sync_map, "clip"):
        sources["clip"] = {"role": "clip", "label": "Clip from Sync Map"}

    return {
        "id": project_id,
        "title": project_id,
        "durationMs": duration_ms,
        "sources": sources,
        "sourceMonitorProxy": {
            "localPlaceholderPath": "./source-monitor-proxy.mp4",
            "panes": {
                "homer": {"x": 0, "y": 0, "width": 0.5, "height": 0.5},
                "charlie": {"x": 0.5, "y": 0, "width": 0.5, "height": 0.5},
                "clip": {"x": 0, "y": 0.5, "width": 0.5, "height": 0.5},
            },
        },
        "syncBootstrap": {
            "source": "premiere",
            "notes": (
                f"Local render manifest synthesized from Sync Map {sync_map['syncMapId']}. "
                "Decision sourceTimeMs values are interpreted as canonical episode timeline time."
            ),
        },
    }


def build_sync_map_render_media(
    *,
    sync_map: dict[str, Any],
    media_map: dict[str, Any],
    media_map_path: Path,
    segments: list[dict[str, Any]],
    require_existing: bool,
) -> dict[str, dict[str, Any]]:
    required_roles = sorted(
        {
            role
            for segment in segments
            for role in get_youtube_16x9_video_roles(segment["programState"])
        }
    )
    resolved: dict[str, dict[str, Any]] = {}

    for role in required_roles:
        asset = find_sync_map_asset_for_video_role(sync_map, role)

        if not asset:
            raise StudioCutCliError(
                f"Sync Map has no video asset for role required by decisions: {role}"
            )

        raw_path = lookup_sync_map_media_path(media_map, role, asset)

        if not raw_path:
            raise StudioCutCliError(
                "Sync Map render media map is missing a path for "
                f"{role} asset inputId={asset['inputId']}. Add inputs.{asset['inputId']} "
                f"or video.{role}."
            )

        resolved_path = resolve_media_path(raw_path, media_map_path)

        if require_existing and not resolved_path.is_file():
            raise StudioCutCliError(f"Sync Map render media file not found: {resolved_path}")

        if not require_existing and not resolved_path.is_file():
            print(f"warning: dry-run media path does not exist: {resolved_path}", file=sys.stderr)

        resolved[role] = {"asset": asset, "path": resolved_path}

    program_audio = media_map["audio"].get("program")

    if program_audio:
        audio_path = resolve_media_path(program_audio, media_map_path)
        if require_existing and not audio_path.is_file():
            raise StudioCutCliError(f"program audio file not found: {audio_path}")
        if not require_existing and not audio_path.is_file():
            print(f"warning: dry-run program audio path does not exist: {audio_path}", file=sys.stderr)
    else:
        clean_audio_assets = []
        for role_name in ("homerAudio", "charlieAudio"):
            asset = find_sync_map_asset_for_input_role(sync_map, role_name)
            if not asset:
                continue

            raw_path = media_map.get("inputs", {}).get(str(asset.get("inputId") or ""))
            if not raw_path:
                continue

            audio_path = resolve_media_path(str(raw_path), media_map_path)
            if require_existing and not audio_path.is_file():
                raise StudioCutCliError(
                    f"Sync Map render clean audio file not found: {audio_path}"
                )
            if not require_existing and not audio_path.is_file():
                print(
                    f"warning: dry-run clean audio path does not exist: {audio_path}",
                    file=sys.stderr,
                )

            clean_audio_assets.append(
                {"role": role_name, "asset": asset, "path": audio_path}
            )

        if clean_audio_assets:
            resolved["__audio_assets__"] = clean_audio_assets

    return resolved


def find_sync_map_asset_for_video_role(
    sync_map: dict[str, Any], video_role: str
) -> dict[str, Any] | None:
    role_name = {
        "homer": "homerVideo",
        "charlie": "charlieVideo",
        "clip": "clipVideo",
    }.get(video_role)

    if not role_name:
        return None

    return find_sync_map_asset_for_input_role(sync_map, role_name)


def find_sync_map_asset_for_input_role(
    sync_map: dict[str, Any], role_name: str
) -> dict[str, Any] | None:
    candidates = [
        asset
        for asset in sync_map.get("assets", [])
        if isinstance(asset, dict) and asset.get("role") == role_name
    ]

    if not candidates:
        return None

    return sorted(
        candidates,
        key=lambda asset: (
            -float(asset.get("confidence") or 0),
            str(asset.get("inputId") or ""),
        ),
    )[0]


def lookup_sync_map_media_path(
    media_map: dict[str, Any], video_role: str, asset: dict[str, Any]
) -> str | None:
    input_id = str(asset.get("inputId") or "")
    input_path = media_map.get("inputs", {}).get(input_id)

    if input_path:
        return str(input_path)

    role_path = media_map.get("video", {}).get(video_role)
    return str(role_path) if role_path else None


def print_sync_map_render_summary(
    *,
    sync_map: dict[str, Any],
    media_map: dict[str, Any],
    media_map_path: Path,
    resolved_media: dict[str, dict[str, Any]],
) -> None:
    print("\nSync Map render media")
    print("=====================")
    print(f"Sync Map: {sync_map['syncMapId']}")
    print(f"Project/branch: {sync_map['projectId']} / {sync_map['branchId']}")
    print(
        "Canonical duration: "
        f"{format_time_ms(sync_map['canonicalTimeline']['durationMs'])}"
    )
    print(f"Media map: {media_map_path}")

    for role in ("homer", "charlie", "clip"):
        entry = resolved_media.get(role)
        if not entry:
            continue

        asset = entry["asset"]
        print(
            f"  {role}: {entry['path']} "
            f"(inputId={asset['inputId']}, timelineStart={format_time_ms(asset['timelineStartMs'])}, "
            f"assetStart={format_time_ms(asset['assetStartMs'])})"
        )

    if media_map["audio"].get("program"):
        print(f"Audio program: {resolve_media_path(media_map['audio']['program'], media_map_path)}")
        print("Audio note: program audio is treated as canonical-timeline aligned.")
    elif resolved_media.get("__audio_assets__"):
        print("Audio program: none; renderer will mix Sync Map clean audio assets.")
        for audio_entry in resolved_media["__audio_assets__"]:
            asset = audio_entry["asset"]
            print(
                f"  {audio_entry['role']}: {audio_entry['path']} "
                f"(inputId={asset['inputId']}, timelineStart={format_time_ms(asset['timelineStartMs'])})"
            )
    else:
        print("Audio program: none; renderer will use silent audio")


def build_sync_map_render_qa_report(
    *,
    sync_map: dict[str, Any],
    plan: dict[str, Any],
    media_map: dict[str, Any],
    media_map_path: Path,
    resolved_media: dict[str, Any],
    out_path: Path,
    dry_run: bool,
) -> dict[str, Any]:
    segments = plan["activeSegments"]
    audio_mode = get_sync_map_render_audio_mode(media_map, resolved_media)
    report_segments = []
    warnings: list[str] = []
    total_black_padding_ms = 0
    partial_video_segment_count = 0
    fully_missing_video_role_count = 0
    silence_padding_ms = 0

    for segment in segments:
        segment_warnings: list[str] = []
        video_entries = []
        segment_has_partial_video = False

        for role in get_youtube_16x9_video_roles(segment["programState"]):
            entry = resolved_media.get(role)
            if not entry:
                fully_missing_video_role_count += 1
                segment_has_partial_video = True
                segment_warnings.append(f"{role} video asset is missing")
                video_entries.append(
                    {
                        "role": role,
                        "inputId": None,
                        "fileName": None,
                        "coverageMs": 0,
                        "coveragePercent": 0,
                        "leadingBlackMs": segment["durationMs"],
                        "trailingBlackMs": 0,
                        "fullyMissing": True,
                    }
                )
                total_black_padding_ms += int(segment["durationMs"])
                continue

            coverage = compute_sync_map_asset_segment_coverage(
                segment=segment,
                asset=entry["asset"],
            )
            asset = entry["asset"]
            leading_black_ms = coverage["leadingGapMs"]
            trailing_black_ms = coverage["trailingGapMs"]
            total_black_padding_ms += leading_black_ms + trailing_black_ms

            if coverage["coverageMs"] <= 0:
                fully_missing_video_role_count += 1
                segment_has_partial_video = True
                segment_warnings.append(
                    f"{role} has no video coverage for this segment; black slate will be used"
                )
            elif leading_black_ms or trailing_black_ms:
                segment_has_partial_video = True
                segment_warnings.append(
                    f"{role} has partial video coverage; black padding will fill the gap"
                )

            video_entries.append(
                {
                    "role": role,
                    "inputId": asset.get("inputId"),
                    "fileName": asset.get("fileName"),
                    "timelineStartMs": int(round(float(asset.get("timelineStartMs") or 0))),
                    "assetStartMs": int(round(float(asset.get("assetStartMs") or 0))),
                    "durationMs": int(round(float(asset.get("durationMs") or 0))),
                    "coverageMs": coverage["coverageMs"],
                    "coveragePercent": coverage["coveragePercent"],
                    "leadingBlackMs": leading_black_ms,
                    "trailingBlackMs": trailing_black_ms,
                    "assetReadStartMs": coverage["assetReadStartMs"],
                    "fullyMissing": coverage["coverageMs"] <= 0,
                }
            )

        if segment_has_partial_video:
            partial_video_segment_count += 1

        audio_report = build_sync_map_render_audio_qa(
            segment=segment,
            media_map=media_map,
            media_map_path=media_map_path,
            resolved_media=resolved_media,
        )
        silence_padding_ms += audio_report["silencePaddingMs"]
        segment_warnings.extend(audio_report["warnings"])

        report_segments.append(
            {
                "index": segment["index"],
                "programState": segment["programState"],
                "layoutBehavior": segment["layoutBehavior"],
                "sourceTime": segment["sourceTime"],
                "video": video_entries,
                "audio": audio_report,
                "warnings": segment_warnings,
            }
        )

    if total_black_padding_ms:
        warnings.append(
            "Some video roles do not cover every active segment; black padding will be inserted."
        )

    if silence_padding_ms:
        warnings.append(
            "Some audio sources do not cover every active segment; silence padding will be inserted."
        )

    if audio_mode == "silent":
        warnings.append("No program or clean Sync Map audio was mapped; render audio will be silent.")

    return {
        "schemaVersion": 1,
        "kind": "studio-cut-sync-map-render-qa",
        "generatedAt": utc_now_iso(),
        "renderMode": "dry-run" if dry_run else "render",
        "projectId": sync_map["projectId"],
        "branchId": sync_map["branchId"],
        "syncMapId": sync_map["syncMapId"],
        "outputFileName": out_path.name,
        "summary": {
            "segmentCount": len(segments),
            "activeDurationMs": plan["summary"]["activeDurationMs"],
            "cutDurationMs": plan["summary"]["cutDurationMs"],
            "canonicalDurationMs": sync_map["canonicalTimeline"]["durationMs"],
            "audioMode": audio_mode,
            "videoPartialCoverageSegmentCount": partial_video_segment_count,
            "videoFullyMissingRoleCount": fully_missing_video_role_count,
            "totalBlackPaddingMs": total_black_padding_ms,
            "silencePaddingMs": silence_padding_ms,
            "warningCount": len(warnings),
        },
        "segments": report_segments,
        "warnings": warnings,
    }


def get_sync_map_render_audio_mode(
    media_map: dict[str, Any], resolved_media: dict[str, Any]
) -> str:
    if media_map["audio"].get("program"):
        return "program"

    if resolved_media.get("__audio_assets__"):
        return "clean_mix"

    return "silent"


def compute_sync_map_asset_segment_coverage(
    *, segment: dict[str, Any], asset: dict[str, Any]
) -> dict[str, Any]:
    segment_start_ms = int(round(float(segment["startSourceTimeMs"])))
    segment_end_ms = int(round(float(segment["endSourceTimeMs"])))
    segment_duration_ms = max(0, segment_end_ms - segment_start_ms)
    timeline_start_ms = int(round(float(asset.get("timelineStartMs") or 0)))
    asset_start_ms = int(round(float(asset.get("assetStartMs") or 0)))
    asset_duration_ms = int(round(float(asset.get("durationMs") or 0)))
    asset_timeline_end_ms = timeline_start_ms + max(0, asset_duration_ms)
    covered_start_ms = max(segment_start_ms, timeline_start_ms)
    covered_end_ms = min(segment_end_ms, asset_timeline_end_ms)
    coverage_ms = max(0, covered_end_ms - covered_start_ms)

    if segment_duration_ms <= 0:
        leading_gap_ms = 0
        trailing_gap_ms = 0
        coverage_percent = 0
    elif coverage_ms <= 0:
        leading_gap_ms = segment_duration_ms
        trailing_gap_ms = 0
        coverage_percent = 0
    else:
        leading_gap_ms = max(0, covered_start_ms - segment_start_ms)
        trailing_gap_ms = max(0, segment_end_ms - covered_end_ms)
        coverage_percent = round(coverage_ms / segment_duration_ms, 4)

    asset_read_start_ms = (
        asset_start_ms + max(0, covered_start_ms - timeline_start_ms)
        if coverage_ms > 0
        else None
    )

    return {
        "coverageMs": coverage_ms,
        "coveragePercent": coverage_percent,
        "leadingGapMs": leading_gap_ms,
        "trailingGapMs": trailing_gap_ms,
        "assetReadStartMs": asset_read_start_ms,
    }


def build_sync_map_render_audio_qa(
    *,
    segment: dict[str, Any],
    media_map: dict[str, Any],
    media_map_path: Path,
    resolved_media: dict[str, Any],
) -> dict[str, Any]:
    warnings: list[str] = []
    mode = get_sync_map_render_audio_mode(media_map, resolved_media)

    if mode == "program":
        return {
            "mode": mode,
            "sources": [
                {
                    "role": "program",
                    "fileName": Path(str(media_map["audio"]["program"])).name,
                    "coverageMs": segment["durationMs"],
                    "coveragePercent": 1,
                    "leadingSilenceMs": 0,
                    "trailingSilenceMs": 0,
                }
            ],
            "silencePaddingMs": 0,
            "warnings": warnings,
        }

    if mode == "silent":
        warnings.append("segment will render with silent audio")
        return {
            "mode": mode,
            "sources": [],
            "silencePaddingMs": segment["durationMs"],
            "warnings": warnings,
        }

    sources = []
    silence_padding_ms = 0

    for audio_entry in resolved_media.get("__audio_assets__", []):
        asset = audio_entry["asset"]
        coverage = compute_sync_map_asset_segment_coverage(
            segment=segment,
            asset=asset,
        )
        leading_silence_ms = coverage["leadingGapMs"]
        trailing_silence_ms = coverage["trailingGapMs"]
        silence_padding_ms += leading_silence_ms + trailing_silence_ms

        if coverage["coverageMs"] <= 0:
            warnings.append(
                f"{audio_entry['role']} has no coverage for this segment"
            )
        elif leading_silence_ms or trailing_silence_ms:
            warnings.append(
                f"{audio_entry['role']} has partial coverage for this segment"
            )

        sources.append(
            {
                "role": audio_entry["role"],
                "inputId": asset.get("inputId"),
                "fileName": asset.get("fileName"),
                "coverageMs": coverage["coverageMs"],
                "coveragePercent": coverage["coveragePercent"],
                "leadingSilenceMs": leading_silence_ms,
                "trailingSilenceMs": trailing_silence_ms,
                "assetReadStartMs": coverage["assetReadStartMs"],
            }
        )

    return {
        "mode": mode,
        "sources": sources,
        "silencePaddingMs": silence_padding_ms,
        "warnings": warnings,
    }


def print_sync_map_render_qa_summary(
    report: dict[str, Any], *, out_path: Path | None
) -> None:
    summary = report["summary"]
    print("\nSync Map render QA")
    print("==================")
    print(f"Audio mode: {summary['audioMode']}")
    print(f"Active segments: {summary['segmentCount']}")
    print(f"Black video padding: {format_time_ms(summary['totalBlackPaddingMs'])}")
    print(f"Silence audio padding: {format_time_ms(summary['silencePaddingMs'])}")

    if out_path:
        print(f"QA JSON: {out_path}")

    if report["warnings"]:
        print("QA warnings:")
        for warning in report["warnings"][:5]:
            print(f"  - {warning}")
        if len(report["warnings"]) > 5:
            print(f"  - ...and {len(report['warnings']) - 5} more")


def render_sync_map_youtube_16x9_segments(
    *,
    ffmpeg_path: str,
    media_map: dict[str, Any],
    media_map_path: Path,
    segments: list[dict[str, Any]],
    resolved_media: dict[str, dict[str, Any]],
    out_path: Path,
    temp_path: Path,
) -> None:
    temp_path.mkdir(parents=True, exist_ok=True)
    segment_files = []

    for segment in segments:
        segment_file = temp_path / f"sync-map16x9-segment-{int(segment['index']):04d}.mp4"
        segment_files.append(segment_file)
        command = build_sync_map_youtube_16x9_segment_command(
            ffmpeg_path=ffmpeg_path,
            media_map=media_map,
            media_map_path=media_map_path,
            segment=segment,
            resolved_media=resolved_media,
            out_path=segment_file,
        )
        run_command(command, f"ffmpeg render Sync Map segment {int(segment['index']) + 1}")

    concat_file = temp_path / "segments.txt"
    concat_file.write_text(
        "\n".join(f"file '{escape_ffmpeg_concat_path(path)}'" for path in segment_files)
        + "\n",
        encoding="utf-8",
    )
    run_ffmpeg_concat(
        ffmpeg_path=ffmpeg_path,
        concat_file=concat_file,
        out_path=out_path,
    )


def print_sync_map_render_commands(
    *,
    ffmpeg_path: str,
    media_map: dict[str, Any],
    media_map_path: Path,
    segments: list[dict[str, Any]],
    resolved_media: dict[str, dict[str, Any]],
    out_path: Path,
    temp_path: Path,
) -> None:
    segment_files = []

    print("\nSync Map 16:9 ffmpeg segment plan:")
    for segment in segments:
        segment_file = temp_path / f"sync-map16x9-segment-{int(segment['index']):04d}.mp4"
        segment_files.append(segment_file)
        roles = ", ".join(get_youtube_16x9_video_roles(segment["programState"]))
        print(
            f"\nSegment {int(segment['index']) + 1}: "
            f"{segment['programState']} / {segment['layoutBehavior']} / sources: {roles}"
        )
        print(
            format_shell_command(
                build_sync_map_youtube_16x9_segment_command(
                    ffmpeg_path=ffmpeg_path,
                    media_map=media_map,
                    media_map_path=media_map_path,
                    segment=segment,
                    resolved_media=resolved_media,
                    out_path=segment_file,
                )
            )
        )

    concat_file = temp_path / "segments.txt"
    print("\nFinal concat:")
    print(
        format_shell_command(
            build_ffmpeg_concat_command(
                ffmpeg_path=ffmpeg_path,
                concat_file=concat_file,
                out_path=out_path,
            )
        )
    )
    print(f"\nConcat list would include {len(segment_files)} rendered segment file(s).")


def build_sync_map_youtube_16x9_segment_command(
    *,
    ffmpeg_path: str,
    media_map: dict[str, Any],
    media_map_path: Path,
    segment: dict[str, Any],
    resolved_media: dict[str, dict[str, Any]],
    out_path: Path,
) -> list[str]:
    state = segment["programState"]
    video_roles = get_youtube_16x9_video_roles(state)
    duration_seconds = float(segment["durationMs"]) / 1000
    command = [ffmpeg_path, "-hide_banner", "-loglevel", "error", "-y"]
    role_filters = []
    role_labels: list[str] = []

    for input_index, role in enumerate(video_roles):
        entry = resolved_media[role]
        role_labels.append(f"role{input_index}")
        command.extend(["-i", str(entry["path"])])
        role_filters.append(
            build_sync_map_role_video_filter(
                input_index=input_index,
                output_label=f"role{input_index}",
                segment=segment,
                asset=entry["asset"],
            )
        )

    program_audio = media_map["audio"].get("program")
    start_seconds = float(segment["startSourceTimeMs"]) / 1000

    if program_audio:
        audio_input_index = len(video_roles)
        command.extend(
            [
                "-ss",
                format_seconds(start_seconds),
                "-t",
                format_seconds(duration_seconds),
                "-i",
                str(resolve_media_path(program_audio, media_map_path)),
            ]
        )
        audio_filter = build_program_audio_output_filter(
            input_label=f"{audio_input_index}:a",
            duration_seconds=duration_seconds,
        )
    elif resolved_media.get("__audio_assets__"):
        audio_filters = []
        audio_labels = []

        for audio_index, audio_entry in enumerate(resolved_media["__audio_assets__"]):
            input_index = len(video_roles) + audio_index
            command.extend(["-i", str(audio_entry["path"])])
            label = f"clean{audio_index}"
            audio_labels.append(label)
            audio_filters.append(
                build_sync_map_clean_audio_filter(
                    input_index=input_index,
                    output_label=label,
                    segment=segment,
                    asset=audio_entry["asset"],
                )
            )

        if len(audio_labels) == 1:
            mix_filter = build_audio_output_finalize_filter(
                input_label=audio_labels[0],
                duration_seconds=duration_seconds,
            )
        else:
            mix_filter = (
                "".join(f"[{label}]" for label in audio_labels)
                + f"amix=inputs={len(audio_labels)}:duration=longest:normalize=1,"
                + "alimiter=limit=0.95,"
                + build_audio_output_tail(duration_seconds=duration_seconds)
            )

        audio_filter = ";".join([*audio_filters, mix_filter])
    else:
        audio_input_index = len(video_roles)
        command.extend(
            [
                "-f",
                "lavfi",
                "-t",
                format_seconds(duration_seconds),
                "-i",
                "anullsrc=channel_layout=stereo:sample_rate=48000",
            ]
        )
        audio_filter = build_program_audio_output_filter(
            input_label=f"{audio_input_index}:a",
            duration_seconds=duration_seconds,
        )

    filter_complex = ";".join(
        [
            *role_filters,
            build_youtube_16x9_labeled_video_filter(state, role_labels),
            audio_filter,
        ]
    )
    command.extend(
        [
            "-filter_complex",
            filter_complex,
            "-map",
            "[vout]",
            "-map",
            "[aout]",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "22",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-shortest",
            "-movflags",
            "+faststart",
            str(out_path),
        ]
    )

    return command


def build_sync_map_role_video_filter(
    *,
    input_index: int,
    output_label: str,
    segment: dict[str, Any],
    asset: dict[str, Any],
) -> str:
    segment_start_ms = int(segment["startSourceTimeMs"])
    segment_end_ms = int(segment["endSourceTimeMs"])
    segment_duration_ms = int(segment["durationMs"])
    timeline_start_ms = int(round(float(asset["timelineStartMs"])))
    asset_start_ms = int(round(float(asset["assetStartMs"])))
    asset_duration_ms = int(round(float(asset["durationMs"])))
    asset_timeline_end_ms = timeline_start_ms + asset_duration_ms
    visible_start_ms = max(segment_start_ms, timeline_start_ms)
    visible_end_ms = min(segment_end_ms, asset_timeline_end_ms)

    if visible_end_ms <= visible_start_ms:
        return (
            "color=c=black:s=1280x720:r=30:"
            f"d={format_seconds(segment_duration_ms / 1000)},"
            f"format=yuv420p[{output_label}]"
        )

    visible_duration_ms = visible_end_ms - visible_start_ms
    source_start_ms = asset_start_ms + (visible_start_ms - timeline_start_ms)
    leading_ms = visible_start_ms - segment_start_ms
    trailing_ms = segment_end_ms - visible_end_ms

    return (
        f"[{input_index}:v]"
        f"trim=start={format_seconds(source_start_ms / 1000)}:"
        f"duration={format_seconds(visible_duration_ms / 1000)},"
        "setpts=PTS-STARTPTS,"
        f"tpad=start_duration={format_seconds(leading_ms / 1000)}:"
        f"stop_duration={format_seconds(trailing_ms / 1000)}:color=black,"
        f"trim=duration={format_seconds(segment_duration_ms / 1000)},"
        f"fps={YOUTUBE_16X9_FPS},setpts=PTS-STARTPTS,format=yuv420p[{output_label}]"
    )


def build_sync_map_clean_audio_filter(
    *,
    input_index: int,
    output_label: str,
    segment: dict[str, Any],
    asset: dict[str, Any],
) -> str:
    segment_start_ms = int(segment["startSourceTimeMs"])
    segment_end_ms = int(segment["endSourceTimeMs"])
    segment_duration_ms = int(segment["durationMs"])
    timeline_start_ms = int(round(float(asset["timelineStartMs"])))
    asset_start_ms = int(round(float(asset["assetStartMs"])))
    asset_duration_ms = int(round(float(asset["durationMs"])))
    asset_timeline_end_ms = timeline_start_ms + asset_duration_ms
    audible_start_ms = max(segment_start_ms, timeline_start_ms)
    audible_end_ms = min(segment_end_ms, asset_timeline_end_ms)

    if audible_end_ms <= audible_start_ms:
        return (
            "anullsrc=channel_layout=stereo:sample_rate=48000,"
            f"atrim=0:{format_seconds(segment_duration_ms / 1000)},"
            f"asetpts=PTS-STARTPTS[{output_label}]"
        )

    audible_duration_ms = audible_end_ms - audible_start_ms
    source_start_ms = asset_start_ms + (audible_start_ms - timeline_start_ms)
    leading_ms = audible_start_ms - segment_start_ms

    return (
        f"[{input_index}:a]"
        f"atrim=start={format_seconds(source_start_ms / 1000)}:"
        f"duration={format_seconds(audible_duration_ms / 1000)},"
        "asetpts=PTS-STARTPTS,"
        f"aresample={RENDER_AUDIO_SAMPLE_RATE},"
        f"aformat=sample_fmts=fltp:channel_layouts={RENDER_AUDIO_CHANNEL_LAYOUT},"
        f"adelay={leading_ms}:all=1,"
        f"apad,atrim=0:{format_seconds(segment_duration_ms / 1000)},"
        f"asetpts=PTS-STARTPTS[{output_label}]"
    )


def build_program_audio_output_filter(
    *, input_label: str, duration_seconds: float
) -> str:
    return (
        f"[{input_label}]"
        f"atrim=0:{format_seconds(duration_seconds)},"
        "asetpts=PTS-STARTPTS,"
        f"aresample={RENDER_AUDIO_SAMPLE_RATE},"
        f"aformat=sample_fmts=fltp:channel_layouts={RENDER_AUDIO_CHANNEL_LAYOUT},"
        "alimiter=limit=0.95,"
        f"{build_audio_output_tail(duration_seconds=duration_seconds)}"
    )


def build_audio_output_finalize_filter(
    *, input_label: str, duration_seconds: float
) -> str:
    return (
        f"[{input_label}]"
        "alimiter=limit=0.95,"
        f"{build_audio_output_tail(duration_seconds=duration_seconds)}"
    )


def build_audio_output_tail(*, duration_seconds: float) -> str:
    return (
        f"apad,atrim=0:{format_seconds(duration_seconds)},"
        f"aresample={RENDER_AUDIO_SAMPLE_RATE},"
        f"aformat=sample_fmts=fltp:channel_layouts={RENDER_AUDIO_CHANNEL_LAYOUT},"
        "asetpts=PTS-STARTPTS[aout]"
    )


def build_youtube_16x9_labeled_video_filter(state: str, input_labels: list[str]) -> str:
    if state in {"charlie", "homer"}:
        return video_scale_filter_from_label(
            input_labels[0], YOUTUBE_16X9_WIDTH, YOUTUBE_16X9_HEIGHT, "vout"
        )

    if state in {"both", "charlie_clip", "homer_clip"}:
        return ";".join(
            [
                video_scale_filter_from_label(input_labels[0], 960, 1080, "left"),
                video_scale_filter_from_label(input_labels[1], 960, 1080, "right"),
                "[left][right]hstack=inputs=2[vout]",
            ]
        )

    if state == "both_clip":
        return ";".join(
            [
                video_scale_filter_from_label(input_labels[0], 640, 540, "homer"),
                video_scale_filter_from_label(input_labels[1], 640, 540, "charlie"),
                "[homer][charlie]vstack=inputs=2[left]",
                video_scale_filter_from_label(input_labels[2], 1280, 1080, "clip"),
                "[left][clip]hstack=inputs=2[vout]",
            ]
        )

    raise StudioCutCliError(f"cannot render state in Sync Map youtube_16x9 renderer: {state}")


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
    command = build_ffmpeg_concat_command(
        ffmpeg_path=ffmpeg_path,
        concat_file=concat_file,
        out_path=out_path,
    )
    run_command(command, "ffmpeg concatenate segments")


def build_ffmpeg_concat_command(
    *, ffmpeg_path: str, concat_file: Path, out_path: Path
) -> list[str]:
    return [
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


def run_command(command: list[str], label: str) -> None:
    try:
        subprocess.run(command, check=True)
    except subprocess.CalledProcessError as error:
        raise StudioCutCliError(f"{label} failed with exit code {error.returncode}") from error


def run_command_capture(
    command: list[str], label: str, commands_run: list[str]
) -> subprocess.CompletedProcess[str]:
    commands_run.append(format_shell_command(command))
    result = subprocess.run(
        command,
        check=False,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    if result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip()
        suffix = f": {detail}" if detail else ""
        raise StudioCutCliError(
            f"{label} failed with exit code {result.returncode}{suffix}"
        )

    return result


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
        and (event.get("clientId") is None or isinstance(event.get("clientId"), str))
        and (
            event.get("operation") is None
            or event.get("operation") in {"upsert", "import", "remove"}
        )
        and (event.get("note") is None or isinstance(event.get("note"), str))
        and (
            event.get("removedAt") is None
            or (
                isinstance(event.get("removedAt"), str)
                and bool(event["removedAt"].strip())
            )
        )
        and (event.get("removedBy") is None or isinstance(event.get("removedBy"), str))
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


def parse_bool_arg(value: str | bool) -> bool:
    if isinstance(value, bool):
        return value

    normalized_value = value.strip().lower()

    if normalized_value in {"1", "true", "yes", "y", "on"}:
        return True

    if normalized_value in {"0", "false", "no", "n", "off"}:
        return False

    raise argparse.ArgumentTypeError("expected true or false")


def camel_to_kebab(value: str) -> str:
    result = []

    for index, character in enumerate(value):
        if character.isupper() and index > 0:
            result.append("-")
        result.append(character.lower())

    return "".join(result)


def safe_file_part(value: str) -> str:
    normalized = []

    for character in value.strip().lower():
        if character.isalnum():
            normalized.append(character)
        elif character in {"-", "_", "."}:
            normalized.append("-" if character != "." else ".")
        else:
            normalized.append("-")

    compacted = []
    previous_dash = False
    for character in normalized:
        if character == "-":
            if not previous_dash:
                compacted.append(character)
            previous_dash = True
        else:
            compacted.append(character)
            previous_dash = False

    return "".join(compacted).strip("-.") or "file"


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


def format_percent(value: int | float) -> str:
    return f"{round(max(0, min(1, float(value))) * 100)}%"


def format_digest(value: str) -> str:
    if len(value) <= 20:
        return value

    return f"{value[:12]}...{value[-6:]}"


def utc_now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")


def create_agent_decision_id(
    project_id: str, branch_id: str, source_time_ms: int, state: str
) -> str:
    slug = safe_file_part(f"{project_id}-{branch_id}-{state}-{source_time_ms}")
    return f"agent-{slug}-{uuid.uuid4().hex[:10]}"


def append_decision_note(existing_note: Any, addition: str) -> str:
    if isinstance(existing_note, str) and existing_note.strip():
        return f"{existing_note.strip()} | {addition}"

    return addition


def format_seconds(value: float) -> str:
    return f"{value:.3f}"


def format_shell_command(command: list[str]) -> str:
    return " ".join(shlex.quote(part) for part in command)


def yes_no(value: bool) -> str:
    return "yes" if value else "no"


def short_id(value: str) -> str:
    return value[:8]


def escape_ffmpeg_concat_path(path: Path) -> str:
    return str(path).replace("\\", "\\\\").replace("'", "\\'")


if __name__ == "__main__":
    raise SystemExit(main())
