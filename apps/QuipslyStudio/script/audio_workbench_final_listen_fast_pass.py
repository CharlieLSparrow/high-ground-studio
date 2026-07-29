#!/usr/bin/env python3
"""Build a compact final-listen fast-pass surface for an audio baseline.

This is intentionally not an approval mechanism. It collects the highest-value
existing review evidence into one short jump-listen route with structured notes
export. A human can use it to focus the final listen, then the notes inbox and
post-review action queue decide the next safe action.
"""

from __future__ import annotations

import argparse
import html
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote

SCHEMA = "quipsly.audio.final-listen-fast-pass.v1"
NOTES_SCHEMA = "quipsly.audio.final-listen-fast-pass-notes.v1"


@dataclass
class FastPassItem:
    item_id: str
    title: str
    time_sec: float
    timecode: str
    category: str
    severity: str
    reason: str
    questions: list[str] = field(default_factory=list)
    source_tags: list[str] = field(default_factory=list)
    safe_actions_if_fails: list[str] = field(default_factory=list)
    source_artifacts: list[str] = field(default_factory=list)
    merged_from: list[str] = field(default_factory=list)


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
        for key in ("path", "markdownPath", "htmlPath", "openCommand", "json", "html", "markdown"):
            path = value.get(key)
            if isinstance(path, str) and path:
                return path
    if isinstance(value, list) and value:
        return output_path(value[-1])
    return None


def load_report(outputs: dict[str, Any], key: str) -> dict[str, Any]:
    path = output_path(outputs.get(key))
    if not path:
        return {}
    try:
        return read_json(Path(path))
    except Exception:
        return {}


def safe_slug(value: str) -> str:
    out = "".join(ch if ch.isalnum() or ch in "-_" else "-" for ch in value.lower())
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def seconds_to_timecode(seconds: float) -> str:
    seconds = max(0.0, float(seconds))
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = seconds % 60
    if hours:
        return f"{hours:02d}:{minutes:02d}:{secs:06.3f}"
    return f"{minutes:02d}:{secs:06.3f}"


def coerce_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def extend_unique(target: list[str], values: list[Any]) -> None:
    for value in values:
        text = str(value).strip()
        if text and text not in target:
            target.append(text)


def item_dict(item: FastPassItem) -> dict[str, Any]:
    return {
        "itemId": item.item_id,
        "title": item.title,
        "timeSec": round(item.time_sec, 3),
        "timecode": item.timecode,
        "category": item.category,
        "severity": item.severity,
        "reason": item.reason,
        "questions": item.questions,
        "sourceTags": item.source_tags,
        "safeActionsIfFails": item.safe_actions_if_fails,
        "sourceArtifacts": item.source_artifacts,
        "mergedFrom": item.merged_from,
    }


def merge_or_add(items: list[FastPassItem], item: FastPassItem, within_seconds: float = 4.0) -> None:
    for existing in items:
        if abs(existing.time_sec - item.time_sec) <= within_seconds:
            existing.title = existing.title if len(existing.title) <= len(item.title) else item.title
            existing.reason = existing.reason + " " + item.reason if item.reason not in existing.reason else existing.reason
            extend_unique(existing.questions, item.questions)
            extend_unique(existing.source_tags, item.source_tags)
            extend_unique(existing.safe_actions_if_fails, item.safe_actions_if_fails)
            extend_unique(existing.source_artifacts, item.source_artifacts)
            extend_unique(existing.merged_from, item.merged_from or [item.category])
            if existing.severity != "high" and item.severity == "high":
                existing.severity = "high"
            return
    items.append(item)


