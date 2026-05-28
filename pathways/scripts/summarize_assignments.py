#!/usr/bin/env python3
"""Create a degree-wide assignment summary from the Pathways workbench source DB."""

from __future__ import annotations

import argparse
import json
import re
import sqlite3
import textwrap
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DB = ROOT / "data" / "pathways_workbench.sqlite"
USER_DB = ROOT / "data" / "pathways_user.sqlite"
DEFAULT_MARKDOWN = ROOT / "docs" / "full-degree-assignment-summary.md"
DEFAULT_JSON = ROOT / "web" / "data" / "assignment_summary.json"

ASSIGNMENT_TERMS = [
    "assignment",
    "project",
    "activity",
    "submit",
    "prove",
    "report",
    "case study",
    "deliverable",
    "challenge",
    "exercise",
    "status update",
    "team activity",
]

STOP_TITLES = {
    "ai policy",
    "course home",
    "home",
    "overview",
    "syllabus",
}

RESOURCE_EXTENSIONS = (
    ".csv",
    ".docx",
    ".gif",
    ".jpg",
    ".jpeg",
    ".md",
    ".pdf",
    ".png",
    ".py",
    ".svg",
    ".txt",
    ".xlsx",
    ".zip",
)


@dataclass
class Block:
    id: str
    position: int
    type: str
    text: str
    user_tags: list[str] = field(default_factory=list)


@dataclass
class Page:
    id: str
    course_id: str
    lesson: str
    page_type: str
    link_text: str
    url: str
    source_page: str
    html_title: str
    extracted_title: str
    status: str
    audit_note: str
    blocks: list[Block] = field(default_factory=list)


@dataclass
class Course:
    id: str
    certificate: str
    code: str
    title: str
    pages: list[Page] = field(default_factory=list)


def normalized(value: str | None) -> str:
    return re.sub(r"\s+", " ", value or "").strip().lower()


def sentence_case(value: str) -> str:
    value = re.sub(r"\s+", " ", value).strip()
    if not value:
        return value
    return value[0].upper() + value[1:]


def text_matches_assignment(value: str | None) -> bool:
    haystack = normalized(value)
    return any(term in haystack for term in ASSIGNMENT_TERMS)


def is_assignment_page(page: Page) -> bool:
    return text_matches_assignment(
        " ".join(
            [
                page.lesson,
                page.page_type,
                page.link_text,
                page.html_title,
                page.extracted_title,
                page.url,
            ]
        )
    )


def is_assignment_block(page: Page, block: Block) -> bool:
    if "assignment" in block.user_tags:
        return True
    if is_assignment_page(page):
        return True
    return text_matches_assignment(block.text)


def page_has_assignment_signal(page: Page) -> bool:
    return is_assignment_page(page) or any(is_assignment_block(page, block) for block in page.blocks)


def title_for_page(page: Page) -> str:
    for value in (page.link_text, page.extracted_title, page.html_title, page.url):
        clean = re.sub(r"\s+", " ", value or "").strip()
        if clean and normalized(clean) not in {"(no text)", "no text"}:
            return clean
    return "Untitled source page"


def page_text(page: Page) -> str:
    return "\n".join(block.text for block in page.blocks if block.text)


