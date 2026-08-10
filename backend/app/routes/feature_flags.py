"""Feature flag routes — global switches and per-property overrides."""
from flask import Blueprint, jsonify, request
from flask_login import current_user, login_required

from ..extensions import db
from ..models import Development, FeatureFlag, FeatureFlagOverride
from ..models.audit import record_audit
from ..models.feature_flag import FLAG_SCOPES
from ..permissions import ensure
from ..utils.validation import as_bool, as_int, clean_string, json_dict

feature_flags_bp = Blueprint('feature_flags', __name__)


@feature_flags_bp.route('/', methods=['GET'])
@login_required
def list_flags():
    denied = ensure('feature_flags', 'view')
    if denied:
        return denied

    flags = FeatureFlag.query.order_by(FeatureFlag.sort_order, FeatureFlag.feature_key).all()
    return jsonify({
        'flags': [flag.to_dict(include_overrides=True) for flag in flags],
        'scopes': FLAG_SCOPES,
    })


@feature_flags_bp.route('/', methods=['POST'])
@login_required
def create_flag():
    denied = ensure('feature_flags', 'create')
    if denied:
        return denied

    payload = json_dict(request)
    key = clean_string(payload.get('feature_key'), 100)
    if not key:
        return jsonify({'error': 'A feature key is required'}), 400
    if FeatureFlag.query.filter(FeatureFlag.feature_key == key).first():
        return jsonify({'error': 'That feature key already exists'}), 409

    scope = clean_string(payload.get('scope'), 50) or 'Global'
    flag = FeatureFlag(
        feature_key=key,
        description=clean_string(payload.get('description'), 255),
        is_enabled=as_bool(payload.get('is_enabled'), False),
        scope=scope if scope in FLAG_SCOPES else 'Global',
        sort_order=as_int(payload.get('sort_order'), 999),
    )
    db.session.add(flag)
    record_audit('CREATE', 'Config', f"Flag '{key}' created", category='config', user=current_user)
    db.session.commit()

    return jsonify(flag.to_dict()), 201


@feature_flags_bp.route('/<int:flag_id>', methods=['PATCH', 'PUT'])
@login_required
def update_flag(flag_id):
    denied = ensure('feature_flags', 'edit')
    if denied:
        return denied

    flag = db.session.get(FeatureFlag, flag_id)
    if flag is None:
        return jsonify({'error': 'Feature flag not found'}), 404

    payload = json_dict(request)
    if 'is_enabled' in payload:
        was_enabled = flag.is_enabled
        flag.is_enabled = as_bool(payload.get('is_enabled'), flag.is_enabled)
        if was_enabled != flag.is_enabled:
            state = 'enabled' if flag.is_enabled else 'disabled'
            record_audit('MODIFY', 'Config',
                         f"Flag '{flag.feature_key}' {state} {flag.scope.lower()}",
                         category='config', user=current_user)

    if 'description' in payload:
        flag.description = clean_string(payload.get('description'), 255)
    if 'scope' in payload:
        scope = clean_string(payload.get('scope'), 50)
        if scope in FLAG_SCOPES:
            flag.scope = scope
    if 'config_json' in payload:
        flag.config_json = payload.get('config_json')

    db.session.commit()
    return jsonify(flag.to_dict(include_overrides=True))


@feature_flags_bp.route('/<int:flag_id>/overrides', methods=['PUT'])
@login_required
def set_override(flag_id):
    denied = ensure('feature_flags', 'edit')
    if denied:
        return denied

    flag = db.session.get(FeatureFlag, flag_id)
    if flag is None:
        return jsonify({'error': 'Feature flag not found'}), 404

    payload = json_dict(request)
    development_id = as_int(payload.get('development_id'))
    development = db.session.get(Development, development_id or 0)
    if development is None:
        return jsonify({'error': 'Property not found'}), 404

    override = FeatureFlagOverride.query.filter(
        FeatureFlagOverride.feature_flag_id == flag.id,
        FeatureFlagOverride.development_id == development.id,
    ).first()

    if payload.get('remove'):
        if override is not None:
            db.session.delete(override)
        record_audit('MODIFY', 'Config',
                     f"Flag '{flag.feature_key}' override removed for {development.name}",
                     category='config', user=current_user, development=development)
        db.session.commit()
        return jsonify(flag.to_dict(include_overrides=True))

    is_enabled = as_bool(payload.get('is_enabled'), False)
    if override is None:
        override = FeatureFlagOverride(feature_flag_id=flag.id, development_id=development.id)
        db.session.add(override)
    override.is_enabled = is_enabled

    record_audit('MODIFY', 'Config',
                 f"Flag '{flag.feature_key}' {'enabled' if is_enabled else 'disabled'} for {development.name}",
                 category='config', user=current_user, development=development)
    db.session.commit()

    return jsonify(flag.to_dict(include_overrides=True))