def gather_items(outputs: dict[str, Any], limit: int) -> tuple[list[FastPassItem], dict[str, Any]]:
    items: list[FastPassItem] = []
    source_counts: dict[str, int] = {}

    queue = load_report(outputs, "latestAudioListenPriorityQueue")
    for index, row in enumerate(as_list(queue.get("queue"))[:8], start=1):
        time_sec = coerce_float(row.get("timeSec"))
        source_counts["listenPriority"] = source_counts.get("listenPriority", 0) + 1
        merge_or_add(
            items,
            FastPassItem(
                item_id=f"listen-priority-{index:02d}",
                title=str(row.get("title") or f"Listen priority {index}"),
                time_sec=time_sec,
                timecode=str(row.get("time") or seconds_to_timecode(time_sec)),
                category="listen-priority",
                severity="high" if int(row.get("riskPriority") or row.get("priority") or 99) <= 5 else "medium",
                reason="; ".join(str(reason) for reason in as_list(row.get("reasons"))[:3]),
                questions=[str(q) for q in as_list(row.get("listenQuestions"))[:3]],
                source_tags=[str(tag) for tag in as_list(row.get("classifications")) + as_list(row.get("sources"))],
                safe_actions_if_fails=[str(a) for a in as_list(row.get("safeActionsIfFails"))[:3]],
                source_artifacts=[str(a) for a in as_list(row.get("relatedArtifacts"))[:3]],
                merged_from=["listen-priority queue"],
            ),
        )

    producer = load_report(outputs, "latestAudioProducerGradeAudit")
    producer_rows = as_list(producer.get("producerListenMoments"))
    high_rows = [row for row in producer_rows if str(row.get("severity") or "").lower() == "high"]
    for index, row in enumerate((high_rows or producer_rows)[:7], start=1):
        time_sec = coerce_float(row.get("timeSec"))
        source_counts["producerGrade"] = source_counts.get("producerGrade", 0) + 1
        merge_or_add(
            items,
            FastPassItem(
                item_id=f"producer-grade-{index:02d}",
                title=str(row.get("label") or f"Producer check {index}"),
                time_sec=time_sec,
                timecode=str(row.get("time") or seconds_to_timecode(time_sec)),
                category="producer-grade",
                severity=str(row.get("severity") or "medium").lower(),
                reason=str(row.get("reason") or ""),
                questions=["Does this moment sound emotionally natural and publishable?"],
                source_tags=[str(row.get("source") or "producer-grade audit")],
                safe_actions_if_fails=["Export a note and route it through the post-review action queue before any repair render."],
                merged_from=["producer-grade audit"],
            ),
        )

    cleanup = load_report(outputs, "latestSpeakerCleanupListenMap")
    for index, row in enumerate(as_list(cleanup.get("rows"))[:6], start=1):
        time_sec = coerce_float(row.get("start") or row.get("clipStart"))
        source_counts["speakerCleanup"] = source_counts.get("speakerCleanup", 0) + 1
        merge_or_add(
            items,
            FastPassItem(
                item_id=f"speaker-cleanup-{index:02d}",
                title=f"{row.get('family') or 'Speaker cleanup'} at {row.get('timecode') or seconds_to_timecode(time_sec)}",
                time_sec=time_sec,
                timecode=str(row.get("timecode") or seconds_to_timecode(time_sec)),
                category="speaker-cleanup",
                severity="high",
                reason=str(row.get("reason") or ""),
                questions=[str(q) for q in as_list(row.get("questions"))[:3]],
                source_tags=[str(tag) for tag in as_list(row.get("flags"))],
                safe_actions_if_fails=[str(a) for a in as_list(row.get("safeActionsIfFails"))[:3]],
                merged_from=["speaker cleanup listen map"],
            ),
        )

    preservation = load_report(outputs, "latestAudioSpeakerPreservationProofPack")
    for index, row in enumerate(as_list(preservation.get("items"))[:8], start=1):
        time_sec = coerce_float(row.get("windowStart") or row.get("markerStart"))
        source_counts["speakerPreservation"] = source_counts.get("speakerPreservation", 0) + 1
        merge_or_add(
            items,
            FastPassItem(
                item_id=f"speaker-preservation-{index:02d}",
                title=str(row.get("title") or f"Speaker preservation {index}"),
                time_sec=time_sec,
                timecode=str(row.get("timecode") or seconds_to_timecode(time_sec)),
                category="speaker-preservation",
                severity="high",
                reason=str(row.get("guidance") or ""),
                questions=["Does the mastered spine preserve the speaker/reaction compared with the source clip?"],
                source_tags=[str(tag) for tag in as_list(row.get("flags")) + [row.get("speaker") or "unknown-speaker"]],
                safe_actions_if_fails=["Route exact moment to focused proof or scoped v007 repair; do not approve v006 from this finding alone."],
                source_artifacts=[str(p) for p in [row.get("masterSnippet"), row.get("sourceSnippet")] if p],
                merged_from=["speaker preservation proof pack"],
            ),
        )

    severity_order = {"high": 0, "medium": 1, "low": 2}
    items.sort(key=lambda item: (severity_order.get(item.severity, 1), item.time_sec))
    selected = items[:limit]
    selected.sort(key=lambda item: item.time_sec)
    for index, item in enumerate(selected, start=1):
        item.item_id = f"fast-pass-{index:02d}-{safe_slug(item.category)}"
    return selected, source_counts


