#!/usr/bin/env python3
"""Build a focused human-listen queue for an Episode 4 audio candidate."""

from __future__ import annotations

import argparse
import csv
import json
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_CLUSTER_SECONDS = 5.0
DEFAULT_LIMIT = 40


@dataclass
class Candidate:
    priority: int
    time_sec: float
    title: str
    reason: str
    source: str
    classification: str
    listen_question: str
    safe_action_if_fails: str
    related_artifacts: list[str] = field(default_factory=list)


@dataclass
class Cluster:
    priority: int
    time_sec: float
    time: str
    title: str
    reasons: list[str] = field(default_factory=list)
    sources: list[str] = field(default_factory=list)
    classifications: list[str] = field(default_factory=list)
    listen_questions: list[str] = field(default_factory=list)
    safe_actions_if_fails: list[str] = field(default_factory=list)
    related_artifacts: list[str] = field(default_factory=list)

    def absorb(self, candidate: Candidate) -> None:
        if candidate.priority < self.priority:
            self.priority = candidate.priority
            self.time_sec = candidate.time_sec
            self.time = format_time(candidate.time_sec)
            self.title = candidate.title
        append_unique(self.reasons, candidate.reason)
        append_unique(self.sources, candidate.source)
        append_unique(self.classifications, candidate.classification)
        append_unique(self.listen_questions, candidate.listen_question)
        append_unique(self.safe_actions_if_fails, candidate.safe_action_if_fails)
        for artifact in candidate.related_artifacts:
            append_unique(self.related_artifacts, artifact)


def append_unique(items: list[str], value: str | None) -> None:
    if value and value not in items:
        items.append(value)


def utc_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def output_path(baseline_dir: Path, value: Any) -> Path | None:
    if not value:
        return None
    path = Path(str(value))
    if path.is_absolute():
        return path
    return baseline_dir / path


def format_time(seconds: float) -> str:
    seconds = max(0.0, float(seconds))
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    whole = int(seconds % 60)
    millis = int(round((seconds - int(seconds)) * 1000))
    if millis >= 1000:
        whole += 1
        millis -= 1000
    if hours:
        return f"{hours:02d}:{minutes:02d}:{whole:02d}.{millis:03d}"
    return f"{minutes:02d}:{whole:02d}.{millis:03d}"


