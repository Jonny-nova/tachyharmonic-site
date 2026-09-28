# V1 integration evidence — 27 September 2026

Status: **implemented staging candidate; provider integration incomplete; not ready to launch**. This records observed facts, not acceptance or permission to publish. Authority is Jonny's attached launch brief and the explicit provider approvals in this task.

## Preserved baseline

Branch `rebuild/brand-system-v1`; PR [#10](https://github.com/Jonny-nova/tachyharmonic-site/pull/10) remains open/draft. Prior remote head `f44b8b9a9dbce12b965f633e97ed26d8cf2f919d`. Local baseline commits: `4ae8bfd` (approved decisions/history), `7a72ca0` (five-offer rules/gate), `211f6c0` (approved copy/preview). Nine exact approved passages, intentional line break and three example cards were preserved. No prior work was discarded.

GitHub Pages settings were read after Jonathan completed its one-time security check: source `main` / root, custom domain `tachyharmonic.ai`, HTTPS enforced. The candidate branch is separate. No merge or public website deployment occurred.

Verified implementation is saved locally in `1d17763` (backend/providers/staging tools) and `34c4626` (frontend/recovery/legal draft). These commits have not been pushed: the brief places candidate push after integrated acceptance, which remains incomplete. No PR readiness change was made.

## Implementation

One Cloudflare Worker and one SQLite Durable Object serialize all weeks. Private intake, booking state, webhook identities, audit entries and bounded retry jobs persist durably. The five server-priced offers share authoritative capacity rules. Unknown provider outcomes retain reservations while reconciliation runs. Canonical Google event checks and conditional cancellation prevent accepting wrong times or canceling a concurrently moved event. Meet must be ready before confirmation.

The frontend includes genuine API availability, holds, Stripe handoff, private fragment recovery, versioned early-performance consent and controlled cancellation. Only opaque booking capabilities/references use browser session storage. Name/email/note are excluded from that storage; notes are excluded from provider metadata, calendar content, routine mail and logs. No V2 AI feature was added.

Contract formation is recorded at first verified appointment confirmation, separately from payment. The statutory clock ends at London calendar day 14 after formation day. Early-performance wording includes preparation. Under-24-hour requests remain for human review; no automatic forfeiture is encoded. Full versioned contract terms are snapshotted privately at hold and included in confirmation emails; missing trader address blocks new booking/payment. Final legal disclosures remain subject to review.

## External state and changes

| Service | Observed/configured | Outstanding proof |
| --- | --- | --- |
| Cloudflare | Approved Wrangler access; staging Worker and SQLite DO deployed. Health returned 200 with booking disabled. Latest version `693a7019-0f6d-4e5c-af2b-51c01a413139` includes the disabled HTTPS staging preview with noindex. No production route. | Eight encrypted setup values installed; Google OAuth and Stripe server key pending. Actual remote booking persistence/E2E outstanding. |
| Stripe live | Charges/payouts enabled; card capability active; requirements clear; consulting profile. Explicitly authorized daily-to-manual payout change applied and API-read back. No balance transfer, bank change or real charge. | Final live human-assisted acceptance. Manual scheduling is not a guaranteed refund reserve. |
| Stripe fraud | Radar risk setting “Balance risk and revenue”; fraudulent-dispute and fraudulent non-card controls Active. Default block-list rule Enabled. Highest-risk/CVC/postal-code/elevated-review and blanket 3DS rules Disabled; adaptive 3DS and other optional controls Inactive. | No paid upgrade was selected; stronger optional controls are not a core-flow blocker. |
| Stripe sandbox | Existing account inspected; approved all-team sandbox CLI access granted. CLI selected sandbox test mode; balance read returned `livemode: false`. | Seven-event signed endpoint configured; backend key approval/storage and five actual payment/refund journeys remain. |
| Calendly | Google connection repaired by user; Primary/Work/Home conflicts selected. Four legacy types/history preserved. Two replacement types created inactive. | Legacy deactivation only after replacement E2E passes. |
| Google | Jonny approved Calendar + Meet instead of Calendly, dedicated project under Jonny billing/free quota only, API policy, client and offline host access. `tachyharmonic-booking` project/client created; Calendar API enabled. Connector lists Primary, Work, Home as owned calendars. | OAuth test-user Save does not persist in Cloud Console; host authorization remains incomplete. Testing tokens expire after seven days, so production OAuth status/renewal must be settled. No V1 event created yet. |
| Resend | Free-plan account signed in; `bookings.tachyharmonic.ai` verified, Ireland region, TLS Enforced, receiving Disabled. Approved domain-restricted sending-only key saved privately. One clearly labelled adapter integration email accepted HTTP 200; Resend dashboard reports delivered. Reply-to verified as Jonathan’s business mailbox. | Actual delivery/alignment evidence and booking lifecycle messages. |
| DNS / human mail | Exactly three approved new sender records added, TTL 600; original ten records preserved. Resend verification passed. Existing Porkbun mailbox acceptance retained; Android background alerts deferred. | Do not treat sender DNS verification as mailbox-delivery proof. |
| Frontend | Local candidate; public booking config disabled. | Enabled five-offer flow, final responsive/keyboard checks and human acceptance. |

The initial Calendly approach was blocked by actual account behaviour: inactive event types reject availability queries, and secret types remain bookable via direct links. Jonny explicitly replied “Use Google Calendar + Meet”. This supersedes the unresolved Calendly architecture question; no public Calendar scheduling page exists in the replacement route. New inactive Calendly IDs are `8d49f9f6-6b0d-4f00-a21d-3c2e84b98030` and `71300137-bf0d-437a-87ac-15f7382694e2`.

Resend's single test acceptance: message `01a0e479-cabe-7709-9a15-c64b0f27d10c`, 27 September 2026 20:06:21 UTC. Recipient Jonathan's business mailbox, subject `[INTEGRATION TEST] Tachyharmonic transactional email`. The sample explicitly states it is not a real booking or payment. Resend subsequently reported sent and delivered at 21:06 BST. This confirms mail-server delivery, not inbox placement or receiver authentication-header checks.

## Verification and limits

- Latest complete local checkpoint: **109/109 automated tests passed**, including OAuth4 and real local workerd/SQLite3. Resource/anchor/CNAME and whitespace checks passed. Further edits require fresh targeted/integrated checks.
- Actual workerd tests cover restart persistence and concurrent capacity allocation. They do not prove remote Cloudflare or configured providers.
- Independent review fixed late/duplicate payments, expired holds, malformed provider evidence, boundary times, stale messages, lost Checkout response recovery, statutory/DST clocks, canonical appointment mismatch, repeated operator alerts, human resolution, conditional cancellation, resumed cancellation generations, midnight hold replay, JSON validation and browser history/status races.
- Desktop rendering and a 390 CSS-pixel form were inspected with no observed horizontal overflow. Final enabled four-size/keyboard acceptance remains outstanding.
- A later viewport-control attempt did not change the observed browser width; it is not counted as a tablet/laptop pass. The override was reset. The HTTPS staging page was opened and its candidate banner and approved copy verified in the browser.
- Remote smoke checks: preview/health/config returned200 with disabled switches, private credential path404, disabled availability503, unsigned webhook rejected. No complete real Stripe test payment to canonical V1 Meet appointment to delivered confirmation to cancellation/refund journey has passed yet. Do not report synthetic cases as provider passes.

## Remaining checkpoints

1. Complete calendar host OAuth and verify refresh/access; fix Google test-user save/publishing readiness.
2. Store/install authorized sandbox credentials, configure signed webhooks, redeploy and test all five offers and failure paths.
3. Verify transactional arrival, authentication alignment, reply routing and no tracking of private management links.
4. Finish enabled responsive/keyboard/navigation acceptance and deactivate superseded Calendly booking paths only after replacement proof.
5. Jonathan supplies/approves geographic trader address and final retention/transfer/legal disclosures. The implementation now preserves applicable terms in durable confirmation; final wording and address still need approval.
6. Once integrated acceptance passes: final suite, secret review, logical commits, candidate push and PR update. No merge or public launch without Jonathan's separate decision.

No historical appointment was deleted. No bank details, mailbox password, live charge or paid upgrade were changed/performed.
