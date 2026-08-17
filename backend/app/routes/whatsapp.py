"""WhatsApp Business routes — delivery stats, templates, numbers and dispatch."""
from flask import Blueprint, jsonify, request
from flask_login import current_user, login_required

from ..extensions import db
from ..models import AuditLog, Development, WhatsAppMessage, WhatsAppNumber, WhatsAppTemplate
from ..models.audit import record_audit
from ..models.integration import TEMPLATE_CATEGORIES, TEMPLATE_STATUSES
from ..permissions import ensure, has_permission
from ..services.whatsapp_dispatch import (
    AUDIENCE_KEYS,
    AUDIENCE_LABELS,
    AUDIENCES,
    MAX_RECIPIENTS,
    audience_query,
    audience_summary,
    dispatch,
    is_reachable,
    month_stat,
    placeholders,
    render,
    sent_since,
    start_of_today,
)
from ..utils.validation import as_float, as_int, clean_string, json_dict, one_of

whatsapp_bp = Blueprint('whatsapp', __name__)


@whatsapp_bp.route('/', methods=['GET'])
@login_required
def whatsapp_status():
    denied = ensure('whatsapp', 'view')
    if denied:
        return denied

    stat = month_stat()
    templates = WhatsAppTemplate.query.order_by(WhatsAppTemplate.sort_order,
                                                WhatsAppTemplate.name).all()
    numbers = WhatsAppNumber.query.order_by(WhatsAppNumber.display_name).all()

    return jsonify({
        'stats': stat.to_dict() if stat else None,
        'templates': [template.to_dict() for template in templates],
        'numbers': [number.to_dict() for number in numbers],
    })


# --- Message centre --------------------------------------------------------

def _template_payload(template):
    """A template plus what the composer needs to drive it."""
    return {
        **template.to_dict(),
        'placeholders': placeholders(template.body),
        'can_send': template.status == 'approved' and bool((template.body or '').strip()),
    }


@whatsapp_bp.route('/center', methods=['GET'])
@login_required
def message_center():
    """Everything the WhatsApp Centre dashboard renders on load."""
    denied = ensure('whatsapp', 'view')
    if denied:
        return denied

    templates = WhatsAppTemplate.query.order_by(WhatsAppTemplate.sort_order,
                                                WhatsAppTemplate.name).all()
    developments = (Development.query
                    .filter(Development.whatsapp_enabled.is_(True))
                    .order_by(Development.name)
                    .all())
    dispatches = (AuditLog.query
                  .filter(AuditLog.category == 'whatsapp', AuditLog.action == 'SEND')
                  .order_by(AuditLog.occurred_at.desc(), AuditLog.id.desc())
                  .limit(50)
                  .all())
    stat = month_stat()

    return jsonify({
        'templates': [_template_payload(template) for template in templates],
        'audiences': AUDIENCES,
        'developments': [{'id': d.id, 'name': d.name, 'code': d.code} for d in developments],
        'stats': stat.to_dict() if stat else None,
        'today': sent_since(start_of_today()),
        'recent_dispatches': [entry.to_dict() for entry in dispatches],
        'max_recipients': MAX_RECIPIENTS,
        'can_send': has_permission(current_user, 'whatsapp', 'create'),
    })


@whatsapp_bp.route('/audience', methods=['GET'])
@login_required
def audience_preview():
    """Live recipient counts for the audience and property the composer holds."""
    denied = ensure('whatsapp', 'view')
    if denied:
        return denied

    audience = one_of(request.args.get('audience'), AUDIENCE_KEYS)
    if audience is None:
        return jsonify({'error': 'That audience is not recognised'}), 400

    return jsonify(audience_summary(audience, as_int(request.args.get('development_id'))))


@whatsapp_bp.route('/dispatch', methods=['POST'])
@login_required
def trigger_dispatch():
    """Render a template and hand it to the dispatch client, once per recipient."""
    denied = ensure('whatsapp', 'create')
    if denied:
        return denied

    payload = json_dict(request)

    template = db.session.get(WhatsAppTemplate, as_int(payload.get('template_id')))
    if template is None:
        return jsonify({'error': 'Template not found'}), 404
    if template.status != 'approved':
        return jsonify({'error': f"'{template.name}' is not approved by Meta, so it cannot be sent"}), 409
    if not (template.body or '').strip():
        return jsonify({'error': 'That template has no message body to send'}), 400

    body, missing = render(template.body, payload.get('variables'))
    if missing:
        return jsonify({
            'error': f"Fill in every placeholder first: {', '.join(missing)}",
            'missing': missing,
        }), 400

    development_id = as_int(payload.get('development_id'))
    development = db.session.get(Development, development_id) if development_id else None
    if development_id and development is None:
        return jsonify({'error': 'That property is not on the platform'}), 404

    test_number = clean_string(payload.get('test_number'), 40)
    if test_number:
        recipients = [(None, test_number)]
        audience_label = 'a test number'
    else:
        audience = one_of(payload.get('audience'), AUDIENCE_KEYS)
        if audience is None:
            return jsonify({'error': 'Choose who this message goes to'}), 400

        people = [person for person in audience_query(audience, development_id).all()
                  if is_reachable(person)]
        if not people:
            return jsonify({
                'error': 'Nobody in that audience has opted in to WhatsApp with a number on file',
            }), 400
        if len(people) > MAX_RECIPIENTS:
            return jsonify({
                'error': f'That audience is {len(people)} people; one dispatch is capped at {MAX_RECIPIENTS}',
            }), 400

        recipients = [(person, person.phone.strip()) for person in people]
        audience_label = AUDIENCE_LABELS[audience].lower()

    outcome = dispatch(template, body, recipients, development=development)
    scope = development.name if development else 'all properties'
    detail = f"{outcome['sent']} x {template.name} to {audience_label} ({scope})"
    if outcome['failed']:
        detail += f", {outcome['failed']} rejected"

    record_audit('SEND', 'WhatsApp', detail, category='whatsapp',
                 user=current_user, development=development)
    db.session.commit()

    return jsonify({**outcome, 'detail': detail}), 201


@whatsapp_bp.route('/messages', methods=['GET'])
@login_required
def list_messages():
    """The outbound message log, newest first."""
    denied = ensure('whatsapp', 'view')
    if denied:
        return denied

    query = WhatsAppMessage.query

    template = clean_string(request.args.get('template'), 100)
    if template:
        query = query.filter(WhatsAppMessage.template_name == template)

    development_id = as_int(request.args.get('development_id'))
    if development_id:
        query = query.filter(WhatsAppMessage.development_id == development_id)

    status = clean_string(request.args.get('status'), 30)
    if status and status != 'all':
        query = query.filter(WhatsAppMessage.status == status)

    limit = as_int(request.args.get('limit'), 50, minimum=1, maximum=200)
    messages = (query
                .order_by(WhatsAppMessage.created_at.desc(), WhatsAppMessage.id.desc())
                .limit(limit)
                .all())

    return jsonify({
        'messages': [message.to_dict() for message in messages],
        'total': query.count(),
    })


# --- Templates -------------------------------------------------------------

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
