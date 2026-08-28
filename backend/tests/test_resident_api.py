#!/usr/bin/env python3
"""
Smoke test for the fresh resident API baseline.

Run after `python seed.py --reset`. If DATABASE_URL is not provided, this script
copies the local SQLite database to the system temp folder and runs against that
copy so the fresh local database is not mutated by the smoke workflow.
"""
import os
import shutil
import sys
import tempfile
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))


def prepare_database_url():
    configured = os.environ.get('DATABASE_URL')
    if configured:
        return configured

    source = BACKEND_ROOT / 'instance' / 'syndic_ms.db'
    target = Path(tempfile.gettempdir()) / 'syndicms-resident-test.db'
    if not source.exists():
        print('No local database. Run `python seed.py --reset` first.')
        raise SystemExit(1)

    shutil.copy2(source, target)
    url = f'sqlite:///{target.as_posix()}'
    os.environ['DATABASE_URL'] = url
    return url


DATABASE_URL = prepare_database_url()

from app import create_app  # noqa: E402
from app.models import MaintenanceRequest, User  # noqa: E402

RESIDENT_PASSWORD = 'ResidentApp2026!'
ADMIN_PASSWORD = 'AdminConsole2026!'
OWNER = 'coowner@syndicms.mu'
OWNER_UNIT = 'A-101'
CONSOLE = 'admin@syndicms.mu'
SYNDIC = 'manager@syndicms.mu'
SYNDIC_PASSWORD = 'SyndicAdmin2026!'

passed = 0
failures = []


def check(label, condition, detail=''):
    global passed
    if condition:
        passed += 1
        print(f'  ok    {label}')
    else:
        failures.append(f'{label} - {detail}' if detail else label)
        print(f'  FAIL  {label} {detail}')


class Session:
    """A test client that carries the session cookie and the CSRF header."""

    def __init__(self, app):
        self.client = app.test_client()
        self.token = None

    def csrf(self):
        if self.token is None:
            response = self.client.get('/api/auth/csrf-token')
            self.token = response.get_json()['csrf_token']
        return self.token

    def get(self, path):
        return self.client.get(path)

    def post(self, path, payload=None):
        return self.client.post(path, json=payload or {}, headers={'X-CSRF-Token': self.csrf()})

    def login(self, email, password=RESIDENT_PASSWORD, endpoint='/api/resident/auth/login'):
        return self.post(endpoint, {'email': email, 'password': password})


