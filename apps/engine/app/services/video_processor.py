import ffmpeg
import os
from typing import List, Dict

async def slice_video_shorts(input_video_path: str, timestamps: List[Dict[str, str]], output_dir: str) -> List[str]:
    """
    Uses FFmpeg to physically slice a long video into multiple Shorts/Reels based on Gemini timestamps.
    
    Args:
        input_video_path: Local path to the downloaded long video.
        timestamps: List of dicts like [{"start_timestamp": "00:01:10", "end_timestamp": "00:01:45", "title": "Great Hook"}]
        output_dir: Directory to save the clipped shorts.
        
    Returns:
        List of local paths to the newly generated short clips.
    """
    output_files = []
    
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
        
    for i, clip in enumerate(timestamps):
        start_time = clip.get("start_timestamp")
        end_time = clip.get("end_timestamp")
        safe_title = "".join([c for c in clip.get("title", f"clip_{i}") if c.isalnum() or c in " _-"]).rstrip().replace(" ", "_")
        
        output_filename = os.path.join(output_dir, f"{safe_title}_{i}.mp4")
        
        # Center crop to 9:16 aspect ratio (ih*9/16:ih) and re-encode
        try:
            (
                ffmpeg
                .input(input_video_path, ss=start_time, to=end_time)
                .filter('crop', 'ih*9/16', 'ih')
                .output(output_filename, vcodec='libx264', acodec='aac', strict='experimental')
                .overwrite_output()
                .run(capture_stdout=True, capture_stderr=True)
            )
            output_files.append(output_filename)
        except ffmpeg.Error as e:
            print(f"FFmpeg error: {e.stderr.decode('utf-8')}")
            # Handle error
            pass
            
    return output_files
