"""
Maintenance and vendors — the operations side of the syndic console.

This is the other half of the resident maintenance flow. A co-owner submits a
request and watches a seven-step timeline; every step on that timeline is
advanced from here, and each advance appends a MaintenanceEvent rather than only
setting a column, because the resident's screen renders the history, not the
current value.

Status moves forward only. Reopening a closed job creates a new request linked
by reference rather than rewinding the old one: the timeline a co-owner already
read is a record of what they were told.
"""
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request
from flask_login import current_user

from ...extensions import db
from ...models import (
    MaintenanceEvent,
    MaintenanceMessage,
    MaintenanceRequest,
    Unit,
    Vendor,
)
from ...models.audit import record_audit
from ...models.maintenance import (
    MAINTENANCE_CATEGORIES,
    MAINTENANCE_CATEGORY_KEYS,
    PRIORITIES,
    PRIORITY_KEYS,
    REQUEST_STATUS_LABELS,
    REQUEST_STATUS_SEQUENCE,
    REQUEST_STATUSES,
)
from ...services.notifications import notify
from ...services.storage import read_bytes
from ...utils.validation import as_int, clean_email, clean_string, json_dict, one_of
from ._access import (
    actor_label,
    current_development,
    current_development_id,
    owned,
    require,
    scoped,
)

operations_bp = Blueprint('syndic_operations', __name__)


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


# --- Maintenance queue ------------------------------------------------------

@operations_bp.route('/maintenance/meta', methods=['GET'])
@require('maintenance', 'view')
def maintenance_meta():
    return jsonify({
        'categories': MAINTENANCE_CATEGORIES,
        'priorities': PRIORITIES,
        'statuses': REQUEST_STATUSES,
        'vendors': [
            vendor.to_dict() for vendor in _vendor_query().order_by(Vendor.name).all()
        ],
    })


@operations_bp.route('/maintenance', methods=['GET'])
@require('maintenance', 'view')
def list_requests():
    query = scoped(MaintenanceRequest)

    status = clean_string(request.args.get('status'))
    if status == 'open':
        query = query.filter(MaintenanceRequest.status.notin_(('resolved', 'closed')))
    elif status and status != 'all':
        query = query.filter(MaintenanceRequest.status == status)

    priority = clean_string(request.args.get('priority'))
    if priority and priority != 'all':
        query = query.filter(MaintenanceRequest.priority == priority)

    category = clean_string(request.args.get('category'))
    if category and category != 'all':
        query = query.filter(MaintenanceRequest.category == category)

    requests = query.order_by(MaintenanceRequest.created_at.desc()).all()

    search = clean_string(request.args.get('q'))
    if search:
        term = search.lower()
        requests = [
            row for row in requests
            if term in row.reference.lower()
            or term in (row.title or '').lower()
            or term in ((row.unit.label if row.unit else '') or '').lower()
        ]

    all_open = scoped(MaintenanceRequest).filter(
        MaintenanceRequest.status.notin_(('resolved', 'closed')),
    ).all()

    return jsonify({
        'requests': [_request_row(row) for row in requests],
        'counts': {
            'open': len(all_open),
            'urgent': sum(1 for row in all_open if row.priority in ('urgent', 'emergency')),
            'unassigned': sum(1 for row in all_open if row.vendor_id is None),
            'awaiting_close': scoped(MaintenanceRequest).filter(
                MaintenanceRequest.status == 'resolved',
            ).count(),
        },
    })


def _request_row(row):
    return {
        **row.to_dict(),
        'reported_by_name': row.reported_by.name if row.reported_by else None,
        'message_count': len(row.messages),
    }


@operations_bp.route('/maintenance/<int:request_id>', methods=['GET'])
@require('maintenance', 'view')
def request_detail(request_id):
    row, denied = owned(MaintenanceRequest, request_id)
    if denied:
        return denied
    payload = row.to_dict(include_detail=True)
    # The photo URLs on the model point at the resident blueprint; a manager
    # reads the same bytes through this one.
    for photo in payload.get('photos', []):
        photo['url'] = f'/api/syndic/maintenance/{row.id}/photos/{photo["id"]}'
    return jsonify({'request': payload})


