"""
Development models — the client properties this platform serves.

A development is the multi-tenant boundary: every syndic console record is
scoped to one. The counts held here (units, parking, storage, facilities) are
the platform-level registry totals shown in the admin console; the detailed
unit/bay/store records belong to the syndic console and are added later.
"""
from datetime import datetime, timezone

from ..extensions import db

DEVELOPMENT_TYPES = ['apartment', 'gated', 'estate', 'mixed']
DEVELOPMENT_STATUSES = ['draft', 'setup', 'uat', 'trial', 'active', 'suspended']

# The eight onboarding stages shown on each client card.
ONBOARDING_STAGES = [
    'Contract Signed',
    'Property Data Entry',
    'Unit/Parking/Storage Setup',
    'Co-Owner Import',
    'Billing Config',
    'WhatsApp Templates',
    'UAT Testing',
    'Go-Live',
]

# The detailed checklist an implementation runs through per client.
ONBOARDING_CHECKLIST_TEMPLATE = [
    'Contract signing & plan selection',
    'Development metadata (name, address, GPS, type, financial year)',
    'Building structure (blocks, floors)',
    'Unit registry (number, type, area, shares)',
    'Parking bays (owner, rental, EV, visitor pool)',
    'Storage units (owner, rental, common pool)',
    'Facilities setup (pool, gym, hall — hours, rules, booking)',
    'Co-owner import (CSV: name, email, phone, unit, shares)',
    'Billing rules (charge per unit/share, billing day, penalties)',
    'WhatsApp Business: phone registration + template approval',
    'Payment gateway configuration (card, bank, Juice)',
    'Document upload (rules, insurance, contracts)',
    'UAT testing (billing cycle, payments, notifications)',
    'Training session (syndic manager)',
    'Go-live + monitoring period (2 weeks)',
]

# Pipeline buckets on the Platform Overview screen.
PIPELINE_STAGES = ['prospect', 'contracted', 'setup', 'data_import', 'uat', 'go_live']
PIPELINE_LABELS = {
    'prospect': 'Prospect',
    'contracted': 'Contracted',
    'setup': 'Setup',
    'data_import': 'Data Import',
    'uat': 'UAT',
    'go_live': 'Go-Live',
}


