# Website project memory

This is an evidence-labelled index of current work and meaningful product intentions. It links to the detailed sources; it does not replace Jonny's decisions, the brand kit, booking specification, or implementation notes.

## Current booking-design decisions — 27 September 2026

Source: Jonny's explicit decisions in the current booking-design conversation. These are approved product directions for a launch candidate, **not** legal wording, whole-site acceptance, or publication. The booking specification has now been reconciled as v1.1 and the local gate/rules extended to two-hour appointments during the 27 September implementation sprint; this is local code and has not been deployed or integrated with providers. The earlier 27 September task-closeout snapshot below is preserved as historical state, not the current launch scope.

- **Launch offer:** Paid booking for one-hour sessions at £30 supported, £50 standard, or £70 solidarity, and two-hour sessions at £100 standard or £140 solidarity. No supported or mixed-rate double. A double is one contiguous appointment and consumes two hourly capacity units; a £140 double counts as two solidarity-rate units. Supported places are limited by the weekly rule, not by client identity: repeat £30 one-hour bookings are permitted whenever a place is available. The 27 September sprint added factual two-hour/pricing draft copy and reconciled the old “third £70 solidarity booking” explanation to solidarity-rate time; that booking copy still needs visitor review. The separately approved exact TH-006 wording is recorded below.
- **Availability:** Up to 10 paid client hours per Europe/London Monday–Sunday week; 48-hour minimum notice and a **four-week** booking horizon (superseding the earlier three-week direction). Client appointment windows: Monday 10:00–16:00; Tuesday 10:00–20:00; Wednesday 10:00–14:00 with no clients after 14:00; Thursday 10:00–20:00; Friday 12:00–20:00 with morning closed by default; Saturday and Sunday 12:00–14:00, at most one client appointment per day. Each appointment has 30 minutes' protected preparation before and 30 minutes' decompression/admin after; separate clients need a full 60-minute gap. Buffers may extend outside the stated client windows. Date-specific openings may add normally closed time without changing the weekly pattern, while obeying all ordinary checks. Genuine busy commitments on the Primary, Work, and Home Google Calendars block booking. Availability, collisions, buffers, and concurrent capacity decisions must be deterministic.
- **Booking and contact:** Both durations belong in the launch booking journey; an enquiry route remains alongside it. Jonny reports a single-user paid Calendly Standard account; independently verify account-specific API, calendar, buffer, and payment behaviour before relying on it. Preserve useful settings from four old experimental event types, build and verify replacements, then deactivate all superseded public types and verify old links no longer book; delete obsolete types later if there is no reason to retain them. Do not expose a route that bypasses the gate.
- **Failure and changes:** Payment without a confirmed appointment is a failed booking: promptly refund, say clearly that no booking was made, offer another time, and alert Jonny. If an at-least-24-hour cancellation starts but Calendly cancellation or refund initiation cannot be verified, show a truthful pending state, durably record it, retry safely and idempotently where appropriate, alert Jonny, and later confirm the final outcome to the visitor. Never claim that a refund was initiated until verified. At launch, rescheduling is requested through Jonny and rechecked against the whole appointment's capacity, rate, calendar, and buffer rules; unrestricted self-service rescheduling is deferred.
- **Cancellation:** The 48-hour *booking notice* is separate from the cancellation clock. At least 24 hours before the appointment, provide a controlled online action that cancels the **whole** confirmed appointment (both units for a double), releases its capacity and calendar reservation with buffers, initiates the appropriate full refund automatically, confirms the action and refund initiation to the visitor, and keeps a durable record. Under 24 hours, the controlled online action creates a request for Jonny's fair personal review; it must not automatically cancel or refund, and must tell the visitor what has and has not happened. There is no automatic forfeiture or blanket penalty. Applicable statutory consumer rights take precedence; the statutory cancellation period runs from contract formation, not backwards from the appointment. Retain the separate express early-performance route for work beginning within that period; final wording and any proportionate charge or loss of cancellation right require review against the actual flow and law. Distinguish refund initiation from the bank's posting time.
- **Contact and response:** Intended public human-review address: `jonathan@tachyharmonic.ai`. It must receive enquiries, rescheduling and short-notice cancellation requests, booking/payment failure alerts and other human-review notices. End-to-end inbound, reply and fresh outbound tests now pass with Thunderbird on Windows; phone background arrival and notification failed the observed test below. Do not promise prompt phone alerts. The public response-time promise remains **open**.
- **Human mailbox decision and current account state (27 September):** Jonny approved one Porkbun hosted inbox for `jonathan@tachyharmonic.ai` and completed its purchase and setup manually after the prior task stalled. During read-only reconciliation, Porkbun's email page displayed the hosted account with 10 GB storage and expiry on 27 September 2027. Its forwards list showed only `founder@tachyharmonic.ai` delivered to `tachyharmonicintelligence@gmail.com`; the former `jonathan@` forward was absent. A later account navigation reached a login page, so that account view was not refreshed again. Earlier the same day, before purchase, Porkbun had shown two forwards and no hosted mailbox; that observation and the cart-only state are historical, not current. Jonny rotated the mailbox password after accidental exposure and privately reconnected both Thunderbird clients before acceptance testing. Thunderbird on Android, rather than Gmail for Android, is now the intended phone client.
- **Mailbox acceptance evidence (27 September):** An independent Gmail account sent to `jonathan@tachyharmonic.ai`; Jonny observed the message in Thunderbird on Windows and Android. Jonny replied from `jonathan@`, and the reply reached the independent Gmail inbox. A separate new message sent from Thunderbird on Windows reached Gmail in about three seconds; Gmail's original-message view reported SPF **PASS**, DKIM **PASS** with domain `tachyharmonic.ai`, and DMARC **PASS**. The Windows Thunderbird profile uses Porkbun IMAP on port 993 and authenticated SMTP on port 587. Jonny observed a Windows new-mail notification and Thunderbird opening automatically after Windows sign-in. On Android, the messages appeared only after Jonny manually refreshed the folder; no background arrival or new-mail notification was observed, including after he enabled Inbox Push and Notifications. Jonny explicitly deferred further Android troubleshooting as a lower priority. Record this as a known limitation, not a notification pass.
- **DNS during mailbox cutover and testing:** Public DNS still shows four GitHub Pages A records, the `www` CNAME, Porkbun MX (`fwd1` priority 10; `fwd2` priority 20), Porkbun SPF, `default._domainkey` DKIM and a DMARC quarantine record, matching the earlier recorded structure. No DNS records were changed during this reconciliation or acceptance test; the successful authenticated outbound message showed no specific DNS fault requiring a change. The earlier project note did not preserve a complete record-by-record baseline, so this does not prove that no DNS value changed during Jonny's manual purchase and cutover. Do not press Fix DNS or alter website records without a demonstrated need.
- **Automated transactional email:** A separate launch requirement. Booking confirmations, cancellation confirmations, refund-status messages, receipts and other system-generated mail must use a suitable verified transactional sender, not the Porkbun human mailbox. Provider and setup remain open; future mail authentication must coexist with Porkbun hosted mail. No transactional provider has been chosen or configured.
- **Stripe refund liquidity:** Approved operational requirement for later payment design: funds paid for future appointments should remain available to initiate refunds promptly until the booked work is delivered. Investigate an appropriate payout schedule and/or maintained Stripe-balance reserve against the actual account; do not change payout settings yet. Distinguish immediate *refund initiation* from the bank's posting time. Do not promise that a proposed Stripe setting achieves this until verified.
- **Delivery state:** The human mailbox is configured and the bounded email tests above are complete except Android background delivery/notification. The 27 September implementation sprint added local booking rules, availability checks, an atomic gate contract, provider intent boundaries, draft factual pricing/booking copy and a direct `mailto:` human contact route; see [the implementation note](../BOOKING_IMPLEMENTATION.md). The form remains visibly non-submitting. There is still no deployed booking backend, live payment/Calendly integration, integrated website acceptance or publication. The approved three example-card edits remain local and intact.

