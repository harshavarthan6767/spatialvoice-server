"""
signaling.py — WebRTC signaling server for SpatialVoice
Rooms hold up to 3 peers. Each peer:
  1. Sends  {"type":"join",  "room":"abc123"}
  2. Gets   {"type":"joined", "peer_id":"...", "peers":[...]}
  3. Sends  {"type":"offer"/"answer"/"ice", "to":<peer_id>, "data":{...}}
  4. Server forwards to target peer
"""
import uuid
import json
from collections import defaultdict
from fastapi import WebSocket, WebSocketDisconnect

# room_id -> {peer_id: WebSocket}
rooms: dict[str, dict[str, WebSocket]] = defaultdict(dict)


async def signaling_ws(websocket: WebSocket, username: str):
    peer_id = str(uuid.uuid4())[:8]
    room_id = None
    print(f"[Signal] New connection: peer={peer_id} user={username}")

    try:
        async for raw in websocket.iter_text():
            msg = json.loads(raw)
            print(f"[Signal] peer={peer_id} type={msg.get('type')} room={msg.get('room','')}")

            # ── JOIN ──────────────────────────────────────────
            if msg["type"] == "join":
                room_id = msg["room"]

                if len(rooms[room_id]) >= 3:
                    await websocket.send_json({
                        "type": "error",
                        "msg":  "Room full (max 3 peers)"
                    })
                    await websocket.close()
                    return

                rooms[room_id][peer_id] = websocket
                existing = [p for p in rooms[room_id] if p != peer_id]

                # Tell this peer who is already in the room
                await websocket.send_json({
                    "type":     "joined",
                    "peer_id":  peer_id,
                    "username": username,
                    "peers":    existing
                })
                print(f"[Signal] {peer_id} joined room '{room_id}' | existing: {existing}")

                # Tell everyone else a new peer arrived
                for pid in existing:
                    try:
                        await rooms[room_id][pid].send_json({
                            "type":    "peer_joined",
                            "peer_id": peer_id
                        })
                    except Exception as e:
                        print(f"[Signal] Failed to notify {pid}: {e}")

            # ── OFFER / ANSWER / ICE — forward to target ──────
            elif msg["type"] in ("offer", "answer", "ice"):
                target = msg.get("to")
                if room_id and target in rooms.get(room_id, {}):
                    await rooms[room_id][target].send_json({
                        "type": msg["type"],
                        "from": peer_id,
                        "data": msg["data"]
                    })
                    print(f"[Signal] Forwarded {msg['type']}: {peer_id} → {target}")
                else:
                    print(f"[Signal] Target {target} not in room {room_id}")

            # ── LEAVE ─────────────────────────────────────────
            elif msg["type"] == "leave":
                print(f"[Signal] {peer_id} leaving room '{room_id}'")
                break

    except WebSocketDisconnect:
        print(f"[Signal] {peer_id} disconnected")
    except Exception as e:
        print(f"[Signal] Error for {peer_id}: {e}")
    finally:
        if room_id and peer_id in rooms.get(room_id, {}):
            del rooms[room_id][peer_id]
            # Notify remaining peers
            for pid, ws in list(rooms[room_id].items()):
                try:
                    await ws.send_json({
                        "type":    "peer_left",
                        "peer_id": peer_id
                    })
                except Exception:
                    pass
            if not rooms[room_id]:
                del rooms[room_id]
            print(f"[Signal] Cleaned up {peer_id} from room '{room_id}'")
