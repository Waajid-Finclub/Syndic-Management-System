"""System monitoring routes — health tiles and the alert feed."""
from flask import Blueprint, jsonify, request
from flask_login import login_required

from ..models import SystemAlert, SystemMetric
from ..permissions import ensure
from ..utils.validation import as_int, clean_string

monitoring_bp = Blueprint('monitoring', __name__)


@monitoring_bp.route('/', methods=['GET'])
@login_required
def system_status():
    denied = ensure('monitoring', 'view')
    if denied:
        return denied

    group = clean_string(request.args.get('group'))
    query = SystemMetric.query
    if group:
        query = query.filter(SystemMetric.group_key == group)

    metrics = query.order_by(SystemMetric.sort_order, SystemMetric.label).all()
    limit = as_int(request.args.get('alert_limit'), 10, minimum=1, maximum=100)
    alerts = SystemAlert.query.order_by(SystemAlert.occurred_at.desc()).limit(limit).all()

    degraded = [metric for metric in metrics if not metric.is_ok]

    return jsonify({
        'metrics': [metric.to_dict() for metric in metrics],
        'alerts': [alert.to_dict() for alert in alerts],
        'all_operational': not degraded,
        'degraded_count': len(degraded),
    })
