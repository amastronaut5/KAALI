# API Design

**Product:** Kaali --- Women's Safety Platform\
**Version:** 1.1 --- Hackathon implementation contract (canonical public contract)\
**Date:** 22 October 2026\
**Frontend:** React + TypeScript + Vite + MapLibre GL JS\
**Backend:** Node.js + Express + TypeScript\
**Intelligence:** Python + FastAPI (OSRM route adapter; custom CP-SAT and
image manipulation detection are not implemented)\
**Database:** MongoDB Atlas\
**Realtime:** Browser Geolocation API + authenticated HTTP session updates; Socket.IO is not initialized\
**Maps:** MapLibre GL JS with a configured map-tile provider; road
data/graph from OpenStreetMap where appropriate

------------------------------------------------------------------------

## 1. Purpose

This is the final API contract for the Kaali MVP. It supports:

1.  **Prevent:** custom safety-aware route planning, route display on a
    live map, GPS tracking, ETA/distance updates, deviation detection,
    and route recalculation.
2.  **Respond:** SOS incidents, trusted contacts, expiring live-location
    sharing, and notification delivery tracking.
3.  **Recover:** image manipulation/deepfake analysis and
    user-controlled evidence/recovery cases.
4.  **Community safety:** crowd-sourced road/safety reports that can
    inform route risk estimates.

This API defines the backend contracts. A moving marker, map camera,
route polyline, and local GPS display are primarily frontend behaviors
using MapLibre and browser geolocation; they are not provided
automatically by REST endpoints.

**Current repository implementation note:** route generation uses
provider-returned OSRM candidates and deterministic preference sorting.
CP-SAT and a local road graph are not present. Trusted moderated reports
can add explainable corridor context; when no report matches, `riskScore`
is null and `riskStatus` is `unknown`. No deepfake detection endpoint or
Socket.IO server is currently implemented. See `kaali-navigation-setup.md`
for setup and implementation limits.

## 2. Architecture and ownership

``` mermaid
flowchart TD
    UI[React + MapLibre UI] -->|HTTPS REST| API[Express API]
    UI -->|Socket.IO| WS[Express Socket.IO]
    UI -->|GPS watchPosition| GPS[Location updates]
    GPS --> API
    API --> DB[(MongoDB Atlas)]
    API -->|Private JSON| ROUTE[FastAPI routing service]
    ROUTE --> OPT[Custom CP-SAT optimizer]
    OPT --> ROUTE
    API -->|Private multipart request| DF[FastAPI detection service]
    API --> MSG[SMS / WhatsApp / Email / Push provider]
    WS --> VIEW[Authorized trusted-contact map]
```

### Responsibility boundaries

-   **React + MapLibre:** render the map, route geometry,
    current-position marker, remaining route, route choice, ETA panel,
    and rerouting UI.
-   **Browser Geolocation API:** provides location updates while
    permission and browser execution are available.
-   **Express:** public API gateway; authentication, validation,
    authorization, database writes, route orchestration, incident
    lifecycle, notifications, and Socket.IO authorization.
-   **Python routing service:** builds/evaluates candidate paths and
    runs the custom CP-SAT optimization. It returns structured route
    candidates; it does not write application records.
-   **Python detection service:** preprocesses uploaded images, runs the
    trained model, and returns structured inference results.
-   **MongoDB Atlas:** stores application records and compact route
    results, not the full road graph or raw images by default.
-   **Notification provider:** attempts delivery and returns provider
    statuses.
-   **SOS reliability rule:** SOS creation and notification
    orchestration must work even when either Python service is
    unavailable.

## 3. Base URL and shared conventions

Use `/api/v1` for public endpoints.

Local development example:

-   Frontend: `http://localhost:5173`
-   Express: `http://localhost:5000`
-   FastAPI: `http://localhost:8000` (internal service; browser must not
    call it directly)

Production domains are deployment-specific; do not hard-code example
domains into application logic.

### Standard headers

``` http
Authorization: Bearer <access-token>
Content-Type: application/json
X-Request-Id: <optional-client-generated-id>
```

For multipart uploads, allow the HTTP client to set the multipart
boundary automatically.

### Standard success envelope

``` json
{
  "data": {},
  "meta": {
    "requestId": "request-id"
  }
}
```

### Standard error envelope

``` json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request contains invalid fields.",
    "details": [
      {
        "field": "destination",
        "issue": "Required"
      }
    ],
    "requestId": "request-id"
  }
}
```

### Conventions

