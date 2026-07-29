#!/usr/bin/env python3
"""Create or import reviewer notes for an Audio Workbench human listen.

This does not approve, fail, render, or mutate media. It gives the local HTML
reviewer console a durable manifest-backed handoff path:

- without --notes-json it writes a blank reviewer-notes template
- with --notes-json it normalizes an exported console notes JSON into a packet

The actual approval/failure state still belongs to
audio_workbench_record_listen_decision.py with typed human confirmation.
"""

from __future__ import annotations

import argparse
import html
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def load_json(path: Path | None) -> dict[str, Any]:
    if not path or not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def output_path(value: Any) -> str | None:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        path = value.get("path")
        if isinstance(path, str):
            return path
    return None


def path_from_output(outputs: dict[str, Any], key: str) -> Path | None:
    path = output_path(outputs.get(key))
    return Path(path) if path else None


def resolve_baseline_dir(input_path: Path) -> Path:
    if (input_path / "manifest.json").exists():
        return input_path
    nested = input_path / "work" / "conformed-production-baseline"
    if (nested / "manifest.json").exists():
        return nested
    raise FileNotFoundError(
        "Could not find manifest.json at "
        f"{input_path}/manifest.json or {nested}/manifest.json"
    )


def safe_slug(value: str) -> str:
    slug = "".join(ch.lower() if ch.isalnum() else "-" for ch in value)
    while "--" in slug:
        slug = slug.replace("--", "-")
    return slug.strip("-") or "audio-baseline"


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def write_open_command(path: Path, target: Path) -> None:
    path.write_text(
        "\n".join(
            [
                "#!/bin/sh",
                "set -e",
                "open " + shell_quote(str(target)),
                "",
            ]
        ),
        encoding="utf-8",
    )
    path.chmod(0o755)


def blank_fields(matrix: dict[str, Any]) -> dict[str, str]:
    fields = {"whole-episode:notes": ""}
    for window in matrix.get("reviewWindows") or []:
        label = str(window.get("label") or "")
        if not label:
            continue
        fields[f"{label}:decision"] = ""
        fields[f"{label}:notes"] = ""
    return fields


def normalize_notes_fields(notes: dict[str, Any], matrix: dict[str, Any]) -> dict[str, Any]:
    raw_fields = notes.get("fields") if isinstance(notes.get("fields"), dict) else {}
    windows = []
    pass_count = 0
    fail_count = 0
    more_proof_count = 0
    undecided_count = 0
    for window in matrix.get("reviewWindows") or []:
        label = str(window.get("label") or "")
        decision = str(raw_fields.get(f"{label}:decision") or "").strip()
        note = str(raw_fields.get(f"{label}:notes") or "").strip()
        if decision == "pass":
            pass_count += 1
        elif decision == "fail":
            fail_count += 1
        elif decision == "more-proof":
            more_proof_count += 1
        else:
            undecided_count += 1
        windows.append(
            {
                "label": label,
                "sequenceStartSeconds": window.get("sequenceStartSeconds"),
                "durationSeconds": window.get("durationSeconds"),
                "criticalListen": bool(window.get("criticalListen")),
                "decision": decision or "undecided",
                "notes": note,
            }
        )
    if fail_count:
        suggested = "failed-human-listen"
    elif more_proof_count or undecided_count:
        suggested = "needs-focused-proof"
    elif pass_count and pass_count == len(windows):
        suggested = "human-approved-for-branch-inheritance"
    else:
        suggested = "pending-human-listen"
    return {
        "wholeEpisodeNotes": str(raw_fields.get("whole-episode:notes") or "").strip(),
        "windows": windows,
        "summary": {
            "windowCount": len(windows),
            "passCount": pass_count,
            "failCount": fail_count,
            "moreProofCount": more_proof_count,
            "undecidedCount": undecided_count,
        },
        "suggestedDecisionStatus": suggested,
    }


