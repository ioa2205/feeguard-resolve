# FeeGuard Resolve

A tool for bank staff. It checks whether a customer's loan-payment complaint is true, finds every other customer hit by the same mistake, and writes the fix plan and report that Central Bank Rule 3030-12 requires.

WIUT Hackathon 2026 · FinTech / AI in Finance · Startup mode

> **Status on 11 Oct 2026, 10:45 Tashkent:** every screen and every API path is built, and a clean Docker build of the repository runs them. On the 20,000-loan demo bank the four checks found all 2,832 hidden mistakes with 0 false alarms and 0 of 20 look-alikes flagged ([docs/EVAL.md](docs/EVAL.md)). Not yet done: the public deploy, the choice of the local AI model, the 100 hand-written test complaints and the three legal facts. Task status is in [docs/PROGRESS.md](docs/PROGRESS.md).

## The problem

- Every month a bank takes the loan payment from the customer's card automatically. Sometimes it takes the wrong amount: twice, too early, with a wrong penalty, or with a fee that is not allowed.
- The customer complains. A bank worker checks by hand and fixes that one customer.
- The same mistake usually hit many other customers. Most of them never complain, and nobody looks for them.
- In October 2025 the Central Bank of Uzbekistan fined three banks for overcharging loan customers. About 29 bn soʻm was returned or recalculated.
- Rule 3030-12, in force from early September 2026, tells every bank to find such systemic problems, remove their causes and report every quarter.

Sources for every number are in [DATA.md](DATA.md).

## What FeeGuard does

| Part | Job |
|---|---|
| **Check** | Reads one complaint, gathers the evidence and says "customer is right" or "bank was right", with proof |
| **Match** | Connects every debit and payment to the right monthly installment, so wrong debits stand out |
| **Patterns** | Finds all customers with the same mistake, names the likely cause, and writes the Annex 5 plan and the quarterly report |

It handles four mistakes and only these:

| Mistake | Meaning |
|---|---|
| Double debit | The same payment was taken twice |
| Early debit | The payment was taken before the due date |
| Late posting | The customer paid on time, the bank recorded it late and then charged a penalty |
| Illegal fee | A fee that is not in the contract or not allowed by law |

Any other complaint is marked "out of scope" and goes to a person.

## Why you can trust the result

- **Code decides about money.** The AI only reads complaints and writes letters. It never calculates an amount.
- **Every verdict shows its proof:** the schedule row, the debits, the payments, the charges and the contract clause.
- **A person approves every result.** Nothing is sent or refunded automatically.
- **Every action is written to an audit log** with a hash chain, so a changed record is visible.
- **It runs inside the bank.** The AI model is local. No data goes to an outside service.
- **It only reads bank data.** It never changes a bank system.

## The demo

The demo has two parts.

- **Sandbox Bank** is a fake bank. It creates invented customers, loans and payments, and hides the four mistakes among them, together with "traps": cases that look wrong but are correct. The jury controls it.
- **FeeGuard** is the product. It reads the Sandbox Bank the same way it would read a real bank. It cannot see where the mistakes were hidden.

Live demo: _link comes here_. No account is needed.

## Run it yourself

These steps were run on Windows with Python 3.12 and Node 24. On 11 Oct 2026 a fresh clone was also built and tested in clean Linux containers (Python 3.11, Node 22): 346 tests passed, the contract check passed, and the screens ran over HTTPS behind Caddy ([docs/evidence/s5-clean-machine.txt](docs/evidence/s5-clean-machine.txt)).

The backend and the frontend are two separate apps. Each runs alone.

**Backend** (the API, port 8000):

```
cd backend
pip install -r requirements.txt
python -m pytest -q
python -m uvicorn app.main:app --reload --port 8000
```

`http://localhost:8000/api/health` answers. `http://localhost:8000/api/docs` lists every path. At its first start the backend builds the default demo bank (20,000 loans, seed 2026) into `worlds/default/`; this takes 15 to 30 s on a laptop. `DEFAULT_WORLD_SIZE=5000` builds a smaller one. Without a local AI model, complaints are read by rules and every screen says so.

To measure detection against the answer key (the numbers of `docs/EVAL.md`):

```
cd backend
python -m app.eval.run_eval --world default
```

**Frontend** (the screens, port 5173):

```
cd frontend
npm install
npm run dev          # uses the backend on port 8000
npm run dev:mocks    # no backend needed: runs on the sample data in src/mocks
```

**After a change to an API shape or a mock**, from the repository root:

```
python scripts/check_contract.py
```

**With Docker** (for a server): `cd deploy`, copy `.env.example` to `.env`, set `DOMAIN` to the public name, then `docker compose up -d --build`. Only Caddy publishes ports (80 and 443); it gets the HTTPS certificate for `DOMAIN` and forwards `/api` to the backend. At its first start the backend builds the default demo bank (6.7 s in Docker on a laptop). Without a model in the Ollama container, complaints are read by rules and every screen says so. Both images were built and run on 11 Oct 2026, but on a laptop, not yet on the server; there, Docker Desktop could not mount the Caddyfile, so the stack was started by hand with the same images ([docs/evidence/s5-clean-machine.txt](docs/evidence/s5-clean-machine.txt)).

## Documents

| File | What it holds |
|---|---|
| [docs/PLAN.md](docs/PLAN.md) | The whole plan |
| [docs/DESIGN.md](docs/DESIGN.md) | How every screen looks, reads and behaves |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How it fits inside a bank: on-prem, read-only, security |
| [DATA.md](DATA.md) | What is synthetic, what is real, and the sources |
| [docs/EVAL.md](docs/EVAL.md) | Measured results |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Every decision and its reason |
| [docs/PROGRESS.md](docs/PROGRESS.md) | Task status with evidence |
| [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) | Libraries, fonts and the AI model, with their licences |

## Licence

MIT. See [LICENSE](LICENSE).
