# SyndicMS — Syndic Management System

Multi-tenant SaaS platform for Mauritian syndic (co-ownership) management.

This repository currently contains the **Super Admin Console** and the resident PWA under `/app`. The admin console is the platform-level workspace described as the "Master Admin / Multi-Property Console" in the SMS architecture document.

It is deliberately a separate codebase from the Ebene Mews Building Management
System (BMS). The two products share a design language, not a database.

## Architecture

- `frontend/` — Next.js 16 (App Router, React 19, TypeScript) admin console.
- `backend/` — Flask API serving `/api/*` only: auth, platform models, business logic.

The browser always calls same-origin `/api/*`; the Next.js route handler at
`frontend/src/app/api/[...path]/route.ts` proxies those requests to Flask.

## Design

The console reuses the BMS design system so both products read as one platform:
navy-on-light-slate palette, Poppins, white surfaces with hairline borders,
fully-rounded buttons, uppercase micro-labels, and a collapsible navy gradient
sidebar. Tokens live at the top of `frontend/src/app/globals.css`.

Per the platform convention, there are **no native `<select>` or date inputs** —
use the `SelectMenu` and equivalent custom components.

## Run locally

Start the Flask API:

```powershell
cd backend
pip install -r requirements.txt
python run.py
```

Start the Next.js console:

```powershell
cd frontend
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:3000
```

## Fresh baseline

```powershell
cd backend
python seed.py --reset
```

This resets the local database to a clean baseline. It does not create demo
portfolio, invoice, payment, maintenance, voting, visitor, document, WhatsApp message history,
monitoring, or revenue-history rows. It keeps the plan/feature reference catalog,
one starter resident scope, and one login for each supported role. The WhatsApp Centre starts with the approved template catalog and a sandbox connected number.

Admin console credentials:

```text
super_admin     admin@syndicms.mu / AdminConsole2026!
platform_admin  platform@syndicms.mu / AdminConsole2026!
support_user    support@syndicms.mu / AdminConsole2026!
auditor         auditor@syndicms.mu / AdminConsole2026!
```

The admin console and resident app intentionally use different seeded passwords; each login endpoint rejects the other side's accounts.

Resident PWA credentials:

```text
co_owner  coowner@syndicms.mu / ResidentApp2026!
tenant    tenant@syndicms.mu / ResidentApp2026!
```

On an empty database with no seed, the app redirects to `/setup` to create the
first super admin.

## Screens

| Route | Screen |
|---|---|
| `/dashboard` | Platform Overview — KPIs, revenue trend, onboarding pipeline, recent clients |
| `/properties` | Client Properties — registry, status tabs, portfolio totals, add client |
| `/onboarding` | Onboarding Workflow — 8-stage progress per client, 15-item checklist template |
| `/users` | Users & Roles — registry, role counts, permission matrix, create user |
| `/subscriptions` | Subscriptions & Pricing — plan catalog, MRR/ARR/churn/ARPC/LTV, contracts |
| `/feature-flags` | Feature Flags — global switches, plan gating, per-property overrides |
| `/monitoring` | System Monitoring — health tiles with targets, recent alerts |
| `/audit` | Audit Log — filterable append-only trail, CSV export |
| `/whatsapp` | WhatsApp Status — delivery stats, templates, connected numbers |
| `/integrations` | API & Integrations — connectors, API keys, endpoint catalog |

## Roles

Four roles may sign in to this console: `super_admin`, `platform_admin`,
`support_user`, `auditor`. Access is a capability matrix (view / create / edit /
delete / export) across ten modules — see `backend/app/permissions.py`.

Syndic managers, finance officers, co-owners, tenants and contractors are
**administered** from this console but sign in to the syndic console or resident
app; the login endpoint rejects them here.

## Verification

Backend fresh-baseline smoke test:

```powershell
cd backend
python seed.py --reset
python tests/test_resident_api.py
```

Frontend checks:

```powershell
cd frontend
npm run verify
```


