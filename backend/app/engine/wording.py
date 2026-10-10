"""Money, dates and counts as the screens show them (DESIGN section 8.2). One place only."""

from datetime import date, datetime

NBSP = " "
MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
MONTHS_LONG = (
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
)
COUNT_WORDS = ("No", "One", "Two", "Three", "Four", "Five")
CHARGE_NAMES = {
    "LATE_PAYMENT": "Late payment penalty",
    "LOAN_ISSUANCE": "Loan issuance fee",
    "CARD_REISSUE": "Card reissue fee",
}


def charge_name(code: str) -> str:
    """The plain name of a penalty or fee. An unknown code is shown in plain words."""
    return CHARGE_NAMES.get(code) or code.replace("_", " ").capitalize()


def som(amount: int) -> str:
    """1500000 -> "1 500 000 soʻm", with spaces that never break a line."""
    return f"{amount:,}".replace(",", NBSP) + f"{NBSP}soʻm"


def day(value: date) -> str:
    """25 Aug 2026."""
    return f"{value.day} {MONTHS[value.month - 1]} {value.year}"


def month(value: date) -> str:
    """August 2026."""
    return f"{MONTHS_LONG[value.month - 1]} {value.year}"


def clock(value: datetime) -> str:
    """02:14, Tashkent time."""
    return f"{value.hour:02d}:{value.minute:02d}"


def count_of(number: int, one: str) -> str:
    """1 business day, 3 business days."""
    return f"{number} {one}" if number == 1 else f"{number} {one}s"


def days(number: int) -> str:
    """1 day, 3 days."""
    return count_of(number, "day")


def count(number: int) -> str:
    """A small count in words, to start a sentence."""
    return COUNT_WORDS[number] if number < len(COUNT_WORDS) else str(number)
