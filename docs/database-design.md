# Kaali --- Database Design

**Project:** Kaali --- Women's Safety Platform\
**Database:** MongoDB Atlas\
**Backend owner:** Node.js + Express + TypeScript\
**Intelligence services:** Python FastAPI (routing optimizer and
deepfake detector)\
**Status:** Hackathon-ready logical design (v1.1, aligned with API v1.1)\
**Last updated:** 22 October 2026

------------------------------------------------------------------------

## 1. Design goals

The database should support Kaali's three product areas:

-   **Prevent:** safety-aware route requests, route results, and
    crowd-sourced safety reports.
-   **Respond:** SOS incidents, time-limited location sharing, trusted
    contacts, and notification attempts.
-   **Recover:** image-analysis records, evidence-case metadata, and
    takedown-assistance workflow.

Design rules:

1.  Node.js/Express owns application database writes. Python services
    return structured results and do not directly modify user or
    incident records.
2.  Store raw uploaded images in memory by default. Persist an image
    only when the user explicitly chooses an evidence workflow and
    consents to storage.
3.  Collect location only for an active trip, report, or emergency.
    Apply retention limits to location trails and temporary results.
4.  Treat route scores and deepfake scores as estimates, not guarantees
    or definitive proof.
5.  Keep secrets, OTPs, access tokens, and notification-provider
    credentials out of ordinary documents and logs.
6.  Use references between collections for records with independent
    lifecycles; embed only small, bounded subdocuments.

## 2. Entity relationship overview

``` mermaid
erDiagram
    USERS ||--o{ CONTACTS : manages
    USERS ||--o{ INCIDENTS : triggers
    USERS ||--o{ REPORTS : submits
    USERS ||--o{ ROUTE_REQUESTS : requests
    USERS ||--o{ NAVIGATION_SESSIONS : starts
    ROUTE_REQUESTS ||--o{ NAVIGATION_SESSIONS : launches
    USERS ||--o{ DETECTIONS : runs
    USERS ||--o{ CASES : owns
    USERS ||--o{ PUSH_SUBSCRIPTIONS : registers
    INCIDENTS ||--o{ NOTIFICATION_LOGS : generates
    DETECTIONS o|--o| CASES : may_support
    MODEL_VERSIONS ||--o{ DETECTIONS : evaluates_with

    USERS {
      ObjectId _id PK
      string displayName
      string emailNormalized
      string phoneE164
      string preferredLanguage
      date createdAt
    }
    CONTACTS {
      ObjectId _id PK
      ObjectId userId FK
      string name
      string phoneE164
      string status
    }
    INCIDENTS {
      ObjectId _id PK
      ObjectId userId FK
      string status
      date startedAt
      date resolvedAt
    }
    REPORTS {
      ObjectId _id PK
      ObjectId userId FK
      string category
      object location
      string moderationStatus
    }
    NAVIGATION_SESSIONS {
      ObjectId _id PK
      ObjectId userId FK
      ObjectId routeRequestId FK
      string status
      date startedAt
      date finishedAt
    }
    ROUTE_REQUESTS {
      ObjectId _id PK
      ObjectId userId FK
      object origin
      object destination
      string optimizerVersion
    }
    DETECTIONS {
      ObjectId _id PK
      ObjectId userId FK
      string resultLabel
      number score
      date expiresAt
    }
    CASES {
      ObjectId _id PK
      ObjectId userId FK
      ObjectId detectionId FK
      string status
    }
    NOTIFICATION_LOGS {
      ObjectId _id PK
      ObjectId incidentId FK
      string channel
      string deliveryStatus
    }
```

`ObjectId` is MongoDB's usual identifier. In Mongoose, define references
with `Schema.Types.ObjectId` and `ref`.

## 3. Collections

The examples below are logical MongoDB documents. Adjust field names
consistently with your TypeScript interfaces and Mongoose schemas.

### 3.1 `users`

Stores the user profile, authentication reference, preferences, and
consent state. Do not store plaintext passwords or OTPs.

``` json
{
  "_id": "ObjectId",
  "displayName": "Example User",
  "email": "user@example.com",
  "emailNormalized": "user@example.com",
  "phoneE164": "+911234567890",
  "preferredLanguage": "en",
  "auth": {
    "provider": "otp",
    "verifiedAt": "ISODate"
  },
  "consent": {
    "locationSharing": true,
    "evidenceStorage": false,
    "updatedAt": "ISODate"
  },
  "accountStatus": "active",
  "createdAt": "ISODate",
  "updatedAt": "ISODate",
  "deletedAt": null
}
```

