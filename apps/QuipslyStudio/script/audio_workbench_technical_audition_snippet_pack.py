#!/usr/bin/env python3
"""Render playable snippets for the technical audition audit.

The technical audition audit identifies broad sections that deserve ears. This
script turns those sections into short derived M4A clips and a local HTML review
surface. It does not approve audio, unlock branches, publish, upload, or mutate
source media.
"""

from __future__ import annotations

import argparse
import html
import json
import math
import os
import shutil
import stat
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SCRIPT_VERSION = "2026-07-11.technical-audition-snippets-v001"
OUTPUT_STEM = "AUDIO_TECHNICAL_AUDITION_SNIPPET_PACK"


def utc_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def safe_slug(value: Any) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "item"


def value_path(value: Any) -> str | None:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        for key in ("path", "m4aPath", "audioPath", "wavPath", "htmlPath", "markdownPath"):
            candidate = value.get(key)
            if isinstance(candidate, str) and candidate:
                return candidate
    return None


def output_path(outputs: dict[str, Any], *keys: str) -> Path | None:
    for key in keys:
        candidate = value_path(outputs.get(key))
        if candidate:
            path = Path(candidate).expanduser()
            if path.exists():
                return path
    return None


def file_uri(path: Path | None) -> str:
    if path is None:
        return ""
    return path.expanduser().resolve().as_uri()


def escape(value: Any) -> str:
    return html.escape(str(value if value is not None else ""), quote=True)


def seconds_label(seconds: float) -> str:
    seconds = max(0.0, seconds)
    whole = int(seconds)
    h = whole // 3600
    m = (whole % 3600) // 60
    s = whole % 60
    if h:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"


def float_value(value: Any, default: float = 0.0) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    if math.isnan(number) or math.isinf(number):
        return default
    return number


def run_capture(command: list[str], timeout: int = 180) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, text=True, capture_output=True, check=False, timeout=timeout)


def render_snippet(source: Path, output: Path, start: float, duration: float, ffmpeg: str) -> dict[str, Any]:
    command = [
        ffmpeg,
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        f"{start:.3f}",
        "-i",
        str(source),
        "-t",
        f"{duration:.3f}",
        "-vn",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-movflags",
        "+faststart",
        str(output),
    ]
    try:
        result = run_capture(command)
    except subprocess.TimeoutExpired as exc:
        return {"ok": False, "command": command, "returncode": None, "stderrTail": f"ffmpeg timed out: {exc}"}
    return {
        "ok": result.returncode == 0 and output.exists() and output.stat().st_size > 0,
        "command": command,
        "returncode": result.returncode,
        "stderrTail": result.stderr[-2000:],
    }


def choose_source(manifest: dict[str, Any], baseline_dir: Path) -> Path:
    outputs = manifest.get("outputs")
    if not isinstance(outputs, dict):
        outputs = {}
    source = output_path(outputs, "masterM4a", "latestMasterM4a", "listeningM4a", "masterWav")
    if source:
        return source
    for name in ("episode4-mastered-audio-spine-v006.m4a", "episode4-mastered-audio-spine-v006.wav"):
        candidate = baseline_dir / name
        if candidate.exists():
            return candidate
    raise SystemExit("No readable master M4A/WAV source found for snippet rendering.")


def choose_audit(manifest: dict[str, Any], baseline_dir: Path) -> Path:
    outputs = manifest.get("outputs")
    if not isinstance(outputs, dict):
        outputs = {}
    audit = output_path(outputs, "latestAudioTechnicalAuditionAuditJson", "latestAudioTechnicalAuditionAudit")
    if audit:
        return audit
    candidate = baseline_dir / "AUDIO_TECHNICAL_AUDITION_AUDIT.json"
    if candidate.exists():
        return candidate
    raise SystemExit("No technical audition audit JSON found. Run audio_workbench_technical_audition_audit.py first.")


