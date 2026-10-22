"""Kaali walking-route adapter and explainable community-report ranking."""

import math
import os
from datetime import datetime, timezone
from typing import Literal
from uuid import uuid4

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, field_validator

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

app = FastAPI(title="Kaali Routing Service", version="1.1.0")


class GeoPoint(BaseModel):
    type: Literal["Point"]
    coordinates: tuple[float, float]

    @field_validator("coordinates")
    @classmethod
    def validate_coordinates(cls, value):
        lon, lat = value
        if not (-180 <= lon <= 180 and -90 <= lat <= 90):
            raise ValueError("Coordinates must be [longitude, latitude]")
        return value


class RiskReport(BaseModel):
    coordinates: tuple[float, float]
    category: str
    severity: Literal["low", "medium", "high"]
    observedAt: datetime
    corroborationCount: int = Field(default=0, ge=0)


class RouteRequest(BaseModel):
    requestId: str = Field(min_length=1, max_length=100)
    origin: GeoPoint
    destination: GeoPoint
    mode: Literal["walking"] = "walking"
    priority: Literal["fastest", "balanced", "lower_risk"] = "lower_risk"
    maxDetourRatio: float = Field(default=1.25, ge=1.0, le=2.5)
    departureTime: str | None = None
    riskReports: list[RiskReport] = Field(default_factory=list, max_length=200)


class GeoLineString(BaseModel):
    type: Literal["LineString"]
    coordinates: list[tuple[float, float]] = Field(min_length=2)

    @field_validator("coordinates")
    @classmethod
    def validate_coordinates(cls, value):
        for lon, lat in value:
            if not (-180 <= lon <= 180 and -90 <= lat <= 90):
                raise ValueError("LineString coordinates must be [longitude, latitude]")
        return value


class Candidate(BaseModel):
    routeId: str
    distanceMeters: float
    durationSeconds: float
    riskScore: float | None
    riskStatus: Literal["measured", "estimated", "unknown"]
    riskConfidence: float
    riskScale: dict[str, float | bool]
    riskLabel: str
    riskExplanation: list[str]
    solverStatus: str
    geometry: GeoLineString
    warnings: list[str]


class RouteResponse(BaseModel):
    status: Literal["success"] = "success"
    optimizerVersion: str = "osrm-candidate-ranking-v1"
    roadGraphVersion: str = "configured-osrm"
    riskModelVersion: str = "moderated-corridor-reports-v1"
    routes: list[Candidate]


def _segment_distance_m(point, start, end):
    # Local equirectangular projection is sufficient for the small Kaali pilot area.
    lat0 = math.radians(point[1])
    scale_x = 111_320 * math.cos(lat0)
    scale_y = 110_574
    px, py = point[0] * scale_x, point[1] * scale_y
    ax, ay = start[0] * scale_x, start[1] * scale_y
    bx, by = end[0] * scale_x, end[1] * scale_y
    dx, dy = bx - ax, by - ay
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / max(dx * dx + dy * dy, 1e-9)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def assess_route(coordinates, reports, now=None):
    now = now or datetime.now(timezone.utc)
    matches = []
    weights = {"low": 1.0, "medium": 2.0, "high": 3.0}
    for report in reports:
        observed = report.observedAt
        if observed.tzinfo is None:
            observed = observed.replace(tzinfo=timezone.utc)
        age_days = max(0.0, (now - observed).total_seconds() / 86400)
        if age_days > 7:
            continue
        if min(_segment_distance_m(report.coordinates, a, b) for a, b in zip(coordinates, coordinates[1:])) > 75:
            continue
        freshness = max(0.0, 1.0 - age_days / 7)
        corroboration = min(1.5, 1 + report.corroborationCount * 0.15)
        category_factor = 1.0 if report.category in {"poor_lighting", "isolated_area", "harassment_report"} else 0.7
        matches.append(weights[report.severity] * freshness * corroboration * category_factor)
    if not matches:
        return None, "unknown", 0.0, "unknown", ["No recent, moderated report matched this route corridor; unknown does not mean safe."], []
    # Monotonic bounded index: larger/repeated recent hazards increase the score.
    score = min(100.0, round(100 * (1 - math.exp(-sum(matches) / 5)), 1))
    confidence = min(0.9, round(0.25 + len(matches) * 0.15, 2))
    return score, "estimated", confidence, "estimated_report_index", [
        f"{len(matches)} recent moderated report(s) matched within 75 m of the route.",
        "Index uses report severity, freshness and corroboration; it is not a prediction or safety guarantee.",
    ], matches


@app.get("/internal/health")
async def health():
    configured = bool(os.getenv("OSRM_BASE_URL", "").strip() and os.getenv("OSRM_PROFILE", "").strip())
    return {"status": "configured" if configured else "routing_unconfigured", "provider": "OSRM", "profile": os.getenv("OSRM_PROFILE") or None}


