#!/usr/bin/env python3
"""Create a versioned cut-quality worksheet for one recommended short.

The worksheet is a local note-taking artifact for watch/listen review. It gives
humans and agents a consistent place to capture hook, cadence, J/L cut,
jump-cut cover, reaction, caption, crop, audio, ending, platform-fit, and
tradeoff notes before any local intent is recorded.
"""
from __future__ import annotations

import argparse
import html
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from studio_short_review_ledger_fallback import fallback_workbench_for_short


DEFAULT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
DEFAULT_WORKBENCH_JSON = (
    DEFAULT_ROOT
    / "shorts-command-room"
    / "cut-quality-workbench"
    / "quipsly-studio-shorts-cut-quality-workbench.json"
)
DEFAULT_OUTPUT_ROOT = DEFAULT_ROOT / "shorts-command-room" / "cut-quality-worksheets"
SCHEMA = "quipsly.studio.shorts-cut-quality-worksheet.v1"
VERSION = "2026-07-02.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""))


def slug(value: str, fallback: str = "short") -> str:
    clean = "".join(ch.lower() if ch.isalnum() else "-" for ch in value).strip("-")
    while "--" in clean:
        clean = clean.replace("--", "-")
    return clean or fallback


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise SystemExit(
            f"Cut-quality workbench JSON not found: {path}\n"
            "Run: script/agentctl.sh studio-shorts-cut-quality-workbench --all"
        )
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise SystemExit(f"Expected JSON object: {path}")
    return data


def choose_item(items: list[dict[str, Any]], short_id: str, rank: int, readiness: str) -> dict[str, Any]:
    if short_id:
        for item in items:
            if str(item.get("shortId") or "") == short_id:
                return item
        raise SystemExit(f"Short not found in cut-quality workbench: {short_id}")
    if rank > 0:
        for item in items:
            if int(item.get("rank") or -1) == rank:
                return item
        raise SystemExit(f"Rank not found in cut-quality workbench: {rank}")
    if readiness:
        for item in items:
            if str(item.get("readinessLevel") or "") == readiness:
                return item
        raise SystemExit(f"No cut-quality item has readiness level: {readiness}")
    for level in ["watch-listen-first", "caption-timing-review", "transcript-review", "media-needs-repair"]:
        for item in items:
            if str(item.get("readinessLevel") or "") == level:
                return item
    if items:
        return items[0]
    raise SystemExit("Cut-quality workbench has no items.")


def note_command(short_id: str, field_id: str, reviewer: str) -> str:
    return (
        "script/agentctl.sh studio-shorts-cut-quality-note "
        f"--short-id {shell_quote(short_id)} "
        f"--field {field_id} "
        f"--reviewer {shell_quote(reviewer)} "
        "--note '<specific watch/listen evidence>'"
    )


def worksheet_fields(short_id: str, reviewer: str) -> list[dict[str, Any]]:
    fields = [
        ("hook", "Opening promise", "What makes a stranger keep watching in the first 1-2 seconds?"),
        ("cadence", "Human cadence", "Where does the short need air, and where is it dragging?"),
        ("jCutLCut", "J/L cut opportunity", "Would audio leading or trailing picture make the transition smoother?"),
        ("jumpCutCover", "Jump-cut cover", "Does a same-speaker cut need a reaction, crop punch-in, B-roll, or intentional pause?"),
        ("reactionBeat", "Reaction/listening beat", "What reaction or silence should stay because it carries meaning?"),
        ("captionPlan", "Caption plan", "What text evidence exists, and where can captions sit without covering faces or motion?"),
        ("cropFraming", "9:16 crop/framing", "Are eyes, face, hands, microphone, and visual context placed well?"),
        ("audioFeel", "Audio feel", "Any clipping, mouth-clicks, music imbalance, awkward silence, or over-tightening?"),
        ("endingPayoff", "Ending payoff", "Does the clip land cleanly or need a better out-point?"),
        ("platformFit", "Platform fit", "Which platforms fit this exact cut, and should it be one post or part of a thread?"),
        ("riskTradeoff", "Risk/tradeoff", "What did we preserve, sacrifice, or still need evidence for?"),
    ]
    return [
        {
            "id": field_id,
            "label": label,
            "prompt": prompt,
            "status": "empty",
            "note": "",
            "noteCommandTemplate": note_command(short_id, field_id, reviewer),
        }
        for field_id, label, prompt in fields
    ]