**Notes** - `consent.locationSharing` is a master switch only. Actual sharing requires a per-session or per-incident grant with scope (accepted contacts), expiry, and revocation (see 3.3 and 3.8). - Normalize email to lowercase and phone to E.164 before
indexing. - OTP challenges should be short-lived and stored separately
or managed by a trusted identity provider; store only a hash if stored
in the application database. - For a hackathon, use a vetted session/JWT
approach. Do not place secrets in the client bundle.

### 3.2 `contacts`

Stores trusted emergency contacts and invitation/acceptance state. A
contact is not automatically a registered Kaali user.

``` json
{
  "_id": "ObjectId",
  "userId": "ObjectId",
  "name": "Trusted Contact",
  "phoneE164": "+911234567890",
  "email": "trusted@example.com",
  "relationship": "friend",
  "channels": ["sms", "whatsapp"],
  "priority": 1,
  "status": "accepted",
  "invitation": {
    "tokenHash": "hashed-token",
    "expiresAt": "ISODate",
    "acceptedAt": "ISODate"
  },
  "createdAt": "ISODate",
  "updatedAt": "ISODate"
}
```

Allowed `status` values: `pending`, `accepted`, `declined`, `revoked`.

**Notes** - Store only channels the team actually supports and has
tested. - Invitation tokens should be random, high-entropy, hashed at
rest, and expire. - Validate ownership on every read/update/delete.

### 3.3 `incidents`

The primary SOS record. Keep the current location here for fast access;
put a bounded trail in a separate collection if multiple location
updates are needed.

``` json
{
  "_id": "ObjectId",
  "userId": "ObjectId",
  "clientRequestId": "uuid",
  "status": "active",
  "trigger": "manual",
  "startedAt": "ISODate",
  "resolvedAt": null,
  "resolution": null,
  "currentLocation": {
    "type": "Point",
    "coordinates": [74.8723, 31.6340],
    "accuracyMeters": 18,
    "capturedAt": "ISODate"
  },
  "share": {
    "tokenHash": "hashed-token",
    "expiresAt": "ISODate",
    "revokedAt": null
  },
  "locationRetentionUntil": "ISODate",
  "createdAt": "ISODate",
  "updatedAt": "ISODate"
}
```

Suggested `status`: `active`, `resolved`, `cancelled`, `expired`.
Resolution mapping: API `resolved` → `status: resolved`; API `cancelled` and
`false_alarm` → `status: cancelled`; the requested value is stored in
`resolution` (`resolved`, `cancelled`, `false_alarm`).
Suggested `trigger`: `manual`, `automatic`, `test`.

**Important** - GeoJSON coordinates are `[longitude, latitude]`, not
`[latitude, longitude]`. - `clientRequestId` stores the API `Idempotency-Key` header value and is unique per user (`{ userId, clientRequestId }`). A retry returns the original incident rather than an error; the same key with a different request body is rejected with `IDEMPOTENCY_CONFLICT`. - Do not store
a plaintext share token. Return it once to the authorized client, store
only its hash, and expire/revoke it. - Do not claim a message reached
police unless a real, authorized integration confirms it. The demo can
clearly label simulated dispatch.

### 3.4 `incidentLocations` (recommended if keeping a location trail)

Separate high-frequency location updates from the incident document so
the incident document stays small.

``` json
{
  "_id": "ObjectId",
  "incidentId": "ObjectId",
  "userId": "ObjectId",
  "location": {
    "type": "Point",
    "coordinates": [74.8723, 31.6340]
  },
  "accuracyMeters": 18,
  "capturedAt": "ISODate",
  "expiresAt": "ISODate"
}
```

Use this only while an incident or explicitly enabled trip is active.
Add a TTL index on `expiresAt`; MongoDB TTL deletion is asynchronous,
not an exact-time deletion guarantee.

### 3.5 `notificationLogs`

Tracks attempts to notify contacts. It records delivery-provider
outcomes, not proof that a recipient read or acted on the message.

