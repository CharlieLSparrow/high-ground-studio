#!/usr/bin/env python3
"""Index semantic edit audition packets and previews."""
from __future__ import annotations

import argparse
import html
import json
from pathlib import Path
from typing import Any


DEFAULT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
DEFAULT_AUDITION_ROOT = DEFAULT_ROOT / "shorts-command-room" / "semantic-edit-auditions"
DEFAULT_OUTPUT_DIR = DEFAULT_AUDITION_ROOT / "index"
DEFAULT_BASENAME = "quipsly-studio-shorts-semantic-edit-audition-index"
SCHEMA = "quipsly.studio.shorts-semantic-edit-audition-index.v1"
VERSION = "2026-07-02.v1"


def esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""))


def read_json(path: Path) -> dict[str, Any]:
    try:
        with path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def file_uri(path: str) -> str:
    if not path:
        return ""
    try:
        return Path(path).expanduser().resolve().as_uri()
    except ValueError:
        return ""


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def collect(root: Path) -> list[dict[str, Any]]:
    packets: list[dict[str, Any]] = []
    for path in sorted(root.glob("*/*/semantic-edit-audition.json")):
        payload = read_json(path)
        if not payload:
            continue
        artifact_paths = payload.get("artifactPaths") if isinstance(payload.get("artifactPaths"), dict) else {}
        preview = str(artifact_paths.get("preview") or "")
        rendered = bool(payload.get("renderedPreview")) and bool(preview) and Path(preview).exists()
        warnings = (payload.get("auditionRange") or {}).get("warnings", []) if isinstance(payload.get("auditionRange"), dict) else []
        packets.append({
            "shortId": payload.get("shortId"),
            "episode": payload.get("episode"),
            "title": payload.get("title"),
            "generatedAt": payload.get("generatedAt"),
            "candidateType": (payload.get("candidate") or {}).get("type") if isinstance(payload.get("candidate"), dict) else None,
            "range": payload.get("auditionRange"),
            "renderedPreview": rendered,
            "warnings": warnings,
            "packetJson": str(path),
            "packetHtml": str(artifact_paths.get("html") or path.with_suffix(".html")),
            "previewPath": preview,
            "previewUri": file_uri(preview) if rendered else "",
            "safeCommands": {
                "openPacket": f"open {shell_quote(str(artifact_paths.get('html') or path.with_suffix('.html')))}",
                "openPreview": f"open {shell_quote(preview)}" if rendered else "",
                "revealFolder": f"open {shell_quote(str(path.parent))}",
            },
            "truth": "Indexed audition packet only. It is not an edit decision, final export, publication, or receipt truth.",
        })
    packets.sort(key=lambda item: str(item.get("generatedAt") or ""), reverse=True)
    return packets


def build_index(root: Path) -> dict[str, Any]:
    items = collect(root)
    rendered = sum(1 for item in items if item.get("renderedPreview"))
    warning_items = sum(1 for item in items if item.get("warnings"))
    return {
        "schema": SCHEMA,
        "version": VERSION,
        "sourceAuditionRoot": str(root),
        "counts": {
            "auditions": len(items),
            "renderedPreviews": rendered,
            "warningAuditions": warning_items,
            "receiptTruthCreated": False,
            "timelineMutations": 0,
            "exportsCreatedForPublishing": 0,
        },
        "items": items,
        "nextSafestAction": "Open the latest audition preview, watch/listen it, and record whether it improves the hook before mutating timeline decisions." if items else "Create a semantic edit audition packet for the highest-priority candidate.",
        "truth": "Read-only audition index. It does not mutate media, timelines, exports, transcripts, publishing state, or receipt truth.",
    }


def render_markdown(index: dict[str, Any]) -> str:
    lines = ["# Semantic edit audition index", "", index.get("truth", ""), "", f"Next safest action: {index.get('nextSafestAction')}", "", "## Counts", ""]
    for key, value in index.get("counts", {}).items():
        lines.append(f"- {key}: `{value}`")
    lines.extend(["", "## Auditions", ""])
    for item in index.get("items", []):
        arange = item.get("range") or {}
        lines.extend([
            f"### {item.get('shortId')} - {item.get('candidateType')}",
            "",
            f"- Generated: `{item.get('generatedAt')}`",
            f"- Range: `{arange.get('startSeconds')}` to `{arange.get('endSeconds')}` (`{arange.get('durationSeconds')}`s)",
            f"- Rendered: `{item.get('renderedPreview')}`",
            f"- Preview: `{item.get('previewPath')}`",
            f"- Packet: `{item.get('packetHtml')}`",
            f"- Warnings: `{'; '.join(item.get('warnings') or [])}`",
            "",
        ])
    return "\n".join(lines).rstrip() + "\n"


