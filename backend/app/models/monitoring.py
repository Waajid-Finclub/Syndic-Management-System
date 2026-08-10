"""System monitoring models — health tiles and the recent alert feed."""
from datetime import datetime, timezone

from ..extensions import db

METRIC_GROUPS = ['system', 'api']
ALERT_SEVERITIES = ['success', 'info', 'warning', 'error']


class SystemMetric(db.Model):
    __tablename__ = 'system_metrics'

    id = db.Column(db.Integer, primary_key=True)
    metric_key = db.Column(db.String(60), unique=True, nullable=False)
    label = db.Column(db.String(80), nullable=False)
    group_key = db.Column(db.String(30), nullable=False, default='system', index=True)
    value_text = db.Column(db.String(40), nullable=False, default='-')
    target_text = db.Column(db.String(40), nullable=True)
    icon = db.Column(db.String(40), nullable=True)
    is_ok = db.Column(db.Boolean, nullable=False, default=True)
    sort_order = db.Column(db.Integer, nullable=False, default=0)
    captured_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            'id': self.id,
            'metric_key': self.metric_key,
            'label': self.label,
            'group_key': self.group_key,
            'value_text': self.value_text,
            'target_text': self.target_text,
            'icon': self.icon,
            'is_ok': self.is_ok,
            'sort_order': self.sort_order,
            'captured_at': self.captured_at.isoformat() if self.captured_at else None,
        }


class SystemAlert(db.Model):
    __tablename__ = 'system_alerts'

    id = db.Column(db.Integer, primary_key=True)
    message = db.Column(db.String(255), nullable=False)
    severity = db.Column(db.String(20), nullable=False, default='info')
    occurred_at = db.Column(db.DateTime, nullable=False, index=True,
                            default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            'id': self.id,
            'message': self.message,
            'severity': self.severity,
            'occurred_at': self.occurred_at.isoformat() if self.occurred_at else None,
        }
