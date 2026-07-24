#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${QUIPSLY_AGENT_URL:-http://127.0.0.1:8080}"
OUTPUT_ROOT="${QUIPSLY_REVIEW_SHORTS_OUTPUT_DIR:-$HOME/Movies/QuipslyExports/ReviewShorts/episodes-1-3-first-pass}"
COUNT_PER_EPISODE="${QUIPSLY_REVIEW_SHORT_COUNT:-5}"
NO_BUILD=0

usage() {
  cat <<'USAGE'
Seed and export first-pass 9:16 review short candidates for Episodes 1-3.

Usage:
  script/seed_episodes_1_3_review_shorts.sh [--no-build] [--output <directory>] [--count <n>]

This creates honest review candidates, not final editorial endorsements:
  - candidates are sequence-time recipes over whole proxy-backed source lanes,
  - titles include episode number and timestamp,
  - previous auto-generated review candidates are refreshed,
  - temporary Codex smoke candidates are removed,
  - only the candidates created by this run are exported,
  - exports create derivative 9:16 MP4 files without touching source media.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-build)
      NO_BUILD=1
      ;;
    --output)
      OUTPUT_ROOT="${2:-}"
      shift
      ;;
    --count)
      COUNT_PER_EPISODE="${2:-}"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

if [[ -z "$OUTPUT_ROOT" || -z "$COUNT_PER_EPISODE" ]]; then
  echo "Missing output directory or count." >&2
  usage >&2
  exit 2
fi

mkdir -p "$OUTPUT_ROOT"

if [[ "$NO_BUILD" == "1" ]]; then
  "$ROOT_DIR/script/agentctl.sh" health >/dev/null
else
  "$ROOT_DIR/script/build_and_run.sh" --verify >/tmp/quipslystudio-review-shorts-build.log
fi

python3 - "$BASE_URL" "$OUTPUT_ROOT" "$COUNT_PER_EPISODE" <<'PY'
import json
import os
import sys
import time
from html import escape
import urllib.parse
import urllib.request

base_url = sys.argv[1].rstrip('/')
output_root = sys.argv[2]
count_per_episode = max(1, int(sys.argv[3]))

sessions = [
    ('episode-1-premiere-rescue', 'Episode 1'),
    ('episode-2-native-proof', 'Episode 2'),
    ('episode-3-premiere-rescue', 'Episode 3'),
]


def get_json(path, timeout=30):
    with urllib.request.urlopen(f'{base_url}{path}', timeout=timeout) as response:
        return json.loads(response.read().decode('utf-8'))


def command(path, timeout=30):
    return get_json(path, timeout=timeout)


def wait_for_state(session_name, timeout=30):
    deadline = time.time() + timeout
    last = {}
    while time.time() < deadline:
        last = get_json('/state')
        if last.get('activeSessionName') == session_name and last.get('laneCount', 0) > 0:
            return last
        time.sleep(0.25)
    return last


def wait_for_production_ready(session_name, timeout=90):
    deadline = time.time() + timeout
    last = {}
    last_not_ready_detail = ''
    while time.time() < deadline:
        last = get_json('/state')
        if last.get('activeSessionName') != session_name or last.get('laneCount', 0) <= 0:
            time.sleep(0.25)
            continue
        if last.get('productionReady') is True:
            return last
        detail = last.get('productionReadinessDetail') or ''
        if detail != last_not_ready_detail:
            last_not_ready_detail = detail
        time.sleep(0.5)
    return last


def wait_for_export(timeout=240):
    deadline = time.time() + timeout
    last = {}
    while time.time() < deadline:
        last = get_json('/state')
        status = (last.get('exportState') or {}).get('status') or last.get('exportStatus')
        if status in ('completed', 'failed', 'blocked', 'stalled'):
            return last
        time.sleep(1)
    return last


def mmss(seconds):
    seconds = max(0, int(round(seconds)))
    return f'{seconds // 60:02d}:{seconds % 60:02d}'