@operations_bp.route('/maintenance/<int:request_id>/photos/<int:photo_id>', methods=['GET'])
@require('maintenance', 'view')
def request_photo(request_id, photo_id):
    row, denied = owned(MaintenanceRequest, request_id)
    if denied:
        return denied

    photo = next((entry for entry in row.photos if entry.id == photo_id), None)
    if photo is None:
        return jsonify({'error': 'Photo not found'}), 404

    try:
        payload = read_bytes(photo.storage_path)
    except (OSError, ValueError):
        return jsonify({'error': 'That photo is no longer available'}), 410

    return payload, 200, {
        'Content-Type': photo.content_type or 'application/octet-stream',
        'Content-Disposition': f'inline; filename="{photo.filename}"',
        'Cache-Control': 'private, max-age=300',
    }


@operations_bp.route('/maintenance', methods=['POST'])
@require('maintenance', 'create')
def create_request():
    """Log a job the office noticed — a common-area fault nobody reported."""
    payload = json_dict(request)
    title = clean_string(payload.get('title'), 200)
    if not title:
        return jsonify({'error': 'Describe the issue in the title'}), 400

    unit_id = as_int(payload.get('unit_id'))
    if unit_id is not None:
        _, denied = owned(Unit, unit_id)
        if denied:
            return jsonify({'error': 'That unit does not belong to this development'}), 404

    row = MaintenanceRequest(
        development_id=current_development_id(),
        unit_id=unit_id,
        reported_by_id=getattr(current_user, 'id', None),
        reference=_next_reference(),
        category=one_of(payload.get('category'), MAINTENANCE_CATEGORY_KEYS, 'other'),
        title=title,
        description=clean_string(payload.get('description')),
        location_label=clean_string(payload.get('location_label'), 120),
        priority=one_of(payload.get('priority'), PRIORITY_KEYS, 'normal'),
        status='open',
    )
    db.session.add(row)
    db.session.flush()
    _append_event(row, 'open', 'Logged by the syndic office')

    record_audit('CREATE', 'MaintenanceRequest', f'{row.reference}: {title}',
                 category='system', user=current_user, development=current_development())
    db.session.commit()
    return jsonify(_request_row(row)), 201


def _next_reference():
    year = _utcnow().year
    prefix = f'MR-{year}'
    latest = db.session.query(db.func.max(MaintenanceRequest.reference)).filter(
        MaintenanceRequest.reference.like(f'{prefix}-%'),
    ).scalar()
    number = 0
    if latest:
        tail = str(latest).rsplit('-', 1)[-1]
        if tail.isdigit():
            number = int(tail)
    return f'{prefix}-{number + 1:04d}'


@operations_bp.route('/maintenance/<int:request_id>', methods=['PUT', 'PATCH'])
@require('maintenance', 'edit')
def update_request(request_id):
    """
    Advance a request: acknowledge, assign, schedule, complete, close.

    A status may only move forward through REQUEST_STATUS_SEQUENCE. Every move
    appends an event and notifies the person who reported it, because a request
    that silently changes state is the single most common complaint about
    maintenance software.
    """
    row, denied = owned(MaintenanceRequest, request_id)
    if denied:
        return denied

    payload = json_dict(request)
    development = current_development()
    notices = []

    if 'vendor_id' in payload:
        vendor_id = as_int(payload.get('vendor_id'))
        if vendor_id is not None:
            vendor = _vendor_query().filter(Vendor.id == vendor_id).first()
            if vendor is None:
                return jsonify({'error': 'That vendor is not available to this development'}), 404
            row.vendor_id = vendor.id
            notices.append(f'Assigned to {vendor.name}')
        else:
            row.vendor_id = None

    for field, length in (('eta_label', 80), ('location_label', 120)):
        if field in payload:
            setattr(row, field, clean_string(payload.get(field), length))
    if 'priority' in payload:
        row.priority = one_of(payload.get('priority'), PRIORITY_KEYS, row.priority)
    if 'scheduled_for' in payload:
        row.scheduled_for = _as_datetime(payload.get('scheduled_for'))

    if 'status' in payload:
        target = one_of(payload.get('status'), list(REQUEST_STATUS_SEQUENCE))
        if target is None:
            return jsonify({'error': 'That status is not recognised'}), 400

        current_step = REQUEST_STATUS_SEQUENCE.get(row.status, 1)
        target_step = REQUEST_STATUS_SEQUENCE[target]
        if target_step <= current_step:
            return jsonify({
                'error': f'This request is already at "{REQUEST_STATUS_LABELS.get(row.status)}". '
                         f'A request moves forward only — log a new one if the fault returns.',
            }), 409
        if target in ('assigned', 'accepted', 'in_progress') and row.vendor_id is None:
            return jsonify({'error': 'Assign a vendor before moving the job to that step'}), 409

        row.status = target
        if target in ('resolved', 'closed'):
            row.closed_at = _utcnow()
        _append_event(row, target, clean_string(payload.get('note'), 255))
        notices.append(REQUEST_STATUS_LABELS.get(target, target))

    if notices and row.reported_by is not None and row.reported_by.status == 'active':
        notify(
            row.reported_by,
            category='maintenance',
            title=f'{row.reference} — {REQUEST_STATUS_LABELS.get(row.status, row.status)}',
            body='; '.join(notices),
            icon_key='wrench',
            link_path=f'/app/report/{row.id}',
            development=development,
            whatsapp_template='maintenance_update',
        )

    record_audit('MODIFY', 'MaintenanceRequest',
                 f'{row.reference}: {"; ".join(notices) or "updated"}',
                 category='system', user=current_user, development=development)
    db.session.commit()
    return jsonify(_request_row(row))


