"""
Finance — balance, invoices, payments, statement. Co-owners only.

Every route resolves the caller's unit first and filters by it, so an invoice
id from another unit 404s rather than 403s: confirming that someone else's
invoice exists is itself a disclosure.

Taking payment is the one place in this app that moves money, so the order is
fixed and deliberate: authorise with the gateway *first*, and only write the
Payment row once it has succeeded. A ledger that records money we never
captured is worse than a failed payment, and the reverse order cannot be made
safe with a rollback once a real acquirer is behind the seam.
"""
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from io import BytesIO

from flask import Blueprint, jsonify, request, send_file
from flask_login import current_user

from ...extensions import db
from ...models.audit import record_audit
from ...models.billing import Invoice, Payment, PaymentMethod
from ...services import pdf as pdf_service
from ...services.ledger import (
    account_summary,
    allocate_payment,
    next_reference,
    open_invoices,
    statement,
    transactions,
)
from ...services.notifications import notify
from ...services.payment_gateway import get_gateway
from ...utils.validation import as_date, clean_string, json_dict, one_of
from ._access import feature_required, require_unit

finance_bp = Blueprint('resident_finance', __name__)

TRANSACTION_FILTERS = ['all', 'service_charges', 'payments', 'ev']
STATEMENT_PERIODS = ['3m', '6m', '12m', 'custom']


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _owner_name(unit):
    primary = next((link for link in unit.ownerships if link.is_primary_contact), None)
    if primary and primary.user:
        return primary.user.name
    return current_user.name


@finance_bp.route('/summary', methods=['GET'])
@feature_required('finance')
def summary():
    unit, error = require_unit()
    if error:
        return error
    return jsonify({
        'account': account_summary(unit.id),
        'open_invoices': [invoice.to_dict() for invoice in open_invoices(unit.id)],
    })


@finance_bp.route('/transactions', methods=['GET'])
@feature_required('finance')
def transaction_list():
    unit, error = require_unit()
    if error:
        return error

    kind = one_of(request.args.get('filter'), TRANSACTION_FILTERS, default='all')
    return jsonify({
        'filters': TRANSACTION_FILTERS,
        'filter': kind,
        'transactions': transactions(unit.id, kind=kind),
    })


@finance_bp.route('/invoices/<int:invoice_id>', methods=['GET'])
@feature_required('finance')
def invoice_detail(invoice_id):
    unit, error = require_unit()
    if error:
        return error

    invoice = _invoice_for_unit(invoice_id, unit)
    if invoice is None:
        return jsonify({'error': 'Invoice not found'}), 404

    return jsonify({'invoice': invoice.to_dict(include_lines=True, include_payments=True)})


@finance_bp.route('/invoices/<int:invoice_id>/pdf', methods=['GET'])
@feature_required('finance')
def invoice_pdf(invoice_id):
    unit, error = require_unit()
    if error:
        return error

    invoice = _invoice_for_unit(invoice_id, unit)
    if invoice is None:
        return jsonify({'error': 'Invoice not found'}), 404

    buffer = BytesIO()
    pdf_service.invoice_pdf(buffer, invoice, unit, unit.development, _owner_name(unit))
    buffer.seek(0)
    return send_file(
        buffer,
        mimetype='application/pdf',
        as_attachment=True,
        download_name=f'{invoice.reference}.pdf',
    )


@finance_bp.route('/invoices/<int:invoice_id>/dispute', methods=['POST'])
@feature_required('finance')
def dispute_invoice(invoice_id):
    unit, error = require_unit()
    if error:
        return error

    invoice = _invoice_for_unit(invoice_id, unit)
    if invoice is None:
        return jsonify({'error': 'Invoice not found'}), 404
    if invoice.is_settled:
        return jsonify({'error': 'This invoice is already settled'}), 409
    if invoice.status == 'disputed':
        return jsonify({'error': 'This invoice is already under dispute'}), 409

    reason = clean_string(json_dict(request).get('reason'), 1000)
    if not reason:
        return jsonify({'error': 'Tell your syndic manager what is being disputed'}), 400

    invoice.status = 'disputed'
    invoice.dispute_reason = reason
    invoice.disputed_at = _utcnow()

    notify(
        current_user,
        category='finance',
        title=f'Dispute raised — {invoice.reference}',
        body='Your syndic manager has been notified and will respond.',
        icon_key='triangle-alert',
        link_path=f'/app/finance/invoices/{invoice.id}',
        development=unit.development,
    )
    record_audit(
        'MODIFY', 'Invoice',
        f'{current_user.name} disputed {invoice.reference} for unit {unit.label}: {reason[:120]}',
        category='financial', user=current_user, development=unit.development,
        ip_address=request.remote_addr,
    )
    db.session.commit()

    return jsonify({'invoice': invoice.to_dict(include_lines=True, include_payments=True)})


@finance_bp.route('/payment-methods', methods=['GET'])
@feature_required('finance')
def payment_methods():
    methods = PaymentMethod.query.filter(
        PaymentMethod.user_id == current_user.id
    ).order_by(PaymentMethod.is_default.desc(), PaymentMethod.id).all()
    return jsonify({'payment_methods': [method.to_dict() for method in methods]})


