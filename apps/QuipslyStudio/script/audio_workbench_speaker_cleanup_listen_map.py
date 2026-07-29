#!/usr/bin/env python3
"""Build a compact speaker-cleanup listen map for Episode audio review.

The speaker cleanup proof pack has the actual A/B audio controls. This script
turns that pack and its audit into a reviewer decision map: what to listen for,
what counts as pass/fail, and what the safest next action is. It writes review
artifacts only. It does not approve audio, fail audio, render branches, upload,
or mutate original media.
"""

from __future__ import annotations

import argparse
import html
import json
import os
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


def output_path(value: Any) -> Path | None:
    if isinstance(value, str) and value:
        return Path(value)
    if isinstance(value, dict):
        for subkey in ("path", "markdownPath", "htmlPath", "jsonPath"):
            subvalue = value.get(subkey)
            if isinstance(subvalue, str) and subvalue:
                return Path(subvalue)
    return None


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "speaker-cleanup-listen-map"


def escape(value: Any) -> str:
    return html.escape(str(value if value is not None else ""), quote=True)


def file_uri(path_text: str | None) -> str:
    if not path_text:
        return ""
    return Path(path_text).expanduser().resolve().as_uri()


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def classify_window(window: dict[str, Any]) -> dict[str, Any]:
    flags = [str(flag) for flag in window.get("flags") or []]
    questions = [str(item) for item in window.get("listenQuestions") or []]
    safe_actions = [str(item) for item in window.get("safeActionsIfFails") or []]
    lower_flags = " ".join(flags).lower()
    if "over" in lower_flags or "overgate" in lower_flags:
        family = "over-gate / chopped speech"
        pass_bar = "Speaker sounds natural; starts/ends do not feel clipped; breath/laugh/reaction survives if musically useful."
        fail_bar = "Words, breath, laugh, or reaction sounds chopped, gated too hard, or emotionally flattened."
    elif "echo" in lower_flags or "bleed" in lower_flags:
        family = "wrong-mic echo / bleed"
        pass_bar = "Primary speaker is clear and wrong-mic echo is not distracting in normal listening."
        fail_bar = "Phone/call echo, room slap, or wrong-mic bleed pulls attention away from the conversation."
    elif "noise" in lower_flags or "park" in lower_flags or "dead" in lower_flags:
        family = "outdoor noise / dead air"
        pass_bar = "Background texture feels natural or intentionally quiet; no pumping, dropouts, or dead-air shock."
        fail_bar = "Noise pumps, park texture distracts, or a quiet gap feels broken rather than edited."
    elif "overlap" in lower_flags:
        family = "natural overlap preservation"
        pass_bar = "Overlap sounds conversational; reactions survive without muddying the main speaker."
        fail_bar = "Overlap either vanishes unnaturally or becomes too muddy to follow."
    else:
        family = "general source-balance check"
        pass_bar = "The mastered spine sounds human, balanced, and intentional at this moment."
        fail_bar = "The master feels fake, hollow, too clean, too noisy, or source-confused."
    return {
        "family": family,
        "passBar": pass_bar,
        "failBar": fail_bar,
        "questions": questions or ["Does the mastered spine sound natural and production-ready here?"],
        "safeActionsIfFails": safe_actions or ["Create a scoped v007 proof-window repair candidate instead of editing v006 in place."],
    }


