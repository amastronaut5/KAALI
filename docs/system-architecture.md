# System Architecture

**Project:** Kavach\
**Purpose:** Women's safety platform integrating safer-route planning,
emergency response, and image-manipulation analysis.\
**Architecture:** React + TypeScript PWA, Node.js + Express API, Python
intelligence service, MongoDB Atlas.\
**Status:** Hackathon MVP architecture (v1.1, aligned with API v1.1; the API design document is the canonical public contract)

------------------------------------------------------------------------

## 1. Architecture Goals

Kavach combines three workflows:

-   **Prevent:** Estimate safer walking routes using road-network data,
    risk scoring, and a custom constraint-optimization formulation.
-   **Respond:** Create SOS incidents, notify accepted emergency
    contacts, and share a time-limited live-location link.
-   **Recover:** Analyze user-submitted images with a custom-trained
    detection model and help users prepare evidence and draft takedown
    notices.

### Critical reliability rule

**SOS must not depend on either Python engine.** If routing or deepfake
inference is unavailable, the Node.js backend must still be able to
create an incident in MongoDB and initiate notification attempts.

## 2. High-Level System Architecture

``` mermaid
flowchart TB
    U[User / Trusted Contact] --> FE[React + TypeScript PWA]

    FE <-->|HTTPS REST / WebSocket| API[Node.js + Express + TypeScript API]

    API <-->|Internal HTTP + JSON| ROUTE[Python Routing Engine]
    API <-->|Internal HTTP + Multipart Upload / JSON| DF[Python Deepfake Engine]

    API --> DB[(MongoDB Atlas)]

    FE --> MAP[Map Tiles / Geocoding Provider]
    API --> NOTIFY[SMS / Push / WhatsApp / Email Provider]
    API -. optional .-> REDIS[(Redis Cache / Queue)]

    ROUTE --> GRAPH[Versioned OpenStreetMap Road Graph]
    DF --> MODEL[Versioned Model Weights]

    subgraph Client
      FE
    end

    subgraph Backend
      API
    end

    subgraph Intelligence
      ROUTE
      DF
    end

    subgraph Persistent_Data
      DB
      GRAPH
      MODEL
    end
```

The routing and deepfake components may initially run inside one FastAPI
deployment as separate Python modules. They can be split into separate
services later if their CPU, memory, or deployment requirements differ
significantly.

## 3. Component Responsibilities

### 3.1 Frontend --- React + TypeScript PWA

Responsibilities:

-   Route search, map display, route alternatives, and risk
    explanations.
-   SOS trigger, geolocation permission, live-location display, and
    incident status.
-   Image upload and display of analysis results and limitations.
-   Trusted-contact management and recovery-case dashboard.
-   Communicate with the Node API over HTTPS and receive live updates
    over WebSocket.
-   Avoid storing long-lived secrets in frontend code.

Suggested technologies:

-   React, TypeScript, Vite
-   Tailwind CSS
-   MapLibre GL JS (as specified in the API contract)
-   Axios or `fetch`
-   Socket.IO client
-   PWA/service worker features where needed

### 3.2 Backend --- Node.js + Express + TypeScript

Node is the public API gateway and owner of application workflows.

Responsibilities:

-   Authentication, authorization, session management, and consent
    checks.
-   Request validation, rate limiting, and access control.
-   Contact creation and accepted-contact checks.
-   SOS incident creation, idempotency, notification orchestration, and
    resolution.
-   Forward route requests to the Python routing module.
-   Forward image uploads to the Python detection module.
-   Save application records and selected results in MongoDB.
-   Manage recovery cases and draft-notice metadata.
-   Log notification attempts without exposing secrets or unnecessary
    location details.

Suggested technologies:

-   Node.js and Express
-   TypeScript
-   Mongoose
-   Zod
-   Socket.IO
-   Provider SDKs or HTTP APIs for notifications

**Database ownership:** Node.js owns application writes. Python services
return structured results and do not directly modify user, incident, or
case documents.

### 3.3 Python Intelligence Service --- FastAPI

