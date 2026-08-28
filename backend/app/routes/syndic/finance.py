"""
Billing and payments for one development.

The money model is the one already used by the resident app, seen from the other
side: there is no balance column anywhere, so every figure here is derived from
invoices and allocations and cannot disagree with the co-owner's own screen.
Both sides call services.ledger, so a receipt a manager posts and a card payment
a co-owner makes settle invoices identically.

Two rules are enforced rather than documented:

* A billing run is idempotent per development and period. The unique constraint
  on (development_id, period_month) is what stops a double-click billing the
  whole building twice.
* Payments are reversed, never deleted. A confirmed receipt that turns out to be
  wrong becomes a 'refunded' row with its allocations released; the original
  stays visible, because a co-owner was shown that receipt.
"""
import calendar
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation

from flask import Blueprint, jsonify, request
from flask_login import current_user

from ...extensions import db
from ...models import (
    DevelopmentFund,
    Invoice,
    InvoiceLine,
    Payment,
    PaymentAllocation,
    Unit,
)
from ...models.audit import record_audit
from ...models.billing import INVOICE_TYPE_KEYS, INVOICE_TYPES
from ...models.billing_run import BILLING_BASIS, BILLING_BASIS_KEYS, BillingRun
from ...services.ledger import allocate_payment, next_reference, statement
from ...services.notifications import notify
from ...utils.validation import as_date, as_int, clean_string, json_dict, one_of
from ._access import (
    actor_label,
    current_development,
    current_development_id,
    owned,
    require,
    scoped,
)

finance_bp = Blueprint('syndic_finance', __name__)

ZERO = Decimal('0.00')
FUND_TYPES = ['reserve', 'sinking', 'maintenance', 'operating']


def _money(value):
    return Decimal(str(value or 0)).quantize(Decimal('0.01'))


def _decimal(value, default=None):
    if value in (None, ''):
        return default
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        return default


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


# --- Summary ----------------------------------------------------------------

@finance_bp.route('/summary', methods=['GET'])
@require('finance', 'view')
def summary():
    development_id = current_development_id()
    invoices = _live_invoices(development_id)

    billed = sum((_money(invoice.total_amount) for invoice in invoices), ZERO)
    outstanding = sum((invoice.balance for invoice in invoices if not invoice.is_settled), ZERO)
    overdue = sum((invoice.balance for invoice in invoices if invoice.is_overdue), ZERO)

    today = date.today()
    month_start = date(today.year, today.month, 1)
    collected_this_month = _money(
        db.session.query(db.func.sum(Payment.amount)).filter(
            Payment.development_id == development_id,
            Payment.status == 'confirmed',
            Payment.paid_at >= datetime(month_start.year, month_start.month, 1),
        ).scalar()
    )

    return jsonify({
        'totals': {
            'billed': float(billed),
            'collected': float(billed - outstanding),
            'outstanding': float(outstanding),
            'overdue': float(overdue),
            'collection_rate': round(float((billed - outstanding) / billed * 100), 1) if billed else 0.0,
            'collected_this_month': float(collected_this_month),
            'open_invoices': sum(1 for invoice in invoices if not invoice.is_settled),
            'overdue_invoices': sum(1 for invoice in invoices if invoice.is_overdue),
        },
        'aging': _aging(invoices),
        'invoice_types': INVOICE_TYPES,
        'billing_basis': BILLING_BASIS,
        'runs': [run.to_dict() for run in scoped(BillingRun)
                 .order_by(BillingRun.period_month.desc()).limit(12).all()],
        'funds': [fund.to_dict() for fund in scoped(DevelopmentFund)
                  .order_by(DevelopmentFund.name).all()],
        'fund_types': FUND_TYPES,
    })


def _live_invoices(development_id):
    return Invoice.query.filter(
        Invoice.development_id == development_id,
        Invoice.status != 'cancelled',
    ).all()


