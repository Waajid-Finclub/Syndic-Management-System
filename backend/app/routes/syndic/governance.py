"""
Meetings, resolutions and share-weighted voting.

The rules Mauritian co-ownership law imposes are enforced here rather than left
to the manager's judgement:

* A vote is weighted by the shares attached to the unit, not by heads. The
  tally is therefore in shares out of the development's total, and a result is
  only meaningful against that denominator.
* Different resolutions need different majorities — simple (Art. 24), absolute
  (Art. 25), unanimous (Art. 26). The threshold is stored on the resolution and
  applied when the meeting closes, so nobody has to remember which article
  applied a year later.
* One vote per unit per resolution, enforced by a unique constraint, because
  joint owners each hold a login to the same unit.

Closing a meeting is the only place an outcome is written. Until then a tally is
a running count, and the screen says so.
"""
from datetime import datetime, timezone
from decimal import Decimal

from flask import Blueprint, jsonify, request
from flask_login import current_user

from ...extensions import db
from ...models import Meeting, Resolution, Unit, User, Vote
from ...models.audit import record_audit
from ...models.governance import (
    MAJORITY_TYPE_KEYS,
    MAJORITY_TYPES,
    MEETING_STATUSES,
    MEETING_TYPE_KEYS,
    MEETING_TYPES,
)
from ...services.notifications import notify
from ...utils.validation import as_int, clean_string, json_dict, one_of
from ._access import (
    current_development,
    current_development_id,
    owned,
    require,
    scoped,
)

governance_bp = Blueprint('syndic_governance', __name__)

MAJORITY_THRESHOLDS = {
    # Share of *votes cast* that must be in favour.
    'simple': Decimal('50'),
    # Share of *all shares in the development* that must be in favour.
    'absolute': Decimal('50'),
    'unanimous': Decimal('100'),
}
ARTICLE_REFS = {entry['key']: entry['article'] for entry in MAJORITY_TYPES}


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


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


def _total_shares():
    return int(db.session.query(db.func.sum(Unit.share_value)).filter(
        Unit.development_id == current_development_id(),
    ).scalar() or 0)


# --- Meetings ---------------------------------------------------------------

@governance_bp.route('/meta', methods=['GET'])
@require('governance', 'view')
def meta():
    return jsonify({
        'meeting_types': MEETING_TYPES,
        'meeting_statuses': MEETING_STATUSES,
        'majority_types': MAJORITY_TYPES,
        'total_shares': _total_shares(),
    })


@governance_bp.route('/meetings', methods=['GET'])
@require('governance', 'view')
def list_meetings():
    meetings = scoped(Meeting).order_by(Meeting.scheduled_for.desc()).all()
    return jsonify({
        'meetings': [meeting.to_dict() for meeting in meetings],
        'total_shares': _total_shares(),
    })


@governance_bp.route('/meetings/<int:meeting_id>', methods=['GET'])
@require('governance', 'view')
def meeting_detail(meeting_id):
    meeting, denied = owned(Meeting, meeting_id)
    if denied:
        return denied

    total_shares = _total_shares()
    return jsonify({
        'meeting': meeting.to_dict(include_resolutions=True),
        'total_shares': total_shares,
        'resolutions': [_resolution_row(resolution, total_shares) for resolution in meeting.resolutions],
        'non_voters': _non_voters(meeting),
    })


def _resolution_row(resolution, total_shares):
    """A resolution with its tally expressed against both denominators."""
    tally = resolution.tally()
    cast = sum(tally.values())
    threshold = MAJORITY_THRESHOLDS[resolution.majority_type]

    if resolution.majority_type == 'absolute':
        denominator = total_shares
        basis = 'all shares in the development'
    elif resolution.majority_type == 'unanimous':
        denominator = cast
        basis = 'every vote cast'
    else:
        denominator = cast
        basis = 'votes cast'

    in_favour_pct = round(float(Decimal(tally['for']) / Decimal(denominator) * 100), 1) if denominator else 0.0

    return {
        **resolution.to_dict(),
        'tally': tally,
        'shares_cast': cast,
        'total_shares': total_shares,
        'turnout_percent': round(cast / total_shares * 100, 1) if total_shares else 0.0,
        'threshold_percent': float(threshold),
        'threshold_basis': basis,
        'in_favour_percent': in_favour_pct,
        'would_pass': in_favour_pct > float(threshold)
        if resolution.majority_type != 'unanimous'
        else (cast > 0 and tally['against'] == 0 and tally['abstain'] == 0),
        'article_ref': resolution.article_ref or ARTICLE_REFS.get(resolution.majority_type),
    }


