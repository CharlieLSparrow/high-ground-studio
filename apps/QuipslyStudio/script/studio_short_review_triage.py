#!/usr/bin/env python3
"""Agent-safe triage lane for one Quipsly Studio short.

This command turns the currently manual review ritual into one repeatable lane:
create evidence, add transcript evidence when it is missing, refresh readback,
and produce a local recommendation. It records no review decision unless
explicitly asked with --record-decision.
"""
from __future__ import annotations

import argparse
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


APP_ROOT = Path(__file__).resolve().parents[1]
AGENTCTL = APP_ROOT / "script" / "agentctl.sh"
DEFAULT_RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
DEFAULT_OUTPUT_DIR = DEFAULT_RELEASE_ROOT / "review-board" / "short-review-triage"
SCHEMA = "quipsly.studio.short-review-triage.v1"
VERSION = "2026-07-03.v1"


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def run_agent_json(args: list[str], allow_failure: bool = False) -> tuple[dict[str, Any], dict[str, Any]]:
    command = [str(AGENTCTL), *args, "--json"] if "--json" not in args else [str(AGENTCTL), *args]
    proc = subprocess.run(command, cwd=APP_ROOT, text=True, capture_output=True)
    meta = {
        "command": command,
        "returncode": proc.returncode,
        "stderrTail": proc.stderr[-600:],
    }
    if proc.returncode != 0 and not allow_failure:
        raise SystemExit(json.dumps({"status": "command-failed", **meta}, indent=2, sort_keys=True))
    try:
        return json.loads(proc.stdout), meta
    except json.JSONDecodeError:
        if allow_failure:
            return {}, meta
        raise SystemExit(json.dumps({"status": "json-parse-failed", **meta}, indent=2, sort_keys=True))


def compact_step(name: str, result: dict[str, Any], meta: dict[str, Any]) -> dict[str, Any]:
    compact: dict[str, Any] = {
        "name": name,
        "returncode": meta.get("returncode"),
        "command": meta.get("command"),
    }
    if meta.get("stderrTail"):
        compact["stderrTail"] = meta.get("stderrTail")
    if name.startswith("readback"):
        compact["result"] = result
        return compact
    if name.startswith("evidence"):
        compact["result"] = {
            "status": result.get("status"),
            "jsonPath": result.get("jsonPath"),
            "markdownPath": result.get("markdownPath"),
        }
        return compact
    if name == "transcript-intake":
        compact["result"] = {
            "schema": result.get("schema"),
            "batchDir": result.get("batchDir"),
            "indexJson": result.get("indexJson"),
            "counts": result.get("counts"),
            "truth": result.get("truth"),
        }
        return compact
    if name == "asr-draft":
        compact["result"] = {
            "schema": result.get("schema"),
            "status": result.get("status"),
            "shortId": result.get("shortId"),
            "manifestPath": result.get("manifestPath"),
            "wordCountApprox": result.get("wordCountApprox"),
            "segmentCount": result.get("segmentCount"),
            "destinations": result.get("destinations"),
            "truth": result.get("truth"),
        }
        return compact
    if name == "record-local-decision":
        compact["result"] = {
            "ok": result.get("ok"),
            "shortId": result.get("shortId"),
            "decision": result.get("decision"),
            "ledgerMutated": result.get("ledgerMutated"),
            "counts": result.get("counts"),
            "truth": result.get("truth"),
        }
        return compact
    compact["result"] = result
    return compact


def summarize_readback(readback: dict[str, Any]) -> dict[str, Any]:
    evidence = readback.get("evidence") if isinstance(readback.get("evidence"), dict) else {}
    short = readback.get("short") if isinstance(readback.get("short"), dict) else {}
    worksheet = readback.get("worksheet") if isinstance(readback.get("worksheet"), dict) else {}
    decision = readback.get("decisionSummary") if isinstance(readback.get("decisionSummary"), dict) else {}
    return {
        "shortId": readback.get("shortId") or short.get("id"),
        "episode": short.get("episode"),
        "title": short.get("title"),
        "durationSeconds": short.get("durationSeconds"),
        "latestDecision": readback.get("latestDecision"),
        "decisionSummary": decision,
        "transcriptStatus": evidence.get("transcriptStatus") or "missing",
        "transcriptPreview": evidence.get("transcriptPreview") or "",
        "audioWarnings": evidence.get("audioWarnings") if isinstance(evidence.get("audioWarnings"), list) else [],
        "missingEvidence": evidence.get("missingEvidence") if isinstance(evidence.get("missingEvidence"), list) else [],
        "worksheetNeeds": worksheet.get("needsNoteFields") if isinstance(worksheet.get("needsNoteFields"), list) else [],
        "evidencePacket": evidence.get("jsonPath") or "",
        "contactHtml": evidence.get("contactHtml") or "",
        "audioHtml": evidence.get("audioHtml") or "",
        "captionDraftSrt": evidence.get("captionDraftSrt") or "",
        "transcriptJsonPath": evidence.get("transcriptJsonPath") or "",
    }