-   IDs are serialized as strings.
-   Timestamps use ISO 8601 UTC.
-   Public route request coordinates use
    `{ "latitude": number, "longitude": number }`.
-   GeoJSON returned by route geometry uses `[longitude, latitude]`.
-   A swapped `[lat, lon]` pair is still numerically valid in India
    (e.g. `[31.63, 74.87]`), so range checks are not enough. Express
    also validates coordinates against a configurable pilot-area
    bounding box and rejects points outside it with `VALIDATION_ERROR`.
-   Validate with Zod in Express and Pydantic in FastAPI.
-   Apply authentication, authorization, rate limiting, and input
    validation at API boundaries.
-   Do not return stack traces, credentials, model artifact paths,
    private contact details, or sensitive location trails to
    unauthorized clients.

Suggested HTTP statuses: `200`, `201`, `202`, `204`, `400`, `401`,
`403`, `404`, `409`, `413`, `422`, `429`, `500`, `502`, `503`.

------------------------------------------------------------------------

## 4. Authentication and user profile

### `POST /api/v1/auth/otp`

Request an OTP.

Request:

``` json
{
  "channel": "phone",
  "destination": "+911234567890"
}
```

Response `202`:

``` json
{
  "data": {
    "challengeId": "challenge-id",
    "expiresInSeconds": 300
  }
}
```

Apply destination/IP rate limits, attempt limits, short expiry, and
non-enumerating responses. Never log OTP values. Challenges are persisted in `otpChallenges` (hashed code, TTL, attempt counter) and sessions in `authSessions`; see database-design §3.13--3.14.

### `POST /api/v1/auth/verify`

Verify an OTP and establish a session.

Request:

``` json
{
  "challengeId": "challenge-id",
  "code": "123456"
}
```

Response `200`:

``` json
{
  "data": {
    "accessToken": "short-lived-token",
    "expiresInSeconds": 900,
    "user": {
      "id": "user-id",
      "displayName": "Example User",
      "preferredLanguage": "en"
    }
  }
}
```

Use a secure HTTP-only cookie session or a properly designed token
strategy in production.

### `POST /api/v1/auth/logout`

Invalidate the session or refresh token where supported. Returns `204`.

### `GET /api/v1/users/me`

Return the authenticated user's profile/preferences.

### `PATCH /api/v1/users/me`

Update allowed profile fields, language, and consent preferences. Do not
permit clients to edit privileged fields.

------------------------------------------------------------------------

## 5. Trusted contacts

### `GET /api/v1/contacts`

List the current user's contacts.

### `POST /api/v1/contacts`

Create a contact/invitation.

Request:

``` json
{
  "name": "Trusted Contact",
  "phoneE164": "+911234567890",
  "email": "trusted@example.com",
  "relationship": "friend",
  "channels": ["sms", "whatsapp"],
  "priority": 1
}
```

Response `201`:

``` json
{
  "data": {
    "id": "contact-id",
    "status": "pending",
    "invitationExpiresAt": "2026-10-22T12:00:00Z"
  }
}
```

### `POST /api/v1/contacts/:contactId/accept`

Accept a valid invitation. The recipient may not be a Kaali user, so
the call is authorized by the invitation token, not by a user session.

Request:

``` json
{
  "invitationToken": "high-entropy-token-from-invite-link"
}
```

Express compares the hash of the token to `contacts.invitation.tokenHash`,
checks expiry, and sets `status: accepted`. Rate-limit this endpoint.

### `PATCH /api/v1/contacts/:contactId`

Update permitted contact details or priority.

### `DELETE /api/v1/contacts/:contactId`

Revoke/remove the contact and invalidate any pending invitation. Returns
`204`.

Statuses: `pending`, `accepted`, `declined`, `revoked`.

Only the owner or explicitly authorized recipient may perform the
relevant action.

------------------------------------------------------------------------

## 6. Real-time route navigation

### 6.1 `POST /api/v1/routes`

Create an optimized route request. Express calls the internal Python
routing service, validates the response, stores compact result metadata,
and returns route geometry for rendering.

Request:

``` json
{
  "origin": {
    "latitude": 31.634,
    "longitude": 74.8723
  },
  "destination": {
    "latitude": 31.64,
    "longitude": 74.88
  },
  "mode": "walking",
  "priority": "lower_risk",
  "maxDetourRatio": 1.25,
  "departureTime": "2026-10-22T18:00:00Z"
}
```

Allowed `priority`: `fastest`, `balanced`, `lower_risk`.\
For MVP, allow only routing modes that the routing engine actually
supports, e.g. `walking`.