@finance_bp.route('/payments', methods=['POST'])
@feature_required('finance')
def make_payment():
    unit, error = require_unit()
    if error:
        return error

    payload = json_dict(request)
    method = PaymentMethod.query.filter(
        PaymentMethod.id == payload.get('method_id'),
        PaymentMethod.user_id == current_user.id,
    ).first()
    if method is None:
        return jsonify({'error': 'Choose a payment method'}), 400

    targets = _payment_targets(payload.get('invoice_ids'), unit)
    if not targets:
        return jsonify({'error': 'There is nothing outstanding to pay'}), 409

    amount = sum((invoice.balance for invoice in targets), Decimal('0.00'))
    if amount <= 0:
        return jsonify({'error': 'There is nothing outstanding to pay'}), 409

    # Authorise before writing anything. A row for money we did not capture is
    # the one failure this module must not produce.
    gateway = get_gateway()
    result = gateway.charge(amount, method.label, {
        'unit': unit.label,
        'development': unit.development.name if unit.development else None,
        'invoices': [invoice.reference for invoice in targets],
    })
    if not result.ok:
        return jsonify({'error': result.failure_reason or 'The payment could not be processed'}), 402

    payment = Payment(
        development_id=unit.development_id,
        unit_id=unit.id,
        user_id=current_user.id,
        reference=next_reference(Payment, Payment.reference, 'PAY'),
        amount=amount,
        method_id=method.id,
        method_label=method.label,
        status='confirmed',
        gateway_name=gateway.name,
        gateway_reference=result.reference,
        paid_at=_utcnow(),
    )
    db.session.add(payment)
    db.session.flush()

    allocate_payment(payment, targets)

    notify(
        current_user,
        category='finance',
        title='Payment confirmed',
        body=f'Rs {float(amount):,.2f} received — {method.label}',
        icon_key='credit-card',
        link_path='/app/finance',
        development=unit.development,
        whatsapp_template='payment_receipt',
        whatsapp_body=(
            f'Payment received: Rs {float(amount):,.2f} for unit {unit.label}. '
            f'Reference {payment.reference}. Thank you.'
        ),
    )
    record_audit(
        'CREATE', 'Payment',
        f'{current_user.name} paid Rs {float(amount):,.2f} against '
        f'{len(targets)} invoice(s) for unit {unit.label}',
        category='financial', user=current_user, development=unit.development,
        ip_address=request.remote_addr,
    )
    db.session.commit()

    return jsonify({
        'payment': payment.to_dict(include_allocations=True),
        'account': account_summary(unit.id),
    }), 201


@finance_bp.route('/statement', methods=['GET'])
@feature_required('finance')
def statement_view():
    unit, error = require_unit()
    if error:
        return error

    period, start, end = _statement_range()
    return jsonify({
        'period': period,
        'periods': STATEMENT_PERIODS,
        'statement': statement(unit.id, start, end),
    })


@finance_bp.route('/statement/pdf', methods=['GET'])
@feature_required('finance')
def statement_pdf():
    unit, error = require_unit()
    if error:
        return error

    _period, start, end = _statement_range()
    data = statement(unit.id, start, end)

    buffer = BytesIO()
    pdf_service.statement_pdf(buffer, data, unit, unit.development, _owner_name(unit))
    buffer.seek(0)
    return send_file(
        buffer,
        mimetype='application/pdf',
        as_attachment=True,
        download_name=f'statement-{unit.label}-{end.isoformat()}.pdf',
    )


def _invoice_for_unit(invoice_id, unit):
    return Invoice.query.filter(
        Invoice.id == invoice_id,
        Invoice.unit_id == unit.id,
    ).first()


def _payment_targets(raw_ids, unit):
    """
    Which invoices this payment settles.

    With no ids the resident is paying everything outstanding — the default the
    Pay button uses. With ids, each is re-checked against the unit rather than
    trusted, and settled or cancelled ones are dropped silently because the
    client may be working from a stale list.
    """
    outstanding = open_invoices(unit.id)
    if not isinstance(raw_ids, list) or not raw_ids:
        return outstanding

    wanted = {value for value in raw_ids if isinstance(value, int)}
    return [invoice for invoice in outstanding if invoice.id in wanted]


def _statement_range():
    """Resolve the period selector into concrete dates."""
    today = date.today()
    period = one_of(request.args.get('period'), STATEMENT_PERIODS, default='3m')

    if period == 'custom':
        start = as_date(request.args.get('start'))
        end = as_date(request.args.get('end'))
        if start and end and start <= end:
            return period, start, end
        period = '3m'

    months = {'3m': 3, '6m': 6, '12m': 12}[period]
    return period, _months_ago(today, months), today


def _months_ago(anchor, months):
    """Step back whole months, clamping the day to the shorter month."""
    year = anchor.year
    month = anchor.month - months
    while month <= 0:
        month += 12
        year -= 1
    day = min(anchor.day, _days_in_month(year, month))
    return date(year, month, day)


def _days_in_month(year, month):
    next_month = date(year + (month == 12), (month % 12) + 1, 1)
    return (next_month - timedelta(days=1)).day
