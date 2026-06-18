import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from jose import JWTError

from app.core.security import decode_token
from app.redis_client import get_redis

router = APIRouter(tags=["stream"])


async def _verify_ws_token(token: str) -> str | None:
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            return None
        return payload.get("sub")
    except JWTError:
        return None


@router.websocket("/ws/stream/{camera_id}")
async def stream_camera(websocket: WebSocket, camera_id: int, token: str = Query(...)):
    username = await _verify_ws_token(token)
    await websocket.accept()
    if not username:
        await websocket.close(code=4001)
        return

    redis = await get_redis()
    pubsub = redis.pubsub()
    await pubsub.subscribe(f"camera:{camera_id}:frames")

    async def _forward():
        async for message in pubsub.listen():
            if message["type"] == "message":
                await websocket.send_bytes(message["data"])

    async def _watch_disconnect():
        try:
            await websocket.receive()
        except Exception:
            pass

    try:
        fwd = asyncio.create_task(_forward())
        watcher = asyncio.create_task(_watch_disconnect())
        _, pending = await asyncio.wait([fwd, watcher], return_when=asyncio.FIRST_COMPLETED)
        for t in pending:
            t.cancel()
            try:
                await t
            except (asyncio.CancelledError, Exception):
                pass
    except (WebSocketDisconnect, Exception):
        pass
    finally:
        await pubsub.unsubscribe(f"camera:{camera_id}:frames")
        await pubsub.aclose()


@router.websocket("/ws/alerts")
async def stream_alerts(websocket: WebSocket, token: str = Query(...)):
    username = await _verify_ws_token(token)
    await websocket.accept()
    if not username:
        await websocket.close(code=4001)
        return

    redis = await get_redis()
    pubsub = redis.pubsub()
    await pubsub.subscribe("alerts")

    async def _forward():
        async for message in pubsub.listen():
            if message["type"] == "message":
                data = message["data"]
                if isinstance(data, bytes):
                    data = data.decode()
                await websocket.send_text(data)

    async def _watch_disconnect():
        try:
            await websocket.receive()
        except Exception:
            pass

    try:
        fwd = asyncio.create_task(_forward())
        watcher = asyncio.create_task(_watch_disconnect())
        _, pending = await asyncio.wait([fwd, watcher], return_when=asyncio.FIRST_COMPLETED)
        for t in pending:
            t.cancel()
            try:
                await t
            except (asyncio.CancelledError, Exception):
                pass
    except (WebSocketDisconnect, Exception):
        pass
    finally:
        await pubsub.unsubscribe("alerts")
        await pubsub.aclose()
