"""Real-case presets. Task P1, PLAN Part 11, proof 4.

Each preset rebuilds one mistake pattern from public news as a demo bank with
fixed settings, so the same click always gives the same bank. A preset names the
pattern, never the bank in the news. The customers are invented, like every
other demo bank; only the pattern is real.
"""

from dataclasses import dataclass
from datetime import date

from . import defects
from .world import PRESET_PREFIX, Settings

SEED = 2025  # the year of the public case
SIZE = 5000  # small enough to build in a few seconds on one click


@dataclass(frozen=True)
class Source:
    name: str
    published: date
    url: str


@dataclass(frozen=True)
class Preset:
    preset_id: str
    title: str
    what_happened: str
    mistake: str
    sources: tuple[Source, ...]

    @property
    def world_id(self) -> str:
        return PRESET_PREFIX + self.preset_id

    @property
    def settings(self) -> Settings:
        # Only this preset's mistake is planted. Look-alike complaints and the share of
        # wronged customers who complain stay as in any other demo bank.
        return Settings(seed=SEED, size=SIZE, defects={self.mistake: 0.02})


# The Central Bank's fines of October 2025, as reported in the news (PLAN Part 1.3).
FINES_OCT_2025 = (
    Source("Kun.uz", date(2025, 10, 3),
           "https://kun.uz/news/2025/10/03/markaziy-bank-3-ta-tijorat-bankini-istemolchilar-huquqlarini-buzgani-uchun-jarimaga-tortdi"),
    Source("Spot", date(2025, 10, 3), "https://www.spot.uz/oz/2025/10/03/three-bank/"),
)

PRESETS = (
    Preset(
        "issuance-fee",
        "Issuance fee not allowed (public case, Oct 2025)",
        "After a tariff update, one loan product charged a one-time fee for issuing the loan. "
        "The loan contract does not list this fee.",
        defects.ILLEGAL_FEE,
        FINES_OCT_2025,
    ),
    Preset(
        "late-posting",
        "Recorded late, then fined (public case, Oct 2025)",
        "Customers paid on the due date through one payment channel. The bank recorded the payment "
        "on the next business day and charged a late-payment penalty.",
        defects.LATE_POSTING,
        FINES_OCT_2025,
    ),
)


def by_id(preset_id: str) -> Preset | None:
    return next((preset for preset in PRESETS if preset.preset_id == preset_id), None)
