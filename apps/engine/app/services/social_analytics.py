async def fetch_youtube_metrics(video_id: str) -> dict:
    """
    Fetches views, likes, and comments for a specific YouTube video.
    """
    # 1. googleapiclient.discovery.build('youtube', 'v3', credentials)
    # 2. execute videos().list(part="statistics", id=video_id)
    return {
        "views": 1500,
        "likes": 234,
        "comments": 15
    }

async def fetch_instagram_metrics(media_id: str) -> dict:
    """
    Fetches engagement metrics from Meta Graph API for an IG Reel.
    """
    # 1. GET /{media-id}?fields=insights.metric(plays,likes,comments,shares)
    return {
        "plays": 3000,
        "likes": 500,
        "comments": 42
    }