FastAPI exposes internal endpoints for the two custom intelligence
components.

Responsibilities:

-   Validate internal requests.
-   Load the road graph and model weights during service startup, where
    practical.
-   Execute routing optimization or model inference.
-   Return versioned, structured responses.
-   Provide health/readiness endpoints.
-   Avoid storing raw uploaded images by default.

Suggested technologies:

-   Python and FastAPI
-   Pydantic
-   OR-Tools CP-SAT if that is the selected solver
-   NetworkX / OSMnx or an equivalent graph-processing approach
-   PyTorch and OpenCV if suitable for the selected deepfake model

## 4. Routing Engine Architecture

### 4.1 Processing pipeline

``` mermaid
flowchart TD
    A[Origin + Destination + Preferences] --> B[Validate Coordinates]
    B --> C[Map Coordinates to Road Graph Nodes]
    C --> D[Load / Query Road Graph]
    D --> E[Calculate Edge Risk]
    E --> F[Generate Candidate Paths or CP-SAT Model]
    F --> G[Optimize Distance / Time / Risk]
    G --> H[Validate Connectivity and Detour Limit]
    H --> I{Valid Feasible Route?}
    I -->|Yes| J[Return Geometry, Distance, ETA, Risk Details]
    I -->|No| K[Return No Feasible Route with Explanation]
```

### 4.2 Graph and risk model

Represent the road network as a directed graph $G=(V,E)$:

-   $V$: road intersections or graph nodes.
-   $E$: traversable road segments.
-   $d_e$: edge distance.
-   $t_e$: estimated edge travel time.
-   $r_e$: estimated risk in the range $[0,1]$. Route-level risk is
    aggregated onto the public 0--100 `riskScore` scale.
-   $x_e$: binary variable indicating whether a candidate edge is
    selected.

Potential risk signals:

-   Street-lighting information, when available.
-   Road type and isolation proxies.
-   Approved and corroborated crowd reports.
-   Time-of-day adjustments.
-   Data confidence or missing-data indicators.

Risk values are estimates, not verified guarantees of safety. Missing
data must not be silently treated as evidence that a road is safe.

### 4.3 Example objective

A possible objective is:

$$\min \sum_{e \in E} x_e \left(\alpha \hat{d}_e + \beta \hat{t}_e + \gamma r_e\right)$$

Here, $\hat{d}_e$ and $\hat{t}_e$ are normalized distance and time
values, while $\alpha$, $\beta$, and $\gamma$ control the trade-off.
Normalize units or choose weights carefully.

The model must enforce:

-   Valid origin-to-destination flow.
-   Connectivity and exclusion of disconnected cycles.
-   Legal/access restrictions represented in the graph.
-   A maximum distance relative to a feasible baseline route, if
    required.
-   A time or solver limit suitable for the product.

A direct CP-SAT model over a large city graph may be expensive. For the
MVP, consider a bounded subgraph or generating candidate paths and using
CP-SAT to choose among them. Validate every returned path independently.

### 4.4 Routing API contract

The internal request/response schema is defined once, in the API design
document §12 (`POST /internal/route/optimize`), and implemented as Pydantic
models. In summary:

-   **Request:** `requestId`, `origin` and `destination` as GeoJSON `Point`
    (`[longitude, latitude]`), `mode`, `priority`, `maxDetourRatio`,
    `departureTime`. Express converts from the public
    `{ latitude, longitude }` form.
-   **Response:** `status`, `optimizerVersion`, `roadGraphVersion`,
    `riskModelVersion`, and `routes[]`, each with `routeId`,
    `distanceMeters`, `durationSeconds`, `riskScore` (0--100) plus
    `riskScale`, `riskLabel`, `riskExplanation`, `solverStatus`, validated
    `geometry`, and `warnings`.
-   **Failure:** `{ "status": "error", "code": "NO_FEASIBLE_ROUTE", ... }`
    with stable codes and no stack traces.

Do not return an empty geometry as a successful navigable route. Return
`OPTIMAL` only when the solver actually proves optimality; otherwise report
the true solver status (e.g. `FEASIBLE`). Express validates every response
before storing or returning it.

