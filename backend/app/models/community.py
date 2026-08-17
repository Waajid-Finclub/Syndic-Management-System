"""
Community models — notices, bookings, visitors and the document library.

Two rules shape this module:

* A booking must not double-book. The unique constraint on
  (facility_id, booking_date, slot_start) is what actually guarantees that;
  the availability endpoint is a convenience, not the enforcement point.
* A visitor pass is a credential. Its access code is what the gate accepts, so
  it is generated server-side with `secrets` and is never derived from the
  visitor's name, the unit number or a sequence anyone could guess.

Documents carry an optional unit_id: folders shared with the whole development
leave it NULL, while "My Documents" rows (title deed, purchase agreement) are
scoped to one unit and are filtered out for every other resident.
"""
import secrets
from datetime import datetime, timezone

from ..extensions import db

ANNOUNCEMENT_PRIORITIES = ['urgent', 'info']

BOOKING_STATUSES = ['pending', 'confirmed', 'cancelled', 'completed']

VISIT_PURPOSES = [
    {'key': 'personal', 'label': 'Personal'},
    {'key': 'delivery', 'label': 'Delivery'},
    {'key': 'service', 'label': 'Service'},
    {'key': 'other', 'label': 'Other'},
]
VISIT_PURPOSE_KEYS = [p['key'] for p in VISIT_PURPOSES]

VISITOR_STATUSES = ['pending', 'active', 'used', 'expired', 'cancelled']

# Parking durations offered on the visitor form, in hours. 0 means no parking.
VISITOR_PARKING_OPTIONS = [0, 2, 4, 24]

DOCUMENT_FOLDER_CATEGORIES = [
    {'key': 'rules', 'label': 'Co-Ownership Rules', 'icon': 'clipboard-list'},
    {'key': 'financial', 'label': 'Financial Statements', 'icon': 'chart-column'},
    {'key': 'minutes', 'label': 'Meeting Minutes', 'icon': 'folder'},
    {'key': 'contracts', 'label': 'Contracts & Insurance', 'icon': 'file-text'},
    {'key': 'funds', 'label': 'Reserve Fund', 'icon': 'landmark'},
    {'key': 'contacts', 'label': 'Contacts', 'icon': 'phone'},
    {'key': 'private', 'label': 'My Documents', 'icon': 'file-lock'},
]
DOCUMENT_FOLDER_CATEGORY_KEYS = [f['key'] for f in DOCUMENT_FOLDER_CATEGORIES]


class Announcement(db.Model):
    __tablename__ = 'announcements'

    id = db.Column(db.Integer, primary_key=True)
    development_id = db.Column(db.Integer, db.ForeignKey('developments.id'), nullable=False, index=True)

    title = db.Column(db.String(200), nullable=False)
    body = db.Column(db.Text, nullable=True)
    priority = db.Column(db.String(20), nullable=False, default='info')
    author_label = db.Column(db.String(120), nullable=True)
    whatsapp_sent = db.Column(db.Boolean, nullable=False, default=False)
    published_at = db.Column(db.DateTime, nullable=False,
                             default=lambda: datetime.now(timezone.utc), index=True)

    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'body': self.body,
            'priority': self.priority,
            'author_label': self.author_label,
            'whatsapp_sent': self.whatsapp_sent,
            'published_at': self.published_at.isoformat() if self.published_at else None,
        }


class FacilityBooking(db.Model):
    __tablename__ = 'facility_bookings'

    id = db.Column(db.Integer, primary_key=True)
    facility_id = db.Column(db.Integer, db.ForeignKey('facilities.id'), nullable=False, index=True)
    development_id = db.Column(db.Integer, db.ForeignKey('developments.id'), nullable=False, index=True)
    unit_id = db.Column(db.Integer, db.ForeignKey('units.id'), nullable=True, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)

    booking_date = db.Column(db.Date, nullable=False, index=True)
    slot_start = db.Column(db.Integer, nullable=False)          # hour, 24h clock
    slot_end = db.Column(db.Integer, nullable=False)
    status = db.Column(db.String(30), nullable=False, default='confirmed')
    amount = db.Column(db.Numeric(12, 2), nullable=False, default=0)
    notes = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    facility = db.relationship('Facility', backref='bookings')
    unit = db.relationship('Unit')
    user = db.relationship('User')

    # The real defence against a double booking.
    __table_args__ = (
        db.UniqueConstraint('facility_id', 'booking_date', 'slot_start',
                            name='uq_one_booking_per_slot'),
    )

    @property
    def slot_label(self):
        def clock(hour):
            suffix = 'am' if hour < 12 else 'pm'
            display = hour % 12 or 12
            return f'{display}{suffix}'

        return f'{clock(self.slot_start)}-{clock(self.slot_end)}'

    def to_dict(self):
        return {
            'id': self.id,
            'facility_id': self.facility_id,
            'facility_name': self.facility.name if self.facility else None,
            'booking_date': self.booking_date.isoformat() if self.booking_date else None,
            'slot_start': self.slot_start,
            'slot_end': self.slot_end,
            'slot_label': self.slot_label,
            'status': self.status,
            'amount': float(self.amount or 0),
            'unit_label': self.unit.label if self.unit else None,
        }


