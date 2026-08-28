"""
Property registry — blocks, units, parking, storage and facilities.

This is the module the whole platform stands on. A unit's `share_value` is its
weight in every AGM vote and the basis of its service-charge apportionment, so
the endpoints here report the development's share total on every response and
refuse to leave it un-reconcilable: adding a unit with shares that push the
total past its target is the kind of error nobody notices until a vote is
disputed a year later.

Deletes are refused where a record has financial or governance history. A unit
that has been invoiced cannot be removed, only re-labelled: the invoice is a
document that was sent to a person, and orphaning it to tidy a list is not a
trade worth making.
"""
from decimal import Decimal, InvalidOperation

from flask import Blueprint, jsonify, request
from flask_login import current_user

from ...extensions import db
from ...models import (
    Block,
    Facility,
    Invoice,
    MaintenanceRequest,
    ParkingBay,
    StorageUnit,
    Unit,
)
from ...models.audit import record_audit
from ...models.property import (
    ALLOCATION_TYPES,
    FACILITY_TYPES,
    UNIT_TYPES,
)
from ...utils.validation import as_bool, as_int, clean_string, json_dict, one_of
from ._access import (
    current_development,
    current_development_id,
    ensure,
    owned,
    require,
    scoped,
)

registry_bp = Blueprint('syndic_registry', __name__)

# Shares across a development are apportioned out of 10,000 — the convention
# used on Mauritian co-ownership deeds and the denominator every screen shows.
SHARE_TARGET = 10000


def _decimal(value, default=None):
    if value is None or value == '':
        return default
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        return default


def _share_summary(development_id):
    allocated = db.session.query(db.func.sum(Unit.share_value)).filter(
        Unit.development_id == development_id,
    ).scalar() or 0
    allocated = int(allocated)
    return {
        'allocated': allocated,
        'target': SHARE_TARGET,
        'remaining': SHARE_TARGET - allocated,
        'is_balanced': allocated == SHARE_TARGET,
    }


def _refresh_counts():
    """
    Keep the development's headline counts in step with its rows.

    The platform console reads these totals rather than counting rows across
    5,000 tenants, so they have to be maintained where the rows change.
    """
    development = current_development()
    development_id = development.id
    development.unit_count = Unit.query.filter(Unit.development_id == development_id).count()
    development.parking_count = ParkingBay.query.filter(
        ParkingBay.development_id == development_id,
    ).count()
    development.ev_parking_count = ParkingBay.query.filter(
        ParkingBay.development_id == development_id,
        ParkingBay.is_ev.is_(True),
    ).count()
    development.storage_count = StorageUnit.query.filter(
        StorageUnit.development_id == development_id,
    ).count()
    development.facility_count = Facility.query.filter(
        Facility.development_id == development_id,
    ).count()

    subscription = development.subscription
    if subscription is not None:
        # The platform bills per active unit, so the registry is the meter.
        subscription.active_units_count = development.unit_count


# --- Meta -------------------------------------------------------------------

@registry_bp.route('/meta', methods=['GET'])
@require('registry', 'view')
def meta():
    return jsonify({
        'unit_types': UNIT_TYPES,
        'allocation_types': ALLOCATION_TYPES,
        'facility_types': FACILITY_TYPES,
        'share_target': SHARE_TARGET,
    })


# --- Blocks -----------------------------------------------------------------

@registry_bp.route('/blocks', methods=['GET'])
@require('registry', 'view')
def list_blocks():
    blocks = scoped(Block).order_by(Block.name).all()
    counts = dict(
        db.session.query(Unit.block_id, db.func.count(Unit.id))
        .filter(Unit.development_id == current_development_id())
        .group_by(Unit.block_id)
        .all()
    )
    return jsonify({
        'blocks': [{**block.to_dict(), 'unit_count': counts.get(block.id, 0)} for block in blocks],
    })


