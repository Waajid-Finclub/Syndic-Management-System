"""
Announcements, facility bookings, visitor passes and the document library.

The counterpart to the resident app's My Co-Op tab. Everything a co-owner reads
there is published from here, and everything they submit there lands here.

Two things are deliberate:

* Publishing an announcement notifies every active co-owner in one call, and an
  urgent one says so in the notification body. A notice nobody is told about is
  a notice nobody reads.
* Documents are stored outside the database and served only through an
  authenticated route. A private folder scoped to a unit is visible to that
  unit's holders and to the syndic office, and to nobody else.
"""
import secrets
from datetime import date, datetime, timedelta, timezone

from flask import Blueprint, jsonify, request
from flask_login import current_user

from ...extensions import db
from ...models import (
    Announcement,
    Document,
    DocumentFolder,
    Facility,
    FacilityBooking,
    Unit,
    User,
    VisitorPass,
)
from ...models.audit import record_audit
from ...models.community import (
    ANNOUNCEMENT_PRIORITIES,
    BOOKING_STATUSES,
    DOCUMENT_FOLDER_CATEGORIES,
    DOCUMENT_FOLDER_CATEGORY_KEYS,
    VISITOR_STATUSES,
)
from ...services.notifications import notify
from ...services.storage import read_bytes, write_bytes
from ...utils.validation import as_bool, as_date, as_int, clean_string, json_dict, one_of
from ._access import (
    actor_label,
    current_development,
    current_development_id,
    owned,
    require,
    scoped,
)

community_bp = Blueprint('syndic_community', __name__)

MAX_DOCUMENT_BYTES = 15 * 1024 * 1024
ALLOWED_DOCUMENT_TYPES = {
    'application/pdf': '.pdf',
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'text/csv': '.csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
}


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


# --- Announcements ----------------------------------------------------------

@community_bp.route('/announcements', methods=['GET'])
@require('community', 'view')
def list_announcements():
    rows = scoped(Announcement).order_by(Announcement.published_at.desc()).all()
    return jsonify({
        'announcements': [row.to_dict() for row in rows],
        'priorities': ANNOUNCEMENT_PRIORITIES,
    })


@community_bp.route('/announcements', methods=['POST'])
@require('community', 'create')
def create_announcement():
    payload = json_dict(request)
    title = clean_string(payload.get('title'), 200)
    if not title:
        return jsonify({'error': 'A notice needs a title'}), 400

    priority = one_of(payload.get('priority'), ANNOUNCEMENT_PRIORITIES, 'info')
    announcement = Announcement(
        development_id=current_development_id(),
        title=title,
        body=clean_string(payload.get('body')),
        priority=priority,
        author_label=actor_label(),
        published_at=_utcnow(),
    )
    db.session.add(announcement)

    if as_bool(payload.get('notify'), True):
        _notify_co_owners(
            title=('Urgent — ' if priority == 'urgent' else '') + title,
            body=(announcement.body or '')[:200],
            template='emergency_alert' if priority == 'urgent' else 'general_notice',
        )
        announcement.whatsapp_sent = True

    record_audit('CREATE', 'Announcement', f'Notice published: {title}', category='whatsapp',
                 user=current_user, development=current_development())
    db.session.commit()
    return jsonify(announcement.to_dict()), 201


@community_bp.route('/announcements/<int:announcement_id>', methods=['PUT', 'PATCH'])
@require('community', 'edit')
def update_announcement(announcement_id):
    announcement, denied = owned(Announcement, announcement_id)
    if denied:
        return denied

    payload = json_dict(request)
    if 'title' in payload:
        title = clean_string(payload.get('title'), 200)
        if not title:
            return jsonify({'error': 'A notice needs a title'}), 400
        announcement.title = title
    if 'body' in payload:
        announcement.body = clean_string(payload.get('body'))
    if 'priority' in payload:
        announcement.priority = one_of(payload.get('priority'), ANNOUNCEMENT_PRIORITIES,
                                       announcement.priority)

    db.session.commit()
    return jsonify(announcement.to_dict())


@community_bp.route('/announcements/<int:announcement_id>', methods=['DELETE'])
@require('community', 'delete')
def delete_announcement(announcement_id):
    announcement, denied = owned(Announcement, announcement_id)
    if denied:
        return denied
    title = announcement.title
    db.session.delete(announcement)
    record_audit('DELETE', 'Announcement', f'Notice removed: {title}', category='whatsapp',
                 user=current_user, development=current_development())
    db.session.commit()
    return jsonify({'ok': True})


