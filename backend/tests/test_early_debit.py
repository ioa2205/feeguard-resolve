"""The early debit checker, with its trap case (PLAN Part 7.2)."""

from datetime import date

from factory import Loan

from app.engine.checkers import double_debit, early_debit

S = "\xa0"  # the space inside an amount never breaks a line


def check(loan: Loan):
    return early_debit.check(loan.timeline())


def test_a_debit_on_the_due_date_is_not_early():
    loan = Loan()
    loan.take("2026-07-25T02:13:00")

    result = check(loan)

    assert result.findings == () and result.cleared == ()


def test_a_debit_before_the_due_date_is_a_finding_with_nothing_to_return():
    loan = Loan()
    loan.take("2026-07-25T02:13:00")
    debit = loan.take("2026-08-20T02:14:00")

    (finding,) = check(loan).findings

    assert finding.type == "EARLY_DEBIT"
    assert finding.installment_n == 7
    assert finding.amount_excess == 0
    assert finding.amount_affected == 500_000
    assert finding.days_early == 5
    assert finding.explanation == (
        f"500{S}000{S}soʻm was due on 25 Aug 2026. 500{S}000{S}soʻm was taken on 20 Aug 2026 (HUMO 02:14), "
        "5 days early. The customer had not asked for early repayment."
    )
    assert finding.evidence.debits == (debit,)
    assert [row.n for row in finding.evidence.schedule_rows] == [7]
    assert len(finding.evidence.payments) == 1
    assert finding.evidence.clauses == ("4.4",)


def test_trap_an_early_debit_the_customer_asked_for_is_cleared():
    loan = Loan(early_repayment_requested_on=date(2026, 8, 19))
    loan.take("2026-07-25T02:13:00")
    loan.take("2026-08-20T02:14:00")

    result = check(loan)

    assert result.findings == ()
    (cleared,) = result.cleared
    assert cleared.reason == "EARLY_REPAYMENT_REQUESTED"
    assert cleared.installment_n == 7
    assert cleared.explanation == "The customer asked for early repayment on 19 Aug 2026."
    assert cleared.evidence.debits and cleared.evidence.schedule_rows and cleared.evidence.clauses == ("4.4",)


def test_a_request_made_after_the_debit_does_not_clear_it():
    loan = Loan(early_repayment_requested_on=date(2026, 8, 22))
    loan.take("2026-07-25T02:13:00")
    loan.take("2026-08-20T02:14:00")

    result = check(loan)

    assert [f.days_early for f in result.findings] == [5]
    assert result.cleared == ()


def test_a_debit_after_a_schedule_change_names_the_change():
    loan = Loan(schedule_version=2, schedule_changed_on=date(2026, 7, 28))
    loan.take("2026-07-25T02:13:00")
    loan.take("2026-08-15T02:14:00")

    (finding,) = check(loan).findings

    assert finding.days_early == 10
    assert finding.explanation.endswith(
        "The payment schedule was changed on 28 Jul 2026, and the debit still came before the new date."
    )
    assert finding.evidence.clauses == ("4.4", "4.6")


def test_every_early_month_is_its_own_finding():
    loan = Loan()
    for month in ("07", "08", "09"):
        loan.take(f"2026-{month}-15T02:13:00")

    findings = check(loan).findings

    assert [(f.installment_n, f.days_early, f.amount_affected) for f in findings] == [
        (6, 10, 500_000), (7, 10, 500_000), (8, 10, 500_000),
    ]


def test_a_failed_early_debit_took_nothing_and_is_not_a_finding():
    loan = Loan()
    loan.take("2026-07-20T02:13:00", status="FAILED")
    loan.take("2026-07-25T02:13:00")

    result = check(loan)

    assert result.findings == () and result.cleared == ()


def test_a_late_debit_for_an_overdue_month_is_not_early():
    loan = Loan()
    loan.take("2026-07-25T02:13:00", status="FAILED")
    loan.take("2026-08-03T02:13:00")

    assert check(loan).findings == ()


def test_a_payment_the_customer_made_by_hand_ahead_of_time_is_not_an_early_debit():
    loan = Loan()
    loan.pay("2026-07-21T10:00:00")

    result = check(loan)

    assert result.findings == () and result.cleared == ()


def test_an_early_debit_is_not_also_a_double_debit():
    loan = Loan()
    loan.take("2026-07-20T02:13:00")

    assert len(check(loan).findings) == 1
    assert double_debit.check(loan.timeline()).findings == ()


def test_two_early_debits_are_one_early_debit_and_one_double_debit():
    loan = Loan()
    loan.take("2026-07-20T02:13:00")
    loan.take("2026-07-20T02:15:00", card="CD-2")

    (early,) = check(loan).findings
    (double,) = double_debit.check(loan.timeline()).findings

    assert early.amount_affected == 500_000 and early.amount_excess == 0
    assert double.amount_excess == 500_000
