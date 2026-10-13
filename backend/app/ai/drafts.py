"""The letter to the customer, in the customer's language. Numbers come from code only. Task B6.

The template letter is written with the verdict (DECISIONS D-010). "Improve
wording" asks the local model to reword it. Code then checks the new text: the
same language, and exactly the numbers the template has, no more and no fewer.
If the check fails, or there is no model, the template stays. The screen shows
which one it is, and "Draft, not approved" until a person confirms.

The letter names no deadline and no law: neither is verified yet (CLAUDE.md
rule 14). A native speaker must read the three templates (task B6 review).
"""

import re
from datetime import date

from pydantic import BaseModel, ConfigDict, ValidationError

from .. import schemas
from . import llm
from .normalize_amount import find_amounts
from .parse_complaint import detect_lang

NBSP = " "
BANK = "Demo Bank"  # the invented bank of the demo; a real bank signs with its own name

MONTHS = {
    "uz_latn": ("yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"),
    "uz_cyrl": ("январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"),
    "ru": ("январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"),
}
MONTHS_RU_OF = ("января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря")
CURRENCY = {"uz_latn": "soʻm", "uz_cyrl": "сўм", "ru": "сум"}

# Every sentence of the letter, by language. Placeholders are filled by code.
WORDS = {
    "uz_latn": {
        "greeting": "Hurmatli {name}!",
        "thanks": "{date} kuni yuborgan {id}-raqamli murojaatingiz uchun rahmat.",
        "checked": "Biz {contracts} raqamli kredit shartnomangiz boʻyicha toʻlovlarni tekshirdik.",
        "DOUBLE_DEBIT": "{due} sanasidagi toʻlov uchun kartangizdan pul ikki marta yechib olingan. Ortiqcha yechilgan summa: {amount}.",
        "EARLY_DEBIT": "{date} kuni kartangizdan {amount} toʻlov muddatidan {days} kun oldin yechib olingan.",
        "LATE_POSTING": "Siz toʻlovni {paid} kuni, oʻz vaqtida amalga oshirgansiz, ammo bank uni {posted} kuni hisobga olgan "
                        "va {amount} jarima hisoblagan.",
        "ILLEGAL_FEE": "{date} kuni shartnomada koʻrsatilmagan {fee} sifatida {amount} undirilgan.",
        "more": "Yana {count} ta shunday holat aniqlandi.",
        "return": "Jami {amount} sizga qaytariladi.",
        "early_only": "Bu mablagʻ kredit toʻlovingizga hisoblangan. Avtomatik yechib olish sanalari toʻgʻrilanadi.",
        "sorry": "Noqulaylik uchun uzr soʻraymiz.",
        "no_mistake": "Tekshiruv natijasida bank tomonidan xatolik aniqlanmadi.",
        "ARREARS_COVERED": "Ikkinchi yechib olish {month} oyidagi toʻlanmagan toʻlovni qoplagan.",
        "RETRY_AFTER_FAILURE": "Birinchi yechib olish amalga oshmagan; faqat bitta yechib olish muvaffaqiyatli boʻlgan.",
        "ALREADY_REVERSED": "Takroriy yechib olingan summa kartangizga qaytarilgan.",
        "EARLY_REPAYMENT_REQUESTED": "Siz {date} kuni kreditni muddatidan oldin toʻlash uchun ariza bergansiz.",
        "PAID_AFTER_DUE_DATE": "Toʻlov {date} kuni, toʻlov muddatidan keyin kelib tushgan, shuning uchun jarima shartnomaga muvofiq hisoblangan.",
        "NOT_PAID_BY_DUE_DATE": "Toʻlov muddatigacha toʻliq toʻlov kelib tushmagan, shuning uchun jarima shartnomaga muvofiq hisoblangan.",
        "FEE_IN_CONTRACT": "Bu toʻlov shartnomangizning {clause}-bandida koʻrsatilgan.",
        "nothing_in_period": "Koʻrsatilgan davrda shikoyatingizga mos keladigan yechib olish, jarima yoki toʻlov topilmadi.",
        "questions": "Savollaringiz boʻlsa, bizga murojaat qiling.",
        "NEEDS_INFO": "Murojaatingizni tekshirish uchun qoʻshimcha maʼlumot kerak. Iltimos, qaysi oy, qaysi karta "
                      "va qancha summa haqida gap ketayotganini yozib yuboring.",
        "OUT_OF_SCOPE": "Murojaatingiz kredit toʻlovini yechib olish, jarima yoki komissiya bilan bogʻliq emas, "
                        "shuning uchun u alohida koʻrib chiqiladi.",
        "sign": f"Hurmat bilan,\n{BANK}, murojaatlar bilan ishlash boʻlimi",
        "LOAN_ISSUANCE": "kredit berish uchun komissiya",
        "CARD_REISSUE": "kartani qayta chiqarish uchun toʻlov",
        "fee": "komissiya",
    },
    "uz_cyrl": {
        "greeting": "Ҳурматли {name}!",
        "thanks": "{date} куни юборган {id}-рақамли мурожаатингиз учун раҳмат.",
        "checked": "Биз {contracts} рақамли кредит шартномангиз бўйича тўловларни текширдик.",
        "DOUBLE_DEBIT": "{due} санасидаги тўлов учун картангиздан пул икки марта ечиб олинган. Ортиқча ечилган сумма: {amount}.",
        "EARLY_DEBIT": "{date} куни картангиздан {amount} тўлов муддатидан {days} кун олдин ечиб олинган.",
        "LATE_POSTING": "Сиз тўловни {paid} куни, ўз вақтида амалга оширгансиз, аммо банк уни {posted} куни ҳисобга олган "
                        "ва {amount} жарима ҳисоблаган.",
        "ILLEGAL_FEE": "{date} куни шартномада кўрсатилмаган {fee} сифатида {amount} ундирилган.",
        "more": "Яна {count} та шундай ҳолат аниқланди.",
        "return": "Жами {amount} сизга қайтарилади.",
        "early_only": "Бу маблағ кредит тўловингизга ҳисобланган. Автоматик ечиб олиш саналари тўғриланади.",
        "sorry": "Ноқулайлик учун узр сўраймиз.",
        "no_mistake": "Текширув натижасида банк томонидан хатолик аниқланмади.",
        "ARREARS_COVERED": "Иккинчи ечиб олиш {month} ойидаги тўланмаган тўловни қоплаган.",
        "RETRY_AFTER_FAILURE": "Биринчи ечиб олиш амалга ошмаган; фақат битта ечиб олиш муваффақиятли бўлган.",
        "ALREADY_REVERSED": "Такрорий ечиб олинган сумма картангизга қайтарилган.",
        "EARLY_REPAYMENT_REQUESTED": "Сиз {date} куни кредитни муддатидан олдин тўлаш учун ариза бергансиз.",
        "PAID_AFTER_DUE_DATE": "Тўлов {date} куни, тўлов муддатидан кейин келиб тушган, шунинг учун жарима шартномага мувофиқ ҳисобланган.",
        "NOT_PAID_BY_DUE_DATE": "Тўлов муддатигача тўлиқ тўлов келиб тушмаган, шунинг учун жарима шартномага мувофиқ ҳисобланган.",
        "FEE_IN_CONTRACT": "Бу тўлов шартномангизнинг {clause}-бандида кўрсатилган.",
        "nothing_in_period": "Кўрсатилган даврда шикоятингизга мос келадиган ечиб олиш, жарима ёки тўлов топилмади.",
        "questions": "Саволларингиз бўлса, бизга мурожаат қилинг.",
        "NEEDS_INFO": "Мурожаатингизни текшириш учун қўшимча маълумот керак. Илтимос, қайси ой, қайси карта "
                      "ва қанча сумма ҳақида гап кетаётганини ёзиб юборинг.",
        "OUT_OF_SCOPE": "Мурожаатингиз кредит тўловини ечиб олиш, жарима ёки комиссия билан боғлиқ эмас, "
                        "шунинг учун у алоҳида кўриб чиқилади.",
        "sign": f"Ҳурмат билан,\n{BANK}, мурожаатлар билан ишлаш бўлими",
        "LOAN_ISSUANCE": "кредит бериш учун комиссия",
        "CARD_REISSUE": "картани қайта чиқариш учун тўлов",
        "fee": "комиссия",
    },
    "ru": {
        "greeting": "Здравствуйте, {name}!",
        "thanks": "Благодарим вас за обращение № {id} от {date}.",
        "checked": "Мы проверили платежи по кредитному договору {contracts}.",
        "checked_many": "Мы проверили платежи по кредитным договорам {contracts}.",
        "DOUBLE_DEBIT": "За платёж со сроком {due} с вашей карты дважды списали деньги. Излишне списано: {amount}.",
        "EARLY_DEBIT": "{date} с вашей карты списали {amount} на {days} раньше срока платежа.",
        "LATE_POSTING": "Вы внесли платёж вовремя, {paid}, но банк зачислил его только {posted} и начислил штраф {amount}.",
        "ILLEGAL_FEE": "{date} с вас удержали {fee}, которой нет в договоре: {amount}.",
        "more": "Найдено ещё таких случаев: {count}.",
        "return": "Всего вам будет возвращено {amount}.",
        "early_only": "Эти деньги зачтены в погашение кредита. Даты автоматического списания будут исправлены.",
        "sorry": "Приносим извинения за неудобства.",
        "no_mistake": "Проверка не выявила ошибки банка.",
        "ARREARS_COVERED": "Второе списание погасило просроченный платёж за {month}.",
        "RETRY_AFTER_FAILURE": "Первое списание не прошло; успешным было только одно списание.",
        "ALREADY_REVERSED": "Повторно списанная сумма возвращена на вашу карту.",
        "EARLY_REPAYMENT_REQUESTED": "{date} вы подали заявление о досрочном погашении кредита.",
        "PAID_AFTER_DUE_DATE": "Платёж поступил {date}, после срока платежа, поэтому штраф начислен по договору.",
        "NOT_PAID_BY_DUE_DATE": "К сроку платежа полная сумма не поступила, поэтому штраф начислен по договору.",
        "FEE_IN_CONTRACT": "Эта плата предусмотрена пунктом {clause} вашего договора.",
        "nothing_in_period": "За указанный период не найдено списаний, штрафов или комиссий, о которых вы пишете.",
        "questions": "Если у вас остались вопросы, обратитесь к нам.",
        "NEEDS_INFO": "Чтобы проверить обращение, нам нужны уточнения: за какой месяц, с какой карты и какая сумма была списана.",
        "OUT_OF_SCOPE": "Ваше обращение не связано со списанием платежей по кредиту, штрафами или комиссиями, "
                        "поэтому оно будет рассмотрено отдельно.",
        "sign": f"С уважением,\n{BANK}, отдел по работе с обращениями",
        "LOAN_ISSUANCE": "комиссию за выдачу кредита",
        "CARD_REISSUE": "плату за перевыпуск карты",
        "fee": "комиссию",
    },
}
SHOWN_FINDINGS = 3  # more are counted in one sentence


