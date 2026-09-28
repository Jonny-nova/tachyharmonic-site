# Intake note and AI preparation workflow

Status: design specification only. The public intake form is a non-submitting preview; no note storage, AI preparation, private review service, payment flow, or appointment integration is live in this repository.

## Authority and decision labels

- **Settled intent** means a product or human-control boundary supplied for this workflow. It does not by itself mean the feature is implemented or that legal wording has been approved.
- **Proposed implementation** means a design to build and verify before release.
- **Open decision** means a choice that must be resolved before the relevant live feature or public claim is enabled.

[BOOKING_SYSTEM_SPEC.md](BOOKING_SYSTEM_SPEC.md) remains authoritative for weekly capacity, rate availability, and solidarity rules. [BOOKING_IMPLEMENTATION.md](../BOOKING_IMPLEMENTATION.md) describes the local booking gate and proposed payment/appointment integration. This document adds a note and preparation workflow; it does not change either booking rule set.

## Purpose and human authority

**Settled intent.** Tachyharmonic offers the same 60-minute online session at £30 Supported, £50 Standard, or £70 Solidarity. A client may provide an optional note of roughly 1,200 characters to help Jonathan prepare, or book with no note. Declining AI preparation does not change the session or its price. Jonathan can always read the exact original note. If requested, an AI produces a private draft brief to help him prepare; the human remains the author of the session and any client communication.

The AI must not decide suitability, rate, booking acceptance, cancellation, refund, or what Jonathan says to a client. It must not make a risk score or trigger a booking decision. The booking gate remains the authority for capacity and rate availability; a human decides service and cancellation matters within the published policy and applicable law.

## Client experience and separate choices

**Proposed implementation.** Put a plain-language explanation immediately beside the note field, before the client types: the note is optional, Jonathan will be able to read it, and an optional AI brief would be private and for preparation. Explain that declining the brief leaves the same session and that the original note remains available to Jonathan. Do not describe a provider, storage practice, or privacy protection as fact until verified. Keep the existing approximate 1,200-character limit and a prompt to avoid unnecessary sensitive details; the prompt does not guarantee that clients will omit them.

Offer an initially **unticked** choice such as “Please make a private AI preparation brief from my note.” Treat a missing choice as declined. Explain what data the selected provider receives once the provider and route are verified. A no-note booking must not require or imply AI processing. The choice to request a preparation brief is separate from:

1. Any agreement to record or transcribe the meeting, or create an AI meeting summary. The current preview's summary checkbox only expresses interest and is not permission to activate it.
2. The express request to begin supplying the service during the consumer's 14-day cancellation period. Neither choice should pre-tick or imply the other.

Link the full Privacy Notice beside the note and in the footer when the real site flow is implemented. Name the actual AI provider in public disclosure only after its identity, account configuration, data route, and terms have been verified. Do not publish placeholder provider names or unfinished privacy claims.

## Booking and processing sequence

**Proposed implementation.** Use an opaque booking reference to join the checkout, appointment, and private note records. The private note store is the source for the original text; Stripe handles payment and Calendly handles the appointment. Neither is a note archive.

1. Collect the optional note and the separate choices. A temporary server-side checkout record may hold the note, protected as private data and associated with an expiring hold. Define and implement a short expiry and cleanup job before launch; discard the temporary note when checkout is abandoned, payment fails, or the appointment cannot be confirmed. Log only the reference and cleanup outcome, not text. A paid but failed appointment needs the rebooking/refund process from the booking implementation note; it is not a completed booking.
2. Create Stripe Checkout using only the opaque reference and required payment fields. Verify payment server-side from a signed Stripe event or reconciliation, with idempotency. A checkout return page is not proof of payment.
3. Confirm the appointment through the gated Calendly flow and reconcile ambiguous outcomes. Only when **both** payment is verified and the appointment is confirmed should the private record become a confirmed booking. Preserve the booking gate's capacity and solidarity rules throughout.
4. Promote the original note to the private confirmed record, if present. Then, if the client requested an AI brief and the early-start rule permits preparation, queue the brief. Send Jonathan a new-booking notice containing only a safe reference or authenticated link. No completed-booking notice or AI call occurs before both gates succeed.
5. If AI generation fails, leave the booking valid. Show the original note and an explicit “Brief unavailable” state, with an error reference that contains no note text. Jonathan can prepare manually.

