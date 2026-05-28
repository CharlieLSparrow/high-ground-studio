from google import genai
from google.genai import types
from pydantic import BaseModel, Field
import os
from typing import List

# We assume GOOGLE_API_KEY is available in the environment
# or Vertex AI defaults are used.
try:
    client = genai.Client()
except Exception as e:
    print(f"Warning: Failed to initialize GenAI client: {e}")
    client = None

class VideoClip(BaseModel):
    start_timestamp: str = Field(description="The start timestamp in MM:SS format")
    end_timestamp: str = Field(description="The end timestamp in MM:SS format, clip should be 15-60 seconds")
    title: str = Field(description="A catchy, viral title for this specific short clip")
    viral_potential_score: int = Field(description="Score from 1 to 10 on how engaging this hook is")
    reasoning: str = Field(description="Why this specific clip makes a good short")

class ClipExtractionResponse(BaseModel):
    clips: List[VideoClip]

def extract_video_hooks(gcs_uri: str) -> List[dict]:
    """
    Passes a GCS URI of a video to Gemini 1.5 Pro and asks it to find the best 3 hooks.
    """
    if not client:
        raise RuntimeError("GenAI client not initialized. Ensure GOOGLE_API_KEY is set.")
        
    print(f"Analyzing {gcs_uri} with Gemini 1.5 Pro...")
    
    # We pass the GCS URI directly to Gemini. This requires Vertex AI or File API depending on auth.
    # For simplicity, we use the Part.from_uri structure
    video_part = types.Part.from_uri(
        file_uri=gcs_uri,
        mime_type="video/mp4",
    )
    
    prompt = (
        "You are an expert social media manager and video editor. "
        "Watch this podcast video and identify the 3 most engaging, highly emotional, "
        "or profound moments that would make excellent standalone 15-60 second vertical Shorts/Reels. "
        "Focus on strong hooks and complete thoughts."
    )
    
    response = client.models.generate_content(
        model='gemini-1.5-pro',
        contents=[video_part, prompt],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=ClipExtractionResponse,
            temperature=0.4,
        ),
    )
    
    # Parse the structured JSON response
    try:
        import json
        data = json.loads(response.text)
        return data.get("clips", [])
    except Exception as e:
        print(f"Failed to parse Gemini output: {e}")
        return []
