#!/usr/bin/env python3
from __future__ import annotations

import json
import math
import subprocess
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path('/Volumes/My Passport/Episode 4')
OUT = Path('apps/QuipslyStudio/reports/episode-4-audio-sync-analysis-v2.json')
SESSION = Path.home() / 'Library/Application Support/Quipsly/MediaVault/sessions/episode-4-sync-stack-v1.quipsly-session.json'
CACHE = Path('apps/QuipslyStudio/reports/cache/episode-4-audio-envelopes-v2')
SAMPLE_RATE = 200
WINDOW = 20  # 10 Hz envelope

FILES = [
    'Charlie Ep4.wav',
    'TX00_MIC005_20260226_070456_orig.wav',
    'TX00_MIC006_20260226_073457_orig.wav',
    'TX00_MIC007_20260226_080457_orig.wav',
    'TX00_MIC008_20260226_083457_orig.wav',
    'IMG_3746.MOV',
    'IMG_3749.MOV',
    'IMG_3751.MOV',
    'VID_20260225_163604_00_005.insv',
    'VID_20260225_163604_00_006.insv',
    'VID_20260225_163604_00_007.insv',
]


def path_from_file_url(value: str) -> Path:
    parsed = urlparse(value)
    return Path(unquote(parsed.path))


def proxy_map_from_session() -> dict[str, Path]:
    if not SESSION.exists():
        return {}
    session = json.loads(SESSION.read_text())
    mapping: dict[str, Path] = {}
    sequences = (session.get('project') or {}).get('sequences') or []
    for lane in ((sequences[0] if sequences else {}).get('lanes') or []):
        name = lane.get('name') or ''
        source = (lane.get('metadata') or {}).get('sourcePath')
        source_name = Path(source).name if source else ''
        proxy = ((lane.get('sourceVideo') or {}).get('proxyURL') or '')
        if proxy:
            proxy_path = path_from_file_url(proxy)
            if proxy_path.exists():
                mapping[source_name] = proxy_path
                mapping[name] = proxy_path
    return mapping


PROXIES = proxy_map_from_session()


def has_audio(path: Path) -> bool:
    try:
        data = subprocess.check_output([
            'ffprobe', '-v', 'error', '-select_streams', 'a',
            '-show_entries', 'stream=index', '-of', 'json', str(path)
        ], text=True)
        return bool(json.loads(data).get('streams') or [])
    except Exception:
        return False


def probe_duration(path: Path) -> float:
    data = subprocess.check_output([
        'ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', str(path)
    ], text=True)
    return float((json.loads(data).get('format') or {}).get('duration') or 0.0)


def envelope(path: Path) -> list[float]:
    CACHE.mkdir(parents=True, exist_ok=True)
    cache_key = f"{path.name}-{int(path.stat().st_size)}-{int(path.stat().st_mtime)}.json"
    cache_name = ''.join(ch if ch.isalnum() or ch in '._-' else '_' for ch in cache_key)
    cache_path = CACHE / cache_name
    if cache_path.exists():
        return json.loads(cache_path.read_text())
    cmd = [
        'ffmpeg', '-hide_banner', '-loglevel', 'error', '-i', str(path),
        '-map', '0:a:0', '-ac', '1', '-ar', str(SAMPLE_RATE), '-f', 's16le', 'pipe:1'
    ]
    raw = subprocess.check_output(cmd)
    vals = []
    # little-endian signed 16-bit
    for i in range(0, len(raw) - 1, 2):
        v = int.from_bytes(raw[i:i+2], 'little', signed=True) / 32768.0
        vals.append(v)
    env = []
    for i in range(0, len(vals), WINDOW):
        chunk = vals[i:i+WINDOW]
        if not chunk:
            continue
        env.append(math.sqrt(sum(v*v for v in chunk) / len(chunk)))
    # light compression reduces one loud bump dominating the whole match
    result = [math.log1p(v * 50.0) for v in env]
    cache_path.write_text(json.dumps(result))
    return result


def downsample(arr: list[float], factor: int) -> list[float]:
    return [sum(arr[i:i+factor]) / max(1, len(arr[i:i+factor])) for i in range(0, len(arr), factor)]


def prefix(arr: list[float]) -> tuple[list[float], list[float]]:
    s = [0.0]
    q = [0.0]
    for v in arr:
        s.append(s[-1] + v)
        q.append(q[-1] + v*v)
    return s, q


