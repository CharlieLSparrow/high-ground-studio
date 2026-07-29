#!/usr/bin/env python3
"""Condense source-balance warnings into a producer-friendly triage map.

The source-balance audit can legitimately contain a large warning count because
it scans the whole mastered spine in small windows. This tool keeps the full
evidence intact while turning the noisy count into a calm reviewer plan:
speaker-survival truth, warning buckets, representative listen windows, and safe
next actions. It does not approve audio, unlock branches, render branches,
upload, publish, or mutate original media.
"""

from __future__ import annotations

import argparse
import html
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


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


def output_path(value: Any) -> str | None:
    if isinstance(value, str) and value:
        return value
    if isinstance(value, dict):
        for key in ("path", "json", "jsonPath", "markdown", "markdownPath", "html", "htmlPath", "openCommand"):
            subvalue = value.get(key)
            if isinstance(subvalue, str) and subvalue:
                return subvalue
    return None


def load_output_report(outputs: dict[str, Any], key: str) -> tuple[dict[str, Any], str | None]:
    path = output_path(outputs.get(key))
    if not path:
        return {}, None
    p = Path(path)
    if not p.exists() or p.suffix.lower() != ".json":
        return {}, path
    try:
        return read_json(p), path
    except json.JSONDecodeError:
        return {}, path


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def generated_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def int_value(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def float_value(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def db(value: Any) -> str:
    if isinstance(value, (int, float)):
        return f"{float(value):.1f} dBFS"
    return "n/a"


def seconds_to_stamp(seconds: float) -> str:
    total = max(0, int(round(seconds)))
    h = total // 3600
    m = (total % 3600) // 60
    s = total % 60
    return f"{h:02d}:{m:02d}:{s:02d}"


def flag_label(flag: str) -> str:
    labels = {
        "master_loud_without_registered_source": "Unexplained master energy",
        "master_loud_with_aligned_source_but_no_contribution": "Aligned source below contribution gate",
        "charlie_homer_overlap_present": "Charlie/Homer overlap preserved",
    }
    return labels.get(flag, flag.replace("_", " "))


def flag_interpretation(flag: str) -> str:
    interpretations = {
        "master_loud_without_registered_source": "Usually means the master contains audible room tone, bleed, ambience, or threshold-model leftovers that were not classified as active contribution.",
        "master_loud_with_aligned_source_but_no_contribution": "Usually means the aligned source exists but the contribution mask suppressed it; this may be correct cleanup or may indicate a threshold that is too aggressive.",
        "charlie_homer_overlap_present": "Usually a good sign if it sounds natural. It proves overlap was preserved instead of flattened, but it still deserves a human listen for echo or phase smear.",
    }
    return interpretations.get(flag, "Listen to decide whether this is audible, distracting, or harmless.")


def flag_escalation(flag: str) -> str:
    escalations = {
        "master_loud_without_registered_source": "Escalate only if the snippet sounds like distracting echo/noise or a missing classified source. Route to scoped v007 source-balance proof, not whole-spine panic.",
        "master_loud_with_aligned_source_but_no_contribution": "Escalate if useful speech/reaction/body was over-gated. Route to contribution-mask or threshold repair for that timestamp.",
        "charlie_homer_overlap_present": "Escalate if the overlap sounds phasey, smeared, or like two rooms fighting. Otherwise mark this as preserved conversation texture.",
    }
    return escalations.get(flag, "If audible and distracting, route a timestamped scoped repair; otherwise mark pass context.")


def row_flags(row: dict[str, Any]) -> list[str]:
    flags = row.get("flags")
    return [str(flag) for flag in flags] if isinstance(flags, list) else []


def row_time_sec(row: dict[str, Any]) -> float:
    return float_value(row.get("startSec"), 0.0)


def classify_row(row: dict[str, Any]) -> str:
    flags = set(row_flags(row))
    master = float_value(row.get("masterDbfs"), -96.0)
    charlie = float_value(row.get("charlieContributionDbfs"), -96.0)
    homer = float_value(row.get("homerContributionDbfs"), -96.0)
    if "charlie_homer_overlap_present" in flags:
        return "overlap-texture-check"
    if master >= -32.0 and max(charlie, homer) < -48.0:
        return "loud-unexplained-energy"
    if "master_loud_with_aligned_source_but_no_contribution" in flags:
        return "contribution-threshold-check"
    return "ordinary-balance-check"


def build_representative_windows(audit: dict[str, Any], companion: dict[str, Any], limit: int) -> list[dict[str, Any]]:
    focus_rows = list(audit.get("focusRows") or [])
    queue_items = list(companion.get("queueBalanceItems") or [])
    rows_by_start = {round(row_time_sec(row), 3): row for row in focus_rows}
    windows: list[dict[str, Any]] = []
    seen: set[float] = set()

    for item in sorted(queue_items, key=lambda row: (int_value(row.get("priority")), float_value(row.get("timeSec")))):
        time_sec = float_value(item.get("timeSec"), 0.0)
        match = min(focus_rows, key=lambda row: abs(row_time_sec(row) - time_sec)) if focus_rows else {}
        if time_sec in seen:
            continue
        seen.add(time_sec)
        flags = row_flags(match)
        windows.append(
            {
                "timeSec": round(time_sec, 3),
                "time": seconds_to_stamp(time_sec),
                "priority": int_value(item.get("priority")),
                "classification": classify_row(match) if match else ",".join(item.get("classifications") or []),
                "flags": flags,
                "masterDbfs": match.get("masterDbfs") if match else None,
                "charlieContributionDbfs": match.get("charlieContributionDbfs") if match else None,
                "homerContributionDbfs": match.get("homerContributionDbfs") if match else None,
                "referenceContributionDbfs": match.get("referenceContributionDbfs") if match else None,
                "listenQuestions": item.get("listenQuestions") or [],
                "safeActionsIfFails": item.get("safeActionsIfFails") or [],
                "source": "listen-priority-queue",
            }
        )
        if len(windows) >= limit:
            break

    if len(windows) < limit:
        ranked_rows = sorted(
            focus_rows,
            key=lambda row: (
                -int_value(row.get("severity")),
                float_value(row.get("masterDbfs"), -96.0),
                row_time_sec(row),
            ),
        )
        for row in ranked_rows:
            time_sec = row_time_sec(row)
            if time_sec in seen:
                continue
            seen.add(time_sec)
            windows.append(
                {
                    "timeSec": round(time_sec, 3),
                    "time": seconds_to_stamp(time_sec),
                    "priority": len(windows) + 1,
                    "classification": classify_row(row),
                    "flags": row_flags(row),
                    "masterDbfs": row.get("masterDbfs"),
                    "charlieContributionDbfs": row.get("charlieContributionDbfs"),
                    "homerContributionDbfs": row.get("homerContributionDbfs"),
                    "referenceContributionDbfs": row.get("referenceContributionDbfs"),
                    "listenQuestions": ["Does this warning sound distracting, or is it harmless room/bleed/threshold evidence?"],
                    "safeActionsIfFails": ["If it fails, keep v006 locked and route a scoped v007 source-balance proof window."],
                    "source": "source-balance-audit-focus-row",
                }
            )
            if len(windows) >= limit:
                break
    return windows


def build_report(manifest: dict[str, Any], baseline_dir: Path, generated_at: str, limit: int) -> dict[str, Any]:
    outputs = manifest.get("outputs") if isinstance(manifest.get("outputs"), dict) else {}
    audit, audit_path = load_output_report(outputs, "latestAudioMasterSourceBalanceAudit")
    companion, companion_path = load_output_report(outputs, "latestAudioSourceBalanceListenCompanion")

    missing = []
    if not audit:
        missing.append({"key": "latestAudioMasterSourceBalanceAudit", "path": audit_path or "missing"})
    if not companion:
        missing.append({"key": "latestAudioSourceBalanceListenCompanion", "path": companion_path or "missing"})

    speaker_summaries = list(audit.get("speakerSummaries") or [])
    speaker_survival = []
    for row in speaker_summaries:
        speaker_survival.append(
            {
                "speaker": row.get("speaker"),
                "activeSeconds": round(float_value(row.get("activeSeconds")), 3),
                "activeWindowCount": int_value(row.get("activeWindowCount")),
                "masterAudibleWhenActivePercent": round(float_value(row.get("masterAudibleWhenActivePercent")), 2),
                "masterQuietWhenActiveWindowCount": int_value(row.get("masterQuietWhenActiveWindowCount")),
                "sourceMedianActiveDbfs": row.get("sourceMedianActiveDbfs"),
                "masterMedianDuringSpeakerActiveDbfs": row.get("masterMedianDuringSpeakerActiveDbfs"),
                "survivalStatus": "survives-master" if float_value(row.get("masterAudibleWhenActivePercent")) >= 99.5 else "needs-listen-proof",
            }
        )

    flag_counts = {str(key): int_value(value) for key, value in (audit.get("flagCounts") or {}).items()}
    focus_rows = list(audit.get("focusRows") or [])
    focus_flag_counts: Counter[str] = Counter()
    classification_counts: Counter[str] = Counter()
    for row in focus_rows:
        classification_counts[classify_row(row)] += 1
        for flag in row_flags(row):
            focus_flag_counts[flag] += 1

    buckets = []
    for flag, full_count in sorted(flag_counts.items(), key=lambda item: (-item[1], item[0])):
        buckets.append(
            {
                "flag": flag,
                "label": flag_label(flag),
                "fullAuditCount": full_count,
                "focusRowCount": int(focus_flag_counts.get(flag, 0)),
                "interpretation": flag_interpretation(flag),
                "escalationRule": flag_escalation(flag),
            }
        )

    windows = build_representative_windows(audit, companion, limit=limit) if audit and companion else []
    all_speakers_survive = bool(speaker_survival) and all(
        float_value(row.get("masterAudibleWhenActivePercent")) >= 99.5
        and int_value(row.get("masterQuietWhenActiveWindowCount")) == 0
        for row in speaker_survival
    )
    status = "ready-for-source-balance-human-triage" if not missing and windows else "needs-source-balance-evidence-refresh"
    if all_speakers_survive and status == "ready-for-source-balance-human-triage":
        conclusion = "Speaker survival is machine-proved; source-balance warnings are threshold/room/overlap listen checks, not evidence that Homer or Charlie vanished."
    elif status == "ready-for-source-balance-human-triage":
        conclusion = "Source-balance evidence is ready, but one or more speaker survival rows need focused listen proof."
    else:
        conclusion = "Source-balance triage is missing required evidence; refresh the audit and companion first."

    return {
        "schema": "quipsly.audio-workbench.source-balance-triage.v1",
        "generatedAt": generated_at,
        "generatedIso": iso_now(),
        "baselineDir": str(baseline_dir),
        "baselineId": manifest.get("baselineId"),
        "approvalStatus": manifest.get("approvalStatus"),
        "packageReadyForHumanListen": bool(manifest.get("packageReadyForHumanListen")),
        "branchInheritanceReady": bool(manifest.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest.get("branchRenderReady")),
        "status": status,
        "machineWarningCount": int_value(audit.get("machineWarningCount")),
        "comparedWindowCount": int_value(audit.get("comparedWindowCount")),
        "focusRowCount": len(focus_rows),
        "queueBalanceItemCount": int_value(companion.get("queueBalanceItemCount")),
        "triageWindowCount": len(windows),
        "missingEvidenceCount": len(missing),
        "allSpeakersSurviveInMaster": all_speakers_survive,
        "conclusion": conclusion,
        "speakerSurvival": speaker_survival,
        "flagBuckets": buckets,
        "classificationCounts": dict(classification_counts),
        "representativeWindows": windows,
        "missingEvidence": missing,
        "sourceReports": {
            "sourceBalanceAudit": audit_path,
            "sourceBalanceListenCompanion": companion_path,
            "listenPriorityQueue": companion.get("queuePath"),
            "sourceBalanceRepairWorkorder": output_path(outputs.get("latestAudioSourceBalanceRepairWorkorderMarkdown")),
            "sourceBalanceRepairPreflight": output_path(outputs.get("latestAudioSourceBalanceRepairPreflightMarkdown")),
            "producerCommandCenter": output_path(outputs.get("latestAudioProducerCommandCenterHtml")),
        },
        "nextSafeAction": "Listen to the representative source-balance windows. If they sound harmless, keep v006 in human-listen review. If any sound bad, route a scoped v007 source-balance proof window; do not retune the whole spine blindly.",
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Source Balance Triage: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "This is a source-balance reducer. It turns a large machine warning count into a small human listen plan. It does not approve audio, unlock branches, render media, upload, publish, or mutate original media.",
        "",
        "## Summary",
        "",
        f"- Status: `{report['status']}`",
        f"- Conclusion: {report['conclusion']}",
        f"- Machine warning count: `{report['machineWarningCount']}`",
        f"- Compared windows: `{report['comparedWindowCount']}`",
        f"- Audit focus rows: `{report['focusRowCount']}`",
        f"- Listen-priority source-balance items: `{report['queueBalanceItemCount']}`",
        f"- Representative triage windows: `{report['triageWindowCount']}`",
        f"- Missing evidence: `{report['missingEvidenceCount']}`",
        f"- All speakers survive in master: `{str(report['allSpeakersSurviveInMaster']).lower()}`",
        f"- Approval status: `{report['approvalStatus']}`",
        f"- Branch inheritance ready: `{str(report['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(report['branchRenderReady']).lower()}`",
        "",
        "## Speaker survival",
        "",
        "| Speaker/source | Active time | Active windows | Master audible while active | Quiet active windows | Source median | Master median | Status |",
        "|---|---:|---:|---:|---:|---:|---:|---|",
    ]
    for row in report["speakerSurvival"]:
        lines.append(
            "| {speaker} | {active:.3f}s | {windows} | {audible:.2f}% | {quiet} | {source} | {master} | `{status}` |".format(
                speaker=row.get("speaker"),
                active=float_value(row.get("activeSeconds")),
                windows=row.get("activeWindowCount"),
                audible=float_value(row.get("masterAudibleWhenActivePercent")),
                quiet=row.get("masterQuietWhenActiveWindowCount"),
                source=db(row.get("sourceMedianActiveDbfs")),
                master=db(row.get("masterMedianDuringSpeakerActiveDbfs")),
                status=row.get("survivalStatus"),
            )
        )
    lines.extend(["", "## Warning buckets", "", "| Warning | Full count | Focus rows | Meaning | Escalation rule |", "|---|---:|---:|---|---|"])
    for bucket in report["flagBuckets"]:
        lines.append(
            f"| {bucket['label']} (`{bucket['flag']}`) | `{bucket['fullAuditCount']}` | `{bucket['focusRowCount']}` | {bucket['interpretation']} | {bucket['escalationRule']} |"
        )
    lines.extend(["", "## Representative listen windows", "", "| Priority | Time | Classification | Flags | Master | Charlie | Homer | Question | Safe fail action |", "|---:|---:|---|---|---:|---:|---:|---|---|"])
    for window in report["representativeWindows"]:
        question = "; ".join(window.get("listenQuestions") or []) or "Does this warning sound distracting?"
        action = "; ".join(window.get("safeActionsIfFails") or []) or "Route a scoped v007 proof window if it fails."
        flags = ", ".join(window.get("flags") or [])
        lines.append(
            "| {priority} | `{time}` | `{classification}` | {flags} | {master} | {charlie} | {homer} | {question} | {action} |".format(
                priority=window.get("priority"),
                time=window.get("time"),
                classification=window.get("classification"),
                flags=flags or "none",
                master=db(window.get("masterDbfs")),
                charlie=db(window.get("charlieContributionDbfs")),
                homer=db(window.get("homerContributionDbfs")),
                question=question.replace("|", "/"),
                action=action.replace("|", "/"),
            )
        )
    lines.extend(
        [
            "",
            "## Next safe action",
            "",
            report["nextSafeAction"],
            "",
            "## Related reports",
            "",
        ]
    )
    for label, path in report["sourceReports"].items():
        if path:
            lines.append(f"- {label}: `{path}`")
    lines.extend(
        [
            "",
            "## Guardrails",
            "",
            "- This triage does not approve the master.",
            "- It does not unlock branch inheritance or branch rendering.",
            "- It does not render, upload, publish, or mutate original media.",
            "- The right response to a real issue is a scoped timestamped proof/repair path, not a blind full-spine retune.",
            "",
        ]
    )
    return "\n".join(lines)


def render_html(report: dict[str, Any], markdown: str) -> str:
    status = html.escape(str(report["status"]))
    rows = []
    for window in report["representativeWindows"]:
        rows.append(
            "<tr>"
            f"<td>{window.get('priority')}</td>"
            f"<td>{html.escape(str(window.get('time')))}</td>"
            f"<td>{html.escape(str(window.get('classification')))}</td>"
            f"<td>{html.escape(', '.join(window.get('flags') or []))}</td>"
            f"<td>{html.escape(db(window.get('masterDbfs')))}</td>"
            f"<td>{html.escape(db(window.get('charlieContributionDbfs')))}</td>"
            f"<td>{html.escape(db(window.get('homerContributionDbfs')))}</td>"
            f"<td>{html.escape('; '.join(window.get('listenQuestions') or []))}</td>"
            "</tr>"
        )
    speaker_cards = []
    for row in report["speakerSurvival"]:
        speaker_cards.append(
            "<div class='card'>"
            f"<b>{html.escape(str(row.get('speaker')))}</b>"
            f"<span>{float_value(row.get('masterAudibleWhenActivePercent')):.2f}% audible while active</span>"
            f"<small>{html.escape(str(row.get('survivalStatus')))}</small>"
            "</div>"
        )
    return f"""<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Source Balance Triage</title>
<style>
:root {{ color-scheme: dark; --bg:#121711; --panel:#1d281d; --ink:#f4f0dd; --muted:#bdb69a; --gold:#ffd54a; --green:#7ae58b; --red:#ff7373; --line:#40513d; }}
body {{ margin:0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif; background: radial-gradient(circle at top left, #23351e, var(--bg) 42%); color:var(--ink); }}
main {{ max-width: 1180px; margin: 0 auto; padding: 32px; }}
h1 {{ font-size: 34px; margin-bottom: 8px; }}
.hero, .panel {{ background: rgba(29,40,29,.88); border:1px solid var(--line); border-radius:22px; padding:22px; margin:18px 0; box-shadow: 0 16px 50px rgba(0,0,0,.28); }}
.stats {{ display:grid; grid-template-columns: repeat(5, minmax(130px, 1fr)); gap:12px; }}
.stat, .card {{ background:#111a12; border:1px solid var(--line); border-radius:16px; padding:14px; }}
.stat b {{ display:block; color:var(--gold); font-size:24px; }}
.card b, .card span, .card small {{ display:block; }}
.card span {{ color:var(--green); font-size:20px; margin:8px 0; }}
.speaker {{ display:grid; grid-template-columns: repeat(3, 1fr); gap:12px; }}
table {{ width:100%; border-collapse:collapse; font-size:13px; }}
th, td {{ text-align:left; border-bottom:1px solid var(--line); padding:9px; vertical-align:top; }}
th {{ color:var(--gold); }}
code, pre {{ background:#0c120d; color:#f9f1c7; border-radius:10px; }}
pre {{ padding:16px; overflow:auto; }}
.status {{ color:var(--green); font-weight:800; }}
.guard {{ color:var(--muted); }}
</style>
</head>
<body>
<main>
<section class="hero">
<h1>Source Balance Triage</h1>
<p class="status">{status}</p>
<p>{html.escape(str(report['conclusion']))}</p>
<p class="guard">This condenses warning noise into a producer listen plan. It does not approve audio, unlock branches, render, upload, publish, or mutate original media.</p>
<div class="stats">
<div class="stat"><b>{report['machineWarningCount']}</b>warnings</div>
<div class="stat"><b>{report['triageWindowCount']}</b>triage windows</div>
<div class="stat"><b>{report['queueBalanceItemCount']}</b>queue items</div>
<div class="stat"><b>{str(report['allSpeakersSurviveInMaster']).lower()}</b>speakers survive</div>
<div class="stat"><b>{report['missingEvidenceCount']}</b>missing evidence</div>
</div>
</section>
<section class="panel">
<h2>Speaker survival</h2>
<div class="speaker">{''.join(speaker_cards)}</div>
</section>
<section class="panel">
<h2>Representative listen windows</h2>
<table><thead><tr><th>Priority</th><th>Time</th><th>Classification</th><th>Flags</th><th>Master</th><th>Charlie</th><th>Homer</th><th>Listen question</th></tr></thead><tbody>{''.join(rows)}</tbody></table>
</section>
<section class="panel">
<h2>Markdown source</h2>
<pre>{html.escape(markdown)}</pre>
</section>
</main>
</body>
</html>
"""


def write_open_command(path: Path, target: Path) -> None:
    path.write_text(f"#!/bin/zsh\nopen {shell_quote(str(target))}\n", encoding="utf-8")
    path.chmod(0o755)


def update_manifest(baseline_dir: Path, report: dict[str, Any], stable_json: Path, stable_md: Path, stable_html: Path, open_command: Path) -> None:
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    outputs["latestAudioSourceBalanceTriage"] = str(stable_json)
    outputs["latestAudioSourceBalanceTriageMarkdown"] = str(stable_md)
    outputs["latestAudioSourceBalanceTriageHtml"] = str(stable_html)
    outputs["latestAudioSourceBalanceTriageOpenCommand"] = str(open_command)
    history = outputs.setdefault("audioSourceBalanceTriages", [])
    if isinstance(history, list):
        history.append(str(stable_json))
    manifest["audioSourceBalanceTriageLatestStatus"] = report["status"]
    manifest["audioSourceBalanceTriageLatestGeneratedAt"] = report["generatedAt"]
    manifest["audioSourceBalanceTriageMachineWarningCount"] = report["machineWarningCount"]
    manifest["audioSourceBalanceTriageTriageWindowCount"] = report["triageWindowCount"]
    manifest["audioSourceBalanceTriageQueueBalanceItemCount"] = report["queueBalanceItemCount"]
    manifest["audioSourceBalanceTriageMissingEvidenceCount"] = report["missingEvidenceCount"]
    manifest["audioSourceBalanceTriageAllSpeakersSurviveInMaster"] = report["allSpeakersSurviveInMaster"]
    manifest["audioSourceBalanceTriageApprovalStateChanged"] = False
    manifest["audioSourceBalanceTriageBranchStateChanged"] = False
    manifest["audioSourceBalanceTriageRenderAttempted"] = False
    manifest["audioSourceBalanceTriageUploadAttempted"] = False
    manifest["audioSourceBalanceTriagePublicationAttempted"] = False
    manifest["audioSourceBalanceTriageOriginalMediaMutated"] = False
    write_json(manifest_path, manifest)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    parser.add_argument("--limit", type=int, default=14)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest = read_json(baseline_dir / "manifest.json")
    generated_at = generated_stamp()
    report = build_report(manifest, baseline_dir, generated_at, max(4, args.limit))
    slug = safe_slug(str(report["baselineId"]))

    stable_json = baseline_dir / "AUDIO_SOURCE_BALANCE_TRIAGE.json"
    stable_md = baseline_dir / "AUDIO_SOURCE_BALANCE_TRIAGE.md"
    stable_html = baseline_dir / "AUDIO_SOURCE_BALANCE_TRIAGE.html"
    open_command = baseline_dir / "OPEN_AUDIO_SOURCE_BALANCE_TRIAGE.command"

    versioned_json = baseline_dir / f"audio-source-balance-triage-{slug}-{generated_at}.json"
    versioned_md = baseline_dir / f"audio-source-balance-triage-{slug}-{generated_at}.md"
    versioned_html = baseline_dir / f"audio-source-balance-triage-{slug}-{generated_at}.html"

    markdown = render_markdown(report)
    html_text = render_html(report, markdown)
    for path in (stable_json, versioned_json):
        write_json(path, report)
    for path in (stable_md, versioned_md):
        path.write_text(markdown, encoding="utf-8")
    for path in (stable_html, versioned_html):
        path.write_text(html_text, encoding="utf-8")
    write_open_command(open_command, stable_html)
    update_manifest(baseline_dir, report, stable_json, stable_md, stable_html, open_command)
    print(stable_md)


if __name__ == "__main__":
    main()