``` json
{
  "_id": "ObjectId",
  "incidentId": "ObjectId",
  "userId": "ObjectId",
  "contactId": "ObjectId",
  "channel": "sms",
  "provider": "configured-provider",
  "providerMessageId": "provider-id",
  "deliveryStatus": "accepted",
  "attemptCount": 1,
  "lastAttemptAt": "ISODate",
  "deliveredAt": null,
  "errorCode": null,
  "createdAt": "ISODate",
  "expiresAt": "ISODate"
}
```

Suggested `deliveryStatus`: `queued`, `accepted`, `delivered`, `failed`,
`unknown`.

Avoid putting full message bodies, sensitive location history,
credentials, or provider secrets in logs. Keep logs only as long as
operationally necessary.

### 3.6 `reports`

Stores crowd-sourced safety observations. Keep report status and trust
signals separate from a claim that an area is objectively safe or
unsafe.

``` json
{
  "_id": "ObjectId",
  "userId": "ObjectId",
  "category": "poor_lighting",
  "description": "Street lighting appears unavailable",
  "location": {
    "type": "Point",
    "coordinates": [74.8723, 31.6340]
  },
  "observedAt": "ISODate",
  "submittedAt": "ISODate",
  "moderationStatus": "pending",
  "corroborationCount": 0,
  "severity": "medium",
  "source": "user_report",
  "expiresAt": "ISODate",
  "createdAt": "ISODate",
  "updatedAt": "ISODate"
}
```

Possible categories: `poor_lighting`, `isolated_area`, `blocked_road`,
`harassment_report`, `flooding`, `other`. Keep the category list
controlled by server-side validation.

**Moderation and abuse prevention** - Do not expose reporter phone/email
publicly. - Rate-limit report creation and support
moderation/retraction. - Do not let one unverified report alone mark an
entire street as dangerous. - Aggregate or blur map display locations
when exact coordinates could expose a person. - Store only the minimum
data needed to evaluate report freshness and corroboration.

### 3.7 `routeRequests`

Stores the request parameters and compact output metadata. Do not store
the full city road graph in MongoDB.

``` json
{
  "_id": "ObjectId",
  "userId": "ObjectId",
  "origin": {
    "type": "Point",
    "coordinates": [74.8723, 31.6340]
  },
  "destination": {
    "type": "Point",
    "coordinates": [74.8800, 31.6400]
  },
  "preferences": {
    "mode": "walking",
    "priority": "balanced",
    "maxDetourRatio": 1.25
  },
  "result": {
    "status": "success",
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
          "coordinates": []
        }
      }
    ],
    "selectedRouteId": "candidate-1"
  },
  "versions": {
    "optimizer": "cp-sat-v1",
    "riskModel": "risk-v1",
    "roadGraph": "osm-city-snapshot-v1"
  },
  "createdAt": "ISODate",
  "expiresAt": "ISODate"
}
```

**Routing notes** - Keep the score's scale and interpretation
documented. Do not describe a computed route as guaranteed safe. -
Validate returned paths for connectivity, detour limits, and valid
coordinates before persisting or displaying them. - The full road graph
and derived edge features belong in versioned files or a
graph-processing store used by the Python routing service. - Route
history is sensitive location data. For the MVP, consider storing only
the result metadata temporarily or only when the user opts in.

**Contract notes** - The public API accepts `{ latitude, longitude }`; Express converts to GeoJSON `[longitude, latitude]` before persisting. - `expiresAt` must never be earlier than the `expiresAt` of any `active` navigation session that references the request; Express extends it when a session starts or reroutes. - A reroute creates a new `routeRequests` document.

### 3.8 `navigationSessions`

Stores the lifecycle of a user-started navigation trip. This collection
is separate from SOS incidents: an ordinary trip must not create an
emergency record, and an SOS must continue to work if navigation
services are down.

``` json
{
  "_id": "ObjectId",
  "userId": "ObjectId",
  "routeRequestId": "ObjectId",
  "selectedRouteId": "candidate-1",
  "previousRouteRequestIds": [],
  "rerouteCount": 0,
  "status": "active",
  "endReason": null,
  "origin": { "type": "Point", "coordinates": [74.8723, 31.6340] },
  "destination": { "type": "Point", "coordinates": [74.8800, 31.6400] },
  "sharing": {
    "enabled": false,
    "contactIds": [],
    "tokenHash": null,
    "expiresAt": null,
    "revokedAt": null
  },
  "lastLocation": null,
  "startedAt": "ISODate",
  "lastLocationAt": "ISODate",
  "finishedAt": null,
  "expiresAt": "ISODate",
  "createdAt": "ISODate",
  "updatedAt": "ISODate"
}
```