def classify_page(page: Page) -> tuple[str, bool]:
    title = normalized(title_for_page(page))
    surface = normalized(
        " ".join([page.lesson, page.page_type, page.link_text, page.extracted_title, page.html_title, page.url])
    )
    body = normalized(page_text(page)[:1200])
    haystack = f"{surface} {body}"
    url = normalized(page.url)

    if page.status != "ok":
        return "Reference/support", False
    if is_resource_reference(page):
        return "Reference/support", False
    if is_week_overview(page):
        return "Reference/support", False
    if any(stop in title for stop in STOP_TITLES) and not re.search(r"assignment|project|prove|develop", url):
        return "Reference/support", False
    if "policy" in title or "instructions" in title:
        return "Reference/support", False
    if any(token in surface for token in ["setup", "install", "development environment", "clone your repository"]):
        return "Setup/tooling task", True
    if any(token in surface for token in ["team activity", "team-activity"]):
        return "Team activity", True
    if any(token in surface for token in ["check your understanding", "course expectations", "quiz"]):
        return "Quiz / check your understanding", True
    if any(token in surface for token in ["final project", "capstone", "portfolio", "project proposal", "project milestone"]):
        return "Project / major deliverable", True
    if any(token in surface for token in ["case study", "report", "status update"]):
        return "Report / case study", True
    if any(token in url for token in ["/assignment-", "assignment-", "assignment_", "/prove", "/develop"]):
        return "Submit / prove assignment", True
    if "project" in surface:
        return "Project / major deliverable", True
    if any(token in surface for token in ["assignment", "submit", "prove", "deliverable"]):
        return "Submit / prove assignment", True
    if any(token in surface for token in ["activity", "exercise", "challenge"]):
        return "Learning activity / exercise", True
    if any(token in body for token in ["final project", "capstone", "portfolio", "project proposal", "project milestone"]):
        return "Project / major deliverable", True
    if any(token in body for token in ["team activity", "team-activity"]):
        return "Team activity", True
    if any(token in body for token in ["case study", "report", "status update"]):
        return "Report / case study", True
    if any(token in body for token in ["assignment", "submit", "prove", "deliverable"]):
        return "Submit / prove assignment", True
    if any(token in body for token in ["activity", "exercise", "challenge"]):
        return "Learning activity / exercise", True
    return "Reference/support", False


def is_week_overview(page: Page) -> bool:
    title = normalized(title_for_page(page))
    url = normalized(page.url).rstrip("/")
    if re.search(r"/week\d+/index\.html$", url) or re.search(r"/week\d+$", url):
        return True
    return bool(re.fullmatch(r"w\d+|week \d+", title))


def is_resource_reference(page: Page) -> bool:
    url = normalized(page.url)
    reference_paths = ["/resources/", "/samples/", "/pages/", "/teton/", "course-content/book/"]
    if any(path in url for path in reference_paths):
        return True
    return any(url.endswith(extension) for extension in RESOURCE_EXTENSIONS)


def summarize_page(page: Page) -> str:
    title = normalized(title_for_page(page))
    candidates: list[str] = []

    for block in page.blocks:
        text = re.sub(r"\s+", " ", block.text or "").strip()
        if not text or len(text) < 18:
            continue
        low = normalized(text)
        if any(skip in low for skip in ["using ai to generate", "if you need help on the assignment"]):
            continue
        if text_matches_assignment(text) or block.type in {"heading", "li"}:
            candidates.append(text)

    if not candidates:
        candidates = [
            re.sub(r"\s+", " ", block.text or "").strip()
            for block in page.blocks
            if len(re.sub(r"\s+", " ", block.text or "").strip()) >= 24
        ]

    cleaned: list[str] = []
    seen: set[str] = set()
    for item in candidates:
        if normalized(item) == title:
            continue
        if normalized(item) in seen:
            continue
        seen.add(normalized(item))
        cleaned.append(item)
        if len(cleaned) >= 3:
            break

    if not cleaned:
        return "Review the linked source page for the exact deliverable."

    summary = " ".join(cleaned)
    summary = re.sub(r"\s+", " ", summary).strip()
    if len(summary) > 360:
        summary = textwrap.shorten(summary, width=360, placeholder="...")
    return sentence_case(summary)


def load_user_tags(path: Path) -> dict[str, list[str]]:
    if not path.exists():
        return {}
    connection = sqlite3.connect(path)
    try:
        rows = connection.execute("SELECT block_id, tags_json FROM user_blocks").fetchall()
    finally:
        connection.close()

    tags: dict[str, list[str]] = {}
    for block_id, tags_json in rows:
        try:
            parsed = json.loads(tags_json or "[]")
        except json.JSONDecodeError:
            parsed = []
        if isinstance(parsed, list):
            tags[block_id] = [str(item) for item in parsed]
    return tags