def candidate_ranges(state, limit):
    spans = []
    for lane in state.get('lanes') or []:
        if lane.get('mediaKind') != 'video':
            continue
        if lane.get('ignoreForProduction'):
            continue
        if not lane.get('sourceReady'):
            continue
        readiness = (lane.get('sourceReadiness') or '').lower()
        if 'proxy ready' not in readiness:
            continue
        role = (lane.get('role') or '').lower()
        name = (lane.get('name') or '').lower()
        if 'camera' not in role and 'camera' not in name:
            continue
        priority = 0
        offset = float(lane.get('sourceOffset') or 0)
        for tag in lane.get('tags') or []:
            if str(tag.get('type') or '').lower() != 'active':
                continue
            duration = float(tag.get('duration') or 0)
            start = offset + float(tag.get('startTime') or 0)
            if start < 0 or duration < 18:
                continue
            clip_duration = min(45.0, duration)
            if clip_duration < 18:
                continue
            spans.append({
                'start': start,
                'end': start + clip_duration,
                'duration': clip_duration,
                'laneName': lane.get('name') or '',
                'priority': priority,
            })

    spans.sort(key=lambda item: (item['start'], item['priority'], -item['duration']))
    selected = []
    for span in spans:
        if any(abs(span['start'] - existing['start']) < 180 for existing in selected):
            continue
        selected.append(span)
        if len(selected) >= limit:
            break
    return selected


summary = []
for session_name, episode_label in sessions:
    command('/load_session?name=' + urllib.parse.quote(session_name))
    state = wait_for_state(session_name)
    if state.get('activeSessionName') != session_name:
        raise SystemExit(f'{session_name}: did not load; active={state.get("activeSessionName")}')
    state = wait_for_production_ready(session_name)
    if state.get('productionReady') is not True:
        raise SystemExit(f'{session_name}: productionReady is not true: {state.get("productionReadinessDetail")}')

    queue = command('/shorts_queue')
    for clip in queue.get('clips') or []:
        title = clip.get('title') or ''
        if title.startswith('Codex smoke') or title.startswith(f'{episode_label} Review Candidate'):
            command('/shorts_queue_remove?id=' + urllib.parse.quote(clip.get('id', '')))
            time.sleep(0.1)

    queue = command('/shorts_queue')
    added = []
    for index, span in enumerate(candidate_ranges(state, count_per_episode), start=1):
        title = f'{episode_label} Review Candidate {index:02d} - {mmss(span["start"])}'
        command(
            '/shorts_queue_add_range?start='
            + urllib.parse.quote(f'{span["start"]:.3f}')
            + '&end='
            + urllib.parse.quote(f'{span["end"]:.3f}')
            + '&title='
            + urllib.parse.quote(title)
        )
        added.append({**span, 'title': title})
        time.sleep(0.15)

    if not added:
        raise SystemExit(f'{session_name}: no camera-backed candidate ranges found.')

    safe_session = ''.join(ch if ch.isalnum() or ch in '._-' else '-' for ch in session_name)
    output_dir = os.path.join(output_root, safe_session)
    os.makedirs(output_dir, exist_ok=True)
    export_results = []
    for index, candidate in enumerate(added, start=1):
        command('/shorts_queue_select?title=' + urllib.parse.quote(candidate['title']))
        command(
            '/shorts_export_selected?directory='
            + urllib.parse.quote(output_dir)
            + '&basename='
            + urllib.parse.quote(f'{safe_session}-review-short-{index:02d}'),
            timeout=30,
        )
        exported_state = wait_for_export()
        export_state = exported_state.get('exportState') or {}
        export_results.append({
            'title': candidate['title'],
            'status': export_state.get('status'),
            'error': export_state.get('error') or '',
        })
        if export_state.get('status') != 'completed':
            break
    queue_after = command('/shorts_queue')
    outputs = []
    for dirpath, _, filenames in os.walk(output_dir):
        for filename in filenames:
            if filename.endswith('.mp4'):
                path = os.path.join(dirpath, filename)
                outputs.append({'path': path, 'sizeBytes': os.path.getsize(path)})
    outputs.sort(key=lambda item: item['path'])
    command('/save_session?name=' + urllib.parse.quote(session_name))
    summary.append({
        'session': session_name,
        'episode': episode_label,
        'addedCandidateCount': len(added),
        'queueCount': queue_after.get('count'),
        'exportStatus': 'completed' if export_results and all(item['status'] == 'completed' for item in export_results) else 'failed',
        'exportError': '; '.join(item['error'] for item in export_results if item['error']),
        'outputCount': len(outputs),
        'outputs': outputs,
        'addedCandidates': added,
        'exportResults': export_results,
    })

