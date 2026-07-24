#!/usr/bin/env python3
"""Classify Quipsly working-tree changes before checkpoint commits.

This intentionally does not stage, commit, delete, move, publish, or mutate app
data. It produces a review packet that separates source candidates from
generated artifacts and quarantine candidates so humans/agents can make safer
checkpoint decisions.
"""

from __future__ import annotations

import html
import json
import os
import shlex
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable


DEFAULT_EXTERNAL_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/CheckpointClassifiers")
FALLBACK_ROOT = Path("/tmp/quipsly-checkpoint-classifiers")


@dataclass(frozen=True)
class StatusEntry:
    status: str
    path: str


def run_text(command: list[str], cwd: Path) -> str:
    return subprocess.check_output(command, cwd=str(cwd), text=True, stderr=subprocess.STDOUT).strip()


def repo_root() -> Path:
    try:
      return Path(run_text(["git", "rev-parse", "--show-toplevel"], Path.cwd()))
    except Exception:
      return Path(__file__).resolve().parents[3]


def parse_status_line(line: str) -> StatusEntry | None:
    if not line.strip():
        return None

    status = line[:2]
    raw_path = line[3:].strip()
    if not raw_path:
        return None

    if " -> " in raw_path:
        raw_path = raw_path.split(" -> ", 1)[1]

    try:
        parts = shlex.split(raw_path)
        path = parts[0] if parts else raw_path
    except ValueError:
        path = raw_path.strip('"')

    return StatusEntry(status=status, path=path)


def working_tree_status(root: Path) -> list[StatusEntry]:
    output = run_text(["git", "status", "--short"], root)
    entries: list[StatusEntry] = []
    for line in output.splitlines():
        entry = parse_status_line(line)
        if entry:
            entries.append(entry)
    return entries


def classify_path(path: str) -> tuple[str, str]:
    lower = path.lower()
    suffix = Path(path).suffix.lower()

    if path.startswith("apps/mac/"):
        return (
            "quarantine_review",
            "Old or alternate Mac app surface. Review deliberately before allowing it back into the active product.",
        )

    if path.startswith("apps/web/content/_inbox/"):
        return (
            "source_material_review",
            "Human/source content inbox. Preserve carefully, but decide whether it belongs in repo, external storage, or import tooling.",
        )

    if "/current-state/" in path or path.startswith("docs/quipsly/current-state/"):
        return (
            "generated_current_state",
            "Generated board, receipt, proof, or current-state artifact. Usually review, regenerate, or move to external proof storage before source commits.",
        )

    if path.startswith("apps/QuipslyStudio/reports/"):
        return (
            "generated_report_or_job_state",
            "Runtime report or proxy-job state. Useful evidence, but should not be bundled with source code without intent.",
        )

    if suffix in {".mp4", ".mov", ".m4a", ".wav", ".aiff", ".png", ".jpg", ".jpeg", ".heic", ".cr3", ".insv", ".lrv"}:
        return (
            "media_artifact_review",
            "Media/proof artifact. Do not commit by default; store in external workspace or bucket with manifest/receipt.",
        )

    if path.startswith("apps/QuipslyStudio/script/"):
        return (
            "source_script_candidate",
            "QuipslyStudio source/automation script. Candidate for source commit after compile/smoke validation.",
        )

    if path.startswith("apps/QuipslyStudio/Sources/") or path.startswith("apps/QuipslyStudio/QuipslyStudio.xcodeproj/"):
        return (
            "source_app_candidate",
            "Native Studio source or project config. Candidate for source commit after app validation.",
        )

    if path.startswith("apps/quipsly/src/"):
        return (
            "source_web_candidate",
            "Nest/web app source. Candidate for source commit after TypeScript/web validation.",
        )

    if path.startswith("docs/") or path.startswith("apps/QuipslyStudio/docs/"):
        if suffix in {".html", ".json"}:
            return (
                "generated_doc_artifact",
                "Generated doc artifact. Keep only if it is an intentional current-state proof; otherwise regenerate externally.",
            )
        return (
            "product_doc_candidate",
            "Human-readable product/runbook/coordination doc. Candidate for docs commit after reviewing for stale claims.",
        )

    if path.startswith("apps/web/content/books/"):
        return (
            "published_content_candidate",
            "Site/book content. Candidate for content commit after confirming it is source truth, not generated proof.",
        )

    if suffix in {".py", ".sh", ".ts", ".tsx", ".swift", ".json", ".md"}:
        return (
            "review_required_source_like",
            "Source-like file outside the main known lanes. Review manually before committing.",
        )

    return (
        "unknown_review_required",
        "Unclassified path. Human/agent review required before commit, quarantine, or deletion.",
    )


