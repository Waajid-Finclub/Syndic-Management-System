"""Security helpers for API sessions."""
import secrets

from flask import current_app, jsonify, request, session

UNSAFE_METHODS = {'POST', 'PUT', 'PATCH', 'DELETE'}


def get_csrf_token():
    token = session.get('csrf_token')
    if not token:
        token = secrets.token_urlsafe(32)
        session['csrf_token'] = token
    return token


def csrf_protect():
    if not current_app.config.get('CSRF_ENABLED', True):
        return None
    if request.method not in UNSAFE_METHODS:
        return None
    if not request.path.startswith('/api/'):
        return None

    expected = session.get('csrf_token')
    provided = request.headers.get(current_app.config.get('CSRF_HEADER_NAME', 'X-CSRF-Token'))
    if not expected or not provided or not secrets.compare_digest(str(expected), str(provided)):
        return jsonify({'error': 'CSRF token missing or invalid'}), 400
    return None


def apply_security_headers(response):
    if not current_app.config.get('SECURITY_HEADERS_ENABLED', True):
        return response

    response.headers.setdefault('X-Content-Type-Options', 'nosniff')
    response.headers.setdefault('X-Frame-Options', 'DENY')
    response.headers.setdefault('Referrer-Policy', 'same-origin')
    response.headers.setdefault('Cross-Origin-Opener-Policy', 'same-origin')

    hsts_seconds = current_app.config.get('SECURITY_HSTS_SECONDS', 0)
    if hsts_seconds:
        response.headers.setdefault(
            'Strict-Transport-Security',
            f'max-age={int(hsts_seconds)}; includeSubDomains',
        )
    return response