failures = [item for item in summary if item['exportStatus'] != 'completed' or item['outputCount'] == 0]
manifest = {
    'status': 'pass' if not failures else 'failed',
    'outputRoot': output_root,
    'generatedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
    'sessions': summary,
    'architectureInvariant': 'Review shorts are sequence-time metadata recipes exported as 9:16 derivatives from whole proxy-backed source lanes.',
    'nextHumanActions': [
        'Open index.html and watch the candidates.',
        'Mark each candidate keep, reject, or refine in your notes.',
        'Use the candidate title and timestamp to reopen the same recipe in QuipslyStudio.',
        'Do not treat these as final editorial picks until a human reviews them.',
        'After downloading decisions JSON, import it with: script/import_review_short_decisions.py /path/to/review-shorts-decisions.json --execute --save',
    ],
}
manifest_path = os.path.join(output_root, 'review-shorts-manifest.json')
with open(manifest_path, 'w') as handle:
    json.dump(manifest, handle, indent=2, sort_keys=True)

cards = []
for session in summary:
    candidates = session.get('addedCandidates') or []
    outputs = session.get('outputs') or []
    by_index = list(zip(candidates, outputs))
    for index, (candidate, output) in enumerate(by_index, start=1):
        rel_video = os.path.relpath(output.get('path', ''), output_root)
        duration = float(candidate.get('duration') or 0)
        candidate_id = f"{session.get('session', 'session')}::{candidate.get('title', 'candidate')}"
        cards.append(f'''
          <article class="clip-card" data-candidate-id="{escape(candidate_id)}" data-review-status="needs-review">
            <div class="clip-copy">
              <p class="eyebrow">{escape(session.get('episode', 'Episode'))} · Candidate {index:02d}</p>
              <h2>{escape(candidate.get('title', 'Untitled candidate'))}</h2>
              <p><strong>Source lane:</strong> {escape(candidate.get('laneName', 'Unknown lane'))}</p>
              <p><strong>Sequence range:</strong> {candidate.get('start', 0):.2f}s → {candidate.get('end', 0):.2f}s · {duration:.1f}s</p>
              <p><strong>Review status:</strong> <span class="status" data-status-label>Needs human review</span></p>
              <div class="review-actions" role="group" aria-label="Review actions for {escape(candidate.get('title', 'candidate'))}">
                <button type="button" data-review-action="keep">Keep</button>
                <button type="button" data-review-action="refine">Refine</button>
                <button type="button" data-review-action="reject">Reject</button>
              </div>
              <label class="note-label">
                Notes for editor or Quipsly
                <textarea data-review-notes placeholder="Why keep it? What needs trimming, captions, hook, or crop cleanup?"></textarea>
              </label>
            </div>
            <video controls preload="metadata" src="{escape(rel_video)}"></video>
          </article>
        ''')

