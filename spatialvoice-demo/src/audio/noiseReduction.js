// src/audio/noiseReduction.js
// Loads the RNNoise WASM binary, registers the AudioWorklet,
// and returns a clean MediaStream ready to feed into RTCPeerConnection.

let _workletLoaded   = false;
let _wasmBuffer      = null; // cache after first fetch

/**
 * Fetches the RNNoise WASM binary once and caches the ArrayBuffer.
 * The buffer is transferred (not copied) to the worklet thread.
 * We keep a re-fetchable copy by slicing before transfer.
 */
async function fetchWasmBuffer() {
  if (_wasmBuffer) return _wasmBuffer.slice(); // return a fresh copy each time
  // Adjust path if you're bundling the wasm differently:
  const response = await fetch('/rnnoise.wasm');
  if (!response.ok) throw new Error(`Failed to fetch rnnoise.wasm: ${response.status}`);
  _wasmBuffer = await response.arrayBuffer();
  return _wasmBuffer.slice();
}

/**
 * Takes a raw microphone MediaStream and returns a new MediaStream
 * whose audio has been processed by the RNNoise WASM model.
 *
 * @param {AudioContext} audioCtx  - Shared AudioContext (pass from useWebRTC)
 * @param {MediaStream}  rawStream - Direct getUserMedia() output
 * @returns {Promise<{cleanStream: MediaStream, workletNode: AudioWorkletNode, cleanup: () => void}>}
 */
export async function createNoiseSuppressedStream(audioCtx, rawStream) {
  // 1. Register the AudioWorklet processor (idempotent after first call)
  if (!_workletLoaded) {
    await audioCtx.audioWorklet.addModule('/noise-worklet.js');
    _workletLoaded = true;
  }

  // 2. Fetch WASM binary
  const wasmBuffer = await fetchWasmBuffer();

  // 3. Create the worklet node
  //    channelCount: 1 — RNNoise is mono (HRTF panning handles stereo perception)
  const workletNode = new AudioWorkletNode(audioCtx, 'noise-suppression-processor', {
    numberOfInputs:  1,
    numberOfOutputs: 1,
    channelCount:    1,
    channelCountMode: 'explicit',
    channelInterpretation: 'speakers',
    processorOptions: {},
  });

  // 4. Wait for WASM to initialise inside the worklet thread
  const wasmReady = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('WASM init timeout')), 5000);
    workletNode.port.onmessage = ({ data }) => {
      if (data.type === 'ready') { clearTimeout(timeout); resolve(); }
    };
  });

  // Transfer the buffer — zero-copy to the worklet thread
  workletNode.port.postMessage({ type: 'init', wasmBuffer }, [wasmBuffer]);
  await wasmReady;

  // 5. Build the graph: MicSource → Worklet → MediaStreamDestination
  const micSource  = audioCtx.createMediaStreamSource(rawStream);
  const destination = audioCtx.createMediaStreamDestination();

  micSource.connect(workletNode);
  workletNode.connect(destination);

  const cleanStream = destination.stream;

  // 6. Cleanup function — call this when the call ends
  const cleanup = () => {
    try {
      micSource.disconnect();
      workletNode.disconnect();
      workletNode.port.postMessage({ type: 'bypass', value: true });
    } catch(e) {}
  };

  return { cleanStream, workletNode, cleanup };
}

/** Toggle noise suppression on/off at runtime (e.g. a UI switch) */
export function setNoiseSuppression(workletNode, enabled) {
  workletNode?.port.postMessage({ type: 'bypass', value: !enabled });
}
