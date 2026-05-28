#!/usr/bin/env python3
"""
Create a full BYU-I / BYU-Pathway GitHub Pages course-site map.

Usage:
  python byu_pathway_site_map_crawler.py

Output:
  byu_pathway_full_course_map.csv

What it does:
  - Starts from the course homes below.
  - Crawls only pages within each course root.
  - Skips Canvas and other external links.
  - Records course, source page, link title, URL, and depth.
"""
from __future__ import annotations

import csv
import time
from collections import deque
from dataclasses import dataclass
from html.parser import HTMLParser
from urllib.parse import urljoin, urldefrag, urlparse
from urllib.request import Request, urlopen

COURSES = [
    ("Web & Computer Programming", "CSE 110", "Introduction to Programming", "https://byui-cse.github.io/cse110-ww-course/"),
    ("Web & Computer Programming", "CSE 111", "Programming with Functions", "https://byui-cse.github.io/cse111-ww-course/"),
    ("Web & Computer Programming", "CSE 210", "Programming with Classes", "https://byui-cse.github.io/cse210-ww-course/"),
    ("Web & Computer Programming", "WDD 130", "Web Fundamentals", "https://byui-cse.github.io/wdd130-ww-course/"),
    ("Web & Computer Programming", "WDD 131", "Dynamic Web Fundamentals", "https://byui-cse.github.io/wdd131-ww-course/"),
    ("Web & Computer Programming", "WDD 231", "Web Frontend Development I", "https://byui-cse.github.io/wdd231-ww-course/"),
    ("Web Development", "ITM 111", "Introduction to Databases", "https://byui-cse.github.io/itm111-ww-course/"),
    ("Web Development", "CSE 340", "Web Backend Development", "https://byui-cse.github.io/cse340-ww-course/"),
    ("Web Development", "CSE 341", "Web Services", "https://byui-cse.github.io/cse341-ww-course/"),
    ("Web Development", "WDD 330", "Web Frontend Development II", "https://byui-cse.github.io/wdd330-ww-course/"),
    ("Web Development", "WDD 430", "Web Full-Stack Development", "https://byui-cse.github.io/wdd430-ww-course/"),
    ("Software Development", "CSE 212", "Programming with Data Structures", "https://byui-cse.github.io/cse212-ww-course/"),
    ("Software Development", "CSE 270", "Software Testing", "https://byui-cse.github.io/cse270-ww-course/"),
    ("Software Development", "CSE 300", "Professional Readiness", "https://byui-cse.github.io/cse300-ww-course/"),
    ("Software Development", "CSE 310", "Applied Programming", "https://byui-cse.github.io/cse310-ww-course/"),
    ("Software Development", "CSE 325", ".NET Software Development", "https://byui-cse.github.io/cse325-ww-course/"),
    ("Software Development", "CSE 370", "Software Engineering Principles", "https://byui-cse.github.io/cse370-ww-course/"),
]

SKIP_HOSTS = {"byui.instructure.com", "canvas.instructure.com"}

@dataclass
class Link:
    text: str
    href: str

class LinkParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links: list[Link] = []
        self._href: str | None = None
        self._text: list[str] = []
        self.title = ""
        self._in_title = False
        self._title_text: list[str] = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag.lower() == "a" and "href" in attrs:
            self._href = attrs["href"]
            self._text = []
        elif tag.lower() == "title":
            self._in_title = True
            self._title_text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)
        if self._in_title:
            self._title_text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            text = " ".join("".join(self._text).split())
            self.links.append(Link(text=text or "(no text)", href=self._href))
            self._href = None
            self._text = []
        elif tag.lower() == "title":
            self.title = " ".join("".join(self._title_text).split())
            self._in_title = False


def fetch(url: str) -> tuple[str, str]:
    req = Request(url, headers={"User-Agent": "course-map-crawler/1.0"})
    with urlopen(req, timeout=20) as resp:
        content_type = resp.headers.get("content-type", "")
        if "text/html" not in content_type:
            return "", content_type
        return resp.read().decode("utf-8", errors="replace"), content_type


def clean_url(url: str) -> str:
    url, _frag = urldefrag(url)
    return url


def in_course(url: str, root: str) -> bool:
    parsed = urlparse(url)
    if parsed.netloc in SKIP_HOSTS:
        return False
    return url.startswith(root)


def crawl_course(certificate: str, code: str, title: str, root: str, max_pages: int = 500):
    seen: set[str] = set()
    queue = deque([(root, 0, "Course Home", root)])
    rows = []

    while queue and len(seen) < max_pages:
        url, depth, link_text, source_url = queue.popleft()
        url = clean_url(url)
        if url in seen:
            continue
        seen.add(url)
        try:
            html, content_type = fetch(url)
            status = "ok"
        except Exception as exc:
            rows.append([certificate, code, title, depth, link_text, url, source_url, "", f"fetch_error: {exc}"])
            continue

        parser = LinkParser()
        if html:
            parser.feed(html)
        rows.append([certificate, code, title, depth, link_text, url, source_url, parser.title, status])

        for link in parser.links:
            abs_url = clean_url(urljoin(url, link.href))
            if not in_course(abs_url, root):
                continue
            if abs_url not in seen:
                queue.append((abs_url, depth + 1, link.text, url))
        time.sleep(0.08)
    return rows


def main():
    out = "byu_pathway_full_course_map.csv"
    with open(out, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["certificate", "course_code", "course_title", "depth", "link_text", "url", "source_page", "html_title", "status"])
        for course in COURSES:
            print(f"Crawling {course[1]}...")
            writer.writerows(crawl_course(*course))
    print(f"Wrote {out}")

if __name__ == "__main__":
    main()
