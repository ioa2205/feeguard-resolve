"""Complaint text to a schema-checked reading, with a rules fallback. Task B3.

The complaint text is untrusted. It reaches the rest of FeeGuard only as a
`Reading`: a claim type from a fixed list, a month, a card name, and amounts.
The amounts and the language are always read by code. The local model may
only choose the claim type, the month and the card, and its answer is checked
against a fixed form. A wrong form is asked again once; then rules take over.
"""

import re
import time
from datetime import date
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, ValidationError

from ..schemas import ClaimType, Lang, Mode, Month
from . import llm
from .normalize_amount import APOSTROPHE, find_amounts

_PROMPT = (Path(__file__).parent / "prompts" / "parse_complaint.txt").read_text(encoding="utf-8")
_STRIP = str.maketrans({**{mark: None for mark in APOSTROPHE}, "ё": "е"})


class Reading(BaseModel):
    """What was understood from one complaint."""

    model_config = ConfigDict(extra="forbid")

    claim_type: ClaimType
    amounts: list[int]  # every amount in the text, whole soʻm, read by code
    claimed_excess: int | None  # the amount the customer seems to want back; never used in a verdict
    period: Month | None
    card_hint: Literal["HUMO", "UZCARD"] | None
    lang: Lang
    mode: Mode


class _ModelAnswer(BaseModel):
    """The only thing the model may say."""

    model_config = ConfigDict(extra="forbid")

    claim_type: ClaimType
    period: Month | None
    card: Literal["HUMO", "UZCARD"] | None


def parse(text: str, received: date, use_model: bool = True) -> Reading:
    """Reads one complaint that was received on `received`. `use_model=False` reads by rules only."""
    amounts = [amount.value for amount in find_amounts(text)]
    lang = detect_lang(text)
    answer = _ask_model(text, received) if use_model else None
    if answer:
        claim_type, period, card, mode = answer.claim_type, answer.period, answer.card, "llm"
    else:
        claim_type, period, card, mode = rules_claim(text, amounts, lang), rules_period(text, received, lang), rules_card(text), "rules"
    return Reading(
        claim_type=claim_type, amounts=amounts, claimed_excess=_claimed_excess(claim_type, amounts),
        period=period, card_hint=card, lang=lang, mode=mode,
    )


def _ask_model(text: str, received: date) -> _ModelAnswer | None:
    if not llm.settings():
        return None
    deadline = time.monotonic() + llm.TIME_LIMIT
    question = f"Today: {received.isoformat()}\nComplaint: {text}"
    for _ in range(2):
        try:
            raw = llm.ask_json(_PROMPT, question, _ModelAnswer.model_json_schema(), deadline - time.monotonic())
            answer = _ModelAnswer.model_validate(raw)
        except (llm.LlmBadAnswer, ValidationError):
            continue  # a wrong form: ask once more
        except llm.LlmUnavailable:
            return None  # slow or down: asking again would only take longer
        if answer.period and not _plausible(answer.period, received):
            answer = answer.model_copy(update={"period": None})
        return answer
    return None


def _plausible(period: str, received: date) -> bool:
    """A complaint is about a month that has started and is at most two years back."""
    months = int(period[:4]) * 12 + int(period[5:]) - (received.year * 12 + received.month)
    return -24 <= months <= 0


def _claimed_excess(claim_type: str, amounts: list[int]) -> int | None:
    if not amounts:
        return None
    if claim_type == "DOUBLE_DEBIT" and len(amounts) >= 2 and max(amounts) > min(amounts):
        return max(amounts) - min(amounts)  # "it was 500, they took 1 000"
    return min(amounts) if claim_type in ("LATE_POSTING", "ILLEGAL_FEE") else amounts[0]


# --- Language, by script and a few marker words ---------------------------

