"""Request and response models. Database tables live in models.py."""
import re
from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.areas import AREAS
from app.models import AccountType, GuardianConsent, LedgerEntry, LedgerType, Material, Price, Profile, Role, Withdrawal, WithdrawalStatus
from app.phone import PHONE_ERROR, normalize_ng_phone
from app.services.guardian import ADULT_AGE, MIN_AGE, age_on, lagos_today, link_expired, resends_left

OrgType = Literal["company", "school", "NGO", "church", "estate", "other"]


def _clean(value: str | None) -> str | None:
    """Collapse whitespace; an all-blank string becomes None."""
    if value is None:
        return None
    value = " ".join(value.split())
    return value or None


class _ProfileFields(BaseModel):
    model_config = ConfigDict(extra="forbid")

    @field_validator("full_name", "org_name", "address", "cac_number", mode="before", check_fields=False)
    @classmethod
    def strip_text(cls, value):
        return _clean(value) if isinstance(value, str) else value

    @field_validator("phone", check_fields=False)
    @classmethod
    def valid_phone(cls, value: str | None) -> str | None:
        if value is None:
            return None
        phone = normalize_ng_phone(value)
        if phone is None:
            raise ValueError(PHONE_ERROR)
        return phone

    @field_validator("area", check_fields=False)
    @classmethod
    def known_area(cls, value: str | None) -> str | None:
        if value is not None and value not in AREAS:
            raise ValueError("Choose an area from the list")
        return value


EMAIL_PATTERN = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"