def _aging(invoices):
    """
    Arrears bucketed the way a syndic reports them to a committee.

    Buckets are on the due date, not the issue date: an invoice is not late
    until the day it was due to be paid.
    """
    today = date.today()
    buckets = [
        {'key': 'current', 'label': 'Not yet due', 'min': None, 'max': 0},
        {'key': 'd1_30', 'label': '1-30 days', 'min': 1, 'max': 30},
        {'key': 'd31_60', 'label': '31-60 days', 'min': 31, 'max': 60},
        {'key': 'd61_90', 'label': '61-90 days', 'min': 61, 'max': 90},
        {'key': 'd90_plus', 'label': 'Over 90 days', 'min': 91, 'max': None},
    ]
    totals = {bucket['key']: ZERO for bucket in buckets}
    counts = {bucket['key']: 0 for bucket in buckets}

    for invoice in invoices:
        if invoice.is_settled:
            continue
        days = (today - invoice.due_date).days
        for bucket in buckets:
            low = bucket['min']
            high = bucket['max']
            if (low is None or days >= low) and (high is None or days <= high):
                totals[bucket['key']] += invoice.balance
                counts[bucket['key']] += 1
                break

    return [
        {
            'key': bucket['key'],
            'label': bucket['label'],
            'amount': float(totals[bucket['key']]),
            'count': counts[bucket['key']],
        }
        for bucket in buckets
    ]


# --- Invoices ---------------------------------------------------------------

@finance_bp.route('/invoices', methods=['GET'])
@require('finance', 'view')
def list_invoices():
    query = scoped(Invoice)

    status = clean_string(request.args.get('status'))
    unit_id = as_int(request.args.get('unit_id'))
    if unit_id:
        query = query.filter(Invoice.unit_id == unit_id)

    invoices = query.order_by(Invoice.issue_date.desc(), Invoice.id.desc()).all()

    if status and status != 'all':
        invoices = [invoice for invoice in invoices if invoice.display_status == status]

    search = clean_string(request.args.get('q'))
    if search:
        term = search.lower()
        invoices = [
            invoice for invoice in invoices
            if term in invoice.reference.lower()
            or term in (invoice.title or '').lower()
            or term in (invoice.unit.label if invoice.unit else '').lower()
        ]

    return jsonify({'invoices': [invoice.to_dict() for invoice in invoices]})


@finance_bp.route('/invoices/<int:invoice_id>', methods=['GET'])
@require('finance', 'view')
def invoice_detail(invoice_id):
    invoice, denied = owned(Invoice, invoice_id)
    if denied:
        return denied
    return jsonify({
        'invoice': invoice.to_dict(include_lines=True, include_payments=True),
        'owners': _owner_contacts(invoice.unit),
    })


@finance_bp.route('/invoices', methods=['POST'])
@require('finance', 'create')
def create_invoice():
    """Raise one invoice by hand — a levy, a repair recharge, a booking fee."""
    payload = json_dict(request)
    unit, denied = owned(Unit, as_int(payload.get('unit_id')))
    if denied:
        return jsonify({'error': 'That unit does not belong to this development'}), 404

    title = clean_string(payload.get('title'), 200)
    if not title:
        return jsonify({'error': 'An invoice title is required'}), 400

    lines, total, line_error = _read_lines(payload)
    if line_error:
        return line_error

    issue_date = as_date(payload.get('issue_date')) or date.today()
    due_date = as_date(payload.get('due_date')) or (issue_date + timedelta(days=30))
    if due_date < issue_date:
        return jsonify({'error': 'The due date cannot be before the issue date'}), 400

    invoice = Invoice(
        development_id=current_development_id(),
        unit_id=unit.id,
        reference=next_reference(Invoice, Invoice.reference, 'INV', width=5),
        title=title,
        invoice_type=one_of(payload.get('invoice_type'), INVOICE_TYPE_KEYS, 'other'),
        period_label=clean_string(payload.get('period_label'), 60),
        issue_date=issue_date,
        due_date=due_date,
        total_amount=total,
        status='issued',
    )
    db.session.add(invoice)
    db.session.flush()
    for order, line in enumerate(lines):
        db.session.add(InvoiceLine(invoice_id=invoice.id, sort_order=order, **line))

    _notify_owners(unit, invoice)
    record_audit('CREATE', 'Invoice',
                 f'{invoice.reference} raised against unit {unit.label} for {total}',
                 category='financial', user=current_user, development=current_development())
    db.session.commit()

    return jsonify(invoice.to_dict(include_lines=True)), 201


