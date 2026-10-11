"""Fix library: a mistake type and the attribute it is concentrated in, to a suggested fix
(PLAN Part 7.5). Task A8.

These are suggestions for a person to edit in the action plan, never decisions.
"""

from .checkers import double_debit, early_debit, illegal_fee, late_posting
from .wording import Said

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


FIXES_UZ = {
    (double_debit.TYPE, "batch_run"): (
        "Hisob-kitob jarayoni boshqa kartadan qayta urinishdan oldin birinchi yechimning yakuniy holatini tekshirsin. "
        "Har bir toʻlovga noyob kalit (idempotency key) bering, shunda bitta jarayon uni faqat bir marta yechadi."
    ),
    (double_debit.TYPE, "cards"): (
        "Ikki va undan ortiq kartasi bor mijozlarda keyingi kartadan faqat birinchi kartadagi yechim yakuniy "
        "rad etilgandan keyin urinib koʻring, u hali kutilayotgan paytda hech qachon."
    ),
    (early_debit.TYPE, "schedule"): (
        "Toʻlov jadvali oʻzgarganda avtomatik yechish rejasini yangi jadval asosida qayta tuzing. Mijoz muddatidan "
        "oldin toʻlashni soʻramagan boʻlsa, toʻlov muddatidan oldingi har qanday avtomatik yechimni toʻxtating."
    ),
    (early_debit.TYPE, "batch_run"): (
        "Ushbu hisob-kitob jarayonining yechish sanalarini u ishga tushishidan oldin amaldagi jadval bilan solishtiring."
    ),
    (late_posting.TYPE, "channel"): (
        "Bu kanaldan kelgan toʻlovlarni bank faylni qayta ishlagan kun bilan emas, mijoz toʻlagan kun bilan qayd eting. "
        "Kanalning toʻlov kunidagi toʻlovlari qayd etilmaguncha jarima hisoblamang."
    ),
    (illegal_fee.TYPE, "tariff"): (
        "Bu komissiyani yangi tarifdan olib tashlang va uni toʻlagan har bir mijozga qaytaring. Har bir tarif "
        "oʻzgarishini ishga tushirishdan oldin shartnoma matni va qonun bilan solishtiring."
    ),
    (illegal_fee.TYPE, "product"): (
        "Bu mahsulotda ushbu komissiyani olishni toʻxtating va uni toʻlagan har bir mijozga qaytaring. Mahsulot "
        "komissiyalari roʻyxatini uning shartnoma namunasi bilan solishtiring."
    ),
}
FIXES_RU = {
    (double_debit.TYPE, "batch_run"): (
        "Прежде чем прогон списаний повторит попытку с другой карты, проверяйте окончательный статус первого "
        "списания. Присвойте каждому платежу ключ идемпотентности, чтобы один прогон мог списать его только раз."
    ),
    (double_debit.TYPE, "cards"): (
        "У клиентов с двумя и более картами пробуйте следующую карту только после окончательного отказа по первой, "
        "но никогда, пока списание по ней ещё в обработке."
    ),
    (early_debit.TYPE, "schedule"): (
        "При изменении графика платежей перестраивайте план автосписаний по новому графику. Блокируйте любое "
        "автосписание до срока, если клиент не просил о досрочном погашении."
    ),
    (early_debit.TYPE, "batch_run"): (
        "Перед запуском этого прогона сверяйте даты списаний с действующим графиком."
    ),
    (late_posting.TYPE, "channel"): (
        "Зачисляйте платежи из этого канала датой оплаты клиентом, а не датой обработки файла банком. Не начисляйте "
        "штраф, пока платежи канала за дату срока не зачислены."
    ),
    (illegal_fee.TYPE, "tariff"): (
        "Уберите эту комиссию из нового тарифа и верните её каждому клиенту, который её заплатил. Проверяйте каждое "
        "изменение тарифа на соответствие договору и закону до запуска."
    ),
    (illegal_fee.TYPE, "product"): (
        "Прекратите взимать эту комиссию по этому продукту и верните её каждому клиенту, который её заплатил. "
        "Сверьте список комиссий продукта с шаблоном его договора."
    ),
}


def fix_for(finding_type: str, attributes: list[str]) -> str | None:
    """The fix for the strongest attribute that has one, or None."""
    for name in attributes:
        key = (finding_type, name)
        if key in FIXES:
            return Said(FIXES[key], FIXES_UZ[key], FIXES_RU[key])
    return None
