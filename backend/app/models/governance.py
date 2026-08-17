"""
Governance models — general meetings, resolutions and share-weighted voting.

Mauritian co-ownership law weights a vote by the shares attached to the unit,
not by the head count of people in the room, and different resolutions need
different majorities (Art. 24 simple, Art. 25 absolute). So a Vote stores the
share weight it carried at the moment it was cast: recomputing it later from
the unit would silently rewrite history if shares are ever re-apportioned.

One vote per unit per resolution — enforced by a unique constraint, not by a
check in the route, because joint owners both hold a login to the same unit.
"""
from datetime import datetime, timezone

from ..extensions import db

MEETING_TYPES = [
    {'key': 'agm', 'label': 'Annual General Meeting'},
    {'key': 'egm', 'label': 'Extraordinary General Meeting'},
    {'key': 'committee', 'label': 'Committee Meeting'},
]
MEETING_TYPE_KEYS = [m['key'] for m in MEETING_TYPES]
MEETING_TYPE_LABELS = {m['key']: m['label'] for m in MEETING_TYPES}

MEETING_STATUSES = ['scheduled', 'voting_open', 'voting_closed', 'held', 'cancelled']

MAJORITY_TYPES = [
    {'key': 'simple', 'label': 'Simple majority', 'article': 'Art. 24'},
    {'key': 'absolute', 'label': 'Absolute majority', 'article': 'Art. 25'},
    {'key': 'unanimous', 'label': 'Unanimous', 'article': 'Art. 26'},
]
MAJORITY_TYPE_KEYS = [m['key'] for m in MAJORITY_TYPES]

VOTE_CHOICES = ['for', 'against', 'abstain']


class Meeting(db.Model):
    __tablename__ = 'meetings'

    id = db.Column(db.Integer, primary_key=True)
    development_id = db.Column(db.Integer, db.ForeignKey('developments.id'), nullable=False, index=True)

    reference = db.Column(db.String(40), nullable=False)        # "AGM-2026"
    title = db.Column(db.String(200), nullable=False)
    meeting_type = db.Column(db.String(30), nullable=False, default='agm')
    scheduled_for = db.Column(db.DateTime, nullable=False)
    location = db.Column(db.String(200), nullable=True)

    status = db.Column(db.String(30), nullable=False, default='scheduled', index=True)
    voting_opens_at = db.Column(db.DateTime, nullable=True)
    voting_closes_at = db.Column(db.DateTime, nullable=True)
    quorum_note = db.Column(db.String(200), nullable=True)

    whatsapp_sent = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    development = db.relationship('Development')
    resolutions = db.relationship('Resolution', backref='meeting', cascade='all, delete-orphan',
                                  order_by='Resolution.sequence')

    @property
    def type_label(self):
        return MEETING_TYPE_LABELS.get(self.meeting_type, self.meeting_type)

    @property
    def is_voting_open(self):
        if self.status != 'voting_open':
            return False
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        if self.voting_opens_at and now < self.voting_opens_at:
            return False
        if self.voting_closes_at and now > self.voting_closes_at:
            return False
        return True

    def participation(self):
        """Shares represented — a unit counts once, however many resolutions it voted on."""
        from .property import Unit

        total = db.session.query(db.func.sum(Unit.share_value)).filter(
            Unit.development_id == self.development_id
        ).scalar() or 0

        resolution_ids = [resolution.id for resolution in self.resolutions]
        represented = 0
        if resolution_ids:
            voted_units = db.session.query(Vote.unit_id).filter(
                Vote.resolution_id.in_(resolution_ids)
            ).distinct()
            represented = db.session.query(db.func.sum(Unit.share_value)).filter(
                Unit.development_id == self.development_id,
                Unit.id.in_(voted_units),
            ).scalar() or 0

        total = int(total)
        represented = int(represented)
        return {
            'total_shares': total,
            'represented_shares': represented,
            'percent': round(represented / total * 100, 1) if total else 0.0,
        }

    def to_dict(self, include_resolutions=False, unit_id=None):
        payload = {
            'id': self.id,
            'reference': self.reference,
            'title': self.title,
            'meeting_type': self.meeting_type,
            'type_label': self.type_label,
            'scheduled_for': self.scheduled_for.isoformat() if self.scheduled_for else None,
            'location': self.location,
            'status': self.status,
            'is_voting_open': self.is_voting_open,
            'voting_closes_at': self.voting_closes_at.isoformat() if self.voting_closes_at else None,
            'quorum_note': self.quorum_note,
            'whatsapp_sent': self.whatsapp_sent,
            'resolution_count': len(self.resolutions),
        }
        if include_resolutions:
            payload['resolutions'] = [
                resolution.to_dict(unit_id=unit_id) for resolution in self.resolutions
            ]
            payload['participation'] = self.participation()
        return payload


class Resolution(db.Model):
    __tablename__ = 'resolutions'

    id = db.Column(db.Integer, primary_key=True)
    meeting_id = db.Column(db.Integer, db.ForeignKey('meetings.id'), nullable=False, index=True)
    sequence = db.Column(db.Integer, nullable=False, default=1)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, nullable=True)
    majority_type = db.Column(db.String(30), nullable=False, default='simple')
    article_ref = db.Column(db.String(40), nullable=True)       # "Art. 24"
    outcome = db.Column(db.String(30), nullable=True)           # passed, rejected — set on close

    votes = db.relationship('Vote', backref='resolution', cascade='all, delete-orphan')

    def tally(self):
        totals = {'for': 0, 'against': 0, 'abstain': 0}
        for vote in self.votes:
            if vote.choice in totals:
                totals[vote.choice] += vote.share_weight or 0
        return totals

    def vote_for_unit(self, unit_id):
        if not unit_id:
            return None
        for vote in self.votes:
            if vote.unit_id == unit_id:
                return vote
        return None

    def to_dict(self, unit_id=None):
        own_vote = self.vote_for_unit(unit_id)
        return {
            'id': self.id,
            'sequence': self.sequence,
            'title': self.title,
            'description': self.description,
            'majority_type': self.majority_type,
            'article_ref': self.article_ref,
            'outcome': self.outcome,
            'tally': self.tally(),
            'my_vote': own_vote.choice if own_vote else None,
            'my_vote_weight': own_vote.share_weight if own_vote else None,
            'my_vote_at': own_vote.cast_at.isoformat() if own_vote and own_vote.cast_at else None,
        }


class Vote(db.Model):
    __tablename__ = 'votes'

    id = db.Column(db.Integer, primary_key=True)
    resolution_id = db.Column(db.Integer, db.ForeignKey('resolutions.id'), nullable=False, index=True)
    unit_id = db.Column(db.Integer, db.ForeignKey('units.id'), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)

    choice = db.Column(db.String(20), nullable=False)
    # Frozen at cast time; re-deriving it from the unit would rewrite history.
    share_weight = db.Column(db.Integer, nullable=False, default=0)
    cast_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    unit = db.relationship('Unit')
    user = db.relationship('User')

    __table_args__ = (
        db.UniqueConstraint('resolution_id', 'unit_id', name='uq_one_vote_per_unit_per_resolution'),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'resolution_id': self.resolution_id,
            'unit_id': self.unit_id,
            'choice': self.choice,
            'share_weight': self.share_weight,
            'cast_at': self.cast_at.isoformat() if self.cast_at else None,
        }
