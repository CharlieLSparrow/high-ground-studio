#!/usr/bin/env python3
"""Build a reviewer-friendly Studio sync decision aid.

This reads the active Studio next-review card and its linked sync investigation.
It repackages existing local snippets, worksheet questions, durations, and
dry-run routes into one calm decision surface. It does not repair, trim, export,
approve, publish, upload, schedule, overwrite, delete, mutate sources, or create
receipt truth.
"""
from __future__ import annotations

import argparse
import html
import json
import shlex
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
LATEST_STUDIO_NEXT_CARD = "review-board/studio-next-review-card/latest-studio-next-review-card.json"
LATEST_POINTER = "review-board/latest-studio-sync-decision-aid.json"
SCHEMA = "quipsly.studio.sync-decision-aid.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-studio-sync-decision-aid")


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except Exception:
        return {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def esc(value: Any) -> str:
    return html.escape(str(value or ""))


def shell_quote(value: str) -> str:
    return shlex.quote(value)


def file_uri(path_value: str) -> str:
    if not path_value:
        return ""
    try:
        return Path(path_value).expanduser().resolve().as_uri()
    except Exception:
        return ""


def seconds_label(value: Any) -> str:
    try:
        seconds = float(value or 0)
    except Exception:
        return ""
    whole = int(round(seconds))
    hours, rem = divmod(whole, 3600)
    minutes, secs = divmod(rem, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes}:{secs:02d}"


def load_next_card(root: Path) -> tuple[dict[str, Any], Path]:
    pointer_path = root / LATEST_STUDIO_NEXT_CARD
    pointer = load_json(pointer_path)
    target_path = Path(str(pointer.get("jsonPath") or "")) if pointer.get("jsonPath") else pointer_path
    target = load_json(target_path)
    return ({**pointer, **target} if target else pointer), pointer_path


def sync_path_from_next_card(card: dict[str, Any]) -> str:
    evidence = card.get("evidenceContext") if isinstance(card.get("evidenceContext"), dict) else {}
    return str(evidence.get("syncInvestigationJsonPath") or "")


def snippet_status(path_value: str) -> dict[str, Any]:
    path = Path(path_value) if path_value else Path("")
    return {
        "path": path_value,
        "exists": bool(path_value and path.exists()),
        "openCommand": f"open {shell_quote(path_value)}" if path_value else "",
        "fileUri": file_uri(path_value),
    }


def build_comparison_rows(sync: dict[str, Any]) -> list[dict[str, Any]]:
    worksheet = sync.get("reviewWorksheet") if isinstance(sync.get("reviewWorksheet"), dict) else {}
    checklist = worksheet.get("checklist") if isinstance(worksheet.get("checklist"), list) else []
    rows: list[dict[str, Any]] = []
    for index, item in enumerate(checklist, 1):
        if not isinstance(item, dict):
            continue
        video = snippet_status(str(item.get("videoSnippet") or ""))
        audio = snippet_status(str(item.get("audioSnippet") or ""))
        rows.append({
            "rank": index,
            "id": str(item.get("id") or f"check-{index}"),
            "label": str(item.get("label") or f"Check {index}"),
            "question": str(item.get("question") or ""),
            "passSignal": str(item.get("passSignal") or ""),
            "concernSignal": str(item.get("concernSignal") or ""),
            "sequenceSeconds": item.get("sequenceSeconds"),
            "sequenceLabel": seconds_label(item.get("sequenceSeconds")),
            "videoStartSeconds": item.get("videoStartSeconds"),
            "audioStartSeconds": item.get("audioStartSeconds"),
            "video": video,
            "audio": audio,
            "snippetPairReady": (not video["path"] or video["exists"]) and (not audio["path"] or audio["exists"]) and bool(audio["path"] or video["path"]),
            "localReviewerNote": "pending-human-watch-listen-comparison",
        })
    if rows:
        return rows

    comparisons = sync.get("comparisons") if isinstance(sync.get("comparisons"), list) else []
    for index, item in enumerate(comparisons, 1):
        if not isinstance(item, dict):
            continue
        video = snippet_status(str((item.get("videoSnippet") or {}).get("outputPath") if isinstance(item.get("videoSnippet"), dict) else ""))
        audio = snippet_status(str((item.get("audioSnippet") or {}).get("outputPath") if isinstance(item.get("audioSnippet"), dict) else ""))
        rows.append({
            "rank": index,
            "id": str(item.get("id") or f"comparison-{index}"),
            "label": str(item.get("label") or f"Comparison {index}"),
            "question": str(item.get("reason") or ""),
            "passSignal": "",
            "concernSignal": "",
            "sequenceSeconds": item.get("sequenceSeconds"),
            "sequenceLabel": seconds_label(item.get("sequenceSeconds")),
            "videoStartSeconds": item.get("videoStartSeconds"),
            "audioStartSeconds": item.get("audioStartSeconds"),
            "video": video,
            "audio": audio,
            "snippetPairReady": (not video["path"] or video["exists"]) and (not audio["path"] or audio["exists"]) and bool(audio["path"] or video["path"]),
            "localReviewerNote": "pending-human-watch-listen-comparison",
        })
    return rows


def build_outcome_rows(sync: dict[str, Any]) -> list[dict[str, Any]]:
    worksheet = sync.get("reviewWorksheet") if isinstance(sync.get("reviewWorksheet"), dict) else {}
    options = worksheet.get("outcomeOptions") if isinstance(worksheet.get("outcomeOptions"), list) else []
    rows: list[dict[str, Any]] = []
    for index, item in enumerate(options, 1):
        if not isinstance(item, dict):
            continue
        rows.append({
            "rank": index,
            "id": str(item.get("id") or f"outcome-{index}"),
            "label": str(item.get("label") or f"Outcome {index}"),
            "chooseWhen": str(item.get("chooseWhen") or ""),
            "warning": str(item.get("warning") or ""),
            "dryRunCommands": [str(command) for command in item.get("dryRunCommands", []) if command] if isinstance(item.get("dryRunCommands"), list) else [],
        })
    return rows


def artifact_rows(sync: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for item in sync.get("artifacts") if isinstance(sync.get("artifacts"), list) else []:
        if not isinstance(item, dict):
            continue
        path = str(item.get("path") or "")
        summary = item.get("summary") if isinstance(item.get("summary"), dict) else {}
        rows.append({
            "key": str(item.get("key") or ""),
            "label": str(item.get("label") or ""),
            "path": path,
            "exists": bool(item.get("exists") and path and Path(path).exists()),
            "durationSeconds": item.get("manifestDurationSeconds") or summary.get("durationSeconds"),
            "durationLabel": seconds_label(item.get("manifestDurationSeconds") or summary.get("durationSeconds")),
            "sizeBytes": item.get("sizeBytes") or 0,
            "openCommand": f"open {shell_quote(path)}" if path else "",
        })
    return rows


def build_payload(root: Path) -> dict[str, Any]:
    next_card, next_card_pointer = load_next_card(root)
    sync_path_value = sync_path_from_next_card(next_card)
    sync_path = Path(sync_path_value) if sync_path_value else Path("")
    sync = load_json(sync_path) if sync_path.exists() else {}
    if not sync:
        return {
            "schema": SCHEMA,
            "generatedAt": iso_now(),
            "status": "studio-sync-decision-aid-needs-sync-investigation",
            "releaseRoot": str(root),
            "sourceNextCardPointerPath": str(next_card_pointer),
            "sourceNextCardJsonPath": str(next_card.get("jsonPath") or ""),
            "syncInvestigationJsonPath": sync_path_value,
            "humanAsk": "No sync investigation was found from the current Studio next-review card.",
            "nextSafestAction": "Regenerate Studio next review card or sync investigation, then rerun this decision aid.",
            "truth": {
                "description": "No sync decision aid was built because source sync evidence was missing.",
                "repairsExecuted": False,
                "exportsCreated": False,
                "reviewDecisionsWritten": False,
                "externalPublishing": False,
                "receiptTruthCreated": False,
                "sourceFilesMutated": False,
                "versionsOverwritten": False,
            },
        }
    comparisons = build_comparison_rows(sync)
    outcomes = build_outcome_rows(sync)
    artifacts = artifact_rows(sync)
    missing_snippets = [
        {"id": row["id"], "video": row["video"]["path"], "audio": row["audio"]["path"]}
        for row in comparisons
        if not row["snippetPairReady"]
    ]
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": "studio-sync-decision-aid-ready" if not missing_snippets else "studio-sync-decision-aid-needs-snippets",
        "releaseRoot": str(root),
        "episode": sync.get("episode"),
        "version": sync.get("version"),
        "label": f"Episode {sync.get('episode')} {sync.get('version')} sync decision aid",
        "sourceNextCardPointerPath": str(next_card_pointer),
        "sourceNextCardJsonPath": str(next_card.get("jsonPath") or ""),
        "sourceNextCardHtmlPath": str(next_card.get("htmlPath") or ""),
        "syncInvestigationJsonPath": str(sync_path),
        "syncInvestigationHtmlPath": str(sync.get("htmlPath") or ""),
        "syncInvestigationWorksheetPath": str(sync.get("worksheetPath") or ""),
        "humanAsk": str(sync.get("humanAsk") or ""),
        "plainEnglish": str(sync.get("plainEnglishDurationSummary") or sync.get("plainEnglish") or ""),
        "nextSafestAction": "Watch/listen to the five comparison rows, then choose exactly one local route: hold/re-stack, audio-tail trim candidate, source-media-needed, or continue review. Do not publish or write a real review decision from duration alone.",
        "unblocksWhen": str(sync.get("unblocksWhen") or ""),
        "severity": str(sync.get("severity") or ""),
        "spreadLabel": str(sync.get("spreadLabel") or ""),
        "videoDurationLabel": str(sync.get("videoDurationLabel") or ""),
        "audioDurationLabel": str(sync.get("audioDurationLabel") or ""),
        "durationGapSeconds": sync.get("durationGapSeconds") or sync.get("durationSpreadSeconds") or 0,
        "durationGapLabel": seconds_label(sync.get("durationGapSeconds") or sync.get("durationSpreadSeconds")),
        "comparisonRows": comparisons,
        "outcomeRows": outcomes,
        "artifactRows": artifacts,
        "sourceTasks": sync.get("sourceTasks") if isinstance(sync.get("sourceTasks"), list) else [],
        "warnings": [str(item) for item in sync.get("warnings", [])] if isinstance(sync.get("warnings"), list) else [],
        "counts": {
            "artifacts": len(artifacts),
            "comparisonRows": len(comparisons),
            "outcomeRows": len(outcomes),
            "missingSnippetRows": len(missing_snippets),
            "readySnippetRows": sum(1 for row in comparisons if row["snippetPairReady"]),
        },
        "reviewerDoneWhen": [
            "Each comparison row has been watched/listened to enough to classify alignment.",
            "The audio-only tail is classified as expendable, missing-video-content, wrong-audio-source, or needs-more-evidence.",
            "A local route is chosen without claiming publication approval.",
            "If a route would mutate ledgers or create a new export, it remains dry-run until explicitly approved.",
        ],
        "firstSafeAction": {
            "label": "Open Studio sync decision aid",
            "command": "",
            "path": "",
            "safety": "Opens local sync review aid only. No repair, trim, export, approval, publication, upload, schedule, source mutation, overwrite, delete, or receipt truth.",
        },
        "truth": {
            "description": "Studio sync decision aid only. It repackages existing sync investigation evidence into a local review surface.",
            "repairsExecuted": False,
            "exportsCreated": False,
            "reviewDecisionsWritten": False,
            "externalPublishing": False,
            "externalUpload": False,
            "externalSchedulesCreated": False,
            "receiptTruthCreated": False,
            "sourceFilesMutated": False,
            "versionsOverwritten": False,
            "filesDeleted": False,
        },
    }


def render_markdown(path: Path, payload: dict[str, Any]) -> None:
    lines = [
        "# Studio sync decision aid",
        "",
        f"- Status: `{payload.get('status')}`",
        f"- Target: `{payload.get('label')}`",
        f"- Duration gap: `{payload.get('durationGapLabel')}` / `{payload.get('spreadLabel')}`",
        f"- Video duration: `{payload.get('videoDurationLabel')}`",
        f"- Audio duration: `{payload.get('audioDurationLabel')}`",
        f"- Sync packet: `{payload.get('syncInvestigationHtmlPath')}`",
        f"- Worksheet: `{payload.get('syncInvestigationWorksheetPath')}`",
        "",
        "## Human ask",
        "",
        str(payload.get("humanAsk") or ""),
        "",
        "## Next safest action",
        "",
        str(payload.get("nextSafestAction") or ""),
        "",
        "## Comparison rows",
        "",
    ]
    for row in payload.get("comparisonRows") or []:
        lines.extend([
            f"### {row.get('rank')}. {row.get('label')} ({row.get('sequenceLabel')})",
            "",
            f"- Question: {row.get('question')}",
            f"- Good sign: {row.get('passSignal')}",
            f"- Concern: {row.get('concernSignal')}",
            f"- Video snippet: `{row.get('video', {}).get('path')}`",
            f"- Audio snippet: `{row.get('audio', {}).get('path')}`",
            f"- Snippet pair ready: `{row.get('snippetPairReady')}`",
            "",
        ])
    lines.extend(["## Outcome routes", ""])
    for row in payload.get("outcomeRows") or []:
        lines.extend([
            f"### {row.get('rank')}. {row.get('label')}",
            "",
            f"- Choose when: {row.get('chooseWhen')}",
            f"- Warning: {row.get('warning')}",
            "- Dry-run commands:",
        ])
        for command in row.get("dryRunCommands") or []:
            lines.append(f"  - `{command}`")
        lines.append("")
    lines.extend([
        "## Safety",
        "",
        "- Does not repair or trim.",
        "- Does not create exports.",
        "- Does not approve, publish, upload, schedule, mutate accounts, or create receipts.",
        "- Does not mutate source media or overwrite previous versions.",
        "",
    ])
    path.write_text("\n".join(lines), encoding="utf-8")


def render_html(path: Path, payload: dict[str, Any]) -> None:
    rows = []
    for row in payload.get("comparisonRows") or []:
        video = row.get("video") if isinstance(row.get("video"), dict) else {}
        audio = row.get("audio") if isinstance(row.get("audio"), dict) else {}
        video_cell = f'<a href="{esc(video.get("fileUri"))}">Open video</a>' if video.get("fileUri") else "No video snippet"
        audio_cell = f'<a href="{esc(audio.get("fileUri"))}">Open audio</a>' if audio.get("fileUri") else "No audio snippet"
        rows.append(f"""
        <tr>
          <td><b>{esc(row.get('rank'))}. {esc(row.get('label'))}</b><br><span>{esc(row.get('sequenceLabel'))}</span></td>
          <td>{esc(row.get('question'))}</td>
          <td>{esc(row.get('passSignal'))}</td>
          <td>{esc(row.get('concernSignal'))}</td>
          <td>{video_cell}<code>{esc(video.get('path'))}</code></td>
          <td>{audio_cell}<code>{esc(audio.get('path'))}</code></td>
          <td>{esc(row.get('snippetPairReady'))}</td>
        </tr>""")
    outcome_cards = []
    for row in payload.get("outcomeRows") or []:
        commands = "".join(f"<li><code>{esc(command)}</code></li>" for command in row.get("dryRunCommands") or []) or "<li>No dry-run command on this aid.</li>"
        outcome_cards.append(f"""
        <section>
          <h3>{esc(row.get('rank'))}. {esc(row.get('label'))}</h3>
          <p>{esc(row.get('chooseWhen'))}</p>
          {f'<p class="warn">{esc(row.get("warning"))}</p>' if row.get('warning') else ''}
          <ul>{commands}</ul>
        </section>""")
    artifact_cards = "".join(
        f"<li><b>{esc(row.get('label'))}</b> {esc(row.get('durationLabel'))}<code>{esc(row.get('path'))}</code></li>"
        for row in payload.get("artifactRows") or []
    )
    html_text = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Studio sync decision aid</title>
  <style>
    :root {{ color-scheme: dark; --ink:#f6f0df; --paper:#17201d; --leaf:#86c084; --line:#3a5548; --gold:#e2bd52; --clay:#d77755; --blue:#79b9d8; }}
    body {{ margin:0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif; background: radial-gradient(circle at 12% 0%, #31463b, #111715 48%, #211915); color:var(--ink); }}
    main {{ max-width: 1240px; margin: 34px auto; padding: 0 22px 56px; }}
    .card {{ border:1px solid var(--line); border-radius:30px; background:rgba(23,32,29,.94); padding:28px; box-shadow:0 24px 80px rgba(0,0,0,.34); }}
    .eyebrow {{ color:var(--gold); letter-spacing:.28em; text-transform:uppercase; font-size:12px; font-weight:900; }}
    h1 {{ font:900 clamp(36px,5vw,66px)/.94 ui-serif, Georgia, serif; margin:12px 0; }}
    .meta {{ display:flex; flex-wrap:wrap; gap:8px; margin:16px 0; }}
    .meta span {{ border:1px solid var(--line); background:rgba(255,255,255,.06); border-radius:999px; padding:8px 12px; font-size:12px; font-weight:900; }}
    table {{ width:100%; border-collapse:collapse; margin-top:18px; overflow:hidden; border-radius:18px; }}
    th, td {{ border-bottom:1px solid var(--line); padding:10px; text-align:left; vertical-align:top; }}
    th {{ color:var(--leaf); }}
    code {{ display:block; white-space:pre-wrap; word-break:break-word; margin-top:6px; padding:8px; border:1px solid var(--line); border-radius:10px; background:rgba(0,0,0,.24); color:#fff6d8; }}
    a {{ color:var(--blue); font-weight:900; }}
    .grid {{ display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap:14px; margin-top:18px; }}
    section {{ border:1px solid var(--line); border-radius:18px; background:rgba(255,255,255,.045); padding:16px; }}
    h2, h3 {{ color:var(--leaf); }}
    .warn {{ color:var(--clay); font-weight:900; }}
    @media(max-width:900px) {{ .grid {{ grid-template-columns:1fr; }} table {{ font-size:12px; }} }}
  </style>
</head>
<body><main><div class="card">
  <div class="eyebrow">Quipsly Studio</div>
  <h1>Episode sync decision aid.</h1>
  <p>{esc(payload.get('humanAsk'))}</p>
  <div class="meta">
    <span>{esc(payload.get('label'))}</span>
    <span>gap {esc(payload.get('durationGapLabel'))}</span>
    <span>video {esc(payload.get('videoDurationLabel'))}</span>
    <span>audio {esc(payload.get('audioDurationLabel'))}</span>
    <span>{esc(payload.get('status'))}</span>
  </div>
  <section>
    <h2>Next safest action</h2>
    <p>{esc(payload.get('nextSafestAction'))}</p>
  </section>
  <h2>Watch/listen comparison rows</h2>
  <table>
    <thead><tr><th>Moment</th><th>Question</th><th>Good sign</th><th>Concern</th><th>Video</th><th>Audio</th><th>Ready</th></tr></thead>
    <tbody>{''.join(rows)}</tbody>
  </table>
  <h2>Outcome routes</h2>
  <div class="grid">{''.join(outcome_cards)}</div>
  <h2>Artifacts</h2>
  <ul>{artifact_cards}</ul>
  <p class="warn">Safety: local decision aid only. No repair, trim, export, approval, publication, upload, schedule, overwrite, delete, source mutation, or receipt truth.</p>
</div></main></body></html>
"""
    path.write_text(html_text, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Build Studio sync decision aid from current sync investigation.")
    parser.add_argument("root", nargs="?", default=str(DEFAULT_ROOT))
    args = parser.parse_args()
    root = Path(args.root).expanduser().resolve()
    payload = build_payload(root)
    out_dir = root / "review-board" / "sync-decision-aids" / stamp()
    out_dir.mkdir(parents=True, exist_ok=True)
    json_path = out_dir / "studio-sync-decision-aid.json"
    markdown_path = out_dir / "START-HERE-studio-sync-decision-aid.md"
    html_path = out_dir / "index.html"
    payload.update({
        "sessionDir": str(out_dir),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "htmlPath": str(html_path),
        "syncDecisionAidPath": str(html_path),
        "firstSafeAction": {
            "label": "Open Studio sync decision aid",
            "command": f"open {shell_quote(str(html_path))}",
            "path": str(html_path),
            "safety": "Opens local sync review aid only. No repair, trim, export, approval, publication, upload, schedule, source mutation, overwrite, delete, or receipt truth.",
        },
    })
    write_json(json_path, payload)
    render_markdown(markdown_path, payload)
    render_html(html_path, payload)
    write_json(root / LATEST_POINTER, {
        "schema": "quipsly.studio.latest-sync-decision-aid.v1",
        "updatedAt": iso_now(),
        "status": payload.get("status"),
        "episode": payload.get("episode"),
        "version": payload.get("version"),
        "label": payload.get("label"),
        "spreadLabel": payload.get("spreadLabel"),
        "durationGapLabel": payload.get("durationGapLabel"),
        "humanAsk": payload.get("humanAsk"),
        "nextSafestAction": payload.get("nextSafestAction"),
        "counts": payload.get("counts"),
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "syncDecisionAidPath": str(html_path),
        "firstSafeAction": payload.get("firstSafeAction"),
        "truth": payload.get("truth"),
    })
    print(json.dumps(payload, indent=2, sort_keys=True))
    return 0 if str(payload.get("status") or "").endswith("ready") else 1


if __name__ == "__main__":
    raise SystemExit(main())
