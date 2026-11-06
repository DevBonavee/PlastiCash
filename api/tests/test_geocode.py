"""POST /geocode/reverse: coordinates to a street and area through Nominatim, within its usage policy."""
import asyncio
import time
from uuid import uuid4

import httpx
import pytest
import respx
from httpx import AsyncClient
from sqlmodel.ext.asyncio.session import AsyncSession

from app.config import get_settings
from app.services import geocoding
from tests.factories import make_user
from tests.tokens import bearer

pytestmark = pytest.mark.usefixtures("fake_supabase_auth")

NOMINATIM = "https://nominatim.openstreetmap.org/reverse"
ENUGU = {
    "lat": "6.4483039",
    "lon": "7.5141743",
    "display_name": "National Orientation Agency, 3.0, Independence Avenue, Independence Layout, Enugu, Nigeria",
    "address": {
        "amenity": "National Orientation Agency",
        "house_number": "3.0",
        "road": "Independence Avenue",
        "suburb": "Independence Layout",
        "city": "Enugu",
        "country_code": "ng",
    },
}


@pytest.fixture(autouse=True)
def fresh_geocoder(monkeypatch):
    """A dict stands in for Redis, and no test waits out the real one-second gap unless it asks to."""
    store: dict = {}

    async def cache_get(key):
        return store.get(key)

    async def cache_set(key, value, ttl_seconds):
        store[key] = value

    monkeypatch.setattr(geocoding, "cache_get", cache_get)
    monkeypatch.setattr(geocoding, "cache_set", cache_set)
    monkeypatch.setattr(geocoding, "MIN_INTERVAL_SECONDS", 0)
    monkeypatch.setattr(geocoding, "_turn", asyncio.Lock())
    monkeypatch.setattr(geocoding, "_last_request", 0.0)
    return store


async def reverse(client: AsyncClient, session: AsyncSession, lat="6.4483", lng="7.5139"):
    user = await make_user(session)
    return await client.post("/api/v1/geocode/reverse", json={"lat": lat, "lng": lng}, headers=bearer(user.id))


async def test_needs_a_login(client: AsyncClient):
    response = await client.post("/api/v1/geocode/reverse", json={"lat": 6.4483, "lng": 7.5139})
    assert response.status_code == 401


async def test_signed_in_without_a_profile_is_refused(client: AsyncClient):
    response = await client.post("/api/v1/geocode/reverse", json={"lat": 6.4483, "lng": 7.5139}, headers=bearer(uuid4()))
    assert response.status_code in (403, 404)


@pytest.mark.parametrize(
    "body", [{"lat": 91, "lng": 7.5}, {"lat": 6.4, "lng": 181}, {"lat": "abc", "lng": 7.5}, {"lng": 7.5}]
)
async def test_refuses_bad_coordinates(client: AsyncClient, session: AsyncSession, body: dict):
    user = await make_user(session)
    response = await client.post("/api/v1/geocode/reverse", json=body, headers=bearer(user.id))
    assert response.status_code == 422


async def test_coordinates_stay_out_of_the_url(client: AsyncClient, session: AsyncSession):
    # A query string would land in the access logs, so it must not work.
    user = await make_user(session)
    url = "/api/v1/geocode/reverse?lat=6.4483&lng=7.5139"
    assert (await client.post(url, headers=bearer(user.id))).status_code == 422
    assert (await client.get(url, headers=bearer(user.id))).status_code == 405


@respx.mock
async def test_returns_street_and_a_known_area(client: AsyncClient, session: AsyncSession):
    respx.get(NOMINATIM).respond(200, json=ENUGU)
    response = await reverse(client, session)
    assert response.status_code == 200
    assert response.json() == {"street": "Independence Avenue", "area": "Independence Layout"}


@respx.mock
async def test_area_outside_our_list_is_left_for_the_user(client: AsyncClient, session: AsyncSession):
    body = {"address": {"road": "Some Road", "suburb": "Nowhere Estate", "city": "Enugu"}}
    respx.get(NOMINATIM).respond(200, json=body)
    response = await reverse(client, session)
    assert response.json() == {"street": "Some Road", "area": None}


@respx.mock
async def test_area_matches_whatever_the_case(client: AsyncClient, session: AsyncSession):
    respx.get(NOMINATIM).respond(200, json={"address": {"neighbourhood": "coal camp"}})
    response = await reverse(client, session)
    assert response.json() == {"street": None, "area": "Coal Camp"}


@respx.mock
async def test_no_data_at_that_spot_is_an_empty_answer(client: AsyncClient, session: AsyncSession):
    # Nominatim answers 200 with an error body when it has nothing there.
    respx.get(NOMINATIM).respond(200, json={"error": "Unable to geocode"})
    response = await reverse(client, session)
    assert response.status_code == 200
    assert response.json() == {"street": None, "area": None}