index_path = os.path.join(output_root, 'index.html')
with open(index_path, 'w') as handle:
    handle.write(f'''<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Quipsly Review Shorts · Episodes 1-3</title>
  <style>
    :root {{
      color-scheme: dark;
      --bg: #151b18;
      --panel: #202923;
      --panel-2: #29352d;
      --ink: #f4ead2;
      --muted: #c3b99f;
      --leaf: #8ddf9a;
      --gold: #f3c746;
      --line: rgba(244, 234, 210, 0.16);
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      background:
        radial-gradient(circle at top left, rgba(141, 223, 154, 0.18), transparent 32rem),
        radial-gradient(circle at top right, rgba(243, 199, 70, 0.13), transparent 34rem),
        var(--bg);
      color: var(--ink);
      font-family: ui-rounded, "Avenir Next", "Trebuchet MS", system-ui, sans-serif;
    }}
    header {{
      padding: 42px clamp(20px, 5vw, 72px) 24px;
      border-bottom: 1px solid var(--line);
    }}
    .eyebrow {{
      margin: 0 0 8px;
      color: var(--gold);
      font-size: 12px;
      font-weight: 900;
      letter-spacing: 0.24em;
      text-transform: uppercase;
    }}
    h1 {{
      margin: 0;
      max-width: 980px;
      font-size: clamp(34px, 5vw, 74px);
      line-height: 0.95;
      letter-spacing: -0.055em;
    }}
    .lede {{
      max-width: 920px;
      color: var(--muted);
      font-size: 18px;
      line-height: 1.55;
    }}
    .review-toolbar {{
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
      margin-top: 22px;
    }}
    .review-toolbar button,
    .review-actions button {{
      appearance: none;
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 10px 14px;
      color: var(--ink);
      background: rgba(244, 234, 210, 0.08);
      font-weight: 900;
      letter-spacing: 0.03em;
      cursor: pointer;
    }}
    .review-toolbar button:hover,
    .review-actions button:hover {{
      border-color: rgba(141, 223, 154, 0.52);
      background: rgba(141, 223, 154, 0.13);
    }}
    .review-toolbar .download {{
      color: #122016;
      background: var(--leaf);
      border-color: rgba(141, 223, 154, 0.72);
    }}
    .toolbar-hint {{
      color: var(--muted);
      font-size: 13px;
    }}
    main {{
      display: grid;
      gap: 22px;
      padding: 28px clamp(20px, 5vw, 72px) 72px;
    }}
    .clip-card {{
      display: grid;
      grid-template-columns: minmax(260px, 0.85fr) minmax(260px, 360px);
      gap: 24px;
      align-items: center;
      padding: 20px;
      background: linear-gradient(145deg, rgba(32, 41, 35, 0.96), rgba(41, 53, 45, 0.86));
      border: 1px solid var(--line);
      border-radius: 26px;
      box-shadow: 0 20px 70px rgba(0, 0, 0, 0.22);
    }}
    .clip-card h2 {{
      margin: 0 0 12px;
      font-size: clamp(22px, 3vw, 36px);
      line-height: 1.03;
      letter-spacing: -0.035em;
    }}
    .clip-card p {{
      margin: 8px 0;
      color: var(--muted);
    }}
    .status {{
      color: var(--leaf);
      font-weight: 800;
    }}
    .clip-card[data-review-status="keep"] {{
      border-color: rgba(141, 223, 154, 0.62);
      box-shadow: 0 22px 76px rgba(68, 192, 98, 0.14);
    }}
    .clip-card[data-review-status="refine"] {{
      border-color: rgba(243, 199, 70, 0.7);
      box-shadow: 0 22px 76px rgba(243, 199, 70, 0.12);
    }}
    .clip-card[data-review-status="reject"] {{
      opacity: 0.62;
      border-color: rgba(255, 116, 116, 0.55);
    }}
    .clip-card[data-review-status="reject"] video {{
      filter: grayscale(0.85);
    }}
    .review-actions {{
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 14px 0;
    }}
    .note-label {{
      display: block;
      margin-top: 12px;
      color: var(--muted);
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0.04em;
    }}
    textarea {{
      display: block;
      width: 100%;
      min-height: 96px;
      margin-top: 8px;
      padding: 12px;
      resize: vertical;
      color: var(--ink);
      background: rgba(5, 8, 7, 0.36);
      border: 1px solid var(--line);
      border-radius: 16px;
      font: inherit;
      line-height: 1.35;
    }}
    video {{
      width: 100%;
      aspect-ratio: 9 / 16;
      max-height: 70vh;
      border-radius: 22px;
      background: #050807;
      border: 1px solid rgba(141, 223, 154, 0.28);
    }}
    footer {{
      padding: 0 clamp(20px, 5vw, 72px) 48px;
      color: var(--muted);
    }}
    @media (max-width: 860px) {{
      .clip-card {{ grid-template-columns: 1fr; }}
      video {{ max-height: none; }}
    }}
  </style>
</head>
<body>
  <header>
    <p class="eyebrow">Quipsly review packet</p>
    <h1>Episodes 1-3 first-pass social shorts.</h1>
    <p class="lede">These are review candidates, not final editorial endorsements. Each clip is a 9:16 derivative exported from a sequence-time recipe over whole proxy-backed lanes. Originals remain untouched.</p>
    <div class="review-toolbar" aria-label="Review packet controls">
      <button type="button" data-filter="all">All</button>
      <button type="button" data-filter="needs-review">Needs review</button>
      <button type="button" data-filter="keep">Keep</button>
      <button type="button" data-filter="refine">Refine</button>
      <button type="button" data-filter="reject">Reject</button>
      <button type="button" class="download" data-download-decisions>Download review decisions JSON</button>
      <span class="toolbar-hint" data-count-summary></span>
    </div>
  </header>
  <main>
    {''.join(cards)}
  </main>
  <footer>
    <p>Manifest: review-shorts-manifest.json · Generated {escape(manifest['generatedAt'])}</p>
  </footer>
  <script>
    const STORAGE_KEY = "quipsly.reviewShorts.{escape(os.path.basename(output_root))}.v1";
    const cards = Array.from(document.querySelectorAll("[data-candidate-id]"));
    const labels = {{
      "needs-review": "Needs human review",
      keep: "Keep",
      refine: "Refine",
      reject: "Reject"
    }};

    function readState() {{
      try {{
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{{}}");
      }} catch {{
        return {{}};
      }}
    }}

    function writeState(state) {{
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state, null, 2));
    }}

    function applyCardState(card, record) {{
      const status = record.status || "needs-review";
      card.dataset.reviewStatus = status;
      const label = card.querySelector("[data-status-label]");
      if (label) label.textContent = labels[status] || status;
      const notes = card.querySelector("[data-review-notes]");
      if (notes && document.activeElement !== notes) notes.value = record.notes || "";
    }}

    function updateCounts() {{
      const state = readState();
      const counts = {{ "needs-review": 0, keep: 0, refine: 0, reject: 0 }};
      cards.forEach((card) => {{
        const record = state[card.dataset.candidateId] || {{}};
        const status = record.status || "needs-review";
        counts[status] = (counts[status] || 0) + 1;
      }});
      const summary = document.querySelector("[data-count-summary]");
      if (summary) {{
        summary.textContent = `${{counts.keep}} keep · ${{counts.refine}} refine · ${{counts.reject}} reject · ${{counts["needs-review"]}} still need review`;
      }}
    }}

    function hydrate() {{
      const state = readState();
      cards.forEach((card) => {{
        applyCardState(card, state[card.dataset.candidateId] || {{}});
      }});
      updateCounts();
    }}

    cards.forEach((card) => {{
      card.addEventListener("click", (event) => {{
        const button = event.target.closest("[data-review-action]");
        if (!button) return;
        const state = readState();
        const id = card.dataset.candidateId;
        const current = state[id] || {{}};
        current.status = button.dataset.reviewAction;
        current.updatedAt = new Date().toISOString();
        state[id] = current;
        writeState(state);
        applyCardState(card, current);
        updateCounts();
      }});
      const notes = card.querySelector("[data-review-notes]");
      if (notes) {{
        notes.addEventListener("input", () => {{
          const state = readState();
          const id = card.dataset.candidateId;
          const current = state[id] || {{}};
          current.notes = notes.value;
          current.updatedAt = new Date().toISOString();
          state[id] = current;
          writeState(state);
          updateCounts();
        }});
      }}
    }});

    document.querySelectorAll("[data-filter]").forEach((button) => {{
      button.addEventListener("click", () => {{
        const filter = button.dataset.filter;
        cards.forEach((card) => {{
          card.hidden = filter !== "all" && card.dataset.reviewStatus !== filter;
        }});
      }});
    }});

    const download = document.querySelector("[data-download-decisions]");
    if (download) {{
      download.addEventListener("click", () => {{
        const state = readState();
        const decisions = cards.map((card) => {{
          const record = state[card.dataset.candidateId] || {{}};
          const heading = card.querySelector("h2");
          const video = card.querySelector("video");
          return {{
            candidateId: card.dataset.candidateId,
            title: heading ? heading.textContent : "",
            status: record.status || "needs-review",
            notes: record.notes || "",
            video: video ? video.getAttribute("src") : "",
            updatedAt: record.updatedAt || ""
          }};
        }});
        const payload = {{
          model: "quipsly-review-shorts-decisions",
          version: "2026-06-18.review-shorts-decisions.v1",
          exportedAt: new Date().toISOString(),
          sourceManifest: "review-shorts-manifest.json",
          decisions
        }};
        const blob = new Blob([JSON.stringify(payload, null, 2)], {{ type: "application/json" }});
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "review-shorts-decisions.json";
        link.click();
        URL.revokeObjectURL(url);
      }});
    }}

    hydrate();
  </script>
</body>
</html>
''')

manifest['manifestPath'] = manifest_path
manifest['reviewIndexPath'] = index_path
with open(manifest_path, 'w') as handle:
    json.dump(manifest, handle, indent=2, sort_keys=True)

print(json.dumps(manifest, indent=2, sort_keys=True))
if failures:
    raise SystemExit(1)
PY