---

## 5. Deepfake Detection Architecture

Training and live inference are separate workflows. The application does
not train the model when a user uploads an image.

### 5.1 Offline training pipeline

``` mermaid
flowchart TD
    A[Approved, Appropriately Licensed Datasets] --> B[Validate Labels and Provenance]
    B --> C[Deduplicate and Split Data]
    C --> D[Train / Fine-Tune Model]
    D --> E[Evaluate on Held-Out Data]
    E --> F[Calibrate Scores and Set Thresholds]
    F --> G[Version Model Weights and Metrics]
```

Keep training datasets, large model weights, and evaluation artifacts in
suitable storage or a model repository. Store metadata and version
references in MongoDB rather than storing large files in documents.

### 5.2 Online inference pipeline

``` mermaid
flowchart TD
    A[User Submits Image with Consent] --> B[Validate Size, Type, and Decode]
    B --> C[Preprocess in Memory]
    C --> D[Run Custom-Trained Model]
    D --> E[Calibrate and Format Results]
    E --> F[Return Scores, Model Version, Limitations]
    F --> G{User Wants Recovery Case?}
    G -->|Yes| H[Create Case Metadata and Evidence Hashes]
    G -->|No| I[Discard Temporary Image]
    H --> J[Draft Notices for User Review]
```

### 5.3 Detection response contract

**Request --- `POST /internal/detection/analyze`**

Use `multipart/form-data` with an image field. Validate the file before
inference.

**Response --- illustrative JSON**

``` json
{
  "status": "success",
  "modelVersion": "detector-v1",
  "resultLabel": "uncertain",
  "score": 0.68,
  "scoreMeaning": "model_score_not_calibrated_probability",
  "signals": [
    { "name": "classifier_output", "value": "manipulation_suspected" }
  ],
  "limitations": [
    "Automated analysis is not forensic proof",
    "Performance may vary on unseen generators"
  ]
}
```

Express maps `modelVersion` to the public string `modelVersionId` (looked up in `modelVersions`) and rejects unknown versions. Allowed `resultLabel` values: `manipulation_suspected`, `no_manipulation_detected`, `uncertain`. The values are examples, not real predictions. Only expose score fields
your model actually computes. Do not call a score a probability unless
it has been properly calibrated and evaluated.

### 5.4 Image privacy

-   Do not permanently store raw uploaded images by default.
-   Process images in memory and discard them after inference.
-   Enforce file-size, type, decode, and resource limits.
-   Store model metadata and result fields only when needed and with an
    appropriate retention policy.
-   Create evidence records only through a separate, explicit
    user-controlled recovery workflow.
-   Use benign, lawfully sourced test images for demos.

## 6. SOS and Live-Location Architecture

SOS uses the Node backend and MongoDB directly. It must not call either
Python engine.

``` mermaid
flowchart TD
    A[User Holds SOS Button] --> B[Node Validates Request]
    B --> C[Check Idempotency Key]
    C --> D[Create Incident in MongoDB]
    D --> E[Return Incident ID and Status]
    D --> F[Find Accepted Emergency Contacts]
    F --> G[Initiate Notification Attempts]
    G --> H[Record Delivery Outcomes]
    D --> I[Accept Location Updates]
    I --> J[Validate Ownership and Location]
    J --> K[Update Current Location / Trail]
    K --> L[Push Live Updates to Authorized Page]
    L --> M[Resolve Incident]
    M --> N[Expire Sharing and Apply Retention Policy]
```

### Location flow

1.  The browser requests geolocation permission.
2.  While the trip or incident is active, the frontend submits location
    updates.
3.  Node checks the incident, caller authorization, coordinates, and
    update frequency.
4.  MongoDB stores current location and a bounded trail or references to
    separate location records.
5.  Socket.IO sends updates to authorized viewers.
6.  Share tokens expire and access is revoked when appropriate.

Browser tracking can be suspended in the background, and notification
providers can fail. Display the last location timestamp and accuracy,
and do not promise guaranteed background tracking or delivery.

