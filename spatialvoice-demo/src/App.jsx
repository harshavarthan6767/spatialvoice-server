import { useState, useRef, useEffect, useCallback } from "react";
import { useWebRTC } from "./hooks/useWebRTC";
import Login from "./components/Login";

// ─── Design tokens ──────────────────────────────────────────────────────────
const T = {
  bg0: "#0d0e10",
  bg1: "#141618",
  bg2: "#1c1e22",
  bg3: "#252830",
  border: "rgba(255,255,255,0.07)",
  borderMid: "rgba(255,255,255,0.13)",
  teal: "#00d4aa",
  tealDim: "rgba(0,212,170,0.15)",
  tealDim2: "rgba(0,212,170,0.08)",
  amber: "#f5a623",
  amberDim: "rgba(245,166,35,0.15)",
  red: "#ff5a5a",
  redDim: "rgba(255,90,90,0.13)",
  textPrimary: "#f0f1f3",
  textSecondary: "#8a8f9a",
  textTertiary: "#55595f",
  fontMono: "'JetBrains Mono', 'Fira Mono', 'Courier New', monospace",
  fontSans: "'DM Sans', system-ui, sans-serif",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;

// ─── SpatialPad ──────────────────────────────────────────────────────────────
function SpatialPad({ position, onChange, active }) {
  const padRef = useRef(null);
  const dragging = useRef(false);

  const posFromEvent = useCallback((e) => {
    const rect = padRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const x = clamp((clientX - rect.left) / rect.width, 0, 1);
    const y = clamp((clientY - rect.top) / rect.height, 0, 1);
    return { x, y };
  }, []);

  const handleDown = useCallback(
    (e) => {
      e.preventDefault();
      dragging.current = true;
      onChange(posFromEvent(e));
    },
    [onChange, posFromEvent]
  );

  useEffect(() => {
    const move = (e) => {
      if (!dragging.current) return;
      e.preventDefault();
      onChange(posFromEvent(e));
    };
    const up = () => (dragging.current = false);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    window.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("touchend", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", up);
    };
  }, [onChange, posFromEvent]);

  const azimuth = Math.round((position.x - 0.5) * 360);
  const elevation = Math.round((0.5 - position.y) * 180);
  const distance = Math.round(
    Math.hypot(position.x - 0.5, position.y - 0.5) * 2 * 100
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* XY pad */}
      <div style={{ position: "relative" }}>
        <div
          ref={padRef}
          onMouseDown={handleDown}
          onTouchStart={handleDown}
          style={{
            position: "relative",
            width: "100%",
            paddingBottom: "100%",
            background: T.bg0,
            borderRadius: 16,
            border: `1px solid ${active ? T.teal + "44" : T.border}`,
            cursor: active ? "crosshair" : "not-allowed",
            overflow: "hidden",
            touchAction: "none",
            transition: "border-color 0.3s",
            opacity: active ? 1 : 0.5,
          }}
        >
          {/* Grid lines */}
          {[0.25, 0.5, 0.75].map((p) => (
            <div key={p}>
              <div
                style={{
                  position: "absolute",
                  left: `${p * 100}%`,
                  top: 0,
                  bottom: 0,
                  width: 1,
                  background:
                    p === 0.5 ? T.borderMid : T.border,
                }}
              />
              <div
                style={{
                  position: "absolute",
                  top: `${p * 100}%`,
                  left: 0,
                  right: 0,
                  height: 1,
                  background:
                    p === 0.5 ? T.borderMid : T.border,
                }}
              />
            </div>
          ))}

          {/* Concentric rings */}
          {[0.25, 0.5, 0.75].map((r) => (
            <div
              key={r}
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                width: `${r * 100}%`,
                paddingBottom: `${r * 100}%`,
                transform: "translate(-50%, -50%)",
                borderRadius: "50%",
                border: `1px solid ${T.border}`,
              }}
            />
          ))}

          {/* Axis labels */}
          <span style={{ position: "absolute", top: 6, left: "50%", transform: "translateX(-50%)", fontSize: 9, fontFamily: T.fontMono, color: T.textTertiary, letterSpacing: "0.1em" }}>FRONT</span>
          <span style={{ position: "absolute", bottom: 6, left: "50%", transform: "translateX(-50%)", fontSize: 9, fontFamily: T.fontMono, color: T.textTertiary, letterSpacing: "0.1em" }}>REAR</span>
          <span style={{ position: "absolute", left: 6, top: "50%", transform: "translateY(-50%)", fontSize: 9, fontFamily: T.fontMono, color: T.textTertiary, letterSpacing: "0.1em" }}>L</span>
          <span style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", fontSize: 9, fontFamily: T.fontMono, color: T.textTertiary, letterSpacing: "0.1em" }}>R</span>

          {/* Actual position dot */}
          <div
            style={{
              position: "absolute",
              left: `${position.x * 100}%`,
              top: `${position.y * 100}%`,
              transform: "translate(-50%, -50%)",
              width: 18,
              height: 18,
              borderRadius: "50%",
              background: active ? T.teal : T.textSecondary,
              boxShadow: active ? `0 0 16px ${T.teal}88` : "none",
              transition: "background 0.3s, box-shadow 0.3s",
              zIndex: 2,
              pointerEvents: "none",
            }}
          />
          {/* Crosshair lines from center to dot */}
          <svg
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              pointerEvents: "none",
            }}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            <line
              x1="50"
              y1="50"
              x2={position.x * 100}
              y2={position.y * 100}
              stroke={active ? T.teal : T.textTertiary}
              strokeWidth="0.6"
              strokeDasharray="3,2"
              opacity={active ? 0.7 : 0.4}
            />
          </svg>
        </div>
      </div>

      {/* Readout row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 8,
        }}
      >
        {[
          { label: "AZ", value: `${azimuth > 0 ? "+" : ""}${azimuth}°` },
          { label: "EL", value: `${elevation > 0 ? "+" : ""}${elevation}°` },
          { label: "DIST", value: `${clamp(distance, 0, 100)}%` },
        ].map(({ label, value }) => (
          <div
            key={label}
            style={{
              background: T.bg0,
              border: `1px solid ${T.border}`,
              borderRadius: 8,
              padding: "6px 10px",
              textAlign: "center",
              opacity: active ? 1 : 0.5,
            }}
          >
            <div
              style={{
                fontSize: 9,
                fontFamily: T.fontMono,
                color: T.textTertiary,
                letterSpacing: "0.12em",
                marginBottom: 2,
              }}
            >
              {label}
            </div>
            <div
              style={{
                fontSize: 13,
                fontFamily: T.fontMono,
                color: active ? T.teal : T.textSecondary,
                fontWeight: 500,
              }}
            >
              {value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Elevation Slider ─────────────────────────────────────────────────────────
function ElevationSlider({ value, onChange, active }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        height: "100%",
        opacity: active ? 1 : 0.5,
      }}
    >
      <div style={{ fontSize: 9, fontFamily: T.fontMono, color: T.textTertiary, letterSpacing: "0.1em" }}>UP</div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(value * 100)}
          onChange={(e) => onChange(parseInt(e.target.value) / 100)}
          disabled={!active}
          style={{
            writingMode: "vertical-lr",
            direction: "rtl",
            appearance: "slider-vertical",
            WebkitAppearance: "slider-vertical",
            width: 28,
            height: "100%",
            cursor: active ? "pointer" : "not-allowed",
            accentColor: active ? T.teal : T.textSecondary,
          }}
        />
      </div>
      <div style={{ fontSize: 9, fontFamily: T.fontMono, color: T.textTertiary, letterSpacing: "0.1em" }}>DN</div>
      <div
        style={{
          fontSize: 11,
          fontFamily: T.fontMono,
          color: active ? T.teal : T.textSecondary,
          background: T.bg0,
          border: `1px solid ${T.border}`,
          borderRadius: 6,
          padding: "3px 6px",
        }}
      >
        {Math.round((value - 0.5) * 180) > 0 ? "+" : ""}
        {Math.round((value - 0.5) * 180)}°
      </div>
    </div>
  );
}

// ─── Audio Meter ──────────────────────────────────────────────────────────────
function AudioMeter({ level, label, color }) {
  const bars = 12;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontSize: 9, fontFamily: T.fontMono, color: T.textTertiary, letterSpacing: "0.1em" }}>{label}</div>
      <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 40 }}>
        {Array.from({ length: bars }).map((_, i) => {
          const threshold = i / bars;
          const lit = level > threshold;
          const isHigh = i > bars * 0.75;
          const isMid = i > bars * 0.55;
          const barColor = isHigh ? T.red : isMid ? T.amber : color;
          return (
            <div
              key={i}
              style={{
                flex: 1,
                height: `${lerp(30, 100, i / bars)}%`,
                borderRadius: 2,
                background: lit ? barColor : T.bg0,
                border: `1px solid ${lit ? barColor + "88" : T.border}`,
                transition: "background 0.05s",
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

// ─── Toggle Card ──────────────────────────────────────────────────────────────
function ToggleCard({ icon, title, subtitle, enabled, onToggle, color }) {
  return (
    <button
      onClick={onToggle}
      style={{
        background: enabled ? (color === "teal" ? T.tealDim2 : T.amberDim) : T.bg2,
        border: `1px solid ${enabled ? (color === "teal" ? T.teal + "44" : T.amber + "44") : T.border}`,
        borderRadius: 12,
        padding: "14px 16px",
        cursor: "pointer",
        textAlign: "left",
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 12,
        transition: "all 0.2s",
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: enabled ? (color === "teal" ? T.tealDim : T.amberDim) : T.bg3,
          border: `1px solid ${enabled ? (color === "teal" ? T.teal + "66" : T.amber + "66") : T.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 16,
          flexShrink: 0,
          transition: "all 0.2s",
        }}
      >
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: T.textPrimary, fontFamily: T.fontSans }}>{title}</div>
        <div style={{ fontSize: 11, color: T.textSecondary, fontFamily: T.fontSans, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{subtitle}</div>
      </div>
      <div
        style={{
          width: 36,
          height: 20,
          borderRadius: 10,
          background: enabled ? (color === "teal" ? T.teal : T.amber) : T.bg3,
          border: `1px solid ${enabled ? "transparent" : T.borderMid}`,
          position: "relative",
          flexShrink: 0,
          transition: "background 0.2s",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 3,
            left: enabled ? 18 : 3,
            width: 14,
            height: 14,
            borderRadius: "50%",
            background: enabled ? T.bg0 : T.textTertiary,
            transition: "left 0.2s, background 0.2s",
          }}
        />
      </div>
    </button>
  );
}

// ─── AEC Status ───────────────────────────────────────────────────────────────
function AECStatus({ stage }) {
  const stages = [
    { key: "tap", label: "Reference tap" },
    { key: "aec", label: "OS AEC + AGC" },
    { key: "rnn", label: "RNNoise" },
    { key: "out", label: "Clean output" },
  ];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
      {stages.map((s, i) => {
        const active = stage >= i;
        return (
          <div key={s.key} style={{ display: "flex", alignItems: "center", flex: 1 }}>
            <div style={{ flex: 1, textAlign: "center" }}>
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: active ? T.teal : T.bg3,
                  border: `1px solid ${active ? T.teal : T.borderMid}`,
                  margin: "0 auto 4px",
                  boxShadow: active ? `0 0 6px ${T.teal}` : "none",
                  transition: "all 0.3s",
                }}
              />
              <div style={{ fontSize: 9, fontFamily: T.fontMono, color: active ? T.teal : T.textTertiary, letterSpacing: "0.05em", transition: "color 0.3s" }}>{s.label}</div>
            </div>
            {i < stages.length - 1 && (
              <div style={{ height: 1, width: 12, background: stage > i ? T.teal : T.border, transition: "background 0.3s", marginBottom: 14, flexShrink: 0 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Peers Row ────────────────────────────────────────────────────────────────
function PeerTile({ id, speaking, muted }) {
  const shortId = id.slice(0, 4).toUpperCase();
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: "50%",
          background: speaking ? T.tealDim : T.bg2,
          border: `2px solid ${speaking ? T.teal : T.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 14,
          fontWeight: 500,
          fontFamily: T.fontSans,
          color: speaking ? T.teal : T.textSecondary,
          transition: "all 0.2s",
          boxShadow: speaking ? `0 0 12px ${T.teal}55` : "none",
        }}
      >
        {shortId.slice(0, 2)}
      </div>
      <div style={{ fontSize: 10, fontFamily: T.fontSans, color: muted ? T.textTertiary : T.textSecondary, textDecoration: muted ? "line-through" : "none" }}>{shortId}</div>
      {muted && (
        <div style={{ fontSize: 9, fontFamily: T.fontMono, color: T.red, background: T.redDim, border: `1px solid ${T.red}44`, borderRadius: 4, padding: "1px 5px" }}>muted</div>
      )}
    </div>
  );
}

// ─── Main Application ─────────────────────────────────────────────────────────
export default function App() {
  const [token, setToken] = useState(localStorage.getItem("sv_token"));
  const [username, setUsername] = useState(null);
  
  const [roomInput, setRoomInput] = useState('');
  const [room, setRoom] = useState('');

  // Audio Processing UI state
  const [spatialPos, setSpatialPos] = useState({ x: 0.5, y: 0.5 });
  const [elevation, setElevation] = useState(0.5);
  const [spatialActive, setSpatialActive] = useState(true);
  const [noiseActive, setNoiseActive] = useState(true); // default to using RNNoise
  const [aecActive, setAecActive] = useState(true);
  
  const [micLevel, setMicLevel] = useState(0);
  const [spkLevel, setSpkLevel] = useState(0);
  const [roomSize, setRoomSize] = useState(0.4);

  const handleLogin = (tok, user) => {
    setToken(tok);
    setUsername(user);
    localStorage.setItem("sv_token", tok);
  };

  const handleLogout = () => {
    localStorage.removeItem("sv_token");
    setToken(null);
  };

  // WebRTC hook
  const {
    peerId, peers, status, micOn, error, usingWasm,
    joinRoom, leaveRoom, updatePan,
  } = useWebRTC({
    token: token,
    onPeerCount: () => {},
  });

  const inCall = status === 'connected';

  // Apply spatial updates when UI sliders change
  useEffect(() => {
    if (!spatialActive || peers.length === 0) return;
    
    // We update all peers for now, since UI mocks one global pad
    // A more advanced UI would let you select a peer to move
    const azimuth = Math.round((spatialPos.x - 0.5) * 360);
    const elev = Math.round((0.5 - spatialPos.y) * 180) + Math.round((elevation - 0.5) * 180);
    const dist = Math.max(0.5, (roomSize * 3)); // Map room size to distance loosely

    peers.forEach((pid, idx) => {
      updatePan(idx, { azimuth, elevation: elev, distance: dist }, peers);
    });
  }, [spatialPos, elevation, roomSize, spatialActive, peers, updatePan]);

  // Simulate live meters
  useEffect(() => {
    let frame;
    let t = 0;
    const tick = () => {
      t += 0.04;
      if (inCall) {
        const base = micOn ? 0.3 : 0;
        const noiseFloor = usingWasm ? 0.05 : 0.15;
        setMicLevel(clamp(base + noiseFloor + Math.sin(t * 3.1) * 0.18 + Math.random() * 0.08, 0, 1));
        setSpkLevel(clamp(0.25 + Math.sin(t * 2.3 + 1) * 0.15 + Math.random() * 0.05, 0, 1));
      } else {
        setMicLevel(0);
        setSpkLevel(0);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [micOn, usingWasm, inCall]);

  const handleJoin = () => {
    const r = roomInput.trim();
    if (!r) return;
    setRoom(r);
    // Request join room, passing our preference for noise reduction
    joinRoom(r, noiseActive);
  };

  const handleLeave = () => {
    leaveRoom();
    setRoom('');
    setRoomInput('');
  };

  // Determine AEC pipeline stage indicator
  let aecStage = -1;
  if (inCall) {
    if (aecActive) {
      if (usingWasm) aecStage = 3;
      else aecStage = 1; // Browser OS AEC only
    } else {
      aecStage = 0;
    }
  }

  if (!token) return <Login onLogin={handleLogin} />;

  return (
    <div
      style={{
        fontFamily: T.fontSans,
        background: T.bg1,
        color: T.textPrimary,
        minHeight: "100vh",
        padding: "env(safe-area-inset-top, 0) env(safe-area-inset-right, 0) env(safe-area-inset-bottom, 0) env(safe-area-inset-left, 0)",
      }}
    >
      {/* Sticky header */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: T.bg1 + "f0",
          backdropFilter: "blur(12px)",
          borderBottom: `1px solid ${T.border}`,
          padding: "12px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <div style={{ fontSize: 16, fontWeight: 500, letterSpacing: "-0.01em" }}>SpatialVoice</div>
          <div style={{ fontSize: 11, color: T.textSecondary, fontFamily: T.fontMono, marginTop: 1 }}>
            {inCall ? `${peers.length + 1} participants · 48 kHz · WebRTC` : `Logged in as ${username}`}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {error && <span style={{ color: T.red, fontSize: 11, marginRight: 8 }}>⚠ {error}</span>}
          
          {!inCall ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <input 
                type="text" 
                placeholder="Room Code" 
                value={roomInput}
                onChange={e => setRoomInput(e.target.value)}
                style={{
                  background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 8,
                  padding: "6px 12px", color: T.textPrimary, width: 100, fontSize: 12
                }}
              />
              <button
                onClick={handleJoin}
                disabled={status === 'connecting'}
                style={{
                  padding: "6px 16px", borderRadius: 8, background: T.tealDim,
                  border: `1px solid ${T.teal}66`, color: T.teal, cursor: "pointer",
                  fontSize: 12, fontWeight: 500, fontFamily: T.fontSans,
                }}
              >
                {status === 'connecting' ? '...' : 'Join'}
              </button>
            </div>
          ) : (
            <>
              {/* Mic toggle */}
              <div
                style={{
                  width: 40, height: 40, borderRadius: 20,
                  background: micOn ? T.tealDim : T.redDim,
                  border: `1px solid ${micOn ? T.teal + "66" : T.red + "66"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 16, transition: "all 0.2s",
                }}
              >
                {micOn ? "🎙" : "🔇"}
              </div>
              {/* End call */}
              <button
                onClick={handleLeave}
                style={{
                  padding: "8px 16px", borderRadius: 20, background: T.redDim,
                  border: `1px solid ${T.red}66`, color: T.red, cursor: "pointer",
                  fontSize: 12, fontWeight: 500, letterSpacing: "0.04em", fontFamily: T.fontSans,
                }}
              >
                Leave
              </button>
            </>
          )}
        </div>
      </div>

      {/* Peers row */}
      {inCall && (
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${T.border}`, overflowX: "auto" }}>
          <div style={{ display: "flex", gap: 20 }}>
            {/* You */}
            <PeerTile key="you" id="YOU" speaking={micLevel > 0.4} muted={!micOn} />
            {/* Remote Peers */}
            {peers.map((pid) => (
              <PeerTile key={pid} id={pid} speaking={spkLevel > 0.4} muted={false} />
            ))}
            {peers.length === 0 && <div style={{ fontSize: 12, color: T.textSecondary, alignSelf: "center", fontStyle: "italic" }}>Waiting for others to join...</div>}
          </div>
        </div>
      )}

      {/* Main content */}
      <div
        style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16,
          padding: 20, maxWidth: 960, margin: "0 auto",
          opacity: inCall ? 1 : 0.5, pointerEvents: inCall ? 'auto' : 'none',
        }}
      >
        {/* Left: Spatial audio */}
        <div style={{ background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 16, padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: T.textPrimary, marginBottom: 2 }}>Spatial Position</div>
              <div style={{ fontSize: 11, color: T.textSecondary, fontFamily: T.fontMono }}>360° · Web Audio API</div>
            </div>
            <button
              onClick={() => setSpatialActive((v) => !v)}
              style={{
                background: spatialActive ? T.tealDim : T.bg3, border: `1px solid ${spatialActive ? T.teal + "55" : T.border}`,
                borderRadius: 8, padding: "4px 12px", cursor: "pointer", fontSize: 11, fontFamily: T.fontMono,
                color: spatialActive ? T.teal : T.textSecondary, letterSpacing: "0.06em", transition: "all 0.2s",
              }}
            >
              {spatialActive ? "ON" : "OFF"}
            </button>
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <SpatialPad position={spatialPos} onChange={setSpatialPos} active={spatialActive && inCall} />
            </div>
            <div style={{ width: 52, minHeight: 200 }}>
              <ElevationSlider value={elevation} onChange={setElevation} active={spatialActive && inCall} />
            </div>
          </div>

          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: T.textSecondary, fontFamily: T.fontMono, letterSpacing: "0.08em" }}>ROOM SIZE</span>
              <span style={{ fontSize: 11, color: spatialActive ? T.teal : T.textSecondary, fontFamily: T.fontMono }}>
                {roomSize < 0.33 ? "Small" : roomSize < 0.66 ? "Medium" : "Large"}
              </span>
            </div>
            <input
              type="range" min={0} max={100} step={1} value={Math.round(roomSize * 100)}
              onChange={(e) => setRoomSize(parseInt(e.target.value) / 100)}
              style={{ width: "100%", accentColor: spatialActive ? T.teal : T.textTertiary }}
              disabled={!spatialActive || !inCall}
            />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
              {["Booth", "Room", "Hall", "Arena"].map((l) => (
                <span key={l} style={{ fontSize: 9, fontFamily: T.fontMono, color: T.textTertiary, letterSpacing: "0.08em" }}>{l}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 16, padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: T.textSecondary, fontFamily: T.fontMono, letterSpacing: "0.08em", marginBottom: 2 }}>AUDIO PROCESSING</div>
            <ToggleCard
              icon="🎙" title="RNNoise suppression" subtitle="WASM · Web Worker pipeline"
              enabled={usingWasm} onToggle={() => {}} color="teal" // Read only state based on actual init
            />
            <ToggleCard
              icon="🔊" title="Echo cancellation" subtitle="OS built-in AEC · AGC"
              enabled={aecActive} onToggle={() => setAecActive((v) => !v)} color="amber"
            />
            <ToggleCard
              icon="🌐" title="360° spatial audio" subtitle="Web Audio PannerNode"
              enabled={spatialActive} onToggle={() => setSpatialActive((v) => !v)} color="teal"
            />
          </div>

          <div style={{ background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 16, padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: T.textSecondary, fontFamily: T.fontMono, letterSpacing: "0.08em" }}>AEC PIPELINE</div>
            <AECStatus stage={aecStage} />
          </div>

          <div style={{ background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 16, padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: T.textSecondary, fontFamily: T.fontMono, letterSpacing: "0.08em", marginBottom: 14 }}>LEVELS</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <AudioMeter level={micLevel} label={`MIC ${micOn ? (usingWasm ? "· suppressed" : "· raw") : "· muted"}`} color={T.teal} />
              <AudioMeter label="SPK · incoming" level={spkLevel} color={T.amber} />
            </div>
          </div>
        </div>
      </div>

      <div style={{ height: "env(safe-area-inset-bottom, 16px)" }} />
    </div>
  );
}
