"""Generated complaints in 4 language variants. Task A6.

The Sandbox Bank writes a complaint for about 15% of the customers it wronged
(the rest stay silent), for every look-alike case chosen as a trap, and a few
that are not about a payment at all. Texts come from templates in Uzbek Latin,
Uzbek Cyrillic, Russian and a mix, with typos and many ways to write an amount.

These texts are machine-made. They are not the hand-written test set, and a
score on them says little about real customers.
"""

import sqlite3
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from random import Random

from .contracts import AUTO, Contract
from .defects import DOUBLE_DEBIT, EARLY_DEBIT, ILLEGAL_FEE, LATE_POSTING, TYPES, TruthRow
from .events import Events, next_business_day

BANK_DB = "bank.db"
OTHER = "OTHER"
LANGS = ("uz_latn", "uz_cyrl", "ru", "mixed")
CHANNELS = (("APP", 45), ("CALL_CENTER", 25), ("BRANCH", 15), ("WEB", 15))
VICTIM, TRAP, UNRELATED = "VICTIM", "TRAP", "OTHER"
EXPECTED = {VICTIM: "SUPPORTED", TRAP: "NOT_SUPPORTED", UNRELATED: "OUT_OF_SCOPE"}

# One answer-key row for a complaint:
# (complaint_id, kind, claim_type, contract_id, installment_n, expected_verdict, also_planted).
KeyRow = tuple[str, str, str, str | None, int | None, str, int]


@dataclass(frozen=True)
class Facts:
    """What the customer saw, as the words of a complaint need it."""

    amount: int  # the monthly payment
    due_day: int
    on: date  # the day of the debit, the payment or the fee
    days_early: int = 0
    penalty: int = 0
    fee: int = 0
    channel: str = "PAYNET"
    card: str = "HUMO"


# --- Words -----------------------------------------------------------------

MONTHS = {
    "uz_latn": ("yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"),
    "uz_cyrl": ("январ", "феврал", "март", "апрел", "май", "июн", "июл", "август", "сентябр", "октябр", "ноябр", "декабр"),
    "ru": ("январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"),
}
MONTHS_RU_IN = ("январе", "феврале", "марте", "апреле", "мае", "июне", "июле", "августе", "сентябре", "октябре", "ноябре", "декабре")
MONTHS_RU_OF = ("января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря")

CHANNEL_WORDS = {
    "uz_latn": {"PAYNET": "Paynet", "CLICK": "Click", "APP": "mobil ilova", "BRANCH": "bank kassasi", AUTO: "karta"},
    "uz_cyrl": {"PAYNET": "Paynet", "CLICK": "Click", "APP": "мобил илова", "BRANCH": "банк кассаси", AUTO: "карта"},
    "ru": {"PAYNET": "Paynet", "CLICK": "Click", "APP": "приложение", "BRANCH": "кассу банка", AUTO: "карту"},
}

GREETINGS = {
    "uz_latn": ("Assalomu alaykum. ", "Salom. ", "Hurmatli bank! "),
    "uz_cyrl": ("Ассалому алайкум. ", "Салом. ", "Ҳурматли банк! "),
    "ru": ("Здравствуйте. ", "Добрый день. ", "Уважаемый банк! "),
    "mixed": ("Здравствуйте. ", "Assalomu alaykum. ", "Добрый день. "),
}
ASKS = {  # after a complaint about money
    "uz_latn": (" Iltimos, tekshirib bering.", " Pulimni qaytaring.", " Javobingizni kutaman.", " Bu qanaqasi?"),
    "uz_cyrl": (" Илтимос, текшириб беринг.", " Пулимни қайтаринг.", " Жавобингизни кутаман.", " Бу қанақаси?"),
    "ru": (" Прошу разобраться.", " Верните деньги.", " Жду ответа.", " Как это понимать?"),
    "mixed": (" Iltimos, разберитесь.", " Pulimni qaytaring.", " Жду ответа.", " Nega shunday?"),
}
THANKS = {  # after a request that is not a complaint about money
    "uz_latn": (" Oldindan rahmat.", " Javobingizni kutaman."),
    "uz_cyrl": (" Олдиндан раҳмат.", " Жавобингизни кутаман."),
    "ru": (" Заранее спасибо.", " Жду ответа."),
    "mixed": (" Заранее rahmat.", " Javob kutaman."),
}

