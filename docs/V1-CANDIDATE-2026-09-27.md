# V1 continuation evidence — 27 September 2026

Status: in progress; not launch acceptance. This continues the clean checkpoint under Jonathan's explicit finish-integration brief. Root owns integration; bounded reviewers covered backend recovery/security, legal/privacy and frontend recovery/accessibility. Public launch and merge remain prohibited.

## Starting state verified

- Branch `rebuild/brand-system-v1`, clean working tree, HEAD `dc7150ab7bdb543a84febbfafcdec85ad208601f`.
- Six local commits beyond remote `f44b8b9`: `4ae8bfd`, `7a72ca0`, `211f6c0`, `1d17763`, `34c4626`, `dc7150a`.
- GitHub PR #10 readback: open, draft, unmerged, base main, head `f44b8b9a9dbce12b965f633e97ed26d8cf2f919d`.
- Staging health and frontend configuration both disabled. Cloudflare deployment readback matched prior `693a7019-0f6d-4e5c-af2b-51c01a413139`.
- Initial full local suite 109/109 passed.

## Provider configuration and evidence

- Existing Google project retained. Saving the already-entered `mrbonello@gmail.com` test user succeeded; Audience displayed one test user. Actual authorization then reached the Calendar consent screen instead of rejecting the account. The prior failure was not reproduced; no evidence establishes its original cause. OAuth grant/refresh and Calendar/Meet proof remain pending.
- Current Windows user's Wrangler credentials were absent. Localhost OAuth failed, including an observed CSRF mismatch; device-code authorization succeeded with the same five approved permissions. No additional scopes or new Cloudflare account.
- Existing Stripe sandbox secret transferred through a loopback-only private form, never printed or placed in tracked files; local credentials ACL restricted. API balance returned HTTP200 with `livemode:false`; account readback was the existing GB individual sandbox `acct_1SniyZPZbbJDVb4Q`.
- Jonathan explicitly approved using the existing Stripe customer-support geographic address. It was imported privately into `TRADER_ADDRESS`; no address copied to Git or evidence notes. The key and address were installed as encrypted staging secrets, with successful name-only readback.
- Real Stripe adapter checks created all five GBP Checkout amounts (3000,5000,7000,10000,14000 pence). Same-key retries returned the same Session; metadata/client-reference correlation and authoritative amounts matched. Each remained unpaid and was explicitly expired and read back `expired`. No charge, refund or appointment occurred in these adapter checks. These are provider adapter evidence, not end-to-end booking passes.
- Disabled candidate deployed as `1858a67d-0138-4a50-9b52-13a3fbb68ec8`. Remote `/api/terms` returned200, no-store, current full terms and approved address; private credential path remained404 and booking remained disabled.

## Fixes and local checks

- Refund `requires_action` immediately records attention required and sends pending/alert messages, without false initiation messaging; identity retained for reconciliation.
- Google booking calendar must be included among three conflict calendars. Explicit token failure before event dispatch permits safe retry; unknown writes remain protected.
- Short-notice review retains Meet access for an unchanged still-booked appointment. New-booking keyboard focus returns to the first rate choice.
- Current terms and approved address are fetched before payment; missing or malformed terms fail closed. Terms page renders the full snapshot as literal text. Statutory rights, model cancellation form and refund timing reconciled.
- Privacy transfer facts researched from authoritative provider documents. Resend Ireland is sending region, not data residency; its published storage is US. Purpose-based retention procedure prepared for Jonathan's launch acceptance.
- Full suite after these fixes: 118/118 passed. Resource and whitespace checks passed. Dry-run backend build passed. Browser/provider acceptance remains separate.

## Additional acceptance evidence

- Independent actual-browser disabled-preview checks: observed viewports 390x844,768x900,1024x900,1440x900. No horizontal overflow on main or terms page; keyboard mobile menu opens/closes and follows anchor, visible focus and form labels verified. Terms snapshot/address loaded; values not copied into report. Enabled lifecycle states remain unproved.
- Seven clearly labelled STAGING TEMPLATE TEST messages sent using the current notification adapter/renderer, with an explicit no-transaction wrapper. Resend accepted each and identical retries returned the same message ID. Dashboard reported all seven delivered, including operational alert to Jonathan's human mailbox. The six customer-template messages appeared in the intended Gmail inbox exactly once each.
- Gmail authentication readback for confirmation and manual-review templates: SPF PASS, DKIM PASS for bookings.tachyharmonic.ai, DMARC PASS; Reply-To Jonathan's business mailbox, UTF-8 plain text. Received confirmation preserved GBP amount, early-performance choice, full terms and model cancellation form. Review message preserved statutory-rights clarification. These tests establish template delivery/rendering/idempotency, not booking-event triggers or private recovery-link delivery.
- Resend domain currently verified, Ireland sending region, TLS Enforced; tracking configuration has not been enabled. No mailbox/DNS changes in this continuation.
- Known actual secret/address values scanned against all reachable Git patch history and tracked working files: no matches. This is a bounded known-value check, not proof that every possible credential format was detected.
- Optional Meet: existing account exposes an In-person notes control and a premium-feature upgrade banner. Clicking notes opened an empty first-participant session; it was immediately left by returning home. No recording/transcription controls or feature completion were verified, and no recording/microphone permission was granted by this task. Optional AI notes are not V1 acceptance evidence or a blocker.

## Saved continuation checkpoint

Implementation fixes are committed locally as `e2d89b8`. Provider/actual disabled-browser evidence above is saved separately from paid acceptance. No candidate push, PR description/readiness change, merge or tachyharmonic.ai deployment occurred. Google host consent remains the immediate human prerequisite; full paid lifecycle, integrated failure tests, production OAuth readiness, legacy-route closure and final launch acceptance remain outstanding. This checkpoint is not the final launch gate.