def _read_lines(payload):
    """Read invoice lines, deriving the total from them rather than trusting one."""
    raw_lines = payload.get('lines')
    if not isinstance(raw_lines, list) or not raw_lines:
        return None, None, (jsonify({'error': 'An invoice needs at least one line'}), 400)

    lines = []
    total = ZERO
    for entry in raw_lines:
        if not isinstance(entry, dict):
            continue
        description = clean_string(entry.get('description'), 255)
        rate = _decimal(entry.get('unit_rate'), ZERO)
        quantity = _decimal(entry.get('quantity'), Decimal('1'))
        if not description or rate is None or quantity is None:
            return None, None, (jsonify({'error': 'Every line needs a description and an amount'}), 400)
        amount = _money(rate * quantity)
        total += amount
        lines.append({
            'description': description,
            'quantity': quantity,
            'unit_rate': rate,
            'amount': amount,
        })

    if not lines:
        return None, None, (jsonify({'error': 'An invoice needs at least one line'}), 400)
    if total <= 0:
        return None, None, (jsonify({'error': 'An invoice total must be greater than zero'}), 400)
    return lines, total, None


@finance_bp.route('/invoices/<int:invoice_id>', methods=['PUT', 'PATCH'])
@require('finance', 'edit')
def update_invoice(invoice_id):
    """
    Adjust an invoice's dates, or resolve a dispute.

    The amount is deliberately not editable once issued. Changing what a
    co-owner was billed after they were told the figure is how an account stops
    reconciling; raise a credit note or a second invoice instead.
    """
    invoice, denied = owned(Invoice, invoice_id)
    if denied:
        return denied

    payload = json_dict(request)

    if 'due_date' in payload:
        due_date = as_date(payload.get('due_date'))
        if due_date is None:
            return jsonify({'error': 'That due date is not a date'}), 400
        if due_date < invoice.issue_date:
            return jsonify({'error': 'The due date cannot be before the issue date'}), 400
        invoice.due_date = due_date

    if 'status' in payload:
        status = clean_string(payload.get('status'))
        if status == 'cancelled':
            if invoice.amount_paid > 0:
                return jsonify({
                    'error': 'This invoice has been paid against. Refund the payment first.',
                }), 409
            invoice.status = 'cancelled'
            record_audit('MODIFY', 'Invoice', f'{invoice.reference} cancelled',
                         category='financial', user=current_user,
                         development=current_development())
        elif status == 'resolve_dispute':
            invoice.dispute_reason = None
            invoice.disputed_at = None
            invoice.recalculate_status()
            record_audit('MODIFY', 'Invoice', f'Dispute on {invoice.reference} resolved',
                         category='financial', user=current_user,
                         development=current_development())
        else:
            return jsonify({'error': 'An invoice can be cancelled or its dispute resolved'}), 400

    db.session.commit()
    return jsonify(invoice.to_dict(include_lines=True, include_payments=True))


# --- Billing runs -----------------------------------------------------------

@finance_bp.route('/billing-runs', methods=['GET'])
@require('finance', 'view')
def list_runs():
    runs = scoped(BillingRun).order_by(BillingRun.period_month.desc()).all()
    return jsonify({
        'runs': [run.to_dict() for run in runs],
        'basis': BILLING_BASIS,
        'next_period': _next_period(),
    })


