"""
Resident account models — invitations, preferences and the notification feed.

Registration is invitation-only. A syndic admin creates an Invitation against
a specific unit and email; the co-owner signs up with the code, and the account
that results is bound to that unit with the share split the invitation names.
There is no open sign-up, because an account here can read a co-owner's
financial history and cast a vote weighted by their shares — self-service
registration would be a way in.

This is the layer 2 to layer 3 handoff. A syndic allocates co-owner accounts
exactly as the platform operator allocates syndic accounts one level up: named,
scoped, revocable, and recorded in the audit log at both ends.

Invitation codes are single-use, expiring, generated with `secrets`, and
compared in constant time. Failed attempts are counted so a code cannot be
brute-forced over the 6-character space.
"""
import secrets
from datetime import datetime, timedelta, timezone

from ..extensions import db

NOTIFICATION_CATEGORIES = [
    {'key': 'finance', 'label': 'Finance'},
    {'key': 'maintenance', 'label': 'Maintenance'},
    {'key': 'community', 'label': 'Community'},
    {'key': 'governance', 'label': 'Governance'},
    {'key': 'whatsapp', 'label': 'WhatsApp'},
]
NOTIFICATION_CATEGORY_KEYS = [c['key'] for c in NOTIFICATION_CATEGORIES]

INVITATION_STATUSES = ['pending', 'accepted', 'expired', 'revoked']
INVITATION_TTL_DAYS = 14
INVITATION_MAX_ATTEMPTS = 8

LANGUAGES = [
    {'key': 'en', 'label': 'English'},
    {'key': 'fr', 'label': 'Français'},
]
LANGUAGE_KEYS = [language['key'] for language in LANGUAGES]


class Invitation(db.Model):
    __tablename__ = 'invitations'

    id = db.Column(db.Integer, primary_key=True)
    development_id = db.Column(db.Integer, db.ForeignKey('developments.id'), nullable=False, index=True)
    unit_id = db.Column(db.Integer, db.ForeignKey('units.id'), nullable=False, index=True)

    email = db.Column(db.String(255), nullable=False, index=True)
    code = db.Column(db.String(20), unique=True, nullable=False, index=True)   # "ABC-123"
    role = db.Column(db.String(40), nullable=False, default='co_owner')

    first_name = db.Column(db.String(100), nullable=True)
    last_name = db.Column(db.String(100), nullable=True)
    phone = db.Column(db.String(50), nullable=True)

    # The ownership terms the account inherits on acceptance. A jointly held
    # unit is invited twice with the split agreed between the holders; the
    # primary contact is who the syndic writes to about the unit.
    ownership_percent = db.Column(db.Numeric(8, 4), nullable=False, default=100)
    is_primary_contact = db.Column(db.Boolean, nullable=False, default=True)

    invited_by_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    invited_by_label = db.Column(db.String(150), nullable=True)

    status = db.Column(db.String(30), nullable=False, default='pending', index=True)
    attempts = db.Column(db.Integer, nullable=False, default=0)
    expires_at = db.Column(db.DateTime, nullable=False)
    accepted_at = db.Column(db.DateTime, nullable=True)
    accepted_user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    unit = db.relationship('Unit')
    development = db.relationship('Development')

    @staticmethod
    def generate_code():
        """Six characters as LLL-NNN, skipping glyphs that get misread aloud."""
        letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
        digits = '23456789'
        head = ''.join(secrets.choice(letters) for _ in range(3))
        tail = ''.join(secrets.choice(digits) for _ in range(3))
        return f'{head}-{tail}'

    @staticmethod
    def default_expiry():
        return datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=INVITATION_TTL_DAYS)

    @property
    def is_expired(self):
        return self.expires_at < datetime.now(timezone.utc).replace(tzinfo=None)

    @property
    def is_usable(self):
        return (
            self.status == 'pending'
            and not self.is_expired
            and self.attempts < INVITATION_MAX_ATTEMPTS
        )

    def to_dict(self):
        return {
            'id': self.id,
            'email': self.email,
            'role': self.role,
            'status': self.status,
            'unit_id': self.unit_id,
            'unit_label': self.unit.label if self.unit else None,
            'development_id': self.development_id,
            'development_name': self.development.name if self.development else None,
            'first_name': self.first_name,
            'last_name': self.last_name,
            'phone': self.phone,
            'ownership_percent': float(self.ownership_percent or 0),
            'is_primary_contact': self.is_primary_contact,
            'invited_by_label': self.invited_by_label,
            'code': self.code,
            'attempts': self.attempts,
            'is_expired': self.is_expired,
            'is_usable': self.is_usable,
            'accepted_at': self.accepted_at.isoformat() if self.accepted_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'expires_at': self.expires_at.isoformat() if self.expires_at else None,
        }


class ResidentPreference(db.Model):
    """Per-channel notification settings and display language."""
    __tablename__ = 'resident_preferences'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), unique=True, nullable=False, index=True)

    language_code = db.Column(db.String(10), nullable=False, default='en')
    push_notifications = db.Column(db.Boolean, nullable=False, default=True)
    whatsapp_notifications = db.Column(db.Boolean, nullable=False, default=True)
    email_notifications = db.Column(db.Boolean, nullable=False, default=True)
    sms_notifications = db.Column(db.Boolean, nullable=False, default=False)

    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc),
                           onupdate=lambda: datetime.now(timezone.utc))

    user = db.relationship('User', backref=db.backref('preferences', uselist=False))

    @classmethod
    def for_user(cls, user):
        """Return the row for a user, creating a default one the first time."""
        existing = cls.query.filter_by(user_id=user.id).first()
        if existing:
            return existing
        created = cls(user_id=user.id, whatsapp_notifications=bool(user.whatsapp_enabled))
        db.session.add(created)
        db.session.flush()
        return created

    def to_dict(self):
        return {
            'language_code': self.language_code,
            'push_notifications': self.push_notifications,
            'whatsapp_notifications': self.whatsapp_notifications,
            'email_notifications': self.email_notifications,
            'sms_notifications': self.sms_notifications,
        }


class Notification(db.Model):
    __tablename__ = 'notifications'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    development_id = db.Column(db.Integer, db.ForeignKey('developments.id'), nullable=True)

    category = db.Column(db.String(30), nullable=False, default='community', index=True)
    title = db.Column(db.String(200), nullable=False)
    body = db.Column(db.String(400), nullable=True)
    icon_key = db.Column(db.String(40), nullable=True)          # lucide icon name
    link_path = db.Column(db.String(200), nullable=True)        # in-app route to open

    is_read = db.Column(db.Boolean, nullable=False, default=False, index=True)
    read_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), index=True)

    def to_dict(self):
        return {
            'id': self.id,
            'category': self.category,
            'title': self.title,
            'body': self.body,
            'icon_key': self.icon_key,
            'link_path': self.link_path,
            'is_read': self.is_read,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
