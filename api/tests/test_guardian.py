"""Age check and parent or guardian consent (NDPA 2023). services/guardian.py, routers/guardian.py."""
from datetime import UTC, date, datetime, timedelta
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models import GuardianConsent, Profile, Role
from app.services import guardian, ledger, supabase_admin
from tests.factories import make_user
from tests.test_me import INDIVIDUAL, ORGANIZATION, sign_up
from tests.test_pickups import request_body
from tests.tokens import bearer

pytestmark = pytest.mark.usefixtures("fake_supabase_auth", "app_settings")

API = "/api/v1"


def born_years_ago(years: int, days: int = 0) -> str:
    today = guardian.lagos_today()
    return (date(today.year - years, today.month, min(today.day, 28)) - timedelta(days=days)).isoformat()


TEEN = {
    **INDIVIDUAL,
    "date_of_birth": born_years_ago(15),
    "guardian_name": "Ngozi Okafor",
    "guardian_phone": "0803 555 0101",
    "guardian_email": "Ngozi@Example.com",
    "guardian_aware": True,
}


@pytest.fixture
def links(monkeypatch) -> list[tuple[str, str]]:
    """Consent links sent: [(guardian_email, token), ...]."""
    sent: list[tuple[str, str]] = []

    async def fake_send(profile: Profile, token: str) -> None:
        sent.append((profile.guardian_email, token))

    monkeypatch.setattr(guardian, "send_link", fake_send)
    return sent


@pytest.fixture
def deleted(monkeypatch) -> list:
    gone: list = []

    async def fake_delete(user_id) -> None:
        gone.append(user_id)

    monkeypatch.setattr(supabase_admin, "delete_user", fake_delete)
    return gone


async def teen(client: AsyncClient, links) -> tuple:
    user_id = uuid4()
    response = await sign_up(client, TEEN, user_id, email="teen@example.com")
    assert response.status_code == 201, response.text
    return user_id, links[-1][1]


# ----- Age rules at sign-up -----


async def test_under_13_is_blocked_and_the_login_is_deleted(client: AsyncClient, session: AsyncSession, deleted) -> None:
    user_id = uuid4()
    response = await sign_up(client, {**INDIVIDUAL, "date_of_birth": born_years_ago(12)}, user_id)
    assert response.status_code == 403
    assert response.json()["code"] == "UNDER_13"
    assert response.json()["message"] == guardian.UNDER_13_MESSAGE
    assert deleted == [user_id]
    assert await session.get(Profile, user_id) is None


async def test_day_of_13th_birthday_is_allowed(client: AsyncClient, links, deleted) -> None:
    today = guardian.lagos_today()
    if today.month == 2 and today.day == 29:
        pytest.skip("no 13th birthday on 29 February in most years")
    birthday = date(today.year - 13, today.month, today.day).isoformat()
    response = await sign_up(client, {**TEEN, "date_of_birth": birthday})
    assert response.status_code == 201, response.text
    assert deleted == []


async def test_individuals_need_a_date_of_birth(client: AsyncClient) -> None:
    body = {k: v for k, v in INDIVIDUAL.items() if k != "date_of_birth"}
    assert (await sign_up(client, body)).status_code == 422
    future = (guardian.lagos_today() + timedelta(days=1)).isoformat()
    assert (await sign_up(client, {**INDIVIDUAL, "date_of_birth": future})).status_code == 422


async def test_13_to_17_need_guardian_details_and_the_tick(client: AsyncClient, links) -> None:
    for missing in ("guardian_name", "guardian_phone", "guardian_email"):
        assert (await sign_up(client, {**TEEN, missing: None})).status_code == 422, missing
    assert (await sign_up(client, {**TEEN, "guardian_aware": False})).status_code == 422
    assert (await sign_up(client, {**TEEN, "guardian_phone": "0821 234 5678"})).status_code == 422
    assert (await sign_up(client, {**TEEN, "guardian_email": "not-an-email"})).status_code == 422
    assert links == []


