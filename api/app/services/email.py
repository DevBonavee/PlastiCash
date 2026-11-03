"""Email through Resend (https://resend.com/docs/api-reference/emails/send-email).

Without RESEND_API_KEY nothing is sent: we log "email would send" with the kind and a masked address, never the
subject or body (they can hold links that work like passwords). A failed send is logged and returns False; callers
decide whether that matters.

Two kinds: transactional (account and service messages, always allowed) and marketing (tips, price updates, offers),
which only `send_marketing` sends: it refuses anyone not opted in and always adds the sender, the reason, a one-click
unsubscribe link, the privacy notice and the List-Unsubscribe headers.
"""
import html
import logging
from dataclasses import dataclass, field

import httpx

from app.config import get_settings

log = logging.getLogger(__name__)

RESEND_URL = "https://api.resend.com/emails"


@dataclass
class Email:
    to: str
    subject: str
    text: str
    html: str
    kind: str = "transactional"  # for logs only
    headers: dict[str, str] = field(default_factory=dict)


def masked(address: str) -> str:
    name, _, domain = address.partition("@")
    return f"{name[:1]}…@{domain}" if domain else "…"


async def deliver(email: Email) -> bool:
    settings = get_settings()
    if not settings.resend_api_key:
        log.info("Email would send (%s) to %s (RESEND_API_KEY is empty)", email.kind, masked(email.to))
        return False
    payload = {"from": settings.email_from, "to": [email.to], "subject": email.subject, "text": email.text,
               "html": email.html}
    if email.headers:
        payload["headers"] = email.headers
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                RESEND_URL, json=payload, headers={"Authorization": f"Bearer {settings.resend_api_key}"}
            )
        response.raise_for_status()
        return True
    except httpx.HTTPError as error:
        log.warning("Email (%s) to %s failed: %s", email.kind, masked(email.to), type(error).__name__)
        return False


async def send_transactional(to: str, subject: str, text: str, html: str) -> bool:
    """Account and service emails (guardian consent, pickups, withdrawals). Not affected by marketing opt-in."""
    return await deliver(Email(to=to, subject=subject, text=text, html=html))


# ----- Marketing (opt-in only) -----


class NotOptedIn(Exception):
    """Raised instead of sending a marketing email to someone who hasn't opted in."""


def _site(path: str) -> str:
    return f"{get_settings().site_url.rstrip('/')}{path}"


def unsubscribe_page(token: str) -> str:
    return _site(f"/unsubscribe/{token}")


def one_click_url(token: str) -> str:
    return f"{get_settings().api_public_url.rstrip('/')}/unsubscribe/{token}"


def marketing_footer(token: str) -> tuple[str, str]:
    """(text, html) footer every marketing email ends with: sender, why, unsubscribe, privacy notice."""
    settings = get_settings()
    unsubscribe, privacy = unsubscribe_page(token), _site("/privacy")
    text = (
        "\n\n--\n"
        f"Sent by EcoCyclers (PlastiCash), {settings.hub_address}.\n"
        "You're getting this because you said yes to tips, price updates and offers by email in PlastiCash.\n"
        f"Unsubscribe in one click: {unsubscribe}\n"
        f"Privacy notice: {privacy}\n"
    )
    html_footer = (
        '<hr style="border:none;border-top:1px solid #E2E8F0;margin:24px 0 12px">'
        '<p style="font-size:12px;color:#64748B;line-height:1.5">'
        f"Sent by EcoCyclers (PlastiCash), {html.escape(settings.hub_address)}.<br>"
        "You're getting this because you said yes to tips, price updates and offers by email in PlastiCash.<br>"
        f'<a href="{html.escape(unsubscribe)}">Unsubscribe in one click</a> · '
        f'<a href="{html.escape(privacy)}">Privacy notice</a></p>'
    )
    return text, html_footer


def marketing_email(profile, subject: str, text: str, html_body: str) -> Email:
    """Builds the email with the footer and List-Unsubscribe headers. Refuses anyone not opted in."""
    if not profile.marketing_opt_in or not profile.unsubscribe_token or not profile.email or not profile.is_active:
        raise NotOptedIn(str(profile.id))
    footer_text, footer_html = marketing_footer(profile.unsubscribe_token)
    return Email(
        to=profile.email,
        subject=subject,
        text=text + footer_text,
        html=html_body + footer_html,
        kind="marketing",
        headers={
            # RFC 8058 one-click: mail apps POST "List-Unsubscribe=One-Click" to the URL.
            "List-Unsubscribe": f"<{one_click_url(profile.unsubscribe_token)}>",
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
    )


async def send_marketing(profile, subject: str, text: str, html_body: str) -> bool:
    """The only way to send a marketing email. Raises NotOptedIn for anyone who hasn't opted in."""
    return await deliver(marketing_email(profile, subject, text, html_body))
