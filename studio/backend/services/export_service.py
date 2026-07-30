"""FFmpeg video assembly — scene clips/images + optional voiceover/music → MP4."""
from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException

_BACKEND_DIR = Path(__file__).resolve().parent.parent
STORAGE_ROOT = Path(
    __import__("os").getenv("STORAGE_PATH", str(_BACKEND_DIR.parent / "storage"))
).resolve()
EXPORT_DIR = STORAGE_ROOT / "generated" / "export"
EXPORT_DIR.mkdir(parents=True, exist_ok=True)

ASPECT_SIZES: Dict[str, Tuple[int, int]] = {
    "9:16": (1080, 1920),
    "16:9": (1920, 1080),
    "1:1": (1080, 1080),
    "4:5": (1080, 1350),
    "4:3": (1440, 1080),
    "3:4": (1080, 1440),
}

XFADE_MAP = {
    "cut": None,
    "fade": "fade",
    "dissolve": "dissolve",
    "wipe": "wipeleft",
}


def _tool_bin(name: str) -> str:
    """Resolve ffmpeg/ffprobe: env FFMPEG_PATH / FFMPEG_DIR, then common Windows paths, then PATH."""
    env_key = "FFMPEG_PATH" if name == "ffmpeg" else "FFPROBE_PATH"
    explicit = os.getenv(env_key, "").strip()
    if explicit:
        p = Path(explicit)
        if p.is_file():
            return str(p)

    ffmpeg_dir = os.getenv("FFMPEG_DIR", "").strip()
    candidates: List[Path] = []
    if ffmpeg_dir:
        candidates.append(Path(ffmpeg_dir) / f"{name}.exe")
        candidates.append(Path(ffmpeg_dir) / "bin" / f"{name}.exe")
    candidates.extend(
        [
            Path(r"D:\ffmpeg\bin") / f"{name}.exe",
            Path(r"C:\ffmpeg\bin") / f"{name}.exe",
        ]
    )
    for candidate in candidates:
        if candidate.is_file():
            return str(candidate)

    path = shutil.which(name)
    if path:
        return path

    raise HTTPException(
        status_code=503,
        detail=(
            f"{name} not found. Set FFMPEG_PATH to the .exe, or FFMPEG_DIR to your FFmpeg folder "
            f"(e.g. D:\\ffmpeg), or add ffmpeg\\bin to system PATH."
        ),
    )


def _ffmpeg_bin() -> str:
    return _tool_bin("ffmpeg")


def _ffprobe_bin() -> str:
    return _tool_bin("ffprobe")


def resolve_storage_path(url_or_path: str) -> Path:
    """Turn /storage/... or relative storage paths into a local file Path."""
    raw = (url_or_path or "").strip()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty media path.")

    if raw.startswith("http://") or raw.startswith("https://"):
        raise HTTPException(
            status_code=400,
            detail="Remote media URLs must be downloaded first; use a /storage/ path.",
        )

    if raw.startswith("/storage/"):
        local = STORAGE_ROOT / raw.removeprefix("/storage/").lstrip("/")
    elif raw.startswith("storage/"):
        local = STORAGE_ROOT / raw.removeprefix("storage/").lstrip("/")
    else:
        candidate = Path(raw)
        local = candidate if candidate.is_absolute() else STORAGE_ROOT / raw.lstrip("/")

    if not local.is_file():
        fallback = STORAGE_ROOT / Path(raw).name
        if fallback.is_file():
            local = fallback
        else:
            raise HTTPException(status_code=400, detail=f"Media file not found: {raw[:160]}")

    return local


def probe_duration_seconds(path: Path) -> float:
    ffprobe = _ffprobe_bin()
    try:
        result = subprocess.run(
            [
                ffprobe,
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(path),
            ],
            capture_output=True,
            text=True,
            check=True,
            timeout=30,
        )
        return max(0.1, float(result.stdout.strip()))
    except (subprocess.CalledProcessError, ValueError, subprocess.TimeoutExpired) as exc:
        raise HTTPException(status_code=500, detail=f"Could not read media duration: {path.name}") from exc


def _scale_pad_filter(width: int, height: int) -> str:
    return (
        f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
        f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,format=yuv420p"
    )


