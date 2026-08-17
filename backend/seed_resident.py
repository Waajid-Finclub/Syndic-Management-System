#!/usr/bin/env python3
"""
Minimal resident seed for a fresh local system.

This keeps the resident PWA sign-in paths usable without repopulating fake
financial, maintenance, governance, visitor, document, parking, storage or
notification data. The only resident-domain rows created are a starter
development, two units, and one login account per resident role.
"""
from datetime import date
from decimal import Decimal

from app.extensions import db
from app.models import (
    Block,
    Development,
    DevelopmentSettings,
    ResidentPreference,
    Unit,
    UnitOwnership,
    UnitTenancy,
    User,
)

RESIDENT_PASSWORD = 'ResidentApp2026!'

DEVELOPMENT_CODE = 'STARTER'
DEVELOPMENT_NAME = 'Starter Residence'

OWNER_EMAIL = 'coowner@syndicms.mu'
TENANT_EMAIL = 'tenant@syndicms.mu'
OWNER_UNIT = 'OWNER-1'
TENANT_UNIT = 'TENANT-1'


def seed_resident_domain():
    """Create the minimum resident data required for owner and tenant logins."""
    development = Development(
        code=DEVELOPMENT_CODE,
        name=DEVELOPMENT_NAME,
        development_type='apartment',
        city='',
        district='',
        country='Mauritius',
        status='draft',
        pipeline_stage='prospect',
        unit_count=2,
        parking_count=0,
        ev_parking_count=0,
        storage_count=0,
        facility_count=0,
        user_count=2,
        whatsapp_enabled=True,
    )
    db.session.add(development)
    db.session.flush()

    db.session.add(DevelopmentSettings(
        development_id=development.id,
        allow_online_payments=False,
        allow_resident_voting=False,
    ))

    block = Block(development_id=development.id, name='Starter Block', floors=1)
    db.session.add(block)
    db.session.flush()

    owner_unit = Unit(
        development_id=development.id,
        block_id=block.id,
        label=OWNER_UNIT,
        unit_type='T2',
        floor=1,
        area_sqm=Decimal('0.00'),
        share_value=1,
        monthly_charge=Decimal('0.00'),
    )
    tenant_unit = Unit(
        development_id=development.id,
        block_id=block.id,
        label=TENANT_UNIT,
        unit_type='T2',
        floor=1,
        area_sqm=Decimal('0.00'),
        share_value=1,
        monthly_charge=Decimal('0.00'),
    )
    db.session.add_all([owner_unit, tenant_unit])
    db.session.flush()

    owner = _resident_user('Co-owner', 'Login', OWNER_EMAIL, 'co_owner', development, OWNER_UNIT, '+230 5000 0101')
    tenant = _resident_user('Tenant', 'Login', TENANT_EMAIL, 'tenant', development, TENANT_UNIT, '+230 5000 0102')
    db.session.flush()

    today = date.today()
    db.session.add(UnitOwnership(
        unit_id=owner_unit.id,
        user_id=owner.id,
        ownership_percent=Decimal('100.0000'),
        is_primary_contact=True,
        start_date=today,
    ))
    db.session.add(UnitTenancy(
        unit_id=tenant_unit.id,
        user_id=tenant.id,
        lease_start_date=today,
        is_current=True,
    ))
    db.session.add(ResidentPreference(user_id=owner.id, push_notifications=True))
    db.session.add(ResidentPreference(user_id=tenant.id, push_notifications=True))
    db.session.flush()

    return {
        'development': development,
        'owner': owner,
        'tenant': tenant,
        'owner_unit': owner_unit,
        'tenant_unit': tenant_unit,
    }


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
