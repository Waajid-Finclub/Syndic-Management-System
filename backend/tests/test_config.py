#!/usr/bin/env python3
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from app.config import _database_url  # noqa: E402


class DatabaseUrlConfigTest(unittest.TestCase):
    def test_empty_database_url_uses_sqlite_default(self):
        with patch.dict(os.environ, {'DATABASE_URL': ''}):
            self.assertTrue(_database_url().startswith('sqlite:///'))

    def test_blank_database_url_uses_sqlite_default(self):
        with patch.dict(os.environ, {'DATABASE_URL': '   '}):
            self.assertTrue(_database_url().startswith('sqlite:///'))

    def test_mysql_url_uses_pymysql_driver(self):
        with patch.dict(os.environ, {'DATABASE_URL': 'mysql://user:pass@db:3306/bms_v1'}):
            self.assertEqual(_database_url(), 'mysql+pymysql://user:pass@db:3306/bms_v1')

    def test_easypanel_trailing_plus_is_removed_from_mysql_database_name(self):
        with patch.dict(os.environ, {'DATABASE_URL': 'mysql://user:pass@db:3306/bms_v1+'}):
            self.assertEqual(_database_url(), 'mysql+pymysql://user:pass@db:3306/bms_v1')


if __name__ == '__main__':
    unittest.main()