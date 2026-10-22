import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.storage import storage


def test_websocket_victim_to_guardian_fanout():
    client = TestClient(app)

    # 1. Trigger session via REST
    resp = client.post("/api/v1/sos/trigger", json={
        "user_id": "usr_ws",
        "user_name": "Kavya",
        "location": {"lat": 28.6139, "lng": 77.2090}
    }, headers={"X-API-Key": "kaali-secret-key-12345"})
    assert resp.status_code == 200
    session_id = resp.json()["session_id"]

    # 2. Connect Guardian WS
    with client.websocket_connect(f"/ws/guardian/{session_id}") as guardian_ws:
        init_data = guardian_ws.receive_json()
        assert init_data["type"] == "init_state"
        assert init_data["user_name"] == "Kavya"

        # 3. Connect Victim WS and stream new GPS coordinate
        with client.websocket_connect(f"/ws/sos/{session_id}") as victim_ws:
            victim_ws.send_json({
                "lat": 28.6145,
                "lng": 77.2099,
                "accuracy": 3.2,
                "speed": 1.8
            })

            # 4. Guardian receives real-time broadcast
            broadcast_msg = guardian_ws.receive_json()
            assert broadcast_msg["type"] == "location_update"
            assert broadcast_msg["location"]["lat"] == 28.6145
            assert broadcast_msg["location"]["lng"] == 77.2099