For the hackathon, use a notification provider that the team has
configured and tested. Show one-tap emergency-call options where
appropriate; do not imply a real police integration exists unless it has
actually been authorized and implemented.

## 7. Database Architecture

MongoDB Atlas stores application data. Node.js owns writes to
application collections.

| Collection | Responsibility |
|---|---|
| `users` | Identity references, preferences, consent master switch |
| `otpChallenges`, `authSessions` | OTP verification state and sessions |
| `contacts` | Trusted contacts and acceptance status |
| `incidents` | SOS lifecycle, current location, share token hash |
| `incidentLocations` | Bounded, TTL'd SOS location trail (optional) |
| `notificationLogs` | Delivery attempts and outcomes |
| `routeRequests` | Preferences, optimizer/graph/risk versions, selected result |
| `navigationSessions` | Navigation trip lifecycle, sharing grant, last shared location |
| `navigationLocations` | Optional short-retention trail (only if required) |
| `reports` | Crowd-sourced reports, location, moderation |
| `detections` | Temporary analysis results and expiry |
| `cases` | Evidence metadata, notices, recovery status |
| `modelVersions` | Model version and evaluation metadata |
| `pushSubscriptions` | Browser/device notification subscriptions |

### Storage boundaries

-   **MongoDB:** user and incident records, reports, cases, model
    metadata, compact route results.
-   **Road graph storage:** versioned graph file or graph-processing
    format loaded by the routing engine.
-   **Model storage:** versioned model weights loaded by the deepfake
    service.
-   **Optional Redis:** temporary cache, rate limits, notification
    queues, or expiring tokens.
-   **Raw images:** memory-only by default, not MongoDB.

Recommended indexes include normalized unique email/phone where present,
`userId + status` for incidents and contacts, `2dsphere` indexes for
geographic queries, and TTL indexes for eligible temporary records. TTL
deletion is asynchronous, so it is not an exact-time deletion guarantee.

Define a documented retention policy for location trails, detection
results, reports, evidence metadata, and notification logs. Implement
account deletion across associated personal records.

## 8. API Architecture

All frontend requests go through Express. The Python API should be
internal/private where supported by the deployment platform.

### Public Node API

All public routes use the `/api/v1` prefix. The complete, canonical endpoint
list, request/response schemas, and enums live in the API design document
(`api-design.md`); this document does not duplicate them, to avoid drift.
Endpoint groups:

-   **Auth and profile:** `/auth/otp`, `/auth/verify`, `/auth/logout`,
    `/users/me`
-   **Contacts:** `/contacts` (CRUD) and `/contacts/:contactId/accept`
-   **Routing:** `/routes`, `/routes/:routeRequestId`, route feedback
-   **Navigation:** `/navigation/sessions` (start, active/get, location,
    reroute, sharing, finish)
-   **SOS and sharing:** `/sos` (create, location, get, resolve, notify-again,
    share revoke) and `/share/:token`
-   **Detection:** `/detections`
-   **Recovery cases:** `/cases` (create, list, get, update, evidence, notice
    drafts)
-   **Community reports:** `/reports` (create, bbox query, confirm, retract)

### Internal Python API

  Method   Endpoint                        Responsibility
  -------- ------------------------------- ---------------------------
  `POST`   `/internal/route/optimize`      Execute routing optimizer
  `POST`   `/internal/detection/analyze`   Execute model inference
  `GET`    `/internal/health`              Health/readiness check

Validate all incoming payloads. Authenticate service-to-service
requests. Never expose internal API keys in the frontend. Restrict case
and incident access by user ownership or a deliberately scoped, expiring
share token.

## 9. Repository Structure

