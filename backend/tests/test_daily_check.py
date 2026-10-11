"""The check of changed loans only (DECISIONS D-039): it must give exactly what a full pass gives. Fake data only."""

import sqlite3
from contextlib import closing

import pytest

from app.connector import Bank
from app.engine import scan
from app.generator.tamper import add_debit
from app.generator.world import Settings, build_world

WORLD = "w-47"


def rows(path, sql, args=()):
    with closing(sqlite3.connect(path)) as opened:
        return opened.execute(sql, args).fetchall()


@pytest.fixture(scope="module")
def world(tmp_path_factory):
    parent = tmp_path_factory.mktemp("worlds")
    build_world(parent, WORLD, Settings(seed=47, size=3000))
    return parent / WORLD


def loan_with_debits(world, skip=0):
    """A loan paid by automatic debit, its customer's first card."""
    contract_id, customer_id = rows(
        world / "bank.db",
        "SELECT DISTINCT d.contract_id, c.customer_id FROM debits d JOIN contracts c ON c.id = d.contract_id "
        "ORDER BY 1 LIMIT 1 OFFSET ?", (skip,),
    )[0]
    card = rows(world / "bank.db", "SELECT id FROM cards WHERE customer_id = ? ORDER BY id", (customer_id,))[0][0]
    return contract_id, card


def same(a: scan.BankFindings, b: scan.BankFindings) -> None:
    for kind in a.by_type:
        assert sorted(map(scan._key, [kind] * len(a.by_type[kind]), a.by_type[kind])) == \
            sorted(map(scan._key, [kind] * len(b.by_type[kind]), b.by_type[kind])), kind
        assert sorted(a.traits[kind]) == sorted(b.traits[kind]), kind
        assert a.profiles[kind].total == b.profiles[kind].total, kind
        assert +a.profiles[kind].counts == +b.profiles[kind].counts, kind


def test_with_nothing_changed_no_loan_is_read_again(world):
    with Bank(world) as bank:
        kept = scan.check_bank(bank)
        assert bank.changed_since(kept.marks) == set()
        result = scan.recheck(kept, bank, bank.changed_since(kept.marks))
    assert (result.loans, result.new, result.gone) == (0, 0, 0)
    same(result.found, kept)


def test_after_a_debit_added_by_hand_only_that_loan_is_read_and_the_result_equals_a_full_pass(world):
    with Bank(world) as bank:
        kept = scan.check_bank(bank)
    contract_id, card = loan_with_debits(world)
    add_debit(world, contract_id, card, 77_000)

    with Bank(world) as bank:
        changed = bank.changed_since(kept.marks)
        result = scan.recheck(kept, bank, changed)
        full = scan.check_bank(bank)

    assert changed == {contract_id}
    assert (result.loans, result.new) == (1, 1)
    assert [f.amount_excess for f in result.found.by_type["DOUBLE_DEBIT"] if f.contract_id == contract_id] == [77_000]
    same(result.found, full)
    assert result.found.marks == full.marks


def test_two_changes_in_a_row_stay_equal_to_a_full_pass(world):
    with Bank(world) as bank:
        kept = scan.check_bank(bank)
    for skip in (5, 9):
        contract_id, card = loan_with_debits(world, skip)
        add_debit(world, contract_id, card, 51_000)
        with Bank(world) as bank:
            kept = scan.recheck(kept, bank, bank.changed_since(kept.marks)).found
    with Bank(world) as bank:
        same(kept, scan.check_bank(bank))