Keep raw note text out of Stripe metadata, Calendly descriptions, Zoom invitations, calendar fields, routine notifications, analytics, traces, and logs. Use minimal provider fields needed for payment and scheduling. Avoid accidental text in exception messages, webhook payload logging, query strings, and monitoring tools. Authenticate and authorize any link before showing the note; a notification link must not itself contain the note or grant access by possession alone.

**Open decision.** Set a concrete temporary-note expiry, cleanup frequency, failed-confirmation handling, and retention period before collecting live notes. Verify backups and deletion propagation as part of that decision.

## Early preparation and cancellation

**Settled intent.** Treat AI brief generation and Jonathan's substantive reading, thinking, or discussion about a note as possible early performance of the service. Where either would begin within the consumer's 14-day cancellation period, the booking flow needs a separate express early-start request. Before that choice, explain potential proportionate payment for service actually supplied during the period and acknowledge that the change-of-mind right can end after the service is fully performed. Record the contract timestamp and the exact wording, version, value, and timestamp of each separate choice, including the early-start request and AI-brief choice. Keep a durable record of what the client saw.

**Proposed implementation.** If the client does not request early start, defer AI generation and Jonathan's substantive preparation until the period has ended. If the chosen session would itself fall within the period, offer a later appointment rather than silently starting early. Do not use a blanket “within 24 hours means no refund” rule. Cancellation and refund decisions need a published policy and human review under applicable consumer law, including the circumstances in which no deduction is due.

Only Jonathan's **actual** human preparation minutes can be entered as preparation time. AI generation, sending a notice, and merely opening a page are zero human preparation minutes. No note may mean zero note-reading minutes; a five-minute discussion is five minutes. The private view should offer an explicit, editable action to record the date, actual minutes, and a short non-sensitive description of reading, thinking, or discussion. It must not start a timer from page open or infer time from a Work conversation. A recorded review may inform a fair, human-reviewed cancellation decision, but must never automatically calculate a fee, deduction, or refusal. Preserve the original entry and every correction.