def _non_voters(meeting):
    """Units that have not voted on anything — who the office chases before close."""
    resolution_ids = [resolution.id for resolution in meeting.resolutions]
    if not resolution_ids:
        return []
    voted = {
        row[0] for row in db.session.query(Vote.unit_id)
        .filter(Vote.resolution_id.in_(resolution_ids)).distinct().all()
    }
    return [
        {
            'unit_id': unit.id,
            'unit_label': unit.label,
            'share_value': unit.share_value,
            'owners': [
                ownership.user.name
                for ownership in unit.ownerships
                if ownership.is_current and ownership.user
            ],
        }
        for unit in scoped(Unit).order_by(Unit.label).all()
        if unit.id not in voted and unit.share_value
    ]


@governance_bp.route('/meetings', methods=['POST'])
@require('governance', 'create')
def create_meeting():
    payload = json_dict(request)
    title = clean_string(payload.get('title'), 200)
    scheduled_for = _as_datetime(payload.get('scheduled_for'))

    if not title:
        return jsonify({'error': 'A meeting title is required'}), 400
    if scheduled_for is None:
        return jsonify({'error': 'Set the date and time of the meeting'}), 400

    meeting = Meeting(
        development_id=current_development_id(),
        reference=clean_string(payload.get('reference'), 40) or _next_reference(scheduled_for),
        title=title,
        meeting_type=one_of(payload.get('meeting_type'), MEETING_TYPE_KEYS, 'agm'),
        scheduled_for=scheduled_for,
        location=clean_string(payload.get('location'), 200),
        status='scheduled',
        quorum_note=clean_string(payload.get('quorum_note'), 200),
    )
    db.session.add(meeting)
    record_audit('CREATE', 'Meeting', f'{meeting.reference}: {title}', category='votes',
                 user=current_user, development=current_development())
    db.session.commit()
    return jsonify(meeting.to_dict()), 201


def _next_reference(scheduled_for):
    return f'AGM-{scheduled_for.year}'


@governance_bp.route('/meetings/<int:meeting_id>', methods=['PUT', 'PATCH'])
@require('governance', 'edit')
def update_meeting(meeting_id):
    meeting, denied = owned(Meeting, meeting_id)
    if denied:
        return denied

    payload = json_dict(request)
    for field, length in (('title', 200), ('location', 200), ('quorum_note', 200),
                          ('reference', 40)):
        if field in payload:
            value = clean_string(payload.get(field), length)
            if field in ('title', 'reference') and not value:
                return jsonify({'error': f'A meeting {field} is required'}), 400
            setattr(meeting, field, value)

    if 'meeting_type' in payload:
        meeting.meeting_type = one_of(payload.get('meeting_type'), MEETING_TYPE_KEYS,
                                      meeting.meeting_type)
    if 'scheduled_for' in payload:
        scheduled_for = _as_datetime(payload.get('scheduled_for'))
        if scheduled_for is None:
            return jsonify({'error': 'That is not a valid date and time'}), 400
        meeting.scheduled_for = scheduled_for
    for field in ('voting_opens_at', 'voting_closes_at'):
        if field in payload:
            setattr(meeting, field, _as_datetime(payload.get(field)))

    db.session.commit()
    return jsonify(meeting.to_dict(include_resolutions=True))


@governance_bp.route('/meetings/<int:meeting_id>/open-voting', methods=['POST'])
@require('governance', 'edit')
def open_voting(meeting_id):
    """
    Open the ballot and tell every co-owner it is open.

    Refused without resolutions: an open ballot with nothing on it invites the
    co-owner to log in, find nothing, and ignore the next notice.
    """
    meeting, denied = owned(Meeting, meeting_id)
    if denied:
        return denied
    if meeting.status not in ('scheduled', 'voting_open'):
        return jsonify({'error': f'This meeting is {meeting.status}'}), 409
    if not meeting.resolutions:
        return jsonify({'error': 'Add at least one resolution before opening the vote'}), 409

    payload = json_dict(request)
    meeting.status = 'voting_open'
    meeting.voting_opens_at = _as_datetime(payload.get('voting_opens_at')) or _utcnow()
    meeting.voting_closes_at = _as_datetime(payload.get('voting_closes_at')) or meeting.scheduled_for

    _notify_co_owners(
        meeting,
        title=f'Voting is open — {meeting.title}',
        body=f'{len(meeting.resolutions)} resolution(s) to vote on before '
             f'{meeting.voting_closes_at.strftime("%d %b %Y")}.',
        link_path='/app/coop/voting',
    )
    meeting.whatsapp_sent = True

    record_audit('MODIFY', 'Meeting', f'Voting opened on {meeting.reference}', category='votes',
                 user=current_user, development=current_development())
    db.session.commit()
    return jsonify(meeting.to_dict(include_resolutions=True))