## Approved exact launch copy — 27 September 2026

Source: Jonny's direct correction in the current task. He confirmed that the previous “Settle Essential Launch Copy” task approved these **exact** replacements and instructed their application without reopening the decisions. This supersedes the proposal-only status previously recorded for these passages under TH-006; navigation, “Ways to work” versus “How to begin”, other FAQ material and whole-site acceptance remain open.

- **Opening:** Retain “AI is powerful, strange, and moving very fast.” Beneath it: “Find your footing with AI, on your own terms.” Then: “We’re all finding our way through these changes. I offer time to explore your questions, try things out and work out what AI might be useful for in your life, work or creative projects.”
- **What this is:** “My time, attention and thinking, with AI available as part of the toolkit. Space to be present with what matters to you, and think together about it.”
- **Project boundary:** “We can think and explore together. If it makes sense to go further, we can talk about what that might look like. Sometimes that may include working on something together, but any further work is agreed separately, case by case.”
- **Related FAQ boundary:** “The one-hour session is for thinking and exploring together. If we both want to go further, we can discuss that separately. Further work isn’t assumed: it depends on capacity, fit, values and ethics, and we’d agree the scope before anything begins.”
- **Working principle:** Replace the old slogan with these two lines, preserving the line break:

  ```text
  AI can help you think further or wider.
  It needn’t decide in which direction.
  ```