Response `200`:

``` json
{
  "data": {
    "routeRequestId": "route-request-id",
    "optimizerVersion": "cp-sat-v1",
    "roadGraphVersion": "osm-city-snapshot-v1",
    "riskModelVersion": "risk-v1",
    "routes": [
      {
        "routeId": "candidate-1",
        "distanceMeters": 2100,
        "durationSeconds": 1680,
        "riskScore": 34,
        "riskScale": { "min": 0, "max": 100, "higherIsRiskier": true },
        "riskLabel": "estimated_lower_risk",
        "geometry": {
          "type": "LineString",
          "coordinates": [
            [74.8723, 31.634],
            [74.876, 31.637],
            [74.88, 31.64]
          ]
        },
        "warnings": [
          "Risk is estimated from available data and does not guarantee safety."
        ]
      }
    ],
    "selectedRouteId": "candidate-1"
  }
}
```

The sample coordinates, score, and times are illustrative. The service
must return only values it actually calculates.

**Frontend behavior after this response**

1.  Render the map using MapLibre GL JS.
2.  Draw the selected route geometry as a line layer.
3.  Add origin/destination markers and the current-position marker.
4.  Fit the camera to the route.
5.  Show distance, ETA, route priority, and a visible risk-estimate
    disclaimer. Always read `riskScale` rather than assuming a range.

### 6.2 `GET /api/v1/routes/:routeRequestId`

Retrieve a saved route request/result. Enforce owner authorization and
retention rules.

### 6.3 `POST /api/v1/routes/:routeRequestId/feedback`

Submit optional route feedback.

Request:

``` json
{
  "rating": "route_not_as_expected",
  "comment": "The footpath was blocked."
}
```

### 6.4 `POST /api/v1/navigation/sessions`

Start an active navigation session for a chosen route. A session
represents an active trip and is distinct from a route calculation.

Request:

``` json
{
  "routeRequestId": "route-request-id",
  "selectedRouteId": "candidate-1",
  "shareLocationWithContacts": false,
  "sharingDurationMinutes": 60
}
```

Response `201`:

``` json
{
  "data": {
    "navigationSessionId": "navigation-session-id",
    "status": "active",
    "startedAt": "2026-10-22T18:00:00Z",
    "locationUpdateIntervalHintSeconds": 5,
    "sharing": null
  }
}
```

`sharing` is `null` unless `shareLocationWithContacts` is `true`; then it is
`{ "url": "https://<your-app-domain>/share/<share-token>", "expiresAt": "..." }`.
`sharingDurationMinutes` is optional (server default and maximum apply).
Only accepted contacts receive the link. A user may have only one `active`
session; starting another returns `409 CONFLICT` until the first is finished.

The interval is a client hint, not a guarantee. Browser/device behavior,
battery, permissions, and connectivity can delay updates.

### 6.5 `POST /api/v1/navigation/sessions/:sessionId/location`

Submit a GPS update during an active navigation session.

Request:

``` json
{
  "location": {
    "latitude": 31.635,
    "longitude": 74.873,
    "accuracyMeters": 12,
    "headingDegrees": 90,
    "speedMetersPerSecond": 1.2,
    "capturedAt": "2026-10-22T18:00:05Z"
  }
}
```

Response `200`:

``` json
{
  "data": {
    "navigationSessionId": "navigation-session-id",
    "accepted": true,
    "serverReceivedAt": "2026-10-22T18:00:05Z"
  }
}
```

The browser obtains positions with
`navigator.geolocation.watchPosition()`. The frontend may move the user
marker locally as new GPS positions arrive; it does not need to wait for
MongoDB or Socket.IO to redraw the marker for the same user's own
screen.

Server responsibilities:

-   Verify session ownership and active status.
-   Validate coordinates, accuracy, timestamp, and update rate.
-   Extend the session's `expiresAt` (activity-based expiry).
-   Store only the location information required by the retention
    policy. While sharing is enabled, overwrite a single `lastLocation`
    on the session so late-joining viewers see the latest point; clear it
    when sharing is revoked or the session ends. No GPS trail is stored by
    default.
-   Broadcast to authorized viewers only when live sharing is enabled.

### 6.6 `POST /api/v1/navigation/sessions/:sessionId/reroute`

Request a new route when the user deviates, the route becomes
unavailable, or new relevant hazard information warrants recalculation.

Request:

``` json
{
  "currentLocation": {
    "latitude": 31.635,
    "longitude": 74.873,
    "accuracyMeters": 12
  },
  "reason": "route_deviation"
}
```