def uri_for_path(path: str | None) -> str:
    if not path:
        return ""
    try:
        return Path(path).resolve().as_uri()
    except Exception:
        return "file://" + quote(path)


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Episode 4 Audio Final Listen Fast Pass",
        "",
        f"- Generated: `{report['generatedAt']}`",
        f"- Baseline: `{report['baselineId']}`",
        f"- Approval status: `{report['approvalStatus']}`",
        f"- Human listen still required: `{str(report['humanListenStillRequired']).lower()}`",
        f"- Item count: `{report['itemCount']}`",
        f"- Master M4A: `{report.get('masterM4a') or 'missing'}`",
        "",
        "This is a compact route through the most useful existing proof surfaces. It does not approve v006. It helps a reviewer listen quickly, export structured notes, and route those notes through the standard post-review queue.",
        "",
        "## Listen route",
        "",
        "| # | Time | Category | Severity | What to decide | Why |",
        "|---:|---|---|---|---|---|",
    ]
    for index, item in enumerate(report["items"], start=1):
        question = item["questions"][0] if item["questions"] else "Does this sound publishable?"
        lines.append(
            f"| {index} | `{item['timecode']}` | {item['category']} | `{item['severity']}` | {question} | {item['reason']} |"
        )
    lines.extend(
        [
            "",
            "## Safe handling",
            "",
            "- Pass notes become context only. They do not approve the full v006 spine.",
            "- Needs-proof notes route to focused proof work.",
            "- Needs-repair notes route to scoped v007 repair work.",
            "- Branch inheritance and branch rendering stay locked until explicit human listen approval.",
        ]
    )
    return "\n".join(lines)