def build_items(audit: dict[str, Any], source_duration: float, max_items: int, clip_seconds: float) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for index, moment in enumerate((audit.get("listenMoments") or [])[:max_items], start=1):
        start = float_value(moment.get("startSeconds"))
        end = float_value(moment.get("endSeconds"), start + 60.0)
        section_duration = max(1.0, end - start)
        duration = min(clip_seconds, section_duration)
        if "long quiet" in " ".join(moment.get("reasons") or []).lower():
            clip_start = start
        else:
            center = start + section_duration / 2.0
            clip_start = max(0.0, center - duration / 2.0)
        if source_duration:
            clip_start = min(max(0.0, clip_start), max(0.0, source_duration - duration))
            duration = min(duration, max(0.5, source_duration - clip_start))
        item_id = f"tech-audition-{index:02d}-{safe_slug(seconds_label(start))}-{safe_slug(seconds_label(end))}"
        reasons = [str(reason) for reason in (moment.get("reasons") or [])]
        items.append(
            {
                "id": item_id,
                "index": index,
                "title": f"{seconds_label(start)}-{seconds_label(end)}",
                "startSeconds": round(clip_start, 3),
                "durationSeconds": round(duration, 3),
                "sectionStartSeconds": round(start, 3),
                "sectionEndSeconds": round(end, 3),
                "riskScore": moment.get("riskScore"),
                "reasons": reasons,
                "listenQuestions": [
                    "Does this section sound natural enough to inherit into edit branches?",
                    "Is either speaker unintentionally lost, dulled, or over-gated?",
                    "Does the room/noise floor feel calm instead of distractingly chopped?",
                ],
                "suggestedNextAction": "Pass if it sounds natural. If not, record the exact timestamp and route a scoped v007 repair at the owning stage.",
            }
        )
    return items


def markdown_report(report: dict[str, Any]) -> str:
    lines = [
        "# Audio Technical Audition Snippet Pack",
        "",
        f"- Status: `{report['status']}`",
        f"- Baseline: `{report['baselineId']}`",
        f"- Source: `{report['sourceAudioPath']}`",
        f"- Snippets: `{report['snippetCount']}`",
        f"- Render failures: `{report['renderFailureCount']}`",
        "",
        "This pack makes the technical audition map playable. It is derived review media only; it does not approve the spine or unlock branch rendering.",
        "",
        "| Clip | Time | Risk | Reasons | File |",
        "| --- | --- | ---: | --- | --- |",
    ]
    for item in report["items"]:
        reasons = "; ".join(item["reasons"])
        lines.append(
            f"| {item['index']} | {item['title']} | {item.get('riskScore') or 0} | {reasons} | `{item.get('snippetPath') or 'missing'}` |"
        )
    lines.append("")
    return "\n".join(lines)


