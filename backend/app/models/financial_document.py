"""Immutable financial-document snapshots.

A report can be regenerated from live data while it is still a draft. Once issued,
this record preserves the exact payload used for the downloadable PDF.
"""
from datetime import datetime, timezone

from ..extensions import db


DOCUMENT_TYPES = [
    'statement', 'receipt', 'monthly_report', 'bank_reconciliation',
    'expense_voucher', 'budget_actual', 'levy_notice', 'agm_pack',
]


class FinancialDocument(db.Model):
    __tablename__ = 'financial_documents'

    id = db.Column(db.Integer, primary_key=True)
    development_id = db.Column(db.Integer, db.ForeignKey('developments.id'), nullable=False, index=True)
    unit_id = db.Column(db.Integer, db.ForeignKey('units.id'), nullable=True, index=True)
    issued_by_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    document_type = db.Column(db.String(40), nullable=False, index=True)
    reference = db.Column(db.String(60), nullable=False, unique=True, index=True)
    title = db.Column(db.String(255), nullable=False)
    period_start = db.Column(db.Date, nullable=True)
    period_end = db.Column(db.Date, nullable=True)
    snapshot = db.Column(db.JSON, nullable=False)
    snapshot_sha256 = db.Column(db.String(64), nullable=False)
    issued_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    development = db.relationship('Development')
    unit = db.relationship('Unit')
    issued_by = db.relationship('User')

    def to_dict(self):
        return {
            'id': self.id, 'document_type': self.document_type, 'reference': self.reference,
            'title': self.title,
            'period_start': self.period_start.isoformat() if self.period_start else None,
            'period_end': self.period_end.isoformat() if self.period_end else None,
            'issued_at': self.issued_at.isoformat() if self.issued_at else None,
            'unit_label': self.unit.label if self.unit else None,
        }

