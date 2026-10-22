"""
FastAPI Microservice for KAALI DeepDefend Deepfake & Face Morph Detection
Run with:
    uvicorn intelligence.deepfake.api:app --host 0.0.0.0 --port 8000 --reload
"""

import time
import os
import base64
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

try:
    from deepfake_engine.pipeline import DeepfakeDetector
except ImportError:
    try:
        from pipeline import DeepfakeDetector
    except ImportError:
        from intelligence.deepfake.pipeline import DeepfakeDetector

# Initialize FastAPI App
app = FastAPI(
    title="KAALI DeepDefend Microservice",
    description="Dual-Stream Deepfake & Face Morph Detection API (MesoNet-4 + 2D DCT Spectral Analysis)",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Enable CORS for React Frontend (Vite running on 5173 or any origin)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins for local hackathon development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global model instance
detector = DeepfakeDetector()


# ---------------------------------------------------------
# Pydantic Schemas for Swagger Documentation and UI Binding
# ---------------------------------------------------------

class DetectionResponse(BaseModel):
    is_deepfake: bool = Field(..., description="True if composite manipulation score >= 55.0%")
    verdict: str = Field(..., description="AUTHENTIC | SUSPICIOUS | LIKELY_DEEPFAKE | CONFIRMED_DEEPFAKE")
    authenticity_score: float = Field(..., description="Confidence that image is authentic [0 - 100%]")
    manipulation_score: float = Field(..., description="Composite likelihood of artificial manipulation [0 - 100%]")
    manipulation_type: str = Field(..., description="Classification category (e.g. GAN Face-Swap, Authentic)")
    spatial_score: float = Field(..., description="MesoNet-4 spatial pixel artifact score [0 - 100%]")
    frequency_score: float = Field(..., description="Frank et al. 2D DCT spectral anomaly score [0 - 100%]")
    faces_detected: int = Field(..., description="Number of human faces detected in image")
    bounding_box: Optional[List[int]] = Field(None, description="Primary face bounding box [x, y, w, h]")
    heatmap_base64: Optional[str] = Field(None, description="Grad-CAM anomaly heatmap as base64 PNG data URI")
    processing_time_ms: float = Field(..., description="Total inference and rendering latency in milliseconds")
    forensic_notes: str = Field(..., description="Explainable AI diagnostic analysis")
    faces_details: Optional[List[Dict[str, Any]]] = Field(None, description="Forensic metrics breakdown for all detected faces")


class Base64DetectRequest(BaseModel):
    image_base64: str = Field(..., description="Base64 encoded image string (with or without data:image prefix)")


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    pretrained_weights_active: bool
    supported_formats: List[str]


# ---------------------------------------------------------
# API Endpoints
# ---------------------------------------------------------

@app.get("/health", response_model=HealthResponse, tags=["Health"])
@app.get("/api/v1/detect/health", response_model=HealthResponse, tags=["Health"])
def health_check():
    """
    Check microservice status and model readiness.
    """
    return HealthResponse(
        status="ONLINE",
        service="KAALI DeepDefend Detection Service",
        version="1.0.0",
        pretrained_weights_active=detector.spatial_detector.has_pretrained,
        supported_formats=["image/jpeg", "image/png", "image/webp", "image/bmp"]
    )


@app.post("/api/v1/detect/deepfake", response_model=DetectionResponse, tags=["Inference"])
async def detect_deepfake_upload(
    image: UploadFile = File(..., description="Image file to analyze (JPEG, PNG, WebP)")
):
    """
    **Primary Endpoint:** Inspects an uploaded image file for deepfakes, face-morphing, and AI synthesis.
    Returns composite authenticity score, dual-stream metrics, and Grad-CAM visual heatmap.
    """
    start_time = time.time()
    
    # Read file bytes
    try:
        contents = await image.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read uploaded file: {str(e)}")

    if not contents:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    try:
        result = detector.analyze_image(contents, generate_visual_heatmap=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference error: {str(e)}")

    elapsed_ms = round((time.time() - start_time) * 1000.0, 2)

    return DetectionResponse(
        is_deepfake=result.is_deepfake,
        verdict=result.verdict,
        authenticity_score=result.authenticity_score,
        manipulation_score=result.manipulation_score,
        manipulation_type=result.manipulation_type,
        spatial_score=result.spatial_score,
        frequency_score=result.frequency_score,
        faces_detected=result.faces_detected,
        bounding_box=result.bounding_box,
        heatmap_base64=result.heatmap_base64,
        processing_time_ms=elapsed_ms,
        forensic_notes=result.forensic_notes,
        faces_details=result.faces_details
    )


@app.post("/api/v1/detect/deepfake/base64", response_model=DetectionResponse, tags=["Inference"])
def detect_deepfake_base64(payload: Base64DetectRequest):
    """
    Inspects a Base64-encoded image string. Ideal for web frontends sending camera captures or canvas data.
    """
    start_time = time.time()
    raw_str = payload.image_base64

    # Remove data:image/...;base64, prefix if present
    if "," in raw_str:
        raw_str = raw_str.split(",", 1)[1]

    try:
        image_bytes = base64.b64decode(raw_str)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid Base64 string: {str(e)}")

    try:
        result = detector.analyze_image(image_bytes, generate_visual_heatmap=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference error: {str(e)}")

    elapsed_ms = round((time.time() - start_time) * 1000.0, 2)

    return DetectionResponse(
        is_deepfake=result.is_deepfake,
        verdict=result.verdict,
        authenticity_score=result.authenticity_score,
        manipulation_score=result.manipulation_score,
        manipulation_type=result.manipulation_type,
        spatial_score=result.spatial_score,
        frequency_score=result.frequency_score,
        faces_detected=result.faces_detected,
        bounding_box=result.bounding_box,
        heatmap_base64=result.heatmap_base64,
        processing_time_ms=elapsed_ms,
        forensic_notes=result.forensic_notes,
        faces_details=result.faces_details
    )


@app.get("/api/v1/detect/samples", tags=["Testing"])
def list_benchmark_samples():
    """
    Returns available server-side benchmark images for instant 1-click UI testing.
    """
    root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
    samples = []
    
    # Check benchmark data folder
    bench_dir = os.path.join(os.path.dirname(__file__), "benchmark_data")
    if os.path.exists(bench_dir):
        for root, _, files in os.walk(bench_dir):
            for f in files:
                if f.endswith(('.jpg', '.png', '.webp')):
                    rel_path = os.path.relpath(os.path.join(root, f), root_dir)
                    label = "Deepfake FaceForensics++" if "deepfake" in root else "Real Human Face"
                    samples.append({"name": f, "path": rel_path.replace("\\", "/"), "label": label})

    # Check root samples (REAL.webp, TEST.png)
    for custom in ["REAL.webp", "TEST.png"]:
        if os.path.exists(os.path.join(root_dir, custom)):
            samples.append({"name": custom, "path": custom, "label": "User Uploaded Image"})

    return {"samples": samples}


@app.post("/api/v1/detect/samples/{sample_name}", response_model=DetectionResponse, tags=["Testing"])
def test_named_sample(sample_name: str):
    """
    Instantly runs detection on one of the server's existing benchmark samples.
    """
    root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
    
    target_path = None
    # Check root directory
    candidate_root = os.path.join(root_dir, sample_name)
    if os.path.exists(candidate_root):
        target_path = candidate_root
    else:
        # Check benchmark_data
        bench_dir = os.path.join(os.path.dirname(__file__), "benchmark_data")
        for root, _, files in os.walk(bench_dir):
            if sample_name in files:
                target_path = os.path.join(root, sample_name)
                break

    if not target_path:
        raise HTTPException(status_code=404, detail=f"Sample '{sample_name}' not found on server.")

    start_time = time.time()
    result = detector.analyze_image(target_path, generate_visual_heatmap=True)
    elapsed_ms = round((time.time() - start_time) * 1000.0, 2)

    return DetectionResponse(
        is_deepfake=result.is_deepfake,
        verdict=result.verdict,
        authenticity_score=result.authenticity_score,
        manipulation_score=result.manipulation_score,
        manipulation_type=result.manipulation_type,
        spatial_score=result.spatial_score,
        frequency_score=result.frequency_score,
        faces_detected=result.faces_detected,
        bounding_box=result.bounding_box,
        heatmap_base64=result.heatmap_base64,
        processing_time_ms=elapsed_ms,
        forensic_notes=result.forensic_notes,
        faces_details=result.faces_details
    )


# Entry point for direct execution
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("intelligence.deepfake.api:app", host="0.0.0.0", port=8000, reload=True)
