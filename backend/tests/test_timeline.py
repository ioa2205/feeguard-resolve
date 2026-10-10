from datetime import datetime

from factory import Loan


def test_a_debit_on_the_due_date_pays_that_installment():
    loan = Loan()
    loan.take("2026-07-25T02:13:00")

    timeline = loan.timeline()
    july, august, _ = timeline.rows

    assert july.unpaid == 0
    assert july.paid_at == datetime(2026, 7, 25, 2, 13)
    assert august.unpaid == 500_000 and august.paid_at is None
    assert [(run.owed, run.collected, run.excess, run.early) for run in timeline.runs] == [(500_000, 500_000, 0, False)]


def test_money_is_matched_to_the_oldest_unpaid_installment_first():
    loan = Loan()
    loan.take("2026-07-25T02:13:00", status="FAILED")
    loan.take("2026-08-25T02:14:00")
    loan.take("2026-08-25T02:15:00")

    timeline = loan.timeline()
    july, august, _ = timeline.rows

    assert july.unpaid == 0 and july.paid_at == datetime(2026, 8, 25, 2, 14)
    assert august.unpaid == 0 and august.paid_at == datetime(2026, 8, 25, 2, 15)
    assert timeline.runs[1].rows == (6, 7)
    assert timeline.runs[1].overdue == (6,)
    assert timeline.runs[1].excess == 0


def test_a_payment_by_hand_before_the_due_date_pays_the_next_installment():
    loan = Loan()
    loan.pay("2026-07-22T15:40:00")

    july = loan.timeline().rows[0]

    assert july.unpaid == 0
    assert july.paid_at == datetime(2026, 7, 22, 15, 40)


def test_two_part_payments_complete_the_installment_with_the_second_one():
    loan = Loan()
    loan.pay("2026-07-21T10:00:00", amount=200_000)
    loan.pay("2026-07-25T18:30:00", amount=300_000)

    timeline = loan.timeline()

    assert timeline.rows[0].unpaid == 0
    assert timeline.rows[0].paid_at == datetime(2026, 7, 25, 18, 30)
    assert timeline.rows[1].paid == 0
    assert timeline.overpaid == 0


def test_the_recording_time_is_kept_apart_from_the_time_the_money_arrived():
    loan = Loan()
    loan.pay("2026-07-25T16:00:00", posted="2026-07-27T09:10:00")

    july = loan.timeline().rows[0]

    assert july.paid_at == datetime(2026, 7, 25, 16, 0)
    assert july.posted_at == datetime(2026, 7, 27, 9, 10)


def test_a_second_debit_in_the_run_pays_nothing_and_is_not_moved_to_next_month():
    loan = Loan()
    loan.take("2026-07-25T02:13:00")
    loan.take("2026-08-25T02:14:00")
    loan.take("2026-08-25T02:16:00", card="CD-2")

    timeline = loan.timeline()
    _, august, september = timeline.rows

    assert timeline.runs[1].excess == 500_000
    assert august.unpaid == 0
    assert september.paid == 0  # the extra money is not counted as September's payment
    assert len(august.debits) == 2  # both are shown with the month they hit


def test_a_charge_goes_to_its_installment_and_a_fee_without_one_stands_apart():
    loan = Loan()
    penalty = loan.charge("2026-08-03T09:00:00", 4_000, n=6)
    fee = loan.charge("2026-01-25T11:00:00", 50_000, n=None, kind="FEE", code="LOAN_ISSUANCE")

    timeline = loan.timeline()

    assert timeline.rows[0].charges == [penalty]
    assert timeline.other_charges == [fee]
