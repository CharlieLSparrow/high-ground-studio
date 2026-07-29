#!/usr/bin/env python3
from __future__ import annotations

import copy
import json
import subprocess
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote, urlparse

SESSION_IN = Path.home() / 'Library/Application Support/Quipsly/MediaVault/sessions/episode-4-sync-stack-v1.quipsly-session.json'
SESSION_OUT = Path.home() / 'Library/Application Support/Quipsly/MediaVault/sessions/episode-4-sync-baseline-v2.quipsly-session.json'
REPORT_OUT = Path('apps/QuipslyStudio/reports/episode-4-sync-baseline-v2-report.json')
ANALYSIS = Path('apps/QuipslyStudio/reports/episode-4-audio-sync-analysis-v2.json')
NS = uuid.UUID('4c843490-4b67-4cd8-891b-000000000004')


def stable_uuid(label: str) -> str:
    return str(uuid.uuid5(NS, label)).upper()


def file_url_to_path(value: str) -> Path:
    return Path(unquote(urlparse(value).path))


def ffprobe_duration(path: Path) -> float:
    try:
        data = json.loads(subprocess.check_output([
            'ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', str(path)
        ], text=True))
        return round(float((data.get('format') or {}).get('duration') or 0.0), 6)
    except Exception:
        return 0.0


def tag(tag_type: str, start: float, duration: float, label: str) -> dict:
    return {
        'id': stable_uuid(f'episode4-v2::{label}::{tag_type}::{start:.3f}::{duration:.3f}'),
        'type': tag_type,
        'startTime': round(max(0.0, start), 6),
        'duration': round(max(0.0, duration), 6),
    }


def source_name(lane: dict) -> str:
    md = lane.get('metadata') or {}
    if md.get('sourcePath'):
        return Path(md['sourcePath']).name
    media_url = (lane.get('sourceVideo') or {}).get('mediaURL') or ''
    return file_url_to_path(media_url).name if media_url else lane.get('name', '')


def source_path(lane: dict) -> Path | None:
    md = lane.get('metadata') or {}
    if md.get('sourcePath'):
        return Path(md['sourcePath'])
    media_url = (lane.get('sourceVideo') or {}).get('mediaURL') or ''
    return file_url_to_path(media_url) if media_url else None


def load_analysis() -> dict:
    if ANALYSIS.exists():
        return json.loads(ANALYSIS.read_text())
    return {'results': {}, 'durationSeconds': {}, 'truth': 'No sync analysis file found.'}


def tx_offsets_from_spine_tail(analysis: dict) -> dict[str, float]:
    durations = analysis.get('durationSeconds') or {}
    spine = float(durations.get('Charlie Ep4.wav') or 0.0)
    names = [
        'TX00_MIC005_20260226_070456_orig.wav',
        'TX00_MIC006_20260226_073457_orig.wav',
        'TX00_MIC007_20260226_080457_orig.wav',
        'TX00_MIC008_20260226_083457_orig.wav',
    ]
    # The recorder filenames/timestamps show 30:01, 30:00, 30:00 gaps between starts.
    start_gap = [0.0, 1801.0, 3601.0, 5401.0]
    tail = start_gap[-1] + float(durations.get(names[-1]) or 0.0)
    base = max(0.0, spine - tail) if spine else 0.0
    return {name: round(base + gap, 3) for name, gap in zip(names, start_gap)}


def segment_order_offsets(analysis: dict, first_offset: float) -> dict[str, float]:
    durations = analysis.get('durationSeconds') or {}
    return {
        'VID_20260225_163604_00_005.insv': round(first_offset, 3),
        'VID_20260225_163604_00_006.insv': round(first_offset + float(durations.get('VID_20260225_163604_00_005.insv') or 0.0), 3),
        'VID_20260225_163604_00_007.insv': round(first_offset + float(durations.get('VID_20260225_163604_00_005.insv') or 0.0) + float(durations.get('VID_20260225_163604_00_006.insv') or 0.0), 3),
    }


def phone_offsets_from_correlation(analysis: dict) -> dict[str, float]:
    results = analysis.get('results') or {}
    offsets = {}
    for name in ['IMG_3746.MOV', 'IMG_3749.MOV', 'IMG_3751.MOV']:
        result = results.get(name) or {}
        offsets[name] = round(float(result.get('offsetSeconds') or 0.0), 3)
    return offsets


