#!/usr/bin/env python3
"""
Seed the SyndicMS admin console with a working demo portfolio.

Run: python seed.py            (adds to an empty database)
     python seed.py --reset    (drops every table first)

The six named properties come from the console design. A further 121 synthetic
properties are generated so the platform-wide totals reach the portfolio scale
the design assumes (127 properties, 8,420 units, 3,200 bays, 1,850 stores).
Every headline figure in the console is then a real sum over real rows.
"""
import sys
from datetime import date, datetime, timedelta, timezone

from app import create_app
from app.extensions import db
from app.models import (
    ApiKey,
    AuditLog,
    Development,
    DevelopmentSettings,
    FeatureFlag,
    FeatureFlagOverride,
    Integration,
    OnboardingStep,
    RevenueSnapshot,
    Subscription,
    SubscriptionInvoice,
    SubscriptionPlan,
    SystemAlert,
    SystemMetric,
    User,
    WhatsAppNumber,
    WhatsAppStat,
    WhatsAppTemplate,
)
from app.models.development import ONBOARDING_STAGES
from app.routes.setup import seed_reference_data

# Portfolio targets the synthetic properties are balanced against.
TARGET_PROPERTIES = 127
TARGET_UNITS = 8420
TARGET_PARKING = 3200
TARGET_EV = 640
TARGET_STORAGE = 1850
TARGET_PORTAL_USERS = 6891

ADMIN_EMAIL = 'admin@syndicms.mu'
ADMIN_PASSWORD = 'SyndicAdmin2026!'

NAMED_PROPERTIES = [
    {
        'code': 'LES-PALM', 'name': 'Les Palmiers Res.', 'city': 'Moka', 'district': 'Moka',
        'syndic': 'Mr Soobrayen', 'syndic_email': 'soobrayen@syndic.mu', 'plan': 'premium',
        'status': 'active', 'pipeline_stage': 'go_live', 'launch': date(2025, 1, 15),
        'units': 60, 'parking': 48, 'ev': 12, 'storage': 30, 'facilities': 3,
        'portal_users': 62, 'whatsapp': True, 'type': 'apartment', 'done_steps': 8,
    },
    {
        'code': 'PALM-GRV', 'name': 'Palm Grove Estate', 'city': 'Curepipe', 'district': 'Plaines Wilhems',
        'syndic': 'Mr Doobary', 'syndic_email': 'doobary@syndic.mu', 'plan': 'silver',
        'status': 'active', 'pipeline_stage': 'go_live', 'launch': date(2025, 3, 1),
        'units': 120, 'parking': 80, 'ev': 16, 'storage': 45, 'facilities': 2,
        'portal_users': 135, 'whatsapp': True, 'type': 'gated', 'done_steps': 8,
    },
    {
        'code': 'HARB-VIEW', 'name': 'Harbour View', 'city': 'Port Louis', 'district': 'Port Louis',
        'syndic': 'Mrs Doorgakant', 'syndic_email': 'doorgakant@syndic.mu', 'plan': 'silver',
        'status': 'trial', 'pipeline_stage': 'go_live', 'launch': date(2026, 2, 1),
        'units': 45, 'parking': 30, 'ev': 6, 'storage': 12, 'facilities': 1,
        'portal_users': 48, 'whatsapp': True, 'type': 'apartment', 'done_steps': 8,
    },
    {
        'code': 'SUNS-VILL', 'name': 'Sunset Villas', 'city': 'Flic-en-Flac', 'district': 'Black River',
        'syndic': 'Mr Doobary', 'syndic_email': 'doobary@syndic.mu', 'plan': 'basic',
        'status': 'setup', 'pipeline_stage': 'setup', 'launch': None,
        'units': 24, 'parking': 12, 'ev': 0, 'storage': 8, 'facilities': 0,
        'portal_users': 0, 'whatsapp': False, 'type': 'estate', 'done_steps': 2,
    },
    {
        'code': 'GRAN-BAIE', 'name': 'Grand Baie Towers', 'city': 'Grand Baie', 'district': 'Rivière du Rempart',
        'syndic': 'Mrs Doorgakant', 'syndic_email': 'doorgakant@syndic.mu', 'plan': 'premium',
        'status': 'uat', 'pipeline_stage': 'uat', 'launch': None,
        'units': 180, 'parking': 120, 'ev': 30, 'storage': 60, 'facilities': 3,
        'portal_users': 0, 'whatsapp': False, 'type': 'mixed', 'done_steps': 6,
    },
    {
        'code': 'TAMA-BAY', 'name': 'Tamarin Bay', 'city': 'Tamarin', 'district': 'Black River',
        'syndic': 'Mr Jugnauth', 'syndic_email': 'jugnauth@syndic.mu', 'plan': 'silver',
        'status': 'active', 'pipeline_stage': 'go_live', 'launch': date(2025, 6, 10),
        'units': 90, 'parking': 60, 'ev': 12, 'storage': 30, 'facilities': 2,
        'portal_users': 95, 'whatsapp': True, 'type': 'gated', 'done_steps': 8,
    },
]