@registry_bp.route('/blocks', methods=['POST'])
@require('registry', 'create')
def create_block():
    payload = json_dict(request)
    name = clean_string(payload.get('name'), 80)
    if not name:
        return jsonify({'error': 'A block name is required'}), 400

    block = Block(
        development_id=current_development_id(),
        name=name,
        floors=as_int(payload.get('floors'), 1, minimum=1, maximum=200),
    )
    db.session.add(block)
    record_audit('CREATE', 'Block', f'Block {name} added', category='config',
                 user=current_user, development=current_development())
    db.session.commit()
    return jsonify(block.to_dict()), 201


@registry_bp.route('/blocks/<int:block_id>', methods=['PUT', 'PATCH'])
@require('registry', 'edit')
def update_block(block_id):
    block, denied = owned(Block, block_id)
    if denied:
        return denied

    payload = json_dict(request)
    if 'name' in payload:
        name = clean_string(payload.get('name'), 80)
        if not name:
            return jsonify({'error': 'A block name is required'}), 400
        block.name = name
    if 'floors' in payload:
        block.floors = as_int(payload.get('floors'), block.floors, minimum=1, maximum=200)

    db.session.commit()
    return jsonify(block.to_dict())


@registry_bp.route('/blocks/<int:block_id>', methods=['DELETE'])
@require('registry', 'delete')
def delete_block(block_id):
    block, denied = owned(Block, block_id)
    if denied:
        return denied
    if Unit.query.filter(Unit.block_id == block.id).count():
        return jsonify({'error': 'Move or remove this block\'s units first'}), 409

    name = block.name
    db.session.delete(block)
    record_audit('DELETE', 'Block', f'Block {name} removed', category='config',
                 user=current_user, development=current_development())
    db.session.commit()
    return jsonify({'ok': True})


# --- Units ------------------------------------------------------------------

@registry_bp.route('/units', methods=['GET'])
@require('registry', 'view')
def list_units():
    query = scoped(Unit)

    block_id = as_int(request.args.get('block_id'))
    if block_id:
        query = query.filter(Unit.block_id == block_id)

    search = clean_string(request.args.get('q'))
    if search:
        query = query.filter(db.func.lower(Unit.label).like(f'%{search.lower()}%'))

    units = query.order_by(Unit.label).all()
    return jsonify({
        'units': [_unit_row(unit) for unit in units],
        'shares': _share_summary(current_development_id()),
    })


def _unit_row(unit):
    """A registry row: the unit, who holds it, and what it owes."""
    owners = [
        {
            'user_id': ownership.user_id,
            'name': ownership.user.name if ownership.user else None,
            'email': ownership.user.email if ownership.user else None,
            'percent': float(ownership.ownership_percent or 0),
            'is_primary_contact': ownership.is_primary_contact,
        }
        for ownership in unit.ownerships
        if ownership.is_current
    ]
    occupants = [
        {
            'id': tenancy.id,
            'name': tenancy.display_name,
            'phone': tenancy.occupant_phone,
            'lease_end_date': tenancy.lease_end_date.isoformat() if tenancy.lease_end_date else None,
        }
        for tenancy in unit.tenancies
        if tenancy.is_current
    ]
    balance = sum(
        (invoice.balance for invoice in unit.invoices if not invoice.is_settled),
        Decimal('0.00'),
    )
    return {
        **unit.to_dict(),
        'owners': owners,
        'occupants': occupants,
        'balance': float(balance),
        'parking_codes': [bay.code for bay in unit.parking_bays],
        'storage_codes': [store.code for store in unit.storage_units],
    }


