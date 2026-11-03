"""Marketing email: opt-in only, footer and List-Unsubscribe headers always, public idempotent unsubscribe."""
from uuid import uuid4

import pytest
import respx
from httpx import AsyncClient, Response
from sqlmodel.ext.asyncio.session import AsyncSession

from app.config import Settings
from app.models import Profile
from app.services import email, marketing
from tests.factories import make_user
from tests.test_me import INDIVIDUAL, sign_up
from tests.tokens import bearer

pytestmark = pytest.mark.usefixtures("fake_supabase_auth")

API = "/api/v1"


@pytest.fixture
def email_settings(monkeypatch) -> Settings:
    settings = Settings(
        resend_api_key="re_test_key",
        email_from="PlastiCash <hello@plasticash.app>",
        site_url="https://plasticash.example",
        api_public_url="https://api.plasticash.example/api/v1",
    )
    monkeypatch.setattr(email, "get_settings", lambda: settings)
    return settings


async def opted_in(session: AsyncSession) -> Profile:
    user = await make_user(session, "Chinaza")
    marketing.set_opt_in(user, True)
    session.add(user)
    await session.commit()
    return user


# ----- Sending -----


@respx.mock
async def test_no_marketing_email_without_opt_in(session: AsyncSession, email_settings) -> None:
    route = respx.post(email.RESEND_URL).mock(return_value=Response(200, json={"id": "x"}))
    user = await make_user(session, "Ngozi")
    with pytest.raises(email.NotOptedIn):
        await email.send_marketing(user, "New prices", "PET is up.", "<p>PET is up.</p>")
    # Opted in, then out again: still refused.
    marketing.set_opt_in(user, True)
    marketing.set_opt_in(user, False)
    with pytest.raises(email.NotOptedIn):
        await email.send_marketing(user, "New prices", "PET is up.", "<p>PET is up.</p>")
    assert not route.called


@respx.mock
async def test_marketing_email_always_has_footer_and_unsubscribe_headers(session: AsyncSession, email_settings) -> None:
    route = respx.post(email.RESEND_URL).mock(return_value=Response(200, json={"id": "x"}))
    user = await opted_in(session)
    assert await email.send_marketing(user, "New prices", "PET is up.", "<p>PET is up.</p>") is True
    sent = route.calls.last.request
    payload = __import__("json").loads(sent.content)
    token = user.unsubscribe_token
    for body in (payload["text"], payload["html"]):
        assert "EcoCyclers" in body and "21A Off Umuawulu" in body
        assert "because you said yes" in body
        assert f"https://plasticash.example/unsubscribe/{token}" in body
        assert "https://plasticash.example/privacy" in body
    assert payload["headers"] == {
        "List-Unsubscribe": f"<https://api.plasticash.example/api/v1/unsubscribe/{token}>",
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    }
    assert sent.headers["Authorization"] == "Bearer re_test_key"


async def test_without_a_key_nothing_is_sent_or_logged_in_full(session: AsyncSession, monkeypatch, caplog) -> None:
    monkeypatch.setattr(email, "get_settings", lambda: Settings(resend_api_key=""))
    user = await opted_in(session)
    with caplog.at_level("INFO", logger="app.services.email"):
        assert await email.send_marketing(user, "Secret subject", "Body text", "<p>Body</p>") is False
    assert "Email would send" in caplog.text
    assert "Secret subject" not in caplog.text and user.email not in caplog.text


# ----- Opting in -----


async def test_sign_up_is_opted_out_unless_ticked(client: AsyncClient, session: AsyncSession) -> None:
    quiet, keen = uuid4(), uuid4()
    assert (await sign_up(client, INDIVIDUAL, quiet)).json()["marketing_opt_in"] is False
    body = {**INDIVIDUAL, "phone": "08012345678", "marketing_opt_in": True}
    assert (await sign_up(client, body, keen, email="keen@example.com")).json()["marketing_opt_in"] is True
    profile = await session.get(Profile, keen)
    assert profile.marketing_opt_in_at is not None and profile.unsubscribe_token


async def test_settings_toggle(client: AsyncClient, session: AsyncSession) -> None:
    user_id = uuid4()
    await sign_up(client, INDIVIDUAL, user_id)
    on = await client.patch(f"{API}/me", json={"marketing_opt_in": True}, headers=bearer(user_id))
    assert on.status_code == 200 and on.json()["marketing_opt_in"] is True
    off = await client.patch(f"{API}/me", json={"marketing_opt_in": False}, headers=bearer(user_id))
    assert off.json()["marketing_opt_in"] is False
    profile = await session.get(Profile, user_id)
    await session.refresh(profile)
    assert profile.marketing_opt_in_at is None and profile.unsubscribe_token, "token kept for old emails' links"


# ----- Unsubscribe -----


async def test_unsubscribe_needs_no_login_and_is_idempotent(client: AsyncClient, session: AsyncSession) -> None:
    user = await opted_in(session)
    token = user.unsubscribe_token
    first = await client.post(f"{API}/unsubscribe/{token}")
    assert first.status_code == 200 and first.json() == {"email": "c…@example.com", "subscribed": False}
    again = await client.post(f"{API}/unsubscribe/{token}")
    assert again.status_code == 200 and again.json()["subscribed"] is False
    await session.refresh(user)
    assert user.marketing_opt_in is False
    with pytest.raises(email.NotOptedIn):
        email.marketing_email(user, "Hi", "x", "<p>x</p>")


async def test_one_click_post_from_a_mail_app(client: AsyncClient, session: AsyncSession) -> None:
    user = await opted_in(session)
    response = await client.post(
        f"{API}/unsubscribe/{user.unsubscribe_token}",
        content="List-Unsubscribe=One-Click",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert response.status_code == 200
    await session.refresh(user)
    assert user.marketing_opt_in is False


async def test_resubscribe_and_status(client: AsyncClient, session: AsyncSession) -> None:
    user = await opted_in(session)
    token = user.unsubscribe_token
    await client.post(f"{API}/unsubscribe/{token}")
    assert (await client.get(f"{API}/unsubscribe/{token}")).json()["subscribed"] is False
    back = await client.post(f"{API}/unsubscribe/{token}/resubscribe")
    assert back.status_code == 200 and back.json()["subscribed"] is True
    await session.refresh(user)
    assert user.marketing_opt_in and user.marketing_opt_in_at is not None


async def test_unknown_token(client: AsyncClient) -> None:
    assert (await client.post(f"{API}/unsubscribe/nope")).status_code == 404
