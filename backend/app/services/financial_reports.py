"""Financial-document snapshots and PDF renderer."""
import hashlib
import json
from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from ..extensions import db
from ..models import BankTransaction, Expense, FinancialBudgetLine, Invoice, Payment, Unit
from .ledger import statement

ZERO = Decimal('0.00')
styles = getSampleStyleSheet()
TITLE = ParagraphStyle('financialTitle', parent=styles['Title'], fontSize=18, textColor=colors.HexColor('#1f262e'))
BODY = ParagraphStyle('financialBody', parent=styles['BodyText'], fontSize=8, leading=11)
SECTION = ParagraphStyle('financialSection', parent=styles['Heading2'], fontSize=10, textColor=colors.HexColor('#047857'))


def money(value):
    return f'Rs {float(value or 0):,.2f}'


def iso(value):
    return value.isoformat() if value else None


def owner_name(unit):
    link = next((row for row in unit.ownerships if row.is_primary_contact), None)
    return link.user.name if link and link.user else 'Co-owner'


def period_dates(period):
    year, month = map(int, period.split('-'))
    start = date(year, month, 1)
    end = date(year + (month == 12), month % 12 + 1, 1)
    return start, end


def _rows(items):
    return [[str(value) for value in row] for row in items]


def build_snapshot(kind, development, payload):
    """Build only JSON-native values, so the issued result is immutable."""
    if kind == 'statement':
        unit = db.session.get(Unit, int(payload['unit_id']))
        start = date.fromisoformat(payload.get('start') or f'{date.today().year}-01-01')
        end = date.fromisoformat(payload.get('end') or date.today().isoformat())
        data = statement(unit.id, start, end)
        return {
            'title': 'Statement of account', 'reference_label': unit.label,
            'period': f'{start.isoformat()} to {end.isoformat()}',
            'summary': [['Co-owner', owner_name(unit)], ['Unit', unit.label],
                        ['Opening balance', money(data['opening_balance'])],
                        ['Closing balance', money(data['closing_balance'])]],
            'sections': [{'title': 'Movements', 'headers': ['Date', 'Reference', 'Description', 'Debit', 'Credit', 'Balance'],
                          'rows': [[row['date'], row['reference'], row['description'],
                                    money(row['debit']) if row['debit'] else '',
                                    money(row['credit']) if row['credit'] else '',
                                    money(row['balance'])] for row in data['rows']]}],
        }

    if kind == 'receipt':
        payment = db.session.get(Payment, int(payload['payment_id']))
        unit = payment.unit
        allocations = [[a.invoice.reference, a.invoice.title, money(a.amount)]
                       for a in payment.allocations if a.invoice]
        return {
            'title': 'Payment receipt', 'reference_label': payment.reference,
            'period': iso(payment.paid_at.date() if payment.paid_at else None),
            'summary': [['Received from', owner_name(unit)], ['Unit', unit.label],
                        ['Amount received', money(payment.amount)], ['Method', payment.method_label or 'Bank transfer'],
                        ['Bank reference', payment.gateway_reference or '-']],
            'sections': [{'title': 'Invoices settled', 'headers': ['Invoice', 'Description', 'Allocated'], 'rows': allocations}],
        }

    if kind == 'expense_voucher':
        expense = db.session.get(Expense, int(payload['expense_id']))
        bank = expense.bank_transaction
        return {
            'title': 'Expense payment voucher', 'reference_label': f'EXP-{expense.id:05d}',
            'period': iso(expense.expense_date),
            'summary': [['Category', expense.chart_account.name], ['Amount', money(expense.amount)],
                        ['Description', expense.description], ['Vendor', expense.vendor.name if expense.vendor else '-'],
                        ['Reconciliation', expense.reconciliation_status.title()]],
            'sections': [{'title': 'Bank evidence', 'headers': ['Date', 'Narrative', 'Debit', 'Status'],
                          'rows': [[iso(bank.transaction_date), bank.narrative or '-', money(bank.debit_amount),
                                    bank.match_status.title()]] if bank else [['-', 'No bank line linked', '', 'Suggested']]}],
        }

    if kind == 'levy_notice':
        invoice = db.session.get(Invoice, int(payload['invoice_id']))
        if invoice.invoice_type != 'special_levy':
            raise ValueError('A levy notice can only be issued for a special-levy invoice.')
        return {
            'title': 'Call for funds notice', 'reference_label': invoice.reference,
            'period': iso(invoice.due_date),
            'summary': [['Co-owner', owner_name(invoice.unit)], ['Unit', invoice.unit.label],
                        ['Reason', invoice.title], ['Contribution due', money(invoice.total_amount)],
                        ['Due date', iso(invoice.due_date)], ['Balance outstanding', money(invoice.balance)]],
            'sections': [{'title': 'Payment instructions', 'headers': ['Bank account', 'Reference', 'Amount'],
                          'rows': [['SBM Operating Account', invoice.reference, money(invoice.balance)]]}],
        }

    if kind in ('monthly_report', 'bank_reconciliation', 'budget_actual', 'agm_pack'):
        period = payload.get('period') or '2025-12'
        start, end_exclusive = period_dates(period)
        expenses = Expense.query.filter(Expense.development_id == development.id,
            Expense.expense_date >= start, Expense.expense_date < end_exclusive).all()
        payments = Payment.query.filter(Payment.development_id == development.id,
            Payment.status == 'confirmed', Payment.paid_at >= datetime.combine(start, datetime.min.time()),
            Payment.paid_at < datetime.combine(end_exclusive, datetime.min.time())).all()
        invoices = Invoice.query.filter(Invoice.development_id == development.id,
            Invoice.issue_date >= start, Invoice.issue_date < end_exclusive).all()
        bank = BankTransaction.query.filter(BankTransaction.development_id == development.id,
            BankTransaction.transaction_date >= start, BankTransaction.transaction_date < end_exclusive).all()
        by_account = defaultdict(Decimal)
        for expense in expenses:
            by_account[expense.chart_account.name] += Decimal(str(expense.amount or 0))
        collected = sum((Decimal(str(row.amount or 0)) for row in payments), ZERO)
        billed = sum((Decimal(str(row.total_amount or 0)) for row in invoices), ZERO)
        spent = sum(by_account.values(), ZERO)
        unmatched = [row for row in bank if row.match_status != 'matched']

        if kind == 'bank_reconciliation':
            opening = next((row.running_balance for row in sorted(bank, key=lambda x: x.transaction_date)
                            if row.running_balance is not None), None)
            closing = next((row.running_balance for row in sorted(bank, key=lambda x: x.transaction_date, reverse=True)
                            if row.running_balance is not None), None)
            return {
                'title': 'Bank reconciliation report', 'reference_label': period, 'period': period,
                'summary': [['Bank lines', len(bank)], ['Matched lines', len(bank) - len(unmatched)],
                            ['Unmatched lines', len(unmatched)], ['Opening balance', money(opening)],
                            ['Closing balance', money(closing)]],
                'sections': [{'title': 'Unmatched bank lines', 'headers': ['Date', 'Narrative', 'Debit', 'Credit', 'Status'],
                              'rows': [[iso(row.transaction_date), row.narrative or '-', money(row.debit_amount),
                                        money(row.credit_amount), row.match_status] for row in unmatched]}],
            }

        budgets = {row.chart_account.name: Decimal(str(row.amount or 0)) for row in FinancialBudgetLine.query.filter_by(development_id=development.id, period_year=start.year).all()}
        category_rows = [[name, money(amount), money(budgets.get(name, ZERO)), money(amount - budgets.get(name, ZERO))] for name, amount in sorted(by_account.items())]
        for name, amount in sorted(budgets.items()):
            if name not in by_account:
                category_rows.append([name, money(ZERO), money(amount), money(-amount)])
        if kind == 'budget_actual':
            return {
                'title': 'Budget versus actual report', 'reference_label': period, 'period': period,
                'summary': [['Actual operating spend', money(spent)], ['Approved budget', money(sum(budgets.values(), ZERO))]],
                'sections': [{'title': 'Expense variance', 'headers': ['Category', 'Actual', 'Budget', 'Variance'],
                              'rows': category_rows}],
            }

        management = {
            'title': 'Monthly syndic financial report' if kind == 'monthly_report' else 'AGM financial pack',
            'reference_label': period if kind == 'monthly_report' else start.year, 'period': period,
            'summary': [['Contributions billed', money(billed)], ['Receipts collected', money(collected)],
                        ['Operating expenses', money(spent)], ['Bank lines', len(bank)],
                        ['Unmatched bank lines', len(unmatched)]],
            'sections': [
                {'title': 'Expenses by category', 'headers': ['Category', 'Amount'],
                 'rows': [[name, money(amount)] for name, amount in sorted(by_account.items())]},
                {'title': 'Collection and reconciliation', 'headers': ['Measure', 'Value'],
                 'rows': [['Invoices issued', len(invoices)], ['Payments received', len(payments)],
                          ['Unmatched bank lines', len(unmatched)]]},
            ],
        }
        if kind == 'agm_pack':
            management['sections'].append({
                'title': 'Important note', 'headers': ['Scope'],
                'rows': [['Management pack generated from the platform ledger. The supplied final-account workbook remains the formal reporting authority.']],
            })
        return management

    raise ValueError('Unsupported financial document type.')


