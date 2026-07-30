from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict, Any
import os
import uuid
import base64
from datetime import datetime
from io import BytesIO
from PIL import Image

app = FastAPI(
    title="Kaggle GPU Server",
    description="Dadaji AI Studio - Kaggle GPU Services",
    version="0.1.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/status")
async def get_status():
    return {
        "status": "online",
        "gpu": "T4 x2 (32GB VRAM)",
        "models_loaded": []
    }

class FluxImageRequest(BaseModel):
    prompt: str
    negative_prompt: Optional[str] = None
    engine: Optional[str] = "flux"
    style: Optional[str] = "cinematic"
    aspect_ratio: Optional[str] = "9:16"
    resolution: Optional[str] = "1024"
    project_id: Optional[str] = None
    scene_id: Optional[str] = None

class LtxVideoRequest(BaseModel):
    prompt: str
    image_url: Optional[str] = None
    engine: Optional[str] = "ltx-video"
    style: Optional[str] = "cinematic"
    duration_seconds: Optional[int] = 4
    aspect_ratio: Optional[str] = "9:16"
    resolution: Optional[str] = "1024"
    project_id: Optional[str] = None
    scene_id: Optional[str] = None

def _data_uri_png_1x1(color: tuple[int, int, int] = (60, 120, 255)) -> str:
    """
    Returns a small PNG as a data URI.
    NOTE: This should NOT be used as a placeholder for real generation.
    """
    img = Image.new("RGB", (1, 1), color=color)
    buf = BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
    return f"data:image/png;base64,{b64}"


def _not_configured(job_id: str, request: Dict[str, Any], engine: str, detail: str) -> JSONResponse:
    return JSONResponse(
        status_code=501,
        content={
            "success": False,
            "message": f"{engine} generation is not configured for real execution. {detail}",
            "job_id": job_id,
            "metadata": {
                "engine": engine,
                "timestamp": datetime.now().isoformat(),
                "request": request,
                "configured": False,
            },
        },
    )


# Kept for backward compatibility for any older code paths (now unused).
def _not_implemented(job_id: str, request: Dict[str, Any], engine: str) -> Dict[str, Any]:
    return {
        "success": False,
        "message": f"{engine} generation is not yet implemented in kaggle_server.",
        "job_id": job_id,
        "metadata": {"engine": engine, "timestamp": None, "request": request},
    }

@app.post("/generate/image")
async def generate_image(request: FluxImageRequest):
    job_id = str(uuid.uuid4())
    req = request.model_dump()

    # Real execution wiring:
    # Provide an external runner that actually executes FLUX on Kaggle and returns an image_url.
    # Expected env vars (optional):
    # - KAGGLE_FLUX_RUN_URL (e.g. http://localhost:9000/run-flux)
    flux_run_url = os.getenv("KAGGLE_FLUX_RUN_URL", "").strip()

    if not flux_run_url:
        return _not_configured(
            job_id=job_id,
            request=req,
            engine="flux",
            detail="Set KAGGLE_FLUX_RUN_URL to an endpoint that runs FLUX.1 and returns { image_url }.",
        )

    import requests
    try:
        r = requests.post(flux_run_url, json=req, timeout=300)
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"FLUX execution runner failed: {e}")

    image_url = data.get("image_url") or data.get("result_url") or data.get("url")
    if not image_url:
        raise HTTPException(status_code=502, detail="FLUX runner response missing image_url.")

    return {
        "success": True,
        "image_url": image_url,
        "engine": "flux",
        "job_id": job_id,
        "metadata": {
            "engine": "flux",
            "timestamp": datetime.now().isoformat(),
            "job_id": job_id,
            "request": req,
            "placeholder": False,
            "runner": flux_run_url,
            "runner_metadata": data.get("metadata"),
        },
    }

@app.post("/generate/video")
async def generate_video(request: LtxVideoRequest):
    job_id = str(uuid.uuid4())
    req = request.model_dump()

    # Real execution wiring:
    # Provide an external runner that actually executes LTX-Video on Kaggle and returns video/clip URLs.
    ltx_run_url = os.getenv("KAGGLE_LTX_RUN_URL", "").strip()

    if not ltx_run_url:
        return _not_configured(
            job_id=job_id,
            request=req,
            engine="ltx-video",
            detail="Set KAGGLE_LTX_RUN_URL to an endpoint that runs LTX-Video and returns { video_url } or { clip_url }.",
        )

    import requests
    try:
        r = requests.post(ltx_run_url, json=req, timeout=600)
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LTX execution runner failed: {e}")

    video_url = data.get("video_url") or data.get("result_url") or ""
    clip_url = data.get("clip_url") or ""

    if not video_url and not clip_url:
        raise HTTPException(status_code=502, detail="LTX runner response missing video_url/clip_url.")

    return {
        "success": True,
        "video_url": video_url,
        "clip_url": clip_url,
        "engine": "ltx-video",
        "job_id": job_id,
        "metadata": {
            "engine": "ltx-video",
            "timestamp": datetime.now().isoformat(),
            "job_id": job_id,
            "request": req,
            "placeholder": False,
            "runner": ltx_run_url,
            "runner_metadata": data.get("metadata"),
        },
    }


@app.post("/upscale")
async def upscale_image():
    # TODO: Implement ESRGAN upscaling
    return {"message": "Image upscaling endpoint"}

@app.post("/inpaint")
async def inpaint_image():
    # TODO: Implement inpainting
    return {"message": "Image inpainting endpoint"}

@app.post("/remove-bg")
async def remove_background():
    # TODO: Implement background removal
    return {"message": "Background removal endpoint"}


class FaceSwapImageRequest(BaseModel):
    scene_base64: str
    face_base64: str
    notes: Optional[str] = None


class FaceSwapVideoRequest(BaseModel):
    video_base64: str
    face_base64: str
    notes: Optional[str] = None


@app.post("/face-swap/image")
async def face_swap_image(request: FaceSwapImageRequest):
    """Insta influencer — copy model face onto scene still (GPU runner)."""
    run_url = os.getenv("KAGGLE_FACE_IMAGE_RUN_URL", "").strip()
    if not run_url:
        return JSONResponse(
            status_code=501,
            content={
                "success": False,
                "message": "Set KAGGLE_FACE_IMAGE_RUN_URL to a SimSwap / InsightFace runner on this notebook.",
            },
        )
    import requests
    try:
        r = requests.post(run_url, json=request.model_dump(), timeout=600)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Face image swap runner failed: {e}") from e


@app.post("/face-swap/video")
async def face_swap_video(request: FaceSwapVideoRequest):
    """Insta influencer — swap model face into reference video (GPU runner)."""
    run_url = os.getenv("KAGGLE_FACE_VIDEO_RUN_URL", "").strip()
    if not run_url:
        return JSONResponse(
            status_code=501,
            content={
                "success": False,
                "message": "Set KAGGLE_FACE_VIDEO_RUN_URL to a Roop / FaceFusion runner on this notebook.",
            },
        )
    import requests
    try:
        r = requests.post(run_url, json=request.model_dump(), timeout=900)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Face video swap runner failed: {e}") from e

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)