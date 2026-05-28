#!/usr/bin/env python3
"""
Import public course pages into a local SQLite database and app-ready JSON.

The script intentionally uses only the Python standard library so it can run in
this workspace before a frontend toolchain exists.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import sqlite3
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CSV = ROOT / "byu_pathway_course_pages_audited.csv"
DEFAULT_DB = ROOT / "data" / "pathways_workbench.sqlite"
DEFAULT_JSON = ROOT / "web" / "data" / "course_data.json"

BLOCK_TAGS = {
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "p",
    "li",
    "pre",
    "blockquote",
    "figcaption",
    "td",
    "th",
}
IGNORE_TAGS = {"script", "style", "svg", "canvas", "noscript", "nav", "header", "footer"}
MEDIA_EXTENSIONS = (".mp4", ".mov", ".m4v", ".webm", ".mp3", ".wav", ".vtt", ".srt")
VIDEO_HOST_HINTS = (
    "youtube.com",
    "youtu.be",
    "vimeo.com",
    "loom.com",
    "panopto",
    "kaltura",
    "video",
    "media",
)


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def clean_space(value: str) -> str:
    return " ".join(unescape(value).replace("\xa0", " ").split())


def stable_id(*parts: str) -> str:
    digest = hashlib.sha1("||".join(parts).encode("utf-8", errors="replace")).hexdigest()
    return digest[:16]


def fetch_text(url: str, timeout: int = 25) -> tuple[str, str]:
    req = Request(
        url,
        headers={
            "User-Agent": "pathways-study-workbench/0.1 (+local personal study importer)",
            "Accept": "text/html,text/plain,application/xhtml+xml,*/*;q=0.8",
        },
    )
    with urlopen(req, timeout=timeout) as resp:
        content_type = resp.headers.get("content-type", "")
        raw = resp.read()
    charset = "utf-8"
    match = re.search(r"charset=([\w.-]+)", content_type)
    if match:
        charset = match.group(1)
    return raw.decode(charset, errors="replace"), content_type


def is_media_url(url: str) -> bool:
    parsed = urlparse(url.lower())
    combined = f"{parsed.netloc}{parsed.path}"
    return any(hint in combined for hint in VIDEO_HOST_HINTS) or parsed.path.endswith(MEDIA_EXTENSIONS)


@dataclass
class Block:
    id: str
    type: str
    text: str
    heading_level: int | None = None


@dataclass
class MediaItem:
    id: str
    type: str
    url: str
    label: str = ""
    transcript_url: str = ""


@dataclass
class ExtractedPage:
    title: str = ""
    blocks: list[Block] = field(default_factory=list)
    links: list[dict[str, str]] = field(default_factory=list)
    media: list[MediaItem] = field(default_factory=list)


class CoursePageParser(HTMLParser):
    def __init__(self, page_url: str):
        super().__init__(convert_charrefs=True)
        self.page_url = page_url
        self.result = ExtractedPage()
        self._ignore_depth = 0
        self._title_open = False
        self._title_parts: list[str] = []
        self._block_tag: str | None = None
        self._block_parts: list[str] = []
        self._block_links: list[dict[str, str]] = []
        self._block_index = 0
        self._link_href: str | None = None
        self._link_parts: list[str] = []
        self._seen_links: set[str] = set()
        self._seen_media: set[str] = set()

    def handle_starttag(self, tag: str, attrs_list: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        attrs = {name.lower(): value or "" for name, value in attrs_list}
        if tag in IGNORE_TAGS:
            self._ignore_depth += 1
            return
        if self._ignore_depth:
            return

        if tag == "title":
            self._title_open = True
            self._title_parts = []
            return

        if tag in BLOCK_TAGS:
            self._finish_block()
            self._block_tag = tag
            self._block_parts = []
            self._block_links = []
            return

        if tag == "br" and self._block_tag:
            self._block_parts.append("\n")
            return

        if tag == "a" and attrs.get("href"):
            href = urljoin(self.page_url, attrs["href"])
            self._link_href = href
            self._link_parts = []
            if is_media_url(href):
                self._add_media("link", href, attrs.get("title", ""))
            return

        if tag == "iframe" and attrs.get("src"):
            self._add_media("embed", urljoin(self.page_url, attrs["src"]), attrs.get("title", ""))
            return

        if tag in {"video", "audio", "source", "track"} and attrs.get("src"):
            media_type = "transcript" if tag == "track" else tag
            self._add_media(media_type, urljoin(self.page_url, attrs["src"]), attrs.get("label", "") or attrs.get("kind", ""))
            return

        if tag == "img" and attrs.get("src"):
            alt = clean_space(attrs.get("alt", ""))
            src = urljoin(self.page_url, attrs["src"])
            if alt and self._block_tag:
                self._block_parts.append(f" [Image: {alt}] ")
            self._add_link(alt or "Image", src)

    def handle_data(self, data: str) -> None:
        if self._ignore_depth:
            return
        if self._title_open:
            self._title_parts.append(data)
        if self._link_href is not None:
            self._link_parts.append(data)
        if self._block_tag:
            self._block_parts.append(data)

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag in IGNORE_TAGS and self._ignore_depth:
            self._ignore_depth -= 1
            return
        if self._ignore_depth:
            return

        if tag == "title":
            self.result.title = clean_space("".join(self._title_parts))
            self._title_open = False
            return

        if tag == "a" and self._link_href is not None:
            label = clean_space("".join(self._link_parts)) or self._link_href
            self._add_link(label, self._link_href)
            if self._block_tag:
                self._block_links.append({"label": label, "url": self._link_href})
            self._link_href = None
            self._link_parts = []
            return

        if tag == self._block_tag:
            self._finish_block()

    def close(self) -> None:
        self._finish_block()
        super().close()

    def _add_link(self, label: str, href: str) -> None:
        key = href
        if key in self._seen_links:
            return
        self._seen_links.add(key)
        self.result.links.append({"label": clean_space(label), "url": href})

    def _add_media(self, media_type: str, url: str, label: str = "") -> None:
        if url in self._seen_media:
            return
        self._seen_media.add(url)
        item = MediaItem(
            id=stable_id(self.page_url, media_type, url),
            type=media_type,
            url=url,
            label=clean_space(label),
            transcript_url=url if url.lower().split("?", 1)[0].endswith((".vtt", ".srt")) else "",
        )
        self.result.media.append(item)

    def _finish_block(self) -> None:
        if not self._block_tag:
            return
        raw_text = "".join(self._block_parts)
        text = raw_text if self._block_tag == "pre" else clean_space(raw_text)
        text = text.strip()
        if len(text) >= 2 and not self._looks_like_chrome(text):
            block_type = "heading" if re.fullmatch(r"h[1-6]", self._block_tag) else self._block_tag
            level = int(self._block_tag[1]) if block_type == "heading" else None
            if self._block_links:
                compact_links = []
                seen = set()
                for link in self._block_links:
                    if link["url"] not in seen:
                        compact_links.append(link)
                        seen.add(link["url"])
                link_text = " ".join(f"[{item['label']}: {item['url']}]" for item in compact_links[:4])
                if link_text and link_text not in text:
                    text = f"{text}\n{link_text}"
            self.result.blocks.append(
                Block(
                    id=stable_id(self.page_url, str(self._block_index), self._block_tag, text[:120]),
                    type=block_type,
                    text=text,
                    heading_level=level,
                )
            )
            self._block_index += 1
        self._block_tag = None
        self._block_parts = []
        self._block_links = []

    @staticmethod
    def _looks_like_chrome(text: str) -> bool:
        if len(text) > 180:
            return False
        lower = text.lower()
        chrome_phrases = {
            "skip to content",
            "previous",
            "next",
            "home",
            "table of contents",
            "copyright",
        }
        return lower in chrome_phrases


def parse_page(html: str, page_url: str) -> ExtractedPage:
    parser = CoursePageParser(page_url)
    parser.feed(html)
    parser.close()
    return parser.result


def parse_vtt(text: str) -> list[dict[str, str]]:
    cues: list[dict[str, str]] = []
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    idx = 0
    while idx < len(lines):
        line = lines[idx].strip()
        if not line or line.upper().startswith("WEBVTT") or line.startswith("NOTE"):
            idx += 1
            continue
        if "-->" not in line and idx + 1 < len(lines) and "-->" in lines[idx + 1]:
            idx += 1
            line = lines[idx].strip()
        if "-->" in line:
            start, end = [part.strip().split(" ", 1)[0] for part in line.split("-->", 1)]
            idx += 1
            body: list[str] = []
            while idx < len(lines) and lines[idx].strip():
                body.append(re.sub(r"<[^>]+>", "", lines[idx]).strip())
                idx += 1
            cue_text = clean_space(" ".join(body))
            if cue_text:
                cues.append({"start": start, "end": end, "text": cue_text})
        idx += 1
    return cues


def parse_srt(text: str) -> list[dict[str, str]]:
    normalized = text.replace("\r\n", "\n").replace("\r", "\n")
    chunks = re.split(r"\n\s*\n", normalized)
    cues: list[dict[str, str]] = []
    for chunk in chunks:
        lines = [line.strip() for line in chunk.split("\n") if line.strip()]
        if not lines:
            continue
        timing_index = 1 if lines[0].isdigit() and len(lines) > 1 else 0
        if timing_index >= len(lines) or "-->" not in lines[timing_index]:
            continue
        start, end = [part.strip().split(" ", 1)[0].replace(",", ".") for part in lines[timing_index].split("-->", 1)]
        cue_text = clean_space(" ".join(lines[timing_index + 1 :]))
        if cue_text:
            cues.append({"start": start, "end": end, "text": cue_text})
    return cues


def looks_like_transcript(url: str, content_type: str) -> bool:
    path = urlparse(url.lower()).path
    return path.endswith((".vtt", ".srt")) or "text/vtt" in content_type or "subrip" in content_type


def infer_lesson(row: dict[str, str]) -> str:
    if row.get("lesson"):
        return row["lesson"]
    path = urlparse(row.get("url", "")).path
    match = re.search(r"/week(\d{1,2})(?:/|$)", path, flags=re.IGNORECASE)
    if match:
        return f"Week {int(match.group(1)):02d}"
    if row.get("depth") == "0":
        return "Course Home"
    return row.get("link_text") or row.get("html_title") or "Course Home"


def infer_page_type(row: dict[str, str]) -> str:
    if row.get("page_type"):
        return row["page_type"]
    url = row.get("url", "")
    path = urlparse(url).path.rstrip("/")
    link_text = row.get("link_text", "").lower()
    if row.get("depth") == "0" or link_text == "course home":
        return "course_home"
    if re.search(r"/week\d{1,2}(?:/index\.html)?$", path, flags=re.IGNORECASE):
        return "week_home"
    return "lesson_subpage"


def normalize_course_row(row: dict[str, str]) -> dict[str, str]:
    normalized = dict(row)
    normalized["lesson"] = infer_lesson(normalized)
    normalized["page_type"] = infer_page_type(normalized)
    normalized.setdefault("audit_note", "")
    normalized.setdefault("source_page", "")
    normalized.setdefault("html_title", "")
    normalized.setdefault("link_text", "")
    return normalized


def read_course_rows(path: Path, selected_courses: set[str] | None, limit: int | None) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = [normalize_course_row(row) for row in reader if row.get("status", "ok") == "ok"]
    if selected_courses:
        normalized = {code.replace("-", " ").upper() for code in selected_courses}
        rows = [row for row in rows if row.get("course_code", "").upper() in normalized]
    if limit:
        rows = rows[:limit]
    return rows


def init_db(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.executescript(
        """
        PRAGMA journal_mode = WAL;
        DROP TABLE IF EXISTS courses;
        DROP TABLE IF EXISTS pages;
        DROP TABLE IF EXISTS blocks;
        DROP TABLE IF EXISTS blocks_fts;
        DROP TABLE IF EXISTS media;
        DROP TABLE IF EXISTS transcript_cues;
        DROP TABLE IF EXISTS import_runs;

        CREATE TABLE courses (
            id TEXT PRIMARY KEY,
            certificate TEXT NOT NULL,
            code TEXT NOT NULL,
            title TEXT NOT NULL
        );

        CREATE TABLE pages (
            id TEXT PRIMARY KEY,
            course_id TEXT NOT NULL,
            lesson TEXT NOT NULL,
            page_type TEXT NOT NULL,
            link_text TEXT NOT NULL,
            url TEXT NOT NULL,
            source_page TEXT NOT NULL,
            html_title TEXT NOT NULL,
            status TEXT NOT NULL,
            audit_note TEXT NOT NULL,
            raw_html TEXT NOT NULL,
            extracted_title TEXT NOT NULL,
            FOREIGN KEY (course_id) REFERENCES courses(id)
        );

        CREATE TABLE blocks (
            id TEXT PRIMARY KEY,
            page_id TEXT NOT NULL,
            position INTEGER NOT NULL,
            type TEXT NOT NULL,
            heading_level INTEGER,
            source_text TEXT NOT NULL,
            FOREIGN KEY (page_id) REFERENCES pages(id)
        );

        CREATE VIRTUAL TABLE blocks_fts USING fts5(
            block_id UNINDEXED,
            course_code,
            lesson,
            page_title,
            source_text
        );

        CREATE TABLE media (
            id TEXT PRIMARY KEY,
            page_id TEXT NOT NULL,
            type TEXT NOT NULL,
            label TEXT NOT NULL,
            url TEXT NOT NULL,
            transcript_url TEXT NOT NULL,
            FOREIGN KEY (page_id) REFERENCES pages(id)
        );

        CREATE TABLE transcript_cues (
            id TEXT PRIMARY KEY,
            media_id TEXT NOT NULL,
            position INTEGER NOT NULL,
            start TEXT NOT NULL,
            end TEXT NOT NULL,
            text TEXT NOT NULL,
            FOREIGN KEY (media_id) REFERENCES media(id)
        );

        CREATE TABLE import_runs (
            id TEXT PRIMARY KEY,
            generated_at TEXT NOT NULL,
            source_csv TEXT NOT NULL,
            page_count INTEGER NOT NULL,
            block_count INTEGER NOT NULL,
            media_count INTEGER NOT NULL,
            cue_count INTEGER NOT NULL
        );
        """
    )
    return conn


def insert_course(conn: sqlite3.Connection, row: dict[str, str]) -> str:
    course_id = stable_id(row["certificate"], row["course_code"], row["course_title"])
    conn.execute(
        "INSERT OR IGNORE INTO courses (id, certificate, code, title) VALUES (?, ?, ?, ?)",
        (course_id, row["certificate"], row["course_code"], row["course_title"]),
    )
    return course_id


def fallback_page(row: dict[str, str]) -> ExtractedPage:
    title = row.get("html_title") or row.get("link_text") or row.get("lesson") or row["url"]
    text = (
        f"{row.get('lesson') or row.get('link_text') or 'Course page'}\n"
        f"Source: {row['url']}\n"
        "Run the importer without --offline to fetch and extract this page."
    )
    return ExtractedPage(
        title=title,
        blocks=[
            Block(
                id=stable_id(row["url"], "offline"),
                type="paragraph",
                text=text,
                heading_level=None,
            )
        ],
        links=[{"label": row.get("link_text") or "Source", "url": row["url"]}],
    )


def import_rows(args: argparse.Namespace) -> dict[str, Any]:
    rows = read_course_rows(args.source_csv, set(args.course or []) or None, args.limit)
    conn = init_db(args.db)
    generated_at = now_iso()
    stats = {
        "pages": 0,
        "blocks": 0,
        "media": 0,
        "transcript_cues": 0,
        "fetch_errors": 0,
        "transcript_fetch_errors": 0,
    }
    app_courses: dict[str, dict[str, Any]] = {}

    for index, row in enumerate(rows, start=1):
        course_id = insert_course(conn, row)
        course_key = row["course_code"]
        if course_key not in app_courses:
            app_courses[course_key] = {
                "id": course_id,
                "certificate": row["certificate"],
                "code": row["course_code"],
                "title": row["course_title"],
                "pages": [],
            }

        html = ""
        content_type = ""
        status = "offline" if args.offline else "ok"
        if args.offline:
            extracted = fallback_page(row)
        else:
            try:
                html, content_type = fetch_text(row["url"], timeout=args.timeout)
                extracted = parse_page(html, row["url"])
                if not extracted.blocks:
                    extracted = fallback_page(row)
                    status = "empty_extraction"
            except Exception as exc:  # noqa: BLE001 - user-facing import report
                stats["fetch_errors"] += 1
                status = f"fetch_error: {exc}"
                extracted = fallback_page(row)

        page_id = stable_id(row["course_code"], row["url"])
        conn.execute(
            """
            INSERT INTO pages (
                id, course_id, lesson, page_type, link_text, url, source_page,
                html_title, status, audit_note, raw_html, extracted_title
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                page_id,
                course_id,
                row.get("lesson", ""),
                row.get("page_type", ""),
                row.get("link_text", ""),
                row["url"],
                row.get("source_page", ""),
                row.get("html_title", ""),
                status,
                row.get("audit_note", ""),
                html,
                extracted.title,
            ),
        )

        page_payload = {
            "id": page_id,
            "lesson": row.get("lesson", ""),
            "page_type": row.get("page_type", ""),
            "link_text": row.get("link_text", ""),
            "url": row["url"],
            "source_page": row.get("source_page", ""),
            "html_title": row.get("html_title", ""),
            "extracted_title": extracted.title,
            "status": status,
            "audit_note": row.get("audit_note", ""),
            "blocks": [],
            "links": extracted.links[:80],
            "media": [],
        }

        for position, block in enumerate(extracted.blocks):
            conn.execute(
                """
                INSERT INTO blocks (id, page_id, position, type, heading_level, source_text)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (block.id, page_id, position, block.type, block.heading_level, block.text),
            )
            conn.execute(
                """
                INSERT INTO blocks_fts (block_id, course_code, lesson, page_title, source_text)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    block.id,
                    row["course_code"],
                    row.get("lesson", ""),
                    extracted.title or row.get("html_title", "") or row.get("link_text", ""),
                    block.text,
                ),
            )
            page_payload["blocks"].append(
                {
                    "id": block.id,
                    "position": position,
                    "type": block.type,
                    "heading_level": block.heading_level,
                    "source_text": block.text,
                }
            )
            stats["blocks"] += 1

        for media_position, media in enumerate(extracted.media):
            transcript_cues: list[dict[str, str]] = []
            if media.transcript_url and not args.offline:
                try:
                    transcript_text, transcript_type = fetch_text(media.transcript_url, timeout=args.timeout)
                    if looks_like_transcript(media.transcript_url, transcript_type):
                        transcript_cues = (
                            parse_srt(transcript_text)
                            if urlparse(media.transcript_url.lower()).path.endswith(".srt")
                            else parse_vtt(transcript_text)
                        )
                except Exception:
                    stats["transcript_fetch_errors"] += 1

            conn.execute(
                """
                INSERT INTO media (id, page_id, type, label, url, transcript_url)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (media.id, page_id, media.type, media.label, media.url, media.transcript_url),
            )
            media_payload = {
                "id": media.id,
                "position": media_position,
                "type": media.type,
                "label": media.label,
                "url": media.url,
                "transcript_url": media.transcript_url,
                "transcript_cues": [],
            }
            for cue_position, cue in enumerate(transcript_cues):
                cue_id = stable_id(media.id, str(cue_position), cue["start"], cue["text"][:80])
                conn.execute(
                    """
                    INSERT INTO transcript_cues (id, media_id, position, start, end, text)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (cue_id, media.id, cue_position, cue["start"], cue["end"], cue["text"]),
                )
                media_payload["transcript_cues"].append({"id": cue_id, "position": cue_position, **cue})
                stats["transcript_cues"] += 1
            page_payload["media"].append(media_payload)
            stats["media"] += 1

        app_courses[course_key]["pages"].append(page_payload)
        stats["pages"] += 1
        if not args.quiet and (index == 1 or index % 25 == 0 or index == len(rows)):
            print(f"[{index}/{len(rows)}] {row['course_code']} {row.get('lesson', '')} {row.get('link_text', '')}: {status}")
        if not args.offline and args.sleep:
            time.sleep(args.sleep)

    payload = {
        "schema_version": 1,
        "generated_at": generated_at,
        "source_csv": str(args.source_csv.relative_to(ROOT) if args.source_csv.is_relative_to(ROOT) else args.source_csv),
        "stats": stats,
        "courses": list(app_courses.values()),
    }

    run_id = stable_id(generated_at, str(stats))
    conn.execute(
        """
        INSERT INTO import_runs (id, generated_at, source_csv, page_count, block_count, media_count, cue_count)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            run_id,
            generated_at,
            str(args.source_csv),
            stats["pages"],
            stats["blocks"],
            stats["media"],
            stats["transcript_cues"],
        ),
    )
    conn.commit()
    conn.close()

    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    args.output_json.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    return payload


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Import Pathway course pages into SQLite and app JSON.")
    parser.add_argument("--source-csv", type=Path, default=DEFAULT_CSV)
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    parser.add_argument("--output-json", type=Path, default=DEFAULT_JSON)
    parser.add_argument("--course", action="append", help="Course code to import, e.g. CSE-110 or CSE 110. Repeatable.")
    parser.add_argument("--limit", type=int, help="Import only the first N audited pages.")
    parser.add_argument("--offline", action="store_true", help="Do not fetch pages; generate source-link placeholder blocks.")
    parser.add_argument("--timeout", type=int, default=25)
    parser.add_argument("--sleep", type=float, default=0.04)
    parser.add_argument("--quiet", action="store_true")
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    args.source_csv = args.source_csv.resolve()
    args.db = args.db.resolve()
    args.output_json = args.output_json.resolve()
    if not args.source_csv.exists():
        parser.error(f"source CSV not found: {args.source_csv}")

    payload = import_rows(args)
    stats = payload["stats"]
    print(
        "Imported "
        f"{stats['pages']} pages, {stats['blocks']} blocks, "
        f"{stats['media']} media links, {stats['transcript_cues']} transcript cues."
    )
    if stats["fetch_errors"]:
        print(f"Fetch errors: {stats['fetch_errors']}", file=sys.stderr)
    if stats["transcript_fetch_errors"]:
        print(f"Transcript fetch errors: {stats['transcript_fetch_errors']}", file=sys.stderr)
    print(f"SQLite: {args.db}")
    print(f"App JSON: {args.output_json}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
