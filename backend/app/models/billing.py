"""
Billing models — the co-owner's account: what was charged, what was paid.

Money is never stored twice. An invoice holds its own total and its lines; a
payment holds its own amount; the link between them is an allocation row. A
balance is therefore always SUM(invoices) - SUM(allocations), computed on
demand, so there is no cached figure that can disagree with the ledger. The
statement screen reads the same two tables and walks them in date order to
produce its running balance.

Amounts are Numeric(12, 2) throughout and are converted to float only at the
JSON boundary — never used for arithmetic as floats.
"""
from datetime import datetime, timezone
from decimal import Decimal

from ..extensions import db

INVOICE_TYPES = [
    {'key': 'service_charge', 'label': 'Service Charges'},
    {'key': 'special_levy', 'label': 'Special Levy'},
    {'key': 'ev_charging', 'label': 'EV Charging'},
    {'key': 'parking', 'label': 'Parking'},
    {'key': 'facility', 'label': 'Facility Booking'},
    {'key': 'other', 'label': 'Other'},
]
INVOICE_TYPE_KEYS = [t['key'] for t in INVOICE_TYPES]

# 'issued' becomes 'overdue' by date, not by a background job — see is_overdue.
INVOICE_STATUSES = ['issued', 'part_paid', 'paid', 'disputed', 'cancelled']

PAYMENT_STATUSES = ['pending', 'confirmed', 'failed', 'refunded']
PAYMENT_METHOD_TYPES = ['card', 'bank', 'wallet']


def _money(value):
    return Decimal(str(value or 0)).quantize(Decimal('0.01'))


class Invoice(db.Model):
    __tablename__ = 'invoices'

    id = db.Column(db.Integer, primary_key=True)
    development_id = db.Column(db.Integer, db.ForeignKey('developments.id'), nullable=False, index=True)
    unit_id = db.Column(db.Integer, db.ForeignKey('units.id'), nullable=False, index=True)

    reference = db.Column(db.String(40), unique=True, nullable=False, index=True)  # "SC-2026-003"
    title = db.Column(db.String(200), nullable=False)
    invoice_type = db.Column(db.String(40), nullable=False, default='service_charge')
    period_label = db.Column(db.String(60), nullable=True)     # "March 2026"

    issue_date = db.Column(db.Date, nullable=False)
    due_date = db.Column(db.Date, nullable=False)
    total_amount = db.Column(db.Numeric(12, 2), nullable=False, default=0)

    status = db.Column(db.String(30), nullable=False, default='issued', index=True)

    dispute_reason = db.Column(db.Text, nullable=True)
    disputed_at = db.Column(db.DateTime, nullable=True)

    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    unit = db.relationship('Unit', backref='invoices')
    development = db.relationship('Development')
    lines = db.relationship('InvoiceLine', backref='invoice', cascade='all, delete-orphan',
                            order_by='InvoiceLine.sort_order')
    allocations = db.relationship('PaymentAllocation', backref='invoice', cascade='all, delete-orphan')

    @property
    def amount_paid(self):
        return _money(sum((allocation.amount or 0) for allocation in self.allocations))

    @property
    def balance(self):
        return _money(self.total_amount) - self.amount_paid

    @property
    def is_settled(self):
        return self.balance <= 0

    @property
    def is_overdue(self):
        """Overdue is a fact about today and the due date, not a stored flag."""
        if self.is_settled or self.status in ('cancelled', 'disputed'):
            return False
        return self.due_date < datetime.now(timezone.utc).date()

    @property
    def display_status(self):
        if self.status in ('cancelled', 'disputed'):
            return self.status
        if self.is_settled:
            return 'paid'
        if self.is_overdue:
            return 'overdue'
        if self.amount_paid > 0:
            return 'part_paid'
        return 'issued'

    def recalculate_status(self):
        if self.status in ('cancelled', 'disputed'):
            return
        if self.is_settled:
            self.status = 'paid'
        elif self.amount_paid > 0:
            self.status = 'part_paid'
        else:
            self.status = 'issued'

    def to_dict(self, include_lines=False, include_payments=False):
        payload = {
            'id': self.id,
            'reference': self.reference,
            'title': self.title,
            'invoice_type': self.invoice_type,
            'period_label': self.period_label,
            'issue_date': self.issue_date.isoformat() if self.issue_date else None,
            'due_date': self.due_date.isoformat() if self.due_date else None,
            'total_amount': float(self.total_amount or 0),
            'amount_paid': float(self.amount_paid),
            'balance': float(self.balance),
            'status': self.status,
            'display_status': self.display_status,
            'is_overdue': self.is_overdue,
            'unit_id': self.unit_id,
            'unit_label': self.unit.label if self.unit else None,
            'dispute_reason': self.dispute_reason,
            'disputed_at': self.disputed_at.isoformat() if self.disputed_at else None,
        }
        if include_lines:
            payload['lines'] = [line.to_dict() for line in self.lines]
        if include_payments:
            payload['payments'] = [
                {
                    'id': allocation.payment.id,
                    'reference': allocation.payment.reference,
                    'amount': float(allocation.amount or 0),
                    'paid_at': allocation.payment.paid_at.isoformat() if allocation.payment.paid_at else None,
                    'method_label': allocation.payment.method_label,
                    'status': allocation.payment.status,
                }
                for allocation in self.allocations
                if allocation.payment is not None
            ]
        return payload


