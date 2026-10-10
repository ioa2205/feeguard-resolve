# FeeGuard Resolve — Measured results

Proof 1 and the cause finder are measured (11 Oct 2026). Proofs 3 and 5 and the VPS speed are not.

## Rules for this file

- Only numbers that a script or a stopwatch produced go here. Never an estimate, never a target.
- Every result has: the date and time, the commit, the command that produced it, and the settings (seed, size).
- If a result is bad, it still goes here.
- The deck and the Scoreboard screen may show only numbers that are in this file.

## Proof 1 — Detection is correct (task A9)

Measured 11 Oct 2026, 01:55 Tashkent · Commit `aa8faca` · Command: `python -m app.eval.run_eval --world default` (from `backend/`) · Demo bank `default`: seed 2026, 20,000 loans, every rate 2%, 20 traps · The same numbers come from `GET /api/eval/default` (the Scoreboard).

The four checks run over every loan of the bank; each finding is matched to the answer key by type, loan and installment.

| Mistake | Planted | Found | Missed | False alarms | Soʻm planted | Soʻm found |
|---|---|---|---|---|---|---|
| Double debit | 400 | 400 | 0 | 0 | 1 011 781 585 | 1 011 781 585 |
| Early debit | 1,523 installments | 1,523 | 0 | 0 | 3 909 382 499 taken early | 3 909 382 499 taken early |
| Late posting | 469 | 469 | 0 | 0 | 1 708 980 | 1 708 980 |
| Illegal fee | 440 | 440 | 0 | 0 | 51 280 000 | 51 280 000 |

Early debit soʻm is money taken before its due date, not money to return (DECISIONS D-004).

| Traps | Total | Correctly cleared | Wrongly flagged |
|---|---|---|---|
| All 4 trap types (5 each) | 20 | 20 | 0 |

The same run checked all 305 generated complaints one by one. **These texts are machine-made from templates the rules reader was built with; this is not the language test (Proof 3).** Really wronged: 271 of 271 `SUPPORTED` · look-alike: 20 of 20 `NOT_SUPPORTED` · not about a payment: 11 of 14 `OUT_OF_SCOPE`, 3 `NEEDS_INFO` (requests to close a loan early, read as "taken early") · one complaint: median 3 ms; the slowest, 4,050 ms, was the first one, which waited for the classifier to train.

The pass over the whole bank took 5.4 s and 25.3 s in two runs on this laptop (Windows, disk shared with other work). That is not the VPS figure (P4).

## Proof 3 — Understands real language (task B7)

100 complaints written by hand by the team. Command: _to add_

| Mode | Complaints | Type correct | Amount correct |
|---|---|---|---|
| Local AI | | | |
| Rules only | | | |

By language:

| Language | Complaints | Type correct (AI) | Type correct (rules) |
|---|---|---|---|
| Uzbek, Latin | | | |
| Uzbek, Cyrillic | | | |
| Russian | | | |
| Mixed | | | |

## Proof 5 — Saves time (task P2)

Who did it: _to add_ · The 5 complaints: _to add_

| Method | Complaint 1 | 2 | 3 | 4 | 5 | Total |
|---|---|---|---|---|---|---|
| By hand, from raw tables | | | | | | |
| With FeeGuard | | | | | | |

## Speed on the VPS (task P4)

VPS size: _to add_ · Model: _to add_

| Action | Target | Measured |
|---|---|---|
| Investigate one complaint | under 10 s | |
| Scan 20,000 loans | under 5 s | |
| Create a 20,000-loan bank | under 60 s | |

## Cause finder (task A8)

Measured 11 Oct 2026, 01:40 Tashkent · Commit `95df4db` · Same demo bank (seed 2026, 20,000 loans) · `causes.find` over the findings of `scan.check_bank`. "Share" is the share of the findings with that value (support); "times normal" is lift.

| Mistake | Planted cause (hidden settings) | Top cause found | Share | Times normal | Match |
|---|---|---|---|---|---|
| Double debit | retry on the second card, batch nights 5 Jul and 10 Aug 2026 | billing run BR-2026-07-05 | 93% | 47 | Yes |
| Early debit | old due dates after a schedule change | payment schedule changed | 100% | 11 | Yes |
| Late posting | PAYNET payments recorded the next business day | channel PAYNET | 100% | 6.5 | Yes |
| Illegal fee | issuance fee on Microloan after the tariff update of 15 Aug 2026 | tariff version 2 | 100% | 45 | Yes |

Second values shown: double debit "2 or more cards" (100%, 4 times) · illegal fee "Microloan" (100%, 4.5 times). The test `test_the_planted_cause_is_on_top_for_every_type` repeats this on two other banks of 3,000 loans, one built with "surprise me".
