"""Cause finder and fix library (PLAN Part 7.5). Task A8. Fake data only."""

import json
import sqlite3
from contextlib import closing

import pytest

from app.connector import Bank
from app.engine import causes, scan
from app.engine.fixes import fix_for
from app.generator.world import Settings, build_world

DD, ED, LP, IF = "DOUBLE_DEBIT", "EARLY_DEBIT", "LATE_POSTING", "ILLEGAL_FEE"


def profile(*groups):
    """A profile from (times, traits) groups."""
    built = causes.Profile()
    for times, traits in groups:
        built.add(traits, times)
    return built


def test_a_value_shared_by_most_findings_and_rare_in_the_bank_is_the_cause():
    night, other = ("batch_run", "BR-2026-07-05"), ("batch_run", "BR-2026-07-10")
    bank = profile((100, (night, ("cards", "1"))), (1900, (other, ("cards", "1"))))
    findings = [(night, ("cards", "1"))] * 28 + [(other, ("cards", "1"))] * 2

    rows = causes.concentrated(DD, findings, bank)

    assert [(row.name, row.value) for row in rows] == [night]
    assert rows[0].support == pytest.approx(28 / 30)
    assert rows[0].lift == pytest.approx((28 / 30) / (100 / 2000))


def test_a_common_value_is_not_a_cause_even_when_every_finding_has_it():
    # Every finding is on a Consumer loan, but so are 40% of all loans: lift 2.5, under 3.
    bank = profile((400, (("product", "Consumer loan"),)), (600, (("product", "Car loan"),)))
    findings = [(("product", "Consumer loan"),)] * 25

    assert causes.concentrated(IF, findings, bank) == []


def test_a_rare_value_held_by_too_few_findings_is_not_a_cause():
    # Lift is high, but only half of the findings have it: support 50%, under 60%.
    bank = profile((10, (("channel", "PAYNET"),)), (990, (("channel", "CLICK"),)))
    findings = [(("channel", "PAYNET"),)] * 15 + [(("channel", "CLICK"),)] * 15

    assert causes.concentrated(LP, findings, bank) == []


def test_with_fewer_than_20_findings_no_cause_is_named():
    bank = profile((10, (("tariff", "version 2"),)), (990, (("tariff", "version 1"),)))

    assert causes.find(IF, [(("tariff", "version 2"),)] * 19, bank) is None
    assert causes.find(IF, [(("tariff", "version 2"),)] * 20, bank) is not None


def test_an_attribute_that_is_no_candidate_for_the_type_is_ignored():
    bank = profile((10, (("channel", "PAYNET"),)), (990, (("channel", "CLICK"),)))

    assert causes.concentrated(IF, [(("channel", "PAYNET"),)] * 30, bank) == []


def test_the_sentence_uses_plain_words_and_the_fix_follows_the_strongest_attribute():
    bank = profile((50, (("tariff", "version 2"), ("product", "Microloan"))), (950, (("tariff", "version 1"), ("product", "Car loan"))))
    found = causes.find(IF, [(("tariff", "version 2"), ("product", "Microloan"))] * 50, bank)

    assert [attribute.name for attribute in found.attributes] == ["tariff", "product"]
    assert found.sentence.startswith("All 50 fees not in the contract are on loans signed under tariff version 2, 20 times more often")
    assert "lift" not in found.sentence and "support" not in found.sentence
    assert found.suggested_fix == fix_for(IF, ["tariff"])


def test_no_concentration_says_so_and_suggests_no_fix():
    bank = profile((500, (("region", "Toshkent shahri"),)), (500, (("region", "Samarqand"),)))
    found = causes.find(DD, [(("region", "Toshkent shahri"),)] * 15 + [(("region", "Samarqand"),)] * 15, bank)

    assert found.attributes == [] and found.suggested_fix is None
    assert found.sentence.startswith("No common cause stands out")


def test_times_are_written_as_a_person_would_say_them():
    assert causes.times(46.97) == "47 times"
    assert causes.times(6.5) == "6.5 times"
    assert causes.times(4.04) == "4 times"


def test_every_planted_cause_has_a_fix():
    assert all(fix_for(kind, [name]) for kind, name in ((DD, "batch_run"), (ED, "schedule"), (LP, "channel"), (IF, "tariff")))
    assert fix_for(DD, ["region"]) is None


# --- On generated demo banks: the planted cause is on top --------------------


def _hidden(world):
    with closing(sqlite3.connect(world / "truth.db")) as truth:
        return json.loads(truth.execute("SELECT config_json FROM config").fetchone()[0])["hidden"]


def _causes(world):
    with Bank(world) as bank:
        found = scan.check_bank(bank)
    return {kind: (len(found.traits[kind]), causes.find(kind, list(found.traits[kind]), found.profiles[kind])) for kind in found.by_type}


def _planted_value(kind, hidden):
    """(attribute, value) of the cause that the generator planted, as the cause finder names it."""
    if kind == DD:
        return "batch_run", f"BR-{hidden[DD]['batch_nights'][0]}"
    if kind == ED:
        return "schedule", "changed"
    if kind == LP:
        return "channel", hidden[LP]["channel"]
    return "tariff", "version 2"


@pytest.mark.parametrize("seed, surprise", [(31, False), (32, True)])
def test_the_planted_cause_is_on_top_for_every_type(tmp_path, seed, surprise):
    build_world(tmp_path, "w", Settings(seed=seed, size=3000, surprise=surprise))
    hidden = _hidden(tmp_path / "w")
    named = _causes(tmp_path / "w")

    checked = 0
    for kind in hidden:
        count, cause = named[kind]
        if count < causes.MIN_FINDINGS:
            assert cause is None
            continue
        top = cause.attributes[0]
        assert (top.name, top.value) == _planted_value(kind, hidden), kind
        assert top.support >= causes.MIN_SUPPORT and top.lift >= causes.MIN_LIFT
        assert cause.suggested_fix
        checked += 1
    assert checked >= 2