The destination is taken from the session and is not accepted from the
client. On success Express points the session at the new
`routeRequestId`/`selectedRouteId` (keeping a bounded list of previous
request IDs and a `rerouteCount`).

Allowed reasons: `route_deviation`, `reported_hazard`, `route_blocked`,
`user_requested`.

Response `200`:

``` json
{
  "data": {
    "routeRequestId": "new-route-request-id",
    "selectedRouteId": "candidate-2",
    "routes": [
      {
        "routeId": "candidate-2",
        "distanceMeters": 2300,
        "durationSeconds": 1840,
        "riskScore": 29,
        "geometry": {
          "type": "LineString",
          "coordinates": []
        }
      }
    ],
    "reason": "route_deviation"
  }
}
```

Rerouting rules:

-   Do not invoke the optimizer on every GPS event.
-   Use frontend map-matching/off-route checks or server-side checks with
    a sensible distance/time threshold and GPS accuracy guard.
-   Debounce and rate-limit reroute requests.
-   Keep the existing route visible until the new route is validated.
-   Validate connectivity, detour constraints, and coordinates before
    replacing the active route.
-   Do not automatically reroute solely because one noisy GPS point
    appears off-route.
-   If no valid route exists, retain the last valid route and clearly
    show a warning.

### 6.7 `POST /api/v1/navigation/sessions/:sessionId/finish`

End the navigation session.

Request:

``` json
{
  "reason": "arrived"
}
```

Allowed reasons and resulting state:

| Request `reason` | Session `status` | `endReason` |
|---|---|---|
| `arrived` | `completed` | `arrived` |
| `stopped` | `completed` | `stopped` |
| `cancelled` | `cancelled` | `cancelled` |

Finishing clears `lastLocation`, revokes any navigation share token, and
emits `navigation:ended` to viewers.

Response `200`:

``` json
{
  "data": {
    "navigationSessionId": "navigation-session-id",
    "status": "completed",
    "endReason": "arrived",
    "finishedAt": "2026-10-22T18:30:00Z"
  }
}
```

### 6.7a `GET /api/v1/navigation/sessions/active` and `GET /api/v1/navigation/sessions/:sessionId`

Return the owner's current session (or `404` if none) so a reloaded PWA can
resume. Response includes `status`, `selectedRouteId`, `routeRequestId`,
`startedAt`, `lastLocationAt`, and `sharing` state, never other users'
data.

### 6.7b `PATCH /api/v1/navigation/sessions/:sessionId/sharing`

Enable, change, or revoke trusted-contact sharing during a trip.

Request:

``` json
{
  "enabled": true,
  "contactIds": ["contact-id"],
  "durationMinutes": 60
}
```

Response `200`: `{ "data": { "enabled": true, "url": "...", "expiresAt": "..." } }`.
`{ "enabled": false }` revokes immediately: the token hash is invalidated,
`lastLocation` is cleared, and `sharing:revoked` is emitted. Only accepted
contacts may be listed. Sharing is opt-in, scoped, time-limited, and
revocable.

### 6.8 ETA and distance calculations

The frontend can calculate approximate remaining distance along the
route geometry and display a provisional ETA from remaining distance and
a configured walking-speed estimate. Recompute when:

-   the selected route changes,
-   GPS position advances meaningfully,
-   route geometry is updated.

If the backend has a better ETA estimate, it may return
`durationSecondsRemaining`. Do not claim traffic-aware ETA unless the
application has a real, supported traffic-data source.

------------------------------------------------------------------------

## 7. SOS and live-location sharing

### 7.1 `POST /api/v1/sos`

Create an SOS incident. This must not call routing or detection
inference.

Use an `Idempotency-Key` header (stored as `incidents.clientRequestId`,
unique per user). A retry with the same key and body returns the **original
incident** with `200` (never an error); the same key with a different body
returns `409 IDEMPOTENCY_CONFLICT`.

Request:

``` json
{
  "trigger": "manual",
  "location": {
    "latitude": 31.634,
    "longitude": 74.8723,
    "accuracyMeters": 18,
    "capturedAt": "2026-10-22T17:30:00Z"
  },
  "shareLocation": true
}
```

Response `201`:

``` json
{
  "data": {
    "incidentId": "incident-id",
    "status": "active",
    "startedAt": "2026-10-22T17:30:01Z",
    "notifications": {
      "status": "queued",
      "contactsTargeted": 2
    },
    "liveShare": {
      "url": "https://<your-app-domain>/share/<share-token>",
      "expiresAt": "2026-10-22T19:30:01Z"
    }
  }
}
```