def _next_period():
    """The first month with no run yet, which is what the button should offer."""
    latest = scoped(BillingRun).order_by(BillingRun.period_month.desc()).first()
    today = date.today()
    if latest is None:
        return f'{today.year:04d}-{today.month:02d}'
    year, month = (int(part) for part in latest.period_month.split('-'))
    month += 1
    if month > 12:
        year, month = year + 1, 1
    return f'{year:04d}-{month:02d}'


@finance_bp.route('/billing-runs/preview', methods=['POST'])
@require('finance', 'view')
def preview_run():
    """What the run would raise, per unit, before anything is written."""
    plan, error = _plan_run(json_dict(request))
    if error:
        return error
    return jsonify(plan)


@finance_bp.route('/billing-runs', methods=['POST'])
@require('finance', 'create')
def create_run():
    payload = json_dict(request)
    plan, error = _plan_run(payload)
    if error:
        return error
    if not plan['rows']:
        return jsonify({
            'error': 'No unit would be billed. Set a monthly charge on the units, '
                     'or bill by shares with a budget amount.',
        }), 409

    development = current_development()
    run = BillingRun(
        development_id=development.id,
        period_month=plan['period_month'],
        period_label=plan['period_label'],
        basis=plan['basis'],
        budget_amount=_decimal(plan['budget_amount']),
        issue_date=date.fromisoformat(plan['issue_date']),
        due_date=date.fromisoformat(plan['due_date']),
        invoice_count=len(plan['rows']),
        total_amount=_decimal(plan['total'], ZERO),
        status='issued',
        run_by_id=getattr(current_user, 'id', None),
        run_by_label=actor_label(),
    )
    db.session.add(run)

    try:
        db.session.flush()
    except Exception:
        db.session.rollback()
        return jsonify({
            'error': f'A billing run for {plan["period_label"]} already exists. '
                     f'Cancel it before running the period again.',
        }), 409

    for row in plan['rows']:
        unit = db.session.get(Unit, row['unit_id'])
        invoice = Invoice(
            development_id=development.id,
            unit_id=unit.id,
            reference=next_reference(Invoice, Invoice.reference, 'SC', width=5),
            title=f'Service charges — {plan["period_label"]}',
            invoice_type='service_charge',
            period_label=plan['period_label'],
            issue_date=run.issue_date,
            due_date=run.due_date,
            total_amount=_decimal(row['amount'], ZERO),
            status='issued',
            billing_run_id=run.id,
        )
        db.session.add(invoice)
        db.session.flush()
        db.session.add(InvoiceLine(
            invoice_id=invoice.id,
            description=row['description'],
            quantity=Decimal('1'),
            unit_rate=_decimal(row['amount'], ZERO),
            amount=_decimal(row['amount'], ZERO),
            sort_order=0,
        ))
        _notify_owners(unit, invoice)

    record_audit('CREATE', 'BillingRun',
                 f'{plan["period_label"]} billing run issued {len(plan["rows"])} invoices '
                 f'totalling {plan["total"]}',
                 category='financial', user=current_user, development=development)
    db.session.commit()

    return jsonify({'run': run.to_dict()}), 201


