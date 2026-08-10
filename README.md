# SyndicMS — Syndic Management System

Multi-tenant SaaS platform for Mauritian syndic (co-ownership) management.

This repository currently contains the **Super Admin Console** — the platform-level
workspace described as the "Master Admin / Multi-Property Console" in the SMS
architecture document. The syndic manager console and the resident mobile app are
separate deliverables and are not built here yet.

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

## Demo data

```powershell
cd backend
python seed.py --reset
```

This builds a 127-property portfolio: the six named client properties from the
console design, plus 121 synthetic developments balanced so the platform totals
land exactly on 8,420 units, 3,200 parking bays, 1,850 storage units and 6,891
portal users, with the Basic 15 / Silver 72 / Premium 40 plan mix. Every headline
figure in the console is a real sum over real rows — nothing is hardcoded.

Seed credentials:

```text
admin@syndicms.mu / SyndicAdmin2026!
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

Backend smoke test and seed:

```powershell
cd backend
python seed.py --reset
```

Frontend checks:

```powershell
cd frontend
npm run verify
```

## Production configuration

Set these before deploying:

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
API_INTERNAL_URL=http://127.0.0.1:5000
```

The API rejects wildcard CORS while sessions are credentialed, requires a CSRF
token on every unsafe `/api/*` method, disables remember-me cookies, and sets
baseline security headers.
