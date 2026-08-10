"""User registry routes — every account across the platform."""
from flask import Blueprint, jsonify, request
from flask_login import current_user, login_required

from ..extensions import db
from ..models import Development, User
from ..models.audit import record_audit
from ..permissions import (
    CONSOLE_ROLE_KEYS,
    MANAGED_ROLES,
    MANAGED_ROLE_KEYS,
    ROLE_LABELS,
    ensure,
    normalize_matrix,
)
from ..utils.validation import as_bool, as_int, clean_email, clean_string, json_dict, one_of

users_bp = Blueprint('users', __name__)

USER_STATUSES = ['active', 'suspended', 'invited', 'inactive']


def _is_super_admin():
    return getattr(current_user, 'role', None) == 'super_admin'


@users_bp.route('/', methods=['GET'])
@login_required
def list_users():
    denied = ensure('users', 'view')
    if denied:
        return denied

    query = User.query
    role = clean_string(request.args.get('role'))
    if role and role != 'all':
        query = query.filter(User.role == role)

    development_id = as_int(request.args.get('development_id'))
    if development_id:
        query = query.filter(User.development_id == development_id)

    search = clean_string(request.args.get('q'))
    if search:
        like = f'%{search.lower()}%'
        query = query.filter(db.or_(
            db.func.lower(User.first_name).like(like),
            db.func.lower(User.last_name).like(like),
            db.func.lower(User.email).like(like),
        ))

    users = query.order_by(User.first_name, User.last_name).all()

    role_counts = []
    for entry in MANAGED_ROLES:
        role_counts.append({
            'role': entry['key'],
            'label': entry['label'],
            'summary': entry['summary'],
            'count': User.query.filter(User.role == entry['key']).count(),
        })

    return jsonify({
        'users': [user.to_dict() for user in users],
        'role_counts': role_counts,
        'roles': MANAGED_ROLES,
    })


@users_bp.route('/', methods=['POST'])
@login_required
def create_user():
    denied = ensure('users', 'create')
    if denied:
        return denied

    payload = json_dict(request)
    first_name = clean_string(payload.get('first_name'), 100)
    email = clean_email(payload.get('email'))
    password = clean_string(payload.get('password'))
    role = one_of(payload.get('role'), MANAGED_ROLE_KEYS)

    if not first_name or not email or not role:
        return jsonify({'error': 'First name, a valid email and a role are required'}), 400
    if role == 'super_admin' and not _is_super_admin():
        return jsonify({'error': 'Only a super admin can create another super admin'}), 403
    if role in CONSOLE_ROLE_KEYS and not password:
        return jsonify({'error': 'Console accounts need a password'}), 400
    if password and len(password) < 10:
        return jsonify({'error': 'Password must be at least 10 characters'}), 400
    if User.query.filter(User.email == email).first():
        return jsonify({'error': 'That email address is already registered'}), 409

    development_id = as_int(payload.get('development_id'))
    if development_id and db.session.get(Development, development_id) is None:
        return jsonify({'error': 'Property not found'}), 404

    user = User(
        first_name=first_name,
        last_name=clean_string(payload.get('last_name'), 100),
        email=email,
        phone=clean_string(payload.get('phone'), 50),
        role=role,
        status=one_of(payload.get('status'), USER_STATUSES, 'active'),
        development_id=development_id,
        unit_label=clean_string(payload.get('unit_label'), 50),
        mfa_enabled=as_bool(payload.get('mfa_enabled'), role in CONSOLE_ROLE_KEYS),
        whatsapp_enabled=as_bool(payload.get('whatsapp_enabled'), False),
    )
    if password:
        user.set_password(password)

    db.session.add(user)
    record_audit('CREATE', 'User', f'{user.name} created as {ROLE_LABELS.get(role, role)}',
                 category='roles', user=current_user)
    db.session.commit()

    return jsonify(user.to_dict()), 201


