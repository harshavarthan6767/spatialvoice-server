import { CAPTURE_WORKLET_CODE, PLAYBACK_WORKLET_CODE } from './workletCode.js';

export function tapRemoteAudioAsReference(remoteStream, audioCtx) {
  // Create a silent node — we want the signal data, not audible output
  const remoteSource = audioCtx.createMediaStreamSource(remoteStream);
  const referenceDestination = audioCtx.createMediaStreamDestination();

  // Gain = 0 so it doesn't double-play through speakers
  // We only want the PCM data for the AEC algorithm
  const silentGain = audioCtx.createGain();
  silentGain.gain.value = 0;

  remoteSource.connect(referenceDestination);   // ← reference tap (full level)
  remoteSource.connect(silentGain);             // ← silent path to prevent echo loop

  return referenceDestination.stream;           // Feed this to your AEC worker
}

function createBlobUrl(code) {
  const blob = new Blob([code], { type: 'application/javascript' });
  return URL.createObjectURL(blob);
}

export async function createNoiseSuppressedStream(rawStream) {
  // --- 1. AudioContext at 48kHz (RNNoise's native sample rate) ---
  const audioCtx = new AudioContext({
    sampleRate: 48000,
    latencyHint: 'interactive',
  });

  // --- 2. Load both worklets from Blob URLs ---
  // This is the key fix for Capacitor: no filesystem path involved at all.
  const captureUrl = createBlobUrl(CAPTURE_WORKLET_CODE);
  const playbackUrl = createBlobUrl(PLAYBACK_WORKLET_CODE);

  await audioCtx.audioWorklet.addModule(captureUrl);
  await audioCtx.audioWorklet.addModule(playbackUrl);

  URL.revokeObjectURL(captureUrl);
  URL.revokeObjectURL(playbackUrl);

  // --- 3. Create and initialize the RNNoise Web Worker ---
  const worker = new Worker(
    new URL('../workers/audio-worker.js', import.meta.url),
    { type: 'module' } // Vite bundles this correctly
  );

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('RNNoise worker init timed out after 10s')),
      10000
    );

    worker.onmessage = (e) => {
      clearTimeout(timeout);
      if (e.data.type === 'ready') resolve();
      else reject(new Error(`Worker init failed: ${e.data.message}`));
    };

    worker.onerror = (err) => {
      clearTimeout(timeout);
      reject(new Error(`Worker script error: ${err.message}`));
    };

    worker.postMessage({ type: 'init' });
  });

  // --- 4. Build the audio graph ---
  const monoConstraints = {
    channelCount: 1,
    channelCountMode: 'explicit',
    channelInterpretation: 'discrete',
  };

  const source = audioCtx.createMediaStreamSource(rawStream);
  const captureNode = new AudioWorkletNode(audioCtx, 'noise-capture-processor', monoConstraints);
  const playbackNode = new AudioWorkletNode(audioCtx, 'noise-playback-processor', monoConstraints);
  const destination = audioCtx.createMediaStreamDestination();

  // capture → [not connected to speakers, just used for port messages]
  source.connect(captureNode);
  // playback → destination (this produces the cleaned MediaStream)
  playbackNode.connect(destination);

  // --- 5. Wire the message pipeline ---
  captureNode.port.onmessage = (e) => {
    if (e.data.type !== 'frame') return;
    // Transfer buffer ownership to worker (zero-copy)
    worker.postMessage({ type: 'process', data: e.data.data }, [e.data.data]);
  };

  worker.onmessage = (e) => {
    if (e.data.type !== 'processed') return;
    // Transfer buffer ownership to playback worklet (zero-copy)
    playbackNode.port.postMessage({ type: 'frame', data: e.data.data }, [e.data.data]);
  };

  // --- 6. Return stream + deterministic cleanup ---
  const cleanup = () => {
    worker.postMessage({ type: 'destroy' });
    source.disconnect();
    captureNode.disconnect();
    playbackNode.disconnect();
    audioCtx.close();
  };

  return { stream: destination.stream, cleanup };
}
