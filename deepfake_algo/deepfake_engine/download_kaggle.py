"""
Kaggle DFD (Deepfake Detection) Dataset Ingestion & Video Frame Extractor
Dataset: sanikatiwarekar/deep-fake-detection-dfd-entire-original-dataset (Google DFD on Kaggle)
"""

import os
import sys
import glob
import argparse
import subprocess
import cv2
from typing import Optional

from .face_detector import FaceDetector


def check_kaggle_auth() -> bool:
    """Checks if Kaggle CLI or credentials are present."""
    kaggle_json = os.path.expanduser("~/.kaggle/kaggle.json")
    kaggle_token = os.environ.get("KAGGLE_API_TOKEN")
    if os.path.exists(kaggle_json) or kaggle_token:
        return True
    return False


def download_dataset_cli(output_dir: str = "data/raw_kaggle"):
    """
    Downloads dataset via Kaggle CLI.
    Requires kaggle credentials configured.
    """
    os.makedirs(output_dir, exist_ok=True)
    dataset_name = "sanikatiwarekar/deep-fake-detection-dfd-entire-original-dataset"
    print(f"[*] Downloading {dataset_name} to {output_dir}...")
    print("[!] NOTE: This dataset contains ~38 GB of raw .mp4 videos.")
    print("    Ensure adequate disk space and internet connection.")

    cmd = [
        "kaggle", "datasets", "download",
        "-d", dataset_name,
        "-p", output_dir,
        "--unzip"
    ]
    try:
        subprocess.run(cmd, check=True)
        print(f"[+] Download complete in {output_dir}")
    except subprocess.CalledProcessError as e:
        print(f"[!] Kaggle CLI error: {e}")
        print("[!] To configure credentials:")
        print("    1. Go to https://www.kaggle.com/settings/api and click 'Generate New Token'")
        print("    2. Set environment variable: set KAGGLE_API_TOKEN=your_token_here")
        print("    3. Or save kaggle.json to %USERPROFILE%\\.kaggle\\kaggle.json")


def extract_faces_from_videos(
    video_dir: str,
    output_dir: str,
    fps_sample: float = 1.0,
    max_frames_per_video: int = 10,
    limit_videos: Optional[int] = None
):
    """
    Iterates over .mp4 video files, extracts face crops at specified fps,
    and saves them as 256x256 normalized images for training.
    """
    os.makedirs(output_dir, exist_ok=True)
    detector = FaceDetector()

    video_files = glob.glob(os.path.join(video_dir, "**", "*.mp4"), recursive=True)
    if not video_files:
        video_files = glob.glob(os.path.join(video_dir, "*.mp4"))

    if limit_videos:
        video_files = video_files[:limit_videos]

    print(f"[*] Found {len(video_files)} videos in {video_dir}. Extracting faces...")
    total_saved = 0

    for v_idx, vpath in enumerate(video_files):
        cap = cv2.VideoCapture(vpath)
        if not cap.isOpened():
            continue

        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        frame_interval = max(1, int(fps / fps_sample))
        frame_idx = 0
        extracted_for_video = 0
        vname = os.path.splitext(os.path.basename(vpath))[0]

        while cap.isOpened() and extracted_for_video < max_frames_per_video:
            ret, frame = cap.read()
            if not ret:
                break

            if frame_idx % frame_interval == 0:
                faces = detector.detect_faces(frame)
                if faces:
                    # Pick largest detected face
                    best_face = max(faces, key=lambda b: b[2] * b[3])
                    face_crop, _ = detector.extract_face(frame, best_face, target_size=(256, 256))
                    out_fname = f"{vname}_f{frame_idx}.jpg"
                    out_path = os.path.join(output_dir, out_fname)
                    cv2.imwrite(out_path, face_crop)
                    total_saved += 1
                    extracted_for_video += 1

            frame_idx += 1

        cap.release()
        if (v_idx + 1) % 5 == 0:
            print(f" -> Processed {v_idx + 1}/{len(video_files)} videos ({total_saved} faces extracted)")

    print(f"[+] Finished extracting. Total faces saved: {total_saved} -> {output_dir}")


