#!/usr/bin/env python3
"""Refresh the Episode audio workbench control plane in a safe sequence.

This is the antidote to stale manifest truth. Several audio-workbench scripts
write summary fields back to manifest.json. Running them in parallel can leave a
newer report pointing at older promoted readback fields. This runner serializes
those writers and records one reviewer-friendly refresh report.

It does not approve audio, render branches, upload files, publish, or mutate
source media. It only regenerates control-plane reports and manifest summaries.
"""

from __future__ import annotations

import argparse
import html
import json
import os
import subprocess
import sys
import time
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent


@dataclass
class StepResult:
    name: str
    command: list[str]
    exitCode: int
    startedAt: str
    finishedAt: str
    durationSeconds: float
    stdoutTail: str
    stderrTail: str

    @property
    def ok(self) -> bool:
        return self.exitCode == 0


@dataclass
class PostCheck:
    name: str
    passed: bool
    detail: str


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


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def utc_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def tail_text(value: str, limit: int = 2400) -> str:
    if len(value) <= limit:
        return value
    return value[-limit:]


def script_path(name: str) -> Path:
    path = SCRIPT_DIR / name
    if not path.exists():
        raise FileNotFoundError(f"Missing script: {path}")
    return path


def run_step(name: str, command: list[str], cwd: Path) -> StepResult:
    started = iso_now()
    start_time = time.monotonic()
    proc = subprocess.run(command, cwd=cwd, text=True, capture_output=True)
    finished = iso_now()
    return StepResult(
        name=name,
        command=command,
        exitCode=proc.returncode,
        startedAt=started,
        finishedAt=finished,
        durationSeconds=round(time.monotonic() - start_time, 3),
        stdoutTail=tail_text(proc.stdout),
        stderrTail=tail_text(proc.stderr),
    )


def output_path(value: Any) -> str | None:
    if isinstance(value, str) and value:
        return value
    if isinstance(value, dict):
        for key in (
            "path",
            "jsonPath",
            "markdownPath",
            "htmlPath",
            "openCommand",
            "versionedPath",
            "versionedJsonPath",
            "versionedMarkdownPath",
            "versionedHtmlPath",
        ):
            subvalue = value.get(key)
            if isinstance(subvalue, str) and subvalue:
                return subvalue
    return None


def existing_output(outputs: dict[str, Any], key: str) -> tuple[bool, str]:
    path = output_path(outputs.get(key))
    if not path:
        return False, f"{key}=missing"
    p = Path(path)
    if not p.exists():
        return False, f"{key}={path} does not exist"
    if p.is_file() and p.stat().st_size <= 0:
        return False, f"{key}={path} is empty"
    return True, f"{key}={path}"


