#!/usr/bin/env python3
"""Serve the study workbench with local SQLite-backed user-state APIs."""
from __future__ import annotations

import argparse
import json
import sqlite3
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, unquote, urlparse


ROOT = Path(__file__).resolve().parents[1]
WEB_ROOT = ROOT / "web"
SOURCE_DB = ROOT / "data" / "pathways_workbench.sqlite"
USER_DB = ROOT / "data" / "pathways_user.sqlite"


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def init_user_db(path: Path = USER_DB) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.execute("PRAGMA journal_mode = WAL")
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS user_blocks (
            block_id TEXT PRIMARY KEY,
            draft TEXT,
            tags_json TEXT NOT NULL DEFAULT '[]',
            annotations TEXT,
            hidden INTEGER NOT NULL DEFAULT 0,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS user_transcripts (
            block_id TEXT PRIMARY KEY,
            cues_json TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS user_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type TEXT NOT NULL,
            event_json TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        """
    )
    return conn


def read_user_state(path: Path = USER_DB) -> dict[str, Any]:
    conn = init_user_db(path)
    conn.row_factory = sqlite3.Row
    blocks: dict[str, dict[str, Any]] = {}
    for row in conn.execute("SELECT * FROM user_blocks ORDER BY updated_at DESC"):
        item: dict[str, Any] = {}
        if row["draft"] is not None:
            item["draft"] = row["draft"]
        tags = json.loads(row["tags_json"] or "[]")
        if tags:
            item["tags"] = tags
        if row["annotations"]:
            item["annotations"] = row["annotations"]
        if row["hidden"]:
            item["hidden"] = True
        item["updatedAt"] = row["updated_at"]
        blocks[row["block_id"]] = item
    transcripts: dict[str, list[dict[str, Any]]] = {}
    for row in conn.execute("SELECT * FROM user_transcripts ORDER BY updated_at DESC"):
        transcripts[row["block_id"]] = json.loads(row["cues_json"] or "[]")
    conn.close()
    return {"schemaVersion": 1, "blocks": blocks, "transcripts": transcripts, "loadedAt": now_iso(), "storage": "sqlite"}


def write_user_state(payload: dict[str, Any], path: Path = USER_DB) -> dict[str, Any]:
    user = payload.get("user") if "user" in payload else payload
    blocks = user.get("blocks", {}) if isinstance(user, dict) else {}
    transcripts = user.get("transcripts", {}) if isinstance(user, dict) else {}
    conn = init_user_db(path)
    timestamp = now_iso()
    with conn:
        conn.execute("DELETE FROM user_blocks")
        conn.execute("DELETE FROM user_transcripts")
        for block_id, block in blocks.items():
            if not isinstance(block, dict):
                continue
            tags = block.get("tags") or []
            conn.execute(
                """
                INSERT INTO user_blocks (block_id, draft, tags_json, annotations, hidden, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    block_id,
                    block["draft"] if "draft" in block else None,
                    json.dumps(tags, ensure_ascii=False),
                    block.get("annotations") or None,
                    1 if block.get("hidden") else 0,
                    block.get("updatedAt") or timestamp,
                ),
            )
        for block_id, cues in transcripts.items():
            conn.execute(
                """
                INSERT INTO user_transcripts (block_id, cues_json, updated_at)
                VALUES (?, ?, ?)
                """,
                (block_id, json.dumps(cues, ensure_ascii=False), timestamp),
            )
        conn.execute(
            "INSERT INTO user_events (event_type, event_json, created_at) VALUES (?, ?, ?)",
            ("state_sync", json.dumps({"block_count": len(blocks), "transcript_count": len(transcripts)}), timestamp),
        )
    conn.close()
    return {"ok": True, "savedAt": timestamp, "blockCount": len(blocks), "transcriptCount": len(transcripts)}


def write_user_block(block_id: str, block: dict[str, Any], path: Path = USER_DB) -> dict[str, Any]:
    conn = init_user_db(path)
    timestamp = block.get("updatedAt") or now_iso()
    tags = block.get("tags") or []
    has_content = any(
        (
            "draft" in block,
            bool(tags),
            bool(block.get("annotations")),
            bool(block.get("hidden")),
        )
    )
    with conn:
        if not has_content:
            conn.execute("DELETE FROM user_blocks WHERE block_id = ?", (block_id,))
            action = "delete"
        else:
            conn.execute(
                """
                INSERT INTO user_blocks (block_id, draft, tags_json, annotations, hidden, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(block_id) DO UPDATE SET
                    draft = excluded.draft,
                    tags_json = excluded.tags_json,
                    annotations = excluded.annotations,
                    hidden = excluded.hidden,
                    updated_at = excluded.updated_at
                """,
                (
                    block_id,
                    block["draft"] if "draft" in block else None,
                    json.dumps(tags, ensure_ascii=False),
                    block.get("annotations") or None,
                    1 if block.get("hidden") else 0,
                    timestamp,
                ),
            )
            action = "upsert"
        conn.execute(
            "INSERT INTO user_events (event_type, event_json, created_at) VALUES (?, ?, ?)",
            ("block_sync", json.dumps({"block_id": block_id, "action": action}), now_iso()),
        )
    conn.close()
    return {"ok": True, "savedAt": timestamp, "blockId": block_id, "action": action}


def delete_user_block(block_id: str, path: Path = USER_DB) -> dict[str, Any]:
    conn = init_user_db(path)
    timestamp = now_iso()
    with conn:
        conn.execute("DELETE FROM user_blocks WHERE block_id = ?", (block_id,))
        conn.execute(
            "INSERT INTO user_events (event_type, event_json, created_at) VALUES (?, ?, ?)",
            ("block_sync", json.dumps({"block_id": block_id, "action": "delete"}), timestamp),
        )
    conn.close()
    return {"ok": True, "savedAt": timestamp, "blockId": block_id, "action": "delete"}


def write_user_transcript(block_id: str, cues: list[dict[str, Any]], path: Path = USER_DB) -> dict[str, Any]:
    conn = init_user_db(path)
    timestamp = now_iso()
    with conn:
        if cues:
            conn.execute(
                """
                INSERT INTO user_transcripts (block_id, cues_json, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(block_id) DO UPDATE SET
                    cues_json = excluded.cues_json,
                    updated_at = excluded.updated_at
                """,
                (block_id, json.dumps(cues, ensure_ascii=False), timestamp),
            )
            action = "upsert"
        else:
            conn.execute("DELETE FROM user_transcripts WHERE block_id = ?", (block_id,))
            action = "delete"
        conn.execute(
            "INSERT INTO user_events (event_type, event_json, created_at) VALUES (?, ?, ?)",
            ("transcript_sync", json.dumps({"block_id": block_id, "action": action, "cue_count": len(cues)}), timestamp),
        )
    conn.close()
    return {"ok": True, "savedAt": timestamp, "blockId": block_id, "action": action, "cueCount": len(cues)}


def delete_user_transcript(block_id: str, path: Path = USER_DB) -> dict[str, Any]:
    return write_user_transcript(block_id, [], path)


def search_source(query: str, course: str | None, limit: int, db_path: Path = SOURCE_DB) -> list[dict[str, Any]]:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    where = "blocks_fts MATCH ?"
    params: list[Any] = [query]
    if course:
        where += " AND blocks_fts.course_code = ?"
        params.append(course)
    params.append(limit)
    rows = conn.execute(
        f"""
        SELECT
            blocks_fts.block_id,
            blocks_fts.course_code,
            blocks_fts.lesson,
            blocks_fts.page_title,
            snippet(blocks_fts, 4, '<mark>', '</mark>', '...', 18) AS snippet,
            pages.url
        FROM blocks_fts
        JOIN blocks ON blocks.id = blocks_fts.block_id
        JOIN pages ON pages.id = blocks.page_id
        WHERE {where}
        LIMIT ?
        """,
        params,
    ).fetchall()
    conn.close()
    return [dict(row) for row in rows]


class WorkbenchHandler(SimpleHTTPRequestHandler):
    server_version = "PathwaysWorkbench/0.1"

    def __init__(self, *args: Any, directory: str | None = None, **kwargs: Any) -> None:
        super().__init__(*args, directory=directory or str(WEB_ROOT), **kwargs)

    def log_message(self, format: str, *args: Any) -> None:
        print(f"{self.address_string()} - {format % args}")

    def do_GET(self) -> None:  # noqa: N802 - http.server API
        parsed = urlparse(self.path)
        if parsed.path == "/api/health":
            self.write_json({"ok": True, "time": now_iso(), "sourceDb": SOURCE_DB.exists(), "userDb": USER_DB.exists()})
            return
        if parsed.path == "/api/state":
            self.write_json(read_user_state(USER_DB))
            return
        if parsed.path == "/api/search":
            params = parse_qs(parsed.query)
            query = (params.get("q") or [""])[0].strip()
            course = (params.get("course") or [""])[0].strip() or None
            limit = min(50, max(1, int((params.get("limit") or ["12"])[0] or 12)))
            if not query:
                self.write_json({"results": []})
                return
            try:
                self.write_json({"results": search_source(query, course, limit)})
            except sqlite3.OperationalError as exc:
                self.write_json({"error": str(exc), "results": []}, HTTPStatus.BAD_REQUEST)
            return
        super().do_GET()

    def do_POST(self) -> None:  # noqa: N802 - http.server API
        parsed = urlparse(self.path)
        if parsed.path == "/api/state":
            try:
                payload = self.read_json_body()
                result = write_user_state(payload, USER_DB)
                self.write_json(result)
            except Exception as exc:  # noqa: BLE001 - API should report JSON errors
                self.write_json({"ok": False, "error": str(exc)}, HTTPStatus.BAD_REQUEST)
            return
        if parsed.path.startswith("/api/blocks/"):
            block_id = unquote(parsed.path.removeprefix("/api/blocks/"))
            try:
                payload = self.read_json_body()
                result = write_user_block(block_id, payload.get("block", payload), USER_DB)
                self.write_json(result)
            except Exception as exc:  # noqa: BLE001 - API should report JSON errors
                self.write_json({"ok": False, "error": str(exc)}, HTTPStatus.BAD_REQUEST)
            return
        if parsed.path.startswith("/api/transcripts/"):
            block_id = unquote(parsed.path.removeprefix("/api/transcripts/"))
            try:
                payload = self.read_json_body()
                cues = payload.get("cues", []) if isinstance(payload, dict) else payload if isinstance(payload, list) else []
                result = write_user_transcript(block_id, cues, USER_DB)
                self.write_json(result)
            except Exception as exc:  # noqa: BLE001 - API should report JSON errors
                self.write_json({"ok": False, "error": str(exc)}, HTTPStatus.BAD_REQUEST)
            return
        self.send_error(HTTPStatus.NOT_FOUND)

    def do_PUT(self) -> None:  # noqa: N802 - http.server API
        self.do_POST()

    def do_DELETE(self) -> None:  # noqa: N802 - http.server API
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/blocks/"):
            block_id = unquote(parsed.path.removeprefix("/api/blocks/"))
            self.write_json(delete_user_block(block_id, USER_DB))
            return
        if parsed.path.startswith("/api/transcripts/"):
            block_id = unquote(parsed.path.removeprefix("/api/transcripts/"))
            self.write_json(delete_user_transcript(block_id, USER_DB))
            return
        self.send_error(HTTPStatus.NOT_FOUND)

    def read_json_body(self) -> Any:
        length = int(self.headers.get("content-length") or 0)
        raw = self.rfile.read(length)
        if not raw:
            return {}
        return json.loads(raw.decode("utf-8"))

    def write_json(self, payload: dict[str, Any], status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Serve the Pathways study workbench with local APIs.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8788)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    init_user_db(USER_DB).close()
    server = ThreadingHTTPServer((args.host, args.port), WorkbenchHandler)
    print(f"Serving Pathways Study Workbench at http://{args.host}:{args.port}/")
    print(f"Source DB: {SOURCE_DB}")
    print(f"User DB: {USER_DB}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