Allowed `status` values: `active`, `completed`, `cancelled`, `expired`.
`endReason`: `arrived`, `stopped`, `cancelled`, `expired`. API finish mapping:
`arrived` → `completed`/`arrived`; `stopped` → `completed`/`stopped`;
`cancelled` → `cancelled`/`cancelled`.

-   `routeRequestId` and `selectedRouteId` always point at the **current**
    route; a reroute pushes the old request ID onto
    `previousRouteRequestIds` (bounded, e.g. last 10) and increments
    `rerouteCount`.
-   `lastLocation` is a single overwritten GeoJSON `Point` with
    `accuracyMeters` and `capturedAt`, kept **only while sharing is enabled**
    so late-joining viewers see the latest point. It is cleared when sharing
    is revoked or the session ends.
-   `sharing.tokenHash` stores only a hash; the plaintext token is returned
    once. Sharing is opt-in, scoped to accepted `contactIds`, time-limited
    (`sharing.expiresAt`), and revocable (`revokedAt`).
-   `expiresAt` is activity-based: set to last activity plus a documented
    window and extended on each accepted update, so TTL cannot delete a trip
    in progress. TTL does not change `status`; a periodic job marks stale
    `active` sessions `expired` first.
-   Only one `active` session per user (partial unique index below).
-   No GPS trail by default. If a product requirement needs one, store each
    accepted point in a separate `navigationLocations` collection (same shape
    as `incidentLocations`, TTL on `expiresAt`) with a short documented
    retention period. Do not retain full route history indefinitely.

### 3.9 `detections`

Stores a compact result from the deepfake/image-manipulation service.
Raw images should be processed in memory and discarded by default.

``` json
{
  "_id": "ObjectId",
  "userId": "ObjectId",
  "requestId": "uuid",
  "resultLabel": "manipulation_suspected",
  "score": 0.78,
  "scoreMeaning": "model_score_not_calibrated_probability",
  "signals": [
    {
      "name": "classifier_output",
      "value": "manipulation_suspected"
    }
  ],
  "limitations": [
    "Model output is not proof of manipulation",
    "Results may be unreliable on out-of-distribution images"
  ],
  "modelVersionId": "detector-v1",
  "imageSha256": null,
  "imageStored": false,
  "createdAt": "ISODate",
  "expiresAt": "ISODate"
}
```

Possible labels: `manipulation_suspected`, `no_manipulation_detected`,
`uncertain`. Failures are not labels; they use the API error envelope.
`modelVersionId` is the string `modelVersions.version` (not an ObjectId); the
Express adapter maps the Python `modelVersion` to it and rejects unknown
versions. `imageStored` is internal and always `false` for detections; the
image is saved only through the case evidence workflow. The actual output contract should match the
evaluated model.

**Notes** - Do not call a raw model score a probability unless the model
has been calibrated and evaluated for that interpretation. - Do not
store the uploaded image or a publicly accessible image URL by
default. - If a user explicitly saves evidence, create a separate case
and use controlled private object storage. Store object references and
hashes, not raw binary files in MongoDB. - Detection records should
expire according to a documented policy.

### 3.10 `cases`

Tracks a user-initiated evidence/recovery workflow. It should not claim
that content has been removed unless a verified response confirms it.

``` json
{
  "_id": "ObjectId",
  "userId": "ObjectId",
  "detectionId": "ObjectId",
  "status": "draft",
  "incidentType": "suspected_nonconsensual_image",
  "evidence": [
    {
      "storageKey": "private/object/key",
      "sha256": "optional-file-hash",
      "uploadedAt": "ISODate",
      "consentConfirmed": true
    }
  ],
  "reportedUrls": [
    {
      "url": "https://example.com/content",
      "domain": "example.com",
      "addedAt": "ISODate"
    }
  ],
  "actions": [
    {
      "type": "notice_draft_created",
      "status": "draft",
      "createdAt": "ISODate"
    }
  ],
  "notes": "",
  "createdAt": "ISODate",
  "updatedAt": "ISODate",
  "closedAt": null
}
```

