#!/usr/bin/env python3
"""Import the approved West Terraces financial history into a fresh local database.

The importer is deliberately repeatable. It reads the supplied files, records
their hash and row count, and preserves the bank CSV as immutable source lines.
Use --dry-run first; --reset is required before any destructive replacement.
"""
import argparse
import csv
import hashlib
import os
import re
from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path

import openpyxl
import xlrd

from app import create_app
from app.extensions import db
from app.models import (
    BankAccount, BankTransaction, Block, ChartAccount, Development,
    DevelopmentSettings, Expense, FinancialImportBatch, Invoice, InvoiceLine,
    JournalEntry, JournalLine, Payment, ResidentPreference, Subscription,
    SubscriptionPlan, Unit, UnitOwnership, User,
)
from app.routes.setup import seed_reference_data
from app.services.ledger import allocate_payment

SOURCE_DIR = Path(__file__).resolve().parents[1] / 'West Syndicat Back Data'
DEVELOPMENT_CODE = 'WEST-TERRACES'
DEVELOPMENT_NAME = 'Syndicat des Coproprietaires West Terraces'
ACCOUNT_IDENTITIES = {
    'platform': ('West', 'Platform Admin', 'west.admin@syndicms.mu', 'super_admin'),
    'syndic': ('West', 'Syndic Manager', 'syndic@westterraces.mu', 'syndic_manager'),
    'owner': ('Dyall', 'Mohinder', 'owner.s1-01@westterraces.mu', 'co_owner'),
}
ZERO = Decimal('0.00')

CHART = [
    ('1000', 'SBM Bank Account', 'asset', True),
    ('1100', 'Trade Receivables - Co-owners', 'asset', True),
    ('1500', 'Property, Plant and Equipment', 'asset', False),
    ('2000', 'Trade Payables', 'liability', True),
    ('3000', 'Accumulated Fund', 'equity', False),
    ('4000', 'Co-owner Contributions', 'income', False),
    ('4010', 'Special Levies / Calls for Funds', 'income', False),
    ('6100', 'Bank Charges', 'expense', False),
    ('6110', 'Cleaning Expenses', 'expense', False),
    ('6120', 'Electricity Charges', 'expense', False),
    ('6130', 'Gardening Expenses', 'expense', False),
    ('6140', 'Insurance Expenses', 'expense', False),
    ('6150', 'Lift Maintenance', 'expense', False),
    ('6190', 'Other Operating Expenses', 'expense', False),
]
EXPENSE_ACCOUNTS = {
    'BANK CHARGES': '6100',
    'CLEANING EXP.': '6110',
    'ELECTRICITY CHARGES': '6120',
    'GARDENING EXPENSES': '6130',
    'INSURANCE EXPENSES': '6140',
    'LIFT MAINTENANCE': '6150',
}


def money(value, default=ZERO):
    if value in (None, '', '-', '?'):
        return default
    if isinstance(value, Decimal):
        return value.quantize(Decimal('0.01'))
    try:
        return Decimal(str(value).replace(',', '').replace('"', '').strip()).quantize(Decimal('0.01'))
    except (InvalidOperation, ValueError):
        return default


def date_value(value):
    if value is None or value == '':
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    for pattern in ('%d-%m-%Y', '%Y-%m-%d', '%d/%m/%Y'):
        try:
            return datetime.strptime(str(value).strip(), pattern).date()
        except ValueError:
            continue
    return None


def text(value):
    return str(value or '').strip()


def person_name(value):
    cleaned = re.sub(r'\s*\((Jan|Jul).*?\)', '', text(value), flags=re.I)
    return re.sub(r'\s+', ' ', cleaned).strip().title()


def key(value):
    return re.sub(r'[^a-z0-9]', '', text(value).lower())


def unit_suffix(value):
    parts = re.findall(r'\d+', text(value))
    return parts[-1].zfill(2) if parts else ''