def build_steps(baseline_dir: Path, goal_file: Path | None) -> list[tuple[str, list[str]]]:
    py = sys.executable or "python3"
    base = str(baseline_dir)
    steps: list[tuple[str, list[str]]] = [
        (
            "speaker cleanup acceptance board",
            [py, str(script_path("audio_workbench_speaker_cleanup_acceptance_board.py")), "--baseline-dir", base],
        ),
        (
            "speaker cleanup listen reel",
            [py, str(script_path("audio_workbench_speaker_cleanup_listen_reel.py")), "--baseline-dir", base],
        ),
        (
            "source-balance triage",
            [py, str(script_path("audio_workbench_source_balance_triage.py")), "--baseline-dir", base],
        ),
        (
            "technical audition audit",
            [py, str(script_path("audio_workbench_technical_audition_audit.py")), "--baseline-dir", base],
        ),
        (
            "technical audition snippet pack",
            [py, str(script_path("audio_workbench_technical_audition_snippet_pack.py")), "--baseline-dir", base],
        ),
        (
            "technical audition notes inbox",
            [py, str(script_path("audio_workbench_technical_audition_notes_inbox.py")), "--baseline-dir", base],
        ),
        (
            "technical audition notes inbox smoke",
            [py, str(script_path("audio_workbench_technical_audition_notes_inbox_smoke.py")), "--baseline-dir", base],
        ),
        (
            "audio defect atlas",
            [py, str(script_path("audio_workbench_defect_atlas.py")), "--baseline-dir", base],
        ),
        (
            "audio defect atlas notes inbox",
            [py, str(script_path("audio_workbench_defect_atlas_notes_inbox.py")), "--baseline-dir", base],
        ),
        (
            "audio defect atlas notes inbox smoke",
            [py, str(script_path("audio_workbench_defect_atlas_notes_inbox_smoke.py")), "--baseline-dir", base],
        ),
        (
            "blind listen sampler",
            [py, str(script_path("audio_workbench_blind_listen_sampler.py")), "--baseline-dir", base],
        ),
        (
            "blind listen notes inbox",
            [py, str(script_path("audio_workbench_blind_listen_notes_inbox.py")), "--baseline-dir", base],
        ),
        (
            "blind listen notes inbox smoke",
            [py, str(script_path("audio_workbench_blind_listen_notes_inbox_smoke.py")), "--baseline-dir", base],
        ),
        (
            "post-review action queue",
            [py, str(script_path("audio_workbench_post_review_action_queue.py")), "--baseline-dir", base],
        ),
        (
            "scoped v007 repair candidate planner",
            [py, str(script_path("audio_workbench_scoped_v007_repair_candidate_planner.py")), "--baseline-dir", base],
        ),
        (
            "scoped v007 repair candidate planner smoke",
            [py, str(script_path("audio_workbench_scoped_v007_repair_candidate_planner_smoke.py")), "--baseline-dir", base],
        ),
        (
            "post-failure repair rehearsal",
            [py, str(script_path("audio_workbench_post_failure_repair_rehearsal.py")), "--baseline-dir", base],
        ),
        (
            "human-listen decision front door",
            [py, str(script_path("audio_workbench_human_listen_decision_front_door.py")), "--baseline-dir", base],
        ),
        (
            "human-listen decision front-door smoke",
            [py, str(script_path("audio_workbench_human_listen_decision_front_door_smoke.py")), "--baseline-dir", base],
        ),
        (
            "codex listen decision intake smoke",
            [py, str(script_path("audio_workbench_codex_listen_decision_intake_smoke.py")), "--baseline-dir", base],
        ),
        (
            "codex listen decision record sandbox smoke",
            [py, str(script_path("audio_workbench_codex_listen_decision_record_sandbox_smoke.py")), "--baseline-dir", base],
        ),
        (
            "listen decision command center",
            [py, str(script_path("audio_workbench_listen_decision_command_center.py")), "--baseline-dir", base],
        ),
        (
            "final listen mission packet",
            [py, str(script_path("audio_workbench_final_listen_mission_packet.py")), "--baseline-dir", base],
        ),
        (
            "platform loudness audit",
            [py, str(script_path("audio_workbench_platform_loudness_audit.py")), "--baseline-dir", base],
        ),
        (
            "quality methods matrix",
            [py, str(script_path("audio_workbench_quality_methods_matrix.py")), "--baseline-dir", base],
        ),
        (
            "quality escalation plan",
            [py, str(script_path("audio_workbench_quality_escalation_plan.py")), "--baseline-dir", base],
        ),
        (
            "source-aware stem manifest",
            [py, str(script_path("audio_workbench_source_aware_stem_manifest.py")), "--baseline-dir", base],
        ),
        (
            "source-aware timing contract",
            [py, str(script_path("audio_workbench_source_aware_timing_contract.py")), "--baseline-dir", base],
        ),
            (
                "segment loudness map",
                [py, str(script_path("audio_workbench_segment_loudness_map.py")), "--baseline-dir", base],
            ),
            (
                "fast readback check",
                [py, str(script_path("audio_workbench_fast_readback_check.py")), "--baseline-dir", base],
            ),
            (
                "human approval preflight",
                [py, str(script_path("audio_workbench_human_approval_preflight.py")), "--baseline-dir", base],
            ),
            (
                "episode4 audio spine registry",
                [py, str(script_path("build_episode4_audio_spine_registry.py"))],
            ),
            (
                "audio spine registry readback",
                [py, str(script_path("audio_spine_registry_readback_check.py"))],
            ),
            (
                "audio spine listen sanity",
                [py, str(script_path("audio_workbench_spine_listen_sanity.py")), "--baseline-dir", base],
            ),
        (
            "asr evidence adapter",
            [py, str(script_path("audio_workbench_asr_evidence_adapter.py")), "--baseline-dir", base],
        ),
        (
            "asr source/master comparison",
            [py, str(script_path("audio_workbench_asr_source_master_comparison.py")), "--baseline-dir", base],
        ),
        (
            "asr review focus packet",
            [py, str(script_path("audio_workbench_asr_review_focus_packet.py")), "--baseline-dir", base],
        ),
        (
            "transcript source agreement audit",
            [py, str(script_path("audio_workbench_transcript_source_agreement_audit.py")), "--baseline-dir", base],
        ),
        (
            "audio spine quality gate",
            [py, str(script_path("audio_workbench_spine_quality_gate.py")), "--baseline-dir", base],
        ),
        (
            "machine listen sentinel",
            [py, str(script_path("audio_workbench_machine_listen_sentinel.py")), "--baseline-dir", base],
        ),
        (
            "master smoothness audit",
            [py, str(script_path("audio_workbench_master_smoothness_audit.py")), "--baseline-dir", base],
        ),
        (
            "spectral fatigue audit",
            [py, str(script_path("audio_workbench_spectral_fatigue_audit.py")), "--baseline-dir", base],
        ),
        (
            "translation survival audit",
            [py, str(script_path("audio_workbench_translation_survival_audit.py")), "--baseline-dir", base],
        ),
        (
            "morning audio review launcher",
            [py, str(script_path("audio_workbench_morning_audio_review_launcher.py")), "--baseline-dir", base],
        ),
        (
            "approved branch render executor",
            [py, str(script_path("audio_workbench_approved_branch_render_executor.py")), "--baseline-dir", base],
        ),
        (
            "post-approval render rehearsal",
            [py, str(script_path("audio_workbench_post_approval_render_rehearsal.py")), "--baseline-dir", base],
        ),
        (
            "post-listen episode runway",
            [py, str(script_path("audio_workbench_post_listen_episode_runway.py")), "--baseline-dir", base],
        ),
        (
            "post-approval branch runway packet",
            [py, str(script_path("audio_workbench_post_approval_branch_runway_packet.py")), "--baseline-dir", base],
        ),
    ]
    if goal_file is not None:
        steps.append(
            (
                "goal completion audit",
                [
                    py,
                    str(script_path("audio_workbench_goal_completion_audit.py")),
                    "--baseline-dir",
                    base,
                    "--goal-file",
                    str(goal_file),
                ],
            )
        )
    steps.extend(
        [
            (
                "manifest readback smoke before gate",
                [py, str(script_path("audio_workbench_manifest_readback_consistency_smoke.py")), "--baseline-dir", base],
            ),
            (
                "fast readback check before gate",
                [py, str(script_path("audio_workbench_fast_readback_check.py")), "--baseline-dir", base],
            ),
            (
                "review gate audit",
                [py, str(script_path("audio_workbench_review_gate_audit.py")), "--baseline-dir", base],
            ),
            (
                "manifest readback smoke after gate",
                [py, str(script_path("audio_workbench_manifest_readback_consistency_smoke.py")), "--baseline-dir", base],
            ),
            (
                "fast readback check after gate",
                [py, str(script_path("audio_workbench_fast_readback_check.py")), "--baseline-dir", base],
            ),
            (
                "audio spine registry readback after gate",
                [py, str(script_path("audio_spine_registry_readback_check.py"))],
            ),
            (
                "sound director scorecard after gate",
                [py, str(script_path("audio_workbench_sound_director_scorecard.py")), "--baseline-dir", base],
            ),
            (
                "platform loudness audit after gate",
                [py, str(script_path("audio_workbench_platform_loudness_audit.py")), "--baseline-dir", base],
            ),
            (
                "morning publication readiness after gate",
                [py, str(script_path("audio_workbench_morning_publication_readiness_packet.py")), "--baseline-dir", base],
            ),
            (
                "quality methods matrix after gate",
                [py, str(script_path("audio_workbench_quality_methods_matrix.py")), "--baseline-dir", base],
            ),
            (
                "quality escalation plan after gate",
                [py, str(script_path("audio_workbench_quality_escalation_plan.py")), "--baseline-dir", base],
            ),
            (
                "audio spine listen sanity after gate",
                [py, str(script_path("audio_workbench_spine_listen_sanity.py")), "--baseline-dir", base],
            ),
            (
                "asr evidence adapter after gate",
                [py, str(script_path("audio_workbench_asr_evidence_adapter.py")), "--baseline-dir", base],
            ),
            (
                "asr source/master comparison after gate",
                [py, str(script_path("audio_workbench_asr_source_master_comparison.py")), "--baseline-dir", base],
            ),
            (
                "asr review focus packet after gate",
                [py, str(script_path("audio_workbench_asr_review_focus_packet.py")), "--baseline-dir", base],
            ),
            (
                "transcript source agreement audit after gate",
                [py, str(script_path("audio_workbench_transcript_source_agreement_audit.py")), "--baseline-dir", base],
            ),
            (
                "audio spine quality gate after gate",
                [py, str(script_path("audio_workbench_spine_quality_gate.py")), "--baseline-dir", base],
            ),
            (
                "machine listen sentinel after gate",
                [py, str(script_path("audio_workbench_machine_listen_sentinel.py")), "--baseline-dir", base],
            ),
            (
                "master smoothness audit after gate",
                [py, str(script_path("audio_workbench_master_smoothness_audit.py")), "--baseline-dir", base],
            ),
            (
                "spectral fatigue audit after gate",
                [py, str(script_path("audio_workbench_spectral_fatigue_audit.py")), "--baseline-dir", base],
            ),
            (
                "translation survival audit after gate",
                [py, str(script_path("audio_workbench_translation_survival_audit.py")), "--baseline-dir", base],
            ),
            (
                "morning audio review launcher after gate",
                [py, str(script_path("audio_workbench_morning_audio_review_launcher.py")), "--baseline-dir", base],
            ),
            (
                "approved branch render executor after gate",
                [py, str(script_path("audio_workbench_approved_branch_render_executor.py")), "--baseline-dir", base],
            ),
            (
                "post-approval render rehearsal after gate",
                [py, str(script_path("audio_workbench_post_approval_render_rehearsal.py")), "--baseline-dir", base],
            ),
            (
                "post-failure repair rehearsal after gate",
                [py, str(script_path("audio_workbench_post_failure_repair_rehearsal.py")), "--baseline-dir", base],
            ),
            (
                "post-listen episode runway after gate",
                [py, str(script_path("audio_workbench_post_listen_episode_runway.py")), "--baseline-dir", base],
            ),
            (
                "post-approval branch runway packet after gate",
                [py, str(script_path("audio_workbench_post_approval_branch_runway_packet.py")), "--baseline-dir", base],
            ),
            (
                "producer command center after gate",
                [py, str(script_path("audio_workbench_producer_command_center.py")), "--baseline-dir", base],
            ),
            (
                "review gate audit after command center",
                [py, str(script_path("audio_workbench_review_gate_audit.py")), "--baseline-dir", base],
            ),
            (
                "manifest readback smoke final",
                [py, str(script_path("audio_workbench_manifest_readback_consistency_smoke.py")), "--baseline-dir", base],
            ),
            (
                "fast readback check final",
                [py, str(script_path("audio_workbench_fast_readback_check.py")), "--baseline-dir", base],
            ),
            (
                "audio spine registry readback final",
                [py, str(script_path("audio_spine_registry_readback_check.py"))],
            ),
            (
                "sound director scorecard final",
                [py, str(script_path("audio_workbench_sound_director_scorecard.py")), "--baseline-dir", base],
            ),
            (
                "platform loudness audit final",
                [py, str(script_path("audio_workbench_platform_loudness_audit.py")), "--baseline-dir", base],
            ),
            (
                "morning publication readiness final",
                [py, str(script_path("audio_workbench_morning_publication_readiness_packet.py")), "--baseline-dir", base],
            ),
            (
                "quality methods matrix final",
                [py, str(script_path("audio_workbench_quality_methods_matrix.py")), "--baseline-dir", base],
            ),
            (
                "quality escalation plan final",
                [py, str(script_path("audio_workbench_quality_escalation_plan.py")), "--baseline-dir", base],
            ),
            (
                "audio spine listen sanity final",
                [py, str(script_path("audio_workbench_spine_listen_sanity.py")), "--baseline-dir", base],
            ),
            (
                "asr evidence adapter final",
                [py, str(script_path("audio_workbench_asr_evidence_adapter.py")), "--baseline-dir", base],
            ),
            (
                "asr source/master comparison final",
                [py, str(script_path("audio_workbench_asr_source_master_comparison.py")), "--baseline-dir", base],
            ),
            (
                "asr review focus packet final",
                [py, str(script_path("audio_workbench_asr_review_focus_packet.py")), "--baseline-dir", base],
            ),
            (
                "transcript source agreement audit final",
                [py, str(script_path("audio_workbench_transcript_source_agreement_audit.py")), "--baseline-dir", base],
            ),
            (
                "audio spine quality gate final",
                [py, str(script_path("audio_workbench_spine_quality_gate.py")), "--baseline-dir", base],
            ),
            (
                "machine listen sentinel final",
                [py, str(script_path("audio_workbench_machine_listen_sentinel.py")), "--baseline-dir", base],
            ),
            (
                "master smoothness audit final",
                [py, str(script_path("audio_workbench_master_smoothness_audit.py")), "--baseline-dir", base],
            ),
            (
                "spectral fatigue audit final",
                [py, str(script_path("audio_workbench_spectral_fatigue_audit.py")), "--baseline-dir", base],
            ),
            (
                "translation survival audit final",
                [py, str(script_path("audio_workbench_translation_survival_audit.py")), "--baseline-dir", base],
            ),
            (
                "morning audio review launcher final",
                [py, str(script_path("audio_workbench_morning_audio_review_launcher.py")), "--baseline-dir", base],
            ),
            (
                "approved branch render executor final",
                [py, str(script_path("audio_workbench_approved_branch_render_executor.py")), "--baseline-dir", base],
            ),
            (
                "post-approval render rehearsal final",
                [py, str(script_path("audio_workbench_post_approval_render_rehearsal.py")), "--baseline-dir", base],
            ),
            (
                "listen decision command center final",
                [py, str(script_path("audio_workbench_listen_decision_command_center.py")), "--baseline-dir", base],
            ),
            (
                "post-failure repair rehearsal final",
                [py, str(script_path("audio_workbench_post_failure_repair_rehearsal.py")), "--baseline-dir", base],
            ),
            (
                "post-listen episode runway final",
                [py, str(script_path("audio_workbench_post_listen_episode_runway.py")), "--baseline-dir", base],
            ),
            (
                "post-approval branch runway packet final",
                [py, str(script_path("audio_workbench_post_approval_branch_runway_packet.py")), "--baseline-dir", base],
            ),
            (
                "producer command center final",
                [py, str(script_path("audio_workbench_producer_command_center.py")), "--baseline-dir", base],
            ),
            (
                "fast readback check after final command center",
                [py, str(script_path("audio_workbench_fast_readback_check.py")), "--baseline-dir", base],
            ),
            (
                "audio spine registry readback after final command center",
                [py, str(script_path("audio_spine_registry_readback_check.py"))],
            ),
            (
                "manifest readback smoke after final command center",
                [py, str(script_path("audio_workbench_manifest_readback_consistency_smoke.py")), "--baseline-dir", base],
            ),
        ]
    )
    return steps


