"""Accounting records that complement the co-owner receivables ledger.

Invoices and payments remain the source of truth for each co-owner account.
These models retain the other side of a syndic's work: bank lines, expenses,
chart-of-account classification, journals and source-import provenance.
"""
from datetime import datetime, timezone

from ..extensions import db


ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'income', 'expense']
MATCH_STATUSES = ['unmatched', 'suggested', 'matched', 'excluded']
ENTRY_STATUSES = ['draft', 'posted', 'reversed']


class FinancialImportBatch(db.Model):
    """Immutable audit header for one imported source file."""
    __tablename__ = 'financial_import_batches'

    id = db.Column(db.Integer, primary_key=True)
    development_id = db.Column(db.Integer, db.ForeignKey('developments.id'), nullable=False, index=True)
    source_name = db.Column(db.String(255), nullable=False)
    source_kind = db.Column(db.String(40), nullable=False)
    source_sha256 = db.Column(db.String(64), nullable=True, index=True)
    row_count = db.Column(db.Integer, nullable=False, default=0)
    imported_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    notes = db.Column(db.Text, nullable=True)

    __table_args__ = (
        db.UniqueConstraint('development_id', 'source_name', 'source_sha256',
                            name='uq_financial_import_source'),
    )

    def to_dict(self):
        return {
            'id': self.id, 'source_name': self.source_name, 'source_kind': self.source_kind,
            'row_count': self.row_count,
            'imported_at': self.imported_at.isoformat() if self.imported_at else None,
            'notes': self.notes,
        }


class ChartAccount(db.Model):
    __tablename__ = 'chart_accounts'

    id = db.Column(db.Integer, primary_key=True)
    development_id = db.Column(db.Integer, db.ForeignKey('developments.id'), nullable=False, index=True)
    code = db.Column(db.String(20), nullable=False)
    name = db.Column(db.String(150), nullable=False)
    account_type = db.Column(db.String(20), nullable=False)
    is_control = db.Column(db.Boolean, nullable=False, default=False)
    is_active = db.Column(db.Boolean, nullable=False, default=True)

    __table_args__ = (db.UniqueConstraint('development_id', 'code', name='uq_chart_account_code'),)

    def to_dict(self):
        return {
            'id': self.id, 'code': self.code, 'name': self.name,
            'account_type': self.account_type, 'is_control': self.is_control,
            'is_active': self.is_active,
        }


class BankAccount(db.Model):
    __tablename__ = 'bank_accounts'

    id = db.Column(db.Integer, primary_key=True)
    development_id = db.Column(db.Integer, db.ForeignKey('developments.id'), nullable=False, index=True)
    name = db.Column(db.String(150), nullable=False)
    bank_name = db.Column(db.String(150), nullable=True)
    account_number = db.Column(db.String(80), nullable=True)
    currency_code = db.Column(db.String(10), nullable=False, default='MUR')
    chart_account_id = db.Column(db.Integer, db.ForeignKey('chart_accounts.id'), nullable=True)
    is_active = db.Column(db.Boolean, nullable=False, default=True)

    chart_account = db.relationship('ChartAccount')

    def to_dict(self):
        return {
            'id': self.id, 'name': self.name, 'bank_name': self.bank_name,
            'account_number': self.account_number, 'currency_code': self.currency_code,
            'chart_account_id': self.chart_account_id, 'is_active': self.is_active,
        }