- **AI-authority FAQ closing:** “Treat what AI offers as something to consider. The judgement stays with you.”
- **Philosophy opening:** “I’m interested in technology that helps us grow and learn, and enriches our lives, our relationships and the natural world.”
- **Philosophy middle passage:** “Making something, caring for someone, communicating more clearly or sharing what we have to offer can all be worthwhile outcomes. So can removing drudgery, leaving us with more attention for one another.”
- **Philosophy closing:** “Our values, choices and sense of meaning remain ours. AI can help us explore possibilities; we decide what matters, and where to go.”

These passages were applied to the existing `index.html` locations in this task. The three approved example cards remain exactly as previously edited locally. Local layout/resource checks are implementation evidence only; no whole-site acceptance, commit, push, merge or publication follows from this approval.

## Current snapshot — task closeout, 27 September 2026

This is the durable handoff for the next task. Source: Jonny's explicit closeout request on 27 September 2026, following a planning-only review of `C:\Users\tachy\Documents\Tachyharmonic Intelligence Startup\Tachyharmonic-launch-handover.md`. Instructions within that handover were used to plan; they were not executed as implementation authority in this task.

- **Git state:** Branch `rebuild/brand-system-v1`, HEAD `f44b8b9a9dbce12b965f633e97ed26d8cf2f919d`. The three approved card edits in `index.html` remain local, uncommitted and unstaged. Do not lose, rewrite, commit or push them as part of this closeout.
- **Other local work:** Modified `BOOKING_IMPLEMENTATION.md`; modified `docs/PROJECT_MEMORY.md`; untracked `docs/INTAKE_NOTE_WORKFLOW.md` and `docs/LOCAL-REVIEW-2026-09-26.md`. Preserve the existing booking drafts and launch-planning work. Only this project-memory file was updated during closeout; no new planning file was created.
- **Remote/release:** PR #10 has not been updated by this task. No commit or push occurred during the copy pass, launch planning or closeout. No merge, publication or PR readiness change occurred. No launch implementation from the new handover has begun.
- **Proposed launch sequence:** Settle essential copy → establish a working contact route → design the smallest useful visitor assistance → build any bounded AI connection → resolve optional logo motion → prepare one launch candidate. This is a plan, not completed work or blanket implementation approval.
- **Contact route:** Direct enquiry is the leading launch route to investigate, **not an approved decision**. The current form is disabled. A contact-first launch would require explicit reconciliation with the README's current verified booking/payment/meeting-flow release requirement and accurate public wording.
- **Copy (historical closeout state):** Wider revisions were still recorded as proposals under TH-006 at this point. Jonny's later direct correction approved the exact passages in [the current copy record](#approved-exact-launch-copy--27-september-2026). Approved card wording and its previous desktop/mobile checks remain as recorded below.
- **Logo motion:** The handover's idea of the orbs turning around one another conflicts with the current `LOGO_SPEC.md`, which prohibits orbiting and whole-mark rotation. An explicit later brand decision is required; none was made here.
- **Launch scope:** The garden / Pixel Johnny / voice / larger knowledge experience remain outside launch scope. Practical visitor assistance stays in the proposed launch sequence; no AI connection, note transmission or booking architecture change has been implemented by this planning work.
- **Two-hour sessions:** Deferred. TH-007 preserves the stated £60 / £100 / £140 intention; capacity, buffers, notifications and booking-rule treatment remain unresolved. Do not advertise or implement them from this closeout.
- **Next task reading order:** Read `AGENTS.md`, then this current snapshot, then README and the linked local review record. Use the external launch handover as planning context, and inspect the relevant brand/logo and booking authorities before dependent work. Recheck the working tree rather than assuming this dated snapshot is still current.
- **Single recommended opening objective:** Help Jonny settle the essential launch copy, beginning with the opening and offer boundaries, at his pace. Keep proposals distinct from approved wording; do not start booking, AI or logo implementation as part of that opening discussion.

