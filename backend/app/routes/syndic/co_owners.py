"""
Co-owner accounts — the layer 2 to layer 3 handoff.

A syndic allocates accounts here exactly as the platform operator allocates
syndic accounts one level up: named, bound to a specific unit, revocable, and
written to the audit log at both ends.

Allocation is by invitation code, never by a password the syndic chooses. Three
reasons, in order of how much they matter:

* A password set by someone else is a password that person still knows. A
  co-owner account can read a financial history and cast a share-weighted vote;
  the manager who administers the building should not be able to sign in as an
  owner and do either.
* The code proves the email works before an account exists, so a typo produces
  an unredeemed invitation rather than an orphaned login.
* Nothing is created until the co-owner accepts, so a revoked invitation leaves
  no account to clean up.

Bulk import is the same path in a loop: it validates the whole file first and
imports nothing if any row is bad, because a half-imported building is worse
than a rejected file — the manager cannot tell which half.
"""
import csv
import io
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation

from flask import Blueprint, jsonify, request
from flask_login import current_user

from ...extensions import db
from ...models import Invitation, Unit, UnitOwnership, UnitTenancy, User
from ...models.audit import record_audit
from ...utils.validation import as_bool, as_int, clean_email, clean_string, json_dict
from ._access import (
    actor_label,
    current_development,
    current_development_id,
    is_impersonating,
    owned,
    require,
    scoped,
)

co_owners_bp = Blueprint('syndic_co_owners', __name__)

CSV_COLUMNS = ['unit', 'first_name', 'last_name', 'email', 'phone', 'ownership_percent']
MAX_IMPORT_ROWS = 1000


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


# --- Listing ----------------------------------------------------------------

@co_owners_bp.route('', methods=['GET'])
@require('co_owners', 'view')
def list_co_owners():
    development_id = current_development_id()

    accounts = User.query.filter(
        User.development_id == development_id,
        User.role == 'co_owner',
    ).order_by(User.first_name, User.last_name).all()

    search = clean_string(request.args.get('q'))
    if search:
        term = search.lower()
        accounts = [
            account for account in accounts
            if term in (account.name or '').lower()
            or term in (account.email or '').lower()
            or term in (account.unit_label or '').lower()
        ]

    invitations = Invitation.query.filter(
        Invitation.development_id == development_id,
    ).order_by(Invitation.created_at.desc()).all()

    units = scoped(Unit).order_by(Unit.label).all()
    held_unit_ids = {
        ownership.unit_id
        for unit in units
        for ownership in unit.ownerships
        if ownership.is_current
    }

    return jsonify({
        'co_owners': [_account_row(account) for account in accounts],
        'invitations': [_invitation_row(invitation) for invitation in invitations],
        'units': [
            {
                'id': unit.id,
                'label': unit.label,
                'unit_type': unit.unit_type,
                'share_value': unit.share_value,
                'has_owner': unit.id in held_unit_ids,
            }
            for unit in units
        ],
        'counts': {
            'accounts': len(accounts),
            'active': sum(1 for account in accounts if account.status == 'active'),
            'suspended': sum(1 for account in accounts if account.status == 'suspended'),
            'pending_invitations': sum(1 for row in invitations if row.is_usable),
            'units': len(units),
            'units_without_owner': len(units) - len(held_unit_ids),
        },
        'csv_columns': CSV_COLUMNS,
    })


def _account_row(account):
    ownerships = UnitOwnership.query.filter(
        UnitOwnership.user_id == account.id,
        UnitOwnership.end_date.is_(None),
    ).all()
    return {
        **account.to_dict(),
        'units': [
            {
                'unit_id': ownership.unit_id,
                'unit_label': ownership.unit.label if ownership.unit else None,
                'share_value': ownership.unit.share_value if ownership.unit else 0,
                'percent': float(ownership.ownership_percent or 0),
                'is_primary_contact': ownership.is_primary_contact,
            }
            for ownership in ownerships
        ],
    }


def _invitation_row(invitation):
    return {
        **invitation.to_dict(),
        'state': (
            'pending' if invitation.is_usable
            else invitation.status if invitation.status != 'pending'
            else 'expired'
        ),
    }


