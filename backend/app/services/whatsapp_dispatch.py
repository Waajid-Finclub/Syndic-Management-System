"""
WhatsApp dispatch seam.

No Meta Cloud API credentials are wired up yet, so every send runs through
LoggedClient: it accepts the message, mints a reference, and a whatsapp_messages
row is written for real. Everything around the send — audience resolution,
opt-in filtering, template rendering, the monthly counter, the audit row — is
production code exercised on every dispatch.

When the Business API is connected, a MetaCloudClient implements this interface
and `WHATSAPP_CLIENT` selects it. No route or screen changes, because none of
them know which client they are talking to.

The interface is deliberately narrow. A client hands one rendered message to one
number; it does not know what a template or an audience is.
"""
import re
import secrets
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import date, datetime, timezone

from flask import current_app

from ..extensions import db
from ..models import User, WhatsAppMessage, WhatsAppStat

# --- Audiences -------------------------------------------------------------
#
# Who a console operator may address. Audiences follow the account layers: the
# operator can reach a client's admin team or the co-owners under them, and
# nothing else holds a login on this platform.

AUDIENCES = [
    {'key': 'co_owners', 'label': 'Co-owners', 'roles': ['co_owner'],
     'description': 'Owners in scope — charges, arrears, votes, notices'},
    {'key': 'syndic_team', 'label': 'Syndic admin team',
     'roles': ['syndic_manager', 'finance_officer', 'assistant_manager'],
     'description': "The client's own managers and finance officers"},
    {'key': 'board_members', 'label': 'Board members', 'roles': ['board_member'],
     'description': 'Committee members holding governance oversight'},
]
AUDIENCE_KEYS = [a['key'] for a in AUDIENCES]
AUDIENCE_ROLES = {a['key']: a['roles'] for a in AUDIENCES}
AUDIENCE_LABELS = {a['key']: a['label'] for a in AUDIENCES}

# A single trigger is capped so a mis-scoped broadcast cannot run away.
MAX_RECIPIENTS = 500

PLACEHOLDER_PATTERN = re.compile(r'{{\s*([A-Za-z0-9_]+)\s*}}')


# --- Templates -------------------------------------------------------------

def placeholders(body):
    """Ordered, de-duplicated {{variable}} names used by a template body."""
    found = []
    for name in PLACEHOLDER_PATTERN.findall(body or ''):
        if name not in found:
            found.append(name)
    return found


def render(body, variables):
    """Substitute {{variable}} values. Returns (text, names_still_missing)."""
    values = {
        str(key): str(value).strip()
        for key, value in (variables or {}).items()
        if str(value).strip()
    }
    missing = [name for name in placeholders(body) if name not in values]
    text = PLACEHOLDER_PATTERN.sub(lambda match: values.get(match.group(1), match.group(0)), body or '')
    return text, missing


# --- Recipients ------------------------------------------------------------

def audience_query(audience_key, development_id=None):
    """Every active account an audience covers, before opt-in is considered."""
    roles = AUDIENCE_ROLES.get(audience_key, [])
    query = User.query.filter(User.role.in_(roles), User.status == 'active')
    if development_id:
        query = query.filter(User.development_id == development_id)
    return query.order_by(User.development_id, User.first_name, User.last_name)


def is_reachable(user):
    """A message only leaves the platform for an opted-in number on file."""
    return bool(user.whatsapp_enabled and (user.phone or '').strip())


def unreachable_reason(user):
    if not user.whatsapp_enabled:
        return 'Not opted in'
    if not (user.phone or '').strip():
        return 'No number on file'
    return None


def mask_number(phone):
    """Never echo a full phone number back to a console operator."""
    text = (phone or '').strip()
    if len(text) < 4:
        return text or None
    return f'{text[:-4]}XXXX'


def audience_summary(audience_key, development_id=None, sample_size=8):
    """Counts plus a short recipient sample, for the composer's scope card."""
    people = audience_query(audience_key, development_id).all()
    reachable = [person for person in people if is_reachable(person)]

    return {
        'audience': audience_key,
        'label': AUDIENCE_LABELS.get(audience_key, audience_key),
        'development_id': development_id,
        'in_scope': len(people),
        'opted_in': sum(1 for person in people if person.whatsapp_enabled),
        'reachable': len(reachable),
        'sample': [{
            'id': person.id,
            'name': person.name,
            'role_display': person.role_display,
            'scope_label': person.scope_label,
            'phone': mask_number(person.phone),
            'reachable': is_reachable(person),
            'reason': unreachable_reason(person),
        } for person in people[:sample_size]],
    }


