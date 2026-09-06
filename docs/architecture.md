# Architecture

`wavin-modern-integration` is a standalone companion app for the Wavin AHC9000 floor
heating system. It is deliberately decoupled from
[jascdk/wavin_ahc9000_advanced_mqtt](https://github.com/jascdk/wavin_ahc9000_advanced_mqtt)
— the two codebases never import from each other; they integrate **only through MQTT
topics**, which keeps either side replaceable.

## Components

```
┌─────────────┐   REST/JSON   ┌─────────────┐    MQTT (wavin/#)    ┌────────────────┐
│  frontend   │ ◄───────────► │   backend   │ ◄──────────────────► │  MQTT broker   │
│ React/Vite  │               │ Express API │                      │  (external)    │
│ nginx :8080 │               │  :3001      │                      └───────┬────────┘
└─────────────┘               └─────────────┘                            │
                                                                         │
                              ┌────────────────────────────────────────────▼───────────┐
                              │ wavin_ahc9000_advanced_mqtt (ESP32 bridge, other repo) │
                              └────────────────────────────────────────────────────────┘
```

### Frontend (`frontend/`)

- React + Vite + TypeScript SPA served by nginx in production.
- Talks to the backend only via `VITE_API_BASE_URL` (baked in at build time).
- Polls `/api/status` and `/api/zones`; renders status cards, zones table, activity log.
- Contains **no** hardware knowledge.

### Backend (`backend/`)

- Node.js + Express + TypeScript.
- `src/config/` — environment parsing, single source of truth for settings.
- `src/routes/` — HTTP surface (`/health`, `/api/status`, `/api/zones`).
- `src/services/mqttService.ts` — MQTT connection lifecycle (connect / reconnect /
  close / error), in-memory status object, safe JSON payload parsing, placeholder
  subscription to `<MQTT_BASE_TOPIC>/#`.
- `src/services/zoneService.ts` — placeholder zone data, to be replaced by live state.

## Integration boundaries

| Boundary              | Contract                                                            |
| --------------------- | ------------------------------------------------------------------- |
| Browser ↔ backend     | REST/JSON over HTTP; CORS allow-list via `CORS_ORIGIN`              |
| Backend ↔ broker      | MQTT via `MQTT_URL`; subscribes to `<MQTT_BASE_TOPIC>/#`            |
| Broker ↔ ESP32 bridge | Owned entirely by `wavin_ahc9000_advanced_mqtt`                     |

The only shared contract between the two repositories is the **MQTT topic layout and
payload schema** under the configured base topic (default `wavin/`).

## Future adapter: wavin_ahc9000_advanced_mqtt

A planned adapter module (`backend/src/services/adapters/wavinAhc9000.ts`) will:

1. Map topics published by the ESP32 bridge (e.g. `wavin/<zone>/temperature`,
   `wavin/<zone>/setpoint`, `wavin/<zone>/mode`) onto the internal `Zone` model.
2. Replace the placeholder data in `zoneService` with live state built from those
   messages.
3. Publish commands (setpoint/mode changes initiated in the UI) back onto the command
   topics the bridge listens on.
4. Feed decoded events into the activity log (persisted or streamed via WebSocket/SSE).

Until that lands, all zone data and MQTT subscriptions are clearly-marked placeholders,
so the scaffold runs end-to-end with any MQTT broker — or none at all (the API stays
up and reports MQTT as disconnected).

## Deployment model

- Everything runs as two containers (`frontend`, `frontend` → nginx, `backend` → node)
  orchestrated by the root `docker-compose.yml`.
- The Proxmox LXC installer (`scripts/install_lxc.sh`) targets a plain Debian/Ubuntu
  container: Docker + compose plugin, clone, env file, `docker compose up -d --build`.
- No state is persisted yet; when needed, add a named volume (e.g. for SQLite or
  retained activity history) to the backend service.
