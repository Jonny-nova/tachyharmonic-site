# Booking and solidarity access: implementation note

Status: local rule implementation and architecture proposal only. No booking endpoint, payment flow, provider credentials, or live integration has been deployed.

Authority: [docs/BOOKING_SYSTEM_SPEC.md](docs/BOOKING_SYSTEM_SPEC.md), version 1.0, 25 September 2026. SHA-256 at implementation: DAADB40EFA00CD298EA71C14A9BE1D06C1D4BA96CA0B75031E55E2CD9A90DEC3. Keep that source authoritative if this note differs from it.

## Current website audit

| Requirement | Current website state |
| --- | --- |
| Three rates and the same 60-minute session | Already shown in pricing and the intake preview. |
| Two initial supported places and automatic growth from the third solidarity booking | Added to the public pricing explanation. |
| Ten sessions per London Monday–Sunday week | Implemented in server-only rules; no live booking enforcement yet. |
| £500 floor for a full normal week | Enforced by the rate decision rule and tested for every state reachable from an empty week. |
| Cancellation and cross-week reschedule recalculation | Implemented in the local transactional gate contract; not connected to Calendly. |
| Secure booking, payment and calendar flow | Not connected. The public form remains a clearly labelled, non-submitting preview. |
| Secrets outside GitHub Pages | No provider secrets exist in the public site or repository. |

## Exact booking decision

For active confirmed sessions whose session date is in the same Europe/London Monday–Sunday week, low, standard and high count £30, £50 and £70 bookings. Total is their sum; capacity is 10. Revenue is 30 × low + 50 × standard + 70 × high, equivalently 50 × total + 20 × (high − low).

- A £70 booking is allowed whenever total is below 10.
- A £30 booking is allowed only if the proposed low count is at most max(2, high), and the proposed deficit max(0, low − high) is no greater than the spaces left after booking.
- A £50 booking is allowed only if that proposed deficit is no greater than the spaces left after booking.
- No rate is allowed once total reaches 10.

This is implemented in booking/rules.js. booking/state.js derives each week from active booking records by the session timestamp, using the IANA Europe/London timezone. booking/gate.js requires a serialized read-check-write store contract; its booking, cancellation and rescheduling operations are not imported by the public website.

Existing supported bookings remain active after a solidarity cancellation. The next rate decisions use the newly derived state. A cross-week reschedule is checked against the destination week and, if accepted, moves one record so both weeks recalculate. Provider-side availability and payment policy are separate checks.

## Proposed production architecture

GitHub Pages continues serving the editorial site and a future client interface. That interface may request availability and start a booking through a separate HTTPS API, but it must not receive API tokens, webhook signing secrets, Stripe secret keys, or trusted rate calculations.

A concrete candidate is a Cloudflare Worker with one SQLite-backed Durable Object for all Tachyharmonic booking weeks. A single durable object keeps cross-week reschedules and concurrent attempts in one transaction domain. Its durable records would contain provider booking IDs, fixed server-mapped rate, UTC session time, active/canceled status, payment reference, idempotency key and short-lived hold state. The object would derive weekly counts from active records rather than storing mutable L/M/H counters. It would use an atomic transaction for each read-check-write decision. This provider choice needs approval and an account/billing review before deployment.

Suggested API boundaries:

1. Availability endpoint: obtain available 60-minute times from Calendly, combine them with the server-calculated weekly rate availability, and return only public slot/rate information.
2. Hold endpoint: atomically reserve a slot and rate for a short expiry. Pending £70 holds consume provisional capacity but must **not** unlock a new £30 place; that entitlement begins only when the solidarity booking is confirmed. Pending £30 and £50 holds consume their possible rate/capacity conservatively. Expired holds release their capacity.
3. Checkout endpoint: create a Stripe-hosted Checkout Session on the server for exactly £30, £50 or £70 from the trusted hold, with an idempotency key and an opaque booking reference. Never trust a client-supplied amount.
4. Stripe webhook endpoint: verify the signature and payment state, deduplicate events, and start confirmation only for a paid hold. A return-page visit alone never confirms a booking.
5. Confirmation step: atomically mark the paid hold as confirming after rechecking the week, then release the storage transaction. Recheck the chosen Calendly time and create the invitee through its server-side Scheduling API. Keep the hold reserved during that external call. Mark the local booking confirmed only when Calendly reports success; if the external call or final write fails, reconcile against Calendly before retrying or compensating. If Calendly rejects the time, release the hold and follow an agreed rebooking/refund policy.
6. Calendly webhook endpoint: verify its signature, deduplicate by provider event/invitee identity, fetch canonical invitee status when needed, and reconcile active bookings after creation, cancellation and reschedule. Run a periodic reconciliation against Calendly so a missed or out-of-order webhook cannot leave the local mirror stale.

