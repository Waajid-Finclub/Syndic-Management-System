#!/usr/bin/env python3
"""Load the reviewed West Syndicat database snapshot into the configured database.

This is a data migration, not a development seed.  It first creates any tables
introduced by the current application models, then copies the versioned SQLite
snapshot into the database selected by ``DATABASE_URL``.  Existing data is
never replaced unless ``--replace`` is supplied deliberately. ``--if-needed``
makes a replace-on-startup setup safe: after a successful copy is recorded,
future starts skip it.

Examples:
    python migrate_west_syndicat.py --check
    DATABASE_URL='mysql://user:password@host:3306/syndic_ms' \
      python migrate_west_syndicat.py --replace --if-needed
"""
from __future__ import annotations

import argparse
import hashlib
import sys
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import create_engine, inspect, select, text

from app import create_app
from app.extensions import db


BACKEND_ROOT = Path(__file__).resolve().parent
# This is deliberately outside ``instance/``: Docker ignores that directory
# because it is reserved for the mutable runtime database and uploads.
DEFAULT_SNAPSHOT = BACKEND_ROOT / 'seed_data' / 'west-syndicat-populated.db'
MIGRATION_ID = '2026-09-23-west-syndicat-financial-snapshot'
BATCH_SIZE = 250


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def snapshot_engine(snapshot: Path):
    return create_engine(f'sqlite:///{snapshot.resolve().as_posix()}')


def snapshot_summary(snapshot: Path) -> tuple[int, int]:
    engine = snapshot_engine(snapshot)
    try:
        inspector = inspect(engine)
        tables = inspector.get_table_names()
        with engine.connect() as connection:
            rows = sum(
                connection.execute(text(f'SELECT COUNT(*) FROM "{table}"')).scalar_one()
                for table in tables
            )
        return len(tables), rows
    finally:
        engine.dispose()


def ensure_migration_register(connection):
    connection.execute(text('''
        CREATE TABLE IF NOT EXISTS application_data_migrations (
            migration_id VARCHAR(160) PRIMARY KEY,
            snapshot_sha256 VARCHAR(64) NOT NULL,
            applied_at DATETIME NOT NULL
        )
    '''))


def target_has_data(connection) -> bool:
    inspector = inspect(connection)
    for table in db.metadata.sorted_tables:
        if not inspector.has_table(table.name):
            continue
        if connection.execute(select(table).limit(1)).first() is not None:
            return True
    return False


def already_applied(connection, snapshot_hash: str) -> bool:
    return connection.execute(
        text('''
            SELECT 1 FROM application_data_migrations
            WHERE migration_id = :migration_id AND snapshot_sha256 = :snapshot_sha256
        '''),
        {'migration_id': MIGRATION_ID, 'snapshot_sha256': snapshot_hash},
    ).first() is not None


def copy_snapshot(snapshot: Path, replace: bool, if_needed: bool) -> tuple[int, int, bool]:
    source = snapshot_engine(snapshot)
    source_inspector = inspect(source)
    source_tables = set(source_inspector.get_table_names())
    snapshot_hash = sha256(snapshot)
    copied_tables = 0
    copied_rows = 0

    try:
        db.create_all()
        with db.engine.begin() as target:
            ensure_migration_register(target)
            if if_needed and already_applied(target, snapshot_hash):
                return 0, 0, True
            if target_has_data(target) and not replace:
                raise RuntimeError(
                    'The target database already contains data. Re-run with --replace only after '
                    'you have a verified backup.'
                )

            if replace:
                # Children are cleared before parents so foreign-key constraints remain valid.
                for table in reversed(db.metadata.sorted_tables):
                    target.execute(table.delete())
                # This migration may be deliberately re-run after a fresh
                # backup; replace its audit marker rather than failing on its
                # primary key.
                target.execute(
                    text('DELETE FROM application_data_migrations WHERE migration_id = :migration_id'),
                    {'migration_id': MIGRATION_ID},
                )

            for table in db.metadata.sorted_tables:
                if table.name not in source_tables:
                    continue
                with source.connect() as source_connection:
                    rows = source_connection.execute(select(table)).mappings().all()
                if not rows:
                    continue
                for start in range(0, len(rows), BATCH_SIZE):
                    target.execute(table.insert(), [dict(row) for row in rows[start:start + BATCH_SIZE]])
                copied_tables += 1
                copied_rows += len(rows)

            target.execute(
                text('''
                    INSERT INTO application_data_migrations (migration_id, snapshot_sha256, applied_at)
                    VALUES (:migration_id, :snapshot_sha256, :applied_at)
                '''),
                {
                    'migration_id': MIGRATION_ID,
                    'snapshot_sha256': snapshot_hash,
                    'applied_at': datetime.now(timezone.utc),
                },
            )
    finally:
        source.dispose()
    return copied_tables, copied_rows, False


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--snapshot', type=Path, default=DEFAULT_SNAPSHOT)
    parser.add_argument('--replace', action='store_true', help='replace all existing application data')
    parser.add_argument(
        '--if-needed',
        action='store_true',
        help='skip when this exact snapshot has already been applied successfully',
    )
    parser.add_argument('--check', action='store_true', help='validate the committed snapshot only')
    args = parser.parse_args()
    if args.if_needed and not args.replace:
        parser.error('--if-needed requires --replace')

    snapshot = args.snapshot.resolve()
    if not snapshot.is_file():
        parser.error(f'Snapshot not found: {snapshot}')

    tables, rows = snapshot_summary(snapshot)
    print(f'Snapshot: {snapshot.name} ({snapshot.stat().st_size:,} bytes)')
    print(f'Contents: {tables} tables, {rows:,} rows, sha256 {sha256(snapshot)}')
    if args.check:
        print('Snapshot validation complete; no database changes made.')
        return 0

    app = create_app()
    with app.app_context():
        target_url = str(db.engine.url)
        if target_url.startswith('sqlite:///') and Path(target_url.removeprefix('sqlite:///')).resolve() == snapshot:
            raise RuntimeError('The target DATABASE_URL cannot be the snapshot file itself.')
        tables_copied, rows_copied, skipped = copy_snapshot(snapshot, args.replace, args.if_needed)

    if skipped:
        print('Migration already applied; no database changes made.')
        return 0
    print(f'Migration complete: {tables_copied} tables and {rows_copied:,} rows copied.')
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except RuntimeError as error:
        print(f'Migration failed: {error}', file=sys.stderr)
        raise SystemExit(1)