def load_note_sidecars(output_root: Path, short_id: str) -> dict[str, dict[str, list[dict[str, Any]]]]:
    folder = output_root / slug(short_id) / "notes"
    notes: dict[str, dict[str, list[dict[str, Any]]]] = {}
    if not folder.exists():
        return notes
    for path in sorted(folder.glob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if not isinstance(data, dict):
            continue
        field = str(data.get("field") or "")
        kind = str(data.get("kind") or "")
        note = str(data.get("note") or "").strip()
        if not field or not note:
            continue
        bucket = "reviewEvidence" if kind == "review-evidence" else "systemChecks"
        entry = {
            "kind": kind,
            "field": field,
            "note": note,
            "reviewer": data.get("reviewer", ""),
            "generatedAt": data.get("generatedAt", ""),
            "jsonPath": str(path),
            "markdownPath": data.get("artifactPaths", {}).get("markdown", "") if isinstance(data.get("artifactPaths"), dict) else "",
            "htmlPath": data.get("artifactPaths", {}).get("html", "") if isinstance(data.get("artifactPaths"), dict) else "",
            "truth": data.get("truth", ""),
        }
        notes.setdefault(field, {"reviewEvidence": [], "systemChecks": []})[bucket].append(entry)
    return notes


def apply_note_sidecars(fields: list[dict[str, Any]], notes_by_field: dict[str, dict[str, list[dict[str, Any]]]]) -> tuple[int, int]:
    review_count = 0
    system_count = 0
    for field in fields:
        sidecars = notes_by_field.get(str(field.get("id") or ""), {})
        review_notes = sidecars.get("reviewEvidence", [])
        system_notes = sidecars.get("systemChecks", [])
        if review_notes:
            latest = review_notes[-1]
            field["status"] = "filled"
            field["note"] = latest.get("note", "")
            field["latestReviewEvidence"] = latest
            field["reviewEvidenceNotes"] = review_notes
        else:
            field["reviewEvidenceNotes"] = []
        field["systemChecks"] = system_notes
        review_count += len(review_notes)
        system_count += len(system_notes)
    return review_count, system_count


def build_worksheet(workbench_path: Path, output_root: Path, item: dict[str, Any], reviewer: str) -> dict[str, Any]:
    short_id = str(item.get("shortId") or "unknown-short")
    short_slug = slug(short_id)
    basename = f"{stamp()}-{short_slug}-cut-quality-worksheet"
    folder = output_root / short_slug
    transcript = item.get("transcript") if isinstance(item.get("transcript"), dict) else {}
    media_path = str(item.get("mediaPath") or "")
    safe_commands = {
        "openShort": f"open {shell_quote(media_path)}" if media_path else "",
        "revealShort": f"open -R {shell_quote(media_path)}" if media_path else "",
        "nextTarget": f"script/agentctl.sh studio-shorts-cut-quality-next --short-id {shell_quote(short_id)}",
        "focusedPacket": f"script/agentctl.sh studio-recommended-short-review-packet --short-id {shell_quote(short_id)}",
        "draftRefineTemplate": (
            f"script/agentctl.sh studio-recommended-short-evidence-draft --short-id {shell_quote(short_id)} "
            "--outcome refine --summary '<specific watch/listen evidence summary>' "
            "--hook-note '<hook note>' --cadence-note '<cadence note>' --meaning-note '<meaning note>' "
            "--framing-note '<crop/framing note>' --caption-note '<caption note>' --audio-note '<audio note>' "
            "--ending-note '<ending note>' --platform-fit-note '<platform fit note>' --risk-tradeoff-note '<risk/tradeoff note>'"
        ),
    }
    paths = {
        "folder": str(folder),
        "json": str(folder / f"{basename}.json"),
        "markdown": str(folder / f"{basename}.md"),
        "html": str(folder / f"{basename}.html"),
    }
    fields = worksheet_fields(short_id, reviewer)
    review_note_count, system_check_count = apply_note_sidecars(fields, load_note_sidecars(output_root, short_id))
    return {
        "schema": SCHEMA,
        "version": VERSION,
        "generatedAt": iso_now(),
        "reviewer": reviewer,
        "sourceWorkbenchJson": str(workbench_path),
        "shortId": short_id,
        "episode": item.get("episode"),
        "episodeVersion": item.get("version"),
        "rank": item.get("rank"),
        "title": item.get("title"),
        "durationLabel": item.get("durationLabel"),
        "durationSeconds": item.get("durationSeconds"),
        "aspect": item.get("aspect"),
        "mediaPath": media_path,
        "mediaUri": item.get("mediaUri"),
        "readinessLevel": item.get("readinessLevel"),
        "transcriptStatus": transcript.get("status"),
        "transcriptKind": transcript.get("kind"),
        "platformChecks": item.get("platformChecks") if isinstance(item.get("platformChecks"), list) else [],
        "editorQuestions": item.get("editorQuestions") if isinstance(item.get("editorQuestions"), list) else [],
        "fields": fields,
        "reviewEvidenceNoteCount": review_note_count,
        "systemCheckNoteCount": system_check_count,
        "safeCommands": safe_commands,
        "artifactPaths": paths,
        "nextSafestAction": "Watch/listen to the short, fill worksheet notes, then create an evidence draft if the notes are specific enough.",
        "truth": "Versioned local worksheet only. It records no review decision, edits no timeline, exports nothing, publishes nothing, runs no ASR, generates no transcript text, mutates no media, overwrites no prior worksheet, and creates no receipt truth.",
    }


def render_markdown(payload: dict[str, Any]) -> str:
    lines = [
        "# Shorts cut-quality worksheet",
        "",
        f"- Short: `{payload.get('shortId')}`",
        f"- Episode/version: `Episode {payload.get('episode')}` / `{payload.get('episodeVersion')}`",
        f"- Title: {payload.get('title')}",
        f"- Reviewer: `{payload.get('reviewer')}`",
        f"- Duration/aspect: `{payload.get('durationLabel')}` / `{payload.get('aspect')}`",
        f"- Readiness: `{payload.get('readinessLevel')}`",
        f"- Transcript: `{payload.get('transcriptStatus')}` / `{payload.get('transcriptKind')}`",
        f"- Media: `{payload.get('mediaPath')}`",
        "",
        payload.get("truth", ""),
        "",
        f"Next safest action: {payload.get('nextSafestAction')}",
        "",
        "## Watch/listen worksheet",
        "",
    ]
    for field in payload.get("fields", []):
        lines.extend([
            f"### {field.get('label')}",
            "",
            f"Prompt: {field.get('prompt')}",
            "",
            f"- Status: {field.get('status')}",
            f"- Note: {field.get('note')}",
            f"- Capture command: `{field.get('noteCommandTemplate')}`",
            "",
        ])
        system_checks = field.get("systemChecks") if isinstance(field.get("systemChecks"), list) else []
        if system_checks:
            lines.extend(["Measurement/system hints:", ""])
            for check in system_checks:
                if isinstance(check, dict):
                    lines.append(f"- {check.get('note')} (`{check.get('generatedAt')}`)")
            lines.append("")
    lines.extend(["## Platform checks", ""])
    for check in payload.get("platformChecks", []):
        lines.append(f"- {check}")
    lines.extend(["", "## Editor questions from workbench", ""])
    for question in payload.get("editorQuestions", []):
        if isinstance(question, dict):
            lines.append(f"- `{question.get('dimension')}`: {question.get('question')} Watch for: {question.get('watchFor')}")
    lines.extend(["", "## Safe commands", ""])
    for label, command in (payload.get("safeCommands") or {}).items():
        if command:
            lines.append(f"- {label}: `{command}`")
    return "\n".join(lines).rstrip() + "\n"


def render_html(payload: dict[str, Any]) -> str:
    def system_checks_html(field: dict[str, Any]) -> str:
        checks = field.get("systemChecks") if isinstance(field.get("systemChecks"), list) else []
        if not checks:
            return ""
        items = "".join(
            f"<li>{esc(check.get('note'))}<small>{esc(check.get('generatedAt'))}</small></li>"
            for check in checks
            if isinstance(check, dict)
        )
        return f"<div class='system-checks'><strong>Measurement hints, not review completion</strong><ul>{items}</ul></div>"

    fields = "\n".join(
        (
            f"<section class='field'><h3>{esc(field.get('label'))}</h3><p>{esc(field.get('prompt'))}</p>"
            f"<p class='status'>Status: {esc(field.get('status'))}</p>"
            f"<div class='saved-note'>{esc(field.get('note'))}</div>"
            f"{system_checks_html(field)}"
            "<textarea placeholder='Write review evidence here. Do not guess transcript timing.'></textarea>"
            f"<button type='button' data-copy='{esc(field.get('noteCommandTemplate'))}'>Copy note command</button></section>"
        )
        for field in payload.get("fields", [])
    )
    buttons = "".join(
        f"<button type='button' data-copy='{esc(command)}'>{esc(label)}</button>"
        for label, command in (payload.get("safeCommands") or {}).items()
        if command
    )
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Cut-quality worksheet - {esc(payload.get('shortId'))}</title>
  <style>
    :root {{ color-scheme: dark; --soil:#17110c; --moss:#1a2a20; --cream:#fff0d0; --honey:#f2c94c; --fern:#8ee39a; --water:#78dbe6; --line:rgba(255,240,208,.16); }}
    body {{ margin:0; color:var(--cream); font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; background:linear-gradient(135deg,var(--moss),var(--soil)); }}
    main {{ width:min(1240px,calc(100vw - 32px)); margin:0 auto; padding:32px 0 88px; }}
    header,.field,.truth {{ border:1px solid var(--line); border-radius:26px; background:rgba(255,240,208,.07); box-shadow:0 20px 70px rgba(0,0,0,.25); }}
    header {{ padding:28px; margin-bottom:14px; }}
    h1 {{ margin:0 0 8px; font-size:clamp(34px,5vw,64px); line-height:.95; letter-spacing:-.045em; }}
    h2 {{ margin:0 0 8px; color:var(--honey); letter-spacing:.14em; text-transform:uppercase; font-size:13px; }}
    .meta {{ display:flex; flex-wrap:wrap; gap:8px; margin-top:14px; }}
    .pill {{ border:1px solid var(--line); border-radius:999px; padding:7px 10px; background:rgba(0,0,0,.2); color:rgba(255,240,208,.78); }}
    .truth {{ padding:16px 20px; margin:14px 0; color:rgba(255,240,208,.78); }}
    video {{ width:100%; max-height:560px; aspect-ratio:9/16; object-fit:contain; background:#050605; border-radius:26px; border:1px solid var(--line); }}
    .grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(320px,1fr)); gap:14px; margin-top:14px; }}
    .field {{ padding:18px; }}
    .field h3 {{ margin:0 0 8px; color:var(--fern); }}
    .field p {{ color:rgba(255,240,208,.72); min-height:42px; }}
    .status {{ min-height:0 !important; font-size:12px; text-transform:uppercase; letter-spacing:.12em; color:var(--honey) !important; }}
    .saved-note,.system-checks {{ border:1px solid var(--line); border-radius:14px; padding:10px; margin:10px 0; background:rgba(0,0,0,.18); color:rgba(255,240,208,.82); white-space:pre-wrap; }}
    .saved-note:empty {{ display:none; }}
    .system-checks strong {{ color:var(--water); }}
    .system-checks small {{ display:block; color:rgba(255,240,208,.5); margin-top:4px; }}
    textarea {{ width:100%; min-height:120px; resize:vertical; border:1px solid var(--line); border-radius:16px; background:rgba(0,0,0,.22); color:var(--cream); padding:12px; }}
    button {{ appearance:none; border:1px solid var(--line); border-radius:999px; background:rgba(120,219,230,.14); color:var(--cream); padding:9px 12px; margin:5px 5px 0 0; cursor:pointer; }}
    code {{ color:var(--water); overflow-wrap:anywhere; }}
  </style>
</head>
<body>
<main>
  <header>
    <h2>Quipsly Studio</h2>
    <h1>Cut-quality worksheet</h1>
    <p>{esc(payload.get('title'))}</p>
    <div class="meta">
      <span class="pill">{esc(payload.get('shortId'))}</span>
      <span class="pill">Episode {esc(payload.get('episode'))}</span>
      <span class="pill">{esc(payload.get('durationLabel'))}</span>
      <span class="pill">{esc(payload.get('readinessLevel'))}</span>
      <span class="pill">transcript {esc(payload.get('transcriptStatus'))}</span>
    </div>
  </header>
  <video controls preload="metadata" src="{esc(payload.get('mediaUri'))}"></video>
  <section class="truth"><strong>Truth boundary:</strong> {esc(payload.get('truth'))}<br><strong>Next:</strong> {esc(payload.get('nextSafestAction'))}<br><code>{esc(payload.get('mediaPath'))}</code></section>
  <section>{buttons}</section>
  <section class="grid">{fields}</section>
</main>
<script>
document.querySelectorAll('button[data-copy]').forEach((button) => {{
  button.addEventListener('click', async () => {{
    await navigator.clipboard.writeText(button.dataset.copy || '');
    const old = button.textContent;
    button.textContent = 'Copied';
    setTimeout(() => button.textContent = old, 900);
  }});
}});
</script>
</body>
</html>
"""


def write_outputs(payload: dict[str, Any]) -> dict[str, str]:
    paths = {key: Path(value) for key, value in payload.get("artifactPaths", {}).items() if key != "folder"}
    folder = Path(payload["artifactPaths"]["folder"])
    folder.mkdir(parents=True, exist_ok=True)
    paths["json"].write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
    paths["markdown"].write_text(render_markdown(payload), encoding="utf-8")
    paths["html"].write_text(render_html(payload), encoding="utf-8")
    return {key: str(path) for key, path in paths.items()}


def main() -> None:
    parser = argparse.ArgumentParser(description="Create a versioned cut-quality worksheet for one short.")
    parser.add_argument("--workbench", default=str(DEFAULT_WORKBENCH_JSON), help="Cut-quality workbench JSON.")
    parser.add_argument("--output-root", default=str(DEFAULT_OUTPUT_ROOT), help="Worksheet output root.")
    parser.add_argument("--short-id", default="", help="Select a specific short id.")
    parser.add_argument("--rank", type=int, default=0, help="Select a specific rank.")
    parser.add_argument("--readiness", default="", help="Select first item matching readiness level.")
    parser.add_argument("--reviewer", default="Codex", help="Reviewer label.")
    args = parser.parse_args()

    workbench_path = Path(args.workbench).expanduser()
    board = read_json(workbench_path)
    items = [item for item in board.get("items", []) if isinstance(item, dict)]
    try:
        item = choose_item(items, args.short_id, args.rank, args.readiness)
    except SystemExit:
        fallback = fallback_workbench_for_short(DEFAULT_ROOT, args.short_id) if args.short_id else None
        if not fallback:
            raise
        workbench_path = fallback
        board = read_json(workbench_path)
        items = [item for item in board.get("items", []) if isinstance(item, dict)]
        item = choose_item(items, args.short_id, args.rank, args.readiness)
    worksheet = build_worksheet(workbench_path, Path(args.output_root).expanduser(), item, args.reviewer)
    written = write_outputs(worksheet)
    print(json.dumps({
        "ok": True,
        "shortId": worksheet.get("shortId"),
        "artifactPaths": {"folder": worksheet["artifactPaths"]["folder"], **written},
        "nextSafestAction": worksheet.get("nextSafestAction"),
        "truth": worksheet.get("truth"),
    }, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
