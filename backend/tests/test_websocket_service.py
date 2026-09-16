import asyncio
import json

import backend.app.services.websocket_service as websocket_service


class RecordingClient:
    def __init__(self):
        self.messages = []

    async def send_text(self, message):
        self.messages.append(json.loads(message))


class FailingClient:
    async def send_text(self, message):
        raise TimeoutError("simulated backpressure")


def test_broadcast_orders_events_and_evicts_failed_clients():
    async def _run():
        websocket_service._clients.clear()
        recorder = RecordingClient()
        failing = FailingClient()
        websocket_service.connect(recorder)
        websocket_service.connect(failing)
        await websocket_service.broadcast(json.dumps({"type": "reading", "data": {"id": 11}}))
        await websocket_service.broadcast(json.dumps({"type": "alert", "data": {"id": 12}}))
        assert [message["sequence"] for message in recorder.messages] == sorted(message["sequence"] for message in recorder.messages)
        assert recorder.messages[0]["event_id"] == "reading:11"
        assert recorder.messages[1]["event_id"] == "alert:12"
        assert failing not in websocket_service._clients
        websocket_service._clients.clear()

    asyncio.run(_run())