Only return a live-share URL if enabled. Store only a hash of the secret
token and never log it.

### 7.1a `POST /api/v1/sos/:incidentId/share/revoke`

Revoke the live-share link without resolving the incident. Returns `204`.

### 7.2 `POST /api/v1/sos/:incidentId/location`

Submit an active SOS location update. Validate ownership, active status,
timestamps, and update rate.

### 7.3 `GET /api/v1/sos/:incidentId`

Read incident status for the owner or an explicitly authorized viewer.

### 7.4 `POST /api/v1/sos/:incidentId/resolve`

Resolve or cancel an incident.

Request:

``` json
{
  "resolution": "resolved"
}
```

Allowed values: `resolved`, `cancelled`, `false_alarm`. Mapping to the
incident: `resolved` → `status: resolved`; `cancelled` and `false_alarm` →
`status: cancelled`; the requested value is stored in `resolution`.
Resolving revokes the share token.

### 7.5 `GET /api/v1/share/:token`

Read the minimum information for a trusted contact with a valid,
unexpired, non-revoked share token. Works for both SOS and navigation
tokens; the response includes `kind: "incident" | "navigation"`, the latest
location with accuracy and timestamp, and status. Rate-limit by IP and
token, send `Referrer-Policy: no-referrer`, and never return contact
details. Polling this endpoint is sufficient for P0 live viewing.

### 7.6 `POST /api/v1/sos/:incidentId/notify-again`

Retry eligible failed notifications subject to rate limits and
authorization.

Notification statuses must distinguish `queued`, `accepted`,
`delivered`, `failed`, and `unknown`. Do not claim police/hospital
integration unless a real authorized integration is available. A demo
simulation must be labeled as simulated.

------------------------------------------------------------------------

## 8. Deepfake/image manipulation detection

### `POST /api/v1/detections`

Upload an image as `multipart/form-data`.

Fields:

-   `image`: required image file.

Detection never stores the image. Evidence storage happens only through
`POST /api/v1/cases/:caseId/evidence` after explicit consent.

Response `200`:

``` json
{
  "data": {
    "detectionId": "detection-id",
    "resultLabel": "uncertain",
    "score": 0.78,
    "scoreMeaning": "model_score_not_calibrated_probability",
    "modelVersionId": "detector-v1",
    "signals": [],
    "limitations": [
      "The model result is not proof of manipulation."
    ],
    "expiresAt": "2026-10-23T17:30:00Z"
  }
}
```

Allowed `resultLabel`: `manipulation_suspected`, `no_manipulation_detected`,
`uncertain`. Failures use the error envelope, not a label.
`modelVersionId` is the public string identifier (the `modelVersions.version`
value). The sample score/label is illustrative. Return the fields supported by
the evaluated model. Validate file size, MIME type and file signature.
Process images in memory and discard them.

### `GET /api/v1/detections/:detectionId`

Retrieve an unexpired result owned by the authenticated user.

------------------------------------------------------------------------

## 9. Evidence and recovery cases

### `POST /api/v1/cases`

Create a user-controlled recovery case.

Request:

``` json
{
  "detectionId": "detection-id",
  "incidentType": "suspected_nonconsensual_image",
  "reportedUrls": ["https://example.com/content"],
  "consentConfirmed": true
}
```

### `GET /api/v1/cases`

List the user's cases with pagination and optional status filtering.

### `GET /api/v1/cases/:caseId`

Retrieve a case owned by the user.

### `PATCH /api/v1/cases/:caseId`

Update permitted case metadata or move through server-approved status
transitions.

### `POST /api/v1/cases/:caseId/evidence`

Upload evidence after explicit consent. Use private object storage and
return an opaque evidence ID, not a public URL.

### `POST /api/v1/cases/:caseId/notices/draft`

Create a notice draft for user review. Do not claim submission or
removal unless a verified integration confirms it.

Suggested statuses: `draft`, `evidence_saved`, `notice_prepared`,
`submitted_by_user`, `response_received`, `closed`.

------------------------------------------------------------------------

## 10. Crowd-sourced safety reports

### `POST /api/v1/reports`

Submit a report such as poor lighting, a blocked road, flooding, or
another approved category.

Request:

``` json
{
  "category": "poor_lighting",
  "description": "Street lights appear to be off.",
  "location": {
    "latitude": 31.634,
    "longitude": 74.8723
  },
  "observedAt": "2026-10-22T17:30:00Z"
}
```

