#!/usr/bin/env python3
"""Smoke-test the human-flow sidecar review pipeline with disposable data.

This runs the demo fixture and verifies that the expected sidecar artifacts
exist. It is safe for real edits because it uses fake review cards and writes
only disposable artifacts under the export root.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import subprocess
import sys
from pathlib import Path
from typing import Any


SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_OUTPUT_ROOT = Path("/Users/wall-e/Movies/QuipslyExports/human-flow-review/smoke")


def read_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, dict):
        raise ValueError(f"Expected JSON object at {path}")
    return payload


def count_jsonl(path: Path) -> int:
    if not path.exists():
        return 0
    with path.open("r", encoding="utf-8") as handle:
        return sum(1 for line in handle if line.strip())


def artifact_check(label: str, path: Path, minimum_size: int = 1) -> dict[str, Any]:
    exists = path.exists()
    size = path.stat().st_size if exists else 0
    return {
        "label": label,
        "path": str(path),
        "exists": exists,
        "sizeBytes": size,
        "passed": exists and size >= minimum_size,
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Quipsly human-flow sidecar smoke report",
        "",
        f"- Generated: `{report['generatedAt']}`",
        f"- Passed: `{report['passed']}`",
        f"- Output dir: `{report['outputDir']}`",
        f"- Session dir: `{report['sessionDir']}`",
        f"- Truth: {report['truth']}",
        "",
        "## Artifact checks",
        "",
    ]
    for check in report["artifactChecks"]:
        status = "PASS" if check["passed"] else "FAIL"
        lines.append(f"- `{status}` {check['label']}: `{check['path']}` ({check['sizeBytes']} bytes)")
    lines.extend([
        "",
        "## Semantic checks",
        "",
    ])
    for check in report["semanticChecks"]:
        status = "PASS" if check["passed"] else "FAIL"
        lines.append(f"- `{status}` {check['label']}: {check['detail']}")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-root", default=str(DEFAULT_OUTPUT_ROOT))
    args = parser.parse_args()

    output_root = Path(args.output_root).expanduser()
    output_root.mkdir(parents=True, exist_ok=True)
    demo = subprocess.run(
        [
            sys.executable,
            str(SCRIPT_DIR / "human_flow_review_demo_fixture.py"),
            "--output-root",
            str(output_root),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    demo_payload = json.loads(demo.stdout)
    output_dir = Path(demo_payload["outputDir"])
    session_dir = Path(demo_payload["sessionDir"])
    artifact_checks = [
        artifact_check("demo summary", Path(demo_payload["summary"])),
        artifact_check("demo board", output_dir / "demo-human-flow-board.json"),
        artifact_check("review session", session_dir / "review-session.json"),
        artifact_check("review receipts", session_dir / "review-receipts.jsonl"),
        artifact_check("review decisions", session_dir / "review-decisions.jsonl"),
        artifact_check("decision summary", session_dir / "review-decisions-summary.json"),
        artifact_check("promotion plan", session_dir / "review-promotion-plan.json"),
        artifact_check("approval ledger", session_dir / "review-promotion-approvals.jsonl"),
        artifact_check("approved patch packet", session_dir / "review-approved-patch-packet.json"),
        artifact_check("start-here html", output_dir / "demo-human-flow-start-here.html"),
        artifact_check("start-here markdown", output_dir / "demo-human-flow-start-here.md"),
    ]
    patch_packet = read_json(session_dir / "review-approved-patch-packet.json")
    promotion_plan = read_json(session_dir / "review-promotion-plan.json")
    semantic_checks = [
        {
            "label": "two demo decisions recorded",
            "passed": count_jsonl(session_dir / "review-decisions.jsonl") == 2,
            "detail": f"{count_jsonl(session_dir / 'review-decisions.jsonl')} decisions found",
        },
        {
            "label": "promotion plan contains actions",
            "passed": int(promotion_plan.get("actionCount", 0)) >= 2,
            "detail": f"{promotion_plan.get('actionCount', 0)} actions found",
        },
        {
            "label": "approved patch packet contains one approved preview",
            "passed": int(patch_packet.get("approvedPatchCount", 0)) == 1,
            "detail": f"{patch_packet.get('approvedPatchCount', 0)} approved patch previews found",
        },
        {
            "label": "approved patch packet remains dry-run",
            "passed": all(
                patch.get("applyState") == "not_applied" and patch.get("requiresExplicitApplyCommand") is True
                for patch in patch_packet.get("patches", [])
                if isinstance(patch, dict)
            ),
            "detail": "all approved patch previews require an explicit apply command",
        },
    ]
    passed = all(check["passed"] for check in artifact_checks) and all(check["passed"] for check in semantic_checks)
    report = {
        "model": "quipsly-human-flow-sidecar-smoke-report",
        "generatedAt": dt.datetime.now(dt.timezone.utc).astimezone().isoformat(timespec="seconds"),
        "passed": passed,
        "outputDir": str(output_dir),
        "sessionDir": str(session_dir),
        "artifactChecks": artifact_checks,
        "semanticChecks": semantic_checks,
        "truth": "Disposable fake-data smoke. It proves sidecar workflow mechanics only; it does not prove real edits changed.",
    }
    report_path = output_dir / "human-flow-smoke-report.json"
    markdown_path = output_dir / "human-flow-smoke-report.md"
    with report_path.open("w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2, sort_keys=True)
        handle.write("\n")
    with markdown_path.open("w", encoding="utf-8") as handle:
        handle.write(render_markdown(report))
        handle.write("\n")
    print(json.dumps({
        "passed": passed,
        "report": str(report_path),
        "markdown": str(markdown_path),
        "outputDir": str(output_dir),
        "sessionDir": str(session_dir),
    }, indent=2, sort_keys=True))
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
