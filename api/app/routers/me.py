"""The signed-in person's own profile. Any role can read and edit their own; only USER profiles are created here
(collectors and admins are created by an admin)."""
import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy.exc import IntegrityError
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.auth import AuthUser, CurrentProfile, UserProfile, get_auth_user
from app.db import get_session
from app.errors import ApiError
from app.models import AccountType, GuardianConsent, Profile, Role
from app.schemas import BankIn, BankOption, BankResolveOut, MeOut, ProfileCreate, ProfileUpdate
from app.services import guardian, marketing, paystack, supabase_admin
from app.services.paystack import PaystackError
from app.ratelimit import HOUR, rate_limit

log = logging.getLogger(__name__)
router = APIRouter(tags=["me"])

SessionDep = Annotated[AsyncSession, Depends(get_session)]

REQUIRED_FIELDS = ("full_name", "phone", "address", "area")
ORG_FIELDS = {"org_name", "org_type", "cac_number"}


def phone_taken_error() -> ApiError:
    return ApiError(409, "PHONE_TAKEN", "This number is already registered")


async def phone_taken(session: AsyncSession, phone: str, except_id: UUID | None = None) -> bool:
    query = select(Profile.id).where(Profile.phone == phone)
    if except_id is not None:
        query = query.where(Profile.id != except_id)
    return (await session.exec(query)).first() is not None


async def save(session: AsyncSession, profile: Profile) -> Profile:
    session.add(profile)
    try:
        await session.commit()
    except IntegrityError:  # two requests racing for the same phone
        await session.rollback()
        raise phone_taken_error() from None
    await session.refresh(profile)
    return profile


@router.post(
    "/me/profile", status_code=201, response_model=MeOut,
    dependencies=[Depends(rate_limit("create-profile", 10, HOUR))],
)
async def create_profile(
    body: ProfileCreate,
    auth_user: Annotated[AuthUser, Depends(get_auth_user)],
    session: SessionDep,
    background: BackgroundTasks,
) -> MeOut:
    if await session.get(Profile, auth_user.id) is not None:
        raise ApiError(409, "PROFILE_EXISTS", "Your profile is already set up.")
    if not auth_user.email:
        raise ApiError(422, "EMAIL_REQUIRED", "Your login has no email address.")
    age = guardian.age_on(body.date_of_birth, guardian.lagos_today()) if body.date_of_birth else None
    if age is not None and age < guardian.MIN_AGE:
        # No account for under-13s: remove the login from step 1 so we keep nothing about the child.
        await supabase_admin.delete_user(auth_user.id)
        raise ApiError(403, "UNDER_13", guardian.UNDER_13_MESSAGE)
    if await phone_taken(session, body.phone):
        raise phone_taken_error()
    profile = Profile(id=auth_user.id, role=Role.USER, email=auth_user.email, **body.profile_fields())
    marketing.set_opt_in(profile, body.marketing_opt_in)
    token = None
    if age is not None and age < guardian.ADULT_AGE:
        profile.is_minor = True
        profile.guardian_consent_status = GuardianConsent.PENDING
        token = guardian.issue_link(profile)
    saved = await save(session, profile)
    if token:
        background.add_task(guardian.send_link, saved, token)
    return MeOut.from_profile(saved)


@router.post(
    "/me/guardian/resend", response_model=MeOut,
    dependencies=[Depends(rate_limit("guardian-resend", 10, HOUR))],
)
async def resend_guardian_link(profile: UserProfile, session: SessionDep, background: BackgroundTasks) -> MeOut:
    """A new consent link for the parent or guardian (the old one stops working). Up to 3 times."""
    if not profile.is_minor or profile.guardian_consent_status != GuardianConsent.PENDING:
        raise ApiError(409, "NOTHING_TO_RESEND", "There's no approval waiting for your parent or guardian.")
    if guardian.resends_left(profile) == 0:
        raise ApiError(409, "RESEND_LIMIT", "You've sent the link the most times allowed. Ask us on WhatsApp for help.")
    token = guardian.issue_link(profile)
    saved = await save(session, profile)
    background.add_task(guardian.send_link, saved, token)
    return MeOut.from_profile(saved)


@router.get("/me", response_model=MeOut)
async def get_me(profile: CurrentProfile) -> MeOut:
    return MeOut.from_profile(profile)


