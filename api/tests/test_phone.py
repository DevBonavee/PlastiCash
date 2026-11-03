"""Nigerian phone rule (app/phone.py), the same rule as web/lib/phone.ts."""
from uuid import uuid4

import pytest
from httpx import AsyncClient

from app.phone import PHONE_ERROR, normalize_ng_phone
from tests.test_me import INDIVIDUAL, sign_up

pytestmark = pytest.mark.usefixtures("fake_supabase_auth")


@pytest.mark.parametrize(
    "raw",
    ["08012345678", "8012345678", "+2348012345678", "2348012345678", "0801 234 5678", "0801-234-5678",
     "+234 801 234 5678", " 0801 234 5678 "],
)
def test_valid_numbers_normalise_to_plus_234(raw: str) -> None:
    assert normalize_ng_phone(raw) == "+2348012345678"


@pytest.mark.parametrize("raw", ["07012345678", "09012345678", "09112345678", "08112345678", "07112345678"])
def test_every_mobile_prefix_is_accepted(raw: str) -> None:
    phone = normalize_ng_phone(raw)
    assert phone is not None and phone.startswith("+234") and len(phone) == 14  # "+" and 13 digits


@pytest.mark.parametrize(
    "raw",
    ["", "08212345678", "06012345678", "0801234567", "080123456789", "+2338012345678", "(0801) 234 5678",
     "0801.234.5678", "0801234567a", "008012345678", "+23408012345678"],
)
def test_invalid_numbers_are_rejected(raw: str) -> None:
    assert normalize_ng_phone(raw) is None


async def test_api_stores_the_normalised_number(client: AsyncClient) -> None:
    response = await sign_up(client, {**INDIVIDUAL, "phone": "0801-234 5678"})
    assert response.status_code == 201
    assert response.json()["phone"] == "+2348012345678"


async def test_api_rejects_an_invalid_number_with_the_shared_message(client: AsyncClient) -> None:
    response = await sign_up(client, {**INDIVIDUAL, "phone": "0821 234 5678"})
    assert response.status_code == 422
    assert PHONE_ERROR in response.text


async def test_duplicate_number_is_409_in_any_format(client: AsyncClient) -> None:
    assert (await sign_up(client, {**INDIVIDUAL, "phone": "08012345678"})).status_code == 201
    response = await sign_up(client, {**INDIVIDUAL, "phone": "+234 801 234 5678"}, uuid4(), email="other@example.com")
    assert response.status_code == 409
    assert response.json()["code"] == "PHONE_TAKEN"
    assert response.json()["message"] == "This number is already registered"