def build_commands(baseline_dir: Path, packet_path: Path, *, mode: str) -> dict[str, str]:
    packet_arg = str(packet_path) if mode == "imported-notes" else "/path/to/imported-reviewer-notes-packet.json"
    return {
        "importExportedNotes": "\n".join(
            [
                "OUT=" + shell_quote(str(baseline_dir)),
                "python3 apps/QuipslyStudio/script/audio_workbench_reviewer_notes_packet.py \\",
                '  --baseline-dir "$OUT" \\',
                "  --notes-json " + shell_quote("/path/to/quipsly-audio-review-notes.json") + " \\",
                '  --reviewer "Charlie or Mako"',
            ]
        ),
        "reviewPacketPath": str(packet_path),
        "recordDecisionFromImportedNotesDryRun": "\n".join(
            [
                "OUT=" + shell_quote(str(baseline_dir)),
                "python3 apps/QuipslyStudio/script/audio_workbench_record_listen_decision_from_notes.py \\",
                '  --baseline-dir "$OUT" \\',
                "  --notes-packet " + shell_quote(packet_arg) + " \\",
                '  --reviewer "Charlie or Mako" \\',
                "  --dry-run",
            ]
        ),
        "recordDecisionFromImportedNotesAfterListen": "\n".join(
            [
                "OUT=" + shell_quote(str(baseline_dir)),
                "python3 apps/QuipslyStudio/script/audio_workbench_record_listen_decision_from_notes.py \\",
                '  --baseline-dir "$OUT" \\',
                "  --notes-packet " + shell_quote(packet_arg) + " \\",
                '  --reviewer "Charlie or Mako" \\',
                "  --confirm-human-listened",
            ]
        ),
        "stateChangeReminder": (
            "This packet never changes approval truth. After a real human listen, use "
            "audio_workbench_record_listen_decision_from_notes.py or audio_workbench_record_listen_decision.py "
            "with typed human confirmation to approve, fail, or request more proof."
        ),
    }


def render_markdown(packet: dict[str, Any]) -> str:
    lines = [
        f"# Reviewer notes packet: {packet['baselineId']}",
        "",
        f"- Mode: `{packet['mode']}`",
        f"- Generated: `{packet['generatedAt']}`",
        f"- Reviewer: `{packet.get('reviewer') or ''}`",
        f"- Approval status at creation: `{packet['approvalStatus']}`",
        f"- Suggested listen decision: `{packet['suggestedDecisionStatus']}`",
        f"- Approval state changed: `{str(packet['approvalStateChanged']).lower()}`",
        f"- Original media mutated: `{str(packet['originalMediaMutated']).lower()}`",
        "",
        "This packet records reviewer notes or provides a template for them. It is not approval.",
        "",
        "## Summary",
        "",
    ]
    summary = packet.get("summary") or {}
    for key in ["windowCount", "passCount", "failCount", "moreProofCount", "undecidedCount"]:
        if key in summary:
            lines.append(f"- {key}: `{summary[key]}`")
    lines.extend(["", "## Whole episode notes", "", packet.get("wholeEpisodeNotes") or "_No notes recorded._", ""])
    lines.extend(["## Proof windows", "", "| Window | Decision | Notes |", "|---|---|---|"])
    for window in packet.get("windows") or []:
        lines.append(
            f"| {window.get('label')} | {window.get('decision')} | {str(window.get('notes') or '').replace('|', '/')} |"
        )
    lines.extend(
        [
            "",
            "## Commands",
            "",
            "Import exported notes from the reviewer console:",
            "",
            "```bash",
            packet["commands"]["importExportedNotes"],
            "```",
            "",
            "Dry-run the guarded decision inferred from an imported notes packet:",
            "",
            "```bash",
            packet["commands"]["recordDecisionFromImportedNotesDryRun"],
            "```",
            "",
            "After a real listen, record the guarded decision inferred from an imported notes packet:",
            "",
            "```bash",
            packet["commands"]["recordDecisionFromImportedNotesAfterListen"],
            "```",
            "",
            packet["commands"]["stateChangeReminder"],
            "",
        ]
    )
    return "\n".join(lines)