# Synthetic portfolio shape: (plan, count, base units, base parking, base storage).
SYNTHETIC_BUCKETS = [
    ('basic', 14, 24, 10, 7),
    ('silver', 69, 58, 22, 13),
    ('premium', 38, 97, 36, 22),
]

SYNTHETIC_PLACES = [
    ('Beau Bassin', 'Plaines Wilhems'), ('Quatre Bornes', 'Plaines Wilhems'),
    ('Rose Hill', 'Plaines Wilhems'), ('Vacoas', 'Plaines Wilhems'),
    ('Ebene', 'Plaines Wilhems'), ('Pereybere', 'Rivière du Rempart'),
    ('Trou aux Biches', 'Pamplemousses'), ('Albion', 'Black River'),
    ('Mahebourg', 'Grand Port'), ('Belle Mare', 'Flacq'),
    ('Goodlands', 'Rivière du Rempart'), ('Souillac', 'Savanne'),
]
SYNTHETIC_NAMES = [
    'Residence', 'Court', 'Heights', 'Gardens', 'Park', 'Terrace',
    'Villas', 'Mews', 'Quays', 'Rise', 'Place', 'Lodge',
]

WHATSAPP_TEMPLATES = [
    ('invoice_notification', 'UTILITY', 'approved', 12480, 96, 78, 0.85),
    ('payment_reminder', 'UTILITY', 'approved', 4520, 94, 71, 0.85),
    ('payment_confirmed', 'UTILITY', 'approved', 8840, 97, 82, 0.85),
    ('maintenance_update', 'UTILITY', 'approved', 3200, 93, 68, 0.85),
    ('meeting_notice', 'UTILITY', 'approved', 5800, 95, 74, 0.85),
    ('emergency_alert', 'UTILITY', 'approved', 200, 98, 91, 0.85),
    ('ev_charge_complete', 'UTILITY', 'approved', 830, 96, 80, 0.85),
    ('visitor_pass', 'UTILITY', 'approved', 1200, 95, 77, 0.85),
    ('welcome_onboard', 'MARKETING', 'review', 0, None, None, 1.50),
]