@registry_bp.route('/units', methods=['POST'])
@require('registry', 'create')
def create_unit():
    payload = json_dict(request)
    label = clean_string(payload.get('label'), 30)
    if not label:
        return jsonify({'error': 'A unit number is required'}), 400

    development_id = current_development_id()
    if Unit.query.filter(Unit.development_id == development_id, Unit.label == label).first():
        return jsonify({'error': f'Unit {label} already exists in this development'}), 409

    block_id = as_int(payload.get('block_id'))
    if block_id is not None:
        block, denied = owned(Block, block_id)
        if denied:
            return jsonify({'error': 'That block does not belong to this development'}), 404

    share_value = as_int(payload.get('share_value'), 0, minimum=0, maximum=SHARE_TARGET)
    summary = _share_summary(development_id)
    if share_value > summary['remaining']:
        return jsonify({
            'error': f'Only {summary["remaining"]} of {SHARE_TARGET} shares are unallocated. '
                     f'Reduce another unit before allocating {share_value}.',
            'shares': summary,
        }), 409

    unit = Unit(
        development_id=development_id,
        block_id=block_id,
        label=label,
        unit_type=one_of(payload.get('unit_type'), UNIT_TYPES, 'T2'),
        floor=as_int(payload.get('floor')),
        area_sqm=_decimal(payload.get('area_sqm')),
        share_value=share_value,
        monthly_charge=_decimal(payload.get('monthly_charge'), Decimal('0')),
    )
    db.session.add(unit)
    _refresh_counts()
    record_audit('CREATE', 'Unit', f'Unit {label} added with {share_value} shares',
                 category='config', user=current_user, development=current_development())
    db.session.commit()

    return jsonify({'unit': _unit_row(unit), 'shares': _share_summary(development_id)}), 201


@registry_bp.route('/units/<int:unit_id>', methods=['GET'])
@require('registry', 'view')
def unit_detail(unit_id):
    unit, denied = owned(Unit, unit_id)
    if denied:
        return denied
    return jsonify({
        'unit': _unit_row(unit),
        'invoices': [invoice.to_dict() for invoice in sorted(
            unit.invoices, key=lambda i: (i.issue_date, i.id), reverse=True,
        )[:25]],
        'requests': [
            request_row.to_dict()
            for request_row in MaintenanceRequest.query.filter(
                MaintenanceRequest.unit_id == unit.id,
            ).order_by(MaintenanceRequest.created_at.desc()).limit(10).all()
        ],
    })


@registry_bp.route('/units/<int:unit_id>', methods=['PUT', 'PATCH'])
@require('registry', 'edit')
def update_unit(unit_id):
    unit, denied = owned(Unit, unit_id)
    if denied:
        return denied

    payload = json_dict(request)
    development_id = current_development_id()

    if 'label' in payload:
        label = clean_string(payload.get('label'), 30)
        if not label:
            return jsonify({'error': 'A unit number is required'}), 400
        clash = Unit.query.filter(
            Unit.development_id == development_id,
            Unit.label == label,
            Unit.id != unit.id,
        ).first()
        if clash:
            return jsonify({'error': f'Unit {label} already exists in this development'}), 409
        unit.label = label

    if 'share_value' in payload:
        share_value = as_int(payload.get('share_value'), unit.share_value, minimum=0, maximum=SHARE_TARGET)
        summary = _share_summary(development_id)
        headroom = summary['remaining'] + unit.share_value
        if share_value > headroom:
            return jsonify({
                'error': f'That would allocate more than {SHARE_TARGET} shares across the '
                         f'development. This unit can hold at most {headroom}.',
                'shares': summary,
            }), 409
        if share_value != unit.share_value:
            record_audit(
                'MODIFY', 'Unit',
                f'Unit {unit.label} shares {unit.share_value} -> {share_value}',
                category='votes', user=current_user, development=current_development(),
                before={'share_value': unit.share_value}, after={'share_value': share_value},
            )
        unit.share_value = share_value

    if 'block_id' in payload:
        block_id = as_int(payload.get('block_id'))
        if block_id is not None:
            _, block_denied = owned(Block, block_id)
            if block_denied:
                return jsonify({'error': 'That block does not belong to this development'}), 404
        unit.block_id = block_id

    if 'unit_type' in payload:
        unit.unit_type = one_of(payload.get('unit_type'), UNIT_TYPES, unit.unit_type)
    if 'floor' in payload:
        unit.floor = as_int(payload.get('floor'))
    if 'area_sqm' in payload:
        unit.area_sqm = _decimal(payload.get('area_sqm'))
    if 'monthly_charge' in payload:
        unit.monthly_charge = _decimal(payload.get('monthly_charge'), unit.monthly_charge)

    db.session.commit()
    return jsonify({'unit': _unit_row(unit), 'shares': _share_summary(development_id)})


