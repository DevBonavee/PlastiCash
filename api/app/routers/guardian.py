"""Parent or guardian consent links (public, no login). The token in the link is the only key: we look it up by its
sha256, it works once, and it expires after 7 days. See services/guardian.py."""
from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.db import get_session
from app.errors import ApiError
from app.models import GuardianConsent, Profile
from app.ratelimit import HOUR, rate_limit_ip
from app.services import guardian

router = APIRouter(tags=["guardian"])

SessionDep = Annotated[AsyncSession, Depends(get_session)]


class ConsentRequestOut(BaseModel):
    child_first_name: str
    guardian_name: str | None
    expires_at: datetime


class ConsentIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    decision: Literal["GRANT", "DECLINE"]


class ConsentOut(BaseModel):
    status: GuardianConsent
    child_first_name: str


async def _pending(session: AsyncSession, token: str, *, lock: bool = False) -> Profile:
    query = select(Profile).where(Profile.guardian_token_hash == guardian.hash_token(token))
    if lock:
        query = query.with_for_update()
    profile = (await session.exec(query)).first()
    if profile is None or profile.guardian_consent_status != GuardianConsent.PENDING:
        raise ApiError(404, "LINK_INVALID", "This link has already been used or isn't valid.")
    if guardian.link_expired(profile):
        raise ApiError(410, "LINK_EXPIRED", "This link has expired. Ask your child to send a new one from the app.")
    return profile


@router.get(
    "/guardian-consent/{token}", response_model=ConsentRequestOut,
    dependencies=[Depends(rate_limit_ip("guardian-link", 60, HOUR))],
)
async def consent_request(token: str, session: SessionDep) -> ConsentRequestOut:
    profile = await _pending(session, token)
    return ConsentRequestOut(
        child_first_name=guardian.child_first_name(profile),
        guardian_name=profile.guardian_name,
        expires_at=profile.guardian_token_expires_at,
    )


@router.post(
    "/guardian-consent/{token}", response_model=ConsentOut,
    dependencies=[Depends(rate_limit_ip("guardian-link", 60, HOUR))],
)
async def decide(token: str, body: ConsentIn, session: SessionDep) -> ConsentOut:
    """GRANT unlocks pickups, bank details and withdrawals; DECLINE keeps the account locked (the admin sees it).
    Either way the link is used up."""
    profile = await _pending(session, token, lock=True)
    profile.guardian_consent_status = GuardianConsent.GRANTED if body.decision == "GRANT" else GuardianConsent.DECLINED
    profile.guardian_consent_at = datetime.now(UTC)
    profile.guardian_token_hash = None
    profile.guardian_token_expires_at = None
    session.add(profile)
    await session.commit()
    return ConsentOut(status=profile.guardian_consent_status, child_first_name=guardian.child_first_name(profile))
