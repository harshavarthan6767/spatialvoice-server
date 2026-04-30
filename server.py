"""
server.py — SpatialVoice FastAPI WebSocket server
Run with: uvicorn server:app --host 0.0.0.0 --port 8000 --reload
"""

import io
import json
import struct
import time
import os
import numpy as np
import soundfile as sf

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse

from pipeline import SpatialVoicePipeline, SAMPLE_RATE, CHUNK_SAMPLES
from signaling import signaling_ws
from auth import USERS, create_token, verify_token
import jwt
import os

app = FastAPI(title='SpatialVoice API', version='1.0')

# Allow the React frontend (running on localhost:3000) to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_methods=['*'],
    allow_headers=['*'],
)

# One pipeline instance shared across connections
pipeline = SpatialVoicePipeline(models_dir='models')

# Serve the React frontend build from FastAPI
# This means ONE port (8001) covers both the API/WS and the web UI
DIST_DIR = os.path.join(os.path.dirname(__file__), 'spatialvoice-demo', 'dist')


@app.get('/health')
def health():
    return {'status': 'ok', 'sample_rate': SAMPLE_RATE, 'chunk_samples': CHUNK_SAMPLES}


@app.get('/positions')
def get_positions():
    """Return current speaker positions (for the frontend visualiser)."""
    pos = pipeline.speaker_positions.tolist()
    return {
        'positions': [
            {'speaker': i, 'azimuth': p[0], 'elevation': p[1], 'distance': p[2]}
            for i, p in enumerate(pos)
        ]
    }


@app.websocket('/ws/audio')
async def audio_ws(websocket: WebSocket):
    """
    WebSocket protocol:
      Client sends : raw float32 PCM bytes (mono, 16 kHz)
      Server sends : JSON metadata + raw float32 stereo PCM bytes

    Message format from server (binary):
      [4 bytes: JSON length] [JSON bytes] [float32 stereo PCM bytes]
    """
    await websocket.accept()
    print('Client connected')
    pipeline._reset_lstm_state()

    try:
        while True:
            raw = await websocket.receive_bytes()

            # Decode float32 PCM
            mono = np.frombuffer(raw, dtype=np.float32)
            if len(mono) == 0:
                continue

            # Process through pipeline
            t0     = time.perf_counter()
            result = pipeline.process_chunk(mono, noise_level=0.2)
            latency_ms = (time.perf_counter() - t0) * 1000

            stereo    = result['stereo']      # (2, T) float32
            positions = result['positions']   # (N, 3)

            # Build metadata
            meta = {
                'latency_ms': round(latency_ms, 2),
                'positions': [
                    {'speaker': i,
                     'azimuth':   round(float(p[0]), 1),
                     'elevation': round(float(p[1]), 1),
                     'distance':  round(float(p[2]), 2)}
                    for i, p in enumerate(positions)
                ]
            }

            # Pack: [4-byte JSON len][JSON][stereo float32 bytes]
            meta_bytes  = json.dumps(meta).encode('utf-8')
            header      = struct.pack('>I', len(meta_bytes))
            stereo_bytes = stereo.T.astype(np.float32).tobytes()  # interleaved L/R

            await websocket.send_bytes(header + meta_bytes + stereo_bytes)

    except WebSocketDisconnect:
        print('Client disconnected')
    except Exception as e:
        print(f'Error: {e}')
        await websocket.close()

@app.post("/login")
async def login(username: str = Form(...), password: str = Form(...)):
    if USERS.get(username) != password:
        raise HTTPException(401, "Wrong username or password")
    token = create_token(username)
    return {"access_token": token, "token_type": "bearer"}

@app.websocket('/ws/signal')
async def signal_endpoint(websocket: WebSocket, token: str = ""):
    """WebRTC signaling — SDP offer/answer/ICE candidate relay."""
    try:
        from auth import SECRET_KEY
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        username = payload["sub"]
    except Exception:
        await websocket.close(code=1008)   # Policy violation
        return
    await signaling_ws(websocket, username)


if __name__ == '__main__':
    import uvicorn
    uvicorn.run('server:app', host='0.0.0.0', port=8001, reload=False)

# Mount static assets (JS/CSS/WASM etc) — must come AFTER all route definitions
# so /health, /ws/audio, /ws/signal routes take priority
if os.path.isdir(DIST_DIR):
    # Serve /assets/ folder
    app.mount('/assets', StaticFiles(directory=os.path.join(DIST_DIR, 'assets')), name='assets')
    # Serve /models/ folder
    models_dir = os.path.join(DIST_DIR, '..', 'public', 'models')
    if os.path.isdir(models_dir):
        app.mount('/models', StaticFiles(directory=models_dir), name='models')

    @app.get('/{full_path:path}')
    async def spa_fallback(full_path: str):
        """Serve index.html for any unmatched route (SPA client-side routing)."""
        return FileResponse(os.path.join(DIST_DIR, 'index.html'))