def main() -> None:
    if not SESSION_IN.exists():
        raise SystemExit(f'Missing input session: {SESSION_IN}')
    session = json.loads(SESSION_IN.read_text())
    analysis = load_analysis()
    tx_offsets = tx_offsets_from_spine_tail(analysis)
    insta_offsets = segment_order_offsets(analysis, tx_offsets.get('TX00_MIC005_20260226_070456_orig.wav', 0.0))
    phone_offsets = phone_offsets_from_correlation(analysis)
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z')

    patched = copy.deepcopy(session)
    patched['savedAt'] = now
    patched['project']['id'] = stable_uuid('project::episode-4-sync-baseline-v2')
    patched['project']['title'] = 'Episode 4 Sync Baseline v2'
    sequence = patched['project']['sequences'][0]
    sequence['id'] = stable_uuid('sequence::episode-4-sync-baseline-v2')
    patched['activeSequenceId'] = sequence['id']
    sequence['title'] = 'Episode 4 Sync Baseline v2'
    sequence['editPassContext'] = {
        'label': 'Episode 4 sync baseline v2',
        'actor': 'Codex',
        'actorType': 'agent',
        'passNumber': 2,
        'goal': 'Repair the v1 assembled stack into a safer synchronized baseline: real durations, evidence-backed offsets, and only the spine audio active by default.',
        'status': 'active',
        'startedAt': now,
        'updatedAt': now,
    }
    sequence.setdefault('editCorrectionNotes', []).append({
        'id': stable_uuid(f'episode4-v2-note::{now}'),
        'actor': 'Codex',
        'actorType': 'agent',
        'category': 'sync-repair',
        'createdAt': now,
        'note': 'v1 was an assembled stack, not verified sync: durations and offsets were zero. v2 writes durations/offset evidence and prevents non-spine audio from playing over the program until promoted.',
        'playhead': 0,
    })

    results = analysis.get('results') or {}
    duration_map = analysis.get('durationSeconds') or {}
    lane_report = []
    sequence_duration = 0.0
    for lane in sequence.get('lanes') or []:
        name = source_name(lane)
        path = source_path(lane)
        md = lane.setdefault('metadata', {})
        sv = lane.setdefault('sourceVideo', {})
        duration = float(duration_map.get(name) or (ffprobe_duration(path) if path else 0.0) or 0.0)
        role = md.get('role') or ''
        kind = md.get('mediaKind') or 'unknown'
        ignore = bool(md.get('ignoreForProduction'))

        if name == 'Charlie Ep4.wav' or role == 'spine_audio':
            offset = 0.0
            sync_source = 'spine'
            confidence = 'canonical-spine'
            tag_type = 'Active'
        elif name in tx_offsets:
            offset = tx_offsets[name]
            sync_source = 'tx-recorder-start-order-tail-fit'
            confidence = 'review-needed-nonprogram-audio'
            tag_type = 'Cut'
        elif name in insta_offsets:
            offset = insta_offsets[name]
            sync_source = 'insta360-segment-order-from-tx-baseline'
            confidence = 'review-needed-source-monitor'
            tag_type = 'Cut'
        elif name in phone_offsets:
            offset = phone_offsets[name]
            sync_source = 'audio-envelope-correlation-candidate'
            score = float((results.get(name) or {}).get('score') or 0.0)
            confidence = 'candidate' if score >= 0.18 else 'low-confidence-review-needed'
            tag_type = 'Cut'
        else:
            offset = 0.0
            sync_source = 'held-or-unknown'
            confidence = 'held' if ignore else 'unknown-review-needed'
            tag_type = 'Cut'

        sv['duration'] = round(duration, 6)
        sv['offset'] = round(offset, 6)
        md['syncV2'] = {
            'offsetSeconds': round(offset, 6),
            'durationSeconds': round(duration, 6),
            'syncSource': sync_source,
            'confidence': confidence,
            'analysisResult': results.get(name) or {},
            'policy': 'Only spine audio is active by default. Non-spine audio and all visual lanes remain whole-source metadata until intentionally promoted.',
        }
        if duration > 0:
            lane['tags'] = [tag(tag_type, 0, duration, lane.get('name') or name)]
        else:
            lane['tags'] = []
        sequence_duration = max(sequence_duration, offset + duration)
        lane_report.append({
            'lane': lane.get('name'),
            'sourceName': name,
            'role': role,
            'kind': kind,
            'ignoreForProduction': ignore,
            'offsetSeconds': round(offset, 3),
            'durationSeconds': round(duration, 3),
            'tagType': tag_type,
            'syncSource': sync_source,
            'confidence': confidence,
            'analysisScore': (results.get(name) or {}).get('score'),
        })

    sequence['metadata'] = {
        **(sequence.get('metadata') or {}),
        'syncBaselineV2': {
            'createdAt': now,
            'sequenceDurationSeconds': round(sequence_duration, 3),
            'analysisPath': str(ANALYSIS),
            'reportPath': str(REPORT_OUT),
            'sessionPath': str(SESSION_OUT),
            'truth': 'This is a synchronized baseline repair, not a final edit. Sources stay whole and original media is untouched.',
        },
    }

    SESSION_OUT.write_text(json.dumps(patched, indent=2) + '\n')
    report = {
        'ok': True,
        'model': 'episode-4-sync-baseline-v2',
        'createdAt': now,
        'inputSession': str(SESSION_IN),
        'outputSession': str(SESSION_OUT),
        'analysisPath': str(ANALYSIS),
        'sequenceDurationSeconds': round(sequence_duration, 3),
        'laneCount': len(lane_report),
        'activeAudioPolicy': 'Charlie Audio Spine is the only Active audio tag by default. TX/other audio is visible but Cut until intentionally promoted.',
        'nonClaims': [
            'Not a final edit.',
            'Not a publication-ready sync claim for every source.',
            'Not a destructive media mutation.',
        ],
        'laneReport': lane_report,
        'nextActions': [
            'Load episode-4-sync-baseline-v2 in Quipsly Studio.',
            'Confirm Program Output no longer plays every audio source at once.',
            'Review Source Grove at known talk moments and promote visual SHOW decisions only after human/agent review.',
            'If TX audio should replace or mix with Charlie spine, do that as an explicit later audio decision after listen proof.',
        ],
    }
    REPORT_OUT.parent.mkdir(parents=True, exist_ok=True)
    REPORT_OUT.write_text(json.dumps(report, indent=2, sort_keys=True) + '\n')
    print(json.dumps(report, indent=2, sort_keys=True))


if __name__ == '__main__':
    main()
