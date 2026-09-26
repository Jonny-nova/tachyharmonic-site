# Website project memory

This is an evidence-labelled index of current work and meaningful product intentions. It links to the detailed sources; it does not replace Jonny's decisions, the brand kit, booking specification, or implementation notes.

## Current snapshot — 26 September 2026

| Question | Current record |
| --- | --- |
| Current website objective | **Not established** by the repository. This documentation task does not select a product objective. |
| Longer-term stated intention | Jonny wants a typed note eventually processed by an AI on his behalf; see [TH-004](#th-004--future-ai-processing-of-a-typed-note). This does not select the current website objective or approve the detailed design, implementation, or release. |
| Working branch | `rebuild/brand-system-v1` at `a22dbb8` when this record was opened. This is local Git state, not an approved website candidate. Recheck Git before using it. |
| Integration target | **Not established.** No approved target branch or website candidate is recorded for future work. |
| Integration owner | **Not established** for the next website objective. Name one owner when substantive work spans components or contributors. |
| Integrated visitor review | **Not established.** Checks and brand review questions exist, but no completed review of the integrated visitor journey is recorded for this branch. No tests or visitor journeys were run for this documentation task. |
| Jonny's acceptance | **Not established.** No acceptance of this branch as a website candidate is recorded. |
| Release state | **No authorization recorded here; live state not checked for this task.** [README.md](../README.md#publishing) says a local rebuild or pull request does not publish the new site. The [intake preview](../index.html) remains disabled and non-submitting. |
| Existing work to preserve | At the start of this task, `BOOKING_IMPLEMENTATION.md`, `css/styles.css`, and `index.html` were modified; `docs/INTAKE_NOTE_WORKFLOW.md` was a **local-only, untracked draft**. Their status and content must be rechecked before subsequent work. |
| Blockers | The next website objective and the approval status of the intake/AI-preparation proposal need Jonny's confirmation. Live booking also has the unresolved integration decisions listed in [BOOKING_IMPLEMENTATION.md](../BOOKING_IMPLEMENTATION.md#external-configuration-required-before-launch). |
| Next action | Ask Jonny to identify the website objective and which, if any, intake proposal elements he has approved. Then identify the integration owner and acceptance evidence appropriate to that objective. |

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
