#!/bin/sh
set -u

export APP_ENV="${APP_ENV:-production}"
export REQUIRE_STRONG_SECRET="${REQUIRE_STRONG_SECRET:-true}"
export PREPARE_DATABASE_ON_STARTUP="${PREPARE_DATABASE_ON_STARTUP:-true}"
export SESSION_COOKIE_SECURE="${SESSION_COOKIE_SECURE:-true}"
export SESSION_COOKIE_SAMESITE="${SESSION_COOKIE_SAMESITE:-Lax}"
export CSRF_ENABLED="${CSRF_ENABLED:-true}"
export SECURITY_HEADERS_ENABLED="${SECURITY_HEADERS_ENABLED:-true}"
export API_INTERNAL_URL="${API_INTERNAL_URL:-http://127.0.0.1:5000}"
export NODE_ENV="${NODE_ENV:-production}"
export NEXT_TELEMETRY_DISABLED="${NEXT_TELEMETRY_DISABLED:-1}"
export HOSTNAME="${HOSTNAME:-0.0.0.0}"
if [ -n "${FRONTEND_PORT:-}" ]; then
  export PORT="$FRONTEND_PORT"
else
  export PORT="${PORT:-3000}"
fi

if [ -z "${CORS_ORIGINS:-}" ] && [ -n "${APP_PUBLIC_URL:-}" ]; then
  export CORS_ORIGINS="$APP_PUBLIC_URL"
fi

cd /app/backend || exit 1
gunicorn --bind 127.0.0.1:5000 --workers 2 --threads 4 --timeout 120 'app:create_app()' &
backend_pid=$!

cd /app/frontend || exit 1
node server.js &
frontend_pid=$!

shutdown() {
  kill -TERM "$backend_pid" "$frontend_pid" 2>/dev/null || true
  wait "$backend_pid" 2>/dev/null || true
  wait "$frontend_pid" 2>/dev/null || true
}

trap 'shutdown; exit 143' INT TERM

while true; do
  if ! kill -0 "$backend_pid" 2>/dev/null; then
    wait "$backend_pid"
    status=$?
    kill -TERM "$frontend_pid" 2>/dev/null || true
    wait "$frontend_pid" 2>/dev/null || true
    exit "$status"
  fi

  if ! kill -0 "$frontend_pid" 2>/dev/null; then
    wait "$frontend_pid"
    status=$?
    kill -TERM "$backend_pid" 2>/dev/null || true
    wait "$backend_pid" 2>/dev/null || true
    exit "$status"
  fi

  sleep 2
done