def account_credentials():
    """Read one-time import passwords without storing them in source control."""
    password_keys = {
        'platform': 'WEST_PLATFORM_ADMIN_PASSWORD',
        'syndic': 'WEST_SYNDIC_MANAGER_PASSWORD',
        'owner': 'WEST_CO_OWNER_PASSWORD',
    }
    missing = [name for name, env_key in password_keys.items() if not os.environ.get(env_key)]
    if missing:
        variables = ', '.join(password_keys[name] for name in missing)
        raise RuntimeError(f'Missing required import password environment variable(s): {variables}')
    return {
        name: (*identity[:3], os.environ[password_keys[name]], identity[3])
        for name, identity in ACCOUNT_IDENTITIES.items()
    }


def file_hash(path):
    digest = hashlib.sha256()
    with path.open('rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def source_manifest(root):
    """Return all sources and their physical row counts, including legacy XLS."""
    rows = []
    for path in sorted(root.iterdir()):
        if not path.is_file():
            continue
        suffix = path.suffix.lower()
        if suffix == '.csv':
            with path.open('r', encoding='utf-8-sig', errors='replace', newline='') as handle:
                count = sum(1 for _ in csv.reader(handle))
        elif suffix == '.xlsx':
            book = openpyxl.load_workbook(path, read_only=True, data_only=True)
            count = sum(sheet.max_row for sheet in book.worksheets)
        elif suffix == '.xls':
            book = xlrd.open_workbook(path, on_demand=True)
            count = sum(sheet.nrows for sheet in book.sheets())
        else:
            continue
        rows.append({'path': path, 'rows': count, 'sha256': file_hash(path)})
    return rows


def tenant_rows(path):
    book = openpyxl.load_workbook(path, read_only=True, data_only=True)
    sheet = book['SUMMARY']
    header_index = next(
        index for index, row in enumerate(sheet.iter_rows(values_only=True), start=1)
        if text(row[0]).lower() == 'sl no.'
    )
    records = {}
    for row in sheet.iter_rows(min_row=header_index + 1, values_only=True):
        owner, lot, area, monthly, annual = row[1], row[2], row[3], row[4], row[5]
        if not text(lot):
            continue
        lot = re.sub(r'\s+', '', text(lot)).replace('--', '-')
        if not text(owner):
            continue
        record = records.setdefault(lot, {
            'label': lot, 'owner': person_name(owner), 'area': money(area),
            'periods': [], 'opening_receivable': ZERO, 'opening_credit': ZERO,
        })
        record['area'] = money(area, record['area'])
        if money(annual) > ZERO:
            record['periods'].append({
                'owner': person_name(owner), 'monthly': money(monthly),
                'annual': money(annual),
            })
        # Source labels vary slightly between workbooks. These columns are 2024 carry-forwards.
        if len(row) > 8:
            record['opening_receivable'] += money(row[8])
        if len(row) > 9:
            record['opening_credit'] += abs(money(row[9]))
    return list(records.values())


def special_levies(path):
    book = openpyxl.load_workbook(path, read_only=True, data_only=True)
    result = []
    ignored = {'RECONCILIATION - TENANTS FUND', 'SUMMARY'}
    for sheet in book.worksheets:
        if sheet.title in ignored:
            continue
        rows = list(sheet.iter_rows(values_only=True))
        if not rows or text(rows[0][0]).lower() != 'date':
            continue
        for row in rows[1:]:
            when = date_value(row[0])
            call = money(row[5] if len(row) > 5 else None)
            if when and call > ZERO:
                result.append({
                    'unit_hint': sheet.title, 'date': when, 'amount': call,
                    'description': text(row[2]) or text(row[1]) or 'Call for funds',
                })
    return result


def bank_rows(path):
    with path.open('r', encoding='utf-8-sig', errors='replace', newline='') as handle:
        rows = list(csv.reader(handle))
    header_index = next(index for index, row in enumerate(rows) if row and row[0] == 'Instrument ID')
    headers = rows[header_index]
    data = []
    for source_row, row in enumerate(rows[header_index + 1:], start=header_index + 2):
        row += [''] * (len(headers) - len(row))
        values = dict(zip(headers, row))
        when = date_value(values.get('Transaction Date'))
        if when is None:
            continue
        data.append({
            'source_row': source_row, 'instrument_id': text(values.get('Instrument ID')),
            'transaction_date': when, 'value_date': date_value(values.get('Value Date')),
            'branch_code': text(values.get('Branch Code')), 'narrative': text(values.get('Remarks')),
            'debit': money(values.get('Debit Amount')), 'credit': money(values.get('Credit Amount')),
            'balance': money(values.get('Balance'), None),
        })
    return data


def allocate_shares(rows):
    total_area = sum((row['area'] for row in rows), ZERO)
    raw = []
    for row in rows:
        ratio = row['area'] / total_area if total_area else Decimal('1') / Decimal(len(rows))
        exact = ratio * Decimal('10000')
        raw.append((row, int(exact), exact % 1))
    remaining = 10000 - sum(item[1] for item in raw)
    for row, floor_value, _fraction in raw:
        row['share_value'] = floor_value
    for row, _floor_value, _fraction in sorted(raw, key=lambda item: item[2], reverse=True)[:remaining]:
        row['share_value'] += 1


def add_journal(development_id, batch_id, entry_date, reference, description, debit_account, credit_account, amount):
    entry = JournalEntry(
        development_id=development_id, import_batch_id=batch_id, entry_date=entry_date,
        reference=reference, description=description, status='posted',
    )
    db.session.add(entry)
    db.session.flush()
    db.session.add_all([
        JournalLine(journal_entry_id=entry.id, chart_account_id=debit_account.id,
                    debit_amount=amount, credit_amount=ZERO),
        JournalLine(journal_entry_id=entry.id, chart_account_id=credit_account.id,
                    debit_amount=ZERO, credit_amount=amount),
    ])
    return entry


def account_for_record(record, unit):
    owner = person_name(record['owner'])
    first, *rest = owner.split(' ')
    user = User(
        first_name=first or 'Co-owner',
        last_name=' '.join(rest) or None,
        email=f'record.{key(unit.label)}@westterraces.imported',
        role='co_owner',
        status='invited',
        development_id=unit.development_id,
        unit_label=unit.label,
        whatsapp_enabled=False,
    )
    db.session.add(user)
    db.session.flush()
    db.session.add(UnitOwnership(
        unit_id=unit.id, user_id=user.id, ownership_percent=Decimal('100.0000'),
        is_primary_contact=True, start_date=date(2025, 1, 1),
    ))
    return user


def match_unit(narrative, units):
    candidate = key(narrative)
    for unit, owner in units:
        if key(unit.label) and key(unit.label) in candidate:
            return unit
        if owner and key(owner) and key(owner) in candidate:
            return unit
    return None


def import_data(root, reset):
    credentials = account_credentials()
    manifest = source_manifest(root)
    tenant_file = root / 'WEST SYNDICAT - TENANT SUMMARY SHEET.xlsx'
    reconciliation_file = root / 'RECONCILIATION - TENANTS ACCOUNTS.xlsx'
    bank_file = root / 'OpTransactionHistoryUX5_csv19-01-2026.csv'
    expense_file = root / 'EXPENSES RECONCILIATION.xlsx'
    tenants = tenant_rows(tenant_file)
    levies = special_levies(reconciliation_file)
    transactions = bank_rows(bank_file)

    if reset:
        db.drop_all()
    db.create_all()
    if Development.query.filter_by(code=DEVELOPMENT_CODE).first():
        raise RuntimeError('West Terraces already exists. Re-run with --reset only after a new backup.')
    seed_reference_data()

    development = Development(
        code=DEVELOPMENT_CODE, name=DEVELOPMENT_NAME, development_type='apartment',
        country='Mauritius', status='active', pipeline_stage='go_live',
        syndic_manager_name='West Syndic Manager', syndic_manager_email=credentials['syndic'][2],
        unit_count=len(tenants), user_count=len(tenants) + 2,
    )
    db.session.add(development)
    db.session.flush()
    db.session.add(DevelopmentSettings(
        development_id=development.id, currency_code='MUR', billing_day=1,
        arrears_grace_days=15, allow_online_payments=False, allow_resident_voting=False,
    ))
    plan = SubscriptionPlan.query.filter_by(code='premium').first() or SubscriptionPlan.query.first()
    if plan:
        db.session.add(Subscription(
            development_id=development.id, plan_id=plan.id, setup_fee_amount=plan.setup_fee_amount,
            monthly_unit_rate=plan.monthly_unit_rate, vat_rate=plan.vat_rate,
            active_units_count=len(tenants), status='active', start_date=date(2025, 1, 1),
        ))
    block = Block(development_id=development.id, name='West Terraces', floors=1)
    db.session.add(block)
    allocate_shares(tenants)

    accounts = {}
    for code, name, account_type, is_control in CHART:
        account = ChartAccount(
            development_id=development.id, code=code, name=name, account_type=account_type,
            is_control=is_control,
        )
        db.session.add(account)
        accounts[code] = account
    db.session.flush()

    batches = {}
    for item in manifest:
        batch = FinancialImportBatch(
            development_id=development.id, source_name=item['path'].name,
            source_kind='bank_csv' if item['path'].suffix.lower() == '.csv' else 'workbook',
            source_sha256=item['sha256'], row_count=item['rows'],
            notes='Source retained outside git; imported records retain this provenance.',
        )
        db.session.add(batch)
        batches[item['path'].name] = batch
    db.session.flush()

    units_by_label, unit_owner_names = {}, []
    owner_users = {}
    for record in tenants:
        unit = Unit(
            development_id=development.id, block_id=block.id, label=record['label'],
            unit_type='T2', area_sqm=record['area'], share_value=record['share_value'],
            monthly_charge=record['periods'][-1]['monthly'] if record['periods'] else ZERO,
        )
        db.session.add(unit)
        db.session.flush()
        owner_users[unit.label] = account_for_record(record, unit)
        units_by_label[unit.label] = unit
        unit_owner_names.append((unit, record['owner']))

        for index, period in enumerate(record['periods'], start=1):
            issued = date(2025, 1, 1) if index == 1 else date(2025, 7, 1)
            reference = f'WT-SC-{key(unit.label).upper()}-{index}'
            invoice = Invoice(
                development_id=development.id, unit_id=unit.id, reference=reference,
                title=f'2025 service contribution - {"Jan to Jun" if index == 1 else "Jul to Dec"}',
                invoice_type='service_charge', period_label='2025',
                issue_date=issued, due_date=issued, total_amount=period['annual'], status='issued',
            )
            db.session.add(invoice)
            db.session.flush()
            db.session.add(InvoiceLine(
                invoice_id=invoice.id, description=invoice.title, quantity=Decimal('1.00'),
                unit_rate=period['annual'], amount=period['annual'], sort_order=1,
            ))
            add_journal(development.id, batches[tenant_file.name].id, issued, f'J-{reference}',
                        invoice.title, accounts['1100'], accounts['4000'], period['annual'])

        if record['opening_receivable'] > ZERO:
            amount = record['opening_receivable']
            reference = f'WT-OPEN-AR-{key(unit.label).upper()}'
            invoice = Invoice(
                development_id=development.id, unit_id=unit.id, reference=reference,
                title='Opening receivable balance at 01 Jan 2025', invoice_type='other',
                period_label='Opening 2025', issue_date=date(2025, 1, 1), due_date=date(2025, 1, 1),
                total_amount=amount, status='issued',
            )
            db.session.add(invoice)
            add_journal(development.id, batches[reconciliation_file.name].id, date(2025, 1, 1),
                        f'J-{reference}', invoice.title, accounts['1100'], accounts['3000'], amount)

    db.session.flush()
    # Special levies carry their exact date and amount from each co-owner reconciliation sheet.
    levy_sequence = defaultdict(int)
    for levy in levies:
        unit = next((candidate for label, candidate in units_by_label.items()
                     if unit_suffix(label) == unit_suffix(levy['unit_hint'])
                     or key(label) in key(levy['unit_hint'])), None)
        if unit is None:
            continue
        levy_sequence[unit.id] += 1
        reference = f'WT-LEVY-{key(unit.label).upper()}-{levy_sequence[unit.id]:02d}'
        invoice = Invoice(
            development_id=development.id, unit_id=unit.id, reference=reference,
            title=levy['description'][:200], invoice_type='special_levy', period_label='2025',
            issue_date=levy['date'], due_date=levy['date'], total_amount=levy['amount'], status='issued',
        )
        db.session.add(invoice)
        db.session.flush()
        db.session.add(InvoiceLine(
            invoice_id=invoice.id, description=invoice.title, quantity=Decimal('1.00'),
            unit_rate=levy['amount'], amount=levy['amount'], sort_order=1,
        ))
        add_journal(development.id, batches[reconciliation_file.name].id, levy['date'], f'J-{reference}',
                    invoice.title, accounts['1100'], accounts['4010'], levy['amount'])

    bank = BankAccount(
        development_id=development.id, name='SBM Operating Account',
        bank_name='State Bank (Mauritius) Ltd', account_number='62030100192715',
        currency_code='MUR', chart_account_id=accounts['1000'].id,
    )
    db.session.add(bank)
    db.session.flush()
    bank_batch = batches[bank_file.name]
    matched_receipts = 0
    for row in transactions:
        bank_line = BankTransaction(
            development_id=development.id, bank_account_id=bank.id, import_batch_id=bank_batch.id,
            source_row=row['source_row'], instrument_id=row['instrument_id'],
            transaction_date=row['transaction_date'], value_date=row['value_date'],
            branch_code=row['branch_code'], narrative=row['narrative'],
            debit_amount=row['debit'], credit_amount=row['credit'], running_balance=row['balance'],
        )
        db.session.add(bank_line)
        db.session.flush()
        unit = match_unit(row['narrative'], unit_owner_names) if row['credit'] > ZERO else None
        if unit is None:
            continue
        payment = Payment(
            development_id=development.id, unit_id=unit.id, user_id=owner_users[unit.label].id,
            reference=f'WT-BANK-{row["source_row"]:04d}', amount=row['credit'],
            method_label='SBM bank transfer', status='confirmed', gateway_name='SBM statement import',
            gateway_reference=row['instrument_id'] or f'row-{row["source_row"]}',
            paid_at=datetime.combine(row['transaction_date'], datetime.min.time()),
        )
        db.session.add(payment)
        db.session.flush()
        allocate_payment(payment)
        bank_line.matched_payment_id = payment.id
        bank_line.match_status = 'matched'
        add_journal(development.id, bank_batch.id, row['transaction_date'], f'J-{payment.reference}',
                    f'Bank receipt: {row["narrative"][:160]}', accounts['1000'], accounts['1100'], row['credit'])
        matched_receipts += 1

    # Expense workbook classifies debit-side activity. Exact date/amount candidates are linked to the bank feed.
    expense_book = openpyxl.load_workbook(expense_file, read_only=True, data_only=True)
    expense_batch = batches[expense_file.name]
    used_bank_lines = set()
    expense_count = 0
    for sheet in expense_book.worksheets:
        account = accounts.get(EXPENSE_ACCOUNTS.get(sheet.title, '6190'), accounts['6190'])
        header = next((i for i, row in enumerate(sheet.iter_rows(values_only=True), start=1)
                       if text(row[0]).lower() == 'date'), None)
        if header is None:
            continue
        for source_row, row in enumerate(sheet.iter_rows(min_row=header + 1, values_only=True), start=header + 1):
            when, amount = date_value(row[0]), money(row[4] if len(row) > 4 else None)
            if not when or amount <= ZERO:
                continue
            description = text(row[2]) or text(row[1]) or sheet.title
            bank_line = BankTransaction.query.filter_by(
                bank_account_id=bank.id, transaction_date=when, debit_amount=amount,
            ).order_by(BankTransaction.id).all()
            candidate = next((line for line in bank_line if line.id not in used_bank_lines), None)
            if candidate:
                used_bank_lines.add(candidate.id)
            expense = Expense(
                development_id=development.id, import_batch_id=expense_batch.id,
                bank_transaction_id=candidate.id if candidate else None, chart_account_id=account.id,
                expense_date=when, description=description, amount=amount, source_row=source_row,
                reconciliation_status='matched' if candidate else 'suggested',
            )
            db.session.add(expense)
            add_journal(development.id, expense_batch.id, when, f'J-WT-EXP-{expense_count + 1:04d}',
                        description[:200], account, accounts['1000'], amount)
            expense_count += 1

    # Replace the first imported record with the approved real co-owner login.
    owner = owner_users.get('S1-01') or next(iter(owner_users.values()))
    owner.first_name, owner.last_name = credentials['owner'][0], credentials['owner'][1]
    owner.email, owner.status = credentials['owner'][2], 'active'
    owner.set_password(credentials['owner'][3])
    owner.unit_label = owner.unit_label
    db.session.add(ResidentPreference(user_id=owner.id, push_notifications=True))

    for account_key in ('platform', 'syndic'):
        first, last, email, password, role = credentials[account_key]
        user = User(
            first_name=first, last_name=last, email=email, role=role, status='active',
            development_id=development.id if role != 'super_admin' else None,
            mfa_enabled=True, whatsapp_enabled=False,
        )
        user.set_password(password)
        db.session.add(user)

    development.user_count = User.query.filter_by(development_id=development.id).count() + 1
    db.session.commit()
    return {
        'development': development.name, 'units': len(units_by_label), 'bank_transactions': len(transactions),
        'matched_receipts': matched_receipts, 'expenses': expense_count,
        'invoices': Invoice.query.filter_by(development_id=development.id).count(),
        'payments': Payment.query.filter_by(development_id=development.id).count(),
        'journal_entries': JournalEntry.query.filter_by(development_id=development.id).count(),
        'sources': len(manifest),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source-dir', type=Path, default=SOURCE_DIR)
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--reset', action='store_true')
    args = parser.parse_args()
    if not args.source_dir.is_dir():
        raise SystemExit(f'Source folder not found: {args.source_dir}')
    manifest = source_manifest(args.source_dir)
    print('Validated source files:')
    for item in manifest:
        print(f'  {item["path"].name}: {item["rows"]} rows, sha256 {item["sha256"][:12]}...')
    tenants = tenant_rows(args.source_dir / 'WEST SYNDICAT - TENANT SUMMARY SHEET.xlsx')
    print(f'Extracted {len(tenants)} distinct units and {len(bank_rows(args.source_dir / "OpTransactionHistoryUX5_csv19-01-2026.csv"))} bank lines.')
    if args.dry_run:
        print('Dry run complete; no database changes made.')
        return
    if not args.reset:
        raise SystemExit('Refusing to replace a database without --reset.')
    app = create_app()
    with app.app_context():
        result = import_data(args.source_dir, reset=True)
    print('Import complete:')
    for name, value in result.items():
        print(f'  {name}: {value}')


if __name__ == '__main__':
    main()

