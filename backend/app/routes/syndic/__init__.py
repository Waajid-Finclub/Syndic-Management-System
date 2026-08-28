"""
Syndic Admin API — everything the layer 2 console talks to, under /api/syndic.

Composed as a parent blueprint with one child per subject so the URL prefix and
the development scoping live in exactly one place (see `_access`). The community
and settings blueprints mount near the root because their resources are siblings
rather than one subject.

No endpoint here takes a development id. The scope comes from the signed-in
account, or from an operator's impersonation session, and never from the
request — which is what makes it impossible for one client's admin to reach
another client's building by editing a URL.
"""
from flask import Blueprint

from .auth import auth_bp
from .co_owners import co_owners_bp
from .community import community_bp
from .finance import finance_bp
from .governance import governance_bp
from .operations import operations_bp
from .overview import overview_bp
from .registry import registry_bp
from .settings import settings_bp
from .team import team_bp

syndic_bp = Blueprint('syndic', __name__)

syndic_bp.register_blueprint(auth_bp, url_prefix='/auth')
syndic_bp.register_blueprint(overview_bp, url_prefix='/overview')
syndic_bp.register_blueprint(registry_bp, url_prefix='/registry')
syndic_bp.register_blueprint(co_owners_bp, url_prefix='/co-owners')
syndic_bp.register_blueprint(finance_bp, url_prefix='/finance')
syndic_bp.register_blueprint(governance_bp, url_prefix='/governance')
syndic_bp.register_blueprint(team_bp, url_prefix='/team')
syndic_bp.register_blueprint(settings_bp, url_prefix='/settings')
syndic_bp.register_blueprint(operations_bp)
syndic_bp.register_blueprint(community_bp)

__all__ = ['syndic_bp']