SYSTEM_METRICS = [
    ('api_p95', 'API P95', 'system', '142ms', '< 200ms', 'Zap', True),
    ('error_rate', 'Error Rate', 'system', '0.03%', '< 0.1%', 'Bug', True),
    ('mysql_conn', 'MySQL Conn', 'system', '78/100', '< 90%', 'Database', False),
    ('wa_queue', 'WA Queue', 'system', '3', '< 50', 'MessageSquare', True),
    ('rabbitmq', 'RabbitMQ', 'system', '12', '< 100', 'Inbox', True),
    ('s3_storage', 'S3 Storage', 'system', '2.4/5 TB', '< 80%', 'HardDrive', True),
    ('uptime_30d', 'Uptime 30d', 'system', '99.97%', '> 99.9%', 'Activity', True),
    ('redis_mem', 'Redis Mem', 'system', '1.2/4 GB', '< 75%', 'Rocket', True),
    ('cache_hit', 'Cache Hit', 'system', '94.2%', '> 90%', 'BarChart3', True),
    ('sessions', 'Sessions', 'system', '342', '< 500', 'Users', True),
    ('websockets', 'WebSockets', 'system', '89', '< 200', 'Plug', True),
    ('pdf_queue', 'PDF Queue', 'system', '0', '< 10', 'FileText', True),
    ('api_version', 'API Version', 'api', 'v1.0', None, 'Tag', True),
    ('api_requests_24h', 'Requests (24h)', 'api', '48,200', None, 'ArrowLeftRight', True),
    ('api_latency', 'Avg Latency', 'api', '142ms', '< 200ms', 'Timer', True),
    ('api_error_rate', 'Error Rate', 'api', '0.03%', '< 0.1%', 'Bug', True),
    ('api_rate_limit', 'Rate Limit', 'api', '1000/min', None, 'Gauge', True),
]

SYSTEM_ALERTS = [
    ('MySQL connection pool at 78% — monitor', 'warning', 15),
    ('WhatsApp: 42,300 sent (94% delivery)', 'success', 60),
    ('Deploy v2.0.1 successful — 0 errors', 'info', 120),
    ('Daily MySQL backup — 2.4TB', 'success', 360),
    ('EV charger E-02 (Les Palmiers) offline', 'warning', 480),
    ('SSL cert renewed — valid Mar 2027', 'info', 1440),
]

INTEGRATIONS = [
    ('WhatsApp Business', 'Meta Cloud API', 'Bi-directional', 'active', 'Real-time', 12400),
    ('Payment Gateway', 'REST + Webhooks', 'Bi-directional', 'active', 'Real-time', 2800),
    ('Email (SendGrid)', 'SMTP API', 'Outbound', 'active', 'Real-time', 1200),
    ('SMS (Twilio)', 'REST API', 'Outbound', 'active', 'Real-time', 120),
    ('FCM Push', 'Firebase SDK', 'Outbound', 'active', 'Real-time', 3400),
    ('EV Chargers', 'OCPP 1.6', 'Inbound Webhook', 'active', 'Real-time', 640),
    ('Bank Reconciliation', 'CSV/MT940', 'Import', 'manual', 'Weekly', 12),
    ('Accounting Export', 'CSV/JSON', 'Export', 'on_demand', 'Monthly', 3),
]

FLAG_OVERRIDE_COUNTS = {
    'whatsapp-inbound': 2,
    'ev-charging-billing': 2,
    'e-voting': 3,
    'facility-booking': 1,
    'ai-invoice-ocr': 1,
    'visitor-qr-access': 3,
}

AUDIT_ENTRIES = [
    ('MODIFY', 'Config', 'config', 'Admin', 'Platform', "Flag 'ev-charging-billing' enabled globally", 20),
    ('CREATE', 'Invoice', 'financial', 'Mr Soobrayen', 'Les Palmiers Res.', 'SC-2026-180: 60 units × Rs 4,250 + parking/EV', 37),
    ('VOTE', 'Resolution', 'votes', 'R. Moonien', 'Les Palmiers Res.', 'FOR R1 — 152 shares', 70),
    ('CHARGE', 'EV', 'parking_ev', 'System', 'Les Palmiers Res.', 'Bay E-03: 12.4 kWh → Rs 186 → Unit 4B', 122),
    ('BOOK', 'Facility', 'system', 'System', 'Les Palmiers Res.', 'Pool private booking 15 Mar 10-12pm → Mr Moonien', 152),
    ('SEND', 'WhatsApp', 'whatsapp', 'System', 'Platform', '58 invoice notifications — 55 delivered, 3 pending', 192),
    ('ASSIGN', 'Work Order', 'system', 'Mr Soobrayen', 'Les Palmiers Res.', 'WO-047 → QuickFix Plumbing (water leak 4B)', 227),
    ('REGISTER', 'Visitor', 'system', 'V. Guest', 'Les Palmiers Res.', 'J. Smith → Bay V-03 → 4h pass → hosted by 4B', 302),
    ('MODIFY', 'Role', 'roles', 'Admin', 'Harbour View', 'Doorgakant: Co-Owner → Syndic Manager', 1160),
    ('BACKUP', 'Database', 'system', 'System', 'Platform', 'Daily MySQL backup — 2.4TB compressed — verified', 1310),
]


