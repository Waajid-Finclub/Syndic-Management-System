"""
Community — notices, facility booking, visitor passes and the document library.

Three things worth knowing about this module:

* Slot availability is advisory; the unique constraint on
  (facility, date, slot) is what prevents a double booking. Two residents
  tapping the same 10am slot resolve at the database, not in a check-then-write
  window.
* A visitor bay is allocated by looking for one with no overlapping pass, not
  by a stored "free" flag, so a cancelled pass releases its bay immediately.
* The document library filters private folders by unit. A co-owner's title deed
  lives in the same table as the house rules and is separated by a WHERE clause,
  so that clause is applied once, centrally, in `_visible_documents`.
"""
from datetime import date, datetime, time, timedelta, timezone

from flask import Blueprint, Response, jsonify, request
from flask_login import current_user
from sqlalchemy.exc import IntegrityError

from ...extensions import db
from ...models.community import (
    VISIT_PURPOSE_KEYS,
    VISITOR_PARKING_OPTIONS,
    Announcement,
    Document,
    DocumentFolder,
    FacilityBooking,
    VisitorPass,
)
from ...models.property import Facility, ParkingBay
from ...services import storage
from ...services.notifications import notify
from ...utils.validation import as_date, as_int, clean_string, json_dict, one_of
from ._access import feature_required, require_unit, resident_required

community_bp = Blueprint('resident_community', __name__)

BOOKING_HORIZON_DAYS = 90


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


# --- Announcements ---------------------------------------------------------

@community_bp.route('/announcements', methods=['GET'])
@resident_required
def announcements():
    unit, error = require_unit()
    if error:
        return error

    rows = Announcement.query.filter(
        Announcement.development_id == unit.development_id
    ).order_by(Announcement.published_at.desc()).limit(50).all()
    return jsonify({'announcements': [row.to_dict() for row in rows]})


# --- Facilities and bookings ----------------------------------------------

@community_bp.route('/facilities', methods=['GET'])
@feature_required('facilities')
def facilities():
    unit, error = require_unit()
    if error:
        return error

    now = _utcnow()
    rows = Facility.query.filter(
        Facility.development_id == unit.development_id,
        Facility.status == 'active',
    ).order_by(Facility.sort_order).all()

    payload = []
    for facility in rows:
        entry = facility.to_dict(moment=now)
        entry['availability_note'] = _availability_note(facility, now.date())
        payload.append(entry)

    return jsonify({'facilities': payload})


@community_bp.route('/facilities/<int:facility_id>/availability', methods=['GET'])
@feature_required('facilities')
def facility_availability(facility_id):
    unit, error = require_unit()
    if error:
        return error

    facility = _facility_for_unit(facility_id, unit)
    if facility is None:
        return jsonify({'error': 'Facility not found'}), 404
    if not facility.booking_required and facility.booking_rate is None:
        return jsonify({'error': 'This facility does not take bookings'}), 409

    month = clean_string(request.args.get('month')) or date.today().strftime('%Y-%m')
    try:
        year, month_number = (int(part) for part in month.split('-'))
        first = date(year, month_number, 1)
    except (ValueError, TypeError):
        first = date.today().replace(day=1)

    last = _end_of_month(first)
    booked = FacilityBooking.query.filter(
        FacilityBooking.facility_id == facility.id,
        FacilityBooking.status.in_(('confirmed', 'pending')),
        FacilityBooking.booking_date >= first,
        FacilityBooking.booking_date <= last,
    ).all()

    booked_by_day = {}
    for booking in booked:
        booked_by_day.setdefault(booking.booking_date.isoformat(), []).append(booking.slot_start)

    selected = as_date(request.args.get('date')) or date.today()
    return jsonify({
        'facility': facility.to_dict(moment=_utcnow()),
        'month': first.strftime('%Y-%m'),
        'booked_dates': booked_by_day,
        'selected_date': selected.isoformat(),
        'slots': _slots_for(facility, selected, booked_by_day.get(selected.isoformat(), [])),
        'min_date': date.today().isoformat(),
        'max_date': (date.today() + timedelta(days=BOOKING_HORIZON_DAYS)).isoformat(),
    })


@community_bp.route('/bookings', methods=['GET'])
@feature_required('facilities')
def list_bookings():
    unit, error = require_unit()
    if error:
        return error

    rows = FacilityBooking.query.filter(
        FacilityBooking.user_id == current_user.id,
        FacilityBooking.status != 'cancelled',
    ).order_by(FacilityBooking.booking_date.desc()).all()
    return jsonify({'bookings': [row.to_dict() for row in rows]})


