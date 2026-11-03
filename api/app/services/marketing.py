"""Marketing email consent: opt in, opt out, and the token in unsubscribe links."""
import secrets
from datetime import UTC, datetime

from app.models import Profile


def set_opt_in(profile: Profile, opt_in: bool) -> None:
    if opt_in and not profile.marketing_opt_in:
        profile.marketing_opt_in_at = datetime.now(UTC)
    if not opt_in:
        profile.marketing_opt_in_at = None
    profile.marketing_opt_in = opt_in
    if opt_in and not profile.unsubscribe_token:
        profile.unsubscribe_token = secrets.token_urlsafe(24)
