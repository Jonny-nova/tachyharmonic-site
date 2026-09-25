# Tachyharmonic Booking & Solidarity Access System
Version 1.0 — 25 September 2026

## Purpose

Tachyharmonic offers the same 60-minute session at three prices:

- Supported — £30
- Standard — £50
- Solidarity — £70

Jonathan's maximum client-facing capacity is 10 sessions per work week.

The goal is to make two supported places available up front each week, then automatically grow supported access when solidarity bookings make that financially sustainable.

A fully booked 10-session week should finish at an average of at least £50 per session (£500 total), except where a cancellation makes that temporarily impossible after lower-priced bookings have already been honoured.

The work week is Monday–Sunday in `Europe/London`, determined by the date on which each session takes place, not the date on which it was booked.

## Public-facing explanation

### Recommended website copy

**How supported places grow**

I keep two £30 supported sessions open each week whether or not anyone subsidises them. After that, the system grows them automatically: from the third £70 solidarity booking onwards, every additional solidarity booking opens another £30 place.

So if you choose the solidarity rate, you are genuinely creating supported access for somebody else. The first two places are something I put in up front; after that, the promise is automated.

**Exactly the same session at every price.**

Short version:

> Two supported places are available each week from the start. After that, each additional solidarity booking from the third onwards automatically opens another supported place. Choosing solidarity genuinely creates access for someone else.

## Core variables

For a given Monday–Sunday session week:

- `L` = active £30 Supported bookings
- `M` = active £50 Standard bookings
- `H` = active £70 Solidarity bookings
- `T = L + M + H`
- `CAPACITY = 10`

Weekly revenue:

`revenue = 30L + 50M + 70H`

Equivalent form:

`revenue = 50T + 20(H - L)`

At 10 booked sessions:

`revenue = 500 + 20(H - L)`

So a full week is at least £500 whenever `H >= L`.

## Supported-place entitlement

Two supported places are available without any solidarity bookings.

After that, supported access grows one-for-one with solidarity bookings from the third solidarity booking onward.

For a normal healthy state:

`supported_ceiling = max(2, H)`

Examples:

| Solidarity bookings | Supported places permitted |
|---:|---:|
| 0 | 2 |
| 1 | 2 |
| 2 | 2 |
| 3 | 3 |
| 4 | 4 |
| 5 | 5 |
| 6 | 6 |

The overall 10-session capacity still applies.

## Capacity protection rule

After simulating a proposed booking:

`remaining = 10 - T`

`deficit = max(0, L - H)`

For Supported and Standard bookings, require:

`deficit <= remaining`

This preserves enough empty spaces for future £70 bookings to repair any current supported-rate deficit.

### Rate-specific logic

#### £70 Solidarity
Allow whenever total capacity has not been reached.

#### £30 Supported
Allow only when:
1. total capacity remains;
2. `L + 1 <= max(2, H)` after the proposed booking; and
3. `deficit <= remaining` after the proposed booking.

#### £50 Standard
Allow only when:
1. total capacity remains; and
2. `deficit <= remaining` after the proposed booking.

## Reference pseudocode

```python
CAPACITY = 10

def can_book(rate, low, standard, high):
    total = low + standard + high
    if total >= CAPACITY:
        return False

    if rate == 70:
        return True

    new_low = low + (1 if rate == 30 else 0)
    new_standard = standard + (1 if rate == 50 else 0)
    new_high = high

    new_total = new_low + new_standard + new_high
    remaining = CAPACITY - new_total
    deficit = max(0, new_low - new_high)

    if rate == 30 and new_low > max(2, new_high):
        return False

    if deficit > remaining:
        return False

    return True
```

## Examples

### Two supported + six standard, no solidarity yet
`L=2, M=6, H=0, T=8`

Two spaces remain and the deficit is 2.

Therefore:
- £30 unavailable
- £50 unavailable
- £70 available

If the final two bookings are solidarity:

`2×30 + 6×50 + 2×70 = £500`

### Five supported + five solidarity
`5×30 + 5×70 = £500`

### Ten solidarity
`10×70 = £700`

