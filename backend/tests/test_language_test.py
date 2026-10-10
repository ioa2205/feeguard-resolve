"""The runner of the hand-written test set (task B7), on two made-up lines.

These lines only test the counting. They are not the test set, which people
write by hand in data/complaint_testset.jsonl.
"""

import json

from app.eval import language_test

LINES = [
    {"text": "Kartamdan kredit puli ikki marta yechildi, 500 ming qaytaring", "received": "2026-08-27",
     "claim_type": "DOUBLE_DEBIT", "claimed_excess": 500000, "period": None, "lang": "uz_latn"},
    {"text": "Мне нужна справка об отсутствии задолженности", "received": "2026-09-02",
     "claim_type": "OTHER", "claimed_excess": None, "period": None, "lang": "ru"},
]


def test_rules_mode_counts_claim_types_and_amounts_overall_and_per_language():
    result = language_test.run(LINES, "rules")

    assert result["total"] == {"all": 2, "uz_latn": 1, "ru": 1}
    assert result["type_correct"]["all"] == 2 and result["amount_correct"]["all"] == 2
    assert language_test.score(result).model_dump() == {"mode": "rules", "n": 2, "type_correct": 2, "amount_correct": 2}


def test_ai_mode_without_a_model_counts_nothing_as_right():
    result = language_test.run(LINES, "llm")

    assert result["answered"] == 0 and result["type_correct"]["all"] == 0


def test_the_scoreboard_reads_the_saved_run_and_nothing_before_it(tmp_path):
    path = tmp_path / "result.json"
    assert language_test.saved_scores(path) == []

    path.write_text(json.dumps({"scores": [{"mode": "rules", "n": 100, "type_correct": 80, "amount_correct": 70}]}), encoding="utf-8")

    assert [score.type_correct for score in language_test.saved_scores(path)] == [80]
