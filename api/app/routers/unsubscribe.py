"""Marketing email unsubscribe (public, no login). The token from the email is the only key.

GET shows the current state; POST unsubscribes (also the RFC 8058 one-click POST that mail apps send with the body
"List-Unsubscribe=One-Click"); POST .../resubscribe turns marketing email back on. All idempotent.
"""
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.db import get_session
from app.errors import ApiError
from app.models import Profile
from app.ratelimit import HOUR, rate_limit_ip
from app.services import marketing
from app.services.email import masked

router = APIRouter(tags=["unsubscribe"], dependencies=[Depends(rate_limit_ip("unsubscribe", 60, HOUR))])

SessionDep = Annotated[AsyncSession, Depends(get_session)]


class SubscriptionOut(BaseModel):
    email: str  # masked
    subscribed: bool


async def _by_token(session: AsyncSession, token: str) -> Profile:
    profile = (await session.exec(select(Profile).where(Profile.unsubscribe_token == token))).first()
    if profile is None:
        raise ApiError(404, "LINK_INVALID", "This unsubscribe link isn't valid.")
    return profile


async def _set(session: AsyncSession, token: str, opt_in: bool) -> SubscriptionOut:
    profile = await _by_token(session, token)
    if profile.marketing_opt_in != opt_in:
        marketing.set_opt_in(profile, opt_in)
        session.add(profile)
        await session.commit()
    return SubscriptionOut(email=masked(profile.email), subscribed=profile.marketing_opt_in)


@router.get("/unsubscribe/{token}", response_model=SubscriptionOut)
async def status(token: str, session: SessionDep) -> SubscriptionOut:
    profile = await _by_token(session, token)
    return SubscriptionOut(email=masked(profile.email), subscribed=profile.marketing_opt_in)


@router.post("/unsubscribe/{token}", response_model=SubscriptionOut)
async def unsubscribe(token: str, session: SessionDep) -> SubscriptionOut:
    return await _set(session, token, False)


@router.post("/unsubscribe/{token}/resubscribe", response_model=SubscriptionOut)
async def resubscribe(token: str, session: SessionDep) -> SubscriptionOut:
    return await _set(session, token, True)
