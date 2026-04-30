const SPEAKER_COLORS = ['#4B62D8', '#00C6FF', '#7B5EA7'];
const SPEAKER_NAMES  = ['Caller 1', 'Caller 2', 'Caller 3'];
const SPEAKER_INITIALS = ['C1', 'C2', 'C3'];

export default function SpeakerCard({ speaker, position, onChange, isStreaming }) {
  const color = SPEAKER_COLORS[speaker] ?? '#4B62D8';
  const name  = SPEAKER_NAMES[speaker] ?? `Caller ${speaker + 1}`;

  const posText = `Az ${Math.round(position.azimuth)}° · El ${Math.round(position.elevation)}° · ${position.distance?.toFixed(1)}m`;

  const sliderRow = (label, field, min, max, unit) => {
    const val = position[field] ?? 0;
    const pct = ((val - min) / (max - min)) * 100;
    const trackBg = `linear-gradient(to right, ${color} ${pct}%, var(--bg-surface) ${pct}%)`;
    return (
      <div className="slider-row">
        <div className="slider-label-row">
          <span className="slider-label">{label}</span>
          <span className="slider-value">{Math.round(val * 10) / 10}{unit}</span>
        </div>
        <input
          type="range" min={min} max={max} step="1"
          value={Math.round(val)}
          style={{ background: trackBg, '--thumb-color': color }}
          onChange={e => onChange(speaker, field, parseFloat(e.target.value))}
        />
      </div>
    );
  };

  return (
    <div
      className={`speaker-card ${isStreaming ? 'active' : ''}`}
      style={{ '--card-color': color }}
    >
      <div className="speaker-card-header">
        <div className="speaker-identity">
          <div className="speaker-avatar" style={{ background: `${color}33`, borderColor: `${color}66` }}>
            <span style={{ color }}>{SPEAKER_INITIALS[speaker]}</span>
          </div>
          <div className="speaker-info">
            <span className="speaker-name">{name}</span>
            <span className="speaker-pos-text">{posText}</span>
          </div>
        </div>
        <div className={`speaker-activity ${isStreaming ? 'active' : ''}`} />
      </div>

      {sliderRow('Azimuth',   'azimuth',  -180, 180, '°')}
      {sliderRow('Elevation', 'elevation',  -45,  45, '°')}
      {sliderRow('Distance',  'distance',    0.5, 3.0, 'm')}
    </div>
  );
}