def render_pdf(buffer_target, development, document):
    page = SimpleDocTemplate(buffer_target, pagesize=A4, leftMargin=16*mm, rightMargin=16*mm, topMargin=15*mm, bottomMargin=15*mm)
    story = [Paragraph(development.name, TITLE), Paragraph(document['title'], SECTION),
             Paragraph(f"Reference: {document['reference']} ? Period: {document.get('period') or '-'} ? Issued: {document['issued_at']}", BODY), Spacer(1, 8)]
    summary = Table(_rows(document['snapshot'].get('summary', [])), colWidths=[48*mm, 118*mm])
    summary.setStyle(TableStyle([('GRID',(0,0),(-1,-1),0.25,colors.HexColor('#d1d5db')),('BACKGROUND',(0,0),(0,-1),colors.HexColor('#f1f5f9')),('FONTNAME',(0,0),(0,-1),'Helvetica-Bold'),('FONTSIZE',(0,0),(-1,-1),8),('PADDING',(0,0),(-1,-1),5)]))
    story += [summary, Spacer(1, 10)]
    for section in document['snapshot'].get('sections', []):
        story.append(Paragraph(section['title'], SECTION))
        rows = [section.get('headers', [])] + section.get('rows', [])
        if len(rows) == 1:
            rows.append(['No entries for this document period.'])
        table = Table(_rows(rows), repeatRows=1)
        table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#e2e8f0')),('FONTNAME',(0,0),(-1,0),'Helvetica-Bold'),('FONTSIZE',(0,0),(-1,-1),7),('GRID',(0,0),(-1,-1),0.2,colors.HexColor('#cbd5e1')),('VALIGN',(0,0),(-1,-1),'TOP'),('PADDING',(0,0),(-1,-1),4)]))
        story += [table, Spacer(1, 8)]
    page.build(story)
    return buffer_target


def snapshot_hash(snapshot):
    return hashlib.sha256(json.dumps(snapshot, sort_keys=True, ensure_ascii=False).encode('utf-8')).hexdigest()

