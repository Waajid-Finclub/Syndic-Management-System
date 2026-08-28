"""
Support impersonation — a super admin opening a client's syndic console.

What this is: a scope, not an identity swap. The session stays the super
admin's; all that changes is that `_access.current_development_id` reads the
impersonated development instead of the account's own. Consequences:

* Every audit row still names the super admin, tagged "(platform support)" by
  `_access.actor_label`, so the client's own log shows who did what.
* Starting and stopping are themselves audited against the client, so a client
  reading their audit trail can see that support was in.
* A few operations are refused outright while impersonating — deleting a client
  account, changing a client password. Support fixing a problem is legitimate;
  support quietly removing the evidence is not.

Restricted to `super_admin`. The role summary in permissions.CONSOLE_ROLES has
advertised impersonation since the console was built; this is where it lives.
"""
from flask import Blueprint, jsonify, request, session
from flask_login import current_user, login_required

from ..extensions import db
from ..models import Development
from ..models.audit import record_audit
from ..routes.syndic._access import IMPERSONATION_KEY

impersonation_bp = Blueprint('impersonation', __name__)


def _is_super_admin():
    return getattr(current_user, 'role', None) == 'super_admin'


@impersonation_bp.route('/status', methods=['GET'])
@login_required
def status():
    development_id = session.get(IMPERSONATION_KEY)
    development = db.session.get(Development, development_id) if development_id else None
    return jsonify({
        'available': _is_super_admin(),
        'active': development is not None,
        'development': {
            'id': development.id,
            'code': development.code,
            'name': development.name,
        } if development else None,
    })


@impersonation_bp.route('/<int:development_id>', methods=['POST'])
@login_required
def start(development_id):
    if not _is_super_admin():
        return jsonify({
            'error': 'Only a super admin may open a client console for support',
        }), 403

    development = db.session.get(Development, development_id)
    if development is None:
        return jsonify({'error': 'Client property not found'}), 404

    session[IMPERSONATION_KEY] = development.id
    record_audit(
        'LOGIN', 'Support session',
        f'{current_user.name} opened the {development.name} syndic console for support',
        category='system', user=current_user, development=development,
        ip_address=request.remote_addr,
    )
    db.session.commit()

    return jsonify({
        'active': True,
        'development': {
            'id': development.id,
            'code': development.code,
            'name': development.name,
        },
        # Where the browser should go next.
        'redirect': '/syndic/dashboard',
    })


@impersonation_bp.route('/stop', methods=['POST'])
@login_required
def stop():
    development_id = session.pop(IMPERSONATION_KEY, None)
    if development_id is None:
        return jsonify({'active': False})

    development = db.session.get(Development, development_id)
    record_audit(
        'LOGOUT', 'Support session',
        f'{current_user.name} closed the '
        f'{development.name if development else "client"} support session',
        category='system', user=current_user, development=development,
        ip_address=request.remote_addr,
    )
    db.session.commit()

    return jsonify({'active': False, 'redirect': '/properties'})
