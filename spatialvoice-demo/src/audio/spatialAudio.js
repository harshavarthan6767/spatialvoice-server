// src/audio/spatialAudio.js
// HRTF-based 3D spatial audio for remote WebRTC peers.
// Replaces StereoPannerNode with a full PannerNode + AudioListener setup.

/**
 * Initialises the AudioListener on the shared context.
 * Call ONCE when the AudioContext is created.
 * The listener represents the local user, always at the origin, facing forward.
 *
 * @param {AudioContext} audioCtx
 */
export function initAudioListener(audioCtx) {
  const listener = audioCtx.listener;

  // Position: origin
  if (listener.positionX) {
    listener.positionX.setValueAtTime(0, audioCtx.currentTime);
    listener.positionY.setValueAtTime(0, audioCtx.currentTime);
    listener.positionZ.setValueAtTime(0, audioCtx.currentTime);
  } else {
    // Legacy API fallback (Safari < 14)
    listener.setPosition(0, 0, 0);
  }

  // Orientation: looking forward (−Z), up vector = +Y
  // Web Audio forward vector: (0, 0, -1) = "into the screen" / in front of user
  if (listener.forwardX) {
    listener.forwardX.setValueAtTime(0,  audioCtx.currentTime);
    listener.forwardY.setValueAtTime(0,  audioCtx.currentTime);
    listener.forwardZ.setValueAtTime(-1, audioCtx.currentTime);
    listener.upX.setValueAtTime(0, audioCtx.currentTime);
    listener.upY.setValueAtTime(1, audioCtx.currentTime);
    listener.upZ.setValueAtTime(0, audioCtx.currentTime);
  } else {
    listener.setOrientation(0, 0, -1, 0, 1, 0);
  }
}

/**
 * Converts spherical coordinates (azimuth, elevation, distance)
 * into the Cartesian (x, y, z) system used by the Web Audio API.
 *
 * Convention (matches the diagram):
 *   azimuth  0°  → directly in front     (positive Z listener-forward → −Z in WebAudio)
 *   azimuth  90° → to the right          (+X)
 *   azimuth 180° → directly behind       (+Z)
 *   azimuth 270° → to the left           (−X)
 *   elevation +90° → directly above      (+Y)
 *   elevation −90° → directly below      (−Y)
 *
 * @param {number} azimuthDeg  - Horizontal angle, 0–360°
 * @param {number} elevationDeg - Vertical angle, −90 to +90°
 * @param {number} distance     - Metres (use 1–20 for a conference room feel)
 * @returns {{ x: number, y: number, z: number }}
 */
export function sphericalToCartesian(azimuthDeg, elevationDeg, distance) {
  const az = (azimuthDeg  * Math.PI) / 180;
  const el = (elevationDeg * Math.PI) / 180;

  return {
    x:  distance * Math.sin(az) * Math.cos(el),
    y:  distance * Math.sin(el),
    z: -distance * Math.cos(az) * Math.cos(el), // negative = forward in WebAudio
  };
}

/**
 * Creates and connects an HRTF PannerNode for a single remote peer's stream.
 * Returns a controller object with methods to update the spatial position
 * and a cleanup function.
 *
 * @param {AudioContext} audioCtx
 * @param {MediaStream}  remoteStream - The track received via RTCPeerConnection
 * @param {{ azimuth: number, elevation: number, distance: number }} initialPosition
 * @returns {{ updatePosition, setVolume, cleanup }}
 */
export function createSpatialPeer(audioCtx, remoteStream, initialPosition = {
  azimuth: 0, elevation: 0, distance: 3,
}) {
  // --- Source ---
  const source = audioCtx.createMediaStreamSource(remoteStream);

  // --- HRTF PannerNode ---
  const panner = audioCtx.createPanner();
  panner.panningModel    = 'HRTF';         // The key upgrade from StereoPannerNode
  panner.distanceModel   = 'inverse';       // Natural volume rolloff with distance
  panner.refDistance     = 1;              // Full volume at 1 metre
  panner.maxDistance     = 20;             // Beyond here, volume stays at minimum
  panner.rolloffFactor   = 1.2;            // Slightly aggressive rolloff
  panner.coneInnerAngle  = 360;            // Omnidirectional source (voice = no cone)
  panner.coneOuterAngle  = 0;
  panner.coneOuterGain   = 0;

  // --- Dynamics Compressor (prevents clipping when multiple peers are active) ---
  const compressor = audioCtx.createDynamicsCompressor();
  compressor.threshold.setValueAtTime(-24, audioCtx.currentTime);
  compressor.knee.setValueAtTime(30, audioCtx.currentTime);
  compressor.ratio.setValueAtTime(12, audioCtx.currentTime);
  compressor.attack.setValueAtTime(0.003, audioCtx.currentTime);
  compressor.release.setValueAtTime(0.25, audioCtx.currentTime);

  // --- Per-peer gain (for individual volume control) ---
  const gainNode = audioCtx.createGain();
  gainNode.gain.setValueAtTime(1.0, audioCtx.currentTime);

  // --- Connect the graph ---
  source.connect(panner);
  panner.connect(compressor);
  compressor.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  // --- Set initial position ---
  _applyPosition(panner, audioCtx, initialPosition);

  /**
   * Call this whenever a peer moves in your 3D space.
   * Uses AudioParam.linearRampToValueAtTime for smooth interpolation
   * (avoids zipper noise on rapid position changes).
   *
   * @param {{ azimuth, elevation, distance }} position
   * @param {number} rampMs - Interpolation time in milliseconds (default 50ms)
   */
  function updatePosition({ azimuth, elevation, distance }, rampMs = 50) {
    _applyPosition(panner, audioCtx, { azimuth, elevation, distance }, rampMs);
  }

  /** @param {number} volume - 0.0 to 1.0 */
  function setVolume(volume) {
    gainNode.gain.linearRampToValueAtTime(
      Math.max(0, Math.min(1, volume)),
      audioCtx.currentTime + 0.02
    );
  }

  function cleanup() {
    try {
      source.disconnect();
      panner.disconnect();
      compressor.disconnect();
      gainNode.disconnect();
    } catch (_) { /* already disconnected */ }
  }

  return { updatePosition, setVolume, cleanup };
}

// --- Internal helper ---
function _applyPosition(panner, ctx, { azimuth, elevation, distance }, rampMs = 0) {
  const { x, y, z } = sphericalToCartesian(azimuth, elevation, distance);
  const t = ctx.currentTime + (rampMs / 1000);

  if (panner.positionX) {
    // Modern API — uses AudioParam scheduling (smooth, no clicks)
    panner.positionX.linearRampToValueAtTime(x, t);
    panner.positionY.linearRampToValueAtTime(y, t);
    panner.positionZ.linearRampToValueAtTime(z, t);
  } else {
    // Legacy Safari fallback
    panner.setPosition(x, y, z);
  }
}
