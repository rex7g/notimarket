"""
news_fetcher.py – Internal client for news-intelligence-api.
Fetches raw news and transforms to NotiMarket's simplified format.
"""
import hashlib
import logging
from typing import List, Optional

import httpx
from pydantic import BaseModel

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Output model (what NotiMarket consumes)
# ---------------------------------------------------------------------------

class SimpleNewsItem(BaseModel):
    id: str
    title: str
    summary: Optional[str] = None
    source: Optional[str] = None
    published_at: Optional[str] = None
    url: str
    sentiment: Optional[str] = None
    topic: str = "politica"


# ---------------------------------------------------------------------------
# Fetcher
# ---------------------------------------------------------------------------

async def fetch_news(
    base_url: str,
    asset_id: Optional[str] = None,
    limit: int = 20,
    topic: str = "politica",
) -> List[SimpleNewsItem]:
    """
    Call GET {base_url}/news on the existing news-intelligence-api
    and return simplified items for NotiMarket.
    
    Args:
        base_url: URL of the news-intelligence-api (e.g. http://localhost:8000)
        asset_id: Optional asset_id filter forwarded to the upstream API
        limit:    Max number of news items to return
        topic:    Topic label to tag the results with (not forwarded, used for tagging)
    """
    params: dict = {"limit": min(limit, 50)}
    if asset_id:
        params["asset_id"] = asset_id

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"{base_url}/news", params=params)
            response.raise_for_status()
            raw_news = response.json()
    except httpx.HTTPError as exc:
        logger.error(f"Failed to reach news-intelligence-api: {exc}")
        return []
    except Exception as exc:
        logger.error(f"Unexpected error fetching news: {exc}")
        return []

    results: List[SimpleNewsItem] = []
    for item in raw_news:
        # Generate a deterministic id from the URL
        url = item.get("original_url", "")
        item_id = hashlib.md5(url.encode()).hexdigest()[:12]

        results.append(
            SimpleNewsItem(
                id=item_id,
                title=item.get("title", "Sin título"),
                summary=item.get("summary"),
                source=item.get("source_name"),
                published_at=item.get("published_at"),
                url=url,
                sentiment=_normalize_sentiment(item.get("sentiment")),
                topic=topic,
            )
        )

    return results


def _normalize_sentiment(raw: Optional[str]) -> str:
    """Map upstream sentiment labels to simple positive/neutral/negative."""
    if not raw:
        return "neutral"
    mapping = {
        "bullish": "positivo",
        "bearish": "negativo",
        "neutral": "neutral",
        "positive": "positivo",
        "negative": "negativo",
    }
    return mapping.get(raw.lower(), "neutral")