def main():
    app = create_app()

    with app.app_context():
        if User.query.filter(User.email == OWNER).first() is None:
            print('No fresh baseline. Run `python seed.py --reset` first.')
            return 1

    print('\nResident API fresh-baseline smoke test')
    print(f'Database: {DATABASE_URL}\n')

    print('Authentication')
    owner = Session(app)
    response = owner.login(OWNER)
    check('co-owner signs in', response.status_code == 200, response.get_json())
    owner_session = response.get_json() or {}
    owner_features = ((owner_session.get('user') or {}).get('features') or {})
    check('co-owner session carries starter unit',
          owner_session.get('unit', {}).get('label') == OWNER_UNIT)
    check('co-owner keeps finance and voting features',
          owner_features.get('finance') is True and owner_features.get('voting') is True)

    # Layer 3 is co-owners only: a syndic admin account is refused here, and a
    # co-owner is refused at the syndic login. Neither login is a subset of the
    # other, which is what keeps the two consoles apart.
    syndic_on_app = Session(app).login(SYNDIC, password=SYNDIC_PASSWORD)
    check('resident app rejects a syndic admin account', syndic_on_app.status_code == 403,
          syndic_on_app.get_json())
    owner_on_syndic = Session(app).login(OWNER, endpoint='/api/syndic/auth/login')
    check('syndic console rejects a co-owner account', owner_on_syndic.status_code == 403,
          owner_on_syndic.get_json())

    admin = Session(app)
    console_login = admin.login(CONSOLE, password=ADMIN_PASSWORD, endpoint='/api/auth/login')
    check('console account signs in to admin endpoint', console_login.status_code == 200, console_login.get_json())

    admin_password_on_app = Session(app).login(OWNER, password=ADMIN_PASSWORD)
    check('resident app rejects admin password', admin_password_on_app.status_code == 401,
          admin_password_on_app.status_code)

    resident_password_on_console = Session(app).login(CONSOLE, endpoint='/api/auth/login')
    check('admin console rejects resident password', resident_password_on_console.status_code == 401,
          resident_password_on_console.status_code)

    rejected = Session(app).login(CONSOLE, password=ADMIN_PASSWORD)
    check('console account is refused at resident login', rejected.status_code == 403, rejected.status_code)

    resident_at_console = Session(app).login(OWNER, endpoint='/api/auth/login')
    check('resident is refused at console login', resident_at_console.status_code == 403,
          resident_at_console.status_code)

    anonymous = Session(app)
    check('unauthenticated home is 401', anonymous.get('/api/resident/home').status_code == 401)

    print('\nWhatsApp centre')
    status = admin.get('/api/whatsapp/')
    status_payload = status.get_json() or {}
    templates = status_payload.get('templates') or []
    numbers = status_payload.get('numbers') or []
    check('WhatsApp status loads', status.status_code == 200, status_payload)
    check('template catalog is restored', len(templates) >= 10, len(templates))
    check('sandbox number is connected', any(number['display_name'] == 'SyndicMS Sandbox' for number in numbers), numbers)

    center = admin.get('/api/whatsapp/center')
    center_payload = center.get_json() or {}
    center_templates = center_payload.get('templates') or []
    check('WhatsApp Centre loads', center.status_code == 200, center_payload)
    check('approved templates are ready to send',
          sum(1 for template in center_templates if template.get('can_send')) >= 9, center_templates)
    check('starter property is available as a scope',
          any(development.get('code') == 'STARTER' for development in center_payload.get('developments', [])),
          center_payload.get('developments'))

    audience = admin.get('/api/whatsapp/audience?audience=co_owners')
    audience_payload = audience.get_json() or {}
    check('co-owner audience preview loads', audience.status_code == 200, audience_payload)
    check('the starter co-owner is reachable', audience_payload.get('reachable') == 1,
          audience_payload)

    general_notice = next((template for template in center_templates if template.get('name') == 'general_notice'), None)
    check('general notice template exists', general_notice is not None)
    if general_notice:
        dispatched = admin.post('/api/whatsapp/dispatch', {
            'template_id': general_notice['id'],
            'test_number': '+230 5000 9999',
            'variables': {
                'development': 'Starter Residence',
                'title': 'Smoke test',
                'message': 'WhatsApp Centre test dispatch',
            },
        })
        dispatched_payload = dispatched.get_json() or {}
        check('test dispatch is logged',
              dispatched.status_code == 201 and dispatched_payload.get('sent') == 1,
              dispatched_payload)

        messages = admin.get('/api/whatsapp/messages?limit=5')
        messages_payload = messages.get_json() or {}
        check('message log includes the test dispatch',
              any(message.get('template_name') == 'general_notice' for message in messages_payload.get('messages', [])),
              messages_payload)

    print('\nFresh owner state')
    home = owner.get('/api/resident/home')
    home_payload = home.get_json() or {}
    check('home loads for linked co-owner', home.status_code == 200, home_payload)
    check('fresh balance is zero', home_payload.get('account', {}).get('outstanding') == 0.0,
          home_payload.get('account'))
    check('no allocated assets',
          home_payload.get('assets', {}).get('parking') == []
          and home_payload.get('assets', {}).get('ev_bays') == []
          and home_payload.get('assets', {}).get('storage') == [], home_payload.get('assets'))
    check('no recent activity', home_payload.get('activity') == [], home_payload.get('activity'))

    finance = owner.get('/api/resident/finance/summary')
    finance_payload = finance.get_json() or {}
    check('finance summary loads', finance.status_code == 200, finance_payload)
    check('no open invoices', finance_payload.get('open_invoices') == [])

    methods = owner.get('/api/resident/finance/payment-methods')
    check('no saved payment methods', (methods.get_json() or {}).get('payment_methods') == [])
    pay = owner.post('/api/resident/finance/payments', {'method_id': 1})
    check('payment is refused without a saved method', pay.status_code == 400, pay.get_json())

    transactions = owner.get('/api/resident/finance/transactions').get_json() or {}
    check('no ledger transactions', transactions.get('transactions') == [])

    print('\nResident workflows')
    meta = owner.get('/api/resident/maintenance/meta').get_json() or {}
    categories = meta.get('categories') or []
    check('maintenance metadata loads', len(categories) > 0)
    check('starter unit appears in locations',
          any(OWNER_UNIT in item for item in meta.get('locations', [])))

    created = owner.post('/api/resident/maintenance', {
        'category': categories[0]['key'] if categories else 'plumbing',
        'title': 'Fresh baseline smoke request',
        'description': 'Created by the smoke test against the clean seed.',
        'location_label': 'My Unit (OWNER-1)',
        'priority': 'normal',
    })
    created_payload = created.get_json() or {}
    check('maintenance request can be created', created.status_code == 201, created_payload)
    created_id = created_payload.get('request', {}).get('id')
    check('created request can be read', created_id is not None and owner.get(f'/api/resident/maintenance/{created_id}').status_code == 200)

    meetings = owner.get('/api/resident/governance/meetings').get_json() or {}
    check('no seeded meetings', meetings.get('upcoming') == [] and meetings.get('past') == [], meetings)

    facilities = owner.get('/api/resident/facilities').get_json() or {}
    check('no seeded facilities', facilities.get('facilities') == [], facilities)

    visitors = owner.get('/api/resident/visitors').get_json() or {}
    check('no seeded visitor passes', visitors.get('upcoming') == [] and visitors.get('past') == [], visitors)

    documents = owner.get('/api/resident/documents').get_json() or {}
    check('no seeded documents', documents.get('folders') == [], documents)

    assets = owner.get('/api/resident/assets').get_json() or {}
    check('assets endpoint is empty',
          assets.get('parking') == [] and assets.get('ev_bays') == [] and assets.get('storage') == [])

    notifications = owner.get('/api/resident/account/notifications').get_json() or {}
    check('one notification from the created maintenance request exists', notifications.get('unread') == 1,
          notifications)

    print('\nLayer boundaries')
    # A signed-in co-owner reaching either console gets 403 from that console's
    # own guard, not a redirect - the API is the boundary, not the navigation.
    check('co-owner cannot read the syndic overview',
          owner.get('/api/syndic/overview').status_code == 403)
    check('co-owner cannot read the platform registry',
          owner.get('/api/developments/').status_code == 403)
    check('co-owner cannot fetch an invoice that is not theirs',
          owner.get('/api/resident/finance/invoices/999999').status_code == 404)

    with app.app_context():
        created_count = MaintenanceRequest.query.filter_by(title='Fresh baseline smoke request').count()
    check('smoke request is the only seeded mutation', created_count == 1, created_count)

    if failures:
        print('\nFailures:')
        for failure in failures:
            print(f' - {failure}')
        return 1

    print(f'\n{passed} checks passed, 0 failed')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
