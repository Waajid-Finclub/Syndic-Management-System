#!/usr/bin/env python3
"""
Smoke test for the three-layer account chain and the syndic console API.

Run against a fresh baseline:

    python seed.py --reset
    python tests/test_syndic_api.py

What it proves, in order:

0. The fresh baseline contains only the three login accounts used for staging access.
1. Layer isolation — each of the three login endpoints accepts only its own
   layer's accounts and refuses the other two.
2. The allocation chain — an operator provisions a client admin against the
   subscription's seat allowance; that admin invites a co-owner against a unit;
   the co-owner registers with the code and lands on that unit.
3. Development scoping — a syndic account sees only its own development, and a
   record id from another one 404s rather than 403s.
4. The finance loop — a billing run raises invoices, a receipt allocates against
   them oldest-first, and the resulting balance matches on both sides.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app  # noqa: E402
from app.extensions import db  # noqa: E402
from app.models import Development, Subscription, SubscriptionPlan, Unit, User  # noqa: E402

PASSED = []
FAILED = []

BASELINE_EMAILS = {
    'admin@syndicms.mu',
    'manager@syndicms.mu',
    'coowner@syndicms.mu',
}
TEST_FINANCE_EMAIL = 'provisioned.officer@example.test'
TEST_BOARD_EMAIL = 'provisioned.board@example.test'
TEST_ADMIN_PASSWORD = 'ProvisionTest2026!'


def check(name, condition, detail=''):
    if condition:
        PASSED.append(name)
        print(f'  PASS  {name}')
    else:
        FAILED.append((name, detail))
        print(f'  FAIL  {name}   {detail}')


class Session:
    """A test client that carries the cookie jar and the CSRF token."""

    def __init__(self, app):
        self.client = app.test_client()
        self.token = None

    def csrf(self):
        if self.token is None:
            self.token = self.client.get('/api/auth/csrf-token').get_json()['csrf_token']
        return self.token

    def get(self, path):
        return self.client.get(path)

    def post(self, path, payload=None):
        return self.client.post(path, json=payload or {},
                                headers={'X-CSRF-Token': self.csrf()})

    def patch(self, path, payload=None):
        return self.client.patch(path, json=payload or {},
                                 headers={'X-CSRF-Token': self.csrf()})

    def delete(self, path):
        return self.client.delete(path, headers={'X-CSRF-Token': self.csrf()})


def main():
    app = create_app()
    with app.app_context():
        if User.query.filter(User.role == 'super_admin').first() is None:
            print('No baseline found. Run `python seed.py --reset` first.')
            return 1

        print('\n0. Seeded accounts')
        test_seeded_accounts()

        print('\n1. Layer isolation')
        test_layer_isolation(app)

        print('\n2. Operator provisions a client admin (layer 1 -> layer 2)')
        client = test_provisioning(app)

        print('\n3. Syndic scoping')
        test_scoping(app)

        print('\n4. Syndic invites a co-owner (layer 2 -> layer 3)')
        test_invitation(app)

        print('\n5. Billing run and receipt')
        test_finance(app)

    print(f'\n{len(PASSED)} passed, {len(FAILED)} failed')
    for name, detail in FAILED:
        print(f'  - {name}: {detail}')
    return 1 if FAILED else 0


def test_seeded_accounts():
    emails = {email for (email,) in db.session.query(User.email).all()}
    check('fresh baseline seeds only the three login accounts',
          emails == BASELINE_EMAILS, str(sorted(emails)))


def test_layer_isolation(app):
    cases = [
        ('/api/auth/login', 'admin@syndicms.mu', 'AdminConsole2026!', 200, 'operator at master login'),
        ('/api/auth/login', 'manager@syndicms.mu', 'SyndicAdmin2026!', 403, 'syndic at master login'),
        ('/api/auth/login', 'coowner@syndicms.mu', 'ResidentApp2026!', 403, 'co-owner at master login'),
        ('/api/syndic/auth/login', 'manager@syndicms.mu', 'SyndicAdmin2026!', 200, 'syndic at syndic login'),
        ('/api/syndic/auth/login', 'admin@syndicms.mu', 'AdminConsole2026!', 403, 'operator at syndic login'),
        ('/api/syndic/auth/login', 'coowner@syndicms.mu', 'ResidentApp2026!', 403, 'co-owner at syndic login'),
        ('/api/resident/auth/login', 'coowner@syndicms.mu', 'ResidentApp2026!', 200, 'co-owner at resident login'),
        ('/api/resident/auth/login', 'manager@syndicms.mu', 'SyndicAdmin2026!', 403, 'syndic at resident login'),
        ('/api/resident/auth/login', 'admin@syndicms.mu', 'AdminConsole2026!', 403, 'operator at resident login'),
    ]
    for path, email, password, expected, label in cases:
        session = Session(app)
        response = session.post(path, {'email': email, 'password': password})
        check(label, response.status_code == expected,
              f'expected {expected}, got {response.status_code}')


def test_provisioning(app):
    session = Session(app)
    session.post('/api/auth/login', {'email': 'admin@syndicms.mu', 'password': 'AdminConsole2026!'})

    listing = session.get('/api/client-admins/').get_json()
    check('operator can list client admins', 'clients' in listing, str(listing)[:120])

    client = listing['clients'][0]
    development_id = client['development']['id']
    seats = client['seats']
    check('starter client has a seat allowance', seats['allowed'] > 0, str(seats))
    check('starter client already has a manager', seats['has_manager'], str(seats))

    created = session.post(f'/api/client-admins/{development_id}', {
        'first_name': 'Provisioned',
        'last_name': 'Officer',
        'email': TEST_FINANCE_EMAIL,
        'role': 'finance_officer',
        'password': TEST_ADMIN_PASSWORD,
    })
    check('operator provisions a second admin', created.status_code == 201,
          str(created.get_json())[:160])

    if created.status_code == 201:
        new_seats = created.get_json()['seats']
        check('seat usage went up', new_seats['used'] == seats['used'] + 1,
              f'{seats["used"]} -> {new_seats["used"]}')

    # Squeeze the allowance down to what is in use, then try to exceed it.
    in_use = seat_state_used(development_id)
    session.patch(f'/api/client-admins/{development_id}/seats', {'admin_seats': in_use})
    blocked = session.post(f'/api/client-admins/{development_id}', {
        'first_name': 'Over',
        'last_name': 'Cap',
        'email': 'over.cap@example.test',
        'role': 'assistant_manager',
        'password': TEST_ADMIN_PASSWORD,
    })
    check('seat cap refuses an extra account', blocked.status_code == 409,
          str(blocked.get_json())[:160])

    # A co-owner cannot be created from the operator console at all.
    refused = session.post('/api/users/', {
        'first_name': 'Direct',
        'email': 'direct.coowner@example.test',
        'role': 'co_owner',
        'development_id': development_id,
    })
    check('operator cannot create a co-owner directly', refused.status_code == 400,
          str(refused.get_json())[:160])

    refused_syndic = session.post('/api/users/', {
        'first_name': 'Direct',
        'email': 'direct.syndic@example.test',
        'role': 'syndic_manager',
        'password': TEST_ADMIN_PASSWORD,
        'development_id': development_id,
    })
    check('operator cannot bypass the seat check via /api/users',
          refused_syndic.status_code == 400, str(refused_syndic.get_json())[:160])

    # Restore headroom for the permission-matrix checks below.
    session.patch(f'/api/client-admins/{development_id}/seats', {'admin_seats': None})
    board = session.post(f'/api/client-admins/{development_id}', {
        'first_name': 'Provisioned',
        'last_name': 'Board',
        'email': TEST_BOARD_EMAIL,
        'role': 'board_member',
        'password': TEST_ADMIN_PASSWORD,
    })
    check('operator provisions a board member for permission checks', board.status_code == 201,
          str(board.get_json())[:160])
    return development_id


def seat_state_used(development_id):
    from app.routes.client_admins import seat_state

    development = db.session.get(Development, development_id)
    return seat_state(development)['used']


def test_scoping(app):
    # A second development, so "another client's record" actually exists.
    other = Development.query.filter(Development.code == 'OTHER-TEST').first()
    if other is None:
        other = Development(code='OTHER-TEST', name='Other Residence', status='active')
        db.session.add(other)
        db.session.flush()
        db.session.add(Unit(development_id=other.id, label='Z-999', share_value=10000))
        plan = SubscriptionPlan.query.first()
        if plan is not None:
            db.session.add(Subscription(development_id=other.id, plan_id=plan.id,
                                        monthly_unit_rate=plan.monthly_unit_rate,
                                        status='active', active_units_count=1))
        db.session.commit()

    foreign_unit = Unit.query.filter(Unit.development_id == other.id).first()

    session = Session(app)
    session.post('/api/syndic/auth/login',
                 {'email': 'manager@syndicms.mu', 'password': 'SyndicAdmin2026!'})

    units = session.get('/api/syndic/registry/units').get_json()
    labels = {unit['label'] for unit in units['units']}
    check('syndic sees only its own units', 'Z-999' not in labels and 'A-101' in labels,
          str(sorted(labels)))
    check('share total reconciles to 10,000', units['shares']['is_balanced'],
          str(units['shares']))

    response = session.get(f'/api/syndic/registry/units/{foreign_unit.id}')
    check("another client's unit 404s rather than 403s", response.status_code == 404,
          f'got {response.status_code}')

    # Read-only roles must be refused writes by the matrix, not by the UI.
    board = Session(app)
    board.post('/api/syndic/auth/login',
               {'email': TEST_BOARD_EMAIL, 'password': TEST_ADMIN_PASSWORD})
    denied = board.post('/api/syndic/registry/units', {'label': 'X-1', 'share_value': 0})
    check('board member cannot create a unit', denied.status_code == 403,
          f'got {denied.status_code}')
    allowed = board.get('/api/syndic/governance/meetings')
    check('board member can read governance', allowed.status_code == 200,
          f'got {allowed.status_code}')

    finance = Session(app)
    finance.post('/api/syndic/auth/login',
                 {'email': TEST_FINANCE_EMAIL, 'password': TEST_ADMIN_PASSWORD})
    denied_meeting = finance.post('/api/syndic/governance/meetings',
                                  {'title': 'X', 'scheduled_for': '2026-12-01T10:00'})
    check('finance officer cannot call a meeting', denied_meeting.status_code == 403,
          f'got {denied_meeting.status_code}')


def test_invitation(app):
    session = Session(app)
    session.post('/api/syndic/auth/login',
                 {'email': 'manager@syndicms.mu', 'password': 'SyndicAdmin2026!'})

    listing = session.get('/api/syndic/co-owners').get_json()
    vacant = next((unit for unit in listing['units'] if not unit['has_owner']), None)
    check('a vacant unit is available to allocate', vacant is not None, str(listing['counts']))
    if vacant is None:
        return

    created = session.post('/api/syndic/co-owners/invitations', {
        'email': 'new.owner@example.test',
        'unit_id': vacant['id'],
        'first_name': 'New',
        'last_name': 'Owner',
        'ownership_percent': 100,
    })
    check('syndic issues an invitation', created.status_code == 201,
          str(created.get_json())[:160])
    if created.status_code != 201:
        return

    code = created.get_json()['invitation']['code']

    duplicate = session.post('/api/syndic/co-owners/invitations', {
        'email': 'new.owner@example.test',
        'unit_id': vacant['id'],
    })
    check('a second open invitation is refused', duplicate.status_code == 409,
          str(duplicate.get_json())[:160])

    over = session.post('/api/syndic/co-owners/invitations', {
        'email': 'joint.owner@example.test',
        'unit_id': vacant['id'],
        'ownership_percent': 50,
    })
    check('over-allocating a unit past 100% is refused', over.status_code == 409,
          str(over.get_json())[:160])

    # The co-owner redeems the code on the resident app.
    resident = Session(app)
    wrong_email = resident.post('/api/resident/auth/verify-invitation',
                                {'code': code, 'email': 'someone.else@example.test'})
    check('a code with the wrong email is refused', wrong_email.status_code == 404,
          f'got {wrong_email.status_code}')

    registered = resident.post('/api/resident/auth/register', {
        'code': code,
        'email': 'new.owner@example.test',
        'password': 'NewOwnerPass2026!',
        'first_name': 'New',
        'last_name': 'Owner',
    })
    check('co-owner registers with the code', registered.status_code == 201,
          str(registered.get_json())[:160])

    if registered.status_code == 201:
        payload = registered.get_json()
        check('the new account is bound to the invited unit',
              payload['unit'] and payload['unit']['label'] == vacant['label'],
              str(payload.get('unit'))[:160])
        check('the new account is a co-owner with finance and voting',
              payload['user']['features']['finance'] and payload['user']['features']['voting'],
              str(payload['user']['features']))

    reused = Session(app).post('/api/resident/auth/register', {
        'code': code,
        'email': 'new.owner@example.test',
        'password': 'AnotherPass2026!',
    })
    check('an accepted code cannot be reused', reused.status_code == 404,
          f'got {reused.status_code}')


def test_finance(app):
    session = Session(app)
    session.post('/api/syndic/auth/login',
                 {'email': 'manager@syndicms.mu', 'password': 'SyndicAdmin2026!'})

    # Give the units a charge so a run has something to raise.
    units = session.get('/api/syndic/registry/units').get_json()['units']
    for unit in units:
        session.patch(f'/api/syndic/registry/units/{unit["id"]}', {'monthly_charge': 5000})

    preview = session.post('/api/syndic/finance/billing-runs/preview',
                           {'period_month': '2026-01', 'basis': 'unit_charge'}).get_json()
    check('preview lists every chargeable unit', len(preview['rows']) == len(units),
          f'{len(preview["rows"])} of {len(units)}')
    check('preview totals the charges', preview['total'] == 5000 * len(units),
          str(preview['total']))

    run = session.post('/api/syndic/finance/billing-runs',
                       {'period_month': '2026-01', 'basis': 'unit_charge'})
    check('billing run issues invoices', run.status_code == 201, str(run.get_json())[:160])

    repeat = session.post('/api/syndic/finance/billing-runs',
                          {'period_month': '2026-01', 'basis': 'unit_charge'})
    check('the same period cannot be run twice', repeat.status_code == 409,
          f'got {repeat.status_code}')

    summary = session.get('/api/syndic/finance/summary').get_json()
    expected = 5000 * len(units)
    check('outstanding matches what was billed', summary['totals']['outstanding'] == expected,
          f'{summary["totals"]["outstanding"]} vs {expected}')

    target = units[0]
    receipt = session.post('/api/syndic/finance/payments', {
        'unit_id': target['id'],
        'amount': 2000,
        'method_label': 'Cash at office',
    })
    check('a receipt posts and allocates', receipt.status_code == 201,
          str(receipt.get_json())[:160])
    if receipt.status_code == 201:
        body = receipt.get_json()
        check('the receipt allocated to an invoice', body['allocated_count'] == 1,
              str(body))
        check('nothing was left unallocated', body['unallocated'] == 0, str(body))

    after = session.get('/api/syndic/finance/summary').get_json()
    check('outstanding fell by the amount received',
          after['totals']['outstanding'] == expected - 2000,
          f'{after["totals"]["outstanding"]} vs {expected - 2000}')

    payment_id = receipt.get_json()['payment']['id'] if receipt.status_code == 201 else None
    if payment_id:
        reversed_response = session.post(
            f'/api/syndic/finance/payments/{payment_id}/reverse',
            {'reason': 'Cheque returned unpaid'},
        )
        check('a payment reverses rather than deletes', reversed_response.status_code == 200,
              str(reversed_response.get_json())[:160])
        restored = session.get('/api/syndic/finance/summary').get_json()
        check('reversal restores the balance',
              restored['totals']['outstanding'] == expected,
              f'{restored["totals"]["outstanding"]} vs {expected}')


if __name__ == '__main__':
    sys.exit(main())
