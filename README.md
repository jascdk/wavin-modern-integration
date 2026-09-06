# wavin-modern-integration

Modern app-like integration for the Wavin AHC9000 floor heating system, designed for
seamless deployment on a Proxmox Debian/Ubuntu LXC container.

This repository is intentionally **standalone** — it does not modify or depend on the
code in [jascdk/wavin_ahc9000_advanced_mqtt](https://github.com/jascdk/wavin_ahc9000_advanced_mqtt).
Hardware-specific logic is represented by placeholders and will be wired in via a future
adapter (see [docs/architecture.md](docs/architecture.md)).

## Architecture

```
┌────────────────────────── Proxmox LXC (Debian/Ubuntu) ──────────────────────────┐
│                                                                                  │
│   ┌──────────────┐      HTTP (REST)      ┌──────────────┐      MQTT              │
│   │   frontend   │ ────────────────────► │   backend    │ ─────────────► ┌───────┴───┐
│   │ React + Vite │ ◄──────────────────── │ Node+Express │ ◄───────────── │  broker   │
│   │  (nginx)     │   /health /api/*      │ MQTT bridge  │   wavin/#      │ (e.g.     │
│   │  :8080       │                       │  :3001       │                │ Mosquitto)│
│   └──────────────┘                       └──────────────┘                └─────┬─────┘
│                                                                                │
└────────────────────────────────────────────────────────────────────────────────┼───┘
                                                                                  │
                                                         ┌────────────────────────▼───────┐
                                                         │ wavin_ahc9000_advanced_mqtt    │
                                                         │ (ESP32 / hardware bridge —     │
                                                         │  separate repository)          │
                                                         └────────────────────────────────┘
```

- **frontend/** — React + Vite + TypeScript dashboard (status cards, zones, activity log)
- **backend/** — Node.js + Express + TypeScript API with an MQTT bridge service
- **deploy/** — environment examples and deployment notes
- **scripts/** — Proxmox LXC installer (`install_lxc.sh`)
- **docs/** — architecture notes and integration boundaries

## Quick start — Proxmox LXC (recommended)

On a fresh **Debian 12/13 or Ubuntu 22.04/24.04** LXC container (as root):

```bash
curl -fsSL https://raw.githubusercontent.com/jascdk/wavin-modern-integration/main/scripts/install_lxc.sh | bash
```

The installer is idempotent and will:

1. Verify the OS is Debian/Ubuntu
2. Install Docker Engine + the compose plugin (if missing)
3. Clone the repo to `/opt/wavin-modern-integration` (or update an existing clone)
4. Create `.env` from `.env.example` if missing
5. Run `docker compose up -d --build`
6. Print the dashboard/API URLs

## Quick start — local development

Requirements: Node.js ≥ 20 and npm.

```bash
# Backend (terminal 1)
cd backend
cp .env.example .env
npm install
npm run dev          # http://localhost:3001

# Frontend (terminal 2)
cd frontend
cp .env.example .env
npm install
npm run dev          # http://localhost:5173
```

## Quick start — Docker Compose (any host with Docker)

```bash
git clone https://github.com/jascdk/wavin-modern-integration.git
cd wavin-modern-integration
cp .env.example .env        # adjust values, especially MQTT_URL
docker compose up -d --build
```

- Dashboard: `http://<host>:8080`
- API: `http://<host>:3001` (health: `http://<host>:3001/health`)

## Configuration

All configuration is via environment variables. Copy `.env.example` → `.env` and adjust.

| Variable            | Default                    | Description                                              |
| ------------------- | -------------------------- | -------------------------------------------------------- |
| `BACKEND_PORT`      | `3001`                     | Host port for the backend API                            |
| `FRONTEND_PORT`     | `8080`                     | Host port for the dashboard                              |
| `VITE_API_BASE_URL` | `http://localhost:3001`    | API URL baked into the frontend bundle at **build** time |
| `CORS_ORIGIN`       | `http://localhost:8080`    | Comma-separated origins allowed to call the API          |
| `MQTT_URL`          | `mqtt://localhost:1883`    | MQTT broker connection URL                               |
| `MQTT_USERNAME`     | _(empty)_                  | MQTT username (optional)                                 |
| `MQTT_PASSWORD`     | _(empty)_                  | MQTT password (optional)                                 |
| `MQTT_CLIENT_ID`    | `wavin-modern-backend`     | MQTT client identifier                                   |
| `MQTT_BASE_TOPIC`   | `wavin`                    | Base topic; backend subscribes to `<base>/#`             |

> **Important:** `VITE_API_BASE_URL` is embedded when the frontend image is built.
> When opening the dashboard from another machine, set it to an address reachable from
> the browser (e.g. `http://<lxc-ip>:3001`), allow that origin in `CORS_ORIGIN`, then
> rebuild with `docker compose up -d --build`.

## API endpoints

| Endpoint          | Description                                                     |
| ----------------- | --------------------------------------------------------------- |
| `GET /health`     | Liveness probe: `{ ok, service, timestamp }`                    |
| `GET /api/status` | Combined backend + MQTT connection status                       |
| `GET /api/zones`  | Placeholder zone list (id, name, temp, target, mode, online)    |

## Updating / redeploying

On the LXC container:

```bash
# Re-run the installer (pulls latest and rebuilds)
bash /opt/wavin-modern-integration/scripts/install_lxc.sh

# Or manually:
cd /opt/wavin-modern-integration
git pull
docker compose up -d --build
```

## Troubleshooting

| Symptom                                | What to check                                                                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard shows "API Offline"          | `docker compose ps` / `docker compose logs backend`; verify `VITE_API_BASE_URL` matches how you reach the host and port is open |
| "MQTT Disconnected" in the dashboard   | `MQTT_URL`/credentials in `.env`; broker reachable from the container; `docker compose logs backend` shows reconnect attempts   |
| Browser console shows CORS errors      | Add your dashboard origin (e.g. `http://<lxc-ip>:8080`) to `CORS_ORIGIN` and restart the backend                                |
| Changes to `.env` have no effect on UI | `VITE_API_BASE_URL` is a build-time value — run `docker compose up -d --build`                                                  |
| Ports already in use                   | Change `BACKEND_PORT` / `FRONTEND_PORT` in `.env`                                                                               |
| Reset everything                       | `docker compose down -v --rmi local` then re-run the installer                                                                  |

## Development

Both apps share the same npm script conventions:

```bash
npm run dev            # start dev server with watch/reload
npm run build          # production build
npm start              # run the production build
npm run lint           # ESLint
npm run format         # Prettier write
```

## License

MIT — see [LICENSE](LICENSE).
