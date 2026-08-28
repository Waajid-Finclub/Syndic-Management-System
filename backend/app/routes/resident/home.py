"""
Home dashboard — one request, everything the landing screen draws.

The screen shows six unrelated things (balance, KPIs, assets, activity), and on
a phone over a Mauritian mobile connection six round trips is the difference
between instant and sluggish. So this is a single composed endpoint rather than
a REST-pure fan-out, and it is the only place in the resident API that behaves
that way — every other screen maps to its own resource.

Tenants get the same shape with the finance block omitted rather than zeroed,
so the client renders an honest screen instead of a bill of Rs 0.00 that is not
theirs to see.
"""
from datetime import datetime, timezone

from flask import Blueprint, jsonify
from flask_login import current_user

from ...extensions import db
from ...models.billing import DevelopmentFund
from ...models.community import Announcement
from ...models.governance import Meeting, Resolution, Vote
from ...models.maintenance import MaintenanceRequest
from ...models.property import Facility, ParkingBay, StorageUnit
from ...models.resident import Notification
from ...permissions import resident_features
from ...services.ledger import account_summary
from ...services.notifications import unread_count
from ._access import require_unit, resident_required, unit_payload

home_bp = Blueprint('resident_home', __name__)

RECENT_ACTIVITY_LIMIT = 8


@home_bp.route('', methods=['GET'])
@resident_required
def dashboard():
    unit, error = require_unit()
    if error:
        return error

    features = resident_features(current_user)
    development = unit.development
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    payload = {
        'unit': unit_payload(unit),
        'features': features,
        'unread_notifications': unread_count(current_user),
        'assets': _assets(unit),
        'facilities': [
            facility.to_dict(moment=now)
            for facility in Facility.query.filter(
                Facility.development_id == unit.development_id,
                Facility.status == 'active',
            ).order_by(Facility.sort_order).all()
        ],
        'activity': [
            notification.to_dict()
            for notification in Notification.query.filter(
                Notification.user_id == current_user.id
            ).order_by(Notification.created_at.desc()).limit(RECENT_ACTIVITY_LIMIT).all()
        ],
        'latest_announcement': _latest_announcement(unit.development_id),
    }

    if features.get('finance'):
        payload['account'] = account_summary(unit.id)

    payload['kpis'] = _kpis(unit, features)
    return jsonify(payload)


def _assets(unit):
    """Parking, EV and storage allocated to this unit."""
    bays = ParkingBay.query.filter(ParkingBay.unit_id == unit.id).order_by(ParkingBay.code).all()
    stores = StorageUnit.query.filter(StorageUnit.unit_id == unit.id).order_by(StorageUnit.code).all()
    return {
        'parking': [bay.to_dict() for bay in bays if not bay.is_ev],
        'ev_bays': [bay.to_dict() for bay in bays if bay.is_ev],
        'storage': [store.to_dict() for store in stores],
    }


def _latest_announcement(development_id):
    announcement = Announcement.query.filter(
        Announcement.development_id == development_id
    ).order_by(Announcement.published_at.desc()).first()
    return announcement.to_dict() if announcement else None


def _kpis(unit, features):
    """The four tiles on the home screen."""
    tiles = {}

    if features.get('finance'):
        fund = DevelopmentFund.query.filter(
            DevelopmentFund.development_id == unit.development_id,
            DevelopmentFund.fund_type == 'reserve',
        ).first()
        tiles['reserve_fund'] = fund.to_dict() if fund else None

    tiles['open_requests'] = MaintenanceRequest.query.filter(
        MaintenanceRequest.reported_by_id == current_user.id,
        MaintenanceRequest.status.notin_(('resolved', 'closed')),
    ).count()

    next_meeting = Meeting.query.filter(
        Meeting.development_id == unit.development_id,
        Meeting.status.in_(('scheduled', 'voting_open')),
    ).order_by(Meeting.scheduled_for.asc()).first()
    tiles['next_meeting'] = next_meeting.to_dict() if next_meeting else None

    if features.get('voting'):
        tiles['open_votes'] = _open_vote_count(unit)

    return tiles


def _open_vote_count(unit):
    """Resolutions still open that this unit has not voted on."""
    open_meetings = [
        meeting.id
        for meeting in Meeting.query.filter(
            Meeting.development_id == unit.development_id,
            Meeting.status == 'voting_open',
        ).all()
        if meeting.is_voting_open
    ]
    if not open_meetings:
        return 0

    already_voted = db.session.query(Vote.resolution_id).filter(Vote.unit_id == unit.id)
    return Resolution.query.filter(
        Resolution.meeting_id.in_(open_meetings),
        Resolution.id.notin_(already_voted),
    ).count()
