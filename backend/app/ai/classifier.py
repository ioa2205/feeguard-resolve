"""Trained complaint classifier: character n-grams and logistic regression. Task B4.

It learns the claim type from complaints that the Sandbox Bank's templates
generate, so it copes with Latin and Cyrillic script and with typos. It is
small enough to train when the server starts; no model file is stored.

    python -m app.ai.classifier

prints how well it does. Read those numbers with care: the texts it is tested
on come from the same templates it learned from. The honest test is the
hand-written set (tasks B5 and B7).
"""

import json
import threading
from datetime import date
from pathlib import Path
from random import Random

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline, make_pipeline

from ..generator import complaints

TRAINING_SEED = 4004  # not the seed of any demo bank
TRAINING_SIZE = 4000
AS_OF = date(2026, 10, 10)
SAMPLES = Path(__file__).resolve().parents[2] / "data" / "ai_written_samples.jsonl"

_model: Pipeline | None = None
_lock = threading.Lock()


def _plain(text: str) -> str:
    # The same folding as the rules: lower case, no apostrophes, so "to'lov" and "toʻlov" are one word.
    from .parse_complaint import _plain as fold

    return fold(text)


def train(texts: list[str], labels: list[str]) -> Pipeline:
    model = make_pipeline(
        TfidfVectorizer(preprocessor=_plain, analyzer="char_wb", ngram_range=(2, 5), sublinear_tf=True, min_df=2),
        LogisticRegression(C=10.0, max_iter=1000),
    )
    model.fit(texts, labels)
    return model


def training_set(count: int = TRAINING_SIZE, seed: int = TRAINING_SEED) -> list[tuple[str, str, str, str]]:
    """(text, claim_type, lang, template), the same for the same seed."""
    return complaints.sample(Random(seed), count, AS_OF)


def model() -> Pipeline:
    """The classifier, trained once per process."""
    global _model
    with _lock:
        if _model is None:
            rows = training_set()
            _model = train([row[0] for row in rows], [row[1] for row in rows])
        return _model


def classify(text: str) -> tuple[str, float]:
    """The most likely claim type and how sure the classifier is, from 0 to 1."""
    trained = model()
    shares = trained.predict_proba([text])[0]
    best = shares.argmax()
    return str(trained.classes_[best]), float(shares[best])


# --- How well it does -------------------------------------------------------


def held_out_accuracy(rows: list[tuple[str, str, str, str]], unseen_templates: bool) -> tuple[int, int]:
    """(right, total) on the fifth of the texts that was kept out of training.

    With `unseen_templates`, every text of a held-out template is kept out, so the
    classifier is tested on sentences it has never seen in any form.
    """
    if unseen_templates:
        templates = sorted({row[3] for row in rows})
        Random(1).shuffle(templates)
        kept_out = set(templates[::5])
        test = [row for row in rows if row[3] in kept_out]
        learn = [row for row in rows if row[3] not in kept_out]
    else:
        order = list(range(len(rows)))
        Random(1).shuffle(order)
        cut = len(rows) // 5
        test, learn = [rows[i] for i in order[:cut]], [rows[i] for i in order[cut:]]
    trained = train([row[0] for row in learn], [row[1] for row in learn])
    predicted = trained.predict([row[0] for row in test])
    return sum(1 for row, label in zip(test, predicted) if row[1] == label), len(test)


def main() -> None:
    from . import parse_complaint

    rows = training_set()
    right, total = held_out_accuracy(rows, unseen_templates=False)
    print(f"Trained on {len(rows)} generated complaints (seed {TRAINING_SEED}), 5 claim types.")
    print(f"Held-out fifth, same templates:      {right} of {total} right ({right / total:.1%})")
    right, total = held_out_accuracy(rows, unseen_templates=True)
    print(f"Held-out fifth, templates never seen: {right} of {total} right ({right / total:.1%})")

    with SAMPLES.open(encoding="utf-8") as file:
        samples = [json.loads(line) for line in file if line.strip()]
    by_model = sum(1 for sample in samples if classify(sample["text"])[0] == sample["claim_type"])
    by_rules = by_both = 0
    for sample in samples:
        amounts = [amount.value for amount in parse_complaint.find_amounts(sample["text"])]
        lang = parse_complaint.detect_lang(sample["text"])
        by_rules += parse_complaint.key_words(sample["text"], amounts, lang) == sample["claim_type"]
        by_both += parse_complaint.rules_claim(sample["text"], amounts, lang) == sample["claim_type"]
    print(f"The {len(samples)} sample complaints that were not made from templates:")
    print(f"  classifier alone {by_model} of {len(samples)} · key words alone {by_rules} of {len(samples)} · both together {by_both} of {len(samples)}")


if __name__ == "__main__":
    main()
