#!/usr/bin/env python3
"""Build a watch/listen review room for Studio's current top review questions.

This is a local-only evidence room. It reads the Studio top review companion and
turns its duration/sync blockers into a human-friendly room with media evidence,
decision-note templates, and safe next actions. It does not approve, promote,
repair, publish, upload, schedule, overwrite, delete, mutate source media, or
create receipt truth.
"""

from __future__ import annotations

import csv
import html
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
SCHEMA = "quipsly.studio.watch-listen-review-room.v1"
EMBED_MAX_BYTES = 350 * 1024 * 1024
VIDEO_SUFFIXES = {".mp4", ".mov", ".m4v", ".webm"}
AUDIO_SUFFIXES = {".wav", ".m4a", ".mp3", ".aac", ".aiff", ".aif"}
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-studio-watch-listen-review-room")


def load_json(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def esc(value: object) -> str:
    return html.escape(str(value or ""), quote=True)


def as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def media_kind(path: str) -> str:
    suffix = Path(path).suffix.lower()
    if suffix in VIDEO_SUFFIXES:
        return "video"
    if suffix in AUDIO_SUFFIXES:
        return "audio"
    if suffix in IMAGE_SUFFIXES:
        return "image"
    if suffix == ".html":
        return "html"
    if suffix == ".json":
        return "json"
    if suffix in {".md", ".txt"}:
        return "text"
    return "file"


def file_uri(path: str) -> str:
    try:
        return Path(path).resolve().as_uri()
    except Exception:
        return ""


def safe_stat(path: str) -> dict[str, Any]:
    if not path:
        return {"exists": False, "sizeBytes": 0}
    p = Path(path)
    try:
        stat = p.stat()
        return {"exists": True, "sizeBytes": stat.st_size}
    except Exception:
        return {"exists": False, "sizeBytes": 0}


def should_embed(path: str, size_bytes: int) -> bool:
    if not path or size_bytes > EMBED_MAX_BYTES:
        return False
    kind = media_kind(path)
    if kind in {"audio", "image"}:
        return True
    if kind == "video" and "/review-board/" in path:
        return True
    return False


def append_evidence(rows: list[dict[str, Any]], *, label: str, path: str, source: str, preferred: bool = False) -> None:
    if not path:
        return
    path = str(path)
    if any(row.get("path") == path for row in rows):
        return
    stat = safe_stat(path)
    kind = media_kind(path)
    rows.append({
        "label": label or Path(path).name,
        "path": path,
        "kind": kind,
        "source": source,
        "preferred": bool(preferred),
        "exists": bool(stat["exists"]),
        "sizeBytes": int(stat["sizeBytes"] or 0),
        "uri": file_uri(path) if stat["exists"] else "",
        "openCommand": f"open {shell_quote(path)}",
        "embeddable": bool(stat["exists"] and should_embed(path, int(stat["sizeBytes"] or 0))),
    })


def collect_nested_media(packet: dict[str, Any], rows: list[dict[str, Any]], source: str) -> None:
    for artifact in as_list(packet.get("artifacts")):
        if not isinstance(artifact, dict):
            continue
        label = str(artifact.get("label") or artifact.get("key") or "artifact")
        append_evidence(rows, label=label, path=str(artifact.get("path") or ""), source=source)
        for snippet in as_list(artifact.get("snippets")):
            if isinstance(snippet, dict):
                append_evidence(
                    rows,
                    label=f"{label} snippet - {snippet.get('label') or snippet.get('id') or Path(str(snippet.get('outputPath') or '')).name}",
                    path=str(snippet.get("outputPath") or ""),
                    source=source,
                    preferred=True,
                )
        for still in as_list(artifact.get("stills")):
            if isinstance(still, dict):
                append_evidence(
                    rows,
                    label=f"{label} still - {still.get('label') or still.get('id') or Path(str(still.get('outputPath') or '')).name}",
                    path=str(still.get("outputPath") or ""),
                    source=source,
                    preferred=True,
                )
    for key in ("artifactRows", "evidenceRows", "mediaEvidenceRows"):
        for row in as_list(packet.get(key)):
            if not isinstance(row, dict):
                continue
            append_evidence(rows, label=str(row.get("label") or row.get("key") or "evidence"), path=str(row.get("path") or ""), source=source)
            append_evidence(rows, label=f"{row.get('label') or row.get('key') or 'evidence'} first snippet", path=str(row.get("firstSnippetPath") or ""), source=source, preferred=True)


def load_top_review(release_root: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    pointer_path = release_root / "review-board" / "top-review-companions" / "latest-studio-top-review-companion.json"
    pointer = load_json(pointer_path)
    full = load_json(Path(str(pointer.get("jsonPath") or ""))) if pointer.get("jsonPath") else {}
    if not full:
        full = pointer
    return pointer, full


def make_decision_template(item: dict[str, Any], evidence_rows: list[dict[str, Any]]) -> str:
    template = item.get("localDecisionNoteTemplate") if isinstance(item.get("localDecisionNoteTemplate"), dict) else {}
    existing = str(template.get("copyPasteMarkdown") or "").strip()
    if existing:
        return existing + "\n"
    evidence_lines = "\n".join(f"- {row['path']}" for row in evidence_rows[:10]) or "- No local evidence paths were found."
    return f"""## Studio watch/listen decision note

- Item: {item.get('label') or item.get('id') or 'Review item'}
- Episode: {item.get('episode') or 'unknown'}
- Decision: <promote / refine / hold / need more evidence>
- Reason:
- Evidence reviewed:
{evidence_lines}
- Follow-up for Codex:
- Follow-up for Charlie/Mako/Homer:
- Explicit non-claims: not published, not uploaded, not scheduled, no external receipt, no source media mutated, no older version overwritten.
"""


def make_decision_command_rows(item_id: str) -> list[dict[str, str]]:
    commands = [
        ("pending", "Mark as pending / not decided", "Use when evidence exists but no human judgment has happened yet."),
        ("promote", "Promote after review", "Use when a reviewer believes this item can move to the next local package or review step."),
        ("refine", "Refine or rebuild", "Use when the evidence reveals a repair, rebuild, or better candidate is needed."),
        ("hold", "Hold current package", "Use when the item should stay blocked until a named concern is resolved."),
        ("need-more-evidence", "Need more evidence", "Use when the current room does not provide enough evidence to decide safely."),
    ]
    rows: list[dict[str, str]] = []
    for decision, label, when_to_use in commands:
        dry_notes = f"watch/listen local dry-run: {when_to_use}"
        record_notes = f"replace with evidence-backed notes: {when_to_use}"
        rows.append({
            "decision": decision,
            "label": label,
            "whenToUse": when_to_use,
            "dryRunCommand": f"./script/agentctl.sh studio-review-decision-dry-run {shell_quote(item_id)} {shell_quote(decision)} {shell_quote('Codex')} {shell_quote(dry_notes)}",
            "recordCommand": f"./script/agentctl.sh studio-review-decision {shell_quote(item_id)} {shell_quote(decision)} {shell_quote('<reviewer>')} {shell_quote(record_notes)}",
            "safety": "Dry-run previews only. Record writes only the local Studio review decision ledger; it does not publish, upload, schedule, promote a package, mutate source media, overwrite versions, or create receipt truth.",
        })
    return rows


def make_room_item(item: dict[str, Any]) -> dict[str, Any]:
    evidence_rows: list[dict[str, Any]] = []
    for evidence in as_list(item.get("evidenceToOpen")):
        if isinstance(evidence, dict):
            append_evidence(
                evidence_rows,
                label=str(evidence.get("label") or "Evidence"),
                path=str(evidence.get("path") or ""),
                source="top-review-companion",
            )
    collect_nested_media(item, evidence_rows, "top-review-companion")
    for evidence in list(evidence_rows):
        if evidence.get("kind") == "json" and evidence.get("exists"):
            collect_nested_media(load_json(Path(str(evidence["path"]))), evidence_rows, str(evidence.get("label") or "nested-json"))

    preferred_media = [row for row in evidence_rows if row.get("preferred") and row.get("exists") and row.get("embeddable")]
    embeddable_media = [row for row in evidence_rows if row.get("exists") and row.get("embeddable")]
    large_media = [row for row in evidence_rows if row.get("exists") and row.get("kind") in {"video", "audio"} and not row.get("embeddable")]
    document_evidence = [row for row in evidence_rows if row.get("kind") not in {"video", "audio", "image"}]
    note_template = make_decision_template(item, evidence_rows)
    item_id = str(item.get("id") or item.get("label") or "review-item")
    item_label = str(item.get("label") or item.get("id") or "Review item")
    decision_command_rows = make_decision_command_rows(item_id)
    human_ask = str(item.get("humanAsk") or "Review the local evidence, write a local decision note, and choose the next reversible action.")
    next_action = str(item.get("nextSafestAction") or item.get("acceptanceRule") or "Open the local evidence and choose promote, refine, hold, or need-more-evidence.")
    return {
        "id": item_id,
        "kind": str(item.get("kind") or "review"),
        "episode": item.get("episode") or "unknown",
        "label": item_label,
        "status": str(item.get("status") or "review-evidence-ready"),
        "humanAsk": human_ask,
        "nextSafestAction": next_action,
        "reviewerQuestions": [str(q) for q in as_list(item.get("reviewerQuestions"))],
        "decisionRows": [row for row in as_list(item.get("decisionRows")) if isinstance(row, dict)],
        "doNotDo": [str(value) for value in as_list(item.get("doNotDo"))],
        "evidenceRows": evidence_rows,
        "preferredMediaRows": preferred_media,
        "embeddableMediaRows": embeddable_media,
        "largeMediaRows": large_media,
        "documentEvidenceRows": document_evidence,
        "localDecisionNoteTemplate": note_template,
        "localDecisionCommands": decision_command_rows,
        "firstSafeCommand": decision_command_rows[0]["dryRunCommand"] if decision_command_rows else "",
        "decisionCommand": decision_command_rows[0]["recordCommand"] if decision_command_rows else "",
        "decisionSafety": decision_command_rows[0]["safety"] if decision_command_rows else "",
        "firstSafeAction": {
            "label": "Open watch/listen review room",
            "command": "open <room-html-path>",
            "safety": "Opens local review evidence only. No mutation, approval, publishing, upload, schedule, or receipt truth.",
        },
        "counts": {
            "evidenceRows": len(evidence_rows),
            "preferredMediaRows": len(preferred_media),
            "embeddableMediaRows": len(embeddable_media),
            "largeMediaRows": len(large_media),
            "documentEvidenceRows": len(document_evidence),
            "localDecisionCommands": len(decision_command_rows),
        },
    }


def evidence_html(row: dict[str, Any]) -> str:
    label = esc(row.get("label"))
    path = esc(row.get("path"))
    kind = row.get("kind")
    uri = esc(row.get("uri"))
    size = int(row.get("sizeBytes") or 0)
    size_mb = size / 1024 / 1024 if size else 0
    header = f"<div class='evidence-head'><strong>{label}</strong><span>{esc(kind)} · {size_mb:.1f} MB</span></div>"
    body = ""
    if row.get("embeddable") and uri:
        if kind == "video":
            body = f"<video controls preload='metadata' src='{uri}'></video>"
        elif kind == "audio":
            body = f"<audio controls preload='metadata' src='{uri}'></audio>"
        elif kind == "image":
            body = f"<img src='{uri}' alt='{label}' />"
    else:
        note = "large media: open locally rather than embedding" if kind in {"video", "audio"} and row.get("exists") else "local evidence link"
        body = f"<p class='muted'>{esc(note)}</p>"
    footer = f"<code>{path}</code><a href='{uri}'>{'Open' if uri else 'Missing'}</a>"
    return f"<article class='evidence {esc(kind)}'>{header}{body}<footer>{footer}</footer></article>"


def write_markdown(payload: dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "# Studio watch/listen review room",
        "",
        f"- Updated: `{payload['updatedAt']}`",
        f"- Status: `{payload['status']}`",
        f"- Review items: `{payload['counts']['reviewItems']}`",
        f"- Media evidence rows: `{payload['counts']['mediaEvidenceRows']}`",
        f"- Embeddable media rows: `{payload['counts']['embeddableMediaRows']}`",
        "- Truth: local review evidence only; not approval, promotion, publishing, upload, schedule, or receipt truth.",
        "",
    ]
    for item in payload["reviewItems"]:
        lines.extend([
            f"## {item['label']}",
            "",
            f"- Episode: `{item['episode']}`",
            f"- Kind: `{item['kind']}`",
            f"- Status: `{item['status']}`",
            f"- Human ask: {item['humanAsk']}",
            f"- Next safest action: {item['nextSafestAction']}",
            "",
            "### Evidence",
            "",
        ])
        for row in item["evidenceRows"]:
            status = "exists" if row.get("exists") else "missing"
            lines.append(f"- `{status}` `{row.get('kind')}` {row.get('label')}: `{row.get('path')}`")
        lines.extend(["", "### Safe local decision commands", ""])
        for row in item.get("localDecisionCommands", []):
            lines.extend([
                f"#### {row.get('label')}",
                "",
                f"- When to use: {row.get('whenToUse')}",
                f"- Dry-run: `{row.get('dryRunCommand')}`",
                f"- Record local ledger: `{row.get('recordCommand')}`",
                f"- Safety: {row.get('safety')}",
                "",
            ])
        lines.extend(["", "### Decision note template", "", "```markdown", item["localDecisionNoteTemplate"].rstrip(), "```", ""])
    path.write_text("\n".join(lines), encoding="utf-8")


def write_csv(payload: dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["itemId", "episode", "kind", "label", "evidenceLabel", "evidenceKind", "exists", "sizeBytes", "path", "openCommand"])
        writer.writeheader()
        for item in payload["reviewItems"]:
            for row in item["evidenceRows"]:
                writer.writerow({
                    "itemId": item["id"],
                    "episode": item["episode"],
                    "kind": item["kind"],
                    "label": item["label"],
                    "evidenceLabel": row.get("label"),
                    "evidenceKind": row.get("kind"),
                    "exists": row.get("exists"),
                    "sizeBytes": row.get("sizeBytes"),
                    "path": row.get("path"),
                    "openCommand": row.get("openCommand"),
                })


def write_html(payload: dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    metric_cards = "".join(
        f"<div class='metric'><b>{esc(value)}</b><span>{esc(label)}</span></div>"
        for label, value in [
            ("review items", payload["counts"].get("reviewItems")),
            ("media evidence", payload["counts"].get("mediaEvidenceRows")),
            ("embeddable", payload["counts"].get("embeddableMediaRows")),
            ("large/open-local", payload["counts"].get("largeMediaRows")),
        ]
    )
    item_html = []
    for item in payload["reviewItems"]:
        evidence = "".join(evidence_html(row) for row in (item.get("preferredMediaRows") or item.get("embeddableMediaRows") or item.get("evidenceRows")[:8]))
        docs = "".join(
            f"<li><a href='{esc(row.get('uri'))}'>{esc(row.get('label'))}</a><code>{esc(row.get('path'))}</code></li>"
            for row in item.get("documentEvidenceRows", [])[:8]
            if row.get("uri")
        )
        questions = "".join(f"<li>{esc(q)}</li>" for q in item.get("reviewerQuestions", [])[:8]) or "<li>Watch/listen the evidence and choose the next reversible action.</li>"
        decisions = "".join(
            f"<tr><td>{esc(row.get('decision'))}</td><td>{esc(row.get('means'))}</td><td>{esc(row.get('codexMayDo'))}</td><td>{esc(row.get('watchFor'))}</td></tr>"
            for row in item.get("decisionRows", [])[:8]
        )
        if not decisions:
            decisions = "<tr><td>Review locally</td><td>Use the evidence to decide promote, refine, hold, or request more evidence.</td><td>Prepare local packets only.</td><td>No fake approval or publication claims.</td></tr>"
        do_not = "".join(f"<li>{esc(value)}</li>" for value in item.get("doNotDo", [])[:8]) or "<li>Do not approve, publish, upload, schedule, overwrite, mutate sources, or create receipt truth from this room.</li>"
        command_rows = "".join(
            f"<tr><td>{esc(row.get('label'))}<br><small>{esc(row.get('whenToUse'))}</small></td><td><code>{esc(row.get('dryRunCommand'))}</code></td><td><code>{esc(row.get('recordCommand'))}</code><p>{esc(row.get('safety'))}</p></td></tr>"
            for row in item.get("localDecisionCommands", [])
        )
        item_html.append(f"""
<section class='item-card'>
  <div class='item-top'>
    <div>
      <p class='eyebrow'>{esc(item['kind'])} · episode {esc(item['episode'])}</p>
      <h2>{esc(item['label'])}</h2>
      <p class='status'>{esc(item['status'])}</p>
    </div>
    <div class='next'>{esc(item['nextSafestAction'])}</div>
  </div>
  <p class='ask'>{esc(item['humanAsk'])}</p>
  <div class='evidence-grid'>{evidence}</div>
  <details open><summary>Reviewer questions</summary><ul>{questions}</ul></details>
  <details><summary>Document evidence</summary><ul class='doc-list'>{docs or '<li>No document links found.</li>'}</ul></details>
  <details><summary>Decision menu</summary><table><thead><tr><th>Decision</th><th>Means</th><th>Codex may do</th><th>Watch for</th></tr></thead><tbody>{decisions}</tbody></table></details>
  <details open><summary>Safe local decision commands</summary><table><thead><tr><th>Decision</th><th>Dry-run first</th><th>Record local ledger only</th></tr></thead><tbody>{command_rows}</tbody></table></details>
  <details><summary>Do not do</summary><ul>{do_not}</ul></details>
  <details><summary>Copy local decision note template</summary><pre>{esc(item['localDecisionNoteTemplate'])}</pre></details>
</section>
""")
    page = f"""<!doctype html>
<html lang='en'>
<head>
<meta charset='utf-8' />
<meta name='viewport' content='width=device-width, initial-scale=1' />
<title>Studio watch/listen review room</title>
<style>
:root {{ color-scheme: dark; --bg:#111915; --panel:#19231d; --panel2:#223027; --ink:#f4efdf; --muted:#b9ad92; --gold:#f1c84b; --leaf:#65d37e; --water:#6fc7df; --clay:#d46a4c; --line:rgba(244,239,223,.14); }}
* {{ box-sizing:border-box; }} body {{ margin:0; font:15px/1.45 -apple-system,BlinkMacSystemFont,'Avenir Next',Inter,sans-serif; background:radial-gradient(circle at top left, #263822, var(--bg) 42%, #08110e); color:var(--ink); }}
a {{ color:var(--water); }} code, pre {{ white-space:pre-wrap; word-break:break-word; }}
.hero {{ padding:48px 6vw 28px; border-bottom:1px solid var(--line); background:linear-gradient(135deg, rgba(101,211,126,.16), rgba(241,200,75,.08)); }}
.eyebrow {{ margin:0 0 8px; letter-spacing:.22em; text-transform:uppercase; color:var(--gold); font-size:12px; font-weight:800; }}
h1 {{ margin:0; font-size:clamp(34px,5vw,68px); line-height:.96; max-width:980px; }}
.hero p {{ max-width:900px; color:var(--muted); font-size:18px; }}
.metrics {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:12px; margin-top:24px; max-width:960px; }}
.metric {{ background:rgba(0,0,0,.24); border:1px solid var(--line); border-radius:18px; padding:16px; }} .metric b {{ display:block; font-size:28px; color:var(--leaf); }} .metric span {{ color:var(--muted); text-transform:uppercase; letter-spacing:.12em; font-size:11px; font-weight:800; }}
main {{ padding:28px 6vw 64px; }}
.truth {{ border:1px solid rgba(241,200,75,.28); background:rgba(241,200,75,.1); border-radius:18px; padding:16px 18px; margin-bottom:22px; color:#fff4bc; }}
.item-card {{ border:1px solid var(--line); background:rgba(25,35,29,.88); border-radius:26px; padding:22px; margin:0 0 24px; box-shadow:0 24px 80px rgba(0,0,0,.25); }}
.item-top {{ display:grid; grid-template-columns:minmax(0,1fr) minmax(240px,420px); gap:18px; align-items:start; }}
h2 {{ margin:0; font-size:30px; }} .status {{ display:inline-flex; margin:10px 0 0; padding:6px 10px; border-radius:999px; color:var(--leaf); background:rgba(101,211,126,.11); font-weight:800; }}
.next {{ border-left:4px solid var(--gold); background:rgba(241,200,75,.1); padding:14px; border-radius:14px; color:#fff0ad; font-weight:700; }}
.ask {{ color:var(--ink); font-size:17px; }}
.evidence-grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:14px; margin:18px 0; }}
.evidence {{ border:1px solid var(--line); background:rgba(0,0,0,.22); border-radius:18px; overflow:hidden; }} .evidence-head {{ display:flex; justify-content:space-between; gap:12px; padding:12px; border-bottom:1px solid var(--line); color:var(--gold); }} .evidence-head span {{ color:var(--muted); font-size:12px; }}
video, audio, img {{ width:100%; display:block; background:#050705; }} video {{ aspect-ratio:16/9; }} audio {{ padding:14px; }} img {{ max-height:360px; object-fit:contain; }}
.evidence p {{ padding:12px; margin:0; }} footer {{ display:grid; gap:8px; padding:12px; border-top:1px solid var(--line); }} footer code {{ color:var(--muted); font-size:12px; }}
details {{ margin-top:12px; background:rgba(0,0,0,.18); border:1px solid var(--line); border-radius:16px; padding:12px; }} summary {{ cursor:pointer; font-weight:850; color:var(--gold); }}
ul {{ margin:10px 0 0; padding-left:20px; }} table {{ width:100%; border-collapse:collapse; margin-top:12px; }} th, td {{ border-bottom:1px solid var(--line); text-align:left; vertical-align:top; padding:10px; }} th {{ color:var(--gold); }} pre {{ background:#07100b; border:1px solid var(--line); border-radius:14px; padding:14px; color:#e5dfca; }}
.doc-list code {{ display:block; color:var(--muted); margin:2px 0 8px; }}
@media (max-width: 860px) {{ .item-top {{ grid-template-columns:1fr; }} .hero {{ padding-top:32px; }} }}
</style>
</head>
<body>
<header class='hero'>
  <p class='eyebrow'>Quipsly Studio · local review evidence</p>
  <h1>Watch and listen before the runway moves.</h1>
  <p>This room gathers the current top Studio review questions into one calm place. It helps humans decide; it does not approve, publish, promote, upload, schedule, overwrite, mutate sources, or create receipts.</p>
  <div class='metrics'>{metric_cards}</div>
</header>
<main>
  <div class='truth'>{esc(payload['truth']['plainEnglish'])}</div>
  {''.join(item_html)}
</main>
</body>
</html>
"""
    path.write_text(page, encoding="utf-8")


def build_room(release_root: Path) -> dict[str, Any]:
    pointer, top_review = load_top_review(release_root)
    session_dir = release_root / "review-board" / "studio-watch-listen-review-rooms" / stamp()
    review_items = [make_room_item(item) for item in as_list(top_review.get("reviewItems")) if isinstance(item, dict)]
    counts = {
        "reviewItems": len(review_items),
        "durationCandidateItems": sum(1 for item in review_items if item.get("kind") == "duration-candidate-review"),
        "syncInvestigationItems": sum(1 for item in review_items if item.get("kind") == "sync-investigation"),
        "evidenceRows": sum(int(item["counts"].get("evidenceRows") or 0) for item in review_items),
        "mediaEvidenceRows": sum(1 for item in review_items for row in item.get("evidenceRows", []) if row.get("kind") in {"video", "audio", "image"}),
        "embeddableMediaRows": sum(int(item["counts"].get("embeddableMediaRows") or 0) for item in review_items),
        "largeMediaRows": sum(int(item["counts"].get("largeMediaRows") or 0) for item in review_items),
        "localDecisionNoteTemplates": sum(1 for item in review_items if item.get("localDecisionNoteTemplate")),
        "localDecisionCommandRows": sum(int(item["counts"].get("localDecisionCommands") or 0) for item in review_items),
        "externalPublishing": False,
        "externalSchedulesCreated": False,
        "receiptTruthCreated": False,
        "originalsMutated": False,
        "versionsOverwritten": False,
        "sourceFilesMutated": False,
    }
    html_path = session_dir / "index.html"
    json_path = session_dir / "studio-watch-listen-review-room.json"
    markdown_path = session_dir / "STUDIO-WATCH-LISTEN-REVIEW-ROOM.md"
    csv_path = session_dir / "studio-watch-listen-evidence.csv"
    payload: dict[str, Any] = {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "updatedAt": iso_now(),
        "status": "watch-listen-review-ready" if review_items else "no-review-items-found",
        "releaseRoot": str(release_root),
        "sessionDir": str(session_dir),
        "sourceTopReviewPointer": str(release_root / "review-board" / "top-review-companions" / "latest-studio-top-review-companion.json"),
        "sourceTopReviewHtml": top_review.get("htmlPath") or pointer.get("htmlPath") or "",
        "sourceTopReviewJson": top_review.get("jsonPath") or pointer.get("jsonPath") or "",
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "counts": counts,
        "reviewItems": review_items,
        "humanAsk": "Open this room, watch/listen the embeddable evidence first, then write a local decision note for each top review item.",
        "nextSafestAction": "Open the watch/listen review room and choose promote/refine/hold/need-more-evidence locally. Do not change package/publication truth until explicitly approved.",
        "firstSafeAction": {
            "label": "Open Studio watch/listen review room",
            "path": str(html_path),
            "command": f"open {shell_quote(str(html_path))}",
            "safety": "Opens local evidence only. No approval, promotion, publish, upload, schedule, overwrite, source mutation, or receipt truth.",
        },
        "truth": {
            "plainEnglish": "This is a local review room. It helps humans and Codex inspect evidence and prepare notes. It is not publication, approval, promotion, upload, schedule, overwrite, deletion, source mutation, or receipt truth.",
            "externalPublishing": False,
            "externalSchedulesCreated": False,
            "receiptTruthCreated": False,
            "originalsMutated": False,
            "versionsOverwritten": False,
            "sourceFilesMutated": False,
        },
        "agentSafeParallelWork": "Codex can improve local evidence grouping, note templates, snippets, and reviewer clarity. Codex must not approve, publish, upload, schedule, overwrite, delete, mutate sources, or create receipt truth without explicit human approval for that exact action.",
    }
    for item in payload["reviewItems"]:
        item["firstSafeAction"]["command"] = payload["firstSafeAction"]["command"]
    write_html(payload, html_path)
    write_markdown(payload, markdown_path)
    write_csv(payload, csv_path)
    write_json(json_path, payload)
    pointer_payload = {
        "schema": SCHEMA,
        "updatedAt": payload["updatedAt"],
        "status": payload["status"],
        "counts": counts,
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "firstSafeAction": payload["firstSafeAction"],
        "humanAsk": payload["humanAsk"],
        "nextSafestAction": payload["nextSafestAction"],
        "firstReviewItem": review_items[0] if review_items else {},
        "truth": payload["truth"],
        "agentSafeParallelWork": payload["agentSafeParallelWork"],
    }
    latest_pointer = release_root / "review-board" / "latest-studio-watch-listen-review-room.json"
    latest_pointer.parent.mkdir(parents=True, exist_ok=True)
    write_json(latest_pointer, pointer_payload)
    nested_pointer = release_root / "review-board" / "studio-watch-listen-review-rooms" / "latest-studio-watch-listen-review-room.json"
    write_json(nested_pointer, pointer_payload)
    return pointer_payload


def main(argv: list[str]) -> int:
    release_root = Path(argv[1]) if len(argv) > 1 else DEFAULT_RELEASE_ROOT
    pointer = build_room(release_root)
    print(json.dumps(pointer, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
