"""
Syndic dashboard — what a manager needs to see before doing anything else.

Deliberately a different shape from the platform overview one layer up. The
operator's dashboard answers "how is the portfolio doing"; this one answers
"what is wrong in my building this morning": money owed, work outstanding,
decisions pending. Every figure is derived from the source tables rather than
cached, so nothing here can disagree with the screen it links to.
"""
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from flask import Blueprint, jsonify

from ...extensions import db
from ...models import (
    Announcement,
    DevelopmentFund,
    FacilityBooking,
    Invoice,
    MaintenanceRequest,
    Meeting,
    Payment,
    Unit,
    User,
    VisitorPass,
)
from ...models.billing_run import BillingRun
from ._access import current_development, current_development_id, require, scoped

overview_bp = Blueprint('syndic_overview', __name__)

ZERO = Decimal('0.00')


def _money(value):
    return float(Decimal(str(value or 0)).quantize(Decimal('0.01')))


@overview_bp.route('', methods=['GET'])
@require('overview', 'view')
def overview():
    development = current_development()
    development_id = current_development_id()
    today = date.today()
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    units = Unit.query.filter(Unit.development_id == development_id).all()
    total_shares = sum(unit.share_value or 0 for unit in units)

    invoices = Invoice.query.filter(
        Invoice.development_id == development_id,
        Invoice.status != 'cancelled',
    ).all()

    billed = sum((Decimal(str(invoice.total_amount or 0)) for invoice in invoices), ZERO)
    outstanding = sum((invoice.balance for invoice in invoices if not invoice.is_settled), ZERO)
    overdue_invoices = [invoice for invoice in invoices if invoice.is_overdue]
    overdue = sum((invoice.balance for invoice in overdue_invoices), ZERO)

    # Collection rate is the share of what was billed that has actually landed.
    # It is the single number a committee asks for first.
    collected = billed - outstanding
    collection_rate = round(float(collected / billed * 100), 1) if billed else 0.0

    requests = MaintenanceRequest.query.filter(
        MaintenanceRequest.development_id == development_id,
    ).all()
    open_requests = [request for request in requests if request.is_open]
    urgent_requests = [
        request for request in open_requests
        if request.priority in ('urgent', 'emergency')
    ]

    month_start = date(today.year, today.month, 1)
    collected_this_month = _money(
        db.session.query(db.func.sum(Payment.amount)).filter(
            Payment.development_id == development_id,
            Payment.status == 'confirmed',
            Payment.paid_at >= datetime(month_start.year, month_start.month, 1),
        ).scalar()
    )

    occupied_units = db.session.query(db.func.count(db.distinct(Unit.id))).join(
        Unit.ownerships,
    ).filter(Unit.development_id == development_id).scalar() or 0

    return jsonify({
        'development': {
            'id': development.id,
            'name': development.name,
            'code': development.code,
            'location': development.location,
            'status': development.status,
        },
        'kpis': {
            'units': len(units),
            'total_shares': total_shares,
            'co_owner_accounts': User.query.filter(
                User.development_id == development_id,
                User.role == 'co_owner',
                User.status == 'active',
            ).count(),
            'units_with_owner': int(occupied_units),
            'outstanding': _money(outstanding),
            'overdue': _money(overdue),
            'overdue_units': len({invoice.unit_id for invoice in overdue_invoices}),
            'collected_this_month': collected_this_month,
            'collection_rate': collection_rate,
            'open_requests': len(open_requests),
            'urgent_requests': len(urgent_requests),
        },
        'arrears_top': _arrears_top(development_id, limit=5),
        'recent_requests': [
            request.to_dict()
            for request in sorted(open_requests, key=lambda r: r.created_at or now, reverse=True)[:5]
        ],
        'funds': [
            fund.to_dict()
            for fund in DevelopmentFund.query.filter(
                DevelopmentFund.development_id == development_id,
            ).all()
        ],
        'upcoming_meetings': [
            meeting.to_dict()
            for meeting in scoped(Meeting)
            .filter(Meeting.scheduled_for >= now, Meeting.status != 'cancelled')
            .order_by(Meeting.scheduled_for.asc())
            .limit(3)
            .all()
        ],
        'recent_announcements': [
            announcement.to_dict()
            for announcement in scoped(Announcement)
            .order_by(Announcement.published_at.desc())
            .limit(3)
            .all()
        ],
        'last_billing_run': _last_run(development_id),
        'today': {
            'bookings': scoped(FacilityBooking).filter(
                FacilityBooking.booking_date == today,
                FacilityBooking.status == 'confirmed',
            ).count(),
            'visitors': scoped(VisitorPass).filter(
                VisitorPass.expected_at >= datetime(today.year, today.month, today.day),
                VisitorPass.expected_at < datetime(today.year, today.month, today.day) + timedelta(days=1),
                VisitorPass.status.in_(('pending', 'active')),
            ).count(),
        },
    })


def _arrears_top(development_id, limit=5):
    """The units owing most, which is where a manager starts chasing."""
    invoices = Invoice.query.filter(
        Invoice.development_id == development_id,
        Invoice.status.notin_(('cancelled',)),
    ).all()

    by_unit = {}
    for invoice in invoices:
        if invoice.is_settled:
            continue
        entry = by_unit.setdefault(invoice.unit_id, {
            'unit_id': invoice.unit_id,
            'unit_label': invoice.unit.label if invoice.unit else None,
            'balance': ZERO,
            'overdue': ZERO,
            'oldest_due': None,
        })
        entry['balance'] += invoice.balance
        if invoice.is_overdue:
            entry['overdue'] += invoice.balance
            if entry['oldest_due'] is None or invoice.due_date < entry['oldest_due']:
                entry['oldest_due'] = invoice.due_date

    rows = sorted(by_unit.values(), key=lambda row: row['balance'], reverse=True)[:limit]
    today = date.today()
    return [
        {
            'unit_id': row['unit_id'],
            'unit_label': row['unit_label'],
            'balance': _money(row['balance']),
            'overdue': _money(row['overdue']),
            'days_overdue': (today - row['oldest_due']).days if row['oldest_due'] else 0,
            'owners': _owner_names(row['unit_id']),
        }
        for row in rows
    ]


def _owner_names(unit_id):
    unit = db.session.get(Unit, unit_id)
    if unit is None:
        return []
    return [
        ownership.user.name
        for ownership in unit.ownerships
        if ownership.is_current and ownership.user is not None
    ]


def _last_run(development_id):
    run = BillingRun.query.filter(
        BillingRun.development_id == development_id,
        BillingRun.status == 'issued',
    ).order_by(BillingRun.period_month.desc()).first()
    return run.to_dict() if run else None
