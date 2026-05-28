#!/usr/bin/env python3
"""Scaffold study-example completion folders from the assignment summary."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SUMMARY_PATH = ROOT / "web" / "data" / "assignment_summary.json"
PROJECT_ROOT = ROOT / "course-projects"


def slugify(value: str) -> str:
    value = value.replace("&", "and").replace(".NET", "dotnet").replace(".net", "dotnet")
    value = re.sub(r"[^A-Za-z0-9]+", "-", value).strip("-").lower()
    return re.sub(r"-+", "-", value) or "untitled"


def course_folder(course: dict) -> Path:
    return PROJECT_ROOT / f"{slugify(course['code']).upper()}-{slugify(course['title'])}"


def assignment_folder(index: int, assignment: dict) -> str:
    lesson = slugify(assignment.get("lesson") or "course")
    title = slugify(assignment.get("title") or "assignment")
    return f"{index:03d}-{lesson}-{title}"


def write_text(path: Path, content: str, *, force: bool) -> bool:
    if path.exists() and not force:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content.rstrip() + "\n", encoding="utf-8")
    return True


def readme_for(course: dict, assignment: dict, index: int) -> str:
    title = assignment["title"]
    return f"""# {course['code']} {index:03d} - {title}

Course: **{course['code']} - {course['title']}**  
Lesson: **{assignment['lesson']}**  
Type: **{assignment['category']}**  
Source: {assignment['url']}

## Purpose

This folder holds an original study-example completion for the assignment-like item above. Treat it as a worked reference and learning artifact, not as a submission to copy unchanged.

## Files

- `completion.md`: the plain-language example completion or response.
- `notes.md`: explanatory footnotes, implementation thinking, and revision ideas.
- `assignment.json`: source metadata used to create this folder.

Add runnable code, data files, screenshots, or drafts beside these files as the example gets filled in.
"""


def completion_for(course: dict, assignment: dict, index: int) -> str:
    return f"""# Example Completion

> Study-example draft for **{course['code']} {index:03d}: {assignment['title']}**.

## Assignment Snapshot

- Course: {course['code']} - {course['title']}
- Lesson: {assignment['lesson']}
- Category: {assignment['category']}
- Source: {assignment['url']}

## What This Example Should Demonstrate

{assignment['summary']}

## Example Completion Draft

This is a scaffolded completion space. Replace this section with an original worked example, runnable program, written response, report, test artifact, or project deliverable that demonstrates the assignment goals in your own words.

For programming work, prefer:

- small, runnable files;
- sample input and output;
- comments that explain the why, not just the what;
- a short reflection on what was confusing and how the example solved it.

For writing or planning work, prefer:

- a concrete scenario;
- a concise answer;
- evidence, tradeoffs, or decision notes;
- a final paragraph in your own voice.

## Completion Checklist

- [ ] Original example is present.
- [ ] Any code runs locally or has clear setup notes.
- [ ] Important assumptions are named.
- [ ] Footnote-style explanatory notes are added in `notes.md` or code comments.
- [ ] Nothing here is treated as a copy-paste course submission.
"""


def notes_for(course: dict, assignment: dict, index: int) -> str:
    return f"""# Notes And Footnotes

These notes are for explaining the example completion for **{course['code']} {index:03d}: {assignment['title']}**.

Use this house style for code comments and prose notes:

- Put the practical explanation first.
- Add short footnote-style asides when they make a tricky idea memorable.
- Keep the humor in service of understanding.
- Do not copy any authorial voice directly; make the notes sound like our own study marginalia.

Example comment pattern:

```text
# [1] This variable keeps the total separate from the input loop. Mixing those together
#     is how programs begin hiding small traps under the furniture.
```

## Footnotes To Add

[1] Explain the central idea of the assignment.

[2] Name the mistake a beginner is likely to make.

[3] Add a tiny example that proves the idea works.
"""


def course_index(course: dict, assignments: list[tuple[int, dict]]) -> str:
    lines = [
        f"# {course['code']} - {course['title']} Example Completions",
        "",
        "This folder contains study-example completions scaffolded from the assignment summary.",
        "",
        "Do not submit these examples unchanged. Use them as worked references while writing your own course work.",
        "",
        "## Assignment Folders",
        "",
        "| # | Lesson | Type | Assignment | Folder |",
        "| ---: | --- | --- | --- | --- |",
    ]
    for index, assignment in assignments:
        folder = assignment_folder(index, assignment)
        title = assignment["title"].replace("|", "\\|")
        lines.append(
            f"| {index:03d} | {assignment['lesson']} | {assignment['category']} | "
            f"[{title}]({assignment['url']}) | [`assignments/{folder}`](assignments/{folder}/) |"
        )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--summary", type=Path, default=SUMMARY_PATH)
    parser.add_argument("--project-root", type=Path, default=PROJECT_ROOT)
    parser.add_argument("--force", action="store_true", help="Overwrite existing scaffold files.")
    args = parser.parse_args()

    summary = json.loads(args.summary.read_text(encoding="utf-8"))
    created = 0
    skipped = 0

    for course in summary["courses"]:
        folder = course_folder(course)
        assignments = list(enumerate(course["assignments"], start=1))
        if write_text(folder / "ASSIGNMENTS.md", course_index(course, assignments), force=args.force):
            created += 1
        else:
            skipped += 1

        for index, assignment in assignments:
            assignment_dir = folder / "assignments" / assignment_folder(index, assignment)
            files = {
                "README.md": readme_for(course, assignment, index),
                "completion.md": completion_for(course, assignment, index),
                "notes.md": notes_for(course, assignment, index),
                "assignment.json": json.dumps(
                    {"course": course["code"], "course_title": course["title"], "index": index, **assignment},
                    indent=2,
                ),
            }
            for filename, content in files.items():
                if write_text(assignment_dir / filename, content, force=args.force):
                    created += 1
                else:
                    skipped += 1

    print(f"Created or updated {created} scaffold files.")
    print(f"Skipped {skipped} existing files.")
    print(f"Courses: {len(summary['courses'])}; assignments: {summary['totals'].get('assignments', 0)}")


if __name__ == "__main__":
    main()
