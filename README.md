# SyndicMS — Syndic Management System

Multi-tenant SaaS platform for Mauritian syndic (co-ownership) management.

It is deliberately a separate codebase from the Ebene Mews Building Management
System (BMS). The two products share a design language, not a database.

## The three layers

The platform is one codebase serving three consoles. Each has its own sign-in
surface, its own module catalog and its own role family, and **no two of the
three logins overlap** — an account of one layer is refused by the other two.

| Layer | Console | URL | Roles | Allocates |
|---|---|---|---|---|
| 1 | **Master Admin** — the SaaS operator | `/` | `super_admin`, `platform_admin`, `support_user`, `auditor` | The first Syndic Admin account per client, against the subscription's seat allowance |
| 2 | **Syndic Admin** — the client's own management team | `/syndic` | `syndic_manager`, `finance_officer`, `assistant_manager`, `board_member` | Co-owner accounts, by invitation against a specific unit |
| 3 | **Co-Owner** — the resident PWA | `/app` | `co_owner` | — |

The chain is one-directional: each layer allocates accounts exactly one level
down, and never sideways or up.

```
Master Admin ──creates──▶ Client property + subscription (N admin seats)
     │
     └──provisions──▶ Syndic Manager  (first account; seat-enforced)
                            │
                            ├──adds──▶ Finance Officer / Assistant / Board Member
                            │          (up to the seat cap)
                            │
                            └──invites──▶ Co-Owner  (code bound to one unit)
```

Why the two handoffs differ:

* **Layer 1 → 2 is a provisioned password.** A syndic manager is a commercial
  relationship with a signed contract naming a person, and that person needs to
  sign in on go-live day without an email round trip.
* **Layer 2 → 3 is an invitation code.** A co-owner account can read a financial
  history and cast a share-weighted vote, so the manager who administers the
  building must never know its password. Nothing is created until the co-owner
  accepts, and a revoked invitation leaves no account behind.

A `super_admin` can open any client's syndic console for support. The session
stays theirs — only the scope changes — a persistent banner says so, and start,
stop and every write in between are written to that client's audit log.

## Architecture

- `frontend/` — Next.js 16 (App Router, React 19, TypeScript), all three surfaces.
- `backend/` — Flask API serving `/api/*` only: auth, models, business logic.

The browser always calls same-origin `/api/*`; the Next.js route handler at
`frontend/src/app/api/[...path]/route.ts` proxies those requests to Flask.

| API prefix | Layer | Access control |
|---|---|---|
| `/api/auth`, `/api/developments`, `/api/client-admins`, `/api/subscriptions`, … | 1 | `permissions.ROLE_MATRIX` |
| `/api/syndic/*` | 2 | `routes/syndic/_access` — scoped to one development, `permissions.SYNDIC_ROLE_MATRIX` |
| `/api/resident/*` | 3 | `routes/resident/_access` — scoped to the caller's own unit |

