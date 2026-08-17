"""Configuration for the SyndicMS admin console backend."""
import os
from datetime import timedelta

from dotenv import load_dotenv

basedir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
DEFAULT_SECRET_KEY = 'syndic-ms-dev-secret-key-change-in-production'
PRODUCTION_ENVS = {'production', 'prod'}


def _load_environment_files():
    backend_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    project_root = os.path.abspath(os.path.join(backend_root, '..'))
    for path in (
        os.path.join(project_root, '.env'),
        os.path.join(backend_root, '.env'),
    ):
        load_dotenv(path, override=False)


_load_environment_files()


def _env_bool(name, default=False):
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {'1', 'true', 'yes', 'on'}


def _env_list(name, default):
    return [item.strip() for item in os.environ.get(name, default).split(',') if item.strip()]


def _database_url():
    value = os.environ.get(
        'DATABASE_URL',
        f'sqlite:///{os.path.join(basedir, "instance", "syndic_ms.db")}',
    )
    # Managed MySQL services expose mysql:// URLs, while SQLAlchemy needs an
    # installed DBAPI driver in the scheme. PyMySQL is pure Python.
    if value.startswith('mysql://'):
        return value.replace('mysql://', 'mysql+pymysql://', 1)
    return value


class Config:
    APP_ENV = os.environ.get('APP_ENV', os.environ.get('FLASK_ENV', 'development')).lower()
    IS_PRODUCTION = APP_ENV in PRODUCTION_ENVS
    SECRET_KEY = os.environ.get('SECRET_KEY', DEFAULT_SECRET_KEY)
    REQUIRE_STRONG_SECRET = _env_bool('REQUIRE_STRONG_SECRET', IS_PRODUCTION)

    SQLALCHEMY_DATABASE_URI = _database_url()
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {'pool_pre_ping': True}
    PREPARE_DATABASE_ON_STARTUP = _env_bool('PREPARE_DATABASE_ON_STARTUP', True)

    # Session configuration.
    SESSION_COOKIE_NAME = os.environ.get('SESSION_COOKIE_NAME', 'syndic_ms_session')
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SECURE = _env_bool('SESSION_COOKIE_SECURE', IS_PRODUCTION)
    SESSION_COOKIE_SAMESITE = os.environ.get('SESSION_COOKIE_SAMESITE', 'Lax')
    SESSION_REFRESH_EACH_REQUEST = False
    PERMANENT_SESSION_LIFETIME = timedelta(
        seconds=int(os.environ.get('PERMANENT_SESSION_LIFETIME_SECONDS', 86400))
    )

    # Flask-Login remember cookies are disabled by default; sessions expire instead.
    REMEMBER_COOKIE_ENABLED = _env_bool('REMEMBER_COOKIE_ENABLED', False)
    REMEMBER_COOKIE_NAME = os.environ.get('REMEMBER_COOKIE_NAME', 'syndic_ms_remember')
    REMEMBER_COOKIE_HTTPONLY = True
    REMEMBER_COOKIE_SECURE = _env_bool('REMEMBER_COOKIE_SECURE', IS_PRODUCTION)
    REMEMBER_COOKIE_SAMESITE = os.environ.get('REMEMBER_COOKIE_SAMESITE', 'Lax')

    # CSRF protection for cookie-authenticated API writes.
    CSRF_ENABLED = _env_bool('CSRF_ENABLED', True)
    CSRF_HEADER_NAME = os.environ.get('CSRF_HEADER_NAME', 'X-CSRF-Token')

    # Next.js dev/prod frontends that may call the Flask API with session cookies.
    CORS_ORIGINS = _env_list('CORS_ORIGINS', 'http://127.0.0.1:3000,http://localhost:3000')
    CORS_ALLOW_HEADERS = ['Content-Type', CSRF_HEADER_NAME]

    # Security headers.
    SECURITY_HEADERS_ENABLED = _env_bool('SECURITY_HEADERS_ENABLED', True)
    SECURITY_HSTS_SECONDS = int(os.environ.get('SECURITY_HSTS_SECONDS', 31536000 if IS_PRODUCTION else 0))
    API_REQUEST_DEBUG = _env_bool('API_REQUEST_DEBUG', False)

    # Platform defaults used across the console.
    PLATFORM_NAME = os.environ.get('PLATFORM_NAME', 'SyndicMS')
    PLATFORM_CURRENCY = os.environ.get('PLATFORM_CURRENCY', 'MUR')
    PLATFORM_VAT_RATE = float(os.environ.get('PLATFORM_VAT_RATE', 15))
    BUSINESS_TIMEZONE = os.environ.get('BUSINESS_TIMEZONE', 'Indian/Mauritius')

    # Which implementation of services.payment_gateway.PaymentGateway takes
    # resident payments. 'simulated' authorises without an acquirer; the ledger
    # it writes is real either way.
    PAYMENT_GATEWAY = os.environ.get('PAYMENT_GATEWAY', 'simulated')
    APP_PUBLIC_URL = os.environ.get('APP_PUBLIC_URL')

    MAX_CONTENT_LENGTH = 10 * 1024 * 1024
