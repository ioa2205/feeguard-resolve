"""The quarterly analysis of complaints (Rule 3030-12; its exact form is TO VERIFY). Task A8.

The quarter is the last full quarter before the world date. A complaint's type
is the reading stored with its case, or, for a complaint nobody has checked
yet, the rules reader's reading (fast and the same every time). Recurring
issues are the bank-wide scans that found more than one customer.
"""

import json
import sqlite3
from collections import Counter
from datetime import date, timedelta

from .. import schemas
from ..ai import parse_complaint
from ..ai.normalize_amount import find_amounts
from ..connector import Bank
from . import action_plan

NOT_CHECKED = "NOT_CHECKED"


def last_full_quarter(as_of: date) -> tuple[str, date, date]:
    """("2026-Q3", 1 Jul 2026, 30 Sep 2026) for a world date in October 2026."""
    first_month = (as_of.month - 1) // 3 * 3 + 1
    end = date(as_of.year, first_month, 1) - timedelta(days=1)
    start = date(end.year, end.month - 2, 1)
    return f"{end.year}-Q{(end.month - 1) // 3 + 1}", start, end


def _counted(counter: Counter) -> list[schemas.CountRow]:
    return [schemas.CountRow(key=key, count=count) for key, count in sorted(counter.items(), key=lambda kv: (-kv[1], kv[0]))]


def report(bank: Bank, store: sqlite3.Connection, scan_of) -> schemas.QuarterlyReport:
    quarter, start, end = last_full_quarter(bank.as_of)
    regions = {customer.id: customer.region for customer in bank.customers().values()}
    stored = {
        case_id: (json.loads(understood)["claim_type"], verdict)
        for case_id, understood, verdict in store.execute("SELECT id, understood_json, verdict FROM cases")
    }
    by_type, by_region, by_channel, by_verdict = Counter(), Counter(), Counter(), Counter()
    total = 0
    for complaint in bank.complaints():
        if not start <= complaint.created_at.date() <= end:
            continue
        total += 1
        if complaint.id in stored:
            claim_type, verdict = stored[complaint.id]
        else:
            amounts = [amount.value for amount in find_amounts(complaint.text)]
            claim_type, verdict = parse_complaint.rules_claim(complaint.text, amounts, complaint.lang), NOT_CHECKED
        by_type[claim_type] += 1
        by_region[regions.get(complaint.customer_id, "Unknown")] += 1
        by_channel[complaint.channel] += 1
        by_verdict[verdict] += 1

    recurring = []
    for kind in action_plan.TYPES:
        scan = scan_of(kind)
        if scan.systemic:
            recurring.append(schemas.RecurringIssue(
                finding_type=kind, affected_contracts=scan.affected_contracts,
                affected_customers=scan.affected_customers, total_excess=scan.total_excess,
                total_affected=scan.total_affected, cause_sentence=scan.cause.sentence if scan.cause else None,
                cause_sentence_t=scan.cause.sentence_t if scan.cause else None,
            ))
    return schemas.QuarterlyReport(
        quarter=quarter, date_from=start, date_to=end, complaints_total=total,
        by_type=_counted(by_type), by_region=_counted(by_region), by_channel=_counted(by_channel),
        by_verdict=_counted(by_verdict), recurring=recurring,
        measures=action_plan.plan(store, scan_of).items,
    )