@users_bp.route('/<int:uid>', methods=['PUT', 'PATCH'])
@login_required
def update_user(uid):
    denied = ensure('users', 'edit')
    if denied:
        return denied

    user = db.session.get(User, uid)
    if user is None:
        return jsonify({'error': 'User not found'}), 404

    payload = json_dict(request)
    previous_role = user.role

    if 'role' in payload:
        role = one_of(payload.get('role'), MANAGED_ROLE_KEYS)
        if role is None:
            return jsonify({'error': 'That role is not recognised'}), 400
        if (role == 'super_admin' or user.role == 'super_admin') and not _is_super_admin():
            return jsonify({'error': 'Only a super admin can change super admin accounts'}), 403
        if user.role == 'super_admin' and role != 'super_admin' and _active_super_admins() <= 1:
            return jsonify({'error': 'The last active super admin cannot be demoted'}), 409
        user.role = role

    if 'status' in payload:
        status = one_of(payload.get('status'), USER_STATUSES)
        if status is None:
            return jsonify({'error': 'That status is not recognised'}), 400
        if user.role == 'super_admin' and status != 'active' and _active_super_admins() <= 1:
            return jsonify({'error': 'The last active super admin cannot be deactivated'}), 409
        user.status = status

    for field, length in (('first_name', 100), ('last_name', 100), ('phone', 50), ('unit_label', 50)):
        if field in payload:
            setattr(user, field, clean_string(payload.get(field), length))

    if 'email' in payload:
        email = clean_email(payload.get('email'))
        if not email:
            return jsonify({'error': 'A valid email address is required'}), 400
        clash = User.query.filter(User.email == email, User.id != user.id).first()
        if clash:
            return jsonify({'error': 'That email address is already registered'}), 409
        user.email = email

    if 'development_id' in payload:
        development_id = as_int(payload.get('development_id'))
        if development_id and db.session.get(Development, development_id) is None:
            return jsonify({'error': 'Property not found'}), 404
        user.development_id = development_id

    if 'mfa_enabled' in payload:
        user.mfa_enabled = as_bool(payload.get('mfa_enabled'), user.mfa_enabled)
    if 'whatsapp_enabled' in payload:
        user.whatsapp_enabled = as_bool(payload.get('whatsapp_enabled'), user.whatsapp_enabled)

    password = clean_string(payload.get('password'))
    if password:
        if len(password) < 10:
            return jsonify({'error': 'Password must be at least 10 characters'}), 400
        user.set_password(password)

    if 'permission_overrides' in payload and _is_super_admin():
        overrides = normalize_matrix(payload.get('permission_overrides'))
        user.permission_overrides = overrides or None

    if previous_role != user.role:
        record_audit('MODIFY', 'Role',
                     f'{user.name}: {ROLE_LABELS.get(previous_role, previous_role)} → '
                     f'{ROLE_LABELS.get(user.role, user.role)}',
                     category='roles', user=current_user)
    else:
        record_audit('MODIFY', 'User', f'{user.name} updated', category='roles', user=current_user)

    db.session.commit()
    return jsonify(user.to_dict())


@users_bp.route('/<int:uid>', methods=['DELETE'])
@login_required
def delete_user(uid):
    denied = ensure('users', 'delete')
    if denied:
        return denied

    user = db.session.get(User, uid)
    if user is None:
        return jsonify({'error': 'User not found'}), 404
    if user.id == current_user.id:
        return jsonify({'error': 'You cannot delete your own account'}), 409
    if user.role == 'super_admin' and _active_super_admins() <= 1:
        return jsonify({'error': 'The last active super admin cannot be deleted'}), 409

    name = user.name
    db.session.delete(user)
    record_audit('DELETE', 'User', f'{name} removed', category='roles', user=current_user)
    db.session.commit()

    return jsonify({'ok': True})


def _active_super_admins():
    return User.query.filter(User.role == 'super_admin', User.status == 'active').count()
