"""Tables of the bank data and of FeeGuard's own records (PLAN Part 5).

The answer-key tables are not here. They belong to generator/.

Money columns are whole soʻm. A date is "YYYY-MM-DD" and a time is
"YYYY-MM-DDTHH:MM:SS", both Tashkent time, stored as text.
"""

BANK_TABLES = """
CREATE TABLE world (
    id TEXT PRIMARY KEY, seed INTEGER NOT NULL, size INTEGER NOT NULL,
    as_of_date TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE customers (
    id TEXT PRIMARY KEY, full_name TEXT NOT NULL, region TEXT NOT NULL,
    phone_masked TEXT NOT NULL, segment TEXT NOT NULL, preferred_lang TEXT NOT NULL
);
CREATE TABLE cards (
    id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, network TEXT NOT NULL,
    issuer_bank TEXT NOT NULL, is_primary INTEGER NOT NULL, last4 TEXT NOT NULL
);
CREATE TABLE products (
    code TEXT PRIMARY KEY, name TEXT NOT NULL, annual_rate REAL NOT NULL,
    allowed_fees_json TEXT NOT NULL, penalty_rate_daily REAL NOT NULL,
    tariff_version INTEGER NOT NULL
);
CREATE TABLE contracts (
    id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, product_code TEXT NOT NULL,
    branch TEXT NOT NULL, principal INTEGER NOT NULL, annual_rate REAL NOT NULL,
    term_months INTEGER NOT NULL, start_date TEXT NOT NULL, due_day INTEGER NOT NULL,
    schedule_version INTEGER NOT NULL, schedule_changed_on TEXT,
    early_repayment_requested_on TEXT, tariff_version INTEGER NOT NULL,
    contract_text TEXT NOT NULL
);
CREATE TABLE schedule_items (
    contract_id TEXT NOT NULL, version INTEGER NOT NULL, n INTEGER NOT NULL,
    due_date TEXT NOT NULL, principal_due INTEGER NOT NULL,
    interest_due INTEGER NOT NULL, total_due INTEGER NOT NULL,
    PRIMARY KEY (contract_id, version, n)
) WITHOUT ROWID;
CREATE TABLE debits (
    id TEXT PRIMARY KEY, contract_id TEXT NOT NULL, card_id TEXT NOT NULL,
    amount INTEGER NOT NULL, created_at TEXT NOT NULL, status TEXT NOT NULL,
    batch_run_id TEXT, retry_of TEXT, reversed_by TEXT, reversed_at TEXT
);
CREATE TABLE payments (
    id TEXT PRIMARY KEY, contract_id TEXT NOT NULL, amount INTEGER NOT NULL,
    channel TEXT NOT NULL, paid_at TEXT NOT NULL, posted_at TEXT NOT NULL, debit_id TEXT
);
CREATE TABLE charges (
    id TEXT PRIMARY KEY, contract_id TEXT NOT NULL, kind TEXT NOT NULL,
    code TEXT NOT NULL, amount INTEGER NOT NULL, charged_at TEXT NOT NULL,
    installment_n INTEGER
);
CREATE TABLE complaints (
    id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, contract_id TEXT,
    text TEXT NOT NULL, lang TEXT NOT NULL, channel TEXT NOT NULL,
    created_at TEXT NOT NULL, source TEXT NOT NULL, status TEXT NOT NULL
);
"""

# Made after the bulk inserts, so the inserts stay fast.
BANK_INDEXES = """
CREATE INDEX cards_by_customer ON cards (customer_id);
CREATE INDEX contracts_by_customer ON contracts (customer_id);
CREATE INDEX debits_by_contract ON debits (contract_id);
CREATE INDEX payments_by_contract ON payments (contract_id);
CREATE INDEX charges_by_contract ON charges (contract_id);
CREATE INDEX complaints_by_customer ON complaints (customer_id);
"""

FEEGUARD_TABLES = """
CREATE TABLE IF NOT EXISTS cases (
    id TEXT PRIMARY KEY, complaint_id TEXT NOT NULL, understood_json TEXT NOT NULL,
    verdict TEXT NOT NULL, excess_amount INTEGER NOT NULL, evidence_json TEXT NOT NULL,
    mode TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS decisions (
    id INTEGER PRIMARY KEY, case_id TEXT NOT NULL, action TEXT NOT NULL,
    note TEXT NOT NULL, actor TEXT NOT NULL, at TEXT NOT NULL,
    corrected_verdict TEXT, corrected_excess INTEGER, audit_id TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS findings (
    id TEXT PRIMARY KEY, case_id TEXT, contract_id TEXT NOT NULL, type TEXT NOT NULL,
    amount_excess INTEGER NOT NULL, amount_affected INTEGER NOT NULL,
    evidence_json TEXT NOT NULL, signature_json TEXT NOT NULL, source TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS action_plans (
    id TEXT PRIMARY KEY, finding_type TEXT NOT NULL, deficiency TEXT NOT NULL,
    measures TEXT NOT NULL, deadline TEXT, responsible_unit TEXT NOT NULL,
    responsible_exec TEXT NOT NULL, monitoring_deadline TEXT, status TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS check_runs (
    id TEXT PRIMARY KEY, at TEXT NOT NULL, trigger TEXT NOT NULL, scope TEXT NOT NULL,
    loans_read INTEGER NOT NULL, loans_total INTEGER NOT NULL, new_findings INTEGER NOT NULL,
    gone_findings INTEGER NOT NULL, elapsed_ms INTEGER NOT NULL,
    opened_json TEXT NOT NULL, grown_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS incidents (
    id TEXT PRIMARY KEY, finding_type TEXT NOT NULL, opened_at TEXT NOT NULL,
    opened_by_run TEXT NOT NULL, opened_by TEXT NOT NULL, customers_seen INTEGER NOT NULL,
    proposed_by TEXT, proposed_at TEXT, approved_by TEXT, approved_at TEXT
);
CREATE TABLE IF NOT EXISTS incident_customers (
    incident_id TEXT NOT NULL, customer_id TEXT NOT NULL,
    proposed_amount INTEGER NOT NULL DEFAULT 0, approved_amount INTEGER NOT NULL DEFAULT 0,
    notified_amount INTEGER NOT NULL DEFAULT 0, approved_at TEXT, notified_at TEXT,
    PRIMARY KEY (incident_id, customer_id)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS notices (
    id INTEGER PRIMARY KEY, customer_id TEXT NOT NULL, incident_id TEXT NOT NULL,
    finding_type TEXT NOT NULL, contract_id TEXT NOT NULL, lang TEXT NOT NULL,
    text TEXT NOT NULL, amount INTEGER NOT NULL, at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS notices_by_customer ON notices (customer_id);
CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY, at TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL,
    payload_json TEXT NOT NULL, prev_hash TEXT NOT NULL, hash TEXT NOT NULL
);
"""
