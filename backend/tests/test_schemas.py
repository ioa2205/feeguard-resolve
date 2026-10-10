import copy

import pytest
from pydantic import ValidationError

from app.schemas import (
    CaseResult,
    ComplaintCreate,
    DebitRow,
    ScanResult,
    TamperRequest,
    WorldCreate,
)

# The two examples of PLAN Part 10, word for word.
PART_10_CASE = {
    "case_id": "C-1042",
    "complaint": {
        "text": "Oylik to'lovim 500 ming edi, kartamdan 1 mln yechildi",
        "lang": "uz_latn",
    },
    "understood": {
        "claim_type": "DOUBLE_DEBIT",
        "claimed_excess": 500000,
        "period": "2026-08",
        "mode": "llm",
    },
    "verdict": "SUPPORTED",
    "claim_match": True,
    "findings": [
        {
            "finding_id": "F-77",
            "type": "DOUBLE_DEBIT",
            "contract_id": "L-20931",
            "installment_n": 7,
            "amount_excess": 500000,
            "amount_affected": 500000,
            "days_early": None,
            "explanation": "500 000 soʻm was due on 25 Aug 2026. Two successful debits of "
            "500 000 soʻm were taken (HUMO 02:14, UZCARD 02:16). Neither was reversed.",
            "evidence": {
                "schedule_rows": [],
                "debits": [],
                "payments": [],
                "charges": [],
                "contract_clauses": [{"clause": "4.2", "text": "..."}],
            },
        }
    ],
    "cleared": [],
    "draft_reply": {"lang": "uz_latn", "text": "...", "source": "template"},
    "audit_id": "A-5512",
    "elapsed_ms": 1840,
}

PART_10_SCAN = {
    "finding_type": "DOUBLE_DEBIT",
    "affected_contracts": 214,
    "total_excess": 96300000,
    "total_affected": 96300000,
    "systemic": True,
    "complained": 27,
    "silent": 187,
    "cause": {
        "attributes": [
            {"name": "batch_run", "value": "2026-08-14 02:00", "support": 0.93, "lift": 41.2},
            {"name": "cards_count", "value": "2+", "support": 1.0, "lift": 3.1},
        ],
        "sentence": "...",
        "suggested_fix": "...",
    },
    "items": [],
}

# What M0.2 added on top. New fields only.
CASE_ADDED = {
    "complaint": {
        "complaint_id": "C-1042",
        "customer_id": "CU-00417",
        "customer_name": "Dilnoza Yoʻldosheva",
        "contract_id": None,
        "channel": "APP",
        "created_at": "2026-08-27T10:41:00",
        "source": "GENERATED",
        "status": "CHECKED",
        "answer_due": None,
        "verdict": "SUPPORTED",
    },
    "verdict_reason": "One payment was due. Two debits succeeded and neither was returned.",
    "window": {"date_from": "2026-07-01", "date_to": "2026-09-30"},
    "total_excess": 500000,
    "total_affected": 500000,
    "timelines": [],
    "decision": None,
}
FINDING_ADDED = {"legal_basis": None}
SCAN_ADDED = {"affected_customers": 214, "avg_days_early": None, "elapsed_ms": 2310}


def _full_case():
    case = copy.deepcopy(PART_10_CASE)
    case["complaint"].update(CASE_ADDED["complaint"])
    case.update({key: value for key, value in CASE_ADDED.items() if key != "complaint"})
    case["findings"][0].update(FINDING_ADDED)
    return case


def _contains(whole, part):
    """True when every key and value of `part` is in `whole`, at any depth."""
    if isinstance(part, dict):
        return all(key in whole and _contains(whole[key], value) for key, value in part.items())
    if isinstance(part, list):
        return len(whole) == len(part) and all(_contains(w, p) for w, p in zip(whole, part))
    return whole == part


def test_case_result_keeps_every_field_of_the_part_10_example():
    sent = CaseResult.model_validate(_full_case()).model_dump(mode="json")

    assert _contains(sent, PART_10_CASE)


def test_scan_result_keeps_every_field_of_the_part_10_example():
    sent = ScanResult.model_validate({**PART_10_SCAN, **SCAN_ADDED}).model_dump(mode="json")

    assert _contains(sent, PART_10_SCAN)


@pytest.mark.parametrize("amount", [500000.0, 500000.5, "500000", -1, True])
def test_money_is_a_whole_non_negative_number_of_som(amount):
    case = _full_case()
    case["findings"][0]["amount_excess"] = amount

    with pytest.raises(ValidationError):
        CaseResult.model_validate(case)


def test_a_field_that_is_not_in_the_shape_is_refused():
    case = _full_case()
    case["refund_now"] = True

    with pytest.raises(ValidationError):
        CaseResult.model_validate(case)


def test_a_time_with_an_offset_is_refused():
    debit = {
        "id": "D-88121",
        "contract_id": "L-20931",
        "card_id": "CD-0417-1",
        "card": "HUMO ··4471",
        "amount": 500000,
        "created_at": "2026-08-25T02:14:00",
        "status": "SUCCESS",
        "batch_run_id": "BR-2026-08-25",
        "retry_of": None,
        "reversed_by": None,
    }
    assert DebitRow.model_validate(debit).created_at.isoformat() == "2026-08-25T02:14:00"

    with pytest.raises(ValidationError):
        DebitRow.model_validate({**debit, "created_at": "2026-08-25T02:14:00+05:00"})


def _world(**changes):
    return {
        "seed": 2026,
        "size": 5000,
        "defects": {"DOUBLE_DEBIT": 0.02},
        "complaint_rate": 0.15,
        "traps": 20,
        "surprise": False,
        **changes,
    }


def test_a_world_request_inside_the_limits_is_accepted():
    world = WorldCreate.model_validate(_world(defects={"DOUBLE_DEBIT": 0.005, "ILLEGAL_FEE": 0.03}))

    assert world.size == 5000


@pytest.mark.parametrize(
    "changes",
    [
        {"size": 10000},
        {"size": 1_000_000},
        {"defects": {"DOUBLE_DEBIT": 0.004}},
        {"defects": {"DOUBLE_DEBIT": 0.5}},
        {"defects": {"WRONG_INTEREST": 0.02}},
        {"complaint_rate": 1.5},
        {"traps": 201},
        {"seed": -1},
    ],
)
def test_a_world_request_outside_the_limits_is_refused(changes):
    with pytest.raises(ValidationError):
        WorldCreate.model_validate(_world(**changes))


def test_complaint_text_is_at_most_2000_characters():
    ComplaintCreate.model_validate({"customer_id": "CU-1", "text": "a" * 2000})

    with pytest.raises(ValidationError):
        ComplaintCreate.model_validate({"customer_id": "CU-1", "text": "a" * 2001})
    with pytest.raises(ValidationError):
        ComplaintCreate.model_validate({"customer_id": "CU-1", "text": ""})


def test_a_debit_added_by_hand_must_be_more_than_zero():
    request = {"contract_id": "L-1", "action": "extra_debit", "amount": 0, "card_id": "CD-1"}

    with pytest.raises(ValidationError):
        TamperRequest.model_validate(request)
    assert TamperRequest.model_validate({**request, "amount": 1}).amount == 1
