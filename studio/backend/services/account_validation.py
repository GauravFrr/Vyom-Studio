"""Registration email and password rules."""
from __future__ import annotations

import os
import re

from email_validator import EmailNotValidError, validate_email

PASSWORD_MIN_LEN = 8
PASSWORD_MAX_LEN = 128

# Common throwaway domains — block free temp-mail signups.
DISPOSABLE_EMAIL_DOMAINS = frozenset({
    "mailinator.com",
    "guerrillamail.com",
    "guerrillamail.net",
    "guerrillamail.org",
    "sharklasers.com",
    "grr.la",
    "tempmail.com",
    "temp-mail.org",
    "10minutemail.com",
    "yopmail.com",
    "throwaway.email",
    "getnada.com",
    "maildrop.cc",
    "trashmail.com",
    "fakeinbox.com",
    "dispostable.com",
    "mintemail.com",
    "emailondeck.com",
})

_PASSWORD_RULES: tuple[tuple[str, re.Pattern[str], str], ...] = (
    ("length", re.compile(r"^.{8,128}$"), "At least 8 characters"),
    ("upper", re.compile(r"[A-Z]"), "One uppercase letter (A–Z)"),
    ("lower", re.compile(r"[a-z]"), "One lowercase letter (a–z)"),
    ("digit", re.compile(r"\d"), "One number (0–9)"),
    (
        "special",
        re.compile(r'[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\\/`~]'),
        "One special character (!@#$…)",
    ),
)


def password_requirements(password: str) -> list[dict[str, bool | str]]:
    """Return checklist items for UI or logging."""
    return [
        {"id": rule_id, "label": label, "met": bool(pattern.search(password or ""))}
        for rule_id, pattern, label in _PASSWORD_RULES
    ]


def validate_password(password: str) -> None:
    if not password:
        raise ValueError("Password is required.")
    if len(password) < PASSWORD_MIN_LEN:
        raise ValueError(f"Password must be at least {PASSWORD_MIN_LEN} characters.")
    if len(password) > PASSWORD_MAX_LEN:
        raise ValueError(f"Password must be at most {PASSWORD_MAX_LEN} characters.")
    if re.search(r"\s", password):
        raise ValueError("Password cannot contain spaces.")
    missing = [label for _, pattern, label in _PASSWORD_RULES if not pattern.search(password)]
    if missing:
        raise ValueError("Password is too weak. " + " ".join(missing) + ".")


def _mx_check_enabled() -> bool:
    return os.getenv("EMAIL_CHECK_MX", "true").lower() == "true"


def validate_registration_email(raw_email: str) -> str:
    """Normalize email, block disposable domains, optionally verify MX records."""
    email = (raw_email or "").strip().lower()
    if not email:
        raise ValueError("Email is required.")

    if "@" not in email:
        raise ValueError("Enter a valid email address.")

    domain = email.rsplit("@", 1)[-1]
    if domain in DISPOSABLE_EMAIL_DOMAINS:
        raise ValueError("Temporary or disposable email addresses are not allowed.")

    try:
        result = validate_email(
            email,
            check_deliverability=_mx_check_enabled(),
        )
        return result.normalized
    except EmailNotValidError as exc:
        msg = str(exc).strip()
        if "domain" in msg.lower() or "mx" in msg.lower() or "deliver" in msg.lower():
            raise ValueError(
                "That email domain doesn't look reachable. Check for typos or use another address."
            ) from exc
        raise ValueError("Enter a valid email address.") from exc


def validate_display_name(name: str) -> str:
    cleaned = (name or "").strip()
    if len(cleaned) < 2:
        raise ValueError("Name must be at least 2 characters.")
    if len(cleaned) > 120:
        raise ValueError("Name must be at most 120 characters.")
    if not re.search(r"[\w]", cleaned, re.UNICODE):
        raise ValueError("Name must contain at least one letter or number.")
    return cleaned