def letter_lang(complaint: schemas.Complaint) -> str:
    """The language of the answer: the complaint's. A mixed text gets the script most of it is in."""
    if complaint.lang in WORDS:
        return complaint.lang
    cyrillic = sum(1 for ch in complaint.text.lower() if "а" <= ch <= "я" or ch in "ўқғҳё")
    latin = sum(1 for ch in complaint.text.lower() if "a" <= ch <= "z")
    return "ru" if cyrillic > latin else "uz_latn"


def money(amount: int, lang: str) -> str:
    return f"{amount:,}".replace(",", NBSP) + f"{NBSP}{CURRENCY[lang]}"


def day(value: date, lang: str) -> str:
    if lang == "uz_latn":
        return f"{value.year}-yil {value.day}-{MONTHS['uz_latn'][value.month - 1]}"
    if lang == "uz_cyrl":
        return f"{value.year} йил {value.day} {MONTHS['uz_cyrl'][value.month - 1]}"
    return f"{value.day} {MONTHS_RU_OF[value.month - 1]} {value.year} года"


def month(value: date, lang: str) -> str:
    name = MONTHS[lang][value.month - 1]
    if lang == "uz_latn":
        return f"{value.year}-yil {name}"
    if lang == "uz_cyrl":
        return f"{value.year} йил {name}"
    return f"{name} {value.year} года"


