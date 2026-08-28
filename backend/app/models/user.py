"""User model — platform accounts across every console and the resident app."""
from datetime import datetime, timezone

from flask_login import UserMixin
from werkzeug.security import check_password_hash, generate_password_hash

from ..extensions import db
from ..permissions import (
    CONSOLE_ROLE_KEYS,
    ROLE_LABELS,
    SYNDIC_ROLE_KEYS,
    effective_matrix,
    layer_of,
    syndic_effective_matrix,
)


class User(UserMixin, db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    first_name = db.Column(db.String(100), nullable=False)
    last_name = db.Column(db.String(100), nullable=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    phone = db.Column(db.String(50), nullable=True)
    password_hash = db.Column(db.Text, nullable=True)

    # One of permissions.MANAGED_ROLE_KEYS. Only CONSOLE_ROLE_KEYS may sign in here.
    role = db.Column(db.String(40), nullable=False, default='co_owner', index=True)
    status = db.Column(db.String(30), nullable=False, default='active')  # active, suspended, invited, inactive

    # Scope. NULL means platform-wide (super admin / platform admin).
    development_id = db.Column(db.Integer, db.ForeignKey('developments.id'), nullable=True, index=True)
    unit_label = db.Column(db.String(50), nullable=True)

    mfa_enabled = db.Column(db.Boolean, nullable=False, default=False)
    whatsapp_enabled = db.Column(db.Boolean, nullable=False, default=False)

    # Optional per-user override of the role matrix, for console roles only.
    permission_overrides = db.Column(db.JSON, nullable=True)

    last_login_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc),
                           onupdate=lambda: datetime.now(timezone.utc))

    development = db.relationship('Development', backref='users', lazy='joined')

    # --- Credentials -------------------------------------------------------

    def set_password(self, raw_password):
        self.password_hash = generate_password_hash(raw_password)

    def check_password(self, raw_password):
        if not self.password_hash:
            return False
        return check_password_hash(self.password_hash, raw_password)

    # --- Derived values ----------------------------------------------------

    @property
    def name(self):
        return ' '.join(part for part in (self.first_name, self.last_name) if part).strip()

    @property
    def initials(self):
        parts = [part for part in (self.first_name, self.last_name) if part]
        if not parts:
            return '?'
        if len(parts) == 1:
            return parts[0][:2].upper()
        return (parts[0][0] + parts[1][0]).upper()

    @property
    def role_display(self):
        return ROLE_LABELS.get(self.role, self.role.replace('_', ' ').title())

    @property
    def layer(self):
        """Which of the three consoles this account signs in to."""
        return layer_of(self.role)

    @property
    def can_access_console(self):
        return self.role in CONSOLE_ROLE_KEYS and self.status == 'active'

    @property
    def can_access_syndic(self):
        """
        Syndic accounts must name the development they manage.

        A syndic role with no development_id is an unfinished provisioning, not
        a platform-wide manager: there is no query in that console that is not
        scoped to one development, so letting such an account in would show it
        an empty building and invite a support ticket.
        """
        return (
            self.role in SYNDIC_ROLE_KEYS
            and self.status == 'active'
            and self.development_id is not None
        )

    @property
    def scope_label(self):
        if self.development_id and self.development:
            if self.unit_label:
                return f'{self.development.name} {self.unit_label}'
            return self.development.name
        return 'All'

    def to_dict(self, include_permissions=False, include_syndic_permissions=False):
        payload = {
            'id': self.id,
            'first_name': self.first_name,
            'last_name': self.last_name,
            'name': self.name,
            'initials': self.initials,
            'email': self.email,
            'phone': self.phone,
            'role': self.role,
            'role_display': self.role_display,
            'layer': self.layer,
            'status': self.status,
            'development_id': self.development_id,
            'development_name': self.development.name if self.development else None,
            'unit_label': self.unit_label,
            'scope_label': self.scope_label,
            'mfa_enabled': self.mfa_enabled,
            'whatsapp_enabled': self.whatsapp_enabled,
            'can_access_console': self.can_access_console,
            'can_access_syndic': self.can_access_syndic,
            'last_login_at': self.last_login_at.isoformat() if self.last_login_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
        if include_permissions:
            payload['permissions'] = effective_matrix(self)
        if include_syndic_permissions:
            payload['permissions'] = syndic_effective_matrix(self)
        return payload