def render_html(index: dict[str, Any]) -> str:
    metrics = "".join(f"<div><strong>{esc(v)}</strong><span>{esc(k)}</span></div>" for k, v in index.get("counts", {}).items())
    cards = "\n".join(render_item_html(item) for item in index.get("items", []))
    return f"""<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Semantic edit audition index</title><style>
:root{{color-scheme:dark;--soil:#171008;--moss:#14261a;--cream:#fff0d0;--honey:#f2c94c;--fern:#8ee39a;--water:#76d7df;--line:rgba(255,240,208,.16)}}*{{box-sizing:border-box}}body{{margin:0;color:var(--cream);font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:linear-gradient(140deg,var(--moss),var(--soil))}}main{{width:min(1350px,calc(100vw - 32px));margin:0 auto;padding:34px 0 80px}}header,.card{{border:1px solid var(--line);border-radius:28px;background:rgba(255,240,208,.07);padding:24px;box-shadow:0 24px 80px rgba(0,0,0,.24)}}h1{{font-size:clamp(34px,5vw,64px);line-height:.94;letter-spacing:-.05em;margin:0 0 8px}}h2{{color:var(--honey);font-size:13px;letter-spacing:.14em;text-transform:uppercase}}.metrics{{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-top:20px}}.metrics div{{border:1px solid var(--line);border-radius:18px;padding:13px;background:rgba(0,0,0,.18)}}.metrics strong{{display:block;color:var(--fern);font-size:26px}}.metrics span{{font-size:11px;text-transform:uppercase;letter-spacing:.11em;color:rgba(255,240,208,.62)}}.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(380px,1fr));gap:16px;margin-top:16px}}video{{width:100%;aspect-ratio:9/16;max-height:420px;object-fit:contain;background:#050604;border:1px solid var(--line);border-radius:20px}}code{{color:var(--water);overflow-wrap:anywhere}}a,button{{border:1px solid var(--line);border-radius:999px;background:rgba(118,215,223,.13);color:var(--cream);padding:8px 10px;margin:4px;text-decoration:none;display:inline-block}}
</style></head><body><main><header><h2>Quipsly Studio</h2><h1>Semantic edit audition index</h1><p>{esc(index.get('truth'))}</p><p><strong>Next:</strong> {esc(index.get('nextSafestAction'))}</p><div class="metrics">{metrics}</div></header><section class="grid">{cards}</section></main></body></html>"""


def render_item_html(item: dict[str, Any]) -> str:
    arange = item.get("range") or {}
    video = f"<video controls preload='metadata' src='{esc(item.get('previewUri'))}'></video>" if item.get("previewUri") else ""
    warnings = "".join(f"<li>{esc(w)}</li>" for w in item.get("warnings", [])) or "<li>none</li>"
    return f"""<article class="card">{video}<h2>{esc(item.get('shortId'))}</h2><h3>{esc(item.get('candidateType'))}</h3><p>Range: {esc(arange.get('startSeconds'))} to {esc(arange.get('endSeconds'))} ({esc(arange.get('durationSeconds'))}s)</p><p>Rendered: {esc(item.get('renderedPreview'))}</p><ul>{warnings}</ul><a href="{esc(file_uri(item.get('packetHtml') or ''))}">Open packet</a><a href="{esc(item.get('previewUri'))}">Open preview</a><p><code>{esc(item.get('previewPath'))}</code></p></article>"""


def write_outputs(index: dict[str, Any], output_dir: Path, basename: str, mode: str) -> dict[str, str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    paths = {"json": output_dir / f"{basename}.json", "markdown": output_dir / f"{basename}.md", "html": output_dir / f"{basename}.html"}
    if mode in {"json", "all"}:
        payload = dict(index)
        payload["artifactPaths"] = {key: str(path) for key, path in paths.items()}
        paths["json"].write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    if mode in {"markdown", "all"}:
        paths["markdown"].write_text(render_markdown(index), encoding="utf-8")
    if mode in {"html", "all"}:
        paths["html"].write_text(render_html(index), encoding="utf-8")
    return {key: str(path) for key, path in paths.items()}


def main() -> int:
    parser = argparse.ArgumentParser(description="Index semantic edit audition packets.")
    parser.add_argument("--audition-root", default=str(DEFAULT_AUDITION_ROOT), help="Semantic edit audition root.")
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR), help="Output directory.")
    parser.add_argument("--basename", default=DEFAULT_BASENAME, help="Output basename.")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--json", action="store_true", help="Write JSON only.")
    group.add_argument("--markdown", action="store_true", help="Write Markdown only.")
    group.add_argument("--html", action="store_true", help="Write HTML only.")
    group.add_argument("--all", action="store_true", help="Write JSON, Markdown, and HTML.")
    args = parser.parse_args()
    mode = "all" if args.all or not (args.json or args.markdown or args.html) else ("json" if args.json else "markdown" if args.markdown else "html")
    index = build_index(Path(args.audition_root).expanduser())
    paths = write_outputs(index, Path(args.output_dir).expanduser(), args.basename, mode)
    print(json.dumps({"ok": True, "artifactPaths": {"folder": str(Path(args.output_dir).expanduser()), **paths}, "counts": index.get("counts"), "nextSafestAction": index.get("nextSafestAction"), "truth": index.get("truth")}, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
