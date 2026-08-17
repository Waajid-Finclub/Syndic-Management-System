"""
Resident API — everything the co-owner PWA talks to, under /api/resident.

Composed as a parent blueprint with one child per screen group so the URL
prefix lives in exactly one place. The community blueprint mounts at the root
of /api/resident because its resources (announcements, facilities, bookings,
visitors, documents) are siblings rather than one subject.
"""
from flask import Blueprint

from .account import account_bp
from .assets import assets_bp
from .auth import auth_bp
from .community import community_bp
from .finance import finance_bp
from .governance import governance_bp
from .home import home_bp
from .maintenance import maintenance_bp

resident_bp = Blueprint('resident', __name__)

resident_bp.register_blueprint(auth_bp, url_prefix='/auth')
resident_bp.register_blueprint(home_bp, url_prefix='/home')
resident_bp.register_blueprint(finance_bp, url_prefix='/finance')
resident_bp.register_blueprint(maintenance_bp, url_prefix='/maintenance')
resident_bp.register_blueprint(governance_bp, url_prefix='/governance')
resident_bp.register_blueprint(assets_bp, url_prefix='/assets')
resident_bp.register_blueprint(account_bp, url_prefix='/account')
resident_bp.register_blueprint(community_bp)

__all__ = ['resident_bp']
