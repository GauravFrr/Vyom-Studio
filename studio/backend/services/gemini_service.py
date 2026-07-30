"""
VYOM AI Studio — Google Gemini + Imagen 3 service.

This module wraps TWO different Google SDKs:
  * `google-genai` (the new official SDK)  — used for Imagen 3 image generation
                                              and the Gemini text/vision models.
  * `google-generativeai` (the legacy SDK) — kept around for the analyze_image
                                              path that the old code used, in
                                              case anything else still imports it.

The Imagen 3 path used to live on `google.generativeai.imagen`, but that
submodule was never published to PyPI. As of 2025 the only supported way to
call Imagen 3 is via the new SDK, model id `imagen-3.0-generate-001`
(or `imagen-3.0-generate-002` on newer projects — we try 001 first, fall
back to 002 on 404).
"""
import os
import base64
import logging
import uuid
from datetime import datetime
from typing import Optional, Dict, Any, List

from fastapi import HTTPException

from storage_paths import ensure_dir

# New SDK — required for Imagen 3.
from google import genai
from google.genai import types as genai_types

# Legacy SDK — only used for the Gemini 1.5 Pro text/vision paths.
import google.generativeai as legacy_genai

logger = logging.getLogger(__name__)

# Storage root matches main.py StaticFiles mount (studio/storage/).
_IMAGES_DIR = ensure_dir("generated")


# Imagen model ids, in preference order. The first one we'll try is the
# Imagen 4 standard tier; then Imagen 4 ultra (higher quality, slower);
# then Imagen 4 fast (cheapest). Imagen 3 is intentionally not in this
# list — it was deprecated for new keys in late 2025 and most projects
# now have Imagen 4 instead. The service auto-skips any id that 404s.
_IMAGEN_MODEL_IDS = (
    "imagen-4.0-generate-001",
    "imagen-4.0-ultra-generate-001",
    "imagen-4.0-fast-generate-001",
)


