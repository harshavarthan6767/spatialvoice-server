/**
 * useAudioPipeline.js
 * Connects to the Part 4 FastAPI WebSocket server.
 * Sends mic audio chunks, receives stereo spatial audio + position metadata.
 * Routes audio to WebAudio for playback.
 */

import { useState, useRef, useCallback, useEffect } from 'react';

const SERVER_WS  = 'ws://172.16.209.199:8001/ws/audio';
const SAMPLE_RATE = 16000;
const CHUNK_SECS  = 4;
const CHUNK_SAMPLES = SAMPLE_RATE * CHUNK_SECS;

export function useAudioPipeline() {
  const [isConnected,  setIsConnected]  = useState(false);
  const [isStreaming,  setIsStreaming]  = useState(false);
  const [positions,    setPositions]    = useState([
    { speaker: 0, azimuth: -60, elevation: 5,  distance: 1.2 },  // Caller 1 — Left
    { speaker: 1, azimuth:   0, elevation: 5,  distance: 1.5 },  // Caller 2 — Front
    { speaker: 2, azimuth:  60, elevation: 5,  distance: 1.2 },  // Caller 3 — Right
  ]);
  const [latency,      setLatency]      = useState(null);
  const [error,        setError]        = useState(null);

  const wsRef          = useRef(null);
  const audioCtxRef    = useRef(null);
  const mediaStreamRef = useRef(null);
  const processorRef   = useRef(null);
  const bufferRef      = useRef([]);

  // Connect to the FastAPI WebSocket
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(SERVER_WS);
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      setIsConnected(true);
      setError(null);
      console.log('WebSocket connected');
    };

    ws.onclose = () => {
      setIsConnected(false);
      setIsStreaming(false);
      console.log('WebSocket disconnected');
    };

    ws.onerror = () => {
      setError('Cannot connect to server. Make sure Part 4 server is running on port 8000.');
    };

    ws.onmessage = (event) => {
      const data = new DataView(event.data);
      // Parse: [4 bytes JSON length][JSON bytes][stereo float32 PCM]
      const jsonLen   = data.getUint32(0, false);   // big-endian
      const jsonBytes = new Uint8Array(event.data, 4, jsonLen);
      const meta      = JSON.parse(new TextDecoder().decode(jsonBytes));

      // Update UI state
      if (meta.positions) setPositions(meta.positions);
      if (meta.latency_ms) setLatency(meta.latency_ms);

      // Play stereo output through WebAudio
      const pcmOffset = 4 + jsonLen;
      const pcmBytes  = new Float32Array(event.data, pcmOffset);
      playPCM(pcmBytes, CHUNK_SAMPLES);
    };

    wsRef.current = ws;
  }, []);

  // Play interleaved stereo float32 through WebAudio
  const playPCM = useCallback((interleavedF32, nFrames) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    const buf = ctx.createBuffer(2, nFrames, SAMPLE_RATE);
    const left  = buf.getChannelData(0);
    const right = buf.getChannelData(1);
    for (let i = 0; i < nFrames; i++) {
      left[i]  = interleavedF32[i * 2]     ?? 0;
      right[i] = interleavedF32[i * 2 + 1] ?? 0;
    }

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start();
  }, []);

  // Start mic capture + streaming
  const startStreaming = useCallback(async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setError('Not connected. Click Connect first.');
      return;
    }

    try {
      audioCtxRef.current = new AudioContext({ sampleRate: SAMPLE_RATE });
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: SAMPLE_RATE, channelCount: 1, echoCancellation: true }
      });
      mediaStreamRef.current = stream;

      const source    = audioCtxRef.current.createMediaStreamSource(stream);
      const processor = audioCtxRef.current.createScriptProcessor(4096, 1, 1);
      bufferRef.current = [];

      processor.onaudioprocess = (e) => {
        const chunk = e.inputBuffer.getChannelData(0);
        bufferRef.current.push(...chunk);

        if (bufferRef.current.length >= CHUNK_SAMPLES) {
          const toSend = new Float32Array(bufferRef.current.splice(0, CHUNK_SAMPLES));
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(toSend.buffer);
          }
        }
      };

      source.connect(processor);
      processor.connect(audioCtxRef.current.destination);
      processorRef.current = processor;

      setIsStreaming(true);
    } catch (err) {
      setError(`Mic access failed: ${err.message}`);
    }
  }, []);

  // Stop streaming
  const stopStreaming = useCallback(() => {
    processorRef.current?.disconnect();
    mediaStreamRef.current?.getTracks().forEach(t => t.stop());
    audioCtxRef.current?.close();
    setIsStreaming(false);
  }, []);

  // Override positions manually (for demo sliders)
  const setPositionManual = useCallback((speakerIdx, field, value) => {
    setPositions(prev => prev.map((p, i) =>
      i === speakerIdx ? { ...p, [field]: value } : p
    ));
    // Send override to server (best-effort)
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'set_position', speaker: speakerIdx, [field]: value }));
    }
  }, []);

  useEffect(() => () => stopStreaming(), [stopStreaming]);

  return {
    isConnected, isStreaming, positions, latency, error,
    connect, startStreaming, stopStreaming, setPositionManual
  };
}
