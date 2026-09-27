# Tachyharmonic booking and solidarity access system

Version 1.1 — 27 September 2026. This reconciles the original 25 September one-hour specification with Jonny's [approved launch decisions](PROJECT_MEMORY.md#current-booking-design-decisions--27-september-2026). The original economic protection remains in force. This is a functional specification, not legal copy or launch acceptance.

## Offer and weekly accounting

| Appointment | Price | Weekly units |
| --- | ---: | ---: |
| One hour, supported | £30 | 1 supported hour |
| One hour, standard | £50 | 1 standard hour |
| One hour, solidarity | £70 | 1 solidarity hour |
| Two hours, standard | £100 | 2 standard hours |
| Two hours, solidarity | £140 | 2 solidarity hours |

A two-hour booking is one contiguous, indivisible appointment: one client, one payment, one hold, one confirmation and one whole-appointment cancellation or reschedule. No supported or mixed-rate double exists. Repeat supported one-hour bookings have no per-person limit while the weekly rule genuinely permits them.

The work week is Monday–Sunday in `Europe/London`, keyed to appointment date. `L`, `M` and `H` count *confirmed paid client hours* at the three rates, not appointments. `T = L + M + H` and `T ≤ 10`. The weekly revenue is `30L + 50M + 70H = 50T + 20(H − L)`. At a full ten-hour week, `H ≥ L` preserves the original £500 floor. A later cancellation may make a previously valid week temporarily fall below that floor; confirmed clients are never displaced to repair it.

The supported ceiling is `max(2, H)`. Thus two supported hours are initially available, and each solidarity-rate hour from the third onward can increase the ceiling by one. A £140 double contributes two solidarity hours and may lift the ceiling by two. This entitlement is subject to the ten-hour cap and repair rule. Public wording must describe *solidarity hours/units*, not simply a count of £70 appointments, because the latter is false once doubles exist.

For a proposed offer, first require `confirmed hours + reserved hours + offer hours ≤ 10`. A pending hold consumes its full one or two hours, but a pending solidarity hold cannot yet create supported entitlement or repair a confirmed supported deficit. For a supported offer, require `confirmed L + reserved supported L + proposed supported L ≤ max(2, confirmed H)`. For supported and standard offers, require `max(0, confirmed L + reserved supported L + proposed supported L − confirmed H) ≤ remaining hours after all reservations and the proposal`. Solidarity offers are allowed whenever the hard hour cap permits. This preserves enough uncommitted hours to repair an existing supported deficit. Evaluate every condition in a serialized transaction against current records.

Examples: `L=2,M=6,H=0` leaves two hours, reserved for solidarity; standard and supported are closed. `L=5,M=0,H=5` is full at £500. A £140 double contributes two H units, occupies two of ten hours and remains one appointment. An eleventh hour is never accepted even if it is part of a proposed double.

## Appointment availability

Client-facing meeting windows in London local time:

| Day | Window |
| --- | --- |
| Monday | 10:00–16:00 |
| Tuesday | 10:00–20:00 |
| Wednesday | 10:00–14:00; no client after 14:00 |
| Thursday | 10:00–20:00 |
| Friday | 12:00–20:00; morning closed by default |
| Saturday and Sunday | 12:00–14:00; at most one client appointment each day |

The *client meeting* must fit wholly inside a recurring window or an explicit date-specific opening. A date-specific opening may extend a day without weakening any other check. Preparation starts 30 minutes before every appointment and decompression/admin lasts 30 minutes after. These buffers may lie just outside the client-facing window. Separate client appointments must have a full 60-minute gap, so their protected intervals must not overlap. Busy events on all three Google calendars (Primary, Work and Home) block any overlapping protected interval. Missing or failed calendar data is not evidence of free time. Enforce at least 48 hours' notice and no more than four weeks ahead; use an IANA timezone for day/week boundaries and compare actual instants at the notice/horizon limits. The ten-hour weekly cap also applies. The server must recheck fresh availability immediately before committing a hold and reconcile it again before provider confirmation.

## Atomic journey and truthful state

The controlled website/server gate owns prices, weekly capacity, supported/solidarity rules, holds and cancellation state. It must map a chosen offer to a server-owned amount; never trust a browser amount. A short-lived, durable hold reserves the whole appointment while payment and scheduling finish. Atomic read-check-write prevents two visitors taking the same slot or last weekly hours. Expired unpaid holds release capacity; payment arriving after expiry creates a failed-booking/refund-pending case, not a confirmation. A paid booking stays reserved while Calendly confirmation is uncertain. Payment alone never confirms an appointment. Provider rejection creates a failed booking, prompts a full refund, alerts Jonathan and tells the visitor the truth. If provider success is uncertain, reconcile by provider identity before retrying creation; do not create a duplicate.

At 24 hours or more before the appointment, a controlled online request begins whole-appointment cancellation and full refund, subject to applicable statutory rights. Keep the appointment protected until Calendly confirms cancellation. Only then release its weekly units and mark a refund pending. Mark refund *initiated* only after Stripe confirms creation of a refund; distinguish initiation from the visitor receiving funds. Failed Calendly cancellation or refund calls stay in a durable pending/retry/alert state. Within 24 hours, route the request to Jonathan for review, with no automatic blanket refund or forfeiture. Rescheduling goes through Jonathan at launch; any destination is rechecked as a whole appointment, with both weeks recalculated atomically. Final consumer-law wording requires review before publication.

Use stable booking/payment/provider/refund identities and idempotency keys. Verify signed webhooks and deduplicate them. Reconcile out-of-order events and provider state after timeouts. Record only necessary personal information in private server storage; use opaque IDs in Stripe/Calendly metadata and operational logs. Secrets never enter the static site, Git or client responses.

## Integration boundary and current live state

Calendly Standard is documented to allow server-side invitee creation and webhooks, subject to account permissions and scopes. It can offer available times, create/cancel an invitee and surface scheduled events. It does **not** supply this project's financial gate. Configure separate one- and two-hour event types later, then verify their availability, buffers, conflict calendars, notice/horizon and any native cancel/reschedule links against this gate. Direct public Calendly booking links cannot bypass it. Existing live event types (AI Check-in, Clarity Session, Clarity + Synthesis, Conversations on AI) were observed before this sprint and are untouched. No live event type is modified by this specification.

Stripe Checkout is the intended server-created payment handoff. Signed payment events, not a return page, establish payment. A paid but unconfirmed appointment is a booking failure requiring prompt refund initiation and Jonathan alert. The practical availability of funds for refunds of future appointments must be checked against the live payout schedule/balance or an approved reserve before launch; this specification makes no account change. Provider credentials, webhook endpoints, product/price configuration, payout settings and transactional email remain to be configured and tested.

`jonathan@tachyharmonic.ai` is the human enquiry, rescheduling, under-24-hour review and failure-alert destination. Booking, cancellation, refund and failure notifications require a separate verified transactional sender; do not send automation through the personal Porkbun mailbox. The Android Thunderbird background-notification limitation does not change this system boundary.

## Verification required before launch

Automated tests must cover every offer, economic boundary, reachable full-week floor, London DST/week boundaries, notice/horizon, all windows, one-off openings, three-calendar fail-closed conflict checks, protected buffers, weekend limit, concurrent holds, expiry/payment race, provider uncertainty, cancellations/refund pending and cross-week rescheduling. Local in-memory tests prove rule behaviour, not production durability. An integrated candidate then needs a real transactional store, Stripe and Calendly sandbox tests, signed-webhook/reconciliation tests, live account configuration review, exact visitor copy/legal review, and human acceptance before publication.
