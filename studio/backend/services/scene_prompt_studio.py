"""Parse master-prompt studio output (ChatGPT-style or JSON)."""
from __future__ import annotations

import json
import re
from typing import Any, Dict


def parse_scene_prompt_studio_output(text: str) -> Dict[str, str]:
    raw = (text or "").strip()
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw, flags=re.MULTILINE).strip()

    try:
        data = json.loads(cleaned)
        if isinstance(data, dict):
            return {
                "scene_summary": str(
                    data.get("scene_summary") or data.get("scene") or ""
                ).strip(),
                "image_prompt": str(
                    data.get("image_prompt") or data.get("prompt") or ""
                ).strip(),
                "motion_prompt": str(
                    data.get("motion_prompt")
                    or data.get("animation_prompt")
                    or ""
                ).strip(),
                "raw": raw,
            }
    except json.JSONDecodeError:
        pass

    scene_summary = ""
    image_prompt = ""
    motion_prompt = ""

    scene_m = re.search(
        r"(?is)(?:^|\n)\s*Scene:\s*\n?(.*?)(?=\n\s*Image Prompt:|\Z)",
        cleaned,
    )
    img_m = re.search(
        r"(?is)(?:^|\n)\s*Image Prompt:\s*\n?(.*?)(?=\n\s*Animation Prompt:|\Z)",
        cleaned,
    )
    anim_m = re.search(
        r"(?is)(?:^|\n)\s*Animation Prompt:\s*\n?(.*?)\Z",
        cleaned,
    )

    if scene_m:
        scene_summary = scene_m.group(1).strip()
    if img_m:
        image_prompt = img_m.group(1).strip()
    if anim_m:
        motion_prompt = anim_m.group(1).strip()

    if image_prompt or motion_prompt:
        return {
            "scene_summary": scene_summary,
            "image_prompt": image_prompt,
            "motion_prompt": motion_prompt,
            "raw": raw,
        }

    return {
        "scene_summary": "",
        "image_prompt": cleaned,
        "motion_prompt": "",
        "raw": raw,
    }
