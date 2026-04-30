// src/hooks/useSpatialAudio.js
// Spatializes each remote WebRTC peer's audio stream using WebAudio ConvolverNodes.
// HRTF filters come from SpatialNet ONNX model running in-browser via onnxruntime-web.
import { useRef, useCallback, useEffect, useState } from "react";

const HRTF_LENGTH = 128;
const SAMPLE_RATE = 16000;

// Default positions: Left, Front, Right — well-separated for demo
const DEFAULT_POSITIONS = [
  { azimuth: -60, elevation:  5, distance: 1.2 },
  { azimuth:   0, elevation:  5, distance: 1.5 },
  { azimuth:  60, elevation:  5, distance: 1.2 },
];

export function useSpatialAudio() {
  const [positions,  setPositions]  = useState(DEFAULT_POSITIONS);
  const [modelReady, setModelReady] = useState(false);

  const sessionRef   = useRef(null);    // ONNX session
  const audioCtxRef  = useRef(null);
  const peerNodesRef = useRef({});      // peer_id → audio graph nodes
  const peerIdxRef   = useRef({});      // peer_id → speaker slot index (0-2)

  // Skip ONNX in browser — use WebAudio stereo panning (works everywhere, zero deps)
  // SpatialNet ONNX runs on the FastAPI server for the pipeline; in-browser we use panning
  useEffect(() => {
    setModelReady(false);
    console.log("[SpatialAudio] Using stereo pan mode (L/C/R spatial effect via WebAudio)");
  }, []);

  // ── Get HRTF filters from SpatialNet ─────────────────────────
  const getHRTF = useCallback(async (azimuth, elevation, distance) => {
    if (!sessionRef.current) return null;
    try {
      const pos    = new Float32Array([azimuth / 180.0, elevation / 45.0, distance / 3.0]);
      const tensor = new ort.Tensor("float32", pos, [1, 3]);
      const out    = await sessionRef.current.run({ position: tensor });

      // SpatialNet outputs hrtf_left and hrtf_right (each HRTF_LENGTH floats)
      const keys = Object.keys(out);
      return {
        left:  out[keys[0]].data,
        right: out[keys[1]]?.data ?? out[keys[0]].data,
      };
    } catch {
      return null;
    }
  }, []);

  // ── Simple stereo pan fallback (no ONNX) ─────────────────────
  const applyPan = useCallback((ctx, source, azimuth) => {
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, azimuth / 90.0));
    source.connect(panner);
    panner.connect(ctx.destination);
    return { source, panner, type: "pan" };
  }, []);

  // ── Attach a remote MediaStream, spatialize it ───────────────
  const addRemoteStream = useCallback(async (peerId, stream) => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext({ sampleRate: SAMPLE_RATE });
    }
    const ctx = audioCtxRef.current;

    // Assign speaker slot
    const taken   = new Set(Object.values(peerIdxRef.current));
    const slotIdx = [0, 1, 2].find((i) => !taken.has(i)) ?? 0;
    peerIdxRef.current[peerId] = slotIdx;

    const pos = positions[slotIdx] ?? DEFAULT_POSITIONS[0];
    const source = ctx.createMediaStreamSource(stream);

    // Try HRTF first, fall back to stereo panning
    const hrtf = modelReady ? await getHRTF(pos.azimuth, pos.elevation, pos.distance) : null;

    if (hrtf) {
      // Full HRTF binaural convolution
      const splitter = ctx.createChannelSplitter(1);
      const merger   = ctx.createChannelMerger(2);
      const convL    = ctx.createConvolver();
      const convR    = ctx.createConvolver();

      const bufL = ctx.createBuffer(1, HRTF_LENGTH, SAMPLE_RATE);
      const bufR = ctx.createBuffer(1, HRTF_LENGTH, SAMPLE_RATE);
      bufL.copyToChannel(new Float32Array(hrtf.left),  0);
      bufR.copyToChannel(new Float32Array(hrtf.right), 0);
      convL.buffer = bufL;
      convR.buffer = bufR;

      source.connect(splitter);
      splitter.connect(convL, 0);
      splitter.connect(convR, 0);
      convL.connect(merger, 0, 0);
      convR.connect(merger, 0, 1);
      merger.connect(ctx.destination);

      peerNodesRef.current[peerId] = { source, convL, convR, merger, splitter, type: "hrtf" };
    } else {
      // Stereo panning fallback
      const nodes = applyPan(ctx, source, pos.azimuth);
      peerNodesRef.current[peerId] = nodes;
    }

    console.log(`[SpatialAudio] Slot ${slotIdx} → ${peerId} at az=${pos.azimuth}°`);
  }, [positions, modelReady, getHRTF, applyPan]);

  // ── Update position live ──────────────────────────────────────
  const updatePosition = useCallback(async (speakerIdx, field, value) => {
    const newPos = { ...positions[speakerIdx], [field]: value };
    setPositions((prev) => prev.map((p, i) => (i === speakerIdx ? newPos : p)));

    const peerId = Object.keys(peerIdxRef.current)
      .find((id) => peerIdxRef.current[id] === speakerIdx);
    if (!peerId) return;

    const nodes = peerNodesRef.current[peerId];
    const ctx   = audioCtxRef.current;
    if (!nodes || !ctx) return;

    if (nodes.type === "pan") {
      // Update panner directly
      nodes.panner.pan.value = Math.max(-1, Math.min(1, newPos.azimuth / 90.0));
    } else if (nodes.type === "hrtf") {
      // Re-fetch HRTF and swap convolver buffers
      const hrtf = await getHRTF(newPos.azimuth, newPos.elevation, newPos.distance);
      if (!hrtf) return;
      const bufL = ctx.createBuffer(1, HRTF_LENGTH, SAMPLE_RATE);
      const bufR = ctx.createBuffer(1, HRTF_LENGTH, SAMPLE_RATE);
      bufL.copyToChannel(new Float32Array(hrtf.left),  0);
      bufR.copyToChannel(new Float32Array(hrtf.right), 0);
      nodes.convL.buffer = bufL;
      nodes.convR.buffer = bufR;
    }
  }, [positions, getHRTF]);

  // ── Remove a peer's audio ─────────────────────────────────────
  const removeRemoteStream = useCallback((peerId) => {
    const nodes = peerNodesRef.current[peerId];
    if (nodes) {
      try {
        nodes.source?.disconnect();
        nodes.convL?.disconnect();
        nodes.convR?.disconnect();
        nodes.merger?.disconnect();
        nodes.splitter?.disconnect();
        nodes.panner?.disconnect();
      } catch {}
      delete peerNodesRef.current[peerId];
      delete peerIdxRef.current[peerId];
    }
  }, []);

  return { positions, modelReady, addRemoteStream, removeRemoteStream, updatePosition };
}