@governance_bp.route('/meetings/<int:meeting_id>/close-voting', methods=['POST'])
@require('governance', 'edit')
def close_voting(meeting_id):
    """
    Close the ballot and write each resolution's outcome.

    This is the only place an outcome is set. The threshold applied is the one
    stored on the resolution when it was drafted, so a result cannot be changed
    later by editing the majority type.
    """
    meeting, denied = owned(Meeting, meeting_id)
    if denied:
        return denied
    if meeting.status != 'voting_open':
        return jsonify({'error': 'Voting is not open on this meeting'}), 409

    total_shares = _total_shares()
    results = []
    for resolution in meeting.resolutions:
        row = _resolution_row(resolution, total_shares)
        resolution.outcome = 'passed' if row['would_pass'] else 'rejected'
        resolution.article_ref = row['article_ref']
        results.append({
            'resolution_id': resolution.id,
            'title': resolution.title,
            'outcome': resolution.outcome,
            'in_favour_percent': row['in_favour_percent'],
            'threshold_percent': row['threshold_percent'],
            'shares_cast': row['shares_cast'],
        })

    meeting.status = 'voting_closed'
    meeting.voting_closes_at = _utcnow()

    passed = sum(1 for result in results if result['outcome'] == 'passed')
    _notify_co_owners(
        meeting,
        title=f'Results published — {meeting.title}',
        body=f'{passed} of {len(results)} resolution(s) passed.',
        link_path='/app/coop/voting',
    )

    record_audit('MODIFY', 'Meeting',
                 f'Voting closed on {meeting.reference}: {passed}/{len(results)} passed',
                 category='votes', user=current_user, development=current_development(),
                 after={'results': results})
    db.session.commit()
    return jsonify({'meeting': meeting.to_dict(include_resolutions=True), 'results': results})


@governance_bp.route('/meetings/<int:meeting_id>', methods=['DELETE'])
@require('governance', 'delete')
def delete_meeting(meeting_id):
    meeting, denied = owned(Meeting, meeting_id)
    if denied:
        return denied
    if any(resolution.votes for resolution in meeting.resolutions):
        return jsonify({
            'error': 'Votes have been cast at this meeting. Cancel it instead so the '
                     'ballot record survives.',
        }), 409

    reference = meeting.reference
    db.session.delete(meeting)
    record_audit('DELETE', 'Meeting', f'{reference} removed', category='votes',
                 user=current_user, development=current_development())
    db.session.commit()
    return jsonify({'ok': True})


@governance_bp.route('/meetings/<int:meeting_id>/cancel', methods=['POST'])
@require('governance', 'edit')
def cancel_meeting(meeting_id):
    meeting, denied = owned(Meeting, meeting_id)
    if denied:
        return denied
    meeting.status = 'cancelled'
    _notify_co_owners(
        meeting,
        title=f'Cancelled — {meeting.title}',
        body=f'The meeting scheduled for {meeting.scheduled_for.strftime("%d %b %Y")} '
             f'will not take place.',
        link_path='/app/coop/voting',
    )
    record_audit('MODIFY', 'Meeting', f'{meeting.reference} cancelled', category='votes',
                 user=current_user, development=current_development())
    db.session.commit()
    return jsonify(meeting.to_dict())


# --- Resolutions ------------------------------------------------------------

@governance_bp.route('/meetings/<int:meeting_id>/resolutions', methods=['POST'])
@require('governance', 'create')
def create_resolution(meeting_id):
    meeting, denied = owned(Meeting, meeting_id)
    if denied:
        return denied
    if meeting.status not in ('scheduled',):
        return jsonify({
            'error': 'Resolutions can only be added while the meeting is still being drafted',
        }), 409

    payload = json_dict(request)
    title = clean_string(payload.get('title'), 200)
    if not title:
        return jsonify({'error': 'A resolution title is required'}), 400

    majority_type = one_of(payload.get('majority_type'), MAJORITY_TYPE_KEYS, 'simple')
    resolution = Resolution(
        meeting_id=meeting.id,
        sequence=as_int(payload.get('sequence'), len(meeting.resolutions) + 1, minimum=1),
        title=title,
        description=clean_string(payload.get('description')),
        majority_type=majority_type,
        article_ref=ARTICLE_REFS.get(majority_type),
    )
    db.session.add(resolution)
    db.session.commit()
    return jsonify(resolution.to_dict()), 201


