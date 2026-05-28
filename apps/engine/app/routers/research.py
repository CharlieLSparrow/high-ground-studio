from fastapi import APIRouter, HTTPException
from app.models.schemas import ResearchExtractionRequest, ResearchExtractionResponse
from app.services import semantic_researcher

router = APIRouter()

@router.post("/extract-quotes", response_model=ResearchExtractionResponse)
async def extract_quotes(request: ResearchExtractionRequest):
    try:
        result = await semantic_researcher.extract_quotes_from_document(request.document_text, request.focus_topic)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