def post_checks(manifest: dict[str, Any], goal_file: Path | None) -> list[PostCheck]:
    outputs = manifest.get("outputs") if isinstance(manifest.get("outputs"), dict) else {}
    checks: list[PostCheck] = []

    def add(name: str, passed: bool, detail: str) -> None:
        checks.append(PostCheck(name=name, passed=passed, detail=detail))

    add(
        "approval state remains human-listen gated",
        manifest.get("approvalStatus") == "machine-candidate-needs-human-listen-proof",
        f"approvalStatus={manifest.get('approvalStatus')!r}",
    )
    add(
        "package remains ready for human listen",
        bool(manifest.get("packageReadyForHumanListen")) is True,
        f"packageReadyForHumanListen={manifest.get('packageReadyForHumanListen')!r}",
    )
    registry_check_path = Path(
        "/Volumes/My Passport/Episode_and_Shorts_Test/"
        "Episode_4_Audio_Spine_Registry/AUDIO_SPINE_REGISTRY_READBACK_CHECK.json"
    )
    if registry_check_path.exists():
        try:
            registry_check = json.loads(registry_check_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as error:
            registry_check = {"passed": False, "error": str(error)}
        add(
            "audio spine registry readback passes",
            bool(registry_check.get("passed")) is True and int(registry_check.get("failureCount") or 0) == 0,
            f"status={registry_check.get('status')!r}, failures={registry_check.get('failureCount')!r}",
        )
    else:
        add(
            "audio spine registry readback passes",
            False,
            f"missing {registry_check_path}",
        )
    add(
        "branch inheritance remains locked",
        bool(manifest.get("branchInheritanceReady")) is False,
        f"branchInheritanceReady={manifest.get('branchInheritanceReady')!r}",
    )
    add(
        "branch render remains locked",
        bool(manifest.get("branchRenderReady")) is False,
        f"branchRenderReady={manifest.get('branchRenderReady')!r}",
    )
    add(
        "manifest readback smoke passed",
        bool(manifest.get("audioManifestReadbackConsistencySmokePassed")) is True
        and int(manifest.get("audioManifestReadbackConsistencySmokeFailureCount") or 0) == 0,
        "passed="
        f"{manifest.get('audioManifestReadbackConsistencySmokePassed')!r}; "
        f"failures={manifest.get('audioManifestReadbackConsistencySmokeFailureCount')!r}; "
        f"checks={manifest.get('audioManifestReadbackConsistencySmokeCheckCount')!r}",
    )
    add(
        "review gate passed",
        bool(manifest.get("audioReviewGateAuditLatestPassed")) is True
        and int(manifest.get("audioReviewGateAuditLatestErrorCount") or 0) == 0,
        "passed="
        f"{manifest.get('audioReviewGateAuditLatestPassed')!r}; "
        f"errors={manifest.get('audioReviewGateAuditLatestErrorCount')!r}; "
        f"warnings={manifest.get('audioReviewGateAuditLatestWarningCount')!r}",
    )
    add(
        "producer command center complete",
        manifest.get("audioProducerCommandCenterLatestStatus") == "ready-for-human-listen"
        and int(manifest.get("audioProducerCommandCenterMissingPrimaryArtifactCount") or 0) == 0,
        "status="
        f"{manifest.get('audioProducerCommandCenterLatestStatus')!r}; "
        f"missing={manifest.get('audioProducerCommandCenterMissingPrimaryArtifactCount')!r}; "
        f"primary={manifest.get('audioProducerCommandCenterPrimaryArtifactCount')!r}; "
        f"cards={manifest.get('audioProducerCommandCenterReviewCardCount')!r}",
    )
    add(
        "platform loudness audit machine-ready",
        int(manifest.get("audioPlatformLoudnessHardGateAttentionCount") or 0) == 0
        and bool(manifest.get("audioPlatformLoudnessPodcastProfilesMachineReady")) is True,
        "hardGates="
        f"{manifest.get('audioPlatformLoudnessHardGateAttentionCount')!r}; "
        f"podcastReady={manifest.get('audioPlatformLoudnessPodcastProfilesMachineReady')!r}",
    )
    add(
        "post-review queue ready",
        manifest.get("audioPostReviewActionQueueLatestStatus") == "ready-for-review-actions",
        "status="
        f"{manifest.get('audioPostReviewActionQueueLatestStatus')!r}; "
        f"sources={manifest.get('audioPostReviewActionQueueLatestSourceCount')!r}; "
        f"defectAtlasSource={manifest.get('audioPostReviewActionQueueLatestDefectAtlasNotesSourceRegistered')!r}; "
        f"notesSources={manifest.get('audioPostReviewActionQueueLatestSourceWithNotesCandidateCount')!r}; "
        f"repairActions={manifest.get('audioPostReviewActionQueueLatestRepairActionCount')!r}; "
        f"focusedProofActions={manifest.get('audioPostReviewActionQueueLatestFocusedProofActionCount')!r}",
    )
    add(
        "scoped v007 repair planner ready",
        manifest.get("audioScopedV007RepairCandidatePlanLatestStatus")
        in {"waiting-for-human-review-actions", "ready-for-scoped-v007-repair-planning"},
        "status="
        f"{manifest.get('audioScopedV007RepairCandidatePlanLatestStatus')!r}; "
        f"repairs={manifest.get('audioScopedV007RepairCandidatePlanRepairActionCount')!r}; "
        f"proofs={manifest.get('audioScopedV007RepairCandidatePlanFocusedProofActionCount')!r}; "
        f"plans={manifest.get('audioScopedV007RepairCandidatePlanPlannedItemCount')!r}",
    )
    add(
        "scoped v007 repair planner present",
        *existing_output(outputs, "latestAudioScopedV007RepairCandidatePlanHtml"),
    )
    add(
        "scoped v007 repair planner smoke passed",
        bool(manifest.get("audioScopedV007RepairCandidatePlanSmokePassed")) is True
        and int(manifest.get("audioScopedV007RepairCandidatePlanSmokeFailureCount") or 0) == 0,
        "passed="
        f"{manifest.get('audioScopedV007RepairCandidatePlanSmokePassed')!r}; "
        f"scenarios={manifest.get('audioScopedV007RepairCandidatePlanSmokeScenarioCount')!r}; "
        f"failures={manifest.get('audioScopedV007RepairCandidatePlanSmokeFailureCount')!r}",
    )
    add(
        "scoped v007 repair planner smoke present",
        *existing_output(outputs, "latestAudioScopedV007RepairCandidatePlanSmokeMarkdown"),
    )
    add(
        "speaker cleanup acceptance board present",
        *existing_output(outputs, "latestSpeakerCleanupAcceptanceBoardMarkdown"),
    )
    add(
        "speaker cleanup listen reel present",
        *existing_output(outputs, "latestSpeakerCleanupListenReelHtml"),
    )
    add(
        "audio defect atlas present",
        *existing_output(outputs, "latestAudioDefectAtlasHtml"),
    )
    add(
        "audio defect atlas notes inbox present",
        *existing_output(outputs, "latestAudioDefectAtlasNotesInboxHtml"),
    )
    add(
        "audio defect atlas notes inbox smoke present",
        *existing_output(outputs, "latestAudioDefectAtlasNotesInboxSmokeMarkdown"),
    )
    add(
        "final listen mission packet present",
        *existing_output(outputs, "latestAudioFinalListenMissionPacketHtml"),
    )
    add(
        "fast readback check present",
        *existing_output(outputs, "latestAudioFastReadbackCheckHtml"),
    )
    add(
        "codex listen decision intake smoke present",
        *existing_output(outputs, "latestAudioCodexListenDecisionIntakeSmokeHtml"),
    )
    add(
        "codex listen decision intake smoke passed",
        bool(manifest.get("audioCodexListenDecisionIntakeSmokePassed")) is True
        and int(manifest.get("audioCodexListenDecisionIntakeSmokeFailureCount") or 0) == 0
        and manifest.get("audioCodexListenDecisionIntakeSmokeLatestStatus") == "codex-listen-decision-intake-smoke-passed",
        "status="
        f"{manifest.get('audioCodexListenDecisionIntakeSmokeLatestStatus')!r}; "
        f"passed={manifest.get('audioCodexListenDecisionIntakeSmokePassed')!r}; "
        f"failures={manifest.get('audioCodexListenDecisionIntakeSmokeFailureCount')!r}; "
        f"checks={manifest.get('audioCodexListenDecisionIntakeSmokeCheckCount')!r}",
    )
    add(
        "codex listen decision intake smoke stays non-mutating",
        bool(manifest.get("audioCodexListenDecisionIntakeSmokeApprovalStateChanged")) is False
        and bool(manifest.get("audioCodexListenDecisionIntakeSmokeBranchStateChanged")) is False
        and bool(manifest.get("audioCodexListenDecisionIntakeSmokeRenderAttempted")) is False
        and bool(manifest.get("audioCodexListenDecisionIntakeSmokeUploadAttempted")) is False
        and bool(manifest.get("audioCodexListenDecisionIntakeSmokePublicationAttempted")) is False
        and bool(manifest.get("audioCodexListenDecisionIntakeSmokeOriginalMediaMutated")) is False,
        "approvalChanged="
        f"{manifest.get('audioCodexListenDecisionIntakeSmokeApprovalStateChanged')!r}; "
        f"branchChanged={manifest.get('audioCodexListenDecisionIntakeSmokeBranchStateChanged')!r}; "
        f"renderAttempted={manifest.get('audioCodexListenDecisionIntakeSmokeRenderAttempted')!r}; "
        f"uploadAttempted={manifest.get('audioCodexListenDecisionIntakeSmokeUploadAttempted')!r}; "
        f"publicationAttempted={manifest.get('audioCodexListenDecisionIntakeSmokePublicationAttempted')!r}; "
        f"originalMediaMutated={manifest.get('audioCodexListenDecisionIntakeSmokeOriginalMediaMutated')!r}",
    )
    add(
        "codex listen decision record sandbox smoke present",
        *existing_output(outputs, "latestAudioCodexListenDecisionRecordSandboxSmokeHtml"),
    )
    add(
        "codex listen decision record sandbox smoke passed",
        bool(manifest.get("audioCodexListenDecisionRecordSandboxSmokePassed")) is True
        and int(manifest.get("audioCodexListenDecisionRecordSandboxSmokeFailureCount") or 0) == 0
        and manifest.get("audioCodexListenDecisionRecordSandboxSmokeLatestStatus") == "codex-listen-decision-record-sandbox-smoke-passed",
        "status="
        f"{manifest.get('audioCodexListenDecisionRecordSandboxSmokeLatestStatus')!r}; "
        f"passed={manifest.get('audioCodexListenDecisionRecordSandboxSmokePassed')!r}; "
        f"failures={manifest.get('audioCodexListenDecisionRecordSandboxSmokeFailureCount')!r}; "
        f"checks={manifest.get('audioCodexListenDecisionRecordSandboxSmokeCheckCount')!r}",
    )
    add(
        "codex listen decision record sandbox smoke preserves real state",
        bool(manifest.get("audioCodexListenDecisionRecordSandboxSmokeRealApprovalPreserved")) is True
        and bool(manifest.get("audioCodexListenDecisionRecordSandboxSmokeRealSafetyChanged")) is False
        and bool(manifest.get("audioCodexListenDecisionRecordSandboxSmokeRealRenderAttempted")) is False
        and bool(manifest.get("audioCodexListenDecisionRecordSandboxSmokeRealUploadAttempted")) is False
        and bool(manifest.get("audioCodexListenDecisionRecordSandboxSmokeRealPublicationAttempted")) is False
        and bool(manifest.get("audioCodexListenDecisionRecordSandboxSmokeRealOriginalMediaMutated")) is False,
        "realApprovalPreserved="
        f"{manifest.get('audioCodexListenDecisionRecordSandboxSmokeRealApprovalPreserved')!r}; "
        f"realSafetyChanged={manifest.get('audioCodexListenDecisionRecordSandboxSmokeRealSafetyChanged')!r}; "
        f"realRenderAttempted={manifest.get('audioCodexListenDecisionRecordSandboxSmokeRealRenderAttempted')!r}; "
        f"realUploadAttempted={manifest.get('audioCodexListenDecisionRecordSandboxSmokeRealUploadAttempted')!r}; "
        f"realPublicationAttempted={manifest.get('audioCodexListenDecisionRecordSandboxSmokeRealPublicationAttempted')!r}; "
        f"realOriginalMediaMutated={manifest.get('audioCodexListenDecisionRecordSandboxSmokeRealOriginalMediaMutated')!r}",
    )
    add(
        "codex listen decision record sandbox smoke proves source-aware branch wakeup",
        bool(manifest.get("audioCodexListenDecisionRecordSandboxSmokeAdapterPostDecisionRefreshRan")) is True
        and manifest.get("audioCodexListenDecisionRecordSandboxSmokeAdapterPostDecisionRefreshCanonicalScript") == "audio_workbench_post_listen_refresh.py"
        and bool(manifest.get("audioCodexListenDecisionRecordSandboxSmokeSandboxBranchInheritanceReady")) is True
        and bool(manifest.get("audioCodexListenDecisionRecordSandboxSmokeSandboxBranchRenderReady")) is True
        and manifest.get("audioCodexListenDecisionRecordSandboxSmokeSandboxBranchRenderAudioTruth") == "source-aware-refined-stems"
        and bool(manifest.get("audioCodexListenDecisionRecordSandboxSmokeSandboxRealBranchRenderCommandsExposed")) is True
        and bool(manifest.get("audioCodexListenDecisionRecordSandboxSmokeSandboxExecutorWillUseRefinedStems")) is True
        and bool(manifest.get("audioCodexListenDecisionRecordSandboxSmokeSandboxExecutorMasterOnlyPrevented")) is True,
        "refresh="
        f"{manifest.get('audioCodexListenDecisionRecordSandboxSmokeAdapterPostDecisionRefreshRan')!r}; "
        f"script={manifest.get('audioCodexListenDecisionRecordSandboxSmokeAdapterPostDecisionRefreshCanonicalScript')!r}; "
        f"inheritance={manifest.get('audioCodexListenDecisionRecordSandboxSmokeSandboxBranchInheritanceReady')!r}; "
        f"renderReady={manifest.get('audioCodexListenDecisionRecordSandboxSmokeSandboxBranchRenderReady')!r}; "
        f"audioTruth={manifest.get('audioCodexListenDecisionRecordSandboxSmokeSandboxBranchRenderAudioTruth')!r}; "
        f"commands={manifest.get('audioCodexListenDecisionRecordSandboxSmokeSandboxRealBranchRenderCommandsExposed')!r}; "
        f"refinedStems={manifest.get('audioCodexListenDecisionRecordSandboxSmokeSandboxExecutorWillUseRefinedStems')!r}; "
        f"masterOnlyPrevented={manifest.get('audioCodexListenDecisionRecordSandboxSmokeSandboxExecutorMasterOnlyPrevented')!r}",
    )
    add(
        "listen decision command center present",
        *existing_output(outputs, "latestAudioListenDecisionCommandCenterHtml"),
    )
    add(
        "listen decision command center ready",
        manifest.get("audioListenDecisionCommandCenterLatestStatus") == "listen-decision-command-center-ready-human-listen-required"
        and int(manifest.get("audioListenDecisionCommandCenterMissingRequiredArtifactCount") or 0) == 0
        and bool(manifest.get("audioListenDecisionCommandCenterSourceAwareReady")) is True
        and bool(manifest.get("audioListenDecisionCommandCenterDangerRoomReady")) is True,
        "status="
        f"{manifest.get('audioListenDecisionCommandCenterLatestStatus')!r}; "
        f"missing={manifest.get('audioListenDecisionCommandCenterMissingRequiredArtifactCount')!r}; "
        f"sourceAware={manifest.get('audioListenDecisionCommandCenterSourceAwareReady')!r}; "
        f"dangerRoom={manifest.get('audioListenDecisionCommandCenterDangerRoomReady')!r}",
    )
    add(
        "listen decision command center stays non-mutating",
        bool(manifest.get("audioListenDecisionCommandCenterApprovalStateChanged")) is False
        and bool(manifest.get("audioListenDecisionCommandCenterBranchStateChanged")) is False
        and bool(manifest.get("audioListenDecisionCommandCenterRenderAttempted")) is False
        and bool(manifest.get("audioListenDecisionCommandCenterUploadAttempted")) is False
        and bool(manifest.get("audioListenDecisionCommandCenterPublicationAttempted")) is False
        and bool(manifest.get("audioListenDecisionCommandCenterOriginalMediaMutated")) is False,
        "approvalChanged="
        f"{manifest.get('audioListenDecisionCommandCenterApprovalStateChanged')!r}; "
        f"branchChanged={manifest.get('audioListenDecisionCommandCenterBranchStateChanged')!r}; "
        f"renderAttempted={manifest.get('audioListenDecisionCommandCenterRenderAttempted')!r}; "
        f"uploadAttempted={manifest.get('audioListenDecisionCommandCenterUploadAttempted')!r}; "
        f"publicationAttempted={manifest.get('audioListenDecisionCommandCenterPublicationAttempted')!r}; "
        f"originalMediaMutated={manifest.get('audioListenDecisionCommandCenterOriginalMediaMutated')!r}",
    )
    add(
        "fast readback check passed",
        bool(manifest.get("audioFastReadbackCheckPassed")) is True
        and int(manifest.get("audioFastReadbackCheckHardStopCount") or 0) == 0
        and manifest.get("audioFastReadbackCheckLatestStatus") == "fast-readback-passed-human-listen-still-required",
        "status="
        f"{manifest.get('audioFastReadbackCheckLatestStatus')!r}; "
        f"passed={manifest.get('audioFastReadbackCheckPassed')!r}; "
        f"hardStops={manifest.get('audioFastReadbackCheckHardStopCount')!r}; "
        f"checks={manifest.get('audioFastReadbackCheckCheckCount')!r}; "
        f"finalGate={manifest.get('audioFastReadbackCheckFinalEpisodeGateStatus')!r}; "
        f"shortsGate={manifest.get('audioFastReadbackCheckShortsGateStatus')!r}",
    )
    add(
        "fast readback check stays non-mutating",
        bool(manifest.get("audioFastReadbackCheckApprovalStateChanged")) is False
        and bool(manifest.get("audioFastReadbackCheckBranchStateChanged")) is False
        and bool(manifest.get("audioFastReadbackCheckRenderAttempted")) is False
        and bool(manifest.get("audioFastReadbackCheckUploadAttempted")) is False
        and bool(manifest.get("audioFastReadbackCheckPublicationAttempted")) is False
        and bool(manifest.get("audioFastReadbackCheckOriginalMediaMutated")) is False,
        "approvalChanged="
        f"{manifest.get('audioFastReadbackCheckApprovalStateChanged')!r}; "
        f"branchChanged={manifest.get('audioFastReadbackCheckBranchStateChanged')!r}; "
        f"renderAttempted={manifest.get('audioFastReadbackCheckRenderAttempted')!r}; "
        f"uploadAttempted={manifest.get('audioFastReadbackCheckUploadAttempted')!r}; "
        f"publicationAttempted={manifest.get('audioFastReadbackCheckPublicationAttempted')!r}; "
        f"originalMediaMutated={manifest.get('audioFastReadbackCheckOriginalMediaMutated')!r}",
    )
    add(
        "platform loudness audit present",
        *existing_output(outputs, "latestAudioPlatformLoudnessAuditHtml"),
    )
    add(
        "producer command center present",
        *existing_output(outputs, "latestAudioProducerCommandCenterMarkdown"),
    )
    add(
        "morning publication readiness present",
        *existing_output(outputs, "latestAudioMorningPublicationReadinessPacketHtml"),
    )
    add(
        "post-listen episode runway present",
        *existing_output(outputs, "latestAudioPostListenEpisodeRunwayHtml"),
    )
    add(
        "post-approval branch runway packet present",
        *existing_output(outputs, "latestAudioPostApprovalBranchRunwayPacketHtml"),
    )
    add(
        "quality escalation plan present",
        *existing_output(outputs, "latestAudioQualityEscalationPlanHtml"),
    )
    add(
        "quality escalation plan is source-aware and non-mutating",
        manifest.get("audioQualityEscalationPlanLatestStatus")
        in {
            "quality-escalation-ready-human-listen-gated",
            "quality-escalation-needs-hard-stop-review",
            "quality-escalation-needs-runway-attention",
        }
        and int(manifest.get("audioQualityEscalationPlanNextMethodCount") or 0) >= 6
        and int(manifest.get("audioQualityEscalationPlanRequiredStemCount") or 0) >= 3
        and bool(manifest.get("audioQualityEscalationPlanApprovalStateChanged")) is False
        and bool(manifest.get("audioQualityEscalationPlanBranchStateChanged")) is False
        and bool(manifest.get("audioQualityEscalationPlanRenderAttempted")) is False
        and bool(manifest.get("audioQualityEscalationPlanBranchRenderAttempted")) is False
        and bool(manifest.get("audioQualityEscalationPlanUploadAttempted")) is False
        and bool(manifest.get("audioQualityEscalationPlanPublicationAttempted")) is False
        and bool(manifest.get("audioQualityEscalationPlanOriginalMediaMutated")) is False,
        "status="
        f"{manifest.get('audioQualityEscalationPlanLatestStatus')!r}; "
        f"methods={manifest.get('audioQualityEscalationPlanNextMethodCount')!r}; "
        f"stems={manifest.get('audioQualityEscalationPlanRequiredStemCount')!r}; "
        f"rule={manifest.get('audioQualityEscalationPlanEditorAudioTruthRule')!r}",
    )
    add(
        "approved branch render executor present",
        *existing_output(outputs, "latestApprovedBranchRenderExecutorMarkdown"),
    )
    add(
        "approved branch render executor safely gated",
        manifest.get("approvedBranchRenderExecutorStatus") == "blocked-waiting-for-human-listen"
        and bool(manifest.get("approvedBranchRenderCommandsExposed")) is False
        and bool(manifest.get("approvedBranchRenderExecutorCanExecuteRealRenders")) is False
        and bool(manifest.get("approvedBranchRenderExecutorRenderAttempted")) is False
        and bool(manifest.get("approvedBranchRenderExecutorUploadAttempted")) is False
        and bool(manifest.get("approvedBranchRenderExecutorPublicationAttempted")) is False
        and bool(manifest.get("approvedBranchRenderExecutorOriginalMediaMutated")) is False,
        "status="
        f"{manifest.get('approvedBranchRenderExecutorStatus')!r}; "
        f"commandsExposed={manifest.get('approvedBranchRenderCommandsExposed')!r}; "
        f"canExecute={manifest.get('approvedBranchRenderExecutorCanExecuteRealRenders')!r}; "
        f"renderAttempted={manifest.get('approvedBranchRenderExecutorRenderAttempted')!r}; "
        f"uploadAttempted={manifest.get('approvedBranchRenderExecutorUploadAttempted')!r}; "
        f"publicationAttempted={manifest.get('approvedBranchRenderExecutorPublicationAttempted')!r}; "
        f"originalMediaMutated={manifest.get('approvedBranchRenderExecutorOriginalMediaMutated')!r}",
    )
    add(
        "post-approval render rehearsal ready and non-rendering",
        manifest.get("audioPostApprovalRenderRehearsalLatestStatus")
        in {
            "post-approval-render-rehearsal-ready-blocked-as-expected",
            "post-approval-render-rehearsal-ready-after-approval",
        }
        and int(manifest.get("audioPostApprovalRenderRehearsalBranchCount") or 0) >= 3
        and int(manifest.get("audioPostApprovalRenderRehearsalMissingInputCount") or 0) == 0
        and bool(manifest.get("audioPostApprovalRenderRehearsalRenderAttempted")) is False
        and bool(manifest.get("audioPostApprovalRenderRehearsalBranchRenderAttempted")) is False
        and bool(manifest.get("audioPostApprovalRenderRehearsalUploadAttempted")) is False
        and bool(manifest.get("audioPostApprovalRenderRehearsalPublicationAttempted")) is False
        and bool(manifest.get("audioPostApprovalRenderRehearsalOriginalMediaMutated")) is False,
        "status="
        f"{manifest.get('audioPostApprovalRenderRehearsalLatestStatus')!r}; "
        f"branches={manifest.get('audioPostApprovalRenderRehearsalBranchCount')!r}; "
        f"missing={manifest.get('audioPostApprovalRenderRehearsalMissingInputCount')!r}; "
        f"dryRunStatus={manifest.get('audioPostApprovalRenderRehearsalRendererDryRunStatus')!r}; "
        f"renderAttempted={manifest.get('audioPostApprovalRenderRehearsalRenderAttempted')!r}; "
        f"branchRenderAttempted={manifest.get('audioPostApprovalRenderRehearsalBranchRenderAttempted')!r}; "
        f"uploadAttempted={manifest.get('audioPostApprovalRenderRehearsalUploadAttempted')!r}; "
        f"publicationAttempted={manifest.get('audioPostApprovalRenderRehearsalPublicationAttempted')!r}; "
        f"originalMediaMutated={manifest.get('audioPostApprovalRenderRehearsalOriginalMediaMutated')!r}",
    )
    add(
        "post-approval approved-state sandbox wakes render runway",
        manifest.get("audioPostApprovalRenderRehearsalApprovedSandboxStatus") == "approved-sandbox-ready"
        and bool(manifest.get("audioPostApprovalRenderRehearsalApprovedSandboxPassed")) is True
        and bool(manifest.get("audioPostApprovalRenderRehearsalApprovedSandboxRealApprovalStatePreserved")) is True
        and manifest.get("audioPostApprovalRenderRehearsalApprovedSandboxRendererDryRunStatus") == "dry-run"
        and bool(manifest.get("audioPostApprovalRenderRehearsalApprovedSandboxRendererDryRunBlocked")) is False
        and int(manifest.get("audioPostApprovalRenderRehearsalApprovedSandboxRendererDryRunBlockerCount") or 0) == 0
        and int(manifest.get("audioPostApprovalRenderRehearsalApprovedSandboxRendererMissingInputCount") or 0) == 0
        and int(manifest.get("audioPostApprovalRenderRehearsalApprovedSandboxRendererBranchCount") or 0) >= 3
        and manifest.get("audioPostApprovalRenderRehearsalApprovedSandboxExecutorStatus") == "ready-dry-run"
        and bool(manifest.get("audioPostApprovalRenderRehearsalApprovedSandboxExecutorCanExecuteRealRenders")) is True
        and bool(manifest.get("audioPostApprovalRenderRehearsalApprovedSandboxExecutorCommandsExposed")) is True
        and bool(manifest.get("audioPostApprovalRenderRehearsalApprovedSandboxExecutorRenderAttempted")) is False
        and bool(manifest.get("audioPostApprovalRenderRehearsalApprovedSandboxExecutorUploadAttempted")) is False
        and bool(manifest.get("audioPostApprovalRenderRehearsalApprovedSandboxExecutorPublicationAttempted")) is False
        and bool(manifest.get("audioPostApprovalRenderRehearsalApprovedSandboxExecutorOriginalMediaMutated")) is False,
        "status="
        f"{manifest.get('audioPostApprovalRenderRehearsalApprovedSandboxStatus')!r}; "
        f"passed={manifest.get('audioPostApprovalRenderRehearsalApprovedSandboxPassed')!r}; "
        f"realStatePreserved={manifest.get('audioPostApprovalRenderRehearsalApprovedSandboxRealApprovalStatePreserved')!r}; "
        f"rendererStatus={manifest.get('audioPostApprovalRenderRehearsalApprovedSandboxRendererDryRunStatus')!r}; "
        f"rendererBlocked={manifest.get('audioPostApprovalRenderRehearsalApprovedSandboxRendererDryRunBlocked')!r}; "
        f"rendererBlockers={manifest.get('audioPostApprovalRenderRehearsalApprovedSandboxRendererDryRunBlockerCount')!r}; "
        f"missing={manifest.get('audioPostApprovalRenderRehearsalApprovedSandboxRendererMissingInputCount')!r}; "
        f"branches={manifest.get('audioPostApprovalRenderRehearsalApprovedSandboxRendererBranchCount')!r}; "
        f"executorStatus={manifest.get('audioPostApprovalRenderRehearsalApprovedSandboxExecutorStatus')!r}; "
        f"canExecute={manifest.get('audioPostApprovalRenderRehearsalApprovedSandboxExecutorCanExecuteRealRenders')!r}; "
        f"commands={manifest.get('audioPostApprovalRenderRehearsalApprovedSandboxExecutorCommandsExposed')!r}; "
        f"renderAttempted={manifest.get('audioPostApprovalRenderRehearsalApprovedSandboxExecutorRenderAttempted')!r}; "
        f"uploadAttempted={manifest.get('audioPostApprovalRenderRehearsalApprovedSandboxExecutorUploadAttempted')!r}; "
        f"publicationAttempted={manifest.get('audioPostApprovalRenderRehearsalApprovedSandboxExecutorPublicationAttempted')!r}; "
        f"originalMediaMutated={manifest.get('audioPostApprovalRenderRehearsalApprovedSandboxExecutorOriginalMediaMutated')!r}",
    )
    add(
        "master smoothness audit ready and non-rendering",
        manifest.get("audioMasterSmoothnessAuditLatestStatus") == "smoothness-audit-ready"
        and bool(manifest.get("audioMasterSmoothnessAuditPassed")) is True
        and int(manifest.get("audioMasterSmoothnessAuditWindowCount") or 0) > 0
        and int(manifest.get("audioMasterSmoothnessAuditTransitionCount") or 0) > 0
        and bool(manifest.get("audioMasterSmoothnessAuditMachineReadyForHumanListen")) is True
        and bool(manifest.get("audioMasterSmoothnessAuditRenderAttempted")) is False
        and bool(manifest.get("audioMasterSmoothnessAuditOriginalMediaMutated")) is False,
        "status="
        f"{manifest.get('audioMasterSmoothnessAuditLatestStatus')!r}; "
        f"windows={manifest.get('audioMasterSmoothnessAuditWindowCount')!r}; "
        f"transitions={manifest.get('audioMasterSmoothnessAuditTransitionCount')!r}; "
        f"listenChecks={manifest.get('audioMasterSmoothnessAuditListenCheckCount')!r}; "
        f"reviewTargets={manifest.get('audioMasterSmoothnessAuditReviewRiskCount')!r}; "
        f"renderAttempted={manifest.get('audioMasterSmoothnessAuditRenderAttempted')!r}; "
        f"originalMediaMutated={manifest.get('audioMasterSmoothnessAuditOriginalMediaMutated')!r}",
    )
    add(
        "master smoothness audit present",
        *existing_output(outputs, "latestAudioMasterSmoothnessAuditMarkdown"),
    )
    add(
        "spectral fatigue audit ready and non-final-rendering",
        manifest.get("audioSpectralFatigueAuditLatestStatus")
        in {"spectral-fatigue-ready", "spectral-fatigue-ready-with-review-risks"}
        and int(manifest.get("audioSpectralFatigueAuditHardStopCount") or 0) == 0
        and int(manifest.get("audioSpectralFatigueAuditWindowCount") or 0) >= 4
        and int(manifest.get("audioSpectralFatigueAuditBandCount") or 0) >= 7
        and int(manifest.get("audioSpectralFatigueAuditFailedMeasurementCount") or 0) == 0
        and bool(manifest.get("audioSpectralFatigueAuditMachineReadyForHumanListen")) is True
        and bool(manifest.get("audioSpectralFatigueAuditRenderAttempted")) is False
        and bool(manifest.get("audioSpectralFatigueAuditBranchRenderAttempted")) is False
        and bool(manifest.get("audioSpectralFatigueAuditUploadAttempted")) is False
        and bool(manifest.get("audioSpectralFatigueAuditPublicationAttempted")) is False
        and bool(manifest.get("audioSpectralFatigueAuditOriginalMediaMutated")) is False,
        "status="
        f"{manifest.get('audioSpectralFatigueAuditLatestStatus')!r}; "
        f"windows={manifest.get('audioSpectralFatigueAuditWindowCount')!r}; "
        f"bands={manifest.get('audioSpectralFatigueAuditBandCount')!r}; "
        f"measurements={manifest.get('audioSpectralFatigueAuditMeasurementCount')!r}; "
        f"failedMeasurements={manifest.get('audioSpectralFatigueAuditFailedMeasurementCount')!r}; "
        f"hardStops={manifest.get('audioSpectralFatigueAuditHardStopCount')!r}; "
        f"risks={manifest.get('audioSpectralFatigueAuditReviewRiskCount')!r}; "
        f"machineReady={manifest.get('audioSpectralFatigueAuditMachineReadyForHumanListen')!r}; "
        f"renderAttempted={manifest.get('audioSpectralFatigueAuditRenderAttempted')!r}; "
        f"branchRenderAttempted={manifest.get('audioSpectralFatigueAuditBranchRenderAttempted')!r}; "
        f"uploadAttempted={manifest.get('audioSpectralFatigueAuditUploadAttempted')!r}; "
        f"publicationAttempted={manifest.get('audioSpectralFatigueAuditPublicationAttempted')!r}; "
        f"originalMediaMutated={manifest.get('audioSpectralFatigueAuditOriginalMediaMutated')!r}",
    )
    add(
        "translation survival audit ready and non-final-rendering",
        manifest.get("audioTranslationSurvivalAuditLatestStatus") == "translation-survival-audit-ready"
        and int(manifest.get("audioTranslationSurvivalAuditTranslationRenderCount") or 0) >= 12
        and int(manifest.get("audioTranslationSurvivalAuditHardStopCount") or 0) == 0
        and bool(manifest.get("audioTranslationSurvivalAuditDerivedReviewMediaRendered")) is True
        and bool(manifest.get("audioTranslationSurvivalAuditRenderAttempted")) is False
        and bool(manifest.get("audioTranslationSurvivalAuditBranchRenderAttempted")) is False
        and bool(manifest.get("audioTranslationSurvivalAuditUploadAttempted")) is False
        and bool(manifest.get("audioTranslationSurvivalAuditPublicationAttempted")) is False
        and bool(manifest.get("audioTranslationSurvivalAuditOriginalMediaMutated")) is False,
        "status="
        f"{manifest.get('audioTranslationSurvivalAuditLatestStatus')!r}; "
        f"renders={manifest.get('audioTranslationSurvivalAuditTranslationRenderCount')!r}; "
        f"hardStops={manifest.get('audioTranslationSurvivalAuditHardStopCount')!r}; "
        f"risks={manifest.get('audioTranslationSurvivalAuditReviewRiskCount')!r}; "
        f"derivedReviewMediaRendered={manifest.get('audioTranslationSurvivalAuditDerivedReviewMediaRendered')!r}; "
        f"renderAttempted={manifest.get('audioTranslationSurvivalAuditRenderAttempted')!r}; "
        f"branchRenderAttempted={manifest.get('audioTranslationSurvivalAuditBranchRenderAttempted')!r}; "
        f"uploadAttempted={manifest.get('audioTranslationSurvivalAuditUploadAttempted')!r}; "
        f"publicationAttempted={manifest.get('audioTranslationSurvivalAuditPublicationAttempted')!r}; "
        f"originalMediaMutated={manifest.get('audioTranslationSurvivalAuditOriginalMediaMutated')!r}",
    )
    add(
        "post-listen episode runway is ready or waiting",
        manifest.get("audioPostListenEpisodeRunwayLatestStatus")
        in {
            "waiting-for-human-listen",
            "approved-refresh-branch-gates",
            "approved-render-runway-visible",
            "failed-or-repair-route-visible",
        }
        and int(manifest.get("audioPostListenEpisodeRunwayHardStopCount") or 0) == 0,
        "status="
        f"{manifest.get('audioPostListenEpisodeRunwayLatestStatus')!r}; "
        f"hardStops={manifest.get('audioPostListenEpisodeRunwayHardStopCount')!r}; "
        f"routes={manifest.get('audioPostListenEpisodeRunwayRouteCount')!r}; "
        f"audioGate={manifest.get('audioPostListenEpisodeRunwayAudioSpineGateStatus')!r}; "
        f"episodeGate={manifest.get('audioPostListenEpisodeRunwayFinalEpisodeGateStatus')!r}; "
        f"shortsGate={manifest.get('audioPostListenEpisodeRunwayShortsGateStatus')!r}",
    )
    add(
        "post-approval branch runway packet is ready and non-rendering",
        manifest.get("audioPostApprovalBranchRunwayPacketLatestStatus")
        in {
            "post-approval-runway-ready-locked-by-human-listen",
            "post-approval-runway-needs-attention",
            "post-approval-runway-needs-approval-state-review",
        }
        and int(manifest.get("audioPostApprovalBranchRunwayPacketMissingInputCount") or 0) == 0
        and int(manifest.get("audioPostApprovalBranchRunwayPacketPlannedBranchCount") or 0) >= 3
        and bool(manifest.get("audioPostApprovalBranchRunwayPacketSourceAwareBranchEditReady")) is True
        and int(manifest.get("audioPostApprovalBranchRunwayPacketSourceAwareBranchCount") or 0)
        == int(manifest.get("audioPostApprovalBranchRunwayPacketPlannedBranchCount") or 0)
        and int(manifest.get("audioPostApprovalBranchRunwayPacketSourceAwareStemReadyCount") or 0) >= 3
        and int(manifest.get("audioPostApprovalBranchRunwayPacketSourceAwareTimingHardStopCount") or 0) == 0
        and bool(manifest.get("audioPostApprovalBranchRunwayPacketSourceAwareMasteredSpineOnlyEditingAllowed")) is False
        and bool(manifest.get("audioPostApprovalBranchRunwayPacketRenderAttempted")) is False
        and bool(manifest.get("audioPostApprovalBranchRunwayPacketBranchRenderAttempted")) is False
        and bool(manifest.get("audioPostApprovalBranchRunwayPacketUploadAttempted")) is False
        and bool(manifest.get("audioPostApprovalBranchRunwayPacketPublicationAttempted")) is False
        and bool(manifest.get("audioPostApprovalBranchRunwayPacketOriginalMediaMutated")) is False,
        "status="
        f"{manifest.get('audioPostApprovalBranchRunwayPacketLatestStatus')!r}; "
        f"readyWhenHumanApproved={manifest.get('audioPostApprovalBranchRunwayPacketReadyWhenHumanApproved')!r}; "
        f"missingInputs={manifest.get('audioPostApprovalBranchRunwayPacketMissingInputCount')!r}; "
        f"branches={manifest.get('audioPostApprovalBranchRunwayPacketPlannedBranchCount')!r}; "
        f"sourceAwareReady={manifest.get('audioPostApprovalBranchRunwayPacketSourceAwareBranchEditReady')!r}; "
        f"sourceAwareBranches={manifest.get('audioPostApprovalBranchRunwayPacketSourceAwareBranchCount')!r}; "
        f"sourceAwareStems={manifest.get('audioPostApprovalBranchRunwayPacketSourceAwareStemReadyCount')!r}; "
        f"sourceAwareHardStops={manifest.get('audioPostApprovalBranchRunwayPacketSourceAwareTimingHardStopCount')!r}; "
        f"masteredOnly={manifest.get('audioPostApprovalBranchRunwayPacketSourceAwareMasteredSpineOnlyEditingAllowed')!r}; "
        f"renderAttempted={manifest.get('audioPostApprovalBranchRunwayPacketRenderAttempted')!r}; "
        f"branchRenderAttempted={manifest.get('audioPostApprovalBranchRunwayPacketBranchRenderAttempted')!r}; "
        f"uploadAttempted={manifest.get('audioPostApprovalBranchRunwayPacketUploadAttempted')!r}; "
        f"publicationAttempted={manifest.get('audioPostApprovalBranchRunwayPacketPublicationAttempted')!r}; "
        f"originalMediaMutated={manifest.get('audioPostApprovalBranchRunwayPacketOriginalMediaMutated')!r}",
    )
    add(
        "morning publication readiness is review-ready or clearly blocked",
        manifest.get("audioMorningPublicationReadinessLatestStatus")
        in {
            "morning-review-ready-human-listen-required",
            "human-decision-recorded-refresh-branches",
            "needs-audio-workbench-attention",
        },
        "status="
        f"{manifest.get('audioMorningPublicationReadinessLatestStatus')!r}; "
        f"ready={manifest.get('audioMorningPublicationReadinessReadyForMorningReview')!r}; "
        f"hardStops={manifest.get('audioMorningPublicationReadinessHardStopCount')!r}; "
        f"recommended={manifest.get('audioMorningPublicationReadinessRecommendedAudioFile')!r}",
    )
    add(
        "review gate artifact present",
        *existing_output(outputs, "latestAudioReviewGateAuditMarkdown"),
    )
    add(
        "manifest smoke artifact present",
        *existing_output(outputs, "latestAudioManifestReadbackConsistencySmokeMarkdown"),
    )
    if goal_file is not None:
        add(
            "goal audit still has zero missing requirements",
            int(manifest.get("audioGoalCompletionAuditMissingCount") or 0) == 0,
            "proved="
            f"{manifest.get('audioGoalCompletionAuditProvedCount')!r}; "
            f"partial={manifest.get('audioGoalCompletionAuditPartialCount')!r}; "
            f"locked={manifest.get('audioGoalCompletionAuditLockedCount')!r}; "
            f"missing={manifest.get('audioGoalCompletionAuditMissingCount')!r}",
        )

    stem_ok, stem_detail = existing_output(outputs, "latestAudioSourceAwareStemManifest")
    checks.append(PostCheck("source-aware-stem-manifest-present", stem_ok, stem_detail))
    stem_report_path = output_path(outputs.get("latestAudioSourceAwareStemManifest"))
    if stem_report_path and Path(stem_report_path).exists():
        try:
            stem_report = read_json(Path(stem_report_path))
        except json.JSONDecodeError:
            stem_report = {}
        checks.append(PostCheck("source-aware-stem-status", stem_report.get("status") in {"source-aware-stems-ready-human-listen-gated", "source-aware-stems-ready-with-warnings-human-listen-gated"}, str(stem_report.get("status"))))
        checks.append(PostCheck("source-aware-stem-resolved-count", int(stem_report.get("resolvedStemCount") or 0) >= 3, str(stem_report.get("resolvedStemCount"))))
        checks.append(PostCheck("source-aware-stem-required-count", int(stem_report.get("requiredStemCount") or 0) >= 3, str(stem_report.get("requiredStemCount"))))
        checks.append(PostCheck("source-aware-stem-original-media-safe", stem_report.get("originalMediaMutated") is False, str(stem_report.get("originalMediaMutated"))))
        checks.append(PostCheck("source-aware-stem-render-safe", stem_report.get("renderAttempted") is False and stem_report.get("branchRenderAttempted") is False, f"render={stem_report.get('renderAttempted')} branch={stem_report.get('branchRenderAttempted')}"))

    segment_ok, segment_detail = existing_output(outputs, "latestAudioSegmentLoudnessMap")
    checks.append(PostCheck("segment-loudness-map-present", segment_ok, segment_detail))
    segment_report_path = output_path(outputs.get("latestAudioSegmentLoudnessMap"))
    if segment_report_path and Path(segment_report_path).exists():
        try:
            segment_report = read_json(Path(segment_report_path))
        except json.JSONDecodeError:
            segment_report = {}
        checks.append(PostCheck("segment-loudness-map-status", segment_report.get("status") in {"segment-audio-map-ready-human-listen-gated", "segment-audio-map-ready-with-review-windows-human-listen-gated"}, str(segment_report.get("status"))))
        checks.append(PostCheck("segment-loudness-map-track-count", int(segment_report.get("trackCount") or 0) >= 4, str(segment_report.get("trackCount"))))
        checks.append(PostCheck("segment-loudness-map-original-media-safe", segment_report.get("originalMediaMutated") is False, str(segment_report.get("originalMediaMutated"))))
        checks.append(PostCheck("segment-loudness-map-render-safe", segment_report.get("renderAttempted") is False and segment_report.get("branchRenderAttempted") is False, f"render={segment_report.get('renderAttempted')} branch={segment_report.get('branchRenderAttempted')}"))
    return checks


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Audio Control Plane Sequential Refresh: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "This report exists because manifest-writing proof scripts must be serialized. It does not approve audio, unlock branches, render media, upload, publish, or mutate original media.",
        "",
        "## Summary",
        "",
        f"- Status: `{report['status']}`",
        f"- Steps: `{report['stepCount']}`",
        f"- Step failures: `{report['stepFailureCount']}`",
        f"- Post-check failures: `{report['postCheckFailureCount']}`",
        f"- Approval status: `{report['approvalStatus']}`",
        f"- Package ready for human listen: `{str(report['packageReadyForHumanListen']).lower()}`",
        f"- Branch inheritance ready: `{str(report['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(report['branchRenderReady']).lower()}`",
        "",
        "## Post-checks",
        "",
        "| Check | Passed | Detail |",
        "|---|---:|---|",
    ]
    for check in report["postChecks"]:
        lines.append(f"| {check['name']} | `{str(check['passed']).lower()}` | {check['detail']} |")
    lines.extend(["", "## Ordered steps", "", "| Step | Exit | Seconds | Command |", "|---|---:|---:|---|"])
    for step in report["steps"]:
        cmd = " ".join(shell_quote(part) if " " in part else part for part in step["command"])
        lines.append(f"| {step['name']} | `{step['exitCode']}` | `{step['durationSeconds']}` | `{cmd}` |")
    failed_steps = [step for step in report["steps"] if step["exitCode"] != 0]
    if failed_steps:
        lines.extend(["", "## Failed step tails", ""])
        for step in failed_steps:
            lines.extend(
                [
                    f"### {step['name']}",
                    "",
                    "```text",
                    step.get("stdoutTail") or "",
                    step.get("stderrTail") or "",
                    "```",
                    "",
                ]
            )
    lines.extend(
        [
            "",
            "## Next action",
            "",
            "If this refresh passes, the next product action is still a human listen decision. If it fails, fix the named control-plane report before rendering, approving, uploading, or publishing anything.",
            "",
        ]
    )
    return "\n".join(lines)


