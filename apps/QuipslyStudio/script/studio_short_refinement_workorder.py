#!/usr/bin/env python3
"""Create a source-safe v002 workorder for one refined short candidate."""
from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from html import escape
from pathlib import Path
from typing import Any


DEFAULT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
DEFAULT_QUEUE_POINTER = DEFAULT_ROOT / "review-board" / "short-refinement-queue" / "latest-short-refinement-queue.json"
DEFAULT_OUTPUT_DIR = DEFAULT_ROOT / "review-board" / "short-refinement-workorders"
SCHEMA = "quipsly.studio.short-refinement-workorder.v1"
VERSION = "2026-07-03.v1"


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise SystemExit(f"Missing JSON: {path}")
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise SystemExit(f"Expected JSON object: {path}")
    return data


def latest_queue(pointer_path: Path) -> dict[str, Any]:
    pointer = load_json(pointer_path)
    queue_path = Path(str(pointer.get("jsonPath") or ""))
    return load_json(queue_path)


def select_item(queue: dict[str, Any], short_id: str) -> dict[str, Any]:
    items = queue.get("items") if isinstance(queue.get("items"), list) else []
    if short_id:
        for item in items:
            if isinstance(item, dict) and str(item.get("shortId") or "") == short_id:
                return item
        raise SystemExit(f"Short not found in refinement queue: {short_id}")
    if not items:
        raise SystemExit("Refinement queue has no items.")
    first = items[0]
    return first if isinstance(first, dict) else {}


FILLER_STARTS = (
    "i had",
    "i think",
    "i mean",
    "um",
    "uh",
    "so ",
    "and ",
    "but ",
    "all right",
    "good morning",
    "welcome",
)


SIGNAL_WORDS = (
    "trust",
    "leader",
    "leadership",
    "pain",
    "untrustworthy",
    "consistent",
    "because",
    "learn",
    "lesson",
    "framework",
    "attention",
    "anxiety",
    "responsibility",
    "story",
    "people",
)


def sentence_candidates(text: str) -> list[str]:
    clean = " ".join(str(text or "").split())
    if not clean:
        return []
    pieces = [piece.strip(" ,;:-") for piece in re.split(r"(?<=[.!?])\s+|\s{2,}", clean) if piece.strip(" ,;:-")]
    if len(pieces) <= 1 and len(clean.split()) > 24:
        words = clean.split()
        pieces = [" ".join(words[index:index + 18]) for index in range(0, min(len(words), 72), 18)]
    return pieces


def candidate_score(candidate: str) -> int:
    lower = candidate.lower()
    words = [word.strip(".,!?;:\"'()[]").lower() for word in candidate.split()]
    score = len([word for word in words if len(word) >= 5])
    score += sum(5 for word in SIGNAL_WORDS if word in lower)
    if any(lower.startswith(start) for start in FILLER_STARTS):
        score -= 12
    if len(words) < 6:
        score -= 8
    if len(words) > 26:
        score -= 4
    repeated = sum(1 for left, right in zip(words, words[1:]) if left == right)
    score -= repeated * 6
    return score


def transcript_anchor(text: str) -> dict[str, Any]:
    clean = " ".join(str(text or "").split())
    if not clean:
        return {
            "hookCandidate": "",
            "endCandidate": "",
            "captionSeed": "",
            "hookScore": 0,
            "hookWarning": "Transcript preview is missing; hook must be found by listening.",
        }
    words = clean.split()
    candidates = sentence_candidates(clean)
    ranked = sorted(candidates, key=candidate_score, reverse=True)
    hook = ranked[0] if ranked else " ".join(words[:18])
    end = " ".join(words[-18:])
    caption = hook
    if len(caption) > 90:
        caption = caption[:87].rstrip() + "..."
    score = candidate_score(hook)
    warning = ""
    if score < 8:
        warning = "Weak hook candidate. It may be throat-clearing, context setup, or ASR mush; listen for a stronger first phrase before exporting v002."
    return {
        "hookCandidate": hook,
        "endCandidate": end,
        "captionSeed": caption,
        "hookScore": score,
        "hookWarning": warning,
        "alternates": ranked[1:4],
    }


def recommended_duration(item: dict[str, Any]) -> dict[str, Any]:
    duration = float(item.get("durationSeconds") or 0)
    if duration >= 40:
        return {
            "targetSeconds": 25,
            "rangeSeconds": "18-32",
            "reason": "Current cut is long for a social short. Aim for one clean thought, not the whole conversation ramp.",
        }
    if duration >= 25:
        return {
            "targetSeconds": 20,
            "rangeSeconds": "14-26",
            "reason": "Current cut may work, but tighter pacing usually performs better if the payoff survives.",
        }
    return {
        "targetSeconds": duration,
        "rangeSeconds": "current duration if the hook/payoff lands",
        "reason": "Short enough already; focus on meaning, captions, and framing rather than arbitrary trimming.",
    }