def render_html(packet: dict[str, Any]) -> str:
    summary = packet.get("summary") or {}
    rows = []
    for window in packet.get("windows") or []:
        rows.append(
            "<tr>"
            f"<td>{html.escape(str(window.get('label') or ''))}</td>"
            f"<td><span class=\"decision\">{html.escape(str(window.get('decision') or 'undecided'))}</span></td>"
            f"<td>{html.escape(str(window.get('notes') or '')) or '<em>No notes yet.</em>'}</td>"
            "</tr>"
        )
    command_rows = []
    for label, command in [
        ("Import exported notes", packet["commands"]["importExportedNotes"]),
        ("Dry-run routed decision", packet["commands"]["recordDecisionFromImportedNotesDryRun"]),
        ("Record decision after real listen", packet["commands"]["recordDecisionFromImportedNotesAfterListen"]),
    ]:
        command_rows.append(
            f"<h3>{html.escape(label)}</h3><pre>{html.escape(command)}</pre>"
        )
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Reviewer notes packet: {html.escape(str(packet['baselineId']))}</title>
  <style>
    :root {{
      color-scheme: light dark;
      --bg: #f7f0df;
      --card: #fffaf0;
      --ink: #2f241b;
      --muted: #7b6a53;
      --line: #ddcba7;
      --accent: #8a5b25;
      --safe: #1f7a4c;
    }}
    @media (prefers-color-scheme: dark) {{
      :root {{
        --bg: #161b18;
        --card: #202821;
        --ink: #f1eadb;
        --muted: #c6b99c;
        --line: #42513f;
        --accent: #e0b15d;
        --safe: #61d394;
      }}
    }}
    body {{
      margin: 0;
      background: radial-gradient(circle at top left, rgba(138,91,37,.18), transparent 34rem), var(--bg);
      color: var(--ink);
      font: 16px/1.55 -apple-system, BlinkMacSystemFont, "Avenir Next", sans-serif;
    }}
    main {{ max-width: 1100px; margin: 0 auto; padding: 42px 24px 64px; }}
    .card {{
      background: color-mix(in srgb, var(--card) 92%, transparent);
      border: 1px solid var(--line);
      border-radius: 22px;
      padding: 24px;
      box-shadow: 0 14px 34px rgba(0,0,0,.12);
      margin: 18px 0;
    }}
    h1 {{ font-size: clamp(32px, 6vw, 58px); line-height: .98; margin: 0 0 12px; }}
    h2 {{ margin-top: 0; }}
    .kicker {{ color: var(--accent); font-weight: 800; letter-spacing: .16em; text-transform: uppercase; }}
    .truth {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }}
    .pill {{ border: 1px solid var(--line); border-radius: 999px; padding: 10px 14px; background: rgba(255,255,255,.2); }}
    .pill strong {{ display: block; font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: .08em; }}
    .safe {{ color: var(--safe); font-weight: 800; }}
    table {{ width: 100%; border-collapse: collapse; overflow: hidden; border-radius: 14px; }}
    th, td {{ border-bottom: 1px solid var(--line); padding: 11px 10px; text-align: left; vertical-align: top; }}
    th {{ color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .08em; }}
    pre {{ white-space: pre-wrap; background: rgba(0,0,0,.10); border-radius: 14px; padding: 14px; overflow-x: auto; }}
    .decision {{ font-weight: 800; color: var(--accent); }}
  </style>