@community_bp.route('/bookings', methods=['POST'])
@feature_required('facilities')
def create_booking():
    unit, error = require_unit()
    if error:
        return error

    payload = json_dict(request)
    facility = _facility_for_unit(as_int(payload.get('facility_id')), unit)
    if facility is None:
        return jsonify({'error': 'Facility not found'}), 404

    booking_date = as_date(payload.get('booking_date'))
    slot_start = as_int(payload.get('slot_start'))
    if booking_date is None or slot_start is None:
        return jsonify({'error': 'Choose a date and a time slot'}), 400
    if booking_date < date.today():
        return jsonify({'error': 'Choose a date that has not passed'}), 400
    if booking_date > date.today() + timedelta(days=BOOKING_HORIZON_DAYS):
        return jsonify({'error': f'Bookings open {BOOKING_HORIZON_DAYS} days ahead'}), 400

    valid_starts = [slot['start'] for slot in _slots_for(facility, booking_date, [])]
    if slot_start not in valid_starts:
        return jsonify({'error': 'That time slot is not offered for this facility'}), 400

    booking = FacilityBooking(
        facility_id=facility.id,
        development_id=unit.development_id,
        unit_id=unit.id,
        user_id=current_user.id,
        booking_date=booking_date,
        slot_start=slot_start,
        slot_end=slot_start + facility.slot_hours,
        status='confirmed',
        amount=facility.booking_rate or 0,
    )
    db.session.add(booking)

    try:
        db.session.flush()
    except IntegrityError:
        # The unique constraint, not the availability check, is what decides.
        db.session.rollback()
        return jsonify({'error': 'That slot has just been taken. Choose another.'}), 409

    notify(
        current_user,
        category='community',
        title=f'{facility.name} booked',
        body=f'{booking_date.strftime("%d %b %Y")} · {booking.slot_label}',
        icon_key='calendar-check',
        link_path='/app/coop/facilities',
        development=unit.development,
        whatsapp_template='facility_booking',
        whatsapp_body=(
            f'{facility.name} booked for unit {unit.label} on '
            f'{booking_date.strftime("%d %b %Y")} at {booking.slot_label}.'
        ),
    )
    db.session.commit()

    return jsonify({'booking': booking.to_dict()}), 201


@community_bp.route('/bookings/<int:booking_id>', methods=['DELETE'])
@feature_required('facilities')
def cancel_booking(booking_id):
    booking = FacilityBooking.query.filter(
        FacilityBooking.id == booking_id,
        FacilityBooking.user_id == current_user.id,
    ).first()
    if booking is None:
        return jsonify({'error': 'Booking not found'}), 404
    if booking.status == 'cancelled':
        return jsonify({'error': 'That booking is already cancelled'}), 409

    booking.status = 'cancelled'
    db.session.commit()
    return jsonify({'booking': booking.to_dict()})


# --- Visitors --------------------------------------------------------------

@community_bp.route('/visitors', methods=['GET'])
@feature_required('visitors')
def list_visitors():
    unit, error = require_unit()
    if error:
        return error

    _expire_stale_passes(unit)
    rows = VisitorPass.query.filter(
        VisitorPass.user_id == current_user.id,
        VisitorPass.status.in_(('pending', 'active')),
    ).order_by(VisitorPass.expected_at.asc()).all()

    recent = VisitorPass.query.filter(
        VisitorPass.user_id == current_user.id,
        VisitorPass.status.notin_(('pending', 'active')),
    ).order_by(VisitorPass.expected_at.desc()).limit(10).all()

    return jsonify({
        'upcoming': [row.to_dict() for row in rows],
        'past': [row.to_dict(include_credentials=False) for row in recent],
        'purposes': [{'key': key} for key in VISIT_PURPOSE_KEYS],
        'parking_options': VISITOR_PARKING_OPTIONS,
    })


