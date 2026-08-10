"""Client property (development) registry routes."""
import csv
import io

from flask import Blueprint, Response, jsonify, request
from flask_login import current_user, login_required

from ..extensions import db
from ..models import Development, DevelopmentSettings, OnboardingStep, Subscription, SubscriptionPlan
from ..models.audit import record_audit
from ..models.development import (
    DEVELOPMENT_STATUSES,
    DEVELOPMENT_TYPES,
    ONBOARDING_STAGES,
    PIPELINE_STAGES,
)
from ..permissions import ensure
from ..utils.validation import as_bool, as_date, as_int, clean_email, clean_string, json_dict, one_of

developments_bp = Blueprint('developments', __name__)


def _slug_code(name):
    letters = [c for c in (name or '').upper() if c.isalnum() or c == ' ']
    words = ''.join(letters).split()
    return ('-'.join(word[:4] for word in words[:3]) or 'DEV')[:40]


def _unique_code(name):
    base = _slug_code(name)
    code = base
    suffix = 2
    while db.session.query(Development.id).filter(Development.code == code).first() is not None:
        code = f'{base}-{suffix}'
        suffix += 1
    return code


def _apply_payload(development, payload, creating=False):
    """Copy the editable fields from a JSON payload onto a development."""
    if creating or 'name' in payload:
        name = clean_string(payload.get('name'), 255)
        if not name:
            return 'Property name is required'
        development.name = name

    if 'development_type' in payload or creating:
        development.development_type = one_of(
            payload.get('development_type'), DEVELOPMENT_TYPES,
            development.development_type or 'apartment')

    if 'status' in payload or creating:
        development.status = one_of(payload.get('status'), DEVELOPMENT_STATUSES,
                                    development.status or 'draft')

    if 'pipeline_stage' in payload or creating:
        development.pipeline_stage = one_of(payload.get('pipeline_stage'), PIPELINE_STAGES,
                                            development.pipeline_stage or 'prospect')

    for field, length in (
        ('address_line_1', 255), ('address_line_2', 255), ('city', 100),
        ('district', 100), ('country', 100), ('syndic_manager_name', 150),
    ):
        if field in payload:
            setattr(development, field, clean_string(payload.get(field), length))

    if 'syndic_manager_email' in payload:
        development.syndic_manager_email = clean_email(payload.get('syndic_manager_email'))

    if 'launch_date' in payload:
        development.launch_date = as_date(payload.get('launch_date'))

    for field in ('unit_count', 'parking_count', 'ev_parking_count',
                  'storage_count', 'facility_count', 'user_count'):
        if field in payload:
            setattr(development, field, as_int(payload.get(field), getattr(development, field) or 0, minimum=0))

    if 'whatsapp_enabled' in payload:
        development.whatsapp_enabled = as_bool(payload.get('whatsapp_enabled'),
                                               development.whatsapp_enabled)

    if not development.country:
        development.country = 'Mauritius'
    return None


@developments_bp.route('/', methods=['GET'])
@login_required
def list_developments():
    denied = ensure('properties', 'view')
    if denied:
        return denied

    query = Development.query
    status = clean_string(request.args.get('status'))
    if status and status != 'all':
        query = query.filter(Development.status == status)

    search = clean_string(request.args.get('q'))
    if search:
        like = f'%{search.lower()}%'
        query = query.filter(db.or_(
            db.func.lower(Development.name).like(like),
            db.func.lower(Development.city).like(like),
            db.func.lower(Development.syndic_manager_name).like(like),
        ))

    developments = query.order_by(Development.name).all()
    rows = [development.to_dict() for development in developments]

    counts = {'all': Development.query.count()}
    for value in DEVELOPMENT_STATUSES:
        counts[value] = Development.query.filter(Development.status == value).count()

    totals = {
        'properties': counts['all'],
        'units': sum(row['unit_count'] for row in rows),
        'parking': sum(row['parking_count'] for row in rows),
        'storage': sum(row['storage_count'] for row in rows),
        'facilities': sum(row['facility_count'] for row in rows),
        'users': sum(row['user_count'] for row in rows),
        'mrr': round(sum(row.get('mrr') or 0 for row in rows), 2),
    }
    totals['avg_units'] = round(totals['units'] / counts['all']) if counts['all'] else 0

    return jsonify({'developments': rows, 'status_counts': counts, 'totals': totals})