**Legal review before release.** The [Consumer Contracts Regulations, regulation 36](https://www.legislation.gov.uk/uksi/2013/3134/regulation/36) govern express requests, full performance, and proportionate payment for services supplied during the cancellation period. Final client wording and the cancellation/refund policy require review against the actual contract and booking flow; this design does not itself establish an entitlement to deduct.

## AI brief contract and safeguards

**Proposed implementation.** Produce a small, provisional brief with only:

- the client's stated topic and what they explicitly hope to explore;
- two or three possible opening questions for Jonathan;
- uncertainties to clarify and any materials the client mentions; and
- a neutral service-boundary reminder where relevant.

Mark it as an AI draft for Jonathan, never as a client statement or a decision. Do not infer diagnoses, vulnerability, income, motives, suitability, or risk scores. Do not invent research, promise outcomes, or draft a reply to the client for unreviewed sending. Preserve uncertainty and distinguish client words from model suggestions.

Treat the note as **untrusted data**. Its embedded instructions cannot invoke tools, change system instructions, reveal another booking, retrieve unrelated records, or alter booking/refund rules. Pass only the minimum confirmed-booking note to the chosen AI route after the client's choice and early-start gate permit it. Isolate each booking; give the brief generator no booking-management tools or access to other clients. Validate the output shape, constrain length, and have Jonathan review it before relying on it. Prompt-injection examples belong in tests, not in live logs.

Show the exact original note and the brief side by side in the private review view, with clear labels. Record each brief's creation time, provider/model identifier, prompt version, status, and the note version it used. Regeneration creates a new version with its own timestamp and reason; it must not silently erase an earlier brief. A corrected original note, if allowed, needs a traceable version as well.

## Private first release and later Work connection

**First release — proposed implementation.** Build a secure private review view that works without ChatGPT Work. Jonathan signs in, opens a confirmed booking, sees original note and brief side by side, sees failures and versions, and explicitly records or corrects actual preparation time. A new-booking notification contains only a safe reference or link to that view. The live booking service and review view must be hosted independently of Jonathan's PC; a local machine may only be a development bridge. Protect the view with chosen private authentication, server-side authorization for each booking, encryption in transit and at rest, restricted admin access, and an audit trail. Do not place notes or provider keys in a public static bundle.

**Later option — proposed implementation, subject to verification.** A private ChatGPT Work connection could expose narrow authenticated tools such as `list_sessions_needing_review`, `get_session_note_and_brief`, `record_preparation_review`, and `correct_preparation_review`. Jonathan could fetch one booking into a conversation, discuss it, then explicitly request a record of actual minutes. Limit tool scope to his authorized bookings; require an explicit action for each time write, validate nonnegative minutes and booking identity, and retain correction history. Do not assume a website can push note content into a new Work conversation or that a conversation provides reliable time spent. Verify actual account support, authentication, tool permissions, data handling, and provider availability before building this connection. The first release must remain usable when Work is unavailable.

Use distinct event types: `brief_generated`, `notification_sent`, `note_opened`, `human_review_recorded`, and `review_corrected`. They describe different facts. Only an explicit `human_review_recorded` event, as corrected by any later `review_corrected` event, counts as Jonathan's preparation time. `note_opened` is an access audit event, not proof of reading duration. Preserve a timestamped, attributable audit history; corrections append to it rather than editing past events in place.

## Private records, privacy, and deletion

**Proposed implementation.** Separate the booking/payment/appointment reference from a restricted note record. The private record needs booking reference and status; exact original note and any traceable versions; AI-brief request and early-start choice with wording/version/timestamps; contract timestamp; brief versions and failure state; provider/model and prompt version; notification and access events; human review entries and corrections; deletion status; and only the provider identifiers needed for reconciliation. Avoid storing unnecessary client details in AI prompts or audit events. Restrict read access to Jonathan and narrowly authorized service processes, and write access by function. Audit access without copying the note into audit logs.

Decide retention for abandoned temporary notes, confirmed notes, briefs, choice evidence, review and cancellation records, backups, and provider-side copies. Document deletion triggers, client-request handling, backup expiry, and how to verify that deletion completed. Do not promise immediate deletion until the actual storage and provider behavior support it.

The UK Privacy Notice must accurately state the actual provider and recipients, purposes and lawful basis for each processing operation, any sensitive free-text content, data location/transfers where relevant, retention, rights, and contact details. An operational opt-in to an AI brief is **not by itself** the entire UK GDPR lawful basis; assess and document the lawful basis for each operation and any additional condition needed for special-category data before launch. The [ICO's AI lawfulness guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/artificial-intelligence/guidance-on-ai-and-data-protection/how-do-we-ensure-lawfulness-in-ai/) and [privacy information guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/what-privacy-information-should-we-provide/) are review inputs. This document is not a published Privacy Notice.

## Website placement when implemented

| Surface | Content to add or verify |
| --- | --- |
| Practical FAQ | Optional note, same session if declined, Jonathan's review, and separation from meeting recording or summary. |
| Note field | Before-entry AI explanation, unticked brief choice, sensitive-data prompt, and full Privacy Notice link. |
| Checkout | Separate early-start request and required cancellation explanation, with wording/timestamps captured independently of AI choice. |
| Dedicated Booking/Cancellation/Refund page | Booking completion order, cancellation rights, human-reviewed proportionate service question, failed confirmation, and refund route once decisions are settled. |
| Dedicated Privacy page | Verified provider, purposes, lawful basis, recipients, retention, rights, contact details, and any sensitive-data handling. |
| Footer | Links to the dedicated Booking/Cancellation/Refund and Privacy pages. |
| Confirmation email | Confirmed appointment and safe account/review information, choices and cancellation information as required; never the raw note or brief. |
| Root `sitemap.xml` | Add the dedicated public pages when published. Preserve the root `CNAME`. |

The current form in [`index.html`](../index.html) remains a non-submitting preview with a disabled submit button until the full flow and public wording have been built and tested. The existing “AI meeting summary” interest choice does not serve as the intake-brief or early-start choice. Do not add public promises to this preview before the actual provider, privacy and cancellation text are settled.

## Staged implementation and verification

1. Settle provider, privacy, retention, authentication, cancellation/refund wording, contact details, and early-start presentation. Verify Stripe/Calendly account capabilities and the chosen AI provider's actual data handling. Review the public claims before launch.
2. Build private temporary-note storage, expiry/deletion job, explicit choice evidence, and the payment-plus-appointment confirmation gate. Keep note text out of payment, calendar, notifications, and telemetry. Reconcile duplicate and out-of-order provider events.
3. Build the independent private review view and safe notification. Add explicit human-time entries, correction audit, access control, deletion, and brief failure state. Make the manual original-note path usable first.
4. Add the optional AI brief behind both the confirmed-booking and early-start gates, with prompt isolation, output limits, versions, and failure handling. Verify the AI-declined path never sends the note to AI.
5. Complete public FAQ, field disclosure, checkout, dedicated policy pages, footer, confirmation email, and root sitemap. Keep the preview disabled until end-to-end test evidence supports a real flow. Consider Work integration later after verifying account support and authentication.

Meaningful tests before release:

| Case | Expected result |
| --- | --- |
| No note | Booking can complete; no AI call or note-reading time is inferred. |
| Note present, AI declined | Same booking and session; Jonathan can read exact original; no AI call. |
| Abandoned checkout or failed payment | Temporary note expires and is deleted; no confirmed notice or AI call. |
| Paid but appointment fails | No completed-booking notice or AI call; note cleaned under the defined rule; rebooking/refund path invoked. |
| AI generation fails | Confirmed booking remains valid; original visible; brief clearly unavailable. |
| Malicious instructions in note | No tool call, cross-booking disclosure, rule change, or unreviewed client reply. |
| Cancellation before and after actual review | Human sees accurate events and considers only actual service supplied; no automatic fee or blanket 24-hour rule. |
| Early-start choice absent | No preparation during the period; later appointment offered if needed. |
| Duplicate or out-of-order webhooks | One confirmed booking, at most one initial brief/notice, and stable note state. |
| Unauthorised access | No note, brief, or time record disclosed or changed; attempt audited without text. |
| Corrected time entry | Correction appends to audit; effective minutes update; original entry remains visible. |
| Note deletion | Active and temporary stores, generated brief, and backups follow documented retention/deletion rules; outcome can be verified. |

## Open decisions before a live release

- Select and verify the actual AI provider, model/account route, data processing terms, retention and any transfer arrangements. Decide whether it is acceptable for sensitive free text and what to do if it is not.
- Set concrete temporary and confirmed-note retention periods, backup/deletion behavior, and client-request procedure.
- Choose and test private authentication, authorization, hosting, incident handling, and safe notification delivery.
- Approve accurate contact details, Privacy Notice, Booking/Cancellation/Refund terms, early-start wording, and the human cancellation review process.
- Resolve paid-but-unconfirmed appointments and the interaction with the existing booking gate's rebooking/refund policy.
- Verify whether ChatGPT Work and narrow authenticated tools are actually available on Jonathan's account; keep this optional.
