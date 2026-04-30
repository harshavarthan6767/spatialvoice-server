// The capture worklet accumulates browser's 128-sample render quanta
// into 480-sample frames that RNNoise requires.
export const CAPTURE_WORKLET_CODE = /* javascript */ `
const RNNOISE_FRAME_SIZE = 480;

class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._accumulator = new Float32Array(RNNOISE_FRAME_SIZE);
    this._accIndex = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const samples = input[0]; // mono channel

    for (let i = 0; i < samples.length; i++) {
      this._accumulator[this._accIndex++] = samples[i];

      if (this._accIndex === RNNOISE_FRAME_SIZE) {
        // Slice creates a copy; the original buffer will be reused
        this.port.postMessage(
          { type: 'frame', data: this._accumulator.buffer.slice(0) }
        );
        this._accIndex = 0;
      }
    }

    return true; // Keep processor alive
  }
}

registerProcessor('noise-capture-processor', CaptureProcessor);
`;

// The playback worklet maintains a ring buffer.
// The main thread writes processed frames into it via postMessage;
// the audio render thread reads from it on demand.
export const PLAYBACK_WORKLET_CODE = /* javascript */ `
const RING_CAPACITY = 9600; // 200ms at 48kHz — enough headroom for worker round-trip

class PlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._ring = new Float32Array(RING_CAPACITY);
    this._writeHead = 0;
    this._readHead = 0;

    this.port.onmessage = (e) => {
      if (e.data.type !== 'frame') return;
      const frame = new Float32Array(e.data.data);
      for (let i = 0; i < frame.length; i++) {
        this._ring[this._writeHead % RING_CAPACITY] = frame[i];
        this._writeHead++;
      }
    };
  }

  _buffered() {
    return this._writeHead - this._readHead;
  }

  process(_, outputs) {
    const output = outputs[0];
    if (!output || !output[0]) return true;

    const channel = output[0];

    if (this._buffered() >= channel.length) {
      for (let i = 0; i < channel.length; i++) {
        channel[i] = this._ring[this._readHead % RING_CAPACITY];
        this._readHead++;
      }
    }
    // Underrun: output stays zeroed (silence), avoids glitch cascade

    return true;
  }
}

registerProcessor('noise-playback-processor', PlaybackProcessor);
`;