def normalized_match(spine: list[float], cand: list[float], lag_min: int, lag_max: int) -> dict:
    if not spine or not cand:
        return {'lag': 0, 'score': 0.0, 'status': 'no-audio'}
    n = len(cand)
    lag_min = max(0, lag_min)
    lag_max = min(len(spine) - n, lag_max)
    if lag_max < lag_min:
        return {'lag': 0, 'score': 0.0, 'status': 'out-of-range'}
    c_mean = sum(cand) / n
    c0 = [v - c_mean for v in cand]
    c_norm = math.sqrt(sum(v*v for v in c0)) or 1.0
    ps, pq = prefix(spine)
    best_lag = lag_min
    best_score = -999.0
    # Plain loops are fine at this low envelope rate; correctness beats cleverness here.
    for lag in range(lag_min, lag_max + 1):
        seg_sum = ps[lag+n] - ps[lag]
        seg_sq = pq[lag+n] - pq[lag]
        seg_var = max(0.0, seg_sq - (seg_sum * seg_sum / n))
        seg_norm = math.sqrt(seg_var) or 1.0
        dot = 0.0
        # c0 mean is zero, so no need to subtract the segment mean inside dot.
        for j, cv in enumerate(c0):
            dot += spine[lag+j] * cv
        score = dot / (seg_norm * c_norm)
        if score > best_score:
            best_score = score
            best_lag = lag
    return {'lag': best_lag, 'score': best_score, 'status': 'matched'}


def align(spine_env: list[float], cand_env: list[float], expected_seconds: float | None = None, full_search: bool = False) -> dict:
    # Coarse at 2 Hz, then fine at 10 Hz around the coarse winner.
    coarse_factor = 5
    s2 = downsample(spine_env, coarse_factor)
    c2 = downsample(cand_env, coarse_factor)
    if expected_seconds is None or full_search:
        lag_min = 0
        lag_max = max(0, len(s2) - len(c2))
    else:
        expected_lag = int(round(expected_seconds * 2))
        lag_min = expected_lag - 360  # +/- 180s
        lag_max = expected_lag + 360
    coarse = normalized_match(s2, c2, lag_min, lag_max)
    coarse_seconds = coarse['lag'] / 2.0
    fine_center = int(round(coarse_seconds * 10))
    fine = normalized_match(spine_env, cand_env, fine_center - 80, fine_center + 80)
    return {
        'offsetSeconds': round(fine['lag'] / 10.0, 3),
        'coarseOffsetSeconds': round(coarse_seconds, 3),
        'score': round(fine['score'], 5),
        'coarseScore': round(coarse['score'], 5),
        'status': fine['status'],
    }


def main():
    durations = {name: probe_duration(ROOT / name) for name in FILES}
    envs = {}
    for name in FILES:
        source_path = ROOT / name
        proxy_path = PROXIES.get(name)
        analysis_path = proxy_path if proxy_path and has_audio(proxy_path) else source_path
        via = 'proxy' if analysis_path != source_path else 'source'
        print(f'extracting {name} via {via}: {analysis_path}', flush=True)
        envs[name] = envelope(analysis_path)
    spine = envs['Charlie Ep4.wav']
    tx1_expected = durations['Charlie Ep4.wav'] - (
        durations['TX00_MIC005_20260226_070456_orig.wav'] + 1.0 +
        durations['TX00_MIC006_20260226_073457_orig.wav'] +
        durations['TX00_MIC007_20260226_080457_orig.wav'] +
        durations['TX00_MIC008_20260226_083457_orig.wav']
    )
    expected = {
        'TX00_MIC005_20260226_070456_orig.wav': tx1_expected,
        'TX00_MIC006_20260226_073457_orig.wav': tx1_expected + 1801,
        'TX00_MIC007_20260226_080457_orig.wav': tx1_expected + 3601,
        'TX00_MIC008_20260226_083457_orig.wav': tx1_expected + 5401,
        'VID_20260225_163604_00_005.insv': tx1_expected,
        'VID_20260225_163604_00_006.insv': tx1_expected + 1799,
        'VID_20260225_163604_00_007.insv': tx1_expected + 3598,
    }
    results = {}
    for name in FILES:
        if name == 'Charlie Ep4.wav':
            results[name] = {'offsetSeconds': 0.0, 'score': 1.0, 'status': 'spine'}
            continue
        is_short_phone = name.startswith('IMG_')
        res = align(spine, envs[name], expected_seconds=expected.get(name), full_search=is_short_phone)
        res['expectedSeconds'] = round(expected[name], 3) if name in expected else None
        res['durationSeconds'] = round(durations[name], 3)
        results[name] = res
        print(name, res, flush=True)
    payload = {
        'model': 'episode-4-audio-sync-analysis-v2',
        'sourceRoot': str(ROOT),
        'spine': 'Charlie Ep4.wav',
        'durationSeconds': {k: round(v, 3) for k, v in durations.items()},
        'tx1ExpectedFromDurationTailMatchSeconds': round(tx1_expected, 3),
        'results': results,
        'truth': 'Audio-envelope correlation evidence only. It does not mutate sessions or source media.',
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=2, sort_keys=True) + '\n')
    print(json.dumps({'ok': True, 'output': str(OUT), 'tx1Expected': tx1_expected}, indent=2))

if __name__ == '__main__':
    main()