class GeminiService:
    """Service for Google Gemini text/vision + Imagen 3 image generation.

    The Google client can be created from either:
      * the `GOOGLE_API_KEY` env var (set in `.env`), or
      * a per-request key passed by the router from the frontend's settingsStore.

    This lets users enter their Google key in the in-app Settings page and
    have it work without restarting the backend, AND lets us keep `.env` as
    a fallback for headless / scripted use.
    """

    def __init__(self):
        # Eagerly configure the legacy SDK from the env key (if any) so the
        # /health probe and any callers using the old code path still work.
        env_key = os.getenv("GOOGLE_API_KEY")
        if env_key:
            legacy_genai.configure(api_key=env_key)
            try:
                self.text_model = legacy_genai.GenerativeModel("gemini-1.5-pro")
            except Exception as e:  # pragma: no cover
                logger.warning("legacy Gemini text model not initialized: %s", e)
                self.text_model = None
        else:
            self.text_model = None

    def _get_client(self, api_key: Optional[str] = None) -> "genai.Client":
        """Return a `genai.Client` for the given key (or env var fallback).

        Raises HTTPException(401) if no key is available.
        """
        key = api_key or os.getenv("GOOGLE_API_KEY")
        if not key:
            raise HTTPException(
                status_code=401,
                detail=(
                    "Google API key is not configured. Add GOOGLE_API_KEY to "
                    "your .env, or enter it in Settings → API Keys (saved to "
                    "your browser's localStorage)."
                ),
            )
        # The new SDK's Client is cheap to construct (HTTPx + auth) — no need
        # to cache per-key. If hot-path caching ever matters, hoist to a dict.
        return genai.Client(api_key=key)

    # ------------------------------------------------------------------ utils

    def _check_initialized(self, api_key: Optional[str] = None):
        # Side-effect: raises 401 if no key is available.
        self._get_client(api_key)

    @staticmethod
    def _get_style_params(style: str) -> Dict[str, str]:
        """Style-specific prompt prefixes for Imagen 3.

        Imagen 3 responds well to explicit cinematic language; prefixing the
        user's prompt with a style hint gives noticeably more consistent
        results than relying on the bare prompt.
        """
        styles = {
            "cinematic": {
                "prompt_prefix": "Cinematic still from a Hollywood movie, dramatic lighting, high detail, 35mm film grain"
            },
            "painterly": {
                "prompt_prefix": "Beautiful painting, soft brush strokes, vibrant colors, artistic composition"
            },
            "anime": {
                "prompt_prefix": "Anime style illustration, vibrant colors, expressive characters, detailed backgrounds"
            },
            "photorealistic": {
                "prompt_prefix": "Ultra-realistic photograph, high resolution, lifelike details, professional lighting"
            },
            "watercolor": {
                "prompt_prefix": "Delicate watercolor painting, soft edges, translucent layers, artistic texture"
            },
            "comic": {
                "prompt_prefix": "Dynamic comic book style, bold outlines, vibrant colors, action-packed composition"
            },
            "storybook": {
                "prompt_prefix": "Whimsical storybook illustration, warm colors, charming characters, magical atmosphere"
            },
        }
        return styles.get(style, {"prompt_prefix": ""})

    # ----------------------------------------------------------------- Imagen

    async def generate_image(
        self,
        prompt: str,
        negative_prompt: Optional[str] = None,
        aspect_ratio: str = "9:16",
        resolution: str = "1024",
        style: str = "cinematic",
        api_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Generate an image with Imagen 3 via the `google-genai` SDK.

        Returns:
            {
              "image_url":    "/storage/generated/<id>.png"   (served by FastAPI's
                                                            /storage static mount),
              "image_path":   absolute path on disk,
              "engine":       "imagen3",
              "metadata":     { prompt_used, aspect_ratio, style, model, timestamp },
            }

        Notes:
            * Resolution is accepted for API symmetry with the request schema,
              but Imagen 3 doesn't take an explicit resolution — it uses the
              aspect ratio. We log it in metadata and pass it through.
            * The image bytes are written to disk under
              `studio/storage/generated/<uuid>.png` so the result survives a
              page reload (CDN URLs from Google are temporary).
        """
        self._check_initialized(api_key)

        style_params = self._get_style_params(style)
        full_prompt = (style_params.get("prompt_prefix", "") + " " + prompt).strip()
        if negative_prompt:
            full_prompt += f"\n\nAvoid: {negative_prompt}"

        # Imagen 3's valid aspect ratios — coerce anything outside the set
        # to the closest legal value rather than 400-ing on a typo.
        valid_aspects = ("1:1", "3:4", "4:3", "9:16", "16:9")
        if aspect_ratio not in valid_aspects:
            logger.warning("Unsupported aspect_ratio %r; defaulting to 9:16", aspect_ratio)
            aspect_ratio = "9:16"

        # Try each known model id until one returns 200. New Google projects
        # are being rolled onto 002; older keys often still have 001 enabled.
        last_err: Optional[Exception] = None
        for model_id in _IMAGEN_MODEL_IDS:
            try:
                response = self._get_client(api_key).models.generate_images(
                    model=model_id,
                    prompt=full_prompt,
                    config=genai_types.GenerateImagesConfig(
                        number_of_images=1,
                        aspect_ratio=aspect_ratio,
                        # include_rai_reason=True is the default; we don't
                        # surface it but the SDK still computes it server-side.
                    ),
                )
                model_used = model_id
                break
            except Exception as e:  # noqa: BLE001
                last_err = e
                msg = str(e)
                # Retry on model-not-available (404) or model-disabled-for-tier
                # (400 INVALID_ARGUMENT that mentions "paid plans" / "not
                # enabled" / "not supported for predict"). Anything else
                # (auth, quota, safety) bubbles up immediately.
                msg_lower = msg.lower()
                try_next = (
                    "NOT_FOUND" in msg
                    or "not found" in msg_lower
                    or "404" in msg
                    or ("400" in msg and (
                        "paid plans" in msg_lower
                        or "not supported" in msg_lower
                        or "not enabled" in msg_lower
                        or "is not supported for predict" in msg_lower
                    ))
                )
                if try_next:
                    logger.info("Imagen model %r not available on this key, trying next. Err: %s", model_id, msg[:200])
                    continue
                raise HTTPException(
                    status_code=500,
                    detail=f"Imagen image generation failed (model={model_id}): {msg}",
                )
        else:
            raise HTTPException(
                status_code=502,
                detail=(
                    f"No Imagen 3 model id is enabled for this API key. "
                    f"Tried: {', '.join(_IMAGEN_MODEL_IDS)}. Last error: {last_err}"
                ),
            )

        # Extract the bytes. Different SDK versions return different shapes:
        #   * .generated_images[i].image.image_bytes        (newer)
        #   * .generated_images[i].image._pil_image         (PIL.Image)
        #   * .generated_images[i].image                    (bytes or PIL)
        if not response.generated_images:
            raise HTTPException(
                status_code=500,
                detail="Imagen 3 returned no images (likely blocked by safety filters).",
            )

        first = response.generated_images[0]
        image_bytes: Optional[bytes] = None

        # Walk the attribute tree in order of likelihood.
        img_obj = getattr(first, "image", None)
        if img_obj is not None:
            if isinstance(img_obj, (bytes, bytearray)):
                image_bytes = bytes(img_obj)
            elif hasattr(img_obj, "image_bytes") and img_obj.image_bytes:
                image_bytes = img_obj.image_bytes
            elif hasattr(img_obj, "tobytes"):  # PIL.Image
                try:
                    import io
                    buf = io.BytesIO()
                    img_obj.save(buf, format="PNG")
                    image_bytes = buf.getvalue()
                except Exception:  # pragma: no cover
                    pass
            elif hasattr(img_obj, "save"):  # PIL.Image without tobytes
                try:
                    import io
                    buf = io.BytesIO()
                    img_obj.save(buf, format="PNG")
                    image_bytes = buf.getvalue()
                except Exception:  # pragma: no cover
                    pass
            elif isinstance(img_obj, str) and img_obj.startswith("data:image"):
                # base64 data URL — strip the prefix
                b64 = img_obj.split(",", 1)[-1]
                image_bytes = base64.b64decode(b64)

        if not image_bytes:
            # Final fallback: the response itself may have a b64 blob.
            try:
                if hasattr(first, "bytes_base64"):
                    image_bytes = base64.b64decode(first.bytes_base64)
            except Exception:  # pragma: no cover
                pass

        if not image_bytes:
            raise HTTPException(
                status_code=500,
                detail=(
                    "Imagen 3 response did not include image bytes in a shape "
                    "this client recognises. SDK may have changed — check the "
                    "google-genai release notes."
                ),
            )

        # Persist to disk so the URL survives a reload. FastAPI's
        # `/storage` static mount serves `_STORAGE_ROOT`; we expose the
        # file at /storage/generated/<id>.png.
        file_id = uuid.uuid4().hex[:12]
        out_path = _IMAGES_DIR / f"{file_id}.png"
        out_path.write_bytes(image_bytes)

        return {
            "image_url": f"/storage/generated/{file_id}.png",
            "image_path": str(out_path),
            "engine": "imagen3",
            "metadata": {
                "prompt_used": full_prompt,
                "aspect_ratio": aspect_ratio,
                "resolution": resolution,
                "style": style,
                "model": model_used,
                "timestamp": datetime.utcnow().isoformat() + "Z",
            },
        }

    # ----------------------------------------------------------------- Gemini text

    async def _generate_text(
        self,
        prompt: str,
        system_instruction: Optional[str] = None,
        model: Optional[str] = None,
        response_mime_type: Optional[str] = None,
        temperature: float = 0.7,
        api_key: Optional[str] = None,
    ) -> str:
        """Internal helper: call Gemini and return the raw text.

        The new SDK's `generate_content` returns a `GenerateContentResponse`
        whose `.text` accessor concatenates text parts. We request JSON via
        `response_mime_type='application/json'` when the caller expects JSON,
        which lets us skip Claude's `_extract_json` dance entirely.

        Model selection: prefer the user-supplied `model`, else try a list
        of free-tier-friendly models in order (the first non-throttled one
        wins). We auto-fall through 503s and 429s so a transient spike on
        one model doesn't fail the whole request.

        Note on the model list: `gemini-2.5-flash` is the most capable but
        is throttled aggressively on the free tier. `gemini-flash-lite-latest`
        is a low-quota all-rounder that rarely throttles. We start with the
        lite one so most requests skip the retry.
        """
        client = self._get_client(api_key)
        # Default order — first match wins. Caller can override `model` to
        # force a specific one (e.g. a future "advanced" toggle in UI).
        candidate_models = (
            [model] if model else (
                "gemini-flash-lite-latest",
                "gemini-2.0-flash-lite",
                "gemini-2.5-flash",
                "gemini-2.0-flash",
            )
        )

        last_err: Optional[Exception] = None
        for mid in candidate_models:
            try:
                config = genai_types.GenerateContentConfig(
                    temperature=temperature,
                    system_instruction=system_instruction,
                    response_mime_type=response_mime_type,
                )
                response = client.models.generate_content(
                    model=mid,
                    contents=prompt,
                    config=config,
                )
                return response.text
            except Exception as e:
                last_err = e
                msg = str(e)
                # Retry only on transient capacity / quota errors. 4xx other
                # than 429 (e.g. 400 API key not valid, 403 permission denied)
                # bubbles up immediately.
                if "503" in msg or "UNAVAILABLE" in msg or "429" in msg or "RESOURCE_EXHAUSTED" in msg:
                    logger.info("Gemini model %r throttled, trying next. Err: %s", mid, msg[:200])
                    continue
                raise HTTPException(
                    status_code=500,
                    detail=f"Gemini text generation failed: {msg}",
                )

        raise HTTPException(
            status_code=503,
            detail=(
                f"All Gemini text models are throttled right now. Last error: {last_err}. "
                f"Try again in a few minutes."
            ),
        )

    async def generate_text(
        self,
        prompt: str,
        system_instruction: Optional[str] = None,
        api_key: Optional[str] = None,
    ) -> str:
        """Public text generation — kept for any existing callers."""
        return await self._generate_text(
            prompt=prompt,
            system_instruction=system_instruction,
            api_key=api_key,
        )

    # ----------------------------------------------------------------- Gemini vision

    async def analyze_image(self, image_url: str, question: str, api_key: Optional[str] = None) -> str:
        """Analyze an image with Gemini Vision (legacy SDK path).

        The legacy SDK is configured at __init__ from the env key. If a
        runtime api_key is supplied we reconfigure the legacy SDK first.
        """
        try:
            if api_key:
                legacy_genai.configure(api_key=api_key)
            vision_model = legacy_genai.GenerativeModel("gemini-1.5-pro-vision")
            response = vision_model.generate_content(
                [{"url": image_url}, question]
            )
            return response.text
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Image analysis failed: {str(e)}",
            )

    # =====================================================================
    # Story-pipeline methods (mirror of claude_service).
    #
    # These let the story pipeline run on Gemini when the user supplies a
    # Google API key but no Claude key. Output shapes match Claude's exactly
    # so the router can call either backend transparently.
    # =====================================================================

    @staticmethod
    def _style_context(style: str) -> str:
        """Style-specific context for prompt engineering (mirrors Claude's)."""
        styles = {
            "cinematic": "Hollywood movie still, dramatic lighting, 35mm film, high detail, realistic textures",
            "painterly": "Oil painting style, visible brush strokes, rich colors, artistic composition",
            "anime": "Japanese anime style, vibrant colors, expressive characters, dynamic angles",
            "photorealistic": "Ultra-realistic photography, lifelike details, professional lighting setup",
            "watercolor": "Watercolor painting, soft edges, translucent layers, artistic texture",
            "comic": "Comic book style, bold outlines, vibrant colors, action-packed composition",
            "storybook": "Whimsical illustration, warm colors, charming characters, magical atmosphere",
        }
        return styles.get(style, "cinematic photography style")

    @staticmethod
    def _style_context_block(
        sample_story: Optional[str] = None,
        style_notes: Optional[str] = None,
        memory_summaries: Optional[List[str]] = None,
    ) -> str:
        """Build the optional USER STYLE CONTEXT block for the system prompt.

        Identical contract to ClaudeService._style_context_block. When any
        of (sample_story, style_notes, memory_summaries) is supplied, we
        compose a single block the model should honour for this request.
        Returns '' if nothing was supplied, so we don't add noise.
        """
        parts: List[str] = []
        if memory_summaries:
            bullet = "\n".join(f"- {s.strip()}" for s in memory_summaries if s and s.strip())
            if bullet:
                parts.append(
                    "PREVIOUS PROJECTS (style + topic memory from this user's recent work):\n"
                    + bullet
                    + "\n"
                    "Treat these as background. Match the same style and topic family unless the new idea explicitly diverges."
                )
        if style_notes and style_notes.strip():
            parts.append(
                "STYLE NOTES (rules the user wants honoured on every output):\n"
                + style_notes.strip()
            )
        if sample_story and sample_story.strip():
            parts.append(
                "REFERENCE STORY (match this tone, sentence length, vocabulary, pacing, and ending pattern):\n"
                + sample_story.strip()
            )
        if not parts:
            return ""
        return "\n\n--- USER STYLE CONTEXT ---\n" + "\n\n".join(parts) + "\n--- END USER STYLE CONTEXT ---\n"

    async def generate_story_expansion(
        self,
        idea: str,
        genre: str = "mythological",
        language: str = "english",
        target_length: str = "short",
        sample_story: Optional[str] = None,
        style_notes: Optional[str] = None,
        memory_summaries: Optional[List[str]] = None,
        api_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Expand a story idea into a full narrative. Returns a dict matching
        Claude's contract: { expanded_story, genre, language, length, token_usage }.
        """
        length_desc = {
            "short": "ONE flowing paragraph, ~400-500 Hindi words (50-60 second YouTube Short narration). No scene headers or bullet points.",
            "medium": "5-7 paragraphs (1-2 minute narration)",
            "long": "10+ paragraphs (3-5 minute story)",
        }.get(target_length, "ONE flowing paragraph (~50-60 sec)")

        style_block = self._style_context_block(sample_story, style_notes, memory_summaries)
        style_addendum = f"\n\n{style_block}" if style_block else ""

        system_prompt = (
            f"You are a master storyteller specializing in {genre} stories. "
            f"Expand the user's brief idea into a compelling narrative of {length_desc}. "
            f"Write in {language} language. Include vivid descriptions, character "
            f"emotions, and sensory details. Structure it with a clear beginning, "
            f"middle, and end. Output ONLY the story text — no preamble, no title, no labels."
            f"{style_addendum}"
        )
        text = await self._generate_text(
            prompt=f"Story idea: {idea}\n\nPlease expand this into a full {genre} story.",
            system_instruction=system_prompt,
            api_key=api_key,
        )
        return {
            "expanded_story": text.strip(),
            "genre": genre,
            "language": language,
            "length": target_length,
            "token_usage": {},  # Gemini SDK doesn't surface a simple usage dict in this call shape
        }

    async def generate_scene_breakdown(
        self,
        story: str,
        max_scenes: int = 8,
        min_duration_per_scene: int = 3,
        sample_story: Optional[str] = None,
        style_notes: Optional[str] = None,
        memory_summaries: Optional[List[str]] = None,
        api_key: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Break a story into scenes. Returns a list of scene dicts matching
        Claude's contract (scene_number, brief_description, detailed_action,
        mood, suggested_camera_angle, estimated_duration_seconds, key_visual_elements).
        """
        style_block = self._style_context_block(sample_story, style_notes, memory_summaries)
        style_addendum = f"\n\n{style_block}" if style_block else ""

        system_prompt = (
            f"Analyze the provided story and break it down into {max_scenes} key scenes "
            f"for a visual storyboard. Each scene should be visually distinct and important "
            f"to the narrative. For each scene, provide:\n"
            f"  1. scene_number (integer)\n"
            f"  2. brief_description (one sentence)\n"
            f"  3. detailed_action (what happens)\n"
            f"  4. mood (atmosphere)\n"
            f"  5. suggested_camera_angle\n"
            f"  6. estimated_duration_seconds (minimum {min_duration_per_scene})\n"
            f"  7. key_visual_elements (array of short strings)\n"
            f"Return a JSON array of scene objects — nothing else."
            f"{style_addendum}"
        )
        text = await self._generate_text(
            prompt=f"Story to analyze:\n\n{story}",
            system_instruction=system_prompt,
            response_mime_type="application/json",
            api_key=api_key,
        )
        try:
            import json
            scenes = json.loads(text)
            if not isinstance(scenes, list):
                raise ValueError("Expected JSON array")
            return scenes
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Gemini scene breakdown returned non-JSON: {str(e)}. Raw: {text[:300]!r}",
            )

    async def generate_image_prompt(
        self,
        scene_description: str,
        style: str = "cinematic",
        continuity_bible: Optional[str] = None,
        language: str = "english",
        sample_story: Optional[str] = None,
        style_notes: Optional[str] = None,
        memory_summaries: Optional[List[str]] = None,
        api_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Generate an image prompt + negative prompt for a scene."""
        style_context = self._style_context(style)
        continuity = f"\n\nContinuity rules: {continuity_bible}" if continuity_bible else ""
        style_block = self._style_context_block(sample_story, style_notes, memory_summaries)
        style_addendum = f"\n\n{style_block}" if style_block else ""

        system_prompt = (
            f"You are an expert prompt engineer for AI image generation. "
            f"Create a highly detailed, cinematic image prompt based on the scene description. "
            f"Include specific details about lighting, composition, mood, and visual elements. "
            f"Style: {style_context}. Language: {language}. "
            f"Also generate a negative prompt listing what to avoid. "
            f'Return JSON with exactly three fields: "prompt", "negative_prompt", and "motion_prompt". '
            f'motion_prompt = short image-to-video direction (camera + subject movement, 20-40 words).'
            f"{style_addendum}"
        )
        text = await self._generate_text(
            prompt=f"Scene description: {scene_description}{continuity}",
            system_instruction=system_prompt,
            response_mime_type="application/json",
            api_key=api_key,
        )
        try:
            import json
            data = json.loads(text)
            return {
                "prompt": data.get("prompt", ""),
                "negative_prompt": data.get("negative_prompt", ""),
                "motion_prompt": data.get("motion_prompt", ""),
            }
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Gemini prompt generation returned non-JSON: {str(e)}. Raw: {text[:300]!r}",
            )

    async def generate_scene_prompt_studio(
        self,
        master_prompt: str,
        scene_text: str,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
    ) -> Dict[str, str]:
        from services.scene_prompt_studio import parse_scene_prompt_studio_output

        text = await self._generate_text(
            prompt=scene_text.strip(),
            system_instruction=master_prompt.strip(),
            model=model,
            temperature=0.65,
            api_key=api_key,
        )
        parsed = parse_scene_prompt_studio_output(text)
        parsed["model"] = model or "gemini-flash-lite-latest"
        return parsed

    async def generate_voiceover_script(
        self,
        scene_description: str,
        language: str = "english",
        max_words: int = 30,
        sample_story: Optional[str] = None,
        style_notes: Optional[str] = None,
        memory_summaries: Optional[List[str]] = None,
        api_key: Optional[str] = None,
    ) -> str:
        """Generate voiceover narration for a scene."""
        style_block = self._style_context_block(sample_story, style_notes, memory_summaries)
        style_addendum = f"\n\n{style_block}" if style_block else ""

        system_prompt = (
            f"Write a concise voiceover narration for this scene. "
            f"Language: {language}. Style: engaging and descriptive. "
            f"Length: maximum {max_words} words. Focus on the key action and emotion. "
            f"Output ONLY the narration — no labels, no quotes, no preamble."
            f"{style_addendum}"
        )
        text = await self._generate_text(
            prompt=f"Scene: {scene_description}",
            system_instruction=system_prompt,
            api_key=api_key,
        )
        return text.strip()

    async def generate_youtube_copy(
        self,
        story: str,
        genre: str = "mythological",
        language: str = "english",
        sample_story: Optional[str] = None,
        style_notes: Optional[str] = None,
        memory_summaries: Optional[List[str]] = None,
        api_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Generate YouTube title + description + tags. Matches Claude's shape."""
        style_block = self._style_context_block(sample_story, style_notes, memory_summaries)
        style_addendum = f"\n\n{style_block}" if style_block else ""

        system_prompt = (
            f"You are a YouTube SEO expert for {genre} stories. "
            f"Generate a viral title, a compelling description, and relevant tags for a YouTube Short. "
            f"Language: {language}. "
            f'Return JSON with exactly three fields: "title" (string), "description" (string), '
            f'and "tags" (array of strings).'
            f"{style_addendum}"
        )
        text = await self._generate_text(
            prompt=f"Story for YouTube copy:\n\n{story}",
            system_instruction=system_prompt,
            response_mime_type="application/json",
            api_key=api_key,
        )
        try:
            import json
            data = json.loads(text)
            return {
                "title": data.get("title", ""),
                "description": data.get("description", ""),
                "tags": data.get("tags", []),
            }
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Gemini YouTube copy returned non-JSON: {str(e)}. Raw: {text[:300]!r}",
            )

    async def enhance_prompt(
        self,
        rough_prompt: str,
        style: str = "cinematic",
        sample_story: Optional[str] = None,
        style_notes: Optional[str] = None,
        memory_summaries: Optional[List[str]] = None,
        api_key: Optional[str] = None,
    ) -> str:
        """Enhance a rough prompt with professional details. Returns a string."""
        style_context = self._style_context(style)
        style_block = self._style_context_block(sample_story, style_notes, memory_summaries)
        style_addendum = f"\n\n{style_block}" if style_block else ""

        system_prompt = (
            f"You are a prompt enhancement expert. Take this rough prompt and transform it into "
            f"a highly detailed, professional image generation prompt. "
            f"Style: {style_context}. Add specific details about lighting, composition, textures, "
            f"and mood. Make it vivid and descriptive. Output ONLY the enhanced prompt — no preamble."
            f"{style_addendum}"
        )
        text = await self._generate_text(
            prompt=f"Rough prompt: {rough_prompt}",
            system_instruction=system_prompt,
            api_key=api_key,
        )
        return text.strip()

    async def check_consistency(
        self,
        prompts: List[str],
        continuity_bible: str,
        sample_story: Optional[str] = None,
        style_notes: Optional[str] = None,
        memory_summaries: Optional[List[str]] = None,
        api_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Check prompts for consistency with continuity rules. Returns { issues, suggestions }."""
        prompts_text = "\n\n".join([f"Prompt {i+1}: {p}" for i, p in enumerate(prompts)])
        style_block = self._style_context_block(sample_story, style_notes, memory_summaries)
        style_addendum = f"\n\n{style_block}" if style_block else ""

        system_prompt = (
            f"Analyze these image prompts against the continuity bible. "
            f"Identify any inconsistencies in character appearance, setting details, or style. "
            f"For each issue found, suggest a fix. "
            f"Continuity Bible:\n{continuity_bible}\n"
            f'Return JSON with exactly two fields: "issues" (array of strings) and '
            f'"suggestions" (object mapping issue to its fix).'
            f"{style_addendum}"
        )
        text = await self._generate_text(
            prompt=prompts_text,
            system_instruction=system_prompt,
            response_mime_type="application/json",
            api_key=api_key,
        )
        try:
            import json
            return json.loads(text)
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Gemini consistency check returned non-JSON: {str(e)}. Raw: {text[:300]!r}",
            )


# Singleton — imported by routers.
gemini_service = GeminiService()