# --- Allocating one account -------------------------------------------------

@co_owners_bp.route('/invitations', methods=['POST'])
@require('co_owners', 'create')
def create_invitation():
    payload = json_dict(request)
    email = clean_email(payload.get('email'))
    unit_id = as_int(payload.get('unit_id'))

    if not email:
        return jsonify({'error': 'A valid email address is required'}), 400
    if not unit_id:
        return jsonify({'error': 'Choose the unit this co-owner holds'}), 400

    unit, denied = owned(Unit, unit_id)
    if denied:
        return jsonify({'error': 'That unit does not belong to this development'}), 404

    error = _guard_new_invitation(email, unit)
    if error:
        return error

    percent, percent_error = _ownership_percent(payload.get('ownership_percent'), unit)
    if percent_error:
        return percent_error

    invitation = _build_invitation(payload, email, unit, percent)
    db.session.add(invitation)
    record_audit(
        'CREATE', 'Invitation',
        f'Co-owner invitation issued for unit {unit.label} to {email}',
        category='roles', user=current_user, development=current_development(),
    )
    db.session.commit()

    return jsonify({'invitation': _invitation_row(invitation)}), 201


def _build_invitation(payload, email, unit, percent):
    return Invitation(
        development_id=unit.development_id,
        unit_id=unit.id,
        email=email,
        code=_unique_code(),
        role='co_owner',
        first_name=clean_string(payload.get('first_name'), 100),
        last_name=clean_string(payload.get('last_name'), 100),
        phone=clean_string(payload.get('phone'), 50),
        ownership_percent=percent,
        is_primary_contact=as_bool(payload.get('is_primary_contact'), True),
        invited_by_id=getattr(current_user, 'id', None),
        invited_by_label=actor_label(),
        expires_at=Invitation.default_expiry(),
    )


def _guard_new_invitation(email, unit):
    """Refuse an invitation that would collide with an account or another code."""
    existing = User.query.filter(User.email == email).first()
    if existing is not None:
        if existing.development_id == unit.development_id and existing.role == 'co_owner':
            return jsonify({
                'error': f'{email} already has a co-owner account here. '
                         f'Link it to {unit.label} from the account instead.',
            }), 409
        return jsonify({'error': 'That email address is already registered on the platform'}), 409

    open_invitation = Invitation.query.filter(
        Invitation.email == email,
        Invitation.development_id == unit.development_id,
        Invitation.status == 'pending',
    ).first()
    if open_invitation is not None and open_invitation.is_usable:
        return jsonify({
            'error': f'{email} already has an open invitation. Resend or revoke it first.',
        }), 409
    return None


def _ownership_percent(raw, unit):
    """
    Validate a share of title, refusing anything that over-allocates the unit.

    Joint ownership is normal — a couple holding 50/50 — but the percentages
    across current holders of one unit cannot exceed 100, or the unit's vote
    would be castable more than once.
    """
    try:
        percent = Decimal(str(raw)) if raw not in (None, '') else Decimal('100')
    except (InvalidOperation, ValueError):
        return None, (jsonify({'error': 'Ownership share must be a number'}), 400)

    if percent <= 0 or percent > 100:
        return None, (jsonify({'error': 'Ownership share must be between 1 and 100'}), 400)

    held = sum(
        (Decimal(str(ownership.ownership_percent or 0))
         for ownership in unit.ownerships if ownership.is_current),
        Decimal('0'),
    )
    pending = sum(
        (Decimal(str(row.ownership_percent or 0))
         for row in Invitation.query.filter(
             Invitation.unit_id == unit.id, Invitation.status == 'pending',
         ).all() if row.is_usable),
        Decimal('0'),
    )
    if held + pending + percent > 100:
        available = 100 - held - pending
        return None, (jsonify({
            'error': f'Unit {unit.label} has {available:.0f}% of its title unallocated. '
                     f'Reduce the share or release an existing holder.',
        }), 409)

    return percent, None


def _unique_code():
    for _ in range(20):
        code = Invitation.generate_code()
        if Invitation.query.filter(Invitation.code == code).first() is None:
            return code
    raise RuntimeError('Could not generate a unique invitation code')