## Docker / EasyPanel Deployment

This repo supports three Docker deployment modes:

- `Dockerfile` - single-container EasyPanel Dockerfile app, recommended when EasyPanel asks for a Dockerfile
- `docker-compose.easypanel.yml` - Compose app using an EasyPanel-managed MySQL service
- `docker-compose.yml` - full-stack compose with its own MySQL container for local or standalone hosting

### EasyPanel Dockerfile app

Use the root `Dockerfile` when creating an EasyPanel Dockerfile app. Do not set the Dockerfile path to `docker-compose.yml`; compose files start with `services:` and cannot be built as Dockerfiles.

The root image runs both services in one container:

- `frontend` - Next.js standalone server on port `3000`
- `backend` - Flask API served by Gunicorn on `127.0.0.1:5000` inside the same container

Expose container port `3000`. Point the domain `https://syndic.blocwise.net` at path `/`. The frontend proxies `/api/*` to `http://127.0.0.1:5000`, so the backend does not need a public route.

Set these environment variables in EasyPanel. Use `.env.easypanel.example` as the committed template and `.env.easypanel` as the local ignored copy:

```text
APP_PUBLIC_URL=https://syndic.blocwise.net
CORS_ORIGINS=https://syndic.blocwise.net
FRONTEND_PORT=3000
SECRET_KEY=<long-random-secret>
DATABASE_URL=mysql://mysql:<db-password>@bms_v1_syndic-db:3306/bms_v1
SESSION_COOKIE_SECURE=true
SESSION_COOKIE_SAMESITE=Lax
PAYMENT_GATEWAY=simulated
API_PROXY_DEBUG=false
API_REQUEST_DEBUG=false
```

Important: `DATABASE_URL` must end with `/bms_v1`. Remove any trailing `+` from the EasyPanel value before deploying.

The database values from EasyPanel are:

```text
MYSQL_HOST=bms_v1_syndic-db
MYSQL_PORT=3306
MYSQL_DATABASE=bms_v1
MYSQL_USER=mysql
```

Keep the database password and root password only in EasyPanel secrets or the ignored local env file.

### EasyPanel Compose app

Use `docker-compose.easypanel.yml` only if you create an EasyPanel Compose app. It runs separate `frontend` and `backend` containers against the same EasyPanel-managed MySQL service. Expose only the `frontend` service, port `3000`.

### Full-stack compose

Use `docker-compose.yml` if the deployment should create its own MySQL container. Set these environment variables in EasyPanel or in a local ignored `.env.docker` file. Use `.env.docker.example` as the template:

```text
APP_PUBLIC_URL=https://your-domain.example
SECRET_KEY=<long-random-secret>
MYSQL_DATABASE=syndic_ms
MYSQL_USER=syndic
MYSQL_PASSWORD=<strong-db-password>
MYSQL_ROOT_PASSWORD=<strong-root-password>
SESSION_COOKIE_SECURE=true
SESSION_COOKIE_SAMESITE=Lax
```

On first production deploy, open `/setup` and create the first super admin. For a clean demo baseline only, run this one-off command in the backend container:

```sh
python seed.py --reset
```

Do not run the reset command against production data you want to keep.

## Production configuration

For non-Docker deployments, set these before deploying:

```text
APP_ENV=production
SECRET_KEY=<long-random-secret>
REQUIRE_STRONG_SECRET=true
DATABASE_URL=mysql://user:password@host:3306/syndic_ms
CORS_ORIGINS=https://your-console-domain.example
SESSION_COOKIE_SECURE=true
SESSION_COOKIE_SAMESITE=Lax
CSRF_ENABLED=true
SECURITY_HSTS_SECONDS=31536000
API_INTERNAL_URL=http://127.0.0.1:5000  # Docker compose uses http://backend:5000
```

The API rejects wildcard CORS while sessions are credentialed, requires a CSRF
token on every unsafe `/api/*` method, disables remember-me cookies, and sets
baseline security headers.
