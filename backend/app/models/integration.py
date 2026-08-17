"""Integration models — WhatsApp Business, outbound channels and API keys."""
import secrets
from datetime import datetime, timezone

from werkzeug.security import generate_password_hash

from ..extensions import db

TEMPLATE_CATEGORIES = ['UTILITY', 'MARKETING', 'AUTHENTICATION']
TEMPLATE_STATUSES = ['approved', 'review', 'rejected']
INTEGRATION_STATUSES = ['active', 'manual', 'on_demand', 'error', 'disabled']


class WhatsAppTemplate(db.Model):
    __tablename__ = 'whatsapp_templates'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), unique=True, nullable=False)
    category = db.Column(db.String(30), nullable=False, default='UTILITY')
    status = db.Column(db.String(30), nullable=False, default='review')
    body = db.Column(db.Text, nullable=True)
    sent_30d = db.Column(db.Integer, nullable=False, default=0)
    delivered_pct = db.Column(db.Numeric(5, 2), nullable=True)
    read_pct = db.Column(db.Numeric(5, 2), nullable=True)
    cost_per_message = db.Column(db.Numeric(8, 2), nullable=False, default=0)
    sort_order = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'category': self.category,
            'status': self.status,
            'body': self.body,
            'sent_30d': self.sent_30d,
            'delivered_pct': float(self.delivered_pct) if self.delivered_pct is not None else None,
            'read_pct': float(self.read_pct) if self.read_pct is not None else None,
            'cost_per_message': float(self.cost_per_message or 0),
        }


class WhatsAppNumber(db.Model):
    __tablename__ = 'whatsapp_numbers'

    id = db.Column(db.Integer, primary_key=True)
    development_id = db.Column(db.Integer, db.ForeignKey('developments.id'), nullable=True, index=True)
    display_name = db.Column(db.String(150), nullable=False)
    phone_number = db.Column(db.String(40), unique=True, nullable=False)
    status = db.Column(db.String(30), nullable=False, default='Connected')
    monthly_messages = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    development = db.relationship('Development')

    def to_dict(self):
        return {
            'id': self.id,
            'development_id': self.development_id,
            'display_name': self.display_name,
            'phone_number': self.phone_number,
            'status': self.status,
            'monthly_messages': self.monthly_messages,
        }


class WhatsAppStat(db.Model):
    """One aggregate row per month for the WhatsApp status header."""
    __tablename__ = 'whatsapp_stats'

    id = db.Column(db.Integer, primary_key=True)
    period_month = db.Column(db.String(7), unique=True, nullable=False)  # YYYY-MM
    total_sent = db.Column(db.Integer, nullable=False, default=0)
    delivered = db.Column(db.Integer, nullable=False, default=0)
    read = db.Column(db.Integer, nullable=False, default=0)
    failed = db.Column(db.Integer, nullable=False, default=0)
    queue_depth = db.Column(db.Integer, nullable=False, default=0)
    monthly_cost = db.Column(db.Numeric(12, 2), nullable=False, default=0)

    def _pct(self, value):
        if not self.total_sent:
            return None
        return round(value / self.total_sent * 100, 1)

    def to_dict(self):
        return {
            'id': self.id,
            'period_month': self.period_month,
            'total_sent': self.total_sent,
            'delivered': self.delivered,
            'read': self.read,
            'failed': self.failed,
            'queue_depth': self.queue_depth,
            'monthly_cost': float(self.monthly_cost or 0),
            'delivered_pct': self._pct(self.delivered),
            'read_pct': self._pct(self.read),
            'failed_pct': self._pct(self.failed),
        }


class WhatsAppMessage(db.Model):
    """
    One outbound message, logged when the platform notifies a resident.

    Nothing here talks to Meta. The row records what *would* be sent — template,
    recipient, rendered body — so the admin console's WhatsApp screen reflects
    real resident activity rather than a static demo figure, and so a live
    Business API client can later be dropped in behind the same call site.
    """
    __tablename__ = 'whatsapp_messages'

    id = db.Column(db.Integer, primary_key=True)
    development_id = db.Column(db.Integer, db.ForeignKey('developments.id'), nullable=True, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True, index=True)

    template_name = db.Column(db.String(100), nullable=True, index=True)
    to_number = db.Column(db.String(40), nullable=True)
    body = db.Column(db.Text, nullable=True)
    category = db.Column(db.String(40), nullable=False, default='UTILITY')
    status = db.Column(db.String(30), nullable=False, default='sent', index=True)

    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    delivered_at = db.Column(db.DateTime, nullable=True)

    development = db.relationship('Development')
    user = db.relationship('User')

    @property
    def masked_number(self):
        """Never echo a full phone number back to a console operator."""
        if not self.to_number or len(self.to_number) < 4:
            return self.to_number
        return f'{self.to_number[:-4]}XXXX'

    def to_dict(self):
        return {
            'id': self.id,
            'development_id': self.development_id,
            'development_name': self.development.name if self.development else None,
            'recipient_name': self.user.name if self.user else None,
            'template_name': self.template_name,
            'to_number': self.masked_number,
            'body': self.body,
            'category': self.category,
            'status': self.status,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class Integration(db.Model):
    __tablename__ = 'integrations'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), unique=True, nullable=False)
    protocol = db.Column(db.String(80), nullable=True)
    direction = db.Column(db.String(60), nullable=True)
    status = db.Column(db.String(30), nullable=False, default='active')
    last_sync_label = db.Column(db.String(60), nullable=True)
    requests_per_day = db.Column(db.Integer, nullable=False, default=0)
    sort_order = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'protocol': self.protocol,
            'direction': self.direction,
            'status': self.status,
            'last_sync_label': self.last_sync_label,
            'requests_per_day': self.requests_per_day,
        }


class ApiKey(db.Model):
    __tablename__ = 'api_keys'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    key_prefix = db.Column(db.String(16), nullable=False)
    key_hash = db.Column(db.Text, nullable=False)
    created_by_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    last_used_at = db.Column(db.DateTime, nullable=True)
    revoked_at = db.Column(db.DateTime, nullable=True)

    @staticmethod
    def generate():
        """Return (plaintext_key, prefix, hash). The plaintext is shown once."""
        raw = f'sms_{secrets.token_urlsafe(32)}'
        return raw, raw[:12], generate_password_hash(raw)

    @property
    def is_active(self):
        return self.revoked_at is None

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'key_prefix': self.key_prefix,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'last_used_at': self.last_used_at.isoformat() if self.last_used_at else None,
            'revoked_at': self.revoked_at.isoformat() if self.revoked_at else None,
            'is_active': self.is_active,
        }
