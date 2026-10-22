# 🛡️ PROJECT KAALI — Software Requirements Document & Technical Architecture
### Unified Cyber + Physical Women's Safety Platform
**Hackathon:** HackerWrath 3.0 — PS03 (PS01 + PS02 Convergence + Women Safety)  
**Version:** 2.0 | **Date:** 2026-10-22  
**Team Size:** 4 Engineers  
**Deployment Target:** Production-grade PWA (Progressive Web App) + REST API  

---

## Table of Contents

1. [Problem Statement & Motivation](#1-problem-statement--motivation)
2. [Product Vision & Scope](#2-product-vision--scope)
3. [Feature Breakdown (MVP)](#3-feature-breakdown-mvp)
4. [Native Algorithm — SafePath Engine (Deep Dive)](#4-native-algorithm--safepath-engine-deep-dive)
5. [DeepDefend & HashShield — Privacy-First Architecture](#5-deepdefend--hashshield--privacy-first-architecture)
6. [System Architecture](#6-system-architecture)
7. [Tech Stack — Justified Decisions](#7-tech-stack--justified-decisions)
8. [API Contract Specification](#8-api-contract-specification)
9. [Database Schema Design (ERD)](#9-database-schema-design-erd)
10. [Data Pipeline & Ingestion](#10-data-pipeline--ingestion)
11. [Deployment & Infrastructure](#11-deployment--infrastructure)
12. [Non-Functional Requirements (NFRs)](#12-non-functional-requirements-nfrs)
13. [Risk Matrix & Mitigations](#13-risk-matrix--mitigations)
14. [Team Allocation & Sprint Plan](#14-team-allocation--sprint-plan)
15. [Research Papers & Technical References](#15-research-papers--technical-references)
16. [Judging Criteria Alignment](#16-judging-criteria-alignment)

---

## 1. Problem Statement & Motivation

Three critical safety gaps exist today — operating in **complete isolation** from one another:

### Gap 1: Navigation is Safety-Blind
Google Maps, Apple Maps, OSRM, and every major routing engine optimizes for **one thing**: minimize `distance / speed`. Their cost function is:

```
Cost(path) = Σ (edge_distance / edge_speed)
```

They will **happily route a woman walking alone at 11 PM through a pitch-black alley** with zero streetlights and a history of 47 harassment incidents — because it's 200 meters shorter. There is no concept of crime density, illumination, safe haven proximity, or time-of-day risk in any production navigation system.

**Existing "safe walk" apps** (like Safetipin, Citizen) only provide **static safety ratings** of neighborhoods. They don't actually *route* you. You still have to use Google Maps separately.

### Gap 2: Victims Can't Fight Deepfakes or Leaked Images Without Re-Victimization
A woman discovers her face has been morphed onto explicit content. Her options:
- **Manually search adult sites** — re-traumatizing and technically difficult
- **Upload her photo to a third-party service** — privacy risk, data breach liability
- **Report to police** — requires technical evidence she can't produce

There is **no tool** that lets her verify exposure **without her raw image ever leaving her device**.

### Gap 3: Emergency Response is Fragmented
Current SOS apps send a **single static SMS** with a GPS coordinate. Then nothing. No live tracking. No ambient audio capture. No auto-escalation if she doesn't respond. No pre-structured legal complaint. Her contacts receive a pin on a map and have to figure out the rest.

### The KAALI Thesis
> **A single platform that routes you safely through the physical world, defends your digital identity without touching your private data, and broadcasts a full-spectrum emergency signal when everything else fails.**

---

## 2. Product Vision & Scope

### 2.1 What KAALI Is (MVP Scope)

| Module | Capability | Priority |
|--------|-----------|----------|
| **SafePath Engine** | Multi-objective safe routing with crime zones, streetlights, safe havens | **P0 — Core** |
| **DeepDefend** | Deepfake & face-morph detection via AI (spatial + frequency analysis) | **P0 — Core** |
| **HashShield** | Client-side perceptual hashing → check if your photo exists on adult/leak sites → auto-generate takedown notice | **P0 — Core** |
| **Emergency SOS Matrix** | One-tap alert → SMS + live GPS stream + audio capture → family, friends, police | **P0 — Core** |
| **Cyber Complaint Generator** | Auto-draft FIR / IT Act complaint with evidence hashes, timestamps, legal sections | **P1 — Important** |

### 2.2 What KAALI Is NOT (Out of Scope for MVP)

- Not a social network or community forum
- Not a hardware device (no physical panic buttons)
- Not a real-time surveillance system
- Not a browser extension (web app only for MVP)
- Does NOT store or transmit raw intimate images — ever

### 2.3 Target Users

| Persona | Use Case |
|---------|----------|
| **College student walking home after late classes** | SafePath routing through well-lit, patrolled routes |
| **Woman who discovers a deepfake of herself circulating online** | DeepDefend verification + HashShield takedown |
| **Harassment victim needing to file a cyber complaint** | Automated evidence dossier with correct IT Act sections |
| **Any woman in immediate physical danger** | Emergency SOS with live tracking broadcast |

---

## 3. Feature Breakdown (MVP)

### F1: SafePath — Safety-Weighted Navigation

```
User Story: "As a woman walking alone at night, I want to see the safest route 
to my destination — not just the shortest — so I can avoid crime hotspots, 
unlit streets, and isolated stretches."
```

**Functional Requirements:**
- FR-1.1: Accept origin + destination (lat/lng or address geocode)
- FR-1.2: Return TWO routes: (a) KAALI Safe Route, (b) Standard Shortest Route
- FR-1.3: Display side-by-side comparison metrics: safety score, lit-street %, police booths passed, estimated time
- FR-1.4: Overlay crime heatmap on the interactive map
- FR-1.5: Show safe havens (police stations, 24/7 pharmacies, metro stations) as markers
- FR-1.6: Support travel modes: Walking, Two-Wheeler, Cab
- FR-1.7: Allow user to adjust safety preference slider (Fastest ↔ Safest)

**Acceptance Criteria:**
- Safe route must have a measurably higher safety score than the shortest route
- Route must render on the map within 3 seconds for a 15 km urban query
- Crime heatmap must reflect real (or realistic simulated) incident data

---

### F2: DeepDefend — Deepfake & Morph Detection

```
User Story: "As a potential deepfake victim, I want to upload a suspect image 
and instantly know if it's been AI-generated or morphed, with a confidence 
score and visual explanation of tampered regions."
```

**Functional Requirements:**
- FR-2.1: Accept image upload (JPEG, PNG, WebP — max 10MB)
- FR-2.2: Run face detection (MTCNN / RetinaFace) to isolate facial regions
- FR-2.3: Run dual-stream classifier:
  - Stream A: Spatial artifact detection (EfficientNet-B4 backbone)
  - Stream B: Frequency-domain analysis (DCT coefficient anomaly detector)
- FR-2.4: Return: authenticity score (0-100%), manipulation type (Deepfake / Morph / Face Swap / Authentic), heatmap overlay of suspicious regions
- FR-2.5: Support batch analysis (up to 5 images per request)

**Acceptance Criteria:**
- ≥ 90% accuracy on FaceForensics++ benchmark (c23 compression)
- Inference latency < 4 seconds per image on CPU (ONNX Runtime)
- Heatmap must visually highlight tampered facial regions

---

### F3: HashShield — Privacy-Preserving Leaked Image Detection & Takedown

```
User Story: "As a woman worried my intimate photo may be on adult/revenge-porn 
sites, I want to check WITHOUT uploading my raw photo to any server — and if 
found, auto-generate a legal takedown notice."
```

**Functional Requirements:**
- FR-3.1: Client-side PDQ/pHash computation via WebAssembly — **raw image NEVER transmitted**
- FR-3.2: Transmit only the 256-bit perceptual hash to the backend
- FR-3.3: Backend performs Hamming distance search (threshold ≤ 5 bits) against known hash registry
- FR-3.4: If match found: return match confidence, source platform (if known), and auto-generate takedown notice
- FR-3.5: Takedown notice auto-fills: hash fingerprint, legal citations (IT Act Section 66E/67/67A, DMCA), platform abuse email addresses
- FR-3.6: User can download takedown notice as PDF
- FR-3.7: User can register hash for proactive monitoring (persistent "Protected Hash Entry")

**Acceptance Criteria:**
- Zero raw images stored on server — verifiable via network inspection
- Hash computation completes in < 2 seconds client-side
- Takedown PDF contains valid legal structure

---

### F4: Emergency SOS Matrix

```
User Story: "As a woman in immediate danger, I need ONE TAP to alert my 
emergency contacts with my live location, a tracking link, and an audio clip — 
and auto-escalate to police if I don't cancel within 60 seconds."
```

**Functional Requirements:**
- FR-4.1: One-tap SOS activation (large, accessible, high-contrast button)
- FR-4.2: Immediate SMS blast via Twilio to all registered emergency contacts
- FR-4.3: SMS includes live tracking URL: `https://kaali.app/live/{session_id}`
- FR-4.4: Real-time GPS stream via WebSocket (3-second interval updates)
- FR-4.5: Auto-record 30-second ambient audio clip (stored encrypted)
- FR-4.6: Guardian dashboard showing live map position + audio playback
- FR-4.7: Auto-escalation timer: if user doesn't cancel SOS within 60 seconds, trigger secondary alert to nearest police station (if integrated) or additional contact tier
- FR-4.8: SOS session creates an incident record with full trajectory + timestamps for legal evidence

**Acceptance Criteria:**
- SMS must fire within 5 seconds of SOS activation
- WebSocket location stream must maintain < 500ms latency
- Audio recording must be encrypted at rest (AES-256)

---

### F5: Cyber Complaint Generator

```
User Story: "As a cyber harassment victim, I want to auto-generate a formal 
police complaint with timestamped evidence, correct legal sections, and 
forensic hash certificates — ready for submission to cybercrime.gov.in"
```

**Functional Requirements:**
- FR-5.1: Guided form: incident type (deepfake, morphing, stalking, doxxing, sextortion)
- FR-5.2: Auto-attach evidence: screenshot URLs, perceptual hashes, SHA-256 integrity proofs
- FR-5.3: Auto-select applicable legal sections based on incident type:
  - Deepfake/Morph → IT Act Section 66E (Privacy Violation), Section 67/67A (Publishing Obscene Material)
  - Stalking → IPC Section 354D
  - Doxxing → IT Act Section 72 (Breach of Confidentiality)
- FR-5.4: Generate timestamped PDF with QR-code linking to hash verification
- FR-5.5: Export in format compatible with National Cyber Crime Reporting Portal

---

## 4. Native Algorithm — SafePath Engine (Deep Dive)

### 4.1 Why Every Existing Solution Fails

| System | What it Optimizes | What it Ignores |
|--------|------------------|-----------------|
| **Google Maps / OSRM** | `min(distance/speed)` | Crime, lighting, isolation, safe havens — everything |
| **Safetipin** | Rates neighborhoods (1-5 stars) | Doesn't route. Static scores. No graph traversal. |
| **Citizen App** | Shows nearby incidents on a feed | No routing. Reactive alerts only. US-only. |
| **bSafe / Noonlight** | SOS alerts | No navigation at all |

**None of them solve the actual problem: given point A and point B, find the path that balances travel time against real safety risk.**

### 4.2 The KAALI SafePath Formulation

We construct a directed weighted graph `G = (V, E)` from OpenStreetMap road network data, where:
- **V** = road intersections (OSM nodes)
- **E** = road segments (OSM ways) between intersections

Standard shortest-path algorithms assign each edge a cost = `length / speed`. KAALI replaces this with a **Composite Safety Impedance** `W(e, t)`:

```
W(e, t) = α · T(e)                    // Travel time component
         + β · C_kde(e, t)             // Crime density (time-aware)
         + γ · (1 - L(e))             // Darkness penalty (inverted illumination)
         - δ · S_haven(e)             // Safe haven proximity bonus
         + ε · H_crowd(e, t)          // Live crowdsourced hazard reports
```

**Where:**

| Symbol | Name | Range | Source |
|--------|------|-------|--------|
| `T(e)` | Normalized travel time | [0, 1] | `edge_length / base_speed`, min-max normalized |
| `C_kde(e, t)` | Crime Kernel Density at time `t` | [0, 1] | Scikit-learn `KernelDensity` on historical crime coords, temporally bucketed (Day/Evening/Night) |
| `L(e)` | Illumination index | [0, 1] | OSM `lit=yes/no` tag + Nighttime Light (NTL) satellite rasters (VIIRS/DMSP) |
| `S_haven(e)` | Safe haven proximity | [0, 1] | Inverse distance to nearest police station, 24/7 pharmacy, metro station, CCTV cluster |
| `H_crowd(e, t)` | Dynamic hazard penalty | [0, 1] | Crowdsourced reports with exponential decay (half-life = 4 hours) |
| `α, β, γ, δ, ε` | User-tunable weights | [0, 1] | Preset profiles: "Balanced", "Maximum Safety", "Fastest Safe" |

### 4.3 Search Algorithm

**Modified A\* with Safety Heuristic:**
```python
# Pseudocode — not actual implementation
def safepath_astar(graph, origin, destination, time_of_day, weights):
    """
    A* search where edge cost = composite safety impedance W(e, t)
    Heuristic h(n) = haversine(n, destination) * min_impedance_factor
    """
    open_set = PriorityQueue()
    open_set.put((0, origin))
    g_score = {origin: 0}
    came_from = {}
    
    while not open_set.empty():
        current_cost, current = open_set.get()
        
        if current == destination:
            return reconstruct_path(came_from, current)
        
        for neighbor, edge in graph.neighbors(current):
            # THE KEY DIFFERENCE: multi-factor cost, not just distance
            edge_cost = compute_impedance(edge, time_of_day, weights)
            tentative_g = g_score[current] + edge_cost
            
            if tentative_g < g_score.get(neighbor, float('inf')):
                came_from[neighbor] = current
                g_score[neighbor] = tentative_g
                f_score = tentative_g + heuristic(neighbor, destination)
                open_set.put((f_score, neighbor))
    
    return None  # No path found
```

### 4.4 What Makes This Different — The Honest Comparison

| Dimension | Google Maps | KAALI SafePath |
|-----------|------------|----------------|
| **Edge cost function** | `distance / speed` (1 variable) | **5-variable composite impedance** (time, crime, light, havens, live reports) |
| **Time awareness** | Traffic congestion only | Crime shifts by time bucket (day/evening/night have different risk profiles) |
| **Safe haven routing** | None | Actively **pulls routes toward** police stations, 24/7 pharmacies, CCTV clusters |
| **Dynamic rerouting** | Traffic jams, road closures | **Proximity hazard trigger** — if a new crowdsourced danger report appears near your current path, auto-suggests deviation |
| **Output** | Single "fastest" route | **Two routes compared** — Safe vs. Shortest with metrics delta |

---

## 5. DeepDefend & HashShield — Privacy-First Architecture

### 5.1 The Zero-Knowledge Pipeline (HashShield)

This is the architectural centerpiece that makes KAALI different from every "upload your photo to check" service:

```
┌─────────────────────────────────────────────────────────────┐
│                    USER'S BROWSER (CLIENT)                   │
│                                                              │
│  1. User selects image from local filesystem                │
│  2. Image loaded into <canvas> element (never uploaded)     │
│  3. WebAssembly PDQ hasher runs locally:                    │
│     - Resize to 64x64                                       │
│     - Apply DCT-II                                          │
│     - Extract 256-bit binary hash                           │
│  4. Only the 256-bit hash string is sent to backend         │
│                                                              │
│  ⚠️  RAW IMAGE NEVER LEAVES THIS BOX                        │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS POST (hash only — 32 bytes)
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                    KAALI BACKEND (SERVER)                     │
│                                                              │
│  5. Receive 256-bit perceptual hash                         │
│  6. Query hash registry (PostgreSQL / Redis):               │
│     - Compute Hamming distance against all stored hashes    │
│     - Match threshold: distance ≤ 5 bits                    │
│  7. If match found:                                         │
│     - Return: match_confidence, source_platform (if known)  │
│     - Auto-generate takedown notice (PDF)                   │
│  8. If no match:                                            │
│     - Optionally register hash for proactive monitoring     │
└──────────────────────────────────────────────────────────────┘
```

### 5.2 Deepfake Detection Pipeline (DeepDefend)

```
Input Image
    │
    ▼
┌──────────────────┐
│  Face Detection   │  MTCNN / RetinaFace
│  (Bounding Box)   │  → Isolate facial region(s)
└────────┬─────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌────────┐ ┌─────────────┐
│Stream A│ │  Stream B    │
│Spatial │ │  Frequency   │
│Analysis│ │  Analysis    │
│        │ │              │
│EfficientNet-B4│ │DCT Coefficient│
│(pixel  │ │  Anomaly     │
│ artifacts)│ │  Detector    │
└────┬───┘ └──────┬──────┘
     │             │
     ▼             ▼
┌──────────────────────────┐
│   Ensemble Classifier     │
│   (Weighted Average)      │
│                           │
│   → Authenticity Score    │
│   → Manipulation Type     │
│   → Heatmap of altered   │
│     regions (Grad-CAM)    │
└──────────────────────────┘
```

**Why Dual-Stream?**
- **Spatial stream (EfficientNet-B4):** Catches blending artifacts at face boundaries, inconsistent lighting/shadows, unnatural skin textures. Good at detecting face swaps and morphs.
- **Frequency stream (DCT):** All GANs leave spectral fingerprints due to upsampling operations (transposed convolutions). These artifacts are invisible to the human eye but systematic in the frequency domain. Good at detecting AI-generated faces (StyleGAN, Stable Diffusion).
- **Together:** Each stream catches what the other misses. Ensemble achieves higher accuracy than either alone.

**Model Details:**

| Component | Architecture | Training Data | Output |
|-----------|-------------|---------------|--------|
| Face Detector | MTCNN (Multi-task CNN) | WIDER FACE dataset | Bounding boxes + landmarks |
| Spatial Classifier | EfficientNet-B4 (pretrained ImageNet → fine-tuned) | FaceForensics++ (c23/c40) | P(fake) ∈ [0, 1] |
| Frequency Classifier | Custom CNN on DCT coefficients | FaceForensics++ + StyleGAN2 outputs | P(fake) ∈ [0, 1] |
| Explainability | Grad-CAM | — | Heatmap overlay |

---

## 6. System Architecture

### 6.1 High-Level Architecture Diagram

```
                        ┌─────────────────────────────────┐
                        │         USERS / CLIENTS          │
                        │   (Browser PWA / Mobile Web)     │
                        └──────────────┬──────────────────┘
                                       │ HTTPS / WSS
                        ┌──────────────▼──────────────────┐
                        │        NGINX Reverse Proxy       │
                        │    (SSL Termination, Rate Limit)  │
                        └──────────────┬──────────────────┘
                                       │
              ┌────────────────────────┼────────────────────────┐
              │                        │                        │
   ┌──────────▼──────────┐  ┌─────────▼──────────┐  ┌─────────▼──────────┐
   │   FastAPI Server     │  │  FastAPI Server     │  │  WebSocket Server   │
   │   (REST Endpoints)   │  │  (ML Inference)     │  │  (SOS Live Stream)  │
   │                      │  │                      │  │                      │
   │ • /auth/*            │  │ • /detect/deepfake  │  │ • /ws/sos/{id}       │
   │ • /routes/safe       │  │ • /detect/hash      │  │ • /ws/guardian/{id}  │
   │ • /sos/trigger       │  │ • /detect/batch     │  │                      │
   │ • /complaint/*       │  │                      │  │                      │
   │ • /hash/register     │  │                      │  │                      │
   └──────────┬───────────┘  └──────────┬──────────┘  └──────────┬──────────┘
              │                         │                         │
              │              ┌──────────▼──────────┐             │
              │              │   ONNX Runtime       │             │
              │              │   Model Server       │             │
              │              │   (CPU Inference)     │             │
              │              └─────────────────────┘             │
              │                                                   │
   ┌──────────▼───────────────────────────────────────────────────▼──────────┐
   │                          DATA LAYER                                     │
   │                                                                         │
   │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐      │
   │  │  PostgreSQL 16    │  │   MongoDB Atlas   │  │   Redis 7        │      │
   │  │  + PostGIS 3.4    │  │                    │  │                  │      │
   │  │                    │  │ • User accounts    │  │ • Session cache  │      │
   │  │ • Road network     │  │ • Emergency        │  │ • Active SOS     │      │
   │  │   (nodes + edges)  │  │   contacts         │  │   sessions       │      │
   │  │ • Crime incidents  │  │ • Complaint docs   │  │ • Rate limiting  │      │
   │  │   (point geometry) │  │ • Hash registry    │  │ • Pub/Sub for    │      │
   │  │ • Safe havens      │  │ • Audit logs       │  │   WebSocket      │      │
   │  │ • Streetlight data │  │ • Incident records │  │   broadcasts     │      │
   │  │ • KDE grid cache   │  │                    │  │                  │      │
   │  └──────────────────┘  └──────────────────┘  └──────────────────┘      │
   └────────────────────────────────────────────────────────────────────────┘
              │
   ┌──────────▼───────────────────────┐
   │     EXTERNAL SERVICES             │
   │                                    │
   │  • Twilio (SMS alerts)            │
   │  • Overpass API (OSM data fetch)  │
   │  • Nominatim (Geocoding)          │
   │  • VIIRS NTL (Satellite light)    │
   └───────────────────────────────────┘
```

### 6.2 Why This Architecture

**Why separate ML inference from the main API?**
- ML inference is CPU/GPU-heavy. Isolating it prevents a deepfake detection request from blocking a fast SOS trigger.
- Can scale ML workers independently.

**Why PostgreSQL + PostGIS for geospatial, MongoDB for documents?**
- PostGIS is the gold standard for spatial queries (`ST_DWithin`, `ST_Distance`, R-Tree indexes). Road network graph traversal needs this.
- MongoDB is better for flexible, nested documents (complaint dossiers with variable evidence structures, hash registries with metadata).

**Why Redis?**
- Active SOS sessions need sub-millisecond reads. Redis Pub/Sub powers the WebSocket broadcast fanout.
- Rate limiting middleware uses Redis counters.

---

## 7. Tech Stack — Justified Decisions

| Layer | Technology | Version | Why THIS and Not Something Else |
|-------|-----------|---------|-------------------------------|
| **Frontend Framework** | React 18 + Vite | React 18.3, Vite 5.x | Vite gives sub-second HMR. React has the richest mapping library ecosystem. Next.js is overkill for a PWA with a Python backend. |
| **Styling** | Tailwind CSS 3 | 3.4 | Rapid prototyping in a hackathon. Utility-first means no context-switching to CSS files. |
| **Map Rendering** | Leaflet.js + React-Leaflet | Leaflet 1.9 | Zero API cost (vs Google Maps $7/1000 loads). Open-source. Supports custom tile layers, GeoJSON overlays, heatmaps natively. |
| **Client-Side Hashing** | PDQ Hash (Wasm) | — | Meta's open-source perceptual hash. Designed specifically for image similarity matching. Compiled to WebAssembly for browser execution. |
| **Backend API** | FastAPI | 0.115+ | Python-native = zero-friction PyTorch/sklearn/NetworkX integration. Async by default. Auto-generates OpenAPI docs. 3-4x faster than Flask. |
| **ML Inference** | PyTorch + ONNX Runtime | PyTorch 2.x, ORT 1.18 | Train in PyTorch, export to ONNX for 3-4x faster CPU inference. No GPU required at demo scale. |
| **Computer Vision** | OpenCV + MTCNN | OpenCV 4.9 | Face detection, image preprocessing, DCT computation. Battle-tested. |
| **Graph Routing** | NetworkX + OSMnx | NetworkX 3.x, OSMnx 1.x | OSMnx downloads + constructs road graphs from OSM in 3 lines of code. NetworkX runs modified A* natively. |
| **Spatial Database** | PostgreSQL 16 + PostGIS 3.4 | — | R-Tree spatial indexes. `ST_DWithin` for "find safe havens within 500m". `ST_KNN` for k-nearest neighbor queries. |
| **Document Store** | MongoDB Atlas | 7.x | Free tier (512MB). Flexible schema for variable complaint structures. |
| **Cache + Pub/Sub** | Redis | 7.x | In-memory. SOS session state. WebSocket broadcast channel. |
| **SMS Alerts** | Twilio | — | Most reliable SMS API. Programmable. Free trial = 500 messages for demo. |
| **PDF Generation** | ReportLab / WeasyPrint | — | Generate legal complaint PDFs server-side. |
| **Deployment** | Railway / Render + Vercel | — | Railway: managed PostgreSQL + Redis + FastAPI containers. Vercel: React frontend with edge CDN. Both have free tiers. |

---

## 8. API Contract Specification

### 8.1 Authentication

```
POST /api/v1/auth/register
  Body: { "name": str, "email": str, "password": str, "phone": str }
  Response 201: { "user_id": str, "token": str }

POST /api/v1/auth/login
  Body: { "email": str, "password": str }
  Response 200: { "token": str, "user": { "id": str, "name": str } }
```

All subsequent endpoints require `Authorization: Bearer <token>`.

---

### 8.2 SafePath Routing

```
POST /api/v1/routes/safe-route
  Headers: Authorization: Bearer <token>
  Body: {
    "origin": { "lat": 28.6139, "lng": 77.2090 },
    "destination": { "lat": 28.6448, "lng": 77.2167 },
    "mode": "walking",                    // "walking" | "two_wheeler" | "cab"
    "safety_profile": "balanced",         // "balanced" | "max_safety" | "fastest_safe"
    "time_override": null                 // ISO8601 or null (uses current time)
  }
  Response 200: {
    "safe_route": {
      "geometry": { "type": "LineString", "coordinates": [[lng, lat], ...] },
      "distance_km": 4.2,
      "estimated_minutes": 52,
      "safety_score": 87,                // 0-100
      "lit_street_pct": 92,              // % of route that is well-lit
      "safe_havens_passed": 6,           // police stations, pharmacies, etc.
      "crime_zones_avoided": 3
    },
    "shortest_route": {
      "geometry": { "type": "LineString", "coordinates": [[lng, lat], ...] },
      "distance_km": 3.1,
      "estimated_minutes": 38,
      "safety_score": 41,
      "lit_street_pct": 48,
      "safe_havens_passed": 1,
      "crime_zones_avoided": 0
    },
    "comparison": {
      "extra_distance_km": 1.1,
      "extra_time_minutes": 14,
      "safety_improvement": "+46 points",
      "hazards_avoided": ["Sadar Bazar cluster (8 incidents/month)", "Ajmeri Gate underpass (unlit)"]
    }
  }
```

```
GET /api/v1/routes/crime-heatmap?bbox=77.1,28.5,77.3,28.7&time_bucket=night
  Response 200: {
    "type": "FeatureCollection",
    "features": [
      {
        "type": "Feature",
        "geometry": { "type": "Point", "coordinates": [77.21, 28.63] },
        "properties": { "intensity": 0.87, "incident_type": "harassment", "time_bucket": "night" }
      },
      ...
    ]
  }
```

```
GET /api/v1/routes/safe-havens?lat=28.63&lng=77.21&radius_m=1000
  Response 200: {
    "havens": [
      { "name": "Connaught Place Police Station", "type": "police", "lat": 28.632, "lng": 77.219, "distance_m": 340, "open_24h": true },
      { "name": "Apollo Pharmacy", "type": "pharmacy", "lat": 28.628, "lng": 77.215, "distance_m": 520, "open_24h": true },
      ...
    ]
  }
```

---

### 8.3 DeepDefend — Deepfake Detection

```
POST /api/v1/detect/deepfake
  Headers: Authorization: Bearer <token>
  Body: multipart/form-data { "image": <file> }
  Response 200: {
    "authenticity_score": 23,             // 0-100 (lower = more likely fake)
    "verdict": "LIKELY_DEEPFAKE",         // "AUTHENTIC" | "SUSPICIOUS" | "LIKELY_DEEPFAKE" | "CONFIRMED_DEEPFAKE"
    "manipulation_type": "face_swap",     // "face_swap" | "face_morph" | "full_synthetic" | "none"
    "spatial_confidence": 0.82,           // Stream A (EfficientNet) confidence
    "frequency_confidence": 0.91,         // Stream B (DCT) confidence
    "heatmap_url": "/static/heatmaps/{analysis_id}.png",
    "analysis_id": "df_abc123",
    "processing_time_ms": 2340
  }
```

---

### 8.4 HashShield — Perceptual Hash Matching

```
POST /api/v1/hash/check
  Headers: Authorization: Bearer <token>
  Body: {
    "pdq_hash": "a3f8c1d4e5b6...0f2a",   // 256-bit hex string (computed client-side)
    "hash_type": "pdq"                      // "pdq" | "phash"
  }
  Response 200: {
    "match_found": true,
    "matches": [
      {
        "hamming_distance": 3,
        "confidence": 0.95,
        "source_platform": "unknown",       // or platform name if known
        "first_seen": "2026-08-15T00:00:00Z",
        "takedown_available": true
      }
    ]
  }
```

```
POST /api/v1/hash/register
  Body: { "pdq_hash": "a3f8c1d4...", "label": "my_photo_1" }
  Response 201: { "hash_id": "h_xyz789", "status": "monitoring" }
```

```
POST /api/v1/hash/takedown-notice
  Body: { "match_id": "m_abc123", "user_name": "...", "additional_context": "..." }
  Response 200: { "notice_pdf_url": "/downloads/takedown_{id}.pdf" }
```

---

### 8.5 Emergency SOS

```
POST /api/v1/sos/trigger
  Headers: Authorization: Bearer <token>
  Body: {
    "location": { "lat": 28.6139, "lng": 77.2090 },
    "trigger_type": "manual"               // "manual" | "voice" | "triple_tap"
  }
  Response 201: {
    "session_id": "sos_abc123",
    "tracking_url": "https://kaali.app/live/sos_abc123",
    "sms_sent_to": ["+91-98765xxxxx", "+91-98765yyyyy"],
    "auto_escalation_at": "2026-10-22T15:47:35Z"  // 60 seconds from trigger
  }
```

```
WebSocket: wss://api.kaali.app/ws/sos/{session_id}
  // Client sends (every 3 seconds):
  { "type": "location_update", "lat": 28.6141, "lng": 77.2092, "timestamp": "..." }
  
  // Guardians connect to:
  wss://api.kaali.app/ws/guardian/{session_id}
  // and receive the same location updates in real-time
```

```
POST /api/v1/sos/cancel
  Body: { "session_id": "sos_abc123", "passphrase": "sunflower" }
  Response 200: { "status": "cancelled", "duration_seconds": 45 }
```

---

### 8.6 Cyber Complaint Generator

```
POST /api/v1/complaint/generate
  Headers: Authorization: Bearer <token>
  Body: {
    "incident_type": "deepfake",           // "deepfake" | "morphing" | "stalking" | "doxxing" | "sextortion"
    "description": "Found a deepfake of myself on...",
    "suspect_urls": ["https://example.com/..."],
    "suspect_handles": ["@fake_account"],
    "evidence_hashes": ["sha256:abc123...", "pdq:def456..."],
    "screenshots": ["<base64_encoded_image>"],
    "incident_date": "2026-10-20"
  }
  Response 200: {
    "complaint_id": "cmp_xyz",
    "applicable_sections": [
      { "act": "IT Act 2000", "section": "66E", "title": "Violation of Privacy" },
      { "act": "IT Act 2000", "section": "67A", "title": "Publishing Sexually Explicit Material" },
      { "act": "IPC", "section": "509", "title": "Word, Gesture or Act Intended to Insult Modesty" }
    ],
    "pdf_url": "/downloads/complaint_cmp_xyz.pdf",
    "portal_compatible": true              // formatted for cybercrime.gov.in
  }
```

---

## 9. Database Schema Design (ERD)

### 9.1 PostgreSQL + PostGIS (Geospatial Data)

```sql
-- Road network nodes (OSM intersections)
CREATE TABLE road_nodes (
    id          BIGINT PRIMARY KEY,         -- OSM node ID
    geom        GEOMETRY(Point, 4326),      -- lat/lng as PostGIS geometry
    is_signal   BOOLEAN DEFAULT FALSE       -- traffic signal present
);
CREATE INDEX idx_road_nodes_geom ON road_nodes USING GIST(geom);

-- Road network edges (OSM ways / segments)
CREATE TABLE road_edges (
    id              SERIAL PRIMARY KEY,
    source_node     BIGINT REFERENCES road_nodes(id),
    target_node     BIGINT REFERENCES road_nodes(id),
    geom            GEOMETRY(LineString, 4326),
    length_m        FLOAT NOT NULL,
    road_type       VARCHAR(50),            -- 'residential', 'primary', 'footway', etc.
    is_lit          BOOLEAN DEFAULT NULL,    -- OSM lit=yes/no tag
    speed_kmh       FLOAT DEFAULT 5.0,      -- base speed for mode
    oneway          BOOLEAN DEFAULT FALSE
);
CREATE INDEX idx_road_edges_geom ON road_edges USING GIST(geom);
CREATE INDEX idx_road_edges_source ON road_edges(source_node);
CREATE INDEX idx_road_edges_target ON road_edges(target_node);

-- Crime incidents (historical + ongoing)
CREATE TABLE crime_incidents (
    id              SERIAL PRIMARY KEY,
    geom            GEOMETRY(Point, 4326),
    incident_type   VARCHAR(50) NOT NULL,   -- 'harassment', 'assault', 'stalking', 'theft', 'molestation'
    severity        INT CHECK (severity BETWEEN 1 AND 5),
    reported_at     TIMESTAMPTZ NOT NULL,
    time_bucket     VARCHAR(10),            -- 'day', 'evening', 'night'
    source          VARCHAR(50),            -- 'police_fir', 'ncrb', 'crowdsourced'
    description     TEXT
);
CREATE INDEX idx_crime_geom ON crime_incidents USING GIST(geom);
CREATE INDEX idx_crime_time ON crime_incidents(time_bucket);

-- Safe havens (police stations, pharmacies, metro stations, CCTV clusters)
CREATE TABLE safe_havens (
    id              SERIAL PRIMARY KEY,
    geom            GEOMETRY(Point, 4326),
    name            VARCHAR(200) NOT NULL,
    haven_type      VARCHAR(50) NOT NULL,   -- 'police', 'pharmacy', 'metro', 'hospital', 'cctv_cluster'
    is_24h          BOOLEAN DEFAULT FALSE,
    phone           VARCHAR(20),
    verified        BOOLEAN DEFAULT FALSE
);
CREATE INDEX idx_havens_geom ON safe_havens USING GIST(geom);

-- Pre-computed KDE grid (crime density raster, refreshed daily)
CREATE TABLE crime_kde_grid (
    id              SERIAL PRIMARY KEY,
    geom            GEOMETRY(Point, 4326),  -- grid cell center
    time_bucket     VARCHAR(10),            -- 'day', 'evening', 'night'
    density_score   FLOAT CHECK (density_score BETWEEN 0 AND 1),
    computed_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_kde_geom ON crime_kde_grid USING GIST(geom);
```

### 9.2 MongoDB Atlas (Documents)

```javascript
// users collection
{
  _id: ObjectId,
  name: String,
  email: String,                    // unique, indexed
  phone: String,
  password_hash: String,            // bcrypt
  emergency_contacts: [
    { name: String, phone: String, relation: String, priority: Number }
  ],
  sos_passphrase: String,          // secret phrase to cancel SOS
  protected_hashes: [
    { hash_id: String, pdq_hash: String, label: String, registered_at: Date }
  ],
  created_at: Date,
  updated_at: Date
}

// sos_sessions collection
{
  _id: ObjectId,
  session_id: String,              // "sos_abc123", indexed unique
  user_id: ObjectId,               // ref → users
  status: String,                  // "active" | "cancelled" | "resolved" | "escalated"
  trigger_type: String,            // "manual" | "voice" | "triple_tap"
  triggered_at: Date,
  cancelled_at: Date,
  trajectory: [
    { lat: Number, lng: Number, timestamp: Date }
  ],
  audio_clip_url: String,          // S3 / encrypted storage URL
  sms_recipients: [String],
  auto_escalated: Boolean,
  incident_pdf_url: String
}

// complaints collection
{
  _id: ObjectId,
  complaint_id: String,            // "cmp_xyz", indexed unique
  user_id: ObjectId,
  incident_type: String,
  description: String,
  suspect_urls: [String],
  suspect_handles: [String],
  evidence: {
    hashes: [{ type: String, value: String }],
    screenshots: [{ url: String, sha256: String, captured_at: Date }]
  },
  applicable_sections: [
    { act: String, section: String, title: String }
  ],
  pdf_url: String,
  status: String,                  // "draft" | "generated" | "submitted"
  created_at: Date
}

// hash_registry collection (known leaked/NCII image hashes)
{
  _id: ObjectId,
  pdq_hash: String,                // indexed for Hamming distance search
  hash_binary: BinData,            // 256-bit binary for fast bitwise ops
  source_platform: String,
  first_seen: Date,
  last_seen: Date,
  takedown_sent: Boolean,
  takedown_date: Date
}
```

### 9.3 Redis Structures

```
# Active SOS session state (fast reads)
HSET sos:active:{session_id} user_id "u_123" status "active" lat "28.6139" lng "77.2090" last_update "2026-10-22T15:46:35Z"
EXPIRE sos:active:{session_id} 3600   # auto-expire after 1 hour

# WebSocket broadcast channel
PUBLISH sos:stream:{session_id} '{"lat": 28.6141, "lng": 77.2092, "ts": "..."}'

# Rate limiting
INCR ratelimit:{user_id}:{endpoint}
EXPIRE ratelimit:{user_id}:{endpoint} 60   # 60-second window

# JWT blacklist (for logout)
SET jwt:blacklist:{jti} 1
EXPIRE jwt:blacklist:{jti} 86400
```

---

## 10. Data Pipeline & Ingestion

### 10.1 Road Network Ingestion

```
Source: OpenStreetMap via Overpass API / OSMnx
Target: PostgreSQL + PostGIS (road_nodes, road_edges tables)
Frequency: One-time bulk load + monthly refresh
Pipeline:
  1. OSMnx downloads road network for target city (e.g., Delhi NCR bounding box)
  2. Extract nodes (intersections) and edges (road segments)
  3. Parse OSM tags: highway type, lit=yes/no, maxspeed, oneway
  4. Load into PostGIS with SRID 4326 (WGS84)
  5. Build spatial indexes (GIST)
Tool: Python script using osmnx.graph_to_gdfs() → GeoDataFrame → PostGIS via SQLAlchemy + GeoAlchemy2
```

### 10.2 Crime Data Ingestion

```
Source: National Crime Records Bureau (NCRB) district-level data + simulated micro-level coordinates
        (Real FIR-level geocoded data is not publicly available — for hackathon, we use 
         NCRB district stats to generate realistic synthetic point distributions)
Target: PostgreSQL (crime_incidents table)
Pipeline:
  1. Parse NCRB "Crime Against Women" district-level statistics
  2. For each district, generate synthetic incident points using:
     - Cluster centers near known high-risk areas (bus stops, market areas, isolated stretches)
     - Gaussian noise (σ = 200m) around cluster centers
     - Temporal distribution matching NCRB time-of-day patterns
  3. Insert into crime_incidents with geometry, type, severity, time_bucket
  4. Run Scikit-learn KernelDensity (bandwidth=300m, kernel='gaussian') on incident points
  5. Sample KDE on a 100m grid → insert into crime_kde_grid table
Refresh: Daily (in production); one-time for hackathon demo
```

### 10.3 Safe Haven Data

```
Source: OpenStreetMap Overpass API + Google Places API (backup)
Target: PostgreSQL (safe_havens table)
Query: Overpass QL for amenity=police | amenity=pharmacy | railway=station | amenity=hospital
Pipeline:
  1. Overpass API query for target city bounding box
  2. Parse JSON response → extract name, type, coordinates, opening_hours
  3. Determine is_24h from opening_hours tag (24/7 or Mo-Su 00:00-24:00)
  4. Insert into safe_havens with PostGIS geometry
```

### 10.4 Streetlight / Illumination Data

```
Source: OSM lit=yes/no tags (primary) + VIIRS Nighttime Light satellite composites (secondary)
Target: road_edges.is_lit column
Pipeline:
  1. OSM edges already have lit tag parsed during road network ingestion
  2. For edges where lit=NULL (most edges — OSM coverage is sparse):
     - Download VIIRS NTL monthly composite GeoTIFF for target region
     - For each edge centroid, sample raster pixel value
     - Threshold: pixel > 10 nW/cm²/sr → is_lit = TRUE
  3. Update road_edges table
```

### 10.5 Hash Registry Seeding

```
Source: Meta ThreatExchange API (if API access granted) + manual curation
Target: MongoDB hash_registry collection
Note: For hackathon demo, seed with ~1000 synthetic PDQ hashes to demonstrate matching capability
```

---

## 11. Deployment & Infrastructure

### 11.1 Deployment Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         VERCEL (Free Tier)                        │
│                                                                    │
│  React 18 + Vite PWA                                              │
│  • Static build deployed to Edge CDN                              │
│  • Service Worker for offline map tile caching                    │
│  • Client-side PDQ Wasm module bundled                            │
│  • Environment: VITE_API_URL=https://api.kaali.app               │
└──────────────────────────────┬───────────────────────────────────┘
                               │ HTTPS
┌──────────────────────────────▼───────────────────────────────────┐
│                      RAILWAY (Free / Hobby Tier)                  │
│                                                                    │
│  ┌─────────────────────┐  ┌─────────────────────┐                │
│  │  fastapi-main        │  │  fastapi-ml          │                │
│  │  (Dockerfile)        │  │  (Dockerfile)        │                │
│  │  • REST API          │  │  • ML inference      │                │
│  │  • WebSocket server  │  │  • ONNX models       │                │
│  │  • 512MB RAM         │  │  • 1GB RAM           │                │
│  └─────────┬────────────┘  └─────────┬────────────┘                │
│            │                          │                             │
│  ┌─────────▼────────────┐  ┌─────────▼────────────┐              │
│  │  PostgreSQL 16        │  │  Redis 7              │              │
│  │  + PostGIS            │  │  (25MB free tier)     │              │
│  │  (1GB free tier)      │  │                       │              │
│  └──────────────────────┘  └───────────────────────┘              │
│                                                                    │
│  ┌──────────────────────────────────────────────┐                 │
│  │  MongoDB Atlas (Free M0 — 512MB)              │                 │
│  │  (External, connected via connection string)  │                 │
│  └──────────────────────────────────────────────┘                 │
└──────────────────────────────────────────────────────────────────┘
```

### 11.2 CI/CD Pipeline

```
GitHub Repository (monorepo)
  ├── /frontend          → Vercel auto-deploy on push to main
  ├── /backend           → Railway auto-deploy on push to main
  ├── /ml-models         → Model artifacts stored in Git LFS or Railway volume
  └── /data-scripts      → One-time ingestion scripts (run manually)

Branch Strategy:
  main        → production deployment (auto)
  develop     → staging (manual deploy for testing)
  feature/*   → individual feature branches → PR to develop
```

### 11.3 Environment Variables

```bash
# Backend (.env)
DATABASE_URL=postgresql://user:pass@host:5432/kaali_db
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/kaali
REDIS_URL=redis://default:pass@host:6379
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=+1...
JWT_SECRET=<random-256-bit-key>
ONNX_MODEL_PATH=/models/deepfake_efficientnet.onnx
CORS_ORIGINS=https://kaali.app,http://localhost:5173

# Frontend (.env)
VITE_API_URL=https://api.kaali.app
VITE_WS_URL=wss://api.kaali.app
VITE_MAP_TILE_URL=https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png
```

---

## 12. Non-Functional Requirements (NFRs)

| ID | Category | Requirement | Target | Measurement |
|----|----------|-------------|--------|-------------|
| NFR-01 | **Latency** | SafePath route computation | < 3 seconds for 15km urban query | Server-side timer on A* execution |
| NFR-02 | **Latency** | Deepfake detection inference | < 4 seconds per image (CPU) | ONNX Runtime profiler |
| NFR-03 | **Latency** | Client-side PDQ hash computation | < 2 seconds per image | Browser Performance API |
| NFR-04 | **Latency** | SOS SMS delivery | < 5 seconds from trigger to Twilio API acknowledgment | Twilio delivery webhook |
| NFR-05 | **Latency** | WebSocket location broadcast | < 500ms end-to-end (user → guardian) | Timestamp delta |
| NFR-06 | **Throughput** | Concurrent API requests | 100 RPS (demo scale) | Load test with Locust |
| NFR-07 | **Availability** | Uptime target | 99% (excluding planned maintenance) | Uptime monitoring (UptimeRobot) |
| NFR-08 | **Security** | Raw image transmission | **ZERO raw intimate images ever transmitted to server** | Network traffic audit, code review |
| NFR-09 | **Security** | Authentication | JWT with 24h expiry, bcrypt password hashing (cost=12) | Security audit |
| NFR-10 | **Security** | Data at rest | Audio clips encrypted AES-256. Passwords bcrypt-hashed. | Implementation review |
| NFR-11 | **Security** | Transport | TLS 1.3 everywhere (HTTPS + WSS) | SSL Labs test |
| NFR-12 | **Privacy** | SOS session data | Auto-purge trajectory data after 30 days unless user opts to retain | Cron job verification |
| NFR-13 | **Accessibility** | SOS button | WCAG 2.1 AA — minimum 48x48px touch target, 4.5:1 contrast ratio | Lighthouse audit |
| NFR-14 | **Scalability** | Road network graph size | Support city-scale graph (500K+ nodes, 1M+ edges) in memory | Memory profiling |
| NFR-15 | **Accuracy** | Deepfake detection | ≥ 90% accuracy on FaceForensics++ (c23) | Benchmark evaluation |

---

## 13. Risk Matrix & Mitigations

| # | Risk | Probability | Impact | Mitigation |
|---|------|------------|--------|------------|
| R1 | **OSM road data incomplete** — missing edges or incorrect lit tags for target city | High | Medium | Fallback: Supplement with VIIRS NTL satellite for lighting. For missing roads, use OSM's `highway=*` tag coverage which is >95% for major Indian cities. |
| R2 | **Crime data not publicly geocoded** — NCRB only publishes district-level aggregates, not FIR-level coordinates | High | High | Generate realistic synthetic crime points using district-level stats + known urban risk patterns (bus stops, market areas, isolated stretches). Clearly label as "simulated from NCRB statistics" in demo. |
| R3 | **Deepfake model overfits to FaceForensics++** — poor generalization to real-world fakes | Medium | High | Use multi-dataset training: FF++ + Celeb-DF + DeeperForensics. Add frequency-domain stream (DCT) which generalizes better than pixel-only models per Frank et al. (2020). |
| R4 | **Twilio SMS fails or rate-limited** — SOS alert doesn't reach contacts | Low | Critical | Fallback chain: Twilio SMS → Firebase Cloud Messaging (push notification) → Email. Log all delivery attempts. Show delivery status in UI. |
| R5 | **WebSocket connection drops** — guardian loses live tracking | Medium | High | Auto-reconnect with exponential backoff (1s, 2s, 4s, 8s). Store last 60 positions in Redis. On reconnect, replay missed positions. |
| R6 | **Client-side Wasm hash computation fails** — old browser, no Wasm support | Low | Medium | Feature detection: if `typeof WebAssembly === 'undefined'`, fall back to pure JavaScript pHash implementation (slower but functional). |
| R7 | **Railway free tier resource limits** — 512MB RAM for PostgreSQL, 25MB for Redis | Medium | Medium | Limit road network to one metropolitan area for demo. Use connection pooling (asyncpg pool_size=10). Compress KDE grid. |
| R8 | **Legal takedown notices have no enforcement power** — we generate them but can't force platforms to comply | High | Low | Clearly communicate to user: "This is a pre-drafted notice. Actual enforcement requires submission to the platform's abuse team and/or legal counsel." This is a tool, not a legal service. |
| R9 | **Graph A* computation too slow for large cities** — 500K+ nodes causes >10s response | Medium | High | Pre-contract graph using edge contraction hierarchies (CH). Alternative: limit search radius to 20km and use bidirectional A*. Cache frequent origin-destination pairs in Redis. |

---

## 14. Team Allocation & Sprint Plan

### 14.1 Team Roles

| Member | Role | Primary Stack | Responsibilities |
|--------|------|--------------|------------------|
| **Dev 1** | AI/ML Engineer | Python, PyTorch, OpenCV, ONNX | Deepfake detection model, perceptual hashing module, crime KDE computation |
| **Dev 2** | Backend & Geo Engineer | Python, FastAPI, PostGIS, NetworkX | SafePath routing engine, spatial database setup, OSM data ingestion, SOS WebSocket server |
| **Dev 3** | Full-Stack Developer | React, FastAPI, MongoDB | Auth system, emergency contacts CRUD, complaint generator, hash check API, frontend state wiring |
| **Dev 4** | UI/UX & Frontend Engineer | React, Leaflet, Tailwind CSS, Figma | Design system, interactive map with safety overlays, SOS UI, DeepDefend portal, responsive PWA |

### 14.2 Sprint Plan (5-Day Hackathon)

```
DAY 1 — Foundation
├── Dev 1: Download FaceForensics++ (c23). Set up PyTorch training pipeline. Begin EfficientNet-B4 fine-tuning.
├── Dev 2: OSMnx download Delhi road network → PostGIS. Set up FastAPI project skeleton. Define DB schemas.
├── Dev 3: Set up React+Vite frontend. Implement JWT auth (register/login). MongoDB user schema.
└── Dev 4: Design system in Figma. Set up Tailwind config. Build landing page + navigation shell.

DAY 2 — Core Features
├── Dev 1: Complete spatial model training. Begin DCT frequency classifier. Export both to ONNX.
├── Dev 2: Implement SafePath A* algorithm with composite impedance. Seed crime data + KDE grid.
├── Dev 3: Emergency contacts CRUD API. Hash check endpoint (Hamming distance search). PDQ Wasm integration.
└── Dev 4: Build interactive Leaflet map component. Crime heatmap overlay. Safe haven markers.

DAY 3 — Integration
├── Dev 1: Wire ONNX models into FastAPI inference endpoint. Implement Grad-CAM heatmap generation.
├── Dev 2: SOS trigger endpoint + Twilio SMS integration. WebSocket server for live GPS streaming.
├── Dev 3: Complaint generator (form → legal sections mapping → PDF via ReportLab). Takedown notice generator.
└── Dev 4: Route visualization (dual routes on map). DeepDefend upload UI with result display. SOS button.

DAY 4 — Polish & Testing
├── Dev 1: Model accuracy validation on test set. Optimize ONNX inference speed. Batch detection endpoint.
├── Dev 2: Guardian WebSocket client (live tracking dashboard). Route comparison metrics. Load testing.
├── Dev 3: End-to-end flow testing. Error handling. Edge cases (no contacts, invalid hash, etc.)
└── Dev 4: Responsive design pass. Dark mode. Accessibility audit. Micro-animations. PWA manifest.

DAY 5 — Deploy & Demo
├── All: Deploy frontend to Vercel, backend to Railway
├── All: Seed production database with demo data
├── All: Record demo video / prepare live demo
└── All: Write README, architecture doc, prepare pitch
```

---

## 15. Research Papers & Technical References

### 15.1 Safe Routing & Geospatial Crime Analysis

| # | Paper | Authors | Venue / Year | Relevance to KAALI | Link |
|---|-------|---------|-------------|---------------------|------|
| 1 | "Crime Mapping and Spatial Analysis of Crime: A GIS Perspective" | Chainey, S. & Ratcliffe, J. | *Mapping Crime: Understanding Hotspots*, National Institute of Justice, 2005 | Foundation for KDE-based crime hotspot estimation used in SafePath edge weights | — |
| 2 | "Environmental Criminology and Crime Analysis: Situating the Theory, Analytic Approach and Application" | Brantingham, P.L. & Brantingham, P.J. | *Patterns in Crime*, 1984 (foundational text) | Crime pattern theory — why crimes cluster in predictable spatial-temporal patterns, validates our time-bucketed KDE approach | — |
| 3 | "The utility of hotspot mapping for predicting spatial patterns of crime" | Chainey, S., Tompson, L., & Uhlig, S. | *Security Journal*, 18(2), 2005 | Empirical validation that KDE outperforms other hotspot methods for crime prediction — justifies our choice of Gaussian KDE | DOI: 10.1057/palgrave.sj.8340198 |
| 4 | "OSMnx: New methods for acquiring, constructing, analyzing, and visualizing complex street networks" | Boeing, G. | *Computers, Environment and Urban Systems*, 65, 2017 | The tool we use for road network extraction from OpenStreetMap | DOI: 10.1016/j.compenvurbsys.2017.05.004 |

### 15.2 Deepfake & Image Forgery Detection

| # | Paper | Authors | Venue / Year | Relevance to KAALI | Link |
|---|-------|---------|-------------|---------------------|------|
| 5 | "MesoNet: a Compact Facial Video Forgery Detection Network" | Afchar, D., Nozick, V., Yamagishi, J., Echizen, I. | *IEEE International Workshop on Information Forensics and Security (WIFS)*, 2018 | Architecture inspiration for our spatial stream classifier | [arXiv:1809.00888](https://arxiv.org/abs/1809.00888) |
| 6 | "FaceForensics++: Learning to Detect Manipulated Facial Images" | Rössler, A., Cozzolino, D., Verdoliva, L., Riess, C., Thies, J., Nießner, M. | *IEEE/CVF ICCV*, 2019 | Primary training/benchmark dataset for our deepfake detector (4 manipulation types, 3 compression levels) | [arXiv:1901.08971](https://arxiv.org/abs/1901.08971) |
| 7 | "Leveraging Frequency Analysis for Deep Fake Image Recognition" | Frank, J., Eisenhofer, T., Schönherr, L., Fischer, A., Kolossa, D., Holz, T. | *ICML 2020* | **Critical paper** — proves that GAN upsampling operations leave systematic artifacts in DCT frequency domain. Basis for our Stream B (frequency classifier). Demonstrates cross-architecture generalization. | [arXiv:2003.08685](https://arxiv.org/abs/2003.08685) |
| 8 | "EfficientNet: Rethinking Model Scaling for Convolutional Neural Networks" | Tan, M. & Le, Q.V. | *ICML 2019* | Backbone architecture for our spatial stream. B4 variant gives optimal accuracy/speed tradeoff for face-level classification. | [arXiv:1905.11946](https://arxiv.org/abs/1905.11946) |
| 9 | "Celeb-DF: A Large-scale Challenging Dataset for DeepFake Forensics" | Li, Y., Yang, X., Sun, P., Qi, H., Lyu, S. | *IEEE/CVF CVPR*, 2020 | Secondary evaluation dataset to test cross-dataset generalization of our detector | [arXiv:1909.12962](https://arxiv.org/abs/1909.12962) |

### 15.3 Perceptual Hashing & NCII Prevention

| # | Paper / Resource | Authors / Org | Year | Relevance to KAALI | Link |
|---|-----------------|---------------|------|---------------------|------|
| 10 | "PDQ and TMK+PDQF Hashing Algorithms" | Meta Open Source (Facebook) | 2019 | The perceptual hashing algorithm we compile to WebAssembly for client-side image fingerprinting | [GitHub: facebook/ThreatExchange](https://github.com/facebook/ThreatExchange/tree/main/pdq) |
| 11 | "StopNCII.org — How It Works (Technical)" | SWGfL (South West Grid for Learning) | 2021 | Reference architecture for client-side hash generation → server-side matching without raw image transmission. Direct inspiration for HashShield's privacy model. | [stopncii.org](https://stopncii.org/how-it-works/) |
| 12 | "Robust Hashing for Image Authentication using Zernike Moments and Local Features" | Tang, Z., Wang, S., Zhang, X., Wei, W., Su, S. | *IEEE Transactions on Information Forensics and Security*, 2016 | Theoretical foundation for perceptual hash robustness against image transformations (crop, resize, compression) | DOI: 10.1109/TIFS.2015.2494223 |

### 15.4 Emergency Response & Alerting Systems

| # | Resource | Org | Relevance | Link |
|---|---------|-----|-----------|------|
| 13 | "Twilio Programmable Messaging API Documentation" | Twilio | SMS alert delivery infrastructure for SOS module | [twilio.com/docs/messaging](https://www.twilio.com/docs/messaging) |
| 14 | "RFC 6455 — The WebSocket Protocol" | IETF | Protocol specification for real-time bidirectional SOS location streaming | [tools.ietf.org/html/rfc6455](https://tools.ietf.org/html/rfc6455) |

### 15.5 Legal Framework (Indian IT Act)

| Section | Act | Description | KAALI Module |
|---------|-----|-------------|-------------|
| Section 66E | IT Act 2000 | Punishment for violation of privacy (capturing/publishing private images) | HashShield takedown, Complaint Generator |
| Section 67 | IT Act 2000 | Publishing or transmitting obscene material in electronic form | Complaint Generator |
| Section 67A | IT Act 2000 | Publishing or transmitting material containing sexually explicit act | Complaint Generator |
| Section 67B | IT Act 2000 | Publishing or transmitting material depicting children in sexually explicit act | Complaint Generator |
| Rule 3(2)(b) | IT (Intermediary Guidelines) Rules 2021 | Obligation of intermediaries to remove content within 24 hours of court/government order | HashShield takedown notice |
| Section 354D | IPC | Stalking | Complaint Generator |
| Section 509 | IPC | Word, gesture or act intended to insult the modesty of a woman | Complaint Generator |

---

## 16. Judging Criteria Alignment

| Criterion | How KAALI Excels | Evidence |
|-----------|-----------------|----------|
| **Innovation & Problem Convergence** | Only solution that unifies PS01 (digital identity protection) + PS02 (resilient routing) + Women Safety into a single coherent platform. Not three bolted-together features — they share data layers and user context. | Crime data feeds SafePath AND complaint generator. Hash infrastructure serves both detection AND proactive monitoring. |
| **Technical Depth** | (1) Novel multi-objective A* with 5-variable impedance function on real road graphs. (2) Dual-stream deepfake detector (spatial + frequency). (3) Client-side Wasm perceptual hashing with zero-knowledge privacy guarantee. | Formalized cost function, ONNX model benchmarks, WebAssembly hash pipeline |
| **Feasibility & Working Demo** | Full deployment architecture with free-tier infrastructure. Realistic data pipeline using actual OSM/NCRB sources. All 5 modules have defined API contracts and database schemas. | This document + working deployed prototype |
| **Privacy & Ethics** | Raw intimate images NEVER leave the client device. Perceptual hashing computed client-side. Audio clips encrypted AES-256. Session data auto-purges after 30 days. | NFR-08, HashShield architecture diagram |
| **UI/UX & Accessibility** | Panic-resistant design: high-contrast SOS button (WCAG AA), dark mode, discreet quick-exit. Map-first navigation with color-coded safety layers. | Design system specs, accessibility NFRs |
| **Real-World Impact** | Every feature maps to a real scenario Indian women face daily: unsafe walking routes, deepfake harassment, leaked intimate images, difficulty filing cyber complaints. | User personas, legal section mappings |

---

## Appendix A: Project Structure (Monorepo)

```
kaali/
├── frontend/                        # React 18 + Vite PWA
│   ├── public/
│   │   ├── manifest.json           # PWA manifest
│   │   └── sw.js                   # Service worker (offline tiles)
│   ├── src/
│   │   ├── components/
│   │   │   ├── Map/                # Leaflet map + overlays
│   │   │   ├── SOS/                # SOS button + guardian dashboard
│   │   │   ├── DeepDefend/         # Deepfake detection UI
│   │   │   ├── HashShield/         # Client-side hashing + results
│   │   │   ├── Complaint/          # Cyber complaint form
│   │   │   └── Layout/             # Navigation, header, footer
│   │   ├── hooks/                  # Custom React hooks
│   │   ├── services/               # API client (axios/fetch)
│   │   ├── wasm/                   # PDQ hash WebAssembly module
│   │   ├── utils/                  # Helpers, constants
│   │   ├── pages/                  # Route pages
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── tailwind.config.js
│   ├── vite.config.js
│   └── package.json
│
├── backend/                         # FastAPI Python backend
│   ├── app/
│   │   ├── main.py                 # FastAPI app + CORS + middleware
│   │   ├── config.py               # Environment variables
│   │   ├── auth/                   # JWT auth routes + middleware
│   │   ├── routes/
│   │   │   ├── safepath.py         # /routes/safe-route, /routes/crime-heatmap
│   │   │   ├── deepdefend.py       # /detect/deepfake
│   │   │   ├── hashshield.py       # /hash/check, /hash/register, /hash/takedown-notice
│   │   │   ├── sos.py              # /sos/trigger, /sos/cancel + WebSocket handlers
│   │   │   └── complaint.py        # /complaint/generate
│   │   ├── services/
│   │   │   ├── routing_engine.py   # A* implementation + impedance calculation
│   │   │   ├── crime_kde.py        # KDE computation + grid generation
│   │   │   ├── deepfake_detector.py # ONNX model inference wrapper
│   │   │   ├── hash_service.py     # Hamming distance search
│   │   │   ├── sms_service.py      # Twilio integration
│   │   │   ├── pdf_generator.py    # ReportLab complaint/takedown PDF
│   │   │   └── websocket_manager.py # WebSocket connection manager
│   │   ├── models/                 # Pydantic request/response schemas
│   │   ├── db/
│   │   │   ├── postgres.py         # asyncpg connection pool
│   │   │   ├── mongo.py            # Motor async MongoDB client
│   │   │   └── redis.py            # aioredis connection
│   │   └── utils/
│   ├── models/                      # ONNX model files (.onnx)
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env
│
├── data-scripts/                    # One-time data ingestion
│   ├── ingest_osm_roads.py         # OSMnx → PostGIS
│   ├── generate_crime_data.py      # NCRB stats → synthetic crime points
│   ├── ingest_safe_havens.py       # Overpass API → PostGIS
│   ├── compute_kde_grid.py         # Scikit-learn KDE → PostGIS grid
│   └── seed_hash_registry.py       # Synthetic hash seeding for demo
│
├── .github/workflows/
│   └── deploy.yml                   # CI/CD (lint, test, deploy)
├── README.md
└── KAALI_PRD_SYSTEM_DESIGN.md       # This document
```

---

## Appendix B: Key Library Versions

```
# Backend (requirements.txt)
fastapi==0.115.0
uvicorn[standard]==0.30.0
python-jose[cryptography]==3.3.0     # JWT
passlib[bcrypt]==1.7.4               # Password hashing
asyncpg==0.29.0                      # PostgreSQL async driver
motor==3.3.2                         # MongoDB async driver
aioredis==2.0.1                      # Redis async client
osmnx==1.9.3                         # OSM road network extraction
networkx==3.3                        # Graph algorithms
scikit-learn==1.5.0                   # KDE computation
torch==2.4.0                         # PyTorch (training only)
onnxruntime==1.18.0                  # ONNX inference (production)
opencv-python-headless==4.10.0       # Image processing
facenet-pytorch==2.5.3               # MTCNN face detection
reportlab==4.2.0                     # PDF generation
twilio==9.0.0                        # SMS alerts
python-multipart==0.0.9              # File upload handling
httpx==0.27.0                        # Async HTTP client

# Frontend (package.json)
react: ^18.3.0
react-dom: ^18.3.0
react-router-dom: ^6.26.0
leaflet: ^1.9.4
react-leaflet: ^4.2.1
leaflet.heat: ^0.2.0                 # Heatmap plugin
axios: ^1.7.0
zustand: ^4.5.0                      # State management (lighter than Redux)
react-dropzone: ^14.2.0             # File upload for DeepDefend
framer-motion: ^11.5.0              # Animations
lucide-react: ^0.441.0              # Icons
```

---

*Document authored for HackerWrath 3.0 — Project KAALI, October 2026.*
