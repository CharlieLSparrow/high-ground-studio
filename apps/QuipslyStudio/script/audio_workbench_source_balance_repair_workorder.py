#!/usr/bin/env python3
"""Create conditional repair guidance from source-balance review evidence.

The source-balance audit/companion tells reviewers where the mastered spine and
registered contribution evidence disagree. This script turns that into scoped
v007 guidance *only if* human listening confirms a real problem.

It does not approve audio, fail audio, render media, upload files, or mutate
source media. It writes a reversible repair map so a failed listen does not
turn into broad retuning or one-off ffmpeg sorcery.
"""

from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


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
    return out.strip("-") or "audio-baseline"


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def seconds_to_timecode(seconds: Any) -> str:
    try:
        value = float(seconds)
    except (TypeError, ValueError):
        return "unknown"
    hours = int(value // 3600)
    minutes = int((value % 3600) // 60)
    secs = value % 60
    return f"{hours:02d}:{minutes:02d}:{secs:06.3f}"


def row_time(row: dict[str, Any]) -> str:
    return str(row.get("time") or seconds_to_timecode(row.get("startSeconds") or row.get("sequenceStartSeconds")))


def repair_template_for_flag(flag: str) -> dict[str, Any]:
    templates = {
        "master_loud_without_registered_source": {
            "symptomToConfirm": "Audible master energy does not map to a currently registered contribution source.",
            "listenFor": [
                "phantom echo from the wrong mic",
                "room or park noise exposed during a supposed quiet gap",
                "speech/reaction that the contribution classifier failed to label",
                "benign noise floor that should be ignored rather than repaired",
            ],
            "smallestSafeRepairIfConfirmed": [
                "Create a focused v007 proof-window candidate only; do not overwrite v006.",
                "Inspect aligned stems and contribution automation at this timestamp.",
                "If the energy is bad bleed/noise, deepen ducking only for the offending non-contributing stem in this window.",
                "If the energy is useful reaction/speech, fix the contribution classification or release timing rather than muting it.",
                "If harmless room tone, leave the audio alone and mark the threshold model as too suspicious.",
            ],
            "candidateProfileHints": [
                "narrow-window contribution threshold retune",
                "duck-depth adjustment for the offending source only",
                "release/fade smoothing if a gate edge is audible",
            ],
        },
        "master_loud_with_aligned_source_but_no_contribution": {
            "symptomToConfirm": "An aligned source is present, but contribution gating did not retain it while the master remains audible.",
            "listenFor": [
                "missing useful speech or laughter",
                "speech that is audible only through bleed instead of the intended source",
                "threshold mismatch where the master sounds correct despite a machine warning",
            ],
            "smallestSafeRepairIfConfirmed": [
                "Render a proof-window candidate with a slightly more permissive contribution gate for the relevant source.",
                "Prefer correcting source classification over raising the whole master.",
                "Compare current v006, conservative retune, and stronger retune before promoting anything.",
            ],
            "candidateProfileHints": [
                "lower contribution threshold for the relevant source in-window",
                "longer release on useful reactions",
                "retain bleed suppression elsewhere",
            ],
        },
        "charlie_homer_overlap_present": {
            "symptomToConfirm": "Charlie and Homer overlap is preserved, but the overlap could still sound smeared, phasey, or chopped.",
            "listenFor": [
                "natural conversational overlap",
                "gated-off laughter/reaction",
                "phasey double-talk",
                "Homer echo returning through Charlie's track",
            ],
            "smallestSafeRepairIfConfirmed": [
                "If the overlap sounds natural, do not repair it.",
                "If Charlie reactions are chopped, relax Charlie release/threshold in this proof window only.",
                "If Homer echo returns, tighten Charlie non-contribution ducking outside Charlie's actual reaction.",
            ],
            "candidateProfileHints": [
                "overlap-specific release smoothing",
                "reaction-preserving Charlie gate",
                "echo-protecting non-contribution duck",
            ],
        },
    }
    return templates.get(
        flag,
        {
            "symptomToConfirm": "Machine source-balance warning needs human confirmation.",
            "listenFor": ["whether the warning is audible, distracting, or harmless"],
            "smallestSafeRepairIfConfirmed": [
                "Create a focused proof candidate.",
                "Tune the smallest source or automation stage that explains the audible issue.",
            ],
            "candidateProfileHints": ["focused proof-window retune"],
        },
    )


def grouped_actions(companion: dict[str, Any]) -> list[dict[str, Any]]:
    focus_rows = companion.get("focusRows") or []
    queue_items = companion.get("queueBalanceItems") or []
    rows_by_flag: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in focus_rows:
        for flag in row.get("flags") or []:
            rows_by_flag[str(flag)].append(row)

    queue_by_class: Counter[str] = Counter()
    queue_examples: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in queue_items:
        for classification in item.get("classifications") or []:
            key = str(classification)
            queue_by_class[key] += 1
            if len(queue_examples[key]) < 6:
                queue_examples[key].append(item)

    actions: list[dict[str, Any]] = []
    summary = companion.get("summary") or {}
    full_counts = summary.get("flagCountsInFullAudit") if isinstance(summary.get("flagCountsInFullAudit"), dict) else {}
    for flag in sorted(set(full_counts) | set(rows_by_flag)):
        template = repair_template_for_flag(flag)
        rows = rows_by_flag.get(flag, [])
        example_windows = [
            {
                "time": row_time(row),
                "flags": row.get("flags") or [],
                "masterDbfs": row.get("masterDbfs"),
                "charlieContributionDbfs": row.get("charlieContributionDbfs"),
                "homerContributionDbfs": row.get("homerContributionDbfs"),
                "referenceContributionDbfs": row.get("referenceContributionDbfs"),
            }
            for row in rows[:8]
        ]
        actions.append(
            {
                "flag": flag,
                "fullAuditCount": int(full_counts.get(flag) or 0),
                "focusRowCount": len(rows),
                "exampleWindows": example_windows,
                "symptomToConfirm": template["symptomToConfirm"],
                "listenFor": template["listenFor"],
                "smallestSafeRepairIfConfirmed": template["smallestSafeRepairIfConfirmed"],
                "candidateProfileHints": template["candidateProfileHints"],
                "doNotDo": [
                    "Do not overwrite v006.",
                    "Do not mutate source media.",
                    "Do not unlock branch inheritance from this workorder alone.",
                    "Do not globally retune the whole episode when a focused window repair would prove or disprove the issue.",
                ],
            }
        )

    return actions


def build_markdown(payload: dict[str, Any]) -> str:
    lines = [
        f"# Source-Balance Repair Workorder: {payload['baselineId']}",
        "",
        f"Generated: `{payload['generatedAt']}`",
        "",
        "This is a conditional v007 repair map for source-balance warnings. It does not mean v006 failed. It gives the smallest safe repair path if human listening confirms one of the warnings is real.",
        "",
        "## Current truth",
        "",
        f"- Approval status: `{payload['approvalStatus']}`",
        f"- Package ready for human listen: `{str(payload['packageReadyForHumanListen']).lower()}`",
        f"- Branch inheritance ready: `{str(payload['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(payload['branchRenderReady']).lower()}`",
        f"- Source-balance companion: `{payload['sourceBalanceCompanionMarkdown']}`",
        f"- Action count: `{len(payload['repairActions'])}`",
        "",
        "## How to use this",
        "",
        "1. Listen through the review reel or priority console.",
        "2. If a warning is inaudible or harmless, mark it `pass` and do not repair.",
        "3. If a warning is ambiguous, mark `needs-proof` and render only a focused proof window.",
        "4. If a warning is audibly bad, record failed-human-listen and use the matching action below as the v007 proof-window starting point.",
        "",
    ]
    for index, action in enumerate(payload["repairActions"], start=1):
        lines.extend(
            [
                f"## {index}. `{action['flag']}`",
                "",
                f"- Full-audit count: `{action['fullAuditCount']}`",
                f"- Representative focus rows: `{action['focusRowCount']}`",
                f"- Symptom to confirm: {action['symptomToConfirm']}",
                "",
                "Listen for:",
                "",
                *[f"- {item}" for item in action["listenFor"]],
                "",
                "Smallest safe repair if confirmed:",
                "",
                *[f"- {item}" for item in action["smallestSafeRepairIfConfirmed"]],
                "",
                "Candidate profile hints:",
                "",
                *[f"- {item}" for item in action["candidateProfileHints"]],
                "",
                "Example windows:",
                "",
            ]
        )
        if action["exampleWindows"]:
            lines.extend(
                [
                    "| Time | Flags | Master | Charlie | Homer | Reference |",
                    "|---:|---|---:|---:|---:|---:|",
                ]
            )
            for row in action["exampleWindows"]:
                lines.append(
                    "| {time} | {flags} | {master} | {charlie} | {homer} | {reference} |".format(
                        time=row.get("time"),
                        flags=", ".join(row.get("flags") or []),
                        master=row.get("masterDbfs"),
                        charlie=row.get("charlieContributionDbfs"),
                        homer=row.get("homerContributionDbfs"),
                        reference=row.get("referenceContributionDbfs"),
                    )
                )
        else:
            lines.append("- No focus rows are registered for this warning family.")
        lines.extend(["", "Do not:", "", *[f"- {item}" for item in action["doNotDo"]], ""])
    lines.extend(
        [
            "## Open review surfaces",
            "",
            "```bash",
            *payload["openCommands"],
            "```",
            "",
            "## Guardrails",
            "",
            f"- Approval state changed: `{str(payload['approvalStateChanged']).lower()}`",
            f"- Branch state changed: `{str(payload['branchStateChanged']).lower()}`",
            f"- Render attempted: `{str(payload['renderAttempted']).lower()}`",
            f"- Original media mutated: `{str(payload['originalMediaMutated']).lower()}`",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    baseline_id = str(manifest.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")

    companion_path = output_path(outputs.get("latestAudioSourceBalanceListenCompanion"))
    companion_md = output_path(outputs.get("latestAudioSourceBalanceListenCompanionMarkdown"))
    if not companion_path or not Path(companion_path).exists():
        raise FileNotFoundError("Manifest is missing outputs.latestAudioSourceBalanceListenCompanion")
    companion = read_json(Path(companion_path))
    actions = grouped_actions(companion)

    output_json = baseline_dir / f"audio-source-balance-repair-workorder-{slug}-{generated_at}.json"
    output_md = baseline_dir / f"audio-source-balance-repair-workorder-{slug}-{generated_at}.md"
    open_commands = [
        f"open {shell_quote(path)}"
        for path in [
            output_path(outputs.get("latestAudioListenPriorityReviewReelOpenCommand")),
            output_path(outputs.get("latestAudioListenPriorityConsoleHtml")),
            companion_md,
            output_path(outputs.get("latestAudioMasterSourceBalanceAuditMarkdown")),
        ]
        if path
    ]
    payload = {
        "schema": "quipsly.audio-workbench.source-balance-repair-workorder.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "approvalStatus": manifest.get("approvalStatus"),
        "packageReadyForHumanListen": bool(manifest.get("packageReadyForHumanListen")),
        "branchInheritanceReady": bool(manifest.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest.get("branchRenderReady")),
        "sourceBalanceCompanion": companion_path,
        "sourceBalanceCompanionMarkdown": companion_md,
        "repairActions": actions,
        "openCommands": open_commands,
        "markdown": str(output_md),
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "originalMediaMutated": False,
    }
    write_json(output_json, payload)
    output_md.write_text(build_markdown(payload), encoding="utf-8")

    outputs["latestAudioSourceBalanceRepairWorkorder"] = str(output_json)
    outputs["latestAudioSourceBalanceRepairWorkorderMarkdown"] = str(output_md)
    history = outputs.setdefault("audioSourceBalanceRepairWorkorders", [])
    if str(output_json) not in history:
        history.append(str(output_json))
    manifest["audioSourceBalanceRepairWorkorderCount"] = len(history)
    manifest["audioSourceBalanceRepairWorkorderActionCount"] = len(actions)
    write_json(manifest_path, manifest)

    print(
        json.dumps(
            {
                "baselineId": baseline_id,
                "markdown": str(output_md),
                "json": str(output_json),
                "actionCount": len(actions),
                "approvalStateChanged": False,
                "branchStateChanged": False,
                "renderAttempted": False,
                "originalMediaMutated": False,
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