def _run_ffmpeg(args: List[str], *, label: str = "FFmpeg") -> None:
    ffmpeg = _ffmpeg_bin()
    cmd = [ffmpeg, "-y", *args]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(status_code=504, detail=f"{label} timed out after 10 minutes.") from exc
    if proc.returncode != 0:
        tail = (proc.stderr or proc.stdout or "")[-800:]
        raise HTTPException(status_code=500, detail=f"{label} failed: {tail}")


def build_scene_clip(
    *,
    source: Path,
    is_video: bool,
    duration_sec: float,
    width: int,
    height: int,
    output: Path,
) -> float:
    """Normalize a scene to H.264 MP4; returns actual clip duration in seconds."""
    vf = _scale_pad_filter(width, height)
    duration_sec = max(1.0, float(duration_sec or 4))

    if is_video:
        _run_ffmpeg(
            [
                "-i",
                str(source),
                "-vf",
                vf,
                "-r",
                "24",
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                "-an",
                str(output),
            ],
            label="Scene video normalize",
        )
        return probe_duration_seconds(output)

    _run_ffmpeg(
        [
            "-loop",
            "1",
            "-i",
            str(source),
            "-t",
            str(duration_sec),
            "-vf",
            vf,
            "-r",
            "24",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-an",
            str(output),
        ],
        label="Scene image to video",
    )
    return duration_sec


def concat_clips_cut(clip_paths: List[Path], output: Path) -> None:
    list_file = output.with_suffix(".txt")
    lines = [f"file '{p.as_posix()}'" for p in clip_paths]
    list_file.write_text("\n".join(lines), encoding="utf-8")
    _run_ffmpeg(
        ["-f", "concat", "-safe", "0", "-i", str(list_file), "-c", "copy", str(output)],
        label="Concat (cut)",
    )
    list_file.unlink(missing_ok=True)


def concat_clips_xfade(
    clip_paths: List[Path],
    durations: List[float],
    *,
    transition: str,
    transition_duration: float,
    output: Path,
) -> None:
    if len(clip_paths) == 1:
        shutil.copy2(clip_paths[0], output)
        return

    td = max(0.1, min(float(transition_duration or 0.5), 2.0))
    xfade_name = XFADE_MAP.get(transition) or "fade"

    inputs: List[str] = []
    for p in clip_paths:
        inputs.extend(["-i", str(p)])

    parts: List[str] = []
    offset = durations[0] - td
    parts.append(f"[0:v][1:v]xfade=transition={xfade_name}:duration={td}:offset={offset:.3f}[v01]")
    cumulative = durations[0] + durations[1] - td

    for i in range(2, len(clip_paths)):
        prev = f"v{i-1:02d}" if i > 2 else "v01"
        nxt = f"v{i:02d}"
        offset = cumulative - td
        parts.append(
            f"[{prev}][{i}:v]xfade=transition={xfade_name}:duration={td}:offset={offset:.3f}[{nxt}]"
        )
        cumulative += durations[i] - td

    last = f"v{len(clip_paths)-1:02d}" if len(clip_paths) > 2 else "v01"
    filter_complex = ";".join(parts)

    _run_ffmpeg(
        [
            *inputs,
            "-filter_complex",
            filter_complex,
            "-map",
            f"[{last}]",
            "-r",
            "24",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            str(output),
        ],
        label="Concat (xfade)",
    )


def mux_audio(
    video_path: Path,
    output_path: Path,
    *,
    voiceover: Optional[Path] = None,
    music: Optional[Path] = None,
) -> None:
    if not voiceover and not music:
        shutil.copy2(video_path, output_path)
        return

    inputs = ["-i", str(video_path)]
    audio_inputs: List[str] = []

    if voiceover and voiceover.is_file():
        inputs.extend(["-i", str(voiceover)])
        audio_inputs.append("1:a")
    if music and music.is_file():
        idx = 2 if voiceover else 1
        inputs.extend(["-i", str(music)])
        audio_inputs.append(f"{idx}:a")

    if len(audio_inputs) == 1:
        _run_ffmpeg(
            [
                *inputs,
                "-map",
                "0:v:0",
                "-map",
                audio_inputs[0],
                "-c:v",
                "copy",
                "-c:a",
                "aac",
                "-b:a",
                "192k",
                "-shortest",
                str(output_path),
            ],
            label="Mux audio",
        )
        return

    _run_ffmpeg(
        [
            *inputs,
            "-filter_complex",
            "[1:a][2:a]amix=inputs=2:duration=first:dropout_transition=2[aout]",
            "-map",
            "0:v:0",
            "-map",
            "[aout]",
            "-c:v",
            "copy",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-shortest",
            str(output_path),
        ],
        label="Mux voiceover + music",
    )


