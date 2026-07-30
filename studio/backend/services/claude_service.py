import os
import re
import anthropic
import json
from typing import Optional, Dict, Any, List
from fastapi import HTTPException


def _extract_json(text: str) -> Any:
    """
    Robustly extract and parse a JSON object or array from a Claude response.

    Claude sometimes wraps JSON in ```json fences, prefixes it with prose, or
    adds trailing explanation. This helper:
      1. Strips ```json / ``` fences.
      2. Finds the first '{' or '[' and the matching closing bracket
         (accounting for nested strings + braces) — not the naive
         `text.find('{') / text.rfind('}')` slice, which would corrupt
         payloads containing multiple JSON snippets.
      3. Raises a clear HTTPException(500) on failure so callers get a
         useful error rather than a stack trace.
    """
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip(), flags=re.MULTILINE).strip()

    # Find the first JSON opener ('{' for object, '[' for array).
    first_obj = cleaned.find("{")
    first_arr = cleaned.find("[")
    if first_obj == -1 and first_arr == -1:
        raise HTTPException(status_code=500, detail="Claude response contained no JSON object or array.")
    if first_obj == -1:
        opener, closer = "[", "]"
        start = first_arr
    elif first_arr == -1 or first_obj < first_arr:
        opener, closer = "{", "}"
        start = first_obj
    else:
        opener, closer = "[", "]"
        start = first_arr

    # Walk the string to find the matching close, ignoring brackets inside strings.
    depth = 0
    in_string = False
    escape = False
    end = -1
    for i in range(start, len(cleaned)):
        ch = cleaned[i]
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
        elif ch == opener:
            depth += 1
        elif ch == closer:
            depth -= 1
            if depth == 0:
                end = i + 1
                break

    if end == -1:
        raise HTTPException(
            status_code=500,
            detail=f"Claude response JSON was not closed (started at offset {start}).",
        )

    candidate = cleaned[start:end]
    try:
        return json.loads(candidate)
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to parse Claude JSON: {e}. Raw slice: {candidate[:200]!r}",
        )