# Slots: {amount} {double} {month} {month_in} {date} {due_day} {days} {penalty} {fee} {channel} {card}.
# A template that names a month or a date tells the reader the period; the others do not.
BODIES: dict[str, dict[str, tuple[str, ...]]] = {
    DOUBLE_DEBIT: {
        "uz_latn": (
            "{month} oyida kredit toʻlovi kartamdan ikki marta yechildi, har biri {amount}.",
            "Oylik toʻlovim {amount} edi, kartamdan {double} yechib olishdi.",
            "{date} kuni kartamdan bir xil summa, {amount}, ikki marta yechilgan.",
            "Kredit uchun pulni ikki marta ushlab qolishdi. Ortiqchasini qaytaring.",
            "Bir oylik toʻlov uchun ikkita kartamdan ham pul yechildi.",
            "{month} oyi toʻlovi takror yechib olindi, {amount} ortiqcha ketdi.",
            "{card} kartamdan toʻlov yechilgandan keyin boshqa kartamdan ham yana {amount} yechildi.",
        ),
        "uz_cyrl": (
            "{month} ойида кредит тўлови картамдан икки марта ечилди, ҳар бири {amount}.",
            "Ойлик тўловим {amount} эди, картамдан {double} ечиб олишди.",
            "{date} куни картамдан бир хил сумма, {amount}, икки марта ечилган.",
            "Кредит учун пулни икки марта ушлаб қолишди. Ортиқчасини қайтаринг.",
            "Бир ойлик тўлов учун иккита картамдан ҳам пул ечилди.",
            "{month} ойи тўлови такрор ечиб олинди, {amount} ортиқча кетди.",
        ),
        "ru": (
            "В {month_in} с карты дважды списали платёж по кредиту, по {amount}.",
            "Ежемесячный платёж {amount}, а списали {double}.",
            "{date} с моих карт два раза сняли одну и ту же сумму, {amount}.",
            "За кредит деньги списали дважды. Верните лишнее.",
            "За один месяц платёж сняли с обеих карт.",
            "Платёж за {month} списан повторно, {amount} ушло лишних.",
            "После списания с карты {card} со второй карты сняли ещё {amount}.",
        ),
        "mixed": (
            "{month} oyida kartamdan 2 marta pul yechildi, по {amount}.",
            "Oylik toʻlov {amount}, а списали {double}. Nega?",
            "{date} kuni платёж ikki marta yechildi, {amount}dan.",
            "Kredit uchun дважды списали, ortiqcha pulni qaytaring.",
            "Ikkita kartamdan ham pul yechildi за один платёж.",
        ),
    },
    EARLY_DEBIT: {
        "uz_latn": (
            "Toʻlov sanasi {due_day}-chi, lekin pulni {date} kuni, muddatidan oldin yechib olishdi.",
            "Grafik boʻyicha toʻlov {due_day}-sanada, pul esa {days} kun oldin yechildi. Nega?",
            "{month} oyida kredit puli kartamdan muddatidan avval yechib olindi.",
            "Toʻlov kuni hali kelmagan edi, kartamdan {amount} yechib olishdi.",
            "Pulni belgilangan sanadan ertaroq yechib olishdi, men bunga tayyor emas edim.",
        ),
        "uz_cyrl": (
            "Тўлов санаси {due_day}-чи, лекин пулни {date} куни, муддатидан олдин ечиб олишди.",
            "График бўйича тўлов {due_day}-санада, пул эса {days} кун олдин ечилди. Нега?",
            "{month} ойида кредит пули картамдан муддатидан аввал ечиб олинди.",
            "Тўлов куни ҳали келмаган эди, картамдан {amount} ечиб олишди.",
            "Пулни белгиланган санадан эртароқ ечиб олишди, мен бунга тайёр эмас эдим.",
        ),
        "ru": (
            "Платёж по графику {due_day} числа, а деньги списали {date}. Почему раньше срока?",
            "Деньги по кредиту сняли на {days} дн. раньше даты платежа.",
            "В {month_in} платёж по кредиту списали с карты раньше срока.",
            "День платежа ещё не наступил, а с карты уже списали {amount}.",
            "Списали платёж заранее, до даты по графику. Я к этому не был готов.",
        ),
        "mixed": (
            "Toʻlov sanasi {due_day}-chi, а списали {date}. Почему раньше срока?",
            "Pulni {days} kun oldin yechib olishdi, по графику hali vaqt bor edi.",
            "{month} oyida платёж muddatidan oldin yechildi.",
            "Kartamdan {amount} раньше срока списали, toʻlov kuni kelmagan edi.",
        ),
    },
    LATE_POSTING: {
        "uz_latn": (
            "Kredit toʻlovini {date} kuni {channel} orqali toʻlaganman, lekin menga {penalty} jarima hisoblashibdi. Nima uchun?",
            "{month} oyi toʻlovini oʻz vaqtida toʻladim, baribir {penalty} penya yozishibdi.",
            "Toʻlovni kechiktirmaganman, {channel} orqali vaqtida toʻlaganman. Nega jarima?",
            "Oʻz vaqtida toʻlagan boʻlsam ham, kechikkan deb jarima solishdi.",
            "{due_day}-sanada toʻlov qildim, chek bor. Penyani bekor qiling.",
        ),
        "uz_cyrl": (
            "Кредит тўловини {date} куни {channel} орқали тўлаганман, лекин менга {penalty} жарима ҳисоблашибди. Нима учун?",
            "{month} ойи тўловини ўз вақтида тўладим, барибир {penalty} пеня ёзишибди.",
            "Тўловни кечиктирмаганман, {channel} орқали вақтида тўлаганман. Нега жарима?",
            "Ўз вақтида тўлаган бўлсам ҳам, кечиккан деб жарима солишди.",
            "{due_day}-санада тўлов қилдим, чек бор. Пеняни бекор қилинг.",
        ),
        "ru": (
            "Оплатил через {channel} в день платежа, {date}, а мне начислили пеню {penalty} за просрочку.",
            "Платёж за {month} внёс вовремя, но всё равно начислили штраф {penalty}.",
            "Я не допускал просрочки, платил через {channel} в срок. Откуда пеня?",
            "Заплатил вовремя, а банк считает, что с опозданием, и начислил штраф.",
            "{due_day} числа внёс платёж, чек есть. Отмените пеню.",
        ),
        "mixed": (
            "Toʻlovni vaqtida toʻladim через {channel}, но всё равно штраф {penalty} yozildi.",
            "{date} kuni {channel} orqali toʻladim, а мне начислили пеню. Nega?",
            "Kechiktirmaganman, оплатил в срок, jarimani olib tashlang.",
            "{month} oyi toʻlovi вовремя toʻlangan, penya {penalty} нима uchun?",
        ),
    },
    ILLEGAL_FEE: {
        "uz_latn": (
            "Kredit olganimda {fee} xizmat haqi olishdi, shartnomada koʻrsatilmagan. Qaytarib bering.",
            "Kreditni rasmiylashtirishda {fee} komissiya ushlab qolishdi, shartnomada bunaqa narsa yoʻq edi.",
            "Kredit ajratish uchun {fee} haq olishgan. Bu notoʻgʻri, qaytaring.",
        ),
        "uz_cyrl": (
            "Кредит олганимда {fee} хизмат ҳақи олишди, шартномада кўрсатилмаган. Қайтариб беринг.",
            "Кредитни расмийлаштиришда {fee} комиссия ушлаб қолишди, шартномада бунақа нарса йўқ эди.",
            "Кредит ажратиш учун {fee} ҳақ олишган. Бу нотўғри, қайтаринг.",
        ),
        "ru": (
            "При выдаче кредита удержали комиссию {fee}, в договоре её нет. Верните.",
            "За оформление кредита взяли {fee}. В договоре такой платы не было.",
            "При получении кредита с меня взяли сбор за выдачу, {fee}. Так нельзя.",
        ),
        "mixed": (
            "Kredit olganimda {fee} комиссия ushlab qolishdi, shartnomada bunaqa narsa yoʻq edi.",
            "При выдаче кредита {fee} xizmat haqi olishdi, в договоре этого нет.",
        ),
    },
}
# A fee complaint that does not say the fee came with the loan. A trap uses only these.
FEE_ANY = {
    "uz_latn": (
        "Mendan {fee} komissiya ushlab qolishdi, shartnomada bunaqa toʻlov yoʻq.",
        "Hisobimdan {fee} qoʻshimcha haq yechilgan. Men bunga rozilik bermaganman.",
        "Qandaydir xizmat haqi olishibdi, {fee}. Nima uchun?",
    ),
    "uz_cyrl": (
        "Мендан {fee} комиссия ушлаб қолишди, шартномада бунақа тўлов йўқ.",
        "Ҳисобимдан {fee} қўшимча ҳақ ечилган. Мен бунга розилик бермаганман.",
        "Қандайдир хизмат ҳақи олишибди, {fee}. Нима учун?",
    ),
    "ru": (
        "С меня удержали комиссию {fee}, в договоре такого платежа нет.",
        "Со счёта списали дополнительный сбор {fee}. Я на это согласия не давал.",
        "Взяли какую-то плату за услуги, {fee}. За что?",
    ),
    "mixed": (
        "Mendan {fee} комиссия olishdi, shartnomada yoʻq. Верните.",
        "Hisobimdan дополнительный сбор {fee} yechildi, nega?",
    ),
}
UNRELATED_BODIES = {
    "uz_latn": (
        "Menga kredit boʻyicha qarzdorlik yoʻqligi haqida maʼlumotnoma kerak.",
        "Kredit qoldigʻini bilmoqchiman.",
        "Toʻlov sanasini oʻzgartirmoqchiman, qanday qilsam boʻladi?",
        "Telefon raqamim oʻzgardi, yangilab qoʻying.",
        "Kreditni muddatidan oldin yopmoqchiman, qancha toʻlashim kerak?",
        "Ilovaga kira olmayapman, parolni tiklab bering.",
        "Kredit bilan birga sugʻurta polisini majburan sotishdi, bekor qilmoqchiman.",
        "Filial xodimi qoʻpol muomala qildi.",
    ),
    "uz_cyrl": (
        "Менга кредит бўйича қарздорлик йўқлиги ҳақида маълумотнома керак.",
        "Кредит қолдиғини билмоқчиман.",
        "Тўлов санасини ўзгартирмоқчиман, қандай қилсам бўлади?",
        "Телефон рақамим ўзгарди, янгилаб қўйинг.",
        "Кредитни муддатидан олдин ёпмоқчиман, қанча тўлашим керак?",
        "Иловага кира олмаяпман, паролни тиклаб беринг.",
        "Филиал ходими қўпол муомала қилди.",
    ),
    "ru": (
        "Мне нужна справка об отсутствии задолженности по кредиту.",
        "Хочу узнать остаток по кредиту.",
        "Хочу изменить дату платежа, как это сделать?",
        "У меня сменился номер телефона, обновите данные.",
        "Хочу закрыть кредит досрочно, сколько нужно внести?",
        "Не могу войти в приложение, восстановите пароль.",
        "Вместе с кредитом навязали страховой полис, хочу отказаться.",
        "Сотрудник филиала нагрубил мне.",
    ),
    "mixed": (
        "Menga справка kerak, kredit boʻyicha qarzim yoʻqligi haqida.",
        "Kredit qoldigʻini bilmoqchiman, остаток qancha?",
        "Приложение ochilmayapti, parolni tiklab bering.",
        "Дату платежа oʻzgartirmoqchiman.",
    ),
}


