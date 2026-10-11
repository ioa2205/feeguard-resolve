"""Every sentence FeeGuard writes for a person has the same numbers in all three languages (D-041). Fake data only."""

import re

import pytest

from app.connector import Bank
from app.engine import scan, timeline
from app.engine.checkers import CHECKERS
from app.engine.wording import Said
from app.generator.world import Settings, build_world

COUNT_WORDS = {"No": "0", "One": "1", "Two": "2", "Three": "3", "Four": "4", "Five": "5", "All": None}


def numbers(text: str) -> list[str]:
    for word, digit in COUNT_WORDS.items():
        if digit:
            text = re.sub(rf"\b{word}\b", digit, text)
    text = text.replace(" ", "").replace(",", ".")
    return sorted(re.findall(r"\d+(?:\.\d+)?", text))


@pytest.fixture(scope="module")
def sentences(tmp_path_factory):
    parent = tmp_path_factory.mktemp("worlds")
    build_world(parent, "w-61", Settings(seed=61, size=3000))
    found: list[Said] = []
    with Bank(parent / "w-61") as bank:
        for data in bank.load().values():
            built = timeline.build(data)
            for check in CHECKERS.values():
                result = check(built)
                found += [item.explanation for item in (*result.findings, *result.cleared)]
        kept = scan.check_bank(bank)
        for kind in kept.by_type:
            cause = scan.scan(kind, kept, bank).cause
            if cause:
                found.append(Said(**cause.sentence_t.model_dump()))
                if cause.suggested_fix_t:
                    found.append(Said(**cause.suggested_fix_t.model_dump()))
    return found


def test_every_sentence_comes_in_three_languages(sentences):
    assert len(sentences) > 100
    assert all(isinstance(text, Said) and text.uz and text.ru for text in sentences)
    assert all(text.uz != str(text) and text.ru != str(text) for text in sentences)


def test_the_uzbek_and_russian_sentences_carry_the_same_numbers_as_the_english_one(sentences):
    wrong = [
        (str(text), lang)
        for text in sentences
        for lang in ("uz", "ru")
        if numbers(getattr(text, lang)) != numbers(str(text))
    ]
    assert wrong == []