class Development(db.Model):
    __tablename__ = 'developments'

    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(50), unique=True, nullable=False, index=True)
    name = db.Column(db.String(255), nullable=False)
    development_type = db.Column(db.String(50), nullable=False, default='apartment')

    address_line_1 = db.Column(db.String(255), nullable=True)
    address_line_2 = db.Column(db.String(255), nullable=True)
    city = db.Column(db.String(100), nullable=True)
    district = db.Column(db.String(100), nullable=True)
    country = db.Column(db.String(100), nullable=False, default='Mauritius')

    status = db.Column(db.String(30), nullable=False, default='draft', index=True)
    pipeline_stage = db.Column(db.String(30), nullable=False, default='prospect')
    launch_date = db.Column(db.Date, nullable=True)

    syndic_manager_name = db.Column(db.String(150), nullable=True)
    syndic_manager_email = db.Column(db.String(255), nullable=True)

    # Registry totals surfaced in the console.
    unit_count = db.Column(db.Integer, nullable=False, default=0)
    parking_count = db.Column(db.Integer, nullable=False, default=0)
    ev_parking_count = db.Column(db.Integer, nullable=False, default=0)
    storage_count = db.Column(db.Integer, nullable=False, default=0)
    facility_count = db.Column(db.Integer, nullable=False, default=0)
    user_count = db.Column(db.Integer, nullable=False, default=0)

    whatsapp_enabled = db.Column(db.Boolean, nullable=False, default=False)

    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc),
                           onupdate=lambda: datetime.now(timezone.utc))

    settings = db.relationship('DevelopmentSettings', backref='development', uselist=False,
                               cascade='all, delete-orphan')
    onboarding_steps = db.relationship('OnboardingStep', backref='development',
                                       cascade='all, delete-orphan',
                                       order_by='OnboardingStep.sequence')
    subscription = db.relationship('Subscription', backref='development', uselist=False,
                                   cascade='all, delete-orphan')

    @property
    def location(self):
        return self.city or self.district or self.country

    @property
    def onboarding_percent(self):
        steps = self.onboarding_steps or []
        if not steps:
            return 0
        done = sum(1 for step in steps if step.status == 'done')
        return round(done / len(steps) * 100)

    @property
    def onboarding_stage_label(self):
        for step in self.onboarding_steps or []:
            if step.status != 'done':
                return step.title
        return 'Complete'

    def to_dict(self, include_subscription=True):
        subscription = self.subscription
        payload = {
            'id': self.id,
            'code': self.code,
            'name': self.name,
            'development_type': self.development_type,
            'address_line_1': self.address_line_1,
            'address_line_2': self.address_line_2,
            'city': self.city,
            'district': self.district,
            'country': self.country,
            'location': self.location,
            'status': self.status,
            'pipeline_stage': self.pipeline_stage,
            'pipeline_label': PIPELINE_LABELS.get(self.pipeline_stage, self.pipeline_stage),
            'launch_date': self.launch_date.isoformat() if self.launch_date else None,
            'syndic_manager_name': self.syndic_manager_name,
            'syndic_manager_email': self.syndic_manager_email,
            'unit_count': self.unit_count,
            'parking_count': self.parking_count,
            'ev_parking_count': self.ev_parking_count,
            'storage_count': self.storage_count,
            'facility_count': self.facility_count,
            'user_count': self.user_count,
            'whatsapp_enabled': self.whatsapp_enabled,
            'onboarding_percent': self.onboarding_percent,
            'onboarding_stage_label': self.onboarding_stage_label,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
        if include_subscription:
            payload['plan_code'] = subscription.plan.code if subscription and subscription.plan else None
            payload['plan_name'] = subscription.plan.name if subscription and subscription.plan else None
            payload['mrr'] = subscription.mrr if subscription else 0
            payload['subscription_status'] = subscription.status if subscription else None
        return payload


class DevelopmentSettings(db.Model):
    __tablename__ = 'development_settings'

    id = db.Column(db.Integer, primary_key=True)
    development_id = db.Column(db.Integer, db.ForeignKey('developments.id'), nullable=False, unique=True)
    currency_code = db.Column(db.String(10), nullable=False, default='MUR')
    timezone = db.Column(db.String(50), nullable=False, default='Indian/Mauritius')
    billing_day = db.Column(db.Integer, nullable=False, default=1)
    arrears_grace_days = db.Column(db.Integer, nullable=False, default=15)
    penalty_rate_percent = db.Column(db.Numeric(6, 2), nullable=True)
    allow_online_payments = db.Column(db.Boolean, nullable=False, default=True)
    allow_resident_voting = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            'id': self.id,
            'development_id': self.development_id,
            'currency_code': self.currency_code,
            'timezone': self.timezone,
            'billing_day': self.billing_day,
            'arrears_grace_days': self.arrears_grace_days,
            'penalty_rate_percent': float(self.penalty_rate_percent) if self.penalty_rate_percent is not None else None,
            'allow_online_payments': self.allow_online_payments,
            'allow_resident_voting': self.allow_resident_voting,
        }


class OnboardingStep(db.Model):
    __tablename__ = 'onboarding_steps'

    id = db.Column(db.Integer, primary_key=True)
    development_id = db.Column(db.Integer, db.ForeignKey('developments.id'), nullable=False, index=True)
    sequence = db.Column(db.Integer, nullable=False, default=0)
    title = db.Column(db.String(200), nullable=False)
    status = db.Column(db.String(30), nullable=False, default='pending')  # pending, current, done, blocked
    owner_user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    due_date = db.Column(db.Date, nullable=True)
    completed_at = db.Column(db.DateTime, nullable=True)

    def to_dict(self):
        return {
            'id': self.id,
            'development_id': self.development_id,
            'sequence': self.sequence,
            'title': self.title,
            'status': self.status,
            'owner_user_id': self.owner_user_id,
            'due_date': self.due_date.isoformat() if self.due_date else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
        }