@developments_bp.route('/export', methods=['GET'])
@login_required
def export_developments():
    denied = ensure('properties', 'export')
    if denied:
        return denied

    developments = Development.query.order_by(Development.name).all()

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow([
        'Code', 'Property', 'Location', 'District', 'Type', 'Syndic manager',
        'Plan', 'Units', 'Parking', 'EV bays', 'Storage', 'Facilities',
        'Portal users', 'Status', 'MRR (MUR)', 'Since',
    ])
    for development in developments:
        row = development.to_dict()
        writer.writerow([
            row['code'], row['name'], row['location'] or '', row['district'] or '',
            row['development_type'], row['syndic_manager_name'] or '',
            row['plan_name'] or '', row['unit_count'], row['parking_count'],
            row['ev_parking_count'], row['storage_count'], row['facility_count'],
            row['user_count'], row['status'], f"{row['mrr']:.2f}",
            row['launch_date'] or '',
        ])

    return Response(
        buffer.getvalue(),
        mimetype='text/csv',
        headers={'Content-Disposition': 'attachment; filename=client-properties.csv'},
    )


@developments_bp.route('/<int:did>', methods=['GET'])
@login_required
def get_development(did):
    denied = ensure('properties', 'view')
    if denied:
        return denied

    development = db.session.get(Development, did)
    if development is None:
        return jsonify({'error': 'Property not found'}), 404

    payload = development.to_dict()
    payload['settings'] = development.settings.to_dict() if development.settings else None
    payload['onboarding_steps'] = [step.to_dict() for step in development.onboarding_steps]
    payload['subscription'] = development.subscription.to_dict() if development.subscription else None
    return jsonify(payload)


@developments_bp.route('/', methods=['POST'])
@login_required
def create_development():
    denied = ensure('properties', 'create')
    if denied:
        return denied

    payload = json_dict(request)
    development = Development(code='PENDING')
    error = _apply_payload(development, payload, creating=True)
    if error:
        return jsonify({'error': error}), 400

    development.code = clean_string(payload.get('code'), 50) or _unique_code(development.name)
    if db.session.query(Development.id).filter(Development.code == development.code).first():
        return jsonify({'error': 'That property code is already in use'}), 409

    db.session.add(development)
    db.session.flush()

    db.session.add(DevelopmentSettings(development_id=development.id))
    for sequence, title in enumerate(ONBOARDING_STAGES):
        db.session.add(OnboardingStep(
            development_id=development.id,
            sequence=sequence,
            title=title,
            status='current' if sequence == 0 else 'pending',
        ))

    plan_code = one_of(payload.get('plan_code'), ['basic', 'silver', 'premium'], 'basic')
    plan = SubscriptionPlan.query.filter(SubscriptionPlan.code == plan_code).first()
    if plan is not None:
        db.session.add(Subscription(
            development_id=development.id,
            plan_id=plan.id,
            setup_fee_amount=plan.setup_fee_amount,
            monthly_unit_rate=plan.monthly_unit_rate,
            vat_rate=plan.vat_rate,
            active_units_count=development.unit_count,
            status='trial',
            start_date=development.launch_date,
        ))

    record_audit('CREATE', 'Property', f'{development.name} added to the platform',
                 category='config', user=current_user, development=development)
    db.session.commit()

    return jsonify(development.to_dict()), 201


@developments_bp.route('/<int:did>', methods=['PUT', 'PATCH'])
@login_required
def update_development(did):
    denied = ensure('properties', 'edit')
    if denied:
        return denied

    development = db.session.get(Development, did)
    if development is None:
        return jsonify({'error': 'Property not found'}), 404

    payload = json_dict(request)
    before = development.to_dict()
    error = _apply_payload(development, payload)
    if error:
        return jsonify({'error': error}), 400

    # Keep the billed unit count aligned with the registry unless it was set explicitly.
    if development.subscription and 'unit_count' in payload and 'active_units_count' not in payload:
        development.subscription.active_units_count = development.unit_count

    record_audit('MODIFY', 'Property', f'{development.name} updated',
                 category='config', user=current_user, development=development,
                 before=before, after=development.to_dict())
    db.session.commit()

    return jsonify(development.to_dict())


@developments_bp.route('/<int:did>', methods=['DELETE'])
@login_required
def delete_development(did):
    denied = ensure('properties', 'delete')
    if denied:
        return denied

    development = db.session.get(Development, did)
    if development is None:
        return jsonify({'error': 'Property not found'}), 404
    if development.users:
        return jsonify({'error': 'Reassign or remove this property\'s users before deleting it'}), 409

    name = development.name
    record_audit('DELETE', 'Property', f'{name} removed from the platform',
                 category='config', user=current_user, before=development.to_dict())
    db.session.delete(development)
    db.session.commit()

    return jsonify({'ok': True})
