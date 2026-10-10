"""The verdict table of PLAN Part 7.3: one test per row, and the window."""

from datetime import date

from factory import Loan

from app.engine.checkers import check_all
from app.engine.investigate import decide, window_for

RECEIVED = date(2026, 9, 28)


def checked(*loans: Loan):
    return [check_all(loan.timeline()) for loan in loans]


def double_debit_in_august() -> Loan:
    loan = Loan()
    loan.take("2026-07-25T02:13:00")
    loan.take("2026-08-25T02:14:00")
    loan.take("2026-08-25T02:16:00", card="CD-2")
    loan.take("2026-09-25T02:12:00")
    return loan


def arrears_paid_in_august() -> Loan:
    """Two debits in August, because July was not paid: the bank was right."""
    loan = Loan()
    loan.take("2026-07-25T02:13:00", status="FAILED")
    loan.take("2026-08-25T02:14:00")
    loan.take("2026-08-25T02:15:00")
    loan.take("2026-09-25T02:12:00")
    return loan


def nothing_special() -> Loan:
    loan = Loan()
    for month in ("07", "08", "09"):
        loan.take(f"2026-{month}-25T02:13:00")
    return loan


# --- One test per row of the table -----------------------------------------


def test_row_1_a_finding_of_the_claimed_type_is_supported():
    outcome = decide("DOUBLE_DEBIT", "2026-08", RECEIVED, checked(double_debit_in_august()))

    assert outcome.verdict == "SUPPORTED"
    assert outcome.claim_match is True
    assert [f.type for f in outcome.findings] == ["DOUBLE_DEBIT"]
    assert outcome.reason.startswith("500\xa0000\xa0soʻm was due on 25 Aug 2026.")


def test_row_2_a_finding_of_another_type_is_supported_without_a_claim_match():
    outcome = decide("LATE_POSTING", "2026-08", RECEIVED, checked(double_debit_in_august()))

    assert outcome.verdict == "SUPPORTED"
    assert outcome.claim_match is False
    assert outcome.reason.startswith("The records show a different mistake than the customer described: taken twice.")


def test_row_2_also_holds_when_the_complaint_is_about_something_else():
    outcome = decide("OTHER", None, RECEIVED, checked(double_debit_in_august()))

    assert outcome.verdict == "SUPPORTED"
    assert outcome.claim_match is False


def test_row_3_no_finding_and_a_cleared_item_of_the_claimed_type_is_not_supported_with_the_reason():
    outcome = decide("DOUBLE_DEBIT", "2026-08", RECEIVED, checked(arrears_paid_in_august()))

    assert outcome.verdict == "NOT_SUPPORTED"
    assert outcome.claim_match is None
    assert outcome.reason == "The second debit paid the overdue installment of July 2026."
    assert outcome.findings == ()
    assert "ARREARS_COVERED" in [item.reason for item in outcome.cleared]


def test_row_4_no_finding_nothing_cleared_and_a_stated_period_is_not_supported():
    outcome = decide("DOUBLE_DEBIT", "2026-08", RECEIVED, checked(nothing_special()))

    assert outcome.verdict == "NOT_SUPPORTED"
    assert outcome.reason == "No debit, penalty or fee matching the claim was found between 1 Jul 2026 and 30 Sep 2026."


def test_row_5_no_finding_nothing_cleared_and_no_period_needs_information():
    outcome = decide("DOUBLE_DEBIT", None, RECEIVED, checked(nothing_special()))

    assert outcome.verdict == "NEEDS_INFO"
    assert outcome.reason.endswith("Ask the customer for the month, the card or the amount.")


def test_row_6_no_finding_and_another_kind_of_complaint_is_out_of_scope():
    outcome = decide("OTHER", None, RECEIVED, checked(nothing_special()))

    assert outcome.verdict == "OUT_OF_SCOPE"
    assert outcome.claim_match is None


# --- Around the table ------------------------------------------------------


def test_a_cleared_item_of_another_type_does_not_answer_the_claim():
    """July was paid late and fined, rightly. The claim is a fee: nothing matches it."""
    loan = arrears_paid_in_august()
    loan.charge("2026-08-25T02:14:00", 15_500, 6)

    outcome = decide("ILLEGAL_FEE", "2026-08", RECEIVED, checked(loan))

    assert outcome.verdict == "NOT_SUPPORTED"
    assert outcome.reason.startswith("No debit, penalty or fee matching the claim")
    assert {item.reason for item in outcome.cleared} == {"ARREARS_COVERED", "PAID_AFTER_DUE_DATE"}


def test_the_window_is_the_stated_month_with_one_month_on_each_side():
    assert window_for("2026-08", RECEIVED) == (date(2026, 7, 1), date(2026, 9, 30))
    assert window_for("2026-01", RECEIVED) == (date(2025, 12, 1), date(2026, 2, 28))
    assert window_for("2026-12", RECEIVED) == (date(2026, 11, 1), date(2027, 1, 31))


def test_without_a_month_the_window_is_the_three_whole_months_before_the_month_of_the_complaint():
    assert window_for(None, RECEIVED) == (date(2026, 6, 1), RECEIVED)
    assert window_for(None, date(2026, 2, 3)) == (date(2025, 11, 1), date(2026, 2, 3))


def test_without_a_month_a_mistake_early_in_the_first_month_is_still_inside():
    """Found on the default demo bank: a double debit on 5 July, a complaint on 10 October."""
    loan = Loan(due=("2026-07-05", "2026-08-05", "2026-09-05"))
    loan.take("2026-07-05T02:14:00")
    loan.take("2026-07-05T02:16:00", card="CD-2")

    outcome = decide("DOUBLE_DEBIT", None, date(2026, 10, 10), checked(loan))

    assert outcome.verdict == "SUPPORTED"


def test_a_mistake_outside_the_window_is_not_counted():
    loan = Loan(due=("2026-03-25", "2026-04-25", "2026-05-25"), first_n=2)
    loan.take("2026-03-25T02:14:00")
    loan.take("2026-03-25T02:16:00", card="CD-2")

    outcome = decide("DOUBLE_DEBIT", "2026-08", RECEIVED, checked(loan))

    assert outcome.verdict == "NOT_SUPPORTED"
    assert outcome.findings == ()


def test_a_fee_at_the_start_of_the_loan_has_no_month_and_is_always_checked():
    loan = nothing_special()
    loan.charge("2026-01-25T11:20:00", 50_000, None, kind="FEE", code="LOAN_ISSUANCE")

    outcome = decide("ILLEGAL_FEE", None, RECEIVED, checked(loan))

    assert outcome.verdict == "SUPPORTED"
    assert outcome.claim_match is True


def test_every_contract_of_the_customer_is_checked():
    outcome = decide("DOUBLE_DEBIT", "2026-08", RECEIVED, checked(nothing_special(), double_debit_in_august()))

    assert outcome.verdict == "SUPPORTED"


def test_the_finding_of_the_claimed_type_comes_first():
    loan = double_debit_in_august()
    loan.charge("2026-01-25T11:20:00", 50_000, None, kind="FEE", code="LOAN_ISSUANCE")

    outcome = decide("ILLEGAL_FEE", "2026-08", RECEIVED, checked(loan))

    assert [f.type for f in outcome.findings] == ["ILLEGAL_FEE", "DOUBLE_DEBIT"]
    assert outcome.claim_match is True
    assert outcome.reason.endswith("1 more mistake was found.")