async def test_adults_keep_no_guardian_details(client: AsyncClient, session: AsyncSession, links) -> None:
    user_id = uuid4()
    response = await sign_up(client, {**TEEN, "date_of_birth": born_years_ago(30)}, user_id)
    assert response.status_code == 201
    assert response.json()["is_minor"] is False and response.json()["guardian"] is None
    profile = await session.get(Profile, user_id)
    assert profile.guardian_name is None and profile.guardian_consent_status == GuardianConsent.NOT_REQUIRED
    assert links == []


async def test_organization_contact_must_confirm_18_or_older(client: AsyncClient) -> None:
    assert (await sign_up(client, {**ORGANIZATION, "adult_confirmed": False})).status_code == 422
    assert (await sign_up(client, ORGANIZATION)).status_code == 201


# ----- 13 to 17: locked until a guardian consents -----


async def test_minor_is_pending_and_the_guardian_gets_a_link(client: AsyncClient, session: AsyncSession, links) -> None:
    user_id, token = await teen(client, links)
    assert links == [("ngozi@example.com", token)]
    profile = await session.get(Profile, user_id)
    assert profile.is_minor and profile.guardian_consent_status == GuardianConsent.PENDING
    assert profile.guardian_token_hash == guardian.hash_token(token) and token not in profile.guardian_token_hash
    assert profile.guardian_token_expires_at - datetime.now(UTC) > timedelta(days=6, hours=23)
    me = (await client.get(f"{API}/me", headers=bearer(user_id))).json()
    assert me["guardian"] == {"status": "PENDING", "name": "Ngozi Okafor", "link_expired": False, "resends_left": 3}


async def test_minor_cannot_request_pickup_save_bank_or_withdraw_before_consent(
    client: AsyncClient, session: AsyncSession, links
) -> None:
    user_id, _ = await teen(client, links)
    admin = await make_user(session, "Admin", role=Role.ADMIN)
    await ledger.add_adjustment(session, user_id, 1_000_000, "Opening balance for test", admin.id)
    profile = await session.get(Profile, user_id)
    profile.bank_name, profile.bank_code, profile.account_number = "GTBank", "058", "0123456789"
    profile.account_name, profile.paystack_recipient_code = "NGOZI OKAFOR", "RCP_test"
    session.add(profile)
    await session.commit()
    headers = bearer(user_id)
    for method, path, body in (
        ("POST", "/pickups", request_body()),
        ("POST", "/me/bank", {"bank_code": "058", "account_number": "0123456789"}),
        ("POST", "/withdrawals", {"amount_kobo": 500_000}),
    ):
        response = await client.request(method, f"{API}{path}", json=body, headers=headers)
        assert response.status_code == 403, (path, response.text)
        assert response.json()["code"] == "GUARDIAN_CONSENT_REQUIRED"


async def test_consent_unlocks_and_the_link_works_once(client: AsyncClient, session: AsyncSession, links) -> None:
    user_id, token = await teen(client, links)
    info = await client.get(f"{API}/guardian-consent/{token}")
    assert info.status_code == 200
    assert info.json()["child_first_name"] == "Chinaza"
    response = await client.post(f"{API}/guardian-consent/{token}", json={"decision": "GRANT"})
    assert response.status_code == 200 and response.json()["status"] == "GRANTED"
    profile = await session.get(Profile, user_id)
    await session.refresh(profile)
    assert profile.guardian_consent_at is not None and profile.guardian_token_hash is None
    assert not guardian.is_locked(profile)
    # Reused: both reading and answering are refused.
    assert (await client.get(f"{API}/guardian-consent/{token}")).status_code == 404
    again = await client.post(f"{API}/guardian-consent/{token}", json={"decision": "DECLINE"})
    assert again.status_code == 404 and again.json()["code"] == "LINK_INVALID"
    # Unlocked: a withdrawal now gets past the consent check (and stops at the missing bank account).
    withdraw = await client.post(f"{API}/withdrawals", json={"amount_kobo": 500_000}, headers=bearer(user_id))
    assert withdraw.json()["code"] != "GUARDIAN_CONSENT_REQUIRED"


