"""The illegal fee checker, with its trap case (PLAN Part 7.2)."""

from factory import Loan

from app.engine.checkers import illegal_fee

S = "\xa0"  # the space inside an amount never breaks a line

VERIFIED = {"LOAN_ISSUANCE": {"code": "LOAN_ISSUANCE", "verified": True, "legal_basis": "Example rule, article 0"}}


def check(loan: Loan, law=None):
    return illegal_fee.check(loan.timeline(), law)


def test_no_fee_is_nothing():
    loan = Loan()
    loan.take("2026-07-25T02:13:00")

    result = check(loan)

    assert result.findings == () and result.cleared == ()


def test_a_fee_the_contract_does_not_list_is_a_finding():
    loan = Loan()
    fee = loan.charge("2026-01-25T11:20:00", 50_000, None, kind="FEE", code="LOAN_ISSUANCE")

    (finding,) = check(loan).findings

    assert finding.type == "ILLEGAL_FEE"
    assert finding.installment_n is None
    assert finding.amount_excess == 50_000
    assert finding.amount_affected == 50_000
    assert finding.explanation == (
        f"A loan issuance fee of 50{S}000{S}soʻm was charged on 25 Jan 2026. The contract does not list this fee."
    )
    assert finding.evidence.charges == (fee,)
    assert finding.evidence.clauses == ("3.1", "3.2")


def test_trap_a_fee_that_the_contract_lists_is_cleared():
    loan = Loan()
    fee = loan.charge("2026-03-02T14:40:00", 25_000, None, kind="FEE", code="CARD_REISSUE")

    result = check(loan)

    assert result.findings == ()
    (cleared,) = result.cleared
    assert cleared.reason == "FEE_IN_CONTRACT"
    assert cleared.explanation == "This fee is listed in clause 3.1 of the contract."
    assert cleared.evidence.charges == (fee,)
    assert cleared.evidence.clauses == ("3.1",)


def test_a_penalty_is_not_a_fee():
    loan = Loan()
    loan.charge("2026-07-28T11:00:00", 1_500, 6)

    result = check(loan)

    assert result.findings == () and result.cleared == ()


def test_the_shipped_law_list_is_unverified_and_decides_nothing():
    """DECISIONS D-023: an unverified entry never turns a listed fee into a finding."""
    law = illegal_fee.load_law()
    loan = Loan(allowed_fees=("CARD_REISSUE", "LOAN_ISSUANCE"))
    loan.charge("2026-01-25T11:20:00", 50_000, None, kind="FEE", code="LOAN_ISSUANCE")

    result = check(loan)

    assert all(entry["verified"] is False and entry["legal_basis"] == "TO VERIFY" for entry in law.values())
    assert result.findings == ()
    assert [item.reason for item in result.cleared] == ["FEE_IN_CONTRACT"]


def test_an_unlisted_fee_shows_its_unverified_basis_as_to_verify():
    loan = Loan()
    loan.charge("2026-01-25T11:20:00", 50_000, None, kind="FEE", code="LOAN_ISSUANCE")

    (finding,) = check(loan).findings

    assert finding.legal_basis == "TO VERIFY"


def test_a_verified_law_entry_forbids_a_fee_even_when_the_contract_lists_it():
    loan = Loan(allowed_fees=("CARD_REISSUE", "LOAN_ISSUANCE"))
    loan.charge("2026-01-25T11:20:00", 50_000, None, kind="FEE", code="LOAN_ISSUANCE")

    result = check(loan, VERIFIED)

    assert result.cleared == ()
    assert result.findings[0].explanation.endswith("The contract lists this fee, but the law does not allow it.")
    assert result.findings[0].legal_basis == "Example rule, article 0"


def test_a_fee_with_an_unknown_code_is_named_in_plain_words():
    loan = Loan()
    loan.charge("2026-01-25T11:20:00", 10_000, None, kind="FEE", code="SMS_INFO")

    (finding,) = check(loan).findings

    assert finding.explanation.startswith("A sms info of 10")
    assert finding.legal_basis is None


def test_two_fees_are_judged_one_by_one():
    loan = Loan()
    loan.charge("2026-01-25T11:20:00", 50_000, None, kind="FEE", code="LOAN_ISSUANCE")
    loan.charge("2026-03-02T14:40:00", 25_000, None, kind="FEE", code="CARD_REISSUE")

    result = check(loan)

    assert [f.amount_excess for f in result.findings] == [50_000]
    assert [item.reason for item in result.cleared] == ["FEE_IN_CONTRACT"]