def parse_time_to_seconds(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    if not text:
        return None
    if re.fullmatch(r"-?\d+(?:\.\d+)?", text):
        return float(text)
    parts = text.split(":")
    try:
        if len(parts) == 3:
            return float(parts[0]) * 3600 + float(parts[1]) * 60 + float(parts[2])
        if len(parts) == 2:
            return float(parts[0]) * 60 + float(parts[1])
    except ValueError:
        return None
    return None


def canonical_row(row: dict[str, str]) -> dict[str, str]:
    return {str(key).strip().lower().replace(" ", "").replace("_", ""): value for key, value in row.items()}


def first_present(row: dict[str, str], keys: list[str]) -> str | None:
    for key in keys:
        if key in row and str(row[key]).strip():
            return str(row[key]).strip()
    return None


def marker_candidates(manifest: dict[str, Any], baseline_dir: Path) -> list[Candidate]:
    outputs = manifest.get("outputs") or {}
    csv_path = output_path(baseline_dir, outputs.get("latestEditorMarkerPacketCsv"))
    marker_md = str(outputs.get("latestEditorMarkerPacketMarkdown") or "")
    candidates: list[Candidate] = []
    if not csv_path or not csv_path.exists():
        return candidates

    with csv_path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for index, raw_row in enumerate(reader, start=1):
            row = canonical_row(raw_row)
            time_value = first_present(
                row,
                ["timesec", "startsec", "seconds", "second", "time", "timestamp", "start", "starttime"],
            )
            time_sec = parse_time_to_seconds(time_value)
            if time_sec is None:
                continue
            category = first_present(row, ["category", "type", "kind", "severity", "class"]) or "marker"
            title = first_present(row, ["title", "name", "label", "marker", "description"]) or f"Editor marker {index}"
            notes = first_present(row, ["notes", "note", "reason", "details", "description"]) or title
            priority = 2 if any(word in category.lower() for word in ["critical", "approval", "bleed"]) else 4
            candidates.append(
                Candidate(
                    priority=priority,
                    time_sec=time_sec,
                    title=title,
                    reason=notes,
                    source="editor-marker-packet",
                    classification=category,
                    listen_question="Does this marked moment sound natural enough to approve, or does it need a scoped repair?",
                    safe_action_if_fails="If it fails, record a human-listen failure and create a timestamped v007 repair candidate for this window.",
                    related_artifacts=[marker_md] if marker_md else [],
                )
            )
    return candidates


def proof_window_candidates(manifest: dict[str, Any]) -> list[Candidate]:
    outputs = manifest.get("outputs") or {}
    related = [
        str(outputs.get("latestProofWindowListenWorkorderMarkdown") or ""),
        str(outputs.get("latestListenDecisionMatrixMarkdown") or ""),
        str(outputs.get("latestBleedManagementAuditMarkdown") or ""),
        str(outputs.get("latestBleedRepairWorkorderMarkdown") or ""),
    ]
    related = [item for item in related if item]
    windows = [
        (1760.001, "Long quiet span near 00:29:20", "Known long low-level span detected by marker and visual/smoothness audits.", "Does the long quiet span feel intentional and natural, or does it indicate muted speech/missing source?"),
        (2062.0, "Camera assistant overlap proof window", "Known listen-priority warning for possible Charlie over-gating during overlap.", "Does Charlie's track preserve natural overlap/reaction without chopping Homer or snapping open?"),
        (4180.0, "Office clip and reaction proof window", "Proof-window workorder marks this as a critical listen moment.", "Do the source handoff, reactions, and clip audio feel balanced and intentional?"),
        (5710.0, "Late episode proof window", "Proof-window workorder marks this as a critical listen moment.", "Does the late-episode dialogue still sound consistent after the full-spine processing chain?"),
    ]
    return [
        Candidate(
            priority=1,
            time_sec=time,
            title=title,
            reason=reason,
            source="proof-window-listen-workorder",
            classification="critical-listen",
            listen_question=question,
            safe_action_if_fails="If it fails, keep v006 locked and route only that window into a timestamped repair profile.",
            related_artifacts=related,
        )
        for time, title, reason, question in windows
    ]


def smoothness_candidates(manifest: dict[str, Any], baseline_dir: Path) -> list[Candidate]:
    outputs = manifest.get("outputs") or {}
    smooth_path = output_path(baseline_dir, outputs.get("latestAudioMasterSmoothnessAudit"))
    smooth_md = str(outputs.get("latestAudioMasterSmoothnessAuditMarkdown") or "")
    candidates: list[Candidate] = []
    if not smooth_path or not smooth_path.exists():
        return candidates
    with smooth_path.open(encoding="utf-8") as handle:
        audit = json.load(handle)

    for span in audit.get("longSilenceSpans") or []:
        start = parse_time_to_seconds(span.get("startSec") or span.get("start") or span.get("timeSec"))
        end = parse_time_to_seconds(span.get("endSec") or span.get("end"))
        if start is None:
            continue
        duration = None if end is None else max(0.0, end - start)
        if duration is not None and duration < 8:
            continue
        if abs(start - 1760.0) <= 10:
            priority = 1
        elif duration is not None and duration >= 20:
            priority = 3
        else:
            priority = 5
        candidates.append(
            Candidate(
                priority=priority,
                time_sec=start,
                title=f"Low-level span starts at {format_time(start)}",
                reason=f"Smoothness audit detected a long low-level span{f' lasting {duration:.1f}s' if duration is not None else ''}.",
                source="audio-master-smoothness-audit",
                classification="long-low-level-span",
                listen_question="Is this silence intentional, or did the cleanup mute speech/reaction that should remain?",
                safe_action_if_fails="If it fails, record a human-listen failure and repair only the affected window.",
                related_artifacts=[smooth_md] if smooth_md else [],
            )
        )

    for transition in (audit.get("largestTransitions") or [])[:40]:
        time_sec = parse_time_to_seconds(transition.get("timeSec") or transition.get("time"))
        if time_sec is None:
            continue
        classification = str(transition.get("classification") or "level-transition")
        delta_db = transition.get("deltaDb")
        if classification == "hard-silence-edge-listen-check":
            priority = 2
            question = "Does this transition sound natural, or like a gate/cut snapped open?"
        elif classification == "large-level-jump-listen-check":
            priority = 3
            question = "Does this level jump feel like speech/action, or like an edit artifact?"
        else:
            priority = 4
            question = "Spot-check whether nearby dialogue and room tone feel natural."
        reason = f"Smoothness audit flagged a {classification}"
        if delta_db is not None:
            reason += f" with {float(delta_db):.1f}dB change"
        candidates.append(
            Candidate(
                priority=priority,
                time_sec=time_sec,
                title=f"Envelope transition at {format_time(time_sec)}",
                reason=reason + ".",
                source="audio-master-smoothness-audit",
                classification=classification,
                listen_question=question,
                safe_action_if_fails="If it fails, repair the local gate/level envelope in a new timestamped candidate.",
                related_artifacts=[smooth_md] if smooth_md else [],
            )
        )
    return candidates


def master_source_balance_candidates(manifest: dict[str, Any], baseline_dir: Path) -> list[Candidate]:
    outputs = manifest.get("outputs") or {}
    audit_path = output_path(baseline_dir, outputs.get("latestAudioMasterSourceBalanceAudit"))
    audit_md = str(outputs.get("latestAudioMasterSourceBalanceAuditMarkdown") or "")
    candidates: list[Candidate] = []
    if not audit_path or not audit_path.exists():
        return candidates
    with audit_path.open(encoding="utf-8") as handle:
        audit = json.load(handle)

    for row in audit.get("focusRows") or []:
        try:
            time_sec = float(row.get("startSec"))
        except (TypeError, ValueError):
            continue
        flags = list(row.get("flags") or [])
        severity = int(row.get("severity") or 3)
        if "master_loud_without_registered_source" in flags:
            priority = 2
            classification = "master-source-unexplained-energy"
            question = "Does this window contain harmless room tone/reference ambience, or did the mastered spine retain bleed/noise that the source maps do not explain?"
            action = "If it fails, keep v006 locked and tune the contribution mask or noise floor in a timestamped v007 proof window."
        elif "master_loud_with_aligned_source_but_no_contribution" in flags:
            priority = 3
            classification = "master-source-threshold-mismatch"
            question = "Does this window sound natural, or did the contribution gate suppress useful source context while the master still carries it?"
            action = "If it fails, adjust the source-activity threshold or contribution mask for this local window before approving v006."
        else:
            priority = 4 if severity >= 3 else 5
            classification = "master-source-balance-context"
            question = "Does this source/master balance window sound natural enough to approve?"
            action = "If it fails, record needs-proof or failed-human-listen notes and keep v006 locked."

        reason = (
            "Master/source balance audit flagged "
            + ", ".join(flags or ["balance context"])
            + f"; master {float(row.get('masterDbfs') or -96.0):.1f} dBFS, "
            + f"Charlie contribution {float(row.get('charlieContributionDbfs') or -96.0):.1f} dBFS, "
            + f"Homer contribution {float(row.get('homerContributionDbfs') or -96.0):.1f} dBFS."
        )
        candidates.append(
            Candidate(
                priority=priority,
                time_sec=time_sec,
                title=f"Master/source balance check at {format_time(time_sec)}",
                reason=reason,
                source="audio-master-source-balance-audit",
                classification=classification,
                listen_question=question,
                safe_action_if_fails=action,
                related_artifacts=[audit_md] if audit_md else [],
            )
        )
    return candidates


def cluster_candidates(candidates: list[Candidate], cluster_seconds: float, limit: int) -> list[Cluster]:
    clusters: list[Cluster] = []
    for candidate in sorted(candidates, key=lambda item: (item.priority, item.time_sec)):
        target = None
        for cluster in clusters:
            if abs(cluster.time_sec - candidate.time_sec) <= cluster_seconds:
                target = cluster
                break
        if target is None:
            target = Cluster(candidate.priority, candidate.time_sec, format_time(candidate.time_sec), candidate.title)
            clusters.append(target)
        target.absorb(candidate)
    return sorted(clusters, key=lambda item: (item.priority, item.time_sec))[:limit]


def select_limited_clusters(clusters: list[Cluster], limit: int) -> list[Cluster]:
    """Keep the queue risk-ordered while preserving source-balance class coverage."""
    if limit <= 0:
        return []
    ordered = sorted(clusters, key=lambda item: (item.priority, item.time_sec))
    selected = ordered[:limit]
    selected_ids = {id(cluster) for cluster in selected}
    source_balance_classes = sorted(
        {
            classification
            for cluster in ordered
            if "audio-master-source-balance-audit" in cluster.sources
            for classification in cluster.classifications
        }
    )
    for classification in source_balance_classes:
        if any(classification in cluster.classifications for cluster in selected):
            continue
        replacement = next(
            (
                cluster
                for cluster in ordered
                if id(cluster) not in selected_ids and classification in cluster.classifications
            ),
            None,
        )
        if replacement is None:
            continue
        if len(selected) < limit:
            selected.append(replacement)
            selected_ids.add(id(replacement))
            continue
        replace_index = max(
            range(len(selected)),
            key=lambda index: (
                selected[index].priority,
                1 if "audio-master-source-balance-audit" not in selected[index].sources else 0,
                selected[index].time_sec,
            ),
        )
        selected_ids.discard(id(selected[replace_index]))
        selected[replace_index] = replacement
        selected_ids.add(id(replacement))
    return sorted(selected, key=lambda item: (item.priority, item.time_sec))[:limit]


def cluster_to_dict(cluster: Cluster, index: int) -> dict[str, Any]:
    return {
        "priority": index,
        "riskPriority": cluster.priority,
        "timeSec": round(cluster.time_sec, 3),
        "time": cluster.time,
        "title": cluster.title,
        "reasons": cluster.reasons,
        "sources": cluster.sources,
        "classifications": cluster.classifications,
        "listenQuestions": cluster.listen_questions,
        "safeActionsIfFails": cluster.safe_actions_if_fails,
        "relatedArtifacts": cluster.related_artifacts,
    }


def build_markdown(payload: dict[str, Any]) -> str:
    rows = []
    for item in payload["queue"]:
        rows.append(
            f"| {item['priority']} | `{item['time']}` | {item['title']} | {', '.join(item['sources'])} | {', '.join(item['classifications'])} | {'<br>'.join(item['reasons'])} | {'<br>'.join(item['listenQuestions'])} |"
        )
    return "\n".join(
        [
            f"# Audio Listen-Priority Queue: {payload['baselineId']}",
            "",
            f"Generated: `{payload['generatedAt']}`",
            "",
            "This queue is not approval. It is a focused listening map for the v006 candidate so a human can decide whether to approve it for branch inheritance or route a scoped repair.",
            "",
            "## Gate truth",
            "",
            f"- Approval status: `{payload['approvalStatus']}`",
            f"- Package ready for human listen: `{str(payload['packageReadyForHumanListen']).lower()}`",
            f"- Branch inheritance ready: `{str(payload['branchInheritanceReady']).lower()}`",
            f"- Branch render ready: `{str(payload['branchRenderReady']).lower()}`",
            "- Approval state changed by this queue: `false`",
            "- Branch state changed by this queue: `false`",
            "- Render attempted by this queue: `false`",
            "- Original media mutated by this queue: `false`",
            "",
            "## Summary",
            "",
            f"- Candidate signals before dedupe: `{payload['candidateCountBeforeDedupe']}`",
            f"- Clustered listen moments before limit: `{payload['clusteredCount']}`",
            f"- Queue items shown: `{payload['queueCount']}`",
            f"- Cluster window: `{payload['clusterSeconds']}s`",
            "",
            "## Listen first",
            "",
            "| # | Time | Moment | Sources | Classes | Why it matters | Listen question |",
            "|---:|---:|---|---|---|---|---|",
            *rows,
            "",
            "## Safe next actions",
            "",
            "- If these moments pass human listening, use the guarded approval path. Do not hand-edit the manifest.",
            "- If one fails, keep v006 locked and create a timestamped v007 repair candidate for only the failing window.",
            "- If the issue is uncertain, record `needs-proof` notes and continue with more focused proof-window evidence rather than unlocking branch renders.",
            "",
        ]
    )


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline-dir", required=True)
    parser.add_argument("--cluster-seconds", type=float, default=DEFAULT_CLUSTER_SECONDS)
    parser.add_argument("--limit", type=int, default=DEFAULT_LIMIT)
    args = parser.parse_args()

    baseline_dir = Path(args.baseline_dir).expanduser().resolve()
    manifest_path = baseline_dir / "manifest.json"
    with manifest_path.open(encoding="utf-8") as handle:
        manifest = json.load(handle)

    baseline_id = str(manifest.get("baselineId") or "unknown-baseline")
    suffix = baseline_id.replace("episode-4-conformed-production-baseline-", "")
    stamp = utc_stamp()
    json_path = baseline_dir / f"audio-listen-priority-queue-{suffix}-{stamp}.json"
    markdown_path = baseline_dir / f"audio-listen-priority-queue-{suffix}-{stamp}.md"

    candidates: list[Candidate] = []
    candidates.extend(proof_window_candidates(manifest))
    candidates.extend(marker_candidates(manifest, baseline_dir))
    candidates.extend(smoothness_candidates(manifest, baseline_dir))
    candidates.extend(master_source_balance_candidates(manifest, baseline_dir))
    all_clusters = cluster_candidates(candidates, args.cluster_seconds, len(candidates) or 1)
    selected_clusters = select_limited_clusters(all_clusters, args.limit)
    queue = [cluster_to_dict(cluster, index) for index, cluster in enumerate(selected_clusters, start=1)]

    payload = {
        "generatedAt": iso_now(),
        "baselineId": baseline_id,
        "baselineDir": str(baseline_dir),
        "approvalStatus": manifest.get("approvalStatus"),
        "packageReadyForHumanListen": bool(manifest.get("packageReadyForHumanListen")),
        "branchInheritanceReady": bool(manifest.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest.get("branchRenderReady")),
        "candidateCountBeforeDedupe": len(candidates),
        "clusteredCount": len(all_clusters),
        "selectedClusterCount": len(selected_clusters),
        "queueCount": len(queue),
        "clusterSeconds": args.cluster_seconds,
        "limit": args.limit,
        "queue": queue,
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "originalMediaMutated": False,
    }
    write_json(json_path, payload)
    markdown_path.write_text(build_markdown(payload), encoding="utf-8")

    outputs = manifest.setdefault("outputs", {})
    outputs["latestAudioListenPriorityQueue"] = str(json_path)
    outputs["latestAudioListenPriorityQueueMarkdown"] = str(markdown_path)
    queues = outputs.setdefault("audioListenPriorityQueues", [])
    if str(json_path) not in queues:
        queues.append(str(json_path))
    markdown_queues = outputs.setdefault("audioListenPriorityQueueMarkdowns", [])
    if str(markdown_path) not in markdown_queues:
        markdown_queues.append(str(markdown_path))
    manifest["audioListenPriorityQueueCount"] = len(queues)
    manifest["updatedAt"] = iso_now()
    write_json(manifest_path, manifest)

    print(json.dumps(payload, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