def _append_event(row, status_key, detail=None):
    sequence = REQUEST_STATUS_SEQUENCE.get(status_key, len(row.events) + 1)
    db.session.add(MaintenanceEvent(
        request_id=row.id,
        sequence=sequence,
        status_key=status_key,
        label=REQUEST_STATUS_LABELS.get(status_key),
        detail=detail,
        actor_label=actor_label(),
        occurred_at=_utcnow(),
    ))


@operations_bp.route('/maintenance/<int:request_id>/messages', methods=['POST'])
@require('maintenance', 'edit')
def reply(request_id):
    row, denied = owned(MaintenanceRequest, request_id)
    if denied:
        return denied

    body = clean_string(json_dict(request).get('body'))
    if not body:
        return jsonify({'error': 'Write a message first'}), 400

    message = MaintenanceMessage(
        request_id=row.id,
        author_id=getattr(current_user, 'id', None),
        author_label=actor_label(),
        author_role='syndic',
        body=body,
    )
    db.session.add(message)

    if row.reported_by is not None and row.reported_by.status == 'active':
        notify(
            row.reported_by,
            category='maintenance',
            title=f'Reply on {row.reference}',
            body=body[:160],
            icon_key='message-square',
            link_path=f'/app/report/{row.id}',
            development=current_development(),
        )

    db.session.commit()
    return jsonify(message.to_dict()), 201


def _as_datetime(value):
    text = clean_string(value)
    if not text:
        return None
    for fmt in ('%Y-%m-%dT%H:%M', '%Y-%m-%d %H:%M', '%Y-%m-%d'):
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    return None


@operations_bp.route('/maintenance/export', methods=['GET'])
@require('maintenance', 'export')
def export_requests():
    rows = ['Reference,Raised,Unit,Category,Priority,Status,Vendor,Title,Closed']
    for row in scoped(MaintenanceRequest).order_by(MaintenanceRequest.created_at.desc()).all():
        rows.append(','.join([
            _csv(row.reference),
            row.created_at.strftime('%Y-%m-%d') if row.created_at else '',
            _csv(row.unit.label if row.unit else 'Common area'),
            _csv(row.category_label),
            _csv(row.priority),
            _csv(row.status_label),
            _csv(row.vendor.name if row.vendor else ''),
            _csv(row.title),
            row.closed_at.strftime('%Y-%m-%d') if row.closed_at else '',
        ]))

    development = current_development()
    return '\n'.join(rows), 200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': f'attachment; filename="{development.code}-maintenance.csv"',
    }


# --- Vendors ----------------------------------------------------------------

def _vendor_query():
    """
    Vendors this development may use.

    A vendor row with a NULL development_id is a platform-wide contractor
    available to every client; one with an id belongs to a single development.
    Both are visible here, and only the second is editable.
    """
    return Vendor.query.filter(
        db.or_(Vendor.development_id == current_development_id(),
               Vendor.development_id.is_(None)),
    )


