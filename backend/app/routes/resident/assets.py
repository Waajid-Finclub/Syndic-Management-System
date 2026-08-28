"""
Assets — the parking bays, EV chargers and storage allocated to a unit.

Read-only by design. A resident does not create or reassign a bay; the syndic
office does, because allocation is a term of the co-ownership. Charging
sessions are likewise reported by the charger, not the app, so there is no
endpoint here to invent one.

Bays and stores follow the unit, so this reads from the unit rather than
from the account.
"""
from datetime import date, datetime

from flask import Blueprint, jsonify
from flask_login import current_user

from ...extensions import db
from ...models.billing import EvChargingSession
from ...models.property import ParkingBay, StorageUnit
from ._access import feature_required, require_unit

assets_bp = Blueprint('resident_assets', __name__)


@assets_bp.route('', methods=['GET'])
@feature_required('assets')
def overview():
    unit, error = require_unit()
    if error:
        return error

    bays = ParkingBay.query.filter(
        ParkingBay.unit_id == unit.id
    ).order_by(ParkingBay.code).all()
    stores = StorageUnit.query.filter(
        StorageUnit.unit_id == unit.id
    ).order_by(StorageUnit.code).all()

    return jsonify({
        'parking': [bay.to_dict() for bay in bays if not bay.is_ev],
        'ev_bays': [_ev_bay_payload(bay, unit) for bay in bays if bay.is_ev],
        'storage': [store.to_dict() for store in stores],
    })


@assets_bp.route('/ev/<int:bay_id>', methods=['GET'])
@feature_required('assets')
def ev_bay(bay_id):
    unit, error = require_unit()
    if error:
        return error

    bay = ParkingBay.query.filter(
        ParkingBay.id == bay_id,
        ParkingBay.unit_id == unit.id,
        ParkingBay.is_ev.is_(True),
    ).first()
    if bay is None:
        return jsonify({'error': 'Charging bay not found'}), 404

    sessions = EvChargingSession.query.filter(
        EvChargingSession.bay_id == bay.id,
        EvChargingSession.unit_id == unit.id,
    ).order_by(EvChargingSession.started_at.desc()).limit(30).all()

    return jsonify({
        'bay': _ev_bay_payload(bay, unit),
        'sessions': [session.to_dict() for session in sessions],
        'totals': _month_totals(unit, bay),
    })


def _ev_bay_payload(bay, unit):
    payload = bay.to_dict()
    payload['month_totals'] = _month_totals(unit, bay)
    return payload


def _month_totals(unit, bay):
    """Energy and cost for the current calendar month at this bay."""
    today = date.today()
    month_start = datetime(today.year, today.month, 1)

    totals = db.session.query(
        db.func.coalesce(db.func.sum(EvChargingSession.kwh), 0),
        db.func.coalesce(db.func.sum(EvChargingSession.amount), 0),
        db.func.count(EvChargingSession.id),
    ).filter(
        EvChargingSession.bay_id == bay.id,
        EvChargingSession.unit_id == unit.id,
        EvChargingSession.started_at >= month_start,
    ).one()

    return {
        'period': today.strftime('%Y-%m'),
        'kwh': float(totals[0] or 0),
        'amount': float(totals[1] or 0),
        'session_count': int(totals[2] or 0),
    }
