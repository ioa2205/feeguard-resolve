"""Rules of CLAUDE.md that a test can hold: 3, 4 and 11."""

from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
APP = BACKEND / "app"

AI_SDKS = ("openai", "anthropic", "google-generativeai", "google-genai", "cohere", "mistralai", "groq")


def _mentions(words, allowed):
    """Files under app/ that name one of `words`, outside the allowed top-level entries."""
    found = []
    for path in sorted(APP.rglob("*")):
        relative = path.relative_to(APP)
        if not path.is_file() or "__pycache__" in relative.parts or relative.parts[0] in allowed:
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        if any(word in text for word in words):
            found.append(relative.as_posix())
    return found


def test_only_the_generator_and_eval_name_the_answer_key():
    assert _mentions(("truth.db", "ground_truth"), {"generator", "eval"}) == []


def test_only_the_connector_and_the_generator_name_the_bank_file():
    assert _mentions(("bank.db",), {"generator", "connector.py"}) == []


def test_no_ai_sdk_in_the_dependencies():
    lines = (BACKEND / "requirements.txt").read_text(encoding="utf-8").lower().splitlines()
    names = {line.split("==")[0].split("[")[0].strip() for line in lines if line.strip()}

    assert names.isdisjoint(AI_SDKS)
