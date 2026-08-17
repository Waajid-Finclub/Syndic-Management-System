"""
File storage for resident uploads and generated documents.

Files live under `instance/uploads/<area>/` and are always served back through
an authenticated route, never from a static directory — a maintenance photo can
show the inside of someone's flat, and a title deed is nobody else's business.

Stored names are random. The original filename is kept as a label only: it is
attacker-controlled, may collide, and has been a path-traversal vector for as
long as file uploads have existed.
"""
import os
import secrets

from flask import current_app

# Photos only. A resident has no reason to attach anything executable.
ALLOWED_IMAGE_TYPES = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/heic': '.heic',
}

MAX_UPLOAD_BYTES = 5 * 1024 * 1024
MAX_PHOTOS_PER_REQUEST = 5


def uploads_root():
    root = os.path.join(current_app.instance_path, 'uploads')
    os.makedirs(root, exist_ok=True)
    return root


def area_path(area):
    path = os.path.join(uploads_root(), area)
    os.makedirs(path, exist_ok=True)
    return path


def save_image(file_storage, area):
    """
    Persist an uploaded image. Returns (storage_path, filename, content_type, size)
    or raises ValueError with a message safe to show the resident.
    """
    content_type = (file_storage.mimetype or '').lower()
    extension = ALLOWED_IMAGE_TYPES.get(content_type)
    if extension is None:
        raise ValueError('Only JPEG, PNG, WebP or HEIC images can be attached')

    data = file_storage.read()
    if not data:
        raise ValueError('That file is empty')
    if len(data) > MAX_UPLOAD_BYTES:
        raise ValueError('Images must be 5 MB or smaller')

    stored_name = f'{secrets.token_hex(16)}{extension}'
    destination = os.path.join(area_path(area), stored_name)
    with open(destination, 'wb') as handle:
        handle.write(data)

    original = os.path.basename(file_storage.filename or stored_name)
    return destination, original[:255], content_type, len(data)


def write_bytes(area, filename, payload):
    """Write generated content (a seeded PDF, say) and return its path."""
    destination = os.path.join(area_path(area), filename)
    with open(destination, 'wb') as handle:
        handle.write(payload)
    return destination


def read_bytes(storage_path):
    """
    Read a stored file, refusing anything outside the uploads root.

    The path comes from our own database rather than a request, so this is a
    backstop — but a backstop that costs one comparison.
    """
    root = os.path.realpath(uploads_root())
    resolved = os.path.realpath(storage_path)
    if not resolved.startswith(root + os.sep):
        raise ValueError('Refusing to read outside the uploads directory')
    if not os.path.exists(resolved):
        raise FileNotFoundError(storage_path)
    with open(resolved, 'rb') as handle:
        return handle.read()