@respx.mock
async def test_follows_the_usage_policy_on_the_request(client: AsyncClient, session: AsyncSession):
    route = respx.get(NOMINATIM).respond(200, json=ENUGU)
    await reverse(client, session, lat="6.448312", lng="7.513987")
    request = route.calls.last.request
    assert request.headers["user-agent"].startswith("PlastiCash/")
    # Rounded to about 11 m before leaving our server, with nothing that identifies the user.
    assert request.url.params["lat"] == "6.4483"
    assert request.url.params["lon"] == "7.514"
    assert set(request.url.params) == {"format", "lat", "lon", "zoom", "addressdetails", "accept-language"}
    assert "authorization" not in request.headers


@respx.mock
async def test_nearby_requests_use_the_cache(client: AsyncClient, session: AsyncSession):
    route = respx.get(NOMINATIM).respond(200, json=ENUGU)
    user = await make_user(session)
    for lng in ("7.51391", "7.51392"):
        response = await client.post("/api/v1/geocode/reverse", json={"lat": "6.4483", "lng": lng}, headers=bearer(user.id))
        assert response.json()["street"] == "Independence Avenue"
    assert route.call_count == 1


@respx.mock
async def test_no_result_is_cached_too(client: AsyncClient, session: AsyncSession):
    route = respx.get(NOMINATIM).respond(200, json={"error": "Unable to geocode"})
    user = await make_user(session)
    for _ in range(2):
        await client.post("/api/v1/geocode/reverse", json={"lat": 6.4483, "lng": 7.5139}, headers=bearer(user.id))
    assert route.call_count == 1


@respx.mock
async def test_requests_are_spaced_out(monkeypatch):
    monkeypatch.setattr(geocoding, "MIN_INTERVAL_SECONDS", 0.2)
    sent: list[float] = []

    def record(request):
        sent.append(time.monotonic())
        return httpx.Response(200, json=ENUGU)

    respx.get(NOMINATIM).mock(side_effect=record)
    await asyncio.gather(*(geocoding.reverse(6.1 + i / 10, 7.5) for i in range(3)))
    assert len(sent) == 3
    assert all(later - earlier >= 0.19 for earlier, later in zip(sent, sent[1:]))


@respx.mock
async def test_a_long_queue_gives_up_instead_of_hanging(monkeypatch):
    monkeypatch.setattr(geocoding, "MIN_INTERVAL_SECONDS", 0.2)
    monkeypatch.setattr(geocoding, "MAX_QUEUE_SECONDS", 0.05)
    respx.get(NOMINATIM).respond(200, json=ENUGU)
    results = await asyncio.gather(
        *(geocoding.reverse(6.1 + i / 10, 7.5) for i in range(3)), return_exceptions=True
    )
    assert any(isinstance(result, geocoding.GeocodingUnavailable) for result in results)


@respx.mock
@pytest.mark.parametrize("failure", [httpx.Response(429), httpx.Response(503), httpx.ConnectTimeout("slow")])
async def test_service_trouble_is_a_clean_503(client: AsyncClient, session: AsyncSession, failure, fresh_geocoder):
    route = respx.get(NOMINATIM)
    if isinstance(failure, Exception):
        route.mock(side_effect=failure)
    else:
        route.mock(return_value=failure)
    response = await reverse(client, session)
    assert response.status_code == 503
    assert response.json()["code"] == "GEOCODE_UNAVAILABLE"
    assert fresh_geocoder == {}  # a failure must not be remembered as "nothing here"


# ----- NIPOST postcode API, used first when POSTCODE_API_KEY is set -----

NIPOST = "https://api.postcode.gov.ng/v1/search/reverse"


def nipost_unit(**unit) -> dict:
    """The response shape from the API's OpenAPI schema; the docs give no example for this endpoint."""
    return {"data": {
        "found": True,
        "coordinate": [7.5139, 6.4483],
        "unit": {"postcode": "EN-01-A03-FK-01", "display": "EN 01 A03 FK 01", "distance_m": 8, "confidence": "high", **unit},
        "area": "EN-01-A03-FK",
        "district": "EN-01-A03",
        "state": "EN",
        "radius_m": 25,
    }}


LEVEL_2 = {"state_name": "ENUGU", "lga_name": "ENUGU NORTH", "locality_name": "GRA", "address": "4 OKPARA AVENUE, GRA"}


@pytest.fixture
def nipost_key(monkeypatch):
    monkeypatch.setattr(get_settings(), "postcode_api_key", "nipost_test_abc")


@respx.mock
async def test_without_a_key_nipost_is_never_called(client: AsyncClient, session: AsyncSession):
    nipost = respx.get(NIPOST).respond(200, json=nipost_unit(**LEVEL_2))
    respx.get(NOMINATIM).respond(200, json=ENUGU)
    response = await reverse(client, session)
    assert response.json()["street"] == "Independence Avenue"
    assert not nipost.called


