"""Platform overview — the aggregated KPI payload behind the landing screen."""
from datetime import date

from flask import Blueprint, jsonify
from flask_login import login_required

from ..extensions import db
from ..models import Development, RevenueSnapshot, Subscription, SubscriptionPlan, SystemMetric, User, WhatsAppStat
from ..models.development import PIPELINE_LABELS, PIPELINE_STAGES
from ..permissions import ensure

overview_bp = Blueprint('overview', __name__)


def _current_month():
    today = date.today()
    return f'{today.year:04d}-{today.month:02d}'


@overview_bp.route('/overview', methods=['GET'])
@login_required
def platform_overview():
    denied = ensure('overview', 'view')
    if denied:
        return denied

    developments = Development.query.all()
    subscriptions = Subscription.query.all()
    billable = [s for s in subscriptions if s.status in ('trial', 'active')]

    mrr = round(sum(s.mrr for s in billable), 2)
    kpis = {
        'properties': len(developments),
        'units': sum(d.unit_count for d in developments),
        'parking': sum(d.parking_count for d in developments),
        'ev_parking': sum(d.ev_parking_count for d in developments),
        'users': sum(d.user_count for d in developments) or User.query.count(),
        'mrr': mrr,
        'arr': round(mrr * 12, 2),
    }

    uptime = SystemMetric.query.filter(SystemMetric.metric_key == 'uptime_30d').first()
    kpis['uptime'] = uptime.value_text if uptime else None

    # Plan mix, e.g. "Basic 15 • Silver 72 • Premium 40".
    plan_mix = []
    for plan in SubscriptionPlan.query.order_by(SubscriptionPlan.sort_order).all():
        plan_mix.append({
            'code': plan.code,
            'name': plan.name,
            'clients': len([s for s in billable if s.plan_id == plan.id]),
        })

    whatsapp = WhatsAppStat.query.filter(WhatsAppStat.period_month == _current_month()).first()
    if whatsapp is None:
        whatsapp = WhatsAppStat.query.order_by(WhatsAppStat.period_month.desc()).first()

    setup_fees = round(sum(float(s.setup_fee_amount or 0) for s in subscriptions), 2)

    pipeline = []
    for stage in PIPELINE_STAGES:
        pipeline.append({
            'stage': stage,
            'label': PIPELINE_LABELS[stage],
            'count': sum(1 for d in developments if d.pipeline_stage == stage),
        })

    revenue = [snapshot.to_dict() for snapshot in
               RevenueSnapshot.query.order_by(RevenueSnapshot.period_month).limit(12).all()]

    recent = sorted(developments, key=lambda d: (d.created_at or 0), reverse=True)[:5]

    return jsonify({
        'kpis': kpis,
        'plan_mix': plan_mix,
        'setup_fees_collected': setup_fees,
        'whatsapp': whatsapp.to_dict() if whatsapp else None,
        'pipeline': pipeline,
        'revenue_trend': revenue,
        'recent_properties': [d.to_dict() for d in recent],
        'property_count': len(developments),
    })
