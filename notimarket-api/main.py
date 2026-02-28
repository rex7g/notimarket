"""
notimarket-api – Minimal news API for NotiMarket.

This is a STANDALONE service that sits in front of news-intelligence-api
and exposes a clean, simplified endpoint tailored for the NotiMarket polls platform.

Endpoints:
  GET /news    – Simplified news list for NotiMarket
  GET /health  – Health check
"""
import logging
import os
from typing import List, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from news_fetcher import SimpleNewsItem, fetch_news

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

load_dotenv()

NEWS_API_BASE_URL: str = os.getenv("NEWS_API_BASE_URL", "http://localhost:8000")
APP_PORT: int = int(os.getenv("APP_PORT", "8001"))
ALLOWED_ORIGINS: List[str] = os.getenv(
    "ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000"
).split(",")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="NotiMarket News API",
    description=(
        "Minimal news feed API for NotiMarket. "
        "Consumes news-intelligence-api and returns only what polls need."
    ),
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/", tags=["System"])
async def root():
    return {
        "name": "NotiMarket News API",
        "version": "1.0.0",
        "docs": "/docs",
        "endpoints": ["/news", "/health"],
    }


@app.get("/health", tags=["System"])
async def health():
    """Health check – also verifies connectivity to upstream news-intelligence-api."""
    import httpx

    upstream_ok = False
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{NEWS_API_BASE_URL}/health")
            upstream_ok = response.status_code == 200
    except Exception as exc:
        logger.warning(f"Upstream health check failed: {exc}")

    return {
        "status": "ok",
        "upstream_api": "reachable" if upstream_ok else "unreachable",
        "upstream_url": NEWS_API_BASE_URL,
    }


@app.get("/news", response_model=List[SimpleNewsItem], tags=["News"])
async def get_news(
    topic: str = Query(
        "politica",
        description="News topic filter (used for tagging). E.g. 'politica', 'economia'",
    ),
    asset_id: Optional[str] = Query(
        None,
        description="Optional asset_id to forward to the upstream API",
    ),
    limit: int = Query(
        20,
        ge=1,
        le=50,
        description="Number of news items to return (max 50)",
    ),
):
    """
    Return a simplified list of news items for NotiMarket.

    Fields returned per item:
    - id           – Deterministic MD5 of the original URL
    - title        – News headline
    - summary      – Short summary (may be None)
    - source       – Source publication name
    - published_at – ISO 8601 datetime string
    - url          – Original article URL
    - sentiment    – 'positivo' | 'negativo' | 'neutral'
    - topic        – Topic tag forwarded from the query param
    """
    items = await fetch_news(
        base_url=NEWS_API_BASE_URL,
        asset_id=asset_id,
        limit=limit,
        topic=topic,
    )

    if not items:
        # Return empty list (not a 404) – the bot will handle empty feeds
        logger.info(f"No news found (topic={topic}, asset_id={asset_id})")

    return items


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=APP_PORT, reload=True)