@respx.mock
@pytest.mark.usefixtures("nipost_key")
async def test_nipost_answer_is_used_without_asking_nominatim(client: AsyncClient, session: AsyncSession):
    nipost = respx.get(NIPOST).respond(200, json=nipost_unit(**LEVEL_2))
    nominatim = respx.get(NOMINATIM).respond(200, json=ENUGU)
    response = await reverse(client, session, lat="6.448312", lng="7.513987")
    assert response.json() == {"street": "4 OKPARA AVENUE, GRA", "area": "GRA"}
    assert not nominatim.called
    request = nipost.calls.last.request
    assert request.headers["x-api-key"] == "nipost_test_abc"
    assert dict(request.url.params) == {"lat": "6.4483", "lng": "7.514"}


@respx.mock
@pytest.mark.usefixtures("nipost_key")
async def test_a_free_key_without_names_falls_back_to_nominatim(client: AsyncClient, session: AsyncSession):
    respx.get(NIPOST).respond(200, json=nipost_unit())  # below level 2: postcode only
    respx.get(NOMINATIM).respond(200, json=ENUGU)
    response = await reverse(client, session)
    assert response.json() == {"street": "Independence Avenue", "area": "Independence Layout"}


@respx.mock
@pytest.mark.usefixtures("nipost_key")
async def test_nominatim_fills_only_what_nipost_left_out(client: AsyncClient, session: AsyncSession):
    respx.get(NIPOST).respond(200, json=nipost_unit(locality_name="ENUGU", address="4 OKPARA AVENUE"))
    respx.get(NOMINATIM).respond(200, json=ENUGU)
    response = await reverse(client, session)
    assert response.json() == {"street": "4 OKPARA AVENUE", "area": "Independence Layout"}


@respx.mock
@pytest.mark.usefixtures("nipost_key")
async def test_a_low_confidence_unit_is_ignored(client: AsyncClient, session: AsyncSession):
    respx.get(NIPOST).respond(200, json=nipost_unit(**LEVEL_2, confidence="low"))
    respx.get(NOMINATIM).respond(200, json=ENUGU)
    response = await reverse(client, session)
    assert response.json()["street"] == "Independence Avenue"


@respx.mock
@pytest.mark.usefixtures("nipost_key")
async def test_no_unit_nearby_falls_back_and_is_cached(client: AsyncClient, session: AsyncSession):
    nipost = respx.get(NIPOST).respond(200, json={"data": {"found": False, "message": "no unit", "radius_m": 25}})
    respx.get(NOMINATIM).respond(200, json=ENUGU)
    user = await make_user(session)
    for _ in range(2):
        response = await client.post("/api/v1/geocode/reverse", json={"lat": 6.4483, "lng": 7.5139}, headers=bearer(user.id))
    assert response.json()["street"] == "Independence Avenue"
    assert nipost.call_count == 1


@respx.mock
@pytest.mark.usefixtures("nipost_key")
@pytest.mark.parametrize("status", [401, 402, 403, 429, 500])
async def test_nipost_trouble_falls_back_and_is_not_cached(client: AsyncClient, session: AsyncSession, status: int):
    nipost = respx.get(NIPOST).respond(status, json={"error": {"code": "x", "message": "y"}})
    respx.get(NOMINATIM).respond(200, json=ENUGU)
    user = await make_user(session)
    for _ in range(2):
        response = await client.post("/api/v1/geocode/reverse", json={"lat": 6.4483, "lng": 7.5139}, headers=bearer(user.id))
        assert response.status_code == 200
    assert response.json()["street"] == "Independence Avenue"
    assert nipost.call_count == 2


@respx.mock
@pytest.mark.usefixtures("nipost_key")
async def test_nipost_network_failure_falls_back(client: AsyncClient, session: AsyncSession):
    respx.get(NIPOST).mock(side_effect=httpx.ConnectTimeout("slow"))
    respx.get(NOMINATIM).respond(200, json=ENUGU)
    assert (await reverse(client, session)).json()["street"] == "Independence Avenue"


@respx.mock
@pytest.mark.usefixtures("nipost_key")
async def test_nipost_answer_survives_nominatim_being_down(client: AsyncClient, session: AsyncSession):
    respx.get(NIPOST).respond(200, json=nipost_unit(locality_name="ENUGU", address="4 OKPARA AVENUE"))
    respx.get(NOMINATIM).respond(503)
    response = await reverse(client, session)
    assert response.status_code == 200
    assert response.json() == {"street": "4 OKPARA AVENUE", "area": None}


@respx.mock
@pytest.mark.usefixtures("nipost_key")
async def test_both_down_is_a_503(client: AsyncClient, session: AsyncSession):
    respx.get(NIPOST).respond(500)
    respx.get(NOMINATIM).respond(503)
    response = await reverse(client, session)
    assert response.status_code == 503
