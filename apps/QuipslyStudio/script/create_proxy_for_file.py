#!/usr/bin/env python3
import argparse
import json
import os
import re
import platform
import subprocess
import sys
import uuid
from pathlib import Path

FNV_OFFSET = 0xcbf29ce484222325
FNV_PRIME = 0x100000001b3
AUDIO_EXTENSIONS = {'wav', 'aif', 'aiff', 'mp3', 'm4a', 'aac', 'flac'}


def fnv1a64_hex(value: str) -> str:
    h = FNV_OFFSET
    for b in value.encode('utf-8'):
        h ^= b
        h = (h * FNV_PRIME) & 0xFFFFFFFFFFFFFFFF
    return f"{h:016x}"


def safe_filename(value: str) -> str:
    out = ''.join(ch if re.match(r'[A-Za-z0-9._\- ]', ch) else '-' for ch in value)
    out = out.replace(' ', '_').replace('__', '_')
    return out or 'asset'


def proxy_url_for(source: Path, root: Path) -> Path:
    standardized = str(source.resolve(strict=False))
    asset_id = fnv1a64_hex(standardized)
    safe_base = safe_filename(source.stem or asset_id)
    proxy_extension = 'm4a' if is_audio_source(source) else 'mp4'
    return root / 'proxy' / asset_id / f'{safe_base}_proxy.{proxy_extension}'


def is_audio_source(source: Path) -> bool:
    return source.suffix.lower().lstrip('.') in AUDIO_EXTENSIONS


def resolve_ffmpeg(configured: str | None) -> str:
    candidates = []
    if configured:
        candidates.append(configured)
    for entry in os.environ.get('PATH', '').split(os.pathsep):
        if entry:
            candidates.append(str(Path(entry) / 'ffmpeg'))
    candidates.extend(['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg', '/bin/ffmpeg'])
    for candidate in candidates:
        if os.path.isfile(candidate) and os.access(candidate, os.X_OK):
            return candidate
    raise SystemExit('ffmpeg not found. Install ffmpeg or set QUIPSLY_FFMPEG_PATH.')


def ffmpeg_has_encoder(ffmpeg: str, encoder: str) -> bool:
    try:
        completed = subprocess.run(
            [ffmpeg, '-hide_banner', '-encoders'],
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=8,
            check=False,
        )
    except Exception:
        return False
    return encoder in completed.stdout


def video_proxy_command(ffmpeg: str, source: Path, tmp: Path) -> tuple[list[str], str]:
    requested = os.environ.get('QUIPSLY_PROXY_VIDEO_ENCODER', 'auto').strip().lower() or 'auto'
    scale = os.environ.get('QUIPSLY_PROXY_VIDEO_SCALE', '960:-2').strip() or '960:-2'
    fps = os.environ.get('QUIPSLY_PROXY_VIDEO_FPS', '30').strip() or '30'
    hwaccel = os.environ.get('QUIPSLY_PROXY_HWACCEL', '').strip().lower()
    use_videotoolbox = requested in {'auto', 'videotoolbox', 'h264_videotoolbox'}
    if requested == 'libx264':
        use_videotoolbox = False
    if use_videotoolbox:
        use_videotoolbox = platform.system() == 'Darwin' and ffmpeg_has_encoder(ffmpeg, 'h264_videotoolbox')

    common = [
        ffmpeg,
        '-y',
        '-hide_banner',
        '-nostdin',
        '-loglevel', 'error',
    ]
    if hwaccel in {'videotoolbox', 'auto'} and platform.system() == 'Darwin':
        common.extend(['-hwaccel', 'videotoolbox' if hwaccel == 'videotoolbox' else 'auto'])

    common.extend([
        '-i', str(source),
        '-map', '0:v:0',
        '-an',
        '-vf', f'scale={scale},fps={fps}',
    ])
    if use_videotoolbox:
        return common + [
            '-c:v', 'h264_videotoolbox',
            '-allow_sw', '1',
            '-b:v', os.environ.get('QUIPSLY_PROXY_VIDEO_BITRATE', '1800k'),
            '-maxrate', os.environ.get('QUIPSLY_PROXY_VIDEO_MAXRATE', '2400k'),
            '-bufsize', os.environ.get('QUIPSLY_PROXY_VIDEO_BUFSIZE', '3600k'),
            '-pix_fmt', 'yuv420p',
            '-movflags', '+faststart',
            str(tmp),
        ], 'h264_videotoolbox'

    return common + [
        '-c:v', 'libx264',
        '-preset', os.environ.get('QUIPSLY_PROXY_X264_PRESET', 'veryfast'),
        '-crf', os.environ.get('QUIPSLY_PROXY_X264_CRF', '30'),
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        str(tmp),
    ], 'libx264'