def main():
    app = create_app()
    with app.app_context():
        if '--reset' in sys.argv:
            print('Dropping all tables...')
            db.drop_all()
            db.create_all()

        if db.session.query(User.id).first() is not None and '--reset' not in sys.argv:
            print('Database already has users. Re-run with --reset to rebuild the demo data.')
            return

        seed_reference_data()
        db.session.flush()

        plans = {plan.code: plan for plan in SubscriptionPlan.query.all()}
        admin = seed_console_users()
        developments = seed_properties(plans)
        seed_property_users(developments)
        seed_subscription_invoices(developments)
        seed_feature_flag_overrides(developments)
        seed_monitoring()
        seed_whatsapp(developments)
        seed_integrations(admin)
        mrr = seed_revenue_trend()
        seed_audit_log(developments)

        db.session.commit()
        report(mrr)


def seed_console_users():
    admin = User(first_name='Platform', last_name='Admin', email=ADMIN_EMAIL,
                 role='super_admin', status='active', mfa_enabled=True)
    admin.set_password(ADMIN_PASSWORD)
    db.session.add(admin)

    for first, last, email, role, mfa in [
        ('Priya', 'Ramdin', 'priya@syndicms.mu', 'super_admin', True),
        ('Kevin', 'Lutchmun', 'kevin@syndicms.mu', 'platform_admin', True),
        ('Sarah', 'Bhundoo', 'sarah@syndicms.mu', 'platform_admin', True),
        ('Nadia', 'Appadoo', 'nadia@syndicms.mu', 'platform_admin', True),
        ('Dev', 'Support', 'support@syndicms.mu', 'support_user', False),
        ('Audit', 'Firm', 'audit@firm.mu', 'auditor', True),
    ]:
        user = User(first_name=first, last_name=last, email=email, role=role,
                    status='active', mfa_enabled=mfa)
        user.set_password(ADMIN_PASSWORD)
        db.session.add(user)

    db.session.flush()
    return admin