@registry_bp.route('/units/<int:unit_id>', methods=['DELETE'])
@require('registry', 'delete')
def delete_unit(unit_id):
    unit, denied = owned(Unit, unit_id)
    if denied:
        return denied

    if Invoice.query.filter(Invoice.unit_id == unit.id).count():
        return jsonify({
            'error': 'This unit has been invoiced and cannot be deleted. '
                     'Re-label it instead so its financial history stays intact.',
        }), 409
    if any(ownership.is_current for ownership in unit.ownerships):
        return jsonify({'error': 'Release the co-owner from this unit first'}), 409

    label = unit.label
    ParkingBay.query.filter(ParkingBay.unit_id == unit.id).update({'unit_id': None})
    StorageUnit.query.filter(StorageUnit.unit_id == unit.id).update({'unit_id': None})
    db.session.delete(unit)
    _refresh_counts()
    record_audit('DELETE', 'Unit', f'Unit {label} removed', category='config',
                 user=current_user, development=current_development())
    db.session.commit()
    return jsonify({'ok': True, 'shares': _share_summary(current_development_id())})


# --- Parking ----------------------------------------------------------------

@registry_bp.route('/parking', methods=['GET'])
@require('registry', 'view')
def list_parking():
    bays = scoped(ParkingBay).order_by(ParkingBay.code).all()
    return jsonify({
        'bays': [bay.to_dict() for bay in bays],
        'totals': {
            'total': len(bays),
            'ev': sum(1 for bay in bays if bay.is_ev),
            'allocated': sum(1 for bay in bays if bay.unit_id),
            'visitor': sum(1 for bay in bays if bay.allocation == 'visitor'),
        },
    })


@registry_bp.route('/parking', methods=['POST'])
@require('registry', 'create')
def create_parking():
    payload = json_dict(request)
    code = clean_string(payload.get('code'), 30)
    if not code:
        return jsonify({'error': 'A bay code is required'}), 400

    development_id = current_development_id()
    if ParkingBay.query.filter(
        ParkingBay.development_id == development_id, ParkingBay.code == code,
    ).first():
        return jsonify({'error': f'Bay {code} already exists'}), 409

    unit_id, unit_error = _optional_unit(payload.get('unit_id'))
    if unit_error:
        return unit_error

    bay = ParkingBay(
        development_id=development_id,
        unit_id=unit_id,
        code=code,
        level=clean_string(payload.get('level'), 30),
        allocation=one_of(payload.get('allocation'), ALLOCATION_TYPES, 'owner'),
        status='allocated' if unit_id else 'available',
        is_ev=as_bool(payload.get('is_ev'), False),
        charger_kw=_decimal(payload.get('charger_kw')),
        charger_type=clean_string(payload.get('charger_type'), 30),
        tariff_per_kwh=_decimal(payload.get('tariff_per_kwh')),
    )
    db.session.add(bay)
    _refresh_counts()
    record_audit('CREATE', 'ParkingBay', f'Bay {code} added', category='parking_ev',
                 user=current_user, development=current_development())
    db.session.commit()
    return jsonify(bay.to_dict()), 201


@registry_bp.route('/parking/<int:bay_id>', methods=['PUT', 'PATCH'])
@require('registry', 'edit')
def update_parking(bay_id):
    bay, denied = owned(ParkingBay, bay_id)
    if denied:
        return denied

    payload = json_dict(request)
    if 'unit_id' in payload:
        unit_id, unit_error = _optional_unit(payload.get('unit_id'))
        if unit_error:
            return unit_error
        bay.unit_id = unit_id
        bay.status = 'allocated' if unit_id else 'available'
    if 'level' in payload:
        bay.level = clean_string(payload.get('level'), 30)
    if 'allocation' in payload:
        bay.allocation = one_of(payload.get('allocation'), ALLOCATION_TYPES, bay.allocation)
    if 'is_ev' in payload:
        bay.is_ev = as_bool(payload.get('is_ev'), bay.is_ev)
    for field in ('charger_kw', 'tariff_per_kwh'):
        if field in payload:
            setattr(bay, field, _decimal(payload.get(field)))
    if 'charger_type' in payload:
        bay.charger_type = clean_string(payload.get('charger_type'), 30)

    _refresh_counts()
    db.session.commit()
    return jsonify(bay.to_dict())


