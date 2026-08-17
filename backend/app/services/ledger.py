"""
Ledger service — the co-owner's account, derived from invoices and payments.

There is no balance column anywhere in this system. Everything on the Finance
screens is computed here from the two source tables, so a balance can never
disagree with the rows that produced it. That costs a couple of aggregate
queries per screen and buys the one property that matters in an accounting
module: the numbers reconcile by construction.

Payments allocate oldest-due-first. That is the convention a syndic office
follows on paper — it clears the debt accruing penalties first — and doing it
in one place means the resident's "Pay Rs 8,500" and a manager's manual receipt
land identically.
"""
from datetime import date, datetime, timezone
from decimal import Decimal

from ..extensions import db
from ..models.billing import EvChargingSession, Invoice, Payment, PaymentAllocation

ZERO = Decimal('0.00')


def _money(value):
    return Decimal(str(value or 0)).quantize(Decimal('0.01'))


def open_invoices(unit_id):
    """Unsettled invoices for a unit, oldest due date first."""
    invoices = Invoice.query.filter(
        Invoice.unit_id == unit_id,
        Invoice.status.notin_(('cancelled',)),
    ).order_by(Invoice.due_date.asc(), Invoice.id.asc()).all()
    return [invoice for invoice in invoices if not invoice.is_settled]


def outstanding_balance(unit_id):
    return _money(sum((invoice.balance for invoice in open_invoices(unit_id)), ZERO))


def account_summary(unit_id):
    """The four tiles and the balance card on the Finance screen."""
    today = date.today()
    year_start = date(today.year, 1, 1)
    month_start = date(today.year, today.month, 1)

    unsettled = open_invoices(unit_id)
    outstanding = _money(sum((invoice.balance for invoice in unsettled), ZERO))

    overdue = [invoice for invoice in unsettled if invoice.is_overdue]
    upcoming = [invoice for invoice in unsettled if not invoice.is_overdue]

    paid_ytd = _money(
        db.session.query(db.func.sum(Payment.amount)).filter(
            Payment.unit_id == unit_id,
            Payment.status == 'confirmed',
            Payment.paid_at >= datetime(year_start.year, year_start.month, year_start.day),
        ).scalar()
    )

    ev_this_month = _money(
        db.session.query(db.func.sum(EvChargingSession.amount)).filter(
            EvChargingSession.unit_id == unit_id,
            EvChargingSession.started_at >= datetime(month_start.year, month_start.month, 1),
        ).scalar()
    )

    # Credit is money received beyond what was billed — allocations can never
    # exceed an invoice, so any excess sits unallocated on the payment.
    paid_total = _money(
        db.session.query(db.func.sum(Payment.amount)).filter(
            Payment.unit_id == unit_id,
            Payment.status == 'confirmed',
        ).scalar()
    )
    allocated_total = _money(
        db.session.query(db.func.sum(PaymentAllocation.amount))
        .join(Payment, Payment.id == PaymentAllocation.payment_id)
        .filter(Payment.unit_id == unit_id, Payment.status == 'confirmed')
        .scalar()
    )
    credit = max(paid_total - allocated_total, ZERO)

    next_due = min((invoice.due_date for invoice in upcoming), default=None)
    overdue_since = min((invoice.due_date for invoice in overdue), default=None)

    return {
        'outstanding': float(outstanding),
        'overdue_amount': float(_money(sum((invoice.balance for invoice in overdue), ZERO))),
        'overdue_count': len(overdue),
        'open_invoice_count': len(unsettled),
        'paid_ytd': float(paid_ytd),
        'ev_this_month': float(ev_this_month),
        'credit': float(credit),
        'next_due_date': next_due.isoformat() if next_due else None,
        'days_until_due': (next_due - today).days if next_due else None,
        'overdue_since': overdue_since.isoformat() if overdue_since else None,
        'is_overdue': bool(overdue),
    }