def _plan_run(payload):
    """
    Work out what a run would raise. Shared by preview and execute so the
    manager cannot be shown one set of figures and commit another.
    """
    period_month = clean_string(payload.get('period_month'), 7) or _next_period()
    try:
        year, month = (int(part) for part in period_month.split('-'))
        period_start = date(year, month, 1)
    except (ValueError, TypeError):
        return None, (jsonify({'error': 'Give the period as YYYY-MM'}), 400)

    basis = one_of(payload.get('basis'), BILLING_BASIS_KEYS, 'unit_charge')
    budget = _decimal(payload.get('budget_amount'))

    development = current_development()
    settings = development.settings
    billing_day = min(getattr(settings, 'billing_day', 1) or 1,
                      calendar.monthrange(year, month)[1])
    issue_date = date(year, month, billing_day)
    grace_days = getattr(settings, 'arrears_grace_days', 15) or 15
    due_date = as_date(payload.get('due_date')) or (issue_date + timedelta(days=grace_days))

    units = scoped(Unit).order_by(Unit.label).all()
    period_label = period_start.strftime('%B %Y')

    rows = []
    if basis == 'share_value':
        if budget is None or budget <= 0:
            return None, (jsonify({
                'error': 'Billing by shares needs the total budget to apportion',
            }), 400)
        total_shares = sum(unit.share_value or 0 for unit in units)
        if not total_shares:
            return None, (jsonify({
                'error': 'No shares are allocated yet, so a budget cannot be apportioned',
            }), 409)
        for unit in units:
            if not unit.share_value:
                continue
            amount = _money(budget * Decimal(unit.share_value) / Decimal(total_shares))
            if amount <= 0:
                continue
            rows.append({
                'unit_id': unit.id,
                'unit_label': unit.label,
                'shares': unit.share_value,
                'amount': float(amount),
                'description': f'Service charges {period_label} — '
                               f'{unit.share_value}/{total_shares} shares',
            })
    else:
        for unit in units:
            amount = _money(unit.monthly_charge)
            if amount <= 0:
                continue
            rows.append({
                'unit_id': unit.id,
                'unit_label': unit.label,
                'shares': unit.share_value,
                'amount': float(amount),
                'description': f'Service charges {period_label} — unit {unit.label}',
            })

    existing = scoped(BillingRun).filter(
        BillingRun.period_month == period_month,
        BillingRun.status == 'issued',
    ).first()

    return {
        'period_month': period_month,
        'period_label': period_label,
        'basis': basis,
        'budget_amount': float(budget) if budget is not None else None,
        'issue_date': issue_date.isoformat(),
        'due_date': due_date.isoformat(),
        'rows': rows,
        'total': float(sum((_decimal(row['amount'], ZERO) for row in rows), ZERO)),
        'already_run': existing.to_dict() if existing else None,
    }, None


@finance_bp.route('/billing-runs/<int:run_id>/cancel', methods=['POST'])
@require('finance', 'delete')
def cancel_run(run_id):
    """
    Void a run and the invoices it raised.

    Refused once any of those invoices has been paid against: a co-owner has
    settled a document, and voiding it would leave their payment allocated to
    nothing. Those invoices are corrected individually instead.
    """
    run, denied = owned(BillingRun, run_id)
    if denied:
        return denied
    if run.status != 'issued':
        return jsonify({'error': f'That run is already {run.status}'}), 409

    invoices = Invoice.query.filter(Invoice.billing_run_id == run.id).all()
    paid = [invoice for invoice in invoices if invoice.amount_paid > 0]
    if paid:
        return jsonify({
            'error': f'{len(paid)} invoice(s) from this run have payments against them. '
                     f'Cancel those individually after refunding.',
        }), 409

    for invoice in invoices:
        invoice.status = 'cancelled'
    run.status = 'cancelled'
    run.cancelled_at = _utcnow()

    record_audit('DELETE', 'BillingRun',
                 f'{run.period_label} billing run cancelled, {len(invoices)} invoices voided',
                 category='financial', user=current_user, development=current_development())
    db.session.commit()
    return jsonify({'run': run.to_dict()})


# --- Payments ---------------------------------------------------------------

@finance_bp.route('/payments', methods=['GET'])
@require('finance', 'view')
def list_payments():
    payments = scoped(Payment).order_by(Payment.paid_at.desc(), Payment.id.desc()).all()
    return jsonify({
        'payments': [
            {
                **payment.to_dict(include_allocations=True),
                'unit_label': payment.unit.label if payment.unit else None,
                'payer_name': payment.user.name if payment.user else None,
            }
            for payment in payments
        ],
    })