@operations_bp.route('/vendors', methods=['GET'])
@require('vendors', 'view')
def list_vendors():
    vendors = _vendor_query().order_by(Vendor.name).all()
    development_id = current_development_id()
    open_jobs = dict(
        db.session.query(MaintenanceRequest.vendor_id, db.func.count(MaintenanceRequest.id))
        .filter(
            MaintenanceRequest.development_id == development_id,
            MaintenanceRequest.status.notin_(('resolved', 'closed')),
        )
        .group_by(MaintenanceRequest.vendor_id)
        .all()
    )
    return jsonify({
        'vendors': [
            {
                **vendor.to_dict(),
                'contact_email': vendor.contact_email,
                'is_shared': vendor.development_id is None,
                'open_jobs': open_jobs.get(vendor.id, 0),
            }
            for vendor in vendors
        ],
    })


@operations_bp.route('/vendors', methods=['POST'])
@require('vendors', 'create')
def create_vendor():
    payload = json_dict(request)
    name = clean_string(payload.get('name'), 150)
    if not name:
        return jsonify({'error': 'A vendor name is required'}), 400

    vendor = Vendor(
        development_id=current_development_id(),
        name=name,
        trade=clean_string(payload.get('trade'), 80),
        contact_name=clean_string(payload.get('contact_name'), 120),
        contact_phone=clean_string(payload.get('contact_phone'), 50),
        contact_email=clean_email(payload.get('contact_email')),
        status='active',
    )
    db.session.add(vendor)
    record_audit('CREATE', 'Vendor', f'{name} added to the vendor list', category='config',
                 user=current_user, development=current_development())
    db.session.commit()
    return jsonify(vendor.to_dict()), 201


@operations_bp.route('/vendors/<int:vendor_id>', methods=['PUT', 'PATCH'])
@require('vendors', 'edit')
def update_vendor(vendor_id):
    vendor, error = _own_vendor(vendor_id)
    if error:
        return error

    payload = json_dict(request)
    for field, length in (('name', 150), ('trade', 80), ('contact_name', 120), ('contact_phone', 50)):
        if field in payload:
            value = clean_string(payload.get(field), length)
            if field == 'name' and not value:
                return jsonify({'error': 'A vendor name is required'}), 400
            setattr(vendor, field, value)
    if 'contact_email' in payload:
        vendor.contact_email = clean_email(payload.get('contact_email'))
    if 'status' in payload:
        vendor.status = one_of(payload.get('status'), ['active', 'suspended'], vendor.status)

    db.session.commit()
    return jsonify(vendor.to_dict())


@operations_bp.route('/vendors/<int:vendor_id>', methods=['DELETE'])
@require('vendors', 'delete')
def delete_vendor(vendor_id):
    vendor, error = _own_vendor(vendor_id)
    if error:
        return error

    assigned = MaintenanceRequest.query.filter(MaintenanceRequest.vendor_id == vendor.id).count()
    if assigned:
        return jsonify({
            'error': f'{vendor.name} is on {assigned} job(s). Suspend the vendor instead '
                     f'so that work history stays attributable.',
        }), 409

    name = vendor.name
    db.session.delete(vendor)
    record_audit('DELETE', 'Vendor', f'{name} removed from the vendor list', category='config',
                 user=current_user, development=current_development())
    db.session.commit()
    return jsonify({'ok': True})


def _own_vendor(vendor_id):
    """A vendor this development may edit — never a platform-wide one."""
    vendor = db.session.get(Vendor, vendor_id)
    if vendor is None:
        return None, (jsonify({'error': 'Vendor not found'}), 404)
    if vendor.development_id is None:
        return None, (jsonify({
            'error': 'This is a platform-wide contractor. Ask the platform operator to change it.',
        }), 403)
    if vendor.development_id != current_development_id():
        return None, (jsonify({'error': 'Vendor not found'}), 404)
    return vendor, None


def _csv(value):
    text = str(value or '')
    if any(character in text for character in ',"\n'):
        return '"' + text.replace('"', '""') + '"'
    return text
