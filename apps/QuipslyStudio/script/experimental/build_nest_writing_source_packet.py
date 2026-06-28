#!/usr/bin/env python3
"""Build a safe Nest writing/research source packet.

This reads manuscript/research markdown sources and writes a Quipsly-owned
packet: provenance, outline hints, tag suggestions, and next actions. It does
not rewrite or mutate source text.
"""

from __future__ import annotations

import argparse
import csv
import html
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_SOURCE_ROOT = Path("/Users/wall-e/Dev/high-ground-studio/apps/web/content/books/learning-to-lead")
DEFAULT_OUTPUT_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/NestWriting")
TEXT_EXTENSIONS = {".md", ".mdx", ".txt"}


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip()).strip("-").lower()
    return slug or "nest-writing"


def words(text: str) -> list[str]:
    return re.findall(r"[A-Za-z0-9']+", text)


def title_from_text(path: Path, text: str) -> str:
    for line in text.splitlines()[:40]:
        stripped = line.strip()
        if stripped.startswith("#"):
            return stripped.lstrip("#").strip() or path.stem
    return path.stem


def first_paragraph(text: str, limit: int = 320) -> str:
    for part in re.split(r"\n\s*\n", text):
        stripped = re.sub(r"\s+", " ", part).strip()
        if stripped and not stripped.startswith("#"):
            return stripped[:limit]
    return ""


def detect_tags(path: Path, title: str, text: str) -> list[str]:
    haystack = f"{path.as_posix()} {title}".lower()
    tags: list[str] = []
    patterns = [
        ("episode", r"episode|podcast year|week \d+"),
        ("chapter", r"chapter|preface|introduction"),
        ("research", r"research|source|citation"),
        ("charlie", r"charlie"),
        ("homer-scott", r"homer|scott|homer new|homer unformatted"),
        ("article-candidate", r"article|draft|post"),
        ("worth-the-risk", r"worth the risk|risk"),
        ("high-ground-odyssey", r"high ground|odyssey|learning-to-lead"),
    ]
    for tag, pattern in patterns:
        if re.search(pattern, haystack):
            tags.append(tag)
    if "research" not in tags and re.search(r"\b(source|study|reference|according to)\b", text.lower()):
        tags.append("research")
    return tags or ["source-note"]


def discover_documents(source: Path, limit: int) -> list[Path]:
    docs: list[Path] = []
    for root, dirs, files in os.walk(source):
        dirs[:] = sorted([
            d for d in dirs
            if not d.startswith(".") and d not in {"node_modules", "DerivedData", "__pycache__"}
        ])
        for filename in sorted(files):
            path = Path(root) / filename
            if path.suffix.lower() in TEXT_EXTENSIONS and not path.name.startswith("."):
                docs.append(path)
                if limit > 0 and len(docs) >= limit:
                    return docs
    return docs


