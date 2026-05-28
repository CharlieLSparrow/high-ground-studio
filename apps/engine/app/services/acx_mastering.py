import ffmpeg
import os

def master_audio_for_acx(input_path: str, output_path: str) -> str:
    """
    Uses FFmpeg's loudnorm filter to master an audio file to meet ACX requirements:
    - Measure between -23dB and -18dB RMS
    - Peak values no higher than -3dB
    - -192kbps or higher MP3 (Constant Bit Rate)
    """
    try:
        (
            ffmpeg
            .input(input_path)
            .filter('loudnorm', I=-20, LRA=11, tp=-3.0)
            .output(output_path, acodec='libmp3lame', ab='192k', ar='44100', ac=1)
            .overwrite_output()
            .run(capture_stdout=True, capture_stderr=True)
        )
        return output_path
    except ffmpeg.Error as e:
        print(f"FFmpeg ACX Mastering error: {e.stderr.decode('utf-8')}")
        raise
