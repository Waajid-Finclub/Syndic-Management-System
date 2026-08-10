"""Onboarding routes — per-property stage tracking and the checklist template."""
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request
from flask_login import current_user, login_required

from ..extensions import db
from ..models import Development, OnboardingStep
from ..models.audit import record_audit
from ..models.development import ONBOARDING_CHECKLIST_TEMPLATE, ONBOARDING_STAGES
from ..permissions import ensure
from ..seed_data import SETUP_FEE_PROMO
from ..utils.validation import json_dict, one_of

onboarding_bp = Blueprint('onboarding', __name__)

STEP_STATUSES = ['pending', 'current', 'done', 'blocked']
IN_FLIGHT_STATUSES = ('draft', 'setup', 'uat', 'trial')


@onboarding_bp.route('/', methods=['GET'])
@login_required
def onboarding_overview():
    denied = ensure('onboarding', 'view')
    if denied:
        return denied

    developments = (Development.query
                    .filter(Development.status.in_(IN_FLIGHT_STATUSES))
                    .order_by(Development.name)
                    .all())

    clients = []
    for development in developments:
        clients.append({
            'id': development.id,
            'name': development.name,
            'status': development.status,
            'stage_label': development.onboarding_stage_label,
            'percent': development.onboarding_percent,
            'steps': [step.to_dict() for step in development.onboarding_steps],
        })

    return jsonify({
        'clients': clients,
        'checklist_template': ONBOARDING_CHECKLIST_TEMPLATE,
        'stages': ONBOARDING_STAGES,
        'promo': SETUP_FEE_PROMO,
    })


@onboarding_bp.route('/steps/<int:step_id>', methods=['PATCH'])
@login_required
def update_step(step_id):
    denied = ensure('onboarding', 'edit')
    if denied:
        return denied

    step = db.session.get(OnboardingStep, step_id)
    if step is None:
        return jsonify({'error': 'Onboarding step not found'}), 404

    payload = json_dict(request)
    status = one_of(payload.get('status'), STEP_STATUSES)
    if status is None:
        return jsonify({'error': 'A valid status is required'}), 400

    step.status = status
    step.completed_at = datetime.now(timezone.utc) if status == 'done' else None

    development = step.development
    _advance_current_step(development)

    record_audit('MODIFY', 'Onboarding', f'{step.title} marked {status}',
                 category='config', user=current_user, development=development)
    db.session.commit()

    return jsonify({
        'step': step.to_dict(),
        'percent': development.onboarding_percent,
        'stage_label': development.onboarding_stage_label,
    })


def _advance_current_step(development):
    """Keep exactly one step marked 'current': the first that is not done."""
    marked = False
    for step in sorted(development.onboarding_steps, key=lambda s: s.sequence):
        if step.status == 'done':
            continue
        if step.status == 'blocked':
            marked = True
            continue
        if not marked:
            step.status = 'current'
            marked = True
        elif step.status == 'current':
            step.status = 'pending'
