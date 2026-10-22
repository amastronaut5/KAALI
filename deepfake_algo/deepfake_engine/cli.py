"""
Command-Line Interface (CLI) for KAALI Deepfake & Face Morph Detection
Usage:
    python -m intelligence.deepfake.cli <path_to_image> [--save-heatmap]
    python -m intelligence.deepfake.cli --demo
"""

import sys
import os
import argparse
import json
import cv2
import numpy as np

# Ensure parent directory and package directory are on python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

try:
    from deepfake_engine.pipeline import DeepfakeDetector
except ImportError:
    try:
        from pipeline import DeepfakeDetector
    except ImportError:
        from intelligence.deepfake.pipeline import DeepfakeDetector


def print_banner():
    banner = """
========================================================================
    KAALI DeepDefend -- Facial Forgery & Morph Detection Engine
    Dual-Stream Architecture: MesoNet Spatial + Frank et al. DCT FFT
========================================================================
"""
    print(banner)


def run_demo():
    print("[*] Generating synthetic test images for benchmark demonstration...")
    detector = DeepfakeDetector()

    # 1. Create a simulated natural face image (smooth gradients, normal noise)
    h, w = 300, 300
    natural_img = np.ones((h, w, 3), dtype=np.uint8) * 180
    # Add natural soft skin tones and gentle lighting gradient
    for y in range(h):
        for x in range(w):
            val = int(180 + 30 * np.sin(x / 50.0) + 20 * np.cos(y / 40.0))
            natural_img[y, x] = [val - 15, val, val + 20]
    # Add natural sensor Gaussian noise
    noise = np.random.normal(0, 3, (h, w, 3)).astype(np.int16)
    natural_img = np.clip(natural_img.astype(np.int16) + noise, 0, 255).astype(np.uint8)

    # 2. Create a simulated GAN deepfake (with periodic upsampling artifacts & blurred seam)
    gan_img = natural_img.copy()
    # Add checkerboard periodic spectral artifact (typical of transposed conv)
    y_idx, x_idx = np.indices((h, w))
    periodic_grid = (np.sin(x_idx * 0.8) * np.cos(y_idx * 0.8) * 35).astype(np.int16)
    gan_img = np.clip(gan_img.astype(np.int16) + periodic_grid[:, :, None], 0, 255).astype(np.uint8)
    # Add boundary blending blur seam around center
    center_y, center_x = h // 2, w // 2
    cv2.circle(gan_img, (center_x, center_y), 75, (120, 140, 200), -1)
    gan_img = cv2.GaussianBlur(gan_img, (7, 7), 0)

    demo_dir = os.path.join(os.path.dirname(__file__), "demo_outputs")
    os.makedirs(demo_dir, exist_ok=True)

    path_natural = os.path.join(demo_dir, "sample_natural.jpg")
    path_gan = os.path.join(demo_dir, "sample_deepfake_gan.jpg")
    cv2.imwrite(path_natural, natural_img)
    cv2.imwrite(path_gan, gan_img)

    print(f"[+] Saved test inputs to {demo_dir}/")

    print("\n--- TEST 1: Inspecting Natural Image Sample ---")
    res1 = detector.analyze_image(path_natural)
    display_result(res1, path_natural)

    print("\n--- TEST 2: Inspecting Deepfake/GAN Artifact Sample ---")
    res2 = detector.analyze_image(path_gan)
    display_result(res2, path_gan)


def display_result(result, image_path: str):
    status_icon = "[!!] ALERT" if result.is_deepfake else "[OK] AUTHENTIC"
    color_code = "\033[91m" if result.is_deepfake else "\033[92m"
    reset_code = "\033[0m"

    print(f"\nTarget File: {image_path}")
    print(f"Status: {color_code}{status_icon} -- {result.verdict}{reset_code}")
    print(f"  * Manipulation Score   : {result.manipulation_score}%")
    print(f"  * Authenticity Score   : {result.authenticity_score}%")
    print(f"  * Classification Type  : {result.manipulation_type}")
    print(f"  * Spatial Stream (Meso): {result.spatial_score}%")
    print(f"  * Frequency Stream(DCT): {result.frequency_score}%")
    print(f"  * Bounding Box         : {result.bounding_box}")
    print(f"  * Forensic Analysis    : {result.forensic_notes}")


def main():
    print_banner()

    parser = argparse.ArgumentParser(description="KAALI Deepfake & Morph Detection CLI")
    parser.add_argument("image_path", nargs="?", help="Path to suspect image file")
    parser.add_argument("--demo", action="store_true", help="Run automated synthetic test benchmark")
    parser.add_argument("--save-heatmap", action="store_true", help="Save forensic heatmap overlay to disk")

    args = parser.parse_args()

    if args.demo or not args.image_path:
        run_demo()
        return

    if not os.path.exists(args.image_path):
        print(f"[!] Error: File '{args.image_path}' does not exist.")
        sys.exit(1)

    print(f"[*] Analyzing image: {args.image_path}")
    detector = DeepfakeDetector()
    result = detector.analyze_image(args.image_path, generate_visual_heatmap=True)

    display_result(result, args.image_path)

    if args.save_heatmap and result.heatmap_base64:
        output_heatmap = f"heatmap_{os.path.basename(args.image_path)}"
        # Decode base64 to file
        header, encoded = result.heatmap_base64.split(",", 1)
        import base64
        with open(output_heatmap, "wb") as fh:
            fh.write(base64.b64decode(encoded))
        print(f"[+] Saved visual anomaly heatmap to: {output_heatmap}")


if __name__ == "__main__":
    main()
