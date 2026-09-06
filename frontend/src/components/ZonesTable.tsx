import type { Zone } from '../types';

interface Props {
  zones: Zone[];
}

export default function ZonesTable({ zones }: Props) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Zones</h2>
        <span className="panel-hint">placeholder data — live values arrive via MQTT</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Zone</th>
              <th>Current</th>
              <th>Target</th>
              <th>Mode</th>
              <th>State</th>
            </tr>
          </thead>
          <tbody>
            {zones.map((zone) => (
              <tr key={zone.id}>
                <td>{zone.name}</td>
                <td>{zone.temp.toFixed(1)}°C</td>
                <td>{zone.target.toFixed(1)}°C</td>
                <td>
                  <span className={`pill mode-${zone.mode}`}>{zone.mode}</span>
                </td>
                <td>
                  <span className={`pill ${zone.online ? 'state-online' : 'state-offline'}`}>
                    {zone.online ? 'online' : 'offline'}
                  </span>
                </td>
              </tr>
            ))}
            {zones.length === 0 && (
              <tr>
                <td colSpan={5} className="empty">
                  No zones loaded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
