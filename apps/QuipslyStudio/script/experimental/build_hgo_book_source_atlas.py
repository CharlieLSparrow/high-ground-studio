#!/usr/bin/env python3
"""Build a read-only High Ground Odyssey book source atlas.

The atlas does not import, rewrite, reconcile, or mutate source files. It gives
Nest a durable source map for the newer podcast-prep material and the older,
more complete book manuscript so humans and agents can decide what to draft,
tag, compare, or promote next without losing provenance.
"""

from __future__ import annotations

import argparse
import json
import os
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_NEWER_ROOT = REPO_ROOT / "apps/web/content/_inbox/EpisodePrepTests/Two Sparrows/Books/Podcast Year 1"
DEFAULT_OLDER_ROOT = REPO_ROOT / "apps/web/content/_inbox/HighGroundOdysseyBook/Two Sparrows/Books/Learning to Lead"
DEFAULT_DOC_OUTPUT = REPO_ROOT / "apps/QuipslyStudio/docs/quipsly/high-ground-odyssey-source-atlas.md"
DEFAULT_JSON_OUTPUT = REPO_ROOT / "apps/QuipslyStudio/docs/quipsly/high-ground-odyssey-source-atlas.json"
TEXT_EXTENSIONS = {".md", ".mdx", ".txt"}


@dataclass(frozen=True)
class SourceFamily:
    key: str
    label: str
    role: str
    root: Path
    priority_note: str


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def words(text: str) -> list[str]:
    return re.findall(r"[A-Za-z0-9']+", text)


def title_from_text(path: Path, text: str) -> str:
    for line in text.splitlines()[:60]:
        stripped = line.strip()
        if stripped.startswith("#"):
            title = stripped.lstrip("#").strip()
            if title and len(title) <= 120:
                return title
    return path.stem


def first_paragraph(text: str, limit: int = 220) -> str:
    for part in re.split(r"\n\s*\n", text):
        stripped = re.sub(r"\s+", " ", part).strip()
        if stripped and not stripped.startswith("#"):
            return stripped[:limit]
    return ""


def infer_document_role(family: SourceFamily, relative_path: str, title: str) -> str:
    haystack = f"{relative_path} {title}".lower()
    if family.key == "podcast-year-1":
        if re.search(r"/?[1-9]\.md$", relative_path.lower()) or re.search(r"\bepisode|pilot|april|march|values|army|shush", haystack):
            return "episode-recording-prep"
        return "podcast-season-index"

    if "preface" in haystack:
        return "preface-source"
    if "introduction" in haystack or "forward" in haystack:
        return "front-matter-source"
    if "chapter" in haystack:
        return "chapter-source"
    if "outtro" in haystack:
        return "back-matter-source"
    if "for the next book" in haystack:
        return "future-book-note"
    if "research" in haystack or "hansen statement" in haystack:
        return "research-source"
    return "book-source"


def sorted_text_files(root: Path, limit: int) -> list[Path]:
    files: list[Path] = []
    if not root.exists():
        return files

    for current_root, dirs, filenames in os.walk(root):
        dirs[:] = sorted([
            dirname for dirname in dirs
            if not dirname.startswith(".") and dirname not in {"node_modules", "DerivedData", "__pycache__"}
        ])
        for filename in sorted(filenames):
            path = Path(current_root) / filename
            if path.name.startswith(".") or path.suffix.lower() not in TEXT_EXTENSIONS:
                continue
            files.append(path)
            if limit > 0 and len(files) >= limit:
                return files
    return files


def read_text(path: Path) -> tuple[str, str]:
    try:
        return path.read_text(encoding="utf-8"), ""
    except UnicodeDecodeError:
        return path.read_text(encoding="utf-8", errors="replace"), "unicode-replacement"
    except Exception as exc:
        return "", str(exc)


def build_family_items(family: SourceFamily, limit: int) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    root_resolved = family.root.resolve() if family.root.exists() else family.root
    for index, path in enumerate(sorted_text_files(family.root, limit), start=1):
        text, read_warning = read_text(path)
        title = title_from_text(path, text)
        try:
            relative_path = path.resolve().relative_to(root_resolved).as_posix()
        except Exception:
            relative_path = path.name
        word_count = len(words(text))
        items.append({
            "id": f"{family.key}-{index:03d}",
            "family": family.key,
            "familyLabel": family.label,
            "familyRole": family.role,
            "title": title,
            "sourcePath": str(path),
            "relativePath": relative_path,
            "documentRole": infer_document_role(family, relative_path, title),
            "wordCount": word_count,
            "lineCount": len(text.splitlines()),
            "byteCount": path.stat().st_size if path.exists() else 0,
            "readWarning": read_warning,
            "sample": first_paragraph(text),
            "safeNextActions": [
                "inventory",
                "tag",
                "compare",
                "draft-with-visible-source-trail",
                "human-promote-if-useful",
            ],
        })
    return items


