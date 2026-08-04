"""The only unauthenticated route — Cloud Run's health probe uses it."""

from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def health() -> dict:
    return {"status": "ok"}
