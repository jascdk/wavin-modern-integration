export interface MqttStatus {
  connected: boolean;
  brokerUrl: string;
  clientId: string;
  baseTopic: string;
  lastConnectedAt: string | null;
  lastMessageAt: string | null;
  lastMessageTopic: string | null;
  lastError: string | null;
  reconnectCount: number;
}

export interface ApiStatus {
  app: {
    ok: boolean;
    service: string;
    uptime: number;
    timestamp: string;
  };
  mqtt: MqttStatus;
}

export interface Zone {
  id: number;
  name: string;
  currentTemp: number | null;
  targetTemp: number | null;
  minTemp: number | null;
  maxTemp: number | null;
  comfortTemp: number | null;
  ecoTemp: number | null;
  mode: 'auto' | 'manual' | 'away' | 'off';
  online: boolean;
  lastUpdated: string | null;
}

export interface ActivityEntry {
  time: string;
  message: string;
  level: 'info' | 'warn' | 'error';
}
