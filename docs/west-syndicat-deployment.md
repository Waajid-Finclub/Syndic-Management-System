# West Syndicat production database deployment

The repository contains the reviewed, populated SQLite snapshot at
`backend/instance/syndic_ms.db`. It is versioned intentionally so a new
environment can receive the exact approved West Syndicat dataset without
requiring the original source spreadsheets.

## Environment variables

Set these in EasyPanel before deploying. Do not commit the real values.

```dotenv
APP_PUBLIC_URL=https://staging.blockwise.net
CORS_ORIGINS=https://staging.blockwise.net
FRONTEND_PORT=3000

SECRET_KEY=<a newly generated random secret of at least 32 characters>
DATABASE_URL=mysql://<database-user>:<database-password>@bms_v1_syndic-db:3306/bms_v1

RESET_DATABASE_ON_STARTUP=false
WEST_SYNDICAT_MIGRATION_ON_STARTUP=replace_once
SESSION_COOKIE_SECURE=true
SESSION_COOKIE_SAMESITE=Lax
PAYMENT_GATEWAY=simulated
API_PROXY_DEBUG=false
API_REQUEST_DEBUG=false
```

`APP_PUBLIC_URL` and `CORS_ORIGINS` must be the exact public URL used by the
browser. `DATABASE_URL` may be supplied as either `mysql://` or
`mysql+pymysql://`; the application normalises the former. Do not leave a
trailing `+` after the database name.

Because the secret and database password shown in the deployment screenshot
were exposed outside the deployment system, replace both with newly generated
values before the next deployment.

## First deployment or database replacement

1. Take an EasyPanel/MySQL backup.
2. Deploy with `RESET_DATABASE_ON_STARTUP=false` and
   `WEST_SYNDICAT_MIGRATION_ON_STARTUP=replace_once`.
3. On startup, the backend creates current tables and replaces the target
   database with the committed West Syndicat snapshot. It records the snapshot
   hash in `application_data_migrations`; future restarts safely skip the
   migration while the flag remains set.

Do not enable `RESET_DATABASE_ON_STARTUP` afterwards: that option runs the old
development seeder and would overwrite the imported financial data.

## Local verification

To validate the versioned snapshot without changing a database:

```sh
cd backend
python migrate_west_syndicat.py --check
```

The committed snapshot includes the approved platform administrator, syndic
manager, co-owner account, financial ledger, invoices, payments, bank
transactions, expenses, and source-provenance rows.
