"""Crypto helpers: password hashing, Fernet encryption, session tokens.

The Fernet key is loaded from APP_SECRET_KEY (env) or `.app_secret_key` (file).
That key encrypts the Upace passwords / api_keys / login_keys stored in the
Account table — losing the key means losing access to the saved Upace logins.
"""

import base64
import hashlib
import hmac
import os
import secrets
from functools import lru_cache
from pathlib import Path

from cryptography.fernet import Fernet


BASE_DIR = Path(__file__).resolve().parent
SECRET_KEY_FILE = Path(
    os.getenv("APP_SECRET_KEY_FILE", str(BASE_DIR / ".app_secret_key"))
).expanduser()
PASSWORD_HASH_ITERATIONS = 390000


def _normalize_fernet_key(raw_value: str) -> bytes:
    try:
        Fernet(raw_value.encode())
        return raw_value.encode()
    except Exception:
        digest = hashlib.sha256(raw_value.encode()).digest()
        return base64.urlsafe_b64encode(digest)


def _load_or_create_secret_key() -> bytes:
    env_value = os.getenv("APP_SECRET_KEY")
    if env_value:
        return _normalize_fernet_key(env_value)

    if SECRET_KEY_FILE.exists():
        os.chmod(SECRET_KEY_FILE, 0o600)
        return SECRET_KEY_FILE.read_bytes().strip()

    SECRET_KEY_FILE.parent.mkdir(parents=True, exist_ok=True)
    key = Fernet.generate_key()
    SECRET_KEY_FILE.write_bytes(key)
    os.chmod(SECRET_KEY_FILE, 0o600)
    return key


@lru_cache(maxsize=1)
def get_fernet() -> Fernet:
    return Fernet(_load_or_create_secret_key())


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    derived_key = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode(),
        salt,
        PASSWORD_HASH_ITERATIONS,
    )
    return (
        f"pbkdf2_sha256${PASSWORD_HASH_ITERATIONS}$"
        f"{base64.b64encode(salt).decode()}$"
        f"{base64.b64encode(derived_key).decode()}"
    )


def verify_password(password: str, stored_hash: str | None) -> bool:
    if not stored_hash:
        return False

    try:
        algorithm, iterations, encoded_salt, encoded_hash = stored_hash.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
    except ValueError:
        return False

    salt = base64.b64decode(encoded_salt.encode())
    expected_hash = base64.b64decode(encoded_hash.encode())
    candidate_hash = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode(),
        salt,
        int(iterations),
    )
    return hmac.compare_digest(candidate_hash, expected_hash)


def encrypt_secret(value: str | None) -> str | None:
    if not value:
        return None
    return get_fernet().encrypt(value.encode()).decode()


def decrypt_secret(value: str | None) -> str | None:
    if not value:
        return None
    return get_fernet().decrypt(value.encode()).decode()


def generate_session_token() -> str:
    return secrets.token_urlsafe(32)


def hash_session_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