Suggested statuses: `draft`, `evidence_saved`, `notice_prepared`,
`submitted_by_user`, `response_received`, `closed`.

-   Store evidence in private object storage with restrictive access and
    short-lived signed URLs.
-   Keep an audit trail for case changes.
-   Takedown notices should be drafts for user review unless an approved
    submission integration exists.
-   Define access, retention, and deletion behavior before accepting
    sensitive evidence.

### 3.11 `modelVersions`

Records model provenance and evaluation metadata so detection results
can be traced to the model that produced them.

``` json
{
  "_id": "ObjectId",
  "service": "deepfake-detection",
  "version": "detector-v1",
  "artifactUri": "private-model-registry-reference",
  "datasetVersion": "dataset-v1",
  "evaluation": {
    "testSet": "held-out-v1",
    "metrics": {
      "precision": null,
      "recall": null,
      "f1": null,
      "auc": null
    }
  },
  "status": "active",
  "createdAt": "ISODate",
  "activatedAt": "ISODate",
  "retiredAt": null
}
```

`version` is unique and is the value exposed publicly (and stored on detections) as `modelVersionId`. Never invent evaluation metrics. Populate them from the actual held-out
evaluation. Keep model weights outside MongoDB and restrict access to
the artifact store.

### 3.12 `pushSubscriptions`

Stores Web Push subscription data for a user's browser/device.

``` json
{
  "_id": "ObjectId",
  "userId": "ObjectId",
  "endpoint": "https://push-service.example/subscription",
  "keys": {
    "p256dh": "subscription-public-key",
    "auth": "subscription-auth-secret"
  },
  "deviceLabel": "personal-phone",
  "createdAt": "ISODate",
  "lastUsedAt": "ISODate",
  "revokedAt": null
}
```

Treat subscription endpoints and keys as sensitive. Remove invalid or
revoked subscriptions. Store VAPID private keys only in server-side
secrets, never in this collection.

### 3.13 `otpChallenges`

Backs `POST /auth/otp` and `/auth/verify`. May live in Redis instead if used.

``` json
{
  "_id": "ObjectId",
  "destinationHash": "sha256-of-normalized-destination",
  "channel": "phone",
  "codeHash": "hashed-otp",
  "attempts": 0,
  "maxAttempts": 5,
  "consumedAt": null,
  "expiresAt": "ISODate",
  "createdAt": "ISODate"
}
```

Never store or log the plaintext code. Enforce expiry in application logic;
TTL is cleanup only.

### 3.14 `authSessions`

Backs access/refresh handling and `POST /auth/logout`.

``` json
{
  "_id": "ObjectId",
  "userId": "ObjectId",
  "refreshTokenHash": "hashed-token",
  "deviceLabel": "personal-phone",
  "createdAt": "ISODate",
  "lastUsedAt": "ISODate",
  "expiresAt": "ISODate",
  "revokedAt": null
}
```

------------------------------------------------------------------------

## 4. Index plan

Create indexes based on actual query patterns. Example Mongoose index
declarations:

``` ts
// users
userSchema.index(
  { emailNormalized: 1 },
  {
    unique: true,
    partialFilterExpression: { emailNormalized: { $type: "string" } }
  }
);

userSchema.index(
  { phoneE164: 1 },
  {
    unique: true,
    partialFilterExpression: { phoneE164: { $type: "string" } }
  }
);

// contacts
contactSchema.index({ userId: 1, status: 1, priority: 1 });
contactSchema.index(
  { "invitation.tokenHash": 1 },
  { partialFilterExpression: { "invitation.tokenHash": { $type: "string" } } }
);

// incidents
incidentSchema.index({ userId: 1, status: 1, startedAt: -1 });
incidentSchema.index({ "currentLocation": "2dsphere" });
incidentSchema.index({ userId: 1, clientRequestId: 1 }, { unique: true });
incidentSchema.index(
  { "share.tokenHash": 1 },
  { partialFilterExpression: { "share.tokenHash": { $type: "string" } } }
);

// incidentLocations
incidentLocationSchema.index({ incidentId: 1, capturedAt: -1 });
incidentLocationSchema.index({ location: "2dsphere" });
incidentLocationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// reports
reportSchema.index({ location: "2dsphere" });
reportSchema.index({ moderationStatus: 1, submittedAt: -1 });
reportSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// routeRequests
routeRequestSchema.index({ userId: 1, createdAt: -1 });
routeRequestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// navigationSessions
navigationSessionSchema.index({ userId: 1, status: 1, startedAt: -1 });
navigationSessionSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { status: "active" } } // one active session per user
);
navigationSessionSchema.index(
  { "sharing.tokenHash": 1 },
  { partialFilterExpression: { "sharing.tokenHash": { $type: "string" } } }
);
navigationSessionSchema.index({ status: 1, lastLocationAt: 1 }); // stale-session sweeper
navigationSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// detections
detectionSchema.index({ userId: 1, createdAt: -1 });
detectionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// cases
caseSchema.index({ userId: 1, status: 1, updatedAt: -1 });

// notificationLogs
notificationLogSchema.index({ incidentId: 1, createdAt: -1 });
notificationLogSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// pushSubscriptions
pushSubscriptionSchema.index({ userId: 1, revokedAt: 1 });
pushSubscriptionSchema.index({ endpoint: 1 }, { unique: true });

// modelVersions
modelVersionSchema.index({ version: 1 }, { unique: true });

// navigationLocations (only if a trail is required)
navigationLocationSchema.index({ navigationSessionId: 1, capturedAt: -1 });
navigationLocationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// otpChallenges / authSessions
otpChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
authSessionSchema.index({ userId: 1, revokedAt: 1 });
authSessionSchema.index({ refreshTokenHash: 1 }, { unique: true });
authSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
```

**Index caveats** - `2dsphere` indexes require valid GeoJSON;
coordinates must be `[longitude, latitude]`. - A unique index on an
optional field should use a partial index or a carefully designed sparse
strategy so many missing values do not conflict. - A partial unique index on `{ userId }` where `status: "active"` enforces one active navigation session per user. - TTL indexes only
delete documents asynchronously. Application access checks must enforce
expiry even if a document still exists. - `clientRequestId` is unique per user via `{ userId: 1, clientRequestId: 1 }`; a global unique index could let one user's key block another user's SOS.

## 5. Relationships and ownership

  ---------------------------------------------------------------------
  Relationship                       Rule
  ---------------------------------- ----------------------------------
  User → Contacts                    A user can manage multiple
                                     contacts; only the owner can
                                     edit/remove them.

  User → Incidents                   A user can trigger multiple
                                     incidents; each incident has an
                                     explicit lifecycle.

  Incident → Location updates        One incident can have many
                                     short-lived location points.

  Incident → Notification logs       Each delivery attempt is tracked
                                     independently.

  User → Reports                     A user may submit multiple
                                     reports; reporter identity is not
                                     public.

  User → Route requests              Requests are owned by the user and
                                     can have a retention/opt-in
                                     policy.

  User → Detections                  A user can run analyses; the
                                     result references the exact model
                                     version.

  Detection → Case                   A detection may support a case,
                                     but creating a detection must not
                                     automatically create an evidence
                                     case.

  Model version → Detections         Every result should identify the
                                     model version used.
  ---------------------------------------------------------------------

## 6. Retention and privacy policy

Set explicit retention periods with the team and communicate them in the
product. Suggested starting policy for a hackathon prototype:

  ---------------------------------------------------------------------
  Data                               Suggested handling
  ---------------------------------- ----------------------------------
  Raw image upload                   Memory-only by default; discard
                                     after inference.

  Detection result                   Short-lived; expire automatically
                                     unless the user chooses to attach
                                     it to a case.

  Active SOS location                Keep only while needed for the
                                     active incident; retain a bounded
                                     trail.

  Resolved incident trail            Delete or de-identify after the
                                     documented retention window.

  Live share token                   Store hash only; enforce expiry
                                     and revocation in application
                                     logic.

  Crowd report                       Keep only while useful; expire
                                     stale reports and support
                                     moderation.

  Route history                      Avoid storing by default or make
                                     retention opt-in and time-limited.

  Notification logs                  Retain minimal status/error
                                     metadata for a limited operational
                                     window.

  Evidence files                     Explicit consent, private storage,
                                     restricted access, documented
                                     retention and deletion.

  User account                       Support deletion of related
                                     personal records and
                                     subscriptions.
  ---------------------------------------------------------------------

