#!/usr/bin/env python3
"""Build an actionable hook rescue plan for blocked v002 short candidates.

This is for candidates that are blocked before export because the proposed hook
sounds like setup, throat-clearing, or ASR mush. It reads the existing v002
manifest/workorder plus transcript word timings, proposes stronger in-points,
and emits explicit candidate-export commands. It does not render by itself.
"""
from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from html import escape
from pathlib import Path
from typing import Any


DEFAULT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
DEFAULT_OUTPUT_DIR = DEFAULT_ROOT / "review-board" / "short-v002-hook-rescues"
SCHEMA = "quipsly.studio.short-v002-hook-rescue.v1"
VERSION = "2026-07-03.v1"

FILLER_STARTS = {
    "i", "um", "uh", "so", "and", "but", "well", "maybe", "like", "okay", "ok",
    "to", "have", "a", "it",
}
BAD_OPENING_PHRASES = (
    "i had i had",
    "i think i'll just",
    "i'm hoping to have",
    "well i'll announce",
    "to have well",
    "have well",
)
SIGNAL_WORDS = {
    "pain", "trust", "untrustworthy", "consistent", "lead", "leader", "leadership",
    "people", "responsibility", "because", "lesson", "coach", "coachable", "patreon",
    "contributor", "join", "build", "change", "hard", "why", "what", "how",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def slug(value: str) -> str:
    text = re.sub(r"[^A-Za-z0-9]+", "-", value).strip("-").lower()
    return text[:100] or "short"


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise SystemExit(f"Missing JSON: {path}")
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise SystemExit(f"Expected JSON object: {path}")
    return data


def latest_candidate_manifest(root: Path, episode: int, short_id: str) -> tuple[Path, dict[str, Any]]:
    pointer = root / f"Episode_{episode:02d}" / "v002" / "short-refinement-candidates" / short_id / "latest-v002-candidate.json"
    pointer_data = load_json(pointer)
    manifest_path = Path(str(pointer_data.get("jsonPath") or ""))
    return manifest_path, load_json(manifest_path)


def word_rows(transcript_path: str) -> list[dict[str, Any]]:
    if not transcript_path:
        return []
    data = load_json(Path(transcript_path))
    rows: list[dict[str, Any]] = []
    for segment in data.get("segments", []) if isinstance(data.get("segments"), list) else []:
        if not isinstance(segment, dict):
            continue
        for word in segment.get("words", []) if isinstance(segment.get("words"), list) else []:
            if not isinstance(word, dict):
                continue
            raw = str(word.get("word") or "").strip()
            norm = re.sub(r"[^a-z0-9]+", "", raw.lower())
            if not norm:
                continue
            rows.append({
                "word": raw,
                "norm": norm,
                "start": float(word.get("start") or 0.0),
                "end": float(word.get("end") or 0.0),
                "probability": word.get("probability"),
            })
    return rows


def phrase(rows: list[dict[str, Any]], start_index: int, max_words: int = 22) -> str:
    tokens = [str(row.get("word") or "").strip() for row in rows[start_index:start_index + max_words]]
    text = " ".join(tokens)
    return " ".join(text.split())


def candidate_score(text: str, start_norm: str, start_time: float, repeated_nearby: int) -> tuple[int, list[str], list[str]]:
    lower = text.lower()
    tokens = [re.sub(r"[^a-z0-9]+", "", token.lower()) for token in text.split()]
    tokens = [token for token in tokens if token]
    strengths: list[str] = []
    risks: list[str] = []
    score = 0
    if start_norm not in FILLER_STARTS:
        score += 8
        strengths.append("starts on content instead of a filler token")
    else:
        score -= 10
        risks.append("starts on a filler/setup fragment")
    if lower.startswith("i'll ") or lower.startswith("i will "):
        score += 6
        strengths.append("starts on a clear first-person action")
    signal_hits = sorted(SIGNAL_WORDS.intersection(tokens))
    if signal_hits:
        score += min(18, len(signal_hits) * 5)
        strengths.append("contains signal words: " + ", ".join(signal_hits[:6]))
    if any(pronoun in tokens for pronoun in ("you", "your", "we", "our")):
        score += 4
        strengths.append("speaks to the viewer or shared stakes")
    if 8 <= len(tokens) <= 24:
        score += 5
        strengths.append("opening phrase is a usable social-hook length")
    elif len(tokens) < 8:
        score -= 6
        risks.append("opening phrase may be too short to evaluate")
    if any(lower.startswith(phrase) for phrase in BAD_OPENING_PHRASES):
        score -= 16
        risks.append("opening phrase matches known weak setup/throat-clearing")
    if repeated_nearby:
        score -= repeated_nearby * 5
        risks.append("nearby repeated words may need a smoother in-point")
    if start_time > 35:
        score -= 3
        risks.append("late start leaves a short remaining runway")
    return score, strengths, risks


def build_candidates(rows: list[dict[str, Any]], current_duration: float, target_seconds: float, limit: int) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    for index, row in enumerate(rows):
        start = float(row.get("start") or 0.0)
        if start >= max(0.0, current_duration - 4):
            continue
        text = phrase(rows, index)
        if not text:
            continue
        nearby = [str(item.get("norm") or "") for item in rows[max(0, index - 2):index + 8]]
        repeated = sum(1 for left, right in zip(nearby, nearby[1:]) if left and left == right)
        score, strengths, risks = candidate_score(text, str(row.get("norm") or ""), start, repeated)
        end = min(current_duration, max(start + 8.0, start + target_seconds))
        # Prefer ending at the last known word before the target, then add a small breath.
        for word in rows[index:]:
            word_end = float(word.get("end") or 0.0)
            if word_end <= start + target_seconds:
                end = min(current_duration, max(end, word_end + 0.25))
        candidates.append({
            "rankScore": score,
            "startSeconds": round(max(0.0, start - 0.12), 3),
            "endSeconds": round(end, 3),
            "durationSeconds": round(max(0.0, end - max(0.0, start - 0.12)), 3),
            "hookCandidate": text,
            "strengths": strengths,
            "risks": risks,
        })
    candidates.sort(key=lambda item: (item["rankScore"], -item["startSeconds"]), reverse=True)
    deduped: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in candidates:
        key = re.sub(r"[^a-z0-9]+", " ", str(item.get("hookCandidate") or "").lower()).strip()[:80]
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
        if len(deduped) >= limit:
            break
    return deduped


def export_command(short_id: str, candidate: dict[str, Any], reviewer: str) -> str:
    return " ".join([
        "./script/agentctl.sh",
        "studio-short-v002-candidate-export",
        "--short-id",
        shell_quote(short_id),
        "--force-weak-hook",
        "--start-seconds",
        str(candidate.get("startSeconds")),
        "--end-seconds",
        str(candidate.get("endSeconds")),
        "--hook-override",
        shell_quote(str(candidate.get("hookCandidate") or "")),
        "--reason-override",
        shell_quote(f"Hook rescue selected by {reviewer}: stronger in-point than blocked weak-hook candidate."),
        "--json",
    ])


def build_payload(args: argparse.Namespace) -> dict[str, Any]:
    root = Path(args.root).expanduser()
    manifest_path, manifest = latest_candidate_manifest(root, int(args.episode), args.short_id)
    workorder = manifest.get("workorder") if isinstance(manifest.get("workorder"), dict) else {}
    sidecars = workorder.get("sidecars") if isinstance(workorder.get("sidecars"), dict) else {}
    rows = word_rows(str(sidecars.get("transcriptJson") or ""))
    duration = float(workorder.get("currentDurationSeconds") or manifest.get("trim", {}).get("endSeconds") or 0.0)
    target = workorder.get("durationTarget") if isinstance(workorder.get("durationTarget"), dict) else {}
    target_seconds = float(args.target_seconds or target.get("targetSeconds") or 20.0)
    candidates = build_candidates(rows, duration, target_seconds, args.limit)
    for candidate in candidates:
        candidate["exportCommand"] = export_command(args.short_id, candidate, args.reviewer)
    best = candidates[0] if candidates else {}
    return {
        "schema": SCHEMA,
        "version": VERSION,
        "generatedAt": utc_now(),
        "status": "short-v002-hook-rescue-ready" if candidates else "short-v002-hook-rescue-empty",
        "reviewer": args.reviewer,
        "shortId": args.short_id,
        "episode": int(args.episode),
        "candidateManifestPath": str(manifest_path),
        "blockedStatus": manifest.get("status"),
        "sourceMediaPath": manifest.get("sourceMediaPath"),
        "transcriptJson": str(sidecars.get("transcriptJson") or ""),
        "currentWeakHook": manifest.get("trim", {}).get("hookCandidate") if isinstance(manifest.get("trim"), dict) else "",
        "targetSeconds": target_seconds,
        "candidates": candidates,
        "recommendedCandidate": best,
        "agentReadback": {
            "shortId": args.short_id,
            "status": "short-v002-hook-rescue-ready" if candidates else "short-v002-hook-rescue-empty",
            "candidateCount": len(candidates),
            "recommendedStart": best.get("startSeconds"),
            "recommendedEnd": best.get("endSeconds"),
            "recommendedHook": best.get("hookCandidate") or "",
            "recommendedScore": best.get("rankScore"),
            "recommendedExportCommand": best.get("exportCommand") or "",
            "nextSafestAction": "Render the top rescue candidate, then run evidence, comparison, quality brief, theater, and decision rehearsal.",
        },
        "truth": "Hook rescue plan only. It does not render media, mutate source media, overwrite exports, record review decisions, publish, upload, schedule, approve, delete, normalize transcript truth, mutate accounts, or create receipt truth.",
    }


def render_markdown(payload: dict[str, Any]) -> str:
    lines = [
        "# Short v002 hook rescue",
        "",
        f"Short: `{payload.get('shortId')}`",
        f"Status: `{payload.get('status')}`",
        f"Current weak hook: {payload.get('currentWeakHook') or '(missing)'}",
        "",
        "## Recommended candidates",
        "",
    ]
    for index, candidate in enumerate(payload.get("candidates", []), 1):
        lines.extend([
            f"### {index}. Score {candidate.get('rankScore')} · {candidate.get('startSeconds')}s -> {candidate.get('endSeconds')}s",
            "",
            str(candidate.get("hookCandidate") or ""),
            "",
            "Strengths:",
            "",
        ])
        for strength in candidate.get("strengths") or []:
            lines.append(f"- {strength}")
        lines.extend(["", "Risks:", ""])
        for risk in candidate.get("risks") or []:
            lines.append(f"- {risk}")
        lines.extend(["", "Render command:", "", "```bash", str(candidate.get("exportCommand") or ""), "```", ""])
    lines.extend(["## Truth boundary", "", str(payload.get("truth") or "")])
    return "\n".join(lines).rstrip() + "\n"


def render_html(payload: dict[str, Any]) -> str:
    cards = []
    for index, candidate in enumerate(payload.get("candidates", []), 1):
        strengths = "".join(f"<li>{escape(str(item))}</li>" for item in candidate.get("strengths") or [])
        risks = "".join(f"<li>{escape(str(item))}</li>" for item in candidate.get("risks") or []) or "<li>No automated hook risks found. Still listen.</li>"
        cards.append(f"""
        <section class="card">
          <div class="kicker">Candidate {index} · score {escape(str(candidate.get('rankScore')))} · {escape(str(candidate.get('startSeconds')))}s to {escape(str(candidate.get('endSeconds')))}s</div>
          <h2>{escape(str(candidate.get('hookCandidate') or ''))}</h2>
          <h3>Strengths</h3><ul>{strengths}</ul>
          <h3>Risks</h3><ul>{risks}</ul>
          <pre>{escape(str(candidate.get('exportCommand') or ''))}</pre>
        </section>
        """)
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Quipsly hook rescue</title>
  <style>
    :root {{ color-scheme: dark; --bg:#101915; --panel:#203129; --ink:#f8ecd1; --muted:#baad90; --gold:#dabe55; --leaf:#86ca91; }}
    body {{ margin:0; padding:32px; background:radial-gradient(circle at top left,#334d38,var(--bg)); color:var(--ink); font:15px/1.55 -apple-system,BlinkMacSystemFont,"Avenir Next",sans-serif; }}
    main {{ max-width:1100px; margin:0 auto; }}
    h1 {{ font-size:40px; letter-spacing:-.035em; }}
    .card {{ background:rgba(32,49,41,.94); border:1px solid rgba(218,190,85,.24); border-radius:26px; padding:22px; margin:18px 0; }}
    .kicker {{ color:var(--gold); text-transform:uppercase; letter-spacing:.15em; font-size:12px; font-weight:900; }}
    .weak {{ color:var(--muted); }}
    pre {{ white-space:pre-wrap; word-break:break-all; background:rgba(0,0,0,.2); border-radius:16px; padding:14px; }}
  </style>
</head>
<body><main>
  <h1>Short v002 hook rescue</h1>
  <p class="weak">Blocked hook: {escape(str(payload.get('currentWeakHook') or 'missing'))}</p>
  {''.join(cards)}
  <section class="card"><strong>Truth boundary:</strong> {escape(str(payload.get('truth') or ''))}</section>
</main></body></html>
"""


def write_outputs(payload: dict[str, Any], output_root: Path, basename: str, formats: set[str]) -> dict[str, str]:
    short_slug = slug(str(payload.get("shortId") or "short"))
    output_dir = output_root / short_slug
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
    pointer = output_dir / f"latest-{short_slug}-hook-rescue.json"
    pointer.write_text(json.dumps(paths, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    paths["latestPointerJson"] = str(pointer)
    return paths


def parse_formats(args: argparse.Namespace) -> set[str]:
    if args.all:
        return {"json", "markdown", "html"}
    return {args.format}


def main() -> int:
    parser = argparse.ArgumentParser(description="Plan stronger hook in-points for a blocked v002 short candidate.")
    parser.add_argument("--short-id", required=True)
    parser.add_argument("--episode", type=int, required=True)
    parser.add_argument("--root", default=str(DEFAULT_ROOT))
    parser.add_argument("--reviewer", default="Reviewer")
    parser.add_argument("--target-seconds", type=float, default=0.0)
    parser.add_argument("--limit", type=int, default=5)
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR))
    parser.add_argument("--basename", default="")
    parser.add_argument("--format", choices=["markdown", "json", "html"], default="markdown")
    parser.add_argument("--markdown", dest="format", action="store_const", const="markdown")
    parser.add_argument("--json", dest="format", action="store_const", const="json")
    parser.add_argument("--html", dest="format", action="store_const", const="html")
    parser.add_argument("--all", action="store_true")
    args = parser.parse_args()

    payload = build_payload(args)
    basename = args.basename or f"{stamp_now()}-{slug(args.short_id)}-hook-rescue"
    payload["outputPaths"] = write_outputs(payload, Path(args.output_dir).expanduser(), basename, parse_formats(args))
    if args.format == "json":
        print(json.dumps(payload, indent=2, sort_keys=True))
    elif args.format == "html":
        print(render_html(payload))
    else:
        print(render_markdown(payload), end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
