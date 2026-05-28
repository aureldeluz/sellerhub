"""WebSocket connection manager for real-time events."""
import asyncio
import json
import logging
from typing import Dict, Set
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        self.user_sockets: Dict[str, Set[WebSocket]] = {}
        self.lock = asyncio.Lock()

    async def connect(self, user_id: str, ws: WebSocket):
        await ws.accept()
        async with self.lock:
            self.user_sockets.setdefault(user_id, set()).add(ws)

    async def disconnect(self, user_id: str, ws: WebSocket):
        async with self.lock:
            socks = self.user_sockets.get(user_id)
            if socks and ws in socks:
                socks.discard(ws)
                if not socks:
                    self.user_sockets.pop(user_id, None)

    async def send_to_user(self, user_id: str, event: str, payload: dict):
        socks = list(self.user_sockets.get(user_id, []))
        if not socks:
            return
        msg = json.dumps({"event": event, "data": payload})
        for ws in socks:
            try:
                await ws.send_text(msg)
            except Exception as e:
                logger.warning(f"Failed to send to {user_id}: {e}")

    async def broadcast_to_role(self, user_ids: list, event: str, payload: dict):
        for uid in user_ids:
            await self.send_to_user(uid, event, payload)

    def online_users(self) -> Set[str]:
        return set(self.user_sockets.keys())


manager = ConnectionManager()
