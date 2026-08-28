"""
Reference data for a fresh platform.

The plan catalog, feature flag list and WhatsApp template catalog are inserted during first-run setup so a
brand-new install already reflects the commercial model in the SMS architecture
document: MUR 100/175/250 per unit per month, 15% VAT, free setup fee promo.
"""

DEFAULT_PLANS = [
    {
        'code': 'basic',
        'name': 'Basic',
        'monthly_unit_rate': 100,
        'vat_rate': 15,
        'setup_fee_amount': 0,
        'admin_seats': 2,
        'is_popular': False,
        'features': [
            '2 syndic admin seats',
            'Co-owner mobile app',
            'Service charge billing',
            'Online payments',
            'Basic document storage',
            'Account monitoring',
            'Push notifications',
        ],
    },
    {
        'code': 'silver',
        'name': 'Silver',
        'monthly_unit_rate': 175,
        'vat_rate': 15,
        'setup_fee_amount': 0,
        'admin_seats': 5,
        'is_popular': True,
        'features': [
            'Everything in Basic, 5 admin seats +',
            'Maintenance & work orders',
            'Vendor management',
            'WhatsApp notifications',
            'Announcements & comms',
            'Parking/storage management',
            'Facility booking',
        ],
    },
    {
        'code': 'premium',
        'name': 'Premium',
        'monthly_unit_rate': 250,
        'vat_rate': 15,
        'setup_fee_amount': 0,
        'admin_seats': 12,
        'is_popular': False,
        'features': [
            'Everything in Silver, 12 admin seats +',
            'Full accounting',
            'Budget management',
            'Reserve/sinking funds',
            'Bank reconciliation',
            'AGM/EGM governance',
            'Digital voting',
            'EV charging billing',
            'API access',
            'Analytics & BI',
            'Priority support',
        ],
    },
]

DEFAULT_FEATURE_FLAGS = [
    {'feature_key': 'whatsapp-notifications', 'description': 'WhatsApp Business API for notifications', 'is_enabled': True, 'scope': 'Global'},
    {'feature_key': 'whatsapp-inbound', 'description': 'Two-way WhatsApp (inbound parsing)', 'is_enabled': False, 'scope': 'Pilot'},
    {'feature_key': 'ev-charging-billing', 'description': 'EV session tracking and per-kWh billing', 'is_enabled': True, 'scope': 'Premium'},
    {'feature_key': 'e-voting', 'description': 'Digital share-weighted AGM/EGM voting', 'is_enabled': True, 'scope': 'Premium'},
    {'feature_key': 'parking-rental', 'description': 'Syndic-managed parking bay rentals', 'is_enabled': True, 'scope': 'Silver+'},
    {'feature_key': 'facility-booking', 'description': 'Pool/gym/hall reservation system', 'is_enabled': True, 'scope': 'Silver+'},
    {'feature_key': 'storage-management', 'description': 'Storage unit allocation & rental', 'is_enabled': True, 'scope': 'Silver+'},
    {'feature_key': 'bank-reconciliation', 'description': 'Automated bank statement matching', 'is_enabled': True, 'scope': 'Premium'},
    {'feature_key': 'ai-invoice-ocr', 'description': 'AI supplier invoice scanning', 'is_enabled': False, 'scope': 'Per Property'},
    {'feature_key': 'mobile-biometrics', 'description': 'Biometric auth for mobile app', 'is_enabled': True, 'scope': 'Global'},
    {'feature_key': 'free-setup-promo', 'description': 'Waive setup fee (2-year promo)', 'is_enabled': True, 'scope': 'Global'},
    {'feature_key': 'visitor-qr-access', 'description': 'QR code visitor parking passes', 'is_enabled': True, 'scope': 'Silver+'},
]

DEFAULT_WHATSAPP_TEMPLATES = [
    {
        'name': 'invoice_notification',
        'category': 'UTILITY',
        'status': 'approved',
        'body': (
            'Hello {{name}}, your service charge invoice for {{period}} is ready. '
            'Amount due: MUR {{amount}}, payable by {{due_date}}. '
            'Open the SyndicMS app to view the breakdown or pay online.'
        ),
        'cost_per_message': 0.85,
    },
    {
        'name': 'payment_reminder',
        'category': 'UTILITY',
        'status': 'approved',
        'body': (
            'Hello {{name}}, MUR {{amount}} remains outstanding for unit {{unit}}. '
            'Please settle it by {{due_date}} or contact your syndic manager if this is under review.'
        ),
        'cost_per_message': 0.85,
    },
    {
        'name': 'payment_receipt',
        'category': 'UTILITY',
        'status': 'approved',
        'body': (
            'Thank you {{name}}. We received MUR {{amount}} for unit {{unit}}. '
            'Receipt {{receipt_ref}} is available in your SyndicMS app.'
        ),
        'cost_per_message': 0.85,
    },
    {
        'name': 'maintenance_update',
        'category': 'UTILITY',
        'status': 'approved',
        'body': (
            '{{development}} maintenance update: {{summary}}. '
            'Expected on {{date}} between {{start_time}} and {{end_time}}.'
        ),
        'cost_per_message': 0.85,
    },
    {
        'name': 'meeting_notice',
        'category': 'UTILITY',
        'status': 'approved',
        'body': (
            'Notice of {{meeting_type}} for {{development}} on {{date}} at {{time}}, {{venue}}. '
            'Agenda and proxy documents are available in the SyndicMS app.'
        ),
        'cost_per_message': 0.85,
    },
    {
        'name': 'emergency_alert',
        'category': 'UTILITY',
        'status': 'approved',
        'body': 'URGENT - {{development}}: {{summary}}. {{instruction}} Contact {{contact}} for help.',
        'cost_per_message': 0.85,
    },
    {
        'name': 'facility_booking',
        'category': 'UTILITY',
        'status': 'approved',
        'body': '{{facility}} booked for unit {{unit}} on {{date}} at {{time}}. Manage bookings in the SyndicMS app.',
        'cost_per_message': 0.85,
    },
    {
        'name': 'visitor_pass',
        'category': 'UTILITY',
        'status': 'approved',
        'body': (
            'Visitor pass {{pass_code}} for {{visitor_name}} is valid at {{development}} '
            'on {{date}} until {{expires_at}}. Show this code at the gate.'
        ),
        'cost_per_message': 0.85,
    },
    {
        'name': 'general_notice',
        'category': 'UTILITY',
        'status': 'approved',
        'body': '{{development}} notice - {{title}}: {{message}}',
        'cost_per_message': 0.85,
    },
    {
        'name': 'welcome_onboard',
        'category': 'MARKETING',
        'status': 'review',
        'body': (
            'Welcome to {{development}}, {{name}}. Your SyndicMS account for unit {{unit}} is ready. '
            'Sign in at {{app_url}}.'
        ),
        'cost_per_message': 1.50,
    },
]
# Shown as a banner on the Onboarding and Subscriptions screens.
SETUP_FEE_PROMO = {
    'headline': 'Setup Fee: FREE for First 2 Years',
    'detail': 'After March 2028: MUR 5,000 + VAT one-time',
    'ends_on': '2028-03-31',
    'standard_fee': 5000,
}