def build_items(source: Path, docs: list[Path]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for index, path in enumerate(docs, start=1):
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            text = path.read_text(encoding="utf-8", errors="replace")
        except Exception as exc:
            text = ""
            read_error = str(exc)
        else:
            read_error = ""
        title = title_from_text(path, text)
        word_count = len(words(text))
        try:
            relative_path = path.resolve().relative_to(source.resolve()).as_posix()
        except Exception:
            relative_path = path.name
        tags = detect_tags(path, title, text)
        status = "ready-for-review" if word_count >= 50 and not read_error else "needs-source-check" if read_error else "short-note"
        item = {
            "index": index,
            "id": f"source-{index:04d}",
            "title": title,
            "sourcePath": str(path),
            "relativePath": relative_path,
            "bytes": path.stat().st_size if path.exists() else 0,
            "wordCount": word_count,
            "lineCount": len(text.splitlines()) if text else 0,
            "tags": tags,
            "status": status,
            "readError": read_error,
            "sample": first_paragraph(text),
            "safeNextActions": [
                "tag",
                "outline",
                "compare-related-sources",
                "draft-with-provenance",
                "prepare-human-review",
            ],
        }
        items.append(item)
    return items


def summarize(items: list[dict[str, Any]]) -> dict[str, Any]:
    tag_counts: dict[str, int] = {}
    for item in items:
        for tag in item["tags"]:
            tag_counts[tag] = tag_counts.get(tag, 0) + 1
    return {
        "documents": len(items),
        "words": sum(item["wordCount"] for item in items),
        "readyForReview": sum(1 for item in items if item["status"] == "ready-for-review"),
        "needsSourceCheck": sum(1 for item in items if item["status"] == "needs-source-check"),
        "shortNotes": sum(1 for item in items if item["status"] == "short-note"),
        "tagCounts": dict(sorted(tag_counts.items())),
        "sourceFilesMutated": False,
    }


def writing_source_contract(counts: dict[str, Any]) -> dict[str, Any]:
    return {
        "mode": "source-map-and-draft-prep",
        "humanOwnsCanonicalText": True,
        "assistantMayDraft": True,
        "assistantMayRewrite": True,
        "assistantMustKeepSourceTrailVisible": True,
        "sourceFilesReadOnly": True,
        "canonicalWriteBlocked": True,
        "externalPublishingBlocked": True,
        "receiptTruthRequiresExternalUrl": True,
        "summary": "Draft freely, but never secretly. This packet may feed outlines, drafts, rewrites, and platform copy, but source files and canonical manuscripts remain untouched until a human-controlled save path promotes the work.",
        "counts": counts,
    }


def writing_source_tasks() -> list[dict[str, str]]:
    return [
        {
            "label": "Open source packet",
            "why": "See the real manuscript/research inputs before drafting.",
            "safety": "Read-only packet evidence; no source files are changed.",
        },
        {
            "label": "Open writing workbench",
            "why": "Choose a source-backed book, article, episode-page, or research task.",
            "safety": "Creates local draft/review direction only.",
        },
        {
            "label": "Generate draft preview",
            "why": "Let Quipsly create usable prose from visible sources so humans are not blocked waiting on blank-page work.",
            "safety": "Draft preview only; not canonical manuscript replacement.",
        },
        {
            "label": "Compare draft to source trail",
            "why": "Make the assistant's assumptions inspectable before promotion.",
            "safety": "Review step only; no external publishing or receipt truth.",
        },
        {
            "label": "Promote, revise, or hold",
            "why": "A human chooses whether the draft becomes part of the living manuscript or publication packet.",
            "safety": "Requires a separate human-controlled save/publish path.",
        },
    ]


def infer_workstream(item: dict[str, Any]) -> str:
    relative = str(item.get("relativePath") or "").lower()
    tags = set(item.get("tags") or [])
    if relative.startswith("podcast year 1/"):
        return "podcast-episode-planning"
    if relative.startswith("worth the risk/"):
        return "book-manuscript"
    if "research" in tags or "/research" in relative:
        return "research-packet"
    if "episode" in tags:
        return "published-episode-text"
    if "article-candidate" in tags:
        return "article-draft"
    if item.get("status") == "short-note":
        return "capture-note"
    return "source-library"


def folder_key(item: dict[str, Any], depth: int = 2) -> str:
    parts = Path(str(item.get("relativePath") or "")).parts
    if not parts:
        return "root"
    return "/".join(parts[:depth])


def build_workstreams(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    buckets: dict[str, list[dict[str, Any]]] = {}
    for item in items:
        stream = infer_workstream(item)
        item["workstream"] = stream
        buckets.setdefault(stream, []).append(item)
    workstreams: list[dict[str, Any]] = []
    for name, stream_items in sorted(buckets.items()):
        workstreams.append({
            "id": slugify(name),
            "name": name,
            "documentCount": len(stream_items),
            "wordCount": sum(item.get("wordCount", 0) for item in stream_items),
            "readyForReview": sum(1 for item in stream_items if item.get("status") == "ready-for-review"),
            "shortNotes": sum(1 for item in stream_items if item.get("status") == "short-note"),
            "sampleSources": [
                {
                    "id": item.get("id"),
                    "title": item.get("title"),
                    "relativePath": item.get("relativePath"),
                    "wordCount": item.get("wordCount"),
                    "tags": item.get("tags") or [],
                }
                for item in sorted(stream_items, key=lambda value: value.get("wordCount", 0), reverse=True)[:8]
            ],
        })
    return workstreams


def build_outline_groups(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    buckets: dict[str, list[dict[str, Any]]] = {}
    for item in items:
        buckets.setdefault(folder_key(item), []).append(item)
    groups: list[dict[str, Any]] = []
    for key, group_items in sorted(buckets.items()):
        if len(group_items) < 2 and sum(item.get("wordCount", 0) for item in group_items) < 800:
            continue
        groups.append({
            "id": slugify(key),
            "label": key,
            "documentCount": len(group_items),
            "wordCount": sum(item.get("wordCount", 0) for item in group_items),
            "workstreams": sorted(set(infer_workstream(item) for item in group_items)),
            "sourceIds": [item.get("id") for item in group_items[:24]],
            "recommendedUse": "outline-section" if any("chapter" in item.get("tags", []) for item in group_items) else "research-or-draft-cluster",
        })
    return sorted(groups, key=lambda group: group["wordCount"], reverse=True)[:80]


def episode_sort_key(label: str) -> tuple[int, str]:
    match = re.search(r"(^|/)(\d+)\s*[-–]", label)
    if match:
        return int(match.group(2)), label
    match = re.search(r"episode\s+(\d+)", label.lower())
    if match:
        return int(match.group(1)), label
    return 9999, label


def build_episode_groups(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    buckets: dict[str, list[dict[str, Any]]] = {}
    for item in items:
        relative = str(item.get("relativePath") or "")
        parts = Path(relative).parts
        if len(parts) >= 2 and parts[0] == "Podcast Year 1":
            key = "/".join(parts[:2])
        elif relative.lower().startswith("episode "):
            key = Path(relative).stem
        else:
            continue
        buckets.setdefault(key, []).append(item)
    groups: list[dict[str, Any]] = []
    for key, group_items in buckets.items():
        research_count = sum(1 for item in group_items if "research" in item.get("tags", []))
        charlie_count = sum(1 for item in group_items if "charlie" in item.get("tags", []))
        groups.append({
            "id": slugify(key),
            "label": key,
            "documentCount": len(group_items),
            "wordCount": sum(item.get("wordCount", 0) for item in group_items),
            "researchSources": research_count,
            "charlieDrafts": charlie_count,
            "sourceIds": [item.get("id") for item in group_items],
            "recommendedOutput": "episode-page-and-show-notes",
            "nextAction": "Draft or refresh an episode page packet with visible source provenance.",
        })
    return sorted(groups, key=lambda group: episode_sort_key(group["label"]))[:80]


def build_draft_queue(items: list[dict[str, Any]], episode_groups: list[dict[str, Any]], outline_groups: list[dict[str, Any]]) -> list[dict[str, Any]]:
    queue: list[dict[str, Any]] = []
    for group in episode_groups[:18]:
        queue.append({
            "id": f"episode-page-{group['id']}",
            "type": "episode-page",
            "title": group["label"],
            "sourceIds": group["sourceIds"],
            "wordCount": group["wordCount"],
            "status": "ready-to-draft-with-provenance" if group["wordCount"] > 500 else "needs-source-context",
            "safeNextAction": "Prepare episode-page copy, show notes, Patreon summary, and social copy from source packet.",
            "humanReviewRequired": True,
        })
    for group in outline_groups[:18]:
        if "book-manuscript" not in group.get("workstreams", []) and group["wordCount"] < 1500:
            continue
        queue.append({
            "id": f"book-section-{group['id']}",
            "type": "book-section",
            "title": group["label"],
            "sourceIds": group["sourceIds"],
            "wordCount": group["wordCount"],
            "status": "ready-to-outline" if group["wordCount"] > 800 else "needs-source-context",
            "safeNextAction": "Build an outline and revision brief; do not rewrite source files.",
            "humanReviewRequired": True,
        })
    article_candidates = [
        item for item in items
        if item.get("wordCount", 0) >= 500 and infer_workstream(item) in {"article-draft", "source-library", "book-manuscript"}
    ]
    for item in sorted(article_candidates, key=lambda value: value.get("wordCount", 0), reverse=True)[:12]:
        queue.append({
            "id": f"article-{item['id']}",
            "type": "article",
            "title": item["title"],
            "sourceIds": [item["id"]],
            "wordCount": item["wordCount"],
            "status": "ready-to-draft-with-provenance",
            "safeNextAction": "Prepare article angle options, outline, and draft with visible source trail.",
            "humanReviewRequired": True,
        })
    return queue[:60]


def build_action_cards(draft_queue: list[dict[str, Any]], items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_id = {item["id"]: item for item in items}
    cards: list[dict[str, Any]] = []
    for task in draft_queue[:24]:
        sources = [by_id[source_id] for source_id in task.get("sourceIds", []) if source_id in by_id][:8]
        cards.append({
            "id": task["id"],
            "label": task["title"],
            "type": task["type"],
            "risk": "low" if task["status"].startswith("ready") else "medium",
            "status": task["status"],
            "explanation": task["safeNextAction"],
            "sourceTrail": [
                {
                    "id": source.get("id"),
                    "title": source.get("title"),
                    "relativePath": source.get("relativePath"),
                    "wordCount": source.get("wordCount"),
                    "tags": source.get("tags") or [],
                }
                for source in sources
            ],
            "allowedActions": [
                "create-outline-preview",
                "create-draft-preview",
                "create-social-copy-preview",
                "mark-needs-human-review",
            ],
            "blockedActions": [
                "mutate-source-file",
                "publish-externally",
                "replace-canonical-manuscript-without-approval",
            ],
        })
    return cards


def build_workbench(packet: dict[str, Any]) -> dict[str, Any]:
    items = packet["items"]
    workstreams = build_workstreams(items)
    outline_groups = build_outline_groups(items)
    episode_groups = build_episode_groups(items)
    draft_queue = build_draft_queue(items, episode_groups, outline_groups)
    counts = packet.get("counts") if isinstance(packet.get("counts"), dict) else {}
    contract = writing_source_contract(counts)
    return {
        "schema": "quipsly.nest-writing.workbench.v1",
        "generatedAt": iso_now(),
        "truth": "Writing/research workbench only. Sources are read-only; drafts are previews until explicitly saved by a human-controlled path.",
        "humanAsk": "Pick one source-backed task and decide whether the next human-useful move is outline, draft, rewrite, research comparison, or hold.",
        "agentSafeParallelWork": "Create outlines, draft previews, rewrite variants, source comparisons, platform copy, and research packets. Do not mutate source files, replace canonical manuscript text, publish, schedule, upload, or create receipts.",
        "sourceContract": contract,
        "draftContract": {
            "generatedTextAllowed": True,
            "blackBoxDraftingAllowedButDiscouragedByUX": True,
            "promotionRequiresHumanReview": True,
            "summary": "Quipsly can draft real publishable prose, but the workbench keeps source trail, promotion boundary, and receipt truth visible.",
        },
        "sourceTasks": writing_source_tasks(),
        "workstreams": workstreams,
        "outlineGroups": outline_groups,
        "episodeGroups": episode_groups,
        "draftQueue": draft_queue,
        "actionCards": build_action_cards(draft_queue, items),
        "productRules": [
            "Source files remain untouched.",
            "AI may draft, rewrite, compare, and suggest, but source trails stay visible.",
            "Human approval is required before publication or canonical manuscript replacement.",
            "Draft previews are not publication receipts.",
        ],
        "sourceFilesMutated": False,
        "externalPublishing": False,
    }


def prepare_session(source: Path, output_root: Path) -> Path:
    session_dir = output_root / f"{datetime.now().strftime('%Y%m%d-%H%M%S')}-{slugify(source.name)}"
    base = session_dir
    counter = 2
    while session_dir.exists():
        session_dir = Path(f"{base}-{counter}")
        counter += 1
    session_dir.mkdir(parents=True, exist_ok=False)
    return session_dir


def write_packet(session_dir: Path, source: Path, output_root: Path, items: list[dict[str, Any]]) -> dict[str, Any]:
    for item in items:
        item["workstream"] = infer_workstream(item)
    counts = summarize(items)
    contract = writing_source_contract(counts)
    packet = {
        "schema": "quipsly.nest-writing.source-packet.v1",
        "generatedAt": iso_now(),
        "status": "source-packet-ready",
        "sourceRoot": str(source),
        "outputRoot": str(output_root),
        "sessionDir": str(session_dir),
        "truth": "Source map and writing/research packet only. Manuscript files are read-only.",
        "humanAsk": "Open the workbench, choose one source-backed task, and decide whether Quipsly should draft, outline, compare, or prepare a publication packet from visible sources.",
        "agentSafeParallelWork": "Draft examples, rewrites, outlines, source comparisons, citation trails, and platform packets. Do not mutate source files, replace canonical manuscript text, publish, schedule, upload, or create receipts.",
        "sourceContract": contract,
        "draftContract": {
            "generatedTextAllowed": True,
            "assistantMayDraftPublishableProse": True,
            "promotionRequiresHumanReview": True,
            "canonicalWriteBlockedHere": True,
            "summary": "AI writing is allowed. Secret replacement is not. This source packet can start serious drafts while keeping the source trail visible.",
        },
        "sourceTasks": writing_source_tasks(),
        "nextSafestAction": "Open the writing workbench and choose the first source-backed task to draft, outline, compare, or hold without mutating source files.",
        "safety": {
            "sourceFilesMutated": False,
            "externalPublishing": False,
            "draftsAreProvenanceRequired": True,
        },
        "counts": counts,
        "items": items,
    }
    packet["workbench"] = build_workbench(packet)
    (session_dir / "nest-writing-source-packet.json").write_text(json.dumps(packet, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return packet


def write_csv(session_dir: Path, items: list[dict[str, Any]]) -> None:
    with (session_dir / "source-provenance.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["id", "title", "sourcePath", "wordCount", "status", "tags"])
        writer.writeheader()
        for item in items:
            writer.writerow({
                "id": item["id"],
                "title": item["title"],
                "sourcePath": item["sourcePath"],
                "wordCount": item["wordCount"],
                "status": item["status"],
                "tags": ";".join(item["tags"]),
            })


def write_markdown(session_dir: Path, packet: dict[str, Any]) -> None:
    counts = packet["counts"]
    lines = [
        "# Nest writing and research source packet",
        "",
        f"Generated: {packet['generatedAt']}",
        "",
        "This packet maps source material for writing, research, outlines, and publishable drafts. It does not mutate source files.",
        "",
        "## Human/agent contract",
        "",
        f"- Human ask: {packet.get('humanAsk')}",
        f"- Agent-safe parallel work: {packet.get('agentSafeParallelWork')}",
        f"- Contract: {(packet.get('sourceContract') or {}).get('summary') if isinstance(packet.get('sourceContract'), dict) else ''}",
        "",
        "## Counts",
        "",
        f"- Documents: {counts['documents']}",
        f"- Words: {counts['words']}",
        f"- Ready for review: {counts['readyForReview']}",
        f"- Needs source check: {counts['needsSourceCheck']}",
        "",
        "## Top source map",
        "",
        "| Source | Words | Tags | Status |",
        "| --- | ---: | --- | --- |",
    ]
    for item in packet["items"][:80]:
        tags = ", ".join(item["tags"])
        lines.append(f"| `{item['relativePath']}` | {item['wordCount']} | {tags} | {item['status']} |")
    lines.extend([
        "",
        "## Next safe actions",
        "",
        "- Build a human-facing Nest source map from this packet.",
        "- Let Quipsly propose tags and outlines from packet metadata.",
        "- Allow drafts, rewrites, and article starts only with visible source provenance.",
        "- Keep original manuscript/source files untouched until an explicit save path exists.",
    ])
    (session_dir / "START-HERE-nest-writing-source-packet.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_html(session_dir: Path, packet: dict[str, Any]) -> None:
    counts = packet["counts"]
    cards = []
    for item in packet["items"][:240]:
        tags = "".join(f"<span>{html.escape(tag)}</span>" for tag in item["tags"])
        cards.append(f"""
        <article>
          <div class="status">{html.escape(item['status'])}</div>
          <h2>{html.escape(item['title'])}</h2>
          <p class="path">{html.escape(item['relativePath'])}</p>
          <p><b>{item['wordCount']}</b> words</p>
          <p class="sample">{html.escape(item['sample'])}</p>
          <div class="tags">{tags}</div>
        </article>
        """)
    html_text = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Nest Writing Source Packet</title>
  <style>
    :root {{ color-scheme: dark; --bg:#121812; --panel:#1c281e; --ink:#f8efd8; --muted:#c8bda0; --gold:#ecc75b; --moss:#8fbd74; --line:rgba(248,239,216,.15); }}
    * {{ box-sizing: border-box; }}
    body {{ margin:0; font-family:Avenir Next, Helvetica Neue, sans-serif; color:var(--ink); background:radial-gradient(circle at top left, rgba(143,189,116,.19), transparent 38%), var(--bg); }}
    header {{ padding:34px clamp(20px,5vw,72px); border-bottom:1px solid var(--line); }}
    .eyebrow {{ color:var(--gold); letter-spacing:.22em; text-transform:uppercase; font-weight:900; font-size:12px; }}
    h1 {{ font-size:clamp(36px,6vw,78px); line-height:.92; margin:10px 0; }}
    header p {{ color:var(--muted); max-width:860px; line-height:1.5; }}
    .stats {{ display:flex; flex-wrap:wrap; gap:10px; margin-top:18px; }}
    .stats span {{ border:1px solid var(--line); border-radius:999px; padding:8px 12px; background:rgba(0,0,0,.18); }}
    main {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:16px; padding:24px clamp(16px,4vw,56px) 64px; }}
    article {{ border:1px solid var(--line); border-radius:22px; padding:18px; background:linear-gradient(180deg,var(--panel),#121a14); }}
    .status {{ color:var(--moss); text-transform:uppercase; letter-spacing:.12em; font-size:11px; font-weight:900; }}
    h2 {{ font-size:19px; line-height:1.15; margin:10px 0 8px; }}
    .path,.sample {{ color:var(--muted); overflow-wrap:anywhere; }}
    .sample {{ font-size:13px; }}
    .tags {{ display:flex; gap:6px; flex-wrap:wrap; }}
    .tags span {{ color:#dfffc8; border:1px solid rgba(143,189,116,.35); background:rgba(143,189,116,.12); border-radius:999px; padding:5px 8px; font-size:11px; font-weight:800; }}
  </style>
</head>
<body>
  <header>
    <div class="eyebrow">Quipsly Nest</div>
    <h1>Sources first. Drafts with a visible trail.</h1>
    <p>This packet turns the manuscript/research folder into a calm map for writing, tagging, outlining, article drafting, and human review. Quipsly may draft real prose, but source files stay read-only and human promotion stays explicit.</p>
    <div class="stats">
      <span>{counts['documents']} documents</span>
      <span>{counts['words']} words</span>
      <span>{counts['readyForReview']} ready</span>
      <span>{counts['needsSourceCheck']} needs source check</span>
    </div>
  </header>
  <main>{''.join(cards)}</main>
</body>
</html>
"""
    (session_dir / "index.html").write_text(html_text, encoding="utf-8")


def write_workbench_artifacts(session_dir: Path, packet: dict[str, Any]) -> None:
    workbench = packet.get("workbench") or build_workbench(packet)
    workbench_dir = session_dir / "writing-workbench"
    workbench_dir.mkdir(parents=True, exist_ok=True)
    json_path = workbench_dir / "nest-writing-workbench.json"
    csv_path = workbench_dir / "draft-queue.csv"
    md_path = workbench_dir / "START-HERE-writing-workbench.md"
    html_path = workbench_dir / "index.html"
    json_path.write_text(json.dumps(workbench, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    with csv_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=[
            "id",
            "type",
            "title",
            "wordCount",
            "status",
            "sourceCount",
            "safeNextAction",
            "humanReviewRequired",
        ])
        writer.writeheader()
        for task in workbench.get("draftQueue") or []:
            writer.writerow({
                "id": task.get("id"),
                "type": task.get("type"),
                "title": task.get("title"),
                "wordCount": task.get("wordCount"),
                "status": task.get("status"),
                "sourceCount": len(task.get("sourceIds") or []),
                "safeNextAction": task.get("safeNextAction"),
                "humanReviewRequired": task.get("humanReviewRequired"),
            })
    lines = [
        "# Nest writing workbench",
        "",
        f"Generated: {workbench.get('generatedAt')}",
        "",
        workbench.get("truth", "Writing/research workbench only."),
        "",
        "## Workstreams",
        "",
        "| Workstream | Documents | Words | Ready |",
        "| --- | ---: | ---: | ---: |",
    ]
    for stream in workbench.get("workstreams") or []:
        lines.append(f"| {stream['name']} | {stream['documentCount']} | {stream['wordCount']} | {stream['readyForReview']} |")
    lines.extend([
        "",
        "## Draft queue",
        "",
        "| Task | Type | Words | Status | Next action |",
        "| --- | --- | ---: | --- | --- |",
    ])
    for task in (workbench.get("draftQueue") or [])[:80]:
        lines.append(f"| `{task['title']}` | {task['type']} | {task['wordCount']} | {task['status']} | {task['safeNextAction']} |")
    lines.extend([
        "",
        "## Rules",
        "",
        "- Source files are read-only.",
        "- Drafts and rewrites are allowed, but source trails remain visible.",
        "- Draft previews are not canonical manuscript replacements.",
        "- Publishing requires explicit human approval and receipt capture.",
        "",
        "## Files",
        "",
        f"- JSON: `{json_path}`",
        f"- CSV: `{csv_path}`",
        f"- HTML: `{html_path}`",
    ])
    md_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    stream_cards = []
    for stream in workbench.get("workstreams") or []:
        stream_cards.append(f"""
          <article class="stream">
            <span>{html.escape(stream['name'])}</span>
            <b>{stream['wordCount']:,} words</b>
            <small>{stream['documentCount']} docs · {stream['readyForReview']} ready</small>
          </article>
        """)
    task_cards = []
    for task in (workbench.get("draftQueue") or [])[:80]:
        task_cards.append(f"""
          <article class="task">
            <div class="type">{html.escape(task['type'])}</div>
            <h2>{html.escape(task['title'])}</h2>
            <p>{html.escape(task['safeNextAction'])}</p>
            <small>{task['wordCount']:,} words · {len(task.get('sourceIds') or [])} sources · {html.escape(task['status'])}</small>
          </article>
        """)
    html_text = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Nest Writing Workbench</title>
  <style>
    :root {{ color-scheme:dark; --bg:#111812; --panel:#1d2a20; --ink:#fbf0d8; --muted:#c9bda0; --gold:#eac95f; --moss:#90bf73; --line:rgba(251,240,216,.16); }}
    body {{ margin:0; font-family:Avenir Next, Helvetica Neue, sans-serif; background:radial-gradient(circle at top left, rgba(144,191,115,.2), transparent 35%), var(--bg); color:var(--ink); }}
    header {{ padding:36px clamp(20px,5vw,72px); border-bottom:1px solid var(--line); }}
    .eyebrow {{ color:var(--gold); letter-spacing:.22em; text-transform:uppercase; font-size:12px; font-weight:900; }}
    h1 {{ margin:10px 0; font-size:clamp(36px,6vw,82px); line-height:.9; }}
    p {{ color:var(--muted); max-width:900px; }}
    section {{ padding:24px clamp(16px,4vw,56px); }}
    .streams, .tasks {{ display:grid; gap:14px; }}
    .streams {{ grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); }}
    .tasks {{ grid-template-columns:repeat(auto-fill,minmax(290px,1fr)); }}
    article {{ border:1px solid var(--line); border-radius:24px; background:linear-gradient(180deg,var(--panel),#121a14); padding:18px; }}
    .stream span, .type {{ color:var(--gold); text-transform:uppercase; letter-spacing:.13em; font-size:11px; font-weight:900; }}
    .stream b {{ display:block; font-size:28px; margin:8px 0; }}
    small {{ color:var(--muted); }}
    h2 {{ font-size:20px; line-height:1.12; margin:9px 0; }}
  </style>
</head>
<body>
  <header>
    <div class="eyebrow">Quipsly Nest Workbench</div>
    <h1>Write from the map, not from the fog.</h1>
    <p>{html.escape(workbench.get('truth', 'Writing/research workbench only.'))}</p>
  </header>
  <section>
    <h2>Workstreams</h2>
    <div class="streams">{''.join(stream_cards)}</div>
  </section>
  <section>
    <h2>Draft queue</h2>
    <div class="tasks">{''.join(task_cards)}</div>
  </section>
</body>
</html>
"""
    html_path.write_text(html_text, encoding="utf-8")


def update_latest(output_root: Path, session_dir: Path, packet: dict[str, Any]) -> None:
    workbench_dir = session_dir / "writing-workbench"
    pointer = {
        "schema": "quipsly.nest-writing.latest-pointer.v1",
        "updatedAt": iso_now(),
        "status": packet.get("status") or "source-packet-ready",
        "latestSessionDir": str(session_dir),
        "htmlPath": str(session_dir / "index.html"),
        "packetPath": str(session_dir / "nest-writing-source-packet.json"),
        "markdownPath": str(session_dir / "START-HERE-nest-writing-source-packet.md"),
        "workbenchHtmlPath": str(workbench_dir / "index.html"),
        "workbenchJsonPath": str(workbench_dir / "nest-writing-workbench.json"),
        "workbenchMarkdownPath": str(workbench_dir / "START-HERE-writing-workbench.md"),
        "counts": packet["counts"],
        "truth": packet.get("truth"),
        "humanAsk": packet.get("humanAsk"),
        "agentSafeParallelWork": packet.get("agentSafeParallelWork"),
        "sourceContract": packet.get("sourceContract"),
        "draftContract": packet.get("draftContract"),
        "sourceTasks": packet.get("sourceTasks"),
        "nextSafestAction": packet.get("nextSafestAction"),
        "firstSafeAction": {
            "label": "Open Nest writing workbench",
            "path": str(workbench_dir / "index.html"),
            "command": f"open {session_dir / 'writing-workbench' / 'index.html'}",
            "safety": "Opens local writing/research evidence only. No source files, manuscripts, publications, schedules, uploads, or receipts are changed.",
        },
        "workbenchCounts": {
            "workstreams": len((packet.get("workbench") or {}).get("workstreams") or []),
            "draftQueue": len((packet.get("workbench") or {}).get("draftQueue") or []),
            "actionCards": len((packet.get("workbench") or {}).get("actionCards") or []),
        },
    }
    (output_root / "latest-nest-writing-source-packet.json").write_text(json.dumps(pointer, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (output_root / "START-HERE-nest-writing.md").write_text(
        "\n".join([
            "# Nest Writing",
            "",
            f"Latest source packet: `{session_dir / 'index.html'}`",
            f"Latest writing workbench: `{workbench_dir / 'index.html'}`",
            "",
            "Source files remain untouched. Draft and review work should point back to this provenance packet.",
        ])
        + "\n",
        encoding="utf-8",
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a Quipsly Nest writing/research source packet.")
    parser.add_argument("source", nargs="?", default=str(DEFAULT_SOURCE_ROOT))
    parser.add_argument("--output-root", default=str(DEFAULT_OUTPUT_ROOT))
    parser.add_argument("--limit", type=int, default=180)
    args = parser.parse_args()
    source = Path(args.source).expanduser()
    output_root = Path(args.output_root).expanduser()
    if not source.exists() or not source.is_dir():
        raise SystemExit(f"Source folder does not exist or is not a directory: {source}")
    session_dir = prepare_session(source, output_root)
    docs = discover_documents(source, args.limit)
    items = build_items(source, docs)
    packet = write_packet(session_dir, source, output_root, items)
    write_csv(session_dir, items)
    write_markdown(session_dir, packet)
    write_html(session_dir, packet)
    write_workbench_artifacts(session_dir, packet)
    update_latest(output_root, session_dir, packet)
    print(json.dumps({
        "ok": True,
        "sessionDir": str(session_dir),
        "htmlPath": str(session_dir / "index.html"),
        "packetPath": str(session_dir / "nest-writing-source-packet.json"),
        "markdownPath": str(session_dir / "START-HERE-nest-writing-source-packet.md"),
        "workbenchPath": str(session_dir / "writing-workbench" / "index.html"),
        "counts": packet["counts"],
        "workbenchCounts": {
            "workstreams": len(packet["workbench"]["workstreams"]),
            "draftQueue": len(packet["workbench"]["draftQueue"]),
            "actionCards": len(packet["workbench"]["actionCards"]),
        },
        "sourceFilesMutated": False,
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