def group_entries(entries: Iterable[StatusEntry]) -> dict[str, list[dict[str, str]]]:
    grouped: dict[str, list[dict[str, str]]] = {}
    for entry in entries:
        category, reason = classify_path(entry.path)
        grouped.setdefault(category, []).append({
            "status": entry.status,
            "path": entry.path,
            "reason": reason,
        })
    return dict(sorted(grouped.items(), key=lambda item: item[0]))


def default_output_root() -> Path:
    return DEFAULT_EXTERNAL_ROOT if DEFAULT_EXTERNAL_ROOT.parent.exists() else FALLBACK_ROOT


def render_markdown(payload: dict) -> str:
    lines = [
        "# Quipsly Checkpoint Classifier",
        "",
        f"Generated: {payload['generatedAt']}",
        f"Repo root: `{payload['repoRoot']}`",
        f"Head: `{payload['head']}`",
        "",
        "## Product rule",
        "",
        "This report classifies changes. It does not stage, commit, delete, publish, or mutate source/media.",
        "",
        "## Summary",
        "",
    ]
    for category, count in payload["counts"].items():
        lines.append(f"- `{category}`: {count}")

    lines.extend(["", "## Categories", ""])
    for category, rows in payload["groups"].items():
        lines.append(f"### {category}")
        lines.append("")
        if not rows:
            lines.append("- None")
        for row in rows:
            lines.append(f"- `{row['status']}` `{row['path']}`")
            lines.append(f"  - {row['reason']}")
        lines.append("")

    lines.extend([
        "## Suggested checkpoint order",
        "",
        "1. Source candidates with validation evidence.",
        "2. Human-readable docs that describe product truth without stale claims.",
        "3. Generated current-state artifacts only when intentionally preserved.",
        "4. Quarantine/legacy/source-material paths after explicit decision.",
    ])
    return "\n".join(lines) + "\n"


def render_html(payload: dict, markdown: str) -> str:
    body = html.escape(markdown)
    return f"""<!doctype html>
<html lang=\"en\">
<head>
  <meta charset=\"utf-8\" />
  <title>Quipsly Checkpoint Classifier</title>
  <style>
    body {{ margin: 0; background: #f8f3e8; color: #33281d; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }}
    main {{ max-width: 1100px; margin: 0 auto; padding: 48px 28px; }}
    pre {{ white-space: pre-wrap; background: #fffaf1; border: 1px solid #e7d8bd; border-radius: 24px; padding: 28px; line-height: 1.55; box-shadow: 0 18px 50px rgba(63, 47, 31, 0.08); }}
  </style>
</head>
<body>
  <main>
    <pre>{body}</pre>
  </main>
</body>
</html>
"""


def main() -> int:
    root = repo_root()
    output_root = Path(os.environ.get("QUIPSLY_CHECKPOINT_CLASSIFIER_ROOT", default_output_root()))
    run_id = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f")
    output_dir = output_root / run_id
    output_dir.mkdir(parents=True, exist_ok=True)

    entries = working_tree_status(root)
    groups = group_entries(entries)
    counts = {category: len(rows) for category, rows in groups.items()}
    head = run_text(["git", "log", "--oneline", "-1"], root)

    payload = {
        "status": "checkpoint-classifier-ready",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "repoRoot": str(root),
        "head": head,
        "entryCount": len(entries),
        "counts": counts,
        "groups": groups,
        "outputs": {},
    }

    markdown = render_markdown(payload)
    html_text = render_html(payload, markdown)

    json_path = output_dir / "checkpoint-classifier.json"
    md_path = output_dir / "checkpoint-classifier.md"
    html_path = output_dir / "index.html"
    json_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    md_path.write_text(markdown, encoding="utf-8")
    html_path.write_text(html_text, encoding="utf-8")

    payload["outputs"] = {
        "json": str(json_path),
        "markdown": str(md_path),
        "html": str(html_path),
    }
    json_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    print(json.dumps(payload, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
