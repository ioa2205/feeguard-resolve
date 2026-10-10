"""Amount phrases to whole soʻm, in code. Task B2.

"500 ming", "1 mln", "yarim million", "500 тыс", "пол миллиона", "1 000 000".
No model is involved: an amount that reaches a screen or a decision was read
here, from the customer's own words.

A number counts as money only when something says so: a word for thousand or
million, a currency word, or digits written as an amount ("500 000", "750000").
A date, a time, a card, a phone, a per cent and a count of days are not money.
"""

import re
from dataclasses import dataclass
from fractions import Fraction

MAX_AMOUNT = 1_000_000_000_000
THOUSAND, MILLION, BILLION = 1_000, 1_000_000, 1_000_000_000
HALF_VALUE = Fraction(1, 2)


@dataclass(frozen=True, slots=True)
class Amount:
    value: int  # whole soʻm
    start: int  # where the phrase is in the text
    end: int
    phrase: str


# --- Words ----------------------------------------------------------------
# Apostrophes are removed before a word is looked up, so "to'rt", "toʻrt" and
# "tort" are one word.

UNITS = {
    "bir": 1, "ikki": 2, "uch": 3, "tort": 4, "besh": 5, "olti": 6, "yetti": 7, "sakkiz": 8, "toqqiz": 9,
    "бир": 1, "икки": 2, "уч": 3, "тўрт": 4, "турт": 4, "беш": 5, "олти": 6, "етти": 7, "саккиз": 8,
    "тўққиз": 9, "туккиз": 9,
    "один": 1, "одна": 1, "одну": 1, "два": 2, "две": 2, "три": 3, "четыре": 4, "пять": 5, "шесть": 6,
    "семь": 7, "восемь": 8, "девять": 9,
}
TENS = {
    "on": 10, "yigirma": 20, "ottiz": 30, "qirq": 40, "ellik": 50, "oltmish": 60, "yetmish": 70,
    "sakson": 80, "toqson": 90,
    "ўн": 10, "ун": 10, "йигирма": 20, "ўттиз": 30, "уттиз": 30, "қирқ": 40, "кирк": 40, "эллик": 50,
    "олтмиш": 60, "етмиш": 70, "саксон": 80, "тўқсон": 90, "туксон": 90,
    "десять": 10, "одиннадцать": 11, "двенадцать": 12, "тринадцать": 13, "четырнадцать": 14,
    "пятнадцать": 15, "шестнадцать": 16, "семнадцать": 17, "восемнадцать": 18, "девятнадцать": 19,
    "двадцать": 20, "тридцать": 30, "сорок": 40, "пятьдесят": 50, "шестьдесят": 60, "семьдесят": 70,
    "восемьдесят": 80, "девяносто": 90,
    "сто": 100, "двести": 200, "триста": 300, "четыреста": 400, "пятьсот": 500, "шестьсот": 600,
    "семьсот": 700, "восемьсот": 800, "девятьсот": 900,
}
HUNDRED = {"yuz", "юз"}  # "besh yuz" is 5 x 100
HALF = {"yarim", "ярим", "пол", "половина", "половины", "половиной"}
ONE_AND_HALF = {"полтора", "полторы"}

# Stems. A word matches when it starts with the stem and the rest is a short
# ending: "mingdan", "миллиона".
SCALE_STEMS = (
    ("milliard", BILLION), ("mlrd", BILLION), ("миллиард", BILLION), ("млрд", BILLION),
    ("million", MILLION), ("milion", MILLION), ("millon", MILLION), ("mln", MILLION), ("miln", MILLION),
    ("миллион", MILLION), ("милион", MILLION), ("млн", MILLION), ("лимон", MILLION),
    ("ming", THOUSAND), ("минг", THOUSAND), ("тысяч", THOUSAND), ("тыщ", THOUSAND), ("тыс", THOUSAND),
)
# "soʻm", "soʻmni", "сум", "сўмдан". Not "summa" or "сумма", which mean "amount".
CURRENCY = re.compile(r"^(som|sum|сум|сўм|сом|uzs|узс)(?![mм])\w{0,5}$")
ENDING = re.compile(r"^\w{0,5}$")
# After a bare number these mean it is not money.
NOT_MONEY_AFTER = re.compile(
    r"^(foiz|фоиз|процент|kun|кун|день|дня|дней|oy|ой|месяц|marta|марта|раз|раза|yil|йил|год|года|лет"
    r"|sana|сана|числ|soat|соат|час|ta|та|dona|дона|шт"
    r"|yanvar|fevral|mart|aprel|may|iyun|iyul|avgust|sentabr|sentyabr|oktabr|oktyabr|noyabr|dekabr"
    r"|январ|феврал|март|апрел|май|мая|мае|июн|июл|август|сентябр|сентабр|октябр|октабр|ноябр|декабр)"
)

