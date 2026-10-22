import pytest
import asyncio
from httpx import AsyncClient
from app.escalation import schedule_escalation_timer, cancel_escalation_timer
from app.storage import storage


@pytest.mark.asyncio
async def test_escalation_timer_auto_triggers(async_client: AsyncClient, auth_headers):
    # Trigger SOS session
    t_resp = await async_client.post("/api/v1/sos/trigger", json={
        "user_id": "usr_timer",
        "user_name": "Ritu",
        "location": {"lat": 28.6139, "lng": 77.2090},
        "contacts": [{"name": "Mom", "phone": "+919876543299", "relation": "Mother", "priority": 2}]
    }, headers=auth_headers)
    session_id = t_resp.json()["session_id"]

    # Cancel the 60s default timer and schedule a fast 0.2s timer for this test
    cancel_escalation_timer(session_id)
    task = schedule_escalation_timer(session_id, timeout_seconds=0.2)

    # Wait for timer to fire
    await asyncio.sleep(0.3)

    session = await storage.get_session(session_id)
    assert session["status"] == "escalated"
    assert session["auto_escalated"] is True
    assert "escalated_at" in session


@pytest.mark.asyncio
async def test_escalation_timer_disarmed_on_cancel(async_client: AsyncClient, auth_headers):
    # Trigger SOS session
    t_resp = await async_client.post("/api/v1/sos/trigger", json={
        "user_id": "usr_timer2",
        "user_name": "Divya",
        "location": {"lat": 28.6139, "lng": 77.2090},
        "passphrase": "rosemary"
    }, headers=auth_headers)
    session_id = t_resp.json()["session_id"]

    # Cancel quickly
    c_resp = await async_client.post("/api/v1/sos/cancel", json={
        "session_id": session_id,
        "passphrase": "rosemary"
    }, headers=auth_headers)
    assert c_resp.status_code == 200

    session = await storage.get_session(session_id)
    assert session["status"] == "cancelled"
    assert session["auto_escalated"] is False
