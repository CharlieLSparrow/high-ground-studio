#!/usr/bin/env python3
"""Create a Quipsly upload integrity certificate and SHA-256 manifest.

This hashes selected upload-packet artifacts, optionally probes media files, and
writes Markdown + JSON evidence into the ready folder. It is for local artifact
identity only: it does not upload, publish, schedule, mutate external accounts,
or touch original source media.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

MEDIA_SUFFIXES = {".mp4", ".m4a", ".mp3", ".mov", ".m4v", ".wav", ".aac"}


@dataclass
class IntegrityEntry:
    relativePath: str
    bytes: int
    sha256: str
    ffprobe: dict[str, Any] = field(default_factory=dict)


@dataclass
class IntegrityCertificate:
    schema: str = "quipsly.upload-integrity-certificate.v1"
    status: str = "not-run"
    createdAt: str = ""
    episodeId: str = ""
    title: str = ""
    readyDir: str = ""
    producerRecommendation: str = ""
    qcReadback: dict[str, Any] = field(default_factory=dict)
    uploadSet: dict[str, str] = field(default_factory=dict)
    missing: list[str] = field(default_factory=list)
    entries: list[IntegrityEntry] = field(default_factory=list)
    truth: dict[str, Any] = field(default_factory=dict)


def resolve(ready_dir: Path, value: str) -> Path:
    path = Path(value)
    return path if path.is_absolute() else ready_dir / path


def rel_path(ready_dir: Path, path: Path) -> str:
    try:
        return str(path.relative_to(ready_dir))
    except ValueError:
        return str(path)


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024 * 8), b""):
            h.update(chunk)
    return h.hexdigest()


def ffprobe_summary(path: Path) -> dict[str, Any]:
    if path.suffix.lower() not in MEDIA_SUFFIXES:
        return {}
    ffprobe = shutil.which("ffprobe") or "/opt/homebrew/bin/ffprobe"
    if not Path(ffprobe).exists() and shutil.which("ffprobe") is None:
        return {"warning": "ffprobe not found"}
    result = subprocess.run(
        [ffprobe, "-v", "error", "-show_format", "-show_streams", "-of", "json", str(path)],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if result.returncode != 0:
        return {"error": result.stderr.strip() or "ffprobe failed"}
    try:
        data = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        return {"error": f"ffprobe JSON parse failed: {exc}"}
    streams: list[dict[str, Any]] = []
    for stream in data.get("streams", []):
        streams.append(
            {
                "codec_type": stream.get("codec_type"),
                "codec_name": stream.get("codec_name"),
                "width": stream.get("width"),
                "height": stream.get("height"),
                "r_frame_rate": stream.get("r_frame_rate"),
                "sample_rate": stream.get("sample_rate"),
                "channels": stream.get("channels"),
                "duration": stream.get("duration"),
            }
        )
    return {
        "format_name": data.get("format", {}).get("format_name"),
        "duration": data.get("format", {}).get("duration"),
        "size": data.get("format", {}).get("size"),
        "bit_rate": data.get("format", {}).get("bit_rate"),
        "streams": streams,
    }


def parse_key_value(values: list[str]) -> dict[str, str]:
    parsed: dict[str, str] = {}
    for value in values:
        if "=" not in value:
            raise SystemExit(f"Expected key=path, got: {value}")
        key, path = value.split("=", 1)
        key = key.strip()
        path = path.strip()
        if not key or not path:
            raise SystemExit(f"Expected key=path, got: {value}")
        parsed[key] = path
    return parsed


def duration_label(entry: IntegrityEntry) -> str:
    duration = entry.ffprobe.get("duration")
    if not duration:
        return "-"
    try:
        seconds = float(duration)
    except (TypeError, ValueError):
        return str(duration)
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = seconds % 60
    return f"{hours:02d}:{minutes:02d}:{secs:05.2f}"


def write_markdown(path: Path, cert: IntegrityCertificate, sha_name: str) -> None:
    lines: list[str] = [
        f"# {cert.title} upload integrity certificate",
        "",
        f"Created: `{cert.createdAt}`",
        "",
        f"Status: `{cert.status}`",
        "",
        "## Producer call",
        "",
        cert.producerRecommendation,
        "",
        "## Upload set",
        "",
    ]
    for key, value in cert.uploadSet.items():
        lines.append(f"- {key}: `{value}`")
    lines.extend(["", "## QC readback", ""])
    for key, value in cert.qcReadback.items():
        lines.append(f"- {key}: `{value}`")
    lines.extend(["", "## File fingerprints", "", "| File | Size | Duration | SHA-256 |", "| --- | ---: | ---: | --- |"])
    for entry in cert.entries:
        size_mb = entry.bytes / 1024 / 1024
        lines.append(f"| `{entry.relativePath}` | {size_mb:.1f} MB | {duration_label(entry)} | `{entry.sha256}` |")
    if cert.missing:
        lines.extend(["", "## Missing", ""])
        for item in cert.missing:
            lines.append(f"- `{item}`")
    lines.extend(
        [
            "",
            "## SHA-256 manifest",
            "",
            f"`{sha_name}`",
            "",
            "## Truth",
            "",
            "- Codex did not upload, publish, schedule, or send anything externally.",
            "- Original media was not mutated.",
            "- This certificate proves local artifact identity and readiness, not platform publication.",
            "- After upload, record URLs or provider receipt ids in the publication receipt ledger.",
            "",
        ]
    )
    path.write_text("\n".join(lines))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ready-dir", required=True)
    parser.add_argument("--episode-id", default="")
    parser.add_argument("--title", required=True)
    parser.add_argument("--recommendation", required=True)
    parser.add_argument("--file", action="append", default=[], help="Relative or absolute path to fingerprint. Repeatable.")
    parser.add_argument("--upload-set", action="append", default=[], help="Named upload artifact as key=relative/path. Repeatable.")
    parser.add_argument("--qc", action="append", default=[], help="QC readback as key=value. Repeatable.")
    parser.add_argument("--output-stem", default="UPLOAD_INTEGRITY_CERTIFICATE")
    parser.add_argument("--sha-name", default="SHA256SUMS.txt")
    parser.add_argument("--json", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    ready_dir = Path(args.ready_dir).expanduser().resolve()
    ready_dir.mkdir(parents=True, exist_ok=True)
    upload_set = parse_key_value(args.upload_set)
    qc = parse_key_value(args.qc)
    requested = list(dict.fromkeys(list(upload_set.values()) + args.file))
    entries: list[IntegrityEntry] = []
    missing: list[str] = []
    for value in requested:
        path = resolve(ready_dir, value)
        relative = rel_path(ready_dir, path)
        if not path.exists() or path.stat().st_size <= 0:
            missing.append(relative)
            continue
        entries.append(
            IntegrityEntry(
                relativePath=relative,
                bytes=path.stat().st_size,
                sha256=sha256(path),
                ffprobe=ffprobe_summary(path),
            )
        )
    cert = IntegrityCertificate(
        status="passed" if not missing else "failed-missing-files",
        createdAt=datetime.now(timezone.utc).isoformat(),
        episodeId=args.episode_id,
        title=args.title,
        readyDir=str(ready_dir),
        producerRecommendation=args.recommendation,
        qcReadback=qc,
        uploadSet=upload_set,
        missing=missing,
        entries=entries,
        truth={
            "externalUploadPerformedByCodex": False,
            "externalPublicationClaimed": False,
            "originalMediaMutated": False,
            "localUploadReadinessOnly": True,
        },
    )
    json_path = ready_dir / f"{args.output_stem}.json"
    md_path = ready_dir / f"{args.output_stem}.md"
    sha_path = ready_dir / args.sha_name
    json_path.write_text(json.dumps(asdict(cert), indent=2) + "\n")
    sha_path.write_text("".join(f"{entry.sha256}  {entry.relativePath}\n" for entry in entries))
    write_markdown(md_path, cert, args.sha_name)
    payload = {"status": cert.status, "entryCount": len(entries), "missing": missing, "markdown": str(md_path), "json": str(json_path), "sha256s": str(sha_path)}
    print(json.dumps(payload, indent=2) if args.json else payload)


if __name__ == "__main__":
    main()
