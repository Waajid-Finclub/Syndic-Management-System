"""
Notification service — one call site for "tell the resident something happened".

Every resident-visible event goes through `notify()`, which does two things:
writes the in-app notification row, and — when the resident has the channel
switched on — logs an outbound WhatsApp message against the same models the
admin console's WhatsApp screen already reads. Resident activity therefore
shows up in the operator's delivery stats without a second reporting path.

Nothing here calls Meta. `send_whatsapp` records what would be sent; a live
Business API client replaces the body of that one function later.

Channel preference is checked here rather than at each call site, so a new
event type cannot accidentally ignore a resident who opted out.
"""
from datetime import datetime, timezone

from ..extensions import db
from ..models.integration import WhatsAppMessage, WhatsAppStat, WhatsAppTemplate
from ..models.resident import Notification, ResidentPreference


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def notify(
    user,
    category,
    title,
    body=None,
    icon_key=None,
    link_path=None,
    development=None,
    whatsapp_template=None,
    whatsapp_body=None,
):
    """
    Record an in-app notification and optionally mirror it to WhatsApp.

    Callers commit as part of their own transaction, matching record_audit.
    """
    development_id = getattr(development, 'id', None) or getattr(user, 'development_id', None)

    notification = Notification(
        user_id=user.id,
        development_id=development_id,
        category=category,
        title=title,
        body=body,
        icon_key=icon_key,
        link_path=link_path,
    )
    db.session.add(notification)

    if whatsapp_template and wants_whatsapp(user):
        send_whatsapp(
            user,
            template_name=whatsapp_template,
            body=whatsapp_body or body or title,
            development_id=development_id,
        )

    return notification


def wants_whatsapp(user):
    preference = ResidentPreference.query.filter_by(user_id=user.id).first()
    if preference is not None:
        return bool(preference.whatsapp_notifications) and bool(user.phone)
    return bool(user.whatsapp_enabled) and bool(user.phone)


def send_whatsapp(user, template_name, body, development_id=None):
    """
    Log one outbound WhatsApp message and roll it into the console's counters.

    Delivery is recorded as successful because nothing can fail on a simulated
    channel; a real client sets 'queued' here and updates the row from the
    provider's delivery webhook.
    """
    message = WhatsAppMessage(
        development_id=development_id or user.development_id,
        user_id=user.id,
        template_name=template_name,
        to_number=user.phone,
        body=body,
        status='delivered',
        delivered_at=_utcnow(),
    )
    db.session.add(message)

    template = WhatsAppTemplate.query.filter_by(name=template_name).first()
    if template is not None:
        message.category = template.category
        template.sent_30d = (template.sent_30d or 0) + 1

    _roll_monthly_stat(cost=float(template.cost_per_message or 0) if template else 0.0)
    return message


def _roll_monthly_stat(cost=0.0):
    period = _utcnow().strftime('%Y-%m')
    stat = WhatsAppStat.query.filter_by(period_month=period).first()
    if stat is None:
        stat = WhatsAppStat(period_month=period)
        db.session.add(stat)
        db.session.flush()

    stat.total_sent = (stat.total_sent or 0) + 1
    stat.delivered = (stat.delivered or 0) + 1
    if cost:
        stat.monthly_cost = float(stat.monthly_cost or 0) + cost


def mark_read(user, notification_ids=None):
    """Mark some or all of a resident's notifications read. Returns the count."""
    query = Notification.query.filter(
        Notification.user_id == user.id,
        Notification.is_read.is_(False),
    )
    if notification_ids:
        query = query.filter(Notification.id.in_(notification_ids))

    rows = query.all()
    now = _utcnow()
    for row in rows:
        row.is_read = True
        row.read_at = now
    return len(rows)


def unread_count(user):
    return Notification.query.filter(
        Notification.user_id == user.id,
        Notification.is_read.is_(False),
    ).count()
