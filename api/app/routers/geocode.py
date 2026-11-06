"""Turn the device's coordinates into a street and area, to fill in the address form (services/geocoding.py).

POST with the coordinates in the body, though it changes nothing: a query string would put them in the access logs."""
from fastapi import APIRouter, Depends

from app.auth import CurrentProfile
from app.errors import ApiError
from app.ratelimit import HOUR, rate_limit
from app.schemas import ReverseGeocodeIn, ReverseGeocodeOut
from app.services import geocoding

router = APIRouter(tags=["geocode"])


@router.post(
    "/geocode/reverse", response_model=ReverseGeocodeOut,
    dependencies=[Depends(rate_limit("reverse-geocode", 30, HOUR))],
)
async def reverse_geocode(body: ReverseGeocodeIn, _profile: CurrentProfile) -> ReverseGeocodeOut:
    try:
        place = await geocoding.reverse(body.lat, body.lng)
    except geocoding.GeocodingUnavailable:
        raise ApiError(503, "GEOCODE_UNAVAILABLE", "We couldn't look up that address just now.") from None
    return ReverseGeocodeOut(street=place.street, area=place.area)
