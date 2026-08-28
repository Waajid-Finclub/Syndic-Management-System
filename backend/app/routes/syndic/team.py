"""
The client's own admin team, capped by the subscription's seat allowance.

The platform operator provisions the first syndic_manager for a development;
that manager fills the remaining seats from here. The cap is the subscription's
`admin_seats` — the plan's allowance, or a per-client override negotiated on the
contract.

Seat counting is deliberately narrow: an *active* layer 2 account occupies a
seat. Suspending an account frees its seat while keeping its history, which is
what a client wants when someone leaves. Deleting is refused for anyone who has
posted a payment or advanced a job, for the same reason it is refused one layer
down: the audit trail has to keep naming somebody real.

A manager cannot promote anyone to syndic_manager, and cannot change their own
role or status. Both are the same rule: the only way to gain authority on this
platform is for the layer above you to grant it.
"""
from flask import Blueprint, jsonify, request
from flask_login import current_user

from ...extensions import db
from ...models import User
from ...models.audit import record_audit
from ...models.billing_run import BillingRun
from ...models.maintenance import MaintenanceEvent
from ...permissions import (
    ROLE_LABELS,
    SYNDIC_ROLE_KEYS,
    SYNDIC_ROLES,
    normalize_syndic_matrix,
    syndic_catalog,
    syndic_effective_matrix,
)
from ...utils.validation import as_bool, clean_email, clean_string, json_dict, one_of
from ._access import (
    current_development,
    current_development_id,
    is_impersonating,
    require,
)

team_bp = Blueprint('syndic_team', __name__)

MIN_PASSWORD_LENGTH = 10

# Roles a syndic manager may grant. Their own role is absent: promoting a
# colleague to manager, or being promoted, is the platform operator's call.
GRANTABLE_ROLES = ['finance_officer', 'assistant_manager', 'board_member']


def seat_usage(development):
    """Seats allowed, seats taken, and who is taking them."""
    subscription = development.subscription
    allowed = subscription.admin_seats if subscription else 0
    members = User.query.filter(
        User.development_id == development.id,
        User.role.in_(SYNDIC_ROLE_KEYS),
    ).order_by(User.first_name, User.last_name).all()
    used = sum(1 for member in members if member.status == 'active')
    return {
        'allowed': allowed,
        'used': used,
        'remaining': max(allowed - used, 0),
        'plan_name': subscription.plan.name if subscription and subscription.plan else None,
        'is_overridden': bool(subscription and subscription.admin_seats_override is not None),
    }, members


@team_bp.route('', methods=['GET'])
@require('team', 'view')
def list_team():
    development = current_development()
    seats, members = seat_usage(development)
    return jsonify({
        'team': [_member_row(member) for member in members],
        'seats': seats,
        'roles': SYNDIC_ROLES,
        'grantable_roles': [
            role for role in SYNDIC_ROLES if role['key'] in GRANTABLE_ROLES
        ],
        'catalog': syndic_catalog(),
    })


def _member_row(member):
    return {
        **member.to_dict(),
        'permissions': syndic_effective_matrix(member),
        'has_overrides': bool(member.permission_overrides),
        'is_self': member.id == getattr(current_user, 'id', None),
    }


@team_bp.route('', methods=['POST'])
@require('team', 'create')
def create_member():
    development = current_development()
    seats, _members = seat_usage(development)

    if seats['remaining'] <= 0:
        return jsonify({
            'error': f'All {seats["allowed"]} admin seats on the {seats["plan_name"] or "current"} '
                     f'plan are in use. Suspend an account to free a seat, or ask the platform '
                     f'operator to raise the allowance.',
            'seats': seats,
        }), 409

    payload = json_dict(request)
    first_name = clean_string(payload.get('first_name'), 100)
    email = clean_email(payload.get('email'))
    password = clean_string(payload.get('password'))
    role = one_of(payload.get('role'), GRANTABLE_ROLES)

    if not first_name or not email:
        return jsonify({'error': 'A first name and a valid email address are required'}), 400
    if role is None:
        return jsonify({
            'error': 'Choose a role. Only the platform operator can appoint a syndic manager.',
        }), 400
    if not password or len(password) < MIN_PASSWORD_LENGTH:
        return jsonify({
            'error': f'Set a temporary password of at least {MIN_PASSWORD_LENGTH} characters. '
                     f'Ask them to change it on first sign-in.',
        }), 400
    if User.query.filter(User.email == email).first():
        return jsonify({'error': 'That email address is already registered on the platform'}), 409

    member = User(
        first_name=first_name,
        last_name=clean_string(payload.get('last_name'), 100),
        email=email,
        phone=clean_string(payload.get('phone'), 50),
        role=role,
        status='active',
        development_id=development.id,
        mfa_enabled=True,
        whatsapp_enabled=as_bool(payload.get('whatsapp_enabled'), False),
    )
    member.set_password(password)
    db.session.add(member)

    record_audit('CREATE', 'User',
                 f'{member.name} added to the syndic team as {ROLE_LABELS.get(role, role)}',
                 category='roles', user=current_user, development=development)
    db.session.commit()

    updated, _ = seat_usage(development)
    return jsonify({'member': _member_row(member), 'seats': updated}), 201


