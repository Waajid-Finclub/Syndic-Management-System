"""Auth routes — login, logout, session check, CSRF token, setup status."""
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request
from flask_login import current_user, login_required, login_user, logout_user

from ..extensions import db
from ..models import User
from ..models.audit import record_audit
from ..permissions import CONSOLE_ROLE_KEYS, catalog, effective_matrix
from ..security import get_csrf_token
from ..utils.validation import clean_email, clean_string, json_dict

auth_bp = Blueprint('auth', __name__)


@auth_bp.route('/csrf-token', methods=['GET'])
def csrf_token():
    return jsonify({'csrf_token': get_csrf_token()})


@auth_bp.route('/check-setup', methods=['GET'])
def check_setup():
    has_admin = db.session.query(User.id).filter(User.role == 'super_admin').first() is not None
    return jsonify({'setup_complete': has_admin})


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

    if user.role not in CONSOLE_ROLE_KEYS:
        return jsonify({'error': 'This account does not have access to the admin console'}), 403
    if user.status != 'active':
        return jsonify({'error': f'This account is {user.status}'}), 403

    login_user(user, remember=False)
    user.last_login_at = datetime.now(timezone.utc)
    record_audit('LOGIN', 'Session', f'{user.name} signed in to the admin console',
                 category='system', user=user, ip_address=request.remote_addr)
    db.session.commit()

    return jsonify({'user': user.to_dict(include_permissions=True)})


@auth_bp.route('/logout', methods=['POST'])
@login_required
def logout():
    logout_user()
    return jsonify({'ok': True})


@auth_bp.route('/me', methods=['GET'])
def me():
    if not current_user.is_authenticated:
        return jsonify({'user': None})
    return jsonify({'user': current_user.to_dict(include_permissions=True)})


@auth_bp.route('/permission-catalog', methods=['GET'])
@login_required
def permission_catalog():
    return jsonify({**catalog(), 'effective': effective_matrix(current_user)})
