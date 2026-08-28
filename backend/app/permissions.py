"""
Permission catalogs for the three layers of the platform.

The product is one codebase serving three consoles, each with its own sign-in
surface, its own module catalog and its own role family:

* Layer 1 — Master Admin (SaaS operator). Modules in MODULES, roles in
  CONSOLE_ROLES. Allocates client properties and provisions the first admin
  account for each one.
* Layer 2 — Syndic Admin (the client's own management team). Modules in
  SYNDIC_MODULES, roles in SYNDIC_ROLES. Scoped to exactly one development, and
  allocates co-owner accounts inside it.
* Layer 3 — Co-Owner (resident PWA). No module matrix: a co-owner has one unit,
  and RESIDENT_FEATURES lists what that entitles them to.

A role belongs to exactly one layer, and each login endpoint accepts only its
own layer's roles. That is what stops an operator drifting into a client's data
by finding a different login form, and a co-owner reaching either console.

Capabilities are the same vocabulary in layers 1 and 2 (view/create/edit/
delete/export) so one matrix renderer serves both.
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

# --- Layer 2: the Syndic Admin console -------------------------------------
#
# The client's own team. Every one of these accounts is bound to exactly one
# development (User.development_id) and can never see another.

SYNDIC_ROLES = [
    {'key': 'syndic_manager', 'label': 'Syndic Manager',
     'summary': 'Full development control: registry, co-owners, billing, maintenance, governance'},
    {'key': 'finance_officer', 'label': 'Finance Officer',
     'summary': 'Invoices, billing runs, payments, arrears, funds — no governance or registry changes'},
    {'key': 'assistant_manager', 'label': 'Assistant Manager',
     'summary': 'Day-to-day operations: maintenance, vendors, announcements, visitors — reads finance'},
    {'key': 'board_member', 'label': 'Board Member',
     'summary': 'Committee oversight: reads everything, runs governance, publishes nothing else'},
]
SYNDIC_ROLE_KEYS = [r['key'] for r in SYNDIC_ROLES]

# --- Layer 3: the co-owner --------------------------------------------------

RESIDENT_ROLES = [
    {'key': 'co_owner', 'label': 'Co-Owner',
     'summary': 'Own unit: balance, payments, voting, maintenance, facilities, documents'},
]
RESIDENT_ROLE_KEYS = [r['key'] for r in RESIDENT_ROLES]

# --- The whole registry -----------------------------------------------------
#
# Contractors hold no login in this build; the vendor record in the maintenance
# module is what a syndic assigns work to.

MANAGED_ROLES = CONSOLE_ROLES + SYNDIC_ROLES + RESIDENT_ROLES

CONSOLE_ROLE_KEYS = [r['key'] for r in CONSOLE_ROLES]
MANAGED_ROLE_KEYS = [r['key'] for r in MANAGED_ROLES]
ROLE_LABELS = {r['key']: r['label'] for r in MANAGED_ROLES}

# Which layer a role signs in to. Used by every login endpoint and by the
# account-allocation rules: a layer may only create accounts one level down.
ROLE_LAYER = {
    **{key: 'master' for key in CONSOLE_ROLE_KEYS},
    **{key: 'syndic' for key in SYNDIC_ROLE_KEYS},
    **{key: 'resident' for key in RESIDENT_ROLE_KEYS},
}


def layer_of(role):
    return ROLE_LAYER.get(role)


# --- Resident feature table -------------------------------------------------
#
# A resident has no modules; they have one unit. Since layer 3 is co-owners
# only, every feature here is theirs — the table stays because the API and the
# tab bar both read it, and it is where a future occupancy role would be added.

RESIDENT_FEATURES = [
    {'key': 'finance', 'label': 'Finances & payments', 'roles': ['co_owner']},
    {'key': 'voting', 'label': 'AGM voting', 'roles': ['co_owner']},
    {'key': 'private_documents', 'label': 'Unit paperwork', 'roles': ['co_owner']},
    {'key': 'maintenance', 'label': 'Maintenance requests', 'roles': ['co_owner']},
    {'key': 'facilities', 'label': 'Facility booking', 'roles': ['co_owner']},
    {'key': 'visitors', 'label': 'Visitor registration', 'roles': ['co_owner']},
    {'key': 'assets', 'label': 'Parking, storage & EV', 'roles': ['co_owner']},
    {'key': 'documents', 'label': 'Document library', 'roles': ['co_owner']},
    {'key': 'community', 'label': 'Notices & announcements', 'roles': ['co_owner']},
]
RESIDENT_FEATURE_KEYS = [f['key'] for f in RESIDENT_FEATURES]


def resident_features(user):
    """Return {feature_key: bool} for a resident account."""
    role = getattr(user, 'role', None)
    return {feature['key']: role in feature['roles'] for feature in RESIDENT_FEATURES}


def has_resident_feature(user, feature):
    if user is None or not getattr(user, 'is_authenticated', False):
        return False
    if getattr(user, 'role', None) not in RESIDENT_ROLE_KEYS:
        return False
    if getattr(user, 'status', None) != 'active':
        return False
    return resident_features(user).get(feature, False)


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
        'syndic_roles': SYNDIC_ROLES,
        'resident_roles': RESIDENT_ROLES,
        'managed_roles': MANAGED_ROLES,
        'role_layers': ROLE_LAYER,
    }


# ===========================================================================
# Layer 2 - the Syndic Admin console
# ===========================================================================
#
# A separate catalog rather than more rows in MODULES. The two consoles answer
# different questions: the operator asks "how is the portfolio doing", the
# syndic asks "who owes what in my building". Sharing one catalog would force
# every module to carry a scope flag and every check to consult it.

SYNDIC_MODULES = [
    {'key': 'overview', 'label': 'Development Overview', 'group': 'Development',
     'capabilities': ['view', 'export']},
    {'key': 'registry', 'label': 'Property Registry', 'group': 'Development',
     'capabilities': ['view', 'create', 'edit', 'delete', 'export']},
    {'key': 'co_owners', 'label': 'Co-Owners & Units', 'group': 'Development',
     'capabilities': ['view', 'create', 'edit', 'delete', 'export']},
    {'key': 'finance', 'label': 'Billing & Payments', 'group': 'Finance',
     'capabilities': ['view', 'create', 'edit', 'delete', 'export']},
    {'key': 'funds', 'label': 'Funds & Budget', 'group': 'Finance',
     'capabilities': ['view', 'create', 'edit', 'export']},
    {'key': 'maintenance', 'label': 'Maintenance', 'group': 'Operations',
     'capabilities': ['view', 'create', 'edit', 'export']},
    {'key': 'vendors', 'label': 'Vendors', 'group': 'Operations',
     'capabilities': ['view', 'create', 'edit', 'delete']},
    {'key': 'governance', 'label': 'Meetings & Voting', 'group': 'Governance',
     'capabilities': ['view', 'create', 'edit', 'delete', 'export']},
    {'key': 'community', 'label': 'Notices & Community', 'group': 'Governance',
     'capabilities': ['view', 'create', 'edit', 'delete']},
    {'key': 'documents', 'label': 'Documents', 'group': 'Governance',
     'capabilities': ['view', 'create', 'edit', 'delete']},
    {'key': 'team', 'label': 'Team & Access', 'group': 'Administration',
     'capabilities': ['view', 'create', 'edit', 'delete']},
    {'key': 'settings', 'label': 'Development Settings', 'group': 'Administration',
     'capabilities': ['view', 'edit']},
]

SYNDIC_MODULE_KEYS = [m['key'] for m in SYNDIC_MODULES]
SYNDIC_MODULE_CAPS = {m['key']: set(m['capabilities']) for m in SYNDIC_MODULES}
SYNDIC_MODULE_GROUPS = []
for _m in SYNDIC_MODULES:
    if _m['group'] not in SYNDIC_MODULE_GROUPS:
        SYNDIC_MODULE_GROUPS.append(_m['group'])


def _syndic_matrix(spec):
    return {
        key: sorted(SYNDIC_MODULE_CAPS[key] & set(caps))
        for key, caps in spec.items()
        if key in SYNDIC_MODULE_CAPS and caps
    }


# Syndic Manager: everything inside their own development.
SYNDIC_MANAGER_MATRIX = {key: sorted(SYNDIC_MODULE_CAPS[key]) for key in SYNDIC_MODULE_KEYS}

# Finance Officer: the money, and read-only everywhere it comes from.
FINANCE_OFFICER_MATRIX = _syndic_matrix({
    'overview': ['view', 'export'],
    'registry': ['view', 'export'],
    'co_owners': ['view', 'export'],
    'finance': ['view', 'create', 'edit', 'delete', 'export'],
    'funds': ['view', 'create', 'edit', 'export'],
    'maintenance': ['view'],
    'vendors': ['view'],
    'governance': ['view'],
    'community': ['view'],
    'documents': ['view', 'create'],
    'settings': ['view'],
})

# Assistant Manager: runs the building day to day. Reads finance, never writes
# it - a receipt posted by someone without finance authority is exactly the
# kind of entry an audit cannot unpick later.
ASSISTANT_MANAGER_MATRIX = _syndic_matrix({
    'overview': ['view'],
    'registry': ['view', 'edit'],
    'co_owners': ['view', 'create', 'edit'],
    'finance': ['view'],
    'funds': ['view'],
    'maintenance': ['view', 'create', 'edit', 'export'],
    'vendors': ['view', 'create', 'edit'],
    'governance': ['view'],
    'community': ['view', 'create', 'edit', 'delete'],
    'documents': ['view', 'create', 'edit'],
})

# Board Member: committee oversight. Reads the whole development and runs
# governance, because calling a meeting is the committee's job rather than the
# manager's.
BOARD_MEMBER_MATRIX = _syndic_matrix({
    'overview': ['view', 'export'],
    'registry': ['view'],
    'co_owners': ['view'],
    'finance': ['view', 'export'],
    'funds': ['view', 'export'],
    'maintenance': ['view'],
    'vendors': ['view'],
    'governance': ['view', 'create', 'edit', 'delete', 'export'],
    'community': ['view'],
    'documents': ['view', 'create'],
})

SYNDIC_ROLE_MATRIX = {
    'syndic_manager': SYNDIC_MANAGER_MATRIX,
    'finance_officer': FINANCE_OFFICER_MATRIX,
    'assistant_manager': ASSISTANT_MANAGER_MATRIX,
    'board_member': BOARD_MEMBER_MATRIX,
}


def normalize_syndic_matrix(raw):
    if not isinstance(raw, dict):
        return {}
    clean = {}
    for key, caps in raw.items():
        if key not in SYNDIC_MODULE_CAPS:
            continue
        if isinstance(caps, str):
            caps = [caps]
        if not isinstance(caps, (list, tuple, set)):
            continue
        allowed = sorted(SYNDIC_MODULE_CAPS[key] & {str(c) for c in caps})
        if allowed:
            clean[key] = allowed
    return clean


def syndic_effective_matrix(user):
    """
    The effective syndic matrix for a user.

    A super admin inside an impersonation session is given the full manager
    matrix: support is useless if it cannot reproduce what the client sees.
    Every write they make is still audited under their own name.
    """
    role = getattr(user, 'role', None)
    if role == 'super_admin':
        return SYNDIC_MANAGER_MATRIX
    if role not in SYNDIC_ROLE_MATRIX:
        return {}
    stored = getattr(user, 'permission_overrides', None)
    if role != 'syndic_manager' and stored:
        return normalize_syndic_matrix(stored)
    return SYNDIC_ROLE_MATRIX[role]


def has_syndic_permission(user, module, capability):
    if user is None or not getattr(user, 'is_authenticated', False):
        return False
    if getattr(user, 'status', None) != 'active':
        return False
    return capability in syndic_effective_matrix(user).get(module, [])


def syndic_catalog():
    return {
        'modules': SYNDIC_MODULES,
        'capabilities': CAPABILITIES,
        'groups': SYNDIC_MODULE_GROUPS,
        'roles': SYNDIC_ROLES,
    }