class InvoiceLine(db.Model):
    __tablename__ = 'invoice_lines'

    id = db.Column(db.Integer, primary_key=True)
    invoice_id = db.Column(db.Integer, db.ForeignKey('invoices.id'), nullable=False, index=True)
    description = db.Column(db.String(255), nullable=False)
    quantity = db.Column(db.Numeric(10, 2), nullable=False, default=1)
    unit_rate = db.Column(db.Numeric(12, 2), nullable=False, default=0)
    amount = db.Column(db.Numeric(12, 2), nullable=False, default=0)
    sort_order = db.Column(db.Integer, nullable=False, default=0)

    def to_dict(self):
        return {
            'id': self.id,
            'description': self.description,
            'quantity': float(self.quantity or 0),
            'unit_rate': float(self.unit_rate or 0),
            'amount': float(self.amount or 0),
        }


class PaymentMethod(db.Model):
    """A saved method. No PAN or CVV is stored — only what the resident sees."""
    __tablename__ = 'payment_methods'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    method_type = db.Column(db.String(30), nullable=False, default='card')
    label = db.Column(db.String(120), nullable=False)          # "Visa •••• 4521"
    detail = db.Column(db.String(120), nullable=True)          # "Expires 08/27"
    is_default = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            'id': self.id,
            'method_type': self.method_type,
            'label': self.label,
            'detail': self.detail,
            'is_default': self.is_default,
        }


class Payment(db.Model):
    __tablename__ = 'payments'

    id = db.Column(db.Integer, primary_key=True)
    development_id = db.Column(db.Integer, db.ForeignKey('developments.id'), nullable=False, index=True)
    unit_id = db.Column(db.Integer, db.ForeignKey('units.id'), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True, index=True)

    reference = db.Column(db.String(40), unique=True, nullable=False, index=True)  # "PAY-013"
    amount = db.Column(db.Numeric(12, 2), nullable=False, default=0)

    method_id = db.Column(db.Integer, db.ForeignKey('payment_methods.id'), nullable=True)
    method_label = db.Column(db.String(120), nullable=True)

    status = db.Column(db.String(30), nullable=False, default='confirmed')
    gateway_name = db.Column(db.String(60), nullable=True)
    gateway_reference = db.Column(db.String(80), nullable=True)
    failure_reason = db.Column(db.String(255), nullable=True)

    paid_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    unit = db.relationship('Unit', backref='payments')
    user = db.relationship('User')
    method = db.relationship('PaymentMethod')
    allocations = db.relationship('PaymentAllocation', backref='payment', cascade='all, delete-orphan')

    def to_dict(self, include_allocations=False):
        payload = {
            'id': self.id,
            'reference': self.reference,
            'amount': float(self.amount or 0),
            'method_label': self.method_label,
            'status': self.status,
            'gateway_name': self.gateway_name,
            'gateway_reference': self.gateway_reference,
            'failure_reason': self.failure_reason,
            'paid_at': self.paid_at.isoformat() if self.paid_at else None,
            'unit_id': self.unit_id,
        }
        if include_allocations:
            payload['allocations'] = [
                {
                    'invoice_id': allocation.invoice_id,
                    'invoice_reference': allocation.invoice.reference if allocation.invoice else None,
                    'invoice_title': allocation.invoice.title if allocation.invoice else None,
                    'amount': float(allocation.amount or 0),
                }
                for allocation in self.allocations
            ]
        return payload


