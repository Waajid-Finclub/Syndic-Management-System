"""
Access control for the resident API.

Two independent checks guard every endpoint here:

1. `@resident_required` — the caller is an active co-owner. Console and syndic
   accounts are refused even though they are authenticated, exactly as resident
   accounts are refused at both console logins.
2. The unit. Every read and write is scoped to the caller's own unit, resolved
   from the ownership record rather than taken from the request. A resident
   cannot ask for someone else's invoice because there is nowhere in the API to
   name one.

`@feature_required` reads the same RESIDENT_FEATURES table the tab bar reads, so
a screen that is hidden is also refused rather than merely unlinked.
"""
from functools import wraps

from flask import g, jsonify
from flask_login import current_user

from ...models.property import Unit, UnitOwnership
from ...permissions import RESIDENT_FEATURES, RESIDENT_ROLE_KEYS, resident_features

FEATURE_LABELS = {feature['key']: feature['label'] for feature in RESIDENT_FEATURES}


def is_resident(user):
    return (
        user is not None
        and getattr(user, 'is_authenticated', False)
        and getattr(user, 'role', None) in RESIDENT_ROLE_KEYS
        and getattr(user, 'status', None) == 'active'
    )


def resident_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not getattr(current_user, 'is_authenticated', False):
            return jsonify({'error': 'Authentication required'}), 401
        if not is_resident(current_user):
            return jsonify({'error': 'This account does not have access to the resident app'}), 403
        return view(*args, **kwargs)

    return wrapped


def feature_required(feature):
    """Guard an endpoint behind a resident feature (finance, voting, ...)."""
    def decorator(view):
        @wraps(view)
        @resident_required
        def wrapped(*args, **kwargs):
            if not resident_features(current_user).get(feature, False):
                return jsonify({
                    'error': f'{FEATURE_LABELS.get(feature, "This section")} is available to co-owners only',
                    'feature': feature,
                }), 403
            return view(*args, **kwargs)

        return wrapped

    return decorator


def resident_unit(user=None):
    """
    The unit this account owns.

    Cached per request: almost every endpoint needs it, and it is stable for the
    life of a request.
    """
    user = user or current_user
    cached = getattr(g, '_resident_unit', None)
    if cached is not None and cached.get('user_id') == user.id:
        return cached['unit']

    ownership = UnitOwnership.query.filter(
        UnitOwnership.user_id == user.id,
        UnitOwnership.end_date.is_(None),
    ).first()
    unit = ownership.unit if ownership else None

    g._resident_unit = {'user_id': user.id, 'unit': unit}
    return unit


def require_unit():
    """
    Return (unit, None) or (None, error_response).

    An account with no unit is a data problem, not an attack: the invitation
    named a unit, so this only happens if the link was later removed. Say so
    plainly rather than 500-ing on a None.
    """
    unit = resident_unit()
    if unit is None:
        return None, (jsonify({
            'error': 'Your account is not linked to a unit yet. Contact your syndic manager.',
        }), 409)
    return unit, None


def development_of(unit):
    return unit.development if unit is not None else None


def owns_unit(unit, user=None):
    """True when the caller holds title to this particular unit."""
    user = user or current_user
    if unit is None or user.role != 'co_owner':
        return False
    return UnitOwnership.query.filter(
        UnitOwnership.unit_id == unit.id,
        UnitOwnership.user_id == user.id,
        UnitOwnership.end_date.is_(None),
    ).first() is not None


def scoped_unit_query(model, unit):
    """Constrain any unit-scoped model to the caller's own unit."""
    return model.query.filter(model.unit_id == unit.id)


def unit_payload(unit, user=None):
    """The identity block every screen header shows."""
    user = user or current_user
    if unit is None:
        return None
    development = unit.development
    return {
        **unit.to_dict(),
        'development': {
            'id': development.id,
            'name': development.name,
            'location': development.location,
        } if development else None,
        'tenure': 'owner',
    }


def all_units_in_scope():
    """Units in the caller's development — used for development-wide reads."""
    unit = resident_unit()
    if unit is None:
        return Unit.query.filter(db_false())
    return Unit.query.filter(Unit.development_id == unit.development_id)


def db_false():
    from ...extensions import db

    return db.literal(False)
