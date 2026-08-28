#!/usr/bin/env python3
"""
Seed a fresh SyndicMS local database.

Run: python seed.py            (adds baseline rows to an empty database)
     python seed.py --reset    (drops every table first)

The seed intentionally avoids demo portfolio or resident activity data. It keeps
only what is needed to sign in at each of the three layers — master admin,
syndic admin, co-owner — plus the platform reference catalogs and WhatsApp
Centre configuration.
"""
import sys
from datetime import date

from app import create_app
from app.extensions import db
from app.models import (
    Development,
    FeatureFlag,
    SubscriptionPlan,
    Unit,
    User,
    WhatsAppNumber,
    WhatsAppStat,
    WhatsAppTemplate,
)
from app.routes.setup import seed_reference_data
from seed_resident import (
    OWNER_EMAIL,
    OWNER_UNIT,
    RESIDENT_PASSWORD,
    SYNDIC_PASSWORD,
    SYNDIC_USERS,
    VACANT_UNIT,
    seed_resident_domain,
)

ADMIN_PASSWORD = 'AdminConsole2026!'

CONSOLE_USERS = [
    ('Platform', 'Admin', 'admin@syndicms.mu', 'super_admin', True),
    ('Platform', 'Operator', 'platform@syndicms.mu', 'platform_admin', True),
    ('Support', 'User', 'support@syndicms.mu', 'support_user', False),
    ('Audit', 'User', 'auditor@syndicms.mu', 'auditor', True),
]


def main():
    app = create_app()
    with app.app_context():
        if '--reset' in sys.argv:
            print('Dropping all tables...')
            db.drop_all()
            db.create_all()

        if db.session.query(User.id).first() is not None and '--reset' not in sys.argv:
            print('Database already has users. Re-run with --reset to rebuild the fresh baseline.')
            return

        seed_reference_data()
        db.session.flush()

        seed_console_users()
        resident = seed_resident_domain()
        seed_whatsapp_baseline(resident['development'])

        db.session.commit()
        report(resident)


def seed_console_users():
    users = []
    for first_name, last_name, email, role, mfa_enabled in CONSOLE_USERS:
        user = User(
            first_name=first_name,
            last_name=last_name,
            email=email,
            role=role,
            status='active',
            mfa_enabled=mfa_enabled,
            whatsapp_enabled=False,
        )
        user.set_password(ADMIN_PASSWORD)
        db.session.add(user)
        users.append(user)

    db.session.flush()
    return users


def seed_whatsapp_baseline(development):
    """Keep the WhatsApp Centre usable without seeding message history."""
    db.session.add(WhatsAppNumber(
        development_id=development.id,
        display_name='SyndicMS Sandbox',
        phone_number='+230 5000 0000',
        status='Connected',
        monthly_messages=0,
    ))
    today = date.today()
    db.session.add(WhatsAppStat(
        period_month=f'{today.year:04d}-{today.month:02d}',
        total_sent=0,
        delivered=0,
        read=0,
        failed=0,
        queue_depth=0,
        monthly_cost=0,
    ))


def report(resident):
    print('\nFresh baseline ready.')
    print(f'  Properties         {Development.query.count()}')
    print(f'  Units              {Unit.query.count()}')
    print(f'  Users              {User.query.count()}')
    print(f'  Plans              {SubscriptionPlan.query.count()}')
    print(f'  Feature flags      {FeatureFlag.query.count()}')
    print(f'  WhatsApp templates {WhatsAppTemplate.query.count()}')

    print('\nMaster admin console credentials  (/login):')
    for _first, _last, email, role, _mfa in CONSOLE_USERS:
        print(f'  {role:<18} {email} / {ADMIN_PASSWORD}')

    development = resident['development']

    print(f'\nSyndic admin console credentials  (/syndic/login, scoped to {development.name}):')
    for _first, _last, email, role in SYNDIC_USERS:
        print(f'  {role:<18} {email} / {SYNDIC_PASSWORD}')

    print('\nCo-owner app credentials  (/app/login):')
    print(f'  co_owner           {OWNER_EMAIL} / {RESIDENT_PASSWORD}  (unit {OWNER_UNIT})')

    print(f'\nStarter client: {development.name} ({development.code})')
    print(f'  Unit {VACANT_UNIT} is left unallocated so the co-owner invitation flow has a target.')
    print('No demo invoices, payments, maintenance, votes, bookings, visitors, documents, or notifications were seeded.\n')


if __name__ == '__main__':
    main()