No endpoint under `/api/syndic` takes a development id. The scope comes from the
signed-in account (or an operator's impersonation session) and never from the
request, so one client's admin cannot reach another client's building by editing
a URL.

## Design

All three surfaces reuse the BMS design system so the products read as one platform:
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

Master admin console — `/login`:

```text
super_admin     admin@syndicms.mu / AdminConsole2026!
platform_admin  platform@syndicms.mu / AdminConsole2026!
support_user    support@syndicms.mu / AdminConsole2026!
auditor         auditor@syndicms.mu / AdminConsole2026!
```

Syndic admin console — `/syndic/login`, all scoped to Starter Residence:

```text
syndic_manager     manager@syndicms.mu / SyndicAdmin2026!
finance_officer    finance@syndicms.mu / SyndicAdmin2026!
assistant_manager  assistant@syndicms.mu / SyndicAdmin2026!
board_member       board@syndicms.mu / SyndicAdmin2026!
```

Co-owner app — `/app/login`:

```text
co_owner  coowner@syndicms.mu / ResidentApp2026!   (unit A-101)
```

Each layer uses a different seeded password, and each login endpoint rejects the
other two layers' accounts. Unit `A-102` is deliberately left unallocated so the
co-owner invitation flow has a target on a fresh install.

On an empty database with no seed, the app redirects to `/setup` to create the
first super admin.

## Screens

### Layer 1 — Master Admin console

| Route | Screen |
|---|---|
| `/dashboard` | Platform Overview — KPIs, revenue trend, onboarding pipeline, recent clients |
| `/properties` | Client Properties — registry, status tabs, portfolio totals, add client, open a support session |
| `/onboarding` | Onboarding Workflow — 8-stage progress per client, 15-item checklist template |
| `/client-admins` | **Client Admins — provision each client's syndic accounts against its seat allowance** |
| `/users` | Users & Roles — every account across all three layers, grouped by layer |
| `/subscriptions` | Subscriptions & Pricing — plan catalog, MRR/ARR/churn/ARPC/LTV, contracts |
| `/feature-flags` | Feature Flags — global switches, plan gating, per-property overrides |
| `/monitoring` | System Monitoring — health tiles with targets, recent alerts |
| `/audit` | Audit Log — filterable append-only trail, CSV export |
| `/whatsapp` | WhatsApp Status — delivery stats, templates, connected numbers |
| `/integrations` | API & Integrations — connectors, API keys, endpoint catalog |

### Layer 2 — Syndic Admin console

| Route | Screen |
|---|---|
| `/syndic/dashboard` | Development Overview — arrears, open jobs, funds, upcoming meetings |
| `/syndic/registry` | Property Registry — blocks, units, parking, storage, facilities, share meter |
| `/syndic/co-owners` | **Co-Owners — invitations, CSV bulk import, accounts, occupancy records** |
| `/syndic/finance` | Billing & Payments — invoices, billing runs, receipts, arrears, aging |
| `/syndic/funds` | Funds — reserve, sinking, maintenance, operating |
| `/syndic/maintenance` | Maintenance queue and per-request timeline, vendor assignment, messages |
| `/syndic/vendors` | Vendors — the contractors this development can assign work to |
| `/syndic/governance` | Meetings & Voting — resolutions, share-weighted tallies, results |
| `/syndic/community` | Notices, facility bookings, visitor passes |
| `/syndic/documents` | Document library — shared folders and per-unit private paperwork |
| `/syndic/team` | Team & Access — seat allowance, colleagues, role matrix |
| `/syndic/settings` | Development Settings — billing day, grace, penalty; what the operator holds |

### Layer 3 — Co-Owner app

Unchanged: `/app/home`, `/app/finance`, `/app/report`, `/app/coop`, `/app/account`
and their sub-screens.

## Roles

Access is a capability matrix (view / create / edit / delete / export) over each
layer's own module catalog — see `backend/app/permissions.py`.

* **Layer 1** — ten modules, four roles. `super_admin` holds everything plus
  client impersonation.
* **Layer 2** — twelve modules, four roles, always scoped to one development. A
  `syndic_manager` holds the full matrix; the others are narrower, and a manager
  cannot promote anyone to manager (only the operator can).
* **Layer 3** — no modules. A co-owner has one unit, and
  `permissions.RESIDENT_FEATURES` lists what that entitles them to.

Vendors and building occupants hold **no login**: a vendor is a record work is
assigned to, and an occupancy record exists so the office has a name and number
for maintenance access and gate passes. Service charges are the owner's
liability and votes follow the owner's title, so the resident app is co-owners
only.

## Seat allowance

Each subscription plan grants a number of Syndic Admin seats (Basic 2, Silver 5,
Premium 12). A per-client override on the subscription survives changes to the
plan catalog, so a negotiated allowance is never silently rewritten.

An **active** layer 2 account occupies a seat; a suspended one does not — which
is what lets a client park a departing colleague's account without paying for
the seat or losing the history attached to it. The cap is enforced in one
function (`routes/client_admins.seat_state`) shared by both consoles.

## Verification

Backend fresh-baseline smoke tests:

```powershell
cd backend
python seed.py --reset
python tests/test_syndic_api.py     # layer isolation, allocation chain, scoping, billing loop
python seed.py --reset
python tests/test_resident_api.py   # co-owner app on a fresh baseline
```

`test_syndic_api.py` proves the properties the three-layer split depends on:
each login endpoint accepts only its own layer; the seat cap refuses an extra
admin and `/api/users` cannot be used to bypass it; a syndic sees only its own
development and another client's record 404s rather than 403s; an invitation
issues, redeems once, and binds the new account to the invited unit; and a
billing run raises invoices that a receipt then settles oldest-due-first.

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

Expose container port `3000` and make the EasyPanel domain destination `http://bms_v1-syndic:3000/`. `FRONTEND_PORT=3000` intentionally overrides EasyPanel's injected `PORT` value so the app and domain target stay aligned. Point the domain `https://syndic.blocwise.net` at path `/`. The frontend proxies `/api/*` to `http://127.0.0.1:5000`, so the backend does not need a public route.

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
