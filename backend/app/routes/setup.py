"""First-run setup — creates the first super admin and the platform defaults."""
from flask import Blueprint, jsonify, request

from ..extensions import db
from ..models import FeatureFlag, SubscriptionPlan, User
from ..models.audit import record_audit
from ..seed_data import DEFAULT_FEATURE_FLAGS, DEFAULT_PLANS
from ..utils.validation import clean_email, clean_string, json_dict

setup_bp = Blueprint('setup', __name__)


@setup_bp.route('/init', methods=['POST'])
def init():
    if db.session.query(User.id).filter(User.role == 'super_admin').first() is not None:
        return jsonify({'error': 'Setup has already been completed'}), 409

    payload = json_dict(request)
    first_name = clean_string(payload.get('first_name'), 100)
    last_name = clean_string(payload.get('last_name'), 100)
    email = clean_email(payload.get('email'))
    password = clean_string(payload.get('password'))

    if not first_name or not email or not password:
        return jsonify({'error': 'First name, email and password are required'}), 400
    if len(password) < 10:
        return jsonify({'error': 'Password must be at least 10 characters'}), 400

    admin = User(
        first_name=first_name,
        last_name=last_name,
        email=email,
        role='super_admin',
        status='active',
        mfa_enabled=False,
    )
    admin.set_password(password)
    db.session.add(admin)

    seed_reference_data()

    record_audit('CREATE', 'User', f'First super admin created: {email}',
                 category='roles', user=admin)
    db.session.commit()

    return jsonify({'user': admin.to_dict(include_permissions=True)}), 201


def seed_reference_data():
    """Insert the plan catalog and feature flags when they are missing."""
    if db.session.query(SubscriptionPlan.id).first() is None:
        for order, plan in enumerate(DEFAULT_PLANS):
            db.session.add(SubscriptionPlan(sort_order=order, **plan))

    if db.session.query(FeatureFlag.id).first() is None:
        for order, flag in enumerate(DEFAULT_FEATURE_FLAGS):
            db.session.add(FeatureFlag(sort_order=order, **flag))
