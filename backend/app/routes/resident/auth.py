"""
Resident authentication — sign in, register against an invitation, sign out.

The session mechanism is the console's: a Flask-Login cookie plus the CSRF
header enforced app-wide in `security.csrf_protect`. What differs is who is let
through. This endpoint accepts co-owners and tenants and refuses console
accounts; `/api/auth/login` does the exact opposite. Neither is a subset of the
other, so an operator cannot drift into a resident session and a resident
cannot reach the console by finding a different login form.

Registration is invitation-only (see models/resident.Invitation). Verification
is deliberately vague about *why* a code failed — a precise error tells an
attacker whether a code exists, which is the one fact worth protecting here.
Platform audit rows are written for registration but not for routine sign-ins:
at portfolio scale that would bury the operator-facing trail the audit screen
exists to show.
"""
import secrets
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request
from flask_login import current_user, login_user, logout_user

from ...extensions import db
from ...models import Invitation, ResidentPreference, User
from ...models.audit import record_audit
from ...models.property import UnitOwnership, UnitTenancy
from ...permissions import RESIDENT_ROLE_KEYS, resident_features
from ...services.notifications import unread_count
from ...utils.validation import clean_email, clean_string, json_dict
from ._access import resident_required, resident_unit, unit_payload

auth_bp = Blueprint('resident_auth', __name__)

MIN_PASSWORD_LENGTH = 10
GENERIC_INVITATION_ERROR = 'That invitation code and email do not match an open invitation'


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _session_payload(user):
    unit = resident_unit(user)
    preference = ResidentPreference.for_user(user)
    return {
        'user': {
            **user.to_dict(),
            'features': resident_features(user),
        },
        'unit': unit_payload(unit, user),
        'preferences': preference.to_dict(),
        'unread_notifications': unread_count(user),
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

    if user.role not in RESIDENT_ROLE_KEYS:
        return jsonify({'error': 'This account does not have access to the resident app'}), 403
    if user.status != 'active':
        return jsonify({'error': f'This account is {user.status}'}), 403

    login_user(user, remember=False)
    user.last_login_at = _utcnow()
    db.session.commit()

    return jsonify(_session_payload(user))


@auth_bp.route('/logout', methods=['POST'])
def logout():
    logout_user()
    return jsonify({'ok': True})


@auth_bp.route('/me', methods=['GET'])
def me():
    if not getattr(current_user, 'is_authenticated', False):
        return jsonify({'user': None})
    if current_user.role not in RESIDENT_ROLE_KEYS or current_user.status != 'active':
        return jsonify({'user': None})
    return jsonify(_session_payload(current_user))


@auth_bp.route('/verify-invitation', methods=['POST'])
def verify_invitation():
    """Step 1 of registration: confirm the code belongs to this email."""
    payload = json_dict(request)
    code = clean_string(payload.get('code'), 20)
    email = clean_email(payload.get('email'))

    if not code or not email:
        return jsonify({'error': 'Enter both your invitation code and your email address'}), 400

    invitation = _match_invitation(code, email)
    if invitation is None:
        return jsonify({'error': GENERIC_INVITATION_ERROR}), 404

    return jsonify({
        'invitation': invitation.to_dict(),
        'requires_password': True,
    })


@auth_bp.route('/register', methods=['POST'])
def register():
    payload = json_dict(request)
    code = clean_string(payload.get('code'), 20)
    email = clean_email(payload.get('email'))
    password = clean_string(payload.get('password'))
    first_name = clean_string(payload.get('first_name'), 100)
    last_name = clean_string(payload.get('last_name'), 100)
    phone = clean_string(payload.get('phone'), 50)

    if not code or not email:
        return jsonify({'error': 'Enter both your invitation code and your email address'}), 400
    if not password or len(password) < MIN_PASSWORD_LENGTH:
        return jsonify({'error': f'Choose a password of at least {MIN_PASSWORD_LENGTH} characters'}), 400

    invitation = _match_invitation(code, email)
    if invitation is None:
        return jsonify({'error': GENERIC_INVITATION_ERROR}), 404

    if User.query.filter(User.email == email).first() is not None:
        return jsonify({'error': 'An account already exists for that email address. Sign in instead.'}), 409

    user = User(
        first_name=first_name or invitation.first_name or 'Resident',
        last_name=last_name or invitation.last_name,
        email=email,
        phone=phone or invitation.phone,
        role=invitation.role,
        status='active',
        development_id=invitation.development_id,
        unit_label=invitation.unit.label if invitation.unit else None,
        whatsapp_enabled=bool(phone or invitation.phone),
    )
    user.set_password(password)
    db.session.add(user)
    db.session.flush()

    _link_to_unit(user, invitation)

    db.session.add(ResidentPreference(
        user_id=user.id,
        whatsapp_notifications=bool(user.phone),
    ))

    invitation.status = 'accepted'
    invitation.accepted_at = _utcnow()
    invitation.accepted_user_id = user.id

    record_audit(
        'CREATE', 'Resident',
        f'{user.name} registered for {invitation.unit.label if invitation.unit else "a unit"} '
        f'using an invitation code',
        category='roles', user=user, development=invitation.development,
        ip_address=request.remote_addr,
    )

    login_user(user, remember=False)
    user.last_login_at = _utcnow()
    db.session.commit()

    return jsonify(_session_payload(user)), 201


@auth_bp.route('/change-password', methods=['POST'])
@resident_required
def change_password():
    payload = json_dict(request)
    current_password = clean_string(payload.get('current_password'))
    new_password = clean_string(payload.get('new_password'))

    if not current_password or not current_user.check_password(current_password):
        return jsonify({'error': 'Your current password is not correct'}), 400
    if not new_password or len(new_password) < MIN_PASSWORD_LENGTH:
        return jsonify({'error': f'Choose a password of at least {MIN_PASSWORD_LENGTH} characters'}), 400
    if new_password == current_password:
        return jsonify({'error': 'Choose a password you have not used here before'}), 400

    current_user.set_password(new_password)
    db.session.commit()
    return jsonify({'ok': True})


def _match_invitation(code, email):
    """
    Find a usable invitation for this code and email.

    The code is looked up first, then compared in constant time, and a failed
    attempt is counted against the invitation so the 6-character space cannot be
    walked. Returns None for every failure mode — expired, revoked, wrong email,
    too many attempts — so the caller cannot distinguish them.
    """
    normalized = code.strip().upper()
    invitation = Invitation.query.filter(
        db.func.upper(Invitation.code) == normalized
    ).first()

    if invitation is None:
        return None

    if not invitation.is_usable:
        return None

    email_matches = secrets.compare_digest(invitation.email.lower(), email.lower())
    if not email_matches:
        invitation.attempts = (invitation.attempts or 0) + 1
        db.session.commit()
        return None

    if invitation.is_expired:
        invitation.status = 'expired'
        db.session.commit()
        return None

    return invitation


def _link_to_unit(user, invitation):
    """Attach the new account to its unit as an owner or a tenant."""
    today = _utcnow().date()
    if invitation.role == 'co_owner':
        db.session.add(UnitOwnership(
            unit_id=invitation.unit_id,
            user_id=user.id,
            ownership_percent=100,
            is_primary_contact=True,
            start_date=today,
        ))
    else:
        db.session.add(UnitTenancy(
            unit_id=invitation.unit_id,
            user_id=user.id,
            lease_start_date=today,
            is_current=True,
        ))