The public site should never expose a raw Calendly booking link as a shortcut around the gate. A leaked link, a native Calendly reschedule URL, or an unchanged legacy event type that remains publicly bookable could bypass the hard ten-session rule. That risk must be resolved before enabling live bookings.

Cloudflare's SQLite-backed Durable Object storage provides transactional storage; Calendly currently offers server-side available-time and invitee-creation APIs. These are architecture inputs, not an assertion that the connected account has the needed plan or permissions:

- Cloudflare storage: https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/
- Calendly available times: https://developer.calendly.com/api-docs/calendly-api/event-types/list-event-type-available-times
- Calendly invitee creation: https://developer.calendly.com/api-docs/calendly-api/scheduled-events/create-event-invitee
- Calendly webhook signatures: https://developer.calendly.com/api-docs/overview/webhooks/webhook-signatures
- Stripe Checkout Sessions: https://docs.stripe.com/api/checkout/sessions

## Provider responsibilities and boundaries

**Calendly:** propose a new dedicated 60-minute event type for this gated flow after Jonathan approves it. The four event types listed in the specification (AI Check-in, Clarity Session, Clarity + Synthesis, Conversations on AI) are untouched. Calendly supplies bookable times, creates confirmed invitees, sends booking/cancellation data, and uses its Google Calendar connection for conflicts and confirmed events. Direct invitee creation requires a supported paid Calendly plan; this must be checked on the actual account. Calendly reports reschedules as a canceled invitee and a created invitee. Its API documentation does not currently offer a direct reschedule operation, so a controlled cancel-and-rebook or manual process needs design and approval.

**Stripe:** collects the server-selected rate through Checkout. The backend verifies Stripe webhooks and reconciles payments; Stripe is the payment source of truth. Cancellation refunds, failed bookings after payment, and payment method policy need Jonathan's decision before a live flow.

**Google Calendar:** stays connected to Calendly for conflict checks and confirmed-session placement. The booking gate does not need a Google Calendar credential if Calendly remains the calendar owner for this flow. Confirm the connected calendar and its conflict settings during setup.

## Cancellation and reschedule behaviour

On a cancellation, mark only that confirmed booking inactive, recalculate its session week, retain every other booking, and publish the newly permitted rates. If supported access now exceeds the ceiling, block new supported places; standard bookings are allowed only when the repair-capacity inequality still holds. Solidarity remains allowed while capacity exists.

For a cross-week reschedule, check the destination week before committing, then remove the active booking from the old week and add it to the new week atomically. Recalculate both weeks. Native Calendly reschedule links may bypass this precheck; a live rollout must either route reschedules through the gate or treat them as a manual workflow with reconciliation and a clear exception process. Do not silently cancel a confirmed client to repair an economic imbalance.

## External configuration required before launch

- Approve a serverless host, persistent transactional storage and any billing.
- Verify Calendly plan/API scopes, create a separate gated 60-minute event type only after approval, and decide how existing public event types count toward the ten-session client capacity.
- Review Calendly link visibility, confirmation emails, cancellation and native reschedule settings so none bypass the gate. Do not change existing event types as part of this proposal.
- Connect or verify Google Calendar conflict checking and confirmed-session placement in Calendly; verify meeting location such as Zoom if used.
- Configure Stripe products/prices or server-created line items for exactly £30/£50/£70, Checkout settings, webhook endpoint and signing secret; decide refund/cancellation timing and what happens if payment succeeds but Calendly booking fails.
- Store Calendly and Stripe credentials only as server-side environment secrets, with separate test and production values. Configure signed webhooks, strict origin/CORS, rate limiting, idempotency, monitoring and reconciliation alerts.
- Decide whether the optional intake note should be transmitted at all, where it is stored, and how consent for any AI meeting summary is recorded. The current preview stores neither.

## Test plan and evidence

The local suite in booking/booking.test.js covers all 12 boundary cases in [docs/BOOKING_SYSTEM_SPEC.md](docs/BOOKING_SYSTEM_SPEC.md): initial availability, supported ceiling, repair-capacity examples, third solidarity growth, £500 and £700 full weeks, cancellation, cross-week reschedule, eleventh booking and simultaneous attempts. It also checks BST/GMT week changes, duplicate confirmation, denied reschedule into a full week, invalid inputs, and an exhaustive proof over reachable full-week states.

Before deployment, add adapter and integration tests for real durable transactions, hold expiry, concurrent Checkout completion, duplicated/out-of-order signed webhooks, provider API failure, reconciliation, payment failure/refund, calendar conflict, native reschedule behaviour, and simultaneous bookings against the deployed service. The local in-memory concurrency test verifies the gate contract, not Cloudflare's production adapter.