def summarize(items: list[dict[str, Any]], families: list[SourceFamily]) -> dict[str, Any]:
    by_family: dict[str, dict[str, Any]] = {}
    by_role: dict[str, int] = {}
    for family in families:
        family_items = [item for item in items if item["family"] == family.key]
        by_family[family.key] = {
            "label": family.label,
            "role": family.role,
            "root": str(family.root),
            "exists": family.root.exists(),
            "documents": len(family_items),
            "words": sum(item["wordCount"] for item in family_items),
            "priorityNote": family.priority_note,
        }
    for item in items:
        by_role[item["documentRole"]] = by_role.get(item["documentRole"], 0) + 1
    return {
        "documents": len(items),
        "words": sum(item["wordCount"] for item in items),
        "sourceFilesMutated": False,
        "canonicalDocumentMutated": False,
        "generatedAt": iso_now(),
        "byFamily": by_family,
        "byRole": dict(sorted(by_role.items())),
    }


def markdown_table(items: list[dict[str, Any]]) -> str:
    lines = [
        "| Family | Role | Title | Words | Relative path |",
        "| --- | --- | --- | ---: | --- |",
    ]
    for item in items:
        title = str(item["title"]).replace("|", "\\|")
        relative = str(item["relativePath"]).replace("|", "\\|")
        lines.append(f"| {item['familyLabel']} | {item['documentRole']} | {title} | {item['wordCount']} | `{relative}` |")
    return "\n".join(lines)


def build_markdown(payload: dict[str, Any]) -> str:
    summary = payload["summary"]
    families = summary["byFamily"]
    items = payload["items"]
    lines = [
        "# High Ground Odyssey Source Atlas",
        "",
        f"Generated: `{summary['generatedAt']}`",
        "",
        "This is a read-only source inventory for the High Ground Odyssey writing lane. It does not import, rewrite, reconcile, or mutate source files.",
        "",
        "## Product rule",
        "",
        "- Working title: **High Ground Odyssey**.",
        "- Newer podcast-prep files are the priority source for what was actually used to record Episodes 1-8.",
        "- Older book files are the broader completeness/reference source.",
        "- Agents may draft, compare, summarize, and suggest tags, but every useful draft must keep its source trail visible.",
        "- The living manuscript should be promoted intentionally by a human-controlled save path, not silently replaced by source reconciliation.",
        "",
        "## Summary",
        "",
        f"- Documents inventoried: `{summary['documents']}`",
        f"- Total words: `{summary['words']}`",
        f"- Source files mutated: `{summary['sourceFilesMutated']}`",
        f"- Canonical document mutated: `{summary['canonicalDocumentMutated']}`",
        "",
        "## Source families",
        "",
    ]
    for family_key, family in families.items():
        lines.extend([
            f"### {family['label']}",
            "",
            f"- Key: `{family_key}`",
            f"- Role: {family['role']}",
            f"- Root exists: `{family['exists']}`",
            f"- Documents: `{family['documents']}`",
            f"- Words: `{family['words']}`",
            f"- Priority: {family['priorityNote']}",
            f"- Root: `{family['root']}`",
            "",
        ])
    lines.extend([
        "## Document role counts",
        "",
    ])
    for role, count in summary["byRole"].items():
        lines.append(f"- `{role}`: {count}")
    lines.extend([
        "",
        "## Inventory",
        "",
        markdown_table(items),
        "",
        "## Safe next actions",
        "",
        "1. Use this atlas to choose what to paste/tag manually into Nest first.",
        "2. Build an import preview that creates Draft, Note, or Study Source documents without overwriting the manuscript.",
        "3. Compare newer episode-prep files against older chapter files with visible provenance.",
        "4. Draft missing Charlie/Homer connective sections as drafts, not silent canonical manuscript replacements.",
        "5. Promote only reviewed material into the living manuscript spine.",
        "",
    ])
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a read-only HGO book source atlas.")
    parser.add_argument("--newer-root", type=Path, default=DEFAULT_NEWER_ROOT)
    parser.add_argument("--older-root", type=Path, default=DEFAULT_OLDER_ROOT)
    parser.add_argument("--doc-output", type=Path, default=DEFAULT_DOC_OUTPUT)
    parser.add_argument("--json-output", type=Path, default=DEFAULT_JSON_OUTPUT)
    parser.add_argument("--limit", type=int, default=0, help="Limit per source family; 0 means no limit.")
    args = parser.parse_args()

    families = [
        SourceFamily(
            key="podcast-year-1",
            label="Podcast Year 1",
            role="Newer episode prep actually used for recording Episodes 1-8.",
            root=args.newer_root,
            priority_note="Use first for episode-linked writing and podcast-page drafting.",
        ),
        SourceFamily(
            key="learning-to-lead",
            label="Learning to Lead",
            role="Older, more complete book/chapter manuscript source.",
            root=args.older_root,
            priority_note="Use as completeness/reference material; compare before promoting.",
        ),
    ]
    items: list[dict[str, Any]] = []
    for family in families:
        items.extend(build_family_items(family, args.limit))

    payload = {
        "kind": "high-ground-odyssey-source-atlas",
        "bookTitle": "High Ground Odyssey",
        "summary": summarize(items, families),
        "items": items,
    }

    args.doc_output.parent.mkdir(parents=True, exist_ok=True)
    args.json_output.parent.mkdir(parents=True, exist_ok=True)
    args.json_output.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    args.doc_output.write_text(build_markdown(payload), encoding="utf-8")
    print(json.dumps({
        "ok": True,
        "documents": payload["summary"]["documents"],
        "words": payload["summary"]["words"],
        "docOutput": str(args.doc_output),
        "jsonOutput": str(args.json_output),
        "sourceFilesMutated": False,
        "canonicalDocumentMutated": False,
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
