#!/usr/bin/env python3
"""Refresh the v002 short review truth chain in the safe order.

This is the agent-safe conveyor belt for derivative v002 short candidates:
index -> review ledger -> exact candidate transcript -> evidence -> quality brief
-> review theater -> decision rehearsal -> review queue -> surface alignment.

It writes local sidecars and refreshed pointers only. It never records review
choices, mutates source media, overwrites previous exports, publishes, schedules,
or creates receipt truth.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
SCHEMA = "quipsly.studio.short-v002-review-refresh.v1"
VERSION = "2026-07-03.v1"


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def run_json(label: str, command: list[str], timeout: int = 900) -> tuple[dict[str, Any], dict[str, Any]]:
    started = utc_now()
    proc = subprocess.run(command, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout)
    step = {
        "label": label,
        "command": command,
        "startedAt": started,
        "completedAt": utc_now(),
        "returncode": proc.returncode,
        "ok": proc.returncode == 0,
        "stderrTail": (proc.stderr or "")[-1600:],
    }
    if proc.returncode != 0:
        step["stdoutTail"] = (proc.stdout or "")[-1600:]
        return step, {}
    try:
        data = json.loads(proc.stdout or "{}")
    except json.JSONDecodeError as error:
        step.update({"ok": False, "error": f"JSON parse failed: {error}", "stdoutTail": (proc.stdout or "")[-1600:]})
        return step, {}
    if not isinstance(data, dict):
        step.update({"ok": False, "error": "Expected JSON object output."})
        return step, {}
    step["status"] = data.get("status") or ""
    step["outputPaths"] = data.get("outputPaths") if isinstance(data.get("outputPaths"), dict) else {}
    return step, data


def py(script_name: str, *args: str) -> list[str]:
    return [sys.executable, str(SCRIPT_DIR / script_name), *args]


def selected_short_ids(ledger: dict[str, Any], requested: list[str], include_decided: bool) -> list[str]:
    if requested:
        return requested
    ids: list[str] = []
    for row in ledger.get("items", []) if isinstance(ledger.get("items"), list) else []:
        if not isinstance(row, dict):
            continue
        short_id = str(row.get("shortId") or "")
        if not short_id:
            continue
        if not include_decided and str(row.get("reviewStatus") or "") in {"keep", "reject"}:
            continue
        if row.get("candidateStatus") == "v002-candidate-exported" and row.get("outputExists"):
            ids.append(short_id)
    return ids


def compact_queue_item(item: dict[str, Any]) -> dict[str, Any]:
    gate = item.get("reviewGate") if isinstance(item.get("reviewGate"), dict) else {}
    warnings = [str(value) for value in item.get("warnings", []) if value] if isinstance(item.get("warnings"), list) else []
    return {
        "shortId": item.get("shortId") or "",
        "episode": item.get("episode"),
        "readiness": item.get("readiness") or "",
        "reviewStatus": item.get("reviewStatus") or "",
        "candidateStatus": item.get("candidateStatus") or "",
        "candidatePath": item.get("candidatePath") or "",
        "warningCount": len(warnings),
        "warnings": warnings,
        "warningSummary": "; ".join(warnings) if warnings else "",
        "reviewGateStatus": gate.get("status") or "",
        "nextSafestAction": item.get("nextSafestAction") or "",
    }


def compact_alignment_item(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "shortId": item.get("shortId") or "",
        "ok": bool(item.get("ok")),
        "problemCount": len(item.get("problems") or []) if isinstance(item.get("problems"), list) else 0,
        "problems": item.get("problems") if isinstance(item.get("problems"), list) else [],
        "warningSummary": item.get("warningSummary") or "",
    }


def build_refresh(args: argparse.Namespace) -> dict[str, Any]:
    steps: list[dict[str, Any]] = []
    per_short: list[dict[str, Any]] = []

    index_step, index = run_json("candidate-index", py("studio_short_v002_candidate_index.py", "--json"))
    steps.append(index_step)
    if not index_step.get("ok"):
        return finish(args, steps, per_short, {}, "short-v002-review-refresh-failed")

    ledger_step, ledger = run_json("candidate-review-ledger", py("studio_short_v002_candidate_review.py", "build", "--json"))
    steps.append(ledger_step)
    if not ledger_step.get("ok"):
        return finish(args, steps, per_short, {}, "short-v002-review-refresh-failed")

    short_ids = selected_short_ids(ledger, args.short_id, args.include_decided)
    for short_id in short_ids:
        short_record: dict[str, Any] = {"shortId": short_id, "steps": []}
        if not args.skip_transcript:
            step, data = run_json(
                f"candidate-transcript:{short_id}",
                py("studio_short_v002_candidate_transcript.py", "--short-id", short_id, "--provider", args.provider, "--model", args.model, "--json"),
            )
            short_record["steps"].append(step)
            if data:
                short_record["transcriptPath"] = (data.get("outputPaths") or {}).get("jsonPath", "") if isinstance(data.get("outputPaths"), dict) else ""
        step, data = run_json(f"candidate-evidence:{short_id}", py("studio_short_v002_candidate_evidence.py", "--short-id", short_id, "--json"))
        short_record["steps"].append(step)
        if data:
            short_record["evidencePath"] = (data.get("outputPaths") or {}).get("jsonPath", "") if isinstance(data.get("outputPaths"), dict) else ""
            short_record["evidenceStatus"] = data.get("status") or ""
            rec = data.get("recommendation") if isinstance(data.get("recommendation"), dict) else {}
            short_record["evidenceRecommendation"] = {
                "recommendedReviewStatus": rec.get("recommendedReviewStatus") or "",
                "warningCount": len(rec.get("warnings") or []) if isinstance(rec.get("warnings"), list) else 0,
                "blockerCount": len(rec.get("blockers") or []) if isinstance(rec.get("blockers"), list) else 0,
            }
        step, data = run_json(f"quality-brief:{short_id}", py("studio_short_v002_quality_brief.py", "--short-id", short_id, "--reviewer", args.reviewer, "--all", "--json"))
        short_record["steps"].append(step)
        if data:
            short_record["qualityBriefPath"] = (data.get("outputPaths") or {}).get("jsonPath", "") if isinstance(data.get("outputPaths"), dict) else ""
            short_record["qualityRecommendation"] = data.get("reviewRecommendation") if isinstance(data.get("reviewRecommendation"), dict) else {}
        short_record["ok"] = all(step.get("ok") for step in short_record["steps"])
        per_short.append(short_record)

    theater_step, theater = run_json("candidate-review-theater", py("studio_short_v002_candidate_review_theater.py", "--reviewer", args.reviewer, "--json"))
    steps.append(theater_step)
    for short_record in per_short:
        short_id = str(short_record.get("shortId") or "")
        if not short_id:
            continue
        step, data = run_json(f"decision-rehearsal:{short_id}", py("studio_short_v002_decision_rehearsal.py", "--short-id", short_id, "--reviewer", args.reviewer, "--all", "--json"))
        short_record["steps"].append(step)
        if data:
            short_record["decisionRehearsalPath"] = (data.get("outputPaths") or {}).get("jsonPath", "") if isinstance(data.get("outputPaths"), dict) else ""
            short_record["decisionRecommendation"] = data.get("recommendation") if isinstance(data.get("recommendation"), dict) else {}
            readback = data.get("agentReadback") if isinstance(data.get("agentReadback"), dict) else {}
            short_record["decisionWarningSummary"] = readback.get("warningSummary") or ""
            short_record["decisionWatchListenExpectation"] = readback.get("watchListenExpectation") or ""
        short_record["ok"] = all(step.get("ok") for step in short_record["steps"])
    queue_step, queue = run_json("review-queue", py("studio_short_v002_review_queue.py", "--limit", str(args.limit), "--reviewer", args.reviewer, "--all", "--json"))
    steps.append(queue_step)
    alignment: dict[str, Any] = {}
    if theater_step.get("ok") and queue_step.get("ok"):
        alignment_args: list[str] = ["--reviewer", args.reviewer, "--json"]
        for short_id in short_ids:
            alignment_args.extend(["--short-id", short_id])
        alignment_step, alignment = run_json("surface-alignment", py("studio_short_v002_surface_alignment.py", *alignment_args))
        steps.append(alignment_step)

    status = "short-v002-review-refresh-ready" if all(step.get("ok") for step in steps) and all(item.get("ok") for item in per_short) else "short-v002-review-refresh-partial"
    return finish(args, steps, per_short, {"index": index, "ledger": ledger, "theater": theater, "queue": queue, "alignment": alignment}, status)


def finish(args: argparse.Namespace, steps: list[dict[str, Any]], per_short: list[dict[str, Any]], data: dict[str, Any], status: str) -> dict[str, Any]:
    queue = data.get("queue") if isinstance(data.get("queue"), dict) else {}
    ledger = data.get("ledger") if isinstance(data.get("ledger"), dict) else {}
    theater = data.get("theater") if isinstance(data.get("theater"), dict) else {}
    alignment = data.get("alignment") if isinstance(data.get("alignment"), dict) else {}
    queue_items = [compact_queue_item(item) for item in queue.get("items", []) if isinstance(item, dict)]
    alignment_items = [compact_alignment_item(item) for item in alignment.get("items", []) if isinstance(item, dict)]
    alignment_counts = alignment.get("counts") if isinstance(alignment.get("counts"), dict) else {}
    return {
        "schema": SCHEMA,
        "version": VERSION,
        "generatedAt": utc_now(),
        "status": status,
        "reviewer": args.reviewer,
        "root": str(args.root),
        "counts": {
            "steps": len(steps),
            "failedSteps": sum(1 for step in steps if not step.get("ok")),
            "shorts": len(per_short),
            "shortsFailed": sum(1 for item in per_short if not item.get("ok")),
            "queueItems": len(queue_items),
            "surfaceAlignmentFailed": alignment_counts.get("failed", 0),
            "sourceFilesMutated": False,
            "versionsOverwritten": False,
            "externalPublishing": False,
            "receiptTruthCreated": False,
        },
        "agentReadback": {
            "nextShortId": (queue.get("agentReadback") or {}).get("nextShortId", "") if isinstance(queue.get("agentReadback"), dict) else "",
            "nextReviewGateStatus": (queue.get("agentReadback") or {}).get("nextReviewGateStatus", "") if isinstance(queue.get("agentReadback"), dict) else "",
            "nextAction": (queue.get("agentReadback") or {}).get("nextAction", "") if isinstance(queue.get("agentReadback"), dict) else "",
            "nextCandidatePath": (queue.get("agentReadback") or {}).get("nextCandidatePath", "") if isinstance(queue.get("agentReadback"), dict) else "",
            "queuePath": (queue.get("outputPaths") or {}).get("jsonPath", "") if isinstance(queue.get("outputPaths"), dict) else "",
            "theaterPath": (theater.get("outputPaths") or {}).get("htmlPath", "") if isinstance(theater.get("outputPaths"), dict) else "",
            "ledgerPath": (ledger.get("outputPaths") or {}).get("jsonPath", "") if isinstance(ledger.get("outputPaths"), dict) else "",
            "surfaceAlignmentStatus": alignment.get("status") or "",
            "surfaceAlignmentFailedShortIds": (alignment.get("agentReadback") or {}).get("failedShortIds", []) if isinstance(alignment.get("agentReadback"), dict) else [],
            "surfaceAlignmentNextAction": (alignment.get("agentReadback") or {}).get("nextSafestAction", "") if isinstance(alignment.get("agentReadback"), dict) else "",
        },
        "steps": steps,
        "perShort": per_short,
        "queueItems": queue_items,
        "surfaceAlignment": {
            "status": alignment.get("status") or "",
            "counts": alignment_counts,
            "items": alignment_items,
        },
        "nextSafestAction": (queue.get("agentReadback") or {}).get("nextAction", "Review the refreshed queue and theater.") if isinstance(queue.get("agentReadback"), dict) else "Review the refreshed queue and theater.",
        "truth": "Local v002 review refresh only. It writes sidecars and refreshed pointers; it does not record review decisions, mutate source media, overwrite exports, upload, publish, schedule, mutate accounts, normalize transcript truth, or create receipt truth.",
    }


def render_markdown(payload: dict[str, Any]) -> str:
    readback = payload.get("agentReadback") if isinstance(payload.get("agentReadback"), dict) else {}
    lines = [
        "# Short v002 review refresh",
        "",
        f"Generated: `{payload.get('generatedAt')}`",
        f"Status: `{payload.get('status')}`",
        f"Shorts refreshed: `{payload.get('counts', {}).get('shorts')}`",
        f"Failed steps: `{payload.get('counts', {}).get('failedSteps')}`",
        f"Surface alignment: `{readback.get('surfaceAlignmentStatus') or 'not-run'}`",
        "",
        "## Next",
        "",
        f"- Short: `{readback.get('nextShortId') or 'none'}`",
        f"- Gate: `{readback.get('nextReviewGateStatus') or ''}`",
        f"- Action: {readback.get('nextAction') or payload.get('nextSafestAction')}",
        f"- Candidate: `{readback.get('nextCandidatePath') or ''}`",
        "",
        "## Refreshed shorts",
        "",
    ]
    for item in payload.get("perShort", []):
        rec = item.get("decisionRecommendation") if isinstance(item.get("decisionRecommendation"), dict) else {}
        lines.extend([
            f"### `{item.get('shortId')}`",
            "",
            f"- OK: `{item.get('ok')}`",
            f"- Evidence: `{item.get('evidencePath') or ''}`",
            f"- Quality brief: `{item.get('qualityBriefPath') or ''}`",
            f"- Decision rehearsal: `{item.get('decisionRehearsalPath') or ''}`",
            f"- Recommendation: `{rec.get('recommendedOption') or ''}`",
            "",
        ])
    lines.extend(["## Truth boundary", "", str(payload.get("truth") or "")])
    queue_items = payload.get("queueItems", [])
    if isinstance(queue_items, list) and queue_items:
        lines.extend(["", "## Current review queue", ""])
        for item in queue_items:
            if not isinstance(item, dict):
                continue
            warning_summary = item.get("warningSummary") or "none"
            lines.extend([
                f"- `{item.get('shortId')}`: `{item.get('readiness')}`, gate `{item.get('reviewGateStatus')}`, warnings `{item.get('warningCount')}`.",
                f"  Reason: {warning_summary}",
            ])
    alignment = payload.get("surfaceAlignment") if isinstance(payload.get("surfaceAlignment"), dict) else {}
    if alignment:
        lines.extend(["", "## Surface alignment", ""])
        lines.append(f"Status: `{alignment.get('status') or 'not-run'}`")
        for item in alignment.get("items", []) if isinstance(alignment.get("items"), list) else []:
            lines.append(f"- `{item.get('shortId')}`: ok `{item.get('ok')}`, problems `{item.get('problemCount')}`.")
    return "\n".join(lines).rstrip() + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Refresh v002 short review artifacts in the safe order.")
    parser.add_argument("--short-id", action="append", default=[], help="Specific short id to refresh. Repeatable. Defaults to current actionable candidates.")
    parser.add_argument("--reviewer", default="Codex")
    parser.add_argument("--provider", default="auto")
    parser.add_argument("--model", default="base")
    parser.add_argument("--limit", type=int, default=12)
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    parser.add_argument("--include-decided", action="store_true")
    parser.add_argument("--skip-transcript", action="store_true")
    parser.add_argument("--format", choices=["markdown", "json"], default="markdown")
    parser.add_argument("--markdown", dest="format", action="store_const", const="markdown")
    parser.add_argument("--json", dest="format", action="store_const", const="json")
    args = parser.parse_args()
    payload = build_refresh(args)
    if args.format == "json":
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        print(render_markdown(payload), end="")
    return 0 if payload.get("status") in {"short-v002-review-refresh-ready", "short-v002-review-refresh-partial"} else 1


if __name__ == "__main__":
    raise SystemExit(main())