</head>
<body>
  <main>
    <p class="kicker">Quipsly audio workbench</p>
    <h1>Reviewer notes packet</h1>
    <p>This is the safe human-note handoff for Episode 4 audio review. It records or imports notes; it does not approve audio, fail audio, render branches, upload, publish, or mutate source media.</p>
    <section class="card truth">
      <div class="pill"><strong>Mode</strong>{html.escape(str(packet['mode']))}</div>
      <div class="pill"><strong>Suggested decision</strong>{html.escape(str(packet['suggestedDecisionStatus']))}</div>
      <div class="pill"><strong>Approval status</strong>{html.escape(str(packet['approvalStatus']))}</div>
      <div class="pill"><strong>State changed</strong><span class="safe">{str(packet['approvalStateChanged']).lower()}</span></div>
      <div class="pill"><strong>Original media mutated</strong><span class="safe">{str(packet['originalMediaMutated']).lower()}</span></div>
    </section>
    <section class="card">
      <h2>Summary</h2>
      <div class="truth">
        <div class="pill"><strong>Windows</strong>{summary.get('windowCount', 0)}</div>
        <div class="pill"><strong>Pass</strong>{summary.get('passCount', 0)}</div>
        <div class="pill"><strong>Fail</strong>{summary.get('failCount', 0)}</div>
        <div class="pill"><strong>More proof</strong>{summary.get('moreProofCount', 0)}</div>
        <div class="pill"><strong>Undecided</strong>{summary.get('undecidedCount', 0)}</div>
      </div>
    </section>
    <section class="card">
      <h2>Whole episode notes</h2>
      <p>{html.escape(str(packet.get('wholeEpisodeNotes') or 'No notes recorded yet.'))}</p>
    </section>
    <section class="card">
      <h2>Proof windows</h2>
      <table>
        <thead><tr><th>Window</th><th>Decision</th><th>Notes</th></tr></thead>
        <tbody>{''.join(rows)}</tbody>
      </table>
    </section>
    <section class="card">
      <h2>Commands</h2>
      {''.join(command_rows)}
      <p>{html.escape(packet['commands']['stateChangeReminder'])}</p>
    </section>
  </main>
