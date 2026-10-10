# FeeGuard Resolve — Data

**All customer data in this project is synthetic. There is no real personal data anywhere: not in the demo, not in the tests, not in the repository.**

> **Status on 11 Oct 2026:** the generator is built (tasks A1, A2, A6). The counts below are from the default demo bank; the exact rules are in `docs/DECISIONS.md` D-021 and D-025.

## 1. What is fake

Everything about people and their money is made by our own generator, the "Sandbox Bank".

| Data | How it is made |
|---|---|
| Customers | Random combinations of first names and family names. A match with a real person is a coincidence |
| Phone numbers | Masked from the moment they are created. A full number never exists |
| Cards | Network (HUMO or UZCARD) and a masked number. A full card number never exists |
| Loans, schedules | Generated from product settings (amount, rate, term, due day). Whole soʻm only |
| Debits, payments, penalties, fees | Generated month by month from the schedules |
| Contract texts | Rendered from our own template, written in the style of public loan offers on bank websites. Fake names and numbers |
| Complaints | Generated from templates in Uzbek (Latin and Cyrillic), Russian and mixed language, with typos and many amount formats |
| The four mistakes | Planted on purpose, each with a hidden cause |
| Traps | Cases that look wrong but are correct, planted on purpose |

Fields that do not exist anywhere in the system: passport number, PINFL, full card number, full phone number, home address, date of birth.

## 2. What is real

| Real thing | Where it comes from |
|---|---|
| The four mistake types | Public Central Bank findings and bank statistics (section 5) |
| The duties of a bank under Rule 3030-12 | The published rule (section 5) |
| The style of the contract wording | Public loan offers on bank websites. We wrote our own template; no bank's text is copied |
| The kinds of language in complaints | How people in Uzbekistan write: Uzbek in Latin and Cyrillic, Russian, mixed, with many ways to write an amount |

## 3. What we do not claim

- We do not have, and did not use, any bank's internal data.
- The two "real-case" presets are rebuilt from public news. We do not claim to know those banks' internal causes.
- A result on synthetic data does not prove the same accuracy on real data. The first step of the pilot is to replay a bank's real complaints inside the bank and measure.

## 4. How the fake bank is built

1. The jury (or we) choose a seed, a size (5,000 or 20,000 loans), which mistakes to plant and how often.
2. The generator creates customers, cards, loans and schedules, then a normal payment history.
3. It adds normal "noise" that is not a mistake: a failed debit followed by one successful retry, a duplicate debit the bank already reversed, partial payments, customers who really pay late.
4. It plants the mistakes and the traps and writes them to an answer key.
5. It writes complaints for about 15% of the affected customers. The others are "silent victims".

**The answer key is kept apart.** It is stored in a separate file that FeeGuard's code cannot open. Only the scoring script and the "show the answer key" button read it.

**Same seed, same bank.** The generator uses one seeded random source and a fixed bank date, never the server clock. Anyone can rebuild the same bank and check our numbers.

## 4a. The default demo bank, measured

`python -m app.generator.world --seed 2026 --size 20000` (from `backend/`), world date 10 Oct 2026, every mistake rate 2%, 20 traps:

| Rows | Count |
|---|---|
| Loans | 20,000 |
| Customers | 18,154 |
| Cards | 23,241 |
| Schedule rows | 499,560 |
| Debits | 109,557 |
| Payments | 150,466 |
| Penalties and fees | 8,389 |
| Complaints | 305: 271 from wronged customers, 20 look-alikes, 14 about something else |

Mistakes hidden: taken twice 400 · taken early 1,523 installments on 400 loans · recorded late, then fined 469 · fee not allowed 440. Base rates measured: PAYNET 15.4% of payments · two or more cards 24.9% of customers · changed schedule 5.2% of loans · the fee product 22.4% of loans.

## 5. Public sources

These were collected by the team. Open each link once more before submission and check that the number on our slide matches the page.

| Fact | Source |
|---|---|
| The Central Bank fined 3 banks for overcharging loan customers (October 2025) | [Kun.uz](https://kun.uz/news/2025/10/03/markaziy-bank-3-ta-tijorat-bankini-istemolchilar-huquqlarini-buzgani-uchun-jarimaga-tortdi), [Spot](https://www.spot.uz/oz/2025/10/03/three-bank/) |
| TBC Bank request statistics, August 2026 | [TBC](https://tbcbank.uz/ru/faq/request-analysis/) |
| Complaints to the Central Bank, first half of 2026 | [CBU](https://cbu.uz/uz/services/citizens/statistics/) |
| Complaint index by bank, second quarter of 2026 | [Spot](https://www.spot.uz/oz/2026/08/07/banks-complaints/) |
| The Central Bank on debiting before the due date (May 2025) | [Spot](https://www.spot.uz/oz/2025/05/21/dishonest-practice/) |
| The Central Bank on updated schedules (October 2025) | [Spot](https://www.spot.uz/oz/2025/10/09/cb-banks/) |
| Late-payment interest levels (January 2026) | [Spot](https://www.spot.uz/oz/2026/01/22/loan-payments/) |
| Central Bank Rule 3030-12 (registered 1 August 2026) | [CBU, PDF](https://cbu.uz/upload/medialibrary/660/gxmd5djd01h64hn3i7yfhwgff28ege23/3030_12.pdf) |

## 6. The hand-written test set

To test language understanding, team members write 100 complaints by hand: 25 in Uzbek Latin, 25 in Uzbek Cyrillic, 25 in Russian and 25 mixed. Each one is labelled with its type and amount.

- People write them. No AI writes or edits them.
- They are invented. No real complaint is copied.
- The file is `backend/data/complaint_testset.jsonl`.