class PaymentAllocation(db.Model):
    """How much of one payment settled one invoice."""
    __tablename__ = 'payment_allocations'

    id = db.Column(db.Integer, primary_key=True)
    payment_id = db.Column(db.Integer, db.ForeignKey('payments.id'), nullable=False, index=True)
    invoice_id = db.Column(db.Integer, db.ForeignKey('invoices.id'), nullable=False, index=True)
    amount = db.Column(db.Numeric(12, 2), nullable=False, default=0)


class DevelopmentFund(db.Model):
    """
    A pot of money held by the co-ownership — reserve, sinking, operating.

    Kept as its own table rather than a column on the development so a syndic
    can run more than one fund, which is normal once major works are planned.
    """
    __tablename__ = 'development_funds'

    id = db.Column(db.Integer, primary_key=True)
    development_id = db.Column(db.Integer, db.ForeignKey('developments.id'), nullable=False, index=True)
    name = db.Column(db.String(120), nullable=False, default='Reserve Fund')
    fund_type = db.Column(db.String(30), nullable=False, default='reserve')
    balance = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    target_balance = db.Column(db.Numeric(14, 2), nullable=True)
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc),
                           onupdate=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'fund_type': self.fund_type,
            'balance': float(self.balance or 0),
            'target_balance': float(self.target_balance) if self.target_balance is not None else None,
        }


class EvChargingSession(db.Model):
    """One plug-in at an EV bay. Billed onto an invoice once complete."""
    __tablename__ = 'ev_charging_sessions'

    id = db.Column(db.Integer, primary_key=True)
    development_id = db.Column(db.Integer, db.ForeignKey('developments.id'), nullable=False, index=True)
    bay_id = db.Column(db.Integer, db.ForeignKey('parking_bays.id'), nullable=False, index=True)
    unit_id = db.Column(db.Integer, db.ForeignKey('units.id'), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)

    started_at = db.Column(db.DateTime, nullable=False)
    ended_at = db.Column(db.DateTime, nullable=True)
    kwh = db.Column(db.Numeric(10, 2), nullable=False, default=0)
    rate_per_kwh = db.Column(db.Numeric(8, 2), nullable=False, default=0)
    amount = db.Column(db.Numeric(12, 2), nullable=False, default=0)
    vehicle_label = db.Column(db.String(120), nullable=True)

    status = db.Column(db.String(30), nullable=False, default='complete')  # charging, complete, billed
    invoice_id = db.Column(db.Integer, db.ForeignKey('invoices.id'), nullable=True)

    bay = db.relationship('ParkingBay')
    invoice = db.relationship('Invoice')

    @property
    def duration_label(self):
        if not self.ended_at or not self.started_at:
            return None
        minutes = int((self.ended_at - self.started_at).total_seconds() // 60)
        return f'{minutes // 60}h {minutes % 60:02d}m'

    def to_dict(self):
        return {
            'id': self.id,
            'bay_id': self.bay_id,
            'bay_code': self.bay.code if self.bay else None,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'ended_at': self.ended_at.isoformat() if self.ended_at else None,
            'duration_label': self.duration_label,
            'kwh': float(self.kwh or 0),
            'rate_per_kwh': float(self.rate_per_kwh or 0),
            'amount': float(self.amount or 0),
            'vehicle_label': self.vehicle_label,
            'status': self.status,
            'invoice_id': self.invoice_id,
        }