@team_bp.route('/<int:user_id>', methods=['PUT', 'PATCH'])
@require('team', 'edit')
def update_member(user_id):
    member, error = _team_member(user_id)
    if error:
        return error

    development = current_development()
    payload = json_dict(request)
    is_self = member.id == getattr(current_user, 'id', None)

    if 'role' in payload:
        if is_self:
            return jsonify({'error': 'You cannot change your own role'}), 403
        if member.role == 'syndic_manager':
            return jsonify({
                'error': 'Only the platform operator can change a syndic manager account',
            }), 403
        role = one_of(payload.get('role'), GRANTABLE_ROLES)
        if role is None:
            return jsonify({'error': 'That role cannot be granted from this console'}), 400
        if role != member.role:
            record_audit('MODIFY', 'Role',
                         f'{member.name}: {ROLE_LABELS.get(member.role, member.role)} -> '
                         f'{ROLE_LABELS.get(role, role)}',
                         category='roles', user=current_user, development=development)
            # A role change invalidates a matrix tuned for the previous role.
            member.permission_overrides = None
        member.role = role

    if 'status' in payload:
        if is_self:
            return jsonify({'error': 'You cannot suspend your own account'}), 403
        status = one_of(payload.get('status'), ['active', 'suspended'])
        if status is None:
            return jsonify({'error': 'A team account is either active or suspended'}), 400
        if status == 'active' and member.status != 'active':
            seats, _members = seat_usage(development)
            if seats['remaining'] <= 0:
                return jsonify({
                    'error': f'All {seats["allowed"]} admin seats are in use. '
                             f'Suspend another account first.',
                    'seats': seats,
                }), 409
        if status != member.status:
            record_audit('MODIFY', 'User', f'{member.name} set to {status}',
                         category='roles', user=current_user, development=development)
        member.status = status

    for field, length in (('first_name', 100), ('last_name', 100), ('phone', 50)):
        if field in payload:
            value = clean_string(payload.get(field), length)
            if field == 'first_name' and not value:
                return jsonify({'error': 'A first name is required'}), 400
            setattr(member, field, value)

    if 'email' in payload:
        email = clean_email(payload.get('email'))
        if not email:
            return jsonify({'error': 'A valid email address is required'}), 400
        clash = User.query.filter(User.email == email, User.id != member.id).first()
        if clash:
            return jsonify({'error': 'That email address is already registered'}), 409
        member.email = email

    if 'mfa_enabled' in payload:
        member.mfa_enabled = as_bool(payload.get('mfa_enabled'), member.mfa_enabled)
    if 'whatsapp_enabled' in payload:
        member.whatsapp_enabled = as_bool(payload.get('whatsapp_enabled'), member.whatsapp_enabled)

    password = clean_string(payload.get('password'))
    if password:
        if is_self:
            return jsonify({
                'error': 'Change your own password from your account screen, '
                         'where the current one is required.',
            }), 403
        if len(password) < MIN_PASSWORD_LENGTH:
            return jsonify({
                'error': f'A password must be at least {MIN_PASSWORD_LENGTH} characters',
            }), 400
        member.set_password(password)
        record_audit('MODIFY', 'User', f'Password reset for {member.name}',
                     category='roles', user=current_user, development=development)

    if 'permission_overrides' in payload:
        if member.role == 'syndic_manager':
            return jsonify({
                'error': 'A syndic manager holds the full matrix by definition',
            }), 409
        overrides = normalize_syndic_matrix(payload.get('permission_overrides'))
        member.permission_overrides = overrides or None

    db.session.commit()
    seats, _members = seat_usage(development)
    return jsonify({'member': _member_row(member), 'seats': seats})


@team_bp.route('/<int:user_id>', methods=['DELETE'])
@require('team', 'delete')
def delete_member(user_id):
    member, error = _team_member(user_id)
    if error:
        return error

    if member.id == getattr(current_user, 'id', None):
        return jsonify({'error': 'You cannot delete your own account'}), 409
    if member.role == 'syndic_manager':
        return jsonify({
            'error': 'Only the platform operator can remove a syndic manager account',
        }), 403
    if is_impersonating():
        return jsonify({'error': 'A support session cannot delete a client account'}), 403

    has_history = (
        BillingRun.query.filter(BillingRun.run_by_id == member.id).count()
        or MaintenanceEvent.query.filter(MaintenanceEvent.actor_label == member.name).count()
    )
    if has_history:
        return jsonify({
            'error': 'This account has run billing or advanced maintenance jobs. '
                     'Suspend it instead so those records stay attributable.',
        }), 409

    name = member.name
    db.session.delete(member)
    record_audit('DELETE', 'User', f'{name} removed from the syndic team',
                 category='roles', user=current_user, development=current_development())
    db.session.commit()

    seats, _members = seat_usage(current_development())
    return jsonify({'ok': True, 'seats': seats})


def _team_member(user_id):
    member = db.session.get(User, user_id)
    if (
        member is None
        or member.role not in SYNDIC_ROLE_KEYS
        or member.development_id != current_development_id()
    ):
        return None, (jsonify({'error': 'Team member not found'}), 404)
    return member, None
