"""
Module-level permission catalog and enforcement helpers for the admin console.

Access is expressed per module as a set of capabilities. A super_admin always
has every capability. platform_admin, support_user and auditor are fixed
archetypes that mirror the role matrix in the SMS architecture document.

Note the distinction between two role families:

* CONSOLE_ROLES  — roles that may sign in to this admin console.
* MANAGED_ROLES  — every role that may exist in the platform user registry.
  Syndic managers, finance officers, co-owners, tenants and contractors are
  administered from here but sign in to the syndic console / resident app.
"""
from functools import wraps

from flask import jsonify
from flask_login import current_user

# --- Capability vocabulary -------------------------------------------------

CAPABILITIES = [
    {'key': 'view', 'label': 'View', 'description': 'Open the module and read or export its data'},
    {'key': 'create', 'label': 'Create', 'description': 'Add new records'},
    {'key': 'edit', 'label': 'Edit', 'description': 'Change existing records'},
    {'key': 'delete', 'label': 'Delete', 'description': 'Remove records'},
    {'key': 'export', 'label': 'Export', 'description': 'Generate or download reports'},
]
CAPABILITY_KEYS = [c['key'] for c in CAPABILITIES]

# --- Module catalog (order defines display order) --------------------------

MODULES = [
    {'key': 'overview', 'label': 'Platform Overview', 'group': 'Platform', 'capabilities': ['view', 'export']},
    {'key': 'properties', 'label': 'Client Properties', 'group': 'Platform', 'capabilities': ['view', 'create', 'edit', 'delete', 'export']},
    {'key': 'onboarding', 'label': 'Onboarding', 'group': 'Platform', 'capabilities': ['view', 'create', 'edit']},
    {'key': 'users', 'label': 'Users & Roles', 'group': 'Administration', 'capabilities': ['view', 'create', 'edit', 'delete']},
    {'key': 'subscriptions', 'label': 'Subscriptions', 'group': 'Administration', 'capabilities': ['view', 'create', 'edit', 'delete']},
    {'key': 'feature_flags', 'label': 'Feature Flags', 'group': 'Administration', 'capabilities': ['view', 'create', 'edit', 'delete']},
    {'key': 'monitoring', 'label': 'System Monitoring', 'group': 'System', 'capabilities': ['view']},
    {'key': 'audit', 'label': 'Audit Log', 'group': 'System', 'capabilities': ['view', 'export']},
    {'key': 'whatsapp', 'label': 'WhatsApp Status', 'group': 'System', 'capabilities': ['view', 'create', 'edit', 'export']},
    {'key': 'integrations', 'label': 'API & Integrations', 'group': 'System', 'capabilities': ['view', 'create', 'edit', 'delete']},
]

MODULE_KEYS = [m['key'] for m in MODULES]
MODULE_CAPS = {m['key']: set(m['capabilities']) for m in MODULES}
MODULE_GROUPS = []
for _m in MODULES:
    if _m['group'] not in MODULE_GROUPS:
        MODULE_GROUPS.append(_m['group'])

# --- Roles -----------------------------------------------------------------

CONSOLE_ROLES = [
    {'key': 'super_admin', 'label': 'Super Admin', 'summary': 'Full platform control, all tenants, impersonation'},
    {'key': 'platform_admin', 'label': 'Platform Admin', 'summary': 'Tenant onboarding, subscriptions, support'},
    {'key': 'support_user', 'label': 'Support', 'summary': 'Operator support: read platform records, update onboarding'},
    {'key': 'auditor', 'label': 'Auditor', 'summary': 'Read-only: all financial records, audit trail'},
]

MANAGED_ROLES = CONSOLE_ROLES + [
    {'key': 'syndic_manager', 'label': 'Syndic Manager', 'summary': 'Full development ops: units, parking, stores, billing, maintenance, governance'},
    {'key': 'finance_officer', 'label': 'Finance Officer', 'summary': 'Invoices, payments, reconciliation, budgets, AP/AR'},
    {'key': 'co_owner', 'label': 'Co-Owner', 'summary': 'Own unit: balance, payments, voting, maintenance, amenities'},
    {'key': 'tenant', 'label': 'Tenant (Renter)', 'summary': 'Maintenance, announcements, amenities (no finance/voting)'},
    {'key': 'contractor', 'label': 'Contractor', 'summary': 'Assigned jobs, status updates, invoice submission'},
]