def build_workorder(item: dict[str, Any], queue_path: str) -> dict[str, Any]:
    anchors = transcript_anchor(str(item.get("transcriptPreview") or ""))
    duration = recommended_duration(item)
    sidecars = item.get("sidecars") if isinstance(item.get("sidecars"), dict) else {}
    return {
        "schema": SCHEMA,
        "version": VERSION,
        "generatedAt": utc_now(),
        "status": "short-refinement-workorder-ready",
        "sourceQueue": queue_path,
        "shortId": item.get("shortId"),
        "episode": item.get("episode"),
        "title": item.get("title"),
        "sourceVersion": item.get("version"),
        "targetVersion": "v002",
        "mediaPath": item.get("mediaPath"),
        "currentDurationSeconds": item.get("durationSeconds"),
        "durationTarget": duration,
        "decisionInput": {
            "decision": item.get("decision"),
            "reviewer": item.get("reviewer"),
            "reviewedAt": item.get("reviewedAt"),
            "reviewNotes": item.get("reviewNotes"),
            "refinementTags": item.get("refinementTags"),
            "priorityScore": item.get("priorityScore"),
        },
        "transcriptAnchors": anchors,
        "editRecipe": {
            "sourcePolicy": "Use whole source/export reference as read-only input. Create v002 as a new derivative, never overwrite v001.",
            "hook": "Start as close as possible to the best hook candidate only if it survives listen review. If hookWarning is present, search the source for a stronger first phrase before exporting.",
            "body": "Preserve one complete idea. Remove throat-clearing, repeated setup, and pauses that do not carry human emphasis.",
            "ending": "End on a complete thought or a clear invitation to continue. Do not trail off mid-clause.",
            "captions": "Use ASR as draft only. Correct names/terms by listening before burned-in captions or platform text.",
            "framing": "Keep faces safe for captions. Prefer warm human presence over aggressive crop gimmicks.",
            "audio": "Check clipping/harshness and do not over-compress pauses into robotic cadence.",
        },
        "nextActions": item.get("nextActions") if isinstance(item.get("nextActions"), list) else [],
        "qualityWarnings": [warning for warning in [anchors.get("hookWarning")] if warning],
        "sidecars": sidecars,
        "verificationChecklist": [
            "Watch v002 as a viewer, not only as an editor.",
            "Confirm the first two seconds communicate a reason to keep watching.",
            "Confirm the final beat lands without needing missing context.",
            "Confirm captions do not cover faces or important motion.",
            "Confirm ASR-sensitive words were listen-checked.",
            "Run triage again on v002 before promoting beyond refine.",
        ],
        "safeCommands": {
            "openCurrentShort": f"open '{str(item.get('mediaPath') or '').replace(chr(39), chr(39) + '\"' + chr(39) + '\"' + chr(39))}'",
            "readback": f"./script/agentctl.sh studio-short-review-readback --short-id {item.get('shortId')} --json",
            "triageAgain": f"./script/agentctl.sh studio-short-review-triage --short-id {item.get('shortId')} --save --json",
        },
        "truth": "V002 refinement workorder only. It does not create an export, mutate source media, overwrite versions, publish, upload, schedule, approve, delete, normalize transcript truth, or create receipt truth.",
    }


def render_markdown(payload: dict[str, Any]) -> str:
    recipe = payload.get("editRecipe") if isinstance(payload.get("editRecipe"), dict) else {}
    anchors = payload.get("transcriptAnchors") if isinstance(payload.get("transcriptAnchors"), dict) else {}
    lines = [
        "# Short v002 refinement workorder",
        "",
        f"Short: `{payload.get('shortId')}`",
        f"Episode: `{payload.get('episode')}`",
        f"Title: {payload.get('title')}",
        f"Target: `{payload.get('targetVersion')}`",
        "",
        "## Transcript anchors",
        "",
        f"- Hook candidate: {anchors.get('hookCandidate') or '(missing)'}",
        f"- Ending candidate: {anchors.get('endCandidate') or '(missing)'}",
        f"- Caption seed: {anchors.get('captionSeed') or '(missing)'}",
        "",
        "## Edit recipe",
        "",
    ]
    for key, value in recipe.items():
        lines.append(f"- {key}: {value}")
    lines.extend(["", "## Verification checklist", ""])
    for item in payload.get("verificationChecklist", []):
        lines.append(f"- [ ] {item}")
    lines.extend(["", "## Truth boundary", "", str(payload.get("truth") or "")])
    return "\n".join(lines).rstrip() + "\n"