def render_html(report: dict[str, Any]) -> str:
    items_json = json.dumps(report["items"])
    audio_uri = uri_for_path(report.get("masterM4a"))
    rows = []
    for index, item in enumerate(report["items"], start=1):
        questions = "<br>".join(html.escape(q) for q in item.get("questions", []))
        rows.append(
            f"""
            <article class=\"card\" data-item=\"{html.escape(item['itemId'])}\">
              <div class=\"meta\"><span>#{index}</span><span>{html.escape(item['timecode'])}</span><span>{html.escape(item['category'])}</span><span>{html.escape(item['severity'])}</span></div>
              <h2>{html.escape(item['title'])}</h2>
              <p>{html.escape(item.get('reason') or '')}</p>
              <p class=\"question\">{questions}</p>
              <button onclick=\"jumpTo({item['timeSec']:.3f})\">Jump and play</button>
              <label>Decision
                <select id=\"decision-{html.escape(item['itemId'])}\">
                  <option value=\"undecided\">undecided</option>
                  <option value=\"pass\">pass</option>
                  <option value=\"needs-proof\">needs focused proof</option>
                  <option value=\"needs-repair\">needs scoped repair</option>
                </select>
              </label>
              <textarea id=\"note-{html.escape(item['itemId'])}\" placeholder=\"What did you hear? Natural, chopped, echo-heavy, too gated, missing reaction?\"></textarea>
            </article>
            """
        )
    return f"""<!doctype html>
<html lang=\"en\">
<head>
  <meta charset=\"utf-8\" />
  <title>Episode 4 Audio Final Listen Fast Pass</title>
  <style>
    :root {{
      color-scheme: dark;
      --bg: #101812;
      --panel: #18251d;
      --ink: #f6f0dc;
      --muted: #c7bfa4;
      --gold: #e4bd3d;
      --moss: #7fac67;
      --clay: #c56f4d;
      --line: rgba(246,240,220,.16);
    }}
    body {{ margin: 0; font-family: Avenir Next, ui-sans-serif, system-ui; background: radial-gradient(circle at top left, #263920, var(--bg) 42%); color: var(--ink); }}
    header {{ position: sticky; top: 0; z-index: 2; padding: 22px 28px; background: rgba(16,24,18,.92); border-bottom: 1px solid var(--line); backdrop-filter: blur(18px); }}
    h1 {{ margin: 0 0 8px; font-size: 28px; letter-spacing: .02em; }}
    .truth {{ display: flex; flex-wrap: wrap; gap: 8px; color: var(--muted); font-size: 13px; }}
    .pill {{ border: 1px solid var(--line); border-radius: 999px; padding: 6px 10px; background: rgba(255,255,255,.04); }}
    main {{ display: grid; grid-template-columns: 360px 1fr; gap: 18px; padding: 24px; }}
    .player {{ position: sticky; top: 118px; align-self: start; background: var(--panel); border: 1px solid var(--line); border-radius: 20px; padding: 18px; box-shadow: 0 18px 70px rgba(0,0,0,.35); }}
    audio {{ width: 100%; margin: 14px 0; }}
    button {{ cursor: pointer; border: 0; color: #101812; background: var(--gold); border-radius: 999px; padding: 9px 12px; font-weight: 800; }}
    button.secondary {{ background: var(--moss); }}
    .route {{ display: grid; gap: 14px; }}
    .card {{ background: linear-gradient(135deg, rgba(255,255,255,.06), rgba(255,255,255,.025)); border: 1px solid var(--line); border-radius: 18px; padding: 16px; }}
    .meta {{ display: flex; flex-wrap: wrap; gap: 8px; color: var(--gold); text-transform: uppercase; font-size: 11px; font-weight: 900; letter-spacing: .08em; }}
    h2 {{ margin: 8px 0; font-size: 18px; }}
    p {{ color: var(--muted); line-height: 1.45; }}
    .question {{ color: #f4d86b; }}
    label {{ display: block; margin: 12px 0 6px; color: var(--muted); font-weight: 700; }}
    select, textarea {{ width: 100%; box-sizing: border-box; border-radius: 12px; border: 1px solid var(--line); background: #0d130f; color: var(--ink); padding: 10px; }}
    textarea {{ min-height: 74px; resize: vertical; }}
    .warning {{ color: #ffd39a; }}
  </style>
</head>
<body>
  <header>
    <h1>Episode 4 Audio Final Listen Fast Pass</h1>
    <div class=\"truth\">
      <span class=\"pill\">Baseline: {html.escape(report['baselineId'])}</span>
      <span class=\"pill\">Approval: {html.escape(report['approvalStatus'])}</span>
      <span class=\"pill\">Human listen required: {str(report['humanListenStillRequired']).lower()}</span>
      <span class=\"pill\">Items: {report['itemCount']}</span>
    </div>
  </header>
  <main>
    <section class=\"player\">
      <h2>One master, focused jumps</h2>
      <p>This page is a map, not a verdict. Listen, mark what you hear, export notes, then run the normal notes roundtrip.</p>
      <audio id=\"master\" controls preload=\"metadata\" src=\"{html.escape(audio_uri)}\"></audio>
      <button onclick=\"exportNotes()\">Export fast-pass notes</button>
      <button class=\"secondary\" onclick=\"markAllPass()\">Mark all pass-context</button>
      <p class=\"warning\">All-pass here does not approve v006. It only feeds the post-review action queue.</p>
    </section>
    <section class=\"route\">
      {''.join(rows)}
    </section>
  </main>
  <script>
    const items = {items_json};
    function jumpTo(seconds) {{
      const player = document.getElementById('master');
      player.currentTime = Math.max(0, seconds - 2);
      player.play();
    }}
    function markAllPass() {{
      for (const item of items) {{
        document.getElementById(`decision-${{item.itemId}}`).value = 'pass';
      }}
    }}
    function exportNotes() {{
      const notes = items.map(item => ({{
        ...item,
        decision: document.getElementById(`decision-${{item.itemId}}`).value,
        note: document.getElementById(`note-${{item.itemId}}`).value
      }}));
      const packet = {{
        schema: '{NOTES_SCHEMA}',
        baselineId: '{html.escape(report['baselineId'])}',
        exportedAt: new Date().toISOString(),
        sourceReport: '{html.escape(report['json'])}',
        notes
      }};
      const blob = new Blob([JSON.stringify(packet, null, 2)], {{ type: 'application/json' }});
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `episode-4-final-listen-fast-pass-notes-${{new Date().toISOString().replace(/[:.]/g, '-')}}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    }}
  </script>
</body>
</html>
"""