CONSOLE_ROLE_KEYS = [r['key'] for r in CONSOLE_ROLES]
MANAGED_ROLE_KEYS = [r['key'] for r in MANAGED_ROLES]
ROLE_LABELS = {r['key']: r['label'] for r in MANAGED_ROLES}


def _matrix(spec):
    """Normalise a {module: [caps]} spec, intersecting with valid caps."""
    return {key: sorted(MODULE_CAPS[key] & set(caps)) for key, caps in spec.items() if key in MODULE_CAPS and caps}


# Full control on every module.
SUPER_ADMIN_MATRIX = {key: sorted(MODULE_CAPS[key]) for key in MODULE_KEYS}

# Platform Admin: everything except deleting properties and managing console roles.
PLATFORM_ADMIN_MATRIX = _matrix({
    'overview': ['view', 'export'],
    'properties': ['view', 'create', 'edit', 'export'],
    'onboarding': ['view', 'create', 'edit'],
    'users': ['view', 'create', 'edit'],
    'subscriptions': ['view', 'create', 'edit'],
    'feature_flags': ['view', 'edit'],
    'monitoring': ['view'],
    'audit': ['view', 'export'],
    'whatsapp': ['view', 'create', 'edit', 'export'],
    'integrations': ['view', 'edit'],
})

# Support: read the platform, move onboarding along, nothing financial.
SUPPORT_MATRIX = _matrix({
    'overview': ['view'],
    'properties': ['view'],
    'onboarding': ['view', 'edit'],
    'users': ['view'],
    'subscriptions': ['view'],
    'feature_flags': ['view'],
    'monitoring': ['view'],
    'audit': ['view'],
    'whatsapp': ['view'],
    'integrations': ['view'],
})

# Auditor: read-only across the whole console, plus exports.
AUDITOR_MATRIX = _matrix({
    key: (['view', 'export'] if 'export' in MODULE_CAPS[key] else ['view'])
    for key in MODULE_KEYS
})

ROLE_MATRIX = {
    'super_admin': SUPER_ADMIN_MATRIX,
    'platform_admin': PLATFORM_ADMIN_MATRIX,
    'support_user': SUPPORT_MATRIX,
    'auditor': AUDITOR_MATRIX,
}


def normalize_matrix(raw):
    """Coerce arbitrary input into a clean {module: [caps]} matrix."""
    if not isinstance(raw, dict):
        return {}
    clean = {}
    for key, caps in raw.items():
        if key not in MODULE_CAPS:
            continue
        if isinstance(caps, str):
            caps = [caps]
        if not isinstance(caps, (list, tuple, set)):
            continue
        allowed = sorted(MODULE_CAPS[key] & {str(c) for c in caps})
        if allowed:
            clean[key] = allowed
    return clean


def effective_matrix(user):
    """Return the effective {module: [caps]} matrix for a user."""
    role = getattr(user, 'role', None)
    if role in ROLE_MATRIX:
        stored = getattr(user, 'permission_overrides', None)
        if role != 'super_admin' and stored:
            return normalize_matrix(stored)
        return ROLE_MATRIX[role]
    # Roles that belong to the syndic console / resident app reach nothing here.
    return {}


def has_permission(user, module, capability):
    if user is None or not getattr(user, 'is_authenticated', False):
        return False
    if getattr(user, 'role', None) == 'super_admin':
        return module in MODULE_CAPS and capability in MODULE_CAPS[module]
    return capability in effective_matrix(user).get(module, [])


def can_view(user, module):
    return has_permission(user, module, 'view')


def forbidden(module, capability):
    return jsonify({
        'error': 'You do not have permission to perform this action',
        'module': module,
        'capability': capability,
    }), 403


def ensure(module, capability):
    """Return a 403 response tuple when the current user lacks the capability, else None."""
    if has_permission(current_user, module, capability):
        return None
    return forbidden(module, capability)


def require_permission(module, capability):
    """Decorator guarding a view with a module capability."""
    def decorator(view):
        @wraps(view)
        def wrapped(*args, **kwargs):
            denied = ensure(module, capability)
            if denied is not None:
                return denied
            return view(*args, **kwargs)
        return wrapped
    return decorator


def catalog():
    return {
        'modules': MODULES,
        'capabilities': CAPABILITIES,
        'groups': MODULE_GROUPS,
        'console_roles': CONSOLE_ROLES,
        'managed_roles': MANAGED_ROLES,
    }
