import type { ActivityEntry } from '../types';

interface Props {
  entries: ActivityEntry[];
}

export default function ActivityLog({ entries }: Props) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Activity</h2>
        <span className="panel-hint">recent frontend/backend events</span>
      </div>
      <ul className="activity-list">
        {entries.map((entry, index) => (
          <li key={`${entry.time}-${index}`} className={`activity-item level-${entry.level}`}>
            <span className="activity-time">{entry.time}</span>
            <span className="activity-message">{entry.message}</span>
          </li>
        ))}
        {entries.length === 0 && <li className="empty">No activity yet.</li>}
      </ul>
    </section>
  );
}
