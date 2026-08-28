"""
Client admin provisioning — the layer 1 to layer 2 handoff.

This is the operator's side of the account chain. The platform admin creates a
client property, then provisions its **first** syndic manager here. From that
point the client fills its own remaining seats through /api/syndic/team, and the
operator's involvement ends unless the seat allowance changes or the manager
account itself has to be replaced.

Why the first account is provisioned rather than invited: a syndic manager is a
commercial relationship, not a self-service signup. The operator has a signed
contract naming a person, and that person needs to be able to sign in on the day
of go-live without an email round trip. Co-owners one layer down are invited
instead, because there the syndic has no such contract with each individual.

Seat enforcement lives in one function, `seat_state`, shared with the syndic
console so both consoles count a seat the same way.
"""
from flask import Blueprint, jsonify, request
from flask_login import current_user, login_required

from ..extensions import db
from ..models import Development, User
from ..models.audit import record_audit
from ..permissions import ROLE_LABELS, SYNDIC_ROLE_KEYS, SYNDIC_ROLES, ensure
from ..utils.validation import as_bool, as_int, clean_email, clean_string, json_dict, one_of

client_admins_bp = Blueprint('client_admins', __name__)

MIN_PASSWORD_LENGTH = 10


def seat_state(development):
    """
    Seat allowance and usage for one client.

    An *active* layer 2 account occupies a seat; a suspended one does not. That
    is what lets a client park a departing colleague's account without paying
    for the seat or losing the history attached to it.
    """
    subscription = development.subscription
    allowed = subscription.admin_seats if subscription else 0
    members = User.query.filter(
        User.development_id == development.id,
        User.role.in_(SYNDIC_ROLE_KEYS),
    ).all()
    used = sum(1 for member in members if member.status == 'active')
    return {
        'development_id': development.id,
        'allowed': allowed,
        'used': used,
        'remaining': max(allowed - used, 0),
        'total_accounts': len(members),
        'plan_name': subscription.plan.name if subscription and subscription.plan else None,
        'plan_seats': subscription.plan.admin_seats if subscription and subscription.plan else 0,
        'is_overridden': bool(subscription and subscription.admin_seats_override is not None),
        'has_manager': any(
            member.role == 'syndic_manager' and member.status == 'active'
            for member in members
        ),
    }


@client_admins_bp.route('/', methods=['GET'])
@login_required
def list_client_admins():
    """Every layer 2 account across the portfolio, grouped by client."""
    denied = ensure('users', 'view')
    if denied:
        return denied

    developments = Development.query.order_by(Development.name).all()
    clients = []
    for development in developments:
        seats = seat_state(development)
        members = User.query.filter(
            User.development_id == development.id,
            User.role.in_(SYNDIC_ROLE_KEYS),
        ).order_by(User.role, User.first_name).all()
        clients.append({
            'development': {
                'id': development.id,
                'code': development.code,
                'name': development.name,
                'location': development.location,
                'status': development.status,
                'unit_count': development.unit_count,
                'plan_name': seats['plan_name'],
            },
            'seats': seats,
            'admins': [member.to_dict() for member in members],
        })

    return jsonify({
        'clients': clients,
        'roles': SYNDIC_ROLES,
        'totals': {
            'clients': len(clients),
            'provisioned': sum(len(client['admins']) for client in clients),
            'seats_allowed': sum(client['seats']['allowed'] for client in clients),
            'seats_used': sum(client['seats']['used'] for client in clients),
            'awaiting_manager': sum(1 for client in clients if not client['seats']['has_manager']),
        },
    })


