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
  layout shared with `wavin_ahc9000_advanced_mqtt`; parses individual
  `<baseTopic>/<deviceId>/<zoneId>/<field>` messages (`current_temp`, `target_temp`,
  `battery`, `rssi`, `current_draw`, `attributes`) into partial `Zone` patches and
  builds `<baseTopic>/<deviceId>/<zoneId>/set_temp` setpoint commands. Covered by unit
  tests (`wavinAhc9000.test.ts`) guarding against field mix-ups (e.g. current vs.
  target, comfort vs. eco) and unrecognized/malformed payloads.
- `src/services/zoneService.ts` — live, in-memory zone store keyed by zone id, updated
  exclusively by the adapter as individual field messages arrive; merges partial
  patches so previously known fields survive across messages that only report one
  value, and starts empty until the first MQTT message for a zone is received.

## Integration boundaries

| Boundary              | Contract                                                             |
| --------------------- | ---------------------------------------------------------------------|
| Browser ↔ backend     | REST/JSON over HTTP; CORS allow-list via `CORS_ORIGIN`               |
| Backend ↔ broker      | MQTT via `MQTT_URL`; subscribes to `<MQTT_BASE_TOPIC>/#`, publishes   |
|                        | setpoint commands to `<MQTT_BASE_TOPIC>/<deviceId>/<zoneId>/set_temp`|
| Broker ↔ ESP32 bridge | Owned entirely by `wavin_ahc9000_advanced_mqtt`                      |

The shared contract between the two repositories is the MQTT topic layout published
by the ESP32 bridge under the configured base topic (default `wavin/`), implemented in
`backend/src/services/adapters/wavinAhc9000.ts`:

- **State** (subscribed): `<baseTopic>/<deviceId>/<zoneId>/<field>`, one message per
  field rather than a single combined payload, where `<deviceId>` is the bridge's MAC
  address and `<zoneId>` is a room number (the `master` whole-house topics are not
  modeled as a zone and are ignored):
  - `current_temp`, `target_temp` — plain numbers.
  - `battery`, `rssi`, `current_draw` — plain numbers; recognized as valid zone
    telemetry (so they don't get logged as unrecognized) but not yet mapped onto a
    `Zone` field.
  - `attributes` — JSON object; `room` → zone name, `min_temp`/`max_temp` → limits,
    `comfort_temp`/`eco_temp`, `mode`/`online` when present. Unknown/missing/wrongly
    typed fields are left untouched rather than defaulted, so a partial update never
    overwrites previously known values with `0`/`false`, and a message never overwrites
    other fields it doesn't carry (e.g. a `current_temp` message never touches
    `target_temp`).
  - `valve`, `lock` — plain `ON`/`OFF` text (not JSON), safely ignored by the
    JSON-parsing guard in `mqttService.ts`.
- **Setpoint command** (published): `<baseTopic>/<deviceId>/<zoneId>/set_temp` — a
  plain-text number (not JSON), matching the firmware's `String::toFloat()` parsing.
  The `deviceId` used is whichever device the backend last saw a message for that zone
  under.

This schema was reconciled against the actual payloads emitted by
`wavin_ahc9000_advanced_mqtt`'s firmware (`src/main.cpp`), which publishes flat
per-field topics rather than a combined Home Assistant discovery-style state payload.

## Adapter status: wavinAhc9000

`backend/src/services/adapters/wavinAhc9000.ts` is implemented:

1. Maps `<baseTopic>/<deviceId>/<zoneId>/<field>` messages onto partial patches of the
   internal `Zone` model.
2. `zoneService` is a live store built from those messages (no more hardcoded data),
   merging partial patches so a message reporting only one field never clobbers
   previously known values.
3. `mqttService.publishSetpoint()` publishes setpoint changes initiated in the UI back
   onto `<baseTopic>/<deviceId>/<zoneId>/set_temp`, using the `deviceId` last observed
   for that zone.
4. Zone updates are still only logged to the console; feeding them into a persisted or
   streamed (WebSocket/SSE) activity log remains future work.

All zone data is empty at startup and only populates as matching MQTT messages
arrive for each zone/field — the scaffold still runs end-to-end with any MQTT broker,
or none at all (the API reports MQTT as disconnected and the zones table shows "No
zones loaded yet" until the first message for a zone comes in).

## Deployment model

- Everything runs as two containers (`frontend`, `frontend` → nginx, `backend` → node)
  orchestrated by the root `docker-compose.yml`.
- The Proxmox LXC installer (`scripts/install_lxc.sh`) targets a plain Debian/Ubuntu
  container: Docker + compose plugin, clone, env file, `docker compose up -d --build`.
- No state is persisted yet; when needed, add a named volume (e.g. for SQLite or
  retained activity history) to the backend service.
