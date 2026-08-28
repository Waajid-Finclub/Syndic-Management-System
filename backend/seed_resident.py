#!/usr/bin/env python3
"""
Minimal client seed for a fresh local system.

Creates one starter development with the account chain of all three layers
intact — one syndic manager on layer 2 and one co-owner on layer 3 — without
repopulating fake financial, maintenance, governance, visitor, document,
parking, storage or notification data.

The second unit is deliberately left unowned so the co-owner allocation flow in
the syndic console has something to allocate on a fresh install.
"""
from datetime import date
from decimal import Decimal

from app.extensions import db
from app.models import (
    Block,
    Development,
    DevelopmentSettings,
    ResidentPreference,
    Subscription,
    SubscriptionPlan,
    Unit,
    UnitOwnership,
    User,
)

RESIDENT_PASSWORD = 'ResidentApp2026!'
SYNDIC_PASSWORD = 'SyndicAdmin2026!'

DEVELOPMENT_CODE = 'STARTER'
DEVELOPMENT_NAME = 'Starter Residence'

OWNER_EMAIL = 'coowner@syndicms.mu'
OWNER_UNIT = 'A-101'
VACANT_UNIT = 'A-102'

# The fresh baseline has exactly one layer 2 account: the client's manager.
SYNDIC_USERS = [
    ('Syndic', 'Manager', 'manager@syndicms.mu', 'syndic_manager'),
]


def seed_resident_domain():
    """Create the starter development, one syndic login, and one co-owner login."""
    development = Development(
        code=DEVELOPMENT_CODE,
        name=DEVELOPMENT_NAME,
        development_type='apartment',
        city='',
        district='',
        country='Mauritius',
        status='active',
        pipeline_stage='go_live',
        syndic_manager_name='Syndic Manager',
        syndic_manager_email='manager@syndicms.mu',
        unit_count=2,
        parking_count=0,
        ev_parking_count=0,
        storage_count=0,
        facility_count=0,
        user_count=3,
        whatsapp_enabled=True,
    )
    db.session.add(development)
    db.session.flush()

    _attach_subscription(development)

    db.session.add(DevelopmentSettings(
        development_id=development.id,
        allow_online_payments=False,
        allow_resident_voting=False,
    ))

    block = Block(development_id=development.id, name='Starter Block', floors=1)
    db.session.add(block)
    db.session.flush()

    # Shares sum to the 10,000 the registry reconciles against, so the syndic
    # console opens on a balanced development rather than a warning.
    owner_unit = _unit(development, block, OWNER_UNIT, share_value=5000)
    vacant_unit = _unit(development, block, VACANT_UNIT, share_value=5000)
    db.session.add_all([owner_unit, vacant_unit])
    db.session.flush()

    syndic_team = [
        _console_user(first, last, email, role, development, SYNDIC_PASSWORD)
        for first, last, email, role in SYNDIC_USERS
    ]

    owner = _resident_user('Co-owner', 'Login', OWNER_EMAIL, 'co_owner', development,
                           OWNER_UNIT, '+230 5000 0101')
    db.session.flush()

    db.session.add(UnitOwnership(
        unit_id=owner_unit.id,
        user_id=owner.id,
        ownership_percent=Decimal('100.0000'),
        is_primary_contact=True,
        start_date=date.today(),
    ))
    db.session.add(ResidentPreference(user_id=owner.id, push_notifications=True))
    db.session.flush()

    return {
        'development': development,
        'owner': owner,
        'syndic_team': syndic_team,
        'owner_unit': owner_unit,
        'vacant_unit': vacant_unit,
    }


def _attach_subscription(development):
    """
    Put the starter client on a plan.

    Without one the client has no admin seat allowance, and the seat check in
    the syndic Team screen would refuse every account on a fresh install.
    """
    plan = SubscriptionPlan.query.filter_by(code='premium').first() or SubscriptionPlan.query.first()
    if plan is None:
        return None
    subscription = Subscription(
        development_id=development.id,
        plan_id=plan.id,
        setup_fee_amount=plan.setup_fee_amount,
        monthly_unit_rate=plan.monthly_unit_rate,
        vat_rate=plan.vat_rate,
        active_units_count=2,
        status='active',
        start_date=date.today(),
    )
    db.session.add(subscription)
    db.session.flush()
    return subscription


def _unit(development, block, label, share_value):
    return Unit(
        development_id=development.id,
        block_id=block.id,
        label=label,
        unit_type='T2',
        floor=1,
        area_sqm=Decimal('0.00'),
        share_value=share_value,
        monthly_charge=Decimal('0.00'),
    )


def _console_user(first_name, last_name, email, role, development, password):
    """A layer 2 account: scoped to one development, signs in at /syndic."""
    user = User(
        first_name=first_name,
        last_name=last_name,
        email=email,
        role=role,
        status='active',
        development_id=development.id,
        mfa_enabled=True,
        whatsapp_enabled=False,
    )
    user.set_password(password)
    db.session.add(user)
    return user


def _resident_user(first_name, last_name, email, role, development, unit_label, phone):
    user = User(
        first_name=first_name,
        last_name=last_name,
        email=email,
        phone=phone,
        role=role,
        status='active',
        development_id=development.id,
        unit_label=unit_label,
        mfa_enabled=False,
        whatsapp_enabled=True,
    )
    user.set_password(RESIDENT_PASSWORD)
    db.session.add(user)
    return user
