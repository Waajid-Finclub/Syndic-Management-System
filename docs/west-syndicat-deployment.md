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
2. Deploy this commit with `RESET_DATABASE_ON_STARTUP=false`.
3. Open an application terminal in the deployed container and run the command
   matching the deployment layout:

   Single-container image (`Dockerfile`):

   ```sh
   cd /app/backend
   python migrate_west_syndicat.py --check
   python migrate_west_syndicat.py --replace
   ```

   EasyPanel Compose backend service (`docker-compose.easypanel.yml`):

   ```sh
   cd /app
   python migrate_west_syndicat.py --check
   python migrate_west_syndicat.py --replace
   ```

The first command validates the committed snapshot only. The second creates
the current application tables and replaces the target database contents with
the West Syndicat snapshot. It refuses to replace a non-empty database unless
`--replace` is explicitly provided.

4. Restart the service once the migration reports completion.

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