@co_owners_bp.route('/invitations/<int:invitation_id>/resend', methods=['POST'])
@require('co_owners', 'edit')
def resend_invitation(invitation_id):
    """
    Re-issue a code on a fresh expiry.

    A new code rather than the old one: an invitation that needs resending has
    usually been sitting in an inbox, forwarded, or read aloud over a phone, and
    the failed-attempt counter it carries has already been spent.
    """
    invitation, denied = owned(Invitation, invitation_id)
    if denied:
        return denied
    if invitation.status == 'accepted':
        return jsonify({'error': 'That invitation has already been accepted'}), 409

    invitation.code = _unique_code()
    invitation.status = 'pending'
    invitation.attempts = 0
    invitation.expires_at = Invitation.default_expiry()
    invitation.invited_by_id = getattr(current_user, 'id', None)
    invitation.invited_by_label = actor_label()

    record_audit('MODIFY', 'Invitation',
                 f'Invitation re-issued to {invitation.email} for unit '
                 f'{invitation.unit.label if invitation.unit else "?"}',
                 category='roles', user=current_user, development=current_development())
    db.session.commit()
    return jsonify({'invitation': _invitation_row(invitation)})


@co_owners_bp.route('/invitations/<int:invitation_id>', methods=['DELETE'])
@require('co_owners', 'delete')
def revoke_invitation(invitation_id):
    invitation, denied = owned(Invitation, invitation_id)
    if denied:
        return denied
    if invitation.status == 'accepted':
        return jsonify({
            'error': 'That invitation was accepted. Suspend the account instead.',
        }), 409

    invitation.status = 'revoked'
    record_audit('DELETE', 'Invitation', f'Invitation to {invitation.email} revoked',
                 category='roles', user=current_user, development=current_development())
    db.session.commit()
    return jsonify({'ok': True})


# --- Bulk import ------------------------------------------------------------

@co_owners_bp.route('/invitations/import', methods=['POST'])
@require('co_owners', 'create')
def import_invitations():
    """
    Issue invitations from a CSV, all-or-nothing.

    `dry_run` returns the same validation report without writing, which is what
    the import screen shows before the manager commits. The onboarding checklist
    calls this step "Co-owner import (CSV: name, email, phone, unit, shares)".
    """
    payload = json_dict(request)
    raw = payload.get('csv')
    if isinstance(raw, str):
        text = raw
    elif 'file' in request.files:
        text = request.files['file'].read().decode('utf-8-sig', errors='replace')
    else:
        return jsonify({'error': 'Paste the CSV text or attach a file'}), 400

    rows, parse_error = _parse_csv(text)
    if parse_error:
        return parse_error

    valid, errors = _validate_import(rows)
    dry_run = as_bool(payload.get('dry_run'), False)

    if errors or dry_run:
        return jsonify({
            'imported': 0,
            'valid_count': len(valid),
            'errors': errors,
            'preview': _preview(valid),
            'dry_run': dry_run,
        }), 200 if dry_run or not errors else 422

    created = []
    for entry in valid:
        invitation = _build_invitation(
            {
                'first_name': entry['first_name'],
                'last_name': entry['last_name'],
                'phone': entry['phone'],
                'is_primary_contact': True,
            },
            entry['email'],
            entry['unit'],
            Decimal(str(entry['ownership_percent'])),
        )
        db.session.add(invitation)
        created.append(invitation)

    record_audit('CREATE', 'Invitation',
                 f'{len(created)} co-owner invitations issued from CSV import',
                 category='roles', user=current_user, development=current_development())
    db.session.commit()

    return jsonify({
        'imported': len(created),
        'valid_count': len(created),
        'errors': [],
        'invitations': [_invitation_row(invitation) for invitation in created],
    }), 201


