"""Nigerian mobile numbers, stored as +234 followed by 10 digits.

The browser uses the same rule (web/lib/phone.ts), so both sides accept and reject the same numbers.
"""
import re

PHONE_ERROR = "Enter a valid Nigerian phone number, e.g. 0801 234 5678"

_SEPARATORS = re.compile(r"[\s\-]")
# 10 digits after +234: first 7, 8 or 9, second 0 or 1 (the mobile prefixes 070x, 080x, 081x, 090x, 091x...).
_NATIONAL = re.compile(r"[789][01]\d{8}")


def normalize_ng_phone(raw: str) -> str | None:
    """'08012345678', '8012345678', '2348012345678' or '+234 801-234-5678' -> '+2348012345678'.
    Spaces and dashes are allowed; anything else (letters, brackets, dots) is rejected. Returns None if it isn't a
    Nigerian mobile number."""
    value = _SEPARATORS.sub("", raw)
    if value.startswith("+234"):
        value = value[4:]
    elif value.startswith("234") and len(value) == 13:
        value = value[3:]
    elif value.startswith("0") and len(value) == 11:
        value = value[1:]
    if _NATIONAL.fullmatch(value):
        return f"+234{value}"
    return None
