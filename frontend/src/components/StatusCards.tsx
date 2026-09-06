import type { ApiStatus } from '../types';

interface Props {
  apiReachable: boolean;
  status: ApiStatus | null;
  lastUpdate: string | null;
}

function formatTime(iso: string | null): string {
  if (!iso) {
    return '—';
  }
  return new Date(iso).toLocaleTimeString();
}

export default function StatusCards({ apiReachable, status, lastUpdate }: Props) {
  const mqttConnected = status?.mqtt.connected ?? false;

  return (
    <section className="status-grid">
      <div className="card">
        <h2 className="card-label">API Status</h2>
        <p className={`card-value ${apiReachable ? 'ok' : 'err'}`}>
          <span className="dot" aria-hidden="true" />
          {apiReachable ? 'Online' : 'Offline'}
        </p>
      </div>
      <div className="card">
        <h2 className="card-label">MQTT Status</h2>
        <p className={`card-value ${mqttConnected ? 'ok' : 'warn'}`}>
          <span className="dot" aria-hidden="true" />
          {mqttConnected ? 'Connected' : 'Disconnected'}
        </p>
        <p className="card-sub">{status?.mqtt.brokerUrl ?? 'waiting for backend…'}</p>
      </div>
      <div className="card">
        <h2 className="card-label">Last Update</h2>
        <p className="card-value">{formatTime(lastUpdate)}</p>
        <p className="card-sub">
          {status ? `uptime ${Math.round(status.app.uptime)}s` : 'no data yet'}
        </p>
      </div>
    </section>
  );
}
