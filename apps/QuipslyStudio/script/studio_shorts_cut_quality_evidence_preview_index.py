#!/usr/bin/env python3
"""Index cut-quality evidence preview packets.

Evidence previews are useful only if reviewers can find the latest preview per
short and see whether it is waiting on notes or ready for a draft command. This
index is local, read-only, and does not record review intent.
"""
from __future__ import annotations

import argparse
import html
import json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
DEFAULT_PREVIEW_ROOT = DEFAULT_ROOT / "shorts-command-room" / "cut-quality-evidence-previews"
DEFAULT_OUTPUT_DIR = DEFAULT_PREVIEW_ROOT / "index"
DEFAULT_BASENAME = "quipsly-studio-shorts-cut-quality-evidence-preview-index"
SCHEMA = "quipsly.studio.shorts-cut-quality-evidence-preview-index.v1"
VERSION = "2026-07-02.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""))


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def read_json(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return data if isinstance(data, dict) else {}


def relative(path: Path, root: Path) -> str:
    try:
        return str(path.relative_to(root))
    except ValueError:
        return str(path)


def preview_summary(path: Path, root: Path) -> dict[str, Any]:
    data = read_json(path)
    if data.get("schema") != "quipsly.studio.shorts-cut-quality-evidence-preview.v1":
        return {}
    short_id = str(data.get("shortId") or path.parent.name)
    status = str(data.get("status") or "unknown")
    command = str(data.get("commandPreview") or "")
    return {
        "shortId": short_id,
        "path": str(path),
        "relativePath": relative(path, root),
        "generatedAt": data.get("generatedAt") or "",
        "reviewer": data.get("reviewer") or "",
        "episode": data.get("episode"),
        "episodeVersion": data.get("episodeVersion"),
        "title": data.get("title"),
        "status": status,
        "outcome": data.get("outcome"),
        "reviewEvidenceNoteCount": data.get("reviewEvidenceNoteCount") or 0,
        "hasCommandPreview": bool(command),
        "commandPreview": command,
        "summary": data.get("summary") or "",
        "safeCommands": {
            "openMarkdown": f"open {shell_quote(str(path.with_suffix('.md')))}" if path.with_suffix(".md").exists() else "",
            "openHtml": f"open {shell_quote(str(path.with_suffix('.html')))}" if path.with_suffix(".html").exists() else "",
            "reveal": f"open -R {shell_quote(str(path))}",
            "refreshPreview": f"script/agentctl.sh studio-shorts-cut-quality-evidence-preview --short-id {shell_quote(short_id)}",
            "worksheetIndex": "script/agentctl.sh studio-shorts-cut-quality-worksheet-index --all",
        },
        "truth": "Evidence preview summary only. It is not review approval, edit mutation, export proof, publication truth, or receipt truth.",
    }


def build_index(preview_root: Path, output_dir: Path) -> dict[str, Any]:
    previews = [
        preview
        for preview in (preview_summary(path, preview_root) for path in sorted(preview_root.rglob("*-evidence-preview.json")))
        if preview and output_dir not in Path(preview["path"]).parents
    ]
    previews.sort(key=lambda item: (str(item.get("shortId") or ""), str(item.get("generatedAt") or "")))
    by_short: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for preview in previews:
        by_short[str(preview.get("shortId") or "unknown-short")].append(preview)
    latest = [items[-1] for _, items in sorted(by_short.items())]
    status_counts = Counter(item.get("status") for item in latest)
    return {
        "schema": SCHEMA,
        "version": VERSION,
        "generatedAt": iso_now(),
        "previewRoot": str(preview_root),
        "outputDir": str(output_dir),
        "counts": {
            "previews": len(previews),
            "shortsWithPreviews": len(by_short),
            "latestReadyForEvidenceDraft": status_counts.get("ready-for-evidence-draft", 0),
            "latestNeedsReviewEvidenceNotes": status_counts.get("needs-review-evidence-notes", 0),
            "latestWithCommandPreview": sum(1 for item in latest if item.get("hasCommandPreview")),
            "approvalCreated": False,
            "externalPublishing": False,
            "receiptTruthCreated": False,
        },
        "latestByShort": latest,
        "previews": previews,
        "nextSafestAction": next_action(latest),
        "truth": "Read-only evidence-preview index. It records no review decision, edits no timeline, exports nothing, publishes nothing, runs no ASR, mutates no media, overwrites no preview, deletes nothing, and creates no receipt truth.",
    }


def next_action(latest: list[dict[str, Any]]) -> str:
    for item in latest:
        if item.get("status") == "ready-for-evidence-draft":
            return f"Inspect command preview for {item.get('shortId')} before running an evidence-draft command."
    for item in latest:
        if item.get("status") == "needs-review-evidence-notes":
            return f"Capture review-evidence notes for {item.get('shortId')}, then refresh the evidence preview."
    return "Create the first evidence preview with script/agentctl.sh studio-shorts-cut-quality-evidence-preview."


def render_markdown(index: dict[str, Any]) -> str:
    lines = [
        "# Studio shorts cut-quality evidence preview index",
        "",
        f"Generated: `{index.get('generatedAt')}`",
        f"Preview root: `{index.get('previewRoot')}`",
        "",
        index.get("truth", ""),
        "",
        f"Next safest action: {index.get('nextSafestAction')}",
        "",
        "## Counts",
        "",
    ]
    for key, value in index.get("counts", {}).items():
        lines.append(f"- {key}: `{value}`")
    lines.extend(["", "## Latest preview by short", ""])
    for item in index.get("latestByShort", []):
        lines.extend([
            f"### {item.get('shortId')} - {item.get('status')}",
            "",
            f"- Reviewer: `{item.get('reviewer')}`",
            f"- Episode/version: `Episode {item.get('episode')}` / `{item.get('episodeVersion')}`",
            f"- Notes: `{item.get('reviewEvidenceNoteCount')}`",
            f"- Has command preview: `{item.get('hasCommandPreview')}`",
            f"- Preview: `{item.get('path')}`",
            f"- Summary: {item.get('summary')}",
        ])
        for label, command in (item.get("safeCommands") or {}).items():
            if command:
                lines.append(f"- {label}: `{command}`")
        if item.get("commandPreview"):
            lines.extend(["", "Command preview:", "", f"`{item.get('commandPreview')}`"])
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def render_html(index: dict[str, Any]) -> str:
    metrics = "".join(
        f"<div><strong>{esc(value)}</strong><span>{esc(key)}</span></div>"
        for key, value in index.get("counts", {}).items()
        if key in {"previews", "shortsWithPreviews", "latestReadyForEvidenceDraft", "latestNeedsReviewEvidenceNotes", "latestWithCommandPreview"}
    )
    rows = "\n".join(render_row(item) for item in index.get("latestByShort", []))
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Cut-quality evidence preview index</title>
  <style>
    :root {{ color-scheme: dark; --soil:#17110c; --moss:#1a2b20; --cream:#fff0d0; --honey:#f2c94c; --fern:#8ee39a; --water:#78dbe6; --line:rgba(255,240,208,.16); }}
    body {{ margin:0; color:var(--cream); font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; background:linear-gradient(135deg,var(--moss),var(--soil)); }}
    main {{ width:min(1320px,calc(100vw - 32px)); margin:0 auto; padding:32px 0 88px; }}
    header,.truth,.card {{ border:1px solid var(--line); border-radius:26px; background:rgba(255,240,208,.07); box-shadow:0 20px 70px rgba(0,0,0,.25); }}
    header,.truth,.card {{ padding:18px; margin-bottom:12px; }}
    h1 {{ margin:0 0 8px; font-size:clamp(34px,5vw,64px); line-height:.95; letter-spacing:-.045em; }}
    h2 {{ margin:0 0 8px; color:var(--honey); letter-spacing:.14em; text-transform:uppercase; font-size:13px; }}
    .metrics {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(155px,1fr)); gap:10px; margin-top:18px; }}
    .metrics div {{ border:1px solid var(--line); border-radius:18px; padding:14px; background:rgba(0,0,0,.18); }}
    .metrics strong {{ display:block; font-size:28px; color:var(--fern); }}
    .metrics span {{ display:block; color:rgba(255,240,208,.65); font-size:12px; letter-spacing:.1em; text-transform:uppercase; }}
    .grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(360px,1fr)); gap:12px; }}
    .pill {{ border:1px solid var(--line); border-radius:999px; padding:6px 9px; display:inline-block; margin:3px; background:rgba(0,0,0,.2); }}
    code,pre {{ color:var(--water); overflow-wrap:anywhere; }}
    pre {{ white-space:pre-wrap; border:1px solid var(--line); border-radius:16px; padding:12px; background:rgba(0,0,0,.22); }}
  </style>