### Third solidarity booking
If `H` rises from 2 to 3, the supported ceiling rises from 2 to 3. The third supported place may then become available, subject to overall capacity. Fourth solidarity permits a fourth supported place, fifth permits a fifth, and so on.

## Cancellations and reschedules

Never automatically cancel an already-booked supported client because a solidarity client later cancels.

Instead, recalculate the week from active bookings.

A cancellation may create a temporary state where `L > max(2, H)` or where the £500 full-week floor can no longer be fully repaired.

In that case:
- do not disturb existing bookings;
- block new £30 bookings;
- block new £50 bookings when they would worsen the deficit or consume required repair capacity;
- continue allowing £70 bookings until capacity is reached.

Rescheduling across week boundaries must remove the booking from the old week and add it to the new week before recalculating both weeks.

State should be derived from active bookings wherever practical rather than maintained as fragile counters.

## Integration responsibilities

### Website / Codex
Codex should:
- keep the pricing and solidarity explanation in the website;
- implement the client-side rate/booking flow;
- implement or wire a small secure server-side booking gate;
- keep API tokens and webhook secrets in environment variables;
- preserve GitHub Pages for the public static site if desired;
- use a separate serverless endpoint for secret-bearing logic;
- add tests for every boundary case in this document;
- create a durable booking-system implementation note in the repository.

### Calendly
Calendly should provide:
- 60-minute event type(s);
- actual bookable times;
- scheduling links / booking creation;
- booking and cancellation data;
- Google Calendar conflict checking;
- meeting location such as Zoom, if configured.

### Stripe
Stripe should collect the correct £30 / £50 / £70 payment as part of the final booking flow.

### Google Calendar
Google Calendar should be connected to Calendly for conflict checking and confirmed-session placement.

## Current connected Calendly state observed on 25 September 2026

Connected host timezone:
- `Europe/London`

Current active event types:
- AI Check-in (30 min) — unpaid
- Clarity Session (60 mins) — unpaid
- Clarity + Synthesis (60 mins + written synthesis) — unpaid
- Conversations on AI — unpaid

These appear to pre-date the new Tachyharmonic three-rate structure.

Do not delete, rename, deactivate or repurpose them automatically. Review them with Jonathan first.

No current event type observed through the connected account is configured as paid.

## Implementation safety

- Never commit Calendly tokens, Stripe secret keys, webhook secrets or other credentials to Git.
- Never put secrets into the public GitHub Pages bundle.
- Make webhook processing idempotent.
- Recalculate from live booking state on booking, cancellation and reschedule events.
- Use `Europe/London` for week boundaries and handle BST/GMT correctly through IANA timezone logic rather than fixed UTC offsets.
- Honour existing confirmed bookings even if a later cancellation makes the theoretical weekly target temporarily unattainable.
- Re-check the rule server-side immediately before any booking is confirmed.
- The overall hard capacity is 10 sessions in a Monday–Sunday work week.

## Required tests

1. `L=0,M=0,H=0` — all three rates available.
2. `L=2,M=0,H=0` — £30 closed; £50 and £70 available.
3. `L=2,M=6,H=0` — only £70 available.
4. `L=2,M=6,H=1` — only £70 available for the final slot.
5. `L=2,M=5,H=2` — £50 and £70 allowed; £30 still closed.
6. `L=2,M=4,H=3` — third £30 may be allowed if capacity permits.
7. `L=5,M=0,H=5` — full at £500.
8. `L=0,M=0,H=10` — full at £700.
9. Cancellation causing `L > H` — existing bookings retained and new £70 remains allowed.
10. Reschedule from one week to another — both weeks recalculate correctly.
11. Eleventh booking attempt — always rejected.
12. Concurrency test — two simultaneous attempts must not bypass the 10-session cap or rate rules.

## Instruction to Codex

Treat this document as the authoritative functional specification for the Tachyharmonic booking and solidarity-access system.

Do not simplify the rules into a static “two supported places per week” limit.

Do not implement the logic solely in browser-side JavaScript.

Do not change the economic rule without explicit approval from Jonathan.

Before deployment, show Jonathan:
- the architecture;
- the exact booking-state logic;
- the test results;
- which Calendly event types will be used;
- which external services require credentials;
- any manual Calendly/Stripe/Google Calendar steps still required.
