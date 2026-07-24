#!/usr/bin/env python3
"""Build a safe High Ground Odyssey Nest import preview.

This consumes the read-only source atlas and proposes Nest documents for manual
or future assisted import. It does not write to the database, does not copy
source text into a canonical manuscript, and does not mutate source files.
"""

from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_ATLAS = REPO_ROOT / "apps/QuipslyStudio/docs/quipsly/high-ground-odyssey-source-atlas.json"
DEFAULT_DOC_OUTPUT = REPO_ROOT / "apps/QuipslyStudio/docs/quipsly/high-ground-odyssey-import-preview.md"
DEFAULT_JSON_OUTPUT = REPO_ROOT / "apps/QuipslyStudio/docs/quipsly/high-ground-odyssey-import-preview.json"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def slugify(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9]+", "-", value.strip()).strip("-").lower() or "document"


def episode_number(item: dict[str, Any]) -> int | None:
    relative = str(item.get("relativePath") or "")
    match = re.match(r"^(\d+)\s+-\s+", relative)
    if match:
        return int(match.group(1))
    if relative == "Podcast Year 1.md":
        return 0
    return None


def chapter_sort_key(item: dict[str, Any]) -> tuple[int, str]:
    relative = str(item.get("relativePath") or "").lower()
    title = str(item.get("title") or "").lower()
    order_words = {
        "preface": -30,
        "forward": -25,
        "introduction": -20,
        "chapter zero": 0,
        "chapter one": 1,
        "chapter two": 2,
        "chapter three": 3,
        "chapter four.five": 45,
        "chapter four": 4,
        "chapter five": 5,
        "chapter six": 6,
        "chapter seven": 7,
        "chapter eight": 8,
        "chapter nine": 9,
        "chapter ten": 10,
        "chapter eleven": 11,
        "chapter twelve": 12,
        "outtro": 90,
    }
    haystack = f"{relative} {title}"
    for phrase, order in order_words.items():
        if phrase in haystack:
            return (order, relative)
    return (50, relative)


def source_document_kind(item: dict[str, Any]) -> str:
    return "study-source"


def source_document_title(item: dict[str, Any]) -> str:
    family = item.get("family")
    ep = episode_number(item)
    title = str(item.get("title") or Path(str(item.get("relativePath") or "")).stem)
    if family == "podcast-year-1":
        if ep == 0:
            return "Podcast Year 1 - Full Prep Source"
        if ep is not None:
            return f"Episode {ep} Source - {title}"
        return f"Podcast Source - {title}"
    return f"Book Source - {title}"


def suggested_tags(item: dict[str, Any]) -> list[str]:
    tags = ["High Ground Odyssey", "Source"]
    if item.get("family") == "podcast-year-1":
        tags.append("Podcast Year 1")
        ep = episode_number(item)
        if ep is not None and ep > 0:
            tags.append(f"Episode {ep}")
    else:
        tags.append("Learning to Lead")
        role = str(item.get("documentRole") or "")
        if "chapter" in role:
            tags.append("Chapter")
        if "preface" in role or "front" in role:
            tags.append("Front Matter")
    return tags


