"""Audit log routes — filtered browsing and CSV export of the append-only trail."""
import csv
import io

from flask import Blueprint, Response, jsonify, request
from flask_login import login_required

from ..models import AuditLog
from ..models.audit import AUDIT_CATEGORIES, AUDIT_CATEGORY_KEYS
from ..permissions import ensure
from ..utils.validation import as_date, as_int, clean_string

audit_bp = Blueprint('audit', __name__)

RETENTION_NOTE = (
    'Append-only log. No UPDATE or DELETE permitted. '
    'Retention: 7 years (financial), 3 years (operational).'
)


def _filtered_query():
    query = AuditLog.query

    category = clean_string(request.args.get('category'))
    if category and category != 'all' and category in AUDIT_CATEGORY_KEYS:
        query = query.filter(AuditLog.category == category)

    development_id = as_int(request.args.get('development_id'))
    if development_id:
        query = query.filter(AuditLog.development_id == development_id)

    date_from = as_date(request.args.get('from'))
    if date_from:
        query = query.filter(AuditLog.occurred_at >= date_from)

    date_to = as_date(request.args.get('to'))
    if date_to:
        query = query.filter(AuditLog.occurred_at <= date_to)

    search = clean_string(request.args.get('q'))
    if search:
        like = f'%{search.lower()}%'
        from ..extensions import db
        query = query.filter(db.or_(
            db.func.lower(AuditLog.detail).like(like),
            db.func.lower(AuditLog.user_label).like(like),
            db.func.lower(AuditLog.entity).like(like),
        ))

    return query.order_by(AuditLog.occurred_at.desc(), AuditLog.id.desc())


@audit_bp.route('/', methods=['GET'])
@login_required
def list_entries():
    denied = ensure('audit', 'view')
    if denied:
        return denied

    limit = as_int(request.args.get('limit'), 100, minimum=1, maximum=500)
    query = _filtered_query()
    entries = query.limit(limit).all()

    category_counts = [{'key': 'all', 'label': 'All', 'count': AuditLog.query.count()}]
    for category in AUDIT_CATEGORIES:
        category_counts.append({
            'key': category['key'],
            'label': category['label'],
            'count': AuditLog.query.filter(AuditLog.category == category['key']).count(),
        })

    return jsonify({
        'entries': [entry.to_dict() for entry in entries],
        'categories': category_counts,
        'total': AuditLog.query.count(),
        'retention_note': RETENTION_NOTE,
    })


@audit_bp.route('/export', methods=['GET'])
@login_required
def export_csv():
    denied = ensure('audit', 'export')
    if denied:
        return denied

    entries = _filtered_query().limit(5000).all()

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(['Timestamp', 'User', 'Property', 'Action', 'Entity', 'Category', 'Detail'])
    for entry in entries:
        writer.writerow([
            entry.occurred_at.isoformat() if entry.occurred_at else '',
            entry.user_label,
            entry.development_label,
            entry.action,
            entry.entity,
            entry.category,
            entry.detail or '',
        ])

    return Response(
        buffer.getvalue(),
        mimetype='text/csv',
        headers={'Content-Disposition': 'attachment; filename=audit-log.csv'},
    )
