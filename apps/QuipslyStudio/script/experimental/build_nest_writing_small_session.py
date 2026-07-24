#!/usr/bin/env python3
"""Build one source-backed Nest writing small-session packet.

This extracts a manageable ManuscriptBlock from the current living manuscript and
wraps it with a draft scaffold, source trail, and review checklist. It does not
edit source files, replace canonical manuscript text, publish, upload, schedule,
or create receipt truth.
"""
from __future__ import annotations

import csv
import html
import json
import re
import shlex
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_NEST_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/NestWriting")
DEFAULT_SOURCE = Path("/Users/wall-e/Dev/high-ground-studio/apps/web/content/books/learning-to-lead/manuscript/learning-to-lead.living.mdx")
SCHEMA = "quipsly.nest-writing.small-session.v1"
SKIP_TYPES = {"acknowledgment", "metadata", "source-note"}


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-small-writing-session")


def slugify(value: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9]+", "-", value.strip()).strip("-").lower()
    return slug or "writing-session"


def load_json(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def esc(value: Any) -> str:
    return html.escape(str(value or ""))


def shell_quote(value: str) -> str:
    return shlex.quote(value)


def words(text: str) -> list[str]:
    return re.findall(r"[A-Za-z0-9']+", text)


def trim_words(text: str, limit: int) -> str:
    tokens = words(text)
    if len(tokens) <= limit:
        return re.sub(r"\s+", " ", text).strip()
    return " ".join(tokens[:limit]).strip() + "..."


def parse_attrs(raw: str) -> dict[str, Any]:
    attrs: dict[str, Any] = {}
    for key, value in re.findall(r'(\w+)="([^"]*)"', raw):
        attrs[key] = value
    tag_match = re.search(r'tags=\{\[(.*?)\]\}', raw, re.S)
    if tag_match:
        attrs["tags"] = [item.strip().strip('"\'') for item in tag_match.group(1).split(",") if item.strip()]
    return attrs


def parse_blocks(text: str) -> list[dict[str, Any]]:
    blocks: list[dict[str, Any]] = []
    line_starts = [0]
    for match in re.finditer("\n", text):
        line_starts.append(match.end())

    def line_for(index: int) -> int:
        line = 1
        for i, start in enumerate(line_starts, 1):
            if start > index:
                break
            line = i
        return line

    for match in re.finditer(r"<ManuscriptBlock\b(.*?)>(.*?)</ManuscriptBlock>", text, re.S):
        attrs = parse_attrs(match.group(1))
        body = html.unescape(match.group(2).strip())
        blocks.append({
            "id": attrs.get("id") or f"block-{len(blocks)+1}",
            "title": attrs.get("title") or attrs.get("id") or f"Block {len(blocks)+1}",
            "type": attrs.get("type") or "manuscript-block",
            "voice": attrs.get("voice") or "unknown",
            "status": attrs.get("status") or "unknown",
            "chapter": attrs.get("chapter") or "unknown",
            "source": attrs.get("source") or "",
            "tags": attrs.get("tags") or [],
            "body": body,
            "wordCount": len(words(body)),
            "lineStart": line_for(match.start()),
            "lineEnd": line_for(match.end()),
        })
    return blocks


def choose_block(blocks: list[dict[str, Any]], block_id: str) -> tuple[dict[str, Any], int]:
    if not blocks:
        raise SystemExit("No ManuscriptBlock entries found in source manuscript.")
    if block_id and block_id not in {"first", "next", ""}:
        for index, block in enumerate(blocks):
            if block["id"] == block_id or slugify(block["title"]) == block_id:
                return block, index
        raise SystemExit(f"No manuscript block found for: {block_id}")
    for index, block in enumerate(blocks):
        if str(block.get("type") or "").lower() not in SKIP_TYPES and int(block.get("wordCount") or 0) > 40:
            return block, index
    return blocks[0], 0


def source_path_from_author(nest_root: Path) -> Path:
    author = load_json(nest_root / "latest-nest-writing-author-desk.json")
    first_task = author.get("firstTask") if isinstance(author.get("firstTask"), dict) else {}
    small = first_task.get("smallSessionPlan") if isinstance(first_task.get("smallSessionPlan"), dict) else {}
    source = small.get("sourceToOpenFirst") or first_task.get("openFirstSource") or ""
    if isinstance(source, str) and source.startswith("open "):
        source = source.split("'", 2)[1] if "'" in source else ""
    path = Path(str(source)) if source else DEFAULT_SOURCE
    return path if path.exists() else DEFAULT_SOURCE


def example_draft(block: dict[str, Any]) -> str:
    title = str(block.get("title") or "this section")
    voice = str(block.get("voice") or "human")
    seed = trim_words(str(block.get("body") or ""), 70)
    if voice == "homer":
        lead = f"In `{title}`, Homer is not just preserving a memory; he is showing where a leadership instinct first took root."
    elif voice == "charlie":
        lead = f"In `{title}`, Charlie can act as the connective tissue: preserving the story while naming the pattern it reveals."
    else:
        lead = f"`{title}` is a small source-backed writing unit that can become clearer without losing its original texture."
    return (
        f"{lead} The source seed says: {seed} "
        "A good next draft should keep the lived detail, name the lesson only as far as the evidence supports, and leave any uncertain bridge work visible for human review."
    )


def source_backed_draft_candidate(block: dict[str, Any]) -> str:
    title = str(block.get("title") or "Untitled source block")
    voice = str(block.get("voice") or "unknown")
    excerpt = trim_words(str(block.get("body") or ""), 115)
    if voice == "homer":
        opener = (
            f"{title} can open as a grounded memory before it becomes a lesson. "
            "The useful shape is not to polish the story until it sounds like a leadership poster; "
            "it is to let the lived moment carry the weight first."
        )
    elif voice == "charlie":
        opener = (
            f"{title} can work as a bridge between the event and the pattern underneath it. "
            "The draft should be clear enough to help the reader orient, but not so neat that it erases the human texture."
        )
    else:
        opener = (
            f"{title} is a source-backed fragment that can become a stronger section by preserving what is known, "
            "marking what is inferred, and leaving room for human revision."
        )
    return "\n\n".join([
        opener,
        f"Source-grounded material to preserve: {excerpt}",
        (
            "Revision direction: keep the original voice visible, add only the connective tissue needed for the reader to understand why this moment matters, "
            "and mark any claim that needs a human source check before it becomes canonical."
        ),
    ])


def build_payload(nest_root: Path, block_id: str) -> dict[str, Any]:
    source_path = source_path_from_author(nest_root)
    text = source_path.read_text(encoding="utf-8", errors="replace")
    blocks = parse_blocks(text)
    block, index = choose_block(blocks, block_id)
    previous_block = blocks[index - 1] if index > 0 else None
    next_block = blocks[index + 1] if index + 1 < len(blocks) else None
    session_dir = nest_root / "SmallWritingSessions" / f"{stamp()}-{slugify(block['id'])}"
    html_path = session_dir / "index.html"
    payload = {
        "schema": SCHEMA,
        "status": "small-writing-session-ready",
        "updatedAt": iso_now(),
        "sessionDir": str(session_dir),
        "htmlPath": str(html_path),
        "jsonPath": str(session_dir / "small-writing-session.json"),
        "markdownPath": str(session_dir / "START-HERE-small-writing-session.md"),
        "csvPath": str(session_dir / "small-writing-session.csv"),
        "draftWorkspacePath": str(session_dir / "draft-workspace.md"),
        "pointerPath": str(nest_root / "latest-nest-writing-small-session.json"),
        "sourcePath": str(source_path),
        "counts": {
            "manuscriptBlocks": len(blocks),
            "selectedBlockWords": block["wordCount"],
            "sourceFilesMutated": False,
            "canonicalManuscriptReplaced": False,
            "externalPublishing": False,
            "receiptTruthCreated": False,
            "versionsOverwritten": False,
        },
        "firstSafeAction": {
            "label": "Open small writing session",
            "path": str(html_path),
            "command": f"open {shell_quote(str(html_path))}",
            "safety": "Opens local source-backed writing session only. No source files, manuscript canon, publications, schedules, uploads, or receipts are changed.",
        },
        "sourceSlice": {
            "id": block["id"],
            "title": block["title"],
            "type": block["type"],
            "voice": block["voice"],
            "status": block["status"],
            "chapter": block["chapter"],
            "tags": block["tags"],
            "source": block["source"],
            "lineStart": block["lineStart"],
            "lineEnd": block["lineEnd"],
            "wordCount": block["wordCount"],
            "excerpt": block["body"],
            "previousBlock": {"id": previous_block["id"], "title": previous_block["title"]} if previous_block else None,
            "nextBlock": {"id": next_block["id"], "title": next_block["title"]} if next_block else None,
        },
        "smallSessionPlan": {
            "sessionLengthMinutes": 25,
            "goal": f"Improve or outline `{block['title']}` without touching the source file.",
            "rhythm": [
                "0-3 min: read the source excerpt and identify the one thing it is trying to preserve.",
                "3-8 min: write a 5-bullet intent map: story, lesson, evidence, voice, uncertainty.",
                "8-18 min: draft one improved pass, bridge paragraph, or outline section.",
                "18-23 min: compare the draft against the source and mark anything that might be invented, flattened, or too certain.",
                "23-25 min: decide revise, expand, cut, source-check, or hold.",
            ],
            "ifBlocked": "Write questions and source notes instead of forcing prose.",
        },
        "draftScaffold": {
            "intentMap": [
                "What lived moment, claim, or pattern is this block preserving?",
                "What should stay in the original voice?",
                "What needs a Charlie bridge, research note, example, or citation?",
                "What would make this clearer without sanding off the useful weirdness?",
                "What must remain uncertain until a human checks the source?",
            ],
            "exampleDraftSeed": example_draft(block),
            "sourceBackedDraftCandidate": source_backed_draft_candidate(block),
            "reviewDecisions": ["revise", "expand", "cut", "source-check", "hold", "promote-to-human-canon-review"],
        },
        "draftWorkspace": {
            "status": "sidecar-draft-ready",
            "path": str(session_dir / "draft-workspace.md"),
            "workingTitle": block["title"],
            "purpose": "Create one source-backed draft pass or review note without touching canonical manuscript files.",
            "uncertaintyLedger": [
                "What did the source actually say?",
                "What did this draft infer?",
                "What needs Homer/Charlie review before becoming canon?",
                "What should remain weird, specific, or unfinished rather than normalized?",
            ],
            "canonicalPromotionRule": "This workspace can inspire canon, but it is not canon until a human explicitly promotes or rewrites it in the manuscript editor.",
        },
        "agentSafeParallelWork": "Codex may create draft variants, outlines, source notes, bridge paragraphs, and review questions for this selected block. Codex must not edit the source file, replace canonical manuscript text, publish, schedule, upload, or create receipts.",
        "humanAsk": "Use one small source-backed block, not the whole manuscript. Decide what to draft, revise, source-check, hold, or route to canonical human review.",
        "nextSafestAction": "Open the small writing session, read the selected source block, then create or review one draft pass with uncertainty visible.",
        "truth": {
            "sourceFilesMutated": False,
            "canonicalManuscriptReplaced": False,
            "externalPublishing": False,
            "receiptTruthCreated": False,
            "versionsOverwritten": False,
            "aiDraftingAllowed": True,
            "blackBoxWritingAllowedButNotOpaque": True,
        },
    }
    return payload


def write_markdown(payload: dict[str, Any]) -> None:
    source = payload["sourceSlice"]
    lines = [
        "# Small writing session",
        "",
        f"- Updated: `{payload['updatedAt']}`",
        f"- Source: `{payload['sourcePath']}`",
        f"- Block: `{source['id']}`",
        f"- Title: {source['title']}",
        f"- Voice: `{source['voice']}`",
        f"- Word count: `{source['wordCount']}`",
        "",
        payload["humanAsk"],
        "",
        "## Source excerpt",
        "",
        "```md",
        source["excerpt"],
        "```",
        "",
        "## 25-minute plan",
        "",
    ]
    for step in payload["smallSessionPlan"]["rhythm"]:
        lines.append(f"- {step}")
    lines.extend(["", "## Draft scaffold", ""])
    for item in payload["draftScaffold"]["intentMap"]:
        lines.append(f"- {item}")
    lines.extend([
        "",
        "### Example draft seed",
        "",
        payload["draftScaffold"]["exampleDraftSeed"],
        "",
        "### Source-backed draft candidate",
        "",
        payload["draftScaffold"]["sourceBackedDraftCandidate"],
        "",
        "## Safety truth",
        "",
        "This packet does not edit source files, replace canonical manuscript text, publish, upload, schedule, or create receipt truth.",
        "",
    ])
    Path(payload["markdownPath"]).write_text("\n".join(lines), encoding="utf-8")


def write_draft_workspace(payload: dict[str, Any]) -> None:
    source = payload["sourceSlice"]
    workspace = payload["draftWorkspace"]
    lines = [
        f"# Draft workspace: {source['title']}",
        "",
        f"Source block: `{source['id']}`",
        f"Voice: `{source['voice']}`",
        f"Chapter: `{source['chapter']}`",
        f"Source lines: `{source['lineStart']}-{source['lineEnd']}`",
        "",
        "> This is a sidecar workspace. It is not canon until a human explicitly promotes or rewrites it in the manuscript editor.",
        "",
        "## Source excerpt",
        "",
        "```md",
        source["excerpt"],
        "```",
        "",
        "## Intent map",
        "",
    ]
    for item in payload["draftScaffold"]["intentMap"]:
        lines.append(f"- [ ] {item}")
    lines.extend([
        "",
        "## Draft candidate",
        "",
        payload["draftScaffold"]["sourceBackedDraftCandidate"],
        "",
        "## Human/agent revision notes",
        "",
        "- ",
        "",
        "## Uncertainty ledger",
        "",
    ])
    for item in workspace["uncertaintyLedger"]:
        lines.append(f"- [ ] {item}")
    lines.extend([
        "",
        "## Promotion decision",
        "",
        "- [ ] Revise more in sidecar",
        "- [ ] Source-check before canon",
        "- [ ] Promote idea only, not prose",
        "- [ ] Promote rewritten prose to manuscript editor",
        "- [ ] Hold",
        "",
        f"Promotion rule: {workspace['canonicalPromotionRule']}",
        "",
    ])
    Path(payload["draftWorkspacePath"]).write_text("\n".join(lines), encoding="utf-8")


def write_html(payload: dict[str, Any]) -> None:
    source = payload["sourceSlice"]
    rhythm = "".join(f"<li>{esc(step)}</li>" for step in payload["smallSessionPlan"]["rhythm"])
    intent = "".join(f"<li>{esc(item)}</li>" for item in payload["draftScaffold"]["intentMap"])
    doc = f"""<!doctype html>
<html><head><meta charset=\"utf-8\"><title>Small writing session</title>
<style>
:root {{ color-scheme: light; --paper:#fffaf0; --ink:#382d20; --leaf:#315f43; --moss:#e7efd9; --gold:#c59232; --line:#e4d7bd; }}
body {{ margin:0; font-family: ui-serif, Georgia, serif; background:linear-gradient(135deg,#f6eddb,#eef4e5); color:var(--ink); }}
main {{ max-width:980px; margin:0 auto; padding:42px 24px 70px; }}
header, section {{ background:rgba(255,250,240,.92); border:1px solid var(--line); border-radius:26px; padding:26px; margin:18px 0; box-shadow:0 18px 50px rgba(69,47,24,.12); }}
h1 {{ font-size:44px; line-height:.98; margin:0 0 10px; letter-spacing:-.04em; }}
.eyebrow {{ color:var(--gold); text-transform:uppercase; letter-spacing:.18em; font:800 12px ui-sans-serif,system-ui; }}
.meta {{ display:flex; flex-wrap:wrap; gap:8px; margin-top:12px; }}
.meta span {{ background:var(--moss); color:var(--leaf); border-radius:999px; padding:7px 10px; font:700 12px ui-sans-serif,system-ui; }}
pre {{ white-space:pre-wrap; background:#fff; border:1px solid var(--line); border-radius:18px; padding:18px; line-height:1.5; max-height:420px; overflow:auto; }}
ul {{ line-height:1.55; }}
.seed {{ background:#283c2e; color:#fff7e5; border-radius:20px; padding:18px; line-height:1.55; }}
.workspace {{ display:inline-block; background:var(--leaf); color:#fffaf0; border-radius:999px; padding:10px 14px; text-decoration:none; font:800 13px ui-sans-serif,system-ui; }}
code {{ color:var(--leaf); }}
</style></head><body><main>
<header>
<p class=\"eyebrow\">Quipsly Nest · source-backed small session</p>
<h1>{esc(source['title'])}</h1>
<p>{esc(payload['humanAsk'])}</p>
<div class=\"meta\"><span>{esc(source['voice'])}</span><span>{esc(source['type'])}</span><span>{esc(source['chapter'])}</span><span>{esc(source['wordCount'])} words</span><span>lines {esc(source['lineStart'])}-{esc(source['lineEnd'])}</span></div>
</header>
<section><p class=\"eyebrow\">Source excerpt</p><pre>{esc(source['excerpt'])}</pre></section>
<section><p class=\"eyebrow\">25-minute plan</p><ul>{rhythm}</ul></section>
<section><p class=\"eyebrow\">Draft scaffold</p><ul>{intent}</ul><div class=\"seed\">{esc(payload['draftScaffold']['exampleDraftSeed'])}</div></section>
<section><p class=\"eyebrow\">Sidecar draft workspace</p><p>This editable Markdown workspace is safe to use because it is not canonical manuscript text.</p><a class=\"workspace\" href=\"{Path(payload['draftWorkspacePath']).resolve().as_uri()}\">Open draft-workspace.md</a><pre>{esc(payload['draftScaffold']['sourceBackedDraftCandidate'])}</pre></section>
<section><p class=\"eyebrow\">Truth</p><p>This packet does not edit source files, replace canonical manuscript text, publish, upload, schedule, or create receipt truth.</p></section>
</main></body></html>"""
    Path(payload["htmlPath"]).write_text(doc, encoding="utf-8")


def write_csv(payload: dict[str, Any]) -> None:
    source = payload["sourceSlice"]
    with Path(payload["csvPath"]).open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["id", "title", "type", "voice", "chapter", "wordCount", "lineStart", "lineEnd", "nextSafestAction"])
        writer.writeheader()
        writer.writerow({
            "id": source["id"],
            "title": source["title"],
            "type": source["type"],
            "voice": source["voice"],
            "chapter": source["chapter"],
            "wordCount": source["wordCount"],
            "lineStart": source["lineStart"],
            "lineEnd": source["lineEnd"],
            "nextSafestAction": payload["nextSafestAction"],
        })