### `GET /api/v1/reports?bbox=minLon,minLat,maxLon,maxLat`

Query approved reports in the visible map area. Return only public-safe
fields; never expose reporter contact details.

### `POST /api/v1/reports/:reportId/confirm`

Submit a rate-limited confirmation/corroboration.

### `POST /api/v1/reports/:reportId/retract`

Allow the owner to request retraction.

Only fresh, appropriately moderated and corroborated reports should
influence route risk. Do not treat one unverified report as proof that a
street is unsafe.

------------------------------------------------------------------------

## 11. WebSocket contract

Use Socket.IO on the Express backend. Authenticate each connection and
authorize room membership before sharing any precise location.

### Client → server events

-   `navigation:join` --- payload `{ "navigationSessionId", "shareToken"? }`.
    The owner is authorized by session; a trusted contact must present a
    valid, unexpired share token.
-   `navigation:leave` --- leave the session room.
-   `incident:join` --- payload `{ "incidentId", "shareToken"? }`, same
    rules.
-   `incident:leave` --- leave the incident room.

The owner's own map can update its marker directly from GPS. Socket.IO
is for authorized viewers such as trusted contacts and for status
updates, not a requirement for drawing the owner's local marker.

### Server → client events

`navigation:location`

``` json
{
  "navigationSessionId": "navigation-session-id",
  "location": {
    "latitude": 31.635,
    "longitude": 74.873,
    "accuracyMeters": 12,
    "capturedAt": "2026-10-22T18:00:05Z"
  }
}
```

`navigation:route-updated`

``` json
{
  "navigationSessionId": "navigation-session-id",
  "routeRequestId": "new-route-request-id",
  "selectedRouteId": "candidate-2",
  "geometry": {
    "type": "LineString",
    "coordinates": []
  },
  "durationSecondsRemaining": 1500
}
```

`incident:status`

``` json
{
  "incidentId": "incident-id",
  "status": "active",
  "updatedAt": "2026-10-22T17:30:10Z"
}
```

`incident:location`

``` json
{
  "incidentId": "incident-id",
  "location": {
    "latitude": 31.6345,
    "longitude": 74.873,
    "accuracyMeters": 15,
    "capturedAt": "2026-10-22T17:30:10Z"
  }
}
```

`incident:notification-status`

``` json
{
  "incidentId": "incident-id",
  "contactId": "contact-id",
  "channel": "sms",
  "deliveryStatus": "accepted",
  "updatedAt": "2026-10-22T17:30:11Z"
}
```

`navigation:ended`

``` json
{
  "navigationSessionId": "navigation-session-id",
  "status": "completed",
  "endedAt": "2026-10-22T18:30:00Z"
}
```

`sharing:revoked`

``` json
{
  "kind": "navigation",
  "id": "navigation-session-id",
  "revokedAt": "2026-10-22T18:10:00Z"
}
```

On `sharing:revoked`, the server removes the viewer from the room and the
client must clear its map.

Never broadcast location to all clients. Enforce session membership,
sharing consent, expiry, and revocation.

------------------------------------------------------------------------

## 12. Internal FastAPI contracts

These routes are backend-to-backend only.

### `GET /internal/health`

Returns readiness status for deployment health checks.

### `POST /internal/route/optimize`

Request (GeoJSON, `[longitude, latitude]`; Express converts from the public
`{latitude, longitude}` form):

``` json
{
  "requestId": "request-id",
  "origin": { "type": "Point", "coordinates": [74.8723, 31.634] },
  "destination": { "type": "Point", "coordinates": [74.88, 31.64] },
  "mode": "walking",
  "priority": "lower_risk",
  "maxDetourRatio": 1.25,
  "departureTime": "2026-10-22T18:00:00Z"
}
```

Response (validated by Express before storing or returning):

``` json
{
  "status": "success",
  "optimizerVersion": "cp-sat-v1",
  "roadGraphVersion": "osm-city-snapshot-v1",
  "riskModelVersion": "risk-v1",
  "routes": [
    {
      "routeId": "candidate-1",
      "distanceMeters": 2100,
      "durationSeconds": 1680,
      "riskScore": 34,
      "riskScale": { "min": 0, "max": 100, "higherIsRiskier": true },
      "riskLabel": "estimated_lower_risk",
      "riskExplanation": [],
      "solverStatus": "FEASIBLE",
      "geometry": { "type": "LineString", "coordinates": [[74.8723, 31.634], [74.88, 31.64]] },
      "warnings": []
    }
  ]
}
```