``` text
kavach/
├── client/
│   └── src/
│       ├── components/
│       ├── pages/
│       ├── features/
│       │   ├── routing/
│       │   ├── sos/
│       │   ├── deepfake/
│       │   └── cases/
│       └── services/
├── server/
│   └── src/
│       ├── models/
│       ├── routes/
│       ├── controllers/
│       ├── services/
│       ├── middleware/
│       └── config/
├── intelligence/
│   ├── main.py
│   ├── routing/
│   │   ├── graph.py
│   │   ├── risk.py
│   │   ├── optimizer.py
│   │   └── validation.py
│   ├── deepfake/
│   │   ├── preprocessing.py
│   │   ├── model.py
│   │   ├── inference.py
│   │   └── evaluation.py
│   ├── tests/
│   └── requirements.txt
├── docs/
│   ├── system-architecture.md
│   ├── database-design.md
│   └── api-design.md
└── README.md
```

Keep secrets in environment variables or the host's secret manager. Do
not commit `.env` files, private credentials, user images, or large
model weights.

## 10. Deployment Architecture

  -----------------------------------------------------------------------
  Component               Suggested host          Notes
  ----------------------- ----------------------- -----------------------
  React PWA               Vercel or equivalent    Build and deploy
                          static host             `client`

  Express API             Render or Railway       Public API and
                                                  Socket.IO

  FastAPI intelligence    Python-capable host     Routing and model
                                                  inference

  MongoDB                 MongoDB Atlas           Persistent application
                                                  data

  Optional Redis          Managed Redis provider  Add only if
                                                  queues/cache are needed

  Model weights / graph   Suitable file or model  Version files and check
  files                   storage                 host disk persistence
  -----------------------------------------------------------------------

These are deployment options, not guarantees that every free tier
supports the model. Test memory, CPU, cold starts, WebSocket behavior,
and inference latency on the actual host. A single FastAPI service is
the simplest initial deployment; split routing and deepfake services
later only if necessary.

## 11. End-to-End Workflows

### A. Route planning

1.  User enters origin, destination, and preferences.
2.  React calls Express.
3.  Express validates and forwards the request to FastAPI.
4.  Python maps coordinates to graph nodes and calculates edge risk.
5.  The optimizer produces candidate routes.
6.  Python validates connectivity and the detour constraint.
7.  Express returns the result and optionally stores route metadata.
8.  React renders geometry and risk explanations.

### B. Emergency SOS

1.  User triggers SOS.
2.  Express validates and deduplicates the request.
3.  MongoDB stores the incident.
4.  Express initiates notification attempts to accepted contacts.
5.  Location updates flow directly to Express.
6.  Socket.IO updates the authorized live-location page.
7.  The incident is resolved, sharing is revoked, and retention rules
    apply.

### C. Image analysis and recovery

1.  User submits an image with consent.
2.  Express validates and forwards it to FastAPI.
3.  Python preprocesses the image and runs the model.
4.  The model returns scores, model version, and limitations.
5.  Express returns the analysis result.
6.  The image is discarded by default.
7.  If the user requests recovery help, the application creates evidence
    metadata and drafts notices for user review.

### D. Live navigation

1.  User picks a route (workflow A) and starts a session
    (`POST /navigation/sessions`).
2.  The browser's `watchPosition()` moves the marker locally; the client
    sends throttled location updates.
3.  The client detects deviation and debounces a reroute request; Express
    reuses workflow A and updates the session to the new route.
4.  If the user enables sharing, Express issues a scoped, expiring token for
    accepted contacts; viewers poll `/share/:token` (P0) or receive Socket.IO
    updates (P1). Sharing can be revoked at any time.
5.  The user finishes the trip; the session closes, the token is revoked, and
    `lastLocation` is cleared. Navigation never creates an SOS incident.

## 12. Team Responsibilities

  -----------------------------------------------------------------------
  Developer               Responsibility          Main deliverable
  ----------------------- ----------------------- -----------------------
  Dev 1                   Deepfake model          Training, evaluation,
                                                  inference endpoint

  Dev 2                   Routing optimizer       Road graph, risk
                                                  scoring, CP
                                                  formulation, validation

  Dev 3                   Backend/database        Auth, MongoDB, SOS,
                                                  contacts,
                                                  notifications,
                                                  integration

  Dev 4                   Frontend                Map UI, SOS,
                                                  image-analysis UI, case
                                                  dashboard
  -----------------------------------------------------------------------