def build(nest_root: Path, block_id: str) -> dict[str, Any]:
    payload = build_payload(nest_root, block_id)
    Path(payload["sessionDir"]).mkdir(parents=True, exist_ok=True)
    write_json(Path(payload["jsonPath"]), payload)
    write_markdown(payload)
    write_draft_workspace(payload)
    write_html(payload)
    write_csv(payload)
    write_json(Path(payload["pointerPath"]), payload)
    return payload


def main() -> int:
    nest_root = DEFAULT_NEST_ROOT
    block_id = "first"
    args = sys.argv[1:]
    if args:
        if args[0].startswith("/"):
            nest_root = Path(args[0])
            if len(args) > 1:
                block_id = args[1]
        else:
            block_id = args[0]
    payload = build(nest_root, block_id)
    print(json.dumps({
        "status": payload["status"],
        "counts": payload["counts"],
        "htmlPath": payload["htmlPath"],
        "jsonPath": payload["jsonPath"],
        "markdownPath": payload["markdownPath"],
        "csvPath": payload["csvPath"],
        "pointerPath": payload["pointerPath"],
        "sourceSlice": {k: payload["sourceSlice"][k] for k in ["id", "title", "type", "voice", "chapter", "wordCount", "lineStart", "lineEnd"]},
        "nextSafestAction": payload["nextSafestAction"],
        "truth": payload["truth"],
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
