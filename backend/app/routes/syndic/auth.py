"""
Syndic Admin authentication — the layer 2 sign-in surface.

Same session mechanism as the other two consoles (a Flask-Login cookie plus the
app-wide CSRF header); what differs is who is let through. This endpoint accepts
the four syndic roles and refuses operator and co-owner accounts. None of the
three login endpoints is a subset of another.

A syndic account must name a development. An account whose development was
deleted is refused with a message pointing at the platform operator rather than
being let into an empty console.
"""
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request, session
from flask_login import current_user, login_user, logout_user

from ...extensions import db
from ...models import User
from ...models.audit import record_audit
from ...permissions import SYNDIC_ROLE_KEYS, syndic_catalog, syndic_effective_matrix
from ...utils.validation import clean_email, clean_string, json_dict
from ._access import (
    IMPERSONATION_KEY,
    current_development,
    is_impersonating,
    is_syndic,
    syndic_required,
)

auth_bp = Blueprint('syndic_auth', __name__)

MIN_PASSWORD_LENGTH = 10


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def session_payload():
    """The identity block the syndic shell renders on every screen."""
    development = current_development()
    subscription = development.subscription if development else None
    return {
        'user': {
            **current_user.to_dict(include_syndic_permissions=True),
            'impersonating': is_impersonating(),
        },
        'development': {
            'id': development.id,
            'code': development.code,
            'name': development.name,
            'location': development.location,
            'development_type': development.development_type,
            'status': development.status,
            'unit_count': development.unit_count,
            'settings': development.settings.to_dict() if development.settings else None,
            'plan_name': subscription.plan.name if subscription and subscription.plan else None,
            'admin_seats': subscription.admin_seats if subscription else 0,
        } if development else None,
        'permissions': syndic_effective_matrix(current_user),
    }


@auth_bp.route('/login', methods=['POST'])
def login():
    payload = json_dict(request)
    email = clean_email(payload.get('email'))
    password = clean_string(payload.get('password'))

    if not email or not password:
        return jsonify({'error': 'Email and password are required'}), 400

    user = User.query.filter(User.email == email).first()
    if user is None or not user.check_password(password):
        return jsonify({'error': 'Invalid email or password'}), 401

    if user.role not in SYNDIC_ROLE_KEYS:
        return jsonify({'error': 'This account does not have access to the syndic console'}), 403
    if user.status != 'active':
        return jsonify({'error': f'This account is {user.status}'}), 403
    if user.development_id is None or user.development is None:
        return jsonify({
            'error': 'This account is not linked to a development yet. '
                     'Contact the platform operator.',
        }), 409

    login_user(user, remember=False)
    session.pop(IMPERSONATION_KEY, None)
    user.last_login_at = _utcnow()
    record_audit('LOGIN', 'Session', f'{user.name} signed in to the syndic console',
                 category='system', user=user, development=user.development,
                 ip_address=request.remote_addr)
    db.session.commit()

    return jsonify(session_payload())


@auth_bp.route('/logout', methods=['POST'])
def logout():
    session.pop(IMPERSONATION_KEY, None)
    logout_user()
    return jsonify({'ok': True})


@auth_bp.route('/me', methods=['GET'])
def me():
    if not getattr(current_user, 'is_authenticated', False):
        return jsonify({'user': None})
    if not is_syndic(current_user) and not is_impersonating():
        return jsonify({'user': None})
    if current_development() is None:
        return jsonify({'user': None})
    return jsonify(session_payload())


@auth_bp.route('/permission-catalog', methods=['GET'])
@syndic_required
def permission_catalog():
    return jsonify({**syndic_catalog(), 'effective': syndic_effective_matrix(current_user)})


@auth_bp.route('/change-password', methods=['POST'])
@syndic_required
def change_password():
    if is_impersonating():
        return jsonify({'error': 'A support session cannot change a client password'}), 403

    payload = json_dict(request)
    current_password = clean_string(payload.get('current_password'))
    new_password = clean_string(payload.get('new_password'))

    if not current_password or not current_user.check_password(current_password):
        return jsonify({'error': 'Your current password is not correct'}), 400
    if not new_password or len(new_password) < MIN_PASSWORD_LENGTH:
        return jsonify({
            'error': f'Choose a password of at least {MIN_PASSWORD_LENGTH} characters',
        }), 400
    if new_password == current_password:
        return jsonify({'error': 'Choose a password you have not used here before'}), 400

    current_user.set_password(new_password)
    record_audit('MODIFY', 'User', f'{current_user.name} changed their own password',
                 category='roles', user=current_user, development=current_development())
    db.session.commit()
    return jsonify({'ok': True})
