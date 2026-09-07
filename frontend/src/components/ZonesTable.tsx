import { useState } from 'react';
import type { Zone } from '../types';

interface Props {
  zones: Zone[];
  mqttConnected: boolean;
  onSetTarget: (id: number, targetTemp: number) => Promise<void>;
}

function formatTemp(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(1)}°C`;
}

interface RowProps {
  zone: Zone;
  disabled: boolean;
  onSetTarget: (id: number, targetTemp: number) => Promise<void>;
}

function ZoneRow({ zone, disabled, onSetTarget }: RowProps) {
  const [draft, setDraft] = useState<string>(zone.targetTemp?.toFixed(1) ?? '');
  const [saving, setSaving] = useState(false);

  const controlsDisabled = disabled || !zone.online || saving;

  async function commit() {
    const value = Number.parseFloat(draft);
    if (!Number.isFinite(value) || value === zone.targetTemp) {
      return;
    }
    setSaving(true);
    try {
      await onSetTarget(zone.id, value);
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr>
      <td>{zone.name}</td>
      <td>{formatTemp(zone.currentTemp)}</td>
      <td>
        <div className="target-control">
          <input
            type="number"
            step={0.5}
            min={zone.minTemp ?? undefined}
            max={zone.maxTemp ?? undefined}
            value={draft}
            disabled={controlsDisabled}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => void commit()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                (e.target as HTMLInputElement).blur();
              }
            }}
            aria-label={`Target temperature for ${zone.name}`}
          />
          <span>°C</span>
        </div>
      </td>
      <td>
        {formatTemp(zone.minTemp)} / {formatTemp(zone.maxTemp)}
      </td>
      <td>
        <span className={`pill mode-${zone.mode}`}>{zone.mode}</span>
      </td>
      <td>
        <span className={`pill ${zone.online ? 'state-online' : 'state-offline'}`}>
          {zone.online ? 'online' : 'offline'}
        </span>
      </td>
    </tr>
  );
}

export default function ZonesTable({ zones, mqttConnected, onSetTarget }: Props) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Zones</h2>
        <span className="panel-hint">
          {mqttConnected ? 'live values via MQTT' : 'MQTT disconnected — controls disabled'}
        </span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Zone</th>
              <th>Current</th>
              <th>Target</th>
              <th>Min / Max</th>
              <th>Mode</th>
              <th>State</th>
            </tr>
          </thead>
          <tbody>
            {zones.map((zone) => (
              <ZoneRow key={zone.id} zone={zone} disabled={!mqttConnected} onSetTarget={onSetTarget} />
            ))}
            {zones.length === 0 && (
              <tr>
                <td colSpan={6} className="empty">
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
