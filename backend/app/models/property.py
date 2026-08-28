"""
Property models — the physical registry inside one development.

The admin console stores only aggregate counts per development (unit_count,
parking_count, storage_count). Those totals are what a platform operator needs;
they are useless to a resident, who needs to know *which* unit is theirs, what
share it carries, and which bay and store are allocated to it. These tables
hold those individual rows.

Share allocation is the spine of the product. A unit's share_value is its weight
in every AGM vote and the basis of its service-charge apportionment, so shares
across a development are seeded to sum to exactly 10,000. The total is derived
(SUM over units) rather than stored: a stored total can drift out of step with
its own rows, and a co-owner reading "152 / 10,000" has to be able to trust the
denominator.
"""
from datetime import datetime, timezone

from ..extensions import db

UNIT_TYPES = ['studio', 'T1', 'T2', 'T3', 'T4', 'penthouse', 'duplex', 'commercial']

# How a bay or store is held. 'owner' is allocated with the unit and carries no
# rent; 'rental' is let separately; 'visitor' and 'common' belong to everyone.
ALLOCATION_TYPES = ['owner', 'rental', 'visitor', 'common']

FACILITY_TYPES = [
    {'key': 'pool', 'label': 'Swimming Pool'},
    {'key': 'gym', 'label': 'Gymnasium'},
    {'key': 'hall', 'label': 'Community Hall'},
    {'key': 'visitor_parking', 'label': 'Visitor Parking'},
    {'key': 'garden', 'label': 'Garden'},
    {'key': 'roof', 'label': 'Roof Terrace'},
]
FACILITY_TYPE_KEYS = [f['key'] for f in FACILITY_TYPES]


class Block(db.Model):
    """A building within a development. Small developments have exactly one."""
    __tablename__ = 'blocks'

    id = db.Column(db.Integer, primary_key=True)
    development_id = db.Column(db.Integer, db.ForeignKey('developments.id'), nullable=False, index=True)
    name = db.Column(db.String(80), nullable=False)
    floors = db.Column(db.Integer, nullable=False, default=1)

    development = db.relationship('Development')

    def to_dict(self):
        return {
            'id': self.id,
            'development_id': self.development_id,
            'name': self.name,
            'floors': self.floors,
        }


class Unit(db.Model):
    __tablename__ = 'units'

    id = db.Column(db.Integer, primary_key=True)
    development_id = db.Column(db.Integer, db.ForeignKey('developments.id'), nullable=False, index=True)
    block_id = db.Column(db.Integer, db.ForeignKey('blocks.id'), nullable=True, index=True)

    label = db.Column(db.String(30), nullable=False)          # "4B"
    unit_type = db.Column(db.String(30), nullable=False, default='T2')
    floor = db.Column(db.Integer, nullable=True)
    area_sqm = db.Column(db.Numeric(8, 2), nullable=True)

    # Weight in votes and in the service-charge apportionment.
    share_value = db.Column(db.Integer, nullable=False, default=0)

    # Monthly service charge raised against this unit.
    monthly_charge = db.Column(db.Numeric(12, 2), nullable=False, default=0)

    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    development = db.relationship('Development')
    block = db.relationship('Block', backref='units')
    ownerships = db.relationship('UnitOwnership', backref='unit', cascade='all, delete-orphan')
    tenancies = db.relationship('UnitTenancy', backref='unit', cascade='all, delete-orphan')

    __table_args__ = (
        db.UniqueConstraint('development_id', 'label', name='uq_unit_label_per_development'),
    )

    @property
    def total_shares(self):
        """Shares across the whole development — the denominator on every screen."""
        total = db.session.query(db.func.sum(Unit.share_value)).filter(
            Unit.development_id == self.development_id
        ).scalar()
        return int(total or 0)

    @property
    def share_percent(self):
        total = self.total_shares
        if not total:
            return 0.0
        return round(self.share_value / total * 100, 2)

    @property
    def block_name(self):
        return self.block.name if self.block else None

    def to_dict(self, include_shares=True):
        payload = {
            'id': self.id,
            'development_id': self.development_id,
            'development_name': self.development.name if self.development else None,
            'block_id': self.block_id,
            'block_name': self.block_name,
            'label': self.label,
            'unit_type': self.unit_type,
            'floor': self.floor,
            'area_sqm': float(self.area_sqm) if self.area_sqm is not None else None,
            'monthly_charge': float(self.monthly_charge or 0),
        }
        if include_shares:
            payload.update({
                'share_value': self.share_value,
                'total_shares': self.total_shares,
                'share_percent': self.share_percent,
            })
        return payload


