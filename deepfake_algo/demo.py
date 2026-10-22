"""
KAALI DeepDefend — Quickstart Demo Runner
Runs all 3 forensic streams (MesoNet-4 + DCT Spectral + ELA) on sample images.
"""

import os
import sys
import json

# Ensure export directory is on python path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from deepfake_engine.pipeline import DeepfakeDetector

def main():
    print("=" * 72)
    print("  KAALI DeepDefend -- Standalone Facial Forensics Engine")
    print("  Stream 1: MesoNet-4 Spatial CNN (Afchar et al., IEEE WIFS 2018)")
    print("  Stream 2: 2D DCT Spectral Analysis (Frank et al., ICML 2020)")
    print("  Stream 3: Error Level Analysis (ELA JPEG compression residuals)")
    print("=" * 72)

    detector = DeepfakeDetector()
    print("\n[+] Detector initialized successfully! Pretrained weights loaded.")

    # Locate sample benchmark images
    base_dir = os.path.dirname(os.path.abspath(__file__))
    deepfake_sample = os.path.join(base_dir, "deepfake_engine", "benchmark_data", "deepfake", "df00204.jpg")
    real_sample = os.path.join(base_dir, "deepfake_engine", "benchmark_data", "real", "real00240.jpg")

    samples = [
        ("Kaggle Deepfake Sample (Face-swap)", deepfake_sample),
        ("Kaggle Real Sample (Pristine)", real_sample),
    ]

    for label, img_path in samples:
        print("\n" + "-" * 72)
        print(f"[*] Testing: {label}")
        print(f"[*] File:    {img_path}")

        if not os.path.exists(img_path):
            print(f"[!] Warning: File {img_path} not found, skipping...")
            continue

        result = detector.analyze_image(img_path, generate_visual_heatmap=True)

        print(f"[*] Verdict:             {result.verdict}")
        print(f"[*] Manipulation Score:  {result.manipulation_score:.1f}%")
        print(f"[*] Authenticity Score:  {result.authenticity_score:.1f}%")
        print(f"[*] MesoNet Spatial:     {result.spatial_score:.1f}%")
        print(f"[*] DCT Frequency:       {result.frequency_score:.1f}%")
        print(f"[*] Faces Scanned:       {result.faces_detected}")
        print(f"[*] Forensic Diagnosis:  {result.forensic_notes}")
        if result.heatmap_base64:
            print(f"[*] Visual Heatmap:      Generated ({len(result.heatmap_base64)} chars base64 URI)")

    print("\n" + "=" * 72)
    print("  To scan any image of your own:")
    print("    python -m deepfake_engine.cli path/to/your/image.jpg")
    print("=" * 72)

if __name__ == "__main__":
    main()
