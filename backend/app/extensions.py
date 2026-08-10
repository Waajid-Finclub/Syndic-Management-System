"""Flask extension instances — initialized in the app factory."""
from flask_cors import CORS
from flask_login import LoginManager
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

login_manager = LoginManager()

cors = CORS()
