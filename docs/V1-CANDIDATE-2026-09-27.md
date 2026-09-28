# V1 continuation evidence — 27 September 2026

This timestamped work log is superseded for current state by [the 28 September launch-candidate acceptance record](V1-LAUNCH-CANDIDATE-2026-09-28.md). Pending items below describe their historical checkpoints, not current blockers.

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

## Verified OAuth and deployed-runtime integration follow-up

- Jonathan confirmed successful OAuth completion and authorized secure staging secret installation without another consent attempt. The existing project/client/scopes were retained. The saved refresh token successfully refreshed locally; `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REFRESH_TOKEN` were installed into the staging Worker secret store and names read back. Values remain outside Git/output.
- Direct provider reads succeeded for Primary, Work and Home with the new credentials. This is initially local provider evidence; remote proof follows below.
- A staging-only, administrator-authenticated provider probe was added with a default-off flag, exact staging hostname, test-mode gate, fixed test attendee and deterministic event identity. It cannot create a paid booking or modify the booking ledger. Its controlled appointment is removed after verification; uncertainty is reported explicitly.
- First remote probe on deployment `5bc0a3ac-04e4-4194-aecb-73649a5082a7` failed before Calendar creation with `response_unknown`. A real workerd Request-constructor check reproduced the cause: Cloudflare rejects fetch `redirect: error`, accepting only follow/manual. Local Node/mock adapter tests had not exposed this runtime mismatch. Provider calls are being corrected to manual redirect handling with non-success rejection. No payment or appointment was created by that failed probe.
- Checkout successful-return navigation now carries a non-authoritative hint and polls backend verification while suppressing premature repayment. The hint never proves payment. Targeted provider/frontend checks passed 40/40 before deployment.

## 28 September integrated continuation

- Remote Google probe passed on `fd7304f8-bb16-43a3-ada1-c496269fd1a5`: refresh-based three-calendar read,30September10:00–11:00UK, correct fixed attendee, successful Meet, same event identity and URL on retry, canonical time verification and verified deletion. No further OAuth consent occurred.
- Staging frontend/backend enabled explicitly with Stripe test mode; production source switch remains disabled. Probe flag disabled after use. Latest ordinary deployment `60072bbe-53bd-4a82-8945-56312c25262f` includes worker redirect/runtime fixes, targeted late-refund canonical reconciliation and frontend truthful refund-none status.128/128 tests passed.
- First real browser journey£30 booking`6fb0bca9-5988-44ec-b7ee-da644753abb9`: Stripe sandbox paid3000GBP, exact Calendar event30September10:00–11:00UK, attendee and Meet verified, confirmation Gmail delivered27September22:49:54UTC. Duplicate actual signed Stripe event replayed twice200; no second event/payment. Fresh browser recovered successfully through delivered email capability.28September07:03:44UTC controlled cancellation requested; Calendar canceled and Stripe full3000refund succeeded, backend canceled/refund initiated, availability restored. Pending/canceled/refund emails delivered07:04:09–10UTC. Private links/tokens and address excluded from evidence files.
- Deployed concurrency tests on12–18October passed: same-slot singlewinner, identicalretry sameID, supported2ceiling, standard repair boundary, reserved solidarity not unlocking support, final1h accepted versus2h rejected,10hour cap.8unpaid holds naturally expired; all8 originalslots and all5prices at the previously capped slot returned available. No Checkout/email/event created by capacity harness. Sanitized evidence ignored under`.local/staging-capacity-evidence.json` and`.local/staging-capacity-expiry.json`.
- £50 browser journey `11376a3f-4f48-4501-90fc-a16fd8ce0cfa`: published decline card rejected in Checkout; canonical unpaid held, no event. Same Checkout retried using published pending-refund test card, paid 5000 pence GBP. Subsequent confirmation and refund evidence appears below.

## Integrated evidence checkpoint — 28 September, 07:25 UTC

This is a partial, ongoing acceptance checkpoint. Sources are the coordinator's browser/fault-test observations and sanitized provider readbacks in ignored `.local/integrated-booking-evidence.jsonl` through 07:25:58 UTC, plus `.local/solidarity-capacity-evidence.json`. It does not mark the candidate complete or pushed. The active fault-test deployment is temporary; the ordinary deployment cited above is a historical baseline, not a claim that fault controls have already been removed.

All five prices reached canonical backend `confirmed`, a paid GBP Stripe **sandbox** Checkout, and a confirmed Google event with matching attendee, description, internal correlation, duration and Meet creation. Readbacks contain no live payment:

| Price | Booking ID | Appointment, Europe/London | Confirmed readback, UTC | Latest verified outcome at this checkpoint |
| --- | --- | --- | --- | --- |
| £30 | `6fb0bca9-5988-44ec-b7ee-da644753abb9` | 30 September, 10:00–11:00 | 07:01:00 | Calendar cancelled; full 3000-pence refund succeeded |
| £50 | `11376a3f-4f48-4501-90fc-a16fd8ce0cfa` | 30 September, 10:00–11:00 | 07:08:34 | Refund first pending at Stripe, later full 5000-pence refund succeeded at 07:18:17 |
| £70 | `63f1e8f5-e935-4487-858c-08518fc59058` | 30 September, 10:00–11:00 | 07:13:32 | Calendar cancelled; full 7000-pence refund succeeded; notification recovery still pending |
| £100 | `3f60933d-de64-46e6-86ff-483e9f3425e9` | 30 September, 12:00–14:00 | 07:18:09 | Whole two-hour event cancelled; full 10000-pence refund succeeded at 07:25:58 |
| £140 | `d3939a4c-c06a-4c4a-b1fe-ef2aba54e449` | 1 October, 10:00–12:00 | 07:21:11 | Confirmed two-hour appointment; cancellation/refund not yet evidenced here |

The repeated 30 September 10:00 appointment time reflects sequential tests after earlier appointments were cancelled, not evidence of concurrent confirmed bookings. Backend refund wording remains `initiated` where shown even when Stripe's independent readback reports `succeeded`; provider success and customer wording are recorded separately.

### Integrated failure and recovery evidence

- **Lost Google create response:** the £70 test deliberately lost the Google POST response after provider success. At 07:12:31 the backend was `confirming` with retry pending while the correlated Google event already existed with Meet. By 07:13:32 the same event identity was canonically confirmed and retry pending cleared. This proves recovery from that injected response loss; it does not establish every possible network-failure path.
- **Under-24-hour route:** the coordinator's booking-scoped staging clock exercised the £70 short-notice route. The 07:18:33 readback was `review_requested`, Google remained confirmed and no Stripe refund existed. This was a controlled clock fixture, not a claim that real wall-clock notice was under 24 hours.
- **Cancellation followed by refund API failure:** at 07:23:23 the £70 event was cancelled but the backend remained `cancellation_pending`, refund `pending`, retry pending true, and Stripe had no refund. After recovery, Stripe reported the full refund succeeded at 07:24:18 and the backend was `canceled` / refund `initiated`.
- **Refund succeeded while email failed:** the £70 test retained retry pending through 07:25:56 under the coordinator's notification-failure fixture, despite the successful full refund. Notification delivery/recovery is not yet a pass at this checkpoint; the public record alone does not identify the pending job type.
- **Unpaid interrupted Checkout:** booking `abb00f5c-96b9-4f9f-b142-81a63138c694` was held with an open, unpaid £50 Checkout and no Calendar event at 07:24:14. Its terminal expiry/recovery has not yet been verified in this checkpoint.

### Confirmed solidarity and availability boundary

With the confirmed £70 one-hour and £140 two-hour appointments contributing three solidarity hours, the deployed API accepted three separate supported one-hour **holds**. A fourth supported request was unavailable with `supported_ceiling`, while standard remained available at the same conflict-free time. A second Saturday appointment was rejected with `weekend_one_appointment`.

An initial Friday probe was rejected by an existing Primary Calendar conflict for both supported and standard rates; the subsequent comparison used a conflict-free time. The three accepted supported holds were unpaid and scheduled to expire between 07:36:48 and 07:36:50 UTC. This proves the confirmed-solidarity unlock and boundary through actual availability/hold requests, not three additional paid supported appointments; expiry still needs readback.

### Refund retry safety and local checks

The current source adds administrator-only `retry_refund` resolution for an already terminal booking whose refund requires attention. Before a new refund generation, provider eligibility must verify the previous refund is definitively failed or cancelled and safe to retry. The prior refund identity/status and human reason are retained; the next generation has a distinct durable idempotency key. Unknown outcomes do not qualify. Normal uncertain retries retain their key; beyond the 23-hour safety window they require canonical refund reconciliation instead of blindly issuing another refund. This is source/local-test evidence, not proof that every new-refund recovery branch has passed deployed acceptance.

The coordinator reports the latest full local suite at **131/131 passing**. These local checks remain separate from the integrated observations above. Remaining work includes terminal cleanup/readback for outstanding test records, notification recovery, additional failure-path acceptance, removal of temporary fault controls, final frontend acceptance and final Git/PR reconciliation. No merge or public launch is authorized.
