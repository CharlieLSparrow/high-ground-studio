from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "High Ground Engine"}

def test_generate_image():
    # Because we mocked the image generation in the service stub, we can test it directly
    response = client.post(
        "/api/v1/media/generate-image",
        json={"draft_text": "A beautiful sunset over the mountains", "aspect_ratio": "16:9"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "image_uri" in data
    assert "prompt_used" in data
    assert "gs://simulated-bucket" in data["image_uri"]

def test_extract_quotes():
    # Mocked semantic researcher
    response = client.post(
        "/api/v1/research/extract-quotes",
        json={"document_text": "This is a long test document about AI.", "focus_topic": "AI"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "quotes" in data
    assert "summary" in data
    assert len(data["quotes"]) > 0
    assert "QuotePassport" or "themes" in str(data)
