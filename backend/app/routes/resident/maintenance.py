"""
Maintenance — report an issue, follow it, talk to the vendor.

The one write path a co-owner reaches without touching money or a vote, so it
is also the busiest: a burst pipe reported late is how a small problem becomes
an expensive one.

A request accepts photos on creation as multipart, or JSON with photos added
afterwards. Images are validated by MIME type and size in services/storage and
stored outside the database; they are served back only through this blueprint,
because a photo of a bathroom is not public content.
"""
from datetime import date, datetime, timezone

from flask import Blueprint, Response, jsonify, request
from flask_login import current_user

from ...extensions import db
from ...models.maintenance import (
    MAINTENANCE_CATEGORIES,
    MAINTENANCE_CATEGORY_KEYS,
    PRIORITIES,
    PRIORITY_KEYS,
    REQUEST_STATUSES,
    MaintenanceMessage,
    MaintenancePhoto,
    MaintenanceRequest,
)
from ...models.property import Facility, ParkingBay
from ...services import storage
from ...services.ledger import next_reference
from ...services.notifications import notify
from ...utils.validation import clean_string, json_dict, one_of
from ._access import feature_required, require_unit

maintenance_bp = Blueprint('resident_maintenance', __name__)

# The five chips on the list screen, and the request statuses each covers.
FILTER_GROUPS = [
    {'key': 'open', 'label': 'Open', 'statuses': ['open', 'acknowledged']},
    {'key': 'assigned', 'label': 'Assigned', 'statuses': ['assigned', 'accepted']},
    {'key': 'in_progress', 'label': 'In Progress', 'statuses': ['in_progress']},
    {'key': 'resolved', 'label': 'Resolved', 'statuses': ['resolved']},
    {'key': 'closed', 'label': 'Closed', 'statuses': ['closed']},
]
FILTER_KEYS = [group['key'] for group in FILTER_GROUPS] + ['all']

MAX_TITLE = 200
MAX_DESCRIPTION = 4000


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


@maintenance_bp.route('/meta', methods=['GET'])
@feature_required('maintenance')
def meta():
    """Everything the report form needs to render its pickers."""
    unit, error = require_unit()
    if error:
        return error

    facilities = Facility.query.filter(
        Facility.development_id == unit.development_id,
        Facility.status == 'active',
    ).order_by(Facility.sort_order).all()

    levels = db.session.query(ParkingBay.level).filter(
        ParkingBay.development_id == unit.development_id,
        ParkingBay.level.isnot(None),
    ).distinct().order_by(ParkingBay.level).all()

    locations = [f'My Unit ({unit.label})', 'Common Area', 'Lobby', 'Corridor', 'Garden', 'Roof']
    locations.extend(f'Parking {row[0]}' for row in levels)
    locations.extend(facility.name for facility in facilities)

    return jsonify({
        'categories': MAINTENANCE_CATEGORIES,
        'priorities': PRIORITIES,
        'locations': locations,
        'statuses': REQUEST_STATUSES,
        'filters': FILTER_GROUPS,
    })


@maintenance_bp.route('', methods=['GET'])
@feature_required('maintenance')
def list_requests():
    unit, error = require_unit()
    if error:
        return error

    scope = MaintenanceRequest.query.filter(
        MaintenanceRequest.reported_by_id == current_user.id
    )

    counts = {}
    for group in FILTER_GROUPS:
        counts[group['key']] = scope.filter(
            MaintenanceRequest.status.in_(group['statuses'])
        ).count()

    requested = one_of(request.args.get('status'), FILTER_KEYS, default='open')
    query = scope
    if requested != 'all':
        statuses = next(g['statuses'] for g in FILTER_GROUPS if g['key'] == requested)
        query = query.filter(MaintenanceRequest.status.in_(statuses))

    rows = query.order_by(MaintenanceRequest.created_at.desc()).all()
    return jsonify({
        'requests': [row.to_dict() for row in rows],
        'counts': counts,
        'filters': FILTER_GROUPS,
        'status': requested,
    })


@maintenance_bp.route('', methods=['POST'])
@feature_required('maintenance')
def create_request():
    unit, error = require_unit()
    if error:
        return error

    source = request.form if request.files or request.form else json_dict(request)
    category = one_of(source.get('category'), MAINTENANCE_CATEGORY_KEYS)
    title = clean_string(source.get('title'), MAX_TITLE)
    description = clean_string(source.get('description'), MAX_DESCRIPTION)
    location = clean_string(source.get('location_label'), 120)
    priority = one_of(source.get('priority'), PRIORITY_KEYS, default='normal')

    if not category:
        return jsonify({'error': 'Choose a category for the issue'}), 400
    if not title:
        return jsonify({'error': 'Give the issue a short title'}), 400
    if not description:
        return jsonify({'error': 'Describe what you have observed'}), 400
    if not location:
        return jsonify({'error': 'Say where the issue is'}), 400

    year = date.today().year
    maintenance_request = MaintenanceRequest(
        development_id=unit.development_id,
        unit_id=unit.id,
        reported_by_id=current_user.id,
        reference=next_reference(MaintenanceRequest, MaintenanceRequest.reference,
                                 f'MR-{year}', width=4),
        category=category,
        title=title,
        description=description,
        location_label=location,
        priority=priority,
        status='open',
    )
    db.session.add(maintenance_request)
    db.session.flush()

    maintenance_request.events.append(_event(maintenance_request, 'open', 1, 'Submitted',
                                             actor=current_user.name))

    photos, photo_error = _store_photos(maintenance_request)
    if photo_error:
        db.session.rollback()
        return jsonify({'error': photo_error}), 400

    notify(
        current_user,
        category='maintenance',
        title='Request submitted',
        body=f'{maintenance_request.reference} — {title}',
        icon_key='wrench',
        link_path=f'/app/report/{maintenance_request.id}',
        development=unit.development,
        whatsapp_template='maintenance_update',
        whatsapp_body=(
            f'Maintenance request {maintenance_request.reference} logged for unit {unit.label}: '
            f'{title}. We will confirm assignment shortly.'
        ),
    )
    db.session.commit()

    return jsonify({
        'request': maintenance_request.to_dict(include_detail=True),
        'photos_saved': len(photos),
    }), 201


