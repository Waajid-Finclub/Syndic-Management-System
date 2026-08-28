#!/bin/sh
set -eu

export APP_ENV="${APP_ENV:-production}"
export REQUIRE_STRONG_SECRET="${REQUIRE_STRONG_SECRET:-true}"
export PREPARE_DATABASE_ON_STARTUP="${PREPARE_DATABASE_ON_STARTUP:-true}"
export RESET_DATABASE_ON_STARTUP="${RESET_DATABASE_ON_STARTUP:-false}"
export SESSION_COOKIE_SECURE="${SESSION_COOKIE_SECURE:-true}"
export SESSION_COOKIE_SAMESITE="${SESSION_COOKIE_SAMESITE:-Lax}"
export CSRF_ENABLED="${CSRF_ENABLED:-true}"
export SECURITY_HEADERS_ENABLED="${SECURITY_HEADERS_ENABLED:-true}"

is_enabled() {
  case "$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]')" in
    1|true|yes|on) return 0 ;;
    *) return 1 ;;
  esac
}

if is_enabled "$RESET_DATABASE_ON_STARTUP"; then
  echo "RESET_DATABASE_ON_STARTUP is enabled; dropping and reseeding the database."
  python seed.py --reset
fi

exec gunicorn --bind 0.0.0.0:5000 --workers 2 --threads 4 --timeout 120 'app:create_app()'
