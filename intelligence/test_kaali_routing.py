import os
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from pydantic import ValidationError

from datetime import datetime, timedelta, timezone

from intelligence.kaali_routing import RiskReport, RouteRequest, assess_route, optimize_route


class FakeResponse:
    def raise_for_status(self):
        return None

    def json(self):
        return {
            "code": "Ok",
            "waypoints": [{"distance": 4}, {"distance": 8}],
            "routes": [
                {"distance": 1200, "duration": 600, "geometry": {"coordinates": [[74.872, 31.634], [74.881, 31.640]]}},
                {"distance": 1450, "duration": 510, "geometry": {"coordinates": [[74.872, 31.634], [74.876, 31.637], [74.881, 31.640]]}},
            ],
        }


class FakeAsyncClient:
    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return None

    async def get(self, *args, **kwargs):
        return FakeResponse()


def request(priority="lower_risk"):
    return RouteRequest(
        requestId="test-request",
        origin={"type": "Point", "coordinates": [74.872, 31.634]},
        destination={"type": "Point", "coordinates": [74.881, 31.640]},
        priority=priority,
    )


class KaaliRoutingTests(unittest.IsolatedAsyncioTestCase):
    async def test_provider_candidates_are_ranked_and_keep_geojson_order(self):
        with patch.dict(os.environ, {"OSRM_BASE_URL": "http://osrm.test", "OSRM_PROFILE": "walking"}), patch("intelligence.kaali_routing.httpx.AsyncClient", FakeAsyncClient):
            result = await optimize_route(request("fastest"))
        self.assertEqual(result.routes[0].durationSeconds, 510)
        self.assertEqual(result.routes[0].geometry.coordinates[0], (74.872, 31.634))
        self.assertIsNone(result.routes[0].riskScore)
        self.assertEqual(result.routes[0].riskStatus, "unknown")
        self.assertIn("unknown", result.routes[0].warnings[0])

    async def test_missing_provider_is_a_clear_configuration_error(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(HTTPException) as caught:
                await optimize_route(request())
        self.assertEqual(caught.exception.status_code, 503)

    def test_invalid_coordinate_ranges_are_rejected(self):
        with self.assertRaises(ValidationError):
            RouteRequest(
                requestId="bad",
                origin={"type": "Point", "coordinates": [200, 74.872]},
                destination={"type": "Point", "coordinates": [74.881, 31.640]},
            )

    def test_recent_relevant_moderated_hazard_increases_route_score(self):
        route = [(74.872, 31.634), (74.881, 31.640)]
        report = RiskReport(coordinates=(74.876, 31.637), category="poor_lighting", severity="high", observedAt=datetime.now(timezone.utc), corroborationCount=2)
        score, status, confidence, _, explanation, _ = assess_route(route, [report])
        self.assertGreater(score, 0)
        self.assertEqual(status, "estimated")
        self.assertGreater(confidence, 0)
        self.assertIn("1 recent moderated", explanation[0])

    def test_old_and_off_corridor_reports_do_not_create_risk_claim(self):
        route = [(74.872, 31.634), (74.881, 31.640)]
        old = RiskReport(coordinates=(74.876, 31.637), category="poor_lighting", severity="high", observedAt=datetime.now(timezone.utc) - timedelta(days=8))
        distant = RiskReport(coordinates=(74.9, 31.7), category="harassment_report", severity="high", observedAt=datetime.now(timezone.utc))
        result = assess_route(route, [old, distant])
        self.assertIsNone(result[0])
        self.assertEqual(result[1], "unknown")


if __name__ == "__main__":
    unittest.main()