def days_ru(number: int) -> str:
    """1 день, 2 дня, 5 дней, 21 день."""
    if number % 10 == 1 and number % 100 != 11:
        return f"{number} день"
    if number % 10 in (2, 3, 4) and number % 100 not in (12, 13, 14):
        return f"{number} дня"
    return f"{number} дней"


def _finding(finding: schemas.Finding, lang: str) -> str:
    words, evidence = WORDS[lang], finding.evidence
    kept = [debit for debit in evidence.debits if debit.status == "SUCCESS" and not debit.reversed_by]
    if finding.type == "DOUBLE_DEBIT":
        due = evidence.schedule_rows[-1].due_date if evidence.schedule_rows else evidence.debits[0].created_at.date()
        return words["DOUBLE_DEBIT"].format(due=day(due, lang), amount=money(finding.amount_excess, lang))
    if finding.type == "EARLY_DEBIT":
        taken = (kept or evidence.debits)[0].created_at.date()
        days = finding.days_early or 0
        return words["EARLY_DEBIT"].format(
            date=day(taken, lang), amount=money(finding.amount_affected, lang), days=days_ru(days) if lang == "ru" else days,
        )
    if finding.type == "LATE_POSTING":
        paid = max(payment.paid_at for payment in evidence.payments).date()
        posted = max(payment.posted_at for payment in evidence.payments).date()
        return words["LATE_POSTING"].format(paid=day(paid, lang), posted=day(posted, lang), amount=money(finding.amount_excess, lang))
    charge = evidence.charges[0]
    return words["ILLEGAL_FEE"].format(
        date=day(charge.charged_at.date(), lang), fee=words.get(charge.code, words["fee"]), amount=money(finding.amount_excess, lang),
    )