def compact(value: str, limit: int = 600) -> str:
    value = value or ''
    if len(value) <= limit:
        return value
    return value[:limit - 3] + '...'


def probe_source_readable(source: Path, timeout_seconds: float) -> tuple[bool, str]:
    if timeout_seconds <= 0:
        return True, ''

    try:
        completed = subprocess.run(
            ['/usr/bin/head', '-c', '16', str(source)],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout_seconds,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return False, f'Source did not open/read first bytes within {timeout_seconds:g}s.'
    except Exception as error:
        return False, f'{type(error).__name__}: {error}'

    if completed.returncode == 0:
        return True, ''

    stderr = completed.stderr.decode('utf-8', errors='replace').strip()
    stdout = completed.stdout.decode('utf-8', errors='replace').strip()
    diagnostic = stderr or stdout or f'head exited {completed.returncode}'
    return False, compact(diagnostic)


def main() -> int:
    parser = argparse.ArgumentParser(description='Create a Quipsly deterministic local proxy outside the sandboxed app.')
    parser.add_argument('source', help='Absolute path to the original media file')
    parser.add_argument('--root', default=os.environ.get('QUIPSLY_MEDIA_VAULT', str(Path.home() / 'Library/Application Support/Quipsly/MediaVault')))
    parser.add_argument('--ffmpeg', default=os.environ.get('QUIPSLY_FFMPEG_PATH'))
    parser.add_argument('--force', action='store_true')
    parser.add_argument(
        '--timeout',
        type=float,
        default=float(os.environ.get('QUIPSLY_PROXY_TIMEOUT_SECONDS', '0') or '0'),
        help='Maximum ffmpeg seconds before failing calmly. 0 means no timeout.',
    )
    parser.add_argument(
        '--probe-timeout',
        type=float,
        default=float(os.environ.get('QUIPSLY_SOURCE_PROBE_TIMEOUT_SECONDS', '8') or '8'),
        help='Maximum seconds for a first-byte source readability probe before ffmpeg. 0 disables the probe.',
    )
    parser.add_argument('--dry-run', action='store_true', help='Print the deterministic proxy path without creating it.')
    parser.add_argument('--json', action='store_true', help='Print source/proxy metadata as JSON.')
    args = parser.parse_args()

    source = Path(args.source)
    if not source.is_file():
        raise SystemExit(f'Missing source file: {source}')

    root = Path(args.root)
    output = proxy_url_for(source, root)
    kind = 'audio' if is_audio_source(source) else 'video'

    if args.dry_run:
        payload = {
            'source': str(source),
            'kind': kind,
            'proxy': str(output),
            'sourceExists': source.is_file(),
            'proxyExists': output.exists(),
            'sourceBytes': source.stat().st_size if source.is_file() else None,
            'proxyBytes': output.stat().st_size if output.exists() else None,
            'wouldGenerate': not output.exists() or args.force,
        }
        if args.json:
            print(json.dumps(payload, indent=2, sort_keys=True))
        else:
            print(output)
        return 0

    output.parent.mkdir(parents=True, exist_ok=True)

    if output.exists() and not args.force:
        if args.json:
            print(json.dumps({
                'source': str(source),
                'kind': kind,
                'proxy': str(output),
                'sourceExists': True,
                'proxyExists': True,
                'generated': False,
                'sourceBytes': source.stat().st_size,
                'proxyBytes': output.stat().st_size,
            }, indent=2, sort_keys=True))
        else:
            print(output)
        return 0

    source_readable, source_read_diagnostic = probe_source_readable(source, args.probe_timeout)
    if not source_readable:
        payload = {
            'source': str(source),
            'kind': kind,
            'proxy': str(output),
            'sourceExists': True,
            'sourceReadable': False,
            'proxyExists': output.exists(),
            'generated': False,
            'probeTimeoutSeconds': args.probe_timeout,
            'error': 'Source exists but is not byte-readable. Keep the whole lane linked, but recover the source or attach a full-length proxy before production editing.',
            'diagnostic': source_read_diagnostic,
        }
        if args.json:
            print(json.dumps(payload, indent=2, sort_keys=True), file=sys.stderr)
        else:
            sys.stderr.write(payload['error'] + '\n')
            if source_read_diagnostic:
                sys.stderr.write(source_read_diagnostic + '\n')
        return 74

    ffmpeg = resolve_ffmpeg(args.ffmpeg)
    tmp = output.with_name(f'.{output.stem}.partial-{uuid.uuid4()}.{output.suffix.lstrip(".")}')
    if tmp.exists():
        tmp.unlink()

    if kind == 'audio':
        cmd = [
            ffmpeg,
            '-y',
            '-hide_banner',
            '-nostdin',
            '-loglevel', 'error',
            '-i', str(source),
            '-map', '0:a:0',
            '-vn',
            '-c:a', 'aac',
            '-b:a', '160k',
            '-ar', '48000',
            '-ac', '2',
            '-movflags', '+faststart',
            str(tmp),
        ]
    else:
        cmd, encoder = video_proxy_command(ffmpeg, source, tmp)

    try:
        try:
            completed = subprocess.run(
                cmd,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                timeout=args.timeout if args.timeout and args.timeout > 0 else None,
            )
        except subprocess.TimeoutExpired as error:
            if tmp.exists():
                tmp.unlink()
            diagnostic = (error.stdout or '').strip() if isinstance(error.stdout, str) else ''
            if args.json:
                print(json.dumps({
                    'source': str(source),
                    'kind': kind,
                    'proxy': str(output),
                    'sourceExists': True,
                    'proxyExists': output.exists(),
                    'generated': False,
                    'timeoutSeconds': args.timeout,
                    'error': f'ffmpeg timed out after {args.timeout:g}s. Source may be offline, partial, or blocked by external storage.',
                    'diagnostic': diagnostic,
                    'encoder': encoder if kind == 'video' else 'aac',
                }, indent=2, sort_keys=True), file=sys.stderr)
            else:
                sys.stderr.write(f'ffmpeg timed out after {args.timeout:g}s for {source}. Source may be offline, partial, or blocked by external storage.\\n')
                if diagnostic:
                    sys.stderr.write(diagnostic + '\\n')
            return 124

        if completed.returncode != 0:
            if tmp.exists():
                tmp.unlink()
            if args.json:
                print(json.dumps({
                    'source': str(source),
                    'kind': kind,
                    'proxy': str(output),
                    'sourceExists': True,
                    'proxyExists': output.exists(),
                    'generated': False,
                    'returncode': completed.returncode,
                    'error': 'ffmpeg proxy generation failed. Source may be unreadable, offline, unsupported, or missing the requested stream.',
                    'diagnostic': completed.stdout.strip(),
                    'encoder': encoder if kind == 'video' else 'aac',
                }, indent=2, sort_keys=True), file=sys.stderr)
            else:
                sys.stderr.write(completed.stdout)
            return completed.returncode
        if output.exists():
            output.unlink()
        tmp.replace(output)
        if args.json:
            print(json.dumps({
                'source': str(source),
                'kind': kind,
                'proxy': str(output),
                'sourceExists': True,
                'proxyExists': True,
                'generated': True,
                'encoder': encoder if kind == 'video' else 'aac',
                'sourceBytes': source.stat().st_size,
                'proxyBytes': output.stat().st_size,
            }, indent=2, sort_keys=True))
        else:
            print(output)
        return 0
    finally:
        if tmp.exists():
            tmp.unlink()


if __name__ == '__main__':
    raise SystemExit(main())
