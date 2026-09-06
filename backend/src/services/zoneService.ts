export interface Zone {
  id: number;
  name: string;
  temp: number;
  target: number;
  mode: 'auto' | 'manual' | 'away' | 'off';
  online: boolean;
}

// Placeholder data. This will be backed by live MQTT state once the
// wavin_ahc9000_advanced_mqtt adapter is implemented (see docs/architecture.md).
const zones: Zone[] = [
  { id: 1, name: 'Living Room', temp: 21.4, target: 22.0, mode: 'auto', online: true },
  { id: 2, name: 'Kitchen', temp: 20.1, target: 21.0, mode: 'auto', online: true },
  { id: 3, name: 'Bedroom', temp: 18.6, target: 19.0, mode: 'manual', online: true },
  { id: 4, name: 'Bathroom', temp: 22.8, target: 23.5, mode: 'auto', online: false },
  { id: 5, name: 'Office', temp: 19.9, target: 20.5, mode: 'away', online: true },
];

export function getZones(): Zone[] {
  return zones;
}
