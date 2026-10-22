import pytest
import base64
from httpx import AsyncClient
from app.config import settings
from app.storage import storage


@pytest.mark.asyncio
async def test_health_check(async_client: AsyncClient):
    resp = await async_client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["service"] == "kaali-emergency-sos"


@pytest.mark.asyncio
async def test_trigger_sos(async_client: AsyncClient, auth_headers):
    payload = {
        "user_id": "usr_9921",
        "user_name": "Priya Sharma",
        "location": {
            "lat": 28.6328,
            "lng": 77.2197,
            "accuracy": 4.5,
            "speed": 1.2
        },
        "trigger_type": "triple_tap",
        "contacts": [
            {
                "name": "Sister Anita",
                "phone": "+919876543210",
                "relation": "Sister",
                "priority": 1
            },
            {
                "name": "Brother Rohan",
                "phone": "+919876543211",
                "relation": "Brother",
                "priority": 2
            }
        ],
        "passphrase": "orchid"
    }

    resp = await async_client.post("/api/v1/sos/trigger", json=payload, headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()

    assert data["session_id"].startswith("sos_")
    assert data["status"] == "active"
    assert "/live/" in data["tracking_url"]
    assert "+919876543210" in data["sms_sent_to"]
    assert len(data["nearest_havens"]) > 0

    # Verify session saved in storage
    session = await storage.get_session(data["session_id"])
    assert session is not None
    assert session["user_name"] == "Priya Sharma"
    assert session["passphrase"] == "orchid"


@pytest.mark.asyncio
async def test_cancel_sos_normal(async_client: AsyncClient, auth_headers):
    # 1. Trigger
    trigger_payload = {
        "user_id": "usr_1",
        "user_name": "Neha",
        "location": {"lat": 28.5355, "lng": 77.3910},
        "passphrase": "lavender"
    }
    t_resp = await async_client.post("/api/v1/sos/trigger", json=trigger_payload, headers=auth_headers)
    session_id = t_resp.json()["session_id"]

    # 2. Cancel with wrong passphrase
    bad_cancel = await async_client.post("/api/v1/sos/cancel", json={
        "session_id": session_id,
        "passphrase": "wrongpassword"
    }, headers=auth_headers)
    assert bad_cancel.status_code == 401

    # 3. Cancel with correct passphrase
    good_cancel = await async_client.post("/api/v1/sos/cancel", json={
        "session_id": session_id,
        "passphrase": "lavender"
    }, headers=auth_headers)
    assert good_cancel.status_code == 200
    data = good_cancel.json()
    assert data["status"] == "cancelled"
    assert data["is_duress"] is False
    assert data["duration_seconds"] >= 0


@pytest.mark.asyncio
async def test_cancel_sos_duress(async_client: AsyncClient, auth_headers):
    # Trigger
    trigger_payload = {
        "user_id": "usr_2",
        "user_name": "Kavita",
        "location": {"lat": 28.6139, "lng": 77.2090},
        "passphrase": "lotus"
    }
    t_resp = await async_client.post("/api/v1/sos/trigger", json=trigger_payload, headers=auth_headers)
    session_id = t_resp.json()["session_id"]

    # Enter secret duress word "help"
    cancel_resp = await async_client.post("/api/v1/sos/cancel", json={
        "session_id": session_id,
        "passphrase": "help"
    }, headers=auth_headers)
    assert cancel_resp.status_code == 200
    data = cancel_resp.json()
    # Response tells perpetrator it's cancelled
    assert data["status"] == "cancelled"
    # But internal flag is True
    assert data["is_duress"] is True

    # Storage session is flagged as duress_escalated
    session = await storage.get_session(session_id)
    assert session["status"] == "duress_escalated"
    assert session["is_duress"] is True


@pytest.mark.asyncio
async def test_ambient_audio_encryption_and_decryption(async_client: AsyncClient, auth_headers):
    # 1. Trigger
    t_resp = await async_client.post("/api/v1/sos/trigger", json={
        "user_id": "usr_3",
        "user_name": "Simran",
        "location": {"lat": 28.7041, "lng": 77.1025}
    }, headers=auth_headers)
    session_id = t_resp.json()["session_id"]

    # 2. Upload raw audio
    raw_audio_content = b"RIFF....WAVEfmt ....data" + b"\x00\x01\x02\x03" * 256
    files = {
        "file": ("ambient.wav", raw_audio_content, "audio/wav")
    }

    upload_resp = await async_client.post(
        f"/api/v1/sos/{session_id}/audio",
        files=files,
        headers=auth_headers
    )
    assert upload_resp.status_code == 200
    u_data = upload_resp.json()
    assert u_data["encrypted"] is True
    assert len(u_data["sha256_hash"]) == 64

    # 3. Check that storage holds ciphertext (NOT plaintext)
    encrypted_stored = await storage.get_audio(session_id)
    assert encrypted_stored != raw_audio_content
    assert b"gAAAAA" in encrypted_stored  # Standard Fernet token prefix

    # 4. Stream decrypted audio
    stream_resp = await async_client.get(f"/api/v1/sos/{session_id}/audio")
    assert stream_resp.status_code == 200
    assert stream_resp.content == raw_audio_content
    assert stream_resp.headers["X-Audio-SHA256"] == u_data["sha256_hash"]


@pytest.mark.asyncio
async def test_forensic_incident_dossier(async_client: AsyncClient, auth_headers):
    # 1. Trigger
    t_resp = await async_client.post("/api/v1/sos/trigger", json={
        "user_id": "usr_4",
        "user_name": "Aaradhya",
        "location": {"lat": 28.6129, "lng": 77.2295, "accuracy": 3.0},
        "contacts": [{"name": "Dad", "phone": "+919999999999", "relation": "Father"}]
    }, headers=auth_headers)
    session_id = t_resp.json()["session_id"]

    # Add a couple of trajectory waypoints
    await storage.add_waypoint(session_id, {"lat": 28.6135, "lng": 77.2300, "accuracy": 4.0, "speed": 1.5})
    await storage.add_waypoint(session_id, {"lat": 28.6140, "lng": 77.2305, "accuracy": 3.8, "speed": 2.0})

    # Fetch dossier
    dossier_resp = await async_client.get(f"/api/v1/sos/{session_id}/dossier")
    assert dossier_resp.status_code == 200
    d_data = dossier_resp.json()

    assert d_data["session_id"] == session_id
    assert d_data["user_name"] == "Aaradhya"
    assert len(d_data["pdf_base64"]) > 500
    assert len(d_data["incident_sha256"]) == 64
    assert d_data["total_waypoints"] == 3

    # Verify PDF starts with %PDF header
    pdf_bytes = base64.b64decode(d_data["pdf_base64"])
    assert pdf_bytes.startswith(b"%PDF")