@maintenance_bp.route('/<int:request_id>', methods=['GET'])
@feature_required('maintenance')
def request_detail(request_id):
    maintenance_request = _own_request(request_id)
    if maintenance_request is None:
        return jsonify({'error': 'Request not found'}), 404
    return jsonify({'request': maintenance_request.to_dict(include_detail=True)})


@maintenance_bp.route('/<int:request_id>/messages', methods=['POST'])
@feature_required('maintenance')
def add_message(request_id):
    maintenance_request = _own_request(request_id)
    if maintenance_request is None:
        return jsonify({'error': 'Request not found'}), 404

    body = clean_string(json_dict(request).get('body'), 2000)
    if not body:
        return jsonify({'error': 'Write a message first'}), 400

    message = MaintenanceMessage(
        request_id=maintenance_request.id,
        author_id=current_user.id,
        author_label=current_user.name,
        author_role='resident',
        body=body,
    )
    db.session.add(message)
    db.session.commit()

    return jsonify({'message': message.to_dict()}), 201


@maintenance_bp.route('/<int:request_id>/photos', methods=['POST'])
@feature_required('maintenance')
def add_photos(request_id):
    maintenance_request = _own_request(request_id)
    if maintenance_request is None:
        return jsonify({'error': 'Request not found'}), 404

    photos, photo_error = _store_photos(maintenance_request)
    if photo_error:
        db.session.rollback()
        return jsonify({'error': photo_error}), 400

    db.session.commit()
    return jsonify({'photos': [photo.to_dict() for photo in maintenance_request.photos]}), 201


@maintenance_bp.route('/<int:request_id>/photos/<int:photo_id>', methods=['GET'])
@feature_required('maintenance')
def photo_file(request_id, photo_id):
    maintenance_request = _own_request(request_id)
    if maintenance_request is None:
        return jsonify({'error': 'Request not found'}), 404

    photo = next((row for row in maintenance_request.photos if row.id == photo_id), None)
    if photo is None:
        return jsonify({'error': 'Photo not found'}), 404

    try:
        payload = storage.read_bytes(photo.storage_path)
    except (FileNotFoundError, ValueError):
        return jsonify({'error': 'That image is no longer available'}), 404

    return Response(payload, mimetype=photo.content_type or 'application/octet-stream', headers={
        'Cache-Control': 'private, max-age=3600',
        'Content-Disposition': f'inline; filename="{photo.filename}"',
    })


@maintenance_bp.route('/<int:request_id>/rating', methods=['POST'])
@feature_required('maintenance')
def rate_request(request_id):
    maintenance_request = _own_request(request_id)
    if maintenance_request is None:
        return jsonify({'error': 'Request not found'}), 404
    if maintenance_request.status not in ('resolved', 'closed'):
        return jsonify({'error': 'You can rate a request once the work is complete'}), 409

    payload = json_dict(request)
    try:
        rating = int(payload.get('rating'))
    except (TypeError, ValueError):
        rating = 0
    if rating < 1 or rating > 5:
        return jsonify({'error': 'Give a rating between 1 and 5'}), 400

    maintenance_request.rating = rating
    maintenance_request.rating_comment = clean_string(payload.get('comment'), 1000)
    if maintenance_request.status == 'resolved':
        maintenance_request.status = 'closed'
        maintenance_request.closed_at = _utcnow()
        maintenance_request.events.append(
            _event(maintenance_request, 'closed', 7, 'Closed & Rated', actor=current_user.name)
        )

    db.session.commit()
    return jsonify({'request': maintenance_request.to_dict(include_detail=True)})


def _own_request(request_id):
    """Requests are readable only by the resident who raised them."""
    return MaintenanceRequest.query.filter(
        MaintenanceRequest.id == request_id,
        MaintenanceRequest.reported_by_id == current_user.id,
    ).first()


def _event(maintenance_request, status_key, sequence, label, detail=None, actor=None):
    from ...models.maintenance import MaintenanceEvent

    return MaintenanceEvent(
        request_id=maintenance_request.id,
        sequence=sequence,
        status_key=status_key,
        label=label,
        detail=detail,
        actor_label=actor,
        occurred_at=_utcnow(),
    )


def _store_photos(maintenance_request):
    """Save any uploaded images. Returns (saved, error_message)."""
    uploads = [item for item in request.files.getlist('photos') if item and item.filename]
    if not uploads:
        return [], None

    existing = len(maintenance_request.photos)
    if existing + len(uploads) > storage.MAX_PHOTOS_PER_REQUEST:
        return [], f'Up to {storage.MAX_PHOTOS_PER_REQUEST} photos can be attached to a request'

    saved = []
    for upload in uploads:
        try:
            path, filename, content_type, size = storage.save_image(upload, 'maintenance')
        except ValueError as failure:
            return [], str(failure)

        photo = MaintenancePhoto(
            request_id=maintenance_request.id,
            filename=filename,
            storage_path=path,
            content_type=content_type,
            size_bytes=size,
        )
        db.session.add(photo)
        maintenance_request.photos.append(photo)
        saved.append(photo)

    return saved, None
