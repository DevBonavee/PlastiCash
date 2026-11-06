"""Bank details for payouts: GET /banks, POST /me/bank/resolve, POST /me/bank (Paystack mocked with respx)."""
import pytest
import respx
from httpx import AsyncClient
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models import Profile
from app.services import paystack
from app.services.paystack import BASE_URL
from app.config import get_settings
from tests.factories import make_user
from tests.tokens import bearer

pytestmark = pytest.mark.usefixtures("fake_supabase_auth")

BANKS = {"status": True, "data": [{"name": "Guaranty Trust Bank", "code": "058", "active": True},
                                  {"name": "Access Bank", "code": "044", "active": True}]}
BODY = {"bank_code": "058", "account_number": "0123456789"}


@pytest.fixture(autouse=True)
def mocked_paystack(monkeypatch):
    monkeypatch.setattr(paystack, "_banks_cache", None)
    monkeypatch.setattr(get_settings(), "paystack_secret_key", "sk_live_abc")  # no test bank in the list
    with respx.mock(assert_all_called=False) as mock:
        mock.get(f"{BASE_URL}/bank").respond(200, json=BANKS)
        yield mock


async def test_bank_list(client: AsyncClient, session: AsyncSession) -> None:
    user = await make_user(session)
    response = await client.get("/api/v1/banks", headers=bearer(user.id))
    assert response.json() == [{"name": "Guaranty Trust Bank", "code": "058"}, {"name": "Access Bank", "code": "044"}]


async def test_paystack_limit_is_not_reported_as_a_wrong_account(
    client: AsyncClient, session: AsyncSession, mocked_paystack
) -> None:
    message = "Test mode daily limit of 3 live bank resolves exceeded. Use test bank codes 001 or upgrade to live mode."
    mocked_paystack.get(f"{BASE_URL}/bank/resolve").respond(429, json={"status": False, "message": message})
    user = await make_user(session)
    response = await client.post("/api/v1/me/bank/resolve", json=BODY, headers=bearer(user.id))
    assert response.status_code == 429
    assert response.json()["code"] == "BANK_CHECK_LIMIT"


async def test_wrong_account_still_says_so(client: AsyncClient, session: AsyncSession, mocked_paystack) -> None:
    mocked_paystack.get(f"{BASE_URL}/bank/resolve").respond(422, json={"status": False, "message": "Could not resolve"})
    user = await make_user(session)
    response = await client.post("/api/v1/me/bank/resolve", json=BODY, headers=bearer(user.id))
    assert response.status_code == 422
    assert response.json()["code"] == "ACCOUNT_NOT_FOUND"


@pytest.mark.parametrize(("key", "offered"), [("sk_test_abc", True), ("sk_live_abc", False)])
async def test_test_bank_is_only_offered_with_a_test_key(
    client: AsyncClient, session: AsyncSession, monkeypatch, key: str, offered: bool
) -> None:
    monkeypatch.setattr(get_settings(), "paystack_secret_key", key)
    user = await make_user(session)
    response = await client.get("/api/v1/banks", headers=bearer(user.id))
    assert ("001" in [bank["code"] for bank in response.json()]) is offered


async def test_resolve_shows_the_name_without_saving(client: AsyncClient, session: AsyncSession, mocked_paystack) -> None:
    user = await make_user(session)
    mocked_paystack.get(f"{BASE_URL}/bank/resolve").respond(200, json={"status": True, "data": {"account_name": "CHINAZA OKAFOR"}})
    response = await client.post("/api/v1/me/bank/resolve", json=BODY, headers=bearer(user.id))
    assert response.json() == {"bank_name": "Guaranty Trust Bank", "account_name": "CHINAZA OKAFOR"}
    await session.refresh(user)
    assert user.account_number is None


async def test_save_bank_resolves_again_and_creates_recipient(
    client: AsyncClient, session: AsyncSession, mocked_paystack
) -> None:
    user = await make_user(session)
    mocked_paystack.get(f"{BASE_URL}/bank/resolve").respond(200, json={"status": True, "data": {"account_name": "CHINAZA OKAFOR"}})
    recipient = mocked_paystack.post(f"{BASE_URL}/transferrecipient").respond(
        200, json={"status": True, "data": {"recipient_code": "RCP_new"}}
    )
    response = await client.post("/api/v1/me/bank", json=BODY, headers=bearer(user.id))
    assert response.status_code == 200
    assert response.json()["bank"] == {"bank_name": "Guaranty Trust Bank", "account_name": "CHINAZA OKAFOR",
                                       "account_number_last4": "6789"}
    assert b'"name":"CHINAZA OKAFOR"' in recipient.calls[0].request.read()
    saved = await session.get(Profile, user.id)
    assert (saved.paystack_recipient_code, saved.account_number) == ("RCP_new", "0123456789")


async def test_unknown_account_is_a_clear_error(client: AsyncClient, session: AsyncSession, mocked_paystack) -> None:
    user = await make_user(session)
    mocked_paystack.get(f"{BASE_URL}/bank/resolve").respond(422, json={"status": False, "message": "Could not resolve account name"})
    response = await client.post("/api/v1/me/bank", json=BODY, headers=bearer(user.id))
    assert (response.status_code, response.json()["code"]) == (422, "ACCOUNT_NOT_FOUND")
    await session.refresh(user)
    assert user.paystack_recipient_code is None


@pytest.mark.parametrize("body", [{"bank_code": "058", "account_number": "12345"},
                                  {"bank_code": "999", "account_number": "0123456789"}],
                         ids=["not 10 digits", "unknown bank"])
async def test_bank_validation(client: AsyncClient, session: AsyncSession, body) -> None:
    user = await make_user(session)
    assert (await client.post("/api/v1/me/bank/resolve", json=body, headers=bearer(user.id))).status_code == 422


async def test_banks_sharing_a_code_become_one_choice(client: AsyncClient, session: AsyncSession, mocked_paystack) -> None:
    # Paystack lists different banks under one code, and the code is all a transfer uses, so the list offers one choice
    # naming both. The user checks the account holder's name before saving.
    mocked_paystack.get(f"{BASE_URL}/bank").respond(200, json={"status": True, "data": [
        {"name": "Stellas MFB", "code": "51253", "active": True},
        {"name": "Access Bank", "code": "044", "active": True},
        {"name": "YCT MFB", "code": "51253", "active": True},
        {"name": "Access Bank", "code": "044", "active": True},
    ]})
    user = await make_user(session)
    response = await client.get("/api/v1/banks", headers=bearer(user.id))
    assert response.json() == [{"name": "Stellas MFB / YCT MFB", "code": "51253"}, {"name": "Access Bank", "code": "044"}]
