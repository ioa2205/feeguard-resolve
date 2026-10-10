"""The amount normaliser (task B2). Phrases as customers write them, in four language variants."""

import pytest

from app.ai.normalize_amount import find_amounts, normalize


@pytest.mark.parametrize(
    "phrase, expected",
    [
        # the four of PLAN Part 14
        ("yarim million", 500_000),
        ("1 mln", 1_000_000),
        ("500 тыс", 500_000),
        ("1 000 000", 1_000_000),
        # Uzbek, Latin
        ("500 ming", 500_000),
        ("500 ming so'm", 500_000),
        ("500 ming soʻm", 500_000),
        ("500 000 soʻm", 500_000),
        ("500000 som", 500_000),
        ("1.5 mln", 1_500_000),
        ("1,5 mln so'm", 1_500_000),
        ("2 mln 300 ming", 2_300_000),
        ("bir yarim million", 1_500_000),
        ("ikki yarim mln", 2_500_000),
        ("besh yuz ming so'm", 500_000),
        ("yuz ming so'm", 100_000),
        ("besh yuz ellik ming", 550_000),
        ("bir million ikki yuz ming", 1_200_000),
        ("1 million yarim", 1_500_000),
        ("750 mingdan", 750_000),
        ("45 ming so'mlik", 45_000),
        ("500k", 500_000),
        ("300 000 UZS", 300_000),
        ("25 000 so`m", 25_000),
        # Uzbek, Cyrillic
        ("500 минг сўм", 500_000),
        ("ярим миллион", 500_000),
        ("45 минг сўм", 45_000),
        ("бир ярим миллион сўм", 1_500_000),
        ("беш юз минг", 500_000),
        ("1 млн сўм", 1_000_000),
        # Russian
        ("пол миллиона", 500_000),
        ("полмиллиона", 500_000),
        ("пол-миллиона", 500_000),
        ("полтора миллиона", 1_500_000),
        ("2 с половиной миллиона", 2_500_000),
        ("750 тыс.", 750_000),
        ("750 тысяч сум", 750_000),
        ("пятьсот тысяч", 500_000),
        ("двести пятьдесят тысяч сумов", 250_000),
        ("1,2 млн", 1_200_000),
        ("500к", 500_000),
        ("3 миллиона", 3_000_000),
        ("1 500 000 сум", 1_500_000),
        ("лимон", None),  # slang for a million, but alone it is just a lemon
        ("2 лимона", 2_000_000),
    ],
)
def test_one_phrase_is_one_amount(phrase, expected):
    assert normalize(phrase) == ([] if expected is None else [expected])


@pytest.mark.parametrize(
    "text",
    [
        "25.08.2026 kuni",
        "25-avgust kuni soat 02:14 da",
        "2026 yil avgust oyida",
        "17-го числа",
        "20 числа каждого месяца",
        "ikki marta yechildi",
        "2 марта ечилди",
        "3 kun oldin",
        "0,1 foiz penya",
        "3% komissiya",
        "kartam ··4471, HUMO",
        "karta *9038",
        "telefon +998 90 123 45 67",
        "tel 90 123 45 67",
        "shartnoma L-20931",
        "shartnoma № 20931",
        "umumiy summa notoʻgʻri",
        "сумма неправильная",
        "8600123412341234 kartasi",
        "5 месяцев плачу вовремя",
    ],
)
def test_a_date_a_card_a_phone_or_a_count_is_not_money(text):
    assert normalize(text) == []


def test_two_amounts_in_one_sentence_stay_two():
    assert normalize("Oylik to'lovim 500 ming edi, kartamdan 1 mln yechildi") == [500_000, 1_000_000]
    assert normalize("500 ming, 1 mln") == [500_000, 1_000_000]
    assert normalize("500 ming 1 mln") == [500_000, 1_000_000]
    assert normalize("платёж 750 000 сум, а списали 1 500 000") == [750_000, 1_500_000]


def test_money_is_found_inside_a_real_sentence():
    text = "Кредит тўловини 20-сентябрда Paynet орқали тўлаганман, лекин менга 45 минг сўм жарима ҳисоблашибди."

    assert normalize(text) == [45_000]


def test_mixed_language_and_typos():
    assert normalize("kreditni оформить qilganimda 300 000 soʻm комиссия ushlab qolishdi") == [300_000]
    assert normalize("с карты сняли 1 milion сум") == [1_000_000]
    assert normalize("500 MING SO'M yechildi") == [500_000]


def test_the_place_of_the_phrase_is_reported():
    text = "Kartamdan 1,5 mln so'm yechildi"
    (amount,) = find_amounts(text)

    assert amount.value == 1_500_000
    assert amount.phrase == "1,5 mln so'm"
    assert text[amount.start:amount.end] == amount.phrase


def test_a_fraction_of_a_som_is_never_made_up():
    assert normalize("0,5 so'm") == []
    assert normalize("1,5") == []


@pytest.mark.parametrize("text", ["999999999999999 so'm", "-500 000 so'm qarz"])
def test_the_result_is_a_whole_positive_number_within_the_limit(text):
    assert all(isinstance(value, int) and 0 < value <= 1_000_000_000_000 for value in normalize(text))
