#!/usr/bin/env bash
#
# install_lxc.sh — one-command installer for wavin-modern-integration on a
# Proxmox Debian/Ubuntu LXC container.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/jascdk/wavin-modern-integration/main/scripts/install_lxc.sh | bash
#   — or —
#   ./scripts/install_lxc.sh
#
# The script is idempotent: it is safe to re-run to update an existing install.

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/jascdk/wavin-modern-integration.git}"
INSTALL_DIR="${INSTALL_DIR:-/opt/wavin-modern-integration}"
BRANCH="${BRANCH:-main}"

log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*"; }
err()  { printf '\033[1;31m[error]\033[0m %s\n' "$*" >&2; }

require_root() {
  if [ "$(id -u)" -ne 0 ]; then
    err "Please run as root (or with sudo)."
    exit 1
  fi
}

check_os() {
  if [ ! -f /etc/os-release ]; then
    err "Cannot detect OS (missing /etc/os-release)."
    exit 1
  fi
  # shellcheck disable=SC1091
  . /etc/os-release
  case "${ID:-}" in
    debian|ubuntu)
      log "Detected ${PRETTY_NAME:-$ID}"
      ;;
    *)
      err "Unsupported OS '${ID:-unknown}'. This installer supports Debian and Ubuntu."
      exit 1
      ;;
  esac
}

install_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    log "Docker with compose plugin already installed"
    return
  fi

  log "Installing Docker Engine + compose plugin"
  apt-get update -y
  apt-get install -y ca-certificates curl gnupg git

  install -m 0755 -d /etc/apt/keyrings
  if [ ! -f /etc/apt/keyrings/docker.asc ]; then
    curl -fsSL "https://download.docker.com/linux/${ID}/gpg" -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
  fi

  # shellcheck disable=SC1091
  . /etc/os-release
  cat > /etc/apt/sources.list.d/docker.list <<EOF
deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/${ID} ${VERSION_CODENAME} stable
EOF

  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

  systemctl enable --now docker
  log "Docker installed: $(docker --version)"
}

clone_or_update_repo() {
  if [ -d "${INSTALL_DIR}/.git" ]; then
    log "Existing install found in ${INSTALL_DIR}, updating"
    git -C "${INSTALL_DIR}" fetch origin "${BRANCH}"
    git -C "${INSTALL_DIR}" checkout "${BRANCH}"
    git -C "${INSTALL_DIR}" pull --ff-only origin "${BRANCH}"
  else
    log "Cloning ${REPO_URL} into ${INSTALL_DIR}"
    git clone --depth 1 --branch "${BRANCH}" "${REPO_URL}" "${INSTALL_DIR}"
  fi
}

prepare_env() {
  if [ ! -f "${INSTALL_DIR}/.env" ]; then
    log "Creating .env from .env.example (edit it to match your setup)"
    cp "${INSTALL_DIR}/.env.example" "${INSTALL_DIR}/.env"
  else
    log ".env already exists, keeping it"
  fi
}

start_stack() {
  log "Building and starting the stack (this can take a few minutes on first run)"
  docker compose -f "${INSTALL_DIR}/docker-compose.yml" --env-file "${INSTALL_DIR}/.env" up -d --build
}

print_summary() {
  local ip
  ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  ip="${ip:-<lxc-ip>}"

  # shellcheck disable=SC1091
  local frontend_port backend_port
  frontend_port="$(grep -E '^FRONTEND_PORT=' "${INSTALL_DIR}/.env" | cut -d= -f2 || true)"
  backend_port="$(grep -E '^BACKEND_PORT=' "${INSTALL_DIR}/.env" | cut -d= -f2 || true)"
  frontend_port="${frontend_port:-8080}"
  backend_port="${backend_port:-3001}"

  cat <<EOF

$(printf '\033[1;32m')Installation complete!$(printf '\033[0m')

  Dashboard (UI):  http://${ip}:${frontend_port}
  Backend API:     http://${ip}:${backend_port}
  Health check:    http://${ip}:${backend_port}/health

Next steps:
  1. Edit ${INSTALL_DIR}/.env with your MQTT broker details.
     If the UI is opened from another machine, set:
       VITE_API_BASE_URL=http://${ip}:${backend_port}
       CORS_ORIGIN=http://${ip}:${frontend_port}
  2. Rebuild after changing .env:
       cd ${INSTALL_DIR} && docker compose up -d --build
  3. Follow logs:
       cd ${INSTALL_DIR} && docker compose logs -f

EOF
}

main() {
  require_root
  check_os
  install_docker
  clone_or_update_repo
  prepare_env
  start_stack
  print_summary
}

main "$@"
