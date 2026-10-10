"""Fix library: a mistake type and the attribute it is concentrated in, to a suggested fix
(PLAN Part 7.5). Task A8.

These are suggestions for a person to edit in the action plan, never decisions.
"""

from .checkers import double_debit, early_debit, illegal_fee, late_posting

FIXES = {
    (double_debit.TYPE, "batch_run"): (
        "Before the billing run retries on another card, check the final status of the first debit. "
        "Give every installment an idempotency key, so one billing run can collect it only once."
    ),
    (double_debit.TYPE, "cards"): (
        "For customers with two or more cards, try the next card only after the debit on the first card "
        "has finally failed, never while it is still pending."
    ),
    (early_debit.TYPE, "schedule"): (
        "When a payment schedule changes, rebuild the automatic debit plan from the new schedule. "
        "Block any automatic debit before the due date unless the customer asked for early repayment."
    ),
    (early_debit.TYPE, "batch_run"): (
        "Check the debit dates of this billing run against the schedule in force before it runs."
    ),
    (late_posting.TYPE, "channel"): (
        "Record payments from this channel with the day the customer paid, not the day the bank processed "
        "the file. Charge no penalty until the channel's payments of the due date are recorded."
    ),
    (illegal_fee.TYPE, "tariff"): (
        "Remove this fee from the new tariff and return it to every customer who paid it. "
        "Check every tariff change against the contract wording and the law before it goes live."
    ),
    (illegal_fee.TYPE, "product"): (
        "Stop charging this fee on this product and return it to every customer who paid it. "
        "Check the product's fee list against its contract template."
    ),
}


def fix_for(finding_type: str, attributes: list[str]) -> str | None:
    """The fix for the strongest attribute that has one, or None."""
    for name in attributes:
        fix = FIXES.get((finding_type, name))
        if fix:
            return fix
    return None
