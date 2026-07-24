#!/usr/bin/env python3
"""Build a non-destructive, source-aware Episode 4 picture-decision map.

The tool never edits session or media files. It combines canonical speaker activity,
the active Studio session's whole-source availability, watched-source activity, and
transcript boundaries into an inspectable camera overlay for a later edit branch.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import os
from collections import Counter
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import unquote, urlparse


HOME = Path.home()
DEFAULT_SESSION = HOME / "Library/Application Support/Quipsly/MediaVault/sessions/episode-4-v014-homer-parity-main-public-v016.quipsly-session.json"
VAULT = Path("/Volumes/My Passport/Quipsly Media Vault/audio/episode-4")
DEFAULT_CHARLIE_DIR = VAULT / "v016-charlie-contribution-envelope-silero"
DEFAULT_HOMER_DIR = VAULT / "v016-homer-contribution-envelope-silero"
DEFAULT_REFERENCE_DIR = VAULT / "v016-reference-contribution-envelope-silero"
DEFAULT_TRANSCRIPT = Path("/Volumes/My Passport/Episode_and_Shorts_Test/review-board/transcript-spines/episode-04/20260701-131412-466404-transcript-spine/episode-04.transcript-spine.draft.json")


@dataclass(frozen=True)
class ActivitySample:
    start: float
    end: float
    probability_mean: float
    probability_max: float
    rms_dbfs: float
    active: bool

    @property
    def score(self) -> float:
        energy = min(max((self.rms_dbfs + 62.0) / 42.0, 0.0), 1.0)
        score = 0.58 * self.probability_max + 0.27 * self.probability_mean + 0.15 * energy
        return min(max(score if self.active else score * 0.28, 0.0), 1.0)


@dataclass(frozen=True)
class VideoSource:
    lane_id: str
    source_id: str
    family: str
    source_family_id: str
    segment_index: int
    segment_count: int
    name: str
    start: float
    end: float
    duration: float
    source_path: str
    proxy_path: str

    def contains(self, time_seconds: float) -> bool:
        return self.start <= time_seconds < self.end


@dataclass
class DecisionRun:
    start: float
    end: float
    family: str
    reason: str
    confidence: float
    sample_start: int
    sample_end: int

    @property
    def duration(self) -> float:
        return max(self.end - self.start, 0.0)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--session", type=Path, default=DEFAULT_SESSION)
    parser.add_argument("--charlie-dir", type=Path, default=DEFAULT_CHARLIE_DIR)
    parser.add_argument("--homer-dir", type=Path, default=DEFAULT_HOMER_DIR)
    parser.add_argument("--reference-dir", type=Path, default=DEFAULT_REFERENCE_DIR)
    parser.add_argument("--transcript", type=Path, default=DEFAULT_TRANSCRIPT)
    parser.add_argument("--output-dir", type=Path, required=True)
    return parser.parse_args()


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def file_url_path(value: str) -> str:
    if not value.startswith("file:"):
        return value
    parsed = urlparse(value)
    return unquote(parsed.path)


def speech_intervals(directory: Path) -> list[tuple[float, float]]:
    payload = load_json(directory / "speech-segments.json")
    return [(float(row["start"]), float(row["end"])) for row in payload.get("segments", [])]


def read_activity(directory: Path) -> list[ActivitySample]:
    intervals = speech_intervals(directory)
    interval_index = 0
    samples: list[ActivitySample] = []
    with (directory / "speech-probability-100ms.csv").open("r", encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            start = float(row["start"])
            end = float(row["end"])
            midpoint = (start + end) / 2.0
            while interval_index < len(intervals) and intervals[interval_index][1] < midpoint:
                interval_index += 1
            active = (
                interval_index < len(intervals)
                and intervals[interval_index][0] <= midpoint <= intervals[interval_index][1]
            )
            samples.append(
                ActivitySample(
                    start=start,
                    end=end,
                    probability_mean=float(row["speechProbabilityMean"]),
                    probability_max=float(row["speechProbabilityMax"]),
                    rms_dbfs=float(row["rmsDbfs"]),
                    active=active,
                )
            )
    return samples


def classify_family(metadata: dict[str, Any], name: str) -> str | None:
    haystack = " ".join(
        str(value).lower()
        for value in [metadata.get("role", ""), metadata.get("sourceFamilyId", ""), name]
    )
    if "charlie" in haystack and ("camera" in haystack or "video" in haystack):
        return "charlie"
    if "homer" in haystack and ("camera" in haystack or "video" in haystack):
        return "homer"
    if any(token in haystack for token in ["reference", "watched", "artshow", "clip source"]):
        return "reference"
    return None


def active_sequence(session: dict[str, Any]) -> dict[str, Any]:
    sequences = session.get("project", {}).get("sequences", [])
    active_id = session.get("activeSequenceId")
    return next((row for row in sequences if row.get("id") == active_id), sequences[0] if sequences else {})


def load_video_sources(session: dict[str, Any]) -> tuple[dict[str, Any], list[VideoSource]]:
    sequence = active_sequence(session)
    sources: list[VideoSource] = []
    for lane in sequence.get("lanes", []):
        metadata = lane.get("metadata") or {}
        if str(metadata.get("mediaKind", "")).lower() == "audio":
            continue
        source = lane.get("sourceVideo") or {}
        family = classify_family(metadata, str(lane.get("name", "")))
        if family is None or not source:
            continue
        start = float(source.get("offset") or 0.0)
        duration = float(source.get("duration") or 0.0)
        sources.append(
            VideoSource(
                lane_id=str(lane.get("id", "")),
                source_id=str(source.get("id", "")),
                family=family,
                source_family_id=str(metadata.get("sourceFamilyId") or f"{family}-source"),
                segment_index=int(metadata.get("sourceSegmentIndex") or 1),
                segment_count=int(metadata.get("sourceSegmentCount") or 1),
                name=str(lane.get("name") or source.get("id") or family),
                start=start,
                end=start + duration,
                duration=duration,
                source_path=file_url_path(str(source.get("mediaURL") or metadata.get("sourcePath") or "")),
                proxy_path=file_url_path(str(source.get("proxyURL") or metadata.get("vaultProxyPath") or "")),
            )
        )
    return sequence, sorted(sources, key=lambda item: (item.start, item.family, item.segment_index))


def available_source(sources: Iterable[VideoSource], family: str, time_seconds: float) -> VideoSource | None:
    candidates = [source for source in sources if source.family == family and source.contains(time_seconds)]
    if not candidates:
        return None
    return max(candidates, key=lambda source: source.start)


def transcript_boundaries(payload: dict[str, Any]) -> list[float]:
    boundaries: set[float] = set()
    for segment in payload.get("segments", []):
        for key in ("start", "end"):
            value = segment.get(key)
            if isinstance(value, (int, float)) and math.isfinite(float(value)):
                boundaries.add(float(value))
        for word in segment.get("words", []):
            for key in ("start", "end"):
                value = word.get(key)
                if isinstance(value, (int, float)) and math.isfinite(float(value)):
                    boundaries.add(float(value))
    return sorted(boundaries)


def nearest_boundary(value: float, boundaries: list[float], tolerance: float = 0.24) -> float:
    if not boundaries:
        return value
    low, high = 0, len(boundaries)
    while low < high:
        mid = (low + high) // 2
        if boundaries[mid] < value:
            low = mid + 1
        else:
            high = mid
    candidates = boundaries[max(0, low - 1): min(len(boundaries), low + 2)]
    nearest = min(candidates, key=lambda item: abs(item - value), default=value)
    return nearest if abs(nearest - value) <= tolerance else value


def choose_family(
    charlie: ActivitySample,
    homer: ActivitySample,
    reference: ActivitySample,
    sources: list[VideoSource],
    current_family: str | None,
) -> tuple[str, str, float]:
    midpoint = (charlie.start + charlie.end) / 2.0
    available = {
        family for family in ("charlie", "homer", "reference")
        if available_source(sources, family, midpoint)
    }
    if reference.active and "reference" in available:
        return "reference", "watched-source-audio", max(reference.score, 0.72)

    charlie_active = charlie.active and "charlie" in available
    homer_active = homer.active and "homer" in available
    if charlie_active and not homer_active:
        return "charlie", "active-speaker", max(charlie.score, 0.66)
    if homer_active and not charlie_active:
        return "homer", "active-speaker", max(homer.score, 0.66)
    if charlie_active and homer_active:
        difference = charlie.score - homer.score
        if abs(difference) >= 0.10:
            family = "charlie" if difference > 0 else "homer"
            return family, "overlap-dominant-speaker", min(0.98, 0.64 + abs(difference))
        if current_family in {"charlie", "homer"} and current_family in available:
            return current_family, "overlap-hold-current", 0.60
        family = "charlie" if charlie.score >= homer.score else "homer"
        return family, "overlap-close-score", 0.56

    if current_family in available:
        return current_family, "hold-through-silence", 0.58
    for fallback in ("charlie", "homer", "reference"):
        if fallback in available:
            return fallback, "source-availability-fallback", 0.48
    return "gap", "no-source-gap", 1.0


def run_length_encode(labels: list[tuple[str, str, float]], samples: list[ActivitySample]) -> list[DecisionRun]:
    if not labels:
        return []
    runs: list[DecisionRun] = []
    start_index = 0
    family, reason, confidence = labels[0]
    confidences = [confidence]
    reasons = Counter([reason])
    for index, (next_family, next_reason, next_confidence) in enumerate(labels[1:], start=1):
        if next_family == family:
            confidences.append(next_confidence)
            reasons[next_reason] += 1
            continue
        runs.append(
            DecisionRun(
                start=samples[start_index].start,
                end=samples[index - 1].end,
                family=family,
                reason=reasons.most_common(1)[0][0],
                confidence=sum(confidences) / len(confidences),
                sample_start=start_index,
                sample_end=index,
            )
        )
        start_index = index
        family, reason = next_family, next_reason
        confidences = [next_confidence]
        reasons = Counter([next_reason])
    runs.append(
        DecisionRun(
            start=samples[start_index].start,
            end=samples[-1].end,
            family=family,
            reason=reasons.most_common(1)[0][0],
            confidence=sum(confidences) / len(confidences),
            sample_start=start_index,
            sample_end=len(samples),
        )
    )
    return runs


def merge_run_pair(left: DecisionRun, right: DecisionRun) -> DecisionRun:
    total = max(left.duration + right.duration, 1e-9)
    return DecisionRun(
        start=left.start,
        end=right.end,
        family=left.family,
        reason=left.reason if left.duration >= right.duration else right.reason,
        confidence=(left.confidence * left.duration + right.confidence * right.duration) / total,
        sample_start=left.sample_start,
        sample_end=right.sample_end,
    )


def consolidate_runs(runs: list[DecisionRun], activities: dict[str, list[ActivitySample]]) -> list[DecisionRun]:
    working = runs[:]
    for _ in range(4):
        changed = False
        result: list[DecisionRun] = []
        index = 0
        while index < len(working):
            run = working[index]
            previous = result[-1] if result else None
            following = working[index + 1] if index + 1 < len(working) else None
            is_reaction = (
                previous is not None
                and following is not None
                and previous.family == following.family
                and run.family in {"charlie", "homer"}
                and 0.75 <= run.duration <= 3.4
                and any(sample.active for sample in activities[run.family][run.sample_start:run.sample_end])
            )
            minimum = 0.75 if is_reaction else (1.35 if run.family == "reference" else 2.0)
            if run.duration < minimum and previous is not None and following is not None:
                if previous.family == following.family:
                    result[-1] = DecisionRun(
                        start=previous.start,
                        end=following.end,
                        family=previous.family,
                        reason="suppressed-micro-cut",
                        confidence=(previous.confidence + following.confidence) / 2.0,
                        sample_start=previous.sample_start,
                        sample_end=following.sample_end,
                    )
                    index += 2
                    changed = True
                    continue
                if previous.duration >= following.duration:
                    result[-1] = merge_run_pair(previous, run)
                    changed = True
                    index += 1
                    continue
                run.family = following.family
                run.reason = "suppressed-micro-cut"
                changed = True
            if result and result[-1].family == run.family:
                result[-1] = merge_run_pair(result[-1], run)
            else:
                if is_reaction:
                    run.reason = "listener-reaction-or-interjection"
                    run.confidence = max(run.confidence, 0.68)
                result.append(run)
            index += 1
        working = result
        if not changed:
            break
    return working


def snap_runs(runs: list[DecisionRun], boundaries: list[float]) -> list[DecisionRun]:
    if len(runs) < 2:
        return runs
    snapped = runs[:]
    for index in range(len(snapped) - 1):
        boundary = nearest_boundary(snapped[index].end, boundaries)
        lower = snapped[index].start + 0.75
        upper = snapped[index + 1].end - 0.75
        if lower < boundary < upper:
            snapped[index].end = boundary
            snapped[index + 1].start = boundary
    return snapped


def split_at_source_boundaries(runs: list[DecisionRun], sources: list[VideoSource]) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    for run in runs:
        family_sources = [source for source in sources if source.family == run.family]
        boundaries = {run.start, run.end}
        for source in family_sources:
            if run.start < source.start < run.end:
                boundaries.add(source.start)
            if run.start < source.end < run.end:
                boundaries.add(source.end)
        ordered = sorted(boundaries)
        for start, end in zip(ordered, ordered[1:]):
            if end - start < 0.001:
                continue
            midpoint = (start + end) / 2.0
            selected = available_source(sources, run.family, midpoint)
            family = run.family
            reason = run.reason
            if selected is None:
                for fallback in ("charlie", "homer", "reference"):
                    selected = available_source(sources, fallback, midpoint)
                    if selected is not None:
                        family = fallback
                        reason = "source-availability-fallback"
                        break
            output.append(
                {
                    "startSeconds": round(start, 3),
                    "endSeconds": round(end, 3),
                    "durationSeconds": round(end - start, 3),
                    "family": family if selected is not None else "gap",
                    "reason": reason if selected is not None else "no-source-gap",
                    "confidence": round(run.confidence if selected is not None else 1.0, 4),
                    "laneId": selected.lane_id if selected else None,
                    "sourceId": selected.source_id if selected else None,
                    "sourceFamilyId": selected.source_family_id if selected else None,
                    "sourceSegmentIndex": selected.segment_index if selected else None,
                    "sourceSegmentCount": selected.segment_count if selected else None,
                    "sourceName": selected.name if selected else "Blank program output",
                    "sourcePath": selected.source_path if selected else None,
                    "proxyPath": selected.proxy_path if selected else None,
                    "sourceLocalStartSeconds": round(start - selected.start, 3) if selected else None,
                    "sourceLocalEndSeconds": round(end - selected.start, 3) if selected else None,
                }
            )
    for index, decision in enumerate(output, start=1):
        decision["decisionId"] = f"ep4-picture-{index:05d}"
    return output


def activity_evidence(samples: list[ActivitySample], start: float, end: float) -> dict[str, Any]:
    selected = [sample for sample in samples if sample.end > start and sample.start < end]
    if not selected:
        return {"activePercent": 0.0, "meanSpeechProbability": 0.0, "maxSpeechProbability": 0.0, "meanRmsDbfs": -96.0}
    return {
        "activePercent": round(sum(1 for sample in selected if sample.active) / len(selected) * 100.0, 2),
        "meanSpeechProbability": round(sum(sample.probability_mean for sample in selected) / len(selected), 4),
        "maxSpeechProbability": round(max(sample.probability_max for sample in selected), 4),
        "meanRmsDbfs": round(sum(sample.rms_dbfs for sample in selected) / len(selected), 2),
    }


def existing_tag_audit(sequence: dict[str, Any]) -> dict[str, Any]:
    durations: list[float] = []
    for lane in sequence.get("lanes", []):
        metadata = lane.get("metadata") or {}
        if str(metadata.get("mediaKind", "")).lower() == "audio":
            continue
        for tag in lane.get("tags", []):
            if str(tag.get("type", "")).lower() == "active":
                durations.append(float(tag.get("duration") or 0.0))
    mechanical = [duration for duration in durations if abs(duration - 26.0) <= 0.01]
    return {
        "activeDecisionCount": len(durations),
        "exactly26SecondDecisionCount": len(mechanical),
        "exactly26SecondSharePercent": round(len(mechanical) / max(len(durations), 1) * 100.0, 2),
        "interpretation": "Existing picture tags are retained only as rough historical evidence; they are not promoted into this map.",
    }


def ensure_new_output_dir(path: Path) -> None:
    if path.exists() and any(path.iterdir()):
        raise SystemExit(f"Refusing to overwrite non-empty output directory: {path}")
    path.mkdir(parents=True, exist_ok=True)


def write_outputs(
    output_dir: Path,
    payload: dict[str, Any],
    decisions: list[dict[str, Any]],
) -> None:
    json_path = output_dir / "episode-4-professional-camera-decisions.json"
    csv_path = output_dir / "episode-4-professional-camera-decisions.csv"
    summary_path = output_dir / "README.md"
    json_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    with csv_path.open("w", encoding="utf-8", newline="") as handle:
        fields = [
            "decisionId", "startSeconds", "endSeconds", "durationSeconds", "family", "reason",
            "confidence", "sourceName", "sourceId", "sourceSegmentIndex", "sourceLocalStartSeconds",
            "sourceLocalEndSeconds", "proxyPath",
        ]
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(decisions)

    summary = payload["summary"]
    family_lines = "\n".join(
        f"- {family}: {seconds / 60.0:.1f} minutes"
        for family, seconds in sorted(summary["familyDurationSeconds"].items())
    )
    reason_lines = "\n".join(
        f"- {reason}: {count} decisions"
        for reason, count in sorted(summary["reasonCounts"].items())
    )
    summary_path.write_text(
        "# Episode 4 professional camera decision map\n\n"
        "This is a non-destructive metadata overlay. It does not alter the Studio session or any media.\n\n"
        f"- Decisions: {summary['decisionCount']}\n"
        f"- Average shot: {summary['averageShotSeconds']:.2f}s\n"
        f"- Median shot: {summary['medianShotSeconds']:.2f}s\n"
        f"- Shortest shot: {summary['minimumShotSeconds']:.2f}s\n"
        f"- Longest shot: {summary['maximumShotSeconds']:.2f}s\n"
        f"- Listener reaction/interjection shots: {summary['reactionDecisionCount']}\n"
        f"- Watched-source decisions: {summary['watchedSourceDecisionCount']}\n"
        f"- Program gaps: {summary['gapDecisionCount']}\n\n"
        "## Screen time\n\n"
        f"{family_lines}\n\n"
        "## Decision reasons\n\n"
        f"{reason_lines}\n\n"
        "## Promotion rule\n\n"
        "Inspect representative sections and cut rhythm before applying this overlay to a Studio edit branch. "
        "Speaker activity identifies who is audible; visual reaction quality still requires frame inspection.\n",
        encoding="utf-8",
    )


def median(values: list[float]) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    midpoint = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[midpoint]
    return (ordered[midpoint - 1] + ordered[midpoint]) / 2.0


def main() -> int:
    args = parse_args()
    required = [
        args.session,
        args.transcript,
        args.charlie_dir / "speech-probability-100ms.csv",
        args.charlie_dir / "speech-segments.json",
        args.homer_dir / "speech-probability-100ms.csv",
        args.homer_dir / "speech-segments.json",
        args.reference_dir / "speech-probability-100ms.csv",
        args.reference_dir / "speech-segments.json",
    ]
    missing = [str(path) for path in required if not path.is_file()]
    if missing:
        raise SystemExit("Missing required inputs:\n" + "\n".join(missing))
    ensure_new_output_dir(args.output_dir)

    session = load_json(args.session)
    transcript = load_json(args.transcript)
    sequence, sources = load_video_sources(session)
    activities = {
        "charlie": read_activity(args.charlie_dir),
        "homer": read_activity(args.homer_dir),
        "reference": read_activity(args.reference_dir),
    }
    sample_count = min(len(samples) for samples in activities.values())
    for family in activities:
        activities[family] = activities[family][:sample_count]
    base_samples = activities["charlie"]

    labels: list[tuple[str, str, float]] = []
    current_family: str | None = None
    for charlie, homer, reference in zip(
        activities["charlie"], activities["homer"], activities["reference"]
    ):
        family, reason, confidence = choose_family(charlie, homer, reference, sources, current_family)
        labels.append((family, reason, confidence))
        current_family = family

    runs = run_length_encode(labels, base_samples)
    runs = consolidate_runs(runs, activities)
    runs = snap_runs(runs, transcript_boundaries(transcript))
    decisions = split_at_source_boundaries(runs, sources)
    for decision in decisions:
        start = float(decision["startSeconds"])
        end = float(decision["endSeconds"])
        decision["evidence"] = {
            family: activity_evidence(samples, start, end)
            for family, samples in activities.items()
        }
        if decision["family"] == "charlie":
            alternatives = ["homer"]
        elif decision["family"] == "homer":
            alternatives = ["charlie"]
        elif decision["family"] == "reference":
            alternatives = ["charlie", "homer"]
        else:
            alternatives = ["charlie", "homer", "reference"]
        check_count = max(int(math.ceil(end - start)), 1)
        covered = sum(
            1
            for index in range(check_count)
            if any(
                available_source(sources, family, min(start + index + 0.5, end - 0.001)) is not None
                for family in alternatives
            )
        )
        alternative_coverage = covered / check_count * 100.0
        decision["alternativeCameraCoveragePercent"] = round(alternative_coverage, 2)
        decision["coverageConstrained"] = bool(
            decision["durationSeconds"] >= 20 and alternative_coverage < 20
        )
        decision["needsVisualReactionReview"] = bool(
            decision["family"] in {"charlie", "homer"}
            and decision["durationSeconds"] >= 18
            and alternative_coverage >= 35
        )

    durations = [float(decision["durationSeconds"]) for decision in decisions]
    family_durations = Counter()
    reason_counts = Counter()
    for decision in decisions:
        family_durations[decision["family"]] += float(decision["durationSeconds"])
        reason_counts[decision["reason"]] += 1

    visual_review_queue = sorted(
        [
            {
                "decisionId": decision["decisionId"],
                "startSeconds": decision["startSeconds"],
                "endSeconds": decision["endSeconds"],
                "durationSeconds": decision["durationSeconds"],
                "currentFamily": decision["family"],
                "alternativeFamily": "homer" if decision["family"] == "charlie" else "charlie",
                "alternativeCameraCoveragePercent": decision["alternativeCameraCoveragePercent"],
                "reason": "Long audible turn with alternate participant video available; inspect for genuine visual reactions before adding cuts.",
            }
            for decision in decisions
            if decision["needsVisualReactionReview"]
        ],
        key=lambda item: item["durationSeconds"] * item["alternativeCameraCoveragePercent"],
        reverse=True,
    )

    source_paths = [Path(source.source_path) for source in sources if source.source_path]
    proxy_paths = [Path(source.proxy_path) for source in sources if source.proxy_path]
    payload = {
        "schema": "quipsly.camera-decision-map.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "episode": "episode-4",
        "intent": "Professional speaker-aware and source-aware picture decisions over whole synced sources.",
        "canonical": False,
        "promotionStatus": "candidate-needs-representative-frame-and-rhythm-inspection",
        "originalMediaMutated": False,
        "sessionMutated": False,
        "truth": {
            "wholeSourcesRemainIntact": True,
            "decisionsAreMetadata": True,
            "speakerIdentityAuthority": "separate canonical contribution envelopes",
            "semanticBoundaryAuthority": "timed transcript with placeholder speaker labels",
            "existingStudioTagsAuthority": "historical-rough-evidence-only",
        },
        "inputs": {
            "session": {"path": str(args.session), "sha256": sha256(args.session)},
            "transcript": {"path": str(args.transcript), "sha256": sha256(args.transcript)},
            "activity": {
                family: {
                    "csvPath": str(directory / "speech-probability-100ms.csv"),
                    "segmentsPath": str(directory / "speech-segments.json"),
                    "segmentSha256": sha256(directory / "speech-segments.json"),
                }
                for family, directory in {
                    "charlie": args.charlie_dir,
                    "homer": args.homer_dir,
                    "reference": args.reference_dir,
                }.items()
            },
        },
        "activeSequence": {
            "id": sequence.get("id"),
            "title": sequence.get("title"),
            "sourceCount": len(sources),
            "sourceFamilies": dict(Counter(source.family for source in sources)),
            "allSourceFilesExist": all(path.is_file() for path in source_paths),
            "allProxyFilesExist": all(path.is_file() for path in proxy_paths),
            "videoSources": [asdict(source) for source in sources],
        },
        "rejectedBaselineAudit": existing_tag_audit(sequence),
        "algorithm": {
            "sampleResolutionSeconds": round(base_samples[0].end - base_samples[0].start, 3) if base_samples else None,
            "microCutMinimumSeconds": 2.0,
            "reactionMinimumSeconds": 0.75,
            "referenceMinimumSeconds": 1.35,
            "transcriptBoundarySnapToleranceSeconds": 0.24,
            "notes": [
                "Watched-source speech takes picture priority while its source is available.",
                "Single-speaker activity selects that participant when their camera is available.",
                "Overlaps use confidence, energy, and current-shot continuity.",
                "Brief audible interjections can survive as listener reaction candidates.",
                "No arbitrary reaction shot is invented without audible evidence; visual inspection remains required.",
            ],
        },
        "summary": {
            "decisionCount": len(decisions),
            "averageShotSeconds": round(sum(durations) / max(len(durations), 1), 3),
            "medianShotSeconds": round(median(durations), 3),
            "minimumShotSeconds": round(min(durations, default=0.0), 3),
            "maximumShotSeconds": round(max(durations, default=0.0), 3),
            "reactionDecisionCount": reason_counts["listener-reaction-or-interjection"],
            "watchedSourceDecisionCount": sum(1 for decision in decisions if decision["family"] == "reference"),
            "gapDecisionCount": sum(1 for decision in decisions if decision["family"] == "gap"),
            "coverageConstrainedDecisionCount": sum(1 for decision in decisions if decision["coverageConstrained"]),
            "visualReactionReviewCount": len(visual_review_queue),
            "familyDurationSeconds": {key: round(value, 3) for key, value in family_durations.items()},
            "reasonCounts": dict(reason_counts),
        },
        "visualReactionReviewQueue": visual_review_queue,
        "decisions": decisions,
    }
    write_outputs(args.output_dir, payload, decisions)
    print(json.dumps({
        "status": "candidate-generated",
        "outputDir": str(args.output_dir),
        "decisionCount": len(decisions),
        "summary": payload["summary"],
        "existingTagAudit": payload["rejectedBaselineAudit"],
        "allSourceFilesExist": payload["activeSequence"]["allSourceFilesExist"],
        "allProxyFilesExist": payload["activeSequence"]["allProxyFilesExist"],
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
