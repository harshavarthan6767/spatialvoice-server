// useWebRTC.js - Clean WebRTC hook with reliable audio via HTML Audio elements
import { useRef, useState, useCallback } from "react";

const ICE = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

const SERVER_WS = import.meta.env.VITE_WS_URL ?? "ws://localhost:8001";

export function useWebRTC({ token, onPeerCount }) {
  const [peerId,  setPeerId]  = useState(null);
  const [peers,   setPeers]   = useState([]);
  const [status,  setStatus]  = useState('idle'); // idle | connecting | connected | error
  const [micOn,   setMicOn]   = useState(false);
  const [error,   setError]   = useState(null);

  const sig          = useRef(null);
  const pcs          = useRef({});          // peerId → RTCPeerConnection
  const localStream  = useRef(null);
  const audioEls     = useRef({});          // peerId → <audio> element
  const panners      = useRef({});          // peerId → StereoPannerNode
  const audioCtx     = useRef(null);

  // Stereo positions for up to 3 callers: Left, Front, Right
  const PAN_VALUES = [-0.9, 0, 0.9];
  const peerOrder  = useRef([]);

  const getPan = (pid) => {
    const idx = peerOrder.current.indexOf(pid);
    return PAN_VALUES[idx] ?? 0;
  };

  // Play a remote stream with stereo panning
  const playRemoteStream = useCallback((pid, stream) => {
    // Use simple <audio> element — most reliable for WebRTC
    let el = audioEls.current[pid];
    if (!el) {
      el = document.createElement('audio');
      el.autoplay = true;
      el.setAttribute('playsinline', '');
      document.body.appendChild(el);
      audioEls.current[pid] = el;
    }
    el.srcObject = stream;
    el.play().catch(e => console.warn('[Audio] play():', e));

    // Apply stereo panning via WebAudio
    if (!audioCtx.current) {
      audioCtx.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    const ctx = audioCtx.current;
    if (ctx.state === 'suspended') ctx.resume();

    // Remove old panner if exists
    if (panners.current[pid]) {
      try { panners.current[pid].disconnect(); } catch {}
    }

    const src    = ctx.createMediaStreamSource(stream);
    const panner = ctx.createStereoPanner();
    panner.pan.value = getPan(pid);
    src.connect(panner);
    panner.connect(ctx.destination);
    panners.current[pid] = panner;
    console.log(`[Audio] Peer ${pid} → pan=${panner.pan.value}`);
  }, []);

  // Update pan for a specific peer index
  const updatePan = useCallback((speakerIdx, azimuth) => {
    const pid = peerOrder.current[speakerIdx];
    if (!pid || !panners.current[pid]) return;
    panners.current[pid].pan.value = Math.max(-1, Math.min(1, azimuth / 90));
  }, []);

  const createPC = useCallback((remotePid) => {
    const pc = new RTCPeerConnection({ iceServers: ICE });

    pc.onicecandidate = ({ candidate }) => {
      if (candidate && sig.current?.readyState === WebSocket.OPEN) {
        sig.current.send(JSON.stringify({ type:'ice', to:remotePid, data:candidate }));
      }
    };

    pc.ontrack = ({ streams }) => {
      if (!streams[0]) return;
      console.log('[WebRTC] Remote track from', remotePid);
      playRemoteStream(remotePid, streams[0]);
    };

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] ${remotePid}: ${pc.connectionState}`);
    };

    if (localStream.current) {
      localStream.current.getTracks().forEach(t => pc.addTrack(t, localStream.current));
    }

    pcs.current[remotePid] = pc;
    return pc;
  }, [playRemoteStream]);

  const joinRoom = useCallback(async (room) => {
    setError(null);
    setStatus('connecting');

    // Get mic FIRST so it's available when peer connections are created
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 48000 },
        video: false,
      });
      localStream.current = stream;
      setMicOn(true);
    } catch (e) {
      console.warn('[Mic] denied:', e.message);
      setError('Microphone denied — you can still hear others');
    }

    const ws = new WebSocket(`${SERVER_WS}/ws/signal?token=${token}`);
    sig.current = ws;

    ws.onopen  = () => ws.send(JSON.stringify({ type:'join', room }));
    ws.onerror = () => { setError('Server unreachable — is the server running?'); setStatus('error'); };
    ws.onclose = (e) => { if (e.code !== 1000) { setStatus('error'); } };

    ws.onmessage = async ({ data }) => {
      const msg = JSON.parse(data);
      console.log('[Signal]', msg.type, msg);

      switch (msg.type) {
        case 'joined': {
          setPeerId(msg.peer_id);
          setStatus('connected');
          setPeers(msg.peers);
          peerOrder.current = [...msg.peers];
          onPeerCount?.(msg.peers.length);
          for (const rp of msg.peers) {
            const pc    = createPC(rp);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            ws.send(JSON.stringify({ type:'offer', to:rp, data:offer }));
          }
          break;
        }
        case 'peer_joined': {
          peerOrder.current = [...peerOrder.current, msg.peer_id];
          setPeers(p => [...new Set([...p, msg.peer_id])]);
          onPeerCount?.(peerOrder.current.length);
          break;
        }
        case 'offer': {
          const pc = createPC(msg.from);
          await pc.setRemoteDescription(new RTCSessionDescription(msg.data));
          const ans = await pc.createAnswer();
          await pc.setLocalDescription(ans);
          ws.send(JSON.stringify({ type:'answer', to:msg.from, data:ans }));
          break;
        }
        case 'answer':
          await pcs.current[msg.from]?.setRemoteDescription(new RTCSessionDescription(msg.data));
          break;
        case 'ice':
          await pcs.current[msg.from]?.addIceCandidate(new RTCIceCandidate(msg.data));
          break;
        case 'peer_left':
          pcs.current[msg.peer_id]?.close();
          delete pcs.current[msg.peer_id];
          // Remove audio element
          if (audioEls.current[msg.peer_id]) {
            audioEls.current[msg.peer_id].srcObject = null;
            audioEls.current[msg.peer_id].remove();
            delete audioEls.current[msg.peer_id];
          }
          peerOrder.current = peerOrder.current.filter(p => p !== msg.peer_id);
          setPeers(p => p.filter(id => id !== msg.peer_id));
          onPeerCount?.(peerOrder.current.length);
          break;
        case 'error':
          setError(msg.msg);
          break;
        default: break;
      }
    };
  }, [createPC]);

  const leaveRoom = useCallback(() => {
    sig.current?.send(JSON.stringify({ type:'leave' }));
    sig.current?.close(1000);
    Object.values(pcs.current).forEach(pc => pc.close());
    Object.values(audioEls.current).forEach(el => { el.srcObject=null; el.remove(); });
    localStream.current?.getTracks().forEach(t => t.stop());
    pcs.current = {};
    audioEls.current = {};
    panners.current = {};
    peerOrder.current = [];
    localStream.current = null;
    setStatus('idle');
    setPeers([]);
    setPeerId(null);
    setMicOn(false);
    setError(null);
  }, []);

  return { peerId, peers, status, micOn, error, joinRoom, leaveRoom, updatePan };
}
