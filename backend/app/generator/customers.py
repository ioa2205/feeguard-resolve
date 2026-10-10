"""Fake customers and cards. Task A1.

A name is a random first name with a random surname. No record here describes
a real person. Phones and cards are masked from the moment they are made, and
no passport or PINFL field exists.
"""

from bisect import bisect
from dataclasses import dataclass
from itertools import accumulate
from random import Random

MALE = (
    "Aziz", "Bobur", "Sardor", "Otabek", "Jasur", "Rustam", "Farrux", "Bekzod", "Sherzod",
    "Ulugʻbek", "Akmal", "Dilshod", "Javohir", "Sanjar", "Temur", "Nodir", "Islom", "Murod",
    "Anvar", "Shoxrux", "Elyor", "Doston", "Ravshan", "Baxtiyor", "Zafar", "Oybek", "Komil",
    "Husan", "Hasan", "Abror",
)
FEMALE = (
    "Dilnoza", "Malika", "Gulnora", "Nigora", "Zarina", "Madina", "Shahnoza", "Nilufar",
    "Feruza", "Kamola", "Sevara", "Dildora", "Lola", "Nargiza", "Mohira", "Barno", "Umida",
    "Iroda", "Ziyoda", "Munira", "Shoira", "Yulduz", "Charos", "Durdona", "Gulchehra",
    "Mavluda", "Nodira", "Oydin", "Saida", "Xurshida",
)
# The male form. A woman's surname takes a final "a".
SURNAMES = (
    "Karimov", "Rahimov", "Tursunov", "Nazarov", "Saidov", "Abdullayev", "Ergashev",
    "Ismoilov", "Hamidov", "Olimov", "Yoʻldoshev", "Qodirov", "Xoʻjayev", "Mirzayev",
    "Usmonov", "Sharipov", "Normatov", "Rasulov", "Aliyev", "Ahmedov", "Boboyev", "Jalilov",
    "Zokirov", "Sobirov", "Toshpoʻlatov", "Gʻaniyev", "Yusupov", "Salimov", "Hakimov",
    "Davronov", "Eshonqulov", "Mamatov", "Nurmatov", "Oripov", "Poʻlatov", "Qosimov",
    "Roʻziyev", "Sultonov", "Toʻxtayev", "Valiyev",
)

# (region, branch code, weight)
REGIONS = (
    ("Toshkent shahri", "TSH", 22), ("Toshkent viloyati", "TSV", 9),
    ("Samarqand viloyati", "SAM", 11), ("Fargʻona viloyati", "FAR", 10),
    ("Andijon viloyati", "AND", 9), ("Namangan viloyati", "NAM", 8),
    ("Qashqadaryo viloyati", "QAS", 7), ("Buxoro viloyati", "BUX", 6),
    ("Surxondaryo viloyati", "SUR", 5), ("Xorazm viloyati", "XOR", 4),
    ("Jizzax viloyati", "JIZ", 3), ("Navoiy viloyati", "NAV", 2),
    ("Sirdaryo viloyati", "SIR", 2), ("Qoraqalpogʻiston Respublikasi", "QQR", 2),
)
LANGS = (("uz_latn", 50), ("ru", 25), ("uz_cyrl", 15), ("mixed", 10))
SEGMENTS = (("SALARY", 45), ("RETAIL", 40), ("PENSION", 15))
CARD_COUNTS = ((1, 75), (2, 22), (3, 3))  # about 25% of customers have two or more cards
CONTRACT_COUNTS = ((1, 90), (2, 10))
PHONE_CODES = ("90", "91", "93", "94", "95", "97", "98", "99", "33", "88")
NETWORKS = ("HUMO", "UZCARD")


class Weighted:
    """Picks one value from (value, ..., weight) rows with one random number."""

    def __init__(self, rows: tuple) -> None:
        self.values = [row[0] if len(row) == 2 else row[:-1] for row in rows]
        self.edges = list(accumulate(row[-1] for row in rows))

    def pick(self, rng: Random):
        return self.values[bisect(self.edges, rng.random() * self.edges[-1])]


@dataclass(slots=True)
class Customer:
    idx: int
    id: str
    full_name: str
    region: str
    branch: str
    phone_masked: str
    segment: str
    preferred_lang: str
    # (card_id, network, issuer_bank, is_primary, last4); the primary card is first
    cards: list[tuple[str, str, str, int, str]]


def make_customers(rng: Random, n_contracts: int) -> tuple[list[Customer], list[int]]:
    """Returns the customers and, for each contract, the index of its customer."""
    regions, langs, segments = Weighted(REGIONS), Weighted(LANGS), Weighted(SEGMENTS)
    card_counts, contract_counts = Weighted(CARD_COUNTS), Weighted(CONTRACT_COUNTS)

    customers: list[Customer] = []
    owner_of: list[int] = []
    while len(owner_of) < n_contracts:
        idx = len(customers)
        customer_id = f"CU-{idx + 1:05d}"
        if rng.random() < 0.5:
            name = f"{rng.choice(MALE)} {rng.choice(SURNAMES)}"
        else:
            name = f"{rng.choice(FEMALE)} {rng.choice(SURNAMES)}a"
        region, branch = regions.pick(rng)
        phone = f"+998 {rng.choice(PHONE_CODES)} *** ** {rng.randrange(100):02d}"
        cards = [
            (
                f"CD-{idx + 1:05d}-{k + 1}",
                rng.choice(NETWORKS),
                "SANDBOX" if k == 0 or rng.random() < 0.5 else "OTHER",
                1 if k == 0 else 0,
                f"{rng.randrange(10_000):04d}",
            )
            for k in range(card_counts.pick(rng))
        ]
        customers.append(
            Customer(
                idx, customer_id, name, region, f"{branch}-{rng.randrange(1, 6):02d}", phone,
                segments.pick(rng), langs.pick(rng), cards,
            )
        )
        owner_of.extend([idx] * min(contract_counts.pick(rng), n_contracts - len(owner_of)))
    return customers, owner_of