@app.post("/internal/route/optimize", response_model=RouteResponse)
async def optimize_route(request: RouteRequest) -> RouteResponse:
    base_url = os.getenv("OSRM_BASE_URL", "").rstrip("/")
    profile = os.getenv("OSRM_PROFILE", "").strip()
    if not base_url or not profile:
        raise HTTPException(status_code=503, detail={"code": "ROUTING_NOT_CONFIGURED", "message": "Configure OSRM_BASE_URL and a supported OSRM_PROFILE (for walking, the deployment must use a walking graph)."})
    try:
        timeout = float(os.getenv("OSRM_TIMEOUT_SECONDS", "8"))
        if timeout <= 0:
            raise ValueError("timeout must be positive")
    except ValueError as exc:
        raise HTTPException(status_code=503, detail={"code": "ROUTING_CONFIGURATION_INVALID", "message": "OSRM_TIMEOUT_SECONDS must be positive."}) from exc
    origin, destination = request.origin.coordinates, request.destination.coordinates
    coordinates = f"{origin[0]},{origin[1]};{destination[0]},{destination[1]}"
    params = {"overview": "full", "geometries": "geojson", "steps": "false"}
    if os.getenv("OSRM_ALTERNATIVES", "false").lower() in {"true", "1", "yes"}:
        params["alternatives"] = "true"
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(f"{base_url}/route/v1/{profile}/{coordinates}", params=params)
            response.raise_for_status()
            payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=503, detail={"code": "ROUTING_PROVIDER_UNAVAILABLE", "message": "The configured routing provider could not return a valid response."}) from exc
    if not isinstance(payload, dict) or payload.get("code") != "Ok" or not isinstance(payload.get("routes"), list) or not payload["routes"]:
        raise HTTPException(status_code=422, detail={"code": "NO_FEASIBLE_ROUTE", "message": "The configured routing provider found no route."})
    try:
        waypoints = payload.get("waypoints")
        if not isinstance(waypoints, list) or len(waypoints) != 2 or any(not isinstance(w, dict) or not isinstance(w.get("distance"), (int, float)) for w in waypoints):
            raise ValueError("missing OSRM snap metadata")
        max_snap = float(os.getenv("OSRM_MAX_SNAP_DISTANCE_METERS", "250"))
        if max_snap <= 0:
            raise HTTPException(status_code=503, detail={"code": "ROUTING_CONFIGURATION_INVALID", "message": "OSRM_MAX_SNAP_DISTANCE_METERS must be positive."})
        if any(float(w["distance"]) > max_snap for w in waypoints):
            raise HTTPException(status_code=422, detail={"code": "NO_FEASIBLE_ROUTE", "message": "Origin or destination is too far from a routable walking network point."})
        valid = [r for r in payload["routes"] if isinstance(r, dict) and isinstance(r.get("distance"), (int, float)) and math.isfinite(float(r["distance"])) and float(r["distance"]) >= 0 and isinstance(r.get("duration"), (int, float)) and math.isfinite(float(r["duration"])) and float(r["duration"]) >= 0 and isinstance(r.get("geometry"), dict) and isinstance(r["geometry"].get("coordinates"), list) and len(r["geometry"]["coordinates"]) >= 2]
        if not valid:
            raise ValueError("no valid route geometry")
        baseline = min(float(r["distance"]) for r in valid)
        candidates = []
        for index, route in enumerate(valid):
            distance = float(route["distance"])
            if distance > baseline * request.maxDetourRatio:
                continue
            points = route["geometry"]["coordinates"]
            if any(not isinstance(p, list) or len(p) != 2 or not all(isinstance(v, (int, float)) for v in p) for p in points):
                continue
            coordinates_out = [(float(p[0]), float(p[1])) for p in points]
            risk_score, risk_status, confidence, label, explanation, hazard_weights = assess_route(coordinates_out, request.riskReports)
            warnings = [] if risk_score is not None else ["Risk data is unknown; this route is not confirmed safe."]
            candidates.append(Candidate(routeId=f"osrm-{uuid4().hex[:12]}-{index + 1}", distanceMeters=distance, durationSeconds=float(route["duration"]), riskScore=risk_score, riskStatus=risk_status, riskConfidence=confidence, riskScale={"min": 0, "max": 100, "higherIsRiskier": True}, riskLabel=label, riskExplanation=explanation, solverStatus="FEASIBLE", geometry=GeoLineString(type="LineString", coordinates=coordinates_out), warnings=warnings))
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=503, detail={"code": "ROUTING_RESPONSE_INVALID", "message": "The configured routing provider returned an invalid route response."}) from exc
    if not candidates:
        raise HTTPException(status_code=422, detail={"code": "NO_FEASIBLE_ROUTE", "message": "No valid route geometry satisfies the configured detour limit."})
    if request.priority == "fastest":
        candidates.sort(key=lambda r: r.durationSeconds)
    elif request.priority == "balanced":
        candidates.sort(key=lambda r: (r.durationSeconds, r.distanceMeters))
    elif any(r.riskScore is not None for r in candidates):
        candidates.sort(key=lambda r: (r.riskScore if r.riskScore is not None else 101, r.distanceMeters))
    else:
        candidates.sort(key=lambda r: (r.distanceMeters, r.durationSeconds))
    return RouteResponse(routes=candidates)