_LATIN_BRANDS = re.compile(r"\b(paynet|click|payme|humo|uzcard|sms|app|uzs|apelsin|uzum)\b", re.IGNORECASE)
_UZ_CYRILLIC = re.compile(
    r"[ўқғҳ]|\b(менинг|учун|эди|бўлди|йўқ|керак|билан|ечил\w*|тўла\w*|қилди|нима|лекин|ҳисобла\w*|қайтар\w*|ойлик|эмас)\b"
)
_RUSSIAN = re.compile(
    r"[ыщ]|\b(что|это|был[аио]?|мне|меня|почему|списал[иа]?|деньги|верните|прошу|платеж\w*|договор\w*|карты|с|в|по|не|за|и)\b"
)


def detect_lang(text: str) -> str:
    lowered = _LATIN_BRANDS.sub(" ", text.lower().replace("ё", "е"))
    cyrillic = sum(1 for ch in lowered if "а" <= ch <= "я" or ch in "ўқғҳ")
    latin = sum(1 for ch in lowered if "a" <= ch <= "z")
    # One borrowed word does not make a text mixed; about one word in eight does.
    if cyrillic and latin and min(cyrillic, latin) / (cyrillic + latin) >= 0.12:
        return "mixed"
    if cyrillic <= latin:
        return "uz_latn"
    uzbek, russian = bool(_UZ_CYRILLIC.search(lowered)), len(_RUSSIAN.findall(lowered)) >= 2
    if uzbek and russian:
        return "mixed"
    return "uz_cyrl" if uzbek else "ru"


# --- Rules mode: key words ------------------------------------------------
# Matched on lower-case text without apostrophes, so "to'lov" and "toʻlov" are "tolov".

_CLAIM_WORDS = {
    "DOUBLE_DEBIT": (
        r"\b(ikki|2|икки)\s*(marta|marotaba|bor|martadan|марта|маротаба|бор)\b",
        r"дважд", r"\b(два|2)\s*раза\b", r"двойн", r"повторн", r"задво", r"дубл", r"вдвойне",
        r"qayta\s+(yech|olin|ushla)", r"қайта\s+(еч|олин|ушла)", r"takror", r"такрор",
        r"ikki\s*barobar", r"икки\s*баробар", r"ikkita\s+(tolov|yechim)",
    ),
    "EARLY_DEBIT": (
        r"(muddat|vaqt|sana|kun)\w*\s+(oldin|avval|ilgari)", r"\bert(a|aroq)\b", r"oldindan\s+yech",
        r"(муддат|вақт|сана|кун)\w*\s+(олдин|аввал|илгари)", r"\bэрта(роқ)?\b",
        r"раньше\s+(срок|времен|дат|график|положен|чем)", r"досрочно\s+(спис|снял)", r"заранее",
        r"до\s+(даты|срока|дня)\s+плат", r"преждевременн", r"почему\s+раньше", r"\bраньше\b.*\bсписал",
    ),
    "ILLEGAL_FEE": (
        r"komissiya", r"комисси", r"xizmat\s+haq", r"хизмат\s+ҳақ", r"vositachilik", r"воситачилик",
        r"qoshimcha\s+(tolov|haq|pul)", r"қўшимча\s+(тўлов|ҳақ|пул)",
        r"дополнительн\w*\s+(плат|сбор|комисс)", r"\bсбор", r"за\s+(выдач|оформлен)",
        r"ushlab\s+qol", r"ушлаб\s+қол", r"удержа",
        r"shartnomada\s+(yoq|korsatilmagan|bunaqa|bunday)", r"шартномада\s+(йўқ|кўрсатилмаган|бунақа)",
        r"в\s+договоре\s+(нет|не\s+указ|не\s+было)",
    ),
    "LATE_POSTING": (
        r"jarima", r"pen[iy]a", r"жарима", r"\bпен[яюией]", r"штраф", r"неустойк", r"просроч",
        r"kechik", r"кечик", r"(oz\s+)?vaqtida\s+tola", r"(ўз\s+)?вақтида\s+тўла", r"вовремя",
        r"в\s+срок\s+(оплат|внес|заплат)",
    ),
}
_CLAIM_PATTERNS = {kind: [re.compile(pattern) for pattern in words] for kind, words in _CLAIM_WORDS.items()}


def _plain(text: str) -> str:
    return text.lower().translate(_STRIP)