These are proposed defaults, not a legal compliance certification.
Verify applicable requirements and provider policies before production
use.

## 7. Write ownership and request flow

``` mermaid
flowchart TD
    UI[React client] --> API[Express API]
    API --> AUTH[Authentication and authorization]
    AUTH --> DB[(MongoDB Atlas)]
    API --> ROUTE[Python routing service]
    API --> DETECT[Python detection service]
    ROUTE --> API
    DETECT --> API
    API --> DB
    API --> NOTIFY[Notification provider]
    API --> SOCKET[Socket.IO location updates]
```

-   The frontend calls Express, not the database or internal Python
    services directly.
-   Express validates input, authenticates the user, applies rate
    limits, and owns application writes.
-   Python returns a versioned JSON result. Express validates it before
    persisting the compact result.
-   SOS creation and contact notifications must not depend on routing or
    deepfake inference being available.
-   Use a durable queue or retry mechanism for notification delivery if
    time allows. For a small demo, keep a clear delivery status and
    retry policy.

## 8. Recommended implementation order

### P0 --- Build first

1.  `users`, `otpChallenges`, `authSessions`
2.  `contacts`
3.  `incidents`
4.  `notificationLogs`
5.  `incidentLocations` if live location trail is required
6.  `routeRequests`
7.  `navigationSessions`
8.  `detections`
9.  `modelVersions`

### P1 --- Add after the core demo works

10. `reports`
11. `cases`
12. `pushSubscriptions`
13. `navigationLocations` only if a trail is explicitly required

Start with Mongoose schemas, TypeScript request/response types, Zod
validation at API boundaries, and tests for ownership, expiry, duplicate
SOS requests, and malformed coordinates.

## 9. Database checklist

-   [ ] MongoDB Atlas network access is restricted appropriately.
-   [ ] Credentials are stored in environment variables or a secrets
    manager.
-   [ ] Unique and compound indexes are tested against realistic
    documents.
-   [ ] GeoJSON coordinates are validated and consistently ordered.
-   [ ] SOS creation is idempotent.
-   [ ] Every private record is checked for owner/authorized-share
    access.
-   [ ] Expiry is checked in application logic as well as via TTL
    indexes.
-   [ ] Raw images are not persisted unless the user explicitly chooses
    evidence storage.
-   [ ] Notification outcomes distinguish accepted, delivered, failed,
    and unknown.
-   [ ] Model scores are presented with limitations and version
    metadata.
-   [ ] Account deletion and retention behavior are documented and
    tested.
-   [ ] Logs avoid tokens, raw evidence, and unnecessary precise
    location data.

------------------------------------------------------------------------

## Final recommendation

For the hackathon, do not build every collection before the first
end-to-end demo. Implement **users + contacts + incidents + notification
logs** first so SOS works reliably. Then add **route requests** and
**detections/model versions**. Add crowd reports, evidence cases, and
push subscriptions once the core flows are integrated.

Keep the database focused on application records and metadata. Store
road graphs and model weights in versioned files or appropriate artifact
storage, and keep raw user images out of MongoDB by default.

## 10. Cross-service contract alignment

-   Route duration is stored and returned as `durationSeconds`
    everywhere. Convert to minutes only for display in the client.
-   GeoJSON coordinates are always `[longitude, latitude]`.
-   Public endpoints use the `/api/v1` prefix.
-   `navigationSessions` stores trip lifecycle state; SOS incidents
    remain a separate emergency workflow.
-   Detection persistence uses the public API fields `resultLabel`,
    `score`, `scoreMeaning`, `signals`, `limitations`, and
    `modelVersionId` (a string equal to `modelVersions.version`). The
    internal FastAPI adapter maps `modelVersion` to it and rejects
    unknown versions.
-   Navigation `status`: `active`, `completed`, `cancelled`, `expired`
    (API and DB use identical values). SOS `status`: `active`, `resolved`,
    `cancelled`, `expired`, with `resolution` carrying `false_alarm`.
-   Risk scores are 0--100 with an explicit `riskScale`; edge-level risk
    in the routing engine is 0--1.
-   SOS idempotency: API `Idempotency-Key` = `incidents.clientRequestId`,
    unique per user.
-   See the canonical enum table in the API design document §17.