def _parse_csv(text):
    text = (text or '').strip()
    if not text:
        return None, (jsonify({'error': 'The CSV is empty'}), 400)

    try:
        reader = csv.DictReader(io.StringIO(text))
        rows = list(reader)
    except csv.Error as error:
        return None, (jsonify({'error': f'That file is not readable as CSV: {error}'}), 400)

    if not rows:
        return None, (jsonify({'error': 'The CSV has a header but no rows'}), 400)
    if len(rows) > MAX_IMPORT_ROWS:
        return None, (jsonify({
            'error': f'Import at most {MAX_IMPORT_ROWS} rows at a time',
        }), 400)

    headers = {(name or '').strip().lower() for name in (reader.fieldnames or [])}
    missing = [column for column in ('unit', 'email') if column not in headers]
    if missing:
        return None, (jsonify({
            'error': f'The CSV must have a {" and ".join(missing)} column. '
                     f'Expected columns: {", ".join(CSV_COLUMNS)}.',
        }), 400)

    return rows, None


def _validate_import(rows):
    """
    Check every row against the registry and against the rest of the file.

    Duplicates inside the file are caught here too: two rows claiming the same
    email would otherwise pass individually and collide on commit.
    """
    units = {unit.label.lower(): unit for unit in scoped(Unit).all()}
    valid = []
    errors = []
    seen_emails = set()
    claimed = {}

    for index, row in enumerate(rows, start=2):  # row 1 is the header
        cleaned = {key.strip().lower(): (value or '').strip()
                   for key, value in row.items() if key}
        label = cleaned.get('unit', '')
        email = clean_email(cleaned.get('email'))

        if not label:
            errors.append({'row': index, 'message': 'Missing unit number'})
            continue
        if not email:
            errors.append({'row': index, 'message': f'"{cleaned.get("email", "")}" is not a valid email'})
            continue

        unit = units.get(label.lower())
        if unit is None:
            errors.append({'row': index, 'message': f'Unit {label} is not in this development'})
            continue
        if email in seen_emails:
            errors.append({'row': index, 'message': f'{email} appears more than once in this file'})
            continue

        collision = _guard_new_invitation(email, unit)
        if collision is not None:
            errors.append({'row': index, 'message': collision[0].get_json()['error']})
            continue

        try:
            percent = Decimal(cleaned.get('ownership_percent') or '100')
        except (InvalidOperation, ValueError):
            errors.append({'row': index, 'message': 'Ownership share must be a number'})
            continue
        if percent <= 0 or percent > 100:
            errors.append({'row': index, 'message': 'Ownership share must be between 1 and 100'})
            continue

        # Shares already claimed by earlier rows of this same file count too.
        already = claimed.get(unit.id, Decimal('0'))
        held = sum(
            (Decimal(str(ownership.ownership_percent or 0))
             for ownership in unit.ownerships if ownership.is_current),
            Decimal('0'),
        )
        if held + already + percent > 100:
            errors.append({
                'row': index,
                'message': f'Unit {unit.label} would be over-allocated past 100% of title',
            })
            continue
        claimed[unit.id] = already + percent

        seen_emails.add(email)
        valid.append({
            'row': index,
            'unit': unit,
            'unit_label': unit.label,
            'email': email,
            'first_name': cleaned.get('first_name') or None,
            'last_name': cleaned.get('last_name') or None,
            'phone': cleaned.get('phone') or None,
            'ownership_percent': float(percent),
        })

    return valid, errors


def _preview(entries, limit=25):
    """Strip the ORM object each validated row carries so it can be serialised."""
    return [
        {key: value for key, value in entry.items() if key != 'unit'}
        for entry in entries[:limit]
    ]


@co_owners_bp.route('/invitations/template', methods=['GET'])
@require('co_owners', 'view')
def import_template():
    """A CSV the manager can fill in, pre-populated with the unit numbers."""
    lines = [','.join(CSV_COLUMNS)]
    for unit in scoped(Unit).order_by(Unit.label).all():
        held = any(ownership.is_current for ownership in unit.ownerships)
        if held:
            continue
        lines.append(f'{unit.label},,,,,100')

    development = current_development()
    return '\n'.join(lines), 200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': f'attachment; filename="{development.code}-co-owner-import.csv"',
    }


# --- Managing an existing account -------------------------------------------

