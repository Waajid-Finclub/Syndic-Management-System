# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS frontend-deps
WORKDIR /build/frontend
ENV NEXT_TELEMETRY_DISABLED=1
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS frontend-builder
WORKDIR /build/frontend
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=frontend-deps /build/frontend/node_modules ./node_modules
COPY frontend/ ./
RUN npm run build

FROM python:3.13-slim-bookworm AS runtime

ARG APP_PUBLIC_URL=
ARG CORS_ORIGINS=
ARG FRONTEND_PORT=3000
ARG SECRET_KEY=
ARG DATABASE_URL=
ARG RESET_DATABASE_ON_STARTUP=true
ARG SESSION_COOKIE_SECURE=true
ARG SESSION_COOKIE_SAMESITE=Lax
ARG PAYMENT_GATEWAY=simulated
ARG API_PROXY_DEBUG=false
ARG API_REQUEST_DEBUG=false

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=${FRONTEND_PORT} \
    APP_ENV=production \
    REQUIRE_STRONG_SECRET=true \
    PREPARE_DATABASE_ON_STARTUP=true \
    RESET_DATABASE_ON_STARTUP=${RESET_DATABASE_ON_STARTUP} \
    CSRF_ENABLED=true \
    SECURITY_HEADERS_ENABLED=true \
    API_INTERNAL_URL=http://127.0.0.1:5000 \
    APP_PUBLIC_URL=${APP_PUBLIC_URL} \
    CORS_ORIGINS=${CORS_ORIGINS} \
    SECRET_KEY=${SECRET_KEY} \
    DATABASE_URL=${DATABASE_URL} \
    SESSION_COOKIE_SECURE=${SESSION_COOKIE_SECURE} \
    SESSION_COOKIE_SAMESITE=${SESSION_COOKIE_SAMESITE} \
    PAYMENT_GATEWAY=${PAYMENT_GATEWAY} \
    API_PROXY_DEBUG=${API_PROXY_DEBUG} \
    API_REQUEST_DEBUG=${API_REQUEST_DEBUG}

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates libstdc++6 \
    && rm -rf /var/lib/apt/lists/* \
    && addgroup --system app \
    && adduser --system --ingroup app app

COPY --from=frontend-deps /usr/local/bin/node /usr/local/bin/node

COPY backend/requirements.txt /tmp/backend-requirements.txt
RUN pip install --upgrade pip \
    && pip install -r /tmp/backend-requirements.txt \
    && rm /tmp/backend-requirements.txt

COPY backend/ /app/backend/
COPY --from=frontend-builder /build/frontend/public /app/frontend/public
COPY --from=frontend-builder /build/frontend/.next/standalone /app/frontend
COPY --from=frontend-builder /build/frontend/.next/static /app/frontend/.next/static
COPY docker/start-syndic.sh /usr/local/bin/start-syndic

RUN mkdir -p /app/backend/instance/uploads \
    && chmod +x /usr/local/bin/start-syndic \
    && chown -R app:app /app

USER app
EXPOSE 3000

HEALTHCHECK --interval=20s --timeout=5s --retries=5 --start-period=30s \
    CMD node -e "fetch('http://127.0.0.1:' + (process.env.FRONTEND_PORT || process.env.PORT || '3000')).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["start-syndic"]