class ClaudeService:
    """Service for Anthropic Claude AI - story writing, prompts, and AI features.

    The Anthropic client is created lazily from either:
      * the `ANTHROPIC_API_KEY` env var (set in `.env`), or
      * a per-request key passed by the router from the frontend's settingsStore.

    This lets users enter their Claude key in the in-app Settings page and
    have it work without restarting the backend, AND lets us keep `.env` as
    a fallback for headless / scripted use.
    """

    # Cached clients keyed by api_key. Anthropic SDK is thread-safe to share
    # across requests, so one client per (api_key) is enough.
    _clients: Dict[str, "anthropic.Anthropic"] = {}

    def __init__(self):
        self.default_model = "claude-haiku-4-5"  # Fast and cost-effective
        # Eagerly initialize the env-key client (if any) for the /health probe.
        env_key = os.getenv("ANTHROPIC_API_KEY")
        if env_key:
            self._get_client(env_key)

    def _get_client(self, api_key: Optional[str] = None) -> "anthropic.Anthropic":
        """Return an Anthropic client for the given key (or env var fallback).

        Raises HTTPException(401) if no key is available.
        """
        key = api_key or os.getenv("ANTHROPIC_API_KEY")
        if not key:
            raise HTTPException(
                status_code=401,
                detail=(
                    "Claude API key is not configured. Add ANTHROPIC_API_KEY to "
                    "your .env, or enter it in Settings → API Keys (saved to "
                    "your browser's localStorage)."
                ),
            )
        client = self._clients.get(key)
        if client is None:
            client = anthropic.Anthropic(api_key=key)
            self._clients[key] = client
        return client

    def _check_client(self, api_key: Optional[str] = None):
        """Verify that the Anthropic client can be initialized for this key."""
        # _get_client raises 401 if missing; we just want the side effect.
        self._get_client(api_key)

    @staticmethod
    def _style_context_block(
        sample_story: Optional[str] = None,
        style_notes: Optional[str] = None,
        memory_summaries: Optional[List[str]] = None,
    ) -> str:
        """Build the STYLE CONTEXT block that gets prepended to the system prompt.

        When the user supplies a sample story + style notes + memory summaries
        in the StoryEditor (or via the storyStyleStore), we want the model to
        honour them for *this* request without us rewriting all the existing
        system prompts. We compose a single optional block; if nothing is
        supplied, this returns '' so we don't add noise.
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
        memory_summaries: Optional[List[str]] = None,        api_key: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Expand a story idea into a full narrative.

        Args:
            idea: Short story idea from user
            genre: Story genre
            language: Output language (english/hindi)
            target_length: short/medium/long
            sample_story: Optional reference story in the user's preferred style
            style_notes: Optional formula / rules / ending pattern
            memory_summaries: Optional list of recent project summaries

        Returns:
            Dictionary with expanded story and metadata
        """
        self._check_client(api_key)
        try:
            length_desc = {
                "short": "ONE flowing paragraph, ~400-500 Hindi words (50-60 second YouTube Short narration). No scene headers or bullet points.",
                "medium": "5-7 paragraphs (1-2 minute narration)",
                "long": "10+ paragraphs (3-5 minute story)"
            }.get(target_length, "ONE flowing paragraph (~50-60 sec)")

            style_block = self._style_context_block(sample_story, style_notes, memory_summaries)
            style_addendum = f"\n\n{style_block}" if style_block else ""

            system_prompt = f"""You are a master storyteller specializing in {genre} stories.
            Expand the user's brief idea into a compelling narrative of {length_desc}.
            Write in {language} language. Include vivid descriptions, character emotions, and sensory details.
            Structure it with a clear beginning, middle, and end.{style_addendum}"""

            response = self._get_client(api_key).messages.create(
                model=self.default_model,
                max_tokens=2048,
                system=system_prompt,
                messages=[
                    {
                        "role": "user",
                        "content": f"Story idea: {idea}\n\nPlease expand this into a full {genre} story."
                    }
                ]
            )

            return {
                "expanded_story": response.content[0].text,
                "genre": genre,
                "language": language,
                "length": target_length,
                "token_usage": response.usage
            }

        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Story expansion failed: {str(e)}"
            )

    async def generate_scene_breakdown(
        self,
        story: str,
        max_scenes: int = 8,
        min_duration_per_scene: int = 3,
        sample_story: Optional[str] = None,
        style_notes: Optional[str] = None,
        memory_summaries: Optional[List[str]] = None,        api_key: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Break down a story into scenes for storyboard.

        Args:
            story: Full story text
            max_scenes: Maximum number of scenes
            min_duration_per_scene: Minimum duration per scene in seconds
            sample_story: Optional reference story in the user's preferred style
            style_notes: Optional formula / rules / ending pattern
            memory_summaries: Optional list of recent project summaries

        Returns:
            List of scene dictionaries with details
        """
        self._check_client(api_key)
        try:
            style_block = self._style_context_block(sample_story, style_notes, memory_summaries)
            style_addendum = f"\n\n{style_block}" if style_block else ""

            system_prompt = f"""Analyze the provided story and break it down into {max_scenes} key scenes
            for a visual storyboard. Each scene should be visually distinct and important to the narrative.
            For each scene, provide:
            1. scene_number
            2. brief_description (1 sentence)
            3. detailed_action (what happens)
            4. mood/atmosphere
            5. suggested_camera_angle
            6. estimated_duration_seconds (minimum {min_duration_per_scene})
            7. key_visual_elements

            Return as valid JSON array.{style_addendum}"""

            response = self._get_client(api_key).messages.create(
                model=self.default_model,
                max_tokens=4096,
                system=system_prompt,
                messages=[
                    {
                        "role": "user",
                        "content": f"Story to analyze:\n\n{story}"
                    }
                ]
            )

            # Parse the JSON response
            scenes_json = response.content[0].text
            return _extract_json(scenes_json)

        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Scene breakdown failed: {str(e)}"
            )

    async def generate_image_prompt(
        self,
        scene_description: str,
        style: str = "cinematic",
        continuity_bible: Optional[str] = None,
        language: str = "english",
        sample_story: Optional[str] = None,
        style_notes: Optional[str] = None,
        memory_summaries: Optional[List[str]] = None,        api_key: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Generate optimized image prompt for a scene.

        Args:
            scene_description: Description of the scene
            style: Art style
            continuity_bible: Character/setting consistency rules
            language: Prompt language
            sample_story: Optional reference story in the user's preferred style
            style_notes: Optional formula / rules / ending pattern
            memory_summaries: Optional list of recent project summaries

        Returns:
            Dictionary with prompt, negative prompt, and metadata
        """
        self._check_client(api_key)
        try:
            style_context = self._get_style_context(style)
            continuity_context = f"\n\nContinuity rules: {continuity_bible}" if continuity_bible else ""
            style_block = self._style_context_block(sample_story, style_notes, memory_summaries)
            style_addendum = f"\n\n{style_block}" if style_block else ""

            system_prompt = f"""You are an expert prompt engineer for AI image generation.
            Create a highly detailed, cinematic image prompt based on the scene description.
            Include specific details about lighting, composition, mood, and visual elements.
            Style: {style_context}
            Language: {language}
            {continuity_context}

            Also generate a negative prompt listing what to avoid.
            Also generate a motion_prompt: concise image-to-video direction (camera + subject movement, 20-40 words).
            Return as JSON with 'prompt', 'negative_prompt', and 'motion_prompt' fields.{style_addendum}"""

            response = self._get_client(api_key).messages.create(
                model=self.default_model,
                max_tokens=1024,
                system=system_prompt,
                messages=[
                    {
                        "role": "user",
                        "content": f"Scene description: {scene_description}{continuity_context}"
                    }
                ]
            )

            prompt_data = response.content[0].text
            return _extract_json(prompt_data)

        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Prompt generation failed: {str(e)}"
            )

    async def generate_scene_prompt_studio(
        self,
        master_prompt: str,
        scene_text: str,
        api_key: Optional[str] = None,
    ) -> Dict[str, str]:
        from services.scene_prompt_studio import parse_scene_prompt_studio_output

        self._check_client(api_key)
        try:
            response = self._get_client(api_key).messages.create(
                model=self.default_model,
                max_tokens=2000,
                system=master_prompt.strip(),
                messages=[{"role": "user", "content": scene_text.strip()}],
            )
            return parse_scene_prompt_studio_output(response.content[0].text)
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Scene prompt studio failed: {str(e)}",
            )

    async def generate_youtube_copy(
        self,
        story: str,
        genre: str = "mythological",
        language: str = "english",
        sample_story: Optional[str] = None,
        style_notes: Optional[str] = None,
        memory_summaries: Optional[List[str]] = None,        api_key: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Generate YouTube title, description, and tags for the story.

        Args:
            story: Full story text
            genre: Story genre
            language: Output language
            sample_story: Optional reference story in the user's preferred style
            style_notes: Optional formula / rules / ending pattern
            memory_summaries: Optional list of recent project summaries

        Returns:
            Dictionary with title, description, and tags
        """
        self._check_client(api_key)
        try:
            style_block = self._style_context_block(sample_story, style_notes, memory_summaries)
            style_addendum = f"\n\n{style_block}" if style_block else ""

            system_prompt = f"""You are a YouTube SEO expert for {genre} stories.
            Generate a viral title, a compelling description, and relevant tags for a YouTube Short.
            Language: {language}
            Return as JSON with 'title', 'description', and 'tags' (array).{style_addendum}"""

            response = self._get_client(api_key).messages.create(
                model=self.default_model,
                max_tokens=1024,
                system=system_prompt,
                messages=[
                    {
                        "role": "user",
                        "content": f"Story for YouTube copy:\n\n{story}"
                    }
                ]
            )

            result_text = response.content[0].text
            return _extract_json(result_text)

        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"YouTube copy generation failed: {str(e)}"
            )

    def _get_style_context(self, style: str) -> str:

        """Get style-specific context for prompt engineering."""
        styles = {
            "cinematic": "Hollywood movie still, dramatic lighting, 35mm film, high detail, realistic textures",
            "painterly": "Oil painting style, visible brush strokes, rich colors, artistic composition",
            "anime": "Japanese anime style, vibrant colors, expressive characters, dynamic angles",
            "photorealistic": "Ultra-realistic photography, lifelike details, professional lighting setup",
            "watercolor": "Watercolor painting, soft edges, translucent layers, artistic texture",
            "comic": "Comic book style, bold outlines, vibrant colors, action-packed composition",
            "storybook": "Whimsical illustration, warm colors, charming characters, magical atmosphere"
        }
        return styles.get(style, "cinematic photography style")

    async def generate_voiceover_script(
        self,
        scene_description: str,
        language: str = "english",
        max_words: int = 30,
        sample_story: Optional[str] = None,
        style_notes: Optional[str] = None,
        memory_summaries: Optional[List[str]] = None,        api_key: Optional[str] = None
    ) -> str:
        """
        Generate voiceover narration for a scene.

        Args:
            scene_description: Scene to narrate
            language: Script language
            max_words: Maximum words for the narration
            sample_story: Optional reference story in the user's preferred style
            style_notes: Optional formula / rules / ending pattern
            memory_summaries: Optional list of recent project summaries

        Returns:
            Voiceover text
        """
        self._check_client(api_key)
        try:
            style_block = self._style_context_block(sample_story, style_notes, memory_summaries)
            style_addendum = f"\n\n{style_block}" if style_block else ""

            system_prompt = f"""Write a concise voiceover narration for this scene.
            Language: {language}
            Style: Engaging and descriptive
            Length: Maximum {max_words} words
            Focus on the key action and emotion.{style_addendum}"""

            response = self._get_client(api_key).messages.create(
                model=self.default_model,
                max_tokens=512,
                system=system_prompt,
                messages=[
                    {
                        "role": "user",
                        "content": f"Scene: {scene_description}"
                    }
                ]
            )

            return response.content[0].text.strip()

        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Voiceover generation failed: {str(e)}"
            )

    async def enhance_prompt(
        self,
        rough_prompt: str,
        style: str = "cinematic",
        sample_story: Optional[str] = None,
        style_notes: Optional[str] = None,
        memory_summaries: Optional[List[str]] = None,        api_key: Optional[str] = None
    ) -> str:
        """
        Enhance a rough prompt with professional details.

        Args:
            rough_prompt: User's basic prompt
            style: Target style
            sample_story: Optional reference story in the user's preferred style
            style_notes: Optional formula / rules / ending pattern
            memory_summaries: Optional list of recent project summaries

        Returns:
            Enhanced prompt
        """
        self._check_client(api_key)
        try:
            style_context = self._get_style_context(style)
            style_block = self._style_context_block(sample_story, style_notes, memory_summaries)
            style_addendum = f"\n\n{style_block}" if style_block else ""

            system_prompt = f"""You are a prompt enhancement expert. Take this rough prompt
            and transform it into a highly detailed, professional image generation prompt.
            Style: {style_context}
            Add specific details about lighting, composition, textures, and mood.
            Make it vivid and descriptive.{style_addendum}"""

            response = self._get_client(api_key).messages.create(
                model=self.default_model,
                max_tokens=1024,
                system=system_prompt,
                messages=[
                    {
                        "role": "user",
                        "content": f"Rough prompt: {rough_prompt}"
                    }
                ]
            )

            return response.content[0].text.strip()

        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Prompt enhancement failed: {str(e)}"
            )

    async def check_consistency(
        self,
        prompts: List[str],
        continuity_bible: str,
        sample_story: Optional[str] = None,
        style_notes: Optional[str] = None,
        memory_summaries: Optional[List[str]] = None,        api_key: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Check prompts for consistency with continuity rules.

        Args:
            prompts: List of image prompts to check
            continuity_bible: Character/setting rules
            sample_story: Optional reference story in the user's preferred style
            style_notes: Optional formula / rules / ending pattern
            memory_summaries: Optional list of recent project summaries

        Returns:
            Dictionary with issues found and suggestions
        """
        self._check_client(api_key)
        try:
            prompts_text = "\n\n".join([f"Prompt {i+1}: {p}" for i, p in enumerate(prompts)])
            style_block = self._style_context_block(sample_story, style_notes, memory_summaries)
            style_addendum = f"\n\n{style_block}" if style_block else ""

            system_prompt = f"""Analyze these image prompts against the continuity bible.
            Identify any inconsistencies in character appearance, setting details, or style.
            For each issue found, suggest a fix.

            Continuity Bible:\n{continuity_bible}

            Return as JSON with 'issues' array and 'suggestions' object.{style_addendum}"""

            response = self._get_client(api_key).messages.create(
                model=self.default_model,
                max_tokens=2048,
                system=system_prompt,
                messages=[
                    {
                        "role": "user",
                        "content": f"Prompts to check:\n\n{prompts_text}"
                    }
                ]
            )

            result_text = response.content[0].text
            return _extract_json(result_text)

        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Consistency check failed: {str(e)}"
            )

# Singleton instance
claude_service = ClaudeService()