def render_notes_template(report: dict[str, Any]) -> dict[str, Any]:
    return {
        "schema": NOTES_SCHEMA,
        "baselineId": report["baselineId"],
        "exportedAt": "",
        "sourceReport": report["json"],
        "notes": [
            {
                **item,
                "decision": "undecided",
                "note": "",
            }
            for item in report["items"]
        ],
    }


def update_manifest(manifest_path: Path, report: dict[str, Any]) -> None:
    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    outputs["latestAudioFinalListenFastPass"] = report["json"]
    outputs["latestAudioFinalListenFastPassMarkdown"] = report["markdown"]
    outputs["latestAudioFinalListenFastPassHtml"] = report["html"]
    outputs["latestAudioFinalListenFastPassNotesTemplate"] = report["notesTemplate"]
    outputs["latestAudioFinalListenFastPassOpenCommand"] = report["openCommand"]
    outputs.setdefault("audioFinalListenFastPasses", []).append(report["json"])
    outputs.setdefault("audioFinalListenFastPassMarkdowns", []).append(report["markdown"])
    outputs.setdefault("audioFinalListenFastPassHtmls", []).append(report["html"])
    outputs.setdefault("audioFinalListenFastPassNotesTemplates", []).append(report["notesTemplate"])
    outputs.setdefault("audioFinalListenFastPassOpenCommands", []).append(report["openCommand"])
    manifest["latestAudioFinalListenFastPassGeneratedAt"] = report["generatedAt"]
    write_json(manifest_path, manifest)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline-dir", required=True)
    parser.add_argument("--limit", type=int, default=18)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(Path(args.baseline_dir))
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    baseline_id = str(manifest.get("baselineId") or baseline_dir.name)
    slug = safe_slug(baseline_id)
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    generated_iso = datetime.now(timezone.utc).isoformat()
    out_dir = baseline_dir / f"audio-final-listen-fast-pass-{slug}-{generated_at}"
    out_dir.mkdir(parents=True, exist_ok=True)

    items, source_counts = gather_items(outputs, args.limit)
    master_m4a = output_path(outputs.get("masterM4a"))
    master_wav = output_path(outputs.get("masterWav"))

    output_json = out_dir / "final-listen-fast-pass.json"
    output_md = out_dir / "final-listen-fast-pass.md"
    output_html = out_dir / "final-listen-fast-pass.html"
    notes_template = out_dir / "final-listen-fast-pass-notes-template.json"
    open_command = out_dir / "open-final-listen-fast-pass.command"

    report = {
        "schema": SCHEMA,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "generatedAt": generated_iso,
        "approvalStatus": manifest.get("approvalStatus"),
        "packageReadyForHumanListen": bool(manifest.get("packageReadyForHumanListen")),
        "humanListenStillRequired": manifest.get("approvalStatus") != "human-approved-for-branch-inheritance",
        "branchInheritanceReady": bool(manifest.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest.get("branchRenderReady")),
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "originalMediaMutated": False,
        "masterM4a": master_m4a,
        "masterWav": master_wav,
        "itemCount": len(items),
        "sourceCounts": source_counts,
        "items": [item_dict(item) for item in items],
        "json": str(output_json),
        "markdown": str(output_md),
        "html": str(output_html),
        "notesSchema": NOTES_SCHEMA,
        "notesTemplate": str(notes_template),
        "openCommand": str(open_command),
    }

    write_json(output_json, report)
    output_md.write_text(render_markdown(report) + "\n", encoding="utf-8")
    output_html.write_text(render_html(report), encoding="utf-8")
    write_json(notes_template, render_notes_template(report))
    open_command.write_text(f"#!/bin/zsh\nopen {str(output_html)!r}\n", encoding="utf-8")
    open_command.chmod(0o755)
    update_manifest(manifest_path, report)
    print(json.dumps({"json": str(output_json), "markdown": str(output_md), "html": str(output_html), "itemCount": len(items)}, indent=2))


if __name__ == "__main__":
    main()
