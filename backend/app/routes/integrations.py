"""API and integration routes — connector status, endpoint catalog and API keys."""
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request
from flask_login import current_user, login_required

from ..extensions import db
from ..models import ApiKey, Integration, SystemMetric
from ..models.audit import record_audit
from ..permissions import ensure
from ..utils.validation import clean_string, json_dict

integrations_bp = Blueprint('integrations', __name__)

# The public API surface the platform exposes, grouped for the console listing.
API_ENDPOINTS = [
    '/auth', '/users', '/tenants', '/developments', '/buildings', '/units',
    '/parking', '/stores', '/facilities', '/owners', '/residents', '/billing',
    '/invoices', '/payments', '/arrears', '/expenses', '/funds', '/budgets',
    '/maintenance', '/work-orders', '/assets', '/vendors', '/announcements',
    '/notifications', '/whatsapp', '/meetings', '/votes', '/documents',
    '/subscriptions', '/config',
]


@integrations_bp.route('/', methods=['GET'])
@login_required
def list_integrations():
    denied = ensure('integrations', 'view')
    if denied:
        return denied

    integrations = Integration.query.order_by(Integration.sort_order, Integration.name).all()
    api_metrics = (SystemMetric.query
                   .filter(SystemMetric.group_key == 'api')
                   .order_by(SystemMetric.sort_order)
                   .all())
    keys = ApiKey.query.order_by(ApiKey.created_at.desc()).all()

    return jsonify({
        'integrations': [integration.to_dict() for integration in integrations],
        'api_metrics': [metric.to_dict() for metric in api_metrics],
        'endpoints': API_ENDPOINTS,
        'api_keys': [key.to_dict() for key in keys],
    })


@integrations_bp.route('/keys', methods=['POST'])
@login_required
def create_key():
    denied = ensure('integrations', 'create')
    if denied:
        return denied

    payload = json_dict(request)
    name = clean_string(payload.get('name'), 100)
    if not name:
        return jsonify({'error': 'A key name is required'}), 400

    raw, prefix, key_hash = ApiKey.generate()
    key = ApiKey(name=name, key_prefix=prefix, key_hash=key_hash, created_by_id=current_user.id)
    db.session.add(key)
    record_audit('CREATE', 'API Key', f"API key '{name}' issued", category='config', user=current_user)
    db.session.commit()

    # The plaintext key is returned once and never stored.
    return jsonify({**key.to_dict(), 'plaintext_key': raw}), 201


@integrations_bp.route('/keys/<int:key_id>', methods=['DELETE'])
@login_required
def revoke_key(key_id):
    denied = ensure('integrations', 'delete')
    if denied:
        return denied

    key = db.session.get(ApiKey, key_id)
    if key is None:
        return jsonify({'error': 'API key not found'}), 404
    if key.revoked_at is not None:
        return jsonify({'error': 'That key is already revoked'}), 409

    key.revoked_at = datetime.now(timezone.utc)
    record_audit('DELETE', 'API Key', f"API key '{key.name}' revoked", category='config', user=current_user)
    db.session.commit()

    return jsonify(key.to_dict())


@integrations_bp.route('/<int:integration_id>', methods=['PATCH'])
@login_required
def update_integration(integration_id):
    denied = ensure('integrations', 'edit')
    if denied:
        return denied

    integration = db.session.get(Integration, integration_id)
    if integration is None:
        return jsonify({'error': 'Integration not found'}), 404

    payload = json_dict(request)
    if 'status' in payload:
        integration.status = clean_string(payload.get('status'), 30) or integration.status
    if 'last_sync_label' in payload:
        integration.last_sync_label = clean_string(payload.get('last_sync_label'), 60)

    record_audit('MODIFY', 'Integration', f'{integration.name} updated',
                 category='config', user=current_user)
    db.session.commit()

    return jsonify(integration.to_dict())