def generic_intro(text: str) -> bool:
    lower = text.lower()
    intro_hits = [
        "welcome to episode",
        "let's go ahead and get started",
        "good morning",
        "this is my brother",
        "welcome everyone",
    ]
    return sum(1 for hit in intro_hits if hit in lower) >= 2


def likely_trails_off(text: str) -> bool:
    stripped = text.strip()
    if not stripped:
        return False
    trailing_words = ("and", "but", "because", "the", "a", "to", "you're", "we're", "putting")
    return stripped.lower().endswith(trailing_words)


def recommend(summary: dict[str, Any]) -> dict[str, Any]:
    transcript_status = str(summary.get("transcriptStatus") or "")
    transcript = str(summary.get("transcriptPreview") or "")
    audio_warnings = summary.get("audioWarnings") if isinstance(summary.get("audioWarnings"), list) else []
    duration = float(summary.get("durationSeconds") or 0)
    if transcript_status == "missing":
        return {
            "decision": "needs-more-evidence",
            "confidence": "high",
            "notes": "Transcript evidence is still missing. Do not judge this short from visuals alone; create or review transcript/listen evidence first.",
        }
    if generic_intro(transcript):
        return {
            "decision": "reject",
            "confidence": "medium",
            "notes": "Transcript-aware review: this reads like a generic episode intro or welcome rather than a standalone social idea, lesson, joke, or emotional beat. Preserve as episode material; reject as a short candidate.",
        }
    if audio_warnings or duration > 40 or likely_trails_off(transcript):
        reasons = []
        if audio_warnings:
            reasons.append("audio probe warns about silence/pauses")
        if duration > 40:
            reasons.append("duration is long enough to need tighter social pacing")
        if likely_trails_off(transcript):
            reasons.append("transcript preview appears to trail off before the payoff")
        return {
            "decision": "refine",
            "confidence": "medium",
            "notes": "Transcript-aware review: promising material, but " + ", ".join(reasons) + ". Refine tighter in/out, preserve human cadence, and verify caption placement before promotion.",
        }
    return {
        "decision": "refine",
        "confidence": "low",
        "notes": "Transcript and basic evidence exist, but this command is not yet a human-quality taste model. Treat as a promising candidate that needs editor review before keep/publish decisions.",
    }


def render_markdown(payload: dict[str, Any]) -> str:
    recommendation = payload.get("recommendation") if isinstance(payload.get("recommendation"), dict) else {}
    summary = payload.get("summary") if isinstance(payload.get("summary"), dict) else {}
    truth = payload.get("truth") if isinstance(payload.get("truth"), dict) else {}
    lines = [
        "# Studio short review triage",
        "",
        f"Short: `{payload.get('shortId')}`",
        f"Status: `{payload.get('status')}`",
        f"Recorded decision: `{payload.get('recordedDecision')}`",
        "",
        "## Recommendation",
        "",
        f"- Decision: `{recommendation.get('decision')}`",
        f"- Confidence: `{recommendation.get('confidence')}`",
        f"- Notes: {recommendation.get('notes')}",
        "",
        "## Evidence summary",
        "",
        f"- Title: {summary.get('title') or ''}",
        f"- Episode: `{summary.get('episode')}`",
        f"- Duration: `{summary.get('durationSeconds')}`",
        f"- Transcript: `{summary.get('transcriptStatus')}`",
        f"- Preview: {summary.get('transcriptPreview') or '(none)'}",
        f"- Audio warnings: `{len(summary.get('audioWarnings') or [])}`",
        f"- Evidence packet: `{summary.get('evidencePacket') or ''}`",
        f"- Contact sheet: `{summary.get('contactHtml') or ''}`",
        f"- Audio probe: `{summary.get('audioHtml') or ''}`",
        f"- Caption draft: `{summary.get('captionDraftSrt') or ''}`",
        "",
        "## Truth boundary",
        "",
        str(truth.get("description") or ""),
    ]
    return "\n".join(lines).rstrip() + "\n"


