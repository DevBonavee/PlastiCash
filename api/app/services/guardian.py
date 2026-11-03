"""Age check and parent or guardian consent (NDPA 2023: under 18 is a child).

- Under 13: no account. The Supabase login made at sign-up step 1 is deleted, so no data about the child is kept.
- 13 to 17: the profile is a minor with consent PENDING. The guardian gets a single-use link (email, and SMS when
  SMS_ENABLED) to /guardian-consent/<token>. Only the token's sha256 is stored; it expires after 7 days. The child can
  send a new link up to 3 times. Until consent is GRANTED the minor can't request pickups, save a bank account or
  withdraw. Payouts for a minor go to an account in the guardian's name; a mismatch is flagged for the admin.
"""
import hashlib
import html
import re
import secrets
from datetime import UTC, date, datetime, timedelta

from app.config import get_settings
from app.errors import ApiError
from app.models import GuardianConsent, Profile
from app.services import email, termii

MIN_AGE = 13
ADULT_AGE = 18
LINK_DAYS = 7
MAX_RESENDS = 3  # after the first link
LAGOS = timedelta(hours=1)

UNDER_13_MESSAGE = "PlastiCash is for ages 13 and up. Ask a parent to sign up and recycle with you."
LOCKED_MESSAGE = "Your parent or guardian needs to approve your account first."


def lagos_today(now: datetime | None = None) -> date:
    return ((now or datetime.now(UTC)) + LAGOS).date()


def age_on(born: date, today: date) -> int:
    return today.year - born.year - ((today.month, today.day) < (born.month, born.day))


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def link_expired(profile: Profile, now: datetime | None = None) -> bool:
    expires = profile.guardian_token_expires_at
    return profile.guardian_consent_status == GuardianConsent.PENDING and (
        expires is None or expires <= (now or datetime.now(UTC))
    )


def is_locked(profile: Profile) -> bool:
    return profile.is_minor and profile.guardian_consent_status != GuardianConsent.GRANTED


def require_consent(profile: Profile) -> None:
    """Pickups, bank details and withdrawals: refused for a minor without a guardian's consent."""
    if is_locked(profile):
        raise ApiError(403, "GUARDIAN_CONSENT_REQUIRED", LOCKED_MESSAGE)


def issue_link(profile: Profile, now: datetime | None = None) -> str:
    """New single-use token (the old one stops working). Returns the token; only its hash is kept."""
    token = secrets.token_urlsafe(32)
    profile.guardian_token_hash = hash_token(token)
    profile.guardian_token_expires_at = (now or datetime.now(UTC)) + timedelta(days=LINK_DAYS)
    profile.guardian_link_sends += 1
    return token


def resends_left(profile: Profile) -> int:
    return max(0, 1 + MAX_RESENDS - profile.guardian_link_sends)


def consent_url(token: str) -> str:
    return f"{get_settings().site_url.rstrip('/')}/guardian-consent/{token}"


def child_first_name(profile: Profile) -> str:
    words = (profile.full_name or "").split()
    return words[0] if words else "Your child"


async def send_link(profile: Profile, token: str) -> None:
    """Email (and SMS when on) to the guardian. Failures are logged by the senders; the child can resend."""
    url = consent_url(token)
    child = child_first_name(profile)
    guardian = (profile.guardian_name or "").split()[0] if profile.guardian_name else "there"
    subject = f"{child} wants to sell plastic with PlastiCash. Do you agree?"
    text = (
        f"Hello {guardian},\n\n"
        f"{child} has signed up for PlastiCash, EcoCyclers' app for selling plastic waste in Enugu. Because {child} is "
        "under 18, Nigerian law (the Nigeria Data Protection Act 2023) needs your consent before we use their "
        "details for pickups and payments.\n\n"
        f"Read what we collect and choose yes or no here (the link works once and expires in {LINK_DAYS} days):\n"
        f"{url}\n\n"
        "If you don't know about this, choose \"I don't consent\" and the account stays locked.\n\n"
        "EcoCyclers, PlastiCash"
    )
    safe_child = html.escape(child)
    html_body = (
        f"<p>Hello {html.escape(guardian)},</p>"
        f"<p>{safe_child} has signed up for PlastiCash, EcoCyclers' app for selling plastic waste in Enugu. Because "
        f"{safe_child} is under 18, Nigerian law (the Nigeria Data Protection Act 2023) needs your consent before we "
        "use their details for pickups and payments.</p>"
        f'<p><a href="{html.escape(url)}">Read what we collect and choose yes or no</a>. The link works once and '
        f"expires in {LINK_DAYS} days.</p>"
        "<p>If you don't know about this, choose \"I don't consent\" and the account stays locked.</p>"
        "<p>EcoCyclers, PlastiCash</p>"
    )
    if profile.guardian_email:
        await email.send_transactional(profile.guardian_email, subject, text, html_body)
    if profile.guardian_phone:
        await termii.send_sms(
            profile.guardian_phone,
            f"PlastiCash: {child} (under 18) signed up to sell plastic with EcoCyclers. Approve or decline: {url}",
        )


_NAME_WORD = re.compile(r"[a-z]+")


def name_words(name: str | None) -> set[str]:
    return {w for w in _NAME_WORD.findall((name or "").lower()) if len(w) > 1}


def names_differ(guardian_name: str | None, account_name: str | None) -> bool:
    """True when a bank account doesn't look like it's in the guardian's name: at least two of the guardian's names
    (or all, if fewer) must appear in the bank's account name, in any order. Only flags; the admin decides."""
    guardian, account = name_words(guardian_name), name_words(account_name)
    if not guardian or not account:
        return True
    return len(guardian & account) < min(2, len(guardian))
