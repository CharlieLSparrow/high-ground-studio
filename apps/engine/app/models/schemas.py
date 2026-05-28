from pydantic import BaseModel, Field
from typing import Optional, List

class VideoGenerationRequest(BaseModel):
    script: str = Field(..., description="The script or narration for the video.")
    storyboard_prompt: str = Field(..., description="Visual description of what should happen in the video.")
    aspect_ratio: str = Field(default="16:9", description="Aspect ratio, e.g., 16:9, 9:16, 1:1")

class VideoGenerationResponse(BaseModel):
    task_id: str
    status: str
    message: str

class ImageGenerationRequest(BaseModel):
    draft_text: str = Field(..., description="The draft text to base the image prompt on.")
    aspect_ratio: str = Field(default="16:9", description="Aspect ratio, e.g., 16:9, 9:16, 1:1")

class ImageGenerationResponse(BaseModel):
    image_uri: str
    prompt_used: str

class ResearchExtractionRequest(BaseModel):
    document_text: str = Field(..., description="The raw document text or transcript.")
    focus_topic: str = Field(..., description="The topic to extract quotes and insights about.")

class QuotePassport(BaseModel):
    quote: str
    context: str
    themes: List[str]

class ResearchExtractionResponse(BaseModel):
    quotes: List[QuotePassport]
    summary: str

class AutoClipRequest(BaseModel):
    gcs_uri: str = Field(..., description="The gs:// URI of the source podcast video.")
    prompt_focus: str = Field(default="High Engagement Hook", description="The type of clip to look for.")

class GeneratedClip(BaseModel):
    title: str
    viral_potential_score: int
    signed_url: str

class AutoClipResponse(BaseModel):
    clips: List[GeneratedClip]
    message: str
