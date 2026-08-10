"""
Reference data for a fresh platform.

The plan catalog and feature flag list are inserted during first-run setup so a
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
        'is_popular': False,
        'features': [
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
        'is_popular': True,
        'features': [
            'Everything in Basic +',
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
        'is_popular': False,
        'features': [
            'Everything in Silver +',
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

# Shown as a banner on the Onboarding and Subscriptions screens.
SETUP_FEE_PROMO = {
    'headline': 'Setup Fee: FREE for First 2 Years',
    'detail': 'After March 2028: MUR 5,000 + VAT one-time',
    'ends_on': '2028-03-31',
    'standard_fee': 5000,
}