@finance_bp.route('/payments', methods=['POST'])
@require('finance', 'create')
def record_payment():
    """
    Post a receipt taken at the office — cash, cheque, bank transfer.

    Allocation is oldest-due-first through services.ledger, the same path a
    card payment from the resident app takes, so a manual receipt and an online
    one produce identical ledgers. Any remainder stays unallocated as account
    credit rather than being silently dropped.
    """
    payload = json_dict(request)
    unit, denied = owned(Unit, as_int(payload.get('unit_id')))
    if denied:
        return jsonify({'error': 'That unit does not belong to this development'}), 404

    amount = _decimal(payload.get('amount'))
    if amount is None or amount <= 0:
        return jsonify({'error': 'Enter the amount received'}), 400

    method_label = clean_string(payload.get('method_label'), 120) or 'Office receipt'
    paid_at = as_date(payload.get('paid_at'))
    moment = datetime(paid_at.year, paid_at.month, paid_at.day) if paid_at else _utcnow()

    primary_owner = next(
        (ownership.user for ownership in unit.ownerships
         if ownership.is_current and ownership.is_primary_contact and ownership.user),
        None,
    )

    payment = Payment(
        development_id=current_development_id(),
        unit_id=unit.id,
        user_id=primary_owner.id if primary_owner else None,
        reference=next_reference(Payment, Payment.reference, 'PAY', width=5),
        amount=_money(amount),
        method_label=method_label,
        status='confirmed',
        gateway_name='manual',
        gateway_reference=clean_string(payload.get('gateway_reference'), 80),
        paid_at=moment,
    )
    db.session.add(payment)
    db.session.flush()

    allocations = allocate_payment(payment)
    unallocated = _money(amount) - sum((_money(row.amount) for row in allocations), ZERO)

    if primary_owner is not None:
        notify(
            primary_owner,
            category='finance',
            title=f'Payment received — {method_label}',
            body=f'Rs {float(amount):,.2f} was credited to unit {unit.label}.',
            icon_key='wallet',
            link_path='/app/finance',
            development=current_development(),
            whatsapp_template='payment_receipt',
        )

    record_audit('CREATE', 'Payment',
                 f'{payment.reference} of {amount} recorded against unit {unit.label} '
                 f'({method_label})',
                 category='financial', user=current_user, development=current_development())
    db.session.commit()

    return jsonify({
        'payment': payment.to_dict(include_allocations=True),
        'allocated_count': len(allocations),
        'unallocated': float(unallocated),
    }), 201


@finance_bp.route('/payments/<int:payment_id>/reverse', methods=['POST'])
@require('finance', 'delete')
def reverse_payment(payment_id):
    """
    Reverse a receipt: release its allocations and mark it refunded.

    The row is never deleted. A co-owner was shown this receipt, and an account
    that can lose entries is an account nobody can audit.
    """
    payment, denied = owned(Payment, payment_id)
    if denied:
        return denied
    if payment.status != 'confirmed':
        return jsonify({'error': f'That payment is already {payment.status}'}), 409

    payload = json_dict(request)
    reason = clean_string(payload.get('reason'), 255)
    if not reason:
        return jsonify({'error': 'Give the reason for the reversal'}), 400

    touched = {allocation.invoice for allocation in payment.allocations if allocation.invoice}
    PaymentAllocation.query.filter(PaymentAllocation.payment_id == payment.id).delete()
    db.session.flush()
    for invoice in touched:
        invoice.recalculate_status()

    payment.status = 'refunded'
    payment.failure_reason = reason

    record_audit('MODIFY', 'Payment',
                 f'{payment.reference} reversed: {reason}',
                 category='financial', user=current_user, development=current_development(),
                 before={'status': 'confirmed'}, after={'status': 'refunded'})
    db.session.commit()

    return jsonify({'payment': payment.to_dict(include_allocations=True)})


# --- Arrears ----------------------------------------------------------------

