"""
Free TTS via veoaifree.com googletts.php — Microsoft neural voices, 100+ languages.

POST https://veoaifree.com/video/googletts.php
JSON body: { text, voice, lang, pitch, speed, prompt }
Response:  { message: "success", audio_data: "data:audio/mpeg;base64,..." }

Verified working 2026-06-10 (~9s for a short Hindi clip). No nonce/login needed.
Site UI caps text at 10,000 chars per request.
"""
from __future__ import annotations

import base64
import logging
import uuid
from datetime import datetime
from typing import Any, Dict, Optional

import requests
from fastapi import HTTPException

from storage_paths import ensure_dir

logger = logging.getLogger(__name__)

_AUDIO_DIR = ensure_dir("generated", "tts")

TTS_URL = "https://veoaifree.com/video/googletts.php"
TTS_PAGE_URL = "https://veoaifree.com/free-ai-text-to-speech/"
MAX_CHARS = 9500  # site limit is 10,000 — keep headroom

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36"
)

# Emotion presets mirror the site's Fine-Tune panel.
EMOTION_PROMPTS = {
    "default": "",
    "happy": "Read aloud in a cheerful, upbeat and happy tone.",
    "sad": "Read aloud in a soft, melancholic and sad tone.",
    "excited": "Read aloud in an energetic, thrilled and excited tone.",
    "calm": "Read aloud in a calm, soothing and relaxed tone.",
    "professional": "Read aloud in a clear, confident and professional tone.",
    "warm": "Read aloud in a warm, welcoming tone.",
    "storyteller": "Read aloud like a wise old storyteller narrating to children, expressive and engaging.",
}


class TTSService:
    async def generate_speech(
        self,
        text: str,
        voice: str = "hi-IN-MadhurNeural",
        lang: str = "hi-IN",
        speed: float = 1.0,
        pitch: int = 0,
        emotion: str = "default",
        user_agent: Optional[str] = None,
    ) -> Dict[str, Any]:
        cleaned = text.strip()
        if not cleaned:
            raise HTTPException(status_code=400, detail="Text is required for speech generation.")
        if len(cleaned) > MAX_CHARS:
            raise HTTPException(
                status_code=400,
                detail=f"Text too long ({len(cleaned)} chars). Max {MAX_CHARS} per request — split your script.",
            )

        prompt = EMOTION_PROMPTS.get(emotion.lower(), emotion if emotion else "")
        payload = {
            "text": cleaned,
            "voice": voice,
            "lang": lang or "en-US",
            "pitch": pitch,
            "speed": speed,
            "prompt": prompt,
        }
        headers = {
            "accept": "application/json, text/javascript, */*; q=0.01",
            "content-type": "application/json",
            "origin": "https://veoaifree.com",
            "referer": TTS_PAGE_URL,
            "user-agent": (user_agent or UA),
            "x-requested-with": "XMLHttpRequest",
        }

        try:
            resp = requests.post(TTS_URL, json=payload, headers=headers, timeout=(20, 300))
        except requests.RequestException as e:
            raise HTTPException(status_code=502, detail=f"TTS request failed: {e}") from e

        if resp.status_code >= 400:
            raise HTTPException(status_code=resp.status_code, detail=f"TTS error: {resp.text[:300]}")

        try:
            data = resp.json()
        except ValueError:
            raise HTTPException(status_code=502, detail=f"TTS returned non-JSON: {resp.text[:300]}")

        audio_data = data.get("audio_data", "")
        if data.get("message") != "success" or "base64," not in audio_data:
            raise HTTPException(
                status_code=502,
                detail=f"TTS failed: {str(data.get('error') or data)[:300]}",
            )

        raw = base64.b64decode(audio_data.split("base64,", 1)[1])
        filename = f"{uuid.uuid4().hex[:12]}.mp3"
        file_path = _AUDIO_DIR / filename
        file_path.write_bytes(raw)
        logger.info("TTS saved %s (%d bytes, voice=%s)", filename, len(raw), voice)

        return {
            "audio_url": f"/storage/generated/tts/{filename}",
            "audio_path": str(file_path),
            "engine": "cloud-tts",
            "metadata": {
                "voice": voice,
                "lang": lang,
                "speed": speed,
                "pitch": pitch,
                "emotion": emotion,
                "characters": len(cleaned),
                "bytes": len(raw),
                "timestamp": datetime.utcnow().isoformat() + "Z",
            },
        }


tts_service = TTSService()
