"""The late posting checker, with its trap case (PLAN Part 7.2)."""

from datetime import date

from factory import Loan

from app.engine.checkers import late_posting

S = "\xa0"  # the space inside an amount never breaks a line


def check(loan: Loan):
    return late_posting.check(loan.timeline())


def test_a_payment_in_time_with_no_penalty_is_nothing():
    loan = Loan()
    loan.pay("2026-07-25T14:05:00")

    result = check(loan)

    assert result.findings == () and result.cleared == ()


def test_paid_on_the_due_date_recorded_the_next_business_day_and_fined_is_a_finding():
    loan = Loan()  # 25 Jul 2026 is a Saturday
    payment = loan.pay("2026-07-25T14:05:00", posted="2026-07-27T09:12:00")
    penalty = loan.charge("2026-07-27T09:12:00", 1_000, 6)

    (finding,) = check(loan).findings

    assert finding.type == "LATE_POSTING"
    assert finding.installment_n == 6
    assert finding.amount_excess == 1_000
    assert finding.amount_affected == 1_000
    assert finding.days_early is None
    assert finding.explanation == (
        f"500{S}000{S}soʻm was due on 25 Jul 2026. The customer paid it through Paynet on 25 Jul 2026, in time. "
        f"The bank recorded it on 27 Jul 2026, 1 business day late, and charged a penalty of 1{S}000{S}soʻm."
    )
    assert finding.evidence.payments == (payment,)
    assert finding.evidence.charges == (penalty,)
    assert [row.n for row in finding.evidence.schedule_rows] == [6]
    assert finding.evidence.clauses == ("4.5", "5.2")


def test_trap_a_penalty_for_a_payment_that_really_came_late_is_cleared():
    loan = Loan()
    loan.pay("2026-07-28T11:00:00")
    loan.charge("2026-07-28T11:00:00", 1_500, 6)

    result = check(loan)

    assert result.findings == ()
    (cleared,) = result.cleared
    assert cleared.reason == "PAID_AFTER_DUE_DATE"
    assert cleared.installment_n == 6
    assert cleared.explanation == "The payment arrived on 28 Jul 2026, after the due date."
    assert cleared.evidence.payments and cleared.evidence.charges and cleared.evidence.clauses == ("5.1",)


def test_trap_a_late_payment_that_was_also_recorded_late_is_still_the_customers_delay():
    loan = Loan()
    loan.pay("2026-07-28T11:00:00", posted="2026-07-29T09:10:00")
    loan.charge("2026-07-29T09:10:00", 2_000, 6)

    result = check(loan)

    assert result.findings == ()
    assert [item.reason for item in result.cleared] == ["PAID_AFTER_DUE_DATE"]


def test_recorded_late_without_a_penalty_is_not_a_finding():
    loan = Loan()
    loan.pay("2026-07-25T14:05:00", posted="2026-07-27T09:12:00")

    result = check(loan)

    assert result.findings == () and result.cleared == ()


def test_a_penalty_for_a_month_that_was_never_paid_is_cleared():
    loan = Loan()
    loan.charge("2026-08-25T02:10:00", 15_500, 6)

    result = check(loan)

    assert result.findings == ()
    assert result.cleared[0].explanation == "No full payment had arrived by the due date, 25 Jul 2026."


def test_a_failed_debit_paid_with_the_next_one_is_cleared_and_only_that_month():
    loan = Loan()
    loan.take("2026-07-25T02:13:00", status="FAILED")
    loan.take("2026-08-25T02:14:00")
    loan.take("2026-08-25T02:15:00")
    loan.charge("2026-08-25T02:14:00", 15_500, 6)

    result = check(loan)

    assert result.findings == ()
    assert [(item.installment_n, item.reason) for item in result.cleared] == [(6, "PAID_AFTER_DUE_DATE")]


def test_the_part_that_completed_the_payment_decides():
    loan = Loan()
    loan.pay("2026-07-21T10:00:00", amount=250_000)
    loan.pay("2026-07-25T16:00:00", amount=250_000, posted="2026-07-27T09:05:00")
    loan.charge("2026-07-27T09:05:00", 500, 6)

    (finding,) = check(loan).findings

    assert finding.amount_excess == 500
    assert len(finding.evidence.payments) == 2


def test_business_days_skip_the_weekend():
    assert late_posting.business_days_between(date(2026, 9, 25), date(2026, 9, 28)) == 1  # Friday to Monday
    assert late_posting.business_days_between(date(2026, 9, 22), date(2026, 9, 24)) == 2
    assert late_posting.business_days_between(date(2026, 9, 25), date(2026, 9, 25)) == 0