@registry_bp.route('/parking/<int:bay_id>', methods=['DELETE'])
@require('registry', 'delete')
def delete_parking(bay_id):
    bay, denied = owned(ParkingBay, bay_id)
    if denied:
        return denied
    code = bay.code
    db.session.delete(bay)
    _refresh_counts()
    record_audit('DELETE', 'ParkingBay', f'Bay {code} removed', category='parking_ev',
                 user=current_user, development=current_development())
    db.session.commit()
    return jsonify({'ok': True})


# --- Storage ----------------------------------------------------------------

@registry_bp.route('/storage', methods=['GET'])
@require('registry', 'view')
def list_storage():
    stores = scoped(StorageUnit).order_by(StorageUnit.code).all()
    return jsonify({
        'stores': [store.to_dict() for store in stores],
        'totals': {
            'total': len(stores),
            'allocated': sum(1 for store in stores if store.unit_id),
        },
    })


@registry_bp.route('/storage', methods=['POST'])
@require('registry', 'create')
def create_storage():
    payload = json_dict(request)
    code = clean_string(payload.get('code'), 30)
    if not code:
        return jsonify({'error': 'A store code is required'}), 400

    development_id = current_development_id()
    if StorageUnit.query.filter(
        StorageUnit.development_id == development_id, StorageUnit.code == code,
    ).first():
        return jsonify({'error': f'Store {code} already exists'}), 409

    unit_id, unit_error = _optional_unit(payload.get('unit_id'))
    if unit_error:
        return unit_error

    store = StorageUnit(
        development_id=development_id,
        unit_id=unit_id,
        code=code,
        level=clean_string(payload.get('level'), 30),
        area_sqm=_decimal(payload.get('area_sqm')),
        allocation=one_of(payload.get('allocation'), ALLOCATION_TYPES, 'owner'),
        access_method=clean_string(payload.get('access_method'), 60),
        status='allocated' if unit_id else 'available',
    )
    db.session.add(store)
    _refresh_counts()
    db.session.commit()
    return jsonify(store.to_dict()), 201


@registry_bp.route('/storage/<int:store_id>', methods=['PUT', 'PATCH'])
@require('registry', 'edit')
def update_storage(store_id):
    store, denied = owned(StorageUnit, store_id)
    if denied:
        return denied

    payload = json_dict(request)
    if 'unit_id' in payload:
        unit_id, unit_error = _optional_unit(payload.get('unit_id'))
        if unit_error:
            return unit_error
        store.unit_id = unit_id
        store.status = 'allocated' if unit_id else 'available'
    if 'level' in payload:
        store.level = clean_string(payload.get('level'), 30)
    if 'area_sqm' in payload:
        store.area_sqm = _decimal(payload.get('area_sqm'))
    if 'allocation' in payload:
        store.allocation = one_of(payload.get('allocation'), ALLOCATION_TYPES, store.allocation)
    if 'access_method' in payload:
        store.access_method = clean_string(payload.get('access_method'), 60)

    db.session.commit()
    return jsonify(store.to_dict())


@registry_bp.route('/storage/<int:store_id>', methods=['DELETE'])
@require('registry', 'delete')
def delete_storage(store_id):
    store, denied = owned(StorageUnit, store_id)
    if denied:
        return denied
    db.session.delete(store)
    _refresh_counts()
    db.session.commit()
    return jsonify({'ok': True})


# --- Facilities -------------------------------------------------------------

@registry_bp.route('/facilities', methods=['GET'])
@require('registry', 'view')
def list_facilities():
    facilities = scoped(Facility).order_by(Facility.sort_order, Facility.name).all()
    return jsonify({'facilities': [facility.to_dict() for facility in facilities]})


@registry_bp.route('/facilities', methods=['POST'])
@require('registry', 'create')
def create_facility():
    payload = json_dict(request)
    name = clean_string(payload.get('name'), 120)
    if not name:
        return jsonify({'error': 'A facility name is required'}), 400

    facility = Facility(development_id=current_development_id(), name=name)
    _apply_facility(facility, payload)
    db.session.add(facility)
    _refresh_counts()
    db.session.commit()
    return jsonify(facility.to_dict()), 201