@router.patch("/me", response_model=MeOut)
async def update_me(body: ProfileUpdate, profile: CurrentProfile, session: SessionDep) -> MeOut:
    changes = body.model_dump(exclude_unset=True)
    if any(changes.get(key, "") is None for key in REQUIRED_FIELDS):
        raise ApiError(422, "VALIDATION_ERROR", "Name, phone, address and area can't be empty.")
    if ORG_FIELDS & changes.keys() and profile.account_type != AccountType.ORGANIZATION:
        raise ApiError(422, "VALIDATION_ERROR", "Only organizations have organization details.")
    if profile.account_type == AccountType.ORGANIZATION:
        if not changes.get("org_name", profile.org_name) or not changes.get("org_type", profile.org_type):
            raise ApiError(422, "VALIDATION_ERROR", "Organizations need an organization name and type.")
    if "phone" in changes and await phone_taken(session, changes["phone"], except_id=profile.id):
        raise phone_taken_error()
    if "marketing_opt_in" in changes:
        opt_in = changes.pop("marketing_opt_in")
        if opt_in is not None:
            marketing.set_opt_in(profile, opt_in)
    if ({"address", "area"} & changes.keys()) and "lat" not in changes:
        # A new street without a new pin: the old pin would point at the old place.
        changes["lat"] = changes["lng"] = None
    for key, value in changes.items():
        setattr(profile, key, value)
    return MeOut.from_profile(await save(session, profile))


# ----- Bank details (payouts go only to a checked account) -----


def _paystack_error(error: PaystackError) -> ApiError:
    if error.status_code == 429:
        # Says nothing about the account. Paystack's test mode allows 3 checks of real banks a day (test bank 001 is free).
        log.warning("Paystack limit reached: %s", error.message)
        return ApiError(429, "BANK_CHECK_LIMIT", "We've reached the limit for bank checks. Your details may be fine, so try again later.")
    if error.not_sent and error.status_code and error.status_code < 500:
        return ApiError(422, "ACCOUNT_NOT_FOUND",
                        "That account number didn't match a bank account. Check the number and the bank.")
    return ApiError(502, "PAYSTACK_UNAVAILABLE", "We couldn't reach the bank check. Try again in a minute.")


async def _bank_name(code: str) -> str:
    try:
        banks = await paystack.list_banks()
    except PaystackError as error:
        raise _paystack_error(error) from None
    name = next((b["name"] for b in banks if b["code"] == code), None)
    if name is None:
        raise ApiError(422, "VALIDATION_ERROR", "Choose a bank from the list.")
    return name


@router.get("/banks", response_model=list[BankOption])
async def banks(_: CurrentProfile) -> list[BankOption]:
    try:
        return [BankOption(**b) for b in await paystack.list_banks()]
    except PaystackError as error:
        raise _paystack_error(error) from None


@router.post(
    "/me/bank/resolve", response_model=BankResolveOut,
    dependencies=[Depends(rate_limit("bank-resolve", 10, HOUR))],
)
async def resolve_bank(body: BankIn, _: UserProfile) -> BankResolveOut:
    """Show the account holder's name before saving, so the user can check it's theirs."""
    bank_name = await _bank_name(body.bank_code)
    try:
        account_name = await paystack.resolve_account(body.account_number, body.bank_code)
    except PaystackError as error:
        raise _paystack_error(error) from None
    return BankResolveOut(bank_name=bank_name, account_name=account_name)


@router.post("/me/bank", response_model=MeOut, dependencies=[Depends(rate_limit("bank-save", 5, HOUR))])
async def save_bank(body: BankIn, profile: UserProfile, session: SessionDep) -> MeOut:
    """Check the account with the bank again (never trust the name from the browser), create the Paystack
    transfer recipient, then save. Withdrawals use a snapshot of these details. Minors need a guardian's consent
    first, and their account should be in the guardian's name (a mismatch is flagged to the admin, not refused)."""
    guardian.require_consent(profile)
    bank_name = await _bank_name(body.bank_code)
    try:
        account_name = await paystack.resolve_account(body.account_number, body.bank_code)
        recipient = await paystack.create_recipient(account_name, body.account_number, body.bank_code)
    except PaystackError as error:
        raise _paystack_error(error) from None
    profile.bank_name, profile.bank_code = bank_name, body.bank_code
    profile.account_number, profile.account_name = body.account_number, account_name
    profile.paystack_recipient_code = recipient
    return MeOut.from_profile(await save(session, profile))