async def test_expired_link_is_rejected(client: AsyncClient, session: AsyncSession, links) -> None:
    user_id, token = await teen(client, links)
    profile = await session.get(Profile, user_id)
    profile.guardian_token_expires_at = datetime.now(UTC) - timedelta(minutes=1)
    session.add(profile)
    await session.commit()
    assert (await client.get(f"{API}/guardian-consent/{token}")).status_code == 410
    response = await client.post(f"{API}/guardian-consent/{token}", json={"decision": "GRANT"})
    assert response.status_code == 410 and response.json()["code"] == "LINK_EXPIRED"
    await session.refresh(profile)
    assert profile.guardian_consent_status == GuardianConsent.PENDING
    me = (await client.get(f"{API}/me", headers=bearer(user_id))).json()
    assert me["guardian"]["link_expired"] is True


async def test_made_up_token_is_rejected(client: AsyncClient) -> None:
    assert (await client.get(f"{API}/guardian-consent/not-a-real-token")).status_code == 404


async def test_decline_keeps_the_account_locked_and_admin_sees_it(
    client: AsyncClient, session: AsyncSession, links
) -> None:
    user_id, token = await teen(client, links)
    await client.post(f"{API}/guardian-consent/{token}", json={"decision": "DECLINE"})
    response = await client.post(f"{API}/pickups", json=request_body(), headers=bearer(user_id))
    assert response.status_code == 403
    admin = await make_user(session, "Admin", role=Role.ADMIN)
    await session.commit()
    rows = (await client.get(f"{API}/admin/users?minor=true&consent=DECLINED", headers=bearer(admin.id))).json()
    assert [(r["id"], r["is_minor"], r["guardian_consent"]) for r in rows] == [(str(user_id), True, "DECLINED")]
    assert (await client.get(f"{API}/admin/users?consent=PENDING", headers=bearer(admin.id))).json() == []


async def test_resend_replaces_the_link_up_to_three_times(client: AsyncClient, links) -> None:
    user_id, first = await teen(client, links)
    headers = bearer(user_id)
    for left in (2, 1, 0):
        response = await client.post(f"{API}/me/guardian/resend", headers=headers)
        assert response.status_code == 200, response.text
        assert response.json()["guardian"]["resends_left"] == left
    assert len({token for _, token in links}) == 4
    assert (await client.get(f"{API}/guardian-consent/{first}")).status_code == 404, "old links stop working"
    assert (await client.get(f"{API}/guardian-consent/{links[-1][1]}")).status_code == 200
    response = await client.post(f"{API}/me/guardian/resend", headers=headers)
    assert response.status_code == 409 and response.json()["code"] == "RESEND_LIMIT"


async def test_adults_have_nothing_to_resend(client: AsyncClient) -> None:
    user_id = uuid4()
    assert (await sign_up(client, INDIVIDUAL, user_id)).status_code == 201
    response = await client.post(f"{API}/me/guardian/resend", headers=bearer(user_id))
    assert response.status_code == 409


def test_bank_name_must_look_like_the_guardians() -> None:
    assert not guardian.names_differ("Ngozi Okafor", "OKAFOR NGOZI ADAEZE")
    assert not guardian.names_differ("Mrs. Ngozi Okafor", "NGOZI OKAFOR")
    assert guardian.names_differ("Ngozi Okafor", "CHINAZA OKAFOR")
    assert guardian.names_differ("Ngozi Okafor", None)
    assert not guardian.names_differ("Ngozi", "NGOZI EZE")


def test_age_counts_birthdays() -> None:
    assert guardian.age_on(date(2010, 11, 3), date(2026, 11, 3)) == 16
    assert guardian.age_on(date(2010, 11, 4), date(2026, 11, 3)) == 15