@finance_bp.route('/arrears', methods=['GET'])
@require('finance', 'view')
def arrears():
    """One row per unit that owes anything, worst first."""
    development_id = current_development_id()
    today = date.today()
    rows = {}

    for invoice in _live_invoices(development_id):
        if invoice.is_settled:
            continue
        entry = rows.setdefault(invoice.unit_id, {
            'unit_id': invoice.unit_id,
            'unit_label': invoice.unit.label if invoice.unit else None,
            'balance': ZERO,
            'overdue': ZERO,
            'invoice_count': 0,
            'oldest_due': None,
        })
        entry['balance'] += invoice.balance
        entry['invoice_count'] += 1
        if invoice.is_overdue:
            entry['overdue'] += invoice.balance
            if entry['oldest_due'] is None or invoice.due_date < entry['oldest_due']:
                entry['oldest_due'] = invoice.due_date

    result = []
    for entry in sorted(rows.values(), key=lambda row: row['balance'], reverse=True):
        unit = db.session.get(Unit, entry['unit_id'])
        result.append({
            'unit_id': entry['unit_id'],
            'unit_label': entry['unit_label'],
            'balance': float(entry['balance']),
            'overdue': float(entry['overdue']),
            'invoice_count': entry['invoice_count'],
            'days_overdue': (today - entry['oldest_due']).days if entry['oldest_due'] else 0,
            'owners': _owner_contacts(unit),
        })

    return jsonify({'arrears': result, 'total': float(sum(
        (Decimal(str(row['balance'])) for row in result), ZERO,
    ))})


@finance_bp.route('/arrears/remind', methods=['POST'])
@require('finance', 'edit')
def send_reminders():
    """
    Notify the primary contact of every unit in arrears.

    One notification per unit, not per invoice: a co-owner three months behind
    should get one message about their balance, not three about its parts.
    """
    payload = json_dict(request)
    minimum = _decimal(payload.get('minimum_balance'), ZERO)
    development = current_development()
    sent = []

    for row in arrears().get_json()['arrears']:
        if Decimal(str(row['overdue'])) < minimum or row['overdue'] <= 0:
            continue
        for owner in row['owners']:
            if not owner['is_primary_contact'] or not owner['user_id']:
                continue
            from ...models import User

            account = db.session.get(User, owner['user_id'])
            if account is None or account.status != 'active':
                continue
            notify(
                account,
                category='finance',
                title=f'Service charge arrears — unit {row["unit_label"]}',
                body=f'Rs {row["overdue"]:,.2f} is now {row["days_overdue"]} days overdue. '
                     f'Please settle at your earliest convenience.',
                icon_key='alert-triangle',
                link_path='/app/finance',
                development=development,
                whatsapp_template='payment_reminder',
            )
            sent.append({'unit_label': row['unit_label'], 'name': account.name})

    record_audit('MODIFY', 'Arrears', f'Arrears reminders sent to {len(sent)} co-owners',
                 category='financial', user=current_user, development=development)
    db.session.commit()
    return jsonify({'sent': len(sent), 'recipients': sent})


@finance_bp.route('/units/<int:unit_id>/statement', methods=['GET'])
@require('finance', 'view')
def unit_statement(unit_id):
    unit, denied = owned(Unit, unit_id)
    if denied:
        return denied

    end = as_date(request.args.get('to')) or date.today()
    start = as_date(request.args.get('from')) or date(end.year, 1, 1)
    return jsonify({
        'unit': unit.to_dict(),
        'owners': _owner_contacts(unit),
        'statement': statement(unit.id, start, end),
    })


# --- Funds ------------------------------------------------------------------

@finance_bp.route('/funds', methods=['GET'])
@require('funds', 'view')
def list_funds():
    funds = scoped(DevelopmentFund).order_by(DevelopmentFund.name).all()
    return jsonify({'funds': [fund.to_dict() for fund in funds], 'fund_types': FUND_TYPES})


