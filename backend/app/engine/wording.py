"""Money, dates and counts as the screens show them (DESIGN section 8.2). One place only.

Every sentence FeeGuard writes exists in English, Uzbek (Latin) and Russian (DECISIONS
D-041). A sentence is built by a function that reads the language from `_lang`; `said`
runs it once per language and returns a `Said`: a str whose value is the English text,
carrying the other two. Code that only needs English keeps working with plain strings.
The Uzbek and Russian words were written by Claude and are not checked by a native speaker.
"""

from collections.abc import Callable
from contextvars import ContextVar
from datetime import date, datetime

LANGS = ("en", "uz", "ru")
_lang: ContextVar[str] = ContextVar("wording_lang", default="en")

NBSP = " "
MONTHS = {
    "en": ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"),
    "uz": ("yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"),
    "ru": ("января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября",
           "ноября", "декабря"),
}
MONTHS_LONG = {
    "en": ("January", "February", "March", "April", "May", "June",
           "July", "August", "September", "October", "November", "December"),
    "uz": MONTHS["uz"],
    "ru": ("январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь",
           "ноябрь", "декабрь"),
}
COUNT_WORDS = ("No", "One", "Two", "Three", "Four", "Five")
CHARGE_NAMES = {
    "LATE_PAYMENT": ("Late payment penalty", "Kechikkan toʻlov uchun jarima", "Штраф за просрочку платежа"),
    "LOAN_ISSUANCE": ("Loan issuance fee", "Kredit rasmiylashtirish komissiyasi", "Комиссия за выдачу кредита"),
    "CARD_REISSUE": ("Card reissue fee", "Kartani qayta chiqarish komissiyasi", "Комиссия за перевыпуск карты"),
}


class Said(str):
    """A sentence in three languages. As a str it is the English one."""

    uz: str
    ru: str

    def __new__(cls, en: str, uz: str, ru: str) -> "Said":
        made = super().__new__(cls, en)
        made.uz, made.ru = uz, ru
        return made

    def words(self) -> dict[str, str]:
        return {"en": str(self), "uz": self.uz, "ru": self.ru}


def said(build: Callable[[], str]) -> Said:
    """Runs `build` once per language."""
    out = {}
    for lang in LANGS:
        token = _lang.set(lang)
        try:
            out[lang] = str(build())
        finally:
            _lang.reset(token)
    return Said(out["en"], out["uz"], out["ru"])


def lang() -> str:
    return _lang.get()


def tr(en: str, uz: str, ru: str) -> str:
    """The text of the language being built."""
    return {"en": en, "uz": uz, "ru": ru}[_lang.get()]


def pick(text: str) -> str:
    """A part made earlier, in the language being built."""
    if isinstance(text, Said):
        return {"en": str(text), "uz": text.uz, "ru": text.ru}[_lang.get()]
    return text


def plural_ru(number: int, one: str, few: str, many: str) -> str:
    """1 день, 2 дня, 5 дней."""
    tail, tens = number % 10, number % 100
    if tail == 1 and tens != 11:
        return one
    if 2 <= tail <= 4 and not 12 <= tens <= 14:
        return few
    return many


def charge_name(code: str) -> str:
    """The plain name of a penalty or fee. An unknown code is shown in plain words."""
    names = CHARGE_NAMES.get(code)
    if not names:
        return code.replace("_", " ").capitalize()
    return names[LANGS.index(_lang.get())]


def som(amount: int) -> str:
    """1500000 -> "1 500 000 soʻm", with spaces that never break a line."""
    return f"{amount:,}".replace(",", NBSP) + NBSP + ("сум" if _lang.get() == "ru" else "soʻm")


def day(value: date) -> str:
    """25 Aug 2026 · 2026-yil 25-avgust · 25 августа 2026 г."""
    current = _lang.get()
    if current == "uz":
        return f"{value.year}-yil {value.day}-{MONTHS['uz'][value.month - 1]}"
    if current == "ru":
        return f"{value.day} {MONTHS['ru'][value.month - 1]} {value.year} г."
    return f"{value.day} {MONTHS['en'][value.month - 1]} {value.year}"


def month(value: date) -> str:
    """August 2026 · 2026-yil avgust · август 2026 г."""
    current = _lang.get()
    if current == "uz":
        return f"{value.year}-yil {MONTHS_LONG['uz'][value.month - 1]}"
    if current == "ru":
        return f"{MONTHS_LONG['ru'][value.month - 1]} {value.year} г."
    return f"{MONTHS_LONG['en'][value.month - 1]} {value.year}"


def clock(value: datetime) -> str:
    """02:14, Tashkent time."""
    return f"{value.hour:02d}:{value.minute:02d}"


def count_of(number: int, one: str) -> str:
    """1 business day, 3 business days. English only: other languages use `tr`."""
    return f"{number} {one}" if number == 1 else f"{number} {one}s"


def days(number: int) -> str:
    """1 day, 3 days · 3 kun · 3 дня."""
    return tr(count_of(number, "day"), f"{number} kun", f"{number} {plural_ru(number, 'день', 'дня', 'дней')}")


def business_days(number: int) -> str:
    return tr(
        count_of(number, "business day"), f"{number} ish kuni",
        f"{number} {plural_ru(number, 'рабочий день', 'рабочих дня', 'рабочих дней')}",
    )


def count(number: int) -> str:
    """A small count in words, to start a sentence. Uzbek and Russian use the number."""
    if _lang.get() != "en":
        return str(number)
    return COUNT_WORDS[number] if number < len(COUNT_WORDS) else str(number)


def words(text: str | None) -> dict[str, str] | None:
    """The three languages of a sentence for the API, or None for a plain one."""
    return text.words() if isinstance(text, Said) else None