# Things that hold digits but are never money. They are blanked out first.
MASKS = re.compile(
    r"\+?998[\d\s()-]{9,}"  # a phone with the country code
    r"|\b\d{2}[\s-]\d{3}[\s-]\d{2}[\s-]\d{2}\b"  # a phone without it: 90 123 45 67
    r"|\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b"  # a date: 25.08.2026
    r"|\b\d{1,2}:\d{2}\b"  # a time: 02:14
    r"|[*·•…x]+\s?\d{4}\b"  # a masked card: ··4471
    r"|\b[a-z]{1,3}-\d+\b"  # an id: L-20931
    r"|[№#]\s?\d+"  # a number of something: № 20931
    r"|\b\d{16}\b"  # a full card number
)
APOSTROPHE = "'ʻʼ’‘`´"
TOKEN = re.compile(
    r"\d{1,3}(?:[  .,]\d{3})+(?!\d)"  # digits in groups of three: 1 000 000
    r"|\d+(?:[.,]\d+)?"  # plain digits, perhaps with a fraction: 1,5
    rf"|[^\W\d_]+(?:[{APOSTROPHE}][^\W\d_]+)*"  # a word, apostrophes inside it allowed
)
GROUPED = re.compile(r"\d{1,3}(?:[  .,]\d{3})+")
STRIP_APOSTROPHES = str.maketrans("", "", APOSTROPHE)
STARTS_A_NUMBER = ("digits", "unit", "tens", "half", "hundred")

# One token: (kind, value, start, end, whole): `whole` is true for digits without a fraction.
Token = tuple[str, Fraction | int | str, int, int, bool]


def _scale(word: str) -> int | None:
    for stem, value in SCALE_STEMS:
        if word.startswith(stem) and ENDING.match(word[len(stem):]):
            return value
    return None


def _tokens(clean: str) -> list[Token]:
    tokens: list[Token] = []
    for match in TOKEN.finditer(clean):
        raw = match.group()
        start, end = match.span()
        if raw[0].isdigit():
            if GROUPED.fullmatch(raw):
                tokens.append(("digits", Fraction(re.sub(r"\D", "", raw)), start, end, True))
            else:
                tokens.append(("digits", Fraction(raw.replace(",", ".")), start, end, raw.isdigit()))
            continue
        word = raw.translate(STRIP_APOSTROPHES)
        glued = bool(tokens) and tokens[-1][0] == "digits" and tokens[-1][3] == start
        if word in UNITS:
            tokens.append(("unit", UNITS[word], start, end, False))
        elif word in TENS:
            tokens.append(("tens", TENS[word], start, end, False))
        elif word in HUNDRED:
            tokens.append(("hundred", 100, start, end, False))
        elif word in HALF:
            tokens.append(("half", HALF_VALUE, start, end, False))
        elif word in ONE_AND_HALF:
            tokens.append(("unit", Fraction(3, 2), start, end, False))
        elif _scale(word):
            tokens.append(("scale", _scale(word), start, end, False))
        elif glued and word in ("k", "к"):
            tokens.append(("scale", THOUSAND, start, end, False))  # "500k"
        elif word.startswith("пол") and _scale(word[3:]):
            tokens.append(("half", HALF_VALUE, start, start + 3, False))  # "полмиллиона"
            tokens.append(("scale", _scale(word[3:]), start + 3, end, False))
        elif CURRENCY.match(word):
            tokens.append(("currency", 0, start, end, False))
        else:
            tokens.append(("other", word, start, end, False))
    return tokens


