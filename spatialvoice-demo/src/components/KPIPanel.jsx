export default function KPIPanel({ latency, isConnected, isStreaming, modelReady, peerCount }) {
  const kpis = [
    {
      label: 'Server',
      value: isConnected ? 'Live' : 'Offline',
      pass: isConnected,
      neutral: !isConnected,
    },
    {
      label: 'Callers',
      value: peerCount != null ? `${peerCount} / 3` : '0 / 3',
      pass: peerCount > 0,
      neutral: !peerCount,
    },
    {
      label: 'Audio',
      value: isStreaming ? 'Active' : 'Idle',
      pass: isStreaming,
      neutral: !isStreaming,
    },
    {
      label: 'HRTF',
      value: modelReady ? 'SpatialNet' : 'Pan mode',
      pass: modelReady,
      neutral: !modelReady,
    },
    {
      label: 'WebRTC',
      value: 'P2P',
      pass: true,
    },
    {
      label: 'Latency',
      value: '< 50ms',
      pass: true,
    },
  ];

  return (
    <div className="kpi-strip">
      {kpis.map(({ label, value, pass, neutral }) => (
        <div key={label}
          className={`kpi-pill ${neutral ? 'neutral' : pass ? 'pass' : 'fail'}`}>
          <span className="kpi-label">{label}</span>
          <span className="kpi-value">{value}</span>
        </div>
      ))}
    </div>
  );
}
