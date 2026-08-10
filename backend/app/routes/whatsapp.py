"""WhatsApp Business routes — delivery stats, templates and connected numbers."""
from datetime import date

from flask import Blueprint, jsonify, request
from flask_login import current_user, login_required

from ..extensions import db
from ..models import WhatsAppNumber, WhatsAppStat, WhatsAppTemplate
from ..models.audit import record_audit
from ..models.integration import TEMPLATE_CATEGORIES, TEMPLATE_STATUSES
from ..permissions import ensure
from ..utils.validation import as_float, as_int, clean_string, json_dict, one_of

whatsapp_bp = Blueprint('whatsapp', __name__)


def _current_month():
    today = date.today()
    return f'{today.year:04d}-{today.month:02d}'


@whatsapp_bp.route('/', methods=['GET'])
@login_required
def whatsapp_status():
    denied = ensure('whatsapp', 'view')
    if denied:
        return denied

    stat = WhatsAppStat.query.filter(WhatsAppStat.period_month == _current_month()).first()
    if stat is None:
        stat = WhatsAppStat.query.order_by(WhatsAppStat.period_month.desc()).first()

    templates = WhatsAppTemplate.query.order_by(WhatsAppTemplate.sort_order,
                                                WhatsAppTemplate.name).all()
    numbers = WhatsAppNumber.query.order_by(WhatsAppNumber.display_name).all()

    return jsonify({
        'stats': stat.to_dict() if stat else None,
        'templates': [template.to_dict() for template in templates],
        'numbers': [number.to_dict() for number in numbers],
    })


@whatsapp_bp.route('/templates', methods=['POST'])
@login_required
def create_template():
    denied = ensure('whatsapp', 'create')
    if denied:
        return denied

    payload = json_dict(request)
    name = clean_string(payload.get('name'), 100)
    if not name:
        return jsonify({'error': 'A template name is required'}), 400
    if WhatsAppTemplate.query.filter(WhatsAppTemplate.name == name).first():
        return jsonify({'error': 'That template name already exists'}), 409

    category = clean_string(payload.get('category'), 30) or 'UTILITY'
    template = WhatsAppTemplate(
        name=name,
        category=category if category in TEMPLATE_CATEGORIES else 'UTILITY',
        status='review',
        body=clean_string(payload.get('body'), 2000),
        cost_per_message=as_float(payload.get('cost_per_message'), 0.85),
        sort_order=as_int(payload.get('sort_order'), 999),
    )
    db.session.add(template)
    record_audit('CREATE', 'WhatsApp', f"Template '{name}' submitted for review",
                 category='whatsapp', user=current_user)
    db.session.commit()

    return jsonify(template.to_dict()), 201


@whatsapp_bp.route('/templates/<int:template_id>', methods=['PATCH', 'PUT'])
@login_required
def update_template(template_id):
    denied = ensure('whatsapp', 'edit')
    if denied:
        return denied

    template = db.session.get(WhatsAppTemplate, template_id)
    if template is None:
        return jsonify({'error': 'Template not found'}), 404

    payload = json_dict(request)
    if 'status' in payload:
        status = one_of(payload.get('status'), TEMPLATE_STATUSES)
        if status is None:
            return jsonify({'error': 'That status is not recognised'}), 400
        template.status = status
        record_audit('MODIFY', 'WhatsApp', f"Template '{template.name}' marked {status}",
                     category='whatsapp', user=current_user)

    if 'body' in payload:
        template.body = clean_string(payload.get('body'), 2000)
    if 'cost_per_message' in payload:
        template.cost_per_message = as_float(payload.get('cost_per_message'),
                                             float(template.cost_per_message or 0))

    db.session.commit()
    return jsonify(template.to_dict())
