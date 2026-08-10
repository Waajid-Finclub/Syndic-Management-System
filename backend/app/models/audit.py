"""
Audit log model — append-only record of every significant platform action.

Rows are written, never updated or deleted. Retention is 7 years for financial
categories and 3 years for operational ones.
"""
from datetime import datetime, timezone

from ..extensions import db

AUDIT_CATEGORIES = [
    {'key': 'financial', 'label': 'Financial'},
    {'key': 'roles', 'label': 'Roles'},
    {'key': 'votes', 'label': 'Votes'},
    {'key': 'parking_ev', 'label': 'Parking/EV'},
    {'key': 'whatsapp', 'label': 'WhatsApp'},
    {'key': 'system', 'label': 'System'},
    {'key': 'config', 'label': 'Config'},
]
AUDIT_CATEGORY_KEYS = [c['key'] for c in AUDIT_CATEGORIES]


class AuditLog(db.Model):
    __tablename__ = 'audit_logs'

    id = db.Column(db.Integer, primary_key=True)
    occurred_at = db.Column(db.DateTime, nullable=False, index=True,
                            default=lambda: datetime.now(timezone.utc))

    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    user_label = db.Column(db.String(150), nullable=False, default='System')
    development_id = db.Column(db.Integer, db.ForeignKey('developments.id'), nullable=True, index=True)
    development_label = db.Column(db.String(150), nullable=False, default='Platform')

    action = db.Column(db.String(40), nullable=False, index=True)   # CREATE, MODIFY, DELETE, VOTE, ...
    entity = db.Column(db.String(60), nullable=False)               # Invoice, Role, Config, ...
    category = db.Column(db.String(40), nullable=False, default='system', index=True)
    detail = db.Column(db.Text, nullable=True)

    before_json = db.Column(db.JSON, nullable=True)
    after_json = db.Column(db.JSON, nullable=True)
    ip_address = db.Column(db.String(64), nullable=True)

    def to_dict(self):
        return {
            'id': self.id,
            'occurred_at': self.occurred_at.isoformat() if self.occurred_at else None,
            'user_id': self.user_id,
            'user_label': self.user_label,
            'development_id': self.development_id,
            'development_label': self.development_label,
            'action': self.action,
            'entity': self.entity,
            'category': self.category,
            'detail': self.detail,
        }


def record_audit(action, entity, detail, category='system', user=None, development=None, **kwargs):
    """Append one audit row. Callers commit as part of their own transaction."""
    entry = AuditLog(
        action=action,
        entity=entity,
        detail=detail,
        category=category,
        user_id=getattr(user, 'id', None),
        user_label=getattr(user, 'name', None) or 'System',
        development_id=getattr(development, 'id', None),
        development_label=getattr(development, 'name', None) or 'Platform',
        before_json=kwargs.get('before'),
        after_json=kwargs.get('after'),
        ip_address=kwargs.get('ip_address'),
    )
    db.session.add(entry)
    return entry
