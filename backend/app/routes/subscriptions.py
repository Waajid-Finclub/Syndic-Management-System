"""Subscription routes — plan catalog, per-property subscriptions and platform metrics."""
from flask import Blueprint, jsonify, request
from flask_login import current_user, login_required

from ..extensions import db
from ..models import Development, Subscription, SubscriptionInvoice, SubscriptionPlan
from ..models.audit import record_audit
from ..models.subscription import PLAN_CODES, SUBSCRIPTION_STATUSES
from ..permissions import ensure
from ..seed_data import SETUP_FEE_PROMO
from ..utils.validation import as_bool, as_date, as_float, as_int, clean_string, json_dict, one_of

subscriptions_bp = Blueprint('subscriptions', __name__)


@subscriptions_bp.route('/', methods=['GET'])
@login_required
def list_subscriptions():
    denied = ensure('subscriptions', 'view')
    if denied:
        return denied

    plans = SubscriptionPlan.query.order_by(SubscriptionPlan.sort_order).all()
    subscriptions = Subscription.query.all()
    billable = [s for s in subscriptions if s.status in ('trial', 'active')]

    mrr = round(sum(s.mrr for s in billable), 2)
    client_count = len(billable)
    cancelled = len([s for s in subscriptions if s.status == 'cancelled'])
    churn = round(cancelled / len(subscriptions) * 100, 1) if subscriptions else 0.0
    arpc = round(mrr / client_count, 2) if client_count else 0.0

    metrics = {
        'mrr': mrr,
        'arr': round(mrr * 12, 2),
        'churn_pct': churn,
        'arpc': arpc,
        # Lifetime value at the observed churn rate, capped for a sane display value.
        'ltv': round(arpc / (churn / 100), 2) if churn else round(arpc * 48, 2),
        'client_count': client_count,
    }

    return jsonify({
        'plans': [plan.to_dict() for plan in plans],
        'subscriptions': [subscription.to_dict() for subscription in subscriptions],
        'metrics': metrics,
        'promo': SETUP_FEE_PROMO,
    })


@subscriptions_bp.route('/plans', methods=['POST'])
@login_required
def create_plan():
    denied = ensure('subscriptions', 'create')
    if denied:
        return denied

    payload = json_dict(request)
    code = one_of(payload.get('code'), PLAN_CODES) or clean_string(payload.get('code'), 30)
    name = clean_string(payload.get('name'), 80)
    if not code or not name:
        return jsonify({'error': 'A plan code and name are required'}), 400
    if SubscriptionPlan.query.filter(SubscriptionPlan.code == code).first():
        return jsonify({'error': 'That plan code already exists'}), 409

    features = payload.get('features')
    plan = SubscriptionPlan(
        code=code,
        name=name,
        monthly_unit_rate=as_float(payload.get('monthly_unit_rate'), 100),
        vat_rate=as_float(payload.get('vat_rate'), 15),
        setup_fee_amount=as_float(payload.get('setup_fee_amount'), 0),
        features=features if isinstance(features, list) else [],
        is_popular=as_bool(payload.get('is_popular'), False),
        sort_order=as_int(payload.get('sort_order'), 0),
    )
    db.session.add(plan)
    record_audit('CREATE', 'Plan', f'Plan {name} created', category='config', user=current_user)
    db.session.commit()

    return jsonify(plan.to_dict()), 201


@subscriptions_bp.route('/plans/<int:plan_id>', methods=['PUT', 'PATCH'])
@login_required
def update_plan(plan_id):
    denied = ensure('subscriptions', 'edit')
    if denied:
        return denied

    plan = db.session.get(SubscriptionPlan, plan_id)
    if plan is None:
        return jsonify({'error': 'Plan not found'}), 404

    payload = json_dict(request)
    if 'name' in payload:
        plan.name = clean_string(payload.get('name'), 80) or plan.name
    for field in ('monthly_unit_rate', 'vat_rate', 'setup_fee_amount'):
        if field in payload:
            setattr(plan, field, as_float(payload.get(field), float(getattr(plan, field) or 0)))
    if 'features' in payload and isinstance(payload.get('features'), list):
        plan.features = payload['features']
    if 'is_popular' in payload:
        plan.is_popular = as_bool(payload.get('is_popular'), plan.is_popular)
    if 'is_active' in payload:
        plan.is_active = as_bool(payload.get('is_active'), plan.is_active)

    record_audit('MODIFY', 'Plan', f'Plan {plan.name} updated', category='config', user=current_user)
    db.session.commit()

    return jsonify(plan.to_dict())


@subscriptions_bp.route('/<int:subscription_id>', methods=['PUT', 'PATCH'])
@login_required
def update_subscription(subscription_id):
    denied = ensure('subscriptions', 'edit')
    if denied:
        return denied

    subscription = db.session.get(Subscription, subscription_id)
    if subscription is None:
        return jsonify({'error': 'Subscription not found'}), 404

    payload = json_dict(request)
    if 'plan_id' in payload:
        plan = db.session.get(SubscriptionPlan, as_int(payload.get('plan_id')) or 0)
        if plan is None:
            return jsonify({'error': 'Plan not found'}), 404
        subscription.plan_id = plan.id
        subscription.monthly_unit_rate = plan.monthly_unit_rate
        subscription.vat_rate = plan.vat_rate

    if 'status' in payload:
        status = one_of(payload.get('status'), SUBSCRIPTION_STATUSES)
        if status is None:
            return jsonify({'error': 'That status is not recognised'}), 400
        subscription.status = status

    if 'active_units_count' in payload:
        subscription.active_units_count = as_int(payload.get('active_units_count'),
                                                 subscription.active_units_count, minimum=0)
    for field in ('setup_fee_amount', 'monthly_unit_rate', 'vat_rate'):
        if field in payload:
            setattr(subscription, field, as_float(payload.get(field), float(getattr(subscription, field) or 0)))
    for field in ('start_date', 'end_date'):
        if field in payload:
            setattr(subscription, field, as_date(payload.get(field)))

    record_audit('MODIFY', 'Subscription',
                 f'{subscription.development.name if subscription.development else "Subscription"} updated',
                 category='financial', user=current_user, development=subscription.development)
    db.session.commit()

    return jsonify(subscription.to_dict())


@subscriptions_bp.route('/invoices', methods=['GET'])
@login_required
def list_invoices():
    denied = ensure('subscriptions', 'view')
    if denied:
        return denied

    query = SubscriptionInvoice.query
    status = clean_string(request.args.get('status'))
    if status and status != 'all':
        query = query.filter(SubscriptionInvoice.status == status)

    development_id = as_int(request.args.get('development_id'))
    if development_id:
        query = (query.join(Subscription)
                 .filter(Subscription.development_id == development_id))

    invoices = query.order_by(SubscriptionInvoice.id.desc()).limit(200).all()
    return jsonify({'invoices': [invoice.to_dict() for invoice in invoices]})