Edge-level risk $r_e \in [0,1]$ is aggregated into the route-level
`riskScore` on the 0--100 scale when route-matched report data exists, or
`null` when risk is unknown. Responses include `riskStatus` (`estimated` or
`unknown`) and `riskConfidence`; an unknown score must never be rendered as
safe or as a numeric baseline. `solverStatus` must be the real solver
status; `OPTIMAL` only when proven. Express chooses `selectedRouteId` according to the requested `priority`
and persists a compact copy.
Failure response: `{ "status": "error", "code": "NO_FEASIBLE_ROUTE", "message": "..." }`
(stable codes, no stack traces).

### `POST /internal/detection/analyze`

Input: multipart image forwarded by Express.

Response (validated by Express, then mapped to the public contract):

``` json
{
  "status": "success",
  "modelVersion": "detector-v1",
  "resultLabel": "uncertain",
  "score": 0.68,
  "scoreMeaning": "model_score_not_calibrated_probability",
  "signals": [],
  "limitations": ["Automated analysis is not forensic proof"]
}
```

Express looks up `modelVersions.version == modelVersion`, persists it as
`modelVersionId`, and returns it publicly as `modelVersionId`. An unknown
version is a `502 INTELLIGENCE_SERVICE_ERROR`. Failure response:
`{ "status": "error", "code": "UNSUPPORTED_IMAGE", "message": "..." }`.

 - Service authentication and network restrictions
where supported. - Explicit connect/read timeouts and bounded retries. -
Upload and concurrency limits. - Stable error codes without stack
traces. - No direct writes to application collections. - Validate Python
responses in Express before storing or returning them.

------------------------------------------------------------------------

## 13. Error responses

  --------------------------------------------------------------------------
  HTTP                  Error code                     Meaning
  --------------------- ------------------------------ ---------------------
  `400`                 `VALIDATION_ERROR`             Invalid request
                                                       fields

  `401`                 `UNAUTHENTICATED`              Missing or invalid
                                                       authentication

  `403`                 `FORBIDDEN`                    Not authorized

  `404`                 `NOT_FOUND`                    Resource unavailable
                                                       or inaccessible

  `409`                 `CONFLICT`                     Duplicate request or
                                                       invalid state
                                                       transition

  `413`                 `FILE_TOO_LARGE`               Upload exceeds size
                                                       limit

  `422`                 `UNSUPPORTED_FILE`             Unsupported or
                                                       malformed image

  `429`                 `RATE_LIMITED`                 Rate limit exceeded

  `502`                 `INTELLIGENCE_SERVICE_ERROR`   Invalid/unexpected
                                                       Python service
                                                       response

  `503`                 `INTELLIGENCE_UNAVAILABLE`     Route or detection
                                                       service unavailable

  `500`                 `INTERNAL_ERROR`               Unexpected server
                                                       failure
  --------------------------------------------------------------------------

Additional codes: `IDEMPOTENCY_CONFLICT` (`409`, same `Idempotency-Key`
with a different body) and `NO_FEASIBLE_ROUTE` (`422`, valid request but no
route satisfies the constraints). A retried SOS with the same key and body is
**not** an error: it returns `200` with the original incident.

If routing is unavailable, return a route-specific error and let the UI
offer a clear fallback. If detection is unavailable, explain that
analysis could not be completed. SOS creation must still proceed when AI
services are down.

------------------------------------------------------------------------

## 14. Key data and security rules

-   Enforce ownership checks on every private resource.
-   Never rely on an ObjectId being secret.
-   Use idempotency for SOS creation and consider it for other retried
    operations.
-   Store share tokens hashed; check expiry and revocation in
    application logic.
-   Keep location collection limited to active navigation/emergency and
    documented consent.
-   Apply rate limits to GPS updates, rerouting, report submissions,
    OTPs, and image uploads.
-   Use TTL indexes only as a cleanup aid; TTL deletion is asynchronous.
-   Avoid saving raw images or complete route history by default.
-   Do not log tokens, image contents, or unnecessary precise location
    information.
-   Show GPS accuracy and the timestamp of the last update.
-   Explain that browser background location can be suspended; do not
    promise uninterrupted tracking.
-   Do not present route-risk estimates as guarantees of safety or model
    scores as proof.

------------------------------------------------------------------------

## 15. Implementation priority

### P0 --- Demo must work

1.  Auth/session and profile.
2.  Trusted contacts.
3.  `POST /routes` with configured routing-provider output and MapLibre route
    rendering.
