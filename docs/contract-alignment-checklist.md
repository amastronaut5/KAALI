# Contract Alignment Checklist

## Canonical choices

-   Public REST API prefix: `/api/v1`
-   Route distance: `distanceMeters`
-   Route duration: `durationSeconds`
-   Route risk: `riskScore` on a 0--100 scale with an explicit `riskScale`
    (edge-level risk inside the optimizer is 0--1)
-   GeoJSON coordinate order: `[longitude, latitude]`, plus a pilot-area
    bounding-box check (a swapped pair is still numerically valid in India)
-   Navigation lifecycle: `navigationSessions` collection; `status` is
    `active | completed | cancelled | expired`
-   SOS incidents remain separate from ordinary navigation
-   SOS idempotency: `Idempotency-Key` header = `incidents.clientRequestId`,
    unique per user; a retry returns the original incident
-   Public detection response: `resultLabel`, `score`, `scoreMeaning`,
    `signals`, `limitations`, `modelVersionId` (string equal to
    `modelVersions.version`)
-   `resultLabel` is one of `manipulation_suspected`,
    `no_manipulation_detected`, `uncertain` (failures use the error envelope)
-   Python responses are validated and mapped by Express before
    persistence/return (`modelVersion` → `modelVersionId`)
-   The API design document is the single canonical public contract; the
    architecture and database documents link to it instead of copying it

## Implementation order

1.  Add Mongoose `NavigationSession` schema and indexes (including the
    one-active-session-per-user partial index and share-token hash index).
2.  Implement start, active/get, location, reroute, sharing, and finish
    navigation endpoints.
3.  Align route response types across Express, FastAPI, and React.
4.  Define Pydantic response models for routing and detection, including
    the error/failure schema.
5.  Add contract tests (see below).
6.  Verify SOS creation and notification attempts work when FastAPI is
    unavailable.

## Contract tests

-   Field names and the canonical enum table (API doc §17) for navigation,
    SOS, contacts, detection labels, notification statuses, and cases.
-   Coordinate order using fixtures, plus rejection of points outside the
    pilot-area bounding box (swapped `[lat, lon]` pairs).
-   Duration units (`durationSeconds`) and `riskScale` handling.
-   Invalid or malformed Python responses (unknown `modelVersion`, empty
    geometry, missing fields) produce `502 INTELLIGENCE_SERVICE_ERROR`.
-   SOS idempotency: same key and body returns the original incident;
    same key with a different body returns `IDEMPOTENCY_CONFLICT`.
-   Expiry is enforced in application code (share tokens, sessions,
    detections), not only by TTL indexes.
-   Ownership and authorization: private resources, share tokens (valid,
    expired, revoked), Socket.IO room joins.
-   A TTL cannot delete an active navigation session or its route request.

## Safety and privacy

-   Do not represent a risk score as a guarantee of safety.
-   Do not represent a detection score as forensic proof or a calibrated
    probability unless validated.
-   Make trusted-contact location sharing opt-in, scoped, time-limited,
    and revocable (per-session grant; the user-level consent flag is only
    a master switch).
-   Avoid indefinite GPS history; document retention and deletion
    behavior. Keep only one overwritten `lastLocation` while sharing.
-   Detection never stores images; evidence is saved only through the
    case evidence workflow after explicit consent.
-   Never promise reliable background location from a browser/PWA when
    the phone is locked.