def transactions(unit_id, kind='all', limit=None):
    """
    The Finance activity list: invoices, payments and EV sessions in one stream.

    EV sessions appear in their own right rather than only as an invoice line,
    because the resident thinks of "I charged the car" as an event, and the
    session carries the kWh the invoice line does not.
    """
    rows = []

    if kind in ('all', 'invoices', 'service_charges', 'ev'):
        invoices = Invoice.query.filter(
            Invoice.unit_id == unit_id,
            Invoice.status != 'cancelled',
        ).all()
        for invoice in invoices:
            if kind == 'service_charges' and invoice.invoice_type not in ('service_charge', 'special_levy'):
                continue
            if kind == 'ev' and invoice.invoice_type != 'ev_charging':
                continue
            rows.append({
                'kind': 'invoice',
                'id': invoice.id,
                'reference': invoice.reference,
                'description': invoice.title,
                'occurred_on': invoice.issue_date.isoformat(),
                'amount': -float(invoice.total_amount or 0),
                'status': invoice.display_status,
                'invoice_type': invoice.invoice_type,
                'link_id': invoice.id,
            })

    if kind in ('all', 'payments'):
        payments = Payment.query.filter(
            Payment.unit_id == unit_id,
            Payment.status.in_(('confirmed', 'pending')),
        ).all()
        for payment in payments:
            moment = payment.paid_at or payment.created_at
            rows.append({
                'kind': 'payment',
                'id': payment.id,
                'reference': payment.reference,
                'description': f'Payment — {payment.method_label}' if payment.method_label else 'Payment received',
                'occurred_on': moment.date().isoformat() if moment else None,
                'amount': float(payment.amount or 0),
                'status': 'confirmed' if payment.status == 'confirmed' else 'pending',
                'invoice_type': None,
                'link_id': payment.id,
            })

    if kind in ('all', 'ev'):
        sessions = EvChargingSession.query.filter(
            EvChargingSession.unit_id == unit_id,
        ).all()
        for session in sessions:
            rows.append({
                'kind': 'ev_session',
                'id': session.id,
                'reference': f'EV-{session.id:05d}',
                'description': f'EV Charging — Bay {session.bay.code if session.bay else "?"} '
                               f'({float(session.kwh or 0):.1f} kWh)',
                'occurred_on': session.started_at.date().isoformat() if session.started_at else None,
                'amount': -float(session.amount or 0),
                'status': session.status,
                'invoice_type': 'ev_charging',
                'link_id': session.invoice_id,
            })

    rows.sort(key=lambda row: (row['occurred_on'] or '', row['reference']), reverse=True)
    return rows[:limit] if limit else rows


def statement(unit_id, start_date, end_date):
    """
    A statement of account: opening balance, dated movements, running balance.

    Only invoices and payments move the balance. EV charging appears through
    the invoice that bills it, so counting sessions here would double-charge.
    """
    invoices = Invoice.query.filter(
        Invoice.unit_id == unit_id,
        Invoice.status != 'cancelled',
    ).all()
    payments = Payment.query.filter(
        Payment.unit_id == unit_id,
        Payment.status == 'confirmed',
    ).all()

    movements = []
    for invoice in invoices:
        movements.append({
            'on': invoice.issue_date,
            'reference': invoice.reference,
            'description': invoice.title,
            'debit': _money(invoice.total_amount),
            'credit': ZERO,
        })
    for payment in payments:
        moment = payment.paid_at or payment.created_at
        movements.append({
            'on': moment.date() if moment else date.today(),
            'reference': payment.reference,
            'description': 'Payment received',
            'debit': ZERO,
            'credit': _money(payment.amount),
        })

    movements.sort(key=lambda row: (row['on'], row['reference']))

    opening = ZERO
    rows = []
    running = ZERO
    for movement in movements:
        running += movement['debit'] - movement['credit']
        if movement['on'] < start_date:
            opening = running
            continue
        if movement['on'] > end_date:
            continue
        rows.append({
            'date': movement['on'].isoformat(),
            'reference': movement['reference'],
            'description': movement['description'],
            'debit': float(movement['debit']) if movement['debit'] else None,
            'credit': float(movement['credit']) if movement['credit'] else None,
            'balance': float(running),
        })

    return {
        'start_date': start_date.isoformat(),
        'end_date': end_date.isoformat(),
        'opening_balance': float(opening),
        'closing_balance': float(running),
        'rows': rows,
    }


def allocate_payment(payment, invoices=None):
    """
    Spread a confirmed payment across open invoices, oldest due date first.

    Returns the allocation rows created. Any remainder stays unallocated on the
    payment and surfaces as account credit — it is never silently dropped.
    """
    targets = invoices if invoices is not None else open_invoices(payment.unit_id)
    targets = sorted(targets, key=lambda invoice: (invoice.due_date, invoice.id))

    remaining = _money(payment.amount)
    created = []

    for invoice in targets:
        if remaining <= 0:
            break
        owed = invoice.balance
        if owed <= 0:
            continue
        applied = min(owed, remaining)
        allocation = PaymentAllocation(
            payment_id=payment.id,
            invoice_id=invoice.id,
            amount=applied,
        )
        db.session.add(allocation)
        invoice.allocations.append(allocation)
        remaining -= applied
        created.append(allocation)
        invoice.recalculate_status()

    return created


def next_reference(model, column, prefix, width=3):
    """
    Build the next human reference for a series, e.g. PAY-013.

    Sequence gaps are fine — the reference is a label for people, and the
    primary key remains the identity.
    """
    latest = db.session.query(db.func.max(column)).filter(
        column.like(f'{prefix}-%')
    ).scalar()
    number = 0
    if latest:
        tail = str(latest).rsplit('-', 1)[-1]
        if tail.isdigit():
            number = int(tail)
    return f'{prefix}-{number + 1:0{width}d}'


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)