4.  Start navigation session, GPS marker updates, route line,
    distance/ETA display.
5.  Deviation threshold and explicit reroute request.
6.  SOS creation, location updates, trusted-contact notifications,
    SOS live-share link with expiry (`GET /share/:token`, polling is
    acceptable), and resolve.
7.  Image upload and model result.

### P1 --- Improve experience

8.  Socket.IO live view and navigation sharing for trusted contacts.
9.  Safety reports displayed on the map and incorporated into route
    scoring.
10. Case workflow, evidence upload, and user-reviewed notice drafts.
11. Push subscriptions and notification retry handling.

### P2 --- Hardening

12. Better map matching and noisy-GPS handling.
13. More robust background location through a native mobile app if
    required.
14. Observability, abuse prevention, deletion workflow, backup/restore
    tests, and authorized external integrations.

## 16. End-to-end live navigation flow

1.  User chooses origin and destination in the React UI.
2.  Frontend calls `POST /api/v1/routes`.
3.  Express validates the request and calls FastAPI
    `/internal/route/optimize`.
4.  Python returns route geometry and estimated metrics.
5.  Express validates and stores compact route metadata.
6.  React draws the selected route on MapLibre and displays
    distance/ETA.
7.  User starts navigation with `POST /api/v1/navigation/sessions`.
8.  Browser `watchPosition()` supplies location updates; React moves the
    current marker locally.
9.  Frontend periodically sends accepted updates to `/location` while
    navigation is active.
10. Frontend detects likely route deviation using route geometry and GPS
    accuracy, then debounces a reroute request.
11. Express calls the optimizer again and returns a validated route.
12. React replaces the route layer and refreshes the ETA panel.
13. If the user enables trusted-contact sharing, Socket.IO sends
    authorized location and route/status updates to the permitted
    viewers.
14. User finishes navigation; frontend calls `/finish` and stops
    location collection.

------------------------------------------------------------------------

## Final implementation note

This contract enables a **Swiggy/Zomato-style moving marker and live
route experience**, but the map rendering and local marker movement are
frontend responsibilities. The configured routing provider supplies
route geometry and metrics; this MVP ranks provider candidates but has no
verified risk data. GPS updates keep the marker current; rerouting updates
the route when needed; Socket.IO sharing remains a future,
authorization-gated capability.

A full Google Maps-style voice-guided navigation system, reliable
background tracking on locked phones, and live traffic-aware ETA require
additional work and data sources. Do not promise those as completed MVP
features unless they are implemented and tested.

## 17. Cross-document implementation contract

This API document is the canonical public HTTP contract for Kaali.

-   Public endpoints use `/api/v1`; do not implement unversioned
    `/api/...` variants in the architecture document.
-   Route candidates use `distanceMeters` and `durationSeconds`. The
    client may display duration in minutes, but persisted/API fields
    stay in seconds.
-   GeoJSON coordinates are always `[longitude, latitude]`.
-   Navigation sessions are separate from SOS incidents and must be
    persisted in a `navigationSessions` collection. Do not persist
    continuous GPS trails unless a product requirement and retention
    policy explicitly require them.
-   The internal detection adapter validates the FastAPI response and
    maps `modelVersion` to the public string `modelVersionId`.
-   Route and detection output are estimates, not guarantees or forensic
    proof.

### Canonical enums

| Concept | Allowed values |
|---|---|
| Route `priority` | `fastest`, `balanced`, `lower_risk` |
| Route `mode` (MVP) | `walking` |
| Reroute `reason` | `route_deviation`, `reported_hazard`, `route_blocked`, `user_requested` |
| Navigation request `reason` (finish) | `arrived`, `stopped`, `cancelled` |
| Navigation `status` | `active`, `completed`, `cancelled`, `expired` |
| Navigation `endReason` | `arrived`, `stopped`, `cancelled`, `expired` |
| SOS `status` | `active`, `resolved`, `cancelled`, `expired` |
| SOS resolve `resolution` | `resolved`, `cancelled`, `false_alarm` |
| Contact `status` | `pending`, `accepted`, `declined`, `revoked` |
| Detection `resultLabel` | `manipulation_suspected`, `no_manipulation_detected`, `uncertain` |
| Notification `deliveryStatus` | `queued`, `accepted`, `delivered`, `failed`, `unknown` |
| Case `status` | `draft`, `evidence_saved`, `notice_prepared`, `submitted_by_user`, `response_received`, `closed` |