@co_owners_bp.route('/<int:user_id>', methods=['PUT', 'PATCH'])
@require('co_owners', 'edit')
def update_co_owner(user_id):
    account, error = _co_owner(user_id)
    if error:
        return error

    payload = json_dict(request)

    if 'status' in payload:
        status = clean_string(payload.get('status'))
        if status not in ('active', 'suspended'):
            return jsonify({'error': 'A co-owner account is either active or suspended'}), 400
        if status != account.status:
            record_audit('MODIFY', 'User', f'{account.name} set to {status}',
                         category='roles', user=current_user, development=current_development())
        account.status = status

    for field, length in (('first_name', 100), ('last_name', 100), ('phone', 50)):
        if field in payload:
            setattr(account, field, clean_string(payload.get(field), length))

    if 'whatsapp_enabled' in payload:
        account.whatsapp_enabled = as_bool(payload.get('whatsapp_enabled'), account.whatsapp_enabled)

    db.session.commit()
    return jsonify(_account_row(account))


@co_owners_bp.route('/<int:user_id>/units', methods=['POST'])
@require('co_owners', 'edit')
def link_unit(user_id):
    """Link an existing co-owner to another unit — a second flat, or a purchase."""
    account, error = _co_owner(user_id)
    if error:
        return error

    payload = json_dict(request)
    unit, denied = owned(Unit, as_int(payload.get('unit_id')))
    if denied:
        return jsonify({'error': 'That unit does not belong to this development'}), 404

    if UnitOwnership.query.filter(
        UnitOwnership.unit_id == unit.id,
        UnitOwnership.user_id == account.id,
        UnitOwnership.end_date.is_(None),
    ).first():
        return jsonify({'error': f'{account.name} already holds unit {unit.label}'}), 409

    percent, percent_error = _ownership_percent(payload.get('ownership_percent'), unit)
    if percent_error:
        return percent_error

    db.session.add(UnitOwnership(
        unit_id=unit.id,
        user_id=account.id,
        ownership_percent=percent,
        is_primary_contact=as_bool(payload.get('is_primary_contact'), False),
        start_date=date.today(),
    ))
    if not account.unit_label:
        account.unit_label = unit.label

    record_audit('MODIFY', 'User', f'{account.name} linked to unit {unit.label} at {percent}%',
                 category='roles', user=current_user, development=current_development())
    db.session.commit()
    return jsonify(_account_row(account)), 201


@co_owners_bp.route('/<int:user_id>/units/<int:unit_id>', methods=['DELETE'])
@require('co_owners', 'edit')
def release_unit(user_id, unit_id):
    """
    End an ownership without deleting it.

    A sale is a dated event, not an erasure: the votes this holder cast and the
    invoices raised against them while they held title stay attributable.
    """
    account, error = _co_owner(user_id)
    if error:
        return error

    ownership = UnitOwnership.query.filter(
        UnitOwnership.unit_id == unit_id,
        UnitOwnership.user_id == account.id,
        UnitOwnership.end_date.is_(None),
    ).first()
    if ownership is None:
        return jsonify({'error': 'That co-owner does not currently hold this unit'}), 404

    ownership.end_date = date.today()
    record_audit('MODIFY', 'User',
                 f'{account.name} released unit {ownership.unit.label if ownership.unit else unit_id}',
                 category='roles', user=current_user, development=current_development())
    db.session.commit()
    return jsonify(_account_row(account))


@co_owners_bp.route('/<int:user_id>', methods=['DELETE'])
@require('co_owners', 'delete')
def delete_co_owner(user_id):
    """
    Remove an account that never had any activity.

    Anything with a payment, a vote or a request against it is suspended
    instead — deleting it would leave those rows pointing at nobody.
    """
    account, error = _co_owner(user_id)
    if error:
        return error
    if is_impersonating():
        return jsonify({'error': 'A support session cannot delete a client account'}), 403

    from ...models import MaintenanceRequest, Payment, Vote

    has_history = (
        Payment.query.filter(Payment.user_id == account.id).count()
        or Vote.query.filter(Vote.user_id == account.id).count()
        or MaintenanceRequest.query.filter(MaintenanceRequest.reported_by_id == account.id).count()
    )
    if has_history:
        return jsonify({
            'error': 'This co-owner has payment, voting or maintenance history. '
                     'Suspend the account instead so those records stay attributable.',
        }), 409

    name = account.name
    UnitOwnership.query.filter(UnitOwnership.user_id == account.id).delete()
    UnitTenancy.query.filter(UnitTenancy.user_id == account.id).update({'user_id': None})
    db.session.delete(account)
    record_audit('DELETE', 'User', f'Co-owner account {name} removed',
                 category='roles', user=current_user, development=current_development())
    db.session.commit()
    return jsonify({'ok': True})