def _cleared(item: schemas.Cleared, case: schemas.CaseResult, lang: str) -> str:
    words, evidence = WORDS[lang], item.evidence
    if item.reason == "ARREARS_COVERED":
        return words["ARREARS_COVERED"].format(month=month(evidence.schedule_rows[0].due_date, lang))
    if item.reason == "EARLY_REPAYMENT_REQUESTED":
        asked = next(t.early_repayment_requested_on for t in case.timelines if t.contract_id == item.contract_id)
        return words["EARLY_REPAYMENT_REQUESTED"].format(date=day(asked, lang))
    if item.reason == "PAID_AFTER_DUE_DATE":
        if not evidence.payments:
            return words["NOT_PAID_BY_DUE_DATE"]
        return words["PAID_AFTER_DUE_DATE"].format(date=day(max(p.paid_at for p in evidence.payments).date(), lang))
    if item.reason == "FEE_IN_CONTRACT":
        clause = evidence.contract_clauses[0].clause if evidence.contract_clauses else "3.1"
        return words["FEE_IN_CONTRACT"].format(clause=clause)
    return words[item.reason]


def reply(case: schemas.CaseResult) -> schemas.DraftReply:
    """The template letter for a checked complaint."""
    lang = letter_lang(case.complaint)
    words = WORDS[lang]
    contracts = sorted({f.contract_id for f in case.findings} or {c.contract_id for c in case.cleared}
                       or {t.contract_id for t in case.timelines})
    parts = [words["greeting"].format(name=case.complaint.customer_name)]
    intro = words["thanks"].format(date=day(case.complaint.created_at.date(), lang), id=case.complaint.complaint_id)
    if contracts:
        checked = words["checked_many"] if len(contracts) > 1 and "checked_many" in words else words["checked"]
        intro += " " + checked.format(contracts=", ".join(contracts))
    parts.append(intro)

    if case.verdict == "SUPPORTED":
        body = [_finding(finding, lang) for finding in case.findings[:SHOWN_FINDINGS]]
        if len(case.findings) > SHOWN_FINDINGS:
            body.append(words["more"].format(count=len(case.findings) - SHOWN_FINDINGS))
        if case.total_excess:
            body.append(words["return"].format(amount=money(case.total_excess, lang)))
        else:
            body.append(words["early_only"])
        parts += [" ".join(body), words["sorry"]]
    elif case.verdict == "NOT_SUPPORTED":
        same = [item for item in case.cleared if item.type == case.understood.claim_type]
        reason = _cleared(same[0], case, lang) if same else words["nothing_in_period"]
        parts += [f"{words['no_mistake']} {reason}", words["questions"]]
    else:
        parts.append(words[case.verdict])
    parts.append(words["sign"])
    return schemas.DraftReply(lang=lang, text="\n\n".join(parts), source="template")


# --- "Improve wording": the local model rewords, code checks ---------------

_NUMBER = re.compile(r"\d+(?:[  ]\d{3})*")
_PROMPT = (
    "You reword a bank's letter to a customer so it reads warmly and clearly. Write in the same language and "
    "script as the letter. Keep every number, date, amount, contract number and clause number exactly as written. "
    "Add no fact, promise, deadline, law, number or amount. Answer with JSON: {\"text\": \"the letter\"}."
)


class _Reworded(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str


def numbers(text: str) -> set[int]:
    """Every number written in digits, and every amount written in words."""
    found = {int(re.sub(r"\D", "", match)) for match in _NUMBER.findall(text)}
    return found | {amount.value for amount in find_amounts(text)}


def passes_check(template: schemas.DraftReply, text: str) -> bool:
    """Same language, and exactly the numbers of the template."""
    return bool(text.strip()) and detect_lang(text) == template.lang and numbers(text) == numbers(template.text)


def improve(template: schemas.DraftReply) -> schemas.DraftReply:
    """The reworded letter if the local model gave one that passes the check, else the template."""
    try:
        raw = llm.ask_json(_PROMPT, template.text, _Reworded.model_json_schema(), llm.TIME_LIMIT, max_tokens=900)
        text = _Reworded.model_validate(raw).text
    except (llm.LlmUnavailable, ValidationError):
        return template
    if not passes_check(template, text):
        return template
    return schemas.DraftReply(lang=template.lang, text=text.strip(), source="llm")