def render_html(payload: dict[str, Any]) -> str:
    anchors = payload.get("transcriptAnchors") if isinstance(payload.get("transcriptAnchors"), dict) else {}
    checks = "".join(f"<li>{escape(str(item))}</li>" for item in payload.get("verificationChecklist", []))
    actions = "".join(f"<li>{escape(str(item))}</li>" for item in payload.get("nextActions", []))
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>{escape(str(payload.get('shortId')))} refinement workorder</title>
  <style>
    :root {{ color-scheme: dark; --bg: #101814; --panel: #203127; --ink: #f7ecd2; --muted: #b9ad91; --gold: #d9ba55; --leaf: #85c98f; }}
    body {{ margin: 0; padding: 32px; background: radial-gradient(circle at top left, #2b422f, var(--bg)); color: var(--ink); font: 16px/1.55 -apple-system, BlinkMacSystemFont, "Avenir Next", sans-serif; }}
    main {{ max-width: 960px; margin: auto; background: rgba(32,49,39,.88); border: 1px solid rgba(217,186,85,.28); border-radius: 28px; padding: 28px; box-shadow: 0 24px 80px rgba(0,0,0,.32); }}
    .kicker {{ color: var(--gold); letter-spacing: .14em; text-transform: uppercase; font-size: 12px; font-weight: 900; }}
    h1 {{ margin: 8px 0 0; font-size: 34px; }}
    h2 {{ margin-top: 28px; color: var(--leaf); font-size: 15px; letter-spacing: .1em; text-transform: uppercase; }}
    .muted {{ color: var(--muted); }}
    .anchor {{ padding: 14px 16px; background: rgba(0,0,0,.2); border-radius: 16px; border: 1px solid rgba(255,255,255,.08); }}
  </style>
</head>
<body>
<main>
  <div class="kicker">Quipsly Studio · v002 workorder</div>
  <h1>{escape(str(payload.get('title')))}</h1>
  <p class="muted">{escape(str(payload.get('shortId')))} · Episode {escape(str(payload.get('episode')))} · target {escape(str(payload.get('targetVersion')))}</p>
  <h2>Hook candidate</h2>
  <p class="anchor">{escape(str(anchors.get('hookCandidate') or 'missing'))}</p>
  <h2>End candidate</h2>
  <p class="anchor">{escape(str(anchors.get('endCandidate') or 'missing'))}</p>
  <h2>Next actions</h2>
  <ul>{actions}</ul>
  <h2>Verification checklist</h2>
  <ul>{checks}</ul>
  <h2>Truth boundary</h2>
  <p class="muted">{escape(str(payload.get('truth')))}</p>
</main>
</body>
</html>
"""


def write_outputs(payload: dict[str, Any], output_dir: Path, basename: str, formats: set[str]) -> dict[str, str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    paths: dict[str, str] = {}
    if "json" in formats:
        path = output_dir / f"{basename}.json"
        path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        paths["jsonPath"] = str(path)
    if "markdown" in formats:
        path = output_dir / f"{basename}.md"
        path.write_text(render_markdown(payload), encoding="utf-8")
        paths["markdownPath"] = str(path)
    if "html" in formats:
        path = output_dir / f"{basename}.html"
        path.write_text(render_html(payload), encoding="utf-8")
        paths["htmlPath"] = str(path)
    latest_path = output_dir / "latest-short-refinement-workorder.json"
    latest_path.write_text(json.dumps(paths, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    paths["latestPointerJson"] = str(latest_path)
    return paths


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a v002 short refinement workorder.")
    parser.add_argument("--queue-pointer", default=str(DEFAULT_QUEUE_POINTER))
    parser.add_argument("--short-id", default="")
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR))
    parser.add_argument("--basename", default="")
    parser.add_argument("--format", choices=["markdown", "json", "html", "all"], default="markdown")
    parser.add_argument("--markdown", dest="format", action="store_const", const="markdown")
    parser.add_argument("--json", dest="format", action="store_const", const="json")
    parser.add_argument("--html", dest="format", action="store_const", const="html")
    parser.add_argument("--all", dest="format", action="store_const", const="all")
    args = parser.parse_args()

    pointer = load_json(Path(args.queue_pointer).expanduser())
    queue_path = str(pointer.get("jsonPath") or "")
    queue = latest_queue(Path(args.queue_pointer).expanduser())
    item = select_item(queue, args.short_id)
    payload = build_workorder(item, queue_path)
    basename = args.basename or f"{stamp_now()}-{payload.get('shortId')}-v002-workorder"
    formats = {"json", "markdown", "html"} if args.format == "all" else {args.format}
    payload["outputPaths"] = write_outputs(payload, Path(args.output_dir).expanduser(), basename, formats)
    if args.format == "json":
        print(json.dumps(payload, indent=2, sort_keys=True))
    elif args.format == "html":
        print(render_html(payload))
    else:
        print(render_markdown(payload), end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
