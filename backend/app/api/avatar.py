"""Avatar API endpoints for Anam.ai integration"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import httpx
import logging
from app.core.config import settings

router = APIRouter(prefix="/avatar", tags=["avatar"])
logger = logging.getLogger(__name__)

class PersonaConfig(BaseModel):
    name: str = "Cara"  # Updated to match the default ID
    avatarId: str = "30fa96d0-26c4-4e55-94a0-517025942e18"
    voiceId: str = "6bfbe25a-979d-40f3-a92b-5394170af54b"
    llmId: str = "0934d97d-0c3a-4f33-91b0-5e136a0ef466"
    systemPrompt: str = "You are a helpful research assistant."
    voiceDetectionOptions: dict | None = {
        "endOfSpeechSensitivity": 0.5,
        "silenceBeforeSkipTurnSeconds": 3.0,
        "silenceBeforeAutoEndTurnSeconds": 1.0
    }

class SessionRequest(BaseModel):
    personaConfig: PersonaConfig | None = None

@router.post("/session")
async def get_session_token(request: SessionRequest | None = None):
    """
    Get a session token for Anam.ai avatar
    """
    if not settings.anam_api_key:
        raise HTTPException(status_code=500, detail="ANAM_API_KEY is not configured")

    # Use default config if not provided
    config = request.personaConfig if request and request.personaConfig else PersonaConfig()

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.anam.ai/v1/auth/session-token",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {settings.anam_api_key}",
                },
                json={
                    "personaConfig": config.model_dump()
                },
                timeout=10.0
            )

            if response.status_code != 200:
                logger.error(f"Anam.ai API error: {response.text}")
                raise HTTPException(status_code=response.status_code, detail="Failed to get session token")

            return response.json()

    except Exception as e:
        logger.error(f"Error fetching Anam.ai session: {e}")
        raise HTTPException(status_code=500, detail=str(e))