## Earlier snapshot — Rowan copy pass, 26 September 2026

- **Objective:** Apply Jonny's three approved example accounts, check their desktop/mobile readability, and propose remaining copy for discussion. The source is Jonny's “Tachyharmonic website: copy review following discussion with Rowan” brief in this task.
- **Branch and reference:** `rebuild/brand-system-v1`, HEAD `f44b8b9a9dbce12b965f633e97ed26d8cf2f919d`, matching the local remote-tracking ref at inspection. No reset. Existing draft PR #10 remains the review context; these copy-pass changes are local and uncommitted.
- **Delivery:** Exact approved titles and paragraphs applied in `index.html`; visually checked at 1440 × 900 and 390 × 844. No CSS change needed. Details, proposals and evidence are in [the local review record](LOCAL-REVIEW-2026-09-26.md#rowan-copy-pass--26-september-2026).
- **Preservation:** Existing modified `BOOKING_IMPLEMENTATION.md` and untracked `docs/INTAKE_NOTE_WORKFLOW.md` left untouched. Existing project-memory and local-review notes retained and extended. No booking implementation or redesign in this pass.
- **Acceptance/publication:** Neither authorized nor performed. No commit, push, merge, deployment or PR readiness change in this pass.
- **Next discussion:** Review the proposed opening, offer boundaries and philosophy at Jonny's pace; navigation and “What kind of mind am I hiring?” remain open. Future booking duration and experience intentions are TH-007 and TH-008.
- **Open dependencies:** Intake/AI-preparation details remain unconfirmed under TH-003/004. Two-hour availability, buffers, notifications and their relationship to TH-002 need design before implementation.

## Earlier snapshot — 26 September 2026, before Rowan's brief

Preserved for history. The current objective and next action above supersede the corresponding entries below.

| Question | Current record |
| --- | --- |
| Current website objective | Local desktop and mobile review with Jonny, including copy and visitor understanding. See [26 September review notes](LOCAL-REVIEW-2026-09-26.md). This is not acceptance or publication. The earlier documentation task did not establish an objective; Jonny established this one in the subsequent review conversation. |
| Longer-term stated intention | Jonny wants a typed note eventually processed by an AI on his behalf; see [TH-004](#th-004--future-ai-processing-of-a-typed-note). This does not select the current website objective or approve the detailed design, implementation, or release. |
| Working branch | `rebuild/brand-system-v1` at `a22dbb8` when this record was opened. This is local Git state, not an approved website candidate. Recheck Git before using it. |
| Integration target | **Not established.** No approved target branch or website candidate is recorded for future work. |
| Integration owner | **Not established** for the next website objective. Name one owner when substantive work spans components or contributors. |
| Integrated visitor review | **In progress, not complete.** Jonny has identified a mobile hero spacing issue and begun a copy review. The local hero correction was checked at 390 px and 1440 px; this is not verification of the whole visitor journey. See [review notes](LOCAL-REVIEW-2026-09-26.md). No tests or visitor journeys were run for the earlier documentation task. |
| Jonny's acceptance | **Not established.** No acceptance of this branch as a website candidate is recorded. |
| Release state | **No authorization recorded here; live state not checked for this task.** [README.md](../README.md#publishing) says a local rebuild or pull request does not publish the new site. The [intake preview](../index.html) remains disabled and non-submitting. |
| Existing work to preserve | At the start of this task, `BOOKING_IMPLEMENTATION.md`, `css/styles.css`, and `index.html` were modified; `docs/INTAKE_NOTE_WORKFLOW.md` was a **local-only, untracked draft**. Their status and content must be rechecked before subsequent work. |
| Blockers | The next website objective and the approval status of the intake/AI-preparation proposal need Jonny's confirmation. Live booking also has the unresolved integration decisions listed in [BOOKING_IMPLEMENTATION.md](../BOOKING_IMPLEMENTATION.md#external-configuration-required-before-launch). |
| Next action | Continue the local review at Jonny's pace. Discuss the navigation labels, working-principle bar, and human-agency copy before selecting or implementing further wording. Intake/AI-preparation proposal approval remains unconfirmed. |

## How to use the intention ledger

Use an item for a meaningful request, product decision, rejection, refinement, or supersession. A tiny correction does not need one. Record the source, the evidence for Jonny's decision (or say it is missing), dependencies, relevant implementation, acceptance evidence, and next action. Link to source documents rather than copying their rules. This ledger does not turn a document's claim of approval into an independently established Jonny decision.

The existing master brand system, logo specification, and booking specification remain operative topic authorities. An absent separate dated approval event in this ledger does not suspend them.

Keep two states separate:

- **Decision:** `idea`, `exploring`, `approved`, `deferred`, `rejected`, `superseded`, or `unconfirmed`. `Idea` can record a directly stated longer-term wish without making it a current objective or approval to implement. `Unconfirmed` is for a claimed or implied decision whose supporting Jonny approval has not been located. `Exploring` permits investigation, not implementation approval. Record the dated evidence before changing a state to `approved`.
- **Delivery:** `not started`, `active`, `implemented`, `verified`, or `not established`. Scope each delivery claim: local rule code may be implemented while the visitor booking journey is not. `Verified` needs recorded results for the integrated experience, not merely a test file or preview image.

Jonny's acceptance and publication are separate from both states. Preserve an earlier item's text when intent changes; add a dated linked refinement or superseding item and review only explicitly dependent work.

## Evidence-supported starting entries

### TH-001 — Human-authored brand experience and provisional mark

- **Decision:** `unconfirmed` only for a separate dated Jonny approval event. The [master brand system](<../../Brand and Design/TACHYHARMONIC_MASTER_BRAND_SYSTEM.md>) identifies itself as the primary brand source; the packaged [logo specification](<../../Brand and Design/Tachyharmonic_Brand_Design_System_v1.0/tachyharmonic_brand_v1/logo/LOGO_SPEC.md>) calls the mark approved and provisional. Both remain operative authorities without an invented separate sign-off.
- **Delivery:** `not established` for the complete visitor experience. [index.html](../index.html), [css/styles.css](../css/styles.css), and the [README](../README.md) show local implementation, including the production logo copy; they do not establish integrated acceptance.
- **Dependencies:** Changes to experience or copy should follow the master; changes to mark geometry or usage should follow the logo specification. The brand kit is outside Git, so a standalone checkout lacks these sources.
- **Acceptance evidence:** None recorded for the whole visitor journey. The master's current brand test is a review guide, not a completed review.
- **Next action:** Use these authorities for relevant work; confirm any intended revision with Jonny before changing them.

### TH-002 — Weekly booking economics and gated booking journey

- **Decision:** `unconfirmed` only for a separate dated Jonny approval event. [BOOKING_SYSTEM_SPEC.md](BOOKING_SYSTEM_SPEC.md) remains the operative authoritative functional specification and requires Jonny's explicit approval to change its economic rule. Do not reinterpret its rules from this ledger.
- **Delivery:** `implemented` only for the local rule and gate contract in [booking](../booking). The [implementation note](../BOOKING_IMPLEMENTATION.md) says payment, calendar, and live booking are not connected; the public [form](../index.html) remains a disabled preview.
- **Dependencies:** Live delivery depends on the provider, policy, storage, and integration decisions in the implementation note. Preserve the existing economics and current preview boundary.
- **Acceptance evidence:** [booking/booking.test.js](../booking/booking.test.js) contains rule cases; no test was run for this documentation task, and no integrated live journey verification is recorded here.
- **Next action:** Resolve the implementation note's open decisions and obtain integrated evidence before a release decision.

### TH-003 — Optional typed note in the disabled preview

- **Decision:** `unconfirmed` for live note collection and handling. The current [form](../index.html) visibly offers an optional note; its presence does not establish approval of a live note service.
- **Delivery:** `implemented` only as a disabled, non-submitting preview. The form sends or saves nothing. Live note collection and storage are `not started`.
- **Dependencies:** A live note path needs the booking, privacy, retention, and client-wording decisions recorded as proposals in the local-only, untracked draft `docs/INTAKE_NOTE_WORKFLOW.md`. That path is text here because the draft is not part of a standalone Git checkout.
- **Acceptance evidence:** No live note journey or Jonny acceptance is recorded.
- **Next action:** Preserve the preview boundary; settle the live note scope before enabling collection.

### TH-004 — Future AI processing of a typed note

- **Decision:** `idea` — Jonny's stated high-level intention, without implementation authority. Jonny said in the 25 September 2026 project conversation that he wants a typed note eventually sent to an AI of his on his behalf for processing. This conversational provenance was supplied in the 26 September governance correction request; the full conversation is not stored in this repository. It does not approve a detailed workflow.
- **Delivery:** `not started` for sending a note to AI or processing it. TH-003 covers the separate preview field.
- **Dependencies:** Provider, processing instructions, client choices, privacy handling, early-start terms, and release scope remain open. The local-only, untracked draft `docs/INTAKE_NOTE_WORKFLOW.md` explores one workflow and uses some "settled intent" labels, but those detailed approval claims are not independently established here. The booking economics in TH-002 do not depend on adopting AI processing.
- **Acceptance evidence:** The draft lists proposed scenarios, not completed results. No AI-processing implementation, integrated experience verification, or Jonny acceptance is recorded.
- **Next action:** Confirm the intended scope with Jonny before treating any detailed processing design as `approved`. Keep note collection, AI processing, early-start choice, and meeting-summary interest distinct if refined later.

### TH-005 — Three approved short example accounts

- **Decision:** `approved` — exact titles and paragraphs supplied by Jonny in the Rowan copy-review brief on 26 September 2026. Short accounts are sufficient; no expanded stories, testimonials or additional case-study pages wanted.
- **Delivery:** `verified` for this local copy change only: all three accounts applied verbatim, desktop/mobile layout inspected, and resource check passed. See the [review record](LOCAL-REVIEW-2026-09-26.md#rowan-copy-pass--26-september-2026).
- **Dependencies:** Refines the earlier example summaries within TH-001. Retains existing card labels/layout. Existing collapsed “A few more ways…” content was not expanded or removed.
- **Acceptance/publication:** No whole-site acceptance or publication approval.
- **Next action:** Include these exact accounts in subsequent draft review work.

### TH-006 — Opening, offer boundaries and philosophy

- **Decision:** `approved` for the [exact listed replacements](#approved-exact-launch-copy--27-september-2026) by Jonny's direct 27 September correction. Earlier proposal-only treatment was accurate to the then-available record but is superseded for these passages. The two ways to work remain accurate; further project work is agreed separately, case by case. This does not settle navigation or other unrelated copy.
- **Direction:** The retained opening, offer boundary, two-line working principle and philosophy are now exact approved page text above, rather than suggested directions.
- **Tone:** Honesty, congruence, gentle ease and clear ethical boundaries. Preserve the honesty of “Hello. I’m Jonathan.” “What kind of mind am I hiring?” remains open; its humour and acknowledgement of the transaction are welcome. Earlier navigation feedback remains open.
- **Delivery:** Exact approved passages applied to the current local `index.html`; the repeated AI-authority slogan and old principle text were reconciled. Desktop/mobile and resource checks are recorded in this task's closeout, separate from acceptance or publication.
- **Dependencies/conflicts:** Refines TH-001 and earlier review feedback. The brand master outside this repository repeats the older categorical project-service boundary and philosophy language; it was not revised in this bounded site task. The exact FAQ refers to a one-hour session while the approved launch offer also includes two hours; the wording is applied verbatim as requested, and this scope distinction can be considered during visitor review without silently editing the approved text.
- **Next action:** Preserve the exact approved copy and review it in the integrated visitor journey. Continue other unresolved copy questions separately.

### TH-007 — Two-hour session intention

- **Decision:** `idea` for subsequent design, with Jonny's willingness and rates explicitly stated on 26 September 2026: two-hour sessions at twice the selected hourly rate, £60 / £100 / £140, provided suitable space exists around them. This is not booking implementation authority.
- **Delivery:** `not started`. Public pricing and disabled preview remain based on 60-minute sessions.
- **Dependencies:** Refines the duration assumption associated with TH-002. Calendar availability, buffers and notifications need designing against the existing booking rules. The current specification counts sessions/bookings at fixed rates; duration's effect on weekly capacity, supported/solidarity counts and revenue must be resolved explicitly. Do not assume one two-hour booking consumes one slot or two, or grants one or two supported entitlements.
- **Next action:** Bring these questions to the next booking design discussion; preserve existing rules until their extension is approved.

### TH-008 — More inventive, calm website experience

- **Decision:** `exploring` — Jonny wants an experience that visibly demonstrates his capabilities while remaining calm and human. Page length, navigation and the route to booking are part of that exploration.
- **Delivery:** `not started` for redesign; recorded only in this copy pass.
- **Dependencies:** TH-001, the earlier navigation feedback, and an agreed design direction. No interaction, layout or booking implementation is authorized by this intention.
- **Next action:** Explore at the next design discussion, after allowing time for copy review.