class BankTransaction(db.Model):
    """A source bank line. Corrections are recorded as matches, never edits."""
    __tablename__ = 'bank_transactions'

    id = db.Column(db.Integer, primary_key=True)
    development_id = db.Column(db.Integer, db.ForeignKey('developments.id'), nullable=False, index=True)
    bank_account_id = db.Column(db.Integer, db.ForeignKey('bank_accounts.id'), nullable=False, index=True)
    import_batch_id = db.Column(
        db.Integer, db.ForeignKey('financial_import_batches.id'), nullable=False, index=True,
    )
    source_row = db.Column(db.Integer, nullable=False)
    instrument_id = db.Column(db.String(100), nullable=True)
    transaction_date = db.Column(db.Date, nullable=False, index=True)
    value_date = db.Column(db.Date, nullable=True)
    branch_code = db.Column(db.String(120), nullable=True)
    narrative = db.Column(db.Text, nullable=True)
    debit_amount = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    credit_amount = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    running_balance = db.Column(db.Numeric(14, 2), nullable=True)
    match_status = db.Column(db.String(20), nullable=False, default='unmatched', index=True)
    matched_payment_id = db.Column(db.Integer, db.ForeignKey('payments.id'), nullable=True, index=True)

    bank_account = db.relationship('BankAccount', backref='transactions')
    import_batch = db.relationship('FinancialImportBatch')
    matched_payment = db.relationship('Payment')

    __table_args__ = (
        db.UniqueConstraint('bank_account_id', 'import_batch_id', 'source_row',
                            name='uq_bank_transaction_source_row'),
    )

    def to_dict(self):
        return {
            'id': self.id, 'bank_account_id': self.bank_account_id,
            'transaction_date': self.transaction_date.isoformat() if self.transaction_date else None,
            'value_date': self.value_date.isoformat() if self.value_date else None,
            'narrative': self.narrative, 'debit_amount': float(self.debit_amount or 0),
            'credit_amount': float(self.credit_amount or 0),
            'running_balance': float(self.running_balance) if self.running_balance is not None else None,
            'match_status': self.match_status, 'matched_payment_id': self.matched_payment_id,
        }


class Expense(db.Model):
    __tablename__ = 'expenses'

    id = db.Column(db.Integer, primary_key=True)
    development_id = db.Column(db.Integer, db.ForeignKey('developments.id'), nullable=False, index=True)
    import_batch_id = db.Column(
        db.Integer, db.ForeignKey('financial_import_batches.id'), nullable=True, index=True,
    )
    bank_transaction_id = db.Column(db.Integer, db.ForeignKey('bank_transactions.id'), nullable=True, index=True)
    vendor_id = db.Column(db.Integer, db.ForeignKey('vendors.id'), nullable=True, index=True)
    chart_account_id = db.Column(db.Integer, db.ForeignKey('chart_accounts.id'), nullable=False, index=True)
    expense_date = db.Column(db.Date, nullable=False, index=True)
    description = db.Column(db.Text, nullable=False)
    amount = db.Column(db.Numeric(14, 2), nullable=False)
    source_row = db.Column(db.Integer, nullable=True)
    reconciliation_status = db.Column(db.String(20), nullable=False, default='unmatched')

    vendor = db.relationship('Vendor')
    chart_account = db.relationship('ChartAccount')
    bank_transaction = db.relationship('BankTransaction')

    def to_dict(self):
        return {
            'id': self.id, 'expense_date': self.expense_date.isoformat() if self.expense_date else None,
            'description': self.description, 'amount': float(self.amount or 0),
            'vendor_name': self.vendor.name if self.vendor else None,
            'account': self.chart_account.to_dict() if self.chart_account else None,
            'bank_transaction_id': self.bank_transaction_id,
            'reconciliation_status': self.reconciliation_status,
        }


class JournalEntry(db.Model):
    __tablename__ = 'journal_entries'

    id = db.Column(db.Integer, primary_key=True)
    development_id = db.Column(db.Integer, db.ForeignKey('developments.id'), nullable=False, index=True)
    import_batch_id = db.Column(
        db.Integer, db.ForeignKey('financial_import_batches.id'), nullable=True, index=True,
    )
    entry_date = db.Column(db.Date, nullable=False, index=True)
    reference = db.Column(db.String(60), nullable=False, index=True)
    description = db.Column(db.Text, nullable=False)
    status = db.Column(db.String(20), nullable=False, default='posted')
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    lines = db.relationship('JournalLine', backref='journal_entry', cascade='all, delete-orphan')

    __table_args__ = (db.UniqueConstraint('development_id', 'reference', name='uq_journal_reference'),)


class JournalLine(db.Model):
    __tablename__ = 'journal_lines'

    id = db.Column(db.Integer, primary_key=True)
    journal_entry_id = db.Column(db.Integer, db.ForeignKey('journal_entries.id'), nullable=False, index=True)
    chart_account_id = db.Column(db.Integer, db.ForeignKey('chart_accounts.id'), nullable=False, index=True)
    debit_amount = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    credit_amount = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    memo = db.Column(db.String(255), nullable=True)

    chart_account = db.relationship('ChartAccount')

