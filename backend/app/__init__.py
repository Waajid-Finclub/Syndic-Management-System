"""SyndicMS admin console — Flask application factory."""
import os

from flask import Flask, jsonify, request

from .config import DEFAULT_SECRET_KEY, Config
from .extensions import cors, db, login_manager
from .security import apply_security_headers, csrf_protect


def create_app(config_object=Config):
    app = Flask(__name__, instance_relative_config=False)
    app.config.from_object(config_object)

    # Match `/api/users` and `/api/users/` on the same rule. Without this Flask
    # 308s to the canonical trailing-slash form, while the Next.js proxy strips
    # the trailing slash again — an endless redirect the browser reports as
    # "Failed to fetch".
    app.url_map.strict_slashes = False

    _validate_secret(app)
    _ensure_instance_folder(app)

    db.init_app(app)
    login_manager.init_app(app)
    _configure_cors(app)

    login_manager.session_protection = 'strong'

    from .models import User  # noqa: WPS433 — imported here so models bind to db

    @login_manager.user_loader
    def load_user(user_id):
        return db.session.get(User, int(user_id))

    @login_manager.unauthorized_handler
    def unauthorized():
        return jsonify({'error': 'Authentication required'}), 401

    _register_blueprints(app)
    _register_hooks(app)

    if app.config.get('PREPARE_DATABASE_ON_STARTUP', True):
        with app.app_context():
            db.create_all()

    return app


def _validate_secret(app):
    if app.config.get('REQUIRE_STRONG_SECRET') and app.config.get('SECRET_KEY') == DEFAULT_SECRET_KEY:
        raise RuntimeError(
            'SECRET_KEY must be set to a strong production value when REQUIRE_STRONG_SECRET is on.'
        )


def _ensure_instance_folder(app):
    uri = app.config.get('SQLALCHEMY_DATABASE_URI', '')
    if not uri.startswith('sqlite:///'):
        return
    path = uri.replace('sqlite:///', '', 1)
    folder = os.path.dirname(path)
    if folder:
        os.makedirs(folder, exist_ok=True)


def _configure_cors(app):
    origins = app.config.get('CORS_ORIGINS') or []
    if '*' in origins:
        raise RuntimeError('Wildcard CORS is not allowed while sessions are credentialed.')
    cors.init_app(
        app,
        resources={r'/api/*': {'origins': origins}},
        supports_credentials=True,
        allow_headers=app.config.get('CORS_ALLOW_HEADERS'),
    )


def _register_blueprints(app):
    from .routes import (
        audit_bp,
        auth_bp,
        client_admins_bp,
        developments_bp,
        feature_flags_bp,
        impersonation_bp,
        integrations_bp,
        monitoring_bp,
        onboarding_bp,
        overview_bp,
        resident_bp,
        setup_bp,
        subscriptions_bp,
        syndic_bp,
        users_bp,
        whatsapp_bp,
    )

    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(setup_bp, url_prefix='/api/setup')
    app.register_blueprint(overview_bp, url_prefix='/api/platform')
    app.register_blueprint(developments_bp, url_prefix='/api/developments')
    app.register_blueprint(onboarding_bp, url_prefix='/api/onboarding')
    app.register_blueprint(users_bp, url_prefix='/api/users')
    app.register_blueprint(subscriptions_bp, url_prefix='/api/subscriptions')
    app.register_blueprint(feature_flags_bp, url_prefix='/api/feature-flags')
    app.register_blueprint(monitoring_bp, url_prefix='/api/monitoring')
    app.register_blueprint(audit_bp, url_prefix='/api/audit')
    app.register_blueprint(whatsapp_bp, url_prefix='/api/whatsapp')
    app.register_blueprint(integrations_bp, url_prefix='/api/integrations')
    app.register_blueprint(client_admins_bp, url_prefix='/api/client-admins')
    app.register_blueprint(impersonation_bp, url_prefix='/api/impersonate')

    # The three consoles, each with its own login surface and role family.
    app.register_blueprint(syndic_bp, url_prefix='/api/syndic')
    app.register_blueprint(resident_bp, url_prefix='/api/resident')


def _register_hooks(app):
    @app.before_request
    def guard_request():
        if app.config.get('API_REQUEST_DEBUG'):
            app.logger.info('[api] %s %s', request.method, request.path)
        return csrf_protect()

    @app.after_request
    def secure_response(response):
        return apply_security_headers(response)

    @app.route('/api/health', methods=['GET'])
    def health():
        return jsonify({'status': 'ok', 'service': app.config.get('PLATFORM_NAME', 'SyndicMS')})

    @app.errorhandler(404)
    def not_found(_error):
        if request.path.startswith('/api/'):
            return jsonify({'error': 'Not found'}), 404
        return jsonify({'error': 'Not found'}), 404

    @app.errorhandler(500)
    def server_error(_error):
        db.session.rollback()
        return jsonify({'error': 'Something went wrong on the server'}), 500
