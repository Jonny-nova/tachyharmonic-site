# V1 launch candidate — 28 September 2026

This is the current acceptance record. It supersedes incomplete checkpoints in [the continuation log](V1-CANDIDATE-2026-09-27.md). Staging acceptance is complete; public launch remains a separate human decision. No live charge, production booking enablement, merge or deployment to tachyharmonic.ai was performed.

## Configured state

- Cloudflare Worker and one SQLite Durable Object own availability, capacity, private intake and durable recovery. Staging booking is enabled, Stripe mode is test, and the provider probe is disabled. Final ordinary deployment including reconciled terms: `b997f361-5a63-4393-9497-308e9c89a293`.
- Existing Google project/client/scopes retained. Verified OAuth credentials were installed as encrypted staging secrets. Worker token refresh, Primary/Work/Home conflict reads, Calendar writes and Google Meet creation all passed. No further consent was requested.
- Existing Stripe sandbox key and signed webhook are installed. All payments below are sandbox GBP payments. The live manual-payout setting was not changed.
- Resend authenticated sender is `bookings@bookings.tachyharmonic.ai`, with Reply-To Jonathan's human mailbox. Porkbun remains for human correspondence.
- Jonathan approved the existing Stripe customer-support geographic address. It is supplied from the secret store before Checkout and in durable terms/confirmation; it is not copied into Git or this record.
- Four superseded Calendly event types were turned off after replacement proof: Conversations on AI, AI Check-in, Clarity Session, and Clarity + Synthesis. Their definitions/history were preserved. The two inactive V1 prototypes remain inactive. All six dashboard switches show off; the public legacy pages report inactive event types.

## Paid browser evidence

Each original offer passed staging selection/intake/consent, real Stripe sandbox Checkout, canonical payment correlation, correct Calendar event/attendee/time/duration, successful Meet, capacity reservation, received confirmation, whole cancellation and full successful refund.

| Offer | Booking reference | London appointment | Final provider outcome |
| --- | --- | --- | --- |
| £30 / 60 minutes | `6fb0bca9-5988-44ec-b7ee-da644753abb9` | 30 September 10:00–11:00 | Event cancelled; 3000-pence refund succeeded |
| £50 / 60 minutes | `11376a3f-4f48-4501-90fc-a16fd8ce0cfa` | 30 September 10:00–11:00 | Decline then successful retry in the same Checkout; event cancelled; pending refund subsequently succeeded |
| £70 / 60 minutes | `63f1e8f5-e935-4487-858c-08518fc59058` | 30 September 10:00–11:00 | Lost create response recovered; review retained event; later cancellation/refund succeeded; email recovery settled |
| £100 / 120 minutes | `3f60933d-de64-46e6-86ff-483e9f3425e9` | 30 September 12:00–14:00 | Whole event cancelled; 10000-pence refund succeeded |
| £140 / 120 minutes | `d3939a4c-c06a-4c4a-b1fe-ef2aba54e449` | 1 October 10:00–12:00 | Whole event cancelled; 14000-pence refund succeeded |

Repeated appointment times are sequential tests after cancellation, not simultaneous confirmations. A separate controlled Google probe also verified the same deterministic event on idempotent retry and verified cleanup. No duplicate event was observed.

## Integrated failure and capacity evidence

- Two concurrent visitors: one hold won the same slot; identical retry returned the same booking. At nine reserved hours, two hours were rejected while one hour was accepted; ten-hour cap then rejected more. Supported ceiling and standard repair boundary passed. Eight unpaid holds expired and restored availability.
- Three confirmed solidarity hours permitted three supported holds; a fourth was rejected while standard remained available. Pending solidarity did not unlock support. Weekend second-client rejection passed. The three holds later expired and restored their slots.
- All three approved Google calendars independently blocked a controlled busy interval, then restored availability after exact test-event cleanup. Notice below 48 hours, dates beyond 28 days and closed weekly windows were rejected. Approved weekly windows/buffers/separation match the specification. No date-specific additions are currently configured; dated-opening logic has local tests.
- Lost Google POST response after actual success: backend remained unconfirmed, then recovered the same canonical event/Meet. A booking-scoped clock exercised under-24-hour review without cancellation/refund; this was explicitly simulated time, not natural elapsed time.
- Cancellation succeeded while refund API returned an injected 503: capacity/event cancellation was recorded, refund stayed pending. Restoring Stripe access created one full refund. Injected email failures did not undo refund success; notifications delivered after restoration and retry state cleared. The discovered stale retry-flag bug was fixed and deployed; final pending-jobs list was empty.
- Definitive Calendar creation rejection after payment, booking `2612acf9-748b-43e8-880e-1d7c9884717d`: no event, failed booking, full automatic refund succeeded and failure/refund/operational mail delivered.
- Actual Calendar conflict introduced after Checkout, booking `a413fd17-f165-492f-9599-1e893e1fb559`: paid booking rejected with `slot_unavailable_after_payment`, no event. Stripe's published refund-failure card first reported succeeded, then failed; the signed event/canonical read changed the booking to attention required.
- That scripted failed refund received one authenticated replacement attempt. A duplicate operator request was rejected. Stripe definitively refused the replacement with HTTP 400; the implementation now records attention required and stops automatic retries, preserving history/generation and sending an alert. Final state is explicit `booking_failed` / `attention_required`, no pending jobs and no appointment. This is a deliberately failed sandbox fixture, not an unresolved live balance or a claim of successful refund. Never overwrite it as refunded.
- Abandoned Checkout `abb00f5c-96b9-4f9f-b142-81a63138c694`: natural hold expiry, then canonical Stripe session expired/unpaid, no payment/event. Browser attempted completion of its stale page and Stripe refused it.
- Delayed webhook `8e549664-71e2-4287-a353-397ccfef05c8`: actual paid Checkout while target webhook returned 503 and Stripe reported one pending delivery. Scheduled canonical reconciliation confirmed one correct event/Meet without webhook acceptance. Normal deployment was restored; whole cancellation and full refund succeeded. Replaying the actual paid event twice after cancellation returned 200 without recreating the booking. An older £30 paid event also returned 200 after its cancellation.

