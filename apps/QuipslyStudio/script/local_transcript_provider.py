#!/usr/bin/env python3
"""Local transcript provider command for QuipslyStudio.

QuipslyStudio calls a transcript provider as:

    local_transcript_provider.py /absolute/path/to/media

The provider must print parseable transcript text to stdout. This script keeps
that boundary small and honest:

- If a .srt/.vtt/.json sidecar sits next to the media, print it.
- If local Whisper packages are installed, run them and print Quipsly JSON.
- If no provider is available, fail with a calm, actionable error.

It intentionally does not mutate source media. Optional sidecar writing goes to
an explicit output path/folder only.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import subprocess
import shutil
import sys
import tempfile
from pathlib import Path
from typing import Any


SIDE_CAR_EXTENSIONS = (".json", ".vtt", ".srt")
DEFAULT_WHISPER_MODEL_DIR = Path.home() / "Library/Application Support/QuipslyStudio/WhisperModels"
DEFAULT_WHISPER_CPP_MODEL_NAME = "ggml-base.en.bin"


def module_available(name: str) -> bool:
    return importlib.util.find_spec(name) is not None


def provider_doctor() -> dict[str, Any]:
    whisper_cli = os.environ.get("QUIPSLY_WHISPER_CLI_PATH") or shutil.which("whisper") or ""
    whisper_cpp_cli = (
        os.environ.get("QUIPSLY_WHISPER_CPP_CLI_PATH")
        or shutil.which("whisper-cli")
        or shutil.which("whisper-cpp")
        or ""
    )
    whisper_cpp_model = whisper_cpp_model_path()
    python_whisper_available = module_available("whisper")
    mlx_whisper_available = module_available("mlx_whisper")
    whisper_cpp_available = bool(whisper_cpp_cli and whisper_cpp_model and whisper_cpp_model.exists())
    return {
        "packetType": "quipslystudio-local-transcript-provider-doctor",
        "ffmpegPath": shutil.which("ffmpeg") or "",
        "ffprobePath": shutil.which("ffprobe") or "",
        "available": bool(python_whisper_available or mlx_whisper_available or whisper_cli or whisper_cpp_available),
        "pythonWhisperAvailable": python_whisper_available,
        "mlxWhisperAvailable": mlx_whisper_available,
        "whisperCliPath": whisper_cli,
        "whisperCppCliPath": whisper_cpp_cli,
        "whisperCppModelPath": str(whisper_cpp_model) if whisper_cpp_model else "",
        "whisperCppModelExists": bool(whisper_cpp_model and whisper_cpp_model.exists()),
        "whisperCppAvailable": whisper_cpp_available,
        "defaultProvider": os.environ.get("QUIPSLY_TRANSCRIPT_PROVIDER", "auto"),
        "defaultModel": os.environ.get("QUIPSLY_TRANSCRIPT_MODEL", "base"),
        "defaultLanguage": os.environ.get("QUIPSLY_TRANSCRIPT_LANGUAGE", "en"),
        "sidecarExtensions": list(SIDE_CAR_EXTENSIONS),
        "truth": (
            "This command is a transcript provider bridge. It prints transcript "
            "metadata to stdout for QuipslyStudio; it does not cut media or edit "
            "the timeline."
        ),
    }


def find_sidecar(media_path: Path) -> Path | None:
    base = media_path.with_suffix("")
    for extension in SIDE_CAR_EXTENSIONS:
        candidate = base.with_suffix(extension)
        if candidate.exists() and candidate.is_file() and candidate.stat().st_size > 0:
            return candidate
    return None


def whisper_cpp_model_path() -> Path | None:
    explicit = os.environ.get("QUIPSLY_WHISPER_CPP_MODEL", "").strip()
    if explicit:
        return Path(explicit).expanduser().resolve()

    model_name = os.environ.get("QUIPSLY_WHISPER_CPP_MODEL_NAME", DEFAULT_WHISPER_CPP_MODEL_NAME).strip()
    candidate = DEFAULT_WHISPER_MODEL_DIR / model_name
    if candidate.exists():
        return candidate
    return candidate


def fail(message: str, code: int = 1) -> None:
    print(message, file=sys.stderr)
    raise SystemExit(code)


def clean_word(raw: Any) -> str:
    return str(raw or "").strip()


def whisper_result_to_quipsly_json(result: dict[str, Any], provider: str, model: str, language: str) -> str:
    segments: list[dict[str, Any]] = []
    for segment in result.get("segments") or []:
        start = float(segment.get("start") or 0)
        end = float(segment.get("end") or start)
        text = str(segment.get("text") or "").strip()
        if not text or end <= start:
            continue

        words: list[dict[str, Any]] = []
        for word in segment.get("words") or []:
            label = clean_word(word.get("word") or word.get("text"))
            word_start = float(word.get("start") or start)
            word_end = float(word.get("end") or word_start)
            if not label or word_end <= word_start:
                continue
            words.append(
                {
                    "word": label,
                    "start": word_start,
                    "end": word_end,
                    "confidence": word.get("probability") or word.get("confidence"),
                    "source": f"{provider}-word-timing",
                }
            )

        segments.append(
            {
                "speaker": "Speaker",
                "start": start,
                "end": end,
                "text": text,
                "words": words,
                "confidence": segment.get("avg_logprob"),
                "reviewStatus": "asr-draft",
            }
        )

    if not segments:
        fail(f"{provider} produced no usable transcript segments.", code=3)

    return json.dumps(
        {
            "provider": provider,
            "model": model,
            "language": language,
            "segments": segments,
            "truth": (
                "Generated transcript is ASR draft metadata. Review before "
                "publication captions or quote extraction."
            ),
        },
        ensure_ascii=False,
    )


def run_python_whisper(media_path: Path, model_name: str, language: str) -> str:
    import whisper  # type: ignore

    model = whisper.load_model(model_name)
    result = model.transcribe(
        str(media_path),
        language=language or None,
        word_timestamps=True,
        verbose=False,
    )
    return whisper_result_to_quipsly_json(result, "openai-whisper-local", model_name, language)


def run_openai_whisper_cli(media_path: Path, model_name: str, language: str) -> str:
    whisper_path = os.environ.get("QUIPSLY_WHISPER_CLI_PATH") or shutil.which("whisper")
    if not whisper_path:
        fail("OpenAI Whisper CLI was not found on PATH.", code=6)

    with tempfile.TemporaryDirectory(prefix="quipsly-whisper-cli-") as tmp:
        command = [
            whisper_path,
            str(media_path),
            "--model",
            model_name,
            "--output_format",
            "json",
            "--output_dir",
            tmp,
        ]
        if language:
            command.extend(["--language", language])
        # Newer OpenAI Whisper emits per-word data when this flag is enabled.
        command.extend(["--word_timestamps", "True"])
        run_command(command, provider_name="OpenAI Whisper CLI")
        json_files = sorted(Path(tmp).glob("*.json"))
        if not json_files:
            fail("OpenAI Whisper CLI completed but produced no JSON transcript.", code=7)
        payload = json.loads(json_files[0].read_text(encoding="utf-8"))
        return whisper_result_to_quipsly_json(payload, "openai-whisper-cli", model_name, language)


def run_mlx_whisper(media_path: Path, model_name: str, language: str) -> str:
    import mlx_whisper  # type: ignore

    result = mlx_whisper.transcribe(
        str(media_path),
        path_or_hf_repo=model_name,
        word_timestamps=True,
        language=language or None,
    )
    return whisper_result_to_quipsly_json(result, "mlx-whisper-local", model_name, language)


def run_whisper_cpp_cli(media_path: Path, model_name: str, language: str) -> str:
    whisper_cpp_path = (
        os.environ.get("QUIPSLY_WHISPER_CPP_CLI_PATH")
        or shutil.which("whisper-cli")
        or shutil.which("whisper-cpp")
    )
    if not whisper_cpp_path:
        fail("whisper.cpp CLI was not found on PATH.", code=8)

    model = whisper_cpp_model_path()
    if model is None:
        fail("whisper.cpp CLI is installed, but no model path could be resolved.", code=9)
    if not model.exists():
        fail(
            f"whisper.cpp model does not exist: {model}. "
            "Run script/setup_local_asr.sh --download-model or set QUIPSLY_WHISPER_CPP_MODEL.",
            code=10,
        )

    with tempfile.TemporaryDirectory(prefix="quipsly-whisper-cpp-") as tmp:
        whisper_input = whisper_cpp_readable_audio(media_path, Path(tmp))
        output_base = Path(tmp) / media_path.stem
        command = [
            whisper_cpp_path,
            "-m",
            str(model),
            "-f",
            str(whisper_input),
            "-osrt",
            "-of",
            str(output_base),
        ]
        if language:
            command.extend(["-l", language])
        run_command(command, provider_name="whisper.cpp CLI")
        srt_path = output_base.with_suffix(".srt")
        if not srt_path.exists():
            # Some builds append .srt to the full output base without replacing suffix.
            candidates = sorted(Path(tmp).glob("*.srt"))
            if candidates:
                srt_path = candidates[0]
        if not srt_path.exists():
            fail("whisper.cpp completed but produced no SRT transcript.", code=11)
        return srt_path.read_text(encoding="utf-8")


def whisper_cpp_readable_audio(media_path: Path, temp_dir: Path) -> Path:
    if media_path.suffix.lower() in {".wav", ".mp3", ".flac", ".ogg"}:
        return media_path

    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        fail(
            f"whisper.cpp cannot read {media_path.suffix or 'this media format'} directly and ffmpeg is missing.",
            code=13,
        )

    wav_path = temp_dir / f"{media_path.stem}.quipsly-whisper.wav"
    command = [
        ffmpeg,
        "-y",
        "-hide_banner",
        "-nostdin",
        "-loglevel",
        "error",
        "-i",
        str(media_path),
        "-ac",
        "1",
        "-ar",
        "16000",
        str(wav_path),
    ]
    run_command(command, provider_name="ffmpeg audio normalization")
    return wav_path


def run_command(command: list[str], provider_name: str) -> None:
    result = subprocess.run(
        command,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if result.returncode != 0:
        stderr = result.stderr.strip()
        stdout = result.stdout.strip()
        detail = stderr or stdout or f"{provider_name} exited with code {result.returncode}."
        fail(detail, code=result.returncode or 12)


def write_optional_sidecar(text: str, output_path: str | None, output_dir: str | None, media_path: Path) -> None:
    target: Path | None = None
    if output_path:
        target = Path(output_path).expanduser().resolve()
    elif output_dir:
        folder = Path(output_dir).expanduser().resolve()
        target = folder / f"{media_path.stem}.quipsly-asr.json"

    if not target:
        return

    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text + "\n", encoding="utf-8")


def transcribe(media_path: Path, provider: str, model: str, language: str) -> str:
    if not media_path.exists() or not media_path.is_file():
        fail(f"Media file is not readable: {media_path}", code=2)

    if provider in {"auto", "sidecar"}:
        sidecar = find_sidecar(media_path)
        if sidecar:
            return sidecar.read_text(encoding="utf-8")
        if provider == "sidecar":
            fail(
                f"No transcript sidecar found next to {media_path.name}. "
                f"Expected one of: {', '.join(SIDE_CAR_EXTENSIONS)}",
                code=4,
            )

    if provider in {"auto", "whisper", "openai-whisper"} and module_available("whisper"):
        return run_python_whisper(media_path, model, language)

    if provider in {"auto", "whisper-cli", "openai-whisper-cli"} and (
        os.environ.get("QUIPSLY_WHISPER_CLI_PATH") or shutil.which("whisper")
    ):
        return run_openai_whisper_cli(media_path, model, language)

    if provider in {"auto", "mlx", "mlx-whisper"} and module_available("mlx_whisper"):
        return run_mlx_whisper(media_path, model, language)

    if provider in {"auto", "whisper-cpp", "whisper.cpp"} and (
        os.environ.get("QUIPSLY_WHISPER_CPP_CLI_PATH")
        or shutil.which("whisper-cli")
        or shutil.which("whisper-cpp")
    ):
        return run_whisper_cpp_cli(media_path, model, language)

    doctor = provider_doctor()
    fail(
        "No local transcript provider is available yet.\n"
        f"Doctor: {json.dumps(doctor, sort_keys=True)}\n"
        "Next actions: place a .srt/.vtt/.json sidecar beside the media, install "
        "a local Whisper provider, or pass a different executable to "
        "script/agentctl.sh transcript-generate-selected.",
        code=5,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Print Quipsly transcript JSON/SRT/VTT for one media file.")
    parser.add_argument("media", nargs="?", help="Absolute media path passed by QuipslyStudio.")
    parser.add_argument("--doctor", action="store_true", help="Print provider availability JSON and exit.")
    parser.add_argument("--provider", default=os.environ.get("QUIPSLY_TRANSCRIPT_PROVIDER", "auto"))
    parser.add_argument("--model", default=os.environ.get("QUIPSLY_TRANSCRIPT_MODEL", "base"))
    parser.add_argument("--language", default=os.environ.get("QUIPSLY_TRANSCRIPT_LANGUAGE", "en"))
    parser.add_argument("--write-sidecar", default=os.environ.get("QUIPSLY_TRANSCRIPT_OUTPUT", ""))
    parser.add_argument("--write-sidecar-dir", default=os.environ.get("QUIPSLY_TRANSCRIPT_OUTPUT_DIR", ""))
    args = parser.parse_args()

    if args.doctor:
        print(json.dumps(provider_doctor(), indent=2, sort_keys=True))
        return 0

    if not args.media:
        parser.error("media is required unless --doctor is used")

    media_path = Path(args.media).expanduser().resolve()
    transcript_text = transcribe(media_path, args.provider.strip().lower(), args.model, args.language)
    write_optional_sidecar(transcript_text, args.write_sidecar or None, args.write_sidecar_dir or None, media_path)
    print(transcript_text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
