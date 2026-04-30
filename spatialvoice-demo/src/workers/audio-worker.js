import { createRNNWasmModule } from '@jitsi/rnnoise-wasm';

// RNNoise always operates on 480-sample frames at 48kHz (10ms)
const FRAME_SIZE = 480;

let rnnoiseModule = null;
let state = null;
let inPtr = null;
let outPtr = null;
let isReady = false;

async function initRNNoise() {
  rnnoiseModule = await createRNNWasmModule();
  state = rnnoiseModule._rnnoise_create(0);

  // Pre-allocate WASM heap buffers once; reuse per frame
  inPtr = rnnoiseModule._malloc(FRAME_SIZE * Float32Array.BYTES_PER_ELEMENT);
  outPtr = rnnoiseModule._malloc(FRAME_SIZE * Float32Array.BYTES_PER_ELEMENT);

  isReady = true;
}

function processFrame(normalizedInput) {
  // RNNoise expects PCM in the range [-32768, 32767], not [-1.0, 1.0]
  const scaledInput = new Float32Array(FRAME_SIZE);
  for (let i = 0; i < FRAME_SIZE; i++) {
    scaledInput[i] = normalizedInput[i] * 32768;
  }

  // Write input into WASM heap
  rnnoiseModule.HEAPF32.set(scaledInput, inPtr / Float32Array.BYTES_PER_ELEMENT);

  // Process in-place inside WASM
  rnnoiseModule._rnnoise_process_frame(state, outPtr, inPtr);

  // Read output from WASM heap and renormalize to [-1.0, 1.0]
  const heapOffset = outPtr / Float32Array.BYTES_PER_ELEMENT;
  const rawOutput = rnnoiseModule.HEAPF32.subarray(heapOffset, heapOffset + FRAME_SIZE);
  const normalized = new Float32Array(FRAME_SIZE);
  for (let i = 0; i < FRAME_SIZE; i++) {
    normalized[i] = rawOutput[i] / 32768;
  }

  return normalized;
}

self.addEventListener('message', async (event) => {
  const { type, data } = event.data;

  if (type === 'init') {
    try {
      await initRNNoise();
      self.postMessage({ type: 'ready' });
    } catch (err) {
      self.postMessage({ type: 'error', message: String(err) });
    }
    return;
  }

  if (type === 'process') {
    if (!isReady) return; // Drop frames during init; brief latency is acceptable

    const inputFrame = new Float32Array(data);
    const outputFrame = processFrame(inputFrame);

    // Transfer the buffer (zero-copy) back to main thread
    self.postMessage({ type: 'processed', data: outputFrame.buffer }, [outputFrame.buffer]);
  }

  if (type === 'destroy') {
    if (isReady && rnnoiseModule) {
      rnnoiseModule._rnnoise_destroy(state);
      rnnoiseModule._free(inPtr);
      rnnoiseModule._free(outPtr);
    }
    self.close();
  }
});