def _notify_co_owners(title, body, template=None, link_path='/app/coop'):
    development = current_development()
    accounts = User.query.filter(
        User.development_id == development.id,
        User.role == 'co_owner',
        User.status == 'active',
    ).all()
    for account in accounts:
        notify(
            account,
            category='community',
            title=title,
            body=body,
            icon_key='megaphone',
            link_path=link_path,
            development=development,
            whatsapp_template=template,
        )
    return len(accounts)


# --- Facility bookings ------------------------------------------------------

@community_bp.route('/bookings', methods=['GET'])
@require('community', 'view')
def list_bookings():
    query = scoped(FacilityBooking)

    from_date = as_date(request.args.get('from')) or date.today() - timedelta(days=7)
    query = query.filter(FacilityBooking.booking_date >= from_date)

    facility_id = as_int(request.args.get('facility_id'))
    if facility_id:
        query = query.filter(FacilityBooking.facility_id == facility_id)

    bookings = query.order_by(
        FacilityBooking.booking_date.asc(), FacilityBooking.slot_start.asc(),
    ).all()

    return jsonify({
        'bookings': [
            {
                **booking.to_dict(),
                'booked_by': booking.user.name if booking.user else None,
            }
            for booking in bookings
        ],
        'facilities': [
            facility.to_dict() for facility in scoped(Facility)
            .order_by(Facility.sort_order, Facility.name).all()
        ],
        'statuses': BOOKING_STATUSES,
    })


@community_bp.route('/bookings/<int:booking_id>', methods=['PUT', 'PATCH'])
@require('community', 'edit')
def update_booking(booking_id):
    """Confirm, complete or cancel a booking the co-owner made."""
    booking, denied = owned(FacilityBooking, booking_id)
    if denied:
        return denied

    payload = json_dict(request)
    status = one_of(payload.get('status'), BOOKING_STATUSES)
    if status is None:
        return jsonify({'error': 'That booking status is not recognised'}), 400

    previous = booking.status
    booking.status = status
    if 'notes' in payload:
        booking.notes = clean_string(payload.get('notes'), 255)

    if status != previous and booking.user is not None and booking.user.status == 'active':
        notify(
            booking.user,
            category='community',
            title=f'{booking.facility.name if booking.facility else "Booking"} — {status}',
            body=f'{booking.booking_date.strftime("%d %b %Y")} at {booking.slot_label}.',
            icon_key='calendar',
            link_path='/app/coop/facilities',
            development=current_development(),
            whatsapp_template='facility_booking',
        )

    db.session.commit()
    return jsonify(booking.to_dict())


# --- Visitor passes ---------------------------------------------------------

@community_bp.route('/visitors', methods=['GET'])
@require('community', 'view')
def list_visitors():
    """
    Today's gate list, plus what is expected.

    Access codes are included: this is the screen the gate reads from, and the
    whole point of a pass is that the person on the gate can verify it.
    """
    from_moment = datetime.combine(
        as_date(request.args.get('from')) or date.today(), datetime.min.time(),
    )
    passes = scoped(VisitorPass).filter(
        VisitorPass.expected_at >= from_moment,
    ).order_by(VisitorPass.expected_at.asc()).all()

    return jsonify({
        'visitors': [
            {
                **visitor.to_dict(),
                'host': visitor.unit.label if visitor.unit else None,
            }
            for visitor in passes
        ],
        'statuses': VISITOR_STATUSES,
    })


@community_bp.route('/visitors/<int:visitor_id>', methods=['PUT', 'PATCH'])
@require('community', 'edit')
def update_visitor(visitor_id):
    """Mark a pass used at the gate, or cancel one."""
    visitor, denied = owned(VisitorPass, visitor_id)
    if denied:
        return denied

    status = one_of(json_dict(request).get('status'), VISITOR_STATUSES)
    if status is None:
        return jsonify({'error': 'That visitor status is not recognised'}), 400

    visitor.status = status
    record_audit('MODIFY', 'VisitorPass',
                 f'Pass {visitor.access_code} for {visitor.visitor_name} set to {status}',
                 category='system', user=current_user, development=current_development())
    db.session.commit()
    return jsonify(visitor.to_dict())


# --- Documents --------------------------------------------------------------

@community_bp.route('/documents', methods=['GET'])
@require('documents', 'view')
def list_documents():
    folders = scoped(DocumentFolder).order_by(DocumentFolder.sort_order, DocumentFolder.name).all()
    return jsonify({
        'folders': [
            {
                **folder.to_dict(),
                'documents': [_document_row(document) for document in folder.documents],
            }
            for folder in folders
        ],
        'categories': DOCUMENT_FOLDER_CATEGORIES,
        'units': [
            {'id': unit.id, 'label': unit.label}
            for unit in scoped(Unit).order_by(Unit.label).all()
        ],
        'max_bytes': MAX_DOCUMENT_BYTES,
        'allowed_types': sorted(ALLOWED_DOCUMENT_TYPES),
    })