class UnitOwnership(db.Model):
    """Links a co-owner to a unit. A unit may be jointly held."""
    __tablename__ = 'unit_ownerships'

    id = db.Column(db.Integer, primary_key=True)
    unit_id = db.Column(db.Integer, db.ForeignKey('units.id'), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    ownership_percent = db.Column(db.Numeric(8, 4), nullable=False, default=100)
    is_primary_contact = db.Column(db.Boolean, nullable=False, default=True)
    start_date = db.Column(db.Date, nullable=True)
    end_date = db.Column(db.Date, nullable=True)

    user = db.relationship('User')

    @property
    def is_current(self):
        return self.end_date is None

    def to_dict(self):
        return {
            'id': self.id,
            'unit_id': self.unit_id,
            'user_id': self.user_id,
            'user_name': self.user.name if self.user else None,
            'ownership_percent': float(self.ownership_percent or 0),
            'is_primary_contact': self.is_primary_contact,
        }


class UnitTenancy(db.Model):
    """
    Who occupies a unit that its owner does not live in.

    This is an occupancy record, not an account. Logins on this platform belong
    to co-owners: service charges are the owner's liability and votes follow the
    owner's title, so a renter has nothing to sign in to. The syndic still needs
    to know who is behind the door for maintenance access, gate passes and an
    evacuation list, and that is what these rows are for. `user_id` stays
    nullable for the rare case where an occupant also holds a unit of their own.
    """
    __tablename__ = 'unit_tenancies'

    id = db.Column(db.Integer, primary_key=True)
    unit_id = db.Column(db.Integer, db.ForeignKey('units.id'), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True, index=True)

    occupant_name = db.Column(db.String(150), nullable=True)
    occupant_email = db.Column(db.String(255), nullable=True)
    occupant_phone = db.Column(db.String(50), nullable=True)

    lease_start_date = db.Column(db.Date, nullable=True)
    lease_end_date = db.Column(db.Date, nullable=True)
    is_current = db.Column(db.Boolean, nullable=False, default=True)

    user = db.relationship('User')

    @property
    def display_name(self):
        return self.occupant_name or (self.user.name if self.user else 'Occupant')

    def to_dict(self):
        return {
            'id': self.id,
            'unit_id': self.unit_id,
            'unit_label': self.unit.label if self.unit else None,
            'user_id': self.user_id,
            'user_name': self.display_name,
            'occupant_name': self.occupant_name,
            'occupant_email': self.occupant_email,
            'occupant_phone': self.occupant_phone,
            'lease_start_date': self.lease_start_date.isoformat() if self.lease_start_date else None,
            'lease_end_date': self.lease_end_date.isoformat() if self.lease_end_date else None,
            'is_current': self.is_current,
        }


class ParkingBay(db.Model):
    __tablename__ = 'parking_bays'

    id = db.Column(db.Integer, primary_key=True)
    development_id = db.Column(db.Integer, db.ForeignKey('developments.id'), nullable=False, index=True)
    unit_id = db.Column(db.Integer, db.ForeignKey('units.id'), nullable=True, index=True)

    code = db.Column(db.String(30), nullable=False)            # "B-12", "E-3", "V-03"
    level = db.Column(db.String(30), nullable=True)            # "B1"
    allocation = db.Column(db.String(30), nullable=False, default='owner')
    status = db.Column(db.String(30), nullable=False, default='available')

    # EV bays only.
    is_ev = db.Column(db.Boolean, nullable=False, default=False)
    charger_kw = db.Column(db.Numeric(6, 2), nullable=True)
    charger_type = db.Column(db.String(30), nullable=True)     # "AC", "DC"
    tariff_per_kwh = db.Column(db.Numeric(8, 2), nullable=True)

    unit = db.relationship('Unit', backref='parking_bays')

    __table_args__ = (
        db.UniqueConstraint('development_id', 'code', name='uq_bay_code_per_development'),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'development_id': self.development_id,
            'unit_id': self.unit_id,
            'unit_label': self.unit.label if self.unit else None,
            'code': self.code,
            'level': self.level,
            'allocation': self.allocation,
            'status': self.status,
            'is_ev': self.is_ev,
            'charger_kw': float(self.charger_kw) if self.charger_kw is not None else None,
            'charger_type': self.charger_type,
            'tariff_per_kwh': float(self.tariff_per_kwh) if self.tariff_per_kwh is not None else None,
        }


class StorageUnit(db.Model):
    __tablename__ = 'storage_units'

    id = db.Column(db.Integer, primary_key=True)
    development_id = db.Column(db.Integer, db.ForeignKey('developments.id'), nullable=False, index=True)
    unit_id = db.Column(db.Integer, db.ForeignKey('units.id'), nullable=True, index=True)

    code = db.Column(db.String(30), nullable=False)            # "S-07"
    level = db.Column(db.String(30), nullable=True)
    area_sqm = db.Column(db.Numeric(8, 2), nullable=True)
    allocation = db.Column(db.String(30), nullable=False, default='owner')
    access_method = db.Column(db.String(60), nullable=True)    # "Fob access"
    status = db.Column(db.String(30), nullable=False, default='allocated')

    unit = db.relationship('Unit', backref='storage_units')

    __table_args__ = (
        db.UniqueConstraint('development_id', 'code', name='uq_store_code_per_development'),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'development_id': self.development_id,
            'unit_id': self.unit_id,
            'unit_label': self.unit.label if self.unit else None,
            'code': self.code,
            'level': self.level,
            'area_sqm': float(self.area_sqm) if self.area_sqm is not None else None,
            'allocation': self.allocation,
            'access_method': self.access_method,
            'status': self.status,
        }


class Facility(db.Model):
    __tablename__ = 'facilities'

    id = db.Column(db.Integer, primary_key=True)
    development_id = db.Column(db.Integer, db.ForeignKey('developments.id'), nullable=False, index=True)

    name = db.Column(db.String(120), nullable=False)
    facility_type = db.Column(db.String(40), nullable=False, default='pool')
    hours_label = db.Column(db.String(80), nullable=True)      # "6am-8pm daily"
    opens_hour = db.Column(db.Integer, nullable=True)          # 24h, drives the "Open now" badge
    closes_hour = db.Column(db.Integer, nullable=True)
    detail = db.Column(db.String(200), nullable=True)          # "25m heated pool"
    rules = db.Column(db.Text, nullable=True)

    booking_required = db.Column(db.Boolean, nullable=False, default=False)
    capacity = db.Column(db.Integer, nullable=True)
    slot_hours = db.Column(db.Integer, nullable=False, default=2)
    booking_rate = db.Column(db.Numeric(12, 2), nullable=True)
    booking_rate_label = db.Column(db.String(80), nullable=True)  # "Rs 3,000 / 2hrs"

    status = db.Column(db.String(30), nullable=False, default='active')
    sort_order = db.Column(db.Integer, nullable=False, default=0)

    development = db.relationship('Development')

    def is_open_at(self, moment):
        if self.opens_hour is None or self.closes_hour is None:
            return None
        return self.opens_hour <= moment.hour < self.closes_hour

    def to_dict(self, moment=None):
        return {
            'id': self.id,
            'development_id': self.development_id,
            'name': self.name,
            'facility_type': self.facility_type,
            'hours_label': self.hours_label,
            'detail': self.detail,
            'rules': self.rules,
            'booking_required': self.booking_required,
            'capacity': self.capacity,
            'slot_hours': self.slot_hours,
            'booking_rate': float(self.booking_rate) if self.booking_rate is not None else None,
            'booking_rate_label': self.booking_rate_label,
            'status': self.status,
            'is_open': self.is_open_at(moment) if moment else None,
        }