def render_html(report: dict[str, Any], markdown: str) -> str:
    status_class = "ok" if report["status"] == "passed" else "bad"
    rows = []
    for check in report["postChecks"]:
        cls = "ok" if check["passed"] else "bad"
        rows.append(
            f"<tr><td>{html.escape(check['name'])}</td><td class='{cls}'>{str(check['passed']).lower()}</td><td>{html.escape(check['detail'])}</td></tr>"
        )
    step_rows = []
    for step in report["steps"]:
        cls = "ok" if step["exitCode"] == 0 else "bad"
        step_rows.append(
            "<tr>"
            f"<td>{html.escape(step['name'])}</td>"
            f"<td class='{cls}'>{step['exitCode']}</td>"
            f"<td>{step['durationSeconds']}</td>"
            f"<td><code>{html.escape(' '.join(step['command']))}</code></td>"
            "</tr>"
        )
    return f"""<!doctype html>
<html>
<head>
<meta charset=\"utf-8\" />
<title>Audio Control Plane Sequential Refresh</title>
<style>
body {{ font-family: -apple-system, BlinkMacSystemFont, sans-serif; margin: 32px; background: #151813; color: #f2ead7; }}
.card {{ border: 1px solid #5a4b2a; border-radius: 18px; padding: 22px; margin-bottom: 20px; background: #202419; }}
.ok {{ color: #79df8c; font-weight: 700; }}
.bad {{ color: #ff7777; font-weight: 700; }}
table {{ border-collapse: collapse; width: 100%; }}
th, td {{ border-bottom: 1px solid #3a3f31; padding: 9px; text-align: left; vertical-align: top; }}
code {{ color: #f5cf5a; white-space: pre-wrap; }}
pre {{ white-space: pre-wrap; background: #111; padding: 14px; border-radius: 12px; }}
</style>
</head>
<body>
<section class=\"card\">
<h1>Audio Control Plane Sequential Refresh</h1>
<p>Status: <span class=\"{status_class}\">{html.escape(report['status'])}</span></p>
<p>Generated: <code>{html.escape(report['generatedAt'])}</code></p>
<p>This report serializes manifest-writing proof scripts. It is not human approval.</p>
</section>
<section class=\"card\">
<h2>Post-checks</h2>
<table><tbody>{''.join(rows)}</tbody></table>
</section>
<section class=\"card\">
<h2>Ordered steps</h2>
<table><tbody>{''.join(step_rows)}</tbody></table>
</section>
<section class=\"card\">
<h2>Markdown source</h2>
<pre>{html.escape(markdown)}</pre>
</section>
</body>
</html>
"""