def save_payload(payload: dict[str, Any], output_dir: Path) -> dict[str, str]:
    short_id = str(payload.get("shortId") or "unknown-short")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / f"{stamp}-{short_id}-short-review-triage.json"
    markdown_path = output_dir / f"{stamp}-{short_id}-short-review-triage.md"
    json_path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    markdown_path.write_text(render_markdown(payload), encoding="utf-8")
    latest_path = output_dir / "latest-short-review-triage.json"
    latest_path.write_text(
        json.dumps({"jsonPath": str(json_path), "markdownPath": str(markdown_path), "shortId": short_id}, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return {"jsonPath": str(json_path), "markdownPath": str(markdown_path), "latestPointerJson": str(latest_path)}


def main() -> int:
    parser = argparse.ArgumentParser(description="Gather evidence and recommend the next local short review action.")
    parser.add_argument("--short-id", default="", help="Specific short id. Defaults to current next ranked pending short.")
    parser.add_argument("--record-decision", action="store_true", help="Record the recommendation in the local review ledger.")
    parser.add_argument("--reviewer", default="Codex", help="Reviewer name when --record-decision is used.")
    parser.add_argument("--no-run-asr", action="store_true", help="Do not run ASR even if transcript evidence is missing.")
    parser.add_argument("--save", action="store_true", help="Save a durable triage JSON and Markdown artifact.")
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR), help="Output directory when --save is used.")
    parser.add_argument("--format", choices=["markdown", "json"], default="markdown")
    parser.add_argument("--markdown", dest="format", action="store_const", const="markdown")
    parser.add_argument("--json", dest="format", action="store_const", const="json")
    args = parser.parse_args()

    steps: list[dict[str, Any]] = []
    evidence_args = ["studio-next-short-review-evidence", "--save"]
    if args.short_id:
        evidence_args.extend(["--short-id", args.short_id])
    evidence, meta = run_agent_json(evidence_args)
    steps.append(compact_step("evidence", evidence, meta))

    readback_args = ["studio-short-review-readback"]
    if args.short_id:
        readback_args.extend(["--short-id", args.short_id])
    readback, meta = run_agent_json(readback_args)
    steps.append(compact_step("readback-before-transcript", summarize_readback(readback), meta))
    summary = summarize_readback(readback)
    short_id = str(summary.get("shortId") or args.short_id)
    if not short_id:
        raise SystemExit("Could not determine short id for triage.")

    if summary.get("transcriptStatus") == "missing" and not args.no_run_asr:
        intake, meta = run_agent_json(["studio-shorts-transcript-intake-batch", "--short-id", short_id])
        steps.append(compact_step("transcript-intake", intake, meta))
        asr, meta = run_agent_json(["studio-shorts-transcript-asr-draft", "--short-id", short_id, "--run-asr"], allow_failure=True)
        steps.append(compact_step("asr-draft", asr, meta))
        evidence, meta = run_agent_json(["studio-next-short-review-evidence", "--short-id", short_id, "--save"])
        steps.append(compact_step("evidence-after-transcript", evidence, meta))
        readback, meta = run_agent_json(["studio-short-review-readback", "--short-id", short_id])
        steps.append(compact_step("readback-after-transcript", summarize_readback(readback), meta))
        summary = summarize_readback(readback)

    recommendation = recommend(summary)
    decision_result: dict[str, Any] = {}
    if args.record_decision:
        decision_result, meta = run_agent_json(
            [
                "studio-short-review-decision",
                short_id,
                str(recommendation["decision"]),
                args.reviewer,
                str(recommendation["notes"]),
            ]
        )
        steps.append(compact_step("record-local-decision", decision_result, meta))
        readback, meta = run_agent_json(["studio-short-review-readback", "--short-id", short_id])
        steps.append(compact_step("readback-after-decision", summarize_readback(readback), meta))
        summary = summarize_readback(readback)

    payload = {
        "schema": SCHEMA,
        "version": VERSION,
        "generatedAt": utc_now(),
        "status": "short-review-triage-ready",
        "shortId": short_id,
        "recordedDecision": bool(args.record_decision),
        "summary": summary,
        "recommendation": recommendation,
        "decisionResult": decision_result,
        "steps": steps,
        "truth": {
            "description": "Local short triage only. It may create derivative evidence, transcript intake audio, ASR draft/caption sidecars, and optionally a local review-ledger decision.",
            "sourceFilesMutated": False,
            "externalPublishing": False,
            "externalUpload": False,
            "externalSchedulesCreated": False,
            "accountMutation": False,
            "receiptTruthCreated": False,
            "normalizedTranscriptTruthCreated": False,
            "versionsOverwritten": False,
            "filesDeleted": False,
        },
    }
    if args.save:
        payload["savedArtifacts"] = save_payload(payload, Path(args.output_dir).expanduser())
    if args.format == "json":
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        print(render_markdown(payload), end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
