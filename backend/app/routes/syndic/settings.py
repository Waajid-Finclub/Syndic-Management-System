"""
Development settings — the knobs a syndic controls for their own building.

Split from the platform console on purpose. A client changes their billing day,
grace period and penalty rate; they do not change their own plan, status or unit
count, because those are commercial terms the operator holds. Anything on this
screen is safe for a client to set without a support ticket, and anything that
is not is not on this screen.

Changing the billing day or the penalty rate is written to the audit log with
the before and after values. These are the settings that later explain why an
invoice fell due when it did.
"""
from flask import Blueprint, jsonify, request
from flask_login import current_user

from ...extensions import db
from ...models import DevelopmentSettings
from ...models.audit import record_audit
from ...utils.validation import as_bool, as_int, clean_email, clean_string, json_dict
from ._access import current_development, require

settings_bp = Blueprint('syndic_settings', __name__)

# Fields the client may change, with the audit category each belongs to.
AUDITED_FIELDS = {
    'billing_day': 'financial',
    'arrears_grace_days': 'financial',
    'penalty_rate_percent': 'financial',
    'allow_online_payments': 'config',
    'allow_resident_voting': 'config',
}


def _settings(development):
    """Settings rows are created lazily so an older development still works."""
    if development.settings is None:
        row = DevelopmentSettings(development_id=development.id)
        db.session.add(row)
        db.session.flush()
    return development.settings


@settings_bp.route('', methods=['GET'])
@require('settings', 'view')
def read_settings():
    development = current_development()
    settings = _settings(development)
    subscription = development.subscription
    db.session.commit()

    return jsonify({
        'development': {
            'id': development.id,
            'code': development.code,
            'name': development.name,
            'development_type': development.development_type,
            'address_line_1': development.address_line_1,
            'address_line_2': development.address_line_2,
            'city': development.city,
            'district': development.district,
            'country': development.country,
            'status': development.status,
            'syndic_manager_name': development.syndic_manager_name,
            'syndic_manager_email': development.syndic_manager_email,
            'unit_count': development.unit_count,
            'whatsapp_enabled': development.whatsapp_enabled,
        },
        'settings': settings.to_dict(),
        'subscription': {
            'plan_name': subscription.plan.name if subscription and subscription.plan else None,
            'status': subscription.status if subscription else None,
            'admin_seats': subscription.admin_seats if subscription else 0,
            'monthly_unit_rate': float(subscription.monthly_unit_rate) if subscription else 0,
            'mrr': subscription.mrr if subscription else 0,
        },
        # What the client may not change here, and who to ask.
        'operator_controlled': [
            'Subscription plan and pricing',
            'Admin seat allowance',
            'Development status and go-live',
            'Platform feature flags',
            'WhatsApp Business number registration',
        ],
    })


@settings_bp.route('', methods=['PUT', 'PATCH'])
@require('settings', 'edit')
def update_settings():
    development = current_development()
    settings = _settings(development)
    payload = json_dict(request)
    before = settings.to_dict()

    if 'billing_day' in payload:
        # Capped at 28 so every month has the day. A 30th-of-the-month billing
        # date silently skips February, which is how a building loses a cycle.
        settings.billing_day = as_int(payload.get('billing_day'), settings.billing_day,
                                      minimum=1, maximum=28)
    if 'arrears_grace_days' in payload:
        settings.arrears_grace_days = as_int(payload.get('arrears_grace_days'),
                                             settings.arrears_grace_days, minimum=0, maximum=90)
    if 'penalty_rate_percent' in payload:
        raw = payload.get('penalty_rate_percent')
        if raw in (None, ''):
            settings.penalty_rate_percent = None
        else:
            rate = as_int(raw, None, minimum=0, maximum=50)
            if rate is None:
                return jsonify({'error': 'The penalty rate must be a percentage from 0 to 50'}), 400
            settings.penalty_rate_percent = rate
    if 'allow_online_payments' in payload:
        settings.allow_online_payments = as_bool(payload.get('allow_online_payments'),
                                                 settings.allow_online_payments)
    if 'allow_resident_voting' in payload:
        settings.allow_resident_voting = as_bool(payload.get('allow_resident_voting'),
                                                 settings.allow_resident_voting)
    if 'currency_code' in payload:
        settings.currency_code = clean_string(payload.get('currency_code'), 10) or settings.currency_code
    if 'timezone' in payload:
        settings.timezone = clean_string(payload.get('timezone'), 50) or settings.timezone

    # Contact details are the client's own, so they may correct them.
    if 'syndic_manager_name' in payload:
        development.syndic_manager_name = clean_string(payload.get('syndic_manager_name'), 150)
    if 'syndic_manager_email' in payload:
        development.syndic_manager_email = clean_email(payload.get('syndic_manager_email'))
    for field, length in (('address_line_1', 255), ('address_line_2', 255),
                          ('city', 100), ('district', 100)):
        if field in payload:
            setattr(development, field, clean_string(payload.get(field), length))

    after = settings.to_dict()
    changed = {
        field: (before.get(field), after.get(field))
        for field in AUDITED_FIELDS
        if before.get(field) != after.get(field)
    }
    for field, (was, now) in changed.items():
        record_audit('MODIFY', 'Config', f'{field}: {was} -> {now}',
                     category=AUDITED_FIELDS[field], user=current_user, development=development,
                     before={field: was}, after={field: now})

    db.session.commit()
    return jsonify({'settings': after, 'changed': list(changed)})
