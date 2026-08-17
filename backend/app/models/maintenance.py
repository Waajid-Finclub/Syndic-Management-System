"""
Maintenance models — issue reporting and the work that follows it.

The resident-facing value here is the timeline: a request is not a status
string, it is an ordered series of events a co-owner can watch advance. So
status changes append a MaintenanceEvent rather than only mutating a column,
and the detail screen renders that history. The column still exists because
filtering a list by "the latest event" is expensive and pointless.

Photos are written to instance/uploads/maintenance and referenced by path.
Image bytes in a transactional database bloat every backup for no benefit.
"""
from datetime import datetime, timezone

from ..extensions import db

# Categories a resident can pick on the report screen. The icon key maps to a
# lucide component in the app; the emoji is not stored.
MAINTENANCE_CATEGORIES = [
    {'key': 'plumbing', 'label': 'Plumbing', 'icon': 'wrench'},
    {'key': 'electrical', 'label': 'Electrical', 'icon': 'zap'},
    {'key': 'structural', 'label': 'Structural', 'icon': 'brick-wall'},
    {'key': 'cleaning', 'label': 'Cleaning', 'icon': 'sparkles'},
    {'key': 'security', 'label': 'Security', 'icon': 'shield'},
    {'key': 'lift', 'label': 'Lift', 'icon': 'arrow-up-down'},
    {'key': 'parking_gate', 'label': 'Parking / Gate', 'icon': 'car-front'},
    {'key': 'pool', 'label': 'Pool', 'icon': 'waves'},
    {'key': 'gym', 'label': 'Gym', 'icon': 'dumbbell'},
    {'key': 'hvac', 'label': 'HVAC', 'icon': 'snowflake'},
    {'key': 'storage', 'label': 'Storage', 'icon': 'package'},
    {'key': 'other', 'label': 'Other', 'icon': 'circle-help'},
]
MAINTENANCE_CATEGORY_KEYS = [c['key'] for c in MAINTENANCE_CATEGORIES]
MAINTENANCE_CATEGORY_LABELS = {c['key']: c['label'] for c in MAINTENANCE_CATEGORIES}

PRIORITIES = [
    {'key': 'low', 'label': 'Low'},
    {'key': 'normal', 'label': 'Normal'},
    {'key': 'urgent', 'label': 'Urgent'},
    {'key': 'emergency', 'label': 'Emergency'},
]
PRIORITY_KEYS = [p['key'] for p in PRIORITIES]

# The seven timeline steps the detail screen draws, in order.
REQUEST_STATUSES = [
    {'key': 'open', 'label': 'Submitted', 'sequence': 1},
    {'key': 'acknowledged', 'label': 'Acknowledged by Syndic', 'sequence': 2},
    {'key': 'assigned', 'label': 'Vendor Assigned', 'sequence': 3},
    {'key': 'accepted', 'label': 'Vendor Accepted Job', 'sequence': 4},
    {'key': 'in_progress', 'label': 'Repair In Progress', 'sequence': 5},
    {'key': 'resolved', 'label': 'Completed', 'sequence': 6},
    {'key': 'closed', 'label': 'Closed & Rated', 'sequence': 7},
]
REQUEST_STATUS_KEYS = [s['key'] for s in REQUEST_STATUSES]
REQUEST_STATUS_LABELS = {s['key']: s['label'] for s in REQUEST_STATUSES}
REQUEST_STATUS_SEQUENCE = {s['key']: s['sequence'] for s in REQUEST_STATUSES}

MESSAGE_AUTHOR_ROLES = ['resident', 'syndic', 'vendor']


class Vendor(db.Model):
    __tablename__ = 'vendors'

    id = db.Column(db.Integer, primary_key=True)
    development_id = db.Column(db.Integer, db.ForeignKey('developments.id'), nullable=True, index=True)

    name = db.Column(db.String(150), nullable=False)
    trade = db.Column(db.String(80), nullable=True)            # "Plumbing"
    contact_name = db.Column(db.String(120), nullable=True)
    contact_phone = db.Column(db.String(50), nullable=True)
    contact_email = db.Column(db.String(255), nullable=True)

    rating = db.Column(db.Numeric(3, 2), nullable=True)
    completed_jobs = db.Column(db.Integer, nullable=False, default=0)
    status = db.Column(db.String(30), nullable=False, default='active')
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'trade': self.trade,
            'contact_name': self.contact_name,
            'contact_phone': self.contact_phone,
            'rating': float(self.rating) if self.rating is not None else None,
            'completed_jobs': self.completed_jobs,
            'status': self.status,
        }


