#!/usr/bin/env python3
"""Build a local Nest writing draft packet from the current workbench.

The draft packet is a safe bridge from source/research organization into real
publishable writing work. It may contain draft prose, outlines, social copy, and
Tower handoff metadata, but it does not mutate source files and it does not
publish anything.
"""

from __future__ import annotations

import argparse
import html
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_NEST_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/NestWriting")
DEFAULT_POINTER = DEFAULT_NEST_ROOT / "latest-nest-writing-source-packet.json"
DEFAULT_OUTPUT_ROOT = DEFAULT_NEST_ROOT / "DraftPackets"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip()).strip("-").lower()
    return slug or "draft-packet"


def load_json(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    return payload if isinstance(payload, dict) else {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def words(text: str) -> list[str]:
    return re.findall(r"[A-Za-z0-9']+", text)


def trim_words(text: str, limit: int) -> str:
    tokens = words(text)
    if len(tokens) <= limit:
        return re.sub(r"\s+", " ", text).strip()
    clipped = " ".join(tokens[:limit]).strip()
    return f"{clipped}..."


def first_paragraph(text: str, limit: int = 420) -> str:
    for part in re.split(r"\n\s*\n", text):
        stripped = re.sub(r"\s+", " ", part).strip()
        if stripped and not stripped.startswith("#"):
            return stripped[:limit]
    return ""


def headings(text: str, limit: int = 12) -> list[str]:
    found = []
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("#"):
            title = stripped.lstrip("#").strip()
            if title:
                found.append(title)
        if len(found) >= limit:
            break
    return found


def read_source_text(path: Path) -> tuple[str, str]:
    try:
        return path.read_text(encoding="utf-8"), ""
    except UnicodeDecodeError:
        return path.read_text(encoding="utf-8", errors="replace"), "encoding-replaced"
    except Exception as exc:
        return "", str(exc)


def clean_source_text_for_draft(text: str) -> str:
    """Return human-facing prose for draft previews without erasing provenance.

    The source packet still keeps paths, tags, and metadata in the source trail.
    This cleaner only prevents YAML frontmatter and scaffolding comments from
    leaking into human-facing draft copy as if they were manuscript prose.
    """
    stripped = text.replace("\r\n", "\n")
    stripped = re.sub(r"\A\s*---\n.*?\n---\s*\n", "", stripped, flags=re.DOTALL)
    cleaned_lines: list[str] = []
    in_html_comment = False
    in_mdx_component_open = False
    for raw_line in stripped.splitlines():
        line = raw_line.strip()
        if not line:
            cleaned_lines.append("")
            continue
        if line.startswith("<!--"):
            in_html_comment = not line.endswith("-->")
            continue
        if in_html_comment:
            if line.endswith("-->"):
                in_html_comment = False
            continue
        if in_mdx_component_open:
            if line.endswith(">"):
                in_mdx_component_open = False
            continue
        if line.startswith("<ManuscriptBlock"):
            if not line.endswith(">"):
                in_mdx_component_open = True
            continue
        if line.startswith("</ManuscriptBlock"):
            continue
        if line.startswith("> This living manuscript"):
            continue
        if re.match(r"^[a-zA-Z][a-zA-Z0-9_-]{1,40}:\s*.*$", line):
            continue
        cleaned_lines.append(raw_line)
    cleaned = "\n".join(cleaned_lines)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def resolve_latest() -> tuple[dict[str, Any], dict[str, Any], Path]:
    if not DEFAULT_POINTER.exists():
        raise SystemExit(f"Missing latest Nest writing pointer: {DEFAULT_POINTER}")
    pointer = load_json(DEFAULT_POINTER)
    packet_path = Path(str(pointer.get("packetPath") or ""))
    workbench_path = Path(str(pointer.get("workbenchJsonPath") or ""))
    if not packet_path.exists():
        raise SystemExit(f"Missing Nest writing source packet: {packet_path}")
    if not workbench_path.exists():
        raise SystemExit(f"Missing Nest writing workbench: {workbench_path}")
    return load_json(packet_path), load_json(workbench_path), workbench_path


def choose_task(workbench: dict[str, Any], task_id: str) -> dict[str, Any]:
    queue = workbench.get("draftQueue") if isinstance(workbench.get("draftQueue"), list) else []
    if not queue:
        raise SystemExit("Current Nest writing workbench has no draft queue.")
    if task_id in {"", "first", "next"}:
        return queue[0]
    for task in queue:
        if task.get("id") == task_id or slugify(str(task.get("title") or "")) == task_id:
            return task
    raise SystemExit(f"Draft task not found: {task_id}")


def prepare_output_dir(output_root: Path, task: dict[str, Any]) -> Path:
    output_root.mkdir(parents=True, exist_ok=True)
    base = output_root / f"{datetime.now().strftime('%Y%m%d-%H%M%S-%f')}-{slugify(str(task.get('id') or task.get('title') or 'draft'))}"
    candidate = base
    counter = 2
    while candidate.exists():
        candidate = Path(f"{base}-{counter}")
        counter += 1
    candidate.mkdir(parents=True, exist_ok=False)
    return candidate


def build_source_bundle(packet: dict[str, Any], task: dict[str, Any]) -> list[dict[str, Any]]:
    by_id = {item.get("id"): item for item in packet.get("items") or []}
    bundle: list[dict[str, Any]] = []
    for source_id in task.get("sourceIds") or []:
        item = by_id.get(source_id)
        if not item:
            continue
        path = Path(str(item.get("sourcePath") or ""))
        text, read_warning = read_source_text(path)
        draft_text = clean_source_text_for_draft(text)
        bundle.append({
            "id": item.get("id"),
            "title": item.get("title"),
            "relativePath": item.get("relativePath"),
            "sourcePath": item.get("sourcePath"),
            "wordCount": item.get("wordCount"),
            "tags": item.get("tags") or [],
            "workstream": item.get("workstream"),
            "readWarning": read_warning,
            "headings": headings(draft_text or text),
            "sample": first_paragraph(draft_text or text),
            "sourceDigest": trim_words(draft_text or text, 140),
            "sourceFilesMutated": False,
        })
    return bundle


def title_for(task: dict[str, Any]) -> str:
    return str(task.get("title") or "Untitled Quipsly draft")


def build_episode_page_draft(task: dict[str, Any], sources: list[dict[str, Any]]) -> dict[str, Any]:
    title = title_for(task)
    source_titles = [source.get("title") or source.get("relativePath") for source in sources]
    source_samples = [source.get("sample") for source in sources if source.get("sample")]
    primary_sample = source_samples[0] if source_samples else ""
    source_digest = " ".join(str(source.get("sourceDigest") or source.get("sample") or "") for source in sources).strip()
    source_seed = trim_words(source_digest or primary_sample, 95)
    review_questions = build_review_questions(task, sources)
    if task.get("type") == "episode-page":
        headline = title.replace("Podcast Year 1/", "").strip()
        intro = (
            f"This episode page is a source-backed draft for {headline}. "
            "It is ready for Charlie/Homer review, not external publication."
        )
        draft_copy = [
            (
                f"{headline} begins as a reviewable High Ground Odyssey episode page: a way to preserve what the conversation is trying to teach "
                "without pretending the first pass is the final word."
            ),
            (
                source_seed
                or "The source packet should be reviewed before this page becomes public copy. The useful move here is to keep the source close enough that every revision can be traced."
            ),
            (
                "The working promise for the reader is simple: here is the messy, human material; here is the thread we think matters; and here is the invitation to test it in your own life before calling it wisdom."
            ),
        ]
        body_sections = [
            {
                "heading": "Episode summary",
                "body": draft_copy[0] + " " + (draft_copy[1] if draft_copy[1] else ""),
            },
            {
                "heading": "Why it matters",
                "body": "Use this section to connect the episode to the broader High Ground Odyssey arc: leadership, risk, attention, responsibility, and becoming a little braver without pretending the path is tidy. " + draft_copy[2],
            },
            {
                "heading": "Source trail",
                "body": "This draft is grounded in the sources listed below. Reviewers should compare the final copy against those files before publishing.",
            },
        ]
        output_kind = "episode-page"
    elif task.get("type") == "book-section":
        headline = title
        if ("/" in headline or headline.endswith(".mdx")) and source_titles:
            headline = str(source_titles[0])
        intro = f"This is a source-backed outline and revision packet for the book section `{headline}`."
        draft_copy = [
            f"{headline} is a book-section draft packet, not a canonical rewrite. It exists so the source material can be shaped without losing provenance.",
            source_seed or "Review the source packet, then decide what belongs in Homer's voice, Charlie's connective tissue, or the notes layer.",
            "A strong revision should make the section easier to enter while preserving the odd edges that make the original insight worth carrying.",
        ]
        body_sections = [
            {"heading": "Section purpose", "body": draft_copy[0] + " " + draft_copy[1]},
            {"heading": "Revision questions", "body": "What story is being preserved? What needs to become clearer? What should stay in Homer's voice, Charlie's voice, or source-note form?"},
            {"heading": "Source trail", "body": "Do not replace canonical manuscript text until the source trail is reviewed."},
        ]
        output_kind = "book-section"
    else:
        headline = title
        intro = f"This is a source-backed article or research draft packet for `{headline}`."
        draft_copy = [
            f"{headline} is a reviewable article seed built from source material rather than a blank-page guess.",
            source_seed or "The article angle should be chosen from the source packet before public copy is approved.",
            "The draft should help a real reader do something clearer, kinder, braver, or more skillful than they could before reading.",
        ]
        body_sections = [
            {"heading": "Article angle", "body": draft_copy[0] + " " + draft_copy[1]},
            {"heading": "Draft path", "body": "Prepare a useful article draft with clear provenance and a review checklist."},
            {"heading": "Source trail", "body": "Use the sources below before any public copy is approved."},
        ]
        output_kind = "article"
    return {
        "kind": output_kind,
        "headline": headline,
        "dek": intro,
        "draftStatus": "draft-preview-needs-human-review",
        "sourceTitles": source_titles,
        "sourceNotes": source_notes_for_draft(sources),
        "draftCopy": draft_copy,
        "reviewQuestions": review_questions,
        "revisionPrompts": [
            "Make the draft more specific without making it sound falsely certain.",
            "Preserve useful strangeness in the source instead of normalizing the voice.",
            "Mark any sentence that needs a better example, quote, or episode timestamp before publication.",
            "Decide what is public-copy ready, what belongs in manuscript notes, and what should stay private.",
        ],
        "socialHooks": build_social_hooks(headline, task, sources),
        "sections": body_sections,
        "reviewerNote": "This is useful draft material, not canonical source truth and not a publication receipt.",
    }


def build_platform_packets(task: dict[str, Any], draft: dict[str, Any]) -> dict[str, Any]:
    headline = draft["headline"]
    description = draft["dek"]
    short_summary = trim_words(description, 35)
    body_preview = "\n\n".join(draft.get("draftCopy") or [])
    social_hooks = draft.get("socialHooks") or [
        f"What does {headline} ask us to notice?",
        f"{headline}: a source-backed High Ground Odyssey reflection.",
        f"Messy source material, preserved trail, reviewable draft: {headline}.",
    ]
    return {
        "HighGroundOdyssey.com": {
            "type": "episode-page-or-article",
            "title": headline,
            "descriptionDraft": description,
            "bodyPreview": body_preview,
            "reviewNote": "Publish only after source review and human approval. This packet prepares copy; it is not canon by itself.",
            "status": "draft-only-needs-human-review",
        },
        "Patreon": {
            "type": "supporter-post",
            "title": f"New High Ground Odyssey draft: {headline}",
            "bodyDraft": (
                f"Here is the review-ready draft packet for {headline}. It keeps the source trail visible so we can revise it honestly "
                "before it becomes public copy."
            ),
            "status": "draft-only-not-posted",
        },
        "YouTube": {
            "type": "description-copy",
            "titleDraft": headline,
            "descriptionDraft": description,
            "chapterSeed": draft.get("reviewQuestions") or [],
            "status": "draft-only-not-uploaded",
        },
        "PodcastRSS": {
            "type": "show-notes",
            "titleDraft": headline,
            "summaryDraft": short_summary,
            "notesDraft": body_preview,
            "status": "draft-only-not-published",
        },
        "Social": {
            "type": "social-copy-seeds",
            "shortDrafts": social_hooks,
            "status": "draft-only-not-scheduled",
        },
    }


def source_notes_for_draft(sources: list[dict[str, Any]]) -> list[str]:
    notes: list[str] = []
    for source in sources:
        title = source.get("title") or source.get("relativePath") or "Untitled source"
        sample = source.get("sample") or source.get("sourceDigest") or ""
        tags = ", ".join(source.get("tags") or [])
        heading_text = "; ".join((source.get("headings") or [])[:3])
        pieces = [f"{title}"]
        if tags:
            pieces.append(f"tags: {tags}")
        if heading_text:
            pieces.append(f"headings: {heading_text}")
        if sample:
            pieces.append(f"seed: {trim_words(sample, 42)}")
        notes.append(" | ".join(pieces))
    return notes


def build_review_questions(task: dict[str, Any], sources: list[dict[str, Any]]) -> list[str]:
    source_titles = [source.get("title") or source.get("relativePath") for source in sources]
    title = title_for(task)
    questions = [
        f"What should {title} leave the reader or listener able to feel, notice, or try?",
        "Where does the draft preserve the source voice, and where does it accidentally smooth over something important?",
        "What claim needs a stronger example before this becomes public?",
        "What should be removed because it is only scaffold, not final copy?",
    ]
    if source_titles:
        questions.append(f"Which source is doing the most work here: {source_titles[0]}?")
    return questions


def build_social_hooks(headline: str, task: dict[str, Any], sources: list[dict[str, Any]]) -> list[str]:
    source_phrase = "the source trail" if sources else "the draft trail"
    return [
        f"{headline}: what changes when we keep {source_phrase} visible instead of pretending the clean answer came first?",
        f"A High Ground Odyssey draft for anyone trying to turn hard-won experience into something useful.",
        f"The point is not to sound polished first. The point is to make the thinking visible enough to make it better.",
    ]


def write_markdown(path: Path, packet: dict[str, Any]) -> None:
    draft = packet["draftPreview"]
    start = packet.get("reviewStartHere") if isinstance(packet.get("reviewStartHere"), dict) else {}
    lines = [
        "# Nest writing draft packet",
        "",
        f"Generated: {packet['generatedAt']}",
        "",
        packet["truth"],
        "",
        f"Task: `{packet['task']['id']}`",
        f"Type: `{packet['task']['type']}`",
        f"Status: `{draft['draftStatus']}`",
        "",
        f"# {draft['headline']}",
        "",
        draft["dek"],
        "",
        "## Start here",
        "",
        start.get("firstAction") or "Review the draft against its source trail before publication.",
        "",
        "Safe next actions:",
        "",
    ]
    for item in start.get("safeNextActions") or []:
        lines.append(f"- {item}")
    lines.extend([
        "",
        "Do not do these without explicit approval:",
        "",
    ]
    )
    for item in start.get("notAllowedWithoutApproval") or []:
        lines.append(f"- {item}")
    lines.append("")
    for section in draft["sections"]:
        lines.extend([f"## {section['heading']}", "", section["body"], ""])
    lines.extend([
        "## Draft copy",
        "",
    ])
    for paragraph in draft.get("draftCopy") or []:
        lines.extend([paragraph, ""])
    lines.extend([
        "## Review questions",
        "",
    ])
    for item in draft.get("reviewQuestions") or []:
        lines.append(f"- {item}")
    lines.extend([
        "",
        "## Revision prompts",
        "",
    ])
    for item in draft.get("revisionPrompts") or []:
        lines.append(f"- {item}")
    lines.extend([
        "",
        "## Social hooks",
        "",
    ])
    for item in draft.get("socialHooks") or []:
        lines.append(f"- {item}")
    lines.append("")
    lines.extend([
        "## Source trail",
        "",
        "| Source | Words | Tags | Path |",
        "| --- | ---: | --- | --- |",
    ])
    for source in packet["sources"]:
        tags = ", ".join(source.get("tags") or []) or "-"
        lines.append(f"| {source.get('title')} | {source.get('wordCount')} | {tags} | `{source.get('relativePath')}` |")
    lines.extend([
        "",
        "## Source notes",
        "",
    ])
    for item in draft.get("sourceNotes") or []:
        lines.append(f"- {item}")
    lines.extend([
        "",
        "## Review checklist",
        "",
    ])
    for item in packet["reviewChecklist"]:
        lines.append(f"- [ ] {item}")
    lines.extend([
        "",
        "## Safety",
        "",
        "- Source files mutated: false",
        "- External publishing: false",
        "- Canonical manuscript replacement: false",
    ])
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_html(path: Path, packet: dict[str, Any]) -> None:
    draft = packet["draftPreview"]
    start = packet.get("reviewStartHere") if isinstance(packet.get("reviewStartHere"), dict) else {}
    source_cards = []
    for source in packet["sources"]:
        source_cards.append(f"""
          <article>
            <div class="eyebrow">{html.escape(str(source.get('workstream') or 'source'))}</div>
            <h3>{html.escape(str(source.get('title') or 'Untitled source'))}</h3>
            <p>{html.escape(str(source.get('sample') or 'No sample available.'))}</p>
            <small>{html.escape(str(source.get('relativePath') or ''))}</small>
          </article>
        """)
    sections = []
    safe_actions = "".join(f"<li>{html.escape(str(item))}</li>" for item in start.get("safeNextActions") or [])
    not_allowed = "".join(f"<li>{html.escape(str(item))}</li>" for item in start.get("notAllowedWithoutApproval") or [])
    sections.append(f"""
      <section>
        <h2>Start here</h2>
        <p>{html.escape(str(start.get('firstAction') or 'Review the draft against its source trail before publication.'))}</p>
        <h3>Safe next actions</h3>
        <ul>{safe_actions}</ul>
        <h3>Not without explicit approval</h3>
        <ul>{not_allowed}</ul>
      </section>
    """)
    for section in draft["sections"]:
        sections.append(f"<section><h2>{html.escape(section['heading'])}</h2><p>{html.escape(section['body'])}</p></section>")
    def list_section(title: str, items: list[Any]) -> str:
        if not items:
            return ""
        rendered = "".join(f"<li>{html.escape(str(item))}</li>" for item in items)
        return f"<section><h2>{html.escape(title)}</h2><ul>{rendered}</ul></section>"

    draft_copy = "".join(f"<p>{html.escape(str(paragraph))}</p>" for paragraph in draft.get("draftCopy") or [])
    sections.append(f"<section><h2>Draft copy</h2>{draft_copy}</section>")
    sections.append(list_section("Review questions", draft.get("reviewQuestions") or []))
    sections.append(list_section("Revision prompts", draft.get("revisionPrompts") or []))
    sections.append(list_section("Social hooks", draft.get("socialHooks") or []))
    sections.append(list_section("Source notes", draft.get("sourceNotes") or []))
    platform_cards = []
    for platform, platform_packet in (packet.get("platformPackets") or {}).items():
        if not isinstance(platform_packet, dict):
            continue
        preview = (
            platform_packet.get("descriptionDraft")
            or platform_packet.get("summaryDraft")
            or platform_packet.get("bodyDraft")
            or platform_packet.get("notesDraft")
            or ""
        )
        if isinstance(platform_packet.get("shortDrafts"), list):
            preview = " / ".join(str(item) for item in platform_packet["shortDrafts"][:3])
        platform_cards.append(f"""
          <article>
            <div class="eyebrow">{html.escape(str(platform))}</div>
            <h3>{html.escape(str(platform_packet.get('type') or 'platform copy'))}</h3>
            <p>{html.escape(str(preview))}</p>
            <small>{html.escape(str(platform_packet.get('status') or 'draft-only'))}</small>
          </article>
        """)
    html_text = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{html.escape(draft['headline'])}</title>
  <style>
    :root {{ color-scheme:dark; --bg:#111812; --panel:#1d2a20; --ink:#fbf0d8; --muted:#c9bda0; --gold:#eac95f; --moss:#90bf73; --line:rgba(251,240,216,.16); }}
    body {{ margin:0; font-family:Avenir Next, Helvetica Neue, sans-serif; background:radial-gradient(circle at top left, rgba(144,191,115,.18), transparent 36%), var(--bg); color:var(--ink); }}
    header, main {{ padding:34px clamp(20px,5vw,76px); }}
    header {{ border-bottom:1px solid var(--line); }}
    .eyebrow {{ color:var(--gold); letter-spacing:.2em; text-transform:uppercase; font-size:12px; font-weight:900; }}
    h1 {{ font-size:clamp(38px,6vw,82px); line-height:.92; margin:10px 0; }}
    p {{ color:var(--muted); line-height:1.55; max-width:900px; }}
    section {{ border:1px solid var(--line); border-radius:24px; padding:20px; margin:16px 0; background:rgba(0,0,0,.16); }}
    .sources {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:14px; }}
    article {{ border:1px solid var(--line); border-radius:20px; padding:16px; background:linear-gradient(180deg,var(--panel),#121a14); }}
    small {{ color:var(--muted); overflow-wrap:anywhere; }}
    code {{ color:var(--gold); overflow-wrap:anywhere; }}
  </style>
</head>
<body>
  <header>
    <div class="eyebrow">Quipsly Nest Draft Packet</div>
    <h1>{html.escape(draft['headline'])}</h1>
    <p>{html.escape(draft['dek'])}</p>
    <p><code>{html.escape(packet['truth'])}</code></p>
  </header>
  <main>
    {''.join(sections)}
    <h2>Source trail</h2>
    <div class="sources">{''.join(source_cards)}</div>
    <h2>Platform copy packets</h2>
    <div class="sources">{''.join(platform_cards)}</div>
  </main>
</body>
</html>
"""
    path.write_text(html_text, encoding="utf-8")


def build_packet(task_id: str, output_root: Path) -> dict[str, Any]:
    source_packet, workbench, workbench_path = resolve_latest()
    task = choose_task(workbench, task_id)
    sources = build_source_bundle(source_packet, task)
    output_dir = prepare_output_dir(output_root, task)
    draft = build_episode_page_draft(task, sources)
    title = draft.get("headline") or title_for(task)
    source_titles = [str(source.get("title") or source.get("relativePath") or "Untitled source") for source in sources]
    packet = {
        "schema": "quipsly.nest-writing.draft-packet.v1",
        "generatedAt": iso_now(),
        "taskId": task.get("id") or "",
        "title": title,
        "status": draft.get("draftStatus") or "draft-preview-needs-human-review",
        "sourceCount": len(sources),
        "sessionDir": str(output_dir),
        "sourcePacketPath": str(DEFAULT_POINTER),
        "workbenchPath": str(workbench_path),
        "truth": "Local writing draft packet only. Source files are untouched; this is not canonical manuscript replacement and not external publication.",
        "task": task,
        "sources": sources,
        "sourceTrailSummary": {
            "sourceCount": len(sources),
            "sourceTitles": source_titles,
            "readWarnings": [source.get("readWarning") for source in sources if source.get("readWarning")],
            "sourceFilesMutated": False,
        },
        "draftPreview": draft,
        "platformPackets": build_platform_packets(task, draft),
        "nextSafestAction": "Read the draft preview with the source trail visible, then request revisions or approve a specific platform packet only after human review.",
        "reviewStartHere": {
            "status": "draft-preview-needs-human-review",
            "firstAction": "Read the draft preview, then compare it against the source trail before approving any public use.",
            "safeNextActions": [
                "Request revision with concrete notes.",
                "Approve the draft for a specific platform packet.",
                "Keep as research/source material only.",
                "Capture a publication receipt only after a real external URL exists.",
            ],
            "notAllowedWithoutApproval": [
                "Replace canonical manuscript text.",
                "Publish externally.",
                "Overwrite source files.",
                "Create fake receipt truth.",
            ],
        },
        "reviewChecklist": [
            "Check draft against every source listed in the source trail.",
            "Confirm the voice fits High Ground Odyssey and does not flatten Homer/Charlie style.",
            "Decide whether this should become an episode page, article, Patreon post, show notes, or all of them.",
            "Confirm no source file should be replaced by this draft preview.",
            "Capture Tower publication receipts only after a real external URL exists.",
        ],
        "towerHandoff": {
            "status": "draft-ready-for-human-review",
            "externalPublishing": False,
            "receiptSlots": [
                {"platform": "HighGroundOdyssey.com", "status": "not_published", "url": "", "providerId": ""},
                {"platform": "Patreon", "status": "not_posted", "url": "", "providerId": ""},
                {"platform": "YouTube", "status": "not_uploaded", "url": "", "providerId": ""},
                {"platform": "PodcastRSS", "status": "not_published", "url": "", "providerId": ""},
            ],
        },
        "safety": {
            "sourceFilesMutated": False,
            "externalPublishing": False,
            "previousVersionsOverwritten": False,
            "canonicalManuscriptReplaced": False,
        },
    }
    json_path = output_dir / "draft-packet.json"
    md_path = output_dir / "START-HERE-draft-packet.md"
    html_path = output_dir / "index.html"
    tower_path = output_dir / "tower-handoff.json"
    platform_path = output_dir / "platform-packets.json"
    packet.update({
        "jsonPath": str(json_path),
        "markdownPath": str(md_path),
        "htmlPath": str(html_path),
        "towerHandoffPath": str(tower_path),
        "platformPacketsPath": str(platform_path),
    })
    packet["counts"] = {
        "sourceCount": len(sources),
        "platformPacketCount": len(packet.get("platformPackets") or {}),
        "receiptSlots": len(packet.get("towerHandoff", {}).get("receiptSlots") or []),
        "sourceFilesMutated": False,
        "canonicalManuscriptReplaced": False,
        "externalPublishing": False,
    }
    packet["firstSafeAction"] = {
        "label": "Open draft packet",
        "command": "open '" + str(html_path).replace("'", "'\\''") + "'",
        "path": str(html_path),
        "safety": "Draft preview only; source files are untouched and nothing is published.",
        "taskId": task.get("id") or "",
        "title": title,
    }
    write_json(json_path, packet)
    write_json(tower_path, packet["towerHandoff"])
    write_json(platform_path, packet["platformPackets"])
    write_markdown(md_path, packet)
    write_html(html_path, packet)
    pointer = {
        "schema": "quipsly.nest-writing.latest-draft-packet.v1",
        "updatedAt": iso_now(),
        "humanAsk": "Review the draft packet against its source trail before treating it as manuscript, article, or public-copy truth.",
        "agentSafeParallelWork": "Codex may draft, outline, summarize, cite source trails, and prepare Tower handoff packets. Do not replace canonical manuscript text, publish externally, overwrite sources, or claim approval.",
        "taskId": task.get("id"),
        "sessionDir": str(output_dir),
        "jsonPath": str(json_path),
        "markdownPath": str(md_path),
        "htmlPath": str(html_path),
        "towerHandoffPath": str(tower_path),
        "platformPacketsPath": str(platform_path),
        "sourceCount": len(sources),
        "title": title,
        "status": draft.get("draftStatus") or "draft-preview-needs-human-review",
        "counts": packet["counts"],
        "nextSafestAction": packet["nextSafestAction"],
        "firstSafeAction": packet["firstSafeAction"],
        "truth": "Pointer only. Versioned draft packet folders are preserved.",
    }
    pointer_path = DEFAULT_NEST_ROOT / "latest-nest-writing-draft-packet.json"
    write_json(pointer_path, pointer)
    packet["artifactPaths"] = {
        "json": str(json_path),
        "markdown": str(md_path),
        "html": str(html_path),
        "towerHandoff": str(tower_path),
        "platformPackets": str(platform_path),
        "pointer": str(pointer_path),
    }
    write_json(json_path, packet)
    return packet


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a local Nest writing draft packet from the current workbench.")
    parser.add_argument("task_id", nargs="?", default="first", help="Draft queue id, slug, or 'first'.")
    parser.add_argument("--output-root", default=str(DEFAULT_OUTPUT_ROOT))
    args = parser.parse_args()
    packet = build_packet(args.task_id, Path(args.output_root).expanduser())
    print(json.dumps({
        "ok": True,
        "schema": "quipsly.nest-writing.draft-packet.summary.v1",
        "generatedAt": packet.get("generatedAt"),
        "status": packet.get("status"),
        "taskId": packet["task"].get("id"),
        "title": packet["draftPreview"].get("headline"),
        "sessionDir": packet["sessionDir"],
        "htmlPath": packet["artifactPaths"]["html"],
        "markdownPath": packet["artifactPaths"]["markdown"],
        "jsonPath": packet["artifactPaths"]["json"],
        "towerHandoffPath": packet["artifactPaths"]["towerHandoff"],
        "platformPacketsPath": packet["artifactPaths"]["platformPackets"],
        "firstSafeAction": packet.get("firstSafeAction"),
        "nextSafestAction": packet.get("nextSafestAction"),
        "counts": packet.get("counts"),
        "truth": packet.get("truth"),
        "sourceCount": len(packet["sources"]),
        "sourceFilesMutated": False,
        "canonicalManuscriptReplaced": False,
        "externalPublishing": False,
        "receiptTruthCreated": False,
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
