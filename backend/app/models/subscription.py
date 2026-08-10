"""Subscription models — plans, per-development subscriptions and platform billing."""
from datetime import datetime, timezone

from ..extensions import db

PLAN_CODES = ['basic', 'silver', 'premium']
SUBSCRIPTION_STATUSES = ['trial', 'active', 'suspended', 'cancelled']
SUBSCRIPTION_INVOICE_STATUSES = ['issued', 'paid', 'overdue']


class SubscriptionPlan(db.Model):
    __tablename__ = 'subscription_plans'

    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(30), unique=True, nullable=False)
    name = db.Column(db.String(80), nullable=False)
    monthly_unit_rate = db.Column(db.Numeric(12, 2), nullable=False, default=100)
    vat_rate = db.Column(db.Numeric(5, 2), nullable=False, default=15)
    setup_fee_amount = db.Column(db.Numeric(12, 2), nullable=False, default=0)
    features = db.Column(db.JSON, nullable=True)
    is_popular = db.Column(db.Boolean, nullable=False, default=False)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    sort_order = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    subscriptions = db.relationship('Subscription', backref='plan')

    @property
    def rate_incl_vat(self):
        rate = float(self.monthly_unit_rate or 0)
        vat = float(self.vat_rate or 0)
        return round(rate * (1 + vat / 100), 2)

    @property
    def client_count(self):
        return len([s for s in self.subscriptions if s.status in ('trial', 'active')])

    def to_dict(self):
        return {
            'id': self.id,
            'code': self.code,
            'name': self.name,
            'monthly_unit_rate': float(self.monthly_unit_rate or 0),
            'vat_rate': float(self.vat_rate or 0),
            'rate_incl_vat': self.rate_incl_vat,
            'setup_fee_amount': float(self.setup_fee_amount or 0),
            'features': self.features or [],
            'is_popular': self.is_popular,
            'is_active': self.is_active,
            'sort_order': self.sort_order,
            'client_count': self.client_count,
        }


class Subscription(db.Model):
    __tablename__ = 'subscriptions'

    id = db.Column(db.Integer, primary_key=True)
    development_id = db.Column(db.Integer, db.ForeignKey('developments.id'), nullable=False, unique=True, index=True)
    plan_id = db.Column(db.Integer, db.ForeignKey('subscription_plans.id'), nullable=False, index=True)

    setup_fee_amount = db.Column(db.Numeric(12, 2), nullable=False, default=0)
    monthly_unit_rate = db.Column(db.Numeric(12, 2), nullable=False, default=100)
    vat_rate = db.Column(db.Numeric(5, 2), nullable=False, default=15)
    active_units_count = db.Column(db.Integer, nullable=False, default=0)

    status = db.Column(db.String(30), nullable=False, default='trial', index=True)
    start_date = db.Column(db.Date, nullable=True)
    end_date = db.Column(db.Date, nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc),
                           onupdate=lambda: datetime.now(timezone.utc))

    invoices = db.relationship('SubscriptionInvoice', backref='subscription',
                               cascade='all, delete-orphan', order_by='SubscriptionInvoice.id.desc()')

    @property
    def mrr(self):
        """Monthly recurring revenue, exclusive of VAT."""
        return round(float(self.monthly_unit_rate or 0) * int(self.active_units_count or 0), 2)

    @property
    def mrr_incl_vat(self):
        return round(self.mrr * (1 + float(self.vat_rate or 0) / 100), 2)

    def to_dict(self):
        return {
            'id': self.id,
            'development_id': self.development_id,
            'development_name': self.development.name if self.development else None,
            'plan_id': self.plan_id,
            'plan_code': self.plan.code if self.plan else None,
            'plan_name': self.plan.name if self.plan else None,
            'setup_fee_amount': float(self.setup_fee_amount or 0),
            'monthly_unit_rate': float(self.monthly_unit_rate or 0),
            'vat_rate': float(self.vat_rate or 0),
            'active_units_count': self.active_units_count,
            'mrr': self.mrr,
            'mrr_incl_vat': self.mrr_incl_vat,
            'status': self.status,
            'start_date': self.start_date.isoformat() if self.start_date else None,
            'end_date': self.end_date.isoformat() if self.end_date else None,
        }


class SubscriptionInvoice(db.Model):
    __tablename__ = 'subscription_invoices'

    id = db.Column(db.Integer, primary_key=True)
    subscription_id = db.Column(db.Integer, db.ForeignKey('subscriptions.id'), nullable=False, index=True)
    invoice_no = db.Column(db.String(50), unique=True, nullable=False)
    billing_period_start = db.Column(db.Date, nullable=False)
    billing_period_end = db.Column(db.Date, nullable=False)
    net_amount = db.Column(db.Numeric(12, 2), nullable=False, default=0)
    vat_amount = db.Column(db.Numeric(12, 2), nullable=False, default=0)
    gross_amount = db.Column(db.Numeric(12, 2), nullable=False, default=0)
    status = db.Column(db.String(30), nullable=False, default='issued', index=True)
    issued_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            'id': self.id,
            'subscription_id': self.subscription_id,
            'development_name': (self.subscription.development.name
                                 if self.subscription and self.subscription.development else None),
            'invoice_no': self.invoice_no,
            'billing_period_start': self.billing_period_start.isoformat() if self.billing_period_start else None,
            'billing_period_end': self.billing_period_end.isoformat() if self.billing_period_end else None,
            'net_amount': float(self.net_amount or 0),
            'vat_amount': float(self.vat_amount or 0),
            'gross_amount': float(self.gross_amount or 0),
            'status': self.status,
            'issued_at': self.issued_at.isoformat() if self.issued_at else None,
        }


class RevenueSnapshot(db.Model):
    """One row per month, powering the 12-month revenue growth chart."""
    __tablename__ = 'revenue_snapshots'

    id = db.Column(db.Integer, primary_key=True)
    period_month = db.Column(db.String(7), unique=True, nullable=False)  # YYYY-MM
    mrr_amount = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    captured_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            'id': self.id,
            'period_month': self.period_month,
            'mrr_amount': float(self.mrr_amount or 0),
        }
