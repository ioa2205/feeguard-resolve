"""CSV exports. Cells that start with =, +, - or @ are escaped (PLAN Part 22)."""

import csv
import io

from ..schemas import REFUND_CSV_COLUMNS, ScanResult

FORMULA_STARTS = ("=", "+", "-", "@", "\t", "\r")


def safe_cell(value: object) -> str:
    """A cell that a spreadsheet will never run as a formula."""
    text = "" if value is None else str(value)
    return "'" + text if text.startswith(FORMULA_STARTS) else text


def refunds_csv(result: ScanResult) -> str:
    """The refund list of one scan: one row per finding with money to return."""
    out = io.StringIO()
    writer = csv.writer(out, lineterminator="\n")
    writer.writerow(REFUND_CSV_COLUMNS)
    for item in result.items:
        if item.amount_excess > 0:  # an early debit has nothing to return
            writer.writerow([
                safe_cell(item.contract_id), safe_cell(item.customer_id), safe_cell(item.customer_name),
                safe_cell(item.region), "" if item.installment_n is None else item.installment_n,
                item.amount_excess, "yes" if item.complained else "no",
            ])
    return out.getvalue()
