"""Coordinates to a street and area, through the public Nominatim server (OpenStreetMap).

Its usage policy (https://operations.osmfoundation.org/policies/nominatim/) binds this file: at most 1 request per
second across the whole app, a User-Agent that identifies us, results cached, attribution shown (the map beside the
button credits OpenStreetMap), no systematic queries (one lookup per tap on "Use my location", never on a pin drag or a
timer), and it asks for no personal data. So calls go through this server only, carrying nothing about the user, with
coordinates rounded to about 11 m. The route takes them in the POST body and this file doesn't log them, so they stay
out of the logs.

The spacing below holds within one process, which is how the Dockerfile runs the API. More than one process or
instance would have to share it (through Redis, say). Heavy traffic is a reason to move to a paid or self-hosted
geocoder: set NOMINATIM_BASE_URL."""
import asyncio
import logging
import time
from typing import NamedTuple

import httpx

from app.areas import AREAS
from app.config import get_settings
from app.redis_client import cache_get, cache_set

log = logging.getLogger(__name__)

# Just over the policy's 1 per second, so timing jitter can't put two requests inside the same second.
MIN_INTERVAL_SECONDS = 1.1
MAX_QUEUE_SECONDS = 5.0
REQUEST_TIMEOUT_SECONDS = 8.0
CACHE_TTL_SECONDS = 7 * 86400
PRECISION = 4  # decimal places: about 11 m

_AREA_BY_NAME = {area.casefold(): area for area in AREAS}
# Where OpenStreetMap may put a place the size of our areas, most specific first.
_AREA_FIELDS = ("neighbourhood", "quarter", "suburb", "city_district", "village", "town")

_turn = asyncio.Lock()
_last_request = 0.0


class GeocodingUnavailable(Exception):
    """The service is busy, down or refusing us. Says nothing about what is at that spot."""


class Place(NamedTuple):
    street: str | None
    area: str | None


def _to_place(payload: dict) -> Place:
    """No house number: at 11 m it can belong to the neighbour, and the user knows their own."""
    address = payload.get("address") or {}  # no "address" at all when Nominatim has nothing there
    area = next(
        (_AREA_BY_NAME[name] for field in _AREA_FIELDS if (name := str(address.get(field, "")).casefold()) in _AREA_BY_NAME),
        None,
    )
    return Place(street=address.get("road") or None, area=area)


async def _ask_nominatim(lat: float, lng: float) -> dict:
    settings = get_settings()
    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
        response = await client.get(
            f"{settings.nominatim_base_url.rstrip('/')}/reverse",
            params={
                "format": "jsonv2",
                "lat": lat,
                "lon": lng,
                "zoom": 18,
                "addressdetails": 1,
                "accept-language": "en",
            },
            headers={"User-Agent": settings.nominatim_user_agent},
        )
    response.raise_for_status()
    return response.json()


async def reverse(lat: float, lng: float) -> Place:
    global _last_request
    lat, lng = round(lat, PRECISION), round(lng, PRECISION)
    key = f"geocode:{lat}:{lng}"
    cached = await cache_get(key)
    if cached is not None:
        return Place(**cached)

    try:
        async with asyncio.timeout(MAX_QUEUE_SECONDS):
            await _turn.acquire()
        # One request at a time, the gap measured from when the last one finished, so a slow send can't close it up.
        try:
            cached = await cache_get(key)  # someone ahead in the queue may have just asked for the same spot
            if cached is not None:
                return Place(**cached)
            wait = _last_request + MIN_INTERVAL_SECONDS - time.monotonic()
            if wait > 0:
                await asyncio.sleep(wait)
            try:
                place = _to_place(await _ask_nominatim(lat, lng))
            finally:
                _last_request = time.monotonic()
            await cache_set(key, place._asdict(), CACHE_TTL_SECONDS)
            return place
        finally:
            _turn.release()
    except (TimeoutError, httpx.HTTPError, ValueError) as error:
        log.warning("Reverse geocoding failed: %s", type(error).__name__)
        raise GeocodingUnavailable from error