class MaintenanceRequest(db.Model):
    __tablename__ = 'maintenance_requests'

    id = db.Column(db.Integer, primary_key=True)
    development_id = db.Column(db.Integer, db.ForeignKey('developments.id'), nullable=False, index=True)
    unit_id = db.Column(db.Integer, db.ForeignKey('units.id'), nullable=True, index=True)
    reported_by_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)

    reference = db.Column(db.String(40), unique=True, nullable=False, index=True)  # "MR-2026-0042"
    category = db.Column(db.String(40), nullable=False, default='other')
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, nullable=True)
    location_label = db.Column(db.String(120), nullable=True)  # "Unit 4B", "Parking B1"
    priority = db.Column(db.String(30), nullable=False, default='normal', index=True)
    status = db.Column(db.String(30), nullable=False, default='open', index=True)

    vendor_id = db.Column(db.Integer, db.ForeignKey('vendors.id'), nullable=True)
    scheduled_for = db.Column(db.DateTime, nullable=True)
    eta_label = db.Column(db.String(80), nullable=True)         # "Tomorrow"

    rating = db.Column(db.Integer, nullable=True)               # 1-5, set on close
    rating_comment = db.Column(db.Text, nullable=True)

    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc),
                           onupdate=lambda: datetime.now(timezone.utc))
    closed_at = db.Column(db.DateTime, nullable=True)

    unit = db.relationship('Unit', backref='maintenance_requests')
    vendor = db.relationship('Vendor')
    reported_by = db.relationship('User')
    events = db.relationship('MaintenanceEvent', backref='request', cascade='all, delete-orphan',
                             order_by='MaintenanceEvent.sequence')
    photos = db.relationship('MaintenancePhoto', backref='request', cascade='all, delete-orphan')
    messages = db.relationship('MaintenanceMessage', backref='request', cascade='all, delete-orphan',
                               order_by='MaintenanceMessage.created_at')

    @property
    def category_label(self):
        return MAINTENANCE_CATEGORY_LABELS.get(self.category, self.category)

    @property
    def status_label(self):
        return REQUEST_STATUS_LABELS.get(self.status, self.status)

    @property
    def is_open(self):
        return self.status not in ('resolved', 'closed')

    def timeline(self):
        """The seven fixed steps, marked done from the events actually recorded."""
        recorded = {event.status_key: event for event in self.events}
        reached = REQUEST_STATUS_SEQUENCE.get(self.status, 1)
        steps = []
        for step in REQUEST_STATUSES:
            event = recorded.get(step['key'])
            steps.append({
                'key': step['key'],
                'label': event.label if event and event.label else step['label'],
                'detail': event.detail if event else None,
                'occurred_at': event.occurred_at.isoformat() if event and event.occurred_at else None,
                'done': step['sequence'] <= reached and event is not None,
            })
        return steps

    def to_dict(self, include_detail=False):
        payload = {
            'id': self.id,
            'reference': self.reference,
            'category': self.category,
            'category_label': self.category_label,
            'title': self.title,
            'location_label': self.location_label,
            'priority': self.priority,
            'status': self.status,
            'status_label': self.status_label,
            'is_open': self.is_open,
            'vendor_id': self.vendor_id,
            'vendor_name': self.vendor.name if self.vendor else None,
            'eta_label': self.eta_label,
            'scheduled_for': self.scheduled_for.isoformat() if self.scheduled_for else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'unit_label': self.unit.label if self.unit else None,
            'photo_count': len(self.photos),
        }
        if include_detail:
            payload.update({
                'description': self.description,
                'timeline': self.timeline(),
                'vendor': self.vendor.to_dict() if self.vendor else None,
                'photos': [photo.to_dict() for photo in self.photos],
                'messages': [message.to_dict() for message in self.messages],
                'rating': self.rating,
                'rating_comment': self.rating_comment,
                'reported_by_name': self.reported_by.name if self.reported_by else None,
            })
        return payload


class MaintenanceEvent(db.Model):
    """One step on the progress timeline. Append-only."""
    __tablename__ = 'maintenance_events'

    id = db.Column(db.Integer, primary_key=True)
    request_id = db.Column(db.Integer, db.ForeignKey('maintenance_requests.id'), nullable=False, index=True)
    sequence = db.Column(db.Integer, nullable=False, default=0)
    status_key = db.Column(db.String(30), nullable=False)
    label = db.Column(db.String(160), nullable=True)
    detail = db.Column(db.String(255), nullable=True)
    actor_label = db.Column(db.String(120), nullable=True)
    occurred_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            'id': self.id,
            'status_key': self.status_key,
            'label': self.label or REQUEST_STATUS_LABELS.get(self.status_key, self.status_key),
            'detail': self.detail,
            'actor_label': self.actor_label,
            'occurred_at': self.occurred_at.isoformat() if self.occurred_at else None,
        }


class MaintenancePhoto(db.Model):
    __tablename__ = 'maintenance_photos'

    id = db.Column(db.Integer, primary_key=True)
    request_id = db.Column(db.Integer, db.ForeignKey('maintenance_requests.id'), nullable=False, index=True)
    filename = db.Column(db.String(255), nullable=False)
    storage_path = db.Column(db.String(500), nullable=False)
    content_type = db.Column(db.String(80), nullable=True)
    size_bytes = db.Column(db.Integer, nullable=False, default=0)
    uploaded_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            'id': self.id,
            'filename': self.filename,
            'content_type': self.content_type,
            'size_bytes': self.size_bytes,
            'url': f'/api/resident/maintenance/{self.request_id}/photos/{self.id}',
        }


class MaintenanceMessage(db.Model):
    """Thread between the resident, the syndic office and the assigned vendor."""
    __tablename__ = 'maintenance_messages'

    id = db.Column(db.Integer, primary_key=True)
    request_id = db.Column(db.Integer, db.ForeignKey('maintenance_requests.id'), nullable=False, index=True)
    author_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    author_label = db.Column(db.String(120), nullable=False, default='Resident')
    author_role = db.Column(db.String(30), nullable=False, default='resident')
    body = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            'id': self.id,
            'author_label': self.author_label,
            'author_role': self.author_role,
            'body': self.body,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
