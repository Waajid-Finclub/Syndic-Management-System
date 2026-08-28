"""
Billing run — one execution of a development's service-charge cycle.

A run is recorded rather than inferred. Invoices carry a period label, but
"which invoices did the March run raise, who pressed the button, and what did it
total" is a question a syndic gets asked at every AGM, and reconstructing it
from a LIKE over period_label is guesswork the moment someone raises a manual
invoice for the same month.

Runs are idempotent per (development, period): the unique constraint is what
prevents a double-click billing the whole building twice, not a check in the
route. A run that must be redone is cancelled first, which voids its invoices.
"""
from datetime import datetime, timezone

from ..extensions import db

BILLING_RUN_STATUSES = ['draft', 'issued', 'cancelled']

BILLING_BASIS = [
    {'key': 'unit_charge', 'label': 'Per unit monthly charge',
     'description': "Each unit's own monthly_charge, set in the registry"},
    {'key': 'share_value', 'label': 'Apportioned by shares',
     'description': 'A development-wide budget split by each unit share of 10,000'},
]
BILLING_BASIS_KEYS = [b['key'] for b in BILLING_BASIS]


class BillingRun(db.Model):
    __tablename__ = 'billing_runs'

    id = db.Column(db.Integer, primary_key=True)
    development_id = db.Column(db.Integer, db.ForeignKey('developments.id'), nullable=False, index=True)

    period_month = db.Column(db.String(7), nullable=False, index=True)   # YYYY-MM
    period_label = db.Column(db.String(60), nullable=False)              # "March 2026"
    basis = db.Column(db.String(30), nullable=False, default='unit_charge')

    # Only used when basis == 'share_value'.
    budget_amount = db.Column(db.Numeric(14, 2), nullable=True)

    issue_date = db.Column(db.Date, nullable=False)
    due_date = db.Column(db.Date, nullable=False)

    invoice_count = db.Column(db.Integer, nullable=False, default=0)
    total_amount = db.Column(db.Numeric(14, 2), nullable=False, default=0)

    status = db.Column(db.String(30), nullable=False, default='issued', index=True)
    run_by_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    run_by_label = db.Column(db.String(150), nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    cancelled_at = db.Column(db.DateTime, nullable=True)

    development = db.relationship('Development')

    __table_args__ = (
        db.UniqueConstraint('development_id', 'period_month', name='uq_one_billing_run_per_period'),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'development_id': self.development_id,
            'period_month': self.period_month,
            'period_label': self.period_label,
            'basis': self.basis,
            'budget_amount': float(self.budget_amount) if self.budget_amount is not None else None,
            'issue_date': self.issue_date.isoformat() if self.issue_date else None,
            'due_date': self.due_date.isoformat() if self.due_date else None,
            'invoice_count': self.invoice_count,
            'total_amount': float(self.total_amount or 0),
            'status': self.status,
            'run_by_label': self.run_by_label,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
