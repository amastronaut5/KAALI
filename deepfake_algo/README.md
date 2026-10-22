# KAALI DeepDefend — Standalone Deepfake Detection Engine

A fully self-contained, **offline, CPU-only** deepfake and face-morph detection engine.
No cloud APIs. No GPU required. Runs in <200ms per image.

---

## Research Papers Implemented

| # | Paper | What It Does |
|---|-------|-------------|
| 1 | **MesoNet-4** — Afchar et al. (IEEE WIFS 2018) | Lightweight 4-layer CNN trained on FaceForensics++ to detect mesoscopic pixel-level artifacts in GAN face-swaps |
| 2 | **Spectral DCT Analysis** — Frank et al. (ICML 2020) | 2D Discrete Cosine Transform + azimuthal FFT radial power spectrum decay to catch frequency fingerprints from transposed convolution upsamplers |
| 3 | **Face X-Ray** — Li et al. (CVPR 2020) | Boundary seam detection via PRNU sensor noise discrepancy between inner face region and outer perimeter ring |
| 4 | **Error Level Analysis (ELA)** | JPEG re-compression residual analysis to flag spliced/pasted regions with inconsistent quantization |

---

## Quick Start

### 1. Install Dependencies
```bash
pip install torch torchvision opencv-python numpy scipy pillow
```

### 2. Run on a Single Image (CLI)
```bash
python -m deepfake_engine.cli path/to/image.jpg
```

### 3. Run on a Single Image (Python API)
```python
from deepfake_engine.pipeline import DeepfakeDetector

detector = DeepfakeDetector()
result = detector.analyze_image("photo.jpg", generate_visual_heatmap=True)

print(result.verdict)            # "AUTHENTIC" | "SUSPICIOUS" | "LIKELY_DEEPFAKE" | "CONFIRMED_DEEPFAKE"
print(result.manipulation_score) # 0.0 - 100.0
print(result.spatial_score)      # MesoNet-4 spatial artifact score
print(result.frequency_score)    # Frank et al. DCT spectral score
print(result.faces_detected)     # Number of faces scanned
print(result.forensic_notes)     # Explainable AI diagnostic
print(result.heatmap_base64)     # Grad-CAM heatmap as base64 data URI (or None)
```

### 4. Run Unit Tests
```bash
python -m pytest deepfake_engine/test_detector.py -v
```

### 5. Run the FastAPI Microservice
```bash
pip install fastapi uvicorn python-multipart
python -m uvicorn deepfake_engine.api:app --host 0.0.0.0 --port 8000
# Swagger docs at http://localhost:8000/docs
```

---

## Directory Structure
```
deepfake_engine/
├── __init__.py              # Package init
├── pipeline.py              # Main entry point — DeepfakeDetector class
├── mesonet.py               # MesoNet-4 CNN + Face X-Ray boundary analysis
├── spatial_detector.py      # Alias module for SpatialArtifactDetector
├── spectral_analyzer.py     # 2D DCT + azimuthal FFT spectral decomposition
├── face_detector.py         # OpenCV Haar Cascade face detector with padding
├── heatmap_generator.py     # Grad-CAM style anomaly heatmap overlay
├── cli.py                   # Command-line interface runner
├── api.py                   # FastAPI microservice (optional)
├── train.py                 # MesoNet-4 fine-tuning script
├── test_detector.py         # Unit test suite
├── weights/
│   ├── meso4_df.pth         # Official FaceForensics++ pretrained weights (PyTorch)
│   └── meso4_finetuned.pth  # Fine-tuned checkpoint
└── benchmark_data/          # Sample test images
    ├── deepfake/
    │   ├── df01254.jpg
    │   └── df00204.jpg
    └── real/
        ├── real00240.jpg
        └── real00772.jpg
```

---

## How Detection Works (Architecture)

```
Input Image
    │
    ├──► Face Detector (Haar Cascade, 35% margin padding)
    │       │
    │       ├──► Face #1 crop (256×256)
    │       ├──► Face #2 crop (256×256)  ◄── ALL faces analyzed
    │       └──► ...
    │
    ▼ Per-Face Analysis:
    │
    ├──► Stream 1: MesoNet-4 Spatial CNN
    │       ├── Pretrained on FaceForensics++ (Keras→PyTorch converted)
    │       ├── Face X-Ray boundary seam noise variance
    │       └── Output: spatial_score [0-100%]
    │
    ├──► Stream 2: Frank et al. Spectral DCT
    │       ├── 2D DCT-II (ortho normalized)
    │       ├── Azimuthal FFT radial power spectrum
    │       ├── High-frequency energy ratio + spectral kurtosis
    │       └── Output: frequency_score [0-100%]
    │
    ├──► Stream 3: Error Level Analysis (ELA)
    │       ├── JPEG Q90 re-compression delta
    │       └── Output: ela_score [0-100%]
    │
    └──► Ensemble Fusion → composite_score → verdict
              │
              ├── ≥75%  →  CONFIRMED_DEEPFAKE
              ├── ≥55%  →  LIKELY_DEEPFAKE
              ├── ≥35%  →  SUSPICIOUS
              └── <35%  →  AUTHENTIC
```

---

## Requirements
- Python 3.10+
- PyTorch (CPU-only is fine)
- OpenCV
- NumPy, SciPy
- Pillow (for training data loading)

No internet connection needed. No GPU needed. Runs entirely offline.