@finance_bp.route('/funds', methods=['POST'])
@require('funds', 'create')
def create_fund():
    payload = json_dict(request)
    name = clean_string(payload.get('name'), 120)
    if not name:
        return jsonify({'error': 'A fund name is required'}), 400

    fund = DevelopmentFund(
        development_id=current_development_id(),
        name=name,
        fund_type=one_of(payload.get('fund_type'), FUND_TYPES, 'reserve'),
        balance=_decimal(payload.get('balance'), ZERO),
        target_balance=_decimal(payload.get('target_balance')),
    )
    db.session.add(fund)
    record_audit('CREATE', 'Fund', f'{name} fund opened', category='financial',
                 user=current_user, development=current_development())
    db.session.commit()
    return jsonify(fund.to_dict()), 201


@finance_bp.route('/funds/<int:fund_id>', methods=['PUT', 'PATCH'])
@require('funds', 'edit')
def update_fund(fund_id):
    fund, denied = owned(DevelopmentFund, fund_id)
    if denied:
        return denied

    payload = json_dict(request)
    previous = float(fund.balance or 0)

    if 'name' in payload:
        fund.name = clean_string(payload.get('name'), 120) or fund.name
    if 'fund_type' in payload:
        fund.fund_type = one_of(payload.get('fund_type'), FUND_TYPES, fund.fund_type)
    if 'balance' in payload:
        fund.balance = _decimal(payload.get('balance'), fund.balance)
    if 'target_balance' in payload:
        fund.target_balance = _decimal(payload.get('target_balance'))

    if float(fund.balance or 0) != previous:
        record_audit('MODIFY', 'Fund',
                     f'{fund.name} balance {previous:,.2f} -> {float(fund.balance or 0):,.2f}',
                     category='financial', user=current_user, development=current_development(),
                     before={'balance': previous}, after={'balance': float(fund.balance or 0)})

    db.session.commit()
    return jsonify(fund.to_dict())


# --- Export -----------------------------------------------------------------

@finance_bp.route('/export/arrears', methods=['GET'])
@require('finance', 'export')
def export_arrears():
    rows = ['Unit,Balance,Overdue,Days overdue,Invoices,Primary contact,Email,Phone']
    for entry in arrears().get_json()['arrears']:
        primary = next((owner for owner in entry['owners'] if owner['is_primary_contact']), None)
        rows.append(','.join([
            _csv(entry['unit_label']),
            f'{entry["balance"]:.2f}',
            f'{entry["overdue"]:.2f}',
            str(entry['days_overdue']),
            str(entry['invoice_count']),
            _csv(primary['name'] if primary else ''),
            _csv(primary['email'] if primary else ''),
            _csv(primary['phone'] if primary else ''),
        ]))

    development = current_development()
    return '\n'.join(rows), 200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': f'attachment; filename="{development.code}-arrears.csv"',
    }


# --- Shared -----------------------------------------------------------------

def _owner_contacts(unit):
    if unit is None:
        return []
    return [
        {
            'user_id': ownership.user_id,
            'name': ownership.user.name if ownership.user else None,
            'email': ownership.user.email if ownership.user else None,
            'phone': ownership.user.phone if ownership.user else None,
            'percent': float(ownership.ownership_percent or 0),
            'is_primary_contact': ownership.is_primary_contact,
        }
        for ownership in unit.ownerships
        if ownership.is_current
    ]


def _notify_owners(unit, invoice):
    """Tell the unit's current holders that an invoice has been issued."""
    development = current_development()
    for ownership in unit.ownerships:
        if not ownership.is_current or ownership.user is None:
            continue
        if ownership.user.status != 'active':
            continue
        notify(
            ownership.user,
            category='finance',
            title=f'New invoice — {invoice.title}',
            body=f'Rs {float(invoice.total_amount or 0):,.2f} is due on '
                 f'{invoice.due_date.strftime("%d %b %Y")}.',
            icon_key='file-text',
            link_path=f'/app/finance/invoices/{invoice.id}',
            development=development,
            whatsapp_template='invoice_notification',
        )


def _csv(value):
    text = str(value or '')
    if any(character in text for character in ',"\n'):
        return '"' + text.replace('"', '""') + '"'
    return text
