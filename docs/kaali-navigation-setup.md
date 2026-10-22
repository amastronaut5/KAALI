# Kaali navigation setup

## Current route flow

The React client accepts origin and destination as `latitude, longitude` coordinates. It sends the existing authenticated `POST /api/v1/routes` request to Express. Express validates the coordinates against the configured pilot bounding box, calls `POST /internal/route/optimize`, validates the existing response shape, and stores the compact route result in the existing `routeRequests` collection. The Python service calls the configured OSRM instance for real candidate geometry and metrics, filters candidates by the requested detour limit, and ranks them by the requested preference. The selected geometry is displayed by MapLibre.

Navigation uses the existing protected session endpoints. Browser geolocation updates the location marker, sends throttled location updates to the active session, and requests rerouting after two accurate off-route readings. The previous route stays visible when rerouting fails. Location is not shared with contacts by default.

Risk assessment uses only recent reports that are both approved and explicitly marked `source: moderated_user_report`. Ordinary submitted reports remain pending and are not used for route ranking. A matching report within 75 m of a route contributes to a bounded explainable index using severity, freshness, and corroboration. Routes with no match return a null `riskScore`, `riskStatus: unknown`, and zero confidence; missing reports do not mean safe. A trusted moderation workflow is not currently exposed as an API, so this feed remains empty until an authorized operator marks reports through a trusted process. This is community-report context, not a prediction or guarantee of safety.

## Configuration

Copy `server/.env.example` to `server/.env` and `client/.env.example` to `client/.env.local`, then configure:

| Variable | Service | Purpose |
| --- | --- | --- |
| `MONGODB_URI` | Express | Existing MongoDB connection; local default uses the `kaali` database |
| `JWT_SECRET` | Express | Replace the development placeholder with a secure secret |
| `PYTHON_ROUTING_URL` | Express | Base URL for the FastAPI routing service |
| `PYTHON_SERVICE_TIMEOUT_MS` | Express | Internal routing call timeout |
| `PILOT_BBOX_*` | Express | Approximate NYC five-borough test bounds; align with your extract |
| `VITE_API_URL` | React | Public Express API base URL |
| `VITE_MAP_STYLE_URL` | React | Valid hosted MapLibre style URL from a provider you are authorized to use |
| `OSRM_BASE_URL` | FastAPI | Base URL of an OSRM service; no public demo server is assumed |
| `OSRM_PROFILE` | FastAPI | Required OSRM profile identifier; use `foot` for a graph preprocessed with OSRM's foot profile |
| `OSRM_ALTERNATIVES` | FastAPI | Set `true` only when this OSRM deployment supports alternatives; defaults to `false` |
| `OSRM_TIMEOUT_SECONDS` | FastAPI | OSRM request timeout, default 8 seconds |
| `OSRM_MAX_SNAP_DISTANCE_METERS` | FastAPI | Maximum distance from requested coordinates to OSRM's snapped walking graph points, default 250 m |
| `VITE_ROUTE_DEVIATION_THRESHOLD_METERS` | React | Minimum route deviation before GPS accuracy is factored in; default 60 m |

MapLibre does not include map tiles. Configure a style URL and its provider's credentials/usage terms outside source control. If unset or unavailable, the route details remain usable and the map reports the configuration error. Text place-name geocoding is not implemented; enter pilot-area coordinates directly.

## Run locally

From the repository root:

```powershell
cd server
npm install
npm run dev
```

In another terminal at the repository root, install the Python service dependencies and start FastAPI:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r intelligence/requirements.txt
Copy-Item intelligence/.env.example intelligence/.env
# Edit intelligence/.env to point at your OSRM instance and its walking profile.
python -m uvicorn intelligence.kaali_routing:app --host 0.0.0.0 --port 8000
```

In a third terminal:

```powershell
cd client
npm install
npm run dev
```

Authenticate through the existing OTP API before requesting a route. In development, the server logs the mock OTP; use it with `POST /api/v1/auth/verify` to obtain the bearer token. Do not use mock OTP logging in production.

## OSM data

Kaali does not download or store OSM data per request. Point `OSRM_BASE_URL` to a running OSRM service prepared with a regional OSM PBF extract that covers the configured pilot bbox and route approaches. The OSRM host owns extraction, profile selection, graph build, and data refresh cadence. Keep large graph files outside MongoDB and version/refresh them through the routing deployment process. No regional extract is bundled in this repository.

The FastAPI `/internal/health` response reports whether `OSRM_BASE_URL` and `OSRM_PROFILE` are configured. It is a configuration check; verify live provider connectivity with a route request.

## Real-provider route smoke test

With MongoDB, Express, FastAPI, a configured walking-profile OSRM server, and the client running, authenticate using the development-only logged OTP. Then send `POST /api/v1/routes` with the returned bearer token:

```powershell
$headers = @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" }
$body = '{"origin":{"latitude":40.7580,"longitude":-73.9855},"destination":{"latitude":40.7536,"longitude":-73.9832},"mode":"walking","priority":"lower_risk","maxDetourRatio":1.25}'
Invoke-RestMethod -Method Post -Uri "http://localhost:5000/api/v1/routes" -Headers $headers -Body $body
```

Confirm the response geometry has at least two `[longitude, latitude]` coordinates and provider-derived distance and duration. With no trusted moderated corridor reports, expect `riskScore: null` and `riskStatus: "unknown"`.

## Current limits

- Candidate alternatives depend on the configured OSRM deployment and its profile; only provider-returned geometries are shown.
- Geocoding suggestions and an operator-facing report moderation API are not implemented. Only trusted manually moderated report records can affect route ranking.
- Socket.IO is not initialized; the current navigation/session workflows use authenticated HTTP endpoints, and there is no implemented real-time consumer that justifies broadcasting sensitive location data.
- Deepfake image detection is not implemented in this application. No fabricated detector score is returned; the Python service in this folder handles routing only.
- OTP delivery and production SMS/WhatsApp/email providers are not implemented. OTP codes are development-only; notification mock results are `unknown`, and production notifications fail as `PROVIDER_NOT_CONFIGURED` until a real adapter is configured.
- The FastAPI service is routing-only; it does not replace the separate Python detection service implied by the broader architecture.
- A hosted map style, MongoDB, OSRM, and an OTP delivery path or development OTP log are required for a working local trip.