def load_courses(source_db: Path, user_db: Path) -> list[Course]:
    user_tags = load_user_tags(user_db)
    connection = sqlite3.connect(f"file:{source_db}?mode=ro", uri=True, timeout=30)
    connection.execute("PRAGMA busy_timeout = 30000")
    connection.row_factory = sqlite3.Row
    try:
        course_rows = connection.execute(
            "SELECT id, certificate, code, title FROM courses ORDER BY certificate, code"
        ).fetchall()
        page_rows = connection.execute(
            """
            SELECT id, course_id, lesson, page_type, link_text, url, source_page, html_title,
                   extracted_title, status, audit_note
            FROM pages
            ORDER BY course_id, lesson, url
            """
        ).fetchall()
        block_rows = connection.execute(
            "SELECT id, page_id, position, type, source_text FROM blocks ORDER BY page_id, position"
        ).fetchall()
    finally:
        connection.close()

    courses = [
        Course(
            id=row["id"],
            certificate=row["certificate"],
            code=row["code"],
            title=row["title"],
        )
        for row in course_rows
    ]
    courses_by_id = {course.id: course for course in courses}
    pages_by_id: dict[str, Page] = {}

    for row in page_rows:
        page = Page(
            id=row["id"],
            course_id=row["course_id"],
            lesson=row["lesson"],
            page_type=row["page_type"],
            link_text=row["link_text"],
            url=row["url"],
            source_page=row["source_page"],
            html_title=row["html_title"],
            extracted_title=row["extracted_title"],
            status=row["status"],
            audit_note=row["audit_note"],
        )
        pages_by_id[page.id] = page
        courses_by_id[page.course_id].pages.append(page)

    for row in block_rows:
        block = Block(
            id=row["id"],
            position=row["position"],
            type=row["type"],
            text=row["source_text"],
            user_tags=user_tags.get(row["id"], []),
        )
        pages_by_id[row["page_id"]].blocks.append(block)

    return courses


def build_summary(courses: list[Course]) -> dict:
    course_summaries = []
    totals = Counter()

    for course in courses:
        entries = []
        category_counts = Counter()
        support_count = 0

        for page in course.pages:
            if not page_has_assignment_signal(page):
                continue
            category, actionable = classify_page(page)
            category_counts[category] += 1
            if not actionable:
                support_count += 1
                continue
            entries.append(
                {
                    "lesson": page.lesson,
                    "title": title_for_page(page),
                    "category": category,
                    "summary": summarize_page(page),
                    "url": page.url,
                    "source_page": page.source_page,
                    "status": page.status,
                }
            )

        lesson_counts = Counter(entry["lesson"] for entry in entries)
        course_summaries.append(
            {
                "code": course.code,
                "title": course.title,
                "certificate": course.certificate,
                "assignment_count": len(entries),
                "support_candidate_count": support_count,
                "category_counts": dict(sorted(category_counts.items())),
                "lesson_counts": dict(sorted(lesson_counts.items())),
                "assignments": entries,
            }
        )
        totals["courses"] += 1
        totals["assignments"] += len(entries)
        totals["support_candidates"] += support_count
        totals.update({f"category:{key}": value for key, value in category_counts.items()})

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source_db": str(SOURCE_DB.relative_to(ROOT)),
        "user_db": str(USER_DB.relative_to(ROOT)),
        "assignment_terms": ASSIGNMENT_TERMS,
        "totals": dict(totals),
        "courses": course_summaries,
    }


def markdown_link(title: str, url: str) -> str:
    escaped = title.replace("[", "\\[").replace("]", "\\]")
    return f"[{escaped}]({url})"


