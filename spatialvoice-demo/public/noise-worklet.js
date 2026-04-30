// public/noise-worklet.js
// Runs in the AudioWorkletGlobalScope — no access to window/document.
// Processes audio in 480-sample (10ms @ 48kHz) frames required by RNNoise.

const FRAME_SIZE = 480;

class NoiseSuppressionProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._wasm         = null;
    this._state        = null;
    this._inputPtr     = 0;
    this._outputPtr    = 0;
    this._initialized  = false;

    // Ring buffers to handle the 128-sample ↔ 480-sample mismatch
    this._inputRing    = new Float32Array(FRAME_SIZE * 2);
    this._outputRing   = new Float32Array(FRAME_SIZE * 4);
    this._inWriteIdx   = 0;
    this._outReadIdx   = 0;
    this._outWriteIdx  = 0;

    this.port.onmessage = async ({ data }) => {
      if (data.type === 'init') {
        await this._initWasm(data.wasmBuffer);
        this.port.postMessage({ type: 'ready' });
      }
      if (data.type === 'bypass') {
        this._bypass = data.value;
      }
    };
  }

  async _initWasm(wasmBuffer) {
    // Instantiate the WASM module directly in the worklet thread
    const { instance } = await WebAssembly.instantiate(wasmBuffer, {
      env: {
        emscripten_notify_memory_growth: () => {},
      }
    });
    const exports = instance.exports;

    // RNNoise C API (compiled to WASM):
    this._wasm    = exports;
    this._state   = exports.rnnoise_create(0); // 0 = built-in model
    this._inputPtr  = exports.malloc(FRAME_SIZE * 4); // Float32 = 4 bytes
    this._outputPtr = exports.malloc(FRAME_SIZE * 4);
    this._initialized = true;
  }

  _processFrame() {
    if (!this._initialized) return;

    // Write one 480-sample frame into WASM heap (expects values scaled to ±32768)
    const heap = new Float32Array(
      this._wasm.memory.buffer,
      this._inputPtr,
      FRAME_SIZE
    );
    for (let i = 0; i < FRAME_SIZE; i++) {
      heap[i] = this._inputRing[i] * 32768.0;
    }

    // RNNoise processes in-place, writes to output pointer
    this._wasm.rnnoise_process_frame(
      this._state,
      this._outputPtr,
      this._inputPtr
    );

    // Read result back and push into output ring
    const outHeap = new Float32Array(
      this._wasm.memory.buffer,
      this._outputPtr,
      FRAME_SIZE
    );
    for (let i = 0; i < FRAME_SIZE; i++) {
      const idx = (this._outWriteIdx + i) % this._outputRing.length;
      this._outputRing[idx] = outHeap[i] / 32768.0;
    }
    this._outWriteIdx = (this._outWriteIdx + FRAME_SIZE) % this._outputRing.length;

    // Slide the input ring (discard consumed frame)
    this._inputRing.copyWithin(0, FRAME_SIZE);
    this._inWriteIdx -= FRAME_SIZE;
  }

  process(inputs, outputs) {
    const inputChannel  = inputs[0]?.[0];
    const outputChannel = outputs[0]?.[0];
    if (!inputChannel || !outputChannel) return true;

    const quantum = inputChannel.length; // always 128

    if (this._bypass || !this._initialized) {
      outputChannel.set(inputChannel);
      return true;
    }

    // Accumulate incoming 128-sample quanta into the 480-sample ring buffer
    for (let i = 0; i < quantum; i++) {
      this._inputRing[this._inWriteIdx++] = inputChannel[i];
      if (this._inWriteIdx >= FRAME_SIZE) {
        this._processFrame(); // fires every ~3.75 quanta (3-4 calls)
      }
    }

    // Drain output ring into the output buffer (introduces ~10ms look-ahead latency)
    const available = (this._outWriteIdx - this._outReadIdx + this._outputRing.length)
      % this._outputRing.length;

    if (available >= quantum) {
      for (let i = 0; i < quantum; i++) {
        outputChannel[i] = this._outputRing[
          (this._outReadIdx + i) % this._outputRing.length
        ];
      }
      this._outReadIdx = (this._outReadIdx + quantum) % this._outputRing.length;
    } else {
      // Buffer underrun — output silence rather than noise
      outputChannel.fill(0);
    }

    return true; // keep processor alive
  }
}

registerProcessor('noise-suppression-processor', NoiseSuppressionProcessor);
