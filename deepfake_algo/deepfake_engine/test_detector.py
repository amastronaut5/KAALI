"""
Unit Test Suite for KAALI Deepfake & Morph Detection Pipeline
"""

import os
import unittest
import numpy as np
import cv2

import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

try:
    from deepfake_engine.pipeline import DeepfakeDetector, DetectionResult
    from deepfake_engine.spectral_analyzer import SpectralAnalyzer
    from deepfake_engine.mesonet import SpatialArtifactDetector
except ImportError:
    try:
        from pipeline import DeepfakeDetector, DetectionResult
        from spectral_analyzer import SpectralAnalyzer
        from mesonet import SpatialArtifactDetector
    except ImportError:
        from intelligence.deepfake.pipeline import DeepfakeDetector, DetectionResult
        from intelligence.deepfake.spectral_analyzer import SpectralAnalyzer
        from intelligence.deepfake.mesonet import SpatialArtifactDetector


class TestDeepfakeDetection(unittest.TestCase):

    def setUp(self):
        self.detector = DeepfakeDetector()
        self.spectral_analyzer = SpectralAnalyzer()
        self.spatial_detector = SpatialArtifactDetector()

    def test_spectral_analyzer_output_structure(self):
        # Create 256x256 test image
        img = np.random.randint(0, 255, (256, 256, 3), dtype=np.uint8)
        res = self.spectral_analyzer.analyze_image(img)
        
        self.assertIn("frequency_score", res)
        self.assertIn("high_freq_energy_ratio", res)
        self.assertIn("spectral_decay_slope", res)
        self.assertIsInstance(res["frequency_score"], float)

    def test_spatial_detector_output_structure(self):
        img = np.random.randint(0, 255, (256, 256, 3), dtype=np.uint8)
        res = self.spatial_detector.analyze_face(img)

        self.assertIn("spatial_score", res)
        self.assertIn("meso_activation", res)
        self.assertIn("boundary_blending_score", res)

    def test_end_to_end_pipeline(self):
        # Create a test portrait image
        img = np.ones((300, 300, 3), dtype=np.uint8) * 150
        cv2.circle(img, (150, 150), 60, (200, 180, 160), -1)

        result = self.detector.analyze_image(img, generate_visual_heatmap=True)

        self.assertIsInstance(result, DetectionResult)
        self.assertIn(result.verdict, ["AUTHENTIC", "SUSPICIOUS", "LIKELY_DEEPFAKE", "CONFIRMED_DEEPFAKE"])
        self.assertTrue(0.0 <= result.manipulation_score <= 100.0)
        self.assertTrue(0.0 <= result.authenticity_score <= 100.0)
        self.assertIsNotNone(result.heatmap_base64)
        self.assertTrue(result.heatmap_base64.startswith("data:image/png;base64,"))


if __name__ == "__main__":
    unittest.main()