def write_markdown(summary: dict, path: Path) -> None:
    totals = summary["totals"]
    lines: list[str] = [
        "# Full Degree Assignment Summary",
        "",
        f"Generated: `{summary['generated_at']}`",
        "",
        "This report uses the same source-aware assignment terms as the Workbench assignment filter: "
        + ", ".join(f"`{term}`" for term in summary["assignment_terms"])
        + ".",
        "",
        "The checklist is intentionally broad. It includes pages the filter sees as assignment-like, then separates obvious reference/support pages out of the main actionable count.",
        "",
        "## At A Glance",
        "",
        f"- Courses scanned: {totals.get('courses', 0)}",
        f"- Actionable assignment-like pages: {totals.get('assignments', 0)}",
        f"- Assignment-filter support/reference candidates not listed as work: {totals.get('support_candidates', 0)}",
        "",
        "## Work Type Totals",
        "",
        "| Work type | Count |",
        "| --- | ---: |",
    ]

    for key, value in sorted(
        (
            (key.removeprefix("category:"), value)
            for key, value in totals.items()
            if key.startswith("category:") and key != "category:Reference/support"
        ),
        key=lambda item: item[1],
        reverse=True,
    ):
        lines.append(f"| {key} | {value} |")

    lines.extend(
        [
            "",
            "## Course Load Map",
            "",
            "| Course | Assignments | Support hits | Main pattern |",
            "| --- | ---: | ---: | --- |",
        ]
    )

    for course in summary["courses"]:
        categories = Counter(course["category_counts"])
        categories.pop("Reference/support", None)
        pattern = ", ".join(f"{key}: {value}" for key, value in categories.most_common(3)) or "Review source"
        lines.append(
            f"| {course['code']} | {course['assignment_count']} | {course['support_candidate_count']} | {pattern} |"
        )

    lines.extend(
        [
            "",
            "## What This Means",
            "",
            "- Most programming courses revolve around weekly projects plus supporting learning activities.",
            "- Web courses build long-running websites in stages, so many weekly assignments are project increments rather than isolated tasks.",
            "- Database, backend, and software-design courses include more reports, case studies, team activities, and analysis documents.",
            "- The assignment filter is intentionally generous; before a live semester, use each linked source page as the authority for exact submission instructions.",
            "",
            "## Course Checklists",
            "",
        ]
    )

    for course in summary["courses"]:
        lines.extend(
            [
                f"### {course['code']} - {course['title']}",
                "",
                f"Actionable assignment-like pages: **{course['assignment_count']}**. "
                f"Support/reference hits: **{course['support_candidate_count']}**.",
                "",
            ]
        )
        if not course["assignments"]:
            lines.extend(["No actionable assignments found by the current filter.", ""])
            continue

        current_lesson = None
        for entry in course["assignments"]:
            if entry["lesson"] != current_lesson:
                current_lesson = entry["lesson"]
                lines.extend([f"#### {current_lesson}", ""])
            title = markdown_link(entry["title"], entry["url"])
            lines.append(f"- **{entry['category']}** - {title}: {entry['summary']}")
        lines.append("")

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-db", type=Path, default=SOURCE_DB)
    parser.add_argument("--user-db", type=Path, default=USER_DB)
    parser.add_argument("--markdown", type=Path, default=DEFAULT_MARKDOWN)
    parser.add_argument("--json", type=Path, default=DEFAULT_JSON)
    args = parser.parse_args()

    courses = load_courses(args.source_db, args.user_db)
    summary = build_summary(courses)

    write_markdown(summary, args.markdown)
    args.json.parent.mkdir(parents=True, exist_ok=True)
    args.json.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    print(f"Wrote {args.markdown.relative_to(ROOT)}")
    print(f"Wrote {args.json.relative_to(ROOT)}")
    print(
        f"{summary['totals'].get('assignments', 0)} actionable assignment-like pages "
        f"across {summary['totals'].get('courses', 0)} courses"
    )


if __name__ == "__main__":
    main()