@registry_bp.route('/facilities/<int:facility_id>', methods=['PUT', 'PATCH'])
@require('registry', 'edit')
def update_facility(facility_id):
    facility, denied = owned(Facility, facility_id)
    if denied:
        return denied

    payload = json_dict(request)
    if 'name' in payload:
        name = clean_string(payload.get('name'), 120)
        if not name:
            return jsonify({'error': 'A facility name is required'}), 400
        facility.name = name
    _apply_facility(facility, payload)
    db.session.commit()
    return jsonify(facility.to_dict())


@registry_bp.route('/facilities/<int:facility_id>', methods=['DELETE'])
@require('registry', 'delete')
def delete_facility(facility_id):
    facility, denied = owned(Facility, facility_id)
    if denied:
        return denied
    if facility.bookings:
        return jsonify({
            'error': 'This facility has bookings. Set it to inactive instead so the '
                     'booking history stays readable.',
        }), 409
    db.session.delete(facility)
    _refresh_counts()
    db.session.commit()
    return jsonify({'ok': True})


def _apply_facility(facility, payload):
    facility_types = [entry['key'] for entry in FACILITY_TYPES]
    if 'facility_type' in payload:
        facility.facility_type = one_of(payload.get('facility_type'), facility_types,
                                        facility.facility_type)
    for field, length in (('hours_label', 80), ('detail', 200), ('booking_rate_label', 80)):
        if field in payload:
            setattr(facility, field, clean_string(payload.get(field), length))
    if 'rules' in payload:
        facility.rules = clean_string(payload.get('rules'))
    for field in ('opens_hour', 'closes_hour'):
        if field in payload:
            setattr(facility, field, as_int(payload.get(field), None, minimum=0, maximum=23))
    if 'booking_required' in payload:
        facility.booking_required = as_bool(payload.get('booking_required'), facility.booking_required)
    if 'capacity' in payload:
        facility.capacity = as_int(payload.get('capacity'), None, minimum=0)
    if 'slot_hours' in payload:
        facility.slot_hours = as_int(payload.get('slot_hours'), facility.slot_hours, minimum=1, maximum=12)
    if 'booking_rate' in payload:
        facility.booking_rate = _decimal(payload.get('booking_rate'))
    if 'status' in payload:
        facility.status = one_of(payload.get('status'), ['active', 'maintenance', 'inactive'],
                                 facility.status)
    if 'sort_order' in payload:
        facility.sort_order = as_int(payload.get('sort_order'), facility.sort_order, minimum=0)


# --- Shared -----------------------------------------------------------------

def _optional_unit(raw):
    """Resolve an optional unit id, refusing one from another development."""
    unit_id = as_int(raw)
    if unit_id is None:
        return None, None
    _, denied = owned(Unit, unit_id)
    if denied:
        return None, (jsonify({'error': 'That unit does not belong to this development'}), 404)
    return unit_id, None


@registry_bp.route('/export', methods=['GET'])
@require('registry', 'export')
def export_units():
    denied = ensure('registry', 'export')
    if denied:
        return denied

    rows = ['Unit,Block,Type,Floor,Area (m2),Shares,Share %,Monthly charge,Owners,Balance']
    for unit in scoped(Unit).order_by(Unit.label).all():
        row = _unit_row(unit)
        owners = '; '.join(owner['name'] or '' for owner in row['owners'])
        rows.append(','.join([
            _csv(unit.label), _csv(unit.block_name), _csv(unit.unit_type),
            str(unit.floor or ''), str(row['area_sqm'] or ''),
            str(unit.share_value), str(row['share_percent']),
            f'{float(unit.monthly_charge or 0):.2f}',
            _csv(owners), f'{row["balance"]:.2f}',
        ]))

    development = current_development()
    body = '\n'.join(rows)
    return body, 200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': f'attachment; filename="{development.code}-unit-registry.csv"',
    }


def _csv(value):
    text = str(value or '')
    if any(character in text for character in ',"\n'):
        return '"' + text.replace('"', '""') + '"'
    return text