class ProfileCreate(_ProfileFields):
    """Sign-up step 2. Individuals: full name, phone, address, area, date of birth; 13-17 also a parent or guardian
    (name, phone, email) and a tick that they know. Organizations also give org name and type; full_name is the
    contact person, who confirms they are 18 or older; CAC is optional. Age rules: services/guardian.py."""

    account_type: AccountType
    full_name: str = Field(min_length=1, max_length=200)
    phone: str
    address: str = Field(min_length=1, max_length=200)
    area: str
    org_name: str | None = Field(default=None, max_length=200)
    org_type: OrgType | None = None
    cac_number: str | None = Field(default=None, max_length=50)
    date_of_birth: date | None = None
    guardian_name: str | None = Field(default=None, max_length=200)
    guardian_phone: str | None = None
    guardian_email: str | None = Field(default=None, max_length=254)
    guardian_aware: bool = False
    adult_confirmed: bool = False  # organizations: the contact person is 18 or older
    marketing_opt_in: bool = False  # unticked by default

    @field_validator("guardian_name", "guardian_email", mode="before")
    @classmethod
    def strip_guardian(cls, value):
        return (_clean(value) or None) if isinstance(value, str) else value

    @field_validator("guardian_phone")
    @classmethod
    def guardian_phone_ok(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        phone = normalize_ng_phone(value)
        if phone is None:
            raise ValueError(PHONE_ERROR)
        return phone

    @field_validator("guardian_email")
    @classmethod
    def guardian_email_ok(cls, value: str | None) -> str | None:
        if value is not None and not re.fullmatch(EMAIL_PATTERN, value):
            raise ValueError("Enter a valid email address for your parent or guardian")
        return value.lower() if value else value

    @model_validator(mode="after")
    def org_fields(self):
        if self.account_type == AccountType.ORGANIZATION:
            if not self.org_name or not self.org_type:
                raise ValueError("Organizations need an organization name and type")
            if not self.adult_confirmed:
                raise ValueError("The contact person must confirm they are 18 or older")
            self.date_of_birth = None
            self.guardian_name = self.guardian_phone = self.guardian_email = None
        else:
            self.org_name = self.org_type = self.cac_number = None
            if self.date_of_birth is None:
                raise ValueError("Enter your date of birth")
            today = lagos_today()
            if self.date_of_birth > today or age_on(self.date_of_birth, today) > 120:
                raise ValueError("Check your date of birth")
            age = age_on(self.date_of_birth, today)
            if MIN_AGE <= age < ADULT_AGE:
                if not (self.guardian_name and self.guardian_phone and self.guardian_email):
                    raise ValueError("Add your parent or guardian's name, phone and email")
                if not self.guardian_aware:
                    raise ValueError("Confirm that your parent or guardian knows you're signing up")
            elif age >= ADULT_AGE:
                self.guardian_name = self.guardian_phone = self.guardian_email = None
        return self

    def profile_fields(self) -> dict:
        """Columns for the new profiles row (the two ticks aren't stored; opt-in is set by set_marketing)."""
        return self.model_dump(exclude={"guardian_aware", "adult_confirmed", "marketing_opt_in"})


class ProfileUpdate(_ProfileFields):
    """PATCH /me: only these fields. Role, account type, email, bank details and flags are not editable here."""

    full_name: str | None = Field(default=None, min_length=1, max_length=200)
    phone: str | None = None
    address: str | None = Field(default=None, min_length=1, max_length=200)
    area: str | None = None
    org_name: str | None = Field(default=None, min_length=1, max_length=200)
    org_type: OrgType | None = None
    cac_number: str | None = Field(default=None, max_length=50)
    marketing_opt_in: bool | None = None
    # Saved map pin. Send both, or both null to remove it.
    lat: Decimal | None = Field(default=None, ge=-90, le=90)
    lng: Decimal | None = Field(default=None, ge=-180, le=180)

    @field_validator("lat", "lng")
    @classmethod
    def six_places(cls, value: Decimal | None) -> Decimal | None:
        # numeric(9,6): browsers report more digits than that.
        return value.quantize(Decimal("0.000001")) if value is not None else None

    @model_validator(mode="after")
    def pin_pairs(self):
        sent = {"lat", "lng"} & self.model_fields_set
        if sent and (sent != {"lat", "lng"} or (self.lat is None) != (self.lng is None)):
            raise ValueError("Send lat and lng together")
        return self


def display_name(profile: Profile) -> str:
    """Greeting name: org name for organizations, else the first word of full_name.
    Empty string if there is nothing to show; the web then says just "Welcome"."""
    if profile.account_type == AccountType.ORGANIZATION and profile.org_name:
        return profile.org_name
    words = (profile.full_name or "").split()
    return words[0] if words else ""


class BankOut(BaseModel):
    bank_name: str
    account_name: str
    account_number_last4: str


class GuardianOut(BaseModel):
    """Only for minors: where their parent or guardian's consent stands."""

    status: GuardianConsent
    name: str | None
    link_expired: bool
    resends_left: int


class MeOut(BaseModel):
    id: UUID
    role: Role
    account_type: AccountType | None
    display_name: str
    full_name: str
    email: str
    phone: str
    address: str | None
    area: str | None
    lat: float | None
    lng: float | None
    org_name: str | None
    org_type: str | None
    cac_number: str | None
    verified_picker: bool
    bank: BankOut | None
    is_minor: bool = False
    guardian: GuardianOut | None = None
    marketing_opt_in: bool = False

    @classmethod
    def from_profile(cls, p: Profile) -> "MeOut":
        bank = None
        if p.bank_name and p.account_number and p.account_name:
            bank = BankOut(
                bank_name=p.bank_name, account_name=p.account_name, account_number_last4=p.account_number[-4:]
            )
        return cls(
            id=p.id,
            role=p.role,
            account_type=p.account_type,
            display_name=display_name(p),
            full_name=p.full_name,
            email=p.email,
            phone=p.phone,
            address=p.address,
            area=p.area,
            lat=float(p.lat) if p.lat is not None else None,
            lng=float(p.lng) if p.lng is not None else None,
            org_name=p.org_name,
            org_type=p.org_type,
            cac_number=p.cac_number,
            verified_picker=p.verified_picker,
            bank=bank,
            is_minor=p.is_minor,
            guardian=GuardianOut(
                status=p.guardian_consent_status,
                name=p.guardian_name,
                link_expired=link_expired(p),
                resends_left=resends_left(p),
            ) if p.is_minor else None,
            marketing_opt_in=p.marketing_opt_in,
        )


def points(amount_kobo: int) -> Decimal:
    """1 point = ₦1 = 100 kobo. Responses carry both amount_kobo and points (docs/specs/02-api.md)."""
    return Decimal(amount_kobo) / 100


class PriceOut(BaseModel):
    id: UUID
    material: Material
    price_kobo_per_kg: int
    points_per_kg: Decimal
    kg_per_full_sack: Decimal
    items_per_kg: int | None
    co2_kg_saved_per_kg: Decimal
    effective_from: datetime
    set_by: UUID | None

    @classmethod
    def from_price(cls, p: Price) -> "PriceOut":
        return cls(
            id=p.id,
            material=p.material,
            price_kobo_per_kg=p.price_kobo_per_kg,
            points_per_kg=points(p.price_kobo_per_kg),
            kg_per_full_sack=p.kg_per_full_sack,
            items_per_kg=p.items_per_kg,
            co2_kg_saved_per_kg=p.co2_kg_saved_per_kg,
            effective_from=p.effective_from,
            set_by=p.set_by,
        )


# ----- Wallet and withdrawals -----


class WithdrawalCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    amount_kobo: int = Field(gt=0)


class RejectBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reason: str = Field(min_length=1, max_length=300)


class WithdrawalOut(BaseModel):
    id: UUID
    user_id: UUID
    amount_kobo: int
    points: Decimal
    status: WithdrawalStatus
    bank_name: str
    account_name: str
    account_number_last4: str
    failure_reason: str | None
    created_at: datetime
    reviewed_at: datetime | None
    paid_at: datetime | None

    @classmethod
    def from_withdrawal(cls, w: Withdrawal) -> "WithdrawalOut":
        return cls(
            id=w.id,
            user_id=w.user_id,
            amount_kobo=w.amount_kobo,
            points=points(w.amount_kobo),
            status=w.status,
            bank_name=w.bank_name,
            account_name=w.account_name,
            account_number_last4=w.account_number[-4:],
            failure_reason=w.failure_reason,
            created_at=w.created_at,
            reviewed_at=w.reviewed_at,
            paid_at=w.paid_at,
        )


class LedgerEntryOut(BaseModel):
    id: UUID
    type: LedgerType
    amount_kobo: int
    points: Decimal
    pickup_id: UUID | None
    withdrawal_id: UUID | None
    note: str | None
    created_at: datetime

    @classmethod
    def from_entry(cls, e: LedgerEntry) -> "LedgerEntryOut":
        return cls(
            id=e.id, type=e.type, amount_kobo=e.amount_kobo, points=points(e.amount_kobo), pickup_id=e.pickup_id,
            withdrawal_id=e.withdrawal_id, note=e.note, created_at=e.created_at,
        )


class WalletOut(BaseModel):
    balance_kobo: int
    points: Decimal
    entries: list[LedgerEntryOut]
    total_entries: int


# ----- Bank details -----


class BankOption(BaseModel):
    name: str
    code: str


class BankIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    bank_code: str = Field(min_length=3, max_length=10, pattern=r"^[0-9A-Za-z]+$")
    account_number: str = Field(pattern=r"^\d{10}$")  # NUBAN


class BankResolveOut(BaseModel):
    bank_name: str
    account_name: str


class MaterialImpact(BaseModel):
    material: Material
    kg: Decimal
    co2_kg: Decimal


class ImpactOut(BaseModel):
    total_kg: Decimal
    co2_kg: Decimal
    pickups: int
    earned_kobo: int
    earned_points: Decimal
    by_material: list[MaterialImpact]


class ReverseGeocodeIn(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class ReverseGeocodeOut(BaseModel):
    street: str | None
    area: str | None  # one of AREAS, or None when the place isn't on our list