@community_bp.route('/visitors', methods=['POST'])
@feature_required('visitors')
def create_visitor():
    unit, error = require_unit()
    if error:
        return error

    payload = json_dict(request)
    visitor_name = clean_string(payload.get('visitor_name'), 150)
    expected_at = _parse_datetime(payload.get('expected_at'))
    purpose = one_of(payload.get('purpose'), VISIT_PURPOSE_KEYS, default='personal')
    parking_hours = as_int(payload.get('parking_hours'), default=0)

    if not visitor_name:
        return jsonify({'error': "Enter the visitor's name"}), 400
    if expected_at is None:
        return jsonify({'error': 'Choose when the visitor is expected'}), 400
    if expected_at < _utcnow() - timedelta(hours=1):
        return jsonify({'error': 'Choose a time in the future'}), 400
    if parking_hours not in VISITOR_PARKING_OPTIONS:
        return jsonify({'error': 'Choose one of the offered parking durations'}), 400

    bay = None
    if parking_hours:
        bay = _free_visitor_bay(unit.development_id, expected_at, parking_hours)
        if bay is None:
            return jsonify({
                'error': 'No visitor bay is free for that window. Register without parking, '
                         'or choose another time.',
            }), 409

    code, pin = VisitorPass.generate_credentials()
    visitor = VisitorPass(
        development_id=unit.development_id,
        unit_id=unit.id,
        user_id=current_user.id,
        visitor_name=visitor_name,
        vehicle_registration=clean_string(payload.get('vehicle_registration'), 40),
        purpose=purpose,
        expected_at=expected_at,
        parking_hours=parking_hours,
        bay_id=bay.id if bay else None,
        bay_code=bay.code if bay else None,
        access_code=code,
        access_pin=pin,
        status='active',
    )
    db.session.add(visitor)

    notify(
        current_user,
        category='community',
        title=f'Visitor registered — {visitor_name}',
        body=f'{expected_at.strftime("%d %b, %H:%M")} · Access code {code}',
        icon_key='user-check',
        link_path='/app/coop/visitors',
        development=unit.development,
        whatsapp_template='visitor_pass',
        whatsapp_body=(
            f'Visitor pass for {visitor_name} at unit {unit.label} on '
            f'{expected_at.strftime("%d %b %Y at %H:%M")}. Access code {code}, PIN {pin}.'
            + (f' Parking bay {bay.code}.' if bay else '')
        ),
    )
    visitor.whatsapp_sent = True
    db.session.commit()

    return jsonify({'visitor': visitor.to_dict()}), 201


@community_bp.route('/visitors/<int:visitor_id>', methods=['DELETE'])
@feature_required('visitors')
def cancel_visitor(visitor_id):
    visitor = VisitorPass.query.filter(
        VisitorPass.id == visitor_id,
        VisitorPass.user_id == current_user.id,
    ).first()
    if visitor is None:
        return jsonify({'error': 'Visitor pass not found'}), 404
    if visitor.status in ('cancelled', 'used', 'expired'):
        return jsonify({'error': 'That pass is no longer active'}), 409

    visitor.status = 'cancelled'
    db.session.commit()
    return jsonify({'visitor': visitor.to_dict(include_credentials=False)})


# --- Documents -------------------------------------------------------------

@community_bp.route('/documents', methods=['GET'])
@feature_required('documents')
def documents():
    unit, error = require_unit()
    if error:
        return error

    search = (clean_string(request.args.get('q')) or '').lower()
    folders = DocumentFolder.query.filter(
        DocumentFolder.development_id == unit.development_id
    ).order_by(DocumentFolder.sort_order).all()

    payload = []
    for folder in folders:
        visible = _visible_documents(folder, unit)
        if search:
            visible = [row for row in visible if search in row.title.lower()]
        if folder.is_private and not visible:
            continue
        payload.append(folder.to_dict(documents=visible))

    return jsonify({'folders': payload, 'query': search})


@community_bp.route('/documents/<int:document_id>/file', methods=['GET'])
@feature_required('documents')
def document_file(document_id):
    unit, error = require_unit()
    if error:
        return error

    document = Document.query.filter(
        Document.id == document_id,
        Document.development_id == unit.development_id,
    ).first()
    if document is None:
        return jsonify({'error': 'Document not found'}), 404

    # Private paperwork belongs to one unit and is invisible to every other.
    if document.unit_id is not None:
        if document.unit_id != unit.id or current_user.role != 'co_owner':
            return jsonify({'error': 'Document not found'}), 404

    try:
        payload = storage.read_bytes(document.storage_path)
    except (FileNotFoundError, ValueError):
        return jsonify({'error': 'That document is no longer available'}), 404

    return Response(payload, mimetype=document.content_type, headers={
        'Cache-Control': 'private, max-age=3600',
        'Content-Disposition': f'inline; filename="{document.filename}"',
    })