def write_open_command(path: Path, target: Path) -> None:
    path.write_text(f"#!/bin/zsh\nopen {shell_quote(str(target))}\n", encoding="utf-8")
    path.chmod(0o755)


def update_manifest_with_report(baseline_dir: Path, report: dict[str, Any], stable_json: Path, stable_md: Path, stable_html: Path, open_command: Path) -> None:
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    outputs["latestAudioControlPlaneSequentialRefresh"] = str(stable_json)
    outputs["latestAudioControlPlaneSequentialRefreshMarkdown"] = str(stable_md)
    outputs["latestAudioControlPlaneSequentialRefreshHtml"] = str(stable_html)
    outputs["latestAudioControlPlaneSequentialRefreshOpenCommand"] = str(open_command)
    refreshes = outputs.setdefault("audioControlPlaneSequentialRefreshes", [])
    if isinstance(refreshes, list):
        refreshes.append(str(stable_json))
    manifest["audioControlPlaneSequentialRefreshLatestStatus"] = report["status"]
    manifest["audioControlPlaneSequentialRefreshLatestGeneratedAt"] = report["generatedAt"]
    manifest["audioControlPlaneSequentialRefreshStepCount"] = report["stepCount"]
    manifest["audioControlPlaneSequentialRefreshStepFailureCount"] = report["stepFailureCount"]
    manifest["audioControlPlaneSequentialRefreshPostCheckFailureCount"] = report["postCheckFailureCount"]
    manifest["audioControlPlaneSequentialRefreshApprovalStateChanged"] = False
    manifest["audioControlPlaneSequentialRefreshBranchStateChanged"] = False
    manifest["audioControlPlaneSequentialRefreshRenderAttempted"] = False
    manifest["audioControlPlaneSequentialRefreshUploadAttempted"] = False
    manifest["audioControlPlaneSequentialRefreshPublicationAttempted"] = False
    manifest["audioControlPlaneSequentialRefreshOriginalMediaMutated"] = False
    write_json(manifest_path, manifest)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    parser.add_argument("--goal-file", type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    goal_file = args.goal_file.expanduser().resolve() if args.goal_file else None
    if goal_file is not None and not goal_file.exists():
        raise FileNotFoundError(f"Goal file does not exist: {goal_file}")

    manifest_before = read_json(baseline_dir / "manifest.json")
    baseline_id = str(manifest_before.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated = utc_stamp()

    steps: list[StepResult] = []
    for name, command in build_steps(baseline_dir, goal_file):
        result = run_step(name, command, cwd=Path.cwd())
        steps.append(result)
        if result.exitCode != 0:
            # Stop at the first process-level failure. The post-check report below
            # will still show the latest manifest state without continuing to run
            # dependent writers against a bad base.
            break

    manifest_after = read_json(baseline_dir / "manifest.json")
    checks = post_checks(manifest_after, goal_file)
    step_failure_count = sum(1 for step in steps if not step.ok)
    post_check_failure_count = sum(1 for check in checks if not check.passed)
    status = "passed" if step_failure_count == 0 and post_check_failure_count == 0 else "needs-attention"

    report = {
        "schema": "quipsly.audio-workbench.control-plane-sequential-refresh.v1",
        "generatedAt": generated,
        "generatedIso": iso_now(),
        "status": status,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "goalFile": str(goal_file) if goal_file else None,
        "approvalStatus": manifest_after.get("approvalStatus"),
        "packageReadyForHumanListen": bool(manifest_after.get("packageReadyForHumanListen")),
        "branchInheritanceReady": bool(manifest_after.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest_after.get("branchRenderReady")),
        "stepCount": len(steps),
        "stepFailureCount": step_failure_count,
        "postCheckFailureCount": post_check_failure_count,
        "steps": [asdict(step) for step in steps],
        "postChecks": [asdict(check) for check in checks],
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
    }

    versioned_dir = baseline_dir / f"audio-control-plane-sequential-refresh-{slug}-{generated}"
    versioned_dir.mkdir(parents=True, exist_ok=True)
    versioned_json = versioned_dir / "control-plane-sequential-refresh.json"
    versioned_md = versioned_dir / "control-plane-sequential-refresh.md"
    versioned_html = versioned_dir / "control-plane-sequential-refresh.html"
    versioned_open = versioned_dir / "open-control-plane-sequential-refresh.command"

    stable_json = baseline_dir / "AUDIO_CONTROL_PLANE_SEQUENTIAL_REFRESH.json"
    stable_md = baseline_dir / "AUDIO_CONTROL_PLANE_SEQUENTIAL_REFRESH.md"
    stable_html = baseline_dir / "AUDIO_CONTROL_PLANE_SEQUENTIAL_REFRESH.html"
    stable_open = baseline_dir / "OPEN_AUDIO_CONTROL_PLANE_SEQUENTIAL_REFRESH.command"

    markdown = render_markdown(report)
    html_doc = render_html(report, markdown)
    for path in (versioned_json, stable_json):
        write_json(path, report)
    for path in (versioned_md, stable_md):
        path.write_text(markdown, encoding="utf-8")
    for path in (versioned_html, stable_html):
        path.write_text(html_doc, encoding="utf-8")
    write_open_command(versioned_open, versioned_html)
    write_open_command(stable_open, stable_html)

    report.update(
        {
            "path": str(stable_json),
            "markdownPath": str(stable_md),
            "htmlPath": str(stable_html),
            "openCommand": str(stable_open),
            "versionedPath": str(versioned_json),
            "versionedMarkdownPath": str(versioned_md),
            "versionedHtmlPath": str(versioned_html),
            "versionedOpenCommand": str(versioned_open),
        }
    )
    for path in (versioned_json, stable_json):
        write_json(path, report)

    update_manifest_with_report(baseline_dir, report, stable_json, stable_md, stable_html, stable_open)

    print(str(stable_md))
    if status != "passed":
        sys.exit(1)


if __name__ == "__main__":
    main()