def build_source_documents(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    proposed: list[dict[str, Any]] = []
    for item in items:
        role = item.get("documentRole")
        if role == "future-book-note":
            kind = "note"
        else:
            kind = source_document_kind(item)
        proposed.append({
            "id": f"import-source-{item['id']}",
            "title": source_document_title(item),
            "kind": kind,
            "sourceItemId": item["id"],
            "sourceFamily": item["family"],
            "sourcePath": item["sourcePath"],
            "relativePath": item["relativePath"],
            "wordCount": item["wordCount"],
            "suggestedTags": suggested_tags(item),
            "importMode": "fixed-source-copy" if kind == "study-source" else "note-copy",
            "canonicalRisk": "low",
            "why": "Preserve the source text as an inspectable document before drafting or promotion.",
        })
    return proposed


def build_draft_targets(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    episode_items = sorted(
        [item for item in items if item.get("family") == "podcast-year-1" and episode_number(item) and episode_number(item) > 0],
        key=lambda item: episode_number(item) or 999,
    )
    chapter_items = sorted(
        [item for item in items if item.get("family") == "learning-to-lead" and item.get("documentRole") in {"chapter-source", "preface-source", "front-matter-source", "back-matter-source", "book-source"}],
        key=chapter_sort_key,
    )

    targets: list[dict[str, Any]] = [{
        "id": "draft-target-canonical-manuscript-head",
        "title": "High Ground Odyssey - Living Manuscript",
        "kind": "manuscript",
        "sourceItemIds": [],
        "importMode": "create-empty-or-open-existing",
        "canonicalRisk": "high",
        "why": "This is the human-promoted writing spine. Do not auto-fill it from sources without review.",
    }]

    for item in episode_items:
        ep = episode_number(item)
        targets.append({
            "id": f"draft-target-episode-{ep}",
            "title": f"Episode {ep} Draft / Episode Page",
            "kind": "draft",
            "sourceItemIds": [item["id"]],
            "importMode": "draft-shell-with-source-link",
            "canonicalRisk": "medium",
            "why": "Use the recording-prep source as context for an episode page, article draft, or manuscript connective pass.",
        })

    for index, item in enumerate(chapter_items, start=1):
        targets.append({
            "id": f"draft-target-book-section-{index:02d}",
            "title": f"Book Section Draft - {item['title']}",
            "kind": "draft",
            "sourceItemIds": [item["id"]],
            "importMode": "draft-shell-with-source-link",
            "canonicalRisk": "medium",
            "why": "Use the older manuscript source as reference/completeness material before promotion.",
        })

    return targets


def build_manual_paste_order(source_docs: list[dict[str, Any]], draft_targets: list[dict[str, Any]]) -> list[dict[str, Any]]:
    priority_sources = sorted(
        source_docs,
        key=lambda doc: (
            0 if doc["sourceFamily"] == "podcast-year-1" else 1,
            episode_number({"relativePath": doc["relativePath"]}) or 999,
            doc["relativePath"],
        ),
    )
    order: list[dict[str, Any]] = []
    for index, doc in enumerate(priority_sources[:12], start=1):
        order.append({
            "step": index,
            "action": "Create Study Source / Note document",
            "title": doc["title"],
            "sourcePath": doc["sourcePath"],
            "why": doc["why"],
        })
    offset = len(order)
    for index, doc in enumerate(draft_targets[:8], start=1):
        order.append({
            "step": offset + index,
            "action": "Create Draft shell",
            "title": doc["title"],
            "sourceItemIds": doc["sourceItemIds"],
            "why": doc["why"],
        })
    return order


def build_markdown(payload: dict[str, Any]) -> str:
    summary = payload["summary"]
    lines = [
        "# High Ground Odyssey Import Preview",
        "",
        f"Generated: `{summary['generatedAt']}`",
        "",
        "This is a dry-run import plan. It does not create database records, copy source text into the manuscript, overwrite any document, or mutate source files.",
        "",
        "## Summary",
        "",
        f"- Source documents considered: `{summary['sourceDocumentsConsidered']}`",
        f"- Proposed source-preserving documents: `{summary['proposedSourceDocuments']}`",
        f"- Proposed draft targets: `{summary['proposedDraftTargets']}`",
        f"- Source files mutated: `{summary['sourceFilesMutated']}`",
        f"- Canonical document mutated: `{summary['canonicalDocumentMutated']}`",
        "",
        "## Recommended model",
        "",
        "- Preserve source material as **Study Source** or **Note** documents.",
        "- Create separate **Draft** documents for episode pages, articles, and chapter rewrites.",
        "- Keep **High Ground Odyssey - Living Manuscript** as the intentionally promoted spine.",
        "- Drafting is allowed; invisible replacement is not.",
        "",
        "## Manual paste / import order",
        "",
    ]
    for item in payload["manualPasteOrder"]:
        lines.extend([
            f"### {item['step']}. {item['action']}: {item['title']}",
            "",
            f"- Why: {item['why']}",
        ])
        if item.get("sourcePath"):
            lines.append(f"- Source: `{item['sourcePath']}`")
        if item.get("sourceItemIds"):
            lines.append(f"- Source item ids: `{', '.join(item['sourceItemIds'])}`")
        lines.append("")

    lines.extend([
        "## Proposed source-preserving documents",
        "",
        "| Kind | Title | Words | Source family | Relative path |",
        "| --- | --- | ---: | --- | --- |",
    ])
    for doc in payload["proposedSourceDocuments"]:
        title = str(doc["title"]).replace("|", "\\|")
        relative = str(doc["relativePath"]).replace("|", "\\|")
        lines.append(f"| {doc['kind']} | {title} | {doc['wordCount']} | {doc['sourceFamily']} | `{relative}` |")

    lines.extend([
        "",
        "## Proposed draft targets",
        "",
        "| Kind | Title | Source ids | Risk | Why |",
        "| --- | --- | --- | --- | --- |",
    ])
    for target in payload["proposedDraftTargets"]:
        title = str(target["title"]).replace("|", "\\|")
        why = str(target["why"]).replace("|", "\\|")
        ids = ", ".join(target.get("sourceItemIds") or [])
        lines.append(f"| {target['kind']} | {title} | `{ids}` | {target['canonicalRisk']} | {why} |")

    lines.extend([
        "",
        "## Safe next actions",
        "",
        "1. Open the Nest writing desk and create a Study Source for Episode 1 prep.",
        "2. Paste the source text manually, tag it Episode 1 and Source, then use Panic Export once to prove recovery.",
        "3. Create an Episode 1 Draft document linked back to the Study Source.",
        "4. Draft episode-page/manuscript prose with visible source references.",
        "5. Only then promote reviewed material into the living manuscript.",
        "",
    ])
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Build an HGO dry-run Nest import preview.")
    parser.add_argument("--atlas", type=Path, default=DEFAULT_ATLAS)
    parser.add_argument("--doc-output", type=Path, default=DEFAULT_DOC_OUTPUT)
    parser.add_argument("--json-output", type=Path, default=DEFAULT_JSON_OUTPUT)
    args = parser.parse_args()

    atlas = json.loads(args.atlas.read_text(encoding="utf-8"))
    items = atlas.get("items") or []
    proposed_sources = build_source_documents(items)
    proposed_targets = build_draft_targets(items)
    payload = {
        "kind": "high-ground-odyssey-import-preview",
        "bookTitle": "High Ground Odyssey",
        "summary": {
            "generatedAt": iso_now(),
            "sourceDocumentsConsidered": len(items),
            "proposedSourceDocuments": len(proposed_sources),
            "proposedDraftTargets": len(proposed_targets),
            "sourceFilesMutated": False,
            "canonicalDocumentMutated": False,
            "databaseMutated": False,
        },
        "proposedSourceDocuments": proposed_sources,
        "proposedDraftTargets": proposed_targets,
        "manualPasteOrder": build_manual_paste_order(proposed_sources, proposed_targets),
    }
    args.doc_output.parent.mkdir(parents=True, exist_ok=True)
    args.json_output.parent.mkdir(parents=True, exist_ok=True)
    args.json_output.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    args.doc_output.write_text(build_markdown(payload), encoding="utf-8")
    print(json.dumps({
        "ok": True,
        "sourceDocumentsConsidered": payload["summary"]["sourceDocumentsConsidered"],
        "proposedSourceDocuments": payload["summary"]["proposedSourceDocuments"],
        "proposedDraftTargets": payload["summary"]["proposedDraftTargets"],
        "docOutput": str(args.doc_output),
        "jsonOutput": str(args.json_output),
        "sourceFilesMutated": False,
        "canonicalDocumentMutated": False,
        "databaseMutated": False,
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