@governance_bp.route('/resolutions/<int:resolution_id>', methods=['PUT', 'PATCH'])
@require('governance', 'edit')
def update_resolution(resolution_id):
    resolution, error = _resolution(resolution_id)
    if error:
        return error
    if resolution.votes:
        return jsonify({
            'error': 'Votes have already been cast on this resolution and its wording '
                     'is now part of the ballot record.',
        }), 409

    payload = json_dict(request)
    if 'title' in payload:
        title = clean_string(payload.get('title'), 200)
        if not title:
            return jsonify({'error': 'A resolution title is required'}), 400
        resolution.title = title
    if 'description' in payload:
        resolution.description = clean_string(payload.get('description'))
    if 'majority_type' in payload:
        resolution.majority_type = one_of(payload.get('majority_type'), MAJORITY_TYPE_KEYS,
                                          resolution.majority_type)
        resolution.article_ref = ARTICLE_REFS.get(resolution.majority_type)
    if 'sequence' in payload:
        resolution.sequence = as_int(payload.get('sequence'), resolution.sequence, minimum=1)

    db.session.commit()
    return jsonify(resolution.to_dict())


@governance_bp.route('/resolutions/<int:resolution_id>', methods=['DELETE'])
@require('governance', 'delete')
def delete_resolution(resolution_id):
    resolution, error = _resolution(resolution_id)
    if error:
        return error
    if resolution.votes:
        return jsonify({'error': 'Votes have been cast on this resolution'}), 409
    db.session.delete(resolution)
    db.session.commit()
    return jsonify({'ok': True})


@governance_bp.route('/resolutions/<int:resolution_id>/votes', methods=['GET'])
@require('governance', 'view')
def list_votes(resolution_id):
    """
    The ballot for one resolution, by unit.

    Shown to the syndic because a share-weighted ballot has to be auditable —
    a co-owner disputing the tally is entitled to see which units were counted
    and at what weight.
    """
    resolution, error = _resolution(resolution_id)
    if error:
        return error
    return jsonify({
        'resolution': _resolution_row(resolution, _total_shares()),
        'votes': [
            {
                **vote.to_dict(),
                'unit_label': vote.unit.label if vote.unit else None,
                'cast_by': vote.user.name if vote.user else None,
            }
            for vote in sorted(resolution.votes, key=lambda v: v.cast_at or _utcnow())
        ],
    })


def _resolution(resolution_id):
    resolution = db.session.get(Resolution, resolution_id)
    if (
        resolution is None
        or resolution.meeting is None
        or resolution.meeting.development_id != current_development_id()
    ):
        return None, (jsonify({'error': 'Resolution not found'}), 404)
    return resolution, None


# --- Shared -----------------------------------------------------------------

def _notify_co_owners(meeting, title, body, link_path):
    development = current_development()
    accounts = User.query.filter(
        User.development_id == development.id,
        User.role == 'co_owner',
        User.status == 'active',
    ).all()
    for account in accounts:
        notify(
            account,
            category='governance',
            title=title,
            body=body,
            icon_key='vote',
            link_path=link_path,
            development=development,
            whatsapp_template='meeting_notice',
        )


@governance_bp.route('/meetings/<int:meeting_id>/export', methods=['GET'])
@require('governance', 'export')
def export_results(meeting_id):
    """The result sheet a committee minutes from."""
    meeting, denied = owned(Meeting, meeting_id)
    if denied:
        return denied

    total_shares = _total_shares()
    rows = [f'Meeting,{_csv(meeting.reference)},{_csv(meeting.title)}']
    rows.append(f'Total shares,{total_shares}')
    rows.append('')
    rows.append('Resolution,Majority,Article,For,Against,Abstain,Shares cast,In favour %,Outcome')
    for resolution in meeting.resolutions:
        row = _resolution_row(resolution, total_shares)
        rows.append(','.join([
            _csv(resolution.title),
            _csv(resolution.majority_type),
            _csv(row['article_ref']),
            str(row['tally']['for']),
            str(row['tally']['against']),
            str(row['tally']['abstain']),
            str(row['shares_cast']),
            str(row['in_favour_percent']),
            _csv(resolution.outcome or 'open'),
        ]))

    development = current_development()
    return '\n'.join(rows), 200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': f'attachment; filename="{development.code}-{meeting.reference}-results.csv"',
    }


def _csv(value):
    text = str(value or '')
    if any(character in text for character in ',"\n'):
        return '"' + text.replace('"', '""') + '"'
    return text
