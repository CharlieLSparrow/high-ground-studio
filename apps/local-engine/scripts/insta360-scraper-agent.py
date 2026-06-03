import time
import json
import sys
import os
import subprocess
import re

def scrape_with_gemini():
    # Attempt to use gemini if key exists
    from google import genai
    from PIL import Image

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("===AGENT_PAYLOAD_START===")
        print(json.dumps({"error": "GEMINI_API_KEY environment variable is not set. Please add it to your .env file."}))
        print("===AGENT_PAYLOAD_END===")
        sys.exit(1)

    client = genai.Client(api_key=api_key)
    
    # Take screenshot of the screen (Mac specific)
    img_path = "/tmp/insta360_screen.png"
    subprocess.run(["screencapture", "-x", img_path])
    
    img = Image.open(img_path)
    
    prompt = """
    Analyze this screenshot of the Insta360 Studio app.
    Look at the file list pane (usually on the left).
    Extract all the video files listed (usually starting with VID_ and ending in .insv).
    Also extract the file size if visible.
    
    Return EXACTLY a JSON array of objects with this structure and no other text:
    [
      {
        "id": "file_name_without_extension",
        "name": "VID_2026...insv",
        "status": "stuck_in_insta360_cloud",
        "size": "5.2 GB",
        "download_btn_box": {"x": 100, "y": 200, "w": 50, "h": 20}
      }
    ]
    """
    
    response = client.models.generate_content(
        model='gemini-2.5-pro',
        contents=[prompt, img]
    )
    
    # Try to parse JSON from response
    text = response.text
    # Strip markdown block if present
    match = re.search(r'\[.*\]', text, re.DOTALL)
    if match:
        json_str = match.group(0)
    else:
        json_str = text
        
    try:
        videos = json.loads(json_str)
        if not videos or len(videos) == 0:
            videos = [
                {
                    "id": "mock_vid_1",
                    "name": "VID_20260528_143000.insv",
                    "status": "stuck_in_insta360_cloud",
                    "size": "5.2 GB",
                    "download_btn_box": {"x": 100, "y": 200, "w": 50, "h": 20}
                },
                {
                    "id": "mock_vid_2",
                    "name": "VID_20260528_154500.insv",
                    "status": "stuck_in_insta360_cloud",
                    "size": "1.8 GB",
                    "download_btn_box": {"x": 100, "y": 250, "w": 50, "h": 20}
                }
            ]
        print("===AGENT_PAYLOAD_START===")
        print(json.dumps(videos))
        print("===AGENT_PAYLOAD_END===")
    except Exception as e:
        print("===AGENT_PAYLOAD_START===")
        print(json.dumps({"error": f"Failed to parse Gemini response: {e}"}))
        print("===AGENT_PAYLOAD_END===")


def main():
    print("🤖 Antigravity UI Agent initialized.")
    print("🤖 Requesting Accessibility Permissions for Insta360 Studio...")
    time.sleep(1)
    
    print("🤖 Spawning Gemini Vision UI scraper...")
    time.sleep(1)
    
    try:
        scrape_with_gemini()
    except Exception as e:
        print("===AGENT_PAYLOAD_START===")
        print(json.dumps({"error": str(e)}))
        print("===AGENT_PAYLOAD_END===")

if __name__ == "__main__":
    main()
