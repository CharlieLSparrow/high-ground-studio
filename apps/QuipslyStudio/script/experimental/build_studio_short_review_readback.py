#!/usr/bin/env python3
"""Build a concise readback for a Studio short review target.

This is an agent/human control surface, not a new source of truth. It gathers
the current local review ledger, the ranked next-short handoff, the latest
evidence packet, and the latest cut-quality worksheet into one small report so
review work does not require fragile one-off shell parsers.

It does not approve, publish, upload, schedule, mutate media, overwrite,
delete, mutate accounts, or create receipt truth.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
LATEST_LEDGER_POINTER = Path("review-board/latest-studio-short-review-decision-ledger.json")
DEFAULT_LEDGER_PATH = Path("review-board/studio-short-review-decision-ledger/studio-short-review-decision-ledger.json")


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def load_handoff_module() -> Any:
    module_path = Path(__file__).with_name("build_studio_next_short_review_handoff.py")
    spec = importlib.util.spec_from_file_location("build_studio_next_short_review_handoff", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load handoff module at {module_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def latest_file(paths: list[Path]) -> Path | None:
    existing = [path for path in paths if path.exists()]
    if not existing:
        return None
    return sorted(existing, key=lambda path: path.stat().st_mtime, reverse=True)[0]


def load_decision_ledger(root: Path) -> tuple[dict[str, Any], Path | None]:
    pointer_path = root / LATEST_LEDGER_POINTER
    if pointer_path.exists():
        pointer = load_json(pointer_path)
        pointed = Path(str(pointer.get("jsonPath", "")))
        if pointed.exists():
            return load_json(pointed), pointed
    default_path = root / DEFAULT_LEDGER_PATH
    if default_path.exists():
        return load_json(default_path), default_path
    return {}, None


def latest_worksheet(root: Path, short_id: str) -> tuple[dict[str, Any], Path | None]:
    folder = root / "shorts-command-room" / "cut-quality-worksheets" / short_id
    path = latest_file(list(folder.glob("*-cut-quality-worksheet.json")))
    if not path:
        return {}, None
    return load_json(path), path


def latest_sidecar_notes(root: Path, short_id: str) -> dict[str, dict[str, Any]]:
    folder = root / "shorts-command-room" / "cut-quality-worksheets" / short_id / "notes"
    notes: dict[str, dict[str, Any]] = {}
    for path in sorted(folder.glob("*-cut-quality-note.json"), key=lambda item: item.stat().st_mtime):
        try:
            note = load_json(path)
        except (OSError, json.JSONDecodeError):
            continue
        field = str(note.get("field") or "")
        if not field:
            continue
        notes[field] = {
            "status": "filled",
            "note": note.get("note", ""),
            "kind": note.get("kind", ""),
            "reviewer": note.get("reviewer", ""),
            "generatedAt": note.get("generatedAt", ""),
            "jsonPath": str(path),
            "markdownPath": note.get("artifactPaths", {}).get("markdown", "") if isinstance(note.get("artifactPaths"), dict) else "",
            "htmlPath": note.get("artifactPaths", {}).get("html", "") if isinstance(note.get("artifactPaths"), dict) else "",
            "truth": note.get("truth", ""),
        }
    return notes


def latest_evidence_packet(root: Path, short_id: str) -> tuple[dict[str, Any], Path | None]:
    folder = root / "review-board" / "short-review-evidence-packets"
    candidates: list[Path] = []
    for path in folder.glob("*-next-short-review-evidence.json"):
        try:
            payload = load_json(path)
        except (OSError, json.JSONDecodeError):
            continue
        short = payload.get("short") if isinstance(payload.get("short"), dict) else {}
        if str(short.get("id") or "") == short_id:
            candidates.append(path)
    path = latest_file(candidates)
    if not path:
        return {}, None
    return load_json(path), path


def ledger_counts(ledger: dict[str, Any]) -> dict[str, Any]:
    counts = ledger.get("counts")
    if isinstance(counts, dict):
        return counts
    items = ledger.get("items") if isinstance(ledger.get("items"), list) else []
    decisions: dict[str, int] = {}
    for item in items:
        if not isinstance(item, dict):
            continue
        decision = str(item.get("decision") or "pending")
        decisions[decision] = decisions.get(decision, 0) + 1
    return {
        "items": len(items),
        "pending": decisions.get("pending", 0),
        "keep": decisions.get("keep", 0),
        "refine": decisions.get("refine", 0),
        "hold": decisions.get("hold", 0),
        "reject": decisions.get("reject", 0),
        "needsMoreEvidence": decisions.get("needs-more-evidence", 0),
        "decisionsRecorded": len(items) - decisions.get("pending", 0),
    }


def ledger_item(ledger: dict[str, Any], short_id: str) -> dict[str, Any]:
    for item in ledger.get("items", []) if isinstance(ledger.get("items"), list) else []:
        if isinstance(item, dict) and str(item.get("shortId") or "") == short_id:
            return item
    return {}


def worksheet_summary(worksheet: dict[str, Any], path: Path | None, sidecar_notes: dict[str, dict[str, Any]]) -> dict[str, Any]:
    fields = worksheet.get("fields") if isinstance(worksheet.get("fields"), list) else []
    filled = [str(field.get("id")) for field in fields if isinstance(field, dict) and field.get("status") == "filled"]
    empty = [str(field.get("id")) for field in fields if isinstance(field, dict) and field.get("status") == "empty"]
    sidecar_fields = sorted(sidecar_notes)
    effective_filled = sorted(set(filled) | set(sidecar_fields))
    still_empty = [field for field in empty if field not in sidecar_notes]
    system_checks = {
        str(field.get("id")): len(field.get("systemChecks") or [])
        for field in fields
        if isinstance(field, dict) and field.get("systemChecks")
    }
    latest_notes = {
        str(field.get("id")): {
            "status": field.get("status", ""),
            "note": field.get("note", ""),
            "latestReviewEvidence": field.get("latestReviewEvidence", {}),
            "systemCheckCount": len(field.get("systemChecks") or []),
        }
        for field in fields
        if isinstance(field, dict)
    }
    return {
        "status": "available" if worksheet else "missing",
        "jsonPath": str(path) if path else "",
        "markdownPath": worksheet.get("artifactPaths", {}).get("markdown", "") if isinstance(worksheet.get("artifactPaths"), dict) else "",
        "htmlPath": worksheet.get("artifactPaths", {}).get("html", "") if isinstance(worksheet.get("artifactPaths"), dict) else "",
        "reviewEvidenceNoteCount": worksheet.get("reviewEvidenceNoteCount", 0),
        "systemCheckNoteCount": worksheet.get("systemCheckNoteCount", 0),
        "filledFields": filled,
        "emptyFields": empty,
        "sidecarReviewNoteCount": len(sidecar_notes),
        "sidecarFields": sidecar_fields,
        "effectiveFilledFields": effective_filled,
        "needsNoteFields": still_empty,
        "latestSidecarNotesByField": sidecar_notes,
        "systemCheckFields": system_checks,
        "latestNotesByField": latest_notes,
        "truth": worksheet.get("truth", ""),
    }


def evidence_summary(packet: dict[str, Any], path: Path | None) -> dict[str, Any]:
    audio = packet.get("audioProbe") if isinstance(packet.get("audioProbe"), dict) else {}
    contact = packet.get("contactSheet") if isinstance(packet.get("contactSheet"), dict) else {}
    transcript = packet.get("transcriptDraft") if isinstance(packet.get("transcriptDraft"), dict) else {}
    return {
        "status": packet.get("status", "missing") if packet else "missing",
        "jsonPath": str(path) if path else "",
        "markdownPath": str(path.with_suffix(".md")) if path and path.with_suffix(".md").exists() else "",
        "contactFrames": contact.get("framesCreated", 0),
        "contactHtml": contact.get("htmlPath", ""),
        "audioHtml": audio.get("htmlPath", ""),
        "waveformPath": audio.get("waveformPath", ""),
        "audioWarnings": audio.get("warnings", []),
        "silenceFraction": audio.get("silenceFraction", 0),
        "longPauseCount": audio.get("longPauseCount", 0),
        "longestPauseSeconds": audio.get("longestPauseSeconds", 0),
        "transcriptStatus": transcript.get("status", "missing"),
        "transcriptJsonPath": transcript.get("jsonPath", ""),
        "captionDraftSrt": transcript.get("captionDraftSrt", ""),
        "transcriptPreview": transcript.get("textPreview", ""),
        "transcriptTruth": transcript.get("truth", ""),
        "missingEvidence": packet.get("missingEvidence", []),
        "truth": packet.get("truth", {}),
    }


def next_handoff(root: Path, refresh: bool, limit: int, include_warnings: bool) -> dict[str, Any]:
    module = load_handoff_module()
    return module.build_payload(
        root=root,
        batch_path=None,
        refresh=refresh,
        limit=limit,
        include_warnings=include_warnings,
    )


def build_payload(root: Path, short_id: str, refresh: bool, limit: int, include_warnings: bool) -> dict[str, Any]:
    handoff = next_handoff(root, refresh=refresh, limit=limit, include_warnings=include_warnings)
    handoff_short = handoff.get("short") if isinstance(handoff.get("short"), dict) else {}
    target_id = short_id or str(handoff_short.get("id") or "")
    ledger, ledger_path = load_decision_ledger(root)
    item = ledger_item(ledger, target_id) if target_id else {}
    worksheet, worksheet_path = latest_worksheet(root, target_id) if target_id else ({}, None)
    sidecar_notes = latest_sidecar_notes(root, target_id) if target_id else {}
    evidence, evidence_path = latest_evidence_packet(root, target_id) if target_id else ({}, None)
    target_short = handoff_short if str(handoff_short.get("id") or "") == target_id else {}
    if not target_short and item:
        target_short = {
            "id": item.get("shortId", target_id),
            "episode": item.get("episode", ""),
            "version": item.get("version", ""),
            "title": item.get("title", target_id),
            "path": item.get("path", ""),
            "durationLabel": item.get("durationLabel", ""),
            "durationSeconds": item.get("durationSeconds"),
            "aspect": item.get("aspect", ""),
            "width": item.get("width", 0),
            "height": item.get("height", 0),
            "hasAudio": bool(item.get("hasAudio")),
            "hasVideo": bool(item.get("hasVideo")),
            "status": item.get("decision", "pending"),
            "reviewSource": item.get("reviewSource", ""),
        }
    truth = {
        "externalPublishing": False,
        "externalUpload": False,
        "externalSchedulesCreated": False,
        "approvalCreated": False,
        "receiptTruthCreated": False,
        "accountMutation": False,
        "sourceFilesMutated": False,
        "versionsOverwritten": False,
        "filesDeleted": False,
        "description": "Readback only. It gathers local review state and creates no decision, approval, upload, schedule, account mutation, source-media mutation, overwrite, delete, or receipt truth.",
    }
    status = "studio-short-review-readback-ready" if target_id else "studio-short-review-readback-needs-short"
    commands = handoff.get("commands") if isinstance(handoff.get("commands"), dict) else {}
    return {
        "schema": "quipsly.studio.short-review-readback.v1",
        "status": status,
        "generatedAt": utc_now(),
        "root": str(root),
        "shortId": target_id,
        "short": target_short,
        "latestDecision": item.get("decision", "pending") if item else "pending",
        "decisionSummary": {
            "status": item.get("status", "missing") if item else "missing",
            "decision": item.get("decision", "pending") if item else "pending",
            "reviewer": item.get("reviewer", "") if item else "",
            "reviewedAt": item.get("reviewedAt") or item.get("createdAt") or "",
            "notes": item.get("notes") or item.get("note") or "",
            "source": "studio-short-review-decision-ledger" if item else "none",
        },
        "isCurrentRankedNext": bool(target_id and str(handoff_short.get("id") or "") == target_id),
        "currentRankedNext": handoff_short,
        "ledger": {
            "status": "available" if ledger else "missing",
            "jsonPath": str(ledger_path) if ledger_path else "",
            "counts": ledger_counts(ledger),
            "item": item,
        },
        "evidence": evidence_summary(evidence, evidence_path),
        "worksheet": worksheet_summary(worksheet, worksheet_path, sidecar_notes),
        "nextSafestAction": choose_next_action(item, worksheet, evidence),
        "commands": {
            "createEvidencePacket": "./script/agentctl.sh studio-next-short-review-evidence-save",
            "createWorksheet": f"./script/agentctl.sh studio-shorts-cut-quality-worksheet --short-id {target_id}" if target_id else "",
            "openShort": commands.get("openShort", ""),
            "dryRunKeep": commands.get("dryRunKeep", ""),
            "dryRunRefine": commands.get("dryRunRefine", ""),
            "dryRunHold": commands.get("dryRunHold", ""),
            "dryRunReject": commands.get("dryRunReject", ""),
            "recordNeedsMoreEvidence": commands.get("recordNeedsMoreEvidence", ""),
        },
        "truth": truth,
    }


def choose_next_action(item: dict[str, Any], worksheet: dict[str, Any], evidence: dict[str, Any]) -> str:
    decision = str(item.get("decision") or "pending")
    if not item:
        return "Build or refresh the local shorts review ledger, then rerun readback."
    if not evidence:
        return "Create an evidence packet, then inspect contact frames and audio probe before recording intent."
    if not worksheet:
        return "Create a cut-quality worksheet so review evidence has a shared shape."
    if decision == "pending":
        return "Inspect/listen, write specific worksheet notes, then record local review intent."
    if decision == "needs-more-evidence":
        return "Resolve the missing listen/watch evidence before promoting to keep/refine/reject."
    if decision == "refine":
        return "Create a refined version or mark the exact trim/crop/caption/audio fix needed."
    if decision == "keep":
        return "Treat as locally promising only; still needs human/platform approval before publishing."
    if decision == "hold":
        return "Clear the named hold condition or keep progressing on another short."
    if decision == "reject":
        return "Leave rejected unless a new version or stronger source evidence appears."
    return "Continue local review; do not treat this as publication truth."


def render_markdown(payload: dict[str, Any]) -> str:
    short = payload.get("short") if isinstance(payload.get("short"), dict) else {}
    ledger = payload.get("ledger") if isinstance(payload.get("ledger"), dict) else {}
    evidence = payload.get("evidence") if isinstance(payload.get("evidence"), dict) else {}
    worksheet = payload.get("worksheet") if isinstance(payload.get("worksheet"), dict) else {}
    commands = payload.get("commands") if isinstance(payload.get("commands"), dict) else {}
    counts = ledger.get("counts") if isinstance(ledger.get("counts"), dict) else {}
    lines = [
        "# Studio short review readback",
        "",
        "A compact local readback for one short. This is state visibility, not approval or publication.",
        "",
        f"- Generated: `{payload.get('generatedAt', '')}`",
        f"- Status: `{payload.get('status', '')}`",
        f"- Short: `{payload.get('shortId', '')}`",
        f"- Current ranked next: `{payload.get('isCurrentRankedNext')}`",
        f"- Truth: {payload.get('truth', {}).get('description', '') if isinstance(payload.get('truth'), dict) else ''}",
        "",
        "## Short",
        "",
        f"- Title: {short.get('humanTitle') or short.get('title', '')}",
        f"- Episode/version: `{short.get('episode', '')}` / `{short.get('version', '')}`",
        f"- File: `{short.get('path', '')}`",
        f"- Duration: `{short.get('durationLabel') or short.get('durationSeconds', '')}`",
        f"- Shape: `{short.get('aspect', '')}` `{short.get('width', '')}x{short.get('height', '')}`",
        f"- Audio/video: `{short.get('hasAudio')}` / `{short.get('hasVideo')}`",
        f"- Local decision: `{(ledger.get('item') or {}).get('decision', 'pending')}`",
        "",
        "## Evidence",
        "",
        f"- Evidence packet: `{evidence.get('jsonPath', '')}`",
        f"- Contact sheet: `{evidence.get('contactHtml', '')}`",
        f"- Frames: `{evidence.get('contactFrames', 0)}`",
        f"- Audio probe: `{evidence.get('audioHtml', '')}`",
        f"- Audio warnings: {', '.join(evidence.get('audioWarnings') or []) or 'none'}",
        f"- Silence fraction: `{evidence.get('silenceFraction', 0)}`",
        f"- Long pauses: `{evidence.get('longPauseCount', 0)}`",
        f"- Transcript draft: `{evidence.get('transcriptStatus', 'missing')}` `{evidence.get('transcriptJsonPath', '')}`",
        f"- Caption draft: `{evidence.get('captionDraftSrt', '')}`",
        f"- Transcript preview: {evidence.get('transcriptPreview', '')[:280] or 'none'}",
        "",
        "## Worksheet",
        "",
        f"- Worksheet: `{worksheet.get('jsonPath', '')}`",
        f"- Review evidence notes: `{worksheet.get('reviewEvidenceNoteCount', 0)}`",
        f"- Sidecar review notes: `{worksheet.get('sidecarReviewNoteCount', 0)}`",
        f"- System-check notes: `{worksheet.get('systemCheckNoteCount', 0)}`",
        f"- Filled fields: {', '.join(worksheet.get('filledFields') or []) or 'none'}",
        f"- Effective filled fields: {', '.join(worksheet.get('effectiveFilledFields') or []) or 'none'}",
        f"- Empty fields: {', '.join(worksheet.get('emptyFields') or []) or 'none'}",
        f"- Still needs notes: {', '.join(worksheet.get('needsNoteFields') or []) or 'none'}",
        f"- System-check fields: {json.dumps(worksheet.get('systemCheckFields') or {}, sort_keys=True)}",
        "",
        "## Ledger counts",
        "",
    ]
    for key in ("items", "decisionsRecorded", "pending", "keep", "refine", "hold", "reject", "needsMoreEvidence"):
        if key in counts:
            lines.append(f"- {key}: `{counts.get(key)}`")
    lines.extend([
        "",
        "## Next safest action",
        "",
        payload.get("nextSafestAction", ""),
        "",
        "## Commands",
        "",
    ])
    for key, value in commands.items():
        if value:
            lines.append(f"- {key}: `{value}`")
    lines.append("")
    return "\n".join(lines)


def default_output_dir(root: Path) -> Path:
    if root.exists():
        return root / "review-board" / "short-review-readbacks"
    return Path.home() / "Desktop" / "Quipsly_Short_Review_Readbacks"


def save_payload(payload: dict[str, Any], output_dir: Path, basename: str | None) -> dict[str, str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    stem = basename or f"{stamp()}-{payload.get('shortId') or 'short'}-review-readback"
    json_path = output_dir / f"{stem}.json"
    markdown_path = output_dir / f"{stem}.md"
    write_json(json_path, payload)
    markdown_path.write_text(render_markdown(payload), encoding="utf-8")
    return {"jsonPath": str(json_path), "markdownPath": str(markdown_path)}


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a concise local readback for a Studio short review target.")
    parser.add_argument("root", nargs="?", default=str(DEFAULT_RELEASE_ROOT))
    parser.add_argument("--short-id", default="")
    parser.add_argument("--refresh-batch", action="store_true")
    parser.add_argument("--limit", type=int, default=12)
    parser.add_argument("--include-warnings", action="store_true")
    parser.add_argument("--output-dir", default="")
    parser.add_argument("--basename", default="")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--markdown", action="store_true")
    parser.add_argument("--save", action="store_true")
    args = parser.parse_args()

    root = Path(args.root)
    payload = build_payload(
        root=root,
        short_id=args.short_id,
        refresh=args.refresh_batch,
        limit=args.limit,
        include_warnings=args.include_warnings,
    )
    if args.save:
        output_dir = Path(args.output_dir) if args.output_dir else default_output_dir(root)
        paths = save_payload(payload, output_dir=output_dir, basename=args.basename or None)
        print(json.dumps({"status": payload.get("status"), **paths}, indent=2, sort_keys=True))
        return 0
    if args.json and not args.markdown:
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        print(render_markdown(payload))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
