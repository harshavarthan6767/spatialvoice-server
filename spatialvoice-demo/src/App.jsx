import { useState, useEffect } from 'react';
import { useWebRTC }  from './hooks/useWebRTC';
import Login from './components/Login';
import './App.css';

// ── Constants ────────────────────────────────────────────────────
const COLORS  = ['#4B62D8', '#00C6FF', '#9B59D0'];
const NAMES   = ['Caller 1', 'Caller 2', 'Caller 3'];
const DEFAULT = [
  { azimuth: -60, elevation: 5, distance: 1.2 },
  { azimuth:   0, elevation: 5, distance: 1.5 },
  { azimuth:  60, elevation: 5, distance: 1.2 },
];

// ── Sphere ───────────────────────────────────────────────────────
function Sphere({ positions, active }) {
  const cx = 140, cy = 140, R = 105;

  return (
    <svg width="280" height="280" viewBox="0 0 280 280">
      {/* Pulse ring when in call */}
      {active && (
        <circle cx={cx} cy={cy} r={R + 22}
          fill="none" stroke="rgba(20,40,160,0.25)" strokeWidth="18"
          className="pulse" />
      )}

      {/* Rings */}
      {[1, 0.65, 0.32].map((s, i) => (
        <circle key={i} cx={cx} cy={cy} r={R * s}
          fill="none"
          stroke={i === 0 ? 'rgba(20,40,160,0.5)' : 'rgba(255,255,255,0.05)'}
          strokeWidth={i === 0 ? 1.5 : 1}
          strokeDasharray={i === 0 ? undefined : '3 7'} />
      ))}

      {/* Axes */}
      <line x1={cx} y1={cy-R-14} x2={cx} y2={cy+R+14} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
      <line x1={cx-R-14} y1={cy} x2={cx+R+14} y2={cy} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />

      {/* Labels */}
      {[['F',cx,cy-R-20],['B',cx,cy+R+28],['L',cx-R-20,cy+4],['R',cx+R+20,cy+4]].map(([l,x,y])=>(
        <text key={l} x={x} y={y} textAnchor="middle" fontSize="9"
          fill="rgba(255,255,255,0.2)" fontWeight="600" letterSpacing="0.5">{l}</text>
      ))}

      {/* Connector lines */}
      {positions.map((p, i) => {
        const rad = (p.azimuth * Math.PI) / 180;
        const df  = Math.min((p.distance ?? 1.2) / 3, 1) * 0.9;
        const x   = cx + R * df * Math.sin(rad);
        const y   = cy - R * df * Math.cos(rad);
        return (
          <line key={i} x1={cx} y1={cy} x2={x} y2={y}
            stroke={COLORS[i]} strokeWidth="0.8" strokeDasharray="3 5" opacity="0.35" />
        );
      })}

      {/* YOU */}
      <circle cx={cx} cy={cy} r={20} fill="rgba(20,40,160,0.25)" stroke="rgba(20,40,160,0.7)" strokeWidth="1.5"/>
      <circle cx={cx} cy={cy} r={12} fill="rgba(20,40,160,0.45)" stroke="rgba(75,98,216,0.5)" strokeWidth="1"/>
      <circle cx={cx-20} cy={cy} r={3.5} fill="rgba(20,40,160,0.6)" />
      <circle cx={cx+20} cy={cy} r={3.5} fill="rgba(20,40,160,0.6)" />
      <text x={cx} y={cy+4} textAnchor="middle" fontSize="7" fill="rgba(255,255,255,0.7)" fontWeight="800" letterSpacing="0.5">YOU</text>

      {/* Speaker dots */}
      {positions.map((p, i) => {
        const rad  = (p.azimuth * Math.PI) / 180;
        const df   = Math.min((p.distance ?? 1.2) / 3, 1) * 0.9;
        const x    = cx + R * df * Math.sin(rad);
        const y    = cy - R * df * Math.cos(rad);
        const sz   = 11;
        const c    = COLORS[i];
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={sz+7} fill={c} opacity="0.1" />
            <circle cx={x} cy={y} r={sz} fill={c} opacity="0.88" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
            <circle cx={x-sz*0.28} cy={y-sz*0.28} r={sz*0.32} fill="rgba(255,255,255,0.28)" />
            <text x={x} y={y-sz-8} textAnchor="middle" fontSize="8" fill={c} fontWeight="800">
              C{i+1}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── SpeakerCard ──────────────────────────────────────────────────
function SpeakerCard({ idx, pos, onChange, active }) {
  const c = COLORS[idx];
  const slider = (label, field, min, max, unit) => {
    const val = pos[field] ?? 0;
    const pct = ((val - min) / (max - min)) * 100;
    return (
      <div className="slider-row">
        <div className="slider-top">
          <span className="slider-lbl">{label}</span>
          <span className="slider-val">{Math.round(val)}{unit}</span>
        </div>
        <input type="range" min={min} max={max} step="1"
          value={Math.round(val)}
          style={{
            background: `linear-gradient(to right, ${c} ${pct}%, #1C1C1C ${pct}%)`,
            '--thumb-c': c,
          }}
          onChange={e => onChange(idx, field, parseFloat(e.target.value))}
        />
      </div>
    );
  };

  return (
    <div className={`s-card ${active ? 'active' : ''}`} style={{ '--sc': c }}>
      <div className="s-head">
        <div className="s-ident">
          <div className="s-avatar" style={{ background:`${c}22`, borderColor:`${c}55`, color:c }}>
            C{idx+1}
          </div>
          <div>
            <div className="s-name">{NAMES[idx]}</div>
            <div className="s-pos">Az {Math.round(pos.azimuth)}° · El {Math.round(pos.elevation)}° · {pos.distance?.toFixed(1)}m</div>
          </div>
        </div>
        <div className={`s-live-dot ${active ? 'live' : ''}`} />
      </div>
      {slider('Azimuth',   'azimuth',   -180, 180, '°')}
      {slider('Elevation', 'elevation',  -45,  45, '°')}
      {slider('Distance',  'distance',    0.5, 3.0, 'm')}
    </div>
  );
}

// ── KPI Strip ────────────────────────────────────────────────────
function KPIs({ inCall, peerCount, micOn }) {
  const tiles = [
    { l:'Server',  v: inCall ? 'Live'   : 'Off',  cls: inCall ? 'good' : 'muted' },
    { l:'Callers', v:`${peerCount}/3`,             cls: peerCount > 0 ? 'good' : 'muted' },
    { l:'Mic',     v: micOn  ? 'Active' : 'Muted', cls: micOn ? 'good' : 'warn' },
    { l:'Audio',   v:'Stereo 3D',                  cls:'blue' },
    { l:'WebRTC',  v:'P2P',                        cls:'blue' },
    { l:'Latency', v:'<50ms',                      cls:'good' },
  ];
  return (
    <div className="kpi-strip">
      {tiles.map(({l,v,cls}) => (
        <div key={l} className="kpi">
          <span className="kpi-lbl">{l}</span>
          <span className={`kpi-val ${cls}`}>{v}</span>
        </div>
      ))}
    </div>
  );
}

// ── App ──────────────────────────────────────────────────────────
export default function App() {
  const [token,    setToken]    = useState(localStorage.getItem("sv_token"));
  const [username, setUsername] = useState(null);

  const [roomInput, setRoomInput] = useState('');
  const [room,      setRoom]      = useState('');
  const [positions, setPositions] = useState(DEFAULT);

  const handleLogin = (tok, user) => {
    setToken(tok);
    setUsername(user);
  };

  const handleLogout = () => {
    localStorage.removeItem("sv_token");
    setToken(null);
  };

  const updatePos = (idx, field, val) => {
    setPositions(prev => prev.map((p, i) => i === idx ? { ...p, [field]: val } : p));
  };

  const { peerId, peers, status, micOn, error, joinRoom, leaveRoom, updatePan } = useWebRTC({
    token: token,
    onPeerCount: () => {},
  });

  const inCall = status === 'connected';

  if (!token) return <Login onLogin={handleLogin} />;

  const handleJoin = () => {
    const r = roomInput.trim();
    if (!r) return;
    setRoom(r);
    joinRoom(r);
  };

  const handleLeave = () => {
    leaveRoom();
    setRoom('');
    setRoomInput('');
  };

  const handlePosChange = (idx, field, val) => {
    updatePos(idx, field, val);
    if (field === 'azimuth') updatePan(idx, val);
  };

  const statusStyle = {
    idle:       { color:'var(--text-3)',    bg:'rgba(255,255,255,.05)', border:'rgba(255,255,255,.08)' },
    connecting: { color:'var(--orange)',    bg:'rgba(255,153,0,.1)',    border:'rgba(255,153,0,.3)' },
    connected:  { color:'var(--green)',     bg:'rgba(29,185,84,.1)',    border:'rgba(29,185,84,.3)' },
    error:      { color:'var(--red)',       bg:'rgba(231,76,60,.1)',    border:'rgba(231,76,60,.3)' },
  }[status] || {};

  const statusLabel = {
    idle:       'Offline',
    connecting: 'Connecting…',
    connected:  `${peers.length + 1} in call`,
    error:      'Error',
  }[status] ?? 'Offline';

  return (
    <div className="app">
      <div className="safe-top" />

      {/* Header */}
      <header className="header">
        <div className="brand">
          <div className="brand-icon-wrap">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="#4B62D8" strokeWidth="1.5"/>
              <circle cx="12" cy="12" r="3" fill="#1428A0"/>
              <path d="M12 5v3M12 16v3M5 12h3M16 12h3" stroke="#4B62D8" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
          </div>
          <span className="brand-name">SpatialVoice</span>
          <span className="brand-sub">AI 3D</span>
        </div>
        <div className="status-pill" style={{ color:statusStyle.color, background:statusStyle.bg, border:`1px solid ${statusStyle.border}` }}>
          <span className="status-dot" />
          {statusLabel}
        </div>
      </header>

      {/* Error */}
      {error && <div className="error-bar">⚠ {error}</div>}

      {/* Main Content Grid */}
      <div className="main-content">
        <div className="left-panel">
          {/* Sphere */}
          <div className="sphere-wrap">
            <Sphere positions={positions} active={inCall} />
            <p className="sphere-caption">
              {inCall ? 'Use headphones for full 3D effect' : 'Join a room to start the call'}
            </p>
          </div>
          {/* KPIs */}
          <KPIs inCall={inCall} peerCount={peers.length} micOn={micOn} />
        </div>

        <div className="right-panel">
          {/* Join / In-call */}
      {!inCall ? (
        <div className="join-box">
          <p className="join-label">Enter a room code — everyone with the same code joins the same 3D call</p>
          <div className="join-row">
            <input
              className="room-input"
              value={roomInput}
              onChange={e => setRoomInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleJoin()}
              placeholder="Room code (e.g. demo123)"
              autoComplete="off"
              spellCheck={false}
            />
            <button className="btn-join" onClick={handleJoin} disabled={status === 'connecting'}>
              {status === 'connecting' ? '…' : 'Join'}
            </button>
          </div>
          <p className="join-hint">Works on any network · up to 3 callers</p>
        </div>
      ) : (
        <div className="incall-bar">
          <div className="incall-meta">
            <div className="incall-room">Room: <span>{room}</span></div>
            <div className="incall-sub">ID: {peerId} · {peers.length} peer{peers.length !== 1 ? 's' : ''}</div>
          </div>
          <div className="incall-actions">
            <button className={micOn ? 'btn-mic-on' : 'btn-mic-off'}>
              {micOn ? '🎤 On' : '🔇 Off'}
            </button>
            <button className="btn-leave" onClick={handleLeave}>✕ Leave Room</button>
            <button className="btn-leave" onClick={handleLogout} style={{marginLeft: "8px"}}>Sign Out</button>
          </div>
        </div>
      )}

          {/* Speaker cards */}
          <div className="speakers">
        <div className="sec-head">
          <span className="sec-title">3D Positions</span>
          <span className="sec-badge">{peers.length} / 3 callers</span>
        </div>

        {inCall && peers.length === 0 && (
          <div className="empty">
            <div className="empty-icon">📡</div>
            <p className="empty-text">
              {'Waiting for others to join…\n\nShare room code: '}
              <span className="empty-code">{room}</span>
            </p>
          </div>
        )}

        {!inCall && (
          <div className="empty">
            <div className="empty-icon">🎧</div>
            <p className="empty-text">Join a room above to start a 3D spatial audio conference</p>
          </div>
        )}

        <div className="speaker-cards">
          {positions.map((pos, i) => (
            <SpeakerCard key={i} idx={i} pos={pos} onChange={handlePosChange}
              active={inCall && i < peers.length} />
          ))}
        </div>
        </div>
          </div>
        </div>

      <div className="safe-bottom" />
    </div>
  );
}