</head>
<body>
<main>
  <header>
    <h2>Quipsly Studio</h2>
    <h1>Evidence preview index</h1>
    <p>Latest evidence-preview state per short. Preview packets are not decisions.</p>
    <div class="metrics">{metrics}</div>
  </header>
  <section class="truth"><strong>Truth boundary:</strong> {esc(index.get('truth'))}<br><strong>Next:</strong> {esc(index.get('nextSafestAction'))}</section>
  <section class="grid">{rows}</section>
</main>
</body>
</html>
"""


def render_row(item: dict[str, Any]) -> str:
    command = f"<pre>{esc(item.get('commandPreview'))}</pre>" if item.get("commandPreview") else ""
    return f"""
<article class="card">
  <h2>{esc(item.get('shortId'))}</h2>
  <p>{esc(item.get('title'))}</p>
  <span class="pill">{esc(item.get('status'))}</span>
  <span class="pill">{esc(item.get('reviewEvidenceNoteCount'))} notes</span>
  <span class="pill">command {esc(item.get('hasCommandPreview'))}</span>
  <p>{esc(item.get('summary'))}</p>
  <p><code>{esc(item.get('path'))}</code></p>
  {command}
</article>
"""


def write_outputs(index: dict[str, Any], output_dir: Path, basename: str, mode: str) -> dict[str, str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    paths = {
        "json": output_dir / f"{basename}.json",
        "markdown": output_dir / f"{basename}.md",
        "html": output_dir / f"{basename}.html",
    }
    if mode in {"json", "all"}:
        payload = dict(index)
        payload["artifactPaths"] = {key: str(path) for key, path in paths.items()}
        paths["json"].write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
    if mode in {"markdown", "all"}:
        paths["markdown"].write_text(render_markdown(index), encoding="utf-8")
    if mode in {"html", "all"}:
        paths["html"].write_text(render_html(index), encoding="utf-8")
    return {key: str(path) for key, path in paths.items()}


def main() -> None:
    parser = argparse.ArgumentParser(description="Index cut-quality evidence previews.")
    parser.add_argument("--preview-root", default=str(DEFAULT_PREVIEW_ROOT), help="Evidence preview root folder.")
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR), help="Output directory.")
    parser.add_argument("--basename", default=DEFAULT_BASENAME, help="Output basename.")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--json", action="store_true", help="Write JSON only.")
    group.add_argument("--markdown", action="store_true", help="Write Markdown only.")
    group.add_argument("--html", action="store_true", help="Write HTML only.")
    group.add_argument("--all", action="store_true", help="Write JSON, Markdown, and HTML.")
    args = parser.parse_args()

    mode = "all" if args.all or not (args.json or args.markdown or args.html) else ("json" if args.json else "markdown" if args.markdown else "html")
    index = build_index(Path(args.preview_root).expanduser(), Path(args.output_dir).expanduser())
    paths = write_outputs(index, Path(args.output_dir).expanduser(), args.basename, mode)
    print(json.dumps({
        "ok": True,
        "artifactPaths": {"folder": str(Path(args.output_dir).expanduser()), **paths},
        "counts": index.get("counts", {}),
        "nextSafestAction": index.get("nextSafestAction"),
        "truth": index.get("truth"),
    }, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
