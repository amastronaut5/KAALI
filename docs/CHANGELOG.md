# Kaali docs: v1.1 changes

Applied after the cross-document review. Files: `api-design-updated.md`,
`database-design-updated.md`, `system-architecture-updated.md`,
`contract-alignment-checklist.md`.

## Decisions made (please confirm)
-   `modelVersionId` is a **string** (`modelVersions.version`, e.g. `detector-v1`).
-   Risk is 0--100 with `riskScale`; optimizer edge risk stays 0--1.
-   Navigation status uses `completed` (not `finished`); `stopped` finishes as
    `completed`, `cancelled` as `cancelled`, with an `endReason` field.
-   SOS `false_alarm` maps to `status: cancelled` with `resolution: false_alarm`.
-   Priorities: navigation sessions P0; cases/recovery P1; SOS share link
    (polling) P0; Socket.IO and navigation sharing P1.
-   The API doc is canonical; the architecture doc no longer duplicates routes.

## API (v1.1)
-   Detection: `modelVersionId`; removed `evidenceSaved` and
    `consentToSaveEvidence`; documented label enum.
-   Routing: `riskScale`, `riskModelVersion`; full internal request/response
    and failure schemas (GeoJSON in, `routes[]` out).
-   Navigation: status/`endReason` mapping; new `GET active/:id`,
    `PATCH .../sharing`; reroute takes destination from the session and updates it.
-   SOS: idempotent replay returns the original incident; `IDEMPOTENCY_CONFLICT`,
    `NO_FEASIBLE_ROUTE`; `POST /sos/:id/share/revoke`; resolution mapping.
-   Sharing: share-token join payloads for sockets, `navigation:ended`,
    `sharing:revoked`; `/share/:token` serves both kinds.
-   Contacts accept now takes `invitationToken`; OTP/session storage referenced.
-   Priorities aligned; canonical enum table; pilot bounding-box check;
    formatting fixes (title, collapsed lists).

## Database
-   `navigationSessions` rewritten (`sharing`, `lastLocation`, `endReason`,
    reroute tracking, activity-based expiry); new `otpChallenges`, `authSessions`.
-   Indexes: per-user `clientRequestId`, share/invitation token hashes, one
    active session per user, `modelVersions.version`, navigation/auth TTLs.
-   Detection sample/labels/`modelVersionId` fixed; retention coupling between
    route requests and sessions; P0/P1 order updated.

## Architecture
-   Fixed corrupted math; replaced §4.4 and §8 with links to the API doc;
    collection table, navigation workflow, notification channels, priorities;
    renumbered the duplicate §11 (now §16).

## Checklist
-   Added enum/status, swapped-coordinate, idempotency, expiry, authorization,
    and TTL tests; documented the new canonical choices.
