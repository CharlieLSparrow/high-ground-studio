#!/usr/bin/env python3
"""Create a symptom-first speaker cleanup triage board for an audio baseline.

This is a human/agent review surface for deciding whether speaker-aware cleanup
sounds natural enough. It joins the existing speaker cleanup decision matrix,
proof pack, preservation pack, and notes inbox status into one pass/fail board.
It does not render audio, approve audio, unlock branches, upload, publish, or
mutate original media.
"""

from __future__ import annotations

import argparse
import html
import json
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
    raise FileNotFoundError(f"Could not find baseline manifest under {input_path}")


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
            "notesTemplate",
            "notesTemplatePath",
            "playlistPath",
            "versionedPath",
        ):
            subvalue = value.get(key)
            if isinstance(subvalue, str) and subvalue:
                return subvalue
    return None


def load_output_report(outputs: dict[str, Any], key: str) -> tuple[dict[str, Any], str | None]:
    path = output_path(outputs.get(key))
    if not path:
        return {}, None
    report_path = Path(path)
    if not report_path.exists() or report_path.suffix.lower() != ".json":
        return {}, path
    try:
        return read_json(report_path), path
    except json.JSONDecodeError:
        return {}, path


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def float_value(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def int_value(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def bool_value(value: Any) -> bool:
    return bool(value)


def format_time(seconds: Any) -> str:
    total = max(0, int(round(float_value(seconds))))
    h, rem = divmod(total, 3600)
    m, s = divmod(rem, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def relative_or_path(path: Any, root: Path) -> str:
    if not path:
        return ""
    try:
        return str(Path(str(path)).resolve().relative_to(root))
    except Exception:
        return str(path)


def snippet_exists(snippet: dict[str, Any]) -> bool:
    path = snippet.get("path")
    return bool(path and Path(str(path)).exists())


def choose_snippet(snippets: list[dict[str, Any]], *roles: str) -> dict[str, Any] | None:
    role_set = {role.lower() for role in roles}
    for snippet in snippets:
        role = str(snippet.get("role") or snippet.get("label") or "").lower()
        label = str(snippet.get("label") or "").lower()
        if role in role_set or any(token in role or token in label for token in role_set):
            return snippet
    return None


def classify_row(row: dict[str, Any]) -> dict[str, Any]:
    flags = [str(flag) for flag in row.get("flags") or []]
    family = str(row.get("family") or "speaker cleanup")
    reason = str(row.get("reason") or "Speaker-aware cleanup review window")
    priority = int_value(row.get("priority"), 2)
    lower = " ".join(flags + [family, reason]).lower()
    if "overgate" in lower or "loss" in lower or "chopped" in lower:
        symptom = "speaker-preservation"
        reviewer_prompt = "Does the cleaned/mastered voice still sound like a whole human, with natural starts, breaths, laughs, and reactions intact?"
        failure_prompt = "Fail if words, breath, laughter, or emotional reaction sounds clipped, gated, or unnaturally flattened."
    elif "bleed" in lower or "echo" in lower:
        symptom = "bleed-or-echo"
        reviewer_prompt = "Is the non-speaking mic quiet enough without making the active speaker feel hollow, phasey, or overprocessed?"
        failure_prompt = "Fail if echo, bleed, or phase smear distracts from the active speaker."
    elif "noise" in lower or "park" in lower:
        symptom = "environment-noise"
        reviewer_prompt = "Does the cleanup tame background noise while preserving speech body and room believability?"
        failure_prompt = "Fail if noise steals attention or cleanup leaves watery/robotic artifacts."
    else:
        symptom = "general-naturalness"
        reviewer_prompt = "Does this moment sound production-ready without calling attention to cleanup?"
        failure_prompt = "Fail if the audio feels visibly processed, thin, abrupt, or emotionally wrong."
    return {
        "symptom": symptom,
        "priority": priority,
        "reviewerPrompt": reviewer_prompt,
        "failurePrompt": failure_prompt,
    }


def build_board(manifest: dict[str, Any], baseline_dir: Path, generated_at: str) -> dict[str, Any]:
    outputs = manifest.get("outputs") or {}
    matrix, matrix_path = load_output_report(outputs, "latestSpeakerCleanupDecisionMatrix")
    proof_pack, proof_pack_path = load_output_report(outputs, "latestSpeakerCleanupProofPack")
    proof_pack_audit, proof_pack_audit_path = load_output_report(outputs, "latestSpeakerCleanupProofPackAudit")
    preservation_pack, preservation_pack_path = load_output_report(outputs, "latestAudioSpeakerPreservationProofPack")
    notes_inbox, notes_inbox_path = load_output_report(outputs, "latestSpeakerCleanupListenMapNotesInbox")
    preservation_notes, preservation_notes_path = load_output_report(outputs, "latestAudioSpeakerPreservationProofNotesInbox")

    rows = matrix.get("rows") if isinstance(matrix.get("rows"), list) else []
    proof_windows = proof_pack.get("windows") if isinstance(proof_pack.get("windows"), list) else []
    proof_by_index = {int_value(window.get("index")): window for window in proof_windows}

    missing_evidence = []
    for label, report, path in [
        ("speaker cleanup decision matrix", matrix, matrix_path),
        ("speaker cleanup proof pack", proof_pack, proof_pack_path),
        ("speaker cleanup proof pack audit", proof_pack_audit, proof_pack_audit_path),
        ("speaker preservation proof pack", preservation_pack, preservation_pack_path),
    ]:
        if not report:
            missing_evidence.append({"label": label, "path": path or "not registered"})

    triage_rows: list[dict[str, Any]] = []
    missing_snippet_count = 0
    must_listen_count = 0
    for row in rows:
        index = int_value(row.get("index"), len(triage_rows) + 1)
        proof_window = proof_by_index.get(index) or {}
        snippets = row.get("snippets") if isinstance(row.get("snippets"), list) else []
        if not snippets and isinstance(proof_window.get("snippets"), list):
            snippets = proof_window.get("snippets") or []
        clean_snippets = []
        for snippet in snippets:
            if not isinstance(snippet, dict):
                continue
            exists = snippet_exists(snippet)
            if not exists:
                missing_snippet_count += 1
            clean_snippets.append(
                {
                    "label": snippet.get("label") or snippet.get("role") or "snippet",
                    "role": snippet.get("role") or "unknown",
                    "purpose": snippet.get("purpose") or "",
                    "path": snippet.get("path") or "",
                    "relativePath": relative_or_path(snippet.get("path"), baseline_dir),
                    "exists": exists,
                    "durationSeconds": float_value(snippet.get("durationSeconds") or snippet.get("duration")),
                }
            )
        master = choose_snippet(clean_snippets, "master")
        charlie_raw = choose_snippet(clean_snippets, "charlie-aligned", "charlie raw", "charlie")
        charlie_clean = choose_snippet(clean_snippets, "charlie-contribution")
        homer_raw = choose_snippet(clean_snippets, "homer-aligned", "homer raw", "homer")
        homer_clean = choose_snippet(clean_snippets, "homer-contribution")
        classification = classify_row(row)
        priority = int_value(row.get("priority"), classification["priority"])
        must_listen = priority >= 4 or classification["symptom"] in {"speaker-preservation", "bleed-or-echo"}
        if must_listen:
            must_listen_count += 1
        triage_rows.append(
            {
                "index": index,
                "timecode": row.get("timecode") or format_time(row.get("start")),
                "start": float_value(row.get("start")),
                "end": float_value(row.get("end")),
                "durationSeconds": float_value(row.get("durationSeconds") or (float_value(row.get("end")) - float_value(row.get("start")))),
                "priority": priority,
                "mustListen": must_listen,
                "symptom": classification["symptom"],
                "reason": row.get("reason") or "Speaker-aware cleanup review window",
                "flags": row.get("flags") or [],
                "reviewerPrompt": classification["reviewerPrompt"],
                "passBar": row.get("passBar") or "Sounds natural and production-ready.",
                "failurePrompt": classification["failurePrompt"],
                "failBar": row.get("failBar") or "Sounds chopped, echo-heavy, noisy, or processed enough to distract.",
                "safeActionIfFails": (row.get("safeActionsIfFails") or ["Create a scoped v007 proof-window repair candidate, preserving v006."])[0],
                "listenOrder": [item for item in [master, charlie_raw, charlie_clean, homer_raw, homer_clean] if item],
                "snippets": clean_snippets,
                "relatedContributionMarkers": row.get("relatedContributionMarkers") or [],
                "relatedPreservationItems": row.get("relatedPreservationItems") or [],
                "humanDecision": "pending-human-listen",
            }
        )

    triage_rows.sort(key=lambda item: (-int_value(item.get("priority")), float_value(item.get("start"))))
    minimum_path = [row["index"] for row in triage_rows if row.get("mustListen")]
    if len(minimum_path) < min(6, len(triage_rows)):
        for row in triage_rows:
            if row["index"] not in minimum_path:
                minimum_path.append(row["index"])
            if len(minimum_path) >= min(6, len(triage_rows)):
                break

    status = "ready-for-human-triage" if not missing_evidence and missing_snippet_count == 0 and rows else "needs-artifact-repair"
    return {
        "schema": "quipsly.audio-workbench.speaker-cleanup-triage-board.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": manifest.get("baselineId"),
        "status": status,
        "approvalStatus": manifest.get("approvalStatus"),
        "packageReadyForHumanListen": bool_value(manifest.get("packageReadyForHumanListen")),
        "branchInheritanceReady": bool_value(manifest.get("branchInheritanceReady")),
        "branchRenderReady": bool_value(manifest.get("branchRenderReady")),
        "windowCount": len(triage_rows),
        "mustListenCount": must_listen_count,
        "minimumListenPath": minimum_path,
        "missingEvidence": missing_evidence,
        "missingEvidenceCount": len(missing_evidence),
        "missingSnippetCount": missing_snippet_count,
        "proofPackAuditPassed": bool_value(proof_pack_audit.get("passed")),
        "proofPackAuditErrorCount": int_value(proof_pack_audit.get("errorCount")),
        "proofPackAuditWarningCount": int_value(proof_pack_audit.get("warningCount")),
        "cleanupNotesInboxCandidateCount": int_value(notes_inbox.get("matchingCandidateCount")),
        "preservationNotesInboxCandidateCount": int_value(preservation_notes.get("matchingCandidateCount")),
        "sourceArtifacts": {
            "decisionMatrix": matrix_path,
            "proofPack": proof_pack_path,
            "proofPackAudit": proof_pack_audit_path,
            "preservationPack": preservation_pack_path,
            "cleanupNotesInbox": notes_inbox_path,
            "preservationNotesInbox": preservation_notes_path,
        },
        "rows": triage_rows,
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
    }


def render_markdown(board: dict[str, Any]) -> str:
    lines = [
        f"# Speaker Cleanup Triage Board: {board['baselineId']}",
        "",
        f"Generated: `{board['generatedAt']}`",
        "",
        "This is the symptom-first review board for deciding whether the v006 speaker cleanup sounds natural enough. It does not approve audio, unlock branches, render media, upload, publish, or mutate original media.",
        "",
        "## State",
        "",
        f"- Status: `{board['status']}`",
        f"- Approval status: `{board['approvalStatus']}`",
        f"- Package ready for human listen: `{str(board['packageReadyForHumanListen']).lower()}`",
        f"- Branch inheritance ready: `{str(board['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(board['branchRenderReady']).lower()}`",
        f"- Windows: `{board['windowCount']}`",
        f"- Must-listen windows: `{board['mustListenCount']}`",
        f"- Missing snippets: `{board['missingSnippetCount']}`",
        f"- Missing evidence: `{board['missingEvidenceCount']}`",
        "",
        "## Minimum listen path",
        "",
        ", ".join(str(item) for item in board.get("minimumListenPath") or []) or "No path available.",
        "",
        "## Triage rows",
        "",
        "| # | Time | Priority | Symptom | Decision question | Safe action if fail |",
        "|---:|---|---:|---|---|---|",
    ]
    for row in board.get("rows") or []:
        lines.append(
            "| "
            + " | ".join(
                [
                    str(row.get("index")),
                    str(row.get("timecode")),
                    str(row.get("priority")),
                    str(row.get("symptom")),
                    str(row.get("reviewerPrompt")),
                    str(row.get("safeActionIfFails")),
                ]
            )
            + " |"
        )
    lines.extend(["", "## Safety", "", "- Approval state changed: `false`", "- Branch state changed: `false`", "- Render attempted: `false`", "- Upload attempted: `false`", "- Publication attempted: `false`", "- Original media mutated: `false`", ""])
    return "\n".join(lines)


def audio_tag(snippet: dict[str, Any]) -> str:
    path = snippet.get("path")
    if not path:
        return "<span class='missing'>missing path</span>"
    rel = html.escape(str(snippet.get("relativePath") or path))
    escaped = html.escape(str(path), quote=True)
    if not snippet.get("exists"):
        return f"<span class='missing'>{rel}</span>"
    return f"<audio controls preload='none' src='file://{escaped}'></audio><div class='path'>{rel}</div>"


def render_html(board: dict[str, Any]) -> str:
    cards = []
    path_set = set(board.get("minimumListenPath") or [])
    for row in board.get("rows") or []:
        cls = "must" if row.get("mustListen") else "normal"
        badge = "MUST LISTEN" if row.get("index") in path_set else "review"
        snippets = "".join(
            f"<div class='snippet'><strong>{html.escape(str(item.get('label')))}</strong><small>{html.escape(str(item.get('purpose') or item.get('role') or ''))}</small>{audio_tag(item)}</div>"
            for item in row.get("listenOrder") or row.get("snippets") or []
        )
        flags = " ".join(f"<span>{html.escape(str(flag))}</span>" for flag in row.get("flags") or [])
        cards.append(
            f"""
<section class='row {cls}'>
  <div class='rowHead'>
    <div><b>#{row.get('index')} · {html.escape(str(row.get('timecode')))}</b><p>{html.escape(str(row.get('reason')))}</p></div>
    <div class='badge'>{badge}</div>
  </div>
  <div class='flags'>{flags}</div>
  <div class='prompts'>
    <div><h3>Pass question</h3><p>{html.escape(str(row.get('reviewerPrompt')))}</p><p><b>Pass:</b> {html.escape(str(row.get('passBar')))}</p></div>
    <div><h3>Fail line</h3><p>{html.escape(str(row.get('failurePrompt')))}</p><p><b>If fail:</b> {html.escape(str(row.get('safeActionIfFails')))}</p></div>
  </div>
  <div class='snippets'>{snippets}</div>
</section>
"""
        )
    return f"""<!doctype html>
<html lang='en'>
<head>
<meta charset='utf-8' />
<title>Speaker Cleanup Triage Board</title>
<style>
:root {{ color-scheme: dark; --bg:#121711; --card:#1b241a; --ink:#f7efd9; --muted:#b9aa8b; --gold:#f3c94a; --green:#80df9f; --red:#ff7b72; --line:rgba(247,239,217,.14); }}
body {{ margin: 0; padding: 28px; background: radial-gradient(circle at top left, #26341f, var(--bg) 42%); color: var(--ink); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }}
h1 {{ margin: 0 0 6px; font-size: 34px; }}
p {{ color: var(--muted); line-height: 1.45; }}
.hero, .row {{ border: 1px solid var(--line); border-radius: 22px; background: rgba(27,36,26,.86); box-shadow: 0 18px 60px rgba(0,0,0,.28); }}
.hero {{ padding: 22px; margin-bottom: 18px; }}
.stats {{ display: flex; gap: 10px; flex-wrap: wrap; margin-top: 16px; }}
.stat {{ padding: 10px 12px; background: rgba(255,255,255,.055); border-radius: 14px; border: 1px solid var(--line); }}
.stat b {{ display: block; color: var(--gold); font-size: 18px; }}
.row {{ padding: 18px; margin: 14px 0; }}
.row.must {{ border-color: rgba(243,201,74,.42); }}
.rowHead {{ display: flex; justify-content: space-between; gap: 18px; align-items: start; }}
.rowHead b {{ font-size: 18px; }}
.badge {{ color: #1b1400; background: var(--gold); border-radius: 999px; padding: 7px 10px; font-size: 12px; font-weight: 800; letter-spacing: .08em; }}
.flags span {{ display: inline-block; margin: 0 6px 6px 0; padding: 5px 8px; background: rgba(128,223,159,.12); color: var(--green); border-radius: 999px; font-size: 12px; }}
.prompts {{ display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }}
.prompts > div {{ background: rgba(255,255,255,.04); border: 1px solid var(--line); border-radius: 16px; padding: 12px; }}
h3 {{ margin: 0 0 5px; font-size: 13px; color: var(--gold); text-transform: uppercase; letter-spacing: .08em; }}
.snippets {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; margin-top: 14px; }}
.snippet {{ border: 1px solid var(--line); border-radius: 16px; padding: 10px; background: rgba(0,0,0,.18); }}
.snippet small {{ display: block; color: var(--muted); margin: 4px 0 8px; }}
audio {{ width: 100%; }}
.path {{ color: var(--muted); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; overflow-wrap: anywhere; margin-top: 5px; }}
.missing {{ color: var(--red); }}
@media (max-width: 850px) {{ .prompts {{ grid-template-columns: 1fr; }} body {{ padding: 14px; }} }}
</style>
</head>
<body>
<section class='hero'>
  <h1>Speaker Cleanup Triage Board</h1>
  <p>Symptom-first pass/fail surface for v006. Listen for natural voices, missing reactions, echo/bleed, and cleanup artifacts. This page does not approve, render, upload, publish, or mutate source media.</p>
  <div class='stats'>
    <div class='stat'><b>{html.escape(str(board['status']))}</b>Status</div>
    <div class='stat'><b>{board['windowCount']}</b>Windows</div>
    <div class='stat'><b>{board['mustListenCount']}</b>Must listen</div>
    <div class='stat'><b>{board['missingSnippetCount']}</b>Missing snippets</div>
    <div class='stat'><b>{html.escape(str(board['approvalStatus']))}</b>Approval</div>
    <div class='stat'><b>{str(board['branchInheritanceReady']).lower()}</b>Branch inheritance</div>
  </div>
</section>
{''.join(cards)}
</body>
</html>
"""


def build_notes_template(board: dict[str, Any]) -> dict[str, Any]:
    return {
        "schema": "quipsly.audio-workbench.speaker-cleanup-triage-notes.v1",
        "baselineId": board.get("baselineId"),
        "createdAt": board.get("generatedAt"),
        "reviewer": "",
        "overallDecision": "pending",  # pass | needs-scoped-v007-repair | needs-more-proof
        "notes": "",
        "rows": [
            {
                "index": row.get("index"),
                "timecode": row.get("timecode"),
                "decision": "pending",  # pass | fail | unsure
                "symptomHeard": "",
                "repairRequest": "",
            }
            for row in board.get("rows") or []
        ],
    }


def write_open_command(path: Path, html_path: Path, md_path: Path) -> None:
    path.write_text(
        "#!/usr/bin/env bash\n"
        "set -euo pipefail\n"
        f"open {shell_quote(str(html_path))}\n"
        f"open {shell_quote(str(md_path))}\n",
        encoding="utf-8",
    )
    path.chmod(0o755)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest_before = read_json(manifest_path)
    baseline_id = str(manifest_before.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")

    board = build_board(manifest_before, baseline_dir, generated_at)
    notes_template = build_notes_template(board)
    output_dir = baseline_dir / f"speaker-cleanup-triage-board-{slug}-{generated_at}"
    output_dir.mkdir(parents=True, exist_ok=True)

    versioned_json = output_dir / "speaker-cleanup-triage-board.json"
    versioned_md = output_dir / "speaker-cleanup-triage-board.md"
    versioned_html = output_dir / "speaker-cleanup-triage-board.html"
    versioned_notes = output_dir / "speaker-cleanup-triage-notes-template.json"
    versioned_open = output_dir / "open-speaker-cleanup-triage-board.command"
    stable_json = baseline_dir / "SPEAKER_CLEANUP_TRIAGE_BOARD.json"
    stable_md = baseline_dir / "SPEAKER_CLEANUP_TRIAGE_BOARD.md"
    stable_html = baseline_dir / "SPEAKER_CLEANUP_TRIAGE_BOARD.html"
    stable_notes = baseline_dir / "SPEAKER_CLEANUP_TRIAGE_NOTES_TEMPLATE.json"
    stable_open = baseline_dir / "OPEN_SPEAKER_CLEANUP_TRIAGE_BOARD.command"

    markdown = render_markdown(board)
    html_doc = render_html(board)
    for path, payload in ((versioned_json, board), (stable_json, board), (versioned_notes, notes_template), (stable_notes, notes_template)):
        write_json(path, payload)
    for path in (versioned_md, stable_md):
        path.write_text(markdown, encoding="utf-8")
    for path in (versioned_html, stable_html):
        path.write_text(html_doc, encoding="utf-8")
    write_open_command(versioned_open, versioned_html, versioned_md)
    write_open_command(stable_open, stable_html, stable_md)

    manifest_after = read_json(manifest_path)
    outputs = manifest_after.setdefault("outputs", {})
    entry = {
        "path": str(stable_json),
        "jsonPath": str(stable_json),
        "markdownPath": str(stable_md),
        "htmlPath": str(stable_html),
        "notesTemplatePath": str(stable_notes),
        "openCommand": str(stable_open),
        "versionedPath": str(versioned_json),
        "versionedJsonPath": str(versioned_json),
        "versionedMarkdownPath": str(versioned_md),
        "versionedHtmlPath": str(versioned_html),
        "versionedNotesTemplatePath": str(versioned_notes),
        "versionedOpenCommand": str(versioned_open),
        "generatedAt": generated_at,
        "schema": board["schema"],
        "status": board["status"],
        "windowCount": board["windowCount"],
        "mustListenCount": board["mustListenCount"],
        "minimumListenPath": board["minimumListenPath"],
        "missingSnippetCount": board["missingSnippetCount"],
        "missingEvidenceCount": board["missingEvidenceCount"],
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
    }
    history = outputs.setdefault("speakerCleanupTriageBoards", [])
    history.append(entry)
    outputs["latestSpeakerCleanupTriageBoard"] = entry
    outputs["latestSpeakerCleanupTriageBoardMarkdown"] = str(stable_md)
    outputs["latestSpeakerCleanupTriageBoardHtml"] = str(stable_html)
    outputs["latestSpeakerCleanupTriageBoardNotesTemplate"] = str(stable_notes)
    outputs["latestSpeakerCleanupTriageBoardOpenCommand"] = str(stable_open)
    manifest_after["speakerCleanupTriageBoardCount"] = len(history)
    manifest_after["speakerCleanupTriageBoardLatestStatus"] = board["status"]
    manifest_after["speakerCleanupTriageBoardWindowCount"] = board["windowCount"]
    manifest_after["speakerCleanupTriageBoardMustListenCount"] = board["mustListenCount"]
    manifest_after["speakerCleanupTriageBoardMissingSnippetCount"] = board["missingSnippetCount"]
    manifest_after["speakerCleanupTriageBoardMissingEvidenceCount"] = board["missingEvidenceCount"]
    manifest_after["speakerCleanupTriageBoardMinimumListenPath"] = board["minimumListenPath"]
    manifest_after["speakerCleanupTriageBoardLatestMarkdown"] = str(stable_md)
    manifest_after["speakerCleanupTriageBoardOriginalMediaMutated"] = False
    manifest_after["speakerCleanupTriageBoardApprovalStateChanged"] = False
    manifest_after["speakerCleanupTriageBoardBranchStateChanged"] = False
    manifest_after["speakerCleanupTriageBoardRenderAttempted"] = False
    manifest_after["speakerCleanupTriageBoardUploadAttempted"] = False
    manifest_after["speakerCleanupTriageBoardPublicationAttempted"] = False
    write_json(manifest_path, manifest_after)
    print(json.dumps(entry, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
