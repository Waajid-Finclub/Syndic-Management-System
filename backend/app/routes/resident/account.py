"""
Account — profile, notification preferences and the notification feed.

Residents may edit their own contact details but not their role, status, unit
or share allocation: those are the syndic's records about them, not their
profile. So the update route names the three editable fields explicitly rather
than iterating the payload, which is what stops a crafted body from promoting
an account.

Language is stored and returned but only English ships today; the app renders
the row read-only rather than offering a switch that changes nothing.
"""
from flask import Blueprint, jsonify, request
from flask_login import current_user

from ...extensions import db
from ...models.property import ParkingBay, StorageUnit
from ...models.resident import (
    LANGUAGE_KEYS,
    NOTIFICATION_CATEGORIES,
    NOTIFICATION_CATEGORY_KEYS,
    Notification,
    ResidentPreference,
)
from ...permissions import resident_features
from ...services.notifications import mark_read, unread_count
from ...utils.validation import as_bool, clean_string, json_dict, one_of
from ._access import require_unit, resident_required, unit_payload

account_bp = Blueprint('resident_account', __name__)

NOTIFICATION_PAGE_SIZE = 60


@account_bp.route('/profile', methods=['GET'])
@resident_required
def profile():
    unit, error = require_unit()
    if error:
        return error

    bays = ParkingBay.query.filter(ParkingBay.unit_id == unit.id).order_by(ParkingBay.code).all()
    stores = StorageUnit.query.filter(StorageUnit.unit_id == unit.id).order_by(StorageUnit.code).all()
    development = unit.development

    return jsonify({
        'user': {
            **current_user.to_dict(),
            'features': resident_features(current_user),
        },
        'unit': unit_payload(unit),
        'assets': {
            'parking': [bay.to_dict() for bay in bays if not bay.is_ev],
            'ev_bays': [bay.to_dict() for bay in bays if bay.is_ev],
            'storage': [store.to_dict() for store in stores],
        },
        'preferences': ResidentPreference.for_user(current_user).to_dict(),
        'syndic': {
            'manager_name': development.syndic_manager_name if development else None,
            'manager_email': development.syndic_manager_email if development else None,
            'development_name': development.name if development else None,
        },
        'languages': [{'key': key} for key in LANGUAGE_KEYS],
    })


@account_bp.route('/profile', methods=['PUT'])
@resident_required
def update_profile():
    """
    Only contact details. Role, status, unit and shares are the syndic's
    records about this person, not fields the person owns.
    """
    payload = json_dict(request)
    first_name = clean_string(payload.get('first_name'), 100)
    last_name = clean_string(payload.get('last_name'), 100)
    phone = clean_string(payload.get('phone'), 50)

    if not first_name:
        return jsonify({'error': 'A first name is required'}), 400

    current_user.first_name = first_name
    current_user.last_name = last_name
    current_user.phone = phone
    if not phone:
        # No number, no WhatsApp — keep the flag honest.
        current_user.whatsapp_enabled = False

    db.session.commit()
    return jsonify({'user': current_user.to_dict()})


@account_bp.route('/preferences', methods=['GET'])
@resident_required
def preferences():
    preference = ResidentPreference.for_user(current_user)
    db.session.commit()
    return jsonify({'preferences': preference.to_dict()})


@account_bp.route('/preferences', methods=['PUT'])
@resident_required
def update_preferences():
    payload = json_dict(request)
    preference = ResidentPreference.for_user(current_user)

    if 'language_code' in payload:
        preference.language_code = one_of(
            payload.get('language_code'), LANGUAGE_KEYS, default=preference.language_code,
        )

    for field in ('push_notifications', 'whatsapp_notifications',
                  'email_notifications', 'sms_notifications'):
        if field in payload:
            setattr(preference, field, as_bool(payload.get(field), getattr(preference, field)))

    if not current_user.phone:
        preference.whatsapp_notifications = False
        preference.sms_notifications = False

    # The console reads this flag on the user record; keep the two in step.
    current_user.whatsapp_enabled = bool(preference.whatsapp_notifications)

    db.session.commit()
    return jsonify({'preferences': preference.to_dict()})


@account_bp.route('/notifications', methods=['GET'])
@resident_required
def notifications():
    category = one_of(request.args.get('category'), NOTIFICATION_CATEGORY_KEYS)

    query = Notification.query.filter(Notification.user_id == current_user.id)
    if category:
        query = query.filter(Notification.category == category)

    rows = query.order_by(Notification.created_at.desc()).limit(NOTIFICATION_PAGE_SIZE).all()

    counts = {}
    for entry in NOTIFICATION_CATEGORIES:
        counts[entry['key']] = Notification.query.filter(
            Notification.user_id == current_user.id,
            Notification.category == entry['key'],
        ).count()

    return jsonify({
        'notifications': [row.to_dict() for row in rows],
        'categories': NOTIFICATION_CATEGORIES,
        'counts': counts,
        'unread': unread_count(current_user),
    })


@account_bp.route('/notifications/read', methods=['POST'])
@resident_required
def read_notifications():
    payload = json_dict(request)
    raw_ids = payload.get('ids')
    ids = [value for value in raw_ids if isinstance(value, int)] if isinstance(raw_ids, list) else None

    updated = mark_read(current_user, ids)
    db.session.commit()

    return jsonify({'updated': updated, 'unread': unread_count(current_user)})
