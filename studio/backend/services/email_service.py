"""Optional email delivery — verification links."""
from __future__ import annotations

import logging
import os
import smtplib
from email.message import EmailMessage

logger = logging.getLogger(__name__)

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")


def verification_link(token: str) -> str:
    return f"{FRONTEND_URL}/verify-email?token={token}"


def _html_body(*, name: str, link: str) -> str:
    return f"""\
<!DOCTYPE html>
<html>
<body style="margin:0;background:#0A0A0F;font-family:system-ui,sans-serif;color:#F8F8FF;padding:32px 16px;">
  <div style="max-width:480px;margin:0 auto;background:#13131F;border:1px solid #2A2A45;border-radius:16px;padding:32px;">
    <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#A0A0C0;">VYOM Studio</p>
    <h1 style="margin:0 0 16px;font-size:22px;color:#F8F8FF;">Verify your email</h1>
    <p style="margin:0 0 24px;line-height:1.6;color:#A0A0C0;">Hi {name}, confirm your address to unlock image generation, video export, and the full studio.</p>
    <a href="{link}" style="display:inline-block;background:linear-gradient(135deg,#7C3AED,#4F46E5);color:#fff;text-decoration:none;padding:14px 28px;border-radius:14px;font-weight:600;">Verify email</a>
    <p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#5A5A7A;">Or copy this link:<br><span style="word-break:break-all;color:#9D5CF6;">{link}</span></p>
    <p style="margin:24px 0 0;font-size:11px;color:#5A5A7A;">If you didn't create this account, ignore this email.</p>
  </div>
</body>
</html>"""


def send_verification_email(*, to_email: str, name: str, token: str) -> bool:
    link = verification_link(token)
    subject = "Verify your VYOM Studio account"
    text_body = (
        f"Hi {name},\n\n"
        f"Verify your email to unlock the full studio:\n{link}\n\n"
        "If you did not create this account, you can ignore this message.\n"
    )
    html_body = _html_body(name=name, link=link)

    host = (os.getenv("SMTP_HOST") or "").strip()
    if not host:
        logger.info("[dev] Verification link for %s: %s", to_email, link)
        return True

    port = int(os.getenv("SMTP_PORT", "587"))
    user = os.getenv("SMTP_USER", "")
    password = os.getenv("SMTP_PASSWORD", "")
    from_addr = os.getenv("SMTP_FROM", user or "noreply@vyom.studio")

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to_email
    msg.set_content(text_body)
    msg.add_alternative(html_body, subtype="html")

    try:
        with smtplib.SMTP(host, port, timeout=30) as smtp:
            if os.getenv("SMTP_TLS", "true").lower() == "true":
                smtp.starttls()
            if user and password:
                smtp.login(user, password)
            smtp.send_message(msg)
        return True
    except OSError as exc:
        logger.error("Failed to send verification email to %s: %s", to_email, exc)
        return False
