"""
Governance — general meetings and share-weighted voting.

Reading a meeting is open to anyone living in the development; casting a vote
is not. A vote belongs to the unit's title, so it is gated on the `voting`
feature (co-owners) and a tenant is never shown how their landlord voted —
`my_vote` is resolved against the unit only for owners.

A cast vote is final. There is no update route, and the unique constraint on
(resolution, unit) is what enforces it rather than a check that races: joint
owners each hold a login to the same unit and can submit simultaneously.
"""
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request
from flask_login import current_user
from sqlalchemy.exc import IntegrityError

from ...extensions import db
from ...models.audit import record_audit
from ...models.governance import VOTE_CHOICES, Meeting, Resolution, Vote
from ...permissions import resident_features
from ...services.notifications import notify
from ...utils.validation import json_dict, one_of
from ._access import feature_required, require_unit, resident_required

governance_bp = Blueprint('resident_governance', __name__)


@governance_bp.route('/meetings', methods=['GET'])
@resident_required
def list_meetings():
    unit, error = require_unit()
    if error:
        return error

    meetings = Meeting.query.filter(
        Meeting.development_id == unit.development_id,
        Meeting.status != 'cancelled',
    ).order_by(Meeting.scheduled_for.desc()).all()

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    return jsonify({
        'upcoming': [m.to_dict() for m in meetings if m.scheduled_for >= now],
        'past': [m.to_dict() for m in meetings if m.scheduled_for < now],
        'can_vote': resident_features(current_user).get('voting', False),
    })


@governance_bp.route('/meetings/<int:meeting_id>', methods=['GET'])
@resident_required
def meeting_detail(meeting_id):
    unit, error = require_unit()
    if error:
        return error

    meeting = Meeting.query.filter(
        Meeting.id == meeting_id,
        Meeting.development_id == unit.development_id,
    ).first()
    if meeting is None:
        return jsonify({'error': 'Meeting not found'}), 404

    can_vote = resident_features(current_user).get('voting', False)
    return jsonify({
        'meeting': meeting.to_dict(include_resolutions=True, unit_id=unit.id if can_vote else None),
        'can_vote': can_vote,
        'my_share_weight': unit.share_value if can_vote else None,
        'total_shares': unit.total_shares,
    })


@governance_bp.route('/resolutions/<int:resolution_id>/vote', methods=['POST'])
@feature_required('voting')
def cast_vote(resolution_id):
    unit, error = require_unit()
    if error:
        return error

    resolution = Resolution.query.filter(Resolution.id == resolution_id).first()
    if resolution is None or resolution.meeting.development_id != unit.development_id:
        return jsonify({'error': 'Resolution not found'}), 404

    meeting = resolution.meeting
    if not meeting.is_voting_open:
        return jsonify({'error': 'Voting on this meeting is not open'}), 409

    choice = one_of(json_dict(request).get('choice'), VOTE_CHOICES)
    if choice is None:
        return jsonify({'error': 'Choose For, Against or Abstain'}), 400

    if Vote.query.filter(Vote.resolution_id == resolution.id, Vote.unit_id == unit.id).first():
        return jsonify({'error': 'A vote has already been cast for this unit'}), 409

    vote = Vote(
        resolution_id=resolution.id,
        unit_id=unit.id,
        user_id=current_user.id,
        choice=choice,
        share_weight=unit.share_value,
    )
    db.session.add(vote)

    notify(
        current_user,
        category='governance',
        title=f'Vote recorded — R{resolution.sequence}',
        body=f'{resolution.title}: {choice.title()} ({unit.share_value:,} shares)',
        icon_key='vote',
        link_path=f'/app/coop/voting?meeting={meeting.id}',
        development=unit.development,
    )
    record_audit(
        'VOTE', 'Resolution',
        f'{current_user.name} voted {choice} on "{resolution.title}" '
        f'for unit {unit.label} carrying {unit.share_value:,} shares',
        category='votes', user=current_user, development=unit.development,
        ip_address=request.remote_addr,
    )

    try:
        db.session.commit()
    except IntegrityError:
        # Two joint owners submitted at once; the constraint decided which won.
        db.session.rollback()
        return jsonify({'error': 'A vote has already been cast for this unit'}), 409

    return jsonify({
        'vote': vote.to_dict(),
        'resolution': resolution.to_dict(unit_id=unit.id),
        'participation': meeting.participation(),
    }), 201
