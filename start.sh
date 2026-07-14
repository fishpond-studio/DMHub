#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

MODE="dev"
SKIP_INSTALL=0
SKIP_BUILD=0

for arg in "$@"; do
  case "$arg" in
    prod)       MODE="prod" ;;
    --no-install) SKIP_INSTALL=1 ;;
    --no-build)   SKIP_BUILD=1 ;;
    -h|--help)
      echo "Usage: $0 [prod] [--no-install] [--no-build]"
      echo ""
      echo "  prod          Production mode (build + start server)"
      echo "  --no-install  Skip pnpm install"
      echo "  --no-build    Skip build steps"
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg"
      exit 1
      ;;
  esac
done

if ! command -v node &>/dev/null; then
  echo "[ERROR] Node.js not found, please install Node.js 20+"
  exit 1
fi
echo "[INFO] Node.js $(node -v)"

if ! command -v pnpm &>/dev/null; then
  echo "[INFO] Installing pnpm..."
  npm install -g pnpm
fi
echo "[INFO] pnpm $(pnpm -v)"

if [ ! -f ".env" ]; then
  echo "[WARN] .env not found, copying from .env.example..."
  cp .env.example .env
  echo "[WARN] Please edit .env and set JWT_SECRET and ENCRYPTION_KEY"
  exit 1
fi

if [ "$SKIP_INSTALL" -eq 0 ]; then
  echo "[INFO] Installing dependencies..."
  pnpm install
fi

if [ "$SKIP_BUILD" -eq 0 ]; then
  echo "[INFO] Building shared..."
  pnpm --filter @dmhub/shared build

  echo "[INFO] Building dns-providers..."
  pnpm --filter @dmhub/dns-providers build
fi

mkdir -p uploads

if [ "$MODE" = "prod" ]; then
  if [ "$SKIP_BUILD" -eq 0 ]; then
    echo "[INFO] Building web..."
    pnpm --filter @dmhub/web build

    echo "[INFO] Building server..."
    pnpm --filter @dmhub/server build
  fi

  echo ""
  echo "============================================================"
  echo "  DMHub - Production"
  echo "============================================================"
  echo ""
  export NODE_ENV=production
  echo "[INFO] Starting server..."
  exec pnpm --filter @dmhub/server start
else
  echo ""
  echo "============================================================"
  echo "  DMHub - Development"
  echo "============================================================"
  echo ""
  echo "[INFO] Starting web dev server..."
  pnpm dev:web &
  WEB_PID=$!

  echo "[INFO] Starting server dev..."
  pnpm dev:server &
  SERVER_PID=$!

  echo ""
  echo "[INFO] Web:    http://localhost:5173"
  echo "[INFO] Server: http://localhost:8088"
  echo ""

  cleanup() {
    echo ""
    echo "[INFO] Shutting down..."
    kill $WEB_PID $SERVER_PID 2>/dev/null
    wait
  }
  trap cleanup INT TERM

  wait
fi