# --- Amounts, dates, typos ---------------------------------------------------


def _spaced(amount: int) -> str:
    return f"{amount:,}".replace(",", " ")


def write_amount(rng: Random, amount: int, lang: str) -> str:
    """One of the many ways a customer writes a sum of money."""
    cyrillic = lang in ("uz_cyrl", "ru") or (lang == "mixed" and rng.random() < 0.5)
    unit = ("сум" if lang == "ru" or lang == "mixed" else "сўм") if cyrillic else rng.choice(("soʻm", "so'm", "sum"))
    ways = [f"{_spaced(amount)} {unit}", f"{_spaced(amount)} {unit}", f"{amount} {unit}", _spaced(amount)]
    if amount % 1000 == 0 and amount < 1_000_000_000:
        thousand = ("тыс" if lang in ("ru", "mixed") else "минг") if cyrillic else "ming"
        ways += [f"{_spaced(amount // 1000)} {thousand}", f"{amount // 1000} {thousand} {unit}"]
    if amount == 500_000:
        ways.append(("пол миллиона" if lang in ("ru", "mixed") else "ярим миллион") if cyrillic else "yarim million")
    if amount % 100_000 == 0 and amount >= 1_000_000:
        whole, tenth = divmod(amount // 100_000, 10)
        number = f"{whole},{tenth}" if tenth else str(whole)
        ways += [f"{number} {'млн' if cyrillic else 'mln'}", f"{number} {'млн' if cyrillic else 'mln'} {unit}"]
    return rng.choice(ways)


def write_date(rng: Random, day: date, lang: str) -> str:
    if rng.random() < 0.25:
        return f"{day.day:02d}.{day.month:02d}.{day.year}"
    if lang == "ru":
        return f"{day.day} {MONTHS_RU_OF[day.month - 1]}"
    script = "uz_cyrl" if lang == "uz_cyrl" else "uz_latn"
    return f"{day.day}-{MONTHS[script][day.month - 1]}"


def _typos(rng: Random, text: str) -> str:
    """One or two slips of the finger, in words only."""
    words = text.split(" ")
    for _ in range(rng.randrange(1, 3)):
        places = [i for i, word in enumerate(words) if len(word) > 4 and word.isalpha()]
        if not places:
            break
        i = rng.choice(places)
        word, at = words[i], rng.randrange(1, len(words[i]) - 1)
        slip = rng.randrange(3)
        if slip == 0:
            word = word[:at] + word[at + 1:]  # a letter is missing
        elif slip == 1:
            word = word[:at] + word[at + 1] + word[at] + word[at + 2:]  # two letters change places
        else:
            word = word[:at] + word[at] + word[at:]  # a letter twice
        words[i] = word
    return " ".join(words)


def write(rng: Random, claim_type: str, lang: str, facts: Facts, any_fee: bool = False) -> str:
    """One complaint text."""
    return compose(rng, claim_type, lang, facts, any_fee)[0]


def compose(rng: Random, claim_type: str, lang: str, facts: Facts, any_fee: bool = False) -> tuple[str, str]:
    """One complaint text, and the template its main sentence came from."""
    if claim_type == OTHER:
        bodies = UNRELATED_BODIES[lang]
    elif claim_type == ILLEGAL_FEE:
        bodies = FEE_ANY[lang] if any_fee else BODIES[ILLEGAL_FEE][lang] + FEE_ANY[lang]
    else:
        bodies = BODIES[claim_type][lang]
    words = lang if lang != "mixed" else "uz_latn"
    month = facts.on.month - 1
    body = rng.choice(bodies)
    text = body.format(
        amount=write_amount(rng, facts.amount, lang),
        double=write_amount(rng, facts.amount * 2, lang),
        penalty=write_amount(rng, facts.penalty, lang),
        fee=write_amount(rng, facts.fee, lang),
        month=MONTHS[words][month],
        month_in=MONTHS_RU_IN[month],
        date=write_date(rng, facts.on, lang),
        due_day=facts.due_day,
        days=facts.days_early,
        channel=CHANNEL_WORDS[words][facts.channel],
        card=facts.card,
    )
    text = text[0].upper() + text[1:]
    if rng.random() < 0.35:
        text = rng.choice(GREETINGS[lang]) + text
    if rng.random() < 0.4:
        text += rng.choice(THANKS[lang] if claim_type == OTHER else ASKS[lang])

    # How people really type: other apostrophes or none, no capitals, a typo.
    mark = rng.choice(("ʻ", "ʻ", "'", "'", "`", ""))
    text = text.replace("ʻ", mark).replace("ʼ", mark)
    if rng.random() < 0.25:
        text = _typos(rng, text)
    if rng.random() < 0.15:
        text = text.lower()
    if rng.random() < 0.2:
        text = text.rstrip(".")
    return text, body


def sample(rng: Random, count: int, as_of: date) -> list[tuple[str, str, str, str]]:
    """`count` labelled texts with invented facts: (text, claim_type, lang, template). For
    training the classifier; no demo bank is needed."""
    labels = TYPES + (OTHER,)
    rows = []
    for number in range(count):
        claim_type = labels[number % len(labels)]
        lang = LANGS[rng.randrange(len(LANGS))]
        amount = rng.randrange(150, 6000) * 1000
        facts = Facts(
            amount=amount,
            due_day=rng.choice((5, 10, 15, 20, 25)),
            on=as_of - timedelta(days=rng.randrange(1, 400)),
            days_early=rng.randrange(2, 13),
            penalty=amount * rng.randrange(1, 16) // 1000,
            fee=max(25_000, amount // 10 // 1000 * 1000),
            channel=rng.choice(("PAYNET", "PAYNET", "CLICK", "APP", "BRANCH", AUTO)),
            card=rng.choice(("HUMO", "UZCARD")),
        )
        any_fee = claim_type == ILLEGAL_FEE and rng.random() < 0.3
        text, body = compose(rng, claim_type, lang, facts, any_fee)
        rows.append((text, claim_type, lang, body))
    return rows


# --- The complaints of one demo bank ----------------------------------------


def make_complaints(contracts: list[Contract], events: Events, traps: list[TruthRow], rng: Random,
                    as_of: date, complaint_rate: float) -> tuple[list[tuple], list[KeyRow]]:
    """The rows of the bank's `complaints` table, and their answer key."""
    by_id = {c.id: c for c in contracts}
    penalty_of: dict[tuple[str, int | None], tuple[int, str]] = {}
    fee_of: dict[tuple[str, str], tuple[int, str]] = {}
    for _, contract_id, kind, code, amount, when, n in events.charges:
        if kind == "PENALTY":
            penalty_of[(contract_id, n)] = (amount, when)
        else:
            fee_of[(contract_id, code)] = (amount, when)

    # One complaint per wronged contract and mistake type, about its latest installment.
    victims: dict[tuple[str, str], int | None] = {}
    for kind, contract_id, n, *_ in events.planted:
        victims[(kind, contract_id)] = n
    wronged = {by_id[contract_id].customer.id for _, contract_id in victims}

    def facts_for(kind: str, c: Contract, n: int | None, trap: bool) -> Facts:
        primary = c.customer.cards[0][1]
        if kind == ILLEGAL_FEE:
            amount, when = fee_of[(c.id, "CARD_REISSUE" if trap else "LOAN_ISSUANCE")]
            return Facts(c.monthly_payment, c.due_day, date.fromisoformat(when[:10]), fee=amount, card=primary)
        _, due, _, _, total = c.schedule[n - 1]
        if kind == EARLY_DEBIT:
            taken = c.early_debit_day if trap else c.schedule_v1[n - 1][1]
            return Facts(total, due.day, taken, days_early=(due - taken).days, card=primary)
        if kind == LATE_POSTING:
            amount, when = penalty_of[(c.id, n)]
            return Facts(total, due.day, due, penalty=amount, channel=c.mode, card=primary)
        return Facts(total, due.day, due, card=primary)

    def seen_on(kind: str, c: Contract, n: int | None, facts: Facts) -> date:
        """The day the customer could first notice it."""
        if kind == LATE_POSTING:
            return max(date.fromisoformat(penalty_of[(c.id, n)][1][:10]), next_business_day(facts.on))
        return facts.on

    drafts: list[tuple[date, str, Contract | None, str, int | None, str]] = []  # (noticed, kind, ...)
    for (kind, contract_id), n in victims.items():
        if rng.random() < complaint_rate:
            c = by_id[contract_id]
            facts = facts_for(kind, c, n, trap=False)
            text = write(rng, kind, c.customer.preferred_lang, facts)
            drafts.append((seen_on(kind, c, n, facts), VICTIM, c, kind, n, text))
    for kind, contract_id, n, *_ in traps:
        c = by_id[contract_id]
        facts = facts_for(kind, c, n, trap=True)
        text = write(rng, kind, c.customer.preferred_lang, facts, any_fee=True)
        drafts.append((seen_on(kind, c, n, facts), TRAP, c, kind, n, text))
    # A few requests that are not about a payment, from customers who were not wronged.
    calm = [c for c in contracts if c.customer.id not in wronged]
    for c in rng.sample(calm, min(len(calm), max(3, len(drafts) // 20))):
        text = write(rng, OTHER, c.customer.preferred_lang, Facts(c.monthly_payment, c.due_day, as_of))
        drafts.append((as_of - timedelta(days=rng.randrange(1, 60)), UNRELATED, c, OTHER, None, text))

    written = []
    for noticed, kind, c, claim_type, n, text in drafts:
        day = min(as_of, noticed + timedelta(days=rng.randrange(1, 10)))
        when = f"{day.isoformat()}T{rng.randrange(8, 21):02d}:{rng.randrange(60):02d}:00"
        channel = rng.choices([name for name, _ in CHANNELS], [weight for _, weight in CHANNELS])[0]
        written.append((when, kind, c, claim_type, n, text, channel))
    written.sort(key=lambda row: (row[0], row[2].id, row[3]))

    rows, key = [], []
    for number, (when, kind, c, claim_type, n, text, channel) in enumerate(written, start=1):
        complaint_id = f"C-{number:04d}"
        lang = c.customer.preferred_lang
        rows.append((complaint_id, c.customer.id, c.id, text, lang, channel, when, "GENERATED", "NEW"))
        also_planted = int(kind != VICTIM and c.customer.id in wronged)
        key.append((complaint_id, kind, claim_type, c.id, n, EXPECTED[kind], also_planted))
    return rows, key


# --- A complaint written by a person in the Sandbox Bank ---------------------


def add_complaint(world_dir: Path, customer_id: str, text: str, lang: str) -> str | None:
    """Stores a complaint typed in "A customer's phone" and returns its id, or None
    when the bank has no such customer. It is dated with the world date (PLAN Part 6)."""
    bank = sqlite3.connect(Path(world_dir) / BANK_DB)
    try:
        with bank:
            if not bank.execute("SELECT 1 FROM customers WHERE id = ?", (customer_id,)).fetchone():
                return None
            (as_of,) = bank.execute("SELECT as_of_date FROM world").fetchone()
            (total,) = bank.execute("SELECT count(*) FROM complaints").fetchone()
            (typed,) = bank.execute("SELECT count(*) FROM complaints WHERE source = 'JURY'").fetchone()
            complaint_id = f"C-{total + 1:04d}"
            # No clock: the n-th typed complaint arrives n minutes after 21:00 on the world date,
            # after every generated one.
            when = f"{as_of}T{21 + typed // 60 % 3:02d}:{typed % 60:02d}:00"
            bank.execute(
                "INSERT INTO complaints VALUES (?, ?, NULL, ?, ?, 'WEB', ?, 'JURY', 'NEW')",
                (complaint_id, customer_id, text, lang, when),
            )
        return complaint_id
    finally:
        bank.close()