def seed_properties(plans):
    developments = []

    for entry in NAMED_PROPERTIES:
        developments.append(build_property(entry, plans))

    # Synthetic portfolio, balanced against the platform targets below.
    index = 0
    for plan_code, count, base_units, base_parking, base_storage in SYNTHETIC_BUCKETS:
        for offset in range(count):
            place, district = SYNTHETIC_PLACES[index % len(SYNTHETIC_PLACES)]
            suffix = SYNTHETIC_NAMES[(index // len(SYNTHETIC_PLACES)) % len(SYNTHETIC_NAMES)]
            drift = (offset % 7) - 3  # small deterministic size variation
            units = max(6, base_units + drift * 2)
            developments.append(build_property({
                'code': f'SYN-{index + 1:03d}',
                'name': f'{place} {suffix}',
                'city': place,
                'district': district,
                'syndic': f'Syndic Partner {index % 12 + 1}',
                'syndic_email': f'partner{index % 12 + 1}@syndic.mu',
                'plan': plan_code,
                'status': 'active',
                'pipeline_stage': 'go_live',
                'launch': date(2025, (index % 12) + 1, 1),
                'units': units,
                'parking': max(4, base_parking + drift),
                'ev': max(0, (base_parking + drift) // 5),
                'storage': max(2, base_storage + drift),
                'facilities': 1 + (index % 3),
                'portal_users': int(units * 1.05),
                'whatsapp': plan_code != 'basic',
                'type': 'apartment' if index % 2 else 'gated',
                'done_steps': 8,
            }, plans))
            index += 1

    db.session.flush()
    balance_portfolio(developments)
    return developments


def build_property(entry, plans):
    development = Development(
        code=entry['code'],
        name=entry['name'],
        development_type=entry['type'],
        address_line_1=f"{entry['name']}, {entry['city']}",
        city=entry['city'],
        district=entry['district'],
        country='Mauritius',
        status=entry['status'],
        pipeline_stage=entry['pipeline_stage'],
        launch_date=entry['launch'],
        syndic_manager_name=entry['syndic'],
        syndic_manager_email=entry['syndic_email'],
        unit_count=entry['units'],
        parking_count=entry['parking'],
        ev_parking_count=entry['ev'],
        storage_count=entry['storage'],
        facility_count=entry['facilities'],
        user_count=entry['portal_users'],
        whatsapp_enabled=entry['whatsapp'],
    )
    db.session.add(development)
    db.session.flush()

    db.session.add(DevelopmentSettings(
        development_id=development.id,
        billing_day=1,
        arrears_grace_days=15,
        penalty_rate_percent=1.5,
        allow_online_payments=True,
        allow_resident_voting=entry['plan'] == 'premium',
    ))

    done = entry['done_steps']
    for sequence, title in enumerate(ONBOARDING_STAGES):
        if sequence < done:
            status = 'done'
        elif sequence == done:
            status = 'current'
        else:
            status = 'pending'
        db.session.add(OnboardingStep(
            development_id=development.id,
            sequence=sequence,
            title=title,
            status=status,
            completed_at=datetime.now(timezone.utc) if status == 'done' else None,
        ))

    plan = plans[entry['plan']]
    subscription_status = {
        'active': 'active', 'trial': 'trial', 'suspended': 'suspended',
    }.get(entry['status'], 'trial')
    db.session.add(Subscription(
        development_id=development.id,
        plan_id=plan.id,
        setup_fee_amount=0,  # free-setup promo
        monthly_unit_rate=plan.monthly_unit_rate,
        vat_rate=plan.vat_rate,
        active_units_count=entry['units'],
        status=subscription_status,
        start_date=entry['launch'],
    ))
    return development


def balance_portfolio(developments):
    """Spread a correction across the synthetic properties so totals hit the targets."""
    synthetic = [d for d in developments if d.code.startswith('SYN-')]
    if not synthetic:
        return

    # field -> (platform target, per-property floor)
    fields = {
        'unit_count': (TARGET_UNITS, 6),
        'parking_count': (TARGET_PARKING, 2),
        'ev_parking_count': (TARGET_EV, 0),
        'storage_count': (TARGET_STORAGE, 1),
        'user_count': (TARGET_PORTAL_USERS, 0),
    }

    for field, (target, floor) in fields.items():
        delta = target - sum(getattr(d, field) for d in developments)
        if not delta:
            continue
        step = 1 if delta > 0 else -1
        index = 0
        # Bounded so an all-at-floor portfolio can never spin here.
        for _ in range(len(synthetic) * 400):
            if delta == 0:
                break
            item = synthetic[index % len(synthetic)]
            index += 1
            value = getattr(item, field)
            if step < 0 and value <= floor:
                continue
            setattr(item, field, value + step)
            delta -= step

    for item in synthetic:
        if item.subscription:
            item.subscription.active_units_count = item.unit_count
    db.session.flush()


def seed_property_users(developments):
    """Provision the console-visible accounts for the six named properties."""
    named = {d.code: d for d in developments if not d.code.startswith('SYN-')}

    people = [
        ('Mr', 'Soobrayen', 'soobrayen@syndic.mu', 'syndic_manager', 'LES-PALM', None, True, True),
        ('Mrs', 'Finance', 'fin@syndic.mu', 'finance_officer', 'LES-PALM', None, True, True),
        ('Rajesh', 'Moonien', 'rajesh@email.com', 'co_owner', 'LES-PALM', '4B', False, True),
        ('Mrs', 'Lee', 'lee@email.com', 'tenant', 'LES-PALM', '1B', False, True),
        ('QuickFix', 'Plumbing', 'info@quickfix.mu', 'contractor', None, None, False, True),
        ('Mr', 'Doobary', 'doobary@syndic.mu', 'syndic_manager', 'PALM-GRV', None, True, True),
        ('Mrs', 'Doorgakant', 'doorgakant@syndic.mu', 'syndic_manager', 'HARB-VIEW', None, True, True),
        ('Mr', 'Jugnauth', 'jugnauth@syndic.mu', 'syndic_manager', 'TAMA-BAY', None, True, True),
        ('Anil', 'Ramgoolam', 'anil@email.com', 'co_owner', 'PALM-GRV', '12A', False, True),
        ('Sunita', 'Beeharry', 'sunita@email.com', 'co_owner', 'TAMA-BAY', '7C', False, True),
        ('Old', 'User', 'old@email.com', 'co_owner', 'PALM-GRV', '3A', False, False),
    ]

    for first, last, email, role, code, unit, mfa, whatsapp in people:
        development = named.get(code) if code else None
        user = User(
            first_name=first,
            last_name=last,
            email=email,
            role=role,
            status='inactive' if email == 'old@email.com' else 'active',
            development_id=development.id if development else None,
            unit_label=unit,
            mfa_enabled=mfa,
            whatsapp_enabled=whatsapp,
            last_login_at=datetime.now(timezone.utc) - timedelta(days=90 if email == 'old@email.com' else 1),
        )
        user.set_password(ADMIN_PASSWORD)
        db.session.add(user)

    db.session.flush()


def seed_subscription_invoices(developments):
    today = date.today()
    period_start = today.replace(day=1)
    period_end = (period_start + timedelta(days=32)).replace(day=1) - timedelta(days=1)

    sequence = 1
    for development in developments:
        subscription = development.subscription
        if subscription is None or subscription.status not in ('active', 'trial'):
            continue
        net = subscription.mrr
        vat = round(net * float(subscription.vat_rate or 0) / 100, 2)
        db.session.add(SubscriptionInvoice(
            subscription_id=subscription.id,
            invoice_no=f'PLT-{today.year}{today.month:02d}-{sequence:04d}',
            billing_period_start=period_start,
            billing_period_end=period_end,
            net_amount=net,
            vat_amount=vat,
            gross_amount=round(net + vat, 2),
            status='paid' if subscription.status == 'active' else 'issued',
        ))
        sequence += 1


def seed_feature_flag_overrides(developments):
    pool = [d for d in developments if not d.code.startswith('SYN-')]
    for flag in FeatureFlag.query.all():
        wanted = FLAG_OVERRIDE_COUNTS.get(flag.feature_key, 0)
        for offset in range(min(wanted, len(pool))):
            db.session.add(FeatureFlagOverride(
                feature_flag_id=flag.id,
                development_id=pool[offset].id,
                is_enabled=not flag.is_enabled,
            ))


def seed_monitoring():
    for order, (key, label, group, value, target, icon, ok) in enumerate(SYSTEM_METRICS):
        db.session.add(SystemMetric(
            metric_key=key, label=label, group_key=group, value_text=value,
            target_text=target, icon=icon, is_ok=ok, sort_order=order,
        ))

    now = datetime.now(timezone.utc)
    for message, severity, minutes_ago in SYSTEM_ALERTS:
        db.session.add(SystemAlert(
            message=message,
            severity=severity,
            occurred_at=now - timedelta(minutes=minutes_ago),
        ))


def seed_whatsapp(developments):
    for order, (name, category, status, sent, delivered, read, cost) in enumerate(WHATSAPP_TEMPLATES):
        db.session.add(WhatsAppTemplate(
            name=name, category=category, status=status, sent_30d=sent,
            delivered_pct=delivered, read_pct=read, cost_per_message=cost,
            sort_order=order,
        ))

    named = {d.code: d for d in developments}
    for display, phone, code, monthly in [
        ('Les Palmiers Res.', '+230 5800 1234', 'LES-PALM', 3420),
        ('Palm Grove Estate', '+230 5800 5678', 'PALM-GRV', 5100),
        ('Platform Default', '+230 5800 9012', None, 33780),
    ]:
        development = named.get(code) if code else None
        db.session.add(WhatsAppNumber(
            development_id=development.id if development else None,
            display_name=display,
            phone_number=phone,
            status='Connected',
            monthly_messages=monthly,
        ))

    today = date.today()
    db.session.add(WhatsAppStat(
        period_month=f'{today.year:04d}-{today.month:02d}',
        total_sent=42300, delivered=39762, read=31725, failed=538,
        queue_depth=3, monthly_cost=42000,
    ))


def seed_integrations(admin):
    for order, (name, protocol, direction, status, last_sync, requests) in enumerate(INTEGRATIONS):
        db.session.add(Integration(
            name=name, protocol=protocol, direction=direction, status=status,
            last_sync_label=last_sync, requests_per_day=requests, sort_order=order,
        ))

    raw, prefix, key_hash = ApiKey.generate()
    db.session.add(ApiKey(name='Portfolio reporting (read-only)', key_prefix=prefix,
                          key_hash=key_hash, created_by_id=admin.id))


def seed_revenue_trend():
    """Twelve monthly snapshots ending at the portfolio's real current MRR."""
    db.session.flush()
    current = round(sum(s.mrr for s in Subscription.query.all()
                        if s.status in ('trial', 'active')), 2)

    today = date.today()
    # Model a steady climb to today's figure, roughly +75% across the year.
    start = current / 1.75
    for offset in range(12):
        month_index = today.month - (11 - offset)
        year = today.year
        while month_index <= 0:
            month_index += 12
            year -= 1
        share = start + (current - start) * (offset / 11)
        db.session.add(RevenueSnapshot(
            period_month=f'{year:04d}-{month_index:02d}',
            mrr_amount=round(share, 2),
        ))
    return current


def seed_audit_log(developments):
    by_name = {d.name: d for d in developments}
    now = datetime.now(timezone.utc)

    for action, entity, category, user_label, dev_label, detail, minutes_ago in AUDIT_ENTRIES:
        development = by_name.get(dev_label)
        db.session.add(AuditLog(
            occurred_at=now - timedelta(minutes=minutes_ago),
            user_label=user_label,
            development_id=development.id if development else None,
            development_label=dev_label,
            action=action,
            entity=entity,
            category=category,
            detail=detail,
        ))


def report(mrr):
    total_units = db.session.query(db.func.sum(Development.unit_count)).scalar() or 0
    total_parking = db.session.query(db.func.sum(Development.parking_count)).scalar() or 0
    total_storage = db.session.query(db.func.sum(Development.storage_count)).scalar() or 0
    total_portal = db.session.query(db.func.sum(Development.user_count)).scalar() or 0

    print('\nSeed complete.')
    print(f'  Properties      {Development.query.count()}')
    print(f'  Units           {total_units:,}')
    print(f'  Parking bays    {total_parking:,}')
    print(f'  Storage units   {total_storage:,}')
    print(f'  Portal users    {total_portal:,}')
    print(f'  Console users   {User.query.count()}')
    print(f'  MRR             MUR {mrr:,.2f}')
    print(f'\n  Sign in with    {ADMIN_EMAIL} / {ADMIN_PASSWORD}\n')


if __name__ == '__main__':
    main()