# The trained classifier is asked only when no key word matched, and believed only when it is this sure.
CLASSIFIER_SURE = 0.6


def rules_claim(text: str, amounts: list[int], lang: str) -> str:
    """Rules mode: key words first, then the trained classifier (PLAN Part 8)."""
    found = key_words(text, amounts, lang)
    if found != "OTHER":
        return found
    from . import classifier  # it trains on first use; the rest of this module does not need it

    label, sure = classifier.classify(text)
    return label if sure >= CLASSIFIER_SURE else "OTHER"


def key_words(text: str, amounts: list[int], lang: str) -> str:
    plain = _plain(text)
    if lang == "ru":
        plain = re.sub(r"\b(\d+)\s*марта\b", r"\1 март", plain)  # in Russian "2 марта" is a date
    scores = {kind: sum(1 for pattern in patterns if pattern.search(plain)) for kind, patterns in _CLAIM_PATTERNS.items()}
    if len(amounts) >= 2 and max(amounts) == 2 * min(amounts):
        scores["DOUBLE_DEBIT"] += 1  # "it was 500, they took 1 000"
    best = max(scores.values())
    return next(kind for kind, score in scores.items() if score == best) if best else "OTHER"


_MONTHS = (
    ("yanvar", "январ"), ("fevral", "феврал"), ("mart", "март"), ("aprel", "апрел"), ("may", "ма[йяе]"),
    ("iyun", "июн"), ("iyul", "июл"), ("avgust", "август"), ("sentabr|sentyabr", "сентябр|сентабр"),
    ("oktabr|oktyabr", "октябр|октабр"), ("noyabr", "ноябр"), ("dekabr", "декабр"),
)
_MONTH_WORD = re.compile(
    "|".join(rf"(?P<m{number}>\b(?:{latin}|{cyrillic})\w{{0,6}})" for number, (latin, cyrillic) in enumerate(_MONTHS, 1))
)
_LAST_MONTH = re.compile(r"otgan\s+oy|ўтган\s+ой|прошл\w+\s+месяц")
_THIS_MONTH = re.compile(r"\b(shu|bu|joriy)\s+oy|\b(шу|бу|жорий)\s+ой|эт\w+\s+месяц|текущ\w+\s+месяц")
_NUMERIC_MONTH = re.compile(r"\b(?:\d{1,2}[./-])?(0?[1-9]|1[0-2])[./-](20\d\d)\b")
_YEAR = re.compile(r"\b(20\d\d)\b")


def rules_period(text: str, received: date, lang: str) -> str | None:
    plain = _plain(text)
    this_month = received.year * 12 + received.month - 1

    numeric = _NUMERIC_MONTH.search(plain)
    if numeric:
        found = f"{numeric.group(2)}-{int(numeric.group(1)):02d}"
        return found if _plausible(found, received) else None
    if _LAST_MONTH.search(plain):
        return _month(this_month - 1)
    if _THIS_MONTH.search(plain):
        return _month(this_month)

    for match in _MONTH_WORD.finditer(plain):
        number = int(match.lastgroup[1:])
        word = match.group()
        # Uzbek "marta" means "times" ("ikki marta"). Only Russian "марта" is March.
        if number == 3 and (word in ("marta", "martadan") or (word == "марта" and lang != "ru")):
            continue
        if number == 5 and not re.fullmatch(r"may(da|dagi|ning|i)?|ма[йяе]|майда|майдаги", word):
            continue  # "mayli", "майли" and the like are not May
        year = _YEAR.search(plain)
        if year and _plausible(f"{year.group(1)}-{number:02d}", received):
            return f"{year.group(1)}-{number:02d}"
        # No year written: the latest such month that has already started.
        months_back = (received.month - number) % 12
        return _month(this_month - months_back)
    return None


def _month(months: int) -> str:
    return f"{months // 12}-{months % 12 + 1:02d}"


def rules_card(text: str) -> str | None:
    plain = _plain(text)
    if re.search(r"humo|хумо", plain):
        return "HUMO"
    if re.search(r"uzcard|узкард|уз\s?кард", plain):
        return "UZCARD"
    return None
