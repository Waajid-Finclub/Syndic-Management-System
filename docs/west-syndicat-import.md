# West Terraces financial import

The local database is populated from the untracked West Syndicat Back Data folder
by backend/import_west_syndicat.py.

## What is imported

- The 2025 tenant summary becomes the unit registry and service-charge invoices.
- Co-owner reconciliation sheets add dated special-levy invoices.
- The SBM CSV becomes immutable bank transactions.
- Strongly identifiable bank credits become matched co-owner receipts; the rest
  stay visible as unmatched bank lines for controlled reconciliation.
- The expense reconciliation workbook becomes classified expenses and balanced
  journal entries.
- Every one of the seven supplied files is recorded with its SHA-256 hash and
  source row count. The two 2025 account workbooks and legacy XLS archive are
  retained as provenance documents; the final-account workbook is the
  reporting authority.

## Safe refresh

Run a validation first:

~~~powershell
cd backend
$env:WEST_PLATFORM_ADMIN_PASSWORD='<platform-admin-password>'
$env:WEST_SYNDIC_MANAGER_PASSWORD='<syndic-manager-password>'
$env:WEST_CO_OWNER_PASSWORD='<co-owner-password>'
python import_west_syndicat.py --dry-run
~~~

After creating a database backup, explicitly replace the local database:

~~~powershell
cd backend
$env:WEST_PLATFORM_ADMIN_PASSWORD='<platform-admin-password>'
$env:WEST_SYNDIC_MANAGER_PASSWORD='<syndic-manager-password>'
$env:WEST_CO_OWNER_PASSWORD='<co-owner-password>'
python import_west_syndicat.py --reset
~~~

The reset command intentionally drops all tables before recreating West
Terraces. It must never be used against a production database without a
separately verified backup and reconciliation sign-off.

The raw source folder and local backups are ignored by Git. The reviewed,
populated SQLite snapshot is intentionally versioned at
`backend/instance/syndic_ms.db`; use `migrate_west_syndicat.py` to load that
approved snapshot into a deployment database.