@client_admins_bp.route('/<int:development_id>', methods=['POST'])
@login_required
def provision_admin(development_id):
    """
    Provision a syndic account for one client.

    The first account for a development must be a syndic_manager: that is the
    only layer 2 role that can then create the rest of the team, and a client
    left with only a finance officer would be locked out of its own registry.
    """
    denied = ensure('users', 'create')
    if denied:
        return denied

    development = db.session.get(Development, development_id)
    if development is None:
        return jsonify({'error': 'Client property not found'}), 404

    seats = seat_state(development)
    if seats['allowed'] <= 0:
        return jsonify({
            'error': 'This client has no subscription, so it has no admin seat allowance. '
                     'Assign a plan on the Subscriptions screen first.',
            'seats': seats,
        }), 409
    if seats['remaining'] <= 0:
        return jsonify({
            'error': f'All {seats["allowed"]} admin seats on the {seats["plan_name"]} plan are '
                     f'in use. Raise the seat override or suspend an account first.',
            'seats': seats,
        }), 409

    payload = json_dict(request)
    role = one_of(payload.get('role'), SYNDIC_ROLE_KEYS, 'syndic_manager')
    if not seats['has_manager'] and role != 'syndic_manager':
        return jsonify({
            'error': 'The first account for a client must be a Syndic Manager — '
                     'no other role can set up the registry or add colleagues.',
        }), 400

    first_name = clean_string(payload.get('first_name'), 100)
    email = clean_email(payload.get('email'))
    password = clean_string(payload.get('password'))

    if not first_name or not email:
        return jsonify({'error': 'A first name and a valid email address are required'}), 400
    if not password or len(password) < MIN_PASSWORD_LENGTH:
        return jsonify({
            'error': f'Set a temporary password of at least {MIN_PASSWORD_LENGTH} characters',
        }), 400
    if User.query.filter(User.email == email).first():
        return jsonify({'error': 'That email address is already registered on the platform'}), 409

    admin = User(
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
    admin.set_password(password)
    db.session.add(admin)

    # The registry keeps the headline contact for the client; the first manager
    # provisioned is that contact unless one was already named.
    if role == 'syndic_manager' and not development.syndic_manager_email:
        development.syndic_manager_name = admin.name
        development.syndic_manager_email = admin.email

    record_audit(
        'CREATE', 'User',
        f'{admin.name} provisioned as {ROLE_LABELS.get(role, role)} for {development.name}',
        category='roles', user=current_user, development=development,
    )
    db.session.commit()

    return jsonify({
        'admin': admin.to_dict(),
        'seats': seat_state(development),
    }), 201


@client_admins_bp.route('/<int:development_id>/seats', methods=['PUT', 'PATCH'])
@login_required
def set_seats(development_id):
    """
    Override the seat allowance for one client.

    Stored on the subscription rather than the plan, so a negotiated allowance
    survives a change to the plan catalog. Sending null restores the plan's own
    allowance.
    """
    denied = ensure('subscriptions', 'edit')
    if denied:
        return denied

    development = db.session.get(Development, development_id)
    if development is None:
        return jsonify({'error': 'Client property not found'}), 404
    subscription = development.subscription
    if subscription is None:
        return jsonify({'error': 'This client has no subscription to attach seats to'}), 409

    payload = json_dict(request)
    raw = payload.get('admin_seats')
    previous = subscription.admin_seats

    if raw in (None, ''):
        subscription.admin_seats_override = None
    else:
        seats = as_int(raw, None, minimum=1, maximum=50)
        if seats is None:
            return jsonify({'error': 'Seats must be a whole number from 1 to 50'}), 400
        in_use = seat_state(development)['used']
        if seats < in_use:
            return jsonify({
                'error': f'{in_use} seats are currently in use. Suspend accounts before '
                         f'lowering the allowance to {seats}.',
            }), 409
        subscription.admin_seats_override = seats

    record_audit('MODIFY', 'Subscription',
                 f'{development.name} admin seats {previous} -> {subscription.admin_seats}',
                 category='config', user=current_user, development=development,
                 before={'admin_seats': previous}, after={'admin_seats': subscription.admin_seats})
    db.session.commit()

    return jsonify({'seats': seat_state(development)})


@client_admins_bp.route('/<int:development_id>/admins/<int:user_id>', methods=['PUT', 'PATCH'])
@login_required
def update_admin(development_id, user_id):
    """
    Change a client admin account — including the syndic manager the client
    cannot change themselves.
    """
    denied = ensure('users', 'edit')
    if denied:
        return denied

    development = db.session.get(Development, development_id)
    admin = db.session.get(User, user_id)
    if development is None or admin is None or admin.development_id != development.id:
        return jsonify({'error': 'Client admin not found'}), 404
    if admin.role not in SYNDIC_ROLE_KEYS:
        return jsonify({'error': 'That account is not a client admin'}), 400

    payload = json_dict(request)

    if 'role' in payload:
        role = one_of(payload.get('role'), SYNDIC_ROLE_KEYS)
        if role is None:
            return jsonify({'error': 'That role is not a syndic console role'}), 400
        if admin.role == 'syndic_manager' and role != 'syndic_manager':
            remaining = User.query.filter(
                User.development_id == development.id,
                User.role == 'syndic_manager',
                User.status == 'active',
                User.id != admin.id,
            ).count()
            if remaining == 0:
                return jsonify({
                    'error': 'This is the client\'s only syndic manager. Provision a '
                             'replacement before changing this account.',
                }), 409
        if role != admin.role:
            record_audit('MODIFY', 'Role',
                         f'{admin.name}: {ROLE_LABELS.get(admin.role, admin.role)} -> '
                         f'{ROLE_LABELS.get(role, role)}',
                         category='roles', user=current_user, development=development)
            admin.permission_overrides = None
        admin.role = role

    if 'status' in payload:
        status = one_of(payload.get('status'), ['active', 'suspended', 'inactive'])
        if status is None:
            return jsonify({'error': 'That status is not recognised'}), 400
        if status == 'active' and admin.status != 'active':
            seats = seat_state(development)
            if seats['remaining'] <= 0:
                return jsonify({
                    'error': f'All {seats["allowed"]} seats are in use.',
                    'seats': seats,
                }), 409
        admin.status = status

    for field, length in (('first_name', 100), ('last_name', 100), ('phone', 50)):
        if field in payload:
            setattr(admin, field, clean_string(payload.get(field), length))

    if 'email' in payload:
        email = clean_email(payload.get('email'))
        if not email:
            return jsonify({'error': 'A valid email address is required'}), 400
        if User.query.filter(User.email == email, User.id != admin.id).first():
            return jsonify({'error': 'That email address is already registered'}), 409
        admin.email = email

    password = clean_string(payload.get('password'))
    if password:
        if len(password) < MIN_PASSWORD_LENGTH:
            return jsonify({
                'error': f'A password must be at least {MIN_PASSWORD_LENGTH} characters',
            }), 400
        admin.set_password(password)
        record_audit('MODIFY', 'User', f'Password reset for {admin.name} by the platform operator',
                     category='roles', user=current_user, development=development)

    db.session.commit()
    return jsonify({'admin': admin.to_dict(), 'seats': seat_state(development)})


@client_admins_bp.route('/<int:development_id>/admins/<int:user_id>', methods=['DELETE'])
@login_required
def delete_admin(development_id, user_id):
    denied = ensure('users', 'delete')
    if denied:
        return denied

    development = db.session.get(Development, development_id)
    admin = db.session.get(User, user_id)
    if development is None or admin is None or admin.development_id != development.id:
        return jsonify({'error': 'Client admin not found'}), 404
    if admin.role not in SYNDIC_ROLE_KEYS:
        return jsonify({'error': 'That account is not a client admin'}), 400

    name = admin.name
    db.session.delete(admin)
    record_audit('DELETE', 'User', f'{name} removed from {development.name}',
                 category='roles', user=current_user, development=development)
    db.session.commit()
    return jsonify({'ok': True, 'seats': seat_state(development)})
