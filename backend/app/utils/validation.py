"""Small helpers for coercing and validating JSON request payloads."""
import re
from datetime import date, datetime

EMAIL_PATTERN = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')


def json_dict(request):
    """Return the request JSON as a dict, never None."""
    payload = request.get_json(silent=True)
    return payload if isinstance(payload, dict) else {}


def clean_string(value, max_length=None):
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    if max_length:
        text = text[:max_length]
    return text


def clean_email(value):
    text = clean_string(value, 255)
    if text is None:
        return None
    text = text.lower()
    return text if EMAIL_PATTERN.match(text) else None


def as_int(value, default=None, minimum=None, maximum=None):
    try:
        number = int(value)
    except (TypeError, ValueError):
        return default
    if minimum is not None and number < minimum:
        return minimum
    if maximum is not None and number > maximum:
        return maximum
    return number


def as_float(value, default=None):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def as_bool(value, default=False):
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    return str(value).strip().lower() in {'1', 'true', 'yes', 'on'}


def as_date(value):
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    text = clean_string(value)
    if not text:
        return None
    for fmt in ('%Y-%m-%d', '%d/%m/%Y', '%d-%m-%Y'):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None


def one_of(value, allowed, default=None):
    text = clean_string(value)
    if text is None:
        return default
    text = text.lower()
    return text if text in allowed else default


def missing_fields(payload, required):
    """Return the list of required keys absent or blank in the payload."""
    return [key for key in required if not clean_string(payload.get(key))]
