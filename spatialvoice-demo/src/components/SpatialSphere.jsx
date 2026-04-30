const SPEAKER_COLORS = ['#4B62D8', '#00C6FF', '#7B5EA7'];
const SPEAKER_NAMES  = ['Caller 1', 'Caller 2', 'Caller 3'];

export default function SpatialSphere({ positions, isStreaming }) {
  const cx = 150, cy = 150, r = 108;

  return (
    <svg
      className="sphere-svg"
      width="300"
      height="300"
      viewBox="0 0 300 300"
    >
      {/* Outer glow ring when streaming */}
      {isStreaming && (
        <circle cx={cx} cy={cy} r={r + 18} fill="none"
          stroke="rgba(20,40,160,0.2)" strokeWidth="20"
          className="sphere-ring" />
      )}

      {/* Background rings */}
      {[1, 0.67, 0.33].map((scale, i) => (
        <circle key={i} cx={cx} cy={cy} r={r * scale}
          fill="none"
          stroke={i === 0 ? 'rgba(20,40,160,0.4)' : 'rgba(255,255,255,0.06)'}
          strokeWidth={i === 0 ? 1.5 : 1}
          strokeDasharray={i === 0 ? 'none' : '4 6'}
        />
      ))}

      {/* Cross lines */}
      <line x1={cx} y1={cy - r - 12} x2={cx} y2={cy + r + 12}
        stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
      <line x1={cx - r - 12} y1={cy} x2={cx + r + 12} y2={cy}
        stroke="rgba(255,255,255,0.06)" strokeWidth="1" />

      {/* Direction labels */}
      <text x={cx} y={cy - r - 18} textAnchor="middle" fontSize="9"
        fill="rgba(255,255,255,0.35)" fontWeight="600" letterSpacing="1">FRONT</text>
      <text x={cx} y={cy + r + 26} textAnchor="middle" fontSize="9"
        fill="rgba(255,255,255,0.2)" fontWeight="500">BACK</text>
      <text x={cx - r - 16} y={cy + 4} textAnchor="middle" fontSize="9"
        fill="rgba(255,255,255,0.2)" fontWeight="500">L</text>
      <text x={cx + r + 16} y={cy + 4} textAnchor="middle" fontSize="9"
        fill="rgba(255,255,255,0.2)" fontWeight="500">R</text>

      {/* Speaker connector lines */}
      {positions.map((p, i) => {
        const azRad   = (p.azimuth * Math.PI) / 180;
        const distFrac = Math.min((p.distance ?? 1.2) / 3.0, 1.0);
        const dotR    = r * distFrac * 0.92;
        const x = cx + dotR * Math.sin(azRad);
        const y = cy - dotR * Math.cos(azRad);
        return (
          <line key={`line-${i}`} x1={cx} y1={cy} x2={x} y2={y}
            stroke={SPEAKER_COLORS[i]} strokeWidth="0.75"
            strokeDasharray="3 4" opacity="0.4" />
        );
      })}

      {/* YOU — center head */}
      <circle cx={cx} cy={cy} r={22}
        fill="rgba(20,40,160,0.2)"
        stroke="rgba(20,40,160,0.7)" strokeWidth="1.5" />
      <circle cx={cx} cy={cy} r={14}
        fill="rgba(20,40,160,0.4)"
        stroke="rgba(75,98,216,0.5)" strokeWidth="1" />
      {/* Ear dots */}
      <circle cx={cx - 22} cy={cy} r={4} fill="rgba(20,40,160,0.5)" />
      <circle cx={cx + 22} cy={cy} r={4} fill="rgba(20,40,160,0.5)" />
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize="8"
        fill="rgba(255,255,255,0.7)" fontWeight="700" letterSpacing="0.5">YOU</text>

      {/* Speaker dots */}
      {positions.map((p, i) => {
        const azRad    = (p.azimuth * Math.PI) / 180;
        const distFrac = Math.min((p.distance ?? 1.2) / 3.0, 1.0);
        const dotR     = r * distFrac * 0.92;
        const x = cx + dotR * Math.sin(azRad);
        const y = cy - dotR * Math.cos(azRad);
        const elFrac   = ((p.elevation ?? 10) + 45) / 90;
        const dotSize  = 10 + elFrac * 5;
        const color    = SPEAKER_COLORS[i];

        return (
          <g key={`speaker-${i}`}>
            {/* Glow */}
            <circle cx={x} cy={y} r={dotSize + 6}
              fill={color} opacity="0.12" />
            {/* Main dot */}
            <circle cx={x} cy={y} r={dotSize}
              fill={color} opacity="0.9"
              stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
            {/* Inner highlight */}
            <circle cx={x - dotSize * 0.25} cy={y - dotSize * 0.25}
              r={dotSize * 0.3}
              fill="rgba(255,255,255,0.25)" />
            {/* Label */}
            <text x={x} y={y - dotSize - 7} textAnchor="middle"
              fontSize="9" fill={color} fontWeight="700" letterSpacing="0.2">
              {SPEAKER_NAMES[i].replace('Caller ', 'C')}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
