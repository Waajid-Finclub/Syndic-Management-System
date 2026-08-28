"""
Access control for the Syndic Admin console API.

Three things guard every endpoint under /api/syndic:

1. `@syndic_required` — the caller is an active account belonging to layer 2,
   or a super admin inside an impersonation session. Co-owners are refused even
   though they are authenticated, exactly as syndic accounts are refused at the
   resident login.
2. The development. Every query is scoped to `current_development()`, which is
   read from the account (or from the impersonation session), never from the
   request. There is no endpoint that takes a development id, so one client's
   admin cannot reach another client's building by editing a URL.
3. The capability. `ensure(module, capability)` consults the layer 2 matrix in
   permissions.SYNDIC_ROLE_MATRIX — the same shape the master console uses, so
   one renderer draws both permission screens.

Impersonation lives here rather than in the auth route because scoping is the
only thing it changes: a super admin with `syndic_impersonation` in their
session is treated as a manager of that one development, and every write they
make is still audited under their own name and flagged as impersonated.
"""
from functools import wraps

from flask import g, jsonify, session
from flask_login import current_user

from ...extensions import db
from ...models import Development
from ...permissions import (
    SYNDIC_ROLE_KEYS,
    has_syndic_permission,
    syndic_effective_matrix,
)

IMPERSONATION_KEY = 'syndic_impersonation'


# --- Who is calling ---------------------------------------------------------

def is_impersonating():
    return (
        getattr(current_user, 'is_authenticated', False)
        and getattr(current_user, 'role', None) == 'super_admin'
        and session.get(IMPERSONATION_KEY) is not None
    )


def is_syndic(user):
    return (
        user is not None
        and getattr(user, 'is_authenticated', False)
        and getattr(user, 'role', None) in SYNDIC_ROLE_KEYS
        and getattr(user, 'status', None) == 'active'
        and getattr(user, 'development_id', None) is not None
    )


def current_development_id():
    """The development this request is scoped to, or None."""
    if is_impersonating():
        return session.get(IMPERSONATION_KEY)
    if is_syndic(current_user):
        return current_user.development_id
    return None


def current_development():
    """The Development row for this request, cached for its duration."""
    cached = getattr(g, '_syndic_development', None)
    if cached is not None:
        return cached
    development_id = current_development_id()
    if development_id is None:
        return None
    development = db.session.get(Development, development_id)
    g._syndic_development = development
    return development


def syndic_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not getattr(current_user, 'is_authenticated', False):
            return jsonify({'error': 'Authentication required'}), 401
        if not is_syndic(current_user) and not is_impersonating():
            return jsonify({
                'error': 'This account does not have access to the syndic console',
            }), 403
        if current_development() is None:
            # The account names a development that no longer exists — a data
            # problem the client cannot fix, so name it rather than 500.
            return jsonify({
                'error': 'This account is not linked to an active development. '
                         'Contact the platform operator.',
            }), 409
        return view(*args, **kwargs)

    return wrapped


# --- Capability checks ------------------------------------------------------

def ensure(module, capability):
    """Return a 403 response tuple when the caller lacks the capability."""
    if has_syndic_permission(current_user, module, capability):
        return None
    return jsonify({
        'error': 'You do not have permission to perform this action',
        'module': module,
        'capability': capability,
    }), 403


def require(module, capability):
    """Decorator combining `syndic_required` with one capability check."""
    def decorator(view):
        @wraps(view)
        @syndic_required
        def wrapped(*args, **kwargs):
            denied = ensure(module, capability)
            if denied is not None:
                return denied
            return view(*args, **kwargs)

        return wrapped

    return decorator


def effective():
    return syndic_effective_matrix(current_user)


# --- Scoping helpers --------------------------------------------------------

def scoped(model):
    """
    Constrain any development-scoped model to the caller's own development.

    Every list query in this console starts here. Passing a model without a
    development_id column is a programming error, so it raises rather than
    silently returning everything.
    """
    column = getattr(model, 'development_id', None)
    if column is None:
        raise AttributeError(f'{model.__name__} is not development-scoped')
    return model.query.filter(column == current_development_id())


def owned(model, record_id):
    """
    Fetch one record by id, but only if it belongs to this development.

    Returns (record, None) or (None, error_response). Using a 404 rather than a
    403 for a record in another development is deliberate: confirming that an
    id exists elsewhere is itself a leak.
    """
    record = db.session.get(model, record_id)
    if record is None or getattr(record, 'development_id', None) != current_development_id():
        return None, (jsonify({'error': f'{model.__name__} not found'}), 404)
    return record, None


def actor_label():
    """How this action should read in an audit row or a message thread."""
    name = getattr(current_user, 'name', 'System')
    if is_impersonating():
        return f'{name} (platform support)'
    return name
