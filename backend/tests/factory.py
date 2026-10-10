"""Builds one loan by hand for engine tests. Fake data only."""

from datetime import date, datetime

from app.connector import SUCCESS, Card, Charge, Contract, ContractData, Debit, Installment, Payment
from app.engine import timeline


class Loan:
    """A loan with a payment of 500 000 soʻm due on the 25th of July, August and September 2026."""

    def __init__(self, payment: int = 500_000, due: tuple[str, ...] = ("2026-07-25", "2026-08-25", "2026-09-25"),
                 first_n: int = 6, **contract: object) -> None:
        fields = {
            "id": "L-1", "customer_id": "CU-1", "product_code": "CONS", "product_name": "Consumer loan",
            "branch": "TSH-01", "principal": 5_000_000, "term_months": 12, "start_date": date(2026, 1, 25),
            "due_day": 25, "schedule_version": 1, "schedule_changed_on": None,
            "early_repayment_requested_on": None, "tariff_version": 1, "allowed_fees": ("CARD_REISSUE",),
        } | contract
        self.data = ContractData(
            Contract(**fields),
            schedule=[
                Installment("L-1", 1, first_n + k, date.fromisoformat(day), payment - 72_000, 72_000, payment)
                for k, day in enumerate(due)
            ],
            cards={"CD-1": Card("CD-1", "HUMO", "4471", True), "CD-2": Card("CD-2", "UZCARD", "9038", False)},
        )
        self.payment = payment

    def take(self, when: str, amount: int | None = None, card: str = "CD-1", status: str = SUCCESS,
             run: str | None = "night", retry_of: Debit | None = None, returned: str | None = None) -> Debit:
        """An automatic debit. A successful one that was not returned also pays the loan."""
        moment = datetime.fromisoformat(when)
        debit = Debit(
            f"D-{len(self.data.debits) + 1}", "L-1", card, amount or self.payment, moment, status,
            f"BR-{when[:10]}" if run == "night" else run,
            retry_of.id if retry_of else None,
            "RV-1" if returned else None,
            datetime.fromisoformat(returned) if returned else None,
        )
        self.data.debits.append(debit)
        if debit.kept:
            self.data.payments.append(
                Payment(f"P-{len(self.data.payments) + 1}", "L-1", debit.amount, "AUTO_DEBIT", moment, moment, debit.id)
            )
        return debit

    def pay(self, when: str, amount: int | None = None, channel: str = "PAYNET", posted: str | None = None) -> Payment:
        """A payment the customer made by hand."""
        payment = Payment(
            f"P-{len(self.data.payments) + 1}", "L-1", amount or self.payment, channel,
            datetime.fromisoformat(when), datetime.fromisoformat(posted or when),
        )
        self.data.payments.append(payment)
        return payment

    def charge(self, when: str, amount: int, n: int | None, kind: str = "PENALTY", code: str = "LATE_PAYMENT") -> Charge:
        charge = Charge(f"CH-{len(self.data.charges) + 1}", "L-1", kind, code, amount, datetime.fromisoformat(when), n)
        self.data.charges.append(charge)
        return charge

    def timeline(self) -> timeline.Timeline:
        return timeline.build(self.data)
