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
- Zone target temperature is editable in the zones table (`ZonesTable.tsx`); edits call
  `PATCH /api/zones/:id` via `setZoneTarget()` (`api/client.ts`). Controls are disabled
  when MQTT is disconnected or the zone itself is reported offline.
- Contains **no** hardware knowledge — it only understands the internal `Zone` model.

### Backend (`backend/`)

- Node.js + Express + TypeScript.
- `src/config/` — environment parsing, single source of truth for settings.
- `src/routes/` — HTTP surface (`/health`, `/api/status`, `/api/zones`,
  `PATCH /api/zones/:id`).
- `src/services/mqttService.ts` — MQTT connection lifecycle (connect / reconnect /
  close / error), in-memory status object, safe JSON payload parsing, subscription to
  `<MQTT_BASE_TOPIC>/#`, and `publishSetpoint()` for outgoing setpoint commands.
- `src/services/adapters/wavinAhc9000.ts` — the only module that knows the MQTT topic
  layout and JSON payload schema shared with `wavin_ahc9000_advanced_mqtt`; parses
  `<baseTopic>/<zoneId>/state` messages into `Zone` patches and builds
  `<baseTopic>/<zoneId>/set` setpoint commands. Covered by unit tests
  (`wavinAhc9000.test.ts`) guarding against field mix-ups (e.g. current vs. target,
  comfort vs. eco).
- `src/services/zoneService.ts` — live, in-memory zone store keyed by zone id, updated
  exclusively by the adapter as state messages arrive; starts empty until the first
  MQTT message for a zone is received.

## Integration boundaries

| Boundary              | Contract                                                             |
| --------------------- | ---------------------------------------------------------------------|
| Browser ↔ backend     | REST/JSON over HTTP; CORS allow-list via `CORS_ORIGIN`               |
| Backend ↔ broker      | MQTT via `MQTT_URL`; subscribes to `<MQTT_BASE_TOPIC>/#`, publishes   |
|                        | setpoint commands to `<MQTT_BASE_TOPIC>/<zoneId>/set`                 |
| Broker ↔ ESP32 bridge | Owned entirely by `wavin_ahc9000_advanced_mqtt`                      |

The shared contract between the two repositories is the MQTT topic layout and JSON
payload schema under the configured base topic (default `wavin/`), implemented in
`backend/src/services/adapters/wavinAhc9000.ts`:

- **State** (subscribed): `<baseTopic>/<zoneId>/state` — JSON object with optional
  `name`, `current_temp`, `target_temp`, `min_temp`, `max_temp`, `comfort_temp`,
  `eco_temp`, `mode` (`auto`/`manual`/`away`/`off`), `online` fields. Unknown/missing
  fields are left untouched rather than defaulted, so a partial update never
  overwrites previously known values with `0`/`false`.
- **Setpoint command** (published): `<baseTopic>/<zoneId>/set` — `{ "target_temp": number }`.

This schema is this repo's definition of the contract; it should be reconciled against
the actual payloads emitted by `wavin_ahc9000_advanced_mqtt` before going live, since
that firmware currently follows a Home Assistant MQTT-discovery-style layout rather
than these flat per-zone topics (see that repo's `README.md`). Adjust
`wavinAhc9000.ts` accordingly if the real topic/payload names differ.

## Adapter status: wavinAhc9000

`backend/src/services/adapters/wavinAhc9000.ts` is implemented:

1. Maps `<baseTopic>/<zoneId>/state` messages onto the internal `Zone` model.
2. `zoneService` is a live store built from those messages (no more hardcoded data).
3. `mqttService.publishSetpoint()` publishes setpoint changes initiated in the UI back
   onto `<baseTopic>/<zoneId>/set`.
4. Zone updates are still only logged to the console; feeding them into a persisted or
   streamed (WebSocket/SSE) activity log remains future work.

Until the real bridge's topic/payload schema is confirmed, all zone data is empty at
startup and only populates as matching MQTT messages arrive — the scaffold still runs
end-to-end with any MQTT broker, or none at all (the API reports MQTT as disconnected
and the zones table shows "No zones loaded yet").

## Deployment model

- Everything runs as two containers (`frontend`, `frontend` → nginx, `backend` → node)
  orchestrated by the root `docker-compose.yml`.
- The Proxmox LXC installer (`scripts/install_lxc.sh`) targets a plain Debian/Ubuntu
  container: Docker + compose plugin, clone, env file, `docker compose up -d --build`.
- No state is persisted yet; when needed, add a named volume (e.g. for SQLite or
  retained activity history) to the backend service.