def html_report(report: dict[str, Any], json_path: Path, markdown_path: Path) -> str:
    rows: list[str] = []
    for item in report["items"]:
        questions = "".join(f"<li>{escape(q)}</li>" for q in item["listenQuestions"])
        reasons = "; ".join(item["reasons"]) or "check"
        player = ""
        snippet_path = Path(item["snippetPath"]) if item.get("snippetPath") else None
        if item.get("renderOk") and snippet_path and snippet_path.exists():
            player = f'<audio controls preload="metadata" src="{escape(file_uri(snippet_path))}"></audio>'
        else:
            player = f'<p class="bad">Snippet render failed: {escape(item.get("renderError") or "unknown")}</p>'
        rows.append(
            f"""
            <article class="clip" data-review-item data-id="{escape(item['id'])}" data-title="{escape(item['title'])}">
              <header>
                <div>
                  <div class="eyebrow">Clip {escape(item['index'])}</div>
                  <h2>{escape(item['title'])}</h2>
                </div>
                <span class="risk">Risk {escape(item.get('riskScore') or 0)}</span>
              </header>
              {player}
              <p><strong>Reasons:</strong> {escape(reasons)}</p>
              <ul>{questions}</ul>
              <div class="review-box">
                <label>Decision
                  <select data-decision>
                    <option value="unreviewed">Unreviewed</option>
                    <option value="pass">Pass</option>
                    <option value="needs-proof">Needs focused proof</option>
                    <option value="needs-repair">Needs repair</option>
                  </select>
                </label>
                <label>Notes
                  <textarea data-notes placeholder="What did you hear? Be specific about timestamp, speaker, noise, echo, gating, or cadence."></textarea>
                </label>
              </div>
              <p class="next">{escape(item['suggestedNextAction'])}</p>
            </article>
            """
        )
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Audio Technical Audition Snippet Pack</title>
  <style>
    :root {{
      color-scheme: dark;
      --bg: #101915;
      --panel: #1a271f;
      --panel2: #223329;
      --ink: #f8f0dc;
      --muted: #b8ac91;
      --gold: #f2c14e;
      --moss: #81c784;
      --clay: #d36f52;
      --line: rgba(248,240,220,.16);
    }}
    body {{
      margin: 0;
      background:
        radial-gradient(circle at 10% -10%, rgba(129,199,132,.16), transparent 34rem),
        radial-gradient(circle at 95% 0%, rgba(242,193,78,.14), transparent 28rem),
        var(--bg);
      color: var(--ink);
      font: 15px/1.5 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }}
    main {{ max-width: 1180px; margin: 0 auto; padding: 44px 28px 72px; }}
    h1, h2 {{ font-family: Georgia, "Times New Roman", serif; letter-spacing: -.03em; }}
    h1 {{ font-size: clamp(34px, 5vw, 64px); line-height: .95; margin: 0 0 16px; }}
    h2 {{ margin: 0; font-size: 24px; }}
    .hero, .clip {{
      background: linear-gradient(145deg, rgba(34,51,41,.95), rgba(26,39,31,.95));
      border: 1px solid var(--line);
      border-radius: 28px;
      box-shadow: 0 24px 70px rgba(0,0,0,.26);
    }}
    .hero {{ padding: 32px; margin-bottom: 22px; }}
    .clip {{ padding: 22px; margin: 16px 0; }}
    .clip header {{ display: flex; justify-content: space-between; gap: 16px; align-items: start; }}
    .eyebrow {{ color: var(--gold); font-weight: 900; letter-spacing: .22em; text-transform: uppercase; font-size: 12px; }}
    .muted {{ color: var(--muted); }}
    .risk {{ background: rgba(242,193,78,.16); color: var(--gold); border: 1px solid rgba(242,193,78,.25); padding: 8px 12px; border-radius: 999px; font-weight: 900; white-space: nowrap; }}
    audio {{ display: block; width: 100%; margin: 16px 0; }}
    .next {{ color: var(--moss); font-weight: 800; }}
    .bad {{ color: var(--clay); font-weight: 800; }}
    .review-box {{
      display: grid;
      grid-template-columns: minmax(180px, 260px) minmax(280px, 1fr);
      gap: 14px;
      margin-top: 16px;
      padding: 16px;
      background: rgba(16,25,21,.62);
      border: 1px solid var(--line);
      border-radius: 18px;
    }}
    label {{ color: var(--muted); font-weight: 800; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; }}
    select, textarea, button {{
      width: 100%;
      box-sizing: border-box;
      margin-top: 8px;
      border: 1px solid var(--line);
      border-radius: 12px;
      background: rgba(10,15,13,.86);
      color: var(--ink);
      padding: 10px 12px;
      font: inherit;
    }}
    textarea {{ min-height: 86px; resize: vertical; }}
    button {{ width: auto; cursor: pointer; background: rgba(242,193,78,.18); color: var(--gold); font-weight: 900; }}
    a {{ color: var(--gold); }}
    code {{ color: #d4f2c4; }}
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <div class="eyebrow">Quipsly Audio Workbench</div>
      <h1>Technical audition snippets</h1>
      <p class="muted">These clips are derived from the technical audition map so a reviewer can listen to the highest-risk sections quickly. They are review media, not approval.</p>
      <p>Status: <code>{escape(report['status'])}</code> · Baseline: <code>{escape(report['baselineId'])}</code> · Snippets: <code>{escape(report['snippetCount'])}</code> · Failures: <code>{escape(report['renderFailureCount'])}</code></p>
      <p><button type="button" onclick="downloadNotes()">Export technical audition notes JSON</button></p>
      <p><a href="{escape(json_path.name)}">JSON</a> · <a href="{escape(markdown_path.name)}">Markdown</a></p>
    </section>
    {''.join(rows)}
  </main>
  <script>
    const BASELINE_ID = {json.dumps(report['baselineId'])};
    const CREATED_FROM = {json.dumps(str(json_path))};
    function downloadNotes() {{
      const items = Array.from(document.querySelectorAll("[data-review-item]")).map((node) => {{
        return {{
          id: node.dataset.id,
          title: node.dataset.title,
          decision: node.querySelector("[data-decision]").value,
          notes: node.querySelector("[data-notes]").value.trim()
        }};
      }});
      const payload = {{
        schema: "quipsly.audio-workbench.technical-audition-snippet-notes.v1",
        baselineId: BASELINE_ID,
        createdFrom: CREATED_FROM,
        exportedAt: new Date().toISOString(),
        items
      }};
      const blob = new Blob([JSON.stringify(payload, null, 2) + "\\n"], {{ type: "application/json" }});
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `technical-audition-notes-${{BASELINE_ID}}-${{new Date().toISOString().replace(/[:.]/g, "-")}}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    }}
  </script>
</body>
</html>
"""


def notes_template(report: dict[str, Any]) -> dict[str, Any]:
    return {
        "schema": "quipsly.audio-workbench.technical-audition-snippet-notes.v1",
        "baselineId": report["baselineId"],
        "createdFrom": report["jsonPath"],
        "instructions": "Mark each snippet pass, needs-proof, or needs-repair. This template does not approve audio by itself.",
        "items": [
            {
                "id": item["id"],
                "title": item["title"],
                "decision": "undecided",
                "notes": "",
                "repairTarget": "",
            }
            for item in report["items"]
        ],
    }


def write_open_command(path: Path, target: Path) -> None:
    path.write_text(f'#!/bin/zsh\nopen "{target}"\n', encoding="utf-8")
    path.chmod(path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def register_outputs(manifest_path: Path, report: dict[str, Any], paths: dict[str, Path]) -> None:
    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    record = {
        "status": report["status"],
        "generatedAt": report["generatedAt"],
        "scriptVersion": SCRIPT_VERSION,
        "baselineId": report["baselineId"],
        "jsonPath": str(paths["json"]),
        "markdownPath": str(paths["markdown"]),
        "htmlPath": str(paths["html"]),
        "openCommandPath": str(paths["openCommand"]),
        "notesTemplatePath": str(paths["notesTemplate"]),
        "sourceAudioPath": report["sourceAudioPath"],
        "snippetCount": report["snippetCount"],
        "itemCount": report["itemCount"],
        "windowCount": report["windowCount"],
        "variantCount": report["variantCount"],
        "renderedItemCount": report["renderedItemCount"],
        "missingSnippetCount": report["missingSnippetCount"],
        "renderFailureCount": report["renderFailureCount"],
        "derivedReviewMediaRendered": report["derivedReviewMediaRendered"],
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "branchRenderAttempted": False,
        "derivedReviewRenderAttempted": True,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
    }
    outputs["latestAudioTechnicalAuditionSnippetPack"] = record
    outputs["latestAudioTechnicalAuditionSnippetPackJson"] = str(paths["json"])
    outputs["latestAudioTechnicalAuditionSnippetPackMarkdown"] = str(paths["markdown"])
    outputs["latestAudioTechnicalAuditionSnippetPackHtml"] = str(paths["html"])
    outputs["latestAudioTechnicalAuditionSnippetPackOpenCommand"] = str(paths["openCommand"])
    outputs["latestAudioTechnicalAuditionSnippetPackNotesTemplate"] = str(paths["notesTemplate"])
    outputs["audioTechnicalAuditionSnippetPackLatestStatus"] = report["status"]
    outputs["audioTechnicalAuditionSnippetPackSnippetCount"] = report["snippetCount"]
    outputs["audioTechnicalAuditionSnippetPackRenderFailureCount"] = report["renderFailureCount"]
    outputs["audioTechnicalAuditionSnippetPackCount"] = int(outputs.get("audioTechnicalAuditionSnippetPackCount") or 0) + 1
    history = outputs.setdefault("audioTechnicalAuditionSnippetPacks", [])
    history.append(record)

    manifest["audioTechnicalAuditionSnippetPackLatestStatus"] = report["status"]
    manifest["audioTechnicalAuditionSnippetPackSnippetCount"] = report["snippetCount"]
    manifest["audioTechnicalAuditionSnippetPackItemCount"] = report["itemCount"]
    manifest["audioTechnicalAuditionSnippetPackWindowCount"] = report["windowCount"]
    manifest["audioTechnicalAuditionSnippetPackVariantCount"] = report["variantCount"]
    manifest["audioTechnicalAuditionSnippetPackRenderedItemCount"] = report["renderedItemCount"]
    manifest["audioTechnicalAuditionSnippetPackMissingSnippetCount"] = report["missingSnippetCount"]
    manifest["audioTechnicalAuditionSnippetPackRenderFailureCount"] = report["renderFailureCount"]
    manifest["audioTechnicalAuditionSnippetPackDerivedReviewMediaRendered"] = report["derivedReviewMediaRendered"]
    manifest["audioTechnicalAuditionSnippetPackCount"] = len(history)
    manifest["audioTechnicalAuditionSnippetPackApprovalStateChanged"] = False
    manifest["audioTechnicalAuditionSnippetPackBranchStateChanged"] = False
    manifest["audioTechnicalAuditionSnippetPackRenderAttempted"] = False
    manifest["audioTechnicalAuditionSnippetPackBranchRenderAttempted"] = False
    manifest["audioTechnicalAuditionSnippetPackDerivedReviewRenderAttempted"] = True
    manifest["audioTechnicalAuditionSnippetPackUploadAttempted"] = False
    manifest["audioTechnicalAuditionSnippetPackPublicationAttempted"] = False
    manifest["audioTechnicalAuditionSnippetPackOriginalMediaMutated"] = False
    write_json(manifest_path, manifest)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True)
    parser.add_argument("--max-items", type=int, default=12)
    parser.add_argument("--clip-seconds", type=float, default=45.0)
    parser.add_argument("--ffmpeg", default=None)
    args = parser.parse_args()

    baseline_dir = Path(args.baseline_dir).expanduser().resolve()
    manifest_path = baseline_dir / "manifest.json"
    if not manifest_path.exists():
        raise SystemExit(f"Missing manifest: {manifest_path}")

    manifest = read_json(manifest_path)
    outputs = manifest.get("outputs") if isinstance(manifest.get("outputs"), dict) else {}
    source_audio = choose_source(manifest, baseline_dir)
    audit_path = choose_audit(manifest, baseline_dir)
    audit = read_json(audit_path)
    source_duration = float_value((audit.get("audio") or {}).get("durationSeconds"))
    baseline_id = str(manifest.get("baselineId") or audit.get("baselineId") or baseline_dir.name)
    ffmpeg = args.ffmpeg or shutil.which("ffmpeg") or "ffmpeg"

    timestamp = utc_stamp()
    version_dir = baseline_dir / f"audio-technical-audition-snippet-pack-{safe_slug(baseline_id)}-{timestamp}"
    snippets_dir = version_dir / "snippets"
    snippets_dir.mkdir(parents=True, exist_ok=True)

    items = build_items(audit, source_duration, args.max_items, args.clip_seconds)
    render_failures = 0
    for item in items:
        snippet_path = snippets_dir / f"{item['id']}.m4a"
        render = render_snippet(source_audio, snippet_path, item["startSeconds"], item["durationSeconds"], ffmpeg)
        item["snippetPath"] = str(snippet_path)
        item["renderOk"] = bool(render.get("ok"))
        item["renderReturncode"] = render.get("returncode")
        item["renderError"] = render.get("stderrTail")
        if not item["renderOk"]:
            render_failures += 1

    status = "ready-for-human-technical-audition-snippets" if render_failures == 0 and items else "needs-snippet-render-attention"
    report: dict[str, Any] = {
        "schema": "quipsly.audio-workbench.technical-audition-snippet-pack.v1",
        "status": status,
        "generatedAt": utc_now(),
        "scriptVersion": SCRIPT_VERSION,
        "baselineId": baseline_id,
        "baselineDir": str(baseline_dir),
        "sourceAuditPath": str(audit_path),
        "sourceAudioPath": str(source_audio),
        "snippetCount": len(items),
        "itemCount": len(items),
        "windowCount": len(items),
        "variantCount": 1,
        "renderedItemCount": len(items) - render_failures,
        "missingSnippetCount": render_failures,
        "renderFailureCount": render_failures,
        "derivedReviewMediaRendered": bool(items) and render_failures == 0,
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "branchRenderAttempted": False,
        "derivedReviewRenderAttempted": True,
        "renderScope": "derived-review-snippets-only",
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
        "safety": {
            "approvalStateChanged": False,
            "branchStateChanged": False,
            "renderAttempted": False,
            "branchRenderAttempted": False,
            "derivedReviewRenderAttempted": True,
            "uploadAttempted": False,
            "publicationAttempted": False,
            "originalMediaMutated": False,
        },
        "items": items,
    }

    version_paths = {
        "json": version_dir / "technical-audition-snippet-pack.json",
        "markdown": version_dir / "technical-audition-snippet-pack.md",
        "html": version_dir / "technical-audition-snippet-pack.html",
        "notesTemplate": version_dir / "technical-audition-snippet-notes-template.json",
        "openCommand": version_dir / "open-technical-audition-snippet-pack.command",
    }
    stable_paths = {
        "json": baseline_dir / f"{OUTPUT_STEM}.json",
        "markdown": baseline_dir / f"{OUTPUT_STEM}.md",
        "html": baseline_dir / f"{OUTPUT_STEM}.html",
        "notesTemplate": baseline_dir / f"{OUTPUT_STEM}_NOTES_TEMPLATE.json",
        "openCommand": baseline_dir / f"OPEN_{OUTPUT_STEM}.command",
    }

    report["jsonPath"] = str(version_paths["json"])
    write_json(version_paths["json"], report)
    version_paths["markdown"].write_text(markdown_report(report), encoding="utf-8")
    version_paths["html"].write_text(html_report(report, version_paths["json"], version_paths["markdown"]), encoding="utf-8")
    write_json(version_paths["notesTemplate"], notes_template(report))
    write_open_command(version_paths["openCommand"], version_paths["html"])

    for key in ("json", "markdown", "html", "notesTemplate"):
        shutil.copyfile(version_paths[key], stable_paths[key])
    write_open_command(stable_paths["openCommand"], stable_paths["html"])
    register_outputs(manifest_path, report, stable_paths)

    print(json.dumps({
        "status": status,
        "baselineId": baseline_id,
        "snippetCount": len(items),
        "renderFailureCount": render_failures,
        "html": str(stable_paths["html"]),
    }, indent=2))


if __name__ == "__main__":
    main()