Agree on API contracts before parallel development. Each Python
component should provide a mock endpoint early so frontend and backend
integration can begin before the final model or optimizer is complete.

## 13. MVP Priorities

### P0 --- Required for the demo

-   One pilot-city routing prototype.
-   A working, validated custom optimization formulation.
-   Navigation sessions with local marker, ETA, and explicit reroute.
-   One evaluated deepfake detector.
-   SOS creation and contact notification attempts.
-   SOS live-location link with expiry (polling `/share/:token` is
    acceptable; Socket.IO push is P1).

### P1 --- If P0 is stable

-   Evidence metadata, case workflow, and draft recovery notices.
-   Socket.IO live view and navigation sharing for trusted contacts.
-   Crowd reports influencing route risk.
-   Missed-check-in alerts.
-   Hindi/Punjabi UI.
-   Notification retries and case status tracking.

### P2 --- Future roadmap

-   Authorized real police integrations.
-   Large-scale multi-city optimization.
-   Advanced model ensembles and forensic localization.
-   Wearables and native mobile integrations.

## 14. Non-Functional Requirements

-   **Reliability:** SOS path independent of Python services.
-   **Security:** HTTPS, validation, rate limits, authorization, secret
    management, safe uploads.
-   **Privacy:** minimize location collection, avoid permanent raw-image
    storage, apply retention policies.
-   **Performance:** measure routing latency, inference latency, and
    notification delivery separately.
-   **Observability:** health endpoints, structured logs, error
    tracking, and provider failure visibility.
-   **Model integrity:** version weights and evaluation data; report
    limitations and avoid unsupported accuracy claims.
-   **Route integrity:** validate path connectivity, legal access,
    detour limits, and solver status before returning a route.
-   **Accessibility:** mobile-first layouts, accessible SOS controls,
    readable risk explanations.

## 15. Key Architecture Decisions

1.  Node.js owns application workflows and application database writes.
2.  Python provides routing and deepfake inference through internal
    APIs.
3.  SOS does not call either Python engine.
4.  Training is offline; inference is online.
5.  The road graph and model weights are versioned files, not MongoDB
    documents.
6.  Raw uploaded images are discarded by default.
7.  Redis is optional for the MVP.
8.  A solver result is accepted only after independent route validation.
9.  Notification attempts and actual delivery outcomes are recorded
    separately.
10. The system describes route risk and image analysis as estimates, not
    guarantees.

## 16. Canonical cross-service contracts

Use these conventions across the public API, database, and Python service
(the API design document is canonical; this list is a summary):

-   Public Express endpoints are prefixed with `/api/v1`.
-   Route distance is `distanceMeters`; route duration is
    `durationSeconds`. Convert to minutes only in the client
    presentation layer. `riskScore` is 0--100 with an explicit `riskScale`.
-   GeoJSON coordinates are `[longitude, latitude]`; Express also checks
    coordinates against a pilot-area bounding box to catch swapped pairs.
-   The public detection result fields are `resultLabel`, `score`,
    `scoreMeaning`, `signals`, `limitations`, and `modelVersionId` (string).
    The Express adapter maps the Python `modelVersion` to `modelVersionId`
    and validates the response.
-   Routing inputs are normalized by Express into the Python contract.
    Python returns validated route geometry, `distanceMeters`,
    `durationSeconds`, risk metadata, solver status, and
    `optimizerVersion`/`roadGraphVersion`.
-   Navigation trip lifecycle is persisted in `navigationSessions`
    (`active`, `completed`, `cancelled`, `expired`). Do not use SOS incidents
    to represent ordinary navigation.
-   SOS creation and notification attempts must not depend on Python
    routing or detection availability. SOS creation is idempotent per user.

------------------------------------------------------------------------

**Final recommendation:** Start with one React PWA, one Express backend,
one FastAPI intelligence service containing separate routing and
deepfake modules, and MongoDB Atlas. Prove all three user flows
end-to-end early. Split services and add infrastructure only when
measured requirements justify the added complexity.
