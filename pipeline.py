"""
pipeline.py — SpatialVoice core processing pipeline
Chains MicroSep → PositionLSTM → SpatialNet → Binaural convolution
"""

import numpy as np
import onnxruntime as ort
from scipy.signal import fftconvolve

SAMPLE_RATE   = 16000
CHUNK_SAMPLES = 4 * SAMPLE_RATE   # 4-second chunks for MicroSep
N_SPEAKERS    = 2                  # match MicroSep training
INPUT_DIM     = N_SPEAKERS * 5    # features per frame
HIDDEN_DIM    = 128
N_LSTM_LAYERS = 2
HRTF_LENGTH   = 128               # SpatialNet filter length


class SpatialVoicePipeline:
    def __init__(self, models_dir='models'):
        providers = ['CPUExecutionProvider']

        # Load all three models
        self.sep_session  = ort.InferenceSession(
            f'{models_dir}/microsep_int8.onnx', providers=providers)
        self.pos_session  = ort.InferenceSession(
            f'{models_dir}/position_lstm_int8.onnx', providers=providers)
        self.hrtf_session = ort.InferenceSession(
            f'{models_dir}/spatialnet.onnx', providers=providers)

        # LSTM state (persists across chunks for continuous streaming)
        self._reset_lstm_state()

        # Current speaker positions (azimuth, elevation, distance)
        # Initialised to well-separated positions
        self.speaker_positions = np.array([
            [-60.0,  10.0, 1.2],
            [ 60.0,  10.0, 1.2],
        ], dtype=np.float32)

        print('[OK] SpatialVoicePipeline loaded all 3 ONNX models')

    def _reset_lstm_state(self):
        """Reset LSTM hidden/cell state (call when a new call starts)."""
        self.h_state = np.zeros((1, N_LSTM_LAYERS, HIDDEN_DIM), dtype=np.float32)
        self.c_state = np.zeros((1, N_LSTM_LAYERS, HIDDEN_DIM), dtype=np.float32)

    # ------------------------------------------------------------------ #
    # Stage 1: Speaker separation
    # ------------------------------------------------------------------ #
    def separate(self, mixture: np.ndarray) -> list:
        """
        mixture : (T,) float32, mono, normalised [-1, 1]
        returns : list of N_SPEAKERS arrays, each (T,) float32
        """
        inp = mixture.reshape(1, 1, -1).astype(np.float32)
        # MicroSep returns a list of N_SPEAKERS tensors: ['source1', 'source2']
        # Each tensor has shape (1, 1, T)
        sources_out = self.sep_session.run(None, {'mixture': inp})
        streams = []
        for i in range(N_SPEAKERS):
            s = sources_out[i][0, 0, :]        # (T,)
            s = s / (np.abs(s).max() + 1e-8)   # normalise
            streams.append(s)
        return streams

    # ------------------------------------------------------------------ #
    # Stage 2: Position update via LSTM
    # ------------------------------------------------------------------ #
    def _extract_features(self, streams: list, noise_level: float) -> np.ndarray:
        """
        Build a single-frame feature vector from the current audio streams.
        Returns: (1, 1, 15) float32 (padded to 3 speakers)
        """
        feats = []
        for stream in streams:
            rms          = float(np.sqrt(np.mean(stream ** 2)))
            is_speaking  = float(rms > 0.02)
            speak_dur    = 0.5 if is_speaking else 0.0
            silence_dur  = 0.0 if is_speaking else 0.5
            feats.extend([is_speaking, speak_dur / 10.0, silence_dur / 10.0,
                          min(rms, 1.0), noise_level])
        
        # Pad to 3 speakers (15 features) if MicroSep only gave 2 streams
        while len(feats) < 15:
            feats.extend([0.0, 0.0, 0.5, 0.0, noise_level])
            
        return np.array(feats, dtype=np.float32).reshape(1, 1, -1)

    def update_positions(self, streams: list, noise_level: float = 0.2) -> np.ndarray:
        """
        Runs one LSTM step to get updated speaker positions.
        Returns: (N_SPEAKERS, 3) array — [azimuth, elevation, distance] per speaker
        """
        features = self._extract_features(streams, noise_level)
        pos_norm, self.h_state, self.c_state = self.pos_session.run(
            None, {'features': features, 'h0': self.h_state, 'c0': self.c_state}
        )
        pos_norm = pos_norm[0, 0, :].reshape(-1, 3)   # (3, 3) normalised

        # Decode normalised → real units
        positions = np.zeros_like(pos_norm)
        for i in range(len(positions)):
            positions[i, 0] = pos_norm[i, 0] * 180.0           # azimuth (degrees)
            positions[i, 1] = pos_norm[i, 1] * 45.0            # elevation (degrees)
            positions[i, 2] = pos_norm[i, 2] * 2.5 + 0.5       # distance (metres)

        self.speaker_positions = positions[:N_SPEAKERS] # Only keep positions for actual streams
        return self.speaker_positions

    # ------------------------------------------------------------------ #
    # Stage 3: HRTF lookup via SpatialNet
    # ------------------------------------------------------------------ #
    def get_hrtf(self, azimuth: float, elevation: float, distance: float):
        """
        Returns (hrtf_left, hrtf_right) each shape (128,) float32.
        """
        pos = np.array([[azimuth, elevation, distance]], dtype=np.float32)
        hrtf_l, hrtf_r = self.hrtf_session.run(None, {'position': pos})
        return hrtf_l[0], hrtf_r[0]

    # ------------------------------------------------------------------ #
    # Stage 4: Binaural convolution
    # ------------------------------------------------------------------ #
    @staticmethod
    def spatialize(stream: np.ndarray, hrtf_l: np.ndarray, hrtf_r: np.ndarray):
        """
        Convolves a mono stream with the binaural HRTF filter pair.
        Returns: (2, T) stereo float32
        """
        left  = fftconvolve(stream, hrtf_l, mode='same').astype(np.float32)
        right = fftconvolve(stream, hrtf_r, mode='same').astype(np.float32)
        return np.stack([left, right], axis=0)   # (2, T)

    # ------------------------------------------------------------------ #
    # Main entry point
    # ------------------------------------------------------------------ #
    def process_chunk(self, mixture: np.ndarray,
                      noise_level: float = 0.2) -> dict:
        """
        Full pipeline: mixture → spatialized stereo + metadata.

        mixture     : (T,) float32, mono PCM at 16 kHz
        noise_level : float in [0, 1], estimated background noise

        Returns dict:
            stereo          : (2, T) float32  — final stereo output
            speaker_streams : list of (T,) arrays — separated streams
            positions       : (N, 3) array — (az, el, dist) per speaker
        """
        # Pad or trim to CHUNK_SAMPLES
        T = len(mixture)
        if T < CHUNK_SAMPLES:
            mixture = np.pad(mixture, (0, CHUNK_SAMPLES - T))
        elif T > CHUNK_SAMPLES:
            mixture = mixture[:CHUNK_SAMPLES]

        # Stage 1: Separation
        streams = self.separate(mixture)

        # Stage 2: Position update
        positions = self.update_positions(streams, noise_level)

        # Stage 3 + 4: HRTF + spatialize each speaker, then sum
        stereo_mix = np.zeros((2, CHUNK_SAMPLES), dtype=np.float32)
        for i, stream in enumerate(streams):
            az, el, dist = positions[i]
            hrtf_l, hrtf_r = self.get_hrtf(az, el, dist)
            spatialized = self.spatialize(stream, hrtf_l, hrtf_r)  # (2, T)
            stereo_mix += spatialized

        # Normalise output
        peak = np.abs(stereo_mix).max()
        if peak > 1e-8:
            stereo_mix /= peak

        # Trim to original length
        stereo_mix = stereo_mix[:, :T]

        return {
            'stereo':          stereo_mix,
            'speaker_streams': streams,
            'positions':       positions,
        }