class VisitorPass(db.Model):
    __tablename__ = 'visitor_passes'

    id = db.Column(db.Integer, primary_key=True)
    development_id = db.Column(db.Integer, db.ForeignKey('developments.id'), nullable=False, index=True)
    unit_id = db.Column(db.Integer, db.ForeignKey('units.id'), nullable=True, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)

    visitor_name = db.Column(db.String(150), nullable=False)
    vehicle_registration = db.Column(db.String(40), nullable=True)
    purpose = db.Column(db.String(30), nullable=False, default='personal')
    expected_at = db.Column(db.DateTime, nullable=False, index=True)

    parking_hours = db.Column(db.Integer, nullable=False, default=0)
    bay_id = db.Column(db.Integer, db.ForeignKey('parking_bays.id'), nullable=True)
    bay_code = db.Column(db.String(30), nullable=True)

    # What the gate actually checks. Generated, never derived.
    access_code = db.Column(db.String(20), unique=True, nullable=False, index=True)
    access_pin = db.Column(db.String(10), nullable=False)

    status = db.Column(db.String(30), nullable=False, default='pending')
    whatsapp_sent = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    unit = db.relationship('Unit')
    bay = db.relationship('ParkingBay')

    @staticmethod
    def generate_credentials():
        alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'  # no I/O/0/1 — these get read aloud
        code = ''.join(secrets.choice(alphabet) for _ in range(6))
        pin = ''.join(secrets.choice('0123456789') for _ in range(4))
        return code, pin

    @property
    def parking_label(self):
        if not self.parking_hours:
            return 'None'
        if self.bay_code:
            return f'Bay {self.bay_code} ({self.parking_hours}h)'
        return f'{self.parking_hours}h'

    def to_dict(self, include_credentials=True):
        payload = {
            'id': self.id,
            'visitor_name': self.visitor_name,
            'vehicle_registration': self.vehicle_registration,
            'purpose': self.purpose,
            'expected_at': self.expected_at.isoformat() if self.expected_at else None,
            'parking_hours': self.parking_hours,
            'bay_code': self.bay_code,
            'parking_label': self.parking_label,
            'status': self.status,
            'whatsapp_sent': self.whatsapp_sent,
            'unit_label': self.unit.label if self.unit else None,
        }
        if include_credentials:
            payload['access_code'] = self.access_code
            payload['access_pin'] = self.access_pin
        return payload


class DocumentFolder(db.Model):
    __tablename__ = 'document_folders'

    id = db.Column(db.Integer, primary_key=True)
    development_id = db.Column(db.Integer, db.ForeignKey('developments.id'), nullable=False, index=True)
    name = db.Column(db.String(120), nullable=False)
    category = db.Column(db.String(40), nullable=False, default='rules')
    # Private folders hold per-unit paperwork and are filtered by unit_id.
    is_private = db.Column(db.Boolean, nullable=False, default=False)
    sort_order = db.Column(db.Integer, nullable=False, default=0)

    documents = db.relationship('Document', backref='folder', cascade='all, delete-orphan',
                                order_by='Document.title')

    def to_dict(self, documents=None):
        rows = self.documents if documents is None else documents
        return {
            'id': self.id,
            'name': self.name,
            'category': self.category,
            'is_private': self.is_private,
            'document_count': len(rows),
            'documents': [document.to_dict() for document in rows],
        }


class Document(db.Model):
    __tablename__ = 'documents'

    id = db.Column(db.Integer, primary_key=True)
    folder_id = db.Column(db.Integer, db.ForeignKey('document_folders.id'), nullable=False, index=True)
    development_id = db.Column(db.Integer, db.ForeignKey('developments.id'), nullable=False, index=True)
    # NULL means every resident of the development may read it.
    unit_id = db.Column(db.Integer, db.ForeignKey('units.id'), nullable=True, index=True)

    title = db.Column(db.String(200), nullable=False)
    filename = db.Column(db.String(255), nullable=False)
    storage_path = db.Column(db.String(500), nullable=False)
    content_type = db.Column(db.String(80), nullable=False, default='application/pdf')
    size_bytes = db.Column(db.Integer, nullable=False, default=0)
    version_label = db.Column(db.String(40), nullable=True)
    uploaded_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            'id': self.id,
            'folder_id': self.folder_id,
            'title': self.title,
            'filename': self.filename,
            'content_type': self.content_type,
            'size_bytes': self.size_bytes,
            'version_label': self.version_label,
            'uploaded_at': self.uploaded_at.isoformat() if self.uploaded_at else None,
            'url': f'/api/resident/documents/{self.id}/file',
        }