def _co_owner(user_id):
    account = db.session.get(User, user_id)
    if (
        account is None
        or account.role != 'co_owner'
        or account.development_id != current_development_id()
    ):
        return None, (jsonify({'error': 'Co-owner not found'}), 404)
    return account, None


# --- Occupancy (no login) ---------------------------------------------------

@co_owners_bp.route('/occupancy', methods=['GET'])
@require('co_owners', 'view')
def list_occupancy():
    """
    Who lives in a unit its owner does not occupy.

    These are records, not accounts. Logins belong to co-owners; the syndic
    still needs a name and number for maintenance access, gate passes and an
    evacuation list.
    """
    unit_ids = [unit.id for unit in scoped(Unit).all()]
    tenancies = UnitTenancy.query.filter(
        UnitTenancy.unit_id.in_(unit_ids or [0]),
    ).order_by(UnitTenancy.is_current.desc(), UnitTenancy.id.desc()).all()
    return jsonify({'occupancy': [tenancy.to_dict() for tenancy in tenancies]})


@co_owners_bp.route('/occupancy', methods=['POST'])
@require('co_owners', 'create')
def create_occupancy():
    payload = json_dict(request)
    unit, denied = owned(Unit, as_int(payload.get('unit_id')))
    if denied:
        return jsonify({'error': 'That unit does not belong to this development'}), 404

    name = clean_string(payload.get('occupant_name'), 150)
    if not name:
        return jsonify({'error': "The occupant's name is required"}), 400

    tenancy = UnitTenancy(
        unit_id=unit.id,
        occupant_name=name,
        occupant_email=clean_email(payload.get('occupant_email')),
        occupant_phone=clean_string(payload.get('occupant_phone'), 50),
        lease_start_date=_as_date(payload.get('lease_start_date')),
        lease_end_date=_as_date(payload.get('lease_end_date')),
        is_current=True,
    )
    db.session.add(tenancy)
    record_audit('CREATE', 'Occupancy', f'{name} recorded as occupying unit {unit.label}',
                 category='config', user=current_user, development=current_development())
    db.session.commit()
    return jsonify(tenancy.to_dict()), 201


@co_owners_bp.route('/occupancy/<int:tenancy_id>', methods=['PUT', 'PATCH'])
@require('co_owners', 'edit')
def update_occupancy(tenancy_id):
    tenancy, error = _occupancy(tenancy_id)
    if error:
        return error

    payload = json_dict(request)
    if 'occupant_name' in payload:
        tenancy.occupant_name = clean_string(payload.get('occupant_name'), 150)
    if 'occupant_email' in payload:
        tenancy.occupant_email = clean_email(payload.get('occupant_email'))
    if 'occupant_phone' in payload:
        tenancy.occupant_phone = clean_string(payload.get('occupant_phone'), 50)
    for field in ('lease_start_date', 'lease_end_date'):
        if field in payload:
            setattr(tenancy, field, _as_date(payload.get(field)))
    if 'is_current' in payload:
        tenancy.is_current = as_bool(payload.get('is_current'), tenancy.is_current)

    db.session.commit()
    return jsonify(tenancy.to_dict())


@co_owners_bp.route('/occupancy/<int:tenancy_id>', methods=['DELETE'])
@require('co_owners', 'delete')
def delete_occupancy(tenancy_id):
    tenancy, error = _occupancy(tenancy_id)
    if error:
        return error
    db.session.delete(tenancy)
    db.session.commit()
    return jsonify({'ok': True})


def _occupancy(tenancy_id):
    tenancy = db.session.get(UnitTenancy, tenancy_id)
    if tenancy is None or tenancy.unit is None or tenancy.unit.development_id != current_development_id():
        return None, (jsonify({'error': 'Occupancy record not found'}), 404)
    return tenancy, None


def _as_date(value):
    from ...utils.validation import as_date

    return as_date(value)