def build_rows(proof_pack: dict[str, Any], audit: dict[str, Any]) -> list[dict[str, Any]]:
    audit_by_index = {item.get("windowIndex"): item for item in audit.get("windowChecks") or [] if isinstance(item, dict)}
    rows = []
    for window in proof_pack.get("windows") or []:
        if not isinstance(window, dict):
            continue
        index = window.get("index")
        audit_row = audit_by_index.get(index, {})
        classification = classify_window(window)
        snippets = []
        for snippet in window.get("snippets") or []:
            if not isinstance(snippet, dict):
                continue
            snippets.append(
                {
                    "role": snippet.get("role"),
                    "label": snippet.get("label"),
                    "path": snippet.get("path"),
                    "ok": bool(snippet.get("ok")),
                    "durationSeconds": snippet.get("durationSeconds"),
                    "purpose": snippet.get("purpose"),
                }
            )
        rows.append(
            {
                "index": index,
                "timecode": window.get("timecode"),
                "start": window.get("start"),
                "end": window.get("end"),
                "clipStart": window.get("clipStart"),
                "durationSeconds": window.get("durationSeconds"),
                "reason": window.get("reason"),
                "flags": window.get("flags") or [],
                "family": classification["family"],
                "passBar": classification["passBar"],
                "failBar": classification["failBar"],
                "questions": classification["questions"],
                "safeActionsIfFails": classification["safeActionsIfFails"],
                "auditPassed": bool(audit_row.get("passed")),
                "auditErrors": audit_row.get("errors") or [],
                "auditWarnings": audit_row.get("warnings") or [],
                "snippets": snippets,
            }
        )
    return rows


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Speaker Cleanup Listen Map: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "This is the reviewer decision map for speaker-aware cleanup. Use it with the proof-pack HTML. It does not approve audio, fail audio, unlock branch inheritance, render branches, upload, or mutate original media.",
        "",
        "## Current truth",
        "",
        f"- Approval status: `{report['approvalStatus']}`",
        f"- Package ready for human listen: `{str(report['packageReadyForHumanListen']).lower()}`",
        f"- Branch inheritance ready: `{str(report['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(report['branchRenderReady']).lower()}`",
        f"- Proof pack audit passed: `{str(report['proofPackAuditPassed']).lower()}`",
        f"- Windows: `{report['windowCount']}`",
        f"- HTML map: `{report['html']}`",
        f"- Proof pack HTML: `{report['proofPackHtml']}`",
        "",
        "## How to use this",
        "",
        "1. Open the proof-pack HTML and this listen map side by side.",
        "2. For each window, compare the mastered spine against the raw aligned and gated contribution snippets.",
        "3. Mark pass only if the master sounds natural in context, not merely clean on a meter.",
        "4. If a window fails, create a scoped v007 proof-window repair candidate. Do not overwrite v006.",
        "",
        "## Windows",
        "",
        "| # | Time | Family | Audit | Pass bar | Fail bar |",
        "|---:|---|---|---:|---|---|",
    ]
    for row in report["rows"]:
        lines.append(
            f"| {row['index']} | {row.get('timecode') or ''} | {row['family']} | `{str(row['auditPassed']).lower()}` | {row['passBar']} | {row['failBar']} |"
        )
    lines.extend(["", "## Detailed checklist", ""])
    for row in report["rows"]:
        lines.extend(
            [
                f"### Window {row['index']}: {row.get('timecode') or ''}",
                "",
                f"- Reason: {row.get('reason') or 'review'}",
                f"- Family: `{row['family']}`",
                f"- Flags: `{', '.join(row.get('flags') or []) or 'none'}`",
                f"- Audit passed: `{str(row['auditPassed']).lower()}`",
                f"- Pass if: {row['passBar']}",
                f"- Fail if: {row['failBar']}",
                "- Listen questions:",
            ]
        )
        lines.extend([f"  - {question}" for question in row.get("questions") or []])
        lines.append("- Safe action if it fails:")
        lines.extend([f"  - {action}" for action in row.get("safeActionsIfFails") or []])
        lines.append("- Snippets:")
        for snippet in row.get("snippets") or []:
            lines.append(f"  - {snippet.get('label')}: `{snippet.get('path')}`")
        lines.append("")
    return "\n".join(lines)


