// src/hooks/useWebRTC.js
import { useRef, useCallback, useState, useEffect } from 'react';
import { createSpatialPeer, initAudioListener } from '../audio/spatialAudio';
import { createNoiseSuppressedStream } from '../audio/createAECStream';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];
const SERVER_WS = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8001';

export function useWebRTC({ token, onPeerCount }) {
  const [peerId,  setPeerId]  = useState(null);
  const [peers,   setPeers]   = useState([]);
  const [status,  setStatus]  = useState('idle');
  const [micOn,   setMicOn]   = useState(false);
  const [error,   setError]   = useState(null);
  const [usingWasm, setUsingWasm] = useState(false);

  const sig          = useRef(null);
  const pcs          = useRef({});           // peerId → RTCPeerConnection
  const localStream  = useRef(null);
  const audioCtx     = useRef(null);
  const spatialPeers = useRef({});           // peerId → { updatePosition, cleanup }
  const peerOrder    = useRef([]);
  const wasmCleanup  = useRef(null);

  // ─── AudioContext + Listener (created once) ──────────────────────────────────
  useEffect(() => {
    audioCtx.current = new (window.AudioContext || window.webkitAudioContext)({
      latencyHint: 'interactive',
    });
    initAudioListener(audioCtx.current);

    return () => {
      audioCtx.current?.close();
    };
  }, []);

  // ─── Capture mic (3-block try/catch) ─────────────────────────────────────────
  const getMic = useCallback(async (enableNoiseReduction = true) => {
    if (localStream.current) return localStream.current; // already have it
    setError(null);

    if (audioCtx.current?.state === 'suspended') {
      await audioCtx.current.resume();
    }

    // ─── Block 1: OS / Browser microphone permission ─────────────────────────
    let rawStream;
    try {
      rawStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          autoGainControl: true,
          noiseSuppression: true,
          sampleRate: 48000,
          channelCount: 1,
        },
        video: false,
      });
    } catch (permissionError) {
      console.error('[Mic] Permission denied:', permissionError);
      setError(`Mic: ${permissionError.name} — check permissions in device settings`);
      return null;
    }

    // ─── Block 2: WASM noise suppression (optional enhancement) ──────────────
    let finalStream = rawStream;
    if (enableNoiseReduction) {
      try {
        const handle = await createNoiseSuppressedStream(rawStream);
        finalStream = handle.stream;
        wasmCleanup.current = handle.cleanup;
        setUsingWasm(true);
        console.info('[RNNoise] WASM noise suppression active.');
      } catch (wasmError) {
        console.warn('[RNNoise] WASM unavailable, falling back to browser noiseSuppression:', wasmError);
        setUsingWasm(false);
      }
    } else {
      setUsingWasm(false);
    }

    localStream.current = finalStream;
    // Keep reference to raw tracks so we can stop them later
    localStream.current._rawTracks = rawStream.getTracks();
    setMicOn(true);
    return finalStream;
  }, []);

  // ─── Create RTCPeerConnection ────────────────────────────────────────────────
  const createPC = useCallback((remotePid) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    if (localStream.current) {
      localStream.current.getTracks().forEach(t =>
        pc.addTrack(t, localStream.current)
      );
    }

    pc.ontrack = ({ streams }) => {
      if (!streams[0]) return;
      const idx = peerOrder.current.indexOf(remotePid);
      const defaults = [
        { azimuth: -60, elevation: 5, distance: 1.2 },
        { azimuth:   0, elevation: 5, distance: 1.5 },
        { azimuth:  60, elevation: 5, distance: 1.2 },
      ];
      const pos = defaults[idx] ?? { azimuth: 0, elevation: 5, distance: 1.5 };

      spatialPeers.current[remotePid]?.cleanup();
      spatialPeers.current[remotePid] = createSpatialPeer(
        audioCtx.current,
        streams[0],
        pos
      );
      console.log(`[Audio] HRTF peer ${remotePid} → az=${pos.azimuth}`);
    };

    pc.onicecandidate = ({ candidate }) => {
      if (candidate && sig.current?.readyState === WebSocket.OPEN) {
        sig.current.send(JSON.stringify({ type: 'ice', to: remotePid, data: candidate }));
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] ${remotePid}: ${pc.connectionState}`);
      if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
        spatialPeers.current[remotePid]?.cleanup();
        delete spatialPeers.current[remotePid];
      }
    };

    pcs.current[remotePid] = pc;
    return pc;
  }, []);

  // ─── Join room ───────────────────────────────────────────────────────────────
  const joinRoom = useCallback(async (room, enableNoiseReduction = true) => {
    setError(null);
    setStatus('connecting');

    const stream = await getMic(enableNoiseReduction);
    if (!stream) {
      setStatus('idle');
      return;
    }

    const ws = new WebSocket(`${SERVER_WS}/ws/signal?token=${token}`);
    sig.current = ws;

    ws.onopen  = () => ws.send(JSON.stringify({ type: 'join', room }));
    ws.onerror = () => { setError('Server unreachable — is the server running?'); setStatus('error'); };
    ws.onclose = (e) => { if (e.code !== 1000) setStatus('error'); };

    ws.onmessage = async ({ data }) => {
      const msg = JSON.parse(data);

      switch (msg.type) {
        case 'joined': {
          setPeerId(msg.peer_id);
          setPeers(msg.peers);
          peerOrder.current = [...msg.peers];
          setStatus('connected');
          onPeerCount?.(msg.peers.length);

          for (const rp of msg.peers) {
            const pc    = createPC(rp);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            ws.send(JSON.stringify({ type: 'offer', to: rp, data: offer }));
          }
          break;
        }
        case 'peer_joined': {
          setPeers(prev => {
            const next = [...prev, msg.peer_id];
            peerOrder.current = next;
            onPeerCount?.(next.length);
            return next;
          });
          break;
        }
        case 'peer_left': {
          setPeers(prev => {
            const next = prev.filter(x => x !== msg.peer_id);
            peerOrder.current = next;
            onPeerCount?.(next.length);
            return next;
          });
          pcs.current[msg.peer_id]?.close();
          delete pcs.current[msg.peer_id];
          spatialPeers.current[msg.peer_id]?.cleanup();
          delete spatialPeers.current[msg.peer_id];
          break;
        }
        case 'offer': {
          const pc = pcs.current[msg.from] || createPC(msg.from);
          await pc.setRemoteDescription(new RTCSessionDescription(msg.data));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          ws.send(JSON.stringify({ type: 'answer', to: msg.from, data: answer }));
          break;
        }
        case 'answer': {
          await pcs.current[msg.from]?.setRemoteDescription(
            new RTCSessionDescription(msg.data)
          );
          break;
        }
        case 'ice': {
          await pcs.current[msg.from]?.addIceCandidate(
            new RTCIceCandidate(msg.data)
          );
          break;
        }
        case 'error': {
          setError(msg.msg);
          setStatus('error');
          ws.close();
          break;
        }
        default: break;
      }
    };
  }, [createPC, getMic, token, onPeerCount]);

  // ─── Update spatial position for a peer ──────────────────────────────────────
  const updatePan = useCallback((speakerIdx, position, peerList) => {
    const pid = (peerList ?? peerOrder.current)[speakerIdx];
    if (!pid || !spatialPeers.current[pid]) return;
    spatialPeers.current[pid].updatePosition(position);
  }, []);

  // ─── Leave room ──────────────────────────────────────────────────────────────
  const leaveRoom = useCallback(() => {
    sig.current?.send(JSON.stringify({ type: 'leave' }));
    sig.current?.close();
    sig.current = null;

    Object.values(pcs.current).forEach(pc => pc.close());
    pcs.current = {};

    Object.values(spatialPeers.current).forEach(sp => sp.cleanup());
    spatialPeers.current = {};

    wasmCleanup.current?.();
    wasmCleanup.current = null;

    localStream.current?._rawTracks?.forEach(t => t.stop());
    localStream.current?.getTracks().forEach(t => t.stop());
    localStream.current = null;

    setStatus('idle');
    setPeers([]);
    setPeerId(null);
    setMicOn(false);
    setUsingWasm(false);
    peerOrder.current = [];
  }, []);

  return {
    peerId,
    peers,
    status,
    micOn,
    error,
    usingWasm,
    joinRoom,
    leaveRoom,
    updatePan,
  };
}
