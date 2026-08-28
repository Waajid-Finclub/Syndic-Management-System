from .audit import audit_bp
from .auth import auth_bp
from .client_admins import client_admins_bp
from .developments import developments_bp
from .feature_flags import feature_flags_bp
from .impersonation import impersonation_bp
from .integrations import integrations_bp
from .monitoring import monitoring_bp
from .onboarding import onboarding_bp
from .overview import overview_bp
from .resident import resident_bp
from .setup import setup_bp
from .subscriptions import subscriptions_bp
from .syndic import syndic_bp
from .users import users_bp
from .whatsapp import whatsapp_bp

__all__ = [
    'audit_bp',
    'auth_bp',
    'client_admins_bp',
    'developments_bp',
    'feature_flags_bp',
    'impersonation_bp',
    'integrations_bp',
    'monitoring_bp',
    'onboarding_bp',
    'overview_bp',
    'resident_bp',
    'setup_bp',
    'subscriptions_bp',
    'syndic_bp',
    'users_bp',
    'whatsapp_bp',
]
