"""The double debit checker, with its trap cases (PLAN Part 7.2)."""

from factory import Loan

from app.engine.checkers import double_debit

S = " "  # the space inside an amount never breaks a line


def check(loan: Loan):
    return double_debit.check(loan.timeline())


def normal_months(loan: Loan, *months: str) -> None:
    for month in months:
        loan.take(f"2026-{month}-25T02:13:00")


def test_a_normal_month_has_no_finding_and_nothing_cleared():
    loan = Loan()
    normal_months(loan, "07", "08", "09")

    result = check(loan)

    assert result.findings == () and result.cleared == ()


def test_two_debits_for_one_payment_is_a_finding():
    loan = Loan()
    normal_months(loan, "07")
    first = loan.take("2026-08-25T02:14:00")
    second = loan.take("2026-08-25T02:16:00", card="CD-2", retry_of=first)

    (finding,) = check(loan).findings

    assert finding.type == "DOUBLE_DEBIT"
    assert finding.installment_n == 7
    assert finding.amount_excess == 500_000
    assert finding.amount_affected == 500_000
    assert finding.days_early is None
    assert finding.explanation == (
        f"500{S}000{S}soʻm was due on 25 Aug 2026. Two successful debits of 500{S}000{S}soʻm "
        "were taken (HUMO 02:14, UZCARD 02:16). Neither was returned."
    )
    assert finding.evidence.debits == (first, second)
    assert [row.n for row in finding.evidence.schedule_rows] == [7]
    assert len(finding.evidence.payments) == 2
    assert finding.evidence.clauses == ("4.2",)


def test_only_the_month_of_the_double_debit_is_flagged():
    loan = Loan()
    normal_months(loan, "07")
    loan.take("2026-08-25T02:14:00")
    loan.take("2026-08-25T02:16:00", card="CD-2")
    normal_months(loan, "09")

    findings = check(loan).findings

    assert [(f.installment_n, f.amount_excess) for f in findings] == [(7, 500_000)]


def test_trap_a_second_debit_that_pays_an_overdue_month_is_cleared():
    loan = Loan()
    loan.take("2026-07-25T02:13:00", status="FAILED")
    loan.take("2026-08-25T02:14:00")
    loan.take("2026-08-25T02:15:00")

    result = check(loan)

    assert result.findings == ()
    (cleared,) = [item for item in result.cleared if item.reason == "ARREARS_COVERED"]
    assert cleared.installment_n == 7
    assert cleared.explanation == "The second debit paid the overdue installment of July 2026."
    assert [row.n for row in cleared.evidence.schedule_rows] == [6, 7]
    assert len(cleared.evidence.debits) == 2
    assert cleared.evidence.clauses == ("4.3",)


def test_trap_a_failed_debit_then_one_successful_retry_is_cleared():
    loan = Loan()
    failed = loan.take("2026-07-25T02:13:00", status="FAILED")
    loan.take("2026-07-25T02:19:00", card="CD-2", retry_of=failed)

    result = check(loan)

    assert result.findings == ()
    (cleared,) = result.cleared
    assert cleared.reason == "RETRY_AFTER_FAILURE"
    assert cleared.explanation == "The first debit failed. Only one debit succeeded."
    assert len(cleared.evidence.debits) == 2


def test_trap_a_duplicate_that_was_already_returned_is_cleared():
    loan = Loan()
    first = loan.take("2026-07-25T02:13:00")
    loan.take("2026-07-25T02:15:00", card="CD-2", retry_of=first, returned="2026-07-26T10:20:00")

    result = check(loan)

    assert result.findings == ()
    (cleared,) = result.cleared
    assert cleared.reason == "ALREADY_REVERSED"
    assert cleared.explanation == "The duplicate debit was returned on 26 Jul 2026."


def test_a_failed_debit_alone_looks_like_nothing():
    loan = Loan()
    loan.take("2026-07-25T02:13:00", status="FAILED")

    result = check(loan)

    assert result.findings == () and result.cleared == ()


def test_three_debits_for_one_payment_gives_twice_the_excess():
    loan = Loan()
    for minute in (14, 16, 18):
        loan.take(f"2026-07-25T02:{minute}:00")

    (finding,) = check(loan).findings

    assert finding.amount_excess == 1_000_000
    assert "Three successful debits" in finding.explanation
    assert finding.explanation.endswith("None was returned.")


def test_two_debits_with_an_overdue_month_and_a_third_one_is_still_a_finding():
    loan = Loan()
    loan.take("2026-07-25T02:13:00", status="FAILED")
    for minute in (14, 15, 16):
        loan.take(f"2026-08-25T02:{minute}:00")

    result = check(loan)

    assert [f.amount_excess for f in result.findings] == [500_000]
    assert f"1{S}000{S}000{S}soʻm was owed on 25 Aug 2026, for 2 installments." in result.findings[0].explanation


def test_an_early_debit_alone_is_not_a_double_debit():
    loan = Loan()
    loan.take("2026-07-20T02:13:00")

    result = check(loan)

    assert result.findings == ()


def test_a_part_and_the_rest_a_day_later_is_not_a_double_debit():
    loan = Loan()
    loan.take("2026-07-25T02:13:00", amount=300_000)
    loan.take("2026-07-26T02:20:00", amount=200_000)

    result = check(loan)

    assert result.findings == () and result.cleared == ()
    assert loan.timeline().rows[0].unpaid == 0


def test_a_debit_added_by_hand_on_the_same_night_is_found():
    loan = Loan()
    loan.take("2026-07-25T02:13:00")
    loan.take("2026-07-25T02:15:00", amount=120_000, run=None)

    (finding,) = check(loan).findings

    assert finding.amount_excess == 120_000
    assert finding.explanation.endswith("Neither was returned.")


def test_a_debit_after_the_last_installment_is_paid_is_all_excess():
    loan = Loan(due=("2026-07-25",))
    loan.take("2026-07-25T02:13:00")
    loan.take("2026-08-25T02:13:00")

    (finding,) = check(loan).findings

    assert finding.installment_n is None
    assert finding.amount_excess == 500_000
    assert finding.explanation.startswith("Nothing was owed on 25 Aug 2026")
    assert finding.explanation.endswith(f"500{S}000{S}soʻm of it was not owed.")


def test_every_finding_and_cleared_item_carries_rows_and_a_sentence():
    loan = Loan()
    loan.take("2026-07-25T02:13:00", status="FAILED")
    loan.take("2026-07-25T02:19:00")
    loan.take("2026-08-25T02:14:00")
    loan.take("2026-08-25T02:16:00", card="CD-2")

    result = check(loan)

    assert len(result.findings) == 1 and len(result.cleared) == 1
    for item in result.findings + result.cleared:
        assert item.explanation
        assert item.evidence.schedule_rows and item.evidence.debits and item.evidence.clauses