def find_amounts(text: str) -> list[Amount]:
    """Every amount of money in the text, in order."""
    # Lower case, without ever changing the length: positions must stay true.
    clean = "".join(ch.lower() if len(ch.lower()) == 1 else ch for ch in text)
    clean = MASKS.sub(lambda match: " " * len(match.group()), clean)
    clean = re.sub(r"\bс(?= половиной\b)", " ", clean)  # "2 с половиной" reads as "2 половиной"
    clean = re.sub(r"(?<=\bпол)-(?=милл|млн|тыс|лимон)", " ", clean)  # "пол-миллиона"

    tokens = _tokens(clean)
    amounts: list[Amount] = []
    position = 0
    while position < len(tokens):
        if tokens[position][0] in STARTS_A_NUMBER:
            amount, position = _read(tokens, position, clean, text)
            if amount:
                amounts.append(amount)
        else:
            position += 1
    return amounts


def _read(tokens: list[Token], first: int, clean: str, text: str) -> tuple[Amount | None, int]:
    """Reads one amount that starts at token `first`. Returns it and where to go on."""
    total = Fraction(0)  # finished groups: "2 mln" of "2 mln 300 ming"
    group = Fraction(0)  # the group being read: "300" before "ming"
    pending = Fraction(0)  # units waiting for "yuz" or a scale: "besh" of "besh yuz"
    group_start = first
    last_scale: int | None = None
    has_scale = has_digits = whole_digits = False
    digits_in_group = False

    position = first
    while position < len(tokens):
        kind, value, start, _, whole = tokens[position]
        # Only spaces may stand inside one amount. A comma or a full stop ends it.
        if position > first and clean[tokens[position - 1][3]:start].strip("  "):
            break
        if kind == "digits":
            if digits_in_group or group or pending:
                break  # two numbers side by side are two things
            group, has_digits, whole_digits, digits_in_group = value, True, whole, True
        elif kind in ("unit", "tens", "half"):
            if digits_in_group and kind != "half":
                break
            pending += value
        elif kind == "hundred":
            group += (pending or 1) * 100
            pending = Fraction(0)
        elif kind == "scale":
            if last_scale is not None and value >= last_scale:
                # "500 ming 1 mln" is two amounts: give back the group and stop.
                position, group, pending = group_start, Fraction(0), Fraction(0)
                break
            total += (group + pending or 1) * value
            group = pending = Fraction(0)
            has_scale, last_scale, digits_in_group = True, value, False
            group_start = position + 1
        else:
            break
        position += 1

    if pending == HALF_VALUE and not group and last_scale:
        total, pending = total + last_scale // 2, Fraction(0)  # "1 million yarim"
    value = total + group + pending
    if position == first:
        return None, first + 1

    after = tokens[position] if position < len(tokens) else None
    last_end = tokens[position - 1][3]
    gap = clean[last_end:after[2]] if after else ""
    has_currency = bool(after and after[0] == "currency" and not gap.strip("  "))
    # "25-avgust", "17-го": a number with a word hung on it is a date or an ordinal.
    hung = bool(after and after[0] == "other" and gap == "-")
    counted = bool(after and after[0] == "other" and NOT_MONEY_AFTER.match(str(after[1])) and not gap.strip())
    per_cent = clean[last_end:last_end + 2].strip().startswith("%")

    bare_amount = has_digits and whole_digits and value >= 10_000 and not (hung or counted or per_cent)
    start = tokens[first][2]
    if has_currency:
        last_end = after[3]
        position += 1
    if not (has_scale or has_currency or bare_amount) or value.denominator != 1 or not 0 < value <= MAX_AMOUNT:
        return None, position
    return Amount(int(value), start, last_end, text[start:last_end]), position


def normalize(text: str) -> list[int]:
    """The amounts in the text, as whole soʻm."""
    return [amount.value for amount in find_amounts(text)]