def _document_row(document):
    return {
        **document.to_dict(),
        'unit_id': document.unit_id,
        'unit_label': document.unit.label if getattr(document, 'unit', None) else None,
        'url': f'/api/syndic/documents/{document.id}/file',
    }


@community_bp.route('/documents/folders', methods=['POST'])
@require('documents', 'create')
def create_folder():
    payload = json_dict(request)
    name = clean_string(payload.get('name'), 120)
    if not name:
        return jsonify({'error': 'A folder name is required'}), 400

    folder = DocumentFolder(
        development_id=current_development_id(),
        name=name,
        category=one_of(payload.get('category'), DOCUMENT_FOLDER_CATEGORY_KEYS, 'rules'),
        is_private=as_bool(payload.get('is_private'), False),
        sort_order=as_int(payload.get('sort_order'), 0, minimum=0),
    )
    db.session.add(folder)
    db.session.commit()
    return jsonify(folder.to_dict()), 201


@community_bp.route('/documents/folders/<int:folder_id>', methods=['DELETE'])
@require('documents', 'delete')
def delete_folder(folder_id):
    folder, denied = owned(DocumentFolder, folder_id)
    if denied:
        return denied
    if folder.documents:
        return jsonify({'error': 'Remove the documents in this folder first'}), 409
    db.session.delete(folder)
    db.session.commit()
    return jsonify({'ok': True})


@community_bp.route('/documents', methods=['POST'])
@require('documents', 'create')
def upload_document():
    """
    Store one document against a folder, optionally scoped to a single unit.

    A unit-scoped document is a co-owner's own paperwork — a title deed, a
    settlement letter — and is filtered out of every other resident's library
    by the resident API. That filter is the reason the field exists.
    """
    folder_id = as_int(request.form.get('folder_id'))
    folder, denied = owned(DocumentFolder, folder_id)
    if denied:
        return jsonify({'error': 'Choose a folder in this development'}), 404

    upload = request.files.get('file')
    if upload is None:
        return jsonify({'error': 'Attach a file'}), 400

    content_type = (upload.mimetype or '').lower()
    extension = ALLOWED_DOCUMENT_TYPES.get(content_type)
    if extension is None:
        return jsonify({
            'error': 'Upload a PDF, image, CSV, Word or Excel file',
        }), 415

    payload = upload.read()
    if not payload:
        return jsonify({'error': 'That file is empty'}), 400
    if len(payload) > MAX_DOCUMENT_BYTES:
        return jsonify({'error': 'Documents must be 15 MB or smaller'}), 413

    unit_id = as_int(request.form.get('unit_id'))
    if unit_id is not None:
        _, unit_denied = owned(Unit, unit_id)
        if unit_denied:
            return jsonify({'error': 'That unit does not belong to this development'}), 404

    stored_name = f'{secrets.token_hex(16)}{extension}'
    storage_path = write_bytes('documents', stored_name, payload)

    document = Document(
        folder_id=folder.id,
        development_id=current_development_id(),
        unit_id=unit_id,
        title=clean_string(request.form.get('title'), 200) or upload.filename,
        filename=(upload.filename or stored_name)[:255],
        storage_path=storage_path,
        content_type=content_type,
        size_bytes=len(payload),
        version_label=clean_string(request.form.get('version_label'), 40),
    )
    db.session.add(document)
    record_audit('CREATE', 'Document', f'{document.title} uploaded to {folder.name}',
                 category='config', user=current_user, development=current_development())
    db.session.commit()

    return jsonify(_document_row(document)), 201


@community_bp.route('/documents/<int:document_id>/file', methods=['GET'])
@require('documents', 'view')
def download_document(document_id):
    document, denied = owned(Document, document_id)
    if denied:
        return denied

    try:
        payload = read_bytes(document.storage_path)
    except (OSError, ValueError):
        return jsonify({'error': 'That file is no longer available'}), 410

    return payload, 200, {
        'Content-Type': document.content_type or 'application/octet-stream',
        'Content-Disposition': f'inline; filename="{document.filename}"',
        'Cache-Control': 'private, max-age=300',
    }


@community_bp.route('/documents/<int:document_id>', methods=['DELETE'])
@require('documents', 'delete')
def delete_document(document_id):
    document, denied = owned(Document, document_id)
    if denied:
        return denied
    title = document.title
    db.session.delete(document)
    record_audit('DELETE', 'Document', f'{title} removed', category='config',
                 user=current_user, development=current_development())
    db.session.commit()
    return jsonify({'ok': True})