# --- Client seam -----------------------------------------------------------

@dataclass(frozen=True)
class DispatchResult:
    ok: bool
    reference: str | None = None
    failure_reason: str | None = None


class WhatsAppClient(ABC):
    name = 'abstract'

    @abstractmethod
    def send(self, to_number: str, body: str, template_name: str) -> DispatchResult:
        """Hand one rendered message to the carrier. Must not raise on rejection."""


class LoggedClient(WhatsAppClient):
    """
    Accepts any message addressed to a plausible number and mints a reference.

    A rejection path exists so the failure branch in the route is real code
    rather than an untested else: an unusable number or an empty body is
    refused, which is also the only rejection a client with no carrier behind it
    can honestly produce.
    """

    name = 'logged'

    def send(self, to_number, body, template_name):
        digits = re.sub(r'\D', '', to_number or '')
        if len(digits) < 8:
            return DispatchResult(ok=False, failure_reason='Not a usable WhatsApp number')
        if not (body or '').strip():
            return DispatchResult(ok=False, failure_reason='Nothing to send')
        return DispatchResult(ok=True, reference=f'WA-{secrets.token_hex(5).upper()}')


_CLIENTS = {
    'logged': LoggedClient,
}


def get_client() -> WhatsAppClient:
    configured = (current_app.config.get('WHATSAPP_CLIENT') or 'logged').lower()
    client_class = _CLIENTS.get(configured, LoggedClient)
    return client_class()


# --- Dispatch --------------------------------------------------------------

def current_period():
    today = date.today()
    return f'{today.year:04d}-{today.month:02d}'


def month_stat(create=False):
    """The WhatsAppStat row for this month, falling back to the latest one."""
    period = current_period()
    stat = WhatsAppStat.query.filter(WhatsAppStat.period_month == period).first()
    if stat is not None:
        return stat
    if not create:
        return WhatsAppStat.query.order_by(WhatsAppStat.period_month.desc()).first()

    stat = WhatsAppStat(period_month=period)
    db.session.add(stat)
    return stat


def dispatch(template, body, recipients, development=None):
    """
    Hand `body` to the client once per recipient and log every attempt.

    `recipients` is a list of (user, number) pairs; the user is None for a test
    send to a number typed straight into the console. Rows are added to the
    session — the caller owns the commit.
    """
    client = get_client()
    sent = []
    failed = []

    for user, number in recipients:
        result = client.send(number, body, template.name)
        message = WhatsAppMessage(
            development_id=(user.development_id if user else None) or getattr(development, 'id', None),
            user_id=user.id if user else None,
            template_name=template.name,
            to_number=number,
            body=body,
            category=template.category,
            status='sent' if result.ok else 'failed',
        )
        db.session.add(message)
        (sent if result.ok else failed).append(message)

    unit_cost = float(template.cost_per_message or 0)
    _record_volume(template, len(sent), len(failed), unit_cost)

    return {
        'template': template.name,
        'client': client.name,
        'sent': len(sent),
        'failed': len(failed),
        'cost': round(len(sent) * unit_cost, 2),
        'messages': [message.to_dict() for message in sent + failed],
    }


def _record_volume(template, sent, failed, unit_cost):
    """Roll a dispatch into this month's counters and the template's own total.

    Only `total_sent` moves. Delivery and read receipts are Meta's to report,
    so they stay where they are until a live client starts feeding webhooks in.
    """
    if not sent and not failed:
        return

    stat = month_stat(create=True)
    stat.total_sent = (stat.total_sent or 0) + sent
    stat.failed = (stat.failed or 0) + failed
    stat.monthly_cost = float(stat.monthly_cost or 0) + round(sent * unit_cost, 2)

    template.sent_30d = (template.sent_30d or 0) + sent


def sent_since(moment):
    """Message counts logged since `moment`, for the centre's header tiles."""
    rows = WhatsAppMessage.query.filter(WhatsAppMessage.created_at >= moment).all()
    return {
        'sent': sum(1 for row in rows if row.status == 'sent'),
        'failed': sum(1 for row in rows if row.status == 'failed'),
        'recipients': len({row.to_number for row in rows if row.to_number}),
    }


def start_of_today():
    now = datetime.now(timezone.utc)
    return now.replace(hour=0, minute=0, second=0, microsecond=0)