</body>
</html>
"""


def build_template_payload(
    *,
    baseline_dir: Path,
    baseline_id: str,
    manifest: dict[str, Any],
    matrix: dict[str, Any],
    output_json: Path,
) -> dict[str, Any]:
    fields = blank_fields(matrix)
    windows = [
        {
            "label": str(window.get("label") or ""),
            "sequenceStartSeconds": window.get("sequenceStartSeconds"),
            "durationSeconds": window.get("durationSeconds"),
            "criticalListen": bool(window.get("criticalListen")),
            "decision": "undecided",
            "notes": "",
        }
        for window in matrix.get("reviewWindows") or []
    ]
    return {
        "schema": "quipsly.audio-workbench.reviewer-notes-packet.v1",
        "mode": "template",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "approvalStatus": manifest.get("approvalStatus"),
        "reviewer": "",
        "consoleNotesSchema": "quipsly.audio-workbench.reviewer-console-notes.v1",
        "consoleNotesTemplate": {
            "schema": "quipsly.audio-workbench.reviewer-console-notes.v1",
            "baselineId": baseline_id,
            "savedAt": "",
            "fields": fields,
        },
        "wholeEpisodeNotes": "",
        "windows": windows,
        "summary": {
            "windowCount": len(windows),
            "passCount": 0,
            "failCount": 0,
            "moreProofCount": 0,
            "undecidedCount": len(windows),
        },
        "suggestedDecisionStatus": "pending-human-listen",
        "commands": build_commands(baseline_dir, output_json, mode="template"),
        "approvalStateChanged": False,
        "originalMediaMutated": False,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    parser.add_argument("--notes-json", type=Path)
    parser.add_argument("--reviewer", default="")
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir.expanduser()).resolve()
    manifest_path = baseline_dir / "manifest.json"
    manifest = load_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    matrix = load_json(path_from_output(outputs, "latestListenDecisionMatrix"))
    if not matrix:
        raise SystemExit("Missing latestListenDecisionMatrix. Run audio_workbench_listen_decision_matrix.py first.")

    baseline_id = str(manifest.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    mode = "imported-notes" if args.notes_json else "template"
    output_json = baseline_dir / f"audio-reviewer-notes-{mode}-{slug}-{timestamp}.json"
    output_md = baseline_dir / f"audio-reviewer-notes-{mode}-{slug}-{timestamp}.md"
    output_html = baseline_dir / f"audio-reviewer-notes-{mode}-{slug}-{timestamp}.html"
    output_open_command = baseline_dir / f"open-audio-reviewer-notes-{mode}-{slug}-{timestamp}.command"

    if args.notes_json:
        notes = load_json(args.notes_json.expanduser())
        if notes.get("baselineId") != baseline_id:
            raise SystemExit(
                f"Notes baselineId {notes.get('baselineId')} does not match current baselineId {baseline_id}"
            )
        normalized = normalize_notes_fields(notes, matrix)
        packet = {
            "schema": "quipsly.audio-workbench.reviewer-notes-packet.v1",
            "mode": mode,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "baselineDir": str(baseline_dir),
            "baselineId": baseline_id,
            "approvalStatus": manifest.get("approvalStatus"),
            "reviewer": args.reviewer,
            "sourceNotesJson": str(args.notes_json.expanduser()),
            "wholeEpisodeNotes": normalized["wholeEpisodeNotes"],
            "windows": normalized["windows"],
            "summary": normalized["summary"],
            "suggestedDecisionStatus": normalized["suggestedDecisionStatus"],
            "commands": build_commands(baseline_dir, output_json, mode=mode),
            "approvalStateChanged": False,
            "originalMediaMutated": False,
        }
    else:
        packet = build_template_payload(
            baseline_dir=baseline_dir,
            baseline_id=baseline_id,
            manifest=manifest,
            matrix=matrix,
            output_json=output_json,
        )

    write_json(output_json, packet)
    output_md.write_text(render_markdown(packet) + "\n", encoding="utf-8")
    output_html.write_text(render_html(packet), encoding="utf-8")
    write_open_command(output_open_command, output_html)

    if mode == "template":
        stable_json = baseline_dir / "REVIEWER_NOTES_TEMPLATE.json"
        stable_md = baseline_dir / "REVIEWER_NOTES_TEMPLATE.md"
        stable_html = baseline_dir / "REVIEWER_NOTES_TEMPLATE.html"
        stable_open_command = baseline_dir / "OPEN_REVIEWER_NOTES_TEMPLATE.command"
        write_json(stable_json, packet)
        stable_md.write_text(render_markdown(packet) + "\n", encoding="utf-8")
        stable_html.write_text(render_html(packet), encoding="utf-8")
        write_open_command(stable_open_command, stable_html)
        outputs["latestReviewerNotesTemplate"] = str(stable_json)
        outputs["latestReviewerNotesTemplateMarkdown"] = str(stable_md)
        outputs["latestReviewerNotesTemplateHtml"] = str(stable_html)
        outputs["latestReviewerNotesTemplateOpenCommand"] = str(stable_open_command)
        outputs["latestReviewerNotesTemplateVersioned"] = str(output_json)
        outputs["latestReviewerNotesTemplateVersionedMarkdown"] = str(output_md)
        outputs["latestReviewerNotesTemplateVersionedHtml"] = str(output_html)
        outputs["latestReviewerNotesTemplateVersionedOpenCommand"] = str(output_open_command)
        history = outputs.setdefault("reviewerNotesTemplates", [])
        manifest["reviewerNotesTemplateCount"] = len(history) + (0 if str(output_json) in history else 1)
    else:
        outputs["latestReviewerNotesPacket"] = str(output_json)
        outputs["latestReviewerNotesPacketMarkdown"] = str(output_md)
        outputs["latestReviewerNotesPacketHtml"] = str(output_html)
        outputs["latestReviewerNotesPacketOpenCommand"] = str(output_open_command)
        history = outputs.setdefault("reviewerNotesPackets", [])
        manifest["reviewerNotesPacketCount"] = len(history) + (0 if str(output_json) in history else 1)
    if str(output_json) not in history:
        history.append(str(output_json))
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    print(f"Wrote {output_md}")
    print(f"Wrote {output_html}")
    print(f"Wrote {output_json}")
    print(f"Mode: {mode}")
    print(f"Suggested decision: {packet['suggestedDecisionStatus']}")
    print("Approval state changed: false")


if __name__ == "__main__":
    main()
