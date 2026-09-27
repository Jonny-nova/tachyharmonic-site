# Booking implementation and launch boundary

Updated 27 September 2026. This describes the integrated code candidate, not a claim that the public site accepts bookings or that the real provider journey has passed. Deployment/account evidence belongs in [project memory](docs/PROJECT_MEMORY.md). The checked-in frontend and backend booking switches remain disabled.

Jonny explicitly approved replacing Calendly in the V1 controlled booking path with **direct Google Calendar appointments and Google Meet** during this task. The weekly economics and appointment rules in the [booking specification](docs/BOOKING_SYSTEM_SPEC.md) remain authoritative. Earlier Calendly architecture notes are historical; the retained Calendly adapter is not the selected V1 scheduler. The replacement removes a Calendly public scheduling link from this website's journey. It does not itself deactivate unrelated legacy links or prove that other bookings cannot affect Jonathan's workload.

## Implemented candidate

The static site calls a Cloudflare Worker. One SQLite Durable Object, named `tachyharmonic-all-weeks-v1`, owns every London week. `backend/store.js` commits synchronous read-check-write operations through `transactionSync`; network calls run outside database transactions. The object serializes HTTP requests and alarms while performing provider checks. Cloudflare documents this [transactional SQLite storage model](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/).

| Area | Implementation |
| --- | --- |
| Economics | `booking/rules.js`: five server-owned offers, ten paid client hours per London week, supported ceiling, repair capacity and solidarity-hour accounting. A double remains one indivisible appointment. |
| Availability | `booking/availability.js`: London windows, dated openings, 48-hour notice, 28-day horizon, 30-minute buffers, full client separation, weekend limit and fail-closed Primary/Work/Home conflicts. Seconds and milliseconds count at window boundaries. |
| State | `booking/gate.js` and `booking/state.js`: holds, paid pending/confirming reservations, cancellation and refund states. Pending solidarity hours never unlock supported entitlement. |
| Consent | `booking/consent.js`: shared exact wording/version and the end of London calendar day 14 after the day of contract formation. Preparation begins 30 minutes before the session. |
| HTTP/security | `backend/worker.mjs`: configured browser origins, bounded bodies, validation, signed payment events, private bearer authentication and persisted rate limits. |
| Scheduling | `backend/google-scheduler.js`: deterministic event identity, minimal invitee information, opaque correlation, canonical event verification, awaited Meet readiness and verified whole-event cancellation. |
| Payment/email | `backend/providers.js` and `backend/messages.js`: server-priced Stripe Checkout/refunds and a separate verified transactional sender. Test mode is the default. |
| Recovery | `backend/service.js`: durable jobs, stable operation identities, event deduplication, bounded reconciliation, retries, alerts, private note cleanup and audited human resolutions. |

See the [backend setup and operator guide](backend/README.md) for routes, variables and operational boundaries.

## Controlled journey

1. Generate candidate times, obtain fresh busy intervals from all three calendars and apply the local time/economic rules. Returned slots remain provisional.
2. Collect name/email, an optional note of at most 1,200 characters and a separate unticked early-start choice. No AI preparation or recording service is connected. The browser generates a random management capability; only its hash is stored. Fresh calendar/provider checks precede the atomic 15-minute hold.
3. Create Stripe Checkout from the trusted offer amount and opaque booking reference, without the note. Accept payment only from a verified signed event or authoritative Stripe reconciliation. A return-page visit never proves payment.
4. Keep the whole appointment reserved while Calendar and Meet finish. Confirmation requires the matching canonical event and a ready, validated Meet link. Uncertain creation retains capacity. Meet failure first cancels the known calendar event, then enters failed-booking/refund processing.
5. Record `contractAt` at first successful appointment confirmation, separately from Stripe's paid timestamp and the verification timestamp. Retain the exact choice wording, version, value and time. Without early-start consent, preparation/session must occur after the cancellation-period boundary; this is rechecked before creation and at confirmation. Confirmation mail includes the choice record, contract date, cancellation-period end, ready Meet link and private management link.

The initial capability is held in that browser session. Cross-device email recovery uses a separate booking-specific HMAC capability derived from a server secret at send time, not stored in the outbox. Both expire 30 days after appointment start. Neither permits private note access. Jonathan uses separate administrator authentication.

## Cancellation, refunds and uncertainty

A controlled request at least 24 hours before the appointment begins whole cancellation. Capacity stays protected until canonical provider cancellation is verified. Both service and Google adapter check the current start/end time; a conditional delete protects against intervening edits. A changed appointment becomes human review instead of applying its old cancellation clock. See Google's [ETag/If-Match mechanism](https://developers.google.com/workspace/calendar/api/guides/version-resources).

After cancellation, release capacity and request the full original Stripe amount. Refund `pending` means creation is unverified; `initiated` means Stripe accepted it, not that funds reached the bank. Later failure or required action becomes `attention_required`; reconciliation continues and can report recovery. An uncertain refund is not blindly repeated after the safe idempotency window.

An under-24-hour request goes to Jonathan for review without automatic cancellation, refund or forfeiture. An authenticated operator may retain the exact active appointment or approve whole cancellation with a recorded reason. Statutory rights remain part of that decision. Final terms and contract formation require Jonathan's review.

Rescheduling remains through Jonathan. The domain gate tests whole-appointment, cross-week recalculation, but there is **no provider-integrated public or admin reschedule endpoint**. An external time change is flagged and its original reservation remains protected. The admin resolve route refuses a generic move.

Alarms rotate through up to five relevant records and process up to five jobs per wakeup. Jobs use capped exponential backoff. Lost Checkout responses can be rediscovered by opaque correlation within a bounded time range. Payment after hold expiry follows failure/refund handling even if cleanup already marked the hold failed. Notifications use immutable snapshots; stale confirmation/pending messages are suppressed, and distinct failure episodes can alert again. Missing Google event data after an uncertain write remains unresolved rather than being treated as proof that creation never happened.

## Privacy and retention

Optional notes remain in private Durable Object storage. They are absent from Stripe metadata, Calendar/Meet text, provider-error bodies, routine messages, public status and safe-action audit rows. Failed/expired hold notes are cleared during cleanup; confirmed notes are cleared 30 days after appointment start. Cleanup runs in the alarm workflow and before an admin read. Private reads are audited and limited to confirmed appointments whose early-preparation gate permits access. No AI provider receives notes.

Contact/financial/audit retention, backups and deletion propagation still require a final policy. Clearing a note field is not evidence that backups or external providers have deleted their copies. The original proposed AI workflow is not the implemented V1 scope.

## Verification and release

`npm test` covers domain rules, provider contracts, signatures, SQLite rollback, simultaneous holds, paid-state restart recovery, late/duplicate payment, unknown success, cancellation/refund failure, human resolution, stale messages, capabilities and cleanup. Miniflare tests use real local workerd SQLite Durable Objects. Provider mocks are not account-level evidence. `npm run build:backend` is a dry run. Restricted Windows sandbox execution may need filesystem access for esbuild/workerd dependencies.

**These checks do not prove a real Stripe payment → Google Calendar/Meet → delivered email → cancellation/refund journey.** Complete that deployed test-mode proof, verify scopes and token lifetime, monitor notifications, review retained legacy booking routes, refund liquidity, privacy/legal wording and the integrated visitor experience before enabling paid booking. Website publication remains a separate human-owned decision.