def render_html(report: dict[str, Any]) -> str:
    cards = []
    for row in report["rows"]:
        flags = "".join(f"<span>{escape(flag)}</span>" for flag in row.get("flags") or [])
        questions = "".join(f"<li>{escape(question)}</li>" for question in row.get("questions") or [])
        actions = "".join(f"<li>{escape(action)}</li>" for action in row.get("safeActionsIfFails") or [])
        snippets = []
        for snippet in row.get("snippets") or []:
            snippets.append(
                f"""
                <details class="snippet">
                  <summary>{escape(snippet.get('label'))} <span>{'ok' if snippet.get('ok') else 'missing'}</span></summary>
                  <audio controls preload="metadata" src="{escape(file_uri(snippet.get('path')))}"></audio>
                  <p>{escape(snippet.get('purpose'))}</p>
                </details>
                """
            )
        cards.append(
            f"""
            <article class="card" data-window="{escape(row.get('index'))}">
              <header><b>Window {escape(row.get('index'))}</b><span>{escape(row.get('timecode'))}</span><span>{escape(row['family'])}</span><span>audit {escape(row['auditPassed'])}</span></header>
              <div class="flags">{flags}</div>
              <section class="decision"><div><b>Pass if</b><p>{escape(row['passBar'])}</p></div><div><b>Fail if</b><p>{escape(row['failBar'])}</p></div></section>
              <section><h3>Listen questions</h3><ul>{questions}</ul></section>
              <section><h3>Safe action if it fails</h3><ul>{actions}</ul></section>
              <section class="controls">
                <label><input type="radio" name="window-{escape(row.get('index'))}" value="pass"> Pass</label>
                <label><input type="radio" name="window-{escape(row.get('index'))}" value="needs-proof"> Needs proof</label>
                <label><input type="radio" name="window-{escape(row.get('index'))}" value="needs-repair"> Needs repair</label>
                <textarea placeholder="Reviewer note for this window"></textarea>
              </section>
              <section class="snippets"><h3>A/B snippets</h3>{''.join(snippets)}</section>
            </article>
            """
        )
    rows_json = json.dumps(
        [
            {
                "index": row["index"],
                "timecode": row.get("timecode"),
                "family": row.get("family"),
                "start": row.get("start"),
                "end": row.get("end"),
                "flags": row.get("flags"),
            }
            for row in report["rows"]
        ]
    )
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Speaker Cleanup Listen Map</title>
<style>
:root {{ --bg:#101812; --panel:#213026; --panel2:#2d3c31; --ink:#fff5dc; --muted:#cbbf9c; --gold:#f0c85a; --leaf:#94c27e; --clay:#d9785a; --sky:#79b7c8; --line:rgba(255,245,220,.16); }}
body {{ margin:0; color:var(--ink); background:radial-gradient(circle at 10% 0%, rgba(148,194,126,.24), transparent 32rem),linear-gradient(150deg,#0d1410,#1a251e 56%,#261b10); font:14px/1.45 ui-sans-serif,-apple-system,BlinkMacSystemFont,"SF Pro Text",sans-serif; }}
body > header {{ position:sticky; top:0; z-index:10; padding:1rem 1.25rem; background:rgba(16,24,18,.94); border-bottom:1px solid var(--line); backdrop-filter:blur(18px); }}
h1 {{ margin:0; color:var(--gold); font-size:1.1rem; letter-spacing:.12em; text-transform:uppercase; }}
header p {{ margin:.35rem 0 0; color:var(--muted); max-width:80rem; }}
main {{ max-width:1280px; margin:0 auto; padding:1rem; display:grid; gap:1rem; }}
.truth,.card {{ border:1px solid var(--line); background:rgba(33,48,38,.94); border-radius:1rem; box-shadow:0 20px 70px rgba(0,0,0,.35); }}
.truth {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(12rem,1fr)); gap:.65rem; padding:1rem; }}
.pill {{ background:rgba(255,245,220,.06); border:1px solid var(--line); border-radius:.85rem; padding:.65rem; }}
.pill b {{ color:var(--gold); display:block; font-size:.72rem; text-transform:uppercase; letter-spacing:.08em; }}
.card {{ padding:1rem; }}
.card header {{ display:flex; gap:.5rem; align-items:center; flex-wrap:wrap; }}
.card header b {{ color:var(--gold); }}
.card header span,.flags span {{ border:1px solid var(--line); background:rgba(255,245,220,.07); border-radius:999px; padding:.18rem .55rem; color:var(--muted); }}
.flags {{ display:flex; flex-wrap:wrap; gap:.35rem; margin:.65rem 0; }} .flags span {{ color:var(--clay); }}
.decision {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(18rem,1fr)); gap:.65rem; }}
.decision div,.snippet,.controls {{ background:rgba(0,0,0,.18); border:1px solid var(--line); border-radius:.85rem; padding:.7rem; }}
h3 {{ color:var(--gold); font-size:.78rem; letter-spacing:.08em; text-transform:uppercase; margin:.8rem 0 .3rem; }}
p,li {{ color:var(--muted); }} audio {{ width:100%; margin:.45rem 0; }}
.controls {{ display:grid; gap:.5rem; margin:.75rem 0; }}
.controls textarea {{ min-height:5rem; color:var(--ink); background:#111a14; border:1px solid var(--line); border-radius:.65rem; padding:.6rem; }}
button,a.button {{ border:1px solid var(--line); background:rgba(240,200,90,.14); color:var(--gold); border-radius:.7rem; padding:.55rem .8rem; text-decoration:none; font-weight:700; cursor:pointer; }}
.toolbar {{ display:flex; gap:.5rem; flex-wrap:wrap; }}
</style>
</head>
<body>
<header><h1>Speaker Cleanup Listen Map</h1><p>Decision map for the 15 A/B cleanup windows. This helps reviewers judge naturalness without pretending machine evidence is approval.</p></header>
<main>
<section class="truth">
  <div class="pill"><b>Baseline</b>{escape(report['baselineId'])}</div>
  <div class="pill"><b>Approval</b>{escape(report['approvalStatus'])}</div>
  <div class="pill"><b>Windows</b>{escape(report['windowCount'])}</div>
  <div class="pill"><b>Proof audit</b>{escape(report['proofPackAuditPassed'])}</div>
  <div class="pill"><b>Branch inheritance</b>{escape(report['branchInheritanceReady'])}</div>
</section>
<section class="toolbar"><a class="button" href="{escape(file_uri(report.get('proofPackHtml')))}">Open proof pack</a><button id="exportNotes">Export notes JSON</button></section>
{''.join(cards)}
</main>
<script>
const baselineId = {json.dumps(report['baselineId'])};
const rows = {rows_json};
document.getElementById('exportNotes').addEventListener('click', () => {{
  const notes = rows.map(row => {{
    const selected = document.querySelector(`input[name="window-${{row.index}}"]:checked`);
    const card = document.querySelector(`[data-window="${{row.index}}"]`);
    const note = card ? card.querySelector('textarea').value : '';
    return {{...row, decision: selected ? selected.value : 'undecided', note}};
  }});
  const payload = {{schema:'quipsly.audio.speaker-cleanup-listen-map-notes.v1', baselineId, exportedAt:new Date().toISOString(), notes}};
  const blob = new Blob([JSON.stringify(payload, null, 2)], {{type:'application/json'}});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download=`speaker-cleanup-listen-map-notes-${{baselineId}}.json`; a.click();
  URL.revokeObjectURL(url);
}});
</script>
</body>
</html>
"""


def build_open_command(html_path: Path) -> str:
    return "\n".join(["#!/bin/zsh", "set -euo pipefail", f"open {shell_quote(str(html_path))}", ""])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest_before = read_json(manifest_path)
    outputs = manifest_before.setdefault("outputs", {})
    baseline_id = str(manifest_before.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")

    proof_pack_path = output_path(outputs.get("latestSpeakerCleanupProofPack"))
    proof_pack_md = output_path(outputs.get("latestSpeakerCleanupProofPackMarkdown"))
    proof_pack_html = output_path(outputs.get("latestSpeakerCleanupProofPackHtml"))
    proof_pack_audit_path = output_path(outputs.get("latestSpeakerCleanupProofPackAudit"))
    if not proof_pack_path or not proof_pack_path.exists():
        raise FileNotFoundError("Missing latestSpeakerCleanupProofPack")
    if not proof_pack_audit_path or not proof_pack_audit_path.exists():
        raise FileNotFoundError("Missing latestSpeakerCleanupProofPackAudit")
    proof_pack = read_json(proof_pack_path)
    proof_pack_audit = read_json(proof_pack_audit_path)
    rows = build_rows(proof_pack, proof_pack_audit)

    out_dir = baseline_dir / f"speaker-cleanup-listen-map-{slug}-{generated_at}"
    out_dir.mkdir(parents=True, exist_ok=True)
    report_json = out_dir / "speaker-cleanup-listen-map.json"
    report_md = out_dir / "speaker-cleanup-listen-map.md"
    report_html = out_dir / "speaker-cleanup-listen-map.html"
    open_cmd = out_dir / "open-speaker-cleanup-listen-map.command"

    report = {
        "schema": "quipsly.audio.speaker-cleanup-listen-map.v1",
        "generatedAt": generated_at,
        "baselineId": baseline_id,
        "baselineDir": str(baseline_dir),
        "approvalStatus": manifest_before.get("approvalStatus"),
        "packageReadyForHumanListen": bool(manifest_before.get("packageReadyForHumanListen")),
        "branchInheritanceReady": bool(manifest_before.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest_before.get("branchRenderReady")),
        "proofPackAuditPassed": proof_pack_audit.get("passed") is True,
        "proofPackJson": str(proof_pack_path),
        "proofPackMarkdown": str(proof_pack_md) if proof_pack_md else None,
        "proofPackHtml": str(proof_pack_html) if proof_pack_html else None,
        "proofPackAudit": str(proof_pack_audit_path),
        "windowCount": len(rows),
        "rows": rows,
        "json": str(report_json),
        "markdown": str(report_md),
        "html": str(report_html),
        "openCommand": str(open_cmd),
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "originalMediaMutated": False,
    }
    write_json(report_json, report)
    report_md.write_text(render_markdown(report), encoding="utf-8")
    report_html.write_text(render_html(report), encoding="utf-8")
    open_cmd.write_text(build_open_command(report_html), encoding="utf-8")
    os.chmod(open_cmd, 0o755)

    manifest_after = read_json(manifest_path)
    outputs_after = manifest_after.setdefault("outputs", {})
    outputs_after["latestSpeakerCleanupListenMap"] = str(report_json)
    outputs_after["latestSpeakerCleanupListenMapMarkdown"] = str(report_md)
    outputs_after["latestSpeakerCleanupListenMapHtml"] = str(report_html)
    outputs_after["latestSpeakerCleanupListenMapOpenCommand"] = str(open_cmd)
    history = outputs_after.setdefault("speakerCleanupListenMaps", [])
    if isinstance(history, list):
        history.append(str(report_json))
    manifest_after["speakerCleanupListenMapCount"] = int(manifest_after.get("speakerCleanupListenMapCount") or 0) + 1
    manifest_after["speakerCleanupListenMapWindowCount"] = len(rows)
    manifest_after["approvalStatus"] = manifest_before.get("approvalStatus")
    manifest_after["packageReadyForHumanListen"] = bool(manifest_before.get("packageReadyForHumanListen"))
    manifest_after["branchInheritanceReady"] = bool(manifest_before.get("branchInheritanceReady"))
    manifest_after["branchRenderReady"] = bool(manifest_before.get("branchRenderReady"))
    write_json(manifest_path, manifest_after)

    print(f"Wrote {report_md}")
    print(f"windows={len(rows)} proofPackAuditPassed={proof_pack_audit.get('passed') is True}")


if __name__ == "__main__":
    main()
