import { useCallback, useEffect, useState } from 'react';
import { fetchStatus, fetchZones } from './api/client';
import type { ActivityEntry, ApiStatus, Zone } from './types';
import Header from './components/Header';
import StatusCards from './components/StatusCards';
import ZonesTable from './components/ZonesTable';
import ActivityLog from './components/ActivityLog';

const POLL_INTERVAL_MS = 15000;

function now(): string {
  return new Date().toLocaleTimeString();
}

export default function App() {
  const [status, setStatus] = useState<ApiStatus | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [apiReachable, setApiReachable] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([
    { time: now(), message: 'Dashboard started', level: 'info' },
  ]);

  const log = useCallback((message: string, level: ActivityEntry['level'] = 'info') => {
    setActivity((entries) => [{ time: now(), message, level }, ...entries].slice(0, 50));
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [nextStatus, nextZones] = await Promise.all([fetchStatus(), fetchZones()]);
      setStatus(nextStatus);
      setZones(nextZones);
      setApiReachable(true);
      setLastUpdate(new Date().toISOString());
    } catch (err) {
      setApiReachable(false);
      log(`API unreachable: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  }, [log]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  return (
    <div className="app">
      <Header />
      <main className="content">
        <StatusCards apiReachable={apiReachable} status={status} lastUpdate={lastUpdate} />
        <div className="panels">
          <ZonesTable zones={zones} />
          <ActivityLog entries={activity} />
        </div>
      </main>
    </div>
  );
}