# --- Helpers ---------------------------------------------------------------

def _facility_for_unit(facility_id, unit):
    if not facility_id:
        return None
    return Facility.query.filter(
        Facility.id == facility_id,
        Facility.development_id == unit.development_id,
        Facility.status == 'active',
    ).first()


def _slots_for(facility, day, taken):
    """Bookable windows for one day, derived from opening hours and slot length."""
    opens = facility.opens_hour if facility.opens_hour is not None else 8
    closes = facility.closes_hour if facility.closes_hour is not None else 20
    step = max(facility.slot_hours or 2, 1)

    now = _utcnow()
    slots = []
    for start in range(opens, closes, step):
        end = min(start + step, closes)
        if end <= start:
            continue
        in_past = day < now.date() or (day == now.date() and start <= now.hour)
        slots.append({
            'start': start,
            'end': end,
            'label': f'{_clock(start)}-{_clock(end)}',
            'available': start not in taken and not in_past,
            'reason': 'booked' if start in taken else ('past' if in_past else None),
        })
    return slots


def _clock(hour):
    suffix = 'am' if hour < 12 else 'pm'
    return f'{hour % 12 or 12}{suffix}'


def _availability_note(facility, day):
    """The short status line on a facility card."""
    if not facility.booking_required and facility.booking_rate is None:
        return 'No booking required'
    taken = [
        booking.slot_start
        for booking in FacilityBooking.query.filter(
            FacilityBooking.facility_id == facility.id,
            FacilityBooking.booking_date == day,
            FacilityBooking.status.in_(('confirmed', 'pending')),
        ).all()
    ]
    free = [slot for slot in _slots_for(facility, day, taken) if slot['available']]
    if not free:
        return 'Fully booked today'
    return f'{len(free)} slot{"s" if len(free) != 1 else ""} today'


def _end_of_month(first):
    following = date(first.year + (first.month == 12), (first.month % 12) + 1, 1)
    return following - timedelta(days=1)


def _parse_datetime(value):
    text = clean_string(value)
    if not text:
        return None
    text = text.replace('Z', '')
    for parser in (
        lambda v: datetime.fromisoformat(v),
        lambda v: datetime.strptime(v, '%Y-%m-%d %H:%M'),
        lambda v: datetime.combine(datetime.strptime(v, '%Y-%m-%d').date(), time(9, 0)),
    ):
        try:
            parsed = parser(text)
            return parsed.replace(tzinfo=None)
        except ValueError:
            continue
    return None


def _free_visitor_bay(development_id, expected_at, parking_hours):
    """
    A visitor bay with no pass overlapping the requested window.

    Derived from live passes rather than a stored flag, so cancelling a pass
    frees its bay with no extra bookkeeping.
    """
    window_end = expected_at + timedelta(hours=parking_hours)

    bays = ParkingBay.query.filter(
        ParkingBay.development_id == development_id,
        ParkingBay.allocation == 'visitor',
        ParkingBay.status != 'out_of_service',
    ).order_by(ParkingBay.code).all()

    clashing = VisitorPass.query.filter(
        VisitorPass.development_id == development_id,
        VisitorPass.status.in_(('pending', 'active')),
        VisitorPass.bay_id.isnot(None),
    ).all()

    busy = set()
    for existing in clashing:
        existing_end = existing.expected_at + timedelta(hours=existing.parking_hours or 0)
        if existing.expected_at < window_end and expected_at < existing_end:
            busy.add(existing.bay_id)

    return next((bay for bay in bays if bay.id not in busy), None)


def _expire_stale_passes(unit):
    """Retire passes whose window has closed, so the list stays truthful."""
    now = _utcnow()
    stale = VisitorPass.query.filter(
        VisitorPass.development_id == unit.development_id,
        VisitorPass.status.in_(('pending', 'active')),
        VisitorPass.expected_at < now - timedelta(hours=24),
    ).all()
    if not stale:
        return
    for row in stale:
        row.status = 'expired'
    db.session.commit()


def _visible_documents(folder, unit):
    """
    Documents in a folder this resident may read.

    Shared folders return everything; private folders return only rows for the
    caller's own unit, and only to owners — a tenant has no business reading the
    landlord's title deed.
    """
    if not folder.is_private:
        return [row for row in folder.documents if row.unit_id is None]
    if current_user.role != 'co_owner':
        return []
    return [row for row in folder.documents if row.unit_id == unit.id]