Faults were introduced only through ignored, exact-host/test-mode/booking-specific staging wrappers. They are absent from the final ordinary deployment and are not committed. Canonical provider readbacks, not injected responses, establish payment/event/refund outcomes. This matrix distinguishes controlled faults from naturally occurring provider behaviour; it does not claim exhaustive failure coverage.

## Email, frontend, legal and security

Twenty-five received lifecycle messages across the five offers and failure cases passed SPF, aligned DKIM and DMARC. Sender/Reply-To, GBP amounts, exact contract/early-performance record, full durable terms and private fragment recovery links were checked. Customer cancellation/refund mail recovered after the email outage without duplicate copies. Resend's signed-in dashboard independently showed a delivered operational alert to Jonathan for the failed-booking reference. Seven earlier labelled template tests also verified retry IDs and rendering. No automated email uses the Porkbun mailbox as sender.

Enabled confirmation layouts were inspected at 390, 768, 1024 and 1440 pixels, with measured viewport/no horizontal overflow. Mobile menu and contact anchor work by keyboard; required-field validation focuses name/email; rate/slot labels, loading, confirmed/pending/cancelled states and private recovery were exercised. Pointer and keyboard terms controls passed; an initial automation click timing failure was not reproduced as an application defect. Refresh/back recovery has local regression coverage; actual same-tab prior-booking navigation and fresh delivered-email recovery passed. No screen-reader product certification is claimed.

Terms retain four-week horizon, 48-hour notice, 24-hour policy refund, short-notice personal review, independent statutory cancellation rights, separately requested early performance, model cancellation form, failure/refund treatment and privacy/provider disclosure. Primary checks: [Consumer Contracts Regulations 2013](https://www.legislation.gov.uk/uksi/2013/3134), regulations 13, 16, 30, 32, 34, 36 and Schedule 2; [ICO privacy-information requirements](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/what-privacy-information-should-we-provide/). Detailed terms stay separate from the booking form. Approved brand copy was preserved.

Known actual secret/address values were scanned against tracked files and reachable Git patch history with no match. Secrets remain in encrypted Worker bindings and ignored local setup files. Invalid Stripe signatures, unauthenticated administration and disallowed origins were rejected; private asset paths returned 404. Error bodies did not expose internals. Capabilities, OAuth state/PKCE, validation, rate limits, safe rendering and provider URL/redirect handling have source/local tests. Workerd's unsupported `redirect:error` was found by staging proof and corrected to manual redirect handling with non-success rejection.

## Validation and release gate

Full local suite: **134/134 passed**, resources and `git diff --check` passed. Remote ordinary deployment and final cleanup are verified separately. Detailed private readbacks remain ignored in `.local`; this document contains the shareable evidence.

Before public launch:

1. Resolve the existing Google project's External Testing seven-day refresh-token lifetime. Use the same project/scopes, choose its production/host-only OAuth configuration and verify a durable offline grant. No new consent was requested in this continuation. [Google documents the seven-day testing expiry](https://developers.google.com/identity/protocols/oauth2#expiration).
2. Explicitly configure the production backend/origin, live Stripe key and matching live webhook under the release authorization. Staging credentials are test-only; a test pass does not establish live refund liquidity. Keep the approved manual-payout direction.
3. Jonathan accepts final terms/privacy/retention operations and approves merge/public opening. An optional live £30 payment/refund test requires separate explicit authorization.

The approved address, Google staging consent, sandbox secret and legacy routes are no longer outstanding human blockers. No V2 work was added. PR #10 is the review vehicle; merge and public launch remain prohibited in this task.
