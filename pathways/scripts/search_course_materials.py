#!/usr/bin/env python3
"""Search imported course source blocks from the SQLite FTS index."""
from __future__ import annotations

import argparse
import sqlite3
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB = ROOT / "data" / "pathways_workbench.sqlite"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Search the imported Pathways course database.")
    parser.add_argument("query", help="FTS5 query, e.g. functions, \"data structures\", or variable NEAR expression")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    parser.add_argument("--course", help="Course code filter, e.g. CSE 110")
    parser.add_argument("--limit", type=int, default=12)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    conn = sqlite3.connect(args.db)
    conn.row_factory = sqlite3.Row
    where = "blocks_fts MATCH ?"
    params: list[object] = [args.query]
    if args.course:
        where += " AND course_code = ?"
        params.append(args.course)
    params.append(args.limit)
    rows = conn.execute(
        f"""
        SELECT
            blocks_fts.course_code,
            blocks_fts.lesson,
            blocks_fts.page_title,
            blocks_fts.source_text,
            pages.url
        FROM blocks_fts
        JOIN blocks ON blocks.id = blocks_fts.block_id
        JOIN pages ON pages.id = blocks.page_id
        WHERE {where}
        LIMIT ?
        """,
        params,
    ).fetchall()
    for row in rows:
        text = " ".join(row["source_text"].split())
        if len(text) > 280:
            text = text[:277] + "..."
        print(f"{row['course_code']} | {row['lesson']} | {row['page_title']}")
        print(text)
        print(row["url"])
        print()
    print(f"{len(rows)} result(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