def assemble_video(
    scenes: List[Dict[str, Any]],
    *,
    aspect_ratio: str = "9:16",
    transition: str = "fade",
    transition_duration: float = 0.5,
    voiceover_path: Optional[Path] = None,
    music_path: Optional[Path] = None,
    include_voiceover: bool = True,
    project_id: Optional[str] = None,
) -> Dict[str, Any]:
    if not scenes:
        raise HTTPException(status_code=400, detail="No scenes provided for assembly.")

    width, height = ASPECT_SIZES.get(aspect_ratio, ASPECT_SIZES["9:16"])
    ordered = sorted(scenes, key=lambda s: s.get("scene_number") or 0)

    with tempfile.TemporaryDirectory(prefix="vyom-export-") as tmp:
        tmp_path = Path(tmp)
        clip_paths: List[Path] = []
        durations: List[float] = []

        for idx, scene in enumerate(ordered):
            video_ref = scene.get("video_url") or scene.get("video_path")
            image_ref = scene.get("image_url") or scene.get("image_path")
            duration_sec = (
                scene.get("duration_sec")
                or scene.get("estimated_duration_seconds")
                or 4
            )

            if video_ref:
                source = resolve_storage_path(str(video_ref))
                is_video = source.suffix.lower() in {".mp4", ".webm", ".mov", ".mkv"}
                if not is_video:
                    is_video = True
            elif image_ref:
                source = resolve_storage_path(str(image_ref))
                is_video = False
            else:
                raise HTTPException(
                    status_code=400,
                    detail=f"Scene {scene.get('scene_number', idx + 1)} has no image or video.",
                )

            clip_out = tmp_path / f"scene_{idx:03d}.mp4"
            actual_dur = build_scene_clip(
                source=source,
                is_video=is_video,
                duration_sec=float(duration_sec),
                width=width,
                height=height,
                output=clip_out,
            )
            clip_paths.append(clip_out)
            durations.append(actual_dur)

        stitched = tmp_path / "stitched.mp4"
        if transition == "cut" or len(clip_paths) == 1:
            concat_clips_cut(clip_paths, stitched)
        else:
            concat_clips_xfade(
                clip_paths,
                durations,
                transition=transition,
                transition_duration=transition_duration,
                output=stitched,
            )

        voice = voiceover_path if include_voiceover else None
        if voice and not voice.is_file():
            voice = None

        file_id = uuid.uuid4().hex[:12]
        if project_id:
            out_dir = STORAGE_ROOT / "projects" / project_id / "export"
            out_dir.mkdir(parents=True, exist_ok=True)
            final_path = out_dir / f"short_{file_id}.mp4"
            public_url = f"/storage/projects/{project_id}/export/short_{file_id}.mp4"
        else:
            final_path = EXPORT_DIR / f"short_{file_id}.mp4"
            public_url = f"/storage/generated/export/short_{file_id}.mp4"

        mux_audio(
            stitched,
            final_path,
            voiceover=voice,
            music=music_path,
        )

        total_duration = sum(durations)
        if transition != "cut" and len(durations) > 1:
            td = max(0.1, min(float(transition_duration or 0.5), 2.0))
            total_duration -= td * (len(durations) - 1)

        return {
            "success": True,
            "video_url": public_url,
            "video_path": str(final_path),
            "duration_seconds": round(total_duration, 2),
            "scene_count": len(clip_paths),
            "aspect_ratio": aspect_ratio,
            "transition": transition,
            "metadata": {
                "width": width,
                "height": height,
                "has_voiceover": bool(voice and voice.is_file()),
                "has_music": bool(music_path and music_path.is_file()),
            },
        }


export_service = type("ExportService", (), {"assemble_video": staticmethod(assemble_video)})()
