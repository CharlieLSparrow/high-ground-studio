from fastapi import APIRouter, HTTPException, BackgroundTasks
from app.models.schemas import (
    VideoGenerationRequest, VideoGenerationResponse, 
    ImageGenerationRequest, ImageGenerationResponse,
    AutoClipRequest, AutoClipResponse, GeneratedClip
)
from app.services import video_generator, image_generator

router = APIRouter()

@router.post("/generate-video", response_model=VideoGenerationResponse)
async def generate_video(request: VideoGenerationRequest, background_tasks: BackgroundTasks):
    try:
        # In a real app, this might kick off an async task and return a task ID
        # For now, we simulate starting the Vertex AI Veo job.
        task_id = "simulated-task-id-123"
        background_tasks.add_task(video_generator.generate_video_task, request.script, request.storyboard_prompt, request.aspect_ratio, task_id)
        return VideoGenerationResponse(task_id=task_id, status="processing", message="Video generation started.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/generate-image", response_model=ImageGenerationResponse)
async def generate_image(request: ImageGenerationRequest):
    try:
        # Generate image synchronously via Vertex AI Imagen 3
        result = await image_generator.generate_hero_image(request.draft_text, request.aspect_ratio)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/auto-clip", response_model=AutoClipResponse)
async def auto_clip_video(request: AutoClipRequest):
    try:
        from app.services.gemini_analyzer import extract_video_hooks
        from app.services.video_processor import slice_video_shorts
        import os
        
        # 1. Analyze video directly from GCS using Gemini
        hooks = extract_video_hooks(request.gcs_uri)
        
        if not hooks:
            return AutoClipResponse(clips=[], message="Gemini could not identify any clips.")
            
        # 2. In a real environment, download the GCS file to /tmp/source.mp4
        # Here we assume it's downloaded for the FFmpeg processor.
        local_source = "/tmp/source.mp4" 
        
        # 3. Process video (Crop 9:16 and slice)
        output_dir = "/tmp/output_clips"
        output_files = await slice_video_shorts(local_source, hooks, output_dir)
        
        # 4. Upload back to GCS and generate signed URLs (Simulated here)
        generated_clips = []
        for i, file_path in enumerate(output_files):
            hook = hooks[i] if i < len(hooks) else {}
            # Simulated Signed URL
            fake_url = f"https://storage.googleapis.com/high-ground-studio/clips/{os.path.basename(file_path)}?token=xyz"
            
            generated_clips.append(
                GeneratedClip(
                    title=hook.get("title", f"Clip {i}"),
                    viral_potential_score=hook.get("viral_potential_score", 7),
                    signed_url=fake_url
                )
            )
            
        return AutoClipResponse(clips=generated_clips, message="Successfully generated Shorts.")
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