def create_demo_dataset():
    """
    Creates a calibrated micro-dataset from existing project assets for immediate local testing.
    """
    print("[*] Generating instant local calibration dataset in data/train and data/val...")
    train_real = "data/train/real"
    train_fake = "data/train/fake"
    val_real = "data/val/real"
    val_fake = "data/val/fake"

    for d in [train_real, train_fake, val_real, val_fake]:
        os.makedirs(d, exist_ok=True)

    detector = FaceDetector()

    # Known Real Images
    reals = [
        "REAL.webp",
        "intelligence/deepfake/benchmark_data/real/real00240.jpg",
        "intelligence/deepfake/benchmark_data/real/real00772.jpg"
    ]
    # Known Fakes
    fakes = [
        "TEST.png",
        "intelligence/deepfake/benchmark_data/deepfake/df01254.jpg",
        "intelligence/deepfake/benchmark_data/deepfake/df00204.jpg"
    ]

    count_real, count_fake = 0, 0
    # Process reals
    for rpath in reals:
        if os.path.exists(rpath):
            img = cv2.imread(rpath)
            if img is not None:
                faces = detector.detect_faces(img)
                for i, f in enumerate(faces):
                    crop, _ = detector.extract_face(img, f, (256, 256))
                    # Save with simple augmentations
                    cv2.imwrite(os.path.join(train_real, f"real_{count_real}.jpg"), crop)
                    cv2.imwrite(os.path.join(train_real, f"real_flip_{count_real}.jpg"), cv2.flip(crop, 1))
                    cv2.imwrite(os.path.join(val_real, f"real_val_{count_real}.jpg"), crop)
                    count_real += 1

    # Process fakes
    for fpath in fakes:
        if os.path.exists(fpath):
            img = cv2.imread(fpath)
            if img is not None:
                faces = detector.detect_faces(img)
                for i, f in enumerate(faces):
                    crop, _ = detector.extract_face(img, f, (256, 256))
                    cv2.imwrite(os.path.join(train_fake, f"fake_{count_fake}.jpg"), crop)
                    cv2.imwrite(os.path.join(train_fake, f"fake_flip_{count_fake}.jpg"), cv2.flip(crop, 1))
                    cv2.imwrite(os.path.join(val_fake, f"fake_val_{count_fake}.jpg"), crop)
                    count_fake += 1

    print(f"[+] Demo dataset created: {count_real * 2} train reals, {count_fake * 2} train fakes.")
    print("    You can now run: python -m intelligence.deepfake.train --epochs 5 --batch-size 4")


def main():
    parser = argparse.ArgumentParser(description="Kaggle DFD Downloader and Frame Extractor")
    parser.add_argument("--download", action="store_true", help="Download dataset from Kaggle via CLI")
    parser.add_argument("--extract", action="store_true", help="Extract face crops from downloaded MP4 videos")
    parser.add_argument("--video-dir", type=str, default="data/raw_kaggle", help="Directory containing .mp4 videos")
    parser.add_argument("--output-dir", type=str, default="data/extracted", help="Directory to save extracted face crops")
    parser.add_argument("--fps", type=float, default=1.0, help="Frames per second to sample from each video")
    parser.add_argument("--max-frames", type=int, default=10, help="Max frames per video")
    parser.add_argument("--synth-demo", action="store_true", help="Generate instant local demo dataset for training")
    args = parser.parse_args()

    if args.synth_demo:
        create_demo_dataset()
        return

    if args.download:
        if not check_kaggle_auth():
            print("[!] Kaggle authentication not found.")
            print("    Please set KAGGLE_API_TOKEN or place kaggle.json in ~/.kaggle/")
            print("    Run with --synth-demo to generate a local calibration set immediately without 38GB download.")
            return
        download_dataset_cli()

    if args.extract:
        extract_faces_from_videos(args.video_dir, args.output_dir, fps_sample=args.fps, max_frames_per_video=args.max_frames)

    if not args.download and not args.extract and not args.synth_demo:
        parser.print_help()


if __name__ == "__main__":
    main()
