"""Feature flag models — global switches plus per-development overrides."""
from datetime import datetime, timezone

from ..extensions import db

FLAG_SCOPES = ['Global', 'Pilot', 'Premium', 'Silver+', 'Per Property']


class FeatureFlag(db.Model):
    __tablename__ = 'feature_flags'

    id = db.Column(db.Integer, primary_key=True)
    feature_key = db.Column(db.String(100), unique=True, nullable=False, index=True)
    description = db.Column(db.String(255), nullable=True)
    is_enabled = db.Column(db.Boolean, nullable=False, default=False)
    scope = db.Column(db.String(50), nullable=False, default='Global')
    config_json = db.Column(db.JSON, nullable=True)
    sort_order = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc),
                           onupdate=lambda: datetime.now(timezone.utc))

    overrides = db.relationship('FeatureFlagOverride', backref='feature_flag',
                                cascade='all, delete-orphan')

    @property
    def override_count(self):
        return len(self.overrides or [])

    def to_dict(self, include_overrides=False):
        payload = {
            'id': self.id,
            'feature_key': self.feature_key,
            'description': self.description,
            'is_enabled': self.is_enabled,
            'scope': self.scope,
            'config_json': self.config_json,
            'override_count': self.override_count,
            'sort_order': self.sort_order,
        }
        if include_overrides:
            payload['overrides'] = [override.to_dict() for override in self.overrides or []]
        return payload


class FeatureFlagOverride(db.Model):
    __tablename__ = 'feature_flag_overrides'
    __table_args__ = (
        db.UniqueConstraint('feature_flag_id', 'development_id', name='uq_flag_development'),
    )

    id = db.Column(db.Integer, primary_key=True)
    feature_flag_id = db.Column(db.Integer, db.ForeignKey('feature_flags.id'), nullable=False, index=True)
    development_id = db.Column(db.Integer, db.ForeignKey('developments.id'), nullable=False, index=True)
    is_enabled = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    development = db.relationship('Development')

    def to_dict(self):
        return {
            'id': self.id,
            'feature_flag_id': self.feature_flag_id,
            'development_id': self.development_id,
            'development_name': self.development.name if self.development else None,
            'is_enabled': self.is_enabled,
        